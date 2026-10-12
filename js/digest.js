/* The Noahide Digest: comments chosen from the commentators, gathered as a
   commentary of their own (Digest/{book}-digest.md, the 'digest' layer),
   edited as the commentary is, in drafts submitted as pull requests.

   CHOOSING. In the notes pane each of a commentator's comments has a star
   (reader.js cmCell): it copies the comment into the digest, on the same
   verse, or takes it out again. An entry is the comment's text, as it then
   stood, after a tag naming where it came from:

     [^1.4.1]: {ramban-en 1.4.2} **AND G-D SAW THE LIGHT, THAT IT WAS GOOD.** …

   the commentator's layer (F.cmLayer) and the comment's label there. The tag
   is how an entry is attributed and how the star knows its comment is in;
   the copy keeps the digest whole if a commentator's files are rebuilt, and
   lets an entry be trimmed (its pencil, like any note). A note with no tag
   is a note of one's own, and shows as one.

   READING. #/digest/<book>/<commentators> is the digest alone, in one
   stream: each verse that has entries, with its English, then its entries,
   each under the name of the commentator it is from. <book> is a book's id
   or 'all'; <commentators> is 'all' or their ids joined with '.', to show
   only theirs ('own' standing for notes of one's own). */

(function (TR) {
  'use strict';

  const UI = TR.ui;
  const F = TR.format;
  const E = TR.edit;
  const lib = TR.lib;
  const LAYER = 'digest';
  const TAG = /^\{([a-z][a-z0-9]*)-(he|en) (\d+\.\d+\.\d+)\}\s*/;

  /* An entry's source, or null for a note of one's own:
     { cm, lang, label, text } (text: the rest of its first paragraph). */
  function source(n) {
    const m = TAG.exec(n.text || '');
    return m ? { cm: m[1], lang: m[2], label: m[3], text: n.text.slice(m[0].length) } : null;
  }

  const tagOf = function (cmLayer, label) { return '{' + cmLayer + ' ' + label + '}'; };

  /* The label of the entry on verse `key` that holds comment `label` of
     layer `cmLayer`, or null. */
  function entryFor(doc, key, cmLayer, label) {
    const want = tagOf(cmLayer, label);
    const hit = lib.notesFor(doc, key).find(function (n) { return (n.text || '').indexOf(want) === 0; });
    return hit ? hit.label : null;
  }

  function commentator(id) {
    return lib.commentators.find(function (c) { return c.id === id; }) || null;
  }

  /* An entry as shown, in the pane and in the stream: who it is from, then
     the comment in its language. `paint(n, lang)` draws a note's text. */
  function content(n, paint) {
    const s = source(n);
    if (!s) return [UI.el('div.dg-src.own', [UI.el('span', { text: 'Note' })]), paint(n, 'en')];
    const c = commentator(s.cm);
    return [
      UI.el('div.dg-src', { title: c && c.full ? c.full : null }, [
        TR.icons.commentators(),
        UI.el('span.dg-name', { text: c ? c.en : s.cm }),
        c && c.he ? UI.el('span.dg-he', { lang: 'he', dir: 'rtl', text: c.he }) : null,
        UI.el('span.dg-lang', { text: s.lang === 'he' ? 'Hebrew' : 'English' })
      ]),
      UI.el('div.dg-body', s.lang === 'he' ? { lang: 'he', dir: 'rtl' } : null,
        paint(Object.assign({}, n, { text: s.text }), s.lang))
    ];
  }

  /* Put comment `n` of `cmLayer` (on verse `key` of book `id`) into the
     digest, or take it out if it is in. → Promise<true if now in>. */
  function toggle(id, key, cmLayer, n) {
    let added = false;
    return TR.editor.close().then(function () {
      return lib.edit(id, LAYER, function (doc, sec) {
        const at = doc && entryFor(doc, key, cmLayer, n.label);
        if (at) return E.setNote(doc, LAYER, at, '');
        added = true;
        return E.addNote(doc, LAYER, key, tagOf(cmLayer, n.label) + ' ' + E.noteBody(n), sec.en);
      });
    }).then(function () {
      UI.toast(added ? 'Added to the Noahide Digest.' : 'Taken out of the Noahide Digest.');
      return added;
    });
  }

  /* Take entry `label` out of book `id`'s digest. */
  function remove(id, label) {
    return TR.editor.close().then(function () {
      return lib.edit(id, LAYER, function (doc) { return E.setNote(doc, LAYER, label, ''); });
    });
  }

  TR.digest = { source: source, entryFor: entryFor, content: content, toggle: toggle };

  /* -------------------------------------------------------------- stream */

  let seq = 0;

  /* The digest of every book that has one, in reading order:
     [{ meta, doc }]. */
  function load(ix, only) {
    const books = ix.order.filter(function (m) { return only === 'all' || m.id === only || m.book.id === only; });
    return Promise.all(books.map(function (m) {
      return lib.layer(m.id, LAYER).then(function (doc) { return { meta: m, doc: doc }; });
    })).then(function (all) {
      return all.filter(function (b) { return b.doc && b.doc.chapters.some(function (ch) { return ch.notes.length; }); });
    });
  }

  /* A note's text, as the reader draws one. */
  function paint(n, lang) {
    return [TR.md.para(n.text, lang === 'he' ? 'p.he' : 'p')].concat((n.more || []).map(function (b) {
      return TR.md.para(b, lang === 'he' ? 'p.he' : 'p');
    }));
  }

  const hrefFor = function (book, cms) { return UI.href('digest', [book, cms.length ? cms.join('.') : 'all']); };

  function render(host, args) {
    const mine = ++seq;
    const book = args[0] || 'all';
    const cms = !args[1] || args[1] === 'all' ? [] : args[1].split('.');
    if (!host.firstChild) UI.fill(host, UI.message('Loading…', null, 'loading'));
    lib.index().then(function (ix) {
      return load(ix, book).then(function (books) {
        /* Each book's English, for the verses that have entries. */
        return Promise.all(books.map(function (b) { return lib.layer(b.meta.id, 'en'); })).then(function (ens) {
          if (mine === seq) paintStream(host, ix, books, ens, book, cms);
        });
      });
    }).catch(function (e) {
      if (mine === seq) UI.fill(host, UI.message(e.message, UI.el('a.btn', { href: '#/settings', text: 'Settings' }), 'error'));
    });
  }

  function paintStream(host, ix, books, ens, book, cms) {
    const shown = function (n) {
      if (!cms.length) return true;
      const s = source(n);
      return cms.indexOf(s ? s.cm : 'own') >= 0;
    };
    /* Who the entries are from, for the chips: every commentator, and notes
       of one's own if there are any. */
    const from = new Map();
    books.forEach(function (b) {
      b.doc.chapters.forEach(function (ch) {
        ch.notes.forEach(function (n) {
          const s = source(n);
          const k = s ? s.cm : 'own';
          from.set(k, (from.get(k) || 0) + 1);
        });
      });
    });
    const chips = lib.commentators.map(function (c) { return { id: c.id, label: c.en }; })
      .concat(from.has('own') ? [{ id: 'own', label: 'My own notes' }] : [])
      .map(function (c) {
        const on = cms.indexOf(c.id) >= 0;
        const next = on ? cms.filter(function (x) { return x !== c.id; }) : cms.concat([c.id]);
        return UI.el('a.chip', { href: hrefFor(book, next), 'aria-pressed': on ? 'true' : 'false', role: 'button',
          text: c.label + (from.get(c.id) ? ' · ' + from.get(c.id) : '') });
      });

    const select = UI.el('select.input.book-sel', { 'aria-label': 'Books', onchange: function () { UI.go('digest', [select.value, cms.length ? cms.join('.') : 'all']); } },
      [UI.el('option', { value: 'all', text: 'All of Tanakh' })]);
    ix.books.forEach(function (d) {
      const g = UI.el('optgroup', { label: d.en });
      [{ id: d.id, en: 'All of the ' + d.en }].concat(d.sections).forEach(function (b) {
        g.appendChild(UI.el('option', { value: b.id, text: b.en, selected: b.id === book }));
      });
      select.appendChild(g);
    });

    let entries = 0;
    const sections = books.map(function (b, i) {
      const en = ens[i] ? F.lawMap(ens[i]) : new Map();
      const verses = [];
      b.doc.chapters.forEach(function (ch) {
        let cur = null;
        ch.notes.filter(shown).forEach(function (n) {
          const key = F.noteKey(n);
          if (!key) return;
          if (!cur || cur.key !== key) verses.push(cur = { key: key, c: n.c, h: n.h, notes: [] });
          cur.notes.push(n);
        });
      });
      if (!verses.length) return null;
      return UI.el('section.dg-book', [
        UI.el('h2.dg-book-name', [UI.el('span', { text: b.meta.en }), UI.el('span.dg-he', { lang: 'he', dir: 'rtl', text: b.meta.he })]),
        verses.map(function (v) {
          const law = en.get(v.key);
          return UI.el('article.dg-verse', [
            UI.el('a.dg-ref', { href: UI.href('read', [b.meta.id, v.c, v.h]), text: b.meta.en + ' ' + v.key, title: 'This verse in its chapter' }),
            law ? UI.el('p.dg-text', { text: plainVerse(law.text) }) : null,
            v.notes.map(function (n) {
              entries++;
              return UI.el('div.note.digest', [
                UI.el('button.iconbtn.dg-x', {
                  type: 'button', title: 'Take this out of the Noahide Digest', 'aria-label': 'Take this out of the Noahide Digest',
                  onclick: function () {
                    remove(b.meta.id, n.label).catch(function (e) { UI.toast(e.message); });   // the drafts event repaints
                  }
                }, [TR.icons.close()])
              ].concat(content(n, paint)));
            })
          ]);
        })
      ]);
    }).filter(Boolean);

    UI.fill(host, [
      UI.el('h1.page-title', [TR.icons.digest(), UI.el('span', { text: 'Noahide Digest' })]),
      UI.el('p.page-note', { text: 'Comments chosen from the commentators, each under the name of the one it is from. ' +
        'In the reader, the star beside a commentator\'s comment in the notes pane puts it here, or takes it out.' }),
      UI.el('div.search-opts.dg-opts', [UI.el('div.coltoggles', chips), select]),
      sections.length
        ? UI.el('p.hit-count', { text: entries + (entries === 1 ? ' entry' : ' entries') })
        : UI.message(books.length ? 'Nothing here from the commentators chosen.' : 'Nothing in the Noahide Digest yet' +
          (book === 'all' ? '.' : ' in this book.') + ' Read a commentator in the notes pane and star the comments that belong here.'),
      sections
    ]);
  }

  /* A verse's English as plain text: its section marks ({P} {S} {N}) and
     line breaks dropped. */
  function plainVerse(t) {
    return String(t || '').replace(/\{[PSN]\}/g, '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  UI.route('digest', { refresh: render });
  TR.bus.on('drafts', function () { if (UI.current().id === 'digest') UI.refresh(); });

})(window.TR);
