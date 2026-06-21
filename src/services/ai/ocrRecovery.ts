/**
 * 2-pass 누락 복구 — testchange `core/ocr_engine.py` 의 복구 로직을 *그대로 이식*
 * (옵션 B 엔진 이전).
 *
 * 단일 문제 크롭을 구조화(JSON) OCR 하면 비전 모델이 **긴 지문 박스·표를 "요약"하며
 * 통째 누락**한다(testchange 검증). 같은 모델이 "그대로 전사" 작업에선 충실히 읽으므로,
 * 별도 *전사(transcribe) 호출* 결과로 누락분을 찾아 끼워넣는다.
 *
 * 출처(시험지변환기 core/ocr_engine.py 라인):
 *   _norm_match(31) · _SUBMARKER_RE(38) · _is_recoverable_prose(43) ·
 *   _merge_missing_passages(65) · _TABLE_HINT_RE(142) · _question_text_blob(148) ·
 *   _has_table_block(172) · _parse_markdown_table(191) · _recover_table(860) ·
 *   _transcribe(909 프롬프트) · _transcribe_table(890 프롬프트).
 *
 * 이 모듈은 *순수 로직*만 — API 전사 호출은 ocr.ts `transcribeImage` 가 담당하고
 * 결과 문자열을 여기 함수들에 넘긴다.
 */

/** 전사 프롬프트 (testchange `_transcribe`, ocr_engine.py:914-919 그대로). */
export const TRANSCRIBE_PROMPT =
  "이 이미지에 **인쇄된 모든 문장**을 위에서 아래로 **한 글자도 빠짐없이 그대로** " +
  "옮겨적으세요. 요약·생략·해석 절대 금지. 손글씨(연필·볼펜 필기)는 무시. " +
  "특히 **테두리(네모) 박스 안 본문**도 전부. 순수 텍스트로만 출력(설명·JSON 없이). " +
  "문단(빈 줄로 구분되는 덩어리)은 그대로 줄바꿈으로 유지하세요.";

/** 표 전사 프롬프트 (testchange `_transcribe_table`, ocr_engine.py:896-901 그대로). */
export const TRANSCRIBE_TABLE_PROMPT =
  "이 이미지 안의 **표(격자/그리드)**를 마크다운 표로 정확히 옮겨적으세요. " +
  "모든 행·열·헤더(합계 포함)를 한 칸도 빠짐없이. 표 안의 수식은 LaTeX 로. " +
  "표가 여러 개면 가장 큰 표 하나만. **표가 전혀 없으면 빈 문자열만 출력하세요.** " +
  "요약·해석·설명 절대 금지. 마크다운 표(| … | … |)만 출력.";

/** raw OCR item (정규화 전 — extractPageProblems 의 parsed.items). 느슨 타입. */
interface RawBlockLike {
  type?: unknown;
  value?: unknown;
  rows?: unknown;
}
interface RawItemLike {
  contents?: unknown;
  choices?: unknown;
  subQuestions?: unknown;
}

const blockValue = (b: unknown): string =>
  b && typeof b === "object" && typeof (b as RawBlockLike).value === "string"
    ? ((b as RawBlockLike).value as string)
    : "";

const itemContents = (item: RawItemLike): RawBlockLike[] =>
  Array.isArray(item.contents) ? (item.contents as RawBlockLike[]) : [];

/**
 * `_norm_match` — 매칭용 정규화: 공백·문장부호·기호 제거(전사↔구조화 비교용).
 *
 * ⚠ Python 의 `[\s\W_]` 제거는 결국 *유니코드 letter/digit 만* 남긴다 — Python3 의
 * `\W` 는 한글을 word 로 보기 때문(한글은 안 지워짐). JS 의 `\W` 는 한글을 non-word 로
 * 봐 지워버리므로 등가가 아니다. `\p{L}\p{N}` 외 전부 제거로 Python 동작을 재현한다.
 */
const normMatch = (s: string): string =>
  (s || "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

/**
 * `_SUBMARKER_RE` — 조건/소문항 마커로 시작하는 문단(복구 제외: 구조화·소문항·표가 이미 처리).
 * Python 의 끝 `\b`(보기 뒤)는 JS 유니코드에서 동작이 달라 제거 — 대괄호 마커로 충분히 특정된다.
 */
const SUBMARKER_RE =
  /^\s*(?:\(\s*[가나다라마바0-9]+\s*\)|[①-⑮㉠-㉭ⓐ-ⓩ]|[ㄱ-ㅎ]\s*[.)]|\[\s*(?:서술형|서답형|조건|보기))/u;

/** `_is_recoverable_prose` — 복구 대상 = '진짜 통째 누락된 긴 한글 지문'만. */
const isRecoverableProse = (p: string): boolean => {
  const s = (p || "").trim();
  if (!s) return false;
  if (s.includes("|") || s.includes("---")) return false; // 마크다운 표
  if (SUBMARKER_RE.test(s)) return false; // 조건/소문항
  const compact = s.replace(/\s+/g, "");
  const hangul = (compact.match(/[가-힣]/g) || []).length;
  if (!compact || hangul / compact.length < 0.55) return false; // 수식·기호 위주
  return true;
};

/**
 * `_merge_missing_passages` — 전사엔 있으나 구조화 결과에 빠진 지문 박스를 *원위치*에
 * 끼워넣는다(in-place). 단일 서술형 크롭 가정(items[0]). 12자 윈도우 6자 간격 매칭으로
 * "있음/없음" 판정 — 전부 없을 때만(진짜 통째 누락) `<상자>` 블록으로 주입.
 */
export const mergeMissingPassages = (
  items: RawItemLike[],
  transcription: string,
): void => {
  if (!items.length || !transcription.trim()) return;
  let paras = transcription
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length <= 1) {
    paras = transcription
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  if (!paras.length) return;
  const q = items[0];
  const contents = itemContents(q);
  if (!contents.length) return;
  const structNorm = normMatch(contents.map(blockValue).join(""));
  if (!structNorm) return;

  const WIN = 12;
  const STRIDE = 6;
  const windows = function* (pn: string): Generator<string> {
    if (pn.length <= WIN) {
      yield pn;
      return;
    }
    for (let k = 0; k <= pn.length - WIN; k += STRIDE) yield pn.slice(k, k + WIN);
  };
  const presentIn = (pn: string, haystack: string): boolean => {
    const hn = normMatch(haystack);
    if (!hn) return false;
    for (const w of windows(pn)) if (w && hn.includes(w)) return true;
    return false;
  };
  const present = (pn: string): boolean => {
    for (const w of windows(pn)) if (w && structNorm.includes(w)) return true;
    return false;
  };

  let ci = 0; // 현재 구조화 블록 인덱스
  let insertAt = 0; // 누락 문단 삽입 위치
  for (const p of paras) {
    const pn = normMatch(p);
    if (pn.length < 8) continue;
    if (present(pn)) {
      // 이 문단을 담은 블록(들)을 소비해 포인터 전진.
      let covered = "";
      while (ci < contents.length && !presentIn(pn, covered)) {
        covered += blockValue(contents[ci]);
        ci += 1;
      }
      insertAt = ci;
    } else if (pn.length >= 20 && isRecoverableProse(p)) {
      // 구조화가 빠뜨린 긴 한글 지문만 라벨 없는 박스(<상자>)로 원위치 삽입.
      const hasMark = /^\s*(<\s*(조건|보기|상자)\s*>|\[\s*(조건|보기)\s*\])/.test(p);
      const label = hasMark ? "" : "<상자> ";
      contents.splice(insertAt, 0, { type: "text", value: label + p, rows: [] });
      ci = insertAt + 1;
      insertAt = ci;
    }
  }
};

/** `_TABLE_HINT_RE` — 표 지시어(있으면 표 복구 후보). */
const TABLE_HINT_RE =
  /표로\s*나타내면|표로\s*나타낸|확률\s*분포를\s*표|확률분포표|정규\s*분포표|표준정규분포표|도수분포표|아래\s*표|다음\s*표|위\s*표|다음과\s*같은\s*표|P\s*\(\s*X\s*=\s*x\s*\)|P\s*\(\s*Z|z의\s*값|Z의\s*값|확률변수\s*X의\s*확률분포/;

/** `_question_text_blob` — 본문 + 보기 + 소문항 텍스트를 한 덩어리로(표 지시어 탐지용). */
const questionTextBlob = (items: RawItemLike[]): string => {
  const parts: string[] = [];
  for (const q of items) {
    for (const c of itemContents(q)) parts.push(blockValue(c));
    const choices = Array.isArray(q.choices) ? q.choices : [];
    for (const ch of choices as Array<{ contents?: unknown }>) {
      const cc = Array.isArray(ch?.contents) ? (ch.contents as RawBlockLike[]) : [];
      for (const c of cc) parts.push(blockValue(c));
    }
    const subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
    for (const sub of subs as Array<{ contents?: unknown }>) {
      const sc = Array.isArray(sub?.contents) ? (sub.contents as RawBlockLike[]) : [];
      for (const c of sc) parts.push(blockValue(c));
    }
  }
  return parts.join(" ");
};

/** `_has_table_block` — 결과 어디든 type==='table' 블록이 하나라도 있으면 true. */
const hasTableBlock = (items: RawItemLike[]): boolean => {
  const scan = (blocks: unknown): boolean =>
    Array.isArray(blocks) &&
    blocks.some(
      (b) => b && typeof b === "object" && (b as RawBlockLike).type === "table",
    );
  for (const q of items) {
    if (scan(q.contents)) return true;
    const subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
    for (const sub of subs as Array<{ contents?: unknown }>)
      if (scan(sub?.contents)) return true;
  }
  return false;
};

/** `_parse_markdown_table` — 마크다운 표 → 2D rows. 구분선(---) 행 버림, 1행 이하면 빈 배열. */
export const parseMarkdownTable = (md: string): string[][] => {
  if (!md || !md.trim()) return [];
  const rows: string[][] = [];
  for (const rawLine of md.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || !line.includes("|")) continue;
    if (line.startsWith("|")) line = line.slice(1);
    if (line.endsWith("|")) line = line.slice(0, -1);
    const cells = line.split("|").map((c) => c.trim());
    // 구분선 행(--- 또는 :---:) 제거
    if (
      cells.length &&
      cells.every((c) => /^:?-{2,}:?$/.test(c || "-") || c === "") &&
      cells.some((c) => c.includes("-"))
    ) {
      continue;
    }
    rows.push(cells);
  }
  const kept = rows.filter((r) => r.some((c) => c));
  if (kept.length < 2) return [];
  return kept;
};

/** 서술형(보기 없음) 결과인지 — 지문 복구 게이트. 한 문항이라도 보기 있으면 객관식. */
export const isEssayResult = (items: RawItemLike[]): boolean =>
  !items.some((q) => Array.isArray(q.choices) && (q.choices as unknown[]).length > 0);

/** `_recover_table` 게이트 — 표 지시어 있고 table 블록이 아직 없으면 복구 대상. */
export const tableRecoveryNeeded = (items: RawItemLike[]): boolean => {
  if (!items.length || !items[0] || typeof items[0] !== "object") return false;
  if (hasTableBlock(items)) return false;
  return TABLE_HINT_RE.test(questionTextBlob(items));
};

/** 전사로 복구한 표 rows 를 items[0].contents 끝(발문 뒤)에 append (in-place). */
export const recoverTableInto = (items: RawItemLike[], rows: string[][]): void => {
  if (!rows.length || !items.length) return;
  const q = items[0];
  let contents = q.contents;
  if (!Array.isArray(contents)) {
    contents = [];
    (q as { contents?: unknown }).contents = contents;
  }
  (contents as RawBlockLike[]).push({ type: "table", value: "", rows });
};

export type { RawItemLike };
