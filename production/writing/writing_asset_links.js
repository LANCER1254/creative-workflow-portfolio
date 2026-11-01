export const ALLOWED_VERIFICATIONS = Object.freeze([
  "human_verified",
  "needs_review",
  "unverified"
]);

const VERIFICATION_LABELS = Object.freeze({
  human_verified: "確認済み",
  needs_review: "要確認",
  unverified: "未確認"
});

export function verificationLabel(value) {
  return VERIFICATION_LABELS[value] ?? "未確認";
}

export function isSafeRepositoryPath(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return false;
  return !value.split(/[\\/]/).includes("..");
}

function normalizeRepository(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDescriptor(value) {
  if (!value || typeof value !== "object") return null;
  const repository = normalizeRepository(value.repository);
  const path = isSafeRepositoryPath(value.path) ? value.path.trim() : null;
  return repository && path ? { repository, path } : null;
}

function normalizeEntry(entry, index) {
  if (!entry || typeof entry !== "object") return { error: `entries[${index}] is not an object` };
  if (!Number.isInteger(entry.issue_number) || entry.issue_number <= 0) {
    return { error: `entries[${index}].issue_number is invalid` };
  }
  const repository = normalizeRepository(entry.repository);
  const episodeId = typeof entry.episode_id === "string" && entry.episode_id.trim() ? entry.episode_id.trim() : null;
  if (!repository || !episodeId || !ALLOWED_VERIFICATIONS.includes(entry.verification)) {
    return { error: `entries[${index}] has an invalid identity or verification` };
  }
  if (!entry.documents || typeof entry.documents !== "object" || !entry.directories || typeof entry.directories !== "object") {
    return { error: `entries[${index}] is missing documents or directories` };
  }
  const documents = {};
  const directories = {};
  for (const [name, value] of Object.entries(entry.documents)) {
    const descriptor = normalizeDescriptor(value);
    if (!descriptor) return { error: `entries[${index}].documents.${name} is unsafe` };
    documents[name] = descriptor;
  }
  for (const [name, value] of Object.entries(entry.directories)) {
    const descriptor = normalizeDescriptor(value);
    if (!descriptor) return { error: `entries[${index}].directories.${name} is unsafe` };
    directories[name] = descriptor;
  }
  return {
    entry: {
      repository,
      issue_number: entry.issue_number,
      episode_id: episodeId,
      documents,
      directories,
      verification: entry.verification,
      notes: typeof entry.notes === "string" ? entry.notes : ""
    }
  };
}

export function manifestEntryKey(repository, issueNumber) {
  return `${String(repository).trim().toLowerCase()}#${issueNumber}`;
}

export function normalizeWritingAssetManifest(value) {
  if (!value || typeof value !== "object" || value.schema_version !== 1 || !Array.isArray(value.entries)) {
    throw new Error("writing_asset_links.jsonのschemaが不正です。");
  }
  const entries = [];
  const warnings = [];
  const keys = new Set();
  value.entries.forEach((raw, index) => {
    const result = normalizeEntry(raw, index);
    if (result.error) {
      warnings.push(result.error);
      return;
    }
    const key = manifestEntryKey(result.entry.repository, result.entry.issue_number);
    if (keys.has(key)) {
      warnings.push(`duplicate manifest entry: ${key}`);
      return;
    }
    keys.add(key);
    entries.push(result.entry);
  });
  return { schema_version: 1, entries, warnings };
}

export function repositoryFromIssue(item) {
  if (typeof item?.repository === "string" && item.repository.trim()) return item.repository.trim();
  if (typeof item?.issueUrl !== "string") return null;
  try {
    const url = new URL(item.issueUrl);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  } catch {
    return null;
  }
}

export function findWritingAssetEntry(entries, item) {
  const repository = repositoryFromIssue(item);
  if (!repository || !Number.isInteger(item?.issueNumber)) return null;
  const key = manifestEntryKey(repository, item.issueNumber);
  return entries.find((entry) => manifestEntryKey(entry.repository, entry.issue_number) === key) ?? null;
}

export async function loadWritingAssetManifest(fetchImpl = fetch, path = "./data/writing_asset_links.json") {
  const response = await fetchImpl(path);
  if (!response.ok) throw new Error(`関連資料manifestを読み込めませんでした (${response.status})`);
  return normalizeWritingAssetManifest(await response.json());
}

export function normalizeWritingPlotContent(value) {
  if (!value || typeof value !== "object" || value.schema_version !== 1 || !Array.isArray(value.entries)) {
    throw new Error("plot_content.jsonのschemaが不正です。");
  }
  const entries = [];
  const warnings = Array.isArray(value.warnings) ? value.warnings.filter((warning) => typeof warning === "string") : [];
  const issueNumbers = new Set();
  value.entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || !Number.isInteger(entry.issue_number) || entry.issue_number <= 0 ||
      typeof entry.episode_id !== "string" || !isSafeRepositoryPath(entry.path) || typeof entry.markdown !== "string") {
      warnings.push(`plot_content.entries[${index}] is invalid`);
      return;
    }
    if (issueNumbers.has(entry.issue_number)) {
      warnings.push(`duplicate plot content entry: ${entry.issue_number}`);
      return;
    }
    issueNumbers.add(entry.issue_number);
    entries.push({
      issue_number: entry.issue_number,
      episode_id: entry.episode_id,
      path: entry.path,
      markdown: entry.markdown
    });
  });
  return { schema_version: 1, entries, warnings };
}

export async function loadWritingPlotContent(fetchImpl = fetch, path = "./data/plot_content.json") {
  const response = await fetchImpl(path);
  if (!response.ok) throw new Error(`プロット本文データを読み込めませんでした (${response.status})`);
  return normalizeWritingPlotContent(await response.json());
}

export function findWritingPlotContent(entries, item) {
  if (!Number.isInteger(item?.issueNumber)) return null;
  return entries.find((entry) => entry.issue_number === item.issueNumber) ?? null;
}
