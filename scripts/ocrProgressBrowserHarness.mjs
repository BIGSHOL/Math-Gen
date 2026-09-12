import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { startBrowserFixture } from './browserFixture.mjs';

const fixture = await startBrowserFixture({ '/test.js': 'scripts/ocrProgressHarnessEntry.tsx' });
const browser = await puppeteer.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const checks = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('requestfailed', request => console.error('REQUEST FAILED', request.url(), request.failure()?.errorText));
  await page.goto(fixture.url);
  await page.evaluate(async () => {
    const api = await import('/test.js');
    window.test = { ...api, holds: [], ocrHolds: [], calls: [], ocrCount: 0, mode: 'hold' };
    const t = window.test;
    t.svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M3 3L37 37L3 37Z" fill="none" stroke="black"/></svg>';
    window.fetch = async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      t.calls.push({ url, body });
      if (url === '/api/ai-ocr') {
        t.ocrCount++;
        if (t.ocrHold) await new Promise(resolve => { t.ocrHolds.push(resolve); });
        return Response.json({ items: [{ id: crypto.randomUUID(), number: 1, text: `인식된 문제 ${t.ocrCount}. 삼각형의 넓이를 구하시오.`, status: 'ok', reviewed: false }] });
      }
      if (url === '/api/ai-figure') {
        if (t.mode === 'hold') return new Promise(resolve => t.holds.push(() => resolve(Response.json({ spec: { version: 2 }, model: 'claude-opus-5' }))));
        if (t.mode === 'hang') return new Promise(() => {});
        return Response.json({ spec: { version: 2 }, model: 'claude-opus-5' });
      }
      if (url === '/api/figure-render') return Response.json({ svg: t.svg });
      if (url === '/api/ai-figure-review') return Response.json({ passed: true, issues: [] });
      if (url === '/api/testchange') {
        t.readCount = (t.readCount ?? 0) + 1;
        return t.readCount === 1 ? Response.json({ error: '인증 서버가 일시적으로 응답하지 않습니다.' }, { status: 503, headers: { 'retry-after': '0.01' } }) : Response.json({ exams: [{ id: 'testchange:1' }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 800;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 600, 800);
    ctx.strokeStyle = 'black'; ctx.beginPath(); ctx.moveTo(100, 90); ctx.lineTo(300, 280); ctx.lineTo(100, 280); ctx.closePath(); ctx.stroke();
    t.source = canvas.toDataURL();
    const imageRef = await api.putPageImage({ pageNum: 1, dataUrl: t.source });
    const thumbRef = await api.putThumbnail({ pageNum: 1, dataUrl: t.source });
    t.seed = [0, 1, 2].map(i => ({ id: `page-${i}`, imageRef, thumbRef, rotation: 0, textLayer: '본문', isProblemPage: true,
      cropInspected: true, ocrComplete: false, ocrResult: [], cropBoxes: [0, 1].map(j => ({ id: `box-${i}-${j}`, class: 'problem',
        number: i * 2 + j + 1, bbox: [j * 500, 0, (j + 1) * 500, 1000], verified: true,
        figureCrops: i === 0 || (i === 1 && j === 0) ? [{ id: `figure-${i}-${j}`, label: '도형1', kind: 'diagram', bbox: [j * 500 + 50, 100, j * 500 + 400, 600] }] : [],
      })) }));
    api.useWizardStore.setState({ pages: t.seed, activePageIndex: 0, testId: null });
    t.unmount = api.mount();
  });
  await page.waitForFunction(() => window.test.useWizardStore.getState().pages.every(p => p.ocrTextComplete) && window.test.holds.length === 1);
  await page.waitForFunction(() => window.test.useWizardStore.getState().pages.slice(0, 2).every(p => p.ocrResult.some(it => it.images?.[0]?.originalDataUrl)));
  const initial = await page.evaluate(() => ({ count: window.test.ocrCount, states: window.test.useWizardStore.getState().pages.map(p => ({ complete: p.ocrComplete, items: p.ocrResult.length })), body: document.body.textContent }));
  assert.equal(initial.count, 6);
  assert.deepEqual(initial.states, [{ complete: false, items: 2 }, { complete: false, items: 2 }, { complete: true, items: 2 }]);
  assert.match(initial.body, /현재 그림으로 완료/);
  assert.match(initial.body, /再作圖|재작도 중/);
  checks.push('A pending Opus call does not block any of six text crops or the third page; original figures and progress are visible under StrictMode');

  await page.evaluate(() => {
    const t = window.test;
    const saved = JSON.parse(sessionStorage.getItem('mathgen-wizard-v3')).state.pages;
    t.savedValid = saved.every(p => p.ocrComplete && p.ocrResult.every(it => !it.figureProgress)) && saved[0].ocrResult[0].images[0].originalDataUrl;
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('현재 그림으로 완료')).click();
    t.kept = JSON.stringify(t.useWizardStore.getState().pages[0].ocrResult);
    t.holds.shift()();
  });
  await page.waitForFunction(() => window.test.holds.length === 1);
  assert.ok(await page.evaluate(() => window.test.savedValid));
  assert.ok(await page.evaluate(() => window.test.useWizardStore.getState().pages[0].ocrComplete && JSON.stringify(window.test.useWizardStore.getState().pages[0].ocrResult) === window.test.kept));
  assert.equal(await page.evaluate(() => window.test.calls.filter(c => c.url === '/api/figure-render').length), 0);
  checks.push('Finish with current figures preserves originals, skips queued drawings and prevents late responses from overwriting the page');
  checks.push('Reload snapshot clears progress and preserves recognized text and original crops without rerunning OCR');

  await page.evaluate(() => {
    const t = window.test, item = t.useWizardStore.getState().pages[1].ocrResult[0];
    t.useWizardStore.getState().updateOCRItem('page-1', item.id, { text: '사용자가 수정한 본문', reviewed: true,
      images: item.images.map(im => ({ ...im, dataUrl: 'data:image/svg+xml,' + encodeURIComponent(t.svg), engineSvg: t.svg })) });
    t.manual = JSON.stringify(t.useWizardStore.getState().pages[1].ocrResult[0].images);
    t.holds.shift()();
  });
  await page.waitForFunction(() => window.test.useWizardStore.getState().pages[1].ocrComplete);
  assert.ok(await page.evaluate(() => { const t = window.test, item = t.useWizardStore.getState().pages[1].ocrResult[0]; return item.text === '사용자가 수정한 본문' && JSON.stringify(item.images) === t.manual && !item.figureProgress; }));
  checks.push('Text and figure edits survive a late AI response');

  // Retry while the old figure is still in flight; the old finally must not delete the new run.
  await page.evaluate(() => {
    const t = window.test; t.useWizardStore.getState().setPageOCR('page-0', { ocrComplete: false, ocrTextComplete: false, ocrResult: [] });
  });
  await page.waitForFunction(() => window.test.holds.length === 1 && window.test.useWizardStore.getState().pages[0].ocrTextComplete);
  await page.evaluate(() => {
    const t = window.test;
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('현재 그림으로 완료')).click();
    t.ocrHold = true;
  });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('페이지 재인식')));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('페이지 재인식')).click());
  await page.waitForFunction(() => window.test.ocrHolds.length === 2);
  await page.evaluate(() => { const t = window.test; t.holds.shift()(); });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await page.evaluate(() => window.test.ocrCount), 10);
  await page.evaluate(() => { const t = window.test; t.ocrHold = false; t.mode = 'ok'; t.ocrHolds.splice(0).forEach(resolve => resolve()); });
  await page.waitForFunction(() => window.test.useWizardStore.getState().pages[0].ocrComplete);
  assert.equal(await page.evaluate(() => window.test.ocrCount), 10);
  checks.push('Retry reuses page IDs without duplicate dispatch or cancellation by the previous run');

  const deadline = await page.evaluate(async () => {
    const t = window.test;
    const native = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => native(fn, ms === 110000 ? 40 : ms, ...args);
    t.mode = 'hang';
    const base = { id: 'deadline', number: 1, text: '본문 [그림1]', status: 'ok', reviewed: false };
    const figure = { box: [100, 100, 600, 600], kind: 'diagram', label: '삼각형' };
    try {
      const first = t.redrawQuestionFigures(t.source, base, undefined, [figure]);
      await new Promise(resolve => native(resolve, 80));
      t.mode = 'ok';
      const second = t.redrawQuestionFigures(t.source, { ...base, id: 'after-deadline' }, undefined, [figure]);
      const [a, b] = await Promise.all([first, second]);
      return { fallback: a.images[0].dataUrl === a.images[0].originalDataUrl && !!a.figureWarnings?.length, nextRendered: !!b.images[0].engineSvg };
    } finally { window.setTimeout = native; }
  });
  assert.deepEqual(deadline, { fallback: true, nextRendered: true });
  checks.push('A hung figure request times out to the original crop and releases the next figure in the queue');

  const retry = await page.evaluate(async () => {
    const t = window.test; const [a, b] = await Promise.all([t.loadTestchangeExams(), t.loadTestchangeExams()]);
    return { calls: t.readCount, same: a === b, id: a[0].id };
  });
  assert.deepEqual(retry, { calls: 2, same: true, id: 'testchange:1' });
  checks.push('Concurrent testchange reads share a bounded 503 retry and succeed');
  assert.deepEqual(errors, []);
  checks.forEach(check => console.log('PASS', check));
  console.log(`${checks.length} OCR progress checks passed`);
} finally { await browser.close(); await fixture.close(); }
