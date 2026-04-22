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
      headline: 'Free 做快速诊断，Pro 指导下一次拍摄',
      body: 'Pro 的价值不再只是更详细的点评，而是把一次结果变成下一轮拍摄、复盘和进步追踪。',
      free: {
        title: 'Free',
        body: '适合快速诊断照片是否成立，并拿到基础建议后马上试下一张。',
        features: ['快速诊断 + 基础建议', '有限 Pro 预览', '30 天历史保留'],
      },
      pro: {
        title: 'Pro',
        body: '适合把每次点评沉淀成完整复盘，并持续追踪一段时间内的进步。',
        features: ['下一次拍摄指导', '完整复盘闭环', '进步追踪与永久历史'],
      },
    },
    triggers: {
      guest_save: {
        badge: '保存与进阶',
        title: '先保存结果，再进入 Pro 成长闭环',
        body: '登录后保留这次点评；升级 Pro 后，建议会变成下一次拍摄清单、复盘记录和长期进步轨迹。',
      },
      quota_floor: {
        badge: '额度触底',
        title: '额度快用完时，Pro 更适合连续练习',
        body: '当你准备继续比较多张照片时，Pro 让你不用反复计算额度，可以把精力放在下一轮拍摄和复盘上。',
      },
      deeper_result: {
        badge: '更深建议',
        title: '看到问题后，用 Pro 把它改成下一次拍摄计划',
        body: 'Pro 不只是补充更多文字，而是把问题拆成下一次拍摄前要做的动作、复盘重点和可追踪变化。',
      },
      history_trend: {
        badge: '趋势复盘',
        title: '想看趋势时，Pro 才是完整复盘工具',
        body: 'Free 能看到近期记录，Pro 更适合长期保留历史，把分数、弱项和复拍结果连成稳定的进步轨迹。',
      },
      retake_compare: {
        badge: '复拍对比',
        title: '准备复拍时，Pro 能把对比做完整',
        body: '同图再分析适合验证修图，新照片复拍更需要 Pro 的复拍对比、下一步清单和长期历史。',
      },
      standard: {
        badge: '下一轮提升',
        title: '想把这次结果真正转成提升，可以升级 Pro',
        body: 'Pro 把深度建议、完整复盘和进步追踪放在一起，更适合持续练习而不是只看一次评分。',
      },
    },
    usageDecision: {
      label: '升级决策',
      headline: '这不只是账户页，而是 Pro 升级决策页',
      body: '这里展示付费前后体验差异：Free 帮你判断问题，Pro 帮你把问题带进下一次拍摄、复盘和长期追踪。',
      proHeadline: '你的 Pro 成长闭环已经开启',
      proBody: '当前账号已经具备完整复盘、永久历史和连续拍摄追踪能力；这里保留订阅与续期入口。',
      differencesTitle: '付费前后最关键的变化',
      differences: [
        {
          label: '下一次拍摄指导',
          before: 'Free 给出基础建议，适合快速试错。',
          after: 'Pro 把建议整理成下一轮拍摄动作。',
        },
        {
          label: '复盘完整度',
          before: 'Free 能看近期结果，历史周期有限。',
          after: 'Pro 保留完整历史，适合反复复盘同一主题。',
        },
        {
          label: '进步追踪',
          before: 'Free 主要回答这张照片哪里有问题。',
          after: 'Pro 帮你观察弱项是否在多次拍摄中改善。',
        },
      ],
      outcomesTitle: '升级后你得到的不是更多文字',
      outcomes: ['下一次拍摄清单', '永久历史与复盘线索', '更适合复拍对比的连续使用路径'],
    },
  },
  en: {
    boundary: {
      label: 'Free / Pro Boundary',
      headline: 'Free diagnoses fast. Pro guides the next shoot.',
      body: 'Pro is no longer framed as a deeper model tier. It turns each critique into the next shoot, a complete review loop, and progress tracking.',
      free: {
        title: 'Free',
        body: 'Best for quick diagnosis and basic next-step advice before trying another frame.',
        features: ['Quick diagnosis + basic next-step advice', 'Limited Pro preview', '30-day history'],
      },
      pro: {
        title: 'Pro',
        body: 'Best for turning each critique into a complete review loop and tracking progress over time.',
        features: ['Next-shoot guidance', 'Complete review loop', 'Progress tracking with permanent history'],
      },
    },
    triggers: {
      guest_save: {
        badge: 'Save and grow',
        title: 'Sign in first, then turn this critique into a Pro growth loop',
        body: 'Sign in to keep this result. Pro then turns the advice into a next-shoot checklist, review record, and long-term progress trail.',
      },
      quota_floor: {
        badge: 'Quota floor',
        title: 'When quota gets tight, Pro fits continuous practice better',
        body: 'If you are about to compare more photos, Pro keeps the loop moving so you can focus on the next shot and review instead of rationing quota.',
      },
      deeper_result: {
        badge: 'Deeper advice',
        title: 'Use Pro to turn the issue into the next shoot plan',
        body: 'Pro is not just more text. It breaks the critique into next-shoot actions, review focus, and changes you can track.',
      },
      history_trend: {
        badge: 'Trend review',
        title: 'When you want trends, Pro becomes the full review tool',
        body: 'Free shows recent records. Pro is better for keeping history long enough to connect scores, weak dimensions, and retakes into a progress trail.',
      },
      retake_compare: {
        badge: 'Retake comparison',
        title: 'Before a retake, Pro gives the comparison more structure',
        body: 'Same-photo reruns verify edits. New-photo retakes benefit more from Pro comparison, next-step checklists, and long-term history.',
      },
      standard: {
        badge: 'Next-round progress',
        title: 'If you want this result to become progress, use Pro',
        body: 'Pro combines deeper advice, complete review, and progress tracking so practice does not stop at a single score.',
      },
    },
    usageDecision: {
      label: 'Upgrade Decision',
      headline: 'This is an upgrade decision page, not just billing',
      body: 'It shows the before-and-after experience: Free helps you understand the issue, while Pro carries it into the next shoot, review loop, and long-term tracking.',
      proHeadline: 'Your Pro growth loop is active',
      proBody: 'This account already has complete review, permanent history, and continuous progress tracking. Billing and renewal controls stay here.',
      differencesTitle: 'What changes after upgrading',
      differences: [
        {
          label: 'Next-shoot guidance',
          before: 'Free gives basic advice for fast trial and error.',
          after: 'Pro turns advice into actions for the next round.',
        },
        {
          label: 'Review completeness',
          before: 'Free keeps recent results for a limited window.',
          after: 'Pro keeps full history for repeated review.',
        },
        {
          label: 'Progress tracking',
          before: 'Free answers what is wrong with this photo.',
          after: 'Pro shows whether weak dimensions improve across shoots.',
        },
      ],
      outcomesTitle: 'The upgrade is not just more text',
      outcomes: ['Next-shoot checklist', 'Permanent history with review cues', 'A steadier path for retake comparison'],
    },
  },
  ja: {
    boundary: {
      label: 'Free / Pro の境界',
      headline: 'Free は素早い診断、Pro は次の撮影を導く',
      body: 'Pro は単なる詳細分析ではなく、講評を次の撮影、振り返り、上達追跡につなげるプランです。',
      free: {
        title: 'Free',
        body: '写真の問題を素早く診断し、基本的な次の一手を得るのに向いています。',
        features: ['素早い診断 + 基本提案', '限定 Pro プレビュー', '30 日間の履歴'],
      },
      pro: {
        title: 'Pro',
        body: '各講評を完全な振り返りに変え、時間をかけて上達を追跡する用途に向いています。',
        features: ['次回撮影ガイド', '完全なレビューの流れ', '永久履歴による上達追跡'],
      },
    },
    triggers: {
      guest_save: {
        badge: '保存と成長',
        title: 'ログイン後、この講評を Pro の成長ループへ',
        body: 'ログインで結果を保存し、Pro で次回撮影チェックリスト、振り返り記録、長期的な上達追跡につなげます。',
      },
      quota_floor: {
        badge: '残り回数',
        title: '残り回数が少ない時は、Pro が継続練習に向いています',
        body: '複数の写真を続けて比較するなら、回数配分より次の撮影と振り返りに集中できます。',
      },
      deeper_result: {
        badge: '深い提案',
        title: 'Pro で問題点を次回の撮影計画に変える',
        body: 'Pro は文字量を増やすだけでなく、次回撮影の行動、振り返りの焦点、追跡できる変化に分解します。',
      },
      history_trend: {
        badge: '傾向レビュー',
        title: '傾向を見たい時、Pro が完全な振り返りツールになります',
        body: 'Free は近期の記録確認向き。Pro は履歴を長く残し、スコア・弱点・撮り直しを上達の流れとして見られます。',
      },
      retake_compare: {
        badge: '撮り直し比較',
        title: '撮り直す前に、Pro で比較を構造化する',
        body: '同じ写真の再分析は編集確認向き。新しい写真の撮り直しには、Pro の比較・次の一手・長期履歴が効きます。',
      },
      standard: {
        badge: '次の上達',
        title: 'この結果を上達につなげるなら Pro',
        body: 'Pro は深い提案、完全な振り返り、上達追跡をまとめ、単発の点数で終わらせません。',
      },
    },
    usageDecision: {
      label: 'アップグレード判断',
      headline: 'ここは請求だけでなく、Pro へ進む判断ページです',
      body: 'Free は問題の把握、Pro はその問題を次回撮影・振り返り・長期追跡につなげます。',
      proHeadline: 'Pro の成長ループは有効です',
      proBody: 'このアカウントでは完全な振り返り、永久履歴、継続的な上達追跡を利用できます。請求と更新管理もここに残ります。',
      differencesTitle: 'アップグレード後に変わること',
      differences: [
        {
          label: '次回撮影ガイド',
          before: 'Free は素早い試行錯誤向けの基本提案。',
          after: 'Pro は提案を次の撮影アクションに変えます。',
        },
        {
          label: '振り返りの完全度',
          before: 'Free は近期履歴を限定的に保存。',
          after: 'Pro は履歴を残し、同じテーマを繰り返し見直せます。',
        },
        {
          label: '上達追跡',
          before: 'Free はこの写真の問題を答えます。',
          after: 'Pro は弱点が複数回の撮影で改善しているかを見ます。',
        },
      ],
      outcomesTitle: '増えるのは文字量だけではありません',
      outcomes: ['次回撮影チェックリスト', '永久履歴と振り返りの手がかり', '撮り直し比較に向いた継続導線'],
    },
  },
};

function normalizeLocale(locale: string): ProConversionLocale {
  if (locale === 'en' || locale === 'ja') {
    return locale;
  }
  return 'zh';
}

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
