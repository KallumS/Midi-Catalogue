# 0012. Apple's HIG Foundations are the standard for the window

Taken 2026-10-15. Stands.

## Context

The user asked for every repository to follow Apple's Human Interface
Guidelines, as Transient Shuffler does, and sent the 19 Foundations pages.
Wording was already done (0011). Checked against the rest, the window fell
short on contrast, text size, control size, the keyboard, colour alone, and
where its messages sat ([`docs/apple-hig-review.md`](../apple-hig-review.md)).

## Decision

The same as Midi Suggester's 0009, so the family's windows behave alike:

- **Contrast.** Every line of text is at least 7:1 on the ground, Apple's
  target for small text in a dark window: secondary text is `#B0B6C0`,
  warnings `#FF9E96`. The house red `#D2483F` and the ramp's `#8A919C` are
  no longer used for words. Disabled text keeps `#8A919C`; Apple exempts it.
- **Text Size** in a View menu: 100%, 125%, 150%, 200%, with Cmd+=, Cmd+- and
  Cmd+0. Every fixed width goes through `px()`, and `fit()` never makes a
  button narrower than its label. Saved with the preferences, clamped on load.
- **The system's sans-serif at 13 points**, the Mac's default size.
- **Controls 28 points tall, 12 apart** (Apple's Mac default size and
  spacing), pushed with the font before `Begin`.
- **Keyboard navigation** (`ConfigFlags_NavEnableKeyboard`), its ring in the
  near-white `#F2F4F7`: yellow means *on*, and a focused control need not be.
- **Not colour alone**: a chosen button carries an ink bar under its label.
- **The message at the top**, until dismissed or replaced.
- The text size is saved under its own key, `view`, not in `st`: the engine owns `st`.

## Consequences

- The window is taller and wider at the same content; rows of choices wrap.
- Every new control goes through `pick()`, so it gets the sizes, the ink and
  the chosen bar for nothing. A fixed width must go through `px()`.
- `tests/hig_mock.lua` (shared with the family) adds the HIG calls to the
  mocked ReaImGui and holds the checks; every rule was broken on purpose and
  the suite failed.
- Not met, because a script can't: VoiceOver, Dynamic Type, Increase
  Contrast, right to left. Escape still closes the window.
- Unverified in REAPER: the zoom keys reaching the window, and which face
  "sans-serif" resolves to.

## 16 October 2026: the final sweep (1.3)

Every implementable guideline checked again (`docs/apple-hig-review.md`,
*Final sweep*), with the family's shared choices:

- **Raised surfaces are lighter**: `Col_PopupBg` `#2A2F37`, `Col_Border`
  `#3A404A`; the menu bar `#1B1F25` and menu highlight `#3A404A` (pressed
  `#22262D`) instead of ImGui's defaults; `Col_TextDisabled` `#BFC5CE`,
  because ImGui writes menu keys in it.
- **Non-text 3:1**: scrollbar thumb and resize corner `#6D7581`; tick boxes
  through `check()`, a 1-point `#8A919C` edge.
- **Rows wrap**: a fixed row's next item goes through `beside(w, gap)`,
  which starts a new line when it would not fit; `dim()` and the message
  wrap; tooltips go through `lines()` (64 characters). A smallest window size,
  `px(400)` × `px(300)`.
- **Esc** lets go of focus, an open menu or the chord editor before it
  closes the window (`ui.escTaken`, read at the end of the frame before).
- **A Stop in the menu bar** while anything plays.
- **Undo** for Start Again From and − (`say(text, warn, undo)`); any other
  change to the chords drops it, so it cannot undo more than it says.
  Chosen over a question first: the change is quick and often wanted.
- **The title** names the idea (`title()`, `###` keeps the window).
- Not taken: bold headings (the family's look; offered), dimming the chosen
  state when REAPER has focus, letting colours be chosen (settled), REAPER
  actions for the window's commands (a new feature).
