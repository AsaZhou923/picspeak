import type { GenerationQuality, GenerationSize } from '@/lib/types';

export type GenerationCreditsTable = Partial<Record<GenerationQuality, Partial<Record<GenerationSize, number>>>>;

export const GENERATION_TEMPLATES = [
  {
    key: 'custom_creation',
    label: '自定义创作',
    labelEn: 'Custom creation',
    intent: 'custom_creation',
    prompt: '',
    description: '从空白 prompt 开始，自由描述你想要的画面。',
  },
  {
    key: 'photo_inspiration',
    label: '摄影灵感',
    labelEn: 'Photo inspiration',
    intent: 'photo_inspiration',
    prompt: '真实摄影质感的清晨街头照片，35mm 镜头视角，柔和侧光从画面左侧进入，主体位于三分线附近，前景有轻微虚化的街边元素，背景干净但保留生活气息，色彩自然克制，适合学习复拍的构图方向，画面无文字',
    description: '镜头语言、光线和构图最贴近 PicSpeak 的摄影训练。',
  },
  {
    key: 'social_visual',
    label: '社媒配图',
    labelEn: 'Social visual',
    intent: 'social_visual',
    prompt: '电影感雨夜街头人像封面，霓虹灯在湿润路面形成反光，人物半身构图，浅景深，背景有层次但不杂乱，画面上方或侧边留出干净负空间用于后期排版，但图片内不出现任何文字、logo 或水印',
    description: '适合封面、海报和生活方式内容的视觉草图。',
  },
  {
    key: 'portrait_avatar',
    label: '人像头像',
    labelEn: 'Portrait avatar',
    intent: 'portrait_avatar',
    prompt: '自然光专业头像参考，虚构人物，温和自信的表情，肩部以上构图，眼神清晰，肤色自然不过度磨皮，背景干净并有轻微空间层次，柔和窗光塑造脸部轮廓，真实摄影质感，不生成真人相似身份',
    description: '偏职业头像和角色头像，避免真人身份相似度承诺。',
  },
  {
    key: 'product_scene',
    label: '产品场景',
    labelEn: 'Product scene',
    intent: 'product_scene',
    prompt: '咖啡杯产品生活方式场景，木质桌面与亚麻布材质，清晨侧逆光形成柔和阴影，产品是画面第一视觉中心，旁边有少量不过度抢戏的道具，背景保持温暖生活感，商业摄影构图，画面无品牌标志、文字或水印',
    description: '给商品陈列、小店内容和创作者做场景参考。',
  },
  {
    key: 'interior_atmosphere',
    label: '空间氛围',
    labelEn: 'Interior atmosphere',
    intent: 'interior_atmosphere',
    prompt: '有生活气息的室内空间摄影参考，窗边自然光进入房间，木质家具、织物、植物和少量个人物件形成层次，空间线条整洁，前景和远景有纵深，适合咖啡馆、民宿或工作室视觉方向，真实摄影质感，画面无文字',
    description: '适合室内空间、店铺陈列、民宿和工作室的氛围参考。',
  },
  {
    key: 'color_moodboard',
    label: '色彩 moodboard',
    labelEn: 'Color moodboard',
    intent: 'color_moodboard',
    prompt: '温暖金色与深绿色的摄影色彩 moodboard，包含木材、织物、植物叶片、金属微光和自然纹理样本，整体排布像摄影参考板而不是 UI，光线柔和统一，色彩比例清晰，有可执行的材质和氛围方向，画面无文字标签',
    description: '把抽象氛围变成可执行的色彩和材质方向。',
  },
] as const;

export const GENERATION_SIZE_OPTIONS = [
  { value: '1024x1024', label: '1:1', detail: 'Square' },
  { value: '1024x1536', label: '2:3 / 9:16', detail: 'Portrait' },
  { value: '1536x1024', label: '3:2 / 16:9', detail: 'Landscape' },
] as const satisfies ReadonlyArray<{ value: GenerationSize; label: string; detail: string }>;

export const GENERATION_QUALITY_OPTIONS = [
  { value: 'low', label: 'Low', detail: '1K output' },
  { value: 'medium', label: 'Medium', detail: '2K output' },
  { value: 'high', label: 'High', detail: '4K portrait/landscape output' },
] as const satisfies ReadonlyArray<{ value: GenerationQuality; label: string; detail: string }>;

const GENERATION_OUTPUT_SPECS = {
  low: {
    '1024x1024': '1:1 - 1K',
    '1024x1536': '9:16 - 1K',
    '1536x1024': '16:9 - 1K',
  },
  medium: {
    '1024x1024': '1:1 - 2K - 2048 x 2048',
    '1024x1536': '9:16 - 2K - 1152 x 2048',
    '1536x1024': '16:9 - 2K - 2048 x 1152',
  },
  high: {
    '1024x1024': '1:1 - 2K - 2048 x 2048',
    '1024x1536': '9:16 - 4K - 2160 x 3840',
    '1536x1024': '16:9 - 4K - 3840 x 2160',
  },
} as const satisfies Record<GenerationQuality, Record<GenerationSize, string>>;

export function formatGenerationOutputSpec(quality: GenerationQuality, size: GenerationSize): string {
  return GENERATION_OUTPUT_SPECS[quality]?.[size] ?? size;
}

export function estimateGenerationCredits(
  creditsTable: GenerationCreditsTable | null | undefined,
  quality: GenerationQuality,
  size: GenerationSize,
  referenceImageCount = 0
): number {
  const baseCredits = creditsTable?.[quality]?.[size];
  if (baseCredits === undefined) return 0;
  return baseCredits + Math.max(0, referenceImageCount) * 2;
}

export function getTemplateByKey(key: string) {
  return GENERATION_TEMPLATES.find((template) => template.key === key) ?? GENERATION_TEMPLATES[0];
}
