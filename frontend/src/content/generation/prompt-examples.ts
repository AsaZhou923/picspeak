import type { Locale } from '@/lib/i18n';
import { normalizeLocale, type SupportedLocale } from '../../lib/locale.ts';
import type { GenerationSize } from '@/lib/types';

export type GenerationPromptExampleCategory = 'photography' | 'poster' | 'product' | 'ui' | 'experimental';
export type GenerationPromptExampleLocale = Extract<Locale, 'zh' | 'en' | 'ja'>;

export type LocalizedGenerationPromptExampleText = Record<GenerationPromptExampleLocale, string>;

export type GenerationPromptExample = {
  id: string;
  category: GenerationPromptExampleCategory;
  title: LocalizedGenerationPromptExampleText;
  author: string;
  sourceUrl: string;
  imagePath: string;
  prompt: LocalizedGenerationPromptExampleText;
  suggestedTemplateKey: string;
  suggestedStyle: string;
  suggestedSize: GenerationSize;
};

export const GENERATION_PROMPT_EXAMPLE_LOCALES = ['zh', 'en', 'ja'] as const satisfies readonly GenerationPromptExampleLocale[];

export const GENERATION_PROMPT_EXAMPLE_CATEGORIES = [
  'photography',
  'poster',
  'product',
  'ui',
  'experimental',
] as const satisfies readonly GenerationPromptExampleCategory[];

export const GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS: Record<GenerationPromptExampleCategory, string> = {
  photography: 'Photography prompts',
  poster: 'Poster prompts',
  product: 'Product scene prompts',
  ui: 'UI concept prompts',
  experimental: 'Experimental prompts',
};

const GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS_BY_LOCALE: Record<
  GenerationPromptExampleCategory,
  Record<SupportedLocale, string>
> = {
  photography: {
    zh: '摄影提示词',
    en: 'Photography prompts',
    ja: '写真プロンプト',
  },
  poster: {
    zh: '海报提示词',
    en: 'Poster prompts',
    ja: 'ポスタープロンプト',
  },
  product: {
    zh: '产品场景提示词',
    en: 'Product scene prompts',
    ja: '商品シーンプロンプト',
  },
  ui: {
    zh: 'UI 概念提示词',
    en: 'UI concept prompts',
    ja: 'UI コンセプトプロンプト',
  },
  experimental: {
    zh: '实验视觉提示词',
    en: 'Experimental prompts',
    ja: '実験的プロンプト',
  },
};

const PROMPT_EXAMPLE_TITLE_OVERRIDES: Record<string, LocalizedGenerationPromptExampleText> = {
  'photo-convenience-store-neon-portrait': {
    zh: '便利店霓虹灯人像',
    en: 'Convenience Store Neon Portrait',
    ja: 'コンビニネオンポートレート',
  },
  'photo-cinematic-minimal-portrait': {
    zh: '电影感极简人像',
    en: 'Cinematic Minimal Portrait',
    ja: 'シネマティック・ミニマルポートレート',
  },
  'photo-soft-airy-35mm': {
    zh: '柔和通透 35mm 人像',
    en: 'Soft Airy 35mm Portrait',
    ja: 'やわらかく軽やかな 35mm ポートレート',
  },
  'photo-candid-bedroom-selfie': {
    zh: '卧室抓拍自拍写实人像',
    en: 'Candid Bedroom Selfie Photorealistic Portrait',
    ja: 'ベッドルームの自然なセルフィー写実ポートレート',
  },
  'photo-soft-black-mist-editorial': {
    zh: '柔和黑雾时尚编辑人像',
    en: 'Soft Black Mist Editorial Portrait',
    ja: 'ソフトブラックミストのエディトリアルポートレート',
  },
  'photo-bodega-night-musician': {
    zh: '夜晚杂货店门口音乐人电影感人像',
    en: 'Musician Leaving Bodega Night Cinematic Portrait',
    ja: '夜のボデガを出るミュージシャンのシネマティックポートレート',
  },
  'photo-old-delhi-storefront': {
    zh: '老德里甜品店门面纪实照片',
    en: 'Old Delhi Sweet Shop Storefront Documentary Photo',
    ja: 'オールドデリー菓子店の店先ドキュメンタリー写真',
  },
  'poster-amalfi-travel': {
    zh: '复古阿马尔菲旅行海报',
    en: 'Vintage Amalfi Travel Poster',
    ja: 'ヴィンテージ風アマルフィ旅行ポスター',
  },
  'poster-chengdu-food-map': {
    zh: '成都美食地图插画',
    en: 'Chengdu Food Map Illustration',
    ja: '成都グルメマップイラスト',
  },
  'poster-minimal-chinese-landscape': {
    zh: '中式极简 S 形海报',
    en: 'Chinese Minimalist S-Shaped Poster',
    ja: '中国風ミニマル S 字ポスター',
  },
  'poster-peacock-botanical-print': {
    zh: '孔雀植物复古对称装饰画',
    en: 'Peacock Botanical Vintage Symmetrical Art Print',
    ja: '孔雀と植物のヴィンテージ対称アートプリント',
  },
  'poster-perspective-typography-bridge': {
    zh: '极端透视跨海大桥字体海报',
    en: 'Extreme Perspective Typography Bridge',
    ja: '極端遠近法の橋タイポグラフィ',
  },
  'poster-dreamy-watercolor-editorial': {
    zh: '梦幻水彩编辑插画',
    en: 'Dreamy Watercolor Editorial Illustration',
    ja: '夢幻的な水彩エディトリアルイラスト',
  },
  'poster-dark-fantasy-guangzhou': {
    zh: '暗黑幻想广州城市海报',
    en: 'Dark-Fantasy Guangzhou City Poster',
    ja: 'ダークファンタジー広州シティポスター',
  },
  'poster-watercolor-childrens-book': {
    zh: '柔和诗意水彩儿童书插画',
    en: "Soft Poetic Children's Book Illustration",
    ja: 'やわらかな詩的水彩児童書イラスト',
  },
  'product-green-tea-film-kit': {
    zh: '绿茶舒缓护肤膜套装产品图',
    en: 'Calming Green Tea Film Kit Product Photo',
    ja: 'カーミンググリーンティー・フィルムキット商品写真',
  },
  'product-strawberry-soft-serve': {
    zh: '高级草莓软冰淇淋产品摄影',
    en: 'Premium Strawberry Soft-Serve Product Photo',
    ja: 'プレミアム苺ソフトクリーム商品写真',
  },
  'product-premium-tempura-bowl': {
    zh: '高级食谱海报优雅版式',
    en: 'Premium Food Recipe Poster Elegant Layout',
    ja: '上質なレシピポスターのエレガントレイアウト',
  },
  'product-tennis-fashion-ad': {
    zh: '前卫网球拍雕塑运动时尚广告',
    en: 'Avant-Garde Tennis Racket Sculpture Sports Fashion Ad',
    ja: '前衛的なテニスラケット彫刻スポーツ広告',
  },
  'product-beauty-commercial-photo': {
    zh: '美妆产品商业营销摄影',
    en: 'Beauty Product Commercial Marketing Photograph',
    ja: 'ビューティー商品の商業マーケティング写真',
  },
  'ui-one-prompt-design-system': {
    zh: '一句话 UI 设计系统生成',
    en: 'One-Prompt UI Design Generation',
    ja: '1 プロンプト UI デザイン生成',
  },
  'ui-style-to-design-system': {
    zh: '风格参考生成 UI 设计系统',
    en: 'Style-to-UI Design System',
    ja: 'スタイル参照から UI デザインシステムへ',
  },
  'ui-hanfu-museum-infographic': {
    zh: '博物馆式汉服拆解信息图',
    en: 'Museum-Style Hanfu Breakdown Infographic',
    ja: '博物館風の漢服分解インフォグラフィック',
  },
  'ui-cyberpunk-neon-system': {
    zh: '赛博朋克霓虹 UI 设计系统',
    en: 'Cyberpunk Neon UI Design System',
    ja: 'サイバーパンクネオン UI デザインシステム',
  },
  'ui-ai-game-dev-overview-slide': {
    zh: '日语 AI 游戏开发概览幻灯片提示词',
    en: 'Japanese AI Game Dev Overview Slide Prompt',
    ja: 'AI ゲーム開発概要スライドプロンプト',
  },
  'experimental-dark-myth-scene': {
    zh: '狮驼岭暗黑神话场景',
    en: 'Lion Camel Ridge Dark Myth Scene',
    ja: '獅駝嶺ダーク神話シーン',
  },
  'experimental-street-fashion-motion': {
    zh: '街头时装动态全身摄影',
    en: 'Street Fashion Motion Full-Body Shot',
    ja: 'ストリートファッションの動きある全身ショット',
  },
  'experimental-silhouette-universe-poster': {
    zh: '轮廓宇宙叙事海报',
    en: 'Silhouette Universe Narrative Poster',
    ja: 'シルエット宇宙ナラティブポスター',
  },
  'experimental-retro-programming-cartoon': {
    zh: '复古编程博物馆卡通',
    en: 'Retro Programming Museum Cartoon',
    ja: 'レトロプログラミング博物館カートゥーン',
  },
  'experimental-fourteenth-dimension-scene': {
    zh: '第十四维投影场景',
    en: '14th-Dimension Projection Scene',
    ja: '第 14 次元プロジェクションシーン',
  },
};

const MOJIBAKE_PATTERN = /[�銈銉鎽鐓鍐鏋瑭鈥閫]/;

function isMojibakeLike(text: string) {
  return MOJIBAKE_PATTERN.test(text);
}

export function getLocalizedPromptExampleText(
  text: LocalizedGenerationPromptExampleText,
  locale: Locale
) {
  const normalizedLocale = normalizeLocale(locale);
  const localized = text[normalizedLocale as GenerationPromptExampleLocale];
  if (localized && !isMojibakeLike(localized)) {
    return localized;
  }
  return text.en || text.zh || text.ja;
}

export function getLocalizedPromptExampleCategoryLabel(
  category: GenerationPromptExampleCategory,
  locale: Locale | string
) {
  return GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS_BY_LOCALE[category][normalizeLocale(locale)];
}

export function getLocalizedPromptExampleTitle(example: GenerationPromptExample, locale: Locale | string) {
  const override = PROMPT_EXAMPLE_TITLE_OVERRIDES[example.id];
  if (override) {
    return getLocalizedPromptExampleText(override, normalizeLocale(locale));
  }
  return getLocalizedPromptExampleText(example.title, normalizeLocale(locale));
}

export function normalizePromptExampleExcerpt(prompt: string, maxLength = 220): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function getGenerationPromptExample(id: string): GenerationPromptExample | undefined {
  return GENERATION_PROMPT_EXAMPLES.find((example) => example.id === id);
}

// Curated from EvoLinkAI/awesome-gpt-image-2-prompts (Apache-2.0). Source URLs are retained per item.
export const GENERATION_PROMPT_EXAMPLES = [
  {
    id: "photo-convenience-store-neon-portrait",
    category: "photography",
    title: {
      zh: "便利店霓虹灯人像",
      en: "Convenience Store Neon Portrait",
      ja: "コンビニネオンポートレート",
    },
    author: "BubbleBrain",
    sourceUrl: "https://x.com/BubbleBrain/status/2045167461147042202",
    imagePath: "/generation-prompt-examples/photo-convenience-store-neon-portrait.jpg",
    prompt: {
      zh: "35mm film photography with harsh convenience store fluorescent lighting mixed with colorful neon signs from outside, authentic film grain, high contrast, slight color cast, cinematic street editorial style, intimate medium shot, early 20s sexy Chinese female idol with ultra-realistic delicate refined Chinese features, seductive almond-shaped fox eyes with natural double eyelids, high nose bridge, small sharp V-shaped jawline, flawless porcelain skin with cool ivory undertone and visible specular highlights from fluorescent light, subtle skin texture and micro pores, natural dewy makeup with soft flush on cheeks, glossy natural pink lips slightly parted, subtle natural freckles across nose and cheeks, long dark brown hair in a messy high ponytail with many loose strands falling around face and neck, wearing an oversized white button-up shirt as the only top, unbuttoned at the top with deep cleavage and loosely tied at the waist, paired with a tiny black pleated mini skirt, barefoot in simple white slides, seductive casual leaning pose against the glass door of a 24-hour convenience store at late night, body slightly arched, one leg bent with foot resting against the door frame, the other leg straight, one hand holding a bottle of iced drink, the other hand lightly pulling the hem of her mini skirt, intensely seductive playful yet slightly vulnerable gaze straight at the viewer with soft doe eyes full of quiet temptation and teasing smile, bright cold fluorescent store light from inside mixed with pink and blue neon glow from outside signs, realistic reflections on glass door, blurred convenience store interior with shelves and snacks in background, authentic 35mm film color grading with harsh lighting and neon accents, extremely sharp yet soft skin rendering, natural hair strands, realistic fabric wrinkles and drape on the oversized shirt and mini skirt, no plastic skin, no digital over-sharpening, no airbrushing, no blemishes, no moles, no oily skin, no watermark, no text, authentic late-night convenience store atmosphere",
      en: "35mm film photography with harsh convenience store fluorescent lighting mixed with colorful neon signs from outside, authentic film grain, high contrast, slight color cast, cinematic street editorial style, intimate medium shot, early 20s sexy Chinese female idol with ultra-realistic delicate refined Chinese features, seductive almond-shaped fox eyes with natural double eyelids, high nose bridge, small sharp V-shaped jawline, flawless porcelain skin with cool ivory undertone and visible specular highlights from fluorescent light, subtle skin texture and micro pores, natural dewy makeup with soft flush on cheeks, glossy natural pink lips slightly parted, subtle natural freckles across nose and cheeks, long dark brown hair in a messy high ponytail with many loose strands falling around face and neck, wearing an oversized white button-up shirt as the only top, unbuttoned at the top with deep cleavage and loosely tied at the waist, paired with a tiny black pleated mini skirt, barefoot in simple white slides, seductive casual leaning pose against the glass door of a 24-hour convenience store at late night, body slightly arched, one leg bent with foot resting against the door frame, the other leg straight, one hand holding a bottle of iced drink, the other hand lightly pulling the hem of her mini skirt, intensely seductive playful yet slightly vulnerable gaze straight at the viewer with soft doe eyes full of quiet temptation and teasing smile, bright cold fluorescent store light from inside mixed with pink and blue neon glow from outside signs, realistic reflections on glass door, blurred convenience store interior with shelves and snacks in background, authentic 35mm film color grading with harsh lighting and neon accents, extremely sharp yet soft skin rendering, natural hair strands, realistic fabric wrinkles and drape on the oversized shirt and mini skirt, no plastic skin, no digital over-sharpening, no airbrushing, no blemishes, no moles, no oily skin, no watermark, no text, authentic late-night convenience store atmosphere",
      ja: "35mm film photography with harsh convenience store fluorescent lighting mixed with colorful neon signs from outside, authentic film grain, high contrast, slight color cast, cinematic street editorial style, intimate medium shot, early 20s sexy Chinese female idol with ultra-realistic delicate refined Chinese features, seductive almond-shaped fox eyes with natural double eyelids, high nose bridge, small sharp V-shaped jawline, flawless porcelain skin with cool ivory undertone and visible specular highlights from fluorescent light, subtle skin texture and micro pores, natural dewy makeup with soft flush on cheeks, glossy natural pink lips slightly parted, subtle natural freckles across nose and cheeks, long dark brown hair in a messy high ponytail with many loose strands falling around face and neck, wearing an oversized white button-up shirt as the only top, unbuttoned at the top with deep cleavage and loosely tied at the waist, paired with a tiny black pleated mini skirt, barefoot in simple white slides, seductive casual leaning pose against the glass door of a 24-hour convenience store at late night, body slightly arched, one leg bent with foot resting against the door frame, the other leg straight, one hand holding a bottle of iced drink, the other hand lightly pulling the hem of her mini skirt, intensely seductive playful yet slightly vulnerable gaze straight at the viewer with soft doe eyes full of quiet temptation and teasing smile, bright cold fluorescent store light from inside mixed with pink and blue neon glow from outside signs, realistic reflections on glass door, blurred convenience store interior with shelves and snacks in background, authentic 35mm film color grading with harsh lighting and neon accents, extremely sharp yet soft skin rendering, natural hair strands, realistic fabric wrinkles and drape on the oversized shirt and mini skirt, no plastic skin, no digital over-sharpening, no airbrushing, no blemishes, no moles, no oily skin, no watermark, no text, authentic late-night convenience store atmosphere",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "cinematic",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-cinematic-minimal-portrait",
    category: "photography",
    title: {
      zh: "电影感极简人像",
      en: "Cinematic Minimal Portrait",
      ja: "シネマティックミニマルポートレート",
    },
    author: "iam_miharbi",
    sourceUrl: "https://x.com/iam_miharbi/status/2045151354679665101",
    imagePath: "/generation-prompt-examples/photo-cinematic-minimal-portrait.jpg",
    prompt: {
      zh: "Generate a cinematic minimal portrait of a solitary man standing in an intense orange to red gradient environment, strong silhouette lighting, deep shadow contrast, reflective glossy floor, symmetrical composition, minimal",
      en: "Generate a cinematic minimal portrait of a solitary man standing in an intense orange to red gradient environment, strong silhouette lighting, deep shadow contrast, reflective glossy floor, symmetrical composition, minimal",
      ja: "Generate a cinematic minimal portrait of a solitary man standing in an intense orange to red gradient environment, strong silhouette lighting, deep shadow contrast, reflective glossy floor, symmetrical composition, minimal",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "cinematic",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-soft-airy-35mm",
    category: "photography",
    title: {
      zh: "柔和通透 35mm 人像",
      en: "Soft Airy 35mm Portrait",
      ja: "ソフトエアリー35mmポートレート",
    },
    author: "BubbleBrain",
    sourceUrl: "https://x.com/BubbleBrain/status/2046115431144902732",
    imagePath: "/generation-prompt-examples/photo-soft-airy-35mm.jpg",
    prompt: {
      zh: "Analog 35mm film photography, soft airy Japanese-style aesthetic, gentle diffused natural window light, slight overexposure, pastel tones, low contrast, soft highlights, minimal indoor setting near a window with white curtains, clean light-colored wall, natural composition, eye-level, slightly closer full-body framing (mid-thigh to head), young East Asian woman, natural minimal makeup, soft realistic skin texture, long slightly messy dark hair, oversized white button-up shirt, light casual shorts, barefoot, simple and relaxed styling, standing naturally with relaxed posture, arms loosely at sides or slightly behind, facing camera, gentle soft smile, subtle stillness, focus on light, air, and quiet everyday mood, soft film grain, dreamy and understated atmosphere --ar 9:16",
      en: "Analog 35mm film photography, soft airy Japanese-style aesthetic, gentle diffused natural window light, slight overexposure, pastel tones, low contrast, soft highlights, minimal indoor setting near a window with white curtains, clean light-colored wall, natural composition, eye-level, slightly closer full-body framing (mid-thigh to head), young East Asian woman, natural minimal makeup, soft realistic skin texture, long slightly messy dark hair, oversized white button-up shirt, light casual shorts, barefoot, simple and relaxed styling, standing naturally with relaxed posture, arms loosely at sides or slightly behind, facing camera, gentle soft smile, subtle stillness, focus on light, air, and quiet everyday mood, soft film grain, dreamy and understated atmosphere --ar 9:16",
      ja: "Analog 35mm film photography, soft airy Japanese-style aesthetic, gentle diffused natural window light, slight overexposure, pastel tones, low contrast, soft highlights, minimal indoor setting near a window with white curtains, clean light-colored wall, natural composition, eye-level, slightly closer full-body framing (mid-thigh to head), young East Asian woman, natural minimal makeup, soft realistic skin texture, long slightly messy dark hair, oversized white button-up shirt, light casual shorts, barefoot, simple and relaxed styling, standing naturally with relaxed posture, arms loosely at sides or slightly behind, facing camera, gentle soft smile, subtle stillness, focus on light, air, and quiet everyday mood, soft film grain, dreamy and understated atmosphere --ar 9:16",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "realistic",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-candid-bedroom-selfie",
    category: "photography",
    title: {
      zh: "卧室抓拍自拍写实人像",
      en: "Candid Bedroom Selfie Photorealistic Portrait",
      ja: "Candid Bedroom Selfie Photorealistic Portrait",
    },
    author: "charliejhills",
    sourceUrl: "https://x.com/charliejhills/status/2047969988368314526",
    imagePath: "/generation-prompt-examples/photo-candid-bedroom-selfie.jpg",
    prompt: {
      zh: "Candid selfie of a young woman with shoulder-length honey-blonde hair with lighter highlights, green-grey eyes, rosy cheeks, and a natural no-makeup makeup look. She is wearing a light grey hoodie and looking slightly off-camera with a relaxed expression. Background shows a cosy bedroom with warm fairy lights strung on a pink wall, a unmade bed with tan bedding, and a small white desk with stacked books. Soft, warm ambient lighting. Photo-realistic, casual, intimate feel.",
      en: "Candid selfie of a young woman with shoulder-length honey-blonde hair with lighter highlights, green-grey eyes, rosy cheeks, and a natural no-makeup makeup look. She is wearing a light grey hoodie and looking slightly off-camera with a relaxed expression. Background shows a cosy bedroom with warm fairy lights strung on a pink wall, a unmade bed with tan bedding, and a small white desk with stacked books. Soft, warm ambient lighting. Photo-realistic, casual, intimate feel.",
      ja: "Candid selfie of a young woman with shoulder-length honey-blonde hair with lighter highlights, green-grey eyes, rosy cheeks, and a natural no-makeup makeup look. She is wearing a light grey hoodie and looking slightly off-camera with a relaxed expression. Background shows a cosy bedroom with warm fairy lights strung on a pink wall, a unmade bed with tan bedding, and a small white desk with stacked books. Soft, warm ambient lighting. Photo-realistic, casual, intimate feel.",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "realistic",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-soft-black-mist-editorial",
    category: "photography",
    title: {
      zh: "柔和黑雾编辑人像",
      en: "Soft Black Mist Editorial Portrait",
      ja: "ソフトブラックミストエディトリアルポートレート",
    },
    author: "BubbleBrain",
    sourceUrl: "https://x.com/BubbleBrain/status/2046434670724907395",
    imagePath: "/generation-prompt-examples/photo-soft-black-mist-editorial.jpg",
    prompt: {
      zh: "9:16 vertical — editorial portrait, single subject  soft black mist filter, subtle haze, gentle highlight bloom, muted tones  minimal indoor space, clean background, slight texture  young Korean woman, minimal makeup, natural skin texture  outfit: fitted ribbed knit top or soft camisole layered under a loose shirt, paired with high-waisted shorts or skirt; fabric slightly clings to body shape, soft and natural, no revealing elements  hair: slightly messy, natural volume  pose: sitting on floor with one leg bent and the other relaxed, body slightly leaning, shoulders not aligned, head tilted  composition: subject slightly off-center, negative space present  expression: calm, slightly distant, natural lips  lighting: soft side light, gentle shadow falloff  mood: understated, quiet, subtly sensual through natural body lines, relaxed and unposed  quality: fine grain, slight softness, realistic look",
      en: "9:16 vertical — editorial portrait, single subject  soft black mist filter, subtle haze, gentle highlight bloom, muted tones  minimal indoor space, clean background, slight texture  young Korean woman, minimal makeup, natural skin texture  outfit: fitted ribbed knit top or soft camisole layered under a loose shirt, paired with high-waisted shorts or skirt; fabric slightly clings to body shape, soft and natural, no revealing elements  hair: slightly messy, natural volume  pose: sitting on floor with one leg bent and the other relaxed, body slightly leaning, shoulders not aligned, head tilted  composition: subject slightly off-center, negative space present  expression: calm, slightly distant, natural lips  lighting: soft side light, gentle shadow falloff  mood: understated, quiet, subtly sensual through natural body lines, relaxed and unposed  quality: fine grain, slight softness, realistic look",
      ja: "9:16 vertical — editorial portrait, single subject  soft black mist filter, subtle haze, gentle highlight bloom, muted tones  minimal indoor space, clean background, slight texture  young Korean woman, minimal makeup, natural skin texture  outfit: fitted ribbed knit top or soft camisole layered under a loose shirt, paired with high-waisted shorts or skirt; fabric slightly clings to body shape, soft and natural, no revealing elements  hair: slightly messy, natural volume  pose: sitting on floor with one leg bent and the other relaxed, body slightly leaning, shoulders not aligned, head tilted  composition: subject slightly off-center, negative space present  expression: calm, slightly distant, natural lips  lighting: soft side light, gentle shadow falloff  mood: understated, quiet, subtly sensual through natural body lines, relaxed and unposed  quality: fine grain, slight softness, realistic look",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-bodega-night-musician",
    category: "photography",
    title: {
      zh: "夜晚杂货店门口音乐人电影感人像",
      en: "Musician Leaving Bodega Night Cinematic Portrait",
      ja: "Musician Leaving Bodega Night Cinematic Portrait",
    },
    author: "commanderdgr8",
    sourceUrl: "https://x.com/commanderdgr8/status/2047934886124867684",
    imagePath: "/generation-prompt-examples/photo-bodega-night-musician.jpg",
    prompt: {
      zh: "A candid, magazine-cover quality documentary photograph of a young musician with curly hair, casually carrying a worn guitar case, stepping out of a classic downtown bodega at 11 PM. The lighting features a complex mixed color temperature: a bright neon \"OPEN\" sign casts an intense, warm red glow across his face, while a yellow streetlamp provides a striking backlight behind him. The image perfectly emulates 35mm film shot on a Canon AE-1 with a 50mm f/1.4 lens wide open, exhibiting a shallow depth of field with the background beautifully blurred. It captures the exact aesthetics of CineStill 800T film, specifically featuring the distinctive soft red halation bloom radiating outward from the neon light sources, a tungsten white balance, and moody, slightly green-tinted shadows in the darkest areas. Cinematic night photography, photorealistic, highly detailed.",
      en: "A candid, magazine-cover quality documentary photograph of a young musician with curly hair, casually carrying a worn guitar case, stepping out of a classic downtown bodega at 11 PM. The lighting features a complex mixed color temperature: a bright neon \"OPEN\" sign casts an intense, warm red glow across his face, while a yellow streetlamp provides a striking backlight behind him. The image perfectly emulates 35mm film shot on a Canon AE-1 with a 50mm f/1.4 lens wide open, exhibiting a shallow depth of field with the background beautifully blurred. It captures the exact aesthetics of CineStill 800T film, specifically featuring the distinctive soft red halation bloom radiating outward from the neon light sources, a tungsten white balance, and moody, slightly green-tinted shadows in the darkest areas. Cinematic night photography, photorealistic, highly detailed.",
      ja: "A candid, magazine-cover quality documentary photograph of a young musician with curly hair, casually carrying a worn guitar case, stepping out of a classic downtown bodega at 11 PM. The lighting features a complex mixed color temperature: a bright neon \"OPEN\" sign casts an intense, warm red glow across his face, while a yellow streetlamp provides a striking backlight behind him. The image perfectly emulates 35mm film shot on a Canon AE-1 with a 50mm f/1.4 lens wide open, exhibiting a shallow depth of field with the background beautifully blurred. It captures the exact aesthetics of CineStill 800T film, specifically featuring the distinctive soft red halation bloom radiating outward from the neon light sources, a tungsten white balance, and moody, slightly green-tinted shadows in the darkest areas. Cinematic night photography, photorealistic, highly detailed.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "cinematic",
    suggestedSize: "1536x1024",
  },
  {
    id: "photo-old-delhi-storefront",
    category: "photography",
    title: {
      zh: "旧德里糖果店门面纪实照片",
      en: "Old Delhi Sweet Shop Storefront Documentary Photo",
      ja: "Old Delhi Sweet Shop Storefront Documentary Photo",
    },
    author: "commanderdgr8",
    sourceUrl: "https://x.com/commanderdgr8/status/2047889839123521635",
    imagePath: "/generation-prompt-examples/photo-old-delhi-storefront.jpg",
    prompt: {
      zh: "Create a photorealistic travel-documentary image of a small sweet-shop storefront in Old Delhi at midday. A painted shop signboard above the door reads \"मिठाई की दुकान\" in large bold yellow hand-painted Devanagari on a deep red background, with \"SWEET SHOP\" in smaller roman letters beneath. Realistic hand-painted texture, slight wear, natural shadow. Authentic script proportion. Spelling and characters exact. No extra signage in frame, no watermark.",
      en: "Create a photorealistic travel-documentary image of a small sweet-shop storefront in Old Delhi at midday. A painted shop signboard above the door reads \"मिठाई की दुकान\" in large bold yellow hand-painted Devanagari on a deep red background, with \"SWEET SHOP\" in smaller roman letters beneath. Realistic hand-painted texture, slight wear, natural shadow. Authentic script proportion. Spelling and characters exact. No extra signage in frame, no watermark.",
      ja: "Create a photorealistic travel-documentary image of a small sweet-shop storefront in Old Delhi at midday. A painted shop signboard above the door reads \"मिठाई की दुकान\" in large bold yellow hand-painted Devanagari on a deep red background, with \"SWEET SHOP\" in smaller roman letters beneath. Realistic hand-painted texture, slight wear, natural shadow. Authentic script proportion. Spelling and characters exact. No extra signage in frame, no watermark.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "realistic",
    suggestedSize: "1536x1024",
  },
  {
    id: "poster-amalfi-travel",
    category: "poster",
    title: {
      zh: "复古阿马尔菲旅行海报",
      en: "Vintage Amalfi Travel Poster",
      ja: "ヴィンテージアマルフィトラベルポスター",
    },
    author: "WolfRiccardo",
    sourceUrl: "https://x.com/WolfRiccardo/status/2044562722491121718",
    imagePath: "/generation-prompt-examples/poster-amalfi-travel.jpg",
    prompt: {
      zh: "Modern pencil illustration of Vintage travel poster illustration of the Amalfi Coast, Italy, panoramic coastal cliff road scene, classic 1960s white car driving along a curved seaside road, deep blue Mediterranean sea with small sailboats, colorful pastel hillside village, bright blue sky with soft clouds, lemon tree branches with vibrant yellow lemons framing the foreground, warm summer sunlight, bold vibrant colors, retro 1950s travel poster style, cinematic composition, high detail, screen print texture, graphic illustration. Hand-drawn style, illustration with loose strokes and defined contours. High-contrast color palette, maintaining chromatic harmony between background and elements. Contemporary and decorative aesthetic.",
      en: "Modern pencil illustration of Vintage travel poster illustration of the Amalfi Coast, Italy, panoramic coastal cliff road scene, classic 1960s white car driving along a curved seaside road, deep blue Mediterranean sea with small sailboats, colorful pastel hillside village, bright blue sky with soft clouds, lemon tree branches with vibrant yellow lemons framing the foreground, warm summer sunlight, bold vibrant colors, retro 1950s travel poster style, cinematic composition, high detail, screen print texture, graphic illustration. Hand-drawn style, illustration with loose strokes and defined contours. High-contrast color palette, maintaining chromatic harmony between background and elements. Contemporary and decorative aesthetic.",
      ja: "Modern pencil illustration of Vintage travel poster illustration of the Amalfi Coast, Italy, panoramic coastal cliff road scene, classic 1960s white car driving along a curved seaside road, deep blue Mediterranean sea with small sailboats, colorful pastel hillside village, bright blue sky with soft clouds, lemon tree branches with vibrant yellow lemons framing the foreground, warm summer sunlight, bold vibrant colors, retro 1950s travel poster style, cinematic composition, high detail, screen print texture, graphic illustration. Hand-drawn style, illustration with loose strokes and defined contours. High-contrast color palette, maintaining chromatic harmony between background and elements. Contemporary and decorative aesthetic.",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "illustration",
    suggestedSize: "1024x1536",
  },
  {
    id: "poster-chengdu-food-map",
    category: "poster",
    title: {
      zh: "成都美食地图插画",
      en: "Chengdu Food Map Illustration",
      ja: "成都フードマップイラスト",
    },
    author: "Panda20230902",
    sourceUrl: "https://x.com/Panda20230902/status/2045396918965285111",
    imagePath: "/generation-prompt-examples/poster-chengdu-food-map.jpg",
    prompt: {
      zh: "一张手绘风格的城市美食地图，以成都为主题。画面以鸟瞰视角的手绘简化城市地图为底，标注主要道路和地标但不追求精确比例而是追求可爱的手绘感。地图上分布着 12 个美食地点的精致手绘小插画：春熙路的串串香（一把竹签插着各种食材冒着热气）、宽窄巷子的三大炮（三个糯米团子飞向铜盘）、建设路的蛋烘糕（金黄酥脆正在翻面）、玉林路的火锅（九宫格锅翻滚冒泡）等，每个插画约占地图的 5% 面积，旁边用手写体标注店名和一句推荐语\"凌晨两点还在排队的那家\"。地图边缘用手绘藤蔓和辣椒装饰形成边框。右下角有一个手绘指南针和图例说明。左上角标题\"成都·吃货暴走地图\"使用胖圆的手绘美术字配辣椒装饰。整体画风为水彩+彩铅混合的手绘质感，颜色以暖色系（辣椒红、姜黄、翠绿）为主，图片比例 1:1。",
      en: "一张手绘风格的城市美食地图，以成都为主题。画面以鸟瞰视角的手绘简化城市地图为底，标注主要道路和地标但不追求精确比例而是追求可爱的手绘感。地图上分布着 12 个美食地点的精致手绘小插画：春熙路的串串香（一把竹签插着各种食材冒着热气）、宽窄巷子的三大炮（三个糯米团子飞向铜盘）、建设路的蛋烘糕（金黄酥脆正在翻面）、玉林路的火锅（九宫格锅翻滚冒泡）等，每个插画约占地图的 5% 面积，旁边用手写体标注店名和一句推荐语\"凌晨两点还在排队的那家\"。地图边缘用手绘藤蔓和辣椒装饰形成边框。右下角有一个手绘指南针和图例说明。左上角标题\"成都·吃货暴走地图\"使用胖圆的手绘美术字配辣椒装饰。整体画风为水彩+彩铅混合的手绘质感，颜色以暖色系（辣椒红、姜黄、翠绿）为主，图片比例 1:1。",
      ja: "一张手绘风格的城市美食地图，以成都为主题。画面以鸟瞰视角的手绘简化城市地图为底，标注主要道路和地标但不追求精确比例而是追求可爱的手绘感。地图上分布着 12 个美食地点的精致手绘小插画：春熙路的串串香（一把竹签插着各种食材冒着热气）、宽窄巷子的三大炮（三个糯米团子飞向铜盘）、建设路的蛋烘糕（金黄酥脆正在翻面）、玉林路的火锅（九宫格锅翻滚冒泡）等，每个插画约占地图的 5% 面积，旁边用手写体标注店名和一句推荐语\"凌晨两点还在排队的那家\"。地图边缘用手绘藤蔓和辣椒装饰形成边框。右下角有一个手绘指南针和图例说明。左上角标题\"成都·吃货暴走地图\"使用胖圆的手绘美术字配辣椒装饰。整体画风为水彩+彩铅混合的手绘质感，颜色以暖色系（辣椒红、姜黄、翠绿）为主，图片比例 1:1。",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "illustration",
    suggestedSize: "1024x1024",
  },
  {
    id: "poster-minimal-chinese-landscape",
    category: "poster",
    title: {
      zh: "中式极简 S 形海报",
      en: "Chinese Minimalist S-Shaped Poster",
      ja: "中国ミニマリストS字型ポスター",
    },
    author: "liyue_ai",
    sourceUrl: "https://x.com/liyue_ai/status/2045368305079447853",
    imagePath: "/generation-prompt-examples/poster-minimal-chinese-landscape.jpg",
    prompt: {
      zh: "极简新中式美学风格，画面以淡雅的灰白色为底，呈现出一种纸艺剪影般的立体感。\r\n一条S形蜿蜒的裂痕状边缘将画面分割，仿佛撕开了一层纸面，露出内部色彩斑斓的东方山水景象。\r\n裂口内，一条蜿蜒的河流自上而下贯穿整个构图，河水以深浅不一的蓝色渲染，层次分明，仿佛流动的丝带。\r\n河岸两侧点缀着青翠的山丘与梯田，色彩柔和，绿红交织，展现出田园的宁静之美。\r\n沿河而建的古风建筑错落有致，飞檐翘角，白墙黛瓦，在光影的映衬下更显古朴典雅。\r\n岸边树木葱茏，枝叶轻盈，一艘小船静泊于水中央，增添了几分悠然意境。\r\n整体构图呈S形曲线，富有韵律感，仿佛自然与人文的和谐共生。\r\n画作边缘采用撕纸效果，营造出立体浮雕般的视觉体验。\r\n下方题字“东方美学”以黑色楷体书写，日期“2026/04/18”与红色印章相呼应，底部“CHINA”字样庄重醒目，署名“@LIYUE”低调收尾，整体氛围静谧深远，充满诗意与哲思。",
      en: "极简新中式美学风格，画面以淡雅的灰白色为底，呈现出一种纸艺剪影般的立体感。\r\n一条S形蜿蜒的裂痕状边缘将画面分割，仿佛撕开了一层纸面，露出内部色彩斑斓的东方山水景象。\r\n裂口内，一条蜿蜒的河流自上而下贯穿整个构图，河水以深浅不一的蓝色渲染，层次分明，仿佛流动的丝带。\r\n河岸两侧点缀着青翠的山丘与梯田，色彩柔和，绿红交织，展现出田园的宁静之美。\r\n沿河而建的古风建筑错落有致，飞檐翘角，白墙黛瓦，在光影的映衬下更显古朴典雅。\r\n岸边树木葱茏，枝叶轻盈，一艘小船静泊于水中央，增添了几分悠然意境。\r\n整体构图呈S形曲线，富有韵律感，仿佛自然与人文的和谐共生。\r\n画作边缘采用撕纸效果，营造出立体浮雕般的视觉体验。\r\n下方题字“东方美学”以黑色楷体书写，日期“2026/04/18”与红色印章相呼应，底部“CHINA”字样庄重醒目，署名“@LIYUE”低调收尾，整体氛围静谧深远，充满诗意与哲思。",
      ja: "极简新中式美学风格，画面以淡雅的灰白色为底，呈现出一种纸艺剪影般的立体感。\r\n一条S形蜿蜒的裂痕状边缘将画面分割，仿佛撕开了一层纸面，露出内部色彩斑斓的东方山水景象。\r\n裂口内，一条蜿蜒的河流自上而下贯穿整个构图，河水以深浅不一的蓝色渲染，层次分明，仿佛流动的丝带。\r\n河岸两侧点缀着青翠的山丘与梯田，色彩柔和，绿红交织，展现出田园的宁静之美。\r\n沿河而建的古风建筑错落有致，飞檐翘角，白墙黛瓦，在光影的映衬下更显古朴典雅。\r\n岸边树木葱茏，枝叶轻盈，一艘小船静泊于水中央，增添了几分悠然意境。\r\n整体构图呈S形曲线，富有韵律感，仿佛自然与人文的和谐共生。\r\n画作边缘采用撕纸效果，营造出立体浮雕般的视觉体验。\r\n下方题字“东方美学”以黑色楷体书写，日期“2026/04/18”与红色印章相呼应，底部“CHINA”字样庄重醒目，署名“@LIYUE”低调收尾，整体氛围静谧深远，充满诗意与哲思。",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "minimal",
    suggestedSize: "1024x1536",
  },
  {
    id: "poster-peacock-botanical-print",
    category: "poster",
    title: {
      zh: "孔雀植物复古对称艺术版画",
      en: "Peacock Botanical Vintage Symmetrical Art Print",
      ja: "Peacock Botanical Vintage Symmetrical Art Print",
    },
    author: "dotey",
    sourceUrl: "https://x.com/dotey/status/2047803054422901046",
    imagePath: "/generation-prompt-examples/poster-peacock-botanical-print.jpg",
    prompt: {
      zh: "symmetrical design featuring two elegant blue peacocks with detailed feather patterns, surrounded by blue floral elements, intricate vintage botanical ornament, soft beige background, classical floral decor style with rich navy and sky blue details, decorative art illustration --ar 3:2",
      en: "symmetrical design featuring two elegant blue peacocks with detailed feather patterns, surrounded by blue floral elements, intricate vintage botanical ornament, soft beige background, classical floral decor style with rich navy and sky blue details, decorative art illustration --ar 3:2",
      ja: "symmetrical design featuring two elegant blue peacocks with detailed feather patterns, surrounded by blue floral elements, intricate vintage botanical ornament, soft beige background, classical floral decor style with rich navy and sky blue details, decorative art illustration --ar 3:2",
    },
    suggestedTemplateKey: "color_moodboard",
    suggestedStyle: "illustration",
    suggestedSize: "1024x1024",
  },
  {
    id: "poster-perspective-typography-bridge",
    category: "poster",
    title: {
      zh: "极端透视排版桥梁",
      en: "Extreme Perspective Typography Bridge",
      ja: "極端なパースペクティブタイポグラフィブリッジ",
    },
    author: "xpg0970",
    sourceUrl: "https://x.com/xpg0970/status/2045560665071579160",
    imagePath: "/generation-prompt-examples/poster-perspective-typography-bridge.jpg",
    prompt: {
      zh: "①场景 跨海大桥的侧面，dramatic cinematic angle。 巨型 bold sans-serif 文字「___②文字内容 跨海大桥」painted onto the surface of ___③主体物 无，从靠近镜头的前端开始，沿表面向远端 progressively foreshortens 逐渐透视压缩，letterforms conform to surface curvature 贴合物体曲面，surface-integrated not floating。 文字部分区域被 无___④前景遮挡物 无___ occluded and hidden，在间隙中露出， 形成 depth-layering 纵深穿插效果。 Oversized bright yellow + sharp orange outline，extreme perspective distortion aligned to vanishing point。Cinematic lighting, motion blur, poster-grade dynamic integrated typography, modern advertising aesthetics。",
      en: "①场景 跨海大桥的侧面，dramatic cinematic angle。 巨型 bold sans-serif 文字「___②文字内容 跨海大桥」painted onto the surface of ___③主体物 无，从靠近镜头的前端开始，沿表面向远端 progressively foreshortens 逐渐透视压缩，letterforms conform to surface curvature 贴合物体曲面，surface-integrated not floating。 文字部分区域被 无___④前景遮挡物 无___ occluded and hidden，在间隙中露出， 形成 depth-layering 纵深穿插效果。 Oversized bright yellow + sharp orange outline，extreme perspective distortion aligned to vanishing point。Cinematic lighting, motion blur, poster-grade dynamic integrated typography, modern advertising aesthetics。",
      ja: "①场景 跨海大桥的侧面，dramatic cinematic angle。 巨型 bold sans-serif 文字「___②文字内容 跨海大桥」painted onto the surface of ___③主体物 无，从靠近镜头的前端开始，沿表面向远端 progressively foreshortens 逐渐透视压缩，letterforms conform to surface curvature 贴合物体曲面，surface-integrated not floating。 文字部分区域被 无___④前景遮挡物 无___ occluded and hidden，在间隙中露出， 形成 depth-layering 纵深穿插效果。 Oversized bright yellow + sharp orange outline，extreme perspective distortion aligned to vanishing point。Cinematic lighting, motion blur, poster-grade dynamic integrated typography, modern advertising aesthetics。",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "poster-dreamy-watercolor-editorial",
    category: "poster",
    title: {
      zh: "梦幻水彩编辑插画",
      en: "Dreamy Watercolor Editorial Illustration",
      ja: "夢幻水彩エディトリアルイラスト",
    },
    author: "hmontilla_",
    sourceUrl: "https://x.com/hmontilla_/status/2045513933096636575",
    imagePath: "/generation-prompt-examples/poster-dreamy-watercolor-editorial.jpg",
    prompt: {
      zh: "Ilustración en acuarela de estilo onírico de [sujeto], con estética impresionista ligera, pinceladas sueltas y lavados translúcidos en tonos [color1] y [color2]. Difuminado suave sobre textura de papel prensado en frío, iluminación delicada, composición limpia, enfoque minimalista, sensación de calma, ligereza y belleza efímera, alta calidad, estilo editorial.",
      en: "Ilustración en acuarela de estilo onírico de [sujeto], con estética impresionista ligera, pinceladas sueltas y lavados translúcidos en tonos [color1] y [color2]. Difuminado suave sobre textura de papel prensado en frío, iluminación delicada, composición limpia, enfoque minimalista, sensación de calma, ligereza y belleza efímera, alta calidad, estilo editorial.",
      ja: "Ilustración en acuarela de estilo onírico de [sujeto], con estética impresionista ligera, pinceladas sueltas y lavados translúcidos en tonos [color1] y [color2]. Difuminado suave sobre textura de papel prensado en frío, iluminación delicada, composición limpia, enfoque minimalista, sensación de calma, ligereza y belleza efímera, alta calidad, estilo editorial.",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "illustration",
    suggestedSize: "1024x1024",
  },
  {
    id: "poster-dark-fantasy-guangzhou",
    category: "poster",
    title: {
      zh: "暗黑奇幻广州城市海报",
      en: "Dark-Fantasy Guangzhou City Poster",
      ja: "ダークファンタジー広州シティポスター",
    },
    author: "liyue_ai",
    sourceUrl: "https://x.com/liyue_ai/status/2046243132774494607",
    imagePath: "/generation-prompt-examples/poster-dark-fantasy-guangzhou.jpg",
    prompt: {
      zh: "平面插画,东方幻想风格高端城市海报设计,竖版9:16构图,整体采用对角线+S型流动构图,从左下向右上延展,画面以深邃黑色为背景,自上而下渐变至浓烈暗红色,形成强烈冷暖对比与空间纵深,背景带微弱星尘与颗粒质感。画面中央一条金色流动能量线条如火焰般蜿蜒贯穿,自底部向上延伸,具有流体质感、粒子光效与渐变高光,局部带细微能量碎屑与体积光。\r\n\r\n金色流光中逐层浮现广州城市地标建筑群:广州塔为视觉核心,比例突出,周围融合珠江新城高楼群、猎德大桥及现代与岭南建筑元素,建筑采用“精细线描 + 金色发光体块”表现,轮廓清晰、细节丰富,在金色光晕映衬下仿佛悬浮于虚空,形成超现实空间层次,远景轻微雾化增强纵深感。\r\n\r\n画面底部为一位东方白发女性形象,长发飘逸,如烟似雾,与金色流光自然衔接并逐渐融合,发丝半透明带渐变光感,姿态柔美,双目微闭,神情宁静,怀抱一束多彩鲜花,花间点缀微光粒子与星点效果,象征人与城市能量的精神连接,人物细节适度简化以突出整体设计感。\r\n\r\n光影集中于金色流线、建筑与人物轮廓,形成强烈明暗对比与视觉聚焦,整体氛围宏大、神秘、具有东方神话意境且略带治愈感。色彩以黑与暗红为基底,高亮鎏金为主视觉强调,金色具备丰富明暗层次,辅以小面积高饱和花束色彩点缀,整体高级克制。\r\n\r\n页面文字与画面融合排版:顶部居中宋体大字“广州·中国”,下方小字“2026/04/20”,再下方小字“LIYUE”,文字采用淡金色或柔和暖白色,与整体光影统一。高品质细节,电影级光影表现,体积光与粒子细节丰富,画面干净无噪点,超高清8K分辨率,商业级海报质感。",
      en: "平面插画,东方幻想风格高端城市海报设计,竖版9:16构图,整体采用对角线+S型流动构图,从左下向右上延展,画面以深邃黑色为背景,自上而下渐变至浓烈暗红色,形成强烈冷暖对比与空间纵深,背景带微弱星尘与颗粒质感。画面中央一条金色流动能量线条如火焰般蜿蜒贯穿,自底部向上延伸,具有流体质感、粒子光效与渐变高光,局部带细微能量碎屑与体积光。\r\n\r\n金色流光中逐层浮现广州城市地标建筑群:广州塔为视觉核心,比例突出,周围融合珠江新城高楼群、猎德大桥及现代与岭南建筑元素,建筑采用“精细线描 + 金色发光体块”表现,轮廓清晰、细节丰富,在金色光晕映衬下仿佛悬浮于虚空,形成超现实空间层次,远景轻微雾化增强纵深感。\r\n\r\n画面底部为一位东方白发女性形象,长发飘逸,如烟似雾,与金色流光自然衔接并逐渐融合,发丝半透明带渐变光感,姿态柔美,双目微闭,神情宁静,怀抱一束多彩鲜花,花间点缀微光粒子与星点效果,象征人与城市能量的精神连接,人物细节适度简化以突出整体设计感。\r\n\r\n光影集中于金色流线、建筑与人物轮廓,形成强烈明暗对比与视觉聚焦,整体氛围宏大、神秘、具有东方神话意境且略带治愈感。色彩以黑与暗红为基底,高亮鎏金为主视觉强调,金色具备丰富明暗层次,辅以小面积高饱和花束色彩点缀,整体高级克制。\r\n\r\n页面文字与画面融合排版:顶部居中宋体大字“广州·中国”,下方小字“2026/04/20”,再下方小字“LIYUE”,文字采用淡金色或柔和暖白色,与整体光影统一。高品质细节,电影级光影表现,体积光与粒子细节丰富,画面干净无噪点,超高清8K分辨率,商业级海报质感。",
      ja: "平面插画,东方幻想风格高端城市海报设计,竖版9:16构图,整体采用对角线+S型流动构图,从左下向右上延展,画面以深邃黑色为背景,自上而下渐变至浓烈暗红色,形成强烈冷暖对比与空间纵深,背景带微弱星尘与颗粒质感。画面中央一条金色流动能量线条如火焰般蜿蜒贯穿,自底部向上延伸,具有流体质感、粒子光效与渐变高光,局部带细微能量碎屑与体积光。\r\n\r\n金色流光中逐层浮现广州城市地标建筑群:广州塔为视觉核心,比例突出,周围融合珠江新城高楼群、猎德大桥及现代与岭南建筑元素,建筑采用“精细线描 + 金色发光体块”表现,轮廓清晰、细节丰富,在金色光晕映衬下仿佛悬浮于虚空,形成超现实空间层次,远景轻微雾化增强纵深感。\r\n\r\n画面底部为一位东方白发女性形象,长发飘逸,如烟似雾,与金色流光自然衔接并逐渐融合,发丝半透明带渐变光感,姿态柔美,双目微闭,神情宁静,怀抱一束多彩鲜花,花间点缀微光粒子与星点效果,象征人与城市能量的精神连接,人物细节适度简化以突出整体设计感。\r\n\r\n光影集中于金色流线、建筑与人物轮廓,形成强烈明暗对比与视觉聚焦,整体氛围宏大、神秘、具有东方神话意境且略带治愈感。色彩以黑与暗红为基底,高亮鎏金为主视觉强调,金色具备丰富明暗层次,辅以小面积高饱和花束色彩点缀,整体高级克制。\r\n\r\n页面文字与画面融合排版:顶部居中宋体大字“广州·中国”,下方小字“2026/04/20”,再下方小字“LIYUE”,文字采用淡金色或柔和暖白色,与整体光影统一。高品质细节,电影级光影表现,体积光与粒子细节丰富,画面干净无噪点,超高清8K分辨率,商业级海报质感。",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "illustration",
    suggestedSize: "1024x1536",
  },
  {
    id: "poster-watercolor-childrens-book",
    category: "poster",
    title: {
      zh: "水彩诗意儿童绘本插画",
      en: "Soft poetic children's book illustration with watercolor and gouache textures...",
      ja: "水彩ガッシュの詩的な絵本イラスト",
    },
    author: "dotey",
    sourceUrl: "https://x.com/dotey/status/2047174895293849972",
    imagePath: "/generation-prompt-examples/poster-watercolor-childrens-book.jpg",
    prompt: {
      zh: "Soft poetic children's book illustration with watercolor and gouache textures.Clear gentle daylight with slightly brighter highlights.Muted pastel colors with soft blue and warm tones.Visible brush strokes and paper grain.Minimalist composition with large negative space.Calm, thoughtful, slightly open-ended atmosphere.\r\n\r\nChild character (around 12 years old).Subtle visual metaphors like light, shadow, perspective, reflection.Hand-painted picture book style, not cartoon, not anime, not 3D.\r\n\r\nTwo children in calm conversation,soft connection forming.",
      en: "Soft poetic children's book illustration with watercolor and gouache textures.Clear gentle daylight with slightly brighter highlights.Muted pastel colors with soft blue and warm tones.Visible brush strokes and paper grain.Minimalist composition with large negative space.Calm, thoughtful, slightly open-ended atmosphere.\r\n\r\nChild character (around 12 years old).Subtle visual metaphors like light, shadow, perspective, reflection.Hand-painted picture book style, not cartoon, not anime, not 3D.\r\n\r\nTwo children in calm conversation,soft connection forming.",
      ja: "Soft poetic children's book illustration with watercolor and gouache textures.Clear gentle daylight with slightly brighter highlights.Muted pastel colors with soft blue and warm tones.Visible brush strokes and paper grain.Minimalist composition with large negative space.Calm, thoughtful, slightly open-ended atmosphere.\r\n\r\nChild character (around 12 years old).Subtle visual metaphors like light, shadow, perspective, reflection.Hand-painted picture book style, not cartoon, not anime, not 3D.\r\n\r\nTwo children in calm conversation,soft connection forming.",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "illustration",
    suggestedSize: "1536x1024",
  },
  {
    id: "product-green-tea-film-kit",
    category: "product",
    title: {
      zh: "绿茶胶片套装产品摄影",
      en: "CALMING GREEN TEA Film Kit displayed frontally, the open box shows soft sage-...",
      ja: "グリーンティーフィルムキット製品写真",
    },
    author: "ZaraIrahh",
    sourceUrl: "https://x.com/ZaraIrahh/status/2047180061657452601",
    imagePath: "/generation-prompt-examples/product-green-tea-film-kit.jpg",
    prompt: {
      zh: "CALMING GREEN TEA Film Kit displayed frontally, the open box shows soft sage-green film pouches and translucent ampoules with matte silver caps, product placed centrally with clear branding CALMING GREEN TEA -- 7 Days to Soothed Skin, pastel green background with botanical graphic accents, three minimal icons (leaf, wave, balance) floating around the product to emphasize benefits, photographic, hyper detailed, ultra realistic, lifelike, 8k, high detail, soft professional lighting.",
      en: "CALMING GREEN TEA Film Kit displayed frontally, the open box shows soft sage-green film pouches and translucent ampoules with matte silver caps, product placed centrally with clear branding CALMING GREEN TEA -- 7 Days to Soothed Skin, pastel green background with botanical graphic accents, three minimal icons (leaf, wave, balance) floating around the product to emphasize benefits, photographic, hyper detailed, ultra realistic, lifelike, 8k, high detail, soft professional lighting.",
      ja: "CALMING GREEN TEA Film Kit displayed frontally, the open box shows soft sage-green film pouches and translucent ampoules with matte silver caps, product placed centrally with clear branding CALMING GREEN TEA -- 7 Days to Soothed Skin, pastel green background with botanical graphic accents, three minimal icons (leaf, wave, balance) floating around the product to emphasize benefits, photographic, hyper detailed, ultra realistic, lifelike, 8k, high detail, soft professional lighting.",
    },
    suggestedTemplateKey: "product_scene",
    suggestedStyle: "realistic",
    suggestedSize: "1024x1024",
  },
  {
    id: "product-strawberry-soft-serve",
    category: "product",
    title: {
      zh: "草莓冰淇淋超写实产品摄影",
      en: "Ultra-realistic product photography of a rich strawberry soft-serve ice cream...",
      ja: "ストロベリーソフトクリーム超リアル写真",
    },
    author: "ZaraIrahh",
    sourceUrl: "https://x.com/ZaraIrahh/status/2047179916161212542",
    imagePath: "/generation-prompt-examples/product-strawberry-soft-serve.jpg",
    prompt: {
      zh: "Ultra-realistic product photography of a rich strawberry soft-serve ice cream in a crispy waffle cone, styled with a clean, modern premium aesthetic. The soft serve is a vibrant natural pink, thick and creamy, sculpted into a smooth swirl with a softly curled peak, lightly topped with delicate strawberry dust or tiny fruit specks for a fresh, appetizing look. The cone has a rustic, crunchy texture with slightly uneven edges for an artisanal feel.\r\nThe background is soft beige with natural sunlight casting subtle leaf shadows, creating a calm, organic atmosphere. Include softly blurred greenery in the foreground for depth. The composition is minimal, balanced, and uses negative space effectively, similar to high-end American food brand ads.\r\nOn the left side, include modern English typography in a clean, elegant layout (not vertical).\r\nMain headline:\r\nSweet Strawberry Bliss.\r\nSupporting line (smaller text):\r\nMade with real strawberries. Smooth. Creamy. Irresistible.\r\nAdd a small circular badge showing the price:\r\n$5.80.\r\nLighting: soft natural daylight, warm highlights, shallow depth of field, high-end commercial food photography style.\r\nMood: fresh, premium, modern, and inviting — aligned with upscale U.S. dessert branding.",
      en: "Ultra-realistic product photography of a rich strawberry soft-serve ice cream in a crispy waffle cone, styled with a clean, modern premium aesthetic. The soft serve is a vibrant natural pink, thick and creamy, sculpted into a smooth swirl with a softly curled peak, lightly topped with delicate strawberry dust or tiny fruit specks for a fresh, appetizing look. The cone has a rustic, crunchy texture with slightly uneven edges for an artisanal feel.\r\nThe background is soft beige with natural sunlight casting subtle leaf shadows, creating a calm, organic atmosphere. Include softly blurred greenery in the foreground for depth. The composition is minimal, balanced, and uses negative space effectively, similar to high-end American food brand ads.\r\nOn the left side, include modern English typography in a clean, elegant layout (not vertical).\r\nMain headline:\r\nSweet Strawberry Bliss.\r\nSupporting line (smaller text):\r\nMade with real strawberries. Smooth. Creamy. Irresistible.\r\nAdd a small circular badge showing the price:\r\n$5.80.\r\nLighting: soft natural daylight, warm highlights, shallow depth of field, high-end commercial food photography style.\r\nMood: fresh, premium, modern, and inviting — aligned with upscale U.S. dessert branding.",
      ja: "Ultra-realistic product photography of a rich strawberry soft-serve ice cream in a crispy waffle cone, styled with a clean, modern premium aesthetic. The soft serve is a vibrant natural pink, thick and creamy, sculpted into a smooth swirl with a softly curled peak, lightly topped with delicate strawberry dust or tiny fruit specks for a fresh, appetizing look. The cone has a rustic, crunchy texture with slightly uneven edges for an artisanal feel.\r\nThe background is soft beige with natural sunlight casting subtle leaf shadows, creating a calm, organic atmosphere. Include softly blurred greenery in the foreground for depth. The composition is minimal, balanced, and uses negative space effectively, similar to high-end American food brand ads.\r\nOn the left side, include modern English typography in a clean, elegant layout (not vertical).\r\nMain headline:\r\nSweet Strawberry Bliss.\r\nSupporting line (smaller text):\r\nMade with real strawberries. Smooth. Creamy. Irresistible.\r\nAdd a small circular badge showing the price:\r\n$5.80.\r\nLighting: soft natural daylight, warm highlights, shallow depth of field, high-end commercial food photography style.\r\nMood: fresh, premium, modern, and inviting — aligned with upscale U.S. dessert branding.",
    },
    suggestedTemplateKey: "product_scene",
    suggestedStyle: "realistic",
    suggestedSize: "1024x1024",
  },
  {
    id: "product-premium-tempura-bowl",
    category: "product",
    title: {
      zh: "高端美食食谱海报优雅排版",
      en: "Premium Food Recipe Poster Elegant Layout",
      ja: "Premium Food Recipe Poster Elegant Layout",
    },
    author: "Preda2005",
    sourceUrl: "https://x.com/Preda2005/status/2047883394152088004",
    imagePath: "/generation-prompt-examples/product-premium-tempura-bowl.jpg",
    prompt: {
      zh: "Create a premium food preparation poster for\r\n [ DISH NAME ], with a beautiful hero dish, warm natural lighting, cream background, elegant step-by-step recipe layout, ingredients, cooking process, premium food photography, refined English typography, luxury restaurant advertisement style, clean design, rich colors, highly detailed, visually irresistible, cinematic masterpiece.",
      en: "Create a premium food preparation poster for\r\n [ DISH NAME ], with a beautiful hero dish, warm natural lighting, cream background, elegant step-by-step recipe layout, ingredients, cooking process, premium food photography, refined English typography, luxury restaurant advertisement style, clean design, rich colors, highly detailed, visually irresistible, cinematic masterpiece.",
      ja: "Create a premium food preparation poster for\r\n [ DISH NAME ], with a beautiful hero dish, warm natural lighting, cream background, elegant step-by-step recipe layout, ingredients, cooking process, premium food photography, refined English typography, luxury restaurant advertisement style, clean design, rich colors, highly detailed, visually irresistible, cinematic masterpiece.",
    },
    suggestedTemplateKey: "product_scene",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "product-tennis-fashion-ad",
    category: "product",
    title: {
      zh: "前卫网球拍雕塑运动时尚广告",
      en: "Avant-Garde Tennis Racket Sculpture Sports Fashion Ad",
      ja: "Avant-Garde Tennis Racket Sculpture Sports Fashion Ad",
    },
    author: "AIwithSynthia",
    sourceUrl: "https://x.com/AIwithSynthia/status/2047884609321619831",
    imagePath: "/generation-prompt-examples/product-tennis-fashion-ad.jpg",
    prompt: {
      zh: "Avant-garde sports fashion advertisement, oversized tennis racket positioned like monumental sculpture, female athlete seated casually on the strings as if a suspended lounge, giant word “PRECISION” in bold typography behind, crisp white studio backdrop, reflective court-like floor, luxury sportswear editorial aesthetic, cinematic lighting, ultra-clean composition, 1:1",
      en: "Avant-garde sports fashion advertisement, oversized tennis racket positioned like monumental sculpture, female athlete seated casually on the strings as if a suspended lounge, giant word “PRECISION” in bold typography behind, crisp white studio backdrop, reflective court-like floor, luxury sportswear editorial aesthetic, cinematic lighting, ultra-clean composition, 1:1",
      ja: "Avant-garde sports fashion advertisement, oversized tennis racket positioned like monumental sculpture, female athlete seated casually on the strings as if a suspended lounge, giant word “PRECISION” in bold typography behind, crisp white studio backdrop, reflective court-like floor, luxury sportswear editorial aesthetic, cinematic lighting, ultra-clean composition, 1:1",
    },
    suggestedTemplateKey: "product_scene",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1024",
  },
  {
    id: "product-beauty-commercial-photo",
    category: "product",
    title: {
      zh: "美妆产品商业营销摄影",
      en: "Beauty Product Commercial Marketing Photograph",
      ja: "Beauty Product Commercial Marketing Photograph",
    },
    author: "AIwithSarah_",
    sourceUrl: "https://x.com/AIwithSarah_/status/2047904483359760677",
    imagePath: "/generation-prompt-examples/product-beauty-commercial-photo.jpg",
    prompt: {
      zh: "A high-resolution commercial marketing photograph features a young woman with sleek dark hair and a pink ribbed top in a neutral grey studio setting, centered behind a glossy Ellie Beauty spray bottle held prominently in the foreground. The composition is energized by vibrant, lime-green graphic \"swooshes\" and floating pill-shaped callouts that highlight product features like \"glossy finish\" and \"upto 450°F protection\" in bold black sans-serif text. The lighting is professionally diffused, casting soft highlights on the model’s face while creating a sharp, vertical reflection on the metallic green-to-gold gradient bottle label. Topping the scene is a large, lime-green headline in the upper right asking, \"What does it do?\", altogether creating a clean, modern, and high-contrast aesthetic with a shallow depth of field that keeps the product and the model's focused expression in sharp relief.",
      en: "A high-resolution commercial marketing photograph features a young woman with sleek dark hair and a pink ribbed top in a neutral grey studio setting, centered behind a glossy Ellie Beauty spray bottle held prominently in the foreground. The composition is energized by vibrant, lime-green graphic \"swooshes\" and floating pill-shaped callouts that highlight product features like \"glossy finish\" and \"upto 450°F protection\" in bold black sans-serif text. The lighting is professionally diffused, casting soft highlights on the model’s face while creating a sharp, vertical reflection on the metallic green-to-gold gradient bottle label. Topping the scene is a large, lime-green headline in the upper right asking, \"What does it do?\", altogether creating a clean, modern, and high-contrast aesthetic with a shallow depth of field that keeps the product and the model's focused expression in sharp relief.",
      ja: "A high-resolution commercial marketing photograph features a young woman with sleek dark hair and a pink ribbed top in a neutral grey studio setting, centered behind a glossy Ellie Beauty spray bottle held prominently in the foreground. The composition is energized by vibrant, lime-green graphic \"swooshes\" and floating pill-shaped callouts that highlight product features like \"glossy finish\" and \"upto 450°F protection\" in bold black sans-serif text. The lighting is professionally diffused, casting soft highlights on the model’s face while creating a sharp, vertical reflection on the metallic green-to-gold gradient bottle label. Topping the scene is a large, lime-green headline in the upper right asking, \"What does it do?\", altogether creating a clean, modern, and high-contrast aesthetic with a shallow depth of field that keeps the product and the model's focused expression in sharp relief.",
    },
    suggestedTemplateKey: "product_scene",
    suggestedStyle: "realistic",
    suggestedSize: "1024x1536",
  },
  {
    id: "ui-one-prompt-design-system",
    category: "ui",
    title: {
      zh: "单提示词 UI 设计生成",
      en: "One-Prompt UI Design Generation",
      ja: "ワンプロンプトUIデザイン生成",
    },
    author: "austinit",
    sourceUrl: "https://x.com/austinit/status/2044968740782272596",
    imagePath: "/generation-prompt-examples/ui-one-prompt-design-system.jpg",
    prompt: {
      zh: "用这种风格帮我生成一套UI设计系统，包含网页、移动端、卡片、控件、按钮 以及其它",
      en: "用这种风格帮我生成一套UI设计系统，包含网页、移动端、卡片、控件、按钮 以及其它",
      ja: "用这种风格帮我生成一套UI设计系统，包含网页、移动端、卡片、控件、按钮 以及其它",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "minimal",
    suggestedSize: "1024x1536",
  },
  {
    id: "ui-style-to-design-system",
    category: "ui",
    title: {
      zh: "风格转 UI 设计系统",
      en: "Style-to-UI Design System",
      ja: "Style-to-UI Design System",
    },
    author: "stark_nico99",
    sourceUrl: "https://x.com/stark_nico99/status/2045836554451706125",
    imagePath: "/generation-prompt-examples/ui-style-to-design-system.jpg",
    prompt: {
      zh: "用这种风格帮我生成一套UI设计系统，包含网页、移动端、卡片、控件、按钮以及其它。把这套视觉风格作为参考生成网页。我尝试了宇宙、飞行、蝴蝶主题。",
      en: "用这种风格帮我生成一套UI设计系统，包含网页、移动端、卡片、控件、按钮以及其它。把这套视觉风格作为参考生成网页。我尝试了宇宙、飞行、蝴蝶主题。",
      ja: "用这种风格帮我生成一套UI设计系统，包含网页、移动端、卡片、控件、按钮以及其它。把这套视觉风格作为参考生成网页。我尝试了宇宙、飞行、蝴蝶主题。",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "minimal",
    suggestedSize: "1024x1536",
  },
  {
    id: "ui-hanfu-museum-infographic",
    category: "ui",
    title: {
      zh: "博物馆风格汉服解析信息图",
      en: "Museum-Style Hanfu Breakdown Infographic",
      ja: "Museum-Style Hanfu Breakdown Infographic",
    },
    author: "MrLarus",
    sourceUrl: "https://x.com/MrLarus/status/2045504669401653414",
    imagePath: "/generation-prompt-examples/ui-hanfu-museum-infographic.jpg",
    prompt: {
      zh: "请根据【主题】自动生成一张“博物馆图鉴式中文拆解信息图”。\r\n\r\n要求整张图兼具真实写实主视觉、结构拆解、中文标注、材质说明、纹样寓意、色彩含义和核心特征总结。你需要根据【主题】自动判断最合适的主体对象、服饰体系、器物结构、时代风格、关键部件、材质工艺、颜色方案与版式结构，用户无需再提供其他信息。\r\n\r\n整体风格应为：国家博物馆展板、历史服饰图鉴、文博专题信息图，而不是普通海报、古风写真、电商详情页或动漫插画。背景采用米白、绢纸白、浅茶色等纸张质感，整体高级、克制、专业、可收藏。\r\n\r\n版式固定为：\r\n- 顶部：中文主标题 + 副标题 + 导语\r\n- 左侧：结构拆解区，中文引线标注关键部件，并配局部特写\r\n- 右上：材质 / 工艺 / 质感区，展示真实纹理小样并附说明\r\n- 右中：纹样 / 色彩 / 寓意区，展示主色板、纹样样本和文化解释\r\n- 底部：穿着顺序 / 构成流程图 + 核心特征总结\r\n\r\n若主题适合人物展示，则以真实人物全身站姿为中央主体；若更适合器物或单体结构，则改为中心主体拆解图，但整体仍保持完整中文信息图形式。所有文字必须为简体中文，清晰、规整、可读，不要乱码、错字、英文或拼音。重点突出真实结构、材质差异、文化说明与图鉴气质。\r\n\r\n避免：海报感、影楼感、电商感、动漫感、cosplay感、乱标注、错结构、糊字、假材质、过度装饰。",
      en: "请根据【主题】自动生成一张“博物馆图鉴式中文拆解信息图”。\r\n\r\n要求整张图兼具真实写实主视觉、结构拆解、中文标注、材质说明、纹样寓意、色彩含义和核心特征总结。你需要根据【主题】自动判断最合适的主体对象、服饰体系、器物结构、时代风格、关键部件、材质工艺、颜色方案与版式结构，用户无需再提供其他信息。\r\n\r\n整体风格应为：国家博物馆展板、历史服饰图鉴、文博专题信息图，而不是普通海报、古风写真、电商详情页或动漫插画。背景采用米白、绢纸白、浅茶色等纸张质感，整体高级、克制、专业、可收藏。\r\n\r\n版式固定为：\r\n- 顶部：中文主标题 + 副标题 + 导语\r\n- 左侧：结构拆解区，中文引线标注关键部件，并配局部特写\r\n- 右上：材质 / 工艺 / 质感区，展示真实纹理小样并附说明\r\n- 右中：纹样 / 色彩 / 寓意区，展示主色板、纹样样本和文化解释\r\n- 底部：穿着顺序 / 构成流程图 + 核心特征总结\r\n\r\n若主题适合人物展示，则以真实人物全身站姿为中央主体；若更适合器物或单体结构，则改为中心主体拆解图，但整体仍保持完整中文信息图形式。所有文字必须为简体中文，清晰、规整、可读，不要乱码、错字、英文或拼音。重点突出真实结构、材质差异、文化说明与图鉴气质。\r\n\r\n避免：海报感、影楼感、电商感、动漫感、cosplay感、乱标注、错结构、糊字、假材质、过度装饰。",
      ja: "请根据【主题】自动生成一张“博物馆图鉴式中文拆解信息图”。\r\n\r\n要求整张图兼具真实写实主视觉、结构拆解、中文标注、材质说明、纹样寓意、色彩含义和核心特征总结。你需要根据【主题】自动判断最合适的主体对象、服饰体系、器物结构、时代风格、关键部件、材质工艺、颜色方案与版式结构，用户无需再提供其他信息。\r\n\r\n整体风格应为：国家博物馆展板、历史服饰图鉴、文博专题信息图，而不是普通海报、古风写真、电商详情页或动漫插画。背景采用米白、绢纸白、浅茶色等纸张质感，整体高级、克制、专业、可收藏。\r\n\r\n版式固定为：\r\n- 顶部：中文主标题 + 副标题 + 导语\r\n- 左侧：结构拆解区，中文引线标注关键部件，并配局部特写\r\n- 右上：材质 / 工艺 / 质感区，展示真实纹理小样并附说明\r\n- 右中：纹样 / 色彩 / 寓意区，展示主色板、纹样样本和文化解释\r\n- 底部：穿着顺序 / 构成流程图 + 核心特征总结\r\n\r\n若主题适合人物展示，则以真实人物全身站姿为中央主体；若更适合器物或单体结构，则改为中心主体拆解图，但整体仍保持完整中文信息图形式。所有文字必须为简体中文，清晰、规整、可读，不要乱码、错字、英文或拼音。重点突出真实结构、材质差异、文化说明与图鉴气质。\r\n\r\n避免：海报感、影楼感、电商感、动漫感、cosplay感、乱标注、错结构、糊字、假材质、过度装饰。",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "ui-cyberpunk-neon-system",
    category: "ui",
    title: {
      zh: "赛博朋克霓虹 UI 设计系统",
      en: "Cyberpunk Neon UI Design System",
      ja: "Cyberpunk Neon UI Design System",
    },
    author: "AZLnfvp",
    sourceUrl: "https://x.com/AZLnfvp/status/2046468976092533180",
    imagePath: "/generation-prompt-examples/ui-cyberpunk-neon-system.jpg",
    prompt: {
      zh: "用未来都市风格生成UI设计系统,灵感来自赛博朋克城市夜景,包含霓虹灯、玻璃建筑反射、高对比光影,配色以紫色、蓝色、粉色霓虹为主,设计网页Dashboard、移动端界面、卡片、按钮、控件等,视觉炫酷、层次丰富、科技感极强",
      en: "用未来都市风格生成UI设计系统,灵感来自赛博朋克城市夜景,包含霓虹灯、玻璃建筑反射、高对比光影,配色以紫色、蓝色、粉色霓虹为主,设计网页Dashboard、移动端界面、卡片、按钮、控件等,视觉炫酷、层次丰富、科技感极强",
      ja: "用未来都市风格生成UI设计系统,灵感来自赛博朋克城市夜景,包含霓虹灯、玻璃建筑反射、高对比光影,配色以紫色、蓝色、粉色霓虹为主,设计网页Dashboard、移动端界面、卡片、按钮、控件等,视觉炫酷、层次丰富、科技感极强",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "illustration",
    suggestedSize: "1536x1024",
  },
  {
    id: "ui-ai-game-dev-overview-slide",
    category: "ui",
    title: {
      zh: "日本 AI 游戏开发概览幻灯片",
      en: "Japanese AI Game Dev Overview Slide Prompt",
      ja: "Japanese AI Game Dev Overview Slide Prompt",
    },
    author: "ailovedirector",
    sourceUrl: "https://x.com/ailovedirector/status/2046905387274891296",
    imagePath: "/generation-prompt-examples/ui-ai-game-dev-overview-slide.jpg",
    prompt: {
      zh: "横長のパワポ画像ここで生成してみて　どのモデル使ってるか判定するから、今のAIゲーム開発の概要をまとめた1枚パワポで　日本語で\r\n\r\nゲーム開発の技術に関して、工数ベースでどこにパワーかかるかの分析資料といかに量産が大事かについての説明とかのパワポ画も作って",
      en: "横長のパワポ画像ここで生成してみて　どのモデル使ってるか判定するから、今のAIゲーム開発の概要をまとめた1枚パワポで　日本語で\r\n\r\nゲーム開発の技術に関して、工数ベースでどこにパワーかかるかの分析資料といかに量産が大事かについての説明とかのパワポ画も作って",
      ja: "横長のパワポ画像ここで生成してみて　どのモデル使ってるか判定するから、今のAIゲーム開発の概要をまとめた1枚パワポで　日本語で\r\n\r\nゲーム開発の技術に関して、工数ベースでどこにパワーかかるかの分析資料といかに量産が大事かについての説明とかのパワポ画も作って",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "minimal",
    suggestedSize: "1536x1024",
  },
  {
    id: "experimental-dark-myth-scene",
    category: "experimental",
    title: {
      zh: "狮驼岭暗黑神话场景",
      en: "Lion Camel Ridge Dark Myth Scene",
      ja: "Lion Camel Ridge Dark Myth Scene",
    },
    author: "MANISH1027512",
    sourceUrl: "https://x.com/MANISH1027512/status/2045743158860878312",
    imagePath: "/generation-prompt-examples/experimental-dark-myth-scene.jpg",
    prompt: {
      zh: "中式怪异，黑暗神秘风格融合中式美学，完美细节，多重管线渲染，完美建模。西游记背景，狮驼岭，千妖万怪，坐在左边巨大王座上的大象王重甲妖精，坐在中间巨大王座上的狮王重甲妖精，坐在右边巨大王座上大鹏鸟王重甲妖精。渺小的背对镜头孙悟空肩抗金箍棒步行前进，孙悟空身穿铠甲，近地仰拍镜头，长焦镜头，强烈阴影。极致细节刻画，多次修改，正确透视和主体线条，精致细节",
      en: "中式怪异，黑暗神秘风格融合中式美学，完美细节，多重管线渲染，完美建模。西游记背景，狮驼岭，千妖万怪，坐在左边巨大王座上的大象王重甲妖精，坐在中间巨大王座上的狮王重甲妖精，坐在右边巨大王座上大鹏鸟王重甲妖精。渺小的背对镜头孙悟空肩抗金箍棒步行前进，孙悟空身穿铠甲，近地仰拍镜头，长焦镜头，强烈阴影。极致细节刻画，多次修改，正确透视和主体线条，精致细节",
      ja: "中式怪异，黑暗神秘风格融合中式美学，完美细节，多重管线渲染，完美建模。西游记背景，狮驼岭，千妖万怪，坐在左边巨大王座上的大象王重甲妖精，坐在中间巨大王座上的狮王重甲妖精，坐在右边巨大王座上大鹏鸟王重甲妖精。渺小的背对镜头孙悟空肩抗金箍棒步行前进，孙悟空身穿铠甲，近地仰拍镜头，长焦镜头，强烈阴影。极致细节刻画，多次修改，正确透视和主体线条，精致细节",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "cinematic",
    suggestedSize: "1536x1024",
  },
  {
    id: "experimental-street-fashion-motion",
    category: "experimental",
    title: {
      zh: "街头时尚全身人像摄影",
      en: "A full-body outdoor shot captures a young Caucasian woman, possibly in her la...",
      ja: "ストリートファッション全身ポートレート",
    },
    author: "AIwithSarah_",
    sourceUrl: "https://x.com/AIwithSarah_/status/2047234995627172229",
    imagePath: "/generation-prompt-examples/experimental-street-fashion-motion.jpg",
    prompt: {
      zh: "A full-body outdoor shot captures a young Caucasian woman, possibly in her late 20s, striding through a city crosswalk. She wears an oversized, matte chocolate-brown leather jacket paired with a free-flowing black skirt and sleek knee-high black boots, conveying a sense of high fashion street style. Her long, dark brown hair is wind-swept, complementing her poised and confident expression as she glances sideways. Behind her, a blurred urban backdrop features a yellow taxi and pedestrians, with buildings displaying varied architectural details in neutral tones. The scene utilizes soft ambient daylight filtering through light cloud cover, producing a muted, overcast lighting effect. The warm, earthy color palette consists of brown, black, and touches of beige. The image, likely from a high-resolution digital camera, presents a wide-angle view that maintains focus throughout, emphasizing a dynamic and fashionable feel.",
      en: "A full-body outdoor shot captures a young Caucasian woman, possibly in her late 20s, striding through a city crosswalk. She wears an oversized, matte chocolate-brown leather jacket paired with a free-flowing black skirt and sleek knee-high black boots, conveying a sense of high fashion street style. Her long, dark brown hair is wind-swept, complementing her poised and confident expression as she glances sideways. Behind her, a blurred urban backdrop features a yellow taxi and pedestrians, with buildings displaying varied architectural details in neutral tones. The scene utilizes soft ambient daylight filtering through light cloud cover, producing a muted, overcast lighting effect. The warm, earthy color palette consists of brown, black, and touches of beige. The image, likely from a high-resolution digital camera, presents a wide-angle view that maintains focus throughout, emphasizing a dynamic and fashionable feel.",
      ja: "A full-body outdoor shot captures a young Caucasian woman, possibly in her late 20s, striding through a city crosswalk. She wears an oversized, matte chocolate-brown leather jacket paired with a free-flowing black skirt and sleek knee-high black boots, conveying a sense of high fashion street style. Her long, dark brown hair is wind-swept, complementing her poised and confident expression as she glances sideways. Behind her, a blurred urban backdrop features a yellow taxi and pedestrians, with buildings displaying varied architectural details in neutral tones. The scene utilizes soft ambient daylight filtering through light cloud cover, producing a muted, overcast lighting effect. The warm, earthy color palette consists of brown, black, and touches of beige. The image, likely from a high-resolution digital camera, presents a wide-angle view that maintains focus throughout, emphasizing a dynamic and fashionable feel.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "experimental-silhouette-universe-poster",
    category: "experimental",
    title: {
      zh: "剪影宇宙叙事海报",
      en: "Silhouette Universe Narrative Poster",
      ja: "Silhouette Universe Narrative Poster",
    },
    author: "MrLarus",
    sourceUrl: "https://x.com/MrLarus/status/2045418028733538620",
    imagePath: "/generation-prompt-examples/experimental-silhouette-universe-poster.jpg",
    prompt: {
      zh: "请根据【主题：xxx】自动生成一张高审美的“轮廓宇宙 / 收藏版叙事海报”风格作品。不要将画面局限于固定器物或常见容器，不要优先默认瓶子、沙漏、玻璃罩、怀表之类的常规载体，而是由 AI 根据主题自行判断并选择一个最契合、最有象征意义、轮廓最强、最适合承载完整叙事世界的主轮廓载体。这个主轮廓可以是器物、建筑、门、塔、拱门、穹顶、楼梯井、长廊、雕像、侧脸、眼睛、手掌、头骨、羽翼、面具、镜面、王座、圆环、裂缝、光幕、阴影、几何结构、空间切面、舞台框景、抽象符号或其他更有创意与主题代表性的视觉轮廓，要求合理布局。优先选择最能放大主题气质、最能形成强烈视觉记忆点、最能体现史诗感、神秘感、诗意感或设计感的轮廓，而不是最安全、最普通、最常见的容器。\r\n\r\n画面的核心不是简单把世界装进某个物体里，而是让完整的主题世界自然生长在这个主轮廓之中、之内、之上、之边界里或与其结构融为一体，形成一种“主题宇宙依附于一个象征性轮廓展开”的高级叙事效果。主轮廓必须清晰、优雅、有辨识度，并在整体构图中占据核心地位。轮廓内部或边界中需要自动生成与主题强绑定的完整叙事世界，内容应当丰富、饱满、层次清晰，包括最能代表主题的标志性场景、核心建筑或空间结构、象征符号与隐喻元素、角色关系或文明痕迹、远景中景近景的空间递进、具有命运感和情绪张力的氛围层次，以及门、台阶、桥梁、水面、烟雾、路径、光源、遗迹、机械结构、自然景观、抽象形态、生物或道具等叙事细节。所有元素必须统一、自然、有主次、有层级地融合，像一个完整世界真实孕育在这个轮廓结构之中，而不是简单拼贴、裁切填充、素材堆叠或模板化背景。\r\n\r\n整体构图需要具有强烈的收藏版海报气质与高级设计感，大结构稳定，主轮廓强烈明确，内部世界具有纵深、秩序和呼吸感，细节丰富但不拥挤，内容丰满但不杂乱，可以适度加入小比例人物剪影、远处建筑、光柱、门洞、桥、阶梯、回廊、倒影、天光或远景结构来增强尺度感、故事感与史诗感。整体画面要安静、宏大、凝练、富有余味，不要平均铺满，不要廉价热闹，不要无重点堆砌。\r\n\r\n风格融合收藏版电影海报构图、高级叙事型视觉设计、梦幻水彩质感与纸张印刷品气质，强调纸张颗粒感、边缘飞白、水彩刷痕、轻微晕染、空气透视、柔和雾化、局部体积光、光雾穿透、大面积留白与克制版式，让画面看起来像设计师完成的高端收藏版视觉作品，而不是普通 AI 跑图。整体气质要高级、诗意、宏大、神圣、怀旧、安静、具有传说感和叙事感。\r\n\r\n色彩由 AI 根据主题自动判断并匹配最合适的高级配色方案，但必须保持统一、克制、耐看、低饱和、高级，不要杂乱高饱和，不要廉价霓虹感，不要塑料数码感。配色可以围绕黑金灰、冷蓝灰、雾白灰、褐红米白、暗铜、旧纸色、深海蓝、暮色紫、银灰等体系自由变化，但必须始终服务主题，并保持海报级审美与整体和谐。\r\n\r\n最终要求：第一眼有强烈的主题识别度和轮廓记忆点，第二眼有完整丰富的叙事世界，第三眼仍有细节和余味。轮廓选择必须具有创意和主题匹配度，尽量避免重复、保守、常见的容器套路，优先选择更有象征性、更有空间感、更有设计潜力的轮廓形式。不要普通背景拼接，不要生硬裁切，不要模板化奇幻素材，不要游戏宣传图感，不要过度卡通化，不要过度写实导致失去艺术感，不要形式大于内容。如果合适，可以自然加入低调克制的标题、编号、签名或落款，让它更像收藏版海报设计的一部分，但不要喧宾夺主。",
      en: "请根据【主题：xxx】自动生成一张高审美的“轮廓宇宙 / 收藏版叙事海报”风格作品。不要将画面局限于固定器物或常见容器，不要优先默认瓶子、沙漏、玻璃罩、怀表之类的常规载体，而是由 AI 根据主题自行判断并选择一个最契合、最有象征意义、轮廓最强、最适合承载完整叙事世界的主轮廓载体。这个主轮廓可以是器物、建筑、门、塔、拱门、穹顶、楼梯井、长廊、雕像、侧脸、眼睛、手掌、头骨、羽翼、面具、镜面、王座、圆环、裂缝、光幕、阴影、几何结构、空间切面、舞台框景、抽象符号或其他更有创意与主题代表性的视觉轮廓，要求合理布局。优先选择最能放大主题气质、最能形成强烈视觉记忆点、最能体现史诗感、神秘感、诗意感或设计感的轮廓，而不是最安全、最普通、最常见的容器。\r\n\r\n画面的核心不是简单把世界装进某个物体里，而是让完整的主题世界自然生长在这个主轮廓之中、之内、之上、之边界里或与其结构融为一体，形成一种“主题宇宙依附于一个象征性轮廓展开”的高级叙事效果。主轮廓必须清晰、优雅、有辨识度，并在整体构图中占据核心地位。轮廓内部或边界中需要自动生成与主题强绑定的完整叙事世界，内容应当丰富、饱满、层次清晰，包括最能代表主题的标志性场景、核心建筑或空间结构、象征符号与隐喻元素、角色关系或文明痕迹、远景中景近景的空间递进、具有命运感和情绪张力的氛围层次，以及门、台阶、桥梁、水面、烟雾、路径、光源、遗迹、机械结构、自然景观、抽象形态、生物或道具等叙事细节。所有元素必须统一、自然、有主次、有层级地融合，像一个完整世界真实孕育在这个轮廓结构之中，而不是简单拼贴、裁切填充、素材堆叠或模板化背景。\r\n\r\n整体构图需要具有强烈的收藏版海报气质与高级设计感，大结构稳定，主轮廓强烈明确，内部世界具有纵深、秩序和呼吸感，细节丰富但不拥挤，内容丰满但不杂乱，可以适度加入小比例人物剪影、远处建筑、光柱、门洞、桥、阶梯、回廊、倒影、天光或远景结构来增强尺度感、故事感与史诗感。整体画面要安静、宏大、凝练、富有余味，不要平均铺满，不要廉价热闹，不要无重点堆砌。\r\n\r\n风格融合收藏版电影海报构图、高级叙事型视觉设计、梦幻水彩质感与纸张印刷品气质，强调纸张颗粒感、边缘飞白、水彩刷痕、轻微晕染、空气透视、柔和雾化、局部体积光、光雾穿透、大面积留白与克制版式，让画面看起来像设计师完成的高端收藏版视觉作品，而不是普通 AI 跑图。整体气质要高级、诗意、宏大、神圣、怀旧、安静、具有传说感和叙事感。\r\n\r\n色彩由 AI 根据主题自动判断并匹配最合适的高级配色方案，但必须保持统一、克制、耐看、低饱和、高级，不要杂乱高饱和，不要廉价霓虹感，不要塑料数码感。配色可以围绕黑金灰、冷蓝灰、雾白灰、褐红米白、暗铜、旧纸色、深海蓝、暮色紫、银灰等体系自由变化，但必须始终服务主题，并保持海报级审美与整体和谐。\r\n\r\n最终要求：第一眼有强烈的主题识别度和轮廓记忆点，第二眼有完整丰富的叙事世界，第三眼仍有细节和余味。轮廓选择必须具有创意和主题匹配度，尽量避免重复、保守、常见的容器套路，优先选择更有象征性、更有空间感、更有设计潜力的轮廓形式。不要普通背景拼接，不要生硬裁切，不要模板化奇幻素材，不要游戏宣传图感，不要过度卡通化，不要过度写实导致失去艺术感，不要形式大于内容。如果合适，可以自然加入低调克制的标题、编号、签名或落款，让它更像收藏版海报设计的一部分，但不要喧宾夺主。",
      ja: "请根据【主题：xxx】自动生成一张高审美的“轮廓宇宙 / 收藏版叙事海报”风格作品。不要将画面局限于固定器物或常见容器，不要优先默认瓶子、沙漏、玻璃罩、怀表之类的常规载体，而是由 AI 根据主题自行判断并选择一个最契合、最有象征意义、轮廓最强、最适合承载完整叙事世界的主轮廓载体。这个主轮廓可以是器物、建筑、门、塔、拱门、穹顶、楼梯井、长廊、雕像、侧脸、眼睛、手掌、头骨、羽翼、面具、镜面、王座、圆环、裂缝、光幕、阴影、几何结构、空间切面、舞台框景、抽象符号或其他更有创意与主题代表性的视觉轮廓，要求合理布局。优先选择最能放大主题气质、最能形成强烈视觉记忆点、最能体现史诗感、神秘感、诗意感或设计感的轮廓，而不是最安全、最普通、最常见的容器。\r\n\r\n画面的核心不是简单把世界装进某个物体里，而是让完整的主题世界自然生长在这个主轮廓之中、之内、之上、之边界里或与其结构融为一体，形成一种“主题宇宙依附于一个象征性轮廓展开”的高级叙事效果。主轮廓必须清晰、优雅、有辨识度，并在整体构图中占据核心地位。轮廓内部或边界中需要自动生成与主题强绑定的完整叙事世界，内容应当丰富、饱满、层次清晰，包括最能代表主题的标志性场景、核心建筑或空间结构、象征符号与隐喻元素、角色关系或文明痕迹、远景中景近景的空间递进、具有命运感和情绪张力的氛围层次，以及门、台阶、桥梁、水面、烟雾、路径、光源、遗迹、机械结构、自然景观、抽象形态、生物或道具等叙事细节。所有元素必须统一、自然、有主次、有层级地融合，像一个完整世界真实孕育在这个轮廓结构之中，而不是简单拼贴、裁切填充、素材堆叠或模板化背景。\r\n\r\n整体构图需要具有强烈的收藏版海报气质与高级设计感，大结构稳定，主轮廓强烈明确，内部世界具有纵深、秩序和呼吸感，细节丰富但不拥挤，内容丰满但不杂乱，可以适度加入小比例人物剪影、远处建筑、光柱、门洞、桥、阶梯、回廊、倒影、天光或远景结构来增强尺度感、故事感与史诗感。整体画面要安静、宏大、凝练、富有余味，不要平均铺满，不要廉价热闹，不要无重点堆砌。\r\n\r\n风格融合收藏版电影海报构图、高级叙事型视觉设计、梦幻水彩质感与纸张印刷品气质，强调纸张颗粒感、边缘飞白、水彩刷痕、轻微晕染、空气透视、柔和雾化、局部体积光、光雾穿透、大面积留白与克制版式，让画面看起来像设计师完成的高端收藏版视觉作品，而不是普通 AI 跑图。整体气质要高级、诗意、宏大、神圣、怀旧、安静、具有传说感和叙事感。\r\n\r\n色彩由 AI 根据主题自动判断并匹配最合适的高级配色方案，但必须保持统一、克制、耐看、低饱和、高级，不要杂乱高饱和，不要廉价霓虹感，不要塑料数码感。配色可以围绕黑金灰、冷蓝灰、雾白灰、褐红米白、暗铜、旧纸色、深海蓝、暮色紫、银灰等体系自由变化，但必须始终服务主题，并保持海报级审美与整体和谐。\r\n\r\n最终要求：第一眼有强烈的主题识别度和轮廓记忆点，第二眼有完整丰富的叙事世界，第三眼仍有细节和余味。轮廓选择必须具有创意和主题匹配度，尽量避免重复、保守、常见的容器套路，优先选择更有象征性、更有空间感、更有设计潜力的轮廓形式。不要普通背景拼接，不要生硬裁切，不要模板化奇幻素材，不要游戏宣传图感，不要过度卡通化，不要过度写实导致失去艺术感，不要形式大于内容。如果合适，可以自然加入低调克制的标题、编号、签名或落款，让它更像收藏版海报设计的一部分，但不要喧宾夺主。",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "illustration",
    suggestedSize: "1024x1536",
  },
  {
    id: "experimental-retro-programming-cartoon",
    category: "experimental",
    title: {
      zh: "复古编程博物馆卡通",
      en: "Retro Programming Museum Cartoon",
      ja: "Retro Programming Museum Cartoon",
    },
    author: "XiaohuiAI666",
    sourceUrl: "https://x.com/XiaohuiAI666/status/2046515319947354603",
    imagePath: "/generation-prompt-examples/experimental-retro-programming-cartoon.jpg",
    prompt: {
      zh: "在计算机博物馆里,一个程序员在展厅中央,正在演示C语言编程,很多参观者在围观,屏幕上的代码清晰可见。旁边的牌子写着:古法编程,现场表演。2D卡通画风,16:9",
      en: "在计算机博物馆里,一个程序员在展厅中央,正在演示C语言编程,很多参观者在围观,屏幕上的代码清晰可见。旁边的牌子写着:古法编程,现场表演。2D卡通画风,16:9",
      ja: "在计算机博物馆里,一个程序员在展厅中央,正在演示C语言编程,很多参观者在围观,屏幕上的代码清晰可见。旁边的牌子写着:古法编程,现场表演。2D卡通画风,16:9",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "illustration",
    suggestedSize: "1536x1024",
  },
  {
    id: "experimental-fourteenth-dimension-scene",
    category: "experimental",
    title: {
      zh: "第十四维投影场景",
      en: "14th-Dimension Projection Scene",
      ja: "14th-Dimension Projection Scene",
    },
    author: "workingclassbud",
    sourceUrl: "https://x.com/workingclassbud/status/2046506783850815703",
    imagePath: "/generation-prompt-examples/experimental-fourteenth-dimension-scene.jpg",
    prompt: {
      zh: "A dusk shindig  with multiple fake imagination projections all aligned in the 14th dimensions",
      en: "A dusk shindig  with multiple fake imagination projections all aligned in the 14th dimensions",
      ja: "A dusk shindig  with multiple fake imagination projections all aligned in the 14th dimensions",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "cinematic",
    suggestedSize: "1536x1024",
  },
  {
    id: "photo-cyberpunk-sci-fi-side-profile",
    category: "photography",
    title: {
      zh: "赛博朋克科幻侧脸人像",
      en: "Cyberpunk Sci-Fi Side Profile Portrait",
      ja: "サイバーパンクSFサイドプロフィールポートレート",
    },
    author: "iamsofiaijaz",
    sourceUrl: "https://x.com/iamsofiaijaz/status/2047882171336253928",
    imagePath: "/generation-prompt-examples/photo-cyberpunk-sci-fi-side-profile.jpg",
    prompt: {
      zh: "A cinematic side-profile portrait of a rugged man with a tied-back bun and full beard, wearing round dark sunglasses and a textured leather jacket. His skin is detailed and slightly weathered. The background is a futuristic sci-fi interface filled with glowing orange and red data streams, star maps, celestial navigation diagrams, grids, and holographic UI elements. Fiery particle effects and ember-like energy swirl around him, creating a cosmic, high-tech atmosphere. Dark color palette with strong contrast, dramatic lighting, ultra-detailed, sharp focus, 8K, cyberpunk aesthetic, cinematic composition, depth of field.",
      en: "A cinematic side-profile portrait of a rugged man with a tied-back bun and full beard, wearing round dark sunglasses and a textured leather jacket. His skin is detailed and slightly weathered. The background is a futuristic sci-fi interface filled with glowing orange and red data streams, star maps, celestial navigation diagrams, grids, and holographic UI elements. Fiery particle effects and ember-like energy swirl around him, creating a cosmic, high-tech atmosphere. Dark color palette with strong contrast, dramatic lighting, ultra-detailed, sharp focus, 8K, cyberpunk aesthetic, cinematic composition, depth of field.",
      ja: "A cinematic side-profile portrait of a rugged man with a tied-back bun and full beard, wearing round dark sunglasses and a textured leather jacket. His skin is detailed and slightly weathered. The background is a futuristic sci-fi interface filled with glowing orange and red data streams, star maps, celestial navigation diagrams, grids, and holographic UI elements. Fiery particle effects and ember-like energy swirl around him, creating a cosmic, high-tech atmosphere. Dark color palette with strong contrast, dramatic lighting, ultra-detailed, sharp focus, 8K, cyberpunk aesthetic, cinematic composition, depth of field.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "cinematic",
    suggestedSize: "1024x1536",
  },
  {
    id: "poster-boston-spring-2026-city",
    category: "poster",
    title: {
      zh: "波士顿 2026 春季城市海报",
      en: "Boston Spring 2026 City Poster",
      ja: "ボストン2026春のシティポスター",
    },
    author: "BubbleBrain",
    sourceUrl: "https://x.com/BubbleBrain/status/2045358053831172358",
    imagePath: "/generation-prompt-examples/poster-boston-spring-2026-city.jpg",
    prompt: {
      zh: "A striking Spring 2026 city poster for Boston with an elegant celebratory mood and a bold contemporary design. On a clean off-white textured background with large areas of negative space, a miniature single sculler rows across the lower right corner of the image on a narrow ribbon of reflective water. The wake from the oar sweeps upward in a dynamic calligraphic curve, gradually transforming into the Charles River and then into a dreamlike hand-painted panorama of Boston. Inside this flowing river-shaped composition are iconic Boston elements: the Back Bay skyline, Beacon Hill brownstones, Acorn Street, Boston Public Garden, Swan Boats, Zakim Bridge, Fenway-inspired details, historic brick architecture, harbor ferries, and the city’s waterfront atmosphere. Soft morning fog, golden spring light, subtle festive accents in crimson and gold, rich detail, layered depth, sophisticated city-poster aesthetics, fresh and refined, visually powerful but not overcrowded. Elegant typography in the lower left reads “SPRING 2026” with a vertical slogan “BOSTON, A CITY OF RIVER, MEMORY, AND INVENTION”, text clear and beautifully composed, premium graphic design, 9:16",
      en: "A striking Spring 2026 city poster for Boston with an elegant celebratory mood and a bold contemporary design. On a clean off-white textured background with large areas of negative space, a miniature single sculler rows across the lower right corner of the image on a narrow ribbon of reflective water. The wake from the oar sweeps upward in a dynamic calligraphic curve, gradually transforming into the Charles River and then into a dreamlike hand-painted panorama of Boston. Inside this flowing river-shaped composition are iconic Boston elements: the Back Bay skyline, Beacon Hill brownstones, Acorn Street, Boston Public Garden, Swan Boats, Zakim Bridge, Fenway-inspired details, historic brick architecture, harbor ferries, and the city’s waterfront atmosphere. Soft morning fog, golden spring light, subtle festive accents in crimson and gold, rich detail, layered depth, sophisticated city-poster aesthetics, fresh and refined, visually powerful but not overcrowded. Elegant typography in the lower left reads “SPRING 2026” with a vertical slogan “BOSTON, A CITY OF RIVER, MEMORY, AND INVENTION”, text clear and beautifully composed, premium graphic design, 9:16",
      ja: "A striking Spring 2026 city poster for Boston with an elegant celebratory mood and a bold contemporary design. On a clean off-white textured background with large areas of negative space, a miniature single sculler rows across the lower right corner of the image on a narrow ribbon of reflective water. The wake from the oar sweeps upward in a dynamic calligraphic curve, gradually transforming into the Charles River and then into a dreamlike hand-painted panorama of Boston. Inside this flowing river-shaped composition are iconic Boston elements: the Back Bay skyline, Beacon Hill brownstones, Acorn Street, Boston Public Garden, Swan Boats, Zakim Bridge, Fenway-inspired details, historic brick architecture, harbor ferries, and the city’s waterfront atmosphere. Soft morning fog, golden spring light, subtle festive accents in crimson and gold, rich detail, layered depth, sophisticated city-poster aesthetics, fresh and refined, visually powerful but not overcrowded. Elegant typography in the lower left reads “SPRING 2026” with a vertical slogan “BOSTON, A CITY OF RIVER, MEMORY, AND INVENTION”, text clear and beautifully composed, premium graphic design, 9:16",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "poster-doodle-ai-builder",
    category: "poster",
    title: {
      zh: "涂鸦速写 AI Builder",
      en: "Doodle Sketch AI Builder",
      ja: "落書きスケッチAIビルダー",
    },
    author: "blanplan",
    sourceUrl: "https://x.com/blanplan/status/2045190582453350748",
    imagePath: "/generation-prompt-examples/poster-doodle-ai-builder.jpg",
    prompt: {
      zh: "以涂鸦速写风表现【一个厉害的AI builder】，整体呈现快速勾勒、自由变形、即兴手绘与草稿式的视觉效果。线条随手、夸张、可粗细不一，略显凌乱但具有节奏和表现力，强调概括、夸张、趣味和随性，而不是严谨写实或精细刻画。  颜色采用粗糙、干刷感明显的块面表现，可保留不均匀的涂抹痕迹、刷痕、飞白与覆盖感，色彩根据【主题/主体】自动适配，但整体保持涂鸦式、速写式、概括式的表达。不要透明水彩晕染效果，不要细腻水彩过渡，不要纸纹理，不要柔和雾化，不要梦幻质感。  背景以留白为主，保持简洁、轻松、未完成感和设计感，可加入少量辅助性符号、箭头、记号、圈画、重复线、随手写的文字或其他涂鸦元素，以增强速写本或随笔式视觉语言，但不可过于拥挤，不可破坏主体和留白气质。  画面内容不需要预先写清楚，由【一个厉害的AI builder】自动推演并生成最适合的主体形象、动作、相关元素、符号或简化场景，整体保持统一的涂鸦速写风和夸张概括的表现方式，避免复杂写实背景和过度铺陈。 画面中需自然加入专属签名“BlanPlan”，作为画面的一部分，位置低调但清晰，可放在左下角、右下角或标题附近，风格需与整体版式统一，像作品署名或设计落款；签名字体精致、克制、高级，不可过大，不可破坏主体构图，不可显得突兀或廉价。",
      en: "以涂鸦速写风表现【一个厉害的AI builder】，整体呈现快速勾勒、自由变形、即兴手绘与草稿式的视觉效果。线条随手、夸张、可粗细不一，略显凌乱但具有节奏和表现力，强调概括、夸张、趣味和随性，而不是严谨写实或精细刻画。  颜色采用粗糙、干刷感明显的块面表现，可保留不均匀的涂抹痕迹、刷痕、飞白与覆盖感，色彩根据【主题/主体】自动适配，但整体保持涂鸦式、速写式、概括式的表达。不要透明水彩晕染效果，不要细腻水彩过渡，不要纸纹理，不要柔和雾化，不要梦幻质感。  背景以留白为主，保持简洁、轻松、未完成感和设计感，可加入少量辅助性符号、箭头、记号、圈画、重复线、随手写的文字或其他涂鸦元素，以增强速写本或随笔式视觉语言，但不可过于拥挤，不可破坏主体和留白气质。  画面内容不需要预先写清楚，由【一个厉害的AI builder】自动推演并生成最适合的主体形象、动作、相关元素、符号或简化场景，整体保持统一的涂鸦速写风和夸张概括的表现方式，避免复杂写实背景和过度铺陈。 画面中需自然加入专属签名“BlanPlan”，作为画面的一部分，位置低调但清晰，可放在左下角、右下角或标题附近，风格需与整体版式统一，像作品署名或设计落款；签名字体精致、克制、高级，不可过大，不可破坏主体构图，不可显得突兀或廉价。",
      ja: "以涂鸦速写风表现【一个厉害的AI builder】，整体呈现快速勾勒、自由变形、即兴手绘与草稿式的视觉效果。线条随手、夸张、可粗细不一，略显凌乱但具有节奏和表现力，强调概括、夸张、趣味和随性，而不是严谨写实或精细刻画。  颜色采用粗糙、干刷感明显的块面表现，可保留不均匀的涂抹痕迹、刷痕、飞白与覆盖感，色彩根据【主题/主体】自动适配，但整体保持涂鸦式、速写式、概括式的表达。不要透明水彩晕染效果，不要细腻水彩过渡，不要纸纹理，不要柔和雾化，不要梦幻质感。  背景以留白为主，保持简洁、轻松、未完成感和设计感，可加入少量辅助性符号、箭头、记号、圈画、重复线、随手写的文字或其他涂鸦元素，以增强速写本或随笔式视觉语言，但不可过于拥挤，不可破坏主体和留白气质。  画面内容不需要预先写清楚，由【一个厉害的AI builder】自动推演并生成最适合的主体形象、动作、相关元素、符号或简化场景，整体保持统一的涂鸦速写风和夸张概括的表现方式，避免复杂写实背景和过度铺陈。 画面中需自然加入专属签名“BlanPlan”，作为画面的一部分，位置低调但清晰，可放在左下角、右下角或标题附近，风格需与整体版式统一，像作品署名或设计落款；签名字体精致、克制、高级，不可过大，不可破坏主体构图，不可显得突兀或廉价。",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "illustration",
    suggestedSize: "1536x1024",
  },
  {
    id: "poster-character-relationship-map",
    category: "poster",
    title: {
      zh: "人物关系图海报",
      en: "Character Relationship Map Poster",
      ja: "人物関係マップポスター",
    },
    author: "MrLarus",
    sourceUrl: "https://x.com/MrLarus/status/2046263153546174935",
    imagePath: "/generation-prompt-examples/poster-character-relationship-map.jpg",
    prompt: {
      zh: "请根据【主题】生成一张高设计感的人物关系图海报。",
      en: "请根据【主题】生成一张高设计感的人物关系图海报。",
      ja: "请根据【主题】生成一张高设计感的人物关系图海报。",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "poster-new-chinese-ink-landscape",
    category: "poster",
    title: {
      zh: "新中式水墨山水海报",
      en: "New Chinese Ink Landscape Poster",
      ja: "新中式水墨山水ポスター",
    },
    author: "liyue_ai",
    sourceUrl: "https://x.com/liyue_ai/status/2046215276249993720",
    imagePath: "/generation-prompt-examples/poster-new-chinese-ink-landscape.jpg",
    prompt: {
      zh: "新中式水墨山水海报，竖版9:16构图，东方极简美学风格，大面积留白，主题是春岚一叶红。",
      en: "新中式水墨山水海报，竖版9:16构图，东方极简美学风格，大面积留白，主题是春岚一叶红。",
      ja: "新中式水墨山水海报，竖版9:16构图，东方极简美学风格，大面积留白，主题是春岚一叶红。",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "minimal",
    suggestedSize: "1024x1536",
  },
  {
    id: "ui-science-encyclopedia-infographic",
    category: "ui",
    title: {
      zh: "科普百科信息图",
      en: "Science Encyclopedia Infographic",
      ja: "科学百科インフォグラフィック",
    },
    author: "MrLarus",
    sourceUrl: "https://x.com/MrLarus/status/2046231542817497392",
    imagePath: "/generation-prompt-examples/ui-science-encyclopedia-infographic.jpg",
    prompt: {
      zh: "请根据【主题】生成一张高质量竖版「科普百科图」。 \r\n\r\n这张图不是普通海报,也不是单纯插画,而是一张兼具“图鉴感、百科感、信息结构感、收藏感”的模块化科普信息图。整体风格参考高级博物图鉴、现代百科书页、生活方式知识卡和社交媒体高传播信息图的结合。\r\n\r\n请让画面包含:\r\n- 一个清晰漂亮的主题主视觉\r\n- 若干局部特征放大细节\r\n- 多个圆角模块化信息分区\r\n- 清楚的标题层级与重点标签\r\n- 简洁但丰富的百科内容\r\n- 可视化评分、要点总结或Top 5模块\r\n\r\n内容栏目请根据主题自动适配,优先从这些方向中选择并合理组合:\r\n基础档案、分类信息、外观特征、习性/生态、形成机制/结构组成、生长或使用条件、养护或维护建议、风险与注意事项、适合人群或适用场景、优缺点对比、快速评分卡。\r\n\r\n视觉要求:\r\n浅色干净背景,柔和配色,轻阴影,精致小图标,圆角信息框,整洁排版,信息密度高但不拥挤,阅读体验好。整体必须像真正可以发布、阅读、收藏、系列化生产的科普百科卡,而不是广告图。\r\n\r\n请不要做成普通商业宣传海报。要突出“知识整理 + 模块信息 + 图鉴式展示”的特征。",
      en: "请根据【主题】生成一张高质量竖版「科普百科图」。 \r\n\r\n这张图不是普通海报,也不是单纯插画,而是一张兼具“图鉴感、百科感、信息结构感、收藏感”的模块化科普信息图。整体风格参考高级博物图鉴、现代百科书页、生活方式知识卡和社交媒体高传播信息图的结合。\r\n\r\n请让画面包含:\r\n- 一个清晰漂亮的主题主视觉\r\n- 若干局部特征放大细节\r\n- 多个圆角模块化信息分区\r\n- 清楚的标题层级与重点标签\r\n- 简洁但丰富的百科内容\r\n- 可视化评分、要点总结或Top 5模块\r\n\r\n内容栏目请根据主题自动适配,优先从这些方向中选择并合理组合:\r\n基础档案、分类信息、外观特征、习性/生态、形成机制/结构组成、生长或使用条件、养护或维护建议、风险与注意事项、适合人群或适用场景、优缺点对比、快速评分卡。\r\n\r\n视觉要求:\r\n浅色干净背景,柔和配色,轻阴影,精致小图标,圆角信息框,整洁排版,信息密度高但不拥挤,阅读体验好。整体必须像真正可以发布、阅读、收藏、系列化生产的科普百科卡,而不是广告图。\r\n\r\n请不要做成普通商业宣传海报。要突出“知识整理 + 模块信息 + 图鉴式展示”的特征。",
      ja: "请根据【主题】生成一张高质量竖版「科普百科图」。 \r\n\r\n这张图不是普通海报,也不是单纯插画,而是一张兼具“图鉴感、百科感、信息结构感、收藏感”的模块化科普信息图。整体风格参考高级博物图鉴、现代百科书页、生活方式知识卡和社交媒体高传播信息图的结合。\r\n\r\n请让画面包含:\r\n- 一个清晰漂亮的主题主视觉\r\n- 若干局部特征放大细节\r\n- 多个圆角模块化信息分区\r\n- 清楚的标题层级与重点标签\r\n- 简洁但丰富的百科内容\r\n- 可视化评分、要点总结或Top 5模块\r\n\r\n内容栏目请根据主题自动适配,优先从这些方向中选择并合理组合:\r\n基础档案、分类信息、外观特征、习性/生态、形成机制/结构组成、生长或使用条件、养护或维护建议、风险与注意事项、适合人群或适用场景、优缺点对比、快速评分卡。\r\n\r\n视觉要求:\r\n浅色干净背景,柔和配色,轻阴影,精致小图标,圆角信息框,整洁排版,信息密度高但不拥挤,阅读体验好。整体必须像真正可以发布、阅读、收藏、系列化生产的科普百科卡,而不是广告图。\r\n\r\n请不要做成普通商业宣传海报。要突出“知识整理 + 模块信息 + 图鉴式展示”的特征。",
    },
    suggestedTemplateKey: "social_visual",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "product-refreshing-summer-udon-ad",
    category: "product",
    title: {
      zh: "清爽夏日乌冬广告",
      en: "Refreshing Summer Udon Ad",
      ja: "爽やか夏うどん広告",
    },
    author: "genel_ai",
    sourceUrl: "https://x.com/genel_ai/status/2046501692246470871",
    imagePath: "/generation-prompt-examples/product-refreshing-summer-udon-ad.jpg",
    prompt: {
      zh: "少し暑くなってきた今の時期に、さわやかにさっぱりしたい、みずみずしさ、みたいなところをもっと強く感じたい。冷たいうどんやナス、つゆを口に含んだ時の爽快感、みたいなものをもっと感じるように",
      en: "少し暑くなってきた今の時期に、さわやかにさっぱりしたい、みずみずしさ、みたいなところをもっと強く感じたい。冷たいうどんやナス、つゆを口に含んだ時の爽快感、みたいなものをもっと感じるように",
      ja: "少し暑くなってきた今の時期に、さわやかにさっぱりしたい、みずみずしさ、みたいなところをもっと強く感じたい。冷たいうどんやナス、つゆを口に含んだ時の爽快感、みたいなものをもっと感じるように",
    },
    suggestedTemplateKey: "product_scene",
    suggestedStyle: "realistic",
    suggestedSize: "1024x1536",
  },
  {
    id: "product-sony-a7-exploded-view",
    category: "product",
    title: {
      zh: "Sony A7 爆炸结构图",
      en: "Sony A7 Exploded View Breakdown",
      ja: "Sony A7 分解構造図",
    },
    author: "iaPulse_",
    sourceUrl: "https://x.com/iaPulse_/status/2046903739429097660",
    imagePath: "/generation-prompt-examples/product-sony-a7-exploded-view.jpg",
    prompt: {
      zh: "Descomposición detallada de una cámara de la marca Sony modelo A7 indicando todas sus piezas y con sus nombres.",
      en: "Descomposición detallada de una cámara de la marca Sony modelo A7 indicando todas sus piezas y con sus nombres.",
      ja: "Descomposición detallada de una cámara de la marca Sony modelo A7 indicando todas sus piezas y con sus nombres.",
    },
    suggestedTemplateKey: "product_scene",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "ui-song-dynasty-social-feed",
    category: "ui",
    title: {
      zh: "宋朝朋友圈信息流",
      en: "Song Dynasty Social Media Feed",
      ja: "宋代ソーシャルフィード",
    },
    author: "Panda20230902",
    sourceUrl: "https://x.com/Panda20230902/status/2045385588065313057",
    imagePath: "/generation-prompt-examples/ui-song-dynasty-social-feed.jpg",
    prompt: {
      zh: "\"宋朝人的朋友圈\"/\"SONG DYNASTY SOCIAL MEDIA FEED\"，古今穿越幽默融合界面设计风格，画面模拟手机社交媒体界面，但内容全部是宋朝场景头像是宋代文人画像，用户名\"苏东坡SuShi_Official\"，发布内容\"刚到黄州，被贬了但心情还行。今天自己做了东坡肉，味道绝了，附菜谱：\"，配图为工笔画风格的东坡肉特写，点赞列表\"黄庭坚、秦观、佛印等126人\"，评论区\"王安石：呵呵\"\"司马光：还是那个味道\"，界面元素如点赞图标用宋代花纹替代，状态栏显示\"大宋移动 5G\"和\"元丰三年\"，配色为手机深色模式搭配宋代雅致色调，历史与社交媒体的趣味碰撞杰作",
      en: "\"宋朝人的朋友圈\"/\"SONG DYNASTY SOCIAL MEDIA FEED\"，古今穿越幽默融合界面设计风格，画面模拟手机社交媒体界面，但内容全部是宋朝场景头像是宋代文人画像，用户名\"苏东坡SuShi_Official\"，发布内容\"刚到黄州，被贬了但心情还行。今天自己做了东坡肉，味道绝了，附菜谱：\"，配图为工笔画风格的东坡肉特写，点赞列表\"黄庭坚、秦观、佛印等126人\"，评论区\"王安石：呵呵\"\"司马光：还是那个味道\"，界面元素如点赞图标用宋代花纹替代，状态栏显示\"大宋移动 5G\"和\"元丰三年\"，配色为手机深色模式搭配宋代雅致色调，历史与社交媒体的趣味碰撞杰作",
      ja: "\"宋朝人的朋友圈\"/\"SONG DYNASTY SOCIAL MEDIA FEED\"，古今穿越幽默融合界面设计风格，画面模拟手机社交媒体界面，但内容全部是宋朝场景头像是宋代文人画像，用户名\"苏东坡SuShi_Official\"，发布内容\"刚到黄州，被贬了但心情还行。今天自己做了东坡肉，味道绝了，附菜谱：\"，配图为工笔画风格的东坡肉特写，点赞列表\"黄庭坚、秦观、佛印等126人\"，评论区\"王安石：呵呵\"\"司马光：还是那个味道\"，界面元素如点赞图标用宋代花纹替代，状态栏显示\"大宋移动 5G\"和\"元丰三年\"，配色为手机深色模式搭配宋代雅致色调，历史与社交媒体的趣味碰撞杰作",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "illustration",
    suggestedSize: "1024x1536",
  },
  {
    id: "experimental-polaroid-frame-breakout",
    category: "experimental",
    title: {
      zh: "拍立得出框场景",
      en: "Polaroid Frame Breakout Scene",
      ja: "ポラロイド飛び出しシーン",
    },
    author: "MajaDesignJP",
    sourceUrl: "https://x.com/MajaDesignJP/status/2047235632934928765",
    imagePath: "/generation-prompt-examples/experimental-polaroid-frame-breakout.jpg",
    prompt: {
      zh: "ポラロイド写真の中に人が写っていて、その人がフレームから外に飛び出している画像。日本語が書いてある画像生成して\r\n\r\n←下の画像\r\nGPT Image-2で生成したやつ→",
      en: "ポラロイド写真の中に人が写っていて、その人がフレームから外に飛び出している画像。日本語が書いてある画像生成して\r\n\r\n←下の画像\r\nGPT Image-2で生成したやつ→",
      ja: "ポラロイド写真の中に人が写っていて、その人がフレームから外に飛び出している画像。日本語が書いてある画像生成して\r\n\r\n←下の画像\r\nGPT Image-2で生成したやつ→",
    },
    suggestedTemplateKey: "custom_creation",
    suggestedStyle: "cinematic",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-restored-vintage-family-snapshot",
    category: "photography",
    title: {
      zh: "复古家庭照片修复",
      en: "Restored Vintage Family Snapshot",
      ja: "修復されたヴィンテージ家族写真",
    },
    author: "gdb",
    sourceUrl: "https://x.com/gdb/status/2048184797374325031",
    imagePath: "/generation-prompt-examples/photo-restored-vintage-family-snapshot.jpg",
    prompt: {
      zh: "A restored vintage family snapshot, photographed indoors in soft natural light, showing a young mother seated and holding a toddler on her lap in a close, centered waist-up portrait. The adult has short softly curled auburn hair in a voluminous 1960s-inspired bob, wears a sleeveless black dress and a thin gold necklace, and wraps both arms protectively around the child. The child has fine light blond hair and wears a plain white long-sleeve outfit. Compose the image with a warm nostalgic color cast, gentle film softness, subtle grain, and the look of a carefully repaired old printed photograph. Place them in front of a cream-colored curtain patterned with small brown teddy bear motifs, with a softly blurred interior window frame visible along the top background. Preserve realistic skin tones, natural posture, and the intimate family-photo feeling, as if an old damaged photograph has been professionally reimagined and restored. Square crop, centered composition, shallow depth of field, authentic analog photo texture, no modern styling, no text.",
      en: "A restored vintage family snapshot, photographed indoors in soft natural light, showing a young mother seated and holding a toddler on her lap in a close, centered waist-up portrait. The adult has short softly curled auburn hair in a voluminous 1960s-inspired bob, wears a sleeveless black dress and a thin gold necklace, and wraps both arms protectively around the child. The child has fine light blond hair and wears a plain white long-sleeve outfit. Compose the image with a warm nostalgic color cast, gentle film softness, subtle grain, and the look of a carefully repaired old printed photograph. Place them in front of a cream-colored curtain patterned with small brown teddy bear motifs, with a softly blurred interior window frame visible along the top background. Preserve realistic skin tones, natural posture, and the intimate family-photo feeling, as if an old damaged photograph has been professionally reimagined and restored. Square crop, centered composition, shallow depth of field, authentic analog photo texture, no modern styling, no text.",
      ja: "A restored vintage family snapshot, photographed indoors in soft natural light, showing a young mother seated and holding a toddler on her lap in a close, centered waist-up portrait. The adult has short softly curled auburn hair in a voluminous 1960s-inspired bob, wears a sleeveless black dress and a thin gold necklace, and wraps both arms protectively around the child. The child has fine light blond hair and wears a plain white long-sleeve outfit. Compose the image with a warm nostalgic color cast, gentle film softness, subtle grain, and the look of a carefully repaired old printed photograph. Place them in front of a cream-colored curtain patterned with small brown teddy bear motifs, with a softly blurred interior window frame visible along the top background. Preserve realistic skin tones, natural posture, and the intimate family-photo feeling, as if an old damaged photograph has been professionally reimagined and restored. Square crop, centered composition, shallow depth of field, authentic analog photo texture, no modern styling, no text.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "realistic",
    suggestedSize: "1024x1024",
  },
  {
    id: "photo-rainy-bus-stop-portrait",
    category: "photography",
    title: {
      zh: "雨夜公交站街拍人像",
      en: "Rainy Bus Stop Portrait",
      ja: "雨のバス停ポートレート",
    },
    author: "harboriis",
    sourceUrl: "https://x.com/harboriis/status/2049081194156020046",
    imagePath: "/generation-prompt-examples/photo-rainy-bus-stop-portrait.jpg",
    prompt: {
      zh: "A cinematic nighttime photo of [your photo as reference] sitting alone at a wet bus stop bench, eating a burger. Rain-soaked street with orange bokeh city lights reflecting on the ground. Neon tube lights overhead. Red jacket, tan corduroy pants. Moody, dark, atmospheric street photography.",
      en: "A cinematic nighttime photo of [your photo as reference] sitting alone at a wet bus stop bench, eating a burger. Rain-soaked street with orange bokeh city lights reflecting on the ground. Neon tube lights overhead. Red jacket, tan corduroy pants. Moody, dark, atmospheric street photography.",
      ja: "A cinematic nighttime photo of [your photo as reference] sitting alone at a wet bus stop bench, eating a burger. Rain-soaked street with orange bokeh city lights reflecting on the ground. Neon tube lights overhead. Red jacket, tan corduroy pants. Moody, dark, atmospheric street photography.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "cinematic",
    suggestedSize: "1536x1024",
  },
  {
    id: "photo-black-red-streetwear-campaign",
    category: "photography",
    title: {
      zh: "黑红街头服饰广告人像",
      en: "Black-and-Red Streetwear Campaign Portrait",
      ja: "黒赤ストリートウェア広告ポートレート",
    },
    author: "harboriis",
    sourceUrl: "https://x.com/harboriis/status/2049450257604550872",
    imagePath: "/generation-prompt-examples/photo-black-red-streetwear-campaign.jpg",
    prompt: {
      zh: "Create a bold, high-contrast black and white portrait of a confident young man wearing a black leather jacket, facing slightly sideways with an intense expression. Use dramatic studio lighting with sharp shadows and detailed skin texture. Add strong red graphic elements over the image, including a horizontal red bar across the eyes, geometric shapes, thin lines, and framing boxes. Incorporate large bold typography, repeated faded text, and a motivational headline in bright red. The design should feel like a premium sports or streetwear campaign poster with a minimal textured grey background and black/white/grey/red palette only.",
      en: "Create a bold, high-contrast black and white portrait of a confident young man wearing a black leather jacket, facing slightly sideways with an intense expression. Use dramatic studio lighting with sharp shadows and detailed skin texture. Add strong red graphic elements over the image, including a horizontal red bar across the eyes, geometric shapes, thin lines, and framing boxes. Incorporate large bold typography, repeated faded text, and a motivational headline in bright red. The design should feel like a premium sports or streetwear campaign poster with a minimal textured grey background and black/white/grey/red palette only.",
      ja: "Create a bold, high-contrast black and white portrait of a confident young man wearing a black leather jacket, facing slightly sideways with an intense expression. Use dramatic studio lighting with sharp shadows and detailed skin texture. Add strong red graphic elements over the image, including a horizontal red bar across the eyes, geometric shapes, thin lines, and framing boxes. Incorporate large bold typography, repeated faded text, and a motivational headline in bright red. The design should feel like a premium sports or streetwear campaign poster with a minimal textured grey background and black/white/grey/red palette only.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-cyberpunk-fashion-portrait",
    category: "photography",
    title: {
      zh: "赛博朋克时装人像",
      en: "Cyberpunk Fashion Portrait",
      ja: "サイバーパンクファッションポートレート",
    },
    author: "ChillaiKalan__",
    sourceUrl: "https://x.com/ChillaiKalan__/status/2050453739430195320",
    imagePath: "/generation-prompt-examples/photo-cyberpunk-fashion-portrait.jpg",
    prompt: {
      zh: "Futuristic portrait of a young woman facing camera, wearing a transparent neon jacket with glowing green and orange edges, large illuminated logo on chest, black inner outfit, sleek sunglasses, soft smoke light trails behind, dark teal background, cyberpunk fashion campaign, ultra-realistic textures, cinematic lighting, sharp focus, luxury sportswear branding style, 8k. Style keywords: neon edges, glowing logo, fashion campaign, high-end branding, moody lighting.",
      en: "Futuristic portrait of a young woman facing camera, wearing a transparent neon jacket with glowing green and orange edges, large illuminated logo on chest, black inner outfit, sleek sunglasses, soft smoke light trails behind, dark teal background, cyberpunk fashion campaign, ultra-realistic textures, cinematic lighting, sharp focus, luxury sportswear branding style, 8k. Style keywords: neon edges, glowing logo, fashion campaign, high-end branding, moody lighting.",
      ja: "Futuristic portrait of a young woman facing camera, wearing a transparent neon jacket with glowing green and orange edges, large illuminated logo on chest, black inner outfit, sleek sunglasses, soft smoke light trails behind, dark teal background, cyberpunk fashion campaign, ultra-realistic textures, cinematic lighting, sharp focus, luxury sportswear branding style, 8k. Style keywords: neon edges, glowing logo, fashion campaign, high-end branding, moody lighting.",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "cinematic",
    suggestedSize: "1536x1024",
  },
  {
    id: "photo-paris-cafe-lifestyle-portrait",
    category: "photography",
    title: {
      zh: "巴黎咖啡馆生活方式人像",
      en: "Paris Cafe Lifestyle Portrait",
      ja: "パリのカフェライフスタイルポートレート",
    },
    author: "Sairah_0",
    sourceUrl: "https://x.com/Sairah_0/status/2050432730962530809",
    imagePath: "/generation-prompt-examples/photo-paris-cafe-lifestyle-portrait.jpg",
    prompt: {
      zh: "Ultra-realistic portrait of a young woman sitting at a Parisian cafe, soft golden hour sunlight hitting her face, natural glowing skin, light blush, minimal makeup, green eyes, dark hair tied back with sunglasses on head, wearing a cozy grey knit sweater, resting her face on her hand, relaxed expression, shallow depth of field, cinematic lighting, reflections of classic Paris buildings in the window behind her, table with glassware and subtle foreground blur, 50mm lens, high detail, editorial fashion photography style. Natural lifestyle portrait at an outdoor Paris cafe, soft daylight, calm and intimate expression, realistic tones, 35mm photography, high resolution, cinematic street-style fashion shoot.",
      en: "Ultra-realistic portrait of a young woman sitting at a Parisian cafe, soft golden hour sunlight hitting her face, natural glowing skin, light blush, minimal makeup, green eyes, dark hair tied back with sunglasses on head, wearing a cozy grey knit sweater, resting her face on her hand, relaxed expression, shallow depth of field, cinematic lighting, reflections of classic Paris buildings in the window behind her, table with glassware and subtle foreground blur, 50mm lens, high detail, editorial fashion photography style. Natural lifestyle portrait at an outdoor Paris cafe, soft daylight, calm and intimate expression, realistic tones, 35mm photography, high resolution, cinematic street-style fashion shoot.",
      ja: "Ultra-realistic portrait of a young woman sitting at a Parisian cafe, soft golden hour sunlight hitting her face, natural glowing skin, light blush, minimal makeup, green eyes, dark hair tied back with sunglasses on head, wearing a cozy grey knit sweater, resting her face on her hand, relaxed expression, shallow depth of field, cinematic lighting, reflections of classic Paris buildings in the window behind her, table with glassware and subtle foreground blur, 50mm lens, high detail, editorial fashion photography style. Natural lifestyle portrait at an outdoor Paris cafe, soft daylight, calm and intimate expression, realistic tones, 35mm photography, high resolution, cinematic street-style fashion shoot.",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "realistic",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-editorial-portrait-grid",
    category: "photography",
    title: {
      zh: "2x2 编辑人像组图",
      en: "2x2 Editorial Portrait Grid",
      ja: "2x2 エディトリアルポートレートグリッド",
    },
    author: "Taaruk_",
    sourceUrl: "https://x.com/Taaruk_/status/2050429694890389779",
    imagePath: "/generation-prompt-examples/photo-editorial-portrait-grid.jpg",
    prompt: {
      zh: "Editorial portrait photography arranged in a 2x2 grid layout featuring the same man with round tortoiseshell glasses, natural look, light beard, soft neutral background. Top-left: front-facing portrait with direct eye contact, calm expression. Top-right: extreme macro close-up of eye behind glasses, ultra-detailed iris and skin texture. Bottom-left: slightly lower angle portrait, subtle expression, soft shadows. Bottom-right: side profile portrait, natural pose, looking away. Soft diffused natural lighting, warm neutral tones, shallow depth of field, ultra-realistic skin texture with visible pores and freckles, minimal retouching, 85mm lens, high-end editorial photography style, clean composition, 4K.",
      en: "Editorial portrait photography arranged in a 2x2 grid layout featuring the same man with round tortoiseshell glasses, natural look, light beard, soft neutral background. Top-left: front-facing portrait with direct eye contact, calm expression. Top-right: extreme macro close-up of eye behind glasses, ultra-detailed iris and skin texture. Bottom-left: slightly lower angle portrait, subtle expression, soft shadows. Bottom-right: side profile portrait, natural pose, looking away. Soft diffused natural lighting, warm neutral tones, shallow depth of field, ultra-realistic skin texture with visible pores and freckles, minimal retouching, 85mm lens, high-end editorial photography style, clean composition, 4K.",
      ja: "Editorial portrait photography arranged in a 2x2 grid layout featuring the same man with round tortoiseshell glasses, natural look, light beard, soft neutral background. Top-left: front-facing portrait with direct eye contact, calm expression. Top-right: extreme macro close-up of eye behind glasses, ultra-detailed iris and skin texture. Bottom-left: slightly lower angle portrait, subtle expression, soft shadows. Bottom-right: side profile portrait, natural pose, looking away. Soft diffused natural lighting, warm neutral tones, shallow depth of field, ultra-realistic skin texture with visible pores and freckles, minimal retouching, 85mm lens, high-end editorial photography style, clean composition, 4K.",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1024",
  },
  {
    id: "photo-luxury-golf-editorial-collage",
    category: "photography",
    title: {
      zh: "高尔夫奢华编辑摄影拼贴",
      en: "Luxury Golf Editorial Collage",
      ja: "ラグジュアリーゴルフ編集写真コラージュ",
    },
    author: "AIwithkhan",
    sourceUrl: "https://x.com/AIwithkhan/status/2051275667354890345",
    imagePath: "/generation-prompt-examples/photo-luxury-golf-editorial-collage.jpg",
    prompt: {
      zh: "Three-image luxury golf editorial collage featuring a professional female golfer on a pristine putting green, soft natural daylight, minimalistic and high-end sports photography style, ultra-realistic, cinematic color grading, clean composition, no text, no logos. Layout: asymmetrical grid with one large frame and two smaller frames. Frame 1: full-body low-angle shot of the golfer crouching and lining up a putt, golf ball in foreground near the hole, strong leading lines on the green, balanced composition, calm and focused posture, expansive sky background. Frame 2: extreme close-up of her face and hands gripping the putter, intense concentration, visible skin texture and slight sweat glow, shallow depth of field, blurred background. Frame 3: side angle of golfer completing the putt, smooth follow-through, golf ball rolling across the green, natural motion feel, soft shadows, realistic lighting. Style keywords: luxury sports campaign, editorial photography, muted green tones, sharp focus, 85mm lens look, depth of field, cinematic lighting, premium composition, 4K, hyper-realistic.",
      en: "Three-image luxury golf editorial collage featuring a professional female golfer on a pristine putting green, soft natural daylight, minimalistic and high-end sports photography style, ultra-realistic, cinematic color grading, clean composition, no text, no logos. Layout: asymmetrical grid with one large frame and two smaller frames. Frame 1: full-body low-angle shot of the golfer crouching and lining up a putt, golf ball in foreground near the hole, strong leading lines on the green, balanced composition, calm and focused posture, expansive sky background. Frame 2: extreme close-up of her face and hands gripping the putter, intense concentration, visible skin texture and slight sweat glow, shallow depth of field, blurred background. Frame 3: side angle of golfer completing the putt, smooth follow-through, golf ball rolling across the green, natural motion feel, soft shadows, realistic lighting. Style keywords: luxury sports campaign, editorial photography, muted green tones, sharp focus, 85mm lens look, depth of field, cinematic lighting, premium composition, 4K, hyper-realistic.",
      ja: "Three-image luxury golf editorial collage featuring a professional female golfer on a pristine putting green, soft natural daylight, minimalistic and high-end sports photography style, ultra-realistic, cinematic color grading, clean composition, no text, no logos. Layout: asymmetrical grid with one large frame and two smaller frames. Frame 1: full-body low-angle shot of the golfer crouching and lining up a putt, golf ball in foreground near the hole, strong leading lines on the green, balanced composition, calm and focused posture, expansive sky background. Frame 2: extreme close-up of her face and hands gripping the putter, intense concentration, visible skin texture and slight sweat glow, shallow depth of field, blurred background. Frame 3: side angle of golfer completing the putt, smooth follow-through, golf ball rolling across the green, natural motion feel, soft shadows, realistic lighting. Style keywords: luxury sports campaign, editorial photography, muted green tones, sharp focus, 85mm lens look, depth of field, cinematic lighting, premium composition, 4K, hyper-realistic.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "editorial",
    suggestedSize: "1536x1024",
  },
  {
    id: "photo-selective-color-editorial-portrait",
    category: "photography",
    title: {
      zh: "选择性色彩编辑人像",
      en: "Selective-Color Editorial Portrait",
      ja: "セレクティブカラーポートレート",
    },
    author: "SPEEDAI07",
    sourceUrl: "https://x.com/SPEEDAI07/status/2051262381733618119",
    imagePath: "/generation-prompt-examples/photo-selective-color-editorial-portrait.jpg",
    prompt: {
      zh: "A studio-style close-up editorial portrait of a person with strong, well-defined facial features and slightly imperfect, natural skin texture. The subject wears a black tailored turtleneck with sharp, clean lines, layered under a high-collared black jacket in a minimalist contemporary fashion style. The subject wears semi-transparent orange acetate sunglasses, rectangular frames with softly rounded edges, glossy finish, and amber gradient lenses, serving as the only colored element in the image. Color concept: selective color photography, monochrome black-and-white image with only the sunglasses in vivid orange. Mood is calm and confident, serious expression, direct gaze into the camera. Lighting is soft frontal studio light with gentle shadows, even skin tones, cinematic contrast, and visible natural skin texture. Shot on a professional portrait camera, f/2.0, ISO 100, 1/125s. High resolution, ultra-sharp focus on the face.",
      en: "A studio-style close-up editorial portrait of a person with strong, well-defined facial features and slightly imperfect, natural skin texture. The subject wears a black tailored turtleneck with sharp, clean lines, layered under a high-collared black jacket in a minimalist contemporary fashion style. The subject wears semi-transparent orange acetate sunglasses, rectangular frames with softly rounded edges, glossy finish, and amber gradient lenses, serving as the only colored element in the image. Color concept: selective color photography, monochrome black-and-white image with only the sunglasses in vivid orange. Mood is calm and confident, serious expression, direct gaze into the camera. Lighting is soft frontal studio light with gentle shadows, even skin tones, cinematic contrast, and visible natural skin texture. Shot on a professional portrait camera, f/2.0, ISO 100, 1/125s. High resolution, ultra-sharp focus on the face.",
      ja: "A studio-style close-up editorial portrait of a person with strong, well-defined facial features and slightly imperfect, natural skin texture. The subject wears a black tailored turtleneck with sharp, clean lines, layered under a high-collared black jacket in a minimalist contemporary fashion style. The subject wears semi-transparent orange acetate sunglasses, rectangular frames with softly rounded edges, glossy finish, and amber gradient lenses, serving as the only colored element in the image. Color concept: selective color photography, monochrome black-and-white image with only the sunglasses in vivid orange. Mood is calm and confident, serious expression, direct gaze into the camera. Lighting is soft frontal studio light with gentle shadows, even skin tones, cinematic contrast, and visible natural skin texture. Shot on a professional portrait camera, f/2.0, ISO 100, 1/125s. High resolution, ultra-sharp focus on the face.",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "editorial",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-monochrome-glitch-profile",
    category: "photography",
    title: {
      zh: "黑白故障侧脸人像",
      en: "Monochrome Glitch Profile Portrait",
      ja: "モノクロームグリッチ横顔ポートレート",
    },
    author: "Goodmanprotocol",
    sourceUrl: "https://x.com/Goodmanprotocol/status/2049733639651385759",
    imagePath: "/generation-prompt-examples/photo-monochrome-glitch-profile.jpg",
    prompt: {
      zh: "Subject: A sharp, high-contrast side-profile portrait of a handsome man with a defined jawline, short stubble, and voluminous, textured dark hair styled upwards. Style and composition: a fusion of realistic photography and abstract digital glitch art. The subject is rendered in stark black and white, set against a clean, minimalist white background. Color palette: strictly monochromatic with deep blacks and bright whites, plus aggressive, vibrant splashes of crimson red. Graphic elements: the back of the head and the lower torso dissolve into abstract geometric shards, pixel sorting, and glitchy red brushstrokes. Texture: gritty, ink-wash textures and distressed digital overlays that suggest a modern noir or cyberpunk editorial feel. Lighting: intense side-lighting, chiaroscuro, creating deep shadows on the face to highlight bone structure. Details: hyper-realistic skin texture, individual hair strands visible, high-grain film aesthetic. Framing: vertical aspect ratio, close-up profile shot, 9:16.",
      en: "Subject: A sharp, high-contrast side-profile portrait of a handsome man with a defined jawline, short stubble, and voluminous, textured dark hair styled upwards. Style and composition: a fusion of realistic photography and abstract digital glitch art. The subject is rendered in stark black and white, set against a clean, minimalist white background. Color palette: strictly monochromatic with deep blacks and bright whites, plus aggressive, vibrant splashes of crimson red. Graphic elements: the back of the head and the lower torso dissolve into abstract geometric shards, pixel sorting, and glitchy red brushstrokes. Texture: gritty, ink-wash textures and distressed digital overlays that suggest a modern noir or cyberpunk editorial feel. Lighting: intense side-lighting, chiaroscuro, creating deep shadows on the face to highlight bone structure. Details: hyper-realistic skin texture, individual hair strands visible, high-grain film aesthetic. Framing: vertical aspect ratio, close-up profile shot, 9:16.",
      ja: "Subject: A sharp, high-contrast side-profile portrait of a handsome man with a defined jawline, short stubble, and voluminous, textured dark hair styled upwards. Style and composition: a fusion of realistic photography and abstract digital glitch art. The subject is rendered in stark black and white, set against a clean, minimalist white background. Color palette: strictly monochromatic with deep blacks and bright whites, plus aggressive, vibrant splashes of crimson red. Graphic elements: the back of the head and the lower torso dissolve into abstract geometric shards, pixel sorting, and glitchy red brushstrokes. Texture: gritty, ink-wash textures and distressed digital overlays that suggest a modern noir or cyberpunk editorial feel. Lighting: intense side-lighting, chiaroscuro, creating deep shadows on the face to highlight bone structure. Details: hyper-realistic skin texture, individual hair strands visible, high-grain film aesthetic. Framing: vertical aspect ratio, close-up profile shot, 9:16.",
    },
    suggestedTemplateKey: "portrait_avatar",
    suggestedStyle: "cinematic",
    suggestedSize: "1024x1536",
  },
  {
    id: "photo-golden-hour-street-profile",
    category: "photography",
    title: {
      zh: "金色时刻街头侧脸人像",
      en: "Golden Hour Street Side-Profile Portrait",
      ja: "ゴールデンアワー街角横顔ポートレート",
    },
    author: "Professor_134",
    sourceUrl: "https://x.com/Professor_134/status/2049701241287311561",
    imagePath: "/generation-prompt-examples/photo-golden-hour-street-profile.jpg",
    prompt: {
      zh: "Cinematic golden hour street portrait of a young woman in side profile, walking through a busy city crowd, soft wind blowing through her long light-brown hair, individual strands glowing in backlight, warm sunlight flaring through her hair creating a natural halo effect, dreamy atmosphere, shallow depth of field, strong subject separation, background filled with softly blurred pedestrians and urban motion bokeh. She has delicate facial features, natural skin texture, subtle makeup, calm introspective expression, slightly parted lips, looking off-frame. Wearing a minimal outfit in dark neutral tones, possibly a light jacket, modern casual style. Lighting is rich golden hour sunlight, strong backlighting with lens flare, cinematic highlights, warm orange and amber tones, high dynamic range, soft shadows, volumetric light rays passing through hair and environment. Shot on a telephoto lens with an 85mm-135mm look, f/1.8 aperture, ultra-realistic, high detail, film still quality, natural color grading, slight film grain, soft bloom, editorial photography style. Composition: rule of thirds, subject slightly off-center, crowd motion blur behind her, dynamic yet intimate framing. Mood: nostalgic, dreamy, romantic, fleeting moment, poetic realism.",
      en: "Cinematic golden hour street portrait of a young woman in side profile, walking through a busy city crowd, soft wind blowing through her long light-brown hair, individual strands glowing in backlight, warm sunlight flaring through her hair creating a natural halo effect, dreamy atmosphere, shallow depth of field, strong subject separation, background filled with softly blurred pedestrians and urban motion bokeh. She has delicate facial features, natural skin texture, subtle makeup, calm introspective expression, slightly parted lips, looking off-frame. Wearing a minimal outfit in dark neutral tones, possibly a light jacket, modern casual style. Lighting is rich golden hour sunlight, strong backlighting with lens flare, cinematic highlights, warm orange and amber tones, high dynamic range, soft shadows, volumetric light rays passing through hair and environment. Shot on a telephoto lens with an 85mm-135mm look, f/1.8 aperture, ultra-realistic, high detail, film still quality, natural color grading, slight film grain, soft bloom, editorial photography style. Composition: rule of thirds, subject slightly off-center, crowd motion blur behind her, dynamic yet intimate framing. Mood: nostalgic, dreamy, romantic, fleeting moment, poetic realism.",
      ja: "Cinematic golden hour street portrait of a young woman in side profile, walking through a busy city crowd, soft wind blowing through her long light-brown hair, individual strands glowing in backlight, warm sunlight flaring through her hair creating a natural halo effect, dreamy atmosphere, shallow depth of field, strong subject separation, background filled with softly blurred pedestrians and urban motion bokeh. She has delicate facial features, natural skin texture, subtle makeup, calm introspective expression, slightly parted lips, looking off-frame. Wearing a minimal outfit in dark neutral tones, possibly a light jacket, modern casual style. Lighting is rich golden hour sunlight, strong backlighting with lens flare, cinematic highlights, warm orange and amber tones, high dynamic range, soft shadows, volumetric light rays passing through hair and environment. Shot on a telephoto lens with an 85mm-135mm look, f/1.8 aperture, ultra-realistic, high detail, film still quality, natural color grading, slight film grain, soft bloom, editorial photography style. Composition: rule of thirds, subject slightly off-center, crowd motion blur behind her, dynamic yet intimate framing. Mood: nostalgic, dreamy, romantic, fleeting moment, poetic realism.",
    },
    suggestedTemplateKey: "photo_inspiration",
    suggestedStyle: "cinematic",
    suggestedSize: "1024x1536",
  },
] as const satisfies readonly GenerationPromptExample[];
