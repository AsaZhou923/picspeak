import { normalizeLocale } from './locale.ts';

export type ProConversionLocale = 'zh' | 'en' | 'ja';
export type ProUpgradeTrigger =
  | 'guest_save'
  | 'quota_floor'
  | 'deeper_result'
  | 'history_trend'
  | 'retake_compare'
  | 'standard';

export type ProUpgradeTriggerContext = {
  remaining?: number | null;
};

type TierBoundary = {
  title: string;
  body: string;
  features: string[];
};

export type ProPlanBoundaryCopy = {
  label: string;
  headline: string;
  body: string;
  free: TierBoundary;
  pro: TierBoundary;
};

export type ProUpgradeTriggerCopy = {
  badge: string;
  title: string;
  body: string;
};

type UsageDifference = {
  label: string;
  before: string;
  after: string;
};

export type UsageDecisionCopy = {
  label: string;
  headline: string;
  body: string;
  proHeadline: string;
  proBody: string;
  differencesTitle: string;
  differences: UsageDifference[];
  outcomesTitle: string;
  outcomes: string[];
};

type LocaleCopy = {
  boundary: ProPlanBoundaryCopy;
  triggers: Record<ProUpgradeTrigger, ProUpgradeTriggerCopy>;
  usageDecision: UsageDecisionCopy;
};

const COPY: Record<ProConversionLocale, LocaleCopy> = {
  zh: {
    boundary: {
      label: 'Free / Pro 边界',
      headline: 'Free 完整体验一轮改进，Pro 支持持续练习',
      body: '两个计划都能拿到完整点评、下一次拍摄建议和复拍对比；Pro 提供更多次数、每次都可用深度模式，并长期保留记录。',
      free: {
        title: 'Free',
        body: '适合偶尔点评和完成一轮复拍：完整建议和复拍对比都可用，次数与历史有限。',
        features: ['每月 60 次（每日最多 5 次）', '每月 10 次 Pro 深度模式', '15 天历史保留'],
      },
      pro: {
        title: 'Pro',
        body: '适合经常拍摄、需要反复复盘的人：不用计算次数，每次都可用深度模式。',
        features: ['点评不限月度次数', '每次都可用 Pro 深度模式', '订阅期内保留完整历史与原图'],
      },
    },
    triggers: {
      guest_save: {
        badge: '保存结果',
        title: '登录后保存这次点评',
        body: '登录后可保留这次结果并获得 Free 额度；需要更频繁地点评和复盘时，再考虑 Pro。',
      },
      quota_floor: {
        badge: '额度触底',
        title: '额度快用完时，Pro 更适合连续练习',
        body: '当你准备继续比较多张照片时，Pro 让你不用反复计算额度，可以把精力放在下一轮拍摄和复盘上。',
      },
      deeper_result: {
        badge: '深度模式',
        title: '想每次都用深度模式，可以升级 Pro',
        body: 'Free 每月可用 10 次 Pro 深度模式；Pro 不限次数，适合在下一次拍摄前反复深入分析问题。',
      },
      history_trend: {
        badge: '趋势复盘',
        title: '想看长期趋势时，需要更长的历史',
        body: 'Free 保留最近 15 天的记录；Pro 在订阅期内保留完整历史和原图，便于把分数、弱项和复拍结果放在一起回看。',
      },
      retake_compare: {
        badge: '复拍对比',
        title: '复拍对比在 Free 中同样可用',
        body: '上传修改版或新照片即可与原片对比；每轮对比计 1 次额度。经常复拍时，Pro 不限月度次数。',
      },
      standard: {
        badge: '持续练习',
        title: '经常拍摄时，Pro 让练习不受次数限制',
        body: 'Pro 提供不限月度次数的点评、每次可用的深度模式、完整历史和优先处理。',
      },
    },
    usageDecision: {
      label: '升级决策',
      headline: '这不只是账户页，而是 Pro 升级决策页',
      body: '这里展示付费前后的差异：两个计划的点评内容相同，区别在于次数、深度模式和历史保留。',
      proHeadline: '你的 Pro 已经开启',
      proBody: '当前账号点评不限月度次数，每次可用深度模式，订阅期内保留完整历史；这里保留订阅与续期入口。',
      differencesTitle: '付费前后最关键的变化',
      differences: [
        {
          label: '点评次数',
          before: 'Free 每月 60 次，每日最多 5 次。',
          after: 'Pro 不限月度次数。',
        },
        {
          label: '深度模式',
          before: 'Free 每月可用 10 次 Pro 深度模式。',
          after: 'Pro 每次点评都可选深度模式。',
        },
        {
          label: '历史保留',
          before: 'Free 保留最近 15 天的记录。',
          after: 'Pro 在订阅期内保留完整历史和原图。',
        },
      ],
      outcomesTitle: '升级后你得到的',
      outcomes: ['不限月度次数的点评与复拍对比', '每次可用的深度模式', '订阅期内的完整历史与优先处理'],
    },
  },
  en: {
    boundary: {
      label: 'Free / Pro Boundary',
      headline: 'Free covers a full improvement round. Pro is for steady practice.',
      body: 'Both plans get the complete critique, next-shoot advice, and retake comparison. Pro adds more critiques, deep mode every time, and long-term records.',
      free: {
        title: 'Free',
        body: 'Best for occasional critiques and one full retake round: complete advice and retake comparison, with limited usage and history.',
        features: ['60 critiques / month (up to 5 / day)', '10 Pro deep-mode critiques / month', '15-day history'],
      },
      pro: {
        title: 'Pro',
        body: 'Best for photographers who shoot often and review repeatedly: no counting critiques, deep mode every time.',
        features: ['No monthly critique limit', 'Pro deep mode on every critique', 'Full history and originals kept while subscribed'],
      },
    },
    triggers: {
      guest_save: {
        badge: 'Save your result',
        title: 'Sign in to keep this critique',
        body: 'Sign in to keep this result and unlock Free usage. Consider Pro once you want to critique and review more often.',
      },
      quota_floor: {
        badge: 'Quota floor',
        title: 'When quota gets tight, Pro fits continuous practice better',
        body: 'If you are about to compare more photos, Pro keeps the loop moving so you can focus on the next shot and review instead of rationing quota.',
      },
      deeper_result: {
        badge: 'Deep mode',
        title: 'Want deep mode on every critique? Use Pro',
        body: 'Free includes 10 Pro deep-mode critiques a month. Pro removes that limit, so you can dig into every issue before the next shoot.',
      },
      history_trend: {
        badge: 'Trend review',
        title: 'Long-term trends need longer history',
        body: 'Free keeps the last 15 days. Pro keeps full history and originals while subscribed, so scores, weak dimensions, and retakes stay side by side.',
      },
      retake_compare: {
        badge: 'Retake comparison',
        title: 'Retake comparison works on Free too',
        body: 'Upload an edited version or a new photo to compare it with the original; each round uses one critique. If you retake often, Pro has no monthly limit.',
      },
      standard: {
        badge: 'Steady practice',
        title: 'If you shoot often, Pro removes the critique limit',
        body: 'Pro gives you critiques without a monthly limit, deep mode every time, full history, and priority processing.',
      },
    },
    usageDecision: {
      label: 'Upgrade Decision',
      headline: 'This is an upgrade decision page, not just billing',
      body: 'It shows what changes after upgrading: the critique itself is the same on both plans; usage, deep mode, and history differ.',
      proHeadline: 'Your Pro plan is active',
      proBody: 'This account has critiques without a monthly limit, deep mode every time, and full history while subscribed. Billing and renewal controls stay here.',
      differencesTitle: 'What changes after upgrading',
      differences: [
        {
          label: 'Critiques',
          before: 'Free includes 60 per month, up to 5 per day.',
          after: 'Pro has no monthly limit.',
        },
        {
          label: 'Deep mode',
          before: 'Free includes 10 Pro deep-mode critiques per month.',
          after: 'Pro lets you choose deep mode on every critique.',
        },
        {
          label: 'History',
          before: 'Free keeps the last 15 days.',
          after: 'Pro keeps full history and originals while subscribed.',
        },
      ],
      outcomesTitle: 'What you get with Pro',
      outcomes: ['Critiques and retake comparisons without a monthly limit', 'Deep mode on every critique', 'Full history and priority processing while subscribed'],
    },
  },
  ja: {
    boundary: {
      label: 'Free / Pro の境界',
      headline: 'Free で改善を一通り体験、Pro で継続練習',
      body: 'どちらのプランでも完全な講評、次の撮影への提案、撮り直し比較を利用できます。Pro は回数が増え、毎回ディープモードを使え、記録を長く残せます。',
      free: {
        title: 'Free',
        body: 'ときどきの講評と撮り直し 1 回分に向いています。完全な提案と撮り直し比較を使え、回数と履歴に上限があります。',
        features: ['月 60 回（1 日最大 5 回）', 'Pro ディープモード月 10 回', '15 日間の履歴'],
      },
      pro: {
        title: 'Pro',
        body: 'よく撮影し、繰り返し振り返る人向け。回数を気にせず、毎回ディープモードを使えます。',
        features: ['講評の月間上限なし', '毎回 Pro ディープモードを利用可能', '契約中は全履歴と元写真を保存'],
      },
    },
    triggers: {
      guest_save: {
        badge: '結果を保存',
        title: 'ログインしてこの講評を保存',
        body: 'ログインすると結果を保存でき、Free の回数を利用できます。より頻繁に講評・振り返りをしたくなったら Pro を検討してください。',
      },
      quota_floor: {
        badge: '残り回数',
        title: '残り回数が少ない時は、Pro が継続練習に向いています',
        body: '複数の写真を続けて比較するなら、回数配分より次の撮影と振り返りに集中できます。',
      },
      deeper_result: {
        badge: 'ディープモード',
        title: '毎回ディープモードを使うなら Pro',
        body: 'Free では Pro ディープモードを月 10 回使えます。Pro は回数制限がなく、次の撮影の前に毎回深く分析できます。',
      },
      history_trend: {
        badge: '傾向レビュー',
        title: '長期の傾向を見るには長い履歴が必要です',
        body: 'Free は直近 15 日の記録を保存します。Pro は契約中、全履歴と元写真を保存し、スコア・弱点・撮り直しを並べて見返せます。',
      },
      retake_compare: {
        badge: '撮り直し比較',
        title: '撮り直し比較は Free でも使えます',
        body: '編集後の写真または新しい写真をアップロードすると元写真と比較できます。1 回の比較で 1 回分を使います。よく撮り直すなら、Pro は月間上限がありません。',
      },
      standard: {
        badge: '継続練習',
        title: 'よく撮影するなら、Pro で回数を気にせず練習',
        body: 'Pro では月間上限のない講評、毎回使えるディープモード、全履歴、優先処理を利用できます。',
      },
    },
    usageDecision: {
      label: 'アップグレード判断',
      headline: 'ここは請求だけでなく、Pro へ進む判断ページです',
      body: 'アップグレードで変わる点を示します。講評の内容は両プランで同じで、回数・ディープモード・履歴が異なります。',
      proHeadline: 'Pro プランは有効です',
      proBody: 'このアカウントでは講評の月間上限がなく、毎回ディープモードを使え、契約中は全履歴を保存します。請求と更新管理もここに残ります。',
      differencesTitle: 'アップグレード後に変わること',
      differences: [
        {
          label: '講評回数',
          before: 'Free は月 60 回、1 日最大 5 回。',
          after: 'Pro は月間上限なし。',
        },
        {
          label: 'ディープモード',
          before: 'Free は Pro ディープモードを月 10 回。',
          after: 'Pro は毎回ディープモードを選べます。',
        },
        {
          label: '履歴',
          before: 'Free は直近 15 日を保存。',
          after: 'Pro は契約中、全履歴と元写真を保存。',
        },
      ],
      outcomesTitle: 'Pro で得られるもの',
      outcomes: ['月間上限のない講評と撮り直し比較', '毎回使えるディープモード', '契約中の全履歴と優先処理'],
    },
  },
};

function interpolateRemaining(text: string, context?: ProUpgradeTriggerContext): string {
  if (context?.remaining === null || context?.remaining === undefined) {
    return text.replace(/\s*\{n\}\s*/g, '');
  }
  return text.replace('{n}', String(context.remaining));
}

export function getProPlanBoundaryCopy(locale: string): ProPlanBoundaryCopy {
  return COPY[normalizeLocale(locale)].boundary;
}

export function getProUpgradeTriggerCopy(
  locale: string,
  trigger: ProUpgradeTrigger,
  context?: ProUpgradeTriggerContext,
): ProUpgradeTriggerCopy {
  const copy = COPY[normalizeLocale(locale)].triggers[trigger];
  return {
    ...copy,
    title: interpolateRemaining(copy.title, context),
    body: interpolateRemaining(copy.body, context),
  };
}

export function getUsageDecisionCopy(locale: string): UsageDecisionCopy {
  return COPY[normalizeLocale(locale)].usageDecision;
}
