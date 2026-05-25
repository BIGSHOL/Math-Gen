import { useEffect, useState } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import { getPageImage } from "@app/lib/imageStore";
import { ensurePageImage } from "@app/lib/imageRestore";
import { applyRotation } from "@app/lib/pdfProcessor";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import { usePageOcr } from "@app/hooks/usePageOcr";
import { useWizardStore, type WizardPage } from "@app/stores/wizardStore";
import OCRItem from "./OCRItem";
import PageThumbColumn from "./PageThumbColumn";

/**
 * Step 2 — page-level OCR review screen.
 *
 * Layout (hifi/wizard.jsx::WizStep2HF):
 *   [ 92px thumb column ] [ flex-1 original scan ] [ flex-1.1 OCR results ]
 *
 * The orchestration hook (`usePageOcr`) is mounted here; it dispatches a
 * page-level Anthropic call for each not-yet-resolved page with `pLimit(2)`
 * concurrency. Skipped pages (`isProblemPage===false` and not `forceOcr`)
 * resolve instantly as empty results — surfaced as a "스킵" banner with an
 * escape hatch to force OCR (reviewer note #4).
 */
/**
 * Load a page's hi-res dataURL from IndexedDB and pre-rotate it so the
 * `<img>` can just bind `src` — no CSS `transform: rotate(...)` which
 * leaves the box layout in its pre-rotation aspect and produces the
 * "container is still landscape, content is portrait" footgun (user
 * reported). Caller treats `null` as "still loading or missing".
 */
const usePageImageDataUrl = (page: WizardPage | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  const pageId = page?.id;
  const imageRef = page?.imageRef;
  const rotation = page?.rotation ?? 0;

  useEffect(() => {
    if (!pageId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      // Step 1: IndexedDB lookup (fast path — 같은 device 의 dev 시점).
      let dataUrl: string | null = null;
      if (imageRef) {
        const img = await getPageImage(imageRef);
        if (img) dataUrl = img.dataUrl;
      }
      // Step 2: IndexedDB 미스 — Storage 에서 복원 (다른 device / 시크릿 모드 /
      // hydrate "이어서 작업" 시점에 imageRef 가 "" 또는 캐시 없는 경우).
      if (!dataUrl && page) {
        const storagePath = getPageStoragePath(pageId);
        if (storagePath) {
          const restored = await ensurePageImage(page, storagePath);
          if (restored) dataUrl = restored.dataUrl;
        }
      }
      if (cancelled) return;
      if (!dataUrl) {
        setUrl(null);
        return;
      }
      if (rotation === 0) {
        setUrl(dataUrl);
        return;
      }
      try {
        const rotated = await applyRotation(dataUrl, rotation);
        if (!cancelled) setUrl(rotated);
      } catch {
        // Fall back to the un-rotated original — better than blank.
        if (!cancelled) setUrl(dataUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, imageRef, rotation, page]);

  return url;
};

const SkipBanner = ({ onForceOcr }: { onForceOcr: () => void }) => (
  <Card pad={16} className="bg-surface2 border-dashed">
    <div className="flex items-start gap-3">
      <div
        className="grid place-items-center text-muted flex-shrink-0"
        style={{ width: 36, height: 36, borderRadius: 8, background: "#EAECF0" }}
      >
        <Icon name="file-x" size={18} weight="duotone" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-h3 text-text">스킵된 페이지</div>
        <p className="mt-1 text-small text-muted">
          PDF 텍스트 분석 결과 표지·차례·정답 등 비-문제 페이지로 판단되어 자동 스킵되었습니다.
          잘못 분류된 것 같다면 강제 OCR을 수행할 수 있습니다.
        </p>
        <div className="mt-3">
          <Btn kind="accent" size="sm" icon="scan" onClick={onForceOcr}>
            이 페이지도 OCR 수행
          </Btn>
        </div>
      </div>
    </div>
  </Card>
);

const ErrorBanner = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Card pad={16} className="border-warn bg-warn-soft">
    <div className="flex items-start gap-3">
      <Icon name="warning" size={18} weight="fill" color="#F59E0B" />
      <div className="flex-1 min-w-0">
        <div className="text-h3 text-warn-ink">OCR 실패</div>
        <p className="mt-1 text-small text-warn-ink break-words">{message}</p>
        <div className="mt-3">
          <Btn kind="accent" size="sm" icon="arrow-clockwise" onClick={onRetry}>
            다시 시도
          </Btn>
        </div>
      </div>
    </div>
  </Card>
);

const PendingSkeletons = () => (
  <>
    {[0, 1, 2].map((i) => (
      <Card key={i} pad={14}>
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-6 h-6 rounded-r1 bg-surface3 animate-pulse" />
          <div className="w-16 h-4 rounded-full bg-surface3 animate-pulse" />
          <div className="w-20 h-4 rounded-full bg-surface3 animate-pulse" />
        </div>
        <div className="h-3 rounded bg-surface3 animate-pulse mb-1.5" />
        <div className="h-3 rounded bg-surface3 animate-pulse w-[80%] mb-1.5" />
        <div className="h-3 rounded bg-surface3 animate-pulse w-[60%]" />
      </Card>
    ))}
  </>
);

export const Step2OCRReview = () => {
  const pages = useWizardStore((s) => s.pages);
  const activeIdx = useWizardStore((s) => s.activePageIndex);
  const setPageOCR = useWizardStore((s) => s.setPageOCR);

  const { resetDispatch } = usePageOcr();

  const activePage = pages[activeIdx];
  const pageImage = usePageImageDataUrl(activePage);

  const setActiveIdx = (i: number) => useWizardStore.setState({ activePageIndex: i });

  // ⚠ "재인식" / "강제 OCR" 시 resetDispatch 를 *반드시* 같이 호출해야 한다.
  //   usePageOcr 의 dispatched Set 은 mount-lifetime 이라, store 만 reset해서
  //   ocrComplete=false 로 돌려놔도 dispatched.has(id)===true 인 채로 남아 다음
  //   effect cycle 에서 skip 됨. 결과적으로 페이지가 영원히 진행 안 되는 hang
  //   상태에 빠진다 (실제로 한 번 관찰된 버그). resetDispatch 가 그 마커를
  //   비워줘서 hook이 페이지를 다시 후보로 인식하게 만든다.
  const requestRetry = () => {
    if (!activePage) return;
    resetDispatch(activePage.id);
    setPageOCR(activePage.id, {
      ocrComplete: false,
      ocrError: undefined,
      ocrResult: [],
    });
  };

  const forcePageOcr = () => {
    if (!activePage) return;
    resetDispatch(activePage.id);
    setPageOCR(activePage.id, {
      forceOcr: true,
      ocrComplete: false,
      ocrError: undefined,
      ocrResult: [],
    });
  };

  if (!activePage) {
    return (
      <div className="max-w-[640px] mx-auto px-6 py-10 text-center">
        <Icon name="warning" size={36} weight="duotone" color="#F59E0B" />
        <p className="mt-3 text-body text-muted">
          업로드된 페이지가 없습니다. Step 1 으로 돌아가 PDF를 업로드해 주세요.
        </p>
      </div>
    );
  }

  const completedCount = pages.filter((p) => p.ocrComplete && !p.ocrError).length;

  return (
    <div className="flex gap-4 h-full px-6 py-5 min-h-[580px]">
      <PageThumbColumn
        pages={pages}
        activeIndex={activeIdx}
        onSelect={setActiveIdx}
      />

      {/* 원본 스캔 */}
      <section className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Chip size="sm" icon="image">
              원본 스캔
            </Chip>
            <span className="text-small text-muted font-mono">
              p.{activeIdx + 1} / {pages.length}
            </span>
          </div>
        </header>
        <Card pad={16} className="flex-1 overflow-auto bg-white">
          {pageImage ? (
            // `pageImage` 는 이미 `usePageImageDataUrl` 에서 회전 적용된
            // dataURL — 여기선 transform 없이 그대로 표시. 박스 / img 둘
            // 다 회전 후 visual 비율에 자연스럽게 맞춰 들어간다. OCR 호출
            // 측도 `applyRotation` 으로 동일 dataURL 을 모델에 보내므로
            // 화면과 모델 입력이 완전히 일치.
            <img
              src={pageImage}
              alt={`page ${activeIdx + 1}`}
              className="w-full h-auto"
            />
          ) : (
            <div className="h-full grid place-items-center text-muted text-small">
              이미지 로드 중…
            </div>
          )}
        </Card>
      </section>

      {/* OCR 결과 */}
      <section className="flex-[1.1] min-w-0 flex flex-col">
        <header className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Chip tone="accent" size="sm" icon="scan">
              디지털화 결과
            </Chip>
            <span className="text-small text-muted">
              {completedCount} / {pages.length} 페이지 완료
            </span>
            {activePage.upgrading && (
              <Chip tone="accent" size="sm" icon="sparkle">
                정밀 분석 중…
              </Chip>
            )}
            {!activePage.upgrading &&
              (activePage.ocrModel === "gemini-3.1-pro-preview" ||
                activePage.ocrModel === "claude-opus-4-7") && (
                <Chip tone="ok" size="sm" icon="sparkle">
                  {activePage.ocrModel === "gemini-3.1-pro-preview" ? "Gemini 3.1 Pro" : "Opus 4.7"}
                </Chip>
              )}
            {/* DEV: 현재 진행 중인 모델명 노출 — 프로덕션 빌드엔 안 보임. */}
            {import.meta.env.DEV && activePage.ocrInflightModel && (
              <Chip tone="accent" size="sm" icon="circle-notch">
                {activePage.ocrInflightModel} 처리 중
              </Chip>
            )}
          </div>
          {activePage.ocrComplete && (activePage.isProblemPage || activePage.forceOcr) && (
            <Btn kind="ghost" size="sm" icon="arrow-clockwise" onClick={requestRetry}>
              페이지 재인식
            </Btn>
          )}
        </header>

        <div className="flex-1 overflow-auto flex flex-col gap-2.5 pr-1">
          {/* Skipped page banner — reviewer note #4 escape hatch */}
          {!activePage.isProblemPage && !activePage.forceOcr && (
            <SkipBanner onForceOcr={forcePageOcr} />
          )}

          {/* In-flight skeleton — only when actually waiting on a call */}
          {!activePage.ocrComplete && (activePage.isProblemPage || activePage.forceOcr) && (
            <PendingSkeletons />
          )}

          {/* Per-page error */}
          {activePage.ocrError && (
            <ErrorBanner message={activePage.ocrError} onRetry={requestRetry} />
          )}

          {/* Completed empty result on a forced page */}
          {activePage.ocrComplete &&
            !activePage.ocrError &&
            activePage.ocrResult.length === 0 &&
            (activePage.isProblemPage || activePage.forceOcr) && (
              <Card pad={16} className="bg-surface2">
                <p className="text-small text-muted">
                  이 페이지에서 인식된 문제가 없습니다. 원본 스캔을 확인하거나 페이지 재인식을 눌러
                  보세요.
                </p>
              </Card>
            )}

          {/* Result cards */}
          {activePage.ocrResult.map((item) => (
            <OCRItem
              key={item.id}
              pageId={activePage.id}
              item={item}
              pageImageDataUrl={pageImage}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Step2OCRReview;
