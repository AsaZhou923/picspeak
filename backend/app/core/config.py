import json
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Support running from repo root or backend/ while still finding the backend env file.
    model_config = SettingsConfigDict(
        env_file=('.env', '../.env', 'backend/.env'),
        env_file_encoding='utf-8-sig',
        extra='ignore',
    )

    app_env: str = 'dev'
    app_secret: str = 'change-me'
    database_url: str = 'postgresql+psycopg2://postgres:postgres@localhost:5432/aipingtubackend'

    object_bucket: str = 'aipingtuphotos'
    object_base_url: str = 'https://object.example.com'
    object_s3_endpoint: str = ''
    object_access_key_id: str = ''
    object_secret_access_key: str = ''
    object_region: str = 'auto'
    max_upload_bytes: int = 20 * 1024 * 1024

    rate_limit_per_minute: int = 10
    ip_rate_limit_per_minute: int = 30
    guest_api_rate_limit_per_minute: int = 60
    guest_review_rate_limit_per_minute: int = 4
    guest_review_limit_per_day: int = 3
    guest_review_limit_per_month: int = 12
    default_daily_quota: int = 6

    oauth_jwt_secret: str = 'change-me-jwt-secret'
    oauth_jwt_issuer: str = ''
    oauth_jwt_audience: str = ''
    trust_x_forwarded_for: bool = False
    google_oauth_client_id: str = ''
    google_oauth_client_secret: str = ''
    google_oauth_redirect_uri: str = ''
    # Frontend origin used for post-login redirect (e.g. http://localhost:3000)
    frontend_origin: str = 'http://localhost:3000'
    backend_cors_origins: list[str] = Field(
        default_factory=lambda: ['http://localhost:3000', 'http://127.0.0.1:3000']
    )
    backend_cors_origin_regex: str = ''

    ai_api_base_url: str = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    ai_api_key: str = ''
    ai_model_name: str = 'Qwen/Qwen3-VL-8B-Instruct'
    flash_model_name: str = ''
    pro_model_name: str = ''
    ai_timeout_seconds: int = 60
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
    cloud_tasks_enabled: bool = False
    cloud_tasks_project_id: str = ''
    cloud_tasks_location: str = ''
    cloud_tasks_queue: str = ''
    cloud_tasks_target_url: str = ''
    cloud_tasks_secret: str = ''
    cloud_tasks_service_account_email: str = ''
    cloud_tasks_oidc_audience: str = ''
    cloud_tasks_dispatch_deadline_seconds: int = 1800

    image_audit_enabled: bool = False
    image_audit_reject_threshold: float = 0.78

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

    @field_validator('cloud_tasks_target_url', 'cloud_tasks_service_account_email', 'cloud_tasks_oidc_audience', mode='before')
    @classmethod
    def normalize_string_settings(cls, value: Any) -> str:
        if not isinstance(value, str):
            return ''
        return value.strip().rstrip('/')

    @model_validator(mode='after')
    def validate_oauth_secret(self) -> 'Settings':
        insecure_defaults = {'', 'change-me-jwt-secret'}
        if self.app_env.strip().lower() != 'dev' and self.oauth_jwt_secret.strip() in insecure_defaults:
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
