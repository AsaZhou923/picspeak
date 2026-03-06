from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Support UTF-8 files with/without BOM so the first env key is parsed correctly.
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8-sig', extra='ignore')

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
    guest_ip_rate_limit_per_minute: int = 8
    guest_burst_limit_per_10s: int = 8
    default_daily_quota: int = 6

    oauth_jwt_secret: str = 'change-me-jwt-secret'
    oauth_jwt_issuer: str = ''
    oauth_jwt_audience: str = ''
    trust_x_forwarded_for: bool = False
    google_oauth_client_id: str = ''
    google_oauth_client_secret: str = ''
    google_oauth_redirect_uri: str = ''
    backend_cors_origins: list[str] = Field(
        default_factory=lambda: ['http://localhost:3000', 'http://127.0.0.1:3000']
    )

    siliconflow_base_url: str = 'https://api.siliconflow.cn/v1'
    siliconflow_api_key: str = ''
    ai_model_name: str = 'Qwen/Qwen3-VL-8B-Instruct'
    ai_timeout_seconds: int = 60

    image_audit_enabled: bool = True
    image_audit_reject_threshold: float = 0.78

    @model_validator(mode='after')
    def validate_oauth_secret(self) -> 'Settings':
        insecure_defaults = {'', 'change-me-jwt-secret'}
        if self.app_env.strip().lower() != 'dev' and self.oauth_jwt_secret.strip() in insecure_defaults:
            raise ValueError('OAUTH_JWT_SECRET must be set to a non-default secret outside dev mode')
        return self


settings = Settings()
