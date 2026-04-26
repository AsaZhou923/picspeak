import type { TranslationKey } from './i18n-zh';
import type { ReviewScores, UsageResponse } from './types';
import typeDimDescriptions from '@/content/review/dim-descriptions.json';

export type CritiqueImageType = 'default' | 'landscape' | 'portrait' | 'street' | 'still_life' | 'architecture';
export type DimKey = 'composition' | 'lighting' | 'color' | 'impact' | 'technical';
export type TagKey = 'pre' | 'post' | 'composition' | 'timing' | 'exposure' | 'focus';
export type TagRule = {
  title: RegExp[];
  strong: RegExp[];
  weak?: RegExp[];
  minWeakMatches?: number;
};

const TYPE_DIM_DESC = typeDimDescriptions as Record<'zh' | 'en' | 'ja', Record<CritiqueImageType, Record<DimKey, string>>>;

export function getDimDescByType(locale: string, imageType: string, dim: DimKey): string {
  const lang = locale === 'en' || locale === 'ja' ? locale : 'zh';
  const normalizedType = (['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'] as const)
    .includes(imageType as CritiqueImageType)
    ? (imageType as CritiqueImageType)
    : 'default';
  return TYPE_DIM_DESC[lang][normalizedType][dim];
}

export function generateScoreSummary(
  scores: ReviewScores,
  dims: { key: string; label: string }[],
  locale: string,
): string {
  const sorted = [...dims].sort(
    (a, b) =>
      (scores as unknown as Record<string, number>)[b.key] -
      (scores as unknown as Record<string, number>)[a.key],
  );
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (locale === 'zh') return `${top.label}为本次亮点，${bottom.label}有提升空间`;
  if (locale === 'ja') return `${top.label}が際立っており、${bottom.label}を伸ばす余地があります`;
  return `${top.label} is the highlight; ${bottom.label} has room to grow`;
}

export function getDimColorClass(score: number): string {
  if (score >= 7.5) return 'bg-sage';
  if (score >= 5.5) return 'bg-gold';
  return 'bg-rust';
}

export function getDimTextClass(score: number): string {
  if (score >= 7.5) return 'text-sage';
  if (score >= 5.5) return 'text-gold';
  return 'text-rust';
}

export function getScoreLabelColor(score: number): string {
  if (score >= 7.5) return 'text-sage';
  if (score >= 5.5) return 'text-gold';
  return 'text-rust';
}

export function getEffectiveQuota(
  usage: UsageResponse | null,
  reviewMode: 'flash' | 'pro'
): { remaining: number | null; total: number | null } {
  if (!usage) {
    return { remaining: null, total: null };
  }

  const candidates: Array<{ remaining: number; total: number }> = [];
  const {
    daily_remaining,
    daily_total,
    monthly_remaining,
    monthly_total,
    pro_monthly_remaining,
    pro_monthly_total,
  } = usage.quota;

  if (daily_remaining !== null && daily_total !== null) {
    candidates.push({ remaining: daily_remaining, total: daily_total });
  }
  if (monthly_remaining !== null && monthly_total !== null) {
    candidates.push({ remaining: monthly_remaining, total: monthly_total });
  }
  if (reviewMode === 'pro' && pro_monthly_remaining !== null && pro_monthly_total !== null) {
    candidates.push({ remaining: pro_monthly_remaining, total: pro_monthly_total });
  }

  if (candidates.length === 0) {
    return { remaining: null, total: null };
  }

  return candidates.reduce((current, candidate) =>
    candidate.remaining < current.remaining ? candidate : current
  );
}

export function getWeakestDimKey(scores: ReviewScores): keyof ReviewScores {
  const dims: (keyof ReviewScores)[] = ['composition', 'lighting', 'color', 'impact', 'technical'];
  return dims.reduce((weakest, d) => (scores[d] < scores[weakest] ? d : weakest), dims[0]);
}

export function getReviewActionCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      sharePending: '共有リンクを生成中...',
      shareDone: '共有リンクをコピーしました',
      exportPending: '簡易データを準備中...',
      exportDone: '簡易データをダウンロードしました',
      replayPending: '前回結果を引き継いで再分析を開いています...',
    };
  }
  if (locale === 'en') {
    return {
      sharePending: 'Generating share link...',
      shareDone: 'Share link copied',
      exportPending: 'Preparing compact export...',
      exportDone: 'Compact export downloaded',
      replayPending: 'Opening replay analysis...',
    };
  }
  return {
    sharePending: '正在生成分享链接...',
    shareDone: '分享链接已复制',
    exportPending: '正在导出简版结果...',
    exportDone: '简版结果已下载',
    replayPending: '正在跳转到再次分析...',
  };
}

export function getFavoriteActionCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      add: 'お気に入りに追加',
      remove: 'お気に入り解除',
      pendingAdd: 'お気に入りに保存中...',
      pendingRemove: 'お気に入りを解除中...',
      doneAdd: 'お気に入りに追加しました',
      doneRemove: 'お気に入りを解除しました',
    };
  }
  if (locale === 'en') {
    return {
      add: 'Add to favorites',
      remove: 'Remove favorite',
      pendingAdd: 'Saving to favorites...',
      pendingRemove: 'Removing from favorites...',
      doneAdd: 'Added to favorites',
      doneRemove: 'Removed from favorites',
    };
  }
  return {
    add: '加入收藏',
    remove: '取消收藏',
    pendingAdd: '正在加入收藏...',
    pendingRemove: '正在取消收藏...',
    doneAdd: '已加入收藏',
    doneRemove: '已取消收藏',
  };
}

export function getGalleryActionCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      dialogLabel: 'Public Gallery',
      dialogTitle: '公開ギャラリーに追加',
      dialogBody: '追加すると公開展示候補として画像審査が行われます。お気に入りにも自動保存され、承認後に公開ギャラリーへ表示されます。',
      dialogFootnote: 'あとで履歴詳細ページからギャラリー解除できます。',
      dialogConfirm: '追加する',
      dialogCancel: 'キャンセル',
      confirmPublic: 'この評価をギャラリーに追加すると、公開展示候補として画像監査が行われます。追加時にお気に入りにも保存され、監査通過後に公開ギャラリーへ表示されます。後で履歴詳細ページから外せます。続行しますか？',
      pendingAdd: 'ギャラリー掲載を申請中...',
      pendingRemove: 'ギャラリーから外しています...',
      doneApproved: 'ギャラリーに追加され、お気に入りにも保存されました',
      doneRejected: 'お気に入りには保存しましたが、画像監査未通過のため公開ギャラリーには表示されません',
      doneRemove: 'ギャラリーから外しました',
      guestBlocked: '公開ギャラリーへの投稿はログイン後に利用できます。閲覧はそのままできます。',
    };
  }
  if (locale === 'en') {
    return {
      dialogLabel: 'Public Gallery',
      dialogTitle: 'Submit to Public Gallery',
      dialogBody: 'This will send the image through gallery moderation. It will also be saved to favorites by default and will appear publicly after approval.',
      dialogFootnote: 'You can remove it later from the history detail page.',
      dialogConfirm: 'Submit',
      dialogCancel: 'Cancel',
      confirmPublic: 'Adding this critique submits the image for gallery moderation. It will also be saved to favorites by default, and will appear in the public gallery after approval. You can remove it later from the history detail page. Continue?',
      pendingAdd: 'Submitting to gallery...',
      pendingRemove: 'Removing from gallery...',
      doneApproved: 'Added to gallery and saved to favorites',
      doneRejected: 'Saved to favorites, but the image did not pass gallery moderation and will not appear publicly',
      doneRemove: 'Removed from gallery',
      guestBlocked: 'Sign in to submit to the public gallery. Browsing the gallery is still available.',
    };
  }
  return {
    dialogLabel: 'Public Gallery',
    dialogTitle: '加入公开影像长廊',
    dialogBody: '加入后会进入公开长廊审核，默认也会加入收藏；审核通过后才会出现在公开长廊。',
    dialogFootnote: '之后可在历史记录详情页里移出长廊。',
    dialogConfirm: '确认加入',
    dialogCancel: '取消',
    confirmPublic: '加入影像长廊后，图片会进入公开长廊审核，默认也会加入收藏；审核通过后才会出现在公开长廊。之后你可以在历史记录详情页里移出长廊。是否继续？',
    pendingAdd: '正在提交到影像长廊...',
    pendingRemove: '正在移出影像长廊...',
    doneApproved: '已加入影像长廊，并默认加入收藏',
    doneRejected: '已加入收藏，但图片未通过长廊审核，不会出现在公开长廊',
    doneRemove: '已移出影像长廊',
    guestBlocked: '游客可以浏览公开长廊，但不能提交到长廊，请先登录。',
  };
}

export function getReviewGalleryCardCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      title: 'この評価をギャラリーに追加できます',
      body: 'この評価はギャラリー申請できます。追加すると公開審査に進み、同時にお気に入りにも保存されます。承認後に公開ギャラリーへ掲載され、あとから履歴詳細ページで外せます。',
    };
  }
  if (locale === 'en') {
    return {
      title: 'You can add this critique to your gallery',
      body: 'This critique can be submitted to the gallery. It will go through gallery moderation and be saved to favorites by default. After approval, it will appear in the public gallery, and you can remove it later from the history detail page.',
    };
  }
  return {
    title: '这次评图很值得收进影像长廊',
    body: '这次结果很适合留档，也值得尝试公开展示。加入后会先进入公开长廊审核，并默认加入收藏；审核通过后会出现在公开长廊，之后也可以在历史记录详情页移出。',
  };
}

export function getExportSummaryCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      filePrefix: 'picspeak-summary',
      title: 'PicSpeak 評価サマリー',
      exportedAt: '出力時間',
      reviewInfo: 'レビュー情報',
      reviewId: 'レビュー ID',
      sourceReviewId: '再分析元',
      createdAt: '作成時間',
      mode: 'モード',
      imageType: '写真タイプ',
      model: 'モデル',
      scoreSummary: '総合スコア',
      strengths: '良かった点',
      issues: '改善ポイント',
      suggestions: '改善提案',
      scores: '各次元スコア',
      photoInfo: '写真情報',
      photoId: '写真 ID',
      favorite: 'お気に入り',
      tags: 'タグ',
      note: 'メモ',
      yes: 'はい',
      no: 'いいえ',
    };
  }
  if (locale === 'en') {
    return {
      filePrefix: 'picspeak-summary',
      title: 'PicSpeak Critique Summary',
      exportedAt: 'Exported at',
      reviewInfo: 'Review Info',
      reviewId: 'Review ID',
      sourceReviewId: 'Replay source',
      createdAt: 'Created at',
      mode: 'Mode',
      imageType: 'Image type',
      model: 'Model',
      scoreSummary: 'Overall Score',
      strengths: 'Strengths',
      issues: 'Issues',
      suggestions: 'Suggestions',
      scores: 'Dimension Scores',
      photoInfo: 'Photo Info',
      photoId: 'Photo ID',
      favorite: 'Favorite',
      tags: 'Tags',
      note: 'Note',
      yes: 'Yes',
      no: 'No',
    };
  }
  return {
    filePrefix: 'picspeak-摘要',
    title: 'PicSpeak 评图摘要',
    exportedAt: '导出时间',
    reviewInfo: '评图信息',
    reviewId: '评图 ID',
    sourceReviewId: '再次分析来源',
    createdAt: '创建时间',
    mode: '评图模式',
    imageType: '图片类型',
    model: '模型',
    scoreSummary: '总分',
    strengths: '优点',
    issues: '问题',
    suggestions: '建议',
    scores: '分项得分',
    photoInfo: '照片信息',
    photoId: '照片 ID',
    favorite: '收藏',
    tags: '标签',
    note: '备注',
    yes: '是',
    no: '否',
  };
}

export function getImageTypeLabelForLocale(locale: 'zh' | 'en' | 'ja', imageType?: CritiqueImageType | string) {
  const normalized = (imageType ?? 'default') as CritiqueImageType;
  const zh: Record<CritiqueImageType, string> = {
    default: '默认',
    landscape: '风景',
    portrait: '人像',
    street: '街拍',
    still_life: '静物',
    architecture: '建筑',
  };
  const en: Record<CritiqueImageType, string> = {
    default: 'Default',
    landscape: 'Landscape',
    portrait: 'Portrait',
    street: 'Street',
    still_life: 'Still Life',
    architecture: 'Architecture',
  };
  const ja: Record<CritiqueImageType, string> = {
    default: '標準',
    landscape: '風景',
    portrait: 'ポートレート',
    street: 'ストリート',
    still_life: '静物',
    architecture: '建築',
  };
  if (locale === 'ja') return ja[normalized] ?? ja.default;
  if (locale === 'en') return en[normalized] ?? en.default;
  return zh[normalized] ?? zh.default;
}

export function formatExposureValue(exposureTime: unknown): string {
  if (typeof exposureTime === 'string') {
    const trimmed = exposureTime.trim();
    if (!trimmed) return '';
    if (/^\d+\/\d+$/.test(trimmed)) return trimmed;
    const normalized = trimmed.replace(/sec(onds?)?/i, '').replace(/s$/i, '').trim();
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return trimmed;
    exposureTime = parsed;
  }
  if (typeof exposureTime !== 'number' || exposureTime <= 0) return '';
  if (exposureTime >= 1) {
    return `${exposureTime % 1 === 0 ? exposureTime : exposureTime.toFixed(1)}s`;
  }
  const denominator = Math.round(1 / exposureTime);
  return denominator > 0 ? `1/${denominator}s` : '';
}

function normalizeSuggestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[：:，,。；;！!？?（）()[\]【】"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(patterns: RegExp[], text: string): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

const TAG_RULES: Record<TagKey, TagRule> = {
  pre: {
    title: [/^(前期|拍摄|拍摄建议|机位|取景|撮影)$/],
    strong: [/拍摄时/, /拍的时候/, /机位/, /取景/, /视角/, /拍摄角度/, /站位/, /in camera/, /while shooting/, /during shooting/, /撮影時/, /アングル/, /立ち位置/],
    weak: [/靠近主体/, /退后一步/, /换个角度/, /移动位置/, /重新拍摄/, /蹲低/, /抬高机位/],
    minWeakMatches: 2,
  },
  post: {
    title: [/^(后期|调色|修图|修片|现像|retouch|editing|post-processing|color grading)$/],
    strong: [/后期/, /后期处理/, /调色/, /修图/, /修片/, /二次裁切/, /post process/, /post-processing/, /editing/, /retouch/, /color grading/, /darkroom/, /lightroom/, /photoshop/, /现像/, /レタッチ/, /補正/],
    weak: [/降噪/, /锐化/, /对比度/, /饱和度/, /色温/, /白平衡/, /明暗过渡/, /contrast/, /saturation/, /selective saturation/, /hue/, /midtones?/, /highlights?/, /shadows?/, /white balance/, /color temperature/, /clarity/, /sharpen/],
    minWeakMatches: 2,
  },
  composition: {
    title: [/^(构图|裁切|裁剪|取景构图|composition|framing|構図)$/],
    strong: [/构图/, /裁切/, /裁剪/, /三分法/, /黄金比/, /留白/, /引导线/, /地平线/, /对称/, /前景/, /framing/, /composition/, /rule of thirds/, /leading lines/, /構図/, /トリミング/],
    weak: [/主体位置/, /视觉重心/, /画面边缘/, /画面平衡/, /背景元素/],
    minWeakMatches: 2,
  },
  timing: {
    title: [/^(时机|拍摄时机|timing|タイミング)$/],
    strong: [/时机/, /等待/, /黄金时段/, /蓝调时刻/, /日出/, /日落/, /golden hour/, /blue hour/, /timing/, /タイミング/, /マジックアワー/],
  },
  exposure: {
    title: [/^(曝光|光圈|快门|iso|exposure|露出)$/],
    strong: [/曝光/, /欠曝/, /过曝/, /高光过曝/, /压高光/, /提亮阴影/, /光圈/, /快门/, /\biso\b/, /exposure/, /aperture/, /shutter/, /露出/, /シャッター/, /絞り/],
    weak: [/测光/, /亮部细节/, /暗部细节/],
    minWeakMatches: 2,
  },
  focus: {
    title: [/^(对焦|焦点|清晰度|focus|フォーカス|ピント)$/],
    strong: [/对焦/, /焦点/, /虚焦/, /跑焦/, /景深/, /焦平面/, /清晰度/, /锐度/, /focus/, /sharpness/, /depth of field/, /ピント/, /フォーカス/, /被写界深度/],
    weak: [/主体不够清晰/, /边缘发虚/, /背景虚化过重/],
    minWeakMatches: 2,
  },
};

export function detectSuggestionTags(title: string, detail: string): TagKey[] {
  const normalizedTitle = normalizeSuggestionText(title);
  const normalizedDetail = normalizeSuggestionText(detail);
  const combined = `${normalizedTitle} ${normalizedDetail}`.trim();

  return (Object.entries(TAG_RULES) as [TagKey, TagRule][])
    .filter(([, rule]) => {
      if (rule.title.some((pattern) => pattern.test(normalizedTitle))) return true;
      if (rule.strong.some((pattern) => pattern.test(normalizedDetail) || pattern.test(combined))) return true;
      if (!rule.weak?.length) return false;
      return countMatches(rule.weak, combined) >= (rule.minWeakMatches ?? 2);
    })
    .map(([tag]) => tag);
}

export function parsePoints(body: string): string[] {
  const numbered = body.split(/(?=\d+\.\s)/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length >= 1 && /^\d+\.\s/.test(numbered[0])) return numbered;
  const trimmed = body.trim();
  if (!trimmed) return [];
  const byNewline = trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  if (getSuggestionStructureState(trimmed) === 'complete') return [trimmed];
  const bySemicolon = trimmed.split(/[；;]+/).map((s) => s.trim()).filter(Boolean);
  if (bySemicolon.length > 1) return bySemicolon;
  return [trimmed];
}

export function parsePointWithTitle(raw: string): { title: string; detail: string } {
  const text = raw.replace(/^\d+[.、．]\s*/, '');
  const actionRe = /(?:处理方法|可执行动作|Action)[：:]\s*(.+)/is;
  const actionMatch = text.match(actionRe);
  if (actionMatch) {
    const actionText = actionMatch[1].trim();
    const firstSentence = actionText.split(/[。！]|\.\s+|!\s+/)[0].replace(/[.。！]+$/, '').trim();
    return { title: firstSentence || actionText, detail: text.trim() };
  }
  const colonRe = /^([^：:\n。，,]{2,20})[：:]\s*(.+)/s;
  const m = text.match(colonRe);
  if (m) return { title: m[1].trim(), detail: m[2].trim() };
  return { title: '', detail: text.trim() };
}

export function hasStructuredSuggestionLabel(text: string, labels: readonly string[]): boolean {
  return labels.some((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\d+\\.\\s*|[；;，,\\n]\\s*)${escaped}[：:]`, 'i').test(text);
  });
}

export function getSuggestionStructureState(text: string): 'complete' | 'partial' | 'none' {
  const observationLabels = ['观察', '觀察', 'Observation', '観察'] as const;
  const reasonLabels = ['原因', 'Reason', '理由'] as const;
  const actionLabels = ['建议', '行动', '行動', '处理方法', '可执行动作', 'Action', '提案'] as const;

  const hasObservation = hasStructuredSuggestionLabel(text, observationLabels);
  const hasReason = hasStructuredSuggestionLabel(text, reasonLabels);
  const hasAction = hasStructuredSuggestionLabel(text, actionLabels);

  if (hasObservation && hasReason && hasAction) return 'complete';
  if (hasObservation || hasReason || hasAction) return 'partial';
  return 'none';
}

export const DIM_TO_TAGS: Partial<Record<string, TagKey[]>> = {
  composition: ['composition', 'pre'],
  lighting: ['exposure', 'post', 'pre'],
  color: ['post', 'exposure'],
  impact: ['timing', 'pre'],
  technical: ['focus', 'exposure', 'post'],
};

export function parsePointWithShortActionTitle(raw: string): { title: string; detail: string } {
  const text = raw.replace(/^\d+[.、．]\s*/, '').trim();
  const structureState = getSuggestionStructureState(text);

  if (structureState === 'partial') {
    return { title: '', detail: text };
  }

  const actionMatch = text.match(/(?:建议|行动|处理方法|可执行动作|Action)[：:]\s*(.+)/is);
  if (structureState === 'complete' && actionMatch) {
    const actionText = actionMatch[1].trim();
    const firstClause = actionText.split(/[，,]/)[0]?.trim() ?? '';
    const fallbackSentence = actionText
      .split(/[。！？!?]|\.\s+/)[0]
      .replace(/[.。！？!?；;]+$/, '')
      .trim();
    const title = firstClause.replace(/[.。！？!?；;]+$/, '').trim() || fallbackSentence || actionText;
    return { title, detail: text };
  }

  const colonMatch = text.match(/^([^：:\n。，，,]{2,20})[：:]\s*(.+)/s);
  if (colonMatch) {
    return { title: colonMatch[1].trim(), detail: colonMatch[2].trim() };
  }

  return parsePointWithTitle(raw);
}

export const FLASH_DETAIL_LIMIT = 120;
export const CARD_HIGHLIGHT_DURATION_MS = 1800;

export function getScoreLabelKey(score: number): TranslationKey {
  const bucket = Math.max(1, Math.min(10, Math.round(score)));
  return `score_label_${bucket}` as TranslationKey;
}
