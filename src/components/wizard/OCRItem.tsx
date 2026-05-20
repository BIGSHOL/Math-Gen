import { useEffect, useMemo, useState } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { cropPageImageData } from "@app/lib/pdfProcessor";
import { useWizardStore, type OCRProblem } from "@app/stores/wizardStore";
import { cn } from "@app/lib/tailwind";

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
const useCroppedImages = (
  images: OCRProblem["images"],
  pageImageDataUrl: string | null | undefined,
): Array<{ dataUrl: string; label: string }> => {
  const [crops, setCrops] = useState<Array<{ dataUrl: string; label: string }>>([]);
  // Stable cache key — re-cropping is expensive (canvas + paint) and
  // unnecessary when only sibling state changes.
  const bboxKey = useMemo(
    () => JSON.stringify(images?.map((i) => i.box) ?? []),
    [images],
  );

  useEffect(() => {
    if (!pageImageDataUrl || !images || images.length === 0) {
      setCrops([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const out: Array<{ dataUrl: string; label: string }> = [];
      for (const im of images) {
        try {
          const dataUrl = await cropPageImageData(pageImageDataUrl, im.box, { margin: 0.04 });
          out.push({ dataUrl, label: im.label });
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

export const OCRItem = ({ pageId, item, pageImageDataUrl, readonly }: OCRItemProps) => {
  const updateOCRItem = useWizardStore((s) => s.updateOCRItem);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(item.text);
  const [draftNumber, setDraftNumber] = useState(String(item.number));
  const [draftTopic, setDraftTopic] = useState(item.topic ?? "");

  const crops = useCroppedImages(item.images, pageImageDataUrl);

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
                  편집 버튼으로 본문을 직접 입력하거나, 페이지 재인식 (더 강한 모델 권장: Gemini 3.5 Flash / 3.1 Pro / Claude Sonnet) 을 사용하세요.
                </div>
              </div>
            </div>
          )}
          <MarkdownRenderer content={item.text} />
        </div>
      )}

      {crops.length > 0 && !editing && (
        <div className="mt-3 flex flex-wrap gap-3">
          {crops.map((c, i) => (
            <figure key={i} className="border border-line rounded-r2 bg-white p-2 max-w-[280px]">
              <img
                src={c.dataUrl}
                alt={c.label || `도형 ${i + 1}`}
                className="max-w-full h-auto block"
              />
              {c.label && (
                <figcaption className="mt-1.5 text-caption text-muted text-center">
                  {c.label}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
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
