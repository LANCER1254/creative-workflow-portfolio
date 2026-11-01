(function(root){
'use strict';
const states=new Set(['queued','in_progress','closed','cancelled','unknown']);
function read(note){
  for(const prefix of ['[meeting-state:v1]','[meeting-reservation:v1]']){
    const lines=((note.memo||'')+'\n'+(note.completionMemo||'')).split('\n').filter(x=>x.startsWith(prefix));
    if(!lines.length)continue;
    try{const m=JSON.parse(lines.at(-1).slice(prefix.length));return states.has(m.status)?m:{status:'unknown'};}catch{return {status:'unknown'};}
  }
  return {status:'unknown'};
}
function isTheme(note){return /^production-meeting-\d{8}-\d+$/.test(note.id)||((note.memo||'')+'\n'+(note.completionMemo||'')).split('\n').some(x=>x.startsWith('[meeting-state:v1]')||x.startsWith('[meeting-reservation:v1]'));}
const api={read,isTheme,label:status=>({queued:'未閉廷・開催待機',in_progress:'未閉廷・会議中',closed:'閉廷済み（実装は別）',cancelled:'取消',unknown:'閉廷状況未確認'}[status]||'閉廷状況未確認')};
root.MeetingState=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
