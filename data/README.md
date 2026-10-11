# Aliyot and joined parashot

`aliyot.json` says where each aliyah of a Torah reading begins, and its maftir. The reader marks them in a strip beside the text on a parashah's or holiday's Torah page (not on its haftarot).

`doubles.json` lists the parashot read together in some years. Each becomes a portion of its own, listed at the end of its book's parashot.

## The file

```json
"0101": {
  "name": "Bereishit",
  "aliyot": ["Genesis 1:1", "Genesis 2:4", "Genesis 2:20", "Genesis 3:22", "Genesis 4:19", "Genesis 4:23", "Genesis 5:25"],
  "maftir": "Genesis 6:5",
  "notes": ["Aliyah 5: some sources use 4:19-26", "Aliyah 6: some sources use 5:1-24"]
}
```

- **The key** is the portion's id in the texts' `index.json`: `0101`–`0511` for the 54 parashot, `r01`–`r32` for the holiday and special readings.
- **`aliyot`** lists where each aliyah begins, in order. Each runs to where the next begins. A holiday reading has as many as it has (five on a weekday festival, three on a fast day, and so on), and may cross books (Simchat Torah's seventh is Genesis 1:1).
- **`maftir`** is where the maftir begins; it runs to the end of the reading. A reading that is only a maftir (Shekalim, Zakhor, Parah, Ha-Chodesh, Shabbat Rosh Chodesh) has no `aliyot`.
- **References** are `Book chapter:verse`, with the book named as `index.json` names it, and in **Mechon Mamre's verse numbering**, which is what the texts use (see below).
- **`shabbat`**, on a holiday reading, is its division when it falls on Shabbat, in the same form (`aliyot`, `maftir`). It may begin earlier than the weekday reading: Passover's last day and Shavu'ot's second begin at Deuteronomy 14:22 on Shabbat and at 15:19 on a weekday, and the page then shows the reading from there. A holiday page has a Weekday / Shabbat switch for it.
- **`on`**, on a holiday reading with no `shabbat`, says it falls only on a `"weekday"` (Rosh Hashanah's second day, the fasts, Purim and so on) or only on `"shabbat"` (the intermediate Sabbaths, Sheqalim and the other special Sabbaths). The switch then shows the one that applies. A reading with neither (Yom Kippur afternoon) is divided the same way on either day.
- **`name`** and **`notes`** are for whoever edits the file; the reader shows neither.

To change a division, edit the references; to add a portion, add its id. A reference to a book the reader doesn't know is skipped.

### doubles.json

```json
{ "id": "0210-0211", "parts": ["0210", "0211"], "haftarah": "0211" }
```

A double runs from its first part's beginning to its second's end, takes its name from both, and reads the haftarah of the part named in `haftarah`, as `index.json` has it. That is the second parashah's, except Nitzavim–Vayeilekh, which reads Nitzavim's (שוש אשיש, the last of the seven haftarot of consolation). Its aliyot are in `aliyot.json` under its `id`.

## Where it came from

[Hebcal](https://github.com/hebcal/hebcal-leyning)'s leyning data, version 10.1.0 (`aliyot.json` for the parashot and the joined parashot, `holiday-readings.json` for the holidays, weekday and "on Shabbat"), BSD-2-Clause, Copyright (c) 2020, hebcal. Hebcal's parashah divisions are the ones in common use; its "notes" on alternatives are kept.

[Chabad.org](https://www.chabad.org/parshah/otherparshas_cdo/aid/9175/jewish/Complete-Parshah-List.htm) was the first choice, but its site stopped serving pages to the import after two and a half parashot (a bot check). Those agree with Hebcal exactly: Bereishit and Noach in every aliyah and the maftir, Lekh Lekha in every aliyah.

For the holidays, the divisions are the Diaspora's (its second festival days are among the readings), on a weekday and, where it differs, on Shabbat.

## Against Mechon Mamre

Mechon Mamre's parashah divisions are authoritative here. Every parashah's aliyot fit within it exactly, and so do every joined parashah's within its two parts: the first begins where the reading does, the seventh ends where it ends, and they run without gaps or overlaps.

### Verse numbering

Hebcal numbers verses as most Hebrew Bibles do. Mechon Mamre differs in three chapters, and the references here have been renumbered to match it (checked against the text):

| Chapter | Most Bibles | Mechon Mamre | References moved |
|---|---|---|---|
| Exodus 20 | 23 verses | 22: "I am the Lord your God" and "You shall have no other gods" are one verse, so from "You shall not make yourself a carved image" its numbers are one lower | Yitro's 7th aliyah 20:15 → 20:14 ("וכל העם ראים"); its maftir 20:19 → 20:18 ("ויאמר יהוה אל משה כה תאמר"); Shavu'ot's 5th aliyah 20:15 → 20:14 |
| Deuteronomy 5 | 30 verses | 29, for the same reason | Va'etchanan's 4th aliyah 5:19 → 5:18 ("את הדברים האלה") |
| Numbers 25 | 19 verses | 18: "And it came to pass after the plague" (25:19) begins 26:1 | none (no aliyah begins there) |

Yitro itself ends at 20:22 here, where Chabad's list says 20:23; that is the same numbering difference, not a different division.

### Readings that differ

- **Passover, Intermediate Sabbath (`r21`).** Mechon Mamre's reading table gives its maftir as Numbers 28:16–25; it is 28:19–25 (28:16–18 is the first day's), as Hebcal has it. The import corrects it (`tools/import.mjs`, `READING_FIXES`), and the texts' `index.json` says 28:19–25.
- **Sukkot, Intermediate Sabbath (`r08`).** Mechon Mamre's reading has no maftir from Numbers; it depends on which day of the festival the Sabbath is (Hebcal's five are in the notes). The file has the seven aliyot and no maftir.

### Not covered

- Readings with no Torah portion in `index.json` (Shabbat Shuvah, Chanukkah's Sabbaths, Shabbat Ha-Gadol, the Sabbath before Rosh Chodesh): only their haftarot are listed.
- Israel's festival readings.
- A double's haftarah when a special Sabbath (Sheqalim, Ha-Chodesh, Rosh Chodesh) displaces it.
