import { localeToIntlLocale, normalizeLocale } from './locale';
import type { ImageType } from './types';

/**
 * Localized copy for the account reviews history page.
 *
 * Previously this text lived inline in `app/account/reviews/page.tsx` as four
 * `getXxxCopy(locale)` functions plus a couple of stray `locale === ...`
 * ternaries. It follows the same pattern as `lib/pro-conversion.ts`: one
 * `COPY` record keyed by locale, with thin accessor functions as the public
 * API so callers pass a raw locale string.
 */

export type ReviewHistoryLocale = 'zh' | 'en' | 'ja';

export type ReviewHistoryCopy = {
  filtersLabel: string;
  from: string;
  to: string;
  minScore: string;
  maxScore: string;
  imageType: string;
  allTypes: string;
  apply: string;
  reset: string;
  shared: string;
  followUp: string;
  galleryRejected: string;
  invalidDate: string;
};

export type ReviewHistoryGrowthCopy = {
  label: string;
  title: string;
  body: string;
  recentAverage: string;
  previousAverage: string;
  recentList: string;
  commonGaps: string;
  trendUp: string;
  trendDown: string;
  trendFlat: string;
  averageLabel: string;
  lowCountLabel: (count: number) => string;
  emptyPrevious: string;
};

export type PracticeThemeIntensity = 'recover' | 'stabilize' | 'extend';

export type ReviewHistoryPracticeThemeCopy = {
  windowLabel: string;
  practiceLabel: string;
  title: string;
  body: string;
  noWeak: string;
};

type LocaleCopy = {
  history: ReviewHistoryCopy;
  growth: ReviewHistoryGrowthCopy;
  /** Static label map for each image type shown in filters and cards. */
  imageTypeLabels: Record<ImageType, string>;
};

const COPY: Record<ReviewHistoryLocale, LocaleCopy> = {
  zh: {
    history: {
      filtersLabel: '筛选条件',
      from: '开始时间',
      to: '结束时间',
      minScore: '最低评分',
      maxScore: '最高评分',
      imageType: '图片类型',
      allTypes: '全部类型',
      apply: '应用筛选',
      reset: '重置',
      shared: '已分享',
      followUp: '关联复盘',
      galleryRejected: '长廊审核未通过',
      invalidDate: '请输入有效日期，格式为 yyyy/mm/dd',
    },
    growth: {
      label: '连续进步',
      title: '把最近 3 次点评连成一条线看',
      body: '先看平均分有没有往上走，再看哪些维度在反复拖后腿。',
      recentAverage: '最近 3 次均分',
      previousAverage: '之前 3 次均分',
      recentList: '最近 3 次点评',
      commonGaps: '反复掉分的维度',
      trendUp: '比上一轮更稳',
      trendDown: '比上一轮更弱',
      trendFlat: '还在平台期',
      averageLabel: '均分',
      lowCountLabel: (count: number) => `${count} 次低于 7 分`,
      emptyPrevious: '还没有足够的上一轮数据可供对比',
    },
    imageTypeLabels: {
      default: '默认',
      landscape: '风景',
      portrait: '人像',
      street: '街拍',
      still_life: '静物',
      architecture: '建筑',
    },
  },
  en: {
    history: {
      filtersLabel: 'Filters',
      from: 'From',
      to: 'To',
      minScore: 'Min score',
      maxScore: 'Max score',
      imageType: 'Image type',
      allTypes: 'All types',
      apply: 'Apply',
      reset: 'Reset',
      shared: 'Shared',
      followUp: 'Linked replay',
      galleryRejected: 'Gallery rejected',
      invalidDate: 'Enter a valid date in yyyy/mm/dd format',
    },
    growth: {
      label: 'Growth Loop',
      title: 'Read the last three critiques as one loop',
      body: 'Check whether the average is moving up first, then which dimensions keep slipping below a good score.',
      recentAverage: 'Recent 3 average',
      previousAverage: 'Previous 3 average',
      recentList: 'Most recent three critiques',
      commonGaps: 'Dimensions that keep dragging',
      trendUp: 'Stronger than the previous batch',
      trendDown: 'Weaker than the previous batch',
      trendFlat: 'Still flat',
      averageLabel: 'Avg',
      lowCountLabel: (count: number) => `${count} reviews under 7`,
      emptyPrevious: 'Need three more critiques to compare the previous batch',
    },
    imageTypeLabels: {
      default: 'Default',
      landscape: 'Landscape',
      portrait: 'Portrait',
      street: 'Street',
      still_life: 'Still Life',
      architecture: 'Architecture',
    },
  },
  ja: {
    history: {
      filtersLabel: '絞り込み',
      from: '開始日',
      to: '終了日',
      minScore: '最低スコア',
      maxScore: '最高スコア',
      imageType: '写真タイプ',
      allTypes: 'すべて',
      apply: '適用',
      reset: 'リセット',
      shared: '共有済み',
      followUp: '再分析元',
      galleryRejected: 'ギャラリー審査未通過',
      invalidDate: '有効な日付を yyyy/mm/dd 形式で入力してください',
    },
    growth: {
      label: 'Growth Loop',
      title: '直近 3 回をひとつの流れで見る',
      body: '平均点が上向いているか、どの次元が繰り返し足を引っ張っているかを先に確認します。',
      recentAverage: '直近 3 回の平均',
      previousAverage: 'その前 3 回の平均',
      recentList: '直近 3 回の講評',
      commonGaps: '繰り返し弱い次元',
      trendUp: '前のまとまりより上向き',
      trendDown: '前のまとまりより下振れ',
      trendFlat: 'まだ横ばい',
      averageLabel: '平均',
      lowCountLabel: (count: number) => `${count} 回で 7 未満`,
      emptyPrevious: '比較用の 3 回がまだありません',
    },
    imageTypeLabels: {
      default: '標準',
      landscape: '風景',
      portrait: 'ポートレート',
      street: 'ストリート',
      still_life: '静物',
      architecture: '建築',
    },
  },
};

export function getHistoryCopy(locale: string): ReviewHistoryCopy {
  return COPY[normalizeLocale(locale)].history;
}

export function getHistoryGrowthCopy(locale: string): ReviewHistoryGrowthCopy {
  return COPY[normalizeLocale(locale)].growth;
}

export function getImageTypeLabel(locale: string, imageType?: ImageType): string {
  const normalized = imageType ?? 'default';
  return COPY[normalizeLocale(locale)].imageTypeLabels[normalized];
}

/** BCP-47 tag (e.g. `zh-CN`) suitable for `toLocaleString` and friends. */
/**
 * BCP-47 tag (e.g. `zh-CN`) suitable for `toLocaleString` and friends.
 * Thin wrapper over the shared `localeToIntlLocale` helper.
 */
export function getHistoryIntlLocale(locale: string): string {
  return localeToIntlLocale(locale);
}

/**
 * Practice-theme copy depends on runtime context (the weak dimension label, the
 * recommended intensity, Pro vs Free, and how much history was analyzed), so it
 * is assembled per call rather than stored statically.
 */
export function getHistoryPracticeThemeCopy(
  locale: string,
  dimensionLabel: string,
  intensity: PracticeThemeIntensity,
  isPro: boolean,
  analyzedCount: number,
  totalCount: number,
): ReviewHistoryPracticeThemeCopy {
  const lc = normalizeLocale(locale);

  if (lc === 'ja') {
    const action = intensity === 'recover' ? '立て直す' : intensity === 'extend' ? '伸ばす' : '安定させる';
    return {
      windowLabel: isPro
        ? `Pro long trend · ${analyzedCount} reviews`
        : `Free recent window · ${analyzedCount}/${totalCount} reviews`,
      practiceLabel: 'Next Practice',
      title: `${dimensionLabel}を${action}`,
      body: isPro
        ? '読み込まれている履歴全体から次の練習テーマを選んでいます。'
        : 'Free では直近の履歴で傾向を読みます。長い期間の弱点変化は Pro で確認できます。',
      noWeak: '7 未満の反復弱点はまだありません。最低平均の次元を次の練習候補にしています。',
    };
  }

  if (lc === 'en') {
    const action = intensity === 'recover' ? 'recover' : intensity === 'extend' ? 'extend' : 'stabilize';
    return {
      windowLabel: isPro
        ? `Pro long trend · ${analyzedCount} reviews`
        : `Free recent window · ${analyzedCount}/${totalCount} reviews`,
      practiceLabel: 'Next Practice',
      title: `${action} ${dimensionLabel}`,
      body: isPro
        ? 'This practice theme is calculated from the loaded long-term history.'
        : 'Free reads the recent window. Pro keeps the longer trail so weak dimensions can be compared across more shoots.',
      noWeak: 'No repeated dimension is under 7 yet. The lowest average dimension becomes the next practice candidate.',
    };
  }

  const action = intensity === 'recover' ? '拉回' : intensity === 'extend' ? '继续放大' : '稳定';
  return {
    windowLabel: isPro
      ? `Pro 长周期趋势 · ${analyzedCount} 条记录`
      : `Free 最近窗口 · ${analyzedCount}/${totalCount} 条记录`,
    practiceLabel: '下一轮练习',
    title: `${action}${dimensionLabel}`,
    body: isPro
      ? '当前练习主题来自已加载的完整历史窗口，更适合观察长期弱项是否改善。'
      : 'Free 先用最近窗口判断趋势；升级 Pro 后可以用更长历史追踪弱项和复拍进步。',
    noWeak: '目前没有反复低于 7 分的维度，已用平均分最低的维度作为下一轮练习候选。',
  };
}
