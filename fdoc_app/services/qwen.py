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


class DashScopeClient:
    def __init__(self) -> None:
        self.settings = QwenSettings(
            api_key=os.getenv("DASHSCOPE_API_KEY"),
            model=os.getenv("QWEN_MODEL", DEFAULT_QWEN_MODEL),
            endpoint=os.getenv("DASHSCOPE_ENDPOINT", DEFAULT_DASHSCOPE_URL),
            timeout_seconds=max(5, int(os.getenv("DASHSCOPE_TIMEOUT_SECONDS", "45"))),
        )

    def ensure_configured(self) -> None:
        if self.settings.api_key:
            return
        raise AnalysisServiceError(
            "后端未配置 DASHSCOPE_API_KEY，暂时无法调用千问分析。",
            code="missing_api_key",
            status_code=503,
        )

    def post_json_completion(self, messages: List[Dict[str, str]], *, temperature: float = 0.1) -> str:
        payload = {
            "model": self.settings.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": temperature,
        }
        response = self._post_chat_completion(payload)
        return self._extract_message_content(response)

    def repair_json(self, broken_content: str, workflow: List[str], schema_hint: str) -> Dict[str, Any]:
        repaired = self.post_json_completion(
            [
                {
                    "role": "system",
                    "content": (
                        "你是 JSON 修复助手。"
                        "只输出合法 JSON，不要解释。"
                        f" 工作流顺序必须严格保持：{json.dumps(workflow, ensure_ascii=False)}。"
                        f" 输出结构必须满足：{schema_hint}"
                    ),
                },
                {
                    "role": "user",
                    "content": f"请把下面内容修复为合法 JSON：\n{broken_content}",
                },
            ],
            temperature=0,
        )
        return json.loads(self.extract_json_text(repaired))

    def parse_json_content(self, content: str) -> Dict[str, Any]:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return json.loads(self.extract_json_text(content))

    def extract_json_text(self, text: str) -> str:
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

    def _post_chat_completion(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            self.settings.endpoint,
            data=body,
            headers={
                "Authorization": f"Bearer {self.settings.api_key}",
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


class QwenAnalyzer:
    def __init__(self) -> None:
        self.client = DashScopeClient()
        self.settings = self.client.settings

    def analyze(self, payload: AnalyzeRequest) -> AnalyzeResponse:
        self.client.ensure_configured()

        raw_content = self.client.post_json_completion(
            [
                {"role": "system", "content": self._build_system_prompt(payload.workflow)},
                {"role": "user", "content": self._build_user_prompt(payload)},
            ]
        )

        try:
            parsed = self._normalize_analysis_payload(self.client.parse_json_content(raw_content), payload.workflow)
            response = AnalyzeResponse.model_validate(parsed)
            self._ensure_alignment(response, payload.workflow)
            return response
        except (json.JSONDecodeError, ValidationError, AnalysisServiceError):
            repaired = self._normalize_analysis_payload(
                self.client.repair_json(raw_content, payload.workflow, self._analysis_schema_hint()),
                payload.workflow,
            )
            try:
                response = AnalyzeResponse.model_validate(repaired)
                self._ensure_alignment(response, payload.workflow)
                return response
            except (ValidationError, AnalysisServiceError) as exc:
                raise AnalysisServiceError(
                    "AI 返回的数据结构无法自动修复，请重试或缩短文档后再分析。",
                    code="invalid_analysis_payload",
                    status_code=502,
                    details={"error": str(exc)},
                ) from exc

    def _normalize_analysis_payload(self, payload: Dict[str, Any], workflow: List[str]) -> Dict[str, Any]:
        role_flow = payload.get("role_flow") if isinstance(payload.get("role_flow"), dict) else {}
        raw_stages = role_flow.get("stages")
        stages_by_role = self._map_items_by_role(raw_stages)
        raw_stage_list = raw_stages if isinstance(raw_stages, list) else []

        normalized_stages = []
        for index, role in enumerate(workflow):
            next_role = workflow[index + 1] if index + 1 < len(workflow) else ""
            fallback_handoff = f"向{next_role}交接本环节的关键结论和交付物" if next_role else "汇总结论并结束当前流转"
            raw_stage = stages_by_role.get(self._role_key(role))
            if raw_stage is None and index < len(raw_stage_list) and isinstance(raw_stage_list[index], dict):
                raw_stage = raw_stage_list[index]

            normalized_stages.append(
                {
                    "role": role,
                    "stage_goal": self._safe_text(
                        self._get_dict_value(raw_stage, "stage_goal"),
                        fallback=f"完成 {role} 环节的核心目标",
                    ),
                    "stage_input": self._safe_text(self._get_dict_value(raw_stage, "stage_input")),
                    "watch_points": self._safe_list(self._get_dict_value(raw_stage, "watch_points")),
                    "stage_output": self._safe_text(self._get_dict_value(raw_stage, "stage_output")),
                    "handoff_to_next": self._safe_text(
                        self._get_dict_value(raw_stage, "handoff_to_next"),
                        fallback=fallback_handoff,
                    ),
                }
            )

        raw_roles = payload.get("roles")
        roles_by_role = self._map_items_by_role(raw_roles)
        raw_role_list = raw_roles if isinstance(raw_roles, list) else []
        normalized_roles = []
        for index, role in enumerate(workflow):
            raw_role = roles_by_role.get(self._role_key(role))
            if raw_role is None and index < len(raw_role_list) and isinstance(raw_role_list[index], dict):
                raw_role = raw_role_list[index]

            normalized_roles.append(
                {
                    "role": role,
                    "task": self._safe_text(
                        self._get_dict_value(raw_role, "task"),
                        fallback=f"围绕文档完成 {role} 环节的核心任务",
                    ),
                    "focus_points": self._safe_list(
                        self._get_dict_value(raw_role, "focus_points"),
                        fallback=[f"{role} 需要重点关注的交付与风险"],
                    ),
                    "brief_summary": self._safe_text(
                        self._get_dict_value(raw_role, "brief_summary"),
                        fallback=f"{role} 负责推进并交付本环节的关键结果",
                    ),
                }
            )

        raw_schedule = payload.get("task_schedule")
        raw_schedule_list = raw_schedule if isinstance(raw_schedule, list) else []
        normalized_schedule = []
        task_count = max(len(workflow), len(raw_schedule_list))
        for index in range(task_count):
            raw_item = raw_schedule_list[index] if index < len(raw_schedule_list) and isinstance(raw_schedule_list[index], dict) else {}
            owner_candidate = self._safe_text(raw_item.get("owner"))
            owner = owner_candidate if owner_candidate in workflow else workflow[min(index, len(workflow) - 1)]
            input_from = self._safe_list(raw_item.get("input_from"))
            if not input_from and index > 0:
                input_from = [workflow[min(index - 1, len(workflow) - 1)]]

            normalized_schedule.append(
                {
                    "step": self._safe_int(raw_item.get("step"), index + 1),
                    "owner": owner,
                    "goal": self._safe_text(raw_item.get("goal"), fallback=f"推进 {owner} 环节的工作目标"),
                    "input_from": input_from,
                    "output": self._safe_text(raw_item.get("output"), fallback=f"{owner} 的阶段性交付物"),
                    "priority": self._safe_priority(raw_item.get("priority")),
                }
            )

        return {
            "document_summary": self._safe_text(
                payload.get("document_summary"),
                fallback="文档分析已完成，可根据岗位流转图查看各角色分工与交接内容。",
            ),
            "role_flow": {
                "title": self._safe_text(role_flow.get("title"), fallback="岗位流转图"),
                "stages": normalized_stages,
            },
            "roles": normalized_roles,
            "task_schedule": normalized_schedule,
        }

    def _safe_text(self, value: Any, fallback: str = "") -> str:
        if value is None:
            return fallback
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return "；".join(cleaned) if cleaned else fallback
        text = str(value).strip()
        return text or fallback

    def _safe_list(self, value: Any, fallback: Optional[List[str]] = None) -> List[str]:
        if value is None:
            return list(fallback or [])
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return cleaned or list(fallback or [])
        text = str(value).strip()
        if not text:
            return list(fallback or [])
        return [text]

    def _safe_int(self, value: Any, fallback: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return fallback
        return parsed if parsed > 0 else fallback

    def _safe_priority(self, value: Any) -> str:
        text = self._safe_text(value, fallback="medium").lower()
        return text if text in {"high", "medium", "low"} else "medium"

    def _map_items_by_role(self, value: Any) -> Dict[str, Dict[str, Any]]:
        if not isinstance(value, list):
            return {}
        mapped: Dict[str, Dict[str, Any]] = {}
        for item in value:
            if not isinstance(item, dict):
                continue
            role = self._safe_text(item.get("role"))
            if not role:
                continue
            mapped[self._role_key(role)] = item
        return mapped

    def _role_key(self, value: str) -> str:
        return str(value or "").strip().lower()

    def _get_dict_value(self, value: Any, key: str) -> Any:
        if not isinstance(value, dict):
            return None
        return value.get(key)

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

        invalid_owners = [item.owner for item in response.task_schedule if item.owner.strip() not in workflow]
        if invalid_owners:
            raise AnalysisServiceError(
                "AI 返回的任务安排中出现了工作流之外的岗位。",
                code="task_schedule_owner_mismatch",
                status_code=502,
                details={"owners": invalid_owners, "workflow": workflow},
            )

    def _analysis_schema_hint(self) -> str:
        return (
            "{document_summary, role_flow:{title, stages:[{role, stage_goal, stage_input, "
            "watch_points, stage_output, handoff_to_next}]}, roles:[{role, task, focus_points, "
            "brief_summary}], task_schedule:[{step, owner, goal, input_from, output, priority}]}"
        )

    def _build_system_prompt(self, workflow: List[str]) -> str:
        return (
            "你是 FDoc 的岗位流转分析助手。"
            "只输出合法 JSON，不要 markdown，不要解释。"
            f" role_flow.stages 和 roles 的 role 必须严格按这个顺序输出：{json.dumps(workflow, ensure_ascii=False)}。"
            " task_schedule.owner 只能从这些岗位中选择。"
            " 输出必须基于文档内容本身，不要写空泛模板句，不要使用“原始文档+业务目标”这类套话。"
            " 每个岗位都要给出真实可执行的任务、关注点、输入输出和交接说明，允许简洁，但必须具体。"
        )

    def _build_user_prompt(self, payload: AnalyzeRequest) -> str:
        workflow_json = json.dumps(payload.workflow, ensure_ascii=False)
        return (
            "返回固定 JSON，字段只有：document_summary、role_flow、roles、task_schedule。\n"
            "要求：\n"
            "1. document_summary 1到2句话。\n"
            "2. role_flow.title 固定为 岗位流转图。\n"
            "3. role_flow.stages 按工作流顺序输出，每项仅含 role、stage_goal、stage_input、watch_points、stage_output、handoff_to_next。\n"
            "4. stage_goal 要写该岗位这一环节真正要完成什么；stage_input 要写接收到的材料；stage_output 要写交付物；handoff_to_next 要写向下一岗位传递什么。\n"
            "5. watch_points 给 2 到 4 条最值得盯住的风险、边界、依赖或验收点。\n"
            "6. roles 按工作流顺序输出，每项仅含 role、task、focus_points、brief_summary。\n"
            "7. task 要写该岗位的核心动作，不要写空话；focus_points 给 2 到 4 条具体重点；brief_summary 用一句话概括该岗位要做成什么。\n"
            "8. task_schedule 覆盖全流程，每一步都要写清 step、owner、goal、input_from、output、priority，priority 只能是 high、medium、low。\n"
            "9. 如果文档里信息不足，可以合理补全业务协作常识，但要尽量贴合文档语境。\n"
            "10. 所有字符串保持简洁，但必须具体，不要重复，不要泛化。\n\n"
            f"工作流：{workflow_json}\n"
            f"文档名称：{payload.document_name}\n"
            f"文档来源：{payload.source_type}\n"
            "文档正文：\n"
            f"{payload.document_content}"
        )
