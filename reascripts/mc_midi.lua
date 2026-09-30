--[[ Midi Catalogue - writing a block out as a standard MIDI file.

     Pure Lua, like the engine: hand it notes and it hands back the bytes.
     Starting Blocks' writer, with one addition: a block spread across a
     section has one part per instrument, and that is written as a format 1
     file with a track per part, so dropping it into REAPER gives a track per
     instrument. A single part is format 0, as before.

     960 ticks to the quarter note. Everything is done with arithmetic rather
     than bit operators so it does not care which Lua a REAPER build carries.
]]

local M = {}

M.PPQ = 960

local function be16(n)
  return string.char(math.floor(n / 256) % 256, n % 256)
end

local function be32(n)
  return string.char(math.floor(n / 16777216) % 256, math.floor(n / 65536) % 256,
                     math.floor(n / 256) % 256, n % 256)
end

-- MIDI's variable length quantity: seven bits per byte, high bit set on every
-- byte but the last.
function M.varlen(n)
  n = math.max(0, math.floor(n))
  local bytes = { n % 128 }
  n = math.floor(n / 128)
  while n > 0 do
    table.insert(bytes, 1, (n % 128) + 128)
    n = math.floor(n / 128)
  end
  local out = {}
  for i = 1, #bytes do out[i] = string.char(bytes[i]) end
  return table.concat(out)
end

local function meta(typeByte, payload)
  return string.char(0xFF, typeByte) .. M.varlen(#payload) .. payload
end

local function tempoAndMetre(bpm, tsNum, tsDen)
  local out = {}
  local usPerQN = math.floor(60000000 / math.max(bpm or 120, 1) + 0.5)
  out[#out + 1] = M.varlen(0) .. meta(0x51, string.char(
    math.floor(usPerQN / 65536) % 256,
    math.floor(usPerQN / 256) % 256,
    usPerQN % 256))
  -- The time signature meta wants the denominator as a power of two.
  local dd, d = 0, math.max(1, math.floor(tsDen or 4))
  while d > 1 do d = d / 2; dd = dd + 1 end
  out[#out + 1] = M.varlen(0) .. meta(0x58,
    string.char(math.max(1, math.min(255, math.floor(tsNum or 4))), dd, 24, 8))
  return table.concat(out)
end

-- One track chunk: a name, optionally the tempo and metre, then the notes.
-- notes are { start, len, pitch, vel } in quarter notes from the start of
-- the block; beats is how long the whole block is, which is what decides
-- where the track ends.
local function track(notes, beats, name, header)
  local ev = {}
  for _, nt in ipairs(notes) do
    local on  = math.floor(nt.start * M.PPQ + 0.5)
    local off = math.floor((nt.start + nt.len) * M.PPQ + 0.5)
    if off <= on then off = on + 1 end
    ev[#ev + 1] = { tick = on,  order = 1, b1 = 0x90, b2 = nt.pitch, b3 = nt.vel or 100 }
    ev[#ev + 1] = { tick = off, order = 0, b1 = 0x80, b2 = nt.pitch, b3 = 0 }
  end

  -- At a shared tick the note-offs go first, so a repeated note is not cut
  -- short by the release of the one before it.
  table.sort(ev, function(a, b)
    if a.tick  ~= b.tick  then return a.tick  < b.tick  end
    if a.order ~= b.order then return a.order < b.order end
    return a.b2 < b.b2
  end)

  local trk = { M.varlen(0) .. meta(0x03, name or "") }
  if header then trk[#trk + 1] = header end

  local last = 0
  for _, e in ipairs(ev) do
    trk[#trk + 1] = M.varlen(e.tick - last) ..
                    string.char(e.b1, e.b2 % 128, e.b3 % 128)
    last = e.tick
  end

  -- End the track at the end of the block, not at the last note-off, so an
  -- empty tail survives the trip.
  local endTick = math.max(math.floor((beats or 0) * M.PPQ + 0.5), last)
  trk[#trk + 1] = M.varlen(endTick - last) .. meta(0x2F, "")

  local body = table.concat(trk)
  return "MTrk" .. be32(#body) .. body
end

-- Format 0: one track holding everything.
function M.build(notes, beats, name, bpm, tsNum, tsDen)
  return "MThd" .. be32(6) .. be16(0) .. be16(1) .. be16(M.PPQ) ..
         track(notes, beats, name, tempoAndMetre(bpm, tsNum, tsDen))
end

-- Format 1: a first track carrying the tempo and metre, then one track per
-- part, each named for its instrument. `parts` is { { name, notes } }.
function M.buildParts(parts, beats, name, bpm, tsNum, tsDen)
  if #parts == 1 then return M.build(parts[1].notes, beats, name, bpm, tsNum, tsDen) end
  local chunks = { track({}, beats, name, tempoAndMetre(bpm, tsNum, tsDen)) }
  for _, part in ipairs(parts) do
    chunks[#chunks + 1] = track(part.notes, beats, part.name)
  end
  return "MThd" .. be32(6) .. be16(1) .. be16(#chunks) .. be16(M.PPQ) .. table.concat(chunks)
end

-- Block names carry things a filename should not: slashes, sharps,
-- parentheses. Keep letters, digits, space and a few safe marks.
function M.sanitise(name)
  local s = (name or ""):gsub("[^%w%s%-%+#&%.]", "_")
  s = s:gsub("#", "sharp"):gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
  if s == "" then s = "Block" end
  return s:sub(1, 100)
end

return M
