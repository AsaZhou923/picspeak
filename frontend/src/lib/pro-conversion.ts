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
      headline: 'Free 开始体验，Pro 留下完整摄影记录',
      body: '两个计划都能拿到完整点评、下一次拍摄建议和复拍对比；Pro 在订阅期内保留完整历史与原图，点评不限月度次数。',
      free: {
        title: 'Free',
        body: '适合偶尔点评和完成一轮复拍：完整建议和复拍对比都可用，次数与历史有限。',
        features: ['每月 60 次（每日最多 5 次）', '每月 10 次 Pro 深度模式', '15 天历史保留'],
      },
      pro: {
        title: 'Pro',
        body: '把摄影记录留在一起：订阅期内完整保存点评与原图，随时回看，并继续点评。',
        features: ['订阅期内保留完整历史与原图', '点评不限月度次数', '每次都可用 Pro 深度模式'],
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
        title: '过去的拍摄，随时回来复盘',
        body: 'Free 保留最近 15 天的记录；Pro 在订阅期内保留完整历史和原图，便于回看点评与每一轮复拍依据。分数变化本身不代表能力提升。',
      },
      retake_compare: {
        badge: '复拍对比',
        title: '复拍对比在 Free 中同样可用',
        body: '上传修改版或新照片即可与原片对比；每轮对比计 1 次额度。经常复拍时，Pro 不限月度次数。',
      },
      standard: {
        badge: '摄影记录',
        title: '你的摄影记录，都留在这里',
        body: 'Pro 在订阅期内保留完整点评历史与原图，方便随时回看；点评不限月度次数，并包含每次可选的深度模式与优先处理。每个 UTC 月达到 150 次会提醒用量，新点评降为每分钟最多 2 次，至下个 UTC 月恢复；月度总量不限，不自动加收费用。',
      },
    },
    usageDecision: {
      label: '套餐与记录',
      headline: '让每次拍摄与点评都有迹可循',
      body: 'Free 可完成点评与复拍对比；Pro 在订阅期内保留完整历史与原图，支持不限月度次数的持续点评。',
      proHeadline: '你的 Pro 已经开启',
      proBody: '订阅期内完整历史与原图都保留在这里，随时可以回看并继续点评。月度 150 次后，新点评每分钟最多 2 次，至下个 UTC 月恢复；总量仍不限，不自动加收费用。',
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
      outcomes: ['订阅期内的完整历史与原图', '不限月度次数的点评与复拍对比', '每次可选深度模式与优先处理'],
    },
  },
  en: {
    boundary: {
      label: 'Free / Pro Boundary',
      headline: 'Start with Free. Keep your photography record with Pro.',
      body: 'Both plans get the complete critique, next-shoot advice, and retake comparison. Pro keeps full history and originals while subscribed, with no monthly critique limit.',
      free: {
        title: 'Free',
        body: 'Best for occasional critiques and one full retake round: complete advice and retake comparison, with limited usage and history.',
        features: ['60 critiques / month (up to 5 / day)', '10 Pro deep-mode critiques / month', '15-day history'],
      },
      pro: {
        title: 'Pro',
        body: 'Keep your photography record together: full critiques and originals while subscribed, ready to revisit as you keep shooting.',
        features: ['Full history and originals kept while subscribed', 'No monthly critique limit', 'Pro deep mode on every critique'],
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
        title: 'Return to past shoots whenever you need them',
        body: 'Free keeps the last 15 days. Pro keeps full history and originals while subscribed, so you can revisit critiques and the evidence in each retake round. Score changes alone do not prove skill improvement.',
      },
      retake_compare: {
        badge: 'Retake comparison',
        title: 'Retake comparison works on Free too',
        body: 'Upload an edited version or a new photo to compare it with the original; each round uses one critique. If you retake often, Pro has no monthly limit.',
      },
      standard: {
        badge: 'Photography record',
        title: 'Your photography record, all in one place',
        body: 'Pro keeps full critique history and originals while subscribed, ready to revisit. There is no monthly critique limit, and every critique can use deep mode with priority processing. At 150 critiques in a UTC month, a usage reminder appears and new critiques slow to 2 per minute until the next UTC month; the monthly total remains unlimited with no automatic extra charge.',
      },
    },
    usageDecision: {
      label: 'Plans & records',
      headline: 'Keep your photos and critiques together',
      body: 'Free covers critiques and retake comparison. Pro keeps full history and originals while subscribed, with no monthly critique limit.',
      proHeadline: 'Your Pro plan is active',
      proBody: 'Your full history and originals stay together while subscribed, ready to revisit as you keep critiquing. After 150 critiques in a UTC month, new critiques slow to 2 per minute until the next UTC month. The monthly total remains unlimited with no automatic extra charge.',
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
      outcomes: ['Full history and originals while subscribed', 'Critiques and retake comparisons without a monthly limit', 'Deep mode on every critique and priority processing'],
    },
  },
  ja: {
    boundary: {
      label: 'Free / Pro の境界',
      headline: 'Free で始めて、Pro で写真記録を残す',
      body: 'どちらのプランでも完全な講評、次の撮影への提案、撮り直し比較を利用できます。Pro は契約中に全履歴と元写真を保存し、講評の月間上限はありません。',
      free: {
        title: 'Free',
        body: 'ときどきの講評と撮り直し 1 回分に向いています。完全な提案と撮り直し比較を使え、回数と履歴に上限があります。',
        features: ['月 60 回（1 日最大 5 回）', 'Pro ディープモード月 10 回', '15 日間の履歴'],
      },
      pro: {
        title: 'Pro',
        body: '写真記録をひとつに。契約中は講評と元写真をすべて保存し、撮影を続けながらいつでも見返せます。',
        features: ['契約中は全履歴と元写真を保存', '講評の月間上限なし', '毎回 Pro ディープモードを利用可能'],
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
        title: '過去の撮影を、必要なときに見返す',
        body: 'Free は直近 15 日の記録を保存します。Pro は契約中に全履歴と元写真を保存し、講評と各回の撮り直しの根拠を見返せます。スコアの変化だけでは上達を証明できません。',
      },
      retake_compare: {
        badge: '撮り直し比較',
        title: '撮り直し比較は Free でも使えます',
        body: '編集後の写真または新しい写真をアップロードすると元写真と比較できます。1 回の比較で 1 回分を使います。よく撮り直すなら、Pro は月間上限がありません。',
      },
      standard: {
        badge: '写真記録',
        title: 'あなたの写真記録を、ひとつの場所に',
        body: 'Pro は契約中に全講評履歴と元写真を保存し、いつでも見返せます。講評の月間上限はなく、毎回ディープモードと優先処理を利用できます。UTC の月ごとに150回に達すると、次の UTC 月まで新しい講評は毎分2回となります。月間総数に上限はなく、自動の追加請求はありません。',
      },
    },
    usageDecision: {
      label: 'プランと記録',
      headline: '写真と講評をまとめて見返す',
      body: 'Free でも講評と撮り直し比較を利用できます。Pro は契約中に全履歴と元写真を保存し、月間上限なく講評できます。',
      proHeadline: 'Pro プランは有効です',
      proBody: '契約中は全履歴と元写真をまとめて保存し、いつでも見返せます。UTC の月ごとに150回以降は、次の月まで新しい講評を毎分2回まで利用できます。月間総数に上限はなく、自動の追加請求はありません。',
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
      outcomes: ['契約中の全履歴と元写真', '月間上限のない講評と撮り直し比較', '毎回選べるディープモードと優先処理'],
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
