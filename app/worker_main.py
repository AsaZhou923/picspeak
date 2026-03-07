from __future__ import annotations

import signal
import time

from app.core.config import settings
from app.services.worker import ReviewWorker


def main() -> None:
    worker = ReviewWorker(worker_name=settings.review_worker_name or 'standalone-worker')
    worker.start()

    should_run = True

    def _stop(*_args):
        nonlocal should_run
        should_run = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    try:
        while should_run:
            time.sleep(1)
    finally:
        worker.stop()


if __name__ == '__main__':
    main()
