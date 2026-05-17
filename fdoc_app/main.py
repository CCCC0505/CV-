from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request

from fdoc_app.models import (
    AnalyzeRequest,
    ChatRequest,
    CodeLabRequest,
    DocRelationsRequest,
    FoldPlanRequest,
    ReviewEnrichRequest,
    VersionSummaryRequest,
    VizAssistRequest,
)
from fdoc_app.services.qwen import AnalysisServiceError, QwenAnalyzer
from fdoc_app.services.qwen_code import QwenCodeLabService
from fdoc_app.services.qwen_fold import QwenFoldPlanner
from fdoc_app.services.qwen_chat import QwenChatService
from fdoc_app.services.qwen_relation import QwenDocRelationService
from fdoc_app.services.qwen_review import QwenReviewEnricher
from fdoc_app.services.qwen_version import QwenVersionSummarizer
from fdoc_app.services.qwen_viz import QwenVizService


PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PACKAGE_DIR.parent
TEMPLATES_DIR = PACKAGE_DIR / "templates"
STATIC_DIR = PACKAGE_DIR / "static"
PRESETS_DIR = PACKAGE_DIR / "presets"
LEGACY_WEBSITE_DIR = PROJECT_DIR / "overtype-main" / "website"
LEGACY_DIAGRAM_EMBED = LEGACY_WEBSITE_DIR / "diagram-embed.html"
LEGACY_OVERTYPE_JS = LEGACY_WEBSITE_DIR / "dist" / "overtype.min.js"

PRESET_REGISTRY = {
    "product-requirements": {
        "id": "product-requirements",
        "title": "产品需求说明",
        "description": "围绕业务背景、岗位协作、需求范围与验收标准的真实产品型材料。",
        "category": "产品向",
        "difficulty": "中高复杂度",
        "tags": ["需求评审", "验收口径", "跨岗位协作"],
        "highlights": ["业务背景与目标", "功能范围与边界", "验收标准", "里程碑计划"],
        "recommended_workflow": ["产品经理", "工程师", "数据分析员", "CEO"],
        "filename": "product-requirements.md",
    },
    "technical-plan": {
        "id": "technical-plan",
        "title": "技术方案说明",
        "description": "覆盖架构拆分、接口协议、发布策略和风险控制的工程方案文档。",
        "category": "技术向",
        "difficulty": "高复杂度",
        "tags": ["接口协议", "发布回滚", "AI 分析约束"],
        "highlights": ["系统架构", "接口与状态流", "校验与重试", "上线与监控"],
        "recommended_workflow": ["产品经理", "工程师", "测试", "CEO"],
        "filename": "technical-plan.md",
    },
    "data-review": {
        "id": "data-review",
        "title": "数据复盘摘要",
        "description": "聚焦指标拆解、渠道差异、归因问题和下一轮动作的数据复盘材料。",
        "category": "数据向",
        "difficulty": "中高复杂度",
        "tags": ["指标复盘", "渠道表现", "归因分析"],
        "highlights": ["核心指标总览", "渠道拆解", "漏斗问题", "行动建议"],
        "recommended_workflow": ["产品经理", "工程师", "数据分析员", "CEO"],
        "filename": "data-review.md",
    },
    "release-checklist": {
        "id": "release-checklist",
        "title": "发布检查清单",
        "description": "面向上线前验收、灰度、回滚和对外沟通的简洁检查文档。",
        "category": "协作向",
        "difficulty": "中等",
        "tags": ["上线准备", "风险检查", "回滚方案"],
        "highlights": ["发布前核对", "风险与回滚", "协作交接"],
        "recommended_workflow": ["产品经理", "工程师", "测试", "CEO"],
        "filename": "release-checklist.md",
    },
    "weekly-brief": {
        "id": "weekly-brief",
        "title": "运营周报摘要",
        "description": "围绕周度指标、波动说明和下一步动作整理的运营复盘文档。",
        "category": "数据向",
        "difficulty": "中等",
        "tags": ["周报", "指标监控", "复盘"],
        "highlights": ["周度趋势", "异常波动", "行动项"],
        "recommended_workflow": ["运营", "数据分析员", "CEO"],
        "filename": "weekly-brief.md",
    },
}


app = FastAPI(title="FDoc", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
analyzer = QwenAnalyzer()
chat_service = QwenChatService()
code_lab_service = QwenCodeLabService()
viz_service = QwenVizService()
relation_service = QwenDocRelationService()
review_enricher = QwenReviewEnricher()
fold_planner = QwenFoldPlanner()
version_summarizer = QwenVersionSummarizer()
STATIC_VERSION = str(int(app.version.split(".")[0]) if app.version else 1)


def _read_preset_content(preset_id: str) -> str:
    preset = PRESET_REGISTRY.get(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    target = PRESETS_DIR / preset["filename"]
    if not target.exists():
        raise HTTPException(status_code=500, detail="Preset file is missing")
    return target.read_text(encoding="utf-8")


def _clean_preview_line(raw_line: str) -> str:
    line = raw_line.strip()
    if not line or line.startswith("```") or line.startswith("|"):
        return ""
    if line.startswith("#"):
        line = line.lstrip("#").strip()
    elif line.startswith("- "):
        line = line[2:].strip()
    return line


def _build_preset_preview(content: str) -> str:
    cleaned_lines = [_clean_preview_line(line) for line in content.splitlines()]
    meaningful_lines = [line for line in cleaned_lines if line]
    for line in meaningful_lines[1:]:
        if len(line) >= 18:
            return line[:160]
    return meaningful_lines[0][:160] if meaningful_lines else ""


def _build_preset_payload(preset_id: str) -> dict:
    preset = PRESET_REGISTRY[preset_id]
    content = _read_preset_content(preset_id)
    return {
        "id": preset["id"],
        "title": preset["title"],
        "description": preset["description"],
        "category": preset["category"],
        "difficulty": preset["difficulty"],
        "tags": preset["tags"],
        "highlights": preset["highlights"],
        "recommended_workflow": preset["recommended_workflow"],
        "document_name": f"{preset['title']}.md",
        "preview": _build_preset_preview(content),
        "char_count": len(content),
        "section_count": sum(1 for line in content.splitlines() if line.startswith("## ")),
    }


@app.get("/", response_class=HTMLResponse)
async def homepage(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "page_title": "FDoc", "static_version": app.version},
    )


@app.get("/setup", response_class=HTMLResponse)
async def setup_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        "setup.html",
        {"request": request, "page_title": "FDoc Setup", "static_version": app.version},
    )


@app.get("/editor", response_class=HTMLResponse)
async def editor_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        "editor.html",
        {"request": request, "page_title": "FDoc Editor", "static_version": app.version},
    )


@app.get("/diagram-embed")
async def diagram_embed() -> FileResponse:
    if not LEGACY_DIAGRAM_EMBED.exists():
        raise HTTPException(status_code=404, detail="diagram-embed.html not found")
    return FileResponse(LEGACY_DIAGRAM_EMBED, media_type="text/html; charset=utf-8")


@app.get("/assets/overtype.min.js")
async def overtype_asset() -> FileResponse:
    if not LEGACY_OVERTYPE_JS.exists():
        raise HTTPException(status_code=404, detail="overtype.min.js not found")
    return FileResponse(LEGACY_OVERTYPE_JS, media_type="application/javascript")


@app.get("/api/health")
async def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            "service": "fdoc",
            "qwen_configured": bool(analyzer.settings.api_key),
            "model": analyzer.settings.model,
        }
    )


@app.get("/api/presets")
async def list_presets() -> JSONResponse:
    presets = [_build_preset_payload(preset["id"]) for preset in PRESET_REGISTRY.values()]
    return JSONResponse({"items": presets})


@app.get("/api/presets/{preset_id}")
async def get_preset(preset_id: str) -> JSONResponse:
    preset = PRESET_REGISTRY.get(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    content = _read_preset_content(preset_id)
    payload = _build_preset_payload(preset_id)
    payload["content"] = content
    return JSONResponse(payload)


@app.post("/api/analyze")
async def analyze_document(payload: AnalyzeRequest) -> JSONResponse:
    try:
        analysis = analyzer.analyze(payload)
    except AnalysisServiceError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
            status_code=exc.status_code,
        )
    return JSONResponse(analysis.model_dump())


@app.post("/api/review-enrich")
async def enrich_review(payload: ReviewEnrichRequest) -> JSONResponse:
    try:
        review = review_enricher.enrich(payload)
    except AnalysisServiceError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
            status_code=exc.status_code,
        )
    return JSONResponse(review.model_dump())


@app.post("/api/chat")
async def chat(payload: ChatRequest) -> JSONResponse:
    try:
        response = chat_service.chat(payload)
    except AnalysisServiceError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
            status_code=exc.status_code,
        )
    return JSONResponse(response.model_dump())


@app.post("/api/code-lab")
async def code_lab(payload: CodeLabRequest) -> JSONResponse:
    try:
        response = code_lab_service.assist(payload)
    except AnalysisServiceError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
            status_code=exc.status_code,
        )
    return JSONResponse(response.model_dump())


@app.post("/api/viz-assist")
async def viz_assist(payload: VizAssistRequest) -> JSONResponse:
    try:
        response = viz_service.assist(payload)
    except AnalysisServiceError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
            status_code=exc.status_code,
        )
    return JSONResponse(response.model_dump())


@app.post("/api/doc-relations")
async def doc_relations(payload: DocRelationsRequest) -> JSONResponse:
    try:
        response = relation_service.recommend(payload)
    except AnalysisServiceError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
            status_code=exc.status_code,
        )
    return JSONResponse(response.model_dump())


@app.post("/api/fold-plan")
async def fold_plan(payload: FoldPlanRequest) -> JSONResponse:
    try:
        response = fold_planner.plan(payload)
    except AnalysisServiceError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
            status_code=exc.status_code,
        )
    return JSONResponse(response.model_dump())


@app.post("/api/version-summary")
async def summarize_version(payload: VersionSummaryRequest) -> JSONResponse:
    try:
        summary = version_summarizer.summarize_version(payload)
    except AnalysisServiceError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
            status_code=exc.status_code,
        )
    return JSONResponse(summary.model_dump())
