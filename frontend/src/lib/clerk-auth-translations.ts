/*
 * MIT License
 *
 * Copyright (c) 2022 Clerk Inc
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Auth-only translations adapted from clerk/javascript at
 * 85dec028a0320c32023fa58139e269db0202b1eb, packages/localizations/src/{zh-CN,ja-JP}.ts.
 * Upstream translations are community maintained; retain this notice when updating.
 */
import type { LocalizationResource } from '@clerk/shared/types';

// Hosted Clerk UI also reads this key; the installed SDK types predate it.
export type ClerkAuthLocalization = LocalizationResource & {
  formFieldInputPlaceholder__signUpPassword?: string;
};

export const zhAuth: ClerkAuthLocalization = {
  "locale": "zh-CN",
  "backButton": "返回",
  "dividerText": "或者",
  "footerActionLink__useAnotherMethod": "使用另一种方法",
  "footerPageLink__help": "帮助",
  "footerPageLink__privacy": "隐私",
  "footerPageLink__terms": "条款",
  "formButtonPrimary": "继续",
  "formButtonPrimary__verify": "验证",
  "formFieldAction__forgotPassword": "忘记密码？",
  "formFieldError__matchingPasswords": "密码匹配。",
  "formFieldError__notMatchingPasswords": "密码不匹配。",
  "formFieldError__verificationLinkExpired": "验证链接已过期。请申请新的链接。",
  "formFieldHintText__optional": "选填",
  "formFieldInputPlaceholder__emailAddress": "请输入您的电子邮件地址",
  "formFieldInputPlaceholder__password": "请输入密码",
  "formFieldInputPlaceholder__signUpPassword": "创建密码",
  "formFieldInputPlaceholder__emailAddress_username": "请输入电子邮件地址或用户名",
  "formFieldInputPlaceholder__username": "请输入用户名",
  "formFieldInputPlaceholder__firstName": "请输入名字",
  "formFieldInputPlaceholder__lastName": "请输入姓氏",
  "formFieldInputPlaceholder__emailAddresses": "输入或粘贴一个或多个电子邮件地址，用空格或逗号分隔",
  "formFieldLabel__backupCode": "备用代码",
  "formFieldLabel__confirmPassword": "确认密码",
  "formFieldLabel__currentPassword": "当前密码",
  "formFieldLabel__emailAddress": "电子邮件地址",
  "formFieldLabel__emailAddress_username": "电子邮件地址或用户名",
  "formFieldLabel__emailAddresses": "电子邮件地址",
  "formFieldLabel__firstName": "名字",
  "formFieldLabel__lastName": "姓氏",
  "formFieldLabel__newPassword": "新密码",
  "formFieldLabel__password": "密码",
  "formFieldLabel__phoneNumber": "电话号码",
  "formFieldLabel__signOutOfOtherSessions": "登出所有其他设备",
  "formFieldLabel__username": "用户名",
  "lastAuthenticationStrategy": "上次使用",
  "signIn": {
    "accountSwitcher": {
      "action__addAccount": "添加账户",
      "action__signOutAll": "退出所有账户",
      "subtitle": "选择您要继续使用的账户。",
      "title": "选择一个账户"
    },
    "alternativeMethods": {
      "actionLink": "获取帮助",
      "actionText": "没有这些？",
      "blockButton__backupCode": "使用备用代码",
      "blockButton__emailCode": "电子邮件验证码到 {{identifier}}",
      "blockButton__emailLink": "电子邮件链接到 {{identifier}}",
      "blockButton__password": "使用您的密码登录",
      "blockButton__phoneCode": "发送短信代码到 {{identifier}}",
      "blockButton__totp": "使用您的验证应用程序",
      "getHelp": {
        "blockButton__emailSupport": "邮件支持",
        "content": "如果您在登录账户时遇到困难，请给我们发送电子邮件，我们将尽快让您恢复访问。",
        "title": "获取帮助"
      },
      "subtitle": "遇到问题？您可以使用以下任何方法登录。",
      "title": "使用其他方法"
    },
    "backupCodeMfa": {
      "subtitle": "继续使用 {{applicationName}}",
      "title": "输入备用代码"
    },
    "emailCode": {
      "formTitle": "验证码",
      "resendButton": "重新发送验证码",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "查看您的电子邮件"
    },
    "emailCodeMfa": {
      "formTitle": "查看您的电子邮件",
      "resendButton": "未收到验证码？重新发送",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "查看您的电子邮件"
    },
    "emailLink": {
      "expired": {
        "subtitle": "返回原始标签页继续。",
        "title": "此验证链接已过期"
      },
      "failed": {
        "subtitle": "返回原始标签页继续。",
        "title": "此验证链接无效"
      },
      "formSubtitle": "使用发送到您的电子邮件的验证链接",
      "formTitle": "验证链接",
      "loading": {
        "subtitle": "即将为您重定向",
        "title": "正在登录..."
      },
      "resendButton": "重新发送链接",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "查看您的电子邮件",
      "unusedTab": {
        "title": "您可以关闭此标签页"
      },
      "verified": {
        "subtitle": "即将为您重定向",
        "title": "成功登录"
      },
      "verifiedSwitchTab": {
        "subtitle": "返回原始标签页继续",
        "subtitleNewTab": "返回新打开的标签页继续",
        "titleNewTab": "在其他标签页上登录"
      }
    },
    "emailLinkMfa": {
      "formSubtitle": "使用发送到您电子邮件的验证链接",
      "resendButton": "没有收到链接？重新发送",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "查看您的电子邮件"
    },
    "forgotPassword": {
      "formTitle": "重置密码代码",
      "resendButton": "重新发送代码",
      "subtitle": "以重置您的密码",
      "subtitle_email": "首先，输入发送到您的电子邮件 ID 的代码",
      "subtitle_phone": "首先，输入发送到您手机的代码",
      "title": "重置密码"
    },
    "forgotPasswordAlternativeMethods": {
      "blockButton__resetPassword": "重置密码",
      "label__alternativeMethods": "或者，使用其他方式登录。",
      "title": "忘记密码？"
    },
    "newDeviceVerificationNotice": "您正在从新设备登录。我们需要验证以保护您的账户安全。",
    "noAvailableMethods": {
      "message": "无法继续登录。没有可用的身份验证因素。",
      "subtitle": "出现错误",
      "title": "无法登录"
    },
    "password": {
      "actionLink": "使用其他方法",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "输入您的密码"
    },
    "phoneCode": {
      "formTitle": "验证码",
      "resendButton": "重新发送验证码",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "检查手机短信"
    },
    "phoneCodeMfa": {
      "formTitle": "验证码",
      "resendButton": "重新发送验证码",
      "subtitle": "请继续输入发送到您手机的验证码。",
      "title": "检查手机短信"
    },
    "resetPassword": {
      "formButtonPrimary": "重置密码",
      "requiredMessage": "出于安全原因，需要重置您的密码。",
      "successMessage": "您的密码已成功更改。正在为您登录，请稍等。",
      "title": "重置密码"
    },
    "resetPasswordMfa": {
      "detailsLabel": "我们需要验证您的身份才能重置您的密码。"
    },
    "start": {
      "actionLink": "注册",
      "actionLink__use_email": "使用电子邮件",
      "actionLink__use_email_username": "使用电子邮件或用户名",
      "actionLink__use_phone": "使用电话",
      "actionLink__use_username": "使用用户名",
      "actionText": "还没有账户？",
      "subtitle": "欢迎回来！请登录您的账户以继续。",
      "title": "登录 {{applicationName}}",
      "titleCombined": "继续使用 {{applicationName}}"
    },
    "totpMfa": {
      "formTitle": "验证码",
      "subtitle": "请继续输入由您的身份验证应用生成的验证码。",
      "title": "两步验证"
    },
    "web3Solana": {
      "subtitle": "请选择下方的钱包进行登录",
      "title": "使用 Solana 登录"
    }
  },
  "signInEnterPasswordTitle": "输入您的密码",
  "signUp": {
    "continue": {
      "actionLink": "登录",
      "actionText": "已经有账户了？",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "填写缺少的字段"
    },
    "emailCode": {
      "formSubtitle": "输入发送到您的电子邮件地址的验证码",
      "formTitle": "验证码",
      "resendButton": "重新发送验证码",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "验证您的电子邮件"
    },
    "emailLink": {
      "formSubtitle": "使用发送到您的电子邮件地址的验证链接",
      "formTitle": "验证链接",
      "loading": {
        "title": "正在注册..."
      },
      "resendButton": "重新发送链接",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "验证您的电子邮件",
      "verified": {
        "title": "成功注册"
      },
      "verifiedSwitchTab": {
        "subtitle": "返回新打开的标签页继续",
        "subtitleNewTab": "返回上一个标签页继续",
        "title": "成功验证电子邮件"
      }
    },
    "phoneCode": {
      "formSubtitle": "输入发送到您的电话号码的验证码",
      "formTitle": "验证码",
      "resendButton": "重新发送验证码",
      "subtitle": "继续使用 {{applicationName}}",
      "title": "验证您的电话"
    },
    "start": {
      "actionLink": "登录",
      "actionText": "已经有账户了？",
      "subtitle": "继续使用 {{applicationName}}",
      "subtitleCombined": "继续使用 {{applicationName}}",
      "title": "创建您的账户",
      "titleCombined": "创建您的账户"
    },
    "web3Solana": {
      "subtitle": "请选择下方的钱包进行注册",
      "title": "使用 Solana 注册"
    }
  },
  "socialButtonsBlockButton": "使用 {{provider|titleize}} 登录",
  "unstable__errors": {
    "avatar_file_size_exceeded": "文件大小超过10MB的最大限制。请选择一个较小的文件。",
    "avatar_file_type_invalid": "不支持的文件类型。请上传 JPG、PNG、GIF 或 WEBP 格式的图片。",
    "captcha_invalid": "由于安全验证失败，注册未成功。请刷新页面重试或联系支持获取更多帮助。",
    "captcha_unavailable": "注册失败，原因是未通过机器人验证。请刷新页面重试或联系支持团队以获取更多帮助。",
    "form_email_address_blocked": "不支持临时电子邮件服务。请使用您的常规电子邮件地址创建账户。",
    "form_identifier_not_found": "我们无法找到具有这些信息的账户。",
    "form_param_format_invalid__email_address": "邮箱地址必须是有效的邮箱格式。",
    "form_param_format_invalid__phone_number": "电话号码必须符合有效的国际格式。",
    "form_param_max_length_exceeded__first_name": "名字长度不得超过256个字符。",
    "form_param_max_length_exceeded__last_name": "姓氏长度不得超过256个字符。",
    "form_param_max_length_exceeded__name": "姓名长度不得超过256个字符。",
    "form_password_not_strong_enough": "您的密码强度不够。",
    "form_password_or_identifier_incorrect": "密码或电子邮件地址不正确。请重试或使用其他方法。",
    "form_password_pwned": "这个密码在数据泄露中被发现，不能使用，请换一个密码试试。",
    "form_password_size_in_bytes_exceeded": "您的密码超过了允许的最大字节数，请缩短它或去掉一些特殊字符。",
    "form_password_validation_failed": "密码错误",
    "form_username_needs_non_number_char": "您的用户名必须包含至少一个非数字字符。",
    "identification_deletion_failed": "您无法删除最后一个身份标识。",
    "not_allowed_access": "您使用的电子邮件地址或电话号码不允许注册。这可能是因为您在电子邮件地址中使用了 '+', '=', '#' 或 '.'，使用了与临时电子邮件服务关联的域名，或者有明确的排除。如果您认为这是错误，请联系支持。",
    "passwordComplexity": {
      "maximumLength": "少于{{length}}个字符",
      "minimumLength": "{{length}}个或更多字符",
      "requireLowercase": "一个小写字母",
      "requireNumbers": "一个数字",
      "requireSpecialCharacter": "一个特殊字符",
      "requireUppercase": "一个大写字母",
      "sentencePrefix": "您的密码必须包含"
    },
    "phone_number_exists": "该电话号码已被使用，请尝试其他号码。",
    "session_exists": "您已登录。",
    "web3_signature_request_rejected": "您已拒绝签名请求。请重试以继续。",
    "web3_solana_signature_generation_failed": "生成签名时发生错误。请重试以继续。",
    "zxcvbn": {
      "couldBeStronger": "您的密码可以用，但可以更强。试着添加更多字符。",
      "goodPassword": "做得好。这是一个优秀的密码。",
      "notEnough": "您的密码强度不够。",
      "suggestions": {
        "allUppercase": "大写一些，但不是所有的字母。",
        "anotherWord": "添加更不常见的更多单词。",
        "associatedYears": "避免与你有关的年份。",
        "capitalization": "大写不仅仅是第一个字母。",
        "dates": "避免与你有关的日期和年份。",
        "l33t": "避免预测的字母替换，如\"@\"代替\"a\"。",
        "longerKeyboardPattern": "使用更长的键盘模式，并多次改变打字方向。",
        "noNeed": "你可以创建强密码，而无需使用符号，数字或大写字母。",
        "pwned": "如果您在其他地方使用此密码，您应该更改它。",
        "recentYears": "避免近年来。",
        "repeated": "避免重复的单词和字符。",
        "reverseWords": "避免常用词的反向拼写。",
        "sequences": "避免常见字符序列。",
        "useWords": "使用多个单词，但避免常见短语。"
      },
      "warnings": {
        "common": "这是一个常用的密码。",
        "commonNames": "常见的名字和姓氏易被猜到。",
        "dates": "日期易被猜到。",
        "extendedRepeat": "像\"abcabcabc\"这样的重复字符模式易被猜到。",
        "keyPattern": "短键盘模式易被猜到。",
        "namesByThemselves": "单个名字或姓氏易被猜到。",
        "pwned": "您的密码在互联网上的数据泄露中被暴露。",
        "recentYears": "近年来易被猜到。",
        "sequences": "像\"abc\"这样的常见字符序列易被猜到。",
        "similarToCommon": "这个密码和常用密码相似。",
        "simpleRepeat": "像\"aaa\"这样的重复字符易被猜到。",
        "straightRow": "键盘上的直行键易被猜到。",
        "topHundred": "这是一个频繁使用的密码。",
        "topTen": "这是一个大量使用的密码。",
        "userInputs": "不应该有任何个人或页面相关的数据。",
        "wordByItself": "单个单词易被猜到。"
      }
    },
    "form_password_incorrect": "密码不正确，请重试。",
    "form_password_length_too_short": "密码太短，请使用更长的密码。",
    "form_identifier_exists__email_address": "此邮箱地址已被使用，请登录或使用其他邮箱。",
    "form_code_incorrect": "验证码不正确，请重试。",
    "form_param_format_invalid": "输入格式不正确，请检查后重试。",
    "form_param_nil": "请填写此字段。"
  }
};

export const jaAuth: ClerkAuthLocalization = {
  "locale": "ja-JP",
  "backButton": "戻る",
  "dividerText": "または",
  "footerActionLink__alternativePhoneCodeProvider": "代わりにSMSでコードを送信",
  "footerActionLink__useAnotherMethod": "別の方法を使用する",
  "footerPageLink__help": "ヘルプ",
  "footerPageLink__privacy": "プライバシー",
  "footerPageLink__terms": "利用規約",
  "formButtonPrimary": "続ける",
  "formButtonPrimary__verify": "確認する",
  "formFieldAction__forgotPassword": "パスワードをお忘れですか？",
  "formFieldError__matchingPasswords": "パスワードが一致します。",
  "formFieldError__notMatchingPasswords": "パスワードが一致しません。",
  "formFieldError__verificationLinkExpired": "検証リンクの有効期限が切れています。新しいリンクをリクエストしてください。",
  "formFieldHintText__optional": "任意",
  "formFieldInputPlaceholder__backupCode": "バックアップコードを入力",
  "formFieldInputPlaceholder__emailAddress": "メールアドレスを入力",
  "formFieldInputPlaceholder__emailAddress_username": "メールアドレスまたはユーザー名",
  "formFieldInputPlaceholder__emailAddresses": "example@email.com, example2@email.com",
  "formFieldInputPlaceholder__firstName": "名",
  "formFieldInputPlaceholder__lastName": "姓",
  "formFieldInputPlaceholder__password": "パスワードを入力",
  "formFieldInputPlaceholder__signUpPassword": "パスワードを作成",
  "formFieldInputPlaceholder__phoneNumber": "電話番号を入力",
  "formFieldInputPlaceholder__username": "ユーザー名を入力",
  "formFieldInput__emailAddress_format": "例: name@example.com",
  "formFieldLabel__backupCode": "バックアップコード",
  "formFieldLabel__confirmPassword": "パスワードの確認",
  "formFieldLabel__currentPassword": "現在のパスワード",
  "formFieldLabel__emailAddress": "メールアドレス",
  "formFieldLabel__emailAddress_username": "メールアドレスまたはユーザー名",
  "formFieldLabel__emailAddresses": "メールアドレス",
  "formFieldLabel__firstName": "名",
  "formFieldLabel__lastName": "姓",
  "formFieldLabel__newPassword": "新しいパスワード",
  "formFieldLabel__passkeyName": "パスキー名",
  "formFieldLabel__password": "パスワード",
  "formFieldLabel__phoneNumber": "電話番号",
  "formFieldLabel__signOutOfOtherSessions": "他の全てのデバイスからサインアウト",
  "formFieldLabel__username": "ユーザー名",
  "lastAuthenticationStrategy": "最後に使用したもの",
  "signIn": {
    "accountSwitcher": {
      "action__addAccount": "アカウントを追加",
      "action__signOutAll": "全てのアカウントからサインアウト",
      "subtitle": "続行するアカウントを選択してください。",
      "title": "アカウントを選択"
    },
    "alternativeMethods": {
      "actionLink": "ヘルプを取得",
      "actionText": "これらのいずれも持っていませんか？",
      "blockButton__backupCode": "バックアップコードを使用する",
      "blockButton__emailCode": "{{identifier}}にメールコードを送信",
      "blockButton__emailLink": "{{identifier}}にメールリンクを送信",
      "blockButton__passkey": "パスキーでサインインする",
      "blockButton__password": "パスワードでサインインする",
      "blockButton__phoneCode": "{{identifier}}にSMSコードを送信",
      "blockButton__totp": "認証アプリを使用する",
      "getHelp": {
        "blockButton__emailSupport": "メールサポート",
        "content": "アカウントにサインインできない場合は、メールでお問い合わせいただければ、できるだけ早くアクセスを回復するためにお手伝いいたします。",
        "title": "ヘルプを取得"
      },
      "subtitle": "問題が発生していますか？これらの方法を使用してサインインすることができます。",
      "title": "別の方法を使用"
    },
    "alternativePhoneCodeProvider": {
      "formTitle": "検証コード",
      "resendButton": "コードが届いていませんか？再送信",
      "subtitle": "{{applicationName}} へ進む",
      "title": "{{provider}} を確認してください"
    },
    "backupCodeMfa": {
      "subtitle": "バックアップコードは、二段階認証の設定時に受け取ったものです",
      "title": "バックアップコードを入力"
    },
    "emailCode": {
      "formTitle": "検証コード",
      "resendButton": "コードを再送信",
      "subtitle": "{{applicationName}} へ進む",
      "title": "メールを確認"
    },
    "emailCodeMfa": {
      "formTitle": "メールを確認",
      "resendButton": "コードが届いていませんか？再送信",
      "subtitle": "{{applicationName}} へ進む",
      "title": "メールを確認"
    },
    "emailLink": {
      "clientMismatch": {
        "subtitle": "続行するには、サインインを開始したデバイスとブラウザで検証リンクを開いてください",
        "title": "このデバイスでは検証リンクが無効です"
      },
      "expired": {
        "subtitle": "元のタブに戻って続行してください。",
        "title": "この検証リンクは期限切れです"
      },
      "failed": {
        "subtitle": "元のタブに戻って続行してください。",
        "title": "この検証リンクは無効です"
      },
      "formSubtitle": "メールに送信された検証リンクを使用してください",
      "formTitle": "検証リンク",
      "loading": {
        "subtitle": "まもなくリダイレクトされます",
        "title": "サインイン中..."
      },
      "resendButton": "リンクを再送信",
      "subtitle": "{{applicationName}} へ進む",
      "title": "メールを確認",
      "unusedTab": {
        "title": "このタブを閉じてもかまいません"
      },
      "verified": {
        "subtitle": "まもなくリダイレクトされます",
        "title": "サインインが完了しました"
      },
      "verifiedSwitchTab": {
        "subtitle": "続行するには元のタブに戻ってください",
        "subtitleNewTab": "新しく開いたタブに戻って続行してください",
        "titleNewTab": "他のタブでサインイン済み"
      }
    },
    "emailLinkMfa": {
      "formSubtitle": "メールに送信された確認リンクを使用してください",
      "resendButton": "リンクが届いていませんか？再送信",
      "subtitle": "{{applicationName}} へ進む",
      "title": "メールを確認してください"
    },
    "enterpriseConnections": {
      "subtitle": "続行するエンタープライズアカウントを選択してください。",
      "title": "エンタープライズアカウントを選択"
    },
    "forgotPassword": {
      "formTitle": "パスワードリセットコード",
      "resendButton": "コードを再送信",
      "subtitle": "パスワードをリセットするために",
      "subtitle_email": "まず、メールアドレスに送信されたコードを入力してください",
      "subtitle_phone": "まず、電話に送信されたコードを入力してください",
      "title": "パスワードをリセット"
    },
    "forgotPasswordAlternativeMethods": {
      "blockButton__resetPassword": "パスワードをリセット",
      "label__alternativeMethods": "または、別の方法でサインインしてください。",
      "title": "パスワードをお忘れですか？"
    },
    "newDeviceVerificationNotice": "新しいデバイスからサインインしています。アカウントのセキュリティを保つため、確認をお願いしています。",
    "noAvailableMethods": {
      "message": "サインインできません。利用可能な認証方法がありません。",
      "subtitle": "エラーが発生しました",
      "title": "サインインできません"
    },
    "passkey": {
      "subtitle": "パスキーを使用すると、ご本人であることを確認できます。デバイスから指紋認証、顔認証、または画面ロックの解除を求められる場合があります。",
      "title": "パスキーを使用する"
    },
    "password": {
      "actionLink": "別の方法を使用",
      "subtitle": "アカウントに関連付けられたパスワードを入力してください",
      "title": "パスワードを入力"
    },
    "passwordCompromised": {
      "title": "漏洩したパスワード"
    },
    "passwordPwned": {
      "title": "漏洩したパスワード"
    },
    "passwordUntrusted": {
      "title": "信頼できないパスワード"
    },
    "phoneCode": {
      "formTitle": "検証コード",
      "resendButton": "コードを再送信",
      "subtitle": "{{applicationName}} へ進む",
      "title": "電話を確認してください"
    },
    "phoneCodeMfa": {
      "formTitle": "検証コード",
      "resendButton": "コードを再送信",
      "subtitle": "続行するには、電話に送信された検証コードを入力してください",
      "title": "電話を確認してください"
    },
    "resetPassword": {
      "formButtonPrimary": "パスワードをリセット",
      "requiredMessage": "セキュリティ上の理由から、パスワードのリセットが必要です。",
      "successMessage": "パスワードが正常に変更されました。お待ちください、サインインしています。",
      "title": "パスワードをリセット"
    },
    "resetPasswordMfa": {
      "detailsLabel": "パスワードをリセットする前に、身元を確認する必要があります。"
    },
    "start": {
      "actionLink": "サインアップ",
      "actionLink__join_waitlist": "ウェイトリストに登録",
      "actionLink__use_email": "メールアドレスを使用",
      "actionLink__use_email_username": "メールアドレスまたはユーザー名を使用",
      "actionLink__use_passkey": "代わりにパスキーを使用",
      "actionLink__use_phone": "電話番号を使用",
      "actionLink__use_username": "ユーザー名を使用",
      "actionText": "アカウントをお持ちでないですか？",
      "actionText__join_waitlist": "先行体験にご興味ありますか？",
      "alternativePhoneCodeProvider": {
        "actionLink": "別の方法を使用",
        "label": "{{provider}} の電話番号",
        "subtitle": "{{provider}} で検証コードを受け取るための電話番号を入力してください。",
        "title": "{{provider}} を使って {{applicationName}} にサインイン"
      },
      "subtitle": "お帰りなさい！続行するにはサインインしてください",
      "subtitleCombined": "お帰りなさい！続行するにはサインインしてください",
      "title": "{{applicationName}} にサインイン",
      "titleCombined": "{{applicationName}} へ進む"
    },
    "totpMfa": {
      "formTitle": "検証コード",
      "subtitle": "続行するには、認証アプリで生成された検証コードを入力してください",
      "title": "二段階認証"
    },
    "web3Solana": {
      "subtitle": "サインインするには下のウォレットを選択してください",
      "title": "Solana でサインイン"
    }
  },
  "signInEnterPasswordTitle": "パスワードを入力してください",
  "signUp": {
    "alternativePhoneCodeProvider": {
      "resendButton": "コードが届いていませんか？再送信",
      "subtitle": "{{provider}} に送信された確認コードを入力してください",
      "title": "{{provider}} を確認してください"
    },
    "continue": {
      "actionLink": "サインイン",
      "actionText": "アカウントをお持ちですか？",
      "subtitle": "続行するには残りの詳細を入力してください",
      "title": "未入力のフィールドを入力"
    },
    "emailCode": {
      "formSubtitle": "メールアドレスに送信された確認コードを入力してください",
      "formTitle": "確認コード",
      "resendButton": "コードを再送信",
      "subtitle": "メールに送信された確認コードを入力してください",
      "title": "メールアドレスを確認"
    },
    "emailLink": {
      "clientMismatch": {
        "subtitle": "続行するには、サインアップを開始したデバイスとブラウザで検証リンクを開いてください",
        "title": "このデバイスでは検証リンクが無効です"
      },
      "formSubtitle": "メールアドレスに送信された確認リンクを使用してください",
      "formTitle": "確認リンク",
      "loading": {
        "title": "登録中..."
      },
      "resendButton": "リンクを再送信",
      "subtitle": "{{applicationName}} へ進む",
      "title": "メールアドレスを確認",
      "verified": {
        "title": "登録が完了しました"
      },
      "verifiedSwitchTab": {
        "subtitle": "続行するために新しく開いたタブに戻ってください",
        "subtitleNewTab": "続行するために前のタブに戻ってください",
        "title": "メールアドレスが正常に確認されました"
      }
    },
    "enterpriseConnections": {
      "subtitle": "続行するエンタープライズアカウントを選択してください。",
      "title": "エンタープライズアカウントを選択"
    },
    "legalConsent": {
      "checkbox": {
        "label__onlyPrivacyPolicy": "{{privacyPolicyLink || link(\"個人情報保護方針\")}}に同意します",
        "label__onlyTermsOfService": "{{termsOfServiceLink || link(\"利用規約\")}}に同意します",
        "label__termsOfServiceAndPrivacyPolicy": "{{termsOfServiceLink || link(\"利用規約\")}}と{{privacyPolicyLink || link(\"個人情報保護方針\")}}に同意します"
      },
      "continue": {
        "subtitle": "続行する前に、利用条件を読み同意してください",
        "title": "法的同意"
      }
    },
    "phoneCode": {
      "formSubtitle": "電話番号に送信された確認コードを入力してください",
      "formTitle": "確認コード",
      "resendButton": "コードを再送信",
      "subtitle": "電話に送信された確認コードを入力してください",
      "title": "電話番号を確認"
    },
    "restrictedAccess": {
      "actionLink": "サインイン",
      "actionText": "既にアカウントをお持ちですか？",
      "blockButton__emailSupport": "サポートに連絡",
      "blockButton__joinWaitlist": "待機リストに参加",
      "subtitle": "現在サインアップは無効になっています。アクセス権限があると思われる場合は、サポートまでご連絡ください。",
      "subtitleWaitlist": "現在サインアップは無効になっています。リリース時に最初に通知を受け取るには、待機リストにご参加ください。",
      "title": "アクセス制限"
    },
    "start": {
      "actionLink": "サインイン",
      "actionLink__use_email": "代わりにメールアドレスを使用",
      "actionLink__use_phone": "代わりに電話番号を使用",
      "actionText": "アカウントをお持ちですか？",
      "alternativePhoneCodeProvider": {
        "actionLink": "別の方法を使用",
        "label": "{{provider}} の電話番号",
        "subtitle": "{{provider}} で検証コードを受け取るための電話番号を入力してください。",
        "title": "{{provider}} を使って {{applicationName}} にサインアップ"
      },
      "subtitle": "ようこそ！始めるには詳細を入力してください",
      "subtitleCombined": "ようこそ！始めるには詳細を入力してください",
      "title": "アカウントを作成",
      "titleCombined": "アカウントを作成"
    },
    "web3Solana": {
      "subtitle": "サインアップするには下のウォレットを選択してください",
      "title": "Solana でサインアップ"
    }
  },
  "socialButtonsBlockButton": "{{provider|titleize}}で続ける",
  "socialButtonsBlockButtonManyInView": "{{provider|titleize}}",
  "unstable__errors": {
    "already_a_member_in_organization": "{{email}} は既にこの組織のメンバーです。",
    "avatar_file_size_exceeded": "ファイルサイズが10MBの上限を超えています。より小さいファイルを選択してください。",
    "avatar_file_type_invalid": "サポートされていないファイル形式です。JPG、PNG、GIF、またはWEBP画像をアップロードしてください。",
    "captcha_invalid": "セキュリティ検証に失敗しました。もう一度お試しください。",
    "captcha_unavailable": "ボット検証に失敗したため、サインアップに失敗しました。ページを更新して再試行するか、サポートに連絡してさらに支援を受けてください。",
    "form_code_incorrect": "入力されたコードが正しくありません。",
    "form_email_address_blocked": "一時的なメールサービスはサポートされていません。アカウントを作成するには、通常のメールアドレスを使用してください。",
    "form_identifier_exists__email_address": "このメールアドレスは既に使用されています。別のものをお試しください。",
    "form_identifier_exists__phone_number": "この電話番号は既に使用されています。別のものをお試しください。",
    "form_identifier_exists__username": "このユーザー名は既に使用されています。別のものをお試しください。",
    "form_identifier_not_found": "その情報に一致するアカウントが見つかりませんでした。",
    "form_new_password_matches_current": "新しいパスワードを現在のパスワードと同じにすることはできません。",
    "form_param_format_invalid": "入力された値の形式が正しくありません。確認して修正してください。",
    "form_param_format_invalid__email_address": "メールアドレスの形式が正しくありません。",
    "form_param_format_invalid__phone_number": "電話番号は有効な国際形式で入力してください。",
    "form_param_max_length_exceeded__first_name": "名は256文字以内で入力してください。",
    "form_param_max_length_exceeded__last_name": "姓は256文字以内で入力してください。",
    "form_param_max_length_exceeded__name": "名前は256文字以内で入力してください。",
    "form_param_nil": "この項目は必須です。空欄にはできません。",
    "form_param_type_invalid": "入力された値の型が正しくありません。",
    "form_param_type_invalid__email_address": "メールアドレスは有効な文字列である必要があります。",
    "form_param_type_invalid__phone_number": "電話番号は有効な文字列である必要があります。",
    "form_param_value_invalid": "入力された値が無効です。修正してください。",
    "form_password_compromised__sign_in": "このパスワードは侵害された可能性があります。アカウントを保護するため、別のサインイン方法を使用してください。サインイン後にパスワードのリセットが必要になります。",
    "form_password_incorrect": "入力されたパスワードが正しくありません。もう一度お試しください。",
    "form_password_length_too_short": "パスワードが短すぎます。より長いパスワードを設定してください。",
    "form_password_not_strong_enough": "パスワードの強度が不十分です。",
    "form_password_or_identifier_incorrect": "パスワードまたはメールアドレスが正しくありません。もう一度お試しいただくか、別の方法をご利用ください。",
    "form_password_pwned": "このパスワードは侵害の一部として見つかったため使用できません。別のパスワードを試してください。",
    "form_password_pwned__sign_in": "このパスワードは侵害の一部として見つかったため使用できません。パスワードをリセットしてください。",
    "form_password_size_in_bytes_exceeded": "パスワードのバイト数が上限を超えています。短くするか、一部の特殊文字を削除してください。",
    "form_password_untrusted__sign_in": "このパスワードは安全でない可能性があります。アカウントを保護するため、別のサインイン方法を使用してください。サインイン後にパスワードのリセットが必要になります。",
    "form_password_validation_failed": "パスワードが間違っています",
    "form_username_invalid_character": "ユーザー名に無効な文字が含まれています。",
    "form_username_invalid_length": "ユーザー名は{{min_length}}文字以上{{max_length}}文字以下である必要があります。",
    "form_username_needs_non_number_char": "ユーザー名には少なくとも1つの数字以外の文字が含まれている必要があります。",
    "identification_deletion_failed": "最後の識別情報は削除できません。",
    "not_allowed_access": "メールアドレスまたは電話番号は登録に使用できません。これは、'+', '=', '#' または '.' がメールアドレスに使用されているか、一時的な電子メールサービスに接続されたドメインが使用されているか、明示的な除外が行われているためです。エラーが発生した場合は、サポートに連絡してください。",
    "organization_domain_blocked": "このメールプロバイダーのドメインはブロックされています。別のものを使用してください。",
    "organization_domain_common": "これは一般的なメールプロバイダーのドメインです。別のものを使用してください。",
    "organization_domain_exists_for_enterprise_connection": "このドメインは組織の SSO で既に使用されています。",
    "organization_membership_quota_exceeded": "保留中の招待を含め、組織のメンバー数の上限に達しました。",
    "organization_minimum_permissions_needed": "必要な最小権限を持つ組織メンバーが少なくとも1人必要です。",
    "organization_not_found_or_unauthorized": "この組織のメンバーではなくなりました。別の組織を選択するか、新しく作成してください。",
    "organization_not_found_or_unauthorized_with_create_organization_disabled": "この組織のメンバーではなくなりました。別の組織を選択してください。",
    "passkey_already_exists": "このデバイスには既にパスキーが登録されています。",
    "passkey_not_supported": "このデバイスではパスキーはサポートされていません。",
    "passkey_pa_not_supported": "登録にはプラットフォーム認証器が必要ですが、このデバイスは対応していません。",
    "passkey_registration_cancelled": "パスキーの登録はキャンセルされたか、タイムアウトしました。",
    "passkey_retrieval_cancelled": "パスキーの確認はキャンセルされたか、タイムアウトしました。",
    "passwordComplexity": {
      "maximumLength": "{{length}}文字未満",
      "minimumLength": "{{length}}文字以上",
      "requireLowercase": "小文字を含む",
      "requireNumbers": "数字を含む",
      "requireSpecialCharacter": "特殊文字を含む",
      "requireUppercase": "大文字を含む",
      "sentencePrefix": "パスワードは次の条件を満たす必要があります："
    },
    "phone_number_exists": "この電話番号は既に使用されています。別のものをお試しください。",
    "session_exists": "既にサインインしています。",
    "web3_missing_identifier": "Web3ウォレット拡張機能が見つかりません。続行するにはインストールしてください。",
    "web3_signature_request_rejected": "署名リクエストを拒否しました。続行するにはもう一度お試しください。",
    "web3_solana_signature_generation_failed": "署名の生成中にエラーが発生しました。続行するにはもう一度お試しください。",
    "zxcvbn": {
      "couldBeStronger": "パスワードは有効ですが、もう少し強化できます。文字を追加してみてください。",
      "goodPassword": "パスワードは全ての要件を満たしています。",
      "notEnough": "パスワードの強度が十分ではありません。",
      "suggestions": {
        "allUppercase": "全ての文字を大文字にするのではなく、一部の文字を大文字にしてください。",
        "anotherWord": "より一般的でない単語を追加してください。",
        "associatedYears": "自分に関連する年号は避けてください。",
        "capitalization": "最初の文字以外も大文字にしてください。",
        "dates": "自分に関連する日付や年号は避けてください。",
        "l33t": "予測可能な文字の代替（例：'@' で 'a' を置き換える）を避けてください。",
        "longerKeyboardPattern": "長いキーボードパターンを使用し、タイピングの方向を複数回変えてください。",
        "noNeed": "シンボル、数字、大文字の使用なしでも強力なパスワードを作成できます。",
        "pwned": "他の場所でこのパスワードを使用している場合は、変更する必要があります。",
        "recentYears": "最近の年号は避けてください。",
        "repeated": "繰り返される単語や文字を避けてください。",
        "reverseWords": "一般的な単語の逆さ読みは避けてください。",
        "sequences": "一般的な文字の並びを避けてください。",
        "useWords": "複数の単語を使用してくださいが、一般的なフレーズは避けてください。"
      },
      "warnings": {
        "common": "これは一般的に使われるパスワードです。",
        "commonNames": "一般的な名前や姓は推測しやすいです。",
        "dates": "日付は推測しやすいです。",
        "extendedRepeat": "\"abcabcabc\" といった繰り返しパターンは推測しやすいです。",
        "keyPattern": "短いキーボードパターンは推測しやすいです。",
        "namesByThemselves": "単体の名前や姓は推測しやすいです。",
        "pwned": "このパスワードはインターネット上のデータ侵害によって公開されています。",
        "recentYears": "最近の年号は推測しやすいです。",
        "sequences": "\"abc\" といった一般的な文字の並びは推測しやすいです。",
        "similarToCommon": "これは一般的に使われるパスワードに類似しています。",
        "simpleRepeat": "\"aaa\" といった繰り返し文字は推測しやすいです。",
        "straightRow": "キーボード上の連続した行は推測しやすいです。",
        "topHundred": "これは頻繁に使われるパスワードです。",
        "topTen": "これはよく使われるパスワードです。",
        "userInputs": "個人情報やページに関連するデータは含まれていないはずです。",
        "wordByItself": "単語単体では推測しやすいです。"
      }
    }
  }
};
