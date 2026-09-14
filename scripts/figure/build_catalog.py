"""Regenerate the Opus reference from the actual vendored engine contract."""
import inspect
import json
from pathlib import Path
from engine_path import ensure_on_path

ensure_on_path()
import elementary
from core.figure_scene import compile_figure_spec
from graph_scene import CONTRACT

catalog = {
    'graph-1': CONTRACT,
    'curveGraph_contract': 'curves quadratic uses {type:"quadratic",a,p,q,label?} for y=a(x-p)^2+q, NEVER b/c; inverse uses {type:"inverse",k,label?}. lines uses slope/yIntercept/label and cannot be horizontal; marks is [[x,y],...] integers on graph. For annotated curves, horizontal segments, inscribed shapes or custom labels use graph-1 instead.',
    'v2': inspect.getdoc(compile_figure_spec),
    'v2_example': {
        'version': 2,
        'points': {'A': [50, 30], 'B': [50, 210], 'C': [290, 210], 'value3': [30, 120]},
        'segments': {'AB': ['A', 'B'], 'BC': ['B', 'C'], 'CA': ['C', 'A']},
        'angles': {'rightB': {'vertex': 'B', 'points': ['A', 'C'], 'right': True}},
        # 라벨 자리는 엔진이 잡는다. 여기서 dx/dy 를 시범 보이면 모델이 그대로
        # 베껴 라벨을 한 자리에 못박고, 그 자리가 선·원과 겹치는 순간 그림 전체가
        # 거부된다(실측: 같은 장면도 dx/dy 만 빼면 통과). 숫자 라벨은 점 위치로
        # 옮기고 텍스트만 준다.
        'labels': {'A': 'A', 'B': 'B', 'C': 'C', 'value3': '3'},
    },
    'elementary': {
        k: {'required': sorted(elementary.KIND_FIELDS[k]),
            'optional': sorted(elementary.OPTIONAL.get(k, set())),
            'help': inspect.getdoc(fn) or ''}
        for k, fn in elementary._RENDER.items()
    },
}
Path(__file__).with_name('engine-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Engine catalog: {len(catalog["elementary"])} elementary kinds + FigureSpec v2')
