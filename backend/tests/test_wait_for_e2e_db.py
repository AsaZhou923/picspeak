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

from app.testing import migrate_e2e
from app.testing.wait_for_e2e_db import wait_for_database

LOCAL_URL = 'postgresql+psycopg2://postgres:postgres@127.0.0.1:55432/picspeak_e2e'


class _FakeEngine:
    def __init__(self, outcomes: list[bool], *, marker_present: bool = True) -> None:
        self.outcomes = list(outcomes)
        self.marker_present = marker_present
        self.connections: list[MagicMock] = []

    @contextmanager
    def connect(self):
        if not self.outcomes.pop(0):
            raise OperationalError('SELECT 1', {}, Exception('server closed the connection unexpectedly'))
        connection = MagicMock()
        if not self.marker_present:
            connection.execute.return_value.first.return_value = None
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

    def test_require_local_refuses_effective_remote_destinations_before_connecting(self) -> None:
        cases = {
            'remote host': ('postgresql+psycopg2://postgres:postgres@db.example.com:5432/picspeak', {}),
            'host query param': (f'{LOCAL_URL}?host=db.example.com', {}),
            'hostaddr query param': (f'{LOCAL_URL}?hostaddr=10.0.0.5', {}),
            'service query param': (f'{LOCAL_URL}?service=prod', {}),
            'PGHOST env': (LOCAL_URL, {'PGHOST': 'db.example.com'}),
            'PGHOSTADDR env': (LOCAL_URL, {'PGHOSTADDR': '10.0.0.5'}),
            'PGSERVICE env': (LOCAL_URL, {'PGSERVICE': 'prod'}),
        }
        for label, (url, env) in cases.items():
            with self.subTest(label), patch.dict('os.environ', env):
                with patch('app.testing.wait_for_e2e_db.create_engine') as create_engine:
                    with self.assertRaisesRegex(RuntimeError, 'non-loopback'):
                        wait_for_database(url, require_local=True)
                create_engine.assert_not_called()

    def test_require_local_allows_loopback(self) -> None:
        engine = _FakeEngine([True])
        with (
            patch('app.testing.wait_for_e2e_db.create_engine', return_value=engine),
            patch('app.testing.wait_for_e2e_db.time.sleep'),
        ):
            self.assertEqual(wait_for_database(LOCAL_URL, required_successes=1, require_local=True), 1)

    def test_require_marker_refuses_ready_database_without_marker(self) -> None:
        engine = _FakeEngine([True], marker_present=False)
        with (
            patch('app.testing.wait_for_e2e_db.create_engine', return_value=engine),
            patch('app.testing.wait_for_e2e_db.time.sleep'),
        ):
            with self.assertRaisesRegex(RuntimeError, 'disposable marker'):
                wait_for_database(LOCAL_URL, required_successes=1, require_marker=True)
        engine.connections[0].commit.assert_not_called()

    def test_require_marker_implies_loopback_check(self) -> None:
        with patch('app.testing.wait_for_e2e_db.create_engine') as create_engine:
            with self.assertRaisesRegex(RuntimeError, 'non-loopback'):
                wait_for_database(f'{LOCAL_URL}?host=db.example.com', require_marker=True)
        create_engine.assert_not_called()


class MigrateE2ETestCase(unittest.TestCase):
    def _run(self, database_url: str, env: dict[str, str] | None = None, *, marker_present: bool = True):
        engine = _FakeEngine([True], marker_present=marker_present)
        with (
            patch.dict('os.environ', env or {}),
            patch('app.testing.migrate_e2e.bootstrap._database_url', return_value=database_url),
            patch('app.testing.migrate_e2e.bootstrap.ensure_runtime_schema') as ensure_runtime_schema,
            patch('app.testing.wait_for_e2e_db.create_engine', return_value=engine) as create_engine,
            patch('app.testing.wait_for_e2e_db.time.sleep'),
            patch('sys.stderr'),
            patch('builtins.print'),
        ):
            exit_code = migrate_e2e.main()
        return exit_code, ensure_runtime_schema, create_engine

    def test_refuses_non_loopback_destinations_without_connecting_or_migrating(self) -> None:
        cases = {
            'remote host': ('postgresql+psycopg2://postgres:postgres@db.example.com:5432/picspeak', None),
            'hostaddr query param': (f'{LOCAL_URL}?hostaddr=10.0.0.5', None),
            'PGHOST env': (LOCAL_URL, {'PGHOST': 'db.example.com'}),
            'PGSERVICE env': (LOCAL_URL, {'PGSERVICE': 'prod'}),
        }
        for label, (url, env) in cases.items():
            with self.subTest(label):
                exit_code, ensure_runtime_schema, create_engine = self._run(url, env)
                self.assertEqual(exit_code, 1)
                create_engine.assert_not_called()
                ensure_runtime_schema.assert_not_called()

    def test_refuses_local_database_without_disposable_marker(self) -> None:
        exit_code, ensure_runtime_schema, _ = self._run(LOCAL_URL, marker_present=False)
        self.assertEqual(exit_code, 1)
        ensure_runtime_schema.assert_not_called()

    def test_migrates_marked_loopback_database(self) -> None:
        exit_code, ensure_runtime_schema, _ = self._run(LOCAL_URL)
        self.assertEqual(exit_code, 0)
        ensure_runtime_schema.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
