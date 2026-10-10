import NotificationDetailClient from '@/features/notifications/NotificationDetailClient';

export default async function AccountNotificationDetailPage({
  params,
}: {
  params: Promise<{ notificationId: string }>;
}) {
  const { notificationId } = await params;
  return <NotificationDetailClient notificationId={notificationId} />;
}
