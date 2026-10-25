"""Show or apply the PicSpeak object-storage lifecycle rules.

Dry-run by default: prints the current and proposed rules. --execute writes the
merged configuration and requires PICSPEAK_R2_LIFECYCLE_EXECUTE=1.

Only short-lived prefixes get an expiration. Originals (user_*) and generated
outputs follow scripts/purge_expired_objects.py, because their retention depends on
plan, public channels and running tasks, which a prefix rule cannot see. Rules
owned by others (such as Cloudflare's default multipart abort rule) are kept.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402
from app.services.object_storage import get_object_storage_client  # noqa: E402

EXECUTE_ENV_FLAG = 'PICSPEAK_R2_LIFECYCLE_EXECUTE'

# Reference inputs are only needed while a generation task runs or is retried
# (minutes); seven days leaves room for retries and incident review.
MANAGED_RULES = (
    {
        'ID': 'picspeak-generation-reference-inputs',
        'Status': 'Enabled',
        'Filter': {'Prefix': 'generated/reference-inputs/'},
        'Expiration': {'Days': 7},
    },
)


def current_rules(storage, bucket: str) -> list[dict]:
    try:
        return list(storage.get_bucket_lifecycle_configuration(Bucket=bucket).get('Rules', []))
    except Exception as exc:  # noqa: BLE001
        code = str(getattr(exc, 'response', {}).get('Error', {}).get('Code', ''))
        if code in {'NoSuchLifecycleConfiguration', '404'}:
            return []
        raise


def merged_rules(existing: list[dict]) -> list[dict]:
    managed_ids = {rule['ID'] for rule in MANAGED_RULES}
    return [rule for rule in existing if rule.get('ID') not in managed_ids] + [dict(rule) for rule in MANAGED_RULES]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--bucket', default=settings.object_bucket)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args(argv)
    if args.execute and os.getenv(EXECUTE_ENV_FLAG) != '1':
        print(f'--execute requires {EXECUTE_ENV_FLAG}=1', file=sys.stderr)
        return 2

    storage = get_object_storage_client()
    existing = current_rules(storage, args.bucket)
    proposed = merged_rules(existing)
    report = {'bucket': args.bucket, 'mode': 'execute' if args.execute else 'dry-run', 'current': existing, 'proposed': proposed}
    if args.execute:
        storage.put_bucket_lifecycle_configuration(Bucket=args.bucket, LifecycleConfiguration={'Rules': proposed})
        report['applied'] = current_rules(storage, args.bucket)
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
