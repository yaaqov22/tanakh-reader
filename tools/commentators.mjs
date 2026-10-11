// Builds the commentators: the classical commentaries on the Tanakh, from
// Sefaria, one notes file per book and language, as the MT links are.
//
//   node tools/commentators.mjs [--fetch] [--only rashbam] [--root ../tanakh] [--out ../tanakh]
//
// tools/commentators.json says which: for each commentator its names, its
// Sefaria title ("Rashbam on {book}"), the books it covers, and for each
// language the Sefaria versions to take, in order. A verse's comments come
// from the first of them that has any on it, so a later one only fills the
// gaps of an earlier (Rashbam's Hebrew is Da'at's, with the few verses it
// lacks from Wikisource).
//
// --fetch downloads the versions from Sefaria into the texts' Original/Sefaria/
// (its list of versions, then each one's JSON), replacing what is there.
// Without it, the files already there are used, so a rebuild needs no network.
//
// It writes, replacing what is there for the commentators it builds:
//   Commentators/<id>/<book>-he.md, -en.md
//       in the commentary's format, numbered as Mechon Mamre numbers the
//       verses: [^1.4.2]: **ויבדל אלהים** - שי"ב שעות היה היום …
//   Commentators/index.json   what the reader lists: every commentator, its
//                             books and languages, and where each came from
//   Commentators/README.md    the same, to read, with the licences
// The files are generated: run this again to rebuild them, rather than
// editing them.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { F, APP_ROOT, HERE, args } from './lib.mjs';

const opt = args({
  root: path.resolve(APP_ROOT, '../tanakh'),
  out: path.resolve(APP_ROOT, '../tanakh'),
  fetch: false,
  only: '',
});

const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, 'commentators.json'), 'utf8'));
const LANGS = ['he', 'en'];
const RESERVED = new Set(F.LAYERS.concat(['tg', 'cm']));
const SEFARIA = 'https://www.sefaria.org';
const ORIGINAL = path.join(opt.out, 'Original', 'Sefaria');

const ix = JSON.parse(fs.readFileSync(path.join(opt.root, 'index.json'), 'utf8'));
const byId = new Map(ix.books.map(b => [b.id, b]));

/* Sefaria's name for a book, where it isn't Mechon Mamre's English. */
const SEFARIA_BOOK = {
  '08a': 'I Samuel', '08b': 'II Samuel', '09a': 'I Kings', '09b': 'II Kings',
  '25a': 'I Chronicles', '25b': 'II Chronicles',
};

/* Sefaria numbers the verses as most Bibles do; Mechon Mamre differs in five
   chapters (checked against both texts). Each maps Sefaria's verse to Mechon
   Mamre's [chapter, verse], or null where it has no such verse.
     Exodus 20, Deuteronomy 5  "I am the Lord" and "You shall have no other
                               gods" are one verse here
     Joshua 21                 verses 36–37 (Reuben's cities) aren't here
     Jeremiah 30–31            Sefaria's 31:1 is 30:25 here */
const SHIFT = {
  '02': { 20: v => [20, v >= 3 ? v - 1 : v] },
  '05': { 5: v => [5, v >= 7 ? v - 1 : v] },
  '06': { 21: v => (v === 36 || v === 37 ? null : [21, v >= 38 ? v - 2 : v]) },
  '11': { 31: v => (v === 1 ? [30, 25] : [31, v - 1]) },
};
const toMM = (book, c, v) => (SHIFT[book] && SHIFT[book][c] ? SHIFT[book][c](v) : [c, v]);

/* ------------------------------------------------------------ Sefaria */

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'tanakh-reader tools/commentators.mjs' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url}: ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

const safe = s => s.replace(/[\\/:*?"<>|]/g, '_');
const versionsFile = title => path.join(ORIGINAL, safe(title) + ' - versions.json');
const versionFile = (title, lang, vt) => path.join(ORIGINAL, safe(`${title} - ${lang} - ${vt}`) + '.json');

async function fetchBook(title) {
  fs.mkdirSync(ORIGINAL, { recursive: true });
  const list = await get(`${SEFARIA}/api/texts/versions/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  fs.writeFileSync(versionsFile(title), JSON.stringify(JSON.parse(list), null, 1) + '\n');
  return JSON.parse(list);
}

async function fetchVersion(title, lang, vt) {
  const url = `${SEFARIA}/download/version/${encodeURIComponent(`${title} - ${lang} - ${vt}`)}.json`;
  const text = await get(url);
  JSON.parse(text);   // the whole of it, or nothing
  fs.writeFileSync(versionFile(title, lang, vt), text);
}

/* --------------------------------------------------------------- text */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/* One comment as Markdown paragraphs: Sefaria's HTML (<b>, <i>, <br>,
   <small> …) read as Markdown or dropped, its line breaks made paragraphs,
   and the words it comments on bolded where they stand plainly at the start
   ("ויבדל אלהים - …" in the Hebrew, "ויבדל אלוקים, He arranged …" in the
   English). */
function paragraphs(html, lang) {
  let s = String(html)
    .replace(/\\/g, '\\\\').replace(/\*/g, '\\*')
    .replace(/\[([^\]]*)\]\(/g, '\\[$1\\](')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(b|strong)>/gi, '**')
    .replace(/<\/?(i|em)>/gi, '*')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\*\*(\s*)\*\*/g, '$1');
  const paras = s.split(/\s*\n\s*/).map(p => p.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean)
    .map(p => p.replace(/^\*\*\s*\*\*/, ''));
  if (paras.length && !paras[0].startsWith('*')) {
    const he = /[א-ת]/;
    if (lang === 'he') {
      /* Up to the first dash standing between spaces, if that is short and
         no sentence ends before it. */
      const m = paras[0].match(/^((?:[^.:\-–]|[-–](?!\s)){1,90}?)\s+[-–]\s+/);
      if (m && he.test(m[1])) paras[0] = `**${m[1].trim()}** - ` + paras[0].slice(m[0].length);
    } else {
      /* The Hebrew words before the first comma. */
      const m = paras[0].match(/^([֐-׿'"׳״־\- ]{2,90}?),\s*/);
      if (m && he.test(m[1])) paras[0] = `**${m[1].trim()}**, ` + paras[0].slice(m[0].length);
    }
  }
  return paras;
}

/* ------------------------------------------------------------- build */

const skipped = [];

/* A version's comments by Mechon Mamre's verse: Map("c:v" → [paragraphs]). */
function comments(json, book, lang, where) {
  const out = new Map();
  const counts = byId.get(book).chapters;
  (json.text || []).forEach((chapter, ci) => (chapter || []).forEach((verse, vi) => {
    const list = (Array.isArray(verse) ? verse : [verse]).filter(x => typeof x === 'string' && x.trim());
    if (!list.length) return;
    const at = toMM(book, ci + 1, vi + 1);
    if (!at || at[1] > (counts[at[0] - 1] || 0)) { skipped.push(`${where} ${ci + 1}:${vi + 1} (no such verse)`); return; }
    const k = at.join(':');
    if (!out.has(k)) out.set(k, []);
    for (const x of list) {
      const p = paragraphs(x, lang);
      if (p.length) out.get(k).push(p);
    }
  }));
  return out;
}

function noteDoc(title, book, byVerse) {
  const doc = { front: [], title, intro: [], chapters: [], warnings: [] };
  const order = [...byVerse.keys()].sort((x, y) => {
    const [a1, a2] = x.split(':').map(Number), [b1, b2] = y.split(':').map(Number);
    return a1 - b1 || a2 - b2;
  });
  for (const k of order) {
    const [c, v] = k.split(':').map(Number);
    let ch = doc.chapters[doc.chapters.length - 1];
    if (!ch || ch.n !== c) {
      ch = { key: String(c), n: c, name: byId.get(book).en, heading: null, implicit: false, intro: [], notes: [] };
      doc.chapters.push(ch);
    }
    byVerse.get(k).forEach((paras, i) => {
      const label = `${c}.${v}.${i + 1}`;
      ch.notes.push({ label, ...F.parseNoteLabel(label), text: paras[0], more: paras.slice(1) });
    });
  }
  return doc;
}

async function build(id, cm) {
  if (RESERVED.has(id) || !/^[a-z][a-z0-9]*$/.test(id)) throw new Error(`${id}: not a usable commentator id`);
  const dir = path.join(opt.out, 'Commentators', id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^\d\d[ab]?-(he|en)\.md$/.test(f)) fs.unlinkSync(path.join(dir, f));

  const entry = { id, en: cm.en, he: cm.he, full: cm.full, books: {}, sources: [] };
  const used = new Map();   // "lang|versionTitle" → source entry
  for (const book of cm.books) {
    const b = byId.get(book);
    if (!b) throw new Error(`${id}: no book ${book}`);
    const title = cm.sefaria.replace('{book}', SEFARIA_BOOK[book] || b.en);
    const versions = opt.fetch ? await fetchBook(title)
      : fs.existsSync(versionsFile(title)) ? JSON.parse(fs.readFileSync(versionsFile(title), 'utf8')) : null;
    if (!versions) throw new Error(`${title}: not downloaded (run with --fetch)`);

    for (const lang of LANGS) {
      const merged = new Map();
      const from = new Map();   // verse → the version it came from
      for (const want of (cm.versions[lang] || [])) {
        const v = versions.find(x => x.language === lang && x.versionTitle.toLowerCase().includes(want.toLowerCase()));
        if (!v) continue;
        if (opt.fetch) await fetchVersion(title, lang, v.versionTitle);
        const file = versionFile(title, lang, v.versionTitle);
        if (!fs.existsSync(file)) throw new Error(`${file}: not downloaded (run with --fetch)`);
        const got = comments(JSON.parse(fs.readFileSync(file, 'utf8')), book, lang, `${title} (${v.versionTitle})`);
        let added = 0;
        for (const [k, list] of got) {
          if (merged.has(k) || !list.length) continue;
          merged.set(k, list);
          from.set(k, v.versionTitle);
          added++;
        }
        if (!added) continue;
        const key = lang + '|' + v.versionTitle;
        if (!used.has(key)) {
          used.set(key, { lang, version: v.versionTitle, license: v.license || null,
            source: v.versionSource || null, books: [], verses: 0 });
        }
        const src = used.get(key);
        src.books.push(book);
        src.verses += added;
      }
      if (!merged.size) continue;
      const doc = noteDoc(`${cm.en} on ${b.en}`, book, merged);
      const text = F.writeNotes(doc);
      const again = F.parseNotes(text);
      if (F.writeNotes(again) !== text || again.warnings.length) {
        throw new Error(`Commentators/${id}/${book}-${lang}.md is not canonical: ${again.warnings.slice(0, 3).join('; ')}`);
      }
      fs.writeFileSync(path.join(dir, `${book}-${lang}.md`), text);
      (entry.books[book] = entry.books[book] || []).push(lang);
      const n = doc.chapters.reduce((s, ch) => s + ch.notes.length, 0);
      console.log(`${id} ${book}-${lang}: ${n} comments on ${merged.size} verses`);
    }
  }
  /* The Hebrew first, then the English; each in the order of its first book. */
  entry.sources = [...used.values()].sort((a, b) => LANGS.indexOf(a.lang) - LANGS.indexOf(b.lang) ||
    cm.books.indexOf(a.books[0]) - cm.books.indexOf(b.books[0]));
  return entry;
}

/* ------------------------------------------------------------ catalog */

function readme(list) {
  const out = ['# Commentators', '',
    'The classical commentaries the reader shows beside the commentary, one folder each, with a file per book and language (`{book}-he.md`, `{book}-en.md`) in the commentary\'s format, numbered as Mechon Mamre numbers the verses. `index.json` lists them for the reader.', '',
    'They are generated from [Sefaria](https://www.sefaria.org)\'s texts by `tools/commentators.mjs` in the reader\'s repository, whose downloads are kept in `Original/Sefaria/`. Don\'t edit them by hand; fix the tool and run it again.', ''];
  for (const c of list) {
    const name = n => byId.get(n).en;
    out.push(`## ${c.en} (${c.he})`, '', c.full + '.', '',
      '| Language | Version | Licence | Books | Verses |', '|---|---|---|---|---|');
    for (const s of c.sources) {
      out.push(`| ${s.lang === 'he' ? 'Hebrew' : 'English'} | ${s.source ? `[${s.version}](${s.source})` : s.version} | ${s.license || '?'} | ${s.books.map(name).join(', ')} | ${s.verses} |`);
    }
    out.push('', 'Where a language has more than one version, a verse\'s comments are the first version\'s, and the later ones only fill in verses it has nothing on.', '');
  }
  return out.join('\n');
}

const ids = Object.keys(CONFIG).filter(id => !opt.only || opt.only.split(',').includes(id));
if (!ids.length) throw new Error(`no commentator ${opt.only} in tools/commentators.json`);
const catalogPath = path.join(opt.out, 'Commentators', 'index.json');
const old = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')).commentators : [];
const built = new Map(old.map(c => [c.id, c]));
for (const id of ids) built.set(id, await build(id, CONFIG[id]));
/* In the order tools/commentators.json lists them; any it no longer lists are dropped. */
const list = Object.keys(CONFIG).map(id => built.get(id)).filter(Boolean);
fs.writeFileSync(catalogPath, JSON.stringify({ format: 1, commentators: list }, null, 1) + '\n');
fs.writeFileSync(path.join(opt.out, 'Commentators', 'README.md'), readme(list));

if (skipped.length) console.log(`Left out (${skipped.length}):\n  ` + skipped.join('\n  '));
