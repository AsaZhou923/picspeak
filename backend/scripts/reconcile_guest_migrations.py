"""Reconcile stranded records left on deleted guest accounts by pre-#55 migrations.

Dry-run by default: scans in a REPEATABLE READ READ ONLY transaction and prints
a JSON report without modifying anything. Every run requires an explicit
--database-url. Writes require both --execute and PICSPEAK_GUEST_RECONCILE_EXECUTE=1.

For each deleted guest that still owns photos, reviews, tasks, or practice rows,
the script inspects only trustworthy relational/storage evidence:
  - Cross-owner review/photo/task foreign keys
  - The guest's UsageLedger rows whose review or task is now owned by another user
  - Migrated photos whose object_key carries the exact ``user_<guest_public_id>/`` prefix
  - Cross-owner practice session/scene-group/attempt/feedback links

Stranded rows are moved only when every evidence source agrees on a single active,
registered (non-guest) destination account. Anything ambiguous, ineligible, or
lacking evidence is reported and left untouched.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine, exists, func, or_, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import Session, aliased  # noqa: E402

from app.api.routers.auth_support import transfer_guest_user_records  # noqa: E402
from app.db.models import (  # noqa: E402
    Photo,
    PracticeAttempt,
    PracticeFeedback,
    PracticeSceneGroup,
    PracticeSession,
    Review,
    ReviewTask,
    UsageLedger,
    User,
    UserPlan,
    UserStatus,
)

EXECUTE_ENV_FLAG = 'PICSPEAK_GUEST_RECONCILE_EXECUTE'


@dataclass(frozen=True)
class GuestReconcilePlan:
    guest_id: int
    guest_public_id: str
    status: str  # reconcilable | ambiguous | no_evidence | ineligible_target
    target_user_id: int | None
    target_public_id: str | None
    candidate_target_public_ids: list[str]
    evidence_counts: dict[str, int]
    stranded_counts: dict[str, int]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--database-url', required=True, help='Explicit PostgreSQL URL, never printed')
    parser.add_argument('--max-guests', type=int, default=200, help='Maximum deleted guests examined (1..1000)')
    parser.add_argument('--execute', action='store_true', help='Transfer uniquely resolved stranded records')
    return parser


def validate(args: argparse.Namespace) -> None:
    if make_url(args.database_url).get_backend_name() != 'postgresql':
        raise ValueError('PostgreSQL is required')
    if not 1 <= int(args.max_guests) <= 1000:
        raise ValueError('--max-guests must be between 1 and 1000')
    if args.execute and os.getenv(EXECUTE_ENV_FLAG) != '1':
        raise ValueError(f'--execute requires {EXECUTE_ENV_FLAG}=1')


def _stranded_counts(db: Session, guest_id: int) -> dict[str, int]:
    return {
        'photos': int(db.query(func.count(Photo.id)).filter(Photo.owner_user_id == guest_id).scalar() or 0),
        'reviews': int(db.query(func.count(Review.id)).filter(Review.owner_user_id == guest_id).scalar() or 0),
        'tasks': int(db.query(func.count(ReviewTask.id)).filter(ReviewTask.owner_user_id == guest_id).scalar() or 0),
        'practice_sessions': int(
            db.query(func.count(PracticeSession.id)).filter(PracticeSession.owner_user_id == guest_id).scalar() or 0
        ),
        'practice_scene_groups': int(
            db.query(func.count(PracticeSceneGroup.id)).filter(PracticeSceneGroup.owner_user_id == guest_id).scalar() or 0
        ),
        'practice_attempts': int(
            db.query(func.count(PracticeAttempt.id)).filter(PracticeAttempt.owner_user_id == guest_id).scalar() or 0
        ),
        'practice_feedback': int(
            db.query(func.count(PracticeFeedback.id)).filter(PracticeFeedback.owner_user_id == guest_id).scalar() or 0
        ),
    }


def _deleted_guests_with_stranded_records(db: Session, *, max_guests: int) -> list[User]:
    has_stranded = or_(
        exists().where(Photo.owner_user_id == User.id),
        exists().where(Review.owner_user_id == User.id),
        exists().where(ReviewTask.owner_user_id == User.id),
        exists().where(PracticeSession.owner_user_id == User.id),
        exists().where(PracticeSceneGroup.owner_user_id == User.id),
        exists().where(PracticeAttempt.owner_user_id == User.id),
        exists().where(PracticeFeedback.owner_user_id == User.id),
    )
    return (
        db.query(User)
        .filter(
            User.plan == UserPlan.guest,
            User.status == UserStatus.deleted,
            has_stranded,
        )
        .order_by(User.id.asc())
        .limit(max_guests)
        .all()
    )


def _collect_evidence(db: Session, guest: User) -> dict[str, list[int]]:
    """Collect trustworthy destination user IDs grouped by evidence signal."""
    guest_id = guest.id
    signals: dict[str, list[int]] = {}

    def record(name: str, user_ids: list[int]) -> None:
        filtered = [int(uid) for uid in user_ids if uid is not None and int(uid) != guest_id]
        if filtered:
            signals[name] = filtered

    # 1. Cross-owner Review <-> Photo / ReviewTask / Source Review links.
    review_photo_targets = [
        uid for (uid,) in (
            db.query(Review.owner_user_id)
            .join(Photo, Photo.id == Review.photo_id)
            .filter(Photo.owner_user_id == guest_id, Review.owner_user_id != guest_id)
            .all()
        )
    ] + [
        uid for (uid,) in (
            db.query(Photo.owner_user_id)
            .join(Review, Review.photo_id == Photo.id)
            .filter(Review.owner_user_id == guest_id, Photo.owner_user_id != guest_id)
            .all()
        )
    ]
    record('review_photo_fk', review_photo_targets)

    review_task_targets = [
        uid for (uid,) in (
            db.query(Review.owner_user_id)
            .join(ReviewTask, ReviewTask.id == Review.task_id)
            .filter(ReviewTask.owner_user_id == guest_id, Review.owner_user_id != guest_id)
            .all()
        )
    ] + [
        uid for (uid,) in (
            db.query(ReviewTask.owner_user_id)
            .join(Review, Review.task_id == ReviewTask.id)
            .filter(Review.owner_user_id == guest_id, ReviewTask.owner_user_id != guest_id)
            .all()
        )
    ]
    record('review_task_fk', review_task_targets)

    source_review_alias = aliased(Review)
    review_source_targets = [
        uid for (uid,) in (
            db.query(source_review_alias.owner_user_id)
            .join(Review, Review.source_review_id == source_review_alias.id)
            .filter(Review.owner_user_id == guest_id, source_review_alias.owner_user_id != guest_id)
            .all()
        )
    ] + [
        uid for (uid,) in (
            db.query(Review.owner_user_id)
            .join(source_review_alias, Review.source_review_id == source_review_alias.id)
            .filter(source_review_alias.owner_user_id == guest_id, Review.owner_user_id != guest_id)
            .all()
        )
    ]
    record('review_source_fk', review_source_targets)

    task_photo_targets = [
        uid for (uid,) in (
            db.query(ReviewTask.owner_user_id)
            .join(Photo, Photo.id == ReviewTask.photo_id)
            .filter(Photo.owner_user_id == guest_id, ReviewTask.owner_user_id != guest_id)
            .all()
        )
    ] + [
        uid for (uid,) in (
            db.query(Photo.owner_user_id)
            .join(ReviewTask, ReviewTask.photo_id == Photo.id)
            .filter(ReviewTask.owner_user_id == guest_id, Photo.owner_user_id != guest_id)
            .all()
        )
    ]
    record('task_photo_fk', task_photo_targets)

    # 2. Guest's UsageLedger rows whose review or task now belongs to another user.
    usage_review_targets = [
        uid for (uid,) in (
            db.query(Review.owner_user_id)
            .join(UsageLedger, UsageLedger.review_id == Review.id)
            .filter(UsageLedger.user_id == guest_id, Review.owner_user_id != guest_id)
            .all()
        )
    ]
    record('usage_ledger_review', usage_review_targets)

    usage_task_targets = [
        uid for (uid,) in (
            db.query(ReviewTask.owner_user_id)
            .join(UsageLedger, UsageLedger.task_id == ReviewTask.id)
            .filter(UsageLedger.user_id == guest_id, ReviewTask.owner_user_id != guest_id)
            .all()
        )
    ]
    record('usage_ledger_task', usage_task_targets)

    # 3. Migrated photos carrying the exact guest upload prefix `user_<guest_public_id>/`.
    exact_prefix = f'user_{guest.public_id}/'
    migrated_photo_prefix_targets = [
        uid for (uid,) in (
            db.query(Photo.owner_user_id)
            .filter(
                Photo.owner_user_id != guest_id,
                func.left(Photo.object_key, len(exact_prefix)) == exact_prefix,
            )
            .all()
        )
    ]
    record('migrated_photo_prefix', migrated_photo_prefix_targets)

    # 4. Cross-owner practice links.
    practice_targets: list[int] = []
    practice_targets.extend(
        uid for (uid,) in (
            db.query(Review.owner_user_id)
            .join(PracticeSession, PracticeSession.source_review_id == Review.id)
            .filter(PracticeSession.owner_user_id == guest_id, Review.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(PracticeSession.owner_user_id)
            .join(Review, PracticeSession.source_review_id == Review.id)
            .filter(Review.owner_user_id == guest_id, PracticeSession.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(Photo.owner_user_id)
            .join(PracticeSession, PracticeSession.source_photo_id == Photo.id)
            .filter(PracticeSession.owner_user_id == guest_id, Photo.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(PracticeSession.owner_user_id)
            .join(Photo, PracticeSession.source_photo_id == Photo.id)
            .filter(Photo.owner_user_id == guest_id, PracticeSession.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(PracticeSession.owner_user_id)
            .join(PracticeSceneGroup, PracticeSceneGroup.session_id == PracticeSession.id)
            .filter(PracticeSceneGroup.owner_user_id == guest_id, PracticeSession.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(PracticeSceneGroup.owner_user_id)
            .join(PracticeSession, PracticeSceneGroup.session_id == PracticeSession.id)
            .filter(PracticeSession.owner_user_id == guest_id, PracticeSceneGroup.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(PracticeSession.owner_user_id)
            .join(PracticeAttempt, PracticeAttempt.session_id == PracticeSession.id)
            .filter(PracticeAttempt.owner_user_id == guest_id, PracticeSession.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(PracticeAttempt.owner_user_id)
            .join(PracticeSession, PracticeAttempt.session_id == PracticeSession.id)
            .filter(PracticeSession.owner_user_id == guest_id, PracticeAttempt.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(PracticeSession.owner_user_id)
            .join(PracticeFeedback, PracticeFeedback.session_id == PracticeSession.id)
            .filter(PracticeFeedback.owner_user_id == guest_id, PracticeSession.owner_user_id != guest_id)
            .all()
        )
    )
    practice_targets.extend(
        uid for (uid,) in (
            db.query(PracticeFeedback.owner_user_id)
            .join(PracticeSession, PracticeFeedback.session_id == PracticeSession.id)
            .filter(PracticeSession.owner_user_id == guest_id, PracticeFeedback.owner_user_id != guest_id)
            .all()
        )
    )
    record('practice_links', practice_targets)

    return signals


def evaluate_guest_reconciliation(db: Session, guest: User) -> GuestReconcilePlan:
    stranded = _stranded_counts(db, guest.id)
    signals = _collect_evidence(db, guest)
    evidence_counts = {name: len(ids) for name, ids in sorted(signals.items())}
    candidate_ids = sorted({uid for ids in signals.values() for uid in ids})

    if not candidate_ids:
        return GuestReconcilePlan(
            guest_id=guest.id,
            guest_public_id=guest.public_id,
            status='no_evidence',
            target_user_id=None,
            target_public_id=None,
            candidate_target_public_ids=[],
            evidence_counts=evidence_counts,
            stranded_counts=stranded,
        )

    users_by_id = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(candidate_ids)).all()
    }
    candidate_public_ids = [
        users_by_id[uid].public_id if uid in users_by_id else f'unknown:{uid}'
        for uid in candidate_ids
    ]

    if len(candidate_ids) > 1:
        return GuestReconcilePlan(
            guest_id=guest.id,
            guest_public_id=guest.public_id,
            status='ambiguous',
            target_user_id=None,
            target_public_id=None,
            candidate_target_public_ids=candidate_public_ids,
            evidence_counts=evidence_counts,
            stranded_counts=stranded,
        )

    target = users_by_id.get(candidate_ids[0])
    if target is None or target.status != UserStatus.active or target.plan == UserPlan.guest:
        return GuestReconcilePlan(
            guest_id=guest.id,
            guest_public_id=guest.public_id,
            status='ineligible_target',
            target_user_id=None,
            target_public_id=None,
            candidate_target_public_ids=candidate_public_ids,
            evidence_counts=evidence_counts,
            stranded_counts=stranded,
        )

    return GuestReconcilePlan(
        guest_id=guest.id,
        guest_public_id=guest.public_id,
        status='reconcilable',
        target_user_id=target.id,
        target_public_id=target.public_id,
        candidate_target_public_ids=candidate_public_ids,
        evidence_counts=evidence_counts,
        stranded_counts=stranded,
    )


def run(args: argparse.Namespace, *, engine) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    plans: list[GuestReconcilePlan] = []
    with Session(engine, expire_on_commit=False) as db:
        db.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
        try:
            read_only = db.execute(text('SHOW transaction_read_only')).scalar_one()
            guests = _deleted_guests_with_stranded_records(db, max_guests=int(args.max_guests))
            for guest in guests:
                plans.append(evaluate_guest_reconciliation(db, guest))
        finally:
            db.rollback()

    status_counts = Counter(plan.status for plan in plans)
    report: dict[str, Any] = {
        'mode': 'execute' if args.execute else 'dry-run',
        'generated_at': now.isoformat(),
        'transaction_read_only': read_only,
        'scanned_guests': len(plans),
        'status_counts': dict(status_counts),
        'guests': [
            {
                'guest_public_id': plan.guest_public_id,
                'status': plan.status,
                'target_public_id': plan.target_public_id,
                'candidate_target_public_ids': plan.candidate_target_public_ids,
                'evidence_counts': plan.evidence_counts,
                'stranded_counts': plan.stranded_counts,
            }
            for plan in plans
        ],
    }

    if not args.execute:
        return report

    executed_outcomes: Counter[str] = Counter()
    transferred_totals: Counter[str] = Counter()
    for plan in plans:
        if plan.status != 'reconcilable' or plan.target_user_id is None:
            executed_outcomes[f'skipped_{plan.status}'] += 1
            continue
        with Session(engine, expire_on_commit=False) as db:
            guest = (
                db.query(User)
                .filter(
                    User.id == plan.guest_id,
                    User.plan == UserPlan.guest,
                    User.status == UserStatus.deleted,
                )
                .with_for_update()
                .populate_existing()
                .first()
            )
            if guest is None:
                db.rollback()
                executed_outcomes['skipped_missing_guest'] += 1
                continue

            rechecked = evaluate_guest_reconciliation(db, guest)
            if (
                rechecked.status != 'reconcilable'
                or rechecked.target_user_id != plan.target_user_id
            ):
                db.rollback()
                executed_outcomes[f'skipped_{rechecked.status}'] += 1
                continue

            target = (
                db.query(User)
                .filter(
                    User.id == rechecked.target_user_id,
                    User.status == UserStatus.active,
                    User.plan != UserPlan.guest,
                )
                .with_for_update(read=True)
                .populate_existing()
                .first()
            )
            if target is None:
                db.rollback()
                executed_outcomes['skipped_ineligible_target'] += 1
                continue

            counts = transfer_guest_user_records(
                db,
                guest_user=guest,
                target_user=target,
                mark_guest_deleted=False,
            )
            db.commit()
            executed_outcomes['reconciled'] += 1
            for key, value in counts.items():
                transferred_totals[key] += int(value)

    report['executed'] = {
        'outcomes': dict(executed_outcomes),
        'transferred': dict(transferred_totals),
    }
    return report


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        validate(args)
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        return 2

    engine = create_engine(args.database_url, connect_args={'connect_timeout': 10}, hide_parameters=True)
    try:
        report = run(args, engine=engine)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception:  # noqa: BLE001
        print('Guest migration reconciliation failed.', file=sys.stderr)
        return 1
    finally:
        engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
