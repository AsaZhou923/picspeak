import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile the actual client into isolated modules so Node can execute its extensionless imports.
function moduleUrl(source: string): string {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const typesUrl = moduleUrl(await readFile(new URL('../src/lib/types.ts', import.meta.url), 'utf8'));
const downloadUrl = moduleUrl(await readFile(new URL('../src/lib/generation-download.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8'))
  .replaceAll("'./types'", JSON.stringify(typesUrl))
  .replaceAll("'./generation-download'", JSON.stringify(downloadUrl));
const api = await import(moduleUrl(source));

test('feedback requests bind the displayed score and personal record versions and support cancellation', async (t) => {
  const requests: Array<{ url: URL; options: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (input: string, options: RequestInit) => {
    requests.push({ url: new URL(input), options });
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  });
  const signal = new AbortController().signal;
  await api.getScoreFeedback('review/id', 'displayed-revision', 'signed-in-token', signal);
  await api.putScoreFeedback('review/id', { expected_score_revision: 'displayed-revision', expected_feedback_version: 3, verdict: 'too_low', source_surface: 'gallery' }, 'signed-in-token', signal);
  await api.getScoreFeedbackRecord('feedback/id', 'signed-in-token', signal);
  await api.deleteScoreFeedback('feedback/id', 4, 'signed-in-token', signal);
  assert.equal(requests[0].url.searchParams.get('score_revision'), 'displayed-revision');
  assert.ok(requests[0].url.pathname.endsWith('/reviews/review%2Fid/score-feedback'));
  assert.equal(JSON.parse(String(requests[1].options.body)).expected_score_revision, 'displayed-revision');
  assert.equal(JSON.parse(String(requests[1].options.body)).expected_feedback_version, 3);
  assert.ok(requests[2].url.pathname.endsWith('/score-feedback/feedback%2Fid'));
  assert.deepEqual(JSON.parse(String(requests[3].options.body)), { expected_feedback_version: 4 });
  for (const request of requests) {
    assert.equal(request.options.signal, signal);
    assert.equal(request.options.cache, 'no-store');
    assert.equal((request.options.headers as Record<string, string>).Authorization, 'Bearer signed-in-token');
  }
});

test('notification writes send the backend body contract and propagate AbortSignal', async (t) => {
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: string, options: RequestInit) => {
    requests.push(options);
    return new Response('{}');
  });
  const signal = new AbortController().signal;
  await api.markNotificationsReadAll('signed-in-token', 'interaction', signal);
  await api.updateNotificationArchive('id', true, 'signed-in-token', signal);
  await api.updateNotificationPreferences('signed-in-token', { likes_enabled: false }, signal);
  assert.deepEqual(requests.map((request) => JSON.parse(String(request.body))), [{ category: 'interaction' }, { archived: true }, { likes_enabled: false }]);
  assert.ok(requests.every((request) => request.signal === signal && request.cache === 'no-store'));
});

test('notification reads send the selected interface language for server rendering', async (t) => {
  const urls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    urls.push(new URL(input));
    return new Response('{}');
  });
  await api.getNotifications('signed-in-token', { locale: 'zh' });
  await api.getNotificationDetail('notification/id', 'signed-in-token', undefined, 'ja');
  assert.equal(urls[0].searchParams.get('locale'), 'zh');
  assert.equal(urls[1].searchParams.get('locale'), 'ja');
});

test('401 on account features never invokes the guest recovery handler or creates another request', async (t) => {
  let recoveryCalls = 0;
  let requestCalls = 0;
  api.registerUnauthorizedHandler(async () => { recoveryCalls++; return 'guest-token'; });
  t.mock.method(globalThis, 'fetch', async () => {
    requestCalls++;
    return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'raw backend text' } }), { status: 401 });
  });
  await assert.rejects(api.getNotificationUnreadCount('signed-in-token'), (failure: unknown) => (failure as { status: number }).status === 401);
  await assert.rejects(api.getScoreFeedback('id', 'revision', 'signed-in-token'), (failure: unknown) => (failure as { status: number }).status === 401);
  assert.equal(recoveryCalls, 0);
  assert.equal(requestCalls, 2);
  api.registerUnauthorizedHandler(null);
});
