// Tests for js/scroll.js's layout (tokens, blocks, breaksAfter, sync): the
// marks it reads, and over the corpus, the poetry books set a line to a
// verse, their columns in step verse by verse.
//
//   node tools/test-scroll.mjs [--root ../tanakh]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { F, APP_ROOT, args } from './lib.mjs';

globalThis.window = globalThis;
await import('../js/scroll.js');

const SC = globalThis.TR.scroll;
const opt = args({ root: path.resolve(APP_ROOT, '../tanakh') });
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${e.message.split('\n').join('\n    ')}`); }
}

const vs = texts => texts.map((text, i) => ({ key: String(i + 1), text }));
/* Blocks as plain data: [kind, [[text …] per part], end?] */
const shape = verses => SC.blocks(verses).map(b => (b.kind === 'blank' ? ['blank']
  : [b.kind, b.parts.map(p => p.map(x => x.text))].concat(b.end ? ['end'] : [])));

/* ---------- unit ---------- */

test('{/} ends a line; the gap parts it in halves', () => {
  assert.deepEqual(shape(vs(['a    b {/}', 'c    d {/}'])), [
    ['line', [['a'], ['b']]],
    ['line', [['c'], ['d']]],
  ]);
});

test('a newline inside a verse is a second line, the verse ending at {/}', () => {
  assert.deepEqual(shape(vs(['a    b\nc    d {/}', 'e    f {/}'])), [
    ['line', [['a'], ['b']]],
    ['line', [['c'], ['d']]],
    ['line', [['e'], ['f']]],
  ]);
});

test('{//} ends a line and its paragraph', () => {
  assert.deepEqual(shape(vs(['a    b {//}', 'c    d {/}'])), [
    ['line', [['a'], ['b']], 'end'],
    ['line', [['c'], ['d']]],
  ]);
});

test('a gap before a read form is a word not written, not a half', () => {
  assert.deepEqual(shape(vs(['a b    (c) d'])), [['para', [['a b    (c) d']]]]);
});

test('{פ} after a poem\'s halves ends their line, with a paragraph\'s space', () => {
  assert.deepEqual(shape(vs(['a    b {/}', 'c    d {פ}'])), [
    ['line', [['a'], ['b']]],
    ['line', [['c'], ['d']], 'end'],
  ]);
});

test('without the marks, verses run on in one paragraph (as before)', () => {
  assert.deepEqual(shape(vs(['a', 'b {פ}'])), [['para', [['a', 'b']]]]);
});

test('breaksAfter: {/} {//} are full breaks; a gap is not', () => {
  assert.equal(SC.breaksAfter('a {/}'), true);
  assert.equal(SC.breaksAfter('a {//}'), true);
  assert.equal(SC.breaksAfter('a    '), false);
  assert.equal(SC.breaksAfter('a {ס}'), false);
});

/* ---------- corpus ---------- */

function book(rel, layer) {
  const file = path.join(opt.root, rel);
  if (!fs.existsSync(file)) return null;
  return F.parse(fs.readFileSync(file, 'utf8'), layer).chapters;
}

const POETRY = [['26', 'Psalms'], ['27', 'Job'], ['28', 'Proverbs']];
let chapters = 0;
for (const [id, name] of POETRY) {
  const he = book(F.paths(id).he, 'he');
  const en = book(F.paths(id).en, 'en');
  if (!he || !en) continue;
  // Job's prose (1:1–3:1, 42:7–17) runs on as prose does.
  const poem = (c, n) => id !== '27' || ((c > 3 || (c === 3 && n > 1)) && (c < 42 || n <= 6));
  // Psalms 70:1 and 108:1 share a line with verse 2 (Mechon Mamre's "א-ב").
  const joined = (c, n) => id === '26' && (c === 70 || c === 108) && n === 1;
  test(`${name}: every verse of the poetry ends a line, in the Hebrew and the English`, () => {
    const bad = [];
    he.forEach((ch, i) => ch.laws.forEach((l, j) => {
      if (!poem(ch.n, l.n) || joined(ch.n, l.n)) return;
      if (!SC.breaksAfter(l.text)) bad.push(`he ${ch.n}:${l.n}`);
      // An English chapter's last verse may end bare (Proverbs 21:31, after
      // a {P}): the chapter's end closes it.
      const last = j === ch.laws.length - 1;
      if (!last && !SC.breaksAfter(en[i].laws[j].text)) bad.push(`en ${ch.n}:${l.n}`);
    }));
    assert.deepEqual(bad.slice(0, 10), []);
  });
  test(`${name}: each chapter's Hebrew is lines only, a verse's halves parted`, () => {
    const bad = [];
    he.forEach(ch => {
      chapters++;
      const verses = ch.laws.filter(l => poem(ch.n, l.n)).map(l => ({ key: String(l.n), text: l.text }));
      SC.blocks(verses).forEach(b => {
        if (b.kind === 'blank') return;   // the end of a book ({ש})
        if (b.kind !== 'line' || b.parts.length > 3) bad.push(`${ch.n}: ${b.kind} of ${b.parts.length} parts`);
      });
    });
    assert.deepEqual(bad.slice(0, 10), []);
  });
}

test('Ecclesiastes 3:2–8: each verse two lines of two halves', () => {
  const he = book(F.paths('31').he, 'he');
  if (!he) return;
  const verses = he[2].laws.filter(l => l.n >= 2 && l.n <= 8).map(l => ({ key: String(l.n), text: l.text }));
  const blocks = SC.blocks(verses);
  assert.equal(blocks.length, 14);
  blocks.forEach(b => { assert.equal(b.kind, 'line'); assert.equal(b.parts.length, 2); });
});

console.log(`${passed} passed, ${failures.length} failed` + (chapters ? `, over ${chapters} chapters` : ' (no corpus at ' + opt.root + ')'));
for (const f of failures) console.log('  ✗ ' + f);
process.exitCode = failures.length ? 1 : 0;
