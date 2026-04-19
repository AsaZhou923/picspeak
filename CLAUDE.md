# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PicSpeak (图言 / AiPingTu) is an AI-powered photo review and critique application. Users upload photos and receive AI-generated photography feedback with structured scoring and improvement suggestions.

## Architecture

- **Frontend**: Next.js 15 (App Router) + React 18 + TypeScript + Tailwind CSS
- **Backend**: FastAPI (Python) with Uvicorn
- **Database**: PostgreSQL (via SQLAlchemy)
- **Object Storage**: Cloudflare R2 (S3-compatible)
- **AI**: Vision LLM for image analysis (Flash/Pro models)
- **Task Queue**: In-process async worker (no Redis dependency; task state stored in PostgreSQL)
- **Authentication**: Clerk (Google OAuth + Guest users)
- **Payments**: Lemon Squeezy

## Commands

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Worker (Background task processor)
```bash
cd backend
python -m app.worker_main
```

### Guest cleanup service
```bash
cd backend
python -m app.cleanup_guests_main
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # Clean .next cache then run dev server
npm run build    # Production build (cleans first)
npm run lint     # ESLint check
```

## Project Structure

### Backend (`/backend/app/`)
- `main.py` - FastAPI app entry point with lifespan, middleware, exception handlers
- `api/router.py` - Route assembler; `include_router` for all domain routers
- `api/routers/` - Domain route files: `auth`, `uploads`, `photos`, `reviews`, `tasks`, `gallery`, `billing`, `blog`, `analytics`, `realtime`, `webhooks`
- `api/deps.py` - Dependency injection (auth, quota, guest tokens)
- `db/models.py` - SQLAlchemy models (User, Photo, Review, ReviewTask, UsageLedger)
- `db/session.py` - Database session management
- `services/ai.py` - Vision LLM integration
- `services/clerk_auth.py` - Clerk authentication service
- `services/object_storage.py` - R2/S3 presigned URL handling
- `services/review_task_processor.py` - Async task processing logic
- `services/worker.py` - Embedded worker manager
- `core/config.py` - Settings via pydantic-settings
- `core/security.py` - Token creation/verification

### Frontend (`/frontend/src/`)
- `app/` - Next.js App Router pages (dynamic routes for reviews, tasks, photos)
- `features/workspace/` - Upload hooks (`useUploadFlow`, `useWorkspaceUsage`, `useReplayContext`) + workspace UI components
- `features/reviews/` - Review hooks (`useReviewDetail`, `useReviewPhoto`, `useReviewActions`) + review UI components
- `components/` - Shared React components (upload, auth, UI elements)
- `lib/` - Utilities (API client, auth context, i18n, image compression, EXIF extraction)

## Key Design Patterns

### Authentication Flow
- Clerk handles primary auth (Google OAuth)
- Guest tokens for unauthenticated users (signed JWT in cookies)
- Guest users can upgrade to authenticated accounts

### Quota System
- Multi-dimensional quota: `IP + user_id + endpoint + plan`
- Plans: `free`, `pro`, `premium`
- Usage tracked in `UsageLedger` table

### Async Review Tasks
- Review creation returns `task_id` immediately
- Task states: `PENDING` -> `RUNNING` -> `SUCCEEDED | FAILED | EXPIRED`
- Idempotency via `Idempotency-Key` header

### Image Upload Flow
1. Client requests presigned URL via `POST /uploads/presign`
2. Client uploads directly to R2
3. Client confirms via `POST /photos` with photo metadata

## Environment Variables

### Backend (`.env`)
- Database connection (PostgreSQL)
- Clerk secret key and webhook secrets
- R2/S3 credentials
- Lemon Squeezy API key
- AI model API keys

### Frontend (`.env.local`)
- Clerk publishable key
- API backend URL
- Analytics keys (Vercel)

## Database Schema

Core tables: `users`, `photos`, `review_tasks`, `reviews`, `billing_subscriptions`, `usage_ledger`. See `create_schema.sql` for full schema including indexes and constraints.