// paperTokens.ts
// 인쇄 템플릿 공통 디자인 토큰.
// Tailwind config 의 theme.extend.colors 로 옮기는 것을 권장.

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

/** A4 96 dpi 사이즈 */
export const A4_DIM = {
  width: 794,
  height: 1123,
} as const;

/** 템플릿 별 기본 accent 색. */
export const TEMPLATE_DEFAULT_ACCENT = {
  pyeongga: PAPER_COLORS.ink,
  jeongtong: PAPER_COLORS.ink,
  modern: PAPER_COLORS.accentNavy,
  workbook: PAPER_COLORS.accentRed,
  jaseup: PAPER_COLORS.accentGold,
  yuhyung: PAPER_COLORS.accentSlate,
} as const;

/** Tailwind 와 호환되도록 CSS 변수로 export. global.css 에서 import. */
export const cssVariables = `
:root {
  --paper-ink: ${PAPER_COLORS.ink};
  --paper-ink90: ${PAPER_COLORS.ink90};
  --paper-ink70: ${PAPER_COLORS.ink70};
  --paper-ink50: ${PAPER_COLORS.ink50};
  --paper-ink30: ${PAPER_COLORS.ink30};
  --paper-ink15: ${PAPER_COLORS.ink15};
  --paper-ink08: ${PAPER_COLORS.ink08};
  --paper-ink04: ${PAPER_COLORS.ink04};
  --paper-bg: ${PAPER_COLORS.paper};
  --paper-warm: ${PAPER_COLORS.paperWarm};
  --paper-accent-navy: ${PAPER_COLORS.accentNavy};
  --paper-accent-red: ${PAPER_COLORS.accentRed};
  --paper-accent-gold: ${PAPER_COLORS.accentGold};
  --paper-accent-slate: ${PAPER_COLORS.accentSlate};
  --paper-font-serif: ${PAPER_FONTS.serifKR};
  --paper-font-sans: ${PAPER_FONTS.sansKR};
  --paper-font-mono: ${PAPER_FONTS.mono};
}
`;
