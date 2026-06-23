/**
 * Text-layer cross-check validator — born-digital PDF 의 *임베디드 텍스트*(ground
 * truth)와 OCR 조립 텍스트를 대조해 *명백한 누락/오인식* 을 검출 (CLAUDE.md §28-2,
 * 인식률 Tier 1 Step 3).
 *
 * **왜 born-digital 만**: 스캔 PDF 는 text-layer 가 비어 있어(`page.textLayer===""`)
 * 대조 대상이 없다. born-digital(PDF.js `getTextContent` 가 실제 텍스트 반환)일 때만
 * text-layer 가 *정답*이므로, OCR 이 한글 본문/숫자를 빠뜨리면 결정적으로 잡힌다.
 *
 * **비파괴 정책 (§18-5 solutionValidator 동일)**: 답/결과를 무효화하지 않고 *경고*
 * 로만 surfacing. 사용자가 보고 "페이지 재인식" 결정. D01(픽셀 전처리 없이 OCR)·엔진
 * 파이프라인에 영향 0 — 순수 사후 비교.
 *
 * **휴리스틱 — anchor 토큰 recall**: 수학 LaTeX/기호는 text-layer 추출 시 깨지므로
 * 직접 문자열 유사도는 무의미. 대신 *양쪽에서 안정적으로 전사되는* anchor 토큰만
 * 비교한다:
 *   - 한글 단어 (2자 이상) — 본문/발문/보기 한국어는 PDF·OCR 양쪽 일치도 높음.
 *   - 변별력 있는 정수 (3자리 이상, 예: 225·135·2024) — 한 자리 숫자는 노이즈라 제외.
 * text-layer anchor 중 OCR 텍스트에 *없는* 비율이 임계 초과면 누락 의심.
 *
 * **false positive 완화**: (1) anchor 수가 너무 적으면(<minAnchors) skip — 도형 위주
 * 페이지나 짧은 페이지에서 신호 부족. (2) 임계는 관대(기본 recall<0.6 일 때만 경고) —
 * 머리글/페이지번호 등 OCR 이 의도적으로 생략하는 토큰이 recall 을 낮추므로 보수적.
 */

export interface TextLayerWarning {
  rule: "text-layer-mismatch";
  /** 한 줄 — UI banner. */
  summary: string;
  /** 자세한 내용 — collapsible. */
  detail: string;
  /** anchor recall 0..1 (OCR 에서 발견된 text-layer anchor 비율). */
  score: number;
  /** 발견된 anchor 수. */
  matched: number;
  /** 전체 anchor 수. */
  total: number;
  /** OCR 에서 누락된 anchor 표본 (최대 sampleSize). */
  missingSample: string[];
}

export interface TextLayerValidateOptions {
  /** 이 수 미만의 anchor 면 신호 부족 → null. 기본 10. */
  minAnchors?: number;
  /** recall 이 이 값 미만이면 경고. 기본 0.6. */
  threshold?: number;
  /** detail 에 표시할 누락 표본 최대 개수. 기본 12. */
  sampleSize?: number;
}

const HANGUL_WORD_RE = /[가-힣]{2,}/g;
const LONG_NUMBER_RE = /\d{3,}/g;

/**
 * NFC 정규화 + 공백 제거. text-layer 는 PDF 줄바꿈/자간 때문에 공백이 불규칙하므로
 * 공백을 모두 제거한 단일 문자열로 비교(`includes`)하면 토큰 경계 노이즈를 회피한다.
 */
const normalizeForSearch = (s: string): string =>
  s.normalize("NFC").replace(/\s+/g, "");

/** text 에서 anchor 토큰(한글 2자+ / 정수 3자리+) 집합 추출. */
const extractAnchors = (text: string): Set<string> => {
  const norm = text.normalize("NFC");
  const out = new Set<string>();
  for (const m of norm.matchAll(HANGUL_WORD_RE)) out.add(m[0]);
  for (const m of norm.matchAll(LONG_NUMBER_RE)) out.add(m[0]);
  return out;
};

/**
 * born-digital text-layer 대비 OCR 텍스트의 anchor recall 검증.
 *
 * @param ocrText        OCR 결과 조립 텍스트 (본문/보기/정답 concat)
 * @param pdfTextLayer   `page.textLayer` (born-digital 이면 비어있지 않음)
 * @returns 의심되면 TextLayerWarning, 정상/신호부족이면 null
 */
export const validateOcrAgainstTextLayer = (
  ocrText: string,
  pdfTextLayer: string,
  opts: TextLayerValidateOptions = {},
): TextLayerWarning | null => {
  const minAnchors = opts.minAnchors ?? 10;
  const threshold = opts.threshold ?? 0.6;
  const sampleSize = opts.sampleSize ?? 12;

  const layer = (pdfTextLayer ?? "").trim();
  if (!layer || !ocrText) return null; // 스캔(텍스트 없음) 또는 OCR 빈 결과 → skip

  const anchors = extractAnchors(layer);
  if (anchors.size < minAnchors) return null; // 신호 부족

  const ocrHaystack = normalizeForSearch(ocrText);
  let matched = 0;
  const missing: string[] = [];
  for (const a of anchors) {
    if (ocrHaystack.includes(a)) matched += 1;
    else if (missing.length < sampleSize * 4) missing.push(a); // 표본 풀
  }

  const total = anchors.size;
  const score = total === 0 ? 1 : matched / total;
  if (score >= threshold) return null;

  // 가장 긴(=가장 변별력 있는) 누락 토큰 우선 표시.
  const missingSample = missing
    .sort((a, b) => b.length - a.length)
    .slice(0, sampleSize);

  const pct = Math.round(score * 100);
  return {
    rule: "text-layer-mismatch",
    summary: `OCR 가 PDF 원문과 ${pct}% 만 일치 — 본문 누락 의심 (검토 권장)`,
    detail:
      `이 페이지는 PDF 에 *원본 텍스트*(born-digital)가 있어 정답과 대조 가능합니다. ` +
      `PDF 원문의 핵심 토큰 ${total}개 중 ${matched}개만 OCR 결과에 있습니다(${pct}%). ` +
      `누락 의심 토큰: ${missingSample.map((t) => `"${t}"`).join(", ")}` +
      `${missing.length > missingSample.length ? " 등" : ""}. ` +
      `머리글/페이지번호 등 의도적 생략일 수도 있으나, 본문/보기가 빠졌다면 "페이지 재인식"을 권장합니다.`,
    score,
    matched,
    total,
    missingSample,
  };
};

/**
 * OCRProblem 류 아이템들에서 비교용 텍스트 조립 — 본문 + 보기 텍스트 + 정답.
 * 순수 함수 유지를 위해 최소 shape 만 받는다(타입 결합 회피).
 */
export const assembleOcrText = (
  items: ReadonlyArray<{
    text?: string;
    choices?: ReadonlyArray<{ text?: string } | string> | null;
    answer?: string;
  }>,
): string => {
  const parts: string[] = [];
  for (const it of items) {
    if (it.text) parts.push(it.text);
    if (Array.isArray(it.choices)) {
      for (const c of it.choices) {
        if (typeof c === "string") parts.push(c);
        else if (c && typeof c.text === "string") parts.push(c.text);
      }
    }
    if (it.answer) parts.push(it.answer);
  }
  return parts.join("\n");
};
