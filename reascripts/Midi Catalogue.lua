--[[
 * ReaScript Name: Midi Catalogue
 * Description:    A catalogue of musical ideas - rhythms, melodies and
 *                 harmony - generated for your scale, your chords and the
 *                 instrument you are writing for, and put into the project as
 *                 MIDI.
 *
 * About:          Pick a scale. Pick the chords underneath. Pick an instrument
 *                 of the orchestra, or a section. Then browse the catalogue
 *                 for that instrument - every entry calculated, none stored -
 *                 shape the one you like, and insert it at the edit cursor,
 *                 write it out as a .mid, or audition it.
 *
 *                 Needs ReaImGui, from the ReaTeam Extensions repository.
 * Author:         Kallum Shah
 * Links:          https://github.com/KallumS/Midi-Catalogue
 * Version:        1.0
 * Provides:
 *   mc_theory.lua
 *   mc_orchestra.lua
 *   mc_catalogue.lua
 *   mc_midi.lua
 *   mc_place.lua
--]]

local TITLE   = "Midi Catalogue"
local SECTION = "MidiCatalogue"

------------------------------------------------------------------------------
-- Dependencies
------------------------------------------------------------------------------

local imgui_path = reaper.ImGui_GetBuiltinPath and
                   (reaper.ImGui_GetBuiltinPath() .. "/imgui.lua")
if not imgui_path then
  reaper.MB("Midi Catalogue needs the ReaImGui extension.\n\n" ..
            "Install it with ReaPack, from the ReaTeam Extensions repository.",
            "Missing dependency", 0)
  return
end
local ImGui = dofile(imgui_path)("0.9")

local HERE  = ({ reaper.get_action_context() })[2]:match("^(.*[/\\])")
local T     = dofile(HERE .. "mc_theory.lua")
local O     = dofile(HERE .. "mc_orchestra.lua")
local C     = dofile(HERE .. "mc_catalogue.lua").init(T, O)
local Midi  = dofile(HERE .. "mc_midi.lua")
local Place = dofile(HERE .. "mc_place.lua")
Place.setMidi(Midi)

------------------------------------------------------------------------------
-- Look
--
-- The house scheme, the same as Starting Blocks, Midi Suggester and Midi
-- Variator: a dark cool-grey ground, a light grey for the controls raised off
-- it, and one yellow for whatever is switched on. docs/COLOUR.md has it all.
--
-- **Every grey here is blue-shifted** - R < G < B, all the way down the ramp.
-- A neutral grey looks correct in a diff and only reads as flat next to the
-- yellow.
------------------------------------------------------------------------------

local THEME = {
  { "Col_Text",              0xDDE1E7FF },
  { "Col_TextDisabled",      0x8A919CFF },
  { "Col_WindowBg",          0x23272EFF },   -- the chrome: dark grey, cool
  { "Col_PopupBg",           0x1B1F25FF },
  { "Col_Border",            0x14171CFF },
  { "Col_FrameBg",           0x1A1D23FF },
  { "Col_FrameBgHovered",    0x22262DFF },
  { "Col_FrameBgActive",     0x2A2F37FF },
  { "Col_TitleBg",           0x1B1F25FF },
  { "Col_TitleBgActive",     0x23272EFF },
  { "Col_TitleBgCollapsed",  0x1B1F25FF },
  { "Col_Button",            0xA9AFBAFF },   -- the controls: light grey, raised
  { "Col_ButtonHovered",     0xC0C6CFFF },
  { "Col_ButtonActive",      0x8F96A2FF },
  { "Col_CheckMark",         0xFFF200FF },
  { "Col_SliderGrab",        0xA9AFBAFF },
  { "Col_SliderGrabActive",  0xFFF200FF },
  { "Col_Separator",         0x3A404AFF },
  { "Col_ScrollbarBg",       0x1A1D23FF },
  { "Col_ScrollbarGrab",     0x585F6BFF },
  { "Col_ScrollbarGrabHovered", 0x6D7581FF },
  { "Col_ScrollbarGrabActive",  0xA9AFBAFF },
}

local SELECTED  = 0xFFF200FF   -- the accent: what is switched on, and the notes
local INK       = 0x14171CFF   -- the text on every button, grey or yellow
local STEP      = 0xBFC5CEFF   -- the step numbers: neutral
local NOTE_COL  = SELECTED
local ROLL_BG   = 0x111419FF
local ROLL_BAR  = 0x3A404AFF
local ROLL_BEAT = 0x1E2228FF
local PLAYHEAD  = 0xF2F4F7FF
local DIM       = 0x8A919CFF
local WARN      = 0xD2483FFF

-- Shifts a colour towards white or black, so the chosen state needs one colour
-- rather than three. Arithmetic rather than bit operators, and it keeps the
-- alpha byte, or ReaImGui is handed a fully transparent colour.
local function shade(col, amount)
  local a = col % 256
  local b = math.floor(col / 256) % 256
  local g = math.floor(col / 65536) % 256
  local r = math.floor(col / 16777216) % 256
  local function mix(c)
    if amount >= 0 then return math.floor(c + (255 - c) * amount + 0.5) end
    return math.floor(c * (1 + amount) + 0.5)
  end
  return mix(r) * 16777216 + mix(g) * 65536 + mix(b) * 256 + a
end

------------------------------------------------------------------------------
-- State
------------------------------------------------------------------------------

local st = C.newState()
local ui = {
  loop = false, status = "", warn = false,
  ctx = nil, list = nil, shown = {}, entry = nil, block = nil,
  dirty = true, playhead = nil,
}

local ctx

local function touched() ui.dirty = true end
local function say(text, warn) ui.status, ui.warn = text, warn or false end

-- Everything that follows from the settings: the context, the catalogue for
-- the chosen type, which of it the density filter lets through, the entry,
-- and the block made from it. Generated when something changes, never per
-- frame.
local function rebuild()
  C.clampState(st)
  ui.ctx = C.contextFor(st, Place.barBeats(), Place.tempo())
  ui.list = C.catalogue(ui.ctx, st.type)
  ui.shown = {}
  for _, e in ipairs(ui.list.entries) do
    if st.density == "Any" or e.band == st.density then ui.shown[#ui.shown + 1] = e end
  end
  -- The entry is kept by id, so it survives a change of key or instrument
  -- whenever the same entry exists there too.
  ui.entry = nil
  for _, e in ipairs(ui.shown) do if e.id == st.entry then ui.entry = e end end
  ui.entry = ui.entry or ui.shown[1]
  ui.block = ui.entry and C.block(ui.ctx, st.type, ui.entry,
    { transform = st.transform, repeats = st.repeats, velocity = st.velocity }) or nil
  ui.dirty = false
end

------------------------------------------------------------------------------
-- Settings that outlive the window
------------------------------------------------------------------------------

local SAVED = { "root", "scale", "prog", "colour", "bars", "inst", "section", "register",
                "cat", "type", "entry", "transform", "repeats", "velocity", "density" }

local function saveState()
  local out = {}
  for _, k in ipairs(SAVED) do out[#out + 1] = k .. "=" .. tostring(st[k]) end
  reaper.SetExtState(SECTION, "state", table.concat(out, ";"), true)
end

local function loadState()
  local blob = reaper.GetExtState(SECTION, "state")
  if not blob or blob == "" then return end
  local got = {}
  for pair in blob:gmatch("[^;]+") do
    local k, v = pair:match("^(%w+)=(.*)$")
    if k then got[k] = v end
  end
  for _, k in ipairs(SAVED) do
    if got[k] then st[k] = tonumber(got[k]) or got[k] end
  end
  -- Ids that look like numbers come back as numbers; the ones kept as names
  -- are turned back into strings before anything compares them.
  for _, k in ipairs({ "prog", "inst", "section", "entry", "type", "cat" }) do
    if st[k] ~= nil then st[k] = tostring(st[k]) end
  end
  C.clampState(st)
end

------------------------------------------------------------------------------
-- Widgets
------------------------------------------------------------------------------

local function pushTheme()
  for _, c in ipairs(THEME) do ImGui.PushStyleColor(ctx, ImGui[c[1]], c[2]) end
end
local function popTheme() ImGui.PopStyleColor(ctx, #THEME) end

-- An unchosen button wears the theme's grey, a chosen one the accent. Either
-- way the text on it goes to INK: both are far lighter than the chrome.
local function pick(label, selected, width)
  local pushed = 1
  if selected then
    ImGui.PushStyleColor(ctx, ImGui.Col_Button, SELECTED)
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonHovered, shade(SELECTED, 0.18))
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonActive, shade(SELECTED, -0.18))
    pushed = 4
  end
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, INK)
  local hit = ImGui.Button(ctx, label, width or 0, 0)
  ImGui.PopStyleColor(ctx, pushed)
  return hit
end

local function heading(n, text)
  if n then
    ImGui.PushStyleColor(ctx, ImGui.Col_Text, STEP)
    ImGui.Text(ctx, tostring(n))
    ImGui.PopStyleColor(ctx, 1)
    ImGui.SameLine(ctx, 0, 10)
  end
  ImGui.SeparatorText(ctx, text)
end

-- The space between one numbered step and the next. A gap, not an arrow.
local STEP_GAP = 22
local function stepGap() ImGui.Dummy(ctx, 16, STEP_GAP) end

local function tip(text)
  if text and ImGui.IsItemHovered(ctx) then ImGui.SetTooltip(ctx, text) end
end

local function dim(text)
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, DIM)
  ImGui.Text(ctx, text)
  ImGui.PopStyleColor(ctx, 1)
end

-- A row of choices that wraps where the window does. `label` and `hint` name
-- each item; returns the index clicked, or nil.
local PAD = 18
local function flow(id, items, isChosen, label, hint, minWidth)
  local chosen
  local avail = select(1, ImGui.GetContentRegionAvail(ctx))
  local x = 0
  ImGui.PushID(ctx, id)
  for i, item in ipairs(items) do
    local text = label and label(item, i) or tostring(item)
    local w = math.max(minWidth or 0, select(1, ImGui.CalcTextSize(ctx, text)) + PAD)
    if i > 1 then
      if x + 8 + w <= avail then ImGui.SameLine(ctx); x = x + 8 else x = 0 end
    end
    x = x + w
    ImGui.PushID(ctx, i)
    if pick(text, isChosen(item, i), w) then chosen = i end
    if hint then tip(hint(item, i)) end
    ImGui.PopID(ctx)
  end
  ImGui.PopID(ctx)
  return chosen
end

------------------------------------------------------------------------------
-- The preview roll
------------------------------------------------------------------------------

local function pianoRoll(block, width, height, playhead)
  local dl = ImGui.GetWindowDrawList(ctx)
  local x, y = ImGui.GetCursorScreenPos(ctx)
  ImGui.InvisibleButton(ctx, "##roll", width, height)

  ImGui.DrawList_AddRectFilled(dl, x, y, x + width, y + height, ROLL_BG, 3)
  if not block or #block.notes == 0 then return end

  local beats = math.max(block.beats, 1e-9)
  local bar = math.max(ui.ctx and ui.ctx.barBeats or 4, 1)
  local count = math.floor(beats + 1e-9)
  for b = 0, count do
    local gx = x + width * (b / beats)
    ImGui.DrawList_AddLine(dl, gx, y, gx, y + height,
                           (b % bar < 1e-9) and ROLL_BAR or ROLL_BEAT, 1)
  end

  local lo, hi = 200, -1
  for _, n in ipairs(block.notes) do lo, hi = math.min(lo, n.pitch), math.max(hi, n.pitch) end
  -- A repeated single note would fill the whole box, so always show at least
  -- an octave of context around it.
  if hi - lo < 11 then
    lo = math.max(0, math.floor((lo + hi) / 2) - 6)
    hi = lo + 12
  end
  local rowh = height / (hi - lo + 1)

  for _, n in ipairs(block.notes) do
    local nx = x + width * (n.start / beats)
    local nw = math.max(2, width * (n.len / beats) - 1)
    local ny = y + height - (n.pitch - lo + 1) * rowh
    ImGui.DrawList_AddRectFilled(dl, nx, ny, nx + nw, ny + math.max(2, rowh - 1), NOTE_COL, 1)
  end

  if playhead then
    local px = x + width * math.min(1, playhead)
    ImGui.DrawList_AddLine(dl, px, y, px, y + height, PLAYHEAD, 2)
  end
end

------------------------------------------------------------------------------
-- The steps
------------------------------------------------------------------------------

local function drawScale()
  heading(1, "Scale")
  local r = flow("root", T.ROOTS, function(_, i) return st.root == i end,
                 function(x) return x.name end, nil, 40)
  if r then st.root = r; touched() end
  local s = flow("scale", T.SCALES, function(_, i) return st.scale == i end,
                 function(x) return x.name end, nil, 96)
  if s then st.scale = s; touched() end
  local key = T.key(st.root, st.scale)
  local names = {}
  for d = 0, T.scaleLen(key) - 1 do names[#names + 1] = T.noteName(key, d) end
  dim(table.concat(names, "  "))
  stepGap()
end

local function drawChords()
  heading(2, "Chords underneath")
  local key = T.key(st.root, st.scale)
  local progs = T.progressionsFor(key)
  local p = flow("prog", progs, function(x) return x.id == st.prog end,
                 function(x) return T.progressionName(key, x) end,
                 function(x)
                   local per = st.bars / #x.degrees
                   local each
                   if #x.degrees == 1 then each = "for the whole block"
                   elseif per >= 1 then each = ("every %g bar%s"):format(per, per == 1 and "" or "s")
                   else each = ("every %g beats"):format(per * (ui.ctx and ui.ctx.barBeats or 4)) end
                   return ("One chord %s. Everything in the catalogue is written over these."):format(each)
                 end, 60)
  if p then st.prog = progs[p].id; touched() end

  local c = flow("colour", C.COLOURS, function(x) return x.id == st.colour end,
                 function(x) return x.name end,
                 function(x) return x.id == "seventh" and "Chords with their sevenths: richer, jazzier"
                                                       or "Plain three-note chords" end, 84)
  if c then st.colour = C.COLOURS[c].id; touched() end
  ImGui.SameLine(ctx, 0, 24)
  dim("Bars")
  ImGui.SameLine(ctx)
  local b = flow("bars", C.LENGTHS, function(x) return x == st.bars end, nil, nil, 36)
  if b then st.bars = C.LENGTHS[b]; touched() end
  stepGap()
end

local function drawInstrument()
  heading(3, "Instrument")
  for _, fam in ipairs(O.FAMILIES) do
    local list = {}
    for _, inst in ipairs(O.INSTRUMENTS) do if inst.family == fam then list[#list + 1] = inst end end
    dim(fam)
    local i = flow("fam" .. fam, list, function(x) return st.section == "" and x.id == st.inst end,
                   function(x) return x.name end,
                   function(x) return ("%s to %s, happiest %s to %s"):format(
                     T.pitchName(x.low), T.pitchName(x.high), T.pitchName(x.sweet[1]), T.pitchName(x.sweet[2])) end,
                   88)
    if i then st.inst = list[i].id; st.section = ""; touched() end
  end
  dim("Sections - harmony spread one voice to each part, a track each")
  local e = flow("sections", O.ENSEMBLES, function(x) return st.section == x.id end,
                 function(x) return x.name end,
                 function(x)
                   local names = {}
                   for _, part in ipairs(x.parts) do names[#names + 1] = part.name end
                   return table.concat(names, ", ")
                 end, 88)
  if e then st.section = O.ENSEMBLES[e].id; st.cat = "Harmony"; touched() end

  dim("Register")
  local r = flow("register", O.REGISTERS, function(x) return x == st.register end, nil,
                 function(x) return ({ Low = "The lower part of where it sounds best",
                                       Middle = "The middle of where it sounds best",
                                       High = "The upper part of where it sounds best" })[x] end, 72)
  if r then st.register = O.REGISTERS[r]; touched() end
  stepGap()
end

local function drawCatalogue()
  heading(4, "Catalogue")
  -- A section plays harmony, so the other two categories are not offered
  -- rather than offered and ignored.
  local cats = {}
  for _, c in ipairs(C.CATEGORIES) do
    if st.section == "" or c.name == "Harmony" then cats[#cats + 1] = c end
  end
  local c = flow("cat", cats, function(x) return x.name == st.cat end,
                 function(x) return x.name end, nil, 96)
  if c then
    st.cat = cats[c].name
    st.type = cats[c].types[1]
    touched()
  end
  local types
  for _, cc in ipairs(C.CATEGORIES) do if cc.name == st.cat then types = cc.types end end
  local t = flow("type", types, function(x) return x == st.type end, nil, nil, 72)
  if t then st.type = types[t]; touched() end

  ImGui.Dummy(ctx, 0, 4)
  local list = ui.list
  if list.avoided then
    dim(list.avoided .. ".")
    return
  end

  dim("Density")
  ImGui.SameLine(ctx)
  local d = flow("density", C.DENSITIES, function(x) return x == st.density end, nil,
                 function(x)
                   local n = 0
                   for _, e in ipairs(list.entries) do if x == "Any" or e.band == x then n = n + 1 end end
                   return n .. " entr" .. (n == 1 and "y" or "ies")
                 end, 64)
  if d then st.density = C.DENSITIES[d]; touched() end

  local hiddenCount = 0
  for _, h in ipairs(list.hidden) do hiddenCount = hiddenCount + h.count end
  dim(("%d in the catalogue for the %s%s"):format(#ui.shown,
    (st.section ~= "" and O.ensembleById(st.section).name or O.byId(st.inst).name),
    hiddenCount > 0 and (", " .. hiddenCount .. " left out") or ""))
  if hiddenCount > 0 then
    local why = {}
    for _, h in ipairs(list.hidden) do why[#why + 1] = h.count .. " " .. h.reason end
    tip("Left out: " .. table.concat(why, "; ") .. ".")
  end

  if #ui.shown == 0 then
    dim("Nothing here at this density. Try another.")
    return
  end
  local chosen = ui.entry and ui.entry.id
  local k = flow("entries", ui.shown, function(x) return x.id == chosen end,
                 function(x) return x.label end,
                 function(x) return ("%s\n\n%s, %.1f notes a beat."):format(x.hint, x.band, x.density) end, 120)
  if k then st.entry = ui.shown[k].id; touched() end
end

local function drawShape()
  ImGui.Dummy(ctx, 0, 6)
  heading(nil, "Shape it")
  dim("Transform")
  local t = flow("transform", C.TRANSFORMS, function(x) return x == st.transform end, nil,
                 function(x) return ({
                   Original = "As it comes",
                   Inversion = "Upside down, in the scale. Notes that were on the chord stay on the chord.",
                   Retrograde = "Backwards. Notes that were on the chord land on the chord now under them.",
                   ["Retrograde inversion"] = "Backwards and upside down.",
                   Augmentation = "Twice as slow, chords and all.",
                   Diminution = "Twice as fast, chords and all.",
                 })[x] end, 80)
  if t then st.transform = C.TRANSFORMS[t]; touched() end

  dim("Repeats")
  ImGui.SameLine(ctx)
  local r = flow("repeats", C.REPEATS, function(x) return x == st.repeats end,
                 function(x) return "x" .. x end, nil, 40)
  if r then st.repeats = C.REPEATS[r]; touched() end
  ImGui.SameLine(ctx, 0, 24)
  dim("Velocity")
  ImGui.SameLine(ctx)
  local v = flow("velocity", C.VELOCITIES, function(x) return x == st.velocity end, nil,
                 function(x) return x == "Accents" and
                   ("Every note at 100, and the accented ones - the start of each group, the "
                    .. "downbeats - at " .. C.ACCENT)
                   or "Every note at 100" end, 80)
  if v then st.velocity = C.VELOCITIES[v]; touched() end
end

local function drawActions()
  local block = ui.block
  ImGui.Dummy(ctx, 0, 6)
  heading(nil, block and block.name or "")

  local w = select(1, ImGui.GetContentRegionAvail(ctx))
  pianoRoll(block, math.max(120, w), 110, Place.previewRunning() and ui.playhead or nil)

  if block then
    local parts = {}
    for _, p in ipairs(block.parts) do parts[#parts + 1] = p.name end
    dim(("%d notes  /  %.2f beats  /  %s"):format(#block.notes, block.beats, table.concat(parts, ", ")))
    if block.warning then
      ImGui.PushStyleColor(ctx, ImGui.Col_Text, WARN)
      ImGui.Text(ctx, block.warning)
      ImGui.PopStyleColor(ctx, 1)
    end
  end

  ImGui.Dummy(ctx, 0, 2)
  if not block then return end

  local many = #block.parts > 1
  if pick(many and "Insert on new tracks" or "Insert at cursor", false, 170) then
    local res = Place.insert(block)
    if res == Place.OK then say(many and ("Inserted " .. #block.parts .. " tracks at the edit cursor")
                                      or "Inserted at the edit cursor")
    elseif res == Place.NOTHING then say("Nothing to insert", true)
    else say("No track selected", true) end
  end
  tip(many and "One new track per instrument, named for it, under the selected track"
           or "On the selected track, at the edit cursor")

  ImGui.SameLine(ctx)
  if pick("Export .mid", false, 120) then
    local res, path = Place.export(block)
    if res == Place.OK then say("Wrote " .. tostring(path))
    elseif res == Place.NOTHING then say("Nothing to write", true)
    else say("Could not write the file", true) end
  end
  tip("Into the Midi Catalogue folder in REAPER's resource path" ..
      (many and ", one track per instrument" or ""))

  ImGui.SameLine(ctx, 0, 16)
  if pick(Place.previewRunning() and "Stop" or "Audition", Place.previewRunning(), 96) then
    if Place.previewRunning() then Place.previewStop()
    else Place.previewStart(block, Place.tempo()) end
  end
  tip("Plays through the virtual keyboard, so a record-armed monitored track " ..
      "will sound it. Timing is a preview, not a performance.")

  ImGui.SameLine(ctx)
  local _
  _, ui.loop = ImGui.Checkbox(ctx, "Loop", ui.loop)

  if ui.status ~= "" then
    ImGui.PushStyleColor(ctx, ImGui.Col_Text, ui.warn and WARN or DIM)
    ImGui.Text(ctx, ui.status)
    ImGui.PopStyleColor(ctx, 1)
  end
end

local function frame()
  if ui.dirty then rebuild() end
  ui.playhead = Place.previewTick(nil, ui.loop)

  drawScale()
  drawChords()
  drawInstrument()
  drawCatalogue()
  drawShape()
  drawActions()
end

------------------------------------------------------------------------------
-- Running
------------------------------------------------------------------------------

local sectionID, cmdID

local function loop()
  ImGui.SetNextWindowSize(ctx, 1040, 900, ImGui.Cond_FirstUseEver)
  -- Solid rather than the half-transparent window ReaImGui opens by default.
  ImGui.SetNextWindowBgAlpha(ctx, 1.0)
  pushTheme()
  local visible, open = ImGui.Begin(ctx, TITLE, true)
  if visible then
    frame()
    ImGui.End(ctx)
  end
  popTheme()   -- outside the visible test: a push always needs its pop
  if open and not ImGui.IsKeyPressed(ctx, ImGui.Key_Escape) then
    reaper.defer(loop)
  end
end

local function shutdown()
  Place.previewStop()
  saveState()
  if sectionID then
    reaper.SetToggleCommandState(sectionID, cmdID, 0)
    reaper.RefreshToolbar2(sectionID, cmdID)
  end
end

local function main()
  loadState()
  local _, _, sid, cid = reaper.get_action_context()
  sectionID, cmdID = sid, cid
  reaper.SetToggleCommandState(sectionID, cmdID, 1)
  reaper.RefreshToolbar2(sectionID, cmdID)
  reaper.atexit(shutdown)
  reaper.set_action_options(1)
  ctx = ImGui.CreateContext(TITLE)
  reaper.defer(loop)
end

main()
