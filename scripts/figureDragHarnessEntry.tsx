import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { FigureEditor } from "../src/components/math/FigureEditor";
import { svgDataUrl } from "../src/services/ai/figurePipeline";
import type { OCRImage } from "../src/stores/wizardStore";

/** 요소 38개 그래프 — 축 2·곡선 1·눈금 16·눈금 숫자 12·축 이름 2·점 3·점 이름 2 (원장님 도형과 같은 규모). */
export function graphFigure(): string {
  const parts: string[] = [
    '<line x1="40" y1="300" x2="460" y2="300" stroke="#111111" stroke-width="1.5"/>',
    '<line x1="60" y1="330" x2="60" y2="20" stroke="#111111" stroke-width="1.5"/>',
    '<path d="M 60 290 Q 200 40 440 120" stroke="#111111" stroke-width="2" fill="none"/>',
  ];
  for (let i = 1; i <= 10; i++) parts.push(`<line x1="${60 + i * 38}" y1="296" x2="${60 + i * 38}" y2="304" stroke="#111111"/>`);
  for (let i = 1; i <= 6; i++) parts.push(`<line x1="56" y1="${300 - i * 42}" x2="64" y2="${300 - i * 42}" stroke="#111111"/>`);
  for (let i = 1; i <= 8; i++) parts.push(`<text x="${60 + i * 38}" y="320" font-size="14" text-anchor="middle" data-mj="$${i}$">${i}</text>`);
  for (let i = 1; i <= 4; i++) parts.push(`<text x="44" y="${304 - i * 42}" font-size="14" text-anchor="end" data-mj="$${i * 10}$">${i * 10}</text>`);
  parts.push('<text x="450" y="290" font-size="16" data-mj="$x(\\mathrm{sec})$">x(sec)</text>');
  parts.push('<text x="70" y="30" font-size="16" data-mj="$y(\\mathrm{m/sec})$">y(m/sec)</text>');
  for (const [x, y] of [[136, 180], [250, 110], [400, 125]]) parts.push(`<circle cx="${x}" cy="${y}" r="3" fill="#111111"/>`);
  parts.push('<text x="140" y="170" font-size="16" data-mj="$\\mathrm{A}$">A</text>');
  parts.push('<text x="254" y="100" font-size="16" data-mj="$\\mathrm{B}$">B</text>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">${parts.join("")}</svg>`;
}

const crop = (() => {
  const canvas = document.createElement("canvas"); canvas.width = 48; canvas.height = 36;
  const context = canvas.getContext("2d")!; context.fillStyle = "#ffffff"; context.fillRect(0, 0, 48, 36);
  return canvas.toDataURL("image/png");
})();

let root: Root | undefined;
let saved: OCRImage | undefined;
export const getSaved = () => saved;
export function mountDragHarness() {
  root?.unmount(); document.getElementById("drag-harness")?.remove();
  const host = document.createElement("div"); host.id = "drag-harness"; document.body.append(host);
  root = createRoot(host); saved = undefined;
  const svg = graphFigure();
  root.render(<React.StrictMode><FigureEditor index={0}
    image={{ box: [0, 0, 1000, 1000], label: "그래프", engineSvg: svg, dataUrl: svgDataUrl(svg), originalDataUrl: crop }}
    onSave={image => { saved = image; }} onClose={() => root?.render(<div>편집 완료</div>)} /></React.StrictMode>);
}
