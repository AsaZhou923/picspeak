from __future__ import annotations

from fastapi import APIRouter

from app.api.routers import analytics, auth, billing, blog, gallery, generations, photos, realtime, reviews, tasks, uploads, webhooks

router = APIRouter(prefix='/api/v1', tags=['v1'])
webhook_router = APIRouter(prefix='/api', tags=['webhooks'])

router.include_router(auth.router)
router.include_router(auth.webhooks_router)
router.include_router(uploads.router)
router.include_router(photos.router)
router.include_router(reviews.router)
router.include_router(tasks.router)
router.include_router(gallery.router)
router.include_router(generations.router)
router.include_router(blog.router)
router.include_router(billing.router)
router.include_router(analytics.router)
router.include_router(realtime.router)
router.include_router(webhooks.router)

webhook_router.include_router(webhooks.legacy_router)
