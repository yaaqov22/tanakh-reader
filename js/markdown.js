/* Inline rendering: Markdown for the commentary and notes (bold, italic,
   links, backslash escapes), and the verse marks of the texts (verse()).
   Adapted from cheshbon's markdown.js, keeping its one rule:

   IT BUILDS NODES, NEVER HTML STRINGS. Nothing here touches innerHTML, so the
   text of a file can never become markup. A `<` in a note is a `<`, and the
   texts' <big>, <small> and <sup> are read as marks, not as HTML.

   Only inline rendering is needed. The block structure — titles, chapters,
   verses, paragraphs — is already known from format.js, so each paragraph
   arrives here on its own. A single newline inside a paragraph is a line
   break (the lines of a poem, the Song of the Sea). */

(function (TR) {
  'use strict';

  /* One alternation, scanned left to right. Order matters where one marker is
     a prefix of another: *** before ** before *. */
  const INLINE = new RegExp([
    '\\\\([\\\\`*_{}\\[\\]()#+\\-.!~>|])', // 1     \x        escaped character
    '\\*\\*\\*([^\\s*][\\s\\S]*?)\\*\\*\\*', // 2   ***bold italic***
    '\\*\\*([\\s\\S]+?)\\*\\*',         // 3     **bold**
    '\\*([^\\s*][\\s\\S]*?)\\*',        // 4     *italic*
    '\\[([^\\]]*)\\]\\(([^)\\s]+)\\)'   // 5,6   [text](url)
  ].join('|'));

  /* The marks inside a verse of the texts (format.js): Mechon Mamre's
     section marks, large, small and suspended letters, the read form (qere)
     in parentheses, and the wide gap between a poem's half-verses. */
  const VERSE = new RegExp([
    '\\{([\u05E4\u05E1\u05E8\u05E9PSN])\\}', // 1  {פ} {ס} {ר} {ש}, en {P} {S} {N}
    '<(big|small|sup)>([^<]*)</\\2>',     // 2,3  <big>בְּ</big>
    '\\(([^()]*)\\)',                       // 4  (qere)
    ' {4}'                                  //    the gap between half-verses
  ].join('|'));

  const MARKS = {
    'פ': ['pe', 'פ', 'Open section (petuchah)'],
    'ס': ['samekh', 'ס', 'Closed section (setumah)'],
    'ר': ['line', '', ''],
    'ש': ['song', '', ''],
    'P': ['en-p', '', ''],
    'S': ['en-s', '', ''],
    'N': ['line', '', '']
  };

  function span(cls, text, title, parent) {
    const s = document.createElement('span');
    s.className = cls;
    if (text) s.textContent = text;
    if (title) s.title = title;
    parent.appendChild(s);
    return s;
  }

  /* One verse's text into `parent`. Hebrew only: (…) is the read form.
     In a song laid out as in the scroll (its lines end {ר}), a {ס} is the
     space between its bricks, not a section. */
  function verse(text, parent, lang) {
    let rest = String(text || '');
    const song = rest.indexOf('{ר}') >= 0;
    for (;;) {
      const m = VERSE.exec(rest);
      if (!m) break;
      if (m.index > 0) breaks(rest.slice(0, m.index), parent);
      if (m[1] !== undefined) {
        const k = MARKS[m[1]];
        if (song && m[1] === 'ס') span('gap', null, null, parent);
        else span('mark ' + k[0], k[1], k[2], parent);
      } else if (m[2] !== undefined) {
        span('ltr-' + m[2], m[3], m[2] === 'big' ? 'Large letter' : m[2] === 'small' ? 'Small letter' : 'Suspended letter', parent);
      } else if (m[4] !== undefined) {
        if (lang === 'he') {
          const q = span('qere', null, m[4].trim() ? 'Read (qere)' : 'Written but not read', parent);
          q.textContent = '(' + m[4] + ')';
        } else breaks(m[0], parent);
      } else {
        span('gap', null, null, parent);
      }
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) breaks(rest, parent);
  }

  const SCHEMES = ['http:', 'https:', 'mailto:'];

  function safeHref(raw) {
    try {
      const u = new URL(raw, location.href);
      return SCHEMES.indexOf(u.protocol) >= 0 ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  function breaks(text, parent) {
    text.split('\n').forEach(function (part, i) {
      if (i > 0) parent.appendChild(document.createElement('br'));
      if (part) parent.appendChild(document.createTextNode(part));
    });
  }

  function wrap(tag, text, parent) {
    const el = document.createElement(tag);
    inline(text, el);
    parent.appendChild(el);
  }

  function inline(text, parent) {
    let rest = String(text === null || text === undefined ? '' : text);
    for (;;) {
      const m = INLINE.exec(rest);
      if (!m || m[0].length === 0) break;
      if (m.index > 0) breaks(rest.slice(0, m.index), parent);

      if (m[1] !== undefined) parent.appendChild(document.createTextNode(m[1]));
      else if (m[2] !== undefined) {
        const b = document.createElement('strong');
        wrap('em', m[2], b);
        parent.appendChild(b);
      }
      else if (m[3] !== undefined) wrap('strong', m[3], parent);
      else if (m[4] !== undefined) wrap('em', m[4], parent);
      else if (m[6] !== undefined) {
        const href = safeHref(m[6]);
        if (!href) breaks(m[0], parent);
        else {
          const a = document.createElement('a');
          a.href = href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          inline(m[5] || href, a);
          parent.appendChild(a);
        }
      }
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) breaks(rest, parent);
  }

  TR.md = {
    inline: inline,
    verse: verse,

    /* One paragraph as an element (a <p> unless told otherwise). */
    para: function (text, spec) {
      const el = TR.ui.el(spec || 'p');
      inline(text, el);
      return el;
    }
  };

})(window.TR);
