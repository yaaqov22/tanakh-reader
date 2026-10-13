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
// A version's introductions (Sefaria's parts beside its comments) open its
// book's file. Its footnotes are left out.
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

/* Sefaria's footnotes, left out: the marker, <sup class="footnote-marker">,
   and the note itself, <i class="footnote">, which may hold <i>s of its own. */
function dropFootnotes(s) {
  /* The markers, with a class or without (Strickman's "<sup>1</sup>", the
     Piotrków edition's "<sup>54)</sup>"). */
  s = s.replace(/<sup\b[^>]*>[^<]{0,8}<\/sup>/g, '');
  for (let at = s.indexOf('<i class="footnote">'); at >= 0; at = s.indexOf('<i class="footnote">')) {
    const tag = /<(\/?)i\b[^>]*>/g;
    tag.lastIndex = at;
    let depth = 0, end = s.length, m;
    while ((m = tag.exec(s))) {
      depth += m[1] ? -1 : 1;
      if (!depth) { end = m.index + m[0].length; break; }
    }
    s = s.slice(0, at) + s.slice(end);
  }
  return s;
}

/* Bold and italics that open and close in pairs: a closing tag with nothing
   open (Sefaria's texts have some, left from footnotes) and an opening tag
   never closed are dropped, so that no stray * is left in the Markdown. */
function balanced(s) {
  const tag = /<(\/?)(b|strong|i|em)\b[^>]*>/gi;
  const open = [];      // [kind, index of its tag in the list]
  const drop = new Set();
  const tags = [];
  let m;
  while ((m = tag.exec(s))) {
    const kind = /^(b|strong)$/i.test(m[2]) ? 'b' : 'i';
    tags.push({ at: m.index, len: m[0].length });
    const i = tags.length - 1;
    if (!m[1]) { open.push([kind, i]); continue; }
    const k = open.map(o => o[0]).lastIndexOf(kind);
    if (k < 0) { drop.add(i); continue; }
    open.splice(k).slice(1).forEach(o => drop.add(o[1]));   // tags left open inside it
  }
  open.forEach(o => drop.add(o[1]));
  let out = '', from = 0;
  tags.forEach((t, i) => {
    if (!drop.has(i)) return;
    out += s.slice(from, t.at);
    from = t.at + t.len;
  });
  return out + s.slice(from);
}

/* One comment as Markdown paragraphs: Sefaria's HTML (<b>, <i>, <br>,
   <small> …) read as Markdown or dropped, its footnotes left out, its line
   breaks made paragraphs, and the words it comments on bolded where they
   stand plainly at the start (lemma()). */
function paragraphs(html, lang, lemma = true) {
  let s = balanced(dropFootnotes(String(html))
    .replace(/<(b|strong|i|em)\b[^>]*>\s*<\/\1>/gi, ''))          // empty, as Metsudah's markers are
    .replace(/&lt;\/?underline&gt;/g, '')                          // Munk's Or HaChaim, escaped
    .replace(/\\/g, '\\\\').replace(/\*/g, '\\*')
    .replace(/\[([^\]]*)\]\(/g, '\\[$1\\](')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(b|strong|i|em)\b[^>]*>(\s+)/gi, '$2<$1>')           // spaces outside the marks
    .replace(/(\s+)<\/(b|strong|i|em)>/gi, '</$2>$1')
    .replace(/<\/?(b|strong)\b[^>]*>/gi, '**')
    .replace(/<\/?(i|em)\b[^>]*>/gi, '*')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<\/?(?:b|i|u|em|strong|span|underline)\b[^>]*>/gi, '')   // tags escaped in the source, now decoded
    .replace(/\*\*(\s*)\*\*/g, '$1');
  const paras = s.split(/\s*\n\s*/).map(p => p.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean)
    .map(p => p.replace(/^\*\*\s*\*\*/, ''));
  if (lemma && paras.length && !paras[0].startsWith('*')) paras[0] = bolded(paras[0], lang);
  return paras;
}

/* A comment with the words it comments on bolded, where they stand plainly
   at its start, as each edition sets them:
     Hebrew            "ויבדל אלהים - …", up to the first dash between spaces
     English, Munk     "ויבדל אלוקים, He arranged …", the Hebrew before a comma or full stop
     English, Rashi    "ואלה שמות NOW THESE ARE THE NAMES — Although …", up to the dash
     English, Chavel   "AND THESE ARE THE NAMES OF …. The meaning …", the capitals
   each only when short, and with no sentence ending inside it. */
function bolded(p, lang) {
  const he = /[א-ת]/;
  const bold = (m, sep) => (`**${m[1].trim()}**${sep}` + p.slice(m[0].length)).trimEnd();
  if (lang === 'he') {
    const m = p.match(/^((?:[^.:\-–]|[-–](?!\s)){1,90}?)\s+[-–]\s+/);
    return m && he.test(m[1]) ? bold(m, ' - ') : p;
  }
  let m = p.match(/^([֐-׿'"׳״־\- ]{2,90}?)([,.])\s*/);
  if (m && he.test(m[1])) return bold(m, m[2] + ' ');
  m = p.match(/^(.{2,160}?)\s+—\s*/);
  if (m && !/[.!?]\s/.test(m[1]) && (he.test(m[1]) || /[A-Z]{2,}/.test(m[1]))) return bold(m, ' — ');
  m = p.match(/^([A-Z0-9“‘"'(\[][^.!?]{1,200}?(?:…\.|[.!?][’”'"]?))\s+/);
  if (m && !/[a-z]/.test(m[1].replace(/\[[^\]]*\]/g, '')) && /[A-Z]{2,}/.test(m[1])) return bold(m, ' ');
  return p;
}

/* ------------------------------------------------------------- build */

const skipped = [];

/* A version's text: its comments by chapter and verse, and the parts beside
   them (an Introduction, a Foreword) where Sefaria's text has any: those are
   an object, the comments its "" (its default part), the others named. */
function parts(json) {
  const t = json.text;
  if (Array.isArray(t)) return { main: t, named: [] };
  const named = Object.keys(t || {}).filter(k => k !== '').map(k => [k, t[k]]);
  return { main: (t && t['']) || [], named };
}

const flat = x => (Array.isArray(x) ? x.flatMap(flat) : typeof x === 'string' && x.trim() ? [x] : []);

/* A version's introductions, as the paragraphs of its book's opening: each
   under its name in bold. */
function intros(json, lang) {
  const out = [];
  for (const [name, body] of parts(json).named) {
    const paras = flat(body).flatMap(x => paragraphs(x, lang, false));
    if (paras.length) out.push(`**${name}**`, ...paras);
  }
  return out;
}

/* A version's comments by Mechon Mamre's verse: Map("c:v" → [paragraphs]). */
function comments(json, book, lang, where) {
  const out = new Map();
  const counts = byId.get(book).chapters;
  parts(json).main.forEach((chapter, ci) => (chapter || []).forEach((verse, vi) => {
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

function noteDoc(title, book, byVerse, intro) {
  const doc = { front: [], title, intro: intro || [], chapters: [], warnings: [] };
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
      let intro = [];           // the first version's with any
      for (const want of (cm.versions[lang] || [])) {
        const v = versions.find(x => x.language === lang && x.versionTitle.toLowerCase().includes(want.toLowerCase()));
        if (!v) continue;
        if (opt.fetch) await fetchVersion(title, lang, v.versionTitle);
        const file = versionFile(title, lang, v.versionTitle);
        if (!fs.existsSync(file)) throw new Error(`${file}: not downloaded (run with --fetch)`);
        const json = JSON.parse(fs.readFileSync(file, 'utf8'));
        const got = comments(json, book, lang, `${title} (${v.versionTitle})`);
        let added = 0, introduced = false;
        if (!intro.length) {
          intro = intros(json, lang);
          introduced = intro.length > 0;
        }
        for (const [k, list] of got) {
          if (merged.has(k) || !list.length) continue;
          merged.set(k, list);
          from.set(k, v.versionTitle);
          added++;
        }
        if (!added && !introduced) continue;
        const key = lang + '|' + v.versionTitle;
        if (!used.has(key)) {
          used.set(key, { lang, version: v.versionTitle, license: v.license || null,
            source: v.versionSource || null, books: [], verses: 0 });
        }
        const src = used.get(key);
        if (src.books.indexOf(book) < 0) src.books.push(book);
        src.verses += added;
      }
      if (!merged.size && !intro.length) continue;
      const doc = noteDoc(`${cm.en} on ${b.en}`, book, merged, intro);
      const text = F.writeNotes(doc);
      const again = F.parseNotes(text);
      const canon = F.writeNotes(again);
      if (canon !== text || again.warnings.length) {
        const a = text.split('\n'), b = canon.split('\n'), i = a.findIndex((l, k) => l !== b[k]);
        throw new Error(`Commentators/${id}/${book}-${lang}.md is not canonical: ${again.warnings.slice(0, 3).join('; ')}` +
          (i >= 0 ? `\n  line ${i + 1}: ${JSON.stringify(a[i]).slice(0, 200)}\n  canon: ${JSON.stringify(b[i]).slice(0, 200)}` : ''));
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
    'They are generated from [Sefaria](https://www.sefaria.org)\'s texts by `tools/commentators.mjs` in the reader\'s repository, whose downloads are kept in `Original/Sefaria/`. Don\'t edit them by hand; fix the tool and run it again.', '',
    'A commentator\'s introductions (Ramban\'s, Sforno\'s) stand at the head of its book\'s file, each under its name. The footnotes some translations have on Sefaria (Chavel\'s annotations to Ramban, Strickman\'s to Ibn Ezra) are left out; the downloads keep them.', ''];
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
