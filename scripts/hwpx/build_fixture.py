from pathlib import Path
import json
import zipfile
from writer import build_parts

folder=Path('.checks.local/hwpx')
data=json.loads((folder/'layout.json').read_text(encoding='utf-8'))
parts=build_parts(data)
(folder/'parts.json').write_text(json.dumps(parts,ensure_ascii=False),encoding='utf-8')
with zipfile.ZipFile(folder/'templates.hwpx','w') as z:
    for name,value in parts.items():z.writestr(name,value)
    for p in folder.glob('image*.png'):z.write(p,'BinData/'+p.name)
print('pages',len(data['pages']),'objects',sum(len(p['objects']) for p in data['pages']),'XML bytes',sum(len(s.encode('utf-8')) for s in parts.values()))
