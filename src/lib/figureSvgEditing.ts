export const SVG_NS = "http://www.w3.org/2000/svg";
const SHAPES = "path,line,polyline,polygon,circle,ellipse,rect,text";
const ALLOWED = new Set("svg g defs clipPath mask marker pattern linearGradient radialGradient stop path line polyline polygon circle ellipse rect text tspan title desc use".split(" "));
const parse = (svg: string) => {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") throw new Error("도형 SVG를 읽을 수 없습니다.");
  return doc;
};
export const serializeFigureSvg = (doc: Document) => new XMLSerializer().serializeToString(doc.documentElement);

export function prepareFigureSvg(source?: string) {
  const doc = parse(source || `<svg xmlns="${SVG_NS}" viewBox="0 0 480 360" width="480" height="360"></svg>`);
  for (const node of [doc.documentElement, ...doc.querySelectorAll("*")]) {
    if (!ALLOWED.has(node.localName)) { node.remove(); continue; }
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || (/href$/i.test(attr.name) && !attr.value.startsWith("#"))
        || (!attr.name.startsWith("xmlns") && /(?:javascript:|data:|https?:|@import)/i.test(attr.value))
        || (/url\(/i.test(attr.value) && !/^url\(\s*["']?#[\w-]+["']?\s*\)$/i.test(attr.value))) node.removeAttribute(attr.name);
    }
  }
  let index = 0;
  for (const node of doc.querySelectorAll(SHAPES)) {
    if (!node.closest("defs,clipPath,mask,marker,pattern")) {
      node.setAttribute("data-object-id", `obj-${index++}`);
      if (node.localName === "text") {
        const text = node as SVGElement;
        for (const [property, fallback] of [["font-style", "normal"], ["font-family", "Times New Roman, serif"], ["stroke", "none"], ["stroke-width", "0"]]) {
          if (!text.style.getPropertyValue(property)) text.style.setProperty(property, text.getAttribute(property) ?? fallback);
        }
      }
    }
  }
  return serializeFigureSvg(doc);
}

export function figureObjects(svg: string) {
  return [...parse(svg).querySelectorAll("[data-object-id]")].map(el => ({
    id: el.getAttribute("data-object-id")!, type: el.localName, text: el.textContent ?? "",
    attrs: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
  }));
}

export function editFigureObject(svg: string, id: string, attrs: Record<string, string>, text?: string) {
  const doc = parse(svg);
  const el = [...doc.querySelectorAll("[data-object-id]")].find(n => n.getAttribute("data-object-id") === id);
  if (!el) return svg;
  for (const [key, value] of Object.entries(attrs)) {
    value === "" ? el.removeAttribute(key) : el.setAttribute(key, value);
    const styled = el as SVGElement;
    if (styled.style.getPropertyValue(key)) value === "" ? styled.style.removeProperty(key) : styled.style.setProperty(key, value);
  }
  if (text !== undefined && el.localName === "text") { el.textContent = text; el.setAttribute("data-mj", text); }
  return serializeFigureSvg(doc);
}

export function removeFigureObject(svg: string, id: string) {
  const doc = parse(svg);
  [...doc.querySelectorAll("[data-object-id]")].find(n => n.getAttribute("data-object-id") === id)?.remove();
  return serializeFigureSvg(doc);
}

export function addFigureObject(svg: string, type: string, from: { x: number; y: number }, to: { x: number; y: number }, label = "A") {
  const doc = parse(svg);
  const tag = type === "arrow" ? "line" : type === "curve" ? "path" : type;
  const el = doc.createElementNS(SVG_NS, tag);
  const id = `obj-${crypto.randomUUID()}`;
  const set = (attrs: Record<string, string | number>) => Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  set({ "data-object-id": id, stroke: "#111111", "stroke-width": 1.8, fill: "none" });
  if (type === "line" || type === "arrow") set({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  if (type === "arrow") {
    const defs = doc.createElementNS(SVG_NS, "defs");
    const marker = doc.createElementNS(SVG_NS, "marker");
    Object.entries({ id: `${id}-arrow`, viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse" }).forEach(([key, value]) => marker.setAttribute(key, value));
    const path = doc.createElementNS(SVG_NS, "path"); path.setAttribute("d", "M0 0L10 5L0 10Z"); path.setAttribute("fill", "#111111"); marker.append(path); defs.append(marker); doc.documentElement.append(defs);
    set({ "marker-end": `url(#${id}-arrow)` });
  }
  if (type === "rect") set({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.max(1, Math.abs(to.x - from.x)), height: Math.max(1, Math.abs(to.y - from.y)) });
  if (type === "circle") set({ cx: from.x, cy: from.y, r: Math.max(1, Math.hypot(to.x - from.x, to.y - from.y)) });
  if (type === "curve") set({ d: `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - Math.abs(to.x - from.x) / 2} ${to.x} ${to.y}` });
  if (type === "text") { set({ x: from.x, y: from.y, fill: "#111111", stroke: "none", "font-size": 18, "font-style": "normal", "font-family": "Times New Roman, serif" }); el.textContent = label; }
  doc.documentElement.append(el);
  return { svg: serializeFigureSvg(doc), id };
}

export function cleanFigureForSave(svg: string) {
  const doc = parse(prepareFigureSvg(svg));
  for (const node of doc.querySelectorAll("[data-object-id]")) node.removeAttribute("data-object-id");
  return serializeFigureSvg(doc);
}

/** 실제 글꼴 메트릭으로 라벨까지 측정해 바깥 여백을 확보한다. */
export function fitFigureViewport(svg: string) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none";
  host.innerHTML = cleanFigureForSave(svg);
  document.body.append(host);
  try {
    const root = host.querySelector("svg")!;
    const bounds = root.getBBox();
    if (!bounds.width || !bounds.height) return svg;
    const pad = Math.max(10, Math.max(bounds.width, bounds.height) * 0.04);
    root.setAttribute("viewBox", `${bounds.x - pad} ${bounds.y - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`);
    root.setAttribute("width", String(bounds.width + pad * 2)); root.setAttribute("height", String(bounds.height + pad * 2));
    return new XMLSerializer().serializeToString(root);
  } finally { host.remove(); }
}
