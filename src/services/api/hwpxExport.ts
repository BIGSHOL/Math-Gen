import { collectHwpxLayout } from "@app/lib/hwpxLayout";
import { hwpxZip } from "@app/lib/hwpxZip";
import { currentAccessToken, fetchWithAuth } from "./supabase";

export async function exportPreviewHwpx(root: HTMLElement, title: string) {
  const token = await currentAccessToken();
  if (!token) throw new Error("로그인 후 HWPX를 생성할 수 있습니다.");
  const { pages, assets } = await collectHwpxLayout(root);
  const response = await fetchWithAuth("/api/export-hwpx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, pages }) });
  const result = await response.json().catch(() => ({ error: "HWPX 생성 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요." }));
  if (!response.ok || !result.partsGzip) throw new Error(result.error || "HWPX 생성에 실패했습니다.");
  const bytes = Uint8Array.from(atob(result.partsGzip), char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const parts = JSON.parse(await new Response(stream).text());
  return hwpxZip(parts, assets);
}
