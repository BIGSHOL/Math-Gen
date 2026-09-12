"""Native HWPX XML assembly, independent of the user's PC and loopback permissions."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
import json
import gzip
import base64
import os
import sys
import time
import urllib.request
import urllib.error
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'/'hwpx'))
from writer import build_parts

class handler(BaseHTTPRequestHandler):
    def reply(self,status,payload):
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers()
        self.wfile.write(json.dumps(payload,ensure_ascii=False).encode('utf-8'))
    def do_POST(self):
        token=self.headers.get('Authorization','')
        if not token.startswith('Bearer '):return self.reply(401,{'error':'로그인이 필요합니다.'})
        base=os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL','');key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
        if not base or not key:return self.reply(503,{'error':'인증 서버가 설정되지 않았습니다.'})
        authorized=False
        for attempt in range(2):
            try:
                req=urllib.request.Request(base.rstrip('/')+'/auth/v1/user',headers={'Authorization':token,'apikey':key})
                with urllib.request.urlopen(req,timeout=10) as response:
                    if not json.load(response).get('id'):return self.reply(401,{'error':'로그인이 필요합니다.'})
                authorized=True;break
            except urllib.error.HTTPError as error:
                if error.code in (401,403):return self.reply(401,{'error':'로그인 상태를 확인한 뒤 다시 시도해 주세요.'})
            except (urllib.error.URLError,TimeoutError,OSError,ValueError):pass
            if attempt==0:time.sleep(.25)
        if not authorized:return self.reply(503,{'error':'인증 서버에 일시적으로 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=3500000:return self.reply(413,{'error':'문서가 너무 큽니다. 나누어 내보내 주세요.'})
            parts=build_parts(json.loads(self.rfile.read(size)))
            packed=gzip.compress(json.dumps(parts,ensure_ascii=False).encode('utf-8'))
            return self.reply(200,{'partsGzip':base64.b64encode(packed).decode('ascii')})
        except (ValueError,TypeError,KeyError) as error:return self.reply(422,{'error':str(error)[:250]})
        except Exception:return self.reply(500,{'error':'HWPX 파일을 만들지 못했습니다.'})
    def do_GET(self):self.reply(405,{'error':'POST only'})
