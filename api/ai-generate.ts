import type { VercelRequest, VercelResponse } from "./_types.js";
import { requireAuth } from "./_jwt.js";
import { generateMathProblemDirect } from "../src/services/ai/generate.js";
import type { SelectionState } from "../src/types/index.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!await requireAuth(req, res)) return;
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "문제 생성 조건이 필요합니다." });
  try { return res.status(200).json(await generateMathProblemDirect(req.body as SelectionState)); }
  catch (err) { return res.status(502).json({ error: (err as Error).message }); }
}
