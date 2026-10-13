/* The Noahide Digest: comments chosen from the commentators, gathered as a
   commentary of their own (Digest/{book}-digest.md, the 'digest' layer),
   edited as the commentary is, in drafts submitted as pull requests.

   CHOOSING. In the notes pane each of a commentator's comments has a star
   (reader.js cmCell): it copies the comment into the digest, on the same
   verse, or takes it out again. An entry is the comment's text, as it then
   stood, after a tag naming where it came from:

     [^1.4.1]: {ramban-en 1.4.2} **AND G-D SAW THE LIGHT, THAT IT WAS GOOD.** …

   the commentator's layer (F.cmLayer) and the comment's label there. The tag
   is how an entry is attributed and how the star knows its comment is in;
   the copy keeps the digest whole if a commentator's files are rebuilt, and
   lets an entry be trimmed (its pencil, like any note). A note with no tag
   is a note of one's own, and shows as one.

   READING. The digest is a notes layer like the others: its entries show in
   the notes pane, and the Display menu shows or hides it. */

(function (TR) {
  'use strict';

  const UI = TR.ui;
  const E = TR.edit;
  const lib = TR.lib;
  const LAYER = 'digest';
  const TAG = /^\{([a-z][a-z0-9]*)-(he|en) (\d+\.\d+\.\d+)\}\s*/;

  /* An entry's source, or null for a note of one's own:
     { cm, lang, label, text } (text: the rest of its first paragraph). */
  function source(n) {
    const m = TAG.exec(n.text || '');
    return m ? { cm: m[1], lang: m[2], label: m[3], text: n.text.slice(m[0].length) } : null;
  }

  const tagOf = function (cmLayer, label) { return '{' + cmLayer + ' ' + label + '}'; };

  /* The label of the entry on verse `key` that holds comment `label` of
     layer `cmLayer`, or null. */
  function entryFor(doc, key, cmLayer, label) {
    const want = tagOf(cmLayer, label);
    const hit = lib.notesFor(doc, key).find(function (n) { return (n.text || '').indexOf(want) === 0; });
    return hit ? hit.label : null;
  }

  function commentator(id) {
    return lib.commentators.find(function (c) { return c.id === id; }) || null;
  }

  /* An entry as shown, in the pane and in the stream: who it is from, then
     the comment in its language. `paint(n, lang)` draws a note's text. */
  function content(n, paint) {
    const s = source(n);
    if (!s) return [UI.el('div.dg-src.own', [UI.el('span', { text: 'Note' })]), paint(n, 'en')];
    const c = commentator(s.cm);
    return [
      UI.el('div.dg-src', { title: c && c.full ? c.full : null }, [
        TR.icons.commentators(),
        UI.el('span.dg-name', { text: c ? c.en : s.cm }),
        c && c.he ? UI.el('span.dg-he', { lang: 'he', dir: 'rtl', text: c.he }) : null,
        UI.el('span.dg-lang', { text: s.lang === 'he' ? 'Hebrew' : 'English' })
      ]),
      UI.el('div.dg-body', s.lang === 'he' ? { lang: 'he', dir: 'rtl' } : null,
        paint(Object.assign({}, n, { text: s.text }), s.lang))
    ];
  }

  /* Put comment `n` of `cmLayer` (on verse `key` of book `id`) into the
     digest, or take it out if it is in. → Promise<true if now in>. */
  function toggle(id, key, cmLayer, n) {
    let added = false;
    return TR.editor.close().then(function () {
      return lib.edit(id, LAYER, function (doc, sec) {
        const at = doc && entryFor(doc, key, cmLayer, n.label);
        if (at) return E.setNote(doc, LAYER, at, '');
        added = true;
        return E.addNote(doc, LAYER, key, tagOf(cmLayer, n.label) + ' ' + E.noteBody(n), sec.en);
      });
    }).then(function () {
      UI.toast(added ? 'Added to the Noahide Digest.' : 'Taken out of the Noahide Digest.');
      return added;
    });
  }

  TR.digest = { source: source, entryFor: entryFor, content: content, toggle: toggle };

})(window.TR);
