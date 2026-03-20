'use client';

import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function getUpdatesCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Update Log',
      title: '公開ギャラリーと審査フローを追加',
      intro:
        '今回の更新では、イメージギャラリーをサイト全体で閲覧できる公開モードへ切り替え、投稿審査、ゲスト制限、履歴フィルターの視認性改善までまとめて反映しました。',
      date: '2026-03-20',
      sections: [
        {
          title: '公開ギャラリー',
          items: [
            'ギャラリーをローカル保存からサーバー管理へ移行',
            '承認済み作品だけをサイト全体で閲覧可能に変更',
            'カード右下に作者表示を追加し、カード情報量を整理',
          ],
        },
        {
          title: '審査と投稿ルール',
          items: [
            'ギャラリー追加時に画像審査を実行',
            '追加時はお気に入りにも自動保存',
            'ゲストは閲覧のみ可能で、投稿はログイン後に限定',
          ],
        },
        {
          title: '履歴ページ改善',
          items: [
            '暗色テーマで日付ピッカーが見えにくい問題を修正',
            '日付入力の横幅と表示を調整し、値欠けを改善',
            'フィルター領域のレイアウトを狭い幅でも崩れにくく調整',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/update-log-2026-03-20-gallery.md',
      backHome: 'Back home',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Update Log',
      title: 'Public Gallery and Moderation Flow',
      intro:
        'This release turns the image gallery into a site-wide public surface, adds moderation on submission, restricts guests to browsing only, and fixes the dark-mode date filters in history.',
      date: '2026-03-20',
      sections: [
        {
          title: 'Public Gallery',
          items: [
            'Moved gallery state from local storage to backend-managed data',
            'Only approved submissions are shown in the site-wide public gallery',
            'Gallery cards were tightened up and now show the author badge on the image',
          ],
        },
        {
          title: 'Moderation Rules',
          items: [
            'Image moderation now runs when a user submits a critique to the gallery',
            'Submitting to gallery also saves the critique to favorites by default',
            'Guests can browse the public gallery but cannot submit to it',
          ],
        },
        {
          title: 'History Filter UI',
          items: [
            'Improved dark-theme visibility for native date pickers',
            'Adjusted date field sizing so values no longer clip',
            'Rebalanced the filter layout for narrower widths',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/update-log-2026-03-20-gallery.md',
      backHome: 'Back home',
    };
  }

  return {
    label: 'Update Log',
    title: '公开长廊与审核流程更新',
    intro:
      '这次更新把影像长廊从本地私有收藏改成了全站可浏览的公开长廊，同时接入加入长廊后的图片审核、游客只读限制，以及历史页日期筛选的可读性修复。',
    date: '2026-03-20',
    sections: [
      {
        title: '公开影像长廊',
        items: [
          '影像长廊从前端本地存储切换为后端统一管理',
          '只有审核通过的作品会出现在全站公开长廊',
          '长廊卡片缩小重排，并在图片右下角显示作者标识',
        ],
      },
      {
        title: '审核与投稿规则',
        items: [
          '用户点击加入长廊时触发图片审核',
          '加入长廊会默认同步加入收藏',
          '游客可以浏览公开长廊，但不能提交到长廊',
        ],
      },
      {
        title: '历史页筛选优化',
        items: [
          '修复暗色主题下日期选择器对比度不足的问题',
          '调整日期输入框宽度与字体，避免日期被截断',
          '收紧筛选区布局，窄宽度下也更稳定',
        ],
      },
    ],
    docLabel: '文档路径',
    docPath: 'docs/update-log-2026-03-20-gallery.md',
    backHome: '返回首页',
  };
}

export default function UpdatesPage() {
  const { locale } = useI18n();
  const copy = getUpdatesCopy(locale);

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-4xl px-6 py-14 animate-fade-in">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 text-xs uppercase tracking-[0.32em] text-gold/70">{copy.label}</p>
          <h1 className="font-display text-4xl sm:text-5xl text-ink">{copy.title}</h1>
          <p className="mt-4 text-sm leading-7 text-ink-muted">{copy.intro}</p>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.1),transparent_38%),rgba(18,16,13,0.8)]">
          <div className="border-b border-border-subtle px-6 py-5">
            <div className="flex items-center gap-3 text-sm text-ink">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-gold">
                <Clock3 size={16} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-gold/70">Release</p>
                <p className="font-mono text-sm text-ink-muted">{copy.date}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="grid gap-5 md:grid-cols-3">
              {copy.sections.map((section) => (
                <article
                  key={section.title}
                  className="rounded-[22px] border border-border-subtle bg-raised/55 p-5"
                >
                  <h2 className="font-display text-2xl text-ink">{section.title}</h2>
                  <div className="mt-4 space-y-3">
                    {section.items.map((item) => (
                      <p key={item} className="flex gap-3 text-sm leading-7 text-ink-muted">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/80" />
                        <span>{item}</span>
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-border px-4 py-2 text-sm text-ink-muted">
                {copy.docLabel}: <span className="font-mono text-ink">{copy.docPath}</span>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light"
              >
                {copy.backHome}
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
