/**
 * Phase #13 — DALL-E 3 도형 이미지 생성 클라이언트 wrapper.
 *
 * Vercel function `/api/ai-image` 를 호출. 한국 수학 도형 영역이 vector 재구성도
 * bbox crop 도 어려운 경우 마지막 fallback.
 *
 * **흐름**:
 *  1. extractDiagramHint(item.text) — `[그림N]` 마커 주변 한국어 문맥 추출
 *  2. POST /api/ai-image — 한국어 prompt + ocrProblemId 전송
 *  3. 서버: gpt-4o-mini 영어 번역 + DALL-E 3 호출 + Supabase Storage upload
 *  4. 응답: permanentUrl (영구 URL) + revisedPrompt + costUsd
 *
 * **dedupe (클라이언트 측)**: caller (DiagramFallbackPanel) 가 이미 같은 prompt 의
 * AI 이미지가 있으면 modal 에 "이미 생성됨 — 다시 생성하시겠습니까?" confirm.
 *
 * **비용**: $0.045 + ~$0.001 (gpt-4o-mini 번역) = ~$0.046/장.
 */

import type { OCRProblem } from "@app/stores/wizardStore";
import { currentAccessToken } from "../api/supabase";

export interface GenerateDiagramImageInput {
  /** 사용자가 confirm modal 에서 편집 가능한 prompt (한국어 또는 영어). */
  prompt: string;
  /** 어느 OCR 문항의 도형인지 (서버 로깅 + Storage path). */
  ocrProblemId: string;
  /** 시험지 ID (선택 — 로깅용). */
  testId?: string | null;
  /** 한국어 prompt 면 영어 번역 활성화 (default true). */
  translate?: boolean;
  /** 호출 cancel signal. */
  signal?: AbortSignal;
}

export interface GenerateDiagramImageResult {
  /** Supabase Storage 영구 URL. OCRImage.url 에 그대로 저장. */
  url: string;
  /** Storage path (디버그 / 삭제용). */
  storagePath: string;
  /** DALL-E 가 revised 한 영어 prompt — UI 에 표시해 사용자가 추가 편집 가능. */
  revisedPrompt: string;
  /** 비용 (USD) — UI 의 누적 비용 표시용. */
  costUsd: number;
}

/**
 * `/api/ai-image` 호출.
 */
export const generateDiagramImage = async (
  input: GenerateDiagramImageInput,
): Promise<GenerateDiagramImageResult> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  const token = await currentAccessToken();
  if (!token) {
    throw new Error("로그인 필요 — AI 이미지 생성은 인증 사용자 전용");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const res = await fetch("/api/ai-image", {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: input.prompt,
      ocrProblemId: input.ocrProblemId,
      testId: input.testId ?? undefined,
      translate: input.translate ?? true,
    }),
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text();
    let errMsg = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      errMsg = parsed.error ?? text;
    } catch {
      // text 그대로 사용
    }
    throw new Error(errMsg || `이미지 생성 실패 (HTTP ${res.status})`);
  }
  const data = (await res.json()) as {
    permanentUrl: string;
    storagePath: string;
    revisedPrompt: string;
    costUsd: number;
  };
  return {
    url: data.permanentUrl,
    storagePath: data.storagePath,
    revisedPrompt: data.revisedPrompt,
    costUsd: data.costUsd,
  };
};

/**
 * OCRProblem.text 에서 [그림N] 마커 주변 한국어 문맥을 추출해 DALL-E 용 prompt
 * 후보를 만든다. confirm modal 에서 사용자가 편집할 수 있는 초안.
 *
 * **추출 우선순위**:
 *  1. `[그림N]` 마커 직전 1 문장 (가장 가까운 문맥)
 *  2. 마커 못 찾으면 본문 첫 100자 (도형이 본문 전반 묘사)
 *  3. images[].label 이 있으면 fallback (예: "정사각형 ABCD")
 *
 * **prompt 템플릿**: 추출 문맥 + 한국 교과서 스타일 키워드 prefix.
 */
export const extractDiagramHint = (
  item: Pick<OCRProblem, "text" | "images">,
  imageIndex = 0,
): string => {
  const text = item.text ?? "";
  const targetMarker = `[그림${imageIndex + 1}]`;
  const markerIdx = text.indexOf(targetMarker);

  let context = "";
  if (markerIdx >= 0) {
    // 마커 직전 1 문장 (마침표·물음표 기준)
    const before = text.slice(0, markerIdx);
    const sentences = before.split(/[.!?]\s+/);
    context = sentences[sentences.length - 1]?.trim() || before.slice(-100);
  } else {
    // 마커 없음 — 본문 첫 100 자
    context = text.slice(0, 100).trim();
  }

  // label fallback
  const label =
    item.images?.[imageIndex]?.label ||
    item.images?.[0]?.label ||
    "";

  // KaTeX wrapper / 마크다운 강조 제거 (DALL-E 용 plain text)
  const plain = context
    .replace(/\$[^$]*\$/g, " ") // $...$ 수식 제거
    .replace(/[*_`]/g, "") // 강조 마커 제거
    .replace(/\s+/g, " ")
    .trim();

  const hint = label ? `${label} — ${plain}` : plain;
  return `한국 수학 교과서 스타일의 도형 그림: ${hint || "기하학 도형"}. 검정 선, 흰 배경, 라벨 겹침 없음, 명확한 기하학적 형태.`;
};
