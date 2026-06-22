import { useEffect, useState } from "react";
import { Btn, Card, Chip, Heading, Eyebrow } from "@app/components/ui";
import { loadErrors, type ErrorLogRow } from "@app/services/api/admin";

/**
 * Admin §5 — error_logs 검색 + filter + fingerprint 묶음 표시.
 *
 * occurrence_count = 같은 fingerprint 가 N 회 발생. last_seen_at 으로 정렬.
 */

const KINDS = ["", "ocr", "solution", "variant", "cropdetect", "export_pdf", "client_uncaught", "client_unhandled_rejection"];
const SEVERITIES = ["", "info", "warning", "error", "fatal"];

/** 에러 종류 코드 → 한글 라벨. 미매핑 코드는 원문 그대로. */
const KIND_LABELS: Record<string, string> = {
  ocr: "문항 인식(OCR)",
  solution: "해설 생성",
  variant: "변형 생성",
  cropdetect: "크롭 검출",
  export_pdf: "PDF 내보내기",
  exam_analysis: "시험지 분석",
  exam_commentary: "총평 생성",
  exam_v4: "블로그 생성",
  image: "이미지 생성",
  api_call: "API 호출",
  client_uncaught: "화면 오류(미처리)",
  client_unhandled_rejection: "화면 비동기 오류",
};
const kindLabel = (k: string): string => KIND_LABELS[k] ?? k;

/** 심각도 코드 → 한글 라벨. */
const SEVERITY_LABELS: Record<string, string> = {
  info: "정보",
  warning: "경고",
  error: "오류",
  fatal: "치명적",
};
const severityLabel = (s: string): string => SEVERITY_LABELS[s] ?? s;

/** 자주 나오는 에러 메시지 → 한글 한 줄 요약. 모르면 null(원문 표시). */
const summarizeMessage = (msg: string): string | null => {
  const m = msg.toLowerCase();
  if (/invalid x-api-key|authentication_error|x-api-key/.test(m)) return "API 키 인증 실패 (401) — 키 무효/만료";
  if (/\b429\b|rate limit|too many requests|overloaded|quota/.test(m)) return "요청 한도/할당량 초과 — 잠시 후 재시도";
  if (/max_tokens|maxoutputtokens|토큰 한도/.test(m)) return "토큰 한도 초과 — 응답 잘림";
  if (/timeout|timed out|시간 초과/.test(m)) return "시간 초과";
  if (/network|fetch failed|err_aborted|networkerror|load failed/.test(m)) return "네트워크 오류";
  if (/크롭 ocr 실패|페이지 재인식|박스를 확인/.test(msg)) return "크롭 OCR 실패 — 박스 확인 필요";
  if (/\b50[0-9]\b|internal server error|function_invocation/.test(m)) return "서버 내부 오류 (5xx)";
  if (/unexpected (end|token)|json|parse error/.test(m)) return "응답 파싱 실패 (JSON)";
  return null;
};

export const ErrorLogs = () => {
  const [errors, setErrors] = useState<ErrorLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await loadErrors(severityFilter || undefined, kindFilter || undefined);
      if (cancelled) return;
      setErrors(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [kindFilter, severityFilter]);

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <Heading level="h2">에러 로그</Heading>
      <Eyebrow>{errors.length} 종 ({errors.reduce((s, e) => s + e.occurrence_count, 0)} 회 발생)</Eyebrow>

      {/* Filter */}
      <Card pad={12}>
        <div className="flex gap-3 items-center text-small">
          <span className="text-muted">필터:</span>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="bg-surface2 border border-line rounded-r1 px-2 py-1"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{k ? kindLabel(k) : "(전체 종류)"}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-surface2 border border-line rounded-r1 px-2 py-1"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s ? severityLabel(s) : "(전체 심각도)"}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* 목록 */}
      {loading ? (
        <Card pad={20}><div className="text-center text-muted">불러오는 중…</div></Card>
      ) : errors.length === 0 ? (
        <Card pad={20}><div className="text-center text-muted">에러 로그가 없습니다.</div></Card>
      ) : (
        <div className="space-y-2">
          {errors.map((e) => (
            <Card key={e.id} pad={12}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Chip
                      tone={e.severity === "fatal" ? "warn" : e.severity === "error" ? "warn" : "soft"}
                      size="sm"
                    >
                      {severityLabel(e.severity)}
                    </Chip>
                    <Chip tone="soft" size="sm">{kindLabel(e.kind)}</Chip>
                    {e.occurrence_count > 1 && (
                      <Chip tone="accent" size="sm">×{e.occurrence_count}</Chip>
                    )}
                    <span className="text-caption text-muted">
                      {new Date(e.last_seen_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  {(() => {
                    const summary = summarizeMessage(e.message);
                    return summary ? (
                      <>
                        <div className="text-small font-medium text-text">{summary}</div>
                        <div className="text-caption font-mono text-muted break-all mt-0.5">
                          {e.message.slice(0, 160)}
                          {e.message.length > 160 && "…"}
                        </div>
                      </>
                    ) : (
                      <div className="text-small font-mono text-text break-all">
                        {e.message.slice(0, 200)}
                        {e.message.length > 200 && "…"}
                      </div>
                    );
                  })()}
                </div>
                <Btn
                  kind="ghost"
                  size="sm"
                  icon={expanded === e.id ? "caret-up" : "caret-down"}
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                >
                  {expanded === e.id ? "닫기" : "상세"}
                </Btn>
              </div>
              {expanded === e.id && (
                <div className="mt-3 pt-3 border-t border-line space-y-2 text-caption">
                  <div>
                    <span className="text-muted">fingerprint:</span>{" "}
                    <span className="font-mono">{e.fingerprint.slice(0, 16)}…</span>
                  </div>
                  <div>
                    <span className="text-muted">user_id:</span>{" "}
                    <span className="font-mono">{e.user_id ?? "(anon)"}</span>
                  </div>
                  {e.stack && (
                    <div>
                      <div className="text-muted mb-1">stack:</div>
                      <pre className="bg-surface2 p-2 rounded-r1 overflow-x-auto text-caption whitespace-pre-wrap break-all">
                        {e.stack.slice(0, 1500)}
                      </pre>
                    </div>
                  )}
                  {e.context !== null && e.context !== undefined && (
                    <div>
                      <div className="text-muted mb-1">context:</div>
                      <pre className="bg-surface2 p-2 rounded-r1 overflow-x-auto text-caption">
                        {JSON.stringify(e.context, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
