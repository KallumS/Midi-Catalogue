# 0002. The catalogue is calculated from musical choices - not stored, and not random

Taken 2026-09-30. Stands.

## Context

"I think it would be better to generate the results rather than having them
pre-loaded because music is math so it should be possible to calculate every
possibility in existence." And: "The problem with other tools is that they
are too random and not musical, I want something that provides musicians with
ideas that they should actually use in a track."

Taken literally, every possibility is every sequence of pitches and
durations: astronomically many, nearly all of them noise. Random sampling from
that space is exactly what the request complains about.

## Decision

Each type is a handful of lists of **musically meaningful choices** - a
figure (1-5-8-5), a rhythm cell (3+3+2), a contour (an arch over a fifth), a
motif (a turn), a voicing (four voices, held), a pedal (tonic, in the bass).
Its catalogue is **every combination** of them, generated for the context -
key, chords, instrument, register, tempo, metre - and then **checked** by the
rules a player or a harmony teacher applies. What fails is dropped and counted
with its reason; the window shows both.

Nothing is stored and nothing is random: the same settings always give the
same catalogue, and every entry is reproducible from its id.

## Consequences

- A few hundred good entries for any one setting, all different when any
  setting changes.
- The list for an instrument can be shorter than another's, and the window
  says why (too quick at this tempo, a leap it would not take).
- Adding a type is a `params` list and a `build`; the checks, the window and
  the tests pick it up.
- Some combinations come out note-for-note identical for some settings (a
  bass instrument's voice-led line *is* the root). They are listed once.

## Alternatives

**A stored library of clips.** Rejected by the request itself, and it cannot
follow the key, the chords or the instrument.

**Random generation with a filter.** Rejected: not reproducible, and a
filtered random stream still wastes most of what it rolls. The enumeration is
the filter's input, done exhaustively instead.
