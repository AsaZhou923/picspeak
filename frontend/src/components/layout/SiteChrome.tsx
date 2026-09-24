'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Footer from '@/components/layout/Footer';
import { useI18n } from '@/lib/i18n';
import { isMarketingRoute } from '@/lib/route-shell';
import { isUpdateNoticeRoute } from '@/lib/update-notice';

const Header = dynamic(() => import('@/components/layout/Header'));
const MarketingHeader = dynamic(() => import('@/components/layout/MarketingHeader'));
const HomeUpdateDialog = dynamic(() => import('@/components/home/HomeUpdateDialog'), { ssr: false });

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const marketing = isMarketingRoute(pathname);

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <a href="#main-content" className="skip-link">
        {t('skip_to_content')}
      </a>
      {marketing ? <MarketingHeader /> : <Header />}
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <Footer />
      {isUpdateNoticeRoute(pathname) && <HomeUpdateDialog />}
    </div>
  );
}
