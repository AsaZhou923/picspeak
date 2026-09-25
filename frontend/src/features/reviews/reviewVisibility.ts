export type GalleryState = 'not_added' | 'pending' | 'public' | 'rejected';

export function getGalleryState(review: {
  gallery_visible?: boolean;
  gallery_audit_status?: string;
}): GalleryState {
  if (!review.gallery_visible) return 'not_added';
  if (review.gallery_audit_status === 'approved') return 'public';
  if (review.gallery_audit_status === 'rejected') return 'rejected';
  return 'pending';
}

export function getGalleryStateCopy(locale: string) {
  if (locale === 'zh') return {
    title: '公开长廊',
    labels: { not_added: '未加入长廊', pending: '等待审核', public: '已在长廊公开', rejected: '审核未通过，未公开' },
    add: '加入长廊', signIn: '登录后加入长廊', remove: '移出长廊', withdraw: '撤回申请',
    adding: '正在提交…', removing: '正在移出…',
    description: '加入后，照片和点评会在审核通过后公开展示。移出长廊不会关闭已有分享链接。',
  };
  if (locale === 'ja') return {
    title: '公開ギャラリー',
    labels: { not_added: '未追加', pending: '審査待ち', public: 'ギャラリーで公開中', rejected: '審査不承認・非公開' },
    add: 'ギャラリーに追加', signIn: 'ログインしてギャラリーに追加', remove: 'ギャラリーから外す', withdraw: '申請を取り下げる',
    adding: '申請中…', removing: '取り下げ中…',
    description: '審査に通ると写真と講評が公開されます。ギャラリーから外しても共有リンクは有効なままです。',
  };
  return {
    title: 'Public gallery',
    labels: { not_added: 'Not in gallery', pending: 'Awaiting approval', public: 'Public in gallery', rejected: 'Not approved · not public' },
    add: 'Add to gallery', signIn: 'Sign in to add to gallery', remove: 'Remove from gallery', withdraw: 'Withdraw submission',
    adding: 'Submitting…', removing: 'Removing…',
    description: 'Your photo and critique appear publicly after approval. Removing them from the gallery does not disable existing share links.',
  };
}
