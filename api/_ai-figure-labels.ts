import type { VercelRequest, VercelResponse } from "./_types.js";
import { requireAuth } from "./_jwt.js";
import { placeLabel, typesetLabel } from "../scripts/figure/mathjaxLabel.js";

/** todays-math의 조판기를 공유한다. SVG 입력을 받지 않고 안전한 글리프만 생성한다. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!await requireAuth(req, res)) return;
  const labels = (req.body as { labels?: unknown } | undefined)?.labels;
  if (!Array.isArray(labels) || labels.length > 200) return res.status(400).json({ error: "라벨은 최대 200개입니다." });
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100000;
  for (const l of labels) {
    if (!l || typeof l.text !== "string" || l.text.length > 300 || !finite(l.x) || !finite(l.y)
      || !finite(l.size) || l.size <= 0 || l.size > 200 || !["start", "middle", "end"].includes(l.anchor)
      || !/^#[0-9a-f]{6}$/i.test(l.color) || (l.halo && (!/^#[0-9a-f]{6}$/i.test(l.halo.color) || !finite(l.halo.width) || l.halo.width < 0 || l.halo.width > 20)))
      return res.status(400).json({ error: "도형 라벨 속성이 올바르지 않습니다." });
  }
  const svg = labels.map(l => {
    const laid = typesetLabel(l.text, l.bold === true, l.italic === true);
    return laid ? placeLabel(laid, l.text, l.x, l.y, l.size, l.color, l.halo,
      { anchor: l.anchor, centerY: l.centerY === true }) : null;
  });
  return res.json({ labels: svg });
}
