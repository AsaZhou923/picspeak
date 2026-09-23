from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable, Mapping


def reconcile_practice_costs(payload: Mapping[str, Any]) -> dict[str, Any]:
    estimates = [_normalize_estimate(item) for item in payload.get('estimated_costs') or payload.get('estimates') or []]
    bills = [_normalize_bill(item) for item in payload.get('billing_rows') or payload.get('bills') or []]
    unique_bills, duplicate_conflicts = _dedupe_bills(bills)
    bills_by_key: dict[str, list[dict[str, Any]]] = {}
    refunds: list[dict[str, Any]] = []
    unmatched_bills: list[dict[str, Any]] = []
    for bill in unique_bills:
        if bill['kind'] in {'refund', 'credit'} or bill['amount'] < Decimal('0'):
            refunds.append(bill)
            continue
        key = bill.get('match_key')
        if key:
            bills_by_key.setdefault(key, []).append(bill)
        else:
            unmatched_bills.append(bill)

    rows: list[dict[str, Any]] = []
    matched_keys: set[str] = set()
    ambiguous_bills: list[dict[str, Any]] = []
    for estimate in estimates:
        key = estimate['match_key']
        matches = bills_by_key.get(key) or []
        if not key or not matches:
            rows.append(_row('missing_bill', estimate, None))
            continue
        if len(matches) > 1:
            matched_keys.add(key)
            ambiguous_bills.extend(matches)
            rows.append(_ambiguous_row(estimate, matches))
            continue
        bill = matches[0]
        matched_keys.add(key)
        status = _match_status(estimate, bill)
        rows.append(_row(status, estimate, bill))
    for key, bills_for_key in bills_by_key.items():
        if key not in matched_keys:
            unmatched_bills.extend(bills_for_key)

    status_counts: dict[str, int] = {}
    for row in rows:
        status_counts[row['status']] = status_counts.get(row['status'], 0) + 1
    status_counts['unmatched_bill'] = len(unmatched_bills)
    status_counts['refund_or_credit'] = len(refunds)
    status_counts['duplicate_conflict'] = len(duplicate_conflicts)
    status_counts['ambiguous'] = len(ambiguous_bills)
    known_estimated_total = sum((item['amount'] for item in estimates), Decimal('0.000000'))
    matched_bill_total = sum(
        (row['billing_amount'] for row in rows if row['billing_amount'] is not None and row['status'] != 'ambiguous'),
        Decimal('0.000000'),
    )
    refund_total = sum((item['amount'] for item in refunds), Decimal('0.000000'))
    disputed_total = sum((item['amount'] for item in duplicate_conflicts + ambiguous_bills), Decimal('0.000000'))
    difference_statuses = {'missing_bill', 'amount_mismatch', 'metadata_mismatch', 'ambiguous'}
    has_differences = any(status_counts.get(key, 0) for key in difference_statuses)
    has_differences = has_differences or bool(unmatched_bills or refunds or duplicate_conflicts)

    return {
        'schema_version': 'practice-cost-reconciliation-v1',
        'reconciliation_status': 'not_reconciled' if not unique_bills and not duplicate_conflicts else (
            'reconciled_with_differences' if has_differences
            else 'reconciled'
        ),
        'match_scope': 'offline_explicit_input_only',
        'status_counts': status_counts,
        'estimated_total': _money(known_estimated_total),
        'matched_bill_total': _money(matched_bill_total),
        'refund_or_credit_total': _money(refund_total),
        'disputed_bill_total': _money(disputed_total),
        'rows': [
            {**row, 'estimated_amount': _money(row['estimated_amount']), 'billing_amount': _money(row['billing_amount'])}
            for row in rows
        ],
        'unmatched_billing_rows': [_serialize_bill(item) for item in unmatched_bills],
        'refund_or_credit_rows': [_serialize_bill(item) for item in refunds],
        'duplicate_conflict_rows': [_serialize_bill(item) for item in duplicate_conflicts],
        'ambiguous_billing_rows': [_serialize_bill(item) for item in ambiguous_bills],
        'limitations': [
            'No production connection is made.',
            'No entitlement, estimate ledger, or historical row is modified.',
            'Rows without request/order IDs are reported as unmatched unless the caller supplies an explicit match_key.',
        ],
    }


def _normalize_estimate(item: Mapping[str, Any]) -> dict[str, Any]:
    key = _match_key(item)
    return {
        'request_id': str(item.get('request_id') or item.get('task_id') or item.get('call_key') or key),
        'match_key': key,
        'provider': str(item.get('provider') or item.get('source') or 'unknown'),
        'model': str(item.get('model') or item.get('model_name') or 'unknown'),
        'rate_version': str(item.get('rate_version') or item.get('cost_rate_version') or 'unknown'),
        'currency': str(item.get('currency') or 'USD').upper(),
        'amount': _decimal(item.get('amount') if item.get('amount') is not None else item.get('cost_usd')),
        'period_start': _date_text(item.get('period_start')),
        'period_end': _date_text(item.get('period_end')),
    }


def _normalize_bill(item: Mapping[str, Any]) -> dict[str, Any]:
    return {
        'billing_row_id': str(item.get('billing_row_id') or item.get('id') or item.get('invoice_line_id') or _match_key(item)),
        'match_key': _billing_match_key(item),
        'provider': str(item.get('provider') or 'unknown'),
        'model': str(item.get('model') or item.get('model_name') or 'unknown'),
        'rate_version': str(item.get('rate_version') or item.get('cost_rate_version') or 'unknown'),
        'currency': str(item.get('currency') or 'USD').upper(),
        'amount': _decimal(item.get('amount') if item.get('amount') is not None else item.get('cost_usd')),
        'kind': str(item.get('kind') or item.get('type') or 'charge').lower(),
        'period_start': _date_text(item.get('period_start')),
        'period_end': _date_text(item.get('period_end')),
        'order_id': str(item.get('order_id') or ''),
        'refund_of_order_id': str(item.get('refund_of_order_id') or item.get('refunded_order_id') or ''),
    }


def _dedupe_bills(bills: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_id: dict[str, list[dict[str, Any]]] = {}
    for bill in bills:
        by_id.setdefault(bill['billing_row_id'], []).append(bill)
    unique: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for rows in by_id.values():
        signatures = {_bill_signature(row) for row in rows}
        if len(signatures) == 1:
            unique.append(rows[0])
        else:
            conflicts.extend(rows)
    return unique, conflicts


def _bill_signature(bill: dict[str, Any]) -> tuple[Any, ...]:
    return (
        bill['billing_row_id'],
        bill['match_key'],
        bill['provider'],
        bill['model'],
        bill['rate_version'],
        bill['currency'],
        bill['amount'],
        bill['kind'],
        bill['period_start'],
        bill['period_end'],
        bill['order_id'],
        bill['refund_of_order_id'],
    )


def _row(status: str, estimate: dict[str, Any], bill: dict[str, Any] | None) -> dict[str, Any]:
    billing_amount = bill['amount'] if bill else None
    difference = None if billing_amount is None else billing_amount - estimate['amount']
    return {
        'status': status,
        'match_key': estimate['match_key'],
        'request_id': estimate['request_id'],
        'provider': estimate['provider'],
        'model': estimate['model'],
        'rate_version': estimate['rate_version'],
        'currency': estimate['currency'],
        'estimated_period_start': estimate['period_start'],
        'estimated_period_end': estimate['period_end'],
        'estimated_amount': estimate['amount'],
        'billing_amount': billing_amount,
        'difference': _money(difference),
        'billing_row_id': bill['billing_row_id'] if bill else None,
        'billing_provider': bill['provider'] if bill else None,
        'billing_model': bill['model'] if bill else None,
        'billing_rate_version': bill['rate_version'] if bill else None,
        'billing_currency': bill['currency'] if bill else None,
        'billing_period_start': bill['period_start'] if bill else None,
        'billing_period_end': bill['period_end'] if bill else None,
        'billing_order_id': bill['order_id'] if bill else None,
    }


def _ambiguous_row(estimate: dict[str, Any], bills: list[dict[str, Any]]) -> dict[str, Any]:
    billing_amount = sum((bill['amount'] for bill in bills), Decimal('0.000000'))
    row = _row('ambiguous', estimate, None)
    row.update({
        'billing_amount': billing_amount,
        'difference': _money(billing_amount - estimate['amount']),
        'billing_row_id': ','.join(bill['billing_row_id'] for bill in bills),
        'billing_provider': ','.join(sorted({bill['provider'] for bill in bills})),
        'billing_model': ','.join(sorted({bill['model'] for bill in bills})),
        'billing_rate_version': ','.join(sorted({bill['rate_version'] for bill in bills})),
        'billing_currency': ','.join(sorted({bill['currency'] for bill in bills})),
        'billing_period_start': ','.join(sorted({bill['period_start'] or '' for bill in bills})),
        'billing_period_end': ','.join(sorted({bill['period_end'] or '' for bill in bills})),
        'billing_order_id': ','.join(sorted({bill['order_id'] for bill in bills if bill['order_id']})),
    })
    return row


def _match_status(estimate: dict[str, Any], bill: dict[str, Any]) -> str:
    if estimate['amount'] != bill['amount'] or estimate['currency'] != bill['currency']:
        return 'amount_mismatch'
    for key in ('provider', 'model', 'rate_version', 'period_start', 'period_end'):
        estimate_value = estimate.get(key)
        bill_value = bill.get(key)
        if bill_value not in {None, '', 'unknown'} and estimate_value not in {None, '', 'unknown'} and bill_value != estimate_value:
            return 'metadata_mismatch'
    return 'matched'


def _serialize_bill(item: dict[str, Any]) -> dict[str, Any]:
    return {**item, 'amount': _money(item['amount'])}


def _match_key(item: Mapping[str, Any]) -> str:
    return str(
        item.get('match_key')
        or item.get('request_id')
        or item.get('call_key')
        or item.get('task_id')
        or item.get('order_id')
        or item.get('billing_row_id')
        or item.get('id')
        or ''
    )


def _billing_match_key(item: Mapping[str, Any]) -> str:
    return str(
        item.get('match_key')
        or item.get('request_id')
        or item.get('call_key')
        or item.get('task_id')
        or item.get('order_id')
        or ''
    )


def _decimal(value: Any) -> Decimal:
    if value is None or value == '':
        return Decimal('0.000000')
    try:
        return Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f'Invalid money value: {value!r}') from exc


def _money(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return value.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP).to_eng_string()


def _date_text(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    return str(value)
