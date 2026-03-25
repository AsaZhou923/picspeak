import type { LocalizationResource } from '@clerk/shared/types';
import type { Locale } from './i18n';

const emailDeliveryNote = {
  zh: '如长时间未收到邮件，请检查垃圾邮件箱。',
  en: "If you don't receive the email after a while, please check your spam folder.",
  ja: 'しばらく経ってもメールが届かない場合は、迷惑メールフォルダもご確認ください。',
} as const satisfies Record<Locale, string>;

function withNote(message: string, note: string): string {
  return `${message} ${note}`;
}

const localizationByLocale: Record<Locale, LocalizationResource> = {
  zh: {
    locale: 'zh-CN',
    signUp: {
      emailLink: {
        subtitle: withNote('验证链接已发送到你的邮箱。', emailDeliveryNote.zh),
        formSubtitle: withNote('请点击邮件中的验证链接继续。', emailDeliveryNote.zh),
      },
      emailCode: {
        subtitle: withNote('验证码已发送到你的邮箱。', emailDeliveryNote.zh),
        formSubtitle: withNote('请输入发送到邮箱的验证码。', emailDeliveryNote.zh),
      },
    },
    signIn: {
      forgotPassword: {
        subtitle_email: withNote('重置密码邮件已发送。', emailDeliveryNote.zh),
      },
      emailCode: {
        subtitle: withNote('验证码已发送到你的邮箱。', emailDeliveryNote.zh),
      },
      emailLink: {
        subtitle: withNote('登录链接已发送到你的邮箱。', emailDeliveryNote.zh),
        formSubtitle: withNote('请点击邮件中的登录链接继续。', emailDeliveryNote.zh),
      },
      emailCodeMfa: {
        subtitle: withNote('验证码已发送到你的邮箱。', emailDeliveryNote.zh),
      },
      emailLinkMfa: {
        subtitle: withNote('验证链接已发送到你的邮箱。', emailDeliveryNote.zh),
        formSubtitle: withNote('请点击邮件中的验证链接继续。', emailDeliveryNote.zh),
      },
    },
    userProfile: {
      emailAddressPage: {
        formHint: withNote('我们会向该邮箱发送验证邮件。', emailDeliveryNote.zh),
        emailCode: {
          formSubtitle: withNote('请输入发送到该邮箱的验证码。', emailDeliveryNote.zh),
        },
        emailLink: {
          formSubtitle: withNote('请点击发送到该邮箱的验证链接继续。', emailDeliveryNote.zh),
        },
      },
    },
  },
  en: {
    locale: 'en-US',
    signUp: {
      emailLink: {
        subtitle: withNote('We sent a verification link to your email address.', emailDeliveryNote.en),
        formSubtitle: withNote('Open the link in your email to continue.', emailDeliveryNote.en),
      },
      emailCode: {
        subtitle: withNote('We sent a verification code to your email address.', emailDeliveryNote.en),
        formSubtitle: withNote('Enter the verification code from your email to continue.', emailDeliveryNote.en),
      },
    },
    signIn: {
      forgotPassword: {
        subtitle_email: withNote('We sent a password reset email to your inbox.', emailDeliveryNote.en),
      },
      emailCode: {
        subtitle: withNote('We sent a verification code to your email address.', emailDeliveryNote.en),
      },
      emailLink: {
        subtitle: withNote('We sent a sign-in link to your email address.', emailDeliveryNote.en),
        formSubtitle: withNote('Open the link in your email to continue.', emailDeliveryNote.en),
      },
      emailCodeMfa: {
        subtitle: withNote('We sent a verification code to your email address.', emailDeliveryNote.en),
      },
      emailLinkMfa: {
        subtitle: withNote('We sent a verification link to your email address.', emailDeliveryNote.en),
        formSubtitle: withNote('Open the link in your email to continue.', emailDeliveryNote.en),
      },
    },
    userProfile: {
      emailAddressPage: {
        formHint: withNote('We will send a verification email to this address.', emailDeliveryNote.en),
        emailCode: {
          formSubtitle: withNote('Enter the verification code sent to this email address.', emailDeliveryNote.en),
        },
        emailLink: {
          formSubtitle: withNote('Open the verification link sent to this email address to continue.', emailDeliveryNote.en),
        },
      },
    },
  },
  ja: {
    locale: 'ja-JP',
    signUp: {
      emailLink: {
        subtitle: withNote('確認リンクをメールで送信しました。', emailDeliveryNote.ja),
        formSubtitle: withNote('メール内の確認リンクを開いて続行してください。', emailDeliveryNote.ja),
      },
      emailCode: {
        subtitle: withNote('確認コードをメールで送信しました。', emailDeliveryNote.ja),
        formSubtitle: withNote('メールで届いた確認コードを入力してください。', emailDeliveryNote.ja),
      },
    },
    signIn: {
      forgotPassword: {
        subtitle_email: withNote('パスワード再設定メールを送信しました。', emailDeliveryNote.ja),
      },
      emailCode: {
        subtitle: withNote('確認コードをメールで送信しました。', emailDeliveryNote.ja),
      },
      emailLink: {
        subtitle: withNote('サインイン用リンクをメールで送信しました。', emailDeliveryNote.ja),
        formSubtitle: withNote('メール内のサインインリンクを開いて続行してください。', emailDeliveryNote.ja),
      },
      emailCodeMfa: {
        subtitle: withNote('確認コードをメールで送信しました。', emailDeliveryNote.ja),
      },
      emailLinkMfa: {
        subtitle: withNote('確認リンクをメールで送信しました。', emailDeliveryNote.ja),
        formSubtitle: withNote('メール内の確認リンクを開いて続行してください。', emailDeliveryNote.ja),
      },
    },
    userProfile: {
      emailAddressPage: {
        formHint: withNote('このメールアドレスに確認メールを送信します。', emailDeliveryNote.ja),
        emailCode: {
          formSubtitle: withNote('このメールアドレスに届いた確認コードを入力してください。', emailDeliveryNote.ja),
        },
        emailLink: {
          formSubtitle: withNote('このメールアドレスに届いた確認リンクを開いて続行してください。', emailDeliveryNote.ja),
        },
      },
    },
  },
};

export function getClerkLocalization(locale: Locale): LocalizationResource {
  return localizationByLocale[locale];
}
