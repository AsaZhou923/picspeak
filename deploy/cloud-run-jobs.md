# Operator maintenance via Cloud Run Jobs

The backend container image (`backend/Dockerfile`) includes `backend/scripts/` and runs as the non-root user `app` (`10001:10001`). Operator maintenance scripts can therefore run as Cloud Run Jobs using the deployed image and Secret Manager credentials instead of placing the production database URL on a developer workstation.

## Shared conventions

- **Project**: `project-f26ea384-25df-4d69-a78`
- **Region**: `asia-northeast1`
- **Service account**: `781338217290-compute@developer.gserviceaccount.com`
- **Image**: pin to the deployed commit digest/tag, e.g. `asia-northeast1-docker.pkg.dev/project-f26ea384-25df-4d69-a78/cloud-run-source-deploy/picspeak/picspeak-api:<COMMIT_SHA>`
- **Required runtime settings (`app/core/config.py`)**: importing backend services against a non-loopback `DATABASE_URL` requires `APP_ENV=production`, a non-default `APP_SECRET` (at least 32 characters), and a non-default `OAUTH_JWT_SECRET`. Reuse the exact Secret Manager secret names already bound on the production `picspeak-api` Cloud Run service for `APP_SECRET`, `OAUTH_JWT_SECRET`, and (where needed) R2 object storage credentials; `DATABASE_URL` uses the checked-in `picspeak-supabase-database-url` secret from `cloudbuild.yaml`.
- **Database URL passing**: `DATABASE_URL` is injected from Secret Manager and expanded inside the container via `sh -ceu` into each script's explicit `--database-url` flag so the connection string is never passed on an operator CLI or persisted in job arguments.
- **Safety gates**: deploy every job in **dry-run / read-only mode by default**. Never persist `--execute` or `PICSPEAK_*_EXECUTE=1` on a job definition; pass execution overrides only on a single authorized `gcloud run jobs execute` invocation after inspecting the dry-run output.

> [!WARNING]
> When modifying an existing Cloud Run Job (for example attaching an extra secret or changing an env var), always use `--update-secrets` and `--update-env-vars` — **never** `--set-secrets` or `--set-env-vars`. The `--set-*` flags replace **all** existing bindings on the job and will wipe `DATABASE_URL`, `APP_SECRET`, and `OAUTH_JWT_SECRET`.

Set shell variables once before running commands below (replace the `<...>` placeholders with the existing secret names / values already configured on `picspeak-api`):

```bash
PROJECT_ID=project-f26ea384-25df-4d69-a78
REGION=asia-northeast1
SERVICE_ACCOUNT=781338217290-compute@developer.gserviceaccount.com
IMAGE="asia-northeast1-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/picspeak/picspeak-api:<COMMIT_SHA>"
DB_SECRET=picspeak-supabase-database-url
APP_SECRET_NAME=<PICSPEAK_API_APP_SECRET_NAME>
OAUTH_JWT_SECRET_NAME=<PICSPEAK_API_OAUTH_JWT_SECRET_NAME>
```

> **Note:** Scripts that touch Cloudflare R2 (`purge_expired_objects.py` and `purge_expired_review_history.py --action purge --execute`) also require the object storage environment variables/secrets already used by `picspeak-api`: `OBJECT_S3_ENDPOINT`, `OBJECT_BUCKET`, `OBJECT_REGION`, `OBJECT_ACCESS_KEY_ID`, and `OBJECT_SECRET_ACCESS_KEY`.

---

## 1. Object retention (`purge_expired_objects.py`)

Dry-run by default. Deletion requires `--execute`, at least one `--category`, and `PICSPEAK_RETENTION_EXECUTE=1`. Use `--grace-until YYYY-MM-DD` on the first policy run after user notification.

Deploy dry-run job (initial creation uses `--set-secrets` / `--set-env-vars` with the full required set):

```bash
gcloud run jobs deploy picspeak-purge-expired-objects \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SERVICE_ACCOUNT" \
  --command=sh \
  --args='-ceu,exec python scripts/purge_expired_objects.py --database-url "$DATABASE_URL"' \
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest,APP_SECRET=${APP_SECRET_NAME}:latest,OAUTH_JWT_SECRET=${OAUTH_JWT_SECRET_NAME}:latest,OBJECT_ACCESS_KEY_ID=<R2_KEY_ID_SECRET>:latest,OBJECT_SECRET_ACCESS_KEY=<R2_SECRET_KEY_SECRET>:latest" \
  --set-env-vars="APP_ENV=production,OBJECT_S3_ENDPOINT=<R2_ENDPOINT>,OBJECT_BUCKET=<R2_BUCKET>,OBJECT_REGION=auto" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=30m
```

Execute dry-run report:

```bash
gcloud run jobs execute picspeak-purge-expired-objects \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --wait
```

One-off authorized execution (example: `photo_original` with `--grace-until` and `--max-delete`):

```bash
gcloud run jobs execute picspeak-purge-expired-objects \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="PICSPEAK_RETENTION_EXECUTE=1" \
  --args='-ceu,exec python scripts/purge_expired_objects.py --database-url "$DATABASE_URL" --category photo_original --grace-until 2026-12-01 --max-delete 200 --execute' \
  --wait
```

---

## 2. Free private-history retention (`purge_expired_review_history.py`)

Defaults to `--action preview` (read-only `REPEATABLE READ READ ONLY` snapshot, rolls back).
- **Required rollout gates**: `preview`, `notify`, and `purge` all check `NOTIFICATIONS_READ_ENABLED=true`, `NOTIFICATIONS_EVENT_CAPTURE_ENABLED=true`, and `NOTIFICATIONS_WORKER_ENABLED=true` (matching `deploy/cloud-run-env.yaml`). Without all three enabled, `preview`/`purge` classifies reviews as `notification_rollout_disabled` and `notify` raises an error.
- Notice queuing requires `--action notify --execute` and `PICSPEAK_HISTORY_NOTICE_EXECUTE=1`.
- Irreversible content cleanup requires `--action purge --execute`, `PICSPEAK_HISTORY_PURGE_EXECUTE=1`, and object storage configuration.

Deploy read-only preview job:

```bash
gcloud run jobs deploy picspeak-purge-expired-review-history \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SERVICE_ACCOUNT" \
  --command=sh \
  --args='-ceu,exec python scripts/purge_expired_review_history.py --database-url "$DATABASE_URL" --action preview' \
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest,APP_SECRET=${APP_SECRET_NAME}:latest,OAUTH_JWT_SECRET=${OAUTH_JWT_SECRET_NAME}:latest,OBJECT_ACCESS_KEY_ID=<R2_KEY_ID_SECRET>:latest,OBJECT_SECRET_ACCESS_KEY=<R2_SECRET_KEY_SECRET>:latest" \
  --set-env-vars="APP_ENV=production,NOTIFICATIONS_READ_ENABLED=true,NOTIFICATIONS_EVENT_CAPTURE_ENABLED=true,NOTIFICATIONS_WORKER_ENABLED=true,OBJECT_S3_ENDPOINT=<R2_ENDPOINT>,OBJECT_BUCKET=<R2_BUCKET>,OBJECT_REGION=auto" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=30m
```

Execute read-only preview:

```bash
gcloud run jobs execute picspeak-purge-expired-review-history \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --wait
```

One-off authorized notice queueing:

```bash
gcloud run jobs execute picspeak-purge-expired-review-history \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="PICSPEAK_HISTORY_NOTICE_EXECUTE=1" \
  --args='-ceu,exec python scripts/purge_expired_review_history.py --database-url "$DATABASE_URL" --action notify --max-items 200 --execute' \
  --wait
```

One-off authorized history purge (only after matching delivered `history.retention_notice` receipts are at least 7 days old):

```bash
gcloud run jobs execute picspeak-purge-expired-review-history \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="PICSPEAK_HISTORY_PURGE_EXECUTE=1" \
  --args='-ceu,exec python scripts/purge_expired_review_history.py --database-url "$DATABASE_URL" --action purge --max-items 200 --execute' \
  --wait
```

---

## 3. Billing reconciliation (`reconcile_billing.py`)

Strictly read-only (`REPEATABLE READ READ ONLY` + rollback). Prints aggregate JSON to stdout (captured in Cloud Logging).

Deploy job (supply dates per execution):

```bash
gcloud run jobs deploy picspeak-reconcile-billing \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SERVICE_ACCOUNT" \
  --command=sh \
  --args='-ceu,exec python scripts/reconcile_billing.py --database-url "$DATABASE_URL" --start-date "$START_DATE" --end-date "$END_DATE"' \
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest,APP_SECRET=${APP_SECRET_NAME}:latest,OAUTH_JWT_SECRET=${OAUTH_JWT_SECRET_NAME}:latest" \
  --set-env-vars="APP_ENV=production" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=10m
```

Execute for an inclusive UTC date window:

```bash
gcloud run jobs execute picspeak-reconcile-billing \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="START_DATE=2026-11-01,END_DATE=2026-11-30" \
  --wait
```

---

## 4. Operator announcements (`manage_announcements.py`)

`preview` and `status` are read-only. `publish` and `cancel` require `--execute` and `PICSPEAK_ANNOUNCEMENT_EXECUTE=1`.
- **Required rollout gates for `publish`**: `ANNOUNCEMENT_PUBLISH_ENABLED=true` and `NOTIFICATIONS_EVENT_CAPTURE_ENABLED=true` (pass both via `--update-env-vars` on the single authorized execution so publication stays disabled by default).
- **Repository-checkout-only actions**: `import-update` (and validating/publishing any spec whose `target_type` is `updates` or `blog`) reads `frontend/src/content/updates/*.json` or `frontend/src/content/blog/*.json`, which are outside the backend container image. Run `import-update` locally on a full repository checkout to draft the JSON spec; inside the backend image, `status`, `cancel`, and `preview`/`publish` with internal targets (`workspace`, `generate`, `gallery`, `retake`, `account`, `notifications`) or no target work without frontend assets.

Deploy read-only status job:

```bash
gcloud run jobs deploy picspeak-manage-announcements \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SERVICE_ACCOUNT" \
  --command=sh \
  --args='-ceu,exec python scripts/manage_announcements.py status --announcement-id "$ANNOUNCEMENT_ID" --database-url "$DATABASE_URL"' \
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest,APP_SECRET=${APP_SECRET_NAME}:latest,OAUTH_JWT_SECRET=${OAUTH_JWT_SECRET_NAME}:latest" \
  --set-env-vars="APP_ENV=production" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=10m
```

Check announcement status (read-only):

```bash
gcloud run jobs execute picspeak-manage-announcements \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="ANNOUNCEMENT_ID=<ANN_PUBLIC_ID>" \
  --wait
```

One-off authorized cancellation:

```bash
gcloud run jobs execute picspeak-manage-announcements \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="PICSPEAK_ANNOUNCEMENT_EXECUTE=1,ANNOUNCEMENT_ID=<ANN_PUBLIC_ID>,AUDIT_REASON=<REASON>" \
  --args='-ceu,exec python scripts/manage_announcements.py cancel --announcement-id "$ANNOUNCEMENT_ID" --audit-reason "$AUDIT_REASON" --database-url "$DATABASE_URL" --execute' \
  --wait
```

To `preview` and `publish` a reviewed JSON spec (internal or no content target) without overwriting existing secret bindings on `picspeak-manage-announcements`, attach the mounted spec secret with `--update-secrets` (never `--set-secrets`):

```bash
gcloud run jobs update picspeak-manage-announcements \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-secrets="/secrets/announcement/spec.json=<SPEC_SECRET>:latest"

# Dry-run preview first (offline validation of the mounted spec):
gcloud run jobs execute picspeak-manage-announcements \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --args='-ceu,exec python scripts/manage_announcements.py preview --input /secrets/announcement/spec.json' \
  --wait

# Single authorized publish execution (includes rollout gates + execute gate):
gcloud run jobs execute picspeak-manage-announcements \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="ANNOUNCEMENT_PUBLISH_ENABLED=true,NOTIFICATIONS_EVENT_CAPTURE_ENABLED=true,PICSPEAK_ANNOUNCEMENT_EXECUTE=1" \
  --args='-ceu,exec python scripts/manage_announcements.py publish --input /secrets/announcement/spec.json --database-url "$DATABASE_URL" --execute' \
  --wait
```

---

## 5. Stranded guest migration reconciliation (`reconcile_guest_migrations.py`)

Dry-run by default (`REPEATABLE READ READ ONLY`). Transfers require `--execute` and `PICSPEAK_GUEST_RECONCILE_EXECUTE=1`.

Deploy dry-run job:

```bash
gcloud run jobs deploy picspeak-reconcile-guest-migrations \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SERVICE_ACCOUNT" \
  --command=sh \
  --args='-ceu,exec python scripts/reconcile_guest_migrations.py --database-url "$DATABASE_URL"' \
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest,APP_SECRET=${APP_SECRET_NAME}:latest,OAUTH_JWT_SECRET=${OAUTH_JWT_SECRET_NAME}:latest" \
  --set-env-vars="APP_ENV=production" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=10m
```

Execute dry-run scan:

```bash
gcloud run jobs execute picspeak-reconcile-guest-migrations \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --wait
```

One-off authorized execution (pass `--after-guest-id` from the prior report's `last_scanned_guest_id` when paging):

```bash
gcloud run jobs execute picspeak-reconcile-guest-migrations \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="PICSPEAK_GUEST_RECONCILE_EXECUTE=1" \
  --args='-ceu,exec python scripts/reconcile_guest_migrations.py --database-url "$DATABASE_URL" --max-guests 200 --execute' \
  --wait
```
