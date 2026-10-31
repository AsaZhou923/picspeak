"""Small, read-only acquisition baseline. No event emission or entitlement changes."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any


DATASETS = ('users', 'reviews', 'views', 'payments', 'activations')
PAYMENT_KINDS = {
    'credit_pack_granted': 'image_credit_pack',
    'credit_pack_already_granted': 'image_credit_pack',
    'one_time_pro_granted': 'legacy_pass',
    'one_time_pro_already_granted': 'legacy_pass',
    'payment_recorded': 'subscription',
    'payment_already_recorded': 'subscription',
}
CONFIG_FIELDS = (
    'guest_review_limit_per_day', 'guest_review_limit_per_month',
    'free_review_limit_per_day', 'free_review_limit_per_month',
    'free_pro_review_limit_per_month', 'image_generation_free_monthly_credits',
    'image_generation_pro_monthly_credits', 'lemonsqueezy_checkout_test_mode',
    'lemonsqueezy_webhook_test_mode',
)


def utc(value: str | datetime) -> datetime:
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value
    if parsed.tzinfo is None:
        raise ValueError('Timestamps must include a timezone')
    return parsed.astimezone(timezone.utc)


def summarize_local_configuration(settings: Any) -> dict[str, Any]:
    """Whitelisted values only; never serialize Settings or checkout URLs."""
    fields = type(settings).model_fields
    return {
        'source': 'local Settings: environment and dotenv; NOT verified production configuration',
        'values': {name: {'default': fields[name].default, 'loaded': getattr(settings, name)} for name in CONFIG_FIELDS},
        'provider_mapping_configured': {
            name: bool(getattr(settings, name)) for name in (
                'lemonsqueezy_pro_variant_id', 'lemonsqueezy_zh_pro_variant_id',
                'lemonsqueezy_image_credit_pack_variant_id',
            )
        },
        'provider_product_price_tax_cycle': None,
    }


def build_monetization_baseline(
    data: dict[str, Any], *, start: datetime, end: datetime,
    configuration: dict[str, Any] | None = None,
    as_of: datetime | None = None,
) -> dict[str, Any]:
    start, end = utc(start), utc(end)
    if start >= end:
        raise ValueError('start must precede end')
    # Missing datasets are unavailable, never an empty / zero baseline.
    missing = [name for name in DATASETS if not isinstance(data.get(name), list)]
    if missing:
        raise ValueError('Missing datasets: ' + ', '.join(missing))
    in_window = lambda value: start <= utc(value) < end
    users = {str(row['id']): row for row in data['users']}
    public_users = {str(row['public_id']): row for row in users.values()}
    group = lambda row: 'guest' if row.get('plan') == 'guest' else 'registered'
    new_users = Counter(group(row) for row in users.values() if in_window(row['created_at']))
    successful = {
        str(row['public_id']): row for row in data['reviews']
        if row['status'] == 'SUCCEEDED' and in_window(row['created_at'])
    }
    success_groups: dict[str, Counter] = {key: Counter() for key in ('guest', 'registered', 'unknown_owner')}
    owner_sets = {key: set() for key in success_groups}
    for row in successful.values():
        owner = users.get(str(row['owner_user_id']))
        key = group(owner) if owner else 'unknown_owner'
        success_groups[key]['reviews'] += 1
        owner_sets[key].add(str(row['owner_user_id']))
    viewed: set[str] = set()
    rejected_views = 0
    for row in data['views']:
        if not in_window(row['created_at']):
            continue
        review = successful.get(str(row.get('review_id') or ''))
        actor = public_users.get(str(row.get('user_public_id') or ''))
        if (review is None or actor is None
                or str(actor['id']) != str(review['owner_user_id'])
                or utc(row['created_at']) < utc(review['created_at'])):
            rejected_views += 1
            continue
        viewed.add(str(review['public_id']))

    # All history must be supplied: dedupe before windowing to avoid classifying
    # a repeated callback or a renewal as a first payment.
    transactions: dict[tuple[str, str, str], dict[str, Any]] = {}
    unknown_payments = 0
    refunded: set[tuple[str, str, str]] = set()
    for row in data['payments']:
        kind = PAYMENT_KINDS.get(row.get('outcome'))
        test_mode = row.get('test_mode')
        environment = 'test' if test_mode is True else 'live' if test_mode is False else 'unknown'
        key_id = row.get('resource_id')
        event = row.get('event_name')
        if event in {'order_refunded', 'subscription_payment_refunded'} and key_id:
            if in_window(row['occurred_at']):
                resource = 'invoice' if event == 'subscription_payment_refunded' else 'order'
                refunded.add((environment, resource, str(key_id)))
        if not kind:
            continue
        if not key_id or not row.get('user_id'):
            if in_window(row['occurred_at']):
                unknown_payments += 1
            continue
        resource = 'invoice' if kind == 'subscription' else 'order'
        key = (environment, resource, str(key_id))
        candidate = {**row, 'kind': kind, 'environment': environment}
        previous = transactions.get(key)
        if previous is None or utc(row['occurred_at']) < utc(previous['occurred_at']):
            transactions[key] = candidate
    counts: dict[str, Counter] = {key: Counter() for key in ('live', 'test', 'unknown')}
    first_by_user: dict[tuple[str, str], datetime] = {}
    for row in transactions.values():
        user_key = (row['environment'], str(row['user_id']))
        at = utc(row['occurred_at'])
        first_by_user[user_key] = min(first_by_user.get(user_key, at), at)
        if in_window(at):
            counts[row['environment']][row['kind']] += 1
    first_counts = Counter(environment for (environment, _), at in first_by_user.items() if in_window(at))
    activation_count = len({str(row['id']) for row in data['activations'] if in_window(row['redeemed_at'])})
    entitlements = None
    if isinstance(data.get('subscriptions'), list):
        from app.services.billing_access import subscription_grants_pro_access

        current = utc(as_of or datetime.now(timezone.utc))
        active_kinds: Counter = Counter()
        active_users: set[str] = set()
        test_or_unknown = Counter()
        for row in data['subscriptions']:
            environment = 'test' if row.get('test_mode') is True else 'live' if row.get('test_mode') is False else 'unknown'
            if environment != 'live':
                test_or_unknown[environment] += 1
                continue
            subscription = SimpleNamespace(
                provider=row['provider'], status=row['status'], test_mode=False,
                ends_at=utc(row['ends_at']) if row.get('ends_at') else None,
            )
            if not subscription_grants_pro_access(subscription, now=current):
                continue
            kind = ('activation_code' if row['provider'] == 'activation_code' else
                    'legacy_pass' if row.get('billing_mode') == 'one_time_pro' else
                    'subscription' if row['provider'] == 'lemonsqueezy' else 'unknown_provider')
            active_kinds[kind] += 1
            active_users.add(str(row['user_id']))
        entitlements = {
            'current_rows_evaluated_at': current.isoformat(),
            'active_live_grants_by_kind': dict(sorted(active_kinds.items())),
            'distinct_active_live_users': len(active_users),
            'excluded_test_or_unknown_rows': {'test': test_or_unknown['test'], 'unknown': test_or_unknown['unknown']},
            'historical_reconstruction': False,
        }
    return {
        'version': 'monetization-minimal-v1',
        'source': data.get('source', 'offline fixture; NOT production evidence'),
        'window': {'start_inclusive': start.isoformat(), 'end_exclusive': end.isoformat(), 'timezone': 'UTC'},
        'current_user_records_by_plan': dict(sorted(Counter(row.get('plan', 'unknown') for row in users.values()).items())),
        'user_records_created': {key: new_users[key] for key in ('guest', 'registered')},
        'successful_reviews': {
            key: {'reviews': success_groups[key]['reviews'], 'distinct_owners': len(owner_sets[key])}
            for key in success_groups
        },
        'owner_view_proxy': {
            'reviews': len(viewed), 'denominator_successful_reviews_created_in_window': len(successful),
            'rate': len(viewed) / len(successful) if successful else None,
            'unmatched_or_non_owner_event_rows': rejected_views,
        },
        'payments': {
            'deduplicated_successful_transactions': {
                environment: {kind: counter[kind] for kind in ('subscription', 'legacy_pass', 'image_credit_pack')}
                for environment, counter in counts.items()
            },
            'first_observed_paying_users': {key: first_counts[key] for key in ('live', 'test', 'unknown')},
            'unknown_identity_or_transaction_rows': unknown_payments,
            'refund_resources_observed': len(refunded),
            'refund_resources_observed_by_environment': {
                key: sum(1 for environment, _, _ in refunded if environment == key)
                for key in ('live', 'test', 'unknown')
            },
            'activation_code_redemptions_not_assumed_paid': activation_count,
            'settled_revenue_net_fees_tax_currency': None,
        },
        'configuration': configuration,
        'current_entitlements': entitlements,
        'limitations': [
            'users.created_at counts account rows, not verified signups; guest migrations and deletions prevent exact signup reconstruction.',
            'Guest/registered groups use current owner plan, not historical plan at review time; internal/synthetic account eligibility is unknown.',
            'SUCCEEDED review rows are saved successful results, not AI calls or quota consumption; deleted review rows remain included when present.',
            'Owner views are authenticated-identity-matched client observations, not independently verified human reading. Both review creation and view are inside this window; this is not a cohort conversion rate.',
            'First payment means first observed successful callback across supplied retained history; missing old callbacks prevent a guaranteed lifetime first-payment claim.',
            'Payments are processed callbacks, not provider settlement; refunds are reported separately and do not erase historical payments. Activation codes do not prove payment.',
            'Payment dates use provider updated_at then created_at; refunds prefer refunded_at then updated_at. Receipt time is a fallback. Current entitlement rows are evaluated at the explicit as-of time, not reconstructed historical states.',
            'Locale/channel acquisition attribution, provider catalog price/tax/cycle, invoice reconciliation coverage, cost coverage, MRR/CAC/LTV and mature retention remain unknown.',
        ],
    }


def load_monetization_baseline(connection: Any, *, start: datetime, end: datetime, as_of: datetime | None = None) -> dict[str, Any]:
    """The caller owns a PostgreSQL REPEATABLE READ, READ ONLY transaction."""
    from sqlalchemy import text

    if connection.dialect.name != 'postgresql':
        raise ValueError('Database exports require PostgreSQL read-only transactions')
    if connection.execute(text('SHOW transaction_read_only')).scalar_one() != 'on':
        raise ValueError('A read-only transaction is required')
    queries = {
        'users': 'SELECT id, public_id, plan::text AS plan, created_at FROM users',
        'reviews': "SELECT public_id, owner_user_id, status::text AS status, created_at FROM reviews WHERE created_at >= :start AND created_at < :end",
        'views': "SELECT user_public_id, metadata_json->>'review_id' AS review_id, created_at FROM product_analytics_events WHERE event_name = 'review_result_viewed' AND created_at >= :start AND created_at < :end",
        'payments': """SELECT event_name, outcome, resource_id, user_id,
            CASE WHEN jsonb_typeof(payload_json->'meta'->'test_mode') = 'boolean'
                THEN (payload_json->'meta'->>'test_mode')::boolean ELSE NULL END AS test_mode,
            CASE WHEN event_name IN ('order_refunded', 'subscription_payment_refunded') THEN
                COALESCE(payload_json->'data'->'attributes'->>'refunded_at',
                    payload_json->'data'->'attributes'->>'updated_at', created_at::text)
            ELSE COALESCE(payload_json->'data'->'attributes'->>'updated_at',
                payload_json->'data'->'attributes'->>'created_at', created_at::text) END AS occurred_at
            FROM billing_webhook_events WHERE provider = 'lemonsqueezy' AND processed_at IS NOT NULL""",
        'activations': 'SELECT id, redeemed_at FROM billing_activation_codes WHERE redeemed_at >= :start AND redeemed_at < :end',
        'subscriptions': """SELECT user_id, provider, status, test_mode, ends_at,
            raw_payload->'billing_access'->>'billing_mode' AS billing_mode FROM billing_subscriptions""",
    }
    data = {name: [dict(row) for row in connection.execute(text(query), {'start': start, 'end': end}).mappings()]
            for name, query in queries.items()}
    data['source'] = 'PostgreSQL retained business records; repeatable-read/read-only transaction'
    return build_monetization_baseline(data, start=start, end=end, as_of=as_of)
