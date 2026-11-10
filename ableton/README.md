# Midi Catalogue for Ableton Live

A Max for Live MIDI effect. The catalogue comes from `reascripts/mc_catalogue.lua`, `mc_orchestra.lua` and `mc_theory.lua`, the same files the REAPER script runs, unchanged.

## Installing

Needs **Live 12.1 or later with Max for Live** (Live Suite, or Standard with
the add-on): the device runs on Max 9's JavaScript engine (`[v8ui]`).

1. Copy `Midi Catalogue.amxd`, `MidiCatalogue.js` and `MidiCatalogue.maxpat` into one folder, for
   example `Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/`. The `.amxd` finds
   `MidiCatalogue.js` beside it.
2. Drag `Midi Catalogue.amxd` onto a MIDI track, in front of an instrument.
3. Optional: open it in the Max editor and click **Freeze Device**, then save.
   The device then carries the script inside it and can be moved on its own.

## Using it

| | |
| --- | --- |
| **Key, Scale** | The key it writes in. **Follow Live** keeps it on Live's scale (the Scale button in the clip view) when that scale is one ScaleView knows. |
| **Instrument** | The instrument the music is written for, from Midi Catalogue's orchestra. Nothing it cannot play is offered. **Write for** a section writes one part per instrument. |
| The middle | The engine's settings, only the ones that apply. Click the right of a value for the next, the left for the one before, or drag up and down. **Part** appears when a result has several parts: all of them, or one. |
| The list | The catalogue for these settings: up to forty-eight entries, each with what it is for. Click one to hear it on the track's instrument. |
| **New Ideas** | Asks again, with a new number. |
| **Play** | Plays the chosen result again, or stops it. |
| **Insert** | Puts the chosen result where the button beside it says: **New Clip** (the first free slot on this track, from the selected scene down), **Arrangement** (at the insert marker; Live 12.2 or later) or **This Clip** (in place of the notes of the clip open in Detail View). A result with several parts puts the first on this track and each of the others on a new MIDI track beside it, named for the part. One undo step. |

The settings and the key are saved with the Live set.

## How it is built

`ableton/device.json` describes the device; `python3 ableton/kit/build.py
ableton/device.json` writes the `.amxd`, the `.maxpat` and the script bundle
`MidiCatalogue.js`. The bundle is Middaw's Lua 5.4 runtime, the engine, the Noterator adapter (`ableton/adapters/`) and the shared window (`ableton/kit/generator.js`). See `ableton/kit/VENDORED.md`.

`node --test ableton/tests/test_device.js` runs the device on a pretend Max and a pretend Live set: every setting stepped through, hearing a result (every note started is stopped), each way of inserting, a full track refused, following Live's scale, and saving and restoring with the set. Its own tests check the music stays inside each instrument's range, the instrument is saved, and a section's parts each go on their own track.

## Limits

- **It has not been opened in Live yet.** It is tested in Node against a stand-in for Max and the Live Object Model; nothing has run in Max. If the `.amxd` will not open, open `MidiCatalogue.maxpat` in Max and save it as a device.
- Results are heard on whatever instrument is after the device, a few milliseconds late at worst: Max's JavaScript runs off the audio thread.
- Parts put on new tracks have no instrument yet: a device cannot load one.
- The REAPER window's chord chain builder is not here: the chords are chosen from the progressions that fit the key, as Noterator offers them.
