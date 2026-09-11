import type { VercelRequest, VercelResponse } from "./_types.js";
import { requireAuth } from "./_jwt.js";
import { anthropic } from "../src/services/ai/client.js";
import { parseDataUrl } from "../src/services/ai/sanitize.js";
import { parseJsonOrThrow } from "../src/services/ai/ocr.js";
import catalog from "../scripts/figure/engine-catalog.json" with { type: "json" };
import { logAiUsage } from "./_logUsage.js";
import { normalizeAnthropicUsage } from "../src/lib/pricing.js";

export const FIGURE_MODEL = "claude-opus-5";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const auth = await requireAuth(req, res);
  if (!auth) return;
  // The only image input is the SECOND crop. No page/question image field exists.
  const { figureCrop, previousSpec, renderError } = (req.body ?? {}) as {
    figureCrop?: unknown; previousSpec?: object; renderError?: string;
  };
  if (typeof figureCrop !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(figureCrop) || figureCrop.length > 5_500_000)
    return res.status(400).json({ error: "분리한 그림 크롭 이미지가 필요합니다." });
  const t0 = Date.now();
  try {
    const { data, mediaType } = parseDataUrl(figureCrop);
    const repair = previousSpec && renderError
      ? `\nPrevious engine spec: ${JSON.stringify(previousSpec).slice(0, 65536)}\nEngine error: ${String(renderError).slice(0, 500)}\nCorrect the spec using the same original figure; preserve all visible labels and geometry.` : "";
    const response = await anthropic.messages.stream({
      model: FIGURE_MODEL, max_tokens: 16000,
      output_config: { effort: "medium" },
      system: `Reconstruct ONLY the supplied cropped math diagram using the deterministic todays-math Python figure engine. Output JSON {"spec": <FigureSpec>, "note": ""}. If the engine cannot faithfully represent it, return {"spec":null,"note":"short Korean reason"}. Never output SVG, Python, JavaScript, or a solved answer. Reproduce visible labels exactly; do not invent dimensions, points, extra construction lines or labels. Preserve aspect ratio, angle marks, dashed lines and shading. Do not infer missing labels from a familiar problem. Coordinates use screen y downward. Prefer FigureSpec v2 for geometry; elem-1 for supported charts, curves, solids and elementary figures. For elem-1, use version:"elem-1" and kind with exactly the catalog's required/optional fields. A right:true marker REQUIRES perpendicular coordinates. A construction circle must be visible only if drawn in the crop. Engine validation is authoritative; unsupported content should remain the original crop.\nENGINE CONTRACT:\n${JSON.stringify(catalog)}`,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data } },
        { type: "text", text: `Recreate this isolated figure. Return the JSON spec only. For v2, points, segments, circles, angles, dimensions and labels MUST be named OBJECT maps, never anonymous arrays. Example: segments:{"AB":["A","B"]}, labels:{"A":"A"}. IMPORTANT: dimensions creates dashed measurement bows. Use dimensions ONLY if a measurement bow/arrow exists in the original. For a bare number beside a side, add an unconnected anchor point at the number's position and labels:{"value3":{"text":"3","dx":0,"dy":0}}. Anchor points have no visible dot; do not connect them. Keep the diagram's visual proportions, even if the printed values imply a different scale. Use only visible labels from the crop, not labels from the example.${repair}` },
      ] }],
    }).finalMessage();
    if (response.stop_reason === "max_tokens") throw new Error("Opus 도형 스펙이 출력 토큰 한도로 잘렸습니다.");
    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    const parsed = parseJsonOrThrow<{ spec: Record<string, unknown> | null; note?: string }>(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    if (parsed.spec !== null && (!parsed.spec || typeof parsed.spec !== "object" || Array.isArray(parsed.spec))) throw new Error("Opus 도형 스펙이 올바르지 않습니다.");
    logAiUsage({ ...auth, endpoint: "ai-figure", provider: "anthropic", model: FIGURE_MODEL,
      usage: normalizeAnthropicUsage(response.usage), latencyMs: Date.now() - t0, error: null });
    return res.status(200).json({ ...parsed, model: FIGURE_MODEL });
  } catch (err) { return res.status(502).json({ error: (err as Error).message }); }
}
