--[[ Midi Catalogue - getting a block into the project.

     Everything here talks to REAPER, and nothing here touches ImGui, so
     tests/test_place.lua can run it against a mocked reaper and check what it
     asks REAPER to do. The mock is written from the API documentation's
     signatures, not from what this file expects.

     Starting Blocks' placement, with one addition: a block spread across a
     section arrives as one new track per instrument, named for it, so the
     violins' part is on a track called Violin I.
]]

local M = {}

M.OK, M.NO_TRACK, M.WRITE_FAILED, M.NOTHING = 0, 1, 2, 3

local SEP = package.config:sub(1, 1)

function M.setMidi(midi) M.midi = midi end

------------------------------------------------------------------------------
-- What the project is doing
------------------------------------------------------------------------------

function M.tempo() return reaper.Master_GetTempo() end

-- Three return values, numerator first: there is no retval in front of them.
function M.timeSig(at)
  local num, den = reaper.TimeMap_GetTimeSigAtTime(0, at or 0)
  if not num or num <= 0 or not den or den <= 0 then return 4, 4 end
  return num, den
end

-- A bar, in quarter notes, so the catalogue lays blocks out the way the
-- project counts.
function M.barBeats()
  local num, den = M.timeSig(reaper.GetCursorPosition())
  return num * 4 / den
end

------------------------------------------------------------------------------
-- Putting a block on tracks
------------------------------------------------------------------------------

-- A selected track wins, because that is the one being pointed at.
function M.defaultTrack()
  return reaper.GetSelectedTrack(0, 0) or reaper.GetLastTouchedTrack()
end

-- One MIDI item on a track, holding one part's notes.
local function writeItem(track, time, startQN, beats, notes, name)
  local endTime = reaper.TimeMap2_QNToTime(0, startQN + beats)
  local item = reaper.CreateNewMIDIItemInProj(track, time, endTime, false)
  if not item then return false end
  local take = reaper.GetActiveTake(item)
  for _, nt in ipairs(notes) do
    local sp = reaper.MIDI_GetPPQPosFromProjQN(take, startQN + nt.start)
    local ep = reaper.MIDI_GetPPQPosFromProjQN(take, startQN + nt.start + nt.len)
    reaper.MIDI_InsertNote(take, false, false, sp, ep, 0, nt.pitch, nt.vel or 100, true)
  end
  reaper.MIDI_Sort(take)
  reaper.GetSetMediaItemTakeInfo_String(take, "P_NAME", name, true)
  return true
end

-- A single part goes on the selected track at the edit cursor. A block with
-- several parts gets a new track for each, named for its instrument, placed
-- under the selected track (or at the end of the project when nothing is
-- selected), all at the edit cursor, as one undo step.
function M.insert(block, track, time)
  if #block.notes == 0 then return M.NOTHING end
  time = time or reaper.GetCursorPosition()
  local startQN = reaper.TimeMap2_timeToQN(0, time)

  if #block.parts == 1 then
    track = track or M.defaultTrack()
    if not track then return M.NO_TRACK end
    reaper.Undo_BeginBlock()
    local ok = writeItem(track, time, startQN, block.beats, block.parts[1].notes, block.name)
    reaper.UpdateArrange()
    reaper.Undo_EndBlock("Midi Catalogue: " .. block.name, -1)
    return ok and M.OK or M.NO_TRACK
  end

  local anchor = track or M.defaultTrack()
  local idx = anchor and math.floor(reaper.GetMediaTrackInfo_Value(anchor, "IP_TRACKNUMBER")) or 0
  if idx <= 0 then idx = reaper.CountTracks(0) end

  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)
  local ok = true
  for k, part in ipairs(block.parts) do
    reaper.InsertTrackAtIndex(idx + k - 1, true)
    local tr = reaper.GetTrack(0, idx + k - 1)
    reaper.GetSetMediaTrackInfo_String(tr, "P_NAME", part.name, true)
    ok = writeItem(tr, time, startQN, block.beats, part.notes, block.name .. " - " .. part.name) and ok
  end
  reaper.PreventUIRefresh(-1)
  reaper.TrackList_AdjustWindows(false)
  reaper.UpdateArrange()
  reaper.Undo_EndBlock("Midi Catalogue: " .. block.name, -1)
  return ok and M.OK or M.NO_TRACK
end

------------------------------------------------------------------------------
-- Writing one out
------------------------------------------------------------------------------

function M.binPath()
  return reaper.GetResourcePath() .. SEP .. "Midi Catalogue"
end

local function exists(path)
  local f = io.open(path, "rb")
  if f then f:close(); return true end
  return false
end

-- Exporting the same block twice gives two files, not one.
function M.uniquePath(dir, base)
  local path = dir .. SEP .. base .. ".mid"
  local n = 2
  while exists(path) do
    path = dir .. SEP .. base .. " " .. n .. ".mid"
    n = n + 1
    if n > 999 then return nil end
  end
  return path
end

function M.export(block)
  if #block.notes == 0 then return M.NOTHING end
  local dir = M.binPath()
  reaper.RecursiveCreateDirectory(dir, 0)

  local path = M.uniquePath(dir, M.midi.sanitise(block.name))
  if not path then return M.WRITE_FAILED end

  local num, den = M.timeSig(reaper.GetCursorPosition())
  local f = io.open(path, "wb")
  if not f then return M.WRITE_FAILED end
  f:write(M.midi.buildParts(block.parts, block.beats, block.name, M.tempo(), num, den))
  f:close()
  return M.OK, path
end

------------------------------------------------------------------------------
-- Hearing one
--
-- Notes go to the virtual keyboard, so a record-armed and monitored track
-- plays them. A deferred script wakes about thirty times a second, so this is
-- a preview rather than a performance: a note lands on the nearest wake-up,
-- not on the sample. Anything that needs to be exact wants the block in the
-- project, where REAPER plays it properly.
------------------------------------------------------------------------------

local preview = { on = false, notes = nil, t0 = 0, idx = 1, sounding = {}, spb = 0.5 }
M.preview = preview

local function allNotesOff()
  for pitch in pairs(preview.sounding) do
    reaper.StuffMIDIMessage(0, 0x80, pitch, 0)
  end
  preview.sounding = {}
end

function M.previewStart(block, tempo, now)
  M.previewStop()
  if #block.notes == 0 then return false end
  -- Sorted by start, so the loop only ever looks at the next one due.
  local notes = {}
  for i, n in ipairs(block.notes) do notes[i] = n end
  table.sort(notes, function(a, b) return a.start < b.start end)

  preview.on, preview.notes = true, notes
  preview.idx, preview.sounding = 1, {}
  preview.spb = 60 / math.max(tempo or 120, 1)
  preview.t0 = now or reaper.time_precise()
  preview.beats = block.beats
  return true
end

function M.previewStop()
  if preview.on then allNotesOff() end
  preview.on, preview.notes = false, nil
end

function M.previewRunning() return preview.on end

-- Returns how far through the block the preview is, 0 to 1, or nil when it is
-- not running. Called once per defer.
function M.previewTick(now, loop)
  if not preview.on then return nil end
  now = now or reaper.time_precise()
  local at = (now - preview.t0) / preview.spb        -- in quarter notes

  while preview.idx <= #preview.notes and preview.notes[preview.idx].start <= at do
    local n = preview.notes[preview.idx]
    reaper.StuffMIDIMessage(0, 0x90, n.pitch, n.vel or 100)
    preview.sounding[n.pitch] = math.max(preview.sounding[n.pitch] or 0,
                                         n.start + n.len)
    preview.idx = preview.idx + 1
  end

  for pitch, until_ in pairs(preview.sounding) do
    if at >= until_ then
      reaper.StuffMIDIMessage(0, 0x80, pitch, 0)
      preview.sounding[pitch] = nil
    end
  end

  if at >= preview.beats then
    if loop then
      allNotesOff()
      preview.idx, preview.t0 = 1, now
      return 0
    end
    M.previewStop()
    return nil
  end
  return at / math.max(preview.beats, 1e-9)
end

return M
