import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { startBrowserFixture } from "./browserFixture.mjs";

const fixture = await startBrowserFixture(
  { "/test.js": "scripts/solutionFlowHarnessEntry.tsx" },
  { VITE_USE_API: "true" },
);
const browser = await puppeteer.launch({
  executablePath: process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const checks = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixture.url);
  await page.evaluate(async () => {
    const api = await import("/test.js");
    window.test = { ...api, started: 0, active: 0, maxActive: 0, holds: [] };
    window.fetch = async (url) => {
      if (url !== "/api/ai-solution") throw new Error(`Unexpected request: ${url}`);
      const t = window.test;
      t.started += 1;
      t.active += 1;
      t.maxActive = Math.max(t.maxActive, t.active);
      await new Promise((resolve) => t.holds.push(resolve));
      t.active -= 1;
      return Response.json({
        solution: "식을 정리하면 $x=1$이다.",
        answer: "1",
        modelUsed: "deepseek-v4-pro",
      });
    };
    api.seedSolutions(16);
    api.mountSolutions();
  });

  await page.waitForFunction(() => window.test.started === 8);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(await page.evaluate(() => ({ started: window.test.started, active: window.test.active, max: window.test.maxActive })), { started: 8, active: 8, max: 8 });
  checks.push("DeepSeek solutions start in an eight-request worker pool without a serial delay");

  await page.evaluate(() => window.test.holds.splice(0).forEach((resolve) => resolve()));
  await page.waitForFunction(() => window.test.started === 16);
  await page.evaluate(() => window.test.holds.splice(0).forEach((resolve) => resolve()));
  await page.waitForFunction(() => window.test.useWizardStore.getState().pages[0].ocrResult.every((item) => !!item.solution && !item.solutionGenerating));
  assert.equal(await page.evaluate(() => window.test.maxActive), 8);
  checks.push("The second solution batch starts as slots finish and never exceeds eight active requests");

  await page.evaluate(() => {
    const t = window.test;
    const first = t.useWizardStore.getState().pages[0].ocrResult[0];
    t.useWizardStore.getState().updateOCRItem("solution-page", first.id, { solution: undefined, answer: undefined });
  });
  await page.waitForFunction(() => window.test.started === 17);
  await page.evaluate(() => window.test.holds.splice(0).forEach((resolve) => resolve()));
  await page.waitForFunction(() => !!window.test.useWizardStore.getState().pages[0].ocrResult[0].solution);
  checks.push("A completed item can be regenerated because its in-flight dispatch marker is released");

  await page.evaluate(() => {
    const t = window.test;
    t.started = 0; t.active = 0; t.maxActive = 0; t.holds = [];
    t.seedSolutions(16);
  });
  await page.waitForFunction(() => window.test.started === 8);
  await page.evaluate(() => window.test.useWizardStore.getState().setSkipSolutions(true));
  await page.waitForFunction(() => window.test.useWizardStore.getState().pages[0].ocrResult.every((item) => !item.solutionGenerating));
  await page.evaluate(() => window.test.holds.splice(0).forEach((resolve) => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await page.evaluate(() => window.test.started), 8);
  assert.ok(await page.evaluate(() => window.test.useWizardStore.getState().pages[0].ocrResult.every((item) => !item.solution)));
  checks.push("Skipping cancels queued publication, clears progress, and prevents the remaining eight requests from starting");

  await page.evaluate(async () => {
    const t = window.test;
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 800;
    const context = canvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, 600, 800);
    const dataUrl = canvas.toDataURL();
    const imageRef = await t.putPageImage({ pageNum: 1, dataUrl });
    const thumbRef = await t.putThumbnail({ pageNum: 1, dataUrl });
    t.seedWizard(imageRef, thumbRef);
    t.mountWizard();
  });
  await page.waitForSelector("button");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.includes("해설 건너뛰기")));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("해설 건너뛰기")).click());
  await page.waitForFunction(() => window.test.useWizardStore.getState().step === 4);
  const skipped = await page.evaluate(() => {
    const state = window.test.useWizardStore.getState();
    const step = document.querySelector('button[aria-label="4단계 해설 건너뜀"]');
    return { skip: state.skipSolutions, confirmed: state.ocrConfirmed, hasX: !!step?.querySelector("i.ph-x") };
  });
  assert.deepEqual(skipped, { skip: true, confirmed: true, hasX: true });
  checks.push("The footer skip action confirms OCR, jumps directly to options, and marks solution step 4 with X");

  assert.deepEqual(errors, []);
  for (const check of checks) console.log("PASS", check);
  console.log(`${checks.length} solution-flow checks passed`);
} finally {
  await browser.close();
  await fixture.close();
}
