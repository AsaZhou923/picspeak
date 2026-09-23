from __future__ import annotations

import json
import os
import tempfile
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import sys
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.practice_metrics import (  # noqa: E402
    build_practice_snapshot,
    load_practice_snapshot_from_db,
    render_practice_analytics_markdown,
)
from app.services.practice_reconciliation import reconcile_practice_costs  # noqa: E402
from scripts.export_practice_analytics_report import main as export_practice_report  # noqa: E402


FIXTURE_PATH = BACKEND_ROOT / 'tests' / 'fixtures' / 'practice_metric_examples.json'
TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


class PracticeMetricsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.payload = json.loads(FIXTURE_PATH.read_text(encoding='utf-8'))

    def test_fixture_aggregate_matches_contract(self) -> None:
        snapshot = build_practice_snapshot(self.payload)
        data = snapshot.to_dict()

        self.assertEqual(data['a7']['mature_denominator'], 9)
        self.assertEqual(data['a7']['numerator'], 6)
        self.assertEqual(data['l14']['mature_denominator'], 6)
        self.assertEqual(data['l14']['numerator'], 1)
        self.assertEqual(data['w4']['mature_denominator'], 2)
        self.assertEqual(data['w4']['numerator'], 1)
        self.assertEqual(data['goal_assessments']['denominator'], 11)
        self.assertEqual(data['goal_assessments']['indeterminate_numerator'], 1)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.722000')
        self.assertEqual(data['costs']['unknown_cost_request_count'], 1)
        self.assertEqual(data['costs']['valid_capture_loop_count'], 9)
        self.assertEqual(data['costs']['known_cost_unit_cost_lower_bound_usd'], '0.080222')
        self.assertIn('practice_funnel', data)
        self.assertEqual(data['practice_funnel']['schema_version'], 'practice-funnel-v1')

    def test_r1_funnel_hand_calculated_contract(self) -> None:
        payload = {
            'as_of': '2026-12-15T00:00:00Z',
            'start_date': '2026-10-01T00:00:00Z',
            'end_date': '2026-12-31T00:00:00Z',
            'fixtures': [
                self._r1_user('u01_paid_helpful', '2026-10-03T09:00:00Z', shown='2026-10-02T10:00:00Z',
                              feedbacks=[{'verdict': 'helpful', 'created_at': '2026-10-04T00:00:00Z'}],
                              payments=[{'paid_at': '2026-10-20T00:00:00Z', 'amount_usd': '12.00'}]),
                self._r1_user('u02_no_exposure', '2026-10-04T09:00:00Z', shown=None),
                self._r1_user('u03_exposed_no_accept', '2026-10-05T09:00:00Z', shown='2026-10-05T08:00:00Z',
                              accepted=False, attempts=[]),
                self._r1_user('u04_immature_exposure', '2026-12-14T10:00:00Z', shown='2026-12-14T09:00:00Z',
                              attempts=[]),
                self._r1_user('u05_accept_no_attempt', '2026-10-06T09:00:00Z', shown='2026-10-06T08:00:00Z',
                              attempts=[]),
                self._r1_user('u06_pending', '2026-10-07T09:00:00Z', shown='2026-10-07T08:00:00Z',
                              attempt_updates={'analysis_completed_at': None, 'result_viewed_at': None, 'task_status': 'PENDING',
                                               'goal_status': None, 'evidence': []}),
                self._r1_user('u07_failed', '2026-10-07T10:00:00Z', shown='2026-10-07T09:00:00Z',
                              attempt_updates={'analysis_completed_at': None, 'result_viewed_at': None, 'task_status': 'FAILED',
                                               'failed': True, 'goal_status': None, 'evidence': []}),
                self._r1_user('u08_timeout', '2026-10-07T11:00:00Z', shown='2026-10-07T10:00:00Z',
                              attempt_updates={'analysis_completed_at': None, 'result_viewed_at': None, 'task_status': 'EXPIRED',
                                               'goal_status': None, 'evidence': []}),
                self._r1_user('u09_changed_feedback', '2026-10-08T09:00:00Z', shown='2026-10-08T08:00:00Z',
                              feedbacks=[
                                  {'verdict': 'helpful', 'created_at': '2026-10-09T00:00:00Z'},
                                  {'verdict': 'not_helpful', 'created_at': '2026-10-10T00:00:00Z'},
                              ]),
                self._r1_user('u10_prepaid', '2026-10-09T09:00:00Z', shown='2026-10-09T08:00:00Z',
                              payments=[{'paid_at': '2026-10-01T00:00:00Z', 'amount_usd': '12.00'}]),
            ],
        }

        r1 = build_practice_snapshot(payload).to_dict()['practice_funnel']

        self.assertEqual(
            r1['weekly_qualified_users'],
            [
                {'week_start': '2026-09-28T00:00:00Z', 'qualified_user_count': 2},
                {'week_start': '2026-10-05T00:00:00Z', 'qualified_user_count': 2},
            ],
        )
        self.assertEqual(r1['goal_acceptance_24h']['mature_denominator'], 8)
        self.assertEqual(r1['goal_acceptance_24h']['numerator'], 7)
        self.assertEqual(r1['goal_acceptance_24h']['pending_denominator'], 1)
        self.assertEqual(r1['goal_acceptance_24h']['exception_count'], 1)
        self.assertEqual(r1['accepted_to_attempt_7d']['mature_denominator'], 8)
        self.assertEqual(r1['accepted_to_attempt_7d']['numerator'], 7)
        self.assertEqual(r1['accepted_to_attempt_7d']['pending_denominator'], 1)
        self.assertEqual(r1['comparison_availability']['mature_denominator'], 4)
        self.assertEqual(r1['comparison_availability']['numerator'], 4)
        self.assertEqual(r1['request_success']['mature_denominator'], 7)
        self.assertEqual(r1['request_success']['numerator'], 4)
        self.assertEqual(r1['request_success']['state_counts'], {'succeeded': 4, 'pending': 1, 'failed': 1, 'timeout': 1})
        self.assertEqual(r1['feedback']['response_rate']['mature_denominator'], 4)
        self.assertEqual(r1['feedback']['response_rate']['numerator'], 2)
        self.assertEqual(r1['feedback']['helpfulness_rate']['mature_denominator'], 2)
        self.assertEqual(r1['feedback']['helpfulness_rate']['numerator'], 1)
        self.assertEqual(r1['training_paid_30d']['mature_denominator'], 3)
        self.assertEqual(r1['training_paid_30d']['numerator'], 1)
        self.assertEqual(r1['training_paid_30d']['previously_paid_user_count'], 1)

    def test_r1_payment_rate_is_unknown_without_payment_evidence(self) -> None:
        payload = {
            'as_of': '2026-12-15T00:00:00Z',
            'fixtures': [self._r1_user('u_no_payment_evidence', '2026-10-03T09:00:00Z', shown='2026-10-02T10:00:00Z')],
        }

        paid = build_practice_snapshot(payload).to_dict()['practice_funnel']['training_paid_30d']

        self.assertIsNone(paid['rate'])
        self.assertEqual(paid['null_reason'], 'insufficient_payment_evidence')
        self.assertEqual(paid['evidence_state'], 'unknown')

    def test_cost_reconciliation_reports_offline_differences_idempotently(self) -> None:
        report = reconcile_practice_costs({
            'estimated_costs': [
                {'request_id': 'call_1', 'provider': 'openai', 'model': 'gpt', 'cost_usd': '0.010000',
                 'rate_version': 'rate-v1'},
                {'request_id': 'call_2', 'provider': 'openai', 'model': 'gpt', 'cost_usd': '0.020000',
                 'rate_version': 'rate-v1'},
                {'request_id': 'call_3', 'provider': 'openai', 'model': 'gpt', 'cost_usd': '0.030000',
                 'rate_version': 'rate-v1'},
            ],
            'billing_rows': [
                {'billing_row_id': 'bill_1', 'request_id': 'call_1', 'provider': 'openai', 'amount': '0.010000'},
                {'billing_row_id': 'bill_1', 'request_id': 'call_1', 'provider': 'openai', 'amount': '0.010000'},
                {'billing_row_id': 'bill_2', 'request_id': 'call_2', 'provider': 'openai', 'amount': '0.025000'},
                {'billing_row_id': 'bill_extra', 'request_id': 'call_extra', 'provider': 'openai', 'amount': '0.040000'},
                {'billing_row_id': 'bill_refund', 'request_id': 'call_2', 'provider': 'openai', 'amount': '-0.005000',
                 'kind': 'refund'},
            ],
        })

        self.assertEqual(report['reconciliation_status'], 'reconciled_with_differences')
        self.assertEqual(report['status_counts']['matched'], 1)
        self.assertEqual(report['status_counts']['amount_mismatch'], 1)
        self.assertEqual(report['status_counts']['missing_bill'], 1)
        self.assertEqual(report['status_counts']['unmatched_bill'], 1)
        self.assertEqual(report['status_counts']['refund_or_credit'], 1)
        self.assertEqual(report['matched_bill_total'], '0.035000')
        self.assertEqual(report['refund_or_credit_total'], '-0.005000')
        self.assertEqual(len(report['unmatched_billing_rows']), 1)

    def test_cost_reconciliation_stays_unreconciled_without_bills(self) -> None:
        report = reconcile_practice_costs({
            'estimated_costs': [{'request_id': 'call_1', 'cost_usd': '0.010000'}],
            'billing_rows': [],
        })

        self.assertEqual(report['reconciliation_status'], 'not_reconciled')
        self.assertEqual(report['status_counts']['missing_bill'], 1)
        self.assertIn('No production connection is made.', report['limitations'])

    def test_cost_reconciliation_preserves_conflicts_and_ambiguous_rows(self) -> None:
        report = reconcile_practice_costs({
            'estimated_costs': [
                {'request_id': 'call_multi', 'provider': 'openai', 'model': 'gpt', 'rate_version': 'rate-v1',
                 'currency': 'USD', 'cost_usd': '0.030000', 'period_start': '2026-10-01',
                 'period_end': '2026-11-01'},
                {'request_id': 'call_conflict', 'provider': 'openai', 'model': 'gpt', 'rate_version': 'rate-v1',
                 'currency': 'USD', 'cost_usd': '0.010000'},
            ],
            'billing_rows': [
                {'billing_row_id': 'bill_multi_a', 'request_id': 'call_multi', 'provider': 'openai',
                 'model': 'gpt', 'rate_version': 'rate-v1', 'currency': 'USD', 'amount': '0.010000',
                 'period_start': '2026-10-01', 'period_end': '2026-11-01'},
                {'billing_row_id': 'bill_multi_b', 'request_id': 'call_multi', 'provider': 'openai',
                 'model': 'gpt', 'rate_version': 'rate-v1', 'currency': 'USD', 'amount': '0.020000',
                 'period_start': '2026-10-01', 'period_end': '2026-11-01'},
                {'billing_row_id': 'bill_conflict', 'request_id': 'call_conflict', 'provider': 'openai',
                 'currency': 'USD', 'amount': '0.010000'},
                {'billing_row_id': 'bill_conflict', 'request_id': 'call_conflict', 'provider': 'openai',
                 'currency': 'EUR', 'amount': '0.010000'},
                {'billing_row_id': 'bill_no_key', 'provider': 'openai', 'currency': 'USD', 'amount': '0.040000'},
                {'billing_row_id': 'bill_refund', 'order_id': 'ord_1', 'refund_of_order_id': 'ord_original',
                 'provider': 'openai', 'currency': 'USD', 'amount': '-0.005000', 'kind': 'refund'},
            ],
        })

        self.assertEqual(report['reconciliation_status'], 'reconciled_with_differences')
        self.assertEqual(report['status_counts']['ambiguous'], 2)
        self.assertEqual(report['status_counts']['duplicate_conflict'], 2)
        self.assertEqual(report['status_counts']['unmatched_bill'], 1)
        self.assertEqual(report['status_counts']['refund_or_credit'], 1)
        self.assertEqual(report['matched_bill_total'], '0.000000')
        self.assertEqual(report['disputed_bill_total'], '0.050000')
        ambiguous = next(row for row in report['rows'] if row['status'] == 'ambiguous')
        self.assertEqual(ambiguous['billing_amount'], '0.030000')
        self.assertIn('bill_multi_a', ambiguous['billing_row_id'])
        self.assertEqual(report['unmatched_billing_rows'][0]['billing_row_id'], 'bill_no_key')
        self.assertEqual(report['refund_or_credit_rows'][0]['refund_of_order_id'], 'ord_original')

    @staticmethod
    def _r1_user(
        user_id: str,
        accepted_at: str,
        *,
        shown: str | None,
        accepted: bool = True,
        attempts: list[dict[str, object]] | None = None,
        attempt_updates: dict[str, object] | None = None,
        feedbacks: list[dict[str, object]] | None = None,
        payments: list[dict[str, object]] | None = None,
    ) -> dict[str, object]:
        day = accepted_at[:10]
        hour = int(accepted_at[11:13])
        base_attempt = {
            'attempt_id': f'pra_{user_id}',
            'accepted_at': accepted_at,
            'analysis_completed_at': f'{day}T{hour + 1:02d}:00:00Z',
            'result_viewed_at': f'{day}T{hour + 1:02d}:05:00Z',
            'goal_status': 'partial',
            'cost_usd': '0.010000',
            'expected_valid_loop': True,
            'access_snapshot_verified': True,
        }
        if attempt_updates:
            base_attempt.update(attempt_updates)
        if feedbacks:
            base_attempt['feedbacks'] = feedbacks
        session = {
            'session_id': f'prs_{user_id}',
            'practice_kind': 'capture_retake',
            'created_at': accepted_at,
            'goal_shown_at': shown,
            'goal_accepted_at': accepted_at,
            'accepted': accepted,
            'attempts': [base_attempt] if attempts is None else attempts,
        }
        return {
            'id': f'fx_{user_id}',
            'user_id': user_id,
            'first_qualified_review_at': '2026-10-01T00:00:00Z',
            'sessions': [session],
            'payment_events': payments or [],
        }

    def test_each_fixture_expected_a7_fields_match(self) -> None:
        for fixture in self.payload['fixtures']:
            with self.subTest(fixture=fixture['id']):
                snapshot = build_practice_snapshot({'fixtures': [fixture], 'as_of': self.payload['as_of']})
                expected = fixture.get('expected', {})
                if 'a7_denominator' in expected:
                    self.assertEqual(snapshot.a7.mature_denominator, expected['a7_denominator'])
                if 'a7_numerator' in expected:
                    self.assertEqual(snapshot.a7.numerator, expected['a7_numerator'])
                if 'unknown_cost_request_count' in expected:
                    self.assertEqual(snapshot.costs.unknown_cost_request_count, expected['unknown_cost_request_count'])

    def test_same_session_indeterminate_then_valid_counts_once(self) -> None:
        fixture = next(item for item in self.payload['fixtures'] if item['id'] == 'fx05_indeterminate_then_valid_same_session')
        snapshot = build_practice_snapshot({'fixtures': [fixture], 'as_of': self.payload['as_of']})

        self.assertEqual(snapshot.goal_assessments.denominator, 2)
        self.assertEqual(snapshot.goal_assessments.indeterminate_numerator, 1)
        self.assertEqual(snapshot.costs.valid_capture_loop_count, 1)
        self.assertEqual(snapshot.attempt_outcome_counts['indeterminate'], 1)

    def test_unknown_cost_keeps_unit_cost_null_and_lower_bound_separate(self) -> None:
        snapshot = build_practice_snapshot(self.payload)

        self.assertIsNone(snapshot.costs.unit_cost_usd)
        self.assertEqual(snapshot.costs.unit_cost_null_reason, 'unknown_cost_present')
        self.assertEqual(str(snapshot.costs.known_cost_unit_cost_lower_bound_usd), '0.080222')
        self.assertNotEqual(str(snapshot.costs.known_cost_unit_cost_lower_bound_usd), '0')

    def test_generation_reference_costs_enter_cost_coverage_without_changing_loops(self) -> None:
        fixture = next(item for item in self.payload['fixtures'] if item['id'] == 'fx01_basic_a7_success')
        enriched = {
            **fixture,
            'generation_reference_costs': [
                {'task_id': 'igt_ref', 'cost_usd': '0.250000', 'source': 'generation_reference'},
            ],
        }
        snapshot = build_practice_snapshot({'fixtures': [enriched], 'as_of': self.payload['as_of']})

        self.assertEqual(snapshot.costs.valid_capture_loop_count, 1)
        self.assertEqual(str(snapshot.costs.known_practice_cost_usd), '0.314000')
        self.assertEqual(snapshot.costs.total_cost_request_count, 2)
        self.assertEqual(snapshot.costs.unknown_cost_request_count, 0)
        self.assertEqual(str(snapshot.costs.unit_cost_usd), '0.314000')

    def test_no_loop_returns_unit_cost_null_reason(self) -> None:
        fixture = next(item for item in self.payload['fixtures'] if item['id'] == 'fx03_mature_no_attempt')
        snapshot = build_practice_snapshot({'fixtures': [fixture], 'as_of': self.payload['as_of']})

        self.assertEqual(snapshot.costs.valid_capture_loop_count, 0)
        self.assertIsNone(snapshot.costs.unit_cost_usd)
        self.assertEqual(snapshot.costs.unit_cost_null_reason, 'no_valid_capture_loops')

    def test_pure_fixture_without_access_snapshot_stays_diagnostic(self) -> None:
        base_attempt = {
            'analysis_completed_at': '2026-10-02T01:00:00Z',
            'result_viewed_at': '2026-10-02T02:00:00Z',
            'goal_status': 'partial',
            'cost_usd': '0.100000',
            'expected_valid_loop': True,
        }
        payload = {
            'as_of': '2026-11-01T00:00:00Z',
            'fixtures': [{
                'id': 'fx_missing_access_snapshot',
                'user_id': 'usr_missing_access_snapshot',
                'eligibility': 'qualified',
                'first_qualified_review_at': '2026-10-01T00:00:00Z',
                'sessions': [{
                    'session_id': 'prs_missing_access_snapshot',
                    'practice_kind': 'capture_retake',
                    'created_at': '2026-10-02T00:00:00Z',
                    'attempts': [
                        {'attempt_id': 'pra_missing_access_snapshot', **base_attempt},
                        {'attempt_id': 'pra_string_access_snapshot', **base_attempt, 'access_snapshot_verified': 'true'},
                        {'attempt_id': 'pra_int_access_snapshot', **base_attempt, 'access_snapshot_verified': 1},
                    ],
                }],
            }],
        }

        data = build_practice_snapshot(payload).to_dict()

        self.assertEqual(data['costs']['valid_capture_loop_count'], 0)
        self.assertEqual(data['costs']['excluded_valid_capture_loop_count'], 0)
        self.assertEqual(data['attempt_outcome_counts']['learning_excluded_missing_access_snapshot'], 3)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.300000')

    def test_pure_access_helper_excludes_missing_objects_owner_and_lineage(self) -> None:
        from types import SimpleNamespace

        from app.db.models import PhotoStatus, ReviewStatus, TaskStatus
        from app.services.practice_metrics import _validated_goal_status_from_db

        owner_id = 10
        session = SimpleNamespace(id=1, owner_user_id=owner_id, source_review_id=20, source_photo_id=30)
        attempt = SimpleNamespace(id=2, owner_user_id=owner_id, review_id=40, task_id=50, source_review_id=20, photo_id=60)
        task = SimpleNamespace(id=50, public_id='tsk_attempt', owner_user_id=owner_id, status=TaskStatus.SUCCEEDED)
        source_review = SimpleNamespace(id=20, public_id='rev_source', owner_user_id=owner_id, photo_id=30, status=ReviewStatus.SUCCEEDED,
                                        deleted_at=None, created_at=datetime(2026, 10, 1, tzinfo=timezone.utc), image_type='portrait')
        source_photo = SimpleNamespace(id=30, public_id='pho_source', owner_user_id=owner_id, status=PhotoStatus.READY)
        target_photo = SimpleNamespace(id=60, public_id='pho_target', owner_user_id=owner_id, status=PhotoStatus.READY)
        review = SimpleNamespace(
            id=40, public_id='rev_attempt', owner_user_id=owner_id, photo_id=60, source_review_id=20, status=ReviewStatus.SUCCEEDED,
            deleted_at=None, created_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
            result_json={
                'comparison': {'is_comparable': True, 'comparison_confidence': 'high'},
                'goal_assessment': {'status': 'partial', 'evidence': [{'conclusion': 'partial'}]},
            },
        )

        cases = [
            ('source_missing', {**locals(), 'source_review': None}, 'source_photo_unavailable'),
            ('target_missing', {**locals(), 'target_photo': None}, 'target_photo_unavailable'),
            ('owner_missing', {**locals(), 'owner_exists': False}, 'owner_missing'),
            ('lineage_mismatch', {**locals(), 'review': SimpleNamespace(**{**review.__dict__, 'source_review_id': 999})}, 'lineage_mismatch'),
        ]
        for _name, values, expected in cases:
            with self.subTest(reason=expected):
                result = _validated_goal_status_from_db(
                    values['attempt'],
                    values['session'],
                    values['task'],
                    values['review'],
                    values['source_review'],
                    values['target_photo'],
                    values['source_photo'],
                    None,
                    values.get('owner_exists', True),
                )
                self.assertEqual(result['learning_exclusion_reasons'], [expected])

    def test_unknown_eligibility_loops_are_diagnostic_not_official_denominators(self) -> None:
        payload = {
            'as_of': '2026-11-01T00:00:00Z',
            'fixtures': [{
                'id': 'fx_unknown_two_loops',
                'user_id': 'usr_unknown',
                'eligibility': 'unknown',
                'first_review_at': '2026-10-01T00:00:00Z',
                'sessions': [
                    {
                        'session_id': 'prs_unknown_1',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-10-02T00:00:00Z',
                        'attempts': [{
                            'attempt_id': 'pra_unknown_1',
                            'analysis_completed_at': '2026-10-02T01:00:00Z',
                            'result_viewed_at': '2026-10-02T02:00:00Z',
                            'goal_status': 'partial',
                            'cost_usd': '0.100000',
                            'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        }],
                    },
                    {
                        'session_id': 'prs_unknown_2',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-10-04T00:00:00Z',
                        'attempts': [{
                            'attempt_id': 'pra_unknown_2',
                            'analysis_completed_at': '2026-10-04T01:00:00Z',
                            'result_viewed_at': '2026-10-04T02:00:00Z',
                            'goal_status': 'achieved',
                            'cost_usd': '0.100000',
                            'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        }],
                    },
                ],
            }],
        }

        snapshot = build_practice_snapshot(payload)
        data = snapshot.to_dict()

        self.assertEqual(data['all_review_population']['all_reviews'], 1)
        self.assertEqual(data['eligibility_counts']['unknown'], 1)
        self.assertEqual(data['a7']['mature_denominator'], 0)
        self.assertEqual(data['l14']['mature_denominator'], 0)
        self.assertEqual(data['l14']['numerator'], 0)
        self.assertEqual(data['costs']['valid_capture_loop_count'], 0)
        self.assertEqual(data['costs']['excluded_valid_capture_loop_count'], 2)
        self.assertGreaterEqual(data['attempt_outcome_counts']['diagnostic_valid_capture_loop_excluded'], 2)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.200000')
        self.assertIsNone(snapshot.costs.unit_cost_usd)

    def test_unqualified_cost_does_not_pollute_qualified_unit_cost(self) -> None:
        payload = {
            'as_of': '2026-11-01T00:00:00Z',
            'fixtures': [
                {
                    'id': 'fx_qualified_low_cost',
                    'user_id': 'usr_qualified_low_cost',
                    'eligibility': 'qualified',
                    'first_qualified_review_at': '2026-10-01T00:00:00Z',
                    'sessions': [{
                        'session_id': 'prs_qualified_low_cost',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-10-02T00:00:00Z',
                        'attempts': [{
                            'attempt_id': 'pra_qualified_low_cost',
                            'analysis_completed_at': '2026-10-02T01:00:00Z',
                            'result_viewed_at': '2026-10-02T02:00:00Z',
                            'goal_status': 'partial',
                            'cost_usd': '0.100000',
                            'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        }],
                    }],
                },
                {
                    'id': 'fx_unqualified_high_cost',
                    'user_id': 'usr_unqualified_high_cost',
                    'eligibility': 'unqualified',
                    'first_review_at': '2026-10-01T00:00:00Z',
                    'sessions': [{
                        'session_id': 'prs_unqualified_high_cost',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-10-02T00:00:00Z',
                        'attempts': [{
                            'attempt_id': 'pra_unqualified_high_cost',
                            'analysis_completed_at': '2026-10-02T01:00:00Z',
                            'result_viewed_at': '2026-10-02T02:00:00Z',
                            'goal_status': 'partial',
                            'cost_usd': '9.900000',
                            'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        }],
                    }],
                },
            ],
        }

        data = build_practice_snapshot(payload).to_dict()

        self.assertEqual(data['costs']['known_practice_cost_usd'], '10.000000')
        self.assertEqual(data['costs']['valid_capture_loop_count'], 1)
        self.assertEqual(data['costs']['excluded_valid_capture_loop_count'], 1)
        self.assertEqual(data['costs']['unit_cost_usd'], '0.100000')

    def test_windowed_retention_uses_history_but_anchors_cohorts_to_window(self) -> None:
        payload = {
            'as_of': '2026-10-30T00:00:00Z',
            'start_date': '2026-09-01T00:00:00Z',
            'end_date': '2026-09-08T00:00:00Z',
            'fixtures': [
                {
                    'id': 'fx_a7_cross_end',
                    'user_id': 'usr_a7_cross_end',
                    'first_qualified_review_at': '2026-09-07T00:00:00Z',
                    'sessions': [{
                        'session_id': 'prs_a7_cross_end',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-09-08T00:00:00Z',
                        'attempts': [{
                            'attempt_id': 'pra_a7_cross_end',
                            'analysis_completed_at': '2026-09-10T01:00:00Z',
                            'result_viewed_at': '2026-09-10T02:00:00Z',
                            'goal_status': 'partial',
                            'cost_usd': '0.100000',
                            'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        }],
                    }],
                },
                {
                    'id': 'fx_w4_return_after_window',
                    'user_id': 'usr_w4_return_after_window',
                    'first_qualified_review_at': '2026-09-01T00:00:00Z',
                    'sessions': [
                        {
                            'session_id': 'prs_w4_first',
                            'practice_kind': 'capture_retake',
                            'created_at': '2026-09-03T00:00:00Z',
                            'attempts': [{
                                'attempt_id': 'pra_w4_first',
                                'analysis_completed_at': '2026-09-03T01:00:00Z',
                                'result_viewed_at': '2026-09-03T02:00:00Z',
                                'goal_status': 'partial',
                                'cost_usd': '0.100000',
                                'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                            }],
                        },
                        {
                            'session_id': 'prs_w4_return',
                            'practice_kind': 'capture_retake',
                            'created_at': '2026-09-26T00:00:00Z',
                            'attempts': [{
                                'attempt_id': 'pra_w4_return',
                                'analysis_completed_at': '2026-09-26T01:00:00Z',
                                'result_viewed_at': '2026-09-26T02:00:00Z',
                                'goal_status': 'achieved',
                                'cost_usd': '0.100000',
                                'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                            }],
                        },
                    ],
                },
                {
                    'id': 'fx_same_session_first_before_window',
                    'user_id': 'usr_same_session_first_before_window',
                    'first_qualified_review_at': '2026-08-20T00:00:00Z',
                    'sessions': [{
                        'session_id': 'prs_same_session_history',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-08-25T00:00:00Z',
                        'attempts': [
                            {
                                'attempt_id': 'pra_same_session_before',
                                'analysis_completed_at': '2026-08-25T01:00:00Z',
                                'result_viewed_at': '2026-08-25T02:00:00Z',
                                'goal_status': 'partial',
                                'cost_usd': '0.100000',
                                'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                            },
                            {
                                'attempt_id': 'pra_same_session_inside',
                                'analysis_completed_at': '2026-09-02T01:00:00Z',
                                'result_viewed_at': '2026-09-02T02:00:00Z',
                                'goal_status': 'achieved',
                                'cost_usd': '0.100000',
                                'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                            },
                        ],
                    }],
                },
                {
                    'id': 'fx_prequalification_loop',
                    'user_id': 'usr_prequalification_loop',
                    'first_qualified_review_at': '2026-09-05T00:00:00Z',
                    'sessions': [{
                        'session_id': 'prs_prequalification_loop',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-09-01T00:00:00Z',
                        'attempts': [{
                            'attempt_id': 'pra_prequalification_loop',
                            'analysis_completed_at': '2026-09-02T01:00:00Z',
                            'result_viewed_at': '2026-09-02T02:00:00Z',
                            'goal_status': 'partial',
                            'cost_usd': '0.100000',
                            'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        }],
                    }],
                },
            ],
        }

        snapshot = build_practice_snapshot(payload)
        data = snapshot.to_dict()

        self.assertEqual(data['a7']['mature_denominator'], 3)
        self.assertEqual(data['a7']['numerator'], 2)
        self.assertEqual(data['w4']['mature_denominator'], 1)
        self.assertEqual(data['w4']['numerator'], 1)
        self.assertEqual(data['l14']['mature_denominator'], 1)
        self.assertEqual(data['l14']['numerator'], 0)
        self.assertEqual(data['attempt_outcome_counts']['valid_capture_loop'], 4)
        self.assertEqual(data['attempt_outcome_counts']['valid_capture_loop_in_window'], 1)
        self.assertEqual(data['costs']['valid_capture_loop_count'], 1)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.300000')
        self.assertEqual(data['costs']['unit_cost_usd'], '0.300000')

    def test_cost_rows_use_call_created_at_not_outer_attempt_time(self) -> None:
        payload = {
            'as_of': '2026-09-04T00:00:00Z',
            'start_date': '2026-09-02T00:00:00Z',
            'end_date': '2026-09-03T00:00:00Z',
            'fixtures': [{
                'id': 'fx_rev02_cost_row_window',
                'user_id': 'usr_rev02',
                'first_qualified_review_at': '2026-09-01T00:00:00Z',
                'sessions': [{
                    'session_id': 'prs_rev02',
                    'practice_kind': 'capture_retake',
                    'created_at': '2026-09-01T00:00:00Z',
                    'attempts': [{
                        'attempt_id': 'pra_rev02',
                        'analysis_completed_at': '2026-09-01T01:00:00Z',
                        'result_viewed_at': '2026-09-01T02:00:00Z',
                        'goal_status': 'partial',
                        'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        'cost_rows': [
                            {'id': 'before', 'call_key': 'pair-before', 'stage': 'pair', 'outcome': 'succeeded',
                             'created_at': '2026-09-01T23:59:59Z', 'cost_usd': '0.010000'},
                            {'id': 'inside', 'call_key': 'pair-inside', 'stage': 'pair', 'outcome': 'succeeded',
                             'created_at': '2026-09-02T00:00:00Z', 'cost_usd': '0.120000'},
                            {'id': 'end', 'call_key': 'pair-end', 'stage': 'pair', 'outcome': 'succeeded',
                             'created_at': '2026-09-03T00:00:00Z', 'cost_usd': '0.030000'},
                            {'id': 'legacy', 'call_key': 'pair-legacy', 'stage': 'pair', 'outcome': 'unknown',
                             'cost_usd': None},
                        ],
                    }],
                }],
            }],
        }

        data = build_practice_snapshot(payload).to_dict()

        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.120000')
        self.assertEqual(data['costs']['known_cost_request_count'], 1)
        self.assertEqual(data['costs']['unknown_cost_request_count'], 0)
        self.assertEqual(data['costs']['unwindowable_cost_request_count'], 1)

        adjacent_payload = {**payload, 'start_date': '2026-09-03T00:00:00Z', 'end_date': '2026-09-04T00:00:00Z'}
        adjacent = build_practice_snapshot(adjacent_payload).to_dict()
        self.assertEqual(adjacent['costs']['known_practice_cost_usd'], '0.030000')
        self.assertEqual(adjacent['costs']['known_cost_request_count'], 1)

    def test_legacy_cost_rows_without_created_at_are_unwindowable_not_repeated_unknowns(self) -> None:
        payload = {
            'as_of': '2026-09-04T00:00:00Z',
            'start_date': '2026-09-02T00:00:00Z',
            'end_date': '2026-09-03T00:00:00Z',
            'fixtures': [{
                'id': 'fx_legacy_missing_time',
                'user_id': 'usr_legacy_missing_time',
                'first_qualified_review_at': '2026-09-01T00:00:00Z',
                'sessions': [{
                    'session_id': 'prs_legacy_missing_time',
                    'practice_kind': 'capture_retake',
                    'created_at': '2026-09-01T00:00:00Z',
                    'attempts': [{
                        'attempt_id': 'pra_legacy_missing_time',
                        'analysis_completed_at': '2026-09-01T01:00:00Z',
                        'result_viewed_at': '2026-09-01T02:00:00Z',
                        'goal_status': 'partial',
                        'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        'cost_rows': [{
                            'id': 'legacy-missing-time',
                            'call_key': 'legacy-missing-time',
                            'stage': 'pair',
                            'outcome': 'unknown',
                            'cost_usd': None,
                        }],
                    }],
                }],
            }],
        }

        first = build_practice_snapshot(payload).to_dict()
        adjacent = build_practice_snapshot({**payload, 'start_date': '2026-09-03T00:00:00Z', 'end_date': '2026-09-04T00:00:00Z'}).to_dict()

        self.assertEqual(first['costs']['unknown_cost_request_count'], 0)
        self.assertEqual(adjacent['costs']['unknown_cost_request_count'], 0)
        self.assertEqual(first['costs']['unwindowable_cost_request_count'], 1)
        self.assertEqual(adjacent['costs']['unwindowable_cost_request_count'], 1)

    def test_qualified_unwindowable_cost_blocks_unit_cost_without_repeating_windows(self) -> None:
        payload = {
            'as_of': '2026-09-04T00:00:00Z',
            'start_date': '2026-09-02T00:00:00Z',
            'end_date': '2026-09-03T00:00:00Z',
            'fixtures': [{
                'id': 'fx_qualified_unwindowable',
                'user_id': 'usr_qualified_unwindowable',
                'first_qualified_review_at': '2026-09-01T00:00:00Z',
                'sessions': [{
                    'session_id': 'prs_qualified_unwindowable',
                    'practice_kind': 'capture_retake',
                    'created_at': '2026-09-01T00:00:00Z',
                    'attempts': [{
                        'attempt_id': 'pra_qualified_unwindowable',
                        'analysis_completed_at': '2026-09-02T01:00:00Z',
                        'result_viewed_at': '2026-09-02T02:00:00Z',
                        'goal_status': 'partial',
                        'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        'cost_rows': [
                            {'id': 'known', 'call_key': 'known', 'stage': 'pair', 'outcome': 'succeeded',
                             'created_at': '2026-09-02T01:00:00Z', 'cost_usd': '0.100000'},
                            {'id': 'legacy', 'call_key': 'legacy', 'stage': 'pair', 'outcome': 'unknown',
                             'cost_usd': None},
                        ],
                    }],
                }],
            }],
        }

        data = build_practice_snapshot(payload).to_dict()

        self.assertIsNone(data['costs']['unit_cost_usd'])
        self.assertEqual(data['costs']['unit_cost_null_reason'], 'unwindowable_cost_present')
        self.assertEqual(data['costs']['known_cost_unit_cost_lower_bound_usd'], '0.100000')
        self.assertEqual(data['costs']['official_unwindowable_cost_request_count'], 1)

    def test_unqualified_unwindowable_cost_does_not_block_qualified_unit_cost(self) -> None:
        payload = {
            'as_of': '2026-09-04T00:00:00Z',
            'fixtures': [
                {
                    'id': 'fx_qualified_windowed',
                    'user_id': 'usr_qualified_windowed',
                    'first_qualified_review_at': '2026-09-01T00:00:00Z',
                    'sessions': [{
                        'session_id': 'prs_qualified_windowed',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-09-01T00:00:00Z',
                        'attempts': [{
                            'attempt_id': 'pra_qualified_windowed',
                            'analysis_completed_at': '2026-09-02T01:00:00Z',
                            'result_viewed_at': '2026-09-02T02:00:00Z',
                            'goal_status': 'partial',
                            'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                            'cost_usd': '0.100000',
                        }],
                    }],
                },
                {
                    'id': 'fx_unqualified_unwindowable',
                    'user_id': 'usr_unqualified_unwindowable',
                    'eligibility': 'unqualified',
                    'first_review_at': '2026-09-01T00:00:00Z',
                    'sessions': [{
                        'session_id': 'prs_unqualified_unwindowable',
                        'practice_kind': 'capture_retake',
                        'created_at': '2026-09-01T00:00:00Z',
                        'attempts': [{
                            'attempt_id': 'pra_unqualified_unwindowable',
                            'analysis_completed_at': '2026-09-02T01:00:00Z',
                            'result_viewed_at': '2026-09-02T02:00:00Z',
                            'goal_status': 'partial',
                            'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                            'cost_rows': [{'id': 'legacy', 'call_key': 'legacy', 'stage': 'pair', 'outcome': 'unknown'}],
                        }],
                    }],
                },
            ],
        }

        data = build_practice_snapshot(payload).to_dict()

        self.assertEqual(data['costs']['unit_cost_usd'], '0.100000')
        self.assertIsNone(data['costs']['unit_cost_null_reason'])
        self.assertEqual(data['costs']['unwindowable_cost_request_count'], 1)
        self.assertEqual(data['costs']['official_unwindowable_cost_request_count'], 0)

    def test_future_session_is_excluded_from_historical_snapshot(self) -> None:
        payload = {
            'as_of': '2046-01-20T00:00:00Z',
            'start_date': '2046-01-01T00:00:00Z',
            'end_date': '2046-01-31T00:00:00Z',
            'fixtures': [{
                'id': 'fx_rev06_future_session',
                'user_id': 'usr_rev06',
                'first_qualified_review_at': '2046-01-01T00:00:00Z',
                'sessions': [{
                    'session_id': 'prs_rev06_future',
                    'practice_kind': 'capture_retake',
                    'created_at': '2046-02-01T00:00:00Z',
                    'attempts': [{
                        'attempt_id': 'pra_rev06_future',
                        'analysis_completed_at': '2046-01-02T01:00:00Z',
                        'result_viewed_at': '2046-01-02T02:00:00Z',
                        'goal_status': 'partial',
                        'expected_valid_loop': True,
                            'access_snapshot_verified': True,
                        'cost_usd': '0.030000',
                    }],
                }],
                'generation_reference_costs': [
                    {'task_id': 'future-source-cost', 'source': 'generation_reference',
                     'created_at': '2046-01-01T03:00:00Z', 'cost_usd': '0.030000'}
                ],
            }],
        }

        data = build_practice_snapshot(payload).to_dict()

        self.assertEqual(data['practice_kind_counts'].get('capture_retake', 0), 0)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.000000')
        self.assertEqual(data['costs']['total_cost_request_count'], 0)

    def test_markdown_reports_mature_windows_cost_unknown_and_small_sample(self) -> None:
        markdown = render_practice_analytics_markdown(build_practice_snapshot(self.payload))

        self.assertIn('| A7 first loop | 9 | 6 |', markdown)
        self.assertIn('Data source: `synthetic_fixture`', markdown)
        self.assertIn('Cost basis: `estimated`', markdown)
        self.assertIn('All incurred known cost', markdown)
        self.assertIn('Official qualified known cost numerator', markdown)
        self.assertIn('Unwindowable cost request count', markdown)
        self.assertIn('Windowed cost coverage', markdown)
        self.assertIn('| L14 second loop | 6 | 1 |', markdown)
        self.assertIn('| W4 return day 22-28 | 2 | 1 |', markdown)
        self.assertIn('Sample note: cohort is under 30 users', markdown)
        self.assertIn('Unknown cost request count: `1`', markdown)
        self.assertIn('Unit cost: `null` (unknown_cost_present)', markdown)
        self.assertIn('Known-cost unit-cost lower bound: `$0.080222`', markdown)

    def test_cli_offline_fixture_export_writes_markdown_without_db(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = Path(tmp_dir) / 'practice-report.md'
            code = export_practice_report([
                '--fixtures',
                str(FIXTURE_PATH),
                '--output',
                str(output_path),
            ])

            self.assertEqual(code, 0)
            markdown = output_path.read_text(encoding='utf-8')
            self.assertIn('# Practice Analytics Snapshot', markdown)
            self.assertIn('| A7 first loop | 9 | 6 |', markdown)


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PracticeMetricsPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.db.models import BillingSubscription, User, UserPlan, UserStatus

        self.engine = create_engine(TEST_DATABASE_URL)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.sessions()
        self.suffix = uuid4().hex
        self.user_ids: list[int] = []
        self.users = []
        for name in ('a', 'b'):
            user = User(
                public_id=f'usr_metrics_{name}_{self.suffix}',
                email=f'metrics_{name}_{self.suffix}@example.test',
                username=f'metrics_{name}_{self.suffix}',
                plan=UserPlan.free,
                status=UserStatus.active,
                daily_quota_total=100,
                daily_quota_used=0,
            )
            self.db.add(user)
            self.users.append(user)
        self.db.flush()
        self.user_ids = [user.id for user in self.users]
        for user in self.users:
            self.db.add(BillingSubscription(
                user_id=user.id,
                provider='activation_code',
                provider_subscription_id=f'metrics-active-{user.id}-{self.suffix}',
                status='active',
                ends_at=datetime(2100, 1, 1, tzinfo=timezone.utc),
            ))
        self.db.flush()

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

    def tearDown(self) -> None:
        from app.db.models import (
            GeneratedImage,
            ImageGenerationTask,
            Photo,
            PracticeAttempt,
            PracticeFeedback,
            PracticeSession,
            ProductAnalyticsEvent,
            Review,
            ReviewCallCost,
            ReviewTask,
            ReviewTaskEvent,
            UsageLedger,
            User,
            BillingSubscription,
            BillingWebhookEvent,
        )

        self.db.rollback()
        public_ids = [row[0] for row in self.db.query(User.public_id).filter(User.id.in_(self.user_ids)).all()]
        task_ids = [row[0] for row in self.db.query(ReviewTask.id).filter(ReviewTask.owner_user_id.in_(self.user_ids)).all()]
        generation_task_ids = [row[0] for row in self.db.query(ImageGenerationTask.id).filter(ImageGenerationTask.owner_user_id.in_(self.user_ids)).all()]
        self.db.query(ProductAnalyticsEvent).filter(ProductAnalyticsEvent.user_public_id.in_(public_ids)).delete(synchronize_session=False)
        self.db.query(ReviewCallCost).filter(ReviewCallCost.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(PracticeFeedback).filter(PracticeFeedback.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(PracticeAttempt).filter(PracticeAttempt.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(PracticeSession).filter(PracticeSession.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(UsageLedger).filter(UsageLedger.user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(BillingSubscription).filter(BillingSubscription.user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(BillingWebhookEvent).filter(BillingWebhookEvent.user_id.in_(self.user_ids)).delete(synchronize_session=False)
        if task_ids:
            self.db.query(ReviewTaskEvent).filter(ReviewTaskEvent.task_id.in_(task_ids)).delete(synchronize_session=False)
        if generation_task_ids:
            self.db.query(GeneratedImage).filter(GeneratedImage.task_id.in_(generation_task_ids)).delete(synchronize_session=False)
        self.db.query(ImageGenerationTask).filter(ImageGenerationTask.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(Review).filter(Review.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(ReviewTask).filter(ReviewTask.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(Photo).filter(Photo.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.query(User).filter(User.id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()
        self.engine.dispose()

    def test_loader_uses_review_cohorts_windowed_loops_and_raw_call_costs(self) -> None:
        from app.db.models import (
            ImageGenerationTask,
            Photo,
            PhotoStatus,
            PracticeAttempt,
            PracticeSession,
            ProductAnalyticsEvent,
            Review,
            ReviewCallCost,
            ReviewMode,
            ReviewStatus,
            ReviewTask,
            TaskStatus,
        )

        start = datetime(2042, 10, 1, tzinfo=timezone.utc)
        end = datetime(2042, 11, 1, tzinfo=timezone.utc)
        as_of = datetime(2042, 11, 10, tzinfo=timezone.utc)
        user_a, user_b = self.users

        photo_a = self._photo(user_a.id, 'a-source', start)
        source_a = self._source_review(user_a.id, photo_a.id, 'a-source', start)

        source_photo_b = self._photo(user_b.id, 'b-source', datetime(2042, 9, 1, tzinfo=timezone.utc))
        attempt_photo_b1 = self._photo(user_b.id, 'b-attempt-1', datetime(2042, 10, 2, tzinfo=timezone.utc))
        attempt_photo_b2 = self._photo(user_b.id, 'b-attempt-2', datetime(2042, 10, 25, tzinfo=timezone.utc))
        source_task_b = self._review_task(user_b.id, source_photo_b.id, 'source-b', datetime(2042, 9, 1, tzinfo=timezone.utc))
        source_b = self._source_review(user_b.id, source_photo_b.id, 'b-source', datetime(2042, 9, 1, tzinfo=timezone.utc), task_id=source_task_b.id)
        self.db.add(ReviewCallCost(task_id=source_task_b.id, owner_user_id=user_b.id, call_key='source-scorer', stage='scorer',
                                   outcome='succeeded', cost_usd=Decimal('0.005000'), created_at=datetime(2042, 10, 1, 1, tzinfo=timezone.utc)))
        session = PracticeSession(
            public_id=f'prs_metrics_{self.suffix}',
            owner_user_id=user_b.id,
            source_review_id=source_b.id,
            source_photo_id=source_photo_b.id,
            practice_kind='capture_retake',
            lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'},
            success_criteria=[],
            locale='en',
            idempotency_key=f'prs-{self.suffix}',
            request_hash='hash',
            created_at=datetime(2042, 9, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        # This mirrors the UI "next goal from current paired review" path:
        # the second practice session is rooted in the first practice review,
        # not in the original single-image root review.
        session_2 = PracticeSession(
            public_id=f'prs_metrics_2_{self.suffix}',
            owner_user_id=user_b.id,
            source_review_id=source_b.id,
            source_photo_id=source_photo_b.id,
            practice_kind='capture_retake',
            lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'},
            success_criteria=[],
            locale='en',
            idempotency_key=f'prs-2-{self.suffix}',
            request_hash='hash-2',
            created_at=datetime(2042, 10, 24, tzinfo=timezone.utc),
        )
        self.db.add(session_2)
        self.db.flush()
        attempt_1 = self._attempt(session.id, user_b.id, source_b.id, attempt_photo_b1.id, 1, datetime(2042, 10, 2, tzinfo=timezone.utc))
        review_1 = self._practice_review(user_b.id, attempt_photo_b1.id, source_b.id, attempt_1.task_id, 'b-practice-1', datetime(2042, 10, 2, 1, tzinfo=timezone.utc))
        session_2.source_review_id = review_1.id
        session_2.source_photo_id = attempt_photo_b1.id
        attempt_2 = self._attempt(session_2.id, user_b.id, review_1.id, attempt_photo_b2.id, 2, datetime(2042, 10, 25, tzinfo=timezone.utc))
        review_2 = self._practice_review(user_b.id, attempt_photo_b2.id, source_b.id, attempt_2.task_id, 'b-practice-2', datetime(2042, 10, 25, 1, tzinfo=timezone.utc))
        review_2.source_review_id = review_1.id
        attempt_1.review_id = review_1.id
        attempt_2.review_id = review_2.id
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user_b.public_id, plan='free', source='retake_coach',
                                  locale='en', dedupe_key=f'view-1-{self.suffix}', metadata_json={'attempt_id': attempt_1.public_id},
                                  created_at=datetime(2042, 10, 2, 2, tzinfo=timezone.utc)),
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user_b.public_id, plan='free', source='retake_coach',
                                  locale='en', dedupe_key=f'view-2-{self.suffix}', metadata_json={'attempt_id': attempt_2.public_id},
                                  created_at=datetime(2042, 10, 25, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt_1.task_id, owner_user_id=user_b.id, call_key='a-scorer', stage='scorer',
                           outcome='succeeded', cost_usd=Decimal('0.010000'), created_at=datetime(2042, 10, 2, 1, 10, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt_1.task_id, owner_user_id=user_b.id, call_key='a-writer', stage='writer',
                           outcome='unknown', cost_usd=None, created_at=datetime(2042, 10, 2, 1, 20, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt_2.task_id, owner_user_id=user_b.id, call_key='b-pair', stage='pair',
                           outcome='failed', cost_usd=Decimal('0.020000'), created_at=datetime(2042, 10, 25, 1, 10, tzinfo=timezone.utc)),
            ImageGenerationTask(public_id=f'igt_metrics_{self.suffix}', owner_user_id=user_b.id, source_photo_id=source_photo_b.id,
                                source_review_id=source_b.id, status=TaskStatus.FAILED, generation_mode='review_linked',
                                intent='reference', prompt='x', prompt_hash='h', request_payload={}, progress=100,
                                created_at=datetime(2042, 10, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        manifest = {source_a.public_id: 'qualified', source_b.public_id: 'qualified'}
        snapshot = load_practice_snapshot_from_db(self.db, start, end, as_of=as_of, eligibility_manifest=manifest)
        data = snapshot.to_dict()

        self.assertEqual(data['data_source'], 'database')
        self.assertEqual(data['a7']['mature_denominator'], 1)
        self.assertEqual(data['a7']['numerator'], 0)
        self.assertEqual(data['l14']['mature_denominator'], 1)
        self.assertEqual(data['l14']['numerator'], 0)
        self.assertEqual(data['w4']['mature_denominator'], 1)
        self.assertEqual(data['w4']['numerator'], 1)
        self.assertEqual(data['costs']['valid_capture_loop_count'], 2)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.035000')
        self.assertEqual(data['costs']['known_cost_request_count'], 3)
        self.assertEqual(data['costs']['unknown_cost_request_count'], 2)
        self.assertEqual(data['costs']['stage_breakdown']['scorer']['known_call_count'], 2)
        self.assertEqual(data['costs']['stage_breakdown']['writer']['unknown_call_count'], 1)
        self.assertEqual(data['costs']['stage_breakdown']['reference']['unknown_call_count'], 1)
        self.assertEqual(data['costs']['failed_call_count'], 2)
        markdown = render_practice_analytics_markdown(data)
        self.assertIn('Data source: `database`', markdown)

    def test_db_loader_builds_r1_funnel_from_events_feedback_and_payments(self) -> None:
        from app.db.models import (
            BillingWebhookEvent,
            PracticeFeedback,
            PracticeSession,
            ProductAnalyticsEvent,
            ReviewCallCost,
        )

        start = datetime(2047, 1, 1, tzinfo=timezone.utc)
        end = datetime(2047, 2, 1, tzinfo=timezone.utc)
        as_of = datetime(2047, 3, 5, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'r1-source', start)
        attempt_photo = self._photo(user.id, 'r1-attempt', datetime(2047, 1, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'r1-source', start)
        session = PracticeSession(
            public_id=f'prs_r1_{self.suffix}',
            owner_user_id=user.id,
            source_review_id=source.id,
            source_photo_id=source_photo.id,
            practice_kind='capture_retake',
            lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'},
            success_criteria=[],
            locale='en',
            idempotency_key=f'r1-{self.suffix}',
            request_hash='hash-r1',
            created_at=datetime(2047, 1, 2, 9, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2047, 1, 2, 9, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'r1-practice',
                                       datetime(2047, 1, 2, 10, tzinfo=timezone.utc))
        attempt.review_id = review.id
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_goal_shown', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'r1-shown-{self.suffix}',
                                  metadata_json={'source_review_id': source.public_id},
                                  created_at=datetime(2047, 1, 2, 8, tzinfo=timezone.utc)),
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'r1-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2047, 1, 2, 11, tzinfo=timezone.utc)),
            ProductAnalyticsEvent(event_name='paid_success', user_public_id=user.public_id, plan='pro',
                                  source='checkout', locale='en', page_path='/billing/webhooks/lemonsqueezy',
                                  dedupe_key=f'r1-forged-paid-{self.suffix}',
                                  metadata_json={'provider': 'lemonsqueezy', 'order_id': 'forged-order'},
                                  created_at=datetime(2046, 12, 31, tzinfo=timezone.utc)),
            ProductAnalyticsEvent(event_name='paid_success', user_public_id=user.public_id, plan='pro',
                                  source='checkout', locale='en', dedupe_key=f'r1-paid-{self.suffix}',
                                  page_path='/billing/webhooks/lemonsqueezy',
                                  metadata_json={'provider': 'lemonsqueezy', 'plan': 'pro', 'amount_usd': '12.00',
                                                 'order_id': f'order-r1-{self.suffix}'},
                                  created_at=datetime(2047, 1, 20, tzinfo=timezone.utc)),
            BillingWebhookEvent(provider='lemonsqueezy', event_name='order_created', event_hash=f'r1-zero-{self.suffix}',
                                resource_type='orders', resource_id=f'ord_zero_{self.suffix}', test_mode=False,
                                outcome='one_time_pro_granted', user_id=user.id, processed_at=datetime(2046, 12, 31, tzinfo=timezone.utc),
                                created_at=datetime(2046, 12, 31, tzinfo=timezone.utc),
                                payload_json={
                                    'meta': {'custom_data': {'user_id': user.public_id, 'plan': 'pro'}},
                                    'data': {'type': 'orders', 'id': f'ord_zero_{self.suffix}',
                                             'attributes': {'status': 'paid', 'total': 0}},
                                }),
            BillingWebhookEvent(provider='lemonsqueezy', event_name='order_created', event_hash=f'r1-real-{self.suffix}',
                                resource_type='orders', resource_id=f'ord_real_{self.suffix}', test_mode=False,
                                outcome='one_time_pro_granted', user_id=user.id, processed_at=datetime(2047, 1, 20, tzinfo=timezone.utc),
                                created_at=datetime(2047, 1, 20, tzinfo=timezone.utc),
                                payload_json={
                                    'meta': {'custom_data': {'user_id': user.public_id, 'plan': 'pro'}},
                                    'data': {
                                        'type': 'orders',
                                        'id': f'ord_real_{self.suffix}',
                                        'attributes': {
                                            'status': 'paid',
                                            'total': 1800,
                                            'currency': 'JPY',
                                            'created_at': '2047-01-20T00:00:00Z',
                                        },
                                    },
                                }),
            PracticeFeedback(public_id=f'pfb_r1_{self.suffix}', session_id=session.id, attempt_id=attempt.id,
                             review_id=review.id, owner_user_id=user.id, verdict='helpful',
                             created_at=datetime(2047, 1, 3, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='r1-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2047, 1, 2, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()
        r1 = data['practice_funnel']

        self.assertEqual(r1['goal_acceptance_24h']['mature_denominator'], 1)
        self.assertEqual(r1['goal_acceptance_24h']['numerator'], 1)
        self.assertEqual(r1['accepted_to_attempt_7d']['numerator'], 1)
        self.assertEqual(r1['comparison_availability']['numerator'], 1)
        self.assertEqual(r1['request_success']['state_counts']['succeeded'], 1)
        self.assertEqual(r1['feedback']['response_rate']['numerator'], 1)
        self.assertEqual(r1['feedback']['helpfulness_rate']['numerator'], 1)
        self.assertEqual(r1['training_paid_30d']['mature_denominator'], 1)
        self.assertEqual(r1['training_paid_30d']['numerator'], 1)
        self.assertEqual(r1['training_paid_30d']['previously_paid_user_count'], 0)
        self.assertEqual(r1['training_paid_30d']['evidence_state'], 'payment_events')

    def test_reference_generation_retries_keep_cost_coverage_conservative(self) -> None:
        from app.db.models import (
            GeneratedImage,
            ImageGenerationTask,
            PracticeSession,
            ProductAnalyticsEvent,
            ReviewCallCost,
            TaskStatus,
        )

        start = datetime(2044, 1, 1, tzinfo=timezone.utc)
        end = datetime(2044, 2, 1, tzinfo=timezone.utc)
        as_of = datetime(2044, 2, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'reference-source', start)
        attempt_photo = self._photo(user.id, 'reference-attempt', datetime(2044, 1, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'reference-source', start)
        session = PracticeSession(
            public_id=f'prs_reference_{self.suffix}',
            owner_user_id=user.id,
            source_review_id=source.id,
            source_photo_id=source_photo.id,
            practice_kind='capture_retake',
            lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'},
            success_criteria=[],
            locale='en',
            idempotency_key=f'reference-{self.suffix}',
            request_hash='hash-reference',
            created_at=datetime(2044, 1, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2044, 1, 2, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'reference-practice', datetime(2044, 1, 2, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        generation_task = ImageGenerationTask(
            public_id=f'igt_reference_{self.suffix}',
            owner_user_id=user.id,
            source_photo_id=source_photo.id,
            source_review_id=source.id,
            status=TaskStatus.SUCCEEDED,
            generation_mode='review_linked',
            intent='reference',
            prompt='x',
            prompt_hash='h',
            request_payload={},
            attempt_count=3,
            progress=100,
            created_at=datetime(2044, 1, 3, tzinfo=timezone.utc),
        )
        pending_generation_task = ImageGenerationTask(
            public_id=f'igt_reference_pending_{self.suffix}',
            owner_user_id=user.id,
            source_photo_id=source_photo.id,
            source_review_id=source.id,
            status=TaskStatus.PENDING,
            generation_mode='review_linked',
            intent='reference',
            prompt='x',
            prompt_hash='h2',
            request_payload={},
            attempt_count=0,
            progress=0,
            created_at=datetime(2044, 1, 4, tzinfo=timezone.utc),
        )
        self.db.add_all([generation_task, pending_generation_task])
        self.db.flush()
        generated = GeneratedImage(
            public_id=f'gen_reference_{self.suffix}',
            task_id=generation_task.id,
            owner_user_id=user.id,
            source_photo_id=source_photo.id,
            source_review_id=source.id,
            object_bucket='fixture',
            object_key=f'{self.suffix}/reference.webp',
            content_type='image/webp',
            intent='reference',
            generation_mode='review_linked',
            prompt='x',
            model_name='fixture',
            quality='standard',
            size='1024x1024',
            output_format='webp',
            cost_usd=Decimal('0.200000'),
            credits_charged=1,
            metadata_json={},
            created_at=datetime(2044, 1, 3, 1, tzinfo=timezone.utc),
        )
        self.db.add_all([
            generated,
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free', source='retake_coach',
                                  locale='en', dedupe_key=f'reference-view-{self.suffix}', metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2044, 1, 2, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='reference-scorer', stage='scorer',
                           outcome='succeeded', cost_usd=Decimal('0.010000'), created_at=datetime(2044, 1, 2, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()

        self.assertEqual(data['costs']['stage_breakdown']['reference']['known_call_count'], 1)
        self.assertEqual(data['costs']['stage_breakdown']['reference']['unknown_call_count'], 2)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.210000')
        self.assertEqual(data['costs']['unknown_cost_request_count'], 2)
        self.assertIsNone(data['costs']['unit_cost_usd'])
        self.assertEqual(data['costs']['known_cost_unit_cost_lower_bound_usd'], '0.210000')

    def test_reference_generation_known_cost_uses_generated_image_created_at_window(self) -> None:
        from app.db.models import GeneratedImage, ImageGenerationTask, PracticeSession, ProductAnalyticsEvent, ReviewCallCost, TaskStatus

        previous_start = datetime(2044, 2, 1, tzinfo=timezone.utc)
        current_start = datetime(2044, 3, 1, tzinfo=timezone.utc)
        current_end = datetime(2044, 4, 1, tzinfo=timezone.utc)
        as_of = datetime(2044, 4, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'reference-cross-source', previous_start)
        attempt_photo = self._photo(user.id, 'reference-cross-attempt', previous_start)
        source = self._source_review(user.id, source_photo.id, 'reference-cross-source', previous_start)
        session = PracticeSession(
            public_id=f'prs_reference_cross_{self.suffix}',
            owner_user_id=user.id,
            source_review_id=source.id,
            source_photo_id=source_photo.id,
            practice_kind='capture_retake',
            lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'},
            success_criteria=[],
            locale='en',
            idempotency_key=f'reference-cross-{self.suffix}',
            request_hash='hash-reference-cross',
            created_at=previous_start,
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, previous_start)
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'reference-cross-practice', datetime(2044, 2, 1, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        generation_task = ImageGenerationTask(
            public_id=f'igt_reference_cross_{self.suffix}',
            owner_user_id=user.id,
            source_photo_id=source_photo.id,
            source_review_id=source.id,
            status=TaskStatus.SUCCEEDED,
            generation_mode='review_linked',
            intent='reference',
            prompt='x',
            prompt_hash='h-cross',
            request_payload={},
            attempt_count=1,
            progress=100,
            created_at=datetime(2044, 2, 28, 23, 50, tzinfo=timezone.utc),
        )
        self.db.add(generation_task)
        self.db.flush()
        self.db.add_all([
            GeneratedImage(public_id=f'gen_reference_cross_{self.suffix}', task_id=generation_task.id,
                           owner_user_id=user.id, source_photo_id=source_photo.id, source_review_id=source.id,
                           object_bucket='fixture', object_key=f'{self.suffix}/reference-cross.webp',
                           content_type='image/webp', intent='reference', generation_mode='review_linked',
                           prompt='x', model_name='fixture', quality='standard', size='1024x1024',
                           output_format='webp', cost_usd=Decimal('0.200000'), credits_charged=1,
                           metadata_json={}, created_at=datetime(2044, 3, 1, 0, 10, tzinfo=timezone.utc)),
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free', source='retake_coach',
                                  locale='en', dedupe_key=f'reference-cross-view-{self.suffix}', metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2044, 2, 1, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='reference-cross-scorer', stage='scorer',
                           outcome='succeeded', cost_usd=Decimal('0.010000'), created_at=datetime(2044, 2, 1, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        previous = load_practice_snapshot_from_db(
            self.db, previous_start, current_start, as_of=datetime(2044, 2, 29, 12, tzinfo=timezone.utc),
            eligibility_manifest={source.public_id: 'qualified'},
        ).to_dict()
        current = load_practice_snapshot_from_db(
            self.db, current_start, current_end, as_of=as_of,
            eligibility_manifest={source.public_id: 'qualified'},
        ).to_dict()

        self.assertNotIn('reference', previous['costs']['stage_breakdown'])
        self.assertEqual(current['costs']['stage_breakdown']['reference']['known_call_count'], 1)
        self.assertEqual(current['costs']['known_practice_cost_usd'], '0.200000')

    def test_result_review_reference_generation_counts_like_source_reference_generation(self) -> None:
        from app.db.models import GeneratedImage, ImageGenerationTask, PracticeSession, ProductAnalyticsEvent, ReviewCallCost, TaskStatus

        start = datetime(2045, 1, 1, tzinfo=timezone.utc)
        end = datetime(2045, 2, 1, tzinfo=timezone.utc)
        as_of = datetime(2045, 2, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'result-ref-source', start)
        attempt_photo = self._photo(user.id, 'result-ref-attempt', datetime(2045, 1, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'result-ref-source', start)
        session = PracticeSession(
            public_id=f'prs_result_ref_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'result-ref-{self.suffix}', request_hash='hash-result-ref',
            created_at=datetime(2045, 1, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2045, 1, 2, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'result-ref-review', datetime(2045, 1, 2, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        result_reference_task = ImageGenerationTask(
            public_id=f'igt_result_ref_{self.suffix}', owner_user_id=user.id, source_photo_id=attempt_photo.id,
            source_review_id=review.id, status=TaskStatus.SUCCEEDED, generation_mode='review_linked',
            intent='reference', prompt='x', prompt_hash='h-result', request_payload={}, attempt_count=2,
            progress=100, created_at=datetime(2045, 1, 3, tzinfo=timezone.utc),
        )
        self.db.add(result_reference_task)
        self.db.flush()
        self.db.add_all([
            GeneratedImage(public_id=f'gen_result_ref_{self.suffix}', task_id=result_reference_task.id,
                           owner_user_id=user.id, source_photo_id=attempt_photo.id, source_review_id=review.id,
                           object_bucket='fixture', object_key=f'{self.suffix}/result-ref.webp',
                           content_type='image/webp', intent='reference', generation_mode='review_linked',
                           prompt='x', model_name='fixture', quality='standard', size='1024x1024',
                           output_format='webp', cost_usd=Decimal('0.200000'), credits_charged=1,
                           metadata_json={}, created_at=datetime(2045, 1, 3, 1, tzinfo=timezone.utc)),
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'result-ref-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2045, 1, 2, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='result-ref-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2045, 1, 2, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()

        self.assertEqual(data['costs']['stage_breakdown']['reference']['known_call_count'], 1)
        self.assertEqual(data['costs']['stage_breakdown']['reference']['unknown_call_count'], 1)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.210000')

    def test_soft_deleted_source_keeps_cost_lineage_visible(self) -> None:
        from app.db.models import PracticeSession, ProductAnalyticsEvent, ReviewCallCost

        start = datetime(2046, 1, 1, tzinfo=timezone.utc)
        end = datetime(2046, 2, 1, tzinfo=timezone.utc)
        as_of = datetime(2046, 2, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'deleted-source', start)
        attempt_photo = self._photo(user.id, 'deleted-attempt', datetime(2046, 1, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'deleted-source', start)
        session = PracticeSession(
            public_id=f'prs_deleted_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'deleted-{self.suffix}', request_hash='hash-deleted',
            created_at=datetime(2046, 1, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2046, 1, 2, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'deleted-practice', datetime(2046, 1, 2, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'deleted-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2046, 1, 2, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='deleted-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2046, 1, 2, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.flush()
        source.deleted_at = datetime(2046, 1, 10, tzinfo=timezone.utc)
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()

        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.010000')
        self.assertEqual(data['costs']['known_cost_request_count'], 1)
        self.assertGreaterEqual(data['attempt_outcome_counts']['learning_excluded_source_deleted'], 1)

    def test_rejected_source_photo_excludes_learning_loop_but_keeps_cost(self) -> None:
        from app.db.models import PhotoStatus, PracticeSession, ProductAnalyticsEvent, ReviewCallCost
        from app.api.deps import CurrentActor
        from app.services.practice_queries import get_practice_journal_summary

        start = datetime(2048, 1, 1, tzinfo=timezone.utc)
        end = datetime(2048, 2, 1, tzinfo=timezone.utc)
        as_of = datetime(2048, 2, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'rejected-source', start)
        attempt_photo = self._photo(user.id, 'rejected-source-attempt', datetime(2048, 1, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'rejected-source', start)
        session = PracticeSession(
            public_id=f'prs_rejected_source_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'rejected-source-{self.suffix}', request_hash='hash-rejected-source',
            created_at=datetime(2048, 1, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2048, 1, 2, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'rejected-source-practice', datetime(2048, 1, 2, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'rejected-source-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2048, 1, 2, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='rejected-source-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2048, 1, 2, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        ready = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()
        ready_journal = get_practice_journal_summary(self.db, CurrentActor(user))
        source_photo.status = PhotoStatus.REJECTED
        self.db.commit()
        rejected = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()
        rejected_journal = get_practice_journal_summary(self.db, CurrentActor(user))

        self.assertEqual(ready['costs']['valid_capture_loop_count'], 1)
        self.assertEqual(ready_journal.sample_count, 1)
        self.assertEqual(rejected['costs']['valid_capture_loop_count'], 0)
        self.assertEqual(rejected_journal.sample_count, 0)
        self.assertEqual(rejected['costs']['known_practice_cost_usd'], '0.010000')
        self.assertEqual(rejected['costs']['known_cost_request_count'], 1)
        self.assertEqual(rejected['costs']['unit_cost_null_reason'], 'no_valid_capture_loops')
        self.assertGreaterEqual(rejected['attempt_outcome_counts']['learning_excluded_source_photo_unavailable'], 1)

    def test_rejected_target_photo_excludes_learning_loop_but_keeps_cost(self) -> None:
        from app.db.models import PhotoStatus, PracticeSession, ProductAnalyticsEvent, ReviewCallCost

        start = datetime(2048, 3, 1, tzinfo=timezone.utc)
        end = datetime(2048, 4, 1, tzinfo=timezone.utc)
        as_of = datetime(2048, 4, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'rejected-target-source', start)
        attempt_photo = self._photo(user.id, 'rejected-target', datetime(2048, 3, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'rejected-target-source', start)
        session = PracticeSession(
            public_id=f'prs_rejected_target_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'rejected-target-{self.suffix}', request_hash='hash-rejected-target',
            created_at=datetime(2048, 3, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2048, 3, 2, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'rejected-target-practice', datetime(2048, 3, 2, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        attempt_photo.status = PhotoStatus.REJECTED
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'rejected-target-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2048, 3, 2, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='rejected-target-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2048, 3, 2, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()

        self.assertEqual(data['costs']['valid_capture_loop_count'], 0)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.010000')
        self.assertGreaterEqual(data['attempt_outcome_counts']['learning_excluded_target_photo_unavailable'], 1)

    def test_uploading_source_and_target_photos_are_non_ready_for_metrics(self) -> None:
        from app.db.models import PhotoStatus, PracticeSession, ProductAnalyticsEvent, ReviewCallCost

        start = datetime(2048, 4, 1, tzinfo=timezone.utc)
        end = datetime(2048, 5, 1, tzinfo=timezone.utc)
        as_of = datetime(2048, 5, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'uploading-source', start)
        attempt_photo = self._photo(user.id, 'uploading-target', datetime(2048, 4, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'uploading-source', start)
        session = PracticeSession(
            public_id=f'prs_uploading_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'uploading-{self.suffix}', request_hash='hash-uploading',
            created_at=datetime(2048, 4, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2048, 4, 2, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'uploading-practice', datetime(2048, 4, 2, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'uploading-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2048, 4, 2, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='uploading-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2048, 4, 2, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        source_photo.status = PhotoStatus.UPLOADING
        self.db.commit()
        source_blocked = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()
        source_photo.status = PhotoStatus.READY
        attempt_photo.status = PhotoStatus.UPLOADING
        self.db.commit()
        target_blocked = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()

        self.assertEqual(source_blocked['costs']['valid_capture_loop_count'], 0)
        self.assertGreaterEqual(source_blocked['attempt_outcome_counts']['learning_excluded_source_photo_unavailable'], 1)
        self.assertEqual(target_blocked['costs']['valid_capture_loop_count'], 0)
        self.assertGreaterEqual(target_blocked['attempt_outcome_counts']['learning_excluded_target_photo_unavailable'], 1)
        self.assertEqual(target_blocked['costs']['known_practice_cost_usd'], '0.010000')

    def test_visibility_plan_uses_current_subscription_grants_without_mutating_user_plan(self) -> None:
        from app.db.models import BillingSubscription, PracticeSession, ProductAnalyticsEvent, ReviewCallCost, UserPlan

        start = datetime(2048, 5, 1, tzinfo=timezone.utc)
        end = datetime(2048, 6, 1, tzinfo=timezone.utc)
        as_of = datetime(2048, 6, 20, tzinfo=timezone.utc)
        visibility = datetime(2048, 7, 20, tzinfo=timezone.utc)
        user = self.users[0]
        self.db.query(BillingSubscription).filter(BillingSubscription.user_id == user.id).delete(synchronize_session=False)
        user.plan = UserPlan.pro
        source_photo = self._photo(user.id, 'expired-plan-source', start)
        attempt_photo = self._photo(user.id, 'expired-plan-attempt', datetime(2048, 5, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'expired-plan-source', start)
        session = PracticeSession(
            public_id=f'prs_expired_plan_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'expired-plan-{self.suffix}', request_hash='hash-expired-plan',
            created_at=datetime(2048, 5, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2048, 5, 2, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'expired-plan-practice', datetime(2048, 5, 2, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        self.db.add_all([
            BillingSubscription(user_id=user.id, provider='lemonsqueezy', provider_subscription_id=f'expired-{self.suffix}',
                                status='active', ends_at=visibility - timedelta(days=1)),
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='pro',
                                  source='retake_coach', locale='en', dedupe_key=f'expired-plan-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2048, 5, 2, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='expired-plan-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2048, 5, 2, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        expired = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, visibility_evaluated_at=visibility,
            eligibility_manifest={source.public_id: 'qualified'},
        ).to_dict()
        self.db.add(BillingSubscription(user_id=user.id, provider='activation_code', provider_subscription_id=f'active-{self.suffix}',
                                        status='active', ends_at=visibility + timedelta(days=30)))
        self.db.commit()
        active = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, visibility_evaluated_at=visibility,
            eligibility_manifest={source.public_id: 'qualified'},
        ).to_dict()

        self.assertEqual(expired['costs']['valid_capture_loop_count'], 0)
        self.assertGreaterEqual(expired['attempt_outcome_counts']['learning_excluded_source_expired'], 1)
        self.assertEqual(expired['costs']['known_practice_cost_usd'], '0.010000')
        self.assertEqual(active['costs']['valid_capture_loop_count'], 1)
        self.assertEqual(user.plan, UserPlan.pro)

    def test_stored_free_with_live_grant_keeps_old_source_visible(self) -> None:
        from app.db.models import PracticeSession, ProductAnalyticsEvent, ReviewCallCost, UserPlan

        start = datetime(2048, 8, 1, tzinfo=timezone.utc)
        end = datetime(2048, 9, 1, tzinfo=timezone.utc)
        as_of = datetime(2048, 9, 20, tzinfo=timezone.utc)
        visibility = datetime(2048, 10, 20, tzinfo=timezone.utc)
        user = self.users[1]
        user.plan = UserPlan.free
        source_photo = self._photo(user.id, 'stored-free-source', start)
        attempt_photo = self._photo(user.id, 'stored-free-attempt', datetime(2048, 8, 2, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'stored-free-source', start)
        session = PracticeSession(
            public_id=f'prs_stored_free_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'stored-free-{self.suffix}', request_hash='hash-stored-free',
            created_at=datetime(2048, 8, 2, tzinfo=timezone.utc),
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, datetime(2048, 8, 2, tzinfo=timezone.utc))
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'stored-free-practice', datetime(2048, 8, 2, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'stored-free-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2048, 8, 2, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='stored-free-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2048, 8, 2, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, visibility_evaluated_at=visibility,
            eligibility_manifest={source.public_id: 'qualified'},
        ).to_dict()

        self.assertEqual(data['costs']['valid_capture_loop_count'], 1)
        self.assertEqual(user.plan, UserPlan.free)

    def test_source_and_result_cutoff_boundaries_are_current_visibility_based(self) -> None:
        from app.db.models import BillingSubscription, PracticeSession, ProductAnalyticsEvent, ReviewCallCost, UserPlan

        start = datetime(2048, 6, 1, tzinfo=timezone.utc)
        end = datetime(2048, 8, 1, tzinfo=timezone.utc)
        as_of = datetime(2048, 7, 20, tzinfo=timezone.utc)
        visibility = datetime(2048, 7, 31, tzinfo=timezone.utc)
        cutoff = datetime(2048, 7, 1, tzinfo=timezone.utc)
        user = self.users[0]
        self.db.query(BillingSubscription).filter(BillingSubscription.user_id == user.id).delete(synchronize_session=False)
        user.plan = UserPlan.free

        source_photo = self._photo(user.id, 'cutoff-source-photo', cutoff)
        source = self._source_review(user.id, source_photo.id, 'cutoff-source', cutoff)
        attempt_photo = self._photo(user.id, 'cutoff-attempt-photo', cutoff)
        session = PracticeSession(
            public_id=f'prs_cutoff_result_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'cutoff-result-{self.suffix}', request_hash='hash-cutoff-result',
            created_at=cutoff,
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, cutoff)
        expired_result = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'cutoff-expired-result', cutoff - timedelta(seconds=1))
        attempt.review_id = expired_result.id

        old_source_photo = self._photo(user.id, 'old-source-photo', start)
        old_source = self._source_review(user.id, old_source_photo.id, 'old-source', cutoff - timedelta(seconds=1))
        old_attempt_photo = self._photo(user.id, 'old-attempt-photo', cutoff)
        old_session = PracticeSession(
            public_id=f'prs_cutoff_source_{self.suffix}', owner_user_id=user.id, source_review_id=old_source.id,
            source_photo_id=old_source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'cutoff-source-{self.suffix}', request_hash='hash-cutoff-source',
            created_at=cutoff,
        )
        self.db.add(old_session)
        self.db.flush()
        old_attempt = self._attempt(old_session.id, user.id, old_source.id, old_attempt_photo.id, 2, cutoff)
        old_review = self._practice_review(user.id, old_attempt_photo.id, old_source.id, old_attempt.task_id, 'cutoff-old-source-result', cutoff)
        old_attempt.review_id = old_review.id

        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'cutoff-result-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id}, created_at=cutoff + timedelta(hours=1)),
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'cutoff-source-view-{self.suffix}',
                                  metadata_json={'attempt_id': old_attempt.public_id}, created_at=cutoff + timedelta(hours=1)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='cutoff-result-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'), created_at=cutoff),
            ReviewCallCost(task_id=old_attempt.task_id, owner_user_id=user.id, call_key='cutoff-source-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.020000'), created_at=cutoff),
        ])
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, visibility_evaluated_at=visibility,
            eligibility_manifest={source.public_id: 'qualified', old_source.public_id: 'qualified'},
        ).to_dict()

        self.assertEqual(data['costs']['valid_capture_loop_count'], 0)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.030000')
        self.assertGreaterEqual(data['attempt_outcome_counts']['learning_excluded_result_expired'], 1)
        self.assertGreaterEqual(data['attempt_outcome_counts']['learning_excluded_source_expired'], 1)

    def test_metrics_loader_select_counts_are_bounded_for_large_sample(self) -> None:
        from app.db.models import PracticeSession, ProductAnalyticsEvent, ReviewCallCost

        start = datetime(2048, 11, 1, tzinfo=timezone.utc)
        end = datetime(2048, 12, 1, tzinfo=timezone.utc)
        as_of = datetime(2048, 12, 20, tzinfo=timezone.utc)
        user = self.users[0]
        manifest = {}
        for index in range(60):
            source_photo = self._photo(user.id, f'budget-source-{index}', start + timedelta(seconds=index))
            attempt_photo = self._photo(user.id, f'budget-attempt-{index}', start + timedelta(days=1, seconds=index))
            source = self._source_review(user.id, source_photo.id, f'budget-source-{index}', start + timedelta(seconds=index))
            manifest[source.public_id] = 'qualified'
            session = PracticeSession(
                public_id=f'prs_metrics_budget_{index}_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
                source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
                goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
                idempotency_key=f'metrics-budget-{index}-{self.suffix}', request_hash=f'hash-metrics-budget-{index}',
                created_at=start + timedelta(days=1, seconds=index),
            )
            self.db.add(session)
            self.db.flush()
            attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, index + 1, start + timedelta(days=1, seconds=index))
            review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, f'budget-practice-{index}', start + timedelta(days=1, hours=1, seconds=index))
            attempt.review_id = review.id
            self.db.add_all([
                ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                      source='retake_coach', locale='en', dedupe_key=f'metrics-budget-view-{index}-{self.suffix}',
                                      metadata_json={'attempt_id': attempt.public_id},
                                      created_at=start + timedelta(days=1, hours=2, seconds=index)),
                ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key=f'metrics-budget-scorer-{index}',
                               stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                               created_at=start + timedelta(days=1, hours=1, minutes=10, seconds=index)),
            ])
        self.db.commit()

        with self._select_counter() as counts:
            data = load_practice_snapshot_from_db(
                self.db, start, end, as_of=as_of, visibility_evaluated_at=as_of, eligibility_manifest=manifest
            ).to_dict()

        self.assertLessEqual(counts['selects'], 15)
        self.assertEqual(data['costs']['valid_capture_loop_count'], 60)

    def test_cost_rows_outside_window_do_not_create_unknown_fallback(self) -> None:
        from app.db.models import PracticeSession, ProductAnalyticsEvent, ReviewCallCost

        start = datetime(2046, 3, 1, tzinfo=timezone.utc)
        end = datetime(2046, 4, 1, tzinfo=timezone.utc)
        as_of = datetime(2046, 4, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'outside-cost-source', start)
        attempt_photo = self._photo(user.id, 'outside-cost-attempt', start)
        source = self._source_review(user.id, source_photo.id, 'outside-cost-source', start)
        session = PracticeSession(
            public_id=f'prs_outside_cost_{self.suffix}', owner_user_id=user.id, source_review_id=source.id,
            source_photo_id=source_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'outside-cost-{self.suffix}', request_hash='hash-outside-cost',
            created_at=start,
        )
        self.db.add(session)
        self.db.flush()
        attempt = self._attempt(session.id, user.id, source.id, attempt_photo.id, 1, start)
        review = self._practice_review(user.id, attempt_photo.id, source.id, attempt.task_id, 'outside-cost-practice', datetime(2046, 3, 1, 1, tzinfo=timezone.utc))
        attempt.review_id = review.id
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free',
                                  source='retake_coach', locale='en', dedupe_key=f'outside-cost-view-{self.suffix}',
                                  metadata_json={'attempt_id': attempt.public_id},
                                  created_at=datetime(2046, 3, 1, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt.task_id, owner_user_id=user.id, call_key='outside-cost-scorer',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.010000'),
                           created_at=datetime(2046, 2, 28, 23, 59, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'qualified'}
        ).to_dict()

        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.000000')
        self.assertEqual(data['costs']['unknown_cost_request_count'], 0)
        self.assertEqual(data['costs']['total_cost_request_count'], 0)

    def test_future_sessions_do_not_attach_historical_source_costs_in_db_loader(self) -> None:
        from app.db.models import PracticeSession, ReviewCallCost

        start = datetime(2047, 1, 1, tzinfo=timezone.utc)
        end = datetime(2047, 2, 1, tzinfo=timezone.utc)
        as_of = datetime(2047, 1, 20, tzinfo=timezone.utc)
        user = self.users[0]
        boundary_photo = self._photo(user.id, 'boundary-source', start)
        future_photo = self._photo(user.id, 'future-source', start)
        boundary_task = self._review_task(user.id, boundary_photo.id, 'boundary-source', start)
        future_task = self._review_task(user.id, future_photo.id, 'future-source', start)
        boundary_source = self._source_review(user.id, boundary_photo.id, 'boundary-source', start, task_id=boundary_task.id)
        future_source = self._source_review(user.id, future_photo.id, 'future-source', start, task_id=future_task.id)
        boundary_session = PracticeSession(
            public_id=f'prs_boundary_{self.suffix}', owner_user_id=user.id, source_review_id=boundary_source.id,
            source_photo_id=boundary_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'boundary-{self.suffix}', request_hash='hash-boundary', created_at=as_of,
        )
        future_session = PracticeSession(
            public_id=f'prs_future_{self.suffix}', owner_user_id=user.id, source_review_id=future_source.id,
            source_photo_id=future_photo.id, practice_kind='capture_retake', lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'}, success_criteria=[], locale='en',
            idempotency_key=f'future-{self.suffix}', request_hash='hash-future',
            created_at=datetime(2047, 2, 1, tzinfo=timezone.utc),
        )
        self.db.add_all([
            boundary_session,
            future_session,
            ReviewCallCost(task_id=boundary_task.id, owner_user_id=user.id, call_key='boundary-source-cost',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.030000'),
                           created_at=datetime(2047, 1, 1, 1, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=future_task.id, owner_user_id=user.id, call_key='future-source-cost',
                           stage='scorer', outcome='succeeded', cost_usd=Decimal('0.030000'),
                           created_at=datetime(2047, 1, 1, 1, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        data = load_practice_snapshot_from_db(
            self.db,
            start,
            end,
            as_of=as_of,
            eligibility_manifest={boundary_source.public_id: 'qualified', future_source.public_id: 'qualified'},
        ).to_dict()

        self.assertEqual(data['practice_kind_counts'].get('capture_retake'), 1)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.030000')
        self.assertEqual(data['costs']['known_cost_request_count'], 1)

    def test_loader_excludes_unqualified_loops_from_official_cycle_denominators(self) -> None:
        from app.db.models import PracticeSession, ProductAnalyticsEvent, ReviewCallCost

        start = datetime(2043, 1, 1, tzinfo=timezone.utc)
        end = datetime(2043, 2, 1, tzinfo=timezone.utc)
        as_of = datetime(2043, 2, 20, tzinfo=timezone.utc)
        user = self.users[0]
        source_photo = self._photo(user.id, 'unqualified-source', start)
        attempt_photo_1 = self._photo(user.id, 'unqualified-attempt-1', datetime(2043, 1, 2, tzinfo=timezone.utc))
        attempt_photo_2 = self._photo(user.id, 'unqualified-attempt-2', datetime(2043, 1, 5, tzinfo=timezone.utc))
        source = self._source_review(user.id, source_photo.id, 'unqualified-source', start)
        session_1 = PracticeSession(
            public_id=f'prs_unqualified_1_{self.suffix}',
            owner_user_id=user.id,
            source_review_id=source.id,
            source_photo_id=source_photo.id,
            practice_kind='capture_retake',
            lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'},
            success_criteria=[],
            locale='en',
            idempotency_key=f'unqualified-1-{self.suffix}',
            request_hash='hash-unqualified-1',
            created_at=datetime(2043, 1, 2, tzinfo=timezone.utc),
        )
        session_2 = PracticeSession(
            public_id=f'prs_unqualified_2_{self.suffix}',
            owner_user_id=user.id,
            source_review_id=source.id,
            source_photo_id=source_photo.id,
            practice_kind='capture_retake',
            lifecycle='completed',
            goal_snapshot={'goal_version': 'goal-assessment-v1'},
            success_criteria=[],
            locale='en',
            idempotency_key=f'unqualified-2-{self.suffix}',
            request_hash='hash-unqualified-2',
            created_at=datetime(2043, 1, 5, tzinfo=timezone.utc),
        )
        self.db.add_all([session_1, session_2])
        self.db.flush()
        attempt_1 = self._attempt(session_1.id, user.id, source.id, attempt_photo_1.id, 1, datetime(2043, 1, 2, tzinfo=timezone.utc))
        attempt_2 = self._attempt(session_2.id, user.id, source.id, attempt_photo_2.id, 2, datetime(2043, 1, 5, tzinfo=timezone.utc))
        review_1 = self._practice_review(user.id, attempt_photo_1.id, source.id, attempt_1.task_id, 'unqualified-practice-1', datetime(2043, 1, 2, 1, tzinfo=timezone.utc))
        review_2 = self._practice_review(user.id, attempt_photo_2.id, source.id, attempt_2.task_id, 'unqualified-practice-2', datetime(2043, 1, 5, 1, tzinfo=timezone.utc))
        attempt_1.review_id = review_1.id
        attempt_2.review_id = review_2.id
        self.db.add_all([
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free', source='retake_coach',
                                  locale='en', dedupe_key=f'unqualified-view-1-{self.suffix}', metadata_json={'attempt_id': attempt_1.public_id},
                                  created_at=datetime(2043, 1, 2, 2, tzinfo=timezone.utc)),
            ProductAnalyticsEvent(event_name='practice_result_viewed', user_public_id=user.public_id, plan='free', source='retake_coach',
                                  locale='en', dedupe_key=f'unqualified-view-2-{self.suffix}', metadata_json={'attempt_id': attempt_2.public_id},
                                  created_at=datetime(2043, 1, 5, 2, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt_1.task_id, owner_user_id=user.id, call_key='unqualified-scorer-1', stage='scorer',
                           outcome='succeeded', cost_usd=Decimal('0.010000'), created_at=datetime(2043, 1, 2, 1, 10, tzinfo=timezone.utc)),
            ReviewCallCost(task_id=attempt_2.task_id, owner_user_id=user.id, call_key='unqualified-scorer-2', stage='scorer',
                           outcome='succeeded', cost_usd=Decimal('0.020000'), created_at=datetime(2043, 1, 5, 1, 10, tzinfo=timezone.utc)),
        ])
        self.db.commit()

        snapshot = load_practice_snapshot_from_db(self.db, start, end, as_of=as_of, eligibility_manifest={source.public_id: 'unqualified'})
        data = snapshot.to_dict()

        self.assertGreaterEqual(data['all_review_population']['all_reviews'], 1)
        self.assertGreaterEqual(data['eligibility_counts']['unqualified'], 1)
        self.assertEqual(data['a7']['mature_denominator'], 0)
        self.assertEqual(data['l14']['mature_denominator'], 0)
        self.assertEqual(data['l14']['numerator'], 0)
        self.assertEqual(data['costs']['valid_capture_loop_count'], 0)
        self.assertEqual(data['costs']['excluded_valid_capture_loop_count'], 2)
        self.assertGreaterEqual(data['attempt_outcome_counts']['diagnostic_valid_capture_loop_excluded'], 2)
        self.assertEqual(data['costs']['known_practice_cost_usd'], '0.030000')
        self.assertIsNone(snapshot.costs.unit_cost_usd)

    def _photo(self, owner_user_id: int, slug: str, created_at: datetime):
        from app.db.models import Photo, PhotoStatus

        photo = Photo(public_id=f'pho_metrics_{slug}_{self.suffix}', owner_user_id=owner_user_id,
                      upload_id=f'up_{slug}_{self.suffix}', bucket='fixture', object_key=f'{self.suffix}/{slug}.jpg',
                      content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
                      checksum_sha256='a' * 64, created_at=created_at)
        self.db.add(photo)
        self.db.flush()
        return photo

    def _review_task(self, owner_user_id: int, photo_id: int, slug: str, created_at: datetime):
        from app.db.models import ReviewMode, ReviewTask, TaskStatus

        task = ReviewTask(public_id=f'tsk_metrics_{slug}_{self.suffix}', owner_user_id=owner_user_id, photo_id=photo_id,
                          mode=ReviewMode.flash, status=TaskStatus.SUCCEEDED, idempotency_key=f'tsk-{slug}-{self.suffix}',
                          request_payload={'analysis_type': 'retake_compare'}, attempt_count=1, progress=100,
                          created_at=created_at, finished_at=created_at)
        self.db.add(task)
        self.db.flush()
        return task

    def _source_review(self, owner_user_id: int, photo_id: int, slug: str, created_at: datetime, task_id: int | None = None):
        from app.db.models import Review, ReviewMode, ReviewStatus

        review = Review(public_id=f'rev_metrics_{slug}_{self.suffix}', owner_user_id=owner_user_id, photo_id=photo_id,
                        task_id=task_id, mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, final_score=5,
                        schema_version='2.0', result_json={}, created_at=created_at)
        self.db.add(review)
        self.db.flush()
        return review

    def _attempt(self, session_id: int, owner_user_id: int, source_review_id: int, photo_id: int, sequence: int, created_at: datetime):
        from app.db.models import PracticeAttempt

        task = self._review_task(owner_user_id, photo_id, f'attempt-{sequence}', created_at)
        attempt = PracticeAttempt(public_id=f'pra_metrics_{sequence}_{self.suffix}', session_id=session_id,
                                  owner_user_id=owner_user_id, task_id=task.id, review_id=None, sequence=sequence,
                                  photo_id=photo_id, source_review_id=source_review_id, attempt_kind='capture_retake',
                                  request_hash=f'hash-{sequence}', created_at=created_at)
        self.db.add(attempt)
        self.db.flush()
        return attempt

    def _practice_review(self, owner_user_id: int, photo_id: int, source_review_id: int, task_id: int, slug: str, created_at: datetime):
        from app.db.models import Review, ReviewMode, ReviewStatus

        review = Review(public_id=f'rev_metrics_{slug}_{self.suffix}', owner_user_id=owner_user_id, photo_id=photo_id,
                        source_review_id=source_review_id, task_id=task_id, mode=ReviewMode.flash,
                        status=ReviewStatus.SUCCEEDED, final_score=7, schema_version='2.0',
                        result_json={
                            'comparison': {'is_comparable': True, 'comparison_confidence': 'high'},
                            'goal_assessment': {
                                'status': 'partial',
                                'evidence': [{'success_criterion': 'c', 'before_observation': 'b',
                                              'after_observation': 'a', 'conclusion': 'partial'}],
                            },
                        }, created_at=created_at)
        self.db.add(review)
        self.db.flush()
        return review


if __name__ == '__main__':
    unittest.main()
