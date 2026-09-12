/**
 * 엔진이 낸 SVG 의 `<text data-mj="…">` 자리를 **MathJax 조각**으로 바꿔 끼운다.
 *
 * ## 왜 두 단계인가
 *
 * 배치(어느 자리에 놓을지)는 파이썬 엔진이 한다 — 도형 전체를 보고 정해야 하는 일이다.
 * 조판(어떤 모양으로 그릴지)은 MathJax 가 한다 — 그쪽이 훨씬 잘한다.
 * 그 둘을 잇는 것이 이 파일이다:
 *
 *   ① `labelMetrics()` — 스펙 안의 라벨을 모두 찾아 MathJax 로 **재서** 엔진에 넘긴다.
 *      엔진은 그 치수로 자리를 잡는다. **재는 쪽과 그리는 쪽이 같은 값**을 쓴다.
 *   ② `substituteLabels()` — 엔진이 돌려준 `<text data-mj="원문">` 을 그 자리·크기로
 *      조판한 조각으로 바꾼다.
 *
 * ⚠️ 못 바꾼 라벨은 **그대로 남는다** — 엔진이 넣어 둔 `<text>` 가 보이므로 지면이
 *    비지 않는다. 다만 그 «못 바꿈»은 **두 부류**이고 섞으면 안 된다:
 *      · `kept`       — 한글·㎠·④ 처럼 TeX 글꼴에 글리프가 **없는** 글. 정상이다.
 *      · `unresolved` — 자리를 못 읽었거나 조각이 안전 검사에 걸렸다. **결함이다.**
 *    한 통에 담으면 한글이 많은 초등 지면에서 진짜 결함이 통계 뒤에 묻힌다.
 */
import { placeLabel, typesetLabel } from "./mathjaxLabel.js";

/** `<text …>` 를 통째로 잡는다. 엔진이 내는 형태만 상대한다(속성 순서가 고정이다). */
const TEXT_RE = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1]! : null;
}

/** `&quot;` 처럼 이스케이프된 것을 원문으로 되돌린다. */
function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** 스펙 어디에 있든 라벨 글을 모두 모은다 — 손 목록을 두지 않는다. */
export function collectLabels(
  spec: unknown,
  into = new Set<string>(),
): Set<string> {
  if (!spec || typeof spec !== "object") return into;
  for (const [key, value] of Object.entries(spec as Record<string, unknown>)) {
    if (typeof value === "string") {
      if (key === "label" || key === "text") into.add(value);
    } else if (value && typeof value === "object") {
      collectLabels(value, into);
    }
  }
  // `labels: { A: "A" }` 처럼 **값 자체가 글**인 형태도 있다.
  const labels = (spec as Record<string, unknown>).labels;
  if (labels && typeof labels === "object" && !Array.isArray(labels)) {
    for (const value of Object.values(labels as Record<string, unknown>)) {
      if (typeof value === "string") into.add(value);
    }
  }
  return into;
}

/**
 * 스펙의 라벨을 MathJax 로 재서 `label_metrics` 를 붙인 **새 스펙**을 낸다.
 * 원본은 건드리지 않는다.
 */
export function withLabelMetrics(spec: unknown): unknown {
  if (!spec || typeof spec !== "object") return spec;
  // ⚠️ **치수는 FigureSpec v2 에만 싣는다.** 초등 그림(`kind` 기반)은 `elementary.py`
  //    라는 다른 렌더러가 그리고, 그쪽 스펙 검사는 `label_metrics` 를 모르는 키로 보고
  //    **던진다**(실측: 통계 kind 15건이 그렇게 빨개졌다).
  //
  //    ⓘ 초등 라벨도 **조판은 된다** — 표식은 정제기(`add_mj_marks`)가 붙이고 아래
  //      `substituteLabels()` 가 바꿔 낀다. 여기서 안 싣는 것은 «자리를 잡을 때 쓸
  //      치수»뿐이다. 초등은 제 자를 쓰는데(`_label_w_max`) 그것이 **상한**이라
  //      MathJax 조판본이 그보다 좁다 — 넘치지 않으므로 안전하다(실측 `6 cm`
  //      상한 2.46em vs 조판 1.66em). 정확히 맞추려면 `elementary.py` 가
  //      `label_metrics` 를 받게 해야 하고, 그건 스펙 검사부터 손대는 일이다.
  if ((spec as Record<string, unknown>).version !== 2) return spec;
  const metrics: Record<string, [number, number, number]> = {};
  for (const label of collectLabels(spec)) {
    const laid = typesetLabel(label);
    if (laid) metrics[label] = [laid.widthEm, laid.ascentEm, laid.descentEm];
  }
  if (Object.keys(metrics).length === 0) return spec;
  return { ...(spec as Record<string, unknown>), label_metrics: metrics };
}

export interface SubstituteResult {
  svg: string;
  /** 조판으로 바꾼 라벨 수. */
  replaced: number;
  /**
   * **일부러** 엔진 `<text>` 로 남긴 라벨들 — 한글처럼 TeX 글꼴에 글리프가 없는 글.
   * 결함이 아니다. 초등 라벨의 27%가 여기다(실측).
   */
  kept: string[];
  /**
   * **뜻밖에** 못 바꾼 라벨들 — 자리(x·y·크기)를 못 읽었거나 조각이 안전 검사에
   * 걸렸다. 이건 결함이므로 시끄럽게 알린다. 「조판할 수 없는 글」과 한 통에 담으면
   * 한글이 많은 지면에서 진짜 결함이 **통계 뒤에 묻힌다.**
   */
  unresolved: string[];
}

/** 엔진 SVG 의 라벨을 MathJax 조각으로 바꾼다. */
export function substituteLabels(svg: string): SubstituteResult {
  const unresolved: string[] = [];
  const kept: string[] = [];
  let replaced = 0;
  const out = svg.replace(TEXT_RE, (whole, tag: string) => {
    const raw = attr(tag, "data-mj");
    if (raw === null) return whole;
    const label = unescapeXml(raw);
    const x = Number(attr(tag, "x"));
    const y = Number(attr(tag, "y"));
    const fs = Number(attr(tag, "font-size"));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fs)) {
      unresolved.push(label);
      return whole;
    }
    // 굵기·닻·세로 기준은 **엔진마다 다르다** — 중등은 middle/밑선/보통 굵기지만
    // 초등은 `text-anchor` 셋을 다 쓰고 `dominant-baseline="middle"` 에 `700` 이다.
    // 그 값을 여기서 읽어 그대로 옮긴다. 한쪽 엔진의 습관을 상수로 박으면 다른
    // 엔진의 라벨이 조용히 어긋난 자리에 앉는다.
    const weight = Number(attr(tag, "font-weight") ?? "400");
    const bold = Number.isFinite(weight) && weight >= 600;
    const laid = typesetLabel(label, bold) ?? typesetLabel(label, false);
    if (!laid) {
      // 조판할 수 없는 글(한글·㎠·④…). 엔진 `<text>` 가 그대로 나간다 — 정상이다.
      kept.push(label);
      return whole;
    }
    const color = attr(tag, "fill") ?? "#111111";
    const haloColor = attr(tag, "stroke");
    const haloWidth = Number(attr(tag, "stroke-width"));
    const halo =
      haloColor && Number.isFinite(haloWidth) && haloWidth > 0
        ? { color: haloColor, width: haloWidth }
        : undefined;
    const rawAnchor = attr(tag, "text-anchor");
    const anchor =
      rawAnchor === "start" || rawAnchor === "end" ? rawAnchor : "middle";
    // `middle` 과 `central` 둘 다 「세로 가운데」다 — 초등 엔진이 자리마다 다르게 쓴다
    // (`_cell_center_text` 는 central, 좌표평면 라벨은 middle). 한쪽만 보면 나머지
    // 라벨이 밑선 기준으로 앉아 **한 줄 아래로 내려간다.**
    const baseline = attr(tag, "dominant-baseline");
    // 「이 이름표의 임자 꼭짓점」 — 엔진이 적어 준다. 조판하면 `<text>` 가 통째로
    // 사라지므로 여기서 옮기지 않으면 그 정보가 없어지고, 판정기는 다시 임자를
    // **추측**하게 된다(`figure_scene` 의 점 라벨 주석 참조).
    const px = Number(attr(tag, "data-px"));
    const py = Number(attr(tag, "data-py"));
    const piece = placeLabel(laid, label, x, y, fs, color, halo, {
      anchor,
      centerY: baseline === "middle" || baseline === "central",
      owner:
        Number.isFinite(px) && Number.isFinite(py)
          ? { x: px, y: py }
          : undefined,
    });
    if (piece === null) {
      unresolved.push(label);
      return whole;
    }
    replaced += 1;
    return piece;
  });
  return { svg: out, replaced, kept, unresolved };
}
