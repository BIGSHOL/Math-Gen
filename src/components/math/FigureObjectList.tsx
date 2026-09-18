import { memo } from "react";
import type { figureObjects } from "@app/lib/figureSvgEditing";
import { figureLabelSummary, isFigureMathLabel } from "./FigureLabelInput";

type FigureObject = ReturnType<typeof figureObjects>[number];

export const NAMES: Record<string, string> = { path: "곡선/경로", line: "선분", circle: "원", ellipse: "타원", rect: "사각형", polygon: "다각형", polyline: "꺾은선", text: "글자" };

const listLabel = (o: FigureObject) => o.attrs["data-function"] ? "함수 그래프"
  : o.type === "text" ? `${isFigureMathLabel(o.attrs["data-mj"] ?? o.text) ? "수식" : "글자"} ${figureLabelSummary(o.attrs["data-mj"] ?? o.text)}`
  : NAMES[o.type] ?? o.type;

/**
 * 요소 목록. 끄는 동안 원문이 걸음마다 새로 읽혀도 **이름·순서가 같으면 다시 그리지 않는다** —
 * 요소가 38개면 단추 38개를 걸음마다 새로 만들던 것이 끊김의 한 몫이었다(2026-09-18).
 */
export const FigureObjectList = memo(function FigureObjectList({ objects, selectedIds, onPick }: {
  objects: FigureObject[]; selectedIds: string[]; onPick: (id: string, additive: boolean) => void;
}) {
  return <div className="flex flex-wrap gap-1.5">{objects.map((o, n) => <button type="button" key={o.id} data-figure-list-number={n + 1} aria-pressed={selectedIds.includes(o.id)}
    onClick={event => onPick(o.id, event.shiftKey || event.ctrlKey || event.metaKey)}
    className={`flex items-center gap-1.5 rounded-md border py-1 pl-1 pr-2 text-caption ${selectedIds.includes(o.id) ? "border-orange-300 bg-orange-50 text-orange-900" : "border-line bg-slate-50 hover:border-orange-200"}`}>
    <span className={`grid h-5 min-w-5 place-items-center rounded text-[11px] font-semibold ${selectedIds.includes(o.id) ? "bg-orange-600 text-white" : "bg-white text-orange-800"}`}>{n + 1}</span>
    <span className="max-w-28 truncate">{listLabel(o)}</span>
  </button>)}</div>;
}, (a, b) => a.selectedIds === b.selectedIds && a.onPick === b.onPick && a.objects.length === b.objects.length
  && a.objects.every((o, i) => o.id === b.objects[i].id && listLabel(o) === listLabel(b.objects[i])));
