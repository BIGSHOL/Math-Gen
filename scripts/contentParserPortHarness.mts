// contentParserPortHarness.mts
//
// testchange 파서 픽스 웹 이식(2026-06-23) 검증 — golden(기존 25 픽스처)이 안 타는 *신규
// 코드경로*를 직접 확인. 이식 출처: dbe8143(선택지 ①①·trailing question)·8126286(mid-block
// 박스마커)·99d2ff1(값나열 쉼표 보존). API·브라우저 불필요.
//
// 실행:  npx tsx scripts/contentParserPortHarness.mts        (실패 시 exit 1)

import {
  normalizeContents,
  normalizeChoiceGroups,
  type NBlock,
} from "../src/services/ai/contentParser.js";

const T = (value: string) => ({ type: "text" as const, value, rows: [] as string[][] });
const E = (value: string) => ({ type: "equation" as const, value, rows: [] as string[][] });
const joined = (bs: NBlock[]) => bs.map((b) => b.value || "").join("¦");
const hasBox = (bs: NBlock[]) => bs.some((b) => (b as { boxMember?: boolean }).boxMember);

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  →  ${detail}`}`);
};

// ── 포팅1 — 선택지 ①① 이중마커 제거 (dbe8143) ──
{
  const g = normalizeChoiceGroups(
    [{ number: 1, contents: [T("① 14")] }] as never,
    false,
  );
  const v = joined(g[0].contents);
  check("P1 선택지 선두 ① strip (`① 14`→`14`)", v === "14", `got "${v}"`);
}
{
  // 마커 단독 + 단일 블록 = figure-choice → 보존
  const g = normalizeChoiceGroups([{ number: 2, contents: [T("②")] }] as never, false);
  const v = joined(g[0].contents);
  check("P1 마커 단독(figure-choice) 보존", v === "②", `got "${v}"`);
}

// ── 포팅2 — 값나열 쉼표 보존 (99d2ff1) ──
{
  // f(x), g(x) — 관계식 없음 → has_rel 게이트로 병합 차단, 쉼표 보존
  const out = normalizeContents([E("f(x), g(x)")]);
  const v = joined(out);
  check("P2 `f(x), g(x)` 쉼표 보존(미병합)", v.includes(",") && !/f\(x\)\s+g\(x\)/.test(v), `got "${v}"`);
}
{
  // b, 0, √2 — sqrt 리터럴 atom 인정 + has_rel 게이트 → 보존
  const out = normalizeContents([E("b, 0, \\sqrt{2}")]);
  const v = joined(out);
  check("P2 `b, 0, \\sqrt{2}` 쉼표 보존", v.includes(",") && v.includes("\\sqrt{2}"), `got "${v}"`);
}
{
  // \, (얇은공백)에서 가짜 split 안 함
  const out = normalizeContents([E("20\\,\\mathrm{m}")]);
  const v = joined(out);
  check("P2 `\\,` 에서 가짜 쉼표 split 안 함", !/20\s*,\s*\\mathrm/.test(v) && v.includes("\\mathrm{m}"), `got "${v}"`);
}

// ── 포팅3 — mid-block 박스마커 분리 (8126286) ──
{
  // 발문 종결 뒤 같은 블록 중간 <보기> + 항목라벨 → 마커 앞에서 split → 박스 형성
  const out = normalizeContents([T("다음 중 옳은 것은? <보기> ㄱ. 가나 ㄴ. 다라")]);
  check("P3 mid-block `<보기>` 박스 형성(boxMember)", hasBox(out) && out.length >= 2, `blocks=${out.length} box=${hasBox(out)} :: ${joined(out)}`);
}
{
  // 참조어 `<보기> 중` 은 제외(분리 안 함) — lookahead 가 항목라벨 없으면 미발동
  const out = normalizeContents([T("<보기> 중 옳은 것을 고르시오")]);
  check("P3 참조어 `<보기> 중` 미분리(오버리치 방지)", out.length === 1, `blocks=${out.length} :: ${joined(out)}`);
}

// ── 포팅4 — 라벨없는 박스 trailing question 분리 (dbe8143) ──
{
  const out = normalizeContents([
    T("<상자> 다음 과정을 보자"),
    E("\\boxed{7}"),
    T("위의 과정에서 옳은 것을 나열한 것은?"),
  ]);
  // 마지막 질문 블록이 박스 밖으로 분리 → 그 블록은 boxMember 아님
  const last = out[out.length - 1] as { boxMember?: boolean; value?: string };
  const splitOut = !last.boxMember && /나열한 것은\?/.test(last.value || "");
  check("P4 라벨없는 박스 trailing question 분리", splitOut, `last boxMember=${last.boxMember} :: ${joined(out)}`);
}

console.log("");
if (fail > 0) {
  console.error(`✗ ${fail}건 실패`);
  process.exit(1);
}
console.log("✓ 전체 통과");
