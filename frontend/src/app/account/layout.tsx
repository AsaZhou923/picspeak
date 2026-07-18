import type { Metadata } from 'next';
import RouteSuspenseBoundary from '@/components/layout/RouteSuspenseBoundary';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <RouteSuspenseBoundary>{children}</RouteSuspenseBoundary>;
}
