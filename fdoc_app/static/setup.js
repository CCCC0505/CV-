(function () {
  const STORAGE_KEY = "fdoc-state";
  const MAX_DOCUMENT_CHARS = 5000;
  const DEFAULT_WORKFLOW = ["产品经理", "工程师", "数据分析员", "CEO"];
  const PRESET_ROLES = ["产品经理", "工程师", "数据分析员", "CEO", "设计师", "测试", "运营", "市场", "财务", "法务"];

  const state = {
    workflow: [...DEFAULT_WORKFLOW],
    documentName: "",
    documentContent: "",
    sourceType: "",
    analysis: null,
    presets: [],
    reviewEnrichPending: false,
    beyond: {},
  };

  const elements = {
    workflowDrawerToggle: document.getElementById("workflow-drawer-toggle"),
    workflowDrawer: document.getElementById("workflow-drawer"),
    workflowPreview: document.getElementById("selected-workflow-preview"),
    presetRoleSelector: document.getElementById("preset-role-selector"),
    workflowOrderList: document.getElementById("workflow-order-list"),
    customRoleInput: document.getElementById("custom-role-input"),
    addCustomRole: document.getElementById("add-custom-role"),
    applyCustomWorkflow: document.getElementById("apply-custom-workflow"),
    useDefaultWorkflow: document.getElementById("use-default-workflow"),
    uploadInput: document.getElementById("document-upload"),
    uploadFileMeta: document.getElementById("upload-file-meta"),
    documentMeta: document.getElementById("document-meta"),
    presetList: document.getElementById("preset-list"),
    refreshPresets: document.getElementById("refresh-presets"),
    analyzeButton: document.getElementById("analyze-button"),
    feedback: document.getElementById("analysis-feedback"),
    analysisResultSection: document.getElementById("analysis-result-section"),
    roleFlowGraph: document.getElementById("role-flow-graph"),
    enterEditorButton: document.getElementById("enter-editor-button"),
    qwenStatusPill: document.getElementById("qwen-status-pill"),
  };

  let selectedRoleSet = new Set(DEFAULT_WORKFLOW);

  function loadPersistedState() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.workflow) && parsed.workflow.length) {
        state.workflow = parsed.workflow;
        selectedRoleSet = new Set(parsed.workflow);
      }
      if (typeof parsed.documentName === "string") {
        state.documentName = parsed.documentName;
      }
      if (typeof parsed.documentContent === "string") {
        state.documentContent = parsed.documentContent;
      }
      if (typeof parsed.sourceType === "string") {
        state.sourceType = parsed.sourceType;
      }
      if (parsed.analysis) {
        state.analysis = parsed.analysis;
      }
      if (typeof parsed.reviewEnrichPending === "boolean") {
        state.reviewEnrichPending = parsed.reviewEnrichPending;
      }
      if (parsed.beyond && typeof parsed.beyond === "object") {
        state.beyond = parsed.beyond;
      }
    } catch (error) {
      console.warn("Failed to parse persisted FDoc state", error);
    }
  }

  function persistState() {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        workflow: state.workflow,
        documentName: state.documentName,
        documentContent: state.documentContent,
        sourceType: state.sourceType,
        analysis: state.analysis,
        reviewEnrichPending: state.reviewEnrichPending,
        beyond: state.beyond || {},
      }),
    );
  }

  function buildReviewEnrichPayload() {
    if (!state.analysis || !Array.isArray(state.analysis.roles) || !state.analysis.roles.length) {
      return null;
    }

    return {
      document_name: state.documentName,
      document_content: state.documentContent,
      workflow: state.workflow,
      source_type: state.sourceType,
      roles: state.analysis.roles.map((role) => ({
        role: role.role,
        task: role.task,
        focus_points: role.focus_points || [],
        brief_summary: role.brief_summary,
      })),
    };
  }

  function mergeReviewEnrichment(reviewData) {
    if (!state.analysis || !reviewData || !Array.isArray(reviewData.roles)) {
      return;
    }

    const byRole = new Map(
      reviewData.roles.map((item) => [String(item.role || "").trim().toLowerCase(), item]),
    );

    state.analysis.roles = (state.analysis.roles || []).map((role) => {
      const key = String(role.role || "").trim().toLowerCase();
      const review = byRole.get(key);
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
  }

  async function enrichReviewInBackground(options) {
    const config = options || {};
    const payload = buildReviewEnrichPayload();
    if (!payload || state.reviewEnrichPending) {
      return;
    }

    const hasExistingReview = (state.analysis.roles || []).every((role) => {
      const hints = role.view_hints || {};
      return (
        (role.review_summary && role.review_summary.trim()) ||
        (Array.isArray(role.review_checklist) && role.review_checklist.length) ||
        (Array.isArray(hints.priority_topics) && hints.priority_topics.length) ||
        (Array.isArray(hints.review_keywords) && hints.review_keywords.length)
      );
    });

    if (hasExistingReview && !config.force) {
      return;
    }

    state.reviewEnrichPending = true;
    persistState();

    try {
      const response = await fetch("/api/review-enrich", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : null;
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || "角色审阅增强失败");
      }

      mergeReviewEnrichment(data);
      state.reviewEnrichPending = false;
      persistState();

      if (config.notify) {
        setFeedback("基础分析完成，角色审阅信息也已补充。", "success");
      }
    } catch (error) {
      console.warn("Failed to enrich review data", error);
      state.reviewEnrichPending = false;
      persistState();

      if (config.notify) {
        setFeedback("基础分析已完成，角色审阅信息稍后可在编辑区继续加载。", "success");
      }
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setFeedback(message, kind) {
    elements.feedback.textContent = message || "";
    elements.feedback.classList.remove("is-error", "is-success");
    if (kind === "error") {
      elements.feedback.classList.add("is-error");
    } else if (kind === "success") {
      elements.feedback.classList.add("is-success");
    }
  }

  function renderWorkflowPreview() {
    elements.workflowPreview.innerHTML = "";
    if (!state.workflow.length) {
      elements.workflowPreview.innerHTML = '<span class="empty-inline-state">请先选择至少一个岗位</span>';
      return;
    }

    state.workflow.forEach((role) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = role;
      elements.workflowPreview.appendChild(tag);
    });
  }

  function moveWorkflowRole(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= state.workflow.length) {
      return;
    }
    const next = [...state.workflow];
    const moved = next.splice(fromIndex, 1)[0];
    next.splice(toIndex, 0, moved);
    state.workflow = next;
    renderWorkflowOrderList();
  }

  function removeWorkflowRole(role) {
    if (state.workflow.length <= 1) {
      return;
    }
    state.workflow = state.workflow.filter((item) => item !== role);
    selectedRoleSet.delete(role);
    renderRoleSelector();
    renderWorkflowOrderList();
  }

  function renderWorkflowOrderList() {
    elements.workflowOrderList.innerHTML = "";
    if (!state.workflow.length) {
      const empty = document.createElement("li");
      empty.className = "empty-inline-state";
      empty.textContent = "请至少保留一个岗位";
      elements.workflowOrderList.appendChild(empty);
      return;
    }

    state.workflow.forEach((role, index) => {
      const item = document.createElement("li");
      item.className = "workflow-order-item";

      const text = document.createElement("span");
      text.textContent = role;

      const upButton = document.createElement("button");
      upButton.className = "mini-button";
      upButton.type = "button";
      upButton.textContent = "↑";
      upButton.disabled = index === 0;
      upButton.addEventListener("click", () => moveWorkflowRole(index, index - 1));

      const downButton = document.createElement("button");
      downButton.className = "mini-button";
      downButton.type = "button";
      downButton.textContent = "↓";
      downButton.disabled = index === state.workflow.length - 1;
      downButton.addEventListener("click", () => moveWorkflowRole(index, index + 1));

      const removeButton = document.createElement("button");
      removeButton.className = "mini-button";
      removeButton.type = "button";
      removeButton.textContent = "×";
      removeButton.disabled = state.workflow.length === 1;
      removeButton.addEventListener("click", () => removeWorkflowRole(role));

      item.append(text, upButton, downButton, removeButton);
      elements.workflowOrderList.appendChild(item);
    });
  }

  function renderRoleSelector() {
    elements.presetRoleSelector.innerHTML = "";
    PRESET_ROLES.forEach((role) => {
      const label = document.createElement("label");
      label.className = "role-check";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selectedRoleSet.has(role);
      input.addEventListener("change", () => {
        if (input.checked) {
          selectedRoleSet.add(role);
          if (!state.workflow.includes(role)) {
            state.workflow.push(role);
          }
        } else {
          selectedRoleSet.delete(role);
          state.workflow = state.workflow.filter((item) => item !== role);
        }
        renderWorkflowOrderList();
      });

      const text = document.createElement("span");
      text.textContent = role;

      label.append(input, text);
      elements.presetRoleSelector.appendChild(label);
    });
  }

  function applyWorkflowConfiguration() {
    state.workflow = state.workflow.filter((role, index, array) => role && array.indexOf(role) === index);
    renderWorkflowPreview();
    persistState();
    setFeedback("已更新工作流配置。", "success");
  }

  function useDefaultWorkflow() {
    state.workflow = [...DEFAULT_WORKFLOW];
    selectedRoleSet = new Set(DEFAULT_WORKFLOW);
    renderRoleSelector();
    renderWorkflowOrderList();
    applyWorkflowConfiguration();
  }

  function addCustomRole() {
    const rawValue = elements.customRoleInput.value.trim();
    if (!rawValue) {
      setFeedback("请输入自定义岗位名称。", "error");
      return;
    }
    if (state.workflow.includes(rawValue)) {
      setFeedback("该岗位已经在当前工作流中。", "error");
      return;
    }
    state.workflow.push(rawValue);
    selectedRoleSet.add(rawValue);
    elements.customRoleInput.value = "";
    renderWorkflowOrderList();
    renderRoleSelector();
    setFeedback("已添加自定义岗位，请点击“应用当前配置”保存。", "success");
  }

  function updateDocumentMeta() {
    if (!state.documentName || !state.documentContent) {
      elements.documentMeta.textContent = "尚未选择文档";
      elements.documentMeta.classList.add("empty-state");
      return;
    }

    elements.documentMeta.classList.remove("empty-state");
    const preview = state.documentContent.trim().slice(0, 220);
    elements.documentMeta.innerHTML = [
      `<strong>${escapeHtml(state.documentName)}</strong>`,
      `来源：${escapeHtml(state.sourceType || "未知")}`,
      `字符数：${state.documentContent.length}`,
      `预览：${escapeHtml(preview)}${state.documentContent.length > 220 ? "..." : ""}`,
    ].join("<br>");
  }

  function updateUploadMeta(fileName, fileSize) {
    elements.uploadFileMeta.textContent = fileName
      ? `已上传：${fileName}（${Math.round(fileSize / 1024)} KB）`
      : "";
  }

  function updateAnalyzeButtonState() {
    const ready =
      state.workflow.length > 0 &&
      state.documentContent.trim().length > 0 &&
      state.documentContent.length <= MAX_DOCUMENT_CHARS;
    elements.analyzeButton.disabled = !ready;
  }

  function isDocumentTooLarge(content) {
    return String(content || "").length > MAX_DOCUMENT_CHARS;
  }

  function resetAnalysis() {
    state.analysis = null;
    state.reviewEnrichPending = false;
    persistState();
    elements.analysisResultSection.hidden = true;
    elements.roleFlowGraph.innerHTML = "";
  }

  async function loadPresets() {
    elements.presetList.innerHTML = '<p class="empty-inline-state">正在加载预置文档...</p>';
    try {
      const response = await fetch("/api/presets");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "加载失败");
      }
      state.presets = Array.isArray(data.items) ? data.items : [];
      renderPresetList();
    } catch (error) {
      elements.presetList.innerHTML = `<p class="empty-inline-state">预置文档加载失败：${escapeHtml(error.message)}</p>`;
    }
  }

  function renderPresetList() {
    if (!state.presets.length) {
      elements.presetList.innerHTML = '<p class="empty-inline-state">暂无预置文档</p>';
      return;
    }
    elements.presetList.innerHTML = "";
    state.presets.forEach((preset) => {
      const card = document.createElement("article");
      const isSelected = state.sourceType === "preset" && state.documentName === preset.document_name;
      card.className = `preset-item${isSelected ? " is-selected" : ""}`;
      const badges = [
        preset.category ? `<span class="preset-badge">${escapeHtml(preset.category)}</span>` : "",
        preset.difficulty ? `<span class="preset-badge preset-badge-strong">${escapeHtml(preset.difficulty)}</span>` : "",
      ]
        .filter(Boolean)
        .join("");
      const meta = [
        Number.isFinite(preset.char_count) ? `${preset.char_count} 字` : "",
        Number.isFinite(preset.section_count) ? `${preset.section_count} 个一级章节` : "",
      ]
        .filter(Boolean)
        .map((item) => `<span>${escapeHtml(item)}</span>`)
        .join("");
      const tags = Array.isArray(preset.tags)
        ? preset.tags.map((tag) => `<span class="preset-chip">${escapeHtml(tag)}</span>`).join("")
        : "";
      const highlights = Array.isArray(preset.highlights)
        ? preset.highlights.map((item) => `<span class="preset-highlight-chip">${escapeHtml(item)}</span>`).join("")
        : "";
      const recommendedWorkflow =
        Array.isArray(preset.recommended_workflow) && preset.recommended_workflow.length
          ? preset.recommended_workflow.map((role) => escapeHtml(role)).join(" → ")
          : "";
      card.innerHTML = `
        <div class="preset-item-top">
          <div class="preset-item-head">
            <div class="preset-badge-row">${badges}</div>
            <h4>${escapeHtml(preset.title)}</h4>
          </div>
        </div>
        <p class="preset-description">${escapeHtml(preset.description)}</p>
        <div class="preset-meta-row">${meta}</div>
        ${
          recommendedWorkflow
            ? `<p class="preset-workflow-line"><span class="preset-label">推荐流转</span>${recommendedWorkflow}</p>`
            : ""
        }
        ${tags ? `<div class="preset-chip-list">${tags}</div>` : ""}
        ${
          highlights
            ? `<div class="preset-highlight-block"><p class="preset-label">包含重点</p><div class="preset-highlight-list">${highlights}</div></div>`
            : ""
        }
        <p class="section-note preset-preview">${escapeHtml(preset.preview || "")}</p>
      `;
      const action = document.createElement("button");
      action.className = "ghost-button";
      action.type = "button";
      action.textContent = isSelected ? "当前已选中" : "选择预置文档";
      action.disabled = isSelected;
      if (!isSelected) {
        action.addEventListener("click", () => choosePreset(preset.id));
      }
      const actionWrap = document.createElement("div");
      actionWrap.className = "preset-item-action";
      actionWrap.appendChild(action);
      card.appendChild(actionWrap);
      elements.presetList.appendChild(card);
    });
  }

  async function choosePreset(presetId) {
    try {
      const response = await fetch(`/api/presets/${encodeURIComponent(presetId)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "无法读取预置文档");
      }
      if (isDocumentTooLarge(data.content)) {
        throw new Error(`当前版本暂不支持超过 ${MAX_DOCUMENT_CHARS} 字符的文档，请选择更短的预置文档。`);
      }
      state.documentName = data.document_name;
      state.documentContent = data.content;
      state.sourceType = "preset";
      resetAnalysis();
      updateUploadMeta("", 0);
      updateDocumentMeta();
      updateAnalyzeButtonState();
      persistState();
      renderPresetList();
      setFeedback(`已选择预置文档：${data.title}`, "success");
    } catch (error) {
      setFeedback(error.message, "error");
    }
  }

  function handleUploadChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".md") && !lowerName.endsWith(".txt")) {
      event.target.value = "";
      setFeedback("当前只支持 .md 或 .txt 文件。", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = function onLoad(loadEvent) {
      const content = String(loadEvent.target && loadEvent.target.result ? loadEvent.target.result : "");
      if (isDocumentTooLarge(content)) {
        event.target.value = "";
        resetAnalysis();
        state.documentName = "";
        state.documentContent = "";
        state.sourceType = "";
        updateUploadMeta("", 0);
        updateDocumentMeta();
        updateAnalyzeButtonState();
        persistState();
        setFeedback(`当前版本暂不支持超过 ${MAX_DOCUMENT_CHARS} 字符的文档，请先精简内容后再分析。`, "error");
        return;
      }
      state.documentName = file.name;
      state.documentContent = content;
      state.sourceType = "upload";
      resetAnalysis();
      updateUploadMeta(file.name, file.size);
      updateDocumentMeta();
      updateAnalyzeButtonState();
      persistState();
      renderPresetList();
      setFeedback(`已读取文件：${file.name}`, "success");
    };
    reader.onerror = function onError() {
      setFeedback("读取文件失败，请重试。", "error");
    };
    reader.readAsText(file, "utf-8");
  }

  function renderRoleFlowGraph(roleFlow) {
    elements.roleFlowGraph.innerHTML = "";
    if (!roleFlow || !Array.isArray(roleFlow.stages) || !roleFlow.stages.length) {
      elements.roleFlowGraph.innerHTML = '<p class="empty-inline-state">暂未生成岗位流转图。</p>';
      return;
    }

    const board = document.createElement("div");
    board.className = "role-flow-board";

    const intro = document.createElement("div");
    intro.className = "role-flow-board-intro";
    intro.innerHTML = `
      <p class="eyebrow">Flow Overview</p>
      <h3>${escapeHtml(roleFlow.title || "岗位流转图")}</h3>
      <p class="section-note">页面右侧采用“泳道 + 展开卡片”的方式展示每个岗位的输入、注意事项与交付物，便于后续继续打磨成你给的那种流程表效果。</p>
    `;
    board.appendChild(intro);

    const lanes = document.createElement("div");
    lanes.className = "role-flow-lanes";

    roleFlow.stages.forEach((stage, index) => {
      const lane = document.createElement("article");
      lane.className = "role-flow-lane";
      const watchPoints = (stage.watch_points || [])
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");
      lane.innerHTML = `
        <div class="role-flow-lane-step">${String(index + 1).padStart(2, "0")}</div>
        <div class="role-flow-lane-main">
          <div class="role-flow-lane-head">
            <div>
              <p class="eyebrow">岗位</p>
              <h4>${escapeHtml(stage.role)}</h4>
            </div>
            <p class="role-flow-stage-goal">${escapeHtml(stage.stage_goal || "")}</p>
          </div>
          <div class="role-flow-lane-grid">
            <div class="role-flow-lane-block">
              <p class="handoff-label">输入</p>
              <p>${escapeHtml(stage.stage_input || "待 AI 生成")}</p>
            </div>
            <div class="role-flow-lane-block">
              <p class="handoff-label">需要注意</p>
              <ul class="topic-list compact-topic-list">${watchPoints || "<li>暂无</li>"}</ul>
            </div>
            <div class="role-flow-lane-block">
              <p class="handoff-label">输出 / 交付物</p>
              <p>${escapeHtml(stage.stage_output || stage.handoff_to_next || "待 AI 生成")}</p>
            </div>
          </div>
          ${
            index < roleFlow.stages.length - 1
              ? `
                <div class="role-flow-handoff-bar">
                  <span class="role-flow-handoff-label">交接给下一岗位</span>
                  <p>${escapeHtml(stage.handoff_to_next || "")}</p>
                </div>
              `
              : `
                <div class="role-flow-handoff-bar is-terminal">
                  <span class="role-flow-handoff-label">流程完成</span>
                  <p>${escapeHtml(stage.handoff_to_next || "流程结束，准备进入编辑区。")}</p>
                </div>
              `
          }
        </div>
      `;
      lanes.appendChild(lane);
    });

    board.appendChild(lanes);
    elements.roleFlowGraph.appendChild(board);
  }

  async function analyzeDocument() {
    if (elements.analyzeButton.disabled) {
      return;
    }

    if (isDocumentTooLarge(state.documentContent)) {
      setFeedback(`当前版本暂不支持超过 ${MAX_DOCUMENT_CHARS} 字符的文档，请先精简内容后再分析。`, "error");
      updateAnalyzeButtonState();
      return;
    }

    setFeedback("正在请求千问生成岗位流转图，请稍候…");
    elements.analyzeButton.disabled = true;
    elements.analyzeButton.textContent = "分析中...";

    try {
      const payload = {
        document_name: state.documentName,
        document_content: state.documentContent,
        workflow: state.workflow,
        source_type: state.sourceType,
      };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let data = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch (parseError) {
        throw new Error("分析服务返回了非 JSON 响应，请查看后端日志。");
      }

      if (!response.ok) {
        throw new Error((data.error && data.error.message) || "分析失败");
      }

      state.analysis = data;
      state.reviewEnrichPending = true;
      persistState();
      renderRoleFlowGraph(data.role_flow);
      elements.analysisResultSection.hidden = false;
      setFeedback("分析完成，岗位流转图已生成。", "success");
      void enrichReviewInBackground({ notify: false, force: true });
    } catch (error) {
      resetAnalysis();
      setFeedback(error.message || "分析失败，请稍后再试。", "error");
    } finally {
      elements.analyzeButton.textContent = "开始分析";
      updateAnalyzeButtonState();
    }
  }

  function goToEditor() {
    if (!state.analysis) {
      setFeedback("请先完成分析。", "error");
      return;
    }
    persistState();
    window.location.href = "/editor";
  }

  async function checkHealth() {
    try {
      const response = await fetch("/api/health");
      const data = await response.json();
      if (data.qwen_configured) {
        elements.qwenStatusPill.textContent = "Qwen 已连接";
        elements.qwenStatusPill.classList.add("ready");
      } else {
        elements.qwenStatusPill.textContent = "未配置 Key";
        elements.qwenStatusPill.classList.add("offline");
      }
    } catch (error) {
      elements.qwenStatusPill.textContent = "服务不可用";
      elements.qwenStatusPill.classList.add("offline");
    }
  }

  function restoreAnalysisFromState() {
    if (!state.analysis) {
      return;
    }
    renderRoleFlowGraph(state.analysis.role_flow);
    elements.analysisResultSection.hidden = false;
    if (state.reviewEnrichPending) {
      void enrichReviewInBackground({ notify: false });
    }
  }

  function toggleWorkflowDrawer() {
    const expanded = elements.workflowDrawerToggle.getAttribute("aria-expanded") === "true";
    elements.workflowDrawerToggle.setAttribute("aria-expanded", String(!expanded));
    elements.workflowDrawer.hidden = expanded;
  }

  function bindEvents() {
    elements.workflowDrawerToggle.addEventListener("click", toggleWorkflowDrawer);
    elements.useDefaultWorkflow.addEventListener("click", useDefaultWorkflow);
    elements.applyCustomWorkflow.addEventListener("click", applyWorkflowConfiguration);
    elements.addCustomRole.addEventListener("click", addCustomRole);
    elements.customRoleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCustomRole();
      }
    });
    elements.uploadInput.addEventListener("change", handleUploadChange);
    elements.refreshPresets.addEventListener("click", loadPresets);
    elements.analyzeButton.addEventListener("click", analyzeDocument);
    elements.enterEditorButton.addEventListener("click", goToEditor);
  }

  function init() {
    loadPersistedState();
    renderRoleSelector();
    renderWorkflowOrderList();
    renderWorkflowPreview();
    updateDocumentMeta();
    updateAnalyzeButtonState();
    restoreAnalysisFromState();
    bindEvents();
    loadPresets();
    checkHealth();
  }

  init();
})();
