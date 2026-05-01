import { normalizeLocale } from './locale.ts';

export type ContentConversionLocale = 'zh' | 'en' | 'ja';
export type ContentConversionSource = 'home_direct' | 'blog' | 'gallery';
export type ContentConversionEntrypoint =
  | 'blog_same_critique'
  | 'blog_topic_upload'
  | 'gallery_practice'
  | 'gallery_score_standard'
  | 'home_new_user'
  | 'home_content_reader';
export type HomeIntent = 'new_user' | 'returning_user' | 'content_reader';
export type ConversionImageType = 'default' | 'landscape' | 'portrait' | 'street' | 'still_life' | 'architecture';

export type WorkspaceConversionHrefInput = {
  source: ContentConversionSource;
  entrypoint: ContentConversionEntrypoint;
  imageType?: ConversionImageType;
  contentSlug?: string;
  galleryReviewId?: string;
};

export type BlogWorkspaceCta = {
  label: string;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta: string;
  href: string;
  imageType: ConversionImageType;
  entrypoint: ContentConversionEntrypoint;
};

export type GalleryWorkspaceCtas = {
  practice: {
    title: string;
    body: string;
    cta: string;
    href: string;
    entrypoint: ContentConversionEntrypoint;
  };
  standard: {
    title: string;
    body: string;
    cta: string;
    href: string;
    entrypoint: ContentConversionEntrypoint;
  };
};

export type HomeIntentEntrance = {
  intent: HomeIntent;
  label: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  source: ContentConversionSource;
  entrypoint?: ContentConversionEntrypoint;
};

type BlogTopic = {
  imageType: ConversionImageType;
  zh: { topic: string; body: string };
  en: { topic: string; body: string };
  ja: { topic: string; body: string };
};

const BLOG_TOPIC_BY_SLUG: Record<string, BlogTopic> = {
  'ai-photo-critique-daily-practice': {
    imageType: 'default',
    zh: {
      topic: '日常练习',
      body: '把刚读到的练习方法带进真实照片，用一次点评确认下一轮拍摄该先改哪里。',
    },
    en: {
      topic: 'daily practice',
      body: 'Bring the practice loop into a real photo and see which next step matters most.',
    },
    ja: {
      topic: '日常練習',
      body: '読んだ練習方法を実際の写真で試し、次に直すべき点を確認しましょう。',
    },
  },
  'five-photo-composition-checks': {
    imageType: 'default',
    zh: {
      topic: '构图检查',
      body: '上传一张你觉得“差一点”的照片，用同一套构图检查项看主体、边缘、层次和动线。',
    },
    en: {
      topic: 'composition checks',
      body: 'Upload a frame that feels almost there and run the same composition checks on subject, edges, depth, and flow.',
    },
    ja: {
      topic: '構図チェック',
      body: '惜しいと感じる1枚をアップロードし、主題・端・奥行き・視線誘導を同じ基準で確認します。',
    },
  },
  'turn-photo-feedback-into-shooting-checklist': {
    imageType: 'default',
    zh: {
      topic: '拍摄清单',
      body: '上传这轮作品，把反馈压缩成下一次拍摄前真正能执行的 3 条动作。',
    },
    en: {
      topic: 'shooting checklist',
      body: 'Upload the current round and turn the critique into three actions for the next shoot.',
    },
    ja: {
      topic: '撮影チェックリスト',
      body: '今回の写真をアップロードし、講評を次回撮影の3つの行動に変えます。',
    },
  },
  'lighting-mistakes-ai-catches': {
    imageType: 'portrait',
    zh: {
      topic: '光线问题',
      body: '上传一张光线拿不准的照片，让点评先抓曝光、色温、阴影和方向感。',
    },
    en: {
      topic: 'lighting issues',
      body: 'Upload a photo with uncertain light and check exposure, color temperature, shadows, and direction.',
    },
    ja: {
      topic: '光の問題',
      body: '光に迷う1枚をアップロードし、露出・色温度・影・方向性を確認します。',
    },
  },
  'color-grading-photography-guide': {
    imageType: 'landscape',
    zh: {
      topic: '色彩判断',
      body: '上传一张色彩不够稳定的照片，检查色温、色彩关系、饱和度和情绪是否统一。',
    },
    en: {
      topic: 'color decisions',
      body: 'Upload a color-sensitive frame and check temperature, color relationships, saturation, and mood.',
    },
    ja: {
      topic: '色彩判断',
      body: '色が安定しない1枚で、色温度・配色・彩度・感情の一致を確認します。',
    },
  },
  'street-photography-ai-review-workflow': {
    imageType: 'street',
    zh: {
      topic: '街头摄影流程',
      body: '上传一张街拍，按同样的拍摄-点评-复盘流程检查构图、瞬间和画面冲击力。',
    },
    en: {
      topic: 'street workflow',
      body: 'Upload a street frame and review composition, timing, and impact with the same workflow.',
    },
    ja: {
      topic: 'ストリート撮影',
      body: 'ストリートの1枚をアップロードし、構図・瞬間・インパクトを同じ流れで確認します。',
    },
  },
};

const FALLBACK_TOPIC: BlogTopic = {
  imageType: 'default',
  zh: {
    topic: '照片点评',
    body: '上传一张真实照片，把文章里的方法转成下一次拍摄前能执行的建议。',
  },
  en: {
    topic: 'photo critique',
    body: 'Upload a real photo and turn the article into advice you can use before the next shoot.',
  },
  ja: {
    topic: '写真講評',
    body: '実際の写真をアップロードし、記事の内容を次回撮影に使える提案に変えます。',
  },
};

const BLOG_COPY = {
  zh: {
    label: '从文章进入工作台',
    titlePrefix: '用这篇的',
    titleSuffix: '点评你的照片',
    primaryCta: '立即试试同类点评',
    secondaryCta: '上传对应题材照片',
  },
  en: {
    label: 'From article to workspace',
    titlePrefix: 'Use this',
    titleSuffix: 'guide on your photo',
    primaryCta: 'Try a similar critique',
    secondaryCta: 'Upload a matching photo',
  },
  ja: {
    label: '記事からワークスペースへ',
    titlePrefix: 'この記事の',
    titleSuffix: '基準で写真を講評',
    primaryCta: '同じ講評を試す',
    secondaryCta: '対応する写真をアップロード',
  },
} as const;

const IMAGE_TYPE_LABELS: Record<ContentConversionLocale, Record<ConversionImageType, string>> = {
  zh: {
    default: '通用题材',
    landscape: '风景',
    portrait: '人像',
    street: '街头',
    still_life: '静物',
    architecture: '建筑',
  },
  en: {
    default: 'general',
    landscape: 'landscape',
    portrait: 'portrait',
    street: 'street',
    still_life: 'still life',
    architecture: 'architecture',
  },
  ja: {
    default: '汎用',
    landscape: '風景',
    portrait: 'ポートレート',
    street: 'ストリート',
    still_life: '静物',
    architecture: '建築',
  },
};

const GALLERY_COPY = {
  zh: {
    practiceTitle: '同题材模仿练习',
    practiceBody: (imageType: string) => `从这张 ${imageType} 作品借一个目标，再上传你的照片做同题材练习。`,
    practiceCta: '练习同题材',
    standardTitle: '用这套标准点评我的照片',
    standardBody: '保留当前题材和参考作品上下文，回到工作台用同样标准检查你的照片。',
    standardCta: '用这套标准点评我的照片',
  },
  en: {
    practiceTitle: 'Practice the same subject',
    practiceBody: (imageType: string) => `Borrow one target from this ${imageType} critique, then upload your own frame.`,
    practiceCta: 'Practice this subject',
    standardTitle: 'Use this standard on my photo',
    standardBody: 'Keep the subject and reference context, then critique your own photo with the same standard.',
    standardCta: 'Use this standard',
  },
  ja: {
    practiceTitle: '同じ題材で練習',
    practiceBody: (imageType: string) => `この${imageType}作品から目標を1つ借り、自分の写真をアップロードします。`,
    practiceCta: '同じ題材で練習',
    standardTitle: 'この基準で自分の写真を講評',
    standardBody: '題材と参考作品の文脈を残したまま、同じ基準で自分の写真を確認します。',
    standardCta: 'この基準で講評',
  },
} as const;

const HOME_INTENT_COPY: Record<ContentConversionLocale, HomeIntentEntrance[]> = {
  zh: [
    {
      intent: 'new_user',
      label: '新用户',
      title: '现在上传第一张照片',
      body: '不需要先研究功能，先拿一张真实照片跑完首评闭环。',
      cta: '立刻上传',
      href: buildWorkspaceConversionHref({ source: 'home_direct', entrypoint: 'home_new_user' }),
      source: 'home_direct',
      entrypoint: 'home_new_user',
    },
    {
      intent: 'returning_user',
      label: '回访用户',
      title: '继续上次点评',
      body: '回到历史记录，复用上次结果继续复拍、再分析或对比弱项。',
      cta: '查看历史',
      href: '/account/reviews',
      source: 'home_direct',
    },
    {
      intent: 'content_reader',
      label: '内容流量',
      title: '从文章直接进入工作台',
      body: '读完构图、光线或街拍文章后，直接带着同题材标准上传照片。',
      cta: '按文章方法试一张',
      href: buildWorkspaceConversionHref({ source: 'blog', entrypoint: 'home_content_reader' }),
      source: 'blog',
      entrypoint: 'home_content_reader',
    },
  ],
  en: [
    {
      intent: 'new_user',
      label: 'New user',
      title: 'Upload the first photo now',
      body: 'Do not study the product first. Run one real photo through the first critique loop.',
      cta: 'Upload now',
      href: buildWorkspaceConversionHref({ source: 'home_direct', entrypoint: 'home_new_user' }),
      source: 'home_direct',
      entrypoint: 'home_new_user',
    },
    {
      intent: 'returning_user',
      label: 'Returning',
      title: 'Continue the last critique',
      body: 'Open history and use the last result for a retake, re-analysis, or weak-dimension check.',
      cta: 'View history',
      href: '/account/reviews',
      source: 'home_direct',
    },
    {
      intent: 'content_reader',
      label: 'Content traffic',
      title: 'Move from article to workspace',
      body: 'After reading a guide, upload a matching frame with that subject standard already selected.',
      cta: 'Try one from a guide',
      href: buildWorkspaceConversionHref({ source: 'blog', entrypoint: 'home_content_reader' }),
      source: 'blog',
      entrypoint: 'home_content_reader',
    },
  ],
  ja: [
    {
      intent: 'new_user',
      label: '新規ユーザー',
      title: '最初の1枚を今アップロード',
      body: '機能を先に調べず、実際の写真で最初の講評ループを完了します。',
      cta: '今すぐアップロード',
      href: buildWorkspaceConversionHref({ source: 'home_direct', entrypoint: 'home_new_user' }),
      source: 'home_direct',
      entrypoint: 'home_new_user',
    },
    {
      intent: 'returning_user',
      label: '再訪ユーザー',
      title: '前回の講評を続ける',
      body: '履歴に戻り、撮り直し・再分析・弱点確認へ進みます。',
      cta: '履歴を見る',
      href: '/account/reviews',
      source: 'home_direct',
    },
    {
      intent: 'content_reader',
      label: '記事からの流入',
      title: '記事から直接ワークスペースへ',
      body: '構図・光・ストリートの記事を読んだ後、同じ基準で写真をアップロードします。',
      cta: '記事の方法で試す',
      href: buildWorkspaceConversionHref({ source: 'blog', entrypoint: 'home_content_reader' }),
      source: 'blog',
      entrypoint: 'home_content_reader',
    },
  ],
};

function appendIfPresent(params: URLSearchParams, key: string, value: string | undefined): void {
  const normalized = value?.trim();
  if (normalized) {
    params.set(key, normalized);
  }
}

export function buildWorkspaceConversionHref(input: WorkspaceConversionHrefInput): string {
  const params = new URLSearchParams();
  params.set('source', input.source);
  params.set('entrypoint', input.entrypoint);
  appendIfPresent(params, 'image_type', input.imageType);
  appendIfPresent(params, 'content_slug', input.contentSlug);
  appendIfPresent(params, 'gallery_review_id', input.galleryReviewId);
  return `/workspace?${params.toString()}`;
}

export function getBlogWorkspaceCta(
  locale: string,
  post: { slug: string; category: string },
): BlogWorkspaceCta {
  const normalizedLocale = normalizeLocale(locale);
  const topic = BLOG_TOPIC_BY_SLUG[post.slug] ?? FALLBACK_TOPIC;
  const localizedTopic = topic[normalizedLocale];
  const copy = BLOG_COPY[normalizedLocale];
  const title =
    normalizedLocale === 'en'
      ? `${copy.titlePrefix} ${localizedTopic.topic} ${copy.titleSuffix}`
      : `${copy.titlePrefix}${localizedTopic.topic}${copy.titleSuffix}`;

  return {
    label: copy.label,
    title,
    body: localizedTopic.body,
    primaryCta: copy.primaryCta,
    secondaryCta: copy.secondaryCta,
    href: buildWorkspaceConversionHref({
      source: 'blog',
      entrypoint: 'blog_same_critique',
      imageType: topic.imageType,
      contentSlug: post.slug,
    }),
    imageType: topic.imageType,
    entrypoint: 'blog_same_critique',
  };
}

export function getGalleryWorkspaceCtas(
  locale: string,
  item: { review_id: string; image_type: ConversionImageType },
): GalleryWorkspaceCtas {
  const normalizedLocale = normalizeLocale(locale);
  const copy = GALLERY_COPY[normalizedLocale];
  const imageTypeLabel = IMAGE_TYPE_LABELS[normalizedLocale][item.image_type] ?? IMAGE_TYPE_LABELS[normalizedLocale].default;

  return {
    practice: {
      title: copy.practiceTitle,
      body: copy.practiceBody(imageTypeLabel),
      cta: copy.practiceCta,
      href: buildWorkspaceConversionHref({
        source: 'gallery',
        entrypoint: 'gallery_practice',
        imageType: item.image_type,
        galleryReviewId: item.review_id,
      }),
      entrypoint: 'gallery_practice',
    },
    standard: {
      title: copy.standardTitle,
      body: copy.standardBody,
      cta: copy.standardCta,
      href: buildWorkspaceConversionHref({
        source: 'gallery',
        entrypoint: 'gallery_score_standard',
        imageType: item.image_type,
        galleryReviewId: item.review_id,
      }),
      entrypoint: 'gallery_score_standard',
    },
  };
}

export function getHomeIntentEntrances(locale: string): HomeIntentEntrance[] {
  return HOME_INTENT_COPY[normalizeLocale(locale)];
}
