import type { VercelRequest, VercelResponse } from "./_types.js";
import { requireAuth } from "./_jwt.js";
import { getGeminiClient, GEMINI_3_8_FLASH, geminiSampling } from "../src/services/ai/gemini.js";
import { parseDataUrl } from "../src/services/ai/sanitize.js";
import { parseJsonOrThrow } from "../src/services/ai/ocr.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!await requireAuth(req, res)) return;
  const dataUrl = (req.body as { questionCrop?: unknown } | undefined)?.questionCrop;
  if (typeof dataUrl !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl) || dataUrl.length > 5_500_000)
    return res.status(400).json({ error: "문제 크롭 이미지가 필요합니다." });
  try {
    const { data, mediaType } = parseDataUrl(dataUrl);
    const response = await getGeminiClient().models.generateContent({
      model: GEMINI_3_8_FLASH,
      contents: [{ role: "user", parts: [
        { inlineData: { data, mimeType: mediaType } },
        { text: `This image is ONE already-cropped Korean math question. Locate ONLY the printed figures INSIDE it, including figures in answer choices. Return JSON {"figures":[{"box":[yMin,xMin,yMax,xMax],"label":"short Korean description","kind":"diagram"}]}.
Coordinates are 0–1000 relative to THIS QUESTION CROP. Include all attached vertex/axis/dimension labels and arrowheads with small padding. Exclude the question number, prose, answer-choice markers, equations outside the drawing, and handwriting. Never return the entire question as a figure. One connected drawing = one box; separate drawings = separate boxes, in reading order (top to bottom, left to right within a row). kind="diagram" for geometry/graphs/number lines; "artwork" for photos/paintings; "table" for bordered data grids. A typeset equation alone is NOT a figure. If there are no figures, return {"figures":[]}. Do not redraw, solve, or transcribe the question.` },
      ] }],
      config: { ...geminiSampling(GEMINI_3_8_FLASH), responseMimeType: "application/json", maxOutputTokens: 4096 },
    });
    if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("그림 위치 검출 응답이 토큰 한도로 잘렸습니다.");
    const parsed = parseJsonOrThrow<{ figures?: unknown[] }>(response.text ?? "");
    if (!Array.isArray(parsed.figures) || parsed.figures.length > 12) throw new Error("그림 위치 검출 결과가 올바르지 않습니다.");
    return res.status(200).json({ figures: parsed.figures, model: GEMINI_3_8_FLASH });
  } catch (err) { return res.status(502).json({ error: (err as Error).message }); }
}
