--[[ The MIDI file writer, checked against a parser that is not itself.

     The format 0 checks are Starting Blocks', whose writer this is. The
     format 1 checks are new: a block spread across a section is one track
     per part.

       lua5.4 tests/test_midi.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq = C.ok, C.eq
local Midi = dofile(C.SCRIPTS .. "mc_midi.lua")

------------------------------------------------------------------------------
-- A MIDI file reader, written separately from the writer
------------------------------------------------------------------------------

local function parseMidi(data)
  local pos = 1
  local function u8()  local b = data:byte(pos); pos = pos + 1; return b end
  local function u16() return u8() * 256 + u8() end
  local function u32() return ((u8() * 256 + u8()) * 256 + u8()) * 256 + u8() end
  local function varint()
    local n = 0
    repeat local b = u8(); n = n * 128 + (b % 128) until b < 128
    return n
  end

  assert(data:sub(1, 4) == "MThd", "no MThd")
  pos = 5
  local hdrLen  = u32()
  local format  = u16()
  local ntracks = u16()
  local ppq     = u16()
  local tracks = {}
  for _ = 1, ntracks do
    assert(data:sub(pos, pos + 3) == "MTrk", "no MTrk at " .. pos)
    pos = pos + 4
    local trkLen = u32()
    local trkEnd = pos + trkLen
    local tick, events, metas, ended, name = 0, {}, {}, false, nil
    while pos < trkEnd do
      tick = tick + varint()
      local status = u8()
      if status == 0xFF then
        local mt  = u8()
        local len = varint()
        local payload = data:sub(pos, pos + len - 1)
        pos = pos + len
        metas[#metas + 1] = { type = mt, tick = tick, data = payload }
        if mt == 0x03 then name = payload end
        if mt == 0x2F then ended = true end
      else
        local b2, b3 = u8(), u8()
        events[#events + 1] = { tick = tick, status = status, pitch = b2, vel = b3 }
      end
    end
    assert(pos == trkEnd, "a track's length does not match its bytes")
    tracks[#tracks + 1] = { events = events, metas = metas, ended = ended, name = name, endTick = tick }
  end
  return { format = format, ntracks = ntracks, ppq = ppq, hdrLen = hdrLen, tracks = tracks,
           bytesUsed = pos, total = #data }
end

------------------------------------------------------------------------------
-- varlen
------------------------------------------------------------------------------

eq(Midi.varlen(0),    "\0",            "varlen 0")
eq(Midi.varlen(127),  "\127",          "varlen 127")
eq(Midi.varlen(128),  "\129\0",        "varlen 128")
eq(Midi.varlen(8192), "\192\0",        "varlen 8192")
eq(Midi.varlen(0x1FFFFF), "\255\255\127", "varlen 0x1FFFFF")
eq(Midi.varlen(-5),   "\0",            "varlen clamps negatives")

------------------------------------------------------------------------------
-- One part: format 0
------------------------------------------------------------------------------

local chord = {
  { start = 0, len = 3.6, pitch = 60, vel = 100 },
  { start = 0, len = 3.6, pitch = 64, vel = 100 },
  { start = 0, len = 3.6, pitch = 67, vel = 100 },
}
local m = parseMidi(Midi.build(chord, 4, "C Major Triadic", 120, 4, 4))
eq(m.format,  0, "format 0")
eq(m.ntracks, 1, "one track")
eq(m.ppq,   960, "960 ticks per quarter note")
eq(m.hdrLen,  6, "header length")
eq(m.bytesUsed - 1, m.total, "nothing after the last track")
local t1 = m.tracks[1]
ok(t1.ended, "the track ends with an end-of-track meta")
eq(#t1.events, 6, "three notes make six events")
eq(t1.name, "C Major Triadic", "the track is named for the block")
eq(t1.endTick, 4 * 960, "the track ends at the end of the block, not the last note-off")
for _, e in ipairs(t1.events) do
  if e.status == 0x90 then eq(e.vel, 100, "every note-on at velocity 100") end
end

-- The tempo and time signature.
do
  local tempo, ts
  for _, mt in ipairs(t1.metas) do
    if mt.type == 0x51 then tempo = mt.data end
    if mt.type == 0x58 then ts = mt.data end
  end
  local us = tempo:byte(1) * 65536 + tempo:byte(2) * 256 + tempo:byte(3)
  eq(us, 500000, "120 bpm is half a second a quarter")
  eq(ts:byte(1), 4, "four beats")
  eq(ts:byte(2), 2, "to a quarter (2 to the 2)")
  local m68 = parseMidi(Midi.build(chord, 4, "x", 90, 6, 8))
  for _, mt in ipairs(m68.tracks[1].metas) do
    if mt.type == 0x58 then eq(mt.data:byte(1), 6, "6/8: six"); eq(mt.data:byte(2), 3, "eighths") end
  end
end

-- A repeated note: the off of the first comes before the on of the second.
do
  local rep = { { start = 0, len = 1, pitch = 60, vel = 100 }, { start = 1, len = 1, pitch = 60, vel = 100 } }
  local ev = parseMidi(Midi.build(rep, 2, "r", 120, 4, 4)).tracks[1].events
  eq(ev[2].status, 0x80, "at a shared tick the note-off goes first")
  eq(ev[3].status, 0x90, "then the note-on")
end

------------------------------------------------------------------------------
-- Several parts: format 1, a track each
------------------------------------------------------------------------------

do
  local parts = {
    { name = "Violin I", notes = { { start = 0, len = 4, pitch = 76, vel = 100 } } },
    { name = "Viola",    notes = { { start = 0, len = 4, pitch = 67, vel = 100 } } },
    { name = "Cello",    notes = { { start = 0, len = 2, pitch = 48, vel = 100 },
                                   { start = 2, len = 2, pitch = 43, vel = 115 } } },
  }
  local f = parseMidi(Midi.buildParts(parts, 4, "Strings Triadic", 100, 3, 4))
  eq(f.format, 1, "several parts make format 1")
  eq(f.ntracks, 4, "a tempo track and one track per part")
  eq(f.bytesUsed - 1, f.total, "nothing after the last track")
  eq(#f.tracks[1].events, 0, "the first track carries only tempo and metre")
  eq(f.tracks[2].name, "Violin I", "the second is the violins, named")
  eq(f.tracks[4].name, "Cello", "the last is the cellos")
  eq(#f.tracks[4].events, 4, "with both their notes")
  eq(f.tracks[4].events[3].vel, 115, "an accent survives")
  for i, t in ipairs(f.tracks) do
    ok(t.ended, "track " .. i .. " is ended")
    eq(t.endTick, 4 * 960, "track " .. i .. " lasts the block")
  end
  -- One part is still format 0.
  eq(parseMidi(Midi.buildParts({ parts[1] }, 4, "Solo", 120, 4, 4)).format, 0, "one part is format 0")
end

------------------------------------------------------------------------------
-- Names that become filenames
------------------------------------------------------------------------------

eq(Midi.sanitise("C Major I-V-vi-IV Violin I Call/response"), "C Major I-V-vi-IV Violin I Call_response",
   "a slash cannot go in a filename")
eq(Midi.sanitise("F# Major"), "Fsharp Major", "nor a sharp sign, which some systems mind")
eq(Midi.sanitise(""), "Block", "an empty name still names a file")
ok(#Midi.sanitise(("x"):rep(300)) <= 100, "and a long one is cut short")

C.done()
