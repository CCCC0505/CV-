(function () {
  const OT = window.OverType && (window.OverType.default || window.OverType);
  if (!OT) {
    return;
  }

  const samples = {
    main: [
      "# Weekly product document",
      "",
      "This source markdown stays **complete** inside FDoc.",
      "",
      "## Workflow",
      "- Product Manager",
      "- Engineer",
      "- Data Analyst",
      "- CEO",
      "",
      "## Notes",
      "Original decisions, context, and details remain visible.",
    ].join("\n"),
    toolbar: [
      "# Workflow-ready editing",
      "",
      "Use the editor for the **full original document**.",
      "",
      "## Around the editor",
      "- AI role handoff graph",
      "- task schedule drawer",
      "- role-specific focus hints",
      "",
      "> The workflow lives around the document, not inside it.",
    ].join("\n"),
  };

  new OT("#legacy-home-editor-main", {
    value: samples.main,
    theme: "cave",
    padding: "18px",
    lineHeight: 1.7,
    fontSize: "14px",
    showStats: false,
  });

  new OT("#legacy-home-editor-toolbar", {
    value: samples.toolbar,
    theme: "cave",
    padding: "18px",
    lineHeight: 1.7,
    fontSize: "14px",
    toolbar: true,
    showStats: false,
  });
})();
