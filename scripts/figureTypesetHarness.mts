import assert from "node:assert/strict";
import { typesetLabel, placeLabel, isSafeFragment } from "./figure/mathjaxLabel.js";
import { withLabelMetrics, substituteLabels } from "./figure/mathjaxSubstitute.js";

for (const text of ["A", "24 cm", "70°", "y = 9 − x²", String.raw`$\frac{\sqrt{2}}{2}$`]) {
  const laid = typesetLabel(text);
  assert.ok(laid && laid.widthEm > 0 && laid.ascentEm > 0, text);
  const svg = placeLabel(laid, text, 100, 50, 20, "#111111");
  assert.ok(svg?.includes("<path") && !svg.includes("<text"), text);
  assert.ok(isSafeFragment(svg), text);
  console.log("PASS vector label:", text);
}
assert.equal(typesetLabel("가로"), null);
console.log("PASS Korean labels retain readable native text");
const spec = { version: 2, labels: { A: "A", number: { text: "24 cm" } } };
const measured = withLabelMetrics(spec) as typeof spec & { label_metrics: object };
assert.equal(Object.keys(measured.label_metrics).length, 2);
assert.equal("label_metrics" in spec, false);
const elem = { version: "elem-1", kind: "cuboid" };
assert.equal(withLabelMetrics(elem), elem);
console.log("PASS measured labels go only to the compatible geometry engine");
const replaced = substituteLabels('<svg><text data-mj="70°" x="20" y="30" font-size="16">70°</text></svg>');
assert.equal(replaced.replaced, 1);
assert.ok(replaced.svg.includes('data-label="70°"'));
assert.equal(isSafeFragment('<a href="javascript:alert(1)"><path/></a>'), false);
console.log("PASS original label metadata and fragment safety");
