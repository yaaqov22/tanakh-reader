/* This week's parashah: what the coming Shabbat reads, as a link in the top
   bar to its page in the reader.

   Hebcal (www.hebcal.com, which answers any origin and needs no key) says
   what each Shabbat reads, by the Diaspora's schedule or Israel's (Settings).
   Its answer is mapped onto the portions of index.json:

     a parashah ("Parashat Vayera")           → 0104
     two read together ("Vayakhel-Pekudei")   → 0210-0211 (data/doubles.json)
     a holiday on Shabbat ("Sukkot I", "Pesach III (CH''M)") → its reading, r06, r21
     a special Shabbat ("Shabbat Shekalim"), or Shabbat Rosh Chodesh → its
       reading too, shown beside the parashah as an extra

   "This week" is the Shabbat from Sunday through that Shabbat itself. Each
   week's answer is kept on this device, so the link shows offline and
   Hebcal is asked once a week. Nothing is shown if Hebcal can't be reached
   and nothing was kept. */

(function (TR) {
  'use strict';

  const API = 'https://www.hebcal.com/hebcal';
  const KEY = 'tr.week.v1';
  const TIMEOUT = 15000;

  /* Hebcal's names for the parashot, in order: the nth is the nth of
     index.json (0101–0112, 0201–0211, 0301–0310, 0401–0410, 0501–0511). */
  const SEDROT = [
    'Bereshit', 'Noach', 'Lech-Lecha', 'Vayera', 'Chayei Sara', 'Toldot', 'Vayetzei', 'Vayishlach', 'Vayeshev',
    'Miketz', 'Vayigash', 'Vayechi',
    'Shemot', 'Vaera', 'Bo', 'Beshalach', 'Yitro', 'Mishpatim', 'Terumah', 'Tetzaveh', 'Ki Tisa', 'Vayakhel', 'Pekudei',
    'Vayikra', 'Tzav', 'Shmini', 'Tazria', 'Metzora', 'Achrei Mot', 'Kedoshim', 'Emor', 'Behar', 'Bechukotai',
    'Bamidbar', 'Nasso', 'Beha\'alotcha', 'Sh\'lach', 'Korach', 'Chukat', 'Balak', 'Pinchas', 'Matot', 'Masei',
    'Devarim', 'Vaetchanan', 'Eikev', 'Re\'eh', 'Shoftim', 'Ki Teitzei', 'Ki Tavo', 'Nitzavim', 'Vayeilech',
    'Ha\'azinu', 'Vezot Haberakhah'
  ];
  const PER_BOOK = [12, 11, 10, 10, 11];
  const IDS = [];
  PER_BOOK.forEach(function (n, b) {
    for (let i = 1; i <= n; i++) IDS.push('0' + (b + 1) + (i < 10 ? '0' : '') + i);
  });

  /* Letters only, lower case: "Beha’alotcha" and "Beha'alotcha" are one. */
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

  const SEDRA = new Map(SEDROT.map(function (s, i) { return [norm(s), IDS[i]]; }));
  /* Two read together: Hebcal joins their names with a hyphen. */
  for (let i = 0; i + 1 < SEDROT.length; i++) SEDRA.set(norm(SEDROT[i]) + norm(SEDROT[i + 1]), IDS[i] + '-' + IDS[i + 1]);

  /* Holidays as Hebcal names them (without a year), by the reading on Shabbat. */
  const HOLIDAYS = {
    'rosh hashana': 'r01', 'rosh hashana ii': 'r02', 'yom kippur': 'r04',
    'sukkot i': 'r06', 'sukkot ii': 'r07', 'shmini atzeret': 'r09', 'simchat torah': 'r10',
    'pesach i': 'r19', 'pesach ii': 'r20', 'pesach vii': 'r22', 'pesach viii': 'r23',
    'shavuot': 'r24', 'shavuot i': 'r24', 'shavuot ii': 'r25'
  };
  /* The special Shabbatot read in addition to the parashah. */
  const SPECIAL = {
    'shabbat shekalim': 'r13', 'shabbat zachor': 'r14', 'shabbat parah': 'r16', 'shabbat hachodesh': 'r17'
  };

  /* One of Hebcal's events → { id, extra } (extra: read beside the
     parashah), or null for one with no reading of its own here (Chanukah,
     Shabbat Shirah, Mevarchim…). */
  function portionOf(e, israel) {
    if (!e || !e.title) return null;
    if (e.category === 'parashat') {
      const id = SEDRA.get(norm(e.title.replace(/^Parashat\s+/, '')));
      return id ? { id: id, extra: false } : null;
    }
    if (e.category === 'roshchodesh') return { id: 'r32', extra: true };
    if (e.category !== 'holiday') return null;
    const t = e.title.replace(/\s+\d{4}$/, '').trim();
    /* A Shabbat of the intermediate days: "Sukkot IV (CH''M)". */
    if (/\(CH/.test(t)) {
      if (/^Sukkot/.test(t)) return { id: 'r08', extra: false };
      if (/^Pesach/.test(t)) return { id: 'r21', extra: false };
      return null;
    }
    const k = t.toLowerCase();
    if (SPECIAL[k]) return { id: SPECIAL[k], extra: true };
    /* In Israel Shemini Atzeret is Simchat Torah too, and reads its reading. */
    if (k === 'shmini atzeret' && israel) return { id: 'r10', extra: false };
    return HOLIDAYS[k] ? { id: HOLIDAYS[k], extra: false } : null;
  }

  /* The Shabbat of this week, as "YYYY-MM-DD" in local time: today on Shabbat. */
  function shabbat(now) {
    const d = new Date(now || Date.now());
    d.setDate(d.getDate() + (6 - d.getDay()));
    const pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* --------------------------------------------------------------- Hebcal */

  function loadKept() {
    try {
      const v = JSON.parse(window.localStorage.getItem(KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) {
      return {};
    }
  }

  function keep(key, items) {
    const kept = loadKept();
    kept[key] = items;
    /* A few weeks back is plenty. */
    Object.keys(kept).sort().slice(0, -4).forEach(function (k) { delete kept[k]; });
    try { window.localStorage.setItem(KEY, JSON.stringify(kept)); } catch (e) { /* kept for this session */ }
  }

  const asked = new Map();   // key → Promise of Hebcal's events that Shabbat

  /* Hebcal's events on `date`: the parashah, holidays, special Shabbatot and
     Rosh Chodesh. Only what is needed is kept: { title, category }. */
  function events(date, israel) {
    const key = date + (israel ? '|il' : '|d');
    const kept = loadKept()[key];
    if (kept) return Promise.resolve(kept);
    if (asked.has(key)) return asked.get(key);
    const url = API + '?v=1&cfg=json&s=on&maj=on&ss=on&nx=on&leyning=off&i=' + (israel ? 'on' : 'off') +
      '&start=' + date + '&end=' + date;
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
    const p = fetch(url, { signal: ctrl.signal }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('Hebcal answered ' + res.status);
      return res.json();
    }).then(function (j) {
      const items = ((j && j.items) || []).filter(function (e) { return e.date === date; })
        .map(function (e) { return { title: e.title, category: e.category }; });
      keep(key, items);
      return items;
    });
    asked.set(key, p);
    p.catch(function () { clearTimeout(timer); asked.delete(key); });
    return p;
  }

  /* This week's readings: → { date, israel, main: [portion], extra: [portion] },
     each portion as index.json has it ({ id, en, he, … }). Rejects if Hebcal
     can't be reached and nothing was kept. */
  function get() {
    const date = shabbat();
    const israel = !!TR.device.get('weekIsrael');
    return Promise.all([events(date, israel), TR.lib.index()]).then(function (got) {
      const ix = got[1];
      const out = { date: date, israel: israel, main: [], extra: [] };
      got[0].forEach(function (e) {
        const m = portionOf(e, israel);
        const p = m && ix.portions.get(m.id);
        if (p && (m.extra ? out.extra : out.main).indexOf(p) < 0) (m.extra ? out.extra : out.main).push(p);
      });
      return out;
    });
  }

  TR.week = { get: get, shabbat: shabbat, portionOf: portionOf };

})((typeof globalThis !== 'undefined' ? globalThis : window).TR);
