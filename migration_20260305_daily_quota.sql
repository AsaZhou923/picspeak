-- 每日限额机制升级：普通用户基线 6 次/天，guest=3 次/天，pro=12 次/天
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'user_plan'
          AND e.enumlabel = 'guest'
    ) THEN
        ALTER TYPE user_plan ADD VALUE 'guest';
    END IF;
END $$;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS daily_quota_date DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE users
    ALTER COLUMN daily_quota_total SET DEFAULT 6;

-- 历史数据修正（按用户等级同步到新基线）
UPDATE users
SET daily_quota_total = CASE plan
    WHEN 'guest' THEN 3
    WHEN 'pro' THEN 12
    ELSE 6
END;

UPDATE users
SET daily_quota_date = CURRENT_DATE
WHERE daily_quota_date IS NULL;

COMMIT;
