import type { AuthToken, NotificationCategory, NotificationItem, NotificationTarget, NotificationUnreadCountResponse } from '@/lib/types';

export const NOTIFICATION_POLL_INTERVAL_MS = 60_000;
export const NOTIFICATION_MAX_RETRY_DELAY_MS = 300_000;

export function canUseNotifications(userInfo: AuthToken | null | undefined): userInfo is AuthToken {
  return Boolean(userInfo && userInfo.plan !== 'guest');
}

export function nextNotificationRetryDelayMs(failureCount: number, retryAfterRemainingMs = 0): number {
  const exponent = Math.max(0, Math.min(failureCount, 5));
  const backoff = Math.min(NOTIFICATION_MAX_RETRY_DELAY_MS, NOTIFICATION_POLL_INTERVAL_MS * 2 ** exponent);
  const serverDelay = Number.isFinite(retryAfterRemainingMs) ? Math.max(0, retryAfterRemainingMs) : 0;
  return Math.max(backoff, serverDelay);
}

export function notificationCategoryTone(category: NotificationCategory): string {
  if (category === 'system') return 'text-sage border-sage/25 bg-sage/10';
  if (category === 'announcement') return 'text-gold border-gold/25 bg-gold/10';
  return 'text-rust border-rust/25 bg-rust/10';
}

export function getUnreadTotal(unread: NotificationUnreadCountResponse | null): number | null {
  if (!unread) return null;
  return unread.total;
}

export function notificationItemId(item: NotificationItem): string {
  return item.notification_id;
}

export function notificationEventType(item: NotificationItem): string {
  return item.type;
}

export function resolveNotificationHref(target: NotificationTarget | null): string | null {
  if (!target) return null;
  if (target.state !== 'available') return null;
  if (
    target.href &&
    /^\/(?!\/)[\u0020-\u007e]*$/.test(target.href) &&
    !/[<>\\]/.test(target.href) &&
    isKnownNotificationPath(target.href)
  ) {
    return target.href;
  }

  const id = target.public_id ? encodeURIComponent(target.public_id) : '';
  if (target.type === 'review' && id) return `/reviews/${id}?back=/account/notifications`;
  if (target.type === 'task' && id) return `/tasks/${id}`;
  if (target.type === 'generation' && id) return `/generations/${id}`;
  if (target.type === 'generation_task' && id) return `/generation-tasks/${id}`;
  if (target.type === 'usage') return '/account/usage';
  if (target.type === 'updates') return '/updates';
  if (target.type === 'workspace') return '/workspace';
  if (target.type === 'generate') return '/generate';
  return null;
}

function isKnownNotificationPath(href: string): boolean {
  return /^\/(?:account\/usage|reviews\/[^/?#]+|tasks\/[^/?#]+|generations\/[^/?#]+|generation-tasks\/[^/?#]+|updates(?:$|[/?#])|blog(?:$|[/?#])|workspace(?:$|[/?#])|generate(?:$|[/?#]))/.test(href);
}
