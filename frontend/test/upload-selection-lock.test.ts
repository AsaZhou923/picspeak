import test from 'node:test';
import assert from 'node:assert/strict';
import { createUploadSelectionLock } from '../src/components/upload/uploadSelectionLock.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test('upload selection lock rejects re-entry while preprocessing is active', async () => {
  const lock = createUploadSelectionLock();
  const gate = deferred<string>();
  const events: string[] = [];

  const first = lock.tryRun(async () => {
    events.push('first-started');
    return gate.promise;
  });
  const second = await lock.tryRun(async () => {
    events.push('second-started');
    return 'second';
  });

  assert.equal(lock.isLocked(), true);
  assert.equal(second, undefined);
  assert.deepEqual(events, ['first-started']);

  gate.resolve('first');
  assert.equal(await first, 'first');
  assert.equal(lock.isLocked(), false);
});

test('upload selection lock releases when preprocessing throws', async () => {
  const lock = createUploadSelectionLock();

  await assert.rejects(
    lock.tryRun(async () => {
      throw new Error('compress failed');
    }),
    /compress failed/
  );
  assert.equal(lock.isLocked(), false);

  const retry = await lock.tryRun(async () => 'retry-ok');
  assert.equal(retry, 'retry-ok');
});

test('upload selection lock releases when the selected-file callback throws', async () => {
  const lock = createUploadSelectionLock();
  const selectedFileCallback = () => {
    throw new Error('consumer failed');
  };

  await assert.rejects(
    lock.tryRun(async () => {
      selectedFileCallback();
    }),
    /consumer failed/
  );
  assert.equal(lock.isLocked(), false);

  const sameFileRetry = await lock.tryRun(async () => 'same-file-retry-ok');
  assert.equal(sameFileRetry, 'same-file-retry-ok');
});
