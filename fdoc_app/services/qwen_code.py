from __future__ import annotations

import json
from typing import Any, Dict, List

from pydantic import ValidationError

from fdoc_app.models import CodeLabRequest, CodeLabResponse
from fdoc_app.services.qwen import AnalysisServiceError, DashScopeClient


class QwenCodeLabService:
    def __init__(self) -> None:
        self.client = DashScopeClient()

    def assist(self, payload: CodeLabRequest) -> CodeLabResponse:
        try:
            self.client.ensure_configured()
            return self._assist_with_model(payload)
        except (AnalysisServiceError, json.JSONDecodeError, ValidationError):
            return CodeLabResponse.model_validate(self._build_fallback_payload(payload))

    def _assist_with_model(self, payload: CodeLabRequest) -> CodeLabResponse:
        raw_content = self.client.post_json_completion(
            [
                {"role": "system", "content": self._build_system_prompt()},
                {"role": "user", "content": self._build_user_prompt(payload)},
            ],
            temperature=0.15,
        )

        try:
            parsed = self._normalize_payload(self.client.parse_json_content(raw_content), payload)
            return CodeLabResponse.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError):
            repaired = self._normalize_payload(
                self.client.repair_json(raw_content, payload.workflow, self._schema_hint()),
                payload,
            )
            return CodeLabResponse.model_validate(repaired)

    def _build_system_prompt(self) -> str:
        return "You are FDoc code-lab assistant. Return pure JSON only. Be concise and practical."

    def _build_user_prompt(self, payload: CodeLabRequest) -> str:
        selection = payload.selection_text.strip()[:600]
        code_excerpt = payload.code.strip()[:2400]
        return (
            "Return JSON with keys: language, current_role, runtime_mode, explanation, completion_suggestions, "
            "run_notes, pseudo_result, browser_preview_hint.\n"
            "Rules: html/js => runtime_mode browser; python/c/java => pseudo.\n"
            "Keep suggestions short and useful.\n\n"
            f"document_name: {payload.document_name}\n"
            f"current_role: {payload.current_role}\n"
            f"workflow: {json.dumps(payload.workflow, ensure_ascii=False)}\n"
            f"document_summary: {payload.document_summary}\n"
            f"language: {payload.language}\n"
            f"selection_text: {selection}\n"
            f"code:\n{code_excerpt}"
        )

    def _schema_hint(self) -> str:
        return (
            "{language,current_role,runtime_mode,explanation,completion_suggestions:[...],"
            "run_notes:[...],pseudo_result,browser_preview_hint}"
        )

    def _normalize_payload(self, payload: Dict[str, Any], request_payload: CodeLabRequest) -> Dict[str, Any]:
        runtime_mode = self._safe_text(payload.get("runtime_mode"), fallback=self._default_runtime_mode(request_payload.language))
        if runtime_mode not in {"browser", "pseudo"}:
            runtime_mode = self._default_runtime_mode(request_payload.language)

        return {
            "language": self._safe_text(payload.get("language"), fallback=request_payload.language),
            "current_role": self._safe_text(payload.get("current_role"), fallback=request_payload.current_role),
            "runtime_mode": runtime_mode,
            "explanation": self._safe_text(
                payload.get("explanation"),
                fallback=self._fallback_explanation(request_payload),
            ),
            "completion_suggestions": self._safe_list(
                payload.get("completion_suggestions"),
                fallback=self._fallback_suggestions(request_payload),
            ),
            "run_notes": self._safe_list(
                payload.get("run_notes"),
                fallback=self._fallback_run_notes(request_payload),
            ),
            "pseudo_result": self._safe_text(
                payload.get("pseudo_result"),
                fallback=self._fallback_pseudo_result(request_payload),
            ),
            "browser_preview_hint": self._safe_text(
                payload.get("browser_preview_hint"),
                fallback=self._fallback_preview_hint(request_payload),
            ),
        }

    def _build_fallback_payload(self, payload: CodeLabRequest) -> Dict[str, Any]:
        return {
            "language": payload.language,
            "current_role": payload.current_role,
            "runtime_mode": self._default_runtime_mode(payload.language),
            "explanation": self._fallback_explanation(payload),
            "completion_suggestions": self._fallback_suggestions(payload),
            "run_notes": self._fallback_run_notes(payload),
            "pseudo_result": self._fallback_pseudo_result(payload),
            "browser_preview_hint": self._fallback_preview_hint(payload),
        }

    def _default_runtime_mode(self, language: str) -> str:
        return "browser" if language in {"html", "js"} else "pseudo"

    def _fallback_explanation(self, payload: CodeLabRequest) -> str:
        role_note = f" 面向{payload.current_role}视角。" if payload.current_role else ""
        return f"当前{payload.language.upper()}代码建议先补齐主流程与异常处理，{role_note.strip()}"

    def _fallback_suggestions(self, payload: CodeLabRequest) -> List[str]:
        if payload.language in {"html", "js"}:
            return ["先确保入口节点可渲染", "把交互逻辑拆成独立函数", "补上错误提示和空状态"]
        if payload.language == "python":
            return ["先定义输入输出", "把核心逻辑拆成函数", "补齐边界条件"]
        return ["先确认编译入口", "补齐关键变量定义", "把流程拆成更小步骤"]

    def _fallback_run_notes(self, payload: CodeLabRequest) -> List[str]:
        if payload.language in {"html", "js"}:
            return ["浏览器沙箱已准备", "点击运行后在右侧预览", "保留页面原文不变"]
        return ["当前仅做解释和伪运行", "不会执行系统级命令", "结果用于审阅与补全"]

    def _fallback_pseudo_result(self, payload: CodeLabRequest) -> str:
        snippet = (payload.selection_text or payload.code).strip().splitlines()[:3]
        preview = " / ".join(line.strip() for line in snippet if line.strip())[:180]
        if payload.language in {"html", "js"}:
            return f"浏览器预览已生成，重点检查页面结构、事件绑定和渲染结果。{preview}"
        return f"伪运行结果：建议先检查输入、核心逻辑和输出分支。{preview}"

    def _fallback_preview_hint(self, payload: CodeLabRequest) -> str:
        if payload.language in {"html", "js"}:
            return "HTML/JS 会在浏览器沙箱中实际运行，右侧预览区显示实时结果。"
        return "当前语言仅输出解释与伪运行结果，不做系统级真执行。"

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
