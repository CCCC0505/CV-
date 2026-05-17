from __future__ import annotations

import csv
import io
import json
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from fdoc_app.models import VizAssistRequest, VizAssistResponse
from fdoc_app.services.qwen import AnalysisServiceError, DashScopeClient


class QwenVizService:
    def __init__(self) -> None:
        self.client = DashScopeClient()

    def assist(self, payload: VizAssistRequest) -> VizAssistResponse:
        try:
            self.client.ensure_configured()
            return self._assist_with_model(payload)
        except (AnalysisServiceError, json.JSONDecodeError, ValidationError):
            return VizAssistResponse.model_validate(self._build_fallback_payload(payload))

    def _assist_with_model(self, payload: VizAssistRequest) -> VizAssistResponse:
        raw_content = self.client.post_json_completion(
            [
                {"role": "system", "content": self._build_system_prompt()},
                {"role": "user", "content": self._build_user_prompt(payload)},
            ],
            temperature=0.2,
        )

        try:
            parsed = self._normalize_payload(self.client.parse_json_content(raw_content), payload)
            return VizAssistResponse.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError):
            repaired = self._normalize_payload(
                self.client.repair_json(raw_content, payload.workflow, self._schema_hint()),
                payload,
            )
            return VizAssistResponse.model_validate(repaired)

    def _build_system_prompt(self) -> str:
        return "You are FDoc data-viz assistant. Return pure JSON only. Keep it compact."

    def _build_user_prompt(self, payload: VizAssistRequest) -> str:
        source_excerpt = payload.data_source_content.strip()[:3200]
        return (
            "Return JSON with keys: chart_title, summary, preferred_chart_type, table_headers, table_rows, "
            "field_notes, chart_suggestions, source_note, placeholder_notice, data_status.\n"
            "If source_type is preset, keep placeholder_notice visible.\n\n"
            f"document_name: {payload.document_name}\n"
            f"current_role: {payload.current_role}\n"
            f"workflow: {json.dumps(payload.workflow, ensure_ascii=False)}\n"
            f"document_summary: {payload.document_summary}\n"
            f"source_type: {payload.source_type}\n"
            f"data_source_name: {payload.data_source_name}\n"
            f"data_source_content:\n{source_excerpt}"
        )

    def _schema_hint(self) -> str:
        return (
            "{chart_title,summary,preferred_chart_type,table_headers:[...],table_rows:[[...]],"
            "field_notes:[...],chart_suggestions:[...],source_note,placeholder_notice,data_status}"
        )

    def _normalize_payload(self, payload: Dict[str, Any], request_payload: VizAssistRequest) -> Dict[str, Any]:
        preferred_chart_type = self._safe_text(payload.get("preferred_chart_type"), fallback="table").lower()
        if preferred_chart_type not in {"table", "bar", "line", "pie"}:
            preferred_chart_type = "table"

        table_headers = self._safe_list(payload.get("table_headers"), fallback=[])
        table_rows = self._safe_rows(payload.get("table_rows"), fallback=[])
        if not table_headers or not table_rows:
            fallback_headers, fallback_rows = self._build_local_table(request_payload)
            if not table_headers:
                table_headers = fallback_headers
            if not table_rows:
                table_rows = fallback_rows

        data_status = self._safe_text(payload.get("data_status"), fallback=request_payload.source_type)
        if data_status not in {"linked", "preset"}:
            data_status = "linked" if request_payload.source_type == "upload" else "preset"

        return {
            "chart_title": self._safe_text(payload.get("chart_title"), fallback=self._fallback_title(request_payload)),
            "summary": self._safe_text(payload.get("summary"), fallback=self._fallback_summary(request_payload)),
            "preferred_chart_type": preferred_chart_type,
            "table_headers": table_headers,
            "table_rows": table_rows,
            "field_notes": self._safe_list(payload.get("field_notes"), fallback=self._fallback_field_notes(request_payload)),
            "chart_suggestions": self._safe_list(
                payload.get("chart_suggestions"),
                fallback=self._fallback_chart_suggestions(request_payload),
            ),
            "source_note": self._safe_text(payload.get("source_note"), fallback=self._fallback_source_note(request_payload)),
            "placeholder_notice": self._safe_text(
                payload.get("placeholder_notice"),
                fallback=self._fallback_placeholder_notice(request_payload),
            ),
            "data_status": data_status,
        }

    def _build_fallback_payload(self, payload: VizAssistRequest) -> Dict[str, Any]:
        headers, rows = self._build_local_table(payload)
        return {
            "chart_title": self._fallback_title(payload),
            "summary": self._fallback_summary(payload),
            "preferred_chart_type": "table" if payload.source_type == "preset" else self._guess_chart_type(headers),
            "table_headers": headers,
            "table_rows": rows,
            "field_notes": self._fallback_field_notes(payload),
            "chart_suggestions": self._fallback_chart_suggestions(payload),
            "source_note": self._fallback_source_note(payload),
            "placeholder_notice": self._fallback_placeholder_notice(payload),
            "data_status": "linked" if payload.source_type == "upload" else "preset",
        }

    def _build_local_table(self, payload: VizAssistRequest) -> tuple[List[str], List[List[str]]]:
        text = (payload.data_source_content or "").strip()
        if not text:
            return (
                ["指标", "说明", "状态"],
                [["当前未链接数据源", "采取预置数据显示", "ready"]],
            )

        parsed = self._parse_rows(text)
        if parsed:
            headers = parsed[0]
            rows = parsed[1:6]
            if len(headers) == 1 and rows and len(rows[0]) > 1:
                headers = [f"列{index + 1}" for index in range(len(rows[0]))]
            return headers[:8], [row[:8] for row in rows[:12]]

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return (
            ["内容", "说明"],
            [[line[:48], "数据源片段"] for line in lines[:5]],
        )

    def _parse_rows(self, text: str) -> List[List[str]]:
        stripped = text.strip()
        delimiter = self._detect_delimiter(stripped)
        if not delimiter:
            return []

        reader = csv.reader(io.StringIO(stripped), delimiter=delimiter)
        rows = []
        for row in reader:
            cleaned = [cell.strip() for cell in row if cell.strip()]
            if cleaned:
                rows.append(cleaned)
        return rows

    def _detect_delimiter(self, text: str) -> Optional[str]:
        first_line = next((line for line in text.splitlines() if line.strip()), "")
        if "," in first_line:
            return ","
        if "\t" in first_line:
            return "\t"
        if "|" in first_line:
            return "|"
        return None

    def _guess_chart_type(self, headers: List[str]) -> str:
        tokens = " ".join(headers).lower()
        if any(keyword in tokens for keyword in ["date", "time", "trend", "变化", "趋势"]):
            return "line"
        if any(keyword in tokens for keyword in ["rate", "ratio", "share", "占比"]):
            return "pie"
        return "bar"

    def _fallback_title(self, payload: VizAssistRequest) -> str:
        return f"{payload.current_role} 数据可视化建议"

    def _fallback_summary(self, payload: VizAssistRequest) -> str:
        if payload.source_type == "upload":
            return "已链接数据源，可先按表格预览，再根据字段补成图表。"
        return "当前未链接数据源，采取预置数据显示，便于快速审阅。"

    def _fallback_field_notes(self, payload: VizAssistRequest) -> List[str]:
        return ["先确认维度字段", "再检查数值字段", "保留当前预置显示"]

    def _fallback_chart_suggestions(self, payload: VizAssistRequest) -> List[str]:
        return ["表格预览", "分组柱状图", "趋势折线图"]

    def _fallback_source_note(self, payload: VizAssistRequest) -> str:
        if payload.source_type == "upload":
            return f"数据源来自 {payload.data_source_name or '上传文件'}"
        return "当前使用预置数据源"

    def _fallback_placeholder_notice(self, payload: VizAssistRequest) -> str:
        if payload.source_type == "upload":
            return ""
        return "当前未链接数据源，采取预置数据显示"

    def _safe_text(self, value: Any, fallback: str = "") -> str:
        if value is None:
            return fallback
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return "、".join(cleaned) if cleaned else fallback
        text = str(value).strip()
        return text or fallback

    def _safe_list(self, value: Any, fallback: List[str]) -> List[str]:
        if value is None:
            return list(fallback)
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return cleaned or list(fallback)
        text = str(value).strip()
        return [text] if text else list(fallback)

    def _safe_rows(self, value: Any, fallback: List[List[str]]) -> List[List[str]]:
        if not isinstance(value, list):
            return list(fallback)
        rows: List[List[str]] = []
        for row in value:
            if not isinstance(row, list):
                continue
            cleaned = [str(item).strip() for item in row if str(item).strip()]
            if cleaned:
                rows.append(cleaned)
        return rows or list(fallback)
