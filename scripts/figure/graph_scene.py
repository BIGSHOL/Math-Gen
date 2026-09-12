"""Annotated textbook graphs: deterministic curves plus finite segments and labels.

The upstream curveGraph accepts only whole lines and integer marks. This adapter
adds the finite segments/polygons used by inscribed-shape exam questions.
"""
import math

CONTRACT = {
    'version': 'graph-1',
    'coordinates': 'Mathematical x right, y UP. Explicit xRange/yRange, each [min,max]. No eval/code.',
    'fields': {
        'xRange': 'required [min,max]', 'yRange': 'required [min,max]',
        'width': 'optional 240..640 default 520', 'height': 'optional 200..640 default 460',
        'axes': 'optional boolean default true; arrows + x,y labels only, NO automatic ticks or O label',
        'curves': 'list of {coefficients:[a,b,c,...],domain:[xmin,xmax]} for polynomial a*x^n+b*x^(n-1)+...; OR {type:"inverse",k:number,domain:[xmin,xmax]}; optional dashed:boolean',
        'segments': 'list of {from:[x,y],to:[x,y],dashed?:boolean,arrow?:boolean}; finite visible segments only',
        'polygons': 'list of {points:[[x,y],...],fill?:"#eeeeee",dashed?:boolean}; optional shading',
        'circles': 'list of {center:[x,y],radius:number,dashed?:boolean}',
        'labels': 'list of {at:[x,y],text:string,dx?:pixels,dy?:pixels,size?:pixels,anchor?:"start"|"middle"|"end"}; only printed labels; math can use $...$ LaTeX and is typeset as vector glyphs',
    },
    'example': {'version':'graph-1','xRange':[-4,4],'yRange':[-2,11],
        'curves':[{'coefficients':[-1,0,9],'domain':[-3.4,3.4]}],
        'segments':[{'from':[-2,5],'to':[2,5]}],
        'labels':[{'at':[0,9],'text':'9','dx':-16,'dy':-3}, {'at':[-3,0],'text':'−3','dy':22},
            {'at':[3,0],'text':'3','dy':22},{'at':[0,0],'text':'O','dx':-16,'dy':22},
            {'at':[1.5,9],'text':'y = 9 − x²','dx':22,'dy':-8}]},
}

def render_graph(spec):
    from core.figure_svg import line as engine_line, curve_path, txt
    def num(v):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 10000:
            raise ValueError('그래프 좌표는 유한한 수여야 합니다.')
        return float(v)
    def point(value):
        if not isinstance(value, list) or len(value) != 2: raise ValueError('그래프 점은 [x,y]여야 합니다.')
        return num(value[0]), num(value[1])
    xlo, xhi = point(spec.get('xRange')); ylo, yhi = point(spec.get('yRange'))
    if xhi <= xlo or yhi <= ylo: raise ValueError('그래프 좌표 범위가 올바르지 않습니다.')
    w = min(640, max(240, num(spec.get('width', 520)))); h = min(640, max(200, num(spec.get('height', 460))))
    pad = 48
    def screen(p):
        x,y = point(p)
        return (pad+(x-xlo)/(xhi-xlo)*(w-2*pad), h-pad-(y-ylo)/(yhi-ylo)*(h-2*pad))
    def xy(p): return ' '.join(f'{v:.3f}' for v in screen(p))
    def style(obj): return ' stroke-dasharray="6 4"' if obj.get('dashed') else ''
    def items(key):
        value=spec.get(key,[])
        if not isinstance(value,list) or len(value)>100 or any(not isinstance(i,dict) for i in value): raise ValueError(f'{key}는 최대 100개의 객체 목록이어야 합니다.')
        return value
    out=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}">']
    def line(a,b,obj=None,sw=1.7):
        obj=obj or {}; x1,y1=screen(a);x2,y2=screen(b)
        out.append(engine_line((x1,y1),(x2,y2),w=sw,dash='6 4' if obj.get('dashed') else None))
        if obj.get('arrow'):
            length=math.hypot(x2-x1,y2-y1)
            if length>0:
                ux=(x2-x1)/length;uy=(y2-y1)/length
                points=f'{x2:.3f},{y2:.3f} {x2-8*ux+3*uy:.3f},{y2-8*uy-3*ux:.3f} {x2-8*ux-3*uy:.3f},{y2-8*uy+3*ux:.3f}'
                out.append(f'<polygon points="{points}" fill="#111"/>')
    if spec.get('axes',True):
        if ylo<=0<=yhi: line([xlo,0],[xhi,0],{'arrow':True},1.4)
        if xlo<=0<=xhi: line([0,ylo],[0,yhi],{'arrow':True},1.4)
    for polygon in items('polygons'):
        points=polygon.get('points',[])
        if not isinstance(points,list) or not 3<=len(points)<=100: raise ValueError('다각형은 3~100개 점이 필요합니다.')
        fill=polygon.get('fill','none')
        if fill!='none' and (not isinstance(fill,str) or len(fill)!=7 or any(c not in '#0123456789abcdefABCDEF' for c in fill)): raise ValueError('채우기 색은 #RRGGBB여야 합니다.')
        out.append(f'<polygon points="{" ".join(xy(p) for p in points)}" fill="{fill}" stroke="#111" stroke-width="1.7"{style(polygon)}/>')
    for curve in items('curves'):
        lo,hi=point(curve.get('domain',[xlo,xhi]));lo=max(lo,xlo);hi=min(hi,xhi)
        coeff=curve.get('coefficients')
        if curve.get('type')=='inverse':
            k=num(curve.get('k'))
            def fn(x): return k/x if abs(x)>1e-8 else math.nan
        else:
            if not isinstance(coeff,list) or not 1<=len(coeff)<=8: raise ValueError('다항식 계수 목록이 필요합니다.')
            coeff=[num(c) for c in coeff]
            def fn(x):
                value=0
                for c in coeff: value=value*x+c
                return value
        runs=[];points=[]
        for i in range(401):
            x=lo+(hi-lo)*i/400;y=fn(x)
            if not math.isfinite(y) or not ylo<=y<=yhi:
                if len(points)>1:runs.append(points)
                points=[];continue
            points.append(screen([x,y]))
        if len(points)>1:runs.append(points)
        for points in runs:out.append(curve_path(points,w=2,dash='6 4' if curve.get('dashed') else None))
    for segment in items('segments'): line(segment.get('from'),segment.get('to'),segment)
    for circle in items('circles'):
        cx,cy=screen(circle.get('center'));r=num(circle.get('radius'))
        if r<=0:raise ValueError('원의 반지름은 양수여야 합니다.')
        out.append(f'<ellipse cx="{cx:.3f}" cy="{cy:.3f}" rx="{r/(xhi-xlo)*(w-2*pad):.3f}" ry="{r/(yhi-ylo)*(h-2*pad):.3f}" fill="none" stroke="#111" stroke-width="1.7"{style(circle)}/>')
    labels=items('labels')
    if spec.get('axes',True):
        if ylo<=0<=yhi: labels=labels+[{'at':[xhi,0],'text':'x','dx':4,'dy':23}]
        if xlo<=0<=xhi: labels=labels+[{'at':[0,yhi],'text':'y','dx':-13,'dy':-8}]
    for label in labels:
        x,y=screen(label.get('at'));x+=num(label.get('dx',0));y+=num(label.get('dy',0));size=min(48,max(10,num(label.get('size',20))))
        text=label.get('text','')
        if not isinstance(text,str) or len(text)>100:raise ValueError('그래프 라벨은 100자 이하여야 합니다.')
        anchor=label.get('anchor','middle')
        if anchor not in ('start','middle','end'):raise ValueError('라벨 정렬 값이 올바르지 않습니다.')
        out.append(txt(x,y,text,fs=size,anc=anchor))
    return ''.join(out)+'</svg>'
