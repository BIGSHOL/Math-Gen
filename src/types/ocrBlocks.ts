/**
 * OCR typed-block 모델 — 시험지변환기(testchange) `models/exam_document.py` 의
 * ContentBlock / Choice 를 TS 로 미러한 것.
 *
 * **배경 (옵션 B — 네이티브 typed-block OCR)**: Math-Gen OCR 이 한 문항을
 * markdown `text` 단일 문자열로 내면, HWP 커넥터(adapter.py)가 그 markdown 을
 * 다시 typed-block 으로 *재분해*한다 (lossy). 특히 "본문 속 맨숫자(30개)"는
 * markdown 사후 분해로는 equation 으로 되살릴 수 없어 testchange HWP 와 어긋난다.
 *
 * → OCR 이 처음부터 testchange 와 동일한 typed-block(`contents`/`choices`)을 내고,
 *   HWP 는 그 블록을 *그대로* 커넥터에 보낸다. 블록이 정전(canonical), markdown
 *   `text` 는 `blocksToMarkdown` 로 *파생*해 기존 렌더·해설·변형·인쇄가 무변경으로
 *   동작한다.
 *
 * **figure 정책**: testchange 는 `figure`/`image` 도 블록 타입이지만, Math-Gen 은
 * 도형을 본문 inline `<svg>` 또는 `[그림N]` 마커 + `images`/`figures`/`diagramParams`
 * 배열로 별도 관리한다(웹 렌더 품질 때문). 그래서 *블록 타입은 텍스트 계열만*
 * — 도형은 `text` 블록 안의 `<svg>`/`[그림N]` 으로 위치 보존한다.
 *
 * **박스 정책**: 보기/조건/상자 박스는 testchange 처럼 `text` 블록 value 의
 * 머리 prefix `<보기>`/`<조건>`/`<상자>` 로 표현한다(별 필드 X). 커넥터(content_parser)
 * 가 이 라벨을 테두리 박스로 렌더하고, 웹은 `blocksToMarkdown` 가 blockquote(`> `)로
 * 변환해 동일하게 박스 렌더한다.
 */

/** 렌더 가능한 블록 타입 — testchange ContentType 중 도형(image)을 제외한 텍스트 계열. */
export type BlockType = "text" | "equation" | "equation_block" | "table";

/** 본문/보기를 구성하는 개별 typed 블록 (testchange ContentBlock 미러). */
export interface ContentBlock {
  /** 블록 종류. */
  type: BlockType;
  /**
   * 블록 내용.
   *  - text: 한국어 텍스트(머리 `<보기>`/`<조건>`/`<상자>` 라벨·`[그림N]`·inline `<svg>`·`__강조__` 포함 가능)
   *  - equation: 인라인 수식 LaTeX (`$` 없이 순수 LaTeX)
   *  - equation_block: 독립행 수식 LaTeX
   *  - table: 보통 "" (셀은 `rows` 에)
   */
  value: string;
  /** table 전용 2D 셀 배열. 비-table 블록은 빈 배열(`[]`) sentinel. */
  rows: string[][];
}

/** 객관식 보기 하나 (testchange Choice 미러). */
export interface ChoiceGroup {
  /** 보기 번호 1~5 (①②③④⑤ → 1,2,3,4,5). */
  number: number;
  /** 보기 내용 블록들. */
  contents: ContentBlock[];
}
