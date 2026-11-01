import {demoFetch,htmlUrl} from "./demo-store.js";
import {readSafeImage} from "../shared/safe.js";
import {
  DOCUMENT_TYPE,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  buildExportHtml,
  createRow,
  createTable,
  normalizeTable,
  nextTableId,
  recoverTableId,
  renumberRows,
} from "./model.js";

const API_ROOT = "/api/background-progress";
const STORAGE_KEY = "public.production.background.selected.r01";
const byId = (root, id) => root.querySelector(`#${id}`);

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeName(value) {
  return String(value || "background_progress").replace(/[^0-9A-Za-z._-]+/g, "_").replace(/^_+|_+$/g, "") || "background_progress";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function readFileAsDataUrl(file) { return readSafeImage(file); }

function cloneTable(table) {
  return structuredClone(table);
}

function isRecoverableEntry(entry) {
  return entry && entry.has_json === false;
}

export function createBackgroundProgressApp(root, { onStatus } = {}) {
  const refs = {
    status: byId(root, "bgStatusMessage"),
    list: byId(root, "bgTableList"),
    newButton: byId(root, "bgNewTableButton"),
    reloadButton: byId(root, "bgReloadButton"),
    saveButton: byId(root, "bgSaveButton"),
    downloadButton: byId(root, "bgExportHtmlButton"),
    openButton: byId(root, "bgOpenHtmlButton"),
    loadInput: byId(root, "bgLoadJsonInput"),
    tableId: byId(root, "bgTableId"),
    tableDate: byId(root, "bgTableDate"),
    title: byId(root, "bgTableTitle"),
    createdAt: byId(root, "bgCreatedAt"),
    updatedAt: byId(root, "bgUpdatedAt"),
    rowCount: byId(root, "bgRowCount"),
    addRowButton: byId(root, "bgAddRowButton"),
    rowList: byId(root, "bgRowList"),
    emptyState: byId(root, "bgEmptyState"),
    recovery: byId(root, "bgRecovery"),
    recoveryMessage: byId(root, "bgRecoveryMessage"),
    recoveryTitle: byId(root, "bgRecoveryTitle"),
    recoveryOpenButton: byId(root, "bgRecoveryOpenButton"),
    recoveryCancelButton: byId(root, "bgRecoveryCancelButton"),
    createDate: byId(root, "bgCreateDate"),
    createTitle: byId(root, "bgCreateTitle"),
    createButton: byId(root, "bgCreateButton"),
    clearButton: byId(root, "bgClearButton"),
    htmlPreviewLink: byId(root, "bgPreviewLink"),
    htmlStatus: byId(root, "bgHtmlStatus"),
    rowTemplate: byId(root, "bgRowTemplate"),
  };

  const state = {
    manifest: { tables: [] },
    table: null,
    selectedTableId: "",
    currentEntry: null,
    recoveryEntry: null,
    ready: false,
  };

  function report(message, isError = false) {
    if (refs.status) {
      refs.status.textContent = message;
      refs.status.classList.toggle("error", isError);
    }
    if (typeof onStatus === "function") {
      onStatus(message, isError);
    }
  }

  function setHtmlStatus(message, isError = false) {
    if (!refs.htmlStatus) return;
    refs.htmlStatus.textContent = message;
    refs.htmlStatus.classList.toggle("error", isError);
  }

  function setPreviewLink(url, label) {
    if (!refs.htmlPreviewLink) return;
    if (!url) {
      refs.htmlPreviewLink.hidden = true;
      refs.htmlPreviewLink.removeAttribute("href");
      refs.htmlPreviewLink.textContent = "";
      return;
    }
    refs.htmlPreviewLink.hidden = false;
    refs.htmlPreviewLink.href = url;
    refs.htmlPreviewLink.target = "_blank";
    refs.htmlPreviewLink.rel = "noopener noreferrer";
    refs.htmlPreviewLink.textContent = label || "HTMLを開く";
  }

  async function jsonFetch(url, options = {}) {
    const response = await demoFetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text };
      }
    }
    if (!response.ok) {
      const message = body?.message || body?.error || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return body ?? {};
  }

  function currentDraft() {
    if (state.table) {
      return state.table;
    }
    return createTable({ tableId: "", tableDate: todayKey(), title: "" });
  }

  function setTable(table, entry = null) {
    state.table = table
      ? (table.table_id ? normalizeTable(table) : cloneTable(table))
      : null;
    state.currentEntry = entry;
    state.selectedTableId = table?.table_id || entry?.table_id || "";
    if (refs.tableId) refs.tableId.value = state.table?.table_id || entry?.table_id || "";
    if (refs.tableDate) refs.tableDate.value = state.table?.table_date || entry?.table_date || todayKey();
    if (refs.title) refs.title.value = state.table?.title || entry?.title || "";
    if (refs.createdAt) refs.createdAt.value = state.table?.created_at || "";
    if (refs.updatedAt) refs.updatedAt.value = state.table?.updated_at || "";
    renderAll();
  }

  function clearRecovery() {
    state.recoveryEntry = null;
    if (refs.recovery) refs.recovery.hidden = true;
    if (refs.recoveryMessage) refs.recoveryMessage.textContent = "";
    if (refs.recoveryTitle) refs.recoveryTitle.value = "";
  }

  function showRecovery(entry) {
    state.recoveryEntry = entry;
    state.table = null;
    state.currentEntry = entry;
    state.selectedTableId = entry?.table_id || "";
    if (refs.recovery) refs.recovery.hidden = false;
    if (refs.recoveryMessage) {
      refs.recoveryMessage.textContent = `background_progress.json がありません。作業途中の空の背景進行表として復旧しますか？ (${entry.table_id})`;
    }
    if (refs.recoveryTitle) refs.recoveryTitle.value = entry?.title || "";
    renderAll();
  }

  function renderManifest() {
    if (!refs.list) return;
    const entries = [...(state.manifest.tables || [])].sort((a, b) => {
      const dateA = a.table_date || "";
      const dateB = b.table_date || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return String(b.table_id || "").localeCompare(String(a.table_id || ""));
    });
    if (!entries.length) {
      refs.list.innerHTML = `<p class="bg-empty">保存済み背景進行表はまだありません。</p>`;
      return;
    }
    refs.list.innerHTML = entries
      .map((entry) => {
        const active = state.selectedTableId === entry.table_id;
        const missing = isRecoverableEntry(entry);
        return `
          <button class="bg-table-item" type="button" data-table-id="${escapeHtml(entry.table_id)}" aria-pressed="${active ? "true" : "false"}">
            <span class="title">${escapeHtml(entry.title || entry.table_id || "無題")}</span>
            <span class="meta">${escapeHtml(entry.table_date || "—")} / ${escapeHtml(entry.updated_at || "—")}</span>
            <span class="meta">${escapeHtml(entry.table_id || "—")}</span>
            <span class="flag ${missing ? "is-missing" : ""}">${missing ? "JSONなし / 復旧可" : "保存済み"}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderMeta() {
    const table = state.table;
    if (refs.tableId) refs.tableId.value = table?.table_id || state.recoveryEntry?.table_id || "";
    if (refs.tableDate) {
      refs.tableDate.value = table?.table_date || state.recoveryEntry?.table_date || todayKey();
      refs.tableDate.disabled = true;
    }
    if (refs.title) refs.title.value = table?.title || state.recoveryEntry?.title || "";
    if (refs.createdAt) refs.createdAt.value = table?.created_at || "";
    if (refs.updatedAt) refs.updatedAt.value = table?.updated_at || "";
    if (refs.rowCount) refs.rowCount.textContent = table ? `${table.items.length}行` : "0行";
    if (refs.emptyState) refs.emptyState.hidden = Boolean(table) || Boolean(state.recoveryEntry);
    if (refs.saveButton) refs.saveButton.disabled = !table;
    if (refs.downloadButton) refs.downloadButton.disabled = !table;
    if (refs.openButton) refs.openButton.disabled = !table;
  }

  function renderRows() {
    if (!refs.rowList) return;
    const table = state.table;
    if (!table) {
      refs.rowList.innerHTML = "";
      return;
    }
    refs.rowList.innerHTML = table.items
      .map((row, index) => {
        const preview = row.image_data_url
          ? `<img src="${escapeHtml(row.image_data_url)}" alt="${escapeHtml(row.image_name || row.source_file_name || "")}">`
          : `<div class="bg-empty">画像未設定</div>`;
        return `
          <article class="bg-row-card" data-row-index="${index}">
            <div class="bg-row-head">
              <strong>行 ${row.order}</strong>
              <div class="bg-row-actions no-print">
                <button type="button" data-action="row-up" data-row-index="${index}">↑ 上へ</button>
                <button type="button" data-action="row-down" data-row-index="${index}">↓ 下へ</button>
                <button type="button" data-action="row-delete" data-row-index="${index}" class="danger">削除</button>
              </div>
            </div>
            <div class="bg-row-grid">
              <label>
                シーン名
                <input data-row-field="scene_name" data-row-index="${index}" type="text" value="${escapeHtml(row.scene_name || "")}">
              </label>
              <label>
                背景名
                <input data-row-field="background_name" data-row-index="${index}" type="text" value="${escapeHtml(row.background_name || "")}">
              </label>
              <label>
                用途
                <input data-row-field="purpose" data-row-index="${index}" type="text" value="${escapeHtml(row.purpose || "")}">
              </label>
              <label>
                時間帯
                <input data-row-field="time_of_day" data-row-index="${index}" type="text" value="${escapeHtml(row.time_of_day || "")}">
              </label>
              <label>
                優先度
                <select data-row-field="priority" data-row-index="${index}">
                  ${PRIORITY_OPTIONS.map((option) => `<option value="${escapeHtml(option)}"${row.priority === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
                </select>
              </label>
              <label>
                ステータス
                <select data-row-field="status" data-row-index="${index}">
                  ${STATUS_OPTIONS.map((option) => `<option value="${escapeHtml(option)}"${row.status === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
                </select>
              </label>
              <label class="wide">
                メモ
                <textarea data-row-field="memo" data-row-index="${index}" rows="3">${escapeHtml(row.memo || "")}</textarea>
              </label>
              <label class="wide bg-row-image">
                画像（任意）
                <input data-row-file="${index}" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp">
                <input data-row-field="source_file_name" data-row-index="${index}" type="text" value="${escapeHtml(row.source_file_name || "")}" placeholder="元ファイル名">
              </label>
              <div class="wide bg-row-preview">${preview}</div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderAll() {
    renderManifest();
    renderMeta();
    renderRows();
  }

  async function refreshManifest() {
    const manifest = await jsonFetch(`${API_ROOT}/manifest`);
    state.manifest = manifest;
    renderManifest();
    return manifest;
  }

  async function openTableById(tableId) {
    const entry = (state.manifest.tables || []).find((item) => item.table_id === tableId);
    if (!entry) {
      throw new Error(`保存済み背景進行表が見つかりません: ${tableId}`);
    }
    if (entry.has_json === false) {
      showRecovery(entry);
      return;
    }
    const table = await jsonFetch(`${API_ROOT}/table?table_id=${encodeURIComponent(tableId)}`);
    clearRecovery();
    setTable(table, entry);
    localStorage.setItem(STORAGE_KEY, tableId);
  }

  function newDraft() {
    clearRecovery();
    const draft = createTable({ tableId: "", tableDate: todayKey(), title: "" });
    state.currentEntry = null;
    setTable(draft, null);
    localStorage.removeItem(STORAGE_KEY);
    if (refs.title) refs.title.focus();
    report("新しい背景進行表を作成しました。");
  }

  function updateCurrentTableField(field, value) {
    if (!state.table) return;
    state.table[field] = value;
    if (field === "title") {
      state.table.updated_at = new Date().toISOString();
    }
    renderMeta();
  }

  function updateRow(index, field, value) {
    if (!state.table || !state.table.items[index]) return;
    state.table.items[index][field] = value;
    if (field !== "order") {
      state.table.updated_at = new Date().toISOString();
    }
    renderMeta();
    renderRows();
  }

  async function saveCurrentTable() {
    if (!state.table) {
      throw new Error("保存する背景進行表がありません。");
    }
    const payload = cloneTable(state.table);
    payload.document_type = DOCUMENT_TYPE;
    payload.schema_version = 1;
    payload.title = String(payload.title || "");
    payload.table_date = String(payload.table_date || todayKey());
    payload.updated_at = new Date().toISOString();
    if (!payload.table_id) {
      payload.table_id = "";
    }
    const html = buildExportHtml(payload);
    const result = await jsonFetch(`${API_ROOT}/table`, {
      method: "POST",
      body: JSON.stringify({ table: payload, html }),
    });
    const saved = normalizeTable(result.table);
    clearRecovery();
    state.currentEntry = result.entry || null;
    state.selectedTableId = saved.table_id;
    state.table = saved;
    localStorage.setItem(STORAGE_KEY, saved.table_id);
    if (refs.tableDate) refs.tableDate.disabled = true;
    if (refs.tableId) refs.tableId.value = saved.table_id;
    if (refs.title) refs.title.value = saved.title;
    if (refs.createdAt) refs.createdAt.value = saved.created_at || "";
    if (refs.updatedAt) refs.updatedAt.value = saved.updated_at || "";
    renderAll();
    await refreshManifest();
    setPreviewLink(result.html_url ? result.html_url : `${API_ROOT}/table?table_id=${encodeURIComponent(saved.table_id)}#html`, "保存済みHTMLを開く");
    report(`背景進行表を保存しました: ${saved.table_id}`);
    return result;
  }

  async function exportHtmlDownload() {
    if (!state.table) {
      throw new Error("書き出す背景進行表がありません。");
    }
    const html = buildExportHtml(state.table);
    download(`${safeName(state.table.title || state.table.table_id)}.html`, html, "text/html;charset=utf-8");
    report("背景進行表のHTMLを書き出しました。");
  }

  function openSavedHtml() {
    if (!state.table) {
      throw new Error("開く背景進行表がありません。");
    }
    const tableId = state.table.table_id || state.currentEntry?.table_id;
    if (!tableId) {
      throw new Error("保存前の背景進行表はHTMLを開けません。");
    }
    const url = htmlUrl(state.table);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      throw new Error("ブラウザでHTMLを開けませんでした。");
    }
    report("背景進行表のHTMLを開きました。");
  }

  async function attachImage(rowIndex, file) {
    if (!state.table || !state.table.items[rowIndex] || !file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      throw new Error("PNG / JPG / WebP のみ選択できます。");
    }
    const dataUrl = await readFileAsDataUrl(file);
    const row = state.table.items[rowIndex];
    row.image_data_url = dataUrl;
    row.image_name = file.name;
    row.source_file_name = file.name;
    state.table.updated_at = new Date().toISOString();
    renderMeta();
    renderRows();
  }

  function addRow() {
    if (!state.table) {
      throw new Error("背景進行表を選択または新規作成してください。");
    }
    state.table.items.push(createRow(state.table.items.length + 1));
    renumberRows(state.table);
    state.table.updated_at = new Date().toISOString();
    renderMeta();
    renderRows();
  }

  function deleteRow(rowIndex) {
    if (!state.table) return;
    if (!window.confirm(`行 ${rowIndex + 1} を削除しますか？`)) return;
    state.table.items.splice(rowIndex, 1);
    renumberRows(state.table);
    state.table.updated_at = new Date().toISOString();
    renderMeta();
    renderRows();
  }

  function moveRowByIndex(rowIndex, delta) {
    if (!state.table) return;
    const next = rowIndex + delta;
    if (next < 0 || next >= state.table.items.length) return;
    [state.table.items[rowIndex], state.table.items[next]] = [state.table.items[next], state.table.items[rowIndex]];
    renumberRows(state.table);
    state.table.updated_at = new Date().toISOString();
    renderMeta();
    renderRows();
  }

  async function recoverMissingTable() {
    if (!state.recoveryEntry) {
      throw new Error("復旧対象がありません。");
    }
    const title = String(refs.recoveryTitle?.value || "").trim();
    const recovered = createTable({
      tableId: state.recoveryEntry.table_id,
      tableDate: state.recoveryEntry.table_date || recoverTableId(state.recoveryEntry.table_id).table_date,
      title,
    });
    recovered.items = [];
    setTable(recovered, state.recoveryEntry);
    await saveCurrentTable();
  }

  function bindEvents() {
    root.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const tableId = button.dataset.tableId;
      const rowIndex = button.dataset.rowIndex ? Number(button.dataset.rowIndex) : Number.NaN;
      const action = button.dataset.action;
      try {
        if (tableId) {
          await openTableById(tableId);
          return;
        }
        switch (action) {
          case "reload":
            await refreshManifest();
            report("保存済み背景進行表を更新しました。");
            break;
          case "new":
            newDraft();
            break;
          case "create-draft": {
            const tableDate = refs.createDate?.value || todayKey();
            const title = String(refs.createTitle?.value || "").trim();
            const draft = createTable({ tableId: "", tableDate, title });
            draft.items = [];
            clearRecovery();
            setTable(draft, null);
            report("空の背景進行表を作成しました。保存で表IDが発行されます。");
            break;
          }
          case "save":
            await saveCurrentTable();
            break;
          case "download-html":
            await exportHtmlDownload();
            break;
          case "open-html":
            openSavedHtml();
            break;
          case "add-row":
            addRow();
            break;
          case "row-up":
            moveRowByIndex(rowIndex, -1);
            break;
          case "row-down":
            moveRowByIndex(rowIndex, 1);
            break;
          case "row-delete":
            deleteRow(rowIndex);
            break;
          case "recover":
            await recoverMissingTable();
            break;
          case "recover-cancel":
            clearRecovery();
            report("復旧を取り消しました。");
            break;
          case "clear":
            if (window.confirm("現在の背景進行表を空にします。続けますか？")) {
              newDraft();
            }
            break;
          default:
            break;
        }
      } catch (error) {
        report(error.message, true);
      }
    });

    root.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches("[data-bg-meta-field]")) {
        const field = target.dataset.bgMetaField;
        if (!field || !state.table) return;
        if (field === "table_date" && state.table.table_id) return;
        updateCurrentTableField(field, target.value);
        return;
      }
      if (target.matches("[data-row-field]")) {
        const rowIndex = Number(target.dataset.rowIndex);
        const field = target.dataset.rowField;
        if (Number.isNaN(rowIndex) || !field) return;
        updateRow(rowIndex, field, target.value);
      }
      if (target.matches("[data-recovery-title]")) {
        if (state.recoveryEntry) {
          state.recoveryEntry.title = target.value;
        }
      }
    });

    root.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.matches("[data-row-file]")) {
        const rowIndex = Number(target.dataset.rowFile);
        const file = target.files?.[0];
        if (Number.isNaN(rowIndex) || !file) return;
        try {
          await attachImage(rowIndex, file);
          report(`画像を設定しました: ${file.name}`);
        } catch (error) {
          report(error.message, true);
        } finally {
          target.value = "";
        }
      }
      if (target === refs.loadInput) {
        const file = target.files?.[0];
        if (!file) return;
        try {
          const parsed = JSON.parse(await file.text());
          const table = normalizeTable(parsed);
          if (table.document_type !== DOCUMENT_TYPE) {
            throw new Error(`未対応のdocument_typeです: ${String(table.document_type)}`);
          }
          clearRecovery();
          setTable(table, { table_id: table.table_id, table_date: table.table_date, title: table.title, has_json: true });
          localStorage.setItem(STORAGE_KEY, table.table_id);
          report(`JSONを読み込みました: ${file.name}`);
        } catch (error) {
          report(`読込を中止しました: ${error.message}`, true);
        } finally {
          target.value = "";
        }
      }
    });

    if (refs.createButton) {
      refs.createButton.addEventListener("click", () => {
        try {
          const tableDate = refs.createDate?.value || todayKey();
          const title = String(refs.createTitle?.value || "").trim();
          const draft = createTable({ tableId: "", tableDate, title });
          draft.items = [];
          clearRecovery();
          setTable(draft, null);
            report("空の背景進行表を作成しました。保存で表IDが発行されます。");
        } catch (error) {
          report(error.message, true);
        }
      });
    }
  }

  async function init() {
    if (state.ready) return;
    bindEvents();
    if (refs.createDate && !refs.createDate.value) {
      refs.createDate.value = todayKey();
    }
    await refreshManifest();
    state.ready = true;
    const remembered = localStorage.getItem(STORAGE_KEY);
    if (remembered) {
      try {
        await openTableById(remembered);
      } catch (error) {
        report(error.message, true);
      }
    }
  }

  function show() {
    root.hidden = false;
  }

  function hide() {
    root.hidden = true;
  }

  function getTable() {
    return state.table ? cloneTable(state.table) : null;
  }

  return {
    init,
    show,
    hide,
    refresh: refreshManifest,
    newDraft,
    openTableById,
    getTable,
    saveCurrentTable,
    exportHtmlDownload,
  };
}
