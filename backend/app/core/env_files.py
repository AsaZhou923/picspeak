import os
from collections.abc import Mapping

DISABLE_DOTENV_ENV = 'PICSPEAK_DISABLE_DOTENV'


def dotenv_disabled(environ: Mapping[str, str] | None = None) -> bool:
    """True when ``PICSPEAK_DISABLE_DOTENV`` asks settings to ignore every dotenv file.

    The E2E smoke runner sets it so a developer's ``backend/.env`` (or repo-root
    ``.env``) cannot change the behaviour of an isolated run.
    """
    env = os.environ if environ is None else environ
    return str(env.get(DISABLE_DOTENV_ENV) or '').strip().lower() in {'1', 'true', 'yes'}


def settings_env_files(
    paths: tuple[str, ...],
    environ: Mapping[str, str] | None = None,
) -> tuple[str, ...] | None:
    return None if dotenv_disabled(environ) else paths
