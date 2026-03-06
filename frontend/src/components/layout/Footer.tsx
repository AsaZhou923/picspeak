import Link from 'next/link';
import { Aperture } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle py-10 mt-auto">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-subtle">
        <div className="flex items-center gap-2">
          <Aperture size={12} className="text-gold/60" />
          <span className="font-display text-sm text-ink-muted tracking-wider">PicSpeak</span>
        </div>

        <div className="flex items-center gap-5">
          <Link href="/" className="hover:text-ink transition-colors">首页</Link>
          <Link href="/workspace" className="hover:text-ink transition-colors">评图</Link>
          <Link href="/account/usage" className="hover:text-ink transition-colors">额度</Link>
        </div>

        <p className="text-ink-subtle/60">
          © {new Date().getFullYear()} PicSpeak. AI Photography Critique.
        </p>
      </div>
    </footer>
  );
}
