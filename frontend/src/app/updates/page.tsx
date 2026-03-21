'use client';

import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function getUpdatesCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Update Log',
      title: '厳しめ採点とギャラリー件数修正',
      intro:
        '今回の更新では、AI 評価の採点基準をより厳格にし、公開ギャラリーの件数表示が最初のページから正しい総数を示すよう修正しました。',
      date: '2026-03-21',
      sections: [
        {
          title: '採点基準',
          items: [
            'review prompt を `photo-review-v4-strict` に更新',
            '一般的な写真は主に 3-6 点、7 点以上は明確な強さが必要と定義',
            'スタイル性や雰囲気だけで高得点にしないルールを追加',
          ],
        },
        {
          title: 'ギャラリー件数',
          items: [
            '`/gallery` レスポンスに総件数 `total_count` を追加',
            '上部の件数表示を読み込み済み件数から実際の総数へ変更',
            '1 ページ目で 12、次ページで 19 と見える不整合を解消',
          ],
        },
        {
          title: '履歴フィルター',
          items: [
            'ブラウザのローカライズ表示に依存せず、日付表示を `yyyy/mm/dd` に統一',
            'テキスト表示とカレンダーピッカーを分離し、末尾が `日` になる表示を解消',
            '無効な日付を入力した場合は赤枠とエラーメッセージを表示し、適用ボタンも無効化',
            '狭めの画面ではフィルターの 2 列化を遅らせ、日付欄の表示余裕を確保',
          ],
        },
        {
          title: '履歴サムネイル',
          items: [
            '履歴カードのサムネイル読み込み失敗時に、壊れた画像のまま残る不具合を修正',
            'サムネイル失敗後は元画像 URL へ正しくフォールバックするように変更',
            '元画像も失敗した場合だけ最終的な失敗状態に入るよう調整',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/update-log-2026-03-21-strict-scoring.md',
      backHome: 'Back home',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Update Log',
      title: 'Stricter Scoring and Gallery Count Fix',
      intro:
        'This release tightens the AI critique scoring rubric and fixes the public gallery header so the collected count shows the real total on the first page.',
      date: '2026-03-21',
      sections: [
        {
          title: 'Scoring Rubric',
          items: [
            'Upgraded the review prompt to `photo-review-v4-strict`',
            'Clarified that ordinary photos should mostly land in the 3-6 range',
            'Stopped style, mood, or an attractive subject from inflating scores on their own',
          ],
        },
        {
          title: 'Gallery Count',
          items: [
            'Added `total_count` to the `/gallery` response',
            'Changed the header stat to display the real total instead of the loaded-page count',
            'Fixed the issue where page one showed 12 and only page two showed the real 19',
          ],
        },
        {
          title: 'History Filters',
          items: [
            'Standardized the date display to `yyyy/mm/dd` instead of browser-localized suffixes',
            'Separated visible text formatting from the calendar picker so the day no longer renders as a localized marker',
            'Added a clear invalid-date error state and disabled Apply while the date is invalid',
            'Delayed the two-column filter layout on smaller widths to give date fields more room',
          ],
        },
        {
          title: 'History Thumbnails',
          items: [
            'Fixed the history card thumbnail flow so failed thumbnail loads no longer get stuck on a broken image',
            'Thumbnail failures now fall back to the original image URL correctly',
            'The final failed state now appears only after both thumbnail and fallback image fail',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/update-log-2026-03-21-strict-scoring.md',
      backHome: 'Back home',
    };
  }

  return {
    label: 'Update Log',
    title: '严格评分与长廊计数修复',
    intro:
      '这次更新主要收紧了 AI 评图的打分口径，同时修复了公开影像长廊头部“已收录”只显示当前页数量、翻页后才显示真实总数的问题。',
    date: '2026-03-21',
    sections: [
      {
        title: '评分标准',
        items: [
          '评图 prompt 升级为 `photo-review-v4-strict`',
          '普通照片主要落在 3-6 分区间，7 分以上需要多个维度同时扎实',
          '不再因为“电影感”“情绪感”“风格化”或题材讨喜而自动抬分',
        ],
      },
      {
        title: '长廊计数',
        items: [
          '`/gallery` 接口新增 `total_count` 返回字段',
          '长廊头部“已收录”改为显示真实总数，而不是当前已加载条数',
          '修复第一页显示 12、翻到下一页才显示 19 的问题',
        ],
      },
      {
        title: '历史筛选',
        items: [
          '历史筛选日期显示统一为 `yyyy/mm/dd`，不再跟随浏览器本地化显示成“日”',
          '将可见文本格式与日历选择器拆开，解决 `yyyy/mm/日` 这类显示问题',
          '补充了明显的非法日期提示，输入无效日期时会红框提示并禁用“应用筛选”',
          '把筛选区双列布局延后到更宽的断点，给日期字段留出更多可视空间',
        ],
      },
      {
        title: '历史缩略图',
        items: [
          '修复评图历史卡片里缩略图加载失败后一直停留在破图状态的问题',
          '缩略图失败时现在会正确回退到原图 URL，而不是继续保留失效缩略图',
          '只有缩略图和原图都失败时，才会进入最终失败态',
        ],
      },
    ],
    docLabel: '文档路径',
    docPath: 'docs/update-log-2026-03-21-strict-scoring.md',
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
          <h1 className="font-display text-4xl text-ink sm:text-5xl">{copy.title}</h1>
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
