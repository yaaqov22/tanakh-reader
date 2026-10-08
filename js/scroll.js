/* The scroll view's layout: a passage's Hebrew set as a scroll sets it, in
   blocks of text shaped by Mechon Mamre's section marks, rather than one
   row per verse. What the marks mean (their about page, "pisuq"):

     {פ}  open section (petuchah): the text breaks off and what follows
          starts on a new line
     {ס}  closed section (setumah): a gap within the line — or, in a song or
          list written in its own layout, the gap between a line's parts
     {ר}  the end of a line, in those songs and lists
     {ש}  a blank line (and the blank lines at the end of a book)

   A newline inside a verse is a line end too. Lines run across verses (the
   Song of the Sea's second line ends in 15:1 and goes on into 15:2), so the
   layout is built from the passage's text as one stream, not verse by verse.

   The stream is cut into blocks:
     a paragraph   ended by {פ} (or the passage's end): prose, justified, its
                   closed sections gaps within it
     a line        ended by {ר} or a newline: its parts, split at {ס}, are
                   spread across the column — two parts to the edges, three
                   to the edges and the middle — which is how the brick
                   patterns of the songs and the lists come out
     a blank       {ש}

   Each verse's text is one or more pieces (span.vs[data-key]): one, or
   several where a verse is cut by line ends or gaps. The first carries the
   verse's id, for linking to it. Verse numbers stand in a margin of their
   own beside the lines the verses start on (numbers()), measured from where
   the browser put the text; nothing else here measures.

   The Targum and the English are set by the same rules, each by its own
   marks: the Targum has the Hebrew's, and the English has {P} (open), {S}
   (closed) and {N} (a line's end). Side by side, each column is laid out on
   its own, with its own numbers: the columns are not lined up with each
   other, and break where their own marks say. */

(function (TR) {
  'use strict';

  const UI = TR.ui;
  const F = TR.format;

  const MARK = /\{([פסרשPSN])\}|\n/g;
  const KIND = { 'פ': 'pe', 'ס': 'samekh', 'ר': 'line', 'ש': 'blank', 'P': 'pe', 'S': 'samekh', 'N': 'line' };

  /* A verse's text as [{ text } | { mark }], the marks split out. */
  function tokens(text) {
    const out = [];
    let at = 0;
    MARK.lastIndex = 0;
    for (let m; (m = MARK.exec(text));) {
      const t = text.slice(at, m.index).trim();
      if (t) out.push({ text: t });
      out.push({ mark: m[1] ? KIND[m[1]] : 'line' });
      at = m.index + m[0].length;
    }
    const t = text.slice(at).trim();
    if (t) out.push({ text: t });
    return out;
  }

  /* verses: [{ key, text, ... }] in reading order → blocks:
     [{ kind: 'para'|'line', parts: [[{ v, text }]] } | { kind: 'blank' }] */
  function blocks(verses) {
    const out = [];
    let cur = null;
    const part = function () {
      if (!cur) cur = { parts: [[]] };
      return cur.parts[cur.parts.length - 1];
    };
    const close = function (kind) {
      if (cur) {
        const parts = cur.parts.filter(function (p) { return p.length; });
        if (parts.length) out.push({ kind: kind, parts: parts });
      }
      cur = null;
    };
    verses.forEach(function (v) {
      tokens(v.text).forEach(function (t) {
        if (t.text) part().push({ v: v, text: t.text });
        else if (t.mark === 'samekh') { if (part().length) cur.parts.push([]); }
        else if (t.mark === 'line') close('line');
        else if (t.mark === 'pe') close('para');
        else { close('para'); out.push({ kind: 'blank' }); }
      });
    });
    close('para');
    return out;
  }

  /* One part: its pieces, a space between verses. `piece(v, el)` is told of
     each, to mark it (selected, bookmarked, changed on the branch). */
  function partEl(tag, pieces, seen, piece, opts) {
    const el = UI.el(tag);
    pieces.forEach(function (p, i) {
      if (i) el.appendChild(document.createTextNode(' '));
      const s = UI.el('span.vs', { 'data-key': p.v.key, 'data-sec': p.v.sec });
      if (!seen.has(p.v)) {
        seen.add(p.v);
        s.classList.add('first');
        if (p.v.id && opts.ids) s.id = p.v.id;
      }
      TR.md.verse(p.text, s, opts.col === 'en' ? 'en' : 'he');
      piece(p.v, s);
      el.appendChild(s);
    });
    return el;
  }

  /* The passage's verses, laid out: div.sc-text, to go beside a numbers
     margin. opts: { col: 'he' | 'tg' | 'en', ids: whether its pieces carry
     the verses' ids (only one column on a page does) }. */
  const LANG = { he: 'he', tg: 'arc', en: 'en' };
  function build(verses, piece, opts) {
    opts = Object.assign({ col: 'he', ids: true }, opts);
    const seen = new Set();
    const text = UI.el('div.sc-text.' + opts.col, { lang: LANG[opts.col], dir: opts.col === 'en' ? 'ltr' : 'rtl' });
    blocks(verses).forEach(function (b) {
      if (b.kind === 'blank') { text.appendChild(UI.el('div.sc-blank')); return; }
      if (b.kind === 'line') {
        const line = UI.el('div.sc-line' + (b.parts.length > 1 ? '.spread' : ''));
        b.parts.forEach(function (p) { line.appendChild(partEl('span.sc-part', p, seen, piece, opts)); });
        text.appendChild(line);
        return;
      }
      const para = UI.el('p.sc-para');
      b.parts.forEach(function (p, i) {
        if (i) para.appendChild(UI.el('span.sc-gap', { title: 'Closed section (setumah)' }));
        const el = partEl('span', p, seen, piece, opts);
        while (el.firstChild) para.appendChild(el.firstChild);
      });
      text.appendChild(para);
    });
    return text;
  }

  /* The numbers margin: each verse's number level with the line it starts
     on, several on one line side by side. A chapter's first verse shows the
     chapter too ("ג,א"). `label(v)` → the element for one verse. */
  function numbers(text, margin, verses, label) {
    const byKey = new Map();
    verses.forEach(function (v) { byKey.set(v.sec + ' ' + v.key, v); });
    const top0 = margin.getBoundingClientRect().top;
    const out = [];
    let row = null, rowTop = -1e9;
    text.querySelectorAll('.vs.first').forEach(function (s) {
      const r = s.getClientRects()[0];
      if (!r) return;
      const v = byKey.get(s.getAttribute('data-sec') + ' ' + s.getAttribute('data-key'));
      if (!v) return;
      const top = Math.round(r.top - top0);
      if (!row || Math.abs(top - rowTop) > r.height / 2) {
        row = UI.el('div.sc-nrow', { style: 'top:' + top + 'px;height:' + Math.round(r.height) + 'px' });
        rowTop = top;
        out.push(row);
      }
      row.appendChild(label(v));
    });
    UI.fill(margin, out);
  }

  /* "א" for a verse, "ג,א" for a chapter's first; in English "1" and "3:1". */
  function numeral(v, lang) {
    if (lang === 'en') return (v.chapterStart ? v.c + ':' : '') + v.n;
    return (v.chapterStart ? F.numToHeb(v.c) + ',' : '') + F.numToHeb(v.n);
  }

  TR.scroll = { tokens: tokens, blocks: blocks, build: build, numbers: numbers, numeral: numeral };

})(window.TR);
