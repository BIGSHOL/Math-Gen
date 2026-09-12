"""Build editable HWPX objects at the positions measured in the print preview.

No COM, installed Hancom, or third party Python runtime dependency is required.
Image bytes stay in the browser; this returns XML package parts and image refs.
"""
from pathlib import Path
from copy import deepcopy
from datetime import datetime, timezone
import math
import re
import sys
import xml.etree.ElementTree as ET

VENDOR = Path(__file__).resolve().parents[2] / 'vendor' / 'hwpx'
sys.path.insert(0, str(VENDOR))
from latex_to_hwpeq import latex_to_hwpeq

NS = {'hp':'http://www.hancom.co.kr/hwpml/2011/paragraph', 'hc':'http://www.hancom.co.kr/hwpml/2011/core',
      'hh':'http://www.hancom.co.kr/hwpml/2011/head', 'hs':'http://www.hancom.co.kr/hwpml/2011/section',
      'opf':'http://www.idpf.org/2007/opf/'}
for prefix, uri in NS.items(): ET.register_namespace(prefix, uri)
def tag(name):
    prefix, local = name.split(':'); return '{'+NS[prefix]+'}'+local
def add(parent, tag_name, **attrs): return ET.SubElement(parent, tag(tag_name), {key:str(value) for key,value in attrs.items()})
def units(value): return round(float(value) * 75)  # CSS px at 96dpi -> 1/7200 inch
def xml(node): return ET.tostring(node, encoding='unicode', xml_declaration=True)

def build_parts(payload):
    pages = payload.get('pages')
    if not isinstance(pages, list) or not 1 <= len(pages) <= 120: raise ValueError('내보낼 페이지는 1~120쪽이어야 합니다.')
    parts = {str(p.relative_to(VENDOR/'template')).replace('\\','/'):p.read_text(encoding='utf-8') for p in (VENDOR/'template').rglob('*') if p.is_file()}
    head = ET.fromstring(parts['Contents/header.xml'])
    section = ET.fromstring(parts['Contents/section0.xml'])
    first = section.find(tag('hp:p')); sec_run = deepcopy(first.find(tag('hp:run')))
    section.clear()
    page_pr = sec_run.find('.//'+tag('hp:pagePr')); page_pr.set('width','59528');page_pr.set('height','84189')
    margin = page_pr.find(tag('hp:margin'))
    for key in margin.attrib: margin.set(key,'0')
    para_props = head.find('.//'+tag('hh:paraProperties'))
    basic_para = deepcopy(para_props[0]); basic_para.set('id',str(len(para_props)))
    basic_para.set('snapToGrid','0')
    basic_para.find(tag('hh:align')).set('horizontal','LEFT')
    for node in basic_para.iter(tag('hh:lineSpacing')): node.set('value','100')
    para_props.append(basic_para); para_props.set('itemCnt',str(len(para_props)))
    para_id = basic_para.get('id')
    char_props = head.find('.//'+tag('hh:charProperties')); char_base = deepcopy(char_props[0])
    font_faces = head.findall('.//'+tag('hh:fontface'))
    styles = {}; fonts = {}; counter = 100000; images = []
    def char_style(item):
        font = str(item.get('font','함초롬바탕'))[:100]
        key = (font, units(item.get('fontSize',14)), item.get('color','#111111'),bool(item.get('bold')),bool(item.get('italic')),bool(item.get('underline')),round(item.get('letterSpacing',0)/max(1,item.get('fontSize',14))*100))
        if key in styles: return styles[key]
        if font not in fonts:
            font_id = max(int(n.get('id','0')) for f in font_faces for n in f)+1
            for face in font_faces:
                node=deepcopy(face[0]);node.set('id',str(font_id));node.set('face',font);face.append(node);face.set('fontCnt',str(len(face)))
            fonts[font] = str(font_id)
        node = deepcopy(char_base); node.set('id',str(len(char_props)));node.set('height',str(key[1]));node.set('textColor',str(key[2]))
        for attr in node.find(tag('hh:fontRef')).attrib: node.find(tag('hh:fontRef')).set(attr, fonts[font])
        for attr in node.find(tag('hh:spacing')).attrib: node.find(tag('hh:spacing')).set(attr,str(key[6]))
        if key[3]: add(node,'hh:bold')
        if key[4]: add(node,'hh:italic')
        if key[5]: node.find(tag('hh:underline')).set('type','BOTTOM')
        char_props.append(node);styles[key]=node.get('id');return styles[key]
    def paragraph(parent, page_break=False):
        nonlocal counter
        counter+=1
        return add(parent,'hp:p',id=counter,paraPrIDRef=para_id,styleIDRef=0,pageBreak=int(page_break),columnBreak=0,merged=0)
    def line_info(p,width,height=100):
        add(add(p,'hp:linesegarray'),'hp:lineseg',textpos=0,vertpos=0,vertsize=height,textheight=height,baseline=round(height*.85),spacing=0,horzpos=0,horzsize=width,flags=393216)
    def placement(node,item):
        w,h=units(item['w']),units(item['h'])
        add(node,'hp:sz',width=w,height=h,widthRelTo='ABSOLUTE',heightRelTo='ABSOLUTE',protect=0)
        add(node,'hp:pos',treatAsChar=0,affectLSpacing=0,flowWithText=0,allowOverlap=1,holdAnchorAndSO=0,vertRelTo='PAPER',horzRelTo='PAPER',vertAlign='TOP',horzAlign='LEFT',vertOffset=units(item['y']),horzOffset=units(item['x']))
        add(node,'hp:outMargin',left=0,right=0,top=0,bottom=0)
    def shape(run, kind, item, order):
        nonlocal counter
        counter+=1; w,h=units(item['w']),units(item['h'])
        node=add(run,'hp:'+kind,id=counter,zOrder=order,numberingType='NONE',textWrap='IN_FRONT_OF_TEXT',textFlow='BOTH_SIDES',lock=0,dropcapstyle='None',href='',groupLevel=0,instid=counter+100000,**({'ratio':0} if kind=='rect' else {'reverse':0}))
        add(node,'hp:offset',x=0,y=0);add(node,'hp:orgSz',width=w,height=h);add(node,'hp:curSz',width=w,height=h)
        add(node,'hp:flip',horizontal=0,vertical=0);add(node,'hp:rotationInfo',angle=0,centerX=w//2,centerY=h//2,rotateimage=1)
        render=add(node,'hp:renderingInfo')
        for matrix in ['transMatrix','scaMatrix','rotMatrix']:add(render,'hc:'+matrix,e1=1,e2=0,e3=0,e4=0,e5=1,e6=0)
        return node
    for page_index,page in enumerate(pages):
        objects=page.get('objects',[])
        if not isinstance(objects,list) or len(objects)>12000:raise ValueError('페이지의 요소 수가 너무 많습니다.')
        p=paragraph(section,page_index>0)
        if page_index==0:p.append(sec_run)
        run=add(p,'hp:run',charPrIDRef=0)
        for order,item in enumerate(objects):
            for key in ['x','y','w','h']:
                if not isinstance(item.get(key),(int,float)) or not math.isfinite(item[key]) or abs(item[key])>12000:raise ValueError('잘못된 요소 위치입니다.')
            if item['w']<=0 or item['h']<=0:continue
            kind=item.get('type');w,h=units(item['w']),units(item['h'])
            if kind=='equation':
                latex=str(item.get('latex',''))
                if len(latex)>16000:raise ValueError('수식이 너무 깁니다.')
                counter+=1
                node=add(run,'hp:equation',id=counter,zOrder=order,numberingType='EQUATION',textWrap='IN_FRONT_OF_TEXT',textFlow='BOTH_SIDES',lock=0,dropcapstyle='None',version='Equation Version 60',baseLine=85,textColor=item.get('color','#111111'),baseUnit=units(item.get('fontSize',14)),lineMode='CHAR',font='HYhwpEQ')
                placement(node,item);add(node,'hp:shapeComment').text=latex
                # KaTeX's CSS-only arc wrapper has a native HWP equation equivalent.
                native_latex=re.sub(r'\\htmlClass\{geom-arc-wrap\}',r'\\widehat',latex)
                add(node,'hp:script').text=latex_to_hwpeq(native_latex)
            elif kind=='image':
                image_id=str(item.get('imageId',''))
                if not image_id.startswith('image') or not image_id[5:].isdigit():raise ValueError('잘못된 그림 참조입니다.')
                if image_id not in images:images.append(image_id)
                node=shape(run,'pic',item,order)
                rect=add(node,'hp:imgRect')
                for i,(x,y) in enumerate([(0,0),(w,0),(w,h),(0,h)]):add(rect,'hc:pt'+str(i),x=x,y=y)
                # Hancom's own PNG export uses zero crop and img AFTER imgClip/inMargin.
                add(node,'hp:imgClip',left=0,right=0,top=0,bottom=0);add(node,'hp:inMargin',left=0,right=0,top=0,bottom=0)
                add(node,'hc:img',binaryItemIDRef=image_id,bright=0,contrast=0,effect='REAL_PIC',alpha=0)
                add(node,'hp:effects');placement(node,item)
            elif kind in ('text','rect'):
                node=shape(run,'rect',item,order)
                add(node,'hp:lineShape',color='#000000',width=0,style='NONE',endCap='FLAT',headStyle='NORMAL',tailStyle='NORMAL',headfill=0,tailfill=0,headSz='MEDIUM_MEDIUM',tailSz='MEDIUM_MEDIUM',outlineStyle='NORMAL',alpha=0)
                if kind=='rect':add(add(node,'hc:fillBrush'),'hc:winBrush',faceColor=item.get('color','#FFFFFF'),hatchColor='#000000',alpha=0)
                add(node,'hp:shadow',type='NONE',color='#B2B2B2',offsetX=0,offsetY=0,alpha=0)
                if kind=='text':
                    draw=add(node,'hp:drawText',lastWidth=w,name='',editable=1)
                    sub=add(draw,'hp:subList',id='',textDirection='HORIZONTAL',lineWrap='SQUEEZE',vertAlign='CENTER',linkListIDRef=0,linkListNextIDRef=0,textWidth=w,textHeight=h,hasTextRef=0,hasNumRef=0)
                    text_p=paragraph(sub);text_run=add(text_p,'hp:run',charPrIDRef=char_style(item));add(text_run,'hp:t').text=str(item.get('text',''))[:16000]
                    line_info(text_p,w,units(item.get('fontSize',14)));add(draw,'hp:textMargin',left=0,right=0,top=0,bottom=0)
                for i,(x,y) in enumerate([(0,0),(w,0),(w,h),(0,h)]):add(node,'hc:pt'+str(i),x=x,y=y)
                placement(node,item)
            else:raise ValueError('지원하지 않는 출력 요소입니다.')
        add(run,'hp:t');line_info(p,59528)
    char_props.set('itemCnt',str(len(char_props)))
    package=ET.fromstring(parts['Contents/content.hpf']);manifest=package.find(tag('opf:manifest'))
    for image_id in images:add(manifest,'opf:item',id=image_id,href='BinData/'+image_id+'.png',**{'media-type':'image/png','isEmbeded':'1'})
    metadata=package.find(tag('opf:metadata'))
    for node in metadata:
        if node.tag==tag('opf:title'):node.text=str(payload.get('title','시험지'))[:200]
        elif node.get('name') in ['creator','lastsaveby']:node.text='MathGen'
        elif node.get('name') in ['CreatedDate','ModifiedDate','date']:node.text=datetime.now(timezone.utc).isoformat()
    parts['Contents/content.hpf']=xml(package);parts['Contents/header.xml']=xml(head);parts['Contents/section0.xml']=xml(section)
    parts['Preview/PrvText.txt']='\n'.join(str(o.get('text',o.get('latex',''))) for page in pages for o in page['objects'] if o['type'] in ('text','equation'))
    return parts
