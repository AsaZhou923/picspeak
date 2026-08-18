# PicSpeak

[English](README.md) | [简体中文](README.zh-CN.md)

[![CI](https://github.com/AsaZhou923/picspeak/actions/workflows/ci.yml/badge.svg)](https://github.com/AsaZhou923/picspeak/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**AI photography critique that turns feedback into the next shot.** PicSpeak scores composition, lighting, color, impact, and technique, explains the visible evidence, converts the weakest point into a practical retake target, and can generate a GPT Image 2 visual reference. Guest mode works without registration.

[Live product](https://www.picspeak.art/en) · [Public critique example](https://www.picspeak.art/reviews/rev_8424d4fbde054759) · [Retake Coach](https://www.picspeak.art/retake) · [Prompt library](https://www.picspeak.art/generate/prompts) · [Gallery](https://www.picspeak.art/gallery)

![PicSpeak home showing the five-dimension AI photography critique experience](docs/assets/screenshots/home.jpg)

## From critique to measurable practice

Most critique tools stop after describing one image. PicSpeak keeps the advice attached to the next attempt:

```text
Upload a photo
  -> five-dimension critique with visible evidence
  -> prioritized next-shoot action and success check
  -> upload the retake
  -> compare original and retake on one rubric
  -> save progress and generate the next visual target
```

- **Single-photo critique:** choose the backward-compatible Qwen path or GPT-5.5 through the OpenAI Responses API.
- **Retake Coach:** GPT-5.6 Terra receives the original and retake together; the server calculates every score delta deterministically.
- **AI Create:** generate visual references with GPT Image 2, including review-linked composition, lighting, color, and retake directions.
- **Learning surfaces:** move between critiques, the public gallery, Lens Notes, prompt examples, review history, and same-source retake chains.

## Product tour

| Public critique | GPT-5.6 Terra Retake Coach |
|---|---|
| ![Public critique with score, evidence, and next-shoot guidance](docs/assets/screenshots/review.jpg) | ![Retake Coach original-target-retake-compare workflow](docs/assets/screenshots/retake.jpg) |

| GPT Image 2 prompt library | Public critique gallery |
|---|---|
| ![GPT Image 2 prompt examples across photography, posters, products, UI, and experimental visuals](docs/assets/screenshots/prompts.jpg) | ![Public gallery cards with critique summaries and practice actions](docs/assets/screenshots/gallery.jpg) |

<p align="center">
  <img src="docs/assets/screenshots/mobile.jpg" alt="PicSpeak responsive mobile home and sample critique" width="320">
</p>

## Core capabilities

| Area | What it provides |
|---|---|
| Critique | Guest mode, direct object-storage upload, Flash and Pro depth, five scored dimensions, EXIF-aware evidence, sharing, export, and re-analysis |
| Practice loop | Next-shoot checklists, source-review continuity, same-photo reruns, new-photo retakes, favorites, and filtered history |
| Retake Coach | Paired original/retake evaluation, comparability and confidence handling, deterministic deltas, remaining gaps, success checks, and progress chains |
| AI Create | Template and prompt controls, quality and aspect-ratio choices, GPT Image 2 credits, review-linked references, download, reuse, and generation history |
| Public learning | 50 crawlable prompt examples, critique gallery, trilingual Lens Notes, update history, and server-rendered SEO/GEO content |
| Platform | Clerk sign-in, guest/authenticated quotas, Lemon Squeezy billing, WebSocket task updates, PostgreSQL persistence, and S3-compatible storage |

## Public routes

| Surface | URL |
|---|---|
| Product home | [picspeak.art/en](https://www.picspeak.art/en) |
| Public critique walkthrough | [/reviews/rev_8424d4fbde054759](https://www.picspeak.art/reviews/rev_8424d4fbde054759) |
| Retake Coach | [/retake](https://www.picspeak.art/retake) |
| GPT Image 2 prompt examples | [/generate/prompts](https://www.picspeak.art/generate/prompts) |
| Critique gallery | [/gallery](https://www.picspeak.art/gallery) |
| Lens Notes | [/en/blog](https://www.picspeak.art/en/blog) |
| Product updates | [/en/updates](https://www.picspeak.art/en/updates) |

## Architecture

```text
Next.js 15 / React 18
  -> direct image upload to S3-compatible storage
  -> FastAPI review and generation APIs
  -> in-process or standalone async worker
  -> Qwen-compatible critique / OpenAI Responses / GPT Image 2
  -> PostgreSQL review, task, billing, and progress records
```

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 · React 18 · TypeScript · Tailwind CSS |
| Backend | Python 3.11 · FastAPI · SQLAlchemy 2.x · Alembic |
| Database | PostgreSQL |
| Storage | S3-compatible object storage, including Cloudflare R2 or MinIO |
| Authentication | Clerk plus guest sessions and legacy Google OAuth compatibility |
| Billing | Lemon Squeezy subscriptions, activation codes, and generation credit packs |

## OpenAI Build Week 2026

PicSpeak existed before the submission window. The Build Week contribution extended the existing single-photo product into an auditable retake loop rather than only replacing a model name. The pre-event baseline is [`b74ddfb`](https://github.com/AsaZhou923/picspeak/commit/b74ddfb88ae32e37965ba8b29f40c9ebcbbf77fc); the core paired-comparison implementation landed in [`2a626aa`](https://github.com/AsaZhou923/picspeak/commit/2a626aabab30d5cdb45ca0450fdd1ce7a5387b4c).

| Before Build Week | Added during Build Week |
|---|---|
| One-photo critique | One GPT-5.6 Terra request evaluates the original and retake together |
| Five standalone scores | Before/after scores, visible evidence, and server-calculated deltas |
| Advice inferred from one image | Prioritized next-shoot actions with observable success checks |
| Recent-vs-previous history averages | Progress curves limited to the same retake chain |
| Review-linked image prompts | The paired diagnosis becomes a GPT Image 2 visual target |

Three implementation rules keep the result auditable:

1. Both photos are rescored inside the same request and rubric.
2. Python calculates all deltas; the model does not perform the arithmetic.
3. Unrelated or low-confidence pairs remain inspectable but never count as improvement.

## Local development

### Prerequisites

- Python 3.11+
- Node.js 20+ (CI uses Node.js 24)
- PostgreSQL 14+
- S3-compatible object storage
- An OpenAI-compatible critique API key
- An OpenAI API key with GPT-5.5 and GPT-5.6 Terra access for the corresponding review paths

### 1. Clone and configure the backend

```bash
git clone https://github.com/AsaZhou923/picspeak.git
cd picspeak

cp backend/.env.example backend/.env
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

The model-specific OpenAI settings are independent from the default Qwen-compatible path:

```dotenv
OPENAI_API_KEY=
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_REVIEW_MODEL=gpt-5.5
OPENAI_REVIEW_REASONING_EFFORT=medium
OPENAI_REVIEW_TIMEOUT_SECONDS=180

# Optional complete endpoint override; otherwise /responses is appended.
RETAKE_ANALYSIS_API_URL=
RETAKE_ANALYSIS_MODEL=gpt-5.6-terra
RETAKE_ANALYSIS_REASONING_EFFORT=medium
RETAKE_ANALYSIS_TIMEOUT_SECONDS=180
```

Run migrations and start the API:

```bash
cd backend
python scripts/ensure_runtime_schema.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Configure and start the frontend

```bash
cp frontend/.env.local.example frontend/.env.local
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Verify changes

```bash
# Backend, from the repository root
./.venv/bin/python -m pytest backend/tests

# Frontend
cd frontend
npm run typecheck
npm run lint
npm run test
npm run build
```

## Deployment

The frontend and backend can be deployed independently. The backend includes a container definition and can run an embedded worker or `python -m app.worker_main` as a separate process. Build and serve the frontend with `npm run build && npm run start`.

## Documentation

- [Changelog](docs/changelog/CHANGELOG.md)
- [Frontend design system](DESIGN.md)
- [SEO / GEO audit](docs/seo/seo-audit-2026-05-01.md)
- [System architecture](docs/architecture/系统架构.md)
- [Google sign-in integration](docs/guides/Google登录接入指南.md)

## Contributing

Issues and pull requests are welcome. Keep changes scoped, include the relevant tests, and preserve the privacy boundary between public demos and private user reviews.

## License

[MIT](LICENSE)
