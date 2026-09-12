import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import { startBrowserFixture } from './browserFixture.mjs';
const fixture=await startBrowserFixture({'/entry.js':'scripts/hwpxHarnessEntry.tsx'});
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage();await page.setViewport({width:1000,height:1200});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(fixture.url);await page.evaluate(async()=>{const m=await import('/entry.js');m.mountHwpxFixture();});
 await page.waitForSelector('[data-case="yuhyung2"]');await page.evaluate(()=>document.fonts.ready);
 const data=await page.evaluate(async()=>{
  const {collectHwpxLayout}=await import('/entry.js');const layout=await collectHwpxLayout(document.querySelector('#hwpx-fixture'));
  const assets={};for(const [key,blob] of Object.entries(layout.assets)){const bytes=new Uint8Array(await blob.arrayBuffer());let str='';for(const b of bytes)str+=String.fromCharCode(b);assets[key]=btoa(str);}
  return {pages:layout.pages,assets};
 });
 if(data.pages.length!==14)throw Error('12 template/column combinations and 2 answer pages missing');
 for(let i=0;i<12;i++){
  const objects=data.pages[i].objects,labels=objects.filter(o=>o.type==='text').map(o=>o.text).join('');
  if(!labels.includes('[4.1점]'))throw Error('score missing '+i);
  if(!objects.some(o=>o.type==='equation')||objects.filter(o=>o.type==='image').length!==(i%2?2:1))throw Error('math/figure missing '+i);
  const scores=objects.filter(o=>o.type==='text'&&o.text.includes('[4.1점]')),images=objects.filter(o=>o.type==='image');
  if(scores.some((s,j)=>s.y>=images[j].y))throw Error('score below figure '+i);
 }
 if(!data.pages[12].objects.some(o=>o.latex?.includes('times')))throw Error('solution equation missing');
 if(data.pages[13].objects.some(o=>o.latex?.includes('times')))throw Error('quick answer export includes hidden solutions');
 await fs.mkdir('.checks.local/hwpx',{recursive:true});
 await fs.writeFile('.checks.local/hwpx/layout.json',JSON.stringify({title:'서식 검증',pages:data.pages}));
 for(const [key,b64] of Object.entries(data.assets))await fs.writeFile('.checks.local/hwpx/'+key.split('/').at(-1),Buffer.from(b64,'base64'));
 for(const name of ['jeongtong2','modern2','jaseup1'])await (await page.$(`[data-case="${name}"]`)).screenshot({path:`.checks.local/hwpx/preview-${name}.png`});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS 12 templates/columns + full/quick answers carry preview positions, native math, figures and score placement');
}finally{await browser.close();await fixture.close();}
