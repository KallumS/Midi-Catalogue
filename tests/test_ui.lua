--[[ The whole script, headless.

     ReaImGui only exists inside REAPER, so a mock stands in its place and
     the real "Midi Catalogue.lua" is run against it and the mocked REAPER.
     It cannot say the window looks right. It can say that nothing raises,
     that no call reaches a ReaImGui function that does not exist, that every
     push is popped, that every button wears the dark ink, and that clicking
     every button in every state leaves the script working.

       lua5.4 tests/test_ui.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq = C.ok, C.eq
local P = dofile(HERE .. "/reaper_mock.lua")
local SCRIPT = C.SCRIPTS .. "Midi Catalogue.lua"

------------------------------------------------------------------------------
-- A ReaImGui that records
------------------------------------------------------------------------------

local g = {}
local HIG          -- the shared HIG checks, loaded below
local function resetFrame()
  g.idDepth, g.colDepth, g.colStack = 0, 0, {}
  g.buttons, g.ink, g.texts, g.checkboxes, g.headings, g.tooltips = {}, {}, {}, {}, {}, {}
  g.rects, g.bgAlpha, g.windowBg = {}, nil, nil
  g.theme, g.begun, g.varStack, g.edges, g.newLines, g.menuButtons = {}, false, {}, {}, 0, {}
  g.lineX, g.same, g.sameGap, g.overflow = 0, false, 0, nil
end
resetFrame()

local ImGui = {}
local consts = { "Col_Text", "Col_TextDisabled", "Col_WindowBg", "Col_PopupBg", "Col_Border",
  "Col_FrameBg", "Col_FrameBgHovered", "Col_FrameBgActive", "Col_TitleBg", "Col_TitleBgActive",
  "Col_TitleBgCollapsed", "Col_Button", "Col_ButtonHovered", "Col_ButtonActive", "Col_CheckMark",
  "Col_SliderGrab", "Col_SliderGrabActive", "Col_Separator", "Col_ScrollbarBg", "Col_ScrollbarGrab",
  "Col_ScrollbarGrabHovered", "Col_ScrollbarGrabActive", "Cond_FirstUseEver", "Key_Escape",
  -- The final HIG sweep (16 October 2026).
  "Col_MenuBarBg", "Col_Header", "Col_HeaderHovered", "Col_HeaderActive", "Col_ResizeGrip",
  "Col_ResizeGripHovered", "Col_ResizeGripActive", "StyleVar_FrameBorderSize" }
for i, k in ipairs(consts) do ImGui[k] = i end
-- Flags are bits, as in ReaImGui.
ImGui.PopupFlags_AnyPopupId, ImGui.PopupFlags_AnyPopupLevel = 128, 256

local function effective(idx)
  for i = #g.colStack, 1, -1 do if g.colStack[i].idx == idx then return g.colStack[i].col end end
end

function ImGui.CreateContext(name) return { name = name } end
function ImGui.SetNextWindowSize() end
function ImGui.SetNextWindowBgAlpha(_, a)
  if type(a) ~= "number" or a < 0 or a > 1 then error("window alpha " .. tostring(a)) end
  g.bgAlpha = a
end
function ImGui.Begin(_, name) g.title = name; g.begun = true; g.windowBg = effective(ImGui.Col_WindowBg); return not g.collapsed, true end
-- SetNextWindowSizeConstraints(ctx, size_min_w, size_min_h, size_max_w, size_max_h)
function ImGui.SetNextWindowSizeConstraints(_, a, b, c, d)
  for _, v in ipairs({ a, b, c, d }) do if type(v) ~= "number" then error("size constraint " .. tostring(v)) end end
  g.minSize = { a, b }
end
function ImGui.NewLine() g.newLines = g.newLines + 1; g.same = false end
-- Where the keyboard is, as the script asks at the end of a frame.
function ImGui.IsAnyItemFocused() return g.focused == true end
function ImGui.IsAnyItemActive() return g.active == true end
function ImGui.IsPopupOpen(_, id, flags)
  if type(id) ~= "string" or (flags ~= nil and math.type(flags) ~= "integer") then error("IsPopupOpen(ctx, str_id, flags)") end
  return g.popup == true
end
-- A stack of style variables, so a widget can be asked what it was drawn with.
function ImGui.PushStyleVar(_, idx, a, b) g.varStack[#g.varStack + 1] = { idx = idx, a = a, b = b } end
function ImGui.PopStyleVar(_, n) for _ = 1, (n or 1) do g.varStack[#g.varStack] = nil end end
local function effectiveVar(idx)
  for i = #g.varStack, 1, -1 do if g.varStack[i].idx == idx then return g.varStack[i].a end end
end
function ImGui.End() end
function ImGui.IsKeyPressed() return false end
-- Where each item would sit, to catch a row that runs off the window's edge:
-- the window is g.avail wide (1000 unless a test narrows it), and what is
-- left of a line after SameLine shrinks, as in ImGui. Wrapped text and
-- headings take what is left; anything else must fit in it.
local function avail() return g.avail or 1000 end
local function lineStart() return g.same and (g.lineX + g.sameGap) or 0 end
local function layout(label, w, wraps)
  local x = lineStart()
  g.same = false
  if wraps then w = math.min(w, avail() - x) end
  g.lineX = x + w
  if x + w > avail() + 0.5 or (wraps and x > avail() - 1) then g.overflow = g.overflow or label end
end
local function measure(s) return (ImGui.CalcTextSize(nil, s)) end
function ImGui.SeparatorText(_, s)
  if type(s) ~= "string" then error("SeparatorText got a " .. type(s)) end
  layout(s, measure(s), true)
  g.headings[#g.headings + 1] = s
end
function ImGui.Text(_, s)
  if type(s) ~= "string" then error("Text got a " .. type(s)) end
  layout(s, measure(s))
  g.texts[#g.texts + 1] = s
end
function ImGui.TextWrapped(_, s)
  if type(s) ~= "string" then error("TextWrapped got a " .. type(s)) end
  layout(s, measure(s), true)
  g.texts[#g.texts + 1] = s
end
function ImGui.SameLine(_, _, spacing)
  g.same = true
  g.sameGap = (spacing and spacing >= 0) and spacing or (HIG.spacing or 8)
end
function ImGui.Dummy(_, w) layout("a gap", w or 0) end
function ImGui.PushID(_, v)
  if v == nil then error("PushID with nil") end
  g.idDepth = g.idDepth + 1
end
function ImGui.PopID()
  g.idDepth = g.idDepth - 1
  if g.idDepth < 0 then error("PopID without a push") end
end
function ImGui.PushStyleColor(_, idx, col)
  if type(idx) ~= "number" then error("PushStyleColor with a " .. type(idx) .. " index") end
  if type(col) ~= "number" or col % 256 == 0 then error("style colour must be an opaque 0xRRGGBBAA") end
  g.colStack[#g.colStack + 1] = { idx = idx, col = col }
  g.colDepth = g.colDepth + 1
  -- The theme: what is pushed before the window begins.
  if not g.begun then g.theme[idx] = col end
end
function ImGui.PopStyleColor(_, n)
  for _ = 1, (n or 1) do g.colStack[#g.colStack] = nil end
  g.colDepth = g.colDepth - (n or 1)
  if g.colDepth < 0 then error("PopStyleColor without a push") end
end
function ImGui.Button(_, label, w, h)
  if type(label) ~= "string" then error("Button label is a " .. type(label)) end
  if w ~= nil and type(w) ~= "number" then error("Button width is a " .. type(w)) end
  layout(label, (w and w > 0) and w or (measure((label:gsub("##.*$", ""))) + 16))
  g.buttons[#g.buttons + 1] = label
  if HIG and HIG.inMenuBar then g.menuButtons[#g.menuButtons + 1] = label end
  -- Recorded per button: a scheme can ink the chosen button alone and leave
  -- every other one unreadable, and a frame-wide tally cannot see that.
  g.ink[#g.buttons] = { bg = effective(ImGui.Col_Button), text = effective(ImGui.Col_Text) }
  if g.clickTarget == #g.buttons then g.clicked = label; return true end
  return false
end
function ImGui.Checkbox(_, label, v)
  local size = HIG.font and HIG.font.size or 13
  layout(label, size + 2 * (HIG.framePad or 0) + (HIG.spacing or 8) * 2 / 3 + measure(label))
  g.checkboxes[#g.checkboxes + 1] = label
  g.edges[label] = { size = effectiveVar(ImGui.StyleVar_FrameBorderSize) or 0, col = effective(ImGui.Col_Border) }
  if g.toggle then return true, not v end
  return false, v
end
function ImGui.IsItemHovered() return true end
function ImGui.SetTooltip(_, s)
  if type(s) ~= "string" then error("tooltip is a " .. type(s)) end
  g.tooltips[#g.tooltips + 1] = s
end
-- ReaImGui's CalcTextSize(ctx, text) returns width and height. The mock's
-- font is a fixed seven pixels a character.
function ImGui.CalcTextSize(_, s)
  if type(s) ~= "string" then error("CalcTextSize got a " .. type(s)) end
  return #s * 7, 13
end
function ImGui.GetContentRegionAvail() return avail() - lineStart(), 400 end
function ImGui.GetWindowDrawList() return {} end
function ImGui.GetCursorScreenPos() return 0, 0 end
function ImGui.InvisibleButton(_, id, w) layout(id, w); return false end
function ImGui.DrawList_AddRectFilled(_, x1, y1, x2, y2, col)
  for _, v in ipairs({ x1, y1, x2, y2, col }) do
    if type(v) ~= "number" or v ~= v then error("rect argument is " .. tostring(v)) end
  end
  if x2 < x1 or y2 < y1 then error("rect is inside out") end
  g.rects[#g.rects + 1] = col
end
function ImGui.DrawList_AddLine(_, x1, y1, x2, y2, col)
  for _, v in ipairs({ x1, y1, x2, y2, col }) do
    if type(v) ~= "number" or v ~= v then error("line argument is " .. tostring(v)) end
  end
end
HIG = dofile(HERE .. "/hig_mock.lua")(ImGui)
setmetatable(ImGui, { __index = function(_, k)
  error("the script called ImGui." .. tostring(k) .. ", which the mock does not have")
end })

------------------------------------------------------------------------------
-- REAPER, and running the script
------------------------------------------------------------------------------

local tmp = os.tmpname()
os.remove(tmp)
os.execute('mkdir -p "' .. tmp .. '"')
local shim = assert(io.open(tmp .. "/imgui.lua", "w"))
shim:write("return function(version) return _G.__MOCK_IMGUI end\n")
shim:close()
_G.__MOCK_IMGUI = ImGui

P.install()
P.resource = tmp .. "/resource"
local deferred, atexitFn
local function absolute(path)
  if path:match("^/") then return path end
  return (os.getenv("PWD") or ".") .. "/" .. path
end
reaper.ImGui_GetBuiltinPath = function() return tmp end
reaper.MB = function(msg) error("the script gave up: " .. tostring(msg)) end
reaper.get_action_context = function() return true, absolute(SCRIPT), 0, 1, 0, 0, 0 end
reaper.defer = function(f) deferred = f end
reaper.atexit = function(f) atexitFn = f end
reaper.set_action_options = function() end
reaper.SetToggleCommandState = function() end
reaper.RefreshToolbar2 = function() end

local function start()
  deferred, atexitFn = nil, nil
  dofile(SCRIPT)
end

-- One frame, optionally clicking the n-th button drawn in it.
local function frame(click, toggle)
  resetFrame()
  g.clickTarget, g.clicked, g.toggle = click, nil, toggle
  local f = deferred
  deferred = nil
  if not f then error("the script stopped deferring") end
  f()
  if g.idDepth ~= 0 then error("PushID left unbalanced: " .. g.idDepth) end
  if g.colDepth ~= 0 then error("PushStyleColor left unbalanced: " .. g.colDepth) end
  return g.clicked
end

local function has(list, text)
  for _, t in ipairs(list) do if t:find(text, 1, true) then return true end end
  return false
end
local function buttonIndex(label, nth)
  local seen = 0
  for i, b in ipairs(g.buttons) do
    if b == label then
      seen = seen + 1
      if seen == (nth or 1) then return i end
    end
  end
end
local function click(label, nth)
  frame()
  local i = buttonIndex(label, nth)
  if not i then error("no button called " .. label) end
  frame(i)
  frame()
end
local function count(label)
  local n = 0
  for _, b in ipairs(g.buttons) do if b == label then n = n + 1 end end
  return n
end

-- Instruments are shown a family at a time, so choosing one is two clicks.
local O = dofile(C.SCRIPTS .. "mc_orchestra.lua")
local function instrument(name)
  for _, inst in ipairs(O.INSTRUMENTS) do
    if inst.name == name then click((inst.family:gsub(" & ", " and "))); click(name); return end
  end
  for _, e in ipairs(O.ENSEMBLES) do
    -- "Strings" is a family and a section; the section is the later button.
    if e.name == name then click("Sections"); frame(); click(name, count(name)); return end
  end
  error("no instrument called " .. name)
end

local function fresh()
  P.reset()
  P.ext = {}
  local tr = P.track("Track 1")
  P.selTracks = { tr }
  start()
  frame()
  return tr
end

------------------------------------------------------------------------------
-- It starts, and draws
------------------------------------------------------------------------------

local tr = fresh()
ok(#g.buttons > 50, "the first frame draws its buttons")
ok(#g.rects > 1, "and the roll, with notes in it")
eq(g.bgAlpha, 1.0, "the window is solid")
eq(g.windowBg, 0x23272EFF, "on the house ground")
for _, step in ipairs({ "Scale", "Chords", "Instrument", "Catalogue", "Shape It" }) do
  ok(has(g.headings, step), "the " .. step .. " step is on screen")
end
ok(has(g.texts, "C  D  E  F  G  A  B"), "the scale's notes are spelled out under it")
for _, chip in ipairs({ "I", "V", "vi", "IV" }) do
  eq(count(chip), 1, "the chain starts as I-V-vi-IV: " .. chip)
end

-- Every button wears the dark ink, chosen or not.
local function allInked(what)
  local bad
  for i, ink in ipairs(g.ink) do
    if ink.text ~= 0x14171CFF then bad = g.buttons[i]; break end
  end
  ok(not bad, what .. ": every button has dark ink (" .. tostring(bad) .. " does not)")
end
allInked("the first frame")

------------------------------------------------------------------------------
-- The sweep: every button, in every category, clicked
------------------------------------------------------------------------------

local function sweep(label)
  frame()
  local n = #g.buttons
  local i = 1
  local failures = 0
  while i <= n do
    frame()
    if i > #g.buttons then break end
    local name = g.buttons[i]
    local good, err = pcall(frame, i)
    if not good then
      failures = failures + 1
      ok(false, label .. ": clicking \"" .. tostring(name) .. "\" raised: " .. tostring(err))
    else
      local g2, e2 = pcall(frame)
      if not g2 then
        failures = failures + 1
        ok(false, label .. ": the frame after \"" .. tostring(name) .. "\" raised: " .. tostring(e2))
      end
    end
    if failures > 5 then break end
    i = i + 1
  end
  ok(failures == 0, label .. ": the sweep clicked every button without raising")
end

for _, cat in ipairs({ "Rhythm", "Melody", "Harmony" }) do
  fresh()
  click(cat)
  sweep("the " .. cat .. " category")
end

-- Every type in every category, on every instrument family, draws.
fresh()
local Ccat = dofile(C.SCRIPTS .. "mc_catalogue.lua")
local typeFailures = {}
for _, cat in ipairs(Ccat.CATEGORIES) do
  for _, inst in ipairs({ "Piano", "Violin I", "Tuba", "Timpani", "Flute", "Harp" }) do
    instrument(inst)
    click(cat.name)
    for _, ty in ipairs(cat.types) do
      local good, err = pcall(click, Ccat.label(ty))
      if not good then typeFailures[#typeFailures + 1] = inst .. "/" .. ty .. ": " .. tostring(err) end
      allInked(inst .. " " .. ty)
    end
  end
end
ok(#typeFailures == 0, "every type draws on every family: " .. table.concat(typeFailures, "; "))

------------------------------------------------------------------------------
-- Things the sweep cannot see
------------------------------------------------------------------------------

-- The timpani do not play melodies, and the window says so instead of
-- showing an empty grid.
fresh()
instrument("Timpani")
click("Melody")
ok(has(g.texts, "Timpani are tuned before they play"), "the timpani explain why there are no melodies")

-- A section hides the categories it does not play.
fresh()
instrument("Strings")
eq(count("Rhythm"), 0, "a section offers no rhythm category")
eq(count("Melody"), 0, "or melody")
eq(count("Harmony"), 1, "only harmony")
ok(has(g.texts, "Violin I, Violin II, Viola, Cello, Double Bass"), "the block lists its five parts")
ok(count("Insert on New Tracks") == 1, "and inserts on new tracks")
click("Insert on New Tracks")
eq(#P.tracks, 6, "which it does: five new tracks under the selected one")
eq(P.tracks[2].name, "Violin I", "named for their instruments, first violins first")
eq(P.tracks[6].name, "Double Bass", "double basses last")
ok(has(g.texts, "Inserted 5 tracks"), "and says so")

-- Choosing an instrument again brings the other categories back.
instrument("Cello")
eq(count("Rhythm"), 1, "an instrument brings rhythm back")

-- Insert puts one item on the selected track.
fresh()
click("Insert at Cursor")
eq(#P.tracks[1].items, 1, "Insert at cursor makes one item")
local notes = P.tracks[1].items[1].take.notes
ok(#notes > 0, "with notes in it")
local allHundred = true
for _, n in ipairs(notes) do if n.vel ~= 100 then allHundred = false end end
ok(allHundred, "every one at velocity 100")

-- Accents are the only thing that moves a velocity off 100.
click("Accents")
click("Insert at Cursor")
local sawAccent = false
for _, n in ipairs(P.tracks[1].items[2].take.notes) do
  ok(n.vel == 100 or n.vel == 115, "an accented block is 100 and 115 only")
  if n.vel == 115 then sawAccent = true end
end
ok(sawAccent, "and does accent something")

-- Export writes a file.
click("Export MIDI File")
ok(has(g.texts, "Saved "), "Export MIDI File writes a file")

-- Audition sends notes and stops them.
click("Audition")
ok(count("Stop") == 1, "Audition turns into Stop")
P.now = P.now + 100
frame()
ok(#P.stuffed > 0, "notes went to the virtual keyboard")
local ons, offs = 0, 0
for _, m in ipairs(P.stuffed) do
  if m.a == 0x90 then ons = ons + 1 elseif m.a == 0x80 then offs = offs + 1 end
end
ok(ons > 0 and offs >= 1, "on and off")

------------------------------------------------------------------------------
-- The instruments take two rows, not one per family
------------------------------------------------------------------------------

fresh()
for _, fam in ipairs({ "Strings", "Woodwind", "Brass", "Percussion", "Keys and Harp", "Sections" }) do
  eq(count(fam), 1, "a button for the " .. fam .. " family")
end
eq(count("Piano"), 1, "the chosen instrument's family is showing")
eq(count("Violin I"), 0, "and no other family's instruments")
click("Brass")
eq(count("Tuba"), 1, "a family shows its instruments")
eq(count("Piano"), 0, "and only those")
ok(has(g.headings, "Piano"), "looking at another family does not change the instrument")
click("Tuba")
ok(has(g.headings, "Tuba"), "clicking one does")

------------------------------------------------------------------------------
-- The chain of chords
------------------------------------------------------------------------------

fresh()
eq(count("Done"), 0, "the chord editor starts closed")
eq(count("Sus & Add"), 0, "so no chord families on screen")
click("V")
eq(count("Done"), 1, "clicking a chord opens the editor")
ok(has(g.texts, "Chord 2:  G — G B D"), "on that chord, spelled")
click("6ths & 7ths")
click("7")
ok(has(g.headings, "I-V7-vi-IV"), "choosing 7 makes it V7, in the block's name")
click("ii")
ok(has(g.headings, "I-II7-vi-IV"), "moving it to the second degree makes it II7 - a D7, borrowed")
ok(has(g.texts, "D F# A C"), "with its F#")
click("Done")
eq(count("Done"), 0, "Done closes the editor")

-- Add and remove.
-- The open editor shows the degrees by the same numerals as the chain, so
-- the chain is read from the block's name.
click("+")
ok(has(g.headings, "I-II7-vi-IV-IV "), "+ adds a copy of the last chord")
eq(count("Done"), 1, "and opens it")
click("−")
ok(has(g.headings, "I-II7-vi-IV "), "- takes it away again")
-- Chords can be added up to eight.
for _ = 1, 10 do frame(); if buttonIndex("+") then click("+") end end
eq(count("+"), 0, "no + past eight chords")
-- And taken away down to one.
for _ = 1, 10 do frame(); if buttonIndex("−") then click("−") end end
eq(count("-"), 0, "no - for the last chord")
ok(count("I") >= 1, "one chord left")
frame()
ok(#g.rects > 1, "and the catalogue still has something to show")

-- A progression replaces the chain.
fresh()
click("I")
click("ii-V-I-I")
ok(has(g.headings, "C Major ii-V-I-I "), "ii-V-I-I replaces the chain")
eq(count("Done"), 0, "and the editor closes")

-- The chain is saved.
fresh()
click("IV")
click("6ths & 7ths")
click("maj7")
atexitFn()
ok(P.ext["MidiCatalogue:state"]:find("chain=0:d:Triad,4:d:Triad,5:d:Triad,3:c:maj7", 1, true),
   "the chain is saved by name")

-- Every chord family on every chord draws, and the catalogue under it.
fresh()
click("V")
local Th = dofile(C.SCRIPTS .. "mc_theory.lua")
local famFailures = {}
for _, fam in ipairs(Th.FAMILIES) do
  click(fam)
  local labels = {}
  if fam == "Diatonic" then for _, d in ipairs(Th.DIATONIC) do labels[#labels + 1] = d.name end
  else for _, ch in ipairs(Th.CHORDS) do if Th.FAMILIES[ch.fam] == fam then labels[#labels + 1] = ch.sym end end end
  for _, l in ipairs(labels) do
    local good, err = pcall(click, l)
    if not good then famFailures[#famFailures + 1] = fam .. "/" .. l .. ": " .. tostring(err) end
  end
end
ok(#famFailures == 0, "every chord can be chosen: " .. table.concat(famFailures, "; "))

------------------------------------------------------------------------------
-- Settings survive, and bad ones are put right
------------------------------------------------------------------------------

fresh()
click("D")
click("Dorian")
instrument("Cello")
click("Melody")
click("Arch")
atexitFn()
local saved = P.ext["MidiCatalogue:state"]
ok(saved and saved:find("inst=vc", 1, true), "the instrument is saved by id")
start()
frame()
ok(has(g.headings, "D Dorian"), "a reload comes back in D Dorian: " .. tostring(g.headings[#g.headings]))
ok(has(g.headings, "Cello Arch"), "on the cello's arches")

-- Settings from nowhere in particular are clamped rather than trusted.
P.ext["MidiCatalogue:state"] = "root=99;scale=-3;chain=9:x:nonsense,,;bars=5;inst=kazoo;section=choir;" ..
  "register=Sideways;cat=Poetry;type=Limerick;transform=Upside;repeats=7;velocity=Loud;density=Thick"
start()
local good, err = pcall(frame)
ok(good, "a nonsense saved state still draws: " .. tostring(err))
ok(#g.buttons > 50, "and draws everything")

------------------------------------------------------------------------------
-- Apple's HIG Foundations, the final sweep (16 October 2026, decision 0012)
------------------------------------------------------------------------------

local function rgb(col)
  return math.floor(col / 16777216) % 256, math.floor(col / 65536) % 256, math.floor(col / 256) % 256
end
local function lum(col) return HIG.contrast(col, 0x000000FF) end   -- lighter is larger
local GROUND = 0x23272EFF

fresh()
local th = g.theme
ok(lum(th[ImGui.Col_PopupBg]) > lum(th[ImGui.Col_WindowBg]),
   "Dark Mode: menus and tooltips are lighter than the window they sit in front of")
ok(th[ImGui.Col_Border] ~= th[ImGui.Col_PopupBg] and lum(th[ImGui.Col_Border]) > lum(th[ImGui.Col_PopupBg]),
   "with an edge lighter still")
for _, name in ipairs({ "Col_PopupBg", "Col_MenuBarBg", "Col_HeaderHovered", "Col_HeaderActive", "Col_Header" }) do
  local c = HIG.contrast(th[ImGui.Col_Text], th[ImGui.Col_Text] and th[ImGui[name]] or 0)
  ok(th[ImGui[name]] and c >= 7, ("words are 7:1 on %s too (%.2f)"):format(name, c))
end
local keysOnMenu = HIG.contrast(th[ImGui.Col_TextDisabled], th[ImGui.Col_PopupBg])
ok(keysOnMenu >= 7, ("a menu item's keys (Cmd+=) are 7:1 on the menu (%.2f)"):format(keysOnMenu))
for _, name in ipairs({ "Col_ScrollbarGrab", "Col_ResizeGrip" }) do
  local c = math.min(HIG.contrast(th[ImGui[name]], GROUND),
                     HIG.contrast(th[ImGui[name]], th[ImGui.Col_ScrollbarBg]))
  ok(c >= 3, ("%s can be seen: 3:1 on what it sits on (%.2f)"):format(name, c))
end
local flat
for idx, col in pairs(th) do
  local r, gg, b = rgb(col)
  if col ~= 0xFFF200FF and not (r < gg and gg < b) then flat = flat or idx end
end
ok(not flat, "every grey in the theme is still blue-shifted, R < G < B: " .. tostring(flat))

-- The Loop tick box has an edge that can be seen.
local edge = g.edges["Loop"]
ok(edge and edge.size >= 1 and HIG.contrast(edge.col, GROUND) >= 3,
   ("the Loop tick box has an edge 3:1 on the ground (%s)"):format(edge and ("%.2f"):format(HIG.contrast(edge.col, GROUND)) or "none"))

-- Esc lets go of what has it before it closes the window.
local function esc()
  HIG.keys = { [ImGui.Key_Escape] = true }
  frame()
  HIG.keys = {}
  return deferred ~= nil
end
fresh()
ok(not esc(), "Esc with nothing else to let go of closes the window")
for _, what in ipairs({ "focused", "active", "popup" }) do
  fresh()
  g[what] = true
  frame()
  g[what] = false
  ok(esc(), "Esc lets go of " .. ({ focused = "the control the keyboard is on", active = "a field being typed in",
                                   popup = "an open menu" })[what] .. ", and the window stays")
  ok(not esc(), "the next Esc closes it")
end
fresh()
click("V")
eq(count("Done"), 1, "the chord editor is open")
ok(esc(), "Esc closes the chord editor first")
frame()
eq(count("Done"), 0, "which it does")
ok(not esc(), "and then the window")

-- Anything playing has a Stop that cannot scroll away: in the menu bar.
fresh()
eq(#g.menuButtons, 0, "nothing playing: no Stop in the menu bar")
click("Audition")
ok(has(g.menuButtons, "Stop"), "playing: a Stop in the menu bar")
click("Stop##menu")
eq(count("Audition"), 1, "which stops it")
eq(#g.menuButtons, 0, "and goes away")

-- Replacing or removing chords can be undone.
fresh()
click("I")
click("ii-V-I-I")
ok(has(g.headings, "ii-V-I-I "), "Start again from replaces the chords")
ok(has(g.texts, "Replaced the chords with ii-V-I-I"), "and says so")
eq(count("Undo"), 1, "with an Undo beside it")
if count("Undo") == 1 then click("Undo") end
ok(has(g.headings, "I-V-vi-IV "), "Undo puts them back")
eq(count("Undo"), 0, "and goes")
click("−")
ok(has(g.texts, "Removed chord 4, F"), "removing a chord says which")
eq(count("Undo"), 1, "with an Undo beside it")
if count("Undo") == 1 then click("Undo") end
ok(has(g.headings, "I-V-vi-IV "), "and Undo puts it back")
click("−")
click("I")
click("ii")
eq(count("Undo"), 0, "another change to the chords takes the Undo away, so it cannot undo that too")

-- Tooltips are broken into lines a reader can follow.
local longest, which = 0, nil
local function tips()
  frame()
  for _, t in ipairs(g.tooltips) do
    for line in (t .. "\n"):gmatch("(.-)\n") do
      local n = utf8.len(line) or #line
      if n > longest then longest, which = n, line end
    end
  end
end
fresh(); tips()
click("V"); tips()
instrument("Strings"); tips()
instrument("Tuba"); click("Melody"); tips()
ok(longest > 0 and longest <= 64, ("no tooltip line is longer than 64 characters (%d: %s)"):format(longest, tostring(which)))

-- What was left out, and why, is on the screen, not only in a tooltip.
local sawLeftOut = false
for _, inst in ipairs({ "Tuba", "Piano", "Flute", "Timpani" }) do
  for _, cat in ipairs({ "Rhythm", "Melody" }) do
    fresh(); instrument(inst); click(cat)
    for _, t in ipairs(g.texts) do
      if t:find(" left out", 1, true) then
        sawLeftOut = true
        ok(has(g.texts, "Left out: "), inst .. " " .. cat .. ": the reasons are written out")
      end
    end
  end
end
ok(sawLeftOut, "something was left out somewhere, so the check above ran")

-- The title names the idea, for a screen reader, and stays one window.
fresh()
frame()
ok(g.title and g.title:find("^Midi Catalogue — C Major I%-V%-vi%-IV") and g.title:find("###Midi Catalogue$"),
   "the title names the idea: " .. tostring(g.title))

-- Nothing runs off the window's edge, at 100% or 200%, in any state.
local function noOverflow(what)
  frame()
  ok(not g.overflow, what .. ": nothing runs off the window's edge: " .. tostring(g.overflow))
end
for _, size in ipairs({ "Text Size 100%", "Text Size 200%" }) do
  fresh()
  HIG.menuFrame({ frame = function() frame() end }, size)
  noOverflow(size .. ", fresh")
  click("V"); noOverflow(size .. ", the chord editor open")
  click("Sus & Add"); noOverflow(size .. ", sus and add chords")
  click("−"); noOverflow(size .. ", a message with Undo")
  instrument("Strings"); noOverflow(size .. ", a section")
  instrument("Tuba"); click("Melody"); noOverflow(size .. ", the tuba's melodies")
  click("Harmony"); noOverflow(size .. ", harmony")
  click("Audition"); noOverflow(size .. ", playing")
  click("Export MIDI File"); noOverflow(size .. ", a saved file's long path")
  P.selTracks = {}
  click("Insert at Cursor"); noOverflow(size .. ", a warning")
  -- The smallest window, 400 wide, less ImGui's padding either side.
  g.avail = 384 * (size:find("200") and 2 or 1)
  noOverflow(size .. ", the window at its smallest")
  g.avail = nil
  atexitFn()
end
P.ext["MidiCatalogue:view"] = nil

-- Rows wrap at the window's edge instead of running off it, and the window
-- cannot be made smaller than its rows.
fresh()
eq(g.newLines, 0, "with room, the fixed rows stay on one line")
g.avail = 40
frame()
ok(g.newLines >= 6, "narrow, they wrap: " .. g.newLines)
g.avail = nil
ok(g.minSize and g.minSize[1] >= 300 and g.minSize[2] >= 200, "the window has a smallest size")

------------------------------------------------------------------------------
-- Apple's Human Interface Guidelines (decision 0012)
------------------------------------------------------------------------------

HIG.check({
  ok = ok, eq = eq, frame = function() frame() end,
  loaded = function() fresh(); frame() end,
  warned = function()
    fresh()
    P.selTracks = {}
    click(count("Insert on New Tracks") > 0 and "Insert on New Tracks" or "Insert at Cursor")
    return "No track is selected."
  end,
  dismiss = function() click("Dismiss") end,
  quit = function() atexitFn() end,
  restart = function() start(); frame() end,
  saved = function() return P.ext["MidiCatalogue:view"] end,
  setSaved = function(v) P.ext["MidiCatalogue:view"] = v end,
  sizeKey = "textSize",
})

C.done()
