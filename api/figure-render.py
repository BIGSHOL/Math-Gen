"""Authenticated Python Vercel function; same engine as the local CLI."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
import json
import os
import sys
import urllib.request
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts' / 'figure'))
from service import render

class handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        token = self.headers.get('Authorization', '')
        if not token.startswith('Bearer '):
            return self.reply(401, {'error': '로그인이 필요합니다.'})
        base = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL', '')
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
        if not base or not key:
            return self.reply(503, {'error': '인증 서버가 설정되지 않았습니다.'})
        try:
            request = urllib.request.Request(base.rstrip('/') + '/auth/v1/user', headers={'Authorization': token, 'apikey': key})
            with urllib.request.urlopen(request, timeout=10) as response:
                if not json.load(response).get('id'):
                    return self.reply(401, {'error': '로그인이 필요합니다.'})
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                return self.reply(401, {'error': '로그인이 필요합니다.'})
            return self.reply(503, {'error': '인증 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.'})
        except Exception:
            return self.reply(503, {'error': '인증 서버에 연결하지 못했습니다.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 65536:
                return self.reply(413, {'error': '도형 스펙은 64KB 이하여야 합니다.'})
            body = json.loads(self.rfile.read(size))
            result = render(body.get('spec'))
            return self.reply(200, result)
        except (ValueError, TypeError, KeyError) as exc:
            return self.reply(422, {'error': str(exc)[:300]})
        except Exception:
            return self.reply(500, {'error': '도형 엔진 실행에 실패했습니다.'})

    def do_GET(self):
        self.reply(405, {'error': 'POST only'})
