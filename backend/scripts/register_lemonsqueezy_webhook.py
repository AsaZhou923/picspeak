from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.lemonsqueezy import (  # noqa: E402
    LemonSqueezyAPIError,
    LemonSqueezyConfigurationError,
    configured_webhook_url,
    create_webhook,
    webhook_signing_secret,
)

DEFAULT_EVENTS = [
    'order_created',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_payment_success',
]


def main() -> int:
    parser = argparse.ArgumentParser(description='Register the PicSpeak Lemon Squeezy webhook.')
    parser.add_argument('--url', default=None, help='Webhook target URL. Defaults to LEMONSQUEEZY_WEBHOOK_URL.')
    parser.add_argument(
        '--event',
        action='append',
        dest='events',
        help='Webhook event to subscribe to. Repeat to override the defaults.',
    )
    parser.add_argument('--secret', default=None, help='Webhook signing secret. Defaults to LEMONSQUEEZY_WEBHOOK_SIGNING_SECRET.')
    parser.add_argument('--live-mode', action='store_true', help='Create the webhook in live mode instead of test mode.')
    args = parser.parse_args()

    events = args.events or DEFAULT_EVENTS
    url = args.url or configured_webhook_url()
    secret = args.secret or webhook_signing_secret()

    try:
        response = create_webhook(
            url=url,
            events=events,
            secret=secret,
            test_mode=not args.live_mode,
        )
    except (LemonSqueezyConfigurationError, LemonSqueezyAPIError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
