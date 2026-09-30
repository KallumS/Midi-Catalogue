--[[ Inserting, exporting and auditioning, against a mocked REAPER.

     The mock (tests/reaper_mock.lua) is written from the API documentation's
     signatures and raises on anything it does not have, so a call REAPER does
     not have fails here rather than in REAPER.

       lua5.4 tests/test_place.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq = C.ok, C.eq
local P = dofile(HERE .. "/reaper_mock.lua")
P.install()

local T = dofile(C.SCRIPTS .. "mc_theory.lua")
local O = dofile(C.SCRIPTS .. "mc_orchestra.lua")
local Cat = dofile(C.SCRIPTS .. "mc_catalogue.lua").init(T, O)
local Midi = dofile(C.SCRIPTS .. "mc_midi.lua")
local Place = dofile(C.SCRIPTS .. "mc_place.lua")
Place.setMidi(Midi)

local function block(o, ty)
  local ctx = Cat.context(o)
  return Cat.block(ctx, ty, Cat.catalogue(ctx, ty).entries[1], {})
end

------------------------------------------------------------------------------
-- What the project says
------------------------------------------------------------------------------

P.reset()
P.num, P.den = 6, 8
eq(Place.barBeats(), 3, "a bar of 6/8 is three quarter notes")
P.num, P.den = 4, 4
eq(Place.barBeats(), 4, "a bar of 4/4 is four")
P.tempo = 96
eq(Place.tempo(), 96, "the tempo is the project's")

------------------------------------------------------------------------------
-- One part: an item on the selected track
------------------------------------------------------------------------------

P.reset()
local tr = P.track("Keys")
P.selTracks = { tr }
P.cursor = 2          -- seconds: four beats in at 120
local b = block({ inst = "pno", prog = "I-V-vi-IV" }, "Ostinato")
eq(Place.insert(b), Place.OK, "inserting a single part works")
eq(#tr.items, 1, "one item")
local item = tr.items[1]
eq(item.pos, 2, "at the edit cursor")
eq(item.len, b.beats / 2, "as long as the block")
eq(#item.take.notes, #b.notes, "with every note")
eq(item.take.name, b.name, "named for the block")
ok(item.take.sorted, "sorted once, after the batch")
for _, n in ipairs(item.take.notes) do ok(n.noSort, "each note inserted with noSort") end
eq(item.take.notes[1].sp, b.notes[1].start * 960, "note times are measured from the item's start")
eq(P.undoDepth, 0, "the undo block is closed")
ok(P.undoNames[1]:find("^Midi Catalogue: "), "and named")

-- No track, no insert, and the undo block is still closed.
P.reset()
eq(Place.insert(b), Place.NO_TRACK, "no selected track, nothing inserted")
eq(P.undoDepth, 0, "and no undo block left open")
P.lastTouched = P.track("Last")
eq(Place.insert(b), Place.OK, "the last touched track is used when none is selected")

-- A track that refuses the item closes its undo block too.
P.reset()
local refuses = P.track("Refuses")
refuses.refuses = true
P.selTracks = { refuses }
eq(Place.insert(b), Place.NO_TRACK, "a refused item is reported")
eq(P.undoDepth, 0, "and the undo block closed")

------------------------------------------------------------------------------
-- A section: a new track per part, under the selected track
------------------------------------------------------------------------------

P.reset()
local above = P.track("Above")
local sel = P.track("Selected")
local below = P.track("Below")
P.selTracks = { sel }
local sb = block({ inst = "pno", ensemble = "strings", prog = "I-IV-V-I" }, "Triadic")
eq(#sb.parts, 5, "the strings are five parts")
eq(Place.insert(sb), Place.OK, "inserting a section works")
eq(#P.tracks, 8, "five new tracks")
local names = {}
for i, t in ipairs(P.tracks) do names[i] = t.name end
eq(table.concat(names, ","), "Above,Selected,Violin I,Violin II,Viola,Cello,Double Bass,Below",
   "straight under the selected track, in score order")
for i = 3, 7 do
  eq(#P.tracks[i].items, 1, P.tracks[i].name .. " has one item")
  ok(#P.tracks[i].items[1].take.notes > 0, P.tracks[i].name .. " has notes")
end
eq(P.undoDepth, 0, "one undo block, closed")
eq(#P.undoNames, 1, "for the whole section")
eq(P.refreshDepth, 0, "the UI refresh is let go again")

-- With nothing selected, the section goes at the end.
P.reset()
P.track("Only")
eq(Place.insert(sb), Place.OK, "a section with nothing selected")
eq(P.tracks[2].name, "Violin I", "goes after the last track")

------------------------------------------------------------------------------
-- Export
------------------------------------------------------------------------------

P.reset()
P.resource = os.tmpname()
os.remove(P.resource)
local r1, path1 = Place.export(b)
eq(r1, Place.OK, "export writes a file")
ok(path1:find("Midi Catalogue", 1, true), "into the Midi Catalogue folder")
local f = io.open(path1, "rb")
local data = f:read("a")
f:close()
eq(data:sub(1, 4), "MThd", "a MIDI file")
eq(data:byte(10), 0, "format 0 for one part")
local _, path2 = Place.export(b)
ok(path2 ~= path1, "exporting twice gives two files")
local _, path3 = Place.export(sb)
local g = io.open(path3, "rb")
local sdata = g:read("a")
g:close()
eq(sdata:byte(10), 1, "format 1 for a section")
eq(sdata:byte(12), 6, "with a tempo track and five parts")

------------------------------------------------------------------------------
-- Audition
------------------------------------------------------------------------------

P.reset()
P.now = 50
ok(Place.previewStart(b, 120, 50), "audition starts")
ok(Place.previewRunning(), "and runs")
Place.previewTick(50.01)
ok(#P.stuffed > 0, "the first notes go out straight away")
eq(P.stuffed[1].a, 0x90, "as note-ons")
Place.previewTick(50 + b.beats / 2 + 0.1)
ok(not Place.previewRunning(), "it stops at the end of the block")
local ons, offs = 0, 0
for _, m in ipairs(P.stuffed) do
  if m.a == 0x90 then ons = ons + 1 elseif m.a == 0x80 then offs = offs + 1 end
end
eq(ons, #b.notes, "every note was played")
ok(offs > 0, "and released")

P.reset()
Place.previewStart(b, 120, 0)
Place.previewTick(0.01)
Place.previewStop()
local sounding = {}
for _, m in ipairs(P.stuffed) do
  if m.a == 0x90 then sounding[m.b] = true elseif m.a == 0x80 then sounding[m.b] = nil end
end
ok(next(sounding) == nil, "stopping releases everything still sounding")

C.done()
