'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Locale = 'zh' | 'en' | 'ja';

export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
};

// ─── Translation Dictionaries ────────────────────────────────────────────────

const translations = {
  zh: {
    // Header
    nav_workspace: '评图工作台',
    nav_history: '评图历史',
    nav_usage: '我的额度',
    theme_dark: '切换至亮色主题',
    theme_light: '切换至暗色主题',
    plan_guest_label: '游客',
    login_google: 'Google 登录',
    logout: '退出',

    // Footer
    footer_home: '首页',
    footer_workspace: '评图',
    footer_usage: '额度',

    // Home page
    hero_label: 'AI Photography Critique',
    hero_headline_1: '让每一张照片',
    hero_headline_2: '开口说话',
    hero_desc: '上传你的摄影作品，AI 从构图、光线、色彩、故事与技术五个维度深度解析，给出专业、可落地的改进建议。',
    hero_cta_start: '立即开始评图',
    hero_cta_login: 'Google 登录',

    demo_label: '示例评图结果',
    demo_final_score: '综合评分',
    demo_advantage: '优点',
    demo_suggestion: '建议',
    demo_advantage_body: '构图遵循黄金分割，前景与远景形成自然层次，整体框架稳健。',
    demo_suggestion_body: '可适当降低高光区域曝光 0.5 EV，并通过后期微提阴影细节增强整体反差。',

    features_label: '核心能力',
    features_headline: '像专业摄影师一样思考',
    feature_flash_title: 'Flash 极速点评',
    feature_flash_body: '秒级响应，即时获得构图、光线、色彩等五维度精准评分',
    feature_pro_title: 'Pro 深度分析',
    feature_pro_body: '深入剖析照片叙事力与创作意图，附带可落地改进建议',
    feature_history_title: '历史追踪',
    feature_history_body: '记录同一张照片的多次评图结果，量化你的进步轨迹',

    quota_label: '使用额度',
    quota_headline: '按需使用，开箱即评',
    plan_guest_name: '游客',
    plan_guest_quota: '3 次 / 天',
    plan_guest_feature: 'Flash 仅限',
    plan_free_name: 'Free',
    plan_free_quota: '6 次 / 天',
    plan_free_feature: 'Flash & Pro',
    plan_pro_name: 'Pro',
    plan_pro_quota: '30 次 / 天',
    plan_pro_feature: '优先处理',

    // Score dimension labels
    score_composition: '构图',
    score_lighting: '光线',
    score_color: '色彩',
    score_story: '故事',
    score_technical: '技术',

    // Workspace
    workspace_label: '评图工作台',
    workspace_headline: '上传照片',
    usage_remaining: '今日剩余',
    usage_times: '次',
    usage_quota_exhausted: '额度已用尽',
    usage_error: '无法获取额度信息',
    stage_uploading: '上传中',
    stage_confirming: '确认照片中…',
    stage_reviewing: '提交点评请求…',
    status_ready: '照片上传成功，可以开始评图',
    status_rejected: '该图片未通过内容审核，无法评图',
    status_photo_error: '照片状态异常：',
    err_rate_limit: '当前操作过于频繁，请稍后再试',
    err_quota: '今日评图额度已用完，请明日再来或升级套餐',
    err_upload: '上传失败，请检查网络后重试',
    select_mode: '选择点评模式',
    mode_flash_desc: '极速点评，秒级响应',
    mode_pro_desc: '深度分析，专业建议',
    mode_pro_guest: '游客不可用',
    btn_start_review: '开始',
    btn_review_suffix: '点评',
    btn_change_photo: '换张照片',
    btn_reupload: '重新上传',
    quota_modal_title: '今日额度已用尽',
    quota_modal_body: '您今日的评图次数已用完，请明日再来或登录升级账户。',
    quota_modal_upgrade: '登录升级',
    quota_modal_close: '关闭',

    // Review page
    review_page_label: '点评结果',
    review_page_headline: '结果分析',
    review_back_workspace: '返回工作台',
    review_back_history: '评图历史',
    review_advantage: '优点',
    review_critique: '问题',
    review_suggestions: '改进建议',
    review_btn_again: '再次点评',
    review_btn_photo_history: '该照片历史',
    review_no_image: '暂无图片',
    review_err_fetch: '获取点评结果失败，请重试',
    back_btn: '返回',

    // Account reviews
    account_reviews_label: '我的历史',
    account_reviews_headline: '评图历史',
    reviews_empty: '暂无评图记录',
    reviews_empty_cta: '去工作台评图',
    reviews_load_more: '加载更多',
    reviews_loading_more: '加载中…',
    reviews_err_fetch: '获取历史失败',
    reviews_err_retry: '重试',
    photo_thumbnail_alt: '照片缩略图',

    // Account usage
    usage_label: '账户状态',
    usage_headline: '我的额度',
    usage_identity: '当前身份',
    usage_upgrade: '升级账户',
    usage_today_quota: '今日评图额度',
    usage_bar_used: '今日已用',
    usage_bar_total: '次',
    usage_remaining_label: '/ {total} 次剩余',
    usage_reset_hint: '今日额度已用完，次日 UTC 0:00 自动重置',
    usage_login_unlock_title: '登录解锁更多额度',
    usage_login_unlock_body: '游客每日仅 3 次评图。Google 登录后升级为 Free 用户，享有每日 6 次评图 + 历史记录保留。',
    usage_login_now: '立即登录',
    usage_goto_workspace: '前往评图工作台',

    // Error page
    error_title: '出错了',
    error_go_home: '返回首页',
    error_go_workspace: '前往工作台',

    // Task page
    task_id_label: '任务',
    task_step_queue_label: '排队等待',
    task_step_queue_detail: '任务已创建，等待 worker 领取。',
    task_step_audit_label: '内容审核',
    task_step_audit_detail: '正在执行图片安全审核。',
    task_step_ai_label: 'AI 分析',
    task_step_ai_detail: '模型正在分析构图、光线和技术表现。',
    task_step_done_label: '点评完成',
    task_step_done_detail: '即将跳转到结果页。',
    task_failed_label: '点评失败',
    task_failed_detail: '任务处理过程中发生错误。',
    task_expired_label: '任务超时',
    task_expired_detail: '任务等待时间过长，系统已终止。',
    task_dead_letter_label: '进入死信队列',
    task_dead_letter_detail: '任务已多次重试仍失败，请重新发起点评。',
    task_timeout_error: '等待时间过长，请稍后手动刷新或重新发起点评。',
    task_fetch_error: '查询任务状态失败，请刷新页面重试。',
    task_retry: '重新发起点评',
    task_back: '返回工作台',

    // Error configs
    err_google_failed_title: 'Google 登录失败',
    err_google_failed_body: '无法完成 Google 账号验证，请稍后重试或以游客身份继续使用。',
    err_google_failed_action: '以游客身份继续',
    err_quota_exceeded_title: '今日额度已用完',
    err_quota_exceeded_body: '你已达到今日评图上限。额度将在每日 UTC 0:00 自动重置，或登录后升级套餐获得更多次数。',
    err_quota_exceeded_action: '查看额度',
    err_rate_limited_title: '请求过于频繁',
    err_rate_limited_body: '你的操作频率超出限制，请稍等片刻再继续。',
    err_rate_limited_action: '返回工作台',
    err_upload_failed_title: '上传失败',
    err_upload_failed_body: '图片上传至服务器时发生错误，请检查你的网络连接后重试。',
    err_upload_failed_action: '重新上传',
    err_review_rejected_title: '图片审核未通过',
    err_review_rejected_body: '该照片未通过内容安全审核，无法进行 AI 点评。请确认图片内容符合使用规范。',
    err_review_rejected_action: '换张照片',
    err_task_failed_title: '点评任务失败',
    err_task_failed_body: '本次 AI 点评任务处理失败。这通常是临时性错误，可以再次尝试。',
    err_task_failed_action: '重新发起点评',
    err_not_found_title: '资源不存在',
    err_not_found_body: '你访问的内容不存在或已被删除。',
    err_unknown_title: '出现了一些问题',
    err_unknown_body: '发生了一个未预期的错误，请稍后再试或联系支持。',
    err_back_home: '返回首页',

    // Auth callback
    auth_processing_label: '正在处理登录…',
    auth_processing_title: '正在处理登录',
    auth_processing_body: '稍候片刻，正在验证你的 Google 账号…',
    auth_success_title: '登录成功',
    auth_success_body: '正在跳转到评图工作台…',
    auth_error_title: '登录失败',
    auth_error_missing_params: '回调参数缺失，请重新登录',
    auth_continue_guest: '以游客身份继续',
    auth_back_home: '返回首页',

    // Image uploader
    uploader_invalid_type: '不支持的格式（仅 JPG / PNG / WebP）',
    uploader_too_large: '文件过大（最大 {max} MB）',
    uploader_compressing: '正在压缩图片…',
    uploader_compressing_wait: '稍候片刻',
    uploader_drop_hint: '松开以上传',
    uploader_idle_hint: '拖拽图片到此，或点击选择',
    uploader_format_hint: 'JPG / PNG / WebP · 最大 {max} MB · 自动压缩',
    uploader_compressed: '图片已压缩',
    uploader_no_compress: '图片无需压缩',
    uploader_saved: '节省 {ratio}%',

    // Status badges
    status_pending: '等待中',
    status_running: '处理中',
    status_succeeded: '已完成',
    status_failed: '已失败',
    status_expired: '已过期',
    status_ready: '就绪',
    status_rejected: '已拒绝',
    status_uploading: '上传中',

    // Score ring
    score_overall: '综合评分',
  },

  en: {
    // Header
    nav_workspace: 'Workspace',
    nav_history: 'History',
    nav_usage: 'Quota',
    theme_dark: 'Switch to light theme',
    theme_light: 'Switch to dark theme',
    plan_guest_label: 'Guest',
    login_google: 'Sign in with Google',
    logout: 'Sign out',

    // Footer
    footer_home: 'Home',
    footer_workspace: 'Workspace',
    footer_usage: 'Quota',

    // Home page
    hero_label: 'AI Photography Critique',
    hero_headline_1: 'Let every photo',
    hero_headline_2: 'speak for itself',
    hero_desc: 'Upload your photographs and receive AI-powered analysis across five dimensions: composition, lighting, color, storytelling, and technique.',
    hero_cta_start: 'Start Critiquing',
    hero_cta_login: 'Sign in with Google',

    demo_label: 'Sample Critique',
    demo_final_score: 'Overall Score',
    demo_advantage: 'Strengths',
    demo_suggestion: 'Suggestions',
    demo_advantage_body: 'The composition follows the golden ratio; the foreground and background create a natural layering effect.',
    demo_suggestion_body: 'Consider reducing highlight exposure by 0.5 EV and lifting shadows slightly in post to enhance overall contrast.',

    features_label: 'Core Features',
    features_headline: 'Think like a pro photographer',
    feature_flash_title: 'Flash Critique',
    feature_flash_body: 'Instant response with precise five-dimensional scoring for composition, lighting, color, and more.',
    feature_pro_title: 'Pro Analysis',
    feature_pro_body: 'Deep dive into narrative power and creative intent, with actionable improvement suggestions.',
    feature_history_title: 'Progress Tracking',
    feature_history_body: 'Track multiple critique results for the same photo and quantify your improvement over time.',

    quota_label: 'Usage Plans',
    quota_headline: 'Pay-as-you-go, ready to critique',
    plan_guest_name: 'Guest',
    plan_guest_quota: '3 / day',
    plan_guest_feature: 'Flash only',
    plan_free_name: 'Free',
    plan_free_quota: '6 / day',
    plan_free_feature: 'Flash & Pro',
    plan_pro_name: 'Pro',
    plan_pro_quota: '30 / day',
    plan_pro_feature: 'Priority processing',

    // Score dimension labels
    score_composition: 'Composition',
    score_lighting: 'Lighting',
    score_color: 'Color',
    score_story: 'Story',
    score_technical: 'Technical',

    // Workspace
    workspace_label: 'Photo Critique Workspace',
    workspace_headline: 'Upload a Photo',
    usage_remaining: 'Remaining today',
    usage_times: '',
    usage_quota_exhausted: 'Quota exhausted',
    usage_error: 'Failed to load quota info',
    stage_uploading: 'Uploading',
    stage_confirming: 'Confirming photo…',
    stage_reviewing: 'Submitting critique request…',
    status_ready: 'Photo uploaded successfully. Ready to critique.',
    status_rejected: 'This image failed content review and cannot be critiqued.',
    status_photo_error: 'Photo status error: ',
    err_rate_limit: 'Too many requests. Please wait a moment.',
    err_quota: 'Daily quota exhausted. Come back tomorrow or upgrade.',
    err_upload: 'Upload failed. Please check your connection.',
    select_mode: 'Select critique mode',
    mode_flash_desc: 'Instant critique, second-level response',
    mode_pro_desc: 'Deep analysis, professional advice',
    mode_pro_guest: 'Unavailable for guests',
    btn_start_review: 'Start',
    btn_review_suffix: 'Critique',
    btn_change_photo: 'Change photo',
    btn_reupload: 'Re-upload',
    quota_modal_title: 'Daily quota exhausted',
    quota_modal_body: "You've used all your critiques for today. Come back tomorrow or sign in to upgrade.",
    quota_modal_upgrade: 'Sign in & Upgrade',
    quota_modal_close: 'Close',

    // Review page
    review_page_label: 'Critique Results',
    review_page_headline: 'Analysis',
    review_back_workspace: 'Back to Workspace',
    review_back_history: 'Back to History',
    review_advantage: 'Strengths',
    review_critique: 'Issues',
    review_suggestions: 'Suggestions',
    review_btn_again: 'Critique Again',
    review_btn_photo_history: 'Photo History',
    review_no_image: 'No image',
    review_err_fetch: 'Failed to load critique result. Please retry.',
    back_btn: 'Back',

    // Account reviews
    account_reviews_label: 'My History',
    account_reviews_headline: 'Critique History',
    reviews_empty: 'No critique history yet',
    reviews_empty_cta: 'Go to Workspace',
    reviews_load_more: 'Load more',
    reviews_loading_more: 'Loading…',
    reviews_err_fetch: 'Failed to load history',
    reviews_err_retry: 'Retry',
    photo_thumbnail_alt: 'Photo thumbnail',

    // Account usage
    usage_label: 'Account Status',
    usage_headline: 'My Quota',
    usage_identity: 'Current Plan',
    usage_upgrade: 'Upgrade',
    usage_today_quota: "Today's Critique Quota",
    usage_bar_used: 'Used today',
    usage_bar_total: '',
    usage_remaining_label: '/ {total} remaining',
    usage_reset_hint: 'Quota exhausted. Resets at UTC 00:00.',
    usage_login_unlock_title: 'Sign in to unlock more quota',
    usage_login_unlock_body: 'Guests get 3 critiques/day. Sign in with Google to upgrade to Free and get 6 critiques/day + history.',
    usage_login_now: 'Sign in now',
    usage_goto_workspace: 'Go to Workspace',

    // Error page
    error_title: 'Something went wrong',
    error_go_home: 'Go Home',
    error_go_workspace: 'Go to Workspace',

    // Task page
    task_id_label: 'Task',
    task_step_queue_label: 'Queued',
    task_step_queue_detail: 'Task created, waiting for a worker.',
    task_step_audit_label: 'Content Audit',
    task_step_audit_detail: 'Running image safety check.',
    task_step_ai_label: 'AI Analysis',
    task_step_ai_detail: 'Model analyzing composition, lighting and technique.',
    task_step_done_label: 'Complete',
    task_step_done_detail: 'Redirecting to results.',
    task_failed_label: 'Critique Failed',
    task_failed_detail: 'An error occurred during task processing.',
    task_expired_label: 'Task Timed Out',
    task_expired_detail: 'The task waited too long and was terminated.',
    task_dead_letter_label: 'Dead Letter Queue',
    task_dead_letter_detail: 'Task failed after multiple retries. Please try again.',
    task_timeout_error: 'Waited too long. Please refresh or start a new critique.',
    task_fetch_error: 'Failed to fetch task status. Please refresh.',
    task_retry: 'Start New Critique',
    task_back: 'Back to Workspace',

    // Error configs
    err_google_failed_title: 'Google Sign-in Failed',
    err_google_failed_body: 'Could not complete Google authentication. Please try again or continue as a guest.',
    err_google_failed_action: 'Continue as Guest',
    err_quota_exceeded_title: 'Daily Quota Exhausted',
    err_quota_exceeded_body: 'You have reached your daily critique limit. Quota resets at UTC 00:00, or sign in to upgrade.',
    err_quota_exceeded_action: 'View Quota',
    err_rate_limited_title: 'Too Many Requests',
    err_rate_limited_body: 'You are sending requests too quickly. Please wait a moment and try again.',
    err_rate_limited_action: 'Back to Workspace',
    err_upload_failed_title: 'Upload Failed',
    err_upload_failed_body: 'An error occurred uploading the image. Please check your connection and retry.',
    err_upload_failed_action: 'Try Again',
    err_review_rejected_title: 'Image Failed Content Review',
    err_review_rejected_body: 'This photo did not pass the content safety check and cannot be critiqued. Please ensure the image complies with usage guidelines.',
    err_review_rejected_action: 'Choose Another Photo',
    err_task_failed_title: 'Critique Task Failed',
    err_task_failed_body: 'The AI critique task encountered an error. This is usually temporary — please try again.',
    err_task_failed_action: 'Retry Critique',
    err_not_found_title: 'Not Found',
    err_not_found_body: 'The content you requested does not exist or has been deleted.',
    err_unknown_title: 'Something Went Wrong',
    err_unknown_body: 'An unexpected error occurred. Please try again later or contact support.',
    err_back_home: 'Go Home',

    // Auth callback
    auth_processing_label: 'Signing in…',
    auth_processing_title: 'Signing In',
    auth_processing_body: 'Please wait while we verify your Google account…',
    auth_success_title: 'Signed In',
    auth_success_body: 'Redirecting to workspace…',
    auth_error_title: 'Sign-in Failed',
    auth_error_missing_params: 'Missing callback parameters, please sign in again.',
    auth_continue_guest: 'Continue as Guest',
    auth_back_home: 'Go Home',

    // Image uploader
    uploader_invalid_type: 'Unsupported format (JPG / PNG / WebP only)',
    uploader_too_large: 'File too large (max {max} MB)',
    uploader_compressing: 'Compressing image…',
    uploader_compressing_wait: 'Please wait',
    uploader_drop_hint: 'Release to upload',
    uploader_idle_hint: 'Drop an image here or click to browse',
    uploader_format_hint: 'JPG / PNG / WebP · max {max} MB · auto-compressed',
    uploader_compressed: 'Image compressed',
    uploader_no_compress: 'No compression needed',
    uploader_saved: 'saved {ratio}%',

    // Status badges
    status_pending: 'Pending',
    status_running: 'Processing',
    status_succeeded: 'Completed',
    status_failed: 'Failed',
    status_expired: 'Expired',
    status_ready: 'Ready',
    status_rejected: 'Rejected',
    status_uploading: 'Uploading',

    // Score ring
    score_overall: 'Overall Score',
  },

  ja: {
    // Header
    nav_workspace: '評価ワークスペース',
    nav_history: '評価履歴',
    nav_usage: 'クォータ',
    theme_dark: 'ライトテーマへ切替',
    theme_light: 'ダークテーマへ切替',
    plan_guest_label: 'ゲスト',
    login_google: 'Googleでサインイン',
    logout: 'サインアウト',

    // Footer
    footer_home: 'ホーム',
    footer_workspace: 'ワークスペース',
    footer_usage: 'クォータ',

    // Home page
    hero_label: 'AI写真評価',
    hero_headline_1: 'すべての写真が',
    hero_headline_2: '語り始める',
    hero_desc: '写真をアップロードすると、AIが構図・光・色彩・ストーリー・技術の5つの次元から深く分析し、具体的な改善提案をお届けします。',
    hero_cta_start: '今すぐ評価する',
    hero_cta_login: 'Googleでサインイン',

    demo_label: '評価サンプル',
    demo_final_score: '総合スコア',
    demo_advantage: '強み',
    demo_suggestion: '提案',
    demo_advantage_body: '構図は黄金比に従い、前景と背景が自然な層を形成しています。フレーム全体が安定しています。',
    demo_suggestion_body: 'ハイライト領域の露出を0.5 EV下げ、後処理でシャドウの細部を少し持ち上げてコントラストを強調してみてください。',

    features_label: 'コア機能',
    features_headline: 'プロカメラマンのように考える',
    feature_flash_title: 'Flash 即時評価',
    feature_flash_body: '秒単位の応答で、構図・光・色彩など5次元の精確なスコアをすぐに取得',
    feature_pro_title: 'Pro 深度分析',
    feature_pro_body: '写真の物語力と創作意図を深く掘り下げ、実用的な改善提案付き',
    feature_history_title: '進捗トラッキング',
    feature_history_body: '同じ写真に対する複数の評価結果を記録し、成長を数値化',

    quota_label: '利用プラン',
    quota_headline: '必要に応じて、すぐに評価',
    plan_guest_name: 'ゲスト',
    plan_guest_quota: '1日3回',
    plan_guest_feature: 'Flashのみ',
    plan_free_name: 'Free',
    plan_free_quota: '1日6回',
    plan_free_feature: 'Flash & Pro',
    plan_pro_name: 'Pro',
    plan_pro_quota: '1日30回',
    plan_pro_feature: '優先処理',

    // Score dimension labels
    score_composition: '構図',
    score_lighting: '光',
    score_color: '色彩',
    score_story: 'ストーリー',
    score_technical: '技術',

    // Workspace
    workspace_label: '評価ワークスペース',
    workspace_headline: '写真をアップロード',
    usage_remaining: '本日残り',
    usage_times: '回',
    usage_quota_exhausted: 'クォータ枯渇',
    usage_error: 'クォータ情報の取得に失敗しました',
    stage_uploading: 'アップロード中',
    stage_confirming: '写真を確認中…',
    stage_reviewing: '評価リクエストを送信中…',
    status_ready: '写真のアップロードが完了しました。評価を開始できます。',
    status_rejected: 'この画像はコンテンツ審査を通過できませんでした。',
    status_photo_error: '写真ステータスエラー：',
    err_rate_limit: 'リクエストが多すぎます。少し待ってからお試しください。',
    err_quota: '本日のクォータを消費しました。明日またお試しいただくかアップグレードしてください。',
    err_upload: 'アップロードに失敗しました。接続を確認してください。',
    select_mode: '評価モードを選択',
    mode_flash_desc: '即時評価、秒単位の応答',
    mode_pro_desc: '深度分析、専門的なアドバイス',
    mode_pro_guest: 'ゲスト利用不可',
    btn_start_review: '開始',
    btn_review_suffix: '評価',
    btn_change_photo: '写真を変更',
    btn_reupload: '再アップロード',
    quota_modal_title: '本日のクォータ枯渇',
    quota_modal_body: '本日の評価回数を使い切りました。明日またお試しいただくかサインインしてアップグレードしてください。',
    quota_modal_upgrade: 'サインイン & アップグレード',
    quota_modal_close: '閉じる',

    // Review page
    review_page_label: '評価結果',
    review_page_headline: '結果分析',
    review_back_workspace: 'ワークスペースへ戻る',
    review_back_history: '履歴へ戻る',
    review_advantage: '強み',
    review_critique: '問題点',
    review_suggestions: '改善提案',
    review_btn_again: '再評価',
    review_btn_photo_history: 'この写真の履歴',
    review_no_image: '画像なし',
    review_err_fetch: '評価結果の取得に失敗しました。再試行してください。',
    back_btn: '戻る',

    // Account reviews
    account_reviews_label: '私の履歴',
    account_reviews_headline: '評価履歴',
    reviews_empty: '評価履歴がありません',
    reviews_empty_cta: 'ワークスペースへ',
    reviews_load_more: 'もっと読み込む',
    reviews_loading_more: '読み込み中…',
    reviews_err_fetch: '履歴の取得に失敗しました',
    reviews_err_retry: '再試行',
    photo_thumbnail_alt: '写真サムネイル',

    // Account usage
    usage_label: 'アカウント状態',
    usage_headline: '私のクォータ',
    usage_identity: '現在のプラン',
    usage_upgrade: 'アップグレード',
    usage_today_quota: '本日の評価クォータ',
    usage_bar_used: '本日使用済み',
    usage_bar_total: '回',
    usage_remaining_label: '/ {total} 回残り',
    usage_reset_hint: '本日のクォータを使い切りました。翌日 UTC 0:00 に自動リセット。',
    usage_login_unlock_title: 'サインインしてクォータを増やす',
    usage_login_unlock_body: 'ゲストは1日3回まで評価できます。Googleでサインインしてフリープランへアップグレードし、1日6回の評価と履歴保存をお楽しみください。',
    usage_login_now: '今すぐサインイン',
    usage_goto_workspace: 'ワークスペースへ',

    // Error page
    error_title: 'エラーが発生しました',
    error_go_home: 'ホームへ',
    error_go_workspace: 'ワークスペースへ',

    // Task page
    task_id_label: 'タスク',
    task_step_queue_label: 'キュー待ち',
    task_step_queue_detail: 'タスクが作成され、ワーカーの取得を待っています。',
    task_step_audit_label: 'コンテンツ審査',
    task_step_audit_detail: '画像の安全性チェックを実行中です。',
    task_step_ai_label: 'AI 分析',
    task_step_ai_detail: 'モデルが構図・光・技術を分析中です。',
    task_step_done_label: '完了',
    task_step_done_detail: '結果ページに移動します。',
    task_failed_label: '評価失敗',
    task_failed_detail: 'タスク処理中にエラーが発生しました。',
    task_expired_label: 'タスクタイムアウト',
    task_expired_detail: 'タスクの待機時間が長すぎたため、システムに終了されました。',
    task_dead_letter_label: 'デッドレターキュー',
    task_dead_letter_detail: '複数回再試行後も失敗しました。再度評価を開始してください。',
    task_timeout_error: '待機時間が長すぎます。後ほど手動で更新するか、評価を再開始してください。',
    task_fetch_error: 'タスク状態の取得に失敗しました。ページを更新してください。',
    task_retry: '評価を再開始',
    task_back: 'ワークスペースへ戻る',

    // Error configs
    err_google_failed_title: 'Googleログイン失敗',
    err_google_failed_body: 'Google認証を完了できませんでした。再試行するか、ゲストとして続行してください。',
    err_google_failed_action: 'ゲストとして続行',
    err_quota_exceeded_title: '1日の上限に達しました',
    err_quota_exceeded_body: '本日の評価回数の上限に達しました。UTC00:00にリセットされます。上限を増やすにはログインしてください。',
    err_quota_exceeded_action: '使用状況を確認',
    err_rate_limited_title: 'リクエストが多すぎます',
    err_rate_limited_body: 'リクエストの頻度が高すぎます。しばらくお待ちください。',
    err_rate_limited_action: 'ワークスペースへ戻る',
    err_upload_failed_title: 'アップロード失敗',
    err_upload_failed_body: '画像のアップロード中にエラーが発生しました。接続を確認して再試行してください。',
    err_upload_failed_action: '再試行',
    err_review_rejected_title: 'コンテンツ審査不通過',
    err_review_rejected_body: 'この写真はコンテンツ安全チェックを通過できず、評価できません。利用ガイドラインに従った写真を選択してください。',
    err_review_rejected_action: '別の写真を選ぶ',
    err_task_failed_title: '評価タスク失敗',
    err_task_failed_body: 'AI評価タスクでエラーが発生しました。一時的な問題の可能性がありますので、再試行してください。',
    err_task_failed_action: '評価を再試行',
    err_not_found_title: '見つかりません',
    err_not_found_body: 'リクエストされたコンテンツは存在しないか、削除されています。',
    err_unknown_title: '予期しないエラー',
    err_unknown_body: '予期しないエラーが発生しました。しばらくしてから再試行してください。',
    err_back_home: 'ホームへ戻る',

    // Auth callback
    auth_processing_label: 'ログイン処理中…',
    auth_processing_title: 'ログイン中',
    auth_processing_body: 'Googleアカウントを確認しています…',
    auth_success_title: 'ログイン成功',
    auth_success_body: 'ワークスペースへ移動します…',
    auth_error_title: 'ログイン失敗',
    auth_error_missing_params: 'コールバックパラメータが不足しています。再度ログインしてください。',
    auth_continue_guest: 'ゲストとして続行',
    auth_back_home: 'ホームへ戻る',

    // Image uploader
    uploader_invalid_type: '非対応の形式（JPG / PNG / WebP のみ）',
    uploader_too_large: 'ファイルが大きすぎます（最大 {max} MB）',
    uploader_compressing: '画像を圧縮中…',
    uploader_compressing_wait: 'しばらくお待ちください',
    uploader_drop_hint: '離してアップロード',
    uploader_idle_hint: '画像をドラッグ＆ドロップ、またはクリックして選択',
    uploader_format_hint: 'JPG / PNG / WebP · 最大 {max} MB · 自動圧縮',
    uploader_compressed: '画像を圧縮しました',
    uploader_no_compress: '圧縮不要',
    uploader_saved: '{ratio}% 削減',

    // Status badges
    status_pending: '待機中',
    status_running: '処理中',
    status_succeeded: '完了',
    status_failed: '失敗',
    status_expired: '期限切れ',
    status_ready: '準備完了',
    status_rejected: '拒否',
    status_uploading: 'アップロード中',

    // Score ring
    score_overall: '総合スコア',
  },
} as const;

export type TranslationKey = keyof typeof translations['zh'];

// ─── Context ──────────────────────────────────────────────────────────────────

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'zh',
  setLocale: () => {},
  t: (key) => key,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'picspeak-locale';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved && saved in translations) setLocaleState(saved);
    } catch {
      // ignore
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return (translations[locale] as Record<string, string>)[key] ?? (translations['zh'] as Record<string, string>)[key] ?? key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useI18n() {
  return useContext(I18nContext);
}
