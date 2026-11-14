# Accessibility

LIBRE VTT wants to be usable by as many players and masters as possible. This page says honestly what works
today, what does not, and how to report it.

## Where it works

- Apps for Windows 10/11, macOS (Apple Silicon and Intel), Linux (x64, ARM64, RISC-V), Android 7+ and iPhone; or
  in a modern browser at the local address; players can also join from the website.
- Interface in Italian and English.

## What is already there

- Dark, light or system theme.
- With «Reduce motion» on in the system, animations stop.
- Many commands have keyboard shortcuts: arrows to move tokens, Delete, Ctrl/Cmd+C and V, Ctrl/Cmd+Z; dice can
  also be rolled by typing in chat (`/r 1d20+5`).
- The main buttons and panels have a label readable by screen readers.
- **Built-in voice** (no service, it uses the device's own speech synthesis): the first time you open the app it
  asks whether to keep the **screen reader** (it reads what you move to with Tab, tap or rest the mouse on, the
  windows that open, notices and new chat messages) or only a **chat reader** that reads new messages aloud and
  can be switched off with the 🔊 button next to «Send». You can change it from the ⚙ gear in the home and in the
  table's Settings › «Voice and screen reader» (voice, speed, pitch, volume). Shortcuts: Alt+Shift+L reads the
  screen, Alt+Shift+S the selected text, Alt+Shift+P pauses, Esc stops; in chat `/leggi` and `/silenzio`.
  If you already use VoiceOver, TalkBack or NVDA, choose «No voice»: the chat is also marked as a live log, so
  system screen readers announce new messages on their own.
- Map and text zoom with the browser or system controls.

## Known limits

- **The map is graphical**: tokens, fog and lights are not read by a screen reader. Someone who cannot see the map
  can follow the game from the chat and the sheets.
- Some actions need dragging with the mouse or a finger (moving windows, drawing fog, resizing).
- Some states use colour only (for example the hit point bar on tokens).
- The parchment-style sheets have small text on a light background; there is no high-contrast theme yet.

## Reporting a barrier

Open an [issue](https://github.com/EDG-coder/Libre-VTT/issues/new/choose) with the «Problem» form and write
«Accessibility» in the title. Tell us what you wanted to do, with which aid (screen reader, keyboard,
magnification…) and on which system. Barriers come before new features.
