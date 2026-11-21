import json
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Annotated, Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine.url import make_url
from sqlalchemy.exc import ArgumentError

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / 'backend'
_LOOPBACK_DB_HOSTS = frozenset({'localhost', '127.0.0.1', '::1'})
_LOOPBACK_DB_ADDRS = frozenset({'127.0.0.1', '::1'})


def _parse_libpq_host_values(raw_values: list[str]) -> list[str] | None:
    hosts: list[str] = []
    for raw in raw_values:
        text = str(raw or '')
        parts = text.split(',')
        if any(not part.strip() for part in parts):
            return None
        for part in parts:
            hosts.append(part.strip().strip('[]').lower())
    return hosts or None


def is_local_database_url(
    database_url: str,
    *,
    environ: Mapping[str, str] | None = None,
) -> bool:
    """Return True only when the effective DB destination is SQLite or loopback.

    In addition to the URL authority host, checks libpq query parameters
    (``host``, ``hostaddr``, ``service``, ``servicefile``) and environment
    overrides (``PGHOST``, ``PGHOSTADDR``, ``PGSERVICE``, ``PGSERVICEFILE``)
    so a local-looking URL cannot be silently redirected to a remote server.
    """
    raw = str(database_url or '').strip()
    if not raw:
        return False
    try:
        parsed = make_url(raw)
    except (ArgumentError, ValueError):
        return False

    backend = (parsed.drivername or '').split('+', 1)[0].strip().lower()
    if backend == 'sqlite':
        return True

    env = os.environ if environ is None else environ
    for service_env in ('PGSERVICE', 'PGSERVICEFILE'):
        if str(env.get(service_env) or '').strip():
            return False

    raw_pghost = env.get('PGHOST')
    if raw_pghost is not None and str(raw_pghost).strip():
        env_hosts = _parse_libpq_host_values([str(raw_pghost)])
        if not env_hosts or not all(host in _LOOPBACK_DB_HOSTS for host in env_hosts):
            return False

    raw_pghostaddr = env.get('PGHOSTADDR')
    if raw_pghostaddr is not None and str(raw_pghostaddr).strip():
        env_addrs = _parse_libpq_host_values([str(raw_pghostaddr)])
        if not env_addrs or not all(addr in _LOOPBACK_DB_ADDRS for addr in env_addrs):
            return False

    lowered_query: dict[str, list[str]] = {}
    for key, value in parsed.query.items():
        lower_key = str(key).strip().lower()
        entries = list(value) if isinstance(value, (list, tuple)) else [value]
        lowered_query.setdefault(lower_key, []).extend(str(item) for item in entries)

    if any(
        str(val).strip()
        for key in ('service', 'servicefile')
        for val in lowered_query.get(key, [])
    ):
        return False

    has_explicit_target = False

    if parsed.host is not None and str(parsed.host).strip():
        has_explicit_target = True
        authority_host = str(parsed.host).strip().strip('[]').lower()
        if authority_host not in _LOOPBACK_DB_HOSTS:
            return False

    if 'host' in lowered_query:
        has_explicit_target = True
        query_hosts = _parse_libpq_host_values(lowered_query['host'])
        if not query_hosts or not all(host in _LOOPBACK_DB_HOSTS for host in query_hosts):
            return False

    if 'hostaddr' in lowered_query:
        has_explicit_target = True
        query_addrs = _parse_libpq_host_values(lowered_query['hostaddr'])
        if not query_addrs or not all(addr in _LOOPBACK_DB_ADDRS for addr in query_addrs):
            return False

    return has_explicit_target


class Settings(BaseSettings):
    # Support running from repo root, backend/, or script subdirectories while still finding env files.
    model_config = SettingsConfigDict(
        env_file=(
            '.env',
            '../.env',
            'backend/.env',
            str(REPO_ROOT / '.env'),
            str(BACKEND_ROOT / '.env'),
        ),
        env_file_encoding='utf-8-sig',
        extra='ignore',
    )

    app_env: str = 'dev'
    # Structured JSON stdout logs for Cloud Logging / Error Reporting.
    # None (default) enables JSON logs when APP_ENV=production and keeps dev logs readable.
    structured_json_logs: bool | None = None
    readyz_db_timeout_seconds: float = Field(default=2.0, gt=0)
    worker_heartbeat_stale_seconds: int = Field(default=60, ge=1)
    worker_pending_task_alert_threshold_seconds: int = Field(default=600, ge=1)
    app_secret: str = 'change-me'
    # Minimum required length for app_secret in non-dev environments (32 bytes → 64 hex chars).
    _APP_SECRET_MIN_LENGTH: int = 32
    database_url: str = 'postgresql+psycopg2://postgres:postgres@localhost:5432/aipingtubackend'
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle_seconds: int = 3600

    object_bucket: str = 'aipingtuphotos'
    object_base_url: str = 'https://object.example.com'
    object_s3_endpoint: str = ''
    object_access_key_id: str = ''
    object_secret_access_key: str = ''
    object_region: str = 'auto'
    max_upload_bytes: int = 20 * 1024 * 1024
    # API bodies are small JSON; photos go straight to object storage. 0 disables.
    max_request_body_bytes: int = 1024 * 1024
    upload_presign_rate_limit_per_minute: int = 30
    analytics_event_rate_limit_per_minute: int = 120
    auth_exchange_rate_limit_per_minute: int = 60
    blog_view_rate_limit_per_minute: int = 30
    # Fraction of non-dropped CSP reports logged at INFO; JS errors remain unsampled.
    client_error_csp_sample_rate: float = Field(default=0.05, ge=0.0, le=1.0)

    rate_limit_per_minute: int = 10
    ip_rate_limit_per_minute: int = 30
    # Per guest and route template.
    guest_api_rate_limit_per_minute: int = 60
    # Per guest across all routes; 0 disables.
    guest_api_total_rate_limit_per_minute: int = 240
    guest_creation_rate_limit_per_minute: int = 10
    guest_review_rate_limit_per_minute: int = 4
    guest_review_limit_per_day: int = 1
    guest_review_limit_per_month: int = 30
    # Network-wide guest caps ignore client-supplied device ids, so rotating
    # X-Device-Id or dropping cookies cannot mint fresh guest quota. 0 disables.
    guest_review_network_limit_per_day: int = 12
    guest_review_network_limit_per_month: int = 120
    guest_creation_network_rate_limit_per_minute: int = 60
    free_review_limit_per_day: int = 5
    free_review_limit_per_month: int = 60
    free_pro_review_limit_per_month: int = 10
    # Fair use slows new admissions after the threshold, without a monthly cap.
    pro_review_soft_limit_per_month: int = Field(default=150, ge=1)
    pro_review_soft_limit_rate_per_minute: int = Field(default=2, ge=1)
    practice_enabled: bool = False

    oauth_jwt_secret: str = 'change-me-jwt-secret'
    oauth_jwt_issuer: str = ''
    oauth_jwt_audience: str = ''
    trust_x_forwarded_for: bool = False
    # Number of trusted proxies that append to X-Forwarded-For. Cloud Run
    # direct ingress appends one entry; an external load balancer adds one more.
    trusted_proxy_hops: int = 1
    clerk_secret_key: str = ''
    clerk_webhook_signing_secret: str = ''
    clerk_api_url: str = 'https://api.clerk.com'
    clerk_api_version: str = '2025-11-10'
    lemonsqueezy_api_key: str = ''
    lemonsqueezy_store_id: str = ''
    lemonsqueezy_pro_variant_id: str = ''
    lemonsqueezy_zh_pro_variant_id: str = ''
    lemonsqueezy_pro_checkout_url: str = ''
    lemonsqueezy_zh_pro_checkout_url: str = ''
    lemonsqueezy_pro_one_time_variant_id: str = ''
    lemonsqueezy_pro_one_time_checkout_url: str = ''
    lemonsqueezy_image_credit_pack_checkout_url: str = ''
    lemonsqueezy_image_credit_pack_variant_id: str = ''
    lemonsqueezy_webhook_signing_secret: str = ''
    lemonsqueezy_webhook_url: str = ''
    lemonsqueezy_checkout_success_url: str = ''
    lemonsqueezy_checkout_test_mode: bool = True
    lemonsqueezy_webhook_test_mode: bool = True
    # Frontend origin used for post-login redirect (e.g. http://localhost:3000)
    frontend_origin: str = 'http://localhost:3000'
    # SameSite policy for the guest-token cookie.
    # Use 'lax' (default) for same-domain deployments.
    # Set to 'none' only when frontend and backend are on different domains AND you've
    # added explicit CSRF protections; requires secure=True (enforced automatically).
    cookie_samesite: str = 'lax'
    # NoDecode hands the raw env/.env string to parse_backend_cors_origins, so
    # comma-separated, single-origin and empty values work as well as JSON arrays.
    backend_cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ['http://localhost:3000', 'http://127.0.0.1:3000']
    )
    backend_cors_origin_regex: str = ''

    ai_api_base_url: str = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    ai_api_key: str = ''
    ai_model_name: str = 'Qwen/Qwen3-VL-8B-Instruct'
    flash_model_name: str = ''
    pro_model_name: str = ''
    ai_timeout_seconds: int = 60
    pro_ai_timeout_seconds: int = 180
    review_worker_concurrency: int = 2
    review_worker_idle_sleep_ms: int = 200
    run_embedded_worker: bool = True
    review_worker_name: str = 'embedded-worker'
    review_retry_base_delay_seconds: int = 10
    review_retry_max_delay_seconds: int = 300
    review_task_stale_timeout_seconds: int = 180
    ws_task_poll_interval_ms: int = 1000
    guest_user_cleanup_enabled: bool = True
    guest_user_cleanup_interval_seconds: int = 3600
    guest_user_stale_days: int = 7
    guest_user_cleanup_batch_size: int = 200
    # Days of api_request_logs to keep; 0 disables the periodic cleanup.
    api_request_log_retention_days: int = 30
    api_request_log_cleanup_batch_size: int = 1000
    notifications_worker_enabled: bool = True
    notifications_worker_interval_seconds: int = 60
    notification_sweep_interval_seconds: int = 60
    notifications_read_enabled: bool = False
    notifications_event_capture_enabled: bool = False
    announcement_publish_enabled: bool = False
    cloud_tasks_enabled: bool = False
    cloud_tasks_project_id: str = ''
    cloud_tasks_location: str = ''
    cloud_tasks_queue: str = ''
    cloud_tasks_target_url: str = ''
    cloud_tasks_generation_target_url: str = ''
    cloud_tasks_secret: str = ''
    cloud_tasks_service_account_email: str = ''
    cloud_tasks_oidc_audience: str = ''
    cloud_tasks_dispatch_deadline_seconds: int = 1800

    image_audit_enabled: bool = True
    image_audit_reject_threshold: float = 0.78

    openai_api_key: str = ''
    openai_api_base_url: str = 'https://api.openai.com/v1'
    openai_fallback_api_key: str = Field(default='', repr=False)
    openai_fallback_primary_attempts: int = Field(default=3, ge=1, le=5)
    openai_score_model: str = 'gpt-6-sol'
    openai_score_reasoning_effort: str = 'low'
    openai_score_timeout_seconds: int = 180
    openai_review_model: str = 'gpt-6-sol'
    openai_review_reasoning_effort: str = 'low'
    openai_review_timeout_seconds: int = 180
    openai_pro_model: str = 'gpt-6.1-sol'
    openai_pro_reasoning_effort: str = 'high'
    review_pricing_overrides: dict[str, Any] = Field(default_factory=dict)
    retake_analysis_api_url: str = ''
    retake_analysis_model: str = 'gpt-6.1-sol'
    retake_analysis_reasoning_effort: str = 'high'
    retake_analysis_timeout_seconds: int = 180
    image_generation_api_key: str = ''
    image_generation_api_url: str = Field(
        default='https://api.openai.com/v1/images/generations',
    )
    image_generation_api_mode: str = 'auto'
    image_generation_model: str = 'gpt-image-2'
    image_generation_model_snapshot: str = 'gpt-image-2-2026-04-21'
    image_generation_default_quality: str = 'low'
    image_generation_pro_default_quality: str = 'medium'
    image_generation_max_outputs_per_request: int = 1
    image_generation_timeout_seconds: int = 180
    image_generation_task_stale_timeout_seconds: int = 600
    image_generation_shutdown_timeout_seconds: int = 30
    image_generation_download_max_bytes: int = 25 * 1024 * 1024
    image_generation_worker_concurrency: int = 1
    image_generation_daily_ipm_limit: int = 5
    image_generation_enable_streaming: bool = False
    image_generation_free_monthly_credits: int = 3
    image_generation_pro_monthly_credits: int = 199
    # Test-only E2E fake AI / image generation switch. Forbidden when APP_ENV=production.
    e2e_fake_ai_enabled: bool = False

    @property
    def use_structured_json_logs(self) -> bool:
        if self.structured_json_logs is not None:
            return self.structured_json_logs
        return self.app_env.strip().lower() == 'production'

    @field_validator('structured_json_logs', mode='before')
    @classmethod
    def parse_optional_bool_setting(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    def _local_dev_only(self) -> bool:
        local_origins = {'localhost', '127.0.0.1', '::1'}
        origin = self.frontend_origin.strip().lower()
        database_url = self.database_url.strip().lower()
        cors_origins = [origin.strip().lower() for origin in self.backend_cors_origins]
        return (
            any(host in origin for host in local_origins)
            and all(any(host in item for host in local_origins) for item in cors_origins)
            and any(host in database_url for host in local_origins)
        )

    @field_validator('backend_cors_origins', mode='before')
    @classmethod
    def parse_backend_cors_origins(cls, value: Any) -> list[str]:
        if value is None or value == '':
            return []
        if isinstance(value, list):
            return [str(item).strip().rstrip('/') for item in value if str(item).strip()]
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith('['):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise ValueError('BACKEND_CORS_ORIGINS must be valid JSON array or comma-separated string') from exc
                if not isinstance(parsed, list):
                    raise ValueError('BACKEND_CORS_ORIGINS JSON value must be an array')
                return [str(item).strip().rstrip('/') for item in parsed if str(item).strip()]
            return [item.strip().rstrip('/') for item in raw.split(',') if item.strip()]
        raise ValueError('BACKEND_CORS_ORIGINS must be a list or string')

    @field_validator('review_pricing_overrides', mode='before')
    @classmethod
    def parse_review_pricing_overrides_setting(cls, value: Any) -> dict[str, Any]:
        from app.services.review_pricing import parse_review_pricing_overrides

        return parse_review_pricing_overrides(value)

    @field_validator('frontend_origin', mode='before')
    @classmethod
    def normalize_frontend_origin(cls, value: Any) -> str:
        if not isinstance(value, str):
            return 'http://localhost:3000'
        return value.strip().rstrip('/')

    @field_validator('backend_cors_origin_regex', mode='before')
    @classmethod
    def normalize_backend_cors_origin_regex(cls, value: Any) -> str:
        if not isinstance(value, str):
            return ''
        return value.strip()

    @field_validator(
        'clerk_secret_key',
        'clerk_webhook_signing_secret',
        'clerk_api_version',
        'lemonsqueezy_api_key',
        'lemonsqueezy_store_id',
        'lemonsqueezy_pro_variant_id',
        'lemonsqueezy_zh_pro_variant_id',
        'lemonsqueezy_pro_checkout_url',
        'lemonsqueezy_zh_pro_checkout_url',
        'lemonsqueezy_pro_one_time_variant_id',
        'lemonsqueezy_pro_one_time_checkout_url',
        'lemonsqueezy_image_credit_pack_checkout_url',
        'lemonsqueezy_image_credit_pack_variant_id',
        'lemonsqueezy_webhook_signing_secret',
        'openai_api_key',
        'openai_fallback_api_key',
        'openai_score_reasoning_effort',
        'openai_review_reasoning_effort',
        'openai_pro_reasoning_effort',
        'retake_analysis_reasoning_effort',
        'image_generation_api_key',
        'image_generation_model_snapshot',
        'image_generation_default_quality',
        'image_generation_pro_default_quality',
        'image_generation_api_mode',
        mode='before',
    )
    @classmethod
    def normalize_plain_string_settings(cls, value: Any) -> str:
        if not isinstance(value, str):
            return ''
        return value.strip()

    @field_validator(
        'openai_score_reasoning_effort',
        'openai_review_reasoning_effort',
        'openai_pro_reasoning_effort',
        'retake_analysis_reasoning_effort',
    )
    @classmethod
    def validate_openai_reasoning_effort(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'}
        if normalized not in allowed:
            raise ValueError(f'OpenAI reasoning effort must be one of: {", ".join(sorted(allowed))}')
        return normalized

    @field_validator(
        'cloud_tasks_target_url',
        'cloud_tasks_generation_target_url',
        'cloud_tasks_service_account_email',
        'cloud_tasks_oidc_audience',
        'clerk_api_url',
        'lemonsqueezy_pro_checkout_url',
        'lemonsqueezy_zh_pro_checkout_url',
        'lemonsqueezy_pro_one_time_checkout_url',
        'lemonsqueezy_webhook_url',
        'lemonsqueezy_checkout_success_url',
        'openai_api_base_url',
        'openai_review_model',
        'retake_analysis_api_url',
        'retake_analysis_model',
        'image_generation_api_url',
        'image_generation_model',
        mode='before',
    )
    @classmethod
    def normalize_string_settings(cls, value: Any) -> str:
        if not isinstance(value, str):
            return ''
        return value.strip().rstrip('/')

    @model_validator(mode='after')
    def validate_oauth_secret(self) -> 'Settings':
        normalized_env = self.app_env.strip().lower()
        is_dev = normalized_env == 'dev'

        if self.e2e_fake_ai_enabled:
            if normalized_env in {'production', 'prod'}:
                raise ValueError('E2E_FAKE_AI_ENABLED cannot be enabled when APP_ENV=production')
            if not is_local_database_url(self.database_url):
                raise ValueError(
                    'E2E_FAKE_AI_ENABLED requires DATABASE_URL to use SQLite or a loopback host '
                    '(localhost, 127.0.0.1, ::1)'
                )

        # Validate app_secret strength in non-dev environments.
        _insecure_app_secrets = {'', 'change-me', 'picspeakt123'}
        insecure_app_secret = self.app_secret.strip() in _insecure_app_secrets or len(self.app_secret.strip()) < 32
        if is_dev and insecure_app_secret and not self._local_dev_only():
            raise ValueError(
                'APP_ENV=dev with default APP_SECRET is only allowed for localhost-only development settings. '
                'Set APP_ENV=production and strong secrets for deployed environments.'
            )
        if not is_dev:
            if insecure_app_secret:
                raise ValueError(
                    'APP_SECRET must be set to a cryptographically random value of at least 32 characters outside dev mode. '
                    'Generate one with: python3 -c "import secrets; print(secrets.token_hex(32))"'
                )

        # Validate oauth_jwt_secret in non-dev environments.
        insecure_defaults = {'', 'change-me-jwt-secret'}
        insecure_oauth_secret = self.oauth_jwt_secret.strip() in insecure_defaults
        if is_dev and insecure_oauth_secret and not self._local_dev_only():
            raise ValueError(
                'APP_ENV=dev with default OAUTH_JWT_SECRET is only allowed for localhost-only development settings. '
                'Set a strong OAUTH_JWT_SECRET for deployed environments.'
            )
        if not is_dev and insecure_oauth_secret:
            raise ValueError('OAUTH_JWT_SECRET must be set to a non-default secret outside dev mode')
        if self.cloud_tasks_enabled:
            required_fields = {
                'CLOUD_TASKS_PROJECT_ID': self.cloud_tasks_project_id,
                'CLOUD_TASKS_LOCATION': self.cloud_tasks_location,
                'CLOUD_TASKS_QUEUE': self.cloud_tasks_queue,
                'CLOUD_TASKS_TARGET_URL': self.cloud_tasks_target_url,
                'CLOUD_TASKS_SECRET': self.cloud_tasks_secret,
            }
            missing = [key for key, value in required_fields.items() if not str(value).strip()]
            if missing:
                raise ValueError(f'Cloud Tasks is enabled but missing required settings: {", ".join(missing)}')
        return self


settings = Settings()
