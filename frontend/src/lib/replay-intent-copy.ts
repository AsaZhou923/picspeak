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
    workspaceTitle: '如果你已经改过这张图，可以直接复评',
    workspaceBody: '同图复评只适合验证你刚做过的裁切、曝光、白平衡或局部调整；如果这张图还没改过，通常更适合换新照片重拍。',
    currentPhotoLabel: '当前这张图',
    uploadNewLabel: '换新照片重拍',
    samePhotoPanelTitle: '如果你已经改过这张图，再用它验证修正',
    samePhotoPanelBody: '适合裁切、曝光、白平衡、局部反差这类你已经调过的改动。',
    newPhotoPanelTitle: '如果这张图还没改过，直接换新照片重拍',
    newPhotoPanelBody: '机位、时机、背景整理、主体分离这类问题，重拍比同图复评更有意义。',
    verificationHint: '只在你已经改过这张图时才值得同图复评',
  },
  en: {
    workspaceTitle: 'Reuse this photo only if you already edited it',
    workspaceBody: 'A same-photo rerun is only useful after you already changed crop, exposure, white balance, or other quick edits. If the photo is unchanged, retaking a new shot is usually the better next step.',
    currentPhotoLabel: 'Current photo',
    uploadNewLabel: 'Retake with a new photo',
    samePhotoPanelTitle: 'Use this photo again only after edits',
    samePhotoPanelBody: 'Best for checking whether crop, exposure, white balance, or local contrast changes actually helped.',
    newPhotoPanelTitle: 'If the photo is unchanged, retake instead',
    newPhotoPanelBody: 'For camera position, timing, background cleanup, or subject separation, a new capture is more meaningful than rerunning the same file.',
    verificationHint: 'Only worth it after you already changed this photo',
  },
  ja: {
    workspaceTitle: 'この写真を再評価するのは、すでに調整した後だけです',
    workspaceBody: '同じ写真の再評価は、トリミング、露出、ホワイトバランス、局所補正などを加えた後の確認にだけ向いています。まだ何も変えていないなら、新しく撮り直す方が普通は有益です。',
    currentPhotoLabel: 'この写真を確認',
    uploadNewLabel: '新しい写真で撮り直す',
    samePhotoPanelTitle: 'この写真を調整した後なら、もう一度使う意味があります',
    samePhotoPanelBody: 'トリミング、露出、ホワイトバランス、局所コントラストの修正確認に向いています。',
    newPhotoPanelTitle: 'まだ未調整なら、新しく撮り直す方がいいです',
    newPhotoPanelBody: '機位、タイミング、背景整理、主題分離の問題は、同じファイルの再評価より撮り直しの方が有効です。',
    verificationHint: 'この写真を調整した後だけ同図再評価に意味があります',
  },
};

export function getReplayIntentCopy(locale: ReplayIntentLocale): ReplayIntentCopy {
  return COPY[locale] ?? COPY.zh;
}
