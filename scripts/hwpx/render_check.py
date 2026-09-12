"""Local QA only. The deployed writer never imports or needs Hancom COM."""
import sys
from pathlib import Path
import pythoncom
from win32com.client import DispatchEx
import fitz

source=Path(sys.argv[1]).resolve(); destination=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else source.with_suffix('.pdf')
pythoncom.CoInitialize()
hwp=DispatchEx('HWPFrame.HwpObject')
try:
    hwp.XHwpWindows.Item(0).Visible=False
    hwp.SetMessageBoxMode(0xFFFFFF)
    hwp.RegisterModule('FilePathCheckDLL','FilePathCheckerModule')
    print('Opening native document',flush=True)
    if not hwp.Open(str(source),'HWPX','forceopen:true'):raise RuntimeError('Hancom rejected HWPX')
    print('Rendering native document',flush=True)
    if not hwp.SaveAs(str(destination),'PDF',''):raise RuntimeError('Hancom PDF render failed')
finally:
    hwp.Quit();pythoncom.CoUninitialize()
doc=fitz.open(destination)
for i,page in enumerate(doc):page.get_pixmap(dpi=120).save(str(source.with_suffix(''))+f'-{i+1}.png')
print('Pages:',len(doc),'Text characters:',[len(page.get_text()) for page in doc])
