export interface FigureNumber { id: string; number: number; x: number; y: number; targetX: number; targetY: number }

/** 도형 바깥 24px 여백에 번호를 배치한다. 번호끼리 겹치지 않는 가장 가까운 자리를 쓴다. */
export function layoutFigureNumbers(root: SVGSVGElement): FigureNumber[] {
  const bounds = root.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return [];
  // 모달 열림 애니메이션의 CSS scale을 제거한다. 화면 좌표를 그대로 쓰면
  // 애니메이션 종료 후 오른쪽/아래 번호가 그림 안쪽으로 밀려 들어온다.
  const width = root.clientWidth, height = root.clientHeight;
  const scaleX = width / bounds.width, scaleY = height / bounds.height;
  const slots: { x: number; y: number }[] = [];
  const margin = 12, gap = 28;
  for (let x = 14; x < width - 8; x += gap) slots.push({ x, y: -margin }, { x, y: height + margin });
  for (let y = 14; y < height - 8; y += gap) slots.push({ x: -margin, y }, { x: width + margin, y });
  const numbers: FigureNumber[] = [];
  const objects = root.querySelectorAll<SVGGraphicsElement>("[data-object-id]");
  objects.forEach((node, index) => {
    const box = node.getBoundingClientRect();
    let targetX = box.x + box.width / 2 - bounds.x, targetY = box.y + box.height / 2 - bounds.y;
    if (node instanceof SVGGeometryElement) {
      try {
        const point = node.getPointAtLength(node.getTotalLength() / 2).matrixTransform(node.getScreenCTM()!);
        targetX = point.x - bounds.x; targetY = point.y - bounds.y;
      } catch { /* 비어 있는 도형은 경계 상자를 기준으로 한다. */ }
    }
    targetX *= scaleX; targetY *= scaleY;
    let best = 0, score = Infinity;
    slots.forEach((slot, slotIndex) => {
      const distance = Math.hypot(slot.x - targetX, slot.y - targetY);
      if (distance < score) { best = slotIndex; score = distance; }
    });
    // 매우 많은 요소도 추가 바깥 줄을 써서 번호가 중복되지 않게 한다.
    const slot = slots.splice(best, 1)[0] ?? { x: 14 + (index % 10) * gap, y: -margin - gap * (1 + Math.floor(index / 10)) };
    numbers.push({ ...slot, id: node.getAttribute("data-object-id")!, number: index + 1, targetX, targetY });
  });
  return numbers;
}
