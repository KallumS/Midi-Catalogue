# 0004. A melodic instrument asked for harmony plays its own voice of a chorale

Taken 2026-09-30. Stands.

## Context

Harmony types were asked for on every orchestral instrument ("the user could
ask for violin 1 midi and get those or select oboe and get midi for that").
An oboe cannot play a chord. Options: hide Harmony for melodic instruments,
arpeggiate every chord for them, or give them one voice.

## Decision

A melodic instrument gets **its own voice of a four-part chorale**. Each
instrument has a role - Violins I soprano, Violins II mezzo, violas tenor,
cellos bass, as Orchestration Helper records - and the chorale is built with
its ranges moved so that voice lands where the instrument sounds best. The
instrument plays that line: smooth, common tones held, the part a section
player would actually be given.

Sections (Strings, Woodwinds, Brass, Four Horns) are the same chorale with
every voice given to its part, each in its own instrument's band, inserted as
a track per instrument. The four horns follow the convention that 1 and 3
take the high parts and 2 and 4 the low.

## Consequences

- Pick Violin II, then Viola, then Cello, all on "Triadic, held", and you get
  three parts of the same harmony - though inserting a Strings section does
  that in one step and guarantees they agree.
- Quartal and cluster voicings sit too close to keep four separate ranges,
  so those two share one band (`uniform`).
- Rhythm types that play "the harmony" on a melodic instrument use the same
  voice (`voice-led`), so an ostinato on the violas follows the voice leading
  rather than jumping between chord roots.
