from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import uuid4

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import ProductAnalyticsEvent
from app.db.session import SessionLocal
from app.services.product_analytics import record_product_event


def verify_product_analytics_write(db) -> dict[str, str | int]:
    session_id = f'ops_verify_{uuid4().hex}'
    page_path = '/ops/verify/analytics'
    event_name = 'home_viewed'

    record_product_event(
        db,
        event_name=event_name,
        plan='guest',
        session_id=session_id,
        source='unknown',
        page_path=page_path,
        locale='en',
        metadata={
            'kind': 'ops_verification',
            'session_id': session_id,
        },
    )
    db.commit()

    inserted_event = (
        db.query(ProductAnalyticsEvent)
        .filter(ProductAnalyticsEvent.session_id == session_id)
        .one_or_none()
    )
    if inserted_event is None:
        raise RuntimeError(f'Inserted analytics event could not be read back for session_id={session_id}')

    db.delete(inserted_event)
    db.commit()

    return {
        'event_name': event_name,
        'inserted_id': inserted_event.id,
        'session_id': session_id,
        'page_path': page_path,
        'cleanup': 'deleted',
    }


def main() -> int:
    db = SessionLocal()
    try:
        result = verify_product_analytics_write(db)
    finally:
        db.close()

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
