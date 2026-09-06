from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, User, UserPlan, UserStatus  # noqa: E402
from scripts import reassess_gallery_reviews as script  # noqa: E402


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


class _Result:
    final_score = 7.2

    def model_dump(self) -> dict:
        return {
            'schema_version': '1.0',
            'scores': {'composition': 7, 'lighting': 7, 'color': 7, 'impact': 8, 'technical': 7},
            'final_score': 7.2,
            'advantage': 'Fresh strengths',
            'critique': 'Fresh critique',
            'suggestions': 'Fresh suggestions',
            'image_type': 'default',
        }


def _ai_response(*, score: float = 7.2) -> SimpleNamespace:
    result = _Result()
    result.final_score = score
    return SimpleNamespace(
        result=result,
        prompt_version='prompt-v',
        model_name='qwen-plus',
        model_version='qwen-plus-2026',
        scorer_model_name='gpt-5.6-luna',
        scorer_model_version='gpt-5.6-luna-2026',
        writer_model_name='qwen-plus',
        writer_model_version='qwen-plus-2026',
        score_prompt_version='score-prompt-v',
        scorer_preprocess_version='preprocess-v',
        score_cache_hit=False,
        input_tokens=11,
        output_tokens=22,
        cost_usd=0.0123,
        cost_rate_version='test-rates',
        latency_ms=333,
    )


def _review(public_id: str = 'rev_old') -> SimpleNamespace:
    return SimpleNamespace(
        id=101,
        public_id=public_id,
        task_id=501,
        photo_id=201,
        owner_user_id=301,
        source_review_id=401,
        mode=ReviewMode.pro,
        status=ReviewStatus.SUCCEEDED,
        image_type='default',
        schema_version='1.0',
        result_json={'score_version': 'legacy', 'billing_info': {'quota_charged': True}},
        final_score=Decimal('5.50'),
        is_public=True,
        favorite=True,
        gallery_visible=True,
        gallery_audit_status='approved',
        gallery_added_at=datetime(2026, 8, 30, tzinfo=timezone.utc),
        gallery_rejected_reason=None,
        tags_json=['featured'],
        note='gallery note',
        deleted_at=None,
        created_at=datetime(2026, 8, 29, tzinfo=timezone.utc),
        input_tokens=101,
        output_tokens=202,
        cost_usd=Decimal('0.456789'),
        cost_rate_version='historical-rates',
        latency_ms=999,
        model_name='old-model',
        scorer_model_name='old-scorer',
        writer_model_name='old-writer',
    )


def _photo() -> SimpleNamespace:
    return SimpleNamespace(
        id=201,
        public_id='pho_old',
        object_key='user_usr/2026/08/photo one.jpg',
        exif_data={'Camera': 'A7R3'},
        status=PhotoStatus.READY,
    )


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def join(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def all(self):
        return self.rows


@contextmanager
def _null_cache_lease(*args, **kwargs):
    yield None


class ReassessGalleryReviewsScriptTests(unittest.TestCase):
    def test_dry_run_counts_eligible_without_writes(self) -> None:
        db = MagicMock()
        old_review = _review()
        db.query.return_value = _Query([(old_review, _photo())])

        with patch.object(script, 'review_uses_current_full_review_contract', return_value=False):
            stats = script.reassess_gallery_reviews(db, dry_run=True)

        self.assertEqual(stats['scanned_gallery_reviews'], 1)
        self.assertEqual(stats['eligible_reviews'], 1)
        self.assertEqual(stats['pending'], 1)
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_dry_run_skips_current_reassessment_marker_and_contract(self) -> None:
        db = MagicMock()
        review = _review()
        review.result_json = {script.REASSESSMENT_METADATA_KEY: {'version': script.REASSESSMENT_VERSION}}
        db.query.return_value = _Query([(review, _photo())])

        with patch.object(script, 'review_uses_current_full_review_contract', return_value=True):
            stats = script.reassess_gallery_reviews(db, dry_run=True)

        self.assertEqual(stats['eligible_reviews'], 0)
        self.assertEqual(stats['skipped_current_contract'], 1)
        self.assertEqual(stats['skipped_reassessment_marker'], 1)

    def test_execute_updates_review_in_place_and_keeps_usage_fields_in_journal(self) -> None:
        db = MagicMock()
        old_review = _review()
        photo = _photo()
        db.query.return_value = _Query([(old_review, photo)])
        db.get_bind.return_value.dialect.name = 'sqlite'

        with tempfile.TemporaryDirectory() as tmpdir, patch.object(
            script, 'review_uses_current_full_review_contract', return_value=False
        ), patch.object(script, 'canonical_score_cache_lease', side_effect=_null_cache_lease), patch.object(
            script, 'run_ai_review', return_value=_ai_response()
        ):
            journal_path = Path(tmpdir) / 'journal.jsonl'
            stats = script.reassess_gallery_reviews(db, dry_run=False, journal_path=journal_path)
            journal_records = [json.loads(line) for line in journal_path.read_text(encoding='utf-8').splitlines()]

        self.assertEqual(stats['processed'], 1)
        self.assertEqual(stats['failed'], 0)
        self.assertEqual(old_review.public_id, 'rev_old')
        self.assertEqual(old_review.task_id, 501)
        self.assertEqual(old_review.source_review_id, 401)
        self.assertTrue(old_review.gallery_visible)
        self.assertTrue(old_review.favorite)
        self.assertEqual(old_review.gallery_added_at, datetime(2026, 8, 30, tzinfo=timezone.utc))
        self.assertEqual(old_review.note, 'gallery note')
        self.assertEqual(old_review.final_score, Decimal('7.2'))
        self.assertEqual(old_review.model_name, 'qwen-plus')
        self.assertEqual(old_review.scorer_model_name, 'gpt-5.6-luna')
        self.assertEqual(old_review.writer_model_name, 'qwen-plus')
        self.assertEqual(old_review.input_tokens, 101)
        self.assertEqual(old_review.output_tokens, 202)
        self.assertEqual(old_review.cost_usd, Decimal('0.456789'))
        self.assertEqual(old_review.cost_rate_version, 'historical-rates')
        self.assertEqual(old_review.latency_ms, 999)
        self.assertEqual(old_review.result_json['billing_info']['quota_charged'], False)
        self.assertEqual(old_review.result_json[script.REASSESSMENT_METADATA_KEY]['review_public_id'], 'rev_old')
        self.assertEqual(set(journal_records[0]['original_fields']), set(script._BACKUP_FIELDS))
        recalculated_digest = script._digest_payload(journal_records[0]['original_fields'])
        self.assertEqual(journal_records[0]['original_digest'], recalculated_digest)
        self.assertEqual(old_review.result_json[script.REASSESSMENT_METADATA_KEY]['original_digest'], recalculated_digest)
        self.assertEqual(journal_records[0]['original_fields']['final_score'], '5.50')
        self.assertEqual(journal_records[0]['new_ai_usage']['cost_rate_version'], 'test-rates')
        self.assertEqual(len(journal_records[0]['record_digest']), 64)
        db.add.assert_called_with(old_review)
        db.commit.assert_called_once()

    def test_execute_commits_successes_and_reports_later_failures(self) -> None:
        db = MagicMock()
        first_review = _review('rev_first')
        second_review = _review('rev_second')
        db.query.return_value = _Query([(first_review, _photo()), (second_review, _photo())])
        db.get_bind.return_value.dialect.name = 'sqlite'

        def review_side_effect(*args, **kwargs):
            if kwargs.get('image_url', '').endswith('photo%20one.jpg'):
                if getattr(review_side_effect, 'called', False):
                    from app.services.ai import AIReviewError

                    raise AIReviewError('writer failed', stage='writing')
                review_side_effect.called = True
                return _ai_response(score=6.8)
            return _ai_response(score=6.8)

        with tempfile.TemporaryDirectory() as tmpdir, patch.object(
            script, 'review_uses_current_full_review_contract', return_value=False
        ), patch.object(script, 'canonical_score_cache_lease', side_effect=_null_cache_lease), patch.object(
            script, 'run_ai_review', side_effect=review_side_effect
        ):
            stats = script.reassess_gallery_reviews(db, dry_run=False, journal_path=Path(tmpdir) / 'journal.jsonl')

        self.assertEqual(stats['processed'], 1)
        self.assertEqual(stats['failed'], 1)
        self.assertEqual(first_review.final_score, Decimal('6.8'))
        self.assertEqual(second_review.final_score, Decimal('5.50'))
        db.rollback.assert_called_once()


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class ReassessGalleryReviewsPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.Session = sessionmaker(bind=self.connection, autoflush=False, autocommit=False)

    def tearDown(self) -> None:
        self.connection.close()
        self.engine.dispose()

    def _insert_gallery_review(self, db) -> Review:
        suffix = uuid4().hex[:10]
        user = User(
            public_id=f'usr_rg_{suffix}',
            email=f'rg_{suffix}@example.test',
            username=f'rg_{suffix}',
            plan=UserPlan.free,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db.add(user)
        db.flush()
        photo = Photo(
            public_id=f'pho_rg_{suffix}',
            owner_user_id=user.id,
            upload_id=f'upl_rg_{suffix}',
            bucket='test',
            object_key=f'test/{suffix}.jpg',
            content_type='image/jpeg',
            size_bytes=1234,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
        )
        db.add(photo)
        db.flush()
        review = Review(
            public_id=f'rev_rg_{suffix}',
            photo_id=photo.id,
            owner_user_id=user.id,
            mode=ReviewMode.pro,
            status=ReviewStatus.SUCCEEDED,
            image_type='default',
            schema_version='1.0',
            result_json={'score_version': 'legacy'},
            final_score=Decimal('5.50'),
            is_public=True,
            favorite=True,
            gallery_visible=True,
            gallery_audit_status='approved',
            gallery_added_at=datetime(2026, 8, 30, tzinfo=timezone.utc),
            tags_json=[],
            input_tokens=100,
            output_tokens=200,
            cost_usd=Decimal('0.400000'),
            cost_rate_version='historical-rates',
            latency_ms=1000,
            model_name='old-model',
            scorer_model_name='old-scorer',
            writer_model_name='old-writer',
        )
        db.add(review)
        db.commit()
        return review

    def test_postgres_nonempty_execute_is_in_place_and_free(self) -> None:
        db = self.Session()
        try:
            review = self._insert_gallery_review(db)
            review_id = review.id
            with tempfile.TemporaryDirectory() as tmpdir, patch.object(
                script, 'review_uses_current_full_review_contract', side_effect=lambda review, writer_model_name: review.id != review_id
            ), patch.object(script, 'canonical_score_cache_lease', side_effect=_null_cache_lease), patch.object(
                script, 'run_ai_review', return_value=_ai_response()
            ):
                stats = script.reassess_gallery_reviews(
                    db,
                    dry_run=False,
                    limit=1,
                    journal_path=Path(tmpdir) / 'journal.jsonl',
                    lock_connection=self.connection,
                )
            db.expire_all()
            persisted = db.query(Review).filter(Review.id == review_id).one()
            ledgers = db.execute(text('SELECT count(*) FROM usage_ledger WHERE review_id = :review_id'), {'review_id': review_id}).scalar()
            likes = db.execute(text('SELECT count(*) FROM review_likes WHERE review_id = :review_id'), {'review_id': review_id}).scalar()

            self.assertEqual(stats['processed'], 1)
            self.assertEqual(persisted.public_id, review.public_id)
            self.assertTrue(persisted.gallery_visible)
            self.assertTrue(persisted.favorite)
            self.assertEqual(persisted.input_tokens, 100)
            self.assertEqual(persisted.cost_rate_version, 'historical-rates')
            self.assertEqual(persisted.result_json['billing_info']['quota_charged'], False)
            self.assertEqual(ledgers, 0)
            self.assertEqual(likes, 0)
        finally:
            db.close()

    def test_postgres_lock_contention_fails_fast(self) -> None:
        with self.engine.connect() as holder:
            holder.execute(text('SELECT pg_advisory_lock(:lock_key)'), {'lock_key': script._lock_key()})
            db = self.Session()
            try:
                with self.assertRaisesRegex(RuntimeError, 'already active'):
                    script.reassess_gallery_reviews(db, dry_run=False, limit=1, lock_connection=self.connection)
            finally:
                db.close()
                holder.execute(text('SELECT pg_advisory_unlock(:lock_key)'), {'lock_key': script._lock_key()})


if __name__ == '__main__':
    unittest.main()
