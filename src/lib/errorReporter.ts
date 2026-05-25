import { supabase } from "@app/services/api/supabase";
import { fingerprintError } from "./errorFingerprint";

/**
 * 클라이언트 측 에러 → Supabase `error_logs` 테이블 upsert.
 *
 * **흐름**:
 *   1. fingerprintError(err, context) 로 hash 생성
 *   2. supabase.rpc("upsert_error_log", {...}) 호출 — 같은 fingerprint+user_id+kind
 *      매칭 시 occurrence_count++, 새 조합이면 새 row.
 *   3. fire-and-forget — caller 의 응답 흐름에 영향 X.
 *
 * **Supabase disabled**: VITE_SUPABASE_ENABLED=false 면 supabase null. silent skip.
 *
 * **anon 호출**: RLS 의 `error_logs_insert_own` 정책이 authenticated 만 허용
 * 하지만 *upsert_error_log RPC* 는 SECURITY DEFINER 라 anon 도 통과 — userId
 * null 이면 anonymous 에러로 기록.
 */

export interface ReportErrorContext {
  /** 어디서 발생했나 — fingerprint + ErrorLog.kind 에 반영. */
  kind:
    | "client_uncaught"
    | "client_unhandled_rejection"
    | "ocr"
    | "solution"
    | "variant"
    | "export_pdf"
    | "api_call"
    | "other";
  /** 추가 디버그 정보 (route, model, page_id, attempt, ...). */
  extra?: Record<string, unknown>;
  /** error severity. default 'error'. */
  severity?: "info" | "warning" | "error" | "fatal";
}

const collectClientContext = (): Record<string, unknown> => ({
  url: typeof window !== "undefined" ? window.location.href : null,
  pathname: typeof window !== "undefined" ? window.location.pathname : null,
  search: typeof window !== "undefined" ? window.location.search : null,
});

/**
 * 클라이언트 에러를 error_logs 에 기록. fire-and-forget — Promise 안 반환.
 */
export const reportError = (
  err: unknown,
  context: ReportErrorContext,
): void => {
  if (!supabase) return; // env disabled
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    if (!message) return;
    const fingerprint = fingerprintError(err, context.kind);
    const mergedContext: Record<string, unknown> = {
      ...collectClientContext(),
      ...(context.extra ?? {}),
    };
    void supabase
      .rpc("upsert_error_log", {
        p_user_id: null, // supabase auth.uid() 가 RPC 내부에서 자동 추출 안 됨 — null
        p_tenant_id: null, // 동일
        p_kind: context.kind,
        p_severity: context.severity ?? "error",
        p_message: message.slice(0, 2000),
        p_stack: stack?.slice(0, 4000) ?? null,
        p_context: mergedContext,
        p_user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
        p_fingerprint: fingerprint,
      })
      .then((res: { error?: { message?: string } | null }) => {
        if (res?.error && import.meta.env?.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[errorReporter] upsert failed:", res.error.message);
        }
      });
  } catch {
    // reporter 자체 실패는 silent (recursive error 방지).
  }
};

/**
 * `window.onerror` + `unhandledrejection` 글로벌 핸들러. App mount 시 1회 호출.
 */
let _installed = false;
export const installGlobalErrorHandlers = (): void => {
  if (_installed || typeof window === "undefined") return;
  _installed = true;

  // Uncaught error (sync). errorEvent.error 가 Error 객체 — preserve stack.
  window.addEventListener("error", (event: ErrorEvent) => {
    // resource loading errors (img/script 404) 는 무시 — error 없음, target 만 있음
    if (!event.error && !event.message) return;
    reportError(event.error ?? new Error(event.message), {
      kind: "client_uncaught",
      severity: "error",
      extra: {
        filename: event.filename,
        line: event.lineno,
        col: event.colno,
      },
    });
  });

  // Unhandled Promise rejection
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    reportError(event.reason, {
      kind: "client_unhandled_rejection",
      severity: "error",
    });
  });
};
