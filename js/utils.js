/* The namespace, the event bus, and the device's settings.

   Loaded first, depends on nothing. Adapted from cheshbon's utils.js with the
   per-user storage namespace removed: there are no accounts here, only this
   device's own settings (where to read the texts from, the reader's GitHub
   token, the theme, which columns are showing). They live in localStorage
   under `tr.` and never leave the device. The texts themselves are cached in
   IndexedDB by store.js — far too large for localStorage.

   Nothing here throws. Storage can be absent or full, and a reader that
   cannot remember its settings is still a reader. */

(function () {
  'use strict';

  const TR = window.TR = window.TR || {};

  TR.VERSION = '0.1.0';

  const ROOT = 'tr.';

  function load(key, fallback) {
    try {
      const s = window.localStorage.getItem(ROOT + key);
      return s === null ? fallback : JSON.parse(s);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      window.localStorage.setItem(ROOT + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------ device */

  const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  /* On a development server the texts default to a local folder beside the
     app (see .claude/launch.json, which serves the parent directory); anywhere
     else they come from GitHub. */
  const DEFAULTS = {
    source: LOCAL ? 'local' : 'github',
    owner: 'yaaqov22',
    repo: 'tanakh',
    branch: 'main',
    baseBranch: 'main',  // what a branch is compared with: its pull request's base, or main
    token: '',
    localBase: '../tanakh/',
    theme: 'system',
    palette: 'sepia',   // the colour scheme: sepia, blue, gray or mono (black and white)
    marks: true,    // mark what the branch changed compared with baseBranch
    heMode: 'teamim',   // how the Hebrew shows: plain, pointed, punct (Mechon Mamre's punctuation) or teamim
    layout: 'lines',    // the reader: 'lines' (interlinear, a row per verse) or 'parallel' (the Hebrew and one text or none, each set as in a scroll, side by side)
    beside: 'en',       // the text beside the Hebrew, in either layout: 'en', 'tg' or 'none' (the Hebrew alone)
    heSide: 'right',    // which side of the page the Hebrew is on, in either layout: 'left' or 'right'
    readingDay: 'weekday',  // a holiday's aliyot as divided on a 'weekday' or on 'shabbat'
    paneShow: {},       // what the notes pane shows, as chosen in the Display menu: id → true/false, for notes layers ('notes', 'co', 'mt', 'digest') and commentators (Commentators/index.json ids); the rest as lib.shows() defaults
    cmHidden: [],       // the setting before paneShow: what the pane didn't show (still read, see lib.shows())
    cmLang: 'both',     // …and the language of those shown: 'he', 'en' or 'both'
    paneFolded: [],     // the notes pane's blocks folded away: layers ('co', 'notes', 'mt') and commentator ids
    paneOpen: true,     // whether the notes pane is open
    panePos: 'bottom',  // …where it is: 'bottom', 'left' or 'right'
    paneHeight: 0,      // …its height at the bottom in pixels, as dragged (0: a third of the screen)
    paneWidth: 0,       // …its width at a side in pixels, as dragged (0: 440, or less on a smaller screen)
    sayLang: 'he',      // reading aloud: 'he', 'en' or 'both' (each verse in Hebrew, then English)
    sayVoiceHe: '',     // …the voices chosen (voiceURI), or '' for the device's own choice
    sayVoiceEn: '',
    sayRate: 1,         // …the speed, 1 as the voice speaks
    sayStop: 'page',    // …where it stops: 'page' (or portion), 'aliyah', 'verse', or 'never' (on into the next chapter)
    name: '',       // signs review notes; filled from the token's login when checked
    login: '',      // the token's GitHub login, once known: names the submit branch
    lastSubmit: null  // { number, url, branch, … } of the last pull request submitted to
  };

  let device = Object.assign({}, DEFAULTS, load('device.v1', {}));

  TR.device = {
    get: function (k) {
      return device[k];
    },
    all: function () { return Object.assign({}, device); },
    /* One write for several keys, one event: Settings saves a whole form. */
    set: function (patch) {
      device = Object.assign({}, device, patch);
      save('device.v1', device);
      TR.bus.emit('device', patch);
    },
    defaults: DEFAULTS
  };

  /* --------------------------------------------------------------- bus */

  /* A listener that throws is logged and skipped rather than allowed to stop
     the ones after it — one broken screen should not freeze the others. */
  const listeners = Object.create(null);

  TR.bus = {
    on: function (evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return function () { TR.bus.off(evt, fn); };
    },
    off: function (evt, fn) {
      const a = listeners[evt];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    emit: function (evt, payload) {
      (listeners[evt] || []).slice().forEach(function (fn) {
        try { fn(payload); } catch (e) { console.error('[bus] ' + evt, e); }
      });
    }
  };

  /* ------------------------------------------------------------- odds */

  TR.cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

  TR.debounce = function (fn, ms) {
    let t = 0;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  /* Run `fn` over `items` with at most `n` in flight — used to fetch a few
     hundred files without opening a few hundred connections. */
  TR.pool = function (items, n, fn) {
    let i = 0;
    function next() {
      if (i >= items.length) return Promise.resolve();
      const item = items[i++];
      return Promise.resolve(fn(item)).then(next);
    }
    const workers = [];
    for (let k = 0; k < Math.min(n, items.length); k++) workers.push(next());
    return Promise.all(workers);
  };

})();
