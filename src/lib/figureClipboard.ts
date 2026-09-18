import { editableFigureDoc, prepareFigureSvg, serializeFigureSvg, SVG_NS } from "./figureSvgEditing";

export const FIGURE_CLIPBOARD_TYPE = "application/x-mathgen-figure";
const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");

/** 선택한 요소와 조상 변환·스타일·화살표 정의를 함께 보존한다. */
export function copyFigureSelection(svg: string, ids: string[]): string | null {
  if (!ids.length) return null;
  const doc = parse(svg), selected = new Set(ids);
  for (const node of doc.querySelectorAll("[data-object-id]")) {
    if (!selected.has(node.getAttribute("data-object-id")!)) node.remove();
  }
  if (!doc.querySelector("[data-object-id]")) return null;
  doc.documentElement.setAttribute("data-mathgen-clipboard", "1");
  return serializeFigureSvg(doc);
}

export function pasteFigureSelection(svg: string, source: string, offset = 12) {
  const doc = parse(svg), incoming = parse(prepareFigureSvg(source));
  const root = incoming.documentElement;
  const nodes = [...root.querySelectorAll("[data-object-id]")];
  if (!nodes.length) return null;
  // 반복 붙여넣기나 서로 다른 그림 사이에서도 marker/clipPath ID가 충돌하지 않게 한다.
  const prefix = `paste-${crypto.randomUUID()}-`, references = new Map<string, string>();
  for (const node of [root, ...root.querySelectorAll("[id]")]) {
    const id = node.getAttribute("id"); if (id) { references.set(id, prefix + id); node.setAttribute("id", prefix + id); }
  }
  for (const node of [root, ...root.querySelectorAll("*")]) {
    for (const attr of [...node.attributes]) {
      let value = attr.value.replace(/url\(\s*["']?#([^\s"')]+)["']?\s*\)/g, (full, id) => references.has(id) ? `url(#${references.get(id)})` : full);
      if (/href$/i.test(attr.name) && value.startsWith("#") && references.has(value.slice(1))) value = `#${references.get(value.slice(1))}`;
      if (value !== attr.value) node.setAttribute(attr.name, value);
    }
  }
  const ids = nodes.map(node => { const id = `obj-${crypto.randomUUID()}`; node.setAttribute("data-object-id", id); return id; });
  const translated = doc.createElementNS(SVG_NS, "g"); translated.setAttribute("transform", `translate(${offset} ${offset})`);
  const group = doc.createElementNS(SVG_NS, "g");
  for (const attr of [...root.attributes]) {
    if (!["xmlns", "xmlns:xlink", "viewBox", "width", "height", "x", "y", "data-mathgen-clipboard"].includes(attr.name)) group.setAttribute(attr.name, attr.value);
  }
  for (const child of [...root.childNodes]) group.append(doc.importNode(child, true));
  translated.append(group); doc.documentElement.append(translated);
  return { svg: serializeFigureSvg(doc), ids };
}

/** 여러 요소의 변경도 실행 취소 한 번으로 되돌릴 수 있도록 한 SVG로 만든다. */
export function transformFigureSelection(svg: string, updates: { id: string; transform: string }[]) {
  const doc = editableFigureDoc(svg), transforms = new Map(updates.map(item => [item.id, item.transform]));
  for (const node of doc.querySelectorAll("[data-object-id]")) {
    const value = transforms.get(node.getAttribute("data-object-id")!);
    if (value !== undefined) node.setAttribute("transform", value);
  }
  return serializeFigureSvg(doc);
}

export function removeFigureSelection(svg: string, ids: string[]) {
  const doc = parse(svg), selected = new Set(ids);
  for (const node of doc.querySelectorAll("[data-object-id]")) if (selected.has(node.getAttribute("data-object-id")!)) node.remove();
  return serializeFigureSvg(doc);
}
