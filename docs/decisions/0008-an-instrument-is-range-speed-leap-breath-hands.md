# 0008. What makes a line idiomatic: range, where it sounds best, speed at tempo, leap, breath, hands

Taken 2026-09-30. Stands.

## Context

"The midi generations should be idiomatic to each instrument in the
orchestra." Orchestration Helper holds the character of each instrument in
prose - the flute dull low and brilliant high, the oboe rough at the bottom,
the E string thinning as it climbs, the basses taking a plainer version of the
cellos' line - and a few hard facts (timpani E2 to G#3, harp C-flat 1 to
F-sharp 7). The catalogue needed numbers it could check.

## Decision

Each instrument is: a practical **range**; a **sweet** register where it
sounds like itself (the catalogue writes there, split into Low, Middle and
High); a **role** in four-part harmony; how many notes it plays **at once**;
the shortest time between two notes it plays cleanly, **in seconds**; the
widest **leap** it takes in passing; whether it **breathes**; and what it does
not play at all, with the reason.

Speed is in seconds so the project tempo decides: a figure fine at 90 bpm is
left out at 160. Ranges are the standard orchestration texts', with Orchestration
Helper's used where it states one.

## Consequences

- The double bass, contrabassoon, trombones and tuba get fewer fast figures
  than the violins, which is right.
- The timpani play rhythms on the tonic and dominant only, rest through a
  chord that has neither, and are not offered melodies or arpeggios.
- Two-mallet instruments are not offered four-note chords.
- The numbers are judgement at the edges. They are all in `mc_orchestra.lua`
  and in the table at the end of `docs/CATALOGUE.md`.
