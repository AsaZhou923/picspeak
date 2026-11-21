import itertools
import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch

from sqlalchemy.exc import OperationalError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.testing.wait_for_e2e_db import wait_for_database

LOCAL_URL = 'postgresql+psycopg2://postgres:postgres@127.0.0.1:55432/picspeak_e2e'


class _FakeEngine:
    def __init__(self, outcomes: list[bool]) -> None:
        self.outcomes = list(outcomes)
        self.connections: list[MagicMock] = []

    @contextmanager
    def connect(self):
        if not self.outcomes.pop(0):
            raise OperationalError('SELECT 1', {}, Exception('server closed the connection unexpectedly'))
        connection = MagicMock()
        self.connections.append(connection)
        yield connection

    def dispose(self) -> None:
        pass


class WaitForE2EDatabaseTestCase(unittest.TestCase):
    def test_transient_success_does_not_count_as_ready(self) -> None:
        # The temporary init server answers once, disappears, then the final server stays up.
        engine = _FakeEngine([True, False, True, True, True])
        with (
            patch('app.testing.wait_for_e2e_db.create_engine', return_value=engine),
            patch('app.testing.wait_for_e2e_db.time.sleep'),
        ):
            attempts = wait_for_database(LOCAL_URL, required_successes=3, interval_seconds=0)
        self.assertEqual(attempts, 5)
        self.assertEqual(engine.outcomes, [])

    def test_marker_is_written_on_final_verified_connection(self) -> None:
        engine = _FakeEngine([True, True])
        with (
            patch('app.testing.wait_for_e2e_db.create_engine', return_value=engine),
            patch('app.testing.wait_for_e2e_db.time.sleep'),
        ):
            wait_for_database(LOCAL_URL, required_successes=2, interval_seconds=0, mark_disposable=True)
        first, final = engine.connections
        first.commit.assert_not_called()
        final.commit.assert_called_once()
        statements = [str(call.args[0]) for call in final.execute.call_args_list]
        self.assertIn('_picspeak_e2e_disposable_marker', statements[1])

    def test_times_out_explicitly_when_server_never_stays_up(self) -> None:
        engine = _FakeEngine([True, False, True, False])
        with (
            patch('app.testing.wait_for_e2e_db.create_engine', return_value=engine),
            patch('app.testing.wait_for_e2e_db.time.sleep'),
            patch('app.testing.wait_for_e2e_db.time.monotonic', side_effect=itertools.count()),
        ):
            with self.assertRaisesRegex(TimeoutError, r'2 consecutive SELECT 1 probes within 5s \(4 attempts'):
                wait_for_database(LOCAL_URL, required_successes=2, interval_seconds=0, timeout_seconds=5)

    def test_refuses_to_mark_remote_database(self) -> None:
        with patch('app.testing.wait_for_e2e_db.create_engine') as create_engine:
            with self.assertRaisesRegex(RuntimeError, 'non-loopback'):
                wait_for_database(
                    'postgresql+psycopg2://postgres:postgres@db.example.com:5432/picspeak',
                    mark_disposable=True,
                )
        create_engine.assert_not_called()


if __name__ == '__main__':
    unittest.main()
