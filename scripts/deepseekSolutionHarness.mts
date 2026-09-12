import assert from "node:assert/strict";
import { parseDeepSeekSolutionResponse } from "../src/services/ai/solutions";

const parsed = parseDeepSeekSolutionResponse(`###ANSWER###
$\\frac{1}{2}$
###SOLUTION###
step1) $2x=1$이다.
step2) 따라서 $x=\\frac{1}{2}$이다.
###TOPIC###
일차방정식
###DIFFICULTY###
하
###END###`);

assert.equal(parsed.answer, "$\\frac{1}{2}$");
assert.ok(parsed.solution.includes("\\frac{1}{2}"));
assert.ok(!parsed.solution.includes("###"));
assert.throws(
  () => parseDeepSeekSolutionResponse('{"answer":"1","solution":"x=1"}'),
  /구분자/,
);

console.log("PASS DeepSeek delimiter parsing preserves LaTeX and rejects JSON drift");
