# -*- coding: utf-8 -*-
"""golden baseline 재생성 — testchange content_parser 원본을 픽스처에 통과시켜 블록 덤프.

contentParser.ts(웹 이식본)가 testchange content_parser.py 와 byte 동치인지 검증하는
golden-file 하니스의 *기준값 생성기*. 이식본을 고치거나 content_parser.py 가 바뀌면 재실행:

    # testchange 체크아웃 위치를 환경변수로 (기본 F:\\시험지변환기)
    set TESTCHANGE_DIR=F:\\시험지변환기   (PowerShell: $env:TESTCHANGE_DIR="...")
    python scripts/contentParserGolden.py        # → contentParserGolden.baseline.json 갱신

그 뒤 TS 비교는 testchange 없이도 standalone 실행:
    npx tsx scripts/contentParserGoldenHarness.mts   # baseline.json 과 대조 (25/25 기대)

CLAUDE.md §35 참고.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TESTCHANGE_DIR = os.environ.get("TESTCHANGE_DIR", r"F:\\시험지변환기")
sys.path.insert(0, TESTCHANGE_DIR)

try:
    from core.content_parser import parse_ocr_response  # noqa: E402
    from models.exam_document import ContentType  # noqa: E402
except ImportError as e:
    sys.stderr.write(
        f"[golden] testchange 임포트 실패 ({e}). TESTCHANGE_DIR 를 testchange 체크아웃 경로로 "
        f"설정하세요 (현재: {TESTCHANGE_DIR}).\n"
    )
    sys.exit(2)


def type_str(t):
    return t.value if isinstance(t, ContentType) else str(t)


def dump_blocks(blocks):
    return [[type_str(b.type), b.value or ""] for b in blocks]


def main():
    with open(os.path.join(HERE, "contentParserGolden.fixtures.json"), encoding="utf-8") as f:
        fixtures = json.load(f)

    out = []
    for fx in fixtures:
        q_data = {
            "number": 1,
            "contents": fx.get("contents", []),
            "choices": fx.get("choices", []),
        }
        page = parse_ocr_response({"header": "", "questions": [q_data]}, 1)
        q = page.questions[0]
        out.append(
            {
                "name": fx["name"],
                "contents": dump_blocks(q.contents),
                "choices": [dump_blocks(c.contents) for c in q.choices],
            }
        )

    with open(os.path.join(HERE, "contentParserGolden.baseline.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[golden] wrote contentParserGolden.baseline.json: {len(out)} fixtures (TESTCHANGE_DIR={TESTCHANGE_DIR})")


if __name__ == "__main__":
    main()
