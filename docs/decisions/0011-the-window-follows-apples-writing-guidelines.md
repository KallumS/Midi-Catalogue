# 0011. The window's text follows Apple's writing guidelines

Taken 2026-10-14. Stands.

## Context

The user asked for every repository's window text to follow Apple's Human
Interface Guidelines on writing
(developer.apple.com/design/human-interface-guidelines/writing), as Noterator
and Miderator already do (Noterator's decision 0053). Midi Catalogue had its
own habits: buttons in sentence case ("Insert at cursor", "Shape it"), " - "
for dashes, "Export .mid", straight quotes, a status line that said "No track
selected" with no way forward, and reasons for leaving entries out that did
not read after their count ("3 goes outside the Tuba's range").

## Decision

- **Buttons, headings and dialog titles** in title-style capitalization, a
  verb first where they act: Insert at Cursor, Insert on New Tracks, Export
  MIDI File, Shape It, Start Again From, ReaImGui Is Missing.
- **Tooltips and the status line** in sentence case; complete sentences end
  with a full stop, fragments do not. A failure says what happened and what
  to do: "No track is selected. Select a track and try again."
- **Typography**: an em dash (—) between phrases, an en dash (–) in ranges
  (an instrument's "G3–C7"), curly quotes and apostrophes, × for repeats, −
  for the remove button, "and" for "&" in a label of our own (Keys and Harp).
- **Saved values are never renamed; their labels are.** Types and
  transformations are saved by name ("Call/response", "Retrograde
  inversion"), so `C.LABELS` / `C.label(v)` in `mc_catalogue.lua` gives what
  the window shows ("Call and Response", "Retrograde Inversion"). Entry ids,
  instrument and section ids, and the ExtState key are untouched; entry
  labels that are folded into ids ("root & octave") are left as they are.
- **The reasons an entry is left out read after their count**: "3 outside the
  Tuba’s range", "2 with no voicing that fits", "1 too quick for the Flute at
  160 bpm".

## Consequences

- Starting Blocks' chord tables (their names and families, "6ths & 7ths",
  "Sus & Add") and ScaleView's scale names ("Harm Minor", "Dim W-H") are
  copies and stay as they are here; any change is made in those repositories
  first.
- The engine files are vendored into Noterator and Miderator, so the new
  reasons and hints reach them when they are synced; their adapters can use
  `C.label` for the type and transformation names.
- The block's name (the take's name and the exported file's name) is
  unchanged, so file names keep plain ASCII.
