# Tanakh Reader

A reader for the Tanakh, with the Hebrew, Targum Onqelos and English side by side, one row per verse, and a place under every verse for commentary and review notes. It exists to write a **Commentary on the Tanakh for Noahides**.

It is a sibling of [MT Reader](https://github.com/yaaqov22/mt-reader) and shares its design: a static, offline-first web app with no build step, reading the texts from a GitHub repository ([tanakh](https://github.com/yaaqov22/tanakh)) with each user's own token, keeping edits as drafts on the device and submitting them as pull requests.

## What it shows

| Column | Source (Mechon Mamre) | Notes |
|---|---|---|
| Hebrew | `ct005` with cantillation | The **א / אָ / אָ; / אָ֑** buttons show it as letters only, with vowels (the cantillated text with its accents removed), with vowels and Mechon Mamre's punctuation (`t002`), or with cantillation. |
| Targum | `u002` / `q001` | Torah only. It is shown unpointed when the Hebrew is shown as letters only. |
| English | `et002` (JPS 1917) | |
| Commentary | yours | Editable. |
| Review notes | yours | Editable, and signed with your name and the date. |

The texts themselves are read-only. Only the commentary and review notes are edited.

### By chapter or by parashah

- **Books** lists Torah, Prophets and Writings, each book with a grid of its chapters (`#/read/01/3`).
- **Parashot** lists the 54 weekly portions as the **Tiqqun Qore'im** (`cp002`) divides them. Each one opens as a single page running across chapters (`#/portion/0101`), with tabs for its haftarah (Ashkenazi and Sephardi where they differ, `#/portion/0101/ash`, `/sef`).
- **Holidays** lists the festivals' and special Shabbatot's readings (`#/portion/r05`), from Mechon Mamre's reading table.

Open sections (petuchah) and closed sections (setumah) appear as wide and narrow gaps after their verses, with a small פ or ס in the Hebrew. The songs keep their line layout. Ktiv and qere show as the written form followed by the read form in parentheses.

## Running it

The app is static files. During development it reads the texts from a sibling checkout, `../tanakh/`, with no token needed:

- In Claude Code, start the `tanakh-reader` configuration in `.claude/launch.json`. It runs PHP's built-in server on port 8152 and serves the parent `repos` folder.
- Open <http://127.0.0.1:8152/tanakh-reader/>.

Elsewhere, in Settings, choose **GitHub**, the repository (`yaaqov22/tanakh`), the branch (`main`) and a fine-grained token:
- Reading needs Contents: read.
- Submitting needs Contents and Pull requests set to "Read and write".

The service worker is off on localhost unless the page is opened with `?sw=1`; `?sw=0` removes it.

## The texts: `tools/import.mjs`

`tanakh` is generated from Mechon Mamre's zips, which are kept in its `Original/` folder:

```bash
NODE="/c/Program Files/Microsoft Visual Studio/2022/Community/MSBuild/Microsoft/VisualStudio/NodeJs/win-x64/node.exe"
"$NODE" tools/import.mjs --src ../tanakh --out out/data
```

The importer unpacks the zips under `out/src/` and converts each chapter page into one Markdown file per book per layer. It also builds `index.json` (books, verse counts, parashot, haftarot, holiday readings) and writes `REPORT.md`, which lists every fix it made. It refuses to write anything unless:

- every edition lines up with the cantillated Hebrew verse for verse (23,202 verses in 929 chapters);
- the parashot cover the Torah from Genesis 1:1 to Deuteronomy 34:12 with no gaps;
- every haftarah and holiday reference names verses that exist.

Copy `out/data/` over the `tanakh` checkout to update it. Commentary and Notes are never generated, so copying never touches them.

### File format

`js/format.js` is the single parser and writer, shared by the app and the tools. A file is canonical exactly when `write(parse(file)) === file`.

```
Hebrew/01-he.md        # בראשית / ## בראשית פרק א / **א,א** <big>בְּ</big>רֵאשִׁ֖ית …
Hebrew/01-tp.md        the punctuated edition, same shape
Targum/01-onq.md       Onqelos (Torah only); 01-onqk.md unpointed
Translation/01-en.md   # Genesis / ## Genesis, Chapter 1 / 1:1 In the beginning …
Commentary/01-co.md    [^1.1.1]: text   (chapter.verse.n; continuation paragraphs tab-indented)
Notes/01-notes.md      the same, for review notes
```

Book ids are Mechon Mamre's: `01`–`05` are the Torah, `08a`/`08b` are Samuel, `25a`/`25b` are Chronicles (first among the Writings), and `35a`/`35b` are Ezra and Nehemiah.

Inside a verse:
- `{פ}` `{ס}` `{ר}` `{ש}` are Mechon Mamre's section and layout marks (`{P}` `{S}` `{N}` in the English).
- A newline is a line break.
- `<big>`, `<small>` and `<sup>` mark large, small and suspended letters.
- `(…)` is the qere.

## Tests

```bash
"$NODE" tools/test-format.mjs --root ../tanakh
```

```bash
"$NODE" tools/test-edit.mjs --root ../tanakh
```

```bash
"$NODE" tools/test-submit.mjs
```

- `test-format` covers the parser and the whole corpus: canonical round trip, alignment of every edition, `index.json`, and the parashot tiling.
- `test-edit` covers editing notes and the round-trip guard.
- `test-submit` covers merging and submitting against an in-memory fake GitHub.

## Code

The same layout as MT Reader. Every script attaches itself to `window.TR`.

| File | What it does |
|---|---|
| `js/format.js` | Parses and writes the texts, layer paths, and strips te'amim and niqqud |
| `js/library.js` | The index (books, parashot, readings), loading a book's layers, the Hebrew view modes |
| `js/reader.js` | The chapter and portion views, columns, notes, editing, bookmarks |
| `js/books.js` | Home screens: Books, Parashot, Holidays |
| `js/markdown.js` | Inline Markdown for notes, and verse rendering (section marks, ktiv/qere, large letters) |
| `js/search.js` | Search over Hebrew, Targum, English and notes; matches with or without vowels |
| `js/edit.js`, `merge.js`, `submit.js`, `changes.js`, `review.js`, `branches.js`, `session.js` | Drafts, merging, pull requests, reviewing branches, live sessions (from MT Reader) |
| `tools/import.mjs` | Builds the `tanakh` repo from the zips |

## Still to do

- Bundle a font with full cantillation support (e.g. Taamey Frank CLM or SBL Hebrew) so it doesn't depend on what the device has installed.
- The "upper" cantillation of the Ten Commandments (Mechon Mamre's `upper10` pages) as an alternative view.
- Aliyot within the parashot. The Tiqqun doesn't mark them, so they need another source.
- An Android shell, as planned for MT Reader.
