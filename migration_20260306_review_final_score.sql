ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS final_score NUMERIC(4,2);

UPDATE reviews
SET final_score = ROUND((
    COALESCE((result_json->'scores'->>'composition')::numeric, 0) +
    COALESCE((result_json->'scores'->>'lighting')::numeric, 0) +
    COALESCE((result_json->'scores'->>'color')::numeric, 0) +
    COALESCE((result_json->'scores'->>'story')::numeric, 0) +
    COALESCE((result_json->'scores'->>'technical')::numeric, 0)
) / 5.0, 2)
WHERE final_score IS NULL;

ALTER TABLE reviews
ALTER COLUMN final_score SET NOT NULL;
