// Tests for js/speech.js: a verse made ready to be read aloud, and the same
// over every verse of the Hebrew and English.
//
//   node tools/test-speech.mjs [--root ../tanakh]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { F, APP_ROOT, args } from './lib.mjs';
import '../js/speech.js';

const S = globalThis.TR.speech;
const opt = args({ root: path.resolve(APP_ROOT, '../tanakh') });
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${e.message.split('\n').join('\n    ')}`); }
}

const ADONAI = '\u05D0\u05B2\u05D3\u05B9\u05E0\u05B8\u05D9';
const ELOHIM = '\u05D0\u05B1\u05DC\u05B9\u05D4\u05B4\u05D9\u05DD';
const ACCENTS = /[\u0591-\u05AF\u05BD]/;
const NAME = /(^|[^\u05D0-\u05EA\u0591-\u05C7])[\u05D5\u05D1\u05DC\u05DB\u05DE\u05D4\u05E9]{0,3}\u05D9\u05D4\u05D5\u05D4(?![\u05D0-\u05EA])/;
const words = s => s.split(/[\s.\u05BE\u05C3]+/).filter(Boolean);

/* ---------- unit ---------- */

test('Gen 2:4: the name read Adonai, the accents gone', () => {
  const out = S.hebrew('אֵ֣לֶּה תֽוֹלְד֧וֹת הַשָּׁמַ֛יִם וְהָאָ֖רֶץ בְּ<small>הִ</small>בָּֽרְאָ֑ם בְּי֗וֹם עֲשׂ֛וֹת יְהוָ֥ה אֱלֹהִ֖ים אֶ֥רֶץ וְשָׁמָֽיִם׃');
  assert.equal(out, 'אֵלֶּה תוֹלְדוֹת הַשָּׁמַיִם וְהָאָרֶץ בְּהִבָּרְאָם בְּיוֹם עֲשׂוֹת ' + ADONAI + ' ' + ELOHIM + ' אֶרֶץ וְשָׁמָיִם.');
});

test('Gen 15:2: אֲדֹנָי יְהוִה read Adonai Elohim; maqaf a space', () => {
  const out = S.hebrew('וַיֹּ֣אמֶר אַבְרָ֗ם אֲדֹנָ֤י יְהוִה֙ מַה־תִּתֶּן־לִ֔י');
  assert.equal(out, 'וַיֹּאמֶר אַבְרָם ' + ADONAI + ' ' + ELOHIM + ' מַה תִּתֶּן לִי');
});

test('the name with prefixes', () => {
  assert.equal(S.hebrew('לַיהוָ֑ה'), 'לַאדֹנָי');
  assert.equal(S.hebrew('בַּֽיהוָ֖ה'), 'בַּאדֹנָי');
  assert.equal(S.hebrew('וַֽיהוָ֗ה'), 'וַאדֹנָי');
  assert.equal(S.hebrew('מֵיְהוָ֔ה'), 'מֵ' + ADONAI);
  assert.equal(S.hebrew('וּמֵיְהוָה'), 'וּמֵ' + ADONAI);
  assert.equal(S.hebrew('וְלֵיהוִה'), 'וְלֵאלֹהִים');
  assert.equal(S.hebrew('יֱהוִה'), ELOHIM);
});

test('words that only look like the name are left alone', () => {
  assert.equal(S.hebrew('יְהוּדָה'), 'יְהוּדָה');
  assert.equal(S.hebrew('יָהּ'), 'יָהּ');
  assert.equal(S.hebrew('וִיהוֹשֻׁעַ'), 'וִיהוֹשֻׁעַ');
});

test('ktiv and qere: the qere is read', () => {
  assert.equal(S.hebrew('הוצא (הַיְצֵ֣א) אִתָּ֔ךְ'), 'הַיְצֵא אִתָּךְ');
  assert.equal(S.hebrew('אֶת־יעיש (יְע֥וּשׁ)'), 'אֶת יְעוּשׁ');
  assert.equal(S.hebrew('בגד (בָּ֣א גָ֑ד)'), 'בָּא גָד');
  assert.equal(S.hebrew('בֶן־בנימן־ (בָּנִ֔י מִן־) הַגִּבְעָה'), 'בֶן בָּנִי מִן הַגִּבְעָה');
  assert.equal(S.hebrew('כִּֽי־אם ( ) גֹּאֵל'), 'כִּי גֹּאֵל');
  assert.equal(S.hebrew('והיה (וְהָי֣וּ ׀) שָׁם'), 'וְהָיוּ שָׁם');
  assert.equal(S.hebrew('וְלֹ֣א אָב֔וּ (בְּנֵ֣י) בִנְיָמִ֔ן'), 'וְלֹא אָבוּ בְּנֵי בִנְיָמִן');   // a qere with no ktiv
});

test('section marks, large letters, line breaks', () => {
  assert.equal(S.hebrew('<big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א׃ {פ}'), 'בְּרֵאשִׁית בָּרָא.');
  assert.equal(S.hebrew('אָז יָשִׁיר {ס}\nמֹשֶׁה'), 'אָז יָשִׁיר מֹשֶׁה');
});

test('the punctuated edition: its punctuation kept, maqaf "-" a space, a dash "--" a pause', () => {
  assert.equal(S.hebrew('אֵלֶּה תוֹלְדוֹת הַשָּׁמַיִם וְהָאָרֶץ, בְּ<small>הִ</small>בָּרְאָם: בְּיוֹם, עֲשׂוֹת יְהוָה אֱלֹהִים--אֶרֶץ וְשָׁמָיִם.'),
    'אֵלֶּה תוֹלְדוֹת הַשָּׁמַיִם וְהָאָרֶץ, בְּהִבָּרְאָם: בְּיוֹם, עֲשׂוֹת ' + ADONAI + ' ' + ELOHIM + ', אֶרֶץ וְשָׁמָיִם.');
  assert.equal(S.hebrew('וַיֹּאמֶר אַבְרָם, אֲדֹנָי יְהוִה מַה-תִּתֶּן-לִי, וְאָנֹכִי, הוֹלֵךְ עֲרִירִי;'),
    'וַיֹּאמֶר אַבְרָם, ' + ADONAI + ' ' + ELOHIM + ' מַה תִּתֶּן לִי, וְאָנֹכִי, הוֹלֵךְ עֲרִירִי;');
  assert.equal(S.hebrew('עַל-הָאָרֶץ--הוצא (הַיְצֵא) אִתָּךְ; וְשָׁרְצוּ'), 'עַל הָאָרֶץ, הַיְצֵא אִתָּךְ; וְשָׁרְצוּ');
  assert.equal(S.hebrew('אֶת-יעיש (יְעוּשׁ) וְאֶת-יַעְלָם'), 'אֶת יְעוּשׁ וְאֶת יַעְלָם');
  assert.equal(S.hebrew('וְהַחֹשֶׁךְ--.'), 'וְהַחֹשֶׁךְ.');
});

test('English: section marks, brackets, LORD', () => {
  assert.equal(S.english('In the day that the LORD God made earth and heaven. {P}'),
    'In the day that the Lord God made earth and heaven.');
  assert.equal(S.english('a living soul, [I have given] every green herb {S}'),
    'a living soul, I have given every green herb');
  assert.equal(S.english('O Lord GOD, what wilt Thou'), 'O Lord God, what wilt Thou');
});

/* ---------- corpus ---------- */

function corpus(dir, suffix, layer) {
  const full = path.join(opt.root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter(f => f.endsWith(suffix)).flatMap(f => {
    const doc = F.parse(fs.readFileSync(path.join(full, f), 'utf8'), layer);
    return doc.chapters.flatMap(ch => ch.laws.map(l => ({ where: `${f} ${ch.n}:${l.n}`, text: [l.text].concat(l.extra).join('\n') })));
  });
}

const HE = corpus('Hebrew', '-he.md', 'he');
const TP = corpus('Hebrew', '-tp.md', 'tp');
const EN = corpus('Translation', '-en.md', 'en');

test('every Hebrew verse: no accents, markup, ktiv or divine name left', () => {
  if (!HE.length) return;
  const bad = [];
  let names = 0;
  for (const v of HE.concat(TP)) {
    if (NAME.test(F.stripNiqqud(v.text))) names++;
    const out = S.hebrew(v.text);
    if (ACCENTS.test(out) || /[(){}<>|\u05BE\u05C0\u05C3]/.test(out) || NAME.test(F.stripNiqqud(out)) || !out) bad.push(`${v.where}: ${out}`);
  }
  assert.ok(names > 6000, `only ${names} verses with the name found`);
  assert.deepEqual(bad.slice(0, 10), []);
});

test('every Hebrew verse: Adonai and Elohim as many times as the name', () => {
  if (!HE.length) return;
  const count = (s, w) => words(s).filter(x => x.endsWith(w)).length;
  const strip = s => F.stripNiqqud(s);
  for (const v of HE) {
    const n = F.stripNiqqud(F.stripTeamim(v.text.replace(/\S*\s*\([^)]*\)/g, ''))).split(/[\s־]+/).filter(w => /^[ובלכמהש]{0,3}יהוה/.test(w.replace(/[׃]/g, ''))).length;
    if (!n) continue;
    const out = strip(S.hebrew(v.text.replace(/\S*\s*\([^)]*\)/g, '')));
    const before = strip(F.stripTeamim(v.text.replace(/\S*\s*\([^)]*\)/g, '')));
    const got = count(out, 'דני') + count(out, 'להים') - count(before, 'דני') - count(before, 'להים');
    assert.equal(got, n, v.where);
  }
});

test('every verse of the punctuated edition: no hyphens or dashes left, nothing before a mark', () => {
  const bad = TP.map(v => ({ v, out: S.hebrew(v.text) })).filter(x => /-| [.,;:?!]|[,;:][.,;:?!]|^[.,;:]/.test(x.out));
  assert.deepEqual(bad.slice(0, 10).map(x => `${x.v.where}: ${x.out}`), []);
});

test('every English verse: no section marks or brackets', () => {
  const bad = EN.map(v => ({ v, out: S.english(v.text) })).filter(x => /[{}[\]]/.test(x.out) || /\bLORD\b/.test(x.out) || !x.out);
  assert.deepEqual(bad.slice(0, 10).map(x => `${x.v.where}: ${x.out}`), []);
});

console.log(`${passed} passed, ${failures.length} failed` + (HE.length ? `, over ${HE.length} verses` : ' (no corpus at ' + opt.root + ')'));
for (const f of failures) console.log('  ✗ ' + f);
process.exitCode = failures.length ? 1 : 0;
