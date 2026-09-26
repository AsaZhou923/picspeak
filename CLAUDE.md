# CLAUDE.md

This file gives Claude Code project-specific guidance for working in this repository.

## Project Overview

PicSpeak is an AI photo critique and visual-reference generation web app. Users can upload photos for structured AI photography feedback, browse review history and gallery content, and generate AI reference images from prompts, templates, or review improvement suggestions.

Photo critique remains the primary product entry point. Practice, organization, gallery, public profile, sharing, and printable-card work should reinforce the user's path after a critique result rather than replacing the upload-and-critique flow.

Core product areas:

- Photo upload, AI critique, scoring, and retake suggestions as the first-time user path
- Guest and authenticated usage with quotas and upgrade paths
- Public gallery, blog, changelog/updates, SEO metadata, and llms.txt support
- AI image generation with templates, tasks, generated image detail pages, history, credits, and credit-pack billing
- Review-to-generation loop for composition, lighting, color, and retake reference images
- Review-to-workspace retake targets, history practice themes, and in-task Blog reading during critique/generation waits
- Original-to-retake comparison with GPT-5.6 Luna at `xhigh` reasoning, deterministic per-request score deltas, evidence-backed next-shoot actions, and separate practice-round records
- Operational health snapshots for task status, AI costs, credits, payments, and public-content audits

## Architecture

- **Frontend**: Next.js 15 App Router, React 18, TypeScript, Tailwind CSS
- **Backend**: FastAPI, SQLAlchemy 2.x, Alembic, Uvicorn
- **Database**: PostgreSQL
- **Object storage**: Cloudflare R2 / S3-compatible storage
- **AI critique**: Qwen-compatible single-photo critique by default, optional GPT-5.6 Luna single-photo review through OpenAI Responses, and GPT-5.6 Luna paired original/retake comparison; both OpenAI paths use `xhigh` reasoning
- **AI generation**: OpenAI-compatible image generation endpoint, task queue, credit pricing, and object-storage persistence
- **Task processing**: In-process async worker by default, optional standalone worker and Cloud Tasks configuration
- **Authentication**: Clerk plus legacy Google OAuth/guest JWT support
- **Billing**: Lemon Squeezy Pro checkout, activation codes, image credit packs, and webhooks


Current single-photo code contract: `score-v5-evidence-calibrated` / `photo-score-v5-evidence-calibrated` with `photo-review-v8-image-led` prose. Store dimension evidence and perform one additional canonical-scoring audit for candidates >=8; final dimension scores still determine the arithmetic mean. Judge visible expressive effects, preserve defining strengths, and keep completed scoring evidence/checkpoints through writer retries. Historical gallery re-evaluation requires an explicit maintenance run; changing prompts alone does not update deployed services or stored reviews.

Validate scoring changes with `backend/scripts/evaluate_score_calibration.py` and the protocol in `docs/scoring-calibration.md`. Synthetic fixtures and small live-model probes are diagnostic only; formal calibration requires independent human labels and a held-out test set. Keep ordinary and paired-retake scoring versions separate in growth statistics.

## Common Commands

### Backend setup

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt
```

### Backend runtime

```bash
cd backend
python scripts/ensure_runtime_schema.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Backend worker and maintenance

```bash
cd backend
python -m app.worker_main
python -m app.cleanup_guests_main
python scripts/generate_activation_codes.py
python scripts/register_lemonsqueezy_webhook.py
python scripts/verify_product_analytics_write.py
python scripts/export_product_analytics_weekly_report.py
python scripts/export_operational_health_snapshot.py
python scripts/backfill_gallery_thumbnails.py
python scripts/reassess_gallery_reviews.py  # dry-run; --execute requires an authorized maintenance run
```

### Backend tests

```bash
.\.venv\Scripts\python.exe -m pytest backend/tests
.\.venv\Scripts\python.exe -m pytest backend/tests/test_image_generation_routes.py
```

### Frontend setup and runtime

```bash
cd frontend
npm install
npm run dev
npm run dev:clean
npm run build
npm run start
```

### Frontend checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run test
```

## Project Structure

### Backend (`backend/app/`)

- `main.py` - FastAPI app entry point, lifespan, middleware, exception handlers
- `api/router.py` - API router assembly under `/api/v1`; legacy webhook router under `/api`
- `api/routers/` - Domain routes for auth, uploads, photos, reviews, tasks, gallery, generations, blog, billing, analytics, realtime, and webhooks
- `api/deps.py` - Request dependencies for auth, quota, guest tokens, and shared route helpers
- `db/models.py` - SQLAlchemy models for users, photos, reviews, tasks, gallery, billing, usage, analytics, and generated images
- `db/bootstrap.py` - Runtime schema bootstrap helpers
- `services/ai.py` and `services/ai_prompts.py` - Vision critique client and prompt construction
- `services/retake_comparison.py` - GPT-5.6 Luna paired-image schema, Responses API client, deterministic deltas, and comparison normalization
- `services/review_task_processor.py` - Photo review task execution
- `services/image_generation*.py` - Generation client, prompt building, pricing, and task execution
- `services/object_storage.py` - Presigned upload/download and generated image persistence
- `services/task_dispatcher.py`, `services/task_events.py`, `services/worker.py` - Task dispatch, WebSocket/event polling, and worker orchestration
- `services/clerk_auth.py`, `services/clerk_webhooks.py` - Clerk identity and webhook handling
- `services/lemonsqueezy*.py` - Checkout, webhook, Pro, and credit-pack handling
- `services/product_analytics.py`, `services/content_audit.py`, and `services/operational_health.py` - Analytics, content conversion, and operational health reporting support
- `core/config.py` - Environment-backed settings via `pydantic-settings`

### Backend scripts and schema

- `backend/alembic/` - Alembic migrations
- `backend/scripts/ensure_runtime_schema.py` - Runtime schema guard used during local startup/deploys
- `create_schema.sql` - Full schema snapshot, useful for reviewing table/index intent

### Frontend (`frontend/src/`)

- `app/` - App Router routes, including workspace, retake coach, reviews, tasks, gallery, generate, generation tasks/details, account pages, blog, updates, localized pages, robots, sitemap, and llms.txt routes
- `features/workspace/` - Upload flow, quota display, mode/image type/model pickers, retake source handoff, and replay context
- `features/reviews/` - Review detail hooks and UI panels, including action bar, gallery publishing, growth loop, paired retake comparison/progress, retake target handoff, and reference generation
- `features/generations/` - Generation contracts, config, and prompt example UI
- `components/` - Shared auth, billing, blog, gallery, home, layout, marketing, provider, upload, and UI components
- `content/` - Blog, updates, generation prompt examples, and review copy/content bundles
- `lib/` - API client, auth context, i18n, locale routing, SEO helpers, llms.txt content, checkout helpers, analytics, EXIF/compression/canvas utilities, and shared types
- `test/` - Node test-runner coverage for content, SEO, i18n, conversion copy, generation prompts, and UI support utilities

## Key Flows

### Photo critique

1. Frontend requests a presigned upload URL from `POST /api/v1/uploads/presign`.
2. Browser uploads directly to object storage.
3. Frontend creates the photo record and review task.
4. Review task enters `PENDING -> RUNNING -> SUCCEEDED | FAILED | EXPIRED`.
5. Task status is surfaced via polling/WebSocket routes, then the user lands on the review detail page.

### AI image generation

1. User starts from `/generate`, prompt examples, or a review reference-generation panel.
2. Backend creates an image generation task and prices it against generation credits.
3. Worker executes the OpenAI-compatible image generation request, stores the result in object storage, and writes generated image records.
4. Frontend routes through `/generation-tasks/[taskId]` to `/generations/[generationId]`.
5. Users can download, copy prompts, reuse settings, view account history, or send a result back to the workspace as retake inspiration.

### Retake Coach

1. User opens `/retake`, selects a completed source critique, and continues to the workspace with its source review and target context.
2. The workspace uploads a new photo and creates a review with `analysis_type=retake_compare` and the source review id.
3. Backend resolves both stored images and sends them together to the OpenAI Responses API with `model=gpt-5.6-luna`, `reasoning.effort=xhigh`, and a strict paired-comparison schema.
4. GPT-5.6 Luna scores both images under one rubric; the server calculates every dimension and overall delta before persisting `Review.result_json.comparison`.
5. Results appear in `RetakeComparisonPanel` and the per-round `RetakeProgressPanel`; each pair retains its own before/after scores, version, and comparability. Never sum paired deltas or join independently rescored images into an ability curve.
6. The paired diagnosis can feed the existing GPT Image 2 `review_linked` / `retake_reference` flow, but generated images never affect comparison scores.

The optional goal-practice flow is controlled by backend `PRACTICE_ENABLED` (default `false`). Its versioned contract is in `E:\Project Code\docs\01 - Projects\PicSpeak\02 - Architecture\Practice v1 合同.md`; machine-readable metric fixtures live at `backend/tests/fixtures/practice_metric_examples.json`. Accepted goals live in immutable `PracticeSession` snapshots; `PracticeAttempt` links one user attempt to one existing `ReviewTask`. Workers load trusted goals from those records and store four-state evidence in `Review.result_json.goal_assessment`. A score increase never substitutes for goal completion. Disabling the flag stops new sessions and attempts while keeping saved results readable. This describes the local code contract, not a deployed feature or a validated claim of skill improvement.

Practice analytics uses server-owned accepted/submitted/completed/feedback events and owner-validated, deduplicated visible-card events. `review_call_costs` records actual provider-call estimates, including scorer audits, failed usage, and retries; unavailable usage is null. `export_practice_analytics_report.py` is offline by default and requires an explicit database URL for DB mode; an optional eligibility manifest is required before unknown users can enter official A7/L14/W4 denominators. The account history Practice view uses cursor pagination and a separate server-wide authorized summary. Goal and Beta evaluators are offline tools under `backend/scripts/`; missing real evidence must remain `INSUFFICIENT_INVALID`, never a Beta or skill-improvement claim.

Keep execution records, evaluation protocols, and generated analytics reports in the sibling docs vault under `E:\Project Code\docs\01 - Projects\PicSpeak` (Testing, Architecture, and Analytics subfolders). Keep machine-readable test fixtures and evaluator input templates in the code repository.

Normal single-photo review is a separate path: the Qwen-compatible route remains the default and the workspace currently labels it as Qwen 3.7, while an explicit GPT-5.6 selection uses GPT-5.6 Luna with `xhigh` reasoning through the OpenAI Responses API. Do not reuse one model's completed review for another model choice.

### Auth and quota

- Clerk is the primary auth provider.
- Guest sessions use signed JWT cookies and can later upgrade.
- Quotas are tracked through `usage_ledger` and related helpers by IP, user identity, endpoint/category, plan, and generation credit balance.
- Idempotency matters for creation endpoints; keep `Idempotency-Key` behavior intact when touching task creation.

### SEO, locale, and content

- English, Chinese, and Japanese content is represented across `i18n-*.ts`, localized routes, blog/update JSON files, and SEO helpers.
- `i18n-en.ts` defines the canonical key set; Chinese and Japanese dictionaries must explicitly define every key rather than spreading the English dictionary. Keep interpolation placeholders aligned and extend `i18n-contracts.test.ts` when adding shared product terms.
- Request locale resolution is path, then exact locale cookie, then `Accept-Language`, with English as the unsupported-language fallback. Public single-URL pages that vary by cookie or language must pair shared caching with `Vary: Cookie, Accept-Language`.
- User-facing API and task failures must resolve stable backend error codes through `error-utils.ts`; do not render backend `message` or task-event text directly.
- `/generate/prompts` and `/generate/prompts/[id]` are crawlable GPT Image 2 prompt-example pages backed by `content/generation/prompt-examples.ts`; keep static params, metadata, JSON-LD, localized visible titles, and sitemap entries aligned.
- Prompt examples distinguish source-language text from localized adaptations. Copy, apply, detail, structured-data, and sitemap surfaces must use the shared prompt-presentation helper and label the displayed language accurately.
- `/retake` is an indexable public product page with canonical metadata, sitemap coverage, public caching, and WebPage/SoftwareApplication/BreadcrumbList schema. Arbitrary private review pages remain `noindex` and private; only the canonical demo review ID may be indexed and cached publicly, while legacy demo IDs permanently redirect to it.
- `frontend/src/lib/app-route-roots.ts` is the early 404 manifest for public routes. Adding a top-level App route, Lens Notes slug, or Prompt example ID requires updating this manifest; `locale-default.test.ts` locks it to the source content collections.
- Homepage Organization/Product/WebSite/Person/FAQ schema belongs to the server-rendered `HomeStructuredData`; `[locale]/layout.tsx` must stay schema-neutral so Blog and Updates do not inherit homepage FAQ or breadcrumbs.
- `/gallery` intentionally renders a short server-visible summary before the client gallery loads; keep `GallerySeoHero`, `gallery-seo-copy.ts`, and gallery metadata in sync. Show real works before filters and the scoreboard, and keep request failures distinct from a confirmed empty collection.
- Compact navigation and browser icons use `frontend/public/brand-mark.svg`; keep the full `logo.png` for legible larger or structured-data uses.
- `frontend/public/og-product.png` is the primary 1200x630 product social preview for AI critique, AI Create, and gallery examples; update `siteConfig` and `seo-assets` coverage together if replacing it.
- `robots.ts`, `sitemap.ts`, `/sitemap-images.xml`, `/sitemap-news.xml`, `llms.txt` routes, `.well-known/llms.txt`, `frontend/public/llms.txt`, `/ai-content/*.md` Markdown mirrors, and the `/generate` SEO fallback are part of the AI-search/GEO surface. AI Markdown mirrors stay crawler-accessible but use `X-Robots-Tag: noindex, follow` plus a canonical HTTP Link to the source HTML page.
- Keep the public author profile, Editorial & Corrections Policy, Lens Notes bylines/citations, Prompt provenance, and AI markdown trust fields aligned; do not imply unsupported credentials or third-party license rights.
- `/generation-tasks/[taskId]` and `/generations/[generationId]` are private generation-flow surfaces and should remain `noindex`.
- Keep metadata titles topic-only where the root title template appends the PicSpeak brand; keep canonical URLs, locale alternates, one visible/semantic H1, structured data, and content bundle tests aligned when editing public pages.

## Environment Configuration

Backend values live in `backend/.env` and are documented by `backend/.env.example`. Important groups include:

- Database: `DATABASE_URL`
- Security/auth: `APP_SECRET`, `OAUTH_JWT_SECRET`, Clerk secrets, Google OAuth values
- Storage: `OBJECT_*`
- Critique AI: `AI_API_BASE_URL`, `AI_API_KEY`, `AI_MODEL_NAME`, `FLASH_MODEL_NAME`, `PRO_MODEL_NAME`
- OpenAI review routing: `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `OPENAI_REVIEW_*`, `RETAKE_ANALYSIS_*`
- Generation AI: `IMAGE_GENERATION_API_KEY`, `IMAGE_GENERATION_*`
- Workers/queue: `RUN_EMBEDDED_WORKER`, `REVIEW_WORKER_*`, `CLOUD_TASKS_*`
- Billing: `LEMONSQUEEZY_*`
- Frontend/CORS: `FRONTEND_ORIGIN`, `BACKEND_CORS_ORIGINS`

Frontend values live in `frontend/.env.local`; `NEXT_PUBLIC_API_URL` and site/public auth values are the most common local-edit targets.

## Development Notes

- Prefer existing route/service/helper patterns before adding new abstractions.
- Keep backend task state changes transactional and idempotent.
- Do not bypass quota, credit, or guest/auth helpers when adding new creation endpoints.
- When touching image generation, update pricing, task processor, API schemas, frontend contracts, and tests together.
- Keep normal GPT review and `retake_compare` pinned to GPT-5.6 Luna with `xhigh` reasoning unless model-specific contract tests and redacted live routing evidence are updated together.
- Retake deltas must always be calculated from the two scores produced inside the same paired request; never subtract a stored Qwen score from a GPT-5.6 Luna score.
- When touching public pages, update localized copy and SEO tests together.
- Use `serializeJsonLd()` for inline JSON-LD scripts, and reuse shared date, locale, and checkout helpers before reintroducing page-local copies.
- Treat root `DESIGN.md` as the frontend product and UI decision baseline; preserve the professional photography coach plus efficient AI tool hierarchy when changing public or workflow pages.
- Keep gallery, favorites, sharing, and export entry points visible beside an owner's critique result, including when opened from the gallery. Use `features/reviews/reviewVisibility.ts` to distinguish submission from approved public display; gallery access and share links remain independent. History gallery controls submit directly after confirmation, and disabled creation controls explain what is missing.
- Header visibility is intentionally split: `showUsageNav` and `showMobileTabs` are public navigation, while authenticated account controls still wait for hydrated non-guest user state.
- Follow `docs/changelog/CHANGELOG_WORKFLOW.md`; keep `docs/changelog/CHANGELOG.md`, `/updates` docPath anchors, homepage update hints, README links, and the external Update Logs mirror synchronized for user-facing feature work.
- Maintenance fixes stay in the changelog and all three update bundles with `showPopup: false`. Announcements require explicit `showPopup: true` on the latest record; do not fall back to an older announcement or change latest-update metadata to suppress a popup.

## Verification Checklist

Use the smallest verification set that proves the change:

- Backend route/service changes: targeted `pytest` file(s), then broader `backend/tests` when shared behavior changed
- Frontend TypeScript changes: `npm run typecheck`
- Frontend lint-sensitive changes: `npm run lint`
- Content/SEO/i18n changes: `node --test test/*.test.ts` or targeted files under `frontend/test`
- Production-facing frontend changes: `npm run build`
- Public routing, cache, metadata, schema, or sitemap changes: `npm run test:production-blog` after a successful build

If a command cannot be run locally, report exactly which command was skipped and why.
