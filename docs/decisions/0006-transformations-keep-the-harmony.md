# 0006. Transformations keep the harmony

Taken 2026-09-30. Stands.

## Context

Inversion and retrograde are pitch and time operations that know nothing about
chords. A retrograde of an ostinato over I-IV-V-I puts the IV bar's notes over
the V chord; a diatonic inversion of a C major arpeggio is an F major one, over
a C chord.

## Decision

Every note remembers whether it was a chord tone when it was made (`ct`).
After inversion or retrograde, each such note moves to the nearest chord tone
of the chord now under it. Notes that were passing or neighbour notes keep
their transformed pitch. Augmentation and diminution stretch the chords with
the music (half time, double time), so nothing needs refitting.

On the timpani, inversion swaps the two drums, and a note under a chord that
lacks its drum takes that chord's own.

## Consequences

A transformed entry still sounds like it belongs over the chords - which is
what "musically aware" asked for - at the price of not being the strict
mirror image. The tests check that every chord tone lands on a chord tone.
