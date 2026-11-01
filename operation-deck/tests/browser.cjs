const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const puppeteer=require(process.env.PUPPETEER_MODULE||'puppeteer');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'deck-browser-'));
(async()=>{
const server=http.createServer((req,res)=>{let file=path.join(root,req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()};try{let b=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(b)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{
for(const width of [1440,390]){
 const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[],requests=[];page.setDefaultTimeout(10000);console.log('viewport',width);await page.setViewport({width,height:1000});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method(),type:r.resourceType()}));
 await page.goto(origin,{waitUntil:'networkidle0'});assert.equal((await page.$$('.card')).length,8);assert.equal((await page.$$('#phases button')).length,5);assert.equal(await page.$eval('#connect',e=>e.hidden),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(root,'docs/screenshots',width===1440?'desktop.png':'mobile.png'),fullPage:true});
 for(let i=1;i<=5;i++){await page.click('#phases button:nth-child('+i+')');assert.equal(await page.$eval('#phases button[aria-pressed=true]',e=>e.textContent.slice(0,2)),String(i).padStart(2,'0'))}
 await page.click('#allCards');await page.type('#search','demo-handoff');assert.equal((await page.$$('#tasks .task')).length,1);await page.click('#tasks .task button');assert((await page.$eval('#prompt',e=>e.value)).includes('demo-handoff'));
 await page.$eval('#search',e=>{e.value='';e.dispatchEvent(new Event('input'))});await page.select('#filter','blocked');assert.equal((await page.$$('#tasks .task')).length,1);await page.select('#filter','reserve');assert.equal((await page.$$('#tasks .task')).length,1);
 await page.select('#filter','all');
 // JSON parser, XSS rendering and failed import preservation.
 let data=JSON.parse(fs.readFileSync(path.join(root,'sample.json')));data.notes.push({id:'demo-xss',title:'<img src=x onerror="window.compromised=1">',column:'Next',memo:'<script>window.compromised=1</script>'});
 const sampleBytes=Buffer.from(JSON.stringify(data));let input=await page.$('#file');fs.writeFileSync(path.join(temp,'fixture.json'),sampleBytes);await input.uploadFile(path.join(temp,'fixture.json'));await page.waitForFunction(()=>document.querySelector('#badge').textContent.includes('スナップショット'));
 await page.click('#allCards');await page.type('#search','demo-xss');assert.equal((await page.$$('#tasks img')).length,0);assert.equal(await page.evaluate(()=>window.compromised),undefined);assert((await page.$eval('#tasks',e=>e.textContent)).includes('<img'));
 input=await page.$('#file');fs.writeFileSync(path.join(temp,'broken.json'),'{broken');await input.uploadFile(path.join(temp,'broken.json'));await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('取込失敗'));assert((await page.$eval('#tasks',e=>e.textContent)).includes('<img'));
 await page.click('#demo');await page.click('#journalOpen');await page.$eval('#journalSheet',e=>e.value='');await page.type('#journalSheet','Synthetic portfolio note');await page.click('#journalSheetSave');await page.reload({waitUntil:'networkidle0'});await page.click('#journalOpen');assert.equal(await page.$eval('#journalSheet',e=>e.value),'Synthetic portfolio note');
 console.log('journal saved',width);const journal=await page.evaluate(()=>window.TurnJournalModel.getSnapshot());assert.doesNotThrow(()=>JSON.stringify(journal));await page.click('#journalClose');
 // Restore saved JSON into an empty browser storage, then refuse divergent overwrite.
 fs.writeFileSync(path.join(temp,'journal.json'),JSON.stringify(journal));await page.evaluate(()=>localStorage.removeItem(window.TurnJournalModel.key));await page.reload({waitUntil:'networkidle0'});await page.click('#journalOpen');await (await page.$('#journalImportFile')).uploadFile(path.join(temp,'journal.json'));await page.waitForFunction(()=>document.querySelector('#journalMsg').textContent.includes('復元しました'));assert.equal(await page.$eval('#journalSheet',e=>e.value),'Synthetic portfolio note');
 const divergent=JSON.parse(JSON.stringify(journal));divergent.current.sheet='Must not overwrite';fs.writeFileSync(path.join(temp,'divergent.json'),JSON.stringify(divergent));await (await page.$('#journalImportFile')).uploadFile(path.join(temp,'divergent.json'));await page.waitForFunction(()=>document.querySelector('#journalMsg').textContent.includes('上書きしません'));assert.equal(await page.$eval('#journalSheet',e=>e.value),'Synthetic portfolio note');await page.click('#journalClose');
 // Another tab changes storage: this tab must refuse a stale write.
 console.log('conflict start',width);const second=await context.newPage();await second.goto(origin);await second.evaluate(()=>{let key=window.TurnJournalModel.key;let value=JSON.parse(localStorage.getItem(key));value.current.updatedAt=new Date().toISOString();value.current.sheet='Other tab';localStorage.setItem(key,JSON.stringify(value));});await page.bringToFront();await page.click('#journalOpen');await page.$eval('#journalSheet',e=>e.value='Stale edit');await page.click('#journalSheetSave');assert.equal(await page.$eval('#journalSheetSave',e=>e.disabled),true);assert((await page.$eval('#journalSaveState',e=>e.textContent)).match(/別タブ|再読込/));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(window.TurnJournalModel.key)).current.sheet),'Other tab');
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(requests.filter(r=>r.type!=='document'&&r.type!=='other').length,0);assert.equal(requests.filter(r=>r.method!=='GET'||!r.url.startsWith(origin)).length,0);
 results.push({width,status:'PASS',checks:['5 phases / 8 categories','search / selection / prompt','blocked vs reserve','JSON import and malformed input','XSS remains text','journal reload persistence','JSON restore and divergent overwrite refusal','cross-tab conflict refused','no horizontal overflow','no API or external requests','no JavaScript errors']});await context.close();
}
// Also validate the no-server entry point.
const filePage=await browser.newPage();await filePage.goto('file://'+path.join(root,'index.html'));assert.equal((await filePage.$$('.card')).length,8);results.push({mode:'file',status:'PASS',checks:['standalone HTML renders without server']});
fs.writeFileSync(path.join(root,'docs/validation.json'),JSON.stringify({testedAt:new Date().toISOString(),browser:await browser.version(),scope:'synthetic demo; browser automation; no real data or live services',results},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();server.close();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
