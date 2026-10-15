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
 * Version:        1.2
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
            "Install ReaImGui with ReaPack, from the ReaTeam Extensions repository, " ..
            "then run Midi Catalogue again.",
            "ReaImGui Is Missing", 0)
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
  -- The keyboard's focus ring: near-white, because yellow means "on" and a
  -- focused control need not be.
  { "Col_NavHighlight",      0xF2F4F7FF },
}

local SELECTED  = 0xFFF200FF   -- the accent: what is switched on, and the notes
local INK       = 0x14171CFF   -- the text on every button, grey or yellow
local STEP      = 0xBFC5CEFF   -- the step numbers: neutral
local NOTE_COL  = SELECTED
local ROLL_BG   = 0x111419FF
local ROLL_BAR  = 0x3A404AFF
local ROLL_BEAT = 0x1E2228FF
local PLAYHEAD  = 0xF2F4F7FF
-- Secondary text and warnings are 7:1 against the ground, Apple's target
-- for small text in a dark window (0012). The ramp's #8A919C was 4.7:1 and
-- the house red #D2483F 3.4:1, so neither is used for words any more.
local DIM       = 0xB0B6C0FF
local WARN      = 0xFF9E96FF

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
  edit = nil,        -- which chord of the chain is open for changing, if any
  chordFam = nil,    -- which family of chords the editor is showing
  instFam = nil,     -- which family of instruments step 3 is showing
}

local ctx

------------------------------------------------------------------------------
-- Apple's Human Interface Guidelines (0012, docs/apple-hig-review.md)
--
-- Text Size, in the View menu: Apple asks that text can be made at least
-- twice as big, and 13 points is the Mac's default text size. Every fixed
-- width in the window goes through px(), so it grows with the text. It is a
-- preference about the window, so it is kept on `ui` and saved under its own
-- key rather than in `st`, which the engine clamps.
------------------------------------------------------------------------------

local TEXT_SIZES = { 100, 125, 150, 200 }
local BASE_TEXT = 13
local fonts = {}           -- one per size, made and attached once in main()
local S = 1                -- the chosen size as a scale: 1, 1.25, 1.5 or 2
ui.textSize = 1
local function px(n) return math.floor(n * S + 0.5) end

local function setTextSize(i)
  ui.textSize = math.max(1, math.min(#TEXT_SIZES, math.floor(tonumber(i) or 1)))
  S = TEXT_SIZES[ui.textSize] / 100
end

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

local SAVED = { "root", "scale", "chain", "bars", "inst", "section", "register",
                "cat", "type", "entry", "transform", "repeats", "velocity", "density" }

local function saveState()
  local out = {}
  for _, k in ipairs(SAVED) do out[#out + 1] = k .. "=" .. tostring(st[k]) end
  reaper.SetExtState(SECTION, "state", table.concat(out, ";"), true)
  reaper.SetExtState(SECTION, "view", "textSize=" .. ui.textSize, true)
end

local function loadState()
  -- The window's own preference, clamped by setTextSize.
  setTextSize((reaper.GetExtState(SECTION, "view") or ""):match("textSize=([%-%d%.]+)"))
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
  for _, k in ipairs({ "chain", "inst", "section", "entry", "type", "cat" }) do
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

-- The text size and Apple's Mac control: 28 points tall at 100% (a 13-point
-- line and 7.5 above and below), about 12 points between controls. Pushed
-- before Begin and popped after End, like the theme.
local SIZE_VARS = 3
local function pushSize()
  ImGui.PushFont(ctx, fonts[ui.textSize])
  ImGui.PushStyleVar(ctx, ImGui.StyleVar_FramePadding, px(8), 7.5 * S)
  ImGui.PushStyleVar(ctx, ImGui.StyleVar_ItemSpacing, px(12), px(12))
  ImGui.PushStyleVar(ctx, ImGui.StyleVar_ItemInnerSpacing, px(8), px(6))
end
local function popSize()
  ImGui.PopStyleVar(ctx, SIZE_VARS)
  ImGui.PopFont(ctx)
end

-- A button's width: the width asked for (0 is its label's), grown with the
-- text size, and never narrower than its label, so nothing is cut short. An
-- exact width was measured in the current font already and is not grown again.
local function fit(label, width, exact)
  local text = label:gsub("##.*$", "")
  return math.max(exact and width or px(width or 0), select(1, ImGui.CalcTextSize(ctx, text)) + px(16))
end

-- An unchosen button wears the theme's grey, a chosen one the accent. Either
-- way the text on it goes to INK: both are far lighter than the chrome.
local function pick(label, selected, width, exact)
  local pushed = 1
  if selected then
    ImGui.PushStyleColor(ctx, ImGui.Col_Button, SELECTED)
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonHovered, shade(SELECTED, 0.18))
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonActive, shade(SELECTED, -0.18))
    pushed = 4
  end
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, INK)
  local hit = ImGui.Button(ctx, label, fit(label, width, exact), 0)
  ImGui.PopStyleColor(ctx, pushed)
  -- Not colour alone: a chosen button also carries a bar under its label.
  if selected then
    local x1 = ImGui.GetItemRectMin(ctx)
    local x2, y2 = ImGui.GetItemRectMax(ctx)
    ImGui.DrawList_AddRectFilled(ImGui.GetWindowDrawList(ctx),
                                 x1 + px(8), y2 - px(5), x2 - px(8), y2 - px(3), INK)
  end
  return hit
end

local function heading(n, text)
  if n then
    ImGui.PushStyleColor(ctx, ImGui.Col_Text, STEP)
    ImGui.Text(ctx, tostring(n))
    ImGui.PopStyleColor(ctx, 1)
    ImGui.SameLine(ctx, 0, px(10))
  end
  ImGui.SeparatorText(ctx, text)
end

-- The space between one numbered step and the next. A gap, not an arrow.
local STEP_GAP = 22
local function stepGap() ImGui.Dummy(ctx, px(16), px(STEP_GAP)) end

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
    local w = fit(text, math.max(minWidth or 0, 0), false)
    w = math.max(w, select(1, ImGui.CalcTextSize(ctx, text)) + px(PAD))
    if i > 1 then
      if x + px(12) + w <= avail then ImGui.SameLine(ctx); x = x + px(12) else x = 0 end
    end
    x = x + w
    ImGui.PushID(ctx, i)
    if pick(text, isChosen(item, i), w, true) then chosen = i end
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

-- Step 2: the chain of chords. Closed, it is one row - the chords as buttons,
-- add, remove, and the length - so the window stays small. Clicking a chord
-- opens the editor for it underneath: its root (a degree of the scale), the
-- family, the chord, and the progressions to start again from. Clicking the
-- same chord again, or Done, closes it.
local function chain()
  return T.parseChain(st.chain, T.key(st.root, st.scale))
end

local function setChain(list)
  st.chain = T.chainString(list)
  touched()
end

local function linkFamily(link)
  if link.fam == "d" then return 1 end
  local c = T.chordBySym(link.name)
  return c and c.fam or 1
end

local function drawChordEditor(key, list)
  local link = list[ui.edit]
  local name, notes = T.linkSpelling(key, link)
  dim(("Chord %d:  %s — %s"):format(ui.edit, name, notes))

  local d = flow("deg", (function() local o = {}; for i = 0, T.scaleLen(key) - 1 do o[#o + 1] = i end; return o end)(),
                 function(x) return x == link.degree end,
                 function(x) return T.degreeNumeral(key, x) end,
                 function(x) return T.degreeTitle(key, x) .. " — " .. T.noteName(key, x) end, 52)
  if d then link.degree = d - 1; setChain(list) end

  ui.chordFam = ui.chordFam or linkFamily(link)
  local f = flow("cfam", T.FAMILIES, function(_, i) return i == ui.chordFam end, nil, nil, 92)
  if f then ui.chordFam = f end

  if ui.chordFam == 1 then
    local c = flow("dia", T.DIATONIC, function(x) return link.fam == "d" and link.name == x.name end,
                   function(x) return x.name end,
                   function(x)
                     local n, sp = T.linkSpelling(key, { degree = link.degree, fam = "d", name = x.name })
                     return ("%s: %s — built from the scale, so always in key"):format(n, sp)
                   end, 60)
    if c then link.fam, link.name = "d", T.DIATONIC[c].name; setChain(list) end
  else
    local fam = {}
    for _, ch in ipairs(T.CHORDS) do if ch.fam == ui.chordFam then fam[#fam + 1] = ch end end
    local c = flow("chords", fam, function(x) return link.fam == "c" and link.name == x.sym end,
                   function(x) return x.sym end,
                   function(x)
                     local n, sp = T.linkSpelling(key, { degree = link.degree, fam = "c", name = x.sym })
                     return ("%s (%s): %s"):format(n, x.name, sp)
                   end, 60)
    if c then link.fam, link.name = "c", fam[c].sym; setChain(list) end
  end

  dim("Start Again From")
  ImGui.SameLine(ctx)
  local progs = T.progressionsFor(key)
  local p = flow("prog", progs, function() return false end,
                 function(x) return T.progressionName(key, x) end,
                 function() return "Replace the chords above with this progression, as triads" end, 60)
  if p then setChain(T.presetChain(progs[p])); ui.edit = nil end
  ImGui.SameLine(ctx, 0, px(16))
  if pick("Done", false, 60) then ui.edit = nil end
end

local function drawChords()
  heading(2, "Chords")
  local key = T.key(st.root, st.scale)
  local list = chain()
  if ui.edit and ui.edit > #list then ui.edit = nil end

  local per = st.bars / #list
  local each = (per >= 1) and ("%g bar%s each"):format(per, per == 1 and "" or "s")
               or ("%g beats each"):format(per * (ui.ctx and ui.ctx.barBeats or 4))
  local c = flow("chain", list, function(_, i) return ui.edit == i end,
                 function(x) return T.linkLabel(key, x) end,
                 function(x)
                   local n, sp = T.linkSpelling(key, x)
                   return ("%s: %s   (%s)\nClick to change it."):format(n, sp, each)
                 end, 44)
  if c then
    if ui.edit == c then ui.edit = nil else ui.edit, ui.chordFam = c, nil end
  end
  if #list < T.MAX_CHAIN then
    ImGui.SameLine(ctx)
    if pick("+", false, 28) then
      local copy = list[ui.edit or #list]
      list[#list + 1] = { degree = copy.degree, fam = copy.fam, name = copy.name }
      setChain(list)
      ui.edit, ui.chordFam = #list, nil
    end
    tip("Add a chord at the end")
  end
  if #list > 1 then
    ImGui.SameLine(ctx)
    if pick("−", false, 28) then
      table.remove(list, ui.edit or #list)
      setChain(list)
      ui.edit = nil
    end
    tip(ui.edit and ("Remove chord " .. ui.edit) or "Remove the last chord")
  end
  ImGui.SameLine(ctx, 0, px(24))
  dim("Bars")
  ImGui.SameLine(ctx)
  local b = flow("bars", C.LENGTHS, function(x) return x == st.bars end, nil,
                 function() return "How long the idea lasts; the chords share it evenly" end, 36)
  if b then st.bars = C.LENGTHS[b]; touched() end

  if ui.edit then drawChordEditor(key, list) end
  stepGap()
end

-- Step 3: one row of families, then the instruments of the family showing.
-- The family is only where you are looking: the instrument chosen stays
-- chosen until another is clicked.
local function drawInstrument()
  heading(3, "Instrument")
  local fams = {}
  for _, f in ipairs(O.FAMILIES) do fams[#fams + 1] = f end
  fams[#fams + 1] = "Sections"
  if not ui.instFam then
    ui.instFam = (st.section ~= "") and "Sections" or O.byId(st.inst).family
  end
  -- "Keys & Harp" is the family's name in the data; the window spells out the
  -- "and", as Apple's writing guidelines prefer.
  local f = flow("instfam", fams, function(x) return x == ui.instFam end,
                 function(x) return (x:gsub(" & ", " and ")) end, nil, 84)
  if f then ui.instFam = fams[f] end
  ImGui.SameLine(ctx, 0, px(24))
  dim("Register")
  ImGui.SameLine(ctx)
  local r = flow("register", O.REGISTERS, function(x) return x == st.register end, nil,
                 function(x) return ({ Low = "The lower part of where it sounds best",
                                       Middle = "The middle of where it sounds best",
                                       High = "The upper part of where it sounds best" })[x] end, 60)
  if r then st.register = O.REGISTERS[r]; touched() end

  if ui.instFam == "Sections" then
    local e = flow("sections", O.ENSEMBLES, function(x) return st.section == x.id end,
                   function(x) return x.name end,
                   function(x)
                     local names = {}
                     for _, part in ipairs(x.parts) do names[#names + 1] = part.name end
                     return "Harmony spread one voice to each part, a track each: " .. table.concat(names, ", ")
                   end, 88)
    if e then st.section = O.ENSEMBLES[e].id; st.cat = "Harmony"; touched() end
  else
    local list = {}
    for _, inst in ipairs(O.INSTRUMENTS) do if inst.family == ui.instFam then list[#list + 1] = inst end end
    local i = flow("inst", list, function(x) return st.section == "" and x.id == st.inst end,
                   function(x) return x.name end,
                   function(x) return ("%s–%s, happiest %s–%s"):format(
                     T.pitchName(x.low), T.pitchName(x.high), T.pitchName(x.sweet[1]), T.pitchName(x.sweet[2])) end,
                   88)
    if i then st.inst = list[i].id; st.section = ""; touched() end
  end
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
  local t = flow("type", types, function(x) return x == st.type end, C.label, nil, 72)
  if t then st.type = types[t]; touched() end

  ImGui.Dummy(ctx, 0, px(4))
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
  ImGui.Dummy(ctx, 0, px(6))
  heading(nil, "Shape It")
  dim("Transform")
  local t = flow("transform", C.TRANSFORMS, function(x) return x == st.transform end, C.label,
                 function(x) return ({
                   Original = "As it comes.",
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
                 function(x) return "×" .. x end, nil, 40)
  if r then st.repeats = C.REPEATS[r]; touched() end
  ImGui.SameLine(ctx, 0, px(24))
  dim("Velocity")
  ImGui.SameLine(ctx)
  local v = flow("velocity", C.VELOCITIES, function(x) return x == st.velocity end, nil,
                 function(x) return x == "Accents" and
                   ("Every note at 100, and the accented ones — the start of each group, the "
                    .. "downbeats — at " .. C.ACCENT .. ".")
                   or "Every note at 100." end, 80)
  if v then st.velocity = C.VELOCITIES[v]; touched() end
end

local function drawActions()
  local block = ui.block
  ImGui.Dummy(ctx, 0, px(6))
  heading(nil, block and block.name or "")

  local w = select(1, ImGui.GetContentRegionAvail(ctx))
  pianoRoll(block, math.max(px(120), w), px(110), Place.previewRunning() and ui.playhead or nil)

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

  ImGui.Dummy(ctx, 0, px(2))
  if not block then return end

  local many = #block.parts > 1
  if pick(many and "Insert on New Tracks" or "Insert at Cursor", false, 170) then
    local res = Place.insert(block)
    if res == Place.OK then say(many and ("Inserted " .. #block.parts .. " tracks at the edit cursor")
                                      or "Inserted at the edit cursor")
    elseif res == Place.NOTHING then say("There’s nothing to insert.", true)
    else say("No track is selected. Select a track and try again.", true) end
  end
  tip(many and "One new track per instrument, named for it, under the selected track"
           or "On the selected track, at the edit cursor")

  ImGui.SameLine(ctx)
  if pick("Export MIDI File", false, 130) then
    local res, path = Place.export(block)
    if res == Place.OK then say("Saved " .. tostring(path))
    elseif res == Place.NOTHING then say("There’s nothing to export.", true)
    else say("The MIDI file couldn’t be written. Check that REAPER’s resource folder can be written to.", true) end
  end
  tip("Saves a .mid file in the Midi Catalogue folder in REAPER’s resource path" ..
      (many and ", one track per instrument" or ""))

  ImGui.SameLine(ctx, 0, px(16))
  if pick(Place.previewRunning() and "Stop" or "Audition", Place.previewRunning(), 96) then
    if Place.previewRunning() then Place.previewStop()
    else Place.previewStart(block, Place.tempo()) end
  end
  tip("Plays through the virtual keyboard, so a record-armed, monitored track " ..
      "will sound it. The timing is a preview, not a performance.")

  ImGui.SameLine(ctx)
  local _
  _, ui.loop = ImGui.Checkbox(ctx, "Loop", ui.loop)

end

-- The View menu: Text Size, with the Mac's own zoom keys.
local SHORTCUT_KEY = (reaper.GetOS():find("OSX") or reaper.GetOS():find("mac")) and "Cmd" or "Ctrl"
local function menuBar()
  if not ImGui.BeginMenuBar(ctx) then return end
  if ImGui.BeginMenu(ctx, "View") then
    for i, size in ipairs(TEXT_SIZES) do
      local keys = (i == 1 and SHORTCUT_KEY .. "+0") or nil
      if ImGui.MenuItem(ctx, ("Text Size %d%%"):format(size), keys, ui.textSize == i) then
        setTextSize(i)
      end
    end
    ImGui.Separator(ctx)
    if ImGui.MenuItem(ctx, "Bigger Text", SHORTCUT_KEY .. "+=", false, ui.textSize < #TEXT_SIZES) then
      setTextSize(ui.textSize + 1)
    end
    if ImGui.MenuItem(ctx, "Smaller Text", SHORTCUT_KEY .. "+-", false, ui.textSize > 1) then
      setTextSize(ui.textSize - 1)
    end
    ImGui.EndMenu(ctx)
  end
  ImGui.EndMenuBar(ctx)
end

-- Cmd (Ctrl on Windows) with =, - or 0, as in every Mac app that zooms.
local function zoomKeys()
  if ImGui.GetKeyMods(ctx) & ImGui.Mod_Shortcut == 0 then return end
  if ImGui.IsKeyPressed(ctx, ImGui.Key_Equal) or ImGui.IsKeyPressed(ctx, ImGui.Key_KeypadAdd) then
    setTextSize(ui.textSize + 1)
  elseif ImGui.IsKeyPressed(ctx, ImGui.Key_Minus) or ImGui.IsKeyPressed(ctx, ImGui.Key_KeypadSubtract) then
    setTextSize(ui.textSize - 1)
  elseif ImGui.IsKeyPressed(ctx, ImGui.Key_0) then
    setTextSize(1)
  end
end

-- What just happened, at the top of the window where it cannot fall off
-- the bottom of the screen, and there until it is dismissed or replaced:
-- Apple asks for nothing that goes away on a timer.
local function drawMessage()
  if ui.status == "" then return end
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, ui.warn and WARN or DIM)
  ImGui.Text(ctx, ui.status)
  ImGui.PopStyleColor(ctx, 1)
  ImGui.SameLine(ctx, 0, px(16))
  if pick("Dismiss", false) then say("") end
end

local function frame()
  if ui.dirty then rebuild() end
  ui.playhead = Place.previewTick(nil, ui.loop)

  menuBar()
  zoomKeys()
  drawMessage()
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
  pushSize()
  local visible, open = ImGui.Begin(ctx, TITLE, true, ImGui.WindowFlags_MenuBar)
  if visible then
    frame()
    ImGui.End(ctx)
  end
  popSize()
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
  -- The keyboard alone: Tab and the arrow keys move between controls, Space
  -- or Return presses one, and a ring shows where you are.
  ctx = ImGui.CreateContext(TITLE, ImGui.ConfigFlags_NavEnableKeyboard)
  for i, size in ipairs(TEXT_SIZES) do
    fonts[i] = ImGui.CreateFont("sans-serif", math.floor(BASE_TEXT * size / 100 + 0.5))
    ImGui.Attach(ctx, fonts[i])
  end
  reaper.defer(loop)
end

main()
