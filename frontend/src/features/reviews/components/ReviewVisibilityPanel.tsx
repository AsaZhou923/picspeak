'use client';

import { Copy, ExternalLink, Eye, EyeOff, Link2, RotateCcw, Share2 } from 'lucide-react';
import type { ReviewVisibilityResponse } from '@/features/reviews/api/reviewOrganizationApi';

type Locale = 'zh' | 'en' | 'ja';
export type ReviewVisibilityPanelItem = { review_id: string };

const COPY: Record<Locale, {
  title: string;
  body: string;
  gallery: string;
  galleryOn: string;
  galleryOff: string;
  galleryRejected: string;
  share: string;
  shareOn: string;
  shareOff: string;
  createShare: string;
  revokeShare: string;
  removeGallery: string;
  stopAll: string;
  refresh: string;
  loading: string;
  unknown: string;
  retry: string;
  externalCache: string;
  copyLink: string;
  openShare: string;
  copyOk: string;
  copyManual: string;
}> = {
  zh: {
    title: '公开渠道',
    body: 'Gallery 展示和分享链接是两个独立渠道；关闭其中一个不代表全部私有。',
    gallery: 'Gallery',
    galleryOn: '展示中',
    galleryOff: '未展示',
    galleryRejected: '审核未通过',
    share: '分享链接',
    shareOn: '有效',
    shareOff: '已撤销',
    createShare: '创建链接',
    revokeShare: '撤销链接',
    removeGallery: '移出 Gallery',
    stopAll: '停止全部公开',
    refresh: '刷新状态',
    loading: '读取中',
    unknown: '未知',
    retry: '重试',
    externalCache: '撤销只影响 PicSpeak 当前访问，不承诺收回第三方缓存或已下载副本。',
    copyLink: '复制链接',
    openShare: '打开分享页',
    copyOk: '已复制',
    copyManual: '请手动复制链接',
  },
  en: {
    title: 'Public Channels',
    body: 'Gallery visibility and share links are separate channels. Closing one does not make every channel private.',
    gallery: 'Gallery',
    galleryOn: 'Visible',
    galleryOff: 'Hidden',
    galleryRejected: 'Rejected',
    share: 'Share Link',
    shareOn: 'Active',
    shareOff: 'Revoked',
    createShare: 'Create Link',
    revokeShare: 'Revoke Link',
    removeGallery: 'Remove From Gallery',
    stopAll: 'Stop All Public Access',
    refresh: 'Refresh',
    loading: 'Loading',
    unknown: 'Unknown',
    retry: 'Retry',
    externalCache: 'Revocation controls current PicSpeak access. It cannot recall third-party caches or downloaded copies.',
    copyLink: 'Copy Link',
    openShare: 'Open Share Page',
    copyOk: 'Copied',
    copyManual: 'Copy the link manually',
  },
  ja: {
    title: '公開チャネル',
    body: 'Gallery 表示と共有リンクは別チャネルです。片方を閉じても全体が非公開になるとは限りません。',
    gallery: 'Gallery',
    galleryOn: '表示中',
    galleryOff: '非表示',
    galleryRejected: '審査却下',
    share: '共有リンク',
    shareOn: '有効',
    shareOff: '撤回済み',
    createShare: 'リンク作成',
    revokeShare: 'リンク撤回',
    removeGallery: 'Gallery から外す',
    stopAll: 'すべての公開を停止',
    refresh: '更新',
    loading: '読み込み中',
    unknown: '不明',
    retry: '再試行',
    externalCache: '撤回は PicSpeak の現在のアクセスにのみ効きます。外部キャッシュや保存済みコピーは回収できません。',
    copyLink: 'リンクをコピー',
    openShare: '共有ページを開く',
    copyOk: 'コピーしました',
    copyManual: 'リンクを手動でコピーしてください',
  },
};

function ChannelBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
      active ? 'border-sage/30 bg-sage/10 text-sage' : 'border-border bg-void/30 text-ink-subtle'
    }`}>
      {active ? <Eye size={12} /> : <EyeOff size={12} />}
      {label}
    </span>
  );
}

export function ReviewVisibilityPanel({
  item,
  locale,
  visibility,
  busy,
  error,
  status,
  onStatus,
  onRefresh,
  onCreateShare,
  onRevokeShare,
  onRemoveGallery,
  onStopAll,
}: {
  item: ReviewVisibilityPanelItem | null;
  locale: string;
  visibility: ReviewVisibilityResponse | null;
  busy: boolean;
  error?: string;
  status?: string;
  onStatus?: (message: string) => void;
  onRefresh: () => void;
  onCreateShare: () => Promise<void>;
  onRevokeShare: () => Promise<void>;
  onRemoveGallery: () => Promise<void>;
  onStopAll: () => Promise<void>;
}) {
  const copy = COPY[(locale as Locale) in COPY ? locale as Locale : 'en'];
  const galleryActive = Boolean(visibility?.gallery_visible && visibility.gallery_audit_status === 'approved');
  const galleryRejected = visibility?.gallery_visible && visibility.gallery_audit_status === 'rejected';
  const shareActive = Boolean(visibility?.share_enabled);
  const shareUrl = visibility?.share_url ?? null;
  const galleryLabel = !visibility
    ? copy.unknown
    : galleryRejected
      ? copy.galleryRejected
      : galleryActive
        ? copy.galleryOn
        : copy.galleryOff;
  const shareLabel = !visibility ? copy.unknown : shareActive ? copy.shareOn : copy.shareOff;

  const copyShare = async () => {
    if (!shareUrl || typeof navigator === 'undefined') return;
    if (!navigator.clipboard?.writeText) {
      onStatus?.(copy.copyManual);
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      onStatus?.(copy.copyOk);
    } catch {
      onStatus?.(copy.copyManual);
    }
  };

  return (
    <section className="ui-panel mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-ink">
            <Share2 size={15} className="text-gold" />
            <span>{copy.title}</span>
          </div>
          <p className="max-w-2xl text-xs leading-6 text-ink-muted">{copy.body}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!item || busy}
          className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <RotateCcw size={12} />
          {busy ? copy.loading : error ? copy.retry : copy.refresh}
        </button>
      </div>
      {error && <p className="mb-3 rounded border border-rust/20 bg-rust/5 px-3 py-2 text-xs text-rust">{error}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border-subtle bg-void/25 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm text-ink">{copy.gallery}</span>
            <ChannelBadge active={galleryActive} label={galleryLabel} />
          </div>
          <button
            type="button"
            onClick={onRemoveGallery}
            disabled={!item || busy || !visibility?.gallery_visible}
            className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {copy.removeGallery}
          </button>
        </div>

        <div className="rounded-lg border border-border-subtle bg-void/25 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm text-ink">{copy.share}</span>
            <ChannelBadge active={shareActive} label={shareLabel} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreateShare}
              disabled={!item || busy || shareActive}
              className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Link2 size={12} />
              {copy.createShare}
            </button>
            <button
              type="button"
              onClick={onRevokeShare}
              disabled={!item || busy || !shareActive}
              className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {copy.revokeShare}
            </button>
            <button
              type="button"
              onClick={copyShare}
              disabled={!shareUrl}
              className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Copy size={12} />
              {copy.copyLink}
            </button>
          </div>
          {shareUrl && (
            <div className="mt-3 flex flex-col gap-2 rounded-md border border-border-subtle bg-void/30 p-2 sm:flex-row sm:items-center">
              <input
                readOnly
                value={shareUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 truncate rounded border border-border-subtle bg-void/60 px-2 py-1.5 text-xs text-ink-muted outline-none"
                aria-label={copy.share}
              />
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-action-secondary justify-center px-3 py-1.5 text-xs"
              >
                <ExternalLink size={12} />
                {copy.openShare}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="max-w-2xl text-[11px] leading-5 text-ink-subtle">{copy.externalCache}</p>
          {status && <p className="mt-1 text-[11px] text-sage">{status}</p>}
        </div>
        <button
          type="button"
          onClick={onStopAll}
          disabled={!item || busy || (!galleryActive && !shareActive)}
          className="ui-action-secondary border-rust/30 px-4 py-2 text-sm text-rust hover:bg-rust/10 disabled:opacity-50"
        >
          {copy.stopAll}
        </button>
      </div>
    </section>
  );
}
