from __future__ import annotations

from sqlalchemy import and_, func, or_

from app.db.models import Review


def review_has_gallery_public_channel(review: Review) -> bool:
    return (
        bool(getattr(review, 'gallery_visible', False))
        and str(getattr(review, 'gallery_audit_status', '') or '').strip().lower() == 'approved'
        and getattr(review, 'deleted_at', None) is None
    )


def review_has_share_public_channel(review: Review) -> bool:
    token = getattr(review, 'share_token', None)
    return isinstance(token, str) and bool(token.strip()) and getattr(review, 'deleted_at', None) is None


def review_is_public(review: Review) -> bool:
    """Effective public access, independent of the denormalized is_public flag."""
    return review_has_gallery_public_channel(review) or review_has_share_public_channel(review)


def public_review_filter():
    """SQL equivalent of review_is_public for history and access queries."""
    return and_(
        Review.deleted_at.is_(None),
        or_(
            and_(Review.share_token.isnot(None), func.length(func.trim(Review.share_token)) > 0),
            and_(
                Review.gallery_visible.is_(True),
                func.lower(func.trim(Review.gallery_audit_status)) == 'approved',
            ),
        ),
    )


def retained_review_filter(cutoff):
    return or_(Review.created_at >= cutoff, public_review_filter())
