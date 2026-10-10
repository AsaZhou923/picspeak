from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Announcement, GeneratedImage, ImageGenerationTask, Notification, Review, ReviewTask, TaskStatus, User
from app.services.billing_access import effective_user_billing_plan
from app.services.guard import review_history_cutoff

SUPPORTED_LOCALES = {'en', 'zh', 'ja'}
LOCALE_FALLBACK = 'en'

SYSTEM_COPY: dict[str, dict[str, tuple[str, str, str]]] = {
    'review.completed': {
        'en': ('Review completed', 'Your photo critique is ready.', 'Open the result to review scores and next-shoot actions.'),
        'zh': ('点评已完成', '你的照片点评已经生成。', '打开结果查看评分与下一次拍摄建议。'),
        'ja': ('レビューが完了しました', '写真講評の準備ができました。', '結果を開いてスコアと次の撮影アクションを確認できます。'),
    },
    'review.failed': {
        'en': ('Review did not finish', 'This photo critique could not be completed.', 'Open the task page to see the reason and next steps.'),
        'zh': ('点评未能完成', '这次照片点评未能完成。', '打开任务页面查看原因和后续操作。'),
        'ja': ('レビューが完了しませんでした', '今回の写真講評を完了できませんでした。', 'タスクページを開いて理由と次の操作を確認してください。'),
    },
    'generation.completed': {
        'en': ('Image generated', 'Your reference image is ready.', 'Open the generated image to download or reuse the prompt.'),
        'zh': ('图片已生成', '你的参考图片已经准备好。', '打开生成结果下载或复用提示词。'),
        'ja': ('画像が生成されました', '参照画像の準備ができました。', '生成結果を開いてダウンロードまたはプロンプトを再利用できます。'),
    },
    'generation.failed': {
        'en': ('Image generation did not finish', 'This image could not be generated.', 'Open the task page to see the reason and next steps.'),
        'zh': ('图片生成未成功', '这次图片生成未能完成。', '打开任务页面查看原因和后续操作。'),
        'ja': ('画像生成が完了しませんでした', '今回の画像を生成できませんでした。', 'タスクページを開いて理由と次の操作を確認してください。'),
    },
    'credits.confirmed': {
        'en': ('Credits confirmed', 'New image credits were added to your account.', 'Open usage to check the confirmed balance.'),
        'zh': ('额度已到账', '新的图片生成额度已加入你的账户。', '打开用量页查看已确认余额。'),
        'ja': ('クレジットが反映されました', '新しい画像生成クレジットがアカウントに追加されました。', '使用状況で反映済み残高を確認できます。'),
    },
    'subscription.changed': {
        'en': ('Subscription updated', 'Your Pro subscription status changed.', 'Open account usage to review the current status.'),
        'zh': ('订阅状态已更新', '你的 Pro 订阅状态发生变化。', '打开账户用量查看当前状态。'),
        'ja': ('サブスクリプションが更新されました', 'Pro サブスクリプションの状態が変更されました。', 'アカウント使用状況で現在の状態を確認してください。'),
    },
    'gallery.review_liked': {
        'en': ('Your work received a like', 'Someone liked one of your Gallery works.', 'Open the result to review the work.'),
        'zh': ('你的作品收到点赞', '有人点赞了你的长廊作品。', '打开结果查看这幅作品。'),
        'ja': ('作品にいいねが付きました', 'あなたのギャラリー作品にいいねが付きました。', '結果を開いて作品を確認できます。'),
    },
}

TEMPLATE_EVENT_TYPES = {
    'review_completed': 'review.completed',
    'review_failed': 'review.failed',
    'generation_completed': 'generation.completed',
    'generation_failed': 'generation.failed',
    'credits_confirmed': 'credits.confirmed',
    'subscription_changed': 'subscription.changed',
    'gallery_review_liked': 'gallery.review_liked',
    'review.completed.v1': 'review.completed',
    'review.failed.v1': 'review.failed',
    'generation.completed.v1': 'generation.completed',
    'generation.failed.v1': 'generation.failed',
    'credits.confirmed.v1': 'credits.confirmed',
    'subscription.changed.v1': 'subscription.changed',
    'gallery.review_liked.v1': 'gallery.review_liked',
}

SUBSCRIPTION_STATUS_COPY = {
    'active': {
        'en': 'Your Pro access was confirmed. Check your account for its current status.',
        'zh': 'Pro 权益已确认生效，当前状态请查看账户。',
        'ja': 'Pro の利用権が確認されました。現在の状態はアカウントで確認できます。',
    },
    'cancelled': {
        'en': 'Automatic renewal was cancelled. Check your account for remaining access.',
        'zh': '自动续费已取消，剩余权益请查看账户。',
        'ja': '自動更新が停止されました。残りの利用権はアカウントで確認できます。',
    },
    'expired': {
        'en': 'The subscription expired. Check your account for current access.',
        'zh': '订阅已到期，当前权益请查看账户。',
        'ja': 'サブスクリプションの期間が終了しました。現在の利用権はアカウントで確認できます。',
    },
    'paused': {
        'en': 'Subscription billing was paused. Check your account for current access.',
        'zh': '订阅计费已暂停，当前权益请查看账户。',
        'ja': 'サブスクリプションの請求が一時停止されました。現在の利用権はアカウントで確認できます。',
    },
}


def coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def normalize_locale(locale: str | None) -> str:
    normalized = str(locale or '').split('-', 1)[0].lower()
    return normalized if normalized in SUPPORTED_LOCALES else LOCALE_FALLBACK


def _localized(value: Any, locale: str, fallback: str = '') -> str:
    if not isinstance(value, dict):
        return fallback
    return str(value.get(locale) or value.get(LOCALE_FALLBACK) or fallback)


def _event_type(notification: Notification) -> str:
    if notification.notification_type in SYSTEM_COPY:
        return notification.notification_type
    return TEMPLATE_EVENT_TYPES.get(notification.template_key, notification.notification_type)


def _review_accessible_for_notification(db: Session, review: Review, owner: User) -> bool:
    cutoff = review_history_cutoff(effective_user_billing_plan(db, owner))
    if cutoff is None or review.is_public:
        return True
    created_at = coerce_utc(review.created_at)
    return created_at is None or created_at >= cutoff


def _review_target(db: Session, notification: Notification, public_id: str | None) -> dict[str, Any] | None:
    if not public_id:
        return None
    row = (
        db.query(Review, User)
        .join(User, User.id == Review.owner_user_id)
        .filter(
            Review.public_id == public_id,
            Review.owner_user_id == notification.recipient_user_id,
            Review.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        return {'type': 'review', 'public_id': public_id, 'href': None, 'state': 'unavailable'}
    review, owner = row
    if not _review_accessible_for_notification(db, review, owner):
        return {'type': 'review', 'public_id': public_id, 'href': None, 'state': 'unavailable'}
    return {'type': 'review', 'public_id': review.public_id, 'href': f'/reviews/{review.public_id}', 'state': 'available'}


def _review_task_target(db: Session, notification: Notification, public_id: str | None) -> dict[str, Any] | None:
    if not public_id:
        return None
    task = (
        db.query(ReviewTask)
        .filter(ReviewTask.public_id == public_id, ReviewTask.owner_user_id == notification.recipient_user_id)
        .first()
    )
    if task is None:
        return {'type': 'task', 'public_id': public_id, 'href': None, 'state': 'unavailable'}
    if task.status == TaskStatus.SUCCEEDED:
        row = (
            db.query(Review, User)
            .join(User, User.id == Review.owner_user_id)
            .filter(
                Review.task_id == task.id,
                Review.owner_user_id == notification.recipient_user_id,
                Review.deleted_at.is_(None),
            )
            .first()
        )
        if row is not None:
            review, owner = row
            if not _review_accessible_for_notification(db, review, owner):
                return {'type': 'review', 'public_id': review.public_id, 'href': None, 'state': 'unavailable'}
            return {'type': 'review', 'public_id': review.public_id, 'href': f'/reviews/{review.public_id}', 'state': 'available'}
    return {'type': 'task', 'public_id': task.public_id, 'href': f'/tasks/{task.public_id}', 'state': 'available'}


def _generation_target(db: Session, notification: Notification, public_id: str | None) -> dict[str, Any] | None:
    if not public_id:
        return None
    image = (
        db.query(GeneratedImage)
        .filter(
            GeneratedImage.public_id == public_id,
            GeneratedImage.owner_user_id == notification.recipient_user_id,
            GeneratedImage.deleted_at.is_(None),
        )
        .first()
    )
    if image is None:
        return {'type': 'generation', 'public_id': public_id, 'href': None, 'state': 'unavailable'}
    return {'type': 'generation', 'public_id': image.public_id, 'href': f'/generations/{image.public_id}', 'state': 'available'}


def _generation_task_target(db: Session, notification: Notification, public_id: str | None) -> dict[str, Any] | None:
    if not public_id:
        return None
    task = (
        db.query(ImageGenerationTask)
        .filter(ImageGenerationTask.public_id == public_id, ImageGenerationTask.owner_user_id == notification.recipient_user_id)
        .first()
    )
    if task is None:
        return {'type': 'generation_task', 'public_id': public_id, 'href': None, 'state': 'unavailable'}
    if task.status == TaskStatus.SUCCEEDED:
        image = (
            db.query(GeneratedImage)
            .filter(GeneratedImage.task_id == task.id, GeneratedImage.owner_user_id == notification.recipient_user_id, GeneratedImage.deleted_at.is_(None))
            .first()
        )
        if image is not None:
            return {'type': 'generation', 'public_id': image.public_id, 'href': f'/generations/{image.public_id}', 'state': 'available'}
    return {'type': 'generation_task', 'public_id': task.public_id, 'href': f'/generation-tasks/{task.public_id}', 'state': 'available'}


def _target(db: Session, notification: Notification) -> dict[str, Any] | None:
    target_type = notification.target_type
    target_id = notification.target_public_id
    if target_type == 'review':
        return _review_target(db, notification, target_id)
    if target_type in {'task', 'review_task'}:
        return _review_task_target(db, notification, target_id)
    if target_type == 'generation':
        return _generation_target(db, notification, target_id)
    if target_type == 'generation_task':
        return _generation_task_target(db, notification, target_id)
    if target_type in {'account_usage', 'usage'}:
        return {'type': 'usage', 'public_id': None, 'href': '/account/usage', 'state': 'available'}
    return {'type': target_type, 'public_id': target_id, 'href': None, 'state': 'available'} if target_type else None


def _announcement_payload(db: Session, notification: Notification, *, locale: str, detail: bool) -> dict[str, Any] | None:
    if notification.category != 'announcement' or notification.announcement_id is None:
        return None
    announcement = db.query(Announcement).filter(Announcement.id == notification.announcement_id).first()
    if announcement is None:
        return None
    cta = announcement.cta_json or {}
    payload = {
        'notification_id': notification.public_id,
        'category': notification.category,
        'type': notification.notification_type,
        'title': _localized(announcement.title_json, locale),
        'summary': _localized(announcement.summary_json, locale),
        'occurred_at': notification.occurred_at,
        'delivered_at': notification.delivered_at,
        'read_at': notification.read_at,
        'archived_at': notification.archived_at,
        'target': {'type': cta.get('type') or 'updates', 'public_id': cta.get('public_id'), 'href': cta.get('href'), 'state': 'available'},
    }
    if detail:
        payload['body'] = _localized(announcement.body_json, locale, payload['summary'])
        payload['rendered_locale'] = locale
    return payload


def render_notification(db: Session, notification: Notification, *, locale: str | None, detail: bool = False) -> dict[str, Any]:
    rendered_locale = normalize_locale(locale)
    announcement = _announcement_payload(db, notification, locale=rendered_locale, detail=detail)
    if announcement is not None:
        return announcement

    event_type = _event_type(notification)
    title, summary, body = SYSTEM_COPY.get(event_type, SYSTEM_COPY['review.completed'])[rendered_locale]
    payload = notification.template_params_json or {}
    if event_type == 'subscription.changed':
        summary = SUBSCRIPTION_STATUS_COPY.get(payload.get('status'), {}).get(rendered_locale, summary)
    credits = payload.get('credits')
    if event_type == 'credits.confirmed' and (
        type(credits) is int or (isinstance(credits, str) and re.fullmatch(r'[0-9]{1,9}', credits))
    ) and int(credits) > 0:
        summary = f'{summary} (+{int(credits)})'

    result = {
        'notification_id': notification.public_id,
        'category': notification.category,
        'type': event_type,
        'title': title,
        'summary': summary,
        'occurred_at': notification.occurred_at,
        'delivered_at': notification.delivered_at,
        'read_at': notification.read_at,
        'archived_at': notification.archived_at,
        'target': _target(db, notification),
    }
    if detail:
        result['body'] = body
        result['rendered_locale'] = rendered_locale
    return result
