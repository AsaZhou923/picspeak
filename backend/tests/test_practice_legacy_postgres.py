"""Legacy retake comparison discovery contracts on PostgreSQL."""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import CurrentActor
from app.api.routers.practice import list_legacy_comparisons
from app.db.models import (
    Photo,
    PhotoStatus,
    PracticeAttempt,
    PracticeSession,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.services.practice_legacy import list_legacy_retake_comparisons
from app.services.review_task_processor import _normalize_review_result_payload


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()
_COMPARISON_UNSET = object()


def _photo_route_endpoint(_request: Request) -> Response:
    return Response()


_REQUEST_APP = Starlette(routes=[
    Route('/photos/{photo_id}/image', _photo_route_endpoint, name='get_photo_image'),
    Route('/photos/{photo_id}/thumbnail', _photo_route_endpoint, name='get_photo_thumbnail'),
])


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PracticeLegacyPostgresTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.sessions()
        suffix = uuid4().hex
        self.suffix = suffix
        self.user = User(
            public_id=f'usr_practice_legacy_{suffix}',
            email=f'{suffix}@legacy.example.test',
            username=f'legacy_{suffix[:20]}',
            plan=UserPlan.free,
            status=UserStatus.active,
            daily_quota_total=100,
            daily_quota_used=0,
        )
        self.other_user = User(
            public_id=f'usr_practice_legacy_other_{suffix}',
            email=f'other-{suffix}@legacy.example.test',
            username=f'legacy_other_{suffix[:14]}',
            plan=UserPlan.free,
            status=UserStatus.active,
            daily_quota_total=100,
            daily_quota_used=0,
        )
        self.db.add_all([self.user, self.other_user])
        self.db.flush()
        self.actor = CurrentActor(self.user)
        self.user_ids = [self.user.id, self.other_user.id]
        self.maxDiff = None

    def tearDown(self):
        self.db.rollback()
        self.db.query(PracticeAttempt).filter(PracticeAttempt.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(PracticeSession).filter(PracticeSession.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(Review).filter(Review.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(ReviewTask).filter(ReviewTask.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(Photo).filter(Photo.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(User).filter(User.id.in_(self.user_ids)).delete()
        self.db.commit()
        self.db.close()
        self.engine.dispose()

    def _photo(self, owner: User, label: str, *, status: PhotoStatus = PhotoStatus.READY) -> Photo:
        photo = Photo(
            public_id=f'pho_{self.suffix}_{label}',
            owner_user_id=owner.id,
            upload_id=f'u_{self.suffix}_{label}',
            bucket='practice-legacy-fixture',
            object_key=f'{self.suffix}/{label}.jpg',
            content_type='image/jpeg',
            size_bytes=100,
            status=status,
            checksum_sha256=(label[:1] or 'a') * 64,
        )
        self.db.add(photo)
        self.db.flush()
        return photo

    def _review(
        self,
        owner: User,
        photo: Photo,
        label: str,
        *,
        source: Review | None = None,
        result_json: dict | None = None,
        deleted: bool = False,
        created_at: datetime | None = None,
    ) -> Review:
        review = Review(
            public_id=f'rev_{self.suffix}_{label}',
            owner_user_id=owner.id,
            photo_id=photo.id,
            source_review_id=source.id if source is not None else None,
            mode=ReviewMode.flash,
            status=ReviewStatus.SUCCEEDED,
            image_type='portrait',
            schema_version='2.0',
            result_json=result_json if result_json is not None else {'scores': {'composition': 6}},
            final_score=7,
            created_at=created_at,
            deleted_at=datetime.now(timezone.utc) if deleted else None,
        )
        self.db.add(review)
        self.db.flush()
        return review

    def _legacy_result(self, *, nested_goal: bool = False) -> dict:
        comparison = self._comparison_payload()
        if nested_goal:
            comparison['goal_assessment'] = {'status': 'achieved'}
        return {'comparison': comparison, 'scores': {'composition': 7}, 'score_version': 'score-v5-evidence-calibrated'}

    def _comparison_payload(self, *, null_overall: bool = False) -> dict:
        overall_before: float | None = None if null_overall else 5.0
        overall_after: float | None = None if null_overall else 7.0
        overall_delta: float | None = None if null_overall else 2.0
        dimensions = {
            key: {
                'before_score': 5,
                'after_score': 7,
                'delta': 2,
                'trend': 'improved',
                'evidence': [f'{key} improved.'],
                'remaining_gap': '',
            }
            for key in ('composition', 'lighting', 'color', 'impact', 'technical')
        }
        return {
            'original_review_id': 'rev_original_fixture',
            'original_photo_id': 'pho_original_fixture',
            'retake_photo_id': 'pho_retake_fixture',
            'is_comparable': not null_overall,
            'comparison_confidence': 'low' if null_overall else 'high',
            'comparison_caveat': 'Insufficient confidence for numeric delta.' if null_overall else '',
            'summary': 'Retake improved the composition.',
            'dimensions': dimensions,
            'overall_before': overall_before,
            'overall_after': overall_after,
            'overall_delta': overall_delta,
            'strongest_improvement': 'composition',
            'next_actions': [{
                'priority': 1,
                'dimension': 'composition',
                'action': 'Keep the subject aligned.',
                'success_check': 'The subject remains centered without cropping.',
            }],
            'visual_reference_prompt': 'Keep the subject centered.',
            'openai_response_id': 'resp_fixture',
        }

    def _worker_shape_result(
        self,
        *,
        comparison: object | None = _COMPARISON_UNSET,
        include_comparison: bool = True,
        top_goal: object | None = None,
        include_top_goal: bool = False,
        nested_goal: object | None = None,
        include_nested_goal: bool = False,
        preserve_abnormal_top_goal: bool = False,
        null_overall: bool = False,
    ) -> dict:
        payload = {'scores': {'composition': 7}, 'score_version': 'score-v5-evidence-calibrated'}
        if include_comparison:
            if comparison is _COMPARISON_UNSET:
                comparison = self._comparison_payload(null_overall=null_overall)
            if isinstance(comparison, dict):
                comparison = dict(comparison)
                if include_nested_goal:
                    comparison['goal_assessment'] = nested_goal
            payload['comparison'] = comparison
        if include_top_goal:
            payload['goal_assessment'] = top_goal
        normalized = _normalize_review_result_payload(
            payload,
            final_score=7.0,
            prompt_version='practice-legacy-fixture',
            model_name='fixture-model',
            model_version='fixture-version',
            exif_info={},
        )
        if preserve_abnormal_top_goal and include_top_goal:
            normalized['goal_assessment'] = top_goal
        return normalized

    def _practice_attempt_for_review(self, source: Review, review: Review, created_at: datetime) -> None:
        session = PracticeSession(
            public_id=f'prs_{self.suffix}_{review.public_id[-16:]}',
            owner_user_id=self.user.id,
            source_review_id=source.id,
            source_photo_id=source.photo_id,
            practice_kind='capture_retake',
            lifecycle='active',
            goal_snapshot={'goal': 'Improve composition.', 'dimension': 'composition'},
            success_criteria=[],
            locale='en',
            request_hash=f'session-{review.public_id}',
            created_at=created_at,
            updated_at=created_at,
        )
        self.db.add(session)
        self.db.flush()
        task = ReviewTask(
            public_id=f'tsk_{self.suffix}_{review.public_id[-16:]}',
            photo_id=review.photo_id,
            owner_user_id=self.user.id,
            mode=ReviewMode.flash,
            status=TaskStatus.SUCCEEDED,
            request_payload={},
            created_at=created_at,
        )
        self.db.add(task)
        self.db.flush()
        self.db.add(PracticeAttempt(
            public_id=f'pra_{self.suffix}_{review.public_id[-16:]}',
            session_id=session.id,
            owner_user_id=self.user.id,
            task_id=task.id,
            review_id=review.id,
            sequence=1,
            photo_id=review.photo_id,
            source_review_id=source.id,
            attempt_kind='capture_retake',
            request_hash=f'attempt-{review.public_id}',
            created_at=created_at,
        ))
        self.db.flush()

    def _request(self) -> Request:
        return Request({
            'type': 'http',
            'method': 'GET',
            'path': '/practice/legacy-comparisons',
            'headers': [],
            'query_string': b'',
            'scheme': 'http',
            'server': ('testserver', 80),
            'client': ('testclient', 50000),
            'app': _REQUEST_APP,
        })

    def test_finds_legacy_retake_beyond_plain_review_history_window(self):
        base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(days=1)
        source_photo = self._photo(self.user, 'source')
        source = self._review(self.user, source_photo, 'source', created_at=base)
        retake_photo = self._photo(self.user, 'retake')
        retake = self._review(self.user, retake_photo, 'retake', source=source, result_json=self._legacy_result(), created_at=base)
        for index in range(35):
            photo = self._photo(self.user, f'plain-{index}')
            self._review(self.user, photo, f'plain-{index}', created_at=base + timedelta(minutes=index + 1))
        self.db.commit()

        page = list_legacy_retake_comparisons(self.db, self.actor, limit=5)

        self.assertEqual([review.public_id for review, _photo in page.rows], [retake.public_id])
        self.assertIsNone(page.next_cursor)

    def test_filters_to_actual_old_comparisons_for_owner_visible_results(self):
        now = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=2)
        source_photo = self._photo(self.user, 'source-filter')
        source = self._review(self.user, source_photo, 'source-filter', created_at=now)
        expected = self._review(
            self.user,
            self._photo(self.user, 'expected'),
            'expected',
            source=source,
            result_json=self._legacy_result(),
            created_at=now + timedelta(minutes=1),
        )
        self._review(
            self.user,
            self._photo(self.user, 'goal'),
            'goal',
            source=source,
            result_json={**self._legacy_result(), 'goal_assessment': {'status': 'achieved'}},
            created_at=now + timedelta(minutes=2),
        )
        self._review(
            self.user,
            self._photo(self.user, 'nested-goal'),
            'nested-goal',
            source=source,
            result_json=self._legacy_result(nested_goal=True),
            created_at=now + timedelta(minutes=3),
        )
        practice_review = self._review(
            self.user,
            self._photo(self.user, 'practice'),
            'practice',
            source=source,
            result_json=self._legacy_result(),
            created_at=now + timedelta(minutes=4),
        )
        self._practice_attempt_for_review(source, practice_review, now + timedelta(minutes=4))
        self._review(
            self.user,
            self._photo(self.user, 'deleted'),
            'deleted',
            source=source,
            result_json=self._legacy_result(),
            deleted=True,
            created_at=now + timedelta(minutes=5),
        )
        self._review(
            self.user,
            self._photo(self.user, 'rejected', status=PhotoStatus.REJECTED),
            'rejected',
            source=source,
            result_json=self._legacy_result(),
            created_at=now + timedelta(minutes=6),
        )
        other_source_photo = self._photo(self.other_user, 'other-source')
        other_source = self._review(self.other_user, other_source_photo, 'other-source', created_at=now)
        self._review(
            self.other_user,
            self._photo(self.other_user, 'other-retake'),
            'other-retake',
            source=other_source,
            result_json=self._legacy_result(),
            created_at=now + timedelta(minutes=7),
        )
        self.db.commit()

        page = list_legacy_retake_comparisons(self.db, self.actor, limit=20)

        self.assertEqual([review.public_id for review, _photo in page.rows], [expected.public_id])

    def test_legacy_retake_filter_uses_worker_json_semantics(self):
        now = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=2)
        source_photo = self._photo(self.user, 'json-source')
        source = self._review(self.user, source_photo, 'json-source', created_at=now)
        expected_missing_goals = self._review(
            self.user,
            self._photo(self.user, 'json-valid-missing'),
            'json-valid-missing',
            source=source,
            result_json=self._worker_shape_result(),
            created_at=now + timedelta(minutes=1),
        )
        expected_top_null = self._review(
            self.user,
            self._photo(self.user, 'json-top-null'),
            'json-top-null',
            source=source,
            result_json=self._worker_shape_result(include_top_goal=True, top_goal=None),
            created_at=now + timedelta(minutes=2),
        )
        expected_nested_null = self._review(
            self.user,
            self._photo(self.user, 'json-nested-null'),
            'json-nested-null',
            source=source,
            result_json=self._worker_shape_result(include_nested_goal=True, nested_goal=None),
            created_at=now + timedelta(minutes=3),
        )
        expected_both_null = self._review(
            self.user,
            self._photo(self.user, 'json-both-null'),
            'json-both-null',
            source=source,
            result_json=self._worker_shape_result(
                include_top_goal=True,
                top_goal=None,
                include_nested_goal=True,
                nested_goal=None,
            ),
            created_at=now + timedelta(minutes=4),
        )
        expected_low_confidence = self._review(
            self.user,
            self._photo(self.user, 'json-low-confidence'),
            'json-low-confidence',
            source=source,
            result_json=self._worker_shape_result(comparison={
                **self._comparison_payload(),
                'is_comparable': False,
                'comparison_confidence': 'low',
                'comparison_caveat': 'Low confidence, but numeric comparison is still available.',
            }),
            created_at=now + timedelta(minutes=5),
        )
        invalid_rows = [
            ('json-no-comparison', self._worker_shape_result(include_comparison=False)),
            ('json-null-comparison', self._worker_shape_result(comparison=None)),
            ('json-array-comparison', self._worker_shape_result(comparison=[])),
            ('json-scalar-comparison', self._worker_shape_result(comparison='comparison failed')),
            ('json-empty-comparison', self._worker_shape_result(comparison={})),
            ('json-partial-comparison', self._worker_shape_result(comparison={'summary': 'not enough structure'})),
            (
                'json-top-goal-object',
                self._worker_shape_result(include_top_goal=True, top_goal={'status': 'achieved'}),
            ),
            (
                'json-top-goal-scalar',
                self._worker_shape_result(
                    include_top_goal=True,
                    top_goal='error',
                    preserve_abnormal_top_goal=True,
                ),
            ),
            (
                'json-nested-goal-object',
                self._worker_shape_result(include_nested_goal=True, nested_goal={'status': 'achieved'}),
            ),
            ('json-nested-goal-scalar', self._worker_shape_result(include_nested_goal=True, nested_goal='error')),
            ('json-null-overall', self._worker_shape_result(null_overall=True)),
            ('json-string-overall', self._worker_shape_result(comparison={
                **self._comparison_payload(),
                'overall_before': '5.0',
            })),
            ('json-bool-overall', self._worker_shape_result(comparison={
                **self._comparison_payload(),
                'overall_delta': True,
            })),
            ('json-out-of-range-overall', self._worker_shape_result(comparison={
                **self._comparison_payload(),
                'overall_after': 11.0,
            })),
            ('json-missing-required-id', self._worker_shape_result(comparison={
                key: value
                for key, value in self._comparison_payload().items()
                if key != 'original_review_id'
            })),
        ]
        for index, (label, result_json) in enumerate(invalid_rows, start=6):
            self._review(
                self.user,
                self._photo(self.user, label),
                label,
                source=source,
                result_json=result_json,
                created_at=now + timedelta(minutes=index),
            )
        attempted = self._review(
            self.user,
            self._photo(self.user, 'json-practice-attempt'),
            'json-practice-attempt',
            source=source,
            result_json=self._worker_shape_result(include_top_goal=True, top_goal=None),
            created_at=now + timedelta(minutes=20),
        )
        self._practice_attempt_for_review(source, attempted, now + timedelta(minutes=20))
        self.db.commit()

        page = list_legacy_retake_comparisons(self.db, self.actor, limit=20)

        self.assertEqual(
            [review.public_id for review, _photo in page.rows],
            [
                expected_low_confidence.public_id,
                expected_both_null.public_id,
                expected_nested_null.public_id,
                expected_top_null.public_id,
                expected_missing_goals.public_id,
            ],
        )

    def test_legacy_router_serializes_normalized_json_null_candidates_with_cursor(self):
        created_at = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=1)
        source_photo = self._photo(self.user, 'router-source')
        source = self._review(self.user, source_photo, 'router-source', created_at=created_at)
        first = self._review(
            self.user,
            self._photo(self.user, 'router-a'),
            'router-a',
            source=source,
            result_json=self._worker_shape_result(include_top_goal=True, top_goal=None),
            created_at=created_at,
        )
        second = self._review(
            self.user,
            self._photo(self.user, 'router-b'),
            'router-b',
            source=source,
            result_json=self._worker_shape_result(include_nested_goal=True, nested_goal=None),
            created_at=created_at,
        )
        third = self._review(
            self.user,
            self._photo(self.user, 'router-c'),
            'router-c',
            source=source,
            result_json=self._worker_shape_result(
                include_top_goal=True,
                top_goal=None,
                include_nested_goal=True,
                nested_goal=None,
            ),
            created_at=created_at,
        )
        self._review(
            self.user,
            self._photo(self.user, 'router-invalid-head-null'),
            'router-invalid-head-null',
            source=source,
            result_json=self._worker_shape_result(null_overall=True),
            created_at=created_at,
        )
        self._review(
            self.user,
            self._photo(self.user, 'router-invalid-head-partial'),
            'router-invalid-head-partial',
            source=source,
            result_json=self._worker_shape_result(comparison={'summary': 'missing required fields'}),
            created_at=created_at,
        )
        self._review(
            self.user,
            self._photo(self.user, 'router-invalid-head-empty-dims'),
            'router-invalid-head-empty-dims',
            source=source,
            result_json=self._worker_shape_result(comparison={
                **self._comparison_payload(),
                'dimensions': {},
            }),
            created_at=created_at,
        )
        partial_dimensions = dict(self._comparison_payload()['dimensions'])
        partial_dimensions.pop('technical')
        self._review(
            self.user,
            self._photo(self.user, 'router-invalid-head-partial-dims'),
            'router-invalid-head-partial-dims',
            source=source,
            result_json=self._worker_shape_result(comparison={
                **self._comparison_payload(),
                'dimensions': partial_dimensions,
            }),
            created_at=created_at,
        )
        self.db.commit()

        page_one = list_legacy_comparisons(self._request(), limit=2, cursor=None, db=self.db, actor=self.actor)
        page_two = list_legacy_comparisons(self._request(), limit=2, cursor=page_one.next_cursor, db=self.db, actor=self.actor)

        page_one_ids = [item.review_id for item in page_one.items]
        page_two_ids = [item.review_id for item in page_two.items]
        self.assertEqual(page_one_ids, [third.public_id, second.public_id])
        self.assertEqual(page_two_ids, [first.public_id])
        self.assertIsNotNone(page_one.next_cursor)
        self.assertIsNone(page_two.next_cursor)
        self.assertEqual(set(page_one_ids + page_two_ids), {first.public_id, second.public_id, third.public_id})
        for item in [*page_one.items, *page_two.items]:
            self.assertEqual(item.source_review_id, source.public_id)
            self.assertIsNone(item.goal_assessment)
            self.assertIsNotNone(item.comparison)
            assert item.comparison is not None
            self.assertEqual(item.comparison.openai_response_id, '')
        self.assertEqual(item.comparison.overall_delta, 2.0)

    def test_legacy_pagination_skips_malformed_candidates_until_page_fills(self):
        created_at = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=1)
        source_photo = self._photo(self.user, 'scan-source')
        source = self._review(self.user, source_photo, 'scan-source', created_at=created_at)
        first = self._review(
            self.user,
            self._photo(self.user, 'scan-valid-a'),
            'scan-valid-a',
            source=source,
            result_json=self._worker_shape_result(),
            created_at=created_at,
        )
        self._review(
            self.user,
            self._photo(self.user, 'scan-bad-tail'),
            'scan-bad-tail',
            source=source,
            result_json=self._worker_shape_result(comparison={'summary': 'page tail malformed'}),
            created_at=created_at,
        )
        second = self._review(
            self.user,
            self._photo(self.user, 'scan-valid-b'),
            'scan-valid-b',
            source=source,
            result_json=self._worker_shape_result(),
            created_at=created_at,
        )
        for index in range(25):
            self._review(
                self.user,
                self._photo(self.user, f'scan-bad-head-{index}'),
                f'scan-bad-head-{index}',
                source=source,
                result_json=self._worker_shape_result(comparison={
                    **self._comparison_payload(),
                    'overall_before': '5.0',
                }),
                created_at=created_at + timedelta(minutes=1),
            )
        self.db.commit()

        page = list_legacy_retake_comparisons(self.db, self.actor, limit=2)

        self.assertEqual([review.public_id for review, _photo in page.rows], [second.public_id, first.public_id])
        self.assertIsNone(page.next_cursor)

    def test_legacy_pagination_returns_empty_for_all_malformed_candidates(self):
        created_at = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=1)
        source_photo = self._photo(self.user, 'all-bad-source')
        source = self._review(self.user, source_photo, 'all-bad-source', created_at=created_at)
        for index in range(3):
            self._review(
                self.user,
                self._photo(self.user, f'all-bad-{index}'),
                f'all-bad-{index}',
                source=source,
                result_json=self._worker_shape_result(comparison={
                    **self._comparison_payload(),
                    'overall_delta': False,
                }),
                created_at=created_at + timedelta(minutes=index),
            )
        self.db.commit()

        page = list_legacy_retake_comparisons(self.db, self.actor, limit=2)

        self.assertEqual(page.rows, [])
        self.assertIsNone(page.next_cursor)

    def test_legacy_filter_rejects_raw_non_object_comparison_json_types(self):
        now = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=3)
        source_photo = self._photo(self.user, 'raw-source')
        source = self._review(self.user, source_photo, 'raw-source', created_at=now)
        expected = self._review(
            self.user,
            self._photo(self.user, 'raw-valid'),
            'raw-valid',
            source=source,
            result_json=self._worker_shape_result(),
            created_at=now + timedelta(minutes=1),
        )
        raw_results = [
            ('raw-array', {'comparison': [], 'scores': {'composition': 7}}),
            ('raw-scalar', {'comparison': 'comparison failed', 'scores': {'composition': 7}}),
            ('raw-number', {'comparison': 5, 'scores': {'composition': 7}}),
            ('raw-bool', {'comparison': False, 'scores': {'composition': 7}}),
            ('raw-null', {'comparison': None, 'scores': {'composition': 7}}),
        ]
        for index, (label, result_json) in enumerate(raw_results, start=2):
            self._review(
                self.user,
                self._photo(self.user, label),
                label,
                source=source,
                result_json=result_json,
                created_at=now + timedelta(minutes=index),
            )
        self.db.commit()

        page = list_legacy_retake_comparisons(self.db, self.actor, limit=20)

        self.assertEqual([review.public_id for review, _photo in page.rows], [expected.public_id])

    def test_legacy_cursor_uses_created_at_and_id_without_duplicates(self):
        created_at = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=1)
        source_photo = self._photo(self.user, 'cursor-source')
        source = self._review(self.user, source_photo, 'cursor-source', created_at=created_at)
        first = self._review(self.user, self._photo(self.user, 'cursor-a'), 'cursor-a', source=source, result_json=self._legacy_result(), created_at=created_at)
        second = self._review(self.user, self._photo(self.user, 'cursor-b'), 'cursor-b', source=source, result_json=self._legacy_result(), created_at=created_at)
        self.db.commit()

        page_one = list_legacy_retake_comparisons(self.db, self.actor, limit=1)
        page_two = list_legacy_retake_comparisons(self.db, self.actor, limit=1, cursor=page_one.next_cursor)

        seen = {page_one.rows[0][0].public_id, page_two.rows[0][0].public_id}
        self.assertEqual(seen, {first.public_id, second.public_id})
        self.assertNotEqual(page_one.rows[0][0].public_id, page_two.rows[0][0].public_id)
        self.assertIsNone(page_two.next_cursor)


if __name__ == '__main__':
    unittest.main()
