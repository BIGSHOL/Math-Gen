import { spawn } from "node:child_process";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "../../api/_types.js";
import { requireAuth } from "../../api/_jwt.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!await requireAuth(req, res)) return;
  const data = JSON.stringify((req.body as { spec?: unknown } | undefined)?.spec ?? null);
  if (Buffer.byteLength(data) > 65536) return res.status(413).json({ error: "도형 스펙이 너무 큽니다." });
  const result = await new Promise<{ svg?: string; error?: string }>((resolve) => {
    const child = spawn(process.env.PYTHON_BIN || "python", [path.resolve("scripts/figure/render_spec.py")], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let out = "";
    const timeout = setTimeout(() => { child.kill(); resolve({ error: "도형 엔진 실행 시간이 초과되었습니다." }); }, 15000);
    child.stdout.on("data", (chunk) => { out += chunk.toString(); if (out.length > 1_000_000) child.kill(); });
    child.stderr.resume();
    child.on("error", () => { clearTimeout(timeout); resolve({ error: "Python 도형 엔진을 실행할 수 없습니다." }); });
    child.on("close", () => { clearTimeout(timeout); try { resolve(JSON.parse(out)); } catch { resolve({ error: "도형 엔진 응답이 올바르지 않습니다." }); } });
    child.stdin.on("error", () => {});
    child.stdin.end(data);
  });
  return res.status(result.svg ? 200 : 422).json(result);
}
