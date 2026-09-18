import { memo } from "react";
import type { FigureNumber } from "@app/lib/figureObjectNumbers";

type Pick = (id: string, additive: boolean) => void;

/**
 * 그림 둘레의 요소 번호. 끄는 동안 번호 자리는 걸음마다 다시 재지만, **자리가 바뀐 번호만** 다시 그린다 —
 * 번호 하나가 요소 다섯(선·원·글…)이라 38개면 190개를 걸음마다 새로 만들고 있었다(2026-09-18).
 */
const NumberMark = memo(function NumberMark({ id, number, x, y, targetX, targetY, selected, onPick }: FigureNumber & { selected: boolean; onPick: Pick }) {
  return <g>
    <line x1={x} y1={y} x2={targetX} y2={targetY} stroke={selected ? "#f97316" : "#808080"} strokeWidth={selected ? 1.5 : 1} strokeDasharray="3 4" opacity={selected ? 0.85 : 1} />
    <g data-figure-number={number} data-number-object={id} role="button" tabIndex={0} aria-label={`요소 ${number} 선택`}
      style={{ pointerEvents: "all", cursor: "pointer" }} onClick={event => onPick(id, event.shiftKey || event.ctrlKey || event.metaKey)}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(id, false); } }}>
      <circle cx={x} cy={y} r={10} fill={selected ? "#ea580c" : "#fff7ed"} stroke="#fb923c" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ font: "600 11px Arial, sans-serif", fill: selected ? "#fff" : "#9a3412", stroke: "none" }}>{number}</text>
    </g>
  </g>;
});

export const FigureNumberLayer = memo(function FigureNumberLayer({ numbers, selectedIds, onPick }: { numbers: FigureNumber[]; selectedIds: string[]; onPick: Pick }) {
  return <svg aria-label="도형 요소 번호" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", margin: 0, overflow: "visible", pointerEvents: "none" }}>
    {numbers.map(item => <NumberMark key={item.id} {...item} selected={selectedIds.includes(item.id)} onPick={onPick} />)}
  </svg>;
});
