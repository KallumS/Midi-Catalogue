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
local function resetFrame()
  g.idDepth, g.colDepth, g.colStack = 0, 0, {}
  g.buttons, g.ink, g.texts, g.checkboxes, g.headings, g.tooltips = {}, {}, {}, {}, {}, {}
  g.rects, g.bgAlpha, g.windowBg = {}, nil, nil
end
resetFrame()

local ImGui = {}
local consts = { "Col_Text", "Col_TextDisabled", "Col_WindowBg", "Col_PopupBg", "Col_Border",
  "Col_FrameBg", "Col_FrameBgHovered", "Col_FrameBgActive", "Col_TitleBg", "Col_TitleBgActive",
  "Col_TitleBgCollapsed", "Col_Button", "Col_ButtonHovered", "Col_ButtonActive", "Col_CheckMark",
  "Col_SliderGrab", "Col_SliderGrabActive", "Col_Separator", "Col_ScrollbarBg", "Col_ScrollbarGrab",
  "Col_ScrollbarGrabHovered", "Col_ScrollbarGrabActive", "Cond_FirstUseEver", "Key_Escape" }
for i, k in ipairs(consts) do ImGui[k] = i end

local function effective(idx)
  for i = #g.colStack, 1, -1 do if g.colStack[i].idx == idx then return g.colStack[i].col end end
end

function ImGui.CreateContext(name) return { name = name } end
function ImGui.SetNextWindowSize() end
function ImGui.SetNextWindowBgAlpha(_, a)
  if type(a) ~= "number" or a < 0 or a > 1 then error("window alpha " .. tostring(a)) end
  g.bgAlpha = a
end
function ImGui.Begin() g.windowBg = effective(ImGui.Col_WindowBg); return not g.collapsed, true end
function ImGui.End() end
function ImGui.IsKeyPressed() return false end
function ImGui.SeparatorText(_, s)
  if type(s) ~= "string" then error("SeparatorText got a " .. type(s)) end
  g.headings[#g.headings + 1] = s
end
function ImGui.Text(_, s)
  if type(s) ~= "string" then error("Text got a " .. type(s)) end
  g.texts[#g.texts + 1] = s
end
function ImGui.SameLine() end
function ImGui.Dummy() end
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
end
function ImGui.PopStyleColor(_, n)
  for _ = 1, (n or 1) do g.colStack[#g.colStack] = nil end
  g.colDepth = g.colDepth - (n or 1)
  if g.colDepth < 0 then error("PopStyleColor without a push") end
end
function ImGui.Button(_, label, w, h)
  if type(label) ~= "string" then error("Button label is a " .. type(label)) end
  if w ~= nil and type(w) ~= "number" then error("Button width is a " .. type(w)) end
  g.buttons[#g.buttons + 1] = label
  -- Recorded per button: a scheme can ink the chosen button alone and leave
  -- every other one unreadable, and a frame-wide tally cannot see that.
  g.ink[#g.buttons] = { bg = effective(ImGui.Col_Button), text = effective(ImGui.Col_Text) }
  if g.clickTarget == #g.buttons then g.clicked = label; return true end
  return false
end
function ImGui.Checkbox(_, label, v)
  g.checkboxes[#g.checkboxes + 1] = label
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
function ImGui.GetContentRegionAvail() return 1000, 400 end
function ImGui.GetWindowDrawList() return {} end
function ImGui.GetCursorScreenPos() return 0, 0 end
function ImGui.InvisibleButton() return false end
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
for _, step in ipairs({ "Scale", "Chords underneath", "Instrument", "Catalogue", "Shape it" }) do
  ok(has(g.headings, step), "the " .. step .. " step is on screen")
end
ok(has(g.texts, "C  D  E  F  G  A  B"), "the scale's notes are spelled out under it")
ok(count("I-V-vi-IV") == 1, "the progressions are named in this scale's numerals")

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
    click(inst)
    click(cat.name)
    for _, ty in ipairs(cat.types) do
      local good, err = pcall(click, ty)
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
click("Timpani")
click("Melody")
ok(has(g.texts, "Timpani are tuned before they play"), "the timpani explain why there are no melodies")

-- A section hides the categories it does not play.
fresh()
click("Strings")
eq(count("Rhythm"), 0, "a section offers no rhythm category")
eq(count("Melody"), 0, "or melody")
eq(count("Harmony"), 1, "only harmony")
ok(has(g.texts, "Violin I, Violin II, Viola, Cello, Double Bass"), "the block lists its five parts")
ok(count("Insert on new tracks") == 1, "and inserts on new tracks")
click("Insert on new tracks")
eq(#P.tracks, 6, "which it does: five new tracks under the selected one")
eq(P.tracks[2].name, "Violin I", "named for their instruments, first violins first")
eq(P.tracks[6].name, "Double Bass", "double basses last")
ok(has(g.texts, "Inserted 5 tracks"), "and says so")

-- Choosing an instrument again brings the other categories back.
click("Cello")
eq(count("Rhythm"), 1, "an instrument brings rhythm back")

-- Insert puts one item on the selected track.
fresh()
click("Insert at cursor")
eq(#P.tracks[1].items, 1, "Insert at cursor makes one item")
local notes = P.tracks[1].items[1].take.notes
ok(#notes > 0, "with notes in it")
local allHundred = true
for _, n in ipairs(notes) do if n.vel ~= 100 then allHundred = false end end
ok(allHundred, "every one at velocity 100")

-- Accents are the only thing that moves a velocity off 100.
click("Accents")
click("Insert at cursor")
local sawAccent = false
for _, n in ipairs(P.tracks[1].items[2].take.notes) do
  ok(n.vel == 100 or n.vel == 115, "an accented block is 100 and 115 only")
  if n.vel == 115 then sawAccent = true end
end
ok(sawAccent, "and does accent something")

-- Export writes a file.
click("Export .mid")
ok(has(g.texts, "Wrote "), "Export .mid writes a file")

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
-- Settings survive, and bad ones are put right
------------------------------------------------------------------------------

fresh()
click("D")
click("Dorian")
click("Cello")
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
P.ext["MidiCatalogue:state"] = "root=99;scale=-3;prog=nonsense;bars=5;inst=kazoo;section=choir;" ..
  "register=Sideways;cat=Poetry;type=Limerick;transform=Upside;repeats=7;velocity=Loud;density=Thick"
start()
local good, err = pcall(frame)
ok(good, "a nonsense saved state still draws: " .. tostring(err))
ok(#g.buttons > 50, "and draws everything")

C.done()
