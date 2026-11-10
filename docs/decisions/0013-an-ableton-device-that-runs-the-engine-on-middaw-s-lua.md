# 0013. An Ableton device that runs the engine on Middaw's Lua

Taken 2026-11-10. Stands.

## Context

The user is moving from REAPER to Ableton Live and asked for every family REAPER project as Max for Live, each on its own branch. The window is ReaImGui, which Max has no equivalent of; the engine is pure Lua, and Max 9 runs modern JavaScript (`[v8]`, `[v8ui]`).

## Decision

`ableton/` holds a Max for Live MIDI effect that runs `reascripts/mc_catalogue.lua`, `mc_orchestra.lua` and `mc_theory.lua` unchanged on Middaw's Lua 5.4 runtime (JavaScript, held to the real Lua byte for byte), through Noterator's adapter - the same route Middaw, Miderator and Noterator take. Only the window is new: one `[v8ui]` shared by every family generator (`ableton/kit/generator.js`), drawn in Middaw's HousePalette, with the window's rules carried over: no dead controls, title-style buttons, sentence-case messages, the status line at the top, a chosen row marked by the accent and a bar.

Results go into a new Session clip on the device's track, the Arrangement at the insert marker, or the clip open in Detail View, as one undo step; a result with several parts puts each further part on a new MIDI track beside it. The key follows Live 12's scale when it is one of ScaleView's. The device chooses the instrument from the engine's own orchestra, as Noterator's part does, and a section's parts each go on a new track named for the instrument.

## Consequences

- `ableton/kit/` is copied into every family repository with a device; `VENDORED.md` there records where each part came from.
- The bundle is built, not hand-written, and `tools/test.sh` fails when it is stale.
- Nothing here has been opened in Live. The tests run the device in Node on a stand-in for Max and the Live Object Model.
