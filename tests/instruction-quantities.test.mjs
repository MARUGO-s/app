import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleInstructionQuantities as scale } from '../src/utils/scaleInstructionQuantities.js';

test('split ingredients and dough portions follow the recipe multiplier', () => {
    assert.equal(scale('生地用水199gを190gと9gに分けます。粉3種、合計300g。イースト1.2g、塩6g。各生地約253.6g。', 2), '生地用水398gを380gと18gに分けます。粉3種、合計600g。イースト2.4g、塩12g。各生地約507.2g。');
});
test('temperature, time, dimensions, ratios, counts and equipment water stay fixed', () => {
    const text = '24〜25°Cで30分、1.5〜1.7倍。2個、35cm、深さ5〜8mm、30〜45度。蒸気用の熱湯50gを注ぎ、240°Cで12〜14分。生地に水9gを加える。';
    assert.equal(scale(text, 2), text.replace('水9g', '水18g'));
});
test('volume, full width values, small and fractional multipliers', () => {
    assert.equal(scale('牛乳100ml、水０．５ｇ、粉0.2kg', 0.5), '牛乳50ml、水0.3ｇ、粉0.1kg');
    assert.equal(scale('水10〜20g', 2), '水20〜40g');
});
test('base and invalid multipliers preserve saved text', () => {
    for (const factor of [1, 0, -1, NaN, Infinity]) assert.equal(scale('水１９９ｇ', factor), '水１９９ｇ');
    assert.equal(scale(undefined, 2), undefined);
});

import { verifyInstructionQuantities as verify } from '../src/utils/scaleInstructionQuantities.js';
test('checks split sums and ingredient totals without adding repeated steps', () => {
    const rows = [{ name: '水', quantity: 199, unit: 'g' }, { name: '塩', quantity: 6, unit: 'g' }];
    const result = verify(['生地用水398gを380gと18gに分けます。塩12gを加える。', '塩12gを確認。'], rows, 2);
    assert.equal(result.issues.length, 0);
    assert.equal(result.checked, 4);
    assert.ok(result.unverified > 0);
});
test('reports source inconsistency and rounding errors in split sums', () => {
    const result = verify(['水398gを380gと20gに分ける。塩10gを加える。'], [{ name: '水', quantity: 199, unit: 'g' }, { name: '塩', quantity: 6, unit: 'g' }], 2);
    assert.equal(result.issues.length, 2);
});
test('converts compatible units and never claims ambiguous quantities are verified', () => {
    assert.equal(verify(['粉0.6kg'], [{ name: '粉', quantity: 300, unit: 'g' }], 2).issues.length, 0);
    const result = verify(['各生地253.6g、残りの水9g。蒸気用の熱湯50g。'], [{ name: '水', quantity: 199, unit: 'g' }], 2);
    assert.equal(result.checked, 0);
    assert.equal(result.unverified, 2);
});
