from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_env: str = 'dev'
    app_secret: str = 'change-me'
    database_url: str = 'postgresql+psycopg2://postgres:postgres@localhost:5432/aipingtubackend'

    object_bucket: str = 'aipingtuphotos'
    object_base_url: str = 'https://object.example.com'
    max_upload_bytes: int = 20 * 1024 * 1024

    rate_limit_per_minute: int = 10
    ip_rate_limit_per_minute: int = 30
    default_daily_quota: int = 20

    oauth_jwt_secret: str = 'change-me-jwt-secret'
    oauth_jwt_issuer: str = ''
    oauth_jwt_audience: str = ''

    siliconflow_base_url: str = 'https://api.siliconflow.cn/v1'
    siliconflow_api_key: str = ''
    ai_model_name: str = 'Qwen/Qwen3-VL-8B-Instruct'
    ai_timeout_seconds: int = 60


settings = Settings()
