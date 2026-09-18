"""Local QA only: measure HWP equation boxes with Hancom itself (COM).

Ground truth for eqsize.py. Re-run it against a list of real equation scripts after a
Hancom update or when eqsize changes, and compare hwpeq_width() with the result.

usage: py -3.11 eq_measure.py IN.json OUT.json [base_pt]
IN.json  = list of HWP equation scripts
OUT.json = list of {"script", "w", "h", "baseLine"} in HWPUNIT, same order

Inserts each script exactly like the engine's HwpSession.equation (one cached HEqEdit
set, TreatAsChar, HYhwpEQ), saves HWPX and reads back Hancom's own <hp:sz>.
"""
import html
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

import win32com.client as win32

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
base_pt = float(sys.argv[3]) if len(sys.argv) > 3 else 10.0
scripts = json.loads(src.read_text(encoding="utf-8"))

hwp = win32.dynamic.Dispatch("HWPFrame.HwpObject")
try:
    hwp.SetMessageBoxMode(0xFFFFFF)
    hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    try:
        hwp.XHwpWindows.Item(0).Visible = False
    except Exception:
        pass
    for script in scripts:
        eq = hwp.HParameterSet.HEqEdit
        hwp.HAction.GetDefault("EquationCreate", eq.HSet)
        eq.string = script
        eq.BaseUnit = hwp.PointToHwpUnit(base_pt)
        eq.TreatAsChar = 1
        eq.EqFontName = "HYhwpEQ"
        hwp.HAction.Execute("EquationCreate", eq.HSet)
        hwp.HAction.Run("Close")
        hwp.HAction.Run("BreakPara")
    out = Path(tempfile.mkdtemp()) / "measure.hwpx"
    hwp.SaveAs(str(out), "HWPX", "")
finally:
    try:
        hwp.Clear(1)
    except Exception:
        pass
    hwp.Quit()

xml = zipfile.ZipFile(out).read("Contents/section0.xml").decode("utf-8")
found = re.findall(
    r'<hp:equation\b([^>]*)>.*?<hp:sz width="(\d+)"[^>]*? height="(\d+)".*?<hp:script>(.*?)</hp:script>',
    xml, re.S)
rows = [{"script": inp, "hancom": html.unescape(sc), "w": int(w), "h": int(h),
         "baseLine": int(re.search(r'baseLine="(\d+)"', attrs).group(1))}
        for inp, (attrs, w, h, sc) in zip(scripts, found)]
if len(rows) != len(scripts):
    raise SystemExit(f"measured {len(rows)} of {len(scripts)} equations")
dst.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
print(f"measured {len(rows)} at {base_pt}pt -> {dst}")
