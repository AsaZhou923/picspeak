from __future__ import annotations

import argparse
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from typing import Any

from botocore.exceptions import ClientError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import is_local_database_url, settings
from app.core.security import create_access_token
from app.db.models import (
    Photo,
    PhotoStatus,
    RateLimitCounter,
    Review,
    ReviewMode,
    ReviewStatus,
    UsageLedger,
    User,
    UserPlan,
    UserStatus,
)
from app.db.session import SessionLocal
from app.services.ai import openai_review_profile_for_mode
from app.services.ai_prompts import (
    PROMPT_VERSION,
    SCORE_PROMPT_VERSION,
    SCORE_VERSION,
    SCORER_PREPROCESS_VERSION,
)
from app.services.generation_credit_reservations import (
    PURCHASED_BALANCE_VERSION,
    available_generation_credits,
)
from app.services.object_storage import get_object_storage_client
from app.testing.fakes import (
    E2E_FAKE_FINAL_SCORE,
    assert_e2e_fake_ai_allowed,
    build_synthetic_image_bytes,
    fake_score_evidence,
)


E2E_USER_PUBLIC_ID = 'usr_e2e_smoke'
E2E_USER_EMAIL = 'e2e-smoke@example.test'
E2E_USER_USERNAME = 'e2e_photographer'
E2E_GALLERY_PHOTO_PUBLIC_ID = 'pho_e2e_gallery01'
E2E_GALLERY_REVIEW_PUBLIC_ID = 'rev_e2e_gallery01'
E2E_GALLERY_SCORE = 8.4
E2E_DB_MARKER_TABLE = '_picspeak_e2e_disposable_marker'
E2E_DB_MARKER_VALUE = 'picspeak-e2e-smoke'
E2E_GUEST_SCOPE_PREFIX = 'guest_'


def _assert_disposable_e2e_database(db) -> None:
    """Refuse to seed unless the connected DB is local and carries the runner's disposable marker."""
    assert_e2e_fake_ai_allowed()
    bind = db.get_bind()
    bind_url = getattr(bind, 'url', None)
    if bind_url is not None and not is_local_database_url(bind_url.render_as_string(hide_password=False)):
        raise RuntimeError(
            'Refusing to seed E2E fixtures: bound database engine does not target SQLite or a loopback host'
        )
    try:
        marker_row = db.execute(
            text(f'SELECT marker FROM {E2E_DB_MARKER_TABLE} WHERE marker = :marker LIMIT 1'),
            {'marker': E2E_DB_MARKER_VALUE},
        ).first()
    except SQLAlchemyError as exc:
        db.rollback()
        raise RuntimeError(
            f'Refusing to seed E2E fixtures: missing disposable database marker table {E2E_DB_MARKER_TABLE}. '
            'Run via scripts/run_e2e_smoke.mjs against a disposable E2E database.'
        ) from exc
    if marker_row is None:
        raise RuntimeError(
            f'Refusing to seed E2E fixtures: disposable database marker {E2E_DB_MARKER_VALUE!r} not found.'
        )


def _issue_e2e_registered_jwt(user: User) -> str:
    assert_e2e_fake_ai_allowed()
    return create_access_token(
        {'sub': user.public_id, 'plan': user.plan.value},
        ttl_seconds=3600,
    )


def ensure_storage_bucket() -> None:
    storage = get_object_storage_client()
    bucket = settings.object_bucket
    try:
        storage.head_bucket(Bucket=bucket)
    except ClientError as exc:
        code = str(exc.response.get('Error', {}).get('Code', ''))
        if code not in {'404', 'NoSuchBucket', 'NotFound'}:
            raise
        storage.create_bucket(Bucket=bucket)


def _upload_seeded_gallery_assets() -> tuple[str, str, bytes]:
    storage = get_object_storage_client()
    bucket = settings.object_bucket

    original_bytes, original_content_type = build_synthetic_image_bytes(
        width=320,
        height=240,
        output_format='jpeg',
        accent_rgb=(196, 146, 86),
    )
    thumbnail_bytes, thumbnail_content_type = build_synthetic_image_bytes(
        width=320,
        height=240,
        output_format='webp',
        accent_rgb=(196, 146, 86),
    )

    original_key = f'user_{E2E_USER_PUBLIC_ID}/e2e/{E2E_GALLERY_PHOTO_PUBLIC_ID}.jpg'
    thumbnail_key = f'gallery-thumbnails/{E2E_GALLERY_PHOTO_PUBLIC_ID}/512.webp'

    storage.put_object(
        Bucket=bucket,
        Key=original_key,
        Body=original_bytes,
        ContentType=original_content_type,
    )
    storage.put_object(
        Bucket=bucket,
        Key=thumbnail_key,
        Body=thumbnail_bytes,
        ContentType=thumbnail_content_type,
    )
    return original_key, thumbnail_key, original_bytes


def _reset_guest_rate_limits(db) -> int:
    # Every guest counter scope in services/guard.py starts with the literal
    # `guest_` prefix. autoescape keeps `_` from acting as a LIKE wildcard, so
    # non-guest scopes such as `guestbook_*` survive.
    return (
        db.query(RateLimitCounter)
        .filter(RateLimitCounter.scope.startswith(E2E_GUEST_SCOPE_PREFIX, autoescape=True))
        .delete(synchronize_session=False)
    )


def seed_e2e_fixtures(*, reset_guest_limits: bool = False) -> dict[str, Any]:
    assert_e2e_fake_ai_allowed()

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        _assert_disposable_e2e_database(db)
        ensure_storage_bucket()
        original_key, thumbnail_key, original_bytes = _upload_seeded_gallery_assets()

        if reset_guest_limits:
            _reset_guest_rate_limits(db)

        user = db.query(User).filter(User.public_id == E2E_USER_PUBLIC_ID).first()
        if user is None:
            user = User(
                public_id=E2E_USER_PUBLIC_ID,
                email=E2E_USER_EMAIL,
                username=E2E_USER_USERNAME,
                password_hash=None,
                plan=UserPlan.free,
                daily_quota_total=settings.free_review_limit_per_day,
                daily_quota_used=0,
                status=UserStatus.active,
                last_login_at=now,
            )
            db.add(user)
            db.flush()
        else:
            user.plan = UserPlan.free
            user.status = UserStatus.active
            user.last_login_at = now
            db.add(user)
            db.flush()

        current_credits = available_generation_credits(db, user, now=now)
        if current_credits < 20:
            db.add(
                UsageLedger(
                    user_id=user.id,
                    usage_type='image_generation_credit',
                    amount=Decimal('-20'),
                    unit='credit',
                    bill_date=now.date(),
                    metadata_json={
                        'source': 'e2e_seed',
                        'balance_version': PURCHASED_BALANCE_VERSION,
                    },
                )
            )
            db.flush()

        checksum = hashlib.sha256(original_bytes).hexdigest()
        photo = db.query(Photo).filter(Photo.public_id == E2E_GALLERY_PHOTO_PUBLIC_ID).first()
        client_meta = {
            'width': 320,
            'height': 240,
            'gallery_thumbnail_key': thumbnail_key,
            'gallery_thumbnail_size': 512,
            'gallery_thumbnail_content_type': 'image/webp',
        }
        if photo is None:
            photo = Photo(
                public_id=E2E_GALLERY_PHOTO_PUBLIC_ID,
                owner_user_id=user.id,
                upload_id='upl_e2e_gallery01',
                bucket=settings.object_bucket,
                object_key=original_key,
                content_type='image/jpeg',
                size_bytes=len(original_bytes),
                checksum_sha256=checksum,
                width=320,
                height=240,
                status=PhotoStatus.READY,
                exif_data={},
                client_meta=client_meta,
            )
            db.add(photo)
            db.flush()
        else:
            photo.owner_user_id = user.id
            photo.bucket = settings.object_bucket
            photo.object_key = original_key
            photo.content_type = 'image/jpeg'
            photo.size_bytes = len(original_bytes)
            photo.checksum_sha256 = checksum
            photo.width = 320
            photo.height = 240
            photo.status = PhotoStatus.READY
            photo.client_meta = client_meta
            db.add(photo)
            db.flush()

        profile = openai_review_profile_for_mode('flash')
        gallery_scores = {
            'composition': 9,
            'lighting': 8,
            'color': 8,
            'impact': 8,
            'technical': 9,
        }
        gallery_result_json = {
            'schema_version': '1.0',
            'prompt_version': PROMPT_VERSION,
            'score_version': SCORE_VERSION,
            'score_prompt_version': SCORE_PROMPT_VERSION,
            'model_name': profile.writer_model_name,
            'model_version': profile.writer_model_name,
            'scorer_model_name': profile.scorer_model_name,
            'scorer_model_version': profile.scorer_model_name,
            'scorer_reasoning_effort': profile.scorer_reasoning_effort,
            'writer_model_name': profile.writer_model_name,
            'writer_model_version': profile.writer_model_name,
            'writer_reasoning_effort': profile.writer_reasoning_effort,
            'scorer_preprocess_version': SCORER_PREPROCESS_VERSION,
            'score_cache_hit': False,
            'scores': gallery_scores,
            'score_evidence': fake_score_evidence(),
            'final_score': E2E_GALLERY_SCORE,
            'advantage': (
                'Layered mountain ridgelines and warm sunrise side light create unmistakable depth, '
                'crisp atmospheric separation, and disciplined tonal balance across the frame.'
            ),
            'critique': (
                'The lower-left foreground shadow sits slightly heavy and could carry a hint more '
                'leading texture to anchor the viewer eye into the valley.'
            ),
            'suggestions': (
                '1. Foreground: Step two meters right to bring the trail curve into the lower-left third.\n'
                '2. Exposure: Bracket one stop brighter for foreground texture while holding the sky highlights.'
            ),
            'image_type': 'landscape',
            'review_locale': 'en',
        }

        review = db.query(Review).filter(Review.public_id == E2E_GALLERY_REVIEW_PUBLIC_ID).first()
        if review is None:
            review = Review(
                public_id=E2E_GALLERY_REVIEW_PUBLIC_ID,
                task_id=None,
                photo_id=photo.id,
                owner_user_id=user.id,
                mode=ReviewMode.flash,
                status=ReviewStatus.SUCCEEDED,
                image_type='landscape',
                schema_version='1.0',
                result_json=gallery_result_json,
                final_score=Decimal(f'{E2E_GALLERY_SCORE:.2f}'),
                is_public=True,
                gallery_visible=True,
                gallery_audit_status='approved',
                gallery_added_at=now,
                model_name=profile.writer_model_name,
                scorer_model_name=profile.scorer_model_name,
                writer_model_name=profile.writer_model_name,
            )
            db.add(review)
        else:
            review.photo_id = photo.id
            review.owner_user_id = user.id
            review.status = ReviewStatus.SUCCEEDED
            review.deleted_at = None
            review.image_type = 'landscape'
            review.result_json = gallery_result_json
            review.final_score = Decimal(f'{E2E_GALLERY_SCORE:.2f}')
            review.is_public = True
            review.gallery_visible = True
            review.gallery_audit_status = 'approved'
            review.gallery_added_at = now
            db.add(review)

        db.commit()

        access_token = _issue_e2e_registered_jwt(user)
        return {
            'registered_user': {
                'access_token': access_token,
                'token_type': 'bearer',
                'user_id': user.public_id,
                'plan': user.plan.value,
            },
            'gallery_review_id': E2E_GALLERY_REVIEW_PUBLIC_ID,
            'gallery_score': E2E_GALLERY_SCORE,
            'expected_fake_review_score': E2E_FAKE_FINAL_SCORE,
        }
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description='Seed test-only E2E fixtures into Postgres and MinIO.')
    parser.add_argument('--output', required=True, help='Path to write JSON fixture metadata.')
    parser.add_argument(
        '--reset-guest-limits',
        action='store_true',
        help='Clear rate_limit_counters before running the E2E suite.',
    )
    args = parser.parse_args()

    fixture = seed_e2e_fixtures(reset_guest_limits=args.reset_guest_limits)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(fixture, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
