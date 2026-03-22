'use client';

import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function getUpdatesCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Update Log',
      title: 'ギャラリーに「いいね」を追加',
      intro:
        '今回の更新では、公開ギャラリーに永続化された「いいね」機能を追加し、あわせて metadata・robots・sitemap を含む SEO 調整もまとめて行いました。',
      date: '2026-03-22',
      sections: [
        {
          title: 'ギャラリーの反応',
          items: [
            '公開ギャラリーカードに「いいね」ボタンと件数表示を追加',
            '「いいね」はフロントの一時状態ではなく、バックエンドに永続保存',
            'ログイン済みユーザーはギャラリー上でそのまま「いいね」と解除を切り替え可能',
          ],
        },
        {
          title: '権限ルール',
          items: [
            'ゲストはこれまでどおり公開ギャラリーを閲覧可能',
            'ゲストが「いいね」を押した場合は、サインインが必要であることを案内',
            'バックエンドもゲストの「いいね」リクエストを `403` で拒否',
          ],
        },
        {
          title: 'SEO 調整',
          items: [
            '公開ページ向け metadata と canonical を整理',
            'アカウント、ワークスペース、タスク、共有系ページには `noindex` を適用',
            'sitemap を公開導線中心に見直し、affiliate ページの本文も強化',
          ],
        },
        {
          title: 'データと API',
          items: [
            '`review_likes` テーブルを追加して作品とユーザーの「いいね」関係を保存',
            '`/gallery` レスポンスに `like_count` と `liked_by_viewer` を追加',
            'ギャラリー作品向けの「いいね」/解除 API を追加',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
      backHome: 'Back home',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Update Log',
      title: 'Gallery Likes Added',
      intro:
        'This release adds persistent likes to the public gallery and also ships a round of SEO updates across metadata, robots, sitemap, and landing-page content.',
      date: '2026-03-22',
      sections: [
        {
          title: 'Gallery Interaction',
          items: [
            'Added a like button and visible like count to public gallery cards',
            'Likes are now stored on the backend instead of living only in frontend state',
            'Signed-in users can like and unlike directly from the gallery view',
          ],
        },
        {
          title: 'Guest Restriction',
          items: [
            'Guests can still browse the public gallery normally',
            'Guest like attempts now show a sign-in requirement in the UI',
            'The backend also rejects guest like requests with `403`',
          ],
        },
        {
          title: 'SEO Updates',
          items: [
            'Refined metadata and canonical coverage for public-facing pages',
            'Applied `noindex` rules to account, workspace, task, and other private flows',
            'Adjusted the sitemap toward public discovery pages and strengthened affiliate landing-page copy',
          ],
        },
        {
          title: 'Data and API',
          items: [
            'Added a `review_likes` table to persist user-to-review likes',
            'Extended `/gallery` items with `like_count` and `liked_by_viewer`',
            'Added like and unlike endpoints for public gallery reviews',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
      backHome: 'Back home',
    };
  }

  return {
    label: 'Update Log',
    title: '公开长廊新增点赞功能',
    intro:
      '这次更新除了给公开影像长廊加入可持久化点赞能力，也同步补了一轮 SEO 优化，统一了 metadata、robots 与 sitemap 策略。',
    date: '2026-03-22',
    sections: [
      {
        title: '长廊互动',
        items: [
          '公开长廊卡片新增点赞按钮与点赞数展示',
          '点赞改为后端持久化存储，不再只是前端临时状态',
          '已登录用户可以直接在长廊页完成点赞与取消点赞',
        ],
      },
      {
        title: '游客权限',
        items: [
          '游客仍然可以正常浏览公开影像长廊',
          '游客点击点赞时，前端会提示需要登录',
          '后端也会对游客点赞请求返回 `403`，避免绕过前端限制',
        ],
      },
      {
        title: 'SEO 优化',
        items: [
          '公开页面补充更完整的 metadata 与 canonical',
          '账户、工作台、任务、分享等私有页面统一加 `noindex`',
          '调整 sitemap 公开页面权重，并补强 affiliate 落地页内容',
        ],
      },
      {
        title: '数据与接口',
        items: [
          '新增 `review_likes` 表保存用户与作品的点赞关系',
          '`/gallery` 返回新增 `like_count` 和 `liked_by_viewer`',
          '新增公开长廊点赞与取消点赞接口',
        ],
      },
    ],
    docLabel: '文档路径',
    docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
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
