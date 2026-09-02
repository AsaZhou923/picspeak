@echo off
setlocal

echo ==============================
echo Deploying backend to Cloud Run
echo ==============================

set PROJECT_ID=project-f26ea384-25df-4d69-a78
set REGION=asia-northeast1
set REPOSITORY=cloud-run-source-deploy
set SERVICE_NAME=picspeak-api
set MIGRATION_JOB=picspeak-db-migrate
set DATABASE_SECRET=picspeak-supabase-database-url
set RUNTIME_SERVICE_ACCOUNT=781338217290-compute@developer.gserviceaccount.com

cd /d "E:\Project Code\PicSpeak\backend"

if errorlevel 1 (
  echo [ERROR] Backend directory not found.
  exit /b 1
)

for /f %%i in ('git status --porcelain') do (
  echo [ERROR] Refusing to deploy from a dirty working tree. Commit or stash changes first.
  exit /b 1
)

for /f %%i in ('git rev-parse --short=12 HEAD') do set IMAGE_TAG=manual-%%i
if not defined IMAGE_TAG (
  echo [ERROR] Failed to resolve the current Git commit.
  exit /b 1
)
set IMAGE_PATH=asia-northeast1-docker.pkg.dev/%PROJECT_ID%/%REPOSITORY%/picspeak/picspeak-api:%IMAGE_TAG%

echo [1/6] Setting gcloud project...
gcloud config set project %PROJECT_ID%
if errorlevel 1 (
  echo [ERROR] Failed to set gcloud project.
  exit /b 1
)

echo [2/6] Configuring Docker authentication...
gcloud auth configure-docker %REGION%-docker.pkg.dev --quiet
if errorlevel 1 (
  echo [ERROR] Failed to configure Docker authentication.
  exit /b 1
)

echo [3/6] Building Docker image...
docker build -t %IMAGE_PATH% .
if errorlevel 1 (
  echo [ERROR] Docker build failed.
  exit /b 1
)

echo [4/6] Pushing Docker image...
docker push %IMAGE_PATH%
if errorlevel 1 (
  echo [ERROR] Docker push failed.
  exit /b 1
)

echo [5/6] Running database migrations...
gcloud run jobs deploy %MIGRATION_JOB% ^
  --image %IMAGE_PATH% ^
  --region %REGION% ^
  --service-account %RUNTIME_SERVICE_ACCOUNT% ^
  --command python ^
  --args scripts/ensure_runtime_schema.py ^
  --set-secrets DATABASE_URL=%DATABASE_SECRET%:latest ^
  --tasks 1 ^
  --parallelism 1 ^
  --max-retries 0 ^
  --task-timeout 10m ^
  --execute-now ^
  --wait ^
  --quiet

if errorlevel 1 (
  echo [ERROR] Database migration failed. Service deployment was blocked.
  exit /b 1
)

echo [6/6] Deploying to Cloud Run...
gcloud run deploy %SERVICE_NAME% ^
  --image %IMAGE_PATH% ^
  --region %REGION% ^
  --platform managed ^
  --allow-unauthenticated ^
  --port 8080

if errorlevel 1 (
  echo [ERROR] Cloud Run deployment failed.
  exit /b 1
)

echo [OK] Database migration and backend deployment completed successfully.
exit /b 0
