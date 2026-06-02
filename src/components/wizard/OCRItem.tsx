import { useEffect, useMemo, useState } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import MarkdownRenderer, {
  type DiagramSvgItem,
} from "@app/components/math/MarkdownRenderer";
import { modelShortName } from "@app/lib/modelLabel";
import { cropPageImageData } from "@app/lib/pdfProcessor";
import {
  logDiagramIssues,
  renderDiagram,
  validateDiagramParams,
} from "@app/lib/diagram";
import {
  useWizardStore,
  type OCRProblem,
  type OCRImage,
} from "@app/stores/wizardStore";
import { cn } from "@app/lib/tailwind";
import { OcrFeedbackPanel } from "./OcrFeedbackPanel";
import { DiagramFallbackPanel } from "./DiagramFallbackPanel";

/**
 * Step 2 — a single extracted problem card.
 *
 * Two render modes, toggled by the edit (pencil) button:
 *   1. **read**  — number badge, status chip, topic chip, MarkdownRenderer body
 *      (KaTeX + diagram-aware). Warn-status cards get a left border accent
 *      and a hint banner.
 *   2. **edit**  — number/topic as `<input>` fields, body as a side-by-side
 *      `<textarea>` + live `<MarkdownRenderer>` preview. Save promotes the
 *      item to `status="ok"` and `reviewed=true` regardless of the previous
 *      confidence band (the user just looked at it).
 *
 * Persistence is via `useWizardStore.updateOCRItem` — already in the store.
 */
export interface OCRItemProps {
  pageId: string;
  item: OCRProblem;
  /** Hi-res base64 dataURL of the page this item belongs to — we crop diagrams from it on mount. */
  pageImageDataUrl?: string | null;
  /**
   * Hide the edit (pencil) button and ignore any state that would shift the
   * card into edit mode. Used by Step 3 (해설·정답) where the original
   * problem cards appear in the center pane for *reference only* — editing
   * still happens in Step 2 (OCR).
   */
  readonly?: boolean;
  /**
   * Phase #6 — Supabase test row id. OcrFeedbackPanel 에 전달돼 ocr_feedback
   * row 의 test_id 컬럼 채움. 로그인 + persisted test (Supabase 에 저장된)
   * 일 때만 의미 있음. null/undefined 면 피드백 패널 숨김.
   */
  testId?: string | null;
}

/**
 * Crops every `item.images` bbox out of the cached page dataURL.
 *
 * The page image lives in IndexedDB (Step 1 hi-res render). We hit it once
 * per OCRItem (passed in from Step2OCRReview, which already does the
 * IndexedDB round-trip for its center pane), then run synchronous Canvas
 * crops — no extra storage or async storage hits per diagram.
 *
 * If a crop fails (degenerate bbox, model hallucination), we silently drop
 * that image rather than tank the card render — the user can edit and add
 * the figure manually.
 */
/**
 * 본문에 `[그림N]` 마커 존재 여부 — DiagramFallbackPanel 표시 트리거.
 * 도형이 없거나 사용자 편집 후에도 마커는 본문에 남아 있을 수 있음.
 */
const hasMarker = (t: string | undefined): boolean =>
  !!t && /\[그림\d+\]/.test(t);

/**
 * Phase #12/#13: source 별 분기 — 재크롭 비용 회피.
 *  - "user-crop": dataUrl 그대로 (사용자가 이미 크롭 — 재크롭 불필요)
 *  - "ai-gen":    url 그대로 (DALL-E 영구 URL — 재크롭 X)
 *  - else (ai-crop default): cropPageImageData 호출 — 기존 동작
 */
interface DisplayCrop {
  src: string;
  label: string;
  source: "ai-crop" | "user-crop" | "ai-gen";
  originalImage: OCRImage;
}

const useCroppedImages = (
  images: OCRProblem["images"],
  pageImageDataUrl: string | null | undefined,
): DisplayCrop[] => {
  const [crops, setCrops] = useState<DisplayCrop[]>([]);
  // Stable cache key — re-cropping is expensive (canvas + paint) and
  // unnecessary when only sibling state changes. 신규 필드 (source/url/dataUrl)
  // 도 변경 시 재계산 트리거.
  const bboxKey = useMemo(
    () =>
      JSON.stringify(
        images?.map((i) => ({
          box: i.box,
          source: i.source,
          url: i.url,
          hasDataUrl: !!i.dataUrl,
        })) ?? [],
      ),
    [images],
  );

  useEffect(() => {
    if (!images || images.length === 0) {
      setCrops([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const out: DisplayCrop[] = [];
      for (const im of images) {
        const source: DisplayCrop["source"] = im.source ?? "ai-crop";
        try {
          if (source === "user-crop" && im.dataUrl) {
            out.push({ src: im.dataUrl, label: im.label, source, originalImage: im });
          } else if (source === "ai-gen" && im.url) {
            out.push({ src: im.url, label: im.label, source, originalImage: im });
          } else if (pageImageDataUrl) {
            // ai-crop (default) — bbox 기반 cropPageImageData
            const dataUrl = await cropPageImageData(pageImageDataUrl, im.box, {
              margin: 0.04,
            });
            out.push({ src: dataUrl, label: im.label, source: "ai-crop", originalImage: im });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[OCRItem] diagram crop skipped:", (err as Error).message);
        }
      }
      if (!cancelled) setCrops(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageImageDataUrl, bboxKey]);

  return crops;
};

const StatusChip = ({ status, reviewed }: { status: OCRProblem["status"]; reviewed: boolean }) => {
  if (reviewed) {
    return (
      <Chip tone="ok" size="sm" dot>
        검토됨
      </Chip>
    );
  }
  if (status === "warn") {
    return (
      <Chip tone="warn" size="sm" dot>
        인식 검토
      </Chip>
    );
  }
  return (
    <Chip tone="ok" size="sm" dot>
      확정
    </Chip>
  );
};

export const OCRItem = ({ pageId, item, pageImageDataUrl, readonly, testId }: OCRItemProps) => {
  const updateOCRItem = useWizardStore((s) => s.updateOCRItem);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(item.text);
  const [draftNumber, setDraftNumber] = useState(String(item.number));
  const [draftTopic, setDraftTopic] = useState(item.topic ?? "");

  // Phase #12/#13: "원본 보기" toggle — true 일 때 사용자 크롭 / AI 생성 무시,
  // 원본 (ai-crop bbox) 만 표시. DiagramFallbackPanel 이 setShowOriginal 호출.
  const [showOriginal, setShowOriginal] = useState(false);

  const crops = useCroppedImages(item.images, pageImageDataUrl);

  // 사용자 결정 (2026-05-27): 본문에 [그림N] 마커가 있는데 SVG 가 채우지 못하는
  // 경우, 크롭 이미지를 inline 으로 본문에 inject (하단 중복 표시 차단).
  // inlinedImageIndices = MarkdownRenderer 가 inline 처리할 image idx 들.
  const inlinedImageIndices = useMemo(() => {
    const set = new Set<number>();
    if (!item.text || !item.images) return set;
    const matches = item.text.matchAll(/\[그림(\d+)\]/g);
    for (const m of matches) {
      const n = parseInt(m[1], 10);
      if (!Number.isFinite(n) || n < 1) continue;
      const idx = n - 1;
      if (idx >= item.images.length) continue;
      // SVG 가 채우는 idx 는 inline 이미지 X (SVG 가 우선)
      set.add(idx);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.text, item.images?.length]);

  // Phase F: vector 도형 spec 이 있으면 renderDiagram → MarkdownRenderer 의
  // [그림N] 치환에 사용. bbox crop fallback (crops) 보다 우선.
  const vectorDiagrams = useMemo<DiagramSvgItem[] | undefined>(() => {
    const params = item.diagramParams;
    if (!params?.length) return undefined;
    const issues = validateDiagramParams(params);
    logDiagramIssues(`OCRItem ${pageId}/Q${item.number}`, issues);
    // *Error severity* 가 있는 top-level element 는 skip — 빈 SVG push 방지.
    // 모든 element 가 invalid 면 items.length=0 → undefined → bbox crop fallback.
    const errorIndices = new Set(
      issues
        .filter((iss) => iss.severity === "error")
        .map((iss) => iss.index.split(".")[0]),
    );
    const items: DiagramSvgItem[] = [];
    for (let i = 0; i < params.length; i++) {
      if (errorIndices.has(String(i))) continue;
      try {
        items.push({ svg: renderDiagram(params[i]), label: `도형${i + 1}` });
      } catch (err) {
        console.warn(`[OCRItem] renderDiagram ${i} failed:`, (err as Error).message);
      }
    }
    return items.length > 0 ? items : undefined;
  }, [item.diagramParams, item.number, pageId]);

  const startEdit = () => {
    setDraftText(item.text);
    setDraftNumber(String(item.number));
    setDraftTopic(item.topic ?? "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = () => {
    const numParsed = Number.parseInt(draftNumber, 10);
    updateOCRItem(pageId, item.id, {
      text: draftText,
      number: Number.isFinite(numParsed) ? numParsed : item.number,
      topic: draftTopic.trim() || undefined,
      status: "ok",
      reviewed: true,
    });
    setEditing(false);
  };

  const isWarn = item.status === "warn" && !item.reviewed;

  return (
    <Card
      pad={14}
      className={cn(
        "relative transition-all",
        isWarn && "border-warn ring-1 ring-warn/10",
      )}
    >
      <div className="flex items-center gap-2 mb-2.5">
        {editing ? (
          <input
            type="number"
            value={draftNumber}
            onChange={(e) => setDraftNumber(e.target.value)}
            className="w-14 h-6 px-1.5 rounded-r1 border border-line-strong bg-surface2 text-[12px] font-mono font-bold text-center focus:outline-none focus:border-accent focus:shadow-accent-glow"
            aria-label="문제 번호"
          />
        ) : (
          <span
            className="grid place-items-center bg-ink text-white rounded-r1 font-mono font-bold"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {item.number}
          </span>
        )}

        <StatusChip status={item.status} reviewed={item.reviewed} />

        {/* 문항별 OCR 모델 chip — 사용자 요청 (task #99). 같은 페이지 내
            모든 item 은 기본적으로 동일하지만, task #41 (item 별 재실행)
            도입 시 item 마다 다를 수 있음. wrapper span 의 native title
            attribute 로 full 모델 id tooltip. */}
        {item.ocrModel && (
          <span title={`OCR: ${item.ocrModel}`}>
            <Chip tone="soft" size="sm">
              {modelShortName(item.ocrModel)}
            </Chip>
          </span>
        )}

        {editing ? (
          <input
            type="text"
            value={draftTopic}
            onChange={(e) => setDraftTopic(e.target.value)}
            placeholder="토픽 (예: 이차함수)"
            className="h-6 px-2 rounded-r1 border border-line-strong bg-surface text-[11.5px] focus:outline-none focus:border-accent focus:shadow-accent-glow min-w-0 flex-1 max-w-[180px]"
            aria-label="토픽"
          />
        ) : item.topic ? (
          <Chip size="sm">{item.topic}</Chip>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {/* Phase #6 — 좋아요/싫어요 (편집 중 / readonly 가 아니고 testId 있을 때만) */}
          {!editing && !readonly && testId && (
            <OcrFeedbackPanel
              ocrProblemId={item.id}
              testId={testId}
              compact
            />
          )}
          {readonly ? null : editing ? (
            <>
              <Btn kind="ghost" size="sm" icon="x" onClick={cancelEdit}>
                취소
              </Btn>
              <Btn kind="accent" size="sm" icon="check" onClick={saveEdit}>
                저장
              </Btn>
            </>
          ) : (
            <Btn
              kind="ghost"
              size="sm"
              icon="pencil-simple"
              onClick={startEdit}
              aria-label="문제 편집"
            />
          )}
        </div>
      </div>

      {editing ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            className="min-h-[140px] px-3 py-2 rounded-r2 border border-line-strong bg-surface text-body font-mono leading-relaxed resize-y focus:outline-none focus:border-accent focus:shadow-accent-glow"
            spellCheck={false}
            aria-label="문제 본문 (Markdown + LaTeX)"
          />
          <div className="min-h-[140px] px-3 py-2 rounded-r2 border border-line bg-surface2 overflow-auto">
            <MarkdownRenderer content={draftText} />
          </div>
        </div>
      ) : (
        <div className="text-body text-text">
          {item.bodyMissing && (
            <div className="mb-2 px-3 py-2 rounded-r2 border border-warn bg-warn-soft text-warnInk text-small flex items-start gap-2">
              <Icon name="warning" weight="fill" className="mt-0.5 flex-none" />
              <div>
                <div className="font-semibold">본문 누락 — 모델이 보기만 추출했습니다.</div>
                <div className="text-muted text-caption mt-0.5">
                  편집 버튼으로 본문을 직접 입력하거나, 페이지 재인식을 눌러 다시 시도하세요.
                </div>
              </div>
            </div>
          )}
          {item.choicesMissing && !item.bodyMissing && (
            <div className="mb-2 px-3 py-2 rounded-r2 border border-warn bg-warn-soft text-warnInk text-small flex items-start gap-2">
              <Icon name="warning" weight="fill" className="mt-0.5 flex-none" />
              <div>
                <div className="font-semibold">보기 누락 — 객관식 발문인데 ①②③④⑤ 보기가 없습니다.</div>
                <div className="text-muted text-caption mt-0.5">
                  편집 버튼으로 보기를 직접 추가하거나, 페이지 재인식을 눌러 다시 시도하세요.
                </div>
              </div>
            </div>
          )}
          <MarkdownRenderer
            content={item.text}
            diagramSvgs={vectorDiagrams}
            imageCrops={crops.map((c) => ({
              src: c.src,
              label: c.label,
              // 위치 기반 행 배치(Stage 1c)용 — 원본 페이지 box. 이미 존재(신규 저장 X).
              box: c.originalImage.box,
            }))}
            // Phase B — 모든 figure(크롭+inline svg) box. 있으면 inline svg 도형도
            // 위치 획득(reading-order 매칭). 없으면 위 imageCrops box 만으로 동작.
            figures={item.figures}
            choicesLayout={item.choicesLayout}
          />
        </div>
      )}

      {/* 도형 표시 — Phase #12/#13 우선순위 (사용자 결정 2026-05-27 — inline 우선):
          (a) 사용자가 "원본 보기" toggle off (default) + source="ai-gen" 있으면 ai-gen 만
          (b) showOriginal=false + source="user-crop" 있으면 user-crop 만
          (c) else: bbox crop (source="ai-crop") 표시 — 단, [그림N] 으로 inline
              표시된 idx 는 dedup 으로 제외 (아래 displayCrops).
          ※ 사용자 보고 2026-06-02: vectorDiagrams (예: 작도 도형 SVG) 가 있을 때
            *그것과 별개로 크롭된 이미지* (예: 반 고흐 작품 thumbnail — [그림N]
            마커 없이 "[고흐...]" 캡션만) 가 통째로 숨겨졌음. 기존 `vectorDiagrams
            ? [] : ...` 가 vectorDiagram 하나라도 있으면 *모든* ai-crop 을 suppress.
            inline 된 idx 는 어차피 아래 dedup 이 제거하므로 blanket suppress 제거 →
            inline 안 된 ai-crop (작품 등) 은 standalone 으로 표시. */}
      {!editing && (() => {
        const allDisplay = showOriginal
          ? crops.filter((c) => c.source === "ai-crop")
          : (() => {
              const aiGen = crops.filter((c) => c.source === "ai-gen");
              if (aiGen.length > 0) return aiGen;
              const userCrop = crops.filter((c) => c.source === "user-crop");
              if (userCrop.length > 0) return userCrop;
              // vectorDiagram 유무와 무관하게 ai-crop 후보로 — inline 중복은
              // 아래 inlinedImageIndices dedup 이 제거. (SVG 로 inline 된 도형의
              // bbox fallback 은 그 idx 가 [그림N] 에 잡혀 dedup 됨.)
              return crops.filter((c) => c.source === "ai-crop");
            })();
        // 본문에 [그림N] 마커로 inline 표시된 idx 는 하단 표시 X (중복 차단)
        const displayCrops = allDisplay.filter((c) => {
          const originalIdx = crops.indexOf(c);
          return !inlinedImageIndices.has(originalIdx);
        });
        if (displayCrops.length === 0) return null;
        return (
          <div className="mt-3 flex flex-wrap gap-3">
            {displayCrops.map((c, i) => (
              <figure
                key={i}
                className={cn(
                  "border rounded-r2 bg-white p-2 max-w-[280px]",
                  c.source === "ai-gen"
                    ? "border-accent/40 ring-1 ring-accent/20"
                    : c.source === "user-crop"
                      ? "border-ok/40 ring-1 ring-ok/20"
                      : "border-line",
                )}
              >
                <img
                  src={c.src}
                  alt={c.label || `도형 ${i + 1}`}
                  className="max-w-full h-auto block"
                />
                {(c.label || c.source !== "ai-crop") && (
                  <figcaption className="mt-1.5 text-caption text-muted text-center flex items-center justify-center gap-1">
                    {c.source === "ai-gen" && (
                      <Chip size="sm" tone="accent">
                        <Icon name="sparkle" size={9} className="inline-block mr-0.5" />
                        AI 생성
                      </Chip>
                    )}
                    {c.source === "user-crop" && (
                      <Chip size="sm" tone="ok">
                        <Icon name="crop" size={9} className="inline-block mr-0.5" />
                        사용자 크롭
                      </Chip>
                    )}
                    {c.label && <span>{c.label}</span>}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        );
      })()}

      {/* DiagramFallbackPanel — 도형 액션 toolbar (박스 편집 / AI 생성 / 원본 toggle) */}
      {!editing && !readonly && (item.images || hasMarker(item.text)) && (
        <DiagramFallbackPanel
          item={item}
          pageImageDataUrl={pageImageDataUrl ?? null}
          testId={testId ?? null}
          hasValidVector={!!vectorDiagrams}
          showOriginal={showOriginal}
          onToggleOriginal={setShowOriginal}
          onUpdateImages={(next) =>
            updateOCRItem(pageId, item.id, { images: next })
          }
        />
      )}

      {isWarn && !editing && (
        <div className="mt-2.5 px-2.5 py-2 rounded-r1 bg-warn-soft text-warn-ink flex items-center gap-1.5 text-small">
          <Icon name="warning" size={13} weight="fill" color="#F59E0B" />
          <span>인식 신뢰도가 낮습니다. 편집 버튼을 눌러 확인해 주세요.</span>
        </div>
      )}
    </Card>
  );
};

export default OCRItem;
