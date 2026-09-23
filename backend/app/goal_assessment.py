from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


GOAL_ASSESSMENT_VERSION = 'goal-assessment-v1'
GoalAssessmentStatus = Literal['achieved', 'partial', 'not_achieved', 'indeterminate']
PracticeKind = Literal['capture_retake', 'edit_revision', 'same_image_recheck']

_GENERIC_EVIDENCE = {
    'better',
    'improved',
    'looks better',
    'the photo is better',
    'good improvement',
    'nice improvement',
    'clearer',
    'stronger',
    'more professional',
    '目标已完成',
    '有进步',
    '改善了',
    '良くなった',
}


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class GoalAssessmentContext(_StrictModel):
    goal_version: str = Field(default=GOAL_ASSESSMENT_VERSION, min_length=1, max_length=64)
    goal: str = Field(min_length=3, max_length=500)
    success_criteria: list[str] = Field(min_length=1, max_length=5)
    practice_kind: PracticeKind = 'capture_retake'

    @field_validator('goal', mode='before')
    @classmethod
    def _normalize_goal(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError('goal must be a string')
        return ' '.join(value.split())

    @field_validator('success_criteria', mode='before')
    @classmethod
    def _normalize_success_criteria(cls, value: object) -> list[str]:
        if not isinstance(value, list):
            raise ValueError('success_criteria must be a list')
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                raise ValueError('success_criteria entries must be strings')
            criterion = ' '.join(item.split())
            if len(criterion) < 3 or len(criterion) > 300:
                raise ValueError('success_criteria entries must be 3 to 300 characters')
            dedupe_key = criterion.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            normalized.append(criterion)
        if not normalized:
            raise ValueError('success_criteria must include at least one observable criterion')
        if len(normalized) > 5:
            raise ValueError('success_criteria supports at most 5 entries')
        return normalized

    @model_validator(mode='after')
    def _validate_practice_kind(self):
        if self.practice_kind == 'same_image_recheck':
            raise ValueError('same_image_recheck does not produce a goal assessment')
        return self


class GoalAssessmentEvidence(_StrictModel):
    success_criterion: str = Field(min_length=3, max_length=300)
    before_observation: str = Field(min_length=12, max_length=500)
    after_observation: str = Field(min_length=12, max_length=500)
    conclusion: str = Field(min_length=12, max_length=500)

    @field_validator('success_criterion', 'before_observation', 'after_observation', 'conclusion', mode='before')
    @classmethod
    def _normalize_text(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError('goal evidence fields must be strings')
        return ' '.join(value.split())

    @field_validator('before_observation', 'after_observation', 'conclusion')
    @classmethod
    def _reject_generic_evidence(cls, value: str) -> str:
        if value.strip().lower() in _GENERIC_EVIDENCE:
            raise ValueError('goal evidence must cite visible before/after observations')
        return value


class GoalAssessment(_StrictModel):
    goal_version: str = Field(default=GOAL_ASSESSMENT_VERSION, min_length=1, max_length=64)
    status: GoalAssessmentStatus
    evidence: list[GoalAssessmentEvidence] = Field(default_factory=list, max_length=5)
    limitations: list[str] = Field(default_factory=list, max_length=5)
    next_action: str = Field(min_length=3, max_length=500)

    @field_validator('limitations', mode='before')
    @classmethod
    def _normalize_limitations(cls, value: object) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError('limitations must be a list')
        normalized: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError('limitations entries must be strings')
            text = ' '.join(item.split())
            if text:
                if len(text) > 300:
                    raise ValueError('limitations entries must be at most 300 characters')
                normalized.append(text)
        if len(normalized) > 5:
            raise ValueError('limitations supports at most 5 entries')
        return normalized

    @field_validator('next_action', mode='before')
    @classmethod
    def _normalize_next_action(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError('next_action must be a string')
        return ' '.join(value.split())

    @model_validator(mode='after')
    def _validate_status_evidence(self):
        if self.status in {'achieved', 'partial', 'not_achieved'} and not self.evidence:
            raise ValueError('goal assessment status requires visible evidence')
        if self.status == 'indeterminate' and not self.limitations:
            raise ValueError('indeterminate goal assessment requires limitations')
        return self


def validate_goal_assessment_for_context(
    assessment: GoalAssessment,
    context: GoalAssessmentContext,
) -> GoalAssessment:
    if assessment.goal_version != context.goal_version:
        raise ValueError('goal assessment version does not match trusted goal context')

    allowed_criteria = {criterion.lower() for criterion in context.success_criteria}
    if assessment.status != 'indeterminate':
        evidence_criteria = {item.success_criterion.lower() for item in assessment.evidence}
        for item in assessment.evidence:
            if item.success_criterion.lower() not in allowed_criteria:
                raise ValueError('goal assessment evidence must reference a trusted success criterion')
        if assessment.status == 'achieved' and evidence_criteria != allowed_criteria:
            raise ValueError('achieved goal assessment must cover every trusted success criterion')
    return assessment


def indeterminate_goal_assessment(
    context: GoalAssessmentContext,
    *,
    limitation: str,
    next_action: str,
) -> GoalAssessment:
    return GoalAssessment(
        goal_version=context.goal_version,
        status='indeterminate',
        evidence=[],
        limitations=[limitation],
        next_action=next_action,
    )
