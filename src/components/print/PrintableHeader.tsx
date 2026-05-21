import type { PrintTemplate } from "@app/stores/wizardStore";

/**
 * 페이지 헤더의 *고정 높이*. 페이지네이션 (`printLayout.ts` 의
 * `PAGE_CONTENT_HEIGHT = 820`) 이 이 값을 이미 차감한 가용 공간으로 계산하므로
 * 모든 variant 가 *같은 높이* 여야 한다.
 *
 * - 첫 페이지: 150px (시험지 헤더 + 학생 정보 박스)
 * - 2페이지 이후: 28px (간소한 페이지 인디케이터만)
 */
export const HEADER_HEIGHT_FIRST = 150;
export const HEADER_HEIGHT_OTHER = 28;

export interface PrintableHeaderProps {
  title: string;
  subtitle?: string;
  /** 학년 배지 (mathDefense `GRADE_LABELS` 기준). 예: "중1", "고2 미적분". */
  gradeBadge?: string;
  isFirstPage: boolean;
  /** "1 / 5" 같은 페이지 인디케이터. */
  pageInfo?: string;
  /** PrintOptions.color (hex). 각 variant 의 강조 색에 사용. */
  accentColor?: string;
  variant?: PrintTemplate;
  showDate?: boolean;
}

/**
 * Step 5 인쇄 헤더. mathlab 의 9 variants 중 *4 개* 만 채택 — wizard 사용자의
 * 인지 부담 ↓. mathlab 의 `academyName`, `totalScore`, `problemCount` 같은
 * 학원 운영 컨텍스트는 모두 제외 (mathg-gen 은 변환 도구).
 *
 * variant 별 디자인 차이:
 *   - exam (기본): 두꺼운 박스 테두리 + 학생 정보 칸
 *   - default: 단순한 하단 보더 + 우측 학생 정보
 *   - minimal: 가벼운 typography + 미세 보더
 *   - classic: 이중 테두리 + 중앙 정렬 타이틀
 */
export const PrintableHeader = ({
  title,
  subtitle,
  gradeBadge,
  isFirstPage,
  pageInfo,
  accentColor = "#0EA5E9",
  variant = "exam",
  showDate = true,
}: PrintableHeaderProps) => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  // 2페이지 이후 — 모든 variant 동일한 간소 헤더.
  if (!isFirstPage) {
    return (
      <div
        className="shrink-0 mb-1"
        style={{ height: `${HEADER_HEIGHT_OTHER}px` }}
      >
        <div
          className="flex items-center justify-between pb-1.5 border-b"
          style={{ borderColor: `${accentColor}30` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] font-black tracking-tighter text-white px-1.5 py-0.5 rounded-sm"
              style={{ backgroundColor: accentColor }}
            >
              MathG
            </span>
            <span className="text-[10px] font-bold text-slate-500 truncate">{title}</span>
          </div>
          {pageInfo && (
            <span className="text-[10px] font-bold text-slate-400 shrink-0">{pageInfo}</span>
          )}
        </div>
      </div>
    );
  }

  // 첫 페이지 — variant 별 디자인.
  return (
    <div className="shrink-0 overflow-hidden" style={{ height: `${HEADER_HEIGHT_FIRST}px` }}>
      {variant === "exam" ? (
        <ExamHeader {...{ title, subtitle, gradeBadge, dateStr, showDate, accentColor, pageInfo }} />
      ) : variant === "minimal" ? (
        <MinimalHeader {...{ title, subtitle, gradeBadge, dateStr, showDate, accentColor }} />
      ) : variant === "classic" ? (
        <ClassicHeader {...{ title, subtitle, gradeBadge, dateStr, showDate, accentColor }} />
      ) : (
        <DefaultHeader {...{ title, subtitle, gradeBadge, dateStr, showDate, accentColor }} />
      )}
    </div>
  );
};

// ── EXAM (모의고사) ─────────────────────────────────────────────
interface SubHeaderProps {
  title: string;
  subtitle?: string;
  gradeBadge?: string;
  dateStr: string;
  showDate: boolean;
  accentColor: string;
  pageInfo?: string;
}

const ExamHeader = ({
  title,
  subtitle,
  gradeBadge,
  dateStr,
  showDate,
  accentColor,
  pageInfo,
}: SubHeaderProps) => (
  <div className="font-sans h-full flex flex-col">
    {/* 최상단 라인 */}
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-baseline gap-2">
        <span
          className="text-[9px] font-black tracking-tighter text-white px-1.5 py-0.5 rounded-sm"
          style={{ backgroundColor: accentColor }}
        >
          MathG EXAM
        </span>
        <span className="text-[9px] font-bold text-slate-400 tracking-tight uppercase">
          변형 시험지
        </span>
      </div>
      {pageInfo && (
        <span className="text-[9px] font-bold text-slate-400">{pageInfo}</span>
      )}
    </div>

    {/* 메인 헤더 박스 */}
    <div className="border-[1.5px] border-slate-800 overflow-hidden rounded-sm flex-1 flex flex-col">
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 px-3 py-1.5 border-r-[1.5px] border-slate-800 flex flex-col justify-center bg-slate-50/50">
          <div className="flex items-center gap-2 mb-1">
            {gradeBadge && (
              <span
                className="bg-white border rounded px-1.5 py-0.5 text-[10px] font-bold"
                style={{ color: accentColor, borderColor: accentColor }}
              >
                {gradeBadge}
              </span>
            )}
            {showDate && (
              <span className="text-[10px] font-bold text-slate-500">{dateStr} 평가</span>
            )}
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-slate-600 font-semibold mt-1">{subtitle}</p>
          )}
        </div>
        <div className="w-24 flex flex-col items-center justify-center p-2 bg-white">
          <span className="text-[9px] font-bold text-slate-400 italic">SCORE</span>
        </div>
      </div>

      {/* 학생 정보 */}
      <div className="flex shrink-0 border-t-[1.5px] border-slate-800 bg-white">
        <div className="flex-1 flex border-r-[1.5px] border-slate-800">
          <div className="w-14 bg-slate-50 border-r border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600">
            반/번호
          </div>
          <div className="flex-1 px-2 py-1.5 text-xs text-slate-300 font-light">
            Class / No.
          </div>
        </div>
        <div className="flex-[1.2] flex">
          <div className="w-14 bg-slate-50 border-r border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600">
            성 명
          </div>
          <div className="flex-1 px-2 py-1.5 text-xs text-slate-300 font-light italic">
            Student Name
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ── DEFAULT (기본형) ────────────────────────────────────────────
const DefaultHeader = ({
  title,
  subtitle,
  gradeBadge,
  dateStr,
  showDate,
  accentColor,
}: Omit<SubHeaderProps, "pageInfo">) => (
  <div className="h-full flex flex-col">
    {/* 타이틀 바 */}
    <div
      className="flex justify-between items-start border-b-2 pb-2"
      style={{ borderColor: accentColor }}
    >
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          {gradeBadge && (
            <span
              className="text-white text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{ backgroundColor: accentColor }}
            >
              {gradeBadge}
            </span>
          )}
          <h1 className="text-lg font-black text-slate-800 tracking-tight">{title}</h1>
        </div>
        {subtitle && <p className="text-xs text-slate-500 font-medium">{subtitle}</p>}
      </div>
      <div className="text-right shrink-0">
        <div className="text-[9px] font-bold tracking-widest text-slate-400 mb-0.5">
          MATHG GEN
        </div>
        <div className="text-xs font-bold text-slate-800">변형 시험지</div>
      </div>
    </div>

    {/* 학생 정보 + 날짜 */}
    <div className="flex items-center gap-4 mt-2 pt-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold text-slate-500">반/번호</span>
        <div className="w-24 border-b border-slate-300" />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold text-slate-500">이름</span>
        <div className="w-28 border-b border-slate-300" />
      </div>
      {showDate && (
        <div className="ml-auto text-[11px] text-slate-400 font-medium">{dateStr}</div>
      )}
    </div>
  </div>
);

// ── MINIMAL (미니멀) ────────────────────────────────────────────
const MinimalHeader = ({
  title,
  subtitle,
  gradeBadge,
  dateStr,
  showDate,
  accentColor,
}: Omit<SubHeaderProps, "pageInfo">) => (
  <div className="h-full flex flex-col justify-end pb-2">
    <div className="flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-extralight text-slate-900 tracking-tight leading-none">
          {title}
        </h1>
        <div className="flex items-center gap-3 mt-2">
          {gradeBadge && (
            <span className="text-[10px] font-medium text-slate-400">{gradeBadge}</span>
          )}
          {subtitle && <span className="text-[10px] text-slate-400">{subtitle}</span>}
          {showDate && <span className="text-[10px] text-slate-300">{dateStr}</span>}
        </div>
      </div>
      <div className="flex items-center gap-6 text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">이름</span>
          <div className="w-32 border-b border-slate-200" />
        </div>
      </div>
    </div>
    <div className="mt-3 h-px" style={{ backgroundColor: `${accentColor}25` }} />
  </div>
);

// ── CLASSIC (클래식) ────────────────────────────────────────────
const ClassicHeader = ({
  title,
  subtitle,
  gradeBadge,
  dateStr,
  showDate,
  accentColor,
}: Omit<SubHeaderProps, "pageInfo">) => (
  <div className="h-full flex flex-col">
    {/* 이중 테두리 헤더 */}
    <div
      className="border-2 p-0.5 flex-1 flex flex-col"
      style={{ borderColor: accentColor }}
    >
      <div
        className="border p-3 flex-1 flex flex-col"
        style={{ borderColor: `${accentColor}60` }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold text-slate-500">MathG 변형 시험지</div>
          {showDate && <div className="text-[10px] text-slate-400">{dateStr}</div>}
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1
              className="text-2xl font-black tracking-tight"
              style={{ color: accentColor }}
            >
              {title}
            </h1>
            <div className="flex items-center justify-center gap-3 mt-1">
              {gradeBadge && (
                <span className="text-[11px] font-bold text-slate-500">{gradeBadge}</span>
              )}
              {subtitle && (
                <span className="text-[11px] text-slate-400">{subtitle}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* 학생 정보 기입란 */}
    <div className="flex items-center gap-6 mt-2.5 text-xs">
      <div className="flex items-center gap-1.5">
        <span
          className="font-bold text-slate-600 border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: `${accentColor}40` }}
        >
          반
        </span>
        <div className="w-16 border-b border-slate-300" />
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="font-bold text-slate-600 border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: `${accentColor}40` }}
        >
          번호
        </span>
        <div className="w-16 border-b border-slate-300" />
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="font-bold text-slate-600 border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: `${accentColor}40` }}
        >
          이름
        </span>
        <div className="w-24 border-b border-slate-300" />
      </div>
      <div className="ml-auto text-[10px] font-bold text-slate-400 italic">/ 100</div>
    </div>
  </div>
);

export default PrintableHeader;
