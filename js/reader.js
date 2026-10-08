/* The reader, in one of three layouts (the header's first buttons):

   INTERLINEAR: one row per verse, the Hebrew, the Targum and the English
   side by side, with the commentary and review notes on it beneath.

   SIDE BY SIDE: the Hebrew and one other text (the English, or the Targum
   on the Torah, as the Display menu chooses), each set as a scroll sets it
   by its own section marks (scroll.js), in columns of their own, each with
   its own verse numbers. They are lined up only at the full breaks (the
   end of a paragraph, a song's line, a blank line) that both have after the
   same verse, and run free in between. Selecting a verse lights it in
   both, and if it has commentary or review notes (or in edit mode) they rise
   in a sheet from the bottom, to read and edit as in the interlinear rows.

   SCROLL: the Hebrew alone, set as a scroll sets it, in blocks shaped by its
   section marks (scroll.js). The verse numbers stand in a margin of their
   own, beside the lines the verses start on, with a dot for each kind of
   note a verse has. Selecting a verse (its number, or its text) opens it in
   a panel beside the scroll: its translation and Targum, as the Display menu
   chooses, and its commentary and review notes, to read and edit as in the
   interlinear rows. On a narrow screen the panel rises from the bottom.

   Two routes draw it:

   #/read/01/3       Genesis, chapter 3
   #/read/01/3/5     …scrolled to verse 5 and highlighted
   #/read/01/3/5/q   …and with the search q highlighted in it (a trailing /w
                     means whole words), which is where search results lead

   #/portion/0101           a parashah (Bereshit), as the Tiqqun divides them
   #/portion/0101/ash       …its haftarah, as Ashkenazim read it
   #/portion/0101/sef       …as Sephardim read it
   #/portion/r05            a holiday's or special Shabbat's reading (its
                            Torah readings; /ash and /sef its haftarah)

   A portion runs across chapters (and a holiday's, across books): each
   passage is headed with where it is, each chapter it enters with its
   heading, and its verses are the same rows as the chapter view's.

   ALIGNMENT IS STRUCTURAL. Every row's text shares one column template, so a
   long Hebrew verse and its shorter translation start on the same line
   whatever their lengths. Nothing is measured. Rows pair the layers by key
   ("chapter:verse"); every edition has the same verses (the import checks
   it).

   THE HEBREW shows in one of four ways (lib.view): the letters alone, with
   vowels, with vowels and Mechon Mamre's punctuation, or with cantillation.
   The Targum follows it: unpointed when the Hebrew is. Which columns show is
   a device setting, chosen in the header's Display menu. A notes layer that
   is hidden still says, beside each verse, how many notes it has there;
   clicking that opens them for the one verse. Under 900px the columns stack.

   SECTIONS. Interlinear, the section marks ({פ} {ס} {ר} {ש}, and the
   English's {P} {S} {N}) show as they stand in the text, and nothing is laid
   out by them: rows are rows. Laying the text out by them is the scroll's.

   REVIEWING. Reading a branch other than its base, what the branch changed
   is marked in blue, note by note, with its diff (review.js).

   EDITING. Only the commentary and the review notes are edited here; the
   texts are Mechon Mamre's and stay as they are. The pencil turns on edit
   mode, in which clicking a note opens it in place (editor.js), and each
   verse offers to add one. Selecting a phrase in the text offers the same in
   any mode, with the phrase quoted. Edits are drafts on this device
   (drafts.js); what they changed is marked where it stands, in green, with
   its diff and an undo.

   BOOKMARKS. Each verse has a ribbon in its right margin, shown on hover and
   kept once set (bookmarks.js); the selection toolbar offers it too.

   IN A LIVE SESSION (session.js) the others' edits arrive while this is
   open, and each repaints it. A row with an editor open in it is kept as it
   stands across that (holdRow). If the very note being edited is what
   changed, an editor nothing has been typed in simply closes on the new
   text, and one with typing in it says so: its text is an edit of what it
   opened on (library.js editFrom), so finishing asks which to keep.
   Whatever arrived is highlighted for a few seconds (flash). */

(function (TR) {
  'use strict';

  const UI = TR.ui;
  const F = TR.format;
  const E = TR.edit;
  const lib = TR.lib;
  let seq = 0;
  let nav = null;   // { prev, next } hrefs for the keyboard
  let live = null;  // { grid, page }: what is on screen, for the selection toolbar

  const LAYER_NAME = { he: 'Hebrew', tp: 'punctuated Hebrew', onq: 'Targum', onqk: 'Targum', en: 'English',
    co: 'commentary', notes: 'review notes' };
  const ANN = ['co', 'notes'];
  const ANN_TITLE = { co: 'Commentary', notes: 'Review notes' };
  const TEXT = ['he', 'tg', 'en'];      // the text columns, in order
  const COL_LANG = { he: 'he', tg: 'he', en: 'en' };

  /* How the Hebrew can show, as the header's buttons offer it. */
  const HE_MODE = {
    plain: { glyph: 'א', title: 'Hebrew letters only' },
    pointed: { glyph: 'אָ', title: 'Hebrew with vowels' },
    punct: { glyph: 'אָ;', title: 'Hebrew with vowels and punctuation (Mechon Mamre)' },
    teamim: { glyph: 'אָ֑', title: 'Hebrew with cantillation' }
  };

  function heMode() {
    const m = TR.device.get('heMode');
    return HE_MODE[m] ? m : 'teamim';
  }

  /* --------------------------------------------------------------- cells */

  function paras(blocks, lang) {
    return (blocks || []).map(function (b) { return TR.md.para(b, lang === 'he' ? 'p.he' : 'p'); });
  }

  function cell(col, children, extraClass) {
    const lang = COL_LANG[col] || 'en';
    const attrs = { 'data-col': col };
    if (lang === 'he') { attrs.lang = col === 'tg' ? 'arc' : 'he'; attrs.dir = 'rtl'; }
    return UI.el('div.cell.' + col + (lang === 'he' && col !== 'he' ? '.rtl' : '') +
      (extraClass ? '.' + extraClass : ''), attrs, children);
  }

  /* A body from the editor, as the note fields it will become. */
  function split(body) {
    const p = E.paragraphs(body);
    return { text: p[0] || '', rest: p.slice(1) };
  }

  /* A verse's label and text, drawn: "א" or "3" before the verse. */
  function verseContent(col, u, href) {
    const lang = COL_LANG[col];
    const p = UI.el(lang === 'he' ? 'p.he' : 'p');
    p.appendChild(UI.el('a.label', { href: href, text: lang === 'he' ? F.numToHeb(u.law.n) : String(u.law.n) }));
    p.appendChild(document.createTextNode(' '));
    TR.md.verse(u.law.text, p, lang);
    return [p].concat(u.law.extra.map(function (b) {
      const x = UI.el(lang === 'he' ? 'p.he' : 'p');
      TR.md.verse(b, x, lang);
      return x;
    }));
  }

  /* A change of `layer` in a { layer: [change] } list (the drafts' or the
     branch's). */
  function findChange(changes, layer, kind, id) {
    return (changes[layer] || []).find(function (c) {
      return c.kind === kind && (kind === 'law' ? c.key === id : c.label === id);
    }) || null;
  }

  /* The file a text column is showing, for marking what a branch changed. */
  function colLayer(ctx, col) {
    if (col === 'he') return ctx.sec.heMode === 'punct' && ctx.sec.tp ? 'tp' : 'he';
    if (col === 'tg') return ctx.sec.heMode === 'plain' && ctx.sec.onqk ? 'onqk' : 'onq';
    return col;
  }

  /* One column of a verse: `u` from F.units, or null where it lacks one. */
  function unitCell(ctx, col, u, key, href) {
    if (!u) return cell(col, UI.el('p.missing', { text: col === 'en' ? 'No translation.' : '' }), 'empty');
    const layer = colLayer(ctx, col);
    const upstream = findChange(ctx.branch, layer, 'law', key);
    const c = cell(col, verseContent(col, u, href));
    if (upstream) { c.classList.add('branched'); c.appendChild(branchBar(ctx, upstream, c)); }
    return c;
  }

  function noteRange(n) {
    return n.c + ':' + n.h + (n.h2 != null ? '–' + n.h2 : '');
  }

  function noteContent(n) {
    return [
      TR.md.para(n.text, 'p'),
      paras(n.more),
      n.h2 != null ? UI.el('p.note-range', { text: 'on ' + noteRange(n) }) : null
    ];
  }

  const kindOf = function (layer) { return layer === 'notes' ? 'review' : 'co'; };

  function noteEl(ctx, n, layer) {
    const change = findChange(ctx.changes, layer, 'note', n.label);
    const upstream = findChange(ctx.branch, layer, 'note', n.label);
    const el = UI.el('div.note.' + kindOf(layer) + (change ? '.changed' : '') + (upstream ? '.branched' : ''), noteContent(n));
    if (upstream) el.appendChild(branchBar(ctx, upstream, el));
    if (change) el.appendChild(changeBar(ctx, layer, change, el));
    flash(el, ctx.id, layer, 'note', n.label);
    if (ctx.editing) {
      el.classList.add('editable');
      el._edit = function () {
        lib.section(ctx.id).then(function (sec) {
          const hit = sec[layer] && E.findNote(sec[layer], n.label);
          if (!hit) return;
          const from = sec.raw[layer];
          openEditor(el, {
            body: E.noteBody(hit.note), label: 'Edit ' + LAYER_NAME[layer] + ' note ' + n.label,
            hint: '[^' + n.label + '] · empty it to delete',
            at: { id: ctx.id, layer: layer, kind: 'note', unit: n.label, began: E.noteBody(hit.note),
              was: onBranch(sec, layer, 'note', n.label) },
            save: function (b) { return lib.edit(ctx.id, layer, function (doc) { return E.setNote(doc, layer, n.label, b); }, from); },
            render: function (b) {
              const s = split(b);
              return noteContent(Object.assign({}, n, { text: s.text, more: s.rest }));
            }
          });
        });
      };
    }
    return el;
  }

  /* A note deleted in the draft, still shown (struck out) so it can be put back. */
  function deletedNote(ctx, change, layer) {
    const el = UI.el('div.note.deleted.' + kindOf(layer), [TR.md.para(change.before.split('\n\n')[0], 'p')]);
    el.appendChild(changeBar(ctx, layer, change, el));
    return el;
  }

  /* A note the branch deleted, struck out where it stood. */
  function branchDeletedNote(ctx, change, layer) {
    const el = UI.el('div.note.deleted.branched.' + kindOf(layer), [TR.md.para(change.before.split('\n\n')[0], 'p')]);
    el.appendChild(branchBar(ctx, change, el));
    return el;
  }

  /* The commentary or review notes on verse `key`, as a block under the
     text: a heading, then the notes in columns. `box._count` is how many
     there are (for the row's marker), `box._changed` whether any is changed. */
  function notesCell(ctx, layer, key) {
    const out = lib.notesFor(ctx.sec[layer], key).map(function (n) { return noteEl(ctx, n, layer); });
    const count = out.length;
    const gone = function (ch) { return ch.kind === 'note' && ch.after === null && ch.key === key; };
    (ctx.branch[layer] || []).filter(gone).forEach(function (ch) { out.push(branchDeletedNote(ctx, ch, layer)); });
    (ctx.changes[layer] || []).filter(gone).forEach(function (ch) { out.push(deletedNote(ctx, ch, layer)); });
    const list = UI.el('div.notelist', out);
    const box = cell(layer, [UI.el('div.annhead', { text: ANN_TITLE[layer] }), list],
      out.length || ctx.editing ? null : 'none');
    box._count = count;
    box._changed = out.some(function (el) { return el.classList.contains('changed') || el.classList.contains('branched'); });
    if (ctx.editing) {
      box.appendChild(UI.el('div.addnote', [UI.el('button.linkbtn', {
        type: 'button', text: layer === 'notes' ? '+ review note' : '+ commentary',
        onclick: function () { newNote(ctx, box, layer, key, ''); }
      })]));
    }
    return box;
  }

  /* In a verse's right margin: how many notes each hidden layer has on it.
     It opens them for this verse alone. applyCols() shows the parts for the
     layers that are hidden, and hides the marker when that leaves nothing. */
  function marker(row, boxes, editing) {
    const part = function (layer, icon) {
      const n = boxes[layer]._count;
      return UI.el('span.mk-' + layer + (boxes[layer]._changed ? '.changed' : ''), { 'data-n': n },
        [icon(), UI.el('span', { text: n ? String(n) : '+' })]);
    };
    const m = UI.el('button.annmark', {
      type: 'button', 'aria-expanded': 'false',
      onclick: function () {
        const open = row.classList.toggle('open');
        m.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    }, [part('co', TR.icons.comment), part('notes', TR.icons.note)]);
    m._counts = { co: boxes.co._count, notes: boxes.notes._count };
    m._editing = editing;
    return m;
  }

  function setMarker(m, cols) {
    const label = [];
    let any = false;
    ANN.forEach(function (layer) {
      const part = m.querySelector('.mk-' + layer);
      const show = !cols[layer] && (m._counts[layer] > 0 || m._editing);
      part.hidden = !show;
      if (show) {
        any = true;
        const n = m._counts[layer];
        label.push(n ? n + ' ' + (layer === 'co' ? (n === 1 ? 'comment' : 'comments') : (n === 1 ? 'review note' : 'review notes'))
          : 'add ' + (layer === 'co' ? 'commentary' : 'a review note'));
      }
    });
    m.hidden = !any;
    m.title = label.join(', ');
    m.setAttribute('aria-label', m.title);
  }

  /* ------------------------------------------------------------- editing */

  function openEditor(host, opts) {
    host.classList.add('editing');
    return TR.editor.open(host, Object.assign({ onClose: function () { UI.refresh(); } }, opts));
  }

  /* A note's body as the branch has it, this device's draft aside; null if
     it has none. `sec` is the section from lib.section(). */
  function onBranch(sec, layer, kind, unit) {
    const text = sec.raw[layer];
    const doc = !sec.drafts[layer] ? sec[layer] : text === null ? null : F.parse(text, layer);
    if (!doc) return null;
    if (kind === 'law') {
      const u = E.findUnit(doc, unit);
      return u ? E.unitBody(u) : null;
    }
    const n = E.findNote(doc, unit);
    return n ? E.noteBody(n.note) : null;
  }

  /* Highlight what has just arrived from someone else in a live session,
     fading from wherever in its few seconds it has got to. */
  function flash(el, sec, layer, kind, unit) {
    const age = TR.session.fresh(sec, layer, kind, unit);
    if (age < 0) return;
    el.classList.add('fresh');
    el.style.animationDelay = -age + 'ms';
  }

  /* A repaint while an editor is open — in a live session, someone else's
     edit arriving — would take the editor with it. The row it is in is
     lifted out first and put back in place of its new self: what is being
     typed, the caret and the focus all stay. Everything around it is new.
     → what putBack() needs, or null when no editor is open on this page. */
  function holdRow(host, page) {
    if (!TR.editor.active() || !live || live.page !== page || !host.contains(live.grid)) return null;
    const ed = live.grid.querySelector('.editor');
    const row = ed && ed.closest('.row.law');
    if (!row || !row.id) return null;
    const a = document.activeElement;
    const focus = a && row.contains(a) ? a : null;
    return {
      row: row, focus: focus,
      sel: focus && typeof focus.selectionStart === 'number' ? [focus.selectionStart, focus.selectionEnd] : null
    };
  }

  function putBack(grid, held) {
    const now = Array.from(grid.querySelectorAll('.row.law')).find(function (r) { return r.id === held.row.id; });
    /* Has the very thing being edited changed on the branch meanwhile? (Not
       by this device: its own text coming back is no news.) */
    const at = TR.editor.at();
    const raw = now && now._ctx.raw;
    const theirs = raw && at && at.kind ? onBranch(raw, at.layer, at.kind, at.unit) : null;
    const changed = !!(raw && at && at.kind) && theirs !== at.was && theirs !== at.began;
    /* Another page now, or the verse has gone: the editor goes too, its
       text saved. So does one opened on text that has since been replaced
       with nothing typed in it yet — the new text is what there is to edit. */
    if (!now || (changed && !at.dirty)) { TR.editor.close(); return; }
    held.row._ctx = now._ctx;
    now.parentNode.replaceChild(held.row, now);
    if (held.focus) {
      held.focus.focus({ preventScroll: true });
      if (held.sel) held.focus.setSelectionRange(held.sel[0], held.sel[1]);
    }
    if (!changed) { TR.editor.warn(null); return; }
    const body = theirs === null ? null : at.was === null ? UI.el('div.diff', [UI.el('ins', { text: theirs })])
      : TR.editor.diff(at.was, theirs);
    TR.editor.warn([
      UI.el('strong', { text: 'Someone else changed this while you were editing it.' }),
      theirs === null ? ' It has been deleted.' : ' It now reads:', body,
      UI.el('span', { text: 'When you finish, you are asked which to keep.' })
    ]);
  }

  function today() {
    const d = new Date();
    const two = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
  }

  /* What a new note starts with: the quoted phrase, and for a review note
     who wrote it and when. */
  function notePrefix(layer, phrase) {
    const q = phrase ? '***' + phrase + '*** - ' : '';
    if (layer !== 'notes') return q;
    return '**' + (TR.device.get('name') || 'reviewer') + '** ' + today() + ' - ' + q;
  }

  /* A new note on verse `key`, typed into its notes block. It is added to
     the draft at the first save that has more than the prefix in it; emptied
     again (or back to the bare prefix), it is removed. */
  function newNote(ctx, box, layer, key, phrase) {
    const prefix = notePrefix(layer, phrase);
    const wrap = UI.el('div.note.new.' + kindOf(layer));
    box.classList.remove('none');
    box.querySelector('.notelist').appendChild(wrap);
    const on = F.unitName(key);
    let label = null;
    openEditor(wrap, {
      body: prefix, label: 'New ' + LAYER_NAME[layer] + ' note on ' + on,
      hint: 'New ' + (layer === 'notes' ? 'review note' : 'commentary') + ' on ' + on,
      at: { id: ctx.id, layer: layer },
      save: function (b) {
        const empty = !E.paragraphs(b).length || b.trim() === prefix.trim();
        if (!label) {
          if (empty) return Promise.resolve();
          return lib.edit(ctx.id, layer, function (doc, sec) {
            const r = E.addNote(doc, layer, key, b, sec.en);
            label = r.label;
            return r;
          });
        }
        return lib.edit(ctx.id, layer, function (doc) { return E.setNote(doc, layer, label, empty ? '' : b); })
          .then(function (r) { if (empty) label = null; return r; });
      },
      render: function (b) {
        const s = split(b);
        return label ? noteContent({ text: s.text, more: s.rest }) : null;
      }
    });
  }

  /* "Edited · diff · undo" under a changed note. */
  function changeBar(ctx, layer, change, host) {
    const what = change.before === null ? 'Added' : change.after === null ? 'Deleted' : 'Edited';
    const bits = [UI.el('span.chg-what', { text: what + (ctx.raw.stale[layer] ? ' (the file has changed on the branch since)' : '') })];
    if (change.before !== null && change.after !== null) {
      bits.push(UI.el('button.linkbtn', {
        type: 'button', text: 'diff', title: 'Show what changed',
        onclick: function () {
          /* One diff open at a time: this one, or the branch's (branchBar). */
          const open = !host.classList.contains('showdiff') || !host.querySelector('.diff:not(.up)');
          host.querySelectorAll('.diff').forEach(function (d) { d.remove(); });
          host.classList.toggle('showdiff', open);
          if (open) host.appendChild(TR.editor.diff(change.before, change.after));
        }
      }));
    }
    bits.push(UI.el('button.linkbtn', {
      type: 'button', text: 'undo', title: 'Put back the ' + LAYER_NAME[layer] + ' as it was',
      onclick: function () {
        TR.editor.close().then(function () { return lib.revert(ctx.id, layer, change); })
          .then(function () { UI.refresh(); }, function (e) { UI.toast(e.message); });
      }
    }));
    return UI.el('div.chg', bits);
  }

  /* "Changed on this branch · diff" under a verse or note the branch
     changed compared with its base. Nothing to undo here: it is the
     branch's text. */
  function branchBar(ctx, change, host) {
    const what = change.before === null ? 'Added' : change.after === null ? 'Deleted' : 'Changed';
    const bits = [UI.el('span.chg-what', { text: what + ' on this branch', title: 'Compared with ' + ctx.base })];
    if (change.before !== null && change.after !== null) {
      bits.push(UI.el('button.linkbtn', {
        type: 'button', text: 'diff', title: 'Show what changed since ' + ctx.base,
        onclick: function () {
          const open = !host.classList.contains('showdiff') || !host.querySelector('.diff.up');
          host.querySelectorAll('.diff').forEach(function (d) { d.remove(); });
          host.classList.toggle('showdiff', open);
          if (open) {
            const d = TR.editor.diff(change.before, change.after);
            d.classList.add('up');
            host.appendChild(d);
          }
        }
      }));
    }
    return UI.el('div.chg.up', bits);
  }

  /* ----------------------------------------------------- selection toolbar */

  /* Select a phrase in a verse and this floats above it: add a commentary
     or review note quoting it, or bookmark the verse. */
  let picked = null;   // { ctx, key, phrase, row }: row is null in the scroll's text
  const seltools = UI.el('div.seltools', { role: 'toolbar', 'aria-label': 'Note on the selection' }, [
    selBtn('co', 'Comment'), selBtn('notes', 'Review note'), UI.el('button', {
      type: 'button', text: 'Bookmark',
      onmousedown: function (e) { e.preventDefault(); },
      onclick: function () {
        if (!picked) return;
        const ctx = picked.ctx, key = picked.key;
        hideSel();
        TR.bookmarks.add(ctx.id, key, ctx.title);
        UI.toast('Bookmarked ' + ctx.title + ' ' + key + '.');
      }
    })
  ]);
  seltools.hidden = true;
  document.body.appendChild(seltools);

  function selBtn(layer, text) {
    return UI.el('button', {
      type: 'button', text: text,
      onmousedown: function (e) { e.preventDefault(); },   // keep the selection
      onclick: function () {
        if (!picked) return;
        const p = picked;
        hideSel();
        const s = window.getSelection();
        if (s) s.removeAllRanges();
        /* The note goes under the verse, so open its notes if they're
           hidden; in the scroll, it goes in the verse's panel. */
        if (p.row) {
          p.row.classList.add('open');
          newNote(p.ctx, p.row.querySelector('.cell.' + layer), layer, p.key, p.phrase);
          return;
        }
        choose(live.scroll.byKey.get(p.ctx.id + ' ' + p.key), false, true).then(function () {
          const panel = live && live.scroll && live.scroll.panel;
          if (panel && panel.classList.contains('row')) newNote(p.ctx, panel.querySelector('.cell.' + layer), layer, p.key, p.phrase);
        });
      }
    });
  }

  function hideSel() { seltools.hidden = true; picked = null; }

  /* The selection's text as read, without the labels or marks. */
  function phraseOf(range) {
    const box = document.createElement('div');
    box.appendChild(range.cloneContents());
    box.querySelectorAll('.label, .mark, .chg, .diff').forEach(function (n) { n.remove(); });
    let t = box.textContent.replace(/[*\s]+/g, ' ').trim();
    if (t.length > 120) t = t.slice(0, 117).replace(/\s+\S*$/, '') + '…';
    return t;
  }

  function onReader() {
    const id = UI.current().id;
    return id === 'read' || id === 'portion';
  }

  function checkSel() {
    const s = window.getSelection();
    if (!live || !onReader() || !s || s.isCollapsed || !s.rangeCount) return hideSel();
    const range = s.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType !== 1) node = node.parentNode;
    const c = node && node.closest('.cell.he, .cell.tg, .cell.en, .sc-text');
    if (!c || c.closest('.editor') || !live.grid.contains(c)) return hideSel();
    let row = null, ctx, key;
    if (c.classList.contains('sc-text')) {
      /* In the scroll, the verse the selection starts in. */
      let start = range.startContainer;
      if (start.nodeType !== 1) start = start.parentNode;
      const vs = start.closest('.vs') || start.querySelector('.vs');
      if (!vs || !vs._ctx) return hideSel();
      ctx = vs._ctx;
      key = vs.getAttribute('data-key');
    } else {
      row = c.closest('.row.law');
      if (!row || !row._ctx) return hideSel();
      ctx = row._ctx;
      key = row.getAttribute('data-key');
    }
    const phrase = phraseOf(range);
    if (!phrase) return hideSel();
    picked = { row: row, ctx: ctx, key: key, phrase: phrase };
    const r = range.getBoundingClientRect();
    seltools.hidden = false;
    seltools.style.top = Math.max(0, r.top + window.scrollY - seltools.offsetHeight - 8) + 'px';
    seltools.style.left = Math.max(8, Math.min(window.scrollX + r.left + r.width / 2 - seltools.offsetWidth / 2,
      document.documentElement.clientWidth - seltools.offsetWidth - 8)) + 'px';
  }

  document.addEventListener('selectionchange', TR.debounce(checkSel, 200));
  TR.bus.on('route', function (r) { if (r.id !== 'read' && r.id !== 'portion') hideSel(); });

  /* Commentary that isn't anchored to a verse: the book's own introduction,
     and any unnumbered chapters of general remarks. */
  function coGeneral(doc) {
    if (!doc) return [];
    const out = paras(doc.front).concat(paras(doc.intro));
    doc.chapters.forEach(function (ch) {
      if (ch.n == null && !ch.implicit && ch.intro.length) {
        out.push(UI.el('h3.co-head', { text: ch.heading }));
        out.push.apply(out, paras(ch.intro));
      }
    });
    return out;
  }

  /* Commentary on a whole chapter: what stands under its heading before the
     first note. */
  function coChapter(doc, n) {
    if (!doc) return [];
    const ch = doc.chapters.find(function (c) { return c.n === n; });
    return ch ? paras(ch.intro) : [];
  }

  /* ---------------------------------------------------------------- head */

  /* The header's controls are few: the layout (interlinear or scroll), the
     Display menu, and editing (with marking a branch's changes, when reading
     one). Everything about how the text looks — the Hebrew's four ways, and
     which columns show — is in the Display menu, whose button shows the
     Hebrew's way at a glance. */

  const LAYOUT = {
    lines: { icon: 'lines', title: 'Interlinear: verse by verse, the texts side by side' },
    parallel: { icon: 'parallel', title: 'Side by side: the Hebrew and one text, each set by its sections, in columns' },
    scroll: { icon: 'scroll', title: 'Scroll: the Hebrew set as in a scroll, by its sections' }
  };

  function layout() {
    const l = TR.device.get('layout');
    return LAYOUT[l] ? l : 'lines';
  }

  /* The text beside the Hebrew, side by side: the Targum where there is one
     and it is chosen, else the English. */
  function beside(ctx) {
    return TR.device.get('beside') === 'tg' && (!ctx || ctx.sec.tg) ? 'tg' : 'en';
  }

  function layoutToggle() {
    return UI.el('div.segs', { role: 'group', 'aria-label': 'Layout' }, Object.keys(LAYOUT).map(function (m) {
      return UI.el('button.seg', {
        type: 'button', 'aria-pressed': m === layout() ? 'true' : 'false',
        title: LAYOUT[m].title, 'aria-label': LAYOUT[m].title,
        onclick: function () {
          if (m === layout()) return;
          TR.editor.close().then(function () {
            TR.device.set({ layout: m });
            UI.refresh();
          });
        }
      }, [TR.icons[LAYOUT[m].icon]()]);
    }));
  }

  /* The Display menu stays open across the repaints its own choices cause. */
  let displayOpen = false;

  function setDisplay(open) {
    displayOpen = open;
    const wrap = document.querySelector('.screen.on .dispwrap');
    if (!wrap) return;
    wrap.querySelector('.dispmenu').hidden = !open;
    wrap.querySelector('.dispbtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  document.addEventListener('click', function (e) {
    if (!displayOpen || !document.contains(e.target)) return;   // a choice that has repainted the menu
    const wrap = document.querySelector('.screen.on .dispwrap');
    if (!wrap || !wrap.contains(e.target)) setDisplay(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !displayOpen) return;
    e.preventDefault();   // this Escape is the menu's, not the verse panel's
    setDisplay(false);
    const b = document.querySelector('.screen.on .dispbtn');
    if (b) b.focus();
  });

  function displayMenu(grid, page) {
    const lay = layout();
    const scroll = lay === 'scroll';
    const mode = heMode();
    const btn = UI.el('button.seg.dispbtn', {
      type: 'button', 'aria-haspopup': 'true', 'aria-expanded': displayOpen ? 'true' : 'false',
      title: 'Display: ' + HE_MODE[mode].title.toLowerCase() + '; the columns', 'aria-label': 'Display',
      onclick: function () { setDisplay(!displayOpen); }
    }, [UI.el('span.he', { lang: 'he', text: HE_MODE[mode].glyph }), TR.icons.chevron()]);

    const modes = Object.keys(HE_MODE).map(function (m) {
      return UI.el('button.seg.glyph.he', {
        type: 'button', lang: 'he', text: HE_MODE[m].glyph, 'data-mode': m,
        'aria-pressed': m === mode ? 'true' : 'false', title: HE_MODE[m].title, 'aria-label': HE_MODE[m].title,
        onclick: function () {
          if (m === heMode()) return;
          TR.editor.close().then(function () {
            TR.device.set({ heMode: m });
            UI.refresh();
          });
        }
      });
    });

    const cols = TR.device.get('cols');
    const col = function (key, label) {
      const b = UI.el('button.dm-item', {
        type: 'button', 'aria-pressed': cols[key] ? 'true' : 'false',
        onclick: function () {
          const next = TR.device.get('cols');
          next[key] = !next[key];
          /* Interlinear, some text always shows. */
          if (!scroll && !TEXT.some(function (k) { return next[k] && (k !== 'tg' || page.targum); })) return;
          TR.device.set({ cols: next });
          b.setAttribute('aria-pressed', next[key] ? 'true' : 'false');
          applyCols(grid);
        }
      }, [UI.el('span.dm-check', [TR.icons.check()]), UI.el('span', { text: label })]);
      return b;
    };

    /* Side by side, one text beside the Hebrew: a choice of one. */
    const one = function (key, label) {
      return UI.el('button.dm-item.dm-one', {
        type: 'button', role: 'radio', 'aria-checked': beside() === key ? 'true' : 'false',
        onclick: function () {
          if (beside() === key) return;
          TR.editor.close().then(function () {
            TR.device.set({ beside: key });
            UI.refresh();
          });
        }
      }, [UI.el('span.dm-check', [TR.icons.check()]), UI.el('span', { text: label })]);
    };

    const head = [
      UI.el('div.dm-head', { text: 'Hebrew' }),
      UI.el('div.segs.hemodes', { role: 'group', 'aria-label': 'Hebrew' }, modes),
      UI.el('p.dm-sub', { text: HE_MODE[mode].title })
    ];
    if (lay === 'parallel') {
      const menu = UI.el('div.dispmenu', { role: 'group', 'aria-label': 'Display' }, head.concat([
        UI.el('div.dm-head', { text: 'Beside the Hebrew' }),
        page.targum ? UI.el('div', { role: 'radiogroup', 'aria-label': 'Beside the Hebrew' },
          [one('en', 'English (JPS 1917)'), one('tg', 'Targum Onqelos')]) : null,
        UI.el('p.dm-sub', { text: page.targum
          ? 'Where there is no Targum (beyond the Torah), the English. Select a verse to see its commentary and review notes.'
          : 'English (JPS 1917): the Targum is on the Torah alone. Select a verse to see its commentary and review notes.' })
      ]));
      menu.hidden = !displayOpen;
      return UI.el('div.dispwrap', [UI.el('div.segs', [btn]), menu]);
    }

    const menu = UI.el('div.dispmenu', { role: 'group', 'aria-label': 'Display' }, head.concat([
      UI.el('div.dm-head', { text: scroll ? 'Beside the scroll' : 'Columns' }),
      scroll ? null : col('he', 'Hebrew'),
      page.targum ? col('tg', 'Targum Onqelos') : null,
      col('en', 'English (JPS 1917)'),
      scroll ? null : col('co', 'Commentary'),
      scroll ? null : col('notes', 'Review notes'),
      UI.el('p.dm-sub', { text: scroll
        ? 'In the panel for the verse you select, with its commentary and review notes.'
        : 'A hidden notes layer still shows its count beside each verse.' })
    ]));
    menu.hidden = !displayOpen;
    return UI.el('div.dispwrap', [UI.el('div.segs', [btn]), menu]);
  }

  function editToggle() {
    const on = !!TR.device.get('editing');
    return UI.el('button.seg.editseg', {
      type: 'button', 'aria-pressed': on ? 'true' : 'false', 'aria-label': 'Edit',
      title: on ? 'Stop editing' : 'Edit: add commentary and review notes, click a note to change it',
      onclick: function () {
        TR.editor.close().then(function () {
          TR.device.set({ editing: !TR.device.get('editing') });
          UI.refresh();
        });
      }
    }, [TR.icons.pencil()]);
  }

  /* Marking what the branch changed compared with its base, on or off. Only
     there when reading a branch other than the base. */
  function marksToggle() {
    if (!TR.review.active()) return null;
    const on = !!TR.device.get('marks');
    const base = TR.device.get('baseBranch');
    return UI.el('button.seg.markseg', {
      type: 'button', 'aria-pressed': on ? 'true' : 'false', 'aria-label': 'Compare with ' + base,
      title: on ? 'Stop marking what this branch changed' : 'Mark what this branch changed compared with ' + base,
      onclick: function () {
        TR.editor.close().then(function () {
          TR.device.set({ marks: !on });
          UI.refresh();
        });
      }
    }, [TR.icons.branch()]);
  }

  /* The columns showing, as classes on the grid: the texts share the rows'
     column template; commentary and notes show beneath, or only as the
     markers' counts. */
  function applyCols(grid) {
    const cols = TR.device.get('cols');
    const targum = grid.classList.contains('has-tg');
    let text = TEXT.filter(function (k) { return cols[k] && (k !== 'tg' || targum); });
    if (!text.length) text = ['he'];
    const show = text.concat(ANN.filter(function (k) { return cols[k]; }));
    ['cols-1', 'cols-2', 'cols-3'].concat(TEXT.concat(ANN).map(function (k) { return 'show-' + k; }))
      .forEach(function (c) { grid.classList.remove(c); });
    grid.classList.add('cols-' + text.length);
    show.forEach(function (k) { grid.classList.add('show-' + k); });
    grid.style.setProperty('--cols', text.map(function (k) {
      return k === 'en' && text.length > 1 ? 'minmax(0, 1.15fr)' : 'minmax(0, 1fr)';
    }).join(' '));
    grid.querySelectorAll('.annmark').forEach(function (m) { setMarker(m, cols); });
  }

  function pagerLinks(prev, next, middle, labels) {
    const link = function (href, icon, label) {
      return href
        ? UI.el('a.iconbtn.pg', { href: href, 'aria-label': label, title: label }, [icon()])
        : UI.el('span.iconbtn.pg.off', { 'aria-hidden': 'true' }, [icon()]);
    };
    return UI.el('div.pager', [link(prev, TR.icons.prev, labels[0]), middle, link(next, TR.icons.next, labels[1])]);
  }

  /* Previous/next chapter, running on into the neighbouring book. */
  function neighbours(ix, meta, i) {
    const order = ix.order;
    const at = order.indexOf(meta);
    const chs = meta.chapters;
    const prevBook = order[at - 1], nextBook = order[at + 1];
    return {
      prev: i > 0 ? UI.href('read', [meta.id, chs[i - 1].key])
        : prevBook ? UI.href('read', [prevBook.id, prevBook.chapters[prevBook.chapters.length - 1].key]) : null,
      next: i < chs.length - 1 ? UI.href('read', [meta.id, chs[i + 1].key])
        : nextBook ? UI.href('read', [nextBook.id, nextBook.chapters[0].key]) : null
    };
  }

  /* marked: keys of chapters with changes on the branch, flagged in the list. */
  function chapterPager(ix, meta, i, withSelect, marked) {
    const n = neighbours(ix, meta, i);
    let select = null;
    if (withSelect && meta.chapters.length > 1) {
      select = UI.select(meta.chapters.map(function (c) {
        return { value: c.key, label: 'Chapter ' + c.n + (marked && marked.has(c.key) ? ' • changed' : '') };
      }), meta.chapters[i].key, function () { UI.go('read', [meta.id, select.value]); });
      select.setAttribute('aria-label', 'Chapter');
      select.classList.add('chsel');
    }
    return pagerLinks(n.prev, n.next, select, ['Previous chapter', 'Next chapter']);
  }

  /* What this page's drafts are, above the text: which files have changes,
     whether the branch has moved on under any, and in edit mode how editing
     works. */
  function draftNote(ctxs, editing) {
    const out = [];
    ctxs.forEach(function (ctx) {
      const layers = Object.keys(ctx.raw.drafts);
      if (!layers.length) return;
      const stale = layers.filter(function (l) { return ctx.raw.stale[l]; });
      out.push(UI.el('p.draftnote', [
        (TR.session.active() ? 'Changes not shared yet to the ' : 'Unsubmitted changes to the ') +
          layers.map(function (l) { return LAYER_NAME[l]; }).join(', ') + ' of ' + ctx.title + '. ',
        stale.length ? 'The ' + stale.map(function (l) { return LAYER_NAME[l]; }).join(', ') +
          ' changed on the branch after you began; your edits are kept as they are. ' : null,
        UI.el('a', { href: '#/changes', text: 'Review all changes' })
      ]));
    });
    if (editing) {
      out.push(UI.el('p.draftnote.hint', [
        'Add commentary or a review note under any verse, or click a note to edit it. Edits are saved on this device as you type' +
          (TR.session.active() ? ', and shared with the session as you finish each. ' : '. '),
        TR.device.get('name') ? null : UI.el('a', { href: '#/settings', text: 'Set your name to sign review notes.' })
      ]));
    }
    return out;
  }

  /* Which branch this is and what it changed here, when marking. */
  function branchNote(ctxs, up) {
    if (!up) return null;
    const all = UI.el('a', { href: '#/branches', text: 'Everything on the branch' });
    const base = TR.device.get('baseBranch');
    if (up.error) return UI.el('p.draftnote.up.bad', ['Could not compare with ' + base + ': ' + up.error + ' ', all]);
    let n = 0;
    ctxs.forEach(function (ctx) {
      Object.keys(ctx.branch).forEach(function (l) { n += ctx.branch[l].length; });
    });
    return UI.el('p.draftnote.up', [
      n ? n + (n === 1 ? ' change' : ' changes') + ' here compared with ' + base + ', marked in blue. '
        : 'This branch changed nothing here compared with ' + base + '. ',
      up.info && up.info.fromCache ? '(As last seen: GitHub could not be reached.) ' : null,
      all
    ]);
  }

  /* -------------------------------------------------------------- rows */

  /* One book on the page, viewed as the header asks. */
  function bookCtx(raw, meta, changes, editing) {
    const sec = lib.view(raw, heMode());
    return {
      id: raw.id, meta: meta, title: meta.en, sec: sec, raw: raw, editing: editing,
      changes: lib.changes(raw), branch: changes || {}, base: TR.device.get('baseBranch')
    };
  }

  /* The verses of chapter `c` from `v1` to `v2` (inclusive), every column's
     paired by key: [{ key, he, tg, en }]. */
  function verseRows(ctx, c, v1, v2) {
    const rows = new Map();
    TEXT.forEach(function (col) {
      const doc = ctx.sec[col];
      if (!doc) return;
      const ch = doc.chapters.find(function (x) { return x.n === c; });
      if (!ch) return;
      ch.laws.forEach(function (law) {
        if (law.n < v1 || law.n > v2) return;
        const key = c + ':' + law.n;
        let r = rows.get(key);
        if (!r) { r = { key: key, n: law.n, he: null, tg: null, en: null }; rows.set(key, r); }
        r[col] = { ch: ch, law: law, key: key };
      });
    });
    return Array.from(rows.values()).sort(function (a, b) { return a.n - b.n; });
  }

  function verseHref(ctx, key) {
    return UI.href('read', [ctx.id].concat(key.split(':')));
  }

  function rowId(ctx, key) {
    return 'v-' + ctx.id + '-' + key.replace(':', '-');
  }

  /* The ribbon in a verse's margin, under its note counts: shows on hover,
     and stays once set. */
  function bookmarkBtn(ctx, key) {
    const b = UI.el('button.bmk', {
      type: 'button',
      onclick: function () { TR.bookmarks.toggle(ctx.id, key, ctx.title); }
    }, [TR.icons.bookmark()]);
    paintBookmark(b, ctx.id, key, ctx.title);
    return b;
  }

  function paintBookmark(b, sec, key, title) {
    const on = TR.bookmarks.has(sec, key);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = (on ? 'Remove the bookmark on ' : 'Bookmark ') + title + ' ' + key;
    b.setAttribute('aria-label', b.title);
    const r = b.closest('.row');
    if (r) r.classList.toggle('marked', on);
  }

  TR.bus.on('bookmarks', function () {
    if (!live) return;
    live.grid.querySelectorAll('.row.law').forEach(function (r) {
      const b = r.querySelector('.bmk');
      if (b && r._ctx) paintBookmark(b, r._ctx.id, r.getAttribute('data-key'), r._ctx.title);
    });
    live.grid.querySelectorAll('.vs, .sc-n').forEach(function (el) {
      el.classList.toggle('marked', TR.bookmarks.has(el.getAttribute('data-sec'), el.getAttribute('data-key')));
    });
  });

  function verseRow(ctx, r) {
    const href = verseHref(ctx, r.key);
    const boxes = { co: notesCell(ctx, 'co', r.key), notes: notesCell(ctx, 'notes', r.key) };
    const el = row('law', [], rowId(ctx, r.key));
    el._ctx = ctx;
    el.setAttribute('data-key', r.key);
    el.setAttribute('data-sec', ctx.id);
    el.classList.toggle('marked', TR.bookmarks.has(ctx.id, r.key));
    const cells = TEXT.filter(function (col) { return col !== 'tg' || ctx.sec.tg; }).map(function (col) {
      return unitCell(ctx, col, r[col], r.key, href);
    });
    UI.append(el, [
      UI.el('div.text', cells),
      UI.el('div.rmargin', [marker(el, boxes, ctx.editing), bookmarkBtn(ctx, r.key)]),
      UI.el('div.ann', [boxes.co, boxes.notes])
    ]);
    return el;
  }

  /* Commentary that belongs to no verse, as a row of its own under a marker. */
  function generalRow(blocks, title) {
    if (!blocks.length) return null;
    const el = row('general');
    const box = cell('co', [UI.el('div.annhead', { text: title || 'Commentary: general remarks' })].concat(blocks));
    box._count = 1;
    const m = marker(el, { co: box, notes: { _count: 0 } }, false);
    m.querySelector('.mk-co span').textContent = 'General remarks';
    UI.append(el, [m, UI.el('div.ann', [box])]);
    return el;
  }

  /* A chapter's heading, in each text column that shows. */
  function chapterHead(ctx, c) {
    const he = ctx.sec.he && ctx.sec.he.chapters.find(function (x) { return x.n === c; });
    const en = ctx.sec.en && ctx.sec.en.chapters.find(function (x) { return x.n === c; });
    const cells = [cell('he', he ? UI.el('h3', { text: F.headingText(he, 'he') }) : null)];
    if (ctx.sec.tg) cells.push(cell('tg', UI.el('h3', { text: he ? F.headingText(he, 'he') : '' })));
    cells.push(cell('en', en ? UI.el('h3', [UI.el('a', { href: UI.href('read', [ctx.id, String(c)]), text: F.headingText(en, 'en') })]) : null));
    return row('chhead', [UI.el('div.text', cells)]);
  }

  /* A passage of a portion: "Isaiah 42:5–43:10", across the columns. */
  function passageHead(text, sub) {
    return row('passage', [UI.el('h2.passage-title', [text, sub ? UI.el('span.passage-sub', { text: sub }) : null])]);
  }

  /* The rows of `ctx` from chapter:verse `from` to `to`, a chapter heading
     wherever a chapter begins or the passage starts, and a chapter's own
     commentary where the whole of it is shown from its start. */
  function passageRows(ctx, from, to, grid) {
    for (let c = from.c; c <= to.c; c++) {
      const v1 = c === from.c ? from.v : 1;
      const v2 = c === to.c ? to.v : Infinity;
      grid.appendChild(chapterHead(ctx, c));
      if (v1 === 1) UI.append(grid, generalRow(coChapter(ctx.sec.co, c)));
      verseRows(ctx, c, v1, v2).forEach(function (r) { grid.appendChild(verseRow(ctx, r)); });
    }
  }

  /* -------------------------------------------------------------- scroll */

  /* The verse open in the scroll's panel, kept across repaints of the same
     page: { page, sec, key }, or null. */
  let chosen = null;

  /* A passage's verses in text column `col`, for scroll.js, in order:
     [{ key, sec, id, ctx, col, c, n, chapterStart, text }] */
  function scrollVerses(ctx, from, to, col) {
    const out = [];
    const doc = ctx.sec[col || 'he'];
    if (!doc) return out;
    doc.chapters.forEach(function (ch) {
      if (ch.n == null || ch.n < from.c || ch.n > to.c) return;
      ch.laws.forEach(function (law, i) {
        if ((ch.n === from.c && law.n < from.v) || (ch.n === to.c && law.n > to.v)) return;
        const key = ch.n + ':' + law.n;
        out.push({
          key: key, sec: ctx.id, id: rowId(ctx, key), ctx: ctx, col: col || 'he', c: ch.n, n: law.n, chapterStart: i === 0 || !out.length,
          text: [law.text].concat(law.extra).join('\n')
        });
      });
    });
    return out;
  }

  /* How many notes of `layer` each verse has: key → count, once per paint. */
  function noteCounts(ctx, layer) {
    if (!ctx.counts) ctx.counts = {};
    if (!ctx.counts[layer]) {
      const m = new Map();
      const doc = ctx.sec[layer];
      if (doc) doc.chapters.forEach(function (ch) {
        ch.notes.forEach(function (n) { const k = F.noteKey(n); m.set(k, (m.get(k) || 0) + 1); });
      });
      ctx.counts[layer] = m;
    }
    return ctx.counts[layer];
  }

  /* Has `layer` a change on verse `key` in this list (the drafts' or the
     branch's)? */
  function touched(changes, layer, key) {
    return (changes[layer] || []).some(function (c) { return c.kind === 'note' && c.key === key; });
  }

  const pick = function (v) { return '[data-sec="' + v.sec + '"][data-key="' + v.key + '"]'; };
  const same = function (a, b) { return !!a && !!b && a.sec === b.sec && a.key === b.key; };

  /* A piece of a verse's text, as scroll.js makes it. */
  function scrollPiece(v, el) {
    el._ctx = v.ctx;
    if (findChange(v.ctx.branch, colLayer(v.ctx, v.col), 'law', v.key)) el.classList.add('branched');
    if (TR.bookmarks.has(v.sec, v.key)) el.classList.add('marked');
    if (same(v, chosen)) el.classList.add('sel');
  }

  /* Has verse `v` commentary or review notes, or a change to them (the
     drafts' or the branch's)? */
  function annotated(v) {
    return ANN.some(function (layer) {
      return noteCounts(v.ctx, layer).get(v.key) || touched(v.ctx.changes, layer, v.key) || touched(v.ctx.branch, layer, v.key);
    });
  }

  /* A verse's number in the margin, with a dot for each kind of note on it
     (green when this device has changed them, blue when the branch has).
     `lang` is the margin's: 'en' numbers in figures. */
  function verseNumber(v, lang) {
    const ctx = v.ctx;
    const bits = [UI.el('span', { text: TR.scroll.numeral(v, lang) })];
    const said = [];
    ANN.forEach(function (layer) {
      const n = noteCounts(ctx, layer).get(v.key) || 0;
      const mine = touched(ctx.changes, layer, v.key), up = touched(ctx.branch, layer, v.key);
      if (n || mine || up) bits.push(UI.el('i.sc-dot.' + layer + (mine ? '.changed' : up ? '.branched' : '')));
      if (n) said.push(n + ' ' + (layer === 'co' ? (n === 1 ? 'comment' : 'comments') : (n === 1 ? 'review note' : 'review notes')));
    });
    const name = ctx.title + ' ' + v.key + (said.length ? ' · ' + said.join(', ') : '');
    /* Side by side, the English's numbers are its own verses; choosing one
       chooses the verse, which is the Hebrew's. */
    const b = UI.el('button.sc-n' + (v.chapterStart ? '.ch' : '') + (lang === 'en' ? '.en' : ''), {
      type: 'button', 'data-sec': v.sec, 'data-key': v.key, title: name, 'aria-label': name,
      onclick: function () {
        const h = live.scroll.byKey.get(v.sec + ' ' + v.key) || v;
        choose(same(h, chosen) ? null : h, true);
      }
    }, bits);
    if (TR.bookmarks.has(v.sec, v.key)) b.classList.add('marked');
    if (same(v, chosen)) b.classList.add('sel');
    return b;
  }

  function placeNumbers() {
    if (!live || !live.scroll || !document.body.contains(live.grid)) return;
    live.scroll.boxes.forEach(function (b) {
      TR.scroll.numbers(b.text, b.margin, b.verses, function (v) { return verseNumber(v, b.col === 'en' ? 'en' : 'he'); });
    });
  }

  /* The panel beside the scroll: the chosen verse's translation and Targum
     (as the Display menu has them), commentary and review notes. It is a
     verse row like the interlinear ones, so editing in it, and keeping an
     editor open across a repaint (holdRow), work the same. */
  /* Side by side, the panel is a sheet rising from the bottom, and only for
     a verse with notes on it, or in edit mode, or when a note is being
     added to it from the selection (chosen.force); it holds those notes
     alone, the texts being on the page. */
  function versePanel() {
    const s = live.scroll;
    const v = chosen && s.byKey.get(chosen.sec + ' ' + chosen.key);
    const sheet = s.parallel;
    if (!v || (sheet && !v.ctx.editing && !chosen.force && !annotated(v))) {
      return UI.el('aside.vpanel.empty', sheet ? [] : [
        UI.el('p.vp-hint', { text: 'Select a verse, by its number in the margin or its text, to see its translation and its commentary here.' }),
        s.general()
      ]);
    }
    const ctx = v.ctx, key = v.key;
    const r = sheet ? {} : verseRows(ctx, v.c, v.n, v.n)[0] || {};
    const boxes = { co: notesCell(ctx, 'co', key), notes: notesCell(ctx, 'notes', key) };
    const at = s.order.indexOf(v);
    /* The sheet steps to the next verse it would open for. */
    const next = function (d) {
      for (let i = at + d; i >= 0 && i < s.order.length; i += d) {
        if (!sheet || ctx.editing || annotated(s.order[i])) return s.order[i];
      }
      return null;
    };
    const step = function (d, icon, label) {
      const to = next(d);
      return UI.el('button.iconbtn.vp-step', {
        type: 'button', disabled: !to, title: label, 'aria-label': label,
        onclick: function () { if (to) choose(to, true); }
      }, [icon()]);
    };
    const el = UI.el('aside.row.law.open.vpanel', { 'data-key': key, 'data-sec': ctx.id }, [
      UI.el('div.vp-head', [
        UI.el('a.vp-ref', { href: verseHref(ctx, key), title: 'This verse in its chapter' }, [
          UI.el('strong', { text: ctx.title + ' ' + key }),
          ctx.meta.he ? UI.el('span.vp-he', { lang: 'he', dir: 'rtl', text: ctx.meta.he + ' ' + F.numToHeb(v.c) + ',' + F.numToHeb(v.n) }) : null
        ]),
        UI.el('div.vp-tools', [
          sheet && !ctx.editing
            ? [step(-1, TR.icons.up, 'Previous verse with notes'), step(1, TR.icons.down, 'Next verse with notes')]
            : [step(-1, TR.icons.up, 'Previous verse (k)'), step(1, TR.icons.down, 'Next verse (j)')],
          bookmarkBtn(ctx, key),
          UI.el('button.iconbtn.vp-close', {
            type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', onclick: function () { choose(null); }
          }, [TR.icons.close()])
        ])
      ]),
      sheet ? null : UI.el('div.text', TEXT.filter(function (col) { return col !== 'he' && (col !== 'tg' || ctx.sec.tg); })
        .map(function (col) { return unitCell(ctx, col, r[col], key, verseHref(ctx, key)); })),
      UI.el('div.ann', [boxes.co, boxes.notes]),
      boxes.co._count || boxes.notes._count || ctx.editing ? null
        : UI.el('p.vp-none', { text: 'No commentary or review notes on this verse yet.' })
    ]);
    el.id = 'vp-' + rowId(ctx, key);
    el._ctx = ctx;
    return el;
  }

  /* Open verse `v` (or nothing) in the panel. `reveal` scrolls the text to
     it if it is out of sight; `force` opens the sheet, side by side, on a
     verse with no notes yet (one is about to be added). */
  function choose(v, reveal, force) {
    if (!live || !live.scroll) return Promise.resolve();
    return TR.editor.close().then(function () {
      if (live && live.scroll) show(v, reveal, force);
    });
  }

  /* The same, at once: for painting the page, which must leave an open
     editor be (holdRow). */
  function show(v, reveal, force) {
    chosen = v ? { page: live.page, sec: v.sec, key: v.key, force: !!force } : null;
    live.grid.querySelectorAll('.vs.sel, .sc-n.sel').forEach(function (el) { el.classList.remove('sel'); });
    if (chosen) live.grid.querySelectorAll('.vs' + pick(chosen) + ', .sc-n' + pick(chosen)).forEach(function (el) { el.classList.add('sel'); });
    const next = versePanel();
    live.scroll.panel.replaceWith(next);
    live.scroll.panel = next;
    const open = !!chosen && !next.classList.contains('empty');
    live.grid.classList.toggle('chosen', open);
    if (reveal && v) {
      /* Into view if it is under the headers, or under the panel where that
         rises from the bottom. */
      const first = document.getElementById(v.id);
      const r = first && first.getBoundingClientRect();
      const bottom = open && getComputedStyle(next).position === 'fixed' ? next.getBoundingClientRect().top : window.innerHeight;
      if (r && (r.top < fixedTop() || r.bottom > bottom)) first.scrollIntoView({ block: 'center' });
    }
  }

  function fixedTop() {
    const head = document.querySelector('.screen.on .rhead');
    return document.querySelector('.topbar').offsetHeight + (head ? head.offsetHeight : 0);
  }

  /* One text column set as a scroll, beside its numbers margin (at the
     right of a Hebrew or Aramaic one, where its lines begin, and at the left
     of the English). → { el, box }, the box for placeNumbers(). */
  function scrollColumn(verses, col, ids) {
    const text = TR.scroll.build(verses, scrollPiece, { col: col, ids: ids });
    const margin = UI.el('div.sc-nums');
    return {
      el: UI.el('div.scroll.' + col, col === 'en' ? [margin, text] : [text, margin]),
      box: { text: text, margin: margin, verses: verses, col: col }
    };
  }

  /* The page's passages, set as a scroll: → { main, s }, `s` being what
     live.scroll keeps. Commentary that belongs to no verse (a book's
     introduction, a chapter's remarks) shows in the panel while no verse is
     chosen; side by side, where there is no panel until one is, it stands
     above the passage, as the interlinear's does, opened by its marker.

     Side by side, each passage is two scrolls: the Hebrew, at the right,
     and the text beside it, in rows that end wherever both break fully
     after the same verse (scroll.js sync()). The verses chosen and looked
     up (s.order, s.byKey) are the Hebrew's; the other column's pieces name
     the same verses, so choosing or hovering one is choosing or hovering
     both. */
  function scrollBody(page, parallel) {
    const s = { order: [], byKey: new Map(), boxes: [], panel: null, parallel: parallel };
    const general = [];
    const main = UI.el('div.sc-main');
    page.passages.forEach(function (p) {
      if (p.title) main.appendChild(passageHead(p.title, p.sub));
      if (p.opening) general.push(['Commentary on ' + p.ctx.title, function () { return coGeneral(p.ctx.sec.co); }]);
      for (let c = p.from.c; c <= p.to.c; c++) {
        if (c === p.from.c && p.from.v > 1) continue;
        general.push(['Commentary on ' + p.ctx.title + ' ' + c, function () { return coChapter(p.ctx.sec.co, c); }]);
      }
      if (parallel) {
        general.splice(0).forEach(function (g) { UI.append(main, generalRow(g[1](), g[0])); });
      }
      const verses = scrollVerses(p.ctx, p.from, p.to, 'he');
      verses.forEach(function (v) { s.order.push(v); s.byKey.set(v.sec + ' ' + v.key, v); });
      if (!parallel) {
        const he = scrollColumn(verses, 'he', true);
        s.boxes.push(he.box);
        main.appendChild(he.el);
        return;
      }
      /* A row for each stretch between the sections both texts share, so
         the columns start level again at each. */
      const col = beside(p.ctx);
      main.appendChild(UI.el('div.par', TR.scroll.sync(verses, scrollVerses(p.ctx, p.from, p.to, col)).map(function (r) {
        const he = scrollColumn(r[0], 'he', true), other = scrollColumn(r[1], col, false);
        s.boxes.push(he.box, other.box);
        return UI.el('div.par-row', [he.el, other.el]);
      })));
    });
    s.general = function () {
      return general.map(function (g) {
        const blocks = g[1]();
        return blocks.length ? cell('co', [UI.el('div.annhead', { text: g[0] })].concat(blocks)) : null;
      });
    };
    return { main: main, s: s };
  }

  /* Hovering a verse lights all its pieces and its number together. */
  function hoverVerses(grid) {
    let on = null;
    const set = function (t) {
      const k = t ? { sec: t.getAttribute('data-sec'), key: t.getAttribute('data-key') } : null;
      if (same(k, on) || (!k && !on)) return;
      grid.querySelectorAll('.hover').forEach(function (el) { el.classList.remove('hover'); });
      on = k;
      if (k) grid.querySelectorAll('.vs' + pick(k) + ', .sc-n' + pick(k)).forEach(function (el) { el.classList.add('hover'); });
    };
    grid.addEventListener('mouseover', function (e) { set(e.target.closest('.vs, .sc-n')); });
    grid.addEventListener('mouseleave', function () { set(null); });
  }

  /* -------------------------------------------------------------- render */

  /* page: { key, crumbs, docTitle, head (pager element), foot, targum,
             passages: [{ ctx, from, to, title?, sub?, opening? }], target } */
  function render(host, page, up) {
    const editing = !!TR.device.get('editing');
    /* `scroll`: the text is set by its sections (the scroll, or side by
       side), with a panel for the chosen verse. */
    const parallel = layout() === 'parallel';
    const scroll = parallel || layout() === 'scroll';
    const grid = UI.el('div.grid' + (editing ? '.editing' : '') + (page.targum ? '.has-tg' : '') + '.mode-' + heMode() +
      (parallel ? '.parmode' : scroll ? '.scrollmode' : ''));
    const held = holdRow(host, page.key);
    const ctxs = [];
    page.passages.forEach(function (p) { if (ctxs.indexOf(p.ctx) < 0) ctxs.push(p.ctx); });
    if (live && live.ro) live.ro.disconnect();

    const head = UI.el('header.rhead', [
      UI.el('div.rbar', [page.head, UI.el('div.toggles', [
        layoutToggle(), displayMenu(grid, page), UI.el('div.segs', [editToggle(), marksToggle()])
      ])])
    ]);
    const notes = UI.el('div.rnotes', [TR.session.active() ? TR.session.line() : null, branchNote(ctxs, up), draftNote(ctxs, editing)]);
    if (page.tabs) notes.insertBefore(page.tabs, notes.firstChild);

    let sc = null;
    if (scroll) {
      sc = scrollBody(page, parallel);
      /* The panel keeps its verse across repaints of the page; a verse
         linked to opens in it. */
      const target = page.target && sc.s.order.find(function (v) { return v.id === page.target.id; });
      if (target) chosen = { page: page.key, sec: target.sec, key: target.key };
      else if (!chosen || chosen.page !== page.key || !sc.s.byKey.has(chosen.sec + ' ' + chosen.key)) chosen = null;
      sc.s.panel = UI.el('aside.vpanel');
      UI.append(grid, [sc.main, sc.s.panel]);
      hoverVerses(grid);
    } else {
      page.passages.forEach(function (p) {
        if (p.title) grid.appendChild(passageHead(p.title, p.sub));
        if (p.opening) UI.append(grid, generalRow(coGeneral(p.ctx.sec.co), 'Commentary on ' + p.ctx.title));
        passageRows(p.ctx, p.from, p.to, grid);
      });
    }
    applyCols(grid);

    grid.addEventListener('click', function (e) {
      const s = window.getSelection();
      if (s && !s.isCollapsed) return;   // selecting, not clicking
      if (e.target.closest('a, button, .editor')) return;
      const vs = scroll && e.target.closest('.vs');
      if (vs) {
        const v = live.scroll.byKey.get(vs.getAttribute('data-sec') + ' ' + vs.getAttribute('data-key'));
        choose(same(v, chosen) ? null : v, true);
        return;
      }
      if (!editing) return;
      const t = e.target.closest('.note.editable');
      if (t && t._edit) t._edit();
    });

    nav = page.nav;
    live = { grid: grid, page: page.key, scroll: sc && sc.s, ro: null };
    if (scroll) show(chosen && sc.s.byKey.get(chosen.sec + ' ' + chosen.key), false);
    hideSel();
    UI.crumbs(page.crumbs);
    UI.fill(host, [head, notes, grid, UI.el('footer.rfoot', [page.foot])]);
    if (held) {
      putBack(grid, held);
      if (scroll) live.scroll.panel = grid.querySelector('.vpanel');
    }
    fitHead(head);
    document.title = page.docTitle + ' — Tanakh Reader';

    /* The numbers margin follows the text wherever it reflows: a resize, the
       fonts arriving, the panel opening. */
    if (scroll) {
      placeNumbers();
      if (window.ResizeObserver) {
        live.ro = new ResizeObserver(function () { requestAnimationFrame(placeNumbers); });
        sc.s.boxes.forEach(function (b) { live.ro.observe(b.text); });
      }
      if (document.fonts) document.fonts.ready.then(placeNumbers);
    }

    /* A new chapter or portion starts at its top; a repaint of the same one
       (a column toggled, a note saved) stays where it was. */
    const where = page.docTitle;
    if (host.getAttribute('data-at') !== where && !page.target) window.scrollTo(0, 0);
    host.setAttribute('data-at', where);

    if (page.target) {
      const target = document.getElementById(page.target.id);
      if (target) {
        const all = scroll ? Array.from(grid.querySelectorAll('.vs' + pick(chosen))) : [target];
        all.forEach(function (el) {
          el.classList.add('target');
          if (page.target.q && TR.search) TR.search.highlight(el, page.target.q, page.target.whole);
        });
        target.scrollIntoView({ block: 'center' });
      }
    }
  }

  /* The header sticks under the top bar; rows scrolled to must clear both. */
  function fitHead(head) {
    document.documentElement.style.setProperty('--rhead-h', head.offsetHeight + 'px');
  }
  window.addEventListener('resize', TR.debounce(function () {
    const head = document.querySelector('.screen.on .rhead');
    if (head) fitHead(head);
  }, 150));

  /* The verse at the top of the screen, for the Bookmarks menu's "Bookmark
     here": the first row not scrolled up under the headers. */
  TR.reader = {
    here: function () {
      if (!onReader() || !live || !document.body.contains(live.grid)) return null;
      const top = fixedTop();
      const rows = Array.from(live.grid.querySelectorAll(live.scroll ? '.vs.first[id]' : '.row.law'));
      const r = rows.find(function (el) { return el.getBoundingClientRect().bottom > top + 24; }) || rows[0];
      return r ? { sec: r._ctx.id, key: r.getAttribute('data-key'), title: r._ctx.title } : null;
    },
    HE_MODE: HE_MODE
  };

  function row(cls, cells, id) {
    const r = UI.el('div.row' + (cls ? '.' + cls : ''), cells);
    if (id) r.id = id;
    return r;
  }

  /* What the branch changed in each of these books, when reading one and
     marking it: → null (not marking), { changes: id → { layer: [change] } },
     or { error } (said once, above the text, which shows all the same). */
  function branchChanges(raws) {
    if (!TR.review.active() || !TR.device.get('marks')) return Promise.resolve(null);
    return Promise.all([TR.review.info()].concat(raws.map(function (r) { return TR.review.section(r); })))
      .then(function (x) {
        const changes = {};
        raws.forEach(function (r, i) { changes[r.id] = x[i + 1]; });
        return { info: x[0], changes: changes };
      }, function (e) {
        return { error: e.message, changes: {} };
      });
  }

  function failed(host, mine, e) {
    if (mine !== seq) return;
    host.removeAttribute('data-page');
    UI.fill(host, UI.message(e.message, UI.el('a.btn', { href: '#/settings', text: 'Settings' }), 'error'));
  }

  /* Only show "Loading" when switching page; moving between chapters of a
     book already loaded repaints in place. */
  function loading(host, key) {
    if (host.getAttribute('data-page') !== key) {
      UI.fill(host, UI.message('Loading…', null, 'loading'));
      host.setAttribute('data-page', key);
    }
  }

  /* ------------------------------------------------------------- chapters */

  UI.route('read', {
    refresh: function (host, args) {
      const mine = ++seq;
      const id = args[0];
      if (!id || !F.SECTION_RE.test(id)) { UI.go('books'); return; }
      loading(host, 'book:' + id);
      return Promise.all([lib.index(), lib.section(id)]).then(function (r) {
        if (mine !== seq) return;
        const ix = r[0], raw = r[1];
        const meta = ix.byId.get(id);
        if (!meta) { UI.fill(host, UI.message('There is no book ' + id + '.', UI.el('a.btn', { href: '#/books', text: 'Books' }))); return; }
        return branchChanges([raw]).then(function (up) {
          if (mine !== seq) return;
          let i = meta.chapters.findIndex(function (c) { return c.key === args[1]; });
          if (i < 0) i = 0;
          const c = meta.chapters[i].n;
          const ctx = bookCtx(raw, meta, up && up.changes[id], !!TR.device.get('editing'));
          const marked = TR.review.chapters(ctx.branch);
          const v = args[2] ? +args[2] : null;
          render(host, {
            key: 'book:' + id,
            crumbs: [{ text: meta.book.en, href: UI.href('books', [meta.book.id]) }, { text: meta.en + ' ' + c }],
            docTitle: meta.en + ' ' + c,
            head: chapterPager(ix, meta, i, true, marked),
            foot: chapterPager(ix, meta, i, false),
            nav: neighbours(ix, meta, i),
            targum: !!ctx.sec.tg,
            passages: [{ ctx: ctx, from: { c: c, v: 1 }, to: { c: c, v: Infinity }, opening: i === 0 }],
            target: v ? { id: rowId(ctx, c + ':' + v), q: args[3], whole: args[4] === 'w' } : null
          }, up);
        });
      }, function (e) { failed(host, mine, e); });
    }
  });

  /* ------------------------------------------------------------- portions */

  const at = function (s) { const p = s.split(':'); return { c: +p[0], v: +p[1] }; };

  /* "Genesis 1:1–6:8", "Isaiah 42:5–21", "Ezekiel 3:12". */
  function rangeName(ix, r) {
    const b = ix.byId.get(r.book);
    const f = at(r.from), t = at(r.to);
    const end = r.from === r.to ? '' : '–' + (f.c === t.c ? t.v : t.c + ':' + t.v);
    return (b ? b.en : r.book) + ' ' + r.from + end;
  }

  /* A portion's parts, as tabs: its Torah reading, and its haftarah as each
     custom has it (one tab when they agree). → [{ part, label, ranges, sub }] */
  function portionParts(p) {
    const parts = [];
    const torah = p.torah ? [].concat.apply([], p.torah) : [{ book: p.book, from: p.from, to: p.to }];
    if (torah.length) parts.push({ part: 'torah', label: 'Torah', ranges: torah });
    const h = p.haftarah || {};
    const same = h.sef && h.ash && JSON.stringify(h.sef) === JSON.stringify(h.ash);
    if (h.ash && h.ash.length) parts.push({ part: 'ash', label: h.sef && !same ? 'Haftarah (Ashkenazi)' : 'Haftarah', ranges: h.ash });
    if (h.sef && h.sef.length && !same) parts.push({ part: 'sef', label: 'Haftarah (Sephardi)', ranges: h.sef });
    return parts;
  }

  /* Previous/next parashah (or holiday reading), and a list of them all. */
  function portionPager(ix, p, part, withSelect) {
    const list = /^r/.test(p.id) ? ix.readings : ix.parashot;
    const i = list.indexOf(p);
    const hrefOf = function (q) { return q ? UI.href('portion', [q.id]) : null; };
    let select = null;
    if (withSelect) {
      select = UI.select(list.map(function (q) { return { value: q.id, label: q.en + ' · ' + q.he }; }), p.id,
        function () { UI.go('portion', [select.value]); });
      select.setAttribute('aria-label', /^r/.test(p.id) ? 'Reading' : 'Parashah');
      select.classList.add('chsel');
    }
    return pagerLinks(hrefOf(list[i - 1]), hrefOf(list[i + 1]), select,
      /^r/.test(p.id) ? ['Previous reading', 'Next reading'] : ['Previous parashah', 'Next parashah']);
  }

  function portionTabs(p, parts, part) {
    if (parts.length < 2) return null;
    return UI.el('nav.ptabs', { 'aria-label': 'Part' }, parts.map(function (x) {
      return UI.el('a.ptab', {
        href: UI.href('portion', x.part === 'torah' ? [p.id] : [p.id, x.part]), text: x.label,
        'aria-current': x.part === part.part ? 'page' : null
      });
    }));
  }

  UI.route('portion', {
    refresh: function (host, args) {
      const mine = ++seq;
      return lib.index().then(function (ix) {
        if (mine !== seq) return;
        const p = ix.portions.get(args[0]);
        if (!p) { UI.go('parashot'); return; }
        const parts = portionParts(p);
        const part = parts.find(function (x) { return x.part === (args[1] || 'torah'); }) || parts[0];
        const key = 'portion:' + p.id + '/' + part.part;
        loading(host, key);
        const books = [];
        part.ranges.forEach(function (r) { if (books.indexOf(r.book) < 0) books.push(r.book); });
        return Promise.all(books.map(lib.section)).then(function (raws) {
          if (mine !== seq) return;
          return branchChanges(raws).then(function (up) {
            if (mine !== seq) return;
            const editing = !!TR.device.get('editing');
            const ctxs = {};
            raws.forEach(function (raw) { ctxs[raw.id] = bookCtx(raw, ix.byId.get(raw.id), up && up.changes[raw.id], editing); });
            const holiday = /^r/.test(p.id);
            const list = holiday ? ix.readings : ix.parashot;
            const i = list.indexOf(p);
            const v = args[2] ? args[2].split('-') : null;   // a verse to go to: book-c-v
            render(host, {
              key: key,
              crumbs: [{ text: holiday ? 'Holidays' : 'Parashot', href: UI.href('parashot', holiday ? ['holidays'] : []) },
                { text: p.en + (part.part === 'torah' ? '' : ' · ' + part.label) }],
              docTitle: p.en + (part.part === 'torah' ? '' : ' · ' + part.label),
              head: portionPager(ix, p, part, true),
              foot: portionPager(ix, p, part, false),
              tabs: portionTabs(p, parts, part),
              nav: {
                prev: list[i - 1] ? UI.href('portion', [list[i - 1].id]) : null,
                next: list[i + 1] ? UI.href('portion', [list[i + 1].id]) : null
              },
              targum: part.ranges.some(function (r) { return !!ctxs[r.book].sec.tg; }),
              /* The first passage is headed with the portion's name, each
                 one with where it is. */
              passages: part.ranges.map(function (r, n) {
                return {
                  ctx: ctxs[r.book], from: at(r.from), to: at(r.to),
                  title: n ? rangeName(ix, r) : (part.part === 'torah' ? '' : part.label + ' · ') + p.en,
                  sub: n ? null : p.he + ' · ' + rangeName(ix, r)
                };
              }),
              target: v && v.length === 3 ? { id: 'v-' + v[0] + '-' + v[1] + '-' + v[2] } : null
            }, up);
          });
        });
      }).catch(function (e) { failed(host, mine, e); });
    }
  });

  /* ← and → turn chapters or portions, when the reader is open and nothing
     is being typed. In the scroll, j and k move the panel to the next and
     previous verse, and Esc closes it. */
  document.addEventListener('keydown', function (e) {
    if (!onReader() || !nav || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (live && live.scroll && (e.key === 'j' || e.key === 'k')) {
      const s = live.scroll;
      const at = chosen ? s.order.indexOf(s.byKey.get(chosen.sec + ' ' + chosen.key)) : -1;
      const to = at < 0 ? s.order[0] : s.order[at + (e.key === 'j' ? 1 : -1)];
      if (to) choose(to, true);
      return;
    }
    if (live && live.scroll && e.key === 'Escape' && chosen && !e.defaultPrevented && !TR.editor.active()) { choose(null); return; }
    const href = e.key === 'ArrowLeft' ? nav.prev : e.key === 'ArrowRight' ? nav.next : null;
    if (href) { e.preventDefault(); location.hash = href; }
  });

})(window.TR);
