# 0007. Density filters the catalogue rather than changing the generators

Taken 2026-09-30. Stands.

## Context

"Density" was on the list of things the plugin should be aware of. It could
have been a knob every generator reads (thin this ostinato out), or a property
of each entry.

## Decision

Density is **measured**: onsets per beat, a chord counting once. Each entry
is Sparse (under one a beat), Medium, or Busy (two and a half or more), and
the Density buttons show only one band. Hovering a band says how many entries
are in it.

## Consequences

- Every density already exists in the catalogue - held chords, pulses,
  sixteenth-note figures - so a filter finds them without inventing thinned
  versions of anything.
- No generator has to understand density, and the bands cannot disagree with
  the notes, because they are read off them.
