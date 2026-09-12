"""Recover testchange PDF-point figure crops without changing OCR text or the source PDFs."""
import argparse
import base64
import json
import re
from pathlib import Path
import fitz


def figures(q):
    for b in q.get('contents') or []:
        if b.get('type') in ('figure', 'image'):
            yield b
    for child in (q.get('choices') or []) + (q.get('sub_questions') or []):
        yield from figures(child)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rows', required=True)
    parser.add_argument('--pages', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    dest = Path(args.out)
    dest.mkdir(parents=True, exist_ok=True)
    grouped = {}
    for q in json.loads(Path(args.rows).read_text(encoding='utf-8-sig')):
        grouped.setdefault(q['exam_id'], []).append(q)
    total, missing, rejected = 0, [], []
    for exam_id, questions in grouped.items():
        source = Path(args.pages) / str(exam_id) / 'src.pdf'
        if not source.is_file():
            missing.append(exam_id)
            continue
        crops, moves = {}, {}
        with fitz.open(source) as pdf:
            numbers = {q['number']: q['id'] for q in questions}
            anchors = []
            for page in pdf:
                found = []
                for block in page.get_text('dict')['blocks']:
                    for line in block.get('lines', []):
                        text = ''.join(span['text'] for span in line.get('spans', []))
                        match = re.match(r'^\s*(\d{1,3})\.\s+', text)
                        x, y = line['bbox'][:2]
                        fraction = x / page.rect.width
                        if match and int(match[1]) in numbers and (fraction < .15 or .48 < fraction < .64):
                            found.append((0 if fraction < .5 else 1, y, int(match[1])))
                anchors.append(found)
            for q in questions:
                for b in figures(q['body']):
                    if b.get('crop') or b.get('svg') or b.get('spec'):
                        continue
                    box, page = b.get('bbox'), b.get('page')
                    if not isinstance(box, list) or len(box) != 4 or not isinstance(page, int) or not 1 <= page <= len(pdf):
                        rejected.append(q['id'])
                        continue
                    rect = fitz.Rect(box)
                    if rect.is_empty or rect.is_infinite or not pdf[page - 1].rect.contains(rect):
                        rejected.append(q['id'])
                        continue
                    scale = min(3, 1600 / max(rect.width, rect.height))
                    pix = pdf[page - 1].get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
                    key = f"{q['id']}:{page}:" + ','.join(format(x, 'g') for x in box)
                    crops[key] = 'data:image/png;base64,' + base64.b64encode(pix.tobytes('png')).decode('ascii')
                    column = 0 if (rect.x0 + rect.x1) / 2 < pdf[page - 1].rect.width / 2 else 1
                    candidates = [a for a in anchors[page - 1] if a[0] == column and a[1] < rect.y0]
                    if candidates:
                        owner = max(candidates, key=lambda a: a[1])[2]
                        if owner != q['number']:
                            moves[key] = numbers[owner]
        if crops:
            (dest / f'{exam_id}.json').write_text(json.dumps({'schema': 1, 'crops': crops, 'moves': moves}, separators=(',', ':')), encoding='utf-8')
            total += len(crops)
    (dest / 'report.local.json').write_text(json.dumps({'missingSourceExams': missing, 'rejectedQuestionIds': rejected}), encoding='utf-8')
    print(json.dumps({'recovered': total, 'missingSourceExams': len(missing), 'missingOrInvalidCoordinates': len(rejected)}))


if __name__ == '__main__':
    main()
