// DB/API 없이 인계 문서의 원문과 반복 정규화를 검증한다.
// 실행: npx tsx scripts/mathGlueHarness.mts [--report output.json]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { protectLooseLatex, sanitizeAnswer, sanitizeText } from '../src/services/ai/sanitize.js';
import { preprocessMathText, repairProsePrefixedInlineMath } from '../src/lib/textPreprocess.js';

const cases = [
  {
    id: 'adjacent-degree',
    input: String.raw`따라서 $\frac{N}{M}$$\angle CAM=15°$ 이다.`,
    rendered: String.raw`따라서 $\displaystyle \dfrac{N}{M}$ $\displaystyle \angle \mathrm{CAM}=15°$ 이다.`,
  },
  {
    id: 'adjacent-no-degree',
    input: String.raw`따라서 $\frac{N}{M}$$\angle CAM=15$ 이다.`,
    rendered: String.raw`따라서 $\displaystyle \dfrac{N}{M}$ $\displaystyle \angle \mathrm{CAM}=15$ 이다.`,
  },
  {
    id: 'unmatched-display',
    input: String.raw`값은 $$\angle CAM=15° 이다.`,
    rendered: String.raw`값은 $$\angle CAM=15° 이다.`,
  },
  {
    id: 'plain-adjacent',
    input: '$a=1$$b=2$$c=3$ 이다.',
    rendered: String.raw`$\displaystyle a=1$ $\displaystyle b=2$ $\displaystyle c=3$ 이다.`,
  },
  {
    id: 'spaced-control',
    input: String.raw`따라서 $\frac{N}{M}$ $\angle CAM=15°$ 이다.`,
    rendered: String.raw`따라서 $\displaystyle \dfrac{N}{M}$ $\displaystyle \angle \mathrm{CAM}=15°$ 이다.`,
  },
  {
    id: 'display-control',
    input: String.raw`$$\frac{N}{M}$$ 이다.`,
    rendered: String.raw`$$\displaystyle \dfrac{N}{M}$$ 이다.`,
  },
];

const paths = {
  protectLooseLatex,
  sanitizeText,
  sanitizeAnswer,
  preprocessMathText,
  sanitizeTextThenPreprocess: (text: string) => preprocessMathText(sanitizeText(text)),
  sanitizeAnswerThenPreprocess: (text: string) => preprocessMathText(sanitizeAnswer(text)),
};
type Result = { name: string; passed: boolean; error?: string };
const results: Result[] = [];
const check = (name: string, fn: () => void) => {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: String(error) });
  }
};
const repeat = (fn: (text: string) => string, input: string, expected: string) => {
  let value = input;
  for (let pass = 1; pass <= 5; pass++) {
    value = fn(value);
    assert.equal(value, expected, `pass ${pass}`);
    assert.doesNotMatch(value, /[\uE000-\uE002]/, 'internal placeholder must never escape');
  }
};

for (const fixture of cases) {
  for (const [name, fn] of Object.entries(paths)) {
    const expected = /preprocess/i.test(name) ? fixture.rendered : fixture.input;
    check(`${fixture.id}: ${name}, exact output and five passes`, () => repeat(fn, fixture.input, expected));
  }
}

// 이미 오염된 문자열의 복구를 추측하지 않는다. 추가 손상이 없다는 별도 가드.
const corrupted = String.raw`따라서 $\frac{N}{M}$$$\angle CAM=15$°$ 이다.`;
for (const [name, fn] of Object.entries(paths)) {
  check(`already-corrupted: ${name} does not amplify`, () => repeat(fn, corrupted, corrupted));
}

const proseRepair = String.raw`\displaystyle $$이동 거리= $x(b)-x(a)=8.$`;
for (const [name, fn] of Object.entries({ sanitizeText, sanitizeAnswer, repairProsePrefixedInlineMath })) {
  check(`existing prose-prefixed display repair: ${name}`, () => {
    repeat(fn, proseRepair, '이동 거리= $x(b)-x(a)=8.$');
  });
}
check('existing prose-prefixed display repair: preprocessMathText', () => {
  repeat(preprocessMathText, proseRepair, String.raw`이동 거리= $\displaystyle x(b)-x(a)=8.$`);
});

for (const [input, expected] of [
  ['-28,-22,-16', '-28, -22, -16'],
  ['$a,b$$c,d$$e,f$,1,2', '$a,b$$c,d$$e,f$, 1, 2'],
  ['$$a,b$$,1,2', '$$a,b$$, 1, 2'],
  ['$$a,b$$ 및 $c,d$,1', '$$a,b$$ 및 $c,d$, 1'],
  ['$a,b$ 및 $$c,d$$,1', '$a,b$ 및 $$c,d$$, 1'],
  ['$$a,b$$\n$$c,d$$,1', '$$a,b$$\n$$c,d$$, 1'],
]) {
  check(`answer comma contract: ${input}`, () => repeat(sanitizeAnswer, input, expected));
}
check('unwrapped LaTeX still gets wrapped', () => {
  repeat(sanitizeText, String.raw`\frac{N}{M}`, String.raw`$\displaystyle \frac{N}{M}$`);
});
check('loose token beside valid inline still gets wrapped', () => {
  repeat(sanitizeText, String.raw`$x$ 와 \frac{N}{M} 이다.`, String.raw`$x$ 와 $\frac{N}{M}$ 이다.`);
});
check('HTML escaping beside unmatched display is retained', () => {
  repeat(sanitizeText, String.raw`값은 $$\angle CAM=15° < 20 이다.`, String.raw`값은 $$\angle CAM=15° &lt; 20 이다.`);
});
check('table preservation is retained', () => {
  const input = '<table><tr><td>1,2</td></tr></table>';
  repeat(sanitizeText, input, input);
});

const failed = results.filter(result => !result.passed);
const report = { total: results.length, passed: results.length - failed.length, failed: failed.length, results };
const reportFlag = process.argv.indexOf('--report');
if (reportFlag >= 0) writeFileSync(process.argv[reportFlag + 1], JSON.stringify(report, null, 2) + '\n', 'utf8');
for (const result of failed) console.error(`FAIL ${result.name}\n${result.error}`);
console.log(`math glue: ${report.passed}/${report.total} passed, ${report.failed} failed`);
if (failed.length) process.exitCode = 1;
