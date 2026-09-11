"""stdin FigureSpec JSON -> sanitized SVG JSON, UTF-8 on every platform."""
import sys, json
from service import render

def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        raw = sys.stdin.read(65537)
        if len(raw.encode("utf-8")) > 65536: raise ValueError("도형 스펙이 너무 큽니다.")
        result = render(json.loads(raw))
    except Exception as exc:
        result = {"error": str(exc)[:300]}
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__": main()
