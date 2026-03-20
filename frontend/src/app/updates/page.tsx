'use client';

import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function getUpdatesCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Update Log',
      title: '最近の更新記録',
      intro:
        '履歴・復盤・共有・再分析・お気に入りまわりの機能を、今回の更新で前後端ともに実用レベルまで接続しました。',
      date: '2026-03-20',
      sections: [
        {
          title: '履歴と復盤',
          items: [
            '履歴一覧でページングを継続利用できるように調整',
            '時間・スコア・写真タイプでの絞り込みを追加',
            '履歴カードに共有済み / 復盤連携状態を表示',
          ],
        },
        {
          title: '共有・エクスポート・再分析',
          items: [
            '結果共有はバックエンド発行の share token を使用',
            '簡版エクスポートは構造化データのダウンロードに変更',
            '前回の記録を引き継いで同じ写真から再分析できるように改善',
          ],
        },
        {
          title: 'お気に入り',
          items: [
            '結果ページでお気に入り追加 / 解除が可能',
            '新しい「お気に入り」ページを追加',
            'アバター横のドロップダウンに「お気に入り」入口を追加',
          ],
        },
      ],
      docLabel: '文档路径',
      docPath: 'docs/update-log-2026-03-20.md',
      backHome: 'ホームへ戻る',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Update Log',
      title: 'Recent Product Changes',
      intro:
        'This release finishes the practical frontend/backend loop for history, replay analysis, sharing, exports, and favorites.',
      date: '2026-03-20',
      sections: [
        {
          title: 'History and Replay',
          items: [
            'Added real pagination for review history',
            'Added filters for time range, score range, and image type',
            'History cards now surface shared state and replay linkage',
          ],
        },
        {
          title: 'Share, Export, Re-run',
          items: [
            'Share links now come from backend-issued share tokens',
            'Compact export now downloads structured backend data',
            'Re-run analysis can start directly from the previous review record',
          ],
        },
        {
          title: 'Favorites',
          items: [
            'Favorite / unfavorite actions are available on the result page',
            'Added a dedicated Favorites page',
            'Added a Favorites entry inside the avatar dropdown menu',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/update-log-2026-03-20.md',
      backHome: 'Back home',
    };
  }

  return {
    label: 'Update Log',
    title: '最近更新记录',
    intro:
      '这次更新把历史记录、复盘关联、分享、导出、再次分析和收藏能力真正接到了前端，形成了完整使用闭环。',
    date: '2026-03-20',
    sections: [
      {
        title: '历史记录与复盘',
        items: [
          '历史列表支持真实分页加载',
          '新增按时间、评分、图片类型筛选',
          '历史卡片展示分享状态与复盘关联状态',
        ],
      },
      {
        title: '分享、导出、再次分析',
        items: [
          '分享改为使用后端生成的 share token / 公开链接',
          '简版导出改为下载后端结构化结果数据',
          '支持从上一条分析记录直接再次发起评图',
        ],
      },
      {
        title: '收藏能力',
        items: [
          '结果页支持收藏 / 取消收藏',
          '新增“我的收藏”页面',
          '头像旁下拉菜单新增“我的收藏”入口',
        ],
      },
    ],
    docLabel: '文档路径',
    docPath: 'docs/update-log-2026-03-20.md',
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
