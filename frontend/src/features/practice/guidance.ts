import type {
  PracticeGuidanceCoverage,
  PracticeGuidanceLevel,
  PracticeGuidanceObservation,
  PracticeRecommendation,
} from '@/lib/types';
import type { Locale } from '@/lib/i18n';

export type PracticeGuidanceDisplayState = 'records' | 'observations' | 'summary';

type GuidanceCopy = {
  title: string;
  subtitle: string;
  recordsOnly: string;
  preliminary: string;
  summary: string;
  sceneRequired: string;
  noRecommendations: string;
  acceptDisabled: string;
  acceptError: string;
  acceptBusy: string;
  signInRequired: string;
  evidence: string;
  recommendations: string;
  templates: string;
  coverage: string;
  loading: string;
  viewLog: string;
  retry: string;
  skip: string;
  changeGoal: string;
  scenePending: string;
  sceneGroups: string;
  sceneGroupsHelp: string;
  sceneGroupsEmpty: string;
  sceneGroupLabel: string;
  sceneGroupPlaceholder: string;
  sceneGroupSave: string;
  sceneGroupSaving: string;
  sceneGroupSaved: string;
  sceneGroupRequired: string;
  sceneGroupError: string;
  statusAchieved: string;
  statusPartial: string;
  statusNotAchieved: string;
  firstPracticeTitle: string;
  firstPracticeBody: string;
  noPracticeRecords: string;
  startPractice: string;
  photoHistory: string;
  publicPortfolio: string;
  refresh: string;
};

const COPY: Record<Locale, GuidanceCopy> = {
  en: {
    title: 'Practice profile',
    noPracticeRecords: 'No saved practice records yet.',
    firstPracticeTitle: 'Your first practice starts with one photo.',
    firstPracticeBody: 'Upload a photo, choose “Practise this goal” in its critique, then take a new photo. Your saved goals, attempts and evidence will appear here.',
    startPractice: 'Start a practice', photoHistory: 'Organise my photos', publicPortfolio: 'Public portfolio', refresh: 'Refresh',
    subtitle: 'Review evidence from your completed practice loops and find a direction for your next photo.',
    recordsOnly: 'Keep collecting practice records before PicSpeak shows observations.',
    preliminary: 'Limited observations are available. Treat them as evidence cards, not skill scores.',
    summary: 'A candidate practice summary is available from enough scenes and goals.',
    sceneRequired: 'Add scene groups to practice sessions before observations unlock.',
    noRecommendations: 'Recommendations appear after enough explicit scene-group evidence.',
    acceptDisabled: 'Practice creation is disabled right now.',
    acceptError: 'Practice could not be created.',
    acceptBusy: 'Creating practice...',
    signInRequired: 'Sign in again before creating practice.',
    evidence: 'Evidence',
    recommendations: 'Recommended next practice',
    templates: 'Practice templates',
    coverage: 'Coverage',
    loading: 'Loading practice evidence...',
    viewLog: 'View practice log',
    retry: 'Retry',
    skip: 'Skip',
    changeGoal: 'Change goal',
    scenePending: 'Scene pending',
    sceneGroups: 'Scene groups',
    sceneGroupsHelp: 'Name the real shooting situation for each session. PicSpeak uses only your explicit labels for guidance.',
    sceneGroupsEmpty: 'No practice records are ready yet. Open the practice log after completing a loop.',
    sceneGroupLabel: 'Scene group',
    sceneGroupPlaceholder: 'e.g. rainy street portrait',
    sceneGroupSave: 'Save scene',
    sceneGroupSaving: 'Saving...',
    sceneGroupSaved: 'Saved',
    sceneGroupRequired: 'Enter a scene group before saving.',
    sceneGroupError: 'Scene group could not be saved.',
    statusAchieved: 'Achieved',
    statusPartial: 'Partial',
    statusNotAchieved: 'Needs another pass',
  },
  zh: {
    title: '练习档案',
    noPracticeRecords: '还没有保存的练习记录。',
    firstPracticeTitle: '从一张照片，开始第一次练习。',
    firstPracticeBody: '上传照片，在点评中选择“练习这个目标”，再带着目标拍一张。保存的目标、每次尝试和比较证据，会逐步汇集到这里。',
    startPractice: '开始一次练习', photoHistory: '整理我的照片', publicPortfolio: '公开作品主页', refresh: '刷新',
    subtitle: '回看已完成练习的拍摄目标、每次尝试与比较证据，找到下一张照片的改进方向。',
    recordsOnly: '继续积累练习记录后，再显示观察。',
    preliminary: '已有有限观察。它们是证据卡，不是能力评分。',
    summary: '已有足够场景和目标，可显示候选练习摘要。',
    sceneRequired: '先给练习会话明确填写场景组，才会解锁观察。',
    noRecommendations: '推荐会在具备足够显式场景证据后出现。',
    acceptDisabled: '当前训练创建已关闭。',
    acceptError: '未能创建练习。',
    acceptBusy: '正在创建练习…',
    signInRequired: '请重新登录后再创建练习。',
    evidence: '证据',
    recommendations: '推荐下一次练习',
    templates: '练习模板',
    coverage: '覆盖',
    loading: '正在加载练习证据…',
    viewLog: '查看练习日志',
    retry: '重试',
    skip: '跳过',
    changeGoal: '换一个目标',
    scenePending: '待填写场景',
    sceneGroups: '场景组',
    sceneGroupsHelp: '为每次练习填写真实拍摄场景。PicSpeak 只使用你明确填写的标签生成练习建议。',
    sceneGroupsEmpty: '还没有可填写的练习记录。完成一轮练习后，可从练习日志回来补充。',
    sceneGroupLabel: '场景组',
    sceneGroupPlaceholder: '例如：雨夜街头人像',
    sceneGroupSave: '保存场景',
    sceneGroupSaving: '保存中…',
    sceneGroupSaved: '已保存',
    sceneGroupRequired: '请先填写场景组。',
    sceneGroupError: '未能保存场景组。',
    statusAchieved: '已达成',
    statusPartial: '部分达成',
    statusNotAchieved: '需要再练一次',
  },
  ja: {
    title: '練習プロフィール',
    noPracticeRecords: '保存された練習記録はまだありません。',
    firstPracticeTitle: '最初の練習は、1枚の写真から。',
    firstPracticeBody: '写真をアップロードし、講評で「この目標で練習」を選んで撮り直します。保存した目標、試行、比較の根拠がここに集まります。',
    startPractice: '練習を始める', photoHistory: '自分の写真を整理', publicPortfolio: '公開作品プロフィール', refresh: '更新',
    subtitle: '完了した練習の目標、試行、比較の根拠を振り返り、次の写真で試す方向を見つけます。',
    recordsOnly: '観察を表示する前に、もう少し練習記録を集めてください。',
    preliminary: '限定的な観察があります。スキル点ではなく証拠カードとして扱います。',
    summary: '十分なシーンと目標から候補サマリーを表示できます。',
    sceneRequired: '観察を出すには、練習セッションにシーン分類を明示してください。',
    noRecommendations: '十分なシーン証拠が集まると推薦が表示されます。',
    acceptDisabled: '現在、練習作成は無効です。',
    acceptError: '練習を作成できませんでした。',
    acceptBusy: '練習を作成中...',
    signInRequired: '練習を作成する前にもう一度ログインしてください。',
    evidence: '証拠',
    recommendations: '次のおすすめ練習',
    templates: '練習テンプレート',
    coverage: 'カバー状況',
    loading: '練習証拠を読み込み中...',
    viewLog: '練習ログを見る',
    retry: '再試行',
    skip: 'スキップ',
    changeGoal: '目標を変更',
    scenePending: 'シーン未設定',
    sceneGroups: 'シーン分類',
    sceneGroupsHelp: '各セッションの実際の撮影状況を入力してください。PicSpeak は明示された分類だけを練習案に使います。',
    sceneGroupsEmpty: '入力できる練習記録はまだありません。練習ループ完了後、練習ログから戻って入力できます。',
    sceneGroupLabel: 'シーン分類',
    sceneGroupPlaceholder: '例: 雨の夜のストリートポートレート',
    sceneGroupSave: 'シーンを保存',
    sceneGroupSaving: '保存中...',
    sceneGroupSaved: '保存しました',
    sceneGroupRequired: '保存する前にシーン分類を入力してください。',
    sceneGroupError: 'シーン分類を保存できませんでした。',
    statusAchieved: '達成',
    statusPartial: '一部達成',
    statusNotAchieved: 'もう一度練習',
  },
};

const DIMENSION_LABELS: Record<Locale, Record<string, string>> = {
  en: { composition: 'Composition', lighting: 'Lighting', color: 'Color', impact: 'Impact', technical: 'Technical' },
  zh: { composition: '构图', lighting: '光线', color: '色彩', impact: '感染力', technical: '技术' },
  ja: { composition: '構図', lighting: '光', color: '色', impact: '印象', technical: '技術' },
};

export function getPracticeGuidanceCopy(locale: Locale): GuidanceCopy {
  return COPY[locale] ?? COPY.en;
}

export function guidanceDisplayState(level: PracticeGuidanceLevel): PracticeGuidanceDisplayState {
  if (level === 'practice_summary') return 'summary';
  if (level === 'preliminary_observations') return 'observations';
  return 'records';
}

export function guidanceLevelMessage(level: PracticeGuidanceLevel, reason: string, locale: Locale): string {
  const copy = getPracticeGuidanceCopy(locale);
  if (reason === 'scene_groups_required') return copy.sceneRequired;
  if (level === 'practice_summary') return copy.summary;
  if (level === 'preliminary_observations') return copy.preliminary;
  return copy.recordsOnly;
}

export function guidanceLevelReasonLabel(reason: string, locale: Locale): string {
  const copy = getPracticeGuidanceCopy(locale);
  if (reason === 'scene_groups_required') return copy.sceneRequired;
  if (reason === 'enough_for_candidate_summary') return copy.summary;
  if (reason === 'enough_for_preliminary_observations') return copy.preliminary;
  return copy.recordsOnly;
}

export function guidanceDimensionLabel(dimension: string, locale: Locale): string {
  return DIMENSION_LABELS[locale]?.[dimension] ?? DIMENSION_LABELS.en[dimension] ?? dimension;
}


export function localizePracticeDimensionText(value: string, locale: Locale): string {
  return value.replace(/\b(composition|lighting|color|impact|technical)\b/g, (match) => guidanceDimensionLabel(match, locale));
}

export function guidanceStatusLabel(status: string, locale: Locale): string {
  const copy = getPracticeGuidanceCopy(locale);
  if (status === 'achieved') return copy.statusAchieved;
  if (status === 'partial') return copy.statusPartial;
  return copy.statusNotAchieved;
}

export function coverageFacts(
  coverage: PracticeGuidanceCoverage,
  locale: Locale = 'en'
): Array<{ label: string; value: number }> {
  const labels = {
    en: ['Valid sessions', 'Scene groups', 'Goals', 'Needs scene'],
    zh: ['有效练习', '场景组', '目标', '待填场景'],
    ja: ['有効な練習', 'シーン分類', '目標', 'シーン未設定'],
  }[locale];
  return [
    { label: labels[0], value: coverage.valid_session_count },
    { label: labels[1], value: coverage.scene_group_count },
    { label: labels[2], value: coverage.goal_count },
    { label: labels[3], value: coverage.untagged_session_count },
  ];
}

export function observationEvidenceLabel(observation: PracticeGuidanceObservation, locale: Locale = 'en'): string {
  const copy = getPracticeGuidanceCopy(locale);
  const sceneText = observation.scene_groups.length > 0 ? observation.scene_groups.join(', ') : copy.scenePending;
  if (locale === 'zh') return `${observation.source_count} 条来源 · ${sceneText}`;
  if (locale === 'ja') return `${observation.source_count} 件の証拠 · ${sceneText}`;
  return `${observation.source_count} sources · ${sceneText}`;
}

export function recommendationActionLabel(recommendation: PracticeRecommendation, locale: Locale): string {
  if (recommendation.accept_available) {
    if (locale === 'zh') return '用这个目标开始练习';
    if (locale === 'ja') return 'この目標で練習する';
    return 'Practice this goal';
  }
  return getPracticeGuidanceCopy(locale).acceptDisabled;
}

export function nextRecommendationIndex(currentIndex: number, total: number): number {
  if (total <= 1) return 0;
  return (currentIndex + 1) % total;
}
