export type UpdateLocale = 'zh' | 'en' | 'ja';

export interface ProductUpdateSection {
  title: string;
  items: string[];
}

export interface ProductUpdateEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  docPath: string;
  sections?: ProductUpdateSection[];
}

export function getProductUpdates(locale: UpdateLocale): ProductUpdateEntry[] {
  if (locale === 'ja') {
    return [
      {
        id: '2026-04-01-audit-score-gallery-polish',
        date: '2026-04-01',
        title: '審査基準・スコア表現・ギャラリー表示を調整',
        summary:
          '公開ギャラリーの審査を過度に厳しくしすぎないよう見直し、レビュー結果のスコア文言を 10 段階に細分化し、ギャラリーカードの横写真表示を安定化しました。',
        docPath: 'docs/changelog/update-log-2026-04-01-audit-score-gallery-polish.md',
        sections: [
          {
            title: '公開ギャラリー審査',
            items: [
              '審査 prompt を「明確な違反のみ unsafe」とする方針に更新',
              '水着、ファッション、非露点の密着衣装、芸術的な人体表現などは通常 safe 扱いに調整',
              '判断が曖昧な場合は safe 寄りに倒し、公開ギャラリーでの誤ブロックを減らした',
            ],
          },
          {
            title: 'レビュー結果の表現',
            items: [
              '最終スコアを 1 から 10 の整数帯に丸めて専用ラベルへマッピング',
              '日本語・英語・中国語で 10 段階のスコア文言を追加',
            ],
          },
          {
            title: 'ギャラリー表示',
            items: [
              'ギャラリーカードを `object-contain` ベースに統一し、横写真の切り抜きを回避',
              '審査 prompt の回帰テストと `.vercel` / ローカル環境ファイルの ignore も追加',
            ],
          },
        ],
      },
      {
        id: '2026-03-28-home-review-gallery-refresh',
        date: '2026-03-28',
        title: 'ホーム・レビュー・ギャラリー体験を一括で調整',
        summary:
          'ホームのヘッダー統一、サインアップ導線の追加、レビュー詳細の表示修正、公開ギャラリーのページングとサムネイル運用をまとめて改善しました。',
        docPath: 'docs/changelog/update-log-2026-03-28-home-review-gallery-refresh.md',
        sections: [
          {
            title: 'ホーム体験',
            items: [
              'ホームのヘッダーをアプリ標準の見た目に統一',
              'ログインに加えてサインアップ導線を追加し、アバター表示と Pro カードの tips 切れも修正',
              'FAQ、認証導線、背景演出は引き続き遅延マウントで首屏負荷を抑制',
            ],
          },
          {
            title: 'レビュー詳細',
            items: [
              '1 件の改善提案が記号で複数カードに分裂する問題を修正',
              'レビュー詳細ではローカルのアップロードプレビューを優先して画像欠落を減少',
            ],
          },
          {
            title: '公開ギャラリー',
            items: [
              '先頭 / 末尾 / ページ番号ジャンプを含むページング UI を追加',
              '公開ギャラリー用サムネイルの生成・長期キャッシュ・回填スクリプトを追加',
            ],
          },
        ],
      },
      {
        id: '2026-03-27-gallery-navigation-and-filters',
        date: '2026-03-27',
        title: '公開ギャラリーの復元と絞り込みを強化',
        summary:
          '公開ギャラリーに履歴ページと同じ絞り込みを追加し、URL 同期、戻る復元、サムネイル読み込み整理までまとめて補強しました。',
        docPath: 'docs/changelog/update-log-2026-03-27-gallery-navigation-and-filters.md',
        sections: [
          {
            title: 'ギャラリー絞り込み',
            items: [
              '公開ギャラリーに開始日・終了日・最小スコア・最大スコア・写真タイプの絞り込みを追加',
              '絞り込み UI は履歴ページと同じ操作モデルに統一',
              'バックエンドの `/gallery` も同じ条件で結果と件数を返すように更新',
            ],
          },
          {
            title: '戻る動作と履歴復元',
            items: [
              '詳細に入る前のページ、読み込み済みカード、スクロール位置を保存',
              '戻るボタンとブラウザの前進/後退の両方で現在のギャラリー状態を復元',
              '復元状態は現在の絞り込み条件ごとに分離し、別の結果セットと混ざらないようにした',
            ],
          },
          {
            title: '画像読み込み整理',
            items: [
              'ギャラリーカードは原寸画像ではなく `photo_thumbnail_url` のみを使用',
              'カード表示のために原寸画像を先に取りにいかないよう整理',
              '画質は維持しつつ、一覧表示の帯域消費を抑制',
            ],
          },
        ],
      },
      {
        id: '2026-03-25-pro-launch-checkout',
        date: '2026-03-25',
        title: 'Pro 初回キャンペーンと直接チェックアウトを整理',
        summary:
          'Pro の初回価格表現を統一し、各ページの導線を補強し、購入ボタンを直接チェックアウトに接続しました。',
        docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
      },
      {
        id: '2026-03-24-score-upgrade',
        date: '2026-03-24',
        title: '新しい採点口径とギャラリー推薦表示を導入',
        summary:
          'flash と pro の採点口径を揃え、公開ギャラリーに score version と推薦ロジックを追加しました。',
        docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
      },
      {
        id: '2026-03-22-gallery-likes',
        date: '2026-03-22',
        title: '公開ギャラリーのいいねと SEO を追加',
        summary:
          '公開ギャラリーに永続化されたいいねを追加し、同時に公開ページの SEO 設定も整えました。',
        docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
      },
      {
        id: '2026-03-21-strict-scoring',
        date: '2026-03-21',
        title: '厳しめの採点 prompt とギャラリー総数表示を修正',
        summary:
          'AI 採点 prompt を引き締め、公開ギャラリーの総件数表示が先頭ページでも正しく出るように修正しました。',
        docPath: 'docs/changelog/update-log-2026-03-21-strict-scoring.md',
      },
      {
        id: '2026-03-20-gallery',
        date: '2026-03-20',
        title: '公開ギャラリーの閲覧・審査・ページングを整備',
        summary:
          '公開ギャラリーを本格導入し、審査、ゲスト閲覧、長廊カード、ページング体験をまとめて整えました。',
        docPath: 'docs/changelog/update-log-2026-03-20-gallery.md',
      },
      {
        id: '2026-03-20-history-and-favorites',
        date: '2026-03-20',
        title: '履歴・共有・再分析・お気に入りを接続',
        summary:
          '履歴ページの絞り込み、共有、エクスポート、再分析、お気に入りを前後端でつなぎ込みました。',
        docPath: 'docs/changelog/update-log-2026-03-20.md',
      },
    ];
  }

  if (locale === 'en') {
    return [
      {
        id: '2026-04-01-audit-score-gallery-polish',
        date: '2026-04-01',
        title: 'Moderation, Score Labels, and Gallery Cards Refined',
        summary:
          'Relaxed public-gallery moderation for clearly allowed borderline content, expanded review score labels to 10 localized tiers, and stabilized gallery cards for landscape images.',
        docPath: 'docs/changelog/update-log-2026-04-01-audit-score-gallery-polish.md',
        sections: [
          {
            title: 'Public Gallery Moderation',
            items: [
              'Updated the audit prompt so only clearly disallowed content is marked unsafe',
              'Treat swimwear, fashion shoots, non-explicit tight clothing, and artistic body expression as safe by default',
              'Bias uncertain cases toward safe to reduce over-blocking in the public gallery',
            ],
          },
          {
            title: 'Review Score Labels',
            items: [
              'Round final scores into 1 to 10 buckets and map them to dedicated labels',
              'Added full 10-tier score copy across Chinese, English, and Japanese',
            ],
          },
          {
            title: 'Gallery Cards',
            items: [
              'Unified gallery cards around an `object-contain` image treatment so landscape photos are not cropped away',
              'Added prompt regression coverage and ignored `.vercel` plus local env files in Git',
            ],
          },
        ],
      },
      {
        id: '2026-03-28-home-review-gallery-refresh',
        date: '2026-03-28',
        title: 'Home, Review, and Gallery Experience Refresh',
        summary:
          'Unified the home header with the app shell, added a sign-up entry, fixed review-detail display issues, and improved public gallery paging and thumbnail delivery.',
        docPath: 'docs/changelog/update-log-2026-03-28-home-review-gallery-refresh.md',
        sections: [
          {
            title: 'Home Experience',
            items: [
              'Aligned the home header with the standard in-app header',
              'Added a sign-up action beside sign-in and fixed avatar / Pro card tip clipping',
              'Kept FAQ, auth entry points, and background effects lazily mounted to protect first load',
            ],
          },
          {
            title: 'Review Detail',
            items: [
              'Stopped a single improvement suggestion from being split into multiple cards by punctuation',
              'Prefer locally cached upload previews on the review page to reduce missing-image cases',
            ],
          },
          {
            title: 'Public Gallery',
            items: [
              'Added first / last / page-number pagination controls with visible range feedback',
              'Generated dedicated gallery thumbnails with long-lived caching and added a backfill script',
            ],
          },
        ],
      },
      {
        id: '2026-03-27-gallery-navigation-and-filters',
        date: '2026-03-27',
        title: 'Public Gallery Navigation and Filters Updated',
        summary:
          'The public gallery now supports history-style filters, URL-synced state, reliable return-position restoration, and thumbnail-only card loading.',
        docPath: 'docs/changelog/update-log-2026-03-27-gallery-navigation-and-filters.md',
        sections: [
          {
            title: 'Gallery Filters',
            items: [
              'Added date range, min score, max score, and image-type filters to the public gallery',
              'Matched the filter interaction model used in review history',
              'Updated the backend `/gallery` route so both result rows and `total_count` follow the active filters',
            ],
          },
          {
            title: 'Back Navigation Recovery',
            items: [
              'Saved page, loaded items, and scroll position before opening a gallery detail page',
              'Restored gallery state for both in-page back buttons and browser back/forward navigation',
              'Scoped restore data by the active filter set so different gallery result sets do not overwrite each other',
            ],
          },
          {
            title: 'Thumbnail Loading',
            items: [
              'Gallery cards now render only from `photo_thumbnail_url`',
              'Removed the original-image-first loading path from the gallery list',
              'Kept gallery cards visually sharp while reducing unnecessary image transfer',
            ],
          },
        ],
      },
      {
        id: '2026-03-25-pro-launch-checkout',
        date: '2026-03-25',
        title: 'Pro Launch Offer and Direct Checkout Updated',
        summary:
          'Standardized the launch-offer messaging, expanded Pro entry points, and sent purchase buttons straight to checkout.',
        docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
      },
      {
        id: '2026-03-24-score-upgrade',
        date: '2026-03-24',
        title: 'Scoring Upgrade and Gallery Recommendation Logic',
        summary:
          'Unified scoring behavior across modes and added score-version-aware recommendation logic to the public gallery.',
        docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
      },
      {
        id: '2026-03-22-gallery-likes',
        date: '2026-03-22',
        title: 'Public Gallery Likes and SEO Improvements',
        summary:
          'Added persistent gallery likes for signed-in users and tightened SEO metadata for public-facing pages.',
        docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
      },
      {
        id: '2026-03-21-strict-scoring',
        date: '2026-03-21',
        title: 'Stricter Scoring Prompt and Correct Gallery Count',
        summary:
          'Tightened the AI scoring prompt and fixed the gallery header so the total count is correct from page one.',
        docPath: 'docs/changelog/update-log-2026-03-21-strict-scoring.md',
      },
      {
        id: '2026-03-20-gallery',
        date: '2026-03-20',
        title: 'Public Gallery Browsing, Moderation, and Paging',
        summary:
          'Rolled out the public gallery workflow with moderation, guest browsing, gallery cards, and stable paging behavior.',
        docPath: 'docs/changelog/update-log-2026-03-20-gallery.md',
      },
      {
        id: '2026-03-20-history-and-favorites',
        date: '2026-03-20',
        title: 'History, Sharing, Replay, and Favorites Connected',
        summary:
          'Connected history filtering, sharing, export, replay analysis, and favorites across the frontend and backend.',
        docPath: 'docs/changelog/update-log-2026-03-20.md',
      },
    ];
  }

  return [
    {
      id: '2026-04-01-audit-score-gallery-polish',
      date: '2026-04-01',
      title: '公开长廊审核、评分文案与卡片展示同步细化',
      summary:
        '放宽公开长廊对边界安全内容的误杀，补齐评图结果 10 档本地化标签，并让长廊横图在卡片里稳定完整展示。',
      docPath: 'docs/changelog/update-log-2026-04-01-audit-score-gallery-polish.md',
      sections: [
        {
          title: '公开长廊审核',
          items: [
            '审核 prompt 改为只拦截明确违规内容，减少误判',
            '泳装、时尚摄影、非露点贴身服装和艺术化人体表达默认倾向 safe',
            '判断不明确时优先放行，降低公开长廊误杀',
          ],
        },
        {
          title: '评图结果文案',
          items: [
            '最终得分按 1 到 10 的整数档位映射到专属标签',
            '中文、英文、日文都补齐了 10 档评分总结语',
          ],
        },
        {
          title: '长廊卡片展示',
          items: [
            '长廊卡片统一改为 `object-contain`，横图不再被直接裁切',
            '同时补上审核 prompt 测试，并忽略 `.vercel` 与本地环境文件',
          ],
        },
      ],
    },
    {
      id: '2026-03-28-home-review-gallery-refresh',
      date: '2026-03-28',
      title: '首页、评图与长廊体验一轮整理',
      summary:
        '统一首页顶栏样式，补上注册入口并修复头像与 Pro 卡片展示细节，同时完善评图详情展示和公开长廊分页、缩略图链路。',
      docPath: 'docs/changelog/update-log-2026-03-28-home-review-gallery-refresh.md',
      sections: [
        {
          title: '首页体验',
          items: [
            '首页顶栏已与应用内标准 Header 统一',
            '新增注册入口，并修复头像显示与 Pro 卡片底部 tips 截断',
            'FAQ、认证入口和背景特效继续保持延迟挂载，控制首页负载',
          ],
        },
        {
          title: '评图详情',
          items: [
            '修复单条改进建议被分号拆成多张卡片的问题',
            '评图详情优先读取本地上传预览，减少图片丢失或加载失败',
          ],
        },
        {
          title: '公开长廊',
          items: [
            '新增首页、末页和页码跳转的分页控件，并展示当前区间',
            '补齐公开长廊缩略图生成、长期缓存和回填脚本链路',
          ],
        },
      ],
    },
    {
      id: '2026-03-27-gallery-navigation-and-filters',
      date: '2026-03-27',
      title: '公开影像长廊的返回恢复与筛选已补齐',
      summary:
        '公开长廊现在支持和历史页一致的筛选条件，筛选状态会进入 URL，从详情返回时也能恢复原来的分页和滚动位置。',
      docPath: 'docs/changelog/update-log-2026-03-27-gallery-navigation-and-filters.md',
      sections: [
        {
          title: '长廊筛选',
          items: [
            '公开长廊新增开始时间、结束时间、最低评分、最高评分、图片类型筛选',
            '筛选交互与“我的历史”统一，降低切换成本',
            '后端 `/gallery` 会按当前筛选返回列表和总数',
          ],
        },
        {
          title: '返回恢复',
          items: [
            '从长廊点进详情前，会保存当前筛选结果下的分页、滚动位置和点击卡片',
            '返回按钮与浏览器前进/后退键都会恢复原来的长廊状态',
            '恢复状态按筛选条件分开保存，不会互相串位',
          ],
        },
        {
          title: '图片加载',
          items: [
            '长廊卡片改为只使用 `photo_thumbnail_url`',
            '不再为了列表卡片优先请求原图',
            '在保持清晰度的前提下减少不必要的图片带宽消耗',
          ],
        },
      ],
    },
    {
      id: '2026-03-25-pro-launch-checkout',
      date: '2026-03-25',
      title: 'Pro 首发优惠与直达购买链路上线',
      summary:
        '统一了 Pro 的首发优惠表达，补强多个页面入口，并把购买按钮改成直达 checkout。',
      docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
    },
    {
      id: '2026-03-24-score-upgrade',
      date: '2026-03-24',
      title: '评分口径升级与长廊推荐逻辑更新',
      summary:
        '统一 flash 与 pro 的评分口径，并为公开长廊加入 score version 和推荐标记逻辑。',
      docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
    },
    {
      id: '2026-03-22-gallery-likes',
      date: '2026-03-22',
      title: '公开长廊点赞与 SEO 优化上线',
      summary:
        '公开长廊新增持久化点赞，同时补齐公开页面的 SEO metadata、robots 与 sitemap 策略。',
      docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
    },
    {
      id: '2026-03-21-strict-scoring',
      date: '2026-03-21',
      title: '更严格的评分 prompt 与长廊总数修复',
      summary:
        '收紧了 AI 评图评分标准，并修复影像长廊头部“已收录”数字在第一页显示不正确的问题。',
      docPath: 'docs/changelog/update-log-2026-03-21-strict-scoring.md',
    },
    {
      id: '2026-03-20-gallery',
      date: '2026-03-20',
      title: '公开影像长廊浏览、审核与分页体验打通',
      summary:
        '补齐了公开长廊的浏览、审核、游客只读、卡片展示和分页体验。',
      docPath: 'docs/changelog/update-log-2026-03-20-gallery.md',
    },
    {
      id: '2026-03-20-history-and-favorites',
      date: '2026-03-20',
      title: '历史记录、分享、再分析与收藏能力接通',
      summary:
        '把历史筛选、分享导出、再次分析和收藏能力从后端真正接到了前端。',
      docPath: 'docs/changelog/update-log-2026-03-20.md',
    },
  ];
}
