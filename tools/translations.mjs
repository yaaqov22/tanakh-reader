// Builds the other English translations, from Sefaria, a folder each beside
// the JPS 1917 English (Translation/<book>-en.md), with a text file per book:
//
//   node tools/translations.mjs [--fetch] [--only rjps] [--root ../tanakh] [--out ../tanakh]
//
//   jps85  Tanakh: The Holy Scriptures (JPS, 1985)
//   rjps   The JPS Tanakh: Gender-Sensitive Edition (the Revised JPS, 2023)
//   koren  The Koren Jerusalem Bible
//
// --fetch downloads each book's version from Sefaria into the texts'
// Original/Sefaria/, replacing what is there. Without it, the files already
// there are used, so a rebuild needs no network.
//
// Each file has the shape of the JPS 1917 English: the same chapters and
// verses, in Mechon Mamre's numbering (Sefaria's is moved to it: sefaria.mjs,
// toMM), so it lines up with the Hebrew verse for verse. A verse the
// translation lacks is left empty. The section marks ({P} {S} {N}) are the
// JPS 1917 English's, at the end of the verse, or where two of Sefaria's
// verses are joined into one. The translators' footnotes are left out (the
// downloads keep them), and so are italics and bold; poetry keeps its line breaks.
//
// It writes, replacing what is there:
//   Translation/<id>/<book>-en.md   for each translation and book
//   Translation/README.md        where each came from, with the licences
// The files are generated: run this again to rebuild them, rather than
// editing them.
import fs from 'node:fs';
import path from 'node:path';
import { F, APP_ROOT, args } from './lib.mjs';
import { SEFARIA, SEFARIA_BOOK, toMM, get, safe, decode, dropFootnotes } from './sefaria.mjs';

const opt = args({
  root: path.resolve(APP_ROOT, '../tanakh'),
  out: path.resolve(APP_ROOT, '../tanakh'),
  fetch: false,
  only: '',
});

const TRANSLATIONS = {
  jps85: { name: 'JPS 1985', version: 'Tanakh: The Holy Scriptures, published by JPS' },
  rjps: { name: 'Revised JPS 2023', version: 'THE JPS TANAKH: Gender-Sensitive Edition' },
  koren: { name: 'The Koren Jerusalem Bible', version: 'The Koren Jerusalem Bible' },
};
for (const id of Object.keys(TRANSLATIONS)) if (F.TRANSLATIONS.indexOf(id) < 0) throw new Error(`${id}: not a layer in js/format.js`);

const ORIGINAL = path.join(opt.out, 'Original', 'Sefaria');
const ix = JSON.parse(fs.readFileSync(path.join(opt.root, 'index.json'), 'utf8'));

const versionFile = (title, vt) => path.join(ORIGINAL, safe(`${title} - en - ${vt}`) + '.json');

async function fetchVersion(title, vt) {
  const url = `${SEFARIA}/download/version/${encodeURIComponent(`${title} - en - ${vt}`)}.json`;
  const text = await get(url, 'tanakh-reader tools/translations.mjs');
  JSON.parse(text);   // the whole of it, or nothing
  fs.mkdirSync(ORIGINAL, { recursive: true });
  fs.writeFileSync(versionFile(title, vt), text);
}

/* One verse's HTML as the text of a verse, which is plain text (the reader
   reads only the section marks in it, md.verse()): footnotes left out, small
   caps, large letters, italics and bold as plain letters ("L<small>ORD</small>"
   → "LORD"), each line of poetry its own line. */
function verseText(html) {
  const s = dropFootnotes(String(html))
    .replace(/[{}]/g, m => (m === '{' ? '(' : ')'))      // braces are the section marks' own
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decode(s).split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

/* A verse of the JPS 1917 English, split at its section marks: the marks
   within it (each with text after it) and those it ends with. */
const MARK = /\s*(\{[PSN]\})\s*/g;
function marksOf(law) {
  const text = [law.text, ...law.extra].join('\n');
  const inner = [], end = [];
  let m;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(text))) (/\S/.test(text.slice(m.index + m[0].length)) ? inner : end).push(m[1]);
  return { inner, end };
}

const report = [];

async function build(id, t) {
  const used = { books: 0, verses: 0, empty: [], dropped: [], license: null, source: null };
  const dir = path.join(opt.out, 'Translation', id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^\d\d[ab]?-en\.md$/.test(f)) fs.unlinkSync(path.join(dir, f));
  for (const b of ix.books) {
    const title = SEFARIA_BOOK[b.id] || b.en;
    if (opt.fetch) await fetchVersion(title, t.version);
    const file = versionFile(title, t.version);
    if (!fs.existsSync(file)) throw new Error(`${file}: not downloaded (run with --fetch)`);
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    used.license = used.license || json.license || null;
    used.source = used.source || json.versionSource || null;
    const text = Array.isArray(json.text) ? json.text : (json.text && json.text['']) || [];

    /* Sefaria's verses, gathered under Mechon Mamre's: "c:v" → [html]. */
    const byVerse = new Map();
    text.forEach((chapter, ci) => (chapter || []).forEach((verse, vi) => {
      const html = Array.isArray(verse) ? verse.join('<br>') : verse;
      if (typeof html !== 'string' || !html.trim()) return;
      const at = toMM(b.id, ci + 1, vi + 1);
      if (!at) { used.dropped.push(`${b.en} ${ci + 1}:${vi + 1}`); return; }
      const k = at.join(':');
      if (!byVerse.has(k)) byVerse.set(k, []);
      byVerse.get(k).push(html);
    }));

    /* The JPS 1917 English's shape, with this translation's verses. */
    const en = F.parse(fs.readFileSync(path.join(opt.root, F.paths(b.id).en), 'utf8'), 'en');
    const seen = new Set();
    const doc = {
      front: [], title: en.title, intro: [], warnings: [],
      chapters: en.chapters.map(ch => ({
        key: ch.key, n: ch.n, name: ch.name, heading: ch.heading, implicit: ch.implicit, intro: [],
        laws: ch.laws.map(law => {
          const k = `${ch.n}:${law.n}`;
          seen.add(k);
          const parts = (byVerse.get(k) || []).map(verseText).filter(Boolean);
          const marks = marksOf(law);
          if (!parts.length) { used.empty.push(`${b.en} ${k}`); return { n: law.n, text: '', extra: [] }; }
          let out = parts[0];
          for (let i = 1; i < parts.length; i++) out += (marks.inner.length ? ' ' + marks.inner.shift() + ' ' : ' ') + parts[i];
          const tail = marks.inner.concat(marks.end);
          if (tail.length) out += ' ' + tail.join(' ');
          used.verses++;
          return { n: law.n, text: out, extra: [] };
        }),
      })),
    };
    for (const k of byVerse.keys()) if (!seen.has(k)) used.dropped.push(`${b.en} ${k} (no such verse)`);

    const out = F.write(doc, id);
    const again = F.parse(out, id);
    if (F.write(again, id) !== out || again.warnings.length) {
      throw new Error(`${F.paths(b.id)[id]} is not canonical: ${again.warnings.slice(0, 3).join('; ')}`);
    }
    fs.writeFileSync(path.join(opt.out, F.paths(b.id)[id]), out);
    used.books++;
  }
  console.log(`${id}: ${used.books} books, ${used.verses} verses; ${used.empty.length} empty, ${used.dropped.length} left out`);
  if (used.empty.length) console.log('  empty: ' + used.empty.slice(0, 30).join(', ') + (used.empty.length > 30 ? ' …' : ''));
  if (used.dropped.length) console.log('  left out: ' + used.dropped.join(', '));
  report.push({ id, ...t, ...used });
}

function readme() {
  const out = ['# Translations', '',
    'The English beside the Hebrew, one file per book, numbered as Mechon Mamre numbers the verses.', '',
    '`{book}-en.md`, here at the top, is Mechon Mamre\'s English, the JPS 1917 translation; it is part of the import from Mechon Mamre (`tools/import.mjs`).', '',
    'The others have a folder each (`jps85/{book}-en.md` …). They are generated from [Sefaria](https://www.sefaria.org)\'s texts by `tools/translations.mjs` in the reader\'s repository, whose downloads are kept in `Original/Sefaria/`. Don\'t edit them by hand; fix the tool and run it again. Each has the JPS 1917 file\'s chapters, verses and section marks. The translators\' footnotes are left out; the downloads keep them.', '',
    '| Files | Translation | Sefaria version | Licence | Verses | Empty |', '|---|---|---|---|---|---|'];
  for (const r of report) {
    out.push(`| \`${r.id}/{book}-en.md\` | ${r.name} | ${r.source ? `[${r.version}](${r.source})` : r.version} | ${r.license || '?'} | ${r.verses} | ${r.empty.length} |`);
  }
  out.push('', 'Sefaria numbers the verses as most Bibles do; the tool moves them to Mechon Mamre\'s numbering where the two differ (Exodus 20, Deuteronomy 5, Numbers 25–26, Joshua 21, 1 Samuel 23–24, Jeremiah 30–31). Joshua 21:36–37 (Reuben\'s cities), which Mechon Mamre doesn\'t have, are left out.', '');
  return out.join('\n');
}

const ids = Object.keys(TRANSLATIONS).filter(id => !opt.only || opt.only.split(',').includes(id));
if (!ids.length) throw new Error(`no translation ${opt.only}`);
for (const id of ids) await build(id, TRANSLATIONS[id]);
if (!opt.only) fs.writeFileSync(path.join(opt.out, 'Translation', 'README.md'), readme());
