/* Midi Catalogue - built by ableton/kit/build.py from ableton/tool.json. Do not edit; edit the sources and rebuild. */
var DEVICE = {"generator": "midi-catalogue", "instrument": true, "result": "Entry", "title": "Midi Catalogue", "tool": "generate"};
DEVICE.files = {"adapters/common.lua": "--[[ Noterator - what every generator adapter shares.\n\n     The engines in the folders beside this one are the family's own, copied\n     unchanged from their repositories. An adapter is the only thing written\n     for Noterator: it turns one engine's settings into lists the app can show\n     and its output into parts the app can drop into a score. The app speaks\n     to every adapter the same way:\n\n       A.id, A.name, A.description\n       A.input                 \"none\", or \"selection\" when it works on music\n                               the user has selected\n       A.panel                 \"generate\", \"toolbox\", or nil: not shown\n       A.newState()            a fresh table of settings\n       A.settings(st, ctx)     the settings to show now, each\n                               { id, label, names = {...}, index, hint, hints = {...}, group }\n       A.set(st, id, index)    choose the index-th value of a setting\n       A.useKey(st, root, scale)   follow the score's key (1-based ScaleView indices)\n       A.generate(st, ctx, seed, count)\n                               { results = { { title, detail, beats, parts = {\n                                   { name, drums, instrument, notes = { {start, len, pitch, vel} } } } } },\n                                 message }\n\n     Times are quarter notes from the start of the result. `ctx` is\n       { root, scale, num, den, barBeats, bpm, inst, catalogueId, bars,\n         selection = { notes, beats, drums } } ]]\n\nlocal C = {}\n\nfunction C.indexOf(list, v)\n  for i, x in ipairs(list) do if x == v then return i end end\n  return nil\nend\n\n-- A setting: `values` are what the engine stores, `names` what the window\n-- shows. `when(st)` hides it when it does nothing (no dead controls).\nfunction C.setting(id, label, values, names, opts)\n  opts = opts or {}\n  local shown = {}\n  for i, v in ipairs(values) do shown[i] = names and names[i] or tostring(v) end\n  return { id = id, label = label, values = values, names = shown, hint = opts.hint,\n           hints = opts.hints, when = opts.when, group = opts.group, dynamic = opts.dynamic }\nend\n\nfunction C.onOff(id, label, opts)\n  return C.setting(id, label, { true, false }, { \"On\", \"Off\" }, opts)\nend\n\n-- What the window draws: the settings that apply to this state.\nfunction C.describe(list, st, ctx)\n  local out = {}\n  for _, s in ipairs(list) do\n    if not s.when or s.when(st) then\n      local values, names, hints = s.values, s.names, s.hints\n      if s.dynamic then values, names, hints = s.dynamic(st, ctx) end\n      local index = C.indexOf(values, st[s.id]) or 1\n      out[#out + 1] = { id = s.id, label = s.label, names = names, index = index,\n                        hint = s.hint or \"\", hints = hints or {}, group = s.group or \"\" }\n    end\n  end\n  return out\nend\n\nfunction C.set(list, st, id, index, ctx)\n  for _, s in ipairs(list) do\n    if s.id == id then\n      local values = s.values\n      if s.dynamic then values = s.dynamic(st, ctx) end\n      if values[index] ~= nil then st[id] = values[index] end\n      return true\n    end\n  end\n  return false\nend\n\n-- Notes as the app wants them, whatever the engine called the fields.\nfunction C.notes(list, chan)\n  local out = {}\n  for _, n in ipairs(list or {}) do\n    if not chan or (n.chan or 0) == chan then\n      out[#out + 1] = { start = n.start, len = n.len, pitch = n.pitch, vel = n.vel or 100 }\n    end\n  end\n  table.sort(out, function(a, b)\n    if a.start ~= b.start then return a.start < b.start end\n    return a.pitch < b.pitch\n  end)\n  return out\nend\n\nfunction C.finish(notes)\n  local e = 0\n  for _, n in ipairs(notes) do e = math.max(e, n.start + n.len) end\n  return e\nend\n\nreturn C\n", "adapters/index.lua": "return { \"adapters/midi_catalogue.lua\" }\n", "adapters/midi_catalogue.lua": "--[[ Midi Catalogue, in Noterator.\n\n     The catalogue is written for one instrument, and in Noterator that\n     instrument is the part the music is going into: a violin part gets the\n     catalogue for Violin I, a viola part the viola's, so the same settings\n     give a different line for each (Noterator decision 0006). A section\n     (strings, woodwinds, brass, four horns) writes several parts at once,\n     each on its own instrument.\n\n     Results are the catalogue's entries for the chosen type, filtered by\n     density, shaped by the transformation, repeats and velocity, as the\n     Catalogue's own window does. ]]\n\nlocal C = engine(\"adapters/common.lua\")\nlocal T = engine(\"midi-catalogue/mc_theory.lua\")\nlocal O = engine(\"midi-catalogue/mc_orchestra.lua\")\nlocal Cat = engine(\"midi-catalogue/mc_catalogue.lua\").init(T, O)\n\nlocal A = {\n  id = \"midi-catalogue\",\n  name = \"Midi Catalogue\",\n  description = \"Rhythms, melodies and harmony written for this part's instrument, in the key, over a chain of chords. Nothing the instrument cannot play is offered.\",\n  input = \"none\",\n}\n\nlocal MAX_RESULTS = 48\n\nlocal function catNames()\n  local out = {}\n  for _, c in ipairs(Cat.CATEGORIES) do out[#out + 1] = c.name end\n  return out\nend\n\nlocal function typesFor(st)\n  for _, c in ipairs(Cat.CATEGORIES) do if c.name == st.cat then return c.types end end\n  return Cat.CATEGORIES[1].types\nend\n\nlocal progIds = {}\nfor _, p in ipairs(T.PROGRESSIONS) do progIds[#progIds + 1] = p.id end\n\nlocal sectionIds, sectionNames = { \"\" }, { \"This part's instrument\" }\nfor _, e in ipairs(O.ENSEMBLES) do\n  sectionIds[#sectionIds + 1] = e.id\n  sectionNames[#sectionNames + 1] = e.name .. \" section\"\nend\n\nlocal LIST = {\n  C.setting(\"prog\", \"Chords\", progIds, nil, {\n    group = \"Harmony\",\n    hint = \"The chain of chords the music is written over, one chord per equal share of the length.\",\n    dynamic = function(st)\n      local key = T.key(st.root, st.scale)\n      local values, names = {}, {}\n      for _, p in ipairs(T.progressionsFor(key)) do\n        values[#values + 1] = p.id\n        names[#names + 1] = T.progressionName(key, p)\n      end\n      return values, names, {}\n    end }),\n  C.setting(\"bars\", \"Bars\", Cat.LENGTHS, nil, { group = \"Harmony\" }),\n  C.setting(\"section\", \"Write for\", sectionIds, sectionNames, {\n    group = \"Who\",\n    hint = \"A section writes harmony across several parts at once, each in its own range.\" }),\n  C.setting(\"register\", \"Register\", O.REGISTERS, nil, { group = \"Who\",\n    hint = \"Where in the instrument's sweet register the music sits.\" }),\n  C.setting(\"cat\", \"Kind\", catNames(), nil, { group = \"What\",\n    when = function(st) return st.section == \"\" end }),\n  C.setting(\"type\", \"Type\", Cat.CATEGORIES[1].types, nil, {\n    group = \"What\",\n    dynamic = function(st) local t = typesFor(st); return t, t, {} end }),\n  C.setting(\"density\", \"Density\", Cat.DENSITIES, nil, { group = \"What\" }),\n  C.setting(\"transform\", \"Transform\", Cat.TRANSFORMS, nil, { group = \"Shape\",\n    hint = \"Inversion and retrograde keep the harmony: a chord tone lands on a chord tone.\" }),\n  C.setting(\"repeats\", \"Repeats\", Cat.REPEATS, { \"Once\", \"Twice\", \"Four times\" }, { group = \"Shape\" }),\n  C.setting(\"velocity\", \"Velocity\", Cat.VELOCITIES, nil, { group = \"Shape\" }),\n}\n\nfunction A.newState()\n  local st = Cat.newState()\n  st.prog = \"I-V-vi-IV\"\n  return st\nend\n\nlocal function sync(st, ctx)\n  st.inst = (ctx and ctx.catalogueId ~= \"\" and O.byId(ctx.catalogueId)) and ctx.catalogueId or \"pno\"\n  local key = T.key(st.root, st.scale)\n  local prog = T.progressionById(st.prog or \"I\")\n  if not T.progressionFits(key, prog) then prog = T.progressionsFor(key)[1]; st.prog = prog.id end\n  st.chain = T.chainString(T.presetChain(prog))\n  Cat.clampState(st)\nend\n\nfunction A.settings(st, ctx)\n  sync(st, ctx)\n  return C.describe(LIST, st, ctx)\nend\n\nfunction A.set(st, id, index, ctx)\n  C.set(LIST, st, id, index, ctx)\n  if id == \"cat\" then st.type = typesFor(st)[1] end\n  if id == \"section\" and st.section ~= \"\" then st.cat = \"Harmony\"; st.type = typesFor(st)[1] end\n  sync(st, ctx)\nend\n\nfunction A.useKey(st, root, scale)\n  st.root, st.scale = root, scale\nend\n\nfunction A.generate(st, ctx, seed, count)\n  sync(st, ctx)\n  local c = Cat.contextFor(st, ctx.barBeats, ctx.bpm)\n  local res = Cat.catalogue(c, st.type)\n  if res.avoided then return { results = {}, message = res.avoided } end\n\n  local out = {}\n  for _, e in ipairs(res.entries) do\n    if st.density == \"Any\" or e.band == st.density then\n      local block = Cat.block(c, st.type, e, { transform = st.transform, repeats = st.repeats,\n                                                velocity = st.velocity })\n      local parts = {}\n      for _, p in ipairs(block.parts) do\n        parts[#parts + 1] = { name = p.name, instrument = p.inst, notes = C.notes(p.notes) }\n      end\n      out[#out + 1] = { title = e.label, detail = (e.hint or \"\") .. ((block.warning and (\"\\n\" .. block.warning)) or \"\"),\n                        beats = block.beats, parts = parts }\n      if #out >= MAX_RESULTS then break end\n    end\n  end\n  local msg\n  if #res.hidden > 0 then\n    local bits = {}\n    for _, h in ipairs(res.hidden) do bits[#bits + 1] = (\"%d %s\"):format(h.count, h.reason) end\n    msg = \"Left out: \" .. table.concat(bits, \"; \")\n  end\n  return { results = out, message = msg }\nend\n\nreturn A\n", "midi-catalogue/mc_catalogue.lua": "--[[ Midi Catalogue - the catalogue.\n\n     Pure Lua: no REAPER, no ImGui. Everything here is a pure function of a\n     context (key, chords, instrument, register) and a set of choices, so\n     tests/test_catalogue.lua can run all of it and check what comes out.\n\n     Nothing in the catalogue is stored and nothing is random. Each type below\n     is a small set of musical choices - a figure, a rhythm, a voicing - and\n     its catalogue is every combination of them, generated for the key, the\n     chords and the instrument in front of it, then filtered by the rules a\n     player or a harmony teacher would apply. What is left is what the window\n     lists. What was filtered out is counted, with the reason, so the list\n     never quietly shrinks.\n\n     Times are in quarter notes (beats) from the start of the block. A note is\n     { start, len, pitch, accent, voice, ct } - `ct` records whether it was a\n     chord tone when it was made, which is what lets a transformation keep it\n     on the harmony afterwards.\n]]\n\nlocal M = {}\nlocal T, O\n\nfunction M.init(theory, orchestra)\n  T, O = theory, orchestra\n  return M\nend\n\nlocal EPS = 1e-6\n\nM.MAX_NOTES = 4096\nM.VELOCITY  = 100    -- everything leaves at 100\nM.ACCENT    = 115    -- unless accents are asked for, when accented notes rise above it\n\nM.CATEGORIES = {\n  { name = \"Rhythm\", types = { \"Ostinato\", \"Pulse\", \"Syncopation\", \"Gallop\", \"Tresillo\",\n      \"Hemiola\", \"Polyrhythm\", \"Arpeggio\", \"Repeated note\", \"Alberti\", \"Broken chord\" } },\n  { name = \"Melody\", types = { \"Ascending\", \"Descending\", \"Arch\", \"Wave\", \"Sequence\",\n      \"Call/response\", \"Repetition\", \"Development\" } },\n  { name = \"Harmony\", types = { \"Triadic\", \"Quartal\", \"Cluster\", \"Pedal\", \"Arpeggiated\",\n      \"Contrary motion\" } },\n}\n\nM.TRANSFORMS = { \"Original\", \"Inversion\", \"Retrograde\", \"Retrograde inversion\",\n                 \"Augmentation\", \"Diminution\" }\nM.REPEATS    = { 1, 2, 4 }\nM.DENSITIES  = { \"Any\", \"Sparse\", \"Medium\", \"Busy\" }\nM.VELOCITIES = { \"Flat 100\", \"Accents\" }\nM.LENGTHS    = { 1, 2, 4, 8 }\n\n-- What the window shows for a value. The values above are saved by name and\n-- never renamed (a saved setting would stop matching); a label is free to\n-- follow the house style - title-style, after Apple's writing guidelines.\nM.LABELS = {\n  [\"Repeated note\"] = \"Repeated Note\", [\"Broken chord\"] = \"Broken Chord\",\n  [\"Call/response\"] = \"Call and Response\", [\"Contrary motion\"] = \"Contrary Motion\",\n  [\"Retrograde inversion\"] = \"Retrograde Inversion\",\n}\nfunction M.label(v) return M.LABELS[v] or tostring(v) end\n\n-- Onsets per beat that separate the density bands. A held chord is sparse,\n-- a quarter-note pulse medium, anything moving in sixteenths busy.\nM.SPARSE_BELOW = 1\nM.BUSY_FROM    = 2.5\n\nfunction M.categoryOf(typeName)\n  for _, c in ipairs(M.CATEGORIES) do\n    for _, t in ipairs(c.types) do if t == typeName then return c.name end end\n  end\n  return nil\nend\n\n------------------------------------------------------------------------------\n-- Context\n------------------------------------------------------------------------------\n\n-- Everything the generators need to know, from the choices the window holds.\n-- `o` is plain: root and scale indices, the chain of chords (or, for short, a\n-- progression id and \"triad\" or \"seventh\"), bars, the project's bar length\n-- and tempo, an instrument id, a register and optionally an ensemble id.\n--\n-- Each chord gets the scale as it sounds under it (T.chordKey), and every\n-- generator turns scale steps into notes through the slot's key, so a figure\n-- written as 1-3-5 plays a borrowed chord's own third.\nfunction M.context(o)\n  local key  = T.key(o.root or 1, o.scale or 1)\n  local chain = o.chain\n  if type(chain) == \"string\" then chain = T.parseChain(chain, key) end\n  if not chain or #chain == 0 then\n    local prog = T.progressionById(o.prog or \"I\")\n    if not T.progressionFits(key, prog) then prog = T.PROGRESSIONS[1] end\n    chain = T.presetChain(prog, o.colour == \"seventh\")\n  end\n  local ctx = {\n    key = key, chain = chain, n = T.scaleLen(key),\n    bars = o.bars or 4, barBeats = o.barBeats or 4, bpm = o.bpm or 120,\n    inst = O.byId(o.inst or \"pno\") or O.byId(\"pno\"),\n    register = o.register or \"Middle\",\n    ensemble = o.ensemble and O.ensembleById(o.ensemble) or nil,\n    cache = {},\n  }\n  ctx.L = ctx.bars * ctx.barBeats\n  local k = #chain\n  ctx.slots = {}\n  for i, link in ipairs(chain) do\n    local chord = T.chord(key, link.degree, T.chainSpec(link))\n    chord.key = T.chordKey(key, chord)\n    ctx.slots[i] = { i = i, start = (i - 1) * ctx.L / k, len = ctx.L / k, degree = link.degree,\n                     chord = chord, key = chord.key }\n  end\n  ctx.lo, ctx.hi, ctx.centre = O.band(ctx.inst, ctx.register)\n  if ctx.inst.pitches == \"td\" then ctx.drums = M.drums(ctx) end\n  return ctx\nend\n\n-- The slot, and so the chord, sounding at a time. Past the end of the block\n-- it wraps, so a repeat reads the chords from the top again.\nfunction M.slotAt(ctx, t)\n  local k = #ctx.slots\n  local x = t % ctx.L\n  local i = math.floor(x / (ctx.L / k) + EPS) + 1\n  if i > k then i = k end\n  if i < 1 then i = 1 end\n  return ctx.slots[i]\nend\n\n-- The scale as it sounds at a time: the key, bent to the chord there.\nlocal function keyAt(ctx, t) return M.slotAt(ctx, t).key end\nM.keyAt = keyAt\n\n------------------------------------------------------------------------------\n-- Settings\n--\n-- One plain table holds everything the window has chosen. Choices from lists\n-- that differ between contexts - a progression, an instrument, an entry - are\n-- kept by name, not by position, so changing one thing does not slide another\n-- along its list.\n------------------------------------------------------------------------------\n\nfunction M.newState()\n  return {\n    root = 1, scale = 1,                 -- C major\n    chain = \"0:d:Triad,4:d:Triad,5:d:Triad,3:d:Triad\", bars = 4,   -- I-V-vi-IV\n    inst = \"pno\", section = \"\",          -- a section id, or \"\" for the instrument\n    register = \"Middle\",\n    cat = \"Rhythm\", type = \"Ostinato\", entry = \"\",\n    transform = \"Original\", repeats = 1, velocity = \"Flat 100\", density = \"Any\",\n  }\nend\n\nlocal function oneOf(v, list, fallback)\n  for _, x in ipairs(list) do if x == v then return v end end\n  return fallback\nend\n\n-- Settings can come from a saved project written by an older version, whose\n-- tables were different. Everything is put back inside what exists now.\nfunction M.clampState(st)\n  local function pin(v, lo, hi, fallback)\n    v = tonumber(v) or fallback\n    return math.max(lo, math.min(math.floor(v), hi))\n  end\n  st.root  = pin(st.root, 1, #T.ROOTS, 1)\n  st.scale = pin(st.scale, 1, #T.SCALES, 1)\n  local key = T.key(st.root, st.scale)\n  -- The chain keeps every link this scale still has; if none survive, it\n  -- starts again from the first progression the scale can play.\n  local chain = T.parseChain(st.chain, key)\n  if #chain == 0 then\n    local fallback = T.progressionById(\"I-V-vi-IV\")\n    if not T.progressionFits(key, fallback) then fallback = T.progressionsFor(key)[1] end\n    chain = T.presetChain(fallback)\n  end\n  st.chain = T.chainString(chain)\n  local bars, best = tonumber(st.bars) or 4, nil\n  for _, b in ipairs(M.LENGTHS) do\n    if not best or math.abs(b - bars) < math.abs(best - bars) then best = b end\n  end\n  st.bars = best\n  if not O.byId(st.inst) then st.inst = \"pno\" end\n  if st.section ~= \"\" and not O.ensembleById(st.section) then st.section = \"\" end\n  st.register = oneOf(st.register, O.REGISTERS, \"Middle\")\n  local catNames = {}\n  for _, c in ipairs(M.CATEGORIES) do catNames[#catNames + 1] = c.name end\n  st.cat = oneOf(st.cat, catNames, \"Rhythm\")\n  if st.section ~= \"\" then st.cat = \"Harmony\" end\n  local types\n  for _, c in ipairs(M.CATEGORIES) do if c.name == st.cat then types = c.types end end\n  st.type = oneOf(st.type, types, types[1])\n  st.entry = tostring(st.entry or \"\")\n  st.transform = oneOf(st.transform, M.TRANSFORMS, \"Original\")\n  local reps = tonumber(st.repeats) or 1\n  st.repeats = oneOf(reps, M.REPEATS, 1)\n  st.velocity = oneOf(st.velocity, M.VELOCITIES, \"Flat 100\")\n  st.density = oneOf(st.density, M.DENSITIES, \"Any\")\n  return st\nend\n\n-- The context the settings describe, in a project with this bar and tempo.\nfunction M.contextFor(st, barBeats, bpm)\n  return M.context({\n    root = st.root, scale = st.scale, chain = st.chain, bars = st.bars,\n    barBeats = barBeats, bpm = bpm, inst = st.inst, register = st.register,\n    ensemble = (st.section ~= \"\" and st.cat == \"Harmony\") and st.section or nil,\n  })\nend\n\n------------------------------------------------------------------------------\n-- Pitch helpers\n------------------------------------------------------------------------------\n\n-- A figure is written the way players say it: 1-5-8-5 is root, fifth,\n-- octave, fifth. The numbers are scale steps above the chord's root, so in a\n-- pentatonic scale \"5\" is still the chord's fifth (two thirds up). A trailing\n-- comma is the octave below: 7, is the note under the root.\nfunction M.figSteps(tok, n)\n  local num, below = tostring(tok):match(\"^(%d+)(,?)$\")\n  num = tonumber(num)\n  local s = (num <= 7) and (num - 1) or (n + num - 8)\n  if below == \",\" then s = s - n end\n  return s\nend\n\nlocal function parseFig(s)\n  local out = {}\n  for tok in s:gmatch(\"[^-]+\") do out[#out + 1] = tok end\n  return out\nend\n\n-- The root position for a chord: within a window around `anchor`, and of\n-- those the one nearest where the last chord's root was. A bass line moves\n-- the short way, and never drifts off up the keyboard over a progression.\nfunction M.rootNear(ctx, degree, anchor, prev)\n  local best, bestD\n  for k = -2, 12 do\n    local pos = degree + k * ctx.n\n    local p = T.pitch(ctx.key, pos)\n    if p >= anchor - 7 and p <= anchor + 7 then\n      local d = math.abs(p - (prev or anchor))\n      if not bestD or d < bestD then best, bestD = pos, d end\n    end\n  end\n  return best or degree + 4 * ctx.n\nend\n\n-- The chord-tone position nearest `pos`, searching outwards; `lean` says\n-- which side wins a tie.\nfunction M.nearestChordPos(ctx, chord, pos, lean)\n  for d = 0, 2 * ctx.n do\n    local first, second = pos + d, pos - d\n    if (lean or 1) < 0 then first, second = second, first end\n    local k = chord.key or ctx.key\n    if T.hasPc(chord, T.pc(k, first)) then return first end\n    if T.hasPc(chord, T.pc(k, second)) then return second end\n  end\n  return pos\nend\n\n-- The timpani are tuned to the tonic and the dominant, the dominant below:\n-- the classic pair. Every figure on them alternates the two.\nfunction M.drums(ctx)\n  local inst = ctx.inst\n  local tonicPc = T.rootPc(ctx.key)\n  local fifthPc = (tonicPc + 7) % 12\n  local best\n  for p = inst.low, inst.high do\n    if p % 12 == tonicPc and (not best or math.abs(p - 50) < math.abs(best - 50)) then best = p end\n  end\n  local tonic = best or inst.low\n  local dom\n  for p = tonic - 1, inst.low, -1 do\n    if p % 12 == fifthPc then dom = p; break end\n  end\n  if not dom then\n    for p = tonic + 1, inst.high do if p % 12 == fifthPc then dom = p; break end end\n  end\n  return { tonic = tonic, dominant = dom or tonic, tonicPc = tonicPc, fifthPc = fifthPc }\nend\n\n-- Which drum this chord wants: the tonic if the chord has it, else the\n-- dominant, else neither - the timpani rest through a chord that has\n-- neither note rather than play against it.\nlocal function slotDrum(ctx, slot)\n  local d = ctx.drums\n  if T.hasPc(slot.chord, d.tonicPc) then return d.tonic, d.dominant end\n  if T.hasPc(slot.chord, d.fifthPc) then return d.dominant, d.tonic end\n  return nil\nend\n\n-- One token of a figure, on a chord whose root is at `rootPos`.\nlocal function realise(ctx, slot, rootPos, tok)\n  if ctx.drums then\n    local main, other = slotDrum(ctx, slot)\n    if not main then return nil end\n    return (M.figSteps(tok, ctx.n) % ctx.n == 0) and main or other\n  end\n  return T.pitch(slot.key, rootPos + M.figSteps(tok, ctx.n))\nend\n\n-- Where a figure's root goes so the figure sits in the middle of the band.\nlocal function anchorFor(ctx, fig)\n  local lo, hi = 0, 0\n  for _, tok in ipairs(fig) do\n    local s = M.figSteps(tok, ctx.n)\n    lo, hi = math.min(lo, s), math.max(hi, s)\n  end\n  return ctx.centre - (lo + hi) / 2 * 12 / ctx.n\nend\n\n-- Chord roots for every slot, for a figure.\nlocal function slotRoots(ctx, fig)\n  local out, prev = {}, nil\n  local anchor = anchorFor(ctx, fig)\n  for i, slot in ipairs(ctx.slots) do\n    out[i] = M.rootNear(ctx, slot.degree, anchor, prev)\n    prev = T.pitch(ctx.key, out[i])\n  end\n  return out\nend\n\n------------------------------------------------------------------------------\n-- Voicings shared by everything that plays the chords\n------------------------------------------------------------------------------\n\n-- T.voiceLead, remembered for the life of a context: a catalogue asks for the\n-- same progression voiced the same way once per rhythm it offers.\nlocal function lead(ctx, chords, ranges, opts)\n  local k = {}\n  for _, ch in ipairs(chords) do k[#k + 1] = ch.degree .. ch.kind .. table.concat(ch.pcs, \".\") end\n  for _, r in ipairs(ranges) do k[#k + 1] = r[1] .. \"-\" .. r[2] end\n  local names = {}\n  for name in pairs(opts or {}) do names[#names + 1] = name end\n  table.sort(names)\n  for _, name in ipairs(names) do\n    local v = opts[name]\n    if type(v) == \"table\" then\n      local ks = {}\n      for x in pairs(v) do ks[#ks + 1] = tostring(x) end\n      table.sort(ks)\n      v = table.concat(ks, \".\")\n    end\n    k[#k + 1] = name .. \"=\" .. tostring(v)\n  end\n  local sig = table.concat(k, \"|\")\n  ctx.cache.lead = ctx.cache.lead or {}\n  local hit = ctx.cache.lead[sig]\n  if hit == nil then\n    hit = T.voiceLead(ctx.key, chords, ranges, opts) or false\n    ctx.cache.lead[sig] = hit\n  end\n  return hit or nil\nend\n\n-- The progression voiced for this instrument. A melodic instrument gets its\n-- own voice of a four-part chorale; a chordal one gets the chords themselves,\n-- in its register. Cached per context, because many entries ask.\nlocal function instrumentVoicings(ctx)\n  if ctx.cache.voicings ~= nil then return ctx.cache.voicings, ctx.cache.take end\n  local inst = ctx.inst\n  local chords = {}\n  for i, s in ipairs(ctx.slots) do chords[i] = s.chord end\n  local v, take\n  if inst.poly == 1 then\n    local ranges\n    ranges, take = O.satbFor(inst, ctx.register)\n    v = lead(ctx, chords, ranges, {})\n  else\n    local nv = math.min(4, inst.poly)\n    v = lead(ctx, chords, O.chordRanges(inst, ctx.register, nv), {})\n  end\n  ctx.cache.voicings, ctx.cache.take = v or false, take\n  return ctx.cache.voicings, take\nend\n\n-- The pitches a rhythm plays on a slot: one for a melodic instrument (its own\n-- voice), the whole chord for a chordal one.\nlocal function voicePitches(ctx, slot)\n  if ctx.drums then\n    local main = slotDrum(ctx, slot)\n    return main and { main } or {}\n  end\n  local v, take = instrumentVoicings(ctx)\n  if not v then return {} end\n  if take then return { v[slot.i][take] } end\n  return v[slot.i]\nend\n\n------------------------------------------------------------------------------\n-- Building notes\n------------------------------------------------------------------------------\n\nlocal function add(list, start, len, pitch, accent, voice)\n  if not pitch then return end\n  list[#list + 1] = { start = start, len = math.max(len, 0.03), pitch = math.floor(pitch),\n                      accent = accent or false, voice = voice }\nend\n\n-- A rhythm cell tiled from s to e, counting cycles rather than accumulating\n-- time so the last hit cannot drift. Hits are { at, len, accent }.\nlocal function tile(cell, s, e)\n  local out, k = {}, 0\n  while true do\n    local base = s + k * cell.cycle\n    if base >= e - EPS then break end\n    for h, hit in ipairs(cell.hits) do\n      local t = base + hit[1]\n      if t < e - EPS then\n        out[#out + 1] = { t = t, len = math.min(hit[2], e - t), acc = hit[3] or false,\n                          hit = h, cyc = k }\n      end\n    end\n    k = k + 1\n  end\n  return out\nend\n\nlocal function even(step, accentEvery)\n  return { cycle = step, hits = { { 0, step, true } }, every = accentEvery }\nend\n\n-- Rates, by the names players use.\nlocal RATES = {\n  [\"1/2\"] = 2, [\"1/4\"] = 1, [\"1/8\"] = 0.5, [\"1/8T\"] = 1 / 3, [\"1/16\"] = 0.25,\n}\n\n-- A note on a bar line or on the first beat of a chord.\nlocal function onDownbeat(ctx, t)\n  local b = t / ctx.barBeats\n  if math.abs(b - math.floor(b + 0.5)) < EPS then return true end\n  for _, s in ipairs(ctx.slots) do\n    if math.abs((t % ctx.L) - s.start) < EPS then return true end\n  end\n  return false\nend\n\n------------------------------------------------------------------------------\n-- The pitch plans a rhythm can be played on\n------------------------------------------------------------------------------\n\n-- \"fig\": a figure, cycling one token per onset (or per hit of the cell).\n-- \"voice\": the harmony itself - the chords on a chordal instrument, this\n-- instrument's own smoothly-led voice on a melodic one.\nlocal function planLabel(ctx, plan)\n  if plan.kind == \"voice\" then\n    if ctx.drums then return \"tonic & dominant\" end\n    return (ctx.inst.poly > 1) and \"chords\" or \"voice-led\"\n  end\n  return plan.label\nend\n\nlocal PLAN_ROOT  = { kind = \"fig\", fig = { \"1\" }, label = \"root\" }\nlocal PLAN_158   = { kind = \"fig\", fig = { \"1\", \"5\", \"8\" }, label = \"1-5-8\" }\nlocal PLAN_18    = { kind = \"fig\", fig = { \"1\", \"8\" }, label = \"root & octave\" }\nlocal PLAN_VOICE = { kind = \"voice\" }\n\n-- Plays hits (from tile) on a slot with a plan. `idx` picks the figure token:\n-- by onset within the slot unless the plan says by hit within the cell.\nlocal function playHits(ctx, notes, slot, rootPos, hits, plan, gate)\n  for i, h in ipairs(hits) do\n    local len = h.len * (gate or 0.85)\n    if plan.kind == \"voice\" then\n      for v, p in ipairs(voicePitches(ctx, slot)) do add(notes, h.t, len, p, h.acc, v) end\n    else\n      local k = plan.byHit and h.hit or i\n      local tok = plan.fig[((k - 1) % #plan.fig) + 1]\n      add(notes, h.t, len, realise(ctx, slot, rootPos, tok), h.acc)\n    end\n  end\nend\n\n-- The common shape of most rhythm types: a cell tiled through each chord,\n-- restarting on each, played on a plan.\n--\n-- A cell longer than a chord - the two-bar clave under one chord a bar -\n-- cannot restart on each chord without losing its second half, so it runs\n-- straight through the block instead and each note takes the chord under it.\nlocal function rhythmOnSlots(ctx, cell, plan, gate)\n  local notes = {}\n  local fig = (plan.kind == \"fig\") and plan.fig or { \"1\" }\n  local roots = slotRoots(ctx, fig)\n  if cell.cycle > ctx.slots[1].len + EPS then\n    local hits = tile(cell, 0, ctx.L)\n    for i, h in ipairs(hits) do\n      local slot = M.slotAt(ctx, h.t)\n      h.len = math.min(h.len, slot.start + slot.len - h.t)\n      local one = { h }\n      if plan.kind == \"fig\" and not plan.byHit then\n        -- Keep the figure's count running through the block.\n        one = { { t = h.t, len = h.len, acc = h.acc, hit = i, cyc = h.cyc } }\n        playHits(ctx, notes, slot, roots[slot.i], one, { kind = \"fig\", fig = plan.fig, byHit = true }, gate)\n      else\n        playHits(ctx, notes, slot, roots[slot.i], one, plan, gate)\n      end\n    end\n    return notes\n  end\n  for i, slot in ipairs(ctx.slots) do\n    local hits = tile(cell, slot.start, slot.start + slot.len)\n    if cell.every then\n      for _, h in ipairs(hits) do h.acc = onDownbeat(ctx, h.t) or (h.cyc % cell.every == 0 and h.hit == 1) end\n    end\n    playHits(ctx, notes, slot, roots[i], hits, plan, gate)\n  end\n  return notes\nend\n\n------------------------------------------------------------------------------\n-- The types\n--\n-- Each has `params(ctx)`, the list of combinations, and `build(ctx, p)`.\n-- A param has an `id` (stable across keys and instruments, so a choice\n-- survives changing them), a short `label` for its button and a `hint`\n-- sentence for its tooltip.\n------------------------------------------------------------------------------\n\nlocal TYPES = {}\nM.TYPES = TYPES\n\n-- Every combination of the lists given, as a list of tables.\nlocal function cross(lists)\n  local out = { {} }\n  for _, l in ipairs(lists) do\n    local nxt = {}\n    for _, partial in ipairs(out) do\n      for _, item in ipairs(l.values) do\n        local c = {}\n        for k, v in pairs(partial) do c[k] = v end\n        c[l.name] = item\n        nxt[#nxt + 1] = c\n      end\n    end\n    out = nxt\n  end\n  return out\nend\n\n-- The plans a rhythm type offers: the figures it was given, then the\n-- harmony itself.\nlocal function plans(...)\n  local out = { ... }\n  out[#out + 1] = PLAN_VOICE\n  return out\nend\n\n--------------------------------------------------------------------- Rhythm\n\nlocal OSTINATO_FIGS = { \"1-5-8-5\", \"1-8\", \"1-3-5-3\", \"1-2-3-5\", \"1-2-1-7,\",\n                        \"1-5-6-5\", \"1-3-5-6-5-3\" }\n\nTYPES.Ostinato = {\n  params = function(ctx)\n    local out = {}\n    for _, f in ipairs(OSTINATO_FIGS) do\n      for _, r in ipairs({ \"1/4\", \"1/8\", \"1/16\" }) do\n        out[#out + 1] = { id = f .. \"@\" .. r, label = f .. \"  \" .. r, fig = parseFig(f), rate = r,\n          hint = (\"The figure %s in %s notes, over and over, starting again on each chord.\")\n                 :format(f, r) }\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    local plan = { kind = \"fig\", fig = p.fig }\n    local cell = even(RATES[p.rate])\n    local notes = {}\n    local roots = slotRoots(ctx, p.fig)\n    for i, slot in ipairs(ctx.slots) do\n      local hits = tile(cell, slot.start, slot.start + slot.len)\n      for k, h in ipairs(hits) do h.acc = ((k - 1) % #p.fig == 0) end\n      playHits(ctx, notes, slot, roots[i], hits, plan, 0.85)\n    end\n    return notes\n  end,\n}\n\nTYPES.Pulse = {\n  params = function(ctx)\n    local out = {}\n    for _, pl in ipairs(plans(PLAN_ROOT, PLAN_18)) do\n      for _, r in ipairs({ \"1/2\", \"1/4\", \"1/8\", \"1/16\" }) do\n        local lbl = planLabel(ctx, pl)\n        out[#out + 1] = { id = (pl.label or \"voice\") .. \"@\" .. r, label = lbl .. \"  \" .. r,\n          plan = pl, rate = r,\n          hint = (\"A steady pulse in %s notes on the %s. The floor of a texture.\"):format(r, lbl) }\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    return rhythmOnSlots(ctx, even(RATES[p.rate], p.rate == \"1/16\" and 4 or 2), p.plan,\n                         RATES[p.rate] >= 2 and 0.95 or 0.85)\n  end,\n}\n\n-- Cells are { cycle, hits = { { at, len, accent } } } in beats.\nlocal SYNC_CELLS = {\n  { id = \"offbeats\",   label = \"Off-beats\",  cycle = 1, hits = { { 0.5, 0.5, true } },\n    hint = \"Every note on the \u00e2\u0080\u009cand\u00e2\u0080\u009d, none on the beat.\" },\n  { id = \"charleston\", label = \"Charleston\", cycle = 4, hits = { { 0, 1.5, true }, { 1.5, 0.5, true } },\n    hint = \"A dotted quarter and an eighth pushed onto the \u00e2\u0080\u009cand\u00e2\u0080\u009d of two.\" },\n  { id = \"anticip\",    label = \"Anticipation\", cycle = 4, hits = { { 0, 1.5, true }, { 1.5, 2, true } },\n    anticipate = true,\n    hint = \"Each new chord arrives half a beat early, on the \u00e2\u0080\u009cand\u00e2\u0080\u009d of four, and holds over the bar line.\" },\n  { id = \"clave32\",    label = \"Son clave 3-2\", cycle = 8,\n    hits = { { 0, 1.5, true }, { 1.5, 1.5, true }, { 3, 1, true }, { 5, 1, true }, { 6, 1, true } },\n    hint = \"The son clave, the three side first: 3+3+4 then 2+2 in eighths.\" },\n  { id = \"clave23\",    label = \"Son clave 2-3\", cycle = 8,\n    hits = { { 1, 1, true }, { 2, 2, true }, { 4, 1.5, true }, { 5.5, 1.5, true }, { 7, 1, true } },\n    hint = \"The son clave, the two side first.\" },\n}\n\nTYPES.Syncopation = {\n  params = function(ctx)\n    local out = {}\n    for _, cell in ipairs(SYNC_CELLS) do\n      for _, pl in ipairs(plans(PLAN_ROOT, PLAN_158)) do\n        local lbl = planLabel(ctx, pl)\n        out[#out + 1] = { id = cell.id .. \"@\" .. (pl.label or \"voice\"), label = cell.label .. \"  \" .. lbl,\n          cell = cell, plan = pl, hint = cell.hint .. \" Played on the \" .. lbl .. \".\" }\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    local cell = p.cell\n    if not cell.anticipate then return rhythmOnSlots(ctx, cell, p.plan, 0.9) end\n\n    -- The anticipation: the last half beat before each chord change plays\n    -- the NEXT chord and ties over, and that chord's own downbeat is not\n    -- struck again.\n    local notes = {}\n    local fig = (p.plan.kind == \"fig\") and p.plan.fig or { \"1\" }\n    local roots = slotRoots(ctx, fig)\n    local k = #ctx.slots\n    for i, slot in ipairs(ctx.slots) do\n      local e = slot.start + slot.len\n      local hits = tile(cell, slot.start, e - 0.5)\n      if i > 1 and hits[1] and math.abs(hits[1].t - slot.start) < EPS then table.remove(hits, 1) end\n      playHits(ctx, notes, slot, roots[i], hits, p.plan, 0.9)\n      if slot.len >= 1 then\n        local nxt = ctx.slots[i % k + 1]\n        -- Held over the bar line, but never into the next push.\n        local hold = (i < k) and (0.5 + math.min(1, nxt.len - 0.5)) or 0.5\n        local push = { { t = e - 0.5, len = hold, acc = true, hit = 1, cyc = 0 } }\n        playHits(ctx, notes, nxt, roots[i % k + 1], push, p.plan, 0.95)\n      end\n    end\n    return notes\n  end,\n}\n\nlocal GALLOP_CELLS = {\n  { id = \"gallop\",  label = \"Gallop\", cycle = 1,\n    hits = { { 0, 0.5, true }, { 0.5, 0.25 }, { 0.75, 0.25 } },\n    hint = \"Long-short-short: an eighth and two sixteenths, the William Tell rhythm.\" },\n  { id = \"reverse\", label = \"Reverse gallop\", cycle = 1,\n    hits = { { 0, 0.25, true }, { 0.25, 0.25 }, { 0.5, 0.5 } },\n    hint = \"Short-short-long: two sixteenths and an eighth.\" },\n  { id = \"triplet\", label = \"Triplet gallop\", cycle = 1,\n    hits = { { 0, 2 / 3, true }, { 2 / 3, 1 / 3 } },\n    hint = \"Long-short in triplets: the lilt of a jig or a shuffle.\" },\n  { id = \"slow\",    label = \"Slow gallop\", cycle = 2,\n    hits = { { 0, 1, true }, { 1, 0.5 }, { 1.5, 0.5 } },\n    hint = \"A quarter and two eighths: the gallop at half speed.\" },\n}\n\nTYPES.Gallop = {\n  params = function(ctx)\n    local out = {}\n    local ANSWER = { kind = \"fig\", fig = { \"1\", \"5\", \"5\" }, byHit = true, label = \"fifth answering\" }\n    for _, cell in ipairs(GALLOP_CELLS) do\n      for _, pl in ipairs(plans(PLAN_ROOT, ANSWER)) do\n        local lbl = planLabel(ctx, pl)\n        out[#out + 1] = { id = cell.id .. \"@\" .. (pl.label or \"voice\"), label = cell.label .. \"  \" .. lbl,\n          cell = cell, plan = pl, hint = cell.hint .. \" On the \" .. lbl .. \".\" }\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p) return rhythmOnSlots(ctx, p.cell, p.plan, 0.85) end,\n}\n\nlocal TRESILLO_CELLS = {\n  { id = \"332\",   label = \"3+3+2\", cycle = 4,\n    hits = { { 0, 1.5, true }, { 1.5, 1.5, true }, { 3, 1, true } },\n    hint = \"Eight eighths grouped 3+3+2: the tresillo.\" },\n  { id = \"332s\",  label = \"3+3+2 in 16ths\", cycle = 2,\n    hits = { { 0, 0.75, true }, { 0.75, 0.75, true }, { 1.5, 0.5, true } },\n    hint = \"The tresillo at double speed, twice a bar.\" },\n  { id = \"333322\", label = \"3+3+3+3+2+2\", cycle = 8,\n    hits = { { 0, 1.5, true }, { 1.5, 1.5, true }, { 3, 1.5, true }, { 4.5, 1.5, true },\n             { 6, 1, true }, { 7, 1, true } },\n    hint = \"The long form over two bars: four groups of three eighths, then two of two.\" },\n  { id = \"cinquillo\", label = \"Cinquillo\", cycle = 2,\n    hits = { { 0, 0.5, true }, { 0.5, 0.25 }, { 0.75, 0.5, true }, { 1.25, 0.25 }, { 1.5, 0.5, true } },\n    hint = \"The tresillo with two notes filled in: long-short-long-short-long.\" },\n}\n\nTYPES.Tresillo = {\n  params = function(ctx)\n    local out = {}\n    local BASS = { kind = \"fig\", fig = { \"1\", \"5\", \"8\" }, byHit = true, label = \"1-5-8\" }\n    for _, cell in ipairs(TRESILLO_CELLS) do\n      for _, pl in ipairs(plans(PLAN_ROOT, BASS)) do\n        local lbl = planLabel(ctx, pl)\n        out[#out + 1] = { id = cell.id .. \"@\" .. (pl.label or \"voice\"), label = cell.label .. \"  \" .. lbl,\n          cell = cell, plan = pl, hint = cell.hint .. \" On the \" .. lbl .. \".\" }\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p) return rhythmOnSlots(ctx, p.cell, p.plan, 0.85) end,\n}\n\n-- A hemiola groups against the metre: threes against a duple bar, twos\n-- against a triple one. It runs straight through the bar lines, which is the\n-- point of it, so it is laid out over the whole block rather than per chord.\nTYPES.Hemiola = {\n  params = function(ctx)\n    local triple = (ctx.barBeats % 3 == 0)\n    local out = {}\n    local sizes = triple\n      and { { unit = 1, group = 2, label = \"2 over 3 in quarters\" }, { unit = 0.5, group = 2, label = \"2 over 3 in eighths\" } }\n      or  { { unit = 0.5, group = 3, label = \"3 over 2 in eighths\" }, { unit = 0.25, group = 3, label = \"3 over 2 in 16ths\" } }\n    local P135 = { kind = \"fig\", fig = { \"1\", \"3\", \"5\" }, label = \"1-3-5\" }\n    for _, sz in ipairs(sizes) do\n      for _, fill in ipairs({ \"groups\", \"every\" }) do\n        for _, pl in ipairs(plans(PLAN_ROOT, P135)) do\n          local lbl = planLabel(ctx, pl)\n          local how = (fill == \"groups\") and \"one note a group\" or \"accents on the groups\"\n          out[#out + 1] = { id = sz.label .. \"@\" .. fill .. \"@\" .. (pl.label or \"voice\"),\n            label = sz.label .. \", \" .. how .. \"  \" .. lbl, size = sz, fill = fill, plan = pl,\n            hint = (\"Notes grouped in %ss across the bar line (%s), on the %s.\")\n                   :format(sz.group == 3 and \"three\" or \"two\", how, lbl) }\n        end\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    local notes = {}\n    local g = p.size.unit * p.size.group\n    local fig = (p.plan.kind == \"fig\") and p.plan.fig or { \"1\" }\n    local roots = slotRoots(ctx, fig)\n    local count = math.floor(ctx.L / p.size.unit + EPS)\n    local stepEvery = (p.fill == \"groups\") and p.size.group or 1\n    for i = 0, count - 1, stepEvery do\n      local t = i * p.size.unit\n      local group = math.floor(i / p.size.group)\n      local first = (i % p.size.group == 0)\n      local slot = M.slotAt(ctx, t)\n      local len = ((p.fill == \"groups\") and g or p.size.unit)\n      len = math.min(len, ctx.L - t)\n      local hit = { { t = t, len = len, acc = first, hit = 1, cyc = 0 } }\n      if p.plan.kind == \"fig\" then\n        local tok = p.plan.fig[(group % #p.plan.fig) + 1]\n        add(notes, t, len * 0.85, realise(ctx, slot, roots[slot.i], tok), first)\n      else\n        playHits(ctx, notes, slot, roots[slot.i], hit, p.plan, 0.85)\n      end\n    end\n    return notes\n  end,\n}\n\nlocal RATIOS = { { 3, 2 }, { 2, 3 }, { 4, 3 }, { 3, 4 }, { 5, 4 } }\n\nTYPES.Polyrhythm = {\n  params = function(ctx)\n    local out = {}\n    local spans = { { beats = 1, label = \"a beat\" }, { beats = ctx.barBeats / 2, label = \"half a bar\" },\n                    { beats = ctx.barBeats, label = \"a bar\" } }\n    for _, r in ipairs(RATIOS) do\n      for _, sp in ipairs(spans) do\n        out[#out + 1] = { id = r[1] .. \":\" .. r[2] .. \"@\" .. sp.label,\n          label = (\"%d against %d, %s\"):format(r[1], r[2], sp.label), a = r[1], b = r[2], span = sp.beats,\n          hint = (\"%d evenly spaced notes on the fifth against %d on the root, every %s. \"):format(r[1], r[2], sp.label)\n            .. (ctx.inst.poly > 1 and \"Both layers sound together.\" or\n                \"One instrument plays the rhythm the two layers make together.\") }\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    local notes = {}\n    local roots = slotRoots(ctx, { \"1\", \"5\" })\n    local windows = math.floor(ctx.L / p.span + EPS)\n    local mono = (ctx.inst.poly == 1)\n    local events = {}\n    for w = 0, windows - 1 do\n      local base = w * p.span\n      for i = 0, p.a - 1 do\n        events[#events + 1] = { t = base + i * p.span / p.a, layer = 2, step = p.span / p.a, first = (i == 0) }\n      end\n      for j = 0, p.b - 1 do\n        events[#events + 1] = { t = base + j * p.span / p.b, layer = 1, step = p.span / p.b, first = (j == 0) }\n      end\n    end\n    table.sort(events, function(x, y)\n      if math.abs(x.t - y.t) > EPS then return x.t < y.t end\n      return x.layer < y.layer\n    end)\n    if mono then\n      -- Where the layers meet, the lower one sounds: the composite rhythm is\n      -- what one player can play.\n      local merged = {}\n      for _, e in ipairs(events) do\n        local last = merged[#merged]\n        if not (last and math.abs(last.t - e.t) < EPS) then merged[#merged + 1] = e end\n      end\n      for i, e in ipairs(merged) do\n        local nextT = merged[i + 1] and merged[i + 1].t or math.min(ctx.L, e.t + e.step)\n        local slot = M.slotAt(ctx, e.t)\n        local tok = (e.layer == 1) and \"1\" or \"5\"\n        add(notes, e.t, (nextT - e.t) * 0.85, realise(ctx, slot, roots[slot.i], tok), e.first)\n      end\n    else\n      for _, e in ipairs(events) do\n        local slot = M.slotAt(ctx, e.t)\n        local tok = (e.layer == 1) and \"1\" or \"5\"\n        add(notes, e.t, e.step * 0.85, realise(ctx, slot, roots[slot.i], tok), e.first, e.layer)\n      end\n    end\n    return notes\n  end,\n}\n\nlocal ARP_DIRS = { \"Up\", \"Down\", \"Up-down\", \"Down-up\" }\n\n-- The chord's tones from a starting position upwards, `octaves` octaves of\n-- them, top included.\nlocal function chordPool(ctx, chord, startPos, octaves)\n  local pool = {}\n  for pos = startPos, startPos + ctx.n * octaves do\n    if T.hasPc(chord, T.pc(chord.key or ctx.key, pos)) then pool[#pool + 1] = pos end\n  end\n  return pool\nend\n\nlocal function direct(pool, dir)\n  local out = {}\n  if dir == \"Up\" or dir == \"Up-down\" then for i = 1, #pool do out[#out + 1] = pool[i] end end\n  if dir == \"Down\" or dir == \"Down-up\" then for i = #pool, 1, -1 do out[#out + 1] = pool[i] end end\n  if dir == \"Up-down\" then for i = #pool - 1, 2, -1 do out[#out + 1] = pool[i] end end\n  if dir == \"Down-up\" then for i = 2, #pool - 1 do out[#out + 1] = pool[i] end end\n  return out\nend\n\nTYPES.Arpeggio = {\n  params = function(ctx)\n    local out = {}\n    for _, d in ipairs(ARP_DIRS) do\n      for _, r in ipairs({ \"1/8\", \"1/8T\", \"1/16\" }) do\n        for _, oc in ipairs({ 1, 2 }) do\n          out[#out + 1] = { id = d .. \"@\" .. r .. \"@\" .. oc,\n            label = (\"%s  %s  %d oct\"):format(d, r, oc), dir = d, rate = r, octaves = oc,\n            hint = (\"The chord broken %s over %d octave%s in %s notes. Each chord starts from the \"\n              .. \"chord tone nearest where the last one started, so the arpeggios lead into each other.\")\n              :format(d:lower(), oc, oc > 1 and \"s\" or \"\", r) }\n        end\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    local notes = {}\n    local step = RATES[p.rate]\n    local startPitch = ctx.centre - 6 * p.octaves\n    local prev\n    for _, slot in ipairs(ctx.slots) do\n      -- The first chord from its root; each later one from the chord tone\n      -- nearest where the last one started, which is an inversion as often\n      -- as not, and is what keeps the hand in one place.\n      local s0\n      if prev then s0 = M.nearestChordPos(ctx, slot.chord, T.nearestPos(ctx.key, prev), 1)\n      else s0 = M.rootNear(ctx, slot.degree, startPitch) end\n      prev = T.pitch(slot.key, s0)\n      local seq = direct(chordPool(ctx, slot.chord, s0, p.octaves), p.dir)\n      local count = math.floor(slot.len / step + EPS)\n      for i = 0, count - 1 do\n        local pos = seq[(i % #seq) + 1]\n        add(notes, slot.start + i * step, step * 0.9, T.pitch(slot.key, pos), i % #seq == 0)\n      end\n    end\n    return notes\n  end,\n}\n\nTYPES[\"Repeated note\"] = {\n  params = function(ctx)\n    local out = {}\n    local P5 = { kind = \"fig\", fig = { \"5\" }, label = \"fifth\" }\n    for _, pl in ipairs(plans(PLAN_ROOT, P5)) do\n      for _, r in ipairs({ \"1/8\", \"1/8T\", \"1/16\" }) do\n        local lbl = (pl.kind == \"voice\") and ((ctx.inst.poly > 1) and \"top voice\" or \"voice-led\") or pl.label\n        if ctx.drums and pl.kind == \"voice\" then lbl = \"tonic & dominant\" end\n        out[#out + 1] = { id = (pl.label or \"voice\") .. \"@\" .. r, label = lbl .. \"  \" .. r, plan = pl, rate = r,\n          hint = (\"One note struck again and again in %s notes, on the %s. \"):format(r, lbl)\n            .. (pl.kind == \"voice\" and \"It holds a common tone where the chords share one, and moves by the smallest step where they do not.\" or \"\") }\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    local notes = {}\n    local step = RATES[p.rate]\n    local roots = slotRoots(ctx, { \"1\", \"5\" })\n    for _, slot in ipairs(ctx.slots) do\n      local pitch\n      if p.plan.kind == \"voice\" then\n        local v = voicePitches(ctx, slot)\n        pitch = v[#v]\n      else\n        pitch = realise(ctx, slot, roots[slot.i], p.plan.fig[1])\n      end\n      local count = math.floor(slot.len / step + EPS)\n      for i = 0, count - 1 do\n        local t = slot.start + i * step\n        add(notes, t, step * 0.8, pitch, math.abs(t - math.floor(t + 0.5)) < EPS)\n      end\n    end\n    return notes\n  end,\n}\n\n-- A three-note voicing per chord, close position: root position, or the\n-- nearest inversion to the last, which is how a left hand actually plays it.\nlocal function closeTriads(ctx, voiceLed)\n  local key = \"close\" .. tostring(voiceLed)\n  if ctx.cache[key] ~= nil then return ctx.cache[key] end\n  local chords = {}\n  for i, s in ipairs(ctx.slots) do\n    local ch = s.chord\n    -- Three notes of each chord: root, third and fifth, or for a chord with a\n    -- seventh, root, third and seventh - the three a hand keeps when it has\n    -- only three fingers to spare.\n    local pick = (#ch.pcs >= 4) and { 1, 2, 4 } or { 1, 2, 3 }\n    local pcs = {}\n    for _, m in ipairs(pick) do if ch.pcs[m] then pcs[#pcs + 1] = ch.pcs[m] end end\n    local ess = {}\n    for e = 1, #pcs do ess[e] = e end\n    chords[i] = { degree = ch.degree, kind = \"close\", pcs = pcs, root = ch.root, essential = ess }\n  end\n  local lo = ctx.lo\n  local ranges = { { lo, lo + 12 }, { lo + 2, lo + 17 }, { lo + 4, lo + 21 } }\n  local out\n  if voiceLed then\n    out = lead(ctx, chords, ranges, { bassRoot = false, close = true })\n  else\n    out = {}\n    for i, s in ipairs(ctx.slots) do\n      local r = T.pitch(ctx.key, M.rootNear(ctx, s.degree, lo + 5))\n      local v = { r }\n      local pcs = chords[i].pcs\n      for m = 2, 3 do\n        -- A two-note chord (a power chord) takes its root again on top.\n        local want = pcs[((m - 1) % #pcs) + 1]\n        local p = v[m - 1] + 1\n        while p % 12 ~= want do p = p + 1 end\n        v[m] = p\n      end\n      out[i] = v\n    end\n  end\n  ctx.cache[key] = out or false\n  return ctx.cache[key]\nend\n\nTYPES.Alberti = {\n  params = function(ctx)\n    local out = {}\n    for _, ord in ipairs({ { \"low-high-mid-high\", { 1, 3, 2, 3 } }, { \"low-mid-high-mid\", { 1, 2, 3, 2 } } }) do\n      for _, vl in ipairs({ false, true }) do\n        for _, r in ipairs({ \"1/8\", \"1/16\" }) do\n          out[#out + 1] = { id = ord[1] .. \"@\" .. tostring(vl) .. \"@\" .. r,\n            label = (\"%s  %s  %s\"):format(ord[1], vl and \"voice-led\" or \"root pos\", r),\n            order = ord[2], voiceLed = vl, rate = r,\n            hint = (\"A close three-note chord broken %s in %s notes, %s.\")\n              :format(ord[1], r, vl and \"each chord in the inversion nearest the last, so the hand hardly moves\"\n                                    or \"every chord in root position\") }\n        end\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    local v = closeTriads(ctx, p.voiceLed)\n    if not v then return {} end\n    local notes = {}\n    local step = RATES[p.rate]\n    for _, slot in ipairs(ctx.slots) do\n      local count = math.floor(slot.len / step + EPS)\n      for i = 0, count - 1 do\n        local k = p.order[(i % 4) + 1]\n        add(notes, slot.start + i * step, step * 0.9, v[slot.i][k], i % 4 == 0)\n      end\n    end\n    return notes\n  end,\n}\n\nlocal BROKEN = {\n  { id = \"rolling\", label = \"Rolling 1-5-8-10-8-5\", fig = \"1-5-8-10-8-5\",\n    hint = \"Up through root, fifth, octave and tenth and back: the open, rolling left hand.\" },\n  { id = \"spread\",  label = \"Spread 1-5-10\", fig = \"1-5-10\",\n    hint = \"Root, fifth and the tenth above: an open voicing broken, three notes to a group.\" },\n  { id = \"picking\", label = \"Picking 1-5-8-5-10-5-8-5\", fig = \"1-5-8-5-10-5-8-5\",\n    hint = \"The fingerpicking pattern: the root, then the fifth between every higher note.\" },\n  { id = \"oompah\",  label = \"Oom-pah\", fig = \"1-5\", oompah = true,\n    hint = \"The bass on the beat and the chord off it.\" },\n}\n\nTYPES[\"Broken chord\"] = {\n  params = function(ctx)\n    local out = {}\n    for _, b in ipairs(BROKEN) do\n      for _, r in ipairs({ \"1/8\", \"1/16\" }) do\n        out[#out + 1] = { id = b.id .. \"@\" .. r, label = b.label .. \"  \" .. r, b = b, rate = r,\n          hint = b.hint .. (b.oompah and (\" Oom and pah are each a \" .. (r == \"1/8\" and \"quarter\" or \"eighth\") .. \".\")\n                              or (\" In \" .. r .. \" notes.\")) }\n      end\n    end\n    return out\n  end,\n  build = function(ctx, p)\n    if p.b.oompah then\n      local unit = RATES[p.rate] * 2\n      local cell = { cycle = unit * 2, hits = { { 0, unit, true }, { unit, unit } } }\n      if ctx.inst.poly > 1 and not ctx.drums then\n        -- The bass alone, then the chord's upper voices together.\n        local notes = {}\n        local v = instrumentVoicings(ctx)\n        if not v then return {} end\n        for _, slot in ipairs(ctx.slots) do\n          for _, h in ipairs(tile(cell, slot.start, slot.start + slot.len)) do\n            local ch = v[slot.i]\n            if h.hit == 1 then add(notes, h.t, h.len * 0.8, ch[1], true, 1)\n            else for k = 2, #ch do add(notes, h.t, h.len * 0.6, ch[k], false, k) end end\n          end\n        end\n        return notes\n      end\n      return rhythmOnSlots(ctx, cell, { kind = \"fig\", fig = { \"1\", \"5\" }, byHit = true }, 0.8)\n    end\n    local fig = parseFig(p.b.fig)\n    local cell = even(RATES[p.rate])\n    local notes = {}\n    local roots = slotRoots(ctx, fig)\n    for i, slot in ipairs(ctx.slots) do\n      local hits = tile(cell, slot.start, slot.start + slot.len)\n      for k, h in ipairs(hits) do h.acc = ((k - 1) % #fig == 0) end\n      playHits(ctx, notes, slot, roots[i], hits, { kind = \"fig\", fig = fig }, 0.9)\n    end\n    return notes\n  end,\n}\n\n--------------------------------------------------------------------- Melody\n\n-- Melody rhythms, as a cell of durations repeated through the phrase. The\n-- phrase always ends on a long note: the last bar held, or the second half of\n-- a one-bar phrase.\nlocal MEL_RHYTHMS = {\n  { id = \"q\",   label = \"quarters\",         cell = { 1 } },\n  { id = \"e\",   label = \"eighths\",          cell = { 0.5, 0.5 } },\n  { id = \"ls\",  label = \"long-short\",       cell = { 1.5, 0.5 } },\n  { id = \"ssl\", label = \"short-short-long\", cell = { 0.5, 0.5, 1 } },\n  { id = \"syn\", label = \"syncopated\",       cell = { 0.5, 1, 0.5 } },\n}\n\n-- Short motifs for the types built from one: scale steps from the first note\n-- and durations in beats, one bar of 4/4 each.\nlocal MOTIFS = {\n  { id = \"climb\", label = \"Climb\",        steps = { 0, 1, 2, 4 },    durs = { 1, 1, 1, 1 },\n    hint = \"Three steps up and a skip: 1-2-3-5.\" },\n  { id = \"turn\",  label = \"Turn\",         steps = { 0, 1, 0, -1, 0 }, durs = { 0.5, 0.5, 0.5, 0.5, 2 },\n    hint = \"Around a note and back to it.\" },\n  { id = \"leap\",  label = \"Leap & fill\",  steps = { 0, 4, 3, 2 },    durs = { 1, 1, 1, 1 },\n    hint = \"A leap up a fifth, then steps back down into the gap it left.\" },\n  { id = \"dotted\", label = \"Dotted rise\", steps = { 0, 1, 2 },       durs = { 1.5, 0.5, 2 },\n    hint = \"A dotted step up, landing on a long note.\" },\n  { id = \"fall\",  label = \"Falling third\", steps = { 2, 1, 0 },      durs = { 1, 1, 2 },\n    hint = \"Down by step from the third: the sigh.\" },\n  { id = \"zigzag\", label = \"Zig-zag\",     steps = { 0, 2, 1, 3, 2 }, durs = { 0.5, 0.5, 0.5, 0.5, 2 },\n    hint = \"Up a third, back a step, up a third again.\" },\n}\nM.MOTIFS = MOTIFS\n\nlocal function isStrong(ctx, t, len)\n  if onDownbeat(ctx, t) then return true end\n  local onBeat = math.abs(t - math.floor(t + 0.5)) < EPS\n  return onBeat and len >= 2 - EPS\nend\n\nlocal function chordOf(ctx, nt) return M.slotAt(ctx, nt.start).chord end\nlocal function isCT(ctx, nt) return T.hasPc(chordOf(ctx, nt), T.pc(keyAt(ctx, nt.start), nt.pos)) end\nlocal function pitchOf(ctx, nt) return T.pitch(keyAt(ctx, nt.start), nt.pos) end\n\n-- The rules every melody here passes through, whatever made it. Notes carry\n-- positions (`pos`); these put strong notes on the chord, keep weak ones\n-- honest, end the phrase properly and turn positions into pitches.\n--\n--   - A note on a downbeat, on a chord change, or held two beats or more is a\n--     chord tone.\n--   - A note off the chord has to be reached or left by step: a passing or\n--     neighbour note. One leapt to and leapt from moves onto the chord.\n--   - The last note is a chord tone, and a closing phrase ends on the root\n--     when there is one within a fifth.\n--   - In a seven-note scale there are no augmented seconds (the gap in\n--     harmonic minor) and no tritone leaps: the weaker note of the pair gives\n--     way.\nlocal function snapStrong(ctx, notes, from)\n  for i = from or 1, #notes do\n    local nt = notes[i]\n    nt.strong = isStrong(ctx, nt.start, nt.len)\n    if nt.strong and not isCT(ctx, nt) then\n      local nxt = notes[i + 1]\n      local lean = nxt and nxt.pos and (nxt.pos >= nt.pos and 1 or -1) or -1\n      nt.pos = M.nearestChordPos(ctx, chordOf(ctx, nt), nt.pos, lean)\n    end\n  end\nend\n\nlocal function repairLeapt(ctx, notes, from)\n  for i = math.max(from or 1, 2), #notes - 1 do\n    local a, b, c = notes[i - 1], notes[i], notes[i + 1]\n    if not isCT(ctx, b) and math.abs(b.pos - a.pos) > 1 and math.abs(c.pos - b.pos) > 1 then\n      b.pos = M.nearestChordPos(ctx, chordOf(ctx, b), b.pos, c.pos >= b.pos and 1 or -1)\n    end\n  end\nend\n\nlocal function closeLine(ctx, notes, closing)\n  local last = notes[#notes]\n  if not last then return end\n  local ch = chordOf(ctx, last)\n  if closing then\n    -- Home is worth a leap: the root is looked for up to a fifth away\n    -- before the line settles for another chord tone.\n    local best\n    for d = 0, 4 do\n      for _, s in ipairs({ last.pos - d, last.pos + d }) do\n        if not best and T.pc(ch.key or ctx.key, s) == ch.root then best = s end\n      end\n    end\n    last.pos = best or M.nearestChordPos(ctx, ch, last.pos, -1)\n  elseif not isCT(ctx, last) then\n    last.pos = M.nearestChordPos(ctx, ch, last.pos, 1)\n  end\nend\n\n-- An augmented second or a tritone between two notes, given as positions\n-- and the pitches they sound as.\nlocal function badInterval(ctx, a, b, pa, pb)\n  if ctx.n ~= 7 then return false end\n  local semis = math.abs(pb - pa)\n  return (math.abs(b - a) == 1 and semis == 3) or semis == 6\nend\n\nlocal function repairIntervals(ctx, notes, from, closing)\n  if ctx.n ~= 7 then return end\n  local last = notes[#notes]\n  for _ = 1, 3 do\n    for i = math.max(from or 1, 2), #notes do\n      local a, b = notes[i - 1], notes[i]\n      if badInterval(ctx, a.pos, b.pos, pitchOf(ctx, a), pitchOf(ctx, b)) then\n        -- The weaker of the two gives way: it takes the other's pitch for an\n        -- augmented second, or steps towards it for a tritone.\n        local weak = (b.strong and not a.strong) and a or b\n        local other = (weak == a) and b or a\n        if weak == last and closing then weak, other = other, weak end\n        -- A strong note is on the chord for a reason; if both are strong\n        -- the interval stands.\n        if not weak.strong and not weak.fixedCadence then\n          if math.abs(b.pos - a.pos) == 1 then weak.pos = other.pos\n          else weak.pos = weak.pos + ((other.pos > weak.pos) and 1 or -1) end\n        end\n      end\n    end\n  end\nend\n\nlocal function toPitches(ctx, notes)\n  for _, nt in ipairs(notes) do nt.pitch = pitchOf(ctx, nt) end\n  return notes\nend\n\nlocal function finishMelody(ctx, notes, closing, fromIndex)\n  snapStrong(ctx, notes, fromIndex)\n  repairLeapt(ctx, notes, fromIndex)\n  closeLine(ctx, notes, closing)\n  repairIntervals(ctx, notes, fromIndex, closing)\n  return toPitches(ctx, notes)\nend\n\n-- Fills the notes between fixed ones. Each gap is solved on its own, for the\n-- cheapest path between the two fixed notes: steps rather than repeats,\n-- passing and neighbour notes reached and left by step, chord tones preferred\n-- on the beat, going the way the line is going, and no back-and-forth\n-- wobbling - a neighbour note is an ornament, three in a row is a trill.\n--\n-- The path is searched over pairs of notes (this one and the one before), so\n-- a change of direction and a return to the note before last can be seen and\n-- priced.\nlocal function sgn(x) if x > 0 then return 1 elseif x < 0 then return -1 end return 0 end\n\nlocal function fillLine(ctx, notes)\n  local fixed = {}\n  for i, nt in ipairs(notes) do if nt.fixed then fixed[#fixed + 1] = i end end\n  local seven = (ctx.n == 7)\n  for f = 1, #fixed - 1 do\n    local i, j = fixed[f], fixed[f + 1]\n    if j - i > 1 then\n      local A, B = notes[i].pos, notes[j].pos\n      local k = j - i - 1\n      local lo, hi = math.min(A, B) - 3, math.max(A, B) + 3\n      local way = sgn(B - A)\n      local before = (i > 1 and notes[i - 1].pos) or A\n\n      -- Everything a step asks about a position, worked out once per gap.\n      -- Pitches are per note, because the scale bends with the chord: P[m] is\n      -- the scale under note m, from the first fixed note (0) to the second\n      -- (k + 1).\n      local P, CT, beat = {}, {}, {}\n      for m = 0, k + 1 do\n        local key = keyAt(ctx, notes[i + m].start)\n        local row = {}\n        for pos = lo - 3, hi + 3 do row[pos] = T.pitch(key, pos) end\n        P[m] = row\n      end\n      for m = 1, k do\n        local nt = notes[i + m]\n        local ch = chordOf(ctx, nt)\n        CT[m] = {}\n        for pos = lo, hi do CT[m][pos] = T.hasPc(ch, P[m][pos] % 12) end\n        beat[m] = math.abs(nt.start - math.floor(nt.start + 0.5)) < EPS\n      end\n\n      -- What moving from position a (note m - 1) to b (note m) costs. Steps\n      -- are free, a skip of a third nearly so; leaps cost more the wider they\n      -- are, and a note struck again costs something, because a line that\n      -- keeps repeating itself has stopped being a line.\n      local function move(a, b, m)\n        local d = math.abs(b - a)\n        local c\n        if d == 0 then c = 2.5 elseif d == 1 then c = 0 elseif d == 2 then c = 0.8\n        elseif d == 3 then c = 2 elseif d == 4 then c = 3 else c = 3 + (d - 4) * 1.5 end\n        if seven then\n          local semis = math.abs(P[m][b] - P[m - 1][a])\n          if (d == 1 and semis == 3) or semis == 6 then c = c + 6 end\n        end\n        return c\n      end\n      -- The cost of arriving at `b` (note m) from `a`, with `pp` before that.\n      local function step(pp, a, b, bCT, aCT, onBeat, m)\n        local c = move(a, b, m)\n        local d, back = sgn(b - a), sgn(a - pp)\n        if d ~= 0 and back ~= 0 and d ~= back then c = c + 0.6 end\n        if b == pp and a ~= b then c = c + 1.0 end\n        if way ~= 0 and d == -way then c = c + 0.4 end\n        local leap = math.abs(b - a) > 1\n        if leap and not bCT then c = c + 3 end\n        if leap and not aCT then c = c + 3 end\n        if not bCT and onBeat then c = c + 0.7 end\n        if m <= k then c = c + 0.25 * math.abs(b - (A + (B - A) * m / (k + 1))) end\n        return c\n      end\n\n      -- cost[m][a][b]: the cheapest way to have note m-1 at a and note m at b.\n      local cost, from = {}, {}\n      cost[1], from[1] = { [A] = {} }, { [A] = {} }\n      for b = lo, hi do cost[1][A][b] = step(before, A, b, CT[1][b], true, beat[1], 1) end\n      for m = 2, k do\n        local cm, fm = {}, {}\n        local prev = cost[m - 1]\n        for a = lo, hi do\n          local aCT = CT[m - 1][a]\n          local ca, fa = {}, {}\n          for b = lo, hi do\n            local best, bestPP\n            for pp, row in pairs(prev) do\n              local c0 = row[a]\n              if c0 then\n                local c = c0 + step(pp, a, b, CT[m][b], aCT, beat[m], m)\n                if not best or c < best - EPS or (math.abs(c - best) <= EPS and pp < bestPP) then\n                  best, bestPP = c, pp\n                end\n              end\n            end\n            ca[b], fa[b] = best, bestPP\n          end\n          cm[a], fm[a] = ca, fa\n        end\n        cost[m], from[m] = cm, fm\n      end\n      -- Into the second fixed note, which is on the chord by construction.\n      local best, bestA, bestB\n      local As = {}\n      for a in pairs(cost[k]) do As[#As + 1] = a end\n      table.sort(As)\n      for _, a in ipairs(As) do\n        for b = lo, hi do\n          local c0 = cost[k][a][b]\n          if c0 then\n            local c = c0 + step(a, b, B, true, CT[k][b], false, k + 1)\n            if not best or c < best - EPS then best, bestA, bestB = c, a, b end\n          end\n        end\n      end\n      for m = k, 1, -1 do\n        notes[i + m].pos = bestB\n        local pp = (m > 1) and from[m][bestA][bestB] or nil\n        bestB, bestA = bestA, pp\n      end\n    end\n  end\nend\n\n-- Onsets for a melody rhythm through a phrase, with the long last note.\nlocal function melodyOnsets(ctx, cell)\n  local L, bar = ctx.L, ctx.barBeats\n  local tailStart = (L >= 2 * bar) and (L - bar) or (L / 2)\n  local out, t, i = {}, 0, 0\n  while t < tailStart - EPS do\n    local d = cell[(i % #cell) + 1]\n    out[#out + 1] = { start = t, len = math.min(d, tailStart - t) }\n    t = t + d\n    i = i + 1\n  end\n  out[#out + 1] = { start = tailStart, len = L - tailStart }\n  return out\nend\n\nlocal function toNotes(list, gate)\n  local out = {}\n  for i, nt in ipairs(list) do\n    local nextStart = list[i + 1] and list[i + 1].start or (nt.start + nt.len)\n    local len = math.min(nt.len, nextStart - nt.start)\n    add(out, nt.start, (i == #list) and (nt.len - 0.02) or len * (gate or 0.95), nt.pitch, nt.strong)\n  end\n  return out\nend\n\n-- Where a melody starts: the chosen tone of the first chord, near the middle\n-- of the band.\nlocal function melodyStart(ctx, tok, rise)\n  local slot = ctx.slots[1]\n  local rootPos = M.rootNear(ctx, slot.degree, ctx.centre - rise * 6 / ctx.n)\n  return rootPos + M.figSteps(tok, ctx.n)\nend\n\n-- Realises notes[from..] as a line with a shape: f(u) for u from 0 to 1 is\n-- how far along the span (in scale steps) the line is at that point. The\n-- shape is carried by the strong notes - downbeats, chord changes and half\n-- bars - each placed on the contour and onto a chord tone that does not go\n-- back against it: a rising line's skeleton never steps down, a falling\n-- one's never up. The notes between are filled in (fillLine).\nlocal function shapeLine(ctx, notes, from, startPos, f, span, closing)\n  local first, last = notes[from], notes[#notes]\n  local t0, tail = first.start, last.start\n  local half = (ctx.barBeats % 2 == 0) and ctx.barBeats / 2 or ctx.barBeats\n  local prevSkel = (from > 1) and notes[from - 1].pos or nil\n  for idx = from, #notes do\n    local nt = notes[idx]\n    nt.strong = isStrong(ctx, nt.start, nt.len)\n    local q = nt.start / half\n    local structural = math.abs(q - math.floor(q + 0.5)) < EPS\n    if nt.strong or structural or idx == from or idx == #notes then\n      local u = (tail > t0) and ((nt.start - t0) / (tail - t0)) or 0\n      local target = startPos + f(u) * span\n      local slope = f(math.min(1, u + 0.05)) - f(math.max(0, u - 0.05))\n      local ch, best, bestC = chordOf(ctx, nt), nil, nil\n      for pos = math.floor(target) - 3, math.ceil(target) + 3 do\n        if T.hasPc(ch, T.pc(ch.key or ctx.key, pos)) then\n          local cc = math.abs(pos - target)\n          if prevSkel then\n            if (slope > 0.01 and pos < prevSkel) or (slope < -0.01 and pos > prevSkel) then cc = cc + 4 end\n            if pos == prevSkel then cc = cc + 0.6 end\n          end\n          if not bestC or cc < bestC - EPS then best, bestC = pos, cc end\n        end\n      end\n      nt.pos = best or M.nearestChordPos(ctx, ch, math.floor(target + 0.5), 1)\n      prevSkel = nt.pos\n      nt.fixed = true\n    end\n  end\n  closeLine(ctx, notes, closing)\n  fillLine(ctx, notes)\n  repairIntervals(ctx, notes, from, closing)\n  return toPitches(ctx, notes)\nend\n\nlocal CONTOURS = {\n  Ascending  = { f = function(u) return u end, starts = { \"1\", \"5\" }, closing = false,\n                 say = \"climbs steadily\" },\n  Descending = { f = function(u) return -u end, starts = { \"5\", \"8\" }, closing = true,\n                 say = \"falls steadily\" },\n  Arch       = { f = function(u) if u < 0.6 then return u / 0.6 end return (1 - u) / 0.4 end,\n                 starts = { \"1\", \"5\" }, closing = true, say = \"rises to one high point and comes back down\" },\n  Wave       = { f = function(u) return 0.5 - 0.5 * math.cos(2 * math.pi * 2 * u) end,\n                 starts = { \"1\", \"5\" }, closing = true, say = \"rises and falls twice\", small = true },\n}\n\nlocal function contourType(name)\n  local c = CONTOURS[name]\n  return {\n    params = function(ctx)\n      local out = {}\n      local spans = c.small and { { 2, \"a third\" }, { 4, \"a fifth\" } } or { { 4, \"a fifth\" }, { ctx.n, \"an octave\" } }\n      for _, sp in ipairs(spans) do\n        for _, r in ipairs(MEL_RHYTHMS) do\n          for _, st in ipairs(c.starts) do\n            out[#out + 1] = { id = sp[2] .. \"@\" .. r.id .. \"@\" .. st,\n              label = (\"%s, %s, from %s\"):format(sp[2], r.label, st), span = sp[1], rhythm = r, start = st,\n              hint = (\"A line that %s over %s, in %s, starting on the %s of the first chord. \"\n                .. \"Downbeats land on chord tones and it %s.\"):format(c.say, sp[2], r.label,\n                  ({ [\"1\"] = \"root\", [\"5\"] = \"fifth\", [\"8\"] = \"octave\" })[st],\n                  c.closing and \"ends on the root\" or \"ends on a chord tone, open\") }\n          end\n        end\n      end\n      return out\n    end,\n    build = function(ctx, p)\n      local onsets = melodyOnsets(ctx, p.rhythm.cell)\n      local startPos = melodyStart(ctx, p.start, (c.f(1) >= 0 and 1 or -1) * p.span)\n      shapeLine(ctx, onsets, 1, startPos, c.f, p.span, c.closing)\n      return toNotes(onsets)\n    end,\n  }\nend\n\nTYPES.Ascending  = contourType(\"Ascending\")\nTYPES.Descending = contourType(\"Descending\")\nTYPES.Arch       = contourType(\"Arch\")\nTYPES.Wave       = contourType(\"Wave\")\n\n-- A motif laid into [s, e) from a starting position, truncated at e.\nlocal function state(motif, s, e, base, scale)\n  local out, t = {}, s\n  scale = scale or 1\n  for i, st in ipairs(motif.steps) do\n    if t >= e - EPS then break end\n    local d = motif.durs[i] * scale\n    out[#out + 1] = { start = t, len = math.min(d, e - t), pos = base + st }\n    t = t + d\n  end\n  return out\nend\n\n-- Segments of a phrase: one a bar, or two halves of a one-bar phrase.\nlocal function segments(ctx, want)\n  local count = want or ((ctx.bars >= 2) and ctx.bars or 2)\n  local len = ctx.L / count\n  local out = {}\n  for i = 0, count - 1 do out[#out + 1] = { s = i * len, e = (i + 1) * len } end\n  return out\nend\n\n-- The chord-tone position of a segment's chord nearest `pos`.\nlocal function fitBase(ctx, s, pos)\n  return M.nearestChordPos(ctx, M.slotAt(ctx, s).chord, pos, 1)\nend\n\n-- Where a restatement of a motif goes: as near `base` as it can be while its\n-- strong notes land on the chord under them. The whole statement moves, so\n-- the motif keeps its shape - the sequence bends, the motif does not.\nlocal function fitStatement(ctx, motif, s, e, base, scale)\n  local best, bestC\n  for _, d in ipairs({ 0, 1, -1, 2, -2, 3, -3 }) do\n    local c = math.abs(d) * 0.9\n    for _, nt in ipairs((function() local l = {}; local t = s\n      for i, st in ipairs(motif.steps) do\n        if t >= e - EPS then break end\n        local dur = motif.durs[i] * (scale or 1)\n        l[#l + 1] = { start = t, len = math.min(dur, e - t), pos = base + d + st }\n        t = t + dur\n      end\n      return l end)()) do\n      if isStrong(ctx, nt.start, nt.len) and not isCT(ctx, nt) then c = c + 3 end\n    end\n    if not bestC or c < bestC - EPS then best, bestC = base + d, c end\n  end\n  return best\nend\n\n-- A cadence into [s, e): the chord tone above the target on the beat, then\n-- the target held. The target is the chord's root, or for an open (half)\n-- cadence its fifth. Both notes are chord tones, so nothing needs bending.\nlocal function cadence(ctx, s, e, fromPos, open)\n  local slot = M.slotAt(ctx, s)\n  local R = M.rootNear(ctx, slot.degree, T.pitch(ctx.key, fromPos))\n  local target = R\n  if open then target = M.nearestChordPos(ctx, slot.chord, R + 4, 1) end\n  if e - s < 1 + EPS then return { { start = s, len = e - s, pos = target } } end\n  local approach = M.nearestChordPos(ctx, slot.chord, target + 1, 1)\n  local d1 = math.min(1, (e - s) / 2)\n  return { { start = s, len = d1, pos = approach }, { start = s + d1, len = e - s - d1, pos = target } }\nend\n\nlocal function concat(lists)\n  local out = {}\n  for _, l in ipairs(lists) do for _, n in ipairs(l) do out[#out + 1] = n end end\n  return out\nend\n\n-- The last note of a phrase holds to its end.\nlocal function holdLast(ctx, list, e)\n  local last = list[#list]\n  if last then last.len = (e or ctx.L) - last.start end\n  return list\nend\n\nlocal function motifParams(extra, describe)\n  return function(ctx)\n    local out = {}\n    for _, m in ipairs(MOTIFS) do\n      for _, x in ipairs(extra) do\n        out[#out + 1] = { id = m.id .. \"@\" .. x.id, label = m.label .. \", \" .. x.label, motif = m, how = x.id,\n          hint = describe(m, x) }\n      end\n    end\n    return out\n  end\nend\n\nlocal function anchorPos(ctx)\n  return fitBase(ctx, 0, T.nearestPos(ctx.key, math.floor(ctx.centre - 3)))\nend\n\nTYPES.Sequence = {\n  params = motifParams({ { id = \"down\", label = \"down a step\" }, { id = \"up\", label = \"up a step\" },\n                         { id = \"chords\", label = \"with the chords\" } },\n    function(m, x) return (\"The motif \u00e2\u0080\u009c%s\u00e2\u0080\u009d (%s) stated once a bar, each time %s. Where a \"\n      .. \"downbeat would clash with the chord it bends onto it.\"):format(m.label, m.hint:lower(),\n        x.id == \"chords\" and \"moved to follow the chords\u00e2\u0080\u0099 roots\" or (\"moved \" .. x.label)) end),\n  build = function(ctx, p)\n    local segs = segments(ctx)\n    local base0 = anchorPos(ctx)\n    local d0 = ctx.slots[1].degree\n    local all = {}\n    for k, sg in ipairs(segs) do\n      local base\n      if p.how == \"down\" then base = base0 - (k - 1)\n      elseif p.how == \"up\" then base = base0 + (k - 1)\n      else\n        local d = M.slotAt(ctx, sg.s).degree - d0\n        if d > ctx.n / 2 then d = d - ctx.n end\n        if d < -ctx.n / 2 then d = d + ctx.n end\n        base = base0 + d\n      end\n      if k > 1 then base = fitStatement(ctx, p.motif, sg.s, sg.e, base) end\n      all[#all + 1] = state(p.motif, sg.s, sg.e, base)\n    end\n    local notes = holdLast(ctx, concat(all))\n    return toNotes(finishMelody(ctx, notes, true))\n  end,\n}\n\nTYPES[\"Call/response\"] = {\n  params = motifParams({ { id = \"falls\", label = \"answer falls home\" }, { id = \"inverted\", label = \"answer inverted\" },\n                         { id = \"echo\", label = \"echo a third lower\" } },\n    function(m, x)\n      local ans = ({ falls = \"an answer that walks back down to the root\",\n                     inverted = \"the call turned upside down, landing on the root\",\n                     echo = \"the call again a third lower, landing on the root\" })[x.id]\n      return (\"A call built on \u00e2\u0080\u009c%s\u00e2\u0080\u009d that stops on an open note, then %s.\"):format(m.label, ans)\n    end),\n  build = function(ctx, p)\n    local half = ctx.L / 2\n    local base = anchorPos(ctx)\n    local call = {}\n    local segLen = math.min(4, half)\n    local reps = math.max(1, math.floor(half / segLen + EPS))\n    for r = 0, reps - 1 do\n      local b = (r == 0) and base or fitStatement(ctx, p.motif, r * segLen, (r + 1) * segLen, base + r)\n      local part = state(p.motif, r * segLen, (r + 1) * segLen, b)\n      for _, n in ipairs(part) do call[#call + 1] = n end\n    end\n    holdLast(ctx, call, half)\n    finishMelody(ctx, call, false)\n    -- An open ending: the call stops on the fifth or the third, not the root.\n    local lastCall = call[#call]\n    local ch = M.slotAt(ctx, lastCall.start).chord\n    if T.pc(ch.key or ctx.key, lastCall.pos) == ch.root then\n      local up = M.nearestChordPos(ctx, ch, lastCall.pos + 1, 1)\n      local down = M.nearestChordPos(ctx, ch, lastCall.pos - 1, -1)\n      lastCall.pos = (math.abs(up - lastCall.pos) <= math.abs(down - lastCall.pos)) and up or down\n      lastCall.pitch = pitchOf(ctx, lastCall)\n    end\n\n    local resp = {}\n    local a = call[1].pos\n    local endPos = lastCall.pos\n    for _, n in ipairs(call) do\n      local pos\n      if p.how == \"inverted\" then pos = 2 * a - n.pos\n      elseif p.how == \"echo\" then pos = n.pos - 2 end\n      resp[#resp + 1] = { start = n.start + half, len = n.len, pos = pos }\n    end\n    local notes = {}\n    for _, n in ipairs(call) do n.fixed = true; notes[#notes + 1] = n end\n    local from = #notes + 1\n    for _, n in ipairs(resp) do notes[#notes + 1] = n end\n    if p.how == \"falls\" then\n      -- Down by step from just under where the call stopped, to the root.\n      local lastSlot = M.slotAt(ctx, resp[#resp].start)\n      local rootPos = M.rootNear(ctx, lastSlot.degree, T.pitch(ctx.key, endPos) - 5)\n      if rootPos >= endPos then rootPos = rootPos - ctx.n end\n      local startPos = endPos - 1\n      local span = math.max(1, startPos - rootPos)\n      shapeLine(ctx, notes, from, startPos, function(u) return -u end, span, true)\n      return toNotes(notes)\n    end\n    return toNotes(finishMelody(ctx, notes, true, from))\n  end,\n}\n\nTYPES.Repetition = {\n  params = motifParams({ { id = \"fitted\", label = \"three times, then a cadence\" },\n                         { id = \"literal\", label = \"unchanged every bar\" } },\n    function(m, x)\n      if x.id == \"fitted\" then\n        return (\"The motif \u00e2\u0080\u009c%s\u00e2\u0080\u009d stated in every bar but the last, each time moved to the nearest \"\n          .. \"chord tone of that bar\u00e2\u0080\u0099s chord, then a cadence onto the root.\"):format(m.label)\n      end\n      return (\"The motif \u00e2\u0080\u009c%s\u00e2\u0080\u009d in every bar, note for note. Only offered where it fits every chord \"\n        .. \"as it stands.\"):format(m.label)\n    end),\n  build = function(ctx, p)\n    local segs = segments(ctx)\n    local base = anchorPos(ctx)\n    local all = {}\n    for k, sg in ipairs(segs) do\n      if p.how == \"fitted\" and k == #segs and k > 1 then\n        -- The cadence: onto the root from the chord tone above it.\n        all[#all + 1] = cadence(ctx, sg.s, sg.e, base + p.motif.steps[1], false)\n      else\n        if p.how == \"fitted\" and k > 1 then base = fitStatement(ctx, p.motif, sg.s, sg.e, base) end\n        all[#all + 1] = state(p.motif, sg.s, sg.e, base)\n      end\n    end\n    local notes = holdLast(ctx, concat(all))\n    if p.how == \"literal\" then\n      -- Unchanged means unchanged: if it clashes on a downbeat, it is not\n      -- offered, rather than bent into something else.\n      for i, n in ipairs(notes) do\n        if (onDownbeat(ctx, n.start) or i == #notes)\n           and not T.hasPc(M.slotAt(ctx, n.start).chord, T.pc(keyAt(ctx, n.start), n.pos)) then\n          return nil, \"clashing with the chords\"\n        end\n        n.pitch = pitchOf(ctx, n)\n        n.strong = onDownbeat(ctx, n.start)\n      end\n      return toNotes(notes)\n    end\n    return toNotes(finishMelody(ctx, notes, true))\n  end,\n}\n\nTYPES.Development = {\n  params = motifParams({ { id = \"sentence\", label = \"sentence\" }, { id = \"inversion\", label = \"inversion\" },\n                         { id = \"augment\", label = \"augmentation\" } },\n    function(m, x)\n      local how = ({\n        sentence  = \"stated, restated on the next chord, broken into fragments that climb, then brought to a cadence\",\n        inversion = \"stated, answered upside down, stated again, then brought to a cadence\",\n        augment   = \"stated, then played at half speed across two bars, then brought to a cadence\",\n      })[x.id]\n      return (\"The motif \u00e2\u0080\u009c%s\u00e2\u0080\u009d %s. Four bars of development in miniature.\"):format(m.label, how)\n    end),\n  build = function(ctx, p)\n    local groups = math.max(1, math.floor(ctx.bars / 4 + EPS))\n    local segs = segments(ctx, 4 * groups)\n    local base0 = anchorPos(ctx)\n    local all = {}\n    local m = p.motif\n    for g = 0, groups - 1 do\n      local s1, s2, s3, s4 = segs[g * 4 + 1], segs[g * 4 + 2], segs[g * 4 + 3], segs[g * 4 + 4]\n      local last = (g == groups - 1)\n      all[#all + 1] = state(m, s1.s, s1.e, base0)\n      if p.how == \"sentence\" then\n        all[#all + 1] = state(m, s2.s, s2.e, fitStatement(ctx, m, s2.s, s2.e, base0))\n        -- Fragmentation: the first half of the motif, twice, a step higher each time.\n        local frag = { steps = {}, durs = {} }\n        local acc = 0\n        for i, d in ipairs(m.durs) do\n          if acc >= 2 - EPS then break end\n          frag.steps[i], frag.durs[i] = m.steps[i], math.min(d, 2 - acc)\n          acc = acc + d\n        end\n        local mid = (s3.s + s3.e) / 2\n        local f1 = fitStatement(ctx, frag, s3.s, mid, base0 + 1, (mid - s3.s) / 2)\n        all[#all + 1] = state(frag, s3.s, mid, f1, (mid - s3.s) / 2)\n        all[#all + 1] = state(frag, mid, s3.e, fitStatement(ctx, frag, mid, s3.e, f1 + 1, (s3.e - mid) / 2), (s3.e - mid) / 2)\n      elseif p.how == \"inversion\" then\n        local inv = { steps = {}, durs = m.durs }\n        for i, s in ipairs(m.steps) do inv.steps[i] = -s end\n        all[#all + 1] = state(inv, s2.s, s2.e, fitStatement(ctx, inv, s2.s, s2.e, base0 + 2))\n        all[#all + 1] = state(m, s3.s, s3.e, fitStatement(ctx, m, s3.s, s3.e, base0))\n      else\n        all[#all + 1] = state(m, s2.s, s3.e, fitStatement(ctx, m, s2.s, s3.e, base0, 2), 2)\n      end\n      -- The cadence bar: home at the end, or before the last group the\n      -- fifth - a half cadence that asks for more.\n      all[#all + 1] = cadence(ctx, s4.s, s4.e, base0 + m.steps[1], not last)\n    end\n    local notes = holdLast(ctx, concat(all))\n    return toNotes(finishMelody(ctx, notes, true))\n  end,\n}\n\n-------------------------------------------------------------------- Harmony\n\n-- Comping rhythms for chords: { cycle, hits } like the rhythm cells, plus\n-- \"held\", which is one strike a chord with common tones tied over.\nlocal COMPS = {\n  held    = { label = \"held\" },\n  half    = { label = \"half notes\",  cycle = 2, hits = { { 0, 1.9, true } } },\n  quarter = { label = \"quarters\",    cycle = 1, hits = { { 0, 0.9, true } } },\n  stabs   = { label = \"off-beat stabs\", cycle = 1, hits = { { 0.5, 0.25, true } } },\n  charleston = { label = \"Charleston\", cycle = 4, hits = { { 0, 1, true }, { 1.5, 0.5, true } } },\n}\n\n-- The voices of a harmony block, from voicings (one per slot) and a comp.\n-- Held voices tie a common tone over into the next chord instead of striking\n-- it again, which is what keeping a common tone sounds like.\nlocal function comp(ctx, slots, voicings, compId, skipVoice)\n  local nv = #voicings[1]\n  local voices = {}\n  for v = 1, nv do voices[v] = {} end\n  local c = COMPS[compId]\n  for i, slot in ipairs(slots) do\n    local V = voicings[i]\n    for v = 1, nv do\n      if v ~= skipVoice then\n        if compId == \"held\" then\n          local list = voices[v]\n          local prev = list[#list]\n          if prev and prev.pitch == V[v] and math.abs(prev.start + prev.full - slot.start) < EPS then\n            prev.full = prev.full + slot.len\n            prev.len = prev.full * 0.98\n          else\n            local n = { start = slot.start, len = slot.len * 0.98, full = slot.len, pitch = V[v],\n                        accent = onDownbeat(ctx, slot.start), voice = v }\n            list[#list + 1] = n\n          end\n        else\n          -- Accented on the downbeats, so accents give a comp its pulse.\n          for _, h in ipairs(tile(c, slot.start, slot.start + slot.len)) do\n            add(voices[v], h.t, h.len, V[v], onDownbeat(ctx, h.t), v)\n          end\n        end\n      end\n    end\n  end\n  return voices\nend\n\n-- How the voices of a harmony type are laid out for this instrument.\n--   mono      a melodic instrument: a four-part chorale, and it plays its own voice\n--   poly      a chordal instrument: the chords, in its register\n--   ensemble  a section: one voice to each part\n-- `uniform` gives every voice the whole band, for clusters, whose voices\n-- have to sit a step apart and cannot be kept in four separate ranges.\nlocal function harmonySetup(ctx, p, uniform)\n  local inst = ctx.inst\n  if ctx.ensemble then\n    local ranges = {}\n    for v = 1, 4 do\n      for _, part in ipairs(ctx.ensemble.parts) do\n        if part.voice == v and not part.octave then\n          local pi = O.byId(part.inst)\n          if uniform then ranges[v] = { pi.low, pi.high }\n          else local a, b = O.partBand(part, ctx.register); ranges[v] = { a, b } end\n          break\n        end\n      end\n    end\n    return { mode = \"ensemble\", nv = 4, ranges = ranges }\n  end\n  if inst.poly == 1 then\n    local ranges, take = O.satbFor(inst, ctx.register)\n    if uniform then\n      -- The shared band, widened by a fifth each way (inside the instrument):\n      -- four stacked fourths span more than the sweet register alone.\n      ranges = {}\n      for v = 1, 4 do ranges[v] = { math.max(inst.low, ctx.lo - 7), math.min(inst.high, ctx.hi + 7) } end\n    end\n    return { mode = \"mono\", nv = 4, ranges = ranges, take = take }\n  end\n  local nv = math.min(p.voices or 4, inst.poly)\n  local ranges\n  if uniform then\n    ranges = {}\n    for v = 1, nv do ranges[v] = { ctx.lo, ctx.hi } end\n  else\n    ranges = O.chordRanges(inst, ctx.register, nv)\n  end\n  return { mode = \"poly\", nv = nv, ranges = ranges }\nend\nM._harmonySetup = harmonySetup\n\n-- The chords of a list of slots: the ones chosen, or with `kind` a shape the\n-- type builds for itself (stacked fourths, a cluster) on each chord's degree,\n-- from the scale as it sounds under that chord.\nlocal function slotChords(ctx, slots, kind)\n  local out = {}\n  for i, s in ipairs(slots) do\n    if kind then\n      local ch = T.chord(s.key, s.degree, kind)\n      ch.key = s.key\n      out[i] = ch\n    else\n      out[i] = s.chord\n    end\n  end\n  return out\nend\n\n-- Harmony params: the voice count only matters to an instrument that plays\n-- the chords itself, so only there is it a choice.\nlocal function harmonyParams(ctx, dims, describe)\n  local lists = {}\n  if not ctx.ensemble and ctx.inst.poly > 1 then\n    local vs = {}\n    for _, n in ipairs({ 3, 4 }) do if n <= ctx.inst.poly then vs[#vs + 1] = n end end\n    if #vs == 0 then vs = { ctx.inst.poly } end\n    lists[#lists + 1] = { name = \"voices\", values = vs }\n  end\n  for _, d in ipairs(dims) do lists[#lists + 1] = d end\n  local out = {}\n  for _, c in ipairs(cross(lists)) do\n    local idParts, labelParts = {}, {}\n    if c.voices then idParts[#idParts + 1] = c.voices .. \"v\"; labelParts[#labelParts + 1] = c.voices .. \" voices\" end\n    for _, d in ipairs(dims) do\n      local v = c[d.name]\n      idParts[#idParts + 1] = v.id\n      labelParts[#labelParts + 1] = v.label\n    end\n    c.id = table.concat(idParts, \"@\")\n    c.label = table.concat(labelParts, \", \")\n    c.hint = describe(c)\n    out[#out + 1] = c\n  end\n  return out\nend\n\nlocal function compDim(ids)\n  local vals = {}\n  for _, id in ipairs(ids) do vals[#vals + 1] = { id = id, label = COMPS[id].label } end\n  return { name = \"comp\", values = vals }\nend\n\nlocal function voicesText(ctx, c)\n  if ctx.ensemble then return \"spread one voice to each part of the \" .. ctx.ensemble.name:lower() end\n  if ctx.inst.poly == 1 then return \"the \" .. ctx.inst.name .. \"'s own voice of a four-part chorale\" end\n  return (c.voices or 4) .. \" voices\"\nend\n\nTYPES.Triadic = {\n  harmony = true,\n  params = function(ctx)\n    return harmonyParams(ctx, { compDim({ \"held\", \"half\", \"quarter\", \"stabs\", \"charleston\" }) }, function(c)\n      return (\"Chords stacked in thirds, %s, voice-led: common tones held, every voice moving \"\n        .. \"as little as it can, no parallel fifths or octaves. Played %s.\"):format(voicesText(ctx, c), c.comp.label)\n    end)\n  end,\n  build = function(ctx, p, hv)\n    local v = lead(ctx, slotChords(ctx, ctx.slots), hv.ranges, { bassRoot = true })\n    if not v then return nil, \"with no voicing that fits\" end\n    return comp(ctx, ctx.slots, v, p.comp.id)\n  end,\n}\n\n-- Stacked fourths sit close, like clusters, so their voices share the band\n-- rather than each keeping to a range of its own.\nTYPES.Quartal = {\n  harmony = true, uniform = true,\n  params = function(ctx)\n    return harmonyParams(ctx, {\n      { name = \"motion\", values = { { id = \"planing\", label = \"planing\" }, { id = \"led\", label = \"voice-led\" } } },\n      compDim({ \"held\", \"half\", \"stabs\" }),\n    }, function(c)\n      return (\"Chords stacked in fourths from the scale, %s, %s. Played %s.\")\n        :format(voicesText(ctx, c),\n          c.motion.id == \"planing\" and \"the whole shape sliding up and down the scale in parallel\"\n            or \"each voice moving to the nearest note of the next stack\", c.comp.label)\n    end)\n  end,\n  build = function(ctx, p, hv)\n    local kind = (hv.nv >= 4) and \"quartal4\" or \"quartal\"\n    local chords = slotChords(ctx, ctx.slots, kind)\n    local opts = { bassRoot = true, adjacent = { [5] = true, [6] = true, [7] = true }, noParallels = false }\n    local v\n    if p.motion.id == \"planing\" then\n      local first = lead(ctx, { chords[1] }, hv.ranges, opts)\n      if not first then return nil, \"with no voicing that fits\" end\n      v = T.plane(ctx.key, first[1], chords)\n      for _, V in ipairs(v) do\n        for k, pch in ipairs(V) do\n          if pch < hv.ranges[k][1] - 5 or pch > hv.ranges[k][2] + 5 then return nil, \"with planing that runs out of range\" end\n        end\n      end\n    else\n      v = lead(ctx, chords, hv.ranges, opts)\n      if not v then return nil, \"with no voicing that fits\" end\n    end\n    return comp(ctx, ctx.slots, v, p.comp.id)\n  end,\n}\n\nTYPES.Cluster = {\n  harmony = true, uniform = true,\n  params = function(ctx)\n    return harmonyParams(ctx, { compDim({ \"held\", \"half\", \"quarter\" }) }, function(c)\n      return (\"Neighbouring scale notes sounded together, %s, each cluster moving to the nearest \"\n        .. \"one on the next chord. Played %s.\"):format(voicesText(ctx, c), c.comp.label)\n    end)\n  end,\n  build = function(ctx, p, hv)\n    local kind = (hv.nv >= 4) and \"cluster4\" or \"cluster\"\n    local opts = { bassRoot = false, adjacent = { [1] = true, [2] = true, [3] = true }, noParallels = false }\n    local v = lead(ctx, slotChords(ctx, ctx.slots, kind), hv.ranges, opts)\n    if not v then return nil, \"with no voicing that fits\" end\n    return comp(ctx, ctx.slots, v, p.comp.id)\n  end,\n}\n\nTYPES.Pedal = {\n  harmony = true,\n  params = function(ctx)\n    return harmonyParams(ctx, {\n      { name = \"note\", values = { { id = \"tonic\", label = \"tonic pedal\" }, { id = \"dominant\", label = \"dominant pedal\" } } },\n      { name = \"where\", values = { { id = \"bass\", label = \"in the bass\" }, { id = \"top\", label = \"on top\" } } },\n      { name = \"pulse\", values = { { id = \"held\", label = \"held\" }, { id = \"8ths\", label = \"repeated 1/8\" },\n                                   { id = \"4ths\", label = \"repeated 1/4\" } } },\n    }, function(c)\n      local part = \"\"\n      if not ctx.ensemble and ctx.inst.poly == 1 then\n        part = \" The \" .. ctx.inst.name .. \" plays whichever line of it is its own: the pedal, \"\n          .. \"or its voice of the chords moving against it.\"\n      end\n      return (\"One note held %s \u00e2\u0080\u0094 the %s \u00e2\u0080\u0094 while the chords change %s it, voice-led. The pedal is %s.%s\")\n        :format(c.where.id == \"bass\" and \"in the bass\" or \"on top\", c.note.id,\n                c.where.id == \"bass\" and \"above\" or \"under\", c.pulse.label, part)\n    end)\n  end,\n  build = function(ctx, p, hv)\n    local nv = hv.nv\n    local pc = T.rootPc(ctx.key)\n    if p.note.id == \"dominant\" then pc = (pc + 7) % 12 end\n    local idx = (p.where.id == \"bass\") and 1 or nv\n    local r = hv.ranges[idx]\n    local mid = (p.where.id == \"bass\") and (r[1] + 4) or (r[2] - 4)\n    local pedal\n    for q = r[1] - 6, r[2] + 6 do\n      if q % 12 == pc and (not pedal or math.abs(q - mid) < math.abs(pedal - mid)) then pedal = q end\n    end\n    local opts = { bassRoot = true }\n    if p.where.id == \"bass\" then opts.fixedBass = pedal else opts.fixedTop = pedal end\n    local v = lead(ctx, slotChords(ctx, ctx.slots), hv.ranges, opts)\n    if not v then return nil, \"with no voicing that fits over the pedal\" end\n    local voices = comp(ctx, ctx.slots, v, \"held\", idx)\n    local line = {}\n    if p.pulse.id == \"held\" then\n      add(line, 0, ctx.L * 0.99, pedal, true, idx)\n    else\n      local step = (p.pulse.id == \"8ths\") and 0.5 or 1\n      local count = math.floor(ctx.L / step + EPS)\n      for i = 0, count - 1 do\n        local t = i * step\n        add(line, t, step * 0.8, pedal, math.abs(t - math.floor(t + 0.5)) < EPS and (t % 2 < EPS), idx)\n      end\n    end\n    voices[idx] = line\n    return voices\n  end,\n}\n\nlocal ARPEGGIATED = {\n  { id = \"rolled\",  label = \"rolled\", hint = \"Each chord rolled from the bottom up, a thirty-second apart, and held.\" },\n  { id = \"stagger8\", label = \"staggered 1/8\", step = 0.5, stagger = true,\n    hint = \"The voices come in one by one from the bottom, an eighth apart, and hold.\" },\n  { id = \"stagger4\", label = \"staggered 1/4\", step = 1, stagger = true,\n    hint = \"The voices come in one by one from the bottom, a quarter apart, and hold.\" },\n  { id = \"rise8\",   label = \"rising 1/8\",  step = 0.5, pattern = \"rise\",\n    hint = \"The voice-led chord broken from the bottom voice to the top, over and over, in eighths.\" },\n  { id = \"rise16\",  label = \"rising 1/16\", step = 0.25, pattern = \"rise\",\n    hint = \"The voice-led chord broken from the bottom voice to the top, over and over, in sixteenths.\" },\n  { id = \"wave8\",   label = \"rise & fall 1/8\", step = 0.5, pattern = \"wave\",\n    hint = \"Up through the voices and back down, in eighths.\" },\n  { id = \"wave16\",  label = \"rise & fall 1/16\", step = 0.25, pattern = \"wave\",\n    hint = \"Up through the voices and back down, in sixteenths.\" },\n}\n\nTYPES.Arpeggiated = {\n  harmony = true,\n  params = function(ctx)\n    local vals = {}\n    for _, a in ipairs(ARPEGGIATED) do vals[#vals + 1] = a end\n    return harmonyParams(ctx, { { name = \"arp\", values = vals } }, function(c)\n      return c.arp.hint .. \" The chords are \" .. voicesText(ctx, c) .. \", voice-led.\"\n    end)\n  end,\n  build = function(ctx, p, hv)\n    local v = lead(ctx, slotChords(ctx, ctx.slots), hv.ranges, { bassRoot = true })\n    if not v then return nil, \"with no voicing that fits\" end\n    local nv = hv.nv\n    local voices = {}\n    for k = 1, nv do voices[k] = {} end\n    local a = p.arp\n    for i, slot in ipairs(ctx.slots) do\n      local V = v[i]\n      local e = slot.start + slot.len\n      if a.id == \"rolled\" or a.stagger then\n        local gap = a.stagger and a.step or 0.125\n        for k = 1, nv do\n          local t = slot.start + (k - 1) * gap\n          if t < e - EPS then add(voices[k], t, (e - t) * 0.97, V[k], k == 1, k) end\n        end\n      else\n        local order = {}\n        for k = 1, nv do order[#order + 1] = k end\n        if a.pattern == \"wave\" then for k = nv - 1, 2, -1 do order[#order + 1] = k end end\n        local count = math.floor(slot.len / a.step + EPS)\n        for j = 0, count - 1 do\n          local k = order[(j % #order) + 1]\n          add(voices[k], slot.start + j * a.step, a.step * 0.9, V[k], j % #order == 0, k)\n        end\n      end\n    end\n    return voices\n  end,\n}\n\nTYPES[\"Contrary motion\"] = {\n  harmony = true,\n  params = function(ctx)\n    return harmonyParams(ctx, {\n      { name = \"dir\", values = { { id = \"up\", label = \"top rises, bass falls\" }, { id = \"down\", label = \"top falls, bass rises\" } } },\n      compDim({ \"held\", \"half\", \"quarter\" }),\n    }, function(c)\n      return (\"The outer voices move in opposite directions \u00e2\u0080\u0094 the %s \u00e2\u0080\u0094 using inversions where they \"\n        .. \"need them, %s. Played %s.\"):format(c.dir.label, voicesText(ctx, c), c.comp.label)\n    end)\n  end,\n  build = function(ctx, p, hv)\n    -- A single chord has nowhere to move, so the block steps through it\n    -- in four, the outer voices opening or closing through its inversions.\n    local slots = {}\n    local per = math.max(1, math.ceil(4 / #ctx.slots))\n    for _, s in ipairs(ctx.slots) do\n      for j = 0, per - 1 do\n        slots[#slots + 1] = { i = #slots + 1, start = s.start + j * s.len / per, len = s.len / per,\n                              degree = s.degree, chord = s.chord, key = s.key }\n      end\n    end\n    local opts = { bassRoot = false, contrary = (p.dir.id == \"up\") and 1 or -1 }\n    local v = lead(ctx, slotChords(ctx, slots), hv.ranges, opts)\n    if not v then return nil, \"with no voicing that fits\" end\n    return comp(ctx, slots, v, p.comp.id)\n  end,\n}\n\n------------------------------------------------------------------------------\n-- Checks\n--\n-- What a player would refuse. Each returns a reason, or nil.\n------------------------------------------------------------------------------\n\nlocal function sortNotes(list)\n  table.sort(list, function(a, b)\n    if math.abs(a.start - b.start) > EPS then return a.start < b.start end\n    return a.pitch < b.pitch\n  end)\n  return list\nend\n\n-- A melodic instrument plays one note at a time: nothing overlaps, and two\n-- notes at once become the higher.\nlocal function monophonic(list)\n  sortNotes(list)\n  local out = {}\n  for _, n in ipairs(list) do\n    local prev = out[#out]\n    if prev and math.abs(prev.start - n.start) < EPS then\n      if n.pitch > prev.pitch then out[#out] = n end\n    else\n      if prev and prev.start + prev.len > n.start - EPS then prev.len = math.max(0.03, n.start - prev.start - 0.01) end\n      out[#out + 1] = n\n    end\n  end\n  return out\nend\n\n-- Wind and brass breathe. Every two bars, a note sounding across the bar line\n-- stops a sixteenth short of it and, if it was held across and still fits the\n-- chord, comes back in after; a short note in the way of the breath is left\n-- out.\nfunction M.breathe(ctx, list, L)\n  L = L or ctx.L\n  local phrase = 2 * ctx.barBeats\n  local k = 1\n  while k * phrase < L - EPS do\n    local B = k * phrase\n    local out = {}\n    for _, n in ipairs(list) do\n      local e = n.start + n.len\n      if n.start < B - EPS and e > B - 0.25 + EPS then\n        local cut = B - 0.25\n        if cut - n.start >= 0.125 - EPS then\n          out[#out + 1] = { start = n.start, len = cut - n.start, pitch = n.pitch, accent = n.accent,\n                            voice = n.voice, ct = n.ct }\n        end\n        -- The note comes back after the breath only if it belongs to the\n        -- chord there; otherwise the breath simply lasts until the next note.\n        if e > B + 0.25 + EPS and T.hasPc(M.slotAt(ctx, B).chord, n.pitch % 12) then\n          out[#out + 1] = { start = B, len = e - B, pitch = n.pitch, accent = n.accent, voice = n.voice, ct = n.ct }\n        end\n      else\n        out[#out + 1] = n\n      end\n    end\n    list = out\n    k = k + 1\n  end\n  return sortNotes(list)\nend\n\n-- Shifts a part by whole octaves into its instrument, as near the middle of\n-- the band as it will go. Nil if no octave holds it all. `keep` leaves a part\n-- that already fits where it is - a voice of an ensemble, or a transformed\n-- entry, has its register for a reason.\nlocal function fitPart(list, inst, centre, keep)\n  if #list == 0 then return list end\n  local lo, hi, sum = 999, -1, 0\n  for _, n in ipairs(list) do lo, hi, sum = math.min(lo, n.pitch), math.max(hi, n.pitch), sum + n.pitch end\n  if keep and lo >= inst.low and hi <= inst.high then return list end\n  local mean = sum / #list\n  -- Shifts are tried nearest first, and one has to be clearly better to win:\n  -- material that sits as well where it was written stays there.\n  local best, bestD\n  for _, k in ipairs({ 0, -1, 1, -2, 2, -3, 3, -4, 4 }) do\n    local s = 12 * k\n    if lo + s >= inst.low and hi + s <= inst.high then\n      local d = math.abs(mean + s - centre)\n      if not bestD or d < bestD - 1 then best, bestD = s, d end\n    end\n  end\n  if not best then return nil end\n  if best ~= 0 then for _, n in ipairs(list) do n.pitch = n.pitch + best end end\n  return list\nend\n\n-- The shortest gap between two onsets in the same voice.\nlocal function shortestGap(list)\n  local byVoice = {}\n  for _, n in ipairs(list) do\n    local v = n.voice or 0\n    byVoice[v] = byVoice[v] or {}\n    local t = byVoice[v]\n    t[#t + 1] = n.start\n  end\n  local best = math.huge\n  for _, times in pairs(byVoice) do\n    table.sort(times)\n    for i = 2, #times do\n      local d = times[i] - times[i - 1]\n      if d > EPS and d < best then best = d end\n    end\n  end\n  return best\nend\nM.shortestGap = shortestGap\n\nlocal function tooQuick(ctx, inst, list)\n  return shortestGap(list) < M.fastBeats(ctx, inst) - 1e-4\nend\n\nfunction M.fastBeats(ctx, inst) return O.fastBeats(inst, ctx.bpm) end\n\n-- The widest leap between two notes less than a beat apart.\nlocal function widestQuickLeap(list)\n  local w = 0\n  for i = 2, #list do\n    if list[i].start - list[i - 1].start < 1 - EPS then\n      w = math.max(w, math.abs(list[i].pitch - list[i - 1].pitch))\n    end\n  end\n  return w\nend\nM.widestQuickLeap = widestQuickLeap\n\n------------------------------------------------------------------------------\n-- Making an entry\n------------------------------------------------------------------------------\n\nlocal function markChordTones(ctx, list)\n  for _, n in ipairs(list) do\n    n.ct = T.hasPc(M.slotAt(ctx, n.start).chord, n.pitch % 12)\n  end\nend\n\n-- One entry: the parts it makes, or nil and why not.\n-- A part is { name, inst, notes }.\nfunction M.make(ctx, typeName, p)\n  local typ = TYPES[typeName]\n  local inst = ctx.inst\n  local parts = {}\n\n  if typ.harmony then\n    local hv = harmonySetup(ctx, p, typ.uniform)\n    local voices, why = typ.build(ctx, p, hv)\n    if not voices then return nil, why end\n    if hv.mode == \"ensemble\" then\n      for _, part in ipairs(ctx.ensemble.parts) do\n        local pi = O.byId(part.inst)\n        local list = {}\n        for _, n in ipairs(voices[part.voice] or {}) do\n          list[#list + 1] = { start = n.start, len = n.len, pitch = n.pitch + 12 * (part.octave or 0),\n                              accent = n.accent }\n        end\n        local _, _, c = O.partBand(part, ctx.register)\n        list = fitPart(monophonic(list), pi, c + 12 * (part.octave or 0), true)\n        if not list then return nil, \"outside the \" .. part.name .. \"\u00e2\u0080\u0099s range\" end\n        parts[#parts + 1] = { name = part.name, inst = pi, notes = list }\n      end\n    elseif hv.mode == \"mono\" then\n      local list = {}\n      for _, n in ipairs(voices[hv.take] or {}) do list[#list + 1] = n end\n      parts[1] = { name = inst.name, inst = inst, notes = monophonic(list) }\n    else\n      local list = {}\n      for _, vl in ipairs(voices) do for _, n in ipairs(vl) do list[#list + 1] = n end end\n      parts[1] = { name = inst.name, inst = inst, notes = sortNotes(list) }\n    end\n  else\n    local list, why = typ.build(ctx, p)\n    if not list then return nil, why end\n    if inst.poly == 1 then list = monophonic(list) else sortNotes(list) end\n    local fitted = fitPart(list, inst, ctx.centre)\n    if not fitted then return nil, \"outside the \" .. inst.name .. \"\u00e2\u0080\u0099s range\" end\n    parts[1] = { name = inst.name, inst = inst, notes = fitted }\n  end\n\n  local total = 0\n  for _, part in ipairs(parts) do\n    local pi = part.inst\n    if #part.notes == 0 then return nil, \"with nothing to play on these chords\" end\n    for _, n in ipairs(part.notes) do\n      if n.pitch < pi.low or n.pitch > pi.high then\n        return nil, \"outside the \" .. part.name .. \"\u00e2\u0080\u0099s range\"\n      end\n    end\n    if pi.breath then part.notes = M.breathe(ctx, part.notes) end\n    if tooQuick(ctx, pi, part.notes) then\n      return nil, (\"too quick for the %s at %d bpm\"):format(part.name, math.floor(ctx.bpm + 0.5))\n    end\n    if pi.poly == 1 and widestQuickLeap(part.notes) > pi.leap then\n      return nil, \"with leaps wider than the \" .. part.name .. \" takes in passing\"\n    end\n    markChordTones(ctx, part.notes)\n    total = total + #part.notes\n  end\n  if total > M.MAX_NOTES then return nil, \"with more notes than one entry can hold\" end\n  return parts\nend\n\n-- How many notes start in each beat, counting a chord as one.\nfunction M.density(parts, beats)\n  local starts = {}\n  for _, part in ipairs(parts) do\n    for _, n in ipairs(part.notes) do starts[math.floor(n.start * 1000 + 0.5)] = true end\n  end\n  local c = 0\n  for _ in pairs(starts) do c = c + 1 end\n  return c / math.max(beats, EPS)\nend\n\nfunction M.densityBand(d)\n  if d < M.SPARSE_BELOW then return \"Sparse\" end\n  if d >= M.BUSY_FROM then return \"Busy\" end\n  return \"Medium\"\nend\n\nlocal function signature(parts)\n  local out = {}\n  for _, part in ipairs(parts) do\n    for _, n in ipairs(part.notes) do\n      out[#out + 1] = (\"%s:%.3f:%.3f:%d\"):format(part.name, n.start, n.len, n.pitch)\n    end\n  end\n  return table.concat(out, \";\")\nend\n\n-- The catalogue for one type: every combination, made and checked. Entries\n-- that come out identical to an earlier one are the same entry and are\n-- listed once. Returns { entries, hidden }, where hidden is a list of\n-- { reason, count }, most common first.\nfunction M.catalogue(ctx, typeName)\n  local typ = TYPES[typeName]\n  local out = { entries = {}, hidden = {}, avoided = nil }\n  if not typ then return out end\n  if not ctx.ensemble then\n    local why = O.avoids(ctx.inst, M.categoryOf(typeName), typeName)\n    if why then out.avoided = why; return out end\n  end\n  local reasons, seen = {}, {}\n  for _, p in ipairs(typ.params(ctx)) do\n    local parts, why = M.make(ctx, typeName, p)\n    if parts then\n      local sig = signature(parts)\n      if not seen[sig] then\n        seen[sig] = true\n        local d = M.density(parts, ctx.L)\n        out.entries[#out.entries + 1] = { id = p.id, label = p.label, hint = p.hint, parts = parts,\n                                          density = d, band = M.densityBand(d), type = typeName }\n      end\n    else\n      reasons[why] = (reasons[why] or 0) + 1\n    end\n  end\n  for r, c in pairs(reasons) do out.hidden[#out.hidden + 1] = { reason = r, count = c } end\n  table.sort(out.hidden, function(a, b)\n    if a.count ~= b.count then return a.count > b.count end\n    return a.reason < b.reason\n  end)\n  return out\nend\n\n------------------------------------------------------------------------------\n-- Shaping an entry\n------------------------------------------------------------------------------\n\nlocal function copyParts(parts)\n  local out = {}\n  for i, part in ipairs(parts) do\n    local notes = {}\n    for k, n in ipairs(part.notes) do\n      notes[k] = { start = n.start, len = n.len, pitch = n.pitch, accent = n.accent, voice = n.voice, ct = n.ct }\n    end\n    out[i] = { name = part.name, inst = part.inst, notes = notes }\n  end\n  return out\nend\n\n-- The transformations keep the harmony: a note that was a chord tone lands\n-- on a chord tone of whatever chord is under it afterwards. Inversion mirrors\n-- the music diatonically about its first note (or, for more than one voice,\n-- about the middle of it); retrograde plays it backwards. Augmentation and\n-- diminution stretch the chords with it, so nothing needs refitting: it is\n-- the same music at half or double speed.\n--\n-- Returns the parts, how many beats they now last, and a warning or nil.\nfunction M.transform(ctx, parts, kind)\n  parts = copyParts(parts)\n  local L = ctx.L\n  if kind == \"Original\" or not kind then return parts, L end\n\n  if kind == \"Augmentation\" or kind == \"Diminution\" then\n    local f = (kind == \"Augmentation\") and 2 or 0.5\n    for _, part in ipairs(parts) do\n      for _, n in ipairs(part.notes) do n.start, n.len = n.start * f, n.len * f end\n    end\n    L = L * f\n  else\n    local invert = (kind == \"Inversion\" or kind == \"Retrograde inversion\")\n    local retro  = (kind == \"Retrograde\" or kind == \"Retrograde inversion\")\n    local axis\n    if invert then\n      local all = {}\n      for _, part in ipairs(parts) do for _, n in ipairs(part.notes) do all[#all + 1] = n end end\n      if #parts == 1 and parts[1].inst.poly == 1 and #all > 0 then\n        axis = T.nearestPos(keyAt(ctx, all[1].start), all[1].pitch)\n      else\n        local sum = 0\n        for _, n in ipairs(all) do sum = sum + T.nearestPos(keyAt(ctx, n.start), n.pitch) end\n        axis = math.floor(sum / math.max(1, #all) + 0.5)\n      end\n    end\n    for _, part in ipairs(parts) do\n      for _, n in ipairs(part.notes) do\n        n.origPitch = n.pitch\n        -- A position is read in the scale under the note where it was, and\n        -- turned back into a pitch in the scale under it where it lands.\n        local pos = T.nearestPos(keyAt(ctx, n.start), n.pitch)\n        if invert then pos = 2 * axis - pos end\n        if retro then n.start = L - n.start - n.len end\n        if n.ct then\n          local lean = invert and -1 or 1\n          pos = M.nearestChordPos(ctx, M.slotAt(ctx, n.start).chord, pos, lean)\n        end\n        n.pitch = T.pitch(keyAt(ctx, n.start), pos)\n        if ctx.drums then\n          -- On the timpani an inversion swaps the two drums, and whatever\n          -- lands under a chord that lacks it takes that chord's own drum.\n          local d = ctx.drums\n          local orig = (math.abs(n.pitch - d.tonic) <= math.abs(n.pitch - d.dominant)) and d.tonic or d.dominant\n          local cand = orig\n          if invert then cand = (n.origPitch == d.tonic) and d.dominant or d.tonic end\n          local main = slotDrum(ctx, M.slotAt(ctx, n.start))\n          if n.ct and main and not T.hasPc(M.slotAt(ctx, n.start).chord, cand % 12) then cand = main end\n          n.pitch = cand\n        end\n      end\n      -- Two voices mirrored onto the same note at the same time are one note.\n      local seen, kept = {}, {}\n      for _, n in ipairs(sortNotes(part.notes)) do\n        local k = (\"%.4f:%d\"):format(n.start, n.pitch)\n        if not seen[k] then seen[k] = true; kept[#kept + 1] = n end\n      end\n      part.notes = kept\n      local _, _, c = O.band(part.inst, ctx.register)\n      part.notes = fitPart(part.notes, part.inst, c, true) or part.notes\n      if part.inst.poly == 1 then part.notes = monophonic(part.notes) end\n    end\n  end\n\n  local warning\n  for _, part in ipairs(parts) do\n    if tooQuick(ctx, part.inst, part.notes) then\n      warning = (\"Faster than the %s plays cleanly at %d bpm. Try a slower tempo.\"):format(part.name, math.floor(ctx.bpm + 0.5))\n    end\n  end\n  return parts, L, warning\nend\n\n-- Plays the parts `times` times over.\nfunction M.repeatParts(parts, beats, times)\n  if times <= 1 then return parts end\n  local out = {}\n  for i, part in ipairs(parts) do\n    local notes = {}\n    for k = 0, times - 1 do\n      for _, n in ipairs(part.notes) do\n        notes[#notes + 1] = { start = n.start + k * beats, len = n.len, pitch = n.pitch,\n                              accent = n.accent, voice = n.voice, ct = n.ct }\n      end\n    end\n    out[i] = { name = part.name, inst = part.inst, notes = notes }\n  end\n  return out\nend\n\n-- Velocity: 100 for everything, unless accents are asked for.\nfunction M.applyVelocity(parts, mode)\n  for _, part in ipairs(parts) do\n    for _, n in ipairs(part.notes) do\n      n.vel = (mode == \"Accents\" and n.accent) and M.ACCENT or M.VELOCITY\n    end\n  end\n  return parts\nend\n\n------------------------------------------------------------------------------\n-- The block\n------------------------------------------------------------------------------\n\nfunction M.blockName(ctx, typeName, entry, transform, times)\n  local who = ctx.ensemble and ctx.ensemble.name or ctx.inst.name\n  local name = (\"%s %s %s %s %s %s\"):format(T.ROOTS[ctx.key.root].name, T.SCALES[ctx.key.scale].name,\n    T.chainName(ctx.key, ctx.chain, true), who, typeName, entry.label)\n  if transform and transform ~= \"Original\" then name = name .. \" \" .. transform:lower() end\n  if times and times > 1 then name = name .. \" x\" .. times end\n  return (name:gsub(\"%s+\", \" \"))\nend\n\n-- The finished thing: an entry shaped and ready to go into the project.\n-- `sel` is { transform, repeats, velocity }.\nfunction M.block(ctx, typeName, entry, sel)\n  sel = sel or {}\n  local parts, beats, warning = M.transform(ctx, entry.parts, sel.transform)\n  local times = sel.repeats or 1\n  parts = M.repeatParts(parts, beats, times)\n  M.applyVelocity(parts, sel.velocity)\n  local notes = {}\n  for pi, part in ipairs(parts) do\n    for _, n in ipairs(part.notes) do\n      notes[#notes + 1] = { start = n.start, len = n.len, pitch = n.pitch, vel = n.vel, part = pi }\n    end\n  end\n  sortNotes(notes)\n  return {\n    name = M.blockName(ctx, typeName, entry, sel.transform, times),\n    beats = beats * times,\n    parts = parts,\n    notes = notes,\n    warning = warning,\n  }\nend\n\nreturn M\n", "midi-catalogue/mc_orchestra.lua": "--[[ Midi Catalogue - the orchestra.\n\n     Pure data plus a few questions asked of it. No REAPER, no ImGui.\n\n     What makes a line idiomatic for an instrument, as far as the catalogue\n     needs to know:\n\n       low, high    the practical orchestral range, as sounding MIDI pitches\n       sweet        the register where it sounds like itself; the catalogue\n                    writes inside this and only leaves it for a reason\n       role         which voice of four-part harmony it naturally takes:\n                    S, A, T or B (Violins I sing soprano, Violins II\n                    mezzo-soprano, and so on down)\n       poly         how many notes it can sound at once. A string SECTION\n                    plays one line - divisi is an orchestration decision, and\n                    that is what the ensembles below are for\n       fast         the shortest time between two notes it plays cleanly, in\n                    seconds, so a 1/16 run that is fine at 90 bpm is hidden\n                    at 160 bpm\n       leap         the widest melodic leap, in semitones, it takes happily in\n                    passing\n       breath       wind and brass: phrases leave room to breathe\n       pitches      \"td\" for an instrument tuned to a few notes before it plays\n                    - the timpani get the tonic and the dominant\n       avoid        categories or types it does not do, each with the reason\n                    the window shows\n\n     Ranges are the ones standard orchestration texts give (Rimsky-Korsakov,\n     Adler, Piston). Where Orchestration Helper states one it is used as it\n     stands: the timpani's E2 to G#3 and the harp's C-flat 1 to F-sharp 7. The\n     character notes behind `sweet` are Orchestration Helper's: the flute\n     dull low and brilliant high, the oboe wild and rough at the bottom, the\n     E string thinning as it climbs.\n]]\n\nlocal M = {}\n\nM.FAMILIES = { \"Strings\", \"Woodwind\", \"Brass\", \"Percussion\", \"Keys & Harp\" }\n\nlocal TWO_MALLETS = {\n  Quartal = \"A quartal chord here is three or four notes at once; with two mallets this instrument plays two\",\n  Cluster = \"A cluster here is three or four notes at once; with two mallets this instrument plays two\",\n  Pedal   = \"A pedal under moving chords needs three notes at once; with two mallets this instrument plays two\",\n}\n\nM.INSTRUMENTS = {\n  -- Strings\n  { id = \"vln1\", name = \"Violin I\",  family = \"Strings\", low = 55, high = 100,\n    sweet = { 67, 91 }, role = \"S\", poly = 1, fast = 0.09, leap = 12 },\n  { id = \"vln2\", name = \"Violin II\", family = \"Strings\", low = 55, high = 96,\n    sweet = { 60, 84 }, role = \"A\", poly = 1, fast = 0.09, leap = 12 },\n  { id = \"vla\",  name = \"Viola\",     family = \"Strings\", low = 48, high = 88,\n    sweet = { 52, 76 }, role = \"T\", poly = 1, fast = 0.1, leap = 12 },\n  { id = \"vc\",   name = \"Cello\",     family = \"Strings\", low = 36, high = 81,\n    sweet = { 40, 67 }, role = \"B\", poly = 1, fast = 0.1, leap = 12 },\n  { id = \"cb\",   name = \"Double Bass\", family = \"Strings\", low = 28, high = 60,\n    sweet = { 28, 50 }, role = \"B\", poly = 1, fast = 0.18, leap = 9 },\n\n  -- Woodwind\n  { id = \"picc\", name = \"Piccolo\",   family = \"Woodwind\", low = 74, high = 108,\n    sweet = { 79, 100 }, role = \"S\", poly = 1, fast = 0.09, leap = 12, breath = true },\n  { id = \"fl\",   name = \"Flute\",     family = \"Woodwind\", low = 60, high = 96,\n    sweet = { 67, 91 }, role = \"S\", poly = 1, fast = 0.09, leap = 12, breath = true },\n  { id = \"ob\",   name = \"Oboe\",      family = \"Woodwind\", low = 58, high = 91,\n    sweet = { 62, 84 }, role = \"S\", poly = 1, fast = 0.11, leap = 10, breath = true },\n  { id = \"eh\",   name = \"English Horn\", family = \"Woodwind\", low = 52, high = 81,\n    sweet = { 55, 74 }, role = \"A\", poly = 1, fast = 0.12, leap = 10, breath = true },\n  { id = \"cl\",   name = \"Clarinet\",  family = \"Woodwind\", low = 50, high = 91,\n    sweet = { 55, 84 }, role = \"A\", poly = 1, fast = 0.09, leap = 12, breath = true },\n  { id = \"bcl\",  name = \"Bass Clarinet\", family = \"Woodwind\", low = 38, high = 74,\n    sweet = { 40, 65 }, role = \"B\", poly = 1, fast = 0.12, leap = 12, breath = true },\n  { id = \"bsn\",  name = \"Bassoon\",   family = \"Woodwind\", low = 34, high = 76,\n    sweet = { 38, 67 }, role = \"B\", poly = 1, fast = 0.11, leap = 12, breath = true },\n  { id = \"cbsn\", name = \"Contrabassoon\", family = \"Woodwind\", low = 22, high = 53,\n    sweet = { 26, 48 }, role = \"B\", poly = 1, fast = 0.25, leap = 9, breath = true },\n\n  -- Brass\n  { id = \"hn\",   name = \"Horn\",      family = \"Brass\", low = 35, high = 77,\n    sweet = { 48, 72 }, role = \"A\", poly = 1, fast = 0.14, leap = 9, breath = true },\n  { id = \"tpt\",  name = \"Trumpet\",   family = \"Brass\", low = 52, high = 82,\n    sweet = { 60, 79 }, role = \"S\", poly = 1, fast = 0.1, leap = 9, breath = true },\n  { id = \"tbn\",  name = \"Trombone\",  family = \"Brass\", low = 40, high = 72,\n    sweet = { 45, 67 }, role = \"T\", poly = 1, fast = 0.17, leap = 7, breath = true },\n  { id = \"btbn\", name = \"Bass Trombone\", family = \"Brass\", low = 34, high = 65,\n    sweet = { 36, 60 }, role = \"B\", poly = 1, fast = 0.2, leap = 7, breath = true },\n  { id = \"tuba\", name = \"Tuba\",      family = \"Brass\", low = 28, high = 58,\n    sweet = { 31, 53 }, role = \"B\", poly = 1, fast = 0.2, leap = 7, breath = true },\n\n  -- Percussion. Only the pitched ones: a drum kit is Starting Blocks' job.\n  { id = \"timp\", name = \"Timpani\",   family = \"Percussion\", low = 40, high = 56,\n    sweet = { 40, 56 }, role = \"B\", poly = 2, fast = 0.09, leap = 12, pitches = \"td\",\n    avoid = {\n      Melody  = \"Timpani are tuned before they play, to a few notes, so a melody is not theirs to play\",\n      Harmony = \"Timpani are tuned to the tonic and the dominant; they hold the bass of the harmony, not its voices\",\n      Arpeggio = \"An arpeggio needs more notes than the timpani are tuned to\",\n      Alberti  = \"An Alberti figure needs three notes; the timpani have two\",\n      [\"Broken chord\"] = \"A broken chord needs more notes than the timpani are tuned to\",\n    } },\n  { id = \"glock\", name = \"Glockenspiel\", family = \"Percussion\", low = 79, high = 108,\n    sweet = { 79, 103 }, role = \"S\", poly = 2, fast = 0.13, leap = 12,\n    avoid = TWO_MALLETS },\n  { id = \"xyl\",  name = \"Xylophone\", family = \"Percussion\", low = 65, high = 108,\n    sweet = { 67, 100 }, role = \"S\", poly = 2, fast = 0.09, leap = 12,\n    avoid = TWO_MALLETS },\n  { id = \"mar\",  name = \"Marimba\",   family = \"Percussion\", low = 45, high = 96,\n    sweet = { 48, 88 }, role = \"A\", poly = 4, fast = 0.09, leap = 12 },\n\n  -- Keys and harp\n  { id = \"harp\", name = \"Harp\",      family = \"Keys & Harp\", low = 23, high = 102,\n    sweet = { 36, 84 }, role = \"A\", poly = 4, fast = 0.11, leap = 12 },\n  { id = \"cel\",  name = \"Celesta\",   family = \"Keys & Harp\", low = 60, high = 108,\n    sweet = { 67, 96 }, role = \"S\", poly = 4, fast = 0.09, leap = 12 },\n  { id = \"pno\",  name = \"Piano\",     family = \"Keys & Harp\", low = 21, high = 108,\n    sweet = { 43, 84 }, role = \"A\", poly = 6, fast = 0.07, leap = 12 },\n}\n\n-- Sections, for spreading harmony across real parts. Each part takes one\n-- voice (1 is the bass), and `octave` moves it after voicing - the double\n-- bass doubles the cellos an octave down, as Rimsky-Korsakov has it.\n--\n-- The four horns follow the convention Orchestration Helper records: horns 1\n-- and 3 take the high parts, 2 and 4 the low, 1 the highest and 4 the lowest.\nM.ENSEMBLES = {\n  { id = \"strings\", name = \"Strings\", parts = {\n      { inst = \"vln1\", voice = 4, name = \"Violin I\" },\n      { inst = \"vln2\", voice = 3, name = \"Violin II\" },\n      { inst = \"vla\",  voice = 2, name = \"Viola\" },\n      { inst = \"vc\",   voice = 1, name = \"Cello\" },\n      { inst = \"cb\",   voice = 1, name = \"Double Bass\", octave = -1 },\n  } },\n  { id = \"winds\", name = \"Woodwinds\", parts = {\n      { inst = \"fl\",  voice = 4, name = \"Flute\" },\n      { inst = \"ob\",  voice = 3, name = \"Oboe\" },\n      { inst = \"cl\",  voice = 2, name = \"Clarinet\" },\n      { inst = \"bsn\", voice = 1, name = \"Bassoon\" },\n  } },\n  { id = \"brass\", name = \"Brass\", parts = {\n      { inst = \"tpt\",  voice = 4, name = \"Trumpet\" },\n      { inst = \"hn\",   voice = 3, name = \"Horn\" },\n      { inst = \"tbn\",  voice = 2, name = \"Trombone\" },\n      { inst = \"tuba\", voice = 1, name = \"Tuba\" },\n  } },\n  -- A part may carry its own `sweet`, where one instrument plays several\n  -- parts at different heights: the high horns are uncomfortable on the\n  -- bottom notes and the low horns on the top ones (Orchestration Helper,\n  -- after Berlioz), so each pair gets its own half of the compass.\n  { id = \"horns\", name = \"Four Horns\", parts = {\n      { inst = \"hn\", voice = 4, name = \"Horn 1\", sweet = { 60, 77 } },\n      { inst = \"hn\", voice = 3, name = \"Horn 3\", sweet = { 55, 72 } },\n      { inst = \"hn\", voice = 2, name = \"Horn 2\", sweet = { 46, 67 } },\n      { inst = \"hn\", voice = 1, name = \"Horn 4\", sweet = { 38, 62 } },\n  } },\n}\n\nfunction M.byId(id)\n  for _, inst in ipairs(M.INSTRUMENTS) do if inst.id == id then return inst end end\n  return nil\nend\n\nfunction M.ensembleById(id)\n  for _, e in ipairs(M.ENSEMBLES) do if e.id == id then return e end end\n  return nil\nend\n\nM.REGISTERS = { \"Low\", \"Middle\", \"High\" }\n\n-- Where in the sweet register the material sits. Each band is two thirds of\n-- it, overlapping, so Middle is not a thin slice and Low still sounds like\n-- the instrument rather than like its bottom note.\nfunction M.band(inst, register)\n  local lo, hi = inst.sweet[1], inst.sweet[2]\n  local span = hi - lo\n  local a, b\n  if register == \"Low\" then a, b = lo, lo + span * 2 / 3\n  elseif register == \"High\" then a, b = lo + span / 3, hi\n  else a, b = lo + span / 6, hi - span / 6 end\n  a, b = math.floor(a + 0.5), math.floor(b + 0.5)\n  return a, b, (a + b) / 2\nend\n\n-- The four voice ranges of plain four-part writing, bass first, then moved as\n-- a block so the voice this instrument takes lands where the instrument is.\n-- A single melodic instrument asked for harmony plays its own voice of a\n-- chorale built this way; the other three are what the rest of the band\n-- would play.\nM.SATB = { { 40, 60 }, { 48, 67 }, { 55, 74 }, { 60, 79 } }\nM.ROLE_VOICE = { B = 1, T = 2, A = 3, S = 4 }\n\nfunction M.satbFor(inst, register)\n  local _, _, centre = M.band(inst, register)\n  local v = M.SATB[M.ROLE_VOICE[inst.role] or 3]\n  local shift = math.floor(centre - (v[1] + v[2]) / 2 + 0.5)\n  local out = {}\n  for i, r in ipairs(M.SATB) do out[i] = { r[1] + shift, r[2] + shift } end\n  return out, M.ROLE_VOICE[inst.role] or 3\nend\n\n-- Voice ranges for an instrument that plays the chords itself, `nv` voices of\n-- them. The bass has the bottom of the band to itself and the upper voices\n-- share the rest, overlapping it a little so close position is possible.\nfunction M.chordRanges(inst, register, nv)\n  local lo, hi = M.band(inst, register)\n  if hi - lo < 14 then\n    -- A narrow instrument stacks its voices in what it has.\n    local out = {}\n    for v = 1, nv do out[v] = { inst.low, inst.high } end\n    return out\n  end\n  local out = { { lo, lo + 12 } }\n  for v = 2, nv do out[v] = { lo + 3, hi } end\n  return out\nend\n\n-- Where a part of a section sits: its own `sweet` if it has one, else its\n-- instrument's.\nfunction M.partBand(part, register)\n  local inst = M.byId(part.inst)\n  if part.sweet then return M.band({ sweet = part.sweet }, register) end\n  return M.band(inst, register)\nend\n\n-- Why this instrument does not do something, or nil if it does.\nfunction M.avoids(inst, category, type_)\n  local a = inst.avoid\n  if not a then return nil end\n  return a[type_] or a[category]\nend\n\n-- The shortest time between notes it manages, as beats at this tempo.\nfunction M.fastBeats(inst, bpm)\n  return inst.fast * (bpm or 120) / 60\nend\n\nreturn M\n", "midi-catalogue/mc_theory.lua": "--[[ Midi Catalogue - keys, chords and voice leading.\n\n     Pure Lua. Nothing in this file touches REAPER or ImGui: the harmony is the\n     part that has to be right, and here it can be run and checked by\n     tests/test_theory.lua rather than only by reading.\n\n     Two ways of naming a note run through the whole engine:\n\n       - a MIDI pitch, 0..127;\n       - a scale position, an integer counting scale notes from the key's root\n         in MIDI octave -1. Position 0 is the root at pitch 0..11, position n\n         (the scale's length) is the root an octave up, and so on.\n\n     Every diatonic move is integer arithmetic on positions - a third above is\n     +2, whatever the scale - and pitches only appear at the edges. Scale\n     degrees are 0-based: degree 0 is the tonic.\n]]\n\nlocal M = {}\n\n------------------------------------------------------------------------------\n-- Keys\n--\n-- ScaleView for REAPER's roots and scales, unchanged, the same tables Starting\n-- Blocks copies, so all three apps agree on what a scale is and what to call\n-- its notes. test_theory.lua asserts they still match. Do not tidy them\n-- independently.\n------------------------------------------------------------------------------\n\nlocal LETTER_PC  = { 0, 2, 4, 5, 7, 9, 11 }        -- C D E F G A B\nlocal LETTERS    = { \"C\", \"D\", \"E\", \"F\", \"G\", \"A\", \"B\" }\nlocal ACCIDENTAL = { [-2] = \"bb\", [-1] = \"b\", [0] = \"\", [1] = \"#\", [2] = \"x\" }\n\nM.ROOTS = {\n  { name = \"C\",  letter = 0, acc =  0 }, { name = \"C#\", letter = 0, acc =  1 },\n  { name = \"Db\", letter = 1, acc = -1 }, { name = \"D\",  letter = 1, acc =  0 },\n  { name = \"D#\", letter = 1, acc =  1 }, { name = \"Eb\", letter = 2, acc = -1 },\n  { name = \"E\",  letter = 2, acc =  0 }, { name = \"F\",  letter = 3, acc =  0 },\n  { name = \"F#\", letter = 3, acc =  1 }, { name = \"Gb\", letter = 4, acc = -1 },\n  { name = \"G\",  letter = 4, acc =  0 }, { name = \"G#\", letter = 4, acc =  1 },\n  { name = \"Ab\", letter = 5, acc = -1 }, { name = \"A\",  letter = 5, acc =  0 },\n  { name = \"A#\", letter = 5, acc =  1 }, { name = \"Bb\", letter = 6, acc = -1 },\n  { name = \"B\",  letter = 6, acc =  0 }, { name = \"Cb\", letter = 0, acc = -1 },\n}\n\nM.SCALES = {\n  { name = \"Major\",      iv = {0,2,4,5,7,9,11},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Minor\",      iv = {0,2,3,5,7,8,10},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Harm Minor\", iv = {0,2,3,5,7,8,11},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Ionian\",     iv = {0,2,4,5,7,9,11},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Dorian\",     iv = {0,2,3,5,7,9,10},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Phrygian\",   iv = {0,1,3,5,7,8,10},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Lydian\",     iv = {0,2,4,6,7,9,11},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Mixolydian\", iv = {0,2,4,5,7,9,10},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Aeolian\",    iv = {0,2,3,5,7,8,10},   letters = {0,1,2,3,4,5,6} },\n  { name = \"Maj Pent\",   iv = {0,2,4,7,9},        letters = {0,1,2,4,5} },\n  { name = \"Min Pent\",   iv = {0,3,5,7,10},       letters = {0,2,3,4,6} },\n  { name = \"Maj Blues\",  iv = {0,2,3,4,7,9},      letters = {0,1,2,2,4,5} },\n  { name = \"Min Blues\",  iv = {0,3,5,6,7,10},     letters = {0,2,3,4,4,6} },\n  { name = \"Whole Tone\", iv = {0,2,4,6,8,10},     letters = {0,1,2,3,4,5} },\n  { name = \"Dim W-H\",    iv = {0,2,3,5,6,8,9,11}, letters = {0,1,2,3,4,5,5,6} },\n  { name = \"Dim H-W\",    iv = {0,1,3,4,6,7,9,10}, letters = {0,1,2,2,3,4,5,6} },\n}\n\nlocal NUMERALS = { \"I\", \"II\", \"III\", \"IV\", \"V\", \"VI\", \"VII\", \"VIII\" }\n\n-- A key is the pair of indices the window picks. A chord scale (M.chordKey)\n-- is a key that also carries its own intervals: the same scale with a note\n-- or two bent to the chord sounding over it.\nfunction M.key(root, scale) return { root = root or 1, scale = scale or 1 } end\n\nlocal function ivOf(key) return key.iv or M.SCALES[key.scale].iv end\nM.ivOf = ivOf\n\nfunction M.scaleLen(key) return #ivOf(key) end\n\nfunction M.rootPc(key)\n  local rt = M.ROOTS[key.root]\n  return (LETTER_PC[rt.letter + 1] + rt.acc + 12) % 12\nend\n\n------------------------------------------------------------------------------\n-- Positions and pitches\n------------------------------------------------------------------------------\n\n-- The MIDI pitch of a scale position.\nfunction M.pitch(key, pos)\n  local iv  = ivOf(key)\n  local n   = #iv\n  local oct = math.floor(pos / n)\n  local k   = pos - oct * n\n  return M.rootPc(key) + iv[k + 1] + 12 * oct\nend\n\n-- The highest position at or below a pitch. Every pitch has one, because the\n-- root is in every octave.\nfunction M.floorPos(key, midi)\n  local iv   = ivOf(key)\n  local n    = #iv\n  local root = M.rootPc(key)\n  local oct  = math.floor((midi - root) / 12)\n  local kmax = 0\n  for k = 1, n do\n    if root + iv[k] + 12 * oct <= midi then kmax = k - 1 end\n  end\n  return oct * n + kmax\nend\n\n-- The position of a pitch that is in the scale, or nil for one that is not.\nfunction M.posOf(key, midi)\n  local s = M.floorPos(key, midi)\n  if M.pitch(key, s) == midi then return s end\n  return nil\nend\n\n-- The nearest position to any pitch. A pitch exactly between two scale notes\n-- goes the way `lean` says (+1 up, -1 down), and down when it says nothing.\nfunction M.nearestPos(key, midi, lean)\n  local lo = M.floorPos(key, midi)\n  if M.pitch(key, lo) == midi then return lo end\n  local dLo = midi - M.pitch(key, lo)\n  local dHi = M.pitch(key, lo + 1) - midi\n  if dLo < dHi then return lo end\n  if dHi < dLo then return lo + 1 end\n  return (lean or -1) > 0 and lo + 1 or lo\nend\n\nfunction M.pc(key, pos) return M.pitch(key, pos) % 12 end\n\n-- Spelled for the key: the seventh of F# major comes out E#, not F.\nfunction M.noteName(key, pos)\n  local sc  = M.SCALES[key.scale]\n  local n   = #ivOf(key)\n  local oct = math.floor(pos / n)\n  local k   = pos - oct * n\n  local letter = (M.ROOTS[key.root].letter + sc.letters[k + 1]) % 7\n  local acc = M.pitch(key, pos) % 12 - LETTER_PC[letter + 1]\n  if acc >  6 then acc = acc - 12 end\n  if acc < -6 then acc = acc + 12 end\n  return LETTERS[letter + 1] .. (ACCIDENTAL[acc] or \"?\")\nend\n\n-- A pitch named with its octave, C4 being middle C (60). Out of the key, the\n-- sharp spelling.\nlocal SHARP_NAMES = { \"C\", \"C#\", \"D\", \"D#\", \"E\", \"F\", \"F#\", \"G\", \"G#\", \"A\", \"A#\", \"B\" }\nfunction M.pitchName(midi, key)\n  local oct = math.floor(midi / 12) - 1\n  if key then\n    local s = M.posOf(key, midi)\n    if s then return M.noteName(key, s) .. oct end\n  end\n  return SHARP_NAMES[midi % 12 + 1] .. oct\nend\n\n------------------------------------------------------------------------------\n-- Degrees\n------------------------------------------------------------------------------\n\n-- Read off the scale rather than assumed, so the modes and the blues scales\n-- come out right: the vii of major is diminished, the III of minor is major.\nfunction M.degreeQuality(key, degree)\n  local p  = M.pitch(key, degree)\n  local r3 = M.pitch(key, degree + 2) - p\n  local r5 = M.pitch(key, degree + 4) - p\n  if r3 == 4 and r5 == 7 then return \"major\"      end\n  if r3 == 3 and r5 == 7 then return \"minor\"      end\n  if r3 == 3 and r5 == 6 then return \"diminished\" end\n  if r3 == 4 and r5 == 8 then return \"augmented\"  end\n  return \"other\"\nend\n\nfunction M.degreeNumeral(key, degree, ascii)\n  local q = M.degreeQuality(key, degree)\n  local n = NUMERALS[(degree % 8) + 1]\n  if q == \"minor\" or q == \"diminished\" then n = n:lower() end\n  if q == \"diminished\" then n = n .. (ascii and \"dim\" or \"\\u{00B0}\") end\n  if q == \"augmented\"  then n = n .. (ascii and \"aug\" or \"+\") end\n  return n\nend\n\nM.DEGREE_TITLES = { \"Tonic\", \"Supertonic\", \"Mediant\", \"Subdominant\",\n                    \"Dominant\", \"Submediant\", \"Leading Tone\" }\n\n-- Starting Blocks' degree names. Only the seven-note scales carry them, and\n-- the seventh is a leading tone only when it leans on the tonic a semitone up.\nfunction M.degreeTitle(key, degree)\n  if M.scaleLen(key) ~= 7 then return \"Degree \" .. (degree + 1) end\n  if degree == 6 and M.pitch(key, 7) - M.pitch(key, 6) ~= 1 then return \"Subtonic\" end\n  return M.DEGREE_TITLES[degree + 1] or (\"Degree \" .. (degree + 1))\nend\n\n-- The seventh degree leans on the tonic only when it sits a semitone under\n-- it. Only then is it a leading tone, and only then does it want resolving\n-- and not doubling.\nfunction M.leadingTonePc(key)\n  local n = M.scaleLen(key)\n  if n ~= 7 then return nil end\n  if M.pitch(key, 7) - M.pitch(key, 6) == 1 then return M.pc(key, 6) end\n  return nil\nend\n\n------------------------------------------------------------------------------\n-- Progressions\n--\n-- The chords under everything, as scale degrees. One chord to a slot; the\n-- slots share the block's length evenly. A progression whose degrees the\n-- scale does not have (a sixth degree in a pentatonic) is simply not offered.\n------------------------------------------------------------------------------\n\nM.PROGRESSIONS = {\n  { id = \"I\",        degrees = { 0 } },\n  { id = \"I-V\",      degrees = { 0, 4 } },\n  { id = \"I-IV\",     degrees = { 0, 3 } },\n  { id = \"I-IV-V-I\", degrees = { 0, 3, 4, 0 } },\n  { id = \"I-V-vi-IV\", degrees = { 0, 4, 5, 3 } },\n  { id = \"I-vi-IV-V\", degrees = { 0, 5, 3, 4 } },\n  { id = \"vi-IV-I-V\", degrees = { 5, 3, 0, 4 } },\n  { id = \"ii-V-I\",   degrees = { 1, 4, 0, 0 } },\n  { id = \"i-VI-III-VII\", degrees = { 0, 5, 2, 6 } },\n  { id = \"i-VII-VI-V\", degrees = { 0, 6, 5, 4 } },   -- the Andalusian cadence\n  { id = \"i-iv-v-i\", degrees = { 0, 3, 4, 0 } },\n}\n\n-- The ids above are fixed names for saving; what the window shows is the\n-- numerals this scale actually builds, so I-IV-V-I in minor reads i-iv-v-i.\nfunction M.progressionName(key, prog)\n  local out = {}\n  for i, d in ipairs(prog.degrees) do out[i] = M.degreeNumeral(key, d, true) end\n  return table.concat(out, \"-\")\nend\n\nfunction M.progressionFits(key, prog)\n  for _, d in ipairs(prog.degrees) do\n    if d >= M.scaleLen(key) then return false end\n  end\n  return true\nend\n\n-- The progressions this scale can play, keeping only the first of any two\n-- that come out the same here (I-IV-V-I and i-iv-v-i are one thing in any\n-- given scale).\nfunction M.progressionsFor(key)\n  local out, seen = {}, {}\n  for _, p in ipairs(M.PROGRESSIONS) do\n    if M.progressionFits(key, p) then\n      local sig = table.concat(p.degrees, \",\")\n      if not seen[sig] then seen[sig] = true; out[#out + 1] = p end\n    end\n  end\n  return out\nend\n\nfunction M.progressionById(id)\n  for _, p in ipairs(M.PROGRESSIONS) do if p.id == id then return p end end\n  return M.PROGRESSIONS[1]\nend\n\n------------------------------------------------------------------------------\n-- Chords\n--\n-- Starting Blocks' chord tables, copied unchanged: one row per chord carrying\n-- its own name, symbol and intervals (semitones from the chord's root), in\n-- the families of Wikipedia's list of chords, plus the diatonic chords the\n-- scale hands you for free. Do not tidy them independently of Starting\n-- Blocks.\n------------------------------------------------------------------------------\n\nM.FAMILIES = { \"Diatonic\", \"Triads\", \"6ths & 7ths\", \"Extended\", \"Altered\",\n               \"Sus & Add\", \"Quartal\", \"Named\" }\n\nlocal TR, S7, EX, AL, SA, QU, NA = 2, 3, 4, 5, 6, 7, 8   -- indices into FAMILIES\n\nM.CHORDS = {\n  { sym=\"maj\",  name=\"Major\",                  iv={0,4,7},          fam=TR },\n  { sym=\"m\",    name=\"Minor\",                  iv={0,3,7},          fam=TR },\n  { sym=\"dim\",  name=\"Diminished\",             iv={0,3,6},          fam=TR },\n  { sym=\"aug\",  name=\"Augmented\",              iv={0,4,8},          fam=TR },\n  { sym=\"b5\",   name=\"Flat Five\",              iv={0,4,6},          fam=TR },\n  { sym=\"5\",    name=\"Fifth (Power)\",          iv={0,7},            fam=TR },\n\n  { sym=\"6\",       name=\"Sixth\",                    iv={0,4,7,9},     fam=S7 },\n  { sym=\"m6\",      name=\"Minor Sixth\",              iv={0,3,7,9},     fam=S7 },\n  { sym=\"6/9\",     name=\"Six-Nine\",                 iv={0,4,7,9,14},  fam=S7 },\n  { sym=\"m6/9\",    name=\"Minor Six-Nine\",           iv={0,3,7,9,14},  fam=S7 },\n  { sym=\"7\",       name=\"Dominant Seventh\",         iv={0,4,7,10},    fam=S7 },\n  { sym=\"maj7\",    name=\"Major Seventh\",            iv={0,4,7,11},    fam=S7 },\n  { sym=\"m7\",      name=\"Minor Seventh\",            iv={0,3,7,10},    fam=S7 },\n  { sym=\"mMaj7\",   name=\"Minor-Major Seventh\",      iv={0,3,7,11},    fam=S7 },\n  { sym=\"m7b5\",    name=\"Half-Diminished Seventh\",  iv={0,3,6,10},    fam=S7 },\n  { sym=\"dim7\",    name=\"Diminished Seventh\",       iv={0,3,6,9},     fam=S7 },\n  { sym=\"7#5\",     name=\"Augmented Seventh\",        iv={0,4,8,10},    fam=S7 },\n  { sym=\"maj7#5\",  name=\"Augmented Major Seventh\",  iv={0,4,8,11},    fam=S7 },\n  { sym=\"7b5\",     name=\"Seventh Flat Five\",        iv={0,4,6,10},    fam=S7 },\n  { sym=\"dimMaj7\", name=\"Diminished Major Seventh\", iv={0,3,6,11},    fam=S7 },\n  { sym=\"7/6\",     name=\"Seven Six\",                iv={0,4,7,9,10},  fam=S7 },\n\n  { sym=\"9\",     name=\"Ninth\",               iv={0,4,7,10,14},       fam=EX },\n  { sym=\"maj9\",  name=\"Major Ninth\",         iv={0,4,7,11,14},       fam=EX },\n  { sym=\"m9\",    name=\"Minor Ninth\",         iv={0,3,7,10,14},       fam=EX },\n  { sym=\"mMaj9\", name=\"Minor-Major Ninth\",   iv={0,3,7,11,14},       fam=EX },\n  { sym=\"11\",    name=\"Eleventh\",            iv={0,4,7,10,14,17},    fam=EX },\n  { sym=\"maj11\", name=\"Major Eleventh\",      iv={0,4,7,11,14,17},    fam=EX },\n  { sym=\"m11\",   name=\"Minor Eleventh\",      iv={0,3,7,10,14,17},    fam=EX },\n  { sym=\"13\",    name=\"Thirteenth\",          iv={0,4,7,10,14,17,21}, fam=EX },\n  { sym=\"maj13\", name=\"Major Thirteenth\",    iv={0,4,7,11,14,17,21}, fam=EX },\n  { sym=\"m13\",   name=\"Minor Thirteenth\",    iv={0,3,7,10,14,17,21}, fam=EX },\n\n  { sym=\"7b9\",       name=\"Seventh Flat Nine\",             iv={0,4,7,10,13},    fam=AL },\n  { sym=\"7#9\",       name=\"Seventh Sharp Nine\",            iv={0,4,7,10,15},    fam=AL },\n  { sym=\"7#11\",      name=\"Seventh Sharp Eleven\",          iv={0,4,7,10,18},    fam=AL },\n  { sym=\"7b13\",      name=\"Seventh Flat Thirteen\",         iv={0,4,7,10,20},    fam=AL },\n  { sym=\"7#5b9\",     name=\"Seventh Sharp Five Flat Nine\",  iv={0,4,8,10,13},    fam=AL },\n  { sym=\"7#5#9\",     name=\"Seventh Sharp Five Sharp Nine\", iv={0,4,8,10,15},    fam=AL },\n  { sym=\"7b5b9\",     name=\"Seventh Flat Five Flat Nine\",   iv={0,4,6,10,13},    fam=AL },\n  { sym=\"7alt\",      name=\"Altered Dominant\",              iv={0,4,8,10,13,15}, fam=AL },\n  { sym=\"13b9\",      name=\"Thirteenth Flat Nine\",          iv={0,4,7,10,13,21}, fam=AL },\n  { sym=\"maj7#11\",   name=\"Major Seventh Sharp Eleven\",    iv={0,4,7,11,18},    fam=AL },\n  { sym=\"m9b5\",      name=\"Minor Ninth Flat Five\",         iv={0,3,6,10,14},    fam=AL },\n  { sym=\"9#5\",       name=\"Ninth Augmented Fifth\",         iv={0,4,8,10,14},    fam=AL },\n  { sym=\"9b5\",       name=\"Ninth Flat Fifth\",              iv={0,4,6,10,14},    fam=AL },\n  { sym=\"9#11\",      name=\"Augmented Eleventh\",            iv={0,4,7,10,14,18}, fam=AL },\n  { sym=\"maj7#5#11\", name=\"Augmented Major Seventh Sharp Eleven\", iv={0,4,8,11,18}, fam=AL },\n  { sym=\"13b9b5\",    name=\"Thirteenth Flat Nine Flat Five\", iv={0,4,6,10,13,21}, fam=AL },\n\n  { sym=\"sus2\",     name=\"Suspended Second\",             iv={0,2,7},       fam=SA },\n  { sym=\"sus4\",     name=\"Suspended Fourth\",             iv={0,5,7},       fam=SA },\n  { sym=\"7sus4\",    name=\"Seventh Suspended Fourth\",     iv={0,5,7,10},    fam=SA },\n  { sym=\"9sus4\",    name=\"Ninth Suspended Fourth\",       iv={0,5,7,10,14}, fam=SA },\n  { sym=\"maj7sus4\", name=\"Major Seventh Suspended Fourth\", iv={0,5,7,11},  fam=SA },\n  { sym=\"add9\",     name=\"Added Ninth\",                  iv={0,4,7,14},    fam=SA },\n  { sym=\"m(add9)\",  name=\"Minor Added Ninth\",            iv={0,3,7,14},    fam=SA },\n  { sym=\"add4\",     name=\"Added Fourth\",                 iv={0,4,5,7},     fam=SA },\n  { sym=\"add11\",    name=\"Added Eleventh\",               iv={0,4,7,17},    fam=SA },\n  { sym=\"add13\",    name=\"Added Thirteenth\",             iv={0,4,7,21},    fam=SA },\n  { sym=\"add2\",     name=\"Added Second\",                 iv={0,2,4,7},     fam=SA },\n  { sym=\"m(add2)\",  name=\"Minor Added Second\",           iv={0,2,3,7},     fam=SA },\n\n  { sym=\"Q4/3\",    name=\"Quartal Triad\",       iv={0,5,10},    fam=QU },\n  { sym=\"Q4/4\",    name=\"Quartal Tetrad\",      iv={0,5,10,15}, fam=QU },\n  { sym=\"Q5/3\",    name=\"Quintal Triad\",       iv={0,7,14},    fam=QU },\n  { sym=\"WT3\",     name=\"Whole-Tone Trichord\", iv={0,2,4},     fam=QU },\n  { sym=\"cluster\", name=\"Chromatic Cluster\",   iv={0,1,2},     fam=QU },\n  { sym=\"dia-cl\",  name=\"Diatonic Cluster\",    iv={0,2,4,5},   fam=QU },\n\n  -- Voiced as they stand rather than reduced to a pitch-class set: the list\n  -- gives the Tristan chord as 0 3 6 10, which makes it a half-diminished\n  -- seventh and indistinguishable from one.\n  { sym=\"Mystic\",    name=\"Mystic (Scriabin)\",   iv={0,6,10,16,21,26}, fam=NA },\n  { sym=\"Petrushka\", name=\"Petrushka\",           iv={0,4,6,7,10,13},   fam=NA },\n  { sym=\"Tristan\",   name=\"Tristan\",             iv={0,6,10,15},       fam=NA },\n  { sym=\"So What\",   name=\"So What\",             iv={0,5,10,15,19},    fam=NA },\n  { sym=\"Dream\",     name=\"Dream\",               iv={0,5,6,7},         fam=NA },\n  { sym=\"Vienna\",    name=\"Viennese Trichord\",   iv={0,1,6},           fam=NA },\n  { sym=\"Vienna II\", name=\"Viennese Trichord II\", iv={0,6,7},          fam=NA },\n  { sym=\"Napoleon\",  name=\"Ode-to-Napoleon\",     iv={0,1,4,5,8,9},     fam=NA },\n  { sym=\"Elektra\",   name=\"Elektra\",             iv={0,7,9,13,16},     fam=NA },\n  { sym=\"Farben\",    name=\"Farben\",              iv={0,8,11,16,21},    fam=NA },\n  { sym=\"It+6\",      name=\"Italian Sixth\",       iv={0,4,10},          fam=NA },\n  { sym=\"Fr+6\",      name=\"French Sixth\",        iv={0,4,6,10},        fam=NA },\n  { sym=\"Ger+6\",     name=\"German Sixth\",        iv={0,4,7,10},        fam=NA },\n}\n\n-- The chords the key hands you for free, as offsets in scale steps from the\n-- degree. Always in key, which is why this is the first family. `suffix` is\n-- what goes after the numeral in a progression's name.\nM.DIATONIC = {\n  { name = \"Triad\", offsets = {0,2,4},           suffix = \"\" },\n  { name = \"7th\",   offsets = {0,2,4,6},         suffix = \"7\" },\n  { name = \"9th\",   offsets = {0,2,4,6,8},       suffix = \"9\" },\n  { name = \"11th\",  offsets = {0,2,4,6,8,10},    suffix = \"11\" },\n  { name = \"13th\",  offsets = {0,2,4,6,8,10,12}, suffix = \"13\" },\n  { name = \"6th\",   offsets = {0,2,4,5},         suffix = \"6\" },\n  { name = \"sus2\",  offsets = {0,1,4},           suffix = \"sus2\" },\n  { name = \"sus4\",  offsets = {0,3,4},           suffix = \"sus4\" },\n  { name = \"5th\",   offsets = {0,4},             suffix = \"5\" },\n}\n\n-- Shapes the harmony types build for themselves, whatever chord was chosen:\n-- a quartal or cluster texture stacks its own steps on the chord's degree.\nM.CHORD_KINDS = {\n  triad   = { 0, 2, 4 },\n  seventh = { 0, 2, 4, 6 },\n  quartal = { 0, 3, 6 },\n  quartal4 = { 0, 3, 6, 9 },\n  cluster = { 0, 1, 2 },\n  cluster4 = { 0, 1, 2, 3 },\n}\n\nfunction M.diatonicByName(name)\n  for _, d in ipairs(M.DIATONIC) do if d.name == name then return d end end\n  return nil\nend\n\nfunction M.chordBySym(sym)\n  for _, c in ipairs(M.CHORDS) do if c.sym == sym then return c end end\n  return nil\nend\n\n-- Which members a voicing may not leave out. The root and the third make a\n-- chord what it is, a seventh makes it a seventh chord, and the top of an\n-- extended or altered chord is its colour; a fifth can go.\nlocal function essentialFor(n, tertian)\n  if n <= 2 then local e = {}; for i = 1, n do e[i] = i end; return e end\n  if n == 3 then return tertian and { 1, 2 } or { 1, 2, 3 } end\n  local e = { 1, 2, 4 }\n  if n >= 5 then e[#e + 1] = n end\n  return e\nend\n\n-- A chord on a scale degree. `spec` is one of:\n--   a kind name from M.CHORD_KINDS (\"triad\", \"quartal4\", ...), stacked from\n--     the scale;\n--   { fam = \"d\", name = \"7th\" }, a diatonic chord from M.DIATONIC;\n--   { fam = \"c\", sym = \"maj7\" }, a chord from M.CHORDS on the degree's root,\n--     whatever the scale says - which is how a borrowed or altered chord gets\n--     into a progression.\n-- Returns pitch classes in member order (root first), with `essential`.\nfunction M.chord(key, degree, spec)\n  local pcs, seen = {}, {}\n  local function addPc(pc)\n    pc = pc % 12\n    if not seen[pc] then seen[pc] = true; pcs[#pcs + 1] = pc end\n  end\n  local kind, tertian, ivs\n  if type(spec) == \"table\" and spec.fam == \"c\" then\n    local c = M.chordBySym(spec.sym) or M.CHORDS[1]\n    local root = M.pc(key, degree)\n    for _, iv in ipairs(c.iv) do addPc(root + iv) end\n    tertian = (c.iv[2] == 3 or c.iv[2] == 4)\n    kind = (#pcs == 3 and tertian and c.iv[3] == 7) and \"triad\" or c.sym\n    ivs = c.iv\n  else\n    local offs\n    if type(spec) == \"table\" then\n      local d = M.diatonicByName(spec.name) or M.DIATONIC[1]\n      offs = d.offsets\n      kind = (d.name == \"Triad\") and \"triad\" or ((d.name == \"7th\") and \"seventh\" or d.name)\n      tertian = not d.name:find(\"sus\")\n    else\n      offs = M.CHORD_KINDS[spec] or M.CHORD_KINDS.triad\n      kind = spec or \"triad\"\n      tertian = (kind == \"triad\" or kind == \"seventh\")\n    end\n    for _, o in ipairs(offs) do addPc(M.pc(key, degree + o)) end\n  end\n  local essential\n  if kind == \"triad\" then essential = { 1, 2 }\n  elseif kind == \"seventh\" then essential = { 1, 2, 4 }\n  elseif type(spec) == \"string\" then essential = {}; for i = 1, #pcs do essential[i] = i end\n  else essential = essentialFor(#pcs, tertian) end\n  return { degree = degree, kind = kind, pcs = pcs, root = pcs[1], essential = essential, ivs = ivs }\nend\n\n-- The scale as it sounds under a chord. A chord can hold notes the scale does\n-- not - the major third of a borrowed I in a minor key, the leading tone of a\n-- V7 in natural minor, the F# of a D7 in C. Under that chord the scale bends\n-- to meet it: the scale note on the same letter as the chord's note moves the\n-- semitone to it, so a C major chord in C minor turns Eb into E for as long as\n-- it lasts, and melodies and figures written in scale steps land on the\n-- chord's own notes instead of grinding against them. A scale note that is\n-- itself in the chord is never moved, and a chord note two semitones from\n-- anything in the scale is left alone.\n--\n-- Which scale note a chord note belongs to is read off the interval, the way\n-- it is spelled: a third is two steps up, a flat five or a sharp five is still\n-- the fifth, a sharp eleven is the fourth step.\nlocal STEPS_IN_OCTAVE = { [0]=0, 1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 6 }\nlocal STEPS_ABOVE     = { [0]=0, 1, 1, 1, 2, 3, 3, 4, 5, 5, 6, 6 }\nfunction M.ivSteps(iv)\n  if iv < 12 then return STEPS_IN_OCTAVE[iv] end\n  return 7 + STEPS_ABOVE[(iv - 12) % 12]\nend\n\nfunction M.chordKey(key, chord)\n  local base = ivOf(key)\n  local n = #base\n  if n ~= 7 or not chord.ivs then\n    -- Only a chord built from outside the scale can need bending, and only a\n    -- seven-note scale has a letter for every note to bend.\n    return key\n  end\n  local iv = {}\n  for i, v in ipairs(base) do iv[i] = v end\n  local rootPc = M.rootPc(key)\n  local changed = false\n  for _, civ in ipairs(chord.ivs) do\n    local pc = (M.pc(key, chord.degree) + civ) % 12\n    local inScale = false\n    for _, v in ipairs(iv) do if (rootPc + v) % 12 == pc then inScale = true end end\n    if not inScale then\n      local k = (chord.degree + M.ivSteps(civ)) % n\n      local cur = (rootPc + iv[k + 1]) % 12\n      local diff = (pc - cur + 12) % 12\n      if (diff == 1 or diff == 11) and not M.hasPc(chord, cur) then\n        local nv = iv[k + 1] + ((diff == 1) and 1 or -1)\n        local below = (k > 0) and iv[k] or -1\n        local above = (k < n - 1) and iv[k + 2] or 12\n        if nv > below and nv < above then iv[k + 1] = nv; changed = true end\n      end\n    end\n  end\n  if not changed then return key end\n  return { root = key.root, scale = key.scale, iv = iv }\nend\n\n------------------------------------------------------------------------------\n-- A chain of chords\n--\n-- The progression is a chain the user builds: each link is a scale degree and\n-- a chord on it, { degree, fam = \"d\" | \"c\", name }, where `name` is a diatonic\n-- chord's name or a chord's symbol. Kept by name, never by index, so it\n-- survives the tables growing. Saved as text, \"0:d:Triad,4:c:7\".\n------------------------------------------------------------------------------\n\nM.MAX_CHAIN = 8\n\nfunction M.chainString(chain)\n  local out = {}\n  for i, c in ipairs(chain) do out[i] = c.degree .. \":\" .. c.fam .. \":\" .. c.name end\n  return table.concat(out, \",\")\nend\n\n-- Reads a chain back, dropping any link that no longer means anything in this\n-- scale (a sixth degree in a pentatonic, a chord that is not in the tables).\nfunction M.parseChain(s, key)\n  local out = {}\n  for tok in tostring(s or \"\"):gmatch(\"[^,]+\") do\n    local d, fam, name = tok:match(\"^(%-?%d+):([dc]):(.+)$\")\n    d = tonumber(d)\n    if d and d >= 0 and d < M.scaleLen(key) and #out < M.MAX_CHAIN then\n      if (fam == \"d\" and M.diatonicByName(name)) or (fam == \"c\" and M.chordBySym(name)) then\n        out[#out + 1] = { degree = d, fam = fam, name = name }\n      end\n    end\n  end\n  return out\nend\n\nfunction M.chainSpec(link)\n  if link.fam == \"c\" then return { fam = \"c\", sym = link.name } end\n  return { fam = \"d\", name = link.name }\nend\n\n-- How a link is written in a progression: the numeral of its degree, cased\n-- by the chord the scale builds there, then the chord. A diatonic chord adds\n-- only its extension (V7, ii9); a chosen chord takes an upper-case numeral\n-- and its own symbol (IVmaj7, IIm7, bVI is not needed - the root is always a\n-- degree of the scale).\nfunction M.linkLabel(key, link, ascii)\n  if link.fam == \"d\" then\n    local d = M.diatonicByName(link.name) or M.DIATONIC[1]\n    return M.degreeNumeral(key, link.degree, ascii) .. d.suffix\n  end\n  local sym = link.name\n  local sep = sym:match(\"^%u\") and \" \" or \"\"\n  if sym == \"maj\" then sym = \"\" end\n  return NUMERALS[(link.degree % 8) + 1] .. sep .. sym\nend\n\nfunction M.chainName(key, chain, ascii)\n  local out = {}\n  for i, link in ipairs(chain) do out[i] = M.linkLabel(key, link, ascii) end\n  return table.concat(out, \"-\")\nend\n\n-- The symbol a set of pitch classes goes by, read off the chord tables: the\n-- first chord whose notes are exactly these, from this root. \"\" for a major\n-- triad, nil for a set with no name here.\nfunction M.symbolOf(pcs, root)\n  local want = {}\n  for _, pc in ipairs(pcs) do want[(pc - root) % 12] = true end\n  local n = 0\n  for _ in pairs(want) do n = n + 1 end\n  for _, c in ipairs(M.CHORDS) do\n    local have, m = {}, 0\n    for _, iv in ipairs(c.iv) do\n      if not have[iv % 12] then have[iv % 12] = true; m = m + 1 end\n    end\n    if m == n then\n      local same = true\n      for k in pairs(want) do if not have[k] then same = false end end\n      if same then return (c.sym == \"maj\") and \"\" or c.sym end\n    end\n  end\n  return nil\nend\n\n-- A link's chord name and its notes, spelled in the scale as it sounds under\n-- that chord: \"C\", \"C E G\" for a borrowed C major in C minor; \"Dm7\",\n-- \"D F A C\" for ii7 in C major.\nfunction M.linkSpelling(key, link)\n  local ch = M.chord(key, link.degree, M.chainSpec(link))\n  local ck = M.chordKey(key, ch)\n  local names = {}\n  for _, pc in ipairs(ch.pcs) do\n    local name\n    for s = link.degree, link.degree + 13 do\n      if M.pc(ck, s) == pc then name = M.noteName(ck, s); break end\n    end\n    names[#names + 1] = name or SHARP_NAMES[pc + 1]\n  end\n  local sym = (link.fam == \"c\") and ((link.name == \"maj\") and \"\" or link.name)\n              or M.symbolOf(ch.pcs, ch.root) or link.name\n  return names[1] .. (sym:match(\"^%u\") and \" \" or \"\") .. sym, table.concat(names, \" \")\nend\n\n-- A chain from one of the progressions, every chord diatonic: triads, or\n-- sevenths.\nfunction M.presetChain(prog, seventh)\n  local out = {}\n  for i, d in ipairs(prog.degrees) do\n    out[i] = { degree = d, fam = \"d\", name = seventh and \"7th\" or \"Triad\" }\n  end\n  return out\nend\n\nfunction M.hasPc(ch, pc)\n  for _, p in ipairs(ch.pcs) do if p == pc % 12 then return true end end\n  return false\nend\n\n------------------------------------------------------------------------------\n-- Voice leading\n--\n-- A voicing is a list of MIDI pitches, bass first, strictly rising. Each voice\n-- has its own range, which is how an ensemble keeps every part inside its\n-- instrument: the violins' voice is looked for in the violins' range.\n--\n-- The rules are the ones a harmony teacher marks, as costs:\n--\n--   - move as little as possible, and keep common tones where they are;\n--   - no parallel fifths or octaves between any two voices;\n--   - no doubled leading tone, and the leading tone rises to the tonic;\n--   - upper voices within an octave of each other, the bass wider;\n--   - no voice crossing (the voicing is strictly rising, so it cannot).\n--\n-- The search keeps the best few paths through the progression rather than\n-- only the best single step, so an early cheap move cannot corner a later\n-- chord.\n------------------------------------------------------------------------------\n\nM.BEAM = 6\n\nlocal function interval(a, b) return (b - a) % 12 end\n\n-- Every voicing of one chord that the ranges and the spacing rules allow.\n--\n-- opts:\n--   bassRoot    false lets the bass take any chord tone (an inversion)\n--   fixedBass   an exact pitch the bass holds whatever the chord: a pedal\n--   fixedTop    the same, for the top voice: an inverted pedal\n--   adjacent    a set of the only intervals allowed between neighbouring\n--               voices - fourths and fifths for quartal harmony, seconds\n--               for clusters\n--   close       the whole voicing inside an octave: close position\nfunction M.candidates(ch, ranges, opts)\n  opts = opts or {}\n  local nv = #ranges\n  local out = {}\n  local options = {}\n  for v = 1, nv do\n    local list = {}\n    if v == 1 and opts.fixedBass then list = { opts.fixedBass }\n    elseif v == nv and opts.fixedTop then list = { opts.fixedTop }\n    else\n      for p = ranges[v][1], ranges[v][2] do\n        local okPc\n        if v == 1 and opts.bassRoot ~= false then okPc = (p % 12 == ch.root)\n        else okPc = M.hasPc(ch, p) end\n        if okPc then list[#list + 1] = p end\n      end\n    end\n    options[v] = list\n  end\n\n  -- The members a voice must supply. A fixed bass or top is a pedal, not a\n  -- chord tone, so the others have to cover the chord between them.\n  local need = {}\n  for _, m in ipairs(ch.essential) do need[#need + 1] = ch.pcs[m] end\n\n  local cur = {}\n  local function covered()\n    for _, pc in ipairs(need) do\n      local found = false\n      for v = 1, nv do\n        local pedal = (v == 1 and opts.fixedBass) or (v == nv and opts.fixedTop)\n        if not pedal and cur[v] % 12 == pc then found = true; break end\n      end\n      if not found then return false end\n    end\n    return true\n  end\n\n  local function walk(v)\n    if #out >= 20000 then return end\n    if v > nv then\n      if covered() then\n        local c = {}\n        for i = 1, nv do c[i] = cur[i] end\n        out[#out + 1] = c\n      end\n      return\n    end\n    for _, p in ipairs(options[v]) do\n      local fine = true\n      if v > 1 then\n        local below = cur[v - 1]\n        local gap = p - below\n        if gap <= 0 then fine = false\n        elseif v == 2 then\n          -- The bass may sit wider than the upper voices, but not past a\n          -- twelfth, where it stops sounding like the bottom of this chord.\n          -- A pedal is allowed two octaves: it is under the chords, not in them.\n          if gap > (opts.fixedBass and 24 or 19) then fine = false end\n        elseif gap > ((v == nv and opts.fixedTop) and 16 or 12) then fine = false end\n        if fine and opts.adjacent and not opts.adjacent[gap] then fine = false end\n        if fine and opts.close and v == nv and p - cur[1] > 12 then fine = false end\n      end\n      if fine then\n        cur[v] = p\n        walk(v + 1)\n      end\n    end\n    cur[v] = nil\n  end\n  walk(1)\n  return out\nend\n\n-- Parallel fifths and octaves: two voices a perfect fifth or octave apart\n-- that both move, the same way, to the same interval again.\nfunction M.parallels(a, b)\n  local n = 0\n  for i = 1, #a - 1 do\n    for j = i + 1, #a do\n      local was, now = interval(a[i], a[j]), interval(b[i], b[j])\n      if (was == 0 or was == 7) and was == now then\n        local mi, mj = b[i] - a[i], b[j] - a[j]\n        if mi ~= 0 and mj ~= 0 and (mi > 0) == (mj > 0) then n = n + 1 end\n      end\n    end\n  end\n  return n\nend\n\nlocal function sign(x) if x > 0 then return 1 elseif x < 0 then return -1 end return 0 end\n\n-- What one voicing costs, after `prev` (nil for the first chord).\nfunction M.cost(ch, v, prev, opts, ctx)\n  opts = opts or {}\n  local nv, c = #v, 0\n\n  -- Doubling. The leading tone is never doubled; in a triad in four or more\n  -- voices, doubling the root is the textbook choice.\n  local counts = {}\n  for _, p in ipairs(v) do counts[p % 12] = (counts[p % 12] or 0) + 1 end\n  if ctx.lt and (counts[ctx.lt] or 0) > 1 then c = c + 20 end\n  if ch.kind == \"triad\" and nv >= 4 and (counts[ch.root] or 0) < 2 then c = c + 2 end\n  -- A fifth is the member a full chord can most afford to lose, but a chord\n  -- that could have had it and did not is thinner than it needed to be.\n  for _, pc in ipairs(ch.pcs) do\n    if not counts[pc] then c = c + 3 end\n  end\n\n  -- An inversion, where one is allowed at all.\n  if opts.bassRoot == false and not opts.fixedBass then\n    if v[1] % 12 ~= ch.root then\n      c = c + ((ch.pcs[3] and v[1] % 12 == ch.pcs[3]) and 6 or 3)\n    end\n  end\n\n  if not prev then\n    -- The first chord is judged on where it sits and how it is spaced:\n    -- wider at the bottom than the top, like the harmonic series.\n    local sum = 0\n    for _, p in ipairs(v) do sum = sum + p end\n    c = c + math.abs(sum / nv - ctx.centre) * 0.6\n    if nv >= 3 then\n      local lowGap, topGap = v[2] - v[1], v[nv] - v[nv - 1]\n      if lowGap < topGap then c = c + 2 end\n    end\n    return c\n  end\n\n  -- Movement, and common tones held.\n  for i = 1, nv do\n    local d = math.abs(v[i] - prev[i])\n    c = c + d\n    if d > 7 then c = c + (d - 7) * 2 end\n  end\n\n  if opts.noParallels ~= false then c = c + 50 * M.parallels(prev, v) end\n\n  -- The leading tone in the top voice rises to the tonic when the tonic chord\n  -- follows. Inner voices are allowed to let it fall, as they are in chorales.\n  if ctx.lt and ctx.tonicPc and ch.root == ctx.tonicPc and prev[nv] % 12 == ctx.lt then\n    if v[nv] - prev[nv] ~= 1 then c = c + 10 end\n  end\n\n  -- Outer voices in contrary motion, when that is the point of the block.\n  if opts.contrary then\n    local s, b = sign(v[nv] - prev[nv]), sign(v[1] - prev[1])\n    if s ~= 0 and s == b then c = c + 12\n    elseif s == 0 or b == 0 then c = c + 5 end\n    if s ~= opts.contrary then c = c + 6 end\n  end\n  return c\nend\n\n-- The whole progression voiced. `chords` is a list from M.chord; `ranges` is\n-- one {lo, hi} per voice, bass first. Returns one voicing per chord, or nil\n-- when some chord has no voicing inside those ranges.\nfunction M.voiceLead(key, chords, ranges, opts)\n  opts = opts or {}\n  local ctx = {\n    lt = M.leadingTonePc(key), tonicPc = M.rootPc(key),\n    centre = 0,\n  }\n  for _, r in ipairs(ranges) do ctx.centre = ctx.centre + (r[1] + r[2]) / 2 end\n  ctx.centre = ctx.centre / #ranges\n\n  local beam = { { cost = 0, path = {} } }\n  for i, ch in ipairs(chords) do\n    local cands = M.candidates(ch, ranges, opts)\n    if #cands == 0 then return nil end\n    local next_ = {}\n    for _, state in ipairs(beam) do\n      local prev = state.path[#state.path]\n      for _, v in ipairs(cands) do\n        local cc = state.cost + M.cost(ch, v, prev, opts, ctx)\n        next_[#next_ + 1] = { cost = cc, path = state.path, v = v }\n      end\n    end\n    table.sort(next_, function(a, b)\n      if a.cost ~= b.cost then return a.cost < b.cost end\n      -- Equal costs are settled by the voicing itself, so the answer never\n      -- depends on the order the sort happened to see them in.\n      for k = 1, #a.v do\n        if a.v[k] ~= b.v[k] then return a.v[k] < b.v[k] end\n      end\n      return false\n    end)\n    beam = {}\n    local seen = {}\n    for _, s in ipairs(next_) do\n      local sig = table.concat(s.v, \",\")\n      if not seen[sig] then\n        seen[sig] = true\n        local path = {}\n        for k, p in ipairs(s.path) do path[k] = p end\n        path[#path + 1] = s.v\n        beam[#beam + 1] = { cost = s.cost, path = path }\n        if #beam >= M.BEAM then break end\n      end\n    end\n    if i == 1 and opts.firstOnly then break end\n  end\n  return beam[1].path\nend\n\n-- Diatonic planing: every voice moves by the same number of scale steps as\n-- the root does. Parallel fourths are the sound of quartal harmony rather\n-- than a fault in it, so this is not voice leading and does not pretend to be.\nfunction M.plane(key, first, chords)\n  local out = { first }\n  local firstPos = {}\n  local k1 = chords[1].key or key\n  for i, p in ipairs(first) do firstPos[i] = M.nearestPos(k1, p) end\n  for c = 2, #chords do\n    local shift = chords[c].degree - chords[1].degree\n    local prev = out[c - 1]\n    -- The same shape, moved by the root's step, in whichever octave is\n    -- nearest to where the last chord was.\n    local best, bestD\n    for o = -1, 1 do\n      local v = {}\n      local kc = chords[c].key or key\n      for i, s in ipairs(firstPos) do v[i] = M.pitch(kc, s + shift + o * M.scaleLen(key)) end\n      local d = 0\n      for i = 1, #v do d = d + math.abs(v[i] - prev[i]) end\n      if not bestD or d < bestD then best, bestD = v, d end\n    end\n    out[c] = best\n  end\n  return out\nend\n\nreturn M\n"};

/* ---- ../kit/palette.js ---- */
/* The devices' colours in Live: after Ableton Live 8's default theme.
 *
 * The scheme is Starting Blocks' own experiment of 18 September 2026
 * (commit 2765b0a3, "theme the window after Live 8"): a neutral grey chrome
 * meant to sit quietly under brightly coloured clips, controls raised off it,
 * and one warm amber spent where Live spends its accent, on what is switched
 * on. It was built from the theme's described character, not Live's own
 * files, so it is a likeness, not a match.
 *
 * Two changes from that experiment, both for the family's rules (every word
 * 7:1 on what it sits on, ink on every button, marks and edges 3:1):
 *   - the chrome is #3E3E3E, a step darker than its #4A4A4A, because on
 *     #4A4A4A a secondary word cannot reach 7:1 and still look secondary;
 *   - buttons are a light grey with dark ink, as the house scheme's are,
 *     because light words on its #5E5E5E buttons reach only 5:1.
 * The greys are neutral (R = G = B), as Live's are: the house rule that
 * every grey leans blue is the yellow scheme's, and Live's look is not that.
 *
 * Palette.tone(r, g, b) is how the REAPER windows (the JSFX and Lua scripts,
 * drawn through gfx.js) take the scheme without a line of theirs changing:
 *   - the house scheme's own colours map one for one (HOUSE below), each
 *     chosen so the pairs the scripts rely on stay 7:1 for words and 3:1
 *     for edges;
 *   - the house yellow, and the shades the scripts make of it, become the
 *     amber, shaded the same way;
 *   - any other grey loses its tint at the same brightness, so a script
 *     with a palette of its own keeps every contrast it had;
 *   - every other colour (a material, an engine, a part) is left alone.
 */
var Palette = (function () {
  'use strict';
  var C = {
    ground: 0x3E3E3E,     // the chrome: Live 8's #4A4A4A, a step darker (see above)
    raised: 0x484848,     // a control that is off
    sunken: 0x2E2E2E,     // lists, fields, a roll or a page: Live 8's roll ground
    deep: 0x262626,       // a roll's own ground under a sunken frame
    popup: 0x333333,      // menus
    rule: 0x555555,       // separators: they group, they do not act
    edge: 0x8C8C8C,       // the edge of anything that acts: 3.2:1 on the chrome
    control: 0xB4B4B4,    // buttons, with ink on them
    controlHover: 0xC4C4C4,
    controlHeld: 0xAAAAAA,
    accent: 0xD7A93C,     // Live 8's warm amber: what is on
    accentHeld: 0xCDA139,  // held: ink on it still 7.2:1
    ink: 0x1A1A1A,        // words on a button, grey or amber; also a window's darkest ground
                          // (AutoCC paints its window in the ink), so words are 7:1 on it too
    text: 0xF0F0F0,       // 9.4:1 on the chrome
    label: 0xD8D8D8,      // 7.5:1
    dim: 0xD4D4D4,        // secondary words, 7.2:1
    mark: 0xA8A8A8,       // a mark that is not a word, or a control that is off
    note: 0xA8D8E8,       // Live 8's cool note colour, for a roll
    ring: 0xFAFAFA,       // the keyboard's place
    warn: 0xF0605A,       // a warning's mark, never its words: 3.3:1 on the chrome
    warnText: 0xFFC8C2    // a warning's words, 7.3:1
  };
  // The house scheme (HousePalette, every family repo's docs/COLOUR.md) to this one.
  var HOUSE = {
    0x111419: C.deep, 0x14171C: C.ink, 0x1A1D23: C.sunken, 0x1B1F25: C.popup, 0x1E2228: 0x343434,
    0x22262D: 0x363636, 0x23272E: C.ground, 0x2A2F37: C.raised, 0x3A404A: C.rule, 0x585F6B: 0x707070,
    0x646B77: 0x7A7A7A, 0x6D7581: C.edge, 0x8A919C: C.mark, 0x8F96A2: C.controlHeld, 0xA9AFBA: C.control,
    0xB0B6C0: C.dim, 0xB6BCC6: C.dim, 0xBFC5CE: C.label, 0xC0C6CF: C.controlHover, 0xDDE1E7: C.text,
    0xF2F4F7: C.ring, 0xFFF200: C.accent, 0xD1C600: C.accentHeld, 0xFF9E96: C.warnText, 0xFFA6A0: C.warnText, 0xD2483F: C.warn
  };
  function rgb(hex, a) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, a === undefined ? 1 : a];
  }
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function unlin(l) { return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055; }
  function luminance(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
  function contrast(a, b) {
    var la = luminance(a[0], a[1], a[2]), lb = luminance(b[0], b[1], b[2]);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  var AMBER = rgb(C.accent);
  // r, g, b from 0 to 1; returns [r, g, b].
  function tone(r, g, b) {
    r = clamp(r); g = clamp(g); b = clamp(b);
    var R = Math.round(r * 255), G = Math.round(g * 255), B = Math.round(b * 255);
    var hex = (R << 16) | (G << 8) | B;
    if (HOUSE[hex] !== undefined) { var t = rgb(HOUSE[hex]); return [t[0], t[1], t[2]]; }
    // The house yellow and its shades: lighter ones mix in white (blue rises
    // from 0), darker ones scale down (red and green fall together).
    if (R >= 120 && G >= 110 && Math.abs(R - G) <= 40 && B <= Math.min(R, G) - 90) {
      var w = B / 255, k = Math.max(R, G) / 255;
      return [0, 1, 2].map(function (i) { return clamp(AMBER[i] * k + (1 - AMBER[i] * k) * w); });
    }
    // A grey with a tint, from any palette: neutral at the same brightness.
    var hi = Math.max(R, G, B), lo = Math.min(R, G, B);
    if (hi - lo <= 28) { var n = unlin(luminance(r, g, b)); return [n, n, n]; }
    return [r, g, b];
  }
  return { C: C, HOUSE: HOUSE, rgb: rgb, tone: tone, luminance: luminance, contrast: contrast };
})();


/* ---- ../kit/runtime/polyfill.js ---- */
/* What JavaScriptCore lacks and the Lua runtime uses: TextEncoder and
 * TextDecoder, UTF-8 only, as the web defines them (an invalid byte decodes
 * to U+FFFD and decoding goes on). Installed only where they are missing, so
 * Node and browsers keep their own; MiddawUTF8 is the same code, always, for
 * the tests to hold against the real thing.
 */
(function (G) {
  'use strict';
  function encode(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
        else c = 0xFFFD;
      } else if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  function decode(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    var out = '', i = 0, n = b.length;
    while (i < n) {
      var c = b[i], need = 0, cp = 0, min = 0;
      if (c < 0x80) { out += String.fromCharCode(c); i++; continue; }
      else if (c >= 0xC2 && c <= 0xDF) { need = 1; cp = c & 0x1F; min = 0x80; }
      else if (c >= 0xE0 && c <= 0xEF) { need = 2; cp = c & 0x0F; min = 0x800; }
      else if (c >= 0xF0 && c <= 0xF4) { need = 3; cp = c & 0x07; min = 0x10000; }
      else { out += '�'; i++; continue; }
      var j = 1, ok = true;
      for (; j <= need; j++) {
        if (i + j >= n) { ok = false; break; }
        var x = b[i + j];
        // the second byte's range is narrower for a few leads (no overlongs, no surrogates)
        var lo = 0x80, hi = 0xBF;
        if (j === 1) {
          if (c === 0xE0) lo = 0xA0; else if (c === 0xED) hi = 0x9F;
          else if (c === 0xF0) lo = 0x90; else if (c === 0xF4) hi = 0x8F;
        }
        if (x < lo || x > hi) { ok = false; break; }
        cp = (cp << 6) | (x & 0x3F);
      }
      if (!ok || cp < min) { out += '�'; i += Math.max(1, j); continue; }
      if (cp >= 0x10000) { cp -= 0x10000; out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); }
      else out += String.fromCharCode(cp);
      i += need + 1;
    }
    return out;
  }
  function Enc() {}
  Enc.prototype.encode = function (s) { return encode(String(s === undefined ? '' : s)); };
  function Dec() {}
  Dec.prototype.decode = function (b) { return decode(b); };
  G.MiddawUTF8 = { TextEncoder: Enc, TextDecoder: Dec };
  if (typeof G.TextEncoder === 'undefined') G.TextEncoder = Enc;
  if (typeof G.TextDecoder === 'undefined') G.TextDecoder = Dec;
})(typeof globalThis !== 'undefined' ? globalThis : this);


/* ---- ../kit/runtime/lua_parse.js ---- */
/* Middaw's Lua 5.4, part 1 of 3: the lexer and the parser.
 *
 * Middaw runs the family's Lua engines (Good Idea, Midi Suggester, Midi
 * Variator, Midi Catalogue, Starting Blocks, DAW Battle Pass...) unchanged, in
 * the browser, with no third-party code: this file reads Lua source into a
 * syntax tree, lua_compile.js turns the tree into JavaScript, lua_runtime.js
 * supplies the values and the standard library. tests/js/test_lua.js holds
 * all three to what the real Lua 5.4 prints for the same programs.
 *
 * Source is a "byte string": one JS character per byte of the file, which is
 * how Lua itself sees a string, so `#s` and string.sub count bytes as Lua does.
 */
(function (NS) {
  'use strict';

  var KEYWORDS = {};
  ('and break do else elseif end false for function goto if in local nil not ' +
   'or repeat return then true until while').split(' ').forEach(function (k) { KEYWORDS[k] = true; });

  function LuaSyntaxError(message, chunk, line) {
    this.message = chunk + ':' + line + ': ' + message;
    this.line = line;
  }
  LuaSyntaxError.prototype = Object.create(Error.prototype);
  LuaSyntaxError.prototype.name = 'LuaSyntaxError';

  function isDigit(c) { return c >= 48 && c <= 57; }
  function isHex(c) { return isDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70); }
  function isAlpha(c) { return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95; }
  function isSpace(c) { return c === 32 || (c >= 9 && c <= 13); }

  // ---------------------------------------------------------------- lexer --
  function lex(src, chunk) {
    var toks = [];
    var i = 0, n = src.length, line = 1;
    function err(msg) { throw new LuaSyntaxError(msg, chunk, line); }
    function longBracketLevel(at) {   // at points to '['; returns level or -1
      var j = at + 1, level = 0;
      while (src.charCodeAt(j) === 61) { level++; j++; }
      return src.charCodeAt(j) === 91 ? level : -1;
    }
    function readLong(at, level) {    // returns [content, end index]
      var start = at + level + 2;
      // a newline straight after the opening bracket is skipped
      if (src[start] === '\r') { start++; if (src[start] === '\n') start++; }
      else if (src[start] === '\n') { start++; if (src[start] === '\r') start++; }
      var close = ']' + '='.repeat(level) + ']';
      var end = src.indexOf(close, start);
      if (end < 0) err('unfinished long string');
      var body = src.slice(start, end);
      for (var k = at; k < end + close.length; k++) if (src.charCodeAt(k) === 10) line++;
      return [body, end + close.length];
    }
    while (i < n) {
      var c = src.charCodeAt(i);
      if (c === 10) { line++; i++; continue; }
      if (isSpace(c)) { i++; continue; }
      if (c === 45 && src.charCodeAt(i + 1) === 45) {           // comment
        i += 2;
        if (src.charCodeAt(i) === 91) {
          var lvl = longBracketLevel(i);
          if (lvl >= 0) { i = readLong(i, lvl)[1]; continue; }
        }
        while (i < n && src.charCodeAt(i) !== 10) i++;
        continue;
      }
      var tline = line;
      if (isAlpha(c)) {
        var j = i + 1;
        while (j < n && (isAlpha(src.charCodeAt(j)) || isDigit(src.charCodeAt(j)))) j++;
        var word = src.slice(i, j);
        toks.push(KEYWORDS[word] ? { t: word, line: tline } : { t: 'name', v: word, line: tline });
        i = j; continue;
      }
      if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) {
        var j2 = i, isFloat = false, text;
        if (c === 48 && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          j2 = i + 2;
          while (j2 < n) {
            var d = src.charCodeAt(j2);
            if (isHex(d) || d === 46) { if (d === 46) isFloat = true; j2++; }
            else if ((d === 112 || d === 80)) {
              isFloat = true; j2++;
              if (src[j2] === '+' || src[j2] === '-') j2++;
            } else break;
          }
        } else {
          while (j2 < n) {
            var e = src.charCodeAt(j2);
            if (isDigit(e) || e === 46) { if (e === 46) isFloat = true; j2++; }
            else if (e === 101 || e === 69) {
              isFloat = true; j2++;
              if (src[j2] === '+' || src[j2] === '-') j2++;
            } else break;
          }
        }
        text = src.slice(i, j2);
        if (j2 < n && (isAlpha(src.charCodeAt(j2)))) err("malformed number near '" + text + src[j2] + "'");
        toks.push({ t: 'number', v: text, line: tline });
        i = j2; continue;
      }
      if (c === 34 || c === 39) {                                // short string
        var q = c, out = [], k = i + 1;
        for (;;) {
          if (k >= n) err('unfinished string');
          var ch = src.charCodeAt(k);
          if (ch === q) { k++; break; }
          if (ch === 10) err('unfinished string');
          if (ch === 92) {
            var x = src[k + 1];
            k += 2;
            switch (x) {
              case 'n': out.push('\n'); break;
              case 't': out.push('\t'); break;
              case 'r': out.push('\r'); break;
              case 'a': out.push('\x07'); break;
              case 'b': out.push('\b'); break;
              case 'f': out.push('\f'); break;
              case 'v': out.push('\v'); break;
              case '\\': out.push('\\'); break;
              case '"': out.push('"'); break;
              case "'": out.push("'"); break;
              case '\n': line++; out.push('\n'); break;
              case 'x': {
                var hx = src.slice(k, k + 2);
                if (!/^[0-9a-fA-F]{2}$/.test(hx)) err('hexadecimal digit expected');
                out.push(String.fromCharCode(parseInt(hx, 16))); k += 2; break;
              }
              case 'z': {
                while (k < n && isSpace(src.charCodeAt(k))) { if (src.charCodeAt(k) === 10) line++; k++; }
                break;
              }
              case 'u': {
                if (src[k] !== '{') err("missing '{' in \\u{xxxx}");
                var close = src.indexOf('}', k);
                var cp = parseInt(src.slice(k + 1, close), 16);
                k = close + 1;
                out.push(utf8Bytes(cp)); break;
              }
              default: {
                if (x !== undefined && isDigit(x.charCodeAt(0))) {
                  var digits = x; var m = 0;
                  while (m < 2 && isDigit(src.charCodeAt(k))) { digits += src[k]; k++; m++; }
                  var val = parseInt(digits, 10);
                  if (val > 255) err('decimal escape too large');
                  out.push(String.fromCharCode(val));
                } else err('invalid escape sequence');
              }
            }
            continue;
          }
          out.push(src[k]); k++;
        }
        toks.push({ t: 'string', v: out.join(''), line: tline });
        i = k; continue;
      }
      if (c === 91) {
        var lv = longBracketLevel(i);
        if (lv >= 0) {
          var r = readLong(i, lv);
          toks.push({ t: 'string', v: r[0], line: tline });
          i = r[1]; continue;
        }
      }
      var three = src.substr(i, 3), two = src.substr(i, 2);
      if (three === '...') { toks.push({ t: '...', line: tline }); i += 3; continue; }
      if (two === '==' || two === '~=' || two === '<=' || two === '>=' || two === '//' ||
          two === '::' || two === '<<' || two === '>>' || two === '..') {
        toks.push({ t: two, line: tline }); i += 2; continue;
      }
      var one = src[i];
      if ('+-*/%^#&~|<>=(){}[];:,.'.indexOf(one) >= 0) { toks.push({ t: one, line: tline }); i++; continue; }
      err("unexpected symbol near '" + one + "'");
    }
    toks.push({ t: '<eof>', line: line });
    return toks;
  }

  function utf8Bytes(cp) {
    if (cp < 0x80) return String.fromCharCode(cp);
    if (cp < 0x800) return String.fromCharCode(0xC0 | (cp >> 6), 0x80 | (cp & 63));
    if (cp < 0x10000) return String.fromCharCode(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    return String.fromCharCode(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }

  // --------------------------------------------------------------- parser --
  // Binary priorities exactly as lparser.c has them: { left, right }.
  var BINARY = {
    '+': [10, 10], '-': [10, 10], '*': [11, 11], '%': [11, 11], '^': [14, 13],
    '/': [11, 11], '//': [11, 11], '&': [6, 6], '|': [4, 4], '~': [5, 5],
    '<<': [7, 7], '>>': [7, 7], '..': [9, 8],
    '==': [3, 3], '<': [3, 3], '<=': [3, 3], '~=': [3, 3], '>': [3, 3], '>=': [3, 3],
    'and': [2, 2], 'or': [1, 1]
  };
  var UNARY_PRIORITY = 12;

  function parse(src, chunk) {
    chunk = chunk || '?';
    var toks = lex(src, chunk);
    var p = 0;
    function peek() { return toks[p]; }
    function next() { return toks[p++]; }
    function check(t) { return toks[p].t === t; }
    function err(msg, tok) {
      tok = tok || toks[p];
      var near = tok.t === '<eof>' ? '<eof>' : (tok.v !== undefined ? tok.v : tok.t);
      throw new LuaSyntaxError(msg + " near '" + near + "'", chunk, tok.line);
    }
    function expect(t, what) {
      if (toks[p].t !== t) err("'" + t + "' expected" + (what ? ' (to close ' + what + ')' : ''));
      return toks[p++];
    }
    function accept(t) { if (toks[p].t === t) { p++; return true; } return false; }
    function name() {
      if (toks[p].t !== 'name') err('<name> expected');
      return toks[p++].v;
    }

    function blockFollow(withUntil) {
      var t = toks[p].t;
      return t === 'else' || t === 'elseif' || t === 'end' || t === '<eof>' || (withUntil && t === 'until');
    }

    function block() {
      var body = [];
      while (!blockFollow(true)) {
        if (check('return')) { body.push(retstat()); break; }
        var s = statement();
        if (s) body.push(s);
      }
      return body;
    }

    function retstat() {
      var tok = next();
      var exprs = [];
      if (!blockFollow(true) && !check(';')) exprs = exprlist();
      accept(';');
      return { k: 'Return', exprs: exprs, line: tok.line };
    }

    function statement() {
      var tok = peek(), line = tok.line;
      switch (tok.t) {
        case ';': next(); return null;
        case 'if': return ifstat();
        case 'while': {
          next(); var cond = expr(); expect('do'); var b = block(); expect('end', 'while');
          return { k: 'While', cond: cond, body: b, line: line };
        }
        case 'do': { next(); var b2 = block(); expect('end', 'do'); return { k: 'Do', body: b2, line: line }; }
        case 'for': return forstat();
        case 'repeat': {
          next(); var b3 = block(); expect('until', 'repeat'); var c3 = expr();
          return { k: 'Repeat', body: b3, cond: c3, line: line };
        }
        case 'function': {
          next();
          var target = { k: 'Name', name: name(), line: line }, isMethod = false;
          while (check('.') || check(':')) {
            var sep = next().t;
            var key = name();
            target = { k: 'Index', obj: target, key: { k: 'String', v: key }, line: line };
            if (sep === ':') { isMethod = true; break; }
          }
          var f = funcbody(isMethod, line);
          return { k: 'Assign', targets: [target], exprs: [f], line: line };
        }
        case 'local': {
          next();
          if (accept('function')) {
            var nm = name();
            return { k: 'LocalFunction', name: nm, func: funcbody(false, line), line: line };
          }
          var names = [], attribs = [];
          do {
            names.push(name());
            if (accept('<')) { attribs.push(name()); expect('>'); } else attribs.push(null);
          } while (accept(','));
          var exprs = accept('=') ? exprlist() : [];
          return { k: 'Local', names: names, attribs: attribs, exprs: exprs, line: line };
        }
        case '::': { next(); var label = name(); expect('::'); return { k: 'Label', name: label, line: line }; }
        case 'return': return retstat();
        case 'break': next(); return { k: 'Break', line: line };
        case 'goto': next(); return { k: 'Goto', name: name(), line: line };
        default: return exprstat();
      }
    }

    function ifstat() {
      var line = next().line;
      var clauses = [];
      var cond = expr(); expect('then');
      clauses.push({ cond: cond, body: block() });
      var orelse = null;
      for (;;) {
        if (accept('elseif')) { var c = expr(); expect('then'); clauses.push({ cond: c, body: block() }); }
        else if (accept('else')) { orelse = block(); expect('end', 'if'); break; }
        else { expect('end', 'if'); break; }
      }
      return { k: 'If', clauses: clauses, orelse: orelse, line: line };
    }

    function forstat() {
      var line = next().line;
      var n1 = name();
      if (accept('=')) {
        var start = expr(); expect(',');
        var limit = expr();
        var step = accept(',') ? expr() : null;
        expect('do'); var b = block(); expect('end', 'for');
        return { k: 'NumFor', name: n1, start: start, limit: limit, step: step, body: b, line: line };
      }
      var names = [n1];
      while (accept(',')) names.push(name());
      expect('in');
      var exprs = exprlist();
      expect('do'); var body = block(); expect('end', 'for');
      return { k: 'GenFor', names: names, exprs: exprs, body: body, line: line };
    }

    function exprstat() {
      var line = peek().line;
      var e = suffixedexp();
      if (check('=') || check(',')) {
        var targets = [e];
        while (accept(',')) targets.push(suffixedexp());
        expect('=');
        var exprs = exprlist();
        targets.forEach(function (t) { if (t.k !== 'Name' && t.k !== 'Index') err('syntax error'); });
        return { k: 'Assign', targets: targets, exprs: exprs, line: line };
      }
      if (e.k !== 'Call' && e.k !== 'Method') err('syntax error');
      return { k: 'ExprStat', expr: e, line: line };
    }

    function exprlist() {
      var list = [expr()];
      while (accept(',')) list.push(expr());
      return list;
    }

    function funcbody(isMethod, line) {
      var params = isMethod ? ['self'] : [], vararg = false;
      expect('(');
      if (!check(')')) {
        do {
          if (accept('...')) { vararg = true; break; }
          params.push(name());
        } while (accept(','));
      }
      expect(')');
      var b = block();
      var endTok = expect('end', 'function');
      return { k: 'Function', params: params, vararg: vararg, body: b, line: line, endLine: endTok.line };
    }

    function primaryexp() {
      var tok = peek();
      if (tok.t === 'name') { next(); return { k: 'Name', name: tok.v, line: tok.line }; }
      if (tok.t === '(') {
        next(); var e = expr(); expect(')');
        return { k: 'Paren', expr: e, line: tok.line };
      }
      err('unexpected symbol');
    }

    function suffixedexp() {
      var e = primaryexp();
      for (;;) {
        var tok = peek();
        switch (tok.t) {
          case '.': next(); e = { k: 'Index', obj: e, key: { k: 'String', v: name() }, line: tok.line }; break;
          case '[': next(); var key = expr(); expect(']'); e = { k: 'Index', obj: e, key: key, line: tok.line }; break;
          case ':': next(); var m = name(); e = { k: 'Method', obj: e, name: m, args: callargs(), line: tok.line }; break;
          case '(': case 'string': case '{': e = { k: 'Call', fn: e, args: callargs(), line: tok.line }; break;
          default: return e;
        }
      }
    }

    function callargs() {
      var tok = peek();
      if (tok.t === 'string') { next(); return [{ k: 'String', v: tok.v }]; }
      if (tok.t === '{') return [tablecons()];
      expect('(');
      if (accept(')')) return [];
      var args = exprlist();
      expect(')');
      return args;
    }

    function tablecons() {
      var line = expect('{').line;
      var items = [];   // { kind: 'pos'|'named'|'keyed', key, value }
      while (!check('}')) {
        if (check('name') && toks[p + 1].t === '=') {
          var key = next().v; next();
          items.push({ kind: 'keyed', key: { k: 'String', v: key }, value: expr() });
        } else if (check('[')) {
          next(); var k = expr(); expect(']'); expect('=');
          items.push({ kind: 'keyed', key: k, value: expr() });
        } else {
          items.push({ kind: 'pos', value: expr() });
        }
        if (!accept(',') && !accept(';')) break;
      }
      expect('}', 'table');
      return { k: 'Table', items: items, line: line };
    }

    function simpleexp() {
      var tok = peek();
      switch (tok.t) {
        case 'number': next(); return { k: 'Number', v: tok.v, line: tok.line };
        case 'string': next(); return { k: 'String', v: tok.v };
        case 'nil': next(); return { k: 'Nil' };
        case 'true': next(); return { k: 'True' };
        case 'false': next(); return { k: 'False' };
        case '...': next(); return { k: 'Vararg', line: tok.line };
        case '{': return tablecons();
        case 'function': next(); return funcbody(false, tok.line);
        default: return suffixedexp();
      }
    }

    function expr(limit) {
      limit = limit || 0;
      var left, tok = peek();
      if (tok.t === 'not' || tok.t === '-' || tok.t === '#' || tok.t === '~') {
        next();
        left = { k: 'Unop', op: tok.t, expr: expr(UNARY_PRIORITY), line: tok.line };
      } else {
        left = simpleexp();
      }
      for (;;) {
        var op = peek().t, pr = BINARY[op];
        if (!pr || pr[0] <= limit) break;
        var line = next().line;
        var right = expr(pr[1]);
        left = { k: 'Binop', op: op, left: left, right: right, line: line };
      }
      return left;
    }

    var body = block();
    if (!check('<eof>')) err("'<eof>' expected");
    return { k: 'Chunk', body: body };
  }

  NS.lex = lex;
  NS.parse = parse;
  NS.LuaSyntaxError = LuaSyntaxError;
  NS.utf8Bytes = utf8Bytes;
})(typeof module === 'object' && module.exports
  ? (module.exports = (globalThis.MiddawLua = globalThis.MiddawLua || {}))
  : (globalThis.MiddawLua = globalThis.MiddawLua || {}));


/* ---- ../kit/runtime/lua_runtime.js ---- */
/* Middaw's Lua 5.4, part 3 of 3: values, operators and the standard library.
 *
 * Values, as JavaScript sees them:
 *   nil      undefined
 *   boolean  true / false
 *   number   a JS number. An integral JS number is a Lua *integer*; a
 *            non-integral one (or inf, nan) is a Lua *float*. A float whose
 *            value happens to be integral (4.0, 2/2) is an LFloat, so that it
 *            still prints "4.0" and math.type still says "float".
 *   string   a JS string with one character per byte (0-255)
 *   table    LuaTable
 *   function a JS function: Lua arguments in, and undefined, one value, or a
 *            Multi for two or more results.
 *
 * Wherever the result has to match the real Lua byte for byte - table.sort
 * with ties, the pattern matcher, math.random, number formatting - the code
 * is a port of Lua 5.4's own C, not a lookalike.
 */
(function (NS) {
  'use strict';

  // ------------------------------------------------------------ values ----
  function LFloat(n) { this.n = n; }
  LFloat.prototype.valueOf = function () { return this.n; };

  function mkf(x) { return Number.isInteger(x) ? new LFloat(x) : x; }
  function isNum(v) { return typeof v === 'number' || v instanceof LFloat; }
  function num(v) { return typeof v === 'number' ? v : v.n; }
  function isFloatVal(v) { return v instanceof LFloat || (typeof v === 'number' && !Number.isInteger(v)); }

  function Multi(a) { this.a = a; }
  function first(v) { return v instanceof Multi ? v.a[0] : v; }
  // `return` with no values gives NONE; a bare undefined is one nil.
  var NONE = new Multi([]);
  var NIL1 = Object.freeze([undefined]);
  function sp(v) {
    if (v instanceof Multi) return v.a;
    return v === undefined ? NIL1 : [v];
  }
  function ret(list) {
    if (list.length === 0) return NONE;
    if (list.length === 1) return list[0];
    return new Multi(list);
  }

  var tableIds = 0;
  function LuaTable() { this.arr = []; this.hash = null; this.mt = null; this.id = 0; this.hver = 0; }
  LuaTable.prototype.get = function (k) {
    if (typeof k === 'number') {
      var a = this.arr;
      if (k > 0 && k <= a.length && Number.isInteger(k)) return a[k - 1];
    } else if (typeof k === 'string') {
      return this.hash === null ? undefined : this.hash.get(k);
    } else if (k instanceof LFloat) {
      return this.get(k.n);
    }
    return this.hash === null ? undefined : this.hash.get(k);
  };
  LuaTable.prototype.set = function (k, v) {
    if (typeof k === 'number') {
      if (Number.isInteger(k) && k > 0) {
        var a = this.arr, n = a.length;
        if (k <= n) {
          a[k - 1] = v;
          if (v === undefined && k === n) { while (a.length && a[a.length - 1] === undefined) a.pop(); }
          return;
        }
        if (k === n + 1) {
          if (v === undefined) { if (this.hash !== null) this.hash.delete(k); return; }
          a.push(v);
          if (this.hash !== null && this.hash.size) {
            var h = this.hash;
            while (h.has(a.length + 1)) { var nk = a.length + 1; a.push(h.get(nk)); h.delete(nk); }
          }
          return;
        }
      } else if (k !== k) {
        throw rterror('table index is NaN');
      }
    } else if (k instanceof LFloat) {
      return this.set(k.n, v);
    } else if (k === undefined) {
      throw rterror('table index is nil');
    }
    if (v === undefined) { if (this.hash !== null) this.hash.delete(k); return; }
    if (this.hash === null) this.hash = new Map();
    if (!this.hash.has(k)) this.hver++;
    this.hash.set(k, v);
  };
  LuaTable.prototype.length = function () { return this.arr.length; };

  // ------------------------------------------------------------ errors ----
  // Compiled chunks register their line maps here, so an error can say
  // "gi_idea.lua:1234:" as the real Lua would.
  var lineMaps = {};
  function luaPosition(level) {
    var stack = new Error().stack || '';
    var re = /lua:([^:\s()]+):(\d+):\d+/g, m, found = 0;
    while ((m = re.exec(stack)) !== null) {
      found++;
      if (found >= level) {
        var map = lineMaps[m[1]];
        var line = map ? map[Number(m[2]) - 1] : undefined;
        if (line) return m[1] + ':' + line + ': ';
        return m[1] + ': ';
      }
    }
    return '';
  }
  function LuaError(value, traceback) {
    this.value = value;
    this.message = typeof value === 'string' ? value : tostring(value);
    this.luaTraceback = traceback;
    this.stack = new Error().stack;
  }
  LuaError.prototype = Object.create(Error.prototype);
  LuaError.prototype.name = 'LuaError';
  function rterror(msg) { return new LuaError(luaPosition(1) + msg); }

  function typeName(v) {
    if (v === undefined || v === null) return 'nil';
    switch (typeof v) {
      case 'boolean': return 'boolean';
      case 'number': return 'number';
      case 'string': return 'string';
      case 'function': return 'function';
    }
    if (v instanceof LFloat) return 'number';
    if (v instanceof LuaTable) return 'table';
    return 'userdata';
  }

  // --------------------------------------------------------- numbers ----
  // Exact decimal expansion of a double: x = D * 10^-s, D a BigInt.
  var F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  function exactDecimal(x) {
    F64[0] = x;
    var hi = U32[1], lo = U32[0];
    var exp = (hi >>> 20) & 0x7ff;
    var mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    if (exp === 0) exp = 1; else mant |= 1n << 52n;
    var e = exp - 1075;
    if (e >= 0) return { D: mant << BigInt(e), s: 0 };
    return { D: mant * (5n ** BigInt(-e)), s: -e };
  }
  function roundDiv(N, div) {      // round N/div half to even
    var q = N / div, r = N % div;
    var twice = r * 2n;
    if (twice > div || (twice === div && (q & 1n) === 1n)) q += 1n;
    return q;
  }
  function fixedDigits(x, f) {     // |x| to f decimals, C-exact; returns string
    var ex = exactDecimal(Math.abs(x));
    var q;
    if (f >= ex.s) q = ex.D * (10n ** BigInt(f - ex.s));
    else q = roundDiv(ex.D, 10n ** BigInt(ex.s - f));
    var s = q.toString();
    if (f === 0) return s;
    while (s.length <= f) s = '0' + s;
    return s.slice(0, s.length - f) + '.' + s.slice(s.length - f);
  }
  function expDigits(x, prec) {    // |x| as d.ddd with prec decimals; returns [mantissa, exponent]
    if (x === 0) return [prec > 0 ? '0.' + '0'.repeat(prec) : '0', 0];
    var ex = exactDecimal(Math.abs(x));
    var D = ex.D.toString();
    var X = D.length - 1 - ex.s;
    var P = prec + 1, q;
    if (D.length > P) {
      q = roundDiv(ex.D, 10n ** BigInt(D.length - P)).toString();
      if (q.length > P) { q = q.slice(0, P); X++; }
    } else q = D + '0'.repeat(P - D.length);
    return [prec > 0 ? q[0] + '.' + q.slice(1) : q, X];
  }
  function fmtExp(x, prec, upper) {
    var r = expDigits(x, prec);
    var X = r[1];
    var s = r[0] + (upper ? 'E' : 'e') + (X < 0 ? '-' : '+') + (Math.abs(X) < 10 ? '0' : '') + Math.abs(X);
    return s;
  }
  function stripZeros(s) {
    if (s.indexOf('.') < 0) return s;
    s = s.replace(/0+$/, '');
    return s.replace(/\.$/, '');
  }
  function fmtG(x, P, upper, alt) {   // C's %g of |x|
    if (P === 0) P = 1;
    if (x === 0) return '0';
    var X = expDigits(x, P - 1)[1];
    var s;
    if (X < -4 || X >= P) {
      var r = expDigits(x, P - 1);
      var m = alt ? r[0] : stripZeros(r[0]);
      s = m + (upper ? 'E' : 'e') + (r[1] < 0 ? '-' : '+') + (Math.abs(r[1]) < 10 ? '0' : '') + Math.abs(r[1]);
    } else {
      s = fixedDigits(x, P - 1 - X);
      if (!alt) s = stripZeros(s);
    }
    return s;
  }
  function floatStr(x) {
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    if (x !== x) return (1 / x) < 0 ? 'nan' : '-nan';
    var neg = x < 0 || (x === 0 && 1 / x < 0);
    var s = (neg ? '-' : '') + fmtG(x, 14, false, false);
    if (/^-?\d+$/.test(s)) s += '.0';
    return s;
  }
  function intStr(n) {
    if (Math.abs(n) <= 9007199254740992) return String(n === 0 ? 0 : n);
    return BigInt(n).toString();
  }
  // io.write prints a float with LUA_NUMBER_FMT alone: 1.0 is "1".
  function writeNum(v) {
    if (!isNum(v)) throw rterror('bad argument to \'write\' (string expected, got ' + typeName(v) + ')');
    if (typeof v === 'number' && Number.isInteger(v)) return intStr(v);
    var x = num(v);
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    if (x !== x) return '-nan';
    return (x < 0 || (x === 0 && 1 / x < 0) ? '-' : '') + fmtG(Math.abs(x), 14, false, false);
  }
  function numStr(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? intStr(v) : floatStr(v);
    return floatStr(v.n);
  }

  // lua_stringtonumber: a whole numeral, spaces either side, or undefined.
  function str2num(s) {
    var t = s.replace(/^[ \f\n\r\t\v]+|[ \f\n\r\t\v]+$/g, '');
    var m;
    if ((m = /^([+-])?0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?(?:[pP]([+-]?\d+))?$/.exec(t))) {
      var ip = m[2], fp = m[3], ex = m[4];
      if (!ip && !fp) return undefined;
      var neg = m[1] === '-';
      if (fp === undefined && ex === undefined) {
        var big = BigInt.asIntN(64, BigInt('0x' + ip));
        var n = Number(big);
        return neg ? 0 - n : n;
      }
      var val = 0;
      for (var i = 0; i < ip.length; i++) val = val * 16 + parseInt(ip[i], 16);
      var scale = 1 / 16;
      fp = fp || '';
      for (var j = 0; j < fp.length; j++) { val += parseInt(fp[j], 16) * scale; scale /= 16; }
      if (ex) val *= Math.pow(2, Number(ex));
      return mkf(neg ? -val : val);
    }
    if ((m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.exec(t))) {
      var isInt = m[1].indexOf('.') < 0 && !m[2];
      var v = Number(t);
      if (isInt) {
        if (Math.abs(v) <= 9223372036854775807) return v;
        return mkf(v);
      }
      return mkf(v);
    }
    return undefined;
  }

  function toNumberArith(v, op) {
    if (typeof v === 'number') return v;
    if (v instanceof LFloat) return v;
    if (typeof v === 'string') { var n = str2num(v); if (n !== undefined) return n; }
    return null;
  }
  function arithError(op, a, b) {
    var bad = (isNum(a) || (typeof a === 'string' && str2num(a) !== undefined)) ? b : a;
    if (op === 'concat') return rterror('attempt to concatenate a ' + typeName(bad) + ' value');
    if (op === 'bit') return rterror('attempt to perform bitwise operation on a ' + typeName(bad) + ' value');
    return rterror('attempt to perform arithmetic on a ' + typeName(bad) + ' value');
  }
  function metaOf(v) {
    if (v instanceof LuaTable) return v.mt;
    if (typeof v === 'string') return stringMeta;
    return null;
  }
  function metaBin(ev, a, b) {
    var mt = metaOf(a), h = mt && mt.get(ev);
    if (h === undefined) { mt = metaOf(b); h = mt && mt.get(ev); }
    if (h === undefined || h === null) return NOMETA;
    return first(call(h)(a, b));
  }
  var NOMETA = {};

  function arithSlow(op, a, b, ev) {
    var x = toNumberArith(a), y = toNumberArith(b);
    if (x === null || y === null) {
      var r = metaBin(ev, a, b);
      if (r !== NOMETA) return r;
      throw arithError(op, a, b);
    }
    switch (op) {
      case 'add': return add(x, y);
      case 'sub': return sub(x, y);
      case 'mul': return mul(x, y);
      case 'div': return div(x, y);
      case 'mod': return mod(x, y);
      case 'idiv': return idiv(x, y);
      case 'pow': return pow(x, y);
    }
  }
  function add(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      var r = a + b;
      return (Number.isInteger(a) && Number.isInteger(b)) ? r : mkf(r);
    }
    if (isNum(a) && isNum(b)) return mkf(num(a) + num(b));
    return arithSlow('add', a, b, '__add');
  }
  function sub(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      var r = a - b;
      return (Number.isInteger(a) && Number.isInteger(b)) ? r : mkf(r);
    }
    if (isNum(a) && isNum(b)) return mkf(num(a) - num(b));
    return arithSlow('sub', a, b, '__sub');
  }
  function mul(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      var r = a * b;
      if (Number.isInteger(a) && Number.isInteger(b)) return r === 0 ? 0 : r;
      return mkf(r);
    }
    if (isNum(a) && isNum(b)) return mkf(num(a) * num(b));
    return arithSlow('mul', a, b, '__mul');
  }
  function div(a, b) {
    if (isNum(a) && isNum(b)) return mkf(num(a) / num(b));
    return arithSlow('div', a, b, '__div');
  }
  function idiv(a, b) {
    if (typeof a === 'number' && typeof b === 'number' && Number.isInteger(a) && Number.isInteger(b)) {
      if (b === 0) throw rterror("attempt to perform 'n//0'");
      var q = Math.floor(a / b);
      return q === 0 ? 0 : q;
    }
    if (isNum(a) && isNum(b)) return mkf(Math.floor(num(a) / num(b)));
    return arithSlow('idiv', a, b, '__idiv');
  }
  function mod(a, b) {
    if (typeof a === 'number' && typeof b === 'number' && Number.isInteger(a) && Number.isInteger(b)) {
      if (b === 0) throw rterror("attempt to perform 'n%%0'");
      var r = a % b;
      if (r !== 0 && (r < 0) !== (b < 0)) r += b;
      return r === 0 ? 0 : r;
    }
    if (isNum(a) && isNum(b)) {
      var x = num(a), y = num(b);
      var m;
      if (y === Infinity || y === -Infinity) m = x;
      else m = x % y;
      if ((m > 0) ? y < 0 : (m < 0 && y !== m)) m += y;
      return mkf(m);
    }
    return arithSlow('mod', a, b, '__mod');
  }
  function pow(a, b) {
    if (isNum(a) && isNum(b)) return mkf(Math.pow(num(a), num(b)));
    return arithSlow('pow', a, b, '__pow');
  }
  function unm(a) {
    if (typeof a === 'number') return Number.isInteger(a) ? 0 - a : -a;
    if (a instanceof LFloat) return new LFloat(-a.n);
    var x = toNumberArith(a);
    if (x !== null) return unm(x);
    var mt = metaOf(a), h = mt && mt.get('__unm');
    if (h !== undefined && h !== null) return first(call(h)(a, a));
    throw rterror('attempt to perform arithmetic on a ' + typeName(a) + ' value');
  }

  // Bitwise operations work on 64-bit integers.
  function toInt64(v, a, b) {
    var x = typeof v === 'string' ? str2num(v) : v;
    if (typeof x === 'number' && Number.isInteger(x)) return BigInt(x);
    if (x instanceof LFloat) return BigInt(x.n);
    if (typeof x === 'number') throw rterror('number has no integer representation');
    throw arithError('bit', a, b);
  }
  function fromInt64(big) { return Number(BigInt.asIntN(64, big)); }
  function small(a, b) {
    return typeof a === 'number' && typeof b === 'number' && (a | 0) === a && (b | 0) === b;
  }
  function band(a, b) { if (small(a, b)) return a & b; return bitSlow('__band', a, b, function (x, y) { return x & y; }); }
  function bor(a, b) { if (small(a, b)) return a | b; return bitSlow('__bor', a, b, function (x, y) { return x | y; }); }
  function bxor(a, b) { if (small(a, b)) return a ^ b; return bitSlow('__bxor', a, b, function (x, y) { return x ^ y; }); }
  function shiftLeft(x, n) {
    if (n <= -64n || n >= 64n) return 0n;
    if (n >= 0n) return BigInt.asUintN(64, x << n);
    return BigInt.asUintN(64, x) >> (-n);
  }
  function shl(a, b) { return bitSlow('__shl', a, b, function (x, y) { return shiftLeft(x, y); }); }
  function shr(a, b) { return bitSlow('__shr', a, b, function (x, y) { return shiftLeft(x, -y); }); }
  function bnot(a) {
    if (typeof a === 'number' && (a | 0) === a) return ~a;
    var mt = metaOf(a), h = mt && mt.get('__bnot');
    if (h !== undefined && h !== null && !isNum(a)) return first(call(h)(a, a));
    return fromInt64(~toInt64(a, a, a));
  }
  function bitSlow(ev, a, b, f) {
    if (!((isNum(a) || typeof a === 'string') && (isNum(b) || typeof b === 'string'))) {
      var r = metaBin(ev, a, b);
      if (r !== NOMETA) return r;
    }
    return fromInt64(f(toInt64(a, a, b), toInt64(b, a, b)));
  }

  function concat(a, b) {
    var ta = typeof a, tb = typeof b;
    if (ta === 'string' && tb === 'string') return a + b;
    if ((ta === 'string' || isNum(a)) && (tb === 'string' || isNum(b))) {
      return (ta === 'string' ? a : numStr(a)) + (tb === 'string' ? b : numStr(b));
    }
    var r = metaBin('__concat', a, b);
    if (r !== NOMETA) return r;
    throw arithError('concat', a, b);
  }

  function len(v) {
    if (typeof v === 'string') return v.length;
    if (v instanceof LuaTable) {
      if (v.mt !== null) {
        var h = v.mt.get('__len');
        if (h !== undefined) return first(call(h)(v));
      }
      return v.arr.length;
    }
    var mt = metaOf(v), h2 = mt && mt.get('__len');
    if (h2 !== undefined && h2 !== null) return first(call(h2)(v));
    throw rterror('attempt to get length of a ' + typeName(v) + ' value');
  }

  function eq(a, b) {
    if (a === b) return true;
    var ta = typeof a, tb = typeof b;
    if (ta === 'object' || tb === 'object') {
      if (isNum(a) && isNum(b)) return num(a) === num(b);
      if (a instanceof LuaTable && b instanceof LuaTable) {
        var h = (a.mt && a.mt.get('__eq')) || (b.mt && b.mt.get('__eq'));
        if (h) return truthy(first(call(h)(a, b)));
      }
    }
    return false;
  }
  function lt(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a < b;
    if (isNum(a) && isNum(b)) return num(a) < num(b);
    if (typeof a === 'string' && typeof b === 'string') return a < b;
    var r = metaBin('__lt', a, b);
    if (r !== NOMETA) return truthy(r);
    throw compareError(a, b);
  }
  function le(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a <= b;
    if (isNum(a) && isNum(b)) return num(a) <= num(b);
    if (typeof a === 'string' && typeof b === 'string') return a <= b;
    var r = metaBin('__le', a, b);
    if (r !== NOMETA) return truthy(r);
    throw compareError(a, b);
  }
  function gt(a, b) { return lt(b, a); }
  function ge(a, b) { return le(b, a); }
  function compareError(a, b) {
    var t1 = typeName(a), t2 = typeName(b);
    if (t1 === t2) return rterror('attempt to compare two ' + t1 + ' values');
    return rterror('attempt to compare ' + t1 + ' with ' + t2);
  }
  function truthy(v) { return v !== undefined && v !== false && v !== null; }

  // ------------------------------------------------------- indexing ----
  function index(o, k, desc) {
    if (o instanceof LuaTable) {
      var v = o.get(k);
      if (v !== undefined || o.mt === null) return v;
      return metaIndex(o, k, desc);
    }
    if (typeof o === 'string') return stringLib.get(k);
    return metaIndex(o, k, desc);
  }
  function metaIndex(o, k, desc) {
    for (var loop = 0; loop < 100; loop++) {
      var h;
      if (o instanceof LuaTable) {
        var v = o.get(k);
        if (v !== undefined) return v;
        if (o.mt === null) return undefined;
        h = o.mt.get('__index');
        if (h === undefined) return undefined;
      } else {
        var mt = metaOf(o);
        h = mt && mt.get('__index');
        if (h === undefined || h === null) {
          throw rterror('attempt to index a ' + typeName(o) + ' value' + (desc ? ' (' + desc + ')' : ''));
        }
      }
      if (typeof h === 'function') return first(h(o, k));
      o = h;
    }
    throw rterror("'__index' chain too long; possible loop");
  }
  function setindex(o, k, v, desc) {
    if (o instanceof LuaTable) {
      if (o.mt === null) { o.set(k, v); return; }
      var h = o.mt.get('__newindex');
      if (h === undefined || o.get(k) !== undefined) { o.set(k, v); return; }
      if (typeof h === 'function') { h(o, k, v); return; }
      return setindex(h, k, v);
    }
    throw rterror('attempt to index a ' + typeName(o) + ' value' + (desc ? ' (' + desc + ')' : ''));
  }

  function call(f, desc) {
    if (typeof f === 'function') return f;
    var mt = metaOf(f), h = mt && mt.get('__call');
    if (typeof h === 'function') return function () {
      var args = [f];
      for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
      return h.apply(null, args);
    };
    throw rterror('attempt to call a ' + typeName(f) + ' value' + (desc ? ' (' + desc + ')' : ''));
  }
  function method(o, name) {
    var f = index(o, name, 'method \'' + name + '\'');
    if (typeof f !== 'function') f = call(f, "method '" + name + "'");
    var args = [o];
    for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
    return f.apply(null, args);
  }

  function tbl(list, keyed) {
    var t = new LuaTable();
    if (list.length) {
      var a = list.slice();
      while (a.length && a[a.length - 1] === undefined) a.pop();
      t.arr = a;
    }
    if (keyed) {
      for (var i = 0; i < keyed.length; i += 2) {
        if (keyed[i] === undefined) throw rterror('table index is nil');
        if (keyed[i + 1] !== undefined) t.set(keyed[i], keyed[i + 1]);
      }
    }
    return t;
  }

  // ------------------------------------------------------- iteration ----
  function IpairsIter(t) { this.t = t; this.i = 0; this.a = undefined; this.b = undefined; }
  IpairsIter.prototype.step = function () {
    var i = this.i + 1, v = this.t.get(i);
    if (v === undefined) return false;
    this.i = i; this.a = i; this.b = v; return true;
  };
  function PairsIter(t) { this.t = t; this.i = 0; this.it = null; this.a = undefined; this.b = undefined; }
  PairsIter.prototype.step = function () {
    var arr = this.t.arr;
    while (this.it === null && this.i < arr.length) {
      var v = arr[this.i++];
      if (v !== undefined) { this.a = this.i; this.b = v; return true; }
    }
    if (this.it === null) {
      if (this.t.hash === null) return false;
      this.it = this.t.hash.entries();
    }
    var n = this.it.next();
    if (n.done) return false;
    this.a = n.value[0]; this.b = n.value[1];
    return true;
  };
  function GenIter(f, s, c) { this.f = call(f, 'for iterator'); this.s = s; this.c = c; this.a = undefined; this.b = undefined; this.v = NONE; }
  GenIter.prototype.step = function () {
    var r = this.f(this.s, this.c);
    var v = r instanceof Multi ? r.a : [r];
    if (v[0] === undefined) return false;
    this.c = v[0]; this.a = v[0]; this.b = v[1]; this.v = v;
    return true;
  };
  function iter(f, s, c) {
    if (f === ipairsAux && s instanceof LuaTable && s.mt === null) return new IpairsIter(s);
    if (f === luaNext && s instanceof LuaTable && c === undefined && s.mt === null) return new PairsIter(s);
    return new GenIter(f, s, c);
  }

  function forprep(a, b, c) {
    if (c === undefined) c = 1;
    if (!isNum(a)) throw rterror("'for' initial value must be a number");
    if (!isNum(b)) throw rterror("'for' limit must be a number");
    if (!isNum(c)) throw rterror("'for' step must be a number");
    var x = num(a), lim = num(b), st = num(c);
    if (st === 0) throw rterror("'for' step is zero");
    var intLoop = typeof a === 'number' && Number.isInteger(a) && typeof c === 'number' && Number.isInteger(c);
    if (intLoop) {
      if (!(typeof b === 'number' && Number.isInteger(b))) {
        if (lim !== lim) return [1, 0, 1, false];
        lim = st > 0 ? Math.floor(lim) : Math.ceil(lim);
      }
      return [x, lim, st, false];
    }
    return [x, lim, st, true];
  }

  // ------------------------------------------------------- tostring ----
  function tostring(v) {
    if (v === undefined || v === null) return 'nil';
    switch (typeof v) {
      case 'string': return v;
      case 'number': return numStr(v);
      case 'boolean': return v ? 'true' : 'false';
      case 'function': return 'function: ' + addressOf(v);
    }
    if (v instanceof LFloat) return floatStr(v.n);
    if (v instanceof LuaTable) {
      if (v.mt !== null) {
        var h = v.mt.get('__tostring');
        if (h !== undefined) {
          var s = first(call(h)(v));
          if (typeof s !== 'string') throw rterror("'__tostring' must return a string");
          return s;
        }
        var nm = v.mt.get('__name');
        if (typeof nm === 'string') return nm + ': ' + addressOf(v);
      }
      return 'table: ' + addressOf(v);
    }
    return 'userdata: ' + addressOf(v);
  }
  var addresses = new WeakMap(), nextAddress = 0x55d0c0de0000;
  function addressOf(o) {
    var a = addresses.get(o);
    if (a === undefined) { a = nextAddress; nextAddress += 0x40; addresses.set(o, a); }
    return '0x' + a.toString(16).padStart(14, '0');
  }

  // ===================================================== the library ======
  function argError(n, fname, msg) { return rterror("bad argument #" + n + " to '" + fname + "' (" + msg + ')'); }
  function checkTable(v, n, fname) {
    if (!(v instanceof LuaTable)) throw argError(n, fname, 'table expected, got ' + typeNameArg(v));
    return v;
  }
  function typeNameArg(v) { return v === undefined ? 'no value' : typeName(v); }
  function checkInt(v, n, fname) {
    if (typeof v === 'number' && Number.isInteger(v)) return v;
    if (v instanceof LFloat) return v.n;
    if (typeof v === 'string') { var x = str2num(v); if (x !== undefined) return checkInt(x, n, fname); }
    if (typeof v === 'number') throw argError(n, fname, 'number has no integer representation');
    throw argError(n, fname, 'number expected, got ' + typeNameArg(v));
  }
  function optInt(v, n, fname, d) { return v === undefined ? d : checkInt(v, n, fname); }
  function checkNum(v, n, fname) {
    if (typeof v === 'number') return v;
    if (v instanceof LFloat) return v.n;
    if (typeof v === 'string') { var x = str2num(v); if (x !== undefined) return num(x); }
    throw argError(n, fname, 'number expected, got ' + typeNameArg(v));
  }
  function checkStr(v, n, fname) {
    if (typeof v === 'string') return v;
    if (isNum(v)) return numStr(v);
    throw argError(n, fname, 'string expected, got ' + typeNameArg(v));
  }

  function rawLen(t) { return t instanceof LuaTable ? t.arr.length : (typeof t === 'string' ? t.length : 0); }

  // ---------------------------------------------------------- base ------
  function luaNext(t, k) {
    checkTable(t, 1, 'next');
    var arr = t.arr, i = 0;
    if (k !== undefined) {
      if (typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= arr.length) i = k;
      else if (k instanceof LFloat && k.n >= 1 && k.n <= arr.length) i = k.n;
      else i = -1;
    }
    if (i >= 0) {
      for (; i < arr.length; i++) if (arr[i] !== undefined) return new Multi([i + 1, arr[i]]);
      if (t.hash === null) return undefined;
      var it = t.hash.entries().next();
      return it.done ? undefined : new Multi([it.value[0], it.value[1]]);
    }
    if (t.hash === null) throw rterror("invalid key to 'next'");
    if (t._nkver !== t.hver || !t._nk) {
      t._nk = Array.from(t.hash.keys());
      t._nki = new Map();
      for (var j = 0; j < t._nk.length; j++) t._nki.set(t._nk[j], j);
      t._nkver = t.hver;
    }
    var key = k instanceof LFloat ? k.n : k;
    var pos = t._nki.get(key);
    if (pos === undefined) throw rterror("invalid key to 'next'");
    for (pos++; pos < t._nk.length; pos++) {
      var kk = t._nk[pos];
      if (t.hash.has(kk)) return new Multi([kk, t.hash.get(kk)]);
    }
    return undefined;
  }
  function ipairsAux(t, i) {
    i = i + 1;
    var v = index(t, i);
    return v === undefined ? undefined : new Multi([i, v]);
  }

  function makeEnv(host) {
    host = host || {};
    var G = new LuaTable();
    function reg(t, name, f) { t.set(name, f); }

    reg(G, 'print', function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts.push(tostring(arguments[i]));
      (host.print || function (s) { console.log(s); })(parts.join('\t'));
      return NONE;
    });
    reg(G, 'type', function (v) {
      if (arguments.length === 0) throw argError(1, 'type', 'value expected');
      return typeName(v);
    });
    reg(G, 'tostring', function (v) { return tostring(v); });
    reg(G, 'tonumber', function (v, base) {
      if (base === undefined) {
        if (isNum(v)) return v;
        if (typeof v === 'string') return str2num(v);
        if (arguments.length === 0) throw argError(1, 'tonumber', 'value expected');
        return undefined;
      }
      var b = checkInt(base, 2, 'tonumber');
      var s = checkStr(v, 1, 'tonumber').replace(/^\s+|\s+$/g, '').toLowerCase();
      var neg = false;
      if (s[0] === '-') { neg = true; s = s.slice(1); }
      if (!s.length) return undefined;
      var n = 0;
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        var d = c >= 48 && c <= 57 ? c - 48 : (c >= 97 && c <= 122 ? c - 87 : 99);
        if (d >= b) return undefined;
        n = n * b + d;
      }
      return neg ? -n : n;
    });
    reg(G, 'ipairs', function (t) {
      if (arguments.length === 0) throw argError(1, 'ipairs', 'table expected, got no value');
      return new Multi([ipairsAux, t, 0]);
    });
    reg(G, 'pairs', function (t) {
      if (t instanceof LuaTable && t.mt !== null) {
        var h = t.mt.get('__pairs');
        if (h !== undefined) { var r = sp(call(h)(t)); return new Multi([r[0], r[1], r[2]]); }
      }
      checkTable(t, 1, 'pairs');
      return new Multi([luaNext, t, undefined]);
    });
    reg(G, 'next', luaNext);
    reg(G, 'select', function (n) {
      var count = arguments.length - 1;
      if (n === '#') return count;
      var i = checkInt(n, 1, 'select');
      if (i < 0) i = count + i; else if (i === 0) throw argError(1, 'select', 'index out of range');
      else i = i - 1;
      if (i < 0) throw argError(1, 'select', 'index out of range');
      var out = [];
      for (var j = i + 1; j < arguments.length; j++) out.push(arguments[j]);
      return ret(out);
    });
    reg(G, 'rawget', function (t, k) { checkTable(t, 1, 'rawget'); return t.get(k); });
    reg(G, 'rawset', function (t, k, v) { checkTable(t, 1, 'rawset'); t.set(k, v); return t; });
    reg(G, 'rawequal', function (a, b) { return a === b || (isNum(a) && isNum(b) && num(a) === num(b)); });
    reg(G, 'rawlen', function (t) { return rawLen(t); });
    reg(G, 'setmetatable', function (t, mt) {
      checkTable(t, 1, 'setmetatable');
      if (t.mt && t.mt.get('__metatable') !== undefined) throw rterror('cannot change a protected metatable');
      t.mt = mt === undefined ? null : mt;
      return t;
    });
    reg(G, 'getmetatable', function (v) {
      var mt = metaOf(v);
      if (!mt) return undefined;
      var p = mt.get('__metatable');
      return p !== undefined ? p : mt;
    });
    reg(G, 'assert', function (v, msg) {
      if (truthy(v)) { return ret(Array.prototype.slice.call(arguments)); }
      if (arguments.length < 1) throw argError(1, 'assert', 'value expected');
      throw new LuaError(arguments.length >= 2 ? msg : 'assertion failed!');
    });
    reg(G, 'error', function (v, level) {
      var lv = level === undefined ? 1 : num(level);
      if (typeof v === 'string' && lv > 0) v = luaPosition(lv + 1) + v;
      throw new LuaError(v);
    });
    reg(G, 'pcall', function (f) {
      var args = Array.prototype.slice.call(arguments, 1);
      try {
        var r = call(f).apply(null, args);
        return new Multi([true].concat(sp(r)));
      } catch (e) {
        return new Multi([false, errorValue(e)]);
      }
    });
    reg(G, 'xpcall', function (f, handler) {
      var args = Array.prototype.slice.call(arguments, 2);
      try {
        var r = call(f).apply(null, args);
        return new Multi([true].concat(sp(r)));
      } catch (e) {
        return new Multi([false].concat(sp(call(handler)(errorValue(e)))));
      }
    });
    reg(G, 'collectgarbage', function (opt) { return opt === 'count' ? mkf(1024) : 0; });
    reg(G, 'load', function (chunk, name, mode, env) {
      var src = chunk;
      if (typeof chunk === 'function') {
        var pieces = [], piece;
        while ((piece = first(chunk())) !== undefined && piece !== '') pieces.push(piece);
        src = pieces.join('');
      }
      try {
        return NS.load(src, typeof name === 'string' ? name.replace(/^[=@]/, '') : 'chunk', env || G);
      } catch (e) {
        return new Multi([undefined, errorValue(e)]);
      }
    });
    reg(G, 'loadfile', function (path, mode, env) {
      var src = host.readFile ? host.readFile(path) : null;
      if (src === null || src === undefined) return new Multi([undefined, 'cannot open ' + path]);
      try { return NS.load(src, path, env || G); }
      catch (e) { return new Multi([undefined, errorValue(e)]); }
    });
    reg(G, 'dofile', function (path) {
      var src = host.readFile ? host.readFile(path) : null;
      if (src === null || src === undefined) throw rterror('cannot open ' + path);
      return NS.load(src, path, G)();
    });
    reg(G, 'require', function (name) {
      var loaded = G.get('package').get('loaded');
      var v = loaded.get(name);
      if (v !== undefined) return v;
      if (!host.require) throw rterror("module '" + name + "' not found");
      v = host.require(name);
      loaded.set(name, v === undefined ? true : v);
      return v === undefined ? true : v;
    });
    var pkg = new LuaTable(); pkg.set('loaded', new LuaTable()); pkg.set('path', './?.lua');
    G.set('package', pkg);
    G.set('_G', G);
    G.set('_VERSION', 'Lua 5.4');

    G.set('string', stringLib);
    G.set('table', makeTableLib());
    G.set('math', makeMathLib());
    G.set('os', makeOsLib(host));
    G.set('io', makeIoLib(host));
    G.set('utf8', makeUtf8Lib());
    pkg.get('loaded').set('string', stringLib);
    pkg.get('loaded').set('_G', G);
    return G;
  }
  function errorValue(e) {
    if (e instanceof LuaError) return e.value;
    if (e instanceof RangeError) return 'stack overflow';
    if (e && e.name === 'LuaSyntaxError') return e.message;
    return String(e && e.message ? e.message : e);
  }

  // --------------------------------------------------------- table ------
  function makeTableLib() {
    var T = new LuaTable();
    T.set('insert', function (t, a, b) {
      checkTable(t, 1, 'insert');
      var e = len(t) + 1;
      if (arguments.length === 2) { setindex(t, e, a); return NONE; }
      if (arguments.length !== 3) throw rterror("wrong number of arguments to 'insert'");
      var pos = checkInt(a, 2, 'insert');
      if (pos < 1 || pos > e) throw argError(2, 'insert', 'position out of bounds');
      if (t.mt === null && e - 1 === t.arr.length) {
        t.arr.splice(pos - 1, 0, b);
        if (b === undefined) { while (t.arr.length && t.arr[t.arr.length - 1] === undefined) t.arr.pop(); }
        return NONE;
      }
      for (var i = e; i > pos; i--) setindex(t, i, index(t, i - 1));
      setindex(t, pos, b);
      return NONE;
    });
    T.set('remove', function (t, p) {
      checkTable(t, 1, 'remove');
      var size = len(t);
      var pos = p === undefined ? size : checkInt(p, 2, 'remove');
      if (p !== undefined && pos !== size && (pos < 1 || pos > size + 1)) throw argError(2, 'remove', 'position out of bounds');
      var result = index(t, pos);
      if (t.mt === null && size === t.arr.length && pos >= 1 && pos <= size) {
        t.arr.splice(pos - 1, 1);
        while (t.arr.length && t.arr[t.arr.length - 1] === undefined) t.arr.pop();
        return result;
      }
      for (; pos < size; pos++) setindex(t, pos, index(t, pos + 1));
      setindex(t, pos, undefined);
      return result;
    });
    T.set('concat', function (t, sep, i, j) {
      checkTable(t, 1, 'concat');
      sep = sep === undefined ? '' : checkStr(sep, 2, 'concat');
      var a = optInt(i, 3, 'concat', 1), b = j === undefined ? len(t) : checkInt(j, 4, 'concat');
      var parts = [];
      for (var k = a; k <= b; k++) {
        var v = index(t, k);
        if (typeof v === 'string') parts.push(v);
        else if (isNum(v)) parts.push(numStr(v));
        else throw rterror("invalid value (at index " + k + ") in table for 'concat'");
      }
      return parts.join(sep);
    });
    T.set('unpack', function (t, i, j) {
      var a = optInt(i, 2, 'unpack', 1), b = j === undefined ? len(t) : checkInt(j, 3, 'unpack');
      var out = [];
      for (var k = a; k <= b; k++) out.push(index(t, k));
      return ret(out);
    });
    T.set('pack', function () {
      var t = tbl(Array.prototype.slice.call(arguments));
      t.set('n', arguments.length);
      return t;
    });
    T.set('move', function (a1, f, e, t, a2) {
      if (a2 === undefined) a2 = a1;
      f = checkInt(f, 2, 'move'); e = checkInt(e, 3, 'move'); t = checkInt(t, 4, 'move');
      if (e >= f) {
        if (t > e || t <= f || a1 !== a2) for (var i = 0; i <= e - f; i++) setindex(a2, t + i, index(a1, f + i));
        else for (var k = e - f; k >= 0; k--) setindex(a2, t + k, index(a1, f + k));
      }
      return a2;
    });
    T.set('sort', function (t, comp) {
      checkTable(t, 1, 'sort');
      var n = len(t);
      if (n > 1) {
        var a = new Array(n + 1);
        for (var i = 1; i <= n; i++) a[i] = index(t, i);
        var less;
        if (comp !== undefined) {
          var cf = call(comp);
          less = function (x, y) { return truthy(first(cf(x, y))); };
        } else less = lt;
        auxsort(a, 1, n, 0, less);
        for (var j = 1; j <= n; j++) setindex(t, j, a[j]);
      }
      return NONE;
    });
    return T;
  }

  // Lua 5.4's ltablib.c sort, line for line: ties come out in the same
  // order as in the real Lua, which matters to engines that sort with them.
  var RANLIMIT = 100;
  function auxsort(a, lo, up, rnd, less) {
    var t;
    while (lo < up) {
      if (less(a[up], a[lo])) { t = a[lo]; a[lo] = a[up]; a[up] = t; }
      if (up - lo === 1) break;
      var p;
      if (up - lo < RANLIMIT || rnd === 0) p = Math.floor((lo + up) / 2);
      else { var r4 = Math.floor((up - lo) / 4); p = rnd % (r4 * 2) + (lo + r4); }
      if (less(a[p], a[lo])) { t = a[p]; a[p] = a[lo]; a[lo] = t; }
      else if (less(a[up], a[p])) { t = a[p]; a[p] = a[up]; a[up] = t; }
      if (up - lo === 2) break;
      var P = a[p];
      t = a[p]; a[p] = a[up - 1]; a[up - 1] = t;
      // partition
      var i = lo, j = up - 1;
      for (;;) {
        while (less(a[++i], P)) {
          if (i === up - 1) throw rterror('invalid order function for sorting');
        }
        while (less(P, a[--j])) {
          if (j < i) throw rterror('invalid order function for sorting');
        }
        if (j < i) { t = a[up - 1]; a[up - 1] = a[i]; a[i] = t; break; }
        t = a[i]; a[i] = a[j]; a[j] = t;
      }
      p = i;
      var n;
      if (p - lo < up - p) { auxsort(a, lo, p - 1, rnd, less); n = p - lo; lo = p + 1; }
      else { auxsort(a, p + 1, up, rnd, less); n = up - p; up = p - 1; }
      if ((up - lo) / 128 > n) rnd = 0x5bd1e995;   // real Lua randomises here
    }
  }

  // ---------------------------------------------------------- math ------
  function makeMathLib() {
    var M = new LuaTable();
    M.set('pi', Math.PI);
    M.set('huge', Infinity);
    M.set('maxinteger', 9223372036854775807);
    M.set('mininteger', -9223372036854775808);
    M.set('abs', function (x) {
      if (typeof x === 'number') return Number.isInteger(x) ? (x < 0 ? 0 - x : x) : Math.abs(x);
      if (x instanceof LFloat) return new LFloat(Math.abs(x.n));
      return mkfOrInt(Math.abs(checkNum(x, 1, 'abs')), x);
    });
    M.set('floor', function (x) {
      if (typeof x === 'number' && Number.isInteger(x)) return x;
      var r = Math.floor(checkNum(x, 1, 'floor'));
      return r === 0 ? 0 : r;
    });
    M.set('ceil', function (x) {
      if (typeof x === 'number' && Number.isInteger(x)) return x;
      var r = Math.ceil(checkNum(x, 1, 'ceil'));
      return r === 0 ? 0 : r;
    });
    function minmax(isMax, name) {
      return function () {
        if (arguments.length === 0) throw argError(1, name, 'number expected, got no value');
        var best = arguments[0]; checkNum(best, 1, name);
        for (var i = 1; i < arguments.length; i++) {
          var v = arguments[i]; checkNum(v, i + 1, name);
          if (isMax ? lt(best, v) : lt(v, best)) best = v;
        }
        return best;
      };
    }
    M.set('max', minmax(true, 'max'));
    M.set('min', minmax(false, 'min'));
    function fl(f, name) { return function (x) { return mkf(f(checkNum(x, 1, name))); }; }
    M.set('sqrt', fl(Math.sqrt, 'sqrt'));
    M.set('sin', fl(Math.sin, 'sin'));
    M.set('cos', fl(Math.cos, 'cos'));
    M.set('tan', fl(Math.tan, 'tan'));
    M.set('asin', fl(Math.asin, 'asin'));
    M.set('acos', fl(Math.acos, 'acos'));
    M.set('exp', fl(Math.exp, 'exp'));
    M.set('atan', function (y, x) { return mkf(Math.atan2(checkNum(y, 1, 'atan'), x === undefined ? 1 : checkNum(x, 2, 'atan'))); });
    M.set('log', function (x, base) {
      var v = checkNum(x, 1, 'log');
      if (base === undefined) return mkf(Math.log(v));
      var b = checkNum(base, 2, 'log');
      if (b === 2) return mkf(Math.log2(v));
      if (b === 10) return mkf(Math.log10(v));
      return mkf(Math.log(v) / Math.log(b));
    });
    M.set('fmod', function (a, b) {
      if (typeof a === 'number' && typeof b === 'number' && Number.isInteger(a) && Number.isInteger(b)) {
        if (b === 0) throw argError(2, 'fmod', 'zero');
        return a % b === 0 ? 0 : a % b;
      }
      return mkf(checkNum(a, 1, 'fmod') % checkNum(b, 2, 'fmod'));
    });
    M.set('modf', function (x) {
      var v = checkNum(x, 1, 'modf');
      var ip = v >= 0 ? Math.floor(v) : Math.ceil(v);
      var fp = (v === Infinity || v === -Infinity) ? 0 : v - ip;
      return new Multi([mkf(ip), mkf(fp)]);
    });
    M.set('tointeger', function (x) {
      if (typeof x === 'number' && Number.isInteger(x)) return x;
      if (x instanceof LFloat) return x.n;
      if (typeof x === 'string') { var n = str2num(x); return n === undefined ? undefined : (typeof n === 'number' && Number.isInteger(n) ? n : (n instanceof LFloat ? n.n : undefined)); }
      return undefined;
    });
    M.set('type', function (x) {
      if (arguments.length === 0) throw argError(1, 'type', 'value expected');
      if (typeof x === 'number') return Number.isInteger(x) ? 'integer' : 'float';
      if (x instanceof LFloat) return 'float';
      return undefined;
    });
    M.set('ult', function (a, b) {
      return BigInt.asUintN(64, BigInt(checkInt(a, 1, 'ult'))) < BigInt.asUintN(64, BigInt(checkInt(b, 2, 'ult')));
    });

    // xoshiro256**, as lmathlib.c has it, on 64-bit BigInts.
    var MASK = (1n << 64n) - 1n;
    var state = [0n, 0n, 0n, 0n];
    function rotl(x, n) { return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK; }
    function nextrand() {
      var s0 = state[0], s1 = state[1], s2 = state[2] ^ s0, s3 = state[3] ^ s1;
      var res = (rotl((s1 * 5n) & MASK, 7) * 9n) & MASK;
      state[0] = s0 ^ s3;
      state[1] = s1 ^ s2;
      state[2] = s2 ^ ((s1 << 17n) & MASK);
      state[3] = rotl(s3, 45);
      return res;
    }
    function setseed(n1, n2) {
      state = [BigInt.asUintN(64, n1), 0xffn, BigInt.asUintN(64, n2), 0n];
      for (var i = 0; i < 16; i++) nextrand();
    }
    setseed(BigInt(Date.now()), 0n);
    function project(ran, n) {
      if ((n & (n + 1n)) === 0n) return ran & n;
      var lim = n;
      lim |= lim >> 1n; lim |= lim >> 2n; lim |= lim >> 4n; lim |= lim >> 8n;
      lim |= lim >> 16n; lim |= lim >> 32n;
      while ((ran &= lim) > n) ran = nextrand();
      return ran;
    }
    M.set('random', function (m, n) {
      var rv = nextrand();
      var low, up;
      switch (arguments.length) {
        case 0: return mkf(Number(rv >> 11n) * Math.pow(2, -53));
        case 1:
          low = 1n; up = BigInt(checkInt(m, 1, 'random'));
          if (up === 0n) return fromInt64(rv);
          break;
        case 2:
          low = BigInt(checkInt(m, 1, 'random')); up = BigInt(checkInt(n, 2, 'random'));
          break;
        default: throw rterror('wrong number of arguments');
      }
      if (!(low <= up)) throw argError(1, 'random', 'interval is empty');
      var p = project(rv, BigInt.asUintN(64, up - low));
      return fromInt64(p + BigInt.asUintN(64, low));
    });
    M.set('randomseed', function (a, b) {
      if (arguments.length === 0) { setseed(BigInt(Date.now()), 0n); return; }
      var n1 = isFloatVal(a) ? BigInt(Math.trunc(num(a))) : BigInt(checkInt(a, 1, 'randomseed'));
      var n2 = b === undefined ? 0n : BigInt(checkInt(b, 2, 'randomseed'));
      setseed(n1, n2);
      return new Multi([fromInt64(n1), fromInt64(n2)]);
    });
    return M;
  }
  function mkfOrInt(r, orig) { return isFloatVal(orig) ? mkf(r) : r; }

  // ------------------------------------------------------------ os ------
  function makeOsLib(host) {
    var O = new LuaTable();
    var now = host.now || function () { return Date.now(); };
    O.set('time', function (t) {
      if (t === undefined) return Math.floor(now() / 1000);
      checkTable(t, 1, 'time');
      function field(k, d) {
        var v = t.get(k);
        if (v === undefined) { if (d === undefined) throw rterror("field '" + k + "' missing in date table"); return d; }
        return num(v);
      }
      var d = new Date(field('year'), field('month') - 1, field('day'), field('hour', 12), field('min', 0), field('sec', 0));
      return Math.floor(d.getTime() / 1000);
    });
    O.set('clock', function () {
      var p = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      return mkf(p / 1000);
    });
    O.set('date', function (fmt, t) {
      fmt = fmt === undefined ? '%c' : checkStr(fmt, 1, 'date');
      var ms = t === undefined ? now() : num(t) * 1000;
      var utc = fmt[0] === '!';
      if (utc) fmt = fmt.slice(1);
      var d = new Date(ms);
      var g = utc
        ? { Y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(), S: d.getUTCSeconds(), w: d.getUTCDay() }
        : { Y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), H: d.getHours(), M: d.getMinutes(), S: d.getSeconds(), w: d.getDay() };
      var start = utc ? Date.UTC(g.Y, 0, 1) : new Date(g.Y, 0, 1).getTime();
      var cur = utc ? Date.UTC(g.Y, g.m, g.d) : new Date(g.Y, g.m, g.d).getTime();
      var yday = Math.round((cur - start) / 86400000) + 1;
      if (fmt.slice(0, 2) === '*t') {
        var r = new LuaTable();
        r.set('year', g.Y); r.set('month', g.m + 1); r.set('day', g.d);
        r.set('hour', g.H); r.set('min', g.M); r.set('sec', g.S);
        r.set('wday', g.w + 1); r.set('yday', yday); r.set('isdst', false);
        return r;
      }
      var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      function p2(n) { return (n < 10 ? '0' : '') + n; }
      return fmt.replace(/%(.)/g, function (_, c) {
        switch (c) {
          case 'Y': return String(g.Y);
          case 'y': return p2(g.Y % 100);
          case 'm': return p2(g.m + 1);
          case 'd': return p2(g.d);
          case 'e': return (g.d < 10 ? ' ' : '') + g.d;
          case 'H': return p2(g.H);
          case 'I': return p2(((g.H + 11) % 12) + 1);
          case 'M': return p2(g.M);
          case 'S': return p2(g.S);
          case 'p': return g.H < 12 ? 'AM' : 'PM';
          case 'A': return DAYS[g.w];
          case 'a': return DAYS[g.w].slice(0, 3);
          case 'B': return MONTHS[g.m];
          case 'b': return MONTHS[g.m].slice(0, 3);
          case 'j': return String(yday).padStart(3, '0');
          case 'w': return String(g.w);
          case 'u': return String(g.w === 0 ? 7 : g.w);
          case 'x': return p2(g.m + 1) + '/' + p2(g.d) + '/' + p2(g.Y % 100);
          case 'X': return p2(g.H) + ':' + p2(g.M) + ':' + p2(g.S);
          case 'c': return DAYS[g.w].slice(0, 3) + ' ' + MONTHS[g.m].slice(0, 3) + ' ' + (g.d < 10 ? ' ' : '') + g.d + ' ' + p2(g.H) + ':' + p2(g.M) + ':' + p2(g.S) + ' ' + g.Y;
          case '%': return '%';
          default: return '%' + c;
        }
      });
    });
    O.set('getenv', function () { return undefined; });
    O.set('remove', function (path) {
      if (host.removeFile && host.removeFile(path)) return true;
      return new Multi([undefined, path + ': No such file or directory', 2]);
    });
    O.set('rename', function (a, b) {
      if (host.renameFile && host.renameFile(a, b)) return true;
      return new Multi([undefined, a + ': No such file or directory', 2]);
    });
    O.set('exit', function () { throw new LuaError('os.exit called'); });
    O.set('tmpname', function () { return '/tmp/lua_' + Math.random().toString(36).slice(2); });
    return O;
  }

  // ------------------------------------------------------------ io ------
  // Files live wherever the host keeps them (host.readFile / host.writeFile):
  // Battle Pass keeps its save file this way.
  function makeIoLib(host) {
    var IO = new LuaTable();
    var fileMeta = new LuaTable();
    var fileMethods = new LuaTable();
    fileMeta.set('__index', fileMethods);
    fileMeta.set('__name', 'FILE*');
    function newFile(path, mode, data) {
      var f = new LuaTable();
      f.mt = fileMeta;
      f._path = path; f._mode = mode; f._data = data; f._pos = 0; f._closed = false;
      return f;
    }
    IO.set('open', function (path, mode) {
      path = checkStr(path, 1, 'open');
      mode = mode === undefined ? 'r' : checkStr(mode, 2, 'open');
      var m = mode.replace('b', '');
      if (m[0] === 'r') {
        var data = host.readFile ? host.readFile(path) : null;
        if (data === null || data === undefined) return new Multi([undefined, path + ': No such file or directory', 2]);
        return newFile(path, m, data);
      }
      if (m[0] === 'w') return newFile(path, m, '');
      if (m[0] === 'a') {
        var old = host.readFile ? host.readFile(path) : null;
        var f = newFile(path, m, old || '');
        f._pos = f._data.length;
        return f;
      }
      throw argError(2, 'open', 'invalid mode');
    });
    fileMethods.set('read', function (f) {
      var fmts = Array.prototype.slice.call(arguments, 1);
      if (!fmts.length) fmts = ['l'];
      var out = [];
      for (var i = 0; i < fmts.length; i++) {
        var fm = fmts[i];
        if (isNum(fm)) {
          var n = num(fm);
          if (f._pos >= f._data.length && n > 0) { out.push(undefined); break; }
          out.push(f._data.substr(f._pos, n)); f._pos += n; continue;
        }
        fm = String(fm).replace(/^\*/, '');
        if (fm[0] === 'a') { out.push(f._data.slice(f._pos)); f._pos = f._data.length; continue; }
        if (fm[0] === 'l' || fm[0] === 'L') {
          if (f._pos >= f._data.length) { out.push(undefined); break; }
          var e = f._data.indexOf('\n', f._pos);
          var line = e < 0 ? f._data.slice(f._pos) : f._data.slice(f._pos, fm[0] === 'L' ? e + 1 : e);
          f._pos = e < 0 ? f._data.length : e + 1;
          out.push(line); continue;
        }
        if (fm[0] === 'n') {
          var m = /^\s*[-+]?(0[xX][0-9a-fA-F.]+|\d*\.?\d+(?:[eE][-+]?\d+)?)/.exec(f._data.slice(f._pos));
          if (!m) { out.push(undefined); break; }
          f._pos += m[0].length; out.push(str2num(m[0])); continue;
        }
      }
      return ret(out);
    });
    fileMethods.set('write', function (f) {
      for (var i = 1; i < arguments.length; i++) {
        var v = arguments[i];
        var s = typeof v === 'string' ? v : writeNum(v);
        f._data = f._data.slice(0, f._pos) + s + f._data.slice(f._pos + s.length);
        f._pos += s.length;
      }
      return f;
    });
    fileMethods.set('lines', function (f) {
      return function () { return first(fileMethods.get('read')(f, 'l')); };
    });
    fileMethods.set('seek', function (f, whence, off) {
      whence = whence || 'cur'; off = off === undefined ? 0 : num(off);
      if (whence === 'set') f._pos = off;
      else if (whence === 'end') f._pos = f._data.length + off;
      else f._pos += off;
      return f._pos;
    });
    fileMethods.set('flush', function (f) {
      if (f._mode[0] !== 'r' && host.writeFile) host.writeFile(f._path, f._data);
      return f;
    });
    fileMethods.set('close', function (f) {
      if (!f._closed && f._mode[0] !== 'r' && host.writeFile) host.writeFile(f._path, f._data);
      f._closed = true;
      return true;
    });
    fileMethods.set('setvbuf', function () { return true; });
    IO.set('write', function () {
      var s = '';
      for (var i = 0; i < arguments.length; i++) s += typeof arguments[i] === 'string' ? arguments[i] : writeNum(arguments[i]);
      (host.write || host.print || function (x) { if (typeof process !== 'undefined') process.stdout.write(x); })(s);
      return NONE;
    });
    IO.set('lines', function (path) {
      var data = host.readFile ? host.readFile(path) : null;
      if (data === null || data === undefined) throw rterror(path + ': No such file or directory');
      var f = newFile(path, 'r', data);
      return function () { return first(fileMethods.get('read')(f, 'l')); };
    });
    return IO;
  }

  // ---------------------------------------------------------- utf8 ------
  function makeUtf8Lib() {
    var U = new LuaTable();
    U.set('char', function () {
      var s = '';
      for (var i = 0; i < arguments.length; i++) s += NS.utf8Bytes(checkInt(arguments[i], i + 1, 'char'));
      return s;
    });
    U.set('charpattern', '[\x00-\x7F\xC2-\xFD][\x80-\xBF]*');
    function decodeAt(s, i) {   // i 0-based; returns [codepoint, length] or null
      var c = s.charCodeAt(i);
      if (c < 0x80) return [c, 1];
      var n = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 0;
      if (!n) return null;
      var cp = c & (0x7F >> n);
      for (var k = 1; k < n; k++) {
        var cc = s.charCodeAt(i + k);
        if ((cc & 0xC0) !== 0x80) return null;
        cp = (cp << 6) | (cc & 0x3F);
      }
      return [cp, n];
    }
    U.set('len', function (s, i, j) {
      s = checkStr(s, 1, 'len');
      var a = (i === undefined ? 1 : num(i)) - 1, b = j === undefined ? s.length : num(j);
      var n = 0;
      while (a < b) {
        var d = decodeAt(s, a);
        if (!d) return new Multi([undefined, a + 1]);
        a += d[1]; n++;
      }
      return n;
    });
    U.set('codepoint', function (s, i, j) {
      s = checkStr(s, 1, 'codepoint');
      var a = (i === undefined ? 1 : num(i)), b = j === undefined ? a : num(j);
      var out = [], p = a - 1;
      while (p < b) {
        var d = decodeAt(s, p);
        if (!d) throw rterror('invalid UTF-8 code');
        out.push(d[0]); p += d[1];
      }
      return ret(out);
    });
    U.set('offset', function (s, n, i) {
      s = checkStr(s, 1, 'offset');
      n = num(n);
      var p = i === undefined ? (n >= 0 ? 1 : s.length + 1) : num(i);
      p -= 1;
      function cont(k) { return (s.charCodeAt(k) & 0xC0) === 0x80; }
      if (n === 0) { while (p > 0 && cont(p)) p--; return p + 1; }
      if (n > 0) { n--; while (n > 0 && p < s.length) { p++; while (cont(p)) p++; n--; } return n === 0 ? p + 1 : undefined; }
      while (n < 0 && p > 0) { p--; while (p > 0 && cont(p)) p--; n++; }
      return n === 0 ? p + 1 : undefined;
    });
    U.set('codes', function (s) {
      s = checkStr(s, 1, 'codes');
      return new Multi([function (str, i) {
        var p = num(i);
        if (p > 0) { var d0 = decodeAt(str, p - 1); p += d0 ? d0[1] - 1 : 0; }
        if (p >= str.length) return undefined;
        var d = decodeAt(str, p);
        if (!d) throw rterror('invalid UTF-8 code');
        return new Multi([p + 1, d[0]]);
      }, s, 0]);
    });
    return U;
  }

  // ======================================================== strings =======
  var stringLib = new LuaTable();
  var stringMeta = new LuaTable();
  stringMeta.set('__index', stringLib);

  function posrelatI(pos, l) {
    if (pos > 0) return pos;
    if (pos === 0) return 1;
    if (pos < -l) return 1;
    return l + pos + 1;
  }
  function getendpos(pos, l) {
    if (pos > l) return l;
    if (pos >= 0) return pos;
    if (pos < -l) return 0;
    return l + pos + 1;
  }
  stringLib.set('len', function (s) { return checkStr(s, 1, 'len').length; });
  stringLib.set('sub', function (s, i, j) {
    s = checkStr(s, 1, 'sub');
    var l = s.length;
    var st = posrelatI(checkInt(i === undefined ? 1 : i, 2, 'sub'), l);
    var en = getendpos(j === undefined ? -1 : checkInt(j, 3, 'sub'), l);
    if (st < 1) st = 1;
    if (en > l) en = l;
    return st <= en ? s.slice(st - 1, en) : '';
  });
  stringLib.set('upper', function (s) {
    s = checkStr(s, 1, 'upper');
    return s.replace(/[a-z]+/g, function (m) { return m.toUpperCase(); });
  });
  stringLib.set('lower', function (s) {
    s = checkStr(s, 1, 'lower');
    return s.replace(/[A-Z]+/g, function (m) { return m.toLowerCase(); });
  });
  stringLib.set('rep', function (s, n, sep) {
    s = checkStr(s, 1, 'rep'); n = checkInt(n, 2, 'rep');
    if (n <= 0) return '';
    if (sep === undefined || sep === '') return s.repeat(n);
    sep = checkStr(sep, 3, 'rep');
    return Array(n).fill(s).join(sep);
  });
  stringLib.set('reverse', function (s) { return checkStr(s, 1, 'reverse').split('').reverse().join(''); });
  stringLib.set('byte', function (s, i, j) {
    s = checkStr(s, 1, 'byte');
    var l = s.length;
    var pi = posrelatI(optInt(i, 2, 'byte', 1), l);
    var pe = getendpos(j === undefined ? pi : checkInt(j, 3, 'byte'), l);
    if (pi > pe) return undefined;
    var out = [];
    for (var k = pi; k <= pe; k++) out.push(s.charCodeAt(k - 1));
    return ret(out);
  });
  stringLib.set('char', function () {
    var out = '';
    for (var i = 0; i < arguments.length; i++) {
      var c = checkInt(arguments[i], i + 1, 'char');
      if (c < 0 || c > 255) throw argError(i + 1, 'char', 'value out of range');
      out += String.fromCharCode(c);
    }
    return out;
  });

  // string.format, with C's own rounding.
  stringLib.set('format', function (fmt) {
    fmt = checkStr(fmt, 1, 'format');
    var args = arguments, argi = 1;
    var out = '', i = 0, n = fmt.length;
    while (i < n) {
      var c = fmt[i++];
      if (c !== '%') { out += c; continue; }
      if (fmt[i] === '%') { out += '%'; i++; continue; }
      var m = /^([-+ #0]*)(\d*)(?:\.(\d*))?([a-zA-Z])/.exec(fmt.slice(i));
      if (!m) throw rterror("invalid conversion '%" + fmt.slice(i, i + 5) + "' to 'format'");
      i += m[0].length;
      var flags = m[1], width = m[2] ? Number(m[2]) : 0, prec = m[3] === undefined ? undefined : Number(m[3] || 0);
      var conv = m[4];
      var argn = ++argi;
      if (argn > args.length - 1 + 1 && conv !== '%') {
        if (args[argn - 1] === undefined && argn > args.length) throw argError(argn, 'format', 'no value');
      }
      var v = args[argn - 1], body, sign = '';
      switch (conv) {
        case 'd': case 'i': {
          var iv = checkInt(v, argn, 'format');
          body = String(Math.abs(iv) < 1e21 ? Math.abs(iv) : BigInt(iv) * (iv < 0 ? -1n : 1n));
          if (prec !== undefined) { body = body.padStart(prec, '0'); if (prec === 0 && iv === 0) body = ''; }
          sign = iv < 0 ? '-' : (flags.indexOf('+') >= 0 ? '+' : (flags.indexOf(' ') >= 0 ? ' ' : ''));
          out += pad(sign, body, width, flags, prec === undefined);
          break;
        }
        case 'u': {
          var uv = checkInt(v, argn, 'format');
          body = BigInt.asUintN(64, BigInt(uv)).toString();
          out += pad('', body, width, flags, true);
          break;
        }
        case 'c': out += pad('', String.fromCharCode(checkInt(v, argn, 'format')), width, flags.replace('0', ''), false); break;
        case 'x': case 'X': case 'o': {
          var xv = BigInt.asUintN(64, BigInt(checkInt(v, argn, 'format')));
          body = xv.toString(conv === 'o' ? 8 : 16);
          if (conv === 'X') body = body.toUpperCase();
          if (prec !== undefined) body = body.padStart(prec, '0');
          var pre = (flags.indexOf('#') >= 0 && xv !== 0n) ? (conv === 'o' ? '0' : (conv === 'x' ? '0x' : '0X')) : '';
          out += pad(pre, body, width, flags, prec === undefined);
          break;
        }
        case 'e': case 'E': case 'f': case 'F': case 'g': case 'G': case 'a': case 'A': {
          var fv = checkNum(v, argn, 'format');
          var neg = fv < 0 || (fv === 0 && 1 / fv < 0);
          var ax = Math.abs(fv);
          var up = conv === 'E' || conv === 'G' || conv === 'F' || conv === 'A';
          if (ax === Infinity || fv !== fv) {
            body = fv !== fv ? 'nan' : 'inf';
            if (up) body = body.toUpperCase();
            sign = neg && fv === fv ? '-' : (flags.indexOf('+') >= 0 ? '+' : (flags.indexOf(' ') >= 0 ? ' ' : ''));
            out += pad(sign, body, width, flags.replace('0', ''), false);
            break;
          }
          var p = prec === undefined ? 6 : prec;
          var alt = flags.indexOf('#') >= 0;
          if (conv === 'f' || conv === 'F') { body = fixedDigits(ax, p); if (alt && p === 0) body += '.'; }
          else if (conv === 'e' || conv === 'E') body = fmtExp(ax, p, up);
          else if (conv === 'g' || conv === 'G') body = fmtG(ax, p, up, alt);
          else body = hexFloat(ax, prec, up);
          sign = neg ? '-' : (flags.indexOf('+') >= 0 ? '+' : (flags.indexOf(' ') >= 0 ? ' ' : ''));
          out += pad(sign, body, width, flags, true);
          break;
        }
        case 's': {
          var sv = tostring(v);
          if (args.length < argn) throw argError(argn, 'format', 'no value');
          if (prec !== undefined) sv = sv.slice(0, prec);
          out += pad('', sv, width, flags.replace('0', ''), false);
          break;
        }
        case 'q': out += quoteString(v); break;
        default:
          throw rterror("invalid conversion '%" + m[0] + "' to 'format'");
      }
    }
    return out;
  });
  function pad(sign, body, width, flags, zeroOk) {
    var total = sign.length + body.length;
    if (total >= width) return sign + body;
    if (flags.indexOf('-') >= 0) return sign + body + ' '.repeat(width - total);
    if (zeroOk && flags.indexOf('0') >= 0) return sign + '0'.repeat(width - total) + body;
    return ' '.repeat(width - total) + sign + body;
  }
  function hexFloat(x, prec, up) {
    if (x === 0) return up ? '0X0P+0' : '0x0p+0';
    var e = Math.floor(Math.log2(x)), m = x / Math.pow(2, e);
    if (m >= 2) { m /= 2; e++; } else if (m < 1) { m *= 2; e--; }
    var frac = (m - 1).toString(16).slice(2);
    if (prec !== undefined) frac = frac.slice(0, prec).padEnd(prec, '0');
    var s = '0x1' + (frac ? '.' + frac : '') + 'p' + (e >= 0 ? '+' : '') + e;
    return up ? s.toUpperCase() : s;
  }
  function quoteString(v) {
    if (typeof v === 'string') {
      var o = '"';
      for (var i = 0; i < v.length; i++) {
        var c = v.charCodeAt(i), ch = v[i];
        if (ch === '"' || ch === '\\') o += '\\' + ch;
        else if (ch === '\n') o += '\\\n';
        else if (ch === '\r') o += '\\r';
        else if (c === 0) o += (i + 1 < v.length && /\d/.test(v[i + 1])) ? '\\000' : '\\0';
        else if (c < 32 || c === 127) o += '\\' + ((i + 1 < v.length && /\d/.test(v[i + 1])) ? String(c).padStart(3, '0') : c);
        else o += ch;
      }
      return o + '"';
    }
    if (typeof v === 'number' && Number.isInteger(v)) return intStr(v);
    if (isNum(v)) {
      var x = num(v);
      if (x === Infinity) return '1e9999';
      if (x === -Infinity) return '-1e9999';
      if (x !== x) return '(0/0)';
      if (x === Math.floor(x)) return (x < 0 ? '-' : '') + hexFloat(Math.abs(x)) ;
      return (x < 0 ? '-' : '') + hexFloat(Math.abs(x));
    }
    if (v === undefined || typeof v === 'boolean') return tostring(v);
    throw rterror("bad argument to 'format' (value has no literal form)");
  }

  // ----------------------------------------------------- patterns ------
  // lstrlib.c's matcher, ported line for line.
  var L_ESC = 37, CAP_UNFINISHED = -1, CAP_POSITION = -2, MAXCCALLS = 200, MAXCAPTURES = 32;
  function MatchState(src, pat) {
    this.src = src; this.pat = pat; this.level = 0; this.matchdepth = MAXCCALLS;
    this.capInit = new Array(MAXCAPTURES); this.capLen = new Array(MAXCAPTURES);
  }
  function classEnd(ms, p) {
    var pat = ms.pat, pe = pat.length;
    var c = pat.charCodeAt(p++);
    if (c === L_ESC) {
      if (p >= pe) throw rterror("malformed pattern (ends with '%')");
      return p + 1;
    }
    if (c === 91) {   // '['
      if (pat.charCodeAt(p) === 94) p++;
      do {
        if (p >= pe) throw rterror("malformed pattern (missing ']')");
        if (pat.charCodeAt(p++) === L_ESC && p < pe) p++;
      } while (pat.charCodeAt(p) !== 93);
      return p + 1;
    }
    return p;
  }
  function isalpha(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
  function isdigit(c) { return c >= 48 && c <= 57; }
  function islower(c) { return c >= 97 && c <= 122; }
  function isupper(c) { return c >= 65 && c <= 90; }
  function isspace(c) { return c === 32 || (c >= 9 && c <= 13); }
  function iscntrl(c) { return c < 32 || c === 127; }
  function ispunct(c) { return c >= 33 && c <= 126 && !isalpha(c) && !isdigit(c); }
  function isxdigit(c) { return isdigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70); }
  function matchClass(c, cl) {
    var res;
    var low = cl >= 65 && cl <= 90 ? cl + 32 : cl;
    switch (low) {
      case 97: res = isalpha(c); break;            // a
      case 99: res = iscntrl(c); break;            // c
      case 100: res = isdigit(c); break;           // d
      case 103: res = c >= 33 && c <= 126; break;  // g
      case 108: res = islower(c); break;           // l
      case 112: res = ispunct(c); break;           // p
      case 115: res = isspace(c); break;           // s
      case 117: res = isupper(c); break;           // u
      case 119: res = isalpha(c) || isdigit(c); break; // w
      case 120: res = isxdigit(c); break;          // x
      default: return cl === c;
    }
    if (isupper(cl)) res = !res;
    return res;
  }
  function matchBracketClass(ms, c, p, ec) {
    var pat = ms.pat, sig = true;
    if (pat.charCodeAt(p + 1) === 94) { sig = false; p++; }
    while (++p < ec) {
      var pc = pat.charCodeAt(p);
      if (pc === L_ESC) {
        p++;
        if (matchClass(c, pat.charCodeAt(p))) return sig;
      } else if (pat.charCodeAt(p + 1) === 45 && p + 2 < ec) {
        p += 2;
        if (pat.charCodeAt(p - 2) <= c && c <= pat.charCodeAt(p)) return sig;
      } else if (pc === c) return sig;
    }
    return !sig;
  }
  function singleMatch(ms, s, p, ep) {
    if (s >= ms.src.length) return false;
    var c = ms.src.charCodeAt(s);
    var pc = ms.pat.charCodeAt(p);
    switch (pc) {
      case 46: return true;                                  // '.'
      case L_ESC: return matchClass(c, ms.pat.charCodeAt(p + 1));
      case 91: return matchBracketClass(ms, c, p, ep - 1);
      default: return pc === c;
    }
  }
  function matchBalance(ms, s, p) {
    if (p >= ms.pat.length - 1) throw rterror("malformed pattern (missing arguments to '%b')");
    var src = ms.src;
    if (src.charCodeAt(s) !== ms.pat.charCodeAt(p)) return -1;
    var b = ms.pat.charCodeAt(p), e = ms.pat.charCodeAt(p + 1), cont = 1;
    while (++s < src.length) {
      var c = src.charCodeAt(s);
      if (c === e) { if (--cont === 0) return s + 1; }
      else if (c === b) cont++;
    }
    return -1;
  }
  function maxExpand(ms, s, p, ep) {
    var i = 0;
    while (singleMatch(ms, s + i, p, ep)) i++;
    while (i >= 0) {
      var res = doMatch(ms, s + i, ep + 1);
      if (res !== -1) return res;
      i--;
    }
    return -1;
  }
  function minExpand(ms, s, p, ep) {
    for (;;) {
      var res = doMatch(ms, s, ep + 1);
      if (res !== -1) return res;
      else if (singleMatch(ms, s, p, ep)) s++;
      else return -1;
    }
  }
  function startCapture(ms, s, p, what) {
    var level = ms.level;
    if (level >= MAXCAPTURES) throw rterror('too many captures');
    ms.capInit[level] = s; ms.capLen[level] = what;
    ms.level = level + 1;
    var res = doMatch(ms, s, p);
    if (res === -1) ms.level--;
    return res;
  }
  function captureToClose(ms) {
    var level = ms.level;
    for (level--; level >= 0; level--) if (ms.capLen[level] === CAP_UNFINISHED) return level;
    throw rterror('invalid pattern capture');
  }
  function endCapture(ms, s, p) {
    var l = captureToClose(ms);
    ms.capLen[l] = s - ms.capInit[l];
    var res = doMatch(ms, s, p);
    if (res === -1) ms.capLen[l] = CAP_UNFINISHED;
    return res;
  }
  function checkCapture(ms, l) {
    l -= 49;
    if (l < 0 || l >= ms.level || ms.capLen[l] === CAP_UNFINISHED) throw rterror('invalid capture index %' + (l + 1));
    return l;
  }
  function matchCapture(ms, s, l) {
    l = checkCapture(ms, l);
    var len = ms.capLen[l];
    var cap = ms.src.substr(ms.capInit[l], len);
    if (ms.src.length - s >= len && ms.src.substr(s, len) === cap) return s + len;
    return -1;
  }
  function doMatch(ms, s, p) {
    if (ms.matchdepth-- === 0) throw rterror('pattern too complex');
    var pat = ms.pat, pe = pat.length;
    for (;;) {
      if (p === pe) break;
      var pc = pat.charCodeAt(p);
      if (pc === 40) {                                     // '('
        if (pat.charCodeAt(p + 1) === 41) s = startCapture(ms, s, p + 2, CAP_POSITION);
        else s = startCapture(ms, s, p + 1, CAP_UNFINISHED);
        break;
      }
      if (pc === 41) { s = endCapture(ms, s, p + 1); break; }   // ')'
      if (pc === 36 && p + 1 === pe) {                     // '$' at the end
        s = (s === ms.src.length) ? s : -1;
        break;
      }
      if (pc === L_ESC) {
        var nx = pat.charCodeAt(p + 1);
        if (nx === 98) {                                   // %b
          s = matchBalance(ms, s, p + 2);
          if (s !== -1) { p += 4; continue; }
          break;
        }
        if (nx === 102) {                                  // %f
          p += 2;
          if (pat.charCodeAt(p) !== 91) throw rterror("missing '[' after '%f' in pattern");
          var ep0 = classEnd(ms, p);
          var prev = (s === 0) ? 0 : ms.src.charCodeAt(s - 1);
          var cur = s < ms.src.length ? ms.src.charCodeAt(s) : 0;
          if (!matchBracketClass(ms, prev, p, ep0 - 1) && matchBracketClass(ms, cur, p, ep0 - 1)) { p = ep0; continue; }
          s = -1; break;
        }
        if (nx >= 48 && nx <= 57) {                        // %0-%9
          s = matchCapture(ms, s, nx);
          if (s !== -1) { p += 2; continue; }
          break;
        }
      }
      // default: a single class with an optional suffix
      var ep = classEnd(ms, p);
      var epc = pat.charCodeAt(ep);
      if (!singleMatch(ms, s, p, ep)) {
        if (epc === 42 || epc === 63 || epc === 45) { p = ep + 1; continue; }   // * ? -
        s = -1; break;
      }
      if (epc === 63) {                                    // ?
        var res = doMatch(ms, s + 1, ep + 1);
        if (res !== -1) { s = res; break; }
        p = ep + 1; continue;
      }
      if (epc === 43) { s = maxExpand(ms, s + 1, p, ep); break; }   // +
      if (epc === 42) { s = maxExpand(ms, s, p, ep); break; }       // *
      if (epc === 45) { s = minExpand(ms, s, p, ep); break; }       // -
      s++; p = ep;
    }
    ms.matchdepth++;
    return s;
  }
  function getCapture(ms, i, s, e) {
    if (i >= ms.level) {
      if (i !== 0) throw rterror('invalid capture index %' + (i + 1));
      return ms.src.slice(s, e);
    }
    var l = ms.capLen[i];
    if (l === CAP_UNFINISHED) throw rterror('unfinished capture');
    if (l === CAP_POSITION) return ms.capInit[i] + 1;
    return ms.src.substr(ms.capInit[i], l);
  }
  function captures(ms, s, e, wholeIfNone) {
    var n = (ms.level === 0 && wholeIfNone) ? 1 : ms.level;
    var out = [];
    for (var i = 0; i < n; i++) out.push(getCapture(ms, i, s, e));
    return out;
  }
  var SPECIALS = /[\^$*+?.()[\]%-]/;
  function strFindAux(find, s, p, init, plain, fname) {
    s = checkStr(s, 1, fname); p = checkStr(p, 2, fname);
    var ls = s.length;
    var st = posrelatI(optInt(init, 3, fname, 1), ls) - 1;
    if (st > ls) return undefined;
    if (find && (truthy(plain) || !SPECIALS.test(p))) {
      var idx = s.indexOf(p, st);
      if (idx >= 0) return new Multi([idx + 1, idx + p.length]);
      return undefined;
    }
    var anchor = p.charCodeAt(0) === 94;
    var pp = anchor ? p.slice(1) : p;
    var ms = new MatchState(s, pp);
    var s1 = st;
    do {
      ms.level = 0; ms.matchdepth = MAXCCALLS;
      var res = doMatch(ms, s1, 0);
      if (res !== -1) {
        if (find) return new Multi([s1 + 1, res].concat(captures(ms, -1, 0, false)));
        return ret(captures(ms, s1, res, true));
      }
    } while (s1++ < ls && !anchor);
    return undefined;
  }
  stringLib.set('find', function (s, p, init, plain) { return strFindAux(true, s, p, init, plain, 'find'); });
  stringLib.set('match', function (s, p, init) { return strFindAux(false, s, p, init, false, 'match'); });
  stringLib.set('gmatch', function (s, p, init) {
    s = checkStr(s, 1, 'gmatch'); p = checkStr(p, 2, 'gmatch');
    var ls = s.length;
    var src = posrelatI(optInt(init, 3, 'gmatch', 1), ls) - 1;
    if (src > ls) src = ls + 1;
    var ms = new MatchState(s, p), lastmatch = -1;
    return function () {
      for (; src <= ls; src++) {
        ms.level = 0; ms.matchdepth = MAXCCALLS;
        var e = doMatch(ms, src, 0);
        if (e !== -1 && e !== lastmatch) {
          var start = src;
          src = lastmatch = e;
          return ret(captures(ms, start, e, true));
        }
      }
      return undefined;
    };
  });
  stringLib.set('gsub', function (s, p, repl, maxn) {
    s = checkStr(s, 1, 'gsub'); p = checkStr(p, 2, 'gsub');
    var tr = typeName(repl);
    if (!(tr === 'number' || tr === 'string' || tr === 'table' || tr === 'function')) {
      throw argError(3, 'gsub', 'string/function/table expected, got ' + typeNameArg(repl));
    }
    var maxS = maxn === undefined ? s.length + 1 : checkInt(maxn, 4, 'gsub');
    var anchor = p.charCodeAt(0) === 94;
    var pp = anchor ? p.slice(1) : p;
    var ms = new MatchState(s, pp);
    var src = 0, lastmatch = -1, n = 0, out = '';
    var rs = tr === 'string' || tr === 'number' ? (typeof repl === 'string' ? repl : numStr(repl)) : null;
    while (n < maxS) {
      ms.level = 0; ms.matchdepth = MAXCCALLS;
      var e = doMatch(ms, src, 0);
      if (e !== -1 && e !== lastmatch) {
        n++;
        out += addValue(ms, src, e, repl, rs, tr);
        src = lastmatch = e;
      } else if (src < s.length) out += s[src++];
      else break;
      if (anchor) break;
    }
    if (src < s.length) out += s.slice(src);
    return new Multi([out, n]);
  });
  function addValue(ms, s, e, repl, rs, tr) {
    var whole = ms.src.slice(s, e), v;
    if (rs !== null) {
      var o = '';
      for (var i = 0; i < rs.length; i++) {
        var c = rs[i];
        if (c !== '%') { o += c; continue; }
        i++;
        var d = rs[i];
        if (d === '%') o += '%';
        else if (d !== undefined && d >= '0' && d <= '9') {
          var cap = d === '0' ? whole : getCapture(ms, d.charCodeAt(0) - 49, s, e);
          o += typeof cap === 'string' ? cap : numStr(cap);
        } else throw rterror("invalid use of '%' in replacement string");
      }
      return o;
    }
    var caps = captures(ms, s, e, true);
    if (tr === 'table') v = index(repl, caps[0]);
    else v = first(call(repl).apply(null, caps));
    if (v === undefined || v === false) return whole;
    if (typeof v === 'string') return v;
    if (isNum(v)) return numStr(v);
    throw rterror('invalid replacement value (a ' + typeName(v) + ')');
  }

  // ===================================================== conversion =======
  // Between JS values (UTF-16 strings, arrays, objects) and Lua values.
  var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  function toBytes(str) {        // JS string -> Lua byte string
    if (/^[\x00-\x7f]*$/.test(str)) return str;
    var b = encoder.encode(str), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  function fromBytes(s) {        // Lua byte string -> JS string
    if (/^[\x00-\x7f]*$/.test(s)) return s;
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return decoder.decode(b);
  }
  function toLua(v) {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'string') return toBytes(v);
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'function') return v;
    if (v instanceof LuaTable || v instanceof LFloat) return v;
    var t = new LuaTable();
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) t.set(i + 1, toLua(v[i])); return t; }
    Object.keys(v).forEach(function (k) { t.set(toBytes(k), toLua(v[k])); });
    return t;
  }
  function toJS(v, seen) {
    if (v instanceof LFloat) return v.n;
    if (typeof v === 'string') return fromBytes(v);
    if (!(v instanceof LuaTable)) return v;
    seen = seen || new Map();
    if (seen.has(v)) return seen.get(v);
    var n = v.arr.length, hashSize = v.hash ? v.hash.size : 0;
    if (hashSize === 0) {
      var a = [];
      seen.set(v, a);
      for (var i = 0; i < n; i++) a.push(toJS(v.arr[i], seen));
      return a;
    }
    var o = {};
    seen.set(v, o);
    for (var j = 0; j < n; j++) if (v.arr[j] !== undefined) o[j + 1] = toJS(v.arr[j], seen);
    v.hash.forEach(function (val, key) {
      var k = typeof key === 'string' ? fromBytes(key) : (isNum(key) ? numStr(key) : tostring(key));
      o[k] = toJS(val, seen);
    });
    return o;
  }

  NS.LFloat = LFloat; NS.mkf = mkf; NS.Multi = Multi; NS.first = first; NS.sp = sp; NS.ret = ret;
  NS.LuaTable = LuaTable; NS.NONE = NONE; NS.LuaError = LuaError; NS.lineMaps = lineMaps;
  NS.add = add; NS.sub = sub; NS.mul = mul; NS.div = div; NS.idiv = idiv; NS.mod = mod; NS.pow = pow;
  NS.unm = unm; NS.band = band; NS.bor = bor; NS.bxor = bxor; NS.shl = shl; NS.shr = shr; NS.bnot = bnot;
  NS.concat = concat; NS.len = len; NS.eq = eq; NS.lt = lt; NS.le = le; NS.gt = gt; NS.ge = ge;
  NS.T = truthy; NS.index = index; NS.setindex = setindex; NS.call = call; NS.method = method;
  NS.tbl = tbl; NS.iter = iter; NS.forprep = forprep; NS.tostring = tostring; NS.typeName = typeName;
  NS.makeEnv = makeEnv; NS.toLua = toLua; NS.toJS = toJS; NS.toBytes = toBytes; NS.fromBytes = fromBytes;
  NS.numStr = numStr; NS.str2num = str2num; NS.errorValue = errorValue; NS.rterror = rterror;
})(typeof module === 'object' && module.exports
  ? (module.exports = (globalThis.MiddawLua = globalThis.MiddawLua || {}))
  : (globalThis.MiddawLua = globalThis.MiddawLua || {}));


/* ---- ../kit/runtime/lua_compile.js ---- */
/* Middaw's Lua 5.4, part 2 of 3: syntax tree in, JavaScript out.
 *
 * Every Lua local becomes a JS `let` with a name of its own ($x, $x$2...), so
 * shadowing and closures behave as in Lua: a fresh binding per declaration,
 * and per loop iteration. Every operator goes through the runtime, so the
 * integer/float distinction and the error messages are Lua's. Each statement
 * starts a new line carrying a marker with its Lua line number, which is how
 * an error raised in the generated code is reported at the Lua line.
 */
(function (NS) {
  'use strict';

  var ARITH = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '^': 'pow', '//': 'idiv',
                '&': 'band', '|': 'bor', '~': 'bxor', '<<': 'shl', '>>': 'shr', '..': 'concat' };
  var COMPARE = { '==': 'eq', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };

  function compile(ast, chunk) {
    var consts = [];
    var nameCounts = Object.create(null);

    function uniqueName(luaName) {
      var n = (nameCounts[luaName] || 0) + 1;
      nameCounts[luaName] = n;
      return n === 1 ? '$' + luaName : '$' + luaName + '$' + n;
    }

    function FuncState(parent, vararg) {
      this.parent = parent; this.vararg = vararg; this.temps = 0; this.scopes = [];
    }
    var fs = null;
    var stmtUid = 0;

    function newTemp() { fs.temps++; return '$$' + fs.temps; }
    function lookup(name) {
      for (var f = fs; f; f = f.parent) {
        for (var i = f.scopes.length - 1; i >= 0; i--) {
          var js = f.scopes[i][name];
          if (js !== undefined) return js;
        }
      }
      return null;
    }
    function declare(name) {
      var js = uniqueName(name);
      fs.scopes[fs.scopes.length - 1][name] = js;
      return js;
    }
    function openScope() { fs.scopes.push(Object.create(null)); }
    function closeScope() { fs.scopes.pop(); }

    function err(msg, line) {
      throw new NS.LuaSyntaxError(msg, chunk, line || 0);
    }

    function str(s) { return JSON.stringify(s); }

    function numberLiteral(text) {
      var v;
      if (/^0[xX]/.test(text)) {
        if (/[.pP]/.test(text)) v = NS.str2num(text);
        else {
          var big = BigInt.asIntN(64, BigInt('0x' + text.slice(2)));
          return String(Number(big));
        }
      } else if (/[.eE]/.test(text)) {
        v = NS.mkf(Number(text));
      } else {
        var n = Number(text);
        if (Math.abs(n) > 9223372036854775807) v = NS.mkf(n);
        else return String(n);
      }
      if (v instanceof NS.LFloat) {
        var idx = consts.length;
        consts.push(v);
        return '$$K[' + idx + ']';
      }
      var s = String(v);
      return s === 'Infinity' ? 'Infinity' : (s === 'NaN' ? 'NaN' : (v < 0 ? '(' + s + ')' : s));
    }

    function describe(e) {
      if (e.k === 'Name') return lookup(e.name) ? "local '" + e.name + "'" : "global '" + e.name + "'";
      if (e.k === 'Index' && e.key.k === 'String') return "field '" + e.key.v + "'";
      if (e.k === 'Method') return "method '" + e.name + "'";
      return '';
    }

    function isMultiExpr(e) { return e.k === 'Call' || e.k === 'Method' || e.k === 'Vararg'; }

    // A JS expression for the raw result of a call: possibly a Multi.
    function callRaw(e) {
      if (e.k === 'Method') {
        var o = ex(e.obj);
        var args = argList(e.args);
        return 'L.method(' + o + ', ' + str(e.name) + (args ? ', ' + args : '') + ')';
      }
      var fn = ex(e.fn), a = argList(e.args), d = describe(e.fn);
      if (/^\$[A-Za-z_][\w$]*$/.test(fn)) {
        return '(typeof ' + fn + " === 'function' ? " + fn + ' : L.call(' + fn + ', ' + str(d) + '))(' + a + ')';
      }
      var t = newTemp();
      return '(typeof (' + t + ' = ' + fn + ") === 'function' ? " + t + ' : L.call(' + t + ', ' + str(d) + '))(' + a + ')';
    }

    function argList(exprs) {
      var out = [];
      for (var i = 0; i < exprs.length; i++) {
        var e = exprs[i], last = i === exprs.length - 1;
        if (last && (e.k === 'Call' || e.k === 'Method')) out.push('...L.sp(' + callRaw(e) + ')');
        else if (last && e.k === 'Vararg') { checkVararg(e); out.push('...$$va'); }
        else out.push(ex(e));
      }
      return out.join(', ');
    }
    function checkVararg(e) {
      if (!fs.vararg) err("cannot use '...' outside a vararg function", e.line);
    }

    // A JS expression for exactly one Lua value.
    function ex(e) {
      switch (e.k) {
        case 'Nil': return 'undefined';
        case 'True': return 'true';
        case 'False': return 'false';
        case 'Number': return numberLiteral(e.v);
        case 'String': return str(e.v);
        case 'Vararg': checkVararg(e); return '$$va[0]';
        case 'Function': return funcExpr(e);
        case 'Paren': return ex(e.expr);
        case 'Name': {
          var js = lookup(e.name);
          if (js) return js;
          return 'L.index($$G, ' + str(e.name) + ')';
        }
        case 'Index':
          return 'L.index(' + ex(e.obj) + ', ' + ex(e.key) + ', ' + str(describe(e.obj)) + ')';
        case 'Call': case 'Method':
          return 'L.first(' + callRaw(e) + ')';
        case 'Table': return tableExpr(e);
        case 'Unop': {
          if (e.op === 'not') return '!' + cond(e.expr);
          if (e.op === '-') {
            if (e.expr.k === 'Number') {
              var lit = numberLiteral(e.expr.v);
              if (/^\d+$/.test(lit)) return lit === '0' ? '0' : '(-' + lit + ')';
              if (/^[\d.e+-]+$/.test(lit)) return '(-' + lit + ')';
            }
            return 'L.unm(' + ex(e.expr) + ')';
          }
          if (e.op === '#') return 'L.len(' + ex(e.expr) + ')';
          if (e.op === '~') return 'L.bnot(' + ex(e.expr) + ')';
          break;
        }
        case 'Binop': {
          if (e.op === 'and') {
            var t = newTemp();
            return '(L.T(' + t + ' = ' + ex(e.left) + ') ? ' + ex(e.right) + ' : ' + t + ')';
          }
          if (e.op === 'or') {
            var t2 = newTemp();
            return '(L.T(' + t2 + ' = ' + ex(e.left) + ') ? ' + t2 + ' : ' + ex(e.right) + ')';
          }
          if (e.op === '~=') return '!L.eq(' + ex(e.left) + ', ' + ex(e.right) + ')';
          if (COMPARE[e.op]) return 'L.' + COMPARE[e.op] + '(' + ex(e.left) + ', ' + ex(e.right) + ')';
          return 'L.' + ARITH[e.op] + '(' + ex(e.left) + ', ' + ex(e.right) + ')';
        }
      }
      err('cannot compile expression ' + e.k, e.line);
    }

    // A JS boolean expression for Lua truth, without building a Lua value.
    function cond(e) {
      switch (e.k) {
        case 'True': return 'true';
        case 'False': case 'Nil': return 'false';
        case 'Paren': return cond(e.expr);
        case 'Unop': if (e.op === 'not') return '!' + cond(e.expr); break;
        case 'Binop':
          if (e.op === 'and') return '(' + cond(e.left) + ' && ' + cond(e.right) + ')';
          if (e.op === 'or') return '(' + cond(e.left) + ' || ' + cond(e.right) + ')';
          if (e.op === '~=' || COMPARE[e.op]) return ex(e);
          break;
      }
      return 'L.T(' + ex(e) + ')';
    }

    function tableExpr(e) {
      var pos = [], keyed = [];
      for (var i = 0; i < e.items.length; i++) {
        var it = e.items[i];
        if (it.kind === 'pos') {
          var lastPos = true;
          for (var j = i + 1; j < e.items.length; j++) if (e.items[j].kind === 'pos') { lastPos = false; break; }
          if (lastPos && (it.value.k === 'Call' || it.value.k === 'Method')) pos.push('...L.sp(' + callRaw(it.value) + ')');
          else if (lastPos && it.value.k === 'Vararg') { checkVararg(it.value); pos.push('...$$va'); }
          else pos.push(ex(it.value));
        } else {
          keyed.push(ex(it.key), ex(it.value));
        }
      }
      if (!keyed.length) return 'L.tbl([' + pos.join(', ') + '])';
      return 'L.tbl([' + pos.join(', ') + '], [' + keyed.join(', ') + '])';
    }

    function funcExpr(f) {
      var saved = fs;
      fs = new FuncState(saved, f.vararg);
      openScope();
      var params = f.params.map(function (p) { return declare(p); });
      if (f.vararg) params.push('...$$va');
      var body = block(f.body);
      closeScope();
      var temps = '';
      if (fs.temps) {
        var names = [];
        for (var i = 1; i <= fs.temps; i++) names.push('$$' + i);
        temps = 'let ' + names.join(', ') + ';';
      }
      fs = saved;
      return 'function (' + params.join(', ') + ') {' + temps + body + '\n/*@' + (f.endLine || f.line) + '*/return L.NONE;}';
    }

    function block(stmts) {
      var out = '';
      for (var i = 0; i < stmts.length; i++) out += statement(stmts[i]);
      return out;
    }
    function scoped(stmts) {
      openScope();
      var b = block(stmts);
      closeScope();
      return b;
    }

    function assignTo(target, value) {
      if (target.k === 'Name') {
        var js = lookup(target.name);
        if (js) return js + ' = ' + value + ';';
        return 'L.setindex($$G, ' + str(target.name) + ', ' + value + ');';
      }
      return 'L.setindex(' + ex(target.obj) + ', ' + ex(target.key) + ', ' + value + ', ' + str(describe(target.obj)) + ');';
    }

    function valuesArray(exprs) { return '[' + argList(exprs) + ']'; }

    function statement(s) {
      var mark = '\n/*@' + (s.line || 0) + '*/';
      switch (s.k) {
        case 'Local': {
          var attrs = s.attribs || [];
          attrs.forEach(function (a) {
            if (a && a !== 'const' && a !== 'close') err("unknown attribute '" + a + "'", s.line);
          });
          if (s.names.length === 1 && s.exprs.length <= 1) {
            var v = s.exprs.length ? ex(s.exprs[0]) : 'undefined';
            return mark + 'let ' + declare(s.names[0]) + ' = ' + v + ';';
          }
          if (s.exprs.length === s.names.length && !s.exprs.some(isMultiExpr)) {
            var vals = s.exprs.map(ex);
            var tmpNames = vals.map(function () { return '$$l' + (++stmtUid); });
            var pre = 'const ' + tmpNames.map(function (t, i) { return t + ' = ' + vals[i]; }).join(', ') + ';';
            var decl = s.names.map(function (n, i) { return declare(n) + ' = ' + tmpNames[i]; });
            return mark + pre + ' let ' + decl.join(', ') + ';';
          }
          var r = '$$r' + (++stmtUid);
          var code = 'const ' + r + ' = ' + valuesArray(s.exprs) + ';';
          var decls = s.names.map(function (n, i) { return declare(n) + ' = ' + r + '[' + i + ']'; });
          return mark + code + ' let ' + decls.join(', ') + ';';
        }
        case 'LocalFunction': {
          var name = declare(s.name);
          return mark + 'let ' + name + '; ' + name + ' = ' + funcExpr(s.func) + ';';
        }
        case 'Assign': {
          if (s.targets.length === 1 && s.exprs.length === 1) {
            return mark + assignTo(s.targets[0], ex(s.exprs[0]));
          }
          var rr = '$$r' + (++stmtUid);
          var c2 = 'const ' + rr + ' = ' + valuesArray(s.exprs) + ';';
          s.targets.forEach(function (t, i) { c2 += ' ' + assignTo(t, rr + '[' + i + ']'); });
          return mark + c2;
        }
        case 'ExprStat':
          return mark + callRaw(s.expr) + ';';
        case 'Do':
          return mark + '{' + scoped(s.body) + '\n}';
        case 'While':
          return mark + 'while (' + cond(s.cond) + ') {' + scoped(s.body) + '\n}';
        case 'Repeat': {
          openScope();
          var body = block(s.body);
          var cnd = cond(s.cond);
          closeScope();
          return mark + 'for (;;) {' + body + '\nif (' + cnd + ') break;\n}';
        }
        case 'If': {
          var o = mark;
          s.clauses.forEach(function (c, i) {
            o += (i ? ' else if (' : 'if (') + cond(c.cond) + ') {' + scoped(c.body) + '\n}';
          });
          if (s.orelse) o += ' else {' + scoped(s.orelse) + '\n}';
          return o;
        }
        case 'NumFor': {
          var u = ++stmtUid;
          var I = '$$i' + u, LIM = '$$m' + u, ST = '$$s' + u, FL = '$$f' + u;
          var start = ex(s.start), limit = ex(s.limit);
          var stepLit = !s.step ? 1 : (s.step.k === 'Number' && /^\d+$/.test(s.step.v) ? Number(s.step.v) : null);
          var step = s.step ? ex(s.step) : '1';
          var intStart = s.start.k === 'Number' && /^\d+$/.test(s.start.v);
          var test = stepLit !== null && stepLit > 0 ? I + ' <= ' + LIM : '(' + ST + ' > 0 ? ' + I + ' <= ' + LIM + ' : ' + I + ' >= ' + LIM + ')';
          openScope();
          var v2 = declare(s.name);
          var bindVal = (intStart && stepLit !== null) ? I : FL + ' ? L.mkf(' + I + ') : ' + I;
          var bd = block(s.body);
          closeScope();
          return mark + 'for (let [' + I + ', ' + LIM + ', ' + ST + ', ' + FL + '] = L.forprep(' + start + ', ' + limit + ', ' + step + '); ' +
                 test + '; ' + I + ' += ' + ST + ') { let ' + v2 + ' = ' + bindVal + ';' + bd + '\n}';
        }
        case 'GenFor': {
          var it = '$$it' + (++stmtUid);
          var head = 'const ' + it + ' = L.iter(' + argList(s.exprs) + ');';
          openScope();
          var binds = s.names.map(function (n, i) {
            var src = i === 0 ? it + '.a' : (i === 1 ? it + '.b' : it + '.v[' + i + ']');
            return declare(n) + ' = ' + src;
          });
          var gb = block(s.body);
          closeScope();
          return mark + '{' + head + ' while (' + it + '.step()) { let ' + binds.join(', ') + ';' + gb + '\n}}';
        }
        case 'Return': {
          var ex0 = s.exprs;
          if (!ex0.length) return mark + 'return L.NONE;';
          if (ex0.length === 1) {
            if (ex0[0].k === 'Call' || ex0[0].k === 'Method') return mark + 'return ' + callRaw(ex0[0]) + ';';
            if (ex0[0].k === 'Vararg') { checkVararg(ex0[0]); return mark + 'return L.ret($$va);'; }
            return mark + 'return ' + ex(ex0[0]) + ';';
          }
          return mark + 'return L.ret(' + valuesArray(ex0) + ');';
        }
        case 'Break': return mark + 'break;';
        case 'Goto': case 'Label':
          err('goto and labels are not supported by Middaw\'s Lua', s.line);
      }
      err('cannot compile statement ' + s.k, s.line);
    }

    fs = new FuncState(null, true);
    openScope();
    var body = block(ast.body);
    closeScope();
    var temps = '';
    if (fs.temps) {
      var names = [];
      for (var i = 1; i <= fs.temps; i++) names.push('$$' + i);
      temps = 'let ' + names.join(', ') + ';';
    }
    return { body: temps + body, consts: consts };
  }

  // The line the first line of a `new Function` body is reported as.
  var lineOffset = null;
  function probeOffset() {
    if (lineOffset !== null) return lineOffset;
    try {
      new Function('throw new Error("probe");\n//# sourceURL=lua:__probe__')();
    } catch (e) {
      var m = /lua:__probe__:(\d+)/.exec(e.stack || '');
      lineOffset = m ? Number(m[1]) - 1 : 0;
    }
    return lineOffset;
  }

  var chunkUid = 0;
  // Lua source (a byte string) -> a JS function, as `load` gives it.
  function load(src, chunkname, env) {
    var name = String(chunkname || 'chunk').replace(/[^A-Za-z0-9_.\/-]/g, '_');
    if (NS.lineMaps[name]) name = name + '#' + (++chunkUid);
    var ast = NS.parse(src, name);
    var out = compile(ast, name);
    var code = 'return function (...$$va) {' + out.body + '\nreturn L.NONE;\n};';
    var offset = probeOffset();
    var lines = code.split('\n'), map = [], cur = 0;
    for (var i = 0; i < offset; i++) map.push(0);
    for (var j = 0; j < lines.length; j++) {
      var m = /^\/\*@(\d+)\*\//.exec(lines[j]);
      if (m) cur = Number(m[1]);
      map.push(cur);
    }
    NS.lineMaps[name.replace(/#/g, '_')] = map;
    var factory = new Function('L', '$$G', '$$K', code + '\n//# sourceURL=lua:' + name.replace(/#/g, '_'));
    return factory(NS, env || NS.defaultEnv(), out.consts);
  }

  var sharedEnv = null;
  NS.defaultEnv = function () { return sharedEnv || (sharedEnv = NS.makeEnv()); };
  NS.compile = compile;
  NS.load = load;
})(typeof module === 'object' && module.exports
  ? (module.exports = (globalThis.MiddawLua = globalThis.MiddawLua || {}))
  : (globalThis.MiddawLua = globalThis.MiddawLua || {}));


/* ---- ../kit/runtime/host.js ---- */
/* The family's Lua engines, spoken to in JSON.
 *
 * The native app runs this in JavaScriptCore, after the Lua runtime
 * (runtime/lua/), and calls `MiddawHost.call(method, argsJSON)`; the tests run
 * it in Node. It knows no browser and no files: the host hands it a
 * `readFile(path)` that returns the file's bytes as a string, one character
 * per byte, which is how Middaw's Lua keeps its strings.
 *
 * The adapters (Noterator's) are how the generators are spoken to - settings
 * in, notes out - the same protocol Miderator and Noterator use.
 */
(function (G) {
  'use strict';
  var L = G.MiddawLua;

  var FILES = [
    'good-idea/gi_theory.lua', 'good-idea/gi_idea.lua',
    'midi-catalogue/mc_theory.lua', 'midi-catalogue/mc_orchestra.lua', 'midi-catalogue/mc_catalogue.lua',
    'midi-suggester/ms_theory.lua', 'midi-suggester/ms_read.lua', 'midi-suggester/ms_harmony.lua', 'midi-suggester/ms_melody.lua',
    'midi-variator/mv_theory.lua', 'midi-variator/mv_vary.lua',
    'starting-blocks/sb_engine.lua',
    'adapters/common.lua', 'adapters/index.lua', 'adapters/good_idea.lua', 'adapters/midi_suggester.lua',
    'adapters/midi_variator.lua', 'adapters/starting_blocks.lua', 'adapters/midi_catalogue.lua',
    'notation/sb_notate.lua', 'notation/sb_draw.lua', 'notation/sb_glyphs.lua',
    'battle-pass/bp_theory.lua', 'battle-pass/bp_loot.lua', 'battle-pass/bp_game.lua',
    'orchestration/orchestration_data.lua', 'orchestration/orchestration_composers.lua'
  ];

  var readFile = null, modules = {}, env = null, log = function () {};

  function engine(name) {
    if (modules[name] === undefined) {
      var src = readFile(name);
      if (src === null || src === undefined) throw new Error("engine '" + name + "' is not there");
      var r = L.first(L.load(src, name, env)());
      modules[name] = r === undefined ? false : r;
    }
    return modules[name];
  }

  function init(reader, logger) {
    readFile = reader;
    if (logger) log = logger;
    modules = {};
    env = L.makeEnv({
      print: function (s) { log('[lua] ' + L.fromBytes(s)); },
      readFile: function () { return null; },
      writeFile: function () {}
    });
    env.set('engine', function (name) { return engine(name); });
    env.set('dofile', function (name) { return L.first(engine(String(name).replace(/^.*engines\//, ''))); });
    return true;
  }

  function call(mod, fname) {
    var m = typeof mod === 'string' ? engine(mod) : mod;
    var f = L.index(m, fname);
    var args = [];
    for (var i = 2; i < arguments.length; i++) {
      var a = arguments[i];
      args.push(a instanceof L.LuaTable ? a : L.toLua(a));
    }
    return L.first(L.call(f).apply(null, args));
  }
  function js(v) { return L.toJS(v); }
  function list(x) { return !x ? [] : Array.isArray(x) ? x : Object.keys(x).map(function (k) { return x[k]; }); }

  // --------------------------------------------------------- generators --
  var adapters = null;
  function gens() {
    if (adapters) return adapters;
    adapters = list(js(engine('adapters/index.lua'))).map(function (path) {
      var A = engine(path);
      return { id: js(L.index(A, 'id')), name: js(L.index(A, 'name')), description: js(L.index(A, 'description')) || '',
               input: js(L.index(A, 'input')), panel: js(L.index(A, 'panel')) || null, A: A, path: path };
    });
    return adapters;
  }
  function gen(id) {
    var l = gens();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    throw new Error('no generator ' + id);
  }

  // A generator's settings live in Lua, as the engine left them.
  var sessions = {}, nextSession = 1;
  function session(id) { var s = sessions[id]; if (!s) throw new Error('no session ' + id); return s; }
  function normalise(r) {
    r = r || { results: [] };
    r.results = list(r.results);
    r.results.forEach(function (res) {
      res.parts = list(res.parts);
      res.parts.forEach(function (p) { p.notes = list(p.notes); });
    });
    return r;
  }

  // ------------------------------------------------------------- theory --
  // Chord names are ScaleView's, read by Midi Variator's port of it.
  // mv_theory knows the seven-note scales; anything else names chords
  // against the parallel major or minor. Indexed by ScaleView's scale (1-16).
  var MV_SCALE = [1, 2, 3, 1, 4, 5, 6, 7, 2, 1, 2, 1, 2, 1, 2, 1];
  var keyCache = {};
  function luaKey(key) {
    var k = key.root + ':' + key.scale;
    if (!keyCache[k]) keyCache[k] = call('midi-variator/mv_theory.lua', 'key', key.root, MV_SCALE[key.scale - 1] || 1);
    return keyCache[k];
  }

  // -------------------------------------------------------- orchestra ----
  // Noterator's instruments beyond the orchestra (Source/Core/Instruments.cpp).
  var EXTRA = [
    { id: 'asax', name: 'Alto Saxophone', family: 'Woodwind', low: 49, high: 80, sweet: [53, 76], poly: 1, fast: 0.09, leap: 12 },
    { id: 'tsax', name: 'Tenor Saxophone', family: 'Woodwind', low: 44, high: 75, sweet: [48, 70], poly: 1, fast: 0.09, leap: 12 },
    { id: 'bsax', name: 'Baritone Saxophone', family: 'Woodwind', low: 36, high: 69, sweet: [40, 62], poly: 1, fast: 0.10, leap: 12 },
    { id: 'vib', name: 'Vibraphone', family: 'Percussion', low: 53, high: 89, sweet: [55, 84], poly: 4, fast: 0.09, leap: 12 },
    { id: 'sop', name: 'Soprano', family: 'Voices', low: 60, high: 81, sweet: [64, 77], poly: 1, fast: 0.15, leap: 9 },
    { id: 'alto', name: 'Alto', family: 'Voices', low: 53, high: 74, sweet: [57, 69], poly: 1, fast: 0.15, leap: 9 },
    { id: 'ten', name: 'Tenor', family: 'Voices', low: 48, high: 69, sweet: [50, 65], poly: 1, fast: 0.15, leap: 9 },
    { id: 'bass', name: 'Bass', family: 'Voices', low: 40, high: 64, sweet: [43, 60], poly: 1, fast: 0.15, leap: 9 },
    { id: 'gtr', name: 'Guitar', family: 'Band', low: 40, high: 83, sweet: [45, 76], poly: 6, fast: 0.08, leap: 12 },
    { id: 'ebass', name: 'Bass Guitar', family: 'Band', low: 28, high: 67, sweet: [28, 55], poly: 1, fast: 0.09, leap: 12 },
    { id: 'ubass', name: 'Upright Bass', family: 'Band', low: 28, high: 67, sweet: [28, 55], poly: 1, fast: 0.10, leap: 12 },
    { id: 'synth', name: 'Synth', family: 'Band', low: 24, high: 108, sweet: [36, 96], poly: 16, fast: 0.03, leap: 48 },
    { id: 'kit', name: 'Drum Kit', family: 'Band', low: 35, high: 81, sweet: [35, 81], poly: 4, fast: 0.05, leap: 127, drums: true }
  ];

  // ----------------------------------------------------------- notation --
  var notate = null;
  function notation() {
    if (notate) return notate;
    var N = engine('notation/sb_notate.lua'), D = engine('notation/sb_draw.lua'), Gl = engine('notation/sb_glyphs.lua');
    L.call(L.index(D, 'setNotate'))(N);
    L.call(L.index(D, 'setGlyphs'))(Gl);
    notate = { N: N, D: D, E: engine('starting-blocks/sb_engine.lua') };
    return notate;
  }
  // A pen that records what Starting Blocks Notation draws, for the native
  // side to replay. sb_draw.lua uses four calls; colours arrive as the ids
  // given to it (1 ink, 2 staff, 3 ground, 4 accent):
  //   ["line", x1, y1, x2, y2, colour, thickness]
  //   ["poly", [x, y, x, y, ...], colour]
  //   ["circle", x, y, r, colour, filled]
  //   ["text", x, y, colour, text, size, centred]
  function num(v) { return v instanceof L.LFloat ? v.n : +v; }
  function colour(c) { return c instanceof L.LuaTable ? js(c) : num(c); }
  function recordingPen(ops) {
    var pen = new L.LuaTable();
    pen.set('line', function (x1, y1, x2, y2, col, th) {
      ops.push(['line', num(x1), num(y1), num(x2), num(y2), colour(col), th === undefined ? 1 : num(th)]); return L.NONE;
    });
    pen.set('poly', function (pts, col) {
      ops.push(['poly', pts.arr.map(num), colour(col)]); return L.NONE;
    });
    pen.set('circle', function (x, y, r, col, filled) {
      ops.push(['circle', num(x), num(y), num(r), colour(col), !!L.T(filled)]); return L.NONE;
    });
    pen.set('text', function (x, y, col, str, size, center) {
      ops.push(['text', num(x), num(y), colour(col), L.fromBytes(L.tostring(str)), num(size), !!L.T(center)]); return L.NONE;
    });
    return pen;
  }

  // ---------------------------------------------------------- the pass ---
  var pass = null, passState = null, passSession = null;
  function battlePass() {
    if (pass) return pass;
    var T = engine('battle-pass/bp_theory.lua');
    var Lt = L.first(L.call(L.index(engine('battle-pass/bp_loot.lua'), 'init'))(T));
    var Gm = L.first(L.call(L.index(engine('battle-pass/bp_game.lua'), 'init'))(Lt));
    pass = { G: Gm, L: Lt, T: T };
    return pass;
  }

  // ------------------------------------------------------------- methods -
  var M = {
    generators: function () {
      return gens().map(function (g) { return { id: g.id, name: g.name, description: g.description, input: g.input, panel: g.panel }; });
    },
    newSession: function (a) {
      var g = gen(a.generator), id = nextSession++;
      sessions[id] = { g: g, st: L.first(L.call(L.index(g.A, 'newState'))()) };
      return id;
    },
    useKey: function (a) { var s = session(a.session); call(s.g.A, 'useKey', s.st, a.key.root, a.key.scale); return true; },
    settings: function (a) { var s = session(a.session); return list(js(call(s.g.A, 'settings', s.st, L.toLua(a.context || {})))); },
    set: function (a) { var s = session(a.session); call(s.g.A, 'set', s.st, a.setting, a.index, L.toLua(a.context || {})); return true; },
    generate: function (a) {
      var s = session(a.session);
      return normalise(js(call(s.g.A, 'generate', s.st, L.toLua(a.context || {}), a.seed || 1, a.count || 6)));
    },
    snapshot: function (a) { return js(session(a.session).st); },
    restore: function (a) {
      var s = session(a.session);
      Object.keys(a.state || {}).forEach(function (k) { L.setindex(s.st, L.toBytes(k), L.toLua(a.state[k])); });
      return true;
    },
    closeSession: function (a) { delete sessions[a.session]; return true; },

    nameChord: function (a) {
      if (!a.pitches || a.pitches.length < 2) return '';
      var r = L.call(L.index(engine('midi-variator/mv_theory.lua'), 'nameChord'))(L.toLua(a.pitches), luaKey(a.key));
      return js(L.first(r)) || '';
    },
    noteNames: function (a) {
      var k = js(L.index(luaKey(a.key), 'names')), out = [];
      for (var pc = 0; pc < 12; pc++) out.push(k[pc] || k[String(pc)] || '');
      return out;
    },
    // Midi Variator's key finder (ScaleView's), as Miderator's key lane uses it.
    detectKey: function (a) {
      var notes = (a.notes || []).slice().sort(function (x, y) { return x.start - y.start; });
      if (!notes.length) return null;
      var r = list(js(call('midi-variator/mv_theory.lua', 'detectKey',
        notes.map(function (n) { return { pitch: n.pitch, start: n.start, len: n.len }; }),
        notes[0].pitch % 12, notes[notes.length - 1].pitch % 12)));
      if (!r.length) return null;
      return { root: r[0].root, scale: r[0].scale === 2 ? 2 : 1 };
    },
    // Midi Catalogue's orchestra, plus Noterator's band and voices.
    instruments: function () {
      return list(js(L.index(engine('midi-catalogue/mc_orchestra.lua'), 'INSTRUMENTS'))).concat(EXTRA);
    },
    orchestration: function () {
      var A = js(engine('orchestration/orchestration_data.lua'));
      var B = js(engine('orchestration/orchestration_composers.lua'));
      return { entries: list(A.ENTRIES).concat(list(B && B.ENTRIES)),
               sources: Object.assign({}, (B && B.SOURCES) || {}, A.SOURCES || {}) };
    },

    // A part engraved by Starting Blocks Notation: its height and the drawing,
    // as a list of pen calls in staff spaces of `space` points.
    engrave: function (a) {
      var nt = notation();
      var st = L.first(L.call(L.index(nt.E, 'newState'))());
      st.set('root', a.key.root); st.set('scale', a.key.scale); st.set('barBeats', a.barBeats);
      var ctx = L.first(L.call(L.index(nt.N, 'context'))(nt.E, st));
      var block = L.toLua({ notes: a.notes, beats: a.beats, name: a.name || '' });
      var opts = L.toLua({ barBeats: a.barBeats, tsNum: a.meter[0], tsDen: a.meter[1], width: a.width,
                           drums: !!a.drums, grid: a.drums ? 0.25 : undefined,
                           // a clip is as played, so its silences are rests (Starting Blocks Notation 0019)
                           rests: !a.drums });
      opts.set('ctx', ctx);
      var doc = L.first(L.call(L.index(nt.N, 'layout'))(block, opts));
      var height = +L.first(L.call(L.index(nt.D, 'height'))(doc, a.space));
      var ops = [];
      var colours = L.toLua({ ink: 1, staff: 2, ground: 3, accent: 4 });
      var popts = new L.LuaTable();
      if (a.highlight !== undefined && a.highlight >= 0) {
        var at = a.highlight * 960;
        popts.set('highlight', function (el) {
          var abs = L.index(el, 'abs'), ticks = L.index(el, 'ticks');
          return abs !== undefined && at >= +abs && at < +abs + +ticks;
        });
      }
      L.call(L.index(nt.D, 'page'))(recordingPen(ops), doc, 0, 0, a.space, colours, popts);
      return { height: height, ops: ops };
    },

    // The Battle Pass, unchanged: its state is the game's own text.
    // `clock` is seconds of activity time, `epoch` the wall clock in seconds.
    passStart: function (a) {
      var Gm = battlePass().G;
      passState = a.saved ? L.first(L.call(L.index(Gm, 'deserialize'))(L.toBytes(a.saved))) : undefined;
      if (!passState) passState = L.first(L.call(L.index(Gm, 'newState'))(a.epoch));
      L.call(L.index(Gm, 'clampState'))(passState, a.epoch);
      passSession = L.first(L.call(L.index(Gm, 'newSession'))(passState, a.clock, a.epoch));
      L.call(L.index(Gm, 'refresh'))(passState, passSession, a.epoch, new L.LuaTable());
      return true;
    },
    // Any bp_game function; "$state" and "$session" in `args` stand for the
    // game's own tables.
    passCall: function (a) {
      var args = (a.args || []).map(function (x) {
        return x === '$state' ? passState : x === '$session' ? passSession : L.toLua(x);
      });
      return js(L.first(L.call(L.index(battlePass().G, a.fn)).apply(null, args)));
    },
    // What the game wants celebrated since last asked, then forgotten.
    passNotices: function () {
      var l = L.index(passSession, 'notices');
      if (!l || !l.arr || !l.arr.length) return [];
      var out = l.arr.map(function (n) { return js(n); });
      l.arr.length = 0;
      return out;
    },
    passGet: function (a) {
      var v = passState;
      String(a.path).split('.').forEach(function (k) { v = v === undefined ? undefined : L.index(v, isNaN(+k) ? k : +k); });
      return v instanceof L.LFloat ? v.n : js(v);
    },
    // Middaw's composer (runtime/composer/, the port of middaw/): a sentence
    // in, the song's five parts out, exactly as `python3 -m middaw --json`
    // answers. composerLoad takes data/vocab/tags.json and drums.json as text.
    composerLoad: function (a) {
      if (!G.MiddawComposer || !G.MiddawComposer.load) throw new Error('the composer is not loaded');
      G.MiddawComposer.load(JSON.parse(a.tags), JSON.parse(a.drums));
      return true;
    },
    compose: function (a) {
      var C = G.MiddawComposer;
      if (!C || !C.vocabulary) throw new Error('the composer has no vocabulary');
      return C.compose(String(a.prompt || ''), a.seed === undefined || a.seed === null ? undefined : a.seed);
    },

    // The game's own tables that are not state: the shop, the check-in
    // calendar, the rarities (module 'loot').
    passConst: function (a) {
      var P = battlePass();
      var v = L.index(a.module === 'loot' ? P.L : P.G, String(a.name));
      // a list that is also indexed by name (G.SHOP[id]) is its list
      if (v instanceof L.LuaTable && L.index(v, 1) != null) {
        var out = [];
        for (var i = 1; L.index(v, i) != null; i++) out.push(js(L.index(v, i)));
        return out;
      }
      return js(v);
    },
    passSave: function () { return L.fromBytes(L.first(L.call(L.index(battlePass().G, 'serialize'))(passState))); },

    // AutoCC (the JSFX, unchanged) run over a clip's notes: the curves it
    // would play, as controller lanes {number: [[beat, value], ...]}. Only a
    // point where the value turns is kept, not every step.
    autoCC: function (a) {
      var J = G.MiddawJSFX;
      if (!J) throw new Error('the JSFX runtime is not loaded');
      var fx = new J.JSFX(a.source, {});
      Object.keys(a.sliders || {}).forEach(function (k) { fx.setSliderByIndex(Number(k), a.sliders[k]); });
      var sr = 48000, bs = 256;
      fx.init(sr);
      fx.setTime({ tempo: a.tempo, playState: 1, num: a.meter[0], den: a.meter[1] });
      var ev = [];
      (a.notes || []).forEach(function (n) {
        ev.push([n.start, [0x90, n.pitch, n.vel]]);
        ev.push([n.start + n.len, [0x80, n.pitch, 0]]);
      });
      ev.sort(function (x, y) { return x[0] - y[0]; });
      var spb = sr * 60 / a.tempo, total = Math.ceil(a.length * spb / bs) + 8, k = 0, lanes = {};
      for (var b = 0; b < total; b++) {
        var midi = [];
        while (k < ev.length && ev[k][0] * spb < (b + 1) * bs) {
          midi.push({ offset: Math.max(0, Math.round(ev[k][0] * spb - b * bs)), data: ev[k][1] }); k++;
        }
        fx.setTime({ beat: b * bs / spb, seconds: b * bs / sr });
        fx.process(bs, null, null, midi).forEach(function (m) {
          if ((m.data[0] & 0xF0) !== 0xB0) return;
          var beat = (b * bs + m.offset) / spb;
          if (beat > a.length) return;
          (lanes[m.data[1]] = lanes[m.data[1]] || []).push([Math.round(beat * 1000) / 1000, m.data[2]]);
        });
      }
      Object.keys(lanes).forEach(function (num) {
        var pts = lanes[num], out = [];
        pts.forEach(function (pt, i) {
          var prev = out[out.length - 1];
          if (!prev || i === pts.length - 1 || Math.abs(pt[1] - prev[1]) >= 2) out.push(pt);
        });
        lanes[num] = out;
      });
      return lanes;
    }
  };

  G.MiddawHost = {
    FILES: FILES,
    init: init,
    // The one entry point the native side uses: JSON in, JSON out, errors
    // returned rather than thrown so they cross the bridge as text.
    call: function (method, argsJSON) {
      try {
        if (!M[method]) throw new Error('no method ' + method);
        var r = M[method](argsJSON ? JSON.parse(argsJSON) : {});
        return JSON.stringify({ ok: true, value: r === undefined ? null : r });
      } catch (e) {
        var msg = e && (e.message || (e.value !== undefined ? String(L.tostring ? L.tostring(e.value) : e.value) : String(e)));
        return JSON.stringify({ ok: false, error: msg || 'error' });
      }
    },
    methods: M
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);


/* ---- ../kit/ui.js ---- */
/* The family's look, drawn with Max's mgraphics in a [v8ui].
 *
 * Colours are Palette's (palette.js), after Ableton Live 8: neutral greys,
 * the amber accent for what is on, every word 7:1 on its surface. A control
 * registers its rectangle while it is painted, so a click goes to whatever
 * was drawn under it last paint - no layout is kept twice.
 */
var UI = (function () {
  'use strict';
  function rgb(hex, a) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, a === undefined ? 1 : a];
  }
  // The colours are Palette's (palette.js): Live 8's neutral greys and amber.
  var P = Palette.C;
  var C = {
    accent: rgb(P.accent), accentHeld: rgb(P.accentHeld), control: rgb(P.control), controlHeld: rgb(P.controlHeld),
    ground: rgb(P.ground), raised: rgb(P.raised), sunken: rgb(P.sunken), rule: rgb(P.rule),
    edge: rgb(P.edge), ink: rgb(P.ink), text: rgb(P.text), dim: rgb(P.dim),
    label: rgb(P.label), warn: rgb(P.warn), warnText: rgb(P.warnText), mark: rgb(P.mark), note: rgb(P.note)
  };

  var g = null, hits = [], drag = null, FONT = 'Arial';

  function begin(graphics) {
    g = graphics;
    hits = [];
    g.select_font_face(FONT);
  }
  function fill(c) { g.set_source_rgba(c[0], c[1], c[2], c[3]); }
  function rect(x, y, w, h, c) { fill(c); g.rectangle(x, y, w, h); g.fill(); }
  function round(x, y, w, h, r, c) { fill(c); g.rectangle_rounded(x, y, w, h, r, r); g.fill(); }
  function frame(x, y, w, h, c) { fill(c); g.set_line_width(1); g.rectangle(x + 0.5, y + 0.5, w - 1, h - 1); g.stroke(); }
  function measure(s, size) { g.set_font_size(size || 10); var m = g.text_measure(String(s)); return m[0]; }

  // Text cut to fit, with an ellipsis, so a long name never runs into the next control.
  function fit(s, w, size) {
    s = String(s);
    if (measure(s, size) <= w) return s;
    while (s.length > 1 && measure(s + '…', size) > w) s = s.slice(0, -1);
    return s + '…';
  }
  // align: 0 left, 1 centre, 2 right; y is the box top, h its height.
  function text(s, x, y, w, h, c, size, align, bold) {
    size = size || 10;
    g.select_font_face(FONT, 'normal', bold ? 'bold' : 'normal');
    g.set_font_size(size);
    var t = fit(s, w, size), tw = measure(t, size);
    var tx = align === 1 ? x + (w - tw) / 2 : align === 2 ? x + w - tw : x;
    fill(c);
    g.move_to(tx, y + h / 2 + size * 0.36);
    g.show_text(t);
    g.select_font_face(FONT, 'normal', 'normal');
  }

  function hit(x, y, w, h, handler) { hits.push({ x: x, y: y, w: w, h: h, fn: handler }); }
  function find(px, py) {
    for (var i = hits.length - 1; i >= 0; i--) {
      var r = hits[i];
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return r;
    }
    return null;
  }

  // A push button: title-style words, ink on the control grey, accent when on.
  function button(label, x, y, w, h, on, handler, enabled) {
    var off = enabled === false;
    round(x, y, w, h, 3, off ? C.raised : on ? C.accent : C.control);
    text(label, x + 4, y, w - 8, h, off ? C.dim : C.ink, 10, 1, true);
    if (!off) hit(x, y, w, h, { click: handler });
  }

  // A value chosen from a list: click the left third for the one before, the
  // rest for the one after, or drag up and down through them.
  function stepper(label, names, index, x, y, w, onChange) {
    text(label, x, y, w, 12, C.label, 9, 0);
    var by = y + 13, bh = 18;
    round(x, by, w, bh, 3, C.sunken);
    frame(x, by, w, bh, C.rule);
    text('‹', x + 3, by, 8, bh, C.dim, 11, 1);
    text('›', x + w - 11, by, 8, bh, C.dim, 11, 1);
    text(names[index - 1] === undefined ? '' : names[index - 1], x + 12, by, w - 24, bh, C.text, 10, 1);
    var n = names.length;
    var last = index;
    function to(i) { i = Math.max(1, Math.min(n, i)); if (i !== last) { last = i; onChange(i); } }
    hit(x, by, w, bh, {
      click: function (px) { to(px < x + w / 3 ? index - 1 : index + 1); },
      drag: function (dy) { to(index - Math.round(dy / 8)); }
    });
  }

  // The same, in one line for a small panel (a MIDI Tool's): the label at
  // the left, the value at the right, the arrows at the ends.
  function row(label, names, index, x, y, w, h, onChange) {
    round(x, y, w, h, 3, C.sunken);
    frame(x, y, w, h, C.rule);
    text('‹', x + 1, y, 8, h, C.dim, 10, 1);
    text('›', x + w - 9, y, 8, h, C.dim, 10, 1);
    var lw = Math.round((w - 18) * 0.42);
    text(label, x + 10, y, lw - 2, h, C.label, 9, 0);
    text(names[index - 1] === undefined ? '' : names[index - 1], x + 10 + lw, y, w - 20 - lw, h, C.text, 9, 2);
    var n = names.length, last = index;
    function to(i) { i = Math.max(1, Math.min(n, i)); if (i !== last) { last = i; onChange(i); } }
    hit(x, y, w, h, {
      click: function (px) { to(px < x + w / 3 ? index - 1 : index + 1); },
      drag: function (dy) { to(index - Math.round(dy / 8)); }
    });
  }

  function toggle(label, on, x, y, w, h, onChange) {
    round(x, y, w, h, 3, on ? C.accent : C.control);
    text(label, x + 4, y, w - 8, h, C.ink, 10, 1, true);
    hit(x, y, w, h, { click: function () { onChange(!on); } });
  }

  // Mouse, as [v8ui] delivers it: onclick then ondrag until the button is up.
  function click(px, py) {
    var r = find(px, py);
    drag = null;
    if (!r) return false;
    if (r.fn.drag) drag = { r: r, y0: py, moved: false };
    else if (r.fn.click) r.fn.click(px, py);
    return true;
  }
  function dragTo(px, py, down) {
    if (!drag) return;
    var dy = drag.y0 - py;
    if (down) {
      if (Math.abs(dy) >= 4) drag.moved = true;
      if (drag.moved) drag.r.fn.drag(dy);
    } else {
      if (!drag.moved && drag.r.fn.click) drag.r.fn.click(px, py);
      drag = null;
    }
  }

  return { C: C, begin: begin, rect: rect, round: round, frame: frame, text: text, fit: fit, measure: measure,
           hit: hit, button: button, stepper: stepper, row: row, toggle: toggle, click: click, dragTo: dragTo, find: find };
})();


/* ---- ../kit/live.js ---- */
/* The Live set, as the family's devices need it: the song's tempo, meter and
 * scale, the notes of the clip being edited, somewhere to put new notes, and
 * a way to hear notes before they are used.
 *
 * Everything goes through the Live Object Model (LiveAPI). Times are beats,
 * which in Live are quarter notes - the unit every family engine already
 * speaks - so nothing is converted but the field names.
 */
var Live = (function () {
  'use strict';
  function api(path) { return new LiveAPI(null, path); }
  function one(a, prop) { var v = a.get(prop); return Array.isArray(v) ? v[0] : v; }
  function exists(a) { return a && Number(a.id) !== 0; }
  function json(v) {
    if (typeof v === 'string') return JSON.parse(v);
    if (Array.isArray(v) && typeof v[0] === 'string' && v.length === 1) return JSON.parse(v[0]);
    return v;
  }

  // Live 12's scale names, as ScaleView numbers its scales (1-16). A scale
  // ScaleView has no name for is left out: the device keeps its own key.
  var SCALE = {
    'Major': 1, 'Minor': 2, 'Harmonic Minor': 3, 'Dorian': 5, 'Phrygian': 6, 'Lydian': 7,
    'Mixolydian': 8, 'Major Pentatonic': 10, 'Minor Pentatonic': 11, 'Minor Blues': 13,
    'Whole Tone': 14, 'Whole-half Dim.': 15, 'Half-whole Dim.': 16
  };
  // ScaleView's eighteen roots, and the spelling a key on each pitch class
  // takes: flats for the major side, sharps where a minor key has them.
  var ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb'];
  var MAJOR_SIDE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MINOR_SIDE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  var MINORISH = { 2: 1, 3: 1, 5: 1, 6: 1, 11: 1, 13: 1 };
  var SCALE_NAMES = ['Major', 'Minor (Natural)', 'Harmonic Minor', 'Ionian', 'Dorian', 'Phrygian', 'Lydian',
                     'Mixolydian', 'Aeolian', 'Major Pentatonic', 'Minor Pentatonic', 'Major Blues', 'Minor Blues',
                     'Whole Tone', 'Diminished Whole-Half', 'Diminished Half-Whole'];

  // Live's scale (a root pitch class and a name) as the family's key, or
  // null for a scale ScaleView does not have.
  function keyOf(pc, name) {
    var sc = SCALE[String(name)];
    if (!sc) return null;
    return { root: ROOTS.indexOf((MINORISH[sc] ? MINOR_SIDE : MAJOR_SIDE)[((+pc % 12) + 12) % 12]) + 1, scale: sc };
  }

  function song() {
    var s = api('live_set');
    var out = { tempo: +one(s, 'tempo') || 120, num: +one(s, 'signature_numerator') || 4,
                den: +one(s, 'signature_denominator') || 4, playing: !!+one(s, 'is_playing'),
                position: +one(s, 'current_song_time') || 0, key: null };
    var mode = s.get('scale_mode');
    if (mode !== undefined && mode !== null) {
      var name = String(one(s, 'scale_name')), pc = +one(s, 'root_note');
      out.liveScale = { on: !!+(Array.isArray(mode) ? mode[0] : mode), name: name, root: pc };
      out.key = keyOf(pc, name);
    }
    return out;
  }

  function detailClip() {
    var c = api('live_set view detail_clip');
    if (!exists(c) || !+one(c, 'is_midi_clip')) return null;
    return c;
  }

  // The clip being edited: its selected notes if any are selected, else every
  // note in its loop. Starts are from the start of what was taken.
  function clipNotes() {
    var c = detailClip();
    if (!c) return null;
    var from = +one(c, 'loop_start') || 0, to = +one(c, 'loop_end') || 0;
    var raw = null, selected = false;
    try { raw = json(c.call('get_selected_notes_extended')); selected = raw && raw.notes && raw.notes.length > 0; } catch (e) { raw = null; }
    if (!selected) raw = json(c.call('get_notes_extended', 0, 128, from, Math.max(0, to - from)));
    var notes = ((raw && raw.notes) || []).filter(function (n) { return !n.mute; }).map(function (n) {
      return { start: n.start_time, len: n.duration, pitch: n.pitch, vel: Math.round(n.velocity) };
    });
    var first = selected && notes.length ? Math.min.apply(null, notes.map(function (n) { return n.start; })) : from;
    var beats = to - from;
    if (selected) {
      var bar = 4, end = 0;
      notes.forEach(function (n) { end = Math.max(end, n.start + n.len); });
      first = Math.floor(first / bar) * bar;
      beats = Math.ceil((end - first) / bar) * bar;
    }
    notes.forEach(function (n) { n.start -= first; });
    notes.sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });
    return { notes: notes, beats: beats, name: String(one(c, 'name') || ''), selected: selected, drums: drumTrack() };
  }

  // A track whose instrument is a Drum Rack plays drums: its note numbers name
  // drums, not pitches, and the engines treat them that way.
  function drumTrack() {
    try {
      var track = api('this_device canonical_parent'), n = track.getcount('devices');
      for (var i = 0; i < n; i++) if (+one(api(track.unquotedpath + ' devices ' + i), 'can_have_drum_pads')) return true;
    } catch (e) { /* not known: not drums */ }
    return false;
  }

  function liveNotes(notes) {
    return { notes: notes.map(function (n) {
      return { pitch: Math.max(0, Math.min(127, Math.round(n.pitch))), start_time: Math.max(0, n.start),
               duration: Math.max(1 / 128, n.len), velocity: Math.max(1, Math.min(127, Math.round(n.vel || 100))), mute: 0 };
    }) };
  }

  function undoable(fn) {
    var s = api('live_set');
    try { s.call('begin_undo_step'); } catch (e) { /* Live before 11.1 */ }
    try { return fn(); } finally { try { s.call('end_undo_step'); } catch (e2) { /* as above */ } }
  }

  function show(clip) {
    try { api('live_set view').set('detail_clip', 'id', Number(clip.id)); } catch (e) { /* the clip is made either way */ }
  }

  function selectedScene() {
    var scene = api('live_set view selected_scene'), n = api('live_set').getcount('scenes');
    for (var i = 0; i < n; i++) if (Number(api('live_set scenes ' + i).id) === Number(scene.id)) return i;
    return 0;
  }
  function thisTrack() {
    var track = api('this_device canonical_parent');
    if (!exists(track) || !+one(track, 'has_midi_input')) return null;
    return track;
  }
  // Where this device's track is in the set, for putting new tracks beside it.
  function trackIndex(track) {
    var n = api('live_set').getcount('tracks');
    for (var i = 0; i < n; i++) if (Number(api('live_set tracks ' + i).id) === Number(track.id)) return i;
    return n - 1;
  }
  function clipInSlot(slot, notes, beats, name) {
    slot.call('create_clip', Math.max(1, beats));
    var clip = api(slot.unquotedpath + ' clip');
    if (name) clip.set('name', name);
    clip.call('add_new_notes', liveNotes(notes));
    return clip;
  }
  function freeSlot(track, from) {
    var n = track.getcount('clip_slots');
    for (var k = 0; k < n; k++) {
      var at = (from + k) % n, slot = api(track.unquotedpath + ' clip_slots ' + at);
      if (!+one(slot, 'has_clip')) return { slot: slot, at: at };
    }
    return null;
  }
  function arrangementClipOn(track, notes, beats, name, at) {
    var before = track.getcount('arrangement_clips');
    try { track.call('create_midi_clip', at, Math.max(1, beats)); } catch (e) { /* checked below */ }
    var count = track.getcount('arrangement_clips');
    if (!(count > before)) return false;
    for (var i = 0; i < count; i++) {
      var clip = api(track.unquotedpath + ' arrangement_clips ' + i);
      if (Math.abs((+one(clip, 'start_time') || 0) - at) < 1e-6) {
        if (name) clip.set('name', name);
        clip.call('add_new_notes', liveNotes(notes));
        return true;
      }
    }
    return false;
  }

  // New notes, as a new clip in the first free slot on this device's track,
  // from the selected scene down. `more` are further parts ({name, notes}),
  // each on a new MIDI track after this one, in the same scene. Returns what
  // happened, for the status line.
  function newClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var free = freeSlot(track, selectedScene());
    if (!free) return { ok: false, message: 'Every clip slot on this track is full. Add a scene, then try again.' };
    return undoable(function () {
      var clip = clipInSlot(free.slot, notes, beats, name);
      var made = newTracks(track, more, function (t) {
        clipInSlot(api(t.unquotedpath + ' clip_slots ' + free.at), this.notes, beats, this.name);
      });
      show(clip);
      return { ok: true, message: 'Added a clip in scene ' + (free.at + 1) + (made ? ', and ' + made + ' on new tracks beside it.' : '.') };
    });
  }

  // New notes on a new MIDI track beside this one, in the selected scene:
  // a suggestion goes with the music it was made for, not over it.
  function newTrackClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var scene = selectedScene();
    return undoable(function () {
      var parts = [{ name: name, notes: notes }].concat(more || []);
      newTracks(track, parts, function (t) { show(clipInSlot(api(t.unquotedpath + ' clip_slots ' + scene), this.notes, beats, this.name)); });
      return { ok: true, message: parts.length === 1 ? 'Added a track beside this one, with the clip in scene ' + (scene + 1) + '.'
                                                     : 'Added ' + parts.length + ' tracks beside this one, with the clips in scene ' + (scene + 1) + '.' };
    });
  }

  // Each further part on a new MIDI track, in order, after this one.
  function newTracks(track, more, put) {
    if (!more || !more.length) return '';
    var at = trackIndex(track), song = api('live_set');
    more.forEach(function (part, k) {
      song.call('create_midi_track', at + 1 + k);
      var t = api('live_set tracks ' + (at + 1 + k));
      t.set('name', part.name);
      put.call(part, t);
    });
    return more.length === 1 ? 'one more part' : more.length + ' more parts';
  }

  // New notes in place of the notes of the clip being edited, from its loop start.
  function replaceInClip(notes, beats) {
    var c = detailClip();
    if (!c) return { ok: false, message: 'No MIDI clip is open. Open one in Detail View, then try again.' };
    var from = +one(c, 'loop_start') || 0;
    return undoable(function () {
      var span = Math.max(beats, (+one(c, 'loop_end') || 0) - from);
      c.call('remove_notes_extended', 0, 128, from, span);
      c.call('add_new_notes', liveNotes(notes.map(function (n) {
        return { start: n.start + from, len: n.len, pitch: n.pitch, vel: n.vel };
      })));
      if ((+one(c, 'loop_end') || 0) < from + beats) c.set('loop_end', from + beats);
      return { ok: true, message: 'Replaced the notes in “' + (String(one(c, 'name') || '') || 'the clip') + '”.' };
    });
  }

  // New notes in the Arrangement at the insert marker, on this device's track
  // (Track.create_midi_clip, Live 12.2 and later); further parts as above.
  function arrangementClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var at = +one(api('live_set'), 'current_song_time') || 0;
    return undoable(function () {
      if (!arrangementClipOn(track, notes, beats, name, at)) {
        return { ok: false, message: 'This version of Live can\u2019t add Arrangement clips from a device. Choose New Clip instead.' };
      }
      var made = newTracks(track, more, function (t) { arrangementClipOn(t, this.notes, beats, this.name, at); });
      return { ok: true, message: 'Added a clip to the Arrangement at beat ' + (Math.round(at * 100) / 100 + 1) +
               (made ? ', and ' + made + ' on new tracks beside it.' : '.') };
    });
  }

  // ------------------------------------------------------------ player ---
  // Notes heard through this device's MIDI out: the instrument after it on
  // the track plays them. A Task ticks every few milliseconds and sends what
  // is due; nothing waits on the transport.
  function Player(send) {
    this.send = send; this.events = []; this.pos = 0; this.t0 = 0; this.task = null; this.sounding = {};
    this.onEnd = null;
  }
  Player.prototype.play = function (notes, tempo, onEnd) {
    this.stop();
    var ms = 60000 / (tempo || 120), ev = [];
    notes.forEach(function (n) {
      ev.push({ t: n.start * ms, on: true, pitch: n.pitch, vel: n.vel || 100 });
      ev.push({ t: (n.start + n.len) * ms - 1, on: false, pitch: n.pitch });
    });
    ev.sort(function (a, b) { return a.t - b.t || (a.on === b.on ? 0 : a.on ? 1 : -1); });
    this.events = ev; this.pos = 0; this.t0 = Date.now(); this.onEnd = onEnd || null;
    var self = this;
    this.task = new Task(function () { self.tick(); }, this);
    this.task.interval = 4;
    this.task.repeat();
    this.tick();
  };
  Player.prototype.tick = function () {
    var now = Date.now() - this.t0;
    while (this.pos < this.events.length && this.events[this.pos].t <= now) {
      var e = this.events[this.pos++];
      if (e.on) { this.sounding[e.pitch] = (this.sounding[e.pitch] || 0) + 1; this.send([0x90, e.pitch, Math.max(1, Math.min(127, Math.round(e.vel)))]); }
      else if (this.sounding[e.pitch]) { this.sounding[e.pitch]--; this.send([0x80, e.pitch, 0]); }
    }
    if (this.pos >= this.events.length) {
      var end = this.onEnd;
      this.stop();
      if (end) end();
    }
  };
  Player.prototype.playing = function () { return !!this.task; };
  Player.prototype.stop = function () {
    if (this.task) { this.task.cancel(); this.task.freepeer && this.task.freepeer(); this.task = null; }
    var self = this;
    Object.keys(this.sounding).forEach(function (p) {
      for (var i = 0; i < self.sounding[p]; i++) self.send([0x80, +p, 0]);
    });
    this.sounding = {};
    this.onEnd = null;
  };

  return { song: song, clipNotes: clipNotes, newClip: newClip, newTrackClip: newTrackClip, replaceInClip: replaceInClip,
           arrangementClip: arrangementClip, drumTrack: drumTrack, Player: Player, ROOTS: ROOTS, SCALE_NAMES: SCALE_NAMES,
           keyOf: keyOf };
})();


/* ---- ../kit/miditool.js ---- */
/* A family engine as a Live 12 MIDI Tool: in the clip view's Generate or
 * Transform panel, beside Live's own.
 *
 * Live hands the tool the clip's notes and a context (the time selection,
 * the clip's scale, the grid, a seed for this apply) through
 * [live.miditool.in]; [dict.join] makes them one dictionary, and this answers
 * at once with the notes to write, through [live.miditool.out]:
 *   - a Generator (DEVICE.tool 'generate') writes the chosen result into the
 *     time selection, repeated to fill it; Live adds it to what is there;
 *   - a Transformation ('transform') replaces the notes it was given: with a
 *     variation of them, or (DEVICE.beside) with them and a suggestion that
 *     goes with them.
 * The key is the clip's scale when the clip has one ScaleView knows, else the
 * tool's own Key and Scale. The engine is the repository's own Lua, run
 * unchanged by Middaw's Lua runtime, spoken to through Noterator's adapter,
 * exactly as in the MIDI effect (generator.js).
 *
 * Changing a setting asks Live for the notes again (a bang to
 * [live.miditool.in], a moment later: from inside an apply it would nest).
 *
 * Expects, before it: Palette, UI, Live, MiddawHost, and DEVICE = { generator,
 * tool, files }. Outlets: 0 the notes to [live.miditool.out], 1 the saved
 * state to [pattr], 2 a bang to [live.miditool.in].
 */
inlets = 1;
outlets = 3;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var H = MiddawHost;
H.init(function (p) { return DEVICE.files[p] === undefined ? null : DEVICE.files[p]; },
       function (s) { post(s + '\n'); });

function call(method, args) {
  var r = JSON.parse(H.call(method, args === undefined ? '' : JSON.stringify(args)));
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

var GEN = null;
call('generators').forEach(function (g) { if (g.id === DEVICE.generator) GEN = g; });
var TRANSFORM = DEVICE.tool === 'transform';

var T = {
  session: call('newSession', { generator: DEVICE.generator }),
  key: { root: 1, scale: 1 },   // the tool's own, for a clip with no scale
  clipKey: null,                // the clip's, from the last apply
  song: { tempo: 120, num: 4, den: 4 },
  settings: [], results: [], pick: 1, part: 0, inst: 'pno', page: 0,
  input: null, applied: false, wrote: 0, status: '', warn: false, ready: false, pending: null
};

function say(msg, warn) { T.status = msg || ''; T.warn = !!warn; }
function keyName(k) { return Live.ROOTS[k.root - 1] + ' ' + Live.SCALE_NAMES[k.scale - 1]; }
function barBeats() { return T.song.num * 4 / T.song.den; }
function key() { return T.clipKey || T.key; }

function context() {
  var sel = T.input || { notes: [], beats: 0 };
  var k = key();
  return { root: k.root, scale: k.scale, num: T.song.num, den: T.song.den, barBeats: barBeats(), bpm: T.song.tempo,
           inst: T.inst, catalogueId: T.inst, bars: 4,
           selection: { notes: sel.notes, beats: sel.beats, drums: false } };
}

// The settings a tool shows: which result, the engine's own, then the parts
// and the instrument where the engine has them, then the key (only when the
// clip has none of its own, or it would be a control that does nothing).
var OWN_KEY = { root: 1, scale: 1, key: 1 };
var EXTRA = { asax: 1, tsax: 1, bsax: 1, vib: 1, sop: 1, alto: 1, ten: 1, bass: 1, gtr: 1, ebass: 1, ubass: 1, synth: 1, kit: 1 };
var INSTRUMENTS = DEVICE.instrument ? call('instruments').filter(function (i) { return !EXTRA[i.id]; }) : [];
function partNames() {
  var most = [];
  T.results.forEach(function (r) { if (r.parts.length > most.length) most = r.parts; });
  return most.length > 1 ? ['All Parts'].concat(most.map(function (p, i) { return p.name || ('Part ' + (i + 1)); })) : null;
}
function rows() {
  var out = [];
  // DEVICE.short: a result is named by what comes before its first wide gap
  // (Starting Blocks' numeral: "IV  C Major IV Chord Triad" is IV).
  var names = T.results.length ? T.results.map(function (r, i) {
    var t = r.title || String(i + 1);
    return DEVICE.short ? t.split('  ')[0] : t;
  }) : ['1'];
  if (T.pick > names.length) T.pick = 1;
  out.push({ id: '$pick', label: DEVICE.result || 'Result', names: names, index: T.pick });
  if (INSTRUMENTS.length) {
    var at = 0;
    INSTRUMENTS.forEach(function (x, i) { if (x.id === T.inst) at = i; });
    out.push({ id: '$inst', label: 'Instrument', names: INSTRUMENTS.map(function (x) { return x.name; }), index: at + 1 });
  }
  T.settings.forEach(function (s) { out.push(s); });
  var parts = partNames();
  if (parts) {
    if (T.part >= parts.length) T.part = 0;
    out.push({ id: '$part', label: 'Part', names: parts, index: T.part + 1 });
  }
  if (!DEVICE.keyless && !T.clipKey) {
    out.push({ id: '$root', label: 'Key', names: Live.ROOTS, index: T.key.root });
    out.push({ id: '$scale', label: 'Scale', names: Live.SCALE_NAMES, index: T.key.scale });
  }
  return out;
}

function refresh() {
  call('useKey', { session: T.session, key: key() });
  T.settings = call('settings', { session: T.session, context: context() }).filter(function (s) { return !OWN_KEY[s.id]; });
}

// Before Live has asked for anything, a generator lists what it would write
// in the tool's own key, so Result names something.
function preview() {
  if (TRANSFORM || T.applied) return;
  T.results = call('generate', { session: T.session, context: context(), seed: 1, count: 8 }).results || [];
}

function readSong() {
  try { var s = Live.song(); T.song = { tempo: s.tempo, num: s.num, den: s.den }; } catch (e) { /* not in Live */ }
}

// ------------------------------------------------------------ the apply --
// Live's notes (start_time, duration...) as the engines' (start, len...),
// from the start of what the tool was given.
function fromLive(notes, base) {
  return notes.filter(function (n) { return !+n.mute; }).map(function (n) {
    return { start: +n.start_time - base, len: +n.duration, pitch: +n.pitch, vel: Math.round(+n.velocity || 100) };
  }).sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });
}
function toLive(n, base) {
  return { pitch: Math.max(0, Math.min(127, Math.round(n.pitch))), start_time: base + n.start,
           duration: Math.max(1 / 64, n.len), velocity: Math.max(1, Math.min(127, Math.round(n.vel || 100))) };
}
// Where the tool writes: the time selection, else (a transformation) the
// bars the notes it was given cover, else (a generator) four bars.
function span(d, notes) {
  var c = d.clip || d;
  var a = +c.time_selection_start, b = +c.time_selection_end;
  if (b > a) return { base: a, beats: b - a };
  var bar = barBeats();
  if (!TRANSFORM || !notes.length) return { base: a > 0 ? a : 0, beats: bar * 4 };
  var lo = Infinity, hi = 0;
  notes.forEach(function (n) { lo = Math.min(lo, +n.start_time); hi = Math.max(hi, +n.start_time + +n.duration); });
  var base = Math.floor(lo / bar) * bar;
  return { base: base, beats: Math.max(bar, Math.ceil((hi - base) / bar) * bar) };
}
function clipScale(d) {
  var s = d.scale || {};
  var on = Array.isArray(s.scale_mode) ? s.scale_mode[0] : s.scale_mode;
  return +on ? Live.keyOf(s.root_note, s.scale_name) : null;
}
function chosen() {
  var r = T.results[T.pick - 1];
  if (!r) return null;
  var parts = T.part > 0 && r.parts[T.part - 1] ? [r.parts[T.part - 1]] : r.parts;
  var all = [];
  parts.forEach(function (p) { p.notes.forEach(function (n) { all.push(n); }); });
  return { notes: all, beats: r.beats || 4, title: r.title || GEN.name };
}

// What the tool writes for one apply. Returns Live's notes.
function compute(d) {
  readSong();
  var given = (d.notes || []).slice();
  var at = span(d, given);
  var ck = clipScale(d);
  T.clipKey = ck;
  T.input = TRANSFORM ? { notes: fromLive(given, at.base), beats: at.beats } : { notes: [], beats: at.beats };
  var keep = TRANSFORM ? given : [];   // what a transformation leaves if it has nothing to say
  if (TRANSFORM && !T.input.notes.length) { say('Select notes to change first.'); return keep; }
  var seed = 1 + Math.abs(Math.round(+d.seed || 0)) % 99999;
  refresh();
  var r = call('generate', { session: T.session, context: context(), seed: seed, count: 8 });
  T.results = r.results || [];
  var c = chosen();
  if (!c || !c.notes.length) { say(r.message || 'Nothing fits these settings. Change one, then try again.', !r.message); return keep; }
  var out = [];
  if (TRANSFORM) {
    // A variation replaces what it was given; a suggestion goes with it.
    if (DEVICE.beside) given.forEach(function (n) { out.push(n); });
    c.notes.forEach(function (n) {
      if (n.start < at.beats) out.push(toLive({ start: n.start, len: Math.min(n.len, at.beats - n.start), pitch: n.pitch, vel: n.vel }, at.base));
    });
  } else {
    // A block fills the time selection, repeated as a pattern is.
    var len = c.beats > 0 ? c.beats : at.beats;
    for (var k = 0; k * len < at.beats; k++) {
      c.notes.forEach(function (n) {
        var st = k * len + n.start;
        if (st < at.beats - 1e-9) out.push(toLive({ start: st, len: Math.min(n.len, at.beats - st), pitch: n.pitch, vel: n.vel }, at.base));
      });
    }
  }
  T.wrote = out.length - (DEVICE.beside ? given.length : 0);
  say(c.title);
  return out;
}

function send(notes) {
  var body = { notes: notes };
  if (typeof outlet_dictionary === 'function') { outlet_dictionary(0, body); return; }
  var dct = new Dict();
  dct.parse(JSON.stringify(body));
  outlet(0, 'dictionary', dct.name);
}

// The joined notes and context. v8 hands a dictionary to msg_dictionary as an
// object when the function exists; dictionary(name) is the older route.
function msg_dictionary(d) { applyFrom(d); }
function dictionary(name) {
  var d = null;
  try { d = JSON.parse(new Dict(String(name)).stringify()); } catch (e) { d = null; }
  if (d) applyFrom(d);
}
function applyFrom(d) {
  var notes;
  try { notes = compute(d); } catch (e) { say(String(e.message || e), true); notes = TRANSFORM ? (d.notes || []) : []; }
  T.applied = true;
  send(notes);
  mgraphics.redraw();
}

// Ask Live to apply again, after this message is done.
var again = new Task(function () { outlet(2, 'bang'); });
function reapply() { if (T.applied) again.schedule(1); }

// ------------------------------------------------------------ messages --
function bang() {
  T.ready = true;
  if (T.pending) { restoreFrom(T.pending); T.pending = null; }
  readSong();
  try { refresh(); preview(); }
  catch (e) { say(String(e.message || e), true); }
  if (!T.status) say(TRANSFORM ? 'Select notes, then Transform.' : 'Choose, then click Generate.');
  mgraphics.redraw();
}
function save() {
  outlet(1, 'set', JSON.stringify({ v: 1, st: call('snapshot', { session: T.session }), key: T.key,
                                    pick: T.pick, part: T.part, inst: T.inst }));
}
function restore(text) {
  var st = null;
  try { st = JSON.parse(String(text)); } catch (e) { return; }
  if (!T.ready) { T.pending = st; return; }
  restoreFrom(st);
  mgraphics.redraw();
}
function restoreFrom(st) {
  if (!st || st.v !== 1) return;
  if (st.st) call('restore', { session: T.session, state: st.st });
  if (st.key) T.key = st.key;
  T.pick = st.pick || 1;
  T.part = st.part || 0;
  if (st.inst) T.inst = st.inst;
  refresh();
  preview();
}
function choose(id, index) {
  if (id === '$pick') T.pick = index;
  else if (id === '$part') T.part = index - 1;
  else if (id === '$inst') T.inst = INSTRUMENTS[index - 1].id;
  else if (id === '$root') T.key = { root: index, scale: T.key.scale };
  else if (id === '$scale') T.key = { root: T.key.root, scale: index };
  else call('set', { session: T.session, setting: id, index: index, context: context() });
  try {
    refresh();
    preview();
  } catch (e) { say(String(e.message || e), true); }
  save();
  reapply();
  mgraphics.redraw();
}

// --------------------------------------------------------------- paint --
var ROW_H = 17, GAP = 1, TOP = 16;
function size() {
  var r = (typeof box !== 'undefined' && box.rect) ? box.rect : [0, 0, 152, 147];
  return [r[2] - r[0], r[3] - r[1]];
}
function paint() {
  var g = mgraphics, sz = size(), W = sz[0], Ht = sz[1];
  UI.begin(g);
  UI.rect(0, 0, W, Ht, UI.C.ground);
  UI.text(T.status || GEN.name, 3, 0, W - 6, TOP - 2, T.warn ? UI.C.warnText : UI.C.dim, 9, 0);
  var all = rows();
  var per = Math.max(1, Math.floor((Ht - TOP - ROW_H - GAP) / (ROW_H + GAP)));
  if (all.length <= per + 1) per = all.length;
  var pages = Math.max(1, Math.ceil(all.length / per));
  if (T.page >= pages) T.page = 0;
  all.slice(T.page * per, (T.page + 1) * per).forEach(function (s, i) {
    UI.row(s.label, s.names, s.index, 2, TOP + i * (ROW_H + GAP), W - 4, ROW_H, function (k) { choose(s.id, k); });
  });
  if (pages > 1) {
    var y = Ht - ROW_H - 1, bw = 22;
    UI.button('‹', 2, y, bw, ROW_H, false, function () { T.page = (T.page + pages - 1) % pages; mgraphics.redraw(); });
    UI.text('Settings ' + (T.page + 1) + ' of ' + pages, 2 + bw, y, W - 4 - 2 * bw, ROW_H, UI.C.dim, 9, 1);
    UI.button('›', W - 2 - bw, y, bw, ROW_H, false, function () { T.page = (T.page + 1) % pages; mgraphics.redraw(); });
  }
}
function onclick(x, y) { if (UI.click(x, y)) mgraphics.redraw(); }
function ondrag(x, y, but) { UI.dragTo(x, y, !!but); }

