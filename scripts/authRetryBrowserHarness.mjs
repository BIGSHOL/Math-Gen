import puppeteer from 'puppeteer-core';
import { startBrowserFixture } from './browserFixture.mjs';
const fixture = await startBrowserFixture({ '/src/services/api/supabase.ts': 'src/services/api/supabase.ts' }, {
 VITE_SUPABASE_ENABLED: 'true', VITE_SUPABASE_URL: 'http://127.0.0.1:1', VITE_SUPABASE_ANON_KEY: 'test-fixture-key',
});
const browser=await puppeteer.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage();await page.goto(fixture.url,{waitUntil:'networkidle0'});
 const results=await page.evaluate(async()=>{
  const {authClient,fetchWithAuth}=await import('/src/services/api/supabase.ts');
  const originalFetch=window.fetch, getSession=authClient.auth.getSession, refreshSession=authClient.auth.refreshSession;
  let refreshed=0, requests=0, token='expired', mode='expire';const results=[];
  const assert=(ok,message)=>{if(!ok)throw new Error(message);results.push(message);};
  authClient.auth.getSession=async()=>({data:{session:{access_token:token}},error:null});
  authClient.auth.refreshSession=async()=>{refreshed++;await new Promise(r=>setTimeout(r,30));token='fresh';return{data:{session:{access_token:token}},error:null};};
  window.fetch=async(url,init)=>{requests++;return Response.json({}, {status:mode==='unavailable'?503:mode==='denied'?401:new Headers(init.headers).get('Authorization')==='Bearer fresh'?200:401});};
  try {
   const responses=await Promise.all([fetchWithAuth('/api/ai-ocr',{method:'POST'}),fetchWithAuth('/api/ai-figure',{method:'POST'})]);
   assert(responses.every(r=>r.status===200)&&refreshed===1&&requests===4,'Concurrent expired requests share one refresh and each retry once');
   mode='denied';token='expired';requests=0;refreshed=0;
   assert((await fetchWithAuth('/api/ai-figure')).status===401&&requests===2&&refreshed===1,'Revoked credentials stop after one retry');
   mode='unavailable';requests=0;refreshed=0;
   assert((await fetchWithAuth('/api/ai-figure')).status===503&&requests===1&&refreshed===0,'Auth service outage does not refresh a valid session');
  } finally {window.fetch=originalFetch;authClient.auth.getSession=getSession;authClient.auth.refreshSession=refreshSession;}
  return results;
 });
 results.forEach(r=>console.log('PASS',r));
} finally {await browser.close(); await fixture.close();}
