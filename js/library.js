/* The texts as the screens want them: the index, and a book's layers
   parsed and ready to line up.

   A "section" here is a book: up to seven files — Hebrew with cantillation,
   Mechon Mamre's punctuated Hebrew, Onqelos pointed and unpointed (the
   Torah only), English, commentary, review notes — fetched together and
   parsed with format.js. A missing file is null, not an error: most books
   have no commentary yet. Parsed books are kept for the session and
   forgotten whenever the source changes.

   Drafts are applied here, so every screen (and search) sees the text as
   edited. Edits go through lib.edit, which keeps the section in memory and
   the draft in step. */

(function (TR) {
  'use strict';

  const F = TR.format;
  let indexP = null;
  let aliyotP = null;
  const sections = new Map();   // id → Promise<section> (see section())

  function noIndex() {
    const e = new Error('This branch has no index.json, so it is not in the reader\'s format yet. ' +
      'It may predate the format migration, or not be a branch of the texts at all; choose another branch ' +
      '(main has it) in Settings.');
    e.code = 'noindex';
    return e;
  }

  let queue = Promise.resolve();   // edits, one after another
  const LAYERS = F.LAYERS;
  const TARGUM = ['onq', 'onqk'];
  const torah = function (id) { return +id.slice(0, 2) <= 5; };

  const DIVISIONS = [
    { id: 'torah', en: 'Torah', he: 'תורה' },
    { id: 'neviim', en: 'Prophets', he: 'נביאים' },
    { id: 'ketuvim', en: 'Writings', he: 'כתובים' }
  ];

  /* How the Hebrew shows: the letters alone, with vowels, with vowels and
     Mechon Mamre's punctuation, or with cantillation. */
  const HE_MODES = ['plain', 'pointed', 'punct', 'teamim'];
  const views = new WeakMap();   // cantillated document → { mode: derived document }

  /* A text document with every verse's text passed through `fn`. */
  function mapText(doc, fn) {
    if (!doc) return doc;
    return Object.assign({}, doc, {
      chapters: doc.chapters.map(function (ch) {
        return Object.assign({}, ch, {
          laws: ch.laws.map(function (l) {
            return { n: l.n, text: fn(l.text), extra: l.extra.map(fn) };
          })
        });
      })
    });
  }

  /* The first save from an editor that opened on text the branch has since
     replaced (a live session: someone else's edit arrived meanwhile). What
     was typed is an edit of what the editor showed, `from`, not of the file
     as it is now — so the draft is made of that, and then moved onto the
     new text if the two don't collide (merge.js rebase()). If they do, it
     stays a draft of the old text, and sharing it asks which to keep,
     rather than this edit quietly replacing the other. */
  function editFrom(sec, layer, path, fn, from) {
    const r = fn(from === null ? null : F.parse(from, layer), sec);
    return TR.source.sha(path).catch(function () { return null; }).then(function (sha) {
      const moved = TR.merge.rebase({ layer: layer, base: from, text: r.text }, sec.raw[layer], sha);
      sections.delete(sec.id);   // read afresh, with the draft as it now stands
      if (moved && moved.gone) return r;
      const d = moved || { base: from, baseSha: null, text: r.text };
      return TR.drafts.put(path, { id: sec.id, layer: layer, base: d.base, baseSha: d.baseSha, text: d.text })
        .then(function () { return r; });
    });
  }

  function hasNotes(doc) {
    return !!doc && doc.chapters.some(function (ch) { return ch.notes && ch.notes.length; });
  }

  /* Commentators/index.json's list, keeping only what can be read: an id
     that names no other layer, and each book's languages that the reader
     knows. */
  function commentators(data) {
    const taken = new Set(LAYERS.concat(['tg']));
    return ((data && data.commentators) || []).filter(function (c) {
      return c && /^[a-z][a-z0-9]*$/.test(c.id) && !taken.has(c.id) && c.books;
    }).map(function (c) {
      const books = {};
      Object.keys(c.books).forEach(function (id) {
        const langs = (c.books[id] || []).filter(function (l) { return F.CM_LANGS.indexOf(l) >= 0; });
        if (langs.length) books[id] = langs;
      });
      return { id: c.id, en: c.en || c.id, he: c.he || '', full: c.full || '', books: books };
    });
  }

  /* A file of the reader's own (data/), not the texts': its JSON, or null
     if it can't be had. */
  function appJson(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ': ' + r.status);
      return r.json();
    }).catch(function (e) {
      console.warn('[data]', e);
      return null;
    });
  }

  const lib = TR.lib = {
    LAYERS: LAYERS,

    /* The commentators, as the index last loaded lists them (index()). */
    commentators: [],

    /* index.json, shaped for the screens:
         books[]       the three divisions, Torah, Nevi'im, Ketuvim, each
                       { id, en, he, sections: [book] } (a "section" is a book)
         order[]       every book in reading order, each
                       { id, en, he, book: division, chapters: [{ key, n, laws }] }
         byId          id → book
         parashot[]    { id, he, en, book, from, to, haftarah: { ash, sef? } }
         doubles[]     the parashot read together in some years, each a
                       parashah as above, with parts: [first, second]
                       (data/doubles.json, which ships with the reader)
         readings[]    { id, he, en, torah: [[range]], haftarah?: { ash?, sef? } }
         portions      id → parashah, double or reading
         commentators[] the classical commentaries (Commentators/index.json,
                       none if the texts have no such file), in its order,
                       each { id, en, he, full, books: { book id: [lang] } }
       A range is { book, from: "c:v", to: "c:v" }. */
    index: function () {
      if (!indexP) {
        const cms = TR.source.json('Commentators/index.json').catch(function (e) {
          console.warn('[commentators]', e);
          return null;
        });
        indexP = Promise.all([TR.source.json('index.json'), appJson('data/doubles.json'), cms]).then(function (got) {
          const ix = got[0];
          if (!ix || !ix.parashot) throw noIndex();
          ix.commentators = lib.commentators = commentators(got[2]);
          const divisions = DIVISIONS.map(function (d) { return Object.assign({ sections: [] }, d); });
          ix.order = ix.books.map(function (b) {
            const div = divisions.find(function (d) { return d.id === b.section; });
            const s = {
              id: b.id, en: b.en, he: b.he, book: div,
              chapters: b.chapters.map(function (v, i) { return { key: String(i + 1), n: i + 1, laws: v }; })
            };
            div.sections.push(s);
            return s;
          });
          ix.books = divisions;
          ix.byId = new Map(ix.order.map(function (s) { return [s.id, s]; }));
          /* A double runs from its first part's beginning to its second's
             end, and reads one part's haftarah; its name is theirs joined. */
          const byPid = new Map(ix.parashot.map(function (p) { return [p.id, p]; }));
          ix.doubles = ((got[1] && got[1].doubles) || []).map(function (d) {
            const a = byPid.get(d.parts[0]), b = byPid.get(d.parts[1]), h = byPid.get(d.haftarah);
            if (!a || !b || !h || a.book !== b.book) return null;
            return { id: d.id, he: a.he + '־' + b.he, en: a.en + '–' + b.en, book: a.book, from: a.from, to: b.to,
              haftarah: h.haftarah, parts: [a, b] };
          }).filter(Boolean);
          ix.portions = new Map(ix.parashot.concat(ix.doubles, ix.readings).map(function (p) { return [p.id, p]; }));
          return ix;
        });
        indexP.catch(function () { indexP = null; });
      }
      return indexP;
    },

    /* Where each portion's aliyot begin (data/aliyot.json, which ships with
       the reader, not with the texts): → portion id →
         { aliyot: [{ n, sec, key }],   n 1–7 or 'M' (the maftir), in order
           shabbat: [...] | null,       a holiday's division on Shabbat, where it has its own
           on: 'weekday'|'shabbat'|null }  a holiday that never or always falls on Shabbat
       A portion with none listed has no entry; if the file can't be had,
       none has. */
    aliyot: function () {
      if (!aliyotP) {
        aliyotP = Promise.all([lib.index(), appJson('data/aliyot.json')]).then(function (x) {
          const ix = x[0], data = x[1];
          if (!data) throw new Error('data/aliyot.json could not be read');
          const bookId = new Map(ix.order.map(function (s) { return [s.en, s.id]; }));
          const at = function (ref) {
            const i = ref.lastIndexOf(' ');
            const sec = bookId.get(ref.slice(0, i));
            return sec ? { sec: sec, key: ref.slice(i + 1) } : null;
          };
          const list = function (d) {
            const out = (d.aliyot || []).map(function (ref, i) { return Object.assign({ n: i + 1 }, at(ref)); });
            if (d.maftir) out.push(Object.assign({ n: 'M' }, at(d.maftir)));
            return out.filter(function (a) { return a.sec; });
          };
          const out = new Map();
          Object.keys(data.portions || {}).forEach(function (id) {
            const p = data.portions[id];
            out.set(id, { aliyot: list(p), shabbat: p.shabbat ? list(p.shabbat) : null, on: p.on || null });
          });
          return out;
        }, function (e) {
          console.warn('[aliyot]', e);
          return new Map();
        });
      }
      return aliyotP;
    },

    /* → { id, he, tp, onq, onqk, en,     the documents as they stand, drafts applied
           co, notes, mt,                 (only commentary and notes are ever edited)
           'rashbam-he', 'rashbam-en' …   the commentators' (F.cmLayer), for the
                                          languages the index lists for this book
           cms: [layer],                  …which those are
           raw: { layer: text|null },     the files as the source has them
           base: { layer: doc },          what each draft is an edit of
           drafts: { layer: record },     the drafts themselves
           stale: { layer: true } }       drafts whose file has changed since
       Outside the Torah there is no Targum, and its files aren't asked for. */
    section: function (id) {
      if (!sections.has(id)) {
        const parse = function (s, layer) { return s === null ? null : F.parse(s, layer); };
        const sec = { id: id, raw: {}, base: {}, drafts: {}, stale: {} };
        const load = function (layer) {
          if (!torah(id) && TARGUM.indexOf(layer) >= 0) { sec.raw[layer] = null; sec[layer] = null; return null; }
          return TR.source.text(F.pathOf(id, layer)).then(function (s) {
            sec.raw[layer] = s;
            const d = TR.drafts.get(F.pathOf(id, layer));
            if (!d) { sec[layer] = parse(s, layer); return; }
            sec[layer] = parse(d.text, layer);
            sec.base[layer] = parse(d.base, layer);
            sec.drafts[layer] = d;
            if (d.base !== s) sec.stale[layer] = true;
          });
        };
        /* The commentators' files are asked for only where the index lists
           them, and not for those the Display menu hides (they are large:
           several megabytes a book). */
        const cms = lib.index().then(function (ix) {
          const out = [];
          const hidden = TR.device.get('cmHidden') || [];
          ix.commentators.forEach(function (c) {
            if (hidden.indexOf(c.id) >= 0) return;
            (c.books[id] || []).forEach(function (lang) { out.push(F.cmLayer(c.id, lang)); });
          });
          return out;
        }, function () { return []; });
        const sp = Promise.all([TR.drafts.ready(), cms])
          .then(function (r) {
            sec.cms = r[1];
            return Promise.all(LAYERS.concat(sec.cms).map(load));
          })
          .then(function () { return sec; });
        sections.set(id, sp);
        sp.catch(function () { sections.delete(id); });
      }
      return sections.get(id);
    },

    /* How each layer of a section differs from its draft's base:
       { layer: [change] } (see edit.js), for layers with a draft. */
    changes: function (sec) {
      const out = {};
      Object.keys(sec.drafts).forEach(function (layer) {
        out[layer] = TR.edit.changes(sec.base[layer], sec[layer], layer);
      });
      return out;
    },

    /* Change one layer of a section: `fn(doc, sec)` returns edit.js's
       { doc, text } (or throws its edit error, which rejects this). The
       section in memory and the draft are updated together, one edit at a
       time. `from`, if given, is the file's text as the editor making the
       change found it — see editFrom(). */
    edit: function (id, layer, fn, from) {
      const run = function () { return lib.section(id).then(function (sec) {
        const path = F.pathOf(id, layer);
        const had = sec.drafts[layer];
        if (!had && from !== undefined && from !== sec.raw[layer]) return editFrom(sec, layer, path, fn, from);
        const r = fn(sec[layer], sec);
        return (had ? Promise.resolve(null) : TR.source.sha(path).catch(function () { return null; }))
          .then(function (sha) {
            const base = had ? had.base : sec.raw[layer];
            if (!had) sec.base[layer] = sec[layer];
            /* A notes file the section never had, with its last note deleted
               again, is no file at all. */
            const empty = base === null && !hasNotes(r.doc);
            sec[layer] = empty ? null : r.doc;
            return TR.drafts.put(path, { id: id, layer: layer, base: base, baseSha: sha, text: empty ? null : r.text });
          })
          .then(function () {
            const d = TR.drafts.get(path);
            if (d) sec.drafts[layer] = d;
            else sections.delete(id);   // back to the source's text: read it afresh
            return r;
          });
      }); };
      const done = queue.then(run, run);
      queue = done.catch(function () {});
      return done;
    },

    /* Run `fn` between edits, never during one: session.js moves drafts onto
       the text that has just arrived, which an edit halfway through saving
       would otherwise write over. */
    exclusive: function (fn) {
      const done = queue.then(fn, fn);
      queue = done.catch(function () {});
      return done;
    },

    /* Undo one change (from changes()). */
    revert: function (id, layer, change) {
      return lib.edit(id, layer, function (doc, sec) { return TR.edit.revert(sec.base[layer], doc, layer, change); });
    },

    /* Drop a layer's draft; the section is read afresh next time. */
    discard: function (id, layer) {
      return TR.drafts.remove(F.pathOf(id, layer)).then(function () { sections.delete(id); });
    },

    /* The chapters of a section in reading order, merging Hebrew and English
       by key (they agree everywhere except where a translation is unfinished).
       → [{ key, he: chapter|null, en: chapter|null }] */
    chapters: function (sec) {
      const out = [];
      const seen = new Map();
      [sec.he, sec.en].forEach(function (doc, side) {
        if (!doc) return;
        doc.chapters.forEach(function (ch) {
          let row = seen.get(ch.key);
          if (!row) { row = { key: ch.key, he: null, en: null }; seen.set(ch.key, row); out.push(row); }
          row[side ? 'en' : 'he'] = ch;
        });
      });
      return out;
    },

    /* The section as it should be shown, for a Hebrew mode (HE_MODES):
       `he` becomes the Hebrew edition to show and `tg` the Targum (pointed,
       or not when the Hebrew is shown without vowels). The cantillated text
       is the source of the plain and pointed views; Mechon Mamre's punctuated
       edition is its own file. All line up verse for verse (the import
       checks it), so nothing else needs to know which one it is reading. */
    view: function (sec, mode) {
      if (HE_MODES.indexOf(mode) < 0) mode = 'teamim';
      let he = sec.he;
      if (mode === 'punct') he = sec.tp || sec.he;
      else if (he && mode !== 'teamim') {
        /* Derived once per document (the Hebrew is never edited). */
        let cache = views.get(he);
        if (!cache) views.set(he, cache = {});
        he = cache[mode] || (cache[mode] = mapText(he, mode === 'plain' ? F.stripAll : F.stripTeamim));
      }
      const tg = mode === 'plain' ? sec.onqk || sec.onq : sec.onq || sec.onqk;
      return Object.assign({}, sec, { he: he, tg: tg, heMode: mode });
    },

    HE_MODES: HE_MODES,

    /* Notes (commentary or review) anchored to a law, keyed "chapter:law". */
    notesFor: function (doc, key) {
      if (!doc) return [];
      const out = [];
      doc.chapters.forEach(function (ch) {
        ch.notes.forEach(function (n) { if (F.noteKey(n) === key) out.push(n); });
      });
      return out;
    },

    /* A chapter's display name: "Chapter 3", or its own heading. */
    chapterName: function (row) {
      const ch = row.en || row.he;
      if (ch.n != null) return 'Chapter ' + ch.n;
      if (ch.heading) return ch.heading;
      return 'Text';
    }
  };

  TR.bus.on('source', function () {
    indexP = null;
    aliyotP = null;
    sections.clear();
  });

  /* A commentator shown or hidden: the books are read again, with or
     without its files. */
  TR.bus.on('device', function (patch) {
    if ('cmHidden' in patch) sections.clear();
  });

})(window.TR);
