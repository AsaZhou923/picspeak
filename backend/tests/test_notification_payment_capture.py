"""Queue-level coverage only; this does not certify provider payment delivery."""
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest

import test_notifications as fixtures

from app.db.models import NotificationEvent
from app.services.notification_events import record_credit_confirmed, record_subscription_changed
from app.services.lemonsqueezy_webhooks import _subscription_state_fingerprint
from app.services.notification_access import render_notification


class NotificationPaymentCaptureTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.NotificationSQLiteTests()
        self.fixture.setUp()
        self.db = self.fixture.db

    def tearDown(self):
        self.fixture.tearDown()

    def test_credit_grants_have_recipient_and_business_grant_dedupe(self):
        first = self.fixture.user('credit_first')
        second = self.fixture.user('credit_second')
        self.assertTrue(record_credit_confirmed(self.db, first, grant_id='ledger_10', credits=30))
        self.assertTrue(record_credit_confirmed(self.db, second, grant_id='ledger_11', credits=30))
        self.assertFalse(record_credit_confirmed(self.db, first, grant_id='ledger_10', credits=30))
        self.assertTrue(record_credit_confirmed(self.db, first, grant_id='ledger_12', credits=300))
        rows = self.db.query(NotificationEvent).order_by(NotificationEvent.id).all()
        self.assertEqual(len(rows), 3)
        self.assertEqual([row.recipient_user_id for row in rows], [first.id, second.id, first.id])
        self.assertEqual(rows[0].payload_json, {'grant_id': 'ledger_10', 'credits': '30'})

    def test_subscription_real_state_versions_dedupe_repeated_callbacks(self):
        owner = self.fixture.user('subscription')
        self.assertTrue(record_subscription_changed(self.db, owner, subscription_id='sub_1', status='active', version='active_1'))
        self.assertFalse(record_subscription_changed(self.db, owner, subscription_id='sub_1', status='active', version='active_1'))
        self.assertTrue(record_subscription_changed(self.db, owner, subscription_id='sub_1', status='cancelled', version='cancelled_2'))
        self.assertEqual(self.db.query(NotificationEvent).count(), 2)

    def test_subscription_processing_metadata_does_not_change_state_fingerprint(self):
        state = SimpleNamespace(status='active', cancelled=False, renews_at=None, ends_at=None,
                                last_event_name='subscription_created', last_invoice_id='invoice_1',
                                last_payment_status='success', updated_at=datetime.now(timezone.utc))
        initial = _subscription_state_fingerprint(state)
        state.last_event_name = 'subscription_updated'
        state.last_invoice_id = 'invoice_2'
        state.updated_at = datetime(2030, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(_subscription_state_fingerprint(state), initial)
        state.cancelled = True
        self.assertNotEqual(_subscription_state_fingerprint(state), initial)

    def test_zero_credit_grant_does_not_produce_confirmed_notice(self):
        owner = self.fixture.user('zero_grant')
        self.assertFalse(record_credit_confirmed(self.db, owner, grant_id='ledger_20', credits=0))
        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

    def test_credit_copy_shows_validated_confirmed_increment(self):
        owner = self.fixture.user('credit_copy')
        row = self.fixture.notification(owner, 'credit_copy', notification_type='credits.confirmed',
                                        template_key='credits_confirmed', params={'credits': '30'})
        payload = render_notification(self.db, row, locale='en', detail=True)
        self.assertIn('(+30)', payload['summary'])
