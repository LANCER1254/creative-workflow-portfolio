import {safeDataImage,uniqueIds} from "../shared/safe.js";
export const SCHEMA_VERSION = 1;
export const DOCUMENT_TYPE = "background_progress";

export const STATUS_OPTIONS = ["未整理", "候補", "生成待ち", "比較中", "採用", "修正待ち", "完成"];
export const PRIORITY_OPTIONS = ["高", "中", "低"];

export function nowIso() {
  return new Date().toISOString();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createRow(order) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `bgp-row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    order,
    scene_name: "",
    background_name: "",
    purpose: "",
    time_of_day: "",
    priority: "中",
    status: "未整理",
    memo: "",
    source_file_name: "",
    image_name: "",
    image_data_url: "",
  };
}

export function createTable({ tableId, tableDate, title }) {
  const timestamp = nowIso();
  return {
    schema_version: SCHEMA_VERSION,
    document_type: DOCUMENT_TYPE,
    table_id: tableId,
    table_date: tableDate,
    title,
    created_at: timestamp,
    updated_at: timestamp,
    items: [],
  };
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function normalizeRow(row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`items[${index}] が不正です。`);
  }
  return {
    id: stringValue(row.id) || `bgp-row-${index + 1}`,
    order: Number(row.order) || index + 1,
    scene_name: stringValue(row.scene_name),
    background_name: stringValue(row.background_name),
    purpose: stringValue(row.purpose),
    time_of_day: stringValue(row.time_of_day),
    priority: PRIORITY_OPTIONS.includes(row.priority) ? row.priority : "中",
    status: STATUS_OPTIONS.includes(row.status) ? row.status : "未整理",
    memo: stringValue(row.memo),
    source_file_name: stringValue(row.source_file_name),
    image_name: stringValue(row.image_name),
    image_data_url: safeDataImage(stringValue(row.image_data_url)),
  };
}

export function normalizeTable(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSONのルートはオブジェクトである必要があります。");
  }
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new Error(`未対応のschema_versionです: ${String(value.schema_version)}`);
  }
  if (value.document_type !== DOCUMENT_TYPE) {
    throw new Error(`未対応のdocument_typeです: ${String(value.document_type)}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}_\d{3}$/.test(stringValue(value.table_id))) {
    throw new Error(`table_id が不正です: ${String(value.table_id)}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue(value.table_date))) {
    throw new Error(`table_date が不正です: ${String(value.table_date)}`);
  }
  if (!Array.isArray(value.items)) {
    throw new Error("items は配列である必要があります。");
  }
  uniqueIds(value.items);
  if(value.items.length>200)throw Error("200行以内にしてください。");
  const table = {
    schema_version: SCHEMA_VERSION,
    document_type: DOCUMENT_TYPE,
    table_id: stringValue(value.table_id),
    table_date: stringValue(value.table_date),
    title: stringValue(value.title),
    created_at: stringValue(value.created_at),
    updated_at: stringValue(value.updated_at),
    items: value.items.map((row, index) => normalizeRow(row, index)),
  };
  renumberRows(table);
  return table;
}

export function renumberRows(table) {
  table.items.forEach((row, index) => {
    row.order = index + 1;
  });
}

export function moveRow(table, index, delta) {
  const next = index + delta;
  if (next < 0 || next >= table.items.length) {
    return false;
  }
  [table.items[index], table.items[next]] = [table.items[next], table.items[index]];
  renumberRows(table);
  return true;
}

export function nextTableId(tables, dateKey) {
  const datePrefix = String(dateKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) {
    throw new Error(`日付が不正です: ${datePrefix}`);
  }
  let nextSequence = 1;
  for (const table of tables || []) {
    const tableId = stringValue(table.table_id);
    const match = tableId.match(new RegExp(`^${datePrefix}_(\\d{3})$`));
    if (match) {
      nextSequence = Math.max(nextSequence, Number(match[1]) + 1);
    }
  }
  return `${datePrefix}_${String(nextSequence).padStart(3, "0")}`;
}

export function recoverTableId(tableId) {
  const match = String(tableId || "").match(/^(\d{4}-\d{2}-\d{2})_(\d{3})$/);
  if (!match) {
    throw new Error(`table_id が不正です: ${String(tableId)}`);
  }
  return { table_date: match[1], table_id: match[0] };
}

function imageSource(row) {
  return row.image_data_url || row.image_rel_path || "";
}

function exportField(label, value) {
  return value ? `<div class="field"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(value)}</p></div>` : "";
}

function exportRow(row) {
  const source = imageSource(row);
  const image = source
    ? `<img class="preview" src="${escapeHtml(source)}" alt="${escapeHtml(row.source_file_name || row.image_name || "")}">`
    : '<div class="placeholder">画像なし</div>';
  return `
    <tr>
      <td class="order">${escapeHtml(row.order)}</td>
      <td>${escapeHtml(row.scene_name || "—")}</td>
      <td>${escapeHtml(row.background_name || "—")}</td>
      <td>${escapeHtml(row.purpose || "—")}</td>
      <td>${escapeHtml(row.time_of_day || "—")}</td>
      <td>${escapeHtml(row.priority || "—")}</td>
      <td><span class="status status-${escapeHtml(String(row.status || "未整理").replace(/[^0-9A-Za-z._-]+/g, "_"))}">${escapeHtml(row.status || "未整理")}</span></td>
      <td class="memo">${escapeHtml(row.memo || "—")}</td>
      <td class="image-cell">${image}<div class="source-name">${escapeHtml(row.source_file_name || row.image_name || "—")}</div></td>
    </tr>
  `;
}

export function buildExportHtml(table) {
  const rows = (table.items || []).map(exportRow).join("\n") || '<tr><td class="empty" colspan="9">まだ項目がありません。</td></tr>';
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(table.title || "Background Progress")}</title>
  <style>
    :root { color-scheme: light; --bg:#f6f1e8; --paper:#fffdf8; --line:#d6c7ad; --text:#2a241d; --muted:#6c5d49; --accent:#ba7a1d; }
    * { box-sizing: border-box; }
    body { margin:0; padding:24px; font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif; color:var(--text); background:var(--bg); line-height:1.6; }
    .sheet { max-width: 1280px; margin: 0 auto; }
    .hero, .table-wrap { background: var(--paper); border: 1px solid var(--line); border-radius: 16px; padding: 18px; box-shadow: 0 12px 30px rgba(43,34,20,.12); }
    .hero h1 { margin:0 0 6px; font-size: 28px; }
    .meta { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top: 14px; }
    .meta-card, .field { background: rgba(255,255,255,.65); border:1px solid rgba(182,154,112,.25); border-radius: 12px; padding: 10px 12px; }
    .meta-card span, .field h3 { display:block; margin:0 0 4px; color:var(--muted); font-size: 12px; font-weight: 700; }
    .meta-card strong { font-size: 15px; }
    .table-wrap { margin-top: 18px; padding: 0; overflow-x: auto; }
    table { width:100%; border-collapse: collapse; min-width: 1240px; }
    th, td { border-bottom:1px solid rgba(182,154,112,.22); padding: 10px 12px; text-align:left; vertical-align: top; }
    thead th { background:#efe3cd; position: sticky; top: 0; z-index: 1; white-space: nowrap; }
    tbody tr:nth-child(even) td { background: rgba(255,255,255,.5); }
    .order { text-align:center; font-weight:700; width:64px; }
    .memo { white-space: pre-wrap; word-break: break-word; min-width: 220px; }
    .image-cell { min-width: 240px; }
    .preview { display:block; max-width:100%; max-height: 180px; object-fit: contain; border:1px solid rgba(90,74,48,.15); background:#efe8dc; border-radius: 10px; }
    .placeholder { min-height: 160px; display:grid; place-items:center; border:1px dashed rgba(90,74,48,.25); border-radius: 10px; color:var(--muted); background: rgba(255,255,255,.55); }
    .source-name { margin-top:8px; color:var(--muted); font-size: 12px; word-break: break-word; }
    .status { display:inline-flex; align-items:center; justify-content:center; min-height:32px; padding: 4px 12px; border-radius:999px; background:#eee; color:#333; font-size:13px; font-weight:700; white-space:nowrap; }
    .status-未整理 { background:#ece5db; color:#5f503d; }
    .status-候補 { background:#dfe9d7; color:#44603b; }
    .status-生成待ち { background:#e4e0f2; color:#554a83; }
    .status-比較中 { background:#dbe8f4; color:#355c7a; }
    .status-採用 { background:#d7efe3; color:#2d7250; }
    .status-修正待ち { background:#f6e0d8; color:#8f4f3d; }
    .status-完成 { background:#d5ead9; color:#2a6e40; }
    .empty { padding: 24px; text-align:center; color: var(--muted); }
    @media print {
      body { background:#fff; padding:0; }
      .hero, .table-wrap { box-shadow:none; border-radius:0; }
      .meta { gap: 8px; }
      .table-wrap { margin-top: 10px; }
      thead th { position: static; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="hero">
      <h1>背景進行表</h1>
      <p>日付単位で保存する制作背景の進行表です。JSONを正本として静的HTMLへ書き出しています。</p>
      <div class="meta">
        <div class="meta-card"><span>表ID</span><strong>${escapeHtml(table.table_id || "—")}</strong></div>
        <div class="meta-card"><span>日付</span><strong>${escapeHtml(table.table_date || "—")}</strong></div>
        <div class="meta-card"><span>作成日時</span><strong>${escapeHtml(table.created_at || "—")}</strong></div>
        <div class="meta-card"><span>更新日時</span><strong>${escapeHtml(table.updated_at || "—")}</strong></div>
      </div>
      ${exportField("タイトル", table.title)}
    </section>
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>順番</th>
            <th>シーン名</th>
            <th>背景名</th>
            <th>用途</th>
            <th>時間帯</th>
            <th>優先度</th>
            <th>ステータス</th>
            <th>メモ</th>
            <th>画像</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}
