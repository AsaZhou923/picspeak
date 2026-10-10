'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n-en';
import { useNotifications } from './NotificationProvider';

export default function NotificationBell() {
  const { t } = useI18n();
  const { canReadNotifications, unreadTotal, error } = useNotifications();
  if (!canReadNotifications) return null;
  const copy = (key: TranslationKey) => t(key);
  const label = unreadTotal && unreadTotal > 0
    ? copy('notifications_bell_label_unread').replace('{count}', String(unreadTotal))
    : copy('notifications_bell_label');

  return (
    <Link
      href="/account/notifications"
      aria-label={label}
      className="relative flex h-11 w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <Bell size={15} />
      {unreadTotal && unreadTotal > 0 ? (
        <span className="absolute right-1 top-1 min-w-5 rounded-full border border-void bg-rust px-1 text-center text-[10px] font-semibold leading-5 text-white">
          {unreadTotal > 99 ? '99+' : unreadTotal}
        </span>
      ) : error ? (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rust" aria-hidden="true" />
      ) : null}
    </Link>
  );
}
