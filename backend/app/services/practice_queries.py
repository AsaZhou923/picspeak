from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor
from app.core.errors import api_error
from app.db.models import PracticeAttempt, PracticeSceneGroup, PracticeSession, ReviewTask
from app.practice_schemas import (
    PracticeJournalLatestAttempt,
    PracticeJournalListResponse,
    PracticeJournalSessionItem,
    PracticeJournalSourceSummary,
    PracticeJournalSummaryResponse,
    PracticeJournalTimeframe,
)
from app.services.practice_access import (
    attempt_access_summary,
    load_photos_by_id,
    load_reviews_by_id,
    load_tasks_by_id,
    owner_history_cutoff,
    source_access_summary,
)


def _encode_cursor(created_at: datetime, session_id: int) -> str:
    payload = {'created_at': created_at.isoformat(), 'id': session_id}
    raw = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode('utf-8')
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        padded = cursor + ('=' * (-len(cursor) % 4))
        payload = json.loads(base64.urlsafe_b64decode(padded.encode('ascii')).decode('utf-8'))
        created_at = datetime.fromisoformat(str(payload['created_at']))
        session_id = int(payload['id'])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_CURSOR_INVALID', 'Invalid practice cursor') from exc
    if created_at.tzinfo is None or session_id <= 0:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_CURSOR_INVALID', 'Invalid practice cursor')
    return created_at, session_id


def _goal_text(session: PracticeSession) -> str:
    snapshot = session.goal_snapshot if isinstance(session.goal_snapshot, dict) else {}
    return str(snapshot.get('goal') or '')


def _goal_dimension(session: PracticeSession) -> str:
    snapshot = session.goal_snapshot if isinstance(session.goal_snapshot, dict) else {}
    return str(snapshot.get('dimension') or 'unknown')


def _source_summary(source_access) -> PracticeJournalSourceSummary:
    return PracticeJournalSourceSummary(
        access=source_access.access,
        review_id=source_access.review_public_id,
        photo_id=source_access.photo_public_id,
        genre=source_access.genre,
    )


def _latest_attempt_summary(
    session: PracticeSession,
    latest: PracticeAttempt | None,
    source_access,
    tasks_by_id: dict[int, ReviewTask],
    reviews_by_id,
    photos_by_id,
    actor: CurrentActor,
) -> tuple[str, datetime | None, PracticeJournalLatestAttempt | None]:
    if latest is None:
        return 'unknown', None, None
    task = tasks_by_id.get(latest.task_id)
    review = reviews_by_id.get(latest.review_id) if latest.review_id else None
    photo = photos_by_id.get(latest.photo_id)
    access = attempt_access_summary(
        latest,
        source_access=source_access,
        target_photo=photo,
        task=task,
        review=review,
        owner_user_id=actor.user.id,
        cutoff=owner_history_cutoff(actor.plan),
    )
    return (
        access.assessment_status,
        latest.created_at,
        PracticeJournalLatestAttempt(
            attempt_id=latest.public_id,
            task_id=access.task_public_id,
            review_id=access.review_public_id,
            review_access=access.review_access,
            assessment_status=access.assessment_status,
            created_at=latest.created_at,
        ),
    )


def _source_access_map(sessions: list[PracticeSession], db: Session, actor: CurrentActor):
    reviews_by_id = load_reviews_by_id(db, [session.source_review_id for session in sessions], actor.user.id)
    photos_by_id = load_photos_by_id(db, [session.source_photo_id for session in sessions], actor.user.id)
    cutoff = owner_history_cutoff(actor.plan)
    return {
        session.id: source_access_summary(
            session,
            source_review=reviews_by_id.get(session.source_review_id),
            source_photo=photos_by_id.get(session.source_photo_id),
            owner_user_id=actor.user.id,
            cutoff=cutoff,
        )
        for session in sessions
    }


def _latest_attempts_for_sessions(db: Session, actor: CurrentActor, session_ids: list[int]) -> dict[int, PracticeAttempt]:
    if not session_ids:
        return {}
    ranked = (
        db.query(
            PracticeAttempt.id.label('attempt_id'),
            func.row_number()
            .over(
                partition_by=PracticeAttempt.session_id,
                order_by=(PracticeAttempt.created_at.desc(), PracticeAttempt.id.desc()),
            )
            .label('rn'),
        )
        .filter(PracticeAttempt.session_id.in_(session_ids), PracticeAttempt.owner_user_id == actor.user.id)
        .subquery()
    )
    attempts = (
        db.query(PracticeAttempt)
        .join(ranked, ranked.c.attempt_id == PracticeAttempt.id)
        .filter(ranked.c.rn == 1)
        .all()
    )
    return {attempt.session_id: attempt for attempt in attempts}


def _attempt_counts_for_sessions(db: Session, actor: CurrentActor, session_ids: list[int]) -> dict[int, int]:
    if not session_ids:
        return {}
    return {
        session_id: int(count)
        for session_id, count in db.query(PracticeAttempt.session_id, func.count(PracticeAttempt.id))
        .filter(PracticeAttempt.session_id.in_(session_ids), PracticeAttempt.owner_user_id == actor.user.id)
        .group_by(PracticeAttempt.session_id)
        .all()
    }


def _scene_groups_for_sessions(db: Session, actor: CurrentActor, session_ids: list[int]) -> dict[int, PracticeSceneGroup]:
    if not session_ids:
        return {}
    rows = (
        db.query(PracticeSceneGroup)
        .filter(PracticeSceneGroup.session_id.in_(session_ids), PracticeSceneGroup.owner_user_id == actor.user.id)
        .all()
    )
    return {row.session_id: row for row in rows}


def list_practice_journal_sessions(
    db: Session,
    actor: CurrentActor,
    *,
    lifecycle: str | None = None,
    dimension: str | None = None,
    practice_kind: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> PracticeJournalListResponse:
    limit = max(1, min(limit, 100))
    query = db.query(PracticeSession).filter(PracticeSession.owner_user_id == actor.user.id)
    if lifecycle:
        query = query.filter(PracticeSession.lifecycle == lifecycle)
    if practice_kind:
        query = query.filter(PracticeSession.practice_kind == practice_kind)
    if dimension:
        query = query.filter(PracticeSession.goal_snapshot['dimension'].astext == dimension)
    if cursor:
        cursor_created_at, cursor_id = _decode_cursor(cursor)
        query = query.filter(
            or_(
                PracticeSession.created_at < cursor_created_at,
                and_(PracticeSession.created_at == cursor_created_at, PracticeSession.id < cursor_id),
            )
        )

    rows = query.order_by(PracticeSession.created_at.desc(), PracticeSession.id.desc()).limit(limit + 1).all()
    page = rows[:limit]
    session_ids = [session.id for session in page]
    source_access_by_session_id = _source_access_map(page, db, actor)
    latest_by_session_id = _latest_attempts_for_sessions(db, actor, session_ids)
    attempt_counts = _attempt_counts_for_sessions(db, actor, session_ids)
    scene_groups = _scene_groups_for_sessions(db, actor, session_ids)
    latest_attempts = list(latest_by_session_id.values())
    latest_tasks_by_id = load_tasks_by_id(db, [attempt.task_id for attempt in latest_attempts], actor.user.id)
    latest_reviews_by_id = load_reviews_by_id(db, [attempt.review_id for attempt in latest_attempts], actor.user.id)
    latest_photos_by_id = load_photos_by_id(db, [attempt.photo_id for attempt in latest_attempts], actor.user.id)
    items: list[PracticeJournalSessionItem] = []
    for session in page:
        source_access = source_access_by_session_id[session.id]
        latest = latest_by_session_id.get(session.id)
        latest_status, latest_date, latest_attempt = _latest_attempt_summary(
            session,
            latest,
            source_access,
            latest_tasks_by_id,
            latest_reviews_by_id,
            latest_photos_by_id,
            actor,
        )
        item_date = latest_date or session.updated_at or session.created_at
        source = _source_summary(source_access)
        items.append(
            PracticeJournalSessionItem(
                session_id=session.public_id,
                lifecycle=session.lifecycle,
                practice_kind=session.practice_kind,
                goal=_goal_text(session),
                dimension=_goal_dimension(session),
                scene_group=scene_groups.get(session.id).label if scene_groups.get(session.id) is not None else None,
                source=source,
                attempt_count=attempt_counts.get(session.id, 0),
                latest_assessment_status=latest_status,
                latest_assessment_date=item_date,
                continuation_id=session.public_id if source_access.continue_available else None,
                continue_available=source_access.continue_available,
                latest_attempt=latest_attempt,
                created_at=session.created_at,
                updated_at=session.updated_at,
            )
        )

    next_cursor = _encode_cursor(page[-1].created_at, page[-1].id) if len(rows) > limit and page else None
    return PracticeJournalListResponse(items=items, next_cursor=next_cursor, limit=limit)


def get_practice_journal_summary(db: Session, actor: CurrentActor) -> PracticeJournalSummaryResponse:
    sessions = db.query(PracticeSession).filter(PracticeSession.owner_user_id == actor.user.id).all()
    session_ids = [session.id for session in sessions]
    status_counts = {'achieved': 0, 'partial': 0, 'not_achieved': 0, 'indeterminate': 0}
    unknown_count = 0
    failed_count = 0
    timeframe_values: list[datetime] = [session.created_at for session in sessions if session.created_at is not None]
    attempt_count = 0

    if session_ids:
        source_access_by_session_id = _source_access_map(sessions, db, actor)
        attempts = (
            db.query(PracticeAttempt)
            .filter(PracticeAttempt.session_id.in_(session_ids), PracticeAttempt.owner_user_id == actor.user.id)
            .all()
        )
        attempt_count = len(attempts)
        tasks_by_id = load_tasks_by_id(db, [attempt.task_id for attempt in attempts], actor.user.id)
        reviews_by_id = load_reviews_by_id(db, [attempt.review_id for attempt in attempts], actor.user.id)
        photos_by_id = load_photos_by_id(db, [attempt.photo_id for attempt in attempts], actor.user.id)
        for attempt in attempts:
            timeframe_values.append(attempt.created_at)
            access = attempt_access_summary(
                attempt,
                source_access=source_access_by_session_id[attempt.session_id],
                target_photo=photos_by_id.get(attempt.photo_id),
                task=tasks_by_id.get(attempt.task_id),
                review=reviews_by_id.get(attempt.review_id) if attempt.review_id else None,
                owner_user_id=actor.user.id,
                cutoff=owner_history_cutoff(actor.plan),
            )
            status_value = access.assessment_status
            if status_value in status_counts:
                status_counts[status_value] += 1
            elif status_value == 'failed':
                failed_count += 1
            else:
                unknown_count += 1

    return PracticeJournalSummaryResponse(
        scope='all_practice',
        timeframe=PracticeJournalTimeframe(
            start_at=min(timeframe_values) if timeframe_values else None,
            end_at=max(timeframe_values) if timeframe_values else None,
        ),
        session_count=len(sessions),
        attempt_count=attempt_count,
        sample_count=sum(status_counts.values()),
        status_counts=status_counts,
        unknown_count=unknown_count,
        indeterminate_count=status_counts['indeterminate'],
        failed_count=failed_count,
    )
