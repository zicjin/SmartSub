import assert from 'node:assert/strict';
import {
  normalizeFireRedBilingualSrtContent,
  normalizeFireRedCueText,
  prepareFireRedPuncInput,
} from '../main/helpers/fireRedPunc/text';
import { getFireRedPuncReadiness } from '../main/helpers/fireRedPunc/catalog';

const cases: Array<[string, string]> = [
  ['你好。', '你好'],
  ['他说“你好。”', '他说“你好”'],
  ['Hello.', 'Hello'],
  ['Hello?', 'Hello?'],
  ['Hello...', 'Hello...'],
  ['Dr.', 'Dr.'],
  ['U.S.', 'U.S.'],
  ['Meet at 5 p.m.', 'Meet at 5 p.m.'],
  ['值为 3.14。', '值为 3.14'],
];
for (const [input, expected] of cases) {
  assert.equal(normalizeFireRedCueText(input), expected, input);
}
assert.equal(prepareFireRedPuncInput('你好，Hello。'), '你好 Hello');
assert.match(
  normalizeFireRedBilingualSrtContent(
    '1\n00:00:00,000 --> 00:00:01,000\n你好。\nHello.\n',
    'sourceAndTranslate',
  ),
  /你好\nHello\./,
);
assert.equal(getFireRedPuncReadiness(false).reason, 'runtime-missing');
assert.equal(getFireRedPuncReadiness(false).ready, false);
console.log('firered-punc text/readiness tests passed');
