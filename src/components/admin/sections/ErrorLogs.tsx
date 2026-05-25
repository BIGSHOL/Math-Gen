import { useEffect, useState } from "react";
import { Btn, Card, Chip, Heading, Eyebrow } from "@app/components/ui";
import { loadErrors, type ErrorLogRow } from "@app/services/api/admin";

/**
 * Admin §5 — error_logs 검색 + filter + fingerprint 묶음 표시.
 *
 * occurrence_count = 같은 fingerprint 가 N 회 발생. last_seen_at 으로 정렬.
 */

const KINDS = ["", "ocr", "solution", "variant", "export_pdf", "client_uncaught", "client_unhandled_rejection"];
const SEVERITIES = ["", "info", "warning", "error", "fatal"];

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
              <option key={k} value={k}>{k || "(전체 종류)"}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-surface2 border border-line rounded-r1 px-2 py-1"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s || "(전체 심각도)"}</option>
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
                      {e.severity}
                    </Chip>
                    <Chip tone="soft" size="sm">{e.kind}</Chip>
                    {e.occurrence_count > 1 && (
                      <Chip tone="accent" size="sm">×{e.occurrence_count}</Chip>
                    )}
                    <span className="text-caption text-muted">
                      {new Date(e.last_seen_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <div className="text-small font-mono text-text break-all">
                    {e.message.slice(0, 200)}
                    {e.message.length > 200 && "…"}
                  </div>
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
