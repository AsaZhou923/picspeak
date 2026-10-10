import type { SupportedLocale } from './locale.ts';

type FeaturedCritiqueCopy = { title: string; alt: string; problem: string; advice: string; action: string };

// Public Gallery records rechecked on 2026-10-10; provenance is retained in the external PicSpeak documentation vault.
export const FEATURED_CRITIQUES: Array<{
  reviewId: string;
  publishedDate: string;
  copy: Record<SupportedLocale, FeaturedCritiqueCopy>;
}> = [
  {
    reviewId: 'rev_345d83d778d84847',
    publishedDate: '2026-10-05',
    copy: {
      en: {
        title: 'Temple in golden mist', alt: 'Temple on a wooded hillside beside bright golden mist',
        problem: 'Bright mist beside the temple competes with the roofline.',
        advice: 'Lower brightness locally while preserving the golden mist and dark mountain surround.',
        action: 'Mask the bright area beside the roof. Stop when the roof layers read clearly and the mist still feels luminous.',
      },
      zh: {
        title: '金色晨雾中的寺院', alt: '树林山坡上的寺院与建筑旁的金色亮雾',
        problem: '寺院旁的亮雾紧贴屋檐，分散了对建筑的注意力。',
        advice: '局部降低亮度，同时保留金色雾光与暗色山林的关系。',
        action: '只对屋檐旁的亮区做局部蒙版，压到屋檐层次清楚、雾仍通透时停止。',
      },
      ja: {
        title: '金色の霧に包まれた寺院', alt: '森の斜面に立つ寺院と、その隣の明るい金色の霧',
        problem: '寺院の隣の明るい霧が屋根の輪郭から視線をそらします。',
        advice: '金色の霧と暗い山林の関係を保ちながら、局所的に明るさを下げます。',
        action: '屋根の隣の明るい部分だけをマスクし、屋根の層が読めて霧の輝きも残るところで止めます。',
      },
    },
  },
  {
    reviewId: 'rev_a6193b915e5c4f3d',
    publishedDate: '2026-05-04',
    copy: {
      en: {
        title: 'Bee on a white blossom', alt: 'Bee on a white blossom with dark stamens and a pink blurred background',
        problem: 'The bee’s head and antennae overlap the dark stamens.',
        advice: 'Wait for the head or antennae to move clear of the stamens.',
        action: 'Release the shutter when a white-petal gap separates the head from the darkest stamen. Keep the close framing and pink background.',
      },
      zh: {
        title: '白色花朵上的蜜蜂', alt: '白色花朵上的蜜蜂、暗色花蕊与粉色虚化背景',
        problem: '蜜蜂的头部和触角与暗色花药重叠。',
        advice: '等头部或触角移开，避免轮廓与花药混在一起。',
        action: '等头部与最暗花药之间出现白色花瓣间隙时按下快门，保留近距离取景和粉色背景。',
      },
      ja: {
        title: '白い花に止まるハチ', alt: '白い花のハチ、暗いおしべとピンクのぼけた背景',
        problem: 'ハチの頭と触角が暗いおしべに重なっています。',
        advice: '頭や触角がおしべから離れる瞬間を待ちます。',
        action: '頭と最も暗いおしべの間に白い花びらの隙間が見えたら撮影します。近い構図とピンクの背景を保ちます。',
      },
    },
  },
  {
    reviewId: 'rev_4f8e08c5f9894d2d',
    publishedDate: '2026-04-09',
    copy: {
      en: {
        title: 'Warm lamps and timber beams', alt: 'Upward view of dark timber beams, warm lamps, a cool strip light and a bright doorway',
        problem: 'A bright doorway and cool strip light pull attention away from warm lamps and dark beams.',
        advice: 'Tighten the frame upward and slightly left.',
        action: 'Reframe until the lower-right opening reaches the edge or disappears, retaining a strip of lattice windows. Check that the beam structure still reads clearly.',
      },
      zh: {
        title: '木梁与暖色灯光', alt: '仰拍暗色木梁、暖灯、冷色灯管和明亮门洞',
        problem: '亮门洞和冷色灯管分散了对暖灯与暗梁的注意力。',
        advice: '将取景向上、略向左收紧。',
        action: '调整到右下开口移至边缘或消失，保留一带格窗，再检查木梁结构是否仍然清楚。',
      },
      ja: {
        title: '木の梁と暖かな照明', alt: '暗い木の梁、暖かな照明、寒色の蛍光灯と明るい出入口を見上げた写真',
        problem: '明るい出入口と寒色の蛍光灯が、暖かな照明と暗い梁から視線をそらします。',
        advice: '上方向と少し左に構図を絞ります。',
        action: '右下の開口部が端に移るか消えるまで構図を調整し、格子窓を一帯残します。梁の構造が読み取れるかも確認します。',
      },
    },
  },
];
