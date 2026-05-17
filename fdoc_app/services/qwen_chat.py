from __future__ import annotations

import json
from typing import Any, Dict, List

from pydantic import ValidationError

from fdoc_app.models import ChatRequest, ChatResponse
from fdoc_app.services.qwen import AnalysisServiceError, DashScopeClient


CHAT_ROLE_PRESETS: Dict[str, Dict[str, str]] = {
    "专业产品经理": {
        "title": "专业产品经理",
        "style": "站在需求、边界、优先级和验收标准角度回答，输出要能直接支持决策。",
    },
    "专业投资人": {
        "title": "专业投资人",
        "style": "站在商业价值、风险、增长和回报角度回答，输出要简洁而判断明确。",
    },
    "专业工程师": {
        "title": "专业工程师",
        "style": "站在实现方案、系统约束、接口与稳定性角度回答，输出要可落地。",
    },
    "专业数据分析师": {
        "title": "专业数据分析师",
        "style": "站在指标、归因、实验设计和数据可信度角度回答，输出要有结构。",
    },
}


class QwenChatService:
    def __init__(self) -> None:
        self.client = DashScopeClient()
        self.settings = self.client.settings

    def chat(self, payload: ChatRequest) -> ChatResponse:
        self.client.ensure_configured()

        raw_content = self.client.post_json_completion(
            [
                {"role": "system", "content": self._build_system_prompt(payload)},
                {"role": "user", "content": self._build_user_prompt(payload)},
            ],
            temperature=0.4,
        )

        try:
            parsed = self._normalize_chat_payload(self.client.parse_json_content(raw_content), payload)
            return ChatResponse.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError):
            repaired = self._normalize_chat_payload(
                self.client.repair_json(raw_content, payload.workflow, self._schema_hint()),
                payload,
            )
            try:
                return ChatResponse.model_validate(repaired)
            except ValidationError as exc:
                raise AnalysisServiceError(
                    "聊天回复结构无法自动修复，请稍后重试。",
                    code="invalid_chat_payload",
                    status_code=502,
                    details={"error": str(exc)},
                ) from exc

    def _build_system_prompt(self, payload: ChatRequest) -> str:
        preset = CHAT_ROLE_PRESETS.get(payload.role_preset, {})
        style = preset.get("style") or "请以清晰、专业、直接的方式回答。"
        return (
            "你是 FDoc 的侧边栏 AI 对话助手。"
            "只输出合法 JSON，不要 markdown，不要解释。"
            " 你的回答必须结合用户选中的文本和当前文档上下文。"
            f" 当前角色设定：{payload.role_preset}。{style}"
            " 如果用户提供了多个上下文片段，要优先引用选中文本内容。"
            " 对话内容要简洁、可执行、面向文档协作。"
        )

    def _build_user_prompt(self, payload: ChatRequest) -> str:
        contexts = [
            {"id": item.id, "label": item.label, "text": item.text}
            for item in payload.selected_contexts
        ]
        messages = [
            {"role": item.role, "content": item.content}
            for item in payload.messages[-6:]
        ]
        return (
            "返回固定 JSON，字段只有 assistant_message 和 role_preset。\n"
            "要求：\n"
            "1. assistant_message 直接给出对用户问题的专业回复。\n"
            "2. 回答时优先使用已选中的文本片段。\n"
            "3. 如果信息不足，明确指出缺口并给出下一步建议。\n"
            "4. 不要输出 markdown 代码块。\n"
            "5. role_preset 原样返回。\n\n"
            f"文档名称：{payload.document_name}\n"
            f"当前角色：{payload.current_role}\n"
            f"工作流：{json.dumps(payload.workflow, ensure_ascii=False)}\n"
            f"文档摘要：{payload.document_summary}\n"
            f"角色设定：{payload.role_preset}\n"
            f"角色提示：{payload.persona_note}\n"
            f"选中文本：{json.dumps(contexts, ensure_ascii=False)}\n"
            f"历史对话：{json.dumps(messages, ensure_ascii=False)}\n"
            f"用户本次提问：{payload.user_message}"
        )

    def _normalize_chat_payload(self, payload: Dict[str, Any], request_payload: ChatRequest) -> Dict[str, Any]:
        assistant_message = payload.get("assistant_message")
        if isinstance(assistant_message, list):
            assistant_message = "；".join(str(item).strip() for item in assistant_message if str(item).strip())

        return {
            "assistant_message": self._safe_text(
                assistant_message,
                fallback="我已经看过你选中的内容，建议你再补充一下目标、限制条件或希望我重点分析的方面。",
            ),
            "role_preset": self._safe_text(payload.get("role_preset"), fallback=request_payload.role_preset),
            "selected_context_count": len(request_payload.selected_contexts),
        }

    def _safe_text(self, value: Any, fallback: str = "") -> str:
        if value is None:
            return fallback
        text = str(value).strip()
        return text or fallback

    def _schema_hint(self) -> str:
        return "{assistant_message, role_preset}"
