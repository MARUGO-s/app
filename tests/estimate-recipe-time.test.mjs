import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRecipeTime as estimate, formatEstimatedRecipeTime as format } from '../src/utils/estimateRecipeTime.js';
test('sums explicit durations and keeps ranges', () => {
 const r=estimate(['5分こねる。','20〜30分休ませる。','1時間30分発酵させる。','15分焼く。']);
 assert.equal(r.min,130);assert.equal(r.max,140);assert.equal(r.complete,true);
});
test('checkpoints do not turn into durations', () => {
 const r=estimate(['一次発酵させる。30分後と60分後に確認する。','焼成開始から12〜14分で状態を確認し、必要に応じて焼き続ける。']);
 assert.equal(r.entries.length,0);assert.equal(r.unknown.length,2);
});
test('unknown work and simultaneous operations never become a complete total', () => {
 const r=estimate(['粉を混ぜて20〜30分休ませる。','発酵中に10分予熱する。','成形する。']);
 assert.equal(r.min,20);assert.equal(r.max,30);assert.equal(r.complete,false);assert.equal(r.unknown.length,3);
 assert.match(format(r),/小計/);
});
test('full width values, seconds, hours and empty text', () => {
 const r=estimate([{text:'１時間半発酵させる。'},'30秒混ぜる。']);
 assert.equal(r.min,90.5);assert.equal(r.max,90.5);
 assert.match(format(estimate([])),/算出できる時間なし/);
});
test('ranges with repeated units and ambiguous repeated tasks', () => {
 const r=estimate(['1時間〜2時間発酵させる。']);
 assert.equal(r.min,60);assert.equal(r.max,120);
 const ambiguous=estimate(['片面3分ずつ焼く。','一次発酵は120分を主要な確認点とする。']);
 assert.equal(ambiguous.entries.length,0);assert.equal(ambiguous.complete,false);
});

import { recommendRecipeTime as recommend, formatRecommendedRecipeTime } from '../src/utils/estimateRecipeTime.js';
test('bread summary fills missing phases and keeps explicit final-proof range', () => {
 const result=recommend([
  '材料を計量する。',
  '粉を混ぜる。覆って20〜30分休ませる。',
  'むらなく混ぜる。',
  '一次発酵させる。30分後と60分後に確認し、折りたたむ。',
  '分割する。覆って20〜30分休ませる。',
  '成形する。',
  '24〜26℃で最終発酵させる。35〜60分は確認の目安とする。',
  '焼成開始から12〜14分で状態を確認し、必要に応じて焼き続ける。網で冷ます。'
 ],{bread:true});
 assert.equal(result.estimated,true);assert.equal(result.unknown.length,0);
 assert.ok(result.wait.min>=195);assert.ok(result.wait.max>=300);
 assert.ok(result.entries.some(entry=>entry.step===7 && !entry.estimated && entry.min===35 && entry.max===60));
 assert.match(formatRecommendedRecipeTime(result),/推定を含む/);
 assert.ok(result.work.min>0);
});
test('explicit durations win and parallel work is not guessed', () => {
 const result=recommend(['10分こねる。','120分発酵させる。','25分焼く。'],{bread:true});
 assert.equal(result.min,155);assert.equal(result.estimated,false);
 const parallel=recommend(['発酵中に15分予熱する。'],{bread:true});
 assert.equal(parallel.complete,false);assert.equal(parallel.unknown.length,1);
 assert.match(formatRecommendedRecipeTime(recommend([])),/作り方を入力/);
});
