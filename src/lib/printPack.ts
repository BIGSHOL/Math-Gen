// printPack.ts
// 측정 높이 기반 페이지 패킹 (순수 함수 — React/DOM 의존 0, 단위 테스트 가능).
//
// usePrintLayout 이 각 문항을 화면 밖에 렌더해 offsetHeight 를 실측한 뒤 이
// 함수로 페이지/컬럼을 정한다. 추측(글자수) 이 아니라 실측이라 페이지 넘침·
// 잘림(CLAUDE.md §내보내기 R1·R4) 이 사라진다.
//
// 패킹 정책: *컬럼-메이저 그리디* — 읽기 순서 보존. 좌측 컬럼을 위→아래로 채우다
// 다음 문항이 안 들어가면 우측 컬럼, 둘 다 차면 새 페이지. (높이 균형 분배는
// 읽기 순서를 깨므로 안 함.)

import type { PrintOptions, ProblemReview } from "@app/stores/wizardStore";
import { TEMPLATE_GEOMETRY } from "@app/lib/printGeometry";

export interface PackedPage {
  /** 이 페이지 문항 (읽기 순서 flat). */
  problems: ProblemReview[];
  /** 우측 컬럼 시작 인덱스 (problems 내). 1단/단일컬럼이면 == problems.length. */
  splitIndex: number;
  /** 이 페이지 첫 문항의 전역 1-indexed 번호. */
  startingNumber: number;
}

export interface PackInput {
  problems: ProblemReview[];
  /** index-aligned 측정 높이 (px). heights[i] = problems[i] 래퍼의 offsetHeight. */
  heights: number[];
  /** 측정된 가용 컨텐츠 높이 — 첫 페이지 / 이후 페이지. */
  avail: { first: number; cont: number };
  options: Pick<
    PrintOptions,
    "template" | "columns" | "spacing" | "layoutMode" | "problemsPerColumn"
  >;
}

/** 페이지당 개수 고정 분할 (workbook/jaseup 1단 풀이공간 stretch 전용). */
function chunkByCount(problems: ProblemReview[], perPage: number): PackedPage[] {
  const pages: PackedPage[] = [];
  const n = Math.max(1, perPage);
  for (let i = 0; i < problems.length; i += n) {
    const slice = problems.slice(i, i + n);
    pages.push({ problems: slice, splitIndex: slice.length, startingNumber: i + 1 });
  }
  return pages;
}

/**
 * count 모드 — *컬럼당 정확히 perColumn 개* (페이지당 perColumn×columns).
 * 문항 높이 무시. 여백은 렌더 측(BodyContainer `distribute` = space-evenly)이
 * 컬럼 높이에 맞춰 자동 균등 분배. splitIndex 는 1단=전체, 2단=perColumn.
 */
function chunkByColumnCount(
  problems: ProblemReview[],
  perColumn: number,
  columns: 1 | 2,
): PackedPage[] {
  const per = Math.max(1, perColumn);
  const perPage = per * columns;
  const pages: PackedPage[] = [];
  for (let i = 0; i < problems.length; i += perPage) {
    const slice = problems.slice(i, i + perPage);
    const splitIndex = columns === 1 ? slice.length : Math.min(per, slice.length);
    pages.push({ problems: slice, splitIndex, startingNumber: i + 1 });
  }
  return pages;
}

function devWarnOversized(p: ProblemReview, h: number, availH: number): void {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[printPack] 문항(${p.id})이 한 컬럼보다 큼 (${Math.round(h)}px > ${Math.round(
        availH,
      )}px) — 단독 배치, 하단 잘림 가능. (도형/수식 과다 또는 세로여백 과다)`,
    );
  }
}

/**
 * 측정 높이로 문항을 페이지·컬럼에 패킹.
 *
 * @returns PackedPage[] — 각 페이지의 flat 문항 배열 + splitIndex(우측 컬럼 시작)
 *          + startingNumber(전역 1-indexed). BodyContainer 가 splitIndex 로 분할.
 */
export function packProblems(input: PackInput): PackedPage[] {
  const { problems, heights, avail, options } = input;
  if (problems.length === 0) return [];
  const { template, columns, spacing } = options;
  const g = TEMPLATE_GEOMETRY[template];

  // count 모드 — 단별 문항 수 고정 (사용자 지정). 여백/높이 무시하고 컬럼당 N개씩.
  // 여백은 렌더가 자동 균등 분배. 모든 템플릿 공통 (stretch1Col 보다 우선).
  if (options.layoutMode === "count") {
    return chunkByColumnCount(problems, options.problemsPerColumn ?? 3, columns);
  }

  // workbook/jaseup 1단 = 풀이공간 flex:1 stretch → 자연 높이 무의미 → 개수 패킹.
  if (columns === 1 && g.stretch1Col) {
    return chunkByCount(problems, g.perPageOneCol ?? 4);
  }

  // gap = 사용자 "세로 여백" preset (BodyContainer flex gap 과 동일 값). 템플릿과
  // 패커가 같은 spacing 을 써야 측정==렌더. (CLAUDE.md §내보내기 R-spacing 일치)
  const gap = Math.max(0, spacing);

  const pages: PackedPage[] = [];
  let i = 0;
  let startingNumber = 1;

  while (i < problems.length) {
    const availH = pages.length === 0 ? avail.first : avail.cont;
    const pageProblems: ProblemReview[] = [];
    let splitIndex = -1;

    for (let c = 0; c < columns; c++) {
      let used = 0;
      let placed = 0;
      while (i < problems.length) {
        const h = heights[i] ?? 0;
        const cost = h + (placed > 0 ? gap : 0);
        // 한 컬럼보다 큰 단일 문항 → 자르지 않고 단독 배치 (무한루프 방지).
        if (placed === 0 && h > availH) {
          pageProblems.push(problems[i]);
          devWarnOversized(problems[i], h, availH);
          placed++;
          i++;
          break; // 이 컬럼은 (넘쳐도) 끝 → 다음 컬럼/페이지
        }
        if (used + cost > availH) break; // 컬럼 가득 — 문항 i 는 다음 컬럼/페이지로
        pageProblems.push(problems[i]);
        used += cost;
        placed++;
        i++;
      }
      if (c === 0) splitIndex = pageProblems.length; // 우측 컬럼 시작 인덱스
    }
    if (columns === 1) splitIndex = pageProblems.length;

    // 방어선: 한 문항도 못 넣으면 (이론상 oversized 분기가 막지만) 강제 1개 — 무한루프 차단.
    if (pageProblems.length === 0 && i < problems.length) {
      pageProblems.push(problems[i]);
      i++;
      splitIndex = pageProblems.length;
    }

    pages.push({
      problems: pageProblems,
      splitIndex: splitIndex < 0 ? pageProblems.length : splitIndex,
      startingNumber,
    });
    startingNumber += pageProblems.length;
  }
  return pages;
}
