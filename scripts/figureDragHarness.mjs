// 도형 편집기 끌기 — 걸음마다 그림 전체를 다시 넣지 않는지, 라벨이 원문으로 풀리지 않는지, 프레임이 끊기지 않는지.
// 원장님 2026-09-18 «도형편집기에 병목 현상이 있나? 부드럽게 움직여지지않고 프레임이 엄청 끊기네».
// `node scripts/figureDragHarness.mjs` (Edge headless, AI·로그인 없음). `--measure` 는 판정 없이 숫자만 낸다.
// 배포와 같은 React 로 재려면 FIXTURE_NODE_ENV=production 을 앞에 붙인다.
import puppeteer from 'puppeteer-core';
import { startBrowserFixture } from './browserFixture.mjs';

const measureOnly = process.argv.includes('--measure');
// `--cpu=4` 는 CPU 를 4배 느리게 — 느린 학원 PC 에서의 끊김을 본다.
const cpu = Number(process.argv.find(a => a.startsWith('--cpu='))?.slice(6) || 1);
const fixture = await startBrowserFixture({ '/scripts/figureDragHarnessEntry.tsx': 'scripts/figureDragHarnessEntry.tsx' });
const browser = await puppeteer.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const checks = [];
const assert = (value, label) => { if (measureOnly) return; if (!value) throw new Error(label); checks.push(label); console.log('PASS', label); };
const STEPS = 90;
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1000 });
  if (cpu > 1) await page.emulateCPUThrottling(cpu);
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('PAGEERROR', e.stack); });
  await page.goto(fixture.url, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const native = window.fetch;
    // 조판 서버 대신 — 라벨마다 작은 path 조각을 돌려준다(실제처럼 조금 늦게).
    window.fetch = async (url, options) => {
      if (url === '/api/ai-figure-labels') {
        await new Promise(r => setTimeout(r, 40));
        const { labels } = JSON.parse(options.body);
        return Response.json({ labels: labels.map(l => `<path data-typeset="" d="M${l.x} ${l.y}h${6 * l.text.length}v-${l.size * 0.7}h-${6 * l.text.length}z" fill="${l.color}"/>`) });
      }
      return native(url, options);
    };
    window.__frames = []; window.__loaf = [];
    try { new PerformanceObserver(list => window.__loaf.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration,
      scripts: (e.scripts ?? []).map(s => ({ invoker: s.invoker, duration: Math.round(s.duration), fn: s.sourceFunctionName, char: s.sourceCharPosition, forced: Math.round(s.forcedStyleAndLayoutDuration) })) })))).observe({ type: 'long-animation-frame', buffered: false }); } catch { /* LoAF 없는 브라우저 */ }
    const loop = t => { window.__frames.push(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const { mountDragHarness } = await import('/scripts/figureDragHarnessEntry.tsx');
    window.__harness = await import('/scripts/figureDragHarnessEntry.tsx');
    mountDragHarness();
  });
  const canvasSel = '#figure-editor-canvas';
  await page.waitForFunction(s => document.querySelector(s)?.querySelectorAll('[data-typeset]').length === 16, { timeout: 20000 }, canvasSel);
  await new Promise(r => setTimeout(r, 400));
  const objectCount = await page.$$eval('[data-figure-list-number]', els => els.length);
  console.log(`요소 ${objectCount}개`);

  const center = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const curvePoint = () => page.$eval(canvasSel, c => {
    const path = c.querySelector('path[data-object-id]'); const p = path.getPointAtLength(path.getTotalLength() * 0.3).matrixTransform(path.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  const frames = (start, end) => page.evaluate((s, e) => {
    const ts = window.__frames.filter(t => t >= s && t <= e); const gaps = ts.slice(1).map((t, i) => t - ts[i]);
    const long = gaps.filter(g => g > 50);
    return { frames: ts.length, long: long.length, longMs: Math.round(long.reduce((a, b) => a + b, 0)), worst: Math.round(Math.max(0, ...gaps)) };
  }, start, end);
  const now = () => page.evaluate(() => performance.now());
  const inspect = () => page.$eval(canvasSel, c => ({ raw: c.querySelectorAll('text[data-object-id]').length, keep: !!window.__keep?.isConnected }));
  const keepAnchor = () => page.$eval(canvasSel, c => { window.__keep = c.querySelectorAll('line[data-object-id]')[1]; });
  const results = {};

  // 끌기: 누르고 90걸음, 걸음마다 원문 라벨 수와 다른 요소가 그대로인지 본다.
  async function drag(name, from, dx, dy) {
    await keepAnchor();
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    const start = await now(); let maxRaw = 0, kept = true;
    for (let i = 1; i <= STEPS; i++) {
      await page.mouse.move(from.x + dx * i / STEPS, from.y + dy * i / STEPS);
      if (i % 10 === 0) { const s = await inspect(); maxRaw = Math.max(maxRaw, s.raw); kept &&= s.keep; }
    }
    const mid = await now();
    await page.mouse.up();
    const afterUp = await inspect();
    await new Promise(r => setTimeout(r, 1200));
    const end = await now();
    results[name] = { drag: await frames(start, mid), settle: await frames(mid, end), maxRaw, rawAfterUp: afterUp.raw, kept };
    console.log(name, JSON.stringify(results[name]));
  }

  await drag('선 끌기', await curvePoint(), 60, 40);
  const moved = await page.$eval(canvasSel, c => c.querySelector('path[data-object-id]').getAttribute('transform') ?? '');
  assert(/^translate\(/.test(moved), '끈 곡선이 놓은 자리에 남는다');
  await drag('라벨 끌기', await center(`${canvasSel} [data-object-id]:has(> [data-typeset])`), 40, 30);
  // 조절점: 곡선을 고르고 끝점을 끈다.
  await page.mouse.click((await curvePoint()).x, (await curvePoint()).y);
  await page.waitForSelector('[data-figure-handle]');
  const handleKey = await page.$$eval('[data-figure-handle]', hs => hs.map(h => h.getAttribute('data-figure-handle')).find(k => k !== 'center'));
  await drag('조절점 끌기', await center(`[data-figure-handle="${handleKey}"]`), 50, -30);

  // 화면 이동(손 도구).
  await page.$$eval('[role="toolbar"] button', bs => bs.find(b => b.textContent.includes('화면 이동')).click());
  {
    const from = await center(canvasSel); await keepAnchor();
    await page.mouse.move(from.x, from.y); await page.mouse.down(); const start = await now();
    for (let i = 1; i <= STEPS; i++) await page.mouse.move(from.x + i, from.y + i / 2);
    const mid = await now(); await page.mouse.up();
    results['화면 이동'] = { drag: await frames(start, mid), kept: (await inspect()).keep };
    console.log('화면 이동', JSON.stringify(results['화면 이동']));
  }
  await page.$$eval('[role="toolbar"] button', bs => bs.find(b => b.textContent.includes('선택·이동')).click());

  // AI 요청 입력·요소 고르기로 그림을 다시 넣지 않는다.
  await keepAnchor();
  // 처음 그리는 한글 글자는 글꼴을 준비하느라 스크립트 없이 한 번 멈춘다(헤드리스 브라우저 사정) — 같은 문장을
  // 한 번 치고 지운 뒤 잰다.
  const request = '눈금 숫자를 조금 더 크게 해 주세요';
  await page.type('[aria-label="도형 AI 수정 요청"]', request, { delay: 15 });
  await page.$eval('[aria-label="도형 AI 수정 요청"]', t => t.select()); await page.keyboard.press('Backspace');
  await new Promise(r => setTimeout(r, 300));
  {
    const start = await now();
    await page.type('[aria-label="도형 AI 수정 요청"]', request, { delay: 15 });
    const end = await now();
    results['AI 요청 입력'] = { frames: await frames(start, end), kept: (await inspect()).keep };
    if (process.env.LOAF) console.log('LOAF', JSON.stringify(await page.evaluate((s, e) => window.__loaf.filter(l => l.start >= s - 5 && l.start <= e).map(l => ({ at: Math.round(l.start - s), d: Math.round(l.duration), b: Math.round(l.blocking), scripts: l.scripts })), start, end)));
    console.log('AI 요청 입력', JSON.stringify(results['AI 요청 입력']));
  }
  {
    const start = await now();
    for (let n = 2; n <= 12; n++) await page.click(`[data-figure-list-number="${n}"]`);
    const end = await now();
    results['요소 고르기'] = { frames: await frames(start, end), kept: (await inspect()).keep };
    if (process.env.LOAF) console.log('LOAF', JSON.stringify(await page.evaluate((s, e) => window.__loaf.filter(l => l.start >= s - 5 && l.start <= e).map(l => ({ at: Math.round(l.start - s), d: Math.round(l.duration), b: Math.round(l.blocking), scripts: l.scripts })), start, end)));
    console.log('요소 고르기', JSON.stringify(results['요소 고르기']));
  }

  for (const name of ['선 끌기', '라벨 끌기', '조절점 끌기']) {
    const r = results[name];
    assert(r.maxRaw === 0 && r.rawAfterUp === 0, `${name}: 끄는 동안·놓은 직후에도 라벨이 원문으로 풀리지 않는다`);
    assert(r.kept, `${name}: 끄는 동안 다른 요소를 다시 넣지 않는다`);
    assert(r.drag.long <= 2, `${name}: ${STEPS}걸음 동안 50ms 넘는 프레임이 2개 이하 (${r.drag.long}개)`);
    assert(r.settle.long <= 2, `${name}: 놓은 뒤 조판이 따라오는 동안 50ms 넘는 프레임이 2개 이하 (${r.settle.long}개)`);
  }
  assert(results['화면 이동'].kept && results['화면 이동'].drag.long <= 2, '화면 이동: 그림을 다시 넣지 않고 끊기지 않는다');
  assert(results['AI 요청 입력'].kept, 'AI 요청을 적어도 그림을 다시 넣지 않는다');
  assert(results['요소 고르기'].kept, '요소를 골라도 그림을 다시 넣지 않는다');

  // 되돌리기 → 원래 자리, 적용 → 끈 결과가 저장본에 남는다.
  const before = await page.$eval(canvasSel, c => c.querySelector('path[data-object-id]').getAttribute('d'));
  await page.focus('[aria-label="도형 편집 캔버스"]');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await page.waitForFunction((s, d) => document.querySelector(s).querySelector('path[data-object-id]').getAttribute('d') !== d, {}, canvasSel, before);
  assert(true, '되돌리기가 조절점 끌기를 한 번에 되돌린다');
  await page.$$eval('button', bs => bs.find(b => b.textContent === '도형 적용').click());
  await page.waitForFunction(() => document.body.textContent.includes('편집 완료'));
  const savedSvg = await page.evaluate(() => window.__harness.getSaved()?.engineSvg ?? '');
  assert(/translate\(/.test(savedSvg) && !/data-typeset/.test(savedSvg), '적용본에 끈 자리가 남고 조판 조각은 섞이지 않는다');
  assert(!errors.length, '브라우저 오류 없음');
  if (!measureOnly) console.log(`${checks.length}/${checks.length} checks passed`);
} finally { await browser.close(); await fixture.close(); }
