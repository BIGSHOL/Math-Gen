/**
 * 난이도 라벨 — *디자인된 chip*.
 *
 * **함정 (사용자 보고)**: 기존엔 `<span>{problem.variant.difficulty}</span>` 로
 * "중" 한 글자만 인라인. 문제 번호 옆에 떠 있어서 *오타 같음* (사용자 표현).
 *
 * **해결**:
 *   - 색상 코딩된 chip — 하 / 중 / 상 한 눈에 구분
 *   - "난이도" prefix — 라벨임을 명시 (오타 오해 방지)
 *   - 도트 + 배경색 + 텍스트색 — 그래픽 강조
 *   - 다양한 raw 값 normalize (한국어 / 영어 / wizard-internal 키워드 모두 매핑)
 *   - 인쇄 시 색상 보존 (`WebkitPrintColorAdjust: "exact"`)
 *
 * `wizardStore.difficulty` 의 union ("easier" / "same" / "harder") 도 매핑.
 * AI 가 다른 단어 emit 해도 휴리스틱으로 적당히 분류.
 */

type Tone = "easy" | "medium" | "hard" | "unknown";

interface Normalized {
  label: string;
  tone: Tone;
}

const normalizeDifficulty = (raw: string): Normalized => {
  const r = raw.trim();
  // 한국어 우선
  if (/[하]/.test(r) && !/[상중]/.test(r)) return { label: "하", tone: "easy" };
  if (/[상]/.test(r) && !/[하중]/.test(r)) return { label: "상", tone: "hard" };
  if (/[중]/.test(r)) return { label: "중", tone: "medium" };
  // 영어 / wizard-internal 키워드
  const lc = r.toLowerCase();
  if (/(easier|easy|low|쉬움|쉽)/.test(lc)) return { label: "하", tone: "easy" };
  if (/(harder|hard|high|어려움|어려)/.test(lc)) return { label: "상", tone: "hard" };
  if (/(same|medium|moderate|normal|보통|일반)/.test(lc)) return { label: "중", tone: "medium" };
  // 알 수 없으면 raw 그대로 표시 (단 chip 디자인은 적용)
  return { label: r, tone: "unknown" };
};

const TONE: Record<Tone, { bg: string; fg: string; dot: string }> = {
  easy: { bg: "#dcfce7", fg: "#166534", dot: "#22c55e" }, // green
  medium: { bg: "#dbeafe", fg: "#1e40af", dot: "#3b82f6" }, // blue
  hard: { bg: "#fee2e2", fg: "#991b1b", dot: "#ef4444" }, // red
  unknown: { bg: "#f1f5f9", fg: "#475569", dot: "#94a3b8" }, // slate
};

export interface DifficultyBadgeProps {
  difficulty: string;
  className?: string;
}

export const DifficultyBadge = ({ difficulty, className }: DifficultyBadgeProps) => {
  const { label, tone } = normalizeDifficulty(difficulty);
  const c = TONE[tone];
  const printStyle = { WebkitPrintColorAdjust: "exact" as const };
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider whitespace-nowrap ${className ?? ""}`}
      style={{
        background: c.bg,
        color: c.fg,
        ...printStyle,
      }}
    >
      <span
        className="inline-block w-1 h-1 rounded-full shrink-0"
        style={{ background: c.dot, ...printStyle }}
      />
      <span>난이도 {label}</span>
    </span>
  );
};

export default DifficultyBadge;
