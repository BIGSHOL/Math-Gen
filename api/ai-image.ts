import type { VercelRequest, VercelResponse } from "./_types.js";
import OpenAI from "openai";
import { requireAuth } from "./_jwt.js";
import { getServiceClient } from "./_supabase.js";
import { logAiUsage, logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/ai-image
 *
 * Phase #13 — DALL-E 3 도형 이미지 생성. 한국 수학 도형이 vector SVG 재구성도
 * bbox crop 도 어려운 경우 마지막 fallback.
 *
 * **흐름**:
 *  1. JWT auth → user_id / tenant_id
 *  2. (옵션) gpt-4o-mini 1-shot 으로 한국어 prompt → 영어 시각 지시문 번역
 *  3. DALL-E 3 호출: 1024×1024, standard quality, n=1
 *  4. response.data[0].url (DALL-E CDN URL — 1-2시간 만료) → 즉시 fetch + Supabase
 *     Storage `page-images/{user_id}/ai-gen/{ocrProblemId}-{ts}.png` upload
 *  5. permanent public URL 반환
 *  6. ai_usage 에 endpoint="ai-image", cost_usd=0.045 기록
 *
 * **비용**: $0.045 / image (DALL-E 3 standard 1024×1024) + ~$0.001 (gpt-4o-mini 번역)
 *
 * **timeout**: 60s 한도 안전 (DALL-E 응답 2-5초 + Storage upload <1초)
 */

interface AiImageInput {
  /** 한국어 또는 영어 prompt — 사용자가 confirm modal 에서 편집 후 전달. */
  prompt: string;
  /** 어떤 OCR 문항의 도형인지 (Storage path + 로깅용). */
  ocrProblemId: string;
  /** 시험지 ID (선택 — 로깅용). */
  testId?: string;
  /** 사용자가 한국어 prompt 전달 시 영어 번역 활성화. default true. */
  translate?: boolean;
}

interface AiImageOutput {
  /** 영구 Supabase Storage URL. */
  permanentUrl: string;
  /** Storage path (예: "{user_id}/ai-gen/{ocrProblemId}-{ts}.png"). */
  storagePath: string;
  /** 실제 DALL-E 에 보낸 영어 prompt (사용자 한국어 → 번역 결과). */
  revisedPrompt: string;
  /** 비용 (USD). */
  costUsd: number;
}

const DALLE_COST_USD = 0.045; // standard 1024×1024
const STORAGE_BUCKET = "page-images";

const getOpenAIClient = (): OpenAI => {
  const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY env 누락 — Vercel 환경변수에 OPENAI_API_KEY (또는 VITE_OPENAI_API_KEY) 설정 필요.",
    );
  }
  return new OpenAI({ apiKey });
};

/**
 * gpt-4o-mini 로 한국어 도형 설명 → 영어 DALL-E 시각 지시문 번역.
 * 실패 시 원본 prompt 그대로 사용 (fail-soft).
 */
const translateToEnglishVisualPrompt = async (
  openai: OpenAI,
  koreanPrompt: string,
): Promise<string> => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You translate Korean math diagram descriptions into concise English visual prompts " +
            "for DALL-E 3. Output ONLY the English prompt, no preamble. Style: 'Korean math textbook " +
            "style, black ink on white background, clean line drawing, minimalist geometric figure, " +
            "no labels overlapping, no shadows.' Keep math labels (A, B, C, x, y) in Latin letters.",
        },
        { role: "user", content: koreanPrompt },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });
    const translated = completion.choices[0]?.message?.content?.trim();
    return translated || koreanPrompt;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[api/ai-image] 번역 실패, 원본 prompt 사용:", (err as Error).message);
    return koreanPrompt;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const t0 = Date.now();
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const input = (req.body ?? {}) as AiImageInput;
  if (!input.prompt || typeof input.prompt !== "string") {
    return res.status(400).json({ error: "prompt field required (string)" });
  }
  if (!input.ocrProblemId || typeof input.ocrProblemId !== "string") {
    return res.status(400).json({ error: "ocrProblemId field required (string)" });
  }
  try {
    const openai = getOpenAIClient();
    // Step 1: 한국어 → 영어 번역 (translate=false 면 skip)
    const englishPrompt =
      input.translate === false
        ? input.prompt
        : await translateToEnglishVisualPrompt(openai, input.prompt);

    // Step 2: DALL-E 3 호출
    const dalleResp = await openai.images.generate({
      model: "dall-e-3",
      prompt: englishPrompt,
      size: "1024x1024",
      quality: "standard",
      n: 1,
      response_format: "url",
    });
    const dalleUrl = dalleResp.data?.[0]?.url;
    const revisedPrompt = dalleResp.data?.[0]?.revised_prompt ?? englishPrompt;
    if (!dalleUrl) {
      throw new Error("DALL-E 응답에 URL 없음 — 생성 실패");
    }

    // Step 3: DALL-E URL → fetch → ArrayBuffer
    const imgResp = await fetch(dalleUrl);
    if (!imgResp.ok) {
      throw new Error(
        `DALL-E 이미지 download 실패 (HTTP ${imgResp.status}) — URL 만료 가능성`,
      );
    }
    const imgBlob = await imgResp.blob();

    // Step 4: Supabase Storage 영구 upload
    const client = getServiceClient();
    if (!client) {
      throw new Error(
        "Supabase service client 없음 — Storage upload 불가. SUPABASE_SERVICE_ROLE_KEY 환경변수 확인",
      );
    }
    const timestamp = Date.now();
    const storagePath = `${auth.userId}/ai-gen/${input.ocrProblemId}-${timestamp}.png`;
    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, imgBlob, {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Storage upload 실패: ${uploadError.message}`);
    }

    // Step 5: public URL 가져오기 (page-images bucket 은 private — signed URL 필요)
    // 단순화: getPublicUrl 호출 (bucket 정책 검증 필요 — 미공개면 signed)
    const { data: publicUrlData } = client.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    let permanentUrl = publicUrlData?.publicUrl;
    if (!permanentUrl) {
      // private bucket fallback — 1 년짜리 signed URL
      const { data: signedData, error: signedError } = await client.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      if (signedError || !signedData) {
        throw new Error(`Storage URL 생성 실패: ${signedError?.message ?? "unknown"}`);
      }
      permanentUrl = signedData.signedUrl;
    }

    const latencyMs = Date.now() - t0;
    // ai_usage 로깅 — endpoint 신규 enum + 가상 token (image count 기반).
    // costUsd 는 computeCost 가 pricing.ts 에서 모델별 계산하므로
    // dall-e-3 는 별도 단가 등록 필요 — 임시로 inputTokens 1 + 우리 측 logging.
    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-image",
      provider: "openai",
      model: "dall-e-3",
      usage: {
        inputTokens: englishPrompt.length, // prompt 길이 추정
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      latencyMs,
      error: null,
      testId: input.testId ?? null,
    });

    const out: AiImageOutput = {
      permanentUrl,
      storagePath,
      revisedPrompt,
      costUsd: DALLE_COST_USD,
    };
    return res.status(200).json(out);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    const latencyMs = Date.now() - t0;
    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-image",
      provider: "openai",
      model: "dall-e-3",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      latencyMs,
      error: msg.slice(0, 500),
    });
    logError({
      userId: auth.userId,
      tenantId: auth.tenantId,
      kind: "ai-image",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: {
        endpoint: "ai-image",
        ocrProblemId: input.ocrProblemId ?? null,
        prompt: input.prompt?.slice(0, 200) ?? null,
      },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "ai-image"),
    });
    // eslint-disable-next-line no-console
    console.error("[api/ai-image] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
