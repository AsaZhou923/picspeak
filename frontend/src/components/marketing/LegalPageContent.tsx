'use client';

import Link from 'next/link';
import { FileText, Mail, Scale, ShieldCheck } from 'lucide-react';
import { useI18n, type Locale } from '@/lib/i18n';

export type LegalPageKind = 'privacy' | 'terms';

type LegalSection = {
  title: string;
  body: string[];
};

type LegalCopy = {
  badge: string;
  title: string;
  intro: string;
  updatedLabel: string;
  updatedAt: string;
  summaryTitle: string;
  summaryItems: string[];
  sections: LegalSection[];
  contactTitle: string;
  contactBody: string;
  contactEmailLabel: string;
  relatedLabel: string;
  relatedHref: string;
  relatedText: string;
  backHome: string;
};

const CONTACT_EMAIL = 'xavierzhou23@gmail.com';

const LEGAL_COPY: Record<LegalPageKind, Record<Locale, LegalCopy>> = {
  privacy: {
    en: {
      badge: 'Privacy Notice',
      title: 'PicSpeak Privacy Notice',
      intro:
        'How PicSpeak handles photos, prompts, generation records, account data, payments, analytics, and support requests.',
      updatedLabel: 'Last updated',
      updatedAt: 'May 14, 2026',
      summaryTitle: 'At a glance',
      summaryItems: [
        'Uploaded photos and prompts are used to provide the critique or AI reference you request.',
        'Photos are not published unless you intentionally use a public gallery or share feature.',
        'You can contact us for access, deletion, correction, or account questions.',
      ],
      sections: [
        {
          title: 'Information we handle',
          body: [
            'PicSpeak may process uploaded photos, image metadata available in the file, written prompts, generated images, critique results, account profile data from sign-in providers, usage quotas, plan status, payment status, support messages, and basic technical logs such as browser, device, IP-derived region, timestamps, and error events.',
            'Payment card or wallet details are handled by the payment processor. PicSpeak receives payment status, subscription status, invoices, and identifiers needed to activate or manage your plan.',
          ],
        },
        {
          title: 'How we use information',
          body: [
            'We use information to deliver AI photo critique, AI image generation, account access, quota enforcement, paid-plan features, support, safety checks, abuse prevention, reliability monitoring, and product analytics.',
            'We may use aggregated or de-identified usage patterns to improve the product, but we do not sell personal information.',
          ],
        },
        {
          title: 'Photos, prompts, and public sharing',
          body: [
            'Uploaded photos, prompts, generated references, and critique text are processed to complete the request you start. They are not shown publicly by default.',
            'If you submit content to the public gallery, create a public share link, or otherwise choose a public workflow, the selected content and related critique data may be visible to others.',
          ],
        },
        {
          title: 'Service providers',
          body: [
            'PicSpeak relies on service providers for authentication, AI model processing, cloud hosting, object storage, payment processing, analytics, and email or support operations.',
            'These providers process information only as needed to support PicSpeak and are expected to protect it under their own security and data-processing terms.',
          ],
        },
        {
          title: 'Retention and choices',
          body: [
            'Retention depends on the workflow and plan. Guest results are designed for short-lived use, Free history may be limited, and Pro history may be retained so long as the account remains active and the feature is available.',
            'You can contact us to request access, correction, deletion, or account help. Some records may be retained when needed for security, fraud prevention, legal, accounting, or dispute-resolution reasons.',
          ],
        },
        {
          title: 'Security',
          body: [
            'We use reasonable technical and organizational measures, including controlled access and encrypted storage where applicable. No online service can guarantee perfect security, so please avoid uploading content you are not comfortable processing through an AI service.',
          ],
        },
        {
          title: 'Children',
          body: [
            'PicSpeak is not intended for children under 13. If you believe a child has provided personal information, contact us so we can review and delete it where appropriate.',
          ],
        },
      ],
      contactTitle: 'Contact',
      contactBody: 'For privacy requests or questions, email us.',
      contactEmailLabel: 'Email privacy support',
      relatedLabel: 'Also review',
      relatedHref: '/terms',
      relatedText: 'Terms of Service',
      backHome: 'Back home',
    },
    zh: {
      badge: '隐私说明',
      title: 'PicSpeak 隐私说明',
      intro:
        '说明 PicSpeak 在你使用 AI 摄影点评、AI Create、账号、支付、分析和客服功能时如何处理相关数据。',
      updatedLabel: '最后更新',
      updatedAt: '2026 年 5 月 14 日',
      summaryTitle: '快速了解',
      summaryItems: [
        '你上传的照片和输入的提示词会用于完成你发起的 AI 点评或 AI 参考图生成请求。',
        '除非你主动使用公开长廊、公开分享链接等功能，照片不会默认公开展示。',
        '你可以通过邮箱联系我们，提出访问、更正、删除数据或账号相关请求。',
      ],
      sections: [
        {
          title: '我们处理的信息',
          body: [
            'PicSpeak 可能处理你上传的照片、文件中可读取的图像元数据、提示词、生成图片、点评结果、登录服务返回的账号资料、使用额度、套餐状态、支付状态、客服消息，以及浏览器、设备、IP 推断地区、时间戳和错误事件等基础技术日志。',
            '银行卡或钱包等支付详情由支付服务商处理。PicSpeak 只接收用于开通或管理套餐的支付状态、订阅状态、发票和必要标识符。',
          ],
        },
        {
          title: '使用目的',
          body: [
            '我们使用这些信息来提供 AI 摄影点评、AI 图像生成、账号访问、额度计算、付费功能、客服支持、安全检查、防滥用、稳定性监控和产品分析。',
            '我们可能使用汇总或去标识化的使用趋势改进产品，但不会出售个人信息。',
          ],
        },
        {
          title: '照片、提示词与公开分享',
          body: [
            '上传照片、提示词、生成参考图和点评文本会用于完成你主动发起的请求，默认不会公开展示。',
            '如果你把内容提交到公开长廊、创建公开分享链接，或选择其他公开流程，被选中的内容和相关点评数据可能被其他人看到。',
          ],
        },
        {
          title: '第三方服务',
          body: [
            'PicSpeak 会使用第三方服务来完成登录认证、AI 模型处理、云托管、对象存储、支付处理、分析以及邮件或客服支持。',
            '这些服务商只会在支持 PicSpeak 所需范围内处理信息，并应按照其自身安全和数据处理条款保护相关信息。',
          ],
        },
        {
          title: '保留时间与选择',
          body: [
            '保留时间取决于使用流程和套餐。游客结果面向短期使用，Free 历史可能受时间限制，Pro 历史可能在账号仍有效且功能可用时持续保留。',
            '你可以联系我们提出访问、更正、删除或账号处理请求。出于安全、防欺诈、法律、会计或争议处理需要，部分记录可能需要继续保留。',
          ],
        },
        {
          title: '安全',
          body: [
            '我们采用合理的技术和组织措施，包括访问控制以及适用场景下的加密存储。任何在线服务都无法保证绝对安全，因此请避免上传你不希望通过 AI 服务处理的内容。',
          ],
        },
        {
          title: '儿童',
          body: [
            'PicSpeak 不面向 13 岁以下儿童。如果你认为儿童向我们提供了个人信息，请联系我们，我们会在适当情况下进行核查和删除。',
          ],
        },
      ],
      contactTitle: '联系我们',
      contactBody: '如有隐私请求或问题，请发送邮件。',
      contactEmailLabel: '发送隐私请求',
      relatedLabel: '同时查看',
      relatedHref: '/terms',
      relatedText: '服务条款',
      backHome: '返回首页',
    },
    ja: {
      badge: 'プライバシー',
      title: 'PicSpeak プライバシー通知',
      intro:
        'PicSpeak が AI 写真講評、AI Create、アカウント、決済、分析、サポート機能で扱うデータについて説明します。',
      updatedLabel: '最終更新',
      updatedAt: '2026年5月14日',
      summaryTitle: '要点',
      summaryItems: [
        'アップロードした写真と prompt は、依頼した講評または AI 参考画像の生成に使われます。',
        '公開ギャラリーや共有リンクを自分で使わない限り、写真は公開されません。',
        'アクセス、削除、修正、アカウントに関する依頼はメールで連絡できます。',
      ],
      sections: [
        {
          title: '取り扱う情報',
          body: [
            'PicSpeak は、アップロード写真、画像ファイル内で読み取れるメタデータ、prompt、生成画像、講評結果、サインイン提供元から受け取るアカウント情報、利用枠、プラン状態、決済状態、サポートメッセージ、ブラウザ、端末、IP から推定される地域、時刻、エラーイベントなどの基本的な技術ログを処理することがあります。',
            'カードやウォレットなどの決済詳細は決済事業者が処理します。PicSpeak はプランの有効化や管理に必要な決済状態、購読状態、請求書、識別子を受け取ります。',
          ],
        },
        {
          title: '利用目的',
          body: [
            'AI 写真講評、AI 画像生成、アカウント利用、利用枠管理、有料機能、サポート、安全確認、不正利用防止、信頼性監視、プロダクト分析のために情報を利用します。',
            '集計または匿名化された利用傾向を改善に使うことがありますが、個人情報を販売することはありません。',
          ],
        },
        {
          title: '写真、prompt、公開共有',
          body: [
            'アップロード写真、prompt、生成参考画像、講評テキストは、あなたが開始したリクエストを完了するために処理されます。標準では公開されません。',
            '公開ギャラリーへの投稿、公開共有リンクの作成、その他の公開ワークフローを選んだ場合、選択した内容と関連する講評データが他の人に表示されることがあります。',
          ],
        },
        {
          title: 'サービス提供者',
          body: [
            'PicSpeak は、認証、AI モデル処理、クラウドホスティング、オブジェクトストレージ、決済処理、分析、メールまたはサポート運用のために外部サービスを利用します。',
            'これらの提供者は PicSpeak を支えるために必要な範囲で情報を処理し、それぞれのセキュリティおよびデータ処理条件に従って保護することが期待されます。',
          ],
        },
        {
          title: '保存期間と選択肢',
          body: [
            '保存期間はワークフローとプランによって異なります。ゲスト結果は短期利用向け、Free 履歴は期間制限があり、Pro 履歴はアカウントが有効で機能が提供されている間保持されることがあります。',
            'アクセス、修正、削除、アカウントに関する依頼はメールで連絡できます。安全、不正防止、法令、会計、紛争対応のために一部記録を保持する場合があります。',
          ],
        },
        {
          title: 'セキュリティ',
          body: [
            'アクセス制御や適用可能な暗号化ストレージなど、合理的な技術的および組織的措置を用います。ただしオンラインサービスに完全な安全はないため、AI サービスで処理したくない内容はアップロードしないでください。',
          ],
        },
        {
          title: '子ども',
          body: [
            'PicSpeak は 13 歳未満の子どもを対象としていません。子どもが個人情報を提供したと思われる場合は連絡してください。適切な範囲で確認し削除します。',
          ],
        },
      ],
      contactTitle: '連絡先',
      contactBody: 'プライバシーに関する依頼や質問はメールで連絡してください。',
      contactEmailLabel: 'プライバシー窓口へメール',
      relatedLabel: 'あわせて確認',
      relatedHref: '/terms',
      relatedText: '利用規約',
      backHome: 'ホームへ戻る',
    },
  },
  terms: {
    en: {
      badge: 'Terms of Service',
      title: 'PicSpeak Terms of Service',
      intro:
        'The rules for using PicSpeak AI photo critique, AI Create, accounts, subscriptions, public sharing, and support.',
      updatedLabel: 'Last updated',
      updatedAt: 'May 14, 2026',
      summaryTitle: 'Core terms',
      summaryItems: [
        'PicSpeak provides AI-assisted photo critique and visual reference generation.',
        'AI output is for creative reference and should be reviewed with your own judgment.',
        'You are responsible for the content you upload and for how you use the results.',
      ],
      sections: [
        {
          title: 'Using PicSpeak',
          body: [
            'You may use PicSpeak only if you can legally enter these terms and comply with applicable laws. If you use PicSpeak for an organization, you confirm that you have authority to bind that organization.',
            'PicSpeak may change, suspend, or discontinue features when needed for security, reliability, product development, or legal reasons.',
          ],
        },
        {
          title: 'Accounts, plans, and payments',
          body: [
            'Some features require sign-in. You are responsible for keeping your account access secure and for activity that occurs through your account.',
            'Paid plans, subscriptions, trials, credits, and quotas are shown in the product or checkout flow. Taxes, renewal behavior, refunds, and cancellation options may depend on the payment provider and the offer shown at purchase time.',
          ],
        },
        {
          title: 'Your content and license',
          body: [
            'You keep ownership of photos, prompts, and other content you provide. You grant PicSpeak the limited rights needed to host, process, analyze, generate, store, display, and transmit that content so we can provide the service.',
            'You confirm that you have the rights and permissions needed to upload and process the content, including any rights related to people, private places, brands, or third-party works appearing in it.',
          ],
        },
        {
          title: 'Acceptable use',
          body: [
            'Do not use PicSpeak to upload illegal content, infringe rights, harass others, bypass security, overload the service, reverse engineer non-public systems, scrape at abusive scale, or use outputs in a way that violates law or third-party rights.',
            'We may remove content, limit usage, or suspend access if we reasonably believe these terms, safety rules, quotas, or law are being violated.',
          ],
        },
        {
          title: 'AI output',
          body: [
            'AI critique, scores, suggestions, prompts, and generated images may be incomplete, inaccurate, or unsuitable for your situation. They are creative and educational references, not professional, legal, financial, medical, or safety advice.',
            'You are responsible for reviewing AI output before relying on it, publishing it, or using it commercially.',
          ],
        },
        {
          title: 'Public sharing',
          body: [
            'If you use gallery, favorites, share links, or other public features, the selected content may be visible to other people. Only submit content you have permission to share publicly.',
          ],
        },
        {
          title: 'PicSpeak intellectual property',
          body: [
            'PicSpeak, the product design, site content, software, branding, and related materials belong to PicSpeak or its licensors. These terms do not grant rights to copy, modify, resell, or misuse PicSpeak outside normal product use.',
          ],
        },
        {
          title: 'Disclaimers and liability',
          body: [
            'PicSpeak is provided as available. We do not promise uninterrupted access, error-free output, or that the service will meet every need.',
            'To the maximum extent allowed by law, PicSpeak is not liable for indirect, incidental, special, consequential, exemplary, or lost-profit damages arising from use of the service.',
          ],
        },
        {
          title: 'Changes and contact',
          body: [
            'We may update these terms from time to time. Continued use after updates means you accept the updated terms. If a change materially affects your rights, we will try to provide reasonable notice through the product or other practical means.',
          ],
        },
      ],
      contactTitle: 'Questions',
      contactBody: 'For terms, billing, or account questions, email us.',
      contactEmailLabel: 'Email support',
      relatedLabel: 'Also review',
      relatedHref: '/privacy',
      relatedText: 'Privacy Notice',
      backHome: 'Back home',
    },
    zh: {
      badge: '服务条款',
      title: 'PicSpeak 服务条款',
      intro:
        '说明使用 PicSpeak AI 摄影点评、AI Create、账号、订阅、公开分享和客服功能时适用的基本规则。',
      updatedLabel: '最后更新',
      updatedAt: '2026 年 5 月 14 日',
      summaryTitle: '核心条款',
      summaryItems: [
        'PicSpeak 提供 AI 辅助摄影点评和视觉参考图生成服务。',
        'AI 输出仅供创作参考，你需要结合自己的判断进行复核。',
        '你需要对上传内容以及使用输出结果的方式负责。',
      ],
      sections: [
        {
          title: '使用 PicSpeak',
          body: [
            '只有在你能够合法接受这些条款并遵守适用法律时，才可以使用 PicSpeak。如果你代表组织使用 PicSpeak，则确认你有权代表该组织接受这些条款。',
            '出于安全、稳定性、产品迭代或法律原因，PicSpeak 可能调整、暂停或停止部分功能。',
          ],
        },
        {
          title: '账号、套餐与支付',
          body: [
            '部分功能需要登录。你需要保护账号访问安全，并对通过你的账号发生的活动负责。',
            '付费套餐、订阅、试用、credits 和额度会在产品或结账流程中展示。税费、续费、退款和取消选项可能取决于支付服务商以及购买时展示的具体方案。',
          ],
        },
        {
          title: '你的内容与授权',
          body: [
            '你保留对照片、提示词和其他上传内容的所有权。为提供服务，你授予 PicSpeak 必要且有限的权利，用于托管、处理、分析、生成、存储、展示和传输这些内容。',
            '你确认自己拥有上传和处理这些内容所需的权利与许可，包括其中出现的人物、私密场所、品牌或第三方作品相关权利。',
          ],
        },
        {
          title: '可接受使用',
          body: [
            '不得使用 PicSpeak 上传违法内容、侵犯他人权利、骚扰他人、绕过安全措施、过载服务、逆向非公开系统、以滥用规模抓取数据，或以违法、侵权方式使用输出结果。',
            '如果我们合理认为你违反条款、安全规则、额度限制或法律，我们可能删除内容、限制使用或暂停访问。',
          ],
        },
        {
          title: 'AI 输出',
          body: [
            'AI 点评、评分、建议、提示词和生成图片可能不完整、不准确，或不适合你的具体场景。它们是创作和学习参考，不构成专业、法律、财务、医疗或安全建议。',
            '在依赖、发布或商业使用 AI 输出前，你需要自行复核并承担相应责任。',
          ],
        },
        {
          title: '公开分享',
          body: [
            '如果你使用公开长廊、收藏、分享链接或其他公开功能，被选中的内容可能被其他人看到。请只提交你有权公开分享的内容。',
          ],
        },
        {
          title: 'PicSpeak 知识产权',
          body: [
            'PicSpeak 的产品设计、网站内容、软件、品牌和相关材料归 PicSpeak 或其许可方所有。本条款不授予你复制、修改、转售或超出正常产品使用范围滥用 PicSpeak 的权利。',
          ],
        },
        {
          title: '免责声明与责任限制',
          body: [
            'PicSpeak 按现状和可用状态提供。我们不承诺服务永不中断、输出完全无误，或服务能够满足所有需求。',
            '在法律允许的最大范围内，PicSpeak 不对因使用服务产生的间接、附带、特殊、后果性、惩罚性或利润损失承担责任。',
          ],
        },
        {
          title: '变更与联系',
          body: [
            '我们可能不时更新这些条款。更新后继续使用即表示你接受更新后的条款。如果变更会重大影响你的权利，我们会尽量通过产品或其他可行方式提供合理通知。',
          ],
        },
      ],
      contactTitle: '问题反馈',
      contactBody: '如有条款、账单或账号问题，请发送邮件。',
      contactEmailLabel: '发送支持邮件',
      relatedLabel: '同时查看',
      relatedHref: '/privacy',
      relatedText: '隐私说明',
      backHome: '返回首页',
    },
    ja: {
      badge: '利用規約',
      title: 'PicSpeak 利用規約',
      intro:
        'PicSpeak の AI 写真講評、AI Create、アカウント、購読、公開共有、サポート機能を使う際の基本ルールです。',
      updatedLabel: '最終更新',
      updatedAt: '2026年5月14日',
      summaryTitle: '主要条件',
      summaryItems: [
        'PicSpeak は AI 支援の写真講評と視覚参考画像の生成を提供します。',
        'AI 出力は創作上の参考であり、自分の判断で確認する必要があります。',
        'アップロードする内容と出力の利用方法については、あなたが責任を負います。',
      ],
      sections: [
        {
          title: 'PicSpeak の利用',
          body: [
            'これらの条件を法的に受け入れ、適用される法律を守れる場合にのみ PicSpeak を利用できます。組織のために利用する場合、その組織を拘束する権限があることを確認します。',
            '安全性、信頼性、プロダクト開発、法的理由により、PicSpeak は機能を変更、一時停止、終了することがあります。',
          ],
        },
        {
          title: 'アカウント、プラン、決済',
          body: [
            '一部機能にはサインインが必要です。アカウントへのアクセスを安全に保ち、そのアカウントで行われる活動について責任を負います。',
            '有料プラン、購読、トライアル、credits、利用枠はプロダクトまたは checkout 画面に表示されます。税金、更新、返金、解約条件は決済事業者および購入時に表示された内容によって異なる場合があります。',
          ],
        },
        {
          title: 'あなたのコンテンツとライセンス',
          body: [
            '写真、prompt、その他提供するコンテンツの所有権はあなたに残ります。サービス提供のため、PicSpeak に対してホスト、処理、分析、生成、保存、表示、送信に必要な限定的な権利を付与します。',
            'コンテンツ内の人物、私的な場所、ブランド、第三者作品に関する権利を含め、アップロードと処理に必要な権利と許可を持っていることを確認します。',
          ],
        },
        {
          title: '許容される利用',
          body: [
            '違法コンテンツのアップロード、権利侵害、嫌がらせ、セキュリティ回避、サービス過負荷、非公開システムのリバースエンジニアリング、乱用的なスクレイピング、法令または第三者権利に反する出力利用を行ってはいけません。',
            '条項、安全ルール、利用枠、法律への違反が合理的に疑われる場合、コンテンツ削除、利用制限、アクセス停止を行うことがあります。',
          ],
        },
        {
          title: 'AI 出力',
          body: [
            'AI 講評、スコア、提案、prompt、生成画像は不完全、不正確、または状況に合わない場合があります。これらは創作と学習の参考であり、専門、法律、金融、医療、安全上の助言ではありません。',
            'AI 出力に依拠、公開、商用利用する前に、自分で確認し責任を負う必要があります。',
          ],
        },
        {
          title: '公開共有',
          body: [
            'ギャラリー、お気に入り、共有リンク、その他の公開機能を使うと、選択した内容が他の人に見える場合があります。公開共有する権利がある内容だけを投稿してください。',
          ],
        },
        {
          title: 'PicSpeak の知的財産',
          body: [
            'PicSpeak、製品デザイン、サイト内容、ソフトウェア、ブランド、関連資料は PicSpeak またはそのライセンサーに帰属します。本条件は通常の製品利用を超えた複製、変更、再販売、不正利用の権利を与えるものではありません。',
          ],
        },
        {
          title: '免責と責任制限',
          body: [
            'PicSpeak は現状有姿かつ利用可能な範囲で提供されます。中断のないアクセス、エラーのない出力、すべての目的への適合を保証しません。',
            '法律で認められる最大限の範囲で、PicSpeak はサービス利用から生じる間接、付随、特別、結果的、懲罰的損害または逸失利益について責任を負いません。',
          ],
        },
        {
          title: '変更と連絡',
          body: [
            'これらの条件は随時更新されることがあります。更新後も利用を続ける場合、更新後の条件に同意したものとみなされます。権利に重大な影響がある変更については、製品内または実用的な方法で合理的な通知を試みます。',
          ],
        },
      ],
      contactTitle: 'お問い合わせ',
      contactBody: '規約、請求、アカウントに関する質問はメールで連絡してください。',
      contactEmailLabel: 'サポートへメール',
      relatedLabel: 'あわせて確認',
      relatedHref: '/privacy',
      relatedText: 'プライバシー通知',
      backHome: 'ホームへ戻る',
    },
  },
};

export default function LegalPageContent({ kind }: { kind: LegalPageKind }) {
  const { locale } = useI18n();
  const copy = LEGAL_COPY[kind][locale];
  const HeroIcon = kind === 'privacy' ? ShieldCheck : Scale;

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-6xl px-6 py-14 animate-fade-in">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section className="min-w-0">
            <div className="mb-10 max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-gold/80">
                <HeroIcon size={14} />
                <span>{copy.badge}</span>
              </div>
              <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
                {copy.title}
              </h1>
              <p className="mt-5 text-base leading-8 text-ink-muted">{copy.intro}</p>
              <p className="mt-5 font-mono text-xs uppercase tracking-[0.22em] text-ink-subtle">
                {copy.updatedLabel}: {copy.updatedAt}
              </p>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-border-subtle bg-surface/78">
              <div className="border-b border-border-subtle bg-raised/45 px-6 py-5">
                <div className="flex items-center gap-3 text-sm text-ink">
                  <FileText size={16} className="text-gold" />
                  <span>{copy.summaryTitle}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {copy.summaryItems.map((item) => (
                    <p
                      key={item}
                      className="rounded-[18px] border border-border-subtle bg-void/30 p-4 text-sm leading-7 text-ink-muted"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-border-subtle">
                {copy.sections.map((section) => (
                  <section key={section.title} id={section.title} className="px-6 py-7">
                    <h2 className="font-display text-3xl text-ink">{section.title}</h2>
                    <div className="mt-4 space-y-4">
                      {section.body.map((paragraph) => (
                        <p key={paragraph} className="text-sm leading-8 text-ink-muted">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>

          <aside className="sticky top-20 rounded-[24px] border border-border-subtle bg-raised/55 p-5">
            <div className="flex items-center gap-2 text-sm text-ink">
              <Mail size={15} className="text-gold" />
              <span>{copy.contactTitle}</span>
            </div>
            <p className="mt-3 text-sm leading-7 text-ink-muted">{copy.contactBody}</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold hover:text-void"
            >
              <Mail size={14} />
              <span className="truncate">{copy.contactEmailLabel}</span>
            </a>
            <p className="mt-3 break-all font-mono text-xs leading-6 text-ink-subtle">
              {CONTACT_EMAIL}
            </p>

            <div className="mt-6 border-t border-border-subtle pt-5">
              <p className="text-xs uppercase tracking-[0.22em] text-ink-subtle">
                {copy.relatedLabel}
              </p>
              <Link
                href={copy.relatedHref}
                className="mt-3 inline-flex items-center gap-2 text-sm text-ink transition-colors hover:text-gold"
              >
                <FileText size={14} />
                {copy.relatedText}
              </Link>
            </div>

            <div className="mt-6 border-t border-border-subtle pt-5">
              <Link
                href="/"
                className="inline-flex text-sm text-ink-muted transition-colors hover:text-ink"
              >
                {copy.backHome}
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
