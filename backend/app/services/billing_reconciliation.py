"""Read-only payment reconciliation from provider webhook snapshots.

This is an operational report, not a settlement statement. Missing monetary
fields remain unknown; it never infers provider fees or rewrites entitlements.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable

from app.services.billing_access import subscription_grants_pro_access


def _attributes(event: Any) -> dict:
    payload = event.payload_json if isinstance(event.payload_json, dict) else {}
    data = payload.get('data')
    attributes = data.get('attributes') if isinstance(data, dict) else None
    return attributes if isinstance(attributes, dict) else {}


def _timestamp(event: Any) -> datetime:
    value = _attributes(event).get('updated_at') or _attributes(event).get('created_at')
    if isinstance(value, str):
        try:
            result = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return result if result.tzinfo else result.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    result = event.created_at or datetime.min.replace(tzinfo=timezone.utc)
    return result if result.tzinfo else result.replace(tzinfo=timezone.utc)


def _cents(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def build_billing_reconciliation(
    events: Iterable[Any], subscriptions: Iterable[Any], *, test_mode: bool = False,
) -> dict[str, Any]:
    all_rows = list(events)
    rows = [event for event in all_rows if isinstance(event.test_mode, bool) and event.test_mode == test_mode]
    groups: dict[tuple[str, str], list] = defaultdict(list)
    unclassified_orders = 0
    for event in rows:
        if not event.resource_id or event.outcome == 'ignored_payment_mode_mismatch':
            continue
        if event.resource_type == 'subscription-invoices':
            groups[('invoice', str(event.resource_id))].append(event)
        elif event.resource_type == 'orders' and event.event_name in {'order_created', 'order_refunded'}:
            payload = event.payload_json if isinstance(event.payload_json, dict) else {}
            meta = payload.get('meta') if isinstance(payload.get('meta'), dict) else {}
            custom = meta.get('custom_data') if isinstance(meta.get('custom_data'), dict) else {}
            if custom.get('kind') == 'image_credit_pack' or custom.get('pack') == 'image_credits_300' or custom.get('billing_mode') == 'one_time_pro':
                groups[('order', str(event.resource_id))].append(event)
            else:
                # Recurring checkout order + initial invoice are one economic
                # payment. Count invoices, never add the initial order again.
                unclassified_orders += 1

    currency_totals: dict[str, dict[str, int]] = {}
    paid = refunded = partial = failed_only = duplicate_paid = 0
    missing_gross = missing_refund = 0
    refunded_subscription_ids: set[str] = set()
    status_rank = {'paid': 0, 'partial_refund': 1, 'refunded': 2}
    for group in groups.values():
        snapshots = sorted(group, key=lambda row: (_timestamp(row), status_rank.get(str(_attributes(row).get('status')), -1)))
        payment_rows = [row for row in group if row.event_name in {'subscription_payment_success', 'subscription_payment_recovered'} or (
            row.event_name == 'order_created' and _attributes(row).get('status') == 'paid'
        )]
        duplicate_paid += max(len(payment_rows) - 1, 0)
        refund_rows = [row for row in snapshots if row.event_name in {'subscription_payment_refunded', 'order_refunded'}]
        successful = bool(payment_rows or refund_rows)
        if not successful:
            failed_only += 1
            continue
        paid += 1
        current = max(refund_rows, key=lambda row: (status_rank.get(str(_attributes(row).get('status')), -1), _timestamp(row))) if refund_rows else snapshots[-1]
        attributes = _attributes(current)
        currency = str(attributes.get('currency') or '').strip().upper()
        gross = _cents(attributes.get('total'))
        if gross is None:
            gross = next((_cents(_attributes(row).get('total')) for row in reversed(snapshots) if (
                _cents(_attributes(row).get('total')) is not None
                and str(_attributes(row).get('currency') or '').strip().upper() == currency
            )), None)
        bucket = currency_totals.setdefault(currency or 'UNKNOWN', {
            'known_gross_cents': 0, 'known_refunded_cents': 0, 'known_tax_cents': 0,
            'gross_unknown_transactions': 0, 'refund_unknown_transactions': 0, 'tax_unknown_transactions': 0,
        })
        if gross is None or not currency:
            missing_gross += 1
            bucket['gross_unknown_transactions'] += 1
        else:
            bucket['known_gross_cents'] += gross
        tax = _cents(attributes.get('tax'))
        if tax is None or not currency:
            bucket['tax_unknown_transactions'] += 1
        else:
            bucket['known_tax_cents'] += tax
        if refund_rows:
            is_full = str(attributes.get('status') or '') == 'refunded'
            refunded += int(is_full)
            partial += int(not is_full)
            amount = _cents(attributes.get('refunded_amount'))
            if amount is None or not currency:
                missing_refund += 1
                bucket['refund_unknown_transactions'] += 1
            else:
                bucket['known_refunded_cents'] += amount
            if current.resource_type == 'subscription-invoices' and attributes.get('subscription_id'):
                refunded_subscription_ids.add(str(attributes['subscription_id']))

    active_refunded = sum(
        str(subscription.provider_subscription_id or '') in refunded_subscription_ids
        and isinstance(subscription.test_mode, bool) and subscription.test_mode == test_mode
        and subscription_grants_pro_access(subscription)
        for subscription in subscriptions
    )
    return {
        'schema_version': 'billing-reconciliation-v1',
        'test_mode': test_mode,
        'received_callbacks': len(rows),
        'unknown_mode_callbacks': sum(not isinstance(event.test_mode, bool) for event in all_rows),
        'outcomes': dict(Counter(str(event.outcome or 'unprocessed') for event in rows)),
        'unique_payment_transactions': paid,
        'duplicate_payment_callbacks': duplicate_paid,
        'fully_refunded_transactions': refunded,
        'partially_refunded_transactions': partial,
        'failed_or_pending_only_transactions': failed_only,
        'excluded_recurring_or_unclassified_order_callbacks': unclassified_orders,
        'gross_unknown_transactions': missing_gross,
        'refund_amount_unknown_transactions': missing_refund,
        'currency_totals': currency_totals,
        'refunded_but_still_active_subscriptions': active_refunded,
        'provider_net_settlement': None,
        'limitations': [
            'Webhook snapshots are not an independent provider settlement statement; fees and net settlement are unknown.',
            'Gross and tax are original-currency integer minor units; currencies are never combined or converted.',
            'Recurring checkout orders are excluded to avoid counting the initial invoice twice; unclassified legacy orders need manual review.',
            'An invoice refund does not cancel a subscription. Active refunded subscriptions and partial refunds require operator review.',
        ],
    }


def load_billing_reconciliation(db, *, start: datetime, end: datetime, test_mode: bool = False) -> dict[str, Any]:
    """Caller owns the read-only transaction; end is exclusive."""
    from app.db.models import BillingSubscription, BillingWebhookEvent

    events = db.query(BillingWebhookEvent).filter(
        BillingWebhookEvent.provider == 'lemonsqueezy',
        BillingWebhookEvent.created_at >= start,
        BillingWebhookEvent.created_at < end,
    ).all()
    subscriptions = db.query(BillingSubscription).filter(BillingSubscription.provider == 'lemonsqueezy').all()
    result = build_billing_reconciliation(events, subscriptions, test_mode=test_mode)
    result['received_window_utc'] = {'start_inclusive': start.isoformat(), 'end_exclusive': end.isoformat()}
    result['denominator'] = 'Distinct provider invoice/order IDs observed in the received callback window, separated by test mode.'
    return result
