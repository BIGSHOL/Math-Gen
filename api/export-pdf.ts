import type { VercelRequest, VercelResponse } from "./_types.js";
import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

/**
 * POST /api/export-pdf
 *
 * Phase 5b — Puppeteer PDF 생성. 클라이언트의 `printable-root` outerHTML +
 * 동일 origin 의 stylesheet link 를 받아 Chromium headless 로 PDF 생성.
 *
 * **input** (JSON):
 *   - `html`: 완성된 HTML 문자열 (printable-root outerHTML)
 *   - `cssUrls`: 외부 stylesheet URL 배열 (Vite 빌드의 /assets/index-*.css)
 *   - `title?`: 파일명 hint (response Content-Disposition)
 *
 * **output**: application/pdf binary.
 *
 * **@sparticuz/chromium-min**: Chromium binary 를 외부 URL 에서 download —
 * Vercel function size 한도 50MB 회피 (chromium-min 자체 ~3MB, 실제 binary 는
 * cold start 시 외부 fetch + 캐시).
 *
 * **cold start**: 첫 호출 ~5-10s (Chromium 다운로드 + launch). 후속 ~2-3s.
 *
 * **timeout**: vercel.json 의 maxDuration 60s 안. Pro tier 필요.
 */

const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";

interface ExportPdfInput {
  html: string;
  cssUrls?: string[];
  title?: string;
}

/**
 * 외부 CSS URL 을 `<link>` 태그로 변환해 HTML head 에 inject.
 * Puppeteer 의 `waitUntil: "networkidle0"` 가 모든 CSS fetch 완료 후 PDF 캡처.
 */
const wrapHtml = (input: ExportPdfInput): string => {
  const cssLinks = (input.cssUrls ?? [])
    .map((url) => `<link rel="stylesheet" href="${url}">`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${input.title ?? "MathGen"}</title>
${cssLinks}
<style>
  /* 인쇄 시 body 마진 0 — @page 가 마진 담당 */
  body { margin: 0; padding: 0; }
  /* 화면 전용 요소 숨김 (인쇄 외) */
  .wizard-chrome, .wizard-chrome-preview { display: none !important; }
</style>
</head>
<body>
${input.html}
</body>
</html>`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const input = (req.body ?? {}) as ExportPdfInput;
  if (!input.html) {
    return res.status(400).json({ error: "html field required" });
  }
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    browser = await puppeteer.launch({
      args: [...chromium.args, "--font-render-hinting=none"],
      defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 }, // A4 @ 96dpi
      executablePath,
      headless: true,
    });
    const page = await browser.newPage();
    const fullHtml = wrapHtml(input);
    // puppeteer-core 25.x 의 setContent 는 `networkidle0` 지원 X (load /
    // domcontentloaded 만). load 후 명시적 waitForNetworkIdle 로 stylesheet +
    // 외부 fonts fetch 완료 보장.
    await page.setContent(fullHtml, {
      waitUntil: "load",
      timeout: 30_000,
    });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 });
    // 폰트 로드 추가 대기 (KaTeX woff2 등)
    await page.evaluateHandle("document.fonts.ready");
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    // puppeteer-core 25.x 는 Uint8Array 반환. Vercel res.send 는 Buffer
    // (= Uint8Array 서브클래스) 를 binary 로 처리하므로 명시적 변환.
    const pdfBuffer = Buffer.from(pdfBytes);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${input.title ?? "mathgen-export"}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    const msg = (err as Error).message || "PDF generation failed";
    // eslint-disable-next-line no-console
    console.error("[api/export-pdf] error:", msg);
    return res.status(500).json({ error: msg });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
