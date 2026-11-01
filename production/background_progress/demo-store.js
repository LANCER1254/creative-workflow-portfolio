import {backgroundSample} from "../samples/sample-data.js";
import {normalizeTable,nextTableId,buildExportHtml} from "./model.js";
export const KEY="public.production.background.r01";
let seen=null;
function read(){const raw=localStorage.getItem(KEY);if(raw===null)return {version:1,tables:[structuredClone(backgroundSample)]};const d=JSON.parse(raw);if(d.version!==1||!Array.isArray(d.tables))throw Error("保存データが破損しています。JSONバックアップを確認してください。");d.tables=d.tables.map(normalizeTable);return d;}
function entry(t){return {table_id:t.table_id,table_date:t.table_date,title:t.title,has_json:true,updated_at:t.updated_at,created_at:t.created_at,row_count:t.items.length};}
export function htmlUrl(t){return URL.createObjectURL(new Blob([buildExportHtml(t)],{type:"text/html;charset=utf-8"}));}
export async function demoFetch(url,options={}){
 try{const u=new URL(url,location.href);if(u.origin!==location.origin||!u.pathname.startsWith("/api/background-progress/"))throw Error("対象外の操作です");
 const raw=localStorage.getItem(KEY),d=read();
 if(!options.method||options.method==="GET") {seen=raw;if(u.pathname.endsWith("/manifest"))return Response.json({tables:d.tables.map(entry)});const t=d.tables.find(t=>t.table_id===u.searchParams.get("table_id"));if(!t)throw Error("背景進行表が見つかりません");return Response.json(t);}
 if(options.method!=="POST")throw Error("対象外の操作です");if(raw!==seen)throw Error("別タブで更新されています。一覧更新して確認してください。");
 const t=JSON.parse(options.body).table;if(!t.table_id)t.table_id=nextTableId(d.tables,t.table_date);const normalized=normalizeTable(t);const i=d.tables.findIndex(x=>x.table_id===normalized.table_id);if(i<0)d.tables.push(normalized);else d.tables[i]=normalized;
 const next=JSON.stringify(d);if(next.length>5000000)throw Error("保存サイズが大きすぎます。画像を減らしてJSONへ退避してください。");localStorage.setItem(KEY,next);seen=next;
 return Response.json({table:normalized,entry:entry(normalized),html_url:htmlUrl(normalized)});
 }catch(e){return Response.json({message:e.message},{status:409})}
}
