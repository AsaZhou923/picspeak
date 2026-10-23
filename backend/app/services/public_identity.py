"""Names shown for a user on public surfaces (Gallery, scoreboard, public profiles)."""
from __future__ import annotations

import hashlib
import re

from app.db.models import User

USERNAME_SANITIZE_RE = re.compile(r'[^a-z0-9_]+')
USERNAME_MAX_LENGTH = 40
LEGACY_GOOGLE_USERNAME_PREFIX = 'google_'


def normalize_username_seed(raw: str) -> str:
    normalized = USERNAME_SANITIZE_RE.sub('_', raw.strip().lower()).strip('_')
    return re.sub(r'_+', '_', normalized)[:USERNAME_MAX_LENGTH]


def username_derived_from_email(username: str | None, email: str | None) -> bool:
    """Whether an account username was generated from the email local part.

    Older sign-in paths used the email local part as a fallback username,
    optionally with a numeric uniqueness suffix. Legacy Google accounts always
    used ``google_<local part>``.
    """
    name = (username or '').strip().lower()
    if not name:
        return False
    if name.startswith(LEGACY_GOOGLE_USERNAME_PREFIX):
        return True
    seed = normalize_username_seed((email or '').split('@', 1)[0])
    if not seed:
        return False
    if name == seed:
        return True
    base, separator, suffix = name.rpartition('_')
    if not separator or not base or not suffix.isdigit():
        return False
    # Unique suffixes trim the seed to keep the username within the length limit.
    return seed.startswith(base) and len(base) >= min(len(seed), USERNAME_MAX_LENGTH - len(suffix) - 1)


def public_display_name(user: User) -> str:
    username = (user.username or '').strip()
    if username and not username_derived_from_email(username, user.email):
        return username
    digest = hashlib.sha256(f'public-name:{user.public_id}'.encode('utf-8')).hexdigest()[:8]
    return f'user_{digest}'
