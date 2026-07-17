# Devpost submission copy

## Project name

PicSpeak Retake Coach

## One-line description

PicSpeak Retake Coach turns AI photo critique into a measurable practice loop: GPT-5.6 compares an original and a retake across five photographic dimensions, explains every change, plans the next shoot, and sends that plan to GPT Image 2 as a visual target.

## Category

Apps for Your Life

## Inspiration

Photography advice is easy to generate but difficult to validate. A photographer can receive a long critique, retake the scene, and still have no grounded answer to the question that matters: did the new shot actually improve? PicSpeak Retake Coach makes that learning loop measurable.

## What it does

Starting from an existing PicSpeak critique, the photographer uploads a retake. GPT-5.6 Terra sees the original and retake together and returns a strict, structured comparison of composition, lighting, color, emotional impact, and technical execution. PicSpeak calculates the score changes on the server, presents visible evidence for every dimension, creates prioritized next-shoot actions with success checks, and turns the diagnosis into a GPT Image 2 visual-reference brief. Comparable attempts are saved as a retake chain and visualized as a progress curve.

## How we used GPT-5.6

The backend calls the Responses API with two ordered `input_image` blocks and a strict JSON Schema. GPT-5.6 Terra scores both images inside the same request so PicSpeak never subtracts an old provider score from a new GPT-5.6 score. The model returns visible evidence and coaching language; Python deterministically computes dimension deltas, overall averages, and trend states. Non-comparable pairs are preserved with a caveat but excluded from progress curves. Normal one-photo critique separately offers GPT-5.5 alongside the established Qwen path.

## How we used Codex

Codex was the primary Build Week development environment. It mapped the pre-existing single-photo flow, designed the paired result contract, preserved backward compatibility, implemented the Responses API path and UI, found privacy and mobile-layout issues during review, added automated tests, executed a real GPT-5.6 control call, and maintained the baseline/decision/verification evidence.

## What existed before Build Week

Before the event, PicSpeak already supported single-photo critique, asynchronous review tasks, history, source-review links, and GPT Image 2 reference generation. The paired GPT-5.6 evaluation, deterministic comparison result, actionable retake coach, and same-chain progress curve were built during Build Week.

## Built with

- OpenAI Responses API, GPT-5.5, and GPT-5.6 Terra
- GPT Image 2
- Codex
- FastAPI, Pydantic, SQLAlchemy, PostgreSQL
- Next.js, React, TypeScript, Tailwind CSS

## Current submission blockers

- Preview/production deployment credentials need renewal.
- A dedicated judge account and private Devpost credentials need creation.
- Three explicitly authorized original/retake sample pairs need owner confirmation.
- The public YouTube video and `/feedback` Session ID require user-side completion.
