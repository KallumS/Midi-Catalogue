# 0003. A melody is a skeleton on the chords, then the cheapest path between

Taken 2026-09-30. Stands.

## Context

The first melody generator sampled the contour at every note and rounded it
to the scale. Read in `tools/demo.lua`, the lines stalled on repeated notes
(D5 D5, F5 F5) wherever the contour rose slowly, and after snapping strong
notes to the chord an "ascending" line could dip. A second version filled the
gaps with a path search that priced steps and repeats only; it trilled -
C D C D C D - because back-and-forth steps were free.

## Decision

Two stages, the way a composer works:

1. **Skeleton.** Downbeats, chord changes and half bars are placed on the
   contour and onto a chord tone - the nearest one that does not go back
   against the contour's direction.
2. **Path.** The notes between are the cheapest path from one skeleton note to
   the next, searched over *pairs* of positions so the cost can see a change
   of direction and a return to the note before last. Steps are free, a skip
   of a third nearly so; repeats, wide leaps, trills, non-chord tones not
   reached and left by step, and non-chord tones on the beat all cost.

Motif types move whole statements onto the chord rather than bending one note,
so the motif keeps its shape, and end on a cadence (the chord tone above, then
home). A final pass never moves a strong note.

## Consequences

- Lines move mostly by step with passing and neighbour notes, and the tests
  hold that ("a contour moves mostly by step", "repeats a note at most one
  move in four").
- The weights are judgement, tuned by reading output. Changing one means
  reading the demo output again.
- Some rhythms force a repeat (two quick notes between skeleton notes a third
  apart), which is why the repeat rule is one in four, not zero.
