// Tests for js/week.js: Hebcal's events mapped onto the portions of
// index.json, and which Shabbat is this week's.
//
//   node tools/test-week.mjs
import assert from 'node:assert/strict';
import './lib.mjs';
import '../js/week.js';

const W = globalThis.TR.week;
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${e.message.split('\n').join('\n    ')}`); }
}
const P = (title, israel) => W.portionOf({ title, category: 'parashat' }, israel);
const H = (title, israel) => W.portionOf({ title, category: 'holiday' }, israel);

test('a parashah, in Hebcal\'s spelling', () => {
  assert.deepEqual(P('Parashat Bereshit'), { id: '0101', extra: false });
  assert.deepEqual(P('Parashat Lech-Lecha'), { id: '0103', extra: false });   // a hyphen, but one parashah
  assert.equal(P('Parashat Beha’alotcha').id, '0403');                        // a curly apostrophe
  assert.equal(P('Parashat Sh\'lach').id, '0404');
  assert.equal(P('Parashat Vezot Haberakhah').id, '0511');
});

test('two read together are the double', () => {
  assert.equal(P('Parashat Vayakhel-Pekudei').id, '0210-0211');
  assert.equal(P('Parashat Achrei Mot-Kedoshim').id, '0306-0307');
  assert.equal(P('Parashat Nitzavim-Vayeilech').id, '0508-0509');
});

test('a holiday on Shabbat is its reading', () => {
  assert.equal(H('Rosh Hashana 5787').id, 'r01');
  assert.equal(H('Sukkot I').id, 'r06');
  assert.equal(H('Sukkot IV (CH’’M)').id, 'r08');
  assert.equal(H('Pesach III (CH’’M)').id, 'r21');
  assert.equal(H('Shavuot II').id, 'r25');
  assert.equal(H('Shmini Atzeret').id, 'r09');
  assert.equal(H('Shmini Atzeret', true).id, 'r10');                         // Simchat Torah, in Israel
});

test('a special Shabbat and Rosh Chodesh are read beside the parashah', () => {
  assert.deepEqual(H('Shabbat Shekalim'), { id: 'r13', extra: true });
  assert.deepEqual(H('Shabbat HaChodesh'), { id: 'r17', extra: true });
  assert.deepEqual(W.portionOf({ title: 'Rosh Chodesh Iyyar', category: 'roshchodesh' }), { id: 'r32', extra: true });
});

test('events with no reading here are left out', () => {
  assert.equal(H('Shabbat Shirah'), null);
  assert.equal(H('Chanukah: 8th Day'), null);
  assert.equal(W.portionOf({ title: 'Mevarchim Chodesh Kislev', category: 'mevarchim' }), null);
  assert.equal(W.portionOf(null), null);
});

test('this week\'s Shabbat: the coming one, or today on Shabbat', () => {
  assert.equal(W.shabbat(new Date(2026, 10, 1)), '2026-11-07');    // Sunday
  assert.equal(W.shabbat(new Date(2026, 10, 6, 23)), '2026-11-07'); // Friday night
  assert.equal(W.shabbat(new Date(2026, 10, 7, 22)), '2026-11-07'); // Shabbat itself
  assert.equal(W.shabbat(new Date(2026, 11, 27)), '2027-01-02');   // into the next year
});

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('FAIL ' + f);
process.exit(failures.length ? 1 : 0);
