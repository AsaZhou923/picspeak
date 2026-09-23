from __future__ import annotations

import os
import sys
import threading
import unittest
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import CurrentActor
from app.api.routers.analytics import track_product_analytics_event
from app.db.models import PracticeAttempt, ProductAnalyticsEvent, Review, TaskStatus, User, UserPlan
from app.schemas import ProductAnalyticsTrackRequest
from app.services.practice_events import record_client_practice_event, record_practice_event
from app.services.review_task_processor import _process_task
from app.services.product_analytics import load_stage_a_snapshot_from_db, render_product_analytics_weekly_markdown
import test_practice_worker_postgres as worker_fixtures


@unittest.skipUnless(os.getenv('PICSPEAK_TEST_DATABASE_URL'), 'requires disposable PostgreSQL')
class PracticeEventsPostgresTests(unittest.TestCase):
    def setUp(self):
        self.fixture = worker_fixtures.PracticeWorkerPostgresTests()
        self.fixture.setUp()
        self.db = self.fixture.db
        self.actor = self.fixture.actor
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            self.session, self.task = self.fixture.create_attempt()

    def tearDown(self):
        self.fixture.tearDown()

    def events(self, event_name):
        return self.db.query(ProductAnalyticsEvent).filter(
            ProductAnalyticsEvent.event_name == event_name,
            ProductAnalyticsEvent.user_public_id == self.actor.user.public_id,
        ).all()

    def complete(self):
        self.task.status = TaskStatus.RUNNING
        self.task.attempt_count = 1
        self.db.commit()
        with patch('app.services.retake_comparison.settings.openai_api_key', 'fixture-only'), patch(
            'app.services.retake_comparison.pooled_request', return_value=worker_fixtures.comparison_response()
        ):
            _process_task(self.db, self.task)
        return self.db.query(PracticeAttempt).filter(PracticeAttempt.task_id == self.task.id).one()

    def test_accepted_submitted_and_completed_events_are_durable_and_deduplicated(self):
        self.assertEqual(len(self.events('practice_goal_accepted')), 1)
        self.assertEqual(len(self.events('practice_attempt_submitted')), 1)
        self.assertEqual(len(self.events('practice_analysis_completed')), 0)
        attempt = self.complete()
        self.assertEqual(len(self.events('practice_analysis_completed')), 1)
        review = self.db.get(Review, attempt.review_id)
        inserted = record_practice_event(self.db, event_name='practice_analysis_completed',
                                         session=self.session, attempt=attempt, review=review)
        self.db.commit()
        self.assertFalse(inserted)
        self.assertEqual(len(self.events('practice_analysis_completed')), 1)
        metadata = self.events('practice_analysis_completed')[0].metadata_json
        self.assertEqual(metadata['session_id'], self.session.public_id)
        self.assertEqual(metadata['task_id'], self.task.public_id)
        self.assertEqual(metadata['review_id'], review.public_id)
        self.assertNotIn('goal', metadata)
        self.assertNotIn('success_criteria', metadata)

    def test_viewed_event_resolves_authoritative_links_and_ignores_private_client_metadata(self):
        attempt = self.complete()
        spoofed = {'attempt_id': attempt.public_id, 'session_id': 'prs_other', 'goal_status': 'achieved',
                   'photo_url': 'https://private.example/photo', 'goal': 'private goal', 'cost_usd': 0,
                   'created_at': '2000-01-01T00:00:00Z'}
        for _ in range(2):
            record_client_practice_event(self.db, actor=self.actor, event_name='practice_result_viewed',
                                         metadata=spoofed, locale='en')
            self.db.commit()
        events = self.events('practice_result_viewed')
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].metadata_json['session_id'], self.session.public_id)
        self.assertEqual(events[0].metadata_json['goal_status'], 'not_achieved')
        for forbidden in ('photo_url', 'goal', 'cost_usd', 'created_at'):
            self.assertNotIn(forbidden, events[0].metadata_json)
        self.assertEqual(events[0].source, 'retake_coach')

    def test_client_cannot_emit_server_facts_or_view_someone_elses_attempt(self):
        for event_name in ('practice_goal_accepted', 'practice_attempt_submitted',
                           'practice_analysis_completed', 'practice_feedback_submitted'):
            with self.subTest(event_name=event_name), self.assertRaises(HTTPException) as rejected:
                track_product_analytics_event(ProductAnalyticsTrackRequest(event_name=event_name),
                                              SimpleNamespace(), self.db, self.actor, None)
            self.assertEqual(rejected.exception.detail['code'], 'ANALYTICS_EVENT_SERVER_OWNED')
        attempt = self.complete()
        other = SimpleNamespace(user=SimpleNamespace(id=-1), plan=UserPlan.free)
        with self.assertRaises(HTTPException) as rejected:
            record_client_practice_event(self.db, actor=other, event_name='practice_result_viewed',
                                         metadata={'attempt_id': attempt.public_id}, locale='en')
        self.assertEqual(rejected.exception.status_code, 404)

    def test_concurrent_views_insert_once_and_rollbacks_do_not_count(self):
        attempt = self.complete()
        barrier = threading.Barrier(2)
        def submit():
            with self.fixture.sessions() as db:
                actor = CurrentActor(db.get(User, self.actor.user.id))
                barrier.wait(timeout=10)
                inserted = record_client_practice_event(
                    db, actor=actor, event_name='practice_result_viewed',
                    metadata={'attempt_id': attempt.public_id}, locale='en',
                )
                db.commit()
                return inserted
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(submit) for _ in range(2)]
            self.assertEqual(sorted(f.result(timeout=20) for f in futures), [False, True])
        self.assertEqual(len(self.events('practice_result_viewed')), 1)
        record_client_practice_event(self.db, actor=self.actor, event_name='practice_goal_shown',
                                     metadata={'source_review_id': self.fixture.source.public_id}, locale='en')
        self.db.rollback()
        self.assertEqual(len(self.events('practice_goal_shown')), 0)

    def test_existing_weekly_report_includes_practice_without_inventing_qualified_users(self):
        # Use a fixed cohort day rather than racing PostgreSQL's clock against
        # the application's as_of timestamp immediately after insertion.
        self.fixture.source.created_at = datetime(2026, 9, 18, tzinfo=timezone.utc)
        self.db.commit()
        cohort_day = self.fixture.source.created_at.date()
        snapshot = load_stage_a_snapshot_from_db(self.db, start_date=cohort_day, end_date=cohort_day)
        practice = snapshot['practice']
        self.assertEqual(practice['data_source'], 'database')
        self.assertGreaterEqual(practice['all_review_population']['all_reviews'], 1)
        self.assertEqual(practice['a7']['mature_denominator'], 0)
        self.assertIsNone(practice['a7']['rate'])
        rendered = render_product_analytics_weekly_markdown(snapshot)
        self.assertIn('Practice Analytics Snapshot', rendered)
        self.assertIn('retake_coach', rendered)
