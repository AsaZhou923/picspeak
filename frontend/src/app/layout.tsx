import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Sans, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { I18nProvider } from '@/lib/i18n';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';  
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BackgroundEffect from '@/components/ui/BackgroundEffect';
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
  authors: [{ name: 'PicSpeak' }],
  creator: 'PicSpeak',
  publisher: 'PicSpeak',
  category: 'photography',
  alternates: {
    canonical: '/',
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
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    type: 'website',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    locale: 'en_US',
    images: [{ url: siteConfig.ogImage, width: 512, height: 512, alt: 'PicSpeak Logo' }],
  },
  twitter: {
    card: 'summary',
    title: siteConfig.title,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    creator: '@Zzw_Prime',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh"
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
        <ClerkProvider>
          <Analytics />
          <SpeedInsights />
          <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
            <BackgroundEffect />
          </div>
          <div className="relative z-10 min-h-screen flex flex-col">
            <I18nProvider>
              <ThemeProvider>
                <AuthProvider>
                  <Header />
                  <main className="flex-1 pt-12 md:pt-0">{children}</main>
                  <Footer />
                </AuthProvider>
              </ThemeProvider>
            </I18nProvider>
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
