import assert from 'node:assert/strict';
import handler from '../api/ai.js';
import type { VercelRequest, VercelResponse } from '../api/_types.js';

for (const route of ['ai-ocr','ai-cropdetect','ai-solution','ai-variant','ai-image',
  'ai-exam-analysis','ai-exam-commentary','ai-exam-v4','ai-figure-detect','ai-figure','ai-figure-review','ai-figure-labels','ai-generate','unknown']) {
  let status = 200;
  const response = {
    status(code: number) { status = code; return this; },
    json(_body: unknown) { return this; },
  } as VercelResponse;
  await handler({ method: 'POST', query: { route }, headers: {}, cookies: {}, body: {} } as VercelRequest, response);
  assert.equal(status, route === 'unknown' ? 404 : 401, route);
  console.log(`PASS ${route}: ${status}`);
}
