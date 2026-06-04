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

import type {
  OCRProblem,
  ProblemReview,
  WizardPage,
} from "@app/stores/wizardStore";
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
    // 원본 도형(vector spec) 보존 — 내보내기(원본 출력) 와 변형 카드가 도형을 그릴
    // 수 있도록 carry. 이전엔 drop 해서 buildDigitizeReviews 로 도출한 내보내기 문제에
    // 도형이 통째로 사라졌다 (사용자 보고 2026-06-04: 21번 — OCR 엔 보이는데 내보내기
    // 미리보기엔 전혀 안 보임). artwork 같은 *이미지* 도형(it.images)은 GeneratedProblem
    // 에 필드가 없어 아직 미전달 — 별도 plumbing 후속.
    diagramParams: it.diagramParams ?? null,
    // Phase #7: OCR 원본 보기 배치 상속 — 변형 카드에서도 원본과 동일 grid.
    choicesLayout: it.choicesLayout ?? "auto",
  };
};

/**
 * 변형 가능(eligible) OCR 문항 필터 — **단일 source of truth**.
 *
 * `useVariantGen` 시드 / `Step3Options` 카운트 / `Step5Export` digitize live 도출이
 * *모두* 이 함수를 호출해야 한다. 예전엔 같은 필터가 여러 곳에 복붙돼 있어 한 곳만
 * 룰을 바꾸면 "Step3 30문항 → Step4 15문항" 류 불일치가 났다 (CLAUDE.md §16-8).
 *
 * 조건: 문항 페이지(또는 forceOcr) 의 ocrResult 중 본문 있음 + !bodyMissing +
 * !choicesMissing + solution 있음 + !solutionError. 결손 문항은 제외.
 */
export const eligibleOcrProblems = (pages: WizardPage[]): OCRProblem[] =>
  pages
    .filter((p) => p.isProblemPage || p.forceOcr)
    .flatMap((p) => p.ocrResult)
    .filter(
      (it) =>
        !!it.text &&
        !it.bodyMissing &&
        !it.choicesMissing &&
        !!it.solution &&
        !it.solutionError,
    );

/**
 * digitize 전용 — 현재 `ocrResult` 를 `ProblemReview[]` (status `confirmed`) 로 변환.
 *
 * **배경** (사용자 결정 2026-06-04 "digitize면 live ocrResult 사용"): digitize 는
 * 변형을 만들지 않고 OCR 결과를 *그대로* 쓴다. 그런데 `useVariantGen` 은 한 번만
 * 시드하므로(`problems.length === 0` 가드), 시드 *후* 재OCR/해설 재생성으로
 * `ocrResult` 가 바뀌어도 변형 snapshot(= 옛 해설 포함)이 stale 로 남아 내보내기에
 * 옛 해설이 노출됐다. digitize 변형은 ocrResult 순수 복사라 *사용자 편집이 없으므로*
 * 항상 live 로 재도출해도 손실 0 (§16-7 의 edit-loss 우려는 digitize 에 무관).
 *
 * `useVariantGen` (staleness 재시드) 와 `Step5Export` (내보내기 시 live 도출) 가 공유.
 */
export const buildDigitizeReviews = (pages: WizardPage[]): ProblemReview[] =>
  eligibleOcrProblems(pages).map((it) => {
    const original = ocrToGenerated(it);
    return {
      id: it.id,
      original,
      variant: original,
      status: "confirmed",
      generating: false,
    };
  });
