// Builds the MT links: for every verse the Mishneh Torah quotes, the
// halakhot that quote it, each a link to it in MT Reader followed by its text.
//
//   node tools/mt-links.mjs [--mt ../mishneh-torah] [--mtreader ../mt-reader]
//                           [--root ../tanakh] [--out ../tanakh]
//
// The quotations are found as MT Reader finds them (its js/refs.js): in the
// Hebrew of every halakhah, "(דברים ו,ד)", or in its English, "(Deuteronomy
// 6:4)", where the Hebrew cites nothing, with their lists. A range ("Exodus
// 21:2-6") is linked on its first verse, and a chapter cited alone
// ("(Leviticus 18)") on its first.
//
// One notes file per book, MT/<id>-mt.md, in the commentary's format:
//   [^6.4.1]: ***[Laws of the Foundations of the Torah 1:7](https://…/#/read/1-1/1/7)*** - However, …
// the halakhot in the Mishneh Torah's order. Its text is the English, or the
// Hebrew where the halakhah isn't translated yet. The files are generated:
// run this again to rebuild them, rather than editing them.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { F, APP_ROOT, args } from './lib.mjs';

const opt = args({
  mt: path.resolve(APP_ROOT, '../mishneh-torah'),
  mtreader: path.resolve(APP_ROOT, '../mt-reader'),
  root: path.resolve(APP_ROOT, '../tanakh'),
  out: path.resolve(APP_ROOT, '../tanakh'),
});

await import(pathToFileURL(path.join(opt.mtreader, 'js/format.js')).href);
await import(pathToFileURL(path.join(opt.mtreader, 'js/refs.js')).href);
const M = globalThis.MT.format;
const R = globalThis.MT.refs;

const MT_READER = 'https://yaaqov22.github.io/mt-reader/';

const read = (root, p) => {
  const f = path.join(root, p);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};

/* The Tanakh: verses per chapter, and each book's English name. */
const ix = JSON.parse(read(opt.root, 'index.json'));
const verses = new Map(ix.books.map(b => [b.id, b.chapters]));
const title = new Map(ix.books.map(b => [b.id, b.en]));

/* Each reference's verse, "book/chapter/verse": a range's first verse, and
   a chapter cited alone its first. (refs.js links them so.) */
function cited(text) {
  const out = [];
  for (const r of R.find(text, {})) {
    const m = r.href.match(/#\/read\/([^/]+)\/(\d+)(?:\/(\d+))?$/);
    if (!m) continue;
    const [, book, c, v = '1'] = m;
    const counts = verses.get(book);
    if (!counts || +v > counts[c - 1]) { skipped.push(`${text.slice(r.start, r.end)} (no such verse)`); continue; }
    out.push(`${book}/${c}/${v}`);
  }
  return out;
}

/* A halakhah's text as quoted: the Vilna numbers ("\[2]", "[ב]") left out. */
const clean = s => s.replace(/\s*\\\[\d+\]\s*/g, ' ').replace(/\s*\[[א-ת"']+\]\s*/g, ' ').replace(/ {2,}/g, ' ').trim();

const skipped = [];
const links = new Map();   // book id → Map("c:v" → [{ name, href, text, more }])
const mtIx = JSON.parse(read(opt.mt, 'index.json'));
let halakhot = 0;

for (const book of mtIx.books) for (const s of book.sections) {
  const p = M.paths(s.id);
  const heSrc = read(opt.mt, p.he), enSrc = read(opt.mt, p.en);
  if (!heSrc && !enSrc) continue;
  const he = heSrc && M.parse(heSrc, 'he');
  const en = enSrc && M.parse(enSrc, 'en');
  const name = (en && en.title) || s.en;
  const heLaws = he ? M.lawMap(he) : new Map();
  const enLaws = en ? M.lawMap(en) : new Map();
  const keys = [...new Set([...heLaws.keys(), ...enLaws.keys()])];
  for (const key of keys) {
    const h = heLaws.get(key), e = enLaws.get(key);
    const all = l => (l ? [l.text, ...l.extra] : []);
    /* The Hebrew's citations, where it has any: they number the verses as
       Mechon Mamre does, as the Tanakh Reader does, and the English
       sometimes doesn't (Exodus 20:7 for 20:6). */
    let found = new Set(all(h).flatMap(t => cited(t)));
    if (!found.size) found = new Set(all(e).flatMap(t => cited(t)));
    if (!found.size) continue;
    halakhot++;
    const [c, n] = key.split(':');
    const unnumbered = !/^[1-9]\d*$/.test(c);   // "0", "0b": a run of laws with no chapters
    const link = {
      name: name + ' ' + (unnumbered ? n : c + ':' + n),
      href: MT_READER + '#/read/' + s.id + '/' + c + '/' + n,
      text: all(e && e.text ? e : h).map(clean),
    };
    for (const ref of found) {
      const [b, vc, vv] = ref.split('/');
      if (!links.has(b)) links.set(b, new Map());
      const byVerse = links.get(b);
      const k = vc + ':' + vv;
      if (!byVerse.has(k)) byVerse.set(k, []);
      byVerse.get(k).push(link);
    }
  }
}

/* The files. */
const dir = path.join(opt.out, 'MT');
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (/-mt\.md$/.test(f)) fs.unlinkSync(path.join(dir, f));
let notes = 0;
for (const b of ix.books) {
  const byVerse = links.get(b.id);
  if (!byVerse) continue;
  const doc = { front: [], title: b.en, intro: [], chapters: [], warnings: [] };
  const order = [...byVerse.keys()].sort((x, y) => {
    const [a1, a2] = x.split(':').map(Number), [b1, b2] = y.split(':').map(Number);
    return a1 - b1 || a2 - b2;
  });
  for (const k of order) {
    const [c, v] = k.split(':').map(Number);
    let ch = doc.chapters[doc.chapters.length - 1];
    if (!ch || ch.n !== c) {
      ch = { key: String(c), n: c, name: title.get(b.id), heading: null, implicit: false, intro: [], notes: [] };
      doc.chapters.push(ch);
    }
    byVerse.get(k).forEach((l, i) => {
      const label = `${c}.${v}.${i + 1}`;
      ch.notes.push({ label, ...F.parseNoteLabel(label),
        text: `***[${l.name}](${l.href})*** - ${l.text[0]}`, more: l.text.slice(1) });
      notes++;
    });
  }
  const text = F.writeNotes(doc);
  if (F.writeNotes(F.parseNotes(text)) !== text) throw new Error(`MT/${b.id}-mt.md is not canonical`);
  fs.writeFileSync(path.join(dir, `${b.id}-mt.md`), text);
}

console.log(`${halakhot} halakhot quote verses; ${notes} links on ${[...links.values()].reduce((n, m) => n + m.size, 0)} verses in ${links.size} books.`);
if (skipped.length) console.log(`Left out (${skipped.length}):\n  ` + [...new Set(skipped)].join('\n  '));
