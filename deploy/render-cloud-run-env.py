"""Render deploy/cloud-run-env.yaml into a gcloud --update-env-vars value.

Uses only the Python 3 standard library so it works identically in Cloud Build
(gcr.io/google.com/cloudsdktool/cloud-sdk:slim) and local Windows/macOS/Linux
deployments without extra dependencies.

IMPORTANT: Always pass the rendered value to `--update-env-vars`, never
`--env-vars-file`, so existing Cloud Run secrets and runtime variables are
preserved.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DEFAULT_ENV_FILE = Path(__file__).resolve().with_name('cloud-run-env.yaml')
_KEY_RE = re.compile(r'^[A-Z][A-Z0-9_]*$')
_CUSTOM_DELIMITERS = ('@', '|', ';', '~', ':', '@@', '||', ';;', '~~')


def _parse_scalar(raw: str, line_no: int) -> str:
    value = raw.strip()
    if not value:
        raise ValueError(f'Line {line_no}: missing value (use "" for an empty string)')

    if value.startswith('"'):
        decoder = json.JSONDecoder()
        try:
            parsed, end = decoder.raw_decode(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f'Line {line_no}: invalid double-quoted value: {exc}') from exc
        if not isinstance(parsed, str):
            raise ValueError(f'Line {line_no}: value must be a string')
        trailing = value[end:].strip()
        if trailing and not trailing.startswith('#'):
            raise ValueError(f'Line {line_no}: unexpected trailing content after closing quote')
        return parsed

    if value.startswith("'"):
        idx = 1
        chars: list[str] = []
        closed = False
        while idx < len(value):
            ch = value[idx]
            if ch == "'":
                if idx + 1 < len(value) and value[idx + 1] == "'":
                    chars.append("'")
                    idx += 2
                    continue
                closed = True
                idx += 1
                break
            chars.append(ch)
            idx += 1
        if not closed:
            raise ValueError(f'Line {line_no}: unterminated single-quoted value')
        trailing = value[idx:].strip()
        if trailing and not trailing.startswith('#'):
            raise ValueError(f'Line {line_no}: unexpected trailing content after closing quote')
        return ''.join(chars)

    if value[0] in '[{|>&*!':
        raise ValueError(f'Line {line_no}: unsupported YAML construct; use flat KEY: "VALUE" pairs')

    # Strip inline comment on unquoted scalars only when preceded by whitespace.
    comment_match = re.search(r'\s+#', value)
    if comment_match:
        value = value[: comment_match.start()].rstrip()
    return value


def parse_env_yaml(text: str) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    seen: set[str] = set()

    for line_no, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        if raw_line[0].isspace():
            raise ValueError(f'Line {line_no}: nested/indented YAML is not supported')
        key, sep, raw_value = raw_line.partition(':')
        if not sep:
            raise ValueError(f'Line {line_no}: expected KEY: VALUE')
        key = key.strip()
        if not _KEY_RE.match(key):
            raise ValueError(f'Line {line_no}: invalid environment variable name {key!r}')
        if key in seen:
            raise ValueError(f'Line {line_no}: duplicate environment variable {key!r}')
        value = _parse_scalar(raw_value, line_no)
        if '\n' in value or '\r' in value:
            raise ValueError(f'Line {line_no}: multiline values are not supported for {key!r}')
        if '"' in value:
            raise ValueError(
                f'Line {line_no}: double quotes (") are not allowed in value for {key!r} '
                '(Windows cmd.exe cannot pass literal double quotes reliably through gcloud)'
            )
        seen.add(key)
        entries.append((key, value))

    if not entries:
        raise ValueError('Environment file contains no entries')
    return entries


def render_update_env_vars(entries: list[tuple[str, str]]) -> str:
    if not entries:
        raise ValueError('At least one environment variable is required')

    for key, value in entries:
        if '\n' in value or '\r' in value:
            raise ValueError(f'Multiline values are not supported for {key!r}')
        if '"' in value:
            raise ValueError(
                f'Double quotes (") are not allowed in value for {key!r} '
                '(Windows cmd.exe cannot pass literal double quotes reliably through gcloud)'
            )

    pairs = [f'{key}={value}' for key, value in entries]
    needs_custom_delimiter = any(',' in value for _, value in entries) or pairs[0].startswith('^')
    if not needs_custom_delimiter:
        return ','.join(pairs)

    for delimiter in _CUSTOM_DELIMITERS:
        if all(delimiter not in pair for pair in pairs):
            return f'^{delimiter}^' + delimiter.join(pairs)

    raise ValueError('Unable to select a safe gcloud --update-env-vars delimiter')


def load_and_render(path: Path = DEFAULT_ENV_FILE) -> str:
    entries = parse_env_yaml(path.read_text(encoding='utf-8'))
    return render_update_env_vars(entries)


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) > 1:
        print('Usage: render-cloud-run-env.py [path/to/cloud-run-env.yaml]', file=sys.stderr)
        return 2
    env_file = Path(args[0]) if args else DEFAULT_ENV_FILE
    try:
        rendered = load_and_render(env_file)
    except (OSError, ValueError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1
    print(rendered)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
