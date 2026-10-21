# Session log - 2026-10-14: the window's words

## What was asked

A sweep of every repository's window text against Apple's writing guidelines,
as was done for Noterator and Miderator (their decision 0053). Recorded here
as [0011](../decisions/0011-the-window-follows-apples-writing-guidelines.md).

## What was done

`main` already holds 1.1 (the chord chain and the instrument families): the
branch `claude/midi-catalogue-plugin-054jz8` named in `CLAUDE.md` was merged
and squashed into one commit, so this work starts from `main`.

- **Buttons and headings** title-style: Insert at Cursor, Insert on New
  Tracks, Export MIDI File (was Export .mid), Shape It, Start Again From,
  Keys and Harp (the family is still "Keys & Harp" in the data), Repeated
  Note, Broken Chord, Call and Response, Contrary Motion, Retrograde
  Inversion. Repeats read ×2 and ×4; the remove button is a minus sign.
- **Saved values untouched**: types and transformations keep their stored
  names; the window shows `C.label(v)`, a new table in `mc_catalogue.lua`.
- **Status line**: "No track is selected. Select a track and try again.",
  "There’s nothing to insert.", "Saved <path>", and a failed export says to
  check that REAPER's resource folder can be written to. The missing-ReaImGui
  alert is titled "ReaImGui Is Missing" and says to run the script again
  after installing.
- **Tooltips and hints**: em dashes, curly quotes (on the “and”, the motif
  “Climb”), en-dash ranges for an instrument ("G3–C7, happiest G4–G6"),
  full stops on whole sentences. The tempo warning now ends "Try a slower
  tempo."
- **Why entries are left out** now reads after its count: "3 outside the
  Tuba’s range", "2 with no voicing that fits", "1 with leaps wider than the
  Tuba takes in passing".
- `docs/CATALOGUE.md` regenerated: headings use the labels.

Left as they are: Starting Blocks' chord names and families ("6ths & 7ths",
"Sus & Add") and ScaleView's scale names, which are copies; entry labels
that are folded into saved entry ids ("root & octave"); the block name, which
is the take's and the exported file's name.

## Verification

`tools/test.sh`: all five suites pass and `CATALOGUE.md` is current. The UI
test's clicks and text checks were moved to the new labels. There is no
screenshot tool for this script; the new characters (— – × − ’ “ ”) are in
the fonts ReaImGui uses, but it has not been looked at inside REAPER.

## Not done yet

The engine files changed here (`mc_catalogue.lua`) need syncing into
Noterator and Miderator; their adapters could show `C.label` for types and
transformations.
