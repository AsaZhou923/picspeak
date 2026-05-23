'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Footer from '@/components/layout/Footer';
import { isMarketingRoute } from '@/lib/route-shell';

const Header = dynamic(() => import('@/components/layout/Header'));
const MarketingHeader = dynamic(() => import('@/components/layout/MarketingHeader'));

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const marketing = isMarketingRoute(pathname);

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {marketing ? <MarketingHeader /> : <Header />}
      <main id="main-content" tabIndex={-1} className="flex-1 pt-12 md:pt-0">
        {children}
      </main>
      <Footer />
    </div>
  );
}
