import type { VercelRequest, VercelResponse } from "./_types.js";

/** Keep public /api/ai-* URLs, share one function within Vercel Hobby's limit. */
const handlers = {
  "ai-ocr": () => import("./_ai-ocr.js"),
  "ai-cropdetect": () => import("./_ai-cropdetect.js"),
  "ai-solution": () => import("./_ai-solution.js"),
  "ai-variant": () => import("./_ai-variant.js"),
  "ai-image": () => import("./_ai-image.js"),
  "ai-exam-analysis": () => import("./_ai-exam-analysis.js"),
  "ai-exam-commentary": () => import("./_ai-exam-commentary.js"),
  "ai-exam-v4": () => import("./_ai-exam-v4.js"),
  "ai-figure-detect": () => import("./_ai-figure-detect.js"),
  "ai-figure": () => import("./_ai-figure.js"),
  "ai-generate": () => import("./_ai-generate.js"),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = req.query.route;
  if (typeof route !== "string" || !Object.hasOwn(handlers, route)) {
    return res.status(404).json({ error: "알 수 없는 AI 요청입니다." });
  }
  const module = await handlers[route as keyof typeof handlers]();
  return module.default(req, res);
}
