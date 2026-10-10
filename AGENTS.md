# AGENTS.md

This file gives coding agents project-specific guidance for working in this repository.

## Internal Documentation

- Store internal calibration protocols, scoring experiments, validation reports, review findings and release evidence in the appropriate folder under `E:\Project Code\docs\01 - Projects\PicSpeak`, outside the application repository.
- Scoring protocols and versioned validation records belong in `E:\Project Code\docs\01 - Projects\PicSpeak\05 - Testing\Scoring`.
- Apply this rule to future work as well. Do not commit or publish these internal documents with application code; keep public product documentation and user-facing changelogs in their existing repository locations.

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
- Original-to-retake comparison with mode-specific GPT-6 Sol (Flash) or GPT-6.1 Sol (Pro), deterministic per-request score deltas, evidence-backed next-shoot actions, and separate practice-round records
- Account notifications and score feedback: migrations `20261010_0012` and `20261010_0013` add notification inbox, announcement, preference, event, score snapshot, and score feedback tables. Signed-in users open `/account/notifications` through the header bell or More menu; this account route does not use a locale prefix. System messages stay on while Gallery likes and operator announcements require the user's opt-in. Notification access, capture, and processing remain controlled by rollout gates. The score-feedback contract supports private author/community feedback on visible single-photo score snapshots. These features must stay noindex/private where applicable, must not create guest identities as a side effect, and must not publish other users' score feedback, counts, or distributions. Local implementation and tests do not imply deployment, production migration, or published announcements.
- Operational health snapshots for task status, AI costs, credits, payments, and public-content audits

## Architecture

- **Frontend**: Next.js 15 App Router, React 18, TypeScript, Tailwind CSS
- **Backend**: FastAPI, SQLAlchemy 2.x, Alembic, Uvicorn
- **Database**: PostgreSQL
- **Object storage**: Cloudflare R2 / S3-compatible storage
- **AI critique**: Mode-specific photo scoring, critique writing and paired comparison through OpenAI Responses: Flash uses GPT-6 Sol with low reasoning, Pro uses GPT-6.1 Sol with high reasoning; the Qwen-compatible backend API remains available for existing clients
- **AI generation**: OpenAI-compatible image generation endpoint, task queue, credit pricing, and object-storage persistence
- **Task processing**: In-process async worker by default, optional standalone worker and Cloud Tasks configuration
- **Authentication**: Clerk plus legacy Google OAuth/guest JWT support
- **Billing**: Lemon Squeezy Pro checkout, activation codes, image credit packs, and webhooks


Current single-photo code contract: `score-v8-style-relative` / `photo-score-v8-style-relative` with mode-specific numeric scoring (Flash GPT-6 Sol/low; Pro GPT-6.1 Sol/high) and `photo-review-v9-gpt6-image-led` prose. Preserve the scoring anchors and dimension evidence; perform one independent second scoring pass for candidates >=8 without exposing the initial scores, rationale, or high-score trigger to that request. Final dimension scores still determine the arithmetic mean. Judge monochrome, restricted palettes, shadows, haze, cropping and landscape impact by their visible role; a deduction needs material harm, and a limitation field must not force invented criticism. Absence of defects alone does not earn a high score. Keep completed scoring evidence/checkpoints through writer retries. Historical gallery re-evaluation requires an explicit maintenance run; changing prompts alone does not update deployed services or stored reviews. The v8 criteria experiment (`scoring-v8-validation.md`), preceding model comparison (`scoring-v7-validation.md`) and v6 workflow experiment (`scoring-v6-optimization.md`) are stored in the external Scoring documentation directory above. Production deployment keeps OPENAI_SCORE_MODEL and OPENAI_REVIEW_MODEL at gpt-6-sol with low efforts for Flash, sets OPENAI_PRO_MODEL=gpt-6.1-sol and OPENAI_PRO_REASONING_EFFORT=high, and defaults retake analysis to gpt-6.1-sol/high while actual paired requests follow their trusted selected mode. Automatic and manual deployment update all eight overrides together. The mode split adds two Pro configuration variables and persists scorer/writer effort provenance in result_json, without a schema migration. Cache and checkpoints must match the requested model and effort; the worker uses task.mode rather than payload.mode. Paired comparisons use `retake-paired-v2` and `retake-coach-v2-gpt6-image-led`; retain historical provenance and legacy request normalization for idempotent retries.

The header inbox bell is visible only after a successful authenticated unread-count response confirms that the notification API is readable for the current identity. Keep that access confirmation across local count invalidation, revoke it for unauthorized or disabled responses, and hide it synchronously during account changes. Default-off rollout gates must not expose a broken inbox entry.

Score accuracy feedback is an internal research signal about a user's judgment of the single-photo score they saw. Bind every feedback record to a server-computed `score_revision`; require a registered non-guest account; allow modify/withdraw for the user's own record; keep author and community roles separate; never use this feedback to automatically change a score, charge quota, rank Gallery items, or claim calibrated scoring accuracy.

Announcement publication is operator-only. Use `backend/scripts/manage_announcements.py` for preview/import/status and require an explicit database URL, `--execute`, and `PICSPEAK_ANNOUNCEMENT_EXECUTE=1` for writes. Recipient targeting uses user public IDs, not internal IDs; ordinary announcements are capped at two per UTC week through a database lock; the persisted audit actor comes from the database role. Do not publish announcements, enable production notification processing, or run production migrations without separate release authorization.

Validate scoring changes with `backend/scripts/evaluate_score_calibration.py` and `scoring-calibration.md` in the external Scoring documentation directory. Synthetic fixtures and small live-model probes are diagnostic only; formal calibration requires independent human labels and a held-out test set. Keep ordinary and paired-retake scoring versions separate in growth statistics.

Authorized gallery maintenance on 2026-10-06 first reassessed 22 remaining approved, visible v5 reviews with GPT-6/v7. A separate, explicitly named set of six public v7 landscape reviews was then reassessed under v8; the earlier 22 were not rerun under v8. Private histories were preserved. `scripts/reassess_score_version.py` is gallery-only, defaults to dry-run, preserves the original review language and metadata, and fsyncs per-record backups before applying changes without charging quota. Use its explicit source-version filter and review-id allowlist; a v7 source requires a nonempty review-id allowlist before querying. Private, missing, withdrawn, or concurrently changed sources fail closed. Model settings remain unchanged. The user requested one combined announcement for the criteria update and gallery reassessment; ordinary maintenance remains silent.

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
python scripts/reassess_gallery_reviews.py  # dry-run; repeat --review-id for targeted public reviews
python scripts/reassess_score_version.py --from-score-version score-v5-evidence-calibrated  # gallery-only dry-run; --execute requires authorization
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
- `services/retake_comparison.py` - Mode-specific paired-image schema, Responses API client, deterministic deltas, and comparison normalization
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
- `features/workspace/` - Upload flow, quota display, image type and combined mode/model controls, retake source handoff, and replay context
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
3. Backend resolves both stored images and sends them together to Responses using the trusted selected mode: Flash uses gpt-6-sol/low and Pro uses gpt-6.1-sol/high, with the strict paired-comparison schema. Guest Pro restrictions and Free Pro quotas remain unchanged.
4. The selected Flash or Pro model scores both images under one rubric; the server calculates every dimension and overall delta before persisting `Review.result_json.comparison`.
5. Results appear in `RetakeComparisonPanel` and the per-round `RetakeProgressPanel`; each pair retains its own before/after scores, version, and comparability. Never sum paired deltas or join independently rescored images into an ability curve.
6. The paired diagnosis can feed the existing GPT Image 2 `review_linked` / `retake_reference` flow, but generated images never affect comparison scores.

The optional goal-practice flow is controlled by backend `PRACTICE_ENABLED` (default `false`). Its versioned contract is in `E:\Project Code\docs\01 - Projects\PicSpeak\02 - Architecture\Practice v1 合同.md`; machine-readable metric fixtures live at `backend/tests/fixtures/practice_metric_examples.json`. Accepted goals live in immutable `PracticeSession` snapshots; `PracticeAttempt` links one user attempt to one existing `ReviewTask`. Workers load trusted goals from those records and store four-state evidence in `Review.result_json.goal_assessment`. A score increase never substitutes for goal completion. Disabling the flag stops new sessions and attempts while keeping saved results readable. This describes the local code contract, not a deployed feature or a validated claim of skill improvement.

Practice analytics uses server-owned accepted/submitted/completed/feedback events and owner-validated, deduplicated visible-card events. `review_call_costs` records actual provider-call estimates, including scorer audits, failed usage, and retries; unavailable usage is null. `export_practice_analytics_report.py` is offline by default and requires an explicit database URL for DB mode; an optional eligibility manifest is required before unknown users can enter official A7/L14/W4 denominators. The account history Practice view uses cursor pagination and a separate server-wide authorized summary. Goal and Beta evaluators are offline tools under `backend/scripts/`; missing real evidence must remain `INSUFFICIENT_INVALID`, never a Beta or skill-improvement claim.

Keep execution records, evaluation protocols, and generated analytics reports in the sibling docs vault under `E:\Project Code\docs\01 - Projects\PicSpeak` (Testing, Architecture, and Analytics subfolders). Keep machine-readable test fixtures and evaluator input templates in the code repository.

Normal single-photo review uses one combined mode/model choice: Flash defaults to GPT-6 Sol for quick critique and Pro uses the stronger GPT-6.1 Sol for deeper analysis. Scoring and writing both follow the server-validated mode; client selector text cannot upgrade a Flash request to Pro. The Qwen-compatible backend route and its API default remain available for existing clients. Do not reuse one model's completed review for another model choice.

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
- Keep normal GPT review and `retake_compare` pinned to their trusted Flash (GPT-6 Sol/low) or Pro (GPT-6.1 Sol/high) profile unless model-specific contract tests and redacted live routing evidence are updated together.
- Retake deltas must always be calculated from the two scores produced inside the same paired request; never subtract independently scored or mismatched-profile images.
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

English homepage critique guidance supports the primary upload flow. Gallery uses the live public collection without fixed editorial critique cards. Editorial next-shoot actions are suggestions, never verified retake outcomes. Daily-practice related reading deliberately prioritizes the checklist and paired-retake comparison guide in every locale.
