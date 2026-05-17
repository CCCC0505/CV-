from __future__ import annotations

import json
from typing import Any, Dict, List

from pydantic import ValidationError

from fdoc_app.models import FoldPlanRequest, FoldPlanResponse
from fdoc_app.services.qwen import AnalysisServiceError, DashScopeClient


class QwenFoldPlanner:
    def __init__(self) -> None:
        self.client = DashScopeClient()

    def plan(self, payload: FoldPlanRequest) -> FoldPlanResponse:
        try:
            self.client.ensure_configured()
            return self._plan_with_model(payload)
        except (AnalysisServiceError, json.JSONDecodeError, ValidationError):
            return FoldPlanResponse.model_validate(self._build_fallback_payload(payload))

    def _plan_with_model(self, payload: FoldPlanRequest) -> FoldPlanResponse:
        raw_content = self.client.post_json_completion(
            [
                {"role": "system", "content": self._build_system_prompt(payload.current_role)},
                {"role": "user", "content": self._build_user_prompt(payload)},
            ],
            temperature=0.1,
        )

        try:
            parsed = self._normalize_payload(self.client.parse_json_content(raw_content), payload)
            return FoldPlanResponse.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError):
            repaired = self._normalize_payload(
                self.client.repair_json(raw_content, payload.workflow, self._schema_hint()),
                payload,
            )
            return FoldPlanResponse.model_validate(repaired)

    def _build_system_prompt(self, role: str) -> str:
        return (
            "你是 FDoc 的角色视角折叠规划助手。"
            "只输出合法 JSON，不要 markdown，不要解释。"
            f"当前目标角色是：{role}。"
            "你只决定哪些段落对该角色应高亮、保留或折叠，不能修改原文。"
        )

    def _build_user_prompt(self, payload: FoldPlanRequest) -> str:
        sections = [
            {
                "index": item.index,
                "heading": item.heading,
                "content": item.content[:700],
            }
            for item in payload.sections[:48]
        ]
        return (
            "返回固定 JSON，字段只有 role、note、sections。\n"
            "sections 中每项只包含 index、heading、relevance、should_fold、highlight、reason、matched_topics、preview_quote。\n"
            "要求：\n"
            "1. sections 数量和 index 必须与输入完全一致。\n"
            "2. relevance 只能是 high、medium、low。\n"
            "3. 对当前角色高度相关的段落 should_fold=false 且 highlight=true。\n"
            "4. 与当前角色弱相关但仍可参考的段落 should_fold=false。\n"
            "5. 明显无关的段落 should_fold=true。\n"
            "6. note 必须强调：只影响视图折叠，不改变原文。\n"
            "7. reason 要具体，说明该段为什么和当前角色相关或无关。\n\n"
            f"document_name: {payload.document_name}\n"
            f"workflow: {json.dumps(payload.workflow, ensure_ascii=False)}\n"
            f"current_role: {payload.current_role}\n"
            f"role_task: {payload.role_task}\n"
            f"role_summary: {payload.role_summary}\n"
            f"focus_points: {json.dumps(payload.focus_points, ensure_ascii=False)}\n"
            f"priority_topics: {json.dumps(payload.priority_topics, ensure_ascii=False)}\n"
            f"foldable_topics: {json.dumps(payload.foldable_topics, ensure_ascii=False)}\n"
            f"review_keywords: {json.dumps(payload.review_keywords, ensure_ascii=False)}\n"
            f"watch_points: {json.dumps(payload.watch_points, ensure_ascii=False)}\n"
            f"stage_goal: {payload.stage_goal}\n"
            f"sections: {json.dumps(sections, ensure_ascii=False)}"
        )

    def _schema_hint(self) -> str:
        return (
            "{role,note,sections:[{index,heading,relevance,should_fold,highlight,reason,"
            "matched_topics,preview_quote}]}"
        )

    def _normalize_payload(self, payload: Dict[str, Any], request_payload: FoldPlanRequest) -> Dict[str, Any]:
        raw_sections = payload.get("sections")
        section_map: Dict[int, Dict[str, Any]] = {}
        if isinstance(raw_sections, list):
            for item in raw_sections:
                if not isinstance(item, dict):
                    continue
                try:
                    index = int(item.get("index"))
                except (TypeError, ValueError):
                    continue
                section_map[index] = item

        sections: List[Dict[str, Any]] = []
        for section in request_payload.sections:
            raw_item = section_map.get(section.index, {})
            normalized = self._normalize_section(raw_item, section, request_payload)
            sections.append(normalized)

        return {
            "role": request_payload.current_role,
            "note": self._safe_text(
                payload.get("note"),
                fallback="只影响当前角色视图中的折叠与高亮，不会修改、删减或覆盖原文。",
            ),
            "sections": sections,
        }

    def _normalize_section(
        self,
        raw_item: Dict[str, Any],
        section: Any,
        request_payload: FoldPlanRequest,
    ) -> Dict[str, Any]:
        content = f"{section.heading}\n{section.content}".lower()
        priority_topics = [item.lower() for item in request_payload.priority_topics]
        review_keywords = [item.lower() for item in request_payload.review_keywords]
        focus_points = [item.lower() for item in request_payload.focus_points]
        watch_points = [item.lower() for item in request_payload.watch_points]
        foldable_topics = [item.lower() for item in request_payload.foldable_topics]
        all_relevant = [item for item in [*priority_topics, *review_keywords, *focus_points, *watch_points] if item]
        matched_topics = [topic for topic in all_relevant if topic in content][:6]
        matched_foldables = [topic for topic in foldable_topics if topic and topic in content]

        raw_relevance = self._safe_text(raw_item.get("relevance"), fallback="")
        if raw_relevance not in {"high", "medium", "low"}:
            if matched_topics:
                relevance = "high" if len(matched_topics) >= 2 else "medium"
            elif matched_foldables:
                relevance = "low"
            elif section.index == 0:
                relevance = "medium"
            else:
                relevance = "low"
        else:
            relevance = raw_relevance

        should_fold = raw_item.get("should_fold")
        if not isinstance(should_fold, bool):
            should_fold = relevance == "low" and not matched_topics

        highlight = raw_item.get("highlight")
        if not isinstance(highlight, bool):
            highlight = relevance == "high"

        if matched_topics:
            fallback_reason = f"该段直接涉及 {request_payload.current_role} 需要优先查看的主题。"
        elif matched_foldables:
            fallback_reason = f"该段更偏向其他岗位关注内容，当前角色可先折叠后续再看。"
        else:
            fallback_reason = f"该段与 {request_payload.current_role} 的直接关联度较弱。"

        preview_quote = self._safe_text(raw_item.get("preview_quote"), fallback="")
        if not preview_quote:
            preview_quote = section.content.strip().replace("\n", " ")[:120]

        return {
            "index": section.index,
            "heading": section.heading,
            "relevance": relevance,
            "should_fold": should_fold,
            "highlight": highlight,
            "reason": self._safe_text(raw_item.get("reason"), fallback=fallback_reason),
            "matched_topics": self._safe_list(raw_item.get("matched_topics"), fallback=matched_topics),
            "preview_quote": preview_quote,
        }

    def _build_fallback_payload(self, payload: FoldPlanRequest) -> Dict[str, Any]:
        return {
            "role": payload.current_role,
            "note": "只影响当前角色视图中的折叠与高亮，不会修改、删减或覆盖原文。",
            "sections": [
                self._normalize_section({}, section, payload)
                for section in payload.sections
            ],
        }

    def _safe_text(self, value: Any, fallback: str = "") -> str:
        if value is None:
            return fallback
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return "、".join(cleaned) if cleaned else fallback
        text = str(value).strip()
        return text or fallback

    def _safe_list(self, value: Any, fallback: List[str] | None = None) -> List[str]:
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
