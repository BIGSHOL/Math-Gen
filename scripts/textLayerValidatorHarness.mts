// textLayerValidatorHarness.mts
//
// 인식률 Step 3 (§28-2) text-layer 대조 검증기 회귀 하네스 — 순수 로직만 검증.
// API·브라우저 불필요 (Canvas 안 씀). validateOcrAgainstTextLayer 의 anchor recall
// 휴리스틱이 (a) 정상 OCR 은 통과, (b) 본문 누락은 경고, (c) 스캔/신호부족은 skip
// 하는지 확인한다.
//
// 실행:  npx tsx scripts/textLayerValidatorHarness.mts        (실패 시 exit 1)

import {
  validateOcrAgainstTextLayer,
  assembleOcrText,
} from "../src/lib/textLayerValidator.js";

interface Case {
  name: string;
  ocr: string;
  layer: string;
  /** true = 경고(suspicious) 기대, false = null 기대 */
  expectWarn: boolean;
}

// born-digital 페이지 원문(text-layer) 샘플 — 한글 발문 + 변별 숫자.
const FULL_LAYER = [
  "다음 그림과 같이 한 변의 길이가 225인 정사각형 ABCD가 있다.",
  "두 자연수 225와 135의 최대공약수를 구하시오.",
  "함수 그래프에서 넓이가 1024인 영역의 둘레의 길이를 구하면?",
  "오른쪽 그림에서 각 ABC의 크기를 구하시오. [4점]",
  "보기에서 옳은 것을 모두 고른 것은?",
].join("\n");

// OCR 이 원문을 충실히 전사한 경우(LaTeX/마크다운 섞임).
const FULL_OCR_GOOD = [
  "다음 그림과 같이 한 변의 길이가 $225$인 정사각형 $\\overline{ABCD}$가 있다.",
  "두 자연수 $225$와 $135$의 최대공약수를 구하시오.",
  "함수 그래프에서 넓이가 $1024$인 영역의 둘레의 길이를 구하면?",
  "오른쪽 그림에서 각 $ABC$의 크기를 구하시오.",
  "보기에서 옳은 것을 모두 고른 것은?",
].join("\n");

// OCR 이 두 문제(절반)를 통째로 빠뜨린 경우 → 누락.
const FULL_OCR_MISSING = [
  "다음 그림과 같이 한 변의 길이가 $225$인 정사각형 $ABCD$가 있다.",
  "두 자연수 $225$와 $135$의 최대공약수를 구하시오.",
].join("\n");

const CASES: Case[] = [
  {
    name: "정상 전사 → 통과(null)",
    ocr: FULL_OCR_GOOD,
    layer: FULL_LAYER,
    expectWarn: false,
  },
  {
    name: "본문 절반 누락 → 경고",
    ocr: FULL_OCR_MISSING,
    layer: FULL_LAYER,
    expectWarn: true,
  },
  {
    name: "스캔(text-layer 빈값) → skip(null)",
    ocr: FULL_OCR_GOOD,
    layer: "",
    expectWarn: false,
  },
  {
    name: "OCR 빈 결과 → skip(null)",
    ocr: "",
    layer: FULL_LAYER,
    expectWarn: false,
  },
  {
    name: "anchor 부족(짧은 페이지) → skip(null)",
    ocr: "값을 구하시오",
    layer: "값을 구하시오 [3점]",
    expectWarn: false,
  },
];

let failures = 0;
for (const c of CASES) {
  const w = validateOcrAgainstTextLayer(c.ocr, c.layer);
  const warned = w !== null;
  const ok = warned === c.expectWarn;
  if (!ok) failures += 1;
  const scoreStr = w ? ` (${Math.round(w.score * 100)}%, miss=${w.missingSample.slice(0, 4).join("/")})` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}${scoreStr}`);
}

// assembleOcrText — choiceGroups 없는 OCRProblem 류 shape 도 안전 처리.
const assembled = assembleOcrText([
  { text: "본문 가나다", answer: "③" },
  { text: "둘째 문제" },
]);
const assembleOk = assembled.includes("가나다") && assembled.includes("둘째 문제") && assembled.includes("③");
console.log(`${assembleOk ? "PASS" : "FAIL"}  assembleOcrText 조립`);
if (!assembleOk) failures += 1;

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures}건 실패`);
  process.exit(1);
}
console.log(`✓ 전체 통과 (${CASES.length + 1}건)`);
