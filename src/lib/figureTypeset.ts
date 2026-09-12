import { fetchWithAuth } from "../services/api/supabase.js";
import { SVG_NS, cleanFigureForSave } from "./figureSvgEditing.js";

const cache = new Map<string, string | null>();
const color = (value: string | null, fallback: string) => {
  if (/^#[0-9a-f]{6}$/i.test(value ?? "")) return value!;
  if (/^#[0-9a-f]{3}$/i.test(value ?? "")) return `#${value!.slice(1).split("").map(c => c + c).join("")}`;
  return value === "white" ? "#ffffff" : fallback;
};

/** 편집용 text와 출력용 MathJax path를 분리해 글자를 계속 수정할 수 있게 한다. */
export async function typesetFigureSvg(source: string, preserveObjectIds = false): Promise<string> {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const nodes = [...doc.querySelectorAll("text")].filter(n => !n.closest("defs,clipPath,mask,marker,pattern"));
  const entries = nodes.map(node => {
    const weight = node.getAttribute("font-weight") ?? "400";
    const halo = Number(node.getAttribute("stroke-width"));
    const entry = { text: node.getAttribute("data-mj") ?? node.textContent ?? "", x: Number(node.getAttribute("x") ?? 0), y: Number(node.getAttribute("y") ?? 0),
      size: Number(node.getAttribute("font-size") ?? 18), color: color(node.getAttribute("fill"), "#111111"),
      anchor: node.getAttribute("text-anchor") ?? "start", bold: weight === "bold" || Number(weight) >= 600,
      centerY: ["middle", "central"].includes(node.getAttribute("dominant-baseline") ?? ""),
      ...(halo > 0 && node.getAttribute("stroke") !== "none" ? { halo: { color: color(node.getAttribute("stroke"), "#ffffff"), width: halo } } : {}),
    };
    return { node, entry, key: JSON.stringify(entry) };
  });
  const missing = [...new Map(entries.filter(e => !cache.has(e.key)).map(e => [e.key, e])).values()];
  if (missing.length) {
    const response = await fetchWithAuth("/api/ai-figure-labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labels: missing.map(e => e.entry) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "도형 수식 조판에 실패했습니다.");
    if (!Array.isArray(result.labels) || result.labels.length !== missing.length || result.labels.some((s: unknown) => s !== null && typeof s !== "string")) throw new Error("도형 수식 조판 결과가 올바르지 않습니다.");
    if (cache.size + missing.length > 1000) cache.clear();
    missing.forEach((e, i) => cache.set(e.key, result.labels[i]));
  }
  for (const { node, key } of entries) {
    const fragment = cache.get(key); if (!fragment) continue;
    const wrapper = doc.createElementNS(SVG_NS, "g");
    const parsed = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${fragment}</svg>`, "image/svg+xml");
    for (const child of [...parsed.documentElement.childNodes]) wrapper.append(doc.importNode(child, true));
    if (node.hasAttribute("transform")) wrapper.setAttribute("transform", node.getAttribute("transform")!);
    if (preserveObjectIds && node.hasAttribute("data-object-id")) wrapper.setAttribute("data-object-id", node.getAttribute("data-object-id")!);
    node.replaceWith(wrapper);
  }
  const output = new XMLSerializer().serializeToString(doc.documentElement);
  return preserveObjectIds ? output : cleanFigureForSave(output);
}
