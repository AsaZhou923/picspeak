from __future__ import annotations

from contextlib import contextmanager, redirect_stdout
from datetime import datetime, timezone
from decimal import Decimal
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import (  # noqa: E402
    Photo,
    PhotoStatus,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from scripts import reassess_score_version as script  # noqa: E402


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


class _Result:
    final_score = 7.6
    scorer_reasoning_effort = 'low'
    writer_reasoning_effort = 'low'

    def model_dump(self) -> dict:
        return {
            'schema_version': '1.0',
            'scores': {'composition': 8, 'lighting': 7, 'color': 8, 'impact': 8, 'technical': 7},
            'score_version': script.SCORE_VERSION,
            'final_score': self.final_score,
            'advantage': 'Fresh strengths',
            'critique': 'Fresh critique',
            'suggestions': 'Fresh suggestions',
            'image_type': 'default',
        }


def _ai_response(*, score: float = 7.6) -> SimpleNamespace:
    result = _Result()
    result.final_score = score
    return SimpleNamespace(
        result=result,
        prompt_version='photo-review-v9-gpt6-image-led',
        model_name='gpt-6-sol',
        model_version='gpt-6-sol-2026',
        scorer_model_name='gpt-6-sol',
        scorer_model_version='gpt-6-sol-2026',
        writer_model_name='gpt-6-sol',
        writer_model_version='gpt-6-sol-2026',
        score_prompt_version='photo-score-v8-style-relative',
        scorer_preprocess_version='preprocess-v7',
        score_cache_hit=False,
        input_tokens=123,
        output_tokens=45,
        cost_usd=0.01,
        cost_rate_version='openai:gpt-6-sol:test',
        writer_input_tokens=23,
        writer_output_tokens=17,
        writer_cost_usd=0.002,
        writer_cost_rate_version='openai:gpt-6-sol:test',
        latency_ms=4567,
    )


def _review(public_id: str = 'rev_old') -> SimpleNamespace:
    return SimpleNamespace(
        id=101,
        public_id=public_id,
        task_id=501,
        photo_id=201,
        owner_user_id=301,
        source_review_id=None,
        mode=ReviewMode.flash,
        status=ReviewStatus.SUCCEEDED,
        image_type='default',
        schema_version='1.0',
        result_json={
            'score_version': script.SOURCE_SCORE_VERSION_V5,
            'final_score': 6.2,
            'billing_info': {'quota_charged': True},
        },
        final_score=Decimal('6.20'),
        is_public=True,
        favorite=True,
        gallery_visible=True,
        gallery_audit_status=script.GALLERY_AUDIT_APPROVED,
        gallery_added_at=datetime(2026, 9, 2, tzinfo=timezone.utc),
        gallery_rejected_reason=None,
        tags_json=['keep'],
        note='private note',
        deleted_at=None,
        created_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        input_tokens=1000,
        output_tokens=200,
        cost_usd=Decimal('0.123456'),
        cost_rate_version='old-rates',
        latency_ms=999,
        model_name='qwen-old',
        scorer_model_name='gpt-5.6-luna',
        writer_model_name='qwen-old',
    )


def _photo() -> SimpleNamespace:
    return SimpleNamespace(
        id=201,
        public_id='pho_old',
        bucket='private-test-bucket',
        object_key='user_usr/2026/09/photo one.jpg',
        exif_data={'Camera': 'A7R3'},
        status=PhotoStatus.READY,
    )


def _task(*, locale: str = 'ja') -> SimpleNamespace:
    return SimpleNamespace(
        id=501,
        public_id='tsk_old',
        status=TaskStatus.SUCCEEDED,
        request_payload={'locale': locale, 'review_model': 'gpt-5.6-luna'},
    )


class _Query:
    def __init__(self, rows):
        self.rows = list(rows)

    def join(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self, *args, **kwargs):
        return self

    def populate_existing(self):
        return self

    def one_or_none(self):
        return self.rows.pop(0) if self.rows else None


class _Session:
    def __init__(self, rows):
        self.rows = rows
        self.added = []
        self.commits = 0
        self.rollbacks = 0
        self.closed = False
        self.on_commit = None

    def query(self, *args, **kwargs):
        return _Query(self.rows)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        if self.on_commit is not None:
            self.on_commit()
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


@contextmanager
def _null_cache_lease(*args, **kwargs):
    yield None


class ReassessScoreVersionScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings_patcher = patch.multiple(
            script.settings,
            openai_score_model='gpt-6-sol',
            openai_score_reasoning_effort='low',
            openai_review_model='gpt-6-sol',
            openai_review_reasoning_effort='low',
            openai_pro_model='gpt-6.1-sol',
            openai_pro_reasoning_effort='high',
        )
        self.settings_patcher.start()
        self.read_url_patcher = patch.object(
            script,
            'get_object_read_url',
            side_effect=lambda object_key, *, bucket=None: f'https://signed.example/{bucket}/{object_key.replace(" ", "%20")}',
        )
        self.get_object_read_url = self.read_url_patcher.start()

    def tearDown(self) -> None:
        self.read_url_patcher.stop()
        self.settings_patcher.stop()

    def _candidate(self, review=None, photo=None, task=None):
        return script._candidate_from_row(review or _review(), photo or _photo(), task or _task())

    def test_discover_candidates_preserves_locale_for_gallery_reviews(self) -> None:
        zh_review = _review('rev_zh')
        en_review = _review('rev_en')
        rows = [(zh_review, _photo(), _task(locale='zh')), (en_review, _photo(), _task(locale='en'))]

        with patch.object(script, '_source_rows', return_value=rows):
            candidates, selected = script.discover_candidates(
                object(),
                source_score_version=script.SOURCE_SCORE_VERSION_V5,
            )

        self.assertEqual(selected, [])
        self.assertEqual([candidate.review_public_id for candidate in candidates], ['rev_zh', 'rev_en'])
        self.assertEqual([candidate.locale for candidate in candidates], ['zh', 'en'])

    def test_ineligible_rows_fail_closed_when_deleted_new_version_not_ready_or_private(self) -> None:
        review = _review()
        photo = _photo()
        task = _task()

        self.assertTrue(script._is_source_review(review, photo, task, source_score_version=script.SOURCE_SCORE_VERSION_V5))

        review.deleted_at = datetime.now(timezone.utc)
        self.assertFalse(script._is_source_review(review, photo, task, source_score_version=script.SOURCE_SCORE_VERSION_V5))
        review.deleted_at = None
        review.result_json['score_version'] = 'score-v7-canonical-quality'
        self.assertFalse(script._is_source_review(review, photo, task, source_score_version=script.SOURCE_SCORE_VERSION_V5))
        review.result_json['score_version'] = script.SOURCE_SCORE_VERSION_V5
        photo.status = PhotoStatus.REJECTED
        self.assertFalse(script._is_source_review(review, photo, task, source_score_version=script.SOURCE_SCORE_VERSION_V5))
        photo.status = PhotoStatus.READY
        task.request_payload['analysis_type'] = 'retake_compare'
        self.assertFalse(script._is_source_review(review, photo, task, source_score_version=script.SOURCE_SCORE_VERSION_V5))
        task.request_payload['analysis_type'] = 'single'
        review.gallery_visible = False
        self.assertFalse(script._is_source_review(review, photo, task, source_score_version=script.SOURCE_SCORE_VERSION_V5))
        review.gallery_visible = True
        review.gallery_audit_status = 'none'
        self.assertFalse(script._is_source_review(review, photo, task, source_score_version=script.SOURCE_SCORE_VERSION_V5))

    def test_private_explicit_review_id_is_rejected_without_provider_call(self) -> None:
        private_review = _review('rev_private')
        private_review.gallery_visible = False
        with patch.object(script, '_source_rows', return_value=[]):
            with self.assertRaisesRegex(ValueError, 'rev_private'):
                script.discover_candidates(
                    object(),
                    source_score_version=script.SOURCE_SCORE_VERSION_V5,
                    review_ids=['rev_private'],
                )

    def test_blank_or_unsupported_source_version_is_rejected_before_db_work(self) -> None:
        with self.assertRaisesRegex(ValueError, 'Unsupported source score version'):
            script._validate_source_score_version('')
        with self.assertRaisesRegex(ValueError, 'Unsupported source score version'):
            script._validate_source_score_version('score-v6-evidence-independent')

    def test_v7_reassessment_requires_explicit_ids_before_query(self) -> None:
        with patch.object(script, '_source_rows') as source_rows:
            for ids in (None, [], ()):
                with self.subTest(ids=ids), self.assertRaises(ValueError):
                    script.discover_candidates(object(), source_score_version=script.SOURCE_SCORE_VERSION_V7, review_ids=ids)
            source_rows.assert_not_called()

    def test_v7_reassessment_selects_only_named_public_source(self) -> None:
        review = _review('rev_v7_named')
        review.result_json['score_version'] = script.SOURCE_SCORE_VERSION_V7
        photo, task = _photo(), _task()
        with patch.object(script, '_source_rows', return_value=[(review, photo, task)]) as source_rows:
            candidates, selected = script.discover_candidates(
                object(), source_score_version=script.SOURCE_SCORE_VERSION_V7, review_ids=['rev_v7_named'],
            )
        self.assertEqual(selected, ['rev_v7_named'])
        self.assertEqual([candidate.review_public_id for candidate in candidates], ['rev_v7_named'])
        self.assertEqual(source_rows.call_args.kwargs['review_public_ids'], ['rev_v7_named'])

    def test_execute_updates_in_place_after_fsynced_backup_and_preserves_usage_fields(self) -> None:
        review = _review()
        photo = _photo()
        task = _task(locale='ja')
        candidate = self._candidate(review, photo, task)
        db = _Session([(review, photo, task), (review, photo, task)])

        with tempfile.TemporaryDirectory() as tmpdir:
            journal_path = Path(tmpdir) / 'journal.jsonl'
            db.on_commit = lambda: self.assertTrue(journal_path.exists() and journal_path.stat().st_size > 0)
            journal = script.RunJournal(journal_path, run_id='run-test')
            with patch.object(script, 'canonical_score_cache_lease', side_effect=_null_cache_lease), patch.object(
                script, 'run_ai_review', return_value=_ai_response(score=7.6)
            ) as run_review:
                item = script._reassess_candidate(
                    candidate,
                    session_factory=lambda: db,
                    source_score_version=script.SOURCE_SCORE_VERSION_V5,
                    review_model=script.TARGET_REVIEW_MODEL,
                    journal=journal,
                    photo_lock=script.Lock(),
                )
            records = [json.loads(line) for line in journal_path.read_text(encoding='utf-8').splitlines()]

        self.assertEqual(item['status'], 'reassessed')
        self.assertEqual(run_review.call_args.kwargs['locale'], 'ja')
        self.assertEqual(run_review.call_args.kwargs['review_model'], 'gpt-6-sol')
        self.assertEqual(run_review.call_args.kwargs['image_url'], 'https://signed.example/private-test-bucket/user_usr/2026/09/photo%20one.jpg')
        self.get_object_read_url.assert_called_once_with('user_usr/2026/09/photo one.jpg', bucket='private-test-bucket')
        self.assertEqual(review.public_id, 'rev_old')
        self.assertTrue(review.is_public)
        self.assertTrue(review.gallery_visible)
        self.assertTrue(review.favorite)
        self.assertEqual(review.tags_json, ['keep'])
        self.assertEqual(review.note, 'private note')
        self.assertEqual(review.input_tokens, 1000)
        self.assertEqual(review.output_tokens, 200)
        self.assertEqual(review.cost_usd, Decimal('0.123456'))
        self.assertEqual(review.cost_rate_version, 'old-rates')
        self.assertEqual(review.latency_ms, 999)
        self.assertEqual(review.final_score, Decimal('7.6'))
        self.assertEqual(review.result_json['score_version'], script.SCORE_VERSION)
        self.assertFalse(review.result_json['billing_info']['quota_charged'])
        self.assertEqual(review.result_json['billing_info']['reason'], 'score_version_reassessment')
        self.assertEqual(review.result_json[script.REASSESSMENT_METADATA_KEY]['source_score_version'], script.SOURCE_SCORE_VERSION_V5)
        self.assertEqual(records[0]['event'], 'before_update')
        self.assertEqual(records[0]['original_fields']['final_score'], '6.20')
        self.assertEqual(records[0]['new_ai_usage']['input_tokens'], 123)
        self.assertEqual(db.commits, 1)

    def test_after_update_journal_failure_reports_reassessed_with_audit_warning(self) -> None:
        review = _review()
        photo = _photo()
        task = _task(locale='zh')
        candidate = self._candidate(review, photo, task)
        db = _Session([(review, photo, task), (review, photo, task)])

        class FlakyJournal:
            run_id = 'run-test'

            def __init__(self):
                self.calls = 0

            def append(self, record):
                self.calls += 1
                if self.calls == 2:
                    raise OSError('disk full')
                return 'digest'

        journal = FlakyJournal()
        with patch.object(script, 'canonical_score_cache_lease', side_effect=_null_cache_lease), patch.object(
            script, 'run_ai_review', return_value=_ai_response(score=7.1)
        ):
            item = script._reassess_candidate(
                candidate,
                session_factory=lambda: db,
                source_score_version=script.SOURCE_SCORE_VERSION_V5,
                review_model=script.TARGET_REVIEW_MODEL,
                journal=journal,
                photo_lock=script.Lock(),
            )

        self.assertEqual(item['status'], 'reassessed')
        self.assertEqual(item['audit_warning'], {'event': 'after_update', 'error_type': 'OSError'})
        self.assertEqual(review.final_score, Decimal('7.1'))
        self.assertEqual(db.commits, 1)
        self.assertEqual(db.rollbacks, 0)

    def test_failed_model_call_rolls_back_without_change_or_journal(self) -> None:
        from app.services.ai import AIReviewError

        review = _review()
        original_score = review.final_score
        photo = _photo()
        task = _task()
        candidate = self._candidate(review, photo, task)
        db = _Session([(review, photo, task)])

        with tempfile.TemporaryDirectory() as tmpdir, patch.object(
            script, 'canonical_score_cache_lease', side_effect=_null_cache_lease
        ), patch.object(script, 'run_ai_review', side_effect=AIReviewError('provider secret detail', stage='scoring')):
            journal_path = Path(tmpdir) / 'journal.jsonl'
            item = script._reassess_candidate(
                candidate,
                session_factory=lambda: db,
                source_score_version=script.SOURCE_SCORE_VERSION_V5,
                review_model=script.TARGET_REVIEW_MODEL,
                journal=script.RunJournal(journal_path, run_id='run-test'),
                photo_lock=script.Lock(),
            )

        self.assertEqual(item, {'status': 'failed', 'review_id': 'rev_old', 'stage': 'scoring', 'error_type': 'AIReviewError'})
        self.assertEqual(review.final_score, original_score)
        self.assertFalse(journal_path.exists())
        self.assertEqual(db.rollbacks, 1)
        self.assertEqual(db.commits, 0)

    def test_concurrent_source_change_skips_after_ai_without_overwrite(self) -> None:
        review = _review()
        photo = _photo()
        task = _task()
        candidate = self._candidate(review, photo, task)
        db = _Session([(review, photo, task), (review, photo, task)])

        def mutate_then_return(*args, **kwargs):
            review.result_json = {'score_version': 'score-v7-canonical-quality', 'final_score': 8.0}
            review.final_score = Decimal('8.00')
            return _ai_response(score=7.0)

        with tempfile.TemporaryDirectory() as tmpdir, patch.object(
            script, 'canonical_score_cache_lease', side_effect=_null_cache_lease
        ), patch.object(script, 'run_ai_review', side_effect=mutate_then_return):
            item = script._reassess_candidate(
                candidate,
                session_factory=lambda: db,
                source_score_version=script.SOURCE_SCORE_VERSION_V5,
                review_model=script.TARGET_REVIEW_MODEL,
                journal=script.RunJournal(Path(tmpdir) / 'journal.jsonl', run_id='run-test'),
                photo_lock=script.Lock(),
            )

        self.assertEqual(item['status'], 'skipped')
        self.assertEqual(item['reason'], 'source_changed')
        self.assertEqual(review.final_score, Decimal('8.00'))
        self.assertEqual(db.rollbacks, 1)
        self.assertEqual(db.commits, 0)

    def test_visibility_change_while_ai_runs_skips_without_overwrite(self) -> None:
        review = _review()
        photo = _photo()
        task = _task()
        candidate = self._candidate(review, photo, task)
        db = _Session([(review, photo, task), (review, photo, task)])

        def hide_then_return(*args, **kwargs):
            review.gallery_visible = False
            return _ai_response(score=7.0)

        with tempfile.TemporaryDirectory() as tmpdir, patch.object(
            script, 'canonical_score_cache_lease', side_effect=_null_cache_lease
        ), patch.object(script, 'run_ai_review', side_effect=hide_then_return):
            item = script._reassess_candidate(
                candidate,
                session_factory=lambda: db,
                source_score_version=script.SOURCE_SCORE_VERSION_V5,
                review_model=script.TARGET_REVIEW_MODEL,
                journal=script.RunJournal(Path(tmpdir) / 'journal.jsonl', run_id='run-test'),
                photo_lock=script.Lock(),
            )

        self.assertEqual(item['status'], 'skipped')
        self.assertEqual(item['reason'], 'source_changed')
        self.assertEqual(review.final_score, Decimal('6.20'))
        self.assertEqual(db.rollbacks, 1)
        self.assertEqual(db.commits, 0)

    def test_rejects_same_journal_and_report_path_before_db_or_provider(self) -> None:
        same_path = Path(tempfile.gettempdir()) / 'same-reassessment-output.json'

        def fail_session_factory():
            raise AssertionError('DB should not be opened')

        with self.assertRaisesRegex(ValueError, 'journal_path and report_path'):
            script.reassess_score_version(
                dry_run=False,
                journal_path=same_path,
                report_path=same_path,
                session_factory=fail_session_factory,
            )

    def test_same_path_guard_catches_existing_file_alias(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            original = Path(tmpdir) / 'report.json'
            alias = Path(tmpdir) / 'alias.json'
            original.write_text('{}', encoding='utf-8')
            try:
                os.link(original, alias)
            except OSError:
                self.skipTest('hard links are unavailable on this filesystem')

            self.assertTrue(script._same_resolved_path(original, alias))

    def test_commit_success_does_not_read_orm_values_after_commit(self) -> None:
        review = _review()
        photo = _photo()
        task = _task()
        candidate = self._candidate(review, photo, task)
        db = _Session([(review, photo, task), (review, photo, task)])
        db.on_commit = lambda: setattr(review, 'final_score', object())

        with tempfile.TemporaryDirectory() as tmpdir, patch.object(
            script, 'canonical_score_cache_lease', side_effect=_null_cache_lease
        ), patch.object(script, 'run_ai_review', return_value=_ai_response(score=7.3)):
            item = script._reassess_candidate(
                candidate,
                session_factory=lambda: db,
                source_score_version=script.SOURCE_SCORE_VERSION_V5,
                review_model=script.TARGET_REVIEW_MODEL,
                journal=script.RunJournal(Path(tmpdir) / 'journal.jsonl', run_id='run-test'),
                photo_lock=script.Lock(),
            )

        self.assertEqual(item['status'], 'reassessed')
        self.assertEqual(item['new_score'], 7.3)
        self.assertEqual(db.commits, 1)

    def test_cli_dry_run_defaults_to_v5_and_accepts_limit_and_workers(self) -> None:
        stats = {
            'dry_run': True,
            'source_score_version': script.SOURCE_SCORE_VERSION_V5,
            'target_score_version': 'score-v7-canonical-quality',
            'eligible_reviews': 4,
            'pending': 4,
            'selected_review_count': 0,
            'selected_review_ids': [],
            'journal_path': 'journal.jsonl',
            'report_path': 'report.json',
        }
        with patch.object(sys, 'argv', ['reassess_score_version.py', '--limit', '4', '--max-workers', '8']), patch.object(
            script, 'reassess_score_version', return_value=stats
        ) as reassess:
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = script.main()

        self.assertEqual(exit_code, 0)
        self.assertEqual(reassess.call_args.kwargs['source_score_version'], script.SOURCE_SCORE_VERSION_V5)
        self.assertEqual(reassess.call_args.kwargs['limit'], 4)
        self.assertEqual(reassess.call_args.kwargs['max_workers'], 8)
        self.assertIn('eligible_reviews=4', stdout.getvalue())


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class ReassessScoreVersionPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.Session = sessionmaker(bind=self.connection, autoflush=False, autocommit=False)
        self.read_url_patcher = patch.object(
            script,
            'get_object_read_url',
            side_effect=lambda object_key, *, bucket=None: f'https://signed.example/{bucket}/{object_key}',
        )
        self.read_url_patcher.start()

    def tearDown(self) -> None:
        self.read_url_patcher.stop()
        self.connection.close()
        self.engine.dispose()

    def _insert_v5_review(self, db) -> Review:
        suffix = uuid4().hex[:10]
        user = User(
            public_id=f'usr_sv_{suffix}',
            email=f'sv_{suffix}@example.test',
            username=f'sv_{suffix}',
            plan=UserPlan.free,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db.add(user)
        db.flush()
        photo = Photo(
            public_id=f'pho_sv_{suffix}',
            owner_user_id=user.id,
            upload_id=f'upl_sv_{suffix}',
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
        task = ReviewTask(
            public_id=f'tsk_sv_{suffix}',
            photo_id=photo.id,
            owner_user_id=user.id,
            mode=ReviewMode.flash,
            status=TaskStatus.SUCCEEDED,
            request_payload={'locale': 'en', 'review_model': 'gpt-5.6-luna'},
            progress=100,
        )
        db.add(task)
        db.flush()
        review = Review(
            public_id=f'rev_sv_{suffix}',
            task_id=task.id,
            photo_id=photo.id,
            owner_user_id=user.id,
            mode=ReviewMode.flash,
            status=ReviewStatus.SUCCEEDED,
            image_type='default',
            schema_version='1.0',
            result_json={'score_version': script.SOURCE_SCORE_VERSION_V5, 'billing_info': {'quota_charged': True}},
            final_score=Decimal('6.20'),
            is_public=True,
            favorite=True,
            gallery_visible=True,
            gallery_audit_status=script.GALLERY_AUDIT_APPROVED,
            tags_json=['keep'],
            note='keep me',
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

    def test_postgres_execute_updates_in_place_without_usage_charge(self) -> None:
        db = self.Session()
        try:
            review = self._insert_v5_review(db)
            review_id = review.id
            user_id = review.owner_user_id
            worker_session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
            with tempfile.TemporaryDirectory() as tmpdir, patch.object(
                script, 'canonical_score_cache_lease', side_effect=_null_cache_lease
            ), patch.object(script, 'run_ai_review', return_value=_ai_response(score=7.4)):
                stats = script.reassess_score_version(
                    dry_run=False,
                    max_workers=1,
                    limit=1,
                    review_ids=[review.public_id],
                    journal_path=Path(tmpdir) / 'journal.jsonl',
                    report_path=Path(tmpdir) / 'report.json',
                    session_factory=worker_session_factory,
                    lock_connection=self.connection,
                )

            db.close()
            db = self.Session()
            persisted = db.query(Review).filter(Review.id == review_id).one()
            ledger_count = db.execute(text('SELECT count(*) FROM usage_ledger WHERE review_id = :id'), {'id': review_id}).scalar()
            quota_used = db.execute(text('SELECT daily_quota_used FROM users WHERE id = :id'), {'id': user_id}).scalar()

            self.assertEqual(stats['processed'], 1)
            self.assertEqual(persisted.final_score, Decimal('7.40'))
            self.assertTrue(persisted.favorite)
            self.assertTrue(persisted.is_public)
            self.assertEqual(persisted.tags_json, ['keep'])
            self.assertEqual(persisted.note, 'keep me')
            self.assertEqual(persisted.input_tokens, 100)
            self.assertEqual(persisted.cost_rate_version, 'historical-rates')
            self.assertFalse(persisted.result_json['billing_info']['quota_charged'])
            self.assertEqual(ledger_count, 0)
            self.assertEqual(quota_used, 0)
        finally:
            db.close()


if __name__ == '__main__':
    unittest.main()
