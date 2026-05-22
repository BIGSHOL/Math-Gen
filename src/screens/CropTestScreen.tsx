import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Card, Chip, Divider, Eyebrow, Heading, Segmented, TopBar } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { loadTests } from "@app/services/api/tests";
import { loadPagesByTest } from "@app/services/api/pages";
import { loadProblemsByTest } from "@app/services/api/problems";
import { getSignedUrl } from "@app/services/api/storage";
import {
  cropPageImageData,
  loadPdf,
  renderPageForAI,
  type PDFDocumentProxy,
} from "@app/lib/pdfProcessor";
import { detectCropBoxes, type DetectedCrop } from "@app/services/ai/cropDetect";
import { extractPageProblems } from "@app/services/ai/ocr";
import { GEMINI_3_FLASH } from "@app/services/ai/gemini";
import type { TestPaper } from "@app/types";
import type { PageRow, OcrProblemRow } from "@app/services/api/mappers";
import type { OCRProblem } from "@app/stores/wizardStore";

/**
 * 크롭 정확도 테스트 페이지 (URL gate `?croptest`).
 *
 * "cropped Pass 2" 사전 검증 도구 — 한 페이지에서 문항별 크롭 박스를 검출하고
 * (`detectCropBoxes`), 박스를 페이지 위에 overlay 해 정확도를 눈으로 측정한 뒤,
 * 잘라낸 이미지를 실제 재OCR (`extractPageProblems`) 해 기존 whole-page 결과와
 * 비교한다. 프로덕션 OCR 파이프라인은 건드리지 않는다.
 */

type Mode = "library" | "upload";

interface CropOcrState {
  status: "idle" | "running" | "done" | "error";
  items?: OCRProblem[];
  error?: string;
  ms?: number;
}

/** 박스별 overlay 색 — 인접 박스 구분용 cycle 팔레트. */
const PALETTE = ["#0EA5E9", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

/** signed URL / blob URL → base64 dataURL (imageRestore.ts 와 동일 패턴). */
const fetchAsDataUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader 실패"));
    reader.readAsDataURL(blob);
  });
};

/** cropBox(number[]) → 길이 4 튜플. 형식 이상이면 null. */
const asBox = (b: number[]): [number, number, number, number] | null =>
  b && b.length === 4 && b.every((n) => Number.isFinite(n))
    ? [b[0], b[1], b[2], b[3]]
    : null;

export const CropTestScreen = () => {
  const [mode, setMode] = useState<Mode>("library");

  // ── 보관함 모드 ──────────────────────────────────────────
  const [tests, setTests] = useState<TestPaper[]>([]);
  const [testId, setTestId] = useState<string>("");
  const [pages, setPages] = useState<PageRow[]>([]);
  const [baseline, setBaseline] = useState<OcrProblemRow[]>([]);

  // ── 업로드 모드 ──────────────────────────────────────────
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);

  // ── 공통 ────────────────────────────────────────────────
  const [pageIdx, setPageIdx] = useState(0); // 0-based
  const [pageBase64, setPageBase64] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [crops, setCrops] = useState<DetectedCrop[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectMs, setDetectMs] = useState<number | null>(null);
  const [cropOcr, setCropOcr] = useState<Record<number, CropOcrState>>({});

  // 보관함 시험지 목록 로드.
  useEffect(() => {
    void loadTests().then((rows) => {
      if (rows) setTests(rows);
      else setStatus("Supabase 비활성 — 보관함 모드를 쓸 수 없습니다. PDF 업로드를 쓰세요.");
    });
  }, []);

  // 검출/크롭 결과 초기화 — 새 페이지를 고를 때.
  const resetResults = () => {
    setCrops([]);
    setDetectMs(null);
    setCropOcr({});
  };

  // ── 보관함: 시험지 선택 → pages + baseline 로드 ───────────
  const onPickTest = async (id: string) => {
    setTestId(id);
    setPages([]);
    setBaseline([]);
    setPageBase64(null);
    resetResults();
    if (!id) return;
    setStatus("페이지 목록 로드 중…");
    const [pageRows, probRows] = await Promise.all([
      loadPagesByTest(id),
      loadProblemsByTest(id),
    ]);
    setPages(pageRows ?? []);
    setBaseline(probRows ?? []);
    setStatus(`${pageRows?.length ?? 0} 페이지`);
  };

  // ── 보관함: 페이지 선택 → signed URL → base64 ─────────────
  const onPickLibraryPage = async (idx: number) => {
    setPageIdx(idx);
    setPageBase64(null);
    resetResults();
    const row = pages[idx];
    if (!row?.image_storage_path) {
      setStatus("이 페이지는 Storage 이미지 경로가 없습니다.");
      return;
    }
    setLoadingPage(true);
    setStatus("페이지 이미지 다운로드 중…");
    try {
      const url = await getSignedUrl("page-images", row.image_storage_path, 3600);
      if (!url) throw new Error("signed URL 발급 실패");
      setPageBase64(await fetchAsDataUrl(url));
      setStatus(`p.${idx + 1} 로드 완료`);
    } catch (e) {
      setStatus(`페이지 로드 실패: ${(e as Error).message}`);
    } finally {
      setLoadingPage(false);
    }
  };

  // ── 업로드: PDF 선택 ─────────────────────────────────────
  const onPickPdf = async (file: File) => {
    setPageBase64(null);
    resetResults();
    setStatus("PDF 분석 중…");
    try {
      const pdf = await loadPdf(file);
      pdfRef.current = pdf;
      setPdfPageCount(pdf.numPages);
      setStatus(`${pdf.numPages} 페이지 — 페이지를 선택하세요.`);
    } catch (e) {
      setStatus(`PDF 로드 실패: ${(e as Error).message}`);
    }
  };

  // ── 업로드: 페이지 선택 → renderPageForAI → base64 ───────
  const onPickPdfPage = async (idx: number) => {
    setPageIdx(idx);
    setPageBase64(null);
    resetResults();
    const pdf = pdfRef.current;
    if (!pdf) return;
    setLoadingPage(true);
    setStatus("페이지 렌더링 중…");
    try {
      const { imageBase64 } = await renderPageForAI(pdf, idx + 1, 2.0);
      setPageBase64(imageBase64);
      setStatus(`p.${idx + 1} 렌더 완료`);
    } catch (e) {
      setStatus(`페이지 렌더 실패: ${(e as Error).message}`);
    } finally {
      setLoadingPage(false);
    }
  };

  // ── 크롭 검출 ────────────────────────────────────────────
  const runDetect = async () => {
    if (!pageBase64) return;
    setDetecting(true);
    resetResults();
    setStatus("크롭 검출 중 (Gemini)…");
    const t0 = performance.now();
    try {
      const result = await detectCropBoxes(pageBase64);
      setCrops(result);
      setDetectMs(Math.round(performance.now() - t0));
      setStatus(`크롭 ${result.length} 개 검출`);
    } catch (e) {
      setStatus(`검출 실패: ${(e as Error).message}`);
    } finally {
      setDetecting(false);
    }
  };

  // ── 크롭 1개 재OCR ───────────────────────────────────────
  const runCropOcr = async (idx: number) => {
    if (!pageBase64) return;
    const box = asBox(crops[idx]?.cropBox ?? []);
    if (!box) {
      setCropOcr((s) => ({ ...s, [idx]: { status: "error", error: "cropBox 형식 오류" } }));
      return;
    }
    setCropOcr((s) => ({ ...s, [idx]: { status: "running" } }));
    const t0 = performance.now();
    try {
      const cropDataUrl = await cropPageImageData(pageBase64, box, { margin: 0 });
      const { items } = await extractPageProblems({
        pageBase64: cropDataUrl,
        textLayer: "",
        model: GEMINI_3_FLASH,
      });
      setCropOcr((s) => ({
        ...s,
        [idx]: { status: "done", items, ms: Math.round(performance.now() - t0) },
      }));
    } catch (e) {
      setCropOcr((s) => ({
        ...s,
        [idx]: { status: "error", error: (e as Error).message },
      }));
    }
  };

  // ── 전체 크롭 재OCR (순차 — 명시 트리거만) ────────────────
  const runAllCropOcr = async () => {
    for (let i = 0; i < crops.length; i++) {
      // 이미 done 인 건 건너뜀.
      if (cropOcr[i]?.status === "done") continue;
      await runCropOcr(i);
    }
  };

  const cropImages = useMemo(() => {
    // 크롭 미리보기 dataURL — crops 가 바뀔 때만 재계산은 컴포넌트에서 lazy.
    return crops;
  }, [crops]);

  return (
    <div className="w-full h-screen overflow-hidden bg-bg text-text font-sans flex flex-col">
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
            >
              종료
            </Btn>
            <Divider vertical className="h-[18px]" />
            <span className="text-body">
              크롭 정확도 테스트
              <Chip tone="accent" size="sm" className="ml-2">
                ?croptest
              </Chip>
            </span>
          </>
        }
      />

      <div className="flex-1 overflow-hidden flex">
        {/* ── 왼쪽: 입력 + 페이지 + 오버레이 ───────────────── */}
        <div className="w-[46%] flex-shrink-0 overflow-y-auto border-r border-line p-5 space-y-4">
          <Heading level="h2" sub="문항별 크롭 박스를 검출해 페이지에 겹쳐 본다.">
            입력
          </Heading>

          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m as Mode);
              setPageBase64(null);
              resetResults();
            }}
            options={[
              { value: "library", label: "보관함", icon: "books" },
              { value: "upload", label: "PDF 업로드", icon: "upload-simple" },
            ]}
          />

          {mode === "library" && (
            <div className="space-y-2">
              <Eyebrow>시험지</Eyebrow>
              <select
                value={testId}
                onChange={(e) => void onPickTest(e.target.value)}
                className="w-full h-9 px-2 rounded-r1 border border-line bg-surface text-small"
              >
                <option value="">— 시험지 선택 ({tests.length}) —</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {t.time}
                  </option>
                ))}
              </select>
              {pages.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pages.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void onPickLibraryPage(i)}
                      className={
                        "px-2.5 h-7 rounded-r1 border text-caption font-mono " +
                        (pageIdx === i && pageBase64
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-surface text-text2 hover:border-accent")
                      }
                    >
                      p.{i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "upload" && (
            <div className="space-y-2">
              <Eyebrow>PDF 파일</Eyebrow>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickPdf(f);
                  e.target.value = "";
                }}
                className="block w-full text-small"
              />
              {pdfPageCount > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: pdfPageCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => void onPickPdfPage(i)}
                      className={
                        "px-2.5 h-7 rounded-r1 border text-caption font-mono " +
                        (pageIdx === i && pageBase64
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-surface text-text2 hover:border-accent")
                      }
                    >
                      p.{i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Btn
              kind="accent"
              icon="crop"
              onClick={() => void runDetect()}
              disabled={!pageBase64 || detecting || loadingPage}
            >
              {detecting ? "검출 중…" : "크롭 검출 실행"}
            </Btn>
            {detectMs != null && (
              <Chip tone="soft" size="sm">
                {detectMs} ms · {crops.length} 박스
              </Chip>
            )}
          </div>

          {status && <div className="text-caption text-muted">{status}</div>}

          {/* 페이지 + 오버레이 */}
          {pageBase64 && (
            <Card pad={8} className="bg-white">
              <div className="relative w-full">
                <img src={pageBase64} alt="page" className="w-full block" />
                {crops.map((c, i) => {
                  const box = asBox(c.cropBox);
                  if (!box) return null;
                  const [yMin, xMin, yMax, xMax] = box;
                  const color = PALETTE[i % PALETTE.length];
                  return (
                    <div
                      key={i}
                      className="absolute pointer-events-none"
                      style={{
                        top: `${yMin / 10}%`,
                        left: `${xMin / 10}%`,
                        width: `${(xMax - xMin) / 10}%`,
                        height: `${(yMax - yMin) / 10}%`,
                        border: `2px solid ${color}`,
                        boxShadow: "0 0 0 1px rgba(255,255,255,0.6)",
                      }}
                    >
                      <span
                        className="absolute -top-[1px] left-0 px-1 text-[9px] font-mono font-bold text-white leading-[14px]"
                        style={{ background: color }}
                      >
                        #{c.number} {c.type === "choice" ? "객" : "서"}·{c.endMarkerKind}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* ── 오른쪽: 크롭별 결과 + 재OCR ──────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Heading level="h2" sub="잘라낸 이미지를 재OCR 해 기존 결과와 비교.">
              크롭 결과
            </Heading>
            {crops.length > 0 && (
              <Btn kind="ghost" size="sm" icon="play" onClick={() => void runAllCropOcr()}>
                전체 크롭 OCR
              </Btn>
            )}
          </div>

          {crops.length === 0 && (
            <div className="text-caption text-muted">
              페이지를 고르고 "크롭 검출 실행" 을 누르세요.
            </div>
          )}

          {cropImages.map((c, i) => {
            const box = asBox(c.cropBox);
            const color = PALETTE[i % PALETTE.length];
            const ocr = cropOcr[i];
            const base = baseline.find((b) => b.problem_number === c.number);
            return (
              <Card key={i} pad={12} className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ background: color }}
                  />
                  <span className="font-semibold text-small">#{c.number}</span>
                  <Chip tone={c.type === "choice" ? "accent" : "soft"} size="sm">
                    {c.type === "choice" ? "객관식" : "서술형"}
                  </Chip>
                  <Chip tone="neutral" size="sm">
                    끝: {c.endMarkerKind}
                  </Chip>
                  <span className="text-caption text-muted">{c.note}</span>
                </div>

                {box && (
                  <CropPreview pageBase64={pageBase64} box={box} />
                )}

                <div className="flex items-center gap-2">
                  <Btn
                    kind="secondary"
                    size="sm"
                    icon="scan"
                    onClick={() => void runCropOcr(i)}
                    disabled={ocr?.status === "running"}
                  >
                    {ocr?.status === "running" ? "OCR 중…" : "이 크롭 OCR"}
                  </Btn>
                  {ocr?.status === "done" && ocr.ms != null && (
                    <Chip tone="soft" size="sm">
                      {ocr.ms} ms
                    </Chip>
                  )}
                </div>

                {ocr?.status === "error" && (
                  <div className="text-caption text-danger">{ocr.error}</div>
                )}

                {ocr?.status === "done" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Eyebrow>크롭 재OCR</Eyebrow>
                      <div className="border border-line rounded-r1 p-2 bg-white text-small">
                        {(ocr.items ?? []).map((it, j) => (
                          <MarkdownRenderer key={j} content={it.text} />
                        ))}
                        {(ocr.items ?? []).length === 0 && (
                          <span className="text-muted text-caption">결과 없음</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Eyebrow>기존 whole-page</Eyebrow>
                      <div className="border border-line rounded-r1 p-2 bg-surface2 text-small">
                        {base ? (
                          <MarkdownRenderer content={base.text} />
                        ) : (
                          <span className="text-muted text-caption">
                            {mode === "library" ? "매칭되는 기존 결과 없음" : "업로드 모드 — 비교 대상 없음"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** 크롭 미리보기 — base64 + box 로 잘라낸 이미지를 lazy 렌더. */
const CropPreview = ({
  pageBase64,
  box,
}: {
  pageBase64: string | null;
  box: [number, number, number, number];
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const key = `${pageBase64?.length}:${box.join(",")}`;
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    if (!pageBase64) return;
    void cropPageImageData(pageBase64, box, { margin: 0 })
      .then((d) => {
        if (!cancelled) setSrc(d);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return src ? (
    <img
      src={src}
      alt="crop"
      className="max-h-[220px] w-auto border border-line rounded-r1 bg-white"
    />
  ) : (
    <div className="h-16 bg-surface2 rounded-r1 animate-pulse" />
  );
};

export default CropTestScreen;
