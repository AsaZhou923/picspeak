
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable, Mapping

from sqlalchemy.orm import Session

from app.db.models import UserPlan
from app.services.guard import review_history_cutoff
from app.services.practice_access import ACCESS_AVAILABLE, ACCESS_PHOTO_UNAVAILABLE, ACCESS_NONE, attempt_access_summary, source_access_summary
from app.services.billing_access import subscription_grants_pro_access


VALID_CAPTURE_KIND = 'capture_retake'
ASSESSABLE_KINDS = {'capture_retake', 'edit_revision'}
VALID_GOAL_STATUSES = {'achieved', 'partial', 'not_achieved'}
INDETERMINATE_STATUS = 'indeterminate'
TERMINAL_FAILURE_STATUSES = {'FAILED', 'EXPIRED', 'DEAD_LETTER'}
SUCCESS_STATUS = 'SUCCEEDED'
LOW_COMPARISON_CONFIDENCE = {'low', 'unknown'}


@dataclass(frozen=True)
class RateMetric:
    mature_denominator: int = 0
    numerator: int = 0
    rate: Decimal | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'mature_denominator': self.mature_denominator,
            'numerator': self.numerator,
            'rate': _decimal_to_str(self.rate),
        }


@dataclass(frozen=True)
class GoalAssessmentMetric:
    denominator: int = 0
    indeterminate_numerator: int = 0
    rate: Decimal | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'denominator': self.denominator,
            'indeterminate_numerator': self.indeterminate_numerator,
            'rate': _decimal_to_str(self.rate),
        }


@dataclass(frozen=True)
class CostMetric:
    known_practice_cost_usd: Decimal = Decimal('0.000000')
    official_known_practice_cost_usd: Decimal = Decimal('0.000000')
    unknown_cost_request_count: int = 0
    official_unknown_cost_request_count: int = 0
    unwindowable_cost_request_count: int = 0
    official_unwindowable_cost_request_count: int = 0
    known_cost_request_count: int = 0
    total_cost_request_count: int = 0
    cost_coverage_rate: Decimal | None = None
    valid_capture_loop_count: int = 0
    excluded_valid_capture_loop_count: int = 0
    unit_cost_usd: Decimal | None = None
    unit_cost_null_reason: str | None = None
    known_cost_unit_cost_lower_bound_usd: Decimal | None = None
    stage_breakdown: dict[str, dict[str, Any]] = field(default_factory=dict)
    failed_call_count: int = 0
    retry_call_count: int = 0
    cost_basis: str = 'estimated'
    reconciliation: str = 'not_provided'

    def to_dict(self) -> dict[str, Any]:
        return {
            'known_practice_cost_usd': _decimal_to_str(self.known_practice_cost_usd),
            'official_known_practice_cost_usd': _decimal_to_str(self.official_known_practice_cost_usd),
            'unknown_cost_request_count': self.unknown_cost_request_count,
            'official_unknown_cost_request_count': self.official_unknown_cost_request_count,
            'unwindowable_cost_request_count': self.unwindowable_cost_request_count,
            'official_unwindowable_cost_request_count': self.official_unwindowable_cost_request_count,
            'known_cost_request_count': self.known_cost_request_count,
            'total_cost_request_count': self.total_cost_request_count,
            'cost_coverage_rate': _decimal_to_str(self.cost_coverage_rate),
            'valid_capture_loop_count': self.valid_capture_loop_count,
            'excluded_valid_capture_loop_count': self.excluded_valid_capture_loop_count,
            'unit_cost_usd': _decimal_to_str(self.unit_cost_usd),
            'unit_cost_null_reason': self.unit_cost_null_reason,
            'known_cost_unit_cost_lower_bound_usd': _decimal_to_str(self.known_cost_unit_cost_lower_bound_usd),
            'stage_breakdown': self.stage_breakdown,
            'failed_call_count': self.failed_call_count,
            'retry_call_count': self.retry_call_count,
            'cost_basis': self.cost_basis,
            'reconciliation': self.reconciliation,
        }


@dataclass(frozen=True)
class PracticeSnapshot:
    schema_version: str
    as_of: datetime
    visibility_evaluated_at: datetime
    a7: RateMetric
    l14: RateMetric
    w4: RateMetric
    goal_assessments: GoalAssessmentMetric
    costs: CostMetric
    total_users: int
    mature_cohort_user_count: int
    sample_size_note: str | None
    practice_kind_counts: dict[str, int] = field(default_factory=dict)
    attempt_outcome_counts: dict[str, int] = field(default_factory=dict)
    eligibility_counts: dict[str, int] = field(default_factory=dict)
    all_review_population: dict[str, int] = field(default_factory=dict)
    null_reasons: list[str] = field(default_factory=list)
    data_source: str = 'synthetic_fixture'
    practice_funnel: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            'schema_version': self.schema_version,
            'as_of': self.as_of.isoformat().replace('+00:00', 'Z'),
            'visibility_evaluated_at': self.visibility_evaluated_at.isoformat().replace('+00:00', 'Z'),
            'a7': self.a7.to_dict(),
            'l14': self.l14.to_dict(),
            'w4': self.w4.to_dict(),
            'goal_assessments': self.goal_assessments.to_dict(),
            'costs': self.costs.to_dict(),
            'total_users': self.total_users,
            'mature_cohort_user_count': self.mature_cohort_user_count,
            'sample_size_note': self.sample_size_note,
            'practice_kind_counts': dict(self.practice_kind_counts),
            'attempt_outcome_counts': dict(self.attempt_outcome_counts),
            'eligibility_counts': dict(self.eligibility_counts),
            'all_review_population': dict(self.all_review_population),
            'null_reasons': list(self.null_reasons),
            'data_source': self.data_source,
            'practice_funnel': self.practice_funnel,
        }


@dataclass(frozen=True)
class _AttemptRecord:
    attempt_id: str
    session_id: str
    user_id: str
    practice_kind: str
    accepted_at: datetime | None
    analysis_completed_at: datetime | None
    result_viewed_at: datetime | None
    goal_status: str | None
    cost_usd: Decimal | None
    failed: bool = False
    has_valid_evidence: bool = False
    comparable: bool = False
    comparison_confidence: str | None = None
    task_attempt_count: int | None = None
    cost_stage: str = 'practice_attempt'
    cost_outcome: str = 'unknown'
    cost_call_key: str | None = None
    learning_exclusion_reasons: tuple[str, ...] = ()
    access_snapshot_verified: bool = False
    feedback_verdict: str | None = None
    feedback_created_at: datetime | None = None


@dataclass(frozen=True)
class _LoopRecord:
    user_id: str
    session_id: str
    viewed_at: datetime
    session_created_at: datetime


@dataclass(frozen=True)
class _CostRecord:
    cost_usd: Decimal | None
    source: str
    request_id: str
    stage: str = 'unknown'
    outcome: str = 'unknown'
    call_key: str | None = None
    created_at: datetime | None = None
    attempt_count: int | None = None
    basis: str | None = None
    user_id: str | None = None
    unwindowable: bool = False


@dataclass(frozen=True)
class _ReviewPopulationRecord:
    user_id: str
    review_id: str
    created_at: datetime
    eligibility: str


def build_practice_snapshot(
    data: dict[str, Any] | list[dict[str, Any]],
    *,
    as_of: datetime | str | None = None,
    start_date: datetime | str | None = None,
    end_date: datetime | str | None = None,
    a7_window_days: int = 7,
    l14_window_days: int = 14,
    w4_mature_days: int = 28,
    w4_start_day: int = 22,
    w4_end_day: int = 28,
) -> PracticeSnapshot:
    payload = _normalize_fixture_payload(data)
    as_of_dt = _parse_datetime(as_of or payload.get('as_of') or datetime.now(timezone.utc))
    visibility_dt = _parse_datetime(payload.get('visibility_evaluated_at') or as_of_dt)
    start_dt = _parse_optional_datetime(start_date or payload.get('start_date'))
    end_dt = _parse_optional_datetime(end_date or payload.get('end_date'))
    fixtures = payload['fixtures']
    data_source = str(payload.get('data_source') or 'synthetic_fixture')

    review_population: list[_ReviewPopulationRecord] = []
    eligibility_counts = {'qualified': 0, 'unqualified': 0, 'unknown': 0}
    cost_records: list[_CostRecord] = []
    candidate_valid_loops: list[_LoopRecord] = []
    goal_denominator = 0
    indeterminate_numerator = 0
    practice_kind_counts: dict[str, int] = {}
    attempt_outcome_counts: dict[str, int] = {
        'valid_capture_loop': 0,
        'indeterminate': 0,
        'failed': 0,
        'incomparable': 0,
        'low_confidence': 0,
        'missing_evidence': 0,
        'future_or_out_of_order': 0,
        'same_image_recheck': 0,
        'edit_revision': 0,
        'unknown_cost': 0,
        'diagnostic_valid_capture_loop_excluded': 0,
        'valid_capture_loop_in_window': 0,
        'diagnostic_valid_capture_loop_excluded_in_window': 0,
    }
    seen_sessions: set[str] = set()
    seen_attempts: set[str] = set()
    seen_cost_requests: set[str] = set()
    user_ids: set[str] = set()
    goal_exposures: list[dict[str, Any]] = []
    goal_acceptances: list[dict[str, Any]] = []
    submitted_attempts: list[dict[str, Any]] = []
    analysis_attempts: list[dict[str, Any]] = []
    feedback_eligible_views: list[dict[str, Any]] = []
    feedback_answers: list[dict[str, Any]] = []
    payment_events: list[dict[str, Any]] = []

    for fixture in fixtures:
        user_id = str(fixture.get('canonical_user_id') or fixture.get('user_id') or fixture.get('guest_user_id_before_merge') or fixture.get('id'))
        user_ids.add(user_id)
        eligibility = _fixture_eligibility(fixture)
        fixture_had_included_session = False
        for review_item in _fixture_review_population(fixture):
            created_at = _parse_optional_datetime(review_item.get('created_at'))
            if created_at is None or created_at > as_of_dt:
                continue
            review_eligibility = str(review_item.get('eligibility') or eligibility)
            eligibility_counts[review_eligibility] = eligibility_counts.get(review_eligibility, 0) + 1
            review_population.append(_ReviewPopulationRecord(
                user_id=user_id,
                review_id=str(review_item.get('review_id') or fixture.get('source_review_id') or fixture.get('id')),
                created_at=created_at,
                eligibility=review_eligibility,
            ))

        for session in fixture.get('sessions') or []:
            session_id = str(session.get('session_id') or session.get('id') or '')
            if not session_id or session_id in seen_sessions:
                continue
            session_created_at = _parse_optional_datetime(session.get('created_at'))
            if session_created_at is not None and session_created_at > as_of_dt:
                continue
            seen_sessions.add(session_id)
            fixture_had_included_session = True
            practice_kind = str(session.get('practice_kind') or session.get('attempt_kind') or 'unknown')
            practice_kind_counts[practice_kind] = practice_kind_counts.get(practice_kind, 0) + 1
            session_valid_loops: list[_LoopRecord] = []
            shown_at = _parse_optional_datetime(session.get('goal_shown_at') or session.get('shown_at'))
            accepted_at = None if session.get('accepted') is False else _parse_optional_datetime(
                session.get('goal_accepted_at') or session.get('accepted_at') or session.get('created_at')
            )
            channel = str(session.get('channel') or fixture.get('channel') or fixture.get('locale') or 'unknown')
            if shown_at is not None and shown_at <= as_of_dt:
                goal_exposures.append({'user_id': user_id, 'session_id': session_id, 'at': shown_at, 'channel': channel})
            if accepted_at is not None and accepted_at <= as_of_dt:
                goal_acceptances.append({'user_id': user_id, 'session_id': session_id, 'at': accepted_at, 'channel': channel, 'shown_at': shown_at})

            for attempt in session.get('attempts') or []:
                record = _attempt_from_fixture(fixture, session, attempt, user_id)
                if not record.attempt_id or record.attempt_id in seen_attempts:
                    continue
                seen_attempts.add(record.attempt_id)
                attempt_channel = str(attempt.get('channel') or channel)
                if record.practice_kind == VALID_CAPTURE_KIND and record.accepted_at is not None and record.accepted_at <= as_of_dt:
                    submitted_attempts.append({
                        'user_id': user_id,
                        'session_id': session_id,
                        'attempt_id': record.attempt_id,
                        'at': record.accepted_at,
                        'channel': attempt_channel,
                        'failed': record.failed,
                    })
                if record.analysis_completed_at is not None and record.analysis_completed_at <= as_of_dt:
                    state = _attempt_request_state(attempt, record)
                    analysis_attempts.append({
                        'user_id': user_id,
                        'session_id': session_id,
                        'attempt_id': record.attempt_id,
                        'at': record.analysis_completed_at,
                        'channel': attempt_channel,
                        'state': state,
                        'has_valid_evidence': record.has_valid_evidence,
                        'comparable': record.comparable,
                        'comparison_confidence': record.comparison_confidence,
                    })
                elif record.accepted_at is not None and record.accepted_at <= as_of_dt:
                    analysis_attempts.append({
                        'user_id': user_id,
                        'session_id': session_id,
                        'attempt_id': record.attempt_id,
                        'at': record.accepted_at,
                        'channel': attempt_channel,
                        'state': _attempt_request_state(attempt, record),
                        'has_valid_evidence': False,
                        'comparable': False,
                        'comparison_confidence': None,
                    })
                if record.result_viewed_at is not None and record.result_viewed_at <= as_of_dt:
                    feedback_eligible_views.append({
                        'user_id': user_id,
                        'session_id': session_id,
                        'attempt_id': record.attempt_id,
                        'at': record.result_viewed_at,
                        'channel': attempt_channel,
                    })
                if record.feedback_verdict and record.feedback_created_at and record.feedback_created_at <= as_of_dt:
                    feedback_answers.append({
                        'user_id': user_id,
                        'session_id': session_id,
                        'attempt_id': record.attempt_id,
                        'at': record.feedback_created_at,
                        'verdict': record.feedback_verdict,
                        'channel': attempt_channel,
                    })

                has_authoritative_cost_rows = 'cost_rows' in attempt
                raw_cost_rows = attempt.get('cost_rows') or []
                if has_authoritative_cost_rows:
                    for raw_cost in raw_cost_rows:
                        cost = _cost_record_from_fixture(raw_cost)
                        if cost.created_at is None:
                            cost = _CostRecord(
                                cost_usd=None,
                                source=cost.source,
                                request_id=cost.request_id,
                                stage=cost.stage,
                                outcome='unknown',
                                call_key=cost.call_key,
                                created_at=None,
                                attempt_count=cost.attempt_count,
                                basis='legacy_missing_call_created_at',
                                user_id=record.user_id,
                                unwindowable=True,
                            )
                        elif cost.created_at > as_of_dt or not _within_window(cost.created_at, start_dt, end_dt):
                            continue
                        else:
                            cost = _CostRecord(
                                cost_usd=cost.cost_usd,
                                source=cost.source,
                                request_id=cost.request_id,
                                stage=cost.stage,
                                outcome=cost.outcome,
                                call_key=cost.call_key,
                                created_at=cost.created_at,
                                attempt_count=cost.attempt_count,
                                basis=cost.basis,
                                user_id=record.user_id,
                                unwindowable=False,
                            )
                        request_id = cost.request_id or f'{record.attempt_id}:{cost.call_key or cost.stage}'
                        if request_id in seen_cost_requests:
                            continue
                        seen_cost_requests.add(request_id)
                        cost_records.append(cost)
                        if cost.cost_usd is None and not cost.unwindowable:
                            attempt_outcome_counts['unknown_cost'] += 1
                elif _attempt_cost_in_window(record, start_dt, end_dt, as_of_dt):
                    request_id = record.attempt_id
                    if request_id not in seen_cost_requests:
                        seen_cost_requests.add(request_id)
                        cost_records.append(_CostRecord(
                            cost_usd=record.cost_usd,
                            source='practice_attempt',
                            request_id=request_id,
                            stage=record.cost_stage,
                            outcome=record.cost_outcome,
                            call_key=record.cost_call_key or request_id,
                            created_at=record.analysis_completed_at or record.accepted_at,
                            attempt_count=record.task_attempt_count,
                            user_id=record.user_id,
                        ))
                        if record.cost_usd is None:
                            attempt_outcome_counts['unknown_cost'] += 1

                if record.practice_kind == 'same_image_recheck':
                    attempt_outcome_counts['same_image_recheck'] += 1
                if record.practice_kind == 'edit_revision':
                    attempt_outcome_counts['edit_revision'] += 1
                if record.failed:
                    attempt_outcome_counts['failed'] += 1
                if record.practice_kind == VALID_CAPTURE_KIND and not record.comparable:
                    attempt_outcome_counts['incomparable'] += 1
                if record.practice_kind == VALID_CAPTURE_KIND and record.comparison_confidence in LOW_COMPARISON_CONFIDENCE:
                    attempt_outcome_counts['low_confidence'] += 1
                if record.goal_status in VALID_GOAL_STATUSES and not record.has_valid_evidence:
                    attempt_outcome_counts['missing_evidence'] += 1
                if not _attempt_timing_valid(record, as_of_dt):
                    attempt_outcome_counts['future_or_out_of_order'] += 1
                for reason in record.learning_exclusion_reasons:
                    key = f'learning_excluded_{reason}'
                    attempt_outcome_counts[key] = attempt_outcome_counts.get(key, 0) + 1

                if _has_countable_goal_assessment(record, as_of_dt):
                    goal_denominator += 1
                    if record.goal_status == INDETERMINATE_STATUS:
                        indeterminate_numerator += 1
                        attempt_outcome_counts['indeterminate'] += 1

                if _is_valid_capture_loop(record, as_of_dt):
                    loop = _LoopRecord(
                        user_id=user_id,
                        session_id=session_id,
                        viewed_at=record.result_viewed_at,  # type: ignore[arg-type]
                        session_created_at=session_created_at or record.accepted_at or record.result_viewed_at,  # type: ignore[arg-type]
                    )
                    session_valid_loops.append(loop)

            if session_valid_loops:
                first_loop = min(session_valid_loops, key=lambda item: item.viewed_at)
                candidate_valid_loops.append(first_loop)

        for reference_cost in fixture.get('generation_reference_costs') or []:
            if not fixture_had_included_session:
                continue
            record = _cost_record_from_fixture(reference_cost)
            record = _CostRecord(
                cost_usd=record.cost_usd,
                source=record.source,
                request_id=record.request_id,
                stage=record.stage,
                outcome=record.outcome,
                call_key=record.call_key,
                created_at=record.created_at,
                attempt_count=record.attempt_count,
                basis=record.basis,
                user_id=user_id,
                unwindowable=record.unwindowable,
            )
            if record.request_id in seen_cost_requests:
                continue
            if record.created_at and record.created_at > as_of_dt:
                continue
            if record.created_at and not _within_window(record.created_at, start_dt, end_dt):
                continue
            seen_cost_requests.add(record.request_id)
            cost_records.append(record)

        for event in fixture.get('payment_events') or fixture.get('payments') or []:
            paid_at = _parse_optional_datetime(event.get('paid_at') or event.get('created_at') or event.get('event_at'))
            if paid_at is None or paid_at > as_of_dt:
                continue
            trusted_db_payment = event.get('evidence_source') == 'billing_webhook_event'
            if data_source == 'database' and not trusted_db_payment:
                continue
            if not trusted_db_payment and str(event.get('event_name') or event.get('type') or 'paid_success') != 'paid_success':
                continue
            if _truthy(event.get('test_mode')) or _truthy(event.get('gift')) or _truthy(event.get('comped')):
                continue
            payment_amount = _payment_positive_amount(event)
            if payment_amount is None:
                continue
            payment_events.append({
                'user_id': user_id,
                'at': paid_at,
                'channel': str(event.get('channel') or event.get('provider') or fixture.get('channel') or 'unknown'),
                'plan': str(event.get('plan') or event.get('variant') or 'unknown'),
                'amount_usd': _parse_decimal_or_none(event.get('amount_usd')),
                'raw_amount': payment_amount,
                'currency': str(event.get('currency') or 'USD').upper(),
                'evidence_source': event.get('evidence_source') or ('fixture' if data_source != 'database' else 'unknown'),
            })

    first_review_by_user = _first_qualified_review_by_user(review_population)
    qualified_user_ids = set(first_review_by_user)
    valid_loops = [
        loop
        for loop in candidate_valid_loops
        if loop.user_id in qualified_user_ids and loop.viewed_at >= first_review_by_user[loop.user_id]
    ]
    excluded_valid_loops = [
        loop for loop in candidate_valid_loops
        if loop.user_id not in qualified_user_ids or loop.viewed_at < first_review_by_user[loop.user_id]
    ]
    attempt_outcome_counts['valid_capture_loop'] = len(valid_loops)
    attempt_outcome_counts['diagnostic_valid_capture_loop_excluded'] = len(excluded_valid_loops)
    eligible_loop_completion_count = sum(1 for loop in valid_loops if _within_window(loop.viewed_at, start_dt, end_dt))
    excluded_loop_completion_count = sum(1 for loop in excluded_valid_loops if _within_window(loop.viewed_at, start_dt, end_dt))
    attempt_outcome_counts['valid_capture_loop_in_window'] = eligible_loop_completion_count
    attempt_outcome_counts['diagnostic_valid_capture_loop_excluded_in_window'] = excluded_loop_completion_count
    loops_by_user: dict[str, list[_LoopRecord]] = {}
    for loop in valid_loops:
        loops_by_user.setdefault(loop.user_id, []).append(loop)
    for loops in loops_by_user.values():
        loops.sort(key=lambda item: item.viewed_at)

    a7_denominator = 0
    a7_numerator = 0
    for user_id, first_review_at in first_review_by_user.items():
        if not _within_window(first_review_at, start_dt, end_dt):
            continue
        if first_review_at + timedelta(days=a7_window_days) <= as_of_dt:
            a7_denominator += 1
            first_loop = loops_by_user.get(user_id, [None])[0]
            if first_loop and first_review_at <= first_loop.viewed_at <= first_review_at + timedelta(days=a7_window_days):
                a7_numerator += 1

    l14_denominator = 0
    l14_numerator = 0
    w4_denominator = 0
    w4_numerator = 0
    for loops in loops_by_user.values():
        first_loop = loops[0]
        if not _within_window(first_loop.viewed_at, start_dt, end_dt):
            continue
        other_loops = [loop for loop in loops[1:] if loop.session_id != first_loop.session_id]
        if first_loop.viewed_at + timedelta(days=l14_window_days) <= as_of_dt:
            l14_denominator += 1
            if any(first_loop.viewed_at < loop.viewed_at <= first_loop.viewed_at + timedelta(days=l14_window_days) for loop in other_loops):
                l14_numerator += 1
        if first_loop.viewed_at + timedelta(days=w4_mature_days) <= as_of_dt:
            w4_denominator += 1
            if any(
                first_loop.viewed_at + timedelta(days=w4_start_day) <= loop.viewed_at <= first_loop.viewed_at + timedelta(days=w4_end_day)
                for loop in other_loops
            ):
                w4_numerator += 1

    cost_metric = _build_cost_metric(cost_records, eligible_loop_completion_count, excluded_loop_completion_count, qualified_user_ids)
    practice_funnel = _build_practice_funnel(
        as_of=as_of_dt,
        start_date=start_dt,
        end_date=end_dt,
        first_review_by_user=first_review_by_user,
        valid_loops=valid_loops,
        goal_exposures=goal_exposures,
        goal_acceptances=goal_acceptances,
        submitted_attempts=submitted_attempts,
        analysis_attempts=analysis_attempts,
        feedback_eligible_views=feedback_eligible_views,
        feedback_answers=feedback_answers,
        payment_events=payment_events,
    )
    null_reasons = [cost_metric.unit_cost_null_reason] if cost_metric.unit_cost_null_reason else []
    mature_users = len({
        user_id for user_id, first_review_at in first_review_by_user.items()
        if _within_window(first_review_at, start_dt, end_dt) and first_review_at + timedelta(days=a7_window_days) <= as_of_dt
    })

    return PracticeSnapshot(
        schema_version='practice-analytics-snapshot-v1',
        as_of=as_of_dt,
        visibility_evaluated_at=visibility_dt,
        a7=RateMetric(a7_denominator, a7_numerator, _rate(a7_numerator, a7_denominator)),
        l14=RateMetric(l14_denominator, l14_numerator, _rate(l14_numerator, l14_denominator)),
        w4=RateMetric(w4_denominator, w4_numerator, _rate(w4_numerator, w4_denominator)),
        goal_assessments=GoalAssessmentMetric(goal_denominator, indeterminate_numerator, _rate(indeterminate_numerator, goal_denominator)),
        costs=cost_metric,
        total_users=len(user_ids),
        mature_cohort_user_count=mature_users,
        sample_size_note='cohort_descriptive_under_30' if mature_users < 30 else None,
        practice_kind_counts=practice_kind_counts,
        attempt_outcome_counts=attempt_outcome_counts,
        eligibility_counts=eligibility_counts,
        all_review_population={
            'all_review_users': len({item.user_id for item in review_population}),
            'all_reviews': len(review_population),
            'first_qualified_review_users': len(first_review_by_user),
            'fixture_users': len(user_ids),
        },
        null_reasons=null_reasons,
        data_source=data_source,
        practice_funnel=practice_funnel,
    )


def load_practice_snapshot_from_db(
    db: Session,
    start_date: datetime,
    end_date: datetime,
    *,
    as_of: datetime | None = None,
    visibility_evaluated_at: datetime | None = None,
    eligibility_manifest: Mapping[str, Any] | None = None,
) -> PracticeSnapshot:
    from app.db.models import (
        BillingSubscription,
        BillingWebhookEvent,
        Photo,
        PracticeAttempt,
        PracticeFeedback,
        PracticeSession,
        ProductAnalyticsEvent,
        Review,
        ReviewStatus,
        ReviewTask,
        User,
    )

    as_of_dt = _parse_datetime(as_of or end_date)
    visibility_dt = _parse_datetime(visibility_evaluated_at or datetime.now(timezone.utc))
    start_dt = _parse_datetime(start_date)
    end_dt = _parse_datetime(end_date)

    cohort_reviews = (
        db.query(Review)
        .filter(Review.created_at <= as_of_dt, Review.source_review_id.is_(None))
        .all()
    )
    eligible_session_source_reviews = (
        db.query(Review)
        .filter(Review.created_at <= as_of_dt, Review.status == ReviewStatus.SUCCEEDED)
        .all()
    )
    owner_ids = sorted({review.owner_user_id for review in cohort_reviews} | {review.owner_user_id for review in eligible_session_source_reviews})
    owners = {user.id: user for user in db.query(User).filter(User.id.in_(owner_ids)).all()} if owner_ids else {}
    subscriptions = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.user_id.in_(owner_ids))
        .all()
    ) if owner_ids else []
    current_plan_by_owner = _current_plan_by_owner(owners, subscriptions, visibility_dt)
    user_payloads: dict[int, dict[str, Any]] = {}
    review_population_by_user: dict[int, list[tuple[Any, str]]] = {}
    for review in cohort_reviews:
        eligibility = _manifest_eligibility(eligibility_manifest, review)
        review_population_by_user.setdefault(review.owner_user_id, []).append((review, eligibility))

    for owner_id, review_rows in review_population_by_user.items():
        first_review, first_eligibility = min(review_rows, key=lambda item: item[0].created_at)
        qualified_reviews = [item for item in review_rows if item[1] == 'qualified']
        first_qualified_review = min(qualified_reviews, key=lambda item: item[0].created_at)[0] if qualified_reviews else None
        user_payloads[owner_id] = {
            'id': f'user-{owner_id}',
            'user_id': f'user-{owner_id}',
            'eligibility': first_eligibility,
            'first_qualified_review_at': first_qualified_review.created_at.isoformat() if first_qualified_review else None,
            'first_review_at': first_review.created_at.isoformat(),
            'source_review_id': first_review.public_id,
            'sessions': [],
            'review_population': [
                {
                    'review_id': review.public_id,
                    'created_at': review.created_at.isoformat(),
                    'eligibility': eligibility,
                }
                for review, eligibility in review_rows
            ],
        }

    eligible_session_source_review_ids = [review.id for review in eligible_session_source_reviews]
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.source_review_id.in_(eligible_session_source_review_ids) if eligible_session_source_review_ids else False)
        .filter(PracticeSession.created_at <= as_of_dt)
        .all()
    )
    session_ids = [session.id for session in sessions]
    attempts = (
        db.query(PracticeAttempt)
        .filter(PracticeAttempt.session_id.in_(session_ids) if session_ids else False)
        .filter(PracticeAttempt.created_at <= as_of_dt)
        .all()
    )
    task_ids = sorted({attempt.task_id for attempt in attempts})
    review_ids = sorted({attempt.review_id for attempt in attempts if attempt.review_id is not None} | set(eligible_session_source_review_ids))
    photo_ids = sorted({session.source_photo_id for session in sessions} | {attempt.photo_id for attempt in attempts})
    source_task_ids = sorted({review.task_id for review in eligible_session_source_reviews if review.task_id is not None})
    all_task_ids = sorted(set(task_ids) | set(source_task_ids))
    tasks = {task.id: task for task in db.query(ReviewTask).filter(ReviewTask.id.in_(all_task_ids)).all()} if all_task_ids else {}
    reviews = {review.id: review for review in db.query(Review).filter(Review.id.in_(review_ids)).all()} if review_ids else {}
    photos = {photo.id: photo for photo in db.query(Photo).filter(Photo.id.in_(photo_ids)).all()} if photo_ids else {}
    event_facts = _load_practice_event_facts(db, ProductAnalyticsEvent, attempts, sessions, owners, as_of_dt)
    viewed_events = event_facts['viewed_events']
    shown_events = event_facts['shown_events']
    payments_by_user = _load_authoritative_payment_events(db, BillingWebhookEvent, owners, as_of_dt)
    feedbacks_by_attempt = _load_practice_feedbacks(db, PracticeFeedback, attempts, as_of_dt)
    for owner_id, user_payload in user_payloads.items():
        user_payload['payment_events'] = payments_by_user.get(owner_id, [])

    attempts_by_session: dict[int, list[Any]] = {}
    for attempt in attempts:
        attempts_by_session.setdefault(attempt.session_id, []).append(attempt)

    costs_by_task = _load_review_call_costs(db, all_task_ids, as_of_dt, start_dt, end_dt)
    generation_reference_costs = _load_generation_reference_costs(db, sessions, attempts, as_of_dt, start_dt, end_dt)

    for session in sessions:
        source_review = reviews.get(session.source_review_id)
        if source_review is None:
            continue
        user_payload = user_payloads.setdefault(session.owner_user_id, {
            'id': f'user-{session.owner_user_id}',
            'user_id': f'user-{session.owner_user_id}',
            'eligibility': 'unknown',
            'first_qualified_review_at': None,
            'sessions': [],
            'payment_events': payments_by_user.get(session.owner_user_id, []),
        })
        if source_review.task_id is not None:
            source_task_costs = costs_by_task.get(source_review.task_id)
            if source_task_costs is None:
                source_task_costs = _cost_fallback_for_missing_rows(tasks.get(source_review.task_id), source_review.task_id)
            user_payload.setdefault('generation_reference_costs', []).extend(source_task_costs)
        user_payload.setdefault('generation_reference_costs', []).extend(generation_reference_costs.get(session.id, []))
        user_payload['sessions'].append({
            'session_id': session.public_id,
            'practice_kind': session.practice_kind,
            'created_at': session.created_at.isoformat(),
            'goal_shown_at': shown_events.get(session.id).isoformat() if shown_events.get(session.id) else None,
            'goal_accepted_at': session.created_at.isoformat(),
            'attempts': [
                _attempt_payload_from_db(
                    attempt,
                    session,
                    tasks.get(attempt.task_id),
                    reviews.get(attempt.review_id),
                    source_review,
                    photos.get(attempt.photo_id),
                    photos.get(session.source_photo_id),
                    review_history_cutoff(current_plan_by_owner.get(session.owner_user_id, UserPlan.free), now=visibility_dt),
                    session.owner_user_id in owners,
                    viewed_events,
                    feedbacks_by_attempt,
                    costs_by_task,
                )
                for attempt in sorted(attempts_by_session.get(session.id, []), key=lambda item: item.sequence)
            ],
        })

    return build_practice_snapshot(
        {
            'fixtures': list(user_payloads.values()),
            'as_of': as_of_dt,
            'visibility_evaluated_at': visibility_dt,
            'start_date': start_dt,
            'end_date': end_dt,
            'data_source': 'database',
        },
        as_of=as_of_dt,
        start_date=start_dt,
        end_date=end_dt,
    )


def render_practice_analytics_markdown(snapshot: PracticeSnapshot | dict[str, Any]) -> str:
    data = snapshot.to_dict() if isinstance(snapshot, PracticeSnapshot) else snapshot
    costs = data['costs']
    lines = [
        '# Practice Analytics Snapshot',
        '',
        f"- As of: `{data['as_of']}`",
        f"- Visibility evaluated at: `{data.get('visibility_evaluated_at', data['as_of'])}`",
        f"- Data source: `{data.get('data_source', 'unknown')}`",
        f"- Mature A7 cohort users: `{data['mature_cohort_user_count']}`",
    ]
    if data.get('sample_size_note'):
        lines.append('- Sample note: cohort is under 30 users; use descriptive interpretation only.')
    lines.extend([
        '',
        '## Funnel',
        '',
        '| Metric | Mature denominator | Numerator | Rate |',
        '| --- | ---: | ---: | ---: |',
        f"| A7 first loop | {data['a7']['mature_denominator']} | {data['a7']['numerator']} | {_percent(_decimal_from_serialized(data['a7']['rate']))} |",
        f"| L14 second loop | {data['l14']['mature_denominator']} | {data['l14']['numerator']} | {_percent(_decimal_from_serialized(data['l14']['rate']))} |",
        f"| W4 return day 22-28 | {data['w4']['mature_denominator']} | {data['w4']['numerator']} | {_percent(_decimal_from_serialized(data['w4']['rate']))} |",
    ])
    r1 = data.get('practice_funnel') or {}
    if r1:
        lines.extend([
            '',
            '## R1 Funnel',
            '',
            '| Metric | Mature denominator | Numerator | Rate | Pending | Exceptions / null reason |',
            '| --- | ---: | ---: | ---: | ---: | --- |',
        ])
        for label, key in [
            ('24h target acceptance', 'goal_acceptance_24h'),
            ('7d accepted to capture attempt', 'accepted_to_attempt_7d'),
            ('Comparison availability', 'comparison_availability'),
            ('All request success', 'request_success'),
            ('Feedback response', ('feedback', 'response_rate')),
            ('Feedback helpfulness', ('feedback', 'helpfulness_rate')),
            ('30d first paid after loop', 'training_paid_30d'),
        ]:
            metric = _nested_metric(r1, key)
            lines.append(
                f"| {label} | {metric.get('mature_denominator', 0)} | {metric.get('numerator', 0)} | "
                f"{_percent(_decimal_from_serialized(metric.get('rate')))} | {metric.get('pending_denominator', 0)} | "
                f"{metric.get('exception_count', 0)} / {metric.get('null_reason') or ''} |"
            )
        if r1.get('weekly_qualified_users'):
            lines.extend(['', '| Week start | Qualified loop users |', '| --- | ---: |'])
            for row in r1['weekly_qualified_users']:
                lines.append(f"| {row['week_start']} | {row['qualified_user_count']} |")
        if (r1.get('request_success') or {}).get('state_counts'):
            states = r1['request_success']['state_counts']
            lines.append(
                f"- Request states: succeeded `{states.get('succeeded', 0)}`, pending `{states.get('pending', 0)}`, "
                f"failed `{states.get('failed', 0)}`, timeout `{states.get('timeout', 0)}`."
            )
        paid = r1.get('training_paid_30d') or {}
        lines.append(f"- Payment evidence state: `{paid.get('evidence_state', 'unknown')}`")
        lines.append(f"- R1 denominator notes: {r1.get('time_scope', '')}; {r1.get('identity_scope', '')}; {r1.get('channel_scope', '')}.")
    lines.extend([
        '',
        '## Goal Assessments',
        '',
        f"- Assessed attempts: `{data['goal_assessments']['denominator']}`",
        f"- Indeterminate: `{data['goal_assessments']['indeterminate_numerator']}` ({_percent(_decimal_from_serialized(data['goal_assessments']['rate']))})",
        '',
        '## Attempts',
        '',
        '| Bucket | Count |',
        '| --- | ---: |',
    ])
    for key, value in sorted((data.get('attempt_outcome_counts') or {}).items()):
        lines.append(f'| {key} | {value} |')
    lines.extend([
        '',
        '## Costs',
        '',
        f"- Cost basis: `{costs.get('cost_basis', 'estimated')}`",
        f"- Cost reconciliation: `{costs.get('reconciliation', 'not_provided')}`",
        f"- All incurred known cost: `${costs['known_practice_cost_usd']}`",
        f"- Official qualified known cost numerator: `${costs.get('official_known_practice_cost_usd', costs['known_practice_cost_usd'])}`",
        f"- Windowed unknown cost request count: `{costs['unknown_cost_request_count']}`",
        f"- Official qualified unknown cost request count: `{costs.get('official_unknown_cost_request_count', costs['unknown_cost_request_count'])}`",
        f"- Unknown cost request count: `{costs['unknown_cost_request_count']}`",
        f"- Unwindowable cost request count: `{costs.get('unwindowable_cost_request_count', 0)}`",
        f"- Official qualified unwindowable cost request count: `{costs.get('official_unwindowable_cost_request_count', 0)}`",
        f"- Windowed cost coverage: `{_percent(_decimal_from_serialized(costs['cost_coverage_rate']))}`",
        f"- Failed provider calls: `{costs.get('failed_call_count', 0)}`",
        f"- Retry provider calls: `{costs.get('retry_call_count', 0)}`",
        f"- Valid capture loops: `{costs['valid_capture_loop_count']}`",
        f"- Excluded diagnostic valid capture loops: `{costs.get('excluded_valid_capture_loop_count', 0)}`",
    ])
    if costs.get('stage_breakdown'):
        lines.extend(['', '| Stage | Known cost | Known calls | Unknown calls | Total calls |', '| --- | ---: | ---: | ---: | ---: |'])
        for stage, item in sorted(costs['stage_breakdown'].items()):
            lines.append(
                f"| {stage} | ${item['known_cost_usd']} | {item['known_call_count']} | {item['unknown_call_count']} | {item['total_call_count']} |"
            )
    if costs['unit_cost_usd'] is None:
        lines.append(f"- Unit cost: `null` ({costs['unit_cost_null_reason']})")
        if costs['known_cost_unit_cost_lower_bound_usd'] is not None:
            lines.append(f"- Known-cost unit-cost lower bound: `${costs['known_cost_unit_cost_lower_bound_usd']}`")
    else:
        lines.append(f"- Unit cost: `${costs['unit_cost_usd']}`")
    return '\n'.join(lines) + '\n'


def _nested_metric(data: Mapping[str, Any], key: str | tuple[str, str]) -> dict[str, Any]:
    if isinstance(key, tuple):
        first, second = key
        value = (data.get(first) or {}).get(second) or {}
    else:
        value = data.get(key) or {}
    return dict(value) if isinstance(value, Mapping) else {}


def _normalize_fixture_payload(data: dict[str, Any] | list[dict[str, Any]]) -> dict[str, Any]:
    if isinstance(data, list):
        return {'fixtures': data}
    if 'fixtures' in data:
        return data
    return {'fixtures': [data], 'as_of': data.get('as_of')}


def _fixture_review_population(fixture: dict[str, Any]) -> list[dict[str, Any]]:
    explicit = fixture.get('review_population')
    if explicit:
        return list(explicit)
    first = fixture.get('first_qualified_review_at') or fixture.get('first_review_at')
    if first:
        return [{
            'review_id': fixture.get('source_review_id') or fixture.get('id'),
            'created_at': first,
            'eligibility': _fixture_eligibility(fixture),
        }]
    return []


def _attempt_from_fixture(fixture: dict[str, Any], session: dict[str, Any], attempt: dict[str, Any], user_id: str) -> _AttemptRecord:
    status = attempt.get('goal_status')
    failed = bool(attempt.get('failed') or attempt.get('task_status') in TERMINAL_FAILURE_STATUSES)
    access_snapshot_verified = attempt.get('access_snapshot_verified') is True
    exclusion_reasons = list(attempt.get('learning_exclusion_reasons') or ())
    if not access_snapshot_verified:
        exclusion_reasons.append('missing_access_snapshot')
    feedback = _latest_feedback_for_attempt(attempt, session, fixture)
    return _AttemptRecord(
        attempt_id=str(attempt.get('attempt_id') or attempt.get('id') or ''),
        session_id=str(session.get('session_id') or session.get('id') or ''),
        user_id=user_id,
        practice_kind=str(attempt.get('attempt_kind') or session.get('practice_kind') or 'unknown'),
        accepted_at=_parse_optional_datetime(attempt.get('accepted_at') or attempt.get('created_at') or session.get('created_at')),
        analysis_completed_at=_parse_optional_datetime(attempt.get('analysis_completed_at')),
        result_viewed_at=_parse_optional_datetime(attempt.get('result_viewed_at')),
        goal_status=status,
        cost_usd=_parse_decimal_or_none(attempt.get('cost_usd')),
        failed=failed,
        has_valid_evidence=_fixture_has_evidence(attempt),
        comparable=_fixture_comparable(attempt),
        comparison_confidence=_comparison_confidence(attempt),
        task_attempt_count=_parse_int_or_none(attempt.get('task_attempt_count')),
        cost_stage=str(attempt.get('stage') or 'practice_attempt'),
        cost_outcome=str(attempt.get('outcome') or ('failed' if failed else 'succeeded')),
        cost_call_key=str(attempt.get('call_key') or attempt.get('attempt_id') or attempt.get('id') or ''),
        learning_exclusion_reasons=tuple(exclusion_reasons),
        access_snapshot_verified=access_snapshot_verified,
        feedback_verdict=feedback.get('verdict') if feedback else None,
        feedback_created_at=_parse_optional_datetime(feedback.get('created_at') or feedback.get('feedback_at')) if feedback else None,
    )


def _latest_feedback_for_attempt(
    attempt: dict[str, Any],
    session: dict[str, Any],
    fixture: dict[str, Any],
) -> dict[str, Any] | None:
    attempt_id = str(attempt.get('attempt_id') or attempt.get('id') or '')
    candidates: list[dict[str, Any]] = []
    raw_feedback = attempt.get('feedback')
    if isinstance(raw_feedback, Mapping):
        candidates.append(dict(raw_feedback))
    candidates.extend([dict(item) for item in attempt.get('feedbacks') or [] if isinstance(item, Mapping)])
    for container in (session, fixture):
        for item in container.get('feedbacks') or container.get('feedback') or []:
            if not isinstance(item, Mapping):
                continue
            if str(item.get('attempt_id') or '') == attempt_id:
                candidates.append(dict(item))
    dated = [
        item for item in candidates
        if item.get('verdict') in {'helpful', 'not_helpful', 'incorrect'}
        and _parse_optional_datetime(item.get('created_at') or item.get('feedback_at')) is not None
    ]
    if not dated:
        return None
    return max(dated, key=lambda item: _parse_optional_datetime(item.get('created_at') or item.get('feedback_at')) or datetime.min.replace(tzinfo=timezone.utc))


def _cost_record_from_fixture(value: dict[str, Any]) -> _CostRecord:
    call_key = str(value.get('call_key') or value.get('task_id') or value.get('id') or '')
    base_id = str(value.get('id') or value.get('request_id') or value.get('task_id') or value.get('generation_task_id') or '')
    request_id = f'{base_id}:{call_key}' if base_id and call_key and base_id != call_key else (base_id or call_key)
    return _CostRecord(
        cost_usd=_parse_decimal_or_none(value.get('cost_usd')),
        source=str(value.get('source') or 'generation_reference'),
        request_id=request_id,
        stage=str(value.get('stage') or value.get('source') or 'reference'),
        outcome=str(value.get('outcome') or 'unknown'),
        call_key=call_key,
        created_at=_parse_optional_datetime(value.get('created_at')),
        attempt_count=_parse_int_or_none(value.get('attempt_count')),
        basis=value.get('basis'),
        user_id=str(value.get('user_id')) if value.get('user_id') is not None else None,
        unwindowable=bool(value.get('unwindowable')),
    )


def _fixture_eligibility(fixture: dict[str, Any]) -> str:
    if fixture.get('eligibility') in {'qualified', 'unqualified', 'unknown'}:
        return str(fixture['eligibility'])
    if fixture.get('first_qualified_review_at'):
        return 'qualified'
    return 'unknown'


def _fixture_comparable(attempt: dict[str, Any]) -> bool:
    if attempt.get('comparison_is_comparable') is not None:
        return bool(attempt.get('comparison_is_comparable'))
    if 'expected_valid_loop' in attempt:
        return attempt.get('goal_status') in (VALID_GOAL_STATUSES | {INDETERMINATE_STATUS})
    comparison = attempt.get('comparison') or {}
    if comparison.get('is_comparable') is not None:
        return bool(comparison.get('is_comparable'))
    return False


def _fixture_has_evidence(attempt: dict[str, Any]) -> bool:
    evidence = attempt.get('evidence')
    if evidence is None:
        evidence = (attempt.get('goal_assessment') or {}).get('evidence')
    if evidence is not None:
        return bool(evidence)
    if 'expected_valid_loop' in attempt:
        return attempt.get('goal_status') in (VALID_GOAL_STATUSES | {INDETERMINATE_STATUS})
    return bool(evidence) or attempt.get('goal_status') == INDETERMINATE_STATUS


def _comparison_confidence(attempt: dict[str, Any]) -> str | None:
    confidence = attempt.get('comparison_confidence')
    if confidence is None:
        confidence = (attempt.get('comparison') or {}).get('comparison_confidence')
    if confidence is None and 'expected_valid_loop' in attempt and attempt.get('expected_valid_loop'):
        return 'high'
    if confidence is None and 'expected_valid_loop' in attempt and attempt.get('goal_status') in VALID_GOAL_STATUSES:
        return 'high'
    return str(confidence).lower() if confidence is not None else None


def _has_countable_goal_assessment(record: _AttemptRecord, as_of: datetime) -> bool:
    return (
        record.practice_kind in ASSESSABLE_KINDS
        and not record.failed
        and not record.learning_exclusion_reasons
        and record.access_snapshot_verified
        and record.goal_status in (VALID_GOAL_STATUSES | {INDETERMINATE_STATUS})
        and _attempt_timing_valid(record, as_of)
        and (record.goal_status == INDETERMINATE_STATUS or (record.has_valid_evidence and record.comparable and record.comparison_confidence not in LOW_COMPARISON_CONFIDENCE))
    )


def _is_valid_capture_loop(record: _AttemptRecord, as_of: datetime) -> bool:
    return (
        record.practice_kind == VALID_CAPTURE_KIND
        and not record.failed
        and not record.learning_exclusion_reasons
        and record.access_snapshot_verified
        and record.goal_status in VALID_GOAL_STATUSES
        and record.has_valid_evidence
        and record.comparable
        and record.comparison_confidence not in LOW_COMPARISON_CONFIDENCE
        and _attempt_timing_valid(record, as_of)
    )


def _attempt_timing_valid(record: _AttemptRecord, as_of: datetime) -> bool:
    if record.analysis_completed_at is None or record.result_viewed_at is None:
        return False
    if record.result_viewed_at > as_of or record.analysis_completed_at > as_of:
        return False
    if record.analysis_completed_at > record.result_viewed_at:
        return False
    if record.accepted_at is not None and record.accepted_at > record.analysis_completed_at:
        return False
    return True


def _attempt_request_state(attempt: Mapping[str, Any], record: _AttemptRecord) -> str:
    raw_state = str(
        attempt.get('request_state')
        or attempt.get('task_state')
        or attempt.get('task_status')
        or attempt.get('outcome')
        or ''
    ).lower()
    if raw_state in {'pending', 'running', 'queued'}:
        return 'pending'
    if raw_state in {'timeout', 'timed_out', 'expired'}:
        return 'timeout'
    if raw_state in {'failed', 'dead_letter', 'error'} or record.failed:
        return 'failed'
    if record.analysis_completed_at is not None and not record.failed:
        return 'succeeded'
    return 'pending'


def _attempt_cost_in_window(record: _AttemptRecord, start_date: datetime | None, end_date: datetime | None, as_of: datetime) -> bool:
    event_time = record.analysis_completed_at or record.accepted_at
    if event_time is None or event_time > as_of:
        return False
    return _within_window(event_time, start_date, end_date)


def _within_window(value: datetime, start_date: datetime | None, end_date: datetime | None) -> bool:
    if start_date is not None and value < start_date:
        return False
    if end_date is not None and value >= end_date:
        return False
    return True


def _first_qualified_review_by_user(records: Iterable[_ReviewPopulationRecord]) -> dict[str, datetime]:
    first: dict[str, datetime] = {}
    for record in records:
        if record.eligibility != 'qualified':
            continue
        first[record.user_id] = min(first.get(record.user_id, record.created_at), record.created_at)
    return first


def _build_practice_funnel(
    *,
    as_of: datetime,
    start_date: datetime | None,
    end_date: datetime | None,
    first_review_by_user: Mapping[str, datetime],
    valid_loops: list[_LoopRecord],
    goal_exposures: list[dict[str, Any]],
    goal_acceptances: list[dict[str, Any]],
    submitted_attempts: list[dict[str, Any]],
    analysis_attempts: list[dict[str, Any]],
    feedback_eligible_views: list[dict[str, Any]],
    feedback_answers: list[dict[str, Any]],
    payment_events: list[dict[str, Any]],
) -> dict[str, Any]:
    qualified_user_ids = set(first_review_by_user)
    loops_in_window = [
        loop for loop in valid_loops
        if loop.user_id in qualified_user_ids and _within_window(loop.session_created_at, start_date, end_date)
    ]
    first_loop_by_user = _first_record_by_user(loops_in_window, 'session_created_at')
    weekly_users: dict[datetime, set[str]] = {}
    for user_id, loop in first_loop_by_user.items():
        week_start = _utc_week_start(loop.session_created_at)
        weekly_users.setdefault(week_start, set()).add(user_id)

    first_exposure_by_user = _first_event_by_user(goal_exposures, qualified_user_ids)
    first_accept_by_user = _first_event_by_user(goal_acceptances, qualified_user_ids)
    mature_exposed_users = {
        user_id for user_id, event in first_exposure_by_user.items()
        if _within_window(event['at'], start_date, end_date) and event['at'] + timedelta(hours=24) <= as_of
    }
    accepted_within_24h_users = {
        user_id for user_id in mature_exposed_users
        if user_id in first_accept_by_user and first_exposure_by_user[user_id]['at'] <= first_accept_by_user[user_id]['at'] <= first_exposure_by_user[user_id]['at'] + timedelta(hours=24)
    }
    immature_exposure_count = sum(
        1 for event in first_exposure_by_user.values()
        if _within_window(event['at'], start_date, end_date) and event['at'] + timedelta(hours=24) > as_of
    )
    accepted_without_exposure = len(set(first_accept_by_user) - set(first_exposure_by_user))

    mature_accept_users = {
        user_id for user_id, event in first_accept_by_user.items()
        if _within_window(event['at'], start_date, end_date) and event['at'] + timedelta(days=7) <= as_of
    }
    first_submission_by_user = _first_event_by_user(submitted_attempts, qualified_user_ids)
    submitted_within_7d_users = {
        user_id for user_id in mature_accept_users
        if user_id in first_submission_by_user and first_accept_by_user[user_id]['at'] <= first_submission_by_user[user_id]['at'] <= first_accept_by_user[user_id]['at'] + timedelta(days=7)
    }
    immature_accept_count = sum(
        1 for event in first_accept_by_user.values()
        if _within_window(event['at'], start_date, end_date) and event['at'] + timedelta(days=7) > as_of
    )

    analysis_by_attempt = {
        item['attempt_id']: item for item in analysis_attempts
        if item.get('user_id') in qualified_user_ids and _within_window(item['at'], start_date, end_date)
    }
    successful_analysis = [
        item for item in analysis_by_attempt.values()
        if item.get('state') == 'succeeded'
    ]
    comparable = [
        item for item in successful_analysis
        if item.get('has_valid_evidence') and item.get('comparable') and item.get('comparison_confidence') not in LOW_COMPARISON_CONFIDENCE
    ]
    request_state_counts = {'succeeded': 0, 'pending': 0, 'failed': 0, 'timeout': 0}
    for item in analysis_by_attempt.values():
        state = str(item.get('state') or 'pending')
        request_state_counts[state if state in request_state_counts else 'pending'] += 1

    viewed_by_attempt = {
        item['attempt_id']: item for item in feedback_eligible_views
        if item.get('user_id') in qualified_user_ids and _within_window(item['at'], start_date, end_date)
    }
    latest_feedback_by_attempt: dict[str, dict[str, Any]] = {}
    for item in feedback_answers:
        if item.get('user_id') not in qualified_user_ids or not _within_window(item['at'], start_date, end_date):
            continue
        attempt_id = str(item.get('attempt_id') or '')
        if not attempt_id:
            continue
        if attempt_id not in latest_feedback_by_attempt or item['at'] > latest_feedback_by_attempt[attempt_id]['at']:
            latest_feedback_by_attempt[attempt_id] = item
    viewed_users = {item['user_id'] for item in viewed_by_attempt.values()}
    answered_users = {item['user_id'] for item in latest_feedback_by_attempt.values()}
    helpful_users = {item['user_id'] for item in latest_feedback_by_attempt.values() if item.get('verdict') == 'helpful'}

    paid_events_by_user = _events_by_user(payment_events, qualified_user_ids)
    matured_first_loop_users = {
        user_id for user_id, loop in first_loop_by_user.items()
        if loop.session_created_at + timedelta(days=30) <= as_of
    }
    previously_paid_users = {
        user_id for user_id in matured_first_loop_users
        if any(event['at'] < first_loop_by_user[user_id].session_created_at for event in paid_events_by_user.get(user_id, []))
    }
    paid_denominator_users = matured_first_loop_users - previously_paid_users
    paid_within_30d_users = {
        user_id for user_id in paid_denominator_users
        if any(first_loop_by_user[user_id].session_created_at <= event['at'] <= first_loop_by_user[user_id].session_created_at + timedelta(days=30)
               for event in paid_events_by_user.get(user_id, []))
    }
    paid_unknown = not payment_events

    return {
        'schema_version': 'practice-funnel-v1',
        'metric_contracts': _practice_metric_contracts(),
        'weekly_qualified_users': [
            {'week_start': week.isoformat().replace('+00:00', 'Z'), 'qualified_user_count': len(users)}
            for week, users in sorted(weekly_users.items())
        ],
        'goal_acceptance_24h': _metric_dict(
            len(mature_exposed_users),
            len(accepted_within_24h_users),
            pending_denominator=immature_exposure_count,
            exception_count=accepted_without_exposure,
            null_reason='no_mature_exposures' if not mature_exposed_users else None,
        ),
        'accepted_to_attempt_7d': _metric_dict(
            len(mature_accept_users),
            len(submitted_within_7d_users),
            pending_denominator=immature_accept_count,
            null_reason='no_mature_acceptances' if not mature_accept_users else None,
        ),
        'comparison_availability': _metric_dict(
            len(successful_analysis),
            len(comparable),
            null_reason='no_successful_analysis_attempts' if not successful_analysis else None,
        ),
        'request_success': {
            **_metric_dict(
                len(analysis_by_attempt),
                request_state_counts['succeeded'],
                null_reason='no_accepted_requests' if not analysis_by_attempt else None,
            ),
            'state_counts': request_state_counts,
        },
        'feedback': {
            'response_rate': _metric_dict(
                len(viewed_users),
                len(answered_users),
                null_reason='no_viewed_feedback_results' if not viewed_users else None,
            ),
            'helpfulness_rate': _metric_dict(
                len(answered_users),
                len(helpful_users),
                null_reason='no_feedback_answers' if not answered_users else None,
            ),
            'latest_answered_attempt_count': len(latest_feedback_by_attempt),
            'snapshot_semantics': 'latest_feedback_snapshot_as_of',
        },
        'training_paid_30d': {
            **_metric_dict(
                0 if paid_unknown else len(paid_denominator_users),
                0 if paid_unknown else len(paid_within_30d_users),
                null_reason='insufficient_payment_evidence' if paid_unknown else (
                    'no_mature_first_loop_unpaid_users' if not paid_denominator_users else None
                ),
            ),
            'previously_paid_user_count': len(previously_paid_users) if not paid_unknown else 0,
            'evidence_state': 'unknown' if paid_unknown else 'payment_events',
        },
        'identity_scope': 'canonical_user_id_or_user_id',
        'time_scope': 'UTC half-open windows; week starts Monday 00:00 UTC',
        'channel_scope': 'channel is carried for slicing but does not change global denominators',
    }


def _practice_metric_contracts() -> dict[str, dict[str, str]]:
    return {
        'weekly_qualified_users': {
            'unit': 'users',
            'window': 'UTC week by first complete qualified capture loop session time',
            'source': 'PracticeSession + PracticeAttempt + result viewed event + eligibility manifest',
            'dedupe_key': 'user_id per week',
            'maturity': 'none after loop is complete',
            'unknown': 'missing eligibility or access proof excludes official count',
        },
        'goal_acceptance_24h': {
            'unit': 'users',
            'window': '24 hours after first observed target-card exposure',
            'source': 'practice_goal_shown exposure and PracticeSession acceptance',
            'dedupe_key': 'first exposure per user',
            'maturity': 'exposure timestamp + 24h <= as_of',
            'unknown': 'accepted_without_exposure is reported as exception, not repaired into denominator',
        },
        'accepted_to_attempt_7d': {
            'unit': 'users',
            'window': '7 days after first accepted goal',
            'source': 'PracticeSession acceptance and PracticeAttempt submit fact',
            'dedupe_key': 'first acceptance per user',
            'maturity': 'acceptance timestamp + 7d <= as_of',
            'unknown': 'edits and same-image rechecks are excluded from capture submit numerator',
        },
        'comparison_availability': {
            'unit': 'attempts',
            'window': 'report start/end by analysis completion',
            'source': 'Review goal_assessment and comparison evidence',
            'dedupe_key': 'attempt_id',
            'maturity': 'analysis succeeded',
            'unknown': 'missing evidence, low confidence and incomparable remain visible in attempt buckets',
        },
        'request_success': {
            'unit': 'attempts',
            'window': 'report start/end by request state timestamp',
            'source': 'PracticeAttempt + ReviewTask/Review terminal state',
            'dedupe_key': 'attempt_id',
            'maturity': 'accepted request has a terminal or pending state as of snapshot',
            'unknown': 'pending/failed/timeout are separate states',
        },
        'feedback': {
            'unit': 'users',
            'window': 'report start/end by latest persisted feedback as of snapshot',
            'source': 'PracticeFeedback and actual result viewed events',
            'dedupe_key': 'latest feedback per attempt, then user',
            'maturity': 'result was viewed and feedback snapshot is available',
            'unknown': 'no answers yields null helpfulness, not zero helpfulness',
        },
        'training_paid_30d': {
            'unit': 'users',
            'window': '30 days after first complete capture loop',
            'source': 'paid_success payment facts only',
            'dedupe_key': 'first paid_success per user',
            'maturity': 'first loop + 30d <= as_of and no earlier paid success',
            'unknown': 'no payment facts outputs insufficient_payment_evidence',
        },
    }


def _metric_dict(
    denominator: int,
    numerator: int,
    *,
    pending_denominator: int = 0,
    exception_count: int = 0,
    null_reason: str | None = None,
) -> dict[str, Any]:
    return {
        'mature_denominator': denominator,
        'numerator': numerator,
        'rate': _decimal_to_str(_rate(numerator, denominator)),
        'pending_denominator': pending_denominator,
        'exception_count': exception_count,
        'null_reason': null_reason,
    }


def _first_record_by_user(records: Iterable[_LoopRecord], attr: str) -> dict[str, _LoopRecord]:
    first: dict[str, _LoopRecord] = {}
    for record in records:
        if record.user_id not in first or getattr(record, attr) < getattr(first[record.user_id], attr):
            first[record.user_id] = record
    return first


def _first_event_by_user(events: Iterable[dict[str, Any]], allowed_users: set[str]) -> dict[str, dict[str, Any]]:
    first: dict[str, dict[str, Any]] = {}
    for event in events:
        user_id = str(event.get('user_id') or '')
        event_at = event.get('at')
        if user_id not in allowed_users or not isinstance(event_at, datetime):
            continue
        if user_id not in first or event_at < first[user_id]['at']:
            first[user_id] = event
    return first


def _events_by_user(events: Iterable[dict[str, Any]], allowed_users: set[str]) -> dict[str, list[dict[str, Any]]]:
    by_user: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        user_id = str(event.get('user_id') or '')
        event_at = event.get('at')
        if user_id not in allowed_users or not isinstance(event_at, datetime):
            continue
        by_user.setdefault(user_id, []).append(event)
    for values in by_user.values():
        values.sort(key=lambda item: item['at'])
    return by_user


def _utc_week_start(value: datetime) -> datetime:
    value = _parse_datetime(value)
    start = value - timedelta(days=value.weekday(), hours=value.hour, minutes=value.minute, seconds=value.second, microseconds=value.microsecond)
    return start


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 'yes', 'y'}
    return bool(value)


def _payment_positive_amount(event: Mapping[str, Any]) -> Decimal | None:
    for key in ('raw_amount', 'amount', 'amount_usd'):
        amount = _parse_decimal_or_none(event.get(key))
        if amount is not None and amount > Decimal('0'):
            return amount
    return None


def _build_cost_metric(
    cost_records: list[_CostRecord],
    valid_capture_loop_count: int,
    excluded_valid_capture_loop_count: int = 0,
    qualified_user_ids: set[str] | None = None,
) -> CostMetric:
    windowed_cost_records = [record for record in cost_records if not record.unwindowable]
    qualified_user_ids = qualified_user_ids or set()
    official_cost_records = [record for record in windowed_cost_records if record.user_id in qualified_user_ids]
    known_cost = sum((record.cost_usd for record in windowed_cost_records if record.cost_usd is not None), Decimal('0.000000'))
    known_cost_count = sum(1 for record in windowed_cost_records if record.cost_usd is not None)
    unknown_cost_count = sum(1 for record in windowed_cost_records if record.cost_usd is None)
    official_known_cost = sum((record.cost_usd for record in official_cost_records if record.cost_usd is not None), Decimal('0.000000'))
    official_unknown_cost_count = sum(1 for record in official_cost_records if record.cost_usd is None)
    unwindowable_cost_count = sum(1 for record in cost_records if record.unwindowable)
    official_unwindowable_cost_count = sum(1 for record in cost_records if record.unwindowable and record.user_id in qualified_user_ids)
    null_reasons: list[str] = []
    unit_cost: Decimal | None = None
    lower_bound: Decimal | None = None
    if valid_capture_loop_count == 0:
        null_reasons.append('no_valid_capture_loops')
    elif official_unwindowable_cost_count > 0:
        null_reasons.append('unwindowable_cost_present')
        lower_bound = _quantize_money(official_known_cost / Decimal(valid_capture_loop_count))
    elif official_unknown_cost_count > 0:
        null_reasons.append('unknown_cost_present')
        lower_bound = _quantize_money(official_known_cost / Decimal(valid_capture_loop_count))
    else:
        unit_cost = _quantize_money(official_known_cost / Decimal(valid_capture_loop_count))

    stage_breakdown: dict[str, dict[str, Any]] = {}
    for record in windowed_cost_records:
        stage = record.stage or record.source or 'unknown'
        item = stage_breakdown.setdefault(stage, {
            'known_cost_usd': Decimal('0.000000'),
            'known_call_count': 0,
            'unknown_call_count': 0,
            'total_call_count': 0,
        })
        item['total_call_count'] += 1
        if record.cost_usd is None:
            item['unknown_call_count'] += 1
        else:
            item['known_call_count'] += 1
            item['known_cost_usd'] += record.cost_usd
    serial_stage_breakdown = {
        stage: {
            **item,
            'known_cost_usd': _decimal_to_str(_quantize_money(item['known_cost_usd'])),
        }
        for stage, item in stage_breakdown.items()
    }

    return CostMetric(
        known_practice_cost_usd=_quantize_money(known_cost),
        official_known_practice_cost_usd=_quantize_money(official_known_cost),
        unknown_cost_request_count=unknown_cost_count,
        official_unknown_cost_request_count=official_unknown_cost_count,
        unwindowable_cost_request_count=unwindowable_cost_count,
        official_unwindowable_cost_request_count=official_unwindowable_cost_count,
        known_cost_request_count=known_cost_count,
        total_cost_request_count=len(windowed_cost_records),
        cost_coverage_rate=_rate(known_cost_count, len(windowed_cost_records)),
        valid_capture_loop_count=valid_capture_loop_count,
        excluded_valid_capture_loop_count=excluded_valid_capture_loop_count,
        unit_cost_usd=unit_cost,
        unit_cost_null_reason=', '.join(null_reasons) if null_reasons else None,
        known_cost_unit_cost_lower_bound_usd=lower_bound,
        stage_breakdown=serial_stage_breakdown,
        failed_call_count=sum(1 for record in windowed_cost_records if record.outcome == 'failed'),
        retry_call_count=sum(max((record.attempt_count or 1) - 1, 0) for record in windowed_cost_records),
    )


def _manifest_eligibility(manifest: Mapping[str, Any] | None, review: Any) -> str:
    if not manifest:
        return 'unknown'
    keys = [str(review.public_id), str(review.owner_user_id), f'user-{review.owner_user_id}']
    for key in keys:
        if key not in manifest:
            continue
        value = manifest[key]
        if isinstance(value, Mapping):
            value = value.get('eligibility') or value.get('status')
        if value in {'qualified', 'unqualified', 'unknown'}:
            return str(value)
    return 'unknown'


def _current_plan_by_owner(owners: Mapping[int, Any], subscriptions: Iterable[Any], visibility_evaluated_at: datetime) -> dict[int, UserPlan]:
    plans: dict[int, UserPlan] = {}
    for owner_id, owner in owners.items():
        stored_plan = getattr(owner, 'plan', UserPlan.free)
        plans[owner_id] = UserPlan.guest if stored_plan == UserPlan.guest else UserPlan.free
    for subscription in subscriptions:
        owner_id = getattr(subscription, 'user_id', None)
        if owner_id not in plans:
            continue
        if subscription_grants_pro_access(subscription, now=visibility_evaluated_at):
            plans[owner_id] = UserPlan.pro
    return plans


def _access_exclusion_reason(prefix: str, access: str) -> str:
    if access == ACCESS_PHOTO_UNAVAILABLE:
        return f'{prefix}_photo_unavailable'
    if access == ACCESS_NONE:
        return f'{prefix}_missing'
    return f'{prefix}_{access}'


def _attempt_payload_from_db(
    attempt: Any,
    session: Any,
    task: Any | None,
    review: Any | None,
    source_review: Any | None,
    attempt_photo: Any | None,
    source_photo: Any | None,
    cutoff: datetime | None,
    owner_exists: bool,
    viewed_events: dict[int, datetime],
    feedbacks_by_attempt: dict[int, list[dict[str, Any]]],
    costs_by_task: dict[int, list[dict[str, Any]]],
) -> dict[str, Any]:
    task_status = _enum_value(getattr(task, 'status', None))
    review_status = _enum_value(getattr(review, 'status', None))
    failed = task_status in TERMINAL_FAILURE_STATUSES or review_status == 'FAILED'
    valid_goal = _validated_goal_status_from_db(attempt, session, task, review, source_review, attempt_photo, source_photo, cutoff, owner_exists)
    event_time = viewed_events.get(attempt.id)
    cost_rows = costs_by_task.get(attempt.task_id)
    if cost_rows is None:
        cost_rows = _cost_fallback_for_missing_rows(task, attempt.task_id)
    return {
        'attempt_id': attempt.public_id,
        'sequence': attempt.sequence,
        'accepted_at': attempt.created_at.isoformat() if attempt.created_at else None,
        'analysis_type': (getattr(task, 'request_payload', None) or {}).get('analysis_type') if task else None,
        'task_attempt_count': getattr(task, 'attempt_count', None),
        'task_status': task_status,
        'analysis_completed_at': review.created_at.isoformat() if review and review.created_at else None,
        'result_viewed_at': event_time.isoformat() if event_time else None,
        'goal_status': valid_goal['status'],
        'cost_usd': None,
        'cost_rows': cost_rows,
        'outcome': 'failed' if failed else 'unknown',
        'failed': failed,
        'attempt_kind': attempt.attempt_kind or session.practice_kind,
        'comparison_is_comparable': valid_goal['comparable'],
        'comparison_confidence': valid_goal['comparison_confidence'],
        'evidence': valid_goal['evidence'],
        'learning_exclusion_reasons': valid_goal.get('learning_exclusion_reasons') or [],
        'access_snapshot_verified': True,
        'feedbacks': feedbacks_by_attempt.get(attempt.id, []),
    }


def _validated_goal_status_from_db(
    attempt: Any,
    session: Any,
    task: Any | None,
    review: Any | None,
    source_review: Any | None,
    attempt_photo: Any | None,
    source_photo: Any | None,
    cutoff: datetime | None,
    owner_exists: bool = True,
) -> dict[str, Any]:
    def excluded(reason: str) -> dict[str, Any]:
        return {
            'status': None,
            'evidence': [],
            'comparable': False,
            'comparison_confidence': None,
            'learning_exclusion_reasons': [reason],
        }

    empty = {'status': None, 'evidence': [], 'comparable': False, 'comparison_confidence': None, 'learning_exclusion_reasons': []}
    if not owner_exists:
        return excluded('owner_missing')
    if source_review is None or source_photo is None:
        return excluded('source_photo_unavailable')
    source_access = source_access_summary(
        session,
        source_review=source_review,
        source_photo=source_photo,
        owner_user_id=session.owner_user_id,
        cutoff=cutoff,
    )
    if source_access.access != ACCESS_AVAILABLE:
        return excluded(_access_exclusion_reason('source', source_access.access))
    access = attempt_access_summary(
        attempt,
        source_access=source_access,
        target_photo=attempt_photo,
        task=task,
        review=review,
        owner_user_id=session.owner_user_id,
        cutoff=cutoff,
    )
    if access.review_access == ACCESS_PHOTO_UNAVAILABLE:
        return excluded('target_photo_unavailable')
    if access.review_access != ACCESS_AVAILABLE:
        return excluded(_access_exclusion_reason('result', access.review_access))
    if task is None or review is None or attempt_photo is None:
        return excluded('result_missing')
    if _enum_value(getattr(task, 'status', None)) != SUCCESS_STATUS or _enum_value(getattr(review, 'status', None)) != SUCCESS_STATUS:
        return excluded('task_or_review_not_succeeded')
    if getattr(review, 'deleted_at', None) is not None:
        return excluded('result_deleted')
    if getattr(source_review, 'deleted_at', None) is not None:
        return excluded('source_deleted')
    owner_id = session.owner_user_id
    if any(value != owner_id for value in [
        attempt.owner_user_id,
        task.owner_user_id,
        review.owner_user_id,
        source_review.owner_user_id,
        attempt_photo.owner_user_id,
        source_photo.owner_user_id,
    ]):
        return excluded('owner_mismatch')
    if attempt.review_id != review.id or attempt.task_id != task.id or attempt.source_review_id != session.source_review_id:
        return excluded('lineage_mismatch')
    if review.source_review_id != source_review.id or session.source_photo_id != source_photo.id or attempt.photo_id != attempt_photo.id:
        return excluded('lineage_mismatch')

    result = review.result_json or {}
    assessment = result.get('goal_assessment') or {}
    comparison = result.get('comparison') or result
    status = assessment.get('status')
    evidence = assessment.get('evidence') or []
    comparable = bool(comparison.get('is_comparable'))
    confidence = str(comparison.get('comparison_confidence') or '').lower() or None
    if status == INDETERMINATE_STATUS:
        return {'status': status, 'evidence': evidence, 'comparable': comparable, 'comparison_confidence': confidence}
    if status not in VALID_GOAL_STATUSES or not evidence or not comparable or confidence in LOW_COMPARISON_CONFIDENCE:
        return empty
    return {'status': status, 'evidence': evidence, 'comparable': comparable, 'comparison_confidence': confidence}


def _load_practice_viewed_events(db: Session, event_model: Any, attempts: Iterable[Any], as_of: datetime) -> dict[int, datetime]:
    attempt_by_public_id = {attempt.public_id: attempt.id for attempt in attempts}
    if not attempt_by_public_id:
        return {}
    rows = (
        db.query(event_model)
        .filter(event_model.event_name == 'practice_result_viewed', event_model.created_at <= as_of)
        .all()
    )
    viewed: dict[int, datetime] = {}
    for row in rows:
        metadata = row.metadata_json or {}
        internal_id = attempt_by_public_id.get(metadata.get('attempt_id'))
        if internal_id is None:
            continue
        viewed[internal_id] = min(viewed.get(internal_id, row.created_at), row.created_at)
    return viewed


def _load_practice_event_facts(
    db: Session,
    event_model: Any,
    attempts: Iterable[Any],
    sessions: Iterable[Any],
    owners: Mapping[int, Any],
    as_of: datetime,
) -> dict[str, Any]:
    attempts = list(attempts)
    sessions = list(sessions)
    attempt_by_public_id = {attempt.public_id: attempt.id for attempt in attempts}
    sessions_by_source_review = {session.source_review_id: session.id for session in sessions}
    rows = (
        db.query(event_model)
        .filter(event_model.event_name.in_({'practice_result_viewed', 'practice_goal_shown'}),
                event_model.created_at <= as_of)
        .all()
    )
    viewed: dict[int, datetime] = {}
    public_source_ids: dict[str, datetime] = {}
    for row in rows:
        metadata = row.metadata_json or {}
        if row.event_name == 'practice_result_viewed':
            internal_id = attempt_by_public_id.get(metadata.get('attempt_id'))
            if internal_id is not None:
                viewed[internal_id] = min(viewed.get(internal_id, row.created_at), row.created_at)
        elif row.event_name == 'practice_goal_shown':
            source_id = str(metadata.get('source_review_id') or '')
            if source_id:
                public_source_ids[source_id] = min(public_source_ids.get(source_id, row.created_at), row.created_at)

    shown: dict[int, datetime] = {}
    if public_source_ids:
        from app.db.models import Review

        reviews = db.query(Review).filter(Review.public_id.in_(set(public_source_ids))).all()
        for review in reviews:
            session_id = sessions_by_source_review.get(review.id)
            created_at = public_source_ids.get(review.public_id)
            if session_id is None or created_at is None:
                continue
            shown[session_id] = min(shown.get(session_id, created_at), created_at)

    return {'viewed_events': viewed, 'shown_events': shown}


PAID_WEBHOOK_OUTCOMES = frozenset({'one_time_pro_granted', 'payment_recorded', 'credit_pack_granted'})


def _load_authoritative_payment_events(db: Session, webhook_model: Any, owners: Mapping[int, Any], as_of: datetime) -> dict[int, list[dict[str, Any]]]:
    owner_ids = set(owners)
    if not owner_ids:
        return {}
    rows = (
        db.query(webhook_model)
        .filter(
            webhook_model.provider == 'lemonsqueezy',
            webhook_model.user_id.in_(owner_ids),
            webhook_model.test_mode.is_(False),
            webhook_model.processed_at.isnot(None),
            webhook_model.created_at <= as_of,
            webhook_model.outcome.in_(tuple(PAID_WEBHOOK_OUTCOMES)),
        )
        .all()
    )
    payments: dict[int, list[dict[str, Any]]] = {}
    seen_payment_ids: set[str] = set()
    for row in rows:
        payload = row.payload_json if isinstance(row.payload_json, dict) else {}
        if not _webhook_has_paid_status(row, payload):
            continue
        if _webhook_custom_flag(payload, 'gift') or _webhook_custom_flag(payload, 'comped'):
            continue
        amount = _webhook_paid_amount(payload)
        if amount is None:
            continue
        payment_id = _webhook_payment_id(row, payload)
        if not payment_id or payment_id in seen_payment_ids:
            continue
        seen_payment_ids.add(payment_id)
        paid_at = _webhook_paid_at(row, payload)
        payments.setdefault(row.user_id, []).append({
            'event_name': 'paid_success',
            'provider_event_name': row.event_name,
            'paid_at': paid_at.isoformat() if paid_at else None,
            'provider': 'lemonsqueezy',
            'plan': _webhook_plan(payload, row.outcome),
            'amount_usd': _decimal_to_str(amount['amount_usd']),
            'raw_amount': _decimal_to_str(amount['raw_amount']),
            'currency': amount['currency'],
            'payment_id': payment_id,
            'evidence_source': 'billing_webhook_event',
        })
    return payments


def _webhook_payment_id(row: Any, payload: Mapping[str, Any]) -> str:
    data = payload.get('data') if isinstance(payload.get('data'), Mapping) else {}
    attributes = data.get('attributes') if isinstance(data.get('attributes'), Mapping) else {}
    for value in (
        data.get('id'),
        attributes.get('order_id'),
        attributes.get('subscription_id'),
        attributes.get('invoice_id'),
        getattr(row, 'resource_id', None),
        getattr(row, 'event_hash', None),
    ):
        text = str(value or '').strip()
        if text:
            return f"{getattr(row, 'event_name', 'event')}:{text}"
    return ''


def _webhook_has_paid_status(row: Any, payload: Mapping[str, Any]) -> bool:
    data = payload.get('data') if isinstance(payload.get('data'), Mapping) else {}
    attributes = data.get('attributes') if isinstance(data.get('attributes'), Mapping) else {}
    event_name = str(getattr(row, 'event_name', '') or '')
    if event_name == 'subscription_payment_success':
        return True
    if event_name == 'order_created':
        return str(attributes.get('status') or '').lower() == 'paid'
    return False


def _webhook_paid_at(row: Any, payload: Mapping[str, Any]) -> datetime:
    data = payload.get('data') if isinstance(payload.get('data'), Mapping) else {}
    attributes = data.get('attributes') if isinstance(data.get('attributes'), Mapping) else {}
    for key in ('updated_at', 'created_at'):
        dt = _parse_optional_datetime(attributes.get(key))
        if dt is not None:
            return dt
    return getattr(row, 'processed_at', None) or getattr(row, 'created_at', None)


def _webhook_paid_amount(payload: Mapping[str, Any]) -> dict[str, Decimal | str | None] | None:
    data = payload.get('data') if isinstance(payload.get('data'), Mapping) else {}
    attributes = data.get('attributes') if isinstance(data.get('attributes'), Mapping) else {}
    for key in ('amount_usd', 'revenue_usd', 'total_usd', 'subtotal_usd'):
        if attributes.get(key) is not None:
            amount = _parse_decimal_or_none(attributes.get(key))
            if amount is not None and amount > Decimal('0'):
                return {'raw_amount': amount, 'currency': 'USD', 'amount_usd': amount}
            return None
    currency = str(attributes.get('currency') or attributes.get('currency_code') or '').upper()
    for key in ('total', 'subtotal'):
        value = attributes.get(key)
        if value is None:
            continue
        cents = _parse_decimal_or_none(value)
        if cents is not None and cents > Decimal('0'):
            amount = _quantize_money(cents / Decimal('100'))
            return {'raw_amount': amount, 'currency': currency or 'UNKNOWN', 'amount_usd': amount if currency == 'USD' else None}
    return None


def _webhook_plan(payload: Mapping[str, Any], outcome: str | None) -> str:
    meta = payload.get('meta') if isinstance(payload.get('meta'), Mapping) else {}
    custom = meta.get('custom_data') if isinstance(meta.get('custom_data'), Mapping) else {}
    for key in ('plan', 'billing_mode', 'kind', 'pack'):
        value = custom.get(key)
        if value:
            return str(value)
    return str(outcome or 'unknown')


def _webhook_custom_flag(payload: Mapping[str, Any], key: str) -> bool:
    meta = payload.get('meta') if isinstance(payload.get('meta'), Mapping) else {}
    custom = meta.get('custom_data') if isinstance(meta.get('custom_data'), Mapping) else {}
    return _truthy(custom.get(key))


def _load_practice_goal_shown_events(db: Session, event_model: Any, sessions: Iterable[Any], as_of: datetime) -> dict[int, datetime]:
    sessions_by_source_review = {session.source_review_id: session.id for session in sessions}
    if not sessions_by_source_review:
        return {}
    rows = (
        db.query(event_model)
        .filter(event_model.event_name == 'practice_goal_shown', event_model.created_at <= as_of)
        .all()
    )
    public_source_ids: dict[str, datetime] = {}
    for row in rows:
        source_id = str((row.metadata_json or {}).get('source_review_id') or '')
        if not source_id:
            continue
        public_source_ids[source_id] = min(public_source_ids.get(source_id, row.created_at), row.created_at)
    if not public_source_ids:
        return {}
    # ProductAnalyticsEvent stores public review IDs. Querying Review here keeps the event payload free of internal IDs.
    from app.db.models import Review

    source_ids = {key for key in public_source_ids if key}
    reviews = db.query(Review).filter(Review.public_id.in_(source_ids)).all() if source_ids else []
    shown: dict[int, datetime] = {}
    for review in reviews:
        session_id = sessions_by_source_review.get(review.id)
        created_at = public_source_ids.get(review.public_id)
        if session_id is None or created_at is None:
            continue
        shown[session_id] = min(shown.get(session_id, created_at), created_at)
    return shown


def _load_practice_feedbacks(db: Session, feedback_model: Any, attempts: Iterable[Any], as_of: datetime) -> dict[int, list[dict[str, Any]]]:
    attempt_ids = [attempt.id for attempt in attempts]
    if not attempt_ids:
        return {}
    rows = (
        db.query(feedback_model)
        .filter(feedback_model.attempt_id.in_(attempt_ids), feedback_model.created_at <= as_of)
        .all()
    )
    grouped: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row.attempt_id, []).append({
            'attempt_id': next((attempt.public_id for attempt in attempts if attempt.id == row.attempt_id), ''),
            'verdict': row.verdict,
            'created_at': row.created_at.isoformat() if row.created_at else None,
        })
    return grouped


def _load_review_call_costs(db: Session, task_ids: list[int], as_of: datetime, start_date: datetime, end_date: datetime) -> dict[int, list[dict[str, Any]]]:
    if not task_ids:
        return {}
    try:
        from app.db import models

        review_call_cost = getattr(models, 'ReviewCallCost')
    except (ImportError, AttributeError):
        return {task_id: [_unknown_cost_payload(task_id)] for task_id in task_ids}

    rows = (
        db.query(review_call_cost)
        .filter(
            review_call_cost.task_id.in_(task_ids),
            review_call_cost.created_at <= as_of,
            review_call_cost.created_at >= start_date,
            review_call_cost.created_at < end_date,
        )
        .all()
    )
    tasks_with_any_ledger = {
        row[0]
        for row in db.query(review_call_cost.task_id)
        .filter(review_call_cost.task_id.in_(task_ids), review_call_cost.created_at <= as_of)
        .distinct()
        .all()
    }
    grouped: dict[int, list[dict[str, Any]]] = {}
    seen: set[tuple[int, str]] = set()
    for row in rows:
        key = (row.task_id, row.call_key)
        if key in seen:
            continue
        seen.add(key)
        grouped.setdefault(row.task_id, []).append({
            'task_id': str(row.task_id),
            'cost_usd': _decimal_to_str(row.cost_usd),
            'stage': row.stage,
            'outcome': row.outcome,
            'call_key': row.call_key,
            'created_at': row.created_at.isoformat() if row.created_at else None,
            'source': 'review_call_cost',
        })
    for task_id in tasks_with_any_ledger:
        grouped.setdefault(task_id, [])
    return grouped


def _unknown_cost_payload(task_id: int) -> dict[str, Any]:
    return {
        'task_id': str(task_id),
        'cost_usd': None,
        'stage': 'review_call_cost',
        'outcome': 'unknown',
        'call_key': f'task-{task_id}',
        'source': 'review_call_cost_missing',
    }


def _cost_fallback_for_missing_rows(task: Any | None, task_id: int) -> list[dict[str, Any]]:
    if task is None:
        return [_unknown_cost_payload(task_id)]
    status = _enum_value(getattr(task, 'status', None))
    attempt_count = getattr(task, 'attempt_count', None) or 0
    error_code = str(getattr(task, 'error_code', '') or '').upper()
    pre_provider_errors = {
        'QUOTA_EXCEEDED',
        'SOURCE_REVIEW_NOT_FOUND',
        'SOURCE_REVIEW_DELETED',
        'PHOTO_NOT_FOUND',
        'PHOTO_NOT_READY',
        'REVIEW_NOT_FOUND',
        'PRACTICE_SOURCE_INVALID',
        'VALIDATION_ERROR',
    }
    if status in {'PENDING', 'RUNNING'} and attempt_count == 0:
        return []
    if attempt_count == 0 and (status in TERMINAL_FAILURE_STATUSES or error_code in pre_provider_errors):
        return []
    if error_code in pre_provider_errors:
        return []
    return [_unknown_cost_payload(task_id)]


def _load_generation_reference_costs(
    db: Session,
    sessions: list[Any],
    attempts: list[Any],
    as_of: datetime,
    start_date: datetime,
    end_date: datetime,
) -> dict[int, list[dict[str, Any]]]:
    if not sessions:
        return {}
    try:
        from app.db.models import GeneratedImage, ImageGenerationTask
    except ImportError:
        return {}

    source_review_to_session_ids: dict[int, list[int]] = {}
    for session in sessions:
        source_review_to_session_ids.setdefault(session.source_review_id, []).append(session.id)
    for attempt in attempts:
        if attempt.review_id is not None:
            source_review_to_session_ids.setdefault(attempt.review_id, []).append(attempt.session_id)
    generation_tasks = (
        db.query(ImageGenerationTask)
        .filter(
            ImageGenerationTask.source_review_id.in_(list(source_review_to_session_ids.keys())),
            ImageGenerationTask.created_at <= as_of,
        )
        .all()
    )
    generated_images = {
        image.task_id: image
        for image in db.query(GeneratedImage).filter(GeneratedImage.task_id.in_([task.id for task in generation_tasks])).all()
        if image.task_id is not None
    } if generation_tasks else {}
    by_session: dict[int, list[dict[str, Any]]] = {}
    seen_task_ids: set[int] = set()
    for task in generation_tasks:
        if task.id in seen_task_ids:
            continue
        seen_task_ids.add(task.id)
        image = generated_images.get(task.id)
        attempt_count = max(int(getattr(task, 'attempt_count', None) or 0), 0)
        status = _enum_value(task.status)
        if attempt_count == 0 and status in {'PENDING', 'RUNNING'}:
            continue
        known_cost_created_at = getattr(image, 'created_at', None) if image else None
        unknown_cost_created_at = getattr(task, 'finished_at', None) or getattr(task, 'created_at', None)
        known_in_window = (
            known_cost_created_at is not None
            and known_cost_created_at <= as_of
            and _within_window(_parse_datetime(known_cost_created_at), start_date, end_date)
        )
        unknown_in_window = (
            unknown_cost_created_at is not None
            and unknown_cost_created_at <= as_of
            and _within_window(_parse_datetime(unknown_cost_created_at), start_date, end_date)
        )
        payload = {
            'source': 'generation_reference',
            'stage': 'reference',
            'outcome': 'failed' if status in TERMINAL_FAILURE_STATUSES else 'succeeded',
            'task_id': str(task.id),
            'call_key': f'{task.public_id}:attempt-{max(attempt_count, 1)}',
            'cost_usd': _decimal_to_str(getattr(image, 'cost_usd', None)) if image else None,
            'created_at': known_cost_created_at.isoformat() if known_cost_created_at else (unknown_cost_created_at.isoformat() if unknown_cost_created_at else None),
            'attempt_count': 1,
        }
        retry_payloads = [
            {
                'source': 'generation_reference',
                'stage': 'reference',
                'outcome': 'unknown',
                'task_id': str(task.id),
                'call_key': f'{task.public_id}:attempt-{attempt_number}',
                'cost_usd': None,
                'created_at': unknown_cost_created_at.isoformat() if unknown_cost_created_at else None,
                'attempt_count': 1,
                'basis': 'inferred_missing_retry_usage',
            }
            for attempt_number in range(1, max(attempt_count, 1))
            if unknown_in_window
        ]
        payloads = [*retry_payloads]
        if known_in_window or (image is None and unknown_in_window):
            payloads.append(payload)
        if not payloads:
            continue
        for session_id in source_review_to_session_ids.get(task.source_review_id, []):
            by_session.setdefault(session_id, []).extend(payloads)
            break
    return by_session


def _parse_datetime(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_optional_datetime(value: Any) -> datetime | None:
    if value in (None, ''):
        return None
    return _parse_datetime(value)


def _parse_decimal_or_none(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _decimal_from_serialized(value: Any) -> Decimal | None:
    if value in (None, ''):
        return None
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _parse_int_or_none(value: Any) -> int | None:
    if value in (None, ''):
        return None
    return int(value)


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None
    return str(getattr(value, 'value', value))


def _rate(numerator: int, denominator: int) -> Decimal | None:
    if denominator <= 0:
        return None
    return (Decimal(numerator) / Decimal(denominator)).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)


def _decimal_to_str(value: Decimal | None) -> str | None:
    return None if value is None else format(value, 'f')


def _percent(value: Decimal | None) -> str:
    if value is None:
        return 'null'
    return f'{(value * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)}%'
