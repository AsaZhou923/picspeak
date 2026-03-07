import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { I18nProvider } from '@/lib/i18n';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';  
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BackgroundEffect from '@/components/ui/BackgroundEffect';

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
  title: {
    default: 'PicSpeak — AI Photography Critique',
    template: '%s | PicSpeak',
  },
  description:
    'Upload your photographs and receive intelligent AI-powered critique and analysis. Get scored on composition, lighting, color, storytelling, and technical quality.',
  keywords: [
    'photography critique',
    'AI photo analysis',
    'photo scoring',
    'composition feedback',
    'lighting analysis',
    'photography review',
    'AI photography',
    'photo feedback',
  ],
  authors: [{ name: 'PicSpeak' }],
  creator: 'PicSpeak',
  robots: { index: true, follow: true },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'PicSpeak',
    title: 'PicSpeak — AI Photography Critique',
    description:
      'Upload your photographs and receive intelligent AI-powered critique and analysis.',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'PicSpeak Logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'PicSpeak — AI Photography Critique',
    description:
      'Upload your photographs and receive intelligent AI-powered critique and analysis.',
    images: ['/logo.png'],
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
        {/* Prevent flash of unstyled theme: apply class before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('picspeak-theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if((s||p)==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="text-ink min-h-screen">
        <Analytics />
        <SpeedInsights />
        {/* Fixed z-0: aurora + particles background layer */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <BackgroundEffect />
        </div>
        {/* z-10: page content sits above the background layer */}
        <div className="relative z-10 min-h-screen flex flex-col">
          <I18nProvider>
            <ThemeProvider>
              <AuthProvider>
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </AuthProvider>
            </ThemeProvider>
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}
