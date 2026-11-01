/**
 * Read-only loader and display-model normalizer for a GitHub Projects export.
 * It never changes the source JSON or sends data to GitHub.
 */

const STATUS_VALUES = new Map([
  ["idea", "idea"],
  ["todo", "todo"],
  ["ready", "ready"],
  ["in progress", "in_progress"],
  ["review", "review"],
  ["blocked", "blocked"],
  ["done", "done"],
  ["archive", "archive"],
  ["未設定", "unset"]
]);

const PRIORITY_VALUES = new Map([
  ["critical", "critical"],
  ["high", "high"],
  ["medium", "medium"],
  ["low", "low"]
]);

export const RELEASE_GATE_ORDER = ["gate_0", "gate_1", "gate_2", "gate_3", "gate_4", "unset", "unknown"];

const RELEASE_GATE_LABELS = {
  gate_0: "Gate 0",
  gate_1: "Gate 1",
  gate_2: "Gate 2",
  gate_3: "Gate 3",
  gate_4: "Gate 4",
  unset: "未設定",
  unknown: "不明"
};

// Classifies display-model values only; it does not alter the source release_gate value.
export function normalizeReleaseGateCategory(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return "unset";
  if (typeof value !== "string") return "unknown";

  const match = /^gate\s*([0-4])$/i.exec(value.trim());
  return match ? `gate_${match[1]}` : "unknown";
}

export function getReleaseGateLabel(category) {
  return RELEASE_GATE_LABELS[category] ?? RELEASE_GATE_LABELS.unknown;
}

function createWarning(code, message) {
  return { code, severity: "warning", message };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeText(value, fallback, field, warnings) {
  if (value == null || value === "") return fallback;
  if (!isNonEmptyString(value)) {
    warnings.push(createWarning("INVALID_FIELD_TYPE", `${field}の型が不正です`));
    return fallback;
  }
  return value.trim();
}

function normalizeStatus(value, warnings) {
  if (value == null || value === "") return { status: "unset", statusLabel: "未設定" };
  if (!isNonEmptyString(value)) {
    warnings.push(createWarning("INVALID_FIELD_TYPE", "statusの型が不正です"));
    return { status: "unset", statusLabel: "未設定" };
  }

  const statusLabel = value.trim();
  const status = STATUS_VALUES.get(statusLabel.toLocaleLowerCase("en-US"));
  if (status) return { status, statusLabel };

  warnings.push(createWarning("UNKNOWN_STATUS", `未知のStatusです: ${statusLabel}`));
  return { status: "unknown", statusLabel };
}

function normalizePriority(value, warnings) {
  if (value == null || value === "") return { priority: "unset", priorityLabel: "未設定" };
  if (!isNonEmptyString(value)) {
    warnings.push(createWarning("INVALID_FIELD_TYPE", "priorityの型が不正です"));
    return { priority: "unset", priorityLabel: "未設定" };
  }

  const priorityLabel = value.trim();
  const priority = PRIORITY_VALUES.get(priorityLabel.toLocaleLowerCase("en-US"));
  if (priority) return { priority, priorityLabel };

  warnings.push(createWarning("UNKNOWN_PRIORITY", `未知のPriorityです: ${priorityLabel}`));
  return { priority: "unknown", priorityLabel };
}

function normalizeIssueUrl(raw, warnings) {
  const preferred = raw.issue_url ?? raw.url ?? null;
  if (preferred == null || preferred === "") return { issueUrl: null, issueUrlRaw: null };
  if (!isNonEmptyString(preferred)) {
    warnings.push(createWarning("INVALID_FIELD_TYPE", "issue_url/urlの型が不正です"));
    return { issueUrl: null, issueUrlRaw: preferred };
  }

  const issueUrlRaw = preferred.trim();
  try {
    const parsed = new URL(issueUrlRaw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return { issueUrl: issueUrlRaw, issueUrlRaw };
  } catch {
    warnings.push(createWarning("INVALID_ISSUE_URL", `Issue URLが不正です: ${issueUrlRaw}`));
    return { issueUrl: null, issueUrlRaw };
  }
}

function normalizeDate(value, field, warnings) {
  if (value == null || value === "") return null;
  if (!isNonEmptyString(value)) {
    warnings.push(createWarning("INVALID_FIELD_TYPE", `${field}の型が不正です`));
    return null;
  }

  const normalized = value.trim();
  if (Number.isNaN(Date.parse(normalized))) {
    warnings.push(createWarning("INVALID_DATE", `${field}の日付が不正です: ${normalized}`));
    return null;
  }
  return normalized;
}

function normalizeArray(value, field, warnings) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    warnings.push(createWarning("INVALID_ARRAY_TYPE", `${field}は配列ではありません`));
    return [];
  }
  return value;
}

function normalizeStaffKeys(value, warnings) {
  const keys = normalizeArray(value, "staff_keys", warnings);
  const normalized = [];
  keys.forEach((key) => {
    if (!isNonEmptyString(key)) {
      warnings.push(createWarning("INVALID_STAFF_KEY", "staff_keysに不正な値があります"));
      return;
    }
    const normalizedKey = key.trim();
    if (!normalized.includes(normalizedKey)) normalized.push(normalizedKey);
  });
  return normalized;
}

function normalizeStaffDirectory(value, warnings) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    warnings.push(createWarning("INVALID_STAFF_DIRECTORY", "staffは配列ではありません"));
    return [];
  }

  const keys = new Set();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !isNonEmptyString(entry.key)) {
      warnings.push(createWarning("INVALID_STAFF_DIRECTORY_ENTRY", "staff台帳に不正な項目があります"));
      return [];
    }
    const key = entry.key.trim();
    if (keys.has(key)) {
      warnings.push(createWarning("DUPLICATE_STAFF_KEY", `staff台帳のkeyが重複しています: ${key}`));
      return [];
    }
    keys.add(key);
    return [{
      key,
      displayName: isNonEmptyString(entry.display_name) ? entry.display_name.trim() : key,
      active: entry.active !== false
    }];
  });
}

function normalizeParent(value, warnings) {
  if (value == null || typeof value === "string" || typeof value === "number" || (typeof value === "object" && !Array.isArray(value))) {
    return value ?? null;
  }
  warnings.push(createWarning("INVALID_FIELD_TYPE", "parentの型が不正です"));
  return null;
}

function normalizeReleaseGate(value, warnings) {
  if (value == null || typeof value === "string" || (typeof value === "object" && !Array.isArray(value))) {
    return value ?? null;
  }
  warnings.push(createWarning("INVALID_FIELD_TYPE", "release_gateの型が不正です"));
  return null;
}

function normalizeIssueNumber(value, warnings) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  warnings.push(createWarning("INVALID_FIELD_TYPE", "issue_numberの型が不正です"));
  return null;
}

function normalizeWritingStage(value, warnings) {
  return normalizeText(value, null, "writing_stage", warnings);
}

export function normalizeTask(raw, index, duplicateIds = new Set()) {
  const warnings = [];
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  if (source !== raw) {
    warnings.push(createWarning("INVALID_ITEM_TYPE", `item[${index}]がobjectではありません`));
  }

  let itemId = null;
  if (isNonEmptyString(source.item_id)) {
    itemId = source.item_id.trim();
  } else if (source.item_id == null || source.item_id === "") {
    warnings.push(createWarning("MISSING_ITEM_ID", "item_idが未設定です"));
  } else {
    warnings.push(createWarning("INVALID_FIELD_TYPE", "item_idの型が不正です"));
  }
  if (itemId && duplicateIds.has(itemId)) {
    warnings.push(createWarning("DUPLICATE_ITEM_ID", `item_idが重複しています: ${itemId}`));
  }

  const title = normalizeText(source.title, "無題のタスク", "title", warnings);
  if (!isNonEmptyString(source.title)) {
    warnings.push(createWarning("MISSING_TITLE", "titleが未設定です"));
  }

  const { status, statusLabel } = normalizeStatus(source.status, warnings);
  const categoryLabel = normalizeText(source.category, "未分類", "category", warnings);
  const { priority, priorityLabel } = normalizePriority(source.priority, warnings);
  const owner = normalizeText(source.owner, null, "owner", warnings);
  const description = normalizeText(source.description ?? source.body, "", "body/description", warnings);
  const readyReason = normalizeText(source.ready_reason, null, "ready_reason", warnings);
  const blockedReason = normalizeText(source.blocked_reason, null, "blocked_reason", warnings);
  const { issueUrl, issueUrlRaw } = normalizeIssueUrl(source, warnings);

  if (status === "ready" && !readyReason) {
    warnings.push(createWarning("MISSING_READY_REASON", "Readyですがready_reasonが未設定です"));
  }
  if (status === "blocked" && !blockedReason) {
    warnings.push(createWarning("MISSING_BLOCKED_REASON", "Blockedですがblocked_reasonが未設定です"));
  }

  return {
    itemId,
    title,
    status,
    statusLabel,
    category: categoryLabel,
    categoryLabel,
    priority,
    priorityLabel,
    owner,
    description,
    issueNumber: normalizeIssueNumber(source.issue_number, warnings),
    issueUrl,
    issueUrlRaw,
    parent: normalizeParent(source.parent, warnings),
    releaseGate: normalizeReleaseGate(source.release_gate, warnings),
    gate: normalizeText(source.gate, null, "gate", warnings),
    readyReason,
    blockedReason,
    writingStage: normalizeWritingStage(source.writing_stage, warnings),
    deadline: normalizeDate(source.deadline, "deadline", warnings),
    createdAt: normalizeDate(source.created_at, "created_at", warnings),
    updatedAt: normalizeDate(source.updated_at, "updated_at", warnings),
    relatedLinks: normalizeArray(source.related_links, "related_links", warnings),
    labels: normalizeArray(source.labels, "labels", warnings),
    staffKeys: normalizeStaffKeys(source.staff_keys, warnings),
    warnings
  };
}

function getDuplicateIds(items) {
  const counts = new Map();
  items.forEach((item) => {
    if (item && typeof item === "object" && isNonEmptyString(item.item_id)) {
      const itemId = item.item_id.trim();
      counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
    }
  });
  return new Set([...counts].filter(([, count]) => count > 1).map(([itemId]) => itemId));
}

function summarizeWarnings(items) {
  const warnings = items.flatMap((item) => item.warnings);
  return {
    warningCount: warnings.length,
    duplicateIdCount: new Set(items.filter((item) => (
      item.warnings.some((warning) => warning.code === "DUPLICATE_ITEM_ID")
    )).map((item) => item.itemId)).size,
    missingFieldCount: warnings.filter((warning) => warning.code.startsWith("MISSING_")).length,
    invalidTypeCount: warnings.filter((warning) => (
      warning.code === "INVALID_FIELD_TYPE" || warning.code === "INVALID_ARRAY_TYPE" || warning.code === "INVALID_ITEM_TYPE"
    )).length
  };
}

export function normalizeDocument(raw) {
  let rawItems;
  let metadata;
  const warnings = [];

  if (Array.isArray(raw)) {
    rawItems = raw;
    metadata = {};
    warnings.push("Legacy array root detected.");
  } else if (raw && typeof raw === "object" && Array.isArray(raw.items)) {
    ({ items: rawItems, ...metadata } = raw);
  } else {
    throw new Error("Unsupported JSON root: expected an array or an object with an items array.");
  }

  const staff = normalizeStaffDirectory(metadata.staff, warnings);
  const staffByKey = new Map(staff.map((entry) => [entry.key, entry]));
  const duplicateIds = getDuplicateIds(rawItems);
  const items = rawItems.map((item, index) => normalizeTask(item, index, duplicateIds));
  items.forEach((item) => {
    item.staffDisplayNames = item.staffKeys.map((key) => {
      const entry = staffByKey.get(key);
      if (!entry) {
        item.warnings.push(createWarning("UNKNOWN_STAFF_KEY", `未登録スタッフです: ${key}`));
        return `未登録スタッフ: ${key}`;
      }
      return entry.active ? entry.displayName : `非active: ${entry.displayName}`;
    });
  });
  return { items, staff, metadata, warnings, validation: summarizeWarnings(items) };
}

export function getStatusSummary(items) {
  const statuses = new Set();
  let unsetCount = 0;

  for (const item of items) {
    if (item.status === "unset") {
      unsetCount += 1;
    } else {
      statuses.add(item.statusLabel);
    }
  }

  return { statuses: [...statuses].sort(), unsetCount };
}

export async function load(url = "./project_items.json") {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  }

  const document = normalizeDocument(await response.json());
  const statusSummary = getStatusSummary(document.items);

  console.log(`Loaded: ${document.items.length} items`);
  console.log("Status:");
  statusSummary.statuses.forEach((status) => console.log(status));
  if (statusSummary.unsetCount > 0) {
    console.warn(`Status is unset for ${statusSummary.unsetCount} item(s).`);
  }
  console.log("Validation:", document.validation);
  document.warnings.forEach((warning) => console.warn(warning));

  return document;
}

if (typeof window !== "undefined") {
  window.GateViewDataLoader = { load, normalizeDocument, normalizeTask, getStatusSummary };
}
