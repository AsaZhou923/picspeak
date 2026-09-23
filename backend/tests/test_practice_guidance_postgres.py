"""Practice guidance contracts on PostgreSQL."""
from __future__ import annotations

import os
import sys
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import CurrentActor
from app.db.models import (
    Photo,
    PhotoStatus,
    PracticeAttempt,
    PracticeSceneGroup,
    PracticeSession,
    ProductAnalyticsEvent,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.practice_schemas import PracticeSceneGroupRequest
from app.services.practice_guidance import settings as guidance_settings
from app.services.practice_guidance import (
    get_practice_guidance_profile,
    get_practice_recommendations,
    upsert_practice_scene_group,
)

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PracticeGuidancePostgresTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.sessions()
        self.suffix = uuid4().hex
        self.user = User(
            public_id=f'usr_guidance_{self.suffix}',
            email=f'{self.suffix}@guidance.example.test',
            username=f'guidance_{self.suffix[:20]}',
            plan=UserPlan.free,
            status=UserStatus.active,
            daily_quota_total=100,
            daily_quota_used=0,
        )
        self.other_user = User(
            public_id=f'usr_guidance_other_{self.suffix}',
            email=f'other-{self.suffix}@guidance.example.test',
            username=f'guidance_other_{self.suffix[:14]}',
            plan=UserPlan.free,
            status=UserStatus.active,
            daily_quota_total=100,
            daily_quota_used=0,
        )
        self.db.add_all([self.user, self.other_user])
        self.db.flush()
        self.actor = CurrentActor(self.user)
        self.user_ids = [self.user.id, self.other_user.id]

    def tearDown(self):
        self.db.rollback()
        self.db.query(ProductAnalyticsEvent).filter(ProductAnalyticsEvent.user_public_id.in_([self.user.public_id, self.other_user.public_id])).delete()
        self.db.query(PracticeSceneGroup).filter(PracticeSceneGroup.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(PracticeAttempt).filter(PracticeAttempt.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(PracticeSession).filter(PracticeSession.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(Review).filter(Review.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(ReviewTask).filter(ReviewTask.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(Photo).filter(Photo.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(User).filter(User.id.in_(self.user_ids)).delete()
        self.db.commit()
        self.db.close()
        self.engine.dispose()

    def _photo(self, owner: User, label: str) -> Photo:
        photo = Photo(
            public_id=f'pho_{self.suffix}_{label}',
            owner_user_id=owner.id,
            upload_id=f'u_{self.suffix}_{label}',
            bucket='practice-guidance-fixture',
            object_key=f'{self.suffix}/{label}.jpg',
            content_type='image/jpeg',
            size_bytes=100,
            status=PhotoStatus.READY,
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
        assessment_status: str | None = None,
        deleted: bool = False,
        image_type: str = 'street',
        created_at: datetime | None = None,
        comparable: bool = True,
        confidence: str = 'high',
        evidence: bool = True,
    ) -> Review:
        result_json = {
            'comparison': {
                'is_comparable': comparable,
                'comparison_confidence': confidence,
            }
        }
        if assessment_status is not None:
            result_json['goal_assessment'] = {
                'goal_version': 'goal-assessment-v1',
                'status': assessment_status,
                'evidence': [
                    {
                        'success_criterion': 'Make the goal visibly stronger.',
                        'before_observation': 'The source has a visible issue.',
                        'after_observation': 'The attempt changes the target cue.',
                        'conclusion': 'The target cue is traceable.',
                    }
                ] if evidence else [],
                'limitations': [],
                'next_action': 'Try another pass.',
            }
        review = Review(
            public_id=f'rev_{self.suffix}_{label}',
            owner_user_id=owner.id,
            photo_id=photo.id,
            mode=ReviewMode.flash,
            status=ReviewStatus.SUCCEEDED,
            image_type=image_type,
            schema_version='2.0',
            result_json=result_json,
            final_score=7,
            deleted_at=datetime.now(timezone.utc) if deleted else None,
            created_at=created_at,
        )
        self.db.add(review)
        self.db.flush()
        return review

    def _practice_row(
        self,
        label: str,
        *,
        status: str = 'partial',
        dimension: str = 'composition',
        scene: str | None = None,
        kind: str = 'capture_retake',
        source_deleted: bool = False,
        viewed: bool = True,
        comparable: bool = True,
        confidence: str = 'high',
        evidence: bool = True,
        owner: User | None = None,
        image_type: str = 'street',
        created_at: datetime | None = None,
    ) -> PracticeSession:
        owner = owner or self.user
        created_at = created_at or datetime.now(timezone.utc)
        source_photo = self._photo(owner, f'{label}_source')
        source = self._review(owner, source_photo, f'{label}_source', deleted=source_deleted, image_type=image_type, created_at=created_at)
        attempt_photo = self._photo(owner, f'{label}_attempt')
        result = self._review(
            owner,
            attempt_photo,
            f'{label}_result',
            assessment_status=status,
            image_type=image_type,
            created_at=created_at,
            comparable=comparable,
            confidence=confidence,
            evidence=evidence,
        )
        result.source_review_id = source.id
        self.db.add(result)
        session = PracticeSession(
            public_id=f'prs_{self.suffix}_{label}',
            owner_user_id=owner.id,
            source_review_id=source.id,
            source_photo_id=source_photo.id,
            practice_kind=kind,
            lifecycle='active',
            goal_snapshot={
                'goal_version': 'goal-assessment-v1',
                'goal': f'Improve {dimension} for {label}.',
                'dimension': dimension,
            },
            success_criteria=[{'key': 'main', 'label': f'Make {dimension} visibly stronger.'}],
            locale='en',
            request_hash=f'hash-{label}',
            created_at=created_at,
            updated_at=created_at,
        )
        self.db.add(session)
        self.db.flush()
        task = ReviewTask(
            public_id=f'tsk_{self.suffix}_{label}',
            photo_id=attempt_photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=TaskStatus.SUCCEEDED,
            request_payload={},
            created_at=created_at,
        )
        self.db.add(task)
        self.db.flush()
        attempt = PracticeAttempt(
            public_id=f'pra_{self.suffix}_{label}',
            session_id=session.id,
            owner_user_id=owner.id,
            task_id=task.id,
            review_id=result.id,
            sequence=1,
            photo_id=attempt_photo.id,
            source_review_id=source.id,
            attempt_kind=kind,
            request_hash=f'attempt-hash-{label}',
            created_at=created_at,
        )
        self.db.add(attempt)
        if scene is not None:
            self.db.add(
                PracticeSceneGroup(
                    public_id=f'psg_{self.suffix}_{label}',
                    owner_user_id=owner.id,
                    session_id=session.id,
                    label=scene,
                    description=None,
                )
            )
        if viewed:
            self.db.add(
                ProductAnalyticsEvent(
                    event_name='practice_result_viewed',
                    user_public_id=owner.public_id,
                    plan=owner.plan.value,
                    source='retake_coach',
                    page_path=f'/reviews/{result.public_id}',
                    locale='en',
                    dedupe_key=f'practice_result_viewed:{attempt.public_id}',
                    metadata_json={
                        'attempt_id': attempt.public_id,
                        'session_id': session.public_id,
                        'review_id': result.public_id,
                        'source_review_id': source.public_id,
                        'practice_kind': kind,
                        'goal_status': status,
                    },
                    created_at=created_at,
                )
            )
        self.db.flush()
        return session

    @contextmanager
    def _select_counter(self):
        counts = {'selects': 0}

        def before_cursor_execute(_conn, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith('SELECT'):
                counts['selects'] += 1

        event.listen(self.engine, 'before_cursor_execute', before_cursor_execute)
        try:
            yield counts
        finally:
            event.remove(self.engine, 'before_cursor_execute', before_cursor_execute)

    def test_thresholds_require_viewed_valid_capture_and_explicit_scene_groups(self):
        base = datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)
        self._practice_row('one', scene='street-day', created_at=base)
        self._practice_row('two', scene='street-night', created_at=base + timedelta(minutes=1))
        self.db.commit()

        profile = get_practice_guidance_profile(self.db, self.actor)
        self.assertEqual(profile.level, 'records_only')
        self.assertEqual(profile.coverage.valid_session_count, 2)
        self.assertEqual(profile.observations, [])

        self._practice_row('three', scene='street-day', created_at=base + timedelta(minutes=2))
        self.db.commit()
        profile = get_practice_guidance_profile(self.db, self.actor)
        self.assertEqual(profile.level, 'preliminary_observations')

        self._practice_row('missing-scene', scene=None, created_at=base + timedelta(minutes=3))
        self.db.commit()
        profile = get_practice_guidance_profile(self.db, self.actor)
        self.assertEqual(profile.level, 'records_only')
        self.assertEqual(profile.level_reason, 'scene_groups_required')
        self.assertEqual(profile.coverage.scene_group_count, 2)
        self.assertEqual(profile.coverage.untagged_session_count, 1)
        self.assertEqual(profile.observations, [])

    def test_profile_returns_all_scene_group_gaps_for_manual_labeling(self):
        base = datetime(2026, 9, 22, 10, 30, tzinfo=timezone.utc)
        sessions = [
            self._practice_row(f'gap{index}', scene=None, created_at=base + timedelta(minutes=index))
            for index in range(12)
        ]
        self.db.commit()

        profile = get_practice_guidance_profile(self.db, self.actor)

        self.assertEqual(profile.coverage.valid_session_count, 12)
        self.assertEqual(profile.coverage.untagged_session_count, 12)
        self.assertEqual(set(profile.scene_group_gaps), {session.public_id for session in sessions})
        self.assertEqual(len(profile.scene_group_gaps), 12)

    def test_profile_summary_requires_eight_capture_sessions_three_scenes_two_goals(self):
        base = datetime(2026, 9, 22, 11, 0, tzinfo=timezone.utc)
        for index in range(8):
            self._practice_row(
                f'summary{index}',
                scene=['street', 'window', 'interior'][index % 3],
                dimension='composition' if index < 4 else 'lighting',
                status='partial' if index % 2 else 'achieved',
                created_at=base + timedelta(minutes=index),
            )
        self.db.commit()

        profile = get_practice_guidance_profile(self.db, self.actor)

        self.assertEqual(profile.level, 'practice_summary')
        self.assertEqual(profile.coverage.valid_session_count, 8)
        self.assertEqual(profile.coverage.scene_group_count, 3)
        self.assertEqual(profile.coverage.goal_count, 8)

    def test_profile_and_recommendations_use_only_viewed_available_high_confidence_capture_evidence(self):
        base = datetime(2026, 9, 22, 11, 0, tzinfo=timezone.utc)
        kept = [
            self._practice_row('kept1', scene='street-day', status='partial', created_at=base),
            self._practice_row('kept2', scene='window-light', status='not_achieved', created_at=base + timedelta(minutes=1)),
            self._practice_row('kept3', scene='street-day', status='achieved', dimension='lighting', created_at=base + timedelta(minutes=2)),
        ]
        deleted = self._practice_row('deleted-source', scene='deleted-scene', status='partial', source_deleted=True, created_at=base + timedelta(minutes=3))
        unviewed = self._practice_row('unviewed', scene='street-day', status='partial', viewed=False, created_at=base + timedelta(minutes=4))
        indeterminate = self._practice_row('indeterminate', scene='street-day', status='indeterminate', created_at=base + timedelta(minutes=5))
        low_confidence = self._practice_row('low-confidence', scene='street-day', status='partial', confidence='low', created_at=base + timedelta(minutes=6))
        no_evidence = self._practice_row('no-evidence', scene='street-day', status='partial', evidence=False, created_at=base + timedelta(minutes=7))
        edit = self._practice_row('edit', scene='edit-scene', status='partial', kind='edit_revision', created_at=base + timedelta(minutes=8))
        same = self._practice_row('same', scene='same-scene', status='partial', kind='same_image_recheck', created_at=base + timedelta(minutes=9))
        self.db.commit()

        profile = get_practice_guidance_profile(self.db, self.actor, locale='zh')
        recommendations = get_practice_recommendations(self.db, self.actor, locale='zh')
        evidence_session_ids = {item.session_id for item in profile.recent_evidence}

        self.assertEqual(profile.level, 'preliminary_observations')
        self.assertTrue(any(item.kind == 'repeated_issue' for item in profile.observations))
        self.assertEqual(evidence_session_ids, {session.public_id for session in kept})
        for excluded in (deleted, unviewed, indeterminate, low_confidence, no_evidence, edit, same):
            self.assertNotIn(excluded.public_id, evidence_session_ids)
        self.assertEqual(profile.coverage.edit_revision_count, 1)
        self.assertEqual(profile.coverage.same_image_recheck_count, 1)
        self.assertTrue(any('有限观察' in item.body for item in profile.observations))
        self.assertGreaterEqual(len(profile.templates), 6)
        self.assertTrue(all(template.human_review_status == 'owner_confirmed_summary' for template in profile.templates))
        self.assertTrue(recommendations.recommendations)
        self.assertTrue(all(item.skip_available and item.change_goal_available for item in recommendations.recommendations))
        self.assertTrue(all(not item.accept_available and item.accept_payload is None for item in recommendations.recommendations))
        self.assertIn('推荐', recommendations.recommendations[0].reason)
        with patch.object(guidance_settings, 'practice_enabled', True):
            enabled = get_practice_recommendations(self.db, self.actor, locale='zh')
        self.assertTrue(
            all(item.accept_payload and item.accept_payload.locale == 'zh' for item in enabled.recommendations),
            [(item.accept_available, item.accept_payload.model_dump() if item.accept_payload else None) for item in enabled.recommendations],
        )

    def test_mixed_genre_recommendations_use_matching_template_conditions_and_owner_isolation(self):
        base = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)
        self._practice_row('portrait1', scene='portrait-window', status='partial', image_type='portrait', created_at=base)
        self._practice_row('portrait2', scene='portrait-studio', status='not_achieved', image_type='portrait', created_at=base + timedelta(minutes=1))
        self._practice_row('portrait3', scene='portrait-window', status='partial', image_type='portrait', created_at=base + timedelta(minutes=2))
        self._practice_row('other-owner', scene='street', owner=self.other_user, created_at=base + timedelta(minutes=3))
        self.db.commit()

        profile = get_practice_guidance_profile(self.db, self.actor, locale='ja')
        recommendations = get_practice_recommendations(self.db, self.actor, locale='ja')

        self.assertEqual(profile.level, 'preliminary_observations')
        self.assertTrue(all(item.session_id != f'prs_{self.suffix}_other-owner' for item in profile.recent_evidence))
        self.assertTrue(recommendations.recommendations)
        self.assertTrue(any('portrait' in template.applicable_genres for template in recommendations.templates))
        self.assertNotIn('Suggested from unresolved', recommendations.recommendations[0].reason)

    def test_missing_source_keeps_templates_but_no_submit_recommendation(self):
        profile = get_practice_guidance_profile(self.db, self.actor)
        recommendations = get_practice_recommendations(self.db, self.actor)

        self.assertEqual(profile.level, 'records_only')
        self.assertGreaterEqual(len(profile.templates), 6)
        self.assertEqual(recommendations.recommendations, [])
        self.assertGreaterEqual(len(recommendations.templates), 6)

    def test_current_plan_access_controls_expired_evidence(self):
        old = datetime.now(timezone.utc) - timedelta(days=90)
        session = self._practice_row('old-free', scene='old-scene', status='partial', created_at=old)
        self.db.commit()

        free_profile = get_practice_guidance_profile(self.db, CurrentActor(self.user))
        self.assertNotIn(session.public_id, {item.session_id for item in free_profile.recent_evidence})

        self.user.plan = UserPlan.pro
        self.db.add(self.user)
        self.db.commit()
        pro_profile = get_practice_guidance_profile(self.db, CurrentActor(self.user))
        self.assertIn(session.public_id, {item.session_id for item in pro_profile.recent_evidence})

    def test_profile_query_budget_is_constant_for_large_evidence_sets(self):
        base = datetime(2026, 9, 22, 13, 0, tzinfo=timezone.utc)
        for index in range(100):
            self._practice_row(
                f'budget{index}',
                scene=f'scene-{index % 4}',
                dimension='composition' if index % 2 else 'lighting',
                created_at=base + timedelta(seconds=index),
            )
        self.db.commit()

        with self._select_counter() as counts:
            profile = get_practice_guidance_profile(self.db, self.actor)

        self.assertEqual(profile.level, 'practice_summary')
        self.assertLessEqual(counts['selects'], 20)

    def test_scene_group_upsert_is_owner_only(self):
        session = self._practice_row('owner-scene', created_at=datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc))
        self.db.commit()

        response = upsert_practice_scene_group(
            self.db,
            self.actor,
            session.public_id,
            PracticeSceneGroupRequest(label='indoor portrait', description='Window side light'),
        )
        self.db.commit()

        self.assertEqual(response.session_id, session.public_id)
        self.assertEqual(response.label, 'indoor portrait')
        with self.assertRaises(Exception):
            upsert_practice_scene_group(
                self.db,
                CurrentActor(self.other_user),
                session.public_id,
                PracticeSceneGroupRequest(label='other user scene'),
            )


if __name__ == '__main__':
    unittest.main()
