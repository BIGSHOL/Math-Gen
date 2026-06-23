// ocrJsonRecoveryHarness.mts
//
// recoverJson stage 6(value 문자열 contextual 복구) 회귀 하네스 — 서술형 지문에서
// 모델이 escape 안 한 내부 큰따옴표로 깨진 JSON 을 되살리는지 검증(사용자 보고
// 2026-06-22, /api/ai-ocr 500: "Expected ',' or '}' after property value").
// 순수 로직 — API·브라우저 불필요.
//
// 실행:  npx tsx scripts/ocrJsonRecoveryHarness.mts        (실패 시 exit 1)

import { recoverJson } from "../src/services/ai/ocrJsonRecovery.js";

interface Case {
  name: string;
  raw: string;
  /** 복구된 객체에서 뽑은 (경로, 기대값) — 검증용 */
  check: (obj: any) => boolean;
}

const CASES: Case[] = [
  {
    name: "value 안 escape 안 된 대사 따옴표 + 다음 키",
    // 그는 "안녕"이라 했다  ← 내부 따옴표 escape 누락
    raw: '{"items":[{"number":2,"value":"그는 "안녕"이라 했다","rows":[]}]}',
    check: (o) =>
      o?.items?.[0]?.value === '그는 "안녕"이라 했다' &&
      Array.isArray(o?.items?.[0]?.rows),
  },
  {
    name: "지문 안 인용어 + 콤마(산문) + 닫힘",
    raw: '{"items":[{"value":"답: "5", 정답은 그것"}]}',
    check: (o) => o?.items?.[0]?.value === '답: "5", 정답은 그것',
  },
  {
    name: "서답형 reported shape (아라비안 나이트)",
    raw:
      '{"items":[{"number":2,"score":9,"labelType":"서답형","contents":[' +
      '{"type":"text","value":"다음은 "아라비안 나이트"를 이용한 이야기이다.","rows":[]}]}]}',
    check: (o) =>
      o?.items?.[0]?.contents?.[0]?.value === '다음은 "아라비안 나이트"를 이용한 이야기이다.',
  },
  {
    name: "정상 JSON 은 그대로 (회귀 없음)",
    raw: '{"items":[{"number":1,"value":"정상 본문 a, b, c","rows":[]}]}',
    check: (o) => o?.items?.[0]?.value === "정상 본문 a, b, c",
  },
  {
    name: "LaTeX 역슬래시 + 내부 따옴표 동시",
    raw: '{"items":[{"value":"$\\frac{1}{2}$ 는 "절반""}]}',
    check: (o) => typeof o?.items?.[0]?.value === "string" && o.items[0].value.includes("절반"),
  },
];

let failures = 0;
for (const c of CASES) {
  let obj: unknown;
  let threw = false;
  try {
    obj = recoverJson(c.raw);
  } catch {
    threw = true;
  }
  const ok = !threw && obj !== undefined && c.check(obj);
  if (!ok) failures += 1;
  const got = obj === undefined ? "undefined" : JSON.stringify(obj).slice(0, 90);
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}`);
  if (!ok) console.log(`        got: ${got}`);
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures}/${CASES.length}건 실패`);
  process.exit(1);
}
console.log(`✓ 전체 통과 (${CASES.length}건)`);
