/**
 * OCRProblem ↔ GeneratedProblem 어댑터.
 *
 * **배경**: Step 2 (OCR) 는 `OCRProblem` 으로 저장 (text 안에 본문+보기가
 * 통합), Step 4 (Variant Review) 는 `GeneratedProblem` 으로 처리 (question /
 * choices 분리). 두 도메인을 잇는 헬퍼.
 *
 * - `extractChoices(text)` — ①②③④⑤ 정규식으로 마지막 5 마커 분리.
 *   - 정확히 5 마커 → `string[]` (객관식)
 *   - 부분 마커 (1~4 마커) → `undefined` (손상 / 무시)
 *   - 0 마커 → `undefined` (주관식)
 * - `stripChoicesLine(text)` — 보기 줄 제거 → 본문만 (question).
 * - `ocrToGenerated(it)` — 위 두 헬퍼 활용 + 답·풀이·topic 그대로 복사.
 *   `diagramSVG: null` (이번 phase 는 도형 재생성 X — caller 가 OCRProblem.
 *   images 그대로 사용).
 */

import type { OCRProblem } from "@app/stores/wizardStore";
import type { GeneratedProblem } from "@app/types";

/** 마커 + 보기 내용 매치. lookahead 로 다음 마커 직전까지 캡처. */
const CHOICE_RE = /([①②③④⑤])\s*((?:(?![①②③④⑤]).)+)/g;

/**
 * 본문 텍스트에서 ①②③④⑤ 5 마커 보기를 분리해 string 배열로 반환.
 *
 * **알고리즘**: 마지막 `①` 위치부터 끝까지(tail)를 검사 — 한 줄(`① a ② b …`)
 * 이든 여러 줄(`① a\n② b\n…`, 줄당 1 보기)이든 모두 처리. tail 의 마커가 정확히
 * ①②③④⑤ 5개 순서면 객관식.
 *
 * 이전엔 *한 줄에 5 마커* 만 인식 → **줄당 1 보기 형식**(흔함)이 "부분 매치 =
 * 손상" 으로 오인돼 choices 미추출 → 인쇄 시 choices 가 question 본문 inline 으로
 * (작은 grid 대신) *큰 본문 크기* 로 렌더되는 1단/2단 불일치 버그 (사용자 보고
 * 2026-06-04). tail 기반으로 멀티라인 지원.
 *
 * **반환값**: `string[]`(5개) 객관식 / `undefined` 주관식·손상.
 */
const CHOICE_ORDER = "①②③④⑤";
export const extractChoices = (text: string): string[] | undefined => {
  if (!text) return undefined;
  const lastOne = text.lastIndexOf("①");
  if (lastOne < 0) return undefined;
  const tail = text.slice(lastOne);
  const matches = [...tail.matchAll(CHOICE_RE)];
  if (matches.length !== 5) return undefined; // 5개 아니면 주관식/손상
  if (!matches.every((m, i) => m[1] === CHOICE_ORDER[i])) return undefined; // ①②③④⑤ 순서 확인
  return matches.map((m) => m[2].trim());
};

/**
 * 본문에서 보기 줄을 제거하고 question 만 반환.
 *
 * 마지막 ①②③④⑤ 마커가 등장하는 줄을 찾아 그 줄부터 끝까지 제거.
 * 마커가 없으면 원본 그대로.
 */
export const stripChoicesLine = (text: string): string => {
  if (!text) return text;
  const lines = text.split("\n");
  // 첫 ①②③④⑤ 마커가 등장하는 줄 인덱스 (앞에서 검사).
  // OCR 표준: 본문 → 빈 줄 → 보기 (한 줄 또는 다중 줄).
  const markerIdx = lines.findIndex((l) => /[①②③④⑤]/.test(l));
  if (markerIdx < 0) return text;
  // 그 줄 *이전* 까지만 본문. trailing whitespace trim.
  return lines.slice(0, markerIdx).join("\n").trimEnd();
};

/**
 * OCRProblem → GeneratedProblem 변환.
 *
 * **필드 매핑**:
 * - `text` → `question` + `choices` (extractChoices 로 분리)
 * - `answer` → `answer`
 * - `solution` → `solution`
 * - `topic` → `topic`
 * - (없음) → `difficulty: "중"` (변형 시 사용자 옵션 반영)
 * - `images[]` → `diagramSVG: null` (도형은 OCRProblem.images 별도 보관,
 *   GeneratedProblem 의 diagramSVG 는 *SVG 문자열* 이라 변환 X)
 */
export const ocrToGenerated = (it: OCRProblem): GeneratedProblem => {
  const choices = extractChoices(it.text);
  return {
    question: choices ? stripChoicesLine(it.text) : it.text,
    choices,
    answer: it.answer ?? "",
    solution: it.solution ?? "",
    topic: it.topic ?? "",
    difficulty: "중",
    diagramSVG: null,
    // Phase #7: OCR 원본 보기 배치 상속 — 변형 카드에서도 원본과 동일 grid.
    choicesLayout: it.choicesLayout ?? "auto",
  };
};
