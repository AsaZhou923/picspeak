import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  canUseNotifications,
  nextNotificationRetryDelayMs,
  resolveNotificationHref,
} from '../src/features/notifications/notification-state.ts';
import type { AuthToken } from '../src/lib/types.ts';

const signedInUser: AuthToken = {
  access_token: 'token',
  token_type: 'bearer',
  user_id: 'usr_notifications',
  plan: 'free',
  auth_provider: 'clerk',
  clerk_user_id: 'clerk_notifications',
};

const guestUser: AuthToken = {
  access_token: 'guest-token',
  token_type: 'bearer',
  user_id: 'guest_notifications',
  plan: 'guest',
  auth_provider: 'guest',
};

test('enables notification requests only for signed-in non-guest users', () => {
  assert.equal(canUseNotifications(signedInUser), true);
  assert.equal(canUseNotifications(guestUser), false);
  assert.equal(canUseNotifications(null), false);
});

test('caps notification retry delay at five minutes', () => {
  assert.equal(nextNotificationRetryDelayMs(0), 60_000);
  assert.equal(nextNotificationRetryDelayMs(1), 120_000);
  assert.equal(nextNotificationRetryDelayMs(9), 300_000);
  assert.equal(nextNotificationRetryDelayMs(1, 180_000), 180_000);
  assert.equal(nextNotificationRetryDelayMs(9, 600_000), 600_000);
  assert.equal(nextNotificationRetryDelayMs(1, -100), 120_000);
  assert.equal(nextNotificationRetryDelayMs(1, Number.NaN), 120_000);
});

test('resolves available notification targets to internal routes only', () => {
  assert.equal(
    resolveNotificationHref({ type: 'review', public_id: 'rev 1', href: null, state: 'available' }),
    '/reviews/rev%201?back=/account/notifications',
  );
  assert.equal(resolveNotificationHref({ type: 'updates', public_id: null, href: null, state: 'available' }), '/updates');
  assert.equal(resolveNotificationHref({ type: null, public_id: null, href: '/account/usage', state: 'available' }), '/account/usage');
  assert.equal(resolveNotificationHref({ type: null, public_id: null, href: 'https://example.test', state: 'available' }), null);
  assert.equal(resolveNotificationHref({ type: null, public_id: null, href: '//example.test', state: 'available' }), null);
  assert.equal(resolveNotificationHref({ type: 'review', public_id: 'rev_1', href: null, state: 'unavailable' }), null);
});

test('notification page refresh reloads the inbox list as well as unread count', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/features/notifications/NotificationsPageClient.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(source, /const handleRefresh = useCallback\(\(\) => \{/);
  assert.match(source, /setReload\(\(value\) => value \+ 1\);/);
  assert.match(source, /onClick=\{handleRefresh\}/);
});

test('notification list invalidation keeps provider retry state intact', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/features/notifications/NotificationProvider.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(source, /if \(next\) \{\r?\n\s+setError\(false\);\r?\n\s+failureRef\.current = 0;\r?\n\s+retryAfterUntilRef\.current = 0;/);
  assert.doesNotMatch(source, /setUnreadIdentity\(next \? identityRef\.current : ''\);\r?\n\s+setError\(false\);\r?\n\s+failureRef\.current = 0;/);
});
