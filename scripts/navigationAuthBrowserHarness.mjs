import puppeteer from 'puppeteer-core';
import { startBrowserFixture } from './browserFixture.mjs';
const entry='/scripts/navigationHarnessEntry.tsx';
const fixture=await startBrowserFixture({[entry]:'scripts/navigationHarnessEntry.tsx'},{
  VITE_SUPABASE_ENABLED:'true',VITE_SUPABASE_URL:'http://127.0.0.1:1',
  VITE_SUPABASE_ANON_KEY:'fixture-key',VITE_TESTCHANGE_ENABLED:'true',
});
const browser=await puppeteer.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  const page=await browser.newPage();await page.goto(fixture.url);
  const checks=await page.evaluate(async(entry)=>{
    const h=await import(entry),results=[];
    const assert=(value,message)=>{if(!value)throw new Error(message);results.push(message);};
    let callback;
    h.authClient.auth.getSession=async()=>({data:{session:null},error:null});
    h.authClient.auth.onAuthStateChange=fn=>{callback=fn;return{data:{subscription:{unsubscribe(){}}}};};
    const cleanup=h.useAuthStore.getState().initialize();
    await Promise.resolve();
    h.useAppStore.getState().openTest('requested-paper');
    h.useAppStore.getState().setDetailTab('solutions');
    h.useAppStore.getState().setAuthMode('signup');
    callback('SIGNED_IN',{user:{id:'fixture-user-a'}});
    assert(h.useAppStore.getState().selectedTestId==='requested-paper'&&h.useAppStore.getState().detailTab==='solutions','Signing in preserves the requested detail and solution tab');
    assert(h.useAppStore.getState().authMode==='login','Successful authentication clears the signup/reset route');
    h.useLibraryStore.getState().setViewState({searchQuery:'private-filter'});
    callback('TOKEN_REFRESHED',{user:{id:'fixture-user-a'}});
    assert(h.useAppStore.getState().screen==='detail'&&h.useLibraryStore.getState().viewState.searchQuery==='private-filter','Token refresh does not reset navigation or filters');
    callback('SIGNED_OUT',null);
    assert(h.useAppStore.getState().screen==='library'&&h.useLibraryStore.getState().viewState.searchQuery==='','Signing out clears private navigation and library filters');
    h.useAppStore.getState().setRoute('admin');
    callback('SIGNED_IN',{user:{id:'fixture-user-a'}});
    assert(h.useAppStore.getState().route==='admin','Signing in on an admin link preserves the destination for its access gate');
    h.useAppStore.getState().openTest('private-paper');
    callback('SIGNED_IN',{user:{id:'fixture-user-b'}});
    assert(h.useAppStore.getState().screen==='library'&&h.useAppStore.getState().selectedTestId===null,'Switching accounts clears the previous account destination');
    cleanup();return results;
  },entry);
  checks.forEach(message=>console.log('PASS',message));
  console.log(`${checks.length} authenticated navigation checks passed`);
}finally{await browser.close();await fixture.close();}
