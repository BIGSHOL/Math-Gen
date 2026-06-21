// contentParserGoldenHarness.mts
//
// content_parser 웹 이식 회귀 하네스 — `contentParser.ts`(normalizeContents/normalizeChoice)
// 가 testchange `content_parser.py` 원본과 *블록 byte 동치* 인지 검증.
//
// 배경: HWP 커넥터(adapter.py _adapt_native_problem)가 네이티브 블록에 content_parser
// 전체를 재실행하므로 .hwp 는 이미 정규화됨. 웹은 blocksToMarkdown 직렬화만 해 어긋났던
// 것(쪼개진 수식·보기 박스 미완)을 contentParser.ts 이식으로 일치시켰다(CLAUDE.md §35).
// 이 하네스가 그 일치(byte 동치)를 회귀로부터 지킨다.
//
// 실행 (testchange 불필요 — 커밋된 baseline.json 과 대조):
//     npx tsx scripts/contentParserGoldenHarness.mts        (실패 시 exit 1)
//
// baseline 재생성 (이식본/원본 변경 시, testchange 필요):
//     python scripts/contentParserGolden.py                 (TESTCHANGE_DIR 환경변수)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  hasGeometryContext,
  type NBlock,
  normalizeChoice,
  normalizeContents,
} from "../src/services/ai/contentParser.js";

interface RawBlock {
  type: string;
  value: string;
  rows: string[][];
}
interface Fixture {
  name: string;
  contents: RawBlock[];
  choices: Array<{ number: number; contents: RawBlock[] }>;
}
interface Baseline {
  name: string;
  contents: Array<[string, string]>;
  choices: Array<Array<[string, string]>>;
}

const here = (rel: string): string =>
  fileURLToPath(new URL(rel, import.meta.url));

const dump = (blocks: NBlock[]): Array<[string, string]> =>
  blocks.map((b) => [b.type, b.value || ""] as [string, string]);

const fixtures: Fixture[] = JSON.parse(
  readFileSync(here("./contentParserGolden.fixtures.json"), "utf-8"),
);
const baseline: Baseline[] = JSON.parse(
  readFileSync(here("./contentParserGolden.baseline.json"), "utf-8"),
);
const byName = new Map(baseline.map((p) => [p.name, p]));

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

let pass = 0;
let fail = 0;
for (const fx of fixtures) {
  const norm = normalizeContents(fx.contents as never);
  const geo = hasGeometryContext(norm);
  const tsContents = dump(norm);
  const tsChoices = (fx.choices ?? []).map((c) => dump(normalizeChoice(c.contents as never, geo)));

  const base = byName.get(fx.name);
  if (!base) {
    console.log(`?? ${fx.name}: no baseline (run scripts/contentParserGolden.py)`);
    fail++;
    continue;
  }
  const okC = eq(tsContents, base.contents);
  const okCh = eq(tsChoices, base.choices);
  if (okC && okCh) {
    pass++;
  } else {
    fail++;
    console.log(`\nFAIL ${fx.name}`);
    if (!okC) {
      console.log("  contents PY:", JSON.stringify(base.contents));
      console.log("  contents TS:", JSON.stringify(tsContents));
    }
    if (!okCh) {
      console.log("  choices PY:", JSON.stringify(base.choices));
      console.log("  choices TS:", JSON.stringify(tsChoices));
    }
  }
}

console.log(`\n=== ${pass} pass / ${fail} fail / ${fixtures.length} total ===`);
process.exit(fail > 0 ? 1 : 0);
