# Midi Catalogue

A ReaScript that lists musical ideas - rhythms, melodies, harmony - generated
for a scale, a progression and an orchestral instrument, and puts the chosen
one into the project as MIDI. ReaImGui for the window. **The user is a
musician, not a programmer - explain in those terms.**

The full version of Starting Blocks' idea, built in the same shape as its
sister repos (Starting Blocks, Midi Suggester, Midi Variator, ScaleView for
REAPER). When in doubt, do what they do.

## Shape of it

| | |
| --- | --- |
| `reascripts/Midi Catalogue.lua` | The window and the wiring. ReaImGui lives only here. |
| `reascripts/mc_theory.lua` | Keys, scales, chords, progressions, **voice leading**. ScaleView's ROOTS and SCALES, unchanged. |
| `reascripts/mc_orchestra.lua` | The instruments and sections: ranges, where each sounds best, speed, leaps, breath, hands. Data. |
| `reascripts/mc_catalogue.lua` | The 25 types, the checks, transformations, the block. |
| `reascripts/mc_midi.lua` | The MIDI file writer (Starting Blocks', plus format 1 for sections). |
| `reascripts/mc_place.lua` | Everything that touches REAPER. |
| `tools/demo.lua` | What the catalogue makes, printed as note names. **Read this before and after any musical change.** |
| `tools/catalogue_md.lua` | Writes `docs/CATALOGUE.md`. |
| `docs/decisions/` | Why things are the way they are, one file per decision. |
| `docs/sessions/` | What happened in a session, written at the end of it. |

**`mc_theory`, `mc_orchestra` and `mc_catalogue` never touch `reaper.` or
`ImGui.`** They take plain tables and return plain tables. `mc_place` touches
REAPER but not ImGui. If a music question needs `reaper.` (the tempo, the bar
length), pass the value in - `C.contextFor(st, barBeats, bpm)` is how.

`mc_catalogue` is loaded with `dofile(...).init(T, O)`: it is handed the other
two rather than finding them, so tests and the window load the same files the
same way.

## The one idea

**Nothing is stored and nothing is random**
([0002](docs/decisions/0002-calculated-from-choices-not-stored-or-random.md)).
Each type is a few lists of musical choices (`params(ctx)`), and its catalogue
is every combination, built (`build`) for the context and then checked
(`M.make`). An entry that fails a check is dropped **and counted with its
reason** - the window shows the count and the reasons. Identical entries
(same notes) are listed once. The user asked for "every possibility"; this is
every possibility *of the meaningful choices*, which is the only version of
that request that produces music.

When adding a type: give it `params` and `build`, add it to `M.CATEGORIES`,
and everything else - the window, the checks, the tests' sweep,
`CATALOGUE.md` - picks it up. A param needs a stable `id` (the window keeps
the chosen entry by id, so it survives a change of key or instrument), a short
`label` and a `hint` sentence written for a musician.

## Positions, not pitches

Everything diatonic is done in **scale positions** (`mc_theory`): an integer
counting scale notes up from the root in MIDI octave -1. A third above is +2
in any scale. Pitches appear only at the edges (`T.pitch`, `T.nearestPos`).
Figures are written the way players say them, `"1-5-8-5"`, and `M.figSteps`
turns them into steps (8 is the scale's own octave; a trailing comma is the
octave below).

## The checks (`M.make`)

In order, per part: range, **breath** (`M.breathe`: wind and brass stop a
sixteenth short of every second bar line, and a held note comes back after only
if it fits the chord there), **speed** (`shortestGap` per voice against
`O.fastBeats(inst, bpm)` - the instrument's `fast` is in *seconds*, so the
project tempo decides), **leaps** (melodic instruments, notes under a beat
apart), then chord tones are marked (`ct`) for the transformations.

## Melodies ([0003](docs/decisions/0003-melody-is-a-skeleton-then-a-path.md))

The contour types (`shapeLine`) place a **skeleton** - downbeats, chord
changes, half bars - on the contour and onto chord tones that never go back
against it, then `fillLine` fills the notes between with the **cheapest path**:
a search over pairs of positions pricing repeats, leaps, changes of direction,
returns to the note before last (trills), non-chord tones not reached and left
by step, and non-chord tones on the beat. The motif types (Sequence,
Call/response, Repetition, Development) move whole statements onto the chord
(`fitStatement`) so a motif keeps its shape, and end on `cadence()` - the chord
tone above, then home. `finishMelody` is the common tail: strong notes onto the
chord, leapt-to-and-from non-chord tones onto the chord, closing on the root
(up to a fifth away), and in seven-note scales no augmented seconds or tritone
leaps - **but never by moving a strong note**.

The weights in `fillLine` were tuned by reading `tools/demo.lua` output. If
you change one, read the Arch, Wave and Ascending output for Violin I and a
low instrument before and after, and run the "a contour moves mostly by step"
tests.

## Harmony ([0004](docs/decisions/0004-a-melodic-instrument-plays-its-voice.md))

`T.voiceLead` is a beam search (width `T.BEAM`) over every voicing
`T.candidates` allows, costing movement, parallels, doubling, the leading
tone, spacing and, for Contrary motion, outer-voice direction. `harmonySetup`
decides the voice ranges:

- **mono**: a melodic instrument gets a four-part chorale positioned so its
  own voice (`role`: S A T B) lands in its band, and plays that voice.
- **poly**: a chordal instrument plays the chords, `O.chordRanges`.
- **ensemble**: one voice per part, each in its instrument's band (or the
  part's own `sweet`, for the four horns); the double bass doubles voice 1 an
  octave down.
- **uniform** types (Quartal, Cluster) share one band, because their voices
  sit a fourth or a step apart and cannot live in four separate ranges.

`lead()` memoises voice leading per context - a catalogue asks for the same
progression voiced the same way many times.

## Transformations ([0006](docs/decisions/0006-transformations-keep-the-harmony.md))

A note marked `ct` lands on a chord tone of the chord under it afterwards.
Augmentation and diminution stretch the chords too, so nothing is refitted.
On the timpani, inversion swaps the drums.

## Velocity ([0005](docs/decisions/0005-velocity-100-accents-above-it.md))

Everything is 100. **Accents** raises accented notes to `C.ACCENT` (115) and
leaves the rest at 100. The user asked for both "all velocity 100" and
"velocity patterns"; this is how both hold.

## Settings

`C.newState()` is one plain table; `C.clampState` puts every field back inside
what exists. Saved as `key=value;` in one ExtState string. Lists that differ
between contexts are kept **by name** (`prog`, `inst`, `section`, `type`,
`entry`), never by index. Loaded values go through `tonumber(v) or v`, so
`loadState` turns the name fields back into strings.

## ReaImGui

Same rules as the sister repos: load it with `ImGui_GetBuiltinPath` and
`dofile(...)("0.9")`; every `PushID` has its `PopID` and every
`PushStyleColor` its `PopStyleColor`; the theme is pushed before `Begin` and
popped after `End`, outside the `visible` test. `flow()` lays a list of
buttons out wrapping at the window's edge using `CalcTextSize`.

**No dead controls.** A section plays harmony only, so choosing one hides
Rhythm and Melody rather than greying them. A type an instrument does not play
shows the reason instead of an empty grid.

## Colour

The house scheme, unchanged: see `docs/COLOUR.md` (kept by hand). Every grey
is blue-shifted, R < G < B. Every button takes the dark ink, chosen or not.
The notes in the roll share the accent.

## REAPER, from a script

- `TimeMap_GetTimeSigAtTime` returns `num, denom, tempo` - no retval first.
- `MIDI_InsertNote`'s last argument is noSort: true for each, one `MIDI_Sort`.
- A section's tracks go in with `InsertTrackAtIndex` after the selected
  track's `IP_TRACKNUMBER`, inside `PreventUIRefresh`, as one undo block.
- `tests/reaper_mock.lua` is Midi Suggester's, written **from the documented
  signatures**, plus the handful this script adds. It raises on anything it
  does not have. Add to it from the API docs, never from what the code
  expects.

## Tests

```
tools/test.sh
```

| | |
| --- | --- |
| `test_theory.lua` | Scales against ScaleView, positions, spelling, and every progression in every seven-note scale voiced and audited. |
| `test_catalogue.lua` | Every entry for every instrument and section, in eleven other settings, checked rule by rule; then particular things by name. |
| `test_midi.lua` | The writer, read back by a parser that is not itself, format 0 and 1. |
| `test_place.lua` | Insert, sections on new tracks, export, audition, against the mocked REAPER. |
| `test_ui.lua` | The real script against a mocked ReaImGui: clicks every button in every category, inserts, exports, auditions, reloads saved and nonsense settings. |

`test_catalogue` tallies each rule over every note it applies to and reports
the rule once, with a count and the first example that broke it, so a broken
rule is one readable line rather than a thousand.

**Prove a test bites.** Every suite here was checked by deliberately breaking
what it covers - removing the speed check, breathing, the chord snapping, the
double basses' octave, parallel fifths, the leading-tone rule, contrary
motion, the dark ink, the section's hidden categories - and watching it fail.
The leading-tone test passed with the rule removed the first time; it now
audits every voiced chord.

`docs/CATALOGUE.md` is generated; `tools/test.sh` fails when it is stale:
`lua5.4 tools/catalogue_md.lua > docs/CATALOGUE.md`. A fresh container has no
Lua: `apt-get install -y lua5.4` (or `tools/run_lua.py` runs through lupa).

## Releasing

`index.xml` is the ReaPack index. Each `<version>` pins every file to a commit
hash, so a release is: commit the code, then add a new `<version>` block
pointing at that commit. Never edit an existing one. ReaPack keys a package by
its name, so do not rename `Midi Catalogue.lua`.
