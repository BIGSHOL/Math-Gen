import { getServiceClient } from "./_supabase.js";
import { computeCost, type NormalizedUsage } from "../src/lib/pricing.js";

/**
 * `api/ai-*.ts` 가 호출 — ai_usage + (에러 시) error_logs row insert.
 *
 * **fire-and-forget 패턴**: caller 가 `await` 하지 않음. `.catch(log)` 만.
 * 사용자 응답 시간에 영향 0 (insert latency ~50ms 가 응답 시작 사이에 흡수).
 *
 * **service role 로 RLS 우회**: ai_usage 의 INSERT 정책이 없어도 service client
 * 가 bypass. user_id / tenant_id 가 null 이어도 trace 기록.
 *
 * **env 미설정 시 silent skip**: getServiceClient() null → 모든 호출 noop.
 */

export interface LogAiUsageInput {
  userId: string | null;
  tenantId: string | null;
  endpoint:
    | "ai-ocr"
    | "ai-cropdetect"
    | "ai-solution"
    | "ai-variant"
    | "ai-image"
    | "ai-exam-analysis"
    | "ai-exam-commentary"
    | "ai-exam-v4"
    | "export-pdf";
  provider: "anthropic" | "gemini" | "openai" | "puppeteer";
  model: string;
  usage: NormalizedUsage;
  latencyMs: number;
  /** null = 성공. 문자열 = 에러 메시지 요약. */
  error: string | null;
  testId?: string | null;
}

/**
 * ai_usage row insert. fire-and-forget — caller 가 await X.
 */
export const logAiUsage = (input: LogAiUsageInput): void => {
  const client = getServiceClient();
  if (!client) return;
  const costUsd = computeCost(input.model, input.usage);
  void client
    .from("ai_usage")
    .insert({
      user_id: input.userId,
      tenant_id: input.tenantId,
      endpoint: input.endpoint,
      provider: input.provider,
      model: input.model,
      input_tokens: input.usage.inputTokens,
      output_tokens: input.usage.outputTokens,
      cache_read_tokens: input.usage.cacheReadTokens,
      cache_creation_tokens: input.usage.cacheCreationTokens,
      cost_usd: costUsd,
      latency_ms: input.latencyMs,
      error: input.error,
      test_id: input.testId ?? null,
    })
    .then((res) => {
      if (res.error) {
        // eslint-disable-next-line no-console
        console.warn("[api/_logUsage] insert ai_usage failed:", res.error.message);
      }
    });
};

export interface LogErrorInput {
  userId: string | null;
  tenantId: string | null;
  kind: string; // 'ocr' / 'solution' / 'variant' / 'export_pdf' / 'api_call'
  severity?: "info" | "warning" | "error" | "fatal";
  message: string;
  stack?: string | null;
  context?: Record<string, unknown> | null;
  userAgent?: string | null;
  fingerprint: string;
}

/**
 * error_logs upsert (occurrence_count 자동 증가). RPC upsert_error_log() 호출 —
 * fingerprint+user_id+kind 매칭 시 count++ + last_seen_at = now.
 */
export const logError = (input: LogErrorInput): void => {
  const client = getServiceClient();
  if (!client) return;
  void client
    .rpc("upsert_error_log", {
      p_user_id: input.userId,
      p_tenant_id: input.tenantId,
      p_kind: input.kind,
      p_severity: input.severity ?? "error",
      p_message: input.message.slice(0, 2000), // 길이 cap
      p_stack: input.stack?.slice(0, 4000) ?? null,
      p_context: input.context ?? null,
      p_user_agent: input.userAgent ?? null,
      p_fingerprint: input.fingerprint,
    })
    .then((res) => {
      if (res.error) {
        // eslint-disable-next-line no-console
        console.warn("[api/_logUsage] upsert_error_log failed:", res.error.message);
      }
    });
};

/**
 * 서버 측 fingerprint — message + endpoint 의 단순 hash (32자 hex).
 * 클라이언트는 별도 lib/errorFingerprint.ts 사용.
 */
export const serverFingerprint = (message: string, endpoint: string): string => {
  // 단순 djb2 hash — 빠르고 충돌 충분히 낮음 (admin UI 의 묶음 용도라 OK).
  let hash = 5381;
  const s = `${endpoint}:${message}`;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) & 0xffffffff;
  }
  // 32자로 padding (collision 영향 무관)
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(4);
};
