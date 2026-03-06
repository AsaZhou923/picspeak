import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

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
  title: 'PicSpeak — AI Photography Critique',
  description: 'Upload your photographs and receive intelligent AI-powered critique and analysis.',
  keywords: ['photography', 'AI critique', 'photo analysis', 'composition', 'lighting'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh"
      className={`${cormorant.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-void text-ink min-h-screen flex flex-col">
        <AuthProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
