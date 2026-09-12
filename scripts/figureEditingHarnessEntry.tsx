import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Step1_5CropInspect } from "../src/components/wizard/Step1_5CropInspect";
import { OCRItem } from "../src/components/wizard/OCRItem";
import { useWizardStore } from "../src/stores/wizardStore";
import { putPageImage, putThumbnail } from "../src/lib/imageStore";
import { svgDataUrl } from "../src/services/ai/figurePipeline";
import { FigureEditor } from "../src/components/math/FigureEditor";
export { useWizardStore } from "../src/stores/wizardStore";

let root: Root | undefined;
let savedSvg: string | undefined;
export const getSavedFigure = () => savedSvg;
export function mountDirectFigure(source: string) {
  root?.unmount(); document.getElementById("editing-harness")?.remove();
  const host = document.createElement("div"); host.id = "editing-harness"; document.body.append(host);
  root = createRoot(host); savedSvg = undefined;
  root.render(<React.StrictMode><FigureEditor index={0} image={{ box: [0, 0, 1000, 1000], label: "도형", engineSvg: source, dataUrl: svgDataUrl(source) }}
    onSave={image => { savedSvg = image.engineSvg; }} onClose={() => root?.render(<div>편집 완료</div>)} /></React.StrictMode>);
}
export async function mountEditingHarness(mode: "crop" | "ocr") {
  root?.unmount();
  document.getElementById("editing-harness")?.remove();
  const host = document.createElement("div"); host.id = "editing-harness";
  host.style.cssText = "position:fixed;inset:0;z-index:40;background:white;overflow:auto";
  document.body.append(host);
  const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 700;
  const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, 800, 700);
  context.fillStyle = "black"; context.font = "22px serif"; context.fillText("1. Compare the two triangles.", 65, 70);
  for (const x of [120, 440]) { context.beginPath(); context.moveTo(x, 160); context.lineTo(x, 340); context.lineTo(x + 180, 340); context.closePath(); context.stroke(); context.fillText("A", x, 150); }
  context.fillText("2. Find x when 2x + 3 = 11.", 65, 540);
  const image = canvas.toDataURL();
  const imageRef = await putPageImage({ pageNum: 1, dataUrl: image });
  const thumbRef = await putThumbnail({ pageNum: 1, dataUrl: image });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 250" width="300" height="250"><path d="M40 40L40 210L250 210Z" stroke="#111111" stroke-width="2" fill="none"/><text x="30" y="30" font-size="18">A</text><text x="28" y="234" font-size="18">B</text></svg>';
  const item = { id: "qa-question", number: 1, text: "삼각형의 넓이를 구하시오.\n\n[그림1]", status: "ok" as const, reviewed: false,
    images: [{ box: [180, 100, 510, 400] as [number, number, number, number], label: "삼각형", source: "ai-crop" as const, engineSvg: svg, dataUrl: svgDataUrl(svg), originalDataUrl: image }] };
  useWizardStore.setState({ step: mode === "crop" ? 1 : 2, activePageIndex: 0, pages: [{
    id: "qa-page", imageRef, thumbRef, textLayer: "", isProblemPage: true, rotation: 0, ocrComplete: true, ocrResult: [item],
    cropBoxes: [{ id: "question-1", class: "problem", number: 1, bbox: [40, 50, 620, 950], verified: false, source: "ai" },
      { id: "question-2", class: "problem", number: 2, bbox: [700, 50, 850, 950], verified: false, source: "ai" }],
  }] });
  function OcrHarness() { const item = useWizardStore(s => s.pages[0].ocrResult[0]); return <div style={{ padding: 24 }}><OCRItem pageId="qa-page" item={item} pageImageDataUrl={image} /></div>; }
  root = createRoot(host);
  root.render(<React.StrictMode>{mode === "crop" ? <Step1_5CropInspect /> : <OcrHarness />}</React.StrictMode>);
}
