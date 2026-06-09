import type { VercelRequest, VercelResponse } from "./_types.js";
import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { requireAuth } from "./_jwt.js";
import { logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/export-pdf
 *
 * Server-side PDF generation for the printable wizard output.
 * This endpoint accepts trusted app HTML from an authenticated user, then
 * renders it in a locked-down Chromium page.
 */

const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

const MAX_HTML_CHARS = 8_000_000;
const MAX_CSS_URLS = 16;
const MAX_TITLE_CHARS = 120;
const DEFAULT_TITLE = "mathgen-export";

interface ExportPdfInput {
  html: string;
  cssUrls: string[];
  title?: string;
}

const firstHeaderValue = (value: string | string[] | undefined): string | undefined => {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(",")[0]?.trim() || undefined;
};

const requestOrigin = (req: VercelRequest): string => {
  const host =
    firstHeaderValue(req.headers["x-forwarded-host"]) ?? firstHeaderValue(req.headers.host);
  if (!host) return "";

  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
  const fallbackProto =
    host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const proto =
    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : fallbackProto;

  return `${proto}://${host}`;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

const safeTitle = (title?: string): string => {
  const trimmed = (title ?? DEFAULT_TITLE).trim().slice(0, MAX_TITLE_CHARS);
  return trimmed || DEFAULT_TITLE;
};

const safeDownloadName = (title?: string): string => {
  const cleaned = safeTitle(title)
    .replace(/[\r\n"]/g, "")
    .replace(/[\\/:*?<>|]/g, "_")
    .trim();
  return cleaned || DEFAULT_TITLE;
};

const normalizeCssUrls = (cssUrls: string[], origin: string): string[] => {
  if (!origin) return [];

  return cssUrls
    .map((rawUrl) => {
      try {
        const url = new URL(rawUrl, origin);
        if (url.origin !== origin) return null;
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        if (!url.pathname.endsWith(".css")) return null;
        return url.href;
      } catch {
        return null;
      }
    })
    .filter((url): url is string => Boolean(url));
};

const parseInput = (body: unknown): ExportPdfInput | { error: string; status: number } => {
  const raw = typeof body === "string" ? JSON.parse(body) : body;
  const input = (raw ?? {}) as Partial<{
    html: unknown;
    cssUrls: unknown;
    title: unknown;
  }>;

  const html = input.html;
  if (typeof html !== "string" || html.length === 0) {
    return { status: 400, error: "html field required" };
  }
  if (html.length > MAX_HTML_CHARS) {
    return { status: 413, error: "html field too large" };
  }

  let cssUrls: string[] = [];
  const cssUrlsInput = input.cssUrls;
  if (cssUrlsInput !== undefined) {
    if (!Array.isArray(cssUrlsInput)) {
      return { status: 400, error: "cssUrls must be an array" };
    }
    if (cssUrlsInput.length > MAX_CSS_URLS) {
      return { status: 400, error: "too many stylesheet URLs" };
    }
    if (!cssUrlsInput.every((url): url is string => typeof url === "string")) {
      return { status: 400, error: "cssUrls must contain strings" };
    }
    cssUrls = cssUrlsInput;
  }

  let title: string | undefined;
  if (input.title !== undefined) {
    if (typeof input.title !== "string") {
      return { status: 400, error: "title must be a string" };
    }
    title = input.title;
  }

  return {
    html,
    cssUrls,
    title,
  };
};

const wrapHtml = (input: ExportPdfInput, origin: string): string => {
  const cssLinks = normalizeCssUrls(input.cssUrls, origin)
    .map((url) => `<link rel="stylesheet" href="${escapeHtml(url)}">`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(safeTitle(input.title))}</title>
${cssLinks}
<style>
  body { margin: 0; padding: 0; }
  .wizard-chrome, .wizard-chrome-preview { display: none !important; }
</style>
</head>
<body>
${input.html}
</body>
</html>`;
};

const installNetworkGuard = async (
  page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>["newPage"]>>,
  origin: string,
): Promise<void> => {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url === "about:blank" || url.startsWith("data:") || url.startsWith("blob:")) {
      void request.continue();
      return;
    }

    try {
      const parsed = new URL(url);
      const allowedResourceTypes = new Set(["document", "stylesheet", "font", "image"]);
      if (
        origin &&
        parsed.origin === origin &&
        allowedResourceTypes.has(request.resourceType())
      ) {
        void request.continue();
        return;
      }
    } catch {
      // Fall through to abort malformed URLs.
    }

    void request.abort();
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  let input: ExportPdfInput;
  try {
    const parsed = parseInput(req.body);
    if ("error" in parsed) {
      return res.status(parsed.status).json({ error: parsed.error });
    }
    input = parsed;
  } catch {
    return res.status(400).json({ error: "invalid JSON body" });
  }

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const origin = requestOrigin(req);
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    browser = await puppeteer.launch({
      args: [...chromium.args, "--font-render-hinting=none"],
      defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
      executablePath,
      headless: true,
    });
    const page = await browser.newPage();
    await installNetworkGuard(page, origin);

    const fullHtml = wrapHtml(input, origin);
    await page.setContent(fullHtml, {
      waitUntil: "load",
      timeout: 30_000,
    });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 });
    await page.evaluateHandle("document.fonts.ready");

    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    const pdfBuffer = Buffer.from(pdfBytes);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeDownloadName(input.title)}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    const msg = (err as Error).message || "PDF generation failed";
    void logError({
      userId: auth.userId,
      tenantId: auth.tenantId,
      kind: "export_pdf",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: {
        endpoint: "export-pdf",
        title: input.title ?? null,
        htmlLength: input.html.length,
      },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "export-pdf"),
    });
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
