# Tanakh Reader

A reader for the Tanakh, with the Hebrew, Targum Onqelos and English side by side, one row per verse, and a place under every verse for commentary and review notes, and the places the Mishneh Torah quotes it. It exists to write a **Commentary on the Tanakh for Noahides**.

It is a sibling of [MT Reader](https://github.com/yaaqov22/mt-reader) and shares its design: a static, offline-first web app with no build step, reading the texts from a GitHub repository ([tanakh](https://github.com/yaaqov22/tanakh)) with each user's own token, keeping edits as drafts on the device and submitting them as pull requests.

## What it shows

| Column | Source (Mechon Mamre) | Notes |
|---|---|---|
| Hebrew | `ct005` with cantillation | The Display menu shows it as letters only, with vowels (the cantillated text with its accents removed), with vowels and Mechon Mamre's punctuation (`t002`), or with cantillation. |
| Targum | `u002` / `q001` | Torah only. It is shown unpointed when the Hebrew is shown as letters only. |
| English | `et002` (JPS 1917) | |
| Commentary | yours | Editable. |
| Review notes | yours | Editable, and signed with your name and the date. |
| MT links | the [Mishneh Torah](https://github.com/yaaqov22/mishneh-torah) | Every halakhah that quotes the verse: its name, chapter and number, linked to it in [MT Reader](https://yaaqov22.github.io/mt-reader/), then its text. Generated (`tools/mt-links.mjs`), not edited. |

The texts themselves are read-only. Only the commentary and review notes are edited.

### By chapter or by parashah

- **Books** lists Torah, Prophets and Writings, each book with a grid of its chapters (`#/read/01/3`).
- **Parashot** lists the 54 weekly portions as the **Tiqqun Qore'im** (`cp002`) divides them. Each one opens as a single page running across chapters (`#/portion/0101`), with tabs for its haftarah (Ashkenazi and Sephardi where they differ, `#/portion/0101/ash`, `/sef`).
- **Holidays** lists the festivals' and special Shabbatot's readings (`#/portion/r05`), from Mechon Mamre's reading table.

In the reader, the header names the book and chapter (or the parashah), between the arrows to the previous and next. The chapter opens a grid of the book's chapters; the book's name opens the same three lists, to go straight to a chapter of another book, or to a parashah or holiday reading.

### Three layouts

The first buttons in the reader's header switch between them.

- **Interlinear**: one row per verse, the texts side by side, the commentary, review notes and MT links under each verse. The section marks show as they stand in the text (`{פ}`, `{ס}`, `{ר}`, `{ש}`, and the English's `{P}`, `{S}`, `{N}`), small and grey, and nothing is laid out by them.
- **Side by side**: the Hebrew at the right and one other text beside it (the English, or the Targum on the Torah, chosen in the Display menu), each laid out as the scroll is, by its own section marks (the English's `{P}`, `{S}` and `{N}` read as `{פ}`, `{ס}` and `{ר}`), each with its own verse numbers. The columns are lined up only where both have a full break (an open section, a song's line end or a blank line, but not a closed section) after the same verse: there both start level again, and in between each runs free in its own shape. Selecting a verse in either lights it in both, and its commentary, review notes and MT links show in a pane across the bottom of the screen, to read and edit there (and to bookmark the verse); its arrows step to the previous and next verse with notes. The pane opens and closes from its bar, and its top edge drags to make it taller or shorter; it stays open or closed, and as tall, whatever verse is chosen, until changed. A book's or chapter's general commentary stands above the columns, opened by its marker. On narrow screens each section's Hebrew goes above its other text.
- **Scroll**: the Hebrew alone, set as a scroll sets it. An open section (`{פ}`) ends its paragraph, and what follows starts on a new line. A closed section (`{ס}`) is a gap within the line. In the songs and lists written in their own layout (the Song of the Sea, Ha'azinu, the kings of Joshua 12, the sons of Haman), each line ends at `{ר}` and its parts are spread across the column, which gives the brick patterns. `{ש}` is a blank line. The verse numbers stand in a margin at the right, each level with the line its verse starts on, with a dot when the verse has commentary (grey) or review notes (brown). Select a verse, by its number or its text, to open it in the panel beside the scroll: its translation and Targum, and its commentary and review notes, which are read and edited there as in the interlinear rows. On narrow screens the panel rises from the bottom. **j** / **k** move to the next and previous verse, and **Esc** closes it.

Everything else about how the text looks is in the **Display** menu, whose button shows the Hebrew's current mode: the Hebrew's four modes and which columns show. In the scroll layout those are the columns shown in the panel.

Ktiv and qere show as the written form followed by the read form in parentheses.

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

## The MT links: `tools/mt-links.mjs`

```bash
"$NODE" tools/mt-links.mjs
```

It reads the sibling checkouts `../mishneh-torah` (the texts) and `../mt-reader` (its `js/refs.js`, which finds the Tanakh references in them) and writes `../tanakh/MT/`, replacing what is there. Every halakhah's citations are read from its Hebrew, "(דברים ו,ד)", which numbers the verses as Mechon Mamre does; from its English, "(Deuteronomy 6:4)", only where the Hebrew cites nothing (the English sometimes numbers Exodus 20 differently). A range is linked on its first verse, and a chapter cited alone on its verse 1. The quoted text is the English, or the Hebrew where the halakhah isn't translated yet.

### File format

`js/format.js` is the single parser and writer, shared by the app and the tools. A file is canonical exactly when `write(parse(file)) === file`.

```
Hebrew/01-he.md        # בראשית / ## בראשית פרק א / **א,א** <big>בְּ</big>רֵאשִׁ֖ית …
Hebrew/01-tp.md        the punctuated edition, same shape
Targum/01-onq.md       Onqelos (Torah only); 01-onqk.md unpointed
Translation/01-en.md   # Genesis / ## Genesis, Chapter 1 / 1:1 In the beginning …
Commentary/01-co.md    [^1.1.1]: text   (chapter.verse.n; continuation paragraphs tab-indented)
Notes/01-notes.md      the same, for review notes
MT/01-mt.md            the same, for MT links: [^6.4.2]: ***[Laws of … 1:7](https://…/mt-reader/#/read/1-1/1/7)*** - text
```

Book ids are Mechon Mamre's: `01`–`05` are the Torah, `08a`/`08b` are Samuel, `25a`/`25b` are Chronicles (first among the Writings), and `35a`/`35b` are Ezra and Nehemiah.

Inside a verse:
- `{פ}` `{ס}` `{ר}` `{ש}` are Mechon Mamre's section and layout marks (`{P}` `{S}` `{N}` in the English).
- A newline is a line end (in the songs and lists, as `{ר}` is).
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
| `js/reader.js` | The chapter and portion views in both layouts, the Display menu, the scroll's verse panel, notes, editing, bookmarks |
| `js/scroll.js` | The scroll layout: the text cut into paragraphs, song lines and blank lines by its section marks, and the verse numbers' margin |
| `js/books.js` | Home screens: Books, Parashot, Holidays |
| `js/markdown.js` | Inline Markdown for notes, and verse rendering for the interlinear layout (section marks as written, ktiv/qere, large letters) |
| `js/search.js` | Search over Hebrew, Targum, English and notes, and the MT links when their chip is on (off by default); matches with or without vowels |
| `js/edit.js`, `merge.js`, `submit.js`, `changes.js`, `review.js`, `branches.js`, `session.js` | Drafts, merging, pull requests, reviewing branches, live sessions (from MT Reader) |
| `tools/import.mjs` | Builds the `tanakh` repo from the zips |
| `tools/mt-links.mjs` | Builds its `MT/` links from the Mishneh Torah |

## Still to do

- Bundle a font with full cantillation support (e.g. Taamey Frank CLM or SBL Hebrew) so it doesn't depend on what the device has installed.
- The "upper" cantillation of the Ten Commandments (Mechon Mamre's `upper10` pages) as an alternative view.
- Aliyot within the parashot. The Tiqqun doesn't mark them, so they need another source.
- An Android shell, as planned for MT Reader.
