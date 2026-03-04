-- create_schema.sql
-- PostgreSQL 14+

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Enum types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_plan') THEN
        CREATE TYPE user_plan AS ENUM ('free', 'pro', 'enterprise');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'photo_status') THEN
        CREATE TYPE photo_status AS ENUM ('UPLOADING', 'READY', 'REJECTED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_mode') THEN
        CREATE TYPE review_mode AS ENUM ('flash', 'pro');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
        CREATE TYPE task_status AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_status') THEN
        CREATE TYPE review_status AS ENUM ('SUCCEEDED', 'FAILED');
    END IF;
END $$;

-- 2) Common trigger for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) users
CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL PRIMARY KEY,
    public_id           TEXT NOT NULL UNIQUE,
    email               TEXT NOT NULL UNIQUE,
    username            TEXT NOT NULL UNIQUE,
    password_hash       TEXT,
    plan                user_plan NOT NULL DEFAULT 'free',
    daily_quota_total   INTEGER NOT NULL DEFAULT 20 CHECK (daily_quota_total >= 0),
    daily_quota_used    INTEGER NOT NULL DEFAULT 0 CHECK (daily_quota_used >= 0),
    status              user_status NOT NULL DEFAULT 'active',
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_status_plan ON users(status, plan);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4) photos
CREATE TABLE IF NOT EXISTS photos (
    id                  BIGSERIAL PRIMARY KEY,
    public_id           TEXT NOT NULL UNIQUE,
    owner_user_id       BIGINT NOT NULL REFERENCES users(id),
    upload_id           TEXT NOT NULL,
    bucket              TEXT NOT NULL,
    object_key          TEXT NOT NULL,
    content_type        TEXT NOT NULL,
    size_bytes          BIGINT NOT NULL CHECK (size_bytes > 0),
    checksum_sha256     TEXT,
    width               INTEGER CHECK (width > 0),
    height              INTEGER CHECK (height > 0),
    status              photo_status NOT NULL DEFAULT 'UPLOADING',
    exif_data           JSONB NOT NULL DEFAULT '{}'::jsonb,
    client_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
    nsfw_label          TEXT,
    nsfw_score          NUMERIC(5,4),
    rejected_reason     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_photos_bucket_object UNIQUE (bucket, object_key),
    CONSTRAINT chk_photos_nsfw_score CHECK (nsfw_score IS NULL OR (nsfw_score >= 0 AND nsfw_score <= 1))
);

CREATE INDEX IF NOT EXISTS idx_photos_owner_created ON photos(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);

DROP TRIGGER IF EXISTS trg_photos_updated_at ON photos;
CREATE TRIGGER trg_photos_updated_at
BEFORE UPDATE ON photos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5) review_tasks
CREATE TABLE IF NOT EXISTS review_tasks (
    id                  BIGSERIAL PRIMARY KEY,
    public_id           TEXT NOT NULL UNIQUE,
    photo_id            BIGINT NOT NULL REFERENCES photos(id),
    owner_user_id       BIGINT NOT NULL REFERENCES users(id),
    mode                review_mode NOT NULL,
    status              task_status NOT NULL DEFAULT 'PENDING',
    idempotency_key     TEXT,
    request_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempt_count       INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts        INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    progress            INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    error_code          TEXT,
    error_message       TEXT,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    expire_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_review_tasks_user_idempotency UNIQUE (owner_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_status_created ON review_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_review_tasks_photo_created ON review_tasks(photo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_tasks_owner_created ON review_tasks(owner_user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_review_tasks_updated_at ON review_tasks;
CREATE TRIGGER trg_review_tasks_updated_at
BEFORE UPDATE ON review_tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6) reviews
CREATE TABLE IF NOT EXISTS reviews (
    id                  BIGSERIAL PRIMARY KEY,
    public_id           TEXT NOT NULL UNIQUE,
    task_id             BIGINT UNIQUE REFERENCES review_tasks(id),
    photo_id            BIGINT NOT NULL REFERENCES photos(id),
    owner_user_id       BIGINT NOT NULL REFERENCES users(id),
    mode                review_mode NOT NULL,
    status              review_status NOT NULL,
    schema_version      TEXT NOT NULL DEFAULT '1.0',
    result_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
    input_tokens        INTEGER,
    output_tokens       INTEGER,
    cost_usd            NUMERIC(12,6),
    latency_ms          INTEGER,
    model_name          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_reviews_tokens_non_negative CHECK (
        (input_tokens IS NULL OR input_tokens >= 0)
        AND (output_tokens IS NULL OR output_tokens >= 0)
        AND (latency_ms IS NULL OR latency_ms >= 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_reviews_photo_created ON reviews(photo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_owner_created ON reviews(owner_user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON reviews;
CREATE TRIGGER trg_reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7) idempotency_keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(id),
    endpoint            TEXT NOT NULL,
    idempotency_key     TEXT NOT NULL,
    request_hash        TEXT NOT NULL,
    http_status         INTEGER,
    response_json       JSONB,
    expire_at           TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_idempotency_user_endpoint_key UNIQUE (user_id, endpoint, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expire_at ON idempotency_keys(expire_at);

-- 8) usage_ledger
CREATE TABLE IF NOT EXISTS usage_ledger (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(id),
    review_id           BIGINT REFERENCES reviews(id),
    task_id             BIGINT REFERENCES review_tasks(id),
    usage_type          TEXT NOT NULL,
    amount              NUMERIC(18,6) NOT NULL,
    unit                TEXT NOT NULL,
    bill_date           DATE NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_user_bill_date ON usage_ledger(user_id, bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_type_bill_date ON usage_ledger(usage_type, bill_date DESC);

-- 9) rate_limit_counters
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    id                  BIGSERIAL PRIMARY KEY,
    scope               TEXT NOT NULL,
    scope_key           TEXT NOT NULL,
    endpoint            TEXT,
    window_start        TIMESTAMPTZ NOT NULL,
    window_seconds      INTEGER NOT NULL CHECK (window_seconds > 0),
    hit_count           INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_rate_limit_window UNIQUE (scope, scope_key, endpoint, window_start, window_seconds)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_scope_window ON rate_limit_counters(scope, scope_key, window_start DESC);

DROP TRIGGER IF EXISTS trg_rate_limit_updated_at ON rate_limit_counters;
CREATE TRIGGER trg_rate_limit_updated_at
BEFORE UPDATE ON rate_limit_counters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- 10) api_request_logs
CREATE TABLE IF NOT EXISTS api_request_logs (
    id                  BIGSERIAL PRIMARY KEY,
    request_id          TEXT NOT NULL UNIQUE,
    method              TEXT NOT NULL,
    path                TEXT NOT NULL,
    query_string        TEXT,
    endpoint            TEXT,
    client_ip           TEXT,
    user_public_id      TEXT,
    user_agent          TEXT,
    request_body        TEXT,
    status_code         INTEGER NOT NULL,
    duration_ms         INTEGER NOT NULL CHECK (duration_ms >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_created ON api_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_user_created ON api_request_logs(user_public_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_ip_created ON api_request_logs(client_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_path_created ON api_request_logs(path, created_at DESC);

COMMIT;
