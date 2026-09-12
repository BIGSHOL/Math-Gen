"""Local Hancom QA: edit actual body text, save, reopen and inspect the native XML."""
from pathlib import Path
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
import pythoncom
from win32com.client import DispatchEx
from writer import build_parts,NS,tag

folder=Path('.checks.local/hwpx').resolve()
layout=json.loads((folder/'layout.json').read_text(encoding='utf-8'))
parts=build_parts({'title':'편집 검증','pages':[layout['pages'][3]]})
source=folder/'editable.hwpx';destination=folder/'edited.hwpx'
with zipfile.ZipFile(source,'w') as package:
    for name,value in parts.items():package.writestr(name,value)
    for image in folder.glob('image*.png'):package.write(image,'BinData/'+image.name)
section=ET.fromstring(parts['Contents/section0.xml'])
assert not section.findall('.//'+tag('hp:drawText'))
assert len(section.findall('hp:p/hp:run/hp:t',NS))>10
assert all(eq.find(tag('hp:pos')).get('treatAsChar')=='1' for eq in section.findall('hp:p/hp:run/hp:equation',NS))
pythoncom.CoInitialize();hwp=DispatchEx('HWPFrame.HwpObject')
interactive='--interactive' in sys.argv
try:
    hwp.XHwpWindows.Item(0).Visible=interactive
    hwp.SetMessageBoxMode(0xFFFFFF);hwp.RegisterModule('FilePathCheckDLL','FilePathCheckerModule')
    assert hwp.Open(str(source),'HWPX','forceopen:true')
    if interactive:
        import win32process
        window=int(hwp.XHwpWindows.Item(0).WindowHandle)
        print(json.dumps({'window':window,'pid':win32process.GetWindowThreadProcessId(window)[1]}),flush=True)
        for line in sys.stdin:
            command=line.strip()
            if command=='inspect':print(json.dumps({'position':hwp.GetPos(),'text':hwp.GetTextFile('TEXT','')}),flush=True)
            if command=='save':
                assert hwp.SaveAs(str(destination),'HWPX','')
                print('SAVED',flush=True)
            if command=='quit':break
    else:
        # Position 0 is the actual body list, not a shape/table's sub-list.
        assert hwp.SetPos(0,1,0)
        assert hwp.GetPos()[0]==0
        edit=hwp.HParameterSet.HInsertText
        hwp.HAction.GetDefault('InsertText',edit.HSet);edit.Text='편집검증 '
        assert hwp.HAction.Execute('InsertText',edit.HSet)
        assert hwp.SaveAs(str(destination),'HWPX','')
        assert hwp.Open(str(destination),'HWPX','forceopen:true')
        assert '편집검증' in hwp.GetTextFile('TEXT','')
        with zipfile.ZipFile(destination) as package:
            reopened=ET.fromstring(package.read('Contents/section0.xml'))
        body_text=''.join(n.text or '' for n in reopened.findall('hp:p/hp:run/hp:t',NS))
        assert '편집검증' in body_text
        assert not reopened.findall('.//'+tag('hp:drawText'))
        assert reopened.findall('hp:p/hp:run/hp:equation',NS)
        print('PASS native body caret, typing, save/reopen, inline equations and absence of shape text',flush=True)
finally:
    hwp.Quit();pythoncom.CoUninitialize()
