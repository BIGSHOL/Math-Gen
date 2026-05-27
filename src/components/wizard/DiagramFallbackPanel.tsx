import { useCallback, useState } from "react";

import { Btn, Chip, Icon } from "@app/components/ui";
import { DiagramGenerateConfirm } from "@app/components/modal";
import { useAuthStore } from "@app/stores/authStore";
import type { OCRImage, OCRProblem } from "@app/stores/wizardStore";
import { showToast } from "@app/stores/toastStore";
import {
  extractDiagramHint,
  generateDiagramImage,
} from "@app/services/ai/imageGen";

import { DiagramCropOverlay } from "./DiagramCropOverlay";

/**
 * Phase #12 + #13 — OCRItem 카드 안 도형 액션 패널.
 *
 * 항상 표시 (도형 있거나 본문에 `[그림N]` 마커 있을 때) — 사용자가 도형이 잘못
 * 잡혔다고 판단하면 즉시 액션. status="warn" 또는 validateDiagramParams 실패 시
 * 노란 안내 배너 자동.
 *
 * **3 액션**:
 *  - **박스 편집**: DiagramCropOverlay 모달 — 사용자가 직접 박스 위치 수정
 *  - **AI 생성**: DiagramGenerateConfirm 모달 → /api/ai-image (DALL-E 3) 호출
 *  - **원본 보기**: 사용자 결과 vs 원본 toggle (user-crop / ai-gen 결과를 임시 무시)
 *
 * **상위 (OCRItem)** 에서 토글 상태와 images 업데이트 전달받음.
 */
export interface DiagramFallbackPanelProps {
  item: OCRProblem;
  /** 페이지 hi-res 이미지 dataUrl — DiagramCropOverlay 의 입력. */
  pageImageDataUrl: string | null;
  /** 시험지 ID — AI 이미지 생성 시 로깅용. */
  testId?: string | null;
  /** Tier 1 vector 도형 (diagramParams) 이 valid 한지 — 안내 배너 트리거. */
  hasValidVector: boolean;
  /** 사용자 결과 / 원본 toggle (true = 원본 보기). */
  showOriginal: boolean;
  onToggleOriginal: (next: boolean) => void;
  /** images 갱신 callback — OCRItem 이 store update. */
  onUpdateImages: (next: OCRImage[]) => void;
  /** 현재 누적 비용 (USD) — confirm modal 표시용. */
  accumulatedCostUsd?: number;
}

export const DiagramFallbackPanel = ({
  item,
  pageImageDataUrl,
  testId,
  hasValidVector,
  showOriginal,
  onToggleOriginal,
  onUpdateImages,
  accumulatedCostUsd,
}: DiagramFallbackPanelProps) => {
  const user = useAuthStore((s) => s.user);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorIndex, setEditorIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const images = item.images ?? [];
  const hasUserOrAiResult = images.some(
    (img) => img.source === "user-crop" || img.source === "ai-gen",
  );
  const hasAiGen = images.some((img) => img.source === "ai-gen");
  const showWarn = !hasValidVector && images.length === 0 && hasMarker(item.text);

  // 박스 편집 핸들러 — 사용자가 박스 위치 수정
  const handleSaveCrop = useCallback(
    (newImage: OCRImage) => {
      const next = images.length > 0 ? [...images] : [createDefaultImage()];
      next[editorIndex] = newImage;
      onUpdateImages(next);
    },
    [images, editorIndex, onUpdateImages],
  );

  // AI 생성 핸들러
  const handleGenerate = useCallback(
    async (prompt: string) => {
      if (!user) {
        showToast({ kind: "error", message: "로그인 필요" });
        return;
      }
      setGenerating(true);
      try {
        const result = await generateDiagramImage({
          prompt,
          ocrProblemId: item.id,
          testId: testId ?? null,
        });
        const newImage: OCRImage = {
          box: [0, 0, 1000, 1000], // ai-gen 은 bbox 의미 X
          label: "AI 생성",
          source: "ai-gen",
          url: result.url,
          prompt: result.revisedPrompt,
          generatedAt: Date.now(),
        };
        // ai-gen 은 *추가* (사용자가 원본도 보존하고 싶을 수 있음).
        // 단 이미 ai-gen 이 있으면 *교체* (dedupe).
        const next = images.filter((img) => img.source !== "ai-gen");
        next.push(newImage);
        onUpdateImages(next);
        setConfirmOpen(false);
        showToast({
          kind: "success",
          message: `AI 도형 생성 완료 ($${result.costUsd.toFixed(3)})`,
          durationMs: 2500,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[DiagramFallbackPanel] generate 실패:", (err as Error).message);
        showToast({
          kind: "error",
          message: `생성 실패: ${(err as Error).message}`,
        });
      } finally {
        setGenerating(false);
      }
    },
    [user, item.id, testId, images, onUpdateImages],
  );

  // 비로그인 시에도 박스 편집은 가능 (로컬 only) — AI 생성만 차단
  return (
    <div className="mt-3 pt-3 border-t border-line/50">
      {/* warn 배너 — vector/crop 둘 다 없는데 [그림N] 마커는 있는 경우 */}
      {showWarn && (
        <div className="mb-2 px-3 py-2 rounded-r2 bg-warn-soft border border-warn/30 text-small text-warnInk flex items-start gap-2">
          <Icon name="warning" weight="fill" size={13} className="mt-0.5 flex-none" />
          <div>
            <div className="font-semibold">도형 인식이 정확하지 않을 수 있습니다</div>
            <div className="text-caption mt-0.5">
              직접 박스를 그리거나 AI 생성을 사용하세요.
            </div>
          </div>
        </div>
      )}

      {/* 액션 toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Eyebrow>도형</Eyebrow>
        {images.length > 0 && (
          <Chip size="sm" tone="soft">
            {images.length} 개
          </Chip>
        )}
        {hasAiGen && (
          <Chip size="sm" tone="accent">
            <Icon name="sparkle" size={10} className="inline-block mr-0.5" />
            AI 생성됨
          </Chip>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Btn
            kind="ghost"
            size="sm"
            icon="crop"
            onClick={() => {
              setEditorIndex(0);
              setEditorOpen(true);
            }}
            disabled={!pageImageDataUrl}
          >
            박스 편집
          </Btn>
          <Btn
            kind="ghost"
            size="sm"
            icon="sparkle"
            onClick={() => setConfirmOpen(true)}
            disabled={!user}
            title={user ? "DALL-E 3 로 도형 자동 생성" : "로그인 필요"}
          >
            AI 생성
          </Btn>
          {hasUserOrAiResult && (
            <Btn
              kind={showOriginal ? "accent" : "ghost"}
              size="sm"
              icon={showOriginal ? "eye-slash" : "eye"}
              onClick={() => onToggleOriginal(!showOriginal)}
              title="사용자/AI 결과 vs 원본 toggle"
            >
              {showOriginal ? "원본 보는 중" : "원본 보기"}
            </Btn>
          )}
        </div>
      </div>

      {/* 박스 편집 모달 */}
      {editorOpen && (
        <DiagramCropOverlay
          open={editorOpen}
          pageImageDataUrl={pageImageDataUrl}
          initialImage={images[editorIndex] ?? createDefaultImage()}
          imageIndex={editorIndex}
          totalImages={Math.max(images.length, 1)}
          onSave={handleSaveCrop}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {/* AI 생성 confirm 모달 */}
      {confirmOpen && (
        <DiagramGenerateConfirm
          open={confirmOpen}
          initialPrompt={extractDiagramHint(item)}
          hasExistingDiagram={hasValidVector || images.length > 0}
          hasExistingGeneration={hasAiGen}
          todayTotalCostUsd={accumulatedCostUsd}
          onConfirm={handleGenerate}
          onClose={() => setConfirmOpen(false)}
          generating={generating}
        />
      )}
    </div>
  );
};

// ============================================================================
// helpers
// ============================================================================

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="text-caption font-semibold text-muted uppercase tracking-wider">
    {children}
  </span>
);

const hasMarker = (text: string | undefined): boolean =>
  !!text && /\[그림\d+\]/.test(text);

const createDefaultImage = (): OCRImage => ({
  box: [200, 200, 800, 800], // 페이지 중앙 60% 영역 (사용자가 조정)
  label: "도형",
  source: "user-crop",
});

export default DiagramFallbackPanel;
