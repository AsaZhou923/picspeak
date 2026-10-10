# Production notification delivery

Production runs review and generation tasks through Cloud Tasks with `RUN_EMBEDDED_WORKER=false`. The in-process notification thread therefore does not run there. A separate Cloud Scheduler HTTP job must call the existing restricted notification processor every minute.

The deployed service requires `CLOUD_TASKS_ENABLED=true`, its existing `CLOUD_TASKS_SECRET`, and `NOTIFICATIONS_WORKER_ENABLED=true`. Automatic and manual production deployments explicitly enable notification reading and new event capture; local `.env.example` defaults remain disabled. To suspend a production rollout, disable capture/reading on Cloud Run and adjust deployment configuration before deploying again.

Enable the Cloud Scheduler API once, then provision with an authenticated operator:

```powershell
gcloud services enable cloudscheduler.googleapis.com --project project-f26ea384-25df-4d69-a78
python deploy/configure-notifications.py --project project-f26ea384-25df-4d69-a78 --region asia-northeast1 --service picspeak-api
python deploy/configure-notifications.py --project project-f26ea384-25df-4d69-a78 --region asia-northeast1 --service picspeak-api --execute
```

The default is a read-only dry run. The script reads the current dispatch secret directly into memory, supports Secret Manager references, and never prints the secret or passes it as a command argument. Restrict Scheduler resource read access to operators because its HTTP headers contain that secret. Re-run provisioning whenever the dispatch secret or service URL changes. The job persists independently of service revisions. `--run-now` requests a Scheduler dispatch; it does not prove delivery.

Verify `picspeak-notification-sweep` is `ENABLED`, scheduled `* * * * *`, and its recent `cloud_scheduler_job` `AttemptFinished` records report HTTP 200. Cloud Run processor requests provide a heartbeat even when no events are pending. Existing operational-health output separately reports pending/failed events and oldest pending age. Do not report an empty queue as proof that the scheduler ran. A synthetic recipient and terminal-task event can verify delivery, ownership, read/archive behavior and cleanup without charging quota or making a model request; this is delivery evidence, not a live AI task test.

The dispatch endpoint continues to require `X-Task-Dispatch-Secret` and `CLOUD_TASKS_ENABLED`; the Scheduler adds no user-facing write API or browser-table grants. System messages are automatic. Gallery likes and product announcements remain optional per account, default off. Announcement publishing remains an explicit operator operation and is not performed by provisioning or deployment. Existing pre-rollout events are not backfilled.
