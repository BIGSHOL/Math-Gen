/**
 * JSON 복구 — testchange `core/ocr_engine.py` 의 `_extract_json` 다단 복구를 *그대로 이식*
 * (옵션 B 엔진 이전, D08).
 *
 * 비전 모델이 내는 JSON 은 LaTeX 역슬래시(`\frac`)·이스케이프 누락·후행 'Extra data'(중복
 * 객체)로 `JSON.parse` 가 자주 실패한다. testchange 와 동일한 5단계 복구로 되살린다.
 *
 * 출처(시험지변환기 core/ocr_engine.py):
 *   _extract_json(927-1009) · _loads_first(1011-1025, 첫-객체만 — 후행 버림) ·
 *   _fix_json_backslashes(1027-1036) · _repair_json_strings(1038-1112).
 *
 * **호출 정책**: `parseJsonOrThrow` 가 *직접 `JSON.parse` 먼저* 시도(clean 응답은 무변경),
 * 실패할 때만 `recoverJson` 진입 — 기존 caller(해설/변형) 동작 보존.
 */

/** 제어문자 sentinel (줄단위 복구의 일시 치환용 — PUA, §4-1 Edit 안전). */
const SENT = String.fromCharCode(57344); // U+E000

/** 제어문자 제거 (testchange _fix_json_backslashes/_repair_json_strings 공통 전처리). */
const stripControlChars = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

/**
 * ```json … ``` 펜스 제거 (닫는 펜스 없으면 끝까지). testchange _extract_json:940-947.
 * caller 가 이미 strip 해도 무해(멱등).
 */
const stripCodeFencesLocal = (s: string): string => {
  let t = (s ?? "").trim();
  const jsonIdx = t.indexOf("```json");
  if (jsonIdx !== -1) {
    const start = jsonIdx + 7;
    const end = t.indexOf("```", start);
    t = t.slice(start, end !== -1 ? end : t.length);
  } else {
    const idx = t.indexOf("```");
    if (idx !== -1) {
      const start = idx + 3;
      const end = t.indexOf("```", start);
      t = t.slice(start, end !== -1 ? end : t.length);
    }
  }
  return t.trim();
};

/**
 * `_loads_first` 포팅 — **첫 완결 `{...}` 객체만** 파싱하고 후행('Extra data')은 버린다.
 * JS 엔 `json.JSONDecoder().raw_decode` 가 없어, 문자열 리터럴 안의 `{`·`}` 를 무시하는
 * **중괄호 균형 스캔**으로 첫 최상위 객체 슬라이스를 찾아 `JSON.parse`. (경상여고 미적1 —
 * 저화질 스캔에서 크롭마다 후행 데이터 붙어 18개 중 7개 통째 누락되던 fix.)
 * 슬라이스가 여전히 깨졌으면 throw → 상위 복구 단계가 이어받음.
 */
const parseFirstObject = (s: string): unknown => {
  const str = s.replace(/^\s+/, "");
  if (str[0] !== "{") throw new SyntaxError("최상위 JSON 이 객체가 아님");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const obj = JSON.parse(str.slice(0, i + 1)) as unknown;
        if (typeof obj !== "object" || obj === null || Array.isArray(obj))
          throw new SyntaxError("최상위 JSON 이 객체가 아님");
        return obj;
      }
    }
  }
  throw new SyntaxError("완결된 JSON 객체 없음");
};

/** `_fix_json_backslashes` — 유효 이스케이프 아닌 `\X` 를 `\\X` 로(전체 텍스트). */
const fixJsonBackslashes = (text: string): string =>
  stripControlChars(text).replace(/\\(?!["\\/bfnrtu])/g, "\\\\");

/**
 * `_repair_json_strings` — 문자열 리터럴을 하나씩 스캔하며 내부 깨짐 복구:
 * 잘못된 이스케이프(`\frac`,`\{`) 이중화, `\uXXXX` 검증, 내부 따옴표·줄바꿈 이스케이프.
 */
const repairJsonStrings = (textIn: string): string => {
  const text = stripControlChars(textIn);
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      let j = i + 1;
      const parts: string[] = [];
      while (j < text.length) {
        const ch = text[j];
        if (ch === "\\" && j + 1 < text.length) {
          const nc = text[j + 1];
          if (nc === "u") {
            const hex = text.slice(j + 2, j + 6);
            if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
              parts.push("\\u", hex);
              j += 6;
            } else {
              parts.push("\\\\u"); // \underset 등 LaTeX → 이중 이스케이프
              j += 2;
            }
          } else if ('"\\/bfnrt'.includes(nc)) {
            parts.push(ch, nc);
            j += 2;
          } else {
            parts.push("\\\\", nc); // \frac, \{ 등 → 이중 이스케이프
            j += 2;
          }
          continue;
        }
        if (ch === '"') {
          // 진짜 문자열 끝인지 확인 (뒤에 구조 문자면 끝).
          let k = j + 1;
          while (k < text.length && " \t\r\n".includes(text[k])) k++;
          if (k >= text.length || ',}]:"'.includes(text[k])) break;
          parts.push('\\"'); // 내부 따옴표 이스케이프
          j += 1;
          continue;
        }
        if (ch === "\n") {
          parts.push("\\n");
          j += 1;
          continue;
        }
        if (ch === "\r") {
          j += 1;
          continue;
        }
        parts.push(ch);
        j += 1;
      }
      out.push('"', parts.join(""), '"');
      i = j + 1;
    } else {
      out.push(text[i]);
      i += 1;
    }
  }
  return out.join("");
};

/**
 * testchange `_extract_json` 5단계 복구. 성공 시 파싱 객체, 모두 실패 시 `undefined`.
 * (caller `parseJsonOrThrow` 가 undefined 면 기존 한국어 진단 에러를 throw.)
 */
export const recoverJson = (rawText: string): unknown | undefined => {
  // 1단계: 펜스 제거 + 첫 `{` + trailing comma 제거.
  let text = stripCodeFencesLocal(rawText ?? "");
  if (!text.startsWith("{")) {
    const b = text.indexOf("{");
    if (b !== -1) text = text.slice(b);
  }
  text = text.replace(/,\s*([}\]])/g, "$1");
  // 1.5단계: LaTeX-JSON 이스케이프 충돌 방지 (\f rac, \b eta 등 → 이중화).
  text = text.replace(/(?<!\\)\\([bfnrt])(?=[a-zA-Z])/g, "\\\\$1");

  // 2단계: 첫-객체 직접 파싱.
  try {
    return parseFirstObject(text);
  } catch {
    /* 다음 단계 */
  }
  // 3단계: 역슬래시 이스케이프 복구.
  try {
    return parseFirstObject(fixJsonBackslashes(text));
  } catch {
    /* 다음 단계 */
  }
  // 4단계: 문자열 보호 복구.
  const repaired = repairJsonStrings(text);
  try {
    return parseFirstObject(repaired);
  } catch {
    /* 다음 단계 */
  }
  // 5단계: 줄 단위 내부 따옴표 복구 (최후 수단).
  const lines = repaired.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*"[^"]+"\s*:\s*")(.*)("\s*,?\s*)$/.exec(lines[i]);
    if (m) {
      const inner = m[2]
        .replace(/\\"/g, SENT)
        .replace(/"/g, '\\"')
        .replace(new RegExp(SENT, "g"), '\\"');
      lines[i] = m[1] + inner + m[3];
    }
  }
  const text5 = lines.join("\n").replace(/,\s*([}\]])/g, "$1");
  try {
    return parseFirstObject(text5);
  } catch {
    return undefined;
  }
};
