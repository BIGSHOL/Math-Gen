/**
 * 도형 라벨을 **MathJax 로 조판**한다 — 글꼴 없이, 글자를 외곽선(`<path>`)으로.
 *
 * ## 왜 MathJax 인가 (원장님 확정 2026-08-28)
 *
 * RPM 원본 그림의 글꼴(`EHsang`·`EHhabu`)은 **Computer Modern 계열**이고, MathJax 의
 * 기본 TeX 글꼴이 바로 그 Computer Modern 이다. 같은 글(`125°`·`70°`·`5 cm`)을 세
 * 방식으로 그려 원본과 견주니 숫자 모양이 MathJax 에서 거의 같았다
 * (Cambria Math·Times 는 `2`·`5` 가 눈에 띄게 달랐다).
 *
 * 그리고 결정적으로 **글꼴 설치가 필요 없다.** 출력이 `<path>` 뿐이라(실측: `path 6 ·
 * use 0`) macOS·리눅스·어느 프린터·어느 래스터라이저에서도 같게 나온다. Cambria Math 는
 * Windows/Office 전용이라 이 성질이 없고, KaTeX 는 **SVG 출력 자체가 없어**
 * `<foreignObject>` 를 써야 하는데 그러면 인쇄가 깨진다.
 *
 * ## 재는 쪽과 그리는 쪽이 **한 곳**이다
 *
 * 파이썬 배치기는 라벨 상자를 알아야 자리를 잡는다. 그 폭을 따로 어림하면 조판과
 * 갈라진다 — 이 저장소가 여러 번 밟은 자리다(글자 폭을 0.61em 로 어림해 상자가
 * 두 배가 됐고, 라벨이 두 배 멀리 밀려났다). 그래서 **여기서 잰 값을 그대로**
 * 스펙에 실어 파이썬에 넘기고, 파이썬은 그 값으로만 배치한다.
 */
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

/** MathJax 내부 좌표: **1 em = 1000 단위**. */
const EM_UNITS = 1000;

export interface TypesetLabel {
  /** `<svg>` 안쪽 그대로 — 감싸서 붙이면 된다. 원점이 **글자 밑선 왼쪽**이다. */
  inner: string;
  /** 폭 ÷ 글자 크기. */
  widthEm: number;
  /** 밑선 위로 뻗은 높이 ÷ 글자 크기. */
  ascentEm: number;
  /** 밑선 아래로 뻗은 높이 ÷ 글자 크기. */
  descentEm: number;
}

/**
 * 한글·한자·가나가 한 글자라도 있으면 **조판하지 않는다.**
 *
 * MathJax 의 기본 TeX 글꼴에는 한글이 **없다.** 「바닐라」·「(개)」·「가」를 그대로
 * 먹이면 글자가 통째로 사라지거나 두부(□)가 된다 — 그리고 그건 **에러가 아니다.**
 * 조용히 빈 지면이 나간다. 실측으로 초등 라벨 1,929자리 중 527자리(27%)가 한글이다
 * (`scripts/qa/census-figure-labels.ts`). 그 자리는 엔진이 넣어 둔 `<text>` 로 남긴다.
 */
const CJK_RE = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯]/;

let adaptor: ReturnType<typeof liteAdaptor> | null = null;
let doc: ReturnType<typeof mathjax.document> | null = null;
const cache = new Map<string, TypesetLabel | null>();

function ensure(): void {
  if (doc) return;
  adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  doc = mathjax.document("", {
    InputJax: new TeX({ packages: AllPackages }),
    // `fontCache: "none"` — 글리프를 `<path>` 로 **바로** 넣는다. `"local"` 은 한 SVG
    // 안에서 `<use>` 로 공유해 작아지지만, 우리는 조각을 잘라 다른 SVG 에 옮겨 붙이므로
    // 참조가 깨진다. 크기보다 **옮겨도 성립하는 것**이 먼저다.
    OutputJax: new SVG({ fontCache: "none" }),
  });
}

/**
 * 라벨 글을 TeX 로 옮긴다.
 *
 * 라벨은 두 가지로 온다 — 이미 TeX 인 것(`$3x^\circ+5^\circ$`)과 **그냥 글**인 것
 * (`5 cm` · `70°`). 그냥 글을 TeX 수식으로 바로 먹이면 **낱말이 변수가 된다** —
 * `5 cm` 이 `5·c·m` 으로 읽혀 `cm` 이 기울어지고 사이가 붙는다(실측으로 그랬다).
 *
 * 그래서 글로 온 것은 옮겨 준다:
 *   · `°`        → `^\circ`
 *   · 낱말(영문 2자 이상) → `\mathrm{…}`   (단위·함수 이름은 정자체다)
 *   · 빈칸       → `\,`                    (수식의 가는 빈칸)
 * 홑 **소문자**(`x`·`a`·`l`)는 변수라 이탤릭 그대로 두고, 홑 **대문자**(`A`·`O`)는
 * **점 이름이라 정자체**로 돌린다 — 근거는 아래 주석에 실측으로 적었다.
 */
function toTex(label: string): string {
  let text = label.trim().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,
    digits => `^{${[...digits].map(d => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(d)).join("")}}`);
  // `$…$` 로 감싼 것은 **「이건 수식이다」는 뜻**이다 — 아래 «점 이름은 정자체»
  // 규칙을 걸지 않는다. 넓이 `S`·부피 `V` 처럼 홑 대문자를 **변수로** 쓰려면
  // 스펙에 `$S$` 라고 적으면 된다(손 예외 목록을 두지 않기 위한 탈출구).
  const wasMath =
    text.startsWith("$") && text.endsWith("$") && text.length >= 2;
  if (wasMath) {
    text = text.slice(1, -1);
  }
  if (/\\[a-zA-Z]/.test(text)) return text.replace(/°/g, "^\\circ ");
  // ⚠️ **낱말 → `\mathrm` 을 먼저** 하고 `°` 를 나중에 옮긴다. 순서를 바꾸면 방금
  //    넣은 `\circ` 의 `circ` 가 낱말로 잡혀 `\mathrm{circ}` 가 되고, 지면에
  //    `125^\mathrm{circ}` 같은 날 글자가 그대로 나간다(실측으로 그랬다).
  //
  // 🔴 **홑 대문자는 «점 이름»이라 정자체다.** TeX 기본은 홑 글자를 변수로 보고
  //    이탤릭으로 그리는데, 그러면 지면에서 **본문과 그림이 어긋난다** — 우리
  //    문항 본문은 이미 `$\mathrm{ABCD}$` 로 적는다(중2 닮음 한 파일에만 166곳).
  //    RPM 정본을 세어도 같다(`.rpm-src` 1-2 · 10~70쪽 · 그림 곁 낱글자 실측):
  //    `A`(정자체 145/153)·`B`·`C`·`D`·`O`(29/37) 가 **`EHsang-Plain`(정자체)**,
  //    소문자 `a`·`b`·`c`·`l`·`m`·`n`·`x`·`y` 는 **`EHsang-Italic`(이탤릭) 100%**.
  //    그래서 대문자만 정자체로 돌리고 소문자는 그대로 둔다.
  const romanized = wasMath
    ? text.replace(/[A-Za-z]{2,}/g, (word) => `\\mathrm{${word}}`)
    : text.replace(/[A-Za-z]{2,}|[A-Z]/g, (word) => `\\mathrm{${word}}`);
  return romanized.replace(/ +/g, "\\,").replace(/°/g, "^\\circ ");
}

/**
 * 라벨 하나를 조판한다. **못 하면 `null`** — 던지지 않는다.
 * 라벨은 사람이 쓴 글이라 언제든 TeX 로 안 읽힐 수 있고, 그때 그림 하나가
 * 통째로 죽으면 안 된다(부르는 쪽이 옛 `<text>` 로 물러선다).
 */
export function typesetLabel(label: string, bold = false): TypesetLabel | null {
  if (CJK_RE.test(label)) return null;
  if (label.length > 300) return null;
  const key = `${bold ? "1" : "0"}${label}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let result: TypesetLabel | null = null;
  try {
    ensure();
    const tex = bold ? `\\boldsymbol{${toTex(label)}}` : toTex(label);
    const node = doc!.convert(tex, { display: false });
    const outer = adaptor!.outerHTML(adaptor!.firstChild(node) as never);
    const box = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(outer);
    const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(outer);
    // ⚠️ **글리프를 못 찾으면 MathJax 는 에러를 내지 않는다.** `<text data-variant=…
    //    font-family="serif" transform="scale(1,-1)">` 로 **시스템 글꼴에 물러선다.**
    //    그런데 조각 안쪽은 y축이 뒤집힌 좌표계라 그 글자는 지면에 **거꾸로** 찍힌다
    //    (실측: 「ㄱ·ㄴ·ㄷ」 이 그렇게 나가고 있었다 — 에러도 경고도 없었다).
    //    그래서 「글자 요소가 남았나」로 **결과를 보고** 거른다. 위 `CJK_RE` 는 싸게
    //    거르는 앞단일 뿐이고, 목록에 없는 글자는 이 가드가 잡는다.
    if (inner && /<text\b/i.test(inner[1] ?? "")) {
      cache.set(key, null);
      return null;
    }
    if (box && inner) {
      const minY = Number(box[2]);
      const width = Number(box[3]);
      const height = Number(box[4]);
      result = {
        inner: inner[1]!,
        widthEm: width / EM_UNITS,
        ascentEm: -minY / EM_UNITS,
        descentEm: (height + minY) / EM_UNITS,
      };
    }
  } catch {
    result = null;
  }
  if (cache.size >= 1000) cache.clear();
  cache.set(key, result);
  return result;
}

/**
 * 조판한 라벨을 그림 좌표계에 얹는다.
 *
 * `x`·`y` 는 **글자 밑선의 가운데**다(파이썬이 그 자리를 준다). `halo` 를 주면
 * 흰 테두리를 먼저 칠해 **밑의 실선을 지운다** — 옛 `<text>` 의 `paint-order` 와
 * 같은 일이고, 없으면 라벨 위로 선이 지나간다.
 */
export type LabelAnchor = "start" | "middle" | "end";

export interface PlaceOptions {
  /** `text-anchor` 와 같은 뜻. 엔진마다 다르다(중등은 middle, 초등은 셋 다 쓴다). */
  anchor?: LabelAnchor;
  /**
   * `dominant-baseline="middle"` 이었나. 참이면 `y` 는 밑선이 아니라 **글자의
   * 세로 가운데**다 — 초등 엔진이 그렇게 부른다.
   */
  centerY?: boolean;
  /**
   * 이 이름표의 **임자 꼭짓점**(그림 좌표). 점 이름표에만 있다.
   * 없으면 판정기가 「가장 가까운 끝점」으로 임자를 추측해야 하고, 라벨이 두
   * 꼭짓점 사이에 앉으면 엉뚱한 쪽을 집는다(`figure_scene` 의 점 라벨 주석).
   */
  owner?: { x: number; y: number };
}

/**
 * 「글자 세로 가운데」의 기준 높이. `0` 을 한 번 조판해 **재서** 쓴다.
 *
 * 라벨마다 제 잉크로 가운데를 맞추면 `4` 와 `(개)` 가 다른 높이에 앉는다 —
 * SVG 의 `dominant-baseline="middle"` 은 글꼴 치수로 맞추므로 **밑선이 하나**다.
 * 그 성질을 지키려고 기준 글자 하나로 정한다(어림수를 박지 않는다).
 */
let refAscentEm: number | null = null;
function centerShiftEm(): number {
  if (refAscentEm === null) refAscentEm = typesetLabel("0")?.ascentEm ?? 0.5;
  return refAscentEm / 2;
}

export function placeLabel(
  laid: TypesetLabel,
  labelText: string,
  x: number,
  yIn: number,
  fontSize: number,
  color: string,
  halo?: { color: string; width: number },
  opts: PlaceOptions = {},
): string | null {
  const scale = fontSize / EM_UNITS;
  const width = laid.widthEm * fontSize;
  const anchor = opts.anchor ?? "middle";
  const left =
    anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  const y = opts.centerY ? yIn + centerShiftEm() * fontSize : yIn;
  // MathJax 조각 안의 `stroke/fill="currentColor" stroke-width="0"` 을 우리 칠로 바꾼다.
  // 그대로 두면 색이 상속되지 않고 `stroke-width="0"` 이 halo 를 눌러 버린다.
  const repaint = (paint: string) =>
    laid.inner.replace(
      /stroke="currentColor"\s+fill="currentColor"\s+stroke-width="0"/,
      paint,
    );
  const glyphs = repaint(`fill="${color}" stroke="none"`);
  if (!isSafeFragment(glyphs)) return null;

  // 🔴 **halo 는 글자 전체를 한 번 두르고, 그 위에 글자를 얹는다.**
  //
  //    종전에는 `paint-order="stroke"` 한 줄로 끝냈다. 그런데 `paint-order` 는
  //    **요소마다** 「테두리 → 채우기」다. 조판본은 **글자 하나가 `<path>` 하나**라
  //    앞 글자를 칠한 뒤 뒤 글자의 굵은 흰 테두리가 그 위를 덮는다 —
  //    실측으로 `7 cm` 이 지면에 **`7 ⟨ m`** 으로 나갔다(`c` 가 먹혔다.
  //    원장님 지적 2026-08-28). 옛 `<text>` 는 한 요소라 테두리를 통째로 한 번
  //    칠하고 글자를 통째로 얹으므로 이 일이 안 생겼다.
  //
  //    그래서 조각을 **두 벌** 낸다 — 아래는 테두리만(`fill="none"`), 위는 글자만.
  //    그러면 `<text>` 와 같은 순서가 되고 글자끼리 서로 지우지 않는다.
  let body = glyphs;
  if (halo) {
    const ring = repaint(
      `fill="none" stroke="${halo.color}" ` +
        `stroke-width="${(halo.width / scale).toFixed(1)}" ` +
        `stroke-linejoin="round" stroke-linecap="round"`,
    );
    if (!isSafeFragment(ring)) return null;
    body = ring + glyphs;
  }
  // ⚠️ **`data-label` 을 남긴다.** 조판하고 나면 SVG 에 글자가 한 톨도 안 남는다
  //    (전부 `<path>` 다). 그러면 시험도, 겹침 판정기도, 사람이 눈으로 grep 하는
  //    것도 **라벨을 찾을 길이 없다.** 원문을 여기 붙여 둔다.
  //
  // 치수도 같이 적는다 — 시험과 판정기가 라벨 상자를 **정확히** 알아야 「라벨이
  // 선을 밟나」를 잴 수 있다. 자식 `<path>` 들을 훑어 되짚게 하면 그건 또 하나의
  // 어림이 되고, 어림이 둘이면 갈라진다.
  //
  // ⚠️ `data-x`·`data-y`·`data-fs`·`data-anchor` 는 **엔진이 준 `<text>` 속성 그대로**다.
  //    조판 여부와 무관하게 같은 값을 읽을 수 있어야 두 경로(조판/그대로)를 한 자로 잰다.
  //    실제로 그린 밑선은 `data-base` 다 — `dominant-baseline="middle"` 이면 둘이 다르다.
  const f = (v: number) => v.toFixed(3);
  return (
    `<g data-label="${escapeAttr(labelText)}"` +
    // 닻은 조판하면서 `transform` 에 녹는다 — 그러면 「이 라벨이 왼쪽 정렬인가」를
    // 되물을 길이 없다. 축 이름표를 닻으로 가려내는 검사가 실제로 있으므로 남긴다.
    // halo 는 잉크를 더하지 않지만 **밑의 실선을 지운다** — 겹침 판정기가 그만큼
    // 상자를 넓혀 봐야 한다. 조각 안쪽 `stroke-width` 는 em 배율이 걸린 값이라
    // 되짚기 어렵다. **그림 좌표 그대로** 여기 적는다.
    ` data-anchor="${anchor}"${halo ? ` data-halo="${f(halo.width)}"` : ""}` +
    ` data-x="${f(x)}" data-y="${f(yIn)}" data-base="${f(y)}"` +
    (opts.owner
      ? ` data-px="${f(opts.owner.x)}" data-py="${f(opts.owner.y)}"`
      : "") +
    ` data-fs="${f(fontSize)}"` +
    ` data-w="${f(width)}"` +
    ` data-a="${f(laid.ascentEm * fontSize)}"` +
    ` data-d="${f(laid.descentEm * fontSize)}"` +
    ` transform="translate(${f(left)} ${f(y)}) scale(${scale.toFixed(6)})">` +
    `${body}</g>`
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * MathJax 가 낸 조각이 **그릴 것만** 담고 있는지 본다.
 *
 * 파이썬의 `sanitize_svg` 는 조판 **전에** 돈다 — 여기서 끼워 넣는 조각은 그 검사를
 * 지나지 않는다. MathJax 는 제 입력을 이스케이프하지만, 「믿을 만하다」에 기대지 않고
 * **직접 확인**한다. 통과 못 하면 부르는 쪽이 옛 `<text>` 를 그대로 둔다.
 */
export function isSafeFragment(fragment: string): boolean {
  if (/<\s*(script|foreignObject|style|image|a)\b/i.test(fragment))
    return false;
  if (/\son[a-z]+\s*=/i.test(fragment)) return false;
  if (/(href|xlink:href|src)\s*=/i.test(fragment)) return false;
  if (/(javascript:|data:text\/html|url\s*\()/i.test(fragment)) return false;
  // 남는 것은 그리기 요소뿐이어야 한다.
  for (const tag of fragment.matchAll(/<\s*\/?\s*([a-zA-Z:]+)/g)) {
    if (!SAFE_TAGS.has(tag[1]!.toLowerCase())) return false;
  }
  return true;
}

const SAFE_TAGS = new Set([
  "g",
  "path",
  "rect",
  "line",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "use",
  "defs",
  "title",
  "desc",
  "text",
  "tspan",
]);
