import type { Locale } from '@/lib/i18n';

export interface BlogPostSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  category: string;
  readingTime: string;
  publishedAt: string;
  updatedAt: string;
  keywords: string[];
  intro: string;
  takeawayTitle: string;
  takeawayItems: string[];
  sections: BlogPostSection[];
}

export interface BlogUiCopy {
  name: string;
  label: string;
  navLabel: string;
  footerLabel: string;
  homeLabel: string;
  homeHint: string;
  title: string;
  description: string;
  keywords: string[];
  introPrimary: string;
  introSecondary: string;
  starterPostsLabel: string;
  primaryTopicsLabel: string;
  seoDirectionLabel: string;
  primaryTopicsText: string;
  seoDirectionText: string;
  startTitle: string;
  startIntro: string;
  featuredLabel: string;
  allPostsLabel: string;
  allPostsHeading: string;
  readFeaturedCta: string;
  readMoreCta: string;
  backToBlog: string;
  nextStepLabel: string;
  nextStepTitle: string;
  nextStepBody: string;
  nextStepCta: string;
  moreArticlesCta: string;
  relatedLabel: string;
  relatedHeading: string;
}

type BlogLocaleBundle = {
  ui: BlogUiCopy;
  posts: BlogPost[];
};

const BLOG_SLUGS = [
  'ai-photo-critique-daily-practice',
  'five-photo-composition-checks',
  'turn-photo-feedback-into-shooting-checklist',
  'lighting-mistakes-ai-catches',
  'color-grading-photography-guide',
  'street-photography-ai-review-workflow',
] as const;

const SHARED_PUBLISHED_AT = '2026-04-11';
const SHARED_UPDATED_AT = '2026-04-11';

// ---------------------------------------------------------------------------
// ZH
// ---------------------------------------------------------------------------

const ZH_POSTS: BlogPost[] = [
  {
    slug: BLOG_SLUGS[0],
    title: '为什么 AI 摄影点评适合做日常练习，而不是只在拍砸时才用',
    description: 'AI 摄影点评更适合作为稳定训练工具，而不只是临时补救工具。本文从训练心理学和摄影进阶路径两个角度，解释为什么高频日常点评比偶尔深度复盘更有效。',
    excerpt:
      '真正拉开差距的不是偶尔一次深度复盘，而是稳定的拍后复盘。把 AI 摄影点评放进日常流程，会更快看见重复问题，也会更早修正那些你自己察觉不到的微小习惯偏差。',
    category: 'AI 点评',
    readingTime: '5 分钟',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['AI 摄影点评', '照片复盘', '摄影练习', '拍后分析', '摄影日常训练', '摄影进步方法'],
    intro:
      '很多人只在照片明显拍砸时才去找点评，但训练真正有效的时刻，往往是那些"看起来不算差、却总不够好"的日常作品。这篇文章从训练心理学和摄影进阶路径两个角度，解释为什么日常点评比偶尔深度复盘更能带来稳定进步。',
    takeawayTitle: '这篇的核心结论',
    takeawayItems: [
      '高频复盘比低频重度复盘更容易带来稳定进步。',
      '点评必须能落到下一次拍摄动作上，否则只是信息噪音。',
      '同一类问题重复出现时，要优先当作训练目标而不是忽略。',
      '每次训练只抓 1-2 个改善点，不要贪多。',
    ],
    sections: [
      {
        title: '1. AI 点评最适合发现"重复错误"',
        paragraphs: [
          '一张照片单看时，很多问题并不严重——主体稍微偏了一点、边缘有一点杂物、光线不够戏剧化。但当你把一周、一个月的作品一起回顾时，你会发现主体总是不够集中、边缘总有杂物、逆光时高光总容易丢失。',
          'AI 点评的价值，不只是告诉你这一张哪里不对，而是持续提醒你同一种问题又出现了。这种"重复信号"是人类导师和朋友很难提供的——他们通常只看你分享出来的那几张，而不是你库里几百张里的模式。',
          '所以 AI 点评的核心优势不是比人类更聪明，而是比人类更有耐心：它每一次都会帮你从同样的五个维度检查，不会因为"上次说过了"就跳过。',
        ],
      },
      {
        title: '2. 日常训练要靠短闭环',
        paragraphs: [
          '每次拍完后花十分钟选 1 到 3 张代表图做点评，再把结果压缩成 1 到 2 条下次必须验证的动作，训练闭环就形成了。这个闭环越短、执行越频繁，进步越稳定。',
          '很多摄影学习者的痛点不是缺少知识，而是缺少反馈频率。你可能看了 100 篇构图教程，但如果两个月只拍了 5 次、从来没有对比过上一次的反馈，那些知识就不会内化。',
        ],
        bullets: [
          '先选代表作，而不是把相似废片全丢进去——选择本身也是训练。',
          '每次只保留最关键的 1 到 2 条修改动作，避免"改进列表"过长导致什么都记不住。',
          '下次拍摄优先验证旧问题有没有减少，再去追新目标。',
        ],
      },
      {
        title: '3. 从"知道"到"做到"——训练心理学视角',
        paragraphs: [
          '运动科学里有个概念叫"刻意练习"：不是重复做你已经会的事，而是反复挑战你刚好做不好的那个区间。AI 点评可以帮你精确定位这个区间——你每次得分最低的那个维度，就是你当前最值得训练的方向。',
          '比如你的"构图"连续三周都在 6 分左右，而"色彩"已经稳定在 8 分，那你下一轮训练应该集中精力在构图上，而不是继续调色。这种精准定位可以显著缩短进步周期。',
        ],
      },
      {
        title: '4. 如何建立自己的日常点评流程',
        paragraphs: [
          '第一步：每次拍摄结束后，在导入电脑的同时就做筛选。不要等到"有空的时候再看"，因为那个时候你已经忘了拍摄现场的判断。',
          '第二步：选出 1-3 张最有代表性的照片上传点评。如果拍的是同一个场景，选最好和最差各一张做对比更有价值。',
          '第三步：看完点评后，写下一句话总结——"下次拍摄我要注意______"。这句话就是你的下一次训练目标。',
        ],
        bullets: [
          '工具：手机备忘录、Notion、甚至纸质笔记都行，关键是持续记录。',
          '频率：建议每周至少 2-3 次，日常拍手机照片也可以点评。',
          '回顾：每月花 15 分钟回看过去的点评记录，观察自己的进步趋势。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[1],
    title: '照片构图总觉得差一点？先检查这 5 个最常见的问题',
    description: '主体明确度、边缘干扰、层次、平衡和动线，是最常见的五个构图检查点。逐一排查就能明显提升照片完成度。',
    excerpt:
      '多数"差一点"的照片，并不是不会构图，而是没有做最后一步检查。多看一眼主体、边缘和动线，完成度就会明显不同。这篇文章给你一个可执行的检查清单。',
    category: '构图',
    readingTime: '6 分钟',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['照片构图', '摄影构图技巧', '主体明确', '视觉引导', '构图检查清单', '摄影边缘处理'],
    intro:
      '很多人学过三分法、引导线、留白，但在现场按下快门前，仍然缺少一套高效的确认顺序。这篇文章不是再讲一遍构图法则，而是提供一个你在现场、后期和点评时都能用的 5 步检查流程。',
    takeawayTitle: '先记住这 5 个点',
    takeawayItems: [
      '主体是不是一眼就成立——看面积、明暗、色彩优势。',
      '边缘和角落有没有抢戏——电线杆、半截人头、亮色碎片。',
      '画面有没有前后层次——前景、中景、背景至少两层。',
      '视觉重量是不是失衡——左右、上下的明暗和色块分布。',
      '视线有没有被顺到主体——引导线、明暗对比、色彩聚焦。',
    ],
    sections: [
      {
        title: '1. 主体明确度：一眼看出你在拍什么',
        paragraphs: [
          '如果观者需要花两三秒才知道你在拍什么，主体通常不够明确。主体必须在面积、明暗、色彩或清晰度上至少有一项领先于画面中的其他元素。',
          '一个常见的误区是"我的主体在中间，所以应该够明确了"。但如果中间的主体和背景的亮度、色彩都差不多，它就会被环境淹没。试试用对比法：让主体比周围亮一档、色彩更饱和一点，或者用浅景深把背景虚化。',
          '另一个有效的检验方法：把照片缩小到手机缩略图的尺寸，如果主体在缩略图里还能一眼看出，那就是足够明确的。',
        ],
      },
      {
        title: '2. 边缘干扰：问题往往不在中间',
        paragraphs: [
          '很多照片问题不在中间，而是被半截路牌、亮部碎片和杂乱线条拖走注意力。拍摄时我们的注意力集中在主体上，容易忽略画面边缘。',
          '解决方法很简单：在按下快门前，花 2 秒扫一遍取景器的四条边和四个角。如果看到不该出现的东西——树枝、路灯、半个人的手臂——移动脚步或调整焦段把它们切掉。',
          '后期裁切是补救手段，但不是最佳方案，因为裁切后构图比例会变，可能影响主体位置。养成在现场就处理边缘的习惯，要比后期修补高效得多。',
        ],
        bullets: [
          '检查四角：角落是注意力最容易被抢走的地方。',
          '注意半截物体：完全切掉或完全保留，不要留一半。',
          '亮色陷阱：边缘的白色或高饱和色块会吸引视线远离主体。',
        ],
      },
      {
        title: '3. 层次感：让画面不"平"',
        paragraphs: [
          '没有前景或空间关系，照片容易显平。即使是一个简单的前景——地面的纹理、一根线条、一片落叶——都能给画面增加纵深。',
          '层次不一定需要大面积前景。在街头和人像摄影中，通过前后虚化产生空间感也是有效手段。关键是让画面有"穿透力"，让观者感觉可以"走进去"。',
        ],
        bullets: [
          '风景：寻找前景锚点（石头、花草、水面倒影）。',
          '街头：用框架元素（门框、窗户、通道）创造层次。',
          '人像：控制主体与背景的距离，利用虚化分离层次。',
        ],
      },
      {
        title: '4. 视觉平衡：重量感要对称',
        paragraphs: [
          '视觉重量失衡时，即便主体位置正确，也可能被另一块亮部或高饱和区域抢走。视觉重量受亮度、色彩饱和度、面积和纹理复杂度影响。',
          '"平衡"不意味着左右对称——三分法本身就是不对称的。但主体一侧的视觉重量需要有另一侧的元素来"锚定"，否则画面会感觉要倒向一边。',
        ],
      },
      {
        title: '5. 视觉动线：引导观者的视线',
        paragraphs: [
          '最后要确认画面有没有导线，把观者带到主体上，而不是让视线在画面里游离。引导线可以是明确的（道路、栏杆、建筑线条），也可以是隐含的（明暗渐变、色彩过渡、人物视线方向）。',
          '一个实用技巧：想象你第一次看这张照片，你的眼睛最先落在哪里？然后跟着视线走，看它是否最终到达主体。如果视线在画面里绕了一圈都没找到落点，说明缺少有效的视觉导线。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[2],
    title: '拍照后不知道怎么改？把照片反馈翻译成下一次拍摄清单',
    description: '把抽象的照片反馈翻成可执行动作，才能真正帮助下一次拍摄。本文提供从"问题描述"到"现场动作"的翻译模板。',
    excerpt:
      '看懂反馈和真的改掉问题，是两回事。把"画面杂乱""光线太硬"翻译成现场动作，点评才会变成训练系统。',
    category: '工作流',
    readingTime: '5 分钟',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['照片反馈', '摄影清单', '拍摄工作流', '摄影复盘', '摄影改进方法', '点评翻译'],
    intro:
      '很多摄影学习停在"我知道问题了"。但知道问题，不等于下次拍摄时真的会改。这篇文章提供一套从"抽象点评"到"现场可执行动作"的翻译方法论，以及按题材分类的具体清单模板。',
    takeawayTitle: '把反馈变成动作的原则',
    takeawayItems: [
      '反馈不能只停留在形容词——"乱"不是动作，"切掉边缘招牌"才是。',
      '清单越短，执行率越高——一次最多 3 条。',
      '一张清单最好只服务下一轮同题材拍摄。',
      '每次拍完要回头验证上一轮清单的执行情况。',
    ],
    sections: [
      {
        title: '1. 把抽象点评翻成现场动作',
        paragraphs: [
          '"画面杂乱"不是动作，"切掉边缘招牌"才是动作；"缺少层次"不是动作，"加入前景并拉开主背景距离"才是动作。',
          '大多数 AI 点评和人类导师的反馈都是描述性的——它们告诉你"是什么"，但很少直接告诉你"怎么做"。翻译的关键是：把每个描述性反馈转化为在拍摄现场可以执行的具体操作。',
        ],
        bullets: [
          '"画面杂乱" → 下次先观察背景，移动位置避开杂物，或用更长焦段压缩背景。',
          '"曝光不准" → 对高光测光而不是平均测光，或者开启高光警告提示。',
          '"色彩平淡" → 尝试在黄金小时或蓝调时段拍摄，或后期增加局部对比度。',
          '"主体不突出" → 用更大光圈、前后景分离、或寻找色彩对比来强调主体。',
        ],
      },
      {
        title: '2. 用短清单完成反馈闭环',
        paragraphs: [
          '把上一轮点评压缩成 3 条以内的提醒，出门前快速看一遍，拍完后再检查是否真的执行。这样点评才会从建议，变成可验证的训练闭环。',
          '为什么说 3 条以内？因为拍摄现场要同时处理光线、场景、模特/物体状态、构图和相机设置，大脑的工作记忆有限。如果你带着 10 条待改进清单出门，结果大概率一条也记不住。',
        ],
      },
      {
        title: '3. 按题材分类的清单模板',
        paragraphs: [
          '不同题材的关注侧重完全不同。以下是几种常见题材的检查清单模板，你可以在此基础上根据自己的弱项定制：',
        ],
        bullets: [
          '街头摄影：① 背景干净 ② 主次关系清晰 ③ 抓拍决定性瞬间。',
          '人像摄影：① 眼神光和面部受光方向 ② 背景与主体分离 ③ 人物姿态和表情引导。',
          '风景摄影：① 前景组织 ② 拍摄时间窗口（黄金/蓝调） ③ 天空与地面的面积比重。',
          '美食摄影：① 光线角度（顶光或侧光） ② 道具搭配不宜喧宾夺主 ③ 色彩搭配温暖且有食欲。',
          '建筑摄影：① 透视校正和垂直线 ② 光线对建筑结构的强调 ③ 周围环境的简化。',
        ],
      },
      {
        title: '4. 案例：一次完整的反馈闭环实践',
        paragraphs: [
          '假设你上一轮街头拍摄得到反馈"构图评分 6/10，主要问题：背景过于杂乱，主体被环境淹没"。翻译成动作清单：① 下次选择更简洁的背景（单色墙面、天空） ② 用 50mm 以上焦段压缩背景 ③ 等待主体独立通过干净区域时再按快门。',
          '下一次拍摄时带着这 3 条出门。拍完后再上传点评，重点看这些项目是否有改善。如果构图评分提升到 7.5+，说明方向对了；如果没变化，说明执行不到位或者需要换个策略。',
          '这个"反馈 → 翻译 → 执行 → 验证"的流程，就是把 AI 点评变成真正训练系统的关键。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[3],
    title: 'AI 最常抓到的 5 个光线错误——以及怎么在现场就避开',
    description: '逆光过曝、混合色温、阴影无细节、直射硬光和光线无方向感，是 AI 点评最常标出的五个光线问题。',
    excerpt:
      '光线是摄影中最被低估的维度。很多人在构图上投入大量精力，却忽略了光线对照片质量的决定性影响。本文列出 AI 点评最常识别的 5 个光线问题以及对应的现场解决方案。',
    category: '光线',
    readingTime: '6 分钟',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['摄影光线', '光线错误', 'AI 照片分析', '曝光控制', '色温', '摄影用光技巧'],
    intro:
      '在 PicSpeak 的五个评分维度里，"光线"是用户平均得分最低的一项。这不是因为光线最难学，而是因为大多数人在拍摄时更关注构图和主题，把光线当成了"看运气"的东西。其实，光线完全可以通过调整拍摄时间、位置和角度来控制——即使你没有任何打光设备。',
    takeawayTitle: '需要避开的 5 个光线问题',
    takeawayItems: [
      '逆光过曝：主体变成剪影或脸部全黑。',
      '混合色温：日光和室内光混在一起，导致画面偏色。',
      '阴影无细节：暗部全黑，失去纹理和层次。',
      '顶光直射：正午光线从正上方打下来，造成眼窝和鼻子下方的硬阴影。',
      '光线无方向感：找不到主光源，画面平淡没有立体感。',
    ],
    sections: [
      {
        title: '1. 逆光过曝',
        paragraphs: [
          '逆光本身不是问题——它可以创造美丽的光晕和氛围感。问题出在曝光控制上。当相机对着强光源测光时，会大幅压低曝光，导致主体变成黑色剪影。',
          '解决方案：如果想保留主体的细节，可以用点测光对准主体面部或中间调区域进行测光，接受背景略微过曝。如果有闪光灯或反光板，则可以从主体正面补光。手机拍摄时，长按对焦主体并手动向上推曝光补偿。',
        ],
        bullets: [
          '没有补光工具时，让主体转向光源一侧 45°，利用散射光照亮面部。',
          '利用建筑物或大面积浅色表面作为天然反光板。',
          '如果剪影是你的意图，那就大胆做——让主体完全黑，背景干净，不要两头都想要。',
        ],
      },
      {
        title: '2. 混合色温',
        paragraphs: [
          '当画面中同时存在暖色的室内灯光和冷色的日光时，白平衡无论调向哪边，画面都会有一部分偏色。这在咖啡馆、商场和室内活动拍摄中非常常见。',
          '最有效的方法是尽量选择单一光源主导的位置——比如靠窗用自然光，或者走到灯光覆盖区域远离窗户。如果必须在混合光源下拍摄，考虑后期做局部色温调整，或者干脆转为黑白照片来回避色温问题。',
        ],
      },
      {
        title: '3. 阴影无细节',
        paragraphs: [
          '自然光下如果光比（最亮和最暗区域的亮度差）超过相机动态范围，暗部就会变成纯黑。这在强光+阴影并存的场景里最常出现。',
          '拍摄时注意暗部是否还能看到纹理。如果现场光比太大，可以选择包围曝光后合成 HDR，或者使用渐变滤镜平衡亮暗。手机自带的 HDR 模式在这种场景下通常也有帮助。',
        ],
      },
      {
        title: '4. 顶光硬阴影',
        paragraphs: [
          '正午的太阳从正上方直射，会在人物眼窝、鼻子下方和下巴处形成浓重的黑色阴影，俗称"熊猫眼"。这在户外人像拍摄中几乎是最常见的光线问题。',
          '最简单的解决方案是选择时间——尽量在上午 10 点前或下午 3 点后拍摄。如果必须在正午拍，让模特走到树荫或建筑阴影下，利用散射光获得均匀柔和的面部光线。另一个技巧是让模特面朝上方，利用反射光填充阴影。',
        ],
      },
      {
        title: '5. 光线无方向感',
        paragraphs: [
          '有些照片的光线"不差"但"不好"——没有明显过曝或欠曝，但整体看起来很平淡。这通常是因为光线没有方向感：没有明确的主光、填充光和轮廓光的关系。',
          '在自然光下制造方向感的方法是选择侧光——让光线从主体的一侧照射，在另一侧形成阴影，从而创造立体感。窗户光是最好的侧光来源之一。',
          '观察阴影的方向和长度可以帮助你判断光线的质量。如果地面上物体的阴影又短又淡，说明此时的光线缺乏方向性（通常在阴天或正午），适合拍柔和的高调画面，但不适合追求立体感。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[4],
    title: '为什么你的照片色彩总差点意思？摄影色彩的 4 个核心原则',
    description: '色温一致性、色彩关系、饱和度克制和色调情绪匹配，是让照片色彩从"还行"升级到"耐看"的四个关键维度。',
    excerpt:
      '色彩不只是后期调色——从拍摄时的白平衡选择到场景中衣服和背景的颜色搭配，一张照片的色彩品质在按快门前就已经决定了大半。',
    category: '色彩',
    readingTime: '7 分钟',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['摄影色彩', '照片调色', '色温控制', '色彩搭配', '色彩理论摄影', 'AI色彩评分'],
    intro:
      '在 PicSpeak 的五个评分维度里，色彩和光线是最容易被忽视的。很多人把色彩当作后期问题——"拍完回来调调滤镜就好了"。但实际上，一张照片的色彩品质在按快门前就已经决定了大半。本文从摄影实践出发，讲解 4 个最核心的色彩原则。',
    takeawayTitle: '色彩的 4 个核心原则',
    takeawayItems: [
      '色温一致性：画面内所有元素的色温应该统一或有意对比。',
      '色彩关系：互补色产生张力，类似色创造和谐，单色调制造氛围。',
      '饱和度克制：高饱和 ≠ 好色彩，过度饱和会让画面看起来廉价。',
      '色调情绪匹配：暖色调表达温馨和力量，冷色调传达安静和距离感。',
    ],
    sections: [
      {
        title: '1. 色温一致性——统一就是和谐',
        paragraphs: [
          '色温的混乱是照片看起来"业余"的最常见原因之一。当日光（偏冷蓝）和室内光（偏暖黄）同时出现在画面中时，无论怎么调白平衡，总有一部分颜色是"不对"的。',
          '在拍摄阶段就注意光源的色温统一性，可以避免后期大量修正工作。如果你无法控制环境光源，那就选择一种色温作为基准，让另一种色温成为画面的"异常"——有意的色温对比可以成为设计元素，但无意的混合只会让画面看起来脏。',
        ],
      },
      {
        title: '2. 色彩关系——互补、类似和单色',
        paragraphs: [
          '色彩关系是指画面中不同颜色之间的搭配逻辑。最常用的三种关系是：互补色（色环上对立的颜色，如蓝+橙）、类似色（色环上相邻的颜色，如黄+绿+蓝绿）和单色调（同一颜色的不同明度和饱和度）。',
          '互补色搭配会产生最强的视觉张力——想想电影海报里常见的蓝橙配色。类似色搭配更和谐柔和，适合日系清新风格。单色调则营造最强的氛围感和统一性，黑白照片其实就是极致的单色调。',
          '在实际拍摄中，你可以通过选择背景、引导模特穿衣颜色、或者选择特定的拍摄环境来控制画面的色彩关系。',
        ],
        bullets: [
          '互补色案例：黄金小时的暖光+蓝色天空、红衣人物+绿色植物背景。',
          '类似色案例：秋天的红黄橙渐变、春天的粉白绿搭配。',
          '单色调案例：雾天的灰白系列、夜晚的深蓝层次。',
        ],
      },
      {
        title: '3. 饱和度克制——少即是多',
        paragraphs: [
          '很多人在后期第一件事就是拉高饱和度，认为"颜色越鲜越好看"。但过度饱和会让照片失去层次感，而且在不同设备上显示差异巨大——你在校色显示器上觉得"刚好"的饱和度，在手机屏幕上可能已经炸裂了。',
          '专业摄影师通常会在降低整体饱和度的同时，有选择地提高特定颜色的饱和度——这就是"选择性色彩强调"。比如在人像照片中略微降低背景色彩的饱和度，但保持肤色的温暖和唇色的鲜艳。',
          '一个好的检验标准：如果画面中超过 3 种颜色同时高度饱和，大概率需要减弱。让 1-2 个主角色突出，其余作为配角退后。',
        ],
      },
      {
        title: '4. 色调与情绪的匹配',
        paragraphs: [
          '暖色调（黄橙红）天然传达温暖、活力和亲密感；冷色调（蓝绿紫）传达安静、神秘和距离感。这不是审美偏好，而是人类视觉心理的基本规律。',
          '很多照片的色彩"不对劲"不是因为技术问题，而是色调与内容的情绪不匹配。比如一张温馨的家庭合影被调成了冷蓝色调，或者一张孤独的夜景被调成了暖黄色调——技术上没问题，但情绪上不协调。',
          '在后期调色之前，先问自己一个问题："这张照片我想传达什么情绪？"然后选择与之匹配的色调方向。这比盲目套用预设滤镜更有效。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[5],
    title: '街头摄影 × AI 点评：一套完整的拍-评-改工作流',
    description: '街头摄影的进步依赖快速迭代，但大多数人缺少系统化的拍后复盘。本文提供一套结合 AI 点评的街头摄影工作流。',
    excerpt:
      '街头摄影看起来靠直觉，但持续进步靠的是系统。把每次扫街的成果用 AI 点评做快速复盘，就能把"碰运气"变成"有方向的练习"。',
    category: '实战',
    readingTime: '6 分钟',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['街头摄影', '街拍技巧', 'AI 摄影工作流', '扫街摄影', '摄影复盘', '街头摄影进阶'],
    intro:
      '街拍的魅力在于不确定性——你不知道下一个街角会出现什么。但恰恰因为不确定性太高，街头摄影的进步往往很慢：你很难判断是自己水平提升了，还是今天运气好遇到了好场景。本文提供一套结合 AI 点评的系统化工作流，帮你从"碰运气"模式切换到"刻意练习"模式。',
    takeawayTitle: '街头摄影工作流的核心',
    takeawayItems: [
      '不要等回家再看片——扫街结束后花 15 分钟在现场附近做初筛。',
      '每次扫街只选 3-5 张代表图上传点评，不要海投。',
      '重点关注构图和"表达力"两个维度——这是街拍最拉开差距的地方。',
      '建立"同场景对比"习惯：在同一个场景拍多张不同处理方式的照片并对比得分。',
    ],
    sections: [
      {
        title: '1. 出门前：带着上次的问题出门',
        paragraphs: [
          '打开之前的点评记录，回看上次扫街得分最低的维度和具体问题。把最关键的 1-2 条写在手机备忘录里。',
          '比如如果上次的反馈是"背景过于杂乱"，那今天扫街时就有意寻找简洁背景的场景——单色墙面、天桥下的光影区、长焦压缩出的纯色背景。带着具体问题出门，和漫无目的地拍完全不一样。',
        ],
      },
      {
        title: '2. 拍摄中：预判光线和场景',
        paragraphs: [
          '街头摄影不是随机按快门。有经验的街头摄影师会"预判"好的拍摄位置和光线，然后等待合适的人物和瞬间出现。这叫"钓鱼式"拍摄——你先选好了"钓位"，然后等鱼上钩。',
          '找到一个光线有方向感、背景干净、有潜在视觉引导线的位置，然后站在那里等。等一个人走过光束，等一个有趣的手势，等一个故事性的瞬间。这比拿着相机跑来跑去效率更高，而且构图稳定性更好。',
          '每一个拍摄决定都是训练的一部分：为什么选择这个位置而不是那个？为什么用这个焦段？为什么在这一秒按下快门？这些问题的答案就是你的拍摄直觉，而 AI 点评可以帮你验证这些直觉是否正确。',
        ],
      },
      {
        title: '3. 拍完后：15 分钟快速复盘',
        paragraphs: [
          '扫街结束后，找个咖啡馆坐下来，趁记忆还新鲜做快速筛选。从今天所有照片里选出 3-5 张最有代表性的上传到 PicSpeak。',
          '选择标准不是"最好的"，而是"最有代表性的"——包括你觉得拍得最好的、你犹豫不确定的、和你觉得有潜力但好像差点什么的。这种混合选择能让 AI 点评给你最有价值的比较参考。',
        ],
        bullets: [
          '最好的 1 张：验证你的判断，看 AI 是否认同。',
          '不确定的 1-2 张：让 AI 帮你看你可能错过了什么。',
          '差点什么的 1 张：找到具体差在哪里，这往往是最大的学习点。',
        ],
      },
      {
        title: '4. 分析结果：建立自己的弱项档案',
        paragraphs: [
          '把每次的点评结果简单记录下来：日期、题材、各维度得分、主要问题。一个月后你会看到清晰的模式——也许你的构图一直在 7 分以上但光线总是卡在 5-6 分，这说明你下一阶段应该专攻光线而不是继续磨构图。',
          '这种"弱项档案"是自我提升最有价值的工具之一。职业运动员都有教练团队帮他们做数据分析和弱项识别，而 AI 点评+简单记录就能让你在摄影领域做到类似的事情。',
        ],
      },
      {
        title: '5. 进阶技巧：同场景 A/B 对比',
        paragraphs: [
          '找到一个有潜力的场景后，尝试用不同的方式拍摄同一个场景——不同焦段、不同角度、不同时机、不同曝光。然后把多张照片一起上传点评，对比哪种处理方式得分更高。',
          '这种 A/B 测试式的练习可以快速帮你理解"为什么这个角度比那个角度好"、"为什么等那个人走进来再拍比提前拍更有表达力"。这是最高效的摄影训练方式之一。',
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// EN
// ---------------------------------------------------------------------------

const EN_POSTS: BlogPost[] = [
  {
    slug: BLOG_SLUGS[0],
    title: 'Why AI photo critique works best as daily practice, not just emergency repair',
    description: 'AI critique becomes more useful when it is part of a repeatable training loop. This article explores the psychology of deliberate practice and how high-frequency review accelerates growth.',
    excerpt:
      'The bigger gains usually come from consistent post-shoot review. When AI critique becomes part of your routine, repeated weaknesses show up much faster — and you start fixing them before they become permanent habits.',
    category: 'AI Critique',
    readingTime: '5 min read',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['AI photo critique', 'post-shoot review', 'photography practice', 'deliberate practice photography', 'photo improvement routine'],
    intro:
      'If you use critique only after obvious failures, you miss most of its value. The harder problem is usually repeating the same visual mistake for weeks without noticing it. This article explains — from a training psychology perspective — why daily critique beats occasional deep review.',
    takeawayTitle: 'Core takeaway',
    takeawayItems: [
      'High-frequency review beats low-frequency deep review.',
      'Feedback matters only when it turns into an actionable task.',
      'Repeated issues should become your next training target, not be ignored.',
      'Focus on only 1–2 improvements per session — don\'t overload.',
    ],
    sections: [
      {
        title: '1. AI critique is good at exposing repeated patterns',
        paragraphs: [
          'A single image can look acceptable, but a week of work may reveal the same weakness over and over: loose framing, messy edges, flat light, or weak storytelling.',
          'The real value is not just one score. It is the repeated signal telling you the same issue is still there. This kind of persistent reminder is something human mentors rarely provide — they usually only see the few photos you choose to share, not the patterns across hundreds of images in your library.',
          'So the core advantage of AI critique is not being smarter than a human — it\'s being more patient. It checks the same five dimensions every single time, never skipping something because "we talked about that last time."',
        ],
      },
      {
        title: '2. Daily practice needs a short loop',
        paragraphs: [
          'After each shoot, spend ten minutes choosing one to three representative frames. Review them, then reduce the result to one or two actions for the next session. The shorter and more frequent this loop, the more stable your progress.',
          'The real pain point for most learners is not lack of knowledge — it\'s lack of feedback frequency. You might read 100 composition tutorials, but if you only shoot 5 times in two months and never compare results to previous feedback, that knowledge never becomes internalized.',
        ],
        bullets: [
          'Pick representative frames, not every similar miss — the act of selecting is itself training.',
          'Keep only one or two corrections for next time to prevent memory overload.',
          'Use the next shoot to test whether the old problem improved before chasing new goals.',
        ],
      },
      {
        title: '3. From "knowing" to "doing" — a deliberate practice perspective',
        paragraphs: [
          'Sports science has a concept called "deliberate practice": not repeating what you already do well, but repeatedly challenging yourself in the zone where you barely manage. AI critique can help you locate this zone precisely — the dimension where you consistently score lowest is the one most worth training.',
          'For example, if your "composition" has hovered around 6/10 for three weeks while "color" already sits at 8, your next training phase should focus on composition, not more color grading. This precise targeting can significantly shorten the improvement cycle.',
        ],
      },
      {
        title: '4. How to build your daily critique routine',
        paragraphs: [
          'Step 1: Right after the shoot, start culling while importing. Don\'t wait until you "have time" — by then you\'ll have forgotten your on-site decisions.',
          'Step 2: Select 1–3 most representative photos and upload them for critique. If you shot the same scene, choosing one best and one worst frame for comparison is the most valuable approach.',
          'Step 3: After reviewing the critique, write one sentence: "Next time I need to pay attention to ______." That sentence becomes your next training goal.',
        ],
        bullets: [
          'Tool: phone notes, Notion, even paper — what matters is consistency.',
          'Frequency: at least 2–3 times per week; casual phone photos count too.',
          'Monthly review: spend 15 minutes looking at past critiques to track your progress trend.',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[1],
    title: 'Composition still feels "off"? Check these 5 common problems first',
    description: 'Subject clarity, edge distractions, depth, balance, and visual flow are the five most useful composition checks. A walkthrough-style checklist for field and post-processing use.',
    excerpt:
      'Most "almost there" photos do not fail because the photographer doesn\'t understand composition. They fail because nobody makes the final check. This article gives you an executable five-step process.',
    category: 'Composition',
    readingTime: '6 min read',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['photo composition tips', 'composition checklist', 'subject clarity', 'edge distractions', 'visual flow photography'],
    intro:
      'Many photographers know the rule of thirds and leading lines, but still leave with a frame that feels close rather than complete. This article is not another composition theory overview — it\'s a five-step checklist you can use on-site, in post, and during critique.',
    takeawayTitle: 'Keep these 5 checks in mind',
    takeawayItems: [
      'Can the subject be read immediately — check size, brightness, and color advantage.',
      'Are the edges carrying useless distractions — power lines, half-cropped heads, bright debris.',
      'Is there depth in the frame — foreground, midground, background: at least two layers.',
      'Is visual weight balanced — left/right, top/bottom distribution of brightness and mass.',
      'Does the eye move naturally toward the subject — leading lines, tonal contrast, or color focus.',
    ],
    sections: [
      {
        title: '1. Subject clarity: seen in one glance',
        paragraphs: [
          'If a viewer needs several seconds to understand the frame, the subject is usually too weak. Give it a clear advantage in size, brightness, color, or sharpness over every other element in the frame.',
          'A common misconception: "My subject is centered, so it should be clear enough." But if the centered subject has similar brightness and color to the background, it drowns. Try using contrast: make the subject one stop brighter, slightly more saturated, or separate it with shallow depth of field.',
          'A practical test: shrink the photo to phone-thumbnail size. If the subject is still identifiable at that scale, it\'s clear enough.',
        ],
      },
      {
        title: '2. Edge distractions: the problem is usually at the border',
        paragraphs: [
          'Many photos break not in the center, but at the border — half a street sign, a bright fragment, or a chaotic tangle of lines stealing attention from the subject.',
          'The fix is simple: before pressing the shutter, spend 2 seconds scanning all four edges and corners. If anything shouldn\'t be there — a branch, a streetlight, half of someone\'s arm — adjust your position or focal length to cut it out.',
          'Post-crop is a last resort, not the primary plan, because cropping changes the aspect ratio and can shift the subject position. Building the habit of cleaning edges on-site is far more efficient.',
        ],
        bullets: [
          'Check corners: they\'re the first place attention leaks.',
          'Half-objects: either include fully or remove completely — never leave half.',
          'Bright-color traps: white or saturated patches at the edge pull the eye away from the subject.',
        ],
      },
      {
        title: '3. Depth: making the frame three-dimensional',
        paragraphs: [
          'Without a foreground or spatial relationships, photos feel flat. Even a simple foreground element — ground texture, a line, a fallen leaf — can add depth to the scene.',
          'Depth doesn\'t require a massive foreground. In street and portrait photography, separation via bokeh also creates spatial depth. The key is to give the frame "pull-through" energy — the viewer should feel they can walk into the scene.',
        ],
        bullets: [
          'Landscape: look for foreground anchors (rocks, flowers, water reflections).',
          'Street: use framing devices (doorways, windows, tunnels) to create layers.',
          'Portrait: control subject-to-background distance and use bokeh for separation.',
        ],
      },
      {
        title: '4. Visual balance: matching the visual weight',
        paragraphs: [
          'When visual weight is lopsided, the eye drifts even if the subject is technically well-placed. Visual weight depends on brightness, saturation, size, and texture complexity.',
          '"Balance" does not mean symmetry — the rule of thirds is inherently asymmetric. But the heavier side needs an element on the opposite side to anchor the frame; otherwise it feels like it\'s about to tip over.',
        ],
      },
      {
        title: '5. Visual flow: guiding the viewer\'s eye',
        paragraphs: [
          'Confirm there is some path — explicit (roads, railings, architectural lines) or implicit (brightness gradients, color transitions, gaze direction) — leading the eye to the subject instead of drifting aimlessly through the frame.',
          'A practical exercise: imagine seeing this photo for the first time. Where does your eye land first? Follow it. Does it eventually reach the subject? If the eye wanders in circles with nowhere to rest, the image lacks effective visual flow.',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[2],
    title: 'Turn photo feedback into a checklist for your next shoot',
    description: 'Feedback becomes useful when translated into concrete actions you can test on the next session. Includes genre-specific checklist templates.',
    excerpt:
      'Understanding feedback and actually fixing the problem are different skills. Once feedback becomes a short checklist, critique turns into practice.',
    category: 'Workflow',
    readingTime: '5 min read',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['photo feedback checklist', 'photography workflow', 'shooting checklist', 'photo improvement method', 'critique to action'],
    intro:
      'A lot of learning stops at "I understand the issue now." The real shift happens when that issue becomes something you can execute in the field. This article provides a methodology for translating abstract critiques into on-site actions, plus genre-specific checklist templates.',
    takeawayTitle: 'Rules for turning feedback into action',
    takeawayItems: [
      'Abstract comments need to become field decisions — "cluttered" isn\'t an action; "crop the sign at the edge" is.',
      'Short checklists are easier to execute — three items max per session.',
      'One checklist should support one kind of shoot.',
      'After each shoot, verify whether last session\'s checklist was actually followed.',
    ],
    sections: [
      {
        title: '1. Replace abstract comments with field actions',
        paragraphs: [
          '"Too cluttered" is not an action. "Cut the bright sign at the edge" is. "Lacks depth" is not an action. "Add a foreground layer and increase subject-background distance" is.',
          'Most AI critiques and human mentors give descriptive feedback — they tell you "what" but rarely "how." The key to translation is converting every descriptive comment into a specific operation you can perform on location.',
        ],
        bullets: [
          '"Cluttered" → Next time scout the background first, move to avoid distractions, or use a longer focal length to compress.',
          '"Exposure is off" → Meter on highlights instead of average, or enable highlight alert.',
          '"Colors are flat" → Try shooting during golden hour or blue hour, or add local contrast in post.',
          '"Subject doesn\'t stand out" → Use a wider aperture, foreground/background separation, or find color contrast to emphasize the subject.',
        ],
      },
      {
        title: '2. Build a short checklist and verify it',
        paragraphs: [
          'Compress the last review into three reminders or fewer, look at them before you leave, and check after the shoot whether you actually used them. That is how feedback becomes a training loop.',
          'Why three or fewer? Because on location you\'re already processing light, scene, subject state, composition, and camera settings simultaneously. Working memory is limited. If you carry 10 items out the door, you\'ll likely remember zero.',
        ],
      },
      {
        title: '3. Genre-specific checklist templates',
        paragraphs: [
          'Different genres have very different priorities. Here are some starting templates you can customize based on your weaknesses:',
        ],
        bullets: [
          'Street: ① Clean background ② Clear subject hierarchy ③ Decisive moment timing.',
          'Portrait: ① Catchlight and face lighting direction ② Subject-background separation ③ Pose and expression guidance.',
          'Landscape: ① Foreground structure ② Timing window (golden/blue hour) ③ Sky-to-ground ratio.',
          'Food: ① Light angle (top or side) ② Props shouldn\'t upstage the dish ③ Warm, appetizing color palette.',
          'Architecture: ① Perspective correction and verticals ② Light emphasizing form ③ Simplify surroundings.',
        ],
      },
      {
        title: '4. Case study: a complete feedback loop in practice',
        paragraphs: [
          'Suppose your last street shoot received: "Composition 6/10. Main issue: background too cluttered, subject lost in the environment." Translation into an action checklist: ① Next time find cleaner backgrounds (solid-color walls, sky) ② Use 50mm+ to compress the background ③ Wait until the subject passes through a clean zone before pressing the shutter.',
          'On the next shoot, go out with those 3 items. Then upload the new results and check whether those specific points improved. If composition rises to 7.5+, the direction is right; if it stays flat, adjust the strategy.',
          'This "feedback → translate → execute → verify" cycle is the key to turning AI critique into a real training system.',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[3],
    title: '5 lighting mistakes AI catches most often — and how to avoid them on location',
    description: 'Backlight blowout, mixed color temperatures, crushed shadows, harsh top-light, and directionless flat lighting are the five lighting issues AI reviews flag most frequently.',
    excerpt:
      'Lighting is the most underrated dimension in photography. Many people pour energy into composition while treating light as luck. This article lists the 5 most-flagged lighting issues and on-location fixes.',
    category: 'Lighting',
    readingTime: '6 min read',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['photography lighting', 'lighting mistakes', 'AI photo analysis', 'exposure control', 'color temperature', 'natural light tips'],
    intro:
      'Among PicSpeak\'s five scoring dimensions, lighting is the one where users score lowest on average. Not because it\'s the hardest to learn, but because most people focus on composition and subject while treating light as "something you can\'t control." In reality, light is entirely manageable through timing, position, and angle — even without any studio equipment.',
    takeawayTitle: '5 lighting mistakes to avoid',
    takeawayItems: [
      'Backlight blowout: subject becomes a silhouette or face goes black.',
      'Mixed color temperatures: daylight and indoor light clash, causing unnatural color casts.',
      'Crushed shadows: dark areas turn pure black with no texture or detail.',
      'Harsh top-light: midday sun creates raccoon-eye shadows under brows and nose.',
      'Directionless flat light: no visible light source, image feels flat and dimensionless.',
    ],
    sections: [
      {
        title: '1. Backlight blowout',
        paragraphs: [
          'Backlight itself isn\'t the problem — it can create beautiful flare and atmosphere. The issue is exposure control. When the camera meters against a strong light source, it drastically underexposes, turning the subject into a black silhouette.',
          'Fix: if you want subject detail, switch to spot metering aimed at the subject\'s face or midtones, accepting some background overexposure. With a flash or reflector, fill-light the subject from the front. On a phone, tap-hold on the subject to lock focus, then slide exposure up.',
        ],
        bullets: [
          'Without fill tools, rotate the subject 45° toward the light to catch scattered light on the face.',
          'Use buildings or large light-colored surfaces as natural reflectors.',
          'If silhouette is your intention, commit fully — let the subject go pure black against a clean background. Don\'t try to have it both ways.',
        ],
      },
      {
        title: '2. Mixed color temperatures',
        paragraphs: [
          'When warm indoor light and cool daylight appear in the same frame, no white-balance setting can fix both sides. This is extremely common in cafés, malls, and indoor events.',
          'The most effective approach is choosing a position dominated by a single light source — near a window for natural light, or deep indoors away from windows. If mixed sources are unavoidable, consider selective color correction in post, or convert to black-and-white to sidestep the problem entirely.',
        ],
      },
      {
        title: '3. Crushed shadows',
        paragraphs: [
          'When the dynamic range of a scene (the brightness difference between highlights and shadows) exceeds your camera\'s capability, dark areas collapse into pure black. This is most common in scenes with strong light next to deep shadow.',
          'While shooting, check if shadow areas still show texture. If the scene\'s contrast is too extreme, use exposure bracketing and merge to HDR afterward, or use a graduated ND filter to balance bright and dark. Most phone HDR modes also help in these situations.',
        ],
      },
      {
        title: '4. Harsh top-light shadows',
        paragraphs: [
          'The midday sun casts straight down, creating dark shadows under eye sockets, the nose, and the chin — the dreaded "raccoon eyes." This is perhaps the single most common lighting issue in outdoor portraiture.',
          'The simplest fix is timing — shoot before 10 AM or after 3 PM. If you must shoot at noon, move the subject into open shade (under a tree, beside a building) where scattered light provides even, soft illumination. Another trick: have the subject look slightly upward so reflected ground light fills the face shadows.',
        ],
      },
      {
        title: '5. Directionless flat light',
        paragraphs: [
          'Some photos have light that\'s "not bad" but "not good" — no obvious over- or under-exposure, yet the overall image feels flat and lifeless. This usually means there\'s no directional quality to the light: no discernible key, fill, or rim light relationship.',
          'To create directionality in natural light, look for side-light — let light hit the subject from one side, casting a shadow on the other, which sculpts three-dimensionality. Window light is one of the best sources of natural side-light.',
          'Observe the direction and length of shadows on the ground. Short, faint shadows mean the light lacks direction (common on overcast days or at noon) — good for soft, high-key looks, but not for chasing dimensionality.',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[4],
    title: 'Why your photo colors feel "off"? 4 core principles of color in photography',
    description: 'Color temperature consistency, color relationships, saturation restraint, and tone-mood matching are the four keys to elevating photo color from "okay" to "compelling."',
    excerpt:
      'Color is not just a post-processing concern. From white-balance choices at capture to the colors of clothing and background in the scene, a photo\'s color quality is largely decided before the shutter clicks.',
    category: 'Color',
    readingTime: '7 min read',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['photography color theory', 'photo color grading', 'color temperature', 'color palette photography', 'AI color scoring'],
    intro:
      'Among PicSpeak\'s five dimensions, color and lighting are the most often overlooked. Many treat color as a post issue — "I\'ll slap a filter when I\'m done." But a photo\'s color quality is largely locked in before the shutter fires. This article covers four core color principles from a practical photography standpoint.',
    takeawayTitle: '4 core color principles',
    takeawayItems: [
      'Temperature consistency: all elements in frame should share a unified or intentionally contrasting color temperature.',
      'Color relationships: complementary colors create tension, analogous colors create harmony, monochrome creates mood.',
      'Saturation restraint: more saturated ≠ better color; over-saturation looks cheap.',
      'Tone-mood matching: warm tones convey warmth and energy; cool tones convey calm and distance.',
    ],
    sections: [
      {
        title: '1. Color temperature consistency — unity is harmony',
        paragraphs: [
          'Messy color temperature is one of the most common reasons a photo looks "amateur." When warm indoor light (yellowish) and cool daylight (bluish) coexist in a frame, no white-balance setting satisfies both sides.',
          'Being deliberate about color-temperature unity during capture saves massive correction work in post. If you can\'t control the ambient sources, choose one temperature as the baseline and let the other become the "anomaly" — intentional temperature contrast can be a design element, but accidental mixing just looks muddy.',
        ],
      },
      {
        title: '2. Color relationships — complementary, analogous, and monochrome',
        paragraphs: [
          'Color relationships describe the logic between different hues in a frame. The three most common schemes are: complementary (opposite on the color wheel, e.g. blue + orange), analogous (adjacent, e.g. yellow + green + teal), and monochrome (various brightness and saturation of a single hue).',
          'Complementary pairs produce the strongest visual tension — think of the teal-and-orange look dominating movie posters. Analogous schemes feel gentler and more harmonious, perfect for a soft aesthetic. Monochrome delivers the strongest mood and unity; black-and-white is the ultimate monochrome.',
          'In practice, you can control color relationships by choosing backgrounds, guiding wardrobe colors, or selecting specific environments for your shoot.',
        ],
        bullets: [
          'Complementary: golden-hour warmth + blue sky, red figure + green foliage.',
          'Analogous: autumn\'s red-yellow-orange gradient, spring\'s pink-white-green mix.',
          'Monochrome: foggy grays and whites, deep-blue nighttime layers.',
        ],
      },
      {
        title: '3. Saturation restraint — less is more',
        paragraphs: [
          'Many people\'s first post-processing move is cranking saturation, assuming "more vivid = more beautiful." But over-saturation kills subtlety and looks wildly different across devices — what seems "just right" on a calibrated monitor may be eye-scorching on a phone.',
          'Professionals often lower overall saturation while selectively boosting specific colors — this is "selective color emphasis." For portraits, you might desaturate the background while keeping warm skin tones and vivid lip color.',
          'A good rule of thumb: if more than three colors in the frame are highly saturated simultaneously, something probably needs to be dialed back. Let 1–2 hero colors pop; let the rest recede.',
        ],
      },
      {
        title: '4. Tone-mood matching',
        paragraphs: [
          'Warm tones (yellow, orange, red) naturally convey closeness, energy, and intimacy. Cool tones (blue, green, purple) convey calm, mystery, and distance. This isn\'t aesthetic preference — it\'s basic human visual psychology.',
          'Many photos feel "off" not because of a technical color problem but because the tone clashes with the content\'s emotion. A cozy family portrait graded cold-blue, or a lonely nightscape pushed warm-yellow — technically fine, emotionally discordant.',
          'Before grading in post, ask yourself one question: "What emotion should this image convey?" Then choose the tonal direction that matches. This is more effective than blindly applying preset filters.',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[5],
    title: 'Street photography × AI critique: a complete shoot-review-improve workflow',
    description: 'Street photography progress depends on fast iteration, yet most shooters lack a systematic review process. This article provides a full workflow combining AI critique.',
    excerpt:
      'Street photography looks intuition-driven, but lasting improvement comes from systems. Use AI critique for a quick post-walk debrief and turn chance encounters into deliberate practice.',
    category: 'Field',
    readingTime: '6 min read',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['street photography', 'street photo tips', 'AI photography workflow', 'photo review process', 'street photography improvement'],
    intro:
      'The thrill of street photography lies in its unpredictability — you never know what\'s around the next corner. But that very unpredictability makes improvement slow: it\'s hard to tell whether you got better or just found a better scene today. This article builds a systematic workflow around AI critique to shift from "luck mode" to "deliberate practice mode."',
    takeawayTitle: 'Street workflow essentials',
    takeawayItems: [
      'Don\'t wait to get home — spend 15 minutes on initial culling while the walk is still fresh.',
      'Select only 3–5 representative frames per session; don\'t batch-upload everything.',
      'Focus on composition and impact — these two dimensions separate street shooters the most.',
      'Build a "same-scene comparison" habit: shoot one scene multiple ways and compare scores.',
    ],
    sections: [
      {
        title: '1. Before heading out: carry last session\'s issues',
        paragraphs: [
          'Open your previous critique log and revisit the lowest-scoring dimension and the specific issues flagged. Write the 1–2 most critical items in your phone notes.',
          'For instance, if last time\'s feedback was "background too cluttered," today\'s walk should intentionally hunt for clean-background opportunities — solid-color walls, under-bridge shadow zones, telephoto-compressed backdrops. Going out with a concrete problem in mind is fundamentally different from aimless shooting.',
        ],
      },
      {
        title: '2. While shooting: anticipate light and scene',
        paragraphs: [
          'Street photography is not random shutter-pressing. Experienced street shooters "anticipate" good positions and light, then wait for the right person and moment to arrive. This is "fishing-style" shooting — you pick your spot first and wait for the catch.',
          'Find a location with directional light, a clean background, and potential leading lines, then stand there and wait. Wait for someone to walk through a beam of light, for an interesting gesture, for a story-worthy moment. This is more efficient than running around with the camera, and composition stability improves dramatically.',
          'Every shooting decision is part of the training: Why this position and not that one? Why this focal length? Why this exact fraction of a second? The answers form your shooting intuition, and AI critique can validate whether that intuition is correct.',
        ],
      },
      {
        title: '3. After the walk: 15-minute quick debrief',
        paragraphs: [
          'After finishing the walk, sit down in a café and do a quick cull while memory is fresh. From all of today\'s photos, pick 3–5 of the most representative and upload them to PicSpeak.',
          'Selection criteria: not the "best" images, but the most "representative" ones — including your strongest frame, one you\'re uncertain about, and one that feels close but not quite there. This mix gives AI critique the most valuable comparison material.',
        ],
        bullets: [
          'Best 1 image: validate your own judgment; see if the AI agrees.',
          '1–2 uncertain images: let the AI reveal what you might have missed.',
          '1 "almost there" image: identify exactly what\'s missing — often the biggest learning moment.',
        ],
      },
      {
        title: '4. Analyzing results: build your weakness profile',
        paragraphs: [
          'Log each critique session simply: date, genre, per-dimension scores, main issues. After a month, clear patterns emerge — perhaps your composition consistently scores 7+ while lighting is stuck at 5–6, meaning your next phase should focus on lighting rather than grinding more composition work.',
          'This "weakness profile" is one of the most valuable self-improvement tools available. Professional athletes have coaching teams for data analysis and weakness identification; AI critique + simple logging can give you a similar system for photography.',
        ],
      },
      {
        title: '5. Advanced: same-scene A/B comparison',
        paragraphs: [
          'Once you find a promising scene, try shooting it multiple ways — different focal lengths, angles, timing, and exposures. Then upload several versions together and compare which approach scores higher.',
          'This A/B-testing style of practice rapidly teaches you why one angle works better than another, or why waiting for that person to step into the light matters more than shooting too early. It is one of the most efficient photography training methods available.',
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// JA
// ---------------------------------------------------------------------------

const JA_POSTS: BlogPost[] = [
  {
    slug: BLOG_SLUGS[0],
    title: 'AI写真講評は「失敗した時だけ」より日常練習に向いている',
    description: 'AI写真講評が単発の救済策ではなく、日々の練習ループとして役立つ理由を、トレーニング心理学と写真上達の観点から整理します。',
    excerpt:
      '差がつくのは安定した撮影後レビューです。AI講評を日常に入れると、構図や光の癖が早く見えてきます。繰り返し現れるパターンこそ、次に練習すべきテーマです。',
    category: 'AI講評',
    readingTime: '約5分',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['AI写真講評', '撮影後レビュー', '写真練習', '意図的な練習', '写真上達法'],
    intro:
      '講評を「問題が起きた後の修正」としてだけ使うと、価値の大半を取り逃がします。本当に難しいのは、同じ弱点を何週間も繰り返してしまうことです。この記事ではトレーニング心理学の視点から、日常的な講評がなぜ効果的かを解説します。',
    takeawayTitle: 'この記事の要点',
    takeawayItems: [
      '高頻度のレビューの方が安定した成長につながる。',
      '評価は行動に変換できて初めて意味がある。',
      '繰り返す問題は無視せず、次回の練習テーマにするべき。',
      '1回の練習で改善ポイントは1〜2個に絞る。',
    ],
    sections: [
      {
        title: '1. AI講評は繰り返す癖を見つけやすい',
        paragraphs: [
          '一枚だけでは目立たない問題でも、数日分を並べると同じ弱点が見えてきます。主題が散る、端がうるさい、逆光でハイライトを失う、といった癖です。',
          'AI講評の価値は、その繰り返しを早く知らせてくれることにあります。人間のメンターが提供しにくい「パターンの継続追跡」をAIは得意としています——あなたが共有した数枚だけでなく、ライブラリ全体のパターンを見てくれるのです。',
          'つまりAI講評のコアの優位性は「人間より賢い」ではなく、「人間より忍耐力がある」ことです。毎回同じ5次元を必ずチェックし、「前回言ったからスキップ」ということがありません。',
        ],
      },
      {
        title: '2. 日常練習は短い閉ループで十分',
        paragraphs: [
          '撮影後に10分だけ使い、代表的な1〜3枚を講評し、結果を次回撮影前の1〜2項目に圧縮します。このループが短く、頻繁であるほど、成長は安定します。',
          '多くの学習者の本当の問題は知識不足ではなく、フィードバック頻度の低さです。構図のチュートリアルを100本読んでも、2ヶ月で5回しか撮影せず、前回の結果と比較しなければ、知識は内面化されません。',
        ],
        bullets: [
          '似た失敗を全部入れず、代表作だけを見る——選ぶこと自体がトレーニングです。',
          '次回の修正項目は1〜2個に絞り、記憶のオーバーロードを防ぐ。',
          '次の撮影では新しい目標を追う前に、前回の問題が減ったかを確認する。',
        ],
      },
      {
        title: '3.「知る」から「できる」へ——意図的な練習の視点',
        paragraphs: [
          'スポーツ科学には「意図的な練習（deliberate practice）」という概念があります。すでにできることを繰り返すのではなく、ぎりぎりできない領域を繰り返し挑戦します。AI講評はこの領域を正確に特定してくれます——常に最もスコアが低い次元が、今最も練習すべき方向です。',
          'たとえば「構図」が3週間ずっと6点前後で「色彩」がすでに8点なら、次の練習フェーズは構図に集中すべきで、色調補正を続ける必要はありません。この精密なターゲティングが上達サイクルを大幅に短縮します。',
        ],
      },
      {
        title: '4. 日常講評ルーティンの作り方',
        paragraphs: [
          'ステップ1：撮影終了直後、取り込みと同時にカリングを始める。「あとで時間がある時に」は避ける——その頃には現場の判断を忘れています。',
          'ステップ2：最も代表的な1〜3枚を選んでアップロード。同じシーンを撮った場合、ベスト1枚とワースト1枚の比較が最も価値があります。',
          'ステップ3：講評を見た後、一文を書く——「次の撮影では______に注意する」。この一文が次の練習目標になります。',
        ],
        bullets: [
          'ツール：スマホのメモ、Notion、紙のノートでもOK。大事なのは継続。',
          '頻度：週2〜3回以上を推奨。スマホで撮った日常写真も対象にできます。',
          '月次レビュー：15分かけて過去の講評を振り返り、進歩の傾向を確認。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[1],
    title: '構図が少し物足りない時に先に確認したい5つのポイント',
    description: '主題、端、奥行き、バランス、視線の流れという5つの構図チェックを整理します。現場でも後処理でも使える実践チェックリスト付き。',
    excerpt:
      '「悪くはないけれど決まりきらない」写真は、理論不足より最終確認不足であることが多いです。この記事は5ステップの実行可能なチェックリストを提供します。',
    category: '構図',
    readingTime: '約6分',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['構図', '写真構図', '主題', '視線誘導', '構図チェックリスト', 'エッジ処理'],
    intro:
      '三分割やリーディングラインを知っていても、現場では確認順がないために完成度を落としてしまうことがあります。この記事は構図理論のおさらいではなく、現場・後処理・講評時に使える5ステップの実践チェックフローです。',
    takeawayTitle: '先に覚えたい5つ',
    takeawayItems: [
      '主題は一目で分かるか——面積、明暗、色の優位性を確認。',
      '端や角にノイズはないか——電線、半切れの頭、高彩度の破片。',
      '奥行きは見えるか——前景、中景、背景の少なくとも2レイヤー。',
      '視覚重量は釣り合っているか——左右・上下の明暗と面積の分布。',
      '視線は主題へ流れているか——導線、トーン対比、色のフォーカス。',
    ],
    sections: [
      {
        title: '1. 主題の明確さ：一目で伝わるか',
        paragraphs: [
          '見る人が主題をすぐ理解できないなら、主題は弱すぎます。サイズ、明るさ、色、シャープさのどれかで、画面内の他の要素に対して明確な優位を作る必要があります。',
          'よくある誤解：「主題が中央にあるから十分明確」。しかし中央の主題が背景と明るさや色の差が少なければ、埋もれます。対比を使ってみてください：主題を周囲より1段明るくする、彩度を少し上げる、被写界深度で背景をボカす、など。',
          '実用テスト：写真をスマホのサムネイルサイズに縮小し、そのスケールでも主題が分かれば十分明確です。',
        ],
      },
      {
        title: '2. 端の確認：問題は中央より外にある',
        paragraphs: [
          '多くの写真で問題となるのは中央ではなく端です。看板や明るい破片のようなノイズは、簡単に視線を奪います。撮影時は主題に集中するため、フレームの端を見落としがちです。',
          '解決法はシンプル：シャッターを押す前に2秒かけて四辺と四隅をスキャンしてください。不要な要素があれば、移動するかズームして切り取ります。',
          'トリミングは最後の手段です。比率が変わり主題の位置に影響するため、現場で端を処理する習慣の方がずっと効率的です。',
        ],
        bullets: [
          '四隅を確認する：注意が最も漏れやすい場所。',
          '半端な物体：完全に入れるか完全に切るかの二択。',
          '明るい色の罠：端の白や高彩度のパッチは主題から視線を逸らします。',
        ],
      },
      {
        title: '3. 奥行き感：フレームを立体にする',
        paragraphs: [
          '前景や空間関係がなければ、写真は平面的に見えます。シンプルな前景要素——地面の質感、一本の線、落ち葉一枚——でも奥行きを加えられます。',
          '奥行きには大きな前景は必須ではありません。ストリートやポートレートでは、ボケによる空間の分離も有効です。画面に「奥へ引き込まれる」力を持たせることがポイントです。',
        ],
        bullets: [
          '風景：前景のアンカーを探す（岩、花、水面の反射）。',
          'ストリート：フレーミング要素（ドア枠、窓、トンネル）でレイヤーを作る。',
          'ポートレート：主題と背景の距離を制御し、ボケで分離する。',
        ],
      },
      {
        title: '4. 視覚的バランス：重さの釣り合い',
        paragraphs: [
          '視覚重量が偏ると、主題の位置が正しくても別の明るい領域や高彩度のエリアに注意が奪われます。視覚重量は明るさ、彩度、面積、テクスチャの複雑さに依存します。',
          '「バランス」は対称を意味しません——三分割法自体が非対称です。しかし重い側にはフレームを安定させるための対照要素が必要です。なければ画面が傾いて見えます。',
        ],
      },
      {
        title: '5. 視覚の動線：見る人の目を誘導する',
        paragraphs: [
          '明示的な導線（道路、手すり、建築の線）あるいは暗示的な導線（明暗のグラデーション、色の遷移、人物の視線方向）があるか確認しましょう。視線が画面内で彷徨い続けるなら、有効な視覚動線が不足しています。',
          '実用エクササイズ：この写真を初めて見るつもりで、目が最初にどこに着地するか想像してください。そこから視線を追い、最終的に主題に到達するかを確かめます。視線がぐるぐる回って着地点がなければ、導線の改善が必要です。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[2],
    title: '写真フィードバックを次の撮影チェックリストに変える方法',
    description: '抽象的なフィードバックを、次回の撮影で使える短いチェックリストへ変換する方法論とジャンル別テンプレート。',
    excerpt:
      'フィードバックを理解することと、実際に直せることは別です。短いチェックリストに変えると、講評は練習材料になります。',
    category: 'ワークフロー',
    readingTime: '約5分',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['写真フィードバック', '撮影チェックリスト', '写真ワークフロー', '講評を行動に'],
    intro:
      '「問題は分かった」で止まる学習は多いですが、次の撮影で何をするかに変換して初めて変化が出ます。この記事では抽象的な講評を現場の行動に変換する方法論と、ジャンル別のチェックリストテンプレートを提供します。',
    takeawayTitle: '行動に変える原則',
    takeawayItems: [
      '抽象語を現場の行動に置き換える——「散らかっている」は行動ではなく「端の看板を切る」が行動。',
      'チェックリストは短いほど実行しやすい——1回3項目まで。',
      '一枚のリストは一つの撮影テーマに合わせる。',
      '撮影後に前回のリストが実行できたか検証する。',
    ],
    sections: [
      {
        title: '1. 抽象語を行動に翻訳する',
        paragraphs: [
          '「ごちゃついている」は行動ではありません。「端の看板を切る」は行動です。フィードバックは現場で実行できる言葉に言い換える必要があります。',
          '多くのAI講評や人間メンターのフィードバックは記述的です——「何が」問題かは伝えますが「どうするか」は直接教えてくれません。翻訳のカギは、記述的なフィードバックを現場で実行可能な具体的操作に変換することです。',
        ],
        bullets: [
          '「散らかっている」→ 背景を事前に確認し、移動して障害物を避けるか、長い焦点距離で背景を圧縮する。',
          '「露出が不正確」→ ハイライト基準で測光するか、ハイライト警告を有効にする。',
          '「色が平坦」→ ゴールデンアワーやブルーアワーに撮影するか、後処理で局所コントラストを追加。',
          '「主題が目立たない」→ より大きな絞り、前景/背景の分離、色のコントラストで主題を強調。',
        ],
      },
      {
        title: '2. 短いリストで閉ループを作る',
        paragraphs: [
          '前回のレビューを3項目以内に圧縮し、出発前に確認し、撮影後に本当に使えたかを見直します。これで講評が練習システムになります。',
          'なぜ3項目以内か？現場では光、シーン、被写体、構図、カメラ設定を同時に処理しています。ワーキングメモリには限界があり、10項目のリストを持ち出しても1つも覚えていない可能性が高いです。',
        ],
      },
      {
        title: '3. ジャンル別チェックリストテンプレート',
        paragraphs: [
          'ジャンルによって優先事項は大きく異なります。以下のテンプレートをベースに、自分の弱点に合わせてカスタマイズしてください。',
        ],
        bullets: [
          'ストリート：① 背景整理 ② 主従関係の明確化 ③ 決定的瞬間のタイミング。',
          '人物：① キャッチライトと顔の受光方向 ② 主題と背景の分離 ③ ポーズと表情の誘導。',
          '風景：① 前景構成 ② 撮影時間帯（ゴールデン/ブルーアワー） ③ 空と地面の比率。',
          '料理：① 光の角度（トップまたはサイド） ② 小道具は料理より目立たせない ③ 温かみある食欲をそそる色彩。',
          '建築：① パースペクティブ補正と垂直線 ② 光が建築の形状を強調 ③ 周囲の環境をシンプルに。',
        ],
      },
      {
        title: '4. 実例：完全なフィードバック閉ループの実践',
        paragraphs: [
          '最後のストリート撮影で「構図6/10。主な問題：背景が散らかっていて主題が環境に埋もれている」というフィードバックを受けたとします。翻訳後のチェックリスト：① 次回はシンプルな背景（単色の壁、空）を選ぶ ② 50mm以上で背景を圧縮 ③ 主題がきれいなゾーンを通過する瞬間に撮る。',
          '次の撮影でこの3項目を持参し、撮影後に新しい結果をアップロードして改善を確認します。構図が7.5以上に上がれば方向は正しく、変わらなければ戦略を見直します。',
          'この「フィードバック → 翻訳 → 実行 → 検証」のサイクルが、AI講評を本当のトレーニングシステムに変えるカギです。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[3],
    title: 'AIが最もよく検出する5つの光の間違い——現場で避ける方法',
    description: '逆光白飛び、色温度の混在、潰れた影、真上からの硬い光、方向感のないフラットな光——AI講評で最も頻繁に指摘される5つの光の問題。',
    excerpt:
      '光は写真で最も過小評価される要素です。多くの人が構図に注力しながら、光を「運次第」と扱っています。この記事ではAI講評が最もよく指摘する5つの光の問題と現場での対策を整理します。',
    category: '光',
    readingTime: '約6分',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['写真の光', '光の間違い', 'AI写真分析', '露出制御', '色温度', '自然光撮影'],
    intro:
      'PicSpeakの5つの採点次元の中で、「光」はユーザーの平均スコアが最も低い項目です。光が最も難しいからではなく、多くの人が構図と主題に集中し、光を「コントロールできないもの」扱いしているからです。しかし実際は、撮影時間・位置・角度の調整だけで光は十分にコントロールできます。',
    takeawayTitle: '避けるべき5つの光の問題',
    takeawayItems: [
      '逆光白飛び：被写体がシルエットになるか顔が真っ黒に。',
      '色温度の混在：日光と室内光が混ざり不自然な色被りが発生。',
      '潰れた影：暗部が純黒になりテクスチャやディテールが失われる。',
      '真上からの硬い影：正午の太陽が眼窩や鼻の下に濃い影を落とす。',
      '方向感のないフラットな光：光源が不明確で画面が平坦で立体感がない。',
    ],
    sections: [
      {
        title: '1. 逆光白飛び',
        paragraphs: [
          '逆光自体は問題ではありません——美しいフレアや雰囲気感を生み出せます。問題は露出制御です。カメラが強い光源に向かって測光すると大幅にアンダーになり、被写体が黒いシルエットになります。',
          '対策：被写体のディテールを残したい場合、スポット測光で被写体の顔やミッドトーンに合わせ、背景のオーバーは許容します。フラッシュやレフ板があれば正面から補光。スマホでは被写体を長押しでAE/AFロックし、露出を手動で上げます。',
        ],
        bullets: [
          '補光ツールがなければ、被写体を光源の方へ45°回転させ、散乱光で顔を照らす。',
          '建物や大きな明るい面を天然レフ板として利用。',
          'シルエットが意図なら思い切って——被写体を完全な黒に、背景をクリーンに。中途半端はNG。',
        ],
      },
      {
        title: '2. 色温度の混在',
        paragraphs: [
          '暖かい室内光と冷たい日光が同じフレームに現れると、ホワイトバランスをどちらに合わせても一部が色被りします。カフェ、ショッピングモール、室内イベントで非常に多い問題です。',
          '最も効果的なのは単一光源が支配的なポジションを選ぶことです——窓際で自然光を使うか、窓から離れて照明だけに頼るか。避けられない場合は後処理で部分的な色温度補正をするか、いっそモノクロに変換して色温度問題を回避します。',
        ],
      },
      {
        title: '3. 潰れた影',
        paragraphs: [
          'シーンのダイナミックレンジ（ハイライトとシャドウの明るさの差）がカメラの能力を超えると、暗部が純黒になります。強い光と深い影が共存する場面で最も起きやすいです。',
          '撮影時にシャドウ部分にまだテクスチャが見えるか注意します。コントラストが大きすぎる場合はブラケット撮影でHDR合成するか、ハーフNDフィルターで明暗のバランスを取ります。スマホのHDRモードもこうした場面で有効です。',
        ],
      },
      {
        title: '4. 真上からの硬い影',
        paragraphs: [
          '正午の太陽は真上から降り注ぎ、眼窩・鼻の下・顎に濃い黒い影を作ります。いわゆる「アライグマの目」。屋外ポートレートで最も多い光の問題です。',
          '最も簡単な対策はタイミング——午前10時前か午後3時以降に撮影します。どうしても正午に撮る場合は、木陰か建物の影に入り、散乱光による均一でソフトな顔の光を利用してください。モデルに少し上を向かせて地面の反射光で顔の影を埋めるテクニックもあります。',
        ],
      },
      {
        title: '5. 方向感のないフラットな光',
        paragraphs: [
          '光が「悪くはない」が「良くもない」写真があります——明らかな過剰露出や不足はないのに、全体として平坦で生気がない。通常これは光に方向性がないためです。',
          '自然光で方向感を出すにはサイドライトを探します——被写体の横から光が当たり、反対側に影ができることで立体感が生まれます。窓の光は最高の自然サイドライト源の一つです。',
          '地面の影の方向と長さを観察しましょう。短く薄い影は光に方向性がないことを示します（曇りや正午に多い）——柔らかなハイキー表現には適しますが、立体感を追求する場面には不向きです。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[4],
    title: '写真の色がイマイチなのはなぜ？色彩の4つのコア原則',
    description: '色温度の一貫性、色の関係性、彩度の抑制、トーンと感情のマッチング——写真の色を「まあまあ」から「印象的」に引き上げる4つのキー。',
    excerpt:
      '色は後処理だけの問題ではありません。ホワイトバランスの選択から被写体の服装や背景の色まで、写真の色の質はシャッターを切る前に大部分が決まっています。',
    category: '色彩',
    readingTime: '約7分',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['写真の色彩', 'カラーグレーディング', '色温度', 'カラーパレット', 'AI色彩スコア'],
    intro:
      'PicSpeakの5つの次元のうち、色彩と光は最も見落とされがちです。多くの人が色を後処理の問題として扱い「フィルターをかければいい」と考えます。しかし実際は写真の色の質はシャッターを切る前に大半が決まります。この記事では実践的な写真の観点から、4つの核心的な色彩原則を解説します。',
    takeawayTitle: '色彩の4つのコア原則',
    takeawayItems: [
      '色温度の一貫性：フレーム内のすべての要素が統一された、あるいは意図的に対比した色温度を持つべき。',
      '色の関係性：補色は緊張感、類似色は調和、モノクロは雰囲気を生む。',
      '彩度の抑制：高彩度 ≠ 良い色彩。過飽和は安っぽく見える。',
      'トーンと感情のマッチング：暖色は温かさとエネルギー、寒色は静けさと距離感を伝える。',
    ],
    sections: [
      {
        title: '1. 色温度の一貫性——統一は調和',
        paragraphs: [
          '色温度の混乱は写真が「素人っぽく」見える最も一般的な原因の一つです。暖色の室内光（黄み）と冷色の日光（青み）が同じフレームに共存すると、ホワイトバランスをどちらに合わせても片方が不自然になります。',
          '撮影段階で色温度の統一性に注意すれば、後処理の修正作業を大幅に減らせます。環境光源をコントロールできない場合は、一方の色温度を基準にし、もう一方をフレーム内の「異質」にします——意図的な色温度対比はデザイン要素になりますが、無意識の混合は濁りにしかなりません。',
        ],
      },
      {
        title: '2. 色の関係性——補色、類似色、モノクロ',
        paragraphs: [
          '色の関係性とは、フレーム内の異なる色の組み合わせロジックです。最もよく使われる3つは：補色（色環の対極、例：青+オレンジ）、類似色（隣接する色、例：黄+緑+ティール）、モノクロ（同一色相の異なる明度と彩度）。',
          '補色は最も強い視覚的緊張感を生みます——映画ポスターで頻出のティールとオレンジの配色を思い出してください。類似色はより穏やかで調和的、ソフトな美学に最適。モノクロは最も強い雰囲気感と統一性を生み、モノクロ写真は究極のモノクロームです。',
          '実際の撮影では、背景の選択、モデルの服装の色の指定、特定の撮影環境の選択で色の関係性をコントロールできます。',
        ],
        bullets: [
          '補色の例：ゴールデンアワーの暖色 + 青空、赤い人物 + 緑の植物の背景。',
          '類似色の例：秋の赤-黄-オレンジのグラデーション、春のピンク-白-緑の組み合わせ。',
          'モノクロの例：霧の日のグレーと白のシリーズ、夜のディープブルーのレイヤー。',
        ],
      },
      {
        title: '3. 彩度の抑制——少ないほど良い',
        paragraphs: [
          '多くの人が後処理で最初にやるのが彩度を上げること、「色が鮮やかなほど美しい」と信じています。しかし過飽和は繊細さを殺し、デバイス間で表示差が大きくなります。色校正済みモニターで「ちょうどいい」と感じる彩度が、スマホ画面では目に刺さることがあります。',
          'プロは全体の彩度を下げながら特定の色を選択的に強調します——「選択的カラーエンファシス」です。例えばポートレートでは背景の彩度を抑えつつ、肌の温かみとリップの鮮やかさを維持します。',
          '目安：フレーム内で3色以上が同時に高度に飽和していたら、どれかを抑える必要があります。主役の1〜2色を際立たせ、残りは支え役に引き下げましょう。',
        ],
      },
      {
        title: '4. トーンと感情のマッチング',
        paragraphs: [
          '暖色系（黄・オレンジ・赤）は自然に温かさ、活力、親密さを伝え、寒色系（青・緑・紫）は静けさ、神秘感、距離感を伝えます。これは美的な好みではなく、人間の視覚心理の基本法則です。',
          '多くの写真の色が「何か違う」と感じるのは技術的な問題ではなく、トーンと内容の感情がミスマッチしているからです。温かい家族写真を冷たいブルーに仕上げたり、孤独な夜景を暖かいイエローにしたり——技術的には問題なくても、感情的に違和感があります。',
          '後処理の前に自分に一つ質問してください：「この写真でどんな感情を伝えたいか？」そしてそれに合ったトーンを選びます。プリセットフィルターを盲目的に適用するより効果的です。',
        ],
      },
    ],
  },
  {
    slug: BLOG_SLUGS[5],
    title: 'ストリート写真 × AI講評：撮影-レビュー-改善の完全ワークフロー',
    description: 'ストリート写真の上達は高速イテレーションに依存しますが、体系的な撮影後レビューをしている人は少数です。AI講評を組み合わせた完全ワークフローを提供します。',
    excerpt:
      'ストリート写真は直感に見えますが、持続的な上達にはシステムが必要です。AI講評で散歩後の短いデブリーフィングを行い、偶然の出会いを意図的な練習に変えましょう。',
    category: '実践',
    readingTime: '約6分',
    publishedAt: SHARED_PUBLISHED_AT,
    updatedAt: SHARED_UPDATED_AT,
    keywords: ['ストリート写真', 'スナップ撮影', 'AI写真ワークフロー', '撮影レビュー', 'ストリート写真上達'],
    intro:
      'ストリート写真の魅力は予測不能性にあります——次の角で何が待っているか分かりません。しかしまさにその不確定さが上達を遅くします。自分の腕が上がったのか、それとも今日のシーンが良かっただけなのか判断が難しいからです。この記事ではAI講評を軸にした体系的ワークフローを構築し、「運任せモード」から「意図的な練習モード」への切り替えをサポートします。',
    takeawayTitle: 'ストリートワークフローの核心',
    takeawayItems: [
      '家に帰ってからではなく、散歩の直後に15分かけて初回セレクションを行う。',
      '毎回3〜5枚の代表カットだけをアップロードし、一括投入しない。',
      '構図とインパクトに集中する——この2つがストリート写真で最も差がつく次元。',
      '「同じシーンの比較」を習慣にする：1つのシーンを複数の方法で撮影しスコアを比較。',
    ],
    sections: [
      {
        title: '1. 出発前：前回の課題を持って出る',
        paragraphs: [
          '前回の講評ログを開き、最もスコアが低かった次元と指摘された具体的な問題を確認します。最も重要な1〜2項目をスマホのメモに書きます。',
          '例えば前回のフィードバックが「背景が散らかっている」なら、今日は意識的にクリーンな背景のシーンを探します——単色の壁、高架下の光と影のゾーン、望遠で圧縮した純色の背景。具体的な課題を持って出かけることと、目的なく撮ることは根本的に異なります。',
        ],
      },
      {
        title: '2. 撮影中：光とシーンを先読みする',
        paragraphs: [
          'ストリート写真はランダムなシャッター押しではありません。経験豊富なストリートフォトグラファーは良いポジションと光を「先読み」し、適切な人物と瞬間の到来を待ちます。これは「フィッシング式」撮影——まずポイントを選び、獲物を待つ方式です。',
          '方向性のある光、クリーンな背景、潜在的なリーディングラインがある場所を見つけ、そこに立って待ちます。光の筋を人が横切るのを、面白いジェスチャーを、物語性のある瞬間を待ちます。カメラを持って走り回るより効率的で、構図の安定性も格段に向上します。',
          'すべての撮影判断がトレーニングの一部です：なぜこの位置でなくあの位置？なぜこの焦点距離？なぜこの瞬間にシャッターを？これらの答えがあなたの撮影直感であり、AI講評がその直感の正しさを検証してくれます。',
        ],
      },
      {
        title: '3. 撮影後：15分のクイックデブリーフィング',
        paragraphs: [
          '散歩を終えたら、記憶が新鮮なうちにカフェに座りクイックセレクションをします。今日のすべての写真から最も代表的な3〜5枚を選びPicSpeakにアップロードします。',
          '選択基準は「最高の」ではなく「最も代表的な」——自分のベストショット、迷っている1〜2枚、惜しいけど何かが足りない1枚を含めます。この混合セレクションがAI講評に最も価値ある比較材料を提供します。',
        ],
        bullets: [
          'ベスト1枚：自分の判断を検証——AIも同意するか確認。',
          '迷い1〜2枚：自分が見逃したものをAIに見てもらう。',
          '惜しい1枚：具体的に何が不足かを特定——最大の学びポイントになることが多い。',
        ],
      },
      {
        title: '4. 結果分析：弱点プロファイルを作る',
        paragraphs: [
          '毎回の講評結果をシンプルに記録します：日付、ジャンル、各次元のスコア、主な問題。1ヶ月後には明確なパターンが見えます——構図は常に7以上だが光が5〜6で停滞しているなら、次のフェーズは構図をさらに磨くのではなく光に集中すべきです。',
          'この「弱点プロファイル」は最も価値ある自己改善ツールの一つです。プロのアスリートにはデータ分析と弱点特定のためのコーチングチームがいますが、AI講評 + シンプルなログ記録で写真においても似たシステムを構築できます。',
        ],
      },
      {
        title: '5. 上級テクニック：同じシーンのA/B比較',
        paragraphs: [
          '可能性のあるシーンを見つけたら、同じシーンを複数の方法で撮影してみてください——異なる焦点距離、角度、タイミング、露出で。複数のバージョンをまとめてアップロードし、どのアプローチのスコアが高いか比較します。',
          'このA/Bテスト方式の練習は、「なぜこの角度がそちらより良いのか」「なぜあの人が光の中に入ってから撮った方がインパクトがあるのか」を素早く理解させてくれます。最も効率的な写真トレーニング方法の一つです。',
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// UI Copy
// ---------------------------------------------------------------------------

const ZH_UI: BlogUiCopy = {
  name: '镜头手记',
  label: 'Lens Notes',
  navLabel: '镜头手记',
  footerLabel: '镜头手记',
  homeLabel: '镜头手记',
  homeHint: 'AI 摄影点评、构图和拍后复盘文章',
  title: '镜头手记 Lens Notes | PicSpeak 摄影点评 Blog',
  description: '围绕 AI 摄影点评、构图、拍后复盘和照片反馈的 PicSpeak 内容板块。',
  keywords: ['AI 摄影点评', '照片点评', '摄影博客', '摄影构图技巧', '照片反馈', '摄影光线', '摄影色彩'],
  introPrimary:
    '这里不是产品更新日志，而是围绕 AI 摄影点评、照片构图、光线控制、色彩原则、拍后复盘和摄影练习流程持续更新的内容板块。',
  introSecondary:
    '内容覆盖日常点评训练、构图差一点时先查什么、光线的常见错误、色彩的核心原则，以及如何把反馈转成下一次拍摄清单。',
  starterPostsLabel: 'Starter posts',
  primaryTopicsLabel: 'Primary topics',
  seoDirectionLabel: 'SEO direction',
  primaryTopicsText: '点评 workflow、构图修正、光线控制、色彩原则、拍摄复盘',
  seoDirectionText: 'AI photo critique / composition / lighting / color / workflow',
  startTitle: '从这里开始',
  startIntro: '如果你是第一次进入这个板块，先从下面几篇内容开始，会比随机翻技巧更高效。',
  featuredLabel: 'Featured Article',
  allPostsLabel: 'All Posts',
  allPostsHeading: '全部文章',
  readFeaturedCta: '先看这篇',
  readMoreCta: '阅读全文',
  backToBlog: '返回 镜头手记',
  nextStepLabel: 'Next Step',
  nextStepTitle: '把这篇里的建议带回下一次拍摄',
  nextStepBody: '回到 PicSpeak 工作台上传一张照片，用新的点评结果验证这些检查项是否真的改善了你的画面。',
  nextStepCta: '去试一张照片',
  moreArticlesCta: '继续看更多文章',
  relatedLabel: 'Related',
  relatedHeading: '继续阅读',
};

const EN_UI: BlogUiCopy = {
  name: 'Lens Notes',
  label: 'Lens Notes',
  navLabel: 'Blog',
  footerLabel: 'Blog',
  homeLabel: 'Lens Notes',
  homeHint: 'AI critique guides, composition tips, and post-shoot workflows',
  title: 'Lens Notes | PicSpeak Photography Blog',
  description: 'PicSpeak\'s content hub for AI photo critique, composition tips, lighting guides, color theory, and shooting review workflows.',
  keywords: ['AI photo critique blog', 'photo composition tips', 'photography feedback', 'photo review workflow', 'photography lighting', 'photo color theory'],
  introPrimary:
    'This is not a product changelog. It is PicSpeak\'s content hub for AI photo critique, composition, lighting, color principles, post-shoot review, and repeatable photography practice.',
  introSecondary:
    'Articles cover daily critique practice, common composition checks, lighting mistakes, core color principles, and how to turn feedback into a shooting checklist.',
  starterPostsLabel: 'Starter posts',
  primaryTopicsLabel: 'Primary topics',
  seoDirectionLabel: 'SEO direction',
  primaryTopicsText: 'critique workflow, composition fixes, lighting, color, shooting review',
  seoDirectionText: 'AI photo critique / composition / lighting / color / workflow',
  startTitle: 'Start here',
  startIntro: 'If this is your first visit, start with these articles. They are built to be searchable and immediately useful in the field.',
  featuredLabel: 'Featured Article',
  allPostsLabel: 'All Posts',
  allPostsHeading: 'All articles',
  readFeaturedCta: 'Read this first',
  readMoreCta: 'Read article',
  backToBlog: 'Back to Lens Notes',
  nextStepLabel: 'Next Step',
  nextStepTitle: 'Take these ideas into your next shoot',
  nextStepBody: 'Return to the PicSpeak workspace, upload a real frame, and use the critique result to see whether these checks improved the image.',
  nextStepCta: 'Try a photo',
  moreArticlesCta: 'Read more articles',
  relatedLabel: 'Related',
  relatedHeading: 'Keep reading',
};

const JA_UI: BlogUiCopy = {
  name: 'レンズノート',
  label: 'Lens Notes',
  navLabel: 'ブログ',
  footerLabel: 'ブログ',
  homeLabel: 'レンズノート',
  homeHint: 'AI写真講評、構図、撮影後レビューの記事',
  title: 'レンズノート | PicSpeak 写真ブログ',
  description: 'AI写真講評、構図改善、光の使い方、色彩理論、撮影後レビュー、写真フィードバックを扱う PicSpeak のコンテンツハブ。',
  keywords: ['AI写真講評', '写真フィードバック', '写真ブログ', '構図のコツ', '写真の光', '写真色彩'],
  introPrimary:
    'ここは製品アップデート一覧ではなく、AI写真講評、構図、光、色彩、撮影後レビュー、反復練習のための記事をまとめたコンテンツハブです。',
  introSecondary:
    '日常的な講評練習、構図チェック、よくある光の間違い、色彩の核心原則、フィードバックを撮影チェックリストに変える方法を扱います。',
  starterPostsLabel: 'Starter posts',
  primaryTopicsLabel: 'Primary topics',
  seoDirectionLabel: 'SEO direction',
  primaryTopicsText: '講評ワークフロー、構図修正、光、色彩、撮影レビュー',
  seoDirectionText: 'AI photo critique / composition / lighting / color / workflow',
  startTitle: 'ここから読む',
  startIntro: '初めて見るなら、まず下の数本から始めると効率よく全体像をつかめます。',
  featuredLabel: 'Featured Article',
  allPostsLabel: 'All Posts',
  allPostsHeading: 'すべての記事',
  readFeaturedCta: 'まずこの1本',
  readMoreCta: '続きを読む',
  backToBlog: 'レンズノートに戻る',
  nextStepLabel: 'Next Step',
  nextStepTitle: '次の撮影でこの記事を試す',
  nextStepBody: 'PicSpeak のワークスペースに戻って1枚アップロードし、今回のチェック項目が本当に効いたかを講評で確かめてください。',
  nextStepCta: '写真を試す',
  moreArticlesCta: 'ほかの記事を見る',
  relatedLabel: 'Related',
  relatedHeading: '続けて読む',
};

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

const BLOG_BUNDLES: Record<Locale, BlogLocaleBundle> = {
  zh: { ui: ZH_UI, posts: ZH_POSTS },
  en: { ui: EN_UI, posts: EN_POSTS },
  ja: { ui: JA_UI, posts: JA_POSTS },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const blogConfig = BLOG_BUNDLES.en.ui;

export function getBlogUi(locale: Locale): BlogUiCopy {
  return BLOG_BUNDLES[locale].ui;
}

export function getBlogPosts(locale: Locale): BlogPost[] {
  return BLOG_BUNDLES[locale].posts;
}

export function getBlogPost(locale: Locale, slug: string): BlogPost | undefined {
  return getBlogPosts(locale).find((post) => post.slug === slug);
}

export function getBlogSlugs(): string[] {
  return [...BLOG_SLUGS];
}
