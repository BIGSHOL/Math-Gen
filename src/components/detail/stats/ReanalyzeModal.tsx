import { useEffect, useState } from "react";
import { Btn, Icon } from "@app/components/ui";
import { ModalShell } from "@app/components/modal/ModalShell";

/**
 * 시험지 (재)분석 옵션 모달 (Phase N+6).
 *
 * 주변 학교 / 이전 연도 비교는 *자체 corpus 가 없으므로* (Phase L 미구축)
 * 사용자가 직접 아는 정보를 메모로 입력 → AI 는 *그 메모만 근거로* 비교 정리.
 * fabrication 0 (사용자 결정 2026-05-29). 둘 다 선택 — 비워두면 비교 없이 분석.
 */
export interface ReanalyzeModalProps {
  open: boolean;
  onClose: () => void;
  /** 확정 — 입력된 비교 메모 전달. 빈 문자열이면 해당 비교 섹션 미생성. */
  onConfirm: (opts: { nearbyNote: string; yearNote: string }) => void;
  /** confirm 버튼 라벨 (기본 "재분석 시작"). 최초 분석 시 "분석 시작". */
  confirmLabel?: string;
  /** 모달 제목 (기본 "재분석 옵션"). */
  title?: string;
}

const NOTE_MAX = 300;

const textareaCls =
  "px-3 py-2 rounded-r2 border border-line bg-surface text-body focus:outline-none focus:border-accent focus:shadow-accent-glow resize-none w-full";

export const ReanalyzeModal = ({
  open,
  onClose,
  onConfirm,
  confirmLabel = "재분석 시작",
  title = "재분석 옵션",
}: ReanalyzeModalProps) => {
  const [nearbyNote, setNearbyNote] = useState("");
  const [yearNote, setYearNote] = useState("");

  // 열릴 때마다 초기화
  useEffect(() => {
    if (open) {
      setNearbyNote("");
      setYearNote("");
    }
  }, [open]);

  const handleConfirm = () => {
    onConfirm({ nearbyNote: nearbyNote.trim(), yearNote: yearNote.trim() });
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      className="w-full max-w-[560px]"
      aria-labelledby="reanalyze-modal-title"
    >
      <div className="px-5 py-4 border-b border-line">
        <h2
          id="reanalyze-modal-title"
          className="text-subhead font-semibold text-ink flex items-center gap-2"
        >
          <Icon
            name="arrow-clockwise"
            size={18}
            weight="bold"
            className="text-accent"
          />
          {title}
        </h2>
        <p className="text-caption text-muted mt-1 leading-relaxed">
          비교 정보를 입력하면 AI 가 *입력한 내용만 근거로* 주변/연도 비교를
          작성합니다. 비워두면 비교 없이 분석합니다.
        </p>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        {/* 주변 학교 비교 메모 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="reanalyze-nearby"
            className="text-caption text-text2 font-medium flex items-center gap-1.5"
          >
            <Icon name="buildings" size={13} className="text-muted" />
            주변 학교 비교 메모 <span className="text-muted">(선택)</span>
          </label>
          <textarea
            id="reanalyze-nearby"
            value={nearbyNote}
            onChange={(e) => setNearbyNote(e.target.value.slice(0, NOTE_MAX))}
            rows={3}
            placeholder="예: 인근 OO중은 평이한 편, 우리 학원 평균 75점. 이 시험은 서술형 비중이 더 높음"
            className={textareaCls}
          />
          <div className="text-right text-caption text-muted">
            {nearbyNote.length} / {NOTE_MAX}
          </div>
        </div>

        {/* 이전 연도 비교 메모 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="reanalyze-year"
            className="text-caption text-text2 font-medium flex items-center gap-1.5"
          >
            <Icon name="calendar" size={13} className="text-muted" />
            이전 연도 비교 메모 <span className="text-muted">(선택)</span>
          </label>
          <textarea
            id="reanalyze-year"
            value={yearNote}
            onChange={(e) => setYearNote(e.target.value.slice(0, NOTE_MAX))}
            rows={3}
            placeholder="예: 작년 1학기 중간 평균 68점, 올해는 함수 단원이 추가되고 서술형이 2문항 늘어남"
            className={textareaCls}
          />
          <div className="text-right text-caption text-muted">
            {yearNote.length} / {NOTE_MAX}
          </div>
        </div>

        {/* fabrication 방지 안내 */}
        <div className="px-3 py-2 rounded-r2 bg-surface2 text-caption text-muted flex items-start gap-2">
          <Icon name="info" size={13} className="mt-0.5 flex-none text-muted" />
          <span>
            corpus 가 없어 AI 는 입력한 메모 외의 학교명·점수를 지어내지 않습니다.
            정확한 정보를 입력할수록 비교가 유용합니다.
          </span>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2 bg-surface2">
        <Btn kind="ghost" onClick={onClose}>
          취소
        </Btn>
        <Btn kind="accent" icon="sparkle" onClick={handleConfirm}>
          {confirmLabel}
        </Btn>
      </div>
    </ModalShell>
  );
};

export default ReanalyzeModal;
