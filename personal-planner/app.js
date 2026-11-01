'use strict';
(()=>{
const $=x=>document.getElementById(x),labels={todo:'未着手',doing:'進行中',hold:'保留',done:'完了'};
let data=null,revision=null,category='life',editing=null,busy=false;
const say=t=>$('status').textContent=t;
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

function dashboard(shown){
 const all=data.notes,group=all.filter(n=>n.category===category),done=group.filter(n=>n.status==='done').length,percent=group.length?Math.round(done/group.length*100):0;
 $('today-date').textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date());
 $('progress-ring').style.setProperty('--progress',percent+'%');$('progress-count').textContent=done+' / '+group.length;$('progress-percent').replaceChildren(document.createTextNode(String(percent)),el('small','%'));
 for(const state of ['done','doing','hold'])$('count-'+state).textContent=group.filter(n=>n.status===state).length;
 $('progress-message').textContent=!group.length?'最初のタスクを、ひとつ置いてみよう。':percent===100?'すべて完了。おつかれさま！ ✧':'ひとつずつ、自分のペースで。';
 document.querySelectorAll('[data-count]').forEach(e=>e.textContent=all.filter(n=>n.category===e.dataset.count).length);
 const names={life:'生活',hobby:'趣味',shopping:'購入・セール待ち'};
 $('list-heading').replaceChildren(document.createTextNode(names[category]+'のタスク '),Object.assign(el('span',shown.length+'件'),{className:'count-pill'}));
 $('upcoming').replaceChildren();const future=all.filter(n=>n.plannedDate&&n.plannedDate>=today()&&n.status!=='done').sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate)).slice(0,4);
 for(const n of future){const box=el('div','');box.className='schedule-item';const t=el('time',n.plannedDate+' · '+names[n.category]);t.dateTime=n.plannedDate;box.append(t,el('p',n.title));$('upcoming').append(box);}
 if(!future.length){const e=el('p','これからの予定はまだありません。本人予定日を入れると、ここに表示されます。');e.className='schedule-empty';$('upcoming').append(e);}
}

function render(){
 $('list').replaceChildren();if(!data)return;
 const shown=data.notes.filter(n=>n.category===category&&($('filter').value==='all'||($('filter').value==='open'?n.status!=='done':n.status===$('filter').value))&&($('due').value==='all'||($('due').value==='undated'?!n.externalDeadline:!!n.externalDeadline&&n.externalDeadline<today()&&n.status!=='done'))&&[n.title,n.nextAction].join(' ').toLowerCase().includes($('search').value.toLowerCase()));
 dashboard(shown);
 for(const n of shown){const a=el('article','');a.dataset.state=n.status;a.append(el('h2',n.title),el('p',labels[n.status]+' · 予定 '+(n.plannedDate||'未指定')+' · 相手期限 '+(n.externalDeadline||'未指定')+(n.externalDeadline&&n.externalDeadline<today()&&n.status!=='done'?' ⚠ 期限超過':'')),el('p',n.nextAction||'次の行動は未記入'));
 if(n.budget)a.append(el('p','予算 '+n.budget+'円'));
 if(n.priceObservedAt||n.priceSource)a.append(el('p','価格情報の確認：'+(n.priceObservedAt||'未確認')+'／出典 '+(n.priceSource||'未確認')+'（現在価格の自動取得なし）'));
 if(/^https?:\/\//.test(n.url||'')){const link=el('a','資料を開く');link.href=n.url;link.target='_blank';link.rel='noopener noreferrer';a.append(link);}
 a.querySelector('p').className='task-meta';
 const b=el('button','編集：'+n.title);b.onclick=()=>open(n);a.append(b);$('list').append(a);}
 if(!shown.length)$('list').append(el('p','この条件のタスクはありません。'));
}
function open(note){editing=note?.id||null;for(const f of ['title','nextAction','plannedDate','externalDeadline','budget','url','priceObservedAt','priceSource'])$(f).value=note?.[f]||'';$('category').value=note?.category||category;$('state').value=note?.status||'todo';$('editor-title').textContent=note?'タスクを編集':'タスクを追加';$('editor').hidden=false;$('editor').scrollIntoView({block:'nearest',behavior:'auto'});$('title').focus();}
async function load(){if(busy)return;busy=true;say('取得中…');try{const r=await window.PersonalDemoStore.request('tasks',{cache:'no-store'});if(r.status===401)throw Error('SIGN_IN_REQUIRED');if(!r.ok)throw Error('READ_FAILED');const v=await r.json();if(!Array.isArray(v.data?.notes))throw Error('INVALID_DATA');data=v.data;revision=v.revision;$('signin').hidden=true;render();say('保存データを読込済み · '+data.notes.length+'件 · ブラウザ内保存 · 合成サンプルの公開デモ');}catch(e){data=null;$('list').replaceChildren();$('progress-count').textContent='— / —';$('progress-percent').textContent='—';$('progress-ring').style.setProperty('--progress','0%');$('upcoming').replaceChildren();if(e.message==='SIGN_IN_REQUIRED'){$('signin').hidden=false;say('デモの保存データを読めませんでした。');}else{say('取得失敗・件数未確認：'+e.message);}}finally{busy=false;}}
async function write(operation){if(busy||!data){say('取得できていないため保存できません。再読込してください。');return false;}busy=true;$('save').disabled=true;try{const r=await window.PersonalDemoStore.request('tasks',{method:'POST',headers:{'Content-Type':'application/json','X-Personal-Tasks':'1'},body:JSON.stringify({expectedRevision:revision,runId:window.PersonalDemoStore.uuid(),operation})});const v=await r.json();if(!r.ok)throw Error(v.error||'SAVE_FAILED');revision=v.revision;const check=await window.PersonalDemoStore.request('tasks',{cache:'no-store'});if(!check.ok)throw Error('READBACK_FAILED');const c=await check.json();if(c.revision!==revision)throw Error('READBACK_CONFLICT');data=c.data;render();say('保存・読み戻し確認済み · ブラウザ内保存');return true;}catch(e){say('未保存／要確認：'+e.message+'。入力を保持しました。競合時は入力を控えて再読込してください。');return false;}finally{busy=false;$('save').disabled=false;}}
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.category===category)));render();});
for(const f of ['search','filter','due'])$(f).addEventListener(f==='search'?'input':'change',render);
$('new').onclick=()=>open(null);$('cancel').onclick=()=>{$('editor').hidden=true;};$('reload').onclick=load;
$('editor').onsubmit=async e=>{e.preventDefault();const old=data?.notes.find(n=>n.id===editing)||{};const note={...old,id:editing||window.PersonalDemoStore.uuid(),body:old.body||'',title:$('title').value,category:$('category').value,status:$('state').value};for(const f of ['nextAction','plannedDate','externalDeadline','budget','url','priceObservedAt','priceSource'])note[f]=$(f).value;if(await write({type:'upsert',note})){$('editor').hidden=true;}};
$('export').onclick=()=>{if(!data){say('未取得のため書出しできません');return;}const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a','');a.href=url;a.download='personal-tasks-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=async()=>{const file=$('import').files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('TOO_LARGE');const next=JSON.parse(await file.text());if(!confirm('現在の個人タスクをバックアップJSONで置き換えますか？'))return;await write({type:'replace',data:next});}catch(e){say('復元未実施：'+e.message);}finally{$('import').value='';}};
load();
})();
