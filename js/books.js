/* The tables of contents, from index.json. Two screens, one tab bar:

   #/books                  every book, Torah, Prophets, Writings, each with
   #/books/torah            its chapters (the breadcrumb opens a division)
   #/parashot               the weekly parashot as the Tiqqun divides them,
                            each with its haftarah
   #/parashot/holidays      the holidays' and special Shabbatot's readings

   Reading a branch, the books it changed are tagged (review.js). */

(function (TR) {
  'use strict';

  const UI = TR.ui;
  let seq = 0;

  function tabs(which) {
    const tab = function (id, href, text) {
      return UI.el('a.ptab', { href: href, text: text, 'aria-current': id === which ? 'page' : null });
    };
    return UI.el('nav.ptabs.hometabs', { 'aria-label': 'Contents' }, [
      tab('books', UI.href('books'), 'Books'),
      tab('parashot', UI.href('parashot'), 'Parashot'),
      tab('holidays', UI.href('parashot', ['holidays']), 'Holidays')
    ]);
  }

  function head(which) {
    return [
      UI.el('h1.page-title', { text: 'Tanakh' }),
      UI.el('p.page-sub', { text: TR.source.label() }),
      tabs(which)
    ];
  }

  /* -------------------------------------------------------------- books */

  function bookEntry(s) {
    const d = UI.el('details.tbook', { 'data-sec': s.id }, [
      UI.el('summary', [
        UI.el('span.sec-en', { text: s.en }),
        UI.el('span.sec-he', { lang: 'he', dir: 'rtl', text: s.he }),
        UI.el('span.sec-meta', { text: s.chapters.length + (s.chapters.length === 1 ? ' chapter' : ' chapters') })
      ]),
      UI.el('div.chgrid', s.chapters.map(function (c) {
        return UI.el('a.chnum', { href: UI.href('read', [s.id, c.key]), text: String(c.n), title: s.en + ' ' + c.n });
      }))
    ]);
    return d;
  }

  /* Torah, Prophets, Writings, each with its books; only division `open`,
     if one is named. */
  function books(ix, open) {
    return ix.books.map(function (b) {
      const d = UI.el('details.book', { open: !open || open === b.id }, [
        UI.el('summary', [
          UI.el('span.book-en', { text: b.en }),
          UI.el('span.book-he', { lang: 'he', dir: 'rtl', text: b.he })
        ]),
        UI.el('div.secs', b.sections.map(bookEntry))
      ]);
      d.id = 'book-' + b.id;
      return d;
    });
  }

  function renderBooks(host, ix, open) {
    UI.fill(host, [head('books'), books(ix, open)]);
    if (open) {
      const el = document.getElementById('book-' + open);
      if (el) el.scrollIntoView({ block: 'start' });
    }
    markChanged(host);
  }

  /* On a branch other than its base, tag the books it changed. Nothing to
     show when there is no comparison, or it fails (the reader says why). */
  function markChanged(host) {
    const mine = seq;
    TR.review.info().then(function (info) {
      if (!info || mine !== seq) return;
      info.sections.forEach(function (layers, id) {
        const a = host.querySelector('[data-sec="' + id + '"] .sec-meta');
        if (a) a.appendChild(UI.el('span.tag.up', { text: 'changed', title: 'Changed on this branch compared with ' + info.base }));
      });
    }, function () {});
  }

  /* ------------------------------------------------------------ portions */

  function refName(ix, r) {
    const b = ix.byId.get(r.book);
    const f = r.from.split(':'), t = r.to.split(':');
    const end = r.from === r.to ? '' : '–' + (f[0] === t[0] ? t[1] : r.to);
    return (b ? b.en : r.book) + ' ' + r.from + end;
  }

  function refsName(ix, list) {
    return list.map(function (r) { return refName(ix, r); }).join('; ');
  }

  /* One parashah or reading: its name, where its Torah reading runs, and
     its haftarah, each a link into the reader. */
  function portionEntry(ix, p) {
    const torah = p.torah ? [].concat.apply([], p.torah) : [{ book: p.book, from: p.from, to: p.to }];
    const h = p.haftarah || {};
    const same = h.sef && h.ash && JSON.stringify(h.sef) === JSON.stringify(h.ash);
    const links = [];
    if (torah.length) links.push(UI.el('a.plink', { href: UI.href('portion', [p.id]), text: refsName(ix, torah) }));
    if (h.ash && h.ash.length) {
      links.push(UI.el('a.plink.haf', { href: UI.href('portion', [p.id, 'ash']) }, [
        UI.el('span.plabel', { text: h.sef && !same ? 'Haftarah (Ashk.)' : 'Haftarah' }), ' ' + refsName(ix, h.ash)]));
    }
    if (h.sef && h.sef.length && !same) {
      links.push(UI.el('a.plink.haf', { href: UI.href('portion', [p.id, 'sef']) }, [
        UI.el('span.plabel', { text: 'Haftarah (Seph.)' }), ' ' + refsName(ix, h.sef)]));
    }
    const first = torah.length ? UI.href('portion', [p.id]) : UI.href('portion', [p.id, 'ash']);
    return UI.el('div.portion', { 'data-portion': p.id }, [
      UI.el('a.pname', { href: first }, [
        UI.el('span.sec-en', { text: p.en }),
        UI.el('span.sec-he', { lang: 'he', dir: 'rtl', text: p.he })
      ]),
      UI.el('div.plinks', links)
    ]);
  }

  /* The parashot under their books of the Torah. */
  function parashot(ix) {
    return ['01', '02', '03', '04', '05'].map(function (id) {
      const b = ix.byId.get(id);
      return UI.el('details.book', { open: true }, [
        UI.el('summary', [UI.el('span.book-en', { text: b.en }), UI.el('span.book-he', { lang: 'he', dir: 'rtl', text: b.he })]),
        UI.el('div.portions', ix.parashot.filter(function (p) { return p.book === id; }).map(function (p) { return portionEntry(ix, p); }))
      ]);
    });
  }

  function holidays(ix) {
    return UI.el('div.portions.solo', ix.readings.map(function (p) { return portionEntry(ix, p); }));
  }

  function renderParashot(host, ix) {
    UI.fill(host, [head('parashot'),
      UI.el('p.page-note', { text: 'The weekly portions as Mechon Mamre\'s Tiqqun Qore\'im divides them, with each week\'s haftarah.' }),
      parashot(ix)]);
  }

  function renderHolidays(host, ix) {
    UI.fill(host, [head('holidays'),
      UI.el('p.page-note', { text: 'Readings for the holidays and special Shabbatot. On the holidays the maftir is usually read from a second scroll.' }),
      holidays(ix)]);
  }

  /* The same lists, for the reader's header to go elsewhere from. */
  TR.contents = { books: books, parashot: parashot, holidays: holidays };

  function route(id, draw) {
    UI.route(id, {
      refresh: function (host, args) {
        const mine = ++seq;
        if (!host.firstChild) UI.fill(host, UI.message('Loading…', null, 'loading'));
        return TR.lib.index().then(function (ix) {
          if (mine === seq) draw(host, ix, args[0]);
        }, function (e) {
          if (mine !== seq) return;
          UI.fill(host, UI.message(e.message, UI.el('a.btn', { href: '#/settings', text: 'Settings' }), 'error'));
        });
      }
    });
  }

  route('books', renderBooks);
  route('parashot', function (host, ix, which) {
    if (which === 'holidays') renderHolidays(host, ix);
    else renderParashot(host, ix);
  });

})(window.TR);
