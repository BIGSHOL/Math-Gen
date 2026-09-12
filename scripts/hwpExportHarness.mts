import assert from 'node:assert/strict';
import { buildHwpPayload } from '../src/services/api/hwpConnector';
import { problemFigureBlocks, hasHwpFigures } from '../src/lib/hwpFigures';
import { hwpExtension, connectorAccessMessage } from '../src/services/api/hwpAccess';
import { testchangeQuestionToOcr } from '../src/lib/testchangeAdapter';
import { ocrToGenerated } from '../src/lib/problemAdapter';
import { missingEngineFigures, figureAssetKey, visitEngineFigures } from '../src/lib/testchangeFigures';
import type { GeneratedProblem } from '../src/types';
import type { TestchangeQuestion, TestchangeExamData } from '../src/types/testchange';
import { restoreStoredFigures } from '../api/_testchange-figures';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><circle cx="150" cy="100" r="60" fill="none" stroke="black"/></svg>';
const p = { number: 8, question: '앞 [그림1] 뒤', images: [{ dataUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`, label: '편집한 원' }],
  answer: '3', solution: '풀이', topic: '원', difficulty: '중', diagramSVG: null,
  blocks: [{ type: 'text', value: '앞 [그림1] 뒤', rows: [] }],
  choices: ['1', '2'], score: 3, printedScore: '3.0' } as GeneratedProblem;
const blocks = problemFigureBlocks(p);
assert.deepEqual(blocks.contents.map(b => b.type), ['text', 'figure', 'text']);
assert.equal(blocks.contents[1].crop, p.images![0].dataUrl);
assert.equal(blocks.choices.length, 2);
console.log('PASS edited figure, insertion position and markdown choices survive');
const nested = problemFigureBlocks({ ...p, question: '앞', blocks: undefined,
  choiceGroups: [{ number: 1, contents: [{ type: 'text', value: '[그림1]', rows: [] }] }],
  subQuestions: [{ number: 1, contents: [{ type: 'text', value: svg, rows: [] }], score: 2 }] });
assert.equal(nested.contents.length, 1);
assert.equal(nested.choices[0].contents[0].type, 'figure');
assert.equal(nested.subQuestions[0].contents[0].svg, svg);
assert.throws(() => problemFigureBlocks({ ...p, images: [] }), /그림1/);
console.log('PASS choices/subquestions retain figures, missing assets stop export');
const payload = buildHwpPayload([{ original: p, variant: p } as never], { title: '시험' } as never, 'original',
  { template: 'jeongtong', columns: 2, columnDivider: true, color: '#123456', marginPreset: 'normal', fontPack: 'system',
    showAnswers: true, quickAnswerOnly: false, spacing: 32, showChapter: true });
assert.equal(payload.renderFigures, true); assert.equal(hasHwpFigures(payload), true);
assert.equal(payload.problems[0].score, '3.0'); assert.equal(payload.problems[0].solution, '풀이');
assert.equal(payload.style?.columns, 2); assert.equal(payload.style?.showChapter, true);
console.log('PASS HWP styles, printed score and answers are preserved');
const row = { id: 1, number: 8, body: { contents: [{ type: 'figure', crop: p.images![0].dataUrl }] } } as TestchangeQuestion;
const ocr = testchangeQuestionToOcr(row);
assert.ok(ocr.text.includes('[그림1]')); assert.equal(ocr.images?.length, 1);
assert.equal(ocrToGenerated(ocr).images?.[0].dataUrl, p.images![0].dataUrl);
const data = { questions: [row] } as TestchangeExamData;
assert.deepEqual(missingEngineFigures(data), []);
assert.equal(figureAssetKey(1, { type: 'figure', page: 2, bbox: [10, 20.5, 30, 40] }), '1:2:10,20.5,30,40');
let visits = 0; visitEngineFigures({ choices: [{ number: 1, contents: [{ type: 'figure' }] }], sub_questions: [row.body] }, () => visits++);
assert.equal(visits, 2);
console.log('PASS testchange figures carry through the web editor and recursive source lookup');
const oldFigure = { type: 'figure', page: 4, bbox: [10, 20, 30, 40] };
const legacy = { exam: { id: 5 }, questions: [
  { id: 19, number: 19, body: { contents: [{ type: 'text', value: '모눈종이' }] } },
  { id: 21, number: 21, body: { contents: [oldFigure] } },
] } as TestchangeExamData;
const key = figureAssetKey(21, oldFigure);
await restoreStoredFigures({ storage: { from: () => ({ download: async () => ({ data: new Blob([JSON.stringify({ schema: 1,
  crops: { [key]: 'data:image/png;base64,cGl4ZWxz' }, moves: { [key]: 19 } })]) }) }) } } as never, legacy);
assert.equal(legacy.questions[0].body.contents?.[1].type, 'figure');
assert.equal(legacy.questions[1].body.contents?.length, 0);
console.log('PASS source-PDF anchors repair cross-column picture ownership');
assert.equal(await hwpExtension(new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])])), 'hwp');
assert.equal(await hwpExtension(new Blob(['PK\u0003\u0004'])), 'hwpx');
await assert.rejects(() => hwpExtension(new Blob(['error'])));
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { permissions: { query: async () => ({ state: 'denied' }) } } });
assert.match(await connectorAccessMessage(), /차단/);
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
assert.match(await connectorAccessMessage(), /연결하지 못/);
console.log('PASS actual file type and denied/unknown connection guidance');
