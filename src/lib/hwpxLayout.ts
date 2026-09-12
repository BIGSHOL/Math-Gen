/** The print DOM is the single layout source for PDF, print and HWPX. */
export interface HwpxObject {
  type: "text" | "equation" | "image" | "rect";
  x: number; y: number; w: number; h: number;
  text?: string; latex?: string; imageId?: string;
  color?: string; font?: string; fontSize?: number; letterSpacing?: number; bold?: boolean; italic?: boolean; underline?: boolean;
}
export interface HwpxPage { objects: HwpxObject[] }
const color = (value: string) => {
  const rgba = value.match(/[\d.]+/g)?.map(Number);
  return rgba && rgba.length >= 3 && (rgba[3] ?? 1) > 0 ? "#" + rgba.slice(0, 3).map(n => Math.round(n * (rgba[3] ?? 1) + 255 * (1 - (rgba[3] ?? 1))).toString(16).padStart(2, "0")).join("") : undefined;
};
const fontName = (value: string) => value.split(",")[0].trim().replace(/["']/g, "");
async function png(element: HTMLImageElement | SVGSVGElement, width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(width * 3); canvas.height = Math.ceil(height * 3);
  const context = canvas.getContext("2d")!;
  const img = new Image(); img.crossOrigin = "anonymous";
  let url: string | undefined;
  if (element instanceof SVGSVGElement) {
    const clone = element.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("width", String(width)); clone.setAttribute("height", String(height));
    clone.style.color = getComputedStyle(element).color;
    url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" })); img.src = url;
  } else img.src = element.currentSrc || element.src;
  try { await img.decode(); context.drawImage(img, 0, 0, canvas.width, canvas.height); return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("그림 변환에 실패했습니다.")), "image/png")); }
  finally { if (url) URL.revokeObjectURL(url); }
}

export async function collectHwpxLayout(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.cssText += ";display:block!important;position:fixed;left:-100000px;top:0;width:210mm;transform:none;pointer-events:none;";
  clone.setAttribute("aria-hidden", "true"); document.body.append(clone);
  const assets: Record<string, Blob> = {}, pages: HwpxPage[] = [];
  try {
    await document.fonts.ready;
    await Promise.all([...clone.querySelectorAll("img")].map(img => img.decode().catch(() => { throw new Error("불러오지 못한 그림이 있습니다. 그림을 확인한 뒤 다시 내보내 주세요."); })));
    const pageNodes = [...clone.querySelectorAll<HTMLElement>('[data-print-page="true"]')];
    if (!pageNodes.length) throw new Error("미리보기 페이지를 찾을 수 없습니다.");
    for (const page of pageNodes) {
      const pageRect = page.getBoundingClientRect(), decorations: HwpxObject[] = [], contents: HwpxObject[] = [];
      const box = (rect: DOMRect) => ({ x: rect.x - pageRect.x, y: rect.y - pageRect.y, w: rect.width, h: rect.height });
      const styleFor = (el: Element) => { const s = getComputedStyle(el); return { font: fontName(s.fontFamily), fontSize: parseFloat(s.fontSize), letterSpacing: parseFloat(s.letterSpacing) || 0, color: color(s.color) ?? "#111111", bold: parseInt(s.fontWeight) >= 600, italic: s.fontStyle === "italic", underline: s.textDecorationLine.includes("underline") || !!el.closest("u") }; };
      const visible = (el: Element) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0" && el.getBoundingClientRect().width > 0; };
      for (const el of [page, ...page.querySelectorAll<HTMLElement>("*")]) {
        if (!visible(el) || el.closest(".katex, svg")) continue;
        const rect = el.getBoundingClientRect(), s = getComputedStyle(el), background = color(s.backgroundColor);
        if (background && el !== page) decorations.push({ type: "rect", ...box(rect), color: background });
        if (s.backgroundImage.includes("linear-gradient")) {
          const gridInk = color(s.backgroundImage.match(/rgba?\([^)]+\)/)?.[0] ?? "rgba(14,14,16,.08)")!;
          const sizes = s.backgroundSize.match(/[\d.]+/g)?.map(Number) ?? [24, 24], bounds = box(rect);
          const stepX = sizes[0] || 24, stepY = sizes[1] || 24;
          for (let y = s.backgroundImage.includes("90deg") ? 0 : stepY - 1; y < bounds.h; y += stepY) decorations.push({ type: "rect", x: bounds.x, y: bounds.y + y, w: bounds.w, h: .7, color: gridInk });
          if (s.backgroundImage.includes("90deg")) for (let x = 0; x < bounds.w; x += stepX) decorations.push({ type: "rect", x: bounds.x + x, y: bounds.y, w: .7, h: bounds.h, color: gridInk });
        }
        for (const side of ["Top", "Bottom", "Left", "Right"] as const) {
          const thickness = parseFloat(s[`border${side}Width`]), ink = color(s[`border${side}Color`]);
          if (!thickness || !ink || s[`border${side}Style`] === "none") continue;
          const bounds = box(rect);
          if (side === "Top" || side === "Bottom") { if (side === "Bottom") bounds.y += bounds.h - thickness; bounds.h = thickness; }
          else { if (side === "Right") bounds.x += bounds.w - thickness; bounds.w = thickness; }
          const borderStyle = s[`border${side}Style`];
          if (borderStyle === "dashed" || borderStyle === "dotted") {
            const horizontal = side === "Top" || side === "Bottom", length = horizontal ? bounds.w : bounds.h;
            const dash = thickness * (borderStyle === "dotted" ? 1 : 3);
            for (let pos = 0; pos < length; pos += dash * 2) decorations.push({ type: "rect", ...bounds, ...(horizontal ? { x: bounds.x + pos, w: Math.min(dash, length - pos) } : { y: bounds.y + pos, h: Math.min(dash, length - pos) }), color: ink });
          } else decorations.push({ type: "rect", ...bounds, color: ink });
        }
      }
      for (const el of page.querySelectorAll<HTMLElement | SVGSVGElement>(".katex, img, svg")) {
        if (!visible(el)) continue;
        if (el.parentElement?.closest(".katex, svg")) continue;
        const rect = el.getBoundingClientRect();
        if (el.classList.contains("katex")) {
          const encoded = el.getAttribute("data-export-tex");
          const latex = encoded ? decodeURIComponent(encoded) : el.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
          if (!latex) throw new Error("원본 식을 찾지 못한 수식이 있습니다.");
          contents.push({ type: "equation", ...box(rect), ...styleFor(el), latex });
        } else {
          const imageId = `image${Object.keys(assets).length + 1}`;
          assets[`BinData/${imageId}.png`] = await png(el as HTMLImageElement | SVGSVGElement, rect.width, rect.height);
          contents.push({ type: "image", ...box(rect), imageId });
        }
      }
      const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement!, text = node.textContent ?? "";
        if (!text.trim() || parent.closest(".katex, svg, style, script") || !visible(parent)) continue;
        const range = document.createRange(), style = styleFor(parent);
        let start = -1, end = 0, lineTop = 0;
        const flush = () => {
          if (start < 0) return;
          range.setStart(node!, start); range.setEnd(node!, end);
          const rect = range.getBoundingClientRect(), value = text.slice(start, end).replace(/\s+/g, " ");
          if (value.trim() && rect.width > 0) contents.push({ type: "text", ...box(rect), ...style, text: value });
          start = -1;
        };
        let offset = 0;
        for (const char of text) {
          range.setStart(node, offset); range.setEnd(node, offset + char.length);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0) {
            if (start >= 0 && Math.abs(rect.y - lineTop) > 2) flush();
            if (start < 0) { start = offset; lineTop = rect.y; }
            end = offset + char.length;
          }
          offset += char.length;
        }
        flush();
      }
      pages.push({ objects: [...decorations, ...contents] });
    }
    return { pages, assets };
  } finally { clone.remove(); }
}
