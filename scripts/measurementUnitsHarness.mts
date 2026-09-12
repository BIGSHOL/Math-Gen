import assert from 'node:assert/strict';
import { uprightMeasurementUnits } from '../src/lib/measurementUnits';
import { preprocessMathText } from '../src/lib/textPreprocess';
const context='지면에서 높이와 속도를 측정한 물체';
for(const [source, expected] of [
 ['20m',String.raw`20\,\mathrm{m}`],
 [String.raw`15\,m/s`,String.raw`15\,\mathrm{m}/\mathrm{s}`],
 ['hm',String.raw`h\,\mathrm{m}`],
 ['3m/s^2',String.raw`3\,\mathrm{m}/\mathrm{s}^2`],
 [String.raw`h=20+15t-5t^2`,String.raw`h=20+15t-5t^2`],
 [String.raw`20\mathrm{m}`,String.raw`20\mathrm{m}`],
 [String.raw`15\text{m/s}`,String.raw`15\mathrm{m}/\mathrm{s}`],
]) {
 const result=uprightMeasurementUnits(source,context);assert.equal(result,expected,source);
 assert.equal(uprightMeasurementUnits(result,context),result,'idempotent '+source);
}
for(const source of ['2m+3s','m/s','2g(x)','f(x)=x^2','ms','\\sum_{m=1}^{3}m'])assert.equal(uprightMeasurementUnits(source),source);
assert.equal(uprightMeasurementUnits('-15m/s'),String.raw`-15\,\mathrm{m}/\mathrm{s}`);
assert.equal(uprightMeasurementUnits('20cm'),String.raw`20\,\mathrm{cm}`);
const output=preprocessMathText('지면으로부터 $20m$ 높이에서 $15m/s$로 던진 물체의 높이 $hm$와 시각 $t$');
assert.ok(output.includes('\\mathrm{m}'));assert.ok(output.includes('\\mathrm{s}'));assert.ok(!output.includes('\\mathrm{t}'));
console.log('PASS upright units, italic variables, context safeguards, repeated normalization and preview math');
