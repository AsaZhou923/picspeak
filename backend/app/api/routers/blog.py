from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.errors import api_error
from app.db.models import BlogPostView
from app.schemas import BlogPostViewIncrementResponse, BlogPostViewItem, BlogPostViewsResponse

router = APIRouter(prefix='/blog', tags=['blog'])
BLOG_POST_SLUG_RE = re.compile(r'^[a-z0-9-]{1,120}$')


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
    db: Session = Depends(get_db),
):
    normalized_slug = _normalize_blog_post_view_slugs([slug])[0]
    record = (
        db.query(BlogPostView)
        .filter(BlogPostView.slug == normalized_slug)
        .first()
    )

    if record is None:
        record = BlogPostView(slug=normalized_slug, view_count=1)
        db.add(record)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            record = (
                db.query(BlogPostView)
                .filter(BlogPostView.slug == normalized_slug)
                .first()
            )
            if record is None:
                raise
            record.view_count += 1
            db.commit()
    else:
        record.view_count += 1
        db.commit()

    db.refresh(record)
    return BlogPostViewIncrementResponse(slug=record.slug, view_count=record.view_count)
