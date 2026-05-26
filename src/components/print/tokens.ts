// tokens.ts
// 인쇄 템플릿 공통 디자인 토큰. design_handoff/src/paperTokens.ts 그대로 포팅.
//
// 6 신규 template 이 모두 import. globals.css 에는 cssVariables 의 값을 *static*
// 으로 박았으므로 (`globals.css` 의 `:root { --paper-* ... }`), CSS variable 은
// 이 파일을 import 안 해도 사용 가능. 이 파일은 *TypeScript 코드* 쪽 (template
// 컴포넌트들이 직접 색상 hex 사용) 의 single source of truth.

export const PAPER_COLORS = {
  ink: "#0E0E10",
  ink90: "#1F1F23",
  ink70: "#3A3A40",
  ink50: "#6B6B72",
  ink30: "#A0A0A8",
  ink15: "#D4D4D8",
  ink08: "#E8E8EB",
  ink04: "#F4F4F6",
  paper: "#FFFFFF",
  paperWarm: "#FCFCF8", // 옅은 누런 종이 톤 (jaseup 만 사용)
  accentNavy: "#1B2A4E",  // modern
  accentRed: "#8B1A1A",   // workbook
  accentGold: "#A57F00",  // jaseup
  accentSlate: "#475569", // yuhyung
} as const;

export const PAPER_FONTS = {
  serifKR: '"KoPubBatang", "Nanum Myeongjo", "Noto Serif KR", "Batang", serif',
  sansKR: 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  mono: '"JetBrains Mono", "D2Coding", monospace',
} as const;

/** A4 96 dpi 사이즈. usePreviewScale 의 A4_WIDTH_PX/A4_HEIGHT_PX 와 정합. */
export const A4_DIM = {
  width: 794,
  height: 1123,
} as const;

/** 템플릿 별 기본 accent 색. PrintOptions.color 의 default 결정에 활용. */
export const TEMPLATE_DEFAULT_ACCENT = {
  pyeongga: PAPER_COLORS.ink,
  jeongtong: PAPER_COLORS.ink,
  modern: PAPER_COLORS.accentNavy,
  workbook: PAPER_COLORS.accentRed,
  jaseup: PAPER_COLORS.accentGold,
  yuhyung: PAPER_COLORS.accentSlate,
} as const;
