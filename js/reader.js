/* The reader, in one of two layouts (the header's first buttons):

   Both show the Hebrew and one other text beside it (the English, or the
   Targum on the Torah), or the Hebrew alone, with the Hebrew at the left or
   the right: the Display menu's choices, the same for both.

   INTERLINEAR: one row per verse, its texts side by side.

   SIDE BY SIDE: the Hebrew and the text beside it each set as a scroll sets it
   by its own section marks (scroll.js), in columns of their own, each with
   its own verse numbers. They are lined up only at the full breaks (the
   end of a paragraph, a song's line, a blank line) that both have after the
   same verse, and run free in between. With nothing beside it, the Hebrew
   is set alone. Selecting a verse lights it in both.

   THE NOTES PANE. In either layout, the chosen verse's commentary, review
   notes, commentators and MT links show in a pane along the bottom of the
   screen, or down its left or right side (the Display menu's choice), to
   read and edit. A
   verse is chosen by its row or its counts interlinear, by its text or its
   number side by side. The pane opens and closes from its bar, and its inner
   edge drags to resize it; it stays as it was left.

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
   The Targum follows it: unpointed when the Hebrew is. Which texts show,
   and on which side, are device settings, chosen in the header's Display
   menu. Under 900px the interlinear columns stack, the Hebrew first.

   SECTIONS. Interlinear, the section marks ({פ} {ס} {ר} {ש}, and the
   English's {P} {S} {N}) show as they stand in the text, and nothing is laid
   out by them: rows are rows. Laying the text out by them is side by side's.

   REVIEWING. Reading a branch other than its base, what the branch changed
   is marked in blue, note by note, with its diff (review.js).

   EDITING. Only the commentary and the review notes are edited here; the
   texts are Mechon Mamre's and stay as they are. There is no edit mode:
   the pane's bar has buttons to add commentary or a review note to its
   verse, and each note in it a pencil that opens it in place (editor.js).
   Selecting a phrase in the text offers the same, with the phrase quoted.
   Edits are drafts on this device (drafts.js); what they changed is marked
   where it stands, in green, with its diff and an undo.

   NOTED VERSES. In either layout a verse's number is marked (noteState())
   when it has commentary, review notes, a commentator's comments or MT
   links; how many of each is in the pane's bar when it is chosen.

   COMMENTATORS. The classical commentaries (Rashbam …, Commentators/ in the
   texts, generated from Sefaria by tools/commentators.mjs) are notes layers
   too, read-only, each in its Hebrew and its English: between the review
   notes and the MT links, one block each, the two languages side by side.
   Which commentators show, and in which language, are the Display menu's.
   The pane's bar counts them all together, under one icon.

   FOLDING. Each block in the pane folds away from its heading, and stays
   folded, whatever verse is chosen, until unfolded (a device setting).

   THE NOAHIDE DIGEST (digest.js) is a commentary made of the commentators'
   comments: each of their comments in the pane has a star that copies it
   into the digest, or takes it out. The digest's entries show after the
   commentary, each under the name of the commentator it is from.

   ALIYOT. A parashah's or holiday's Torah page marks where each aliyah and
   the maftir begin (data/aliyot.json, lib.aliyot()), a badge in a strip down
   the outer edge of the text, level with the verse.

   BOOKMARKS. The pane's bar has the chosen verse's ribbon (bookmarks.js),
   and the selection toolbar offers it too; a bookmarked verse is marked
   where it stands.

   IN A LIVE SESSION (session.js) the others' edits arrive while this is
   open, and each repaints it. The pane with an editor open in it is kept as
   it stands across that (holdRow). If the very note being edited is what
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
    co: 'commentary', digest: 'Noahide Digest', notes: 'review notes', mt: 'MT links' };
  /* The notes layers under each verse. The MT links (the halakhot of the
     Mishneh Torah that quote the verse, tools/mt-links.mjs) show and hide as
     the others do, but are generated, and never edited here. */
  let ANN = ['co', 'digest', 'notes', 'mt'];
  const ANN_TITLE = { co: 'Commentary', digest: 'Noahide Digest', notes: 'Review notes', mt: 'MT links' };
  const ANN_ICON = { co: 'comment', digest: 'digest', notes: 'note', mt: 'link' };
  const editable = function (layer) { return layer === 'co' || layer === 'notes' || layer === 'digest'; };

  /* The commentators on show (lib.index()'s, less those the Display menu
     hides), id → { id, en, he, full, books }. Each is a notes layer named by
     its id, after the review notes and before the MT links. */
  const CM = new Map();
  const isCm = function (layer) { return CM.has(layer); };

  function syncCommentators() {
    const hidden = TR.device.get('cmHidden') || [];
    CM.clear();
    lib.commentators.forEach(function (c) {
      if (hidden.indexOf(c.id) < 0) CM.set(c.id, c);
      LAYER_NAME[c.id] = ANN_TITLE[c.id] = c.en;
    });
    ANN = ['co', 'digest', 'notes'].concat(Array.from(CM.keys()), ['mt']);
  }

  /* Which of a commentator's languages a book shows: the Display menu's
     choice, of those it has; or, if it has none of them, what it has. */
  function cmLangs(sec, id) {
    const want = { he: ['he'], en: ['en'] }[TR.device.get('cmLang')] || F.CM_LANGS;
    const have = F.CM_LANGS.filter(function (l) { return !!sec[F.cmLayer(id, l)]; });
    const show = want.filter(function (l) { return have.indexOf(l) >= 0; });
    return show.length ? show : have;
  }

  /* "3 comments", "1 MT link", "2 comments by Rashbam". */
  function countText(layer, n) {
    if (isCm(layer)) return n + (n === 1 ? ' comment' : ' comments') + ' by ' + CM.get(layer).en;
    const one = { co: 'comment', digest: 'digest entry', notes: 'review note', mt: 'MT link' }[layer];
    return n + ' ' + (n === 1 ? one : one + 's');
  }

  /* A layer's sign beside its count: its icon, the commentators' one icon. */
  function annIcon(layer) {
    return isCm(layer) ? TR.icons.commentators() : TR.icons[ANN_ICON[layer]]();
  }
  const markCls = function (layer) { return 'span.mk-' + layer + (isCm(layer) ? '.mk-cm' : ''); };

  /* Which blocks of the pane are folded (by layer; a commentator by its id). */
  function folded(layer) { return (TR.device.get('paneFolded') || []).indexOf(layer) >= 0; }
  function setFolded(layer, on) {
    const list = (TR.device.get('paneFolded') || []).filter(function (l) { return l !== layer; });
    if (on) list.push(layer);
    TR.device.set({ paneFolded: list });
  }

  /* A block's heading, which folds it away and back: a chevron, its name
     (`label`, text or nodes) and how many notes it has. */
  function annHead(layer, label, count, title) {
    const open = !folded(layer);
    const head = UI.el('button.annhead', {
      type: 'button', 'aria-expanded': open ? 'true' : 'false',
      title: (title ? title + ' · ' : '') + (open ? 'Fold' : 'Unfold'),
      onclick: function () {
        const box = head.closest('.cell');
        const fold = !box.classList.contains('folded');
        foldBox(box, fold);
        setFolded(layer, fold);
      }
    }, [TR.icons.chevron(), UI.el('span.annhead-name', typeof label === 'string' ? { text: label } : null, typeof label === 'string' ? null : label),
      count ? UI.el('span.annhead-n', { text: String(count) }) : null]);
    return head;
  }

  function foldBox(box, fold) {
    box.classList.toggle('folded', fold);
    const head = box.querySelector(':scope > .annhead');
    if (!head) return;
    head.setAttribute('aria-expanded', fold ? 'false' : 'true');
    head.title = head.title.replace(/(Fold|Unfold)$/, fold ? 'Unfold' : 'Fold');
  }
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

  function noteContent(n, lang) {
    return [
      TR.md.para(n.text, lang === 'he' ? 'p.he' : 'p'),
      paras(n.more, lang),
      n.h2 != null ? UI.el('p.note-range', { text: 'on ' + noteRange(n) }) : null
    ];
  }

  /* A note's content as its layer shows it: a digest entry with its source. */
  function shownNote(n, layer) {
    return layer === 'digest' ? TR.digest.content(n, noteContent) : noteContent(n);
  }

  const kindOf = function (layer) { return layer === 'notes' ? 'review' : isCm(layer) ? 'cm' : layer; };

  function noteEl(ctx, n, layer) {
    const change = findChange(ctx.changes, layer, 'note', n.label);
    const upstream = findChange(ctx.branch, layer, 'note', n.label);
    const el = UI.el('div.note.' + kindOf(layer) + (change ? '.changed' : '') + (upstream ? '.branched' : ''), shownNote(n, layer));
    if (upstream) el.appendChild(branchBar(ctx, upstream, el));
    if (change) el.appendChild(changeBar(ctx, layer, change, el));
    flash(el, ctx.id, layer, 'note', n.label);
    /* Under a note that can be edited, its pencil, which opens it in place. */
    if (editable(layer)) {
      el.classList.add('editable');
      el.appendChild(UI.el('div.note-tools', [UI.el('button.iconbtn.note-edit', {
        type: 'button', title: 'Edit this ' + (layer === 'notes' ? 'review note' : layer === 'digest' ? 'entry' : 'comment'),
        'aria-label': 'Edit this ' + (layer === 'notes' ? 'review note' : layer === 'digest' ? 'entry' : 'comment'),
        onclick: function () { TR.editor.close().then(el._edit); }
      }, [TR.icons.pencil()])]));
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
              return shownNote(Object.assign({}, n, { text: s.text, more: s.rest }), layer);
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

  /* The commentary, review notes or MT links on verse `key`, as a block in
     the pane: a heading, then the notes in columns; hidden while it has none
     (until one is added, newNote()). `box._count` is how many there are,
     `box._changed` whether any is changed. */
  function notesCell(ctx, layer, key) {
    const out = lib.notesFor(ctx.sec[layer], key).map(function (n) { return noteEl(ctx, n, layer); });
    const count = out.length;
    const gone = function (ch) { return ch.kind === 'note' && ch.after === null && ch.key === key; };
    (ctx.branch[layer] || []).filter(gone).forEach(function (ch) { out.push(branchDeletedNote(ctx, ch, layer)); });
    (ctx.changes[layer] || []).filter(gone).forEach(function (ch) { out.push(deletedNote(ctx, ch, layer)); });
    const list = UI.el('div.notelist', out);
    const box = cell(layer, [annHead(layer, ANN_TITLE[layer], count), list],
      [out.length ? null : 'none', folded(layer) ? 'folded' : null].filter(Boolean).join('.') || null);
    box._count = count;
    box._changed = out.some(function (el) { return el.classList.contains('changed') || el.classList.contains('branched'); });
    return box;
  }

  /* A commentator's comments on verse `key`, as notesCell() draws the
     others: a heading, then its comments in each language shown, side by
     side where there is room. Never edited, so never changed. */
  function cmCell(ctx, layer, key) {
    const c = CM.get(layer);
    const lists = (ctx.cmLangs[layer] || []).map(function (lang) {
      const notes = lib.notesFor(ctx.sec[F.cmLayer(layer, lang)], key);
      if (!notes.length) return null;
      return UI.el('div.notelist.cm-' + lang, lang === 'he' ? { lang: 'he', dir: 'rtl' } : { dir: 'ltr' }, notes.map(function (n) {
        return UI.el('div.note.cm', [digestStar(ctx, key, F.cmLayer(layer, lang), n)].concat(noteContent(n, lang)));
      }));
    }).filter(Boolean);
    const count = noteCounts(ctx, layer).get(key) || 0;
    const head = annHead(layer, [
      UI.el('span', { text: c.en }),
      c.he ? UI.el('span.cm-he', { lang: 'he', dir: 'rtl', text: c.he }) : null
    ], count, c.full);
    /* The Hebrew on the side the text's Hebrew is on (stacked, first). */
    const box = cell(layer, [head, UI.el('div.cmcols.he-' + heSide(), lists)],
      'cm' + (lists.length ? '' : '.none') + (folded(layer) ? '.folded' : ''));
    box._count = count;
    box._changed = false;
    return box;
  }

  /* A star on comment `n` of a commentator's layer `cmLayer`: lit when the
     comment is in the Noahide Digest; it puts it in or takes it out. */
  function digestStar(ctx, key, cmLayer, n) {
    const on = !!TR.digest.entryFor(ctx.sec.digest, key, cmLayer, n.label);
    const label = on ? 'In the Noahide Digest: take it out' : 'Add to the Noahide Digest';
    return UI.el('button.iconbtn.dg-star' + (on ? '.on' : ''), {
      type: 'button', title: label, 'aria-label': label, 'aria-pressed': on ? 'true' : 'false',
      onclick: function () {
        TR.digest.toggle(ctx.id, key, cmLayer, n).then(function () { UI.refresh(); }, function (e) { UI.toast(e.message); });
      }
    }, [TR.icons.digest()]);
  }

  /* A verse's notes of each layer, as notesCell() draws them, and the block
     of them under its text. */
  function noteBoxes(ctx, key) {
    const boxes = {};
    ANN.forEach(function (layer) { boxes[layer] = isCm(layer) ? cmCell(ctx, layer, key) : notesCell(ctx, layer, key); });
    return boxes;
  }

  function annBlock(boxes) {
    return UI.el('div.ann', ANN.map(function (layer) { return boxes[layer]; }));
  }

  /* In a verse's right margin: how many notes of each layer it has, or
     whether it has changes to them (green when this device has changed
     them, blue when the branch has). `counts` is { layer: n }, `changed`
     { layer: 'changed' | 'branched' }; `onclick` opens them. */
  function marker(counts, changed, onclick, expanded) {
    const shown = ANN.filter(function (layer) { return counts[layer] || changed[layer]; });
    const said = shown.map(function (layer) { return counts[layer] ? countText(layer, counts[layer]) : LAYER_NAME[layer] + ' changed'; });
    const m = UI.el('button.annmark', {
      type: 'button', title: said.join(', '), 'aria-label': said.join(', '), onclick: onclick,
      'aria-expanded': expanded == null ? null : expanded ? 'true' : 'false'
    }, shown.map(function (layer) {
      return UI.el(markCls(layer) + (changed[layer] ? '.' + changed[layer] : ''),
        [annIcon(layer), UI.el('span', { text: counts[layer] ? String(counts[layer]) : '·' })]);
    }));
    m.hidden = !shown.length;
    return m;
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
    if (box.classList.contains('folded')) { foldBox(box, false); setFolded(layer, false); }
    const none = box.closest('.pane-body') && box.closest('.pane-body').querySelector('.vp-none');
    if (none) none.hidden = true;
    box.querySelector('.notelist').appendChild(wrap);
    const on = F.unitName(key);
    let label = null;
    openEditor(wrap, {
      body: prefix, label: 'New ' + LAYER_NAME[layer] + ' note on ' + on,
      hint: 'New ' + (layer === 'notes' ? 'review note' : 'commentary') + ' on ' + on +
        (layer === 'notes' && !TR.device.get('name') ? ' · signed "reviewer" until you set your name in Settings' : ''),
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
  let picked = null;   // { ctx, key, phrase }
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
        addNote(p.ctx, p.key, layer, p.phrase);
      }
    });
  }

  /* A new note of `layer` on verse `key` (quoting `phrase`, if any), typed
     into the verse's pane, which is opened for it. */
  function addNote(ctx, key, layer, phrase) {
    return choose(live.verses.byKey.get(ctx.id + ' ' + key), false, true).then(function () {
      const panel = live && live.verses && live.verses.panel;
      if (panel && panel.classList.contains('row')) newNote(ctx, panel.querySelector('.cell.' + layer), layer, key, phrase || '');
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
    let ctx, key;
    if (c.classList.contains('sc-text')) {
      /* Side by side, the verse the selection starts in. */
      let start = range.startContainer;
      if (start.nodeType !== 1) start = start.parentNode;
      const vs = start.closest('.vs') || start.querySelector('.vs');
      if (!vs || !vs._ctx) return hideSel();
      ctx = vs._ctx;
      key = vs.getAttribute('data-key');
    } else {
      const row = c.closest('.row.law');
      if (!row || !row._ctx) return hideSel();
      ctx = row._ctx;
      key = row.getAttribute('data-key');
    }
    const phrase = phraseOf(range);
    if (!phrase) return hideSel();
    picked = { ctx: ctx, key: key, phrase: phrase };
    const r = range.getBoundingClientRect();
    seltools.hidden = false;
    seltools.style.top = Math.max(0, r.top + window.scrollY - seltools.offsetHeight - 8) + 'px';
    seltools.style.left = Math.max(8, Math.min(window.scrollX + r.left + r.width / 2 - seltools.offsetWidth / 2,
      document.documentElement.clientWidth - seltools.offsetWidth - 8)) + 'px';
  }

  document.addEventListener('selectionchange', TR.debounce(checkSel, 200));
  TR.bus.on('route', function (r) {
    if (r.id === 'read' || r.id === 'portion') return;
    hideSel();
    document.body.classList.remove('paned');
  });

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

  /* The header's controls are few: the layout (interlinear or side by
     side), the Display menu, and marking a branch's changes (when reading
     one). Everything about how the text looks — the Hebrew's four ways,
     which texts show, where the notes pane is — is in the Display menu,
     whose button shows the Hebrew's way at a glance. */

  const LAYOUT = {
    lines: { icon: 'lines', title: 'Interlinear: verse by verse, the texts side by side' },
    parallel: { icon: 'parallel', title: 'Side by side: the Hebrew and one text (or none), each set by its sections, in columns' }
  };

  /* The scroll layout that was (the Hebrew alone, set by its sections) is
     side by side with nothing beside the Hebrew. */
  if (TR.device.get('layout') === 'scroll') TR.device.set({ layout: 'parallel', beside: 'none' });

  function layout() {
    const l = TR.device.get('layout');
    return LAYOUT[l] ? l : 'lines';
  }

  /* The text beside the Hebrew, side by side: the Targum where there is one
     and it is chosen, else the English; or none, the Hebrew alone. */
  function beside(ctx) {
    const b = TR.device.get('beside');
    if (b === 'none') return 'none';
    return b === 'tg' && (!ctx || ctx.sec.tg) ? 'tg' : 'en';
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

  /* The Display menu, the same in both layouts: the Hebrew's four ways, the
     text beside it (or none), which side it is on, and where the notes pane
     is. Each choice repaints the page. */
  function displayMenu(page) {
    const mode = heMode();
    const btn = UI.el('button.seg.dispbtn', {
      type: 'button', 'aria-haspopup': 'true', 'aria-expanded': displayOpen ? 'true' : 'false',
      title: 'Display: ' + HE_MODE[mode].title.toLowerCase() + '; the texts; the notes pane', 'aria-label': 'Display',
      onclick: function () { setDisplay(!displayOpen); }
    }, [UI.el('span.he', { lang: 'he', text: HE_MODE[mode].glyph }), TR.icons.chevron()]);

    const repaint = function (patch) {
      TR.editor.close().then(function () {
        TR.device.set(patch);
        UI.refresh();
      });
    };

    const modes = Object.keys(HE_MODE).map(function (m) {
      return UI.el('button.seg.glyph.he', {
        type: 'button', lang: 'he', text: HE_MODE[m].glyph, 'data-mode': m,
        'aria-pressed': m === mode ? 'true' : 'false', title: HE_MODE[m].title, 'aria-label': HE_MODE[m].title,
        onclick: function () { if (m !== heMode()) repaint({ heMode: m }); }
      });
    });

    /* One text beside the Hebrew, or none: a choice of one. */
    const one = function (key, label) {
      return UI.el('button.dm-item.dm-one', {
        type: 'button', role: 'radio', 'aria-checked': beside() === key ? 'true' : 'false',
        onclick: function () { if (beside() !== key) repaint({ beside: key }); }
      }, [UI.el('span.dm-check', [TR.icons.check()]), UI.el('span', { text: label })]);
    };

    /* A row of buttons choosing one of `opts` ({ value: label }) for device
       setting `key`. */
    const segs = function (key, label, opts, cls) {
      return UI.el('div.segs.dm-segs' + (cls ? '.' + cls : ''), { role: 'group', 'aria-label': label }, Object.keys(opts).map(function (v) {
        return UI.el('button.seg', {
          type: 'button', text: opts[v], 'aria-pressed': TR.device.get(key) === v ? 'true' : 'false',
          onclick: function () { if (TR.device.get(key) !== v) { const p = {}; p[key] = v; repaint(p); } }
        });
      }));
    };
    const paneLabels = {};
    Object.keys(PANE_POS).forEach(function (p) { paneLabels[p] = PANE_POS[p].label; });

    const menu = UI.el('div.dispmenu', { role: 'group', 'aria-label': 'Display' }, [
      UI.el('div.dm-head', { text: 'Hebrew' }),
      UI.el('div.segs.hemodes', { role: 'group', 'aria-label': 'Hebrew' }, modes),
      UI.el('p.dm-sub', { text: HE_MODE[mode].title }),

      UI.el('div.dm-head', { text: 'Beside the Hebrew' }),
      UI.el('div', { role: 'radiogroup', 'aria-label': 'Beside the Hebrew' },
        [one('en', 'English (JPS 1917)'), page.targum ? one('tg', 'Targum Onqelos') : null, one('none', 'Neither: the Hebrew alone')]),
      page.targum ? UI.el('p.dm-sub', { text: 'Where there is no Targum (beyond the Torah), the English.' }) : null,

      UI.el('div.dm-head', { text: 'Hebrew on the' }),
      segs('heSide', 'Hebrew on the', { left: 'Left', right: 'Right' }),

      /* The commentators to show in the notes pane, and in which language. */
      lib.commentators.length ? [
        UI.el('div.dm-head', { text: 'Commentators' }),
        UI.el('div', { role: 'group', 'aria-label': 'Commentators' }, lib.commentators.map(function (c) {
          const hidden = TR.device.get('cmHidden') || [];
          const on = hidden.indexOf(c.id) < 0;
          return UI.el('button.dm-item', {
            type: 'button', role: 'checkbox', 'aria-checked': on ? 'true' : 'false', title: c.full || null,
            onclick: function () {
              repaint({ cmHidden: on ? hidden.concat([c.id]) : hidden.filter(function (x) { return x !== c.id; }) });
            }
          }, [UI.el('span.dm-check', [TR.icons.check()]), UI.el('span', { text: c.en }),
            c.he ? UI.el('span.dm-he', { lang: 'he', dir: 'rtl', text: c.he }) : null]);
        })),
        segs('cmLang', 'Commentators\u2019 language', { he: 'Hebrew', en: 'English', both: 'Both' })
      ] : null,

      /* Where the chosen verse's notes show. */
      UI.el('div.dm-head', { text: 'Notes pane' }),
      segs('panePos', 'Notes pane', paneLabels),
      UI.el('p.dm-sub', { text: 'Select a verse to see its commentary, Noahide Digest, review notes, commentators and MT links there.' +
        (window.innerWidth < PANE_SIDE_FROM ? ' At the bottom while the window is this narrow.' : '') })
    ]);
    menu.hidden = !displayOpen;
    return UI.el('div.dispwrap', [UI.el('div.segs', [btn]), menu]);
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

  /* The texts showing (the Hebrew, and the one beside it if any) and the
     side the Hebrew is on, as classes on the grid; interlinear, the texts
     share the rows' column template, in that order. */
  function applyCols(grid) {
    const b = TR.device.get('beside');
    const other = b === 'none' ? null : b === 'tg' && grid.classList.contains('has-tg') ? 'tg' : 'en';
    /* In the order they stand, left to right: the Hebrew at its side. */
    const text = !other ? ['he'] : heSide() === 'left' ? ['he', other] : [other, 'he'];
    grid.classList.add('cols-' + text.length, 'he-' + heSide());
    text.forEach(function (k) { grid.classList.add('show-' + k); });
    grid.style.setProperty('--cols', text.map(function (k) {
      return k === 'en' && text.length > 1 ? 'minmax(0, 1.15fr)' : 'minmax(0, 1fr)';
    }).join(' '));
  }

  /* Which side of the page the Hebrew is on, in either layout. */
  function heSide() {
    return TR.device.get('heSide') === 'left' ? 'left' : 'right';
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

  /* The header's: the book's name, which opens the tables of contents, and
     the chapter's, which opens all the book's chapters (`marked`: the keys
     of those with changes on the branch, flagged there). */
  function chapterPager(ix, meta, i, withNav, marked) {
    const n = neighbours(ix, meta, i);
    const chapter = 'Chapter ' + meta.chapters[i].n;
    const middle = withNav ? [
      navPop('Books, parashot and holidays', meta.en, 'contents', function () { return contentsNav(ix, 'books', meta.id, meta.chapters[i].key); }),
      meta.chapters.length > 1
        ? navPop('Chapters of ' + meta.en, chapter, 'chapters', function () { return chapterNav(meta, i, marked); })
        : UI.el('span.navtext.solo', { text: chapter })
    ] : null;
    return pagerLinks(n.prev, n.next, middle, ['Previous chapter', 'Next chapter']);
  }

  /* ------------------------------------------------------------ navigator */

  /* A name in the header that opens a pop-up below it, built when opened.
     One is open at a time; a click outside it, Esc, or going anywhere
     closes it. */
  function navPop(label, text, cls, build) {
    const pop = UI.el('div.navpop.' + cls, { role: 'dialog', 'aria-label': label });
    pop.hidden = true;
    const btn = UI.el('button.navbtn', {
      type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: label,
      onclick: function () {
        const opening = pop.hidden;
        closeNav();
        if (!opening) return;
        UI.fill(pop, build());
        pop.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        reveal(pop);
      }
    }, [UI.el('span.navtext', { text: text }), TR.icons.chevron()]);
    /* A link to where you already are goes nowhere, so close on any. */
    pop.addEventListener('click', function (e) { if (e.target.closest('a[href]')) closeNav(); });
    return UI.el('div.navwrap', [btn, pop]);
  }

  /* Scroll a pop-up (and not the page) to where you are in it, a third of
     the way down; to its top if that is nowhere in it. */
  function reveal(pop) {
    const at = pop.querySelector('[aria-current="page"]') || pop.querySelector('.cur');
    pop.scrollTop = at ? pop.scrollTop + at.getBoundingClientRect().top - pop.getBoundingClientRect().top - pop.clientHeight / 3 : 0;
  }

  function closeNav() {
    document.querySelectorAll('.navpop:not([hidden])').forEach(function (p) {
      p.hidden = true;
      p.parentNode.querySelector('.navbtn').setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', function (e) {
    if (!document.contains(e.target) || e.target.closest('.navwrap')) return;   // its own tabs repaint it
    closeNav();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const pop = document.querySelector('.navpop:not([hidden])');
    if (!pop) return;
    e.preventDefault();   // the pop-up's Escape, not the verse panel's
    closeNav();
    pop.parentNode.querySelector('.navbtn').focus();
  });
  TR.bus.on('route', closeNav);

  /* The book's chapters, as the contents page lists them. */
  function chapterNav(meta, i, marked) {
    return UI.el('div.chgrid', meta.chapters.map(function (c, j) {
      const up = marked && marked.has(c.key);
      return UI.el('a.chnum' + (up ? '.up' : ''), {
        href: UI.href('read', [meta.id, c.key]), text: String(c.n),
        title: meta.en + ' ' + c.n + (up ? ' (changed on this branch)' : ''),
        'aria-current': j === i ? 'page' : null
      });
    }));
  }

  /* The contents page's three lists, as tabs: the books, each opening on
     its chapters; the parashot; the holidays' readings. `which` is the tab
     to open on, `cur` what is being read (a book's id or a portion's) and
     `ch` the chapter's key, when a book's. */
  function contentsNav(ix, which, cur, ch) {
    const body = UI.el('div.navbody');
    const TABS = { books: 'Books', parashot: 'Parashot', holidays: 'Holidays' };
    const tabs = Object.keys(TABS).map(function (t) {
      return UI.el('button.ptab', {
        type: 'button', role: 'tab', text: TABS[t],
        onclick: function () { openTab(t); }
      });
    });
    function openTab(t) {
      tabs.forEach(function (b, k) { b.setAttribute('aria-selected', Object.keys(TABS)[k] === t ? 'true' : 'false'); });
      UI.fill(body, t === 'books' ? TR.contents.books(ix) : t === 'parashot' ? TR.contents.parashot(ix) : TR.contents.holidays(ix));
      /* The book being read opens on its chapters; it or the portion being
         read is marked. */
      const here = body.querySelector('[data-sec="' + cur + '"], [data-portion="' + cur + '"]');
      if (here) {
        here.classList.add('cur');
        if (here.tagName === 'DETAILS') here.open = true;
        const at = ch && here.querySelector('a.chnum[href="' + UI.href('read', [cur, ch]) + '"]');
        if (at) at.setAttribute('aria-current', 'page');
      }
      if (body.parentNode) reveal(body.parentNode);
    }
    openTab(which);
    return [UI.el('div.ptabs.navtabs', { role: 'tablist', 'aria-label': 'Contents' }, tabs), body];
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
  function bookCtx(raw, meta, changes) {
    syncCommentators();
    const sec = lib.view(raw, heMode());
    const langs = {};
    CM.forEach(function (c, id) { langs[id] = cmLangs(sec, id); });
    return {
      id: raw.id, meta: meta, title: meta.en, sec: sec, raw: raw, cmLangs: langs,
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

  /* The bookmark ribbon, in the pane's bar: filled once set. */
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
      if (!r._ctx) return;
      const b = r.querySelector('.bmk');
      if (b) paintBookmark(b, r._ctx.id, r.getAttribute('data-key'), r._ctx.title);
      else r.classList.toggle('marked', TR.bookmarks.has(r._ctx.id, r.getAttribute('data-key')));
    });
    live.grid.querySelectorAll('.vs, .sc-n').forEach(function (el) {
      el.classList.toggle('marked', TR.bookmarks.has(el.getAttribute('data-sec'), el.getAttribute('data-key')));
    });
  });

  /* A verse's row: its texts, and in its margin its note counts and its
     bookmark. Its notes are in the pane, opened by choosing the row (its
     text or its counts). The verse is added to `s`, the page's verses. */
  function verseRow(ctx, r, s) {
    const href = verseHref(ctx, r.key);
    const v = { key: r.key, sec: ctx.id, id: rowId(ctx, r.key), ctx: ctx, c: +r.key.split(':')[0], n: r.n };
    s.order.push(v);
    s.byKey.set(v.sec + ' ' + v.key, v);
    const el = row('law', [], v.id);
    el._ctx = ctx;
    el.setAttribute('data-key', r.key);
    el.setAttribute('data-sec', ctx.id);
    el.classList.toggle('marked', TR.bookmarks.has(ctx.id, r.key));
    const cells = TEXT.filter(function (col) { return col !== 'tg' || ctx.sec.tg; }).map(function (col) {
      return unitCell(ctx, col, r[col], r.key, href);
    });
    el.appendChild(UI.el('div.text', cells));
    /* An aliyah beginning here: its badge in the row's strip. */
    const al = s.aliyot.get(v.sec + ' ' + v.key);
    if (al) {
      el.classList.add('al-start');
      el.appendChild(UI.el('div.al-strip', al.map(aliyahBadge)));
    }
    /* Its numbers say whether it has notes, as side by side's do. */
    const st = noteState(ctx, r.key);
    if (st.cls) {
      el.querySelectorAll('.text > .cell > p > a.label').forEach(function (a) {
        st.cls.split(' ').forEach(function (c) { a.classList.add(c); });
        a.title = st.said.join(', ');
      });
    }
    return el;
  }

  /* Commentary that belongs to no verse, as a row of its own under a marker
     that opens it in place. */
  function generalRow(blocks, title) {
    if (!blocks.length) return null;
    const el = row('general');
    const box = cell('co', [UI.el('div.annhead', { text: title || 'Commentary: general remarks' })].concat(blocks));
    const m = marker({ co: 1 }, {}, function () {
      const open = el.classList.toggle('open');
      m.setAttribute('aria-expanded', open ? 'true' : 'false');
    }, false);
    m.querySelector('.mk-co span').textContent = 'General remarks';
    m.title = title || 'General remarks';
    m.setAttribute('aria-label', m.title);
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
  function passageRows(ctx, from, to, grid, s) {
    for (let c = from.c; c <= to.c; c++) {
      const v1 = c === from.c ? from.v : 1;
      const v2 = c === to.c ? to.v : Infinity;
      grid.appendChild(chapterHead(ctx, c));
      if (v1 === 1) UI.append(grid, generalRow(coChapter(ctx.sec.co, c)));
      verseRows(ctx, c, v1, v2).forEach(function (r) { grid.appendChild(verseRow(ctx, r, s)); });
    }
  }

  /* -------------------------------------------------------------- scroll */

  /* The verse open in the notes pane, kept across repaints of the same
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
      /* A commentator's, in whichever of its languages shown has more. */
      const docs = isCm(layer)
        ? (ctx.cmLangs[layer] || []).map(function (l) { return ctx.sec[F.cmLayer(layer, l)]; })
        : [ctx.sec[layer]];
      docs.forEach(function (doc) {
        if (!doc) return;
        const one = new Map();
        doc.chapters.forEach(function (ch) {
          ch.notes.forEach(function (n) { const k = F.noteKey(n); one.set(k, (one.get(k) || 0) + 1); });
        });
        one.forEach(function (n, k) { m.set(k, Math.max(m.get(k) || 0, n)); });
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
  /* Everything on the page that stands for verse `v`, to light: its pieces
     of text and its numbers side by side, its row interlinear. */
  const lit = function (v) { return '.vs' + pick(v) + ', .sc-n' + pick(v) + ', .row.law:not(.vpanel)' + pick(v); };
  const same = function (a, b) { return !!a && !!b && a.sec === b.sec && a.key === b.key; };

  /* A piece of a verse's text, as scroll.js makes it. */
  function scrollPiece(v, el) {
    el._ctx = v.ctx;
    if (findChange(v.ctx.branch, colLayer(v.ctx, v.col), 'law', v.key)) el.classList.add('branched');
    if (TR.bookmarks.has(v.sec, v.key)) el.classList.add('marked');
    if (same(v, chosen)) el.classList.add('sel');
  }

  /* Has verse `v` commentary, Noahide Digest, review notes, commentators or MT links, or a
     change to them (the drafts' or the branch's)? */
  function annotated(v) {
    return ANN.some(function (layer) {
      return noteCounts(v.ctx, layer).get(v.key) || touched(v.ctx.changes, layer, v.key) || touched(v.ctx.branch, layer, v.key);
    });
  }

  /* ------------------------------------------------------------- aliyot */

  /* A reading's aliyot, shown where each begins, in a strip down the outer
     edge of the text: interlinear, a column of the rows that begin one
     (verseRow); side by side, a column of each row of the columns, each
     badge level with the line its verse starts on (placeAliyot). */
  const ALIYAH = ['Rishon', 'Sheni', 'Shlishi', 'Revi\'i', 'Chamishi', 'Shishi', 'Shevi\'i'];

  function aliyahBadge(a) {
    const name = a.n === 'M' ? 'Maftir' : 'Aliyah ' + a.n + (ALIYAH[a.n - 1] ? ' (' + ALIYAH[a.n - 1] + ')' : '');
    return UI.el('span.al' + (a.n === 'M' ? '.al-m' : ''), {
      title: name + ', from ' + a.key, 'aria-label': name, text: a.n === 'M' ? 'M' : String(a.n)
    });
  }

  /* Side by side: each aliyah's badge in its row's strip, level with the
     line its verse starts on in the column beside the strip. */
  function placeAliyot() {
    if (!live || !live.verses || !live.verses.aliyot.size || !document.body.contains(live.grid)) return;
    live.grid.querySelectorAll('.par-row').forEach(function (row) {
      const strip = row.querySelector(':scope > .al-strip');
      if (!strip) return;
      const cols = Array.from(row.querySelectorAll(':scope > .scroll'));
      const near = cols.sort(function (a, b) { return b.getBoundingClientRect().right - a.getBoundingClientRect().right; })[0];
      const top0 = strip.getBoundingClientRect().top;
      const out = [];
      near.querySelectorAll('.vs.first').forEach(function (vs) {
        const al = live.verses.aliyot.get(vs.getAttribute('data-sec') + ' ' + vs.getAttribute('data-key'));
        const r = vs.getClientRects()[0];
        if (!al || !r) return;
        out.push(UI.el('div.al-row', { style: 'top:' + Math.round(r.top - top0) + 'px;height:' + Math.round(r.height) + 'px' }, al.map(aliyahBadge)));
      });
      UI.fill(strip, out);
    });
  }

  /* Whether verse `key` has notes, for its numbers in either layout: `cls`
     is 'noted' if it has commentary, Noahide Digest, review notes, commentators or MT links
     or a change to them, with 'changed' when this device has changed them or
     'branched' when the branch has (else ''); `said`, how many of each. */
  function noteState(ctx, key) {
    const said = [];
    let noted = false, mine = false, up = false;
    ANN.forEach(function (layer) {
      const n = noteCounts(ctx, layer).get(key) || 0;
      if (n) { said.push(countText(layer, n)); noted = true; }
      if (touched(ctx.changes, layer, key)) mine = true;
      else if (touched(ctx.branch, layer, key)) up = true;
    });
    if (!noted && !mine && !up) return { cls: '', said: said };
    return { cls: 'noted' + (mine ? ' changed' : up ? ' branched' : ''), said: said };
  }

  /* A verse's number in the margin, marked when it has notes (noteState).
     `lang` is the margin's: 'en' numbers in figures. */
  function verseNumber(v, lang) {
    const ctx = v.ctx;
    const st = noteState(ctx, v.key);
    const name = ctx.title + ' ' + v.key + (st.said.length ? ' · ' + st.said.join(', ') : '');
    /* Side by side, the English's numbers are its own verses; choosing one
       chooses the verse, which is the Hebrew's. */
    const b = UI.el('button.sc-n' + (v.chapterStart ? '.ch' : '') + (lang === 'en' ? '.en' : ''), {
      type: 'button', 'data-sec': v.sec, 'data-key': v.key, title: name, 'aria-label': name,
      onclick: function () {
        const h = live.verses.byKey.get(v.sec + ' ' + v.key) || v;
        choose(same(h, chosen) ? null : h, true);
      }
    }, [UI.el('span', { text: TR.scroll.numeral(v, lang) })]);
    st.cls.split(' ').filter(Boolean).forEach(function (c) { b.classList.add(c); });
    if (TR.bookmarks.has(v.sec, v.key)) b.classList.add('marked');
    if (same(v, chosen)) b.classList.add('sel');
    return b;
  }

  function placeNumbers() {
    if (!live || !live.verses || !document.body.contains(live.grid)) return;
    live.verses.boxes.forEach(function (b) {
      TR.scroll.numbers(b.text, b.margin, b.verses, function (v) { return verseNumber(v, b.col === 'en' ? 'en' : 'he'); });
    });
  }

  /* The chosen verse's commentary, Noahide Digest, review notes, commentators and MT links,
     in the pane along the bottom or a side (paneEl). It is a verse row like the
     interlinear ones, so editing in it, and keeping an editor open across a
     repaint (holdRow), work the same. */
  function versePanel() {
    const s = live.verses;
    return paneEl(chosen && s.byKey.get(chosen.sec + ' ' + chosen.key), s);
  }

  /* The verse's name, linking to it in its chapter. */
  function verseRef(v) {
    const ctx = v.ctx;
    return UI.el('a.vp-ref', { href: verseHref(ctx, v.key), title: 'This verse in its chapter' }, [
      UI.el('strong', { text: ctx.title + ' ' + v.key }),
      ctx.meta.he ? UI.el('span.vp-he', { lang: 'he', dir: 'rtl', text: ctx.meta.he + ' ' + F.numToHeb(v.c) + ',' + F.numToHeb(v.n) }) : null
    ]);
  }

  /* To the previous or next verse; `noted`, to the next with notes. */
  function stepBtn(s, v, d, noted) {
    let to = null;
    for (let i = s.order.indexOf(v) + d; i >= 0 && i < s.order.length; i += d) {
      if (!noted || annotated(s.order[i])) { to = s.order[i]; break; }
    }
    const label = noted ? (d < 0 ? 'Previous verse with notes' : 'Next verse with notes')
      : (d < 0 ? 'Previous verse (k)' : 'Next verse (j)');
    return UI.el('button.iconbtn.vp-step', {
      type: 'button', disabled: !to, title: label, 'aria-label': label,
      onclick: function () { if (to) choose(to, true); }
    }, [(d < 0 ? TR.icons.up : TR.icons.down)()]);
  }

  function closeBtn() {
    return UI.el('button.iconbtn.vp-close', {
      type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', onclick: function () { choose(null); }
    }, [TR.icons.close()]);
  }

  function noneNote(boxes) {
    return ANN.some(function (layer) { return boxes[layer]._count; }) ? null
      : UI.el('p.vp-none', { text: 'No commentary, Noahide Digest, review notes, commentators or MT links on this verse yet.' });
  }

  /* In the pane's bar: add commentary, or a review note, to its verse. */
  function addBtn(ctx, key, layer) {
    const label = layer === 'notes' ? 'Add a review note' : 'Add commentary';
    return UI.el('button.iconbtn.vp-add.add-' + layer, {
      type: 'button', title: label, 'aria-label': label,
      onclick: function () { addNote(ctx, key, layer, ''); }
    }, [(layer === 'notes' ? TR.icons.noteAdd : TR.icons.commentAdd)()]);
  }

  /* ---------------------------------------------------------------- pane */

  /* In either layout, the chosen verse's notes are in a pane fixed along the
     bottom of the screen, the full width of it, or down its left or right
     side (the Display menu's choice), the texts being on the page. It is
     always there: a bar naming the verse and how many notes it has, which
     opens and closes the pane, and when open the notes, as high (or wide) as
     its inner edge has been dragged. Open or closed, the side and the size
     are device settings, so the pane stays as it was left whatever verse is
     chosen: one with no notes still shows, to bookmark it, or in edit mode to
     add one. A screen too narrow for a side pane has it at the bottom. */
  const PANE_MIN = 120, PANE_MIN_W = 260, PANE_SIDE_FROM = 900;
  const PANE_POS = {
    bottom: { label: 'Bottom', open: 'down', shut: 'up' },
    left: { label: 'Left', open: 'prev', shut: 'next' },
    right: { label: 'Right', open: 'next', shut: 'prev' }
  };
  let paneRO = null;

  /* Where the pane is: as chosen, if the screen is wide enough for it. */
  function panePos() {
    const p = TR.device.get('panePos');
    return PANE_POS[p] && (p === 'bottom' || window.innerWidth >= PANE_SIDE_FROM) ? p : 'bottom';
  }
  /* Its size across the screen: its height at the bottom, its width at a side. */
  function paneSize(side, n) {
    if (!side) {
      n = n || TR.device.get('paneHeight') || Math.round(window.innerHeight * 0.34);
      return Math.max(PANE_MIN, Math.min(n, Math.max(PANE_MIN, window.innerHeight - fixedTop() - 40)));
    }
    n = n || TR.device.get('paneWidth') || Math.min(440, Math.round(window.innerWidth * 0.3));
    return Math.max(PANE_MIN_W, Math.min(n, Math.round(window.innerWidth * 0.6)));
  }

  function paneEl(v, s) {
    const open = !!TR.device.get('paneOpen');
    const pos = panePos(), side = pos !== 'bottom';
    const dim = side ? 'width' : 'height';
    const ctx = v && v.ctx, key = v && v.key;
    const boxes = v ? noteBoxes(ctx, key) : null;
    const has = v ? ANN.filter(function (l) { return boxes[l]._count; }) : [];
    const said = has.map(function (l) { return countText(l, boxes[l]._count); });
    /* In the bar, the commentators are counted together, under one icon,
       where they stand among the layers. */
    const shown = [];
    has.forEach(function (l) {
      if (!isCm(l)) { shown.push({ cls: markCls(l), icon: annIcon(l), n: boxes[l]._count }); return; }
      const all = shown.find(function (x) { return x.cm; });
      if (all) all.n += boxes[l]._count;
      else shown.push({ cm: true, cls: 'span.mk-cm', icon: TR.icons.commentators(), n: boxes[l]._count });
    });

    const toggle = UI.el('button.iconbtn.pane-toggle', { type: 'button', onclick: function () { setOpen(!el.classList.contains('open-pane')); } });
    const grip = UI.el('div.pane-grip', {
      role: 'separator', tabindex: '0', 'aria-orientation': side ? 'vertical' : 'horizontal',
      'aria-label': (side ? 'Width' : 'Height') + ' of the notes pane', title: 'Drag to resize'
    });
    const bar = UI.el('div.pane-bar', [
      toggle,
      v ? verseRef(v) : UI.el('span.pane-hint', { text: 'Notes · no verse selected' }),
      /* Each layer's count with its icon, as the margin markers have them. */
      v ? (has.length
        ? UI.el('span.pane-count', { title: said.join(' · '), 'aria-label': said.join(', ') }, shown.map(function (x) {
          return UI.el(x.cls, { 'aria-hidden': 'true' }, [x.icon, UI.el('span', { text: String(x.n) })]);
        }))
        : UI.el('span.pane-count.none', { text: 'No notes' })) : null,
      v ? UI.el('div.vp-tools', [
        addBtn(ctx, key, 'co'), addBtn(ctx, key, 'notes'),
        stepBtn(s, v, -1, true), stepBtn(s, v, 1, true),
        bookmarkBtn(ctx, key),
        closeBtn()
      ]) : null
    ]);
    /* The bar's own background opens and closes it too. The path, not
       e.target.closest: the toggle swaps its icon as it is clicked, leaving
       the target out of the document by the time the click gets here. */
    bar.addEventListener('click', function (e) {
      const onControl = e.composedPath().some(function (n) { return n.matches && n.matches('a, button'); });
      if (!onControl) setOpen(!el.classList.contains('open-pane'));
    });
    const body = UI.el('div.pane-body', v ? [annBlock(boxes), noneNote(boxes)] : [
      UI.el('p.vp-hint', { text: 'Select a verse to see its commentary, Noahide Digest, review notes, commentators and MT links here, or to bookmark it.' })
    ]);

    const el = UI.el('aside.vpanel.pane.at-' + pos + (v ? '.row.law.open' : ''), v ? { 'data-key': key, 'data-sec': ctx.id } : {},
      [grip, bar, body]);
    if (v) {
      el.id = 'vp-' + rowId(ctx, key);
      el._ctx = ctx;
    }

    function setOpen(o) {
      TR.device.set({ paneOpen: o });
      el.classList.toggle('open-pane', o);
      el.style[dim] = o ? paneSize(side) + 'px' : '';
      toggle.setAttribute('aria-expanded', o ? 'true' : 'false');
      const label = o ? 'Hide the notes' : 'Show the notes';
      toggle.title = label;
      toggle.setAttribute('aria-label', label);
      UI.fill(toggle, [TR.icons[PANE_POS[pos][o ? 'open' : 'shut']]()]);
    }
    setOpen(open);

    /* Dragging the inner edge sets the size; so do the arrow keys on it. */
    const resize = function (n) {
      n = paneSize(side, n);
      el.style[dim] = n + 'px';
      return n;
    };
    const save = function (n) { TR.device.set(side ? { paneWidth: n } : { paneHeight: n }); };
    const size = function () { return side ? el.offsetWidth : el.offsetHeight; };
    /* How far a move grows the pane: up from the bottom, inward from a side. */
    const grow = function (dx, dy) { return pos === 'left' ? dx : pos === 'right' ? -dx : -dy; };
    grip.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const x0 = e.clientX, y0 = e.clientY, n0 = size();
      const move = function (ev) { resize(n0 + grow(ev.clientX - x0, ev.clientY - y0)); };
      const end = function () {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        el.classList.remove('dragging');
        save(size());
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });
    grip.addEventListener('keydown', function (e) {
      const k = { ArrowUp: [0, -32], ArrowDown: [0, 32], ArrowLeft: [-32, 0], ArrowRight: [32, 0] }[e.key];
      const d = k ? grow(k[0], k[1]) : 0;
      if (!d) return;
      e.preventDefault();
      save(resize(size() + d));
    });
    return el;
  }

  /* At the bottom, the page leaves room at its foot for the pane, however
     high it is, so the text scrolls clear of it. At a side the pane lies
     over the text, which keeps its width. */
  function watchPane(el) {
    if (paneRO) paneRO.disconnect();
    const pos = panePos();
    Object.keys(PANE_POS).forEach(function (p) { document.body.classList.toggle('pane-' + p, p === pos); });
    if (pos !== 'bottom') return;
    const set = function () { document.documentElement.style.setProperty('--pane-space', el.offsetHeight + 'px'); };
    set();
    if (window.ResizeObserver) {
      paneRO = new ResizeObserver(set);
      paneRO.observe(el);
    }
  }
  window.addEventListener('resize', TR.debounce(function () {
    const el = document.querySelector('.screen.on .vpanel.pane');
    if (!el) return;
    /* Narrowed past where a side pane fits, or widened back: it moves. */
    if (!el.classList.contains('at-' + panePos())) {
      choose(chosen && live && live.verses && live.verses.byKey.get(chosen.sec + ' ' + chosen.key) || null, false);
      return;
    }
    if (!el.classList.contains('open-pane')) return;
    const side = !el.classList.contains('at-bottom');
    el.style[side ? 'width' : 'height'] = paneSize(side) + 'px';
  }, 150));

  /* Open verse `v` (or nothing) in the panel. `reveal` scrolls the text to
     it if it is out of sight; `force` opens the pane, side by side, for a
     verse with no notes yet (one is about to be added). */
  function choose(v, reveal, force) {
    if (!live || !live.verses) return Promise.resolve();
    return TR.editor.close().then(function () {
      if (live && live.verses) show(v, reveal, force);
    });
  }

  /* The same, at once: for painting the page, which must leave an open
     editor be (holdRow). */
  function show(v, reveal, force) {
    chosen = v ? { page: live.page, sec: v.sec, key: v.key } : null;
    /* A note about to be added from the selection needs the pane open. */
    if (v && force) TR.device.set({ paneOpen: true });
    live.grid.querySelectorAll('.sel').forEach(function (el) { el.classList.remove('sel'); });
    if (chosen) live.grid.querySelectorAll(lit(chosen)).forEach(function (el) { el.classList.add('sel'); });
    const next = versePanel();
    live.verses.panel.replaceWith(next);
    live.verses.panel = next;
    watchPane(next);
    live.grid.classList.toggle('chosen', !!chosen);
    if (reveal && v) {
      /* Into view if it is under the headers, or under the pane at the
         bottom. */
      const first = document.getElementById(v.id);
      const r = first && first.getBoundingClientRect();
      const bottom = next.classList.contains('at-bottom') ? next.getBoundingClientRect().top : window.innerHeight;
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

  /* The page's passages side by side, into `main`, their verses into `s`.
     Commentary that belongs to no verse (a book's introduction, a chapter's
     remarks) stands above the passage, as the interlinear's does, opened by
     its marker.

     Each passage is two scrolls: the Hebrew, at its side, and the text
     beside it, in rows that end wherever both break fully after the same
     verse (scroll.js sync()); or the Hebrew alone. The verses chosen and
     looked up (s.order, s.byKey) are the Hebrew's; the other column's pieces
     name the same verses, so choosing or hovering one is choosing or
     hovering both. */
  function scrollBody(page, main, s) {
    page.passages.forEach(function (p) {
      if (p.title) main.appendChild(passageHead(p.title, p.sub));
      if (p.opening) UI.append(main, generalRow(coGeneral(p.ctx.sec.co), 'Commentary on ' + p.ctx.title));
      for (let c = p.from.c; c <= p.to.c; c++) {
        if (c === p.from.c && p.from.v > 1) continue;
        UI.append(main, generalRow(coChapter(p.ctx.sec.co, c), 'Commentary on ' + p.ctx.title + ' ' + c));
      }
      const verses = scrollVerses(p.ctx, p.from, p.to, 'he');
      verses.forEach(function (v) { s.order.push(v); s.byKey.set(v.sec + ' ' + v.key, v); });
      const col = beside(p.ctx);
      /* With aliyot to show, each row has a strip for them (placeAliyot). */
      const strip = function () { return s.aliyot.size ? UI.el('div.al-strip') : null; };
      if (col === 'none') {
        const he = scrollColumn(verses, 'he', true);
        s.boxes.push(he.box);
        main.appendChild(UI.el('div.par.solo', [UI.el('div.par-row', [he.el, strip()])]));
        return;
      }
      /* A row for each stretch between the sections both texts share, so
         the columns start level again at each. */
      main.appendChild(UI.el('div.par', TR.scroll.sync(verses, scrollVerses(p.ctx, p.from, p.to, col)).map(function (r) {
        const he = scrollColumn(r[0], 'he', true), other = scrollColumn(r[1], col, false);
        s.boxes.push(he.box, other.box);
        return UI.el('div.par-row', [he.el, other.el, strip()]);
      })));
    });
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
             passages: [{ ctx, from, to, title?, sub?, opening? }], target,
             aliyot?: [{ n, sec, key }] (a Torah reading's, lib.aliyot()) } */
  function render(host, page, up) {
    /* Side by side, the texts are set by their sections; interlinear, a row
       per verse. Either way the chosen verse's notes are in the pane. */
    const parallel = layout() === 'parallel';
    const grid = UI.el('div.grid' + (page.targum ? '.has-tg' : '') + '.mode-' + heMode() +
      (parallel ? '.parmode' : '.linemode'));
    const held = holdRow(host, page.key);
    const ctxs = [];
    page.passages.forEach(function (p) { if (ctxs.indexOf(p.ctx) < 0) ctxs.push(p.ctx); });
    if (live && live.ro) live.ro.disconnect();

    const head = UI.el('header.rhead', [
      UI.el('div.rbar', [page.head, UI.el('div.toggles', [
        layoutToggle(), displayMenu(page), marksToggle() ? UI.el('div.segs', [marksToggle()]) : null
      ])])
    ]);
    const notes = UI.el('div.rnotes', [TR.session.active() ? TR.session.line() : null, branchNote(ctxs, up)]);
    if (page.tabs) notes.insertBefore(page.tabs, notes.firstChild);

    /* The page's verses, in order and by "sec key", and the pane; and the
       aliyot beginning at each verse, by "sec key". */
    const s = { order: [], byKey: new Map(), boxes: [], panel: UI.el('aside.vpanel'), aliyot: new Map() };
    (page.aliyot || []).forEach(function (a) {
      const k = a.sec + ' ' + a.key;
      if (!s.aliyot.has(k)) s.aliyot.set(k, []);
      s.aliyot.get(k).push(a);
    });
    if (s.aliyot.size) grid.classList.add('has-aliyot');
    if (parallel) {
      const main = UI.el('div.sc-main');
      scrollBody(page, main, s);
      grid.appendChild(main);
      hoverVerses(grid);
    } else {
      page.passages.forEach(function (p) {
        if (p.title) grid.appendChild(passageHead(p.title, p.sub));
        if (p.opening) UI.append(grid, generalRow(coGeneral(p.ctx.sec.co), 'Commentary on ' + p.ctx.title));
        passageRows(p.ctx, p.from, p.to, grid, s);
      });
    }
    grid.appendChild(s.panel);
    /* The pane keeps its verse across repaints of the page; a verse linked
       to opens in it when it is arrived at, not at every repaint after (a
       note saved, a setting changed). */
    const target = page.target && s.order.find(function (v) { return v.id === page.target.id; });
    const arrived = host.getAttribute('data-hash') !== location.hash;
    host.setAttribute('data-hash', location.hash);
    if (target && arrived) chosen = { page: page.key, sec: target.sec, key: target.key };
    else if (!chosen || chosen.page !== page.key || !s.byKey.has(chosen.sec + ' ' + chosen.key)) chosen = null;
    applyCols(grid);

    /* Choosing a verse: its text side by side, its row interlinear (not
       the pane, which is a verse row too). */
    grid.addEventListener('click', function (e) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;   // selecting, not clicking
      if (e.target.closest('a, button, .editor')) return;
      const at = e.target.closest('.vs, .row.law:not(.vpanel)');
      if (at) {
        const v = live.verses.byKey.get(at.getAttribute('data-sec') + ' ' + at.getAttribute('data-key'));
        choose(same(v, chosen) ? null : v, parallel);
      }
    });

    nav = page.nav;
    live = { grid: grid, page: page.key, verses: s, ro: null };
    show(chosen && s.byKey.get(chosen.sec + ' ' + chosen.key), false);
    hideSel();
    UI.crumbs(page.crumbs);
    UI.fill(host, [head, notes, grid, UI.el('footer.rfoot', [page.foot])]);
    document.body.classList.add('paned');
    if (held) {
      putBack(grid, held);
      live.verses.panel = grid.querySelector('.vpanel');
      watchPane(live.verses.panel);
    }
    fitHead(head);
    document.title = page.docTitle + ' — Tanakh Reader';

    /* The numbers margin follows the text wherever it reflows: a resize, the
       fonts arriving, the pane opening. */
    if (parallel) {
      placeNumbers();
      placeAliyot();
      if (window.ResizeObserver) {
        live.ro = new ResizeObserver(function () { requestAnimationFrame(function () { placeNumbers(); placeAliyot(); }); });
        s.boxes.forEach(function (b) { live.ro.observe(b.text); });
      }
      if (document.fonts) document.fonts.ready.then(function () { placeNumbers(); placeAliyot(); });
    }

    /* A new chapter or portion starts at its top; a repaint of the same one
       (a column toggled, a note saved) stays where it was. */
    const where = page.docTitle;
    if (host.getAttribute('data-at') !== where && !(page.target && arrived)) window.scrollTo(0, 0);
    host.setAttribute('data-at', where);

    if (page.target) {
      const el = document.getElementById(page.target.id);
      if (el) {
        const all = parallel ? Array.from(grid.querySelectorAll('.vs' + pick(chosen))) : [el];
        all.forEach(function (x) {
          x.classList.add('target');
          if (page.target.q && TR.search) TR.search.highlight(x, page.target.q, page.target.whole);
        });
        if (arrived) el.scrollIntoView({ block: 'center' });
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
      const rows = Array.from(live.grid.querySelectorAll(layout() === 'parallel' ? '.vs.first[id]' : '.row.law:not(.vpanel)'));
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
          const ctx = bookCtx(raw, meta, up && up.changes[id]);
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

  /* The portions before and after `p`: the holiday readings in their order;
     the parashot in theirs, a double's being those around both its parts. */
  function portionNeighbours(ix, p) {
    const href = function (q) { return q ? UI.href('portion', [q.id]) : null; };
    if (/^r/.test(p.id)) {
      const i = ix.readings.indexOf(p);
      return { prev: href(ix.readings[i - 1]), next: href(ix.readings[i + 1]) };
    }
    const first = p.parts ? p.parts[0] : p, last = p.parts ? p.parts[1] : p;
    return { prev: href(ix.parashot[ix.parashot.indexOf(first) - 1]), next: href(ix.parashot[ix.parashot.indexOf(last) + 1]) };
  }

  /* Previous/next parashah (or holiday reading); in the header, its name,
     which opens the tables of contents. */
  function portionPager(ix, p, part, withNav) {
    const holiday = /^r/.test(p.id);
    const n = portionNeighbours(ix, p);
    const middle = withNav ? navPop('Books, parashot and holidays', p.en, 'contents', function () {
      return contentsNav(ix, holiday ? 'holidays' : 'parashot', p.id);
    }) : null;
    return pagerLinks(n.prev, n.next, middle,
      holiday ? ['Previous reading', 'Next reading'] : ['Previous parashah', 'Next parashah']);
  }

  /* Above a portion: its parts as tabs, and on a holiday's Torah reading
     the switch between its weekday and Shabbat aliyot (daySwitch). */
  function portionTabs(p, parts, part, day) {
    const tabs = parts.length < 2 ? null : UI.el('nav.ptabs', { 'aria-label': 'Part' }, parts.map(function (x) {
      return UI.el('a.ptab', {
        href: UI.href('portion', x.part === 'torah' ? [p.id] : [p.id, x.part]), text: x.label,
        'aria-current': x.part === part.part ? 'page' : null
      });
    }));
    return tabs || day ? UI.el('div.ptabrow', [tabs, day]) : null;
  }

  /* A holiday's aliyot on a weekday or on Shabbat (a device setting, so it
     holds from one reading to the next). Where a reading has no division of
     its own for Shabbat, the switch says why: it never falls on Shabbat, it
     always does, or it is divided the same either day. */
  function daySwitch(entry) {
    const shabbat = readingDay() === 'shabbat';
    const why = entry.shabbat ? null
      : entry.on === 'weekday' ? 'This reading never falls on Shabbat.'
      : entry.on === 'shabbat' ? 'This reading is always on Shabbat.'
      : 'This reading is divided the same way on a weekday and on Shabbat.';
    const btn = function (day, label) {
      const on = entry.shabbat ? (day === 'shabbat') === shabbat : !entry.on || entry.on === day;
      return UI.el('button.seg', {
        type: 'button', text: label, 'aria-pressed': on ? 'true' : 'false',
        disabled: !entry.shabbat, title: why || 'The aliyot as they are read on ' + (day === 'shabbat' ? 'Shabbat' : 'a weekday'),
        onclick: function () {
          if (!entry.shabbat || (day === 'shabbat') === shabbat) return;
          TR.device.set({ readingDay: day });
          UI.refresh();
        }
      });
    };
    return UI.el('div.daysw', [
      UI.el('span.daysw-label', { text: 'Aliyot' }),
      UI.el('div.segs', { role: 'group', 'aria-label': 'Aliyot on a weekday or on Shabbat', title: why || null },
        [btn('weekday', 'Weekday'), btn('shabbat', 'Shabbat')])
    ]);
  }

  function readingDay() {
    return TR.device.get('readingDay') === 'shabbat' ? 'shabbat' : 'weekday';
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
        return lib.aliyot().then(function (all) {
          if (mine !== seq) return;
          const holiday = /^r/.test(p.id);
          /* The Torah reading's aliyot, marked in their strip; a haftarah has
             none. A holiday's are its weekday or Shabbat division, as chosen;
             on Shabbat a reading may begin earlier (Passover's last day,
             Shavu'ot's second, from Deuteronomy 14:22), and runs from there. */
          const entry = part.part === 'torah' ? all.get(p.id) : null;
          const onShabbat = !!(entry && entry.shabbat && readingDay() === 'shabbat');
          const aliyot = !entry ? [] : onShabbat ? entry.shabbat : entry.aliyot;
          const ranges = part.ranges.map(function (r) { return Object.assign({}, r); });
          const first = aliyot[0];
          if (first && first.sec === ranges[0].book) {
            const f = at(first.key), r0 = at(ranges[0].from);
            if (f.c < r0.c || (f.c === r0.c && f.v < r0.v)) ranges[0].from = first.key;
          }
          const books = [];
          ranges.forEach(function (r) { if (books.indexOf(r.book) < 0) books.push(r.book); });
          return Promise.all(books.map(lib.section)).then(function (raws) {
            if (mine !== seq) return;
            return branchChanges(raws).then(function (up) {
              if (mine !== seq) return;
              const ctxs = {};
              raws.forEach(function (raw) { ctxs[raw.id] = bookCtx(raw, ix.byId.get(raw.id), up && up.changes[raw.id]); });
              const v = args[2] ? args[2].split('-') : null;   // a verse to go to: book-c-v
              render(host, {
                key: key,
                crumbs: [{ text: holiday ? 'Holidays' : 'Parashot', href: UI.href('parashot', holiday ? ['holidays'] : []) },
                  { text: p.en + (part.part === 'torah' ? '' : ' · ' + part.label) }],
                docTitle: p.en + (part.part === 'torah' ? '' : ' · ' + part.label),
                head: portionPager(ix, p, part, true),
                foot: portionPager(ix, p, part, false),
                tabs: portionTabs(p, parts, part, holiday && entry ? daySwitch(entry) : null),
                nav: portionNeighbours(ix, p),
                targum: ranges.some(function (r) { return !!ctxs[r.book].sec.tg; }),
                /* The first passage is headed with the portion's name, each
                   one with where it is. */
                passages: ranges.map(function (r, n) {
                  return {
                    ctx: ctxs[r.book], from: at(r.from), to: at(r.to),
                    title: n ? rangeName(ix, r) : (part.part === 'torah' ? '' : part.label + ' · ') + p.en,
                    sub: n ? null : p.he + ' · ' + rangeName(ix, r)
                  };
                }),
                target: v && v.length === 3 ? { id: 'v-' + v[0] + '-' + v[1] + '-' + v[2] } : null,
                aliyot: aliyot
              }, up);
            });
          });
        });
      }).catch(function (e) { failed(host, mine, e); });
    }
  });

  /* ← and → turn chapters or portions, when the reader is open and nothing
     is being typed. j and k move the pane to the next and previous verse,
     and Esc closes it. */
  document.addEventListener('keydown', function (e) {
    if (!onReader() || !nav || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (live && live.verses && (e.key === 'j' || e.key === 'k')) {
      const s = live.verses;
      const at = chosen ? s.order.indexOf(s.byKey.get(chosen.sec + ' ' + chosen.key)) : -1;
      const to = at < 0 ? s.order[0] : s.order[at + (e.key === 'j' ? 1 : -1)];
      if (to) choose(to, true);
      return;
    }
    if (live && live.verses && e.key === 'Escape' && chosen && !e.defaultPrevented && !TR.editor.active()) { choose(null); return; }
    const href = e.key === 'ArrowLeft' ? nav.prev : e.key === 'ArrowRight' ? nav.next : null;
    if (href) { e.preventDefault(); location.hash = href; }
  });

})(window.TR);
