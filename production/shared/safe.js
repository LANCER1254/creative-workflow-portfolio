export function safeDataImage(value) {
 if(!value)return "";
 if(typeof value!=="string"||value.length>3000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error("画像は埋込PNG/JPEG/WebPのみです。外部参照は使えません。");
 const bytes=atob(value.split(",")[1]);
 if(value.startsWith("data:image/png")&&!bytes.startsWith("\x89PNG\r\n\x1a\n"))throw Error("PNGが破損しています。");
 if(value.startsWith("data:image/jpeg")&&!(bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216))throw Error("JPEGが破損しています。");
 if(value.startsWith("data:image/webp")&&!(bytes.startsWith("RIFF")&&bytes.slice(8,12)==="WEBP"))throw Error("WebPが破損しています。");return value;
}
export async function readSafeImage(file){
 if(file.size>2000000)throw Error("画像は2MB以内で選択してください。");
 const value=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error("画像を読めません"));r.readAsDataURL(file)});safeDataImage(value);
 await new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=()=>reject(Error("画像を表示できません。破損を確認してください。"));im.src=value});return value;
}
export function uniqueIds(rows){const ids=rows.map(r=>r?.id).filter(Boolean);if(new Set(ids).size!==ids.length)throw Error("IDが重複しています。");}
export function downloadFile(name,value,type="application/json"){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
