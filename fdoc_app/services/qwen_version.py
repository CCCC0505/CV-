from __future__ import annotations

import json
from difflib import unified_diff
from typing import Any, Dict, List

from pydantic import ValidationError

from fdoc_app.models import VersionSummaryRequest, VersionSummaryResponse
from fdoc_app.services.qwen import AnalysisServiceError, DashScopeClient


class QwenVersionSummarizer:
    def __init__(self) -> None:
        self.client = DashScopeClient()
        self.settings = self.client.settings

    def summarize_version(self, payload: VersionSummaryRequest) -> VersionSummaryResponse:
        self.client.ensure_configured()

        raw_content = self.client.post_json_completion(
            [
                {"role": "system", "content": self._build_system_prompt(payload.workflow)},
                {"role": "user", "content": self._build_user_prompt(payload)},
            ],
            temperature=0.1,
        )

        try:
            parsed = self._normalize_version_payload(self.client.parse_json_content(raw_content), payload)
            return VersionSummaryResponse.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError):
            repaired = self._normalize_version_payload(
                self.client.repair_json(raw_content, payload.workflow, self._version_schema_hint()),
                payload,
            )
            try:
                return VersionSummaryResponse.model_validate(repaired)
            except ValidationError as exc:
                raise AnalysisServiceError(
                    "版本时间轴总结数据无法自动修复，请稍后重试。",
                    code="invalid_version_summary_payload",
                    status_code=502,
                    details={"error": str(exc)},
                ) from exc

    def _build_system_prompt(self, workflow: List[str]) -> str:
        return (
            "你是 FDoc 的版本总结助手。"
            "只输出合法 JSON，不要 markdown，不要解释。"
            f" affected_roles 只能从这些岗位中选择：{json.dumps(workflow, ensure_ascii=False)}。"
            " 目标是服务决策溯源，简洁总结这次修改了什么、为什么改、改完得到什么结论。"
        )

    def _build_user_prompt(self, payload: VersionSummaryRequest) -> str:
        diff_text = self._build_diff(payload.previous_content, payload.current_content)
        return (
            "返回固定 JSON，字段只有：version_number、change_summary、self_conclusion、decision_trace、key_changes、affected_roles。\n"
            "要求：\n"
            "1. change_summary 总结本次修改内容，1到3句话。\n"
            "2. self_conclusion 是文档在本次修改后自动形成的阶段性结论，1到3句话。\n"
            "3. decision_trace 为 3 到 5 条，说明这次修改的决策依据或演进路径。\n"
            "4. key_changes 为 3 到 6 条，聚焦实质变化。\n"
            "5. affected_roles 只填受影响岗位。\n"
            "6. 所有内容围绕版本变更与决策溯源，不要重复原文。\n\n"
            f"文档名称：{payload.document_name}\n"
            f"版本号：V{payload.version_number}\n"
            f"工作流：{json.dumps(payload.workflow, ensure_ascii=False)}\n"
            "变更前正文：\n"
            f"{payload.previous_content}\n\n"
            "变更后正文：\n"
            f"{payload.current_content}\n\n"
            "结构化 diff：\n"
            f"{diff_text}"
        )

    def _version_schema_hint(self) -> str:
        return (
            "{version_number, change_summary, self_conclusion, decision_trace:[...], "
            "key_changes:[...], affected_roles:[...]}"
        )

    def _normalize_version_payload(self, payload: Dict[str, Any], request_payload: VersionSummaryRequest) -> Dict[str, Any]:
        return {
            "version_number": self._safe_int(payload.get("version_number"), request_payload.version_number),
            "change_summary": self._safe_text(
                payload.get("change_summary"),
                fallback=f"V{request_payload.version_number} 已记录本次文档修改，并形成新的版本摘要。",
            ),
            "self_conclusion": self._safe_text(
                payload.get("self_conclusion"),
                fallback="本次修改已更新当前文档结论，可继续基于新版本推进后续决策与协作。",
            ),
            "decision_trace": self._safe_list(
                payload.get("decision_trace"),
                fallback=["记录本次修改的背景、变化点和形成结论的依据"],
            ),
            "key_changes": self._safe_list(
                payload.get("key_changes"),
                fallback=["文档正文已发生结构或内容调整"],
            ),
            "affected_roles": self._safe_roles(payload.get("affected_roles"), request_payload.workflow),
        }

    def _safe_text(self, value: Any, fallback: str = "") -> str:
        if value is None:
            return fallback
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return "；".join(cleaned) if cleaned else fallback
        text = str(value).strip()
        return text or fallback

    def _safe_list(self, value: Any, fallback: List[str]) -> List[str]:
        if value is None:
            return list(fallback)
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return cleaned or list(fallback)
        text = str(value).strip()
        if not text:
            return list(fallback)
        return [text]

    def _safe_roles(self, value: Any, workflow: List[str]) -> List[str]:
        if value is None:
            return workflow[: min(2, len(workflow))]
        items = value if isinstance(value, list) else [value]
        normalized = []
        workflow_lookup = {role.strip().lower(): role for role in workflow}
        for item in items:
            key = str(item).strip().lower()
            if key in workflow_lookup and workflow_lookup[key] not in normalized:
                normalized.append(workflow_lookup[key])
        return normalized or workflow[: min(2, len(workflow))]

    def _safe_int(self, value: Any, fallback: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return fallback
        return parsed if parsed > 0 else fallback

    def _build_diff(self, previous_content: str, current_content: str) -> str:
        diff_lines = list(
            unified_diff(
                previous_content.splitlines(),
                current_content.splitlines(),
                fromfile="previous",
                tofile="current",
                lineterm="",
                n=1,
            )
        )
        if not diff_lines:
            return "No textual diff detected."
        limited = diff_lines[:220]
        return "\n".join(limited)
