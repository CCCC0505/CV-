from __future__ import annotations

import json
from typing import List

from pydantic import ValidationError

from fdoc_app.models import ReviewEnrichRequest, ReviewEnrichResponse
from fdoc_app.services.qwen import AnalysisServiceError, DashScopeClient


class QwenReviewEnricher:
    def __init__(self) -> None:
        self.client = DashScopeClient()
        self.settings = self.client.settings

    def enrich(self, payload: ReviewEnrichRequest) -> ReviewEnrichResponse:
        self.client.ensure_configured()

        raw_content = self.client.post_json_completion(
            [
                {"role": "system", "content": self._build_system_prompt(payload.workflow)},
                {"role": "user", "content": self._build_user_prompt(payload)},
            ],
            temperature=0.1,
        )

        try:
            parsed = self._normalize_review_payload(self.client.parse_json_content(raw_content), payload.workflow)
            response = ReviewEnrichResponse.model_validate(parsed)
            self._ensure_alignment(response, payload.workflow)
            return response
        except (json.JSONDecodeError, ValidationError, AnalysisServiceError):
            repaired = self._normalize_review_payload(
                self.client.repair_json(raw_content, payload.workflow, self._review_schema_hint()),
                payload.workflow,
            )
            try:
                response = ReviewEnrichResponse.model_validate(repaired)
                self._ensure_alignment(response, payload.workflow)
                return response
            except (ValidationError, AnalysisServiceError) as exc:
                raise AnalysisServiceError(
                    "角色审阅数据结构无法自动修复，请稍后重试。",
                    code="invalid_review_payload",
                    status_code=502,
                    details={"error": str(exc)},
                ) from exc

    def _normalize_review_payload(self, payload: dict, workflow: List[str]) -> dict:
        raw_roles = payload.get("roles")
        role_map = {}
        role_list = raw_roles if isinstance(raw_roles, list) else []
        for item in role_list:
            if not isinstance(item, dict):
                continue
            role = self._safe_text(item.get("role"))
            if role:
                role_map[role.strip().lower()] = item

        normalized_roles = []
        for role in workflow:
            raw_role = role_map.get(role.strip().lower(), {})
            view_hints = raw_role.get("view_hints") if isinstance(raw_role.get("view_hints"), dict) else {}
            normalized_roles.append(
                {
                    "role": role,
                    "review_summary": self._safe_text(
                        raw_role.get("review_summary"),
                        fallback=f"{role} 可基于当前文档开展角色审阅，并关注本环节的关键信息。",
                    ),
                    "review_checklist": self._safe_list(
                        raw_role.get("review_checklist"),
                        fallback=[f"检查 {role} 所需的输入、输出和风险点"],
                    ),
                    "view_hints": {
                        "priority_topics": self._safe_list(view_hints.get("priority_topics")),
                        "foldable_topics": self._safe_list(view_hints.get("foldable_topics")),
                        "review_keywords": self._safe_list(view_hints.get("review_keywords")),
                        "note": self._safe_text(
                            view_hints.get("note"),
                            fallback="仅用于视图层折叠与高亮提示，不会修改或删除原文。",
                        ),
                    },
                }
            )

        return {"roles": normalized_roles}

    def _safe_text(self, value, fallback: str = "") -> str:
        if value is None:
            return fallback
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return "；".join(cleaned) if cleaned else fallback
        text = str(value).strip()
        return text or fallback

    def _safe_list(self, value, fallback=None) -> List[str]:
        default_items = list(fallback or [])
        if value is None:
            return default_items
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return cleaned or default_items
        text = str(value).strip()
        if not text:
            return default_items
        return [text]

    def _ensure_alignment(self, response: ReviewEnrichResponse, workflow: List[str]) -> None:
        if len(response.roles) != len(workflow):
            raise AnalysisServiceError(
                "AI 返回的角色审阅数量与工作流不一致。",
                code="invalid_review_roles_length",
                status_code=502,
            )

        response_roles = [item.role.strip() for item in response.roles]
        if response_roles != workflow:
            raise AnalysisServiceError(
                "AI 返回的角色审阅顺序与工作流不一致。",
                code="review_workflow_mismatch",
                status_code=502,
                details={"workflow": workflow, "roles": response_roles},
            )

    def _review_schema_hint(self) -> str:
        return (
            "{roles:[{role, review_summary, review_checklist, view_hints:{priority_topics, "
            "foldable_topics, review_keywords, note}}]}"
        )

    def _build_system_prompt(self, workflow: List[str]) -> str:
        return (
            "你是 FDoc 的角色审阅增强助手。"
            "只输出合法 JSON，不要 markdown，不要解释。"
            f" roles 的 role 必须严格按这个顺序输出：{json.dumps(workflow, ensure_ascii=False)}。"
            " 当前任务只生成角色审阅摘要、清单和视图提示，内容要短。"
        )

    def _build_user_prompt(self, payload: ReviewEnrichRequest) -> str:
        base_roles = [
            {
                "role": item.role,
                "task": item.task,
                "focus_points": item.focus_points,
                "brief_summary": item.brief_summary,
            }
            for item in payload.roles
        ]
        return (
            "返回固定 JSON，字段只有 roles。\n"
            "每个 roles 项只包含 role、review_summary、review_checklist、view_hints。\n"
            "view_hints 只包含 priority_topics、foldable_topics、review_keywords、note。\n"
            "要求：\n"
            "1. review_summary 每个角色 1 到 2 句话。\n"
            "2. review_checklist 每个角色 3 到 5 条。\n"
            "3. priority_topics、foldable_topics、review_keywords 尽量短。\n"
            "4. note 说明这些提示只用于视图层折叠，不改变原文。\n"
            "5. 所有角色顺序必须与工作流一致。\n\n"
            f"工作流：{json.dumps(payload.workflow, ensure_ascii=False)}\n"
            f"基础角色分析：{json.dumps(base_roles, ensure_ascii=False)}\n"
            "文档正文：\n"
            f"{payload.document_content}"
        )
