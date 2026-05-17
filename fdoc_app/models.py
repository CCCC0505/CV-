from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field, field_validator


MAX_DOCUMENT_CHARS = 50000
MAX_WORKFLOW_ROLES = 12


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


class AnalyzeRequest(BaseModel):
    document_name: str = Field(..., min_length=1, max_length=120)
    document_content: str = Field(..., min_length=1, max_length=MAX_DOCUMENT_CHARS)
    workflow: List[str] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    source_type: Literal["upload", "preset"]

    @field_validator("document_name")
    @classmethod
    def validate_document_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("document_name must not be empty")
        return cleaned

    @field_validator("document_content")
    @classmethod
    def validate_document_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("document_content must not be empty")
        return value

    @field_validator("workflow")
    @classmethod
    def validate_workflow(cls, value: List[str]) -> List[str]:
        cleaned = [_normalize_text(item) for item in value if _normalize_text(item)]
        if not cleaned:
            raise ValueError("workflow must contain at least one role")
        if len(cleaned) > MAX_WORKFLOW_ROLES:
            raise ValueError(f"workflow must contain at most {MAX_WORKFLOW_ROLES} roles")
        return cleaned


class RoleViewHints(BaseModel):
    priority_topics: List[str] = Field(default_factory=list)
    foldable_topics: List[str] = Field(default_factory=list)
    review_keywords: List[str] = Field(default_factory=list, max_length=10)
    note: str = Field(..., min_length=1, max_length=400)


class RoleAnalysis(BaseModel):
    role: str = Field(..., min_length=1, max_length=80)
    task: str = Field(..., min_length=1, max_length=1000)
    focus_points: List[str] = Field(..., min_length=1, max_length=8)
    brief_summary: str = Field(..., min_length=1, max_length=400)
    review_summary: str = Field(default="", max_length=700)
    review_checklist: List[str] = Field(default_factory=list, max_length=8)
    view_hints: RoleViewHints

    @field_validator("role", "task", "brief_summary")
    @classmethod
    def validate_text_fields(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("text fields must not be empty")
        return cleaned

    @field_validator("focus_points")
    @classmethod
    def validate_focus_points(cls, value: List[str]) -> List[str]:
        cleaned = [_normalize_text(item) for item in value if _normalize_text(item)]
        if not cleaned:
            raise ValueError("focus_points must contain at least one item")
        return cleaned


class RoleFlowStage(BaseModel):
    role: str = Field(..., min_length=1, max_length=80)
    stage_goal: str = Field(..., min_length=1, max_length=400)
    handoff_to_next: str = Field(..., min_length=1, max_length=500)
    stage_input: str = Field(default="", max_length=400)
    watch_points: List[str] = Field(default_factory=list, max_length=8)
    stage_output: str = Field(default="", max_length=400)

    @field_validator("role", "stage_goal", "handoff_to_next")
    @classmethod
    def validate_stage_fields(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("stage fields must not be empty")
        return cleaned


class RoleFlow(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    stages: List[RoleFlowStage] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)


class TaskScheduleItem(BaseModel):
    step: int = Field(..., ge=1, le=99)
    owner: str = Field(..., min_length=1, max_length=80)
    goal: str = Field(..., min_length=1, max_length=500)
    input_from: List[str] = Field(default_factory=list, max_length=MAX_WORKFLOW_ROLES)
    output: str = Field(..., min_length=1, max_length=500)
    priority: Literal["high", "medium", "low"]

    @field_validator("owner", "goal", "output")
    @classmethod
    def validate_schedule_fields(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("schedule fields must not be empty")
        return cleaned

    @field_validator("input_from")
    @classmethod
    def validate_input_from(cls, value: List[str]) -> List[str]:
        return [_normalize_text(item) for item in value if _normalize_text(item)]


class AnalyzeResponse(BaseModel):
    document_summary: str = Field(..., min_length=1, max_length=800)
    role_flow: RoleFlow
    roles: List[RoleAnalysis] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    task_schedule: List[TaskScheduleItem] = Field(..., min_length=1, max_length=48)

    @field_validator("document_summary")
    @classmethod
    def validate_summary(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("document_summary must not be empty")
        return cleaned
