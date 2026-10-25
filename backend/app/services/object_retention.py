"""Physical retention for stored originals and generated objects.

History visibility (``review_history_cutoff``) hides old private critiques but never
removed their stored bytes. This module decides when an original or a generated
object may be deleted from object storage and performs the deletion safely:

- Photo rows, reviews, scores, comparisons and billing records are never deleted
  here. A removed original moves the photo to ``PURGED``; every creation path
  already requires ``READY``, so a purged photo cannot be reused.
- Anything with a running task, an effective public channel (share link or
  approved visible gallery listing) or an active Pro entitlement is protected.
- Every candidate is re-evaluated under a row lock immediately before deletion.

Policy approved 2026-10-25 (internal plan "私有图片访问修复与对象清理方案").
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Iterator

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.db.models import (
    BillingSubscription,
    GeneratedImage,
    ImageGenerationTask,
    Photo,
    PhotoStatus,
    Review,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.services.billing_access import current_period_ends_at, subscription_grants_pro_access
from app.services.review_visibility import review_is_public

logger = logging.getLogger(__name__)

GUEST_ORIGINAL_DAYS = 7
FREE_ORIGINAL_DAYS = 15
PRO_LAPSED_GRACE_DAYS = 15
DELETED_ACCOUNT_DAYS = 7
DELETED_REVIEW_GRACE = timedelta(hours=24)
UNCONFIRMED_UPLOAD_AGE = timedelta(hours=24)
DELETED_GENERATION_GRACE = timedelta(hours=24)
ORPHAN_OBJECT_AGE = timedelta(hours=24)
STUCK_PURGING_AGE = timedelta(hours=1)

LIVE_TASK_STATUSES = (TaskStatus.PENDING, TaskStatus.RUNNING)
PURGEABLE_PHOTO_STATUSES = (PhotoStatus.READY, PhotoStatus.UPLOADING, PhotoStatus.REJECTED)
GALLERY_THUMBNAIL_PREFIX = 'gallery-thumbnails/'
REFERENCE_INPUT_PREFIX = 'generated/reference-inputs/'
GENERATED_OUTPUT_PREFIX = 'generated/user_'
UPLOAD_PREFIX = 'user_'

# Reasons that depend on the user-facing retention policy and honour --grace-until.
POLICY_REASONS = frozenset({'guest_expired', 'free_expired', 'pro_lapsed', 'account_deleted', 'reviews_deleted'})

INVENTORY_CATEGORIES = ('orphan_upload', 'orphan_thumbnail', 'reference_input', 'orphan_generated')
ALL_CATEGORIES = ('photo_original', 'deleted_generation', *INVENTORY_CATEGORIES)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _max(*values: datetime | None) -> datetime | None:
    present = [value for value in values if value is not None]
    return max(present) if present else None


@dataclass(frozen=True)
class OwnerFacts:
    plan: UserPlan
    status: UserStatus
    updated_at: datetime | None
    pro_active: bool
    pro_ended_at: datetime | None


@dataclass(frozen=True)
class PhotoFacts:
    status: PhotoStatus
    created_at: datetime
    owner: OwnerFacts
    has_live_task: bool = False
    has_public_review: bool = False
    review_count: int = 0
    active_review_count: int = 0
    latest_active_review_at: datetime | None = None
    latest_deleted_review_at: datetime | None = None


@dataclass(frozen=True)
class Decision:
    purge: bool
    reason: str
    expires_at: datetime | None = None


def decide_photo(facts: PhotoFacts, *, now: datetime, grace_until: datetime | None = None) -> Decision:
    """Return whether a photo's stored original may be removed now, and why."""
    if facts.status not in PURGEABLE_PHOTO_STATUSES:
        return Decision(False, 'not_purgeable_status')
    if facts.has_live_task:
        return Decision(False, 'live_task')
    if facts.has_public_review:
        return Decision(False, 'public')

    created_at = _utc(facts.created_at)
    owner = facts.owner
    if facts.status != PhotoStatus.READY:
        expires_at, reason = created_at + UNCONFIRMED_UPLOAD_AGE, 'unconfirmed_upload'
    elif facts.review_count > 0 and facts.active_review_count == 0:
        # Every critique of this photo was deleted by its owner.
        expires_at = _utc(facts.latest_deleted_review_at or created_at) + DELETED_REVIEW_GRACE
        reason = 'reviews_deleted'
    elif owner.plan == UserPlan.guest:
        if owner.status == UserStatus.deleted:
            # Guest accounts are marked deleted after a sign-up migration that may have
            # skipped records (GitHub issue #55). Keep them until that is resolved.
            return Decision(False, 'guest_migration_pending')
        activity = _max(created_at, _utc(facts.latest_active_review_at))
        expires_at, reason = activity + timedelta(days=GUEST_ORIGINAL_DAYS), 'guest_expired'
    elif owner.status == UserStatus.deleted:
        deleted_at = _utc(owner.updated_at) or created_at
        expires_at, reason = deleted_at + timedelta(days=DELETED_ACCOUNT_DAYS), 'account_deleted'
    elif owner.pro_active:
        return Decision(False, 'pro_active')
    else:
        activity = _max(created_at, _utc(facts.latest_active_review_at))
        expires_at, reason = activity + timedelta(days=FREE_ORIGINAL_DAYS), 'free_expired'
        pro_ended_at = _utc(owner.pro_ended_at)
        if pro_ended_at is not None and pro_ended_at + timedelta(days=PRO_LAPSED_GRACE_DAYS) > expires_at:
            expires_at, reason = pro_ended_at + timedelta(days=PRO_LAPSED_GRACE_DAYS), 'pro_lapsed'

    if grace_until is not None and reason in POLICY_REASONS and expires_at < grace_until:
        expires_at = grace_until
    if expires_at > now:
        return Decision(False, 'within_retention', expires_at)
    return Decision(True, reason, expires_at)


def _owner_facts(db: Session, user_ids: Iterable[int], *, now: datetime) -> dict[int, OwnerFacts]:
    ids = sorted(set(user_ids))
    if not ids:
        return {}
    subscriptions: dict[int, list[BillingSubscription]] = defaultdict(list)
    for subscription in db.query(BillingSubscription).filter(BillingSubscription.user_id.in_(ids)).all():
        subscriptions[subscription.user_id].append(subscription)
    owners: dict[int, OwnerFacts] = {}
    for user in db.query(User).filter(User.id.in_(ids)).all():
        items = subscriptions.get(user.id, [])
        active = any(subscription_grants_pro_access(item, now=now) for item in items)
        ended = None
        if not active:
            ended = _max(*(_utc(current_period_ends_at(item)) or _utc(item.updated_at) for item in items))
        owners[user.id] = OwnerFacts(
            plan=user.plan, status=user.status, updated_at=_utc(user.updated_at),
            pro_active=active, pro_ended_at=ended,
        )
    return owners


def _live_task_photo_ids(db: Session, photo_ids: list[int]) -> set[int]:
    live: set[int] = set()
    source_review_ids: set[int] = set()
    for photo_id, payload in (
        db.query(ReviewTask.photo_id, ReviewTask.request_payload)
        .filter(ReviewTask.status.in_(LIVE_TASK_STATUSES))
        .all()
    ):
        live.add(photo_id)
        source_id = (payload or {}).get('source_review_internal_id')
        if isinstance(source_id, int):
            source_review_ids.add(source_id)
    if source_review_ids:
        live.update(photo_id for (photo_id,) in db.query(Review.photo_id).filter(Review.id.in_(source_review_ids)).all())
    live.update(
        photo_id for (photo_id,) in db.query(ImageGenerationTask.source_photo_id)
        .filter(ImageGenerationTask.status.in_(LIVE_TASK_STATUSES), ImageGenerationTask.source_photo_id.isnot(None))
        .all()
    )
    wanted = set(photo_ids)
    return live & wanted


def collect_photo_facts(db: Session, photos: list[Photo], *, now: datetime) -> dict[int, PhotoFacts]:
    if not photos:
        return {}
    photo_ids = [photo.id for photo in photos]
    reviews: dict[int, list[Review]] = defaultdict(list)
    for review in db.query(Review).filter(Review.photo_id.in_(photo_ids)).all():
        reviews[review.photo_id].append(review)
    live = _live_task_photo_ids(db, photo_ids)
    owners = _owner_facts(db, (photo.owner_user_id for photo in photos), now=now)

    facts: dict[int, PhotoFacts] = {}
    for photo in photos:
        items = reviews.get(photo.id, [])
        active = [item for item in items if item.deleted_at is None]
        facts[photo.id] = PhotoFacts(
            status=photo.status,
            created_at=_utc(photo.created_at),
            owner=owners[photo.owner_user_id],
            has_live_task=photo.id in live,
            has_public_review=any(review_is_public(item) for item in active),
            review_count=len(items),
            active_review_count=len(active),
            latest_active_review_at=_max(*(_utc(item.created_at) for item in active)),
            latest_deleted_review_at=_max(*(_utc(item.deleted_at) for item in items if item.deleted_at is not None)),
        )
    return facts


def iter_photo_decisions(
    db: Session, *, now: datetime, grace_until: datetime | None = None, batch_size: int = 500,
) -> Iterator[tuple[Photo, Decision]]:
    """Yield a decision for every photo whose original still exists."""
    last_id = 0
    while True:
        photos = (
            db.query(Photo)
            .filter(
                Photo.id > last_id,
                Photo.status.in_(PURGEABLE_PHOTO_STATUSES),
                Photo.created_at < now - UNCONFIRMED_UPLOAD_AGE,
            )
            .order_by(Photo.id)
            .limit(batch_size)
            .all()
        )
        if not photos:
            return
        facts = collect_photo_facts(db, photos, now=now)
        for photo in photos:
            yield photo, decide_photo(facts[photo.id], now=now, grace_until=grace_until)
        last_id = photos[-1].id


def _is_missing(exc: Exception) -> bool:
    response = getattr(exc, 'response', None) or {}
    code = str(response.get('Error', {}).get('Code', ''))
    return code in {'404', 'NoSuchKey', 'NotFound'}


def _head_size(storage: Any, bucket: str, key: str) -> int | None:
    try:
        return int(storage.head_object(Bucket=bucket, Key=key).get('ContentLength') or 0)
    except Exception as exc:  # noqa: BLE001 - a missing object is a normal outcome
        if _is_missing(exc):
            return None
        raise


def _list_keys(storage: Any, bucket: str, prefix: str) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    token = None
    while True:
        kwargs = {'Bucket': bucket, 'Prefix': prefix}
        if token:
            kwargs['ContinuationToken'] = token
        page = storage.list_objects_v2(**kwargs)
        objects.extend(page.get('Contents', []) or [])
        if not page.get('IsTruncated'):
            return objects
        token = page.get('NextContinuationToken')


@dataclass
class PurgeOutcome:
    status: str  # purged | already_missing | skipped | failed
    reason: str
    bytes_removed: int = 0


def admit_photo_use(db: Session, photo_id: int, *, require_ready: bool = True) -> Photo | None:
    """Lock a photo row in share mode until the caller's transaction ends.

    Purges take FOR UPDATE while deciding and committing PURGING. A task, share
    link or gallery listing registered under this lock is therefore either seen by
    the purge decision or sees the photo already leaving READY.
    """
    photo = db.query(Photo).filter(Photo.id == photo_id).with_for_update(read=True).populate_existing().first()
    if require_ready and (photo is None or photo.status != PhotoStatus.READY):
        if photo is not None and photo.status in (PhotoStatus.PURGING, PhotoStatus.PURGED):
            raise api_error(410, 'PHOTO_ORIGINAL_EXPIRED', 'The stored original was removed under the retention policy')
        raise api_error(400, 'PHOTO_NOT_READY', 'Photo is not ready')
    return photo


def _finish_purge(db: Session, storage: Any, photo: Photo, *, now: datetime, reason: str, removed: int, existed: bool) -> PurgeOutcome:
    # The original is gone from here on, so the photo must never return to READY.
    photo.status = PhotoStatus.PURGED
    photo.original_purge_reason = reason
    photo.original_purged_at = now
    db.add(photo)
    db.commit()
    # Thumbnails are derived copies; one that fails to delete is left to the orphan_thumbnail scan.
    try:
        for item in _list_keys(storage, photo.bucket, f'{GALLERY_THUMBNAIL_PREFIX}{photo.public_id}/'):
            storage.delete_object(Bucket=photo.bucket, Key=item['Key'])
            removed += int(item.get('Size') or 0)
    except Exception:  # noqa: BLE001
        logger.warning('Failed to delete gallery thumbnails for photo %s', photo.public_id, exc_info=True)
    return PurgeOutcome('purged' if existed else 'already_missing', reason, removed)


def purge_photo_original(
    db: Session, storage: Any, photo_id: int, *, now: datetime, grace_until: datetime | None = None,
) -> PurgeOutcome:
    """Remove one photo's original and gallery thumbnails after re-checking the policy.

    Only READY photos pass through PURGING, so a stalled PURGING photo was READY
    before and returns to READY if anything protects it now. Unconfirmed and
    rejected uploads cannot be admitted for work or made public and are removed directly.
    """
    photo = db.query(Photo).filter(Photo.id == photo_id).with_for_update().populate_existing().first()
    if photo is None:
        db.rollback()
        return PurgeOutcome('skipped', 'photo_missing')
    if photo.status not in (*PURGEABLE_PHOTO_STATUSES, PhotoStatus.PURGING):
        db.rollback()
        return PurgeOutcome('skipped', 'not_purgeable_status')

    try:
        size = _head_size(storage, photo.bucket, photo.object_key)
    except Exception:  # noqa: BLE001
        logger.warning('Failed to inspect original for photo %s', photo.public_id, exc_info=True)
        db.rollback()
        return PurgeOutcome('failed', 'storage_unavailable')

    resuming = photo.status == PhotoStatus.PURGING
    if resuming and size is None:
        # A previous run deleted the original and stopped before recording it.
        return _finish_purge(db, storage, photo, now=now, reason=photo.original_purge_reason or 'resumed', removed=0, existed=False)

    facts = collect_photo_facts(db, [photo], now=now)[photo.id]
    if resuming:
        facts = replace(facts, status=PhotoStatus.READY)
    decision = decide_photo(facts, now=now, grace_until=grace_until)
    if not decision.purge:
        if resuming:
            photo.status = PhotoStatus.READY
            photo.original_purge_reason = None
            db.add(photo)
            db.commit()
        else:
            db.rollback()
        return PurgeOutcome('skipped', decision.reason)

    if photo.status == PhotoStatus.READY:
        photo.status = PhotoStatus.PURGING
        photo.original_purge_reason = decision.reason
        db.add(photo)
        db.commit()

    if size is not None:
        try:
            storage.delete_object(Bucket=photo.bucket, Key=photo.object_key)
        except Exception:  # noqa: BLE001 - the original still exists, so the photo stays usable
            logger.warning('Failed to delete original for photo %s', photo.public_id, exc_info=True)
            db.rollback()
            if photo.status == PhotoStatus.PURGING:
                photo = db.query(Photo).filter(Photo.id == photo_id).first()
                photo.status = PhotoStatus.READY
                photo.original_purge_reason = None
                db.add(photo)
                db.commit()
            return PurgeOutcome('failed', decision.reason)
    return _finish_purge(db, storage, photo, now=now, reason=decision.reason, removed=size or 0, existed=size is not None)


def stuck_purging_photo_ids(db: Session, *, now: datetime) -> list[int]:
    return [
        photo_id for (photo_id,) in db.query(Photo.id)
        .filter(Photo.status == PhotoStatus.PURGING, Photo.updated_at < now - STUCK_PURGING_AGE)
        .order_by(Photo.id)
        .all()
    ]


def deleted_generation_candidates(db: Session, *, now: datetime) -> list[GeneratedImage]:
    return (
        db.query(GeneratedImage)
        .filter(
            GeneratedImage.deleted_at.isnot(None),
            GeneratedImage.deleted_at < now - DELETED_GENERATION_GRACE,
            GeneratedImage.object_purged_at.is_(None),
        )
        .order_by(GeneratedImage.id)
        .all()
    )


def purge_deleted_generation(db: Session, storage: Any, image_id: int, *, now: datetime) -> PurgeOutcome:
    image = db.query(GeneratedImage).filter(GeneratedImage.id == image_id).with_for_update().first()
    if image is None or image.deleted_at is None or image.object_purged_at is not None:
        db.rollback()
        return PurgeOutcome('skipped', 'not_deleted')
    shared = (
        db.query(GeneratedImage.id)
        .filter(
            GeneratedImage.id != image.id,
            GeneratedImage.object_bucket == image.object_bucket,
            GeneratedImage.object_key == image.object_key,
            GeneratedImage.deleted_at.is_(None),
        )
        .first()
    )
    if shared is not None:
        db.rollback()
        return PurgeOutcome('skipped', 'object_shared')
    try:
        size = _head_size(storage, image.object_bucket, image.object_key)
        if size is not None:
            storage.delete_object(Bucket=image.object_bucket, Key=image.object_key)
    except Exception:  # noqa: BLE001
        logger.warning('Failed to purge generated image %s', image.public_id, exc_info=True)
        db.rollback()
        return PurgeOutcome('failed', 'deleted_generation')
    image.object_purged_at = now
    db.add(image)
    db.commit()
    return PurgeOutcome('purged' if size is not None else 'already_missing', 'deleted_generation', size or 0)


@dataclass
class InventoryItem:
    category: str
    key: str
    size: int
    etag: str
    last_modified: datetime


@dataclass
class InventoryReport:
    candidates: list[InventoryItem] = field(default_factory=list)
    kept: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    unknown_prefix: dict[str, int] = field(default_factory=lambda: defaultdict(int))


def _first_segment(key: str, prefix: str) -> str:
    return key[len(prefix):].split('/', 1)[0]


def _photo_key_is_live(db: Session, bucket: str, key: str) -> bool:
    return db.query(Photo.id).filter(
        Photo.bucket == bucket, Photo.object_key == key, Photo.status != PhotoStatus.PURGED,
    ).first() is not None


def _thumbnail_is_orphan(db: Session, photo_public_id: str) -> bool:
    status = db.query(Photo.status).filter(Photo.public_id == photo_public_id).scalar()
    return status is None or status == PhotoStatus.PURGED


def _generated_key_is_live(db: Session, bucket: str, key: str) -> bool:
    return db.query(GeneratedImage.id).filter(
        GeneratedImage.object_bucket == bucket,
        GeneratedImage.object_key == key,
        GeneratedImage.object_purged_at.is_(None),
    ).first() is not None


def _reference_input_is_done(db: Session, task_public_id: str, *, now: datetime) -> bool:
    row = (
        db.query(ImageGenerationTask.status, ImageGenerationTask.updated_at)
        .filter(ImageGenerationTask.public_id == task_public_id)
        .first()
    )
    if row is None:
        return True
    status, updated_at = row
    return status not in LIVE_TASK_STATUSES and (_utc(updated_at) or now) < now - ORPHAN_OBJECT_AGE


def classify_object(db: Session, bucket: str, key: str, *, now: datetime) -> str | None:
    """Return the deletion category of an unreferenced object, or None to keep it."""
    if key.startswith(UPLOAD_PREFIX):
        return None if _photo_key_is_live(db, bucket, key) else 'orphan_upload'
    if key.startswith(GALLERY_THUMBNAIL_PREFIX):
        return 'orphan_thumbnail' if _thumbnail_is_orphan(db, _first_segment(key, GALLERY_THUMBNAIL_PREFIX)) else None
    if key.startswith(REFERENCE_INPUT_PREFIX):
        task_id = _first_segment(key, REFERENCE_INPUT_PREFIX)
        return 'reference_input' if _reference_input_is_done(db, task_id, now=now) else None
    if key.startswith(GENERATED_OUTPUT_PREFIX):
        return None if _generated_key_is_live(db, bucket, key) else 'orphan_generated'
    return 'unknown_prefix'


def scan_inventory(db: Session, storage: Any, bucket: str, *, now: datetime) -> InventoryReport:
    report = InventoryReport()
    for item in _list_keys(storage, bucket, ''):
        key = item['Key']
        last_modified = _utc(item.get('LastModified')) or now
        category = classify_object(db, bucket, key, now=now)
        if category == 'unknown_prefix':
            report.unknown_prefix[key.split('/', 1)[0]] += 1
            continue
        if category is None:
            report.kept['referenced'] += 1
            continue
        if last_modified > now - ORPHAN_OBJECT_AGE:
            report.kept['too_recent'] += 1
            continue
        report.candidates.append(InventoryItem(
            category=category, key=key, size=int(item.get('Size') or 0),
            etag=str(item.get('ETag') or ''), last_modified=last_modified,
        ))
    return report


def purge_inventory_item(db: Session, storage: Any, bucket: str, item: InventoryItem, *, now: datetime) -> PurgeOutcome:
    """Delete one unreferenced object if it is still unreferenced and unchanged."""
    if classify_object(db, bucket, item.key, now=now) != item.category:
        db.rollback()
        return PurgeOutcome('skipped', 'now_referenced')
    try:
        head = storage.head_object(Bucket=bucket, Key=item.key)
    except Exception as exc:  # noqa: BLE001
        if _is_missing(exc):
            return PurgeOutcome('already_missing', item.category)
        return PurgeOutcome('failed', item.category)
    if str(head.get('ETag') or '') != item.etag:
        return PurgeOutcome('skipped', 'object_changed')
    try:
        storage.delete_object(Bucket=bucket, Key=item.key)
    except Exception:  # noqa: BLE001
        logger.warning('Failed to delete unreferenced object %s', item.key, exc_info=True)
        return PurgeOutcome('failed', item.category)
    finally:
        db.rollback()
    return PurgeOutcome('purged', item.category, item.size)


def guest_photos_pending_purge(db: Session, user_ids: list[int]) -> set[int]:
    """Guests whose stored originals still exist; deleting their rows would orphan the objects."""
    if not user_ids:
        return set()
    return {
        owner_id for (owner_id,) in db.query(Photo.owner_user_id)
        .filter(Photo.owner_user_id.in_(user_ids), Photo.status != PhotoStatus.PURGED)
        .group_by(Photo.owner_user_id)
        .all()
    }

