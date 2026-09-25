'use client';

import { Copy, ExternalLink, Eye, EyeOff, Link2, RotateCcw, Share2 } from 'lucide-react';
import { SignInButton } from '@clerk/nextjs';
import type { ReviewVisibilityResponse } from '@/features/reviews/api/reviewOrganizationApi';
import { getGalleryState, getGalleryStateCopy } from '@/features/reviews/reviewVisibility';

export type ReviewVisibilityPanelItem = { review_id: string };

const COPY = {
  zh: {
    title: '长廊与分享',
    body: '在长廊公开展示，或通过链接分享给他人。这两种分享方式可以分别关闭。',
    share: '分享链接', shareOn: '已开启', shareOff: '未开启',
    shareHelp: '持有链接的人可以查看照片和点评。创建链接不会将作品加入长廊。',
    createShare: '创建分享链接', revokeShare: '关闭分享链接',
    stopAll: '关闭所有公开访问', refresh: '刷新状态', loading: '正在更新…',
    unknown: '状态暂不可用', retry: '重新加载状态',
    externalCache: '关闭后，他人无法再通过对应入口访问；已下载的副本或外部缓存不会被删除。',
    copyLink: '复制链接', openShare: '查看分享页', copyOk: '分享链接已复制',
    copyManual: '未能自动复制，请选中下方链接手动复制。',
  },
  en: {
    title: 'Gallery and sharing',
    body: 'Publish in the gallery or share with a link. You can turn each off separately.',
    share: 'Share link', shareOn: 'Active', shareOff: 'Not enabled',
    shareHelp: 'Anyone with the link can view the photo and critique. Creating a link does not add them to the gallery.',
    createShare: 'Create share link', revokeShare: 'Disable share link',
    stopAll: 'Disable all public access', refresh: 'Refresh status', loading: 'Updating…',
    unknown: 'Status unavailable', retry: 'Reload status',
    externalCache: 'Disabling access does not delete downloaded copies or external caches.',
    copyLink: 'Copy link', openShare: 'View shared page', copyOk: 'Share link copied',
    copyManual: 'Could not copy automatically. Select the link below to copy it manually.',
  },
  ja: {
    title: 'ギャラリーと共有',
    body: 'ギャラリーで公開するか、リンクで共有できます。それぞれ個別に無効にできます。',
    share: '共有リンク', shareOn: '有効', shareOff: '未作成・無効',
    shareHelp: 'リンクを知っている人は写真と講評を閲覧できます。リンクを作成してもギャラリーには追加されません。',
    createShare: '共有リンクを作成', revokeShare: '共有リンクを無効にする',
    stopAll: 'すべての公開を停止', refresh: '状態を更新', loading: '更新中…',
    unknown: '状態を取得できません', retry: '状態を再読み込み',
    externalCache: 'アクセスを停止しても、保存済みのコピーや外部キャッシュは削除されません。',
    copyLink: 'リンクをコピー', openShare: '共有ページを見る', copyOk: '共有リンクをコピーしました',
    copyManual: '自動コピーできませんでした。下のリンクを選択してコピーしてください。',
  },
};

function ChannelBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
      active ? 'border-sage/30 bg-sage/10 text-sage' : 'border-border bg-void/30 text-ink-muted'
    }`}>
      {active ? <Eye size={12} aria-hidden="true" /> : <EyeOff size={12} aria-hidden="true" />}
      {label}
    </span>
  );
}

export function ReviewVisibilityPanel({
  item, locale, visibility, busy, error, status, onStatus, onRefresh,
  onCreateShare, onRevokeShare, onRemoveGallery, onStopAll, onAddGallery, galleryRequiresSignIn = false,
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
  onAddGallery: () => void;
  galleryRequiresSignIn?: boolean;
}) {
  const copy = COPY[locale === 'zh' || locale === 'ja' ? locale : 'en'];
  const galleryCopy = getGalleryStateCopy(locale);
  const galleryState = visibility ? getGalleryState(visibility) : null;
  const shareActive = Boolean(visibility?.share_enabled);
  const shareUrl = shareActive ? visibility?.share_url : null;
  const canChange = Boolean(item && visibility && !busy);

  const copyShare = async () => {
    if (!shareUrl || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onStatus?.(copy.copyOk);
    } catch {
      onStatus?.(copy.copyManual);
    }
  };

  return (
    <section className="ui-panel p-5" aria-busy={busy}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-ink">
            <Share2 size={17} className="text-gold" aria-hidden="true" />
            {copy.title}
          </h3>
          <p className="max-w-2xl text-sm leading-6 text-ink-muted">{copy.body}</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={!item || busy} className="ui-action-secondary px-3 py-2 text-sm disabled:opacity-50">
          <RotateCcw size={14} className={busy ? 'animate-spin' : ''} aria-hidden="true" />
          {busy ? copy.loading : error || !visibility ? copy.retry : copy.refresh}
        </button>
      </div>
      {error && <p role="alert" className="mb-3 rounded-control border border-rust/20 bg-rust/5 px-3 py-2 text-sm text-rust">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-control border border-border-subtle bg-void/25 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">{galleryCopy.title}</h4>
            <ChannelBadge active={galleryState === 'public'} label={galleryState ? galleryCopy.labels[galleryState] : busy ? copy.loading : copy.unknown} />
          </div>
          <p className="mb-4 text-sm leading-6 text-ink-muted">{galleryCopy.description}</p>
          {galleryState === 'rejected' && visibility?.gallery_rejected_reason && (
            <p className="mb-3 text-sm text-rust">{visibility.gallery_rejected_reason}</p>
          )}
          {galleryState === 'not_added' && item && (
            galleryRequiresSignIn ? (
              <SignInButton mode="modal" fallbackRedirectUrl={`/reviews/${item.review_id}`}>
                <button type="button" className="ui-action-primary px-4 py-2 text-sm">{galleryCopy.signIn}</button>
              </SignInButton>
            ) : (
            <button type="button" onClick={onAddGallery} disabled={!canChange} className="ui-action-primary px-4 py-2 text-sm disabled:opacity-50">
              {galleryCopy.add}
            </button>
            )
          )}
          {galleryState && galleryState !== 'not_added' && (
            <button type="button" onClick={onRemoveGallery} disabled={!canChange} className="ui-action-secondary px-4 py-2 text-sm disabled:opacity-50">
              {galleryState === 'public' ? galleryCopy.remove : galleryCopy.withdraw}
            </button>
          )}
        </div>

        <div className="rounded-control border border-border-subtle bg-void/25 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">{copy.share}</h4>
            <ChannelBadge active={shareActive} label={!visibility ? busy ? copy.loading : copy.unknown : shareActive ? copy.shareOn : copy.shareOff} />
          </div>
          <p className="mb-4 text-sm leading-6 text-ink-muted">{copy.shareHelp}</p>
          {visibility && (
            <div className="flex flex-wrap gap-2">
              {shareActive ? (
                <>
                  <button type="button" onClick={copyShare} disabled={!shareUrl || busy} className="ui-action-secondary px-3 py-2 text-sm disabled:opacity-50">
                    <Copy size={14} aria-hidden="true" />{copy.copyLink}
                  </button>
                  <button type="button" onClick={onRevokeShare} disabled={!canChange} className="ui-action-secondary px-3 py-2 text-sm disabled:opacity-50">
                    {copy.revokeShare}
                  </button>
                </>
              ) : (
                <button type="button" onClick={onCreateShare} disabled={!canChange} className="ui-action-secondary px-3 py-2 text-sm disabled:opacity-50">
                  <Link2 size={14} aria-hidden="true" />{copy.createShare}
                </button>
              )}
            </div>
          )}
          {shareUrl && (
            <div className="mt-3 flex flex-col gap-2">
              <input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()}
                className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2 text-sm text-ink"
                aria-label={copy.share} />
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="ui-action-secondary self-start px-3 py-2 text-sm">
                <ExternalLink size={14} aria-hidden="true" />{copy.openShare}
              </a>
            </div>
          )}
        </div>
      </div>

      {status && <p role="status" className="mt-3 text-sm text-ink">{status}</p>}
      {(visibility?.gallery_visible || shareActive) && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <p className="max-w-2xl text-xs leading-6 text-ink-muted">{copy.externalCache}</p>
          <button type="button" onClick={onStopAll} disabled={!canChange} className="ui-action-secondary border-rust/30 px-4 py-2 text-sm text-rust hover:bg-rust/10 disabled:opacity-50">
            {copy.stopAll}
          </button>
        </div>
      )}
    </section>
  );
}
