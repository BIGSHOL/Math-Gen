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
 * **알고리즘** (OCR_PAGE_PROMPT rule 4b 와 일관):
 * - 마지막 *비어있지 않은 줄* 부터 역순으로 검사
 * - 그 줄에서 마커가 정확히 5 개 매치 → 객관식, 보기 5개 반환
 * - 5 미만 (부분 매치) → undefined (손상된 OCR 결과로 간주, 변형 skip)
 * - 0 매치 → 한 줄 더 앞으로 (다른 줄 검사 X — 첫 마커 줄에서 결정)
 *
 * **반환값**:
 * - `string[]` (5개) — 객관식
 * - `undefined` — 주관식 또는 손상
 */
export const extractChoices = (text: string): string[] | undefined => {
  if (!text) return undefined;
  const lines = text.split("\n").filter((l) => l.trim());
  // 역순 검사 — 본문 끝에 보기가 있는 게 표준.
  for (let i = lines.length - 1; i >= 0; i--) {
    const matches = [...lines[i].matchAll(CHOICE_RE)];
    if (matches.length === 5) {
      return matches.map((m) => m[2].trim());
    }
    if (matches.length > 0) {
      // 부분 매치 — 손상된 보기로 간주, 추출 포기.
      return undefined;
    }
    // 0 매치 — 그 줄엔 보기 없음. 더 앞 줄도 보기 없으면 주관식.
    // (보통 본문 줄에는 ①②③ 안 나옴 — 한 줄만 검사해도 충분하지만
    //  multi-line choices 가능성 위해 계속 역행.)
  }
  return undefined;
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
  };
};
