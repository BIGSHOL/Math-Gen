/**
 * Sanitizers for AI-generated problem fields.
 *
 * Models occasionally slip in <img> tags or markdown image placeholders even
 * when the system prompt forbids them. We strip those defensively before
 * handing the problem to the renderer.
 *
 * SECURITY NOTE: this module only handles "broken icon" prevention. Full
 * XSS-safe SVG sanitization (DOMPurify) lands in Phase 5 — see the plan.
 */

const IMG_TAG_RE = /<img[^>]*>/gi;
const MD_IMG_RE = /!\[.*?\]\(.*?\)/g;
const EMPTY_CENTER_RE = /<center>\s*<\/center>/gi;

export const sanitizeText = (text: string | undefined): string => {
  if (!text) return text ?? "";
  return text
    .replace(IMG_TAG_RE, "")
    .replace(MD_IMG_RE, "")
    .replace(EMPTY_CENTER_RE, "")
    .trim();
};

/**
 * SVG often comes wrapped in markdown fences. Strip them.
 *
 * Handles both single-line fences and the common case where the model adds
 * a language tag, comments, or blank lines between the opening ``` and the
 * actual `<svg>` tag:
 *
 *     ```svg
 *     <!-- comment -->
 *     <svg ...>...</svg>
 *     ```
 *
 * The regex eats the opening fence + everything on its own line, and the
 * closing fence including any leading whitespace.
 */
export const sanitizeSvg = (svg: string | null | undefined): string | null => {
  if (!svg) return null;
  return svg
    .replace(/^\s*```(?:xml|svg|html)?[^\n]*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
};

type AllowedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const MEDIA_TYPE_MAP: Record<string, AllowedMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

/**
 * Extract image MIME and base64 payload from a data URL.
 *
 * Falls back to `image/jpeg` when the header is malformed or the MIME type
 * isn't on Anthropic's supported list. We `console.warn` on every fallback
 * so misclassified images surface in dev — a real PNG sent as JPEG will
 * make the vision endpoint reject the request with a confusing error if we
 * silently coerce.
 */
export const parseDataUrl = (
  dataUrl: string,
): { mediaType: AllowedMediaType; data: string } => {
  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!match) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ai/sanitize] parseDataUrl: malformed data URL, falling back to image/jpeg",
    );
    return { mediaType: "image/jpeg", data: dataUrl.split(",")[1] ?? "" };
  }
  const declared = match[1].toLowerCase();
  const mediaType = MEDIA_TYPE_MAP[declared];
  if (!mediaType) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ai/sanitize] parseDataUrl: unsupported MIME '${declared}', falling back to image/jpeg`,
    );
    return { mediaType: "image/jpeg", data: match[2] };
  }
  return { mediaType, data: match[2] };
};
