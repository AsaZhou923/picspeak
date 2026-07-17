import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, ArrowDown, Check, ImageIcon, Loader2 } from 'lucide-react';
import type { getRetakeCoachCopy } from '@/lib/retake-coach-copy';

type RetakeCoachCopy = ReturnType<typeof getRetakeCoachCopy>;

export function RetakeWorkspaceIntro({
  copy,
  sourcePhotoUrl,
  sourceLoading,
  sourceError,
}: {
  copy: RetakeCoachCopy;
  sourcePhotoUrl: string | null;
  sourceLoading: boolean;
  sourceError: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-sage/25 bg-[radial-gradient(circle_at_top_left,rgba(122,154,120,0.18),transparent_42%),rgb(var(--color-surface)/0.82)]">
      <div className="border-b border-border-subtle px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-sage">
            <Check size={13} />
            {copy.originalReady}
          </span>
          <Link href="/retake" className="text-xs text-ink-subtle transition-colors hover:text-gold">
            {copy.changeSource}
          </Link>
        </div>
      </div>

      {sourceLoading ? (
        <div className="flex aspect-[16/8] items-center justify-center gap-3 text-sm text-ink-muted sm:aspect-[16/6]">
          <Loader2 size={17} className="animate-spin text-sage" />
          {copy.sourceLoading}
        </div>
      ) : sourceError || !sourcePhotoUrl ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <AlertCircle size={22} className="text-rust" />
          <p className="mt-3 max-w-md text-sm leading-7 text-rust">{copy.sourceError}</p>
          <Link href="/retake" className="mt-5 rounded-full border border-rust/30 px-4 py-2 text-sm text-rust hover:bg-rust/10">
            {copy.changeSource}
          </Link>
        </div>
      ) : (
        <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative aspect-[16/9] min-h-56 overflow-hidden bg-void/40 sm:aspect-auto">
            <Image src={sourcePhotoUrl} alt={copy.originalAlt} fill className="object-contain" unoptimized />
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[11px] text-white backdrop-blur-md">
              <ImageIcon size={12} />
              Original
            </span>
          </div>
          <div className="flex flex-col justify-center border-t border-border-subtle p-5 sm:border-l sm:border-t-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/80">02 / Retake</span>
            <p className="mt-2 font-display text-2xl text-ink">{copy.uploadStep}</p>
            <ArrowDown size={18} className="mt-5 text-gold" />
          </div>
        </div>
      )}
    </section>
  );
}
