"""Shared local/Vercel renderer. Vendored todays-math engine is authoritative."""
import json
import re
from engine_path import ensure_on_path

def render(spec):
    if not isinstance(spec, dict) or len(json.dumps(spec).encode('utf-8')) > 65536:
        raise ValueError('도형 스펙은 64KB 이하 JSON 객체여야 합니다.')
    ensure_on_path()
    from core.figure_scene import render_figure_spec
    from core.figure_quality import sanitize_svg
    from elementary import render_elementary
    svg = render_elementary(spec) if spec.get('version') == 'elem-1' else render_figure_spec(spec)
    svg = sanitize_svg(svg)
    # A viewBox-only SVG can expand/collapse differently in img/print contexts.
    def sized_root(match):
        tag = match.group(0)
        view = re.search(r'viewBox="([^"]+)"', tag)
        if view:
            values = view.group(1).split()
            if len(values) == 4:
                if not re.search(r'\bwidth=', tag): tag = tag[:-1] + f' width="{values[2]}">'
                if not re.search(r'\bheight=', tag): tag = tag[:-1] + f' height="{values[3]}">'
        return tag
    svg = re.sub(r'<svg\b[^>]*>', sized_root, svg, count=1)
    if len(svg.encode('utf-8')) > 1_000_000:
        raise ValueError('도형 출력이 너무 큽니다.')
    return {'svg': svg}
