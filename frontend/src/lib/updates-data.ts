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
