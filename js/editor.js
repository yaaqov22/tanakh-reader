/* The in-place editor: a textarea that takes the place of one law or note
   and saves as you type.

   TR.editor.open(host, {
     body,        the text to start from
     lang,        'he' for right-to-left Hebrew, else English
     save(body),  → Promise; rejects with edit.js's error when the text can't
                  be saved as it is (it would read as a new law, a heading…)
     onClose()    after the last save, when the editor has gone
     render(body) → nodes to leave in its place when another editor opens
                  (onClose, which repaints the screen, would close that one)
     at           what is being edited, for whoever asks (see at() below)
   })

   SAVING. Every pause in the typing (half a second) saves, and so does
   leaving: Done, Ctrl+Enter, Esc, clicking elsewhere in the reader to open
   another editor, or the page being hidden. Saves run one after another. A
   refused save leaves the text in the box with the reason under it; the
   draft keeps the last text that could be saved. Esc on a refused text
   leaves without it.

   Only one editor is open at a time; opening another closes the first.

   GROWING. The box grows with its text. Measuring it means collapsing it
   for a moment, which would shorten whatever it scrolls in (the notes
   pane) and leave that scrolled elsewhere, the box jumping as it is typed
   in; the scroll is put back as it was, and the line being typed kept in
   view.

   FOCUS. The button at the end of its bar spreads the editor over the whole
   of the notes pane below the pane's bar (or the window, outside the
   pane), the text filling it and its bar along the foot, and back. Which it
   was is remembered on the device for the next editor.

   A LIVE SESSION (session.js) shares each edit when its editor closes, so
   the bus hears 'editor' { open } as one opens and as one has closed, its
   last save done. at() says what the open one is editing and whether it has
   changed anything yet, and warn() puts a line under it — the reader's, when
   someone else changes the same law meanwhile. */

(function (TR) {
  'use strict';

  const UI = TR.ui;
  const PAUSE = 500;
  const MAX_KEY = 'tr.editMax';
  let current = null;

  /* The elements a box scrolls in, and how far each is scrolled. */
  function scrollers(el) {
    const out = [];
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight) out.push([p, p.scrollTop]);
    }
    return out;
  }

  /* The box as high as its text, everything around it left where it was. */
  function grow(ta) {
    if (ta.closest('.editor.max')) { ta.style.height = ''; return; }
    const keep = scrollers(ta);
    const y = window.scrollY;
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + 2) + 'px';
    keep.forEach(function (k) { k[0].scrollTop = k[1]; });
    if (window.scrollY !== y) window.scrollTo(window.scrollX, y);
  }

  /* Typing at the end of the text, as most typing is: the box's foot, where
     the caret is, kept above the foot of the pane it scrolls in. */
  function keepCaret(ta) {
    if (ta.closest('.editor.max') || ta.selectionEnd < ta.value.length) return;
    const pane = ta.closest('.pane-body');
    if (!pane) return;
    const over = ta.getBoundingClientRect().bottom + 8 - pane.getBoundingClientRect().bottom;
    if (over > 0) pane.scrollTop += over;
  }

  function wantMax() {
    try { return localStorage.getItem(MAX_KEY) === '1'; } catch (e) { return false; }
  }
  function rememberMax(on) {
    try { localStorage.setItem(MAX_KEY, on ? '1' : '0'); } catch (e) { /* not remembered */ }
  }

  function open(host, opts) {
    if (current) current.close();

    const ta = UI.el('textarea.edit-area', {
      lang: opts.lang === 'he' ? 'he' : 'en', dir: opts.lang === 'he' ? 'rtl' : 'ltr',
      spellcheck: opts.lang === 'he' ? 'false' : 'true', 'aria-label': opts.label || 'Edit'
    });
    ta.value = opts.body || '';
    const status = UI.el('span.edit-status');
    const err = UI.el('p.edit-error', { role: 'alert' });
    err.hidden = true;
    const warning = UI.el('div.edit-warn', { role: 'status' });
    warning.hidden = true;
    const done = UI.btn('Done', { class: 'btn small primary', title: 'Done (Ctrl+Enter)' });
    const maxBtn = UI.el('button.iconbtn.edit-max', { type: 'button' });
    const box = UI.el('div.editor', [
      ta, err, warning,
      UI.el('div.edit-bar', [status, opts.hint ? UI.el('span.edit-hint', { text: opts.hint }) : null, maxBtn, done])
    ]);
    UI.fill(host, box);

    /* Focus: the editor laid over the notes pane's body (or the window),
       kept to it as the pane or the window changes size. */
    let watch = null;
    function place() {
      const over = host.closest('.pane-body');
      const r = over ? over.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
      box.style.top = r.top + 'px';
      box.style.left = r.left + 'px';
      box.style.width = r.width + 'px';
      box.style.height = r.height + 'px';
    }
    function setMax(on) {
      box.classList.toggle('max', on);
      const label = on ? 'Back into the notes (focus off)' : 'Fill the notes pane, to write (focus)';
      maxBtn.title = label;
      maxBtn.setAttribute('aria-label', label);
      maxBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      UI.fill(maxBtn, [(on ? TR.icons.shrink : TR.icons.expand)()]);
      if (watch) { watch.disconnect(); watch = null; }
      window.removeEventListener('resize', place);
      if (on) {
        place();
        const over = host.closest('.pane-body');
        if (over && window.ResizeObserver) { watch = new ResizeObserver(place); watch.observe(over); }
        window.addEventListener('resize', place);
      } else {
        ['top', 'left', 'width', 'height'].forEach(function (k) { box.style[k] = ''; });
      }
      grow(ta);
    }
    maxBtn.addEventListener('click', function () {
      const on = !box.classList.contains('max');
      rememberMax(on);
      setMax(on);
      ta.focus();
      if (!on && box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
    });
    setMax(wantMax());

    const began = ta.value;
    let saved = ta.value;       // the last text the draft holds
    let failed = false;
    let chain = Promise.resolve();
    let timer = 0;
    let closed = false;

    function save() {
      clearTimeout(timer);
      const body = ta.value;
      if (body === saved && !failed) return chain;
      chain = chain.then(function () {
        if (body === saved) { failed = false; return; }
        return Promise.resolve(opts.save(body)).then(function () {
          saved = body;
          failed = false;
          err.hidden = true;
          status.textContent = 'Saved on this device';
        }, function (e) {
          failed = true;
          err.textContent = e.message + (e.code === 'edit' ? '' : ' (not saved)');
          err.hidden = false;
          status.textContent = '';
        });
      });
      return chain;
    }

    function close(abandon, replaced) {
      if (closed) return Promise.resolve();
      if (replaced) {
        closed = true;
        current = null;
        if (watch) watch.disconnect();
        window.removeEventListener('resize', place);
      }
      return save().then(function () {
        if (failed && !abandon) { ta.focus(); return; }
        closed = true;
        if (current === api) current = null;
        document.removeEventListener('visibilitychange', onHide);
        if (watch) watch.disconnect();
        window.removeEventListener('resize', place);
        if (replaced) UI.fill(host, opts.render ? opts.render(saved) : null);
        else if (opts.onClose) opts.onClose();
        TR.bus.emit('editor', { open: false });
      });
    }

    function onHide() { if (document.visibilityState === 'hidden') save(); }
    document.addEventListener('visibilitychange', onHide);

    ta.addEventListener('input', function () {
      grow(ta);
      keepCaret(ta);
      status.textContent = 'Editing…';
      clearTimeout(timer);
      timer = setTimeout(save, PAUSE);
    });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(failed && ta.value !== saved); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); close(false); }
    });
    done.addEventListener('click', function () { close(false); });

    const api = {
      close: function () { return close(true, true); },
      flush: save,
      at: function () {
        return Object.assign({}, opts.at, { dirty: saved !== began || ta.value !== began });
      },
      warn: function (children) {
        UI.fill(warning, children);
        warning.hidden = !children;
      }
    };
    current = api;
    TR.bus.emit('editor', { open: true });
    grow(ta);
    ta.focus();
    if (opts.caretEnd !== false) ta.setSelectionRange(ta.value.length, ta.value.length);
    /* The box can open below the fold (a note at the bottom of a long row). */
    if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
    return api;
  }

  /* Before the page goes, the pending save goes too. */
  window.addEventListener('pagehide', function () { if (current) current.flush(); });

  /* A word diff of two bodies, shown as their source text (Markdown and all). */
  function diff(before, after) {
    return UI.el('div.diff', TR.edit.diffWords(before, after).map(function (d) {
      return d.op === '=' ? document.createTextNode(d.text) : UI.el(d.op === '+' ? 'ins' : 'del', { text: d.text });
    }));
  }

  TR.editor = {
    open: open,
    diff: diff,
    active: function () { return !!current; },
    /* What the open editor is editing — the `at` it was opened with, and
       `dirty`: whether its text has changed since — or null. */
    at: function () { return current ? current.at() : null; },
    warn: function (children) { if (current) current.warn(children); },
    close: function () { return current ? current.close() : Promise.resolve(); }
  };

})(window.TR);
