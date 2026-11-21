import type { Metadata } from 'next';
import { headers } from 'next/headers';
import localFont from 'next/font/local';
import '../fonts/noto-serif-cjk.css';
import './globals.css';
import SiteChrome from '@/components/layout/SiteChrome';
import AppProviders from '@/components/providers/AppProviders';
import PerformanceTelemetry from '@/components/performance/PerformanceTelemetry';
import { getInitialTranslations } from '@/lib/i18n-initial';
import { isSupportedLocale } from '@/lib/locale';
import { HOME_LANGUAGE_ALTERNATES, OPEN_GRAPH_LOCALES } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

// Self-hosted Latin body and monospace variable fonts (OFL licenses in src/fonts/).
// Noto Serif SC/JP display serif unicode-range slices are loaded via
// ../fonts/noto-serif-cjk.css from public/fonts/ so browsers fetch only needed slices.
const dmSans = localFont({
  src: '../fonts/dm-sans-latin.woff2',
  weight: '400 600',
  style: 'normal',
  variable: '--font-sans-latin',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

const jetbrainsMono = localFont({
  src: '../fonts/jetbrains-mono-latin.woff2',
  weight: '400 500',
  style: 'normal',
  variable: '--font-mono-latin',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
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
    canonical: '/en',
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
    icon: '/brand-mark.svg',
    shortcut: '/brand-mark.svg',
    apple: siteConfig.logoImage,
  },
  openGraph: {
    type: 'website',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    locale: OPEN_GRAPH_LOCALES.en,
    alternateLocale: [OPEN_GRAPH_LOCALES.zh, OPEN_GRAPH_LOCALES.ja],
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
  const enablePerformanceTelemetry =
    process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production';

  return (
    <html
      lang={lang}
      className={`${dmSans.variable} ${jetbrainsMono.variable}`}
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
          initialMessages={getInitialTranslations(initialLocale ?? 'en')}
        >
          {enablePerformanceTelemetry ? <PerformanceTelemetry /> : null}
          <SiteChrome>{children}</SiteChrome>
        </AppProviders>
      </body>
    </html>
  );
}
