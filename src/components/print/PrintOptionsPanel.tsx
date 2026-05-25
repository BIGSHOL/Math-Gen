import { useEffect, useState } from "react";
import { Heading, Icon, Segmented, Toggle, Chip, RangeSlider } from "@app/components/ui";
import {
  DEFAULT_PRINT_OPTIONS,
  type ExportSource,
  type PrintOptions,
  type PrintTemplate,
} from "@app/stores/wizardStore";

/**
 * Step 5 좌측 옵션 사이드바. mathlab `print/page.tsx` L309-441 의 옵션 영역
 * 패턴 차용 + mathg-gen 디자인 토큰 적용.
 *
 * 신규 — *맨 위 출력 대상 라디오* (사용자 결정): variant / original / both.
 * `exportSource === "both"` 일 때 columns 자동 1단 강제 (effect).
 *
 * 색상 chip 은 mathlab 의 8 색을 그대로 차용 — 한국 학원·교재 인쇄에서 자주
 * 쓰이는 톤.
 */

interface PrintOptionsPanelProps {
  printOptions: PrintOptions;
  exportSource: ExportSource;
  onChangePrintOptions: (patch: Partial<PrintOptions>) => void;
  onChangeExportSource: (next: ExportSource) => void;
  className?: string;
}

const COLORS: Array<{ name: string; value: string }> = [
  { name: "사이언", value: "#0EA5E9" }, // mathg-gen accent
  { name: "파랑", value: "#135bec" },
  { name: "보라", value: "#8b5cf6" },
  { name: "핑크", value: "#ec4899" },
  { name: "주황", value: "#F97316" },
  { name: "노랑", value: "#eab308" },
  { name: "초록", value: "#10b981" },
  { name: "회색", value: "#64748b" },
];

const TEMPLATE_OPTIONS: Array<{ value: PrintTemplate; label: string }> = [
  { value: "exam", label: "모의고사" },
  { value: "default", label: "기본형" },
  { value: "minimal", label: "미니멀" },
  { value: "classic", label: "클래식" },
];

const EXPORT_SOURCE_OPTIONS: Array<{ value: ExportSource; label: string; icon?: string }> = [
  { value: "variant", label: "변형만", icon: "sparkle" },
  { value: "original", label: "원본만", icon: "scan" },
  { value: "both", label: "원본+변형", icon: "rows" },
];

const COLUMNS_OPTIONS: Array<{ value: string; label: string; icon: string }> = [
  { value: "1", label: "1단", icon: "rectangle" },
  { value: "2", label: "2단", icon: "columns" },
];

export const PrintOptionsPanel = ({
  printOptions,
  exportSource,
  onChangePrintOptions,
  onChangeExportSource,
  className,
}: PrintOptionsPanelProps) => {
  // `exportSource === "both"` 시 columns 강제 1단 — 한 카드에 두 본문 들어가서
  // 2단 + both 는 한 칸이 너무 좁아짐 (사용자 UX 결정사항).
  useEffect(() => {
    if (exportSource === "both" && printOptions.columns === 2) {
      onChangePrintOptions({ columns: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSource]);

  // 세로 여백 슬라이더의 *드래그 중 표시값* — store 와 분리. drag 중엔 store
  // update 안 함 (미리보기 reflow 무거움 ~0.5s) → thumb 가 마우스 따라옴.
  // release 시에만 store commit. 외부 (예: reset) 변경은 sync.
  const [spacingPreview, setSpacingPreview] = useState(printOptions.spacing);
  useEffect(() => {
    setSpacingPreview(printOptions.spacing);
  }, [printOptions.spacing]);

  const isBoth = exportSource === "both";

  return (
    <aside
      className={`w-[300px] shrink-0 bg-surface border-r border-line flex flex-col ${className ?? ""}`}
    >
      <div className="h-14 flex items-center px-4 border-b border-line">
        <Heading level="h3" className="text-body">
          <Icon name="sliders" size={16} weight="duotone" color="#0EA5E9" />
          <span className="ml-2">내보내기 설정</span>
        </Heading>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* 1. 출력 대상 (사용자 결정 최우선) */}
        <Section title="출력 대상" hint="변형 / 원본 / 둘 다">
          <Segmented<ExportSource>
            value={exportSource}
            onChange={onChangeExportSource}
            options={EXPORT_SOURCE_OPTIONS}
            size="sm"
            full
          />
          {exportSource === "variant" && (
            <p className="mt-2 text-caption text-muted">
              <Icon name="info" size={11} color="#9CA3AF" />{" "}
              변형 모드는 원본 도형이 포함되지 않습니다.
            </p>
          )}
          {isBoth && (
            <p className="mt-2 text-caption text-muted">
              <Icon name="info" size={11} color="#9CA3AF" />{" "}
              원본+변형 모드는 1단 layout 으로 자동 전환됩니다.
            </p>
          )}
        </Section>

        {/* 2. 템플릿 */}
        <Section title="템플릿">
          <div className="grid grid-cols-2 gap-1.5">
            {TEMPLATE_OPTIONS.map((t) => {
              const on = printOptions.template === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onChangePrintOptions({ template: t.value })}
                  className={`h-9 rounded-r2 border text-small font-medium transition-colors ${
                    on
                      ? "bg-accent-soft border-accent text-accent-ink font-semibold"
                      : "bg-surface border-line text-text2 hover:border-accent"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* 3. 강조 색상 */}
        <Section title="강조 색상">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => {
              const on = printOptions.color === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onChangePrintOptions({ color: c.value })}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ring-offset-2"
                  style={{
                    backgroundColor: c.value,
                    boxShadow: on ? `0 0 0 2px ${c.value}` : undefined,
                  }}
                  title={c.name}
                  aria-label={c.name}
                >
                  {on && <Icon name="check" size={14} color="#fff" weight="bold" />}
                </button>
              );
            })}
          </div>
        </Section>

        {/* 4. 단 수 */}
        <Section title="문항 분할">
          <Segmented
            value={String(printOptions.columns)}
            onChange={(v) =>
              onChangePrintOptions({ columns: v === "2" ? 2 : 1 })
            }
            options={COLUMNS_OPTIONS}
            size="sm"
            full
          />
          {isBoth && (
            <p className="mt-2 text-caption text-muted">2단은 원본+변형 모드에서 사용 불가</p>
          )}
        </Section>

        {/* 5. 세로 여백 — drag 중엔 local preview 만, release 시 store commit. */}
        <Section title={`세로 여백 (${spacingPreview}px)`}>
          <div className="flex items-center gap-3">
            <RangeSlider
              min={0}
              max={150}
              step={1}
              value={printOptions.spacing}
              onPreview={setSpacingPreview}
              onChange={(v) => onChangePrintOptions({ spacing: v })}
              className="flex-1 accent-accent h-1"
              aria-label="세로 여백"
            />
            <span className="text-caption font-mono text-muted w-10 text-right">
              {spacingPreview}px
            </span>
          </div>
        </Section>

        {/* 6. 헤더/문항 옵션 토글 */}
        <Section title="표시 옵션">
          <div className="space-y-2.5">
            <Toggle
              size="sm"
              value={printOptions.showDate}
              onChange={(v) => onChangePrintOptions({ showDate: v })}
              label={<span className="text-small">날짜 표시</span>}
            />
            <Toggle
              size="sm"
              value={printOptions.showChapter}
              onChange={(v) => onChangePrintOptions({ showChapter: v })}
              label={<span className="text-small">문항 단원명</span>}
              hint={<span className="text-caption">OCR 결과에 따라 비어 있을 수 있음</span>}
            />
            <Toggle
              size="sm"
              value={printOptions.showDifficulty}
              onChange={(v) => onChangePrintOptions({ showDifficulty: v })}
              label={<span className="text-small">난이도 라벨</span>}
            />
          </div>
        </Section>

        {/* 7. 정답·해설 */}
        <Section title="정답·해설">
          <div className="space-y-2.5">
            <Toggle
              size="sm"
              value={printOptions.showAnswers}
              onChange={(v) => onChangePrintOptions({ showAnswers: v })}
              label={<span className="text-small">정답·해설 페이지 포함</span>}
            />
            {printOptions.showAnswers && (
              <Toggle
                size="sm"
                value={printOptions.quickAnswerOnly}
                onChange={(v) => onChangePrintOptions({ quickAnswerOnly: v })}
                label={<span className="text-small">빠른 정답만 (해설 생략)</span>}
                className="ml-4"
              />
            )}
          </div>
        </Section>

        {/* 8. 초기화 */}
        <Section title="">
          <button
            type="button"
            onClick={() => onChangePrintOptions(DEFAULT_PRINT_OPTIONS)}
            className="w-full h-8 rounded-r2 border border-line text-small text-muted hover:border-accent hover:text-text transition-colors"
          >
            기본값으로 재설정
          </button>
        </Section>

        {/* status chip */}
        <div className="pt-2 border-t border-line">
          <Chip size="sm" tone="soft" icon="info">
            인쇄·PDF 가 같은 layout 으로 출력됩니다
          </Chip>
        </div>
      </div>
    </aside>
  );
};

interface SectionProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
}

const Section = ({ title, hint, children }: SectionProps) => (
  <section>
    {title && (
      <h4 className="text-caption font-semibold uppercase tracking-wider text-muted mb-2">
        {title}
        {hint && <span className="ml-1 normal-case font-medium text-text2/60">· {hint}</span>}
      </h4>
    )}
    {children}
  </section>
);

export default PrintOptionsPanel;
