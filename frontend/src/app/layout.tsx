import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Cormorant_Garamond, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import SiteChrome from '@/components/layout/SiteChrome';
import AppProviders from '@/components/providers/AppProviders';
import PerformanceTelemetry from '@/components/performance/PerformanceTelemetry';
import DeferredBackgroundEffect from '@/components/ui/DeferredBackgroundEffect';
import { getInitialTranslations } from '@/lib/i18n-initial';
import { isSupportedLocale } from '@/lib/locale';
import { HOME_LANGUAGE_ALTERNATES } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: '%s | PicSpeak',
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [...siteConfig.keywords],
  authors: [{ name: siteConfig.author.name, url: siteConfig.author.id }],
  creator: 'PicSpeak',
  publisher: 'PicSpeak',
  category: 'photography',
  alternates: {
    canonical: '/',
    languages: HOME_LANGUAGE_ALTERNATES,
  },
  verification: {
    google: siteConfig.googleSiteVerification,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: siteConfig.logoImage,
    shortcut: siteConfig.logoImage,
    apple: siteConfig.logoImage,
  },
  openGraph: {
    type: 'website',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    locale: 'en_US',
    images: [
      {
        url: siteConfig.ogImage,
        width: siteConfig.ogImageWidth,
        height: siteConfig.ogImageHeight,
        alt: 'PicSpeak AI critique, AI Create, and gallery examples',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    creator: '@Zzw_Prime',
  },
};

function documentLang(locale: string | null): string {
  if (locale === 'zh') return 'zh-CN';
  if (locale === 'ja') return 'ja';
  return 'en';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const requestLocale = requestHeaders.get('x-picspeak-locale');
  const initialLocale = isSupportedLocale(requestLocale) ? requestLocale : undefined;
  const lang = documentLang(initialLocale ?? null);

  return (
    <html
      lang={lang}
      className={`${cormorant.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta
          name="google-site-verification"
          content="uPzmX8kYSDzOWm7iBz-dty4It12mMcIVUOPPwWmLGnM"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('picspeak-theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if((s||p)==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="text-ink min-h-screen">
        <AppProviders
          initialLocale={initialLocale}
          initialMessages={initialLocale ? getInitialTranslations(initialLocale) : undefined}
        >
          {process.env.NODE_ENV === 'production' ? <PerformanceTelemetry /> : null}
          <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
            <DeferredBackgroundEffect />
          </div>
          <SiteChrome>{children}</SiteChrome>
        </AppProviders>
      </body>
    </html>
  );
}
