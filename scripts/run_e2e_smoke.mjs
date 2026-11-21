#!/usr/bin/env node
/**
 * Single end-to-end smoke runner usable both locally (with disposable Docker
 * Postgres + MinIO containers) and in CI (against service containers).
 *
 * Usage:
 *   node scripts/run_e2e_smoke.mjs [--use-existing-services] [--skip-build]
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend');
const NEXT_BIN = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
const PLAYWRIGHT_BIN = path.join(FRONTEND_DIR, 'node_modules', '@playwright', 'test', 'cli.js');
const MOCKED_FONTS_PATH = path.join(
  FRONTEND_DIR,
  'test',
  'fixtures',
  'google-fonts-mocked-responses.cjs',
);

const POSTGRES_IMAGE = 'postgres:17-alpine';
const MINIO_IMAGE = 'minio/minio:RELEASE.2025-09-07T16-13-09Z';
const E2E_DB_MARKER_SQL =
  "CREATE TABLE IF NOT EXISTS _picspeak_e2e_disposable_marker (marker text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()); INSERT INTO _picspeak_e2e_disposable_marker (marker) VALUES ('picspeak-e2e-smoke') ON CONFLICT DO NOTHING;";

// Explicit allowlist of OS/toolchain environment variables forwarded to child
// processes. Application, database, storage, AI, Clerk, and libpq PG* variables
// are intentionally excluded so local developer shells cannot leak into E2E runs.
const CHILD_ENV_ALLOWLIST = new Set([
  'PATH',
  'PATHEXT',
  'COMSPEC',
  'SYSTEMROOT',
  'WINDIR',
  'SYSTEMDRIVE',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'COMMONPROGRAMFILES',
  'COMMONPROGRAMFILES(X86)',
  'OS',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'CI',
  'GITHUB_ACTIONS',
  'PLAYWRIGHT_BROWSERS_PATH',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_RUNTIME_DIR',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_OPTIONS',
  'PYTHONUTF8',
  'VIRTUAL_ENV',
]);

function buildBaseChildEnv() {
  const baseEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && CHILD_ENV_ALLOWLIST.has(key.toUpperCase())) {
      baseEnv[key] = value;
    }
  }
  return baseEnv;
}

const args = new Set(process.argv.slice(2));
const useExistingServices =
  args.has('--use-existing-services') || process.env.E2E_USE_EXISTING_SERVICES === '1';
const skipBuild = args.has('--skip-build') || process.env.E2E_SKIP_BUILD === '1';

function resolvePythonExecutable() {
  if (process.env.E2E_PYTHON) {
    return process.env.E2E_PYTHON;
  }
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(REPO_ROOT, '.venv', 'Scripts', 'python.exe'),
          path.resolve(REPO_ROOT, '..', '..', '..', '..', 'PicSpeak', '.venv', 'Scripts', 'python.exe'),
          'python',
        ]
      : [
          path.join(REPO_ROOT, '.venv', 'bin', 'python'),
          'python3',
          'python',
        ];
  for (const candidate of candidates) {
    if (candidate === 'python' || candidate === 'python3' || existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python';
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address !== 'object') {
        reject(new Error('Could not reserve local port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function runSync(command, commandArgs, options = {}) {
  console.log(`> ${command} ${commandArgs.join(' ')}`);
  execFileSync(command, commandArgs, {
    stdio: 'inherit',
    ...options,
  });
}

function runCommandAsync(command, commandArgs, options = {}) {
  console.log(`> ${command} ${commandArgs.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      resolve({ code: code ?? (signal ? 1 : 0), signal });
    });
  });
}

async function waitForTcp(host, port, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label} at ${host}:${port}`);
}

async function waitForHttp(url, label, { timeoutMs = 60_000, child = null, logs = () => '' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`${label} exited early (${child.exitCode})\n${logs()}`);
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 400) {
        return;
      }
    } catch {
      // Service not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}\n${logs()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

function removeDockerContainers(names) {
  for (const name of names) {
    try {
      // -v removes anonymous volumes created by postgres/minio images.
      execFileSync('docker', ['rm', '-f', '-v', name], { stdio: 'ignore' });
    } catch {
      // Container already removed or never created.
    }
  }
}

async function main() {
  const startedAt = Date.now();
  const pythonExe = resolvePythonExecutable();
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const tmpDir = path.join(os.tmpdir(), `picspeak-e2e-${runId}`);
  mkdirSync(tmpDir, { recursive: true });
  const fixturePath = path.join(tmpDir, 'e2e-fixture.json');

  const dockerContainers = [];
  let backendProc = null;
  let frontendProc = null;
  let backendLogs = '';
  let frontendLogs = '';

  const cleanup = async () => {
    await stopProcess(frontendProc);
    await stopProcess(backendProc);
    removeDockerContainers(dockerContainers);
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
  };

  let cleaningUp = false;
  const handleSignal = async (signal) => {
    if (cleaningUp) return;
    cleaningUp = true;
    await cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.on('SIGINT', () => void handleSignal('SIGINT'));
  process.on('SIGTERM', () => void handleSignal('SIGTERM'));

  try {
    let pgPort;
    let minioPort;
    let databaseUrl;
    let objectBucket;
    let objectAccessKeyId;
    let objectSecretAccessKey;
    const backendPort = Number(process.env.E2E_BACKEND_PORT || 8000);
    const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 3000);

    if (!useExistingServices) {
      // Default Docker mode ignores any inherited DATABASE_URL / OBJECT_* env
      // and connects exclusively to its own disposable containers.
      pgPort = await reservePort();
      minioPort = Number(process.env.E2E_MINIO_PORT || 19000);
      databaseUrl = `postgresql+psycopg2://postgres:postgres@127.0.0.1:${pgPort}/picspeak_e2e`;
      objectBucket = 'picspeak-e2e';
      objectAccessKeyId = 'minioadmin';
      objectSecretAccessKey = 'minioadmin';

      const pgContainer = `picspeak-e2e-pg-${runId}`;
      const minioContainer = `picspeak-e2e-minio-${runId}`;
      dockerContainers.push(pgContainer, minioContainer);

      runSync('docker', [
        'run',
        '-d',
        '--name',
        pgContainer,
        '-e',
        'POSTGRES_DB=picspeak_e2e',
        '-e',
        'POSTGRES_USER=postgres',
        '-e',
        'POSTGRES_PASSWORD=postgres',
        '-p',
        `127.0.0.1:${pgPort}:5432`,
        POSTGRES_IMAGE,
      ]);

      runSync('docker', [
        'run',
        '-d',
        '--name',
        minioContainer,
        '-e',
        'MINIO_ROOT_USER=minioadmin',
        '-e',
        'MINIO_ROOT_PASSWORD=minioadmin',
        '-e',
        'MINIO_API_CORS_ALLOW_ORIGIN=*',
        '-p',
        `127.0.0.1:${minioPort}:9000`,
        MINIO_IMAGE,
        'server',
        '/data',
      ]);

      await waitForTcp('127.0.0.1', pgPort, 'PostgreSQL');
      let pgReady = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          execFileSync(
            'docker',
            ['exec', pgContainer, 'pg_isready', '-U', 'postgres', '-d', 'picspeak_e2e'],
            { stdio: 'ignore' },
          );
          pgReady = true;
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      if (!pgReady) {
        throw new Error(
          `Timed out waiting for PostgreSQL container ${pgContainer} to become ready after 40 pg_isready probes`,
        );
      }

      // Mark this freshly created container database as disposable so seed_e2e
      // can never run against an unmarked developer database.
      runSync('docker', [
        'exec',
        pgContainer,
        'psql',
        '-U',
        'postgres',
        '-d',
        'picspeak_e2e',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        E2E_DB_MARKER_SQL,
      ]);

      await waitForHttp(`http://127.0.0.1:${minioPort}/minio/health/live`, 'MinIO');
    } else {
      pgPort = Number(process.env.E2E_PG_PORT || 5432);
      minioPort = Number(process.env.E2E_MINIO_PORT || 9000);
      databaseUrl =
        process.env.DATABASE_URL ||
        `postgresql+psycopg2://postgres:postgres@127.0.0.1:${pgPort}/picspeak_e2e`;
      objectBucket = process.env.OBJECT_BUCKET || 'picspeak-e2e';
      objectAccessKeyId = process.env.OBJECT_ACCESS_KEY_ID || 'minioadmin';
      objectSecretAccessKey = process.env.OBJECT_SECRET_ACCESS_KEY || 'minioadmin';

      await waitForTcp('127.0.0.1', pgPort, 'PostgreSQL');
      await waitForHttp(`http://127.0.0.1:${minioPort}/minio/health/live`, 'MinIO');
    }

    const baseChildEnv = buildBaseChildEnv();
    const minioOrigin = `http://127.0.0.1:${minioPort}`;
    const apiOrigin = `http://127.0.0.1:${backendPort}`;
    const frontendOrigin = `http://localhost:${frontendPort}`;

    const sharedBackendEnv = {
      ...baseChildEnv,
      APP_ENV: 'dev',
      APP_SECRET: 'e2e-local-app-secret-0123456789abcdef0123456789abcdef',
      OAUTH_JWT_SECRET: 'e2e-local-jwt-secret-0123456789abcdef0123456789abcdef',
      DATABASE_URL: databaseUrl,
      E2E_FAKE_AI_ENABLED: 'true',
      RUN_EMBEDDED_WORKER: 'true',
      REVIEW_WORKER_IDLE_SLEEP_MS: '100',
      OBJECT_BUCKET: objectBucket,
      OBJECT_BASE_URL: minioOrigin,
      OBJECT_S3_ENDPOINT: minioOrigin,
      OBJECT_ACCESS_KEY_ID: objectAccessKeyId,
      OBJECT_SECRET_ACCESS_KEY: objectSecretAccessKey,
      OBJECT_REGION: 'us-east-1',
      CLERK_SECRET_KEY: '',
      CLERK_WEBHOOK_SIGNING_SECRET: '',
      FRONTEND_ORIGIN: frontendOrigin,
      BACKEND_CORS_ORIGINS: JSON.stringify([`http://localhost:${frontendPort}`, `http://127.0.0.1:${frontendPort}`]),
    };

    // 1. Run database migrations.
    runSync(pythonExe, ['scripts/ensure_runtime_schema.py'], {
      cwd: BACKEND_DIR,
      env: sharedBackendEnv,
    });

    // 2. Seed deterministic E2E fixtures (MinIO bucket, registered user + JWT, public gallery critique).
    runSync(
      pythonExe,
      ['-m', 'app.testing.seed_e2e', '--reset-guest-limits', '--output', fixturePath],
      {
        cwd: BACKEND_DIR,
        env: sharedBackendEnv,
      },
    );

    const sharedFrontendEnv = {
      ...baseChildEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: apiOrigin,
      NEXT_PUBLIC_SITE_URL: frontendOrigin,
      LOCAL_OBJECT_STORAGE_ORIGIN: minioOrigin,
      // Dummy pk_live_ key pointing to RFC 2606 `.invalid` keeps @clerk/nextjs
      // middleware/provider bootable without triggering Clerk's pk_test_ dev-browser
      // handshake redirect; Clerk JS immediately fails closed to the guest path.
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmsuaW52YWxpZCQ',
      CLERK_SECRET_KEY: 'sk_live_placeholder',
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: MOCKED_FONTS_PATH,
    };

    // 3. Build frontend production bundle unless skipped.
    if (!skipBuild) {
      runSync(process.execPath, [NEXT_BIN, 'build'], {
        cwd: FRONTEND_DIR,
        env: sharedFrontendEnv,
      });
    } else if (!existsSync(path.join(FRONTEND_DIR, '.next', 'BUILD_ID'))) {
      throw new Error('--skip-build was set, but frontend/.next/BUILD_ID does not exist.');
    }

    // 4. Start backend under uvicorn with embedded worker enabled.
    console.log(`Starting backend uvicorn on ${apiOrigin} ...`);
    backendProc = spawn(
      pythonExe,
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(backendPort)],
      {
        cwd: BACKEND_DIR,
        env: sharedBackendEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    backendProc.stdout.on('data', (chunk) => {
      backendLogs += chunk.toString();
    });
    backendProc.stderr.on('data', (chunk) => {
      backendLogs += chunk.toString();
    });
    await waitForHttp(`${apiOrigin}/healthz`, 'Backend uvicorn', {
      child: backendProc,
      logs: () => backendLogs,
    });
    console.log('Backend uvicorn is ready.');

    // 5. Start frontend production server.
    console.log(`Starting frontend next start on ${frontendOrigin} ...`);
    frontendProc = spawn(
      process.execPath,
      [NEXT_BIN, 'start', '--hostname', 'localhost', '--port', String(frontendPort)],
      {
        cwd: FRONTEND_DIR,
        env: sharedFrontendEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    frontendProc.stdout.on('data', (chunk) => {
      frontendLogs += chunk.toString();
    });
    frontendProc.stderr.on('data', (chunk) => {
      frontendLogs += chunk.toString();
    });
    await waitForHttp(`${frontendOrigin}/workspace`, 'Frontend next start', {
      child: frontendProc,
      logs: () => frontendLogs,
    });
    console.log('Frontend next start is ready.');

    // 6. Execute Playwright smoke tests.
    const testResult = await runCommandAsync(process.execPath, [PLAYWRIGHT_BIN, 'test'], {
      cwd: FRONTEND_DIR,
      env: {
        ...baseChildEnv,
        E2E_BASE_URL: frontendOrigin,
        E2E_FIXTURE_FILE: fixturePath,
      },
    });

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (testResult.code !== 0) {
      console.error('\n--- Backend logs (tail) ---\n' + backendLogs.slice(-4000));
      console.error('\n--- Frontend logs (tail) ---\n' + frontendLogs.slice(-4000));
      console.error(`\nE2E smoke suite failed in ${elapsedSeconds}s (exit ${testResult.code}).`);
      process.exitCode = testResult.code;
    } else {
      console.log(`\nE2E smoke suite passed in ${elapsedSeconds}s.`);
    }
  } finally {
    if (!cleaningUp) {
      cleaningUp = true;
      await cleanup();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
