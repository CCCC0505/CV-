(function () {
  const STORAGE_KEY = "fdoc-state";

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
    reviewContent: document.getElementById("review-content"),
    reviewSurfaceTitle: document.getElementById("review-surface-title"),
    foldedSummaryBar: document.getElementById("folded-summary-bar"),
    reviewExpandAllButton: document.getElementById("review-expand-all-button"),
    modeEditButton: document.getElementById("mode-edit-button"),
    modeReviewButton: document.getElementById("mode-review-button"),
    leftSummaryButton: document.getElementById("left-summary-button"),
    leftSummaryDrawer: document.getElementById("left-summary-drawer"),
    closeLeftSummaryDrawer: document.getElementById("close-left-summary-drawer"),
    leftSummaryText: document.getElementById("left-summary-text"),
    leftSummaryFocusList: document.getElementById("left-summary-focus-list"),
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

  let editorInstance = null;
  let currentState = null;
  let currentRole = "";
  let currentMode = "edit";
  let manuallyExpandedIndexes = new Set();
  let activeDrawer = null;
  let eventsBound = false;

  function loadState() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.warn("Failed to parse editor state", error);
      return null;
    }
  }

  function persistState(nextState) {
    currentState = nextState;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
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
    manuallyExpandedIndexes = new Set();
    renderRoleSwitcher(getWorkflow(currentState));
    renderRoleCards((((currentState || {}).analysis || {}).roles || []), (((currentState || {}).analysis || {}).role_flow || null));
    renderRoleSummaryPanel();
    renderLeftSummaryDrawer();
    renderReviewSurface();
    updateModeNote();
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
      card.dataset.role = roleItem.role;

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
          <button class="ghost-button role-card-action" type="button" data-role="${escapeHtml(roleItem.role)}">切换到此角色</button>
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

      const switchButton = card.querySelector(".role-card-action");
      switchButton.addEventListener("click", () => switchRole(roleItem.role));
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

  function buildReviewSections() {
    const roleAnalysis = getRoleAnalysis(currentRole);
    const roleStage = getRoleFlowStage(currentRole);
    const sections = splitDocumentIntoSections((currentState && currentState.documentContent) || "");

    return sections.map((section, index) => {
      const matches = sectionMatchesRole(section, roleAnalysis, roleStage);
      return {
        ...section,
        index,
        matches,
        folded: !matches && !manuallyExpandedIndexes.has(index),
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

    const button = document.getElementById("expand-folded-sections-button");
    button.addEventListener("click", () => {
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
        block.innerHTML = `
          <div class="review-section-marker"></div>
          <div class="review-section-main">
            <div class="review-section-head">
              <span class="review-section-heading">${escapeHtml(section.heading)}</span>
              ${section.matches ? '<span class="review-match-pill">当前角色重点</span>' : ""}
            </div>
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
    editorInstance = Array.isArray(result) ? result[0] : result;
  }

  function initEditorSafely(content) {
    try {
      initEditor(content);
      updateInlineAlert("", "info");
    } catch (error) {
      console.error(error);
      createFallbackEditor(content);
      updateInlineAlert("富文本编辑器初始化失败，已切换为纯文本回退模式，其余角色审阅功能仍可使用。", "error");
    }
  }

  function persistDocumentContent(value) {
    const stored = loadState();
    if (!stored) {
      return;
    }

    stored.documentContent = value;
    persistState(stored);

    if (currentMode === "review") {
      renderReviewSurface();
    }
  }

  function switchDrawerTab(target) {
    const isSchedule = target === "schedule";
    elements.drawerTabSchedule.classList.toggle("is-active", isSchedule);
    elements.drawerTabRoleSummary.classList.toggle("is-active", !isSchedule);
    elements.drawerPanelSchedule.hidden = !isSchedule;
    elements.drawerPanelRoleSummary.hidden = isSchedule;
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
    updateModeNote();

    if (isReview) {
      renderReviewSurface();
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

    elements.modeEditButton.addEventListener("click", () => setMode("edit"));
    elements.modeReviewButton.addEventListener("click", () => setMode("review"));

    elements.reviewExpandAllButton.addEventListener("click", () => {
      buildReviewSections().forEach((section) => {
        manuallyExpandedIndexes.add(section.index);
      });
      renderReviewSurface();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAllDrawers();
      }
    });
  }

  function hydratePage(state) {
    currentState = state;
    const workflow = getWorkflow(state);
    currentRole = workflow[1] || workflow[0] || "";
    manuallyExpandedIndexes = new Set();

    elements.name.textContent = state.documentName || "未命名文档";
    elements.summary.textContent = (((state || {}).analysis || {}).document_summary) || "";

    renderWorkflowTags(workflow);
    renderRoleSwitcher(workflow);
    renderRoleCards((((state || {}).analysis || {}).roles || []), (((state || {}).analysis || {}).role_flow || null));
    renderTaskSchedule((((state || {}).analysis || {}).task_schedule || []), elements.taskScheduleList, {
      emptyMessage: "暂无任务安排",
    });
    renderRoleSummaryPanel();
    renderLeftSummaryDrawer();
    switchDrawerTab("schedule");

    elements.taskDrawerBadge.hidden = !((((state || {}).analysis || {}).task_schedule || []).length);
    initEditorSafely(state.documentContent || "");
    renderReviewSurface();
    setMode("edit");
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
