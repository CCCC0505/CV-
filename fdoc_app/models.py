from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


MAX_DOCUMENT_CHARS = 5000
MAX_WORKFLOW_ROLES = 12
MAX_CHAT_MESSAGES = 16
MAX_CHAT_CONTEXTS = 8
MAX_CODE_CHARS = 5000
MAX_CODE_SELECTION_CHARS = 1600
MAX_VIZ_SOURCE_CHARS = 8000
MAX_DOC_RELATION_CANDIDATES = 10
MAX_DOC_RELATION_ITEMS = 8
MAX_FOLD_PLAN_SECTIONS = 48


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def _normalize_text_list(values: List[str]) -> List[str]:
    return [_normalize_text(item) for item in values if _normalize_text(item)]


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
        cleaned = _normalize_text_list(value)
        if not cleaned:
            raise ValueError("workflow must contain at least one role")
        if len(cleaned) > MAX_WORKFLOW_ROLES:
            raise ValueError(f"workflow must contain at most {MAX_WORKFLOW_ROLES} roles")
        return cleaned


class RoleViewHints(BaseModel):
    priority_topics: List[str] = Field(default_factory=list)
    foldable_topics: List[str] = Field(default_factory=list)
    review_keywords: List[str] = Field(default_factory=list, max_length=10)
    note: str = Field(default="", max_length=400)

    @field_validator("priority_topics", "foldable_topics", "review_keywords")
    @classmethod
    def validate_topic_lists(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)

    @field_validator("note")
    @classmethod
    def validate_note(cls, value: str) -> str:
        return value.strip()


class BaseRoleAnalysis(BaseModel):
    role: str = Field(..., min_length=1, max_length=80)
    task: str = Field(..., min_length=1, max_length=1000)
    focus_points: List[str] = Field(..., min_length=1, max_length=8)
    brief_summary: str = Field(..., min_length=1, max_length=400)

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
        cleaned = _normalize_text_list(value)
        if not cleaned:
            raise ValueError("focus_points must contain at least one item")
        return cleaned


class RoleAnalysis(BaseRoleAnalysis):
    review_summary: str = Field(default="", max_length=700)
    review_checklist: List[str] = Field(default_factory=list, max_length=8)
    view_hints: RoleViewHints = Field(default_factory=RoleViewHints)

    @field_validator("review_summary")
    @classmethod
    def validate_review_summary(cls, value: str) -> str:
        return value.strip()

    @field_validator("review_checklist")
    @classmethod
    def validate_review_checklist(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)


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

    @field_validator("stage_input", "stage_output")
    @classmethod
    def validate_optional_stage_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("watch_points")
    @classmethod
    def validate_watch_points(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)


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
        return _normalize_text_list(value)


class AnalyzeResponse(BaseModel):
    document_summary: str = Field(..., min_length=1, max_length=800)
    role_flow: RoleFlow
    roles: List[BaseRoleAnalysis] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    task_schedule: List[TaskScheduleItem] = Field(..., min_length=1, max_length=48)

    @field_validator("document_summary")
    @classmethod
    def validate_summary(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("document_summary must not be empty")
        return cleaned


class ReviewEnrichRequest(AnalyzeRequest):
    roles: List[BaseRoleAnalysis] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)

    @model_validator(mode="after")
    def validate_role_alignment(self) -> "ReviewEnrichRequest":
        if len(self.roles) != len(self.workflow):
            raise ValueError("roles must match workflow length")

        role_names = [item.role for item in self.roles]
        if role_names != self.workflow:
            raise ValueError("roles must match workflow order")
        return self


class RoleReviewEnrichment(BaseModel):
    role: str = Field(..., min_length=1, max_length=80)
    review_summary: str = Field(default="", max_length=700)
    review_checklist: List[str] = Field(default_factory=list, max_length=8)
    view_hints: RoleViewHints = Field(default_factory=RoleViewHints)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("role must not be empty")
        return cleaned

    @field_validator("review_summary")
    @classmethod
    def validate_review_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("review_checklist")
    @classmethod
    def validate_review_items(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)


class ReviewEnrichResponse(BaseModel):
    roles: List[RoleReviewEnrichment] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)


class VersionSummaryRequest(BaseModel):
    document_name: str = Field(..., min_length=1, max_length=120)
    workflow: List[str] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    previous_content: str = Field(..., min_length=1, max_length=MAX_DOCUMENT_CHARS)
    current_content: str = Field(..., min_length=1, max_length=MAX_DOCUMENT_CHARS)
    version_number: int = Field(..., ge=2, le=999)

    @field_validator("document_name")
    @classmethod
    def validate_version_document_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("document_name must not be empty")
        return cleaned

    @field_validator("workflow")
    @classmethod
    def validate_version_workflow(cls, value: List[str]) -> List[str]:
        cleaned = _normalize_text_list(value)
        if not cleaned:
            raise ValueError("workflow must contain at least one role")
        return cleaned

    @field_validator("previous_content", "current_content")
    @classmethod
    def validate_version_contents(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("version contents must not be empty")
        return value


class VersionSummaryResponse(BaseModel):
    version_number: int = Field(..., ge=2, le=999)
    change_summary: str = Field(..., min_length=1, max_length=1200)
    self_conclusion: str = Field(..., min_length=1, max_length=1600)
    decision_trace: List[str] = Field(default_factory=list, max_length=8)
    key_changes: List[str] = Field(default_factory=list, max_length=8)
    affected_roles: List[str] = Field(default_factory=list, max_length=MAX_WORKFLOW_ROLES)

    @field_validator("change_summary", "self_conclusion")
    @classmethod
    def validate_version_summary_texts(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("version summary text must not be empty")
        return cleaned

    @field_validator("decision_trace", "key_changes", "affected_roles")
    @classmethod
    def validate_version_summary_lists(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)


class ChatContextItem(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    label: str = Field(default="选中文本", max_length=80)
    text: str = Field(..., min_length=1, max_length=1200)

    @field_validator("id", "label", "text")
    @classmethod
    def validate_chat_context_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("chat context fields must not be empty")
        return cleaned


class ChatMessageItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def validate_chat_message_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("chat message content must not be empty")
        return cleaned


class ChatRequest(BaseModel):
    document_name: str = Field(..., min_length=1, max_length=120)
    document_summary: str = Field(default="", max_length=1200)
    workflow: List[str] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    role_preset: str = Field(..., min_length=1, max_length=80)
    persona_note: str = Field(default="", max_length=500)
    selected_contexts: List[ChatContextItem] = Field(default_factory=list, max_length=MAX_CHAT_CONTEXTS)
    messages: List[ChatMessageItem] = Field(default_factory=list, max_length=MAX_CHAT_MESSAGES)
    user_message: str = Field(..., min_length=1, max_length=2000)
    current_role: str = Field(default="", max_length=80)

    @field_validator("document_name", "role_preset", "persona_note", "current_role")
    @classmethod
    def validate_chat_text_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("document_summary", "user_message")
    @classmethod
    def validate_chat_body_fields(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("chat body fields must not be empty")
        return cleaned

    @field_validator("workflow")
    @classmethod
    def validate_chat_workflow(cls, value: List[str]) -> List[str]:
        cleaned = _normalize_text_list(value)
        if not cleaned:
            raise ValueError("workflow must contain at least one role")
        return cleaned


class ChatResponse(BaseModel):
    assistant_message: str = Field(..., min_length=1, max_length=3000)
    role_preset: str = Field(..., min_length=1, max_length=80)
    selected_context_count: int = Field(default=0, ge=0, le=MAX_CHAT_CONTEXTS)

    @field_validator("assistant_message", "role_preset")
    @classmethod
    def validate_chat_response_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("chat response text must not be empty")
        return cleaned


class CodeLabRequest(BaseModel):
    document_name: str = Field(..., min_length=1, max_length=120)
    document_summary: str = Field(default="", max_length=1200)
    workflow: List[str] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    current_role: str = Field(..., min_length=1, max_length=80)
    language: Literal["html", "js", "python", "c", "java"]
    code: str = Field(..., min_length=1, max_length=MAX_CODE_CHARS)
    selection_text: str = Field(default="", max_length=MAX_CODE_SELECTION_CHARS)

    @field_validator("document_name", "document_summary", "current_role", "selection_text")
    @classmethod
    def validate_code_lab_text_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("workflow")
    @classmethod
    def validate_code_lab_workflow(cls, value: List[str]) -> List[str]:
        cleaned = _normalize_text_list(value)
        if not cleaned:
            raise ValueError("workflow must contain at least one role")
        return cleaned

    @field_validator("code")
    @classmethod
    def validate_code_lab_code(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("code must not be empty")
        return value


class CodeLabResponse(BaseModel):
    language: Literal["html", "js", "python", "c", "java"]
    current_role: str = Field(..., min_length=1, max_length=80)
    runtime_mode: Literal["browser", "pseudo"]
    explanation: str = Field(..., min_length=1, max_length=1400)
    completion_suggestions: List[str] = Field(default_factory=list, max_length=8)
    run_notes: List[str] = Field(default_factory=list, max_length=8)
    pseudo_result: str = Field(..., min_length=1, max_length=2000)
    browser_preview_hint: str = Field(default="", max_length=1200)

    @field_validator("current_role", "explanation", "pseudo_result", "browser_preview_hint")
    @classmethod
    def validate_code_lab_response_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("completion_suggestions", "run_notes")
    @classmethod
    def validate_code_lab_response_lists(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)


class VizAssistRequest(BaseModel):
    document_name: str = Field(..., min_length=1, max_length=120)
    document_summary: str = Field(default="", max_length=1200)
    workflow: List[str] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    current_role: str = Field(..., min_length=1, max_length=80)
    data_source_name: str = Field(default="", max_length=120)
    data_source_content: str = Field(default="", max_length=MAX_VIZ_SOURCE_CHARS)
    source_type: Literal["upload", "preset"] = "preset"

    @field_validator("document_name", "document_summary", "current_role", "data_source_name")
    @classmethod
    def validate_viz_text_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("workflow")
    @classmethod
    def validate_viz_workflow(cls, value: List[str]) -> List[str]:
        cleaned = _normalize_text_list(value)
        if not cleaned:
            raise ValueError("workflow must contain at least one role")
        return cleaned

    @field_validator("data_source_content")
    @classmethod
    def validate_viz_data_source_content(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_viz_source(self) -> "VizAssistRequest":
        if self.source_type == "upload" and not self.data_source_content.strip():
            raise ValueError("uploaded data source must not be empty")
        return self


class VizAssistResponse(BaseModel):
    chart_title: str = Field(..., min_length=1, max_length=120)
    summary: str = Field(..., min_length=1, max_length=1200)
    preferred_chart_type: Literal["table", "bar", "line", "pie"]
    table_headers: List[str] = Field(default_factory=list, max_length=8)
    table_rows: List[List[str]] = Field(default_factory=list, max_length=12)
    field_notes: List[str] = Field(default_factory=list, max_length=8)
    chart_suggestions: List[str] = Field(default_factory=list, max_length=8)
    source_note: str = Field(default="", max_length=500)
    placeholder_notice: str = Field(default="", max_length=400)
    data_status: Literal["linked", "preset"]

    @field_validator("chart_title", "summary", "source_note", "placeholder_notice")
    @classmethod
    def validate_viz_text_response(cls, value: str) -> str:
        return value.strip()

    @field_validator("table_headers", "field_notes", "chart_suggestions")
    @classmethod
    def validate_viz_text_lists(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)

    @field_validator("table_rows")
    @classmethod
    def validate_viz_rows(cls, value: List[List[str]]) -> List[List[str]]:
        cleaned_rows: List[List[str]] = []
        for row in value:
            if not isinstance(row, list):
                continue
            cleaned_row = _normalize_text_list([str(item) for item in row])
            if cleaned_row:
                cleaned_rows.append(cleaned_row)
        return cleaned_rows


class DocRelationCandidate(BaseModel):
    document_id: str = Field(..., min_length=1, max_length=64)
    document_name: str = Field(..., min_length=1, max_length=120)
    summary: str = Field(default="", max_length=600)
    source_type: Literal["current_session", "preset", "uploaded"] = "preset"

    @field_validator("document_id", "document_name", "summary")
    @classmethod
    def validate_relation_candidate_text(cls, value: str) -> str:
        return value.strip()


class DocRelationsRequest(BaseModel):
    document_name: str = Field(..., min_length=1, max_length=120)
    document_summary: str = Field(default="", max_length=1200)
    workflow: List[str] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    current_role: str = Field(..., min_length=1, max_length=80)
    candidates: List[DocRelationCandidate] = Field(default_factory=list, max_length=MAX_DOC_RELATION_CANDIDATES)

    @field_validator("document_name", "document_summary", "current_role")
    @classmethod
    def validate_relation_request_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("workflow")
    @classmethod
    def validate_relation_request_workflow(cls, value: List[str]) -> List[str]:
        cleaned = _normalize_text_list(value)
        if not cleaned:
            raise ValueError("workflow must contain at least one role")
        return cleaned

    @model_validator(mode="after")
    def validate_relation_candidates(self) -> "DocRelationsRequest":
        if not self.candidates:
            raise ValueError("candidates must not be empty")
        return self


class DocRelationItem(BaseModel):
    document_id: str = Field(default="", max_length=64)
    document_name: str = Field(..., min_length=1, max_length=120)
    relation_type: str = Field(..., min_length=1, max_length=80)
    relation_description: str = Field(..., min_length=1, max_length=600)
    relation_reason: str = Field(..., min_length=1, max_length=600)
    confidence: Literal["high", "medium", "low"] = "medium"

    @field_validator("document_id", "document_name", "relation_type", "relation_description", "relation_reason")
    @classmethod
    def validate_relation_item_text(cls, value: str) -> str:
        return value.strip()


class DocRelationsResponse(BaseModel):
    overview: str = Field(..., min_length=1, max_length=1200)
    relations: List[DocRelationItem] = Field(..., min_length=1, max_length=MAX_DOC_RELATION_ITEMS)
    editable_note: str = Field(default="", max_length=500)

    @field_validator("overview", "editable_note")
    @classmethod
    def validate_relation_response_text(cls, value: str) -> str:
        return value.strip()


class FoldPlanSectionInput(BaseModel):
    index: int = Field(..., ge=0, le=99)
    heading: str = Field(..., min_length=1, max_length=120)
    content: str = Field(..., min_length=1, max_length=1600)

    @field_validator("heading")
    @classmethod
    def validate_fold_section_heading(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("heading must not be empty")
        return cleaned

    @field_validator("content")
    @classmethod
    def validate_fold_section_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be empty")
        return value


class FoldPlanRequest(BaseModel):
    document_name: str = Field(..., min_length=1, max_length=120)
    document_content: str = Field(..., min_length=1, max_length=MAX_DOCUMENT_CHARS)
    workflow: List[str] = Field(..., min_length=1, max_length=MAX_WORKFLOW_ROLES)
    current_role: str = Field(..., min_length=1, max_length=80)
    role_task: str = Field(default="", max_length=1000)
    role_summary: str = Field(default="", max_length=700)
    focus_points: List[str] = Field(default_factory=list, max_length=8)
    priority_topics: List[str] = Field(default_factory=list, max_length=8)
    foldable_topics: List[str] = Field(default_factory=list, max_length=8)
    review_keywords: List[str] = Field(default_factory=list, max_length=10)
    watch_points: List[str] = Field(default_factory=list, max_length=8)
    stage_goal: str = Field(default="", max_length=400)
    sections: List[FoldPlanSectionInput] = Field(..., min_length=1, max_length=MAX_FOLD_PLAN_SECTIONS)

    @field_validator("document_name", "current_role", "role_task", "role_summary", "stage_goal")
    @classmethod
    def validate_fold_plan_text_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("document_content")
    @classmethod
    def validate_fold_plan_document_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("document_content must not be empty")
        return value

    @field_validator("workflow")
    @classmethod
    def validate_fold_plan_workflow(cls, value: List[str]) -> List[str]:
        cleaned = _normalize_text_list(value)
        if not cleaned:
            raise ValueError("workflow must contain at least one role")
        return cleaned

    @field_validator("focus_points", "priority_topics", "foldable_topics", "review_keywords", "watch_points")
    @classmethod
    def validate_fold_plan_topic_lists(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)


class FoldPlanSectionResult(BaseModel):
    index: int = Field(..., ge=0, le=99)
    heading: str = Field(..., min_length=1, max_length=120)
    relevance: Literal["high", "medium", "low"]
    should_fold: bool = False
    highlight: bool = False
    reason: str = Field(..., min_length=1, max_length=240)
    matched_topics: List[str] = Field(default_factory=list, max_length=6)
    preview_quote: str = Field(default="", max_length=180)

    @field_validator("heading", "reason", "preview_quote")
    @classmethod
    def validate_fold_plan_result_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("matched_topics")
    @classmethod
    def validate_fold_plan_matched_topics(cls, value: List[str]) -> List[str]:
        return _normalize_text_list(value)


class FoldPlanResponse(BaseModel):
    role: str = Field(..., min_length=1, max_length=80)
    note: str = Field(default="", max_length=400)
    sections: List[FoldPlanSectionResult] = Field(..., min_length=1, max_length=MAX_FOLD_PLAN_SECTIONS)

    @field_validator("role", "note")
    @classmethod
    def validate_fold_plan_response_text(cls, value: str) -> str:
        return value.strip()
