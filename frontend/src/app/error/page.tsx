'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Home, RotateCcw } from 'lucide-react';

const ERROR_CONFIGS: Record<
  string,
  { title: string; body: string; action?: { label: string; href: string } }
> = {
  google_failed: {
    title: 'Google 登录失败',
    body: '无法完成 Google 账号验证，请稍后重试或以游客身份继续使用。',
    action: { label: '以游客身份继续', href: '/workspace' },
  },
  quota_exceeded: {
    title: '今日额度已用完',
    body: '你已达到今日评图上限。额度将在每日 UTC 0:00 自动重置，或登录后升级套餐获得更多次数。',
    action: { label: '查看额度', href: '/account/usage' },
  },
  rate_limited: {
    title: '请求过于频繁',
    body: '你的操作频率超出限制，请稍等片刻再继续。',
    action: { label: '返回工作台', href: '/workspace' },
  },
  upload_failed: {
    title: '上传失败',
    body: '图片上传至服务器时发生错误，请检查你的网络连接后重试。',
    action: { label: '重新上传', href: '/workspace' },
  },
  review_rejected: {
    title: '图片审核未通过',
    body: '该照片未通过内容安全审核，无法进行 AI 点评。请确认图片内容符合使用规范。',
    action: { label: '换张照片', href: '/workspace' },
  },
  task_failed: {
    title: '点评任务失败',
    body: '本次 AI 点评任务处理失败。这通常是临时性错误，可以再次尝试。',
    action: { label: '重新发起点评', href: '/workspace' },
  },
  not_found: {
    title: '资源不存在',
    body: '你访问的内容不存在或已被删除。',
  },
  unknown: {
    title: '出现了一些问题',
    body: '发生了一个未预期的错误，请稍后再试或联系支持。',
  },
};

export default function ErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ErrorContent />
    </Suspense>
  );
}

function ErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = searchParams.get('code') ?? 'unknown';
  const detail = searchParams.get('detail');

  const config = ERROR_CONFIGS[code] ?? ERROR_CONFIGS['unknown'];

  return (
    <div className="pt-14 min-h-screen flex items-start justify-center px-6">
      <div className="w-full max-w-md py-20 space-y-8 animate-fade-in">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 border border-rust/30 bg-rust/5 rounded-lg flex items-center justify-center">
            <AlertTriangle size={24} className="text-rust" />
          </div>
        </div>

        {/* Text */}
        <div className="text-center space-y-3">
          <p className="text-xs text-rust/70 font-mono tracking-widest uppercase">{code}</p>
          <h1 className="font-display text-3xl sm:text-4xl">{config.title}</h1>
          <p className="text-sm text-ink-muted leading-relaxed">{config.body}</p>
          {detail && (
            <p className="text-xs text-ink-subtle bg-raised border border-border rounded px-3 py-2 font-mono text-left">
              {detail}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3">
          {config.action && (
            <Link
              href={config.action.href}
              className="flex items-center gap-2 px-6 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
            >
              <RotateCcw size={13} />
              {config.action.label}
            </Link>
          )}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors"
          >
            <ArrowLeft size={11} />
            返回上一页
          </button>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors"
          >
            <Home size={11} />
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
