# 0010. Instruments and chords show a family at a time

Taken 2026-10-01. Stands.

## Context

"GUI works well but is very busy, I wonder if there's a different way to
display the list of instruments so it takes up less space?" Version 1.0 drew
every instrument, family by family - seven rows - and adding 87 chords to the
window would have made it far worse.

## Decision

- **Instruments**: one row of families (Strings, Woodwind, Brass, Percussion,
  Keys & Harp, Sections) with the register on the same row, and under it only
  the family you are looking at. Looking is not choosing: the instrument
  stays until another is clicked.
- **Chords**: the chain is one row. The editor - root, family, chord, presets
  - opens under it only while a chord is being changed.

Buttons rather than drop-down menus, like every other window in the house:
everything on offer stays visible and one click away.

## Consequences

- Choosing an instrument in another family is two clicks instead of one.
- The view (`ui.instFam`, `ui.edit`) is not saved; a reopened window shows the
  chosen instrument's family with the chord editor closed.
- Labels repeat between rows ("Strings" is a family and a section; "IV" is a
  chain button and a degree button while the editor is open), which the tests
  account for.

## Alternatives

**Drop-down menus.** The most compact, but they hide what is on offer and
are used nowhere else in the sister repos.
