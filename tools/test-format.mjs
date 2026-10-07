// Tests for js/format.js, plus corpus checks over the texts.
//
//   node tools/test-format.mjs [--root ../tanakh]
//
// --root is any directory laid out like the tanakh repo (the import's
// output in out/data, or the repo's own working tree).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { F, APP_ROOT, args } from './lib.mjs';

const opt = args({ root: path.resolve(APP_ROOT, '../tanakh') });
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${e.message.split('\n').join('\n    ')}`); }
}

/* ---------- unit ---------- */

test('Hebrew numerals round-trip 1..500', () => {
  for (let n = 1; n <= 500; n++) assert.equal(F.hebNumeral(F.numToHeb(n)), n, `n=${n} → ${F.numToHeb(n)}`);
  assert.equal(F.numToHeb(15), 'טו');
  assert.equal(F.numToHeb(16), 'טז');
  assert.ok(Number.isNaN(F.hebNumeral('יה')), 'יה is not a canonical numeral');
  assert.ok(Number.isNaN(F.hebNumeral('הלכותיו')));
});

test('English chapter words', () => {
  assert.equal(F.enToNum('One'), 1);
  assert.equal(F.enToNum('Twenty-Three'), 23);
  assert.equal(F.enToNum('14'), 14);
});

const EN_LEGACY = [
  '*verse*',
  '# Laws of Things',
  'Intro paragraph.  ',
  '## Laws of Things, Chapter One',
  '1:1 First law. \\[2] Second part.',
  '1:2 Second law\nwith a verse line.',
  'An unnumbered paragraph belonging to 1:2.',
  '1:3 Third law.',
  '## Laws of Things, Chapter  2',
  '## Laws of Things, Chapter 2',
  '2,1 Comma label.',
  '2:2 Heading glued below.\n## Laws of Things, Chapter 3',
  '3:1 Last.',
].join('\r\n\r\n') + '\r\n\r\n\r\n';

const EN_CANON = [
  '*verse*',
  '# Laws of Things',
  'Intro paragraph.',
  '## Laws of Things, Chapter 1',
  '1:1 First law. \\[2] Second part.',
  '1:2 Second law\nwith a verse line.',
  'An unnumbered paragraph belonging to 1:2.',
  '1:3 Third law.',
  '## Laws of Things, Chapter 2',
  '2:1 Comma label.',
  '2:2 Heading glued below.',
  '## Laws of Things, Chapter 3',
  '3:1 Last.',
].join('\n\n') + '\n';

test('English legacy variants normalise to canonical', () => {
  const doc = F.parseText(EN_LEGACY, 'en');
  assert.equal(F.writeText(doc, 'en'), EN_CANON);
  assert.deepEqual(doc.front, ['*verse*']);
  assert.deepEqual(doc.chapters.map(c => [c.key, c.laws.length]), [['1', 3], ['2', 2], ['3', 1]]);
  assert.deepEqual(doc.chapters[0].laws[1].extra, ['An unnumbered paragraph belonging to 1:2.']);
  assert.ok(doc.warnings.some(w => w.includes('duplicate heading')));
  assert.ok(doc.warnings.some(w => w.includes('"2,1"')));
});

test('canonical English is a fixed point', () => {
  const doc = F.parseText(EN_CANON, 'en');
  assert.equal(F.writeText(doc, 'en'), EN_CANON);
  assert.deepEqual(doc.warnings, []);
});

test('mislabelled law is written under its chapter', () => {
  const doc = F.parseText('## X, Chapter 5\n\n4:1 Wrong label.\n', 'en');
  assert.equal(F.writeText(doc, 'en'), '## X, Chapter 5\n\n5:1 Wrong label.\n');
});

test('bare "## N" headings become single-number laws (2-7 style)', () => {
  const doc = F.parseText('# Order\n\n## 1\n*Rubric.*\n\nPrayer text.\n\n## 2\nMore.\n', 'en');
  assert.equal(F.writeText(doc, 'en'), '# Order\n\n1 *Rubric.*\n\nPrayer text.\n\n2 More.\n');
  assert.equal(doc.chapters[0].implicit, true);
});

test('unnumbered chapter keeps its heading; numbering restart opens a new run', () => {
  const src = '# T\n\n1 a\n\n2 b\n\n1 c\n\n## The Text of the Haggadah\n\n1 d\n';
  const doc = F.parseText(src, 'en');
  assert.equal(F.writeText(doc, 'en'), src);
  assert.deepEqual(doc.chapters.map(c => c.key), ['0', '0b', 'x1']);
  assert.equal(F.parseText('## X, Chapter 1\n\n1:1 a\n\n613 is a number, not a law.\n', 'en').chapters[0].laws[0].extra.length, 1);
});

test('Hebrew labels (incl. NBSP after them) and headings', () => {
  const src = '# הלכות\n\n## הלכות פלוני פרק טו\n\n**טו,א**\xA0 טקסט.  [ב] עוד.\n\n**הלכותיו** אינו מספר.\n';
  const doc = F.parseText(src, 'he');
  assert.equal(doc.chapters[0].n, 15);
  assert.equal(doc.chapters[0].laws.length, 1);
  assert.equal(doc.chapters[0].laws[0].extra.length, 1);
  assert.equal(F.writeText(doc, 'he'), '# הלכות\n\n## הלכות פלוני פרק טו\n\n**טו,א** טקסט.  [ב] עוד.\n\n**הלכותיו** אינו מספר.\n');
});

test('notes: colon added, continuations tab-indented, ranges parsed', () => {
  const src = '## T\n\n## T, Chapter 2\n\n[^2.3-6.1] *phrase* - text\n\n\tMore.\n\nUnindented more.\n\n[^2.7.1]: Other.\n';
  const doc = F.parseNotes(src);
  assert.equal(F.writeNotes(doc), '## T\n\n## T, Chapter 2\n\n[^2.3-6.1]: *phrase* - text\n\n\tMore.\n\n\tUnindented more.\n\n[^2.7.1]: Other.\n');
  const n = doc.chapters[1].notes[0];
  assert.deepEqual([n.c, n.h, n.h2, n.i], ['2', '3', '6', 1]);
  assert.equal(F.noteKey(n), '2:3');
});

test('paths and classify agree', () => {
  for (const id of ['01', '08a', '35b']) {
    for (const layer of F.LAYERS) assert.deepEqual(F.classify(F.paths(id)[layer]), { id, layer });
  }
  assert.equal(F.classify('Original/ct005.zip'), null);
  assert.equal(F.classify('Hebrew/01-onq.md'), null, 'a layer in the wrong folder');
});

test('stripTeamim keeps vowels, maqaf and sof pasuq; stripAll keeps letters', () => {
  const v = 'וַיִּקְרָ֨א אֱלֹהִ֤ים ׀ לָאוֹר֙ י֔וֹם וַֽיְהִי־עֶ֥רֶב׃';
  assert.equal(F.stripTeamim(v), 'וַיִּקְרָא אֱלֹהִים לָאוֹר יוֹם וַיְהִי־עֶרֶב׃');
  assert.equal(F.stripAll(v), 'ויקרא אלהים לאור יום ויהי־ערב׃');
  assert.equal(F.stripAll('<big>בְּ</big>רֵאשִׁ֖ית {פ}'), '<big>ב</big>ראשית {פ}');
});

test('a verse keeps its line breaks, marks and qere through a round trip', () => {
  const src = '# שמות\n\n## שמות פרק טו\n\n**טו,א** אָ֣ז יָשִֽׁיר {ר}\nלֵאמֹ֑ר {ס} אָשִׁ֤ירָה\n\n**טו,ב** הוצא (הַיְצֵ֣א) <big>ב</big>    עוד׃ {פ}\n';
  const doc = F.parseText(src, 'he');
  assert.equal(F.writeText(doc, 'he'), src);
  assert.deepEqual(doc.warnings, []);
  assert.equal(doc.chapters[0].laws.length, 2);
});

/* ---------- corpus ---------- */

if (fs.existsSync(opt.root)) {
  const read = p => fs.readFileSync(path.join(opt.root, p), 'utf8');
  const walk = d => fs.readdirSync(path.join(opt.root, d)).map(f => `${d}/${f}`);
  const files = ['Hebrew', 'Targum', 'Translation', 'Commentary', 'Notes']
    .filter(d => fs.existsSync(path.join(opt.root, d))).flatMap(walk);
  const docs = new Map();   // path → doc

  test(`every file is canonical: write(parse(x)) === x  [${files.length} files]`, () => {
    const bad = [];
    for (const f of files) {
      const c = F.classify(f);
      if (!c) { bad.push(`${f}: unrecognised file name`); continue; }
      const src = read(f);
      const doc = F.parse(src, c.layer);
      docs.set(f, doc);
      const again = F.write(doc, c.layer);
      if (again !== src) {
        const a = src.split('\n'), b = again.split('\n');
        const i = a.findIndex((l, k) => l !== b[k]);
        bad.push(`${f}: line ${i + 1}\n      file: ${JSON.stringify(a[i]).slice(0, 100)}\n      canon: ${JSON.stringify(b[i]).slice(0, 100)}`);
      } else if (doc.warnings.length) bad.push(`${f}: warnings ${doc.warnings.slice(0, 3).join('; ')}`);
    }
    assert.deepEqual(bad, []);
  });

  const TEXTS = ['he', 'tp', 'onq', 'onqk', 'en'];
  const shape = d => d.chapters.map(c => `${c.key}:${c.laws.map(l => l.n).join(',')}`).join(' | ');

  test('every edition lines up with the cantillated Hebrew, verse for verse', () => {
    const bad = [];
    const ids = new Set(files.map(F.classify).filter(Boolean).map(c => c.id));
    for (const id of ids) {
      const p = F.paths(id);
      const he = docs.get(p.he);
      if (!he) { bad.push(`${id}: no Hebrew`); continue; }
      for (const layer of TEXTS.slice(1)) {
        const d = docs.get(p[layer]);
        const torah = +id.slice(0, 2) <= 5;
        if (!d) { if (layer === 'tp' || layer === 'en' || torah) bad.push(`${id}: no ${layer}`); continue; }
        if (shape(d) !== shape(he)) bad.push(`${id} ${layer}: ${shape(d).slice(0, 60)} ≠ ${shape(he).slice(0, 60)}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test('every commentary/notes label points at an existing verse', () => {
    const bad = [];
    for (const [f, doc] of docs) {
      const c = F.classify(f);
      if (c.layer !== 'co' && c.layer !== 'notes') continue;
      const verses = new Set(F.units(docs.get(F.paths(c.id).he)).map(u => u.key));
      for (const ch of doc.chapters) for (const n of ch.notes) {
        if (n.c == null) { bad.push(`${f}: [^${n.label}] not c.v.n`); continue; }
        if (ch.n != null && n.c !== String(ch.n)) bad.push(`${f}: [^${n.label}] filed under chapter ${ch.n}`);
        for (const h of [n.h, n.h2].filter(x => x != null)) {
          if (!verses.has(`${n.c}:${h}`)) bad.push(`${f}: [^${n.label}] → no verse ${n.c}:${h}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  const index = fs.existsSync(path.join(opt.root, 'index.json')) ? JSON.parse(read('index.json')) : null;

  test('index.json: books and verse counts match the files', () => {
    assert.ok(index, 'no index.json');
    const bad = [];
    for (const b of index.books) {
      const he = docs.get(F.paths(b.id).he);
      if (!he) { bad.push(`${b.id}: no Hebrew file`); continue; }
      const want = he.chapters.map(c => c.laws.length).join(',');
      if (b.chapters.join(',') !== want) bad.push(`${b.id}: index ${b.chapters.join(',').slice(0, 60)} ≠ file ${want.slice(0, 60)}`);
      if (he.chapters.some((c, i) => c.n !== i + 1)) bad.push(`${b.id}: chapters not numbered 1…n`);
    }
    const verses = index.books.reduce((n, b) => n + b.chapters.reduce((a, c) => a + c, 0), 0);
    assert.deepEqual(bad, []);
    assert.equal(index.books.length, 39);
    assert.equal(verses, 23202);
  });

  test('index.json: the parashot tile the Torah, and every reference exists', () => {
    assert.ok(index, 'no index.json');
    const counts = new Map(index.books.map(b => [b.id, b.chapters]));
    const at = s => s.split(':').map(Number);
    const exists = (book, s) => { const [c, v] = at(s); const ch = counts.get(book); return !!ch && c >= 1 && c <= ch.length && v >= 1 && v <= ch[c - 1]; };
    const bad = [];
    const check = (where, r) => {
      if (!exists(r.book, r.from) || !exists(r.book, r.to)) bad.push(`${where}: ${r.book} ${r.from}–${r.to} does not exist`);
      const [c1, v1] = at(r.from), [c2, v2] = at(r.to);
      if (c1 > c2 || (c1 === c2 && v1 > v2)) bad.push(`${where}: ${r.from}–${r.to} runs backwards`);
    };
    assert.equal(index.parashot.length, 54);
    for (const book of ['01', '02', '03', '04', '05']) {
      let next = '1:1';
      for (const p of index.parashot.filter(x => x.book === book)) {
        if (p.from !== next) bad.push(`${p.en} starts at ${p.from}, expected ${next}`);
        check(p.en, p);
        const [c, v] = at(p.to);
        const ch = counts.get(book);
        next = v < ch[c - 1] ? `${c}:${v + 1}` : c < ch.length ? `${c + 1}:1` : 'end';
      }
      if (next !== 'end') bad.push(`book ${book}: the parashot stop at ${next}`);
    }
    for (const p of index.parashot.concat(index.readings)) {
      for (const r of [].concat(...(p.torah || [])).concat((p.haftarah && p.haftarah.ash) || [], (p.haftarah && p.haftarah.sef) || [])) check(p.en, r);
    }
    assert.deepEqual(bad, []);
  });
} else {
  console.log(`(no corpus at ${opt.root}; run tools/import.mjs and pass --root for the corpus checks)`);
}

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('FAIL ' + f);
process.exit(failures.length ? 1 : 0);
