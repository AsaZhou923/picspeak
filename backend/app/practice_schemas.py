from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


PracticeKind = str


class PracticeConfigResponse(BaseModel):
    practice_enabled: bool


class PracticeAttemptSummary(BaseModel):
    attempt_id: str
    task_id: str | None = None
    review_id: str | None = None
    review_access: str = 'available'
    task_status: str | None = None
    progress: int | None = None
    error: dict[str, Any] | None = None
    sequence: int
    photo_id: str | None = None
    kind: str
    created_at: datetime


class PracticeContext(BaseModel):
    session_id: str
    attempt_id: str | None = None
    kind: str
    lifecycle: str
    source_review_id: str | None = None
    source_photo_id: str | None = None
    source_access: str = 'available'
    continue_available: bool = False
    sequence: int | None = None


class PracticeGoalSnapshot(BaseModel):
    model_config = ConfigDict(extra='forbid')

    goal_version: Literal['goal-assessment-v1'] = 'goal-assessment-v1'
    goal: str = Field(min_length=3, max_length=500)
    dimension: str = Field(pattern='^(composition|lighting|color|impact|technical)$')

    @field_validator('goal', mode='before')
    @classmethod
    def normalize_goal(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError('goal must be a string')
        return ' '.join(value.split())


class PracticeSuccessCriterion(BaseModel):
    model_config = ConfigDict(extra='forbid')

    key: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=3, max_length=300)

    @field_validator('label', mode='before')
    @classmethod
    def normalize_label(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError('label must be a string')
        return ' '.join(value.split())


class PracticeSessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    source_review_id: str
    practice_kind: str = Field(pattern='^(capture_retake|edit_revision|same_image_recheck)$')
    goal_snapshot: PracticeGoalSnapshot
    success_criteria: list[PracticeSuccessCriterion] = Field(min_length=1, max_length=5)
    locale: str = Field(default='en', pattern='^(zh|en|ja)$')
    idempotency_key: str | None = None


class PracticeSessionPatchRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    lifecycle: str = Field(pattern='^(active|completed|archived)$')


class PracticeSessionResponse(BaseModel):
    session_id: str
    source_review_id: str | None = None
    source_photo_id: str | None = None
    source_access: str = 'available'
    practice_kind: str
    lifecycle: str
    goal_snapshot: PracticeGoalSnapshot
    success_criteria: list[PracticeSuccessCriterion] = Field(default_factory=list)
    locale: str
    attempts: list[PracticeAttemptSummary] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PracticeJournalSourceSummary(BaseModel):
    access: str = 'available'
    review_id: str | None = None
    photo_id: str | None = None
    genre: str | None = None


class PracticeJournalLatestAttempt(BaseModel):
    attempt_id: str | None = None
    task_id: str | None = None
    review_id: str | None = None
    review_access: str = 'none'
    assessment_status: str = 'unknown'
    created_at: datetime | None = None


class PracticeJournalSessionItem(BaseModel):
    session_id: str
    lifecycle: str
    practice_kind: str
    goal: str
    dimension: str
    scene_group: str | None = None
    source: PracticeJournalSourceSummary
    attempt_count: int
    latest_assessment_status: str
    latest_assessment_date: datetime
    continuation_id: str | None = None
    continue_available: bool = False
    latest_attempt: PracticeJournalLatestAttempt | None = None
    created_at: datetime
    updated_at: datetime


class PracticeJournalListResponse(BaseModel):
    items: list[PracticeJournalSessionItem] = Field(default_factory=list)
    next_cursor: str | None = None
    limit: int


class PracticeJournalTimeframe(BaseModel):
    start_at: datetime | None = None
    end_at: datetime | None = None


class PracticeJournalSummaryResponse(BaseModel):
    scope: Literal['all_practice'] = 'all_practice'
    timeframe: PracticeJournalTimeframe
    session_count: int
    attempt_count: int
    sample_count: int
    status_counts: dict[str, int]
    unknown_count: int
    indeterminate_count: int
    failed_count: int


class PracticeFeedbackRequest(BaseModel):
    verdict: str = Field(pattern='^(helpful|not_helpful|incorrect)$')
    reason: str | None = Field(default=None, max_length=1000)


class PracticeFeedbackResponse(BaseModel):
    feedback_id: str
    verdict: str
    reason: str | None = None
    created_at: datetime


class PracticeSceneGroupRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    label: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)

    @field_validator('label', mode='before')
    @classmethod
    def normalize_label(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError('label must be a string')
        return ' '.join(value.split())

    @field_validator('description', mode='before')
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError('description must be a string')
        normalized = ' '.join(value.split())
        return normalized or None


class PracticeSceneGroupResponse(BaseModel):
    scene_group_id: str
    session_id: str
    label: str
    description: str | None = None
    visibility: Literal['private'] = 'private'
    updated_at: datetime


class PracticeGuidanceCoverage(BaseModel):
    valid_session_count: int
    valid_attempt_count: int
    scene_group_count: int
    goal_count: int
    untagged_session_count: int
    capture_retake_count: int
    edit_revision_count: int
    same_image_recheck_count: int


class PracticeGuidanceEvidence(BaseModel):
    session_id: str
    attempt_id: str
    review_id: str
    source_review_id: str
    scene_group: str | None = None
    goal: str
    dimension: str
    status: Literal['achieved', 'partial', 'not_achieved']
    practice_kind: str
    created_at: datetime


class PracticeGuidanceObservation(BaseModel):
    observation_id: str
    kind: Literal['repeated_issue', 'worked_example', 'pending_goal']
    title: str
    body: str
    dimension: str
    source_count: int
    source_attempt_ids: list[str]
    source_session_ids: list[str]
    scene_groups: list[str]
    evidence: list[PracticeGuidanceEvidence]


class PracticeTemplateCriterion(BaseModel):
    key: str
    label: str


class PracticeGuidanceTemplate(BaseModel):
    template_id: str
    version: str
    dimension: str
    title: str
    applicable_genres: list[str]
    scene_conditions: list[str]
    goal_example: str
    success_criteria: list[PracticeTemplateCriterion]
    counterexamples: list[str]
    transfer_task: str
    human_review_status: Literal['draft_pending_review', 'owner_confirmed_summary'] = 'draft_pending_review'


class PracticeRecommendation(BaseModel):
    recommendation_id: str
    template_id: str
    template_version: str
    title: str
    reason: str
    goal_snapshot: PracticeGoalSnapshot
    success_criteria: list[PracticeSuccessCriterion]
    suggested_scene_group: str | None = None
    skip_available: bool = True
    change_goal_available: bool = True
    accept_available: bool
    accept_unavailable_reason: str | None = None
    accept_payload: PracticeSessionCreateRequest | None = None


class PracticeGuidanceProfileResponse(BaseModel):
    scope: Literal['owner_practice_guidance'] = 'owner_practice_guidance'
    level: Literal['records_only', 'preliminary_observations', 'practice_summary']
    level_reason: str
    coverage: PracticeGuidanceCoverage
    observations: list[PracticeGuidanceObservation] = Field(default_factory=list)
    recent_evidence: list[PracticeGuidanceEvidence] = Field(default_factory=list)
    scene_group_gaps: list[str] = Field(default_factory=list)
    templates: list[PracticeGuidanceTemplate] = Field(default_factory=list)
    generated_at: datetime


class PracticeRecommendationsResponse(BaseModel):
    scope: Literal['owner_practice_recommendations'] = 'owner_practice_recommendations'
    level: Literal['records_only', 'preliminary_observations', 'practice_summary']
    recommendations: list[PracticeRecommendation] = Field(default_factory=list)
    templates: list[PracticeGuidanceTemplate] = Field(default_factory=list)
    generated_at: datetime
