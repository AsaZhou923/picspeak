from __future__ import annotations

from decimal import Decimal
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.ai import AIProviderCallUsage, AIReviewResponse, notify_ai_provider_call, observe_ai_provider_calls
from app.services.review_call_costs import (
    record_observed_provider_call_costs,
    record_response_call_cost,
    record_review_call_cost,
)


class _Query:
    def __init__(self, existing=None):
        self._existing = existing

    def filter(self, *args):
        return self

    def first(self):
        return self._existing


def _db(existing=None):
    db = MagicMock()
    db.query.return_value = _Query(existing)
    return db


def test_record_review_call_cost_keeps_failed_usage_null():
    task = SimpleNamespace(id=11, owner_user_id=22, attempt_count=3)
    db = _db()

    record = record_review_call_cost(db, task=task, stage='writer', outcome='failed')

    assert record.task_id == 11
    assert record.owner_user_id == 22
    assert record.call_key == 'attempt:3:writer'
    assert record.stage == 'writer'
    assert record.outcome == 'failed'
    assert record.input_tokens is None
    assert record.output_tokens is None
    assert record.cost_usd is None
    db.add.assert_called_once_with(record)


def test_invalid_token_usage_does_not_turn_unknown_cost_into_zero():
    calls = []
    with observe_ai_provider_calls(calls.append):
        for invalid in (False, True, -1, '0', 1.5):
            notify_ai_provider_call(stage='writer', outcome='failed', model_name='gpt-5.6-luna',
                                    usage={'input_tokens': invalid, 'output_tokens': 0})
    assert len(calls) == 5
    assert all(call.input_tokens is None and call.cost_usd is None for call in calls)


def test_record_review_call_cost_reuses_existing_task_call_key():
    existing = object()
    task = SimpleNamespace(id=11, owner_user_id=22, attempt_count=3)
    db = _db(existing)

    record = record_review_call_cost(db, task=task, stage='writer', outcome='failed')

    assert record is existing
    db.add.assert_not_called()


def test_writer_response_cost_uses_provider_call_usage_not_aggregate_usage():
    task = SimpleNamespace(id=11, owner_user_id=22, attempt_count=1)
    db = _db()
    response = AIReviewResponse(
        result=SimpleNamespace(),
        model_name='aggregate-provider',
        model_version='aggregate-version',
        prompt_version='prompt',
        writer_model_name='qwen3.5-plus',
        input_tokens=999,
        output_tokens=888,
        cost_usd=9.99,
        writer_input_tokens=10,
        writer_output_tokens=4,
        writer_cost_usd=0.1234567,
        writer_cost_rate_version='writer-rate-v1',
    )

    record = record_response_call_cost(db, task=task, response=response, stage='writer')

    assert record.stage == 'writer'
    assert record.model_name == 'qwen3.5-plus'
    assert record.input_tokens == 10
    assert record.output_tokens == 4
    assert record.cost_usd == Decimal('0.123457')
    assert record.cost_rate_version == 'writer-rate-v1'


def test_observed_failure_marks_last_unknown_failed_and_preserves_initial_success():
    task = SimpleNamespace(id=11, owner_user_id=22, attempt_count=1)
    db = _db()
    calls = [
        AIProviderCallUsage(
            stage='scorer',
            sequence='initial',
            outcome='unknown',
            model_name='gpt-5.6-luna',
            input_tokens=100,
            output_tokens=20,
            cost_usd=0.01,
            cost_rate_version='rate-initial',
        ),
        AIProviderCallUsage(
            stage='scorer',
            sequence='audit',
            outcome='unknown',
            model_name='gpt-5.6-luna',
            input_tokens=110,
            output_tokens=30,
            cost_usd=0.02,
            cost_rate_version='rate-audit',
        ),
    ]

    records = record_observed_provider_call_costs(db, task=task, calls=calls, failed=True)

    assert [record.call_key for record in records] == ['attempt:1:scorer:initial', 'attempt:1:scorer:audit']
    assert [record.outcome for record in records] == ['succeeded', 'failed']
    assert [record.input_tokens for record in records] == [100, 110]
    assert [record.cost_usd for record in records] == [Decimal('0.010000'), Decimal('0.020000')]


def test_observed_network_failure_keeps_usage_and_cost_null():
    task = SimpleNamespace(id=11, owner_user_id=22, attempt_count=1)
    db = _db()
    calls = [
        AIProviderCallUsage(stage='writer', outcome='failed', model_name='qwen3.5-plus'),
    ]

    records = record_observed_provider_call_costs(db, task=task, calls=calls, failed=True)

    assert len(records) == 1
    assert records[0].call_key == 'attempt:1:writer'
    assert records[0].outcome == 'failed'
    assert records[0].input_tokens is None
    assert records[0].output_tokens is None
    assert records[0].cost_usd is None
