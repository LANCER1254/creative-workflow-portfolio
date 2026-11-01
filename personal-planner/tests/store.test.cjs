const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const map=new Map([['unrelated','keep']]),button={};
 const context=vm.createContext({window:{},navigator:{},document:{getElementById:()=>button},localStorage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},Response,TextEncoder,URL,Intl,Date,Math,confirm:()=>true,location:{reload(){}},alert(){}});
 for(const f of ['model.js','demo-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),context);
 const api=context.window.PersonalDemoStore;
 const get=async k=>(await api.request(k)).json();
 const post=(k,revision,operation,runId='test-'+Math.random())=>api.request(k,{method:'POST',body:JSON.stringify({expectedRevision:revision,operation,runId})});
 return {map,button,get,post};
}
test('synthetic seeds, persistence, stale writes, retries and invalid URLs',async()=>{
 const {get,post}=setup(),old=await get('tasks');assert.equal(old.data.notes.length,6);
 const note={...old.data.notes[0],title:'Edited'};
 const result=await post('tasks',old.revision,{type:'upsert',note},'run-1');assert.equal(result.status,200);
 assert.equal((await get('tasks')).data.notes[0].title,'Edited');
 assert.equal((await post('tasks',old.revision,{type:'upsert',note},'run-1')).status,200);
 assert.equal((await post('tasks',old.revision,{type:'upsert',note:{...note,title:'Lost'}})).status,409);
 const current=await get('tasks');assert.equal((await post('tasks',current.revision,{type:'upsert',note:{...note,url:'javascript:alert(1)'}})).status,400);
 assert.equal((await get('tasks')).revision,current.revision);
});
test('calendar duplicate detection, cancellation history and isolated stores',async()=>{
 const {get,post}=setup(),old=await get('calendar'),tasks=await get('tasks');
 assert.equal(old.data.events.length,4);
 assert.equal((await post('calendar',old.revision,{type:'upsert',event:{...old.data.events[0],id:'duplicate'}})).status,409);
 assert.equal((await post('calendar',old.revision,{type:'upsert',event:{...old.data.events[0],status:'cancelled'}})).status,200);
 assert.equal((await get('calendar')).data.events[0].status,'cancelled');
 assert.equal((await get('tasks')).revision,tasks.revision);
});
test('corrupt storage is retained and reset touches only demo keys',async()=>{
 const {map,get,button}=setup(),key='creative-workflow-portfolio.personal-planner.v1.tasks';
 map.set(key,'broken');assert.equal((await get('tasks')).error,'READ_FAILED');assert.equal(map.get(key),'broken');
 await button.onclick();assert.equal(map.get('unrelated'),'keep');assert.equal((await get('tasks')).data.notes.length,6);
});
