import {storyboardSample} from "../samples/sample-data.js";
import {readSafeImage,downloadFile} from "../shared/safe.js";
import { SCHEMA_VERSION, createDocument, createPanel, movePanel, normalizeDocument } from "./model.js";
import { createBackgroundProgressApp } from "../background_progress/app.js";

let documentState = createDocument();
const byId = (id) => document.getElementById(id);
const sceneFields = [...document.querySelectorAll("[data-scene-field]")];
const panelList = byId("panelList");
const panelTemplate = byId("panelTemplate");
const editorView = byId("editorView");
const sheetView = byId("sheetView");
const sheetSceneInfo = byId("sheetSceneInfo");
const sheetPanelList = byId("sheetPanelList");
const storyboardMode = byId("storyboardMode");
const backgroundProgressMode = byId("backgroundProgressMode");
const storyboardModeButton = byId("storyboardModeButton");
const backgroundProgressModeButton = byId("backgroundProgressModeButton");
const jsonDropZone = byId("jsonDropZone");

function setStatus(message, isError = false) { const target = byId("statusMessage"); target.textContent = message; target.classList.toggle("error", isError); }
function safeName(value) { return (value || "storyboard").replace(/[^0-9A-Za-z._-]+/g, "_").replace(/^_+|_+$/g, "") || "storyboard"; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
async function readFileAsDataUrl(file) { return readSafeImage(file); }
function isSupportedImage(file) { return ["image/png", "image/jpeg"].includes(file.type) || /\.(png|jpe?g)$/i.test(file.name); }
function imageKindLabel(kind) { return kind === "image" ? "絵コンテ画像" : "背景ラフ"; }
function clearBackgroundRough(panel) { panel.background_data_url = ""; panel.background_name = ""; }

async function setPanelImage(panel, kind, file) {
  if (!isSupportedImage(file)) { setStatus("PNGまたはJPG/JPEGだけを選択してください。", true); return false; }
  try {
    panel[`${kind}_data_url`] = await readFileAsDataUrl(file); panel[`${kind}_name`] = file.name;
    renderPanels(); setStatus(`${imageKindLabel(kind)}を設定しました: ${file.name}`); return true;
  } catch (error) { setStatus(error.message, true); return false; }
}

function setupImageDropZone(zone) {
  const kind = zone.dataset.dropKind;
  let dragDepth = 0;
  const isFileDrag = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
  zone.addEventListener("dragenter", (event) => { if (!isFileDrag(event)) return; event.preventDefault(); dragDepth += 1; zone.classList.add("is-dragging"); });
  zone.addEventListener("dragover", (event) => { if (!isFileDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
  zone.addEventListener("dragleave", (event) => { if (!isFileDrag(event)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) zone.classList.remove("is-dragging"); });
  zone.addEventListener("drop", async (event) => { event.preventDefault(); dragDepth = 0; zone.classList.remove("is-dragging"); const panel = panelFor(zone); const file = event.dataTransfer?.files?.[0]; if (panel && file) await setPanelImage(panel, kind, file); });
}

async function loadStoryboardJson(url, label = url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  documentState = normalizeDocument(await response.json());
  render();
  setStatus(`JSONを読み込みました: ${label}`);
}

function isSupportedJsonFile(file) { return file && /\.json$/i.test(file.name); }
async function loadStoryboardJsonFile(file) {
  if (!isSupportedJsonFile(file)) { setStatus("JSONファイル（.json）だけを選択してください。", true); return false; }
  try {
    documentState = normalizeDocument(JSON.parse(await file.text()));
    render();
    setStatus(`JSONを読み込みました: ${file.name}`);
    return true;
  } catch (error) {
    setStatus(`読込を中止しました: ${error.message}`, true);
    return false;
  }
}

function setupJsonDropZone(zone) {
  if (!zone) return;
  let dragDepth = 0;
  const isFileDrag = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
  zone.addEventListener("dragenter", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth += 1;
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("dragover", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) zone.classList.remove("is-dragging");
  });
  zone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dragDepth = 0;
    zone.classList.remove("is-dragging");
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length > 1) { setStatus("複数ファイルは読み込めません。JSONファイルを1つだけドロップしてください。", true); return; }
    if (files[0]) await loadStoryboardJsonFile(files[0]);
  });
}

function requestedJsonUrl() {
  const value = new URLSearchParams(window.location.search).get("json");
  if (!value) return null;
  const url = new URL(value.startsWith("/") ? value : `/${value}`, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/")) throw new Error("読込先JSONのURLが不正です。");
  return url;
}

const backgroundProgressApp = createBackgroundProgressApp(backgroundProgressMode);

function setMode(mode) {
  const nextMode = mode === "background" ? "background" : "storyboard";
  localStorage.setItem("public.production.mode.r01", nextMode);
  storyboardMode.hidden = nextMode !== "storyboard";
  backgroundProgressMode.hidden = nextMode !== "background";
  storyboardModeButton.setAttribute("aria-pressed", String(nextMode === "storyboard"));
  backgroundProgressModeButton.setAttribute("aria-pressed", String(nextMode === "background"));
  if (nextMode === "background") {
    backgroundProgressApp.show();
    backgroundProgressApp.refresh().catch((error) => setStatus(`背景進行モードの更新に失敗しました: ${error.message}`, true));
  } else {
    backgroundProgressApp.hide();
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderScene() { sceneFields.forEach((field) => { field.value = documentState.scene[field.dataset.sceneField] ?? ""; }); }
function panelFor(target) { const card = target.closest(".panel-card"); return documentState.panels.find((panel) => panel.id === card?.dataset.panelId); }

function renderPanels() {
  panelList.replaceChildren();
  documentState.panels.forEach((panel, index) => {
    const fragment = panelTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".panel-card"); card.dataset.panelId = panel.id;
    fragment.querySelector(".panel-index").textContent = String(panel.number);
    fragment.querySelectorAll("[data-panel-field]").forEach((field) => {
      if (field.type === "checkbox") field.checked = Boolean(panel[field.dataset.panelField]);
      else field.value = panel[field.dataset.panelField] ?? "";
    });
    const background = fragment.querySelector(".background-preview");
    const image = fragment.querySelector(".image-preview");
    const placeholder = fragment.querySelector(".image-placeholder");
    if (panel.background_data_url && panel.background_visible) { background.src = panel.background_data_url; background.hidden = false; }
    if (panel.image_data_url) { image.src = panel.image_data_url; image.hidden = false; placeholder.hidden = true; }
    fragment.querySelector(".image-name").textContent = panel.image_name ? `絵コンテ画像: ${panel.image_name}` : "";
    fragment.querySelector(".background-name").textContent = panel.background_name ? `背景ラフ: ${panel.background_name}` : "";
    fragment.querySelector("[data-action='delete-background']").disabled = !panel.background_data_url;
    fragment.querySelector("[data-action='move-up']").disabled = index === 0;
    fragment.querySelector("[data-action='move-down']").disabled = index === documentState.panels.length - 1;
    fragment.querySelectorAll("[data-drop-kind]").forEach(setupImageDropZone);
    panelList.append(fragment);
  });
  byId("panelCount").textContent = `${documentState.panels.length}コマ`;
}
function sheetValue(value) { return value || "—"; }
function appendSheetField(parent, label, value) {
  const field = document.createElement("section"); field.className = "sheet-field";
  const heading = document.createElement("h3"); heading.textContent = label;
  const content = document.createElement("p"); content.textContent = sheetValue(value);
  field.append(heading, content); parent.append(field);
}
function appendSheetImage(stage, className, source, alt) {
  if (!source) return false;
  const image = document.createElement("img"); image.className = className; image.src = source; image.alt = alt || "";
  stage.append(image); return true;
}
function renderSheet() {
  sheetSceneInfo.replaceChildren(); sheetPanelList.replaceChildren();
  const title = document.createElement("h2"); title.textContent = documentState.scene.name || "無題のシーン";
  const meta = document.createElement("p");
  const stillType = documentState.scene.still_type === "normal" ? "通常スチル" : "SDスチル";
  meta.textContent = [documentState.scene.episode, documentState.scene.purpose, stillType, documentState.scene.canvas_size, documentState.scene.aspect_ratio].filter(Boolean).join(" / ") || "シーン情報は未入力です。";
  const notes = document.createElement("p"); notes.className = "sheet-scene-notes"; notes.textContent = documentState.scene.notes || "";
  sheetSceneInfo.append(title, meta); if (documentState.scene.notes) sheetSceneInfo.append(notes);
  documentState.panels.forEach((panel) => {
    const article = document.createElement("article"); article.className = "sheet-panel";
    const heading = document.createElement("header"); heading.className = "sheet-panel-heading";
    const headingTitle = document.createElement("h2"); headingTitle.textContent = `コマ ${panel.number}`;
    heading.append(headingTitle); article.append(heading);
    const layout = document.createElement("div"); layout.className = "sheet-panel-layout";
    const stage = document.createElement("div"); stage.className = "sheet-stage";
    const hasBackground = panel.background_visible && appendSheetImage(stage, "sheet-background", panel.background_data_url, panel.background_name);
    const hasImage = appendSheetImage(stage, "sheet-image", panel.image_data_url, panel.image_name);
    if (!hasBackground && !hasImage) { const placeholder = document.createElement("p"); placeholder.className = "sheet-placeholder"; placeholder.textContent = "絵コンテ画像は未登録です"; stage.append(placeholder); }
    const fields = document.createElement("div"); fields.className = "sheet-fields";
    appendSheetField(fields, "シナリオ", panel.scenario);
    appendSheetField(fields, "演出意図", panel.direction);
    appendSheetField(fields, "カメラ・構図", panel.camera);
    appendSheetField(fields, "キャラクター配置", panel.characters);
    appendSheetField(fields, "備考", panel.memo);
    layout.append(stage, fields); article.append(layout); sheetPanelList.append(article);
  });
}
function render() { renderScene(); renderPanels(); if (!sheetView.hidden) renderSheet(); }

sceneFields.forEach((field) => field.addEventListener("input", () => { documentState.scene[field.dataset.sceneField] = field.value; }));
panelList.addEventListener("input", (event) => {
  const field = event.target.closest("[data-panel-field]"); if (!field || field.type === "checkbox") return;
  const panel = panelFor(field); if (!panel) return;
  panel[field.dataset.panelField] = field.dataset.panelField === "number" ? Number(field.value) || 1 : field.value;
});
panelList.addEventListener("change", async (event) => {
  const field = event.target;
  if (field.matches("[data-panel-field='background_visible']")) { const panel = panelFor(field); if (panel) { panel.background_visible = field.checked; renderPanels(); } return; }
  const kind = field.dataset.action; if (!["image", "background"].includes(kind)) return;
  const panel = panelFor(field); const file = field.files?.[0]; if (!panel || !file) return;
  await setPanelImage(panel, kind, file); field.value = "";
});
document.addEventListener("dragover", (event) => { if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault(); });
document.addEventListener("drop", (event) => { if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault(); });
panelList.addEventListener("click", (event) => {
  const action = event.target.dataset.action; if (!action) return;
  const panel = panelFor(event.target); if (!panel) return; const index = documentState.panels.indexOf(panel);
  if (action === "delete-background") { clearBackgroundRough(panel); renderPanels(); setStatus(`コマ ${panel.number} の背景ラフ画像を削除しました。`); return; }
  if (action === "delete") { if (window.confirm(`コマ ${panel.number} を削除しますか？`)) { documentState.panels.splice(index, 1); documentState.panels.forEach((item, itemIndex) => { item.number = itemIndex + 1; }); renderPanels(); } }
  if (action === "move-up" || action === "move-down") { movePanel(documentState, index, action === "move-up" ? -1 : 1); renderPanels(); }
});

byId("addPanelButton").addEventListener("click", () => { documentState.panels.push(createPanel(documentState.panels.length + 1)); renderPanels(); });
byId("eightPanelButton").addEventListener("click", () => { while (documentState.panels.length < 8) documentState.panels.push(createPanel(documentState.panels.length + 1)); renderPanels(); setStatus("8コマ雛形を準備しました。"); });
byId("saveJsonButton").addEventListener("click", () => { download(`${safeName(documentState.scene.name)}_storyboard.json`, JSON.stringify(documentState, null, 2), "application/json;charset=utf-8"); setStatus("JSONを保存しました。画像を含むJSONは大きくなることがあります。"); });
byId("loadJsonInput").addEventListener("change", async (event) => { const files = [...(event.target.files || [])]; if (files.length > 1) setStatus("複数ファイルは読み込めません。JSONファイルを1つだけ選択してください。", true); else if (files[0]) await loadStoryboardJsonFile(files[0]); event.target.value = ""; });
setupJsonDropZone(jsonDropZone);
byId("resetButton").addEventListener("click", () => { if (window.confirm("現在の入力内容を初期化します。保存していない内容は失われます。続けますか？")) { documentState = createDocument(); render(); setStatus("入力内容を初期化しました。"); } });
byId("printButton").addEventListener("click", () => window.print());
byId("sheetViewButton").addEventListener("click", () => { renderSheet(); editorView.hidden = true; sheetView.hidden = false; window.scrollTo({ top: 0, behavior: "instant" }); });
byId("editorViewButton").addEventListener("click", () => { sheetView.hidden = true; editorView.hidden = false; window.scrollTo({ top: 0, behavior: "instant" }); });
byId("sheetPrintButton").addEventListener("click", () => window.print());
storyboardModeButton.addEventListener("click", () => setMode("storyboard"));
backgroundProgressModeButton.addEventListener("click", () => setMode("background"));

function exportField(label, value) { return value ? `<dl><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></dl>` : ""; }
function exportHtml() {
  const panels = documentState.panels.map((panel) => `<article class="frame"><h2>コマ ${panel.number}</h2><div class="frame-grid"><div class="stage">${panel.background_data_url && panel.background_visible ? `<img class="background" src="${panel.background_data_url}" alt="${escapeHtml(panel.background_name)}">` : ""}${panel.image_data_url ? `<img class="rough" src="${panel.image_data_url}" alt="${escapeHtml(panel.image_name)}">` : ""}</div><section>${exportField("シナリオ本文", panel.scenario)}${exportField("演出意図", panel.direction)}${exportField("カメラ・構図", panel.camera)}${exportField("キャラクター配置", panel.characters)}${exportField("備考", panel.memo)}</section></div></article>`).join("\n");
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><title>${escapeHtml(documentState.scene.name || "Storyboard")}</title><style>body{font-family:system-ui,sans-serif;color:#182231;margin:0;padding:24px;line-height:1.55}.sheet{max-width:1200px;margin:auto}.meta,.frame{border:1px solid #aab5c4;border-radius:10px;padding:18px;margin:16px 0}.frame{break-after:page}.frame-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,1fr);gap:18px}.stage{position:relative;min-height:320px;background:#eef2f6;overflow:hidden}.stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.background{opacity:.72}.rough{z-index:1}dt{font-weight:700;margin-top:12px}dd{white-space:pre-wrap;margin:2px 0}@media(max-width:700px){.frame-grid{grid-template-columns:1fr}}@media print{body{padding:0}.meta,.frame{border:0;border-radius:0;margin:0 0 18px;padding:0}.frame{break-after:page}}</style><main class="sheet"><h1>🎬 絵コンテ発注確認資料</h1><p>作成日時: ${new Date().toLocaleString("ja-JP")}</p><section class="meta"><h2>${escapeHtml(documentState.scene.name || "無題のシーン")}</h2>${exportField("エピソード／参照", documentState.scene.episode)}${exportField("使用目的", documentState.scene.purpose)}${exportField("スチル区分", documentState.scene.still_type === "normal" ? "通常スチル" : "SDスチル")}${exportField("補足", documentState.scene.notes)}</section>${panels}</main></html>`;
}
byId("exportHtmlButton").addEventListener("click", () => { download(`${safeName(documentState.scene.name)}_storyboard_review.html`, exportHtml(), "text/html;charset=utf-8"); setStatus("発注確認用の単体HTMLを書き出しました。"); });

window.BackgroundDemo = backgroundProgressApp;
window.StoryboardMvp = { getDocument: () => structuredClone(documentState), setDocument: (value) => { documentState = normalizeDocument(value); render(); }, exportHtml, schemaVersion: SCHEMA_VERSION };
documentState = normalizeDocument(storyboardSample);
render();
document.getElementById("demo-story-sample").onclick=()=>{documentState=normalizeDocument(storyboardSample);render();setStatus("合成サンプルに戻しました。");};
document.getElementById("demo-bg-json").onclick=()=>{const table=backgroundProgressApp.getTable();if(!table)return setStatus("背景進行表を開いてください",true);downloadFile("background-demo.json",JSON.stringify(table,null,2));};

try {
  const jsonUrl = requestedJsonUrl();
  if (jsonUrl) await loadStoryboardJson(jsonUrl, decodeURIComponent(jsonUrl.pathname.split("/").pop() || jsonUrl.pathname));
} catch (error) {
  setStatus(`起動時JSONの読込に失敗しました: ${error.message}`, true);
}

backgroundProgressApp.init().then(async () => {
  await backgroundProgressApp.openTableById("2026-01-01_001").catch(()=>{});
  const rememberedMode = new URLSearchParams(location.search).get("mode") || localStorage.getItem("public.production.mode.r01") || "storyboard";
  setMode(rememberedMode);
}).catch((error) => {
  setStatus(`背景進行モードの初期化に失敗しました: ${error.message}`, true);
  setMode("storyboard");
});
