import {writingSample} from "../samples/sample-data.js";
import {normalizeDocument} from "../data_loader.js";
import {normalizeWritingAssetManifest,normalizeWritingPlotContent} from "./writing_asset_links.js";
import {renderWritingStatus,renderWritingSummary,writingStageLabel} from "./writing_status_view.js";
import {downloadFile} from "../shared/safe.js";
const el=id=>document.getElementById(id);let bundle,data,assets,plots;
function load(value){if(value?.schema_version!==1||!Array.isArray(value.project?.items)||!value.project.items.length||value.project.items.length>100)throw Error("章の入力がないか、形式が不正です。");
 const next=normalizeDocument(value.project),a=normalizeWritingAssetManifest(value.manifest),p=normalizeWritingPlotContent(value.plots);
 if(next.validation.duplicateIdCount||a.warnings.length||p.warnings.length||next.items.some(i=>!a.entries.some(e=>e.issue_number===i.issueNumber)))throw Error("章IDや関連資料の対応を確認してください。");
 next.items.forEach(i=>i.repository="demo/fiction");
 bundle=structuredClone(value);data=next;assets=a;plots=p;el("writingStageFilter").value="all";render();}
function render(){const f=el("writingStageFilter"),v=f.value||"all",r=renderWritingStatus(data.items,data.metadata,v,el("writingIssueList"),el("writingStageCounts"),assets.entries,plots.entries);renderWritingSummary(r.scenarioItems,el("writingSummaryCards"));f.replaceChildren();for(const [value,label] of [["all","すべての工程"],...r.order.map(s=>[s,writingStageLabel(s)])]){const o=document.createElement("option");o.value=value;o.textContent=label;f.append(o)}f.value=v;el("writingStatusMessage").textContent=`登録された章: ${r.scenarioItems.length}件`;}
el("writingStageFilter").onchange=render;el("demo-reset").onclick=()=>{load(writingSample);el("demo-status").textContent="合成例を表示しました。"};el("demo-export").onclick=()=>downloadFile("writing-demo.json",JSON.stringify(bundle,null,2));
el("demo-import").onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2000000)throw Error("JSONは2MB以内です。");load(JSON.parse(await f.text()));el("demo-status").textContent="JSONの表示を復元しました。"}catch(error){el("demo-status").textContent="復元失敗: "+error.message}finally{e.target.value=""}};
window.WritingDemo={snapshot:()=>structuredClone(bundle),load};load(writingSample);
