import assert from 'node:assert/strict';
import { repositionScore } from '../src/lib/problemAdapter';
for(const gap of ['\n','\n\n','']){
 const s=repositionScore(`넓이는?${gap}[그림1]\n[4.1점]\n① 1 ② 2 ③ 3 ④ 4 ⑤ 5`);
 assert.ok(s.indexOf('[4.1점]')<s.indexOf('[그림1]'));
 assert.equal((s.match(/4.1점/g)||[]).length,1);
}
assert.equal(repositionScore('첫 조건.\n\n마지막 질문?\n[그림1]',3),'첫 조건.\n\n마지막 질문? [3점]\n[그림1]');
assert.equal(repositionScore('질문?\n<svg><text>라벨</text></svg>\n① 1',3),'질문? [3점]\n<svg><text>라벨</text></svg>\n① 1');
assert.equal(repositionScore('질문?\n> ㄱ. 조건\n> ㄴ. 조건\n① 1',3),'질문? [3점]\n> ㄱ. 조건\n> ㄴ. 조건\n① 1');
assert.ok(repositionScore('질문?\n(1) 첫 문제 [2점]\n(2) 다음 문제 [3점]',5).includes('(1) 첫 문제 [2점]'));
assert.ok(!repositionScore('질문? [3점]\n(1) 첫 문제 [2점]',3,false).includes('점]'));
console.log('PASS score placement respects figure/box/choice boundaries, multiple stem paragraphs and subquestion scores');
