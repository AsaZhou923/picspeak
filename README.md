# PicSpeak

[English](README.md) | [简体中文](README.zh-CN.md)

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**PicSpeak** is an AI-powered web application for photography critique and visual-reference creation. Upload a photo and receive professional AI feedback on composition, lighting, and color within seconds, then generate GPT Image 2 visual references for the next shoot. No registration is required. You can start immediately as a guest.

## OpenAI Build Week submission

| Submission item | Value |
|---|---|
| Project | PicSpeak Retake Coach |
| Track | Apps for Your Life |
| Live entry | [https://www.picspeak.art/retake](https://www.picspeak.art/retake) |
| Demo video | English 2:16 master ready; replace this text with the public YouTube URL before Devpost submission |

Retake Coach asks a more useful question than another standalone critique: **did the next shot actually improve?** It keeps the original critique and shooting target attached, evaluates the original and retake together with GPT-5.6 Terra, calculates score changes deterministically, and turns the remaining gaps into the next shoot's actions and success checks.

---

## Screenshots

| Home | Review Result |
|------|---------------|
| ![Home](docs/assets/screenshots/home.jpg) | ![Review Result](docs/assets/screenshots/review.jpg) |

| Gallery | Mobile |
|---------|--------|
| ![Gallery](docs/assets/screenshots/gallery.jpg) | ![Mobile](docs/assets/screenshots/mobile.jpg) |

### Build Week Retake Coach sample

The pair below is synthetic and public-safe. It is included so judges can exercise the upload flow without private photos or third-party rights concerns.

| Original | Retake |
|---|---|
| ![Synthetic original with tight framing and green cafe light](samples/retake-coach/original.png) | ![Synthetic retake with cleaner framing and neutral side light](samples/retake-coach/retake.png) |

---

## Features

- `Guest Mode` — Start using the app instantly without registration
- `Google Sign-In` — One-click authorization for higher usage limits
- `Direct Image Upload` — Upload files directly from the frontend to object storage without routing through the backend
- `AI Critique by Category` — Receive scoring and suggestions across composition, lighting, color, emotional impact, and technical execution for different types of photography, with both lightweight (`Flash`) and in-depth (`Pro`) modes
- `AI Create` — Generate visual references from templates, prompts, quality, ratio, and style controls using an OpenAI-compatible image generation API
- `Prompt Example Library` — Browse 50 crawlable GPT Image 2 prompt examples with output images, source attribution, localized titles, static detail pages, and workspace retake handoff
- `Retake References` — Turn critique suggestions into AI-generated composition, lighting, color, or retake reference images from a review
- `Retake Practice Loop` — Carry a concrete next-shoot action from a critique back into the workspace, preserving source review and target dimension context
- `GPT-5.6 Terra Retake Coach` — Compare an original and a newly uploaded retake in one GPT-5.6 Terra vision request, with five-dimensional score changes, visible evidence, next-shoot actions, and a saved progress chain
- `Generation History` — Browse generated images, download results, copy prompts, generate again, or send an image back to the workspace as retake inspiration
- `Image Generation Credits` — Track monthly generation credits, redeem promo credits, and purchase extra credit packs
- `Usage Quotas` — Daily and monthly limits with separate tracking for guests and registered users
- `Review History` — Browse all past critiques with pagination and filters for time range, score range, and image type
- `Real-Time Updates` — Subscribe to task progress through WebSocket without manual refresh
- `Sharing and Export` — Generate share links or export structured review data for reuse
- `Re-analysis` — Re-run analysis on a previous photo or upload a new one for another critique
- `Favorites` — Save preferred critique results and manage them from a dedicated favorites page
- `Gallery` — Showcase selected outstanding works from the community with server-visible critique summaries for public browsing and search
- `Blog` — Access professional photography tutorials, AI analysis insights, and platform updates
- `In-Task Reading` — Read full Lens Notes articles inside review and generation waiting screens without leaving the task page

## OpenAI Build Week 2026

PicSpeak existed before the Build Week submission window. The competition contribution is a meaningful extension, not a model-name replacement. The pre-event baseline is commit [`b74ddfb`](https://github.com/AsaZhou923/picspeak/commit/b74ddfb88ae32e37965ba8b29f40c9ebcbbf77fc), dated July 1, 2026.

| Before Build Week | Built during Build Week |
|---|---|
| One-photo critique | One paired GPT-5.6 evaluation of the original and retake |
| Five standalone scores | Before/after scores, deterministic deltas, and visible evidence in five dimensions |
| A source-review link for another upload | A dedicated `retake_compare` request and persisted comparison result |
| Advice inferred from a single critique | Prioritized next-shoot actions with observable success checks |
| Recent-vs-previous history averages | A progress curve built only from the same retake chain |
| Review-linked GPT Image 2 prompts | GPT-5.6's paired diagnosis becomes the GPT Image 2 visual target |
| Existing OpenAI-compatible Qwen critique path | Official OpenAI Responses API call with `model: gpt-5.6-terra`, two image inputs, and strict Structured Outputs |

### GPT-5.6 call path

The normal one-photo workspace exposes a Qwen 3.5 / GPT-5.5 model picker. Choosing GPT-5.5 sends the real image through the Responses API contract with strict Structured Outputs; Qwen remains the backward-compatible default. Retake Coach always locks paired comparison to GPT-5.6 Terra.

```text
workspace retake upload
  -> frontend/src/lib/api.ts::createReview
  -> POST /reviews (analysis_type=retake_compare)
  -> backend/app/api/routers/review_create.py
  -> backend/app/services/review_task_processor.py
  -> backend/app/services/retake_comparison.py::run_retake_comparison
  -> POST {OPENAI_API_BASE_URL}/responses (defaults to https://api.openai.com/v1/responses)
     model=gpt-5.6-terra
  -> two input_image blocks + strict JSON Schema
  -> Review.result_json.comparison
  -> RetakeComparisonPanel / RetakeProgressPanel / GPT Image 2 reference generation
```

The model scores both photos inside the same request. The server—not the model—calculates every dimension delta and overall delta before saving the result. Unrelated images are marked non-comparable and are excluded from the progress curve.

### How we collaborated with Codex

Codex was the primary Build Week development environment. It mapped PicSpeak's existing upload, asynchronous review, history, and image-generation paths before implementation; helped define the paired comparison schema and ownership boundaries; implemented the backend service and responsive interface; preserved the existing single-photo flow; added contract and regression tests; and drove desktop/mobile browser QA.

The important decisions remained explicit and reviewable:

- **Rescore the pair together.** The original may have been reviewed by an older provider, so GPT-5.6 scores both images under one rubric instead of mixing scoring systems.
- **Keep arithmetic deterministic.** GPT-5.6 supplies before/after scores and visible evidence; Python calculates all dimension deltas, means, and trend states.
- **Reuse the existing Review relationship.** `Review.source_review_id` and `result_json.comparison` keep the feature transactional without a deadline-driven parallel data model.
- **Treat uncertainty as product behavior.** Low-confidence or unrelated pairs stay reviewable but never receive an improvement badge or enter a progress curve.
- **Avoid an unnecessary SDK dependency.** The implementation reuses the existing pooled HTTP client and validates a strict schema at the application boundary.

Core implementation landed in [`2a626aa`](https://github.com/AsaZhou923/picspeak/commit/2a626aabab30d5cdb45ca0450fdd1ce7a5387b4c) on July 17, 2026. The pre-event baseline remains [`b74ddfb`](https://github.com/AsaZhou923/picspeak/commit/b74ddfb88ae32e37965ba8b29f40c9ebcbbf77fc) from July 1.

Detailed submission records, redacted model-call evidence, the video source, and the eventual Codex `/feedback` Session ID are maintained in the external PicSpeak project documentation rather than in this source repository. The immutable implementation boundary remains auditable through the linked baseline and Build Week commits above.

### How judges can test Retake Coach

1. Open the [live Retake Coach](https://www.picspeak.art/retake) and sign in with the private judge account supplied in Devpost.
2. Select the preloaded completed original critique.
3. Upload [`retake.png`](samples/retake-coach/retake.png). The matching original is [`original.png`](samples/retake-coach/original.png).
4. Confirm that the workspace labels the source as **Original**, the new upload as **Retake**, and the review model as **GPT-5.6 Terra**.
5. Run the comparison and inspect the overall change, all five dimensions, visible evidence, remaining gaps, and success checks.
6. Open the visual-reference action and confirm that its prompt is derived from the paired diagnosis.
7. Open Review History and confirm that a reliable attempt enters the same-source retake chain.

The Devpost testing field must contain the private account credentials and fallback result URL. Do not commit passwords or access tokens to this repository.

### Verification commands

```bash
# Backend
./.venv/bin/python -m pytest backend/tests

# Frontend
cd frontend
npm run typecheck
npm run lint
npm run test
npm run build
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 · React 18 · TypeScript · Tailwind CSS |
| Backend | Python 3.11 · FastAPI · SQLAlchemy 2.x |
| Database | PostgreSQL |
| Storage | S3-compatible object storage |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+
- S3-compatible object storage such as Cloudflare R2 or MinIO
- An AI API key compatible with the OpenAI API format
- An OpenAI API key with GPT-5.6 access for Retake Coach
- Optional: an OpenAI-compatible image generation endpoint and Lemon Squeezy checkout URLs for Pro and credit-pack billing

### 1. Clone the repository

```bash
git clone https://github.com/AsaZhou923/picspeak.git
cd picspeak
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and fill in the database, object storage, AI API,
# image generation, and billing settings as needed
```

Retake Coach uses the official OpenAI Responses API independently of the existing single-photo provider:

```dotenv
OPENAI_API_KEY=
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_REVIEW_MODEL=gpt-5.5
OPENAI_REVIEW_REASONING_EFFORT=medium
OPENAI_REVIEW_TIMEOUT_SECONDS=180
# Optional full endpoint override; otherwise /responses is appended to the base URL.
RETAKE_ANALYSIS_API_URL=
RETAKE_ANALYSIS_MODEL=gpt-5.6-terra
RETAKE_ANALYSIS_REASONING_EFFORT=medium
RETAKE_ANALYSIS_TIMEOUT_SECONDS=180
```

### 3. Install backend dependencies and run migrations

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
python scripts/ensure_runtime_schema.py
# Or run Alembic directly:
# alembic upgrade head
cd ..
```

### 4. Start the backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Configure and start the frontend

```bash
cp frontend/.env.local.example frontend/.env.local
# Edit frontend/.env.local and fill in NEXT_PUBLIC_API_URL and other settings

cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

Both the backend and frontend can be deployed in containers. The backend `Dockerfile` is already included in the `backend/` directory.

```bash
# Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
python -m app.worker_main   # Optional: run a separate worker process

# Frontend
cd frontend && npm run build && npm run start
```

## Documentation

- [Latest Changelog](docs/changelog/CHANGELOG.md#2026-08-09-seo-geo-authority-discovery)
- [Frontend Design System](DESIGN.md)
- [SEO / GEO Audit](docs/seo/seo-audit-2026-05-01.md)
- [System Architecture](docs/architecture/系统架构.md)
- [Google Sign-In Integration Guide](docs/guides/Google登录接入指南.md)

## Contributing

Issues and pull requests are welcome.

## License

[MIT](LICENSE)
