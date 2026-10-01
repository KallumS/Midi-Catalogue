# 0009. Chords are a chain of any chord, and the scale bends to each

Taken 2026-10-01. Stands. Replaces the eleven fixed progressions and the
Triads/Sevenths switch of version 1.0.

## Context

"I feel that there aren't enough chords, rather than having single chords and
a few progressions could we have every chord (similar to Starting-Blocks) and
allow the user to chain them together to create progressions?"

Version 1.0 offered eleven progressions, each chord built from the scale as a
triad or a seventh. Starting Blocks offers 78 named chords and 9 diatonic ones
on any degree.

## Decision

The progression is a **chain** of up to eight chords the user builds. Each
link is a degree of the scale and any chord: one of the nine the scale builds
(triad, 7th, 9th, 11th, 13th, 6th, sus2, sus4, 5th) or any of Starting Blocks'
78, on that degree's root. The old progressions stay as "Start again from"
presets.

A chosen chord can hold notes the scale does not - a C major chord in C minor,
D7 in C major. Under such a chord the **scale bends to meet it**: the scale
note on the same letter moves the semitone (Eb to E, F to F#) for as long as
the chord lasts. Every generator writes in scale steps, so figures, melodies,
fills, arpeggios and transformations all land on the chord's own notes rather
than grinding against them - the way a player reads a borrowed or secondary
chord. A scale note that is itself in the chord is never moved, a chord note
two semitones from anything in the scale is left alone, and only seven-note
scales bend (the others have no letter for every note).

## Consequences

- Everything in the catalogue that turns a position into a pitch must use the
  scale under that moment (`keyAt`), not the key. Positions still count the
  same, so the arithmetic is unchanged.
- The tests check that nothing sounds the scale note a borrowed chord
  replaced (no Eb under a borrowed C major), and that the borrowed note is
  actually used.
- A five-note chord on a three-voice instrument has no voicing that keeps its
  root, third, seventh and colour, and is left out with that reason.
- Chains are saved by name, so the chord tables can grow.

## Alternatives

**Snap melodies to chord tones only, leaving the scale alone.** Rejected:
weak beats would still play Eb against a C major chord.

**Chromatic generation.** Rejected: the engine's diatonic arithmetic (a third
is two steps up) is what makes lines move like lines; bending the scale keeps
it.
