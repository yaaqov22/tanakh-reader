// Builds the tanakh data repo from Mechon Mamre's zips, in the canonical
// format that js/format.js reads and writes (see the header of that file).
//
//   node tools/import.mjs [--src ../tanakh] [--out out/data]
//
// --src holds the zips (in Original/ or at its top level): ct005 (cantillation),
// t002 (pointed, punctuated), u002 / q001 (Onqelos pointed / unpointed), et002
// (JPS 1917 English), cp002 (Tiqqun Qore'im). They are unpacked under
// out/src/ and read from there. Everything generated is written under --out,
// mirroring the repo layout, plus --out/REPORT.md. Nothing in --src is touched;
// copying the output over the repo is a separate, reviewable step.
//
//   ct005 c/ct/c{BB}{CC}.htm → Hebrew/{BB}-he.md      cantillated Hebrew
//   t002  t/t{BB}{CC}.htm    → Hebrew/{BB}-tp.md      pointed, punctuated
//   u002  u/u{BB}{CC}.htm    → Targum/{BB}-onq.md     Onqelos (Torah)
//   q001  q/q{BB}{CC}.htm    → Targum/{BB}-onqk.md    Onqelos unpointed
//   et002 et/et{BB}{CC}.htm  → Translation/{BB}-en.md
//   ct005 c/ct/cu{BB}{NN}.htm, cp002 cp/cp0.htm, cp/cp{BB}{NN}.htm,
//   ct005 c/ct/cqrywt.htm, et002 et/readinge.htm → index.json (books,
//         parashot, haftarot, holiday readings)
//
// Verses are found by their <A NAME="n"> anchors (not the <B> labels, which
// Psalms 70 and 108 combine as א-ב), and every edition is checked against the
// cantillated one verse for verse.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { F, APP_ROOT, args } from './lib.mjs';

const opt = args({
  src: path.resolve(APP_ROOT, '../tanakh'),
  out: path.resolve(APP_ROOT, 'out/data'),
});
const UNZIPPED = path.resolve(APP_ROOT, 'out/src');
const report = [];          // markdown lines for REPORT.md
const out = new Map();      // repo path → content
const note = s => report.push('- ' + s);

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

function zipPath(name) {
  for (const p of [path.join(opt.src, 'Original', name + '.zip'), path.join(opt.src, name + '.zip')]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`${name}.zip not found in ${opt.src} or ${opt.src}/Original`);
}

// Unpack a zip under out/src/<name>/ (once; delete the folder to redo it).
function unpacked(name) {
  const dir = path.join(UNZIPPED, name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zipPath(name), '-d', dir]);
  }
  return dir;
}

// Windows-1255 as Mechon Mamre uses it: byte 0xCA is holam haser for vav
// (U+05BA), which TextDecoder's table leaves undefined.
function decode1255(buf) {
  const parts = [];
  let from = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0xCA) continue;
    parts.push(new TextDecoder('windows-1255').decode(buf.subarray(from, i)), 'ֺ');
    from = i + 1;
  }
  parts.push(new TextDecoder('windows-1255').decode(buf.subarray(from)));
  return parts.join('');
}

const DECODE = {
  'utf-8': b => new TextDecoder('utf-8').decode(b),
  'windows-1255': decode1255,
  'windows-1252': b => new TextDecoder('windows-1252').decode(b),
};

// The editions, by layer. `end` is what closes a chapter's text.
const EDITIONS = {
  he: { zip: 'ct005', dir: 'c/ct', prefix: 'c', charset: 'utf-8', lang: 'he' },
  tp: { zip: 't002', dir: 't', prefix: 't', charset: 'windows-1255', lang: 'he' },
  onq: { zip: 'u002', dir: 'u', prefix: 'u', charset: 'windows-1255', lang: 'he' },
  onqk: { zip: 'q001', dir: 'q', prefix: 'q', charset: 'windows-1255', lang: 'he' },
  en: { zip: 'et002', dir: 'et', prefix: 'et', charset: 'windows-1252', lang: 'en' },
};

function readFile(ed, name) {
  const full = path.join(unpacked(ed.zip), ed.dir, name);
  return DECODE[ed.charset](fs.readFileSync(full));
}

// Chapter number from the two characters after the book code: "01"–"99",
// then Psalms 100–150 as "a0"–"f0" (a letter for 10–15 tens, then a digit).
function chapterNumber(cc) {
  const t = cc[0];
  return /\d/.test(t) ? +cc : 100 + ('abcdef'.indexOf(t)) * 10 + +cc[1];
}

// → Map(book code → [{ n, file }]) for one edition, chapters in order.
function chapterFiles(ed) {
  const re = new RegExp('^' + ed.prefix + '(\\d\\d[ab]?)([0-9a-f]\\d)\\.htm$');
  const books = new Map();
  for (const f of fs.readdirSync(path.join(unpacked(ed.zip), ed.dir))) {
    const m = f.match(re);
    if (!m) continue;
    if (!books.has(m[1])) books.set(m[1], []);
    books.get(m[1]).push({ n: chapterNumber(m[2]), file: f });
  }
  for (const list of books.values()) list.sort((a, b) => a.n - b.n);
  return books;
}

/* ------------------------------------------------------------------ */
/* A chapter file → its heading and verses                             */
/* ------------------------------------------------------------------ */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: '\xA0' };
const decodeEntities = s => s.replace(/&(#\d+|\w+);/g, (m, e) =>
  e[0] === '#' ? String.fromCharCode(+e.slice(1)) : (ENTITIES[e] ?? m));

const NUN_HAFUKHA = '׆';
const altLinks = [];        // verses that link to an alternative cantillation

// One verse's HTML → canonical text: line breaks as "\n", section marks and
// ktiv/qere as written, large/small/suspended letters as <big>/<small>/<sup>.
function verseText(html, where, ed) {
  let s = html
    .replace(/<A HREF="[^"]*"[^>]*>\*<\/A>/gi, () => { altLinks.push(where); return ''; })
    .replace(/\r?\n/g, ' ')
    .replace(/<B>(\{[PSN]\})<\/B>/gi, '$1')
    .replace(/<BR\s*\/?>|<\/?(?:P|DIV)\b[^>]*>/gi, '\n')
    .replace(/<(\/?)(BIG|SMALL|SUP)>/gi, (m, slash, tag) => `<${slash}${tag.toLowerCase()}>`)
    .replace(/<(?!\/?(?:big|small|sup)>)[^>]+>/g, tag => { throw new Error(`${where}: unhandled tag ${tag}`); });
  s = decodeEntities(s);
  // Mechon Mamre's Windows-1255 editions write the inverted nun (Num 10:35-36)
  // as "]".
  if (ed.charset === 'windows-1255') s = s.replace(/\]/g, NUN_HAFUKHA);
  return s.split('\n')
    .map(l => l.replace(/\xA0/g, ' ').trim().replace(/ {3,}/g, '    ').replace(/(\S) {2}(?=\S)/g, '$1 '))
    .filter(Boolean)
    .join('\n');
}

// → { heading, verses: [{ n, text }] }
function parseChapter(ed, file, bookCode, chN) {
  const html = readFile(ed, file);
  const where = `${ed.zip}:${file}`;
  const h1 = html.search(/<H1\b/i);
  if (h1 < 0) throw new Error(`${where}: no <H1>`);
  const endRe = ed.lang === 'en' ? /<CENTER>/i : /<HR>/i;
  const endAt = html.slice(h1).search(endRe);
  const body = html.slice(h1, h1 + endAt);
  const heading = decodeEntities(body.match(/<H1[^>]*>([^<]*)<\/H1>/i)[1]).trim();
  const pieces = body.split(/<A NAME="(\d+)">\s*<\/A>/i);
  const verses = [];
  let pendingLabel = null;   // a combined label (א-ב) covers the next anchor too
  for (let i = 1; i < pieces.length; i += 2) {
    const n = +pieces[i];
    let seg = pieces[i + 1].replace(/^\s*<P[^>]*>/i, '');
    const lab = seg.match(/^\s*<B>([^<]*)<\/B>/i);
    let prefix = '';
    if (lab && !/^\{[PSN]\}$/.test(lab[1])) {
      seg = seg.slice(lab[0].length);
      let label = lab[1].trim();
      if (label.endsWith(NUN_HAFUKHA) || label.endsWith(']')) {
        // Psalm 107's inverted nuns sit in the verse label.
        label = label.slice(0, -1).trim();
        prefix = NUN_HAFUKHA + ' ';
      }
      const combined = label.match(/^(.+)-(.+)$/);
      const num = s => (ed.lang === 'en' ? (/^\d+$/.test(s) ? +s : NaN) : F.hebNumeral(s));
      if (combined) {
        if (num(combined[1]) !== n || num(combined[2]) !== n + 1) throw new Error(`${where}: label ${label} at anchor ${n}`);
        pendingLabel = n + 1;
        note(`${F.headingText({ n: chN, name: heading.replace(/\s*(פרק|Chapter)\s+\S+$/, '') }, ed.lang)} (\`${where}\`): combined label "${label}" split at anchor ${n + 1}.`);
      } else if (num(label) !== n) {
        throw new Error(`${where}: label "${label}" at anchor ${n}`);
      }
    } else if (pendingLabel === n) {
      pendingLabel = null;
    } else {
      // An anchor with no label: only Mechon Mamre's trailing anchor after
      // the last verse, which must be empty.
      const rest = verseText(seg, where, ed);
      if (i + 2 < pieces.length || rest) throw new Error(`${where}: unlabelled anchor ${n}`);
      continue;
    }
    const text = prefix + verseText(seg, `${where}#${n}`, ed);
    if (!text) throw new Error(`${where}: verse ${n} is empty`);
    if (verses.length + 1 !== n) throw new Error(`${where}: verse ${n} out of order`);
    verses.push({ n, text });
  }
  return { heading, verses };
}

/* ------------------------------------------------------------------ */
/* Books                                                               */
/* ------------------------------------------------------------------ */

const SECTION = code => (+code.slice(0, 2) <= 5 ? 'torah' : +code.slice(0, 2) <= 24 ? 'neviim' : 'ketuvim');
const bookName = heading => heading.replace(/\s*(?:פרק|Chapter)\s+\S+$/, '').trim();

// layer → Map(book → [{ n, heading, verses }])
const corpus = {};
for (const [layer, ed] of Object.entries(EDITIONS)) {
  const books = new Map();
  for (const [code, chs] of chapterFiles(ed)) {
    books.set(code, chs.map(({ n, file }) => ({ n, ...parseChapter(ed, file, code, n) })));
  }
  corpus[layer] = books;
}

const codes = [...corpus.he.keys()].sort();
const books = codes.map(code => {
  const he = corpus.he.get(code), en = corpus.en.get(code);
  return {
    id: code,
    he: bookName(he[0].heading),
    en: bookName(en[0].heading),
    section: SECTION(code),
    chapters: he.map(ch => ch.verses.length),
  };
});

const TARGUM_TITLE = { onq: 'תרגום אונקלוס', onqk: 'תרגום אונקלוס (בלי ניקוד)' };

// Every edition against the cantillated text, chapter for chapter.
const misaligned = [];
for (const [layer, byBook] of Object.entries(corpus)) {
  if (layer === 'he') continue;
  for (const [code, chs] of byBook) {
    const he = corpus.he.get(code);
    if (!he) throw new Error(`${layer}: book ${code} has no Hebrew`);
    if (chs.length !== he.length) misaligned.push(`${layer} ${code}: ${chs.length} chapters, Hebrew ${he.length}`);
    chs.forEach((ch, i) => {
      if (!he[i] || ch.n !== he[i].n || ch.verses.length !== he[i].verses.length) {
        misaligned.push(`${layer} ${code} ch ${ch.n}: ${ch.verses.length} verses, Hebrew ${he[i] && he[i].verses.length}`);
      }
    });
  }
  const missing = codes.filter(c => !byBook.has(c));
  if (layer !== 'onq' && layer !== 'onqk' && missing.length) misaligned.push(`${layer}: no ${missing.join(', ')}`);
}
if (misaligned.length) throw new Error('editions do not line up:\n' + misaligned.join('\n'));

for (const book of books) {
  for (const layer of Object.keys(EDITIONS)) {
    const chs = corpus[layer].get(book.id);
    if (!chs) continue;
    const lang = EDITIONS[layer].lang;
    const name = lang === 'en' ? book.en : book.he;
    const doc = {
      front: [], intro: [], warnings: [],
      title: TARGUM_TITLE[layer] ? `${TARGUM_TITLE[layer]} – ${book.he}` : name,
      chapters: chs.map(ch => ({
        key: String(ch.n), n: ch.n, name, heading: null, implicit: false, intro: [],
        laws: ch.verses.map(v => ({ n: v.n, text: v.text, extra: [] })),
      })),
    };
    const text = F.writeText(doc, lang);
    // Canonical by construction: the parser must read back exactly this.
    const back = F.parseText(text, lang);
    if (F.writeText(back, lang) !== text || back.warnings.length) {
      throw new Error(`${book.id} ${layer} does not round-trip: ${back.warnings.slice(0, 3).join('; ')}`);
    }
    back.chapters.forEach((ch, i) => {
      if (ch.laws.length !== chs[i].verses.length) throw new Error(`${book.id} ${layer} ch ${ch.n}: verses lost in writing`);
    });
    out.set(F.paths(book.id)[layer], text);
  }
}

/* ------------------------------------------------------------------ */
/* Parashot (Tiqqun Qore'im), haftarot and holiday readings            */
/* ------------------------------------------------------------------ */

const ct = EDITIONS.he;
const verseCount = (code, c) => { const b = books.find(x => x.id === code); return b && b.chapters[c - 1]; };
const exists = (code, c, v) => { const n = verseCount(code, c); return !!n && v >= 1 && v <= n; };
const cmp = (a, b) => a.c - b.c || a.v - b.v;
const fmt = p => `${p.c}:${p.v}`;

// The verse after / before a place in a book, or null at its edge.
function nextVerse(code, p) {
  if (p.v < verseCount(code, p.c)) return { c: p.c, v: p.v + 1 };
  return verseCount(code, p.c + 1) ? { c: p.c + 1, v: 1 } : null;
}
function versesIn(code, from, to) {
  let n = 0;
  for (let p = from; p && cmp(p, to) <= 0; p = nextVerse(code, p)) n++;
  return n;
}

// The Tiqqun's parashot (cp0.htm: book order and codes; each file's <TITLE>
// names it) with their verse ranges from ct005's cu files, which label every
// verse "ch,v".
function parashot() {
  const cpDir = path.join(unpacked('cp002'), 'cp');
  const codesCp = fs.readdirSync(cpDir).map(f => f.match(/^cp(0[1-5]\d\d)\.htm$/)).filter(Boolean).map(m => m[1]).sort();
  const list = [];
  for (const code of codesCp) {
    const cp = new TextDecoder('utf-8').decode(fs.readFileSync(path.join(cpDir, `cp${code}.htm`)));
    const title = cp.match(/<TITLE>([^<]*)<\/TITLE>/i)[1];
    const he = title.replace(/^.*פרשת\s+/, '').trim();
    const cu = readFile(ct, `cu${code}.htm`);
    const labels = [...cu.matchAll(/<B>([א-ת]+),([א-ת]+)<\/B>/g)].map(m => ({ c: F.hebNumeral(m[1]), v: F.hebNumeral(m[2]) }));
    const book = code.slice(0, 2);
    const from = labels[0], to = labels[labels.length - 1];
    if (labels.length !== versesIn(book, from, to)) throw new Error(`cu${code}: ${labels.length} labels for ${fmt(from)}–${fmt(to)}`);
    // The Tiqqun has no verse numbers; the last word of each verse is the one
    // that turns brown under the mouse. Count those against the range.
    const ends = (cp.match(/this\.style\.color='brown'; this\.innerHTML/g) || []).length;
    list.push({ id: code, he, book, from, to, ends, verses: labels.length });
  }
  // They must tile the Torah: each book from 1:1 to its last verse, no gaps.
  for (const code of ['01', '02', '03', '04', '05']) {
    const ps = list.filter(p => p.book === code);
    let at = { c: 1, v: 1 };
    for (const p of ps) {
      if (cmp(p.from, at) !== 0) throw new Error(`parashah ${p.he} starts at ${fmt(p.from)}, expected ${fmt(at)}`);
      at = nextVerse(code, p.to);
    }
    if (at) throw new Error(`book ${code}: parashot end before the book does`);
  }
  for (const p of list) {
    if (p.ends !== p.verses) note(`Tiqqun \`cp${p.id}.htm\` (${p.he}): ${p.ends} verse ends marked for ${p.verses} verses — the ranges come from ct005's \`cu${p.id}.htm\`.`);
  }
  return list;
}

// Hebrew book names as the reading table writes them, beyond the headings'.
const NAME_ALIASES = { 'יהושוע': '06', 'ישעיהו': '10', 'ירמיהו': '11', 'יחזקאל': '12', 'תהלים': '26' };

function bookByHebrew(name) {
  if (NAME_ALIASES[name]) return NAME_ALIASES[name];
  const b = books.find(x => x.he === name);
  return b ? b.id : null;
}

// Known typos in the reading table (ct005 c/ct/cqrywt.htm), each checked to
// still be there. Keyed by the row's name.
const READING_FIXES = [
  { row: 'שבועות', from: 'שמות יט,א-כ,כג', to: 'שמות יט,א-כ,כב', why: 'Exodus 20 has 22 verses in this numbering' },
  { row: "שבועות יום ב' בגלות", from: 'במדבר כ,כו-לא', to: 'במדבר כח,כו-לא', why: 'the maftir is Numbers 28:26–31, as on the first day' },
  { row: 'שבת שובה', from: 'הושע יד,ב,י', to: 'הושע יד,ב-י', why: '"ב,י" for "ב-י"' },
];

// "ישעיהו מב,ה-מג,י ; מג,יא" → [{ book, from, to }]. A reference without a
// book name continues the previous one's book.
function parseRefs(text, where) {
  const out_ = [];
  let book = null;
  for (const part of text.split(/\s*;\s*|\s*,\s+/).map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(?:(.+?)\s+)?([א-ת]+),([א-ת]+)(?:-(?:([א-ת]+),)?([א-ת]+))?$/);
    if (!m) throw new Error(`${where}: cannot read reference "${part}"`);
    if (m[1]) {
      book = bookByHebrew(m[1]);
      if (!book) throw new Error(`${where}: unknown book "${m[1]}"`);
    }
    if (!book) throw new Error(`${where}: reference "${part}" has no book`);
    const from = { c: F.hebNumeral(m[2]), v: F.hebNumeral(m[3]) };
    const to = { c: m[4] ? F.hebNumeral(m[4]) : from.c, v: m[5] ? F.hebNumeral(m[5]) : from.v };
    for (const p of [from, to]) {
      if (!exists(book, p.c, p.v)) throw new Error(`${where}: "${part}" — ${book} ${fmt(p)} does not exist`);
    }
    if (cmp(from, to) > 0) throw new Error(`${where}: "${part}" runs backwards`);
    out_.push({ book, from: fmt(from), to: fmt(to) });
  }
  return out_;
}

// The reading table's rows: [{ name, torah: [[ref]], haftarah: { ash, sef } }]
// in document order (the weekly parashot first, then the holidays).
function readingRows() {
  const html = readFile(ct, 'cqrywt.htm');
  const enHtml = readFile(EDITIONS.en, 'readinge.htm');
  const cells = row => [...row.matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/gi)].map(m => m[1]);
  const plain = s => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\xA0/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = [...html.matchAll(/<TR>([\s\S]*?)<\/TR>/gi)].map(m => cells(m[1])).filter(c => c.length === 3);
  const enRows = [...enHtml.matchAll(/<TR>([\s\S]*?)<\/TR>/gi)].map(m => cells(m[1])).filter(c => c.length === 3);
  const data = rows.filter(c => plain(c[0]) !== 'סדר / פרשה');
  const enData = enRows.filter(c => !/^(Sidra|Parashah|Portion|Torah)/i.test(plain(c[0])) && plain(c[1]) !== 'Torah');
  if (data.length !== enData.length) throw new Error(`reading tables: ${data.length} Hebrew rows, ${enData.length} English`);
  const fixesLeft = new Set(READING_FIXES);
  return data.map((c, i) => {
    const name = plain(c[0]);
    const lines = cell => cell.split(/<BR\s*\/?>/i).map(plain).filter(Boolean).map(l => {
      const f = READING_FIXES.find(x => x.row === name && l.includes(x.from));
      if (f) { fixesLeft.delete(f); note(`Reading table, ${name}: "${f.from}" → "${f.to}" (${f.why}).`); return l.replace(f.from, f.to); }
      return l;
    });
    const torah = lines(c[1]).map(l => parseRefs(l, name));
    const haf = { ash: [], sef: null };
    for (const l of lines(c[2])) {
      const m = l.match(/^\((.*)\)$/);
      if (m) haf.sef = m[1].trim() === 'לא כלום' ? [] : parseRefs(m[1], name);
      else haf.ash.push(...parseRefs(l, name));
    }
    if (i === data.length - 1 && fixesLeft.size) {
      throw new Error('reading fixes no longer apply: ' + [...fixesLeft].map(f => f.row).join(', '));
    }
    return { he: name, en: plain(enData[i][0]), torah, haftarah: haf };
  });
}

const ps = parashot();
const rows = readingRows();
const weekly = rows.slice(0, ps.length);
const holidays = rows.slice(ps.length);
const parashahIndex = ps.map((p, i) => {
  const row = weekly[i];
  // The table must agree with the Tiqqun on where each parashah runs.
  const t = row.torah.length === 1 && row.torah[0].length === 1 && row.torah[0][0];
  if (!t || t.book !== p.book || t.from !== fmt(p.from) || t.to !== fmt(p.to)) {
    throw new Error(`parashah ${p.he}: Tiqqun ${p.book} ${fmt(p.from)}–${fmt(p.to)}, reading table ${JSON.stringify(row.torah)}`);
  }
  const haftarah = { ash: row.haftarah.ash };
  if (row.haftarah.sef) haftarah.sef = row.haftarah.sef;
  return { id: p.id, he: p.he, en: row.en, book: p.book, from: fmt(p.from), to: fmt(p.to), haftarah };
});
const readings = holidays.map((r, i) => {
  const o = { id: 'r' + String(i + 1).padStart(2, '0'), he: r.he, en: r.en, torah: r.torah };
  const haftarah = {};
  if (r.haftarah.ash.length) haftarah.ash = r.haftarah.ash;
  if (r.haftarah.sef) haftarah.sef = r.haftarah.sef;
  if (Object.keys(haftarah).length) o.haftarah = haftarah;
  return o;
});

const index = { format: 1, books, parashot: parashahIndex, readings };
// One line per book's verse counts and per reference, not one per number.
out.set('index.json', JSON.stringify(index, null, 1)
  .replace(/\[\s*(\d+(?:,\s*\d+)*)\s*\]/g, (m, nums) => '[' + nums.split(/,\s*/).join(',') + ']')
  .replace(/\{\s*("book": "[^"]*"),\s*("from": "[^"]*"),\s*("to": "[^"]*")\s*\}/g, '{ $1, $2, $3 }') + '\n');
out.set('.gitattributes', '* text=auto eol=lf\n*.zip binary\n');

/* ------------------------------------------------------------------ */

fs.rmSync(opt.out, { recursive: true, force: true });
for (const [p, s] of out) {
  const full = path.join(opt.out, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, s);
}

const total = books.reduce((n, b) => n + b.chapters.reduce((a, c) => a + c, 0), 0);
const chapters = books.reduce((n, b) => n + b.chapters.length, 0);
const doc = [
  `# Import report`,
  ``,
  `Sources: the Mechon Mamre zips in \`${opt.src}\`. Files written: ${out.size}.`,
  ``,
  `- ${books.length} books, ${chapters} chapters, ${total} verses.`,
  `- Every edition lines up with the cantillated Hebrew verse for verse (the Targum for the Torah only).`,
  `- ${parashahIndex.length} parashot, tiling Genesis 1:1 to Deuteronomy 34:12; ${readings.length} holiday and special readings.`,
  ``,
  `## Notes and fixes`,
  ``,
  ...report,
  ``,
  `## Links to an alternative cantillation (dropped)`,
  ``,
  `Mechon Mamre links these verses to the "upper" cantillation of the Ten Commandments, or to Reuben's verse`,
  `read with alternative accents. The links (a "*" before the verse) are left out; the verses keep the usual accents.`,
  ``,
  ...[...new Set(altLinks)].map(w => `- \`${w}\``),
  ``,
];
fs.writeFileSync(path.join(opt.out, 'REPORT.md'), doc.join('\n'));
console.log(`wrote ${out.size} files to ${opt.out}`);
console.log(`${books.length} books, ${chapters} chapters, ${total} verses; ${parashahIndex.length} parashot, ${readings.length} readings`);
