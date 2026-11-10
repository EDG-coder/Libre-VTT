# Importing a book you own

The compendium can read the entries (spells, monsters, items, feats, species, classes, backgrounds,
conditions) from a PDF of a rulebook **you bought**, or from text you paste. It is meant for personal use, so
LIBRE VTT keeps that content to you:

- **It stays on your device.** The entries go into a private catalog, not into the campaign folder:
  - desktop and phone app: `manuali-privati` inside the app data folder
    (macOS `~/Library/Application Support/LIBRE VTT/`, Windows `%APPDATA%\LIBRE VTT\`,
    Linux `~/.config/libre-vtt/`); started by hand with `npm start`, `~/.libre-vtt/manuali-privati`
    (or the folder in `LIBRE_MANUALI`);
  - website (players in the browser): the browser's own storage (IndexedDB) for that site, on that device only.
- **It is never sent to anyone.** Not to the GM, not to the other players, not to the relay, not to the website.
  The GM's table never puts a private package in the list it sends to players (`COMPENDIO.perRete`), and the
  game server refuses to store or forward one (`storeAsset` in `server/game-server.js`).
- **It is never exported.** *Export* is not offered for it and the server refuses it; campaign exports
  (`.zip`) leave it out; the translation file (*Download the file to translate*) leaves it out.
- **Its text does not leak into shared things.** When you drag a monster on the map, add a spell or an item to a
  sheet, or build a character step by step from a private entry, the sheet gets the name and the game numbers
  (dice, level, AC, HP…), not the description: a line points to your compendium instead. *Show in chat* sends
  only the name and a short summary (level, school, CR). *Copy as new entry (homebrew)* is not offered, because
  homebrew goes to the players.
- **Everyone imports their own book.** A player who wants a book in their compendium imports their own copy, on
  their own device. The GM's books never reach them.

## Protected PDFs are not read

LIBRE VTT never removes or bypasses protections. **Any encrypted PDF is refused**, with a clear message,
before a single page is read:

- it needs a password to open;
- it is encrypted, even if it opens without a password and even if the publisher allows copying its text;
- it uses a DRM scheme.

The check looks for the PDF encryption dictionary (`/Encrypt`) in the file, then asks pdf.js again after opening
it. Use a PDF without any protection. There is no option to force it, and no password prompt.

## Before you import

The import window asks you to confirm that you own the book and that you import it for personal use only; the
buttons to choose the PDF or paste text stay disabled until you tick it.

## Packages imported with older versions

Up to 3.9.0 the imported books were saved in the campaign (`compendio/manuale-…`) and the GM's table could send
them to players. Now:

- they are recognized (package marked *personal use* with the "Copied from a book you own" license, or an id that
  starts with `manuale-`) and treated as private: never sent, never exported, left out of campaign exports;
- when the game server starts, it deletes from its storage (`data/assets`) any copy of a book package that an
  older version had sent, on the GM's computer and on the players' (their copy is cleaned the next time they
  start a game).

They stay where they are, in the campaign folder: you can move them by deleting the package and importing the
book again.

## What this does not cover

- A plugin with **full access** runs inside the table with your permissions and could read your compendium. Only
  install full-access plugins you trust (the sandbox ones cannot).
- The command-line tool in `sviluppo/strumenti/manuale-a-json/` writes a JSON file wherever you tell it: that file
  is yours to keep private.
- Nothing from the official books is in this repository or in the release files: the program only includes the
  SRD (under its CC-BY-4.0 license).
