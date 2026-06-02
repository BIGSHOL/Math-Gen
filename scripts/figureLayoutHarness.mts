// figureLayoutHarness.mts — groupFigureRows 회귀 하니스 (npx tsx scripts/figureLayoutHarness.mts)
//
// figureLayout.ts 의 행 묶음 로직을 React/DOM 없이 검증. 새 행-그룹핑 규칙 변경 시
// 먼저 여기 케이스가 통과하는지 확인.

import {
  groupFigureRows,
  assignBoxesByReadingOrder,
  type FigBox,
} from "../src/lib/figureLayout.ts";

const SVG = (id: string) => `<div data-svg-id="${id}"></div>`;
const IMG = (key: string) =>
  `<img src="data:image/png;base64,AAA" alt="작품" class="diagram-inline-img" data-fig-key="${key}" />`;
const BQ = (id: string) => `<span data-svg-id="${id}" data-svg-inline="bq"></span>`;

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
};
const rowCount = (s: string) => (s.match(/data-figure-row/g) || []).length;

// 1) 좌우 나란한 2개 (svg 왼쪽 / img 오른쪽) → 1개 figure-row, xMin 순 정렬
{
  const content = `문제 본문\n\n${SVG("0")}\n\n${IMG("img-1")}\n\n끝`;
  const boxes = new Map<string, FigBox | undefined>([
    ["0", [100, 50, 300, 200]],
    ["img-1", [100, 400, 300, 600]],
  ]);
  const out = groupFigureRows(content, boxes);
  check("1. 좌우 인접 2개 → figure-row 1개", rowCount(out) === 1, `rows=${rowCount(out)}`);
  check("1. 두 placeholder 모두 보존", out.includes('data-svg-id="0"') && out.includes('data-fig-key="img-1"'));
  check("1. flex share 주입", (out.match(/data-flexgrow/g) || []).length === 2);
  check("1. xMin 순서 (svg 가 img 앞)", out.indexOf('data-svg-id="0"') < out.indexOf('data-fig-key="img-1"'));
}

// 2) 사이에 prose → run 분리 → 묶지 않음
{
  const content = `${SVG("0")} 가운데 글자 ${IMG("img-1")}`;
  const boxes = new Map<string, FigBox | undefined>([
    ["0", [100, 50, 300, 200]],
    ["img-1", [100, 400, 300, 600]],
  ]);
  const out = groupFigureRows(content, boxes);
  check("2. prose 사이 → figure-row 없음", rowCount(out) === 0);
  check("2. 문자열 변화 없음", out === content);
}

// 3) box 전혀 없음 → 입력 그대로 (기존 데이터 no-op)
{
  const content = `${SVG("0")}\n\n${IMG("img-1")}`;
  const out = groupFigureRows(content, new Map());
  check("3. box 없음 → 동일 문자열", out === content);
}

// 4) blockquote inline svg span 은 매칭 안 됨
{
  const content = `${BQ("9")}\n\n${SVG("0")}`;
  const boxes = new Map<string, FigBox | undefined>([
    ["9", [100, 50, 300, 200]],
    ["0", [100, 400, 300, 600]],
  ]);
  const out = groupFigureRows(content, boxes);
  check("4. bq span 미매칭 → 단일 div → figure-row 없음", rowCount(out) === 0);
  check("4. 문자열 동일", out === content);
}

// 5) 3개: 2개 같은 행 + 1개 아래 → 행1(2개) + standalone
{
  const content = `${SVG("0")}\n\n${IMG("img-1")}\n\n${SVG("2")}`;
  const boxes = new Map<string, FigBox | undefined>([
    ["0", [100, 50, 300, 200]],
    ["img-1", [100, 400, 300, 600]],
    ["2", [450, 50, 650, 350]],
  ]);
  const out = groupFigureRows(content, boxes);
  check("5. figure-row 1개", rowCount(out) === 1);
  // 세 번째(아래) svg 는 figure-row 밖
  const rowStart = out.indexOf("<div data-figure-row");
  const rowEnd = out.indexOf("</div>", out.indexOf('data-fig-key="img-1"'));
  const thirdIdx = out.indexOf('data-svg-id="2"');
  check("5. 세 번째 도형은 행 밖(standalone)", thirdIdx > rowEnd, `third=${thirdIdx} rowEnd=${rowEnd}`);
  check("5. flex share 2개만(행 멤버)", (out.match(/data-flexgrow/g) || []).length === 2);
}

// 6) 세로로 쌓인 2개 (x 겹침, y 비겹침) → 묶지 않음
{
  const content = `${SVG("0")}\n\n${SVG("1")}`;
  const boxes = new Map<string, FigBox | undefined>([
    ["0", [100, 100, 250, 400]],
    ["1", [320, 100, 470, 400]],
  ]);
  const out = groupFigureRows(content, boxes);
  check("6. 세로 스택 → figure-row 없음", rowCount(out) === 0);
  check("6. 문자열 동일", out === content);
}

// 7) 2단(column) — y 겹치지만 xGap 큼 → 묶지 않음
{
  const content = `${SVG("0")}\n\n${SVG("1")}`;
  const boxes = new Map<string, FigBox | undefined>([
    ["0", [100, 50, 300, 200]], // 좌단
    ["1", [100, 620, 300, 770]], // 우단 (xGap = 620-200 = 420 > 250)
  ]);
  const out = groupFigureRows(content, boxes);
  check("7. 2단 figure → figure-row 없음", rowCount(out) === 0);
}

// 8) 무효 box (yMin>=yMax) 는 box 없음 취급 → 단독 placeholder 라 미묶음
{
  const content = `${SVG("0")}\n\n${IMG("img-1")}`;
  const boxes = new Map<string, FigBox | undefined>([
    ["0", [300, 50, 100, 200]], // 무효 (y 뒤집힘)
    ["img-1", [100, 400, 300, 600]],
  ]);
  const out = groupFigureRows(content, boxes);
  check("8. 무효 box 1개 + 유효 1개 → 묶음 없음", rowCount(out) === 0);
}

// 9) Phase B: figures[] reading-order → 마커 없는 inline svg 도 box 획득 → 좌우 배치
//    (고흐 시나리오: [그림1]→작품 img + 그 옆 inline svg 평행사변형)
{
  const content = `본문 ${IMG("img-0")}\n\n${SVG("0")}`;
  const figures = [
    { box: [180, 120, 340, 300] as FigBox }, // 작품 (왼쪽)
    { box: [185, 360, 330, 760] as FigBox }, // 도형 (오른쪽)
  ];
  const boxes = new Map<string, FigBox | undefined>();
  boxes.set("img-0", [180, 120, 340, 300]); // Phase A: 크롭 box (svg 는 box 없음)
  assignBoxesByReadingOrder(content, figures, boxes); // Phase B: reading-order 주입
  const out = groupFigureRows(content, boxes);
  check("9. figures[] reading-order → svg 도 box 획득 → figure-row", rowCount(out) === 1);
  check("9. 작품+도형 모두 행에 포함", out.includes('data-svg-id="0"') && out.includes('data-fig-key="img-0"'));
}

// 10) assignBoxesByReadingOrder: figures 부족 시 남는 placeholder 는 box 미할당
{
  const content = `${IMG("img-0")}\n\n${SVG("0")}\n\n${SVG("1")}`;
  const figures = [{ box: [180, 120, 340, 300] as FigBox }]; // 1개만
  const boxes = new Map<string, FigBox | undefined>();
  assignBoxesByReadingOrder(content, figures, boxes);
  check("10. figures 1개 → 첫 placeholder 만 box", boxes.get("img-0") !== undefined && boxes.get("0") === undefined && boxes.get("1") === undefined);
}

console.log(`\nfigureLayout 하니스: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
