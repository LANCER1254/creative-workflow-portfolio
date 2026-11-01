import {safeDataImage,uniqueIds} from "../shared/safe.js";
export const SCHEMA_VERSION = 2;

const SCENE_FIELDS = ["name", "episode", "purpose", "still_type", "canvas_size", "aspect_ratio", "notes"];
const PANEL_FIELDS = [
  "number", "image_name", "image_data_url", "background_name", "background_data_url",
  "scenario", "direction", "camera", "characters", "memo", "performance",
];

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `panel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createPanel(number) {
  return {
    id: newId(), number,
    image_name: "", image_data_url: "",
    background_name: "", background_data_url: "", background_visible: true,
    scenario: "", direction: "", camera: "", characters: "", memo: "", performance: "",
  };
}

export function createDocument() {
  return {
    schema_version: SCHEMA_VERSION,
    scene: { name: "", episode: "", purpose: "", still_type: "sd", canvas_size: "", aspect_ratio: "", notes: "" },
    panels: [],
  };
}

function stringValue(value) { return typeof value === "string" ? value : ""; }

function normalizePanel(panel, index, schemaVersion) {
  if (!panel || typeof panel !== "object" || Array.isArray(panel)) throw new Error(`panels[${index}]が不正です。`);
  const normalized = Object.fromEntries(PANEL_FIELDS.map((key) => [key, key === "number" ? Number(panel[key]) || index + 1 : (key.endsWith("_data_url") ? safeDataImage(stringValue(panel[key])) : stringValue(panel[key]))]));
  normalized.id = typeof panel.id === "string" && panel.id ? panel.id : newId();
  normalized.background_visible = typeof panel.background_visible === "boolean" ? panel.background_visible : true;
  if (schemaVersion === 1) {
    normalized.scenario = stringValue(panel.description);
    normalized.memo = stringValue(panel.art_notes);
  }
  return normalized;
}

export function normalizeDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSONのルートはオブジェクトである必要があります。");
  const schemaVersion = value.schema_version;
  if (schemaVersion !== 1 && schemaVersion !== SCHEMA_VERSION) throw new Error(`未対応のschema_versionです: ${String(schemaVersion)}`);
  if (!value.scene || typeof value.scene !== "object" || Array.isArray(value.scene)) throw new Error("sceneが不正です。");
  if (!Array.isArray(value.panels)) throw new Error("panelsは配列である必要があります。");
  uniqueIds(value.panels);
  if(value.panels.length>100)throw Error("100コマ以内にしてください。");
  const scene = Object.fromEntries(SCENE_FIELDS.map((key) => [key, key === "still_type" ? (value.scene[key] === "normal" ? "normal" : "sd") : stringValue(value.scene[key])]));
  return { schema_version: SCHEMA_VERSION, scene, panels: value.panels.map((panel, index) => normalizePanel(panel, index, schemaVersion)) };
}

export function renumberPanels(document) {
  document.panels.forEach((panel, index) => { panel.number = index + 1; });
}

export function movePanel(document, index, direction) {
  const next = index + direction;
  if (next < 0 || next >= document.panels.length) return false;
  [document.panels[index], document.panels[next]] = [document.panels[next], document.panels[index]];
  renumberPanels(document);
  return true;
}
