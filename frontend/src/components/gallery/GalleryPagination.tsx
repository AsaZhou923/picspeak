'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';

interface GalleryPaginationProps {
  pageIndex: number;
  totalPages: number;
  totalCount: number;
  visibleStart: number;
  visibleEnd: number;
  paging: boolean;
  goToPage: (index: number) => void | Promise<void>;
  handlePrevPage: () => void;
  handleNextPage: () => void | Promise<void>;
}

function buildPaginationSlots(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const slots = new Set<number>([0, totalPages - 1, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 2) {
    slots.add(1);
    slots.add(2);
    slots.add(3);
  }
  if (currentPage >= totalPages - 3) {
    slots.add(totalPages - 2);
    slots.add(totalPages - 3);
    slots.add(totalPages - 4);
  }

  const ordered = Array.from(slots).filter((value) => value >= 0 && value < totalPages).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const page = ordered[index];
    const previous = ordered[index - 1];
    if (index > 0 && previous !== undefined && page - previous > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }
  return result;
}

export default function GalleryPagination({
  pageIndex,
  totalPages,
  totalCount,
  visibleStart,
  visibleEnd,
  paging,
  goToPage,
  handlePrevPage,
  handleNextPage,
}: GalleryPaginationProps) {
  const { t } = useI18n();
  const paginationSlots = useMemo(() => buildPaginationSlots(pageIndex, totalPages), [pageIndex, totalPages]);

  const hasPrevPage = pageIndex > 0;
  const hasNextPage = pageIndex < totalPages - 1;

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-[24px] border border-border-subtle bg-[linear-gradient(180deg,rgba(248,244,238,0.72),rgba(236,230,221,0.92))] px-4 py-4 shadow-[0_14px_34px_rgba(120,96,68,0.08)] sm:flex-row sm:items-center sm:justify-between dark:border-[rgba(208,186,146,0.12)] dark:bg-[linear-gradient(180deg,rgba(31,28,24,0.9),rgba(18,17,15,0.96))] dark:shadow-[0_14px_40px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col items-center gap-2 text-center sm:items-start sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <span className="rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-sm font-medium text-gold">
            {t('pagination_current').replace('{n}', String(pageIndex + 1))}
          </span>
          <span className="rounded-full border border-border-subtle bg-void/40 px-3 py-1 text-xs text-ink-muted">
            {t('pagination_total').replace('{n}', String(totalPages))}
          </span>
        </div>
        <p className="text-xs tracking-[0.08em] text-ink-subtle">
          {totalCount <= 0
            ? t('pagination_showing_empty')
            : t('pagination_showing')
                .replace('{from}', String(visibleStart))
                .replace('{to}', String(visibleEnd))
                .replace('{total}', String(totalCount))}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:items-end">
        <div className="flex items-center justify-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => void goToPage(0)}
            disabled={pageIndex === 0 || paging}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            {t('pagination_first')}
          </button>
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={!hasPrevPage || paging}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            {t('pagination_previous')}
          </button>
          <button
            type="button"
            onClick={() => void handleNextPage()}
            disabled={!hasNextPage || paging}
            className="inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
          >
            {paging ? t('reviews_loading_more') : t('pagination_next')}
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => void goToPage(totalPages - 1)}
            disabled={pageIndex === totalPages - 1 || paging}
            className="inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
          >
            {t('pagination_last')}
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
          {paginationSlots.map((slot, index) =>
            slot === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="inline-flex h-10 min-w-10 items-center justify-center px-2 text-sm text-ink-subtle"
              >
                ...
              </span>
            ) : (
              <button
                key={slot}
                type="button"
                onClick={() => void goToPage(slot)}
                disabled={paging}
                aria-current={slot === pageIndex ? 'page' : undefined}
                className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm transition-colors disabled:opacity-40 ${
                  slot === pageIndex
                    ? 'border-gold/35 bg-gold text-void shadow-[0_10px_24px_rgba(200,162,104,0.22)]'
                    : 'border-border bg-void/35 text-ink-muted hover:border-gold/35 hover:text-gold'
                }`}
              >
                {slot + 1}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
