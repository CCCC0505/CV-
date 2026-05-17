from __future__ import annotations

import json
from typing import Any, Dict, List

from pydantic import ValidationError

from fdoc_app.models import DocRelationsRequest, DocRelationsResponse
from fdoc_app.services.qwen import AnalysisServiceError, DashScopeClient


class QwenDocRelationService:
    def __init__(self) -> None:
        self.client = DashScopeClient()

    def recommend(self, payload: DocRelationsRequest) -> DocRelationsResponse:
        try:
            self.client.ensure_configured()
            return self._recommend_with_model(payload)
        except (AnalysisServiceError, json.JSONDecodeError, ValidationError):
            return DocRelationsResponse.model_validate(self._build_fallback_payload(payload))

    def _recommend_with_model(self, payload: DocRelationsRequest) -> DocRelationsResponse:
        raw_content = self.client.post_json_completion(
            [
                {"role": "system", "content": self._build_system_prompt()},
                {"role": "user", "content": self._build_user_prompt(payload)},
            ],
            temperature=0.2,
        )

        try:
            parsed = self._normalize_payload(self.client.parse_json_content(raw_content), payload)
            return DocRelationsResponse.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError):
            repaired = self._normalize_payload(
                self.client.repair_json(raw_content, payload.workflow, self._schema_hint()),
                payload,
            )
            return DocRelationsResponse.model_validate(repaired)

    def _build_system_prompt(self) -> str:
        return "You are FDoc document-relations assistant. Return pure JSON only. Keep it concise."

    def _build_user_prompt(self, payload: DocRelationsRequest) -> str:
        candidates = [
            {
                "document_id": item.document_id,
                "document_name": item.document_name,
                "summary": item.summary,
                "source_type": item.source_type,
            }
            for item in payload.candidates[:8]
        ]
        return (
            "Return JSON with keys: overview, relations, editable_note.\n"
            "Each relation item needs document_id, document_name, relation_type, relation_description, "
            "relation_reason, confidence.\n"
            "Use the provided candidates only. Keep relations short and editable.\n\n"
            f"document_name: {payload.document_name}\n"
            f"current_role: {payload.current_role}\n"
            f"workflow: {json.dumps(payload.workflow, ensure_ascii=False)}\n"
            f"document_summary: {payload.document_summary}\n"
            f"candidates: {json.dumps(candidates, ensure_ascii=False)}"
        )

    def _schema_hint(self) -> str:
        return (
            "{overview,relations:[{document_id,document_name,relation_type,relation_description,"
            "relation_reason,confidence}],editable_note}"
        )

    def _normalize_payload(self, payload: Dict[str, Any], request_payload: DocRelationsRequest) -> Dict[str, Any]:
        relations = self._safe_relations(payload.get("relations"), request_payload)
        if not relations:
            relations = self._fallback_relations(request_payload)

        return {
            "overview": self._safe_text(payload.get("overview"), fallback=self._fallback_overview(request_payload)),
            "relations": relations[:8],
            "editable_note": self._safe_text(
                payload.get("editable_note"),
                fallback="可在前端编辑后确认保存，关系只影响视图层。",
            ),
        }

    def _build_fallback_payload(self, payload: DocRelationsRequest) -> Dict[str, Any]:
        return {
            "overview": self._fallback_overview(payload),
            "relations": self._fallback_relations(payload)[:8],
            "editable_note": "可在前端编辑后确认保存，关系只影响视图层。",
        }

    def _fallback_overview(self, payload: DocRelationsRequest) -> str:
        return f"{payload.current_role} 视角下，优先梳理当前文档与上下游资料的关联。"

    def _fallback_relations(self, payload: DocRelationsRequest) -> List[Dict[str, Any]]:
        relations: List[Dict[str, Any]] = []
        for candidate in payload.candidates[:5]:
            if self._same_doc(candidate.document_name, payload.document_name):
                continue
            relation_type, confidence = self._pick_relation_type(payload.document_name, candidate.document_name, candidate.summary)
            relations.append(
                {
                    "document_id": candidate.document_id,
                    "document_name": candidate.document_name,
                    "relation_type": relation_type,
                    "relation_description": self._relation_description(candidate.document_name, relation_type),
                    "relation_reason": self._relation_reason(candidate.summary, payload.document_summary),
                    "confidence": confidence,
                }
            )
        if not relations and payload.candidates:
            candidate = payload.candidates[0]
            relations.append(
                {
                    "document_id": candidate.document_id,
                    "document_name": candidate.document_name,
                    "relation_type": "参考关联",
                    "relation_description": "作为当前文档的参考资料",
                    "relation_reason": "候选文档可补充背景与上下文。",
                    "confidence": "medium",
                }
            )
        return relations

    def _safe_relations(self, value: Any, request_payload: DocRelationsRequest) -> List[Dict[str, Any]]:
        if not isinstance(value, list):
            return []
        valid_ids = {item.document_id for item in request_payload.candidates}
        valid_names = {item.document_name for item in request_payload.candidates}
        relations: List[Dict[str, Any]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            document_id = self._safe_text(item.get("document_id"))
            document_name = self._safe_text(item.get("document_name"))
            if valid_ids and document_id and document_id not in valid_ids:
                continue
            if valid_names and document_name and document_name not in valid_names:
                continue
            relation_type = self._safe_text(item.get("relation_type"), fallback="参考关联")
            relation_description = self._safe_text(item.get("relation_description"), fallback="可在前端编辑补充。")
            relation_reason = self._safe_text(item.get("relation_reason"), fallback="来自 AI 推荐。")
            confidence = self._safe_text(item.get("confidence"), fallback="medium").lower()
            if confidence not in {"high", "medium", "low"}:
                confidence = "medium"
            relations.append(
                {
                    "document_id": document_id,
                    "document_name": document_name or "未命名文档",
                    "relation_type": relation_type,
                    "relation_description": relation_description,
                    "relation_reason": relation_reason,
                    "confidence": confidence,
                }
            )
        return relations

    def _pick_relation_type(self, document_name: str, candidate_name: str, summary: str) -> tuple[str, str]:
        text = f"{document_name} {candidate_name} {summary}".lower()
        if any(keyword in text for keyword in ["需求", "prd", "requirement"]):
            return "需求参考", "high"
        if any(keyword in text for keyword in ["技术", "方案", "design", "架构"]):
            return "实现依赖", "high"
        if any(keyword in text for keyword in ["数据", "指标", "分析", "review"]):
            return "数据关联", "medium"
        if any(keyword in text for keyword in ["复盘", "总结", "结论", "result"]):
            return "复盘引用", "medium"
        return "上下游关联", "medium"

    def _relation_description(self, candidate_name: str, relation_type: str) -> str:
        return f"{candidate_name} 与当前文档存在{relation_type}。"

    def _relation_reason(self, candidate_summary: str, document_summary: str) -> str:
        combined = " ".join(part for part in [candidate_summary, document_summary] if part)
        if not combined:
            return "候选文档与当前文档在主题上存在关联。"
        return combined[:180]

    def _same_doc(self, left: str, right: str) -> bool:
        return left.strip().lower() == right.strip().lower()

    def _safe_text(self, value: Any, fallback: str = "") -> str:
        if value is None:
            return fallback
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return "、".join(cleaned) if cleaned else fallback
        text = str(value).strip()
        return text or fallback
