// printGeometry.ts
// 인쇄 6 템플릿의 레이아웃 geometry *단일 소스*. 측정 기반 페이지네이션
// (usePrintLayout / printPack) 이 *측정 컬럼 폭* 과 *문항 간 gap* 을 계산하고,
// 각 템플릿이 BodyContainer 에 넘길 gap / ProblemBody fontSize 를 정할 때 모두
// 여기서 가져온다. 한 곳만 고치면 측정과 렌더가 자동 동기화 (CLAUDE.md §16-3
// byte-identical 단일 source 패턴의 레이아웃 버전).
//
// 값 출처: 각 *Template.tsx 의 outer padding / BodyContainer gap·columnGap /
// ProblemBody fontSize 를 그대로 추출. 템플릿 디자인 변경 시 여기도 갱신할 것.

import type { PrintTemplate } from "@app/components/print/types";
import { A4_DIM } from "@app/components/print/tokens";

export interface TemplateGeometry {
  /** 본문 영역 좌/우 패딩 (px, 한쪽). 컬럼 컨텐츠 폭 = A4_DIM.width - 2*padX. */
  padX: number;
  /** ProblemBody fontSize — 1단 / 2단. workbook/jaseup/yuhyung 은 2단에서 축소. */
  fontSize1: number;
  fontSize2: number;
  /** 문항 간 세로 gap (BodyContainer flex gap) — 1단 / 2단. */
  gap1: number;
  gap2: number;
  /** 2단 컬럼 사이 gap. BodyContainer 기본 26. */
  columnGap: number;
  /**
   * 1단에서 카드가 flex:1 로 페이지를 꽉 채우는 템플릿 (workbook/jaseup 풀이공간).
   * 이 경우 문항 자연 높이가 의미 없으므로 *개수 기반* 으로 페이지당 perPageOneCol
   * 개씩 패킹 (printPack 의 chunkByCount).
   */
  stretch1Col?: boolean;
  perPageOneCol?: number;
}

export const TEMPLATE_GEOMETRY: Record<PrintTemplate, TemplateGeometry> = {
  pyeongga:  { padX: 56, fontSize1: 13.2, fontSize2: 13.2, gap1: 16, gap2: 16, columnGap: 26 },
  jeongtong: { padX: 50, fontSize1: 13.5, fontSize2: 13.5, gap1: 18, gap2: 18, columnGap: 26 },
  modern:    { padX: 56, fontSize1: 13.5, fontSize2: 13.5, gap1: 16, gap2: 16, columnGap: 32 },
  workbook:  { padX: 44, fontSize1: 12.5, fontSize2: 11.5, gap1: 12, gap2: 14, columnGap: 26, stretch1Col: true, perPageOneCol: 4 },
  jaseup:    { padX: 50, fontSize1: 12.5, fontSize2: 11.5, gap1: 12, gap2: 16, columnGap: 26, stretch1Col: true, perPageOneCol: 4 },
  yuhyung:   { padX: 44, fontSize1: 12.5, fontSize2: 11.5, gap1: 14, gap2: 16, columnGap: 22 },
};

/**
 * 한 컬럼의 컨텐츠 폭 (px). *측정 컨테이너 폭* 과 *실제 렌더 컬럼 폭* 에 동일
 * 적용해야 측정==렌더가 성립. 2단은 BodyContainer 의 "1fr 1px 1fr" 그리드 기준
 * (1px rule 무시 — 오차 1px).
 */
export function columnContentWidth(template: PrintTemplate, columns: 1 | 2): number {
  const g = TEMPLATE_GEOMETRY[template];
  const bodyWidth = A4_DIM.width - 2 * g.padX;
  if (columns === 1) return bodyWidth;
  return (bodyWidth - g.columnGap) / 2;
}

/** ProblemBody / BodyContainer style 에 쓸 본문 fontSize. */
export function bodyFontSize(template: PrintTemplate, columns: 1 | 2): number {
  const g = TEMPLATE_GEOMETRY[template];
  return columns === 1 ? g.fontSize1 : g.fontSize2;
}

/**
 * 문항 간 *기본* gap. PrintOptions.spacing 은 호출측 (템플릿 + printPack) 에서
 * 동일하게 더한다 → flex gap 과 패킹 계산이 같은 값을 공유.
 */
export function itemGap(template: PrintTemplate, columns: 1 | 2): number {
  const g = TEMPLATE_GEOMETRY[template];
  return columns === 1 ? g.gap1 : g.gap2;
}
