// printFontPacks.ts
// 인쇄 6 신규 template 의 *폰트 팩* — sans/serif 한 쌍으로 묶음.
//
// 사용자가 PrintOptionsPanel 에서 5 팩 중 하나 선택 → wizardStore.printOptions
// .fontPack 에 저장 → Step5Export 의 PageBody root 가 CSS variable
// (`--paper-font-serif` / `--paper-font-sans`) 동적 set → 각 template 의 inline
// `fontFamily: var(--paper-font-*)` 가 자동 반영.
//
// **웹 폰트 로딩**: index.html 의 link 태그가 preload all (Nanum + Noto +
// Gowun). Pretendard 는 이미 별도 link. KoPub 은 별도 호스팅 부재로 미포함
// (필요 시 src/styles/globals.css 의 @font-face 로 self-host).

export type FontPackId =
  | "system" // 시스템 fallback only (네트워크 0)
  | "nanum" // 나눔 (네이버 무료)
  | "noto" // 노토 (Google 무료)
  | "gowun" // 고운 (Google 무료, 부드러운)
  | "pretendard"; // Pretendard sans + 나눔명조 serif (현대적 모던)

export interface FontPack {
  id: FontPackId;
  label: string;
  /** UI 옵션 옆 작은 설명. */
  hint: string;
  /** 본문 / 헤더 등 serif 폰트 family stack. CSS variable 로 주입. */
  serif: string;
  /** 헤더 등 sans 폰트 family stack. */
  sans: string;
  /**
   * HWP 내보내기용 글꼴면(face) 이름 — header.xml fontfaces 의 바탕/돋움 계열을 이 이름으로
   * 치환(엔진 _apply_body_font). 빈 문자열이면 엔진 무변경(함초롬 유지). CSS family stack 과
   * 달리 *단일 글꼴명* 이어야 하고, 문서를 여는 PC 에 설치돼 있어야 시각 반영(미설치 시 HWP
   * fallback). serif=바탕 계열, sans=돋움 계열.
   */
  hwpSerif: string;
  hwpSans: string;
}

export const FONT_PACKS: FontPack[] = [
  {
    id: "system",
    label: "시스템",
    hint: "기본 (빠름)",
    // generic(serif/sans-serif) 앞에 Noto KR fallback — 서버 PDF(serverless Chromium)는 Batang/
    // Malgun 등 시스템 한글 폰트가 없어 한글이 깨지던 것(§45 Phase 2). Noto 는 index.html 이 이미
    // preload 하므로 웹에선 Batang 우선(시스템 폰트 있으면 그대로) → 무해. PDF 에선 Noto 로 렌더.
    serif: '"Batang", "BatangChe", "Noto Serif KR", serif',
    sans: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
    // system = HWP 무변경(함초롬 유지) → 빈값으로 엔진 no-op.
    hwpSerif: "",
    hwpSans: "",
  },
  {
    id: "nanum",
    label: "나눔",
    hint: "네이버 무료",
    serif: '"Nanum Myeongjo", "Batang", serif',
    sans: '"Nanum Gothic", "Malgun Gothic", sans-serif',
    hwpSerif: "나눔명조",
    hwpSans: "나눔고딕",
  },
  {
    id: "noto",
    label: "노토",
    hint: "Google 무료",
    serif: '"Noto Serif KR", "Batang", serif',
    sans: '"Noto Sans KR", "Malgun Gothic", sans-serif',
    hwpSerif: "Noto Serif KR",
    hwpSans: "Noto Sans KR",
  },
  {
    id: "gowun",
    label: "고운",
    hint: "부드러운 modern",
    serif: '"Gowun Batang", "Batang", serif',
    sans: '"Gowun Dodum", "Malgun Gothic", sans-serif',
    hwpSerif: "고운바탕",
    hwpSans: "고운돋움",
  },
  {
    id: "pretendard",
    label: "Pretendard",
    hint: "Pretendard + 나눔명조",
    serif: '"Nanum Myeongjo", "Batang", serif',
    sans: 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    hwpSerif: "나눔명조",
    hwpSans: "Pretendard",
  },
];

export const DEFAULT_FONT_PACK: FontPackId = "system";

export function getFontPack(id: FontPackId | undefined): FontPack {
  return FONT_PACKS.find((p) => p.id === id) ?? FONT_PACKS[0];
}
