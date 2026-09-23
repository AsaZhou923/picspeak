import type {
  GoalAssessmentStatus,
  GoalAssessment,
  RetakeComparisonResult,
  ReviewExportResponse,
  ReviewGetResponse,
  ReviewScores,
} from '@/lib/types';

export type ReviewExportLocale = 'zh' | 'en' | 'ja';
export type ReviewExportCardMode = 'single' | 'retake';
export type ReviewExportEvidenceState = 'achieved' | 'partial' | 'not_achieved' | 'indeterminate' | 'unassessed';

export interface ReviewExportCardCopy {
  panelLabel: string;
  panelTitle: string;
  panelBody: string;
  previewTitle: string;
  downloadCard: string;
  printReport: string;
  loadPreview: string;
  hideScore: string;
  showScore: string;
  includeSource: string;
  imageMissing: string;
  imageFailed: string;
  privateNote: string;
  scoreHidden: string;
  scoreContext: string;
  before: string;
  after: string;
  target: string;
  evidence: string;
  confidence: string;
  confidenceLevels: Record<'low' | 'medium' | 'high', string>;
  createdAt: string;
  noGoal: string;
  noComparison: string;
  noFrozenGoal: string;
  editedExcerptNotice: string;
  markdownTitle: string;
  print: string;
  back: string;
  cardTitle: string;
  titleInput: string;
  exportMode: string;
  singleCard: string;
  retakeCard: string;
  sourceUnavailable: string;
  textTooLong: string;
  excerptHelp: string;
  summaryInput: string;
  suggestionInput: string;
  targetInput: string;
  evidenceInput: string;
  downloadMarkdown: string;
  dimensions: Record<keyof ReviewScores, string>;
  states: Record<ReviewExportEvidenceState, string>;
}

export interface ReviewExportCardModel {
  reviewId: string;
  mode: ReviewExportCardMode;
  title: string;
  createdAt: string;
  finalScore: number;
  scores: ReviewScores;
  scoreVersion?: string | null;
  showScore: boolean;
  imageUrl: string | null;
  sourceImageUrl: string | null;
  summary: string;
  suggestion: string;
  target: string | null;
  evidenceState: ReviewExportEvidenceState;
  evidenceLabel: string;
  comparison: RetakeComparisonResult | null;
  confidence: string | null;
  caveat: string | null;
  evidenceLines: string[];
  excerptEdited: boolean;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const GPS_RE =
  /\b(?:GPS|latitude|longitude|lat|lng|经纬度|纬度|经度|位置|住所|所在地|撮影地|緯度|経度)\b\s*[:：]?\s*[-+\d.,\s]+/gi;

export function getReviewExportCardCopy(locale: ReviewExportLocale): ReviewExportCardCopy {
  if (locale === 'ja') {
    return {
      panelLabel: '端末への書き出し',
      panelTitle: '共有用カードと印刷レポート',
      panelBody: '端末内で画像を書き出します。公開リンクは作成されません。',
      previewTitle: 'カードプレビュー',
      downloadCard: 'PNG を保存',
      printReport: '印刷ページ',
      loadPreview: 'プレビューを作成',
      hideScore: 'スコアを隠す',
      showScore: 'スコアを表示',
      includeSource: '元画像も表示',
      imageMissing: '書き出せる画像がありません。',
      imageFailed: '画像を読み込めませんでした。欠けた画像のまま保存しません。',
      privateNote: 'ノート、EXIF、メール、位置情報は含めません。',
      scoreHidden: 'スコア非表示',
      before: '元の写真',
      after: '今回の写真',
      target: '目標',
      evidence: '根拠',
      confidence: '信頼度',
      createdAt: '作成日',
      noGoal: '保存済みの目標判定はありません。',
      noComparison: '比較データはありません。',
      noFrozenGoal: '保存済みの撮影目標はありません。',
      editedExcerptNotice: 'ユーザー編集の摘録です。判定は元の記録に対応します。',
      markdownTitle: 'Markdown 原文',
      print: '印刷',
      back: '戻る',
      cardTitle: 'PicSpeak 講評',
      titleInput: 'カードタイトル',
      exportMode: 'カード形式',
      singleCard: '単画像',
      retakeCard: '比較カード',
      sourceUnavailable: '元画像を取得できないため、比較カードは作成できません。',
      textTooLong: 'カード内の文章が長すぎます。下の摘録を短くしてください。',
      excerptHelp: 'カード用の摘録です。元の意味を保ち、否定語を残してください。',
      summaryInput: '要約摘録',
      suggestionInput: '提案摘録',
      targetInput: '目標摘録',
      evidenceInput: '根拠摘録',
      downloadMarkdown: 'Markdown を保存',
      dimensions: {
        composition: '構図',
        lighting: '光',
        color: '色彩',
        impact: 'インパクト',
        technical: '技術',
      },
      states: {
        achieved: '達成',
        partial: '一部達成',
        not_achieved: '未達成',
        indeterminate: '判定不能',
        unassessed: '目標判定の記録なし',
      },
      scoreContext: '作品スコア',
      confidenceLevels: { low: '低', medium: '中', high: '高' },
    };
  }
  if (locale === 'en') {
    return {
      panelLabel: 'Local export',
      panelTitle: 'Share card and print report',
      panelBody: 'Export on this device. No public link is created.',
      previewTitle: 'Card preview',
      downloadCard: 'Save PNG',
      printReport: 'Print page',
      loadPreview: 'Build preview',
      hideScore: 'Hide score',
      showScore: 'Show score',
      includeSource: 'Show source image',
      imageMissing: 'No exportable image is available.',
      imageFailed: 'The image could not be loaded. A card with a missing image will not be saved.',
      privateNote: 'Notes, EXIF, email, and location fields are omitted.',
      scoreHidden: 'Score hidden',
      before: 'Before',
      after: 'After',
      target: 'Target',
      evidence: 'Evidence',
      confidence: 'Confidence',
      createdAt: 'Created',
      noGoal: 'No saved goal judgment is attached.',
      noComparison: 'No comparison data is attached.',
      noFrozenGoal: 'No frozen shooting target is recorded.',
      editedExcerptNotice: 'User-edited excerpt. The judgment refers to the original record.',
      markdownTitle: 'Markdown source',
      print: 'Print',
      back: 'Back',
      cardTitle: 'PicSpeak critique',
      titleInput: 'Card title',
      exportMode: 'Card format',
      singleCard: 'Single image',
      retakeCard: 'Retake comparison',
      sourceUnavailable: 'The source image is unavailable, so a comparison card cannot be exported.',
      textTooLong: 'The card text is too long. Edit the excerpts below before exporting.',
      excerptHelp: 'These excerpts are only for the card. Keep the original meaning and keep negations intact.',
      summaryInput: 'Summary excerpt',
      suggestionInput: 'Suggestion excerpt',
      targetInput: 'Target excerpt',
      evidenceInput: 'Evidence excerpt',
      downloadMarkdown: 'Save Markdown',
      dimensions: {
        composition: 'Composition',
        lighting: 'Lighting',
        color: 'Color',
        impact: 'Impact',
        technical: 'Technical',
      },
      states: {
        achieved: 'Achieved',
        partial: 'Partial',
        not_achieved: 'Not achieved',
        indeterminate: 'Indeterminate',
        unassessed: 'No recorded goal assessment',
      },
      scoreContext: 'Photo score',
      confidenceLevels: { low: 'Low', medium: 'Medium', high: 'High' },
    };
  }
  return {
    panelLabel: '本地导出',
    panelTitle: '分享图片卡与打印报告',
    panelBody: '只在本机生成导出文件，不自动创建公开分享链接。',
    previewTitle: '图片卡预览',
    downloadCard: '保存 PNG',
    printReport: '打印页',
    loadPreview: '生成预览',
    hideScore: '隐藏分数',
    showScore: '显示分数',
    includeSource: '显示原图',
    imageMissing: '没有可导出的图片。',
    imageFailed: '图片加载失败，不会导出缺图卡片。',
    privateNote: '不包含笔记、EXIF、邮箱和位置信息。',
    scoreHidden: '已隐藏分数',
    before: '之前',
    after: '之后',
    target: '目标',
    evidence: '证据',
    confidence: '可信度',
    createdAt: '创建时间',
    noGoal: '没有保存的目标判断。',
    noComparison: '没有对比数据。',
    noFrozenGoal: '未记录冻结拍摄目标。',
    editedExcerptNotice: '用户编辑摘录，判断对应原始记录。',
    markdownTitle: 'Markdown 原文',
    print: '打印',
    back: '返回',
    cardTitle: 'PicSpeak 评图',
    titleInput: '卡片标题',
    exportMode: '卡片形式',
    singleCard: '单图卡',
    retakeCard: '复拍对比卡',
    sourceUnavailable: '无法读取有权限的原图，不能导出复拍对比卡。',
    textTooLong: '卡片文字过长。请先编辑下方摘录后再导出。',
    excerptHelp: '这些摘录只用于图片卡，请保留原意，不要删掉否定词。',
    summaryInput: '摘要摘录',
    suggestionInput: '建议摘录',
    targetInput: '目标摘录',
    evidenceInput: '证据摘录',
    downloadMarkdown: '保存 Markdown',
    dimensions: {
      composition: '构图',
      lighting: '光线',
      color: '色彩',
      impact: '感染力',
      technical: '技术',
    },
    states: {
      achieved: '已完成',
      partial: '部分完成',
      not_achieved: '未完成',
      indeterminate: '无法判断',
      unassessed: '未记录目标评估',
    },
    scoreContext: '作品评分',
    confidenceLevels: { low: '低', medium: '中', high: '高' },
  };
}

export function stripPrivateExportText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(GPS_RE, '[redacted-location]')
    .trim();
}

export function compactExportSentence(value: string | null | undefined, maxChars = 180): string {
  const normalized = stripPrivateExportText(value).replace(/\s+/g, ' ');
  return normalized;
}

function normalizeGoalStatus(status: GoalAssessmentStatus | null | undefined): ReviewExportEvidenceState {
  if (status === 'achieved' || status === 'partial' || status === 'not_achieved' || status === 'indeterminate') return status;
  return 'unassessed';
}

function getComparisonSummary(review: ReviewGetResponse | ReviewExportResponse): RetakeComparisonResult | null {
  if ('result' in review) return review.result.comparison ?? null;
  return review.review.comparison ?? null;
}

type ExportReviewWithGoal = ReviewExportResponse['review'] & {
  goal_assessment?: GoalAssessment | null;
};

function getGoalAssessment(review: ReviewGetResponse | ReviewExportResponse): GoalAssessment | null {
  if ('result' in review) {
    return review.goal_assessment ?? review.result.goal_assessment ?? review.result.comparison?.goal_assessment ?? null;
  }
  const exportReview = review.review as ExportReviewWithGoal;
  return exportReview.goal_assessment ?? review.review.comparison?.goal_assessment ?? null;
}

function getGoalStatus(review: ReviewGetResponse | ReviewExportResponse): GoalAssessmentStatus | null {
  return getGoalAssessment(review)?.status ?? null;
}

export function buildReviewExportCardModel(args: {
  review: ReviewGetResponse | ReviewExportResponse;
  locale: ReviewExportLocale;
  showScore?: boolean;
  title?: string;
  summary?: string;
  suggestion?: string;
  target?: string | null;
  evidenceLines?: string[];
  frozenGoal?: string | null;
  excerptEdited?: boolean;
  mode?: ReviewExportCardMode;
  sourceImageUrl?: string | null;
  sourceAvailable?: boolean;
}): ReviewExportCardModel {
  const { review, locale, showScore = true, title, summary, suggestion, target, evidenceLines, frozenGoal, excerptEdited = false, mode, sourceImageUrl = null, sourceAvailable = true } = args;
  const copy = getReviewExportCardCopy(locale);
  const isExportPayload = !('result' in review);
  const reviewId = isExportPayload ? review.review.review_id : review.review_id;
  const finalScore = isExportPayload ? review.review.final_score : review.result.final_score;
  const scores = isExportPayload ? review.review.scores : review.result.scores;
  const scoreVersion = isExportPayload ? review.review.score_version : review.result.score_version;
  const comparison = getComparisonSummary(review);
  const goalStatus = normalizeGoalStatus(getGoalStatus(review));
  const imageUrl = isExportPayload ? review.photo.photo_url ?? review.photo.photo_thumbnail_url : review.photo_url;
  const createdAt = isExportPayload ? review.review.created_at : review.created_at;
  const defaultSummary = isExportPayload
    ? review.review.comparison?.summary || review.review.critique || review.review.advantage
    : review.result.comparison?.summary || review.result.critique || review.result.advantage;
  const defaultSuggestion = isExportPayload ? review.review.suggestions : review.result.suggestions;
  const goalAssessment = getGoalAssessment(review);
  const defaultTarget = frozenGoal ?? null;
  const defaultEvidenceLines = goalAssessment?.evidence
    ?.map((item) => compactExportSentence(item.conclusion))
    .filter(Boolean)
    .slice(0, 4) ?? [];
  const canUseRetake = Boolean(comparison && sourceImageUrl && sourceAvailable);

  return {
    reviewId,
    mode: mode === 'retake' && canUseRetake ? 'retake' : 'single',
    title: compactExportSentence(title || copy.cardTitle),
    createdAt,
    finalScore,
    scores,
    scoreVersion,
    showScore,
    imageUrl: imageUrl ?? null,
    sourceImageUrl: sourceAvailable ? sourceImageUrl : null,
    summary: compactExportSentence(summary ?? defaultSummary),
    suggestion: compactExportSentence(suggestion ?? defaultSuggestion),
    target: compactExportSentence(target ?? defaultTarget) || null,
    evidenceState: goalStatus,
    evidenceLabel: copy.states[goalStatus],
    comparison,
    confidence: comparison?.comparison_confidence ?? null,
    caveat: compactExportSentence(comparison?.comparison_caveat) || null,
    evidenceLines: (evidenceLines ?? defaultEvidenceLines).map((line) => compactExportSentence(line)).filter(Boolean),
    excerptEdited,
  };
}

export function buildReviewPrintMarkdown(args: {
  payload: ReviewExportResponse;
  locale: ReviewExportLocale;
  copy?: ReviewExportCardCopy;
}): string {
  const { payload, locale, copy = getReviewExportCardCopy(locale) } = args;
  const model = buildReviewExportCardModel({ review: payload, locale });
  const lines = [
    '# PicSpeak Export',
    '',
    `- Review: ${model.reviewId}`,
    `- ${copy.createdAt}: ${new Date(model.createdAt).toLocaleString(locale)}`,
    `- ${copy.evidence}: ${model.evidenceLabel}`,
    '',
    '## Summary',
    model.summary || '-',
    '',
    '## Suggestions',
    model.suggestion || '-',
    '',
    '## Scores',
    ...Object.entries(model.scores).map(([key, value]) => `- ${copy.dimensions[key as keyof ReviewScores]}: ${value.toFixed(1)}`),
  ];

  if (model.comparison) {
    lines.push('', '## Retake comparison', `- ${copy.confidence}: ${model.confidence ?? '-'}`);
    if (model.caveat) lines.push(`- Caveat: ${model.caveat}`);
    lines.push(
      `- Overall: ${model.comparison.overall_before.toFixed(1)} -> ${model.comparison.overall_after.toFixed(1)} (${model.comparison.overall_delta >= 0 ? '+' : ''}${model.comparison.overall_delta.toFixed(1)})`
    );
  }

  return lines.join('\n');
}
