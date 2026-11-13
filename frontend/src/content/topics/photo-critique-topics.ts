/**
 * Photo-critique topic landing pages (`/photo-critique/[topic]`).
 *
 * Each topic maps to an existing workspace image type, so the page only describes
 * genre handling the scorer actually applies (see GENRE_LOGIC in
 * backend/app/services/ai_prompts.py). Do not add a topic here without a matching
 * image type: a page must not imply specialised analysis the product lacks.
 */

export type PhotoCritiqueTopicLocale = 'en' | 'zh' | 'ja';
export type PhotoCritiqueTopicImageType = 'portrait' | 'street' | 'landscape';
export type PhotoCritiqueTopicDimension = 'composition' | 'lighting' | 'color' | 'impact' | 'technical';

export type PhotoCritiqueTopicCopy = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  intro: string;
  checksTitle: string;
  checksIntro: string;
  dimensions: Record<PhotoCritiqueTopicDimension, { label: string; body: string }>;
  issuesTitle: string;
  issues: string[];
  workflowTitle: string;
  workflow: string[];
  limitsTitle: string;
  limits: string[];
  faqTitle: string;
  faq: Array<{ question: string; answer: string }>;
  samplesTitle: string;
  samplesBody: string;
  samplesEmpty: string;
  samplesExample: string;
  samplesAll: string;
  ctaTitle: string;
  ctaBody: string;
  ctaPrimary: string;
  relatedTitle: string;
};

export type PhotoCritiqueTopic = {
  slug: string;
  imageType: PhotoCritiqueTopicImageType;
  lastReviewed: string;
  relatedBlogSlugs: string[];
  keywords: string[];
  copy: Record<PhotoCritiqueTopicLocale, PhotoCritiqueTopicCopy>;
};

export const PHOTO_CRITIQUE_TOPIC_ROOT = '/photo-critique';

const SHARED_LIMITS = {
  en: [
    'One photo per critique. PicSpeak does not rank or cull a batch of frames for you.',
    'Scores are one AI model\'s judgment against master-level work in the same genre, not a verified grade or a contest result.',
    'Missing EXIF or an unusual style is not a reason to reject a photo, and a deliberate style is judged by what it does in the frame.',
  ],
  zh: [
    '每次点评一张照片。PicSpeak 不会替你在一批照片里排序或选片。',
    '分数是单个 AI 模型以同题材大师级作品为参照给出的判断，不是经过验证的等级或比赛结果。',
    '缺少 EXIF 或风格特别不会成为拒绝点评的理由；刻意的风格按它在画面中的作用来评价。',
  ],
  ja: [
    '講評は1回につき1枚です。複数の写真を並べて順位付けやセレクトをする機能はありません。',
    'スコアは、同じジャンルの第一級の作品を基準にした AI モデル1つの判断で、検証済みの評価やコンテスト結果ではありません。',
    'EXIF がない、スタイルが独特、という理由で講評を断ることはありません。意図したスタイルは、画面の中での役割で判断します。',
  ],
} satisfies Record<PhotoCritiqueTopicLocale, string[]>;

const SHARED_WORKFLOW = {
  en: [
    'Upload one frame and keep the type set to this genre so the five dimensions are read the genre-specific way.',
    'Read the weakest dimension first and pick the single next-shoot action attached to it.',
    'Reshoot the same scene and use Retake Coach to compare both frames in one paired request.',
  ],
  zh: [
    '上传一张照片，并把题材保持为当前题材，五个维度会按这个题材的方式解读。',
    '先看得分最低的维度，只挑它对应的一条下一次拍摄动作。',
    '回到同一场景重拍，用复拍教练在同一次配对请求里比较两张照片。',
  ],
  ja: [
    '1枚をアップロードし、題材をこのジャンルのままにすると、5項目がジャンルに合わせて読まれます。',
    'まず最も低い項目を見て、それに対応する次の撮影アクションを1つだけ選びます。',
    '同じ場面で撮り直し、Retake Coach で2枚を1回のペア比較で見比べます。',
  ],
} satisfies Record<PhotoCritiqueTopicLocale, string[]>;

const SHARED_CHROME = {
  en: {
    checksTitle: 'What the critique checks',
    issuesTitle: 'Worth checking before you upload',
    workflowTitle: 'How to use it',
    limitsTitle: 'What it does not do',
    faqTitle: 'Questions',
    samplesBody: 'Real critiques photographers chose to publish in the gallery.',
    samplesEmpty: 'No public critiques in this genre yet.',
    samplesExample: 'Open the example critique',
    ctaPrimary: 'Critique my photo',
    relatedTitle: 'Related Lens Notes',
  },
  zh: {
    checksTitle: '点评会看什么',
    issuesTitle: '上传前值得先检查',
    workflowTitle: '怎么用',
    limitsTitle: '它不做什么',
    faqTitle: '常见问题',
    samplesBody: '作者主动发布到公开长廊的真实点评。',
    samplesEmpty: '这个题材还没有公开点评。',
    samplesExample: '查看示例点评',
    ctaPrimary: '点评我的照片',
    relatedTitle: '相关 Lens Notes',
  },
  ja: {
    checksTitle: '講評で見るポイント',
    issuesTitle: 'アップロード前に確認したいこと',
    workflowTitle: '使い方',
    limitsTitle: 'できないこと',
    faqTitle: 'よくある質問',
    samplesBody: '撮影者がギャラリーに公開した実際の講評です。',
    samplesEmpty: 'このジャンルの公開講評はまだありません。',
    samplesExample: 'サンプル講評を見る',
    ctaPrimary: '写真を講評する',
    relatedTitle: '関連する Lens Notes',
  },
} as const;

export const PHOTO_CRITIQUE_TOPICS: readonly PhotoCritiqueTopic[] = [
  {
    slug: 'portrait',
    imageType: 'portrait',
    lastReviewed: '2026-11-13',
    relatedBlogSlugs: ['subject-background-separation-portrait-street', 'lighting-mistakes-ai-catches'],
    keywords: ['AI portrait photo critique', 'portrait photography feedback', 'portrait photo review', 'rate my portrait photo'],
    copy: {
      en: {
        ...SHARED_CHROME.en,
        metaTitle: 'AI Portrait Photo Critique: Scores and Feedback',
        metaDescription:
          'Upload a portrait for an AI critique of subject placement, facial light, skin tone, expression, and focus, with one concrete next-shoot action.',
        eyebrow: 'Portrait critique',
        title: 'AI portrait photo critique',
        intro:
          'Portraits fail in small, specific ways: light that misses the eyes, a bright edge that steals attention, focus that lands on the ear. PicSpeak reads a portrait the way a portrait photographer would and tells you which of those to fix first.',
        checksIntro: 'With the type set to Portrait, the five scores are read with portrait-specific meanings:',
        dimensions: {
          composition: { label: 'Composition', body: 'Where the person sits in the frame, headroom and crop points, and whether the background supports or competes.' },
          lighting: { label: 'Lighting', body: 'Light on the face: direction, catchlights, and whether shadows shape the features or hide them.' },
          color: { label: 'Color', body: 'Skin tone and the overall palette, including color casts from mixed light.' },
          impact: { label: 'Impact', body: 'Expression and mood: whether the frame carries an emotion or just records a face.' },
          technical: { label: 'Technique', body: 'Focus on the eyes, depth-of-field choices, and how the background blur behaves.' },
        },
        issues: [
          'Is the nearer eye sharp at 100%?',
          'Does any bright patch near the frame edge pull the eye away from the face?',
          'Do limbs or the top of the head end on an awkward crop line?',
          'Does the background separate from the subject in tone, color, or distance?',
        ],
        workflow: SHARED_WORKFLOW.en,
        limits: [...SHARED_LIMITS.en, 'It critiques the photograph, not the person: it does not judge appearance or retouch skin.'],
        faq: [
          {
            question: 'Will it tell me to smooth skin or follow a standard crop?',
            answer:
              'No. A close crop or visible texture can be the point of a portrait. The critique only suggests a change when something in the frame works against the picture, such as a distracting highlight or missed focus.',
          },
          {
            question: 'Can I use it on phone portraits?',
            answer:
              'Yes. Upload a JPG, PNG, or WebP up to 20 MB. Portrait-mode blur is read like any other background blur: it is judged by whether it separates the subject cleanly.',
          },
          {
            question: 'Do I need an account?',
            answer:
              'No. Guests can run one Flash critique per day without signing up. A free account adds more monthly critiques, Pro-mode critiques, and saved history.',
          },
        ],
        samplesTitle: 'Portrait critiques from the gallery',
        samplesAll: 'See all portrait critiques',
        ctaTitle: 'Get a portrait critique',
        ctaBody: 'Upload one portrait. You will get five scores, what works, what holds it back, and one action for the next session.',
      },
      zh: {
        ...SHARED_CHROME.zh,
        metaTitle: 'AI 人像摄影点评：评分与改进建议',
        metaDescription: '上传一张人像，AI 会点评人物构图、面部光线、肤色、情绪表达与对焦，并给出一条下一次拍摄就能执行的建议。',
        eyebrow: '人像点评',
        title: 'AI 人像摄影点评',
        intro:
          '人像照片的问题往往很具体：光没有打到眼睛、画面边缘有一块亮斑抢走注意力、焦点落在耳朵上。PicSpeak 按人像摄影的思路读照片，告诉你哪一项该先改。',
        checksIntro: '题材选为“人像”时，五个分数按人像的含义解读：',
        dimensions: {
          composition: { label: '构图', body: '人物在画面里的位置、头顶空间和裁切点，以及背景是在衬托还是在抢戏。' },
          lighting: { label: '光线', body: '面部的光：方向、眼神光，以及阴影是在塑造五官还是在遮挡。' },
          color: { label: '色彩', body: '肤色和整体色调，包括混合光源造成的偏色。' },
          impact: { label: '表达', body: '表情与情绪：画面是在传达一种感受，还是只记录了一张脸。' },
          technical: { label: '技术', body: '眼睛是否清晰、景深选择，以及背景虚化的质感。' },
        },
        issues: ['放大到 100% 时，离镜头更近的那只眼睛清楚吗？', '画面边缘附近有没有亮块把视线从脸上拉走？', '手脚或头顶是否被裁在别扭的位置？', '背景和人物在明暗、色彩或距离上分开了吗？'],
        workflow: SHARED_WORKFLOW.zh,
        limits: [...SHARED_LIMITS.zh, '它点评的是照片，不是人：不评价长相，也不做磨皮修图。'],
        faq: [
          { question: '它会要求我磨皮或按标准方式裁切吗？', answer: '不会。近距离裁切或保留皮肤质感本身可能就是这张人像的意图。只有画面里有东西在削弱照片时，比如分散注意力的高光或跑焦，点评才会建议修改。' },
          { question: '手机拍的人像可以用吗？', answer: '可以。支持 20 MB 以内的 JPG、PNG、WebP。人像模式的虚化和其他虚化一样，按它是否把人物干净地分离出来评价。' },
          { question: '需要注册吗？', answer: '不需要。游客每天可以免注册做 1 次 Flash 点评；免费账号有更多月度次数、Pro 模式点评和历史记录。' },
        ],
        samplesTitle: '长廊里的人像点评',
        samplesAll: '查看全部人像点评',
        ctaTitle: '获取人像点评',
        ctaBody: '上传一张人像，你会得到五个维度的分数、优点、主要问题，以及下一次拍摄的一条动作。',
      },
      ja: {
        ...SHARED_CHROME.ja,
        metaTitle: 'AI ポートレート写真講評：スコアと改善提案',
        metaDescription: 'ポートレートをアップロードすると、人物の配置、顔の光、肌色、表情、ピントを AI が講評し、次の撮影で試せる提案を1つ返します。',
        eyebrow: 'ポートレート講評',
        title: 'AI ポートレート写真講評',
        intro:
          'ポートレートのつまずきは具体的です。目に光が届いていない、端の明るい部分が視線を奪う、ピントが耳に合っている。PicSpeak はポートレート撮影の視点で写真を読み、どれから直すべきかを示します。',
        checksIntro: '題材を「ポートレート」にすると、5つのスコアはポートレート向けの意味で読まれます。',
        dimensions: {
          composition: { label: '構図', body: '人物の位置、頭上の余白と切れ位置、背景が引き立てているか競合しているか。' },
          lighting: { label: '光', body: '顔に当たる光の方向、キャッチライト、影が顔立ちを形づくっているか隠しているか。' },
          color: { label: '色彩', body: '肌の色と全体のトーン。ミックス光による色かぶりも含みます。' },
          impact: { label: '印象', body: '表情と雰囲気。感情が伝わるか、顔を記録しただけか。' },
          technical: { label: '技術', body: '目へのピント、被写界深度の選び方、背景ボケの質。' },
        },
        issues: ['手前の目は等倍で見てシャープですか？', '画面の端近くに、顔から視線を奪う明るい部分はありませんか？', '手足や頭頂が不自然な位置で切れていませんか？', '背景と人物は明暗・色・距離のどれかで分かれていますか？'],
        workflow: SHARED_WORKFLOW.ja,
        limits: [...SHARED_LIMITS.ja, '講評するのは写真で、人物ではありません。容姿の評価や肌のレタッチは行いません。'],
        faq: [
          { question: '肌をなめらかにする、標準的なトリミングにする、と言われますか？', answer: 'いいえ。寄ったトリミングや肌の質感そのものが狙いのこともあります。目立つハイライトやピントのずれなど、写真の邪魔になるものがある時だけ変更を提案します。' },
          { question: 'スマホのポートレートでも使えますか？', answer: 'はい。20 MB までの JPG、PNG、WebP に対応しています。ポートレートモードのボケも、被写体をきれいに分離できているかで判断します。' },
          { question: 'アカウントは必要ですか？', answer: '不要です。ゲストは登録なしで1日1回 Flash 講評を使えます。無料アカウントでは月の回数、Pro モード講評、履歴が増えます。' },
        ],
        samplesTitle: 'ギャラリーのポートレート講評',
        samplesAll: 'ポートレート講評をすべて見る',
        ctaTitle: 'ポートレート講評を受ける',
        ctaBody: 'ポートレートを1枚アップロードすると、5項目のスコア、良い点、気になる点、次の撮影でのアクションが届きます。',
      },
    },
  },
  {
    slug: 'street',
    imageType: 'street',
    lastReviewed: '2026-11-13',
    relatedBlogSlugs: ['street-photography-ai-review-workflow', 'subject-background-separation-portrait-street'],
    keywords: ['street photography critique', 'street photo feedback', 'AI street photography review', 'street photography critique online'],
    copy: {
      en: {
        ...SHARED_CHROME.en,
        metaTitle: 'Street Photography Critique and Feedback with AI',
        metaDescription:
          'Get an AI critique of a street photo: frame organization, ambient light, atmosphere, decisive-moment tension, and capture sharpness, plus one next-shoot action.',
        eyebrow: 'Street critique',
        title: 'Street photography critique and feedback',
        intro:
          'A street frame lives or dies on timing and on what else crept into the edges. PicSpeak looks at whether the moment carries tension, whether the layout guides the eye, and whether a stray element is undermining both.',
        checksIntro: 'With the type set to Street, the five scores are read with street-specific meanings:',
        dimensions: {
          composition: { label: 'Composition', body: 'How the frame is organized: layers, gaps between figures, and what the edges let in.' },
          lighting: { label: 'Lighting', body: 'Use of the ambient light you had: shafts, shade, reflections, and night light sources.' },
          color: { label: 'Color', body: 'Atmosphere carried by the palette, or the tonal structure of a monochrome frame.' },
          impact: { label: 'Impact', body: 'Decisive-moment tension: a gesture, a gaze, or a coincidence that makes the frame worth stopping on.' },
          technical: { label: 'Technique', body: 'Capture sharpness where it matters, given motion and low light.' },
        },
        issues: [
          'Does a half-cut figure or a bright sign sit right on the edge?',
          'Do two subjects overlap where a small step would have separated them?',
          'Is the key gesture or face sharp enough, even if the rest moves?',
          'Would the frame still hold attention without its caption or context?',
        ],
        workflow: SHARED_WORKFLOW.en,
        limits: [...SHARED_LIMITS.en, 'Grain, blur, and deep shadow are not automatically penalized; they are judged by whether they help the moment.'],
        faq: [
          {
            question: 'Does it penalize black-and-white or grainy street photos?',
            answer:
              'No. Monochrome, restricted palettes, heavy shadow, and grain are judged by the role they play. A deduction needs visible harm to the picture, not a departure from a clean default.',
          },
          {
            question: 'Can it tell whether my timing was good?',
            answer:
              'It reads the frame you uploaded: whether a gesture, gaze, or alignment gives it tension. It cannot see the moments before or after, so it will not claim you missed a better one.',
          },
          {
            question: 'Is there a limit on critiques?',
            answer:
              'Guests get one Flash critique per day without signing up. A free account has a monthly allowance with Pro-mode critiques included; Pro removes the monthly critique cap.',
          },
        ],
        samplesTitle: 'Street critiques from the gallery',
        samplesAll: 'See all street critiques',
        ctaTitle: 'Get a street photo critique',
        ctaBody: 'Upload one street frame. You will get five scores, what works, what holds it back, and one action for your next walk.',
      },
      zh: {
        ...SHARED_CHROME.zh,
        metaTitle: '街头摄影点评与反馈：AI 点评',
        metaDescription: '上传一张街拍，AI 会点评画面布局、环境光、氛围色彩、瞬间张力与抓拍清晰度，并给出一条下一次拍摄的动作。',
        eyebrow: '街头点评',
        title: '街头摄影点评与反馈',
        intro: '一张街拍的成败在于时机，以及边缘混进了什么。PicSpeak 会看这个瞬间有没有张力、布局有没有引导视线，以及有没有一个多余元素在同时削弱这两点。',
        checksIntro: '题材选为“街头”时，五个分数按街拍的含义解读：',
        dimensions: {
          composition: { label: '构图', body: '画面怎么组织：层次、人物之间的间隙，以及边缘放进了什么。' },
          lighting: { label: '光线', body: '对现场环境光的利用：光柱、阴影、反光和夜间光源。' },
          color: { label: '色彩', body: '色彩带来的氛围，或黑白画面的影调结构。' },
          impact: { label: '表达', body: '决定性瞬间的张力：一个动作、一个眼神或一个巧合，让人愿意停下来看。' },
          technical: { label: '技术', body: '在运动和弱光条件下，关键位置的抓拍清晰度。' },
        },
        issues: ['画面边缘是否正好卡着半个人或一块亮招牌？', '两个主体是否重叠，而往旁边走一步就能分开？', '关键的动作或面部够清楚吗，即使其他部分在动？', '去掉说明文字和背景信息，这张照片还能吸引人吗？'],
        workflow: SHARED_WORKFLOW.zh,
        limits: [...SHARED_LIMITS.zh, '颗粒、模糊和大面积阴影不会自动扣分，要看它们是否帮助了这个瞬间。'],
        faq: [
          { question: '黑白或颗粒感重的街拍会被扣分吗？', answer: '不会。黑白、受限色板、大面积阴影和颗粒都按它们在画面中的作用评价。扣分需要看得见的损害，而不是偏离“干净”的默认效果。' },
          { question: '它能判断我的时机抓得好不好吗？', answer: '它读的是你上传的这一帧：有没有动作、眼神或对齐带来张力。它看不到前后的瞬间，所以不会断言你错过了更好的一刻。' },
          { question: '点评次数有限制吗？', answer: '游客每天可以免注册做 1 次 Flash 点评。免费账号有月度额度并包含 Pro 模式点评；Pro 没有月度点评上限。' },
        ],
        samplesTitle: '长廊里的街头点评',
        samplesAll: '查看全部街头点评',
        ctaTitle: '获取街拍点评',
        ctaBody: '上传一张街拍，你会得到五个维度的分数、优点、主要问题，以及下一次扫街的一条动作。',
      },
      ja: {
        ...SHARED_CHROME.ja,
        metaTitle: 'ストリート写真の講評とフィードバック（AI）',
        metaDescription: 'ストリート写真をアップロードすると、画面配置、環境光、雰囲気の色、瞬間の張力、スナップの鮮明度を AI が講評し、次の撮影アクションを1つ返します。',
        eyebrow: 'ストリート講評',
        title: 'ストリート写真の講評とフィードバック',
        intro: 'ストリート写真はタイミングと、端に入り込んだものが決め手です。PicSpeak は瞬間に張力があるか、配置が視線を導いているか、余計な要素がその両方を弱めていないかを見ます。',
        checksIntro: '題材を「ストリート」にすると、5つのスコアはストリート向けの意味で読まれます。',
        dimensions: {
          composition: { label: '構図', body: '画面の組み立て：レイヤー、人物同士の間隔、端に何が入っているか。' },
          lighting: { label: '光', body: 'その場の環境光の使い方：差し込む光、日陰、反射、夜の光源。' },
          color: { label: '色彩', body: '色が生む雰囲気、またはモノクロ写真のトーン構成。' },
          impact: { label: '印象', body: '決定的瞬間の張力：仕草、視線、偶然の一致が、立ち止まって見る理由になっているか。' },
          technical: { label: '技術', body: '動きや暗さの中で、大事な部分がシャープに写っているか。' },
        },
        issues: ['画面の端に、半分切れた人物や明るい看板がかかっていませんか？', '一歩動けば分けられた2つの被写体が重なっていませんか？', '他が動いていても、肝心の仕草や顔は十分シャープですか？', 'キャプションや背景説明がなくても、写真として目を引きますか？'],
        workflow: SHARED_WORKFLOW.ja,
        limits: [...SHARED_LIMITS.ja, '粒子、ブレ、深い影は自動的に減点しません。瞬間を助けているかで判断します。'],
        faq: [
          { question: 'モノクロや粒子の粗いストリート写真は減点されますか？', answer: 'いいえ。モノクロ、限られた色数、深い影、粒子は、その役割で判断します。減点には写真への目に見える悪影響が必要で、きれいな標準から外れただけでは減点しません。' },
          { question: 'タイミングが良かったかどうか分かりますか？', answer: 'アップロードされた1コマを読み、仕草・視線・重なりが張力を生んでいるかを見ます。前後の瞬間は見えないので、もっと良い瞬間を逃したとは言いません。' },
          { question: '講評の回数に上限はありますか？', answer: 'ゲストは登録なしで1日1回 Flash 講評を使えます。無料アカウントには月の上限があり Pro モード講評も含まれます。Pro には月の講評上限がありません。' },
        ],
        samplesTitle: 'ギャラリーのストリート講評',
        samplesAll: 'ストリート講評をすべて見る',
        ctaTitle: 'ストリート写真の講評を受ける',
        ctaBody: 'ストリート写真を1枚アップロードすると、5項目のスコア、良い点、気になる点、次のスナップでのアクションが届きます。',
      },
    },
  },
  {
    slug: 'landscape',
    imageType: 'landscape',
    lastReviewed: '2026-11-13',
    relatedBlogSlugs: ['color-grading-photography-guide', 'five-photo-composition-checks'],
    keywords: ['landscape photo critique', 'landscape photography feedback', 'AI landscape photo review', 'rate my landscape photo'],
    copy: {
      en: {
        ...SHARED_CHROME.en,
        metaTitle: 'Landscape Photo Critique: AI Scores and Feedback',
        metaDescription:
          'Upload a landscape for an AI critique of foreground and depth, light and shadow, natural color, scene impact, and exposure, with one next-shoot action.',
        eyebrow: 'Landscape critique',
        title: 'Landscape photo critique',
        intro:
          'A beautiful place is not the same as a strong landscape photograph. PicSpeak separates the two: it asks whether the frame builds depth, whether the light is doing work, and whether exposure and color hold up.',
        checksIntro: 'With the type set to Landscape, the five scores are read with landscape-specific meanings:',
        dimensions: {
          composition: { label: 'Composition', body: 'Foreground interest and depth layers, horizon placement, and a path for the eye into the scene.' },
          lighting: { label: 'Lighting', body: 'Light and shadow across the scene: direction, contrast, and whether the light shapes the land.' },
          color: { label: 'Color', body: 'Natural palette and grading: believable greens and skies, or a deliberate mood that stays coherent.' },
          impact: { label: 'Impact', body: 'Scene grandeur or quiet: whether the frame conveys scale, weather, or atmosphere beyond the postcard view.' },
          technical: { label: 'Technique', body: 'Exposure and clarity: held highlights, clean shadows, and sharpness where the scene needs it.' },
        },
        issues: [
          'Is there anything in the foreground, or does the frame start in the middle distance?',
          'Are the brightest clouds or sky clipped?',
          'Does the horizon sit where it helps, and is it level when it should be?',
          'Would a different hour of light have done more for the terrain?',
        ],
        workflow: SHARED_WORKFLOW.en,
        limits: [...SHARED_LIMITS.en, 'Fog, haze, and soft light are not treated as defects; they are judged by whether they serve the scene.'],
        faq: [
          {
            question: 'Will a famous viewpoint score high automatically?',
            answer:
              'No. Attractive scenery alone does not earn a high score. The critique looks for selected, controlled, and coherent execution in the photograph itself.',
          },
          {
            question: 'Does it penalize hazy or minimal landscapes?',
            answer:
              'No. Haze, mist, and minimal compositions are judged by their visible role. A change is suggested only when, for example, a key contour merges or exposure loses the detail the scene relies on.',
          },
          {
            question: 'Can I compare a reshoot of the same view?',
            answer:
              'Yes. Retake Coach scores the original and the new frame together in one paired request, so the change is measured on the same rubric.',
          },
        ],
        samplesTitle: 'Landscape critiques from the gallery',
        samplesAll: 'See all landscape critiques',
        ctaTitle: 'Get a landscape critique',
        ctaBody: 'Upload one landscape. You will get five scores, what works, what holds it back, and one action for your next outing.',
      },
      zh: {
        ...SHARED_CHROME.zh,
        metaTitle: '风景摄影点评：AI 评分与建议',
        metaDescription: '上传一张风景照，AI 会点评前景与层次、光影、自然色彩、景观感染力和曝光清晰度，并给出一条下一次拍摄的动作。',
        eyebrow: '风景点评',
        title: '风景摄影点评',
        intro: '风景漂亮不等于风景照片好。PicSpeak 会把两者分开：看画面有没有建立纵深、光有没有在起作用，以及曝光和色彩是否站得住。',
        checksIntro: '题材选为“风景”时，五个分数按风景的含义解读：',
        dimensions: {
          composition: { label: '构图', body: '前景和层次、地平线的位置，以及视线进入画面的路径。' },
          lighting: { label: '光线', body: '场景中的光影：方向、反差，以及光是否塑造了地形。' },
          color: { label: '色彩', body: '自然色彩与调色：可信的绿色和天空，或一种前后一致的刻意氛围。' },
          impact: { label: '表达', body: '壮阔或宁静：画面是否传达出尺度、天气或氛围，而不只是明信片式的风景。' },
          technical: { label: '技术', body: '曝光与清晰度：高光是否保住、暗部是否干净、需要清晰的地方是否清晰。' },
        },
        issues: ['前景有内容吗，还是画面从中景才开始？', '最亮的云层或天空过曝了吗？', '地平线放在了有利的位置吗？该水平时是否水平？', '换一个时段的光线，地形会不会更有表现力？'],
        workflow: SHARED_WORKFLOW.zh,
        limits: [...SHARED_LIMITS.zh, '雾、霾和柔光不会被当作缺陷，要看它们是否服务于这个场景。'],
        faq: [
          { question: '著名机位会自动拿高分吗？', answer: '不会。景色好看本身不能换来高分，点评要看照片本身是否有经过选择、可控且统一的执行。' },
          { question: '有雾的或极简的风景会被扣分吗？', answer: '不会。雾、霭和极简构图按它们看得见的作用评价。只有像关键轮廓糊在一起、曝光丢掉场景依赖的细节这类情况，才会建议修改。' },
          { question: '同一个机位重拍后能对比吗？', answer: '可以。复拍教练会在同一次配对请求里给原片和新片打分，变化按同一套标准衡量。' },
        ],
        samplesTitle: '长廊里的风景点评',
        samplesAll: '查看全部风景点评',
        ctaTitle: '获取风景点评',
        ctaBody: '上传一张风景照，你会得到五个维度的分数、优点、主要问题，以及下一次外拍的一条动作。',
      },
      ja: {
        ...SHARED_CHROME.ja,
        metaTitle: '風景写真の講評：AI スコアと改善提案',
        metaDescription: '風景写真をアップロードすると、前景と奥行き、光と影、自然な色、景観の印象、露出と解像感を AI が講評し、次の撮影アクションを1つ返します。',
        eyebrow: '風景講評',
        title: '風景写真の講評',
        intro: '美しい場所であることと、強い風景写真であることは別です。PicSpeak はその2つを分け、画面に奥行きがあるか、光が働いているか、露出と色が成立しているかを見ます。',
        checksIntro: '題材を「風景」にすると、5つのスコアは風景向けの意味で読まれます。',
        dimensions: {
          composition: { label: '構図', body: '前景と奥行きのレイヤー、水平線の位置、視線が景色に入っていく道筋。' },
          lighting: { label: '光', body: '景色にかかる光と影：方向、コントラスト、光が地形を形づくっているか。' },
          color: { label: '色彩', body: '自然な色と仕上げ：自然に見える緑や空、または一貫した意図的な雰囲気。' },
          impact: { label: '印象', body: '雄大さや静けさ：絵はがき的な眺め以上に、スケール・天候・空気感が伝わるか。' },
          technical: { label: '技術', body: '露出と解像感：ハイライトが残っているか、シャドウがきれいか、必要な所がシャープか。' },
        },
        issues: ['前景に何かありますか？それとも中景から画面が始まっていますか？', '一番明るい雲や空は白飛びしていませんか？', '水平線は効果的な位置にあり、必要な時に水平になっていますか？', '別の時間帯の光なら、地形をもっと生かせたでしょうか？'],
        workflow: SHARED_WORKFLOW.ja,
        limits: [...SHARED_LIMITS.ja, '霧、もや、やわらかい光は欠点として扱いません。場面に役立っているかで判断します。'],
        faq: [
          { question: '有名な撮影スポットなら自動的に高得点になりますか？', answer: 'いいえ。景色が美しいだけでは高得点になりません。写真そのものに、選び抜かれ、コントロールされ、まとまった表現があるかを見ます。' },
          { question: 'もやのかかった風景やミニマルな風景は減点されますか？', answer: 'いいえ。もや、霧、ミニマルな構図は、目に見える役割で判断します。重要な輪郭が溶け込む、場面に必要なディテールが露出で失われる、といった時だけ変更を提案します。' },
          { question: '同じ場所で撮り直した写真と比較できますか？', answer: 'はい。Retake Coach は元の写真と新しい写真を1回のペア比較でまとめて採点するので、同じ基準で変化を測れます。' },
        ],
        samplesTitle: 'ギャラリーの風景講評',
        samplesAll: '風景講評をすべて見る',
        ctaTitle: '風景写真の講評を受ける',
        ctaBody: '風景写真を1枚アップロードすると、5項目のスコア、良い点、気になる点、次の撮影でのアクションが届きます。',
      },
    },
  },
];

export function getPhotoCritiqueTopic(slug: string): PhotoCritiqueTopic | undefined {
  return PHOTO_CRITIQUE_TOPICS.find((topic) => topic.slug === slug);
}

export function getPhotoCritiqueTopicPath(slug: string): string {
  return `${PHOTO_CRITIQUE_TOPIC_ROOT}/${slug}`;
}

export function getPhotoCritiqueTopicHrefForImageType(imageType: string): string | null {
  const topic = PHOTO_CRITIQUE_TOPICS.find((entry) => entry.imageType === imageType);
  return topic ? getPhotoCritiqueTopicPath(topic.slug) : null;
}

export function getPhotoCritiqueTopicCopy(topic: PhotoCritiqueTopic, locale: string | null | undefined): PhotoCritiqueTopicCopy {
  const normalized = locale === 'zh' || locale === 'ja' ? locale : 'en';
  return topic.copy[normalized];
}
