/**
 * 끄는 동안 화면의 그림은 **바뀐 요소만** 고친다. 전에는 한 걸음마다 SVG 를 innerHTML 로 통째로 갈고
 * (조판이 풀려 라벨이 원문으로 보였다) 번호·목록까지 새로 그려 프레임이 끊겼다
 * (원장님 2026-09-18 «부드럽게 움직여지지않고 프레임이 엄청 끊기네»).
 * 원문 문자열은 전과 같은 함수로 계산한다(되돌리기·저장과 같은 길) — 여기서는 그 결과를 화면에 옮기기만 한다.
 */
import { readFigureSvg } from "./figureSvgEditing";

const PREVIEW = "data-drag-preview";

export function previewFigureObjects(root: SVGSVGElement, source: string, ids: readonly string[]) {
  // 같은 원문을 요소 목록도 곧 읽는다 — 기억해 둔 문서를 같이 쓴다(여기서는 읽기만 한다).
  const doc = readFigureSvg(source);
  // 새로 그리는 요소는 걸음마다 아이디가 새로 난다 — 앞 걸음의 것을 걷고 다시 붙인다.
  for (const stale of root.querySelectorAll(`[${PREVIEW}]`)) stale.remove();
  for (const id of ids) {
    const next = doc.querySelector(`[data-object-id="${id}"]`);
    if (!next) continue;
    const live = root.querySelector(`[data-object-id="${id}"]`);
    if (!live) {
      const marker = /#([\w.-]+)/.exec(next.getAttribute("marker-end") ?? "");
      const defs = marker && doc.getElementById(marker[1])?.closest("defs");
      for (const part of defs ? [defs, next] : [next]) {
        const node = root.ownerDocument.importNode(part, true) as Element;
        node.setAttribute(PREVIEW, "");
        root.append(node);
      }
    } else if (live.localName === next.localName) {
      for (const attr of [...live.attributes]) if (!next.hasAttribute(attr.name)) live.removeAttribute(attr.name);
      for (const attr of next.attributes) if (live.getAttribute(attr.name) !== attr.value) live.setAttribute(attr.name, attr.value);
    } else {
      // 조판한 라벨(<g>)은 자리만 옮긴다 — 라벨은 끌어 옮기기만 한다.
      const transform = next.getAttribute("transform");
      if (transform) live.setAttribute("transform", transform); else live.removeAttribute("transform");
    }
  }
}
