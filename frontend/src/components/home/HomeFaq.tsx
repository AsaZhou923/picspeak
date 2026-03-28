'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';

const FAQ_KEYS = [
  { q: 'faq_q1' as const, a: 'faq_a1' as const },
  { q: 'faq_q2' as const, a: 'faq_a2' as const },
  { q: 'faq_q3' as const, a: 'faq_a3' as const },
  { q: 'faq_q4' as const, a: 'faq_a4' as const },
  { q: 'faq_q5' as const, a: 'faq_a5' as const },
  { q: 'faq_q6' as const, a: 'faq_a6' as const },
  { q: 'faq_q7' as const, a: 'faq_a7' as const },
  { q: 'faq_q8' as const, a: 'faq_a8' as const },
  { q: 'faq_q9' as const, a: 'faq_a9' as const },
  { q: 'faq_q10' as const, a: 'faq_a10' as const },
];

export default function HomeFaq() {
  const { t } = useI18n();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {FAQ_KEYS.map(({ q, a }, index) => {
        const isOpen = openFaq === index;
        return (
          <div
            key={q}
            className={`border rounded-lg overflow-hidden transition-colors duration-200 ${
              isOpen ? 'border-gold/40 bg-raised/50' : 'border-border-subtle bg-raised/20 hover:border-border'
            }`}
          >
            <button
              className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
              onClick={() => setOpenFaq(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <span className="text-sm font-medium text-ink leading-snug">{t(q)}</span>
              <ChevronDown
                size={16}
                className={`text-gold shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="px-6 pb-5 text-sm text-ink-muted leading-relaxed border-t border-border-subtle pt-4">
                {t(a)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
