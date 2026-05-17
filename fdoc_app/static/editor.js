(function () {
  const STORAGE_KEY = "fdoc-state";
  const CODE_LAB_ROLES = ["产品经理", "工程师"];
  const VIZ_ROLES = ["数据分析员", "CEO", "运营"];
  const PRESET_RELATION_DOCS = [
    {
      document_id: "product-requirements",
      document_name: "产品需求说明.md",
      summary: "围绕业务背景、岗位协作、需求范围与验收标准的真实产品型材料。",
      source_type: "preset",
    },
    {
      document_id: "technical-plan",
      document_name: "技术方案说明.md",
      summary: "覆盖架构拆分、接口协议、发布策略和风险控制的工程方案文档。",
      source_type: "preset",
    },
    {
      document_id: "data-review",
      document_name: "数据复盘摘要.md",
      summary: "聚焦指标拆解、渠道表现、归因问题和下一轮动作的数据复盘材料。",
      source_type: "preset",
    },
    {
      document_id: "release-checklist",
      document_name: "发布检查清单.md",
      summary: "面向上线前验收、灰度、回滚和对外沟通的简洁检查文档。",
      source_type: "preset",
    },
    {
      document_id: "weekly-brief",
      document_name: "运营周报摘要.md",
      summary: "围绕周度指标、波动说明和下一步动作整理的运营复盘文档。",
      source_type: "preset",
    },
  ];
  const DEFAULT_VIZ_PRESET = {
    chart_title: "稳定展示图",
    summary: "当前先展示固定图表，避免依赖上传链路失败；后续链接数据后会刷新为真实结果。",
    chart_suggestions: ["默认柱状图", "表格预览", "一键切换数据源"],
    placeholder_notice: "当前 csv 只支持上传一行或一列的数据生成可视化表格。",
    table_headers: ["指标", "说明", "状态"],
    table_rows: [
      ["预置图表", "稳定默认展示", "ready"],
      ["上传限制", "仅一行或一列", "notice"],
      ["链接方式", "可选补充上传", "optional"],
    ],
  };
  const DEFAULT_RELATION_GRAPH = {
    current: "当前文档",
    nodes: [
      { id: "product-requirements", label: "产品需求说明" },
      { id: "technical-plan", label: "技术方案说明" },
      { id: "data-review", label: "数据复盘摘要" },
      { id: "release-checklist", label: "发布检查清单" },
      { id: "weekly-brief", label: "运营周报摘要" },
    ],
  };
  const DEFAULT_CODE_SAMPLES = {
    html: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FDoc 代码实验</title>
  <style>
    body { font-family: sans-serif; padding: 24px; background: #06131b; color: #fff; }
    .card { padding: 16px; border-radius: 16px; background: rgba(255,255,255,.06); }
  </style>
</head>
<body>
  <div class="card">Hello FDoc</div>
</body>
</html>`,
    js: `const box = document.getElementById("app");
box.textContent = "FDoc JavaScript sandbox is running.";`,
    python: `def summarize(items):
    return " / ".join(items)

print(summarize(["FDoc", "Python", "pseudo run"]))`,
    c: `#include <stdio.h>

int main(void) {
    printf("FDoc pseudo run\\n");
    return 0;
}`,
    java: `public class Main {
    public static void main(String[] args) {
        System.out.println("FDoc pseudo run");
    }
}`,
  };

  const elements = {
    guard: document.getElementById("editor-guard"),
    main: document.getElementById("editor-main"),
    name: document.getElementById("editor-document-name"),
    workflowTags: document.getElementById("editor-workflow-tags"),
    summary: document.getElementById("document-summary-text"),
    inlineAlert: document.getElementById("editor-inline-alert"),
    modeNote: document.getElementById("editor-mode-note"),
    roleGrid: document.getElementById("role-analysis-grid"),
    roleSwitcher: document.getElementById("role-switcher"),
    editorHost: document.getElementById("markdown-editor"),
    reviewSurface: document.getElementById("review-surface"),
    beyondTabs: document.getElementById("beyond-tabs"),
    codeLabPanel: document.getElementById("code-lab-panel"),
    codeLabRoleBadge: document.getElementById("code-lab-role-badge"),
    codeLabLanguage: document.getElementById("code-lab-language"),
    codeLabInput: document.getElementById("code-lab-input"),
    codeLabRunButton: document.getElementById("code-lab-run-button"),
    codeLabFillSampleButton: document.getElementById("code-lab-fill-sample-button"),
    codeLabResult: document.getElementById("code-lab-result"),
    codeLabPreview: document.getElementById("code-lab-preview"),
    vizAssistPanel: document.getElementById("viz-assist-panel"),
    vizLinkSourceButton: document.getElementById("viz-link-source-button"),
    vizSourceInput: document.getElementById("viz-source-input"),
    vizPlaceholderNotice: document.getElementById("viz-placeholder-notice"),
    vizChartVisual: document.getElementById("viz-chart-visual"),
    vizTable: document.getElementById("viz-table"),
    vizChartSummary: document.getElementById("viz-chart-summary"),
    vizChartHints: document.getElementById("viz-chart-hints"),
    relationPanel: document.getElementById("relation-panel"),
    relationOverview: document.getElementById("relation-overview"),
    relationList: document.getElementById("relation-list"),
    relationRefreshButton: document.getElementById("relation-refresh-button"),
    relationConfirmButton: document.getElementById("relation-confirm-button"),
    relationGraph: document.getElementById("relation-graph"),
    linkedDocStrip: document.getElementById("linked-doc-strip"),
    linkedDocLinks: document.getElementById("linked-doc-links"),
    linkedDocPopover: document.getElementById("linked-doc-popover"),
    linkedDocPopoverTitle: document.getElementById("linked-doc-popover-title"),
    linkedDocPopoverMeta: document.getElementById("linked-doc-popover-meta"),
    linkedDocPopoverContent: document.getElementById("linked-doc-popover-content"),
    closeLinkedDocPopover: document.getElementById("close-linked-doc-popover"),
    reviewContent: document.getElementById("review-content"),
    reviewSurfaceTitle: document.getElementById("review-surface-title"),
    foldedSummaryBar: document.getElementById("folded-summary-bar"),
    reviewExpandAllButton: document.getElementById("review-expand-all-button"),
    reviewConfirmButton: document.getElementById("review-confirm-button"),
    modeEditButton: document.getElementById("mode-edit-button"),
    modeReviewButton: document.getElementById("mode-review-button"),
    confirmChangeButton: document.getElementById("confirm-change-button"),
    versionStatusText: document.getElementById("version-status-text"),
    leftSummaryButton: document.getElementById("left-summary-button"),
    leftSummaryDrawer: document.getElementById("left-summary-drawer"),
    closeLeftSummaryDrawer: document.getElementById("close-left-summary-drawer"),
    drawerTabLeftSummary: document.getElementById("drawer-tab-left-summary"),
    drawerTabVersionTimeline: document.getElementById("drawer-tab-version-timeline"),
    drawerPanelLeftSummary: document.getElementById("drawer-panel-left-summary"),
    drawerPanelVersionTimeline: document.getElementById("drawer-panel-version-timeline"),
    leftSummaryText: document.getElementById("left-summary-text"),
    leftSummaryFocusList: document.getElementById("left-summary-focus-list"),
    editorAiAskButton: document.getElementById("editor-ai-ask-button"),
    chatSelectionPopover: document.getElementById("chat-selection-popover"),
    addSelectionToChatButton: document.getElementById("add-selection-to-chat-button"),
    chatRolePreset: document.getElementById("chat-role-preset"),
    chatPersonaNote: document.getElementById("chat-persona-note"),
    chatContextList: document.getElementById("chat-context-list"),
    chatMessages: document.getElementById("chat-messages"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatSendButton: document.getElementById("chat-send-button"),
    taskDrawerButton: document.getElementById("task-drawer-button"),
    taskDrawer: document.getElementById("task-drawer"),
    taskDrawerBadge: document.getElementById("task-drawer-badge"),
    closeTaskDrawer: document.getElementById("close-task-drawer"),
    drawerBackdrop: document.getElementById("drawer-backdrop"),
    drawerTabSchedule: document.getElementById("drawer-tab-schedule"),
    drawerTabRoleSummary: document.getElementById("drawer-tab-role-summary"),
    drawerPanelSchedule: document.getElementById("drawer-panel-schedule"),
    drawerPanelRoleSummary: document.getElementById("drawer-panel-role-summary"),
    taskScheduleList: document.getElementById("task-schedule-list"),
    activeRoleSummaryTitle: document.getElementById("active-role-summary-title"),
    activeRoleSummaryText: document.getElementById("active-role-summary-text"),
    roleSummaryChecklist: document.getElementById("role-summary-checklist"),
    roleSummaryTopicList: document.getElementById("role-summary-topic-list"),
    roleSummaryScheduleList: document.getElementById("role-summary-schedule-list"),
  };

  let currentState = null;
  let currentRole = "";
  let currentMode = "edit";
  let manuallyExpandedIndexes = new Set();
  let activeDrawer = null;
  let eventsBound = false;
  let editorInstance = null;
  let selectedChatContext = null;
  let chatContexts = [];
  let chatMessages = [];
  let chatRequestPending = false;
  let selectionPopoverFrame = null;
  let presetRelationDocs = PRESET_RELATION_DOCS.slice();
  let presetRelationDocsPending = false;
  let foldPlanPending = false;
  let linkedDocPopoverDoc = null;

  function defaultVersions(documentContent) {
    return [
      {
        version_number: 1,
        timestamp: new Date().toISOString(),
        content: documentContent || "",
        change_summary: "初始分析版本已建立，作为后续决策溯源的起点。",
        self_conclusion: "当前文档以分析完成时的原文作为基线版本。",
        decision_trace: ["建立文档基线版本，后续每次确认更改都会追加时间轴记录。"],
        key_changes: ["初始版本已保存"],
        affected_roles: [],
        is_initial: true,
      },
    ];
  }

  function loadState() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    try {
      return ensureBeyondState(JSON.parse(stored));
    } catch (error) {
      console.warn("Failed to parse editor state", error);
      return null;
    }
  }

  function persistState(nextState) {
    currentState = ensureBeyondState(ensureVersionState(nextState));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
  }

  function normalizeContentLines(content) {
    return String(content || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd());
  }

  function buildVersionDelta(previousContent, currentContent) {
    const previousCounts = new Map();
    const currentCounts = new Map();
    const previousLines = normalizeContentLines(previousContent).filter((line) => line.trim());
    const currentLines = normalizeContentLines(currentContent).filter((line) => line.trim());

    previousLines.forEach((line) => {
      previousCounts.set(line, (previousCounts.get(line) || 0) + 1);
    });
    currentLines.forEach((line) => {
      currentCounts.set(line, (currentCounts.get(line) || 0) + 1);
    });

    const addedPreview = [];
    const removedPreview = [];
    let addedCount = 0;
    let removedCount = 0;

    currentCounts.forEach((count, line) => {
      const previousCount = previousCounts.get(line) || 0;
      if (count > previousCount) {
        addedCount += count - previousCount;
        if (addedPreview.length < 3) {
          addedPreview.push(line);
        }
      }
    });

    previousCounts.forEach((count, line) => {
      const currentCount = currentCounts.get(line) || 0;
      if (count > currentCount) {
        removedCount += count - currentCount;
        if (removedPreview.length < 3) {
          removedPreview.push(line);
        }
      }
    });

    return {
      addedCount,
      removedCount,
      addedPreview,
      removedPreview,
    };
  }

  function ensureVersionState(state) {
    const nextState = state;
    if (!Array.isArray(nextState.versions) || !nextState.versions.length) {
      nextState.versions = defaultVersions(nextState.documentContent || "");
    }
    if (typeof nextState.versionSummaryPending !== "boolean") {
      nextState.versionSummaryPending = false;
    }
    if (typeof nextState.reviewEnrichPending !== "boolean") {
      nextState.reviewEnrichPending = false;
    }
    return nextState;
  }

  function ensureBeyondState(state) {
    const nextState = state || {};
    if (!nextState.beyond || typeof nextState.beyond !== "object") {
      nextState.beyond = {};
    }
    if (!nextState.beyond.codeLab || typeof nextState.beyond.codeLab !== "object") {
      nextState.beyond.codeLab = { byRole: {} };
    }
    if (!nextState.beyond.codeLab.byRole || typeof nextState.beyond.codeLab.byRole !== "object") {
      nextState.beyond.codeLab.byRole = {};
    }
    if (!nextState.beyond.viz || typeof nextState.beyond.viz !== "object") {
      nextState.beyond.viz = { byRole: {} };
    }
    if (!nextState.beyond.viz.byRole || typeof nextState.beyond.viz.byRole !== "object") {
      nextState.beyond.viz.byRole = {};
    }
    if (!nextState.beyond.relations || typeof nextState.beyond.relations !== "object") {
      nextState.beyond.relations = { byRole: {}, presetDocs: PRESET_RELATION_DOCS.slice(), selectedPresetIds: [] };
    }
    if (!nextState.beyond.relations.byRole || typeof nextState.beyond.relations.byRole !== "object") {
      nextState.beyond.relations.byRole = {};
    }
    if (!Array.isArray(nextState.beyond.relations.presetDocs) || !nextState.beyond.relations.presetDocs.length) {
      nextState.beyond.relations.presetDocs = PRESET_RELATION_DOCS.slice();
    }
    if (!Array.isArray(nextState.beyond.relations.selectedPresetIds)) {
      nextState.beyond.relations.selectedPresetIds = [];
    }
    if (!Array.isArray(nextState.beyond.relations.confirmedDocs)) {
      nextState.beyond.relations.confirmedDocs = [];
    }
    if (!nextState.beyond.foldPlan || typeof nextState.beyond.foldPlan !== "object") {
      nextState.beyond.foldPlan = { byRole: {} };
    }
    if (!nextState.beyond.foldPlan.byRole || typeof nextState.beyond.foldPlan.byRole !== "object") {
      nextState.beyond.foldPlan.byRole = {};
    }
    return nextState;
  }

  function showGuardAndRedirect() {
    elements.guard.hidden = false;
    elements.main.hidden = true;
    window.setTimeout(() => {
      window.location.href = "/setup";
    }, 1800);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeToken(token) {
    return String(token || "").trim().toLowerCase();
  }

  function sameRole(left, right) {
    return normalizeToken(left) === normalizeToken(right);
  }

  function getWorkflowIndex(role, workflow) {
    const items = Array.isArray(workflow) ? workflow : getWorkflow(currentState);
    return items.findIndex((item) => sameRole(item, role));
  }

  function getNextWorkflowRole(role) {
    const workflow = getWorkflow(currentState);
    if (!workflow.length) {
      return "";
    }
    const index = getWorkflowIndex(role, workflow);
    if (index < 0 || index >= workflow.length - 1) {
      return "";
    }
    return workflow[index + 1] || "";
  }

  function getWorkflow(state) {
    if (state && Array.isArray(state.workflow) && state.workflow.length) {
      return state.workflow;
    }
    const analysisRoles = (((state || {}).analysis || {}).roles || []).map((item) => item.role).filter(Boolean);
    return analysisRoles;
  }

  function getRoleAnalysis(role) {
    const roles = (((currentState || {}).analysis || {}).roles || []);
    return roles.find((item) => sameRole(item.role, role)) || roles[0] || null;
  }

  function getRoleFlowStage(role) {
    const stages = ((((currentState || {}).analysis || {}).role_flow || {}).stages || []);
    return stages.find((item) => sameRole(item.role, role)) || null;
  }

  function getTaskSchedule(ownerRole) {
    const allTasks = (((currentState || {}).analysis || {}).task_schedule || []);
    if (!ownerRole) {
      return allTasks;
    }
    return allTasks.filter((item) => sameRole(item.owner, ownerRole));
  }

  function getLatestVersion() {
    const versions = (currentState && currentState.versions) || [];
    return versions[versions.length - 1] || null;
  }

  function getCurrentEditorContent() {
    if (typeof window.OverType !== "undefined") {
      const editable = elements.editorHost.querySelector(".overtype-editor, .editor, textarea");
      if (editable && typeof editable.value === "string") {
        return editable.value;
      }
      if (editable && editable.isContentEditable) {
        return editable.textContent || "";
      }
    }

    const fallback = elements.editorHost.querySelector("textarea");
    if (fallback) {
      return fallback.value;
    }
    return (currentState && currentState.documentContent) || "";
  }

  function hasUnconfirmedChanges() {
    const latestVersion = getLatestVersion();
    if (!latestVersion) {
      return false;
    }
    return getCurrentEditorContent() !== latestVersion.content;
  }

  function hasReviewData(role) {
    if (!role) {
      return false;
    }
    const hints = role.view_hints || {};
    return Boolean(
      (role.review_summary && role.review_summary.trim()) ||
        (Array.isArray(role.review_checklist) && role.review_checklist.length) ||
        (Array.isArray(hints.priority_topics) && hints.priority_topics.length) ||
        (Array.isArray(hints.review_keywords) && hints.review_keywords.length),
    );
  }

  function buildReviewEnrichPayload(state) {
    const roles = (((state || {}).analysis || {}).roles || []);
    if (!roles.length) {
      return null;
    }
    return {
      document_name: state.documentName,
      document_content: state.documentContent,
      workflow: getWorkflow(state),
      source_type: state.sourceType || "upload",
      roles: roles.map((role) => ({
        role: role.role,
        task: role.task,
        focus_points: role.focus_points || [],
        brief_summary: role.brief_summary,
      })),
    };
  }

  function mergeReviewEnrichment(reviewData) {
    if (!currentState || !currentState.analysis || !Array.isArray(reviewData.roles)) {
      return;
    }

    const byRole = new Map(
      reviewData.roles.map((item) => [String(item.role || "").trim().toLowerCase(), item]),
    );

    currentState.analysis.roles = (currentState.analysis.roles || []).map((role) => {
      const review = byRole.get(String(role.role || "").trim().toLowerCase());
      if (!review) {
        return role;
      }
      return {
        ...role,
        review_summary: review.review_summary || role.review_summary || "",
        review_checklist: Array.isArray(review.review_checklist) ? review.review_checklist : role.review_checklist || [],
        view_hints: {
          ...(role.view_hints || {}),
          ...(review.view_hints || {}),
        },
      };
    });

    currentState.reviewEnrichPending = false;
    persistState(currentState);
  }

  async function ensureReviewEnrichment(options) {
    const config = options || {};
    if (!currentState || !currentState.analysis) {
      return;
    }

    const roles = currentState.analysis.roles || [];
    const payload = buildReviewEnrichPayload(currentState);
    if (!payload) {
      return;
    }

    const needsReview = currentState.reviewEnrichPending || roles.some((role) => !hasReviewData(role));
    if (!needsReview) {
      return;
    }

    currentState.reviewEnrichPending = true;
    persistState(currentState);
    if (config.showLoadingMessage) {
      updateInlineAlert("正在补充角色审阅摘要与折叠提示…", "info");
    }

    try {
      const response = await fetch("/api/review-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || "角色审阅增强失败");
      }

      mergeReviewEnrichment(data);
      renderRoleCards((((currentState || {}).analysis || {}).roles || []), (((currentState || {}).analysis || {}).role_flow || null));
      renderRoleSummaryPanel();
      renderLeftSummaryDrawer();
      renderReviewSurface();
      void ensureFoldPlan({ force: true, showLoadingMessage: false });
      updateInlineAlert("", "info");
    } catch (error) {
      console.warn("Failed to load review enrichment in editor", error);
      currentState.reviewEnrichPending = false;
      persistState(currentState);
      if (config.showLoadingMessage) {
        updateInlineAlert("角色审阅增强暂时未完成，当前仍可先编辑原文。", "info");
      }
    }
  }

  function buildVersionSummaryPayload(previousContent, currentContent, versionNumber) {
    return {
      document_name: currentState.documentName,
      workflow: getWorkflow(currentState),
      previous_content: previousContent,
      current_content: currentContent,
      version_number: versionNumber,
    };
  }

  function updateInlineAlert(message, kind) {
    if (!message) {
      elements.inlineAlert.hidden = true;
      elements.inlineAlert.textContent = "";
      elements.inlineAlert.classList.remove("is-error", "is-info");
      return;
    }
    elements.inlineAlert.hidden = false;
    elements.inlineAlert.textContent = message;
    elements.inlineAlert.classList.remove("is-error", "is-info");
    elements.inlineAlert.classList.add(kind === "error" ? "is-error" : "is-info");
  }

  function updateVersionStatusText() {
    const latestVersion = getLatestVersion();
    if (!latestVersion) {
      elements.versionStatusText.textContent = "还没有可用的版本记录。";
      elements.confirmChangeButton.disabled = true;
      return;
    }

    if (currentState.versionSummaryPending) {
      elements.versionStatusText.textContent = `正在为 V${latestVersion.version_number} 之后的新修改生成 AI 结论…`;
      elements.confirmChangeButton.disabled = true;
      return;
    }

    if (hasUnconfirmedChanges()) {
      elements.versionStatusText.textContent = `检测到未确认修改。点击“确认更改”后会生成 V${latestVersion.version_number + 1}。`;
      elements.confirmChangeButton.disabled = false;
      return;
    }

    elements.versionStatusText.textContent = `当前最新版本为 V${latestVersion.version_number}，尚无新的待确认修改。`;
    elements.confirmChangeButton.disabled = true;
  }

  function renderWorkflowTags(workflow) {
    elements.workflowTags.innerHTML = "";
    workflow.forEach((role) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = role;
      elements.workflowTags.appendChild(tag);
    });
  }

  function updateModeNote() {
    if (currentMode === "review") {
      elements.modeNote.textContent = `当前为 ${currentRole || "未选择角色"} 审阅视角，只会折叠无关段落并保留全部原文。`;
      return;
    }
    elements.modeNote.textContent = "编辑视图始终保留完整原文；切换到角色审阅时，只会在视图层折叠不相关段落。";
  }

  function renderEmptyState(container, message) {
    container.innerHTML = `<p class="empty-inline-state">${escapeHtml(message)}</p>`;
  }

  function renderTaskSchedule(taskSchedule, target, options) {
    const config = options || {};
    target.innerHTML = "";

    if (!Array.isArray(taskSchedule) || !taskSchedule.length) {
      renderEmptyState(target, config.emptyMessage || "暂无任务安排");
      return;
    }

    taskSchedule.forEach((item) => {
      const node = document.createElement("article");
      node.className = `task-schedule-item${config.compact ? " is-compact" : ""}`;
      const inputFrom = Array.isArray(item.input_from) && item.input_from.length ? item.input_from.join("、") : "无";
      node.innerHTML = `
        <div class="task-step-number">${escapeHtml(item.step)}</div>
        <div class="task-meta">
          <div class="task-owner-line">
            <h4>${escapeHtml(item.owner || "未指定")}</h4>
            <span class="priority-pill priority-${escapeHtml(item.priority || "medium")}">${escapeHtml(item.priority || "medium")}</span>
          </div>
          <p><strong>目标：</strong>${escapeHtml(item.goal || "")}</p>
          <p><strong>依赖输入：</strong>${escapeHtml(inputFrom)}</p>
          <p><strong>输出物：</strong>${escapeHtml(item.output || "")}</p>
        </div>
      `;
      target.appendChild(node);
    });
  }

  function renderRoleSummaryPanel() {
    const roleAnalysis = getRoleAnalysis(currentRole);
    elements.activeRoleSummaryTitle.textContent = currentRole || "当前角色";
    elements.activeRoleSummaryText.textContent =
      (roleAnalysis && (roleAnalysis.review_summary || roleAnalysis.brief_summary)) || "暂无角色摘要。";

    elements.roleSummaryChecklist.innerHTML = "";
    ((roleAnalysis && roleAnalysis.review_checklist) || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      elements.roleSummaryChecklist.appendChild(li);
    });
    if (!elements.roleSummaryChecklist.children.length) {
      const li = document.createElement("li");
      li.textContent = "暂无审阅清单";
      elements.roleSummaryChecklist.appendChild(li);
    }

    elements.roleSummaryTopicList.innerHTML = "";
    ((roleAnalysis && roleAnalysis.view_hints && roleAnalysis.view_hints.priority_topics) || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      elements.roleSummaryTopicList.appendChild(li);
    });
    if (!elements.roleSummaryTopicList.children.length) {
      const li = document.createElement("li");
      li.textContent = "暂无重点主题";
      elements.roleSummaryTopicList.appendChild(li);
    }

    renderTaskSchedule(getTaskSchedule(currentRole), elements.roleSummaryScheduleList, {
      compact: true,
      emptyMessage: "当前角色暂无任务安排",
    });
  }

  function roleRequiresCodeLab(role) {
    return CODE_LAB_ROLES.some((item) => sameRole(item, role));
  }

  function roleRequiresViz(role) {
    return VIZ_ROLES.some((item) => sameRole(item, role));
  }

  function getBestVizRole() {
    const workflow = getWorkflow(currentState);
    return workflow.find((role) => roleRequiresViz(role)) || "";
  }

  function invalidateFoldPlans() {
    if (!currentState) {
      return;
    }
    ensureBeyondState(currentState);
    currentState.beyond.foldPlan.byRole = {};
  }

  function getReviewSectionsSource() {
    return splitDocumentIntoSections((currentState && currentState.documentContent) || "");
  }

  function buildFoldPlanPayload() {
    const roleAnalysis = getRoleAnalysis(currentRole);
    const roleStage = getRoleFlowStage(currentRole);
    if (!currentState || !currentRole || !roleHasReviewContext(roleAnalysis, roleStage)) {
      return null;
    }

    const sections = getReviewSectionsSource().map((section, index) => ({
      index,
      heading: section.heading,
      content: section.content,
    }));
    if (!sections.length) {
      return null;
    }

    const hints = (roleAnalysis && roleAnalysis.view_hints) || {};
    return {
      document_name: currentState.documentName || "未命名文档",
      document_content: currentState.documentContent || "",
      workflow: getWorkflow(currentState),
      current_role: currentRole,
      role_task: (roleAnalysis && roleAnalysis.task) || "",
      role_summary: (roleAnalysis && (roleAnalysis.review_summary || roleAnalysis.brief_summary)) || "",
      focus_points: (roleAnalysis && roleAnalysis.focus_points) || [],
      priority_topics: hints.priority_topics || [],
      foldable_topics: hints.foldable_topics || [],
      review_keywords: hints.review_keywords || [],
      watch_points: (roleStage && roleStage.watch_points) || [],
      stage_goal: (roleStage && roleStage.stage_goal) || "",
      sections,
    };
  }

  function normalizeFoldPlanResult(data, sections) {
    const items = Array.isArray(data && data.sections) ? data.sections : [];
    const mapped = new Map();
    items.forEach((item) => {
      if (!item || typeof item.index !== "number") {
        return;
      }
      mapped.set(item.index, item);
    });

    return sections.map((section, index) => {
      const raw = mapped.get(index) || {};
      const relevance = ["high", "medium", "low"].includes(raw.relevance) ? raw.relevance : "low";
      return {
        index,
        heading: section.heading,
        relevance,
        should_fold: Boolean(raw.should_fold),
        highlight: Boolean(raw.highlight),
        reason: String(raw.reason || "").trim(),
        matched_topics: Array.isArray(raw.matched_topics) ? raw.matched_topics.filter(Boolean) : [],
        preview_quote: String(raw.preview_quote || "").trim(),
      };
    });
  }

  async function ensureFoldPlan(options) {
    const config = options || {};
    if (foldPlanPending) {
      return;
    }

    const payload = buildFoldPlanPayload();
    if (!payload) {
      return;
    }

    const saved = getBeyondRoleBucket("foldPlan", currentRole);
    const contentHash = `${currentRole}::${payload.document_content.length}::${payload.document_content.slice(0, 120)}`;
    if (saved && saved.contentHash === contentHash && Array.isArray(saved.sections) && saved.sections.length && !config.force) {
      return;
    }

    foldPlanPending = true;
    if (config.showLoadingMessage) {
      updateInlineAlert("正在为当前角色生成更精细的段落折叠方案…", "info");
    }

    try {
      const response = await fetch("/api/fold-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || "角色折叠分析失败");
      }

      const sections = getReviewSectionsSource();
      setBeyondRoleBucket("foldPlan", currentRole, {
        contentHash,
        role: currentRole,
        note: (data && data.note) || "",
        sections: normalizeFoldPlanResult(data, sections),
      });

      if (currentMode === "review") {
        renderReviewSurface();
      }
      if (config.showLoadingMessage) {
        updateInlineAlert("", "info");
      }
    } catch (error) {
      console.warn("Failed to load fold plan", error);
      if (config.showLoadingMessage) {
        updateInlineAlert(error.message || "角色折叠分析失败", "error");
      }
    } finally {
      foldPlanPending = false;
    }
  }

  function getBeyondRoleBucket(kind, role) {
    if (!currentState || !currentState.beyond) {
      return null;
    }
    const bucket = currentState.beyond[kind] || {};
    const key = String(role || "").trim().toLowerCase();
    return (bucket.byRole || {})[key] || null;
  }

  function setBeyondRoleBucket(kind, role, value) {
    if (!currentState) {
      return;
    }
    ensureBeyondState(currentState);
    const key = String(role || "").trim().toLowerCase();
    currentState.beyond[kind].byRole[key] = value;
    persistState(currentState);
  }

  function getGlobalRelationState() {
    ensureBeyondState(currentState);
    return currentState.beyond.relations;
  }

  function getConfirmedLinkedDocs() {
    const relationState = getGlobalRelationState();
    return Array.isArray(relationState.confirmedDocs) ? relationState.confirmedDocs : [];
  }

  function closeLinkedDocPopover() {
    linkedDocPopoverDoc = null;
    if (elements.linkedDocPopover) {
      elements.linkedDocPopover.hidden = true;
    }
  }

  async function openLinkedDocPopover(doc) {
    if (!doc || !doc.document_id || !elements.linkedDocPopover) {
      return;
    }

    elements.linkedDocPopover.hidden = false;
    elements.linkedDocPopoverTitle.textContent = doc.document_name || "关联文档";
    elements.linkedDocPopoverMeta.textContent = "正在加载文档内容…";
    elements.linkedDocPopoverContent.textContent = "";
    linkedDocPopoverDoc = doc;

    try {
      const response = await fetch(`/api/presets/${encodeURIComponent(doc.document_id)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "无法读取关联文档内容");
      }

      if (linkedDocPopoverDoc !== doc) {
        return;
      }

      elements.linkedDocPopoverTitle.textContent = data.document_name || doc.document_name || "关联文档";
      elements.linkedDocPopoverMeta.textContent = [
        doc.relation_type ? `关系：${doc.relation_type}` : "",
        doc.confidence ? `置信度：${doc.confidence}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      elements.linkedDocPopoverContent.textContent = data.content || "";
    } catch (error) {
      if (linkedDocPopoverDoc !== doc) {
        return;
      }
      elements.linkedDocPopoverMeta.textContent = error.message || "加载失败";
      elements.linkedDocPopoverContent.textContent = "";
    }
  }

  function renderLinkedDocStrip() {
    if (!elements.linkedDocStrip || !elements.linkedDocLinks) {
      return;
    }

    const linkedDocs = getConfirmedLinkedDocs();
    elements.linkedDocLinks.innerHTML = "";
    elements.linkedDocStrip.hidden = !linkedDocs.length;

    if (!linkedDocs.length) {
      closeLinkedDocPopover();
      return;
    }

    linkedDocs.forEach((doc) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "linked-doc-link";
      button.textContent = doc.document_name || "关联文档";
      button.addEventListener("click", () => {
        void openLinkedDocPopover(doc);
      });
      elements.linkedDocLinks.appendChild(button);
    });
  }

  function roleHasReviewContext(roleAnalysis, roleStage) {
    if (!roleAnalysis && !roleStage) {
      return false;
    }
    const hints = (roleAnalysis && roleAnalysis.view_hints) || {};
    return Boolean(
      (roleAnalysis && roleAnalysis.task) ||
        (roleAnalysis && roleAnalysis.review_summary) ||
        (Array.isArray(roleAnalysis && roleAnalysis.focus_points) && roleAnalysis.focus_points.length) ||
        (Array.isArray(hints.priority_topics) && hints.priority_topics.length) ||
        (Array.isArray(hints.review_keywords) && hints.review_keywords.length) ||
        (Array.isArray(roleStage && roleStage.watch_points) && roleStage.watch_points.length) ||
        (roleStage && roleStage.stage_goal),
    );
  }

  function persistCodeLabDraft() {
    if (!elements.codeLabInput || !currentRole || !roleRequiresCodeLab(currentRole)) {
      return;
    }
    const language = elements.codeLabLanguage ? elements.codeLabLanguage.value : "html";
    const code = elements.codeLabInput.value || "";
    const saved = getBeyondRoleBucket("codeLab", currentRole) || {};
    setBeyondRoleBucket("codeLab", currentRole, {
      ...saved,
      language,
      code,
      result: null,
    });
  }

  function renderCodeLabPanel() {
    if (!elements.codeLabPanel) {
      return;
    }

    const enabled = roleRequiresCodeLab(currentRole);
    elements.codeLabPanel.hidden = !enabled;
    if (!enabled) {
      return;
    }

    const saved = getBeyondRoleBucket("codeLab", currentRole) || {};
    const language = saved.language || "html";
    const code = saved.code || DEFAULT_CODE_SAMPLES[language] || DEFAULT_CODE_SAMPLES.html;

    elements.codeLabRoleBadge.textContent = currentRole || "当前角色";
    if (elements.codeLabLanguage) {
      elements.codeLabLanguage.value = language;
    }
    if (elements.codeLabInput && elements.codeLabInput.value !== code) {
      elements.codeLabInput.value = code;
    }
    renderCodeLabResult(saved.result || null);
    renderCodeLabPreview({ ...(saved.result || {}), language, code });
  }

  function renderCodeLabResult(result) {
    if (!elements.codeLabResult) {
      return;
    }
    if (!result) {
      elements.codeLabResult.innerHTML = '<p class="empty-inline-state">点击“运行代码”后在这里查看解释和伪运行结果。</p>';
      return;
    }

    const suggestions = (result.completion_suggestions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const notes = (result.run_notes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    elements.codeLabResult.innerHTML = `
      <div class="beyond-card-block">
        <p class="handoff-label">解释</p>
        <p>${escapeHtml(result.explanation || "")}</p>
      </div>
      <div class="beyond-card-block">
        <p class="handoff-label">补全建议</p>
        <ul class="topic-list">${suggestions || "<li>暂无</li>"}</ul>
      </div>
      <div class="beyond-card-block">
        <p class="handoff-label">伪运行说明</p>
        <ul class="topic-list">${notes || "<li>暂无</li>"}</ul>
      </div>
      <div class="beyond-card-block">
        <p class="handoff-label">运行结果</p>
        <p>${escapeHtml(result.pseudo_result || "")}</p>
      </div>
      ${result.browser_preview_hint ? `<p class="section-note">${escapeHtml(result.browser_preview_hint)}</p>` : ""}
    `;
  }

  function buildCodeLabSrcDoc(language, code) {
    const safeCode = String(code || "").replace(/<\/script/gi, "<\\/script");
    if (language === "html") {
      return safeCode || DEFAULT_CODE_SAMPLES.html;
    }
    if (language === "js") {
      return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; font-family: sans-serif; padding: 20px; background: #06131b; color: #f3f7f8; }
    #app { padding: 16px; border-radius: 16px; background: rgba(255,255,255,.06); min-height: 80px; }
    #console { margin-top: 14px; white-space: pre-wrap; color: #bdeae4; }
  </style>
</head>
<body>
  <div id="app"></div>
  <pre id="console"></pre>
  <script>
    (function () {
      const out = document.getElementById('console');
      const log = (...args) => {
        out.textContent += args.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ') + '\\n';
      };
      window.console = { log, info: log, warn: log, error: log };
      try {
        ${safeCode}
      } catch (error) {
        log('Error:', error && error.message ? error.message : String(error));
      }
    })();
  </script>
</body>
</html>`;
    }
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; font-family: sans-serif; padding: 20px; background: #06131b; color: #f3f7f8; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <pre>当前语言仅做解释与伪运行。</pre>
</body>
</html>`;
  }

  function renderCodeLabPreview(result) {
    if (!elements.codeLabPreview) {
      return;
    }
    if (!result || !["html", "js"].includes(result.language)) {
      elements.codeLabPreview.innerHTML = "";
      return;
    }
    const code = (result.code || "").trim();
    elements.codeLabPreview.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.className = "code-lab-iframe";
    iframe.title = "Code Lab Preview";
    iframe.sandbox = "allow-scripts allow-modals allow-forms";
    iframe.srcdoc = buildCodeLabSrcDoc(result.language || "html", code);
    elements.codeLabPreview.appendChild(iframe);
  }

  async function runCodeLab() {
    if (!elements.codeLabInput || !currentRole) {
      return;
    }
    const language = elements.codeLabLanguage ? elements.codeLabLanguage.value : "html";
    const code = elements.codeLabInput.value || "";
    const payload = {
      document_name: currentState.documentName || "未命名文档",
      document_summary: (((currentState || {}).analysis || {}).document_summary) || "",
      workflow: getWorkflow(currentState),
      current_role: currentRole,
      language,
      code,
      selection_text: "",
    };

    setInlineBusy(elements.codeLabRunButton, true, "运行中");
    try {
      const response = await fetch("/api/code-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await response.text();
      const result = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((result && result.error && result.error.message) || "代码实验失败");
      }

      if (result && result.code === undefined) {
        result.code = code;
      }
      if (["html", "js"].includes(language)) {
        result.language = language;
        result.runtime_mode = "browser";
      }
      setBeyondRoleBucket("codeLab", currentRole, { language, code, result });
      renderCodeLabResult(result);
      renderCodeLabPreview({ ...result, language, code });
      updateInlineAlert("代码实验结果已刷新。", "info");
    } catch (error) {
      updateInlineAlert(error.message || "代码实验失败。", "error");
    } finally {
      setInlineBusy(elements.codeLabRunButton, false, "运行代码");
    }
  }

  function setInlineBusy(button, busy, label) {
    if (!button) {
      return;
    }
    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.defaultLabel || label;
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = label;
    }
  }

  function renderVizPanel() {
    if (!elements.vizAssistPanel) {
      return;
    }
    const enabled = roleRequiresViz(currentRole);
    elements.vizAssistPanel.hidden = !enabled;
    if (!enabled) {
      const fallbackRole = getBestVizRole();
      if (fallbackRole && elements.vizPlaceholderNotice) {
        elements.vizPlaceholderNotice.textContent = `当前角色不展示数据面板，切换到 ${fallbackRole} / CEO / 运营 可查看默认图表。`;
      }
      return;
    }

    const saved = getBeyondRoleBucket("viz", currentRole) || {};
    const data = saved.result || DEFAULT_VIZ_PRESET;
    elements.vizPlaceholderNotice.textContent = data && data.placeholder_notice ? data.placeholder_notice : "当前未链接数据源，采取预置数据显示";
    renderVizTable(data);
    renderVizChartSummary(data);
    renderVizChartVisual(data);
  }

  function renderVizChartVisual(data) {
    if (!elements.vizChartVisual) {
      return;
    }

    const chartTitle = (data && data.chart_title) || DEFAULT_VIZ_PRESET.chart_title;
    const chartType = (data && data.preferred_chart_type) || "bar";
    const labels = ["产品", "工程", "数据", "CEO", "运营"];
    const values = [78, 54, 92, 66, 85];
    const bars = labels
      .map((label, index) => {
        const value = values[index] || 40;
        return `
          <div class="viz-mini-bar-row">
            <span class="viz-mini-bar-label">${escapeHtml(label)}</span>
            <div class="viz-mini-bar-track"><i style="width:${value}%"></i></div>
          </div>
        `;
      })
      .join("");

    elements.vizChartVisual.innerHTML = `
      <div class="viz-fixed-chart">
        <div class="viz-fixed-chart-head">
          <div>
            <p class="eyebrow">Preview</p>
            <h4>${escapeHtml(chartTitle)}</h4>
          </div>
          <span class="status-pill">${escapeHtml(chartType)}</span>
        </div>
        <div class="viz-fixed-chart-canvas">${bars}</div>
      </div>
    `;
  }

  function renderVizTable(data) {
    if (!elements.vizTable) {
      return;
    }
    if (!data) {
      elements.vizTable.innerHTML = '<p class="empty-inline-state">点击“链接数据源”后加载图表建议。</p>';
      return;
    }

    const headers = Array.isArray(data.table_headers) ? data.table_headers : [];
    const rows = Array.isArray(data.table_rows) ? data.table_rows : [];
    const headHtml = headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("");
    const bodyHtml = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
      .join("");
    elements.vizTable.innerHTML = `
      <div class="viz-table-wrap">
        <table class="viz-table">
          <thead><tr>${headHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    `;
  }

  function renderVizChartSummary(data) {
    if (!elements.vizChartSummary || !elements.vizChartHints) {
      return;
    }
    if (!data) {
      elements.vizChartSummary.textContent = "";
      elements.vizChartHints.innerHTML = "";
      return;
    }
    elements.vizChartSummary.textContent = data.summary || "";
    const hints = (data.chart_suggestions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    elements.vizChartHints.innerHTML = `<ul class="topic-list">${hints || "<li>暂无</li>"}</ul>`;
  }

  async function linkVizSource(file) {
    if (!file) {
      return;
    }
    const text = await file.text();
    const payload = {
      document_name: currentState.documentName || "未命名文档",
      document_summary: (((currentState || {}).analysis || {}).document_summary) || "",
      workflow: getWorkflow(currentState),
      current_role: currentRole,
      data_source_name: file.name,
      data_source_content: text,
      source_type: "upload",
    };

    setInlineBusy(elements.vizLinkSourceButton, true, "上传中");
    try {
      const response = await fetch("/api/viz-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || "数据可视化失败");
      }
      setBeyondRoleBucket("viz", currentRole, { result: data, sourceName: file.name, sourceContent: text });
      renderVizPanel();
      updateInlineAlert("数据源已链接。", "info");
    } catch (error) {
      updateInlineAlert(error.message || "数据源链接失败。", "error");
    } finally {
      setInlineBusy(elements.vizLinkSourceButton, false, "链接数据源");
    }
  }

  function renderRelationPanel() {
    if (!elements.relationPanel) {
      return;
    }
    elements.relationPanel.hidden = false;
    const saved = getBeyondRoleBucket("relations", currentRole) || {};
    const relationState = getGlobalRelationState();
    const data = saved.result || relationState.lastResult || null;
    const selectedPresetIds = Array.isArray(relationState.selectedPresetIds) ? relationState.selectedPresetIds : [];
    const presetDocs = Array.isArray(relationState.presetDocs) ? relationState.presetDocs : PRESET_RELATION_DOCS;
    const relationDocs = presetDocs.map((item) => ({
      ...item,
      selected: selectedPresetIds.includes(item.document_id),
    }));

    elements.relationOverview.textContent = data && data.overview ? data.overview : "从后台预置 md 中选择需要关联的文档，确认后生成 AI 关系说明与关系图。";
    elements.relationList.innerHTML = "";

    if (!relationDocs.length) {
      elements.relationList.innerHTML = '<p class="empty-inline-state">暂无预置文档可选。</p>';
      return;
    }

    relationDocs.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = `relation-card${item.selected ? " is-selected" : ""}`;
      card.innerHTML = `
        <div class="relation-card-head">
          <div>
            <p class="eyebrow">Preset ${String(index + 1).padStart(2, "0")}</p>
            <label class="relation-select-row">
              <input class="relation-select-checkbox" data-field="selected" type="checkbox" ${item.selected ? "checked" : ""} />
              <span>${escapeHtml(item.document_name || "")}</span>
            </label>
          </div>
          <span class="priority-pill priority-medium">preset</span>
        </div>
        <p class="section-note">${escapeHtml(item.summary || "")}</p>
      `;
      elements.relationList.appendChild(card);
    });
    renderRelationGraph(data, relationDocs);
  }

  function renderRelationGraph(data, relationDocs) {
    if (!elements.relationGraph) {
      return;
    }

    const aiRelations = Array.isArray(data && data.relations) ? data.relations : [];
    const selectedDocs = relationDocs.filter((item) => item.selected);
    const graphDocs = aiRelations.length
      ? aiRelations.map((item) => ({
          document_id: item.document_id,
          document_name: item.document_name,
          relation_type: item.relation_type,
          relation_description: item.relation_description,
          confidence: item.confidence,
          selected: true,
        }))
      : selectedDocs;

    if (!graphDocs.length) {
      elements.relationGraph.innerHTML = '<p class="empty-inline-state">确认关联后，这里会展示文档关系图与关系说明。</p>';
      return;
    }

    const nodeHtml = [
      `<div class="relation-graph-node is-current"><span>${escapeHtml(currentState.documentName || "当前文档")}</span></div>`,
      ...graphDocs.map(
        (item) => `
          <div class="relation-graph-node is-selected">
            <span>${escapeHtml(item.document_name || "")}</span>
            ${item.confidence ? `<small>${escapeHtml(item.confidence)}</small>` : ""}
          </div>
        `,
      ),
    ].join("");

    const edgeHtml = graphDocs
      .map(
        (item) => `
          <div class="relation-graph-edge">
            <span>${escapeHtml(item.relation_type || "关联")}</span>
            <i>→</i>
            <strong>${escapeHtml(item.document_name || "")}</strong>
            ${
              item.relation_description
                ? `<p class="relation-edge-note">${escapeHtml(item.relation_description)}</p>`
                : ""
            }
          </div>
        `,
      )
      .join("");

    const overviewText = data && data.editable_note ? data.editable_note : "确认后，关系图会展示当前文档与所选预置文档之间的关系。";
    elements.relationGraph.innerHTML = `
      <div class="relation-graph-overview">${escapeHtml(overviewText)}</div>
      <div class="relation-graph-line">${nodeHtml}</div>
      <div class="relation-graph-links relation-graph-links-detailed">${edgeHtml}</div>
    `;
  }

  function renderRelationPresetDocs() {
    if (!currentState || !currentState.beyond || !currentState.beyond.relations) {
      return;
    }
    const savedIds = Array.isArray(currentState.beyond.relations.selectedPresetIds)
      ? currentState.beyond.relations.selectedPresetIds
      : [];
    const nextDocs = (currentState.beyond.relations.presetDocs || PRESET_RELATION_DOCS).map((item) => ({
      ...item,
      selected: savedIds.includes(item.document_id),
    }));
    currentState.beyond.relations.presetDocs = nextDocs.map(({ selected, ...item }) => item);
    renderRelationPanel();
  }

  async function refreshRelations() {
    try {
      const response = await fetch("/api/presets");
      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || "预置文档加载失败");
      }
      const items = Array.isArray(data && data.items) ? data.items : [];
      const mapped = items.map((item) => ({
        document_id: item.id || item.document_id,
        document_name: item.document_name || `${item.title || item.id || "文档"}.md`,
        summary: item.description || item.preview || "",
        source_type: "preset",
      }));
      presetRelationDocs = mapped.length ? mapped : PRESET_RELATION_DOCS.slice();
      const relationState = getGlobalRelationState();
      relationState.presetDocs = presetRelationDocs.slice();
      if (!Array.isArray(relationState.selectedPresetIds)) {
        relationState.selectedPresetIds = [];
      }
      persistState(currentState);
      renderRelationPanel();
      updateInlineAlert("预置文档已加载。", "info");
    } catch (error) {
      updateInlineAlert(error.message || "预置文档加载失败。", "error");
    }
  }

  async function confirmRelations() {
    const cards = Array.from(elements.relationList.querySelectorAll(".relation-card"));
    const relationState = getGlobalRelationState();
    const selectedPresetIds = [];
    cards.forEach((card, index) => {
      const checkbox = card.querySelector(".relation-select-checkbox");
      const checked = Boolean(checkbox && checkbox.checked);
      const preset = presetRelationDocs[index];
      if (checked && preset && preset.document_id) {
        selectedPresetIds.push(preset.document_id);
      }
    });

    relationState.selectedPresetIds = selectedPresetIds;
    persistState(currentState);

    if (!selectedPresetIds.length) {
      renderRelationPanel();
      updateInlineAlert("请先至少选择一份关联文档。", "info");
      return;
    }

    const candidates = presetRelationDocs.filter((item) => selectedPresetIds.includes(item.document_id));
    const payload = {
      document_name: currentState.documentName || "未命名文档",
      document_summary: (((currentState || {}).analysis || {}).document_summary) || "",
      workflow: getWorkflow(currentState),
      current_role: currentRole || getWorkflow(currentState)[0] || "",
      candidates,
    };

    setInlineBusy(elements.relationConfirmButton, true, "生成中");
    try {
      const response = await fetch("/api/doc-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || "关联文档分析失败");
      }

      relationState.lastResult = data;
      relationState.confirmedDocs = (Array.isArray(data.relations) ? data.relations : []).map((item) => ({
        document_id: item.document_id,
        document_name: item.document_name,
        relation_type: item.relation_type,
        relation_description: item.relation_description,
        confidence: item.confidence,
      }));
      setBeyondRoleBucket("relations", currentRole, {
        result: data,
        selectedPresetIds: selectedPresetIds.slice(),
      });
      persistState(currentState);
      renderRelationPanel();
      renderLinkedDocStrip();
      updateInlineAlert("关联文档关系图已生成。", "info");
    } catch (error) {
      updateInlineAlert(error.message || "关联文档分析失败。", "error");
      renderRelationPanel();
    } finally {
      setInlineBusy(elements.relationConfirmButton, false, "确认关联");
    }
  }

  function renderLeftSummaryDrawer() {
    const roleAnalysis = getRoleAnalysis(currentRole);
    elements.leftSummaryText.textContent = ((((currentState || {}).analysis || {}).document_summary) || "");
    elements.leftSummaryFocusList.innerHTML = "";

    ((roleAnalysis && roleAnalysis.focus_points) || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      elements.leftSummaryFocusList.appendChild(li);
    });

    if (!elements.leftSummaryFocusList.children.length) {
      const li = document.createElement("li");
      li.textContent = "暂无";
      elements.leftSummaryFocusList.appendChild(li);
    }
  }

  function switchRole(role) {
    if (!role || sameRole(role, currentRole)) {
      return;
    }

    currentRole = role;
    if (currentState) {
      currentState.activeRole = role;
      persistState(currentState);
    }
    manuallyExpandedIndexes = new Set();
    closeLinkedDocPopover();
    renderRoleSwitcher(getWorkflow(currentState));
    renderRoleCards((((currentState || {}).analysis || {}).roles || []), (((currentState || {}).analysis || {}).role_flow || null));
    renderRoleSummaryPanel();
    renderLeftSummaryDrawer();
    renderLinkedDocStrip();
    renderCodeLabPanel();
    renderVizPanel();
    renderRelationPanel();
    renderReviewSurface();
    updateModeNote();
    void ensureFoldPlan({ showLoadingMessage: currentMode === "review" });
  }

  function confirmReviewAndAdvance() {
    if (!currentRole) {
      updateInlineAlert("请先选择一个角色再确认。", "info");
      return;
    }

    const nextRole = getNextWorkflowRole(currentRole);
    if (!nextRole) {
      updateInlineAlert("当前已经是最后一个角色。", "info");
      return;
    }

    switchRole(nextRole);
    if (currentState && currentState.analysis) {
      currentState.activeRole = nextRole;
      persistState(currentState);
    }
    updateInlineAlert(`已确认当前角色，自动切换到 ${nextRole}。`, "info");
  }

  function renderRoleSwitcher(workflow) {
    elements.roleSwitcher.innerHTML = "";
    if (!workflow.length) {
      renderEmptyState(elements.roleSwitcher, "暂无角色");
      return;
    }

    workflow.forEach((role) => {
      const button = document.createElement("button");
      button.className = `role-switch-button${sameRole(role, currentRole) ? " is-active" : ""}`;
      button.type = "button";
      button.textContent = role;
      button.dataset.role = role;
      button.addEventListener("click", () => switchRole(role));
      elements.roleSwitcher.appendChild(button);
    });
  }

  function renderRoleCards(roles, roleFlow) {
    elements.roleGrid.innerHTML = "";
    const stages = (roleFlow && roleFlow.stages) || [];
    if (!Array.isArray(roles) || !roles.length) {
      renderEmptyState(elements.roleGrid, "暂无岗位分析");
      return;
    }

    roles.forEach((roleItem, index) => {
      const stage = stages[index] || getRoleFlowStage(roleItem.role) || {};
      const card = document.createElement("article");
      card.className = `role-card${sameRole(roleItem.role, currentRole) ? " is-active" : ""}`;

      const focusHtml = (roleItem.focus_points || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      const watchHtml = (stage.watch_points || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      const priorityTopicsHtml = (((roleItem.view_hints || {}).priority_topics) || [])
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");

      card.innerHTML = `
        <div class="role-card-top">
          <div>
            <p class="eyebrow">Role ${String(index + 1).padStart(2, "0")}</p>
            <h3>${escapeHtml(roleItem.role)}</h3>
            <p class="role-card-kicker">${escapeHtml(stage.stage_goal || roleItem.brief_summary || "")}</p>
          </div>
          <button class="ghost-button role-card-action" type="button">切换到此角色</button>
        </div>
        <div class="role-card-grid">
          <div class="role-card-block">
            <p class="handoff-label">输入</p>
            <p>${escapeHtml(stage.stage_input || "待 AI 生成")}</p>
          </div>
          <div class="role-card-block">
            <p class="handoff-label">需要注意</p>
            <ul class="role-focus-list">${watchHtml || "<li>暂无</li>"}</ul>
          </div>
          <div class="role-card-block">
            <p class="handoff-label">输出 / 交付物</p>
            <p>${escapeHtml(stage.stage_output || stage.handoff_to_next || "待 AI 生成")}</p>
          </div>
        </div>
        <div class="role-card-body">
          <p><strong>岗位任务：</strong>${escapeHtml(roleItem.task || "")}</p>
          <p><strong>简短摘要：</strong>${escapeHtml(roleItem.brief_summary || "")}</p>
          <p class="handoff-label">重点关注</p>
          <ul class="role-focus-list">${focusHtml || "<li>暂无</li>"}</ul>
          <p class="handoff-label">建议优先查看</p>
          <ul class="topic-list">${priorityTopicsHtml || "<li>暂无</li>"}</ul>
          <p class="section-note">${escapeHtml(((roleItem.view_hints || {}).note) || "")}</p>
        </div>
      `;

      const roleCardHeading = card.querySelector(".role-card-top > div");
      if (roleCardHeading) {
        roleCardHeading.classList.add("role-card-heading");
      }
      const roleCardBody = card.querySelector(".role-card-body");
      if (roleCardBody) {
        const summaryLines = roleCardBody.querySelectorAll(":scope > p");
        if (summaryLines[0]) {
          summaryLines[0].classList.add("role-card-summary-line");
        }
        if (summaryLines[1]) {
          summaryLines[1].classList.add("role-card-summary-line");
        }
      }

      card.querySelector(".role-card-action").addEventListener("click", () => switchRole(roleItem.role));
      elements.roleGrid.appendChild(card);
    });
  }

  function splitDocumentIntoSections(content) {
    const normalizedContent = String(content || "").replace(/\r\n/g, "\n");
    const lines = normalizedContent.split("\n");
    const sections = [];
    let current = null;

    function pushCurrent() {
      if (!current) {
        return;
      }
      current.content = current.lines.join("\n").trim();
      if (current.content) {
        sections.push(current);
      }
    }

    lines.forEach((line, index) => {
      const isHeading = /^(#{1,3})\s+/.test(line.trim());
      if (isHeading) {
        pushCurrent();
        current = {
          id: `section-${sections.length + 1}-${index}`,
          heading: line.replace(/^#{1,3}\s+/, "").trim(),
          lines: [line],
        };
        return;
      }

      if (!current) {
        current = {
          id: `section-intro-${index}`,
          heading: "文档导语",
          lines: [],
        };
      }
      current.lines.push(line);
    });

    pushCurrent();
    return sections;
  }

  function sectionMatchesRole(section, roleAnalysis, roleStage) {
    const content = `${section.heading}\n${section.content}`.toLowerCase();
    const priorityTopics = ((((roleAnalysis || {}).view_hints || {}).priority_topics) || []).map(normalizeToken);
    const foldableTopics = ((((roleAnalysis || {}).view_hints || {}).foldable_topics) || []).map(normalizeToken);
    const reviewKeywords = ((((roleAnalysis || {}).view_hints || {}).review_keywords) || []).map(normalizeToken);
    const focusPoints = ((roleAnalysis || {}).focus_points || []).map(normalizeToken);
    const watchPoints = ((roleStage || {}).watch_points || []).map(normalizeToken);
    const candidates = [...priorityTopics, ...reviewKeywords, ...focusPoints, ...watchPoints].filter(Boolean);
    const foldables = new Set(foldableTopics.filter(Boolean));

    if (!candidates.length) {
      return section.heading === "文档导语";
    }
    if (candidates.some((keyword) => content.includes(keyword))) {
      return true;
    }
    return !Array.from(foldables).some((keyword) => keyword && content.includes(keyword));
  }

  function getFoldPlanForCurrentRole() {
    const saved = getBeyondRoleBucket("foldPlan", currentRole);
    return saved && Array.isArray(saved.sections) ? saved : null;
  }

  function buildReviewSections() {
    const roleAnalysis = getRoleAnalysis(currentRole);
    const roleStage = getRoleFlowStage(currentRole);
    const sections = splitDocumentIntoSections((currentState && currentState.documentContent) || "");
    const foldPlan = getFoldPlanForCurrentRole();
    const planMap = new Map(
      (((foldPlan || {}).sections) || []).map((item) => [Number(item.index), item]),
    );

    return sections.map((section, index) => {
      const planned = planMap.get(index);
      const matches = planned ? Boolean(planned.highlight || planned.relevance === "high" || planned.relevance === "medium") : sectionMatchesRole(section, roleAnalysis, roleStage);
      const relevance = planned && planned.relevance ? planned.relevance : matches ? "high" : "low";
      return {
        ...section,
        index,
        matches,
        relevance,
        reason: planned && planned.reason ? planned.reason : "",
        matched_topics: planned && Array.isArray(planned.matched_topics) ? planned.matched_topics : [],
        preview_quote: planned && planned.preview_quote ? planned.preview_quote : "",
        folded: planned ? Boolean(planned.should_fold) && !manuallyExpandedIndexes.has(index) : !matches && !manuallyExpandedIndexes.has(index),
      };
    });
  }

  function renderFoldedSummaryBar(sections) {
    const foldedCount = sections.filter((section) => section.folded).length;
    if (!foldedCount) {
      elements.foldedSummaryBar.hidden = true;
      elements.foldedSummaryBar.innerHTML = "";
      return;
    }

    elements.foldedSummaryBar.hidden = false;
    elements.foldedSummaryBar.innerHTML = `
      <button id="expand-folded-sections-button" class="folded-summary-button" type="button">
        [点击展开 ${escapeHtml(foldedCount)} 个折叠段落]
      </button>
    `;

    document.getElementById("expand-folded-sections-button").addEventListener("click", () => {
      sections
        .filter((section) => section.folded)
        .forEach((section) => manuallyExpandedIndexes.add(section.index));
      renderReviewSurface();
    });
  }

  function renderReviewSurface() {
    const sections = buildReviewSections();
    elements.reviewSurfaceTitle.textContent = `当前角色：${currentRole || "未选择"}`;
    elements.reviewContent.innerHTML = "";
    renderFoldedSummaryBar(sections);

    if (!sections.length) {
      renderEmptyState(elements.reviewContent, "暂无可审阅内容。");
      return;
    }

    sections.forEach((section) => {
      const block = document.createElement("article");
      block.className = [
        "review-section",
        section.matches ? "is-relevant" : "",
        section.folded ? "is-folded" : "",
      ]
        .filter(Boolean)
        .join(" ");

      if (section.folded) {
        block.innerHTML = `
          <div class="review-section-folded">
            <span class="review-section-heading">${escapeHtml(section.heading)}</span>
            <button class="folded-inline-button" type="button">展开此段</button>
          </div>
        `;
        block.querySelector(".folded-inline-button").addEventListener("click", () => {
          manuallyExpandedIndexes.add(section.index);
          renderReviewSurface();
        });
      } else {
        const matchedTopicsHtml = (section.matched_topics || [])
          .map((item) => `<span class="review-topic-chip">${escapeHtml(item)}</span>`)
          .join("");
        block.innerHTML = `
          <div class="review-section-marker"></div>
          <div class="review-section-main">
            <div class="review-section-head">
              <span class="review-section-heading">${escapeHtml(section.heading)}</span>
              ${section.matches ? '<span class="review-match-pill">当前角色重点</span>' : ""}
            </div>
            ${section.reason ? `<p class="review-section-reason">${escapeHtml(section.reason)}</p>` : ""}
            ${matchedTopicsHtml ? `<div class="review-topic-row">${matchedTopicsHtml}</div>` : ""}
            <pre class="review-section-content">${escapeHtml(section.content)}</pre>
          </div>
        `;
      }

      elements.reviewContent.appendChild(block);
    });
  }

  function createFallbackEditor(content) {
    elements.editorHost.classList.add("is-fallback");
    elements.editorHost.innerHTML = "";
    const textarea = document.createElement("textarea");
    textarea.className = "markdown-editor-fallback";
    textarea.value = content;
    textarea.addEventListener("input", (event) => {
      persistDocumentContent(event.target.value);
    });
    elements.editorHost.appendChild(textarea);
  }

  function initEditor(content) {
    const OT = window.OverType && (window.OverType.default || window.OverType);
    if (!OT) {
      throw new Error("OverType 未正确加载。");
    }

    elements.editorHost.classList.remove("is-fallback");
    elements.editorHost.innerHTML = "";
    const result = new OT("#markdown-editor", {
      value: content,
      toolbar: true,
      showStats: true,
      theme: "solar",
      padding: "28px",
      lineHeight: 1.75,
      fontSize: "15px",
      placeholder: "在这里编辑完整原文...",
      onChange: (value) => {
        persistDocumentContent(value);
      },
    });

    editorInstance = Array.isArray(result) ? (result[0] || null) : (result || null);
    if (Array.isArray(result)) {
      return editorInstance;
    }
    return editorInstance;
  }

  function initEditorSafely(content) {
    try {
      return initEditor(content);
    } catch (error) {
      console.error(error);
      createFallbackEditor(content);
      updateInlineAlert("富文本编辑器初始化失败，已切换为纯文本回退模式，其余角色审阅功能仍可使用。", "error");
      return null;
    }
  }

  function persistDocumentContent(value) {
    if (!currentState) {
      return;
    }

    currentState.documentContent = value;
    invalidateFoldPlans();
    persistState(currentState);
    updateVersionStatusText();

    if (currentMode === "review") {
      renderReviewSurface();
    }
  }

  function setEditorContent(value) {
    if (editorInstance && typeof editorInstance.setValue === "function") {
      editorInstance.setValue(value);
      return;
    }
    const fallback = elements.editorHost.querySelector("textarea");
    if (fallback) {
      fallback.value = value;
      fallback.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function generateSelectionId() {
    return `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getEditorSelectionElement() {
    const editable = elements.editorHost.querySelector(".overtype-input, textarea");
    if (!editable) {
      return null;
    }
    return editable;
  }

  function getSelectionCaretRect(textarea, position) {
    if (!textarea) {
      return null;
    }

    const textareaRect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    const properties = [
      "boxSizing",
      "width",
      "height",
      "overflowX",
      "overflowY",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "fontStyle",
      "fontVariant",
      "fontWeight",
      "fontStretch",
      "fontSize",
      "fontFamily",
      "lineHeight",
      "letterSpacing",
      "textIndent",
      "textTransform",
      "textAlign",
      "whiteSpace",
      "wordBreak",
      "overflowWrap",
      "tabSize",
    ];

    mirror.style.position = "fixed";
    mirror.style.top = `${textareaRect.top}px`;
    mirror.style.left = `${textareaRect.left}px`;
    mirror.style.visibility = "hidden";
    mirror.style.pointerEvents = "none";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflow = "auto";
    mirror.style.zIndex = "-1";
    mirror.style.width = `${textareaRect.width}px`;
    mirror.style.height = `${textareaRect.height}px`;
    mirror.style.background = "transparent";
    mirror.style.border = "0";
    mirror.style.margin = "0";

    properties.forEach((property) => {
      if (style[property] != null) {
        mirror.style[property] = style[property];
      }
    });

    mirror.textContent = (textarea.value || "").slice(0, position);

    const span = document.createElement("span");
    span.textContent = "\u200b";
    mirror.appendChild(span);
    document.body.appendChild(mirror);
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;

    const rect = span.getBoundingClientRect();
    document.body.removeChild(mirror);
    return rect;
  }

  function measureSelectionGeometry(selection) {
    const editable = getEditorSelectionElement();
    if (!editable || !selection) {
      return null;
    }

    return {
      ...selection,
      startRect: getSelectionCaretRect(editable, selection.start),
      endRect: getSelectionCaretRect(editable, selection.end),
    };
  }

  function getEditorSelection() {
    const editable = getEditorSelectionElement();
    if (!editable) {
      return null;
    }

    const start = typeof editable.selectionStart === "number" ? editable.selectionStart : 0;
    const end = typeof editable.selectionEnd === "number" ? editable.selectionEnd : 0;
    if (start === end) {
      return null;
    }

    const text = (editable.value || "").slice(start, end).trim();
    if (!text) {
      return null;
    }

    const startRect = getSelectionCaretRect(editable, start);
    const endRect = getSelectionCaretRect(editable, end);

    return {
      text,
      start,
      end,
      startRect,
      endRect,
    };
  }

  function showSelectionPopover(selection) {
    if (!selection || !elements.chatSelectionPopover) {
      return;
    }
    const measuredSelection = measureSelectionGeometry(selection);
    if (!measuredSelection) {
      hideSelectionPopover();
      return;
    }
    selectedChatContext = measuredSelection;

    if (selectionPopoverFrame) {
      window.cancelAnimationFrame(selectionPopoverFrame);
      selectionPopoverFrame = null;
    }

    elements.chatSelectionPopover.hidden = false;
    elements.chatSelectionPopover.style.visibility = "hidden";
    elements.chatSelectionPopover.dataset.placement = "top";

    selectionPopoverFrame = window.requestAnimationFrame(() => {
      const anchorRect = measuredSelection.endRect || measuredSelection.startRect;
      if (!anchorRect) {
        hideSelectionPopover();
        return;
      }

      const popoverRect = elements.chatSelectionPopover.getBoundingClientRect();
      const gap = 10;
      const minLeft = 16;
      const maxLeft = Math.max(16, window.innerWidth - popoverRect.width - 16);
      let left = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
      left = Math.min(maxLeft, Math.max(minLeft, left));

      let top = anchorRect.top - popoverRect.height - gap;
      let placement = "top";
      if (top < 16) {
        top = anchorRect.bottom + gap;
        placement = "bottom";
      }
      top = Math.min(Math.max(16, top), Math.max(16, window.innerHeight - popoverRect.height - 16));

      elements.chatSelectionPopover.style.left = `${left}px`;
      elements.chatSelectionPopover.style.top = `${top}px`;
      elements.chatSelectionPopover.style.setProperty(
        "--popover-arrow-left",
        `${Math.min(popoverRect.width - 22, Math.max(14, anchorRect.left + anchorRect.width / 2 - left))}px`,
      );
      elements.chatSelectionPopover.dataset.placement = placement;
      elements.chatSelectionPopover.style.visibility = "visible";
      selectionPopoverFrame = null;
    });
  }

  function hideSelectionPopover() {
    if (elements.chatSelectionPopover) {
      elements.chatSelectionPopover.hidden = true;
      elements.chatSelectionPopover.style.visibility = "";
    }
    if (selectionPopoverFrame) {
      window.cancelAnimationFrame(selectionPopoverFrame);
      selectionPopoverFrame = null;
    }
  }

  function addSelectionToChat() {
    if (!selectedChatContext) {
      return;
    }
    const context = {
      id: generateSelectionId(),
      label: "选中文本",
      text: selectedChatContext.text,
    };
    chatContexts = [...chatContexts, context];
    selectedChatContext = null;
    hideSelectionPopover();
    renderChatContexts();
    if (elements.chatInput) {
      elements.chatInput.focus();
    }
    updateInlineAlert("已把选中文本加入左侧对话区。", "info");
  }

  function renderChatContexts() {
    if (!elements.chatContextList) {
      return;
    }
    elements.chatContextList.innerHTML = "";
    if (!chatContexts.length) {
      renderEmptyState(elements.chatContextList, "还没有加入对话的片段");
      return;
    }
    chatContexts.forEach((item) => {
      const node = document.createElement("article");
      node.className = "chat-context-item";
      node.innerHTML = `
        <div class="chat-context-head">
          <strong>${escapeHtml(item.label)}</strong>
          <button class="ghost-button chat-context-remove" type="button">移除</button>
        </div>
        <p>${escapeHtml(item.text)}</p>
      `;
      node.querySelector(".chat-context-remove").addEventListener("click", () => {
        chatContexts = chatContexts.filter((entry) => entry.id !== item.id);
        renderChatContexts();
      });
      elements.chatContextList.appendChild(node);
    });
  }

  function renderChatMessages() {
    if (!elements.chatMessages) {
      return;
    }
    elements.chatMessages.innerHTML = "";
    if (!chatMessages.length) {
      renderEmptyState(elements.chatMessages, "在左侧输入问题开始对话");
      return;
    }

    chatMessages.forEach((message) => {
      const node = document.createElement("article");
      node.className = `chat-message chat-message-${message.role}`;
      node.innerHTML = `
        <span class="chat-message-role">${escapeHtml(message.role === "user" ? "你" : "AI")}</span>
        <p>${escapeHtml(message.content)}</p>
      `;
      elements.chatMessages.appendChild(node);
    });
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  function appendChatMessage(role, content) {
    chatMessages = [...chatMessages, { role, content }];
    renderChatMessages();
  }

  function buildChatPayload(userMessage) {
    return {
      document_name: currentState.documentName || "未命名文档",
      document_summary: (((currentState || {}).analysis || {}).document_summary) || "",
      workflow: getWorkflow(currentState),
      role_preset: elements.chatRolePreset ? elements.chatRolePreset.value : "专业产品经理",
      persona_note: elements.chatPersonaNote ? elements.chatPersonaNote.value.trim() : "",
      selected_contexts: chatContexts,
      messages: chatMessages.slice(-8),
      user_message: userMessage,
      current_role: currentRole || "",
    };
  }

  async function sendChatMessage() {
    if (chatRequestPending || !elements.chatInput) {
      return;
    }
    const userMessage = elements.chatInput.value.trim();
    if (!userMessage) {
      updateInlineAlert("请输入对话内容后再发送。", "info");
      return;
    }

    chatRequestPending = true;
    elements.chatSendButton.disabled = true;
    appendChatMessage("user", userMessage);
    elements.chatInput.value = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildChatPayload(userMessage)),
      });
      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || "对话请求失败");
      }
      appendChatMessage("assistant", data.assistant_message || "");
    } catch (error) {
      console.error("Chat request failed", error);
      updateInlineAlert(error.message || "对话发送失败，请稍后重试。", "error");
    } finally {
      chatRequestPending = false;
      elements.chatSendButton.disabled = false;
    }
  }

  function renderVersionTimeline() {
    const versions = (currentState && currentState.versions) || [];
    const target = elements.drawerPanelVersionTimeline.querySelector("#version-timeline-list");
    if (!target) {
      return;
    }
    target.innerHTML = "";

    if (!versions.length) {
      renderEmptyState(target, "暂无版本记录");
      return;
    }

    const ordered = [...versions].reverse();
    ordered.forEach((version) => {
      const item = document.createElement("article");
      const isCurrent = Number(version.version_number) === Number(getLatestVersion()?.version_number);
      item.className = `version-timeline-item${isCurrent ? " is-current" : ""}`;

      const decisionTrace = (version.decision_trace || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
      const keyChanges = (version.key_changes || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
      const affectedRoles = (version.affected_roles || [])
        .map((role) => `<span class="timeline-role-chip">${escapeHtml(role)}</span>`)
        .join("");
      const timestamp = version.timestamp ? new Date(version.timestamp).toLocaleString("zh-CN", { hour12: false }) : "";
      const previousVersion = (currentState.versions || []).find((item) => Number(item.version_number) === Number(version.version_number) - 1) || null;
      const delta = previousVersion ? buildVersionDelta(previousVersion.content || "", version.content || "") : null;
      const deltaHtml = delta
        ? `
          <div class="timeline-delta">
            <div class="timeline-delta-item">
              <span class="timeline-delta-label">新增</span>
              <strong>${escapeHtml(delta.addedCount)}</strong>
            </div>
            <div class="timeline-delta-item">
              <span class="timeline-delta-label">删除</span>
              <strong>${escapeHtml(delta.removedCount)}</strong>
            </div>
            ${delta.addedPreview.length ? `<p class="timeline-delta-preview"><strong>新增片段：</strong>${escapeHtml(delta.addedPreview.join(" / "))}</p>` : ""}
            ${delta.removedPreview.length ? `<p class="timeline-delta-preview"><strong>删除片段：</strong>${escapeHtml(delta.removedPreview.join(" / "))}</p>` : ""}
          </div>
        `
        : "";

      item.innerHTML = `
        <div class="version-timeline-head">
          <div>
            <p class="eyebrow">Version</p>
            <h3>V${escapeHtml(version.version_number)}${isCurrent ? " · 当前" : ""}</h3>
          </div>
          <span class="timeline-time">${escapeHtml(timestamp)}</span>
        </div>
        <p class="timeline-summary"><strong>更改摘要：</strong>${escapeHtml(version.change_summary || "")}</p>
        <p class="timeline-conclusion"><strong>自写结论：</strong>${escapeHtml(version.self_conclusion || "")}</p>
        ${deltaHtml}
        <div class="timeline-grid">
          <div class="timeline-block">
            <p class="handoff-label">决策溯源</p>
            <ul class="timeline-list">${decisionTrace || "<li>暂无</li>"}</ul>
          </div>
          <div class="timeline-block">
            <p class="handoff-label">关键变化</p>
            <ul class="timeline-list">${keyChanges || "<li>暂无</li>"}</ul>
          </div>
        </div>
        <div class="timeline-block">
          <p class="handoff-label">影响岗位</p>
          <div class="timeline-role-row">${affectedRoles || '<span class="timeline-role-chip">暂无</span>'}</div>
        </div>
        <button class="ghost-button restore-version-button" type="button">恢复到此版本</button>
      `;
      item.querySelector(".restore-version-button").addEventListener("click", () => {
        if (currentState && currentState.versionSummaryPending) {
          updateInlineAlert("版本结论正在生成，请稍后再恢复。", "info");
          return;
        }
        const confirmed = window.confirm(`确定恢复到 V${version.version_number} 吗？当前正文会被替换为该版本内容。`);
        if (!confirmed) {
          return;
        }
        currentState.documentContent = version.content || "";
        setEditorContent(currentState.documentContent);
        persistState(currentState);
        renderReviewSurface();
        updateVersionStatusText();
        updateInlineAlert(`已恢复到 V${version.version_number}。请重新确认更改以记录新版本。`, "info");
      });
      target.appendChild(item);
    });
  }

  async function confirmChangeVersion() {
    if (!currentState || currentState.versionSummaryPending) {
      return;
    }

    const latestVersion = getLatestVersion();
    const currentContent = getCurrentEditorContent();
    if (!latestVersion) {
      updateInlineAlert("当前缺少基线版本，无法记录变更。", "error");
      return;
    }
    if (currentContent === latestVersion.content) {
      updateInlineAlert("还没有新的正文修改，无需确认更改。", "info");
      updateVersionStatusText();
      return;
    }

    const nextVersionNumber = Number(latestVersion.version_number || currentState.versions.length) + 1;
    currentState.versionSummaryPending = true;
    persistState(currentState);
    updateVersionStatusText();
    updateInlineAlert("正在记录新版本并生成 AI 变更结论…", "info");

    try {
      const response = await fetch("/api/version-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildVersionSummaryPayload(latestVersion.content, currentContent, nextVersionNumber)),
      });

      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || "版本总结生成失败");
      }

      const versionRecord = {
        version_number: data.version_number || nextVersionNumber,
        timestamp: new Date().toISOString(),
        content: currentContent,
        change_summary: data.change_summary || "",
        self_conclusion: data.self_conclusion || "",
        decision_trace: Array.isArray(data.decision_trace) ? data.decision_trace : [],
        key_changes: Array.isArray(data.key_changes) ? data.key_changes : [],
        affected_roles: Array.isArray(data.affected_roles) ? data.affected_roles : [],
      };

      currentState.documentContent = currentContent;
      currentState.versionSummaryPending = false;
      currentState.versions = [...(currentState.versions || []), versionRecord];
      persistState(currentState);
      renderVersionTimeline();
      if (editorInstance && typeof editorInstance.setValue === "function") {
        editorInstance.setValue(currentContent);
      }
      openDrawer(elements.leftSummaryDrawer);
      switchLeftDrawerTab("version-timeline");
      updateVersionStatusText();
      updateInlineAlert(`V${versionRecord.version_number} 已记录，AI 变更结论已生成。`, "info");
    } catch (error) {
      console.error("Failed to summarize version", error);
      currentState.versionSummaryPending = false;
      persistState(currentState);
      updateVersionStatusText();
      updateInlineAlert(error.message || "版本总结生成失败，请稍后重试。", "error");
    }
  }

  function switchDrawerTab(target) {
    const isSchedule = target === "schedule";
    elements.drawerTabSchedule.classList.toggle("is-active", isSchedule);
    elements.drawerTabRoleSummary.classList.toggle("is-active", !isSchedule);
    elements.drawerPanelSchedule.hidden = !isSchedule;
    elements.drawerPanelRoleSummary.hidden = isSchedule;
  }

  function switchLeftDrawerTab(target) {
    const isSummary = target === "summary";
    elements.drawerTabLeftSummary.classList.toggle("is-active", isSummary);
    elements.drawerTabVersionTimeline.classList.toggle("is-active", !isSummary);
    elements.drawerPanelLeftSummary.hidden = !isSummary;
    elements.drawerPanelVersionTimeline.hidden = isSummary;
  }

  function syncBackdrop() {
    const anyOpen = [elements.leftSummaryDrawer, elements.taskDrawer].some((drawer) => drawer.classList.contains("is-open"));
    elements.drawerBackdrop.hidden = !anyOpen;
    document.body.classList.toggle("drawer-open", anyOpen);
  }

  function openDrawer(drawer) {
    if (activeDrawer && activeDrawer !== drawer) {
      closeDrawer(activeDrawer);
    }
    activeDrawer = drawer;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    syncBackdrop();
  }

  function closeDrawer(drawer) {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    if (activeDrawer === drawer) {
      activeDrawer = null;
    }
    syncBackdrop();
  }

  function closeAllDrawers() {
    closeDrawer(elements.leftSummaryDrawer);
    closeDrawer(elements.taskDrawer);
  }

  function setMode(mode) {
    currentMode = mode;
    const isReview = mode === "review";
    elements.modeEditButton.classList.toggle("is-active", !isReview);
    elements.modeReviewButton.classList.toggle("is-active", isReview);
    elements.editorHost.hidden = isReview;
    elements.reviewSurface.hidden = !isReview;
    elements.taskDrawerButton.classList.toggle("is-highlighted", isReview);
    if (elements.beyondTabs) {
      elements.beyondTabs.hidden = !isReview;
    }
    updateModeNote();

    if (isReview) {
      renderReviewSurface();
      renderCodeLabPanel();
      renderVizPanel();
      renderRelationPanel();
      void ensureFoldPlan({ showLoadingMessage: true });
    }
  }

  function bindEvents() {
    if (eventsBound) {
      return;
    }
    eventsBound = true;

    elements.leftSummaryButton.addEventListener("click", () => openDrawer(elements.leftSummaryDrawer));
    elements.closeLeftSummaryDrawer.addEventListener("click", () => closeDrawer(elements.leftSummaryDrawer));

    elements.taskDrawerButton.addEventListener("click", () => {
      openDrawer(elements.taskDrawer);
      elements.taskDrawerBadge.hidden = true;
    });
    elements.closeTaskDrawer.addEventListener("click", () => closeDrawer(elements.taskDrawer));
    elements.drawerBackdrop.addEventListener("click", closeAllDrawers);

    elements.drawerTabSchedule.addEventListener("click", () => switchDrawerTab("schedule"));
    elements.drawerTabRoleSummary.addEventListener("click", () => switchDrawerTab("role-summary"));
    elements.drawerTabLeftSummary.addEventListener("click", () => switchLeftDrawerTab("summary"));
    elements.drawerTabVersionTimeline.addEventListener("click", () => switchLeftDrawerTab("version-timeline"));
    if (elements.addSelectionToChatButton) {
      elements.addSelectionToChatButton.addEventListener("click", addSelectionToChat);
    }

    if (elements.editorAiAskButton) {
      elements.editorAiAskButton.addEventListener("click", () => {
        updateInlineAlert("左侧有问题？问AI 已预留，后续接入独立请求。", "info");
      });
    }
    if (elements.codeLabRunButton) {
      elements.codeLabRunButton.dataset.defaultLabel = "运行代码";
      elements.codeLabRunButton.addEventListener("click", () => {
        void runCodeLab();
      });
    }
    if (elements.codeLabFillSampleButton) {
      elements.codeLabFillSampleButton.addEventListener("click", () => {
        const language = elements.codeLabLanguage ? elements.codeLabLanguage.value : "html";
        if (elements.codeLabInput) {
          elements.codeLabInput.value = DEFAULT_CODE_SAMPLES[language] || DEFAULT_CODE_SAMPLES.html;
        }
        updateInlineAlert("已填充示例代码。", "info");
      });
    }
    if (elements.codeLabLanguage) {
      elements.codeLabLanguage.addEventListener("change", () => {
        const language = elements.codeLabLanguage.value;
        if (elements.codeLabInput && !elements.codeLabInput.value.trim()) {
          elements.codeLabInput.value = DEFAULT_CODE_SAMPLES[language] || DEFAULT_CODE_SAMPLES.html;
        }
        persistCodeLabDraft();
      });
    }
    if (elements.codeLabInput) {
      elements.codeLabInput.addEventListener("input", () => {
        persistCodeLabDraft();
      });
    }
    if (elements.vizLinkSourceButton) {
      elements.vizLinkSourceButton.dataset.defaultLabel = "链接数据源";
      elements.vizLinkSourceButton.addEventListener("click", () => {
        if (elements.vizSourceInput) {
          elements.vizSourceInput.click();
        }
      });
    }
    if (elements.vizSourceInput) {
      elements.vizSourceInput.addEventListener("change", (event) => {
        const file = event.target.files && event.target.files[0];
        if (file) {
          void linkVizSource(file);
        }
      });
    }
    if (elements.relationRefreshButton) {
      elements.relationRefreshButton.addEventListener("click", () => {
        void refreshRelations();
      });
    }
    if (elements.relationConfirmButton) {
      elements.relationConfirmButton.dataset.defaultLabel = "确认关联";
      elements.relationConfirmButton.addEventListener("click", () => {
        void confirmRelations();
      });
    }
    if (elements.closeLinkedDocPopover) {
      elements.closeLinkedDocPopover.addEventListener("click", closeLinkedDocPopover);
    }
    if (elements.linkedDocPopover) {
      elements.linkedDocPopover.addEventListener("click", (event) => {
        if (event.target === elements.linkedDocPopover) {
          closeLinkedDocPopover();
        }
      });
    }

    elements.modeEditButton.addEventListener("click", () => setMode("edit"));
    elements.modeReviewButton.addEventListener("click", () => setMode("review"));
    elements.confirmChangeButton.addEventListener("click", confirmChangeVersion);
    if (elements.chatForm) {
      elements.chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void sendChatMessage();
      });
    }
    if (elements.chatInput) {
      elements.chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void sendChatMessage();
        }
      });
    }

    document.addEventListener("mouseup", () => {
      window.setTimeout(() => {
        const selection = getEditorSelection();
        if (selection) {
          showSelectionPopover(selection);
        } else {
          hideSelectionPopover();
        }
      }, 0);
    });
    document.addEventListener("mousedown", (event) => {
      if (elements.chatSelectionPopover && elements.chatSelectionPopover.contains(event.target)) {
        return;
      }
      if (elements.chatSelectionPopover && event.target !== elements.chatSelectionPopover) {
        hideSelectionPopover();
      }
    });
    document.addEventListener("selectionchange", () => {
      if (!document.activeElement || !elements.editorHost.contains(document.activeElement)) {
        return;
      }
      const selection = getEditorSelection();
      if (selection) {
        showSelectionPopover(selection);
      }
    });

    elements.reviewExpandAllButton.addEventListener("click", () => {
      buildReviewSections().forEach((section) => manuallyExpandedIndexes.add(section.index));
      renderReviewSurface();
    });
    if (elements.reviewConfirmButton) {
      elements.reviewConfirmButton.addEventListener("click", confirmReviewAndAdvance);
    }

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAllDrawers();
        hideSelectionPopover();
        closeLinkedDocPopover();
      }
    });
    window.addEventListener("scroll", () => {
      if (selectedChatContext) {
        showSelectionPopover(selectedChatContext);
      }
    }, true);
    window.addEventListener("resize", () => {
      if (selectedChatContext) {
        showSelectionPopover(selectedChatContext);
      }
    });
  }

  function hydratePage(state) {
    currentState = ensureVersionState(state);
    ensureBeyondState(currentState);
    const workflow = getWorkflow(currentState);
    currentRole = currentState.activeRole || workflow[1] || workflow[0] || "";
    manuallyExpandedIndexes = new Set();
    closeLinkedDocPopover();

    elements.name.textContent = currentState.documentName || "未命名文档";
    elements.summary.textContent = (((currentState || {}).analysis || {}).document_summary) || "";

    renderWorkflowTags(workflow);
    renderRoleSwitcher(workflow);
    renderRoleCards((((currentState || {}).analysis || {}).roles || []), (((currentState || {}).analysis || {}).role_flow || null));
    renderTaskSchedule((((currentState || {}).analysis || {}).task_schedule || []), elements.taskScheduleList, {
      emptyMessage: "暂无任务安排",
    });
    renderRoleSummaryPanel();
    renderLeftSummaryDrawer();
    renderLinkedDocStrip();
    renderCodeLabPanel();
    renderVizPanel();
    renderRelationPanel();
    switchDrawerTab("schedule");
    switchLeftDrawerTab("summary");
    renderChatContexts();
    renderChatMessages();

    elements.taskDrawerBadge.hidden = !((((currentState || {}).analysis || {}).task_schedule || []).length);
    initEditorSafely(currentState.documentContent || "");
    renderReviewSurface();
    renderVersionTimeline();
    updateVersionStatusText();
    setMode("edit");
    persistState(currentState);
    void ensureReviewEnrichment({ showLoadingMessage: true });
    void refreshRelations();
    void ensureFoldPlan({ showLoadingMessage: false });
  }

  function init() {
    const state = loadState();
    if (!state || !state.analysis || !state.documentContent) {
      showGuardAndRedirect();
      return;
    }

    bindEvents();
    elements.guard.hidden = true;
    elements.main.hidden = false;
    hydratePage(state);
  }

  init();
})();
