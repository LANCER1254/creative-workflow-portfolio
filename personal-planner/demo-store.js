'use strict';
(()=>{
 const prefix='creative-workflow-portfolio.personal-planner.v1.',model=window.PersonalDemoModel;
 const stamp=()=>globalThis.crypto?.randomUUID?.()||('demo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2)),reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const day=offset=>{const d=new Date(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
 function seed(kind){
  if(kind==='tasks')return {version:1,notes:[['図書館へ本を返す','life','todo',0],['机まわりを整える','life','doing',1],['散歩に出かける','life','done',0],['季節の服を整理する','life','hold',3],['展示会のチケットを探す','hobby','todo',2],['ノートを買う','shopping','todo',4]].map(([title,category,status,offset],i)=>({id:'demo-task-'+i,title,body:'',category,status,nextAction:'公開デモの合成サンプルです。編集して試してください。',plannedDate:day(offset),externalDeadline:'',budget:category==='shopping'?'800':'',url:'',priceObservedAt:'',priceSource:''}))};
  return {version:1,events:[['カフェで読書','life',0,'14:00','15:00'],['短編のアイデアメモ','work',1,'18:00','18:30'],['美術館に行く','hobby',3,'',''],['週末の買い物','shopping',5,'11:00','12:00']].map(([title,category,offset,startTime,endTime],i)=>({id:'demo-event-'+i,title,date:day(offset),startTime,endTime,category,status:'planned',description:'架空の予定です。実際の予約・通知は行いません。',linkedCardId:''}))};
 }
 const validate=(kind,data)=>kind==='tasks'?model.validateDocument(data):model.validateCalendar(data);
 function read(kind){
  const raw=localStorage.getItem(prefix+kind);
  if(raw===null){const record={data:seed(kind),revision:stamp(),runId:null,operation:null};validate(kind,record.data);localStorage.setItem(prefix+kind,JSON.stringify(record));return record;}
  const record=JSON.parse(raw);validate(kind,record.data);if(typeof record.revision!=='string')throw Error('INVALID_SAVED_DATA');return record;
 }
 async function request(kind,options={}){
  if(!['tasks','calendar'].includes(kind))return reply({error:'UNKNOWN_DEMO_STORE'},404);
  const method=(options.method||'GET').toUpperCase();
  if(method==='GET'){try{const r=read(kind);return reply({data:r.data,revision:r.revision});}catch{return reply({error:'READ_FAILED'},503);}}
  if(method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const commit=()=>{
   try{
    const body=JSON.parse(options.body||'null');if(!body||typeof body.runId!=='string'||body.runId.length>120||typeof body.expectedRevision!=='string')return reply({error:'INVALID_REQUEST'},400);
    const old=read(kind),operation=JSON.stringify(body.operation);
    if(old.runId===body.runId){if(old.operation!==operation)return reply({error:'RUN_ID_CONFLICT'},409);return reply({revision:old.revision});}
    if(body.expectedRevision!==old.revision)return reply({error:'REVISION_CONFLICT'},409);
    const data=kind==='tasks'?model.applyOperation(old.data,body.operation):model.applyCalendarOperation(old.data,body.operation),next={data,revision:stamp(),runId:body.runId,operation};
    // Keep a second revision check for browsers without Web Locks. This fallback
    // detects ordinary stale writes but is not a cross-tab atomic guarantee.
    if(read(kind).revision!==old.revision)return reply({error:'REVISION_CONFLICT'},409);
    localStorage.setItem(prefix+kind,JSON.stringify(next));
    const check=read(kind);if(check.revision!==next.revision)return reply({error:'READBACK_CONFLICT'},409);
    return reply({revision:check.revision});
   }catch(e){return reply({error:e.code||'SAVE_UNCONFIRMED'},e.status||503);}
  };
  try{return navigator.locks?.request?await navigator.locks.request(prefix+kind,commit):commit();}catch{return reply({error:'SAVE_UNCONFIRMED'},503);}
 }
 window.PersonalDemoStore=Object.freeze({request,uuid:stamp});
 document.getElementById('reset-demo').onclick=async()=>{
  if(!confirm('このデモの生活タスクと予定を合成サンプルに戻しますか？必要な内容は先にJSONで保存してください。'))return;
  const reset=kind=>{const record={data:seed(kind),revision:stamp(),runId:null,operation:null};localStorage.setItem(prefix+kind,JSON.stringify(record));};
  try{for(const kind of ['tasks','calendar']){if(navigator.locks?.request)await navigator.locks.request(prefix+kind,()=>reset(kind));else reset(kind);}location.reload();}catch{alert('サンプルへの復元を確認できませんでした。ブラウザの保存設定を確認してください。');}
 };
})();
