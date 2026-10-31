from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path

from sqlalchemy import create_engine, insert, text
from sqlalchemy.exc import DBAPIError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.monetization_baseline import load_monetization_baseline, utc
from app.db.models import Base, BillingWebhookEvent, Photo, ProductAnalyticsEvent, Review, User


@unittest.skipUnless(os.getenv('PICSPEAK_TEST_DATABASE_URL'), 'requires disposable PostgreSQL')
class MonetizationBaselinePostgresTests(unittest.TestCase):
    def test_minimal_query_projection_and_real_read_only_transaction(self):
        engine = create_engine(os.environ['PICSPEAK_TEST_DATABASE_URL'])
        # A dedicated schema leaves the application's integration fixtures intact.
        schema = 'monetization_baseline_' + uuid.uuid4().hex
        try:
            with engine.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA {schema}'))
                connection.execute(text(f'SET LOCAL search_path TO {schema}'))
                # Actual application metadata is the schema contract; hand-written
                # lookalike tables would let a misspelled query column pass.
                Base.metadata.create_all(connection)
                connection.execute(insert(User).values(
                    id=1, public_id='fixture-owner', email='fixture@example.invalid', username='fixture-owner',
                    plan='free', status='active', created_at=utc('2026-10-01T00:00:00Z'),
                ))
                connection.execute(insert(Photo).values(
                    id=1, public_id='fixture-photo', owner_user_id=1, upload_id='fixture-upload',
                    bucket='fixture', object_key='fixture.jpg', content_type='image/jpeg', size_bytes=1,
                ))
                connection.execute(insert(Review).values(
                    id=1, public_id='fixture-review', owner_user_id=1, photo_id=1, mode='flash',
                    status='SUCCEEDED', final_score=5, created_at=utc('2026-10-02T00:00:00Z'),
                ))
                connection.execute(insert(ProductAnalyticsEvent).values(
                    event_name='review_result_viewed', user_public_id='fixture-owner',
                    metadata_json={'review_id': 'fixture-review'}, created_at=utc('2026-10-02T00:01:00Z'),
                ))
                for row in (
                    {'event_name': 'subscription_payment_success', 'outcome': 'payment_recorded',
                     'resource_id': 'fixture-invoice', 'payload_json': {'meta': {'test_mode': False},
                         'data': {'attributes': {'created_at': '2026-10-03T00:00:00Z'}}},
                     'created_at': utc('2026-10-03T00:01:00Z')},
                    # A legacy default-false column must not imply verified live.
                    {'event_name': 'order_created', 'outcome': 'one_time_pro_granted',
                     'resource_id': 'legacy-order', 'payload_json': {},
                     'created_at': utc('2026-10-04T00:00:00Z')},
                    {'event_name': 'order_refunded', 'outcome': 'refund_recorded',
                     'resource_id': 'legacy-order', 'payload_json': {'meta': {'test_mode': False},
                         'data': {'attributes': {'created_at': '2026-10-04T00:00:00Z', 'refunded_at': '2026-11-02T00:00:00Z'}}},
                     'created_at': utc('2026-11-02T00:00:00Z')},
                ):
                    connection.execute(insert(BillingWebhookEvent).values(
                        **row, provider='lemonsqueezy', user_id=1, event_hash=uuid.uuid4().hex,
                        processed_at=row['created_at'],
                    ))
            with engine.connect().execution_options(isolation_level='REPEATABLE READ') as connection:
                transaction = connection.begin()
                connection.execute(text('SET TRANSACTION READ ONLY'))
                connection.execute(text(f'SET LOCAL search_path TO {schema}'))
                report = load_monetization_baseline(
                    connection, start=utc('2026-10-01T00:00:00Z'), end=utc('2026-11-01T00:00:00Z'),
                )
                self.assertEqual(report['successful_reviews']['registered']['reviews'], 1)
                self.assertEqual(report['owner_view_proxy']['reviews'], 1)
                payments = report['payments']['deduplicated_successful_transactions']
                self.assertEqual(payments['live']['subscription'], 1)
                self.assertEqual(payments['unknown']['legacy_pass'], 1)
                self.assertEqual(report['payments']['refund_resources_observed'], 0)
                with self.assertRaises(DBAPIError):
                    connection.execute(insert(User).values(
                        id=2, public_id='forbidden', email='forbidden@example.invalid', username='forbidden',
                        plan='free', status='active',
                    ))
                transaction.rollback()
            with engine.connect() as connection:
                count = connection.execute(text(f'SELECT count(*) FROM {schema}.users')).scalar_one()
                self.assertEqual(count, 1)
        finally:
            with engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA IF EXISTS {schema} CASCADE'))
            engine.dispose()


if __name__ == '__main__':
    unittest.main()
