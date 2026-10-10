"""Export an internal aggregate report for score feedback.

Default mode is offline and does not touch a database. Pass --database-url for
read-only DB mode. The export omits emails, IPs, tokens, photo URLs, and user
public IDs; participant pseudonyms are not needed for the aggregate v1 report.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session, aliased, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.models import (  # noqa: E402
    Photo,
    PhotoStatus,
    PracticeAttempt,
    Review,
    ReviewScoreFeedback,
    ReviewScoreSnapshot,
    ReviewStatus,
    ReviewTask,
    User,
    UserStatus,
)
from app.services.review_score_feedback import score_revision, score_snapshot_payload  # noqa: E402


PROVENANCE_KEYS = (
    'score_version',
    'score_prompt_version',
    'scorer_model_name',
    'scorer_model_version',
    'scorer_reasoning_effort',
    'scorer_preprocess_version',
)


def _empty_report(*, generated_at: datetime, mode: str) -> dict[str, Any]:
    return {
        'generated_at': generated_at.isoformat(),
        'mode': mode,
        'interpretation_boundary': (
            'Voluntary post-score user judgments; not blind human labels, MAE ground truth, '
            'or evidence that scores should be adjusted automatically.'
        ),
        'privacy_boundary': 'No emails, IPs, tokens, photo URLs, or user public IDs are exported.',
        'coverage': {
            'active_current_feedback': 0,
            'active_historical_feedback': 0,
            'withdrawn_feedback': 0,
            'excluded_deleted_reviews': 0,
            'excluded_inactive_users': 0,
            'excluded_inactive_review_owners': 0,
            'snapshots': 0,
            'reviews_with_feedback': 0,
            'eligible_current_gallery_reviews': None,
            'exposure_denominator': 'unknown',
        },
        'unknown_provenance': {key: 0 for key in PROVENANCE_KEYS},
        'by_version_mode_role': [],
    }


def build_report(db: Session) -> dict[str, Any]:
    report = _empty_report(generated_at=datetime.now(timezone.utc), mode='database')
    groups: dict[tuple[str, str, str, str, str], int] = {}
    unknown = {key: 0 for key in PROVENANCE_KEYS}
    coverage = dict(report['coverage'])

    ReviewOwner = aliased(User)
    rows = (
        db.query(ReviewScoreFeedback, ReviewScoreSnapshot, Review, User, ReviewOwner)
        .join(ReviewScoreSnapshot, ReviewScoreSnapshot.id == ReviewScoreFeedback.snapshot_id)
        .join(Review, Review.id == ReviewScoreSnapshot.review_id)
        .join(User, User.id == ReviewScoreFeedback.user_id)
        .join(ReviewOwner, ReviewOwner.id == Review.owner_user_id)
        .all()
    )
    for feedback, snapshot, review, user, review_owner in rows:
        if feedback.state == 'withdrawn':
            coverage['withdrawn_feedback'] += 1
            continue
        if review.deleted_at is not None:
            coverage['excluded_deleted_reviews'] += 1
            continue
        if review_owner.status != UserStatus.active:
            coverage['excluded_inactive_review_owners'] += 1
            continue
        if user.status != UserStatus.active:
            coverage['excluded_inactive_users'] += 1
            continue

        is_current = score_revision(review) == snapshot.revision_hash
        if is_current:
            coverage['active_current_feedback'] += 1
        else:
            coverage['active_historical_feedback'] += 1
        for key in PROVENANCE_KEYS:
            if getattr(snapshot, key) in (None, ''):
                unknown[key] += 1

        group_key = (
            snapshot.score_version or 'unknown',
            snapshot.mode or 'unknown',
            feedback.role_at_submission,
            feedback.verdict,
            'current' if is_current else 'historical',
        )
        groups[group_key] = groups.get(group_key, 0) + 1

    coverage['snapshots'] = int(db.query(func.count(ReviewScoreSnapshot.id)).scalar() or 0)
    coverage['reviews_with_feedback'] = int(
        db.query(func.count(func.distinct(ReviewScoreSnapshot.review_id)))
        .join(ReviewScoreFeedback, ReviewScoreFeedback.snapshot_id == ReviewScoreSnapshot.id)
        .scalar()
        or 0
    )
    eligible_gallery_rows = (
        db.query(Review, ReviewTask)
        .join(Photo, Photo.id == Review.photo_id)
        .join(ReviewOwner, ReviewOwner.id == Review.owner_user_id)
        .outerjoin(ReviewTask, ReviewTask.id == Review.task_id)
        .outerjoin(PracticeAttempt, PracticeAttempt.review_id == Review.id)
        .filter(
            Review.deleted_at.is_(None),
            Review.status == ReviewStatus.SUCCEEDED,
            Review.is_public == True,  # noqa: E712
            Review.gallery_visible == True,  # noqa: E712
            Review.gallery_audit_status == 'approved',
            Photo.status == PhotoStatus.READY,
            ReviewOwner.status == UserStatus.active,
            PracticeAttempt.id.is_(None),
        )
        .all()
    )
    coverage['eligible_current_gallery_reviews'] = sum(
        1
        for review, task in eligible_gallery_rows
        if score_snapshot_payload(review) is not None
        and ((task.request_payload or {}) if task is not None else {}).get('analysis_type', 'single') == 'single'
    )

    report['coverage'] = coverage
    report['unknown_provenance'] = unknown
    report['by_version_mode_role'] = [
        {
            'score_version': score_version,
            'mode': mode,
            'role': role,
            'verdict': verdict,
            'snapshot_status': snapshot_status,
            'active_feedback_count': count,
        }
        for (score_version, mode, role, verdict, snapshot_status), count in sorted(groups.items())
    ]
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--database-url', help='Explicit database URL for read-only DB mode.')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()

    if args.database_url:
        engine = create_engine(args.database_url, pool_pre_ping=True)
        SessionLocal = sessionmaker(bind=engine)
        with SessionLocal() as db:
            report = build_report(db)
        engine.dispose()
    else:
        report = _empty_report(generated_at=datetime.now(timezone.utc), mode='no_database')

    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + '\n', encoding='utf-8')
    else:
        print(payload)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
