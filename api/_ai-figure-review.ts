import type { VercelRequest, VercelResponse } from "./_types.js";
import { requireAuth } from "./_jwt.js";
import { getGeminiClient, GEMINI_3_8_FLASH, geminiSampling } from "../src/services/ai/gemini.js";
import { parseDataUrl } from "../src/services/ai/sanitize.js";
import { parseJsonOrThrow } from "../src/services/ai/ocr.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!await requireAuth(req, res)) return;
  const { figureCrop, renderedImage, instructions, renderedSpec } = (req.body ?? {}) as { figureCrop?: unknown; renderedImage?: unknown; instructions?: unknown; renderedSpec?: unknown };
  for (const image of [figureCrop, renderedImage]) if (typeof image !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(image) || image.length > 5_500_000)
    return res.status(400).json({ error: "원본과 재작도 비교 이미지가 필요합니다." });
  try {
    const parts = [figureCrop, renderedImage].map(image => {
      const { data, mediaType } = parseDataUrl(image as string);
      return { inlineData: { data, mimeType: mediaType } };
    });
    const response = await getGeminiClient().models.generateContent({
      model: GEMINI_3_8_FLASH,
      contents: [{ role: "user", parts: [...parts, { text: `Compare image 1 (original scanned printed math figure) to image 2 (clean engine reconstruction). Check printed geometry/curve shape, number of objects, exact printed labels, arrowheads, solid vs dashed lines, angle marks, shading, and clipping or overlapping labels. IGNORE all student handwriting and pen/pencil annotations in image 1; their removal is required. Do NOT solve the question or correct printed values. Explicitly count/check straight non-axis segments, including faint chords and inscribed polygon edges. Before claiming a line is missing, zoom mentally into the region and check whether it closely overlaps a curve; overlapping but present segments are NOT missing. The actual deterministic renderer input below can corroborate endpoints, but the rendered image is authoritative for visibility. Small font/spacing differences are acceptable. User's requested intentional changes: ${String(instructions ?? "none").slice(0, 1500)}. Return JSON {"passed":boolean,"issues":["specific Korean correction instructions"]}. Fail only for clear actual mismatches, unreadable/clipped content, or copied handwriting. Report ALL mismatches together. Identify exact objects and corrections; maximum 6.\nRendered spec: ${JSON.stringify(renderedSpec ?? {}).slice(0, 65536)}` }] }],
      config: { ...geminiSampling(GEMINI_3_8_FLASH), responseMimeType: "application/json", maxOutputTokens: 3000 },
    });
    if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("도형 검증 응답이 잘렸습니다.");
    const result = parseJsonOrThrow<{ passed: boolean; issues: string[] }>(response.text ?? "");
    if (typeof result.passed !== "boolean" || !Array.isArray(result.issues) || result.issues.some(i => typeof i !== "string")) throw new Error("도형 검증 결과가 올바르지 않습니다.");
    return res.json({ passed: result.passed, issues: result.issues.slice(0, 6) });
  } catch (error) { return res.status(502).json({ error: (error as Error).message }); }
}
