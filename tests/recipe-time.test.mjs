import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecipeTimeLabel, parseRecipeMinutes } from '../src/utils/recipeTime.js';
test('total includes work and waiting, including explicit zero', () => {
 assert.equal(getRecipeTimeLabel({prepTime:30,cookTime:210}), '約4時間（作業 30分／待ち・加熱 3時間30分）');
 assert.equal(getRecipeTimeLabel({prepTime:10,cookTime:0}), '約10分（作業 10分／待ち・加熱 0分）');
});
test('missing time never implies zero or a complete total', () => {
 assert.equal(getRecipeTimeLabel({}), '未設定');
 assert.match(getRecipeTimeLabel({prepTime:30}), /合計は未設定/);
 assert.equal(parseRecipeMinutes('-10'), null);
 assert.equal(parseRecipeMinutes('1時間30分'),90);
});
