--[[ Keys, chords and voice leading, by running them.

       lua5.4 tests/test_theory.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq, eqList = C.ok, C.eq, C.eqList
local T = dofile(C.SCRIPTS .. "mc_theory.lua")

------------------------------------------------------------------------------
-- The tables are ScaleView's, and have to stay that way
------------------------------------------------------------------------------

do
  local SCALEVIEW = {
    Major = {0,2,4,5,7,9,11}, Minor = {0,2,3,5,7,8,10},
    ["Harm Minor"] = {0,2,3,5,7,8,11}, Ionian = {0,2,4,5,7,9,11},
    Dorian = {0,2,3,5,7,9,10}, Phrygian = {0,1,3,5,7,8,10},
    Lydian = {0,2,4,6,7,9,11}, Mixolydian = {0,2,4,5,7,9,10},
    Aeolian = {0,2,3,5,7,8,10}, ["Maj Pent"] = {0,2,4,7,9},
    ["Min Pent"] = {0,3,5,7,10}, ["Maj Blues"] = {0,2,3,4,7,9},
    ["Min Blues"] = {0,3,5,6,7,10}, ["Whole Tone"] = {0,2,4,6,8,10},
    ["Dim W-H"] = {0,2,3,5,6,8,9,11}, ["Dim H-W"] = {0,1,3,4,6,7,9,10},
  }
  eq(#T.SCALES, 16, "sixteen scales")
  for _, sc in ipairs(T.SCALES) do
    eqList(sc.iv, SCALEVIEW[sc.name] or {}, "scale " .. sc.name .. " matches ScaleView")
    eq(#sc.letters, #sc.iv, "scale " .. sc.name .. " spells every degree")
  end
  local L, A = {"C","D","E","F","G","A","B"}, {[-1]="b", [0]="", [1]="#"}
  for _, r in ipairs(T.ROOTS) do
    eq(r.name, L[r.letter + 1] .. A[r.acc], "root " .. r.name .. " spells itself")
  end
end

------------------------------------------------------------------------------
-- Positions and pitches
------------------------------------------------------------------------------

local Cmaj = T.key(1, 1)
eq(T.pitch(Cmaj, 0), 0, "position 0 of C major is C-1")
eq(T.pitch(Cmaj, 7 * 5), 60, "five octaves of positions up is middle C")
eq(T.pitch(Cmaj, 7 * 5 + 4), 67, "and four steps above it G")
eq(T.pitch(Cmaj, -1), -1, "position -1 is the B below")

-- Every pitch in every key goes to a position and back, and every pitch
-- outside a key has none.
do
  local bad = 0
  for root = 1, #T.ROOTS do
    for scale = 1, #T.SCALES do
      local key = T.key(root, scale)
      for pos = 0, 80 do
        local p = T.pitch(key, pos)
        if T.posOf(key, p) ~= pos then bad = bad + 1 end
        if T.floorPos(key, p) ~= pos then bad = bad + 1 end
      end
      for p = 20, 100 do
        local s = T.posOf(key, p)
        if s and T.pitch(key, s) ~= p then bad = bad + 1 end
        local near = T.nearestPos(key, p)
        -- nothing in the scale is nearer than what nearestPos returns
        for d = -2, 2 do
          if math.abs(T.pitch(key, near + d) - p) < math.abs(T.pitch(key, near) - p) then bad = bad + 1 end
        end
      end
    end
  end
  eq(bad, 0, "positions and pitches agree in every key")
end

eq(T.nearestPos(Cmaj, 61, 1), T.posOf(Cmaj, 62), "C# leaning up is D")
eq(T.nearestPos(Cmaj, 61, -1), T.posOf(Cmaj, 60), "C# leaning down is C")

-- Spelling. The seven-note scales alone cannot tell the letters table from a
-- plain index, so the pentatonic and diminished scales are checked too.
do
  local Fs = T.key(9, 1)
  eq(T.noteName(Fs, 6), "E#", "F# major spells its seventh E#")
  local Cm = T.key(1, 2)
  eq(T.noteName(Cm, 2), "Eb", "C minor spells its third Eb")
  local Apent = T.key(14, 11)
  local names = {}
  for d = 0, 4 do names[#names + 1] = T.noteName(Apent, d) end
  eqList(names, { "A", "C", "D", "E", "G" }, "A minor pentatonic")
  local Cdim = T.key(1, 16)
  names = {}
  for d = 0, 7 do names[#names + 1] = T.noteName(Cdim, d) end
  eqList(names, { "C", "Db", "Eb", "E", "F#", "G", "A", "Bb" }, "C half-whole diminished")
  eq(T.pitchName(60), "C4", "middle C is C4")
  eq(T.pitchName(61, Cm), "C#4", "a note outside the key is named sharp")
end

-- Numerals are read off the scale.
eq(T.degreeNumeral(Cmaj, 6), "vii\u{00B0}", "vii of major is diminished")
eq(T.degreeNumeral(T.key(1, 2), 2), "III", "III of minor is major")
eq(T.degreeNumeral(T.key(1, 3), 2, true), "IIIaug", "III of harmonic minor is augmented")
eq(T.leadingTonePc(Cmaj), 11, "B leads to C")
eq(T.leadingTonePc(T.key(1, 2)), nil, "natural minor's seventh is a subtonic, not a leading tone")
eq(T.leadingTonePc(T.key(1, 10)), nil, "a pentatonic scale has no leading tone")

-- Progressions are named for the scale they are in, and offered only where
-- the scale has their degrees.
eq(T.progressionName(T.key(1, 2), T.progressionById("I-IV-V-I")), "i-iv-v-i", "I-IV-V-I in minor")
do
  local pent = T.progressionsFor(T.key(1, 10))
  for _, p in ipairs(pent) do
    for _, d in ipairs(p.degrees) do ok(d < 5, "a pentatonic progression stays inside five degrees: " .. p.id) end
  end
  local seen = {}
  for _, p in ipairs(T.progressionsFor(Cmaj)) do
    local sig = table.concat(p.degrees, ",")
    ok(not seen[sig], "no progression offered twice: " .. p.id)
    seen[sig] = true
  end
end

------------------------------------------------------------------------------
-- Chords
------------------------------------------------------------------------------

do
  local I = T.chord(Cmaj, 0, "triad")
  eqList(I.pcs, { 0, 4, 7 }, "I of C major is C E G")
  local V7 = T.chord(Cmaj, 4, "seventh")
  eqList(V7.pcs, { 7, 11, 2, 5 }, "V7 is G B D F")
  eqList(V7.essential, { 1, 2, 4 }, "a seventh chord may drop its fifth, nothing else")
  eqList(T.chord(Cmaj, 1, "quartal").pcs, { 2, 7, 0 }, "quartal on ii is D G C")
  eqList(T.chord(Cmaj, 2, "cluster").pcs, { 4, 5, 7 }, "a cluster on iii is E F G")
end

------------------------------------------------------------------------------
-- Every chord, and chains of them
------------------------------------------------------------------------------

eq(#T.CHORDS, 78, "Starting Blocks' 78 named chords")
eq(#T.DIATONIC, 9, "and its 9 diatonic ones")
do
  local seen = {}
  for _, c in ipairs(T.CHORDS) do
    ok(not seen[c.sym], "every chord symbol is its own: " .. c.sym)
    seen[c.sym] = true
    eq(c.iv[1], 0, c.sym .. " starts on its root")
    for i = 2, #c.iv do ok(c.iv[i] > c.iv[i - 1], c.sym .. " is written upwards") end
    ok(T.FAMILIES[c.fam] ~= nil and c.fam > 1, c.sym .. " is in a family other than Diatonic")
  end
end

-- A chord from the tables sits on the degree's root, whatever the scale says.
do
  local Cm = T.key(1, 2)
  eqList(T.chord(Cm, 0, { fam = "c", sym = "maj" }).pcs, { 0, 4, 7 }, "a C major chord in C minor has E natural")
  eqList(T.chord(Cmaj, 1, { fam = "c", sym = "7" }).pcs, { 2, 6, 9, 0 }, "D7 in C has F#")
  eqList(T.chord(Cmaj, 1, { fam = "d", name = "7th" }).pcs, { 2, 5, 9, 0 }, "the diatonic ii7 has F")
  eqList(T.chord(Cmaj, 4, { fam = "c", sym = "7#9" }).essential, { 1, 2, 4, 5 },
         "an altered chord keeps root, third, seventh and its colour")
  eqList(T.chord(Cmaj, 0, { fam = "c", sym = "maj" }).essential, { 1, 2 }, "a triad may lose its fifth")
  eqList(T.chord(Cmaj, 0, { fam = "c", sym = "sus4" }).essential, { 1, 2, 3 }, "a sus chord may not")
end

-- The scale under a chord bends to meet it: the scale note on the same
-- letter moves the semitone.
do
  local function under(key, degree, spec)
    local ch = T.chord(key, degree, spec)
    local k = T.chordKey(key, ch)
    local names = {}
    for d = 0, 6 do names[#names + 1] = T.noteName(k, d) end
    return table.concat(names, " ")
  end
  local Cm = T.key(1, 2)
  eq(under(Cm, 0, { fam = "c", sym = "maj" }), "C D E F G Ab Bb", "a borrowed C major turns C minor's Eb into E")
  eq(under(Cm, 4, { fam = "c", sym = "7" }), "C D Eb F G Ab B", "G7 in C minor brings its leading tone, B")
  eq(under(Cmaj, 1, { fam = "c", sym = "7" }), "C D E F# G A B", "D7 in C major brings F#")
  eq(under(Cmaj, 3, { fam = "c", sym = "m" }), "C D E F G Ab B", "a borrowed iv in C major brings Ab")
  eq(under(Cmaj, 4, { fam = "d", name = "7th" }), "C D E F G A B", "a diatonic chord leaves the scale alone")
  eq(under(T.key(1, 10), 0, { fam = "c", sym = "m" }), "C D E G A C D",
     "a pentatonic scale is not bent - it has no letter for every note")
  -- Positions still count the same, so a third above is still +2.
  local ch = T.chord(Cmaj, 1, { fam = "c", sym = "7" })
  local k = T.chordKey(Cmaj, ch)
  eq(T.pitch(k, 36 + 2) % 12, 6, "a third above D, under D7, is F#")
  eq(T.pitch(k, 36 + 1), T.pitch(Cmaj, 36 + 1), "and the notes it did not bend are where they were")
end

-- Chains: by name, read back, named.
do
  local chain = T.parseChain("0:d:Triad,4:c:7,9:d:Triad,5:c:nope,3:c:maj7,2:x:7", Cmaj)
  eq(T.chainString(chain), "0:d:Triad,4:c:7,3:c:maj7", "links that mean nothing here are dropped")
  eq(T.chainName(Cmaj, chain), "I-V7-IVmaj7", "named as they read")
  eq(#T.parseChain(("0:d:Triad,"):rep(12), Cmaj), T.MAX_CHAIN, "no more than eight chords")
  eq(#T.parseChain("6:d:Triad", T.key(1, 10)), 0, "a seventh degree in a pentatonic scale is dropped")
  eq(T.linkLabel(Cmaj, { degree = 6, fam = "d", name = "Triad" }), "vii\u{00B0}", "the diatonic vii is diminished")
  eq(T.linkLabel(Cmaj, { degree = 1, fam = "c", name = "m7" }), "IIm7", "a chosen chord: upper-case numeral and symbol")
  eq(T.linkLabel(Cmaj, { degree = 0, fam = "c", name = "Tristan" }), "I Tristan", "a named chord gets a space")
  local name, notes = T.linkSpelling(Cmaj, { degree = 1, fam = "d", name = "7th" })
  eq(name .. ": " .. notes, "Dm7: D F A C", "ii7 in C is spelled and named")
  name, notes = T.linkSpelling(T.key(1, 2), { degree = 4, fam = "c", name = "7" })
  eq(name .. ": " .. notes, "G7: G B D F", "G7 in C minor is spelled with B natural")
  eq(T.symbolOf({ 7, 11, 2, 5 }, 7), "7", "G B D F is a 7")
  eq(T.symbolOf({ 0, 4, 7 }, 0), "", "a major triad needs no symbol")
end

------------------------------------------------------------------------------
-- Voice leading
------------------------------------------------------------------------------

local SATB = { { 40, 60 }, { 48, 67 }, { 55, 74 }, { 60, 79 } }

local function chords(key, degrees, kind)
  local out = {}
  for i, d in ipairs(degrees) do out[i] = T.chord(key, d, kind or "triad") end
  return out
end

-- Everything a harmony teacher marks, checked on every progression in every
-- seven-note scale.
local function audit(key, degrees, kind, ranges, opts, label)
  local chs = chords(key, degrees, kind)
  local v = T.voiceLead(key, chs, ranges, opts)
  if not ok(v, label .. ": voiced") then return end
  for i, V in ipairs(v) do
    for k = 2, #V do ok(V[k] > V[k - 1], label .. ": voices never cross or meet") end
    for k = 3, #V do ok(V[k] - V[k - 1] <= 12, label .. ": upper voices within an octave") end
    for k, p in ipairs(V) do
      ok(p >= ranges[k][1] and p <= ranges[k][2], label .. ": every voice in its range")
      ok(T.hasPc(chs[i], p), label .. ": every note a chord tone")
    end
    for _, m in ipairs(chs[i].essential) do
      local found = false
      for _, p in ipairs(V) do if p % 12 == chs[i].pcs[m] then found = true end end
      ok(found, label .. ": no essential note left out")
    end
    local lt, count = T.leadingTonePc(key), 0
    for _, p in ipairs(V) do if lt and p % 12 == lt then count = count + 1 end end
    ok(count <= 1, label .. ": the leading tone is never doubled")
    if not opts or opts.bassRoot ~= false then eq(V[1] % 12, chs[i].root, label .. ": the bass is the root") end
    if i > 1 then eq(T.parallels(v[i - 1], V), 0, label .. ": no parallel fifths or octaves") end
  end
  return v
end

for scale = 1, 9 do
  local key = T.key(1, scale)
  for _, p in ipairs(T.progressionsFor(key)) do
    audit(key, p.degrees, "triad", SATB, {}, T.SCALES[scale].name .. " " .. p.id)
    audit(key, p.degrees, "seventh", SATB, {}, T.SCALES[scale].name .. " " .. p.id .. " 7ths")
  end
end

-- Parallels are what the checker says they are.
eq(T.parallels({ 48, 55, 64, 72 }, { 50, 57, 65, 74 }), 2, "C-G-E-C to D-A-F-D: parallel fifths and parallel octaves")
eq(T.parallels({ 48, 55, 64, 72 }, { 43, 55, 62, 71 }), 0, "a held common tone is not a parallel")

-- Common tones are held: I to vi in C shares C and E.
do
  local v = T.voiceLead(Cmaj, chords(Cmaj, { 0, 5 }), SATB, {})
  local held = 0
  for k = 1, 4 do if v[1][k] == v[2][k] then held = held + 1 end end
  ok(held >= 2, "I to vi holds its two common tones (" .. held .. ")")
end

-- The leading tone rises to the tonic in the top voice.
do
  local v = T.voiceLead(Cmaj, chords(Cmaj, { 4, 0 }), SATB, {})
  if v[1][4] % 12 == 11 then eq(v[2][4] - v[1][4], 1, "B in the top voice goes up to C") end
  local lt = 0
  for _, p in ipairs(v[1]) do if p % 12 == 11 then lt = lt + 1 end end
  ok(lt <= 1, "the leading tone is never doubled")
end

-- Contrary motion: the outer voices mostly go opposite ways.
do
  local chs = chords(Cmaj, { 0, 0, 3, 3, 4, 4, 0, 0 })
  local v = T.voiceLead(Cmaj, chs, SATB, { bassRoot = false, contrary = 1 })
  local contrary, similar = 0, 0
  for i = 2, #v do
    local s, b = v[i][4] - v[i - 1][4], v[i][1] - v[i - 1][1]
    if s * b < 0 then contrary = contrary + 1 elseif s * b > 0 then similar = similar + 1 end
  end
  ok(contrary > similar, ("the outer voices move in contrary motion (%d against %d)"):format(contrary, similar))
end

-- A pedal holds its exact pitch whatever the chords do.
do
  local chs = chords(Cmaj, { 0, 3, 4, 0 })
  local v = T.voiceLead(Cmaj, chs, SATB, { fixedBass = 48 })
  for i = 1, #v do eq(v[i][1], 48, "the bass pedal holds C3 under chord " .. i) end
end

-- Quartal and cluster shapes keep their intervals.
do
  local adj = { [5] = true, [6] = true, [7] = true }
  local v = T.voiceLead(Cmaj, chords(Cmaj, { 0, 4, 5, 3 }, "quartal4"), { { 45, 70 }, { 45, 70 }, { 45, 75 }, { 45, 80 } },
                        { adjacent = adj })
  for _, V in ipairs(v) do
    for k = 2, #V do ok(adj[V[k] - V[k - 1]], "quartal voices sit a fourth or fifth apart") end
  end
  local planed = T.plane(Cmaj, v[1], chords(Cmaj, { 0, 4, 5, 3 }, "quartal4"))
  for i = 2, #planed do
    for k = 1, 4 do
      local steps = T.nearestPos(Cmaj, planed[i][k]) - T.nearestPos(Cmaj, planed[1][k])
      local rootSteps = ({ 0, 4, 5, 3 })[i]
      eq((steps - rootSteps) % 7, 0, "planing moves every voice by the root's step")
    end
  end
end

-- Voicing is deterministic: the same question gets the same answer.
do
  local a = T.voiceLead(Cmaj, chords(Cmaj, { 0, 5, 3, 4 }), SATB, {})
  local b = T.voiceLead(Cmaj, chords(Cmaj, { 0, 5, 3, 4 }), SATB, {})
  for i = 1, 4 do eqList(a[i], b[i], "the same voicing twice, chord " .. i) end
end

C.done()
