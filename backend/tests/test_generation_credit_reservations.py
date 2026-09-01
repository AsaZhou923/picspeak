from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import GenerationCreditReservation, UsageLedger, UserPlan  # noqa: E402
from app.services.generation_credit_reservations import (  # noqa: E402
    CONSUMED,
    HELD,
    RELEASED,
    available_generation_credits,
    consume_generation_credit_reservation,
    monthly_generation_credit_period,
    release_generation_credit_reservation,
    require_held_generation_credit_reservation,
    reserve_generation_credits_for_task,
)


class GenerationCreditReservationTests(unittest.TestCase):
    def test_available_generation_credits_subtracts_consumed_and_active_holds(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.scalar.side_effect = [-30, 42, 11]
        user = SimpleNamespace(id=7, plan=UserPlan.pro)

        with patch(
            'app.services.generation_credit_reservations.monthly_generation_credit_limit_for_plan',
            return_value=199,
        ):
            available = available_generation_credits(db, user)

        self.assertEqual(available, 176)

    def test_reserve_generation_credits_locks_user_and_rejects_overcommit(self) -> None:
        existing_reservation_query = MagicMock()
        existing_reservation_query.filter.return_value.with_for_update.return_value.first.return_value = None
        user_lock_query = MagicMock()
        grant_query = MagicMock()
        consumed_query = MagicMock()
        held_query = MagicMock()
        grant_query.filter.return_value.scalar.return_value = 0
        consumed_query.filter.return_value.scalar.return_value = 9
        held_query.filter.return_value.scalar.return_value = 8
        db = MagicMock()
        db.query.side_effect = [user_lock_query, existing_reservation_query, grant_query, consumed_query, held_query]
        user = SimpleNamespace(id=7, plan=UserPlan.free)
        task = SimpleNamespace(id=10)

        with patch(
            'app.services.generation_credit_reservations.monthly_generation_credit_limit_for_plan',
            return_value=16,
        ):
            with self.assertRaises(ValueError):
                reserve_generation_credits_for_task(db, user=user, task=task, credits=1)

        user_lock_query.filter.return_value.with_for_update.assert_called_once()
        db.add.assert_not_called()

    def test_reserve_generation_credits_creates_period_scoped_hold(self) -> None:
        existing_reservation_query = MagicMock()
        existing_reservation_query.filter.return_value.with_for_update.return_value.first.return_value = None
        user_lock_query = MagicMock()
        grant_query = MagicMock()
        consumed_query = MagicMock()
        held_query = MagicMock()
        grant_query.filter.return_value.scalar.return_value = -30
        consumed_query.filter.return_value.scalar.return_value = 2
        held_query.filter.return_value.scalar.return_value = 3
        db = MagicMock()
        db.query.side_effect = [user_lock_query, existing_reservation_query, grant_query, consumed_query, held_query]
        user = SimpleNamespace(id=7, plan=UserPlan.free)
        task = SimpleNamespace(id=10)
        now = datetime(2026, 5, 31, 23, 0, tzinfo=timezone.utc)

        with patch(
            'app.services.generation_credit_reservations.monthly_generation_credit_limit_for_plan',
            return_value=3,
        ):
            reservation = reserve_generation_credits_for_task(db, user=user, task=task, credits=8, now=now)

        self.assertIsInstance(reservation, GenerationCreditReservation)
        self.assertEqual(reservation.generation_task_id, 10)
        self.assertEqual(reservation.bill_period_start, date(2026, 5, 1))
        self.assertEqual(reservation.bill_period_end, date(2026, 6, 1))
        self.assertEqual(reservation.status, HELD)
        db.add.assert_called_once_with(reservation)

    def test_consume_generation_credit_reservation_uses_reserved_bill_period_once(self) -> None:
        reservation = GenerationCreditReservation(
            id=3,
            generation_task_id=10,
            user_id=7,
            credits=8,
            bill_period_start=date(2026, 5, 1),
            bill_period_end=date(2026, 6, 1),
            status=HELD,
        )
        query = MagicMock()
        query.filter.return_value.with_for_update.return_value.first.return_value = reservation
        db = MagicMock()
        db.query.return_value = query
        task = SimpleNamespace(id=10, public_id='igt_10')

        consumed = consume_generation_credit_reservation(
            db,
            task=task,
            usage_metadata={'generation_id': 'gen_10', 'quality': 'medium'},
        )

        self.assertIs(consumed, reservation)
        self.assertEqual(reservation.status, CONSUMED)
        added = [call.args[0] for call in db.add.call_args_list]
        ledger = next(record for record in added if isinstance(record, UsageLedger))
        self.assertEqual(ledger.bill_date, date(2026, 5, 1))
        self.assertEqual(ledger.amount, Decimal(8))
        self.assertEqual(ledger.metadata_json['generation_task_id'], 'igt_10')

    def test_require_held_generation_credit_reservation_rejects_non_held_state(self) -> None:
        reservation = GenerationCreditReservation(
            id=3,
            generation_task_id=10,
            user_id=7,
            credits=8,
            bill_period_start=date(2026, 5, 1),
            bill_period_end=date(2026, 6, 1),
            status=CONSUMED,
        )
        query = MagicMock()
        query.filter.return_value.with_for_update.return_value.first.return_value = reservation
        db = MagicMock()
        db.query.return_value = query
        task = SimpleNamespace(id=10)

        with self.assertRaisesRegex(RuntimeError, 'consumed'):
            require_held_generation_credit_reservation(db, task=task, expected_credits=8)

    def test_release_generation_credit_reservation_is_idempotent(self) -> None:
        reservation = GenerationCreditReservation(
            id=3,
            generation_task_id=10,
            user_id=7,
            credits=8,
            bill_period_start=date(2026, 5, 1),
            bill_period_end=date(2026, 6, 1),
            status=HELD,
        )
        query = MagicMock()
        query.filter.return_value.with_for_update.return_value.first.return_value = reservation
        db = MagicMock()
        db.query.return_value = query
        task = SimpleNamespace(id=10)

        released = release_generation_credit_reservation(db, task=task, reason='TASK_DISPATCH_FAILED')
        released_again = release_generation_credit_reservation(db, task=task, reason='OTHER_REASON')

        self.assertIs(released, reservation)
        self.assertIs(released_again, reservation)
        self.assertEqual(reservation.status, RELEASED)
        self.assertEqual(reservation.release_reason, 'TASK_DISPATCH_FAILED')

    def test_monthly_generation_credit_period_keeps_month_end_reservations_in_request_month(self) -> None:
        period = monthly_generation_credit_period(now=datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc))

        self.assertEqual(period, (date(2026, 12, 1), date(2027, 1, 1)))


if __name__ == '__main__':
    unittest.main()
