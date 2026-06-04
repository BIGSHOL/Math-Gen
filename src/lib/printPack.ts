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
 * count 모드 — 컬럼당 *최대* perColumn 개. **높이 인지** — perColumn 개가 페이지에
 * 안 들어가면(특히 키 큰 서술형·표) 더 적게 담아 *페이지 넘침(잘림) 방지* (사용자
 * 보고 2026-06-04: "줄맞춤하면서 여백 무시하고 넘어가면 의미없다"). 들어가면
 * perColumn 개, 그 안에서 렌더가 풀이여백을 균등 분배.
 *
 * 2단은 *행 단위* 로 fit 검사 — 행 높이 = max(좌 문항, 우 문항). 좌우 정렬 그리드의
 * 실제 행 높이를 그대로 합산해 availH 초과 안 하도록 R(행 수)을 정한다. SAFETY 8px.
 */
const COUNT_GAP = 12; // 슬롯/행 사이 간격 (BodyContainer distribute 와 동일)
const COUNT_SAFETY = 12; // 측정↔렌더 미세 오차 여유 (보수적)
function chunkByColumnCount(
  problems: ProblemReview[],
  heights: number[],
  perColumn: number,
  columns: 1 | 2,
  avail: { first: number; cont: number },
): PackedPage[] {
  const per = Math.max(1, perColumn);
  const pages: PackedPage[] = [];
  let i = 0;
  let startingNumber = 1;

  while (i < problems.length) {
    const availH = (pages.length === 0 ? avail.first : avail.cont) - COUNT_SAFETY;

    // 렌더는 *균등 N등분*(minmax(0,1fr)) + page body 에 바운드. 따라서 n 등분 시 각 칸
    // 높이 = (availH - (n-1)*gap)/n. 칸 넘침/겹침을 막으려면 *가장 큰 문항* 이 칸에
    // 들어가야 한다. n 을 1→per 로 키우며(칸이 점점 작아짐) 가장 큰 문항이 칸을 넘기
    // 직전까지가 최대 n. (count = 그 페이지 문항 수: 1단 n, 2단 2n.)
    const fits = (n: number, count: number): boolean => {
      const slotH = (availH - (n - 1) * COUNT_GAP) / n;
      let maxH = 0;
      for (let j = 0; j < count && i + j < problems.length; j++) {
        maxH = Math.max(maxH, heights[i + j] ?? 0);
      }
      return maxH <= slotH;
    };

    let pageProblems: ProblemReview[];
    let splitIndex: number;

    if (columns === 1) {
      let bestK = 1;
      for (let k = 1; k <= per && i + k <= problems.length; k++) {
        if (fits(k, k)) bestK = k;
        else break;
      }
      pageProblems = problems.slice(i, i + bestK);
      splitIndex = pageProblems.length;
      if (bestK === 1 && (heights[i] ?? 0) > availH)
        devWarnOversized(problems[i], heights[i] ?? 0, availH);
      i += pageProblems.length;
    } else {
      // 2단: 단일 문항이 한 페이지보다 크면 단독 배치(분할 불가).
      if ((heights[i] ?? 0) > availH) {
        pageProblems = [problems[i]];
        devWarnOversized(problems[i], heights[i] ?? 0, availH);
        splitIndex = 1;
        i++;
      } else {
        let bestR = 1;
        for (let R = 1; R <= per && i + R <= problems.length; R++) {
          if (fits(R, 2 * R)) bestR = R;
          else break;
        }
        const left = problems.slice(i, i + bestR);
        const right = problems.slice(i + bestR, i + 2 * bestR);
        pageProblems = [...left, ...right];
        splitIndex = left.length;
        i += left.length + right.length;
      }
    }

    pages.push({ problems: pageProblems, splitIndex, startingNumber });
    startingNumber += pageProblems.length;
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

  // count 모드 — 컬럼당 최대 perColumn 개 (높이 인지 — 안 들어가면 더 적게 → 넘침
  // 방지). 여백은 렌더가 균등 분배. 모든 템플릿 공통 (stretch1Col 보다 우선).
  if (options.layoutMode === "count") {
    return chunkByColumnCount(problems, heights, options.problemsPerColumn ?? 3, columns, avail);
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
