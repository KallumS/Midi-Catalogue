# Midi Catalogue

A catalogue of musical ideas for REAPER - rhythms, melodies and harmony -
written for your scale, your chords and the instrument you are writing for,
and dropped into your project as MIDI.

You pick a scale. You pick the chords underneath. You pick an instrument of
the orchestra - Violin I, oboe, horn, timpani, harp - or a whole section. Then
you browse a catalogue of ideas that suit that instrument in that key over
those chords, and put the one you like into the project.

It is the full version of the idea
[Starting Blocks](https://github.com/KallumS/Starting-Blocks) started: where
Starting Blocks hands you single chords and single notes, this hands you
phrases.

## Why it is not random

Most idea generators roll dice, and most of what they roll is unusable. Nothing
here is random, and nothing is stored either. Every entry in the catalogue is
**calculated** when you ask for it, from a small set of musical choices - a
figure, a rhythm, a shape, a voicing - and then checked the way a player or a
harmony teacher would check it:

- **It fits the instrument.** Every note is inside the instrument's range and
  sits where it sounds best. Nothing is faster than the instrument plays
  cleanly *at your project's tempo* - a sixteenth-note ostinato that a tuba
  manages at 60 bpm is left out at 180. No leap is wider than it takes
  comfortably in passing. Wind and brass leave room to breathe every two bars.
  A violin plays one note at a time; a piano plays chords.
- **It fits the chords.** Melodies land on chord tones on the strong beats and
  move by step in between, with passing and neighbour notes the way a
  composer would write them, and phrases end properly - on the root when they
  close, on an open note when they ask a question.
- **The harmony is voice-led.** Chords move to the nearest notes of the next
  chord, keep the notes they share, never move in parallel fifths or octaves,
  never double the leading tone, and let it rise to the tonic.

What fails a check is left out, and the window tells you how many were left
out and why, so the list never quietly shrinks.

"Music is maths, so every possibility can be calculated" is true - but *every*
possibility is billions of phrases, almost all of them nonsense. What this does
instead is calculate every combination of the *musically meaningful* choices,
and throw out the ones that break the rules. That is a few hundred good ideas
for any one setting, and they change every time you change the key, the
chords, the instrument or the tempo.

## What is in it

**Rhythm** - Ostinato, Pulse, Syncopation, Gallop, Tresillo, Hemiola,
Polyrhythm, Arpeggio, Repeated note, Alberti, Broken chord.

**Melody** - Ascending, Descending, Arch, Wave, Sequence, Call/response,
Repetition, Development.

**Harmony** - Triadic, Quartal, Cluster, Pedal, Arpeggiated, Contrary motion.

The whole list, entry by entry, is in [docs/CATALOGUE.md](docs/CATALOGUE.md),
along with every instrument's range and limits.

**The instruments**: Violin I, Violin II, Viola, Cello, Double Bass, Piccolo,
Flute, Oboe, English Horn, Clarinet, Bass Clarinet, Bassoon, Contrabassoon,
Horn, Trumpet, Trombone, Bass Trombone, Tuba, Timpani, Glockenspiel,
Xylophone, Marimba, Harp, Celesta and Piano.

**The sections**: Strings, Woodwinds, Brass and Four Horns. Pick one and the
harmony is spread across it one voice to a part - Violin I on top, the double
basses doubling the cellos an octave down - and inserted as one track per
instrument, each named for it.

Some instruments do not do some things, and the window says why rather than
showing you nothing: the timpani are tuned to the tonic and the dominant, so
they play rhythms but not melodies; a glockenspiel has two mallets, so it plays
no four-note chords.

## Installing

**1. Install ReaImGui.** The script will not start without it.

In REAPER: Extensions -> ReaPack -> Browse packages, search for `ReaImGui`,
right-click it and Install. Then Extensions -> ReaPack -> Apply changes, and
restart REAPER.

**2. Install Midi Catalogue.** Either:

- **With ReaPack** (easiest, and it keeps it up to date): Extensions ->
  ReaPack -> Import repositories, paste
  `https://raw.githubusercontent.com/KallumS/Midi-Catalogue/main/index.xml`,
  then Browse packages, find Midi Catalogue and Install. That link only works
  once this has been merged into the main branch.
- **By hand**: Options -> Show REAPER resource path in explorer/finder, go into
  `Scripts/`, make a folder called `Midi Catalogue`, and put these six files
  from the `reascripts` folder in it together:

  ```
  Scripts/Midi Catalogue/
    Midi Catalogue.lua
    mc_theory.lua
    mc_orchestra.lua
    mc_catalogue.lua
    mc_midi.lua
    mc_place.lua
  ```

  They have to be in the same folder: the first one loads the others from
  beside itself.

**3. Load it as an action** (by-hand install only - ReaPack does this for
you). Actions -> Show action list -> New action -> Load ReaScript, and pick
`Midi Catalogue.lua`. It is then in the action list, where you can run it, give
it a shortcut or put it on a toolbar. Running it again closes the window;
Escape closes it too.

## Using it

The window is four numbered steps, top to bottom.

1. **Scale.** The key and the scale. Its notes are spelled out underneath, the
   way ScaleView spells them.
2. **Chords underneath.** A progression, named in the numerals your scale
   actually builds (so I-IV-V-I in a minor scale reads i-iv-v-i), triads or
   sevenths, and how many bars the idea lasts. The chords share the bars
   evenly: four chords over four bars is one a bar.
3. **Instrument.** Any instrument of the orchestra, or a section, and the
   register - low, middle or high within where that instrument sounds best.
   Hover over an instrument to see its range.
4. **Catalogue.** Rhythm, Melody or Harmony, then the type, then the entries
   themselves. Click one and it appears in the piano roll at the bottom.
   Hover over an entry for a sentence saying exactly what it is. The
   **Density** buttons narrow the list to sparse, medium or busy ideas.

Then **Shape it**:

- **Transform** - inversion (upside down), retrograde (backwards), both, or
  twice as slow or twice as fast. The harmony is kept: a note that was on the
  chord lands on the chord that is under it afterwards.
- **Repeats** - play it once, twice or four times.
- **Velocity** - everything leaves at 100. Choose **Accents** and the start of
  each group and the downbeats rise to 115 while everything else stays at 100.

And get it out:

- **Insert at cursor** puts it on the selected track at the edit cursor, as one
  MIDI item named after what it is. A section inserts **on new tracks**, one per
  instrument, under the selected track.
- **Export .mid** writes a MIDI file into a `Midi Catalogue` folder in REAPER's
  resource path. Point the Media Explorer at it and everything you export is
  one drag away. A section's file has a track per instrument.
- **Audition** plays it through the virtual keyboard, so a record-armed track
  with monitoring on will sound it. It is a preview, not a performance - for
  exact timing, insert it and press play.

The tempo and time signature are read from your project, so what counts as
"too fast" and where the bar lines fall follow the song you are working on.
Your choices are remembered between sessions.

### If something goes wrong

**It says it needs ReaImGui.** The extension is not installed, or REAPER has
not been restarted since it was.

**It errors on the line that loads ReaImGui.** Your ReaImGui is older than the
version the script asks for; update it through ReaPack.

**It cannot find `mc_theory.lua`.** The six files are not in the same folder.

**Audition makes no sound.** It plays through REAPER's virtual MIDI keyboard,
so it needs a track that is record-armed with input monitoring on, with an
instrument on it. Insert and Export do not need that.

**A list is shorter than you expected.** Hover over the line that says how
many were left out: it says why. Usually it is the tempo (too quick for that
instrument) or a leap it would not take.

## Checking it

For anyone changing the code: `tools/test.sh` runs every test. The tests run
the real engine and the real window against stand-ins for REAPER and ReaImGui,
and check nearly three million things about what comes out - that every note is
in range, that no melody lands off the chord on a downbeat, that no voicing has
parallel fifths, that every button in the window can be clicked. See
[CLAUDE.md](CLAUDE.md) for how it fits together.

The keys, scales and note spelling are
[ScaleView for REAPER](https://github.com/KallumS/ScaleView-for-Reaper)'s,
unchanged, so the apps agree. The instruments' character comes from
[Orchestration Helper](https://github.com/KallumS/Orchestration-Helper).
