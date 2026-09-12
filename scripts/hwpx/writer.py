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
    # We emit the 1.2 vocabulary supported by Hancom 2022, not the scaffold creator's 1.5 format.
    head.set('version','1.2')
    version=ET.fromstring(parts['version.xml'])
    for key,value in {'micro':'0','buildNumber':'1','xmlVersion':'1.2','application':'MathGen','appVersion':'1, 0, 0, 0'}.items():version.set(key,value)
    parts['version.xml']=xml(version)
    section_template = ET.fromstring(parts['Contents/section0.xml'])
    sec_template = deepcopy(section_template.find(tag('hp:p')).find(tag('hp:run')))
    para_props = head.find('.//'+tag('hh:paraProperties'))
    # A 1.2 document stores these directly rather than conditional 1.5 branches.
    for prop in para_props:
        for switch in list(prop.findall(tag('hp:switch'))):
            branch=switch.find(tag('hp:case'))
            position=list(prop).index(switch)
            for offset,child in enumerate(list(branch)):prop.insert(position+offset,deepcopy(child))
            prop.remove(switch)
    basic_para = deepcopy(para_props[0]); basic_para.set('id',str(len(para_props)))
    basic_para.set('snapToGrid','0')
    basic_para.find(tag('hh:align')).set('horizontal','LEFT')
    for node in basic_para.iter(tag('hh:lineSpacing')): node.set('value','100')
    para_props.append(basic_para); para_props.set('itemCnt',str(len(para_props)))
    para_id = basic_para.get('id')
    paragraph_styles = {}
    def paragraph_style(left=0, before=0, height=1):
        # Paragraph margins use half-HWPUNIT values in Hancom's 1.2 reader.
        key=(units(max(0,left))*2,units(max(0,before))*2,units(max(1,height)))
        if key in paragraph_styles:return paragraph_styles[key]
        node=deepcopy(basic_para);node.set('id',str(len(para_props)))
        for margin in node.iter(tag('hh:margin')):
            for name,value in [('left',key[0]),('prev',key[1]),('next',0),('intent',0),('right',0)]:
                margin.find(tag('hc:'+name)).set('value',str(value))
        for spacing in node.iter(tag('hh:lineSpacing')):
            spacing.set('type','PERCENT');spacing.set('value','100')
        para_props.append(node);paragraph_styles[key]=node.get('id')
        return node.get('id')
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
    def paragraph(parent, page_break=False, style=None, column_break=False):
        nonlocal counter
        counter+=1
        return add(parent,'hp:p',id=counter,paraPrIDRef=style or para_id,styleIDRef=0,pageBreak=int(page_break),columnBreak=int(column_break),merged=0)
    def line_info(p,width,height=100,y=0,x=0,baseline=None):
        add(add(p,'hp:linesegarray'),'hp:lineseg',textpos=0,vertpos=y,vertsize=height,textheight=height,baseline=round(height*.85) if baseline is None else baseline,spacing=0,horzpos=x,horzsize=width,flags=393216)
    def placement(node,item,inline=False):
        w,h=units(item['w']),units(item['h'])
        add(node,'hp:sz',width=w,height=h,widthRelTo='ABSOLUTE',heightRelTo='ABSOLUTE',protect=0)
        add(node,'hp:pos',treatAsChar=int(inline),affectLSpacing=0,flowWithText=int(inline),allowOverlap=int(not inline),holdAnchorAndSO=0,vertRelTo='PARA' if inline else 'PAPER',horzRelTo='PARA' if inline else 'PAPER',vertAlign='TOP',horzAlign='LEFT',vertOffset=0 if inline else units(item['y']),horzOffset=0 if inline else units(item['x']))
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
    def emit_object(run,item,order,inline=False):
        nonlocal counter
        kind=item['type'];w,h=units(item['w']),units(item['h'])
        if kind=='text':
            add(run,'hp:t').text=str(item.get('text',''))[:16000]
        elif kind=='equation':
            latex=str(item.get('latex',''))
            if len(latex)>16000:raise ValueError('수식이 너무 깁니다.')
            counter+=1
            baseline=round(100*(item.get('baseline',item['y']+item['h']*.85)-item['y'])/item['h'])
            node=add(run,'hp:equation',id=counter,zOrder=order,numberingType='EQUATION',textWrap='TOP_AND_BOTTOM' if inline else 'IN_FRONT_OF_TEXT',textFlow='BOTH_SIDES',lock=0,dropcapstyle='None',version='Equation Version 60',baseLine=max(0,min(100,baseline)),textColor=item.get('color','#111111'),baseUnit=units(item.get('fontSize',14)),lineMode='CHAR',font='HYhwpEQ')
            placement(node,item,inline);add(node,'hp:shapeComment').text=latex
            native_latex=re.sub(r'\\htmlClass\{geom-arc-wrap\}',r'\\widehat',latex)
            add(node,'hp:script').text=latex_to_hwpeq(native_latex)
        elif kind=='image':
            image_id=str(item.get('imageId',''))
            if not image_id.startswith('image') or not image_id[5:].isdigit():raise ValueError('잘못된 그림 참조입니다.')
            if image_id not in images:images.append(image_id)
            node=shape(run,'pic',item,order)
            if inline:node.set('textWrap','TOP_AND_BOTTOM')
            rect=add(node,'hp:imgRect')
            for i,(x,y) in enumerate([(0,0),(w,0),(w,h),(0,h)]):add(rect,'hc:pt'+str(i),x=x,y=y)
            add(node,'hp:imgClip',left=0,right=0,top=0,bottom=0);add(node,'hp:inMargin',left=0,right=0,top=0,bottom=0)
            add(node,'hc:img',binaryItemIDRef=image_id,bright=0,contrast=0,effect='REAL_PIC',alpha=0)
            add(node,'hp:effects');placement(node,item,inline)
        elif kind=='rect':
            node=shape(run,'rect',item,order);node.set('textWrap','BEHIND_TEXT')
            add(node,'hp:lineShape',color='#000000',width=0,style='NONE',endCap='FLAT',headStyle='NORMAL',tailStyle='NORMAL',headfill=0,tailfill=0,headSz='MEDIUM_MEDIUM',tailSz='MEDIUM_MEDIUM',outlineStyle='NORMAL',alpha=0)
            add(add(node,'hc:fillBrush'),'hc:winBrush',faceColor=item.get('color','#FFFFFF'),hatchColor='#000000',alpha=0)
            add(node,'hp:shadow',type='NONE',color='#B2B2B2',offsetX=0,offsetY=0,alpha=0)
            for i,(x,y) in enumerate([(0,0),(w,0),(w,h),(0,h)]):add(node,'hc:pt'+str(i),x=x,y=y)
            placement(node,item)
        else:raise ValueError('지원하지 않는 출력 요소입니다.')

    def make_rows(items):
        rows=[]
        for item in sorted(items,key=lambda o:(o.get('baseline',o['y']+o['h']*.8),o['x'])):
            baseline=item.get('baseline',item['y']+item['h']*.8)
            target=None
            if item['type']!='image':
                for row in reversed(rows):
                    if row['items'][0]['type']!='image' and abs(row['baseline']-baseline)<4:
                        target=row;break
            if target is None:
                target={'baseline':baseline,'items':[]};rows.append(target)
            target['items'].append(item)
        for row in rows:
            row['items'].sort(key=lambda o:o['x'])
            row['y']=min(o['y'] for o in row['items']);row['bottom']=max(o['y']+o['h'] for o in row['items'])
            row['x']=min(o['x'] for o in row['items']);row['right']=max(o['x']+o['w'] for o in row['items'])
            row['h']=row['bottom']-row['y']
        return sorted(rows,key=lambda r:r['y'])

    def write_row(parent,row,left=0,before=0,height=None,column_break=False):
        p=paragraph(parent,style=paragraph_style(left,before,height or row['h']),column_break=column_break)
        previous=None
        for order,item in enumerate(row['items']):
            run=add(p,'hp:run',charPrIDRef=char_style({'fontSize':1} if item['type']=='image' else item))
            if previous is not None:
                gap=item['x']-previous['x']-previous['w']
                if gap>1 and not str(previous.get('text','')).endswith(' ') and not str(item.get('text','')).startswith(' '):
                    spaces=max(1,round(gap/max(2,item.get('fontSize',14)*.3)))
                    add(run,'hp:t').text=' '*spaces
            emit_object(run,item,order,True)
            previous=item
        # Native paragraphs/equations: no drawText or bitmap text, editable with the normal caret.
        return p

    def floating_row(anchor,row):
        nonlocal counter
        counter+=1;w=units((row['right']-row['x'])*1.15+6);h=units(row['h']+2)
        node=add(anchor,'hp:tbl',id=counter,zOrder=counter,numberingType='TABLE',textWrap='IN_FRONT_OF_TEXT',textFlow='BOTH_SIDES',lock=0,dropcapstyle='None',pageBreak='NONE',repeatHeader=0,rowCnt=1,colCnt=1,cellSpacing=0,borderFillIDRef=1,noAdjust=0)
        placement(node,{'x':row['x'],'y':row['y'],'w':w/75,'h':h/75})
        add(node,'hp:inMargin',left=0,right=0,top=0,bottom=0)
        cell=add(add(node,'hp:tr'),'hp:tc',name='',header=0,hasMargin=1,protect=0,editable=1,dirty=0,borderFillIDRef=1)
        sub=add(cell,'hp:subList',id='',textDirection='HORIZONTAL',lineWrap='BREAK',vertAlign='TOP',linkListIDRef=0,linkListNextIDRef=0,textWidth=0,textHeight=0,hasTextRef=0,hasNumRef=0)
        write_row(sub,row)
        add(cell,'hp:cellAddr',colAddr=0,rowAddr=0);add(cell,'hp:cellSpan',colSpan=1,rowSpan=1)
        add(cell,'hp:cellSz',width=w,height=h);add(cell,'hp:cellMargin',left=0,right=0,top=0,bottom=0)

    for page_index,page in enumerate(pages):
        objects=page.get('objects',[])
        if not isinstance(objects,list) or len(objects)>12000:raise ValueError('페이지의 요소 수가 너무 많습니다.')
        objects=[o for o in objects if o.get('w',0)>0 and o.get('h',0)>0]
        for item in objects:
            for key in ['x','y','w','h']:
                if not isinstance(item.get(key),(int,float)) or not math.isfinite(item[key]) or abs(item[key])>12000:raise ValueError('잘못된 요소 위치입니다.')
        body=page.get('body') or {'x':40,'y':40,'w':714,'h':1030,'columns':1,'gap':0}
        for key in ['x','y','w','h','columns','gap']:
            if not isinstance(body.get(key),(int,float)) or not math.isfinite(body[key]):raise ValueError('잘못된 본문 영역입니다.')
        columns=2 if body['columns']==2 else 1
        column_width=(body['w']-body['gap'])/2 if columns==2 else body['w']
        section=ET.Element(tag('hs:sec'));sec_run=deepcopy(sec_template)
        sec_run.set('charPrIDRef',char_style({'fontSize':1}))
        page_pr=sec_run.find('.//'+tag('hp:pagePr'));page_pr.set('width','59528');page_pr.set('height','84189')
        margin=page_pr.find(tag('hp:margin'))
        for key in margin.attrib:margin.set(key,'0')
        for key,value in [('left',body['x']),('right',59528/75-body['x']-body['w']),('top',body['y']),('bottom',max(8,84189/75-body['y']-body['h']))]:margin.set(key,str(units(value)))
        col=sec_run.find('.//'+tag('hp:colPr'));col.set('colCount',str(columns));col.set('sameGap',str(units(body['gap'])))
        p=paragraph(section,style=paragraph_style(height=1));p.append(sec_run)
        anchor=add(p,'hp:run',charPrIDRef=char_style({'fontSize':1}));add(anchor,'hp:t')
        body_items=[[],[]];outside=[]
        for order,item in enumerate(objects):
            if item['type']=='rect':emit_object(anchor,item,order)
            elif item['y']>=body['y']-3 and item['y']+item['h']<=body['y']+body['h']+3 and item['x']>=body['x']-3 and item['x']<body['x']+body['w']:
                column=int(columns==2 and item['x']+item['w']/2>body['x']+body['w']/2)
                body_items[column].append(item)
            else:outside.append(item)
        # Header/footer text remains real text in editable native table cells.
        # Keep distant header fields in separate cells rather than filling gaps with spaces.
        for row in make_rows(outside):
            groups=[]
            for item in row['items']:
                if not groups or item['x']-groups[-1][-1]['x']-groups[-1][-1]['w']>18:groups.append([])
                groups[-1].append(item)
            for group in groups:
                for segment in make_rows(group):floating_row(anchor,segment)
        line_info(p,units(column_width),75)
        for column in range(columns):
            rows=make_rows(body_items[column]);cursor=body['y']+1 if column==0 else body['y']
            for index,row in enumerate(rows):
                x=body['x']+column*(column_width+body['gap'])
                before=max(0,row['y']-cursor)
                body_p=write_row(section,row,left=row['x']-x,before=before,height=row['h'],column_break=column>0 and index==0)
                row_baseline=row['bottom'] if row['items'][0]['type']=='image' else row['baseline']
                line_info(body_p,units(column_width-row['x']+x),units(row['h']),y=units(row['y']-body['y']),x=units(row['x']-x),baseline=units(row_baseline-row['y']))
                cursor=row['bottom']
        parts[f'Contents/section{page_index}.xml']=xml(section)
    char_props.set('itemCnt',str(len(char_props)))
    para_props.set('itemCnt',str(len(para_props)));head.set('secCnt',str(len(pages)))
    package=ET.fromstring(parts['Contents/content.hpf']);manifest=package.find(tag('opf:manifest'))
    spine=package.find(tag('opf:spine'))
    for i in range(1,len(pages)):
        add(manifest,'opf:item',id=f'section{i}',href=f'Contents/section{i}.xml',**{'media-type':'application/xml'})
        add(spine,'opf:itemref',idref=f'section{i}',linear='yes')
    for image_id in images:add(manifest,'opf:item',id=image_id,href='BinData/'+image_id+'.png',**{'media-type':'image/png','isEmbeded':'1'})
    metadata=package.find(tag('opf:metadata'))
    for node in metadata:
        if node.tag==tag('opf:title'):node.text=str(payload.get('title','시험지'))[:200]
        elif node.get('name') in ['creator','lastsaveby']:node.text='MathGen'
        elif node.get('name') in ['CreatedDate','ModifiedDate','date']:node.text=datetime.now(timezone.utc).isoformat()
    parts['Contents/content.hpf']=xml(package);parts['Contents/header.xml']=xml(head)
    parts['Preview/PrvText.txt']='\n'.join(str(o.get('text',o.get('latex',''))) for page in pages for o in page['objects'] if o['type'] in ('text','equation'))
    return parts
