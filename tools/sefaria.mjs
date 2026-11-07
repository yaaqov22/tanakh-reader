// What the tools that read Sefaria share: downloading, Sefaria's book names,
// its verse numbering moved to Mechon Mamre's, and the clean-up of its HTML.
import https from 'node:https';

export const SEFARIA = 'https://www.sefaria.org';

/* Sefaria's name for a book, where it isn't Mechon Mamre's English. */
export const SEFARIA_BOOK = {
  '08a': 'I Samuel', '08b': 'II Samuel', '09a': 'I Kings', '09b': 'II Kings',
  '25a': 'I Chronicles', '25b': 'II Chronicles',
};

/* Sefaria numbers the verses as most Bibles do; Mechon Mamre differs in six
   places (checked against both texts, verse by verse). Each maps Sefaria's
   verse to Mechon Mamre's [chapter, verse], or null where it has no such verse.
     Exodus 20, Deuteronomy 5  "I am the Lord" and "You shall have no other
                               gods" are one verse here
     Numbers 25–26             Sefaria's 25:19 ("after the plague") begins 26:1 here
     Joshua 21                 verses 36–37 (Reuben's cities) aren't here
     1 Samuel 23–24            Sefaria's 24:1 is 23:29 here
     Jeremiah 30–31            Sefaria's 31:1 is 30:25 here
   Two of Sefaria's verses can become one of Mechon Mamre's; they come in
   reading order. */
const SHIFT = {
  '02': { 20: v => [20, v >= 3 ? v - 1 : v] },
  '04': { 25: v => (v === 19 ? [26, 1] : [25, v]) },
  '05': { 5: v => [5, v >= 7 ? v - 1 : v] },
  '06': { 21: v => (v === 36 || v === 37 ? null : [21, v >= 38 ? v - 2 : v]) },
  '08a': { 24: v => (v === 1 ? [23, 29] : [24, v - 1]) },
  '11': { 31: v => (v === 1 ? [30, 25] : [31, v - 1]) },
};
export const toMM = (book, c, v) => (SHIFT[book] && SHIFT[book][c] ? SHIFT[book][c](v) : [c, v]);

export function get(url, agent = 'tanakh-reader tools') {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': agent } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, agent));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url}: ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

/* A file name for a Sefaria title or version. */
export const safe = s => s.replace(/[\\/:*?"<>|]/g, '_');

export const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/* Sefaria's footnotes, left out: the marker, <sup class="footnote-marker">,
   and the note itself, <i class="footnote">, which may hold <i>s of its own. */
export function dropFootnotes(s) {
  /* The markers, with a class or without (Strickman's "<sup>1</sup>", the
     Piotrków edition's "<sup>54)</sup>", JPS's end of a footnoted span
     "<sup class="endFootnote">-a</sup>"). */
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
export function balanced(s) {
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
