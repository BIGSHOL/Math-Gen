import { useMemo, useState } from "react";
import { DEFAULT_FUNCTION, functionGraph, type FunctionGraphConfig } from "@app/lib/functionGraph";

export function FunctionGraphInput({ initial = DEFAULT_FUNCTION, viewBox, editing = false, onApply }: {
  initial?: FunctionGraphConfig; viewBox: number[]; editing?: boolean;
  onApply: (config: FunctionGraphConfig, result: { svg: string; path: string }) => void;
}) {
  const [config, setConfig] = useState(initial);
  const result = useMemo(() => { try { return { value: functionGraph(config, viewBox) }; } catch (error) { return { error: (error as Error).message }; } }, [config, viewBox.join(" ")]);
  return <div className="space-y-3 text-caption" aria-label="함수 그래프 입력">
    <label className="block font-medium">함수식<input aria-label="함수식" value={config.expression} onChange={event => setConfig({ ...config, expression: event.target.value })}
      className="mt-1 w-full rounded border border-line px-2 py-2 text-small" placeholder="y=x^2" spellCheck={false} /></label>
    <div className="flex flex-wrap gap-1">{["y=x^2", "y=sin(x)", "y=1/x", "y=abs(x)"].map(expression => <button type="button" key={expression} onClick={() => setConfig({ ...config, expression })} className="rounded bg-surface2 px-2 py-1">{expression}</button>)}</div>
    <p className="text-muted">^는 거듭제곱, /는 나눗셈입니다. sqrt(x), sin(x), cos(x), ln(x)를 사용할 수 있습니다. 각도는 라디안입니다.</p>
    <div className="grid grid-cols-2 gap-2">{([['xMin', 'x 최솟값'], ['xMax', 'x 최댓값'], ['yMin', 'y 최솟값'], ['yMax', 'y 최댓값']] as const).map(([key, name]) => <label key={key}>{name}<input type="number" aria-label={name} value={Number.isNaN(config[key]) ? "" : config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value === "" ? NaN : +e.target.value })} className="mt-1 w-full rounded border border-line px-2 py-1" /></label>)}</div>
    {!editing && <label className="flex items-center gap-2"><input type="checkbox" checked={config.axes} onChange={e => setConfig({ ...config, axes: e.target.checked })} />좌표축 함께 추가</label>}
    {result.value && <div className="rounded border border-line bg-white p-2 [&>svg]:w-full [&>svg]:h-auto" aria-label="함수 그래프 미리보기" dangerouslySetInnerHTML={{ __html: result.value.svg }} />}
    {result.error && <p role="status" className="text-orange-800">{result.error}</p>}
    {editing && <p className="text-muted">범위를 바꾸면 선택한 곡선에 적용됩니다. 좌표축은 별도 요소로 편집할 수 있습니다.</p>}
    <button type="button" disabled={!result.value} onClick={() => result.value && onApply(config, result.value)} className="w-full rounded bg-orange-600 py-2 text-white disabled:opacity-40">{editing ? "함수식 적용" : "그림에 함수 추가"}</button>
  </div>;
}
