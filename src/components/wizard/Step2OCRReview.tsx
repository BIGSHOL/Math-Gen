import { useEffect, useState } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import { getPageImage } from "@app/lib/imageStore";
import { usePageOcr } from "@app/hooks/usePageOcr";
import { useWizardStore } from "@app/stores/wizardStore";
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
const usePageImageDataUrl = (imageRef: string | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageRef) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const img = await getPageImage(imageRef);
      if (!cancelled) setUrl(img?.dataUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [imageRef]);

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
  const pageImage = usePageImageDataUrl(activePage?.imageRef);

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
        onResetDispatch={resetDispatch}
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
            // 원본 이미지는 IndexedDB 에 그대로 두고 CSS transform 으로만
            // 정방향 미리보기. 실제 OCR 호출 시 usePageOcr 가 applyRotation
            // 으로 정방향 dataURL 을 만들어서 모델에 보냄.
            <img
              src={pageImage}
              alt={`page ${activeIdx + 1}`}
              className="w-full h-auto"
              style={
                activePage.rotation === 0
                  ? undefined
                  : { transform: `rotate(${activePage.rotation}deg)`, transformOrigin: "center" }
              }
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
