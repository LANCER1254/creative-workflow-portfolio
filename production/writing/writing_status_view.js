import { findWritingAssetEntry, findWritingPlotContent } from "./writing_asset_links.js";

export const SCENARIO_LABEL = "シナリオ";
export const WRITING_STAGE_UNSET = "__writing_stage_unset__";
const WRITING_IN_PROGRESS_STAGES = new Set(["初稿執筆中", "推敲・改稿"]);
const REVIEW_OR_CONFIRMATION_STAGES = new Set(["校正・校閲待ち", "実装確認"]);

export function isScenarioIssue(item) {
  return Number.isInteger(item?.issueNumber) && Array.isArray(item.labels) && item.labels.some((label) => label === SCENARIO_LABEL);
}

export function writingStageValue(item) {
  return item?.writingStage || WRITING_STAGE_UNSET;
}

export function writingStageLabel(stage) {
  return stage === WRITING_STAGE_UNSET ? "執筆工程未設定" : stage;
}

// The export records GitHub Projects' Single Select option order.  Older exports
// do not have it, so their encountered values are kept in input order.
export function writingStageOrder(metadata, items) {
  const configured = metadata?.source?.writing_stage_options;
  const order = Array.isArray(configured) ? configured.filter((value) => typeof value === "string" && value.trim()) : [];
  items.forEach((item) => {
    const stage = writingStageValue(item);
    if (stage !== WRITING_STAGE_UNSET && !order.includes(stage)) order.push(stage);
  });
  if (items.some((item) => writingStageValue(item) === WRITING_STAGE_UNSET)) order.push(WRITING_STAGE_UNSET);
  return [...new Set(order)];
}

export function scenarioWritingItems(items) {
  return items.filter(isScenarioIssue);
}

export function registeredWritingItems(items, manifestEntries) {
  if (!Array.isArray(manifestEntries)) return [];
  return scenarioWritingItems(items).filter((item) => findWritingAssetEntry(manifestEntries, item));
}

export function filterByWritingStage(items, stage) {
  return !stage || stage === "all" ? items : items.filter((item) => writingStageValue(item) === stage);
}

export function stageCounts(items, order) {
  const counts = new Map(order.map((stage) => [stage, 0]));
  items.forEach((item) => {
    const stage = writingStageValue(item);
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  });
  return counts;
}

// These are exact GitHub Projects Single Select names; unknown future stages are not inferred.
export function writingSummary(items) {
  return {
    total: items.length,
    drafted: items.filter((item) => writingStageValue(item) === "脱稿").length,
    writing: items.filter((item) => WRITING_IN_PROGRESS_STAGES.has(writingStageValue(item))).length,
    review: items.filter((item) => REVIEW_OR_CONFIRMATION_STAGES.has(writingStageValue(item))).length,
    deadlineUnset: items.filter((item) => !item.deadline).length
  };
}

export function renderWritingSummary(items, container) {
  const summary = writingSummary(items);
  const cards = [
    ["シナリオIssue総数", summary.total, "全工程のシナリオIssue", "total"],
    ["脱稿", summary.drafted, "執筆工程: 脱稿", "drafted"],
    ["執筆中", summary.writing, "初稿執筆中・推敲・改稿", "writing"],
    ["校正・確認待ち", summary.review, "校正・校閲待ち・実装確認", "review"],
    ["締切未設定", summary.deadlineUnset, "締切日が未設定", "deadline"]
  ];
  container.replaceChildren();
  cards.forEach(([label, value, detail, kind]) => {
    const card = document.createElement("section");
    card.className = `writing-summary-card writing-summary-${kind}`;
    const heading = document.createElement("h3");
    heading.textContent = label;
    const count = document.createElement("strong");
    count.textContent = `${value}件`;
    const description = document.createElement("p");
    description.textContent = detail;
    card.append(heading, count, description);
    container.append(card);
  });
}

function appendText(element, className, value) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = value;
  element.append(node);
}

function displayPath(descriptor) {
  return descriptor?.path || "未登録";
}

function verificationDescription(value) {
  return {
    human_verified: "確認済み",
    needs_review: "要確認：資料候補があります",
    unverified: "未確認：ローカル資料の対応付けがありません"
  }[value] ?? "未確認：対応情報を確定できません";
}

function verificationDisplay(value) {
  return {
    human_verified: "✅ 確認済み",
    needs_review: "⚠️ 要確認",
    unverified: "❔ 未確認"
  }[value] ?? "❔ 未確認";
}

function appendRelatedMaterialLine(container, label, descriptor, verification) {
  const line = document.createElement("div");
  line.className = "writing-related-line";
  const name = document.createElement("span");
  name.className = "writing-related-label";
  name.textContent = label;
  const path = document.createElement("code");
  path.className = "writing-related-path";
  path.textContent = displayPath(descriptor);
  const state = document.createElement("span");
  state.className = `writing-related-verification writing-related-verification-${verification}`;
  state.textContent = verificationDisplay(verification);
  line.append(name, path, state);
  container.append(line);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function renderInlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  return html;
}

export function renderSafeMarkdown(markdown, container) {
  container.replaceChildren();
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let codeLines = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const node = document.createElement("p");
    node.innerHTML = renderInlineMarkdown(paragraph.join("\n"));
    container.append(node);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    const list = document.createElement(listType);
    listItems.forEach((item) => {
      const listItem = document.createElement("li");
      listItem.innerHTML = renderInlineMarkdown(item);
      list.append(listItem);
    });
    container.append(list);
    listType = null;
    listItems = [];
  };
  const flushCode = () => {
    if (codeLines === null) return;
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = codeLines.join("\n");
    pre.append(code);
    container.append(pre);
    codeLines = null;
  };

  lines.forEach((line) => {
    if (codeLines !== null) {
      if (/^\s*```/.test(line)) flushCode();
      else codeLines.push(line);
      return;
    }
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      codeLines = [];
      return;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const node = document.createElement(`h${heading[1].length}`);
      node.innerHTML = renderInlineMarkdown(heading[2]);
      container.append(node);
      return;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      container.append(document.createElement("hr"));
      return;
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const nextListType = unordered ? "ul" : "ol";
      if (listType && listType !== nextListType) flushList();
      listType = nextListType;
      listItems.push((unordered || ordered)[1]);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }
    if (listType) flushList();
    paragraph.push(line);
  });
  flushParagraph();
  flushList();
  flushCode();
}

function createRelatedAction(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `writing-related-action ${className}`;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

export function renderRelatedMaterials(row, item, manifestEntries = [], plotEntries = []) {
  const detailRow = document.createElement("tr");
  detailRow.className = "writing-related-row";
  const detailCell = document.createElement("td");
  detailCell.colSpan = 5;
  const relatedShell = document.createElement("div");
  relatedShell.className = "writing-related-shell";
  const details = document.createElement("details");
  details.className = "writing-related-details";
  details.open = false;
  const summary = document.createElement("summary");
  const entry = findWritingAssetEntry(manifestEntries, item);
  const summaryLabel = document.createElement("span");
  summaryLabel.className = "writing-related-summary-label";
  summaryLabel.textContent = entry ? `関連資料（${entry.episode_id}）` : "関連資料：未登録";
  summary.append(summaryLabel);
  const actions = document.createElement("div");
  actions.className = "writing-related-actions";
  const content = document.createElement("div");
  content.className = "writing-related-content";
  if (!entry) {
    content.textContent = "未登録：ローカル資料の対応付けがありません。Issueタイトルや本文からpathを推測していません。";
  } else {
    const verification = entry.verification;
    const description = document.createElement("p");
    description.className = "writing-related-description";
    description.textContent = verificationDescription(verification);
    content.append(description);
    appendRelatedMaterialLine(content, "📄 原稿", entry.documents.manuscript, verification);
    appendRelatedMaterialLine(content, "🗂 プロット", entry.documents.plot, verification);
    appendRelatedMaterialLine(content, "📂 作業フォルダ", entry.directories.working, verification);
    const verificationLine = document.createElement("div");
    verificationLine.className = "writing-related-verification-line";
    verificationLine.textContent = `${verificationDisplay(verification)}（${verification}）`;
    content.append(verificationLine);

    const plotContent = findWritingPlotContent(plotEntries, item);
    const plotPreview = document.createElement("section");
    plotPreview.className = "writing-plot-preview";
    plotPreview.hidden = true;
    const plotHeading = document.createElement("h4");
    plotHeading.textContent = "📝 プロット本文";
    const plotBody = document.createElement("div");
    plotBody.className = "writing-plot-body";
    if (plotContent) renderSafeMarkdown(plotContent.markdown, plotBody);
    else plotBody.textContent = "プロット本文を読み込めませんでした。生成データを更新してください。";
    plotPreview.append(plotHeading, plotBody);
    content.append(plotPreview);

    const manuscriptButton = createRelatedAction("📄 原稿", "writing-manuscript-action", (event) => {
      event.preventDefault();
      event.stopPropagation();
      details.open = true;
    });
    const plotButton = createRelatedAction("📝 プロット", "writing-plot-action", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!plotPreview.hidden) {
        details.open = false;
        return;
      }
      details.open = true;
      plotPreview.hidden = false;
      plotButton.textContent = "📝 プロットを閉じる";
    });
    actions.append(manuscriptButton, plotButton);
    details.addEventListener("toggle", () => {
      if (!details.open) {
        plotPreview.hidden = true;
        plotButton.textContent = "📝 プロット";
      }
    });
  }
  if (entry) {
    const verificationSummary = document.createElement("span");
    verificationSummary.className = `writing-related-summary-verification writing-related-verification-${entry.verification}`;
    verificationSummary.textContent = verificationDisplay(entry.verification);
    summary.append(verificationSummary);
  }
  details.append(summary, content);
  relatedShell.append(details);
  if (entry) relatedShell.append(actions);
  detailCell.append(relatedShell);
  detailRow.append(detailCell);
  row.after(detailRow);
}

export function renderWritingStatus(items, metadata, stage, container, countContainer, manifestEntries = [], plotEntries = []) {
  const scenarioItems = registeredWritingItems(items, manifestEntries);
  const order = writingStageOrder(metadata, scenarioItems);
  const counts = stageCounts(scenarioItems, order);
  const visible = filterByWritingStage(scenarioItems, stage);

  countContainer.replaceChildren();
  order.forEach((value) => {
    const stageCount = counts.get(value) ?? 0;
    const chip = document.createElement("span");
    chip.className = stageCount > 0 ? "writing-stage-count" : "writing-stage-count is-zero";
    const label = document.createElement("span");
    label.className = "writing-stage-count-label";
    label.textContent = writingStageLabel(value);
    const count = document.createElement("strong");
    count.className = "writing-stage-count-value";
    count.textContent = `${stageCount}件`;
    chip.append(label, count);
    countContainer.append(chip);
  });

  container.replaceChildren();
  if (visible.length === 0) {
    container.textContent = "該当するシナリオIssueはありません。";
    return { order, scenarioItems };
  }
  const tableWrap = document.createElement("div");
  tableWrap.className = "writing-table-wrap";
  const table = document.createElement("table");
  table.className = "writing-status-table";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Issue", "タイトル", "Status", "執筆工程", "締切日"].forEach((label) => {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = label;
    headerRow.append(heading);
  });
  head.append(headerRow);
  const body = document.createElement("tbody");
  visible.forEach((item) => {
    const row = document.createElement("tr");
    row.className = "writing-issue-row";
    const issueCell = document.createElement("td");
    const issue = document.createElement("a");
    issue.className = "writing-issue-link";
    issue.textContent = `#${item.issueNumber}`;
    const titleCell = document.createElement("td");
    const title = document.createElement("a");
    title.className = "writing-issue-title";
    title.textContent = item.title;
    if (item.issueUrl) {
      issue.href = item.issueUrl;
      issue.target = "_blank";
      issue.rel = "noopener noreferrer";
      title.href = item.issueUrl;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
    } else {
      issue.removeAttribute("href");
      title.removeAttribute("href");
    }
    issueCell.append(issue);
    titleCell.append(title);
    if (item.issueUrl) {
      const hint = document.createElement("span");
      hint.className = "writing-title-hint";
      hint.textContent = "GitHub Issueを開く";
      titleCell.append(hint);
    }
    const statusCell = document.createElement("td");
    appendText(statusCell, "writing-status-badge", item.statusLabel);
    const stageCell = document.createElement("td");
    appendText(stageCell, "writing-stage-badge", writingStageLabel(writingStageValue(item)));
    const deadlineCell = document.createElement("td");
    deadlineCell.className = item.deadline ? "writing-deadline" : "writing-deadline writing-deadline-unset";
    deadlineCell.textContent = item.deadline ?? "未設定";
    row.append(issueCell, titleCell, statusCell, stageCell, deadlineCell);
    body.append(row);
    renderRelatedMaterials(row, item, manifestEntries, plotEntries);
  });
  table.append(head, body);
  tableWrap.append(table);
  container.append(tableWrap);
  return { order, scenarioItems };
}
