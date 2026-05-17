from __future__ import annotations

import json
import os
import re
import socket
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib import error, request

from pydantic import ValidationError

from fdoc_app.models import AnalyzeRequest, AnalyzeResponse


DEFAULT_DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
DEFAULT_QWEN_MODEL = "qwen-plus"


class AnalysisServiceError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str,
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


@dataclass
class QwenSettings:
    api_key: Optional[str]
    model: str
    endpoint: str
    timeout_seconds: int


class QwenAnalyzer:
    def __init__(self) -> None:
        self.settings = QwenSettings(
            api_key=os.getenv("DASHSCOPE_API_KEY"),
            model=os.getenv("QWEN_MODEL", DEFAULT_QWEN_MODEL),
            endpoint=os.getenv("DASHSCOPE_ENDPOINT", DEFAULT_DASHSCOPE_URL),
            timeout_seconds=max(5, int(os.getenv("DASHSCOPE_TIMEOUT_SECONDS", "60"))),
        )

    def analyze(self, payload: AnalyzeRequest) -> AnalyzeResponse:
        if not self.settings.api_key:
            raise AnalysisServiceError(
                "后端未配置 DASHSCOPE_API_KEY，暂时无法调用千问分析。",
                code="missing_api_key",
                status_code=503,
            )

        raw_content = self._call_analysis_model(payload)
        parsed = self._parse_content(raw_content)

        try:
            response = AnalyzeResponse.model_validate(parsed)
            self._ensure_alignment(response, payload.workflow)
            return response
        except (json.JSONDecodeError, ValidationError, AnalysisServiceError):
            repaired = self._repair_json(raw_content, payload.workflow)
            response = AnalyzeResponse.model_validate(repaired)
            self._ensure_alignment(response, payload.workflow)
            return response

    def _call_analysis_model(self, payload: AnalyzeRequest) -> str:
        messages = [
            {
                "role": "system",
                "content": self._build_system_prompt(payload.workflow),
            },
            {
                "role": "user",
                "content": self._build_user_prompt(payload),
            },
        ]
        response = self._post_chat_completion(
            {
                "model": self.settings.model,
                "messages": messages,
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            }
        )
        return self._extract_message_content(response)

    def _repair_json(self, broken_content: str, workflow: List[str]) -> Dict[str, Any]:
        try:
            return json.loads(self._extract_json_text(broken_content))
        except json.JSONDecodeError:
            pass

        repair_messages = [
            {
                "role": "system",
                "content": (
                    "你是一个 JSON 修复助手。请把用户提供的分析结果修复成合法 JSON，"
                    "不要补充解释，不要输出 Markdown 代码块。JSON 中 role_flow.stages 和 roles "
                    "必须严格按这个工作流顺序输出："
                    f"{json.dumps(workflow, ensure_ascii=False)}。"
                ),
            },
            {
                "role": "user",
                "content": (
                    "请修复下面这段 JSON，使其成为合法 JSON 字符串，并保留原有语义。\n"
                    f"{broken_content}"
                ),
            },
        ]
        repaired = self._post_chat_completion(
            {
                "model": self.settings.model,
                "messages": repair_messages,
                "response_format": {"type": "json_object"},
                "temperature": 0,
            }
        )
        repaired_content = self._extract_message_content(repaired)
        return json.loads(self._extract_json_text(repaired_content))

    def _post_chat_completion(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            self.settings.endpoint,
            data=body,
            headers={
                "Authorization": "Bearer {}".format(self.settings.api_key),
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.settings.timeout_seconds) as resp:
                response_bytes = resp.read()
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise AnalysisServiceError(
                "千问分析请求失败。",
                code="dashscope_http_error",
                status_code=502,
                details={"status": exc.code, "response": detail},
            ) from exc
        except error.URLError as exc:
            raise AnalysisServiceError(
                "无法连接到千问接口，请检查网络或 DASHSCOPE_ENDPOINT 配置。",
                code="dashscope_connection_error",
                status_code=502,
                details={"reason": str(exc.reason)},
            ) from exc
        except (TimeoutError, socket.timeout) as exc:
            raise AnalysisServiceError(
                "千问接口响应超时，请稍后重试，或缩短文档内容后再次分析。",
                code="dashscope_timeout",
                status_code=504,
                details={"timeout_seconds": self.settings.timeout_seconds},
            ) from exc

        try:
            return json.loads(response_bytes.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise AnalysisServiceError(
                "千问接口返回了无法解析的响应。",
                code="dashscope_invalid_response",
                status_code=502,
            ) from exc

    def _extract_message_content(self, response: Dict[str, Any]) -> str:
        try:
            content = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AnalysisServiceError(
                "千问响应中缺少 choices[0].message.content。",
                code="dashscope_missing_content",
                status_code=502,
                details={"response": response},
            ) from exc

        if isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
            content = "".join(text_parts)

        if not isinstance(content, str) or not content.strip():
            raise AnalysisServiceError(
                "千问响应内容为空。",
                code="dashscope_empty_content",
                status_code=502,
            )

        return content

    def _parse_content(self, content: str) -> Dict[str, Any]:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return json.loads(self._extract_json_text(content))

    def _extract_json_text(self, text: str) -> str:
        candidate = text.strip()
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s*```$", "", candidate)

        if candidate.startswith("{") and candidate.endswith("}"):
            return candidate

        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            return candidate[start : end + 1]

        raise json.JSONDecodeError("No JSON object found", text, 0)

    def _ensure_alignment(self, response: AnalyzeResponse, workflow: List[str]) -> None:
        if len(response.role_flow.stages) != len(workflow):
            raise AnalysisServiceError(
                "AI 返回的岗位流转图节点数量与工作流不一致。",
                code="invalid_role_flow_length",
                status_code=502,
            )
        if len(response.roles) != len(workflow):
            raise AnalysisServiceError(
                "AI 返回的岗位说明数量与工作流不一致。",
                code="invalid_roles_length",
                status_code=502,
            )

        stage_roles = [item.role.strip() for item in response.role_flow.stages]
        response_roles = [item.role.strip() for item in response.roles]
        if stage_roles != workflow or response_roles != workflow:
            raise AnalysisServiceError(
                "AI 返回的岗位顺序与用户选择的工作流不一致。",
                code="workflow_mismatch",
                status_code=502,
                details={
                    "workflow": workflow,
                    "role_flow_roles": stage_roles,
                    "roles": response_roles,
                },
            )

        invalid_owners = [
            item.owner for item in response.task_schedule if item.owner.strip() not in workflow
        ]
        if invalid_owners:
            raise AnalysisServiceError(
                "AI 返回的任务安排中出现了工作流之外的岗位。",
                code="task_schedule_owner_mismatch",
                status_code=502,
                details={"owners": invalid_owners, "workflow": workflow},
            )

    def _build_system_prompt(self, workflow: List[str]) -> str:
        workflow_json = json.dumps(workflow, ensure_ascii=False)
        return (
            "你是 FDoc 的岗位流转分析助手。请阅读文档并输出一个 JSON 对象。"
            "输出必须是纯 JSON，不要使用 Markdown 代码块，不要添加解释文字。"
            "JSON 的 role_flow.stages 和 roles 数组长度必须与工作流完全一致，"
            "并且 role 字段必须严格等于这个工作流数组中的对应元素："
            "{}。".format(workflow_json)
            + "task_schedule 的 owner 只能从该工作流中选择。"
            + "你需要让 role_flow 更适合前端渲染为岗位流转图或表格。"
            + "当前版本会做角色审阅视图，所以请为每个岗位返回 review_summary、review_checklist，"
            + "并在 view_hints 中补充 review_keywords。"
            + "原文不能被改写，view_hints 和 review 字段只用于视图层提示。"
        )

    def _build_user_prompt(self, payload: AnalyzeRequest) -> str:
        schema = {
            "document_summary": "一句到两句的文档整体摘要",
            "role_flow": {
                "title": "岗位流转图",
                "stages": [
                    {
                        "role": payload.workflow[0],
                        "stage_goal": "该岗位在本环节的一句话目标",
                        "stage_input": "该岗位进入当前环节时最主要的输入",
                        "watch_points": ["该岗位当前环节最该注意的点"],
                        "stage_output": "该岗位完成本环节后输出的交付物",
                        "handoff_to_next": "该岗位要向下一岗位交接什么内容",
                    }
                ],
            },
            "roles": [
                {
                    "role": payload.workflow[0],
                    "task": "该岗位的核心任务",
                    "focus_points": ["重点关注项1", "重点关注项2"],
                    "brief_summary": "该岗位的一句话摘要",
                    "review_summary": "该岗位进入审阅视角后，右侧摘要 Tab 使用的一段简短摘要",
                    "review_checklist": ["该岗位审阅时要确认的事项 1", "该岗位审阅时要确认的事项 2"],
                    "view_hints": {
                        "priority_topics": ["建议优先阅读的主题"],
                        "foldable_topics": ["未来可折叠隐藏的主题"],
                        "review_keywords": ["用于匹配正文段落的关键词"],
                        "note": "这只是未来的视图提示，不改变原文",
                    },
                }
            ],
            "task_schedule": [
                {
                    "step": 1,
                    "owner": payload.workflow[0],
                    "goal": "当前步骤目标",
                    "input_from": [],
                    "output": "交付产物",
                    "priority": "high",
                }
            ],
        }
        return (
            "请根据下面的文档和工作流，生成 JSON 分析结果。\n"
            "要求：\n"
            "1. 返回值必须是一个合法 JSON 对象。\n"
            "2. document_summary 简短清晰。\n"
            "3. role_flow.stages、roles 必须与工作流一一对应，顺序不能改变。\n"
            "4. 每个 stage 还要有 stage_input、watch_points、stage_output。\n"
            "5. 每个岗位都要有 task、focus_points、brief_summary、review_summary、review_checklist、view_hints。\n"
            "6. view_hints 中必须包含 priority_topics、foldable_topics、review_keywords、note。\n"
            "7. task_schedule 要覆盖整个工作流，可多于工作流节点，但 owner 必须来自工作流。\n"
            "8. JSON 中 priority 只能是 high、medium、low。\n"
            "9. review_keywords 请尽量给出能在正文中定位相关段落的短词，不要是长句。\n"
            "10. 如果最后一个岗位没有下一个岗位，handoff_to_next 请写“流程结束，输出最终结论与归档结果”。\n\n"
            "工作流：{}\n"
            "文档名称：{}\n"
            "文档来源：{}\n"
            "JSON 示例结构：{}\n\n"
            "文档正文：\n{}"
        ).format(
            json.dumps(payload.workflow, ensure_ascii=False),
            payload.document_name,
            payload.source_type,
            json.dumps(schema, ensure_ascii=False),
            payload.document_content,
        )
