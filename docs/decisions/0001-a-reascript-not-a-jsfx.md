# 0001. A ReaScript, not a JSFX

Taken 2026-09-30. Stands.

## Context

The request allowed either: "Either a Reaper ReaScript or JSFX would be best
for this since I use Reaper."

## Decision

A Lua ReaScript with a ReaImGui window, built like Starting Blocks and Midi
Variator.

- **The catalogue has to be browsed.** Dozens of entries per type, each with
  a sentence describing it, a preview roll and buttons to shape it. A JSFX's
  interface is sliders and a hand-drawn `@gfx` section; a script has ReaImGui.
- **The result has to land in the project.** Inserting items, making a track
  per instrument for a section, writing a .mid - a script has the API for all
  of it. A JSFX cannot write a file, reach the REAPER API or start a drag,
  which is why Starting Blocks version 1 needed a bridge script and a shared
  memory protocol, and why version 2 dropped the JSFX.
- **The music has to be testable.** The engine is plain Lua, run and checked
  outside REAPER - nearly three million checks in `tools/test.sh`. EEL2 only
  runs inside REAPER.

## Consequences

Ideas are made when asked for, not live as the music plays. A live generator
reacting to incoming MIDI would be a different tool; nothing asked for needs it.

## Alternatives

**JSFX.** Rejected for the reasons above; Starting Blocks, Midi Suggester and
Midi Variator reached the same answer.
