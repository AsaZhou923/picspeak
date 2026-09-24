export type ReplayIntentLocale = 'zh' | 'en' | 'ja';

export interface ReplayIntentCopy {
  workspaceTitle: string;
  workspaceBody: string;
  currentPhotoLabel: string;
  uploadNewLabel: string;
  samePhotoPanelTitle: string;
  samePhotoPanelBody: string;
  newPhotoPanelTitle: string;
  newPhotoPanelBody: string;
  verificationHint: string;
}

const COPY: Record<ReplayIntentLocale, ReplayIntentCopy> = {
  zh: {
    workspaceTitle: '上传修改后的照片，再验证修正',
    workspaceBody: 'PicSpeak 需要看到修改后的新文件，才能判断裁切、曝光、白平衡或局部调整是否真的改善；原图只作为对照。',
    currentPhotoLabel: '来源原图',
    uploadNewLabel: '上传修改后照片',
    samePhotoPanelTitle: '上传修改后的照片，验证修正有没有生效',
    samePhotoPanelBody: '适合你已经在外部改过裁切、曝光、白平衡或局部反差之后，用新文件和原片做对比。',
    newPhotoPanelTitle: '如果这张图还没改过，直接换新照片重拍',
    newPhotoPanelBody: '机位、时机、背景整理、主体分离这类问题，重拍比同图复评更有意义。',
    verificationHint: '必须上传修改后的新文件',
  },
  en: {
    workspaceTitle: 'Upload the edited photo to verify the fix',
    workspaceBody: 'PicSpeak needs the revised file before it can compare crop, exposure, white balance, or local edits against the original. The original is only the reference.',
    currentPhotoLabel: 'Source original',
    uploadNewLabel: 'Upload edited photo',
    samePhotoPanelTitle: 'Upload the edited photo to verify the fix',
    samePhotoPanelBody: 'Use this after you changed crop, exposure, white balance, or local contrast outside PicSpeak. The upload must be the revised file.',
    newPhotoPanelTitle: 'If the photo is unchanged, retake instead',
    newPhotoPanelBody: 'For camera position, timing, background cleanup, or subject separation, a new capture is more meaningful than rerunning the same file.',
    verificationHint: 'Requires the revised file',
  },
  ja: {
    workspaceTitle: '編集後の写真をアップロードして修正を確認',
    workspaceBody: 'PicSpeak がトリミング、露出、ホワイトバランス、局所補正の改善を比べるには、編集後の新しいファイルが必要です。元の写真は参照としてだけ使います。',
    currentPhotoLabel: '元の写真',
    uploadNewLabel: '編集後の写真をアップロード',
    samePhotoPanelTitle: '編集後の写真をアップロードして修正を確認',
    samePhotoPanelBody: '外部でトリミング、露出、ホワイトバランス、局所コントラストを直した後、その新しいファイルを比較します。',
    newPhotoPanelTitle: 'まだ未調整なら、新しく撮り直す方がいいです',
    newPhotoPanelBody: '機位、タイミング、背景整理、主題分離の問題は、同じファイルの再評価より撮り直しの方が有効です。',
    verificationHint: '編集後の新しいファイルが必要です',
  },
};

export function getReplayIntentCopy(locale: ReplayIntentLocale): ReplayIntentCopy {
  return COPY[locale] ?? COPY.zh;
}
