--[[ The catalogue, by running it.

     Every entry of every type, for every instrument and section, is made and
     then checked the way a player or a harmony teacher would check it:
     inside the instrument, no faster than it plays, no leap wider than it
     takes in passing, one note at a time where it only has one, breathing
     where it breathes, on the chords where it should be. Then particular
     things are checked by name: that a tresillo falls where a tresillo falls,
     that an anticipation plays the next chord, that the strings are voiced
     top to bottom.

       lua5.4 tests/test_catalogue.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local Ck = dofile(HERE .. "/check.lua")
local ok, eq, eqList = Ck.ok, Ck.eq, Ck.eqList
local T = dofile(Ck.SCRIPTS .. "mc_theory.lua")
local O = dofile(Ck.SCRIPTS .. "mc_orchestra.lua")
local C = dofile(Ck.SCRIPTS .. "mc_catalogue.lua").init(T, O)

local EPS = 1e-6

-- Failures are counted per kind of check rather than per note, so one broken
-- rule reads as one line with a count and the first example, not a thousand.
local tally = {}
local function expect(cond, rule, example)
  local t = tally[rule]
  if not t then t = { n = 0, bad = 0 }; tally[rule] = t end
  t.n = t.n + 1
  if not cond then
    t.bad = t.bad + 1
    t.example = t.example or example
  end
end
local function flush()
  local rules = {}
  for r in pairs(tally) do rules[#rules + 1] = r end
  table.sort(rules)
  for _, r in ipairs(rules) do
    local t = tally[r]
    ok(t.bad == 0, ("%s  (%d of %d broke it, e.g. %s)"):format(r, t.bad, t.n, tostring(t.example)))
    -- The rule is reported once, but it was checked t.n times.
    Ck.checks = Ck.checks + t.n - 1
  end
  tally = {}
end

local function where(ctx, ty, e, part)
  return ("%s %s / %s / %s / %s"):format(T.ROOTS[ctx.key.root].name, T.SCALES[ctx.key.scale].name,
    part and part.name or "?", ty, e.label)
end

local function isDownbeat(ctx, t)
  local b = t / ctx.barBeats
  if math.abs(b - math.floor(b + 0.5)) < EPS then return true end
  for _, s in ipairs(ctx.slots) do if math.abs(t - s.start) < EPS then return true end end
  return false
end

------------------------------------------------------------------------------
-- What every entry has to be
------------------------------------------------------------------------------

local function checkEntry(ctx, ty, e)
  local cat = C.categoryOf(ty)
  for _, part in ipairs(e.parts) do
    local inst, notes = part.inst, part.notes
    local w = where(ctx, ty, e, part)
    expect(#notes > 0, "every part has notes", w)
    for i, n in ipairs(notes) do
      expect(n.pitch >= inst.low and n.pitch <= inst.high, "every note inside its instrument's range", w .. " " .. n.pitch)
      expect(n.start >= -EPS and n.start + n.len <= ctx.L + 1e-3, "every note inside the block", w)
      expect(n.len > 0, "every note has a length", w)
      if ctx.drums then
        local pc = n.pitch % 12
        expect(pc == ctx.drums.tonicPc or pc == ctx.drums.fifthPc, "the timpani play only tonic and dominant", w)
      end
      if inst.poly == 1 and notes[i + 1] then
        expect(n.start + n.len <= notes[i + 1].start + EPS, "a melodic instrument never overlaps itself", w)
        expect(notes[i + 1].start > n.start + EPS, "a melodic instrument plays one note at a time", w)
      end
    end
    if inst.poly > 1 then
      -- A sweep over note-ons and note-offs, offs first at a shared time.
      local ev = {}
      for _, n in ipairs(notes) do
        ev[#ev + 1] = { n.start + EPS, 1 }
        ev[#ev + 1] = { n.start + n.len, -1 }
      end
      table.sort(ev, function(a, b) if a[1] ~= b[1] then return a[1] < b[1] end return a[2] < b[2] end)
      local most, now = 0, 0
      for _, x in ipairs(ev) do now = now + x[2]; most = math.max(most, now) end
      expect(most <= inst.poly, "never more notes at once than the instrument has hands for", w .. " " .. most)
    end
    expect(C.shortestGap(notes) >= C.fastBeats(ctx, inst) - 1e-4,
           "nothing faster than the instrument plays cleanly at this tempo", w)
    if inst.poly == 1 then
      expect(C.widestQuickLeap(notes) <= inst.leap, "no leap wider than the instrument takes in passing", w)
    end
    if inst.breath then
      local phrase = 2 * ctx.barBeats
      local k = 1
      while k * phrase < ctx.L - EPS do
        local B = k * phrase
        local through = false
        for _, n in ipairs(notes) do
          if n.start < B - EPS and n.start + n.len > B - 0.25 + EPS then through = true end
        end
        expect(not through, "wind and brass breathe every two bars", w .. " at " .. B)
        k = k + 1
      end
    end
    if cat == "Melody" then
      for i, n in ipairs(notes) do
        local ch = C.slotAt(ctx, n.start).chord
        if isDownbeat(ctx, n.start) then
          expect(T.hasPc(ch, n.pitch % 12), "a melody's downbeats are chord tones", w .. " at " .. n.start)
        end
        if i == #notes then
          expect(T.hasPc(ch, n.pitch % 12), "a melody ends on a chord tone", w)
        end
      end
    end
    -- Under a chord that brings a note the scale lacks, the scale note it
    -- replaces never sounds against it: no Eb under a borrowed C major.
    for _, n in ipairs(notes) do
      local slot = C.slotAt(ctx, n.start)
      -- The pedal is under the chords on purpose, and an anticipation plays
      -- the next chord early on purpose.
      if slot.key ~= ctx.key and ty ~= "Pedal" and not e.id:find("^anticip") then
        local pc = n.pitch % 12
        local inBase, inBent = false, false
        for d = 0, ctx.n - 1 do
          if T.pc(ctx.key, d) == pc then inBase = true end
          if T.pc(slot.key, d) == pc then inBent = true end
        end
        expect(not (inBase and not inBent and not T.hasPc(slot.chord, pc)),
               "nothing clashes with a borrowed chord's own notes", w .. " at " .. n.start)
      end
    end
    if ty == "Triadic" or ty == "Arpeggiated" or ty == "Contrary motion" then
      for _, n in ipairs(notes) do
        expect(n.ct, "block harmony is made of chord tones", w .. " at " .. n.start)
      end
    end
  end
end

-- A catalogue: every entry checked, ids unique, nothing listed twice.
local function checkCatalogue(ctx, ty)
  local good, res = pcall(C.catalogue, ctx, ty)
  expect(good, "a catalogue never raises", ty .. ": " .. tostring(res))
  if not good then return nil end
  local ids = {}
  for _, e in ipairs(res.entries) do
    expect(not ids[e.id], "every entry in a type has its own id", ty .. " " .. e.id)
    ids[e.id] = true
    expect(e.band == C.densityBand(e.density), "every entry is in its density band", ty)
    checkEntry(ctx, ty, e)
  end
  for _, h in ipairs(res.hidden) do
    expect(type(h.reason) == "string" and h.count > 0, "what is left out is counted with a reason", ty)
  end
  return res
end

local function allTypes()
  local out = {}
  for _, c in ipairs(C.CATEGORIES) do for _, t in ipairs(c.types) do out[#out + 1] = t end end
  return out
end
local TYPES = allTypes()
eq(#TYPES, 25, "twenty-five types, as asked for")

------------------------------------------------------------------------------
-- The whole orchestra, in C major over I-V-vi-IV
------------------------------------------------------------------------------

for _, inst in ipairs(O.INSTRUMENTS) do
  local ctx = C.context({ root = 1, scale = 1, prog = "I-V-vi-IV", inst = inst.id, bars = 4, bpm = 120 })
  for _, ty in ipairs(TYPES) do
    local res = checkCatalogue(ctx, ty)
    if res then
      if res.avoided then
        expect(O.avoids(inst, C.categoryOf(ty), ty) ~= nil, "only what an instrument avoids is avoided", inst.name .. " " .. ty)
      else
        expect(#res.entries > 0, "every type an instrument plays has entries", inst.name .. " " .. ty)
      end
    end
  end
end
flush()

for _, ens in ipairs(O.ENSEMBLES) do
  local ctx = C.context({ root = 1, scale = 1, prog = "I-V-vi-IV", inst = "pno", ensemble = ens.id, bars = 4 })
  for _, ty in ipairs(C.CATEGORIES[3].types) do
    local res = checkCatalogue(ctx, ty)
    if res then
      expect(#res.entries > 0, "every harmony type has entries for every section", ens.name .. " " .. ty)
      for _, e in ipairs(res.entries) do
        expect(#e.parts == #ens.parts, "a section's entry has a part for every player", ens.name .. " " .. ty)
      end
    end
  end
end
flush()

------------------------------------------------------------------------------
-- Other keys, metres, lengths, tempos and registers
------------------------------------------------------------------------------

local CONTEXTS = {
  { root = 4, scale = 5, prog = "i-VI-III-VII", note = "D Dorian" },
  { root = 14, scale = 11, prog = "I-V", note = "A minor pentatonic", timp = true },
  { root = 9, scale = 3, prog = "i-VII-VI-V", note = "F# harmonic minor, the Andalusian cadence" },
  { root = 6, scale = 7, prog = "I", note = "Eb Lydian on one chord" },
  { root = 1, scale = 1, prog = "ii-V-I", barBeats = 3, note = "3/4", timp = true },
  { root = 1, scale = 1, prog = "I-IV-V-I", bars = 1, note = "one bar", timp = true },
  { root = 1, scale = 1, prog = "I-vi-IV-V", bars = 8, note = "eight bars" },
  { root = 11, scale = 2, prog = "i-iv-v-i", bpm = 60, register = "Low", note = "G minor, slow, low" },
  { root = 16, scale = 8, prog = "I-IV", bpm = 180, register = "High", colour = "seventh", note = "Bb Mixolydian, fast, high, sevenths" },
  { root = 1, scale = 14, prog = "I-V", note = "whole tone" },
  { root = 1, scale = 16, prog = "I-IV", note = "half-whole diminished" },
  { root = 1, scale = 2, chain = "0:c:maj,3:d:Triad,4:c:7,0:d:Triad", note = "C minor, borrowed I and V7", timp = true },
  { root = 1, scale = 1, chain = "0:d:7th,1:c:7,1:d:7th,4:c:7alt", note = "C major, II7 and an altered V" },
  { root = 4, scale = 5, chain = "0:c:Tristan,3:c:So What,6:c:sus4", note = "D Dorian, named chords" },
  { root = 8, scale = 1, chain = "0:d:9th,5:c:m(add9),3:c:5", bars = 2, note = "F major, add9 and a power chord" },
}
for _, o in ipairs(CONTEXTS) do
  for _, id in ipairs({ "pno", "vln1", "tuba", "cl", o.timp and "timp" or nil }) do
    local ctx = C.context({ root = o.root, scale = o.scale, prog = o.prog, chain = o.chain, inst = id, bars = o.bars or 4,
                            barBeats = o.barBeats or 4, bpm = o.bpm or 120, register = o.register,
                            colour = o.colour })
    for _, ty in ipairs(TYPES) do checkCatalogue(ctx, ty) end
  end
  for _, ens in ipairs({ "strings", "horns" }) do
    local ctx = C.context({ root = o.root, scale = o.scale, prog = o.prog, chain = o.chain, inst = "pno", ensemble = ens,
                            bars = o.bars or 4, barBeats = o.barBeats or 4, bpm = o.bpm or 120,
                            register = o.register, colour = o.colour })
    for _, ty in ipairs(C.CATEGORIES[3].types) do checkCatalogue(ctx, ty) end
  end
end
flush()

-- Every scale, every type, on the piano: nothing raises.
for scale = 1, #T.SCALES do
  local key = T.key(1, scale)
  local progs = T.progressionsFor(key)
  local ctx = C.context({ root = 1, scale = scale, prog = progs[#progs].id, inst = "pno" })
  for _, ty in ipairs(TYPES) do checkCatalogue(ctx, ty) end
end
flush()

------------------------------------------------------------------------------
-- Nothing is random
------------------------------------------------------------------------------

do
  local function sig(ctx, ty)
    local out = {}
    for _, e in ipairs(C.catalogue(ctx, ty).entries) do
      for _, n in ipairs(e.parts[1].notes) do out[#out + 1] = ("%s%.3f%d"):format(e.id, n.start, n.pitch) end
    end
    return table.concat(out, ";")
  end
  for _, ty in ipairs(TYPES) do
    local a = sig(C.context({ inst = "pno", prog = "I-V-vi-IV" }), ty)
    local b = sig(C.context({ inst = "pno", prog = "I-V-vi-IV" }), ty)
    ok(a == b and #a > 0, "the same choices make the same " .. ty .. " every time")
  end
end

------------------------------------------------------------------------------
-- Particular things, by name
------------------------------------------------------------------------------

local function entry(ctx, ty, id)
  for _, e in ipairs(C.catalogue(ctx, ty).entries) do if e.id == id then return e end end
  error("no " .. ty .. " entry " .. id)
end
local function starts(notes)
  local out, seen = {}, {}
  for _, n in ipairs(notes) do
    local k = ("%.3f"):format(n.start)
    if not seen[k] then seen[k] = true; out[#out + 1] = k end
  end
  return out
end
local function pcsAt(notes, t)
  local out = {}
  for _, n in ipairs(notes) do if math.abs(n.start - t) < EPS then out[#out + 1] = n.pitch % 12 end end
  table.sort(out)
  return out
end

local pno = C.context({ inst = "pno", prog = "I-V-vi-IV" })
local one = C.context({ inst = "pno", prog = "I", bars = 1 })

-- The tresillo falls on 0, 1.5 and 3 of every bar.
eqList(starts(entry(one, "Tresillo", "332@root").parts[1].notes), { "0.000", "1.500", "3.000" },
       "3+3+2 is on 0, 1.5 and 3")
-- Off-beats are all on the 'and'.
for _, n in ipairs(entry(pno, "Syncopation", "offbeats@root").parts[1].notes) do
  eq(n.start % 1, 0.5, "every off-beat is on an 'and'")
end
-- The anticipation plays the next chord half a beat early: G over the end
-- of the C bar.
do
  local notes = entry(pno, "Syncopation", "anticip@root").parts[1].notes
  eqList(pcsAt(notes, 3.5), { 7 }, "the 'and' of four in the C bar plays G, the next chord's root")
  eq(#pcsAt(notes, 4), 0, "and the G bar's own downbeat is not struck again")
end
-- A hemiola in eighths, one note a group, crosses the bar line.
eqList(starts(entry(one, "Hemiola", "3 over 2 in eighths@groups@root").parts[1].notes),
       { "0.000", "1.500", "3.000" }, "3 over 2 in eighths: a note every dotted quarter")
-- Three against two in a beat: both layers, together.
do
  local notes = entry(one, "Polyrhythm", "3:2@a beat").parts[1].notes
  local s = {}
  for _, n in ipairs(notes) do if n.start < 1 - EPS then s[#s + 1] = ("%.3f"):format(n.start) end end
  table.sort(s)
  eqList(s, { "0.000", "0.000", "0.333", "0.500", "0.667" }, "3 against 2: 0, 1/3, 1/2, 2/3, and both on the one")
end
-- An arpeggio up one octave in eighths over C: C E G C.
do
  local notes = entry(one, "Arpeggio", "Up@1/8@1").parts[1].notes
  local pcs = {}
  for i = 1, 4 do pcs[i] = notes[i].pitch % 12 end
  eqList(pcs, { 0, 4, 7, 0 }, "Up in eighths is C E G C")
  ok(notes[4].pitch - notes[1].pitch == 12, "an octave apart")
end
-- Alberti: low, high, middle, high.
do
  local notes = entry(one, "Alberti", "low-high-mid-high@false@1/8").parts[1].notes
  local p = {}
  for i = 1, 4 do p[i] = notes[i].pitch end
  ok(p[1] < p[3] and p[3] < p[2] and p[2] == p[4], "Alberti goes low, high, middle, high")
  eqList({ p[1] % 12, p[3] % 12, p[2] % 12 }, { 0, 4, 7 }, "on C, E and G")
end
-- A tonic pedal in the bass holds C under all four chords.
do
  local notes = entry(pno, "Pedal", "4v@tonic@bass@held").parts[1].notes
  local low = notes[1]
  for _, n in ipairs(notes) do if n.pitch < low.pitch then low = n end end
  eq(low.pitch % 12, 0, "the pedal is C")
  ok(low.len > pno.L * 0.95, "held for the whole block")
end
-- Contrary motion: the outer voices mostly go opposite ways.
do
  local e = entry(pno, "Contrary motion", "4v@up@held")
  local onsets = starts(e.parts[1].notes)
  local tops, bottoms = {}, {}
  for _, t in ipairs(onsets) do
    local lo, hi = 200, -1
    for _, n in ipairs(e.parts[1].notes) do
      if ("%.3f"):format(n.start) == t or (n.start < tonumber(t) - EPS and n.start + n.len > tonumber(t) + EPS) then
        lo, hi = math.min(lo, n.pitch), math.max(hi, n.pitch)
      end
    end
    tops[#tops + 1], bottoms[#bottoms + 1] = hi, lo
  end
  local contrary, similar = 0, 0
  for i = 2, #tops do
    local s, b = tops[i] - tops[i - 1], bottoms[i] - bottoms[i - 1]
    if s * b < 0 then contrary = contrary + 1 elseif s * b > 0 then similar = similar + 1 end
  end
  ok(contrary > similar, ("the outer voices move against each other (%d contrary, %d similar)"):format(contrary, similar))
end
-- The strings, voiced top to bottom, the basses an octave under the cellos.
do
  local ctx = C.context({ inst = "pno", ensemble = "strings", prog = "I-V-vi-IV" })
  local e = entry(ctx, "Triadic", "held")
  local at0 = {}
  for _, part in ipairs(e.parts) do at0[part.name] = part.notes[1].pitch end
  ok(at0["Violin I"] > at0["Violin II"] and at0["Violin II"] > at0["Viola"] and at0["Viola"] > at0["Cello"],
     "Violin I above Violin II above Viola above Cello")
  eq(at0["Cello"] - at0["Double Bass"], 12, "the double basses an octave under the cellos")
end
-- The high horns above the low ones.
do
  local ctx = C.context({ inst = "pno", ensemble = "horns", prog = "I-IV-V-I" })
  local e = entry(ctx, "Triadic", "held")
  local p = {}
  for _, part in ipairs(e.parts) do p[part.name] = part.notes[1].pitch end
  ok(p["Horn 1"] > p["Horn 3"] and p["Horn 3"] > p["Horn 2"] and p["Horn 2"] > p["Horn 4"],
     "horns 1 and 3 above 2 and 4, 1 highest and 4 lowest")
end
-- Contours are the shapes they are named for.
do
  local vln = C.context({ inst = "vln1", prog = "I-V-vi-IV" })
  for _, e in ipairs(C.catalogue(vln, "Arch").entries) do
    local notes = e.parts[1].notes
    local peak = 1
    for i, n in ipairs(notes) do if n.pitch > notes[peak].pitch then peak = i end end
    expect(peak > 1 and peak < #notes, "an arch peaks in the middle", e.label)
  end
  for _, e in ipairs(C.catalogue(vln, "Ascending").entries) do
    local notes = e.parts[1].notes
    expect(notes[#notes].pitch > notes[1].pitch, "an ascending line ends higher than it starts", e.label)
  end
  for _, e in ipairs(C.catalogue(vln, "Descending").entries) do
    local notes = e.parts[1].notes
    expect(notes[#notes].pitch < notes[1].pitch, "a descending line ends lower than it starts", e.label)
  end
  -- Lines are lines: mostly steps, few notes struck twice in a row.
  for _, ty in ipairs({ "Ascending", "Descending", "Arch", "Wave" }) do
    for _, e in ipairs(C.catalogue(vln, ty).entries) do
      local notes = e.parts[1].notes
      local steps, repeats = 0, 0
      for i = 2, #notes do
        local d = math.abs(T.nearestPos(vln.key, notes[i].pitch) - T.nearestPos(vln.key, notes[i - 1].pitch))
        if d == 1 then steps = steps + 1 elseif d == 0 then repeats = repeats + 1 end
      end
      expect(steps >= (#notes - 1) / 2, "a contour moves mostly by step", ty .. " " .. e.label)
      expect(repeats <= (#notes - 1) / 4, "a contour repeats a note at most one move in four", ty .. " " .. e.label)
    end
  end
  flush()
end
-- A closing melody comes home to the root of the last chord.
do
  local vln = C.context({ inst = "vln1", prog = "I-IV-V-I" })
  for _, ty in ipairs({ "Descending", "Arch", "Sequence", "Call/response", "Development" }) do
    for _, e in ipairs(C.catalogue(vln, ty).entries) do
      local notes = e.parts[1].notes
      expect(notes[#notes].pitch % 12 == 0, "a closing melody ends on the root", ty .. " " .. e.label)
    end
  end
  flush()
end
-- Unchanged repetition over one chord is note for note the same every bar.
do
  local ctx = C.context({ inst = "fl", prog = "I", bars = 4 })
  local e = entry(ctx, "Repetition", "turn@literal")
  local bars = {}
  for _, n in ipairs(e.parts[1].notes) do
    local b = math.floor(n.start / 4)
    bars[b] = (bars[b] or "") .. ("%.2f:%d "):format(n.start - b * 4, n.pitch)
  end
  eq(bars[0], bars[1], "bar 2 is bar 1")
  eq(bars[1], bars[2], "bar 3 is bar 1")
end

-- A borrowed chord is played with its own notes: a C major chord in C minor
-- has E natural in its arpeggio, its ostinato and its melody, and no Eb.
do
  local ctx = C.context({ root = 1, scale = 2, chain = "0:c:maj", inst = "pno", bars = 1 })
  for _, case in ipairs({ { "Arpeggio", "Up@1/8@1" }, { "Ostinato", "1-3-5-3@1/8" } }) do
    local pcs = {}
    for _, n in ipairs(entry(ctx, case[1], case[2]).parts[1].notes) do pcs[n.pitch % 12] = true end
    ok(pcs[4] and not pcs[3], case[1] .. " over a borrowed C major in C minor plays E, not Eb")
  end
  local vln = C.context({ root = 1, scale = 2, chain = "0:c:maj,4:c:7", inst = "vln1", bars = 4 })
  local sawE, sawB = false, false
  for _, e in ipairs(C.catalogue(vln, "Arch").entries) do
    for _, n in ipairs(e.parts[1].notes) do
      if n.start < 8 and n.pitch % 12 == 4 then sawE = true end
      if n.start >= 8 and n.pitch % 12 == 11 then sawB = true end
    end
  end
  ok(sawE, "the violin's arches use E natural over the borrowed C major")
  ok(sawB, "and B natural, the leading tone, over G7")
end

-- The timpani avoid what they cannot play, and say why.
do
  local ctx = C.context({ inst = "timp", prog = "I-V-vi-IV" })
  ok(C.catalogue(ctx, "Arch").avoided, "the timpani have no melodies")
  ok(C.catalogue(ctx, "Triadic").avoided, "no harmony voices")
  ok(C.catalogue(ctx, "Arpeggio").avoided, "no arpeggios")
  -- They rest through a chord with neither of their notes.
  local rest = C.context({ inst = "timp", prog = "ii-V-I" })
  local notes = entry(rest, "Pulse", "root@1/4").parts[1].notes
  for _, n in ipairs(notes) do ok(n.start >= 4 - EPS, "the timpani rest through ii, which has neither C nor G") end
end

-- Tempo decides what is too quick.
do
  local slow = C.catalogue(C.context({ inst = "tuba", bpm = 60 }), "Ostinato")
  local fast = C.catalogue(C.context({ inst = "tuba", bpm = 180 }), "Ostinato")
  ok(#slow.entries > #fast.entries, ("the tuba plays more ostinatos at 60 bpm (%d) than at 180 (%d)")
     :format(#slow.entries, #fast.entries))
  ok(fast.hidden[1] and fast.hidden[1].reason:find("too quick for the Tuba at 180 bpm", 1, true),
     "and says the rest are too quick at 180")
end

-- Register moves the material within the instrument.
do
  local function mean(reg)
    local e = C.catalogue(C.context({ inst = "vc", register = reg }), "Arch").entries[1]
    local s = 0
    for _, n in ipairs(e.parts[1].notes) do s = s + n.pitch end
    return s / #e.parts[1].notes
  end
  -- A line moves between registers by whole octaves, so two neighbouring
  -- registers can agree on one; the three never go the wrong way, and High
  -- is always above Low.
  ok(mean("Low") <= mean("Middle") and mean("Middle") <= mean("High") and mean("Low") < mean("High"),
     "Low, Middle and High climb the cello")
end

------------------------------------------------------------------------------
-- Shaping
------------------------------------------------------------------------------

do
  local cases = {
    { C.context({ inst = "vln1", prog = "I-V-vi-IV" }), "Arch" },
    { C.context({ inst = "pno", prog = "I-V-vi-IV" }), "Ostinato" },
    { C.context({ inst = "pno", prog = "I-V-vi-IV" }), "Triadic" },
    { C.context({ inst = "timp", prog = "I-V" }), "Tresillo" },
    { C.context({ inst = "pno", ensemble = "strings", prog = "I-IV-V-I" }), "Triadic" },
  }
  for _, case in ipairs(cases) do
    local ctx, ty = case[1], case[2]
    local e = C.catalogue(ctx, ty).entries[1]
    local label = ty .. " on " .. e.parts[1].name
    local orig = C.block(ctx, ty, e, {})
    local count = #orig.notes
    eq(orig.beats, ctx.L, label .. ": the original is the block's length")
    for _, n in ipairs(orig.notes) do expect(n.vel == 100, "everything leaves at velocity 100", label) end

    local aug = C.block(ctx, ty, e, { transform = "Augmentation" })
    eq(aug.beats, ctx.L * 2, label .. ": augmentation doubles the length")
    eq(#aug.notes, count, label .. ": and keeps every note")
    eq(aug.notes[2].start, orig.notes[2].start * 2, label .. ": at twice the distance")
    eq(C.block(ctx, ty, e, { transform = "Diminution" }).beats, ctx.L / 2, label .. ": diminution halves it")

    for _, tf in ipairs({ "Inversion", "Retrograde", "Retrograde inversion" }) do
      local b = C.block(ctx, ty, e, { transform = tf })
      eq(b.beats, ctx.L, label .. ": " .. tf .. " keeps the length")
      for pi, part in ipairs(b.parts) do
        for _, n in ipairs(part.notes) do
          expect(n.pitch >= part.inst.low and n.pitch <= part.inst.high, "transformed notes stay in range", label .. " " .. tf)
          expect(n.start >= -EPS and n.start + n.len <= ctx.L + 1e-3, "transformed notes stay in the block", label .. " " .. tf)
          if ctx.drums then
            expect(n.pitch == ctx.drums.tonic or n.pitch == ctx.drums.dominant, "the timpani stay on their drums", label .. " " .. tf)
          end
          if n.ct then
            expect(T.hasPc(C.slotAt(ctx, n.start).chord, n.pitch % 12),
                   "a chord tone lands on a chord tone of the chord under it", label .. " " .. tf)
          end
        end
      end
    end

    local rep = C.block(ctx, ty, e, { repeats = 4 })
    eq(rep.beats, ctx.L * 4, label .. ": four repeats are four times as long")
    eq(#rep.notes, count * 4, label .. ": with four times the notes")

    local acc = C.block(ctx, ty, e, { velocity = "Accents" })
    local seen = {}
    for _, n in ipairs(acc.notes) do seen[n.vel] = true end
    for v in pairs(seen) do expect(v == 100 or v == C.ACCENT, "accents are 100 and " .. C.ACCENT .. " only", label) end
  end
  flush()
end

-- Retrograde reverses the rhythm of a line.
do
  local ctx = C.context({ inst = "fl", prog = "I", bars = 1 })
  local e = entry(ctx, "Arpeggio", "Up@1/8@1")
  local b = C.block(ctx, "Arpeggio", e, { transform = "Retrograde" })
  local first = b.parts[1].notes[1]
  local lastOrig = e.parts[1].notes[#e.parts[1].notes]
  eq(("%.3f"):format(first.start), ("%.3f"):format(ctx.L - lastOrig.start - lastOrig.len),
     "the retrograde starts where the original's last note ended, counted from the end")
end

-- The block is named for what it is.
do
  local ctx = C.context({ root = 4, scale = 5, prog = "i-VI-III-VII", inst = "vc" })
  local e = C.catalogue(ctx, "Arch").entries[1]
  local b = C.block(ctx, "Arch", e, { transform = "Retrograde", repeats = 2 })
  -- Dorian's sixth degree builds a diminished chord, and the name says so.
  ok(b.name:find("^D Dorian i%-vidim%-III%-VII Cello Arch"), "the name says key, chords, instrument and type: " .. b.name)
  ok(b.name:find("retrograde x2$"), "and the shaping")
end

------------------------------------------------------------------------------
-- Settings
------------------------------------------------------------------------------

do
  local st = C.clampState({ root = 99, scale = 0, chain = "nope", bars = 3, inst = "kazoo", section = "choir",
    register = "Up", cat = "Poems", type = "Haiku", transform = "Twist", repeats = 9, velocity = "Loud",
    density = "Thick" })
  eq(st.root, #T.ROOTS, "a root past the end comes back to the last")
  eq(st.scale, 1, "a scale before the start comes back to the first")
  eq(st.chain, "0:d:Triad,4:d:Triad,5:d:Triad,3:d:Triad", "a chain that means nothing starts again from I-V-vi-IV")
  eq(st.bars, 2, "three bars snaps to the nearest length on offer")
  eq(st.inst, "pno", "an unknown instrument is the piano")
  eq(st.section, "", "an unknown section is none")
  eq(st.cat, "Rhythm", "an unknown category is the first")
  eq(st.type, "Ostinato", "and its first type")
  eq(st.repeats, 1, "an unknown repeat count is one")
  local s2 = C.clampState({ root = 1, scale = 10, chain = "0:d:Triad,6:c:7,3:c:maj7", section = "strings",
                             cat = "Melody", type = "Arch" })
  eq(s2.chain, "0:d:Triad,3:c:maj7", "a chord on a degree the pentatonic scale lacks is dropped, the rest kept")
  local s3 = C.clampState({ root = 1, scale = 10, chain = "6:d:Triad" })
  eq(s3.chain, "0:d:Triad", "and if none is left, the first progression that fits: I")
  eq(s2.cat, "Harmony", "a section always means harmony")
end

Ck.done()
