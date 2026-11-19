from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import BlogPostView
from app.schemas import BlogPostViewIncrementResponse, BlogPostViewItem, BlogPostViewsResponse
from app.services.guard import claim_daily_marker, enforce_minute_rate_limit, guest_network_scope_key

router = APIRouter(prefix='/blog', tags=['blog'])
BLOG_POST_SLUG_RE = re.compile(r'^[a-z0-9-]{1,120}$')
# Exported from the frontend blog bundles; frontend/test/blog-content.test.ts keeps it in sync.
PUBLISHED_BLOG_POST_SLUGS = frozenset(
    json.loads((Path(__file__).resolve().parents[2] / 'services' / 'blog_post_slugs.json').read_text(encoding='utf-8'))
)


def _normalize_blog_post_view_slugs(slugs: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for raw_slug in slugs or []:
        slug = raw_slug.strip().lower()
        if not slug:
            continue
        if not BLOG_POST_SLUG_RE.fullmatch(slug):
            raise api_error(status.HTTP_400_BAD_REQUEST, 'BLOG_POST_SLUG_INVALID', 'Invalid blog post slug')
        if slug in seen:
            continue
        seen.add(slug)
        normalized.append(slug)

    return normalized


@router.get('/views', response_model=BlogPostViewsResponse)
def list_blog_post_views(
    slug: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
):
    normalized_slugs = _normalize_blog_post_view_slugs(slug)
    if not normalized_slugs:
        db.commit()
        return BlogPostViewsResponse(items=[])

    rows = (
        db.query(BlogPostView)
        .filter(BlogPostView.slug.in_(normalized_slugs))
        .all()
    )
    counts = {row.slug: row.view_count for row in rows}
    db.commit()
    return BlogPostViewsResponse(
        items=[BlogPostViewItem(slug=item_slug, view_count=counts.get(item_slug, 0)) for item_slug in normalized_slugs]
    )


@router.post('/{slug}/views', response_model=BlogPostViewIncrementResponse)
def increment_blog_post_view(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
):
    normalized_slug = _normalize_blog_post_view_slugs([slug])[0]
    if normalized_slug not in PUBLISHED_BLOG_POST_SLUGS:
        raise api_error(status.HTTP_404_NOT_FOUND, 'BLOG_POST_NOT_FOUND', 'Blog post not found')

    network_key = guest_network_scope_key(request)
    if network_key:
        enforce_minute_rate_limit(
            db,
            scope='blog_view_minute',
            scope_key=network_key,
            endpoint='blog_view',
            limit=settings.blog_view_rate_limit_per_minute,
        )
        # A network counts once per post and UTC day; repeat visits read the current total.
        if not claim_daily_marker(db, scope='blog_view_day', scope_key=network_key, endpoint=normalized_slug):
            view_count = db.query(BlogPostView.view_count).filter(BlogPostView.slug == normalized_slug).scalar()
            db.commit()
            return BlogPostViewIncrementResponse(slug=normalized_slug, view_count=int(view_count or 0))

    stmt = (
        insert(BlogPostView)
        .values(slug=normalized_slug, view_count=1)
        .on_conflict_do_update(
            index_elements=[BlogPostView.slug],
            set_={
                'view_count': BlogPostView.view_count + 1,
                'updated_at': func.now(),
            },
        )
        .returning(BlogPostView.slug, BlogPostView.view_count)
    )
    row = db.execute(stmt).one()
    db.commit()
    return BlogPostViewIncrementResponse(slug=row.slug, view_count=row.view_count)
