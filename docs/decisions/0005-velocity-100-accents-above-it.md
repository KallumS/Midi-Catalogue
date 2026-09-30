# 0005. Velocity is 100; accents are asked for, and rise above it

Taken 2026-09-30. Stands.

## Context

The request said "for simplicity, all velocity should be set at 100", and
also listed "velocity patterns" among the things the plugin should be able to
output. Starting Blocks had removed its velocity sliders for the same reason
of simplicity.

## Decision

Everything leaves at 100. A single **Velocity: Flat 100 / Accents** choice,
Flat by default, raises the accented notes - the start of each group of a
rhythm cell, the downbeats, the strong notes of a melody - to 115 and leaves
every other note at 100.

## Consequences

- The default honours "all velocity at 100" exactly; the tests check that
  nothing leaves at anything else unless Accents is chosen.
- Accents add to 100 rather than taking notes below it, so the baseline the
  user asked for is still the baseline.
- There is no slider: one velocity, one accent level. Shaping dynamics further
  is the MIDI editor's job, as in Starting Blocks.
