import { useEffect } from "react";
import { Heading, Icon, Segmented, Toggle, Chip } from "@app/components/ui";
import {
  DEFAULT_PRINT_OPTIONS,
  type ExportSource,
  type PrintOptions,
  type PrintTemplate,
} from "@app/stores/wizardStore";
import { FONT_PACKS, type FontPackId } from "@app/lib/printFontPacks";

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

const TEMPLATE_OPTIONS: Array<{ value: PrintTemplate; label: string; hint: string }> = [
  { value: "pyeongga", label: "평가원", hint: "수능·모평" },
  { value: "jeongtong", label: "정통", hint: "학교 시험지" },
  { value: "modern", label: "모던", hint: "학교 마케팅" },
  { value: "workbook", label: "워크북", hint: "풀이공간" },
  { value: "jaseup", label: "자습", hint: "개념+모눈" },
  { value: "yuhyung", label: "유형", hint: "유형 컴팩트" },
];

// 출력 대상 — 순서: 원본만 / 변형만 / 원본+변형. 원본만이 기본 (wizardStore
// exportSource 기본값 "original"). 변형 기능 준비 중이라 변형만·원본+변형 은
// 비활성 (사용자 결정 2026-06-04). 변형 출시 시 disabled 만 제거하면 복구.
const EXPORT_SOURCE_OPTIONS: Array<{
  value: ExportSource;
  label: string;
  icon?: string;
  disabled?: boolean;
  title?: string;
}> = [
  { value: "original", label: "원본만", icon: "scan" },
  { value: "variant", label: "변형만", icon: "sparkle", disabled: true, title: "변형 출력 준비 중" },
  { value: "both", label: "원본+변형", icon: "rows", disabled: true, title: "변형 출력 준비 중" },
];

/** 비활성 아닌(선택 가능한) 출력 대상 — 비활성 값 coerce 시 fallback. */
const ENABLED_EXPORT_SOURCES = EXPORT_SOURCE_OPTIONS.filter((o) => !o.disabled).map(
  (o) => o.value,
);

const COLUMNS_OPTIONS: Array<{ value: string; label: string; icon: string }> = [
  { value: "1", label: "1단", icon: "rectangle" },
  { value: "2", label: "2단", icon: "columns" },
];

/**
 * 세로 여백 5 단계 preset. 자유 슬라이더 (drag 느림 + 결정 부담) 대신
 * 한국 시험지 관행 기반의 *5 단계* — Segmented 로 빠르게 선택.
 *
 * 각 단계의 px 값은 `PrintQuestionBlock` 의 marginBottom 으로 적용되며,
 * `flex justify-between` 컬럼 안에서 *최소 여백* 으로 작동 (페이지 가득
 * 채울 때 자동으로 더 늘어남).
 */
const SPACING_PRESETS = [
  { value: "min", label: "최소", spacing: 4 },
  { value: "tight", label: "좁게", spacing: 16 },
  { value: "normal", label: "보통", spacing: 32 },
  { value: "loose", label: "넓게", spacing: 56 },
  { value: "max", label: "최대", spacing: 88 },
] as const;

type SpacingPresetValue = (typeof SPACING_PRESETS)[number]["value"];

const SPACING_OPTIONS: Array<{ value: SpacingPresetValue; label: string }> =
  SPACING_PRESETS.map((p) => ({ value: p.value, label: p.label }));

/**
 * 현재 spacing 값에 가장 가까운 preset 의 `value` 반환. *legacy* 시험지
 * (이전 자유 슬라이더 값) 도 자연스럽게 5 단계 중 하나에 매핑.
 */
const matchSpacingPreset = (spacing: number): SpacingPresetValue => {
  let closestValue: SpacingPresetValue = SPACING_PRESETS[0].value;
  let minDiff = Math.abs(spacing - SPACING_PRESETS[0].spacing);
  for (const p of SPACING_PRESETS) {
    const diff = Math.abs(spacing - p.spacing);
    if (diff < minDiff) {
      closestValue = p.value;
      minDiff = diff;
    }
  }
  return closestValue;
};

// 세로 배치 모드 — 여백 직접 지정 vs 단별 문항 수 지정 (택일, 사용자 요청 2026-06-04).
const LAYOUT_MODE_OPTIONS: Array<{ value: "spacing" | "count"; label: string }> = [
  { value: "spacing", label: "여백 지정" },
  { value: "count", label: "문항 수 지정" },
];

// count 모드 — 1단(컬럼)당 문항 수. 2단이면 페이지당 ×2 (4/6/8).
const PER_COLUMN_OPTIONS = [2, 3, 4];

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

  // 변형만/원본+변형 비활성 (변형 출력 준비 중) — 옛 세션 등으로 exportSource 가
  // 비활성 값이면 원본으로 강제해 UI 선택과 실제 출력을 일치시킨다 (사용자 결정
  // 2026-06-04). 변형 출시 시 EXPORT_SOURCE_OPTIONS 의 disabled 만 제거하면 복구.
  useEffect(() => {
    if (!ENABLED_EXPORT_SOURCES.includes(exportSource)) {
      onChangeExportSource(ENABLED_EXPORT_SOURCES[0] ?? "original");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSource]);

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
        {/* 1. 출력 대상 (사용자 결정 최우선). 현재 원본만 활성 — 변형 출력 준비 중. */}
        <Section title="출력 대상" hint="원본만 (변형 준비 중)">
          <Segmented<ExportSource>
            value={exportSource}
            onChange={onChangeExportSource}
            options={EXPORT_SOURCE_OPTIONS}
            size="sm"
            full
          />
          <p className="mt-2 text-caption text-muted">
            <Icon name="info" size={11} color="#9CA3AF" />{" "}
            변형 출력은 준비 중입니다 — 현재는 원본만 내보낼 수 있습니다.
          </p>
        </Section>

        {/* 2. 템플릿 — 6 신규 디자인 (design_handoff_print_templates 기반).
            2행 3열 grid. label + hint 2단 (라벨 / 작은 설명). */}
        <Section title="템플릿">
          <div className="grid grid-cols-3 gap-1.5">
            {TEMPLATE_OPTIONS.map((t) => {
              const on = printOptions.template === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onChangePrintOptions({ template: t.value })}
                  className={`h-12 rounded-r2 border text-small font-medium transition-colors flex flex-col items-center justify-center px-1 ${
                    on
                      ? "bg-accent-soft border-accent text-accent-ink font-semibold"
                      : "bg-surface border-line text-text2 hover:border-accent"
                  }`}
                  title={t.hint}
                >
                  <span>{t.label}</span>
                  <span className="text-caption text-text2/60 font-normal leading-none mt-0.5">
                    {t.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* 2.5 폰트 — 5 한글 폰트 팩 (Sans/Serif 쌍) */}
        <Section title="폰트">
          <div className="grid grid-cols-5 gap-1">
            {FONT_PACKS.map((p) => {
              const on = printOptions.fontPack === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChangePrintOptions({ fontPack: p.id as FontPackId })}
                  className={`h-10 rounded-r2 border text-[11px] font-medium transition-colors flex flex-col items-center justify-center px-0.5 ${
                    on
                      ? "bg-accent-soft border-accent text-accent-ink font-semibold"
                      : "bg-surface border-line text-text2 hover:border-accent"
                  }`}
                  style={{ fontFamily: p.serif }}
                  title={p.hint}
                >
                  <span className="leading-none">{p.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-caption text-muted leading-tight">
            본문 (명조) + 헤더 (고딕) 쌍 — 모두 한글 무료 폰트
          </p>
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

        {/* 4. 단 수 + 컬럼 구분선 */}
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
          {/* 2단 일 때만 컬럼 구분선 옵션 노출 — 1단 이면 무의미. */}
          {printOptions.columns === 2 && (
            <div className="mt-3">
              <Toggle
                size="sm"
                value={printOptions.columnDivider}
                onChange={(v) => onChangePrintOptions({ columnDivider: v })}
                label={<span className="text-small">컬럼 사이 구분선</span>}
              />
            </div>
          )}
        </Section>

        {/* 5. 세로 배치 — 택일: 여백 직접 지정 vs 단별 문항 수 지정.
            "문항 수 지정" 시 컬럼당 N개씩 채우고 여백은 자동 균등 분배
            (space-evenly). 2단이면 페이지당 N×2 (사용자 요청 2026-06-04). */}
        <Section title="세로 배치">
          <Segmented<"spacing" | "count">
            value={printOptions.layoutMode}
            onChange={(v) => onChangePrintOptions({ layoutMode: v })}
            options={LAYOUT_MODE_OPTIONS}
            size="sm"
            full
          />
          {printOptions.layoutMode === "spacing" ? (
            <div className="mt-2.5">
              <Segmented<SpacingPresetValue>
                value={matchSpacingPreset(printOptions.spacing)}
                onChange={(v) => {
                  const preset = SPACING_PRESETS.find((p) => p.value === v);
                  if (preset) onChangePrintOptions({ spacing: preset.spacing });
                }}
                options={SPACING_OPTIONS}
                size="sm"
                full
              />
            </div>
          ) : (
            <div className="mt-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                {PER_COLUMN_OPTIONS.map((n) => {
                  const on = printOptions.problemsPerColumn === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onChangePrintOptions({ problemsPerColumn: n })}
                      className={`h-11 rounded-r2 border text-small font-medium transition-colors flex flex-col items-center justify-center ${
                        on
                          ? "bg-accent-soft border-accent text-accent-ink font-semibold"
                          : "bg-surface border-line text-text2 hover:border-accent"
                      }`}
                    >
                      <span>1단당 {n}</span>
                      <span className="text-caption text-text2/60 font-normal leading-none mt-0.5">
                        페이지당 {n * printOptions.columns}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-caption text-muted leading-tight">
                <Icon name="info" size={11} color="#9CA3AF" /> 컬럼당{" "}
                {printOptions.problemsPerColumn}문항씩 — 여백은 자동으로 균등
                분배됩니다.
              </p>
            </div>
          )}
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
