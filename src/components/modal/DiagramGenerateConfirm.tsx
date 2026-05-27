import { useEffect, useState } from "react";
import { Btn, Icon } from "@app/components/ui";
import { ModalShell } from "./ModalShell";

/**
 * Phase #13 — DALL-E 3 도형 생성 confirm dialog.
 *
 * **표시 정보**:
 *  - prompt preview (한국어 추출본) — 사용자가 직접 편집 가능
 *  - 이미 도형 있는 경우 경고 ("원본 도형이 있는데 새로 생성하시겠습니까?")
 *  - 생성 / 취소 버튼
 *
 * **비용/소요 시간 표시 제거 (사용자 결정 2026-05-27)** — 사용자에게 불필요한
 * 정보. 호출은 여전히 ai_usage 테이블에 cost_usd 기록 (admin 모니터링용).
 *
 * **submit**: parent (OCRItem) 가 onConfirm(editedPrompt) 받아 imageGen 호출.
 */
export interface DiagramGenerateConfirmProps {
  open: boolean;
  /** 초기 prompt (extractDiagramHint 결과 — 사용자가 편집 가능). */
  initialPrompt: string;
  /** 이미 vector / crop 도형 있으면 경고 표시. */
  hasExistingDiagram?: boolean;
  /** 이미 같은 prompt 의 ai-gen 이미지가 있으면 dedupe 경고. */
  hasExistingGeneration?: boolean;
  onConfirm: (prompt: string) => void;
  onClose: () => void;
  /** 생성 in-flight — confirm 버튼 disable + spinner. */
  generating?: boolean;
}

export const DiagramGenerateConfirm = ({
  open,
  initialPrompt,
  hasExistingDiagram,
  hasExistingGeneration,
  onConfirm,
  onClose,
  generating,
}: DiagramGenerateConfirmProps) => {
  const [prompt, setPrompt] = useState(initialPrompt);

  // open / initialPrompt 변경 시 reset
  useEffect(() => {
    if (open) setPrompt(initialPrompt);
  }, [open, initialPrompt]);

  const handleSubmit = () => {
    if (generating) return;
    if (prompt.trim().length === 0) return;
    onConfirm(prompt.trim());
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      className="w-full max-w-[560px]"
      aria-labelledby="diagram-gen-confirm-title"
    >
      <div className="px-5 py-4 border-b border-line">
        <h2
          id="diagram-gen-confirm-title"
          className="text-subhead font-semibold text-ink flex items-center gap-2"
        >
          <Icon name="sparkle" size={18} weight="fill" className="text-accent" />
          AI 도형 이미지 생성
        </h2>
        <p className="text-caption text-muted mt-1">
          DALL-E 3 로 한국 수학 교과서 스타일의 도형을 자동 생성합니다.
        </p>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {/* 경고 — 이미 도형 있음 */}
        {hasExistingDiagram && !hasExistingGeneration && (
          <div className="px-3 py-2 rounded-r2 bg-warn-soft border border-warn/30 text-small text-warnInk flex items-start gap-2">
            <Icon
              name="warning"
              weight="fill"
              size={14}
              className="mt-0.5 flex-none"
            />
            <div>
              <div className="font-semibold">이미 원본 도형이 있습니다</div>
              <div className="text-caption mt-0.5">
                AI 생성 이미지가 원본 도형 대신 표시됩니다. 언제든 "원본 보기" 로 되돌릴 수 있습니다.
              </div>
            </div>
          </div>
        )}

        {/* dedupe 경고 — 이미 같은 prompt 의 ai-gen 있음 */}
        {hasExistingGeneration && (
          <div className="px-3 py-2 rounded-r2 bg-accent-soft border border-accent/30 text-small text-text flex items-start gap-2">
            <Icon
              name="arrows-clockwise"
              size={14}
              className="mt-0.5 flex-none text-accent"
            />
            <div>
              <div className="font-semibold">이미 AI 이미지가 생성된 도형입니다</div>
              <div className="text-caption mt-0.5">
                기존 이미지가 마음에 들지 않으면 prompt 를 수정해 다시 생성하세요.
              </div>
            </div>
          </div>
        )}

        {/* prompt 편집 */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="diagram-prompt" className="text-caption text-muted">
            도형 설명 (한국어 가능 — 자동으로 영어 번역됩니다)
          </label>
          <textarea
            id="diagram-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="예: 정사각형 ABCD, 한 변의 길이 2cm, 대각선 표시"
            className="px-3 py-2 rounded-r2 border border-line bg-surface text-body focus:outline-none focus:border-accent focus:shadow-accent-glow resize-none"
          />
          <div className="flex items-center justify-between text-caption text-muted">
            <span>{prompt.length} / 500</span>
            <span className="flex items-center gap-1">
              <Icon name="info" size={11} />
              영어로 직접 입력해도 OK
            </span>
          </div>
        </div>

      </div>

      <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2 bg-surface2">
        <Btn kind="ghost" onClick={onClose} disabled={generating}>
          취소
        </Btn>
        <Btn
          kind="accent"
          icon={generating ? "circle-notch" : "sparkle"}
          onClick={handleSubmit}
          disabled={generating || prompt.trim().length === 0}
        >
          {generating ? "생성 중..." : "AI 이미지 생성"}
        </Btn>
      </div>
    </ModalShell>
  );
};

export default DiagramGenerateConfirm;
