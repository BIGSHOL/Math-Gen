// solutionValidatorHarness.mts
//
// 해설 정확도/형식 validator 회귀 하네스 — `solutionValidator.validateSolution`
// 이 *나쁜 풀이* (trial-and-error 흔적 / 과도한 분량 / "서로 다른 N" 위반) 를
// 잡고, *깨끗한 풀이* 는 통과시키는지 검증.
//
// 배경: SOLUTION_PROMPT 가 trial-and-error / 장황함을 강력히 금지하지만 모델이
// 종종 위반(사용자 2026-06-02 보고). validator 가 검출하면 useSolutionGen 의
// *1회 자동 재생성* 이 발동 → 강력 차단. 이 하네스는 검출 로직 회귀를 막는다.
//
// 실행:  npx tsx scripts/solutionValidatorHarness.mts   (실패 시 exit 1)

import { validateSolution } from "../src/lib/solutionValidator.js";

interface Case {
  name: string;
  problemText: string;
  solutionText: string;
  /** 기대하는 rule (없으면 빈 배열 — 경고 없어야 함). */
  expectRules: string[];
}

// 사용자 보고 2026-06-02 — trial-and-error 흔적 (실제 출력 발췌, 응축).
const TRIAL_ERROR_SOL = [
  "Q(3)=−66+8+8=−50",
  "선택지와 맞지 않으므로 중복 case를 재검토한다.",
  "여전히 −50. 선택지를 다시 보면 −9,−19,−21,−23,−26이다.",
  "앞서 (1b)에서 a−b=−3으로 잘못 설정했다.",
  "다시 계산: P(−1)=a−b+c=3이고 ...",
  "Q(3)=−23",
].join("\n");

// 깨끗한 풀이 (직선 흐름, 검증/재시작 흔적 없음).
const CLEAN_SOL = [
  "$f(x) = (x-p)^2 - 4$ 로 놓으면 $q=-4$.",
  "$f(x)=2x$ 의 두 근의 합이 2이므로 $2p+2=2$, 즉 $p=0$.",
  "$f(x)=x^2-4$ 이고 $\\alpha=-2$, $\\beta=2$.",
  "$\\alpha^3+\\beta^3=(-2)^3+2^3=0$",
].join("\n");

// 과도하게 긴 풀이 (33+ 비어있지 않은 줄).
const LONG_SOL = Array.from({ length: 36 }, (_, i) => `${i + 1}단계 식 전개 ...`).join("\n");

// "서로 다른 세 정수" 위반 (기존 distinct-tuple 규칙 회귀).
const DISTINCT_VIOLATION = "세 정수의 곱이 -50: (-50, 1, 1), (-50, 1, 1), (5, -2, 5)";

const CASES: Case[] = [
  { name: "trial-and-error 흔적", problemText: "...", solutionText: TRIAL_ERROR_SOL, expectRules: ["trial-and-error"] },
  { name: "깨끗한 풀이 (경고 X)", problemText: "이차함수 ...", solutionText: CLEAN_SOL, expectRules: [] },
  { name: "과도한 분량", problemText: "...", solutionText: LONG_SOL, expectRules: ["too-long"] },
  {
    name: "서로 다른 세 정수 위반 (회귀)",
    problemText: "서로 다른 세 정수의 곱이 -50일 때 ...",
    solutionText: DISTINCT_VIOLATION,
    expectRules: ["distinct-tuple"],
  },
];

let failed = 0;
for (const c of CASES) {
  const warnings = validateSolution({ problemText: c.problemText, solutionText: c.solutionText });
  const rules: string[] = warnings.map((w) => w.rule as string);
  // expectRules 가 모두 포함됐고, 비어있어야 하면 정말 비어있는지.
  const hasAllExpected = c.expectRules.every((r) => rules.includes(r));
  const noUnexpectedWhenEmpty = c.expectRules.length > 0 || rules.length === 0;
  const ok = hasAllExpected && noUnexpectedWhenEmpty;
  if (ok) {
    console.log(`  PASS  ${c.name}  → [${rules.join(", ") || "none"}]`);
  } else {
    failed++;
    console.log(`  FAIL  ${c.name}`);
    console.log(`        expected rules: [${c.expectRules.join(", ") || "none"}]`);
    console.log(`        got rules:      [${rules.join(", ") || "none"}]`);
    warnings.forEach((w) => console.log(`        - ${w.summary}`));
  }
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
if (failed > 0) {
  console.error(`\n${failed} case(s) FAILED — validator 회귀.`);
  process.exit(1);
}
