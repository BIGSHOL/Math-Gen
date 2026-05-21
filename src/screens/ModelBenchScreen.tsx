import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Card, Chip, Divider, Eyebrow, Heading, Icon, Toggle, TopBar } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import {
  loadPdf,
  renderPageForAI,
  renderPageThumbnail,
} from "@app/lib/pdfProcessor";
import { cn } from "@app/lib/tailwind";
import { isGeminiAvailable } from "@app/services/ai/gemini";
import { isOpenAIAvailable } from "@app/services/ai/openai";
import {
  extractPageProblems,
  OCR_MODELS,
  type OCRModel,
  type OCRModelInfo,
} from "@app/services/ai/ocr";
import type { OCRProblem } from "@app/stores/wizardStore";

/**
 * Model comparison bench (URL gate `?bench`).
 *
 * Purpose: pick which model handles which kind of figure best. The user
 * drops a PDF, picks ONE page, selects the models they want to put
 * head-to-head, hits "Run" — every selected model runs against the same
 * page image in parallel, and the results render side-by-side in a
 * column-per-model grid.
 *
 * This is a development / curation tool — not part of the wizard flow.
 * State is local; nothing persists. Selection of which model becomes the
 * default for the real OCR path is a downstream decision the user makes
 * after inspecting bench output.
 */

interface PageInfo {
  pageNum: number;
  thumbnail: string;
  imageBase64: string;
  textLayer: string;
}

interface ModelRun {
  model: OCRModel;
  startedAt: number;
  /** Set once the call resolves. */
  durationMs?: number;
  /** Set on success. */
  items?: OCRProblem[];
  /** Friendly summary, set on failure. */
  error?: string;
  /** Original raw error text (Gemini's nested JSON proto, etc.) — toggleable. */
  errorDetail?: string;
}

/** localStorage key for the bench's model-selection persistence. */
const BENCH_SELECTION_KEY = "mathgen-bench-selection-v1";

const formatMs = (ms: number | undefined): string => {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
};

const formatCost = (band: number): string =>
  band < 1 ? `${band.toFixed(1)}× Sonnet` : `${band.toFixed(1)}× Sonnet`;

const Step = ({ n, label }: { n: number; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="grid place-items-center w-6 h-6 rounded-full bg-ink text-white font-mono font-bold text-[11px]">
      {n}
    </span>
    <span className="text-h3 text-text">{label}</span>
  </div>
);

const ModelCard = ({
  info,
  checked,
  disabled,
  onToggle,
}: {
  info: OCRModelInfo;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) => (
  <label
    className={cn(
      "flex items-start gap-3 p-3 rounded-r2 border transition-colors cursor-pointer",
      disabled
        ? "border-line bg-surface2 opacity-60 cursor-not-allowed"
        : checked
        ? "border-accent bg-accent-soft/40"
        : "border-line hover:border-line-strong",
    )}
  >
    <Toggle value={checked} onChange={onToggle} disabled={disabled} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-body font-semibold text-text">{info.label}</span>
        <Chip
          size="sm"
          tone={
            info.provider === "anthropic"
              ? "accent"
              : info.provider === "gemini"
              ? "ok"
              : "warn"
          }
        >
          {info.provider}
        </Chip>
        <span className="text-caption text-muted font-mono">
          {formatCost(info.costBand)}
        </span>
      </div>
      <div className="text-small text-text2 mt-1">{info.blurb}</div>
      <div className="text-caption text-muted font-mono mt-1">{info.id}</div>
    </div>
  </label>
);

export const ModelBenchScreen = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedModels, setSelectedModels] = useState<Set<OCRModel>>(() => {
    // Restore the last selection from localStorage so users don't have to
    // re-tick their preferred bench lineup on every reload.
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(BENCH_SELECTION_KEY);
        if (raw) {
          const arr = JSON.parse(raw) as string[];
          // Filter against the current OCR_MODELS registry so a stale entry
          // (model removed in a later release) doesn't crash extractPageProblems.
          const restored = new Set<OCRModel>(
            arr.filter((id): id is OCRModel => id in OCR_MODELS),
          );
          if (restored.size > 0) return restored;
        }
      } catch {
        // Corrupted JSON — fall through to defaults below.
      }
    }
    const initial = new Set<OCRModel>();
    initial.add("claude-sonnet-4-6");
    initial.add("claude-opus-4-7");
    if (isGeminiAvailable()) initial.add("gemini-2.5-pro");
    return initial;
  });

  // Persist the selection on every change. We stringify the Set as a
  // plain array — small payload, easy to inspect in DevTools.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        BENCH_SELECTION_KEY,
        JSON.stringify([...selectedModels]),
      );
    } catch {
      // Storage quota / private-mode — best-effort, ignore.
    }
  }, [selectedModels]);
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [running, setRunning] = useState(false);

  const allModels = useMemo(
    () => Object.values(OCR_MODELS).filter((m) => m.vision),
    [],
  );
  const anthropicModels = useMemo(
    () => allModels.filter((m) => m.provider === "anthropic"),
    [allModels],
  );
  const geminiModels = useMemo(
    () => allModels.filter((m) => m.provider === "gemini"),
    [allModels],
  );
  const openaiModels = useMemo(
    () => allModels.filter((m) => m.provider === "openai"),
    [allModels],
  );
  const geminiOn = isGeminiAvailable();
  const openaiOn = isOpenAIAvailable();

  const toggleModel = (id: OCRModel) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onPickFile = async (file: File) => {
    setLoadError(null);
    setLoading(true);
    setPages(null);
    setRuns([]);
    try {
      const pdf = await loadPdf(file);
      const max = Math.min(pdf.numPages, 10); // bench tool — cap at 10 pages
      const out: PageInfo[] = [];
      for (let p = 1; p <= max; p++) {
        const [{ imageBase64, textLayer }, thumbnail] = await Promise.all([
          renderPageForAI(pdf, p, 2.0),
          renderPageThumbnail(pdf, p),
        ]);
        out.push({ pageNum: p, thumbnail, imageBase64, textLayer });
      }
      setPages(out);
      setActiveIdx(0);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const runAll = async () => {
    if (!pages) return;
    const page = pages[activeIdx];
    if (!page) return;
    const models = Array.from(selectedModels);
    if (models.length === 0) return;

    const initialRuns: ModelRun[] = models.map((m) => ({
      model: m,
      startedAt: Date.now(),
    }));
    setRuns(initialRuns);
    setRunning(true);

    // Fire every model in parallel — bench is throw-away local work, so we
    // don't bother with a concurrency limit. The user controls how many
    // models they tick on.
    await Promise.all(
      models.map(async (model, i) => {
        const startedAt = initialRuns[i].startedAt;
        try {
          const { items } = await extractPageProblems({
            pageBase64: page.imageBase64,
            textLayer: page.textLayer,
            model,
          });
          setRuns((prev) =>
            prev.map((r) =>
              r.model === model
                ? { ...r, items, durationMs: Date.now() - startedAt }
                : r,
            ),
          );
        } catch (err) {
          const e = err as Error & { cause?: unknown };
          setRuns((prev) =>
            prev.map((r) =>
              r.model === model
                ? {
                    ...r,
                    error: e.message || "알 수 없는 오류",
                    errorDetail:
                      typeof e.cause === "string"
                        ? e.cause
                        : e.cause != null
                        ? String(e.cause)
                        : undefined,
                    durationMs: Date.now() - startedAt,
                  }
                : r,
            ),
          );
        }
      }),
    );

    setRunning(false);
  };

  const activePage = pages?.[activeIdx];

  return (
    <div className="w-full h-screen overflow-y-auto bg-bg text-text font-sans">
      <TopBar
        left={
          <>
            <Btn
              kind="ghost"
              size="sm"
              icon="x"
              onClick={() => {
                window.location.search = "";
              }}
              aria-label="종료"
            >
              종료
            </Btn>
            <Divider vertical className="h-[18px]" />
            <div className="flex items-center gap-2 text-body whitespace-nowrap">
              <span className="text-muted">모델 비교 벤치</span>
              <Chip tone="accent" size="sm">
                ?bench
              </Chip>
            </div>
          </>
        }
      />

      <div className="max-w-[2400px] mx-auto px-6 py-8 space-y-6">
        <Heading level="h1" sub="같은 페이지를 여러 모델로 동시에 OCR해 도형/표 렌더링 품질을 직접 비교합니다.">
          모델 비교
        </Heading>

        {/* Step 1: upload */}
        <section className="space-y-3">
          <Step n={1} label="PDF 업로드 (최대 10페이지까지 미리 렌더)" />
          <Card pad={20}>
            <div className="flex items-center gap-3">
              <Btn
                kind="accent"
                icon="folder-open"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
              >
                {loading ? "처리 중…" : "PDF 선택"}
              </Btn>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickFile(f);
                  e.target.value = "";
                }}
              />
              {pages && (
                <span className="text-small text-muted">
                  {pages.length}개 페이지 로드됨
                </span>
              )}
              {loadError && (
                <span className="text-small text-warn-ink bg-warn-soft px-2 py-1 rounded-r1">
                  {loadError}
                </span>
              )}
            </div>

            {pages && pages.length > 0 && (
              <div className="mt-4">
                <Eyebrow className="mb-2">페이지 선택</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {pages.map((p, i) => (
                    <button
                      key={p.pageNum}
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      className={cn(
                        "border-[1.5px] rounded-r1 bg-white p-1.5 transition-all",
                        i === activeIdx
                          ? "border-accent shadow-accent-glow"
                          : "border-line hover:border-line-strong",
                      )}
                      style={{ width: 72, height: 96 }}
                    >
                      <img
                        src={p.thumbnail}
                        alt={`p.${p.pageNum}`}
                        className="w-full h-full object-cover rounded-[2px]"
                      />
                      <span className="block text-[10px] font-mono text-muted text-center mt-1">
                        p.{p.pageNum}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* Step 2: model selection */}
        <section className="space-y-3">
          <Step n={2} label="비교할 모델 선택" />
          <Card pad={20}>
            {(!geminiOn || !openaiOn) && (
              <div className="mb-3 text-small text-muted bg-surface2 px-3 py-2 rounded-r1 space-y-1">
                {!geminiOn && (
                  <div>
                    Gemini 모델은 <code className="font-mono">.env.local</code>의{" "}
                    <code className="font-mono">GEMINI_API_KEY</code>가 설정돼 있을 때만 호출 가능합니다.
                  </div>
                )}
                {!openaiOn && (
                  <div>
                    GPT 모델은 <code className="font-mono">.env.local</code>의{" "}
                    <code className="font-mono">OPENAI_API_KEY</code>가 설정돼 있을 때만 호출 가능합니다.
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-3 gap-y-3">
              {/* Column 1 — Anthropic (Claude) */}
              <div className="space-y-2">
                <Eyebrow>Anthropic · Claude</Eyebrow>
                {anthropicModels.map((m) => (
                  <ModelCard
                    key={m.id}
                    info={m}
                    checked={selectedModels.has(m.id)}
                    disabled={false}
                    onToggle={() => toggleModel(m.id)}
                  />
                ))}
              </div>
              {/* Column 2 — Google Gemini */}
              <div className="space-y-2">
                <Eyebrow>Google · Gemini</Eyebrow>
                {geminiModels.map((m) => (
                  <ModelCard
                    key={m.id}
                    info={m}
                    checked={selectedModels.has(m.id) && geminiOn}
                    disabled={!geminiOn}
                    onToggle={() => geminiOn && toggleModel(m.id)}
                  />
                ))}
              </div>
              {/* Column 3 — OpenAI GPT */}
              <div className="space-y-2">
                <Eyebrow>OpenAI · GPT</Eyebrow>
                {openaiModels.map((m) => (
                  <ModelCard
                    key={m.id}
                    info={m}
                    checked={selectedModels.has(m.id) && openaiOn}
                    disabled={!openaiOn}
                    onToggle={() => openaiOn && toggleModel(m.id)}
                  />
                ))}
              </div>
            </div>
          </Card>
        </section>

        {/* Step 3: run + grid */}
        <section className="space-y-3">
          <Step n={3} label="실행 + 결과 비교" />
          <div className="flex items-center gap-3">
            <Btn
              kind="accent"
              icon="play"
              onClick={runAll}
              disabled={!activePage || selectedModels.size === 0 || running}
            >
              {running
                ? `실행 중… (${runs.filter((r) => r.durationMs != null).length} / ${runs.length})`
                : `${selectedModels.size}개 모델 동시 실행`}
            </Btn>
            {activePage && (
              <span className="text-small text-muted">
                활성 페이지: p.{activePage.pageNum}
              </span>
            )}
          </div>

          {runs.length > 0 && (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${runs.length}, minmax(380px, 1fr))`,
              }}
            >
              {runs.map((r) => {
                const info = OCR_MODELS[r.model];
                const status =
                  r.error != null
                    ? "error"
                    : r.durationMs == null
                    ? "pending"
                    : "done";
                return (
                  <Card key={r.model} pad={16} className="overflow-hidden">
                    <header className="flex items-center justify-between mb-3 pb-2 border-b border-line">
                      <div className="min-w-0">
                        <div className="text-h3 text-text truncate">{info.label}</div>
                        <div className="text-caption text-muted font-mono">{r.model}</div>
                      </div>
                      <div className="text-right">
                        {status === "pending" && (
                          <Chip tone="accent" size="sm" icon="circle-notch">
                            실행 중
                          </Chip>
                        )}
                        {status === "done" && (
                          <Chip tone="ok" size="sm">
                            {formatMs(r.durationMs)}
                          </Chip>
                        )}
                        {status === "error" && (
                          <Chip tone="danger" size="sm">
                            실패
                          </Chip>
                        )}
                      </div>
                    </header>

                    {r.error && (
                      <div className="text-small text-warn-ink bg-warn-soft p-2.5 rounded-r1 mb-2 break-words space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <Icon name="warning" size={13} weight="fill" color="#F59E0B" />
                          <span className="whitespace-pre-line">{r.error}</span>
                        </div>
                        {r.errorDetail && (
                          <details className="text-caption text-warn-ink/80">
                            <summary className="cursor-pointer hover:underline">원본 에러</summary>
                            <pre className="mt-1 max-h-40 overflow-auto bg-white/40 p-2 rounded text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all">
                              {r.errorDetail}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}

                    {r.items && r.items.length === 0 && (
                      <div className="text-small text-muted">추출된 문제 없음</div>
                    )}

                    {r.items && r.items.length > 0 && (
                      <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
                        {r.items.map((it) => (
                          <div key={it.id} className="border border-line rounded-r2 p-3">
                            <div className="flex items-center gap-2 mb-2 text-caption">
                              <span className="font-mono font-bold bg-ink text-white px-1.5 rounded">
                                {it.number}
                              </span>
                              {it.topic && (
                                <span className="text-muted">{it.topic}</span>
                              )}
                              <Chip
                                tone={it.status === "ok" ? "ok" : "warn"}
                                size="sm"
                                dot
                              >
                                {it.status === "ok" ? "확정" : "검토"}
                              </Chip>
                            </div>
                            <div className="text-body text-text">
                              <MarkdownRenderer content={it.text} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ModelBenchScreen;
