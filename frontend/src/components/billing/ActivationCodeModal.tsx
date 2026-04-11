'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { useAuth } from '@/lib/auth-context';
import { redeemActivationCode } from '@/lib/api';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n } from '@/lib/i18n';
import { ActivationCodeRedeemResponse } from '@/lib/types';

type ActivationCodeModalProps = {
  open: boolean;
  onClose: () => void;
  onRedeemed?: (result: ActivationCodeRedeemResponse) => void | Promise<void>;
};

function formatActivationDate(value: string, locale: 'zh' | 'en' | 'ja'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const localeMap = {
    zh: 'zh-CN',
    en: 'en-US',
    ja: 'ja-JP',
  } as const;

  return new Intl.DateTimeFormat(localeMap[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function ActivationCodeModal({
  open,
  onClose,
  onRedeemed,
}: ActivationCodeModalProps) {
  const { t, locale } = useI18n();
  const { ensureToken, userInfo, syncPlan } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setCode('');
      setMessage('');
      setRedeeming(false);
    }
  }, [open]);

  async function handleRedeem() {
    if (redeeming || !code.trim()) {
      return;
    }

    setRedeeming(true);
    setMessage('');
    try {
      const token = await ensureToken();
      const result = await redeemActivationCode(token, code);
      syncPlan(result.plan);
      await onRedeemed?.(result);
      setCode('');
      setMessage(`兑换成功，Pro 已开通至 ${formatActivationDate(result.activated_until, locale)}。`);
    } catch (error) {
      setMessage(formatUserFacingError(t, error, '暂时无法兑换激活码，请稍后再试。'));
    } finally {
      setRedeeming(false);
    }
  }

  if (!mounted || !open || locale !== 'zh') {
    return null;
  }

  const requiresSignIn = !userInfo || userInfo.plan === 'guest';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div
        className="relative w-full max-w-[560px] rounded-[26px] border border-white/10 bg-[#171717]/95 p-9 shadow-[0_40px_120px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 text-white/65 transition-colors hover:text-white"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="space-y-4 pr-8">
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-gold/80">Activation</p>
          <h2 className="font-display text-4xl leading-none text-white">输入激活码</h2>
          <p className="max-w-[420px] text-lg leading-8 text-white/72">
            下单后把我发送给你的激活码填在这里，当前账号会立即开通或顺延 30 天 Pro。
          </p>
        </div>

        {requiresSignIn ? (
          <div className="mt-8 space-y-5">
            <p className="rounded-2xl border border-gold/15 bg-gold/10 px-5 py-4 text-sm leading-7 text-white/82">
              兑换前需要先登录账号，这样会员时长才会绑定到你的账号上。
            </p>
            <ClerkSignInTrigger
              className="inline-flex w-full items-center justify-center rounded-full bg-gold px-6 py-4 text-lg font-medium text-void transition-colors hover:bg-gold-light"
              signedInClassName="hidden"
            >
              先登录再兑换
            </ClerkSignInTrigger>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <label className="block text-sm text-white/82">激活码</label>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="例如 PSCN-ABCD-EFGH-JKLM"
                className="w-full rounded-2xl border border-white/10 bg-surface px-5 py-4 text-xl text-white outline-none transition-colors placeholder:text-white/35 focus:border-gold/40"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {message && (
              <p className="rounded-2xl border border-gold/15 bg-gold/10 px-5 py-4 text-sm leading-7 text-white/82">
                {message}
              </p>
            )}

            <div className="flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleRedeem()}
                disabled={redeeming || !code.trim()}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-gold px-6 py-4 text-lg font-medium text-void transition-colors hover:bg-gold-light disabled:cursor-wait disabled:opacity-70"
              >
                {redeeming ? '正在兑换…' : '立即兑换'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-6 py-4 text-lg font-medium text-white transition-colors hover:border-gold/30 hover:text-gold"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
