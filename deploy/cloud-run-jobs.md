# Operator maintenance via Cloud Run Jobs

The backend container image (`backend/Dockerfile`) includes `backend/scripts/` and runs as the non-root user `app` (`10001:10001`). Operator maintenance scripts can therefore run as Cloud Run Jobs using the deployed image and Secret Manager credentials instead of placing the production database URL on a developer workstation.

## Shared conventions

- **Project**: `project-f26ea384-25df-4d69-a78`
- **Region**: `asia-northeast1`
- **Service account**: `781338217290-compute@developer.gserviceaccount.com`
- **Database secret**: `picspeak-supabase-database-url` (injected as `DATABASE_URL` and expanded inside the container via `sh -ceu` into each script's explicit `--database-url` argument so the connection string is never passed on an operator CLI or stored in job args)
- **Image**: pin to the deployed commit digest/tag, e.g. `asia-northeast1-docker.pkg.dev/project-f26ea384-25df-4d69-a78/cloud-run-source-deploy/picspeak/picspeak-api:<COMMIT_SHA>`
- **Safety gates**: deploy every job in **dry-run / read-only mode by default**. Never persist `--execute` or `PICSPEAK_*_EXECUTE=1` on a job definition; pass execution overrides only on a single authorized `gcloud run jobs execute` invocation after inspecting the dry-run output.

Set shell variables once before running commands below:

```bash
PROJECT_ID=project-f26ea384-25df-4d69-a78
REGION=asia-northeast1
SERVICE_ACCOUNT=781338217290-compute@developer.gserviceaccount.com
IMAGE="asia-northeast1-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/picspeak/picspeak-api:<COMMIT_SHA>"
DB_SECRET=picspeak-supabase-database-url
```

> **Note:** Scripts that touch Cloudflare R2 (`purge_expired_objects.py` and `purge_expired_review_history.py --action purge --execute`) also require the object storage environment variables/secrets already used by `picspeak-api`: `OBJECT_S3_ENDPOINT`, `OBJECT_BUCKET`, `OBJECT_REGION`, `OBJECT_ACCESS_KEY_ID`, and `OBJECT_SECRET_ACCESS_KEY`. Supply them via `--set-env-vars` / `--set-secrets` on those jobs using your existing Secret Manager entries.

---

## 1. Object retention (`purge_expired_objects.py`)

Dry-run by default. Deletion requires `--execute`, at least one `--category`, and `PICSPEAK_RETENTION_EXECUTE=1`. Use `--grace-until YYYY-MM-DD` on the first policy run after user notification.

Deploy dry-run job:

```bash
gcloud run jobs deploy picspeak-purge-expired-objects \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SERVICE_ACCOUNT" \
  --command=sh \
  --args='-ceu,exec python scripts/purge_expired_objects.py --database-url "$DATABASE_URL"' \
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest,OBJECT_ACCESS_KEY_ID=<R2_KEY_ID_SECRET>:latest,OBJECT_SECRET_ACCESS_KEY=<R2_SECRET_KEY_SECRET>:latest" \
  --set-env-vars="OBJECT_S3_ENDPOINT=<R2_ENDPOINT>,OBJECT_BUCKET=<R2_BUCKET>,OBJECT_REGION=auto" \
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
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest,OBJECT_ACCESS_KEY_ID=<R2_KEY_ID_SECRET>:latest,OBJECT_SECRET_ACCESS_KEY=<R2_SECRET_KEY_SECRET>:latest" \
  --set-env-vars="OBJECT_S3_ENDPOINT=<R2_ENDPOINT>,OBJECT_BUCKET=<R2_BUCKET>,OBJECT_REGION=auto" \
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
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest" \
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

`preview` and `status` are read-only. `publish` and `cancel` require `--execute` and `PICSPEAK_ANNOUNCEMENT_EXECUTE=1`. For `publish`, mount the reviewed JSON publication specification from Secret Manager (e.g. `/secrets/announcement/spec.json`) rather than copying it into command arguments.

Deploy read-only status job:

```bash
gcloud run jobs deploy picspeak-manage-announcements \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SERVICE_ACCOUNT" \
  --command=sh \
  --args='-ceu,exec python scripts/manage_announcements.py status --announcement-id "$ANNOUNCEMENT_ID" --database-url "$DATABASE_URL"' \
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest" \
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

For `publish`, attach the reviewed spec JSON as a mounted secret (`--set-secrets="/secrets/announcement/spec.json=<SPEC_SECRET>:latest"`) on the job, run `preview --input /secrets/announcement/spec.json` first, and then run a single execution with `--update-env-vars="PICSPEAK_ANNOUNCEMENT_EXECUTE=1"` and `--args='-ceu,exec python scripts/manage_announcements.py publish --input /secrets/announcement/spec.json --database-url "$DATABASE_URL" --execute'`.

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
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest" \
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
