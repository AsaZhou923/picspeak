from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

from app.db.models import Photo, PhotoStatus, PracticeAttempt, PracticeSession, Review, ReviewStatus, ReviewTask, TaskStatus, UserPlan
from app.services.guard import review_history_cutoff

ACCESS_AVAILABLE = 'available'
ACCESS_DELETED = 'deleted'
ACCESS_EXPIRED = 'expired'
ACCESS_PHOTO_UNAVAILABLE = 'photo_unavailable'
ACCESS_NONE = 'none'

ASSESSMENT_STATUSES = {'achieved', 'partial', 'not_achieved', 'indeterminate'}
FAILED_TASK_STATUSES = {TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER}


@dataclass(frozen=True)
class SourceAccessSummary:
    access: str
    review_public_id: str | None = None
    photo_public_id: str | None = None
    genre: str | None = None
    continue_available: bool = False


@dataclass(frozen=True)
class AttemptAccessSummary:
    assessment_status: str
    review_access: str
    task_public_id: str | None = None
    review_public_id: str | None = None
    photo_public_id: str | None = None


def owner_history_cutoff(plan: UserPlan) -> datetime | None:
    return review_history_cutoff(plan)


def review_access_status(review: Review | None, cutoff: datetime | None) -> str:
    if review is None or review.deleted_at is not None:
        return ACCESS_DELETED
    if cutoff is not None and review.created_at < cutoff:
        return ACCESS_EXPIRED
    return ACCESS_AVAILABLE


def source_access_summary(
    session: PracticeSession,
    *,
    source_review: Review | None,
    source_photo: Photo | None,
    owner_user_id: int,
    cutoff: datetime | None,
) -> SourceAccessSummary:
    review_access = review_access_status(source_review, cutoff)
    if session.owner_user_id != owner_user_id:
        return SourceAccessSummary(access=ACCESS_DELETED)
    if source_review is None or review_access != ACCESS_AVAILABLE:
        return SourceAccessSummary(access=review_access)
    if source_review.owner_user_id != owner_user_id:
        return SourceAccessSummary(access=ACCESS_DELETED)
    if source_review.status != ReviewStatus.SUCCEEDED:
        return SourceAccessSummary(access=ACCESS_DELETED)
    if source_photo is None or source_photo.owner_user_id != owner_user_id or source_photo.status != PhotoStatus.READY:
        return SourceAccessSummary(access=ACCESS_PHOTO_UNAVAILABLE)
    if source_review.photo_id != source_photo.id or session.source_photo_id != source_photo.id:
        return SourceAccessSummary(access=ACCESS_PHOTO_UNAVAILABLE)
    return SourceAccessSummary(
        access=ACCESS_AVAILABLE,
        review_public_id=source_review.public_id,
        photo_public_id=source_photo.public_id,
        genre=source_review.image_type,
        continue_available=True,
    )


def target_photo_access(attempt: PracticeAttempt, target_photo: Photo | None, owner_user_id: int) -> str:
    if target_photo is None or target_photo.owner_user_id != owner_user_id or target_photo.status != PhotoStatus.READY:
        return ACCESS_PHOTO_UNAVAILABLE
    if attempt.photo_id != target_photo.id:
        return ACCESS_PHOTO_UNAVAILABLE
    return ACCESS_AVAILABLE


def attempt_access_summary(
    attempt: PracticeAttempt,
    *,
    source_access: SourceAccessSummary,
    target_photo: Photo | None,
    task: ReviewTask | None,
    review: Review | None,
    owner_user_id: int,
    cutoff: datetime | None,
) -> AttemptAccessSummary:
    if source_access.access != ACCESS_AVAILABLE:
        return AttemptAccessSummary(assessment_status='unknown', review_access=source_access.access)
    target_access = target_photo_access(attempt, target_photo, owner_user_id)
    if target_access != ACCESS_AVAILABLE:
        return AttemptAccessSummary(assessment_status='unknown', review_access=target_access)
    if task is not None and task.owner_user_id == owner_user_id and task.status in FAILED_TASK_STATUSES:
        return AttemptAccessSummary(
            assessment_status='failed',
            review_access=ACCESS_NONE,
            task_public_id=task.public_id,
            photo_public_id=target_photo.public_id if target_photo is not None else None,
        )
    task_public_id = task.public_id if task is not None and task.owner_user_id == owner_user_id else None
    photo_public_id = target_photo.public_id if target_photo is not None else None
    if review is None:
        return AttemptAccessSummary(
            assessment_status='unknown',
            review_access=ACCESS_NONE,
            task_public_id=task_public_id,
            photo_public_id=photo_public_id,
        )
    review_access = review_access_status(review, cutoff)
    if review.owner_user_id != owner_user_id:
        return AttemptAccessSummary(assessment_status='unknown', review_access=ACCESS_DELETED)
    if review.photo_id != attempt.photo_id:
        return AttemptAccessSummary(assessment_status='unknown', review_access=ACCESS_PHOTO_UNAVAILABLE)
    if review_access != ACCESS_AVAILABLE:
        return AttemptAccessSummary(assessment_status='unknown', review_access=review_access)
    payload = review.result_json if isinstance(review.result_json, dict) else {}
    assessment = payload.get('goal_assessment')
    if isinstance(assessment, dict) and assessment.get('status') in ASSESSMENT_STATUSES:
        status_value = str(assessment['status'])
    else:
        status_value = 'unknown'
    return AttemptAccessSummary(
        assessment_status=status_value,
        review_access=review_access,
        task_public_id=task_public_id,
        review_public_id=review.public_id,
        photo_public_id=photo_public_id,
    )


def ids(values: Iterable[int | None]) -> list[int]:
    return sorted({int(value) for value in values if value is not None})


def load_reviews_by_id(db: Session, review_ids: Iterable[int], owner_user_id: int | None = None) -> dict[int, Review]:
    id_values = ids(review_ids)
    if not id_values:
        return {}
    query = db.query(Review).filter(Review.id.in_(id_values))
    if owner_user_id is not None:
        query = query.filter(Review.owner_user_id == owner_user_id)
    return {review.id: review for review in query.all()}


def load_photos_by_id(db: Session, photo_ids: Iterable[int], owner_user_id: int | None = None) -> dict[int, Photo]:
    id_values = ids(photo_ids)
    if not id_values:
        return {}
    query = db.query(Photo).filter(Photo.id.in_(id_values))
    if owner_user_id is not None:
        query = query.filter(Photo.owner_user_id == owner_user_id)
    return {photo.id: photo for photo in query.all()}


def load_tasks_by_id(db: Session, task_ids: Iterable[int], owner_user_id: int | None = None) -> dict[int, ReviewTask]:
    id_values = ids(task_ids)
    if not id_values:
        return {}
    query = db.query(ReviewTask).filter(ReviewTask.id.in_(id_values))
    if owner_user_id is not None:
        query = query.filter(ReviewTask.owner_user_id == owner_user_id)
    return {task.id: task for task in query.all()}
