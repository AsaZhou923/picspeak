'use client';

import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function getUpdatesCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Update Log',
      title: '採点基準の統一とギャラリー表示を更新',
      intro:
        '2026年3月24日から、新しい評価ではより厳格な採点基準を使い、flash と pro は同じ採点パスを共有します。公開ギャラリーには新しい「おすすめ」表示も追加されました。',
      date: '2026-03-24',
      sections: [
        {
          title: '採点ロジック',
          items: [
            '採点リクエストの temperature を 0 に下げ、スコアのぶれを抑制',
            'まずスコアを確定し、その後で mode ごとの文章を生成する二段階フローに変更',
            'flash と pro は同じ採点結果を共有し、違いは説明の深さに限定',
          ],
        },
        {
          title: 'Mode ごとの出力',
          items: [
            'flash は短い要約と実行しやすい改善提案を返す',
            'pro はより詳しい分析と背景説明を返す',
            '文量は分かれても、最終スコアは同一基準で固定される',
          ],
        },
        {
          title: 'ギャラリー表示',
          items: [
            '公開ギャラリーは引き続き絶対スコアの足切りを使わない',
            '新しく「おすすめ」ラベルを追加し、相対的に上位の作品を表示',
            '同じ image_type の標本が少ない場合は、全体分布で補正して判定',
          ],
        },
        {
          title: 'バージョン管理',
          items: [
            '新しい評価結果には `score_version` を保存し、現行は `score-v2-strict`',
            '旧データは `legacy` として扱い、既存結果はそのまま保持',
            'ギャラリー上部に、2026年3月24日から採点基準が変わったことを常時表示',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
      backHome: 'Back home',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Update Log',
      title: 'Scoring Standard and Gallery Ranking Updated',
      intro:
        'Starting March 24, 2026, new critiques use a stricter shared scoring pass for both flash and pro. The public gallery also adds a relative recommendation badge without reintroducing a hard score gate.',
      date: '2026-03-24',
      sections: [
        {
          title: 'Scoring Flow',
          items: [
            'Lowered the scoring request temperature to `0` to reduce score variance',
            'Split critique generation into two passes: locked scoring first, writing second',
            'Flash and pro now share the same scoring result instead of drifting apart with different writing depth',
          ],
        },
        {
          title: 'Mode Output',
          items: [
            'Flash now returns a shorter summary-style critique',
            'Pro returns a more expanded analysis with the same locked score',
            'Writing depth differs by mode, but scoring standards stay aligned',
          ],
        },
        {
          title: 'Gallery Recommendation',
          items: [
            'The public gallery still has no hard minimum-score requirement',
            'Added a new recommended badge based on relative percentile instead of an absolute cutoff',
            'Recommendation uses same-image-type distribution first and falls back to the global gallery distribution when needed',
          ],
        },
        {
          title: 'Versioning and UX',
          items: [
            'New review results now include `score_version`, currently `score-v2-strict`',
            'Legacy reviews remain preserved and are treated as `legacy`',
            'The gallery now shows a persistent notice explaining that the scoring standard changed on March 24, 2026',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
      backHome: 'Back home',
    };
  }

  return {
    label: 'Update Log',
    title: '评分标准与长廊推荐逻辑升级',
    intro:
      '从 2026 年 3 月 24 日开始，新评图会使用更严格的新评分标准，并且 flash 与 pro 共用同一轮锁定分数。公开长廊也新增了基于相对分位的推荐标记。',
    date: '2026-03-24',
    sections: [
      {
        title: '评分流程',
        items: [
          '评分请求温度下调到 `0`，降低同图重复评测时的随机波动',
          '评图流程拆成“先评分、后写文案”两步，先锁定分数再生成点评',
          'flash 与 pro 共用同一轮评分结果，不再因为文案深度不同而直接拉开分差',
        ],
      },
      {
        title: '模式输出',
        items: [
          'flash 现在输出更短的摘要式短评',
          'pro 输出更完整、更展开的分析',
          '两种模式的差异主要保留在文案深度，不再体现在评分口径上',
        ],
      },
      {
        title: '长廊展示',
        items: [
          '公开长廊继续不设置硬性分数门槛',
          '新增“推荐”标记，基于相对分位而不是绝对分数筛出当前更靠前的作品',
          '推荐优先按同 `image_type` 分布计算，样本不足时回退到全局长廊分布',
        ],
      },
      {
        title: '版本与提示',
        items: [
          '新评图结果新增 `score_version`，当前版本为 `score-v2-strict`',
          '旧作品继续保留原结果，并按 `legacy` 版本处理',
          '公开长廊增加常驻说明，明确告知用户 2026 年 3 月 24 日起评分标准已经升级',
        ],
      },
    ],
    docLabel: '文档路径',
    docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
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
