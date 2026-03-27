'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, History, RotateCcw, AlertCircle, ThumbsUp, ThumbsDown, AlertTriangle, Lightbulb, Upload, TrendingDown, ZoomIn, X, Copy, Check, Share2, Download, LayoutGrid, BookmarkPlus, BookmarkCheck, Heart } from 'lucide-react';
import { createReviewShare, exportReview, getReview, getUsage, updateReviewMeta } from '@/lib/api';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse, ReviewScores, UsageResponse } from '@/lib/types';
import { FinalScoreRing } from '@/components/ui/ScoreRing';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { isDemoReviewId } from '@/lib/demo-review';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';

// ─── Score helpers ────────────────────────────────────────────────────────────

function getDimColorClass(score: number): string {
  if (score >= 7.5) return 'bg-sage';
  if (score >= 5.5) return 'bg-gold';
  return 'bg-rust';
}

function getDimTextClass(score: number): string {
  if (score >= 7.5) return 'text-sage';
  if (score >= 5.5) return 'text-gold';
  return 'text-rust';
}

function getScoreLabelColor(score: number): string {
  if (score >= 7.5) return 'text-sage';
  if (score >= 5.5) return 'text-gold';
  return 'text-rust';
}

function getEffectiveQuota(
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

function getWeakestDimKey(scores: ReviewScores): keyof ReviewScores {
  const dims: (keyof ReviewScores)[] = ['composition', 'lighting', 'color', 'impact', 'technical'];
  return dims.reduce((weakest, d) => (scores[d] < scores[weakest] ? d : weakest), dims[0]);
}



type CritiqueImageType = 'default' | 'landscape' | 'portrait' | 'street' | 'still_life' | 'architecture';

type DimKey = 'composition' | 'lighting' | 'color' | 'impact' | 'technical';

const TYPE_DIM_DESC: Record<'zh' | 'en' | 'ja', Record<CritiqueImageType, Record<DimKey, string>>> = {
  zh: {
    default: {
      composition: '评估画面框架、主体位置与视觉引导，包括三分法、黄金比例等构图手法。',
      lighting: '评估光源质量、方向、对比度及曝光控制，包括高光与阴影的层次细节。',
      color: '评估色调、饱和度、白平衡与整体色彩和谐感，以及色彩情绪的表达力。',
      impact: '评估照片的情绪表达、主题传达、叙事力度和与观者的视觉共鸣。',
      technical: '评估焦点清晰度、噪点控制、景深运用与整体后期处理的完成度。',
    },
    portrait: {
      composition: '评估人物在画面中的构图位置、肢体留白与视线引导是否自然。',
      lighting: '评估面部光线方向、明暗过渡与肤质保留是否得当。',
      color: '评估肤色准确性、肤色层次与整体色调风格的一致性。',
      impact: '评估人物情绪表达、状态传达与人物故事感。',
      technical: '评估眼部对焦、景深控制与背景虚化质量。',
    },
    landscape: {
      composition: '评估前景、中景、远景层次与空间纵深是否清晰。',
      lighting: '评估自然光影关系、光比控制与时段选择是否合理。',
      color: '评估自然色彩还原、色彩关系与季节/天气氛围表现。',
      impact: '评估景观震撼感、场景气势与观看沉浸感。',
      technical: '评估曝光完整性、动态范围与整体清晰度。',
    },
    architecture: {
      composition: '评估建筑几何结构、线条秩序与主体组织。',
      lighting: '评估建筑体块光影塑造、反差与立面层次。',
      color: '评估建筑色彩风格、材质色调与整体统一性。',
      impact: '评估画面的视觉张力、秩序感与形式表达。',
      technical: '评估透视控制、垂直线校正与边缘畸变控制。',
    },
    street: {
      composition: '评估街头元素布局、主体关系与瞬间组织。',
      lighting: '评估环境光利用、复杂光源控制与曝光平衡。',
      color: '评估氛围色彩、现场色温关系与视觉记忆点。',
      impact: '评估决定性瞬间的张力、叙事冲突与情绪触发。',
      technical: '评估抓拍清晰度、快门策略与动态控制。',
    },
    still_life: {
      composition: '评估主体摆放、道具关系与画面布局稳定性。',
      lighting: '评估布光方向、质感塑造与阴影控制。',
      color: '评估色彩搭配、主辅色关系与风格统一。',
      impact: '评估背景设计与主体表达是否形成完整视觉主题。',
      technical: '评估细节解析、材质质感与边缘过渡质量。',
    },
  },
  en: {
    default: {
      composition: 'Evaluates framing structure, subject placement, and visual guidance in the image.',
      lighting: 'Evaluates light direction, contrast, and highlight/shadow control.',
      color: 'Evaluates hue, saturation, white balance, and overall color harmony.',
      impact: 'Evaluates emotional expression, thematic clarity, and viewer resonance.',
      technical: 'Evaluates focus precision, noise control, depth-of-field usage, and finish quality.',
    },
    portrait: {
      composition: 'Evaluates subject framing, headroom, and portrait balance.',
      lighting: 'Evaluates facial light quality, shadow transition, and skin-detail retention.',
      color: 'Evaluates skin tone accuracy and tonal consistency.',
      impact: 'Evaluates emotional expression and character storytelling.',
      technical: 'Evaluates eye focus, bokeh quality, and depth control.',
    },
    landscape: {
      composition: 'Evaluates foreground-to-background layering and spatial depth.',
      lighting: 'Evaluates natural light timing, light-shadow structure, and dynamic balance.',
      color: 'Evaluates natural palette quality and atmosphere consistency.',
      impact: 'Evaluates scene grandeur and immersive visual effect.',
      technical: 'Evaluates exposure completeness and global clarity.',
    },
    architecture: {
      composition: 'Evaluates geometric structure and line organization.',
      lighting: 'Evaluates light-shadow sculpting on forms and facades.',
      color: 'Evaluates architectural color style and material-tone unity.',
      impact: 'Evaluates visual tension and formal expression.',
      technical: 'Evaluates perspective control and distortion correction.',
    },
    street: {
      composition: 'Evaluates scene layout and relationship between subjects/elements.',
      lighting: 'Evaluates ambient light handling in complex street conditions.',
      color: 'Evaluates atmosphere color and memory-driving palette cues.',
      impact: 'Evaluates decisive-moment tension and narrative immediacy.',
      technical: 'Evaluates capture sharpness and motion control strategy.',
    },
    still_life: {
      composition: 'Evaluates object placement and arrangement logic.',
      lighting: 'Evaluates light shaping and texture-focused shadow control.',
      color: 'Evaluates color matching and style consistency.',
      impact: 'Evaluates background design as part of expression.',
      technical: 'Evaluates detail rendering and material texture quality.',
    },
  },
  ja: {
    default: {
      composition: '画面構成、主題配置、視線誘導を評価します。',
      lighting: '光の方向、コントラスト、ハイライト/シャドウ制御を評価します。',
      color: '色相・彩度・WB・全体の色調調和を評価します。',
      impact: '感情表現、主題伝達、鑑賞者との共鳴を評価します。',
      technical: 'ピント精度、ノイズ制御、被写界深度、仕上げ品質を評価します。',
    },
    portrait: {
      composition: '人物の配置、余白、視線誘導の自然さを評価します。',
      lighting: '顔の光、陰影のつながり、肌ディテール保持を評価します。',
      color: '肌色の正確性とトーンの一貫性を評価します。',
      impact: '人物の感情表現と人物像の伝達力を評価します。',
      technical: '瞳への合焦、ボケ品質、被写界深度制御を評価します。',
    },
    landscape: {
      composition: '前景〜遠景のレイヤーと奥行き表現を評価します。',
      lighting: '自然光のタイミング、光と影の構造を評価します。',
      color: '自然な色彩再現と雰囲気の整合性を評価します。',
      impact: '景観の迫力と没入感を評価します。',
      technical: '露出の完成度と全体解像感を評価します。',
    },
    architecture: {
      composition: '幾何構造と線の秩序を評価します。',
      lighting: '建築の立体感を作る光と影を評価します。',
      color: '建築色彩スタイルと材質トーンの統一感を評価します。',
      impact: '視覚的張力と形式美の表現を評価します。',
      technical: '遠近制御と歪み補正を評価します。',
    },
    street: {
      composition: '街頭要素の配置と瞬間の構成力を評価します。',
      lighting: '環境光の活用と複雑光源下の露出バランスを評価します。',
      color: '雰囲気色彩と記憶に残る色調を評価します。',
      impact: '決定的瞬間の張力と物語性を評価します。',
      technical: 'スナップの鮮明度と動体制御を評価します。',
    },
    still_life: {
      composition: '主題配置とレイアウトの安定感を評価します。',
      lighting: 'ライティング設計と質感表現を評価します。',
      color: '配色設計とスタイル一貫性を評価します。',
      impact: '背景設計を含む主題表現の完成度を評価します。',
      technical: '細部描写と質感再現を評価します。',
    },
  },
};

function getDimDescByType(locale: string, imageType: string, dim: DimKey): string {
  const lang = locale === 'en' || locale === 'ja' ? locale : 'zh';
  const normalizedType = (['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'] as const)
    .includes(imageType as CritiqueImageType)
    ? (imageType as CritiqueImageType)
    : 'default';
  return TYPE_DIM_DESC[lang][normalizedType][dim];
}

function generateScoreSummary(
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

function getReviewActionCopy(locale: 'zh' | 'en' | 'ja') {
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

function getFavoriteActionCopy(locale: 'zh' | 'en' | 'ja') {
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

function getGalleryActionCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      dialogLabel: 'Public Gallery',
      dialogTitle: '公開ギャラリーに追加',
      dialogBody:
        '追加すると公開展示候補として画像審査が行われます。お気に入りにも自動保存され、承認後に公開ギャラリーへ表示されます。',
      dialogFootnote: 'あとで履歴詳細ページからギャラリー解除できます。',
      dialogConfirm: '追加する',
      dialogCancel: 'キャンセル',
      confirmPublic:
        'この評価をギャラリーに追加すると、公開展示候補として画像監査が行われます。追加時にお気に入りにも保存され、監査通過後に公開ギャラリーへ表示されます。後で履歴詳細ページから外せます。続行しますか？',
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
      dialogBody:
        'This will send the image through gallery moderation. It will also be saved to favorites by default and will appear publicly after approval.',
      dialogFootnote: 'You can remove it later from the history detail page.',
      dialogConfirm: 'Submit',
      dialogCancel: 'Cancel',
      confirmPublic:
        'Adding this critique submits the image for gallery moderation. It will also be saved to favorites by default, and will appear in the public gallery after approval. You can remove it later from the history detail page. Continue?',
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

function getReviewGalleryCardCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      title: 'この評価をギャラリーに追加できます',
      body:
        'この評価はギャラリー申請できます。追加すると公開審査に進み、同時にお気に入りにも保存されます。承認後に公開ギャラリーへ掲載され、あとから履歴詳細ページで外せます。',
    };
  }

  if (locale === 'en') {
    return {
      title: 'You can add this critique to your gallery',
      body:
        'This critique can be submitted to the gallery. It will go through gallery moderation and be saved to favorites by default. After approval, it will appear in the public gallery, and you can remove it later from the history detail page.',
    };
  }

  return {
    title: '这次评图很值得收进影像长廊',
    body:
      '这次结果很适合留档，也值得尝试公开展示。加入后会先进入公开长廊审核，并默认加入收藏；审核通过后会出现在公开长廊，之后也可以在历史记录详情页移出。',
  };
}

function getExportSummaryCopy(locale: 'zh' | 'en' | 'ja') {
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

function getImageTypeLabelForLocale(locale: 'zh' | 'en' | 'ja', imageType?: CritiqueImageType | string) {
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

function formatExposureValue(exposureTime: unknown): string {
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

// ─── Suggestion tag detection ─────────────────────────────────────────────────

type TagKey = 'pre' | 'post' | 'composition' | 'timing' | 'exposure' | 'focus';

type TagRule = {
  title: RegExp[];
  strong: RegExp[];
  weak?: RegExp[];
  minWeakMatches?: number;
};

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
    strong: [
      /拍摄时/,
      /拍的时候/,
      /机位/,
      /取景/,
      /视角/,
      /拍摄角度/,
      /站位/,
      /in camera/,
      /while shooting/,
      /during shooting/,
      /撮影時/,
      /アングル/,
      /立ち位置/,
    ],
    weak: [/靠近主体/, /退后一步/, /换个角度/, /移动位置/, /重新拍摄/, /蹲低/, /抬高机位/],
    minWeakMatches: 2,
  },
  post: {
    title: [/^(后期|调色|修图|修片|现像|retouch|editing|post-processing|color grading)$/],
    strong: [
      /后期/,
      /后期处理/,
      /调色/,
      /修图/,
      /修片/,
      /二次裁切/,
      /post process/,
      /post-processing/,
      /editing/,
      /retouch/,
      /color grading/,
      /darkroom/,
      /lightroom/,
      /photoshop/,
      /现像/,
      /レタッチ/,
      /補正/,
    ],
    weak: [
      /降噪/,
      /锐化/,
      /对比度/,
      /饱和度/,
      /色温/,
      /白平衡/,
      /明暗过渡/,
      /contrast/,
      /saturation/,
      /selective saturation/,
      /hue/,
      /midtones?/,
      /highlights?/,
      /shadows?/,
      /white balance/,
      /color temperature/,
      /clarity/,
      /sharpen/,
    ],
    minWeakMatches: 2,
  },
  composition: {
    title: [/^(构图|裁切|裁剪|取景构图|composition|framing|構図)$/],
    strong: [
      /构图/,
      /裁切/,
      /裁剪/,
      /三分法/,
      /黄金比/,
      /留白/,
      /引导线/,
      /地平线/,
      /对称/,
      /前景/,
      /framing/,
      /composition/,
      /rule of thirds/,
      /leading lines/,
      /構図/,
      /トリミング/,
    ],
    weak: [/主体位置/, /视觉重心/, /画面边缘/, /画面平衡/, /背景元素/],
    minWeakMatches: 2,
  },
  timing: {
    title: [/^(时机|拍摄时机|timing|タイミング)$/],
    strong: [
      /时机/,
      /等待/,
      /黄金时段/,
      /蓝调时刻/,
      /日出/,
      /日落/,
      /golden hour/,
      /blue hour/,
      /timing/,
      /タイミング/,
      /マジックアワー/,
    ],
  },
  exposure: {
    title: [/^(曝光|光圈|快门|iso|exposure|露出)$/],
    strong: [
      /曝光/,
      /欠曝/,
      /过曝/,
      /高光过曝/,
      /压高光/,
      /提亮阴影/,
      /光圈/,
      /快门/,
      /\biso\b/,
      /exposure/,
      /aperture/,
      /shutter/,
      /露出/,
      /シャッター/,
      /絞り/,
    ],
    weak: [/测光/, /亮部细节/, /暗部细节/],
    minWeakMatches: 2,
  },
  focus: {
    title: [/^(对焦|焦点|清晰度|focus|フォーカス|ピント)$/],
    strong: [
      /对焦/,
      /焦点/,
      /虚焦/,
      /跑焦/,
      /景深/,
      /焦平面/,
      /清晰度/,
      /锐度/,
      /focus/,
      /sharpness/,
      /depth of field/,
      /ピント/,
      /フォーカス/,
      /被写界深度/,
    ],
    weak: [/主体不够清晰/, /边缘发虚/, /背景虚化过重/],
    minWeakMatches: 2,
  },
};

function detectSuggestionTags(title: string, detail: string): TagKey[] {
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

// ─── Parse body text into individual point strings ────────────────────────────

function parsePoints(body: string): string[] {
  const numbered = body.split(/(?=\d+\.\s)/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length >= 1 && /^\d+\.\s/.test(numbered[0])) return numbered;
  const byLine = body.split(/[\n；;]+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  return [body.trim()].filter(Boolean);
}

function parsePointWithTitle(raw: string): { title: string; detail: string } {
  const text = raw.replace(/^\d+[.、．]\s*/, '');
  // Detect three-part structure (观察/Observation + 原因/Reason + 处理方法/可执行动作/Action)
  // and use the first sentence of the action part as the card title
  const actionRe = /(?:处理方法|可执行动作|Action)[：:]\s*(.+)/is;
  const actionMatch = text.match(actionRe);
  if (actionMatch) {
    const actionText = actionMatch[1].trim();
    // Take the first sentence: split on Chinese sentence-ending punctuation or English period+space
    // Use \.\s+ (period followed by space) to avoid splitting on decimal numbers like "1.5"
    const firstSentence = actionText.split(/[。！]|\.\s+|!\s+/)[0].replace(/[.。！]+$/, '').trim();
    return { title: firstSentence || actionText, detail: text.trim() };
  }
  const colonRe = /^([^：:\n。，,]{2,20})[：:]\s*(.+)/s;
  const m = text.match(colonRe);
  if (m) return { title: m[1].trim(), detail: m[2].trim() };
  return { title: '', detail: text.trim() };
}

function hasStructuredSuggestionLabel(text: string, labels: readonly string[]): boolean {
  return labels.some((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\d+\\.\\s*|[；;，,\\n]\\s*)${escaped}[：:]`, 'i').test(text);
  });
}

function getSuggestionStructureState(text: string): 'complete' | 'partial' | 'none' {
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

// ─── Score dimension → suggestion tag mapping ─────────────────────────────────
// Each dimension maps to an ordered list of tag candidates to try.
// The first tag whose corresponding card exists in the DOM is used.
// Rationale for non-obvious mappings:
//   lighting  → exposure first (camera exposure adjustment), then post (RAW correction)
//   color     → post first (color grading / white balance), then exposure (WB in-camera)
//   impact    → timing first (golden hour / moment), then pre (framing for impact)
//   technical → focus first (sharpness / depth-of-field), then exposure (settings), then post (noise/sharpen)
const DIM_TO_TAGS: Partial<Record<string, TagKey[]>> = {
  composition: ['composition', 'pre'],
  lighting:    ['exposure', 'post', 'pre'],
  color:       ['post', 'exposure'],
  impact:      ['timing', 'pre'],
  technical:   ['focus', 'exposure', 'post'],
};

function parsePointWithShortActionTitle(raw: string): { title: string; detail: string } {
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

// Max detail chars shown before truncation in Flash mode
const FLASH_DETAIL_LIMIT = 120;

// Duration (ms) of the card-highlight animation in tailwind.config.ts
const CARD_HIGHLIGHT_DURATION_MS = 1800;

// ─── Critique section with per-item cards ─────────────────────────────────────

type SectionConfig = {
  accent: string;
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  showTags?: boolean;
  showFeedback?: boolean;
  isPro?: boolean;
  highlightTop?: number;
  highlightedId?: string | null;
};

function CritiqueSection({ accent, borderColor, bgColor, icon, title, body, showTags, showFeedback, isPro = false, highlightTop = 0, highlightedId }: SectionConfig) {
  const { t } = useI18n();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'helpful' | 'vague'>>({});
  const points = parsePoints(body);

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    }).catch(() => {});
  }

  function toggleExpand(index: number) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleFeedback(index: number, type: 'helpful' | 'vague') {
    setFeedbackGiven((prev) => ({ ...prev, [index]: type }));
  }

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2.5 ${accent}`}>
        <span className="opacity-80">{icon}</span>
        <h3 className="font-display text-xl leading-none">{title}</h3>
      </div>
      <div className="space-y-2.5">
        {points.map((point, i) => {
          const parsed = parsePointWithShortActionTitle(point);
          const tags = showTags ? detectSuggestionTags(parsed.title, parsed.detail) : [];
          const fullText = parsed.title ? `${parsed.title}: ${parsed.detail}` : parsed.detail;
          const isPriority = highlightTop > 0 && i < highlightTop;
          const isExpanded = expandedSet.has(i);
          const detail = parsed.detail;
          const needsTruncation = !isPro && detail.length > FLASH_DETAIL_LIMIT;
          const displayDetail = needsTruncation && !isExpanded
            ? `${detail.slice(0, FLASH_DETAIL_LIMIT)}…`
            : detail;
          const hasTags = showTags && tags.length > 0;
          const cardId = hasTags ? `suggestion-card-${i}` : undefined;
          const tagData = hasTags ? tags.join(' ') : undefined;
          return (
            <div
              key={i}
              id={cardId}
              data-suggestion-tags={tagData}
              className={`group ${bgColor} border-l-2 ${isPriority ? 'border-l-[3px]' : ''} ${borderColor} rounded-r-md px-4 py-3 ${cardId && cardId === highlightedId ? 'animate-card-highlight' : ''}`}
            >
              {isPriority && (
                <div className={`text-[10px] font-semibold ${accent} opacity-60 mb-1.5 tracking-widest uppercase`}>
                  {t('suggestion_priority_badge')}
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {parsed.title && (
                    <p className={`text-xs font-semibold ${accent} mb-1.5 opacity-90`}>{parsed.title}</p>
                  )}
                  <p className="text-sm text-ink leading-[1.75]">{displayDetail}</p>
                  {needsTruncation && (
                    <button
                      onClick={() => toggleExpand(i)}
                      className={`mt-1 text-xs ${accent} opacity-60 hover:opacity-100 transition-opacity`}
                    >
                      {isExpanded ? t('suggestion_show_less') : t('suggestion_show_more')}
                    </button>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold/80 border border-gold/20 font-medium tracking-wide">
                          {t(`tag_${tag}` as Parameters<typeof t>[0])}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleCopy(fullText, i)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 mt-0.5 p-1 rounded text-ink-subtle hover:text-ink-muted transition-all"
                  title={t('copy_btn')}
                  aria-label={t('copy_btn')}
                >
                  {copiedIndex === i ? <Check size={12} className="text-sage" /> : <Copy size={12} />}
                </button>
              </div>
              {showFeedback && (
                <div className="mt-2 pt-2 border-t border-border-subtle/40 flex items-center gap-2">
                  {feedbackGiven[i] !== undefined ? (
                    <p className="text-[10px] text-ink-subtle">{t('review_feedback_thanks')}</p>
                  ) : (
                    <>
                      <button
                        onClick={() => handleFeedback(i, 'helpful')}
                        className="flex items-center gap-1 text-[10px] text-ink-subtle hover:text-sage transition-colors"
                      >
                        <ThumbsUp size={9} />{t('review_feedback_helpful')}
                      </button>
                      <span className="text-[10px] text-ink-subtle/30">·</span>
                      <button
                        onClick={() => handleFeedback(i, 'vague')}
                        className="flex items-center gap-1 text-[10px] text-ink-subtle hover:text-rust transition-colors"
                      >
                        <ThumbsDown size={9} />{t('review_feedback_vague')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const actionCopy = getReviewActionCopy(locale);
  const favoriteCopy = getFavoriteActionCopy(locale);
  const galleryActionCopy = getGalleryActionCopy(locale);
  const reviewGalleryCardCopy = getReviewGalleryCardCopy(locale);
  const exportSummaryCopy = getExportSummaryCopy(locale);

  const reviewId = params.reviewId as string;
  const backHref = searchParams.get('back') ?? '/workspace';
  const isGalleryBackHref = backHref.startsWith('/gallery');
  const favoritesNavLabel = locale === 'ja' ? 'お気に入り' : locale === 'en' ? 'Favorites' : '我的收藏';
  const backLabel =
    isGalleryBackHref
      ? t('nav_gallery')
      : backHref === '/account/reviews'
      ? t('review_back_history')
      : backHref === '/account/favorites'
        ? favoritesNavLabel
        : t('review_back_workspace');
  const { ensureToken, userInfo } = useAuth();

  function handleBackNavigation() {
    if (isGalleryBackHref) {
      if (window.history.length > 1) {
        router.back();
        return;
      }
    }

    router.push(backHref);
  }

  const [review, setReview] = useState<ReviewGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomMounted, setZoomMounted] = useState(false);
  const [activeDim, setActiveDim] = useState<string | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState('');
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [galleryConfirmOpen, setGalleryConfirmOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<'share' | 'export' | 'replay' | 'favorite' | 'gallery' | null>(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  const resultImageType = review?.result?.image_type ?? 'default';
  const SCORE_DIMS = [
    { key: 'composition', label: t('score_composition'), desc: getDimDescByType(locale, resultImageType, 'composition') },
    { key: 'lighting',    label: t('score_lighting'),    desc: getDimDescByType(locale, resultImageType, 'lighting') },
    { key: 'color',       label: t('score_color'),       desc: getDimDescByType(locale, resultImageType, 'color') },
    { key: 'impact',      label: t('score_impact'),      desc: getDimDescByType(locale, resultImageType, 'impact') },
    { key: 'technical',   label: t('score_technical'),   desc: getDimDescByType(locale, resultImageType, 'technical') },
  ];

  // Close zoom on Escape key
  useEffect(() => {
    if (!zoomOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomOpen]);

  useEffect(() => {
    if (!galleryConfirmOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGalleryConfirmOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [galleryConfirmOpen]);

  useEffect(() => {
    ensureToken()
      .then((token) => getReview(reviewId, token))
      .then((data) => {
        setReview(data);
        if (data.photo_url) {
          setPhotoUrl(data.photo_url);
        }
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        setError(formatUserFacingError(t, err, t('review_err_fetch')));
      });
  }, [reviewId, ensureToken, t]);

  // Fetch usage info for quota-low conversion banner and record failures explicitly.
  useEffect(() => {
    ensureToken()
      .then((token) => getUsage(token))
      .then((data) => {
        setUsage(data);
        setUsageError('');
      })
      .catch((err) => {
        console.error('Failed to fetch usage on review page', err);
        setUsageError(formatUserFacingError(t, err, t('usage_error')));
      });
  }, [ensureToken, t]);

  // Click a score dimension → scroll to the best matching tagged suggestion.
  // Tries each tag candidate for the dimension in priority order until a card is found.
  // Uses a brief 150 ms delay so the row-highlight (activeDim) is visible before the
  // page scrolls, making the interaction feel intentional rather than abrupt.
  function handleDimClick(dimKey: string) {
    const tags = DIM_TO_TAGS[dimKey];
    if (!tags || tags.length === 0) return;

    for (const tag of tags) {
      const el = document.querySelector<HTMLElement>(`[data-suggestion-tags~="${tag}"]`);
      if (el?.id) {
        // Highlight the dimension row immediately as tactile feedback
        setActiveDim(dimKey);
        // Short pause lets the highlight register before the viewport moves
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedCardId(el.id);
          // Clear the card glow once the animation finishes
          setTimeout(() => setHighlightedCardId(null), CARD_HIGHLIGHT_DURATION_MS);
        }, 150);
        return;
      }
    }
    // No matching suggestion card found in the DOM — don't activate anything
  }

  if (loading) {
    return (
      <div className="pt-14 min-h-screen">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <SkeletonBlock className="h-6 w-32 mb-8" />
          <div className="grid lg:grid-cols-[45%_1fr] gap-8">
            <SkeletonBlock className="h-[500px] w-full rounded-lg" />
            <div className="space-y-4">
              <SkeletonBlock className="h-8 w-48" />
              <SkeletonBlock className="h-28 w-full rounded-lg" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
              <SkeletonBlock className="h-4 w-4/5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <AlertCircle size={40} className="text-rust mx-auto" />
          <p className="text-rust text-sm">{error}</p>
          <button
            onClick={handleBackNavigation}
            className="flex items-center gap-1 text-xs text-ink-subtle hover:text-ink-muted mx-auto"
          >
            <ArrowLeft size={11} /> {t('back_btn')}
          </button>
        </div>
      </div>
    );
  }

  if (!review) return null;

  const r = review.result;
  const isPro = review.mode === 'pro';
  const isDemoReview = isDemoReviewId(reviewId);
  const displayAdvantage   = isDemoReview ? t('demo_review_advantage') : r.advantage;
  const displayCritique    = isDemoReview ? t('demo_review_critique') : r.critique;
  const displaySuggestions = isDemoReview ? t('demo_review_suggestions') : r.suggestions;
  const weakestKey = getWeakestDimKey(r.scores);
  const weakestDim = SCORE_DIMS.find((d) => d.key === weakestKey) ?? SCORE_DIMS[0];
  const scoreLabelColor = getScoreLabelColor(r.final_score);
  const scoreLabel =
    r.final_score >= 9.0 ? t('score_label_excellent')
    : r.final_score >= 7.5 ? t('score_label_good')
    : r.final_score >= 6.0 ? t('score_label_above_avg')
    : r.final_score >= 4.0 ? t('score_label_average')
    : t('score_label_weak');
  const scoreSummary = generateScoreSummary(r.scores, SCORE_DIMS, locale);

  // Determine if quota is low for conversion banner
  const { remaining: quotaRemaining, total: quotaTotal } = getEffectiveQuota(
    usage,
    review.mode === 'pro' ? 'pro' : 'flash'
  );
  const isLowQuota =
    quotaRemaining !== null &&
    quotaTotal !== null &&
    quotaTotal > 0 &&
    (quotaRemaining <= 2 || quotaRemaining / quotaTotal <= 0.2);
  const plan = userInfo?.plan ?? 'guest';
  const isPublicGalleryContext = isGalleryBackHref;
  const canManageReview = Boolean(review.viewer_is_owner);
  const showPersonalActions = !isPublicGalleryContext;
  const showOwnerActions = canManageReview && !isPublicGalleryContext;
  const showGalleryCta = showOwnerActions;
  const gallerySaved = Boolean(review.gallery_visible);
  const isLowScore = r.final_score < 5.0;
  const reviewPromoCopy = (() => {
    if (locale === 'ja') {
      if (plan === 'guest') {
        return {
          title: 'ログインして、この一枚をもっと深く見直す',
          body: isLowQuota
            ? `本日の残り回数は ${quotaRemaining ?? 0} 回です。まずログインして Free 枠を解放し、そのまま Pro の深い分析へ進めます。現在の初回価格は $2.99/月です。`
            : 'ログインするとこの結果を保存しつつ、そのまま Pro の深い分析へ進めます。現在の初回価格は $2.99/月です。',
        };
      }

      if (isLowQuota) {
        return {
          title: `残り ${quotaRemaining ?? 0} 回です。次の比較は Pro が向いています`,
          body: 'このまま複数の写真を見比べるなら、Pro のほうが止まらず進められます。現在の初回価格は $2.99/月です。',
        };
      }

      if (isLowScore) {
        return {
          title: 'この一枚は Pro で深掘りする価値があります',
          body: '点数が伸び悩んだ写真ほど、短い総評より深い分解が効きます。今なら $2.99/月の初回価格で始められます。',
        };
      }

      return {
        title: 'この結果を次の改善につなげるなら Pro が早いです',
        body: 'より深い分析と長期履歴があれば、次の調整まで一気に進めやすくなります。現在の初回価格は $2.99/月です。',
      };
    }

    if (locale === 'en') {
      if (plan === 'guest') {
        return {
          title: 'Sign in to take this result further',
          body: isLowQuota
            ? `You only have ${quotaRemaining ?? 0} critiques left today. Sign in first to unlock Free usage, then move straight into deeper Pro critique at the current $2.99/month launch price.`
            : 'Sign in to save this result and move straight into deeper Pro critique. The current launch price is $2.99/month.',
        };
      }

      if (isLowQuota) {
        return {
          title: `Only ${quotaRemaining ?? 0} critiques left. Pro fits the next round better`,
          body: 'If you are about to compare more shots, Pro lets you keep going without rationing each upload. The current launch price is $2.99/month.',
        };
      }

      if (isLowScore) {
        return {
          title: 'This photo is a good candidate for a deeper Pro breakdown',
          body: 'Lower-scoring images usually need more than a quick summary. Pro gives a fuller diagnosis, and the current launch price is $2.99/month.',
        };
      }

      return {
        title: 'If you want the next improvement step faster, switch this flow to Pro',
        body: 'Deeper critique plus permanent history makes iteration easier, and Pro is currently available at $2.99/month.',
      };
    }

    if (plan === 'guest') {
      return {
        title: '登录后，把这张结果继续往下深挖',
        body: isLowQuota
          ? `你今天只剩 ${quotaRemaining ?? 0} 次评图了。先登录解锁 Free，再直接切到 Pro 深度分析。当前首发优惠价为 $2.99/月。`
          : '登录后不仅能保存这次结果，还能直接继续看更深入的 Pro 分析。当前首发优惠价为 $2.99/月。',
      };
    }

    if (isLowQuota) {
      return {
        title: `当前只剩 ${quotaRemaining ?? 0} 次额度，下一轮更适合直接用 Pro`,
        body: '如果你准备继续比较更多照片，Pro 会比反复计算额度更顺手。当前首发优惠价为 $2.99/月。',
      };
    }

    if (isLowScore) {
      return {
        title: '这张照片更适合用 Pro 做一次深挖',
        body: '分数偏低时，更需要完整拆解和明确修改方向，而不只是简短总结。当前首发优惠价为 $2.99/月。',
      };
    }

    return {
      title: '想把这次结果真正转成下一轮提升，可以直接升级 Pro',
      body: '更深入的分析加上永久历史记录，更适合连续复盘和稳定提升。当前首发优惠价为 $2.99/月。',
    };
  })();

  async function handleGalleryToggle() {
    if (!review || actionBusy) return;
    if (!canManageReview || plan === 'guest') {
      setActionError(galleryActionCopy.guestBlocked);
      setActionFeedback('');
      return;
    }

    const nextVisible = !gallerySaved;
    if (nextVisible) {
      setGalleryConfirmOpen(true);
      return;
    }

    await submitGalleryToggle(false);
  }

  async function submitGalleryToggle(nextVisible: boolean) {
    if (!review || actionBusy) return;

    setActionBusy('gallery');
    setActionError('');
    setActionFeedback(nextVisible ? galleryActionCopy.pendingAdd : galleryActionCopy.pendingRemove);

    try {
      setGalleryConfirmOpen(false);
      const token = await ensureToken();
      const payload = await updateReviewMeta(review.review_id, { gallery_visible: nextVisible }, token);
      setReview((prev) => (
        prev
          ? {
              ...prev,
              favorite: payload.favorite,
              gallery_visible: payload.gallery_visible,
              gallery_audit_status: payload.gallery_audit_status,
              gallery_added_at: payload.gallery_added_at,
              gallery_rejected_reason: payload.gallery_rejected_reason,
              tags: payload.tags,
              note: payload.note,
            }
          : prev
      ));
      if (!payload.gallery_visible) {
        setActionFeedback(galleryActionCopy.doneRemove);
      } else if (payload.gallery_audit_status === 'approved') {
        setActionFeedback(galleryActionCopy.doneApproved);
      } else {
        setActionFeedback(payload.gallery_rejected_reason || galleryActionCopy.doneRejected);
      }
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBackendShareLink() {
    if (!review || actionBusy || !canManageReview) return;

    setActionBusy('share');
    setActionError('');
    setActionFeedback(actionCopy.sharePending);

    try {
      const token = await ensureToken();
      const payload = await createReviewShare(review.review_id, token);
      const sharePageUrl = new URL(`/share/${payload.share_token}`, window.location.origin).toString();
      await navigator.clipboard.writeText(sharePageUrl);
      setLinkCopied(true);
      setActionFeedback(actionCopy.shareDone);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBackendExportSummary() {
    if (!review || actionBusy || !canManageReview) return;

    setActionBusy('export');
    setActionError('');
    setActionFeedback(actionCopy.exportPending);

    try {
      const token = await ensureToken();
      const payload = await exportReview(review.review_id, token);
      const lines = [
        `# ${exportSummaryCopy.title}`,
        '',
        `- ${exportSummaryCopy.exportedAt}: ${new Date(payload.review.exported_at).toLocaleString(locale)}`,
        `- ${exportSummaryCopy.createdAt}: ${new Date(payload.review.created_at).toLocaleString(locale)}`,
        '',
        `## ${exportSummaryCopy.reviewInfo}`,
        `- ${exportSummaryCopy.reviewId}: ${payload.review.review_id}`,
        `- ${exportSummaryCopy.mode}: ${payload.review.mode === 'pro' ? 'Pro' : 'Flash'}`,
        `- ${exportSummaryCopy.imageType}: ${getImageTypeLabelForLocale(locale, payload.review.image_type)}`,
        `- ${exportSummaryCopy.model}: ${payload.review.model_name}${payload.review.model_version ? ` (${payload.review.model_version})` : ''}`,
        `- ${exportSummaryCopy.scoreSummary}: ${payload.review.final_score.toFixed(1)} / 10`,
        `- ${exportSummaryCopy.favorite}: ${payload.review.favorite ? exportSummaryCopy.yes : exportSummaryCopy.no}`,
      ];

      if (payload.review.source_review_id) {
        lines.push(`- ${exportSummaryCopy.sourceReviewId}: ${payload.review.source_review_id}`);
      }
      if (payload.review.tags.length > 0) {
        lines.push(`- ${exportSummaryCopy.tags}: ${payload.review.tags.join(' / ')}`);
      }
      if (payload.review.note) {
        lines.push(`- ${exportSummaryCopy.note}: ${payload.review.note}`);
      }

      lines.push(
        '',
        `## ${exportSummaryCopy.scores}`,
        `- ${t('score_composition')}: ${payload.review.scores.composition.toFixed(1)}`,
        `- ${t('score_lighting')}: ${payload.review.scores.lighting.toFixed(1)}`,
        `- ${t('score_color')}: ${payload.review.scores.color.toFixed(1)}`,
        `- ${t('score_impact')}: ${payload.review.scores.impact.toFixed(1)}`,
        `- ${t('score_technical')}: ${payload.review.scores.technical.toFixed(1)}`,
        '',
        `## ${exportSummaryCopy.strengths}`,
        payload.review.advantage || '-',
        '',
        `## ${exportSummaryCopy.issues}`,
        payload.review.critique || '-',
        '',
        `## ${exportSummaryCopy.suggestions}`,
        payload.review.suggestions || '-',
        '',
        `## ${exportSummaryCopy.photoInfo}`,
        `- ${exportSummaryCopy.photoId}: ${payload.photo.photo_id}`,
      );

      const blob = new Blob([lines.join('\n')], {
        type: 'text/markdown;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportSummaryCopy.filePrefix}-${review.review_id.slice(0, 8)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionFeedback(actionCopy.exportDone);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleFavoriteToggle() {
    if (!review || actionBusy || !canManageReview) return;

    const nextFavorite = !Boolean(review.favorite);
    setActionBusy('favorite');
    setActionError('');
    setActionFeedback(nextFavorite ? favoriteCopy.pendingAdd : favoriteCopy.pendingRemove);

    try {
      const token = await ensureToken();
      const payload = await updateReviewMeta(review.review_id, { favorite: nextFavorite }, token);
      setReview((prev) => (
        prev
          ? {
              ...prev,
              favorite: payload.favorite,
              tags: payload.tags,
              note: payload.note,
            }
          : prev
      ));
      setActionFeedback(payload.favorite ? favoriteCopy.doneAdd : favoriteCopy.doneRemove);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }

  function handleReplayReview() {
    if (!review || actionBusy || !canManageReview) return;

    setActionBusy('replay');
    setActionError('');
    setActionFeedback(actionCopy.replayPending);

    const nextParams = new URLSearchParams({
      source_review_id: review.review_id,
      photo_id: review.photo_id,
      mode: review.mode,
      image_type: review.image_type ?? review.result.image_type ?? 'default',
    });

    router.push(`/workspace?${nextParams.toString()}`);
  }

  return (
    <div className="pt-14 min-h-screen">
      {galleryConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setGalleryConfirmOpen(false)}
        >
          <div className="absolute inset-0 bg-[#050505]/98" />
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-[#2b2722] bg-[#11100e] p-6 shadow-[0_32px_96px_rgba(0,0,0,0.72)] animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-confirm-title"
          >
            <button
              type="button"
              onClick={() => setGalleryConfirmOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-border-subtle p-2 text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
              aria-label={galleryActionCopy.dialogCancel}
            >
              <X size={14} />
            </button>

            <div className="mb-5">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-gold/80">
                <LayoutGrid size={12} />
                {galleryActionCopy.dialogLabel}
              </p>
              <h2 id="gallery-confirm-title" className="font-display text-3xl text-ink">
                {galleryActionCopy.dialogTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{galleryActionCopy.dialogBody}</p>
              <div className="mt-4 rounded-2xl border border-[#26231f] bg-[#161412] px-4 py-3 text-xs leading-6 text-ink-muted">
                {galleryActionCopy.dialogFootnote}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setGalleryConfirmOpen(false)}
                className="rounded-full border border-border px-4 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
              >
                {galleryActionCopy.dialogCancel}
              </button>
              <button
                type="button"
                onClick={() => submitGalleryToggle(true)}
                disabled={actionBusy !== null}
                className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-gold-light disabled:opacity-60"
              >
                {galleryActionCopy.dialogConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">

        {/* Back */}
        <button
          onClick={handleBackNavigation}
          className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors mb-6"
        >
          <ArrowLeft size={12} />
          {backLabel}
        </button>

        {usageError && (
          <div className="mb-6 flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-4 py-3">
            <AlertCircle size={14} className="shrink-0" />
            <span>{usageError}</span>
          </div>
        )}

        {/* ── Score hero strip ─────────────────────────────────────────────── */}
        <div className="mb-6 rounded-xl border border-border-subtle bg-raised/50 px-6 py-5 flex items-center gap-5">
          <FinalScoreRing score={r.final_score} />
          <div className="min-w-0">
            <div className={`font-display text-2xl leading-none ${scoreLabelColor}`}>{scoreLabel}</div>
            <div className="text-xs text-ink-muted mt-1.5 leading-relaxed">{t('review_score_dims_basis')}</div>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-1.5 text-xs text-ink-subtle">
            <TrendingDown size={11} className="text-rust shrink-0" />
            <span>{t('review_score_lowest')}:</span>
            <span className="text-rust/70 ml-0.5">{weakestDim.label}</span>
          </div>
        </div>

        {/* ── Two-column layout ───────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[360px_1fr] gap-8 items-start">

          {/* ── LEFT: Photo + Scores ──────────────────────────────────────── */}
          <div className="lg:sticky lg:top-20 min-w-0">
            <div className="rounded-xl overflow-hidden border border-border-subtle bg-raised">
              {/* Photo */}
              {photoUrl && !photoError ? (
                <div
                  className="photo-frame relative cursor-zoom-in group"
                  onClick={() => {
                    setZoomMounted(true);
                    setZoomOpen(true);
                  }}
                  title={t('img_zoom_label')}
                >
                  <Image
                    src={photoUrl}
                    alt={t('review_photo_alt')}
                    width={1200}
                    height={900}
                    className="w-full max-w-full h-auto object-contain max-h-[65vh]"
                    onError={() => setPhotoError(true)}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                    unoptimized
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-void/30">
                    <ZoomIn size={32} className="text-white drop-shadow-lg" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-ink-subtle text-sm">
                  {t('review_no_image')}
                </div>
              )}

              {/* Dimension scores */}
              <div className="border-t border-border-subtle px-5 py-4 space-y-2">
                {SCORE_DIMS.map((d) => {
                  const score = (r.scores as unknown as Record<string, number>)[d.key] ?? 0;
                  const isWeakest = d.key === weakestKey;
                  const isActive = activeDim === d.key;
                  const hasTarget = (DIM_TO_TAGS[d.key]?.length ?? 0) > 0;
                  return (
                    <div
                      key={d.key}
                      className={`group/dim relative rounded px-1 -mx-1 py-0.5 transition-colors ${hasTarget ? 'cursor-pointer' : ''} ${isActive ? 'bg-gold/10' : hasTarget ? 'hover:bg-void/30' : ''}`}
                      onClick={() => handleDimClick(d.key)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`text-xs w-16 shrink-0 ${isWeakest ? 'text-rust' : isActive ? 'text-gold' : 'text-ink-muted'}`}>
                          {d.label}
                        </span>
                        <div className="flex-1 h-1.5 bg-void/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${getDimColorClass(score)}`}
                            style={{ width: `${score * 10}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono w-7 text-right shrink-0 ${getDimTextClass(score)}`}>
                          {score.toFixed(1)}
                        </span>
                        {isWeakest && <TrendingDown size={10} className="text-rust shrink-0" />}
                        {/* Hover arrow: appears only when the row has a candidate tag and is not already weakest-marked */}
                        {hasTarget && (
                          <span className="text-[10px] text-gold/0 group-hover/dim:text-gold/50 transition-colors shrink-0 select-none" aria-hidden>↓</span>
                        )}
                      </div>
                      {/* Dimension tooltip: shows description + click hint */}
                      <div className="pointer-events-none absolute left-0 bottom-full mb-2 z-10 hidden group-hover/dim:block w-60 rounded-md bg-surface border border-border-subtle px-3 py-2 shadow-lg">
                        <p className="text-[11px] text-ink-muted leading-relaxed">{d.desc}</p>
                        {hasTarget && (
                          <p className="text-[10px] text-gold/70 mt-1.5 pt-1.5 border-t border-border-subtle flex items-center gap-1">
                            <span aria-hidden>↓</span>
                            {t('dim_click_hint')}
                          </p>
                        )}
                        <div className="absolute left-4 top-full w-2 h-2 overflow-hidden">
                          <div className="w-2 h-2 bg-surface border-r border-b border-border-subtle rotate-45 -translate-y-1" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta footer */}
              <div className="border-t border-border-subtle px-5 py-2.5 space-y-0.5">
                <p className="text-xs text-ink-subtle font-mono">
                  {new Date(review.created_at).toLocaleString(locale)} · #{review.review_id.slice(0, 8)}
                </p>
                {imgNaturalSize && (
                  <p className="text-xs text-ink-subtle font-mono">
                    {t('review_img_resolution')}: {imgNaturalSize.w} × {imgNaturalSize.h}
                  </p>
                )}
                {review.exif_data && (() => {
                  const exif = review.exif_data;
                  const make = typeof exif.Make === 'string' ? exif.Make.trim() : '';
                  const model = typeof exif.Model === 'string' ? exif.Model.trim() : '';
                  const camera = model.startsWith(make) || !make ? model : `${make} ${model}`;
                  const lens = typeof exif.LensModel === 'string' ? exif.LensModel.trim() : '';
                  const focalRaw = exif.FocalLength;
                  const focal35 = exif.FocalLengthIn35mm;
                  const focal = typeof focalRaw === 'number' && focalRaw > 0
                    ? `${focalRaw % 1 === 0 ? focalRaw : focalRaw.toFixed(1)} mm${typeof focal35 === 'number' && focal35 > 0 && focal35 !== focalRaw ? ` (35mm: ${focal35} mm)` : ''}`
                    : '';
                  const fNumber = exif.FNumber;
                  const aperture = typeof fNumber === 'number' && fNumber > 0 ? `f/${fNumber % 1 === 0 ? fNumber : fNumber.toFixed(1)}` : '';
                  const shutter = formatExposureValue(exif.ExposureTime);
                  const iso = typeof exif.ISO === 'number' && exif.ISO > 0 ? String(exif.ISO) : '';
                  const rows: [string, string][] = [
                    [t('review_exif_camera'), camera],
                    [t('review_exif_lens'), lens],
                    [t('review_exif_focal'), focal],
                    [t('review_exif_aperture'), aperture],
                    [t('review_exif_shutter'), shutter],
                    [t('review_exif_iso'), iso],
                  ].filter(([, v]) => v) as [string, string][];
                  if (rows.length === 0) return null;
                  return (
                    <div className="pt-1.5 mt-0.5 border-t border-border-subtle/50 space-y-0.5">
                      <p className="text-[10px] text-ink-muted uppercase tracking-widest font-mono mb-1">{t('review_exif_params')}</p>
                      {rows.map(([label, value]) => (
                        <p key={label} className="text-xs text-ink-subtle font-mono truncate">
                          <span className="text-ink-muted">{label}: </span>{value}
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Results ───────────────────────────────────────────── */}
          <div className="space-y-6 min-w-0">

            {/* Header */}
            <div>
              <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">— {t('review_page_label')}</p>
              <h1 className="font-display text-3xl sm:text-4xl mb-2">{t('review_page_headline')}</h1>
              <p className="text-sm text-ink-muted mb-3 leading-relaxed">{scoreSummary}</p>
              {/* Metadata row: mode · status · date */}
              <div className="flex items-center gap-2 text-xs text-ink-subtle">
                <span className={review.mode === 'pro' ? 'text-gold font-medium' : 'text-ink-muted'}>
                  {review.mode === 'pro' ? 'Pro' : 'Flash'}
                </span>
                <span>·</span>
                <span className="text-sage">{t('status_succeeded')}</span>
                <span>·</span>
                <span>{new Date(review.created_at).toLocaleDateString(locale)}</span>
              </div>
            </div>

            {/* Action buttons */}
            {showPersonalActions && (
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => router.push('/workspace')}
                  className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
                >
                  <Upload size={13} />
                  {t('review_btn_upload_next')}
                </button>
                {showOwnerActions && (
                  <>
                    <button
                      onClick={handleReplayReview}
                      disabled={actionBusy !== null}
                      className="flex items-center gap-2 px-4 py-2 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors disabled:opacity-60"
                    >
                      <RotateCcw size={13} />
                      {t('review_btn_again')}
                    </button>
                    {userInfo?.plan !== 'guest' && (
                      <Link
                        href="/account/reviews"
                        className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
                      >
                        <History size={13} />
                        {t('review_btn_history_all')}
                      </Link>
                    )}
                    <button
                      onClick={handleFavoriteToggle}
                      disabled={actionBusy !== null}
                      className={`flex items-center gap-2 px-4 py-2 border text-sm rounded transition-colors disabled:opacity-60 ${
                        review.favorite
                          ? 'border-rust/35 bg-rust/10 text-rust hover:bg-rust/15'
                          : 'border-border text-ink-muted hover:border-rust/35 hover:text-rust'
                      }`}
                    >
                      <Heart size={13} className={review.favorite ? 'fill-current' : ''} />
                      {review.favorite ? favoriteCopy.remove : favoriteCopy.add}
                    </button>
                    <button
                      onClick={handleBackendShareLink}
                      disabled={actionBusy !== null}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors disabled:opacity-60"
                    >
                      {linkCopied ? <Check size={13} className="text-sage" /> : <Share2 size={13} />}
                      {linkCopied ? t('review_link_copied') : t('review_share_link')}
                    </button>
                    <button
                      onClick={handleBackendExportSummary}
                      disabled={actionBusy !== null}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors disabled:opacity-60"
                    >
                      <Download size={13} />
                      {t('review_export_summary')}
                    </button>
                  </>
                )}
              </div>
            )}

            {(actionFeedback || actionError) && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${actionError ? 'border-rust/20 bg-rust/5 text-rust' : 'border-sage/20 bg-sage/5 text-sage'}`}>
                {actionError || actionFeedback}
              </div>
            )}

            <div className="border-t border-border-subtle" />

            {/* Critique sections */}
            <div className="space-y-6 max-w-2xl">
              <CritiqueSection
                accent="text-sage"
                borderColor="border-sage"
                bgColor="bg-sage/5"
                icon={<ThumbsUp size={13} />}
                title={t('review_advantage')}
                body={displayAdvantage}
                isPro={isPro}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-rust"
                borderColor="border-rust"
                bgColor="bg-rust/5"
                icon={<AlertTriangle size={13} />}
                title={t('review_critique')}
                body={displayCritique}
                isPro={isPro}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-gold"
                borderColor="border-gold"
                bgColor="bg-gold/5"
                icon={<Lightbulb size={13} />}
                title={t('review_suggestions')}
                body={displaySuggestions}
                showTags
                showFeedback
                isPro={isPro}
                highlightTop={2}
                highlightedId={highlightedCardId}
              />
            </div>

            {showGalleryCta && (
              <section className="relative overflow-hidden rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.14),transparent_36%),rgba(18,16,13,0.76)] px-5 py-5">
                <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:20px_20px]" />
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-xl">
                    <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-gold/80">
                      <LayoutGrid size={12} />
                      {t('review_gallery_label')}
                    </p>
                    <h2 className="font-display text-2xl text-ink">{reviewGalleryCardCopy.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-ink-muted">{reviewGalleryCardCopy.body}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-stretch gap-2 lg:min-w-[172px]">
                    <button
                      type="button"
                      onClick={handleGalleryToggle}
                      disabled={actionBusy !== null}
                      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium leading-5 whitespace-nowrap text-center transition-colors disabled:opacity-60 ${
                        gallerySaved
                          ? 'border border-sage/30 bg-sage/10 text-sage hover:bg-sage/15'
                          : 'bg-gold text-void hover:bg-gold-light'
                      }`}
                    >
                      {gallerySaved ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
                      {gallerySaved ? t('review_gallery_remove') : t('review_gallery_add')}
                    </button>
                    <Link
                      href="/gallery"
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-border-subtle px-5 py-3 text-sm leading-5 whitespace-nowrap text-center text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
                    >
                      <LayoutGrid size={14} />
                      {t('review_gallery_open')}
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* AI disclaimer */}
            <p className="text-xs text-ink-subtle pt-2 border-t border-border-subtle">
              {t('review_ai_disclaimer')}
            </p>

            {showPersonalActions && (
              <ProPromoCard
                plan={plan === 'guest' ? 'guest' : plan === 'pro' ? 'pro' : 'free'}
                scene="review"
                title={plan === 'pro' ? undefined : reviewPromoCopy.title}
                body={plan === 'pro' ? undefined : reviewPromoCopy.body}
                fallbackRedirectUrl={`/reviews/${review.review_id}`}
                className="mt-2"
              />
            )}

          </div>
        </div>
      </div>

      {/* ── Image zoom overlay ───────────────────────────────────────────── */}
      {zoomMounted && photoUrl && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm transition-opacity duration-200 ${zoomOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setZoomOpen(false)}
          aria-hidden={!zoomOpen}
        >
          <button
            onClick={() => setZoomOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-raised/80 border border-border-subtle text-ink-muted hover:text-ink transition-colors"
            aria-label={t('img_zoom_close')}
          >
            <X size={18} />
          </button>
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={photoUrl}
              alt={t('review_photo_zoom_alt')}
              width={2400}
              height={1800}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              unoptimized
            />
          </div>
        </div>
      )}
    </div>
  );
}
