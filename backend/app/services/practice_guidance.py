from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import status
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, new_public_id
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import Photo, PracticeAttempt, PracticeSceneGroup, PracticeSession, ProductAnalyticsEvent, Review, ReviewTask
from app.practice_schemas import (
    PracticeGuidanceCoverage,
    PracticeGuidanceEvidence,
    PracticeGuidanceObservation,
    PracticeGuidanceProfileResponse,
    PracticeGuidanceTemplate,
    PracticeRecommendation,
    PracticeRecommendationsResponse,
    PracticeSceneGroupRequest,
    PracticeSceneGroupResponse,
    PracticeSuccessCriterion,
    PracticeTemplateCriterion,
)
from app.services.practice_access import (
    load_photos_by_id,
    load_reviews_by_id,
    load_tasks_by_id,
    owner_history_cutoff,
    source_access_summary,
)
from app.services.practice_metrics import _validated_goal_status_from_db

GUIDANCE_TEMPLATE_VERSION = 'practice-guidance-template-v2026-09-draft'
LOCALES = {'zh', 'en', 'ja'}

# Project owner confirmed these Chinese card summaries on 2026-09-23.
# Freeze the visible title, dimension and goal; this is not a course efficacy review.
CONFIRMED_ZH_SUMMARIES = {
    'clean-background': ('整理背景分离', 'composition', '让主体从干扰性的背景形状中分离出来。'),
    'edge-cleanup': ('清理画面边缘', 'composition', '去掉边缘干扰，让主体第一眼被看见。'),
    'foreground-layer': ('加入前景层次', 'impact', '用前景制造空间深度，同时不遮挡主体。'),
    'side-light': ('辨认侧光', 'lighting', '调整主体朝向，让侧光塑造形体和质感。'),
    'focus-choice': ('明确一个焦点选择', 'technical', '选择最重要的细节，并让它明显清晰。'),
    'color-anchor': ('设定一个色彩锚点', 'color', '让一个色系承担画面重点，同时减少竞争性的色彩噪音。'),
    'subject-scale': ('改变主体大小关系', 'composition', '调整主体在画面中的大小，让意图更清楚。'),
    'same-subject-new-angle': ('同一主体换角度', 'impact', '改变角度，让主体在画面里的角色更清楚。'),
}


@dataclass(frozen=True)
class _EvidenceRow:
    session: PracticeSession
    attempt: PracticeAttempt
    review: Review
    source_review_public_id: str
    scene_group: PracticeSceneGroup | None
    status: str
    dimension: str
    goal: str
    genre: str | None
    evidence_count: int
    comparable: bool
    comparison_confidence: str | None


TEMPLATES: tuple[dict, ...] = (
    {
        'template_id': 'clean-background',
        'dimension': 'composition',
        'title': {'en': 'Clean background separation', 'zh': '整理背景分离', 'ja': '背景を整理して分離する'},
        'applicable_genres': ['portrait', 'street', 'product'],
        'scene_conditions': {
            'en': ['You can move your position or the subject', 'Background clutter is visible behind the subject'],
            'zh': ['你可以移动机位或主体', '主体背后有明显干扰物'],
            'ja': ['撮影位置か被写体を動かせる', '被写体の後ろに背景の雑多な要素がある'],
        },
        'goal_example': {
            'en': 'Separate the subject from distracting background shapes.',
            'zh': '让主体从干扰性的背景形状中分离出来。',
            'ja': '被写体を気になる背景の形から分離する。',
        },
        'success_criteria': {
            'en': [{'key': 'edge', 'label': 'Subject edges remain visually separated from background clutter'}],
            'zh': [{'key': 'edge', 'label': '主体边缘与背景干扰物清楚分离'}],
            'ja': [{'key': 'edge', 'label': '被写体の輪郭が背景の雑多な要素から分離して見える'}],
        },
        'counterexamples': {
            'en': ['Cropping tighter while a pole or bright object still touches the subject'],
            'zh': ['只是裁得更紧，但杆子或亮物仍贴着主体'],
            'ja': ['よりタイトに切っただけで、柱や明るい物がまだ被写体に接している'],
        },
        'transfer_task': {
            'en': 'Try the same subject separation goal in a different background or room.',
            'zh': '在另一个背景或房间里重复同一个主体分离目标。',
            'ja': '別の背景や部屋で、同じ被写体分離の目標を試す。',
        },
    },
    {
        'template_id': 'edge-cleanup',
        'dimension': 'composition',
        'title': {'en': 'Frame edge cleanup', 'zh': '清理画面边缘', 'ja': '画面端を整理する'},
        'applicable_genres': ['default', 'street', 'landscape', 'architecture'],
        'scene_conditions': {
            'en': ['You can reframe before shooting or crop intentionally during editing'],
            'zh': ['你可以在拍摄前重新构图，或在编辑时有意识裁切'],
            'ja': ['撮影前に構図を変えるか、編集で意図的に切り取れる'],
        },
        'goal_example': {
            'en': 'Remove edge distractions so the main subject reads first.',
            'zh': '去掉边缘干扰，让主体第一眼被看见。',
            'ja': '画面端の邪魔な要素を減らし、主役が先に伝わるようにする。',
        },
        'success_criteria': {
            'en': [{'key': 'edges', 'label': 'Frame edges do not contain partial objects that pull attention'}],
            'zh': [{'key': 'edges', 'label': '画面边缘没有抢注意力的半截物体'}],
            'ja': [{'key': 'edges', 'label': '画面端に注意を奪う途中で切れた物がない'}],
        },
        'counterexamples': {
            'en': ['Leaving half signs, cut limbs, or bright corners that compete with the subject'],
            'zh': ['保留半截招牌、切断肢体或抢眼亮角'],
            'ja': ['半分だけの看板、切れた手足、明るすぎる隅を残す'],
        },
        'transfer_task': {
            'en': 'Repeat the edge scan on a new scene before pressing the shutter.',
            'zh': '换一个场景，在按快门前再做一次边缘扫描。',
            'ja': '別のシーンで、シャッター前にもう一度画面端を確認する。',
        },
    },
    {
        'template_id': 'foreground-layer',
        'dimension': 'impact',
        'title': {'en': 'Add a foreground layer', 'zh': '加入前景层次', 'ja': '前景のレイヤーを加える'},
        'applicable_genres': ['street', 'landscape', 'travel'],
        'scene_conditions': {
            'en': ['There is a safe foreground object or texture you can include'],
            'zh': ['现场有可以安全纳入的前景物体或纹理'],
            'ja': ['安全に入れられる前景の物や質感がある'],
        },
        'goal_example': {
            'en': 'Use a foreground layer to create depth without hiding the subject.',
            'zh': '用前景制造空间深度，同时不遮挡主体。',
            'ja': '被写体を隠さず、前景で奥行きを作る。',
        },
        'success_criteria': {
            'en': [{'key': 'depth', 'label': 'Foreground, subject, and background form readable depth layers'}],
            'zh': [{'key': 'depth', 'label': '前景、主体、背景形成可读的空间层次'}],
            'ja': [{'key': 'depth', 'label': '前景、被写体、背景が読み取れる奥行きになる'}],
        },
        'counterexamples': {
            'en': ['Foreground blocks the subject or becomes brighter than the subject'],
            'zh': ['前景挡住主体，或比主体更抢眼'],
            'ja': ['前景が被写体を隠す、または被写体より目立つ'],
        },
        'transfer_task': {
            'en': 'Try the same depth cue with a different foreground material.',
            'zh': '换一种前景材质，重复同一个深度线索练习。',
            'ja': '別の前景素材で同じ奥行きの手がかりを試す。',
        },
    },
    {
        'template_id': 'side-light',
        'dimension': 'lighting',
        'title': {'en': 'Identify side light', 'zh': '辨认侧光', 'ja': 'サイドライトを見つける'},
        'applicable_genres': ['portrait', 'street', 'still_life'],
        'scene_conditions': {
            'en': ['A window, sun edge, or single lamp can light the subject from one side'],
            'zh': ['窗户、日光边缘或单盏灯能从侧面照亮主体'],
            'ja': ['窓、太陽の端、単一のライトが横から被写体を照らせる'],
        },
        'goal_example': {
            'en': 'Turn the subject so side light shapes form and texture.',
            'zh': '调整主体朝向，让侧光塑造形体和质感。',
            'ja': 'サイドライトで形と質感が出るように被写体の向きを変える。',
        },
        'success_criteria': {
            'en': [{'key': 'shape', 'label': 'Light direction adds visible shape without losing key detail'}],
            'zh': [{'key': 'shape', 'label': '光线方向带来形体感，且关键细节没有丢失'}],
            'ja': [{'key': 'shape', 'label': '光の方向で形が出て、重要な細部も残っている'}],
        },
        'counterexamples': {
            'en': ['Moving into flat front light or harsh shadow that removes important detail'],
            'zh': ['改成平直正面光，或让硬阴影吞掉关键细节'],
            'ja': ['平坦な正面光や、重要な細部を消す強い影に移る'],
        },
        'transfer_task': {
            'en': 'Find a second location with side light and repeat the same light-direction check.',
            'zh': '找第二个有侧光的位置，重复同一套光线方向检查。',
            'ja': 'サイドライトのある別の場所で、同じ光の方向チェックを繰り返す。',
        },
    },
    {
        'template_id': 'focus-choice',
        'dimension': 'technical',
        'title': {'en': 'Make one focus choice', 'zh': '明确一个焦点选择', 'ja': 'フォーカスを一つ選ぶ'},
        'applicable_genres': ['portrait', 'product', 'still_life'],
        'scene_conditions': {
            'en': ['The subject has a clear detail that should be sharp'],
            'zh': ['主体有一个应该清晰呈现的关键细节'],
            'ja': ['被写体に、シャープに見せたい明確な細部がある'],
        },
        'goal_example': {
            'en': 'Choose the most important detail and keep it visibly sharp.',
            'zh': '选择最重要的细节，并让它明显清晰。',
            'ja': '最も重要な細部を選び、それをはっきりシャープにする。',
        },
        'success_criteria': {
            'en': [{'key': 'sharp-detail', 'label': 'The chosen subject detail is the clearest visual anchor'}],
            'zh': [{'key': 'sharp-detail', 'label': '被选中的主体细节是最清楚的视觉锚点'}],
            'ja': [{'key': 'sharp-detail', 'label': '選んだ被写体の細部が最も明確な視覚の軸になる'}],
        },
        'counterexamples': {
            'en': ['Background texture is sharper than the intended subject detail'],
            'zh': ['背景纹理比你想表达的主体细节更清晰'],
            'ja': ['意図した被写体の細部より背景の質感の方がシャープ'],
        },
        'transfer_task': {
            'en': 'Repeat with another subject where the focus anchor changes.',
            'zh': '换一个焦点锚点不同的主体再练一次。',
            'ja': 'フォーカスの軸が変わる別の被写体で繰り返す。',
        },
    },
    {
        'template_id': 'color-anchor',
        'dimension': 'color',
        'title': {'en': 'Set one color anchor', 'zh': '设定一个色彩锚点', 'ja': '色の軸を一つ決める'},
        'applicable_genres': ['street', 'portrait', 'product', 'interior'],
        'scene_conditions': {
            'en': ['One dominant color can be kept and competing colors can be reduced'],
            'zh': ['可以保留一个主导色，并减少竞争色'],
            'ja': ['一つの主な色を残し、競合する色を減らせる'],
        },
        'goal_example': {
            'en': 'Make one color family carry the image while reducing competing color noise.',
            'zh': '让一个色系承担画面重点，同时减少竞争性的色彩噪音。',
            'ja': '一つの色系を画面の軸にし、競合する色ノイズを減らす。',
        },
        'success_criteria': {
            'en': [{'key': 'anchor', 'label': 'One color family reads as the intentional anchor'}],
            'zh': [{'key': 'anchor', 'label': '一个色系能被看作有意设置的画面锚点'}],
            'ja': [{'key': 'anchor', 'label': '一つの色系が意図した軸として読める'}],
        },
        'counterexamples': {
            'en': ['Increasing saturation everywhere until the subject and background compete equally'],
            'zh': ['把所有颜色都提高饱和度，导致主体和背景同样抢眼'],
            'ja': ['全体の彩度を上げすぎて、被写体と背景が同じ強さで競合する'],
        },
        'transfer_task': {
            'en': 'Apply the same color-anchor choice to a different subject or light.',
            'zh': '把同一个色彩锚点选择应用到不同主体或光线里。',
            'ja': '同じ色の軸の選び方を、別の被写体や光で試す。',
        },
    },
    {
        'template_id': 'subject-scale',
        'dimension': 'composition',
        'title': {'en': 'Change subject scale', 'zh': '改变主体大小关系', 'ja': '被写体の大きさを変える'},
        'applicable_genres': ['portrait', 'street', 'travel'],
        'scene_conditions': {
            'en': ['You can step closer, step back, or switch crop'],
            'zh': ['你可以靠近、后退，或改变裁切'],
            'ja': ['近づく、離れる、または切り取りを変えられる'],
        },
        'goal_example': {
            'en': 'Adjust subject size so the intended story is clear.',
            'zh': '调整主体在画面中的大小，让意图更清楚。',
            'ja': '意図した物語が伝わるように被写体の大きさを調整する。',
        },
        'success_criteria': {
            'en': [{'key': 'scale', 'label': 'Subject scale matches the intended story and no longer feels accidental'}],
            'zh': [{'key': 'scale', 'label': '主体大小关系符合表达意图，不再显得偶然'}],
            'ja': [{'key': 'scale', 'label': '被写体の大きさが意図に合い、偶然に見えない'}],
        },
        'counterexamples': {
            'en': ['Cropping closer but losing the context needed to understand the scene'],
            'zh': ['裁得更近，却丢掉了理解场景所需的环境'],
            'ja': ['寄って切った結果、シーン理解に必要な文脈を失う'],
        },
        'transfer_task': {
            'en': 'Try both a tighter and wider version, then compare which preserves intent.',
            'zh': '同时尝试更近和更远的版本，再比较哪个更保留意图。',
            'ja': 'よりタイトな版と広い版の両方を試し、どちらが意図を保つか比べる。',
        },
    },
    {
        'template_id': 'same-subject-new-angle',
        'dimension': 'impact',
        'title': {'en': 'Same subject, new angle', 'zh': '同一主体换角度', 'ja': '同じ被写体を別角度で撮る'},
        'applicable_genres': ['default', 'architecture', 'product', 'street'],
        'scene_conditions': {
            'en': ['The subject can be photographed again from another safe viewpoint'],
            'zh': ['可以从另一个安全机位再次拍摄主体'],
            'ja': ['別の安全な視点から同じ被写体をもう一度撮れる'],
        },
        'goal_example': {
            'en': 'Change angle so the subject has a clearer visual role.',
            'zh': '改变角度，让主体在画面里的角色更清楚。',
            'ja': '角度を変えて、被写体の視覚的な役割を明確にする。',
        },
        'success_criteria': {
            'en': [{'key': 'role', 'label': 'The subject role is clearer because the camera angle changed'}],
            'zh': [{'key': 'role', 'label': '因为机位变化，主体角色更清楚'}],
            'ja': [{'key': 'role', 'label': 'カメラ角度の変更で被写体の役割がより明確になる'}],
        },
        'counterexamples': {
            'en': ['Changing angle only slightly while keeping the same clutter and light problem'],
            'zh': ['角度只变了一点，杂乱和光线问题仍然一样'],
            'ja': ['角度の変化がわずかで、同じ雑然さや光の問題が残る'],
        },
        'transfer_task': {
            'en': 'Move to a new scene and repeat the angle change with a different subject.',
            'zh': '换一个场景和主体，重复“换角度”练习。',
            'ja': '新しいシーンと別の被写体で、角度変更の練習を繰り返す。',
        },
    },
)


def _localized(value, locale: str):
    if isinstance(value, dict):
        return value.get(locale) or value.get('en')
    return value


def _normalize_locale(locale: str | None) -> str:
    value = str(locale or 'en').strip().lower()
    return value if value in LOCALES else 'en'


def _template_response(template: dict, locale: str = 'en') -> PracticeGuidanceTemplate:
    locale = _normalize_locale(locale)
    confirmed = locale == 'zh' and CONFIRMED_ZH_SUMMARIES.get(template['template_id']) == (
        template['title'].get('zh'), template['dimension'], template['goal_example'].get('zh'),
    )
    return PracticeGuidanceTemplate(
        template_id=template['template_id'],
        version=GUIDANCE_TEMPLATE_VERSION,
        dimension=template['dimension'],
        title=_localized(template['title'], locale),
        applicable_genres=list(template['applicable_genres']),
        scene_conditions=list(_localized(template['scene_conditions'], locale)),
        goal_example=_localized(template['goal_example'], locale),
        success_criteria=[PracticeTemplateCriterion(**item) for item in _localized(template['success_criteria'], locale)],
        counterexamples=list(_localized(template['counterexamples'], locale)),
        transfer_task=_localized(template['transfer_task'], locale),
        human_review_status='owner_confirmed_summary' if confirmed else 'draft_pending_review',
    )


def guidance_templates(locale: str = 'en') -> list[PracticeGuidanceTemplate]:
    return [_template_response(template, locale) for template in TEMPLATES]


def _goal(session: PracticeSession) -> str:
    snapshot = session.goal_snapshot if isinstance(session.goal_snapshot, dict) else {}
    return str(snapshot.get('goal') or '').strip()


def _dimension(session: PracticeSession) -> str:
    snapshot = session.goal_snapshot if isinstance(session.goal_snapshot, dict) else {}
    return str(snapshot.get('dimension') or 'unknown')


def _load_scene_groups(db: Session, actor: CurrentActor, session_ids: list[int]) -> dict[int, PracticeSceneGroup]:
    if not session_ids:
        return {}
    groups = (
        db.query(PracticeSceneGroup)
        .filter(PracticeSceneGroup.owner_user_id == actor.user.id, PracticeSceneGroup.session_id.in_(session_ids))
        .all()
    )
    return {group.session_id: group for group in groups}


def _evidence_payload(row: _EvidenceRow) -> PracticeGuidanceEvidence:
    return PracticeGuidanceEvidence(
        session_id=row.session.public_id,
        attempt_id=row.attempt.public_id,
        review_id=row.review.public_id,
        source_review_id=row.source_review_public_id,
        scene_group=row.scene_group.label if row.scene_group is not None else None,
        goal=row.goal,
        dimension=row.dimension,
        status=row.status,  # type: ignore[arg-type]
        practice_kind=row.session.practice_kind,
        created_at=row.attempt.created_at,
    )


def _valid_evidence_rows(db: Session, actor: CurrentActor) -> tuple[list[PracticeSession], list[_EvidenceRow], dict[int, PracticeSceneGroup]]:
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.owner_user_id == actor.user.id)
        .order_by(PracticeSession.created_at.desc(), PracticeSession.id.desc())
        .all()
    )
    session_ids = [session.id for session in sessions]
    if not session_ids:
        return sessions, [], {}

    source_reviews = load_reviews_by_id(db, [session.source_review_id for session in sessions], actor.user.id)
    source_photos = load_photos_by_id(db, [session.source_photo_id for session in sessions], actor.user.id)
    scene_groups = _load_scene_groups(db, actor, session_ids)
    cutoff = owner_history_cutoff(actor.plan)
    source_access_by_session = {
        session.id: source_access_summary(
            session,
            source_review=source_reviews.get(session.source_review_id),
            source_photo=source_photos.get(session.source_photo_id),
            owner_user_id=actor.user.id,
            cutoff=cutoff,
        )
        for session in sessions
    }
    attempts = (
        db.query(PracticeAttempt)
        .filter(PracticeAttempt.owner_user_id == actor.user.id, PracticeAttempt.session_id.in_(session_ids))
        .order_by(PracticeAttempt.created_at.desc(), PracticeAttempt.id.desc())
        .all()
    )
    tasks = load_tasks_by_id(db, [attempt.task_id for attempt in attempts], actor.user.id)
    reviews = load_reviews_by_id(db, [attempt.review_id for attempt in attempts], actor.user.id)
    photos = load_photos_by_id(db, [attempt.photo_id for attempt in attempts], actor.user.id)
    viewed_attempt_ids = _load_viewed_attempt_ids(db, actor, attempts)
    sessions_by_id = {session.id: session for session in sessions}
    rows: list[_EvidenceRow] = []
    seen_sessions: set[int] = set()
    for attempt in attempts:
        if attempt.session_id in seen_sessions:
            continue
        session = sessions_by_id.get(attempt.session_id)
        if session is None:
            continue
        review = reviews.get(attempt.review_id) if attempt.review_id else None
        source_review = source_reviews.get(session.source_review_id)
        valid_goal = _validated_goal_status_from_db(
            attempt,
            session,
            tasks.get(attempt.task_id),
            review,
            source_review,
            photos.get(attempt.photo_id),
            source_photos.get(session.source_photo_id),
            cutoff,
            True,
        )
        if (
            session.practice_kind != 'capture_retake'
            or attempt.id not in viewed_attempt_ids
            or review is None
            or source_review is None
            or valid_goal.get('status') not in {'achieved', 'partial', 'not_achieved'}
            or valid_goal.get('learning_exclusion_reasons')
            or not valid_goal.get('evidence')
            or not valid_goal.get('comparable')
            or valid_goal.get('comparison_confidence') in {'low', 'unknown', None}
        ):
            continue
        rows.append(
            _EvidenceRow(
                session=session,
                attempt=attempt,
                review=review,
                source_review_public_id=source_review.public_id,
                scene_group=scene_groups.get(session.id),
                status=str(valid_goal['status']),
                dimension=_dimension(session),
                goal=_goal(session),
                genre=source_access_by_session[session.id].genre,
                evidence_count=len(valid_goal.get('evidence') or []),
                comparable=bool(valid_goal.get('comparable')),
                comparison_confidence=valid_goal.get('comparison_confidence'),
            )
        )
        seen_sessions.add(session.id)
    return sessions, rows, scene_groups


def _load_viewed_attempt_ids(db: Session, actor: CurrentActor, attempts: list[PracticeAttempt]) -> set[int]:
    attempt_by_public_id = {attempt.public_id: attempt.id for attempt in attempts}
    if not attempt_by_public_id:
        return set()
    rows = (
        db.query(ProductAnalyticsEvent)
        .filter(
            ProductAnalyticsEvent.event_name == 'practice_result_viewed',
            ProductAnalyticsEvent.user_public_id == actor.user.public_id,
            ProductAnalyticsEvent.source == 'retake_coach',
        )
        .all()
    )
    viewed: set[int] = set()
    for row in rows:
        metadata = row.metadata_json if isinstance(row.metadata_json, dict) else {}
        attempt_id = attempt_by_public_id.get(metadata.get('attempt_id'))
        if attempt_id is not None:
            viewed.add(attempt_id)
    return viewed


def _coverage(sessions: list[PracticeSession], rows: list[_EvidenceRow], scene_groups: dict[int, PracticeSceneGroup]) -> PracticeGuidanceCoverage:
    valid_session_ids = {row.session.id for row in rows}
    kind_counts = Counter(row.session.practice_kind for row in rows)
    record_kind_counts = Counter(session.practice_kind for session in sessions)
    return PracticeGuidanceCoverage(
        valid_session_count=len(valid_session_ids),
        valid_attempt_count=len(rows),
        scene_group_count=len({row.scene_group.label for row in rows if row.scene_group is not None}),
        goal_count=len({row.goal for row in rows if row.goal}),
        untagged_session_count=len([session for session in sessions if session.id in valid_session_ids and session.id not in scene_groups]),
        capture_retake_count=kind_counts.get('capture_retake', 0),
        edit_revision_count=record_kind_counts.get('edit_revision', 0),
        same_image_recheck_count=record_kind_counts.get('same_image_recheck', 0),
    )


def _level(coverage: PracticeGuidanceCoverage) -> tuple[str, str]:
    if coverage.untagged_session_count > 0:
        return 'records_only', 'scene_groups_required'
    if coverage.valid_session_count >= 8 and coverage.scene_group_count >= 3 and coverage.goal_count >= 2:
        return 'practice_summary', 'enough_for_candidate_summary'
    if coverage.valid_session_count >= 3 and coverage.scene_group_count >= 2:
        return 'preliminary_observations', 'limited_samples'
    return 'records_only', 'not_enough_valid_practice'


OBSERVATION_COPY = {
    'repeated_title': {
        'en': '{dimension} keeps needing another pass',
        'zh': '{dimension} 仍反复需要再练',
        'ja': '{dimension} はもう一度練習が必要です',
    },
    'repeated_body': {
        'en': 'This is a limited observation from repeated partial or not achieved practice results.',
        'zh': '这是来自多次部分达成或未达成结果的有限观察。',
        'ja': 'これは複数の部分達成または未達成の結果から得た限定的な観察です。',
    },
    'worked_title': {
        'en': '{dimension} has a traceable worked example',
        'zh': '{dimension} 已有可追溯的有效案例',
        'ja': '{dimension} には追跡可能な成功例があります',
    },
    'worked_body': {
        'en': 'At least one practice result reached the selected goal. This is evidence for that task, not a general ability score.',
        'zh': '至少一次练习达成了所选目标。这是该任务的证据，不是通用能力分。',
        'ja': '少なくとも一つの練習結果が選んだ目標に到達しました。これはその課題の証拠であり、一般的な能力スコアではありません。',
    },
    'recommend_reason': {
        'en': 'Suggested from unresolved practice evidence, matching recent genres and scene conditions. You can skip it or choose a different goal.',
        'zh': '基于尚未解决的练习证据，并结合近期题材和场景条件推荐。你可以跳过或换目标。',
        'ja': '未解決の練習証拠と最近のジャンル、シーン条件に基づく提案です。スキップまたは別の目標に変更できます。',
    },
}


def _copy(key: str, locale: str, **values) -> str:
    template = OBSERVATION_COPY[key].get(_normalize_locale(locale)) or OBSERVATION_COPY[key]['en']
    return template.format(**values)


def _observations(rows: list[_EvidenceRow], level: str, locale: str = 'en') -> list[PracticeGuidanceObservation]:
    if level == 'records_only':
        return []
    observations: list[PracticeGuidanceObservation] = []
    by_dimension: dict[str, list[_EvidenceRow]] = defaultdict(list)
    for row in rows:
        by_dimension[row.dimension].append(row)
    for dimension, dimension_rows in sorted(by_dimension.items()):
        issue_rows = [row for row in dimension_rows if row.status in {'partial', 'not_achieved'}]
        if len(issue_rows) >= 2:
            evidence = [_evidence_payload(row) for row in issue_rows[:5]]
            observations.append(
                PracticeGuidanceObservation(
                    observation_id=f'repeated-{dimension}',
                    kind='repeated_issue',
                    title=_copy('repeated_title', locale, dimension=dimension),
                    body=_copy('repeated_body', locale),
                    dimension=dimension,
                    source_count=len(issue_rows),
                    source_attempt_ids=[item.attempt_id for item in evidence],
                    source_session_ids=[item.session_id for item in evidence],
                    scene_groups=sorted({item.scene_group for item in evidence if item.scene_group}),
                    evidence=evidence,
                )
            )
        worked_rows = [row for row in dimension_rows if row.status == 'achieved']
        if worked_rows:
            evidence = [_evidence_payload(row) for row in worked_rows[:3]]
            observations.append(
                PracticeGuidanceObservation(
                    observation_id=f'worked-{dimension}',
                    kind='worked_example',
                    title=_copy('worked_title', locale, dimension=dimension),
                    body=_copy('worked_body', locale),
                    dimension=dimension,
                    source_count=len(worked_rows),
                    source_attempt_ids=[item.attempt_id for item in evidence],
                    source_session_ids=[item.session_id for item in evidence],
                    scene_groups=sorted({item.scene_group for item in evidence if item.scene_group}),
                    evidence=evidence,
                )
            )
    return observations[:6]


def get_practice_guidance_profile(db: Session, actor: CurrentActor, *, locale: str = 'en') -> PracticeGuidanceProfileResponse:
    locale = _normalize_locale(locale)
    sessions, rows, scene_groups = _valid_evidence_rows(db, actor)
    coverage = _coverage(sessions, rows, scene_groups)
    level, reason = _level(coverage)
    missing = [session.public_id for session in sessions if session.id not in scene_groups]
    return PracticeGuidanceProfileResponse(
        level=level,  # type: ignore[arg-type]
        level_reason=reason,
        coverage=coverage,
        observations=_observations(rows, level, locale),
        recent_evidence=[_evidence_payload(row) for row in rows[:10]],
        scene_group_gaps=missing,
        templates=guidance_templates(locale),
        generated_at=datetime.now(timezone.utc),
    )


def get_practice_recommendations(db: Session, actor: CurrentActor, *, locale: str = 'en') -> PracticeRecommendationsResponse:
    locale = _normalize_locale(locale)
    profile = get_practice_guidance_profile(db, actor, locale=locale)
    recommendations: list[PracticeRecommendation] = []
    if profile.level != 'records_only':
        unresolved = [observation for observation in profile.observations if observation.kind == 'repeated_issue']
        unresolved_dimensions = [observation.dimension for observation in unresolved]
        source_evidence = unresolved[0].evidence[0] if unresolved and unresolved[0].evidence else None
        source_genres = {item.genre for item in _valid_evidence_rows(db, actor)[1] if item.genre}
        candidate_templates = [
            template for template in guidance_templates(locale)
            if (not unresolved_dimensions or template.dimension in unresolved_dimensions)
            and (not source_genres or set(template.applicable_genres) & source_genres or 'default' in template.applicable_genres)
        ]
        for template in candidate_templates[:3]:
            scene = unresolved[0].scene_groups[0] if unresolved and unresolved[0].scene_groups else None
            accept_available = bool(settings.practice_enabled)
            accept_payload = None
            if accept_available and source_evidence is not None:
                accept_payload = {
                    'source_review_id': source_evidence.source_review_id,
                    'practice_kind': 'capture_retake',
                    'goal_snapshot': {
                        'goal_version': 'goal-assessment-v1',
                        'goal': template.goal_example,
                        'dimension': template.dimension,
                    },
                    'success_criteria': [
                        {'key': criterion.key, 'label': criterion.label}
                        for criterion in template.success_criteria
                    ],
                    'locale': locale,
                    'idempotency_key': None,
                }
            recommendations.append(
                PracticeRecommendation(
                    recommendation_id=f'rec_{template.template_id}',
                    template_id=template.template_id,
                    template_version=template.version,
                    title=template.title,
                    reason=_copy('recommend_reason', locale),
                    goal_snapshot={
                        'goal_version': 'goal-assessment-v1',
                        'goal': template.goal_example,
                        'dimension': template.dimension,
                    },
                    success_criteria=[
                        PracticeSuccessCriterion(key=criterion.key, label=criterion.label)
                        for criterion in template.success_criteria
                    ],
                    suggested_scene_group=scene,
                    accept_available=accept_available,
                    accept_unavailable_reason=None if accept_available else 'practice_disabled',
                    accept_payload=accept_payload,
                )
            )
    return PracticeRecommendationsResponse(
        level=profile.level,
        recommendations=recommendations,
        templates=guidance_templates(locale),
        generated_at=datetime.now(timezone.utc),
    )


def upsert_practice_scene_group(
    db: Session,
    actor: CurrentActor,
    session_id: str,
    payload: PracticeSceneGroupRequest,
) -> PracticeSceneGroupResponse:
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.public_id == session_id, PracticeSession.owner_user_id == actor.user.id)
        .first()
    )
    if session is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'PRACTICE_SESSION_NOT_FOUND', 'Practice session not found')
    group = (
        db.query(PracticeSceneGroup)
        .filter(PracticeSceneGroup.session_id == session.id, PracticeSceneGroup.owner_user_id == actor.user.id)
        .first()
    )
    if group is None:
        group = PracticeSceneGroup(
            public_id=new_public_id('psg'),
            owner_user_id=actor.user.id,
            session_id=session.id,
            label=payload.label,
            description=payload.description,
        )
    else:
        group.label = payload.label
        group.description = payload.description
    db.add(group)
    db.flush()
    return serialize_practice_scene_group(group, session)


def serialize_practice_scene_group(group: PracticeSceneGroup, session: PracticeSession) -> PracticeSceneGroupResponse:
    return PracticeSceneGroupResponse(
        scene_group_id=group.public_id,
        session_id=session.public_id,
        label=group.label,
        description=group.description,
        visibility='private',
        updated_at=group.updated_at,
    )
