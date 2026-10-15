/* speech.js — reading the text aloud, with the browser's own voices (the Web
   Speech API). Nothing leaves the device and there is no key: what voices
   there are is the browser's and the system's to say. English has one
   everywhere. Hebrew depends on the device: Edge has natural ones (Avri,
   Hila), iOS and macOS Carmit, Android Google's; desktop Chrome often has
   none.

   Two halves:

   - Preparing a verse to be spoken (hebrew(), english()): pure functions,
     shared with the Node tests, as format.js is. A speech engine reads
     modern Hebrew, so the verse is given to it as it is read aloud: the
     accents gone, the qere for the ktiv, and the divine name as it is
     said, Adonai (or Elohim where it is pointed so).

   - Speaking (speak(), stop()): a queue of short
     utterances, one per verse and language, each in its language's voice. */
(function (root) {
  'use strict';
  const TR = root.TR = root.TR || {};
  const F = TR.format;

  /* ---------- preparing the text ---------- */

  // Built from code points, as format.js's are: the marks are invisible on
  // their own.
  const ch = function () { return String.fromCharCode.apply(String, arguments); };
  const span = function (a, b) { return ch(a) + '-' + ch(b); };

  // A letter, and a vowel or other mark that sits on one (not maqaf U+05BE,
  // paseq U+05C0, sof pasuq U+05C3 or nun hafukha U+05C6, which stand alone).
  const LETTER = span(0x5D0, 0x5EA);
  const POINT = span(0x591, 0x5BD) + ch(0x5BF, 0x5C1, 0x5C2, 0x5C4, 0x5C5, 0x5C7);
  const WORD = new RegExp('[' + LETTER + POINT + ']+', 'g');
  // Maqaf, which the punctuated edition writes as "-".
  const MAQAF = '[' + ch(0x5BE) + '-]';

  // Ktiv (qere): the written form, bare letters, then the read form in
  // parentheses. The ktiv may hang on a pointed word by a maqaf (אֶת־יעיש
  // (יְעוּשׁ)), so it starts where the letters stop being pointed. An empty
  // qere, "( )", is a word written and not read.
  const KTIV = new RegExp('(?<![' + LETTER + POINT + '])[' + LETTER + ']+' + MAQAF + '?[ \\xA0]*\\(([^)]*)\\)', 'g');

  const ADONAI = ch(0x5D0, 0x5B2, 0x5D3, 0x5B9, 0x5E0, 0x5B8, 0x5D9);              // אֲדֹנָי
  const ADONAI_AFTER = ch(0x5D0, 0x5D3, 0x5B9, 0x5E0, 0x5B8, 0x5D9);               // אדֹנָי, after a prefix with patah (לַאדֹנָי)
  const ELOHIM = ch(0x5D0, 0x5B1, 0x5DC, 0x5B9, 0x5D4, 0x5B4, 0x5D9, 0x5DD);       // אֱלֹהִים
  const ELOHIM_AFTER = ch(0x5D0, 0x5DC, 0x5B9, 0x5D4, 0x5B4, 0x5D9, 0x5DD);        // אלֹהִים, after a prefix with tsere (לֵאלֹהִים)
  const PATAH = ch(0x5B7), TSERE = ch(0x5B5);
  const ELOHIM_VOWEL = new RegExp('[' + ch(0x5B4, 0x5B1) + ']');                  // hiriq, hataf segol

  /* The divine name, with any prefixed letters (ו ב ל כ מ ה ש), as it is
     read: Elohim where it is pointed with hiriq (יְהוִה, as after אֲדֹנָי)
     or hataf segol, Adonai everywhere else. The prefix keeps its vowel, and
     the aleph that follows takes the form that vowel calls for. */
  function divineName(word) {
    if (!/^[ובלכמהש]{0,3}יהוה$/.test(F.stripNiqqud(word))) return word;
    const parts = word.match(new RegExp('[' + LETTER + '][^' + LETTER + ']*', 'g'));
    const prefix = parts.slice(0, -4).join('');
    const name = parts.slice(-4).join('');
    const last = parts.length > 4 ? parts[parts.length - 5] : '';
    if (ELOHIM_VOWEL.test(name)) {
      return prefix + (last.indexOf(TSERE) >= 0 || last.indexOf(PATAH) >= 0 ? ELOHIM_AFTER : ELOHIM);
    }
    return prefix + (last.indexOf(PATAH) >= 0 ? ADONAI_AFTER : ADONAI);
  }

  const LEFT_OVER = new RegExp('[|' + ch(0x5C0, 0x5C6) + ']', 'g');                // a paseq left over, nun hafukha
  const MAQAFS = new RegExp(MAQAF, 'g');
  const SOF_PASUQ = new RegExp(ch(0x5C3), 'g');

  /* A verse of the Hebrew → the words to speak. Best from Mechon Mamre's
     punctuated edition, whose commas, colons, semicolons and full stops
     (its reading of the accents) the voice pauses at; its dash ("--")
     is a pause too. The cantillated edition has only the sof pasuq. */
  function hebrew(s) {
    return F.stripTeamim(String(s || '')
      .replace(/<\/?(?:big|small|sup)>/g, '')
      .replace(KTIV, function (m, qere) { return qere.trim(); })
      .replace(/\(([^)]*)\)/g, '$1'))        // a qere with no ktiv (a word read, not written)
      .replace(WORD, divineName)
      .replace(/\{[^}]*\}/g, ' ')            // section marks {פ} {ס} {ר} {ש}
      .replace(LEFT_OVER, ' ')
      .replace(/\s*--\s*/g, ', ')            // a dash
      .replace(MAQAFS, ' ')
      .replace(SOF_PASUQ, '.')
      .replace(/\s+/g, ' ')
      .replace(/ ([.,;:?!])/g, '$1')
      .replace(/[,;:]+(?=[.,;:?!])/g, '')    // a dash before other punctuation
      .replace(/^[\s.,;:]+/, '')
      .trim();
  }

  // A verse of the English → the words to speak.
  function english(s) {
    return String(s || '')
      .replace(/\{[^}]*\}/g, ' ')            // {P} {S} {N}
      .replace(/[[\]]/g, '')                 // the translators' supplied words
      .replace(/\bLORD\b/g, 'Lord')          // not spelled out, L-O-R-D
      .replace(/\bGOD\b/g, 'God')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- speaking ---------- */

  const synth = root.speechSynthesis || null;
  const supported = !!(synth && root.SpeechSynthesisUtterance);
  const LANG_TAG = { he: 'he-IL', en: 'en-US' };

  // The installed voices for 'he' or 'en' (Hebrew is "iw" on older Android).
  function voices(lang) {
    if (!supported) return [];
    const want = lang === 'he' ? ['he', 'iw'] : [lang];
    return synth.getVoices().filter(function (v) {
      return want.indexOf(String(v.lang).toLowerCase().split(/[-_]/)[0]) >= 0;
    });
  }

  /* The voice chosen for a language in Settings, or the best guess: the
     system's default, then a natural one, then American English. */
  function voiceFor(lang) {
    const chosen = TR.device && TR.device.get(lang === 'he' ? 'sayVoiceHe' : 'sayVoiceEn');
    return voices(lang).find(function (v) { return v.voiceURI === chosen; }) || defaultVoice(lang);
  }

  function defaultVoice(lang) {
    const all = voices(lang);
    if (!all.length) return null;
    return all.find(function (v) { return v.default; }) ||
      all.find(function (v) { return /natural|online/i.test(v.name); }) ||
      all.find(function (v) { return /en-us/i.test(v.lang); }) ||
      all[0];
  }

  // The voices arrive after the page does, and can change.
  function onVoices(fn) {
    if (supported && synth.addEventListener) synth.addEventListener('voiceschanged', fn);
  }

  let run = 0;          // which speak() is current: a stopped one's events are ignored
  let utterance = null; // held, or Chrome may collect it before its end event
  let keepAlive = 0;

  /* Speak `items` ({ text, lang }) one after another. `opts.onItem(i)` as
     each begins, `opts.onDone()` after the last, `opts.onError(e)` if one
     fails. Stopping (or speaking something else) calls none of them. */
  function speak(items, opts) {
    stop();
    opts = opts || {};
    const mine = ++run;
    const rate = +(TR.device && TR.device.get('sayRate')) || 1;
    const next = function (i) {
      if (mine !== run) return;
      if (i >= items.length) { finish(); if (opts.onDone) opts.onDone(); return; }
      const it = items[i];
      const u = new root.SpeechSynthesisUtterance(it.text);
      u.lang = LANG_TAG[it.lang] || it.lang;
      const voice = voiceFor(it.lang);
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onstart = function () { if (mine === run && opts.onItem) opts.onItem(i); };
      u.onend = function () { next(i + 1); };
      u.onerror = function (e) {
        if (mine !== run || e.error === 'interrupted' || e.error === 'canceled') return;
        finish();
        if (opts.onError) opts.onError(e);
      };
      utterance = u;
      synth.speak(u);
    };
    /* Chrome's online voices fall silent after about fifteen seconds of one
       utterance; a pause and resume now and then keeps them going. */
    keepAlive = setInterval(function () {
      if (synth.speaking) { synth.pause(); synth.resume(); }
    }, 10000);
    next(0);
    return mine;
  }

  function finish() {
    clearInterval(keepAlive);
    utterance = null;
  }

  function stop() {
    run++;
    finish();
    if (supported) synth.cancel();
  }

  TR.speech = {
    hebrew: hebrew, english: english,
    supported: supported, voices: voices, voiceFor: voiceFor, defaultVoice: defaultVoice, onVoices: onVoices,
    speak: speak, stop: stop
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
