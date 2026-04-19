from __future__ import annotations

from fastapi import APIRouter

from .review_actions import (
    delete_review,
    enable_review_share,
    export_review,
    router as actions_router,
    update_review_meta,
)
from .review_create import create_review, router as create_router
from .review_queries import (
    get_public_review,
    get_review,
    list_my_reviews,
    list_photo_reviews,
    router as queries_router,
)
from .review_support import (
    REVIEW_NOTE_MAX_LENGTH,
    REVIEW_TAG_LIMIT,
    REVIEW_TAG_MAX_LENGTH,
    _apply_review_history_filters,
    _apply_review_history_visibility,
    _attach_billing_info,
    _build_review_export_payload,
    _build_review_extensions,
    _coerce_review_scores,
    _default_review_scores,
    _default_tonal_analysis_payload,
    _default_visual_analysis_payload,
    _find_review_owned,
    _generate_review_share_token,
    _normalize_review_note,
    _normalize_review_tags,
    _resolve_source_review,
    _review_gallery_audit_status,
    _review_history_item,
    _review_image_type,
    _review_meta_payload,
    _review_model_version,
    _review_result_payload,
    _review_share_info,
    _review_source_public_id,
)

router = APIRouter(tags=['reviews'])
router.include_router(create_router)
router.include_router(queries_router)
router.include_router(actions_router)
