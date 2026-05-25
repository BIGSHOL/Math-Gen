import { Chip, Eyebrow, Icon } from "@app/components/ui";
import type { TestPaper, TopicSlice } from "@app/types";
import { formatVariantLabel } from "@app/lib/conversionLabels";

export interface DetailMetaSidebarProps {
  test: TestPaper;
}

interface InfoRow {
  key: string;
  value: string;
  icon: string;
}

const buildInfo = (test: TestPaper): InfoRow[] => [
  { key: "과목", value: test.subject, icon: "function" },
  { key: "문항", value: `${test.problemCount}개`, icon: "list-numbers" },
  { key: "업로드", value: test.time, icon: "calendar" },
  { key: "변환 방식", value: "OCR + 유사", icon: "magic-wand" },
  { key: "제작자", value: "—", icon: "user" },
];

const accuracyColor = (accuracy?: number): string => {
  if (accuracy === undefined) return "#0EA5E9"; // accent
  if (accuracy >= 80) return "#10B981"; // ok
  if (accuracy >= 60) return "#0EA5E9"; // accent
  return "#F59E0B"; // warn
};

const TopicBar = ({ slice }: { slice: TopicSlice }) => {
  const pct = Math.min(100, Math.max(0, slice.accuracy ?? 0));
  return (
    <div>
      <div className="flex justify-between mb-1 gap-2 text-small">
        <span className="text-text whitespace-nowrap flex-1 min-w-0 truncate">{slice.topic}</span>
        <span className="text-muted font-mono whitespace-nowrap flex-shrink-0">
          {slice.count}
          {slice.accuracy !== undefined ? ` · ${slice.accuracy}%` : ""}
        </span>
      </div>
      <div className="bg-surface2 overflow-hidden" style={{ height: 4, borderRadius: 2 }}>
        <div
          className="h-full transition-[width] duration-[600ms] ease-spring"
          style={{ width: `${pct}%`, background: accuracyColor(slice.accuracy), borderRadius: 2 }}
        />
      </div>
    </div>
  );
};

/**
 * Detail right sidebar — info rows, topic distribution bars, variant
 * history cards. Each block uses `Eyebrow` to declare its purpose.
 */
export const DetailMetaSidebar = ({ test }: DetailMetaSidebarProps) => {
  const info = buildInfo(test);
  return (
    <aside className="w-[296px] flex-shrink-0 px-5 py-6 border-l border-line bg-surface overflow-auto">
      <Eyebrow className="mb-3">정보</Eyebrow>
      <div className="flex flex-col gap-2.5 mb-7">
        {info.map((row) => (
          <div key={row.key} className="flex justify-between items-center gap-2 text-small">
            <span className="text-muted flex items-center gap-1.5 whitespace-nowrap">
              <Icon name={row.icon} size={13} />
              {row.key}
            </span>
            <span className="text-text font-[550] whitespace-nowrap overflow-hidden text-ellipsis">
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {test.topicDistribution.length > 0 && (
        <>
          <Eyebrow className="mb-3">단원별 분포</Eyebrow>
          <div className="flex flex-col gap-3 mb-7">
            {test.topicDistribution.map((t) => (
              <TopicBar key={t.topic} slice={t} />
            ))}
          </div>
        </>
      )}

      <Eyebrow className="mb-3">변형 이력</Eyebrow>
      {test.variants.length === 0 ? (
        <div className="text-small text-muted">아직 생성된 변형이 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {test.variants.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-r2 bg-surface2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-small font-semibold text-text truncate">
                  {formatVariantLabel(v.label) ?? `ver.${v.id} · ${v.count}개`}
                </div>
                <div className="text-caption text-muted truncate">{v.createdAt}</div>
              </div>
              <Chip tone="ok" size="sm" dot>
                완료
              </Chip>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};

export default DetailMetaSidebar;
