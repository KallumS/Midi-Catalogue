--[[ Midi Catalogue - keys, chords and voice leading.

     Pure Lua. Nothing in this file touches REAPER or ImGui: the harmony is the
     part that has to be right, and here it can be run and checked by
     tests/test_theory.lua rather than only by reading.

     Two ways of naming a note run through the whole engine:

       - a MIDI pitch, 0..127;
       - a scale position, an integer counting scale notes from the key's root
         in MIDI octave -1. Position 0 is the root at pitch 0..11, position n
         (the scale's length) is the root an octave up, and so on.

     Every diatonic move is integer arithmetic on positions - a third above is
     +2, whatever the scale - and pitches only appear at the edges. Scale
     degrees are 0-based: degree 0 is the tonic.
]]

local M = {}

------------------------------------------------------------------------------
-- Keys
--
-- ScaleView for REAPER's roots and scales, unchanged, the same tables Starting
-- Blocks copies, so all three apps agree on what a scale is and what to call
-- its notes. test_theory.lua asserts they still match. Do not tidy them
-- independently.
------------------------------------------------------------------------------

local LETTER_PC  = { 0, 2, 4, 5, 7, 9, 11 }        -- C D E F G A B
local LETTERS    = { "C", "D", "E", "F", "G", "A", "B" }
local ACCIDENTAL = { [-2] = "bb", [-1] = "b", [0] = "", [1] = "#", [2] = "x" }

M.ROOTS = {
  { name = "C",  letter = 0, acc =  0 }, { name = "C#", letter = 0, acc =  1 },
  { name = "Db", letter = 1, acc = -1 }, { name = "D",  letter = 1, acc =  0 },
  { name = "D#", letter = 1, acc =  1 }, { name = "Eb", letter = 2, acc = -1 },
  { name = "E",  letter = 2, acc =  0 }, { name = "F",  letter = 3, acc =  0 },
  { name = "F#", letter = 3, acc =  1 }, { name = "Gb", letter = 4, acc = -1 },
  { name = "G",  letter = 4, acc =  0 }, { name = "G#", letter = 4, acc =  1 },
  { name = "Ab", letter = 5, acc = -1 }, { name = "A",  letter = 5, acc =  0 },
  { name = "A#", letter = 5, acc =  1 }, { name = "Bb", letter = 6, acc = -1 },
  { name = "B",  letter = 6, acc =  0 }, { name = "Cb", letter = 0, acc = -1 },
}

M.SCALES = {
  { name = "Major",      iv = {0,2,4,5,7,9,11},   letters = {0,1,2,3,4,5,6} },
  { name = "Minor",      iv = {0,2,3,5,7,8,10},   letters = {0,1,2,3,4,5,6} },
  { name = "Harm Minor", iv = {0,2,3,5,7,8,11},   letters = {0,1,2,3,4,5,6} },
  { name = "Ionian",     iv = {0,2,4,5,7,9,11},   letters = {0,1,2,3,4,5,6} },
  { name = "Dorian",     iv = {0,2,3,5,7,9,10},   letters = {0,1,2,3,4,5,6} },
  { name = "Phrygian",   iv = {0,1,3,5,7,8,10},   letters = {0,1,2,3,4,5,6} },
  { name = "Lydian",     iv = {0,2,4,6,7,9,11},   letters = {0,1,2,3,4,5,6} },
  { name = "Mixolydian", iv = {0,2,4,5,7,9,10},   letters = {0,1,2,3,4,5,6} },
  { name = "Aeolian",    iv = {0,2,3,5,7,8,10},   letters = {0,1,2,3,4,5,6} },
  { name = "Maj Pent",   iv = {0,2,4,7,9},        letters = {0,1,2,4,5} },
  { name = "Min Pent",   iv = {0,3,5,7,10},       letters = {0,2,3,4,6} },
  { name = "Maj Blues",  iv = {0,2,3,4,7,9},      letters = {0,1,2,2,4,5} },
  { name = "Min Blues",  iv = {0,3,5,6,7,10},     letters = {0,2,3,4,4,6} },
  { name = "Whole Tone", iv = {0,2,4,6,8,10},     letters = {0,1,2,3,4,5} },
  { name = "Dim W-H",    iv = {0,2,3,5,6,8,9,11}, letters = {0,1,2,3,4,5,5,6} },
  { name = "Dim H-W",    iv = {0,1,3,4,6,7,9,10}, letters = {0,1,2,2,3,4,5,6} },
}

local NUMERALS = { "I", "II", "III", "IV", "V", "VI", "VII", "VIII" }

-- A key is the pair of indices the window picks, and nothing else.
function M.key(root, scale) return { root = root or 1, scale = scale or 1 } end

function M.scaleLen(key) return #M.SCALES[key.scale].iv end

function M.rootPc(key)
  local rt = M.ROOTS[key.root]
  return (LETTER_PC[rt.letter + 1] + rt.acc + 12) % 12
end

------------------------------------------------------------------------------
-- Positions and pitches
------------------------------------------------------------------------------

-- The MIDI pitch of a scale position.
function M.pitch(key, pos)
  local iv  = M.SCALES[key.scale].iv
  local n   = #iv
  local oct = math.floor(pos / n)
  local k   = pos - oct * n
  return M.rootPc(key) + iv[k + 1] + 12 * oct
end

-- The highest position at or below a pitch. Every pitch has one, because the
-- root is in every octave.
function M.floorPos(key, midi)
  local iv   = M.SCALES[key.scale].iv
  local n    = #iv
  local root = M.rootPc(key)
  local oct  = math.floor((midi - root) / 12)
  local kmax = 0
  for k = 1, n do
    if root + iv[k] + 12 * oct <= midi then kmax = k - 1 end
  end
  return oct * n + kmax
end

-- The position of a pitch that is in the scale, or nil for one that is not.
function M.posOf(key, midi)
  local s = M.floorPos(key, midi)
  if M.pitch(key, s) == midi then return s end
  return nil
end

-- The nearest position to any pitch. A pitch exactly between two scale notes
-- goes the way `lean` says (+1 up, -1 down), and down when it says nothing.
function M.nearestPos(key, midi, lean)
  local lo = M.floorPos(key, midi)
  if M.pitch(key, lo) == midi then return lo end
  local dLo = midi - M.pitch(key, lo)
  local dHi = M.pitch(key, lo + 1) - midi
  if dLo < dHi then return lo end
  if dHi < dLo then return lo + 1 end
  return (lean or -1) > 0 and lo + 1 or lo
end

function M.pc(key, pos) return M.pitch(key, pos) % 12 end

-- Spelled for the key: the seventh of F# major comes out E#, not F.
function M.noteName(key, pos)
  local sc  = M.SCALES[key.scale]
  local n   = #sc.iv
  local oct = math.floor(pos / n)
  local k   = pos - oct * n
  local letter = (M.ROOTS[key.root].letter + sc.letters[k + 1]) % 7
  local acc = M.pitch(key, pos) % 12 - LETTER_PC[letter + 1]
  if acc >  6 then acc = acc - 12 end
  if acc < -6 then acc = acc + 12 end
  return LETTERS[letter + 1] .. (ACCIDENTAL[acc] or "?")
end

-- A pitch named with its octave, C4 being middle C (60). Out of the key, the
-- sharp spelling.
local SHARP_NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
function M.pitchName(midi, key)
  local oct = math.floor(midi / 12) - 1
  if key then
    local s = M.posOf(key, midi)
    if s then return M.noteName(key, s) .. oct end
  end
  return SHARP_NAMES[midi % 12 + 1] .. oct
end

------------------------------------------------------------------------------
-- Degrees
------------------------------------------------------------------------------

-- Read off the scale rather than assumed, so the modes and the blues scales
-- come out right: the vii of major is diminished, the III of minor is major.
function M.degreeQuality(key, degree)
  local p  = M.pitch(key, degree)
  local r3 = M.pitch(key, degree + 2) - p
  local r5 = M.pitch(key, degree + 4) - p
  if r3 == 4 and r5 == 7 then return "major"      end
  if r3 == 3 and r5 == 7 then return "minor"      end
  if r3 == 3 and r5 == 6 then return "diminished" end
  if r3 == 4 and r5 == 8 then return "augmented"  end
  return "other"
end

function M.degreeNumeral(key, degree, ascii)
  local q = M.degreeQuality(key, degree)
  local n = NUMERALS[(degree % 8) + 1]
  if q == "minor" or q == "diminished" then n = n:lower() end
  if q == "diminished" then n = n .. (ascii and "dim" or "\u{00B0}") end
  if q == "augmented"  then n = n .. (ascii and "aug" or "+") end
  return n
end

-- The seventh degree leans on the tonic only when it sits a semitone under
-- it. Only then is it a leading tone, and only then does it want resolving
-- and not doubling.
function M.leadingTonePc(key)
  local n = M.scaleLen(key)
  if n ~= 7 then return nil end
  if M.pitch(key, 7) - M.pitch(key, 6) == 1 then return M.pc(key, 6) end
  return nil
end

------------------------------------------------------------------------------
-- Progressions
--
-- The chords under everything, as scale degrees. One chord to a slot; the
-- slots share the block's length evenly. A progression whose degrees the
-- scale does not have (a sixth degree in a pentatonic) is simply not offered.
------------------------------------------------------------------------------

M.PROGRESSIONS = {
  { id = "I",        degrees = { 0 } },
  { id = "I-V",      degrees = { 0, 4 } },
  { id = "I-IV",     degrees = { 0, 3 } },
  { id = "I-IV-V-I", degrees = { 0, 3, 4, 0 } },
  { id = "I-V-vi-IV", degrees = { 0, 4, 5, 3 } },
  { id = "I-vi-IV-V", degrees = { 0, 5, 3, 4 } },
  { id = "vi-IV-I-V", degrees = { 5, 3, 0, 4 } },
  { id = "ii-V-I",   degrees = { 1, 4, 0, 0 } },
  { id = "i-VI-III-VII", degrees = { 0, 5, 2, 6 } },
  { id = "i-VII-VI-V", degrees = { 0, 6, 5, 4 } },   -- the Andalusian cadence
  { id = "i-iv-v-i", degrees = { 0, 3, 4, 0 } },
}

-- The ids above are fixed names for saving; what the window shows is the
-- numerals this scale actually builds, so I-IV-V-I in minor reads i-iv-v-i.
function M.progressionName(key, prog)
  local out = {}
  for i, d in ipairs(prog.degrees) do out[i] = M.degreeNumeral(key, d, true) end
  return table.concat(out, "-")
end

function M.progressionFits(key, prog)
  for _, d in ipairs(prog.degrees) do
    if d >= M.scaleLen(key) then return false end
  end
  return true
end

-- The progressions this scale can play, keeping only the first of any two
-- that come out the same here (I-IV-V-I and i-iv-v-i are one thing in any
-- given scale).
function M.progressionsFor(key)
  local out, seen = {}, {}
  for _, p in ipairs(M.PROGRESSIONS) do
    if M.progressionFits(key, p) then
      local sig = table.concat(p.degrees, ",")
      if not seen[sig] then seen[sig] = true; out[#out + 1] = p end
    end
  end
  return out
end

function M.progressionById(id)
  for _, p in ipairs(M.PROGRESSIONS) do if p.id == id then return p end end
  return M.PROGRESSIONS[1]
end

------------------------------------------------------------------------------
-- Chords
--
-- Every chord is built from the scale, by stacking scale steps on a degree,
-- so it is always in key. What differs is the size of the step.
------------------------------------------------------------------------------

M.CHORD_KINDS = {
  triad   = { 0, 2, 4 },
  seventh = { 0, 2, 4, 6 },
  quartal = { 0, 3, 6 },
  quartal4 = { 0, 3, 6, 9 },
  cluster = { 0, 1, 2 },
  cluster4 = { 0, 1, 2, 3 },
}

-- The chord as positions from its root in the lowest octave, and as pitch
-- classes in member order (root first). `essential` is which members a
-- voicing may not leave out.
function M.chord(key, degree, kind)
  local offs = M.CHORD_KINDS[kind] or M.CHORD_KINDS.triad
  local pcs, positions = {}, {}
  for i, o in ipairs(offs) do
    positions[i] = degree + o
    pcs[i] = M.pc(key, degree + o)
  end
  local essential
  if kind == "triad" then essential = { 1, 2 }
  elseif kind == "seventh" then essential = { 1, 2, 4 }
  else essential = {}; for i = 1, #offs do essential[i] = i end end
  return { degree = degree, kind = kind, pcs = pcs, positions = positions,
           root = pcs[1], essential = essential }
end

function M.hasPc(ch, pc)
  for _, p in ipairs(ch.pcs) do if p == pc % 12 then return true end end
  return false
end

------------------------------------------------------------------------------
-- Voice leading
--
-- A voicing is a list of MIDI pitches, bass first, strictly rising. Each voice
-- has its own range, which is how an ensemble keeps every part inside its
-- instrument: the violins' voice is looked for in the violins' range.
--
-- The rules are the ones a harmony teacher marks, as costs:
--
--   - move as little as possible, and keep common tones where they are;
--   - no parallel fifths or octaves between any two voices;
--   - no doubled leading tone, and the leading tone rises to the tonic;
--   - upper voices within an octave of each other, the bass wider;
--   - no voice crossing (the voicing is strictly rising, so it cannot).
--
-- The search keeps the best few paths through the progression rather than
-- only the best single step, so an early cheap move cannot corner a later
-- chord.
------------------------------------------------------------------------------

M.BEAM = 6

local function interval(a, b) return (b - a) % 12 end

-- Every voicing of one chord that the ranges and the spacing rules allow.
--
-- opts:
--   bassRoot    false lets the bass take any chord tone (an inversion)
--   fixedBass   an exact pitch the bass holds whatever the chord: a pedal
--   fixedTop    the same, for the top voice: an inverted pedal
--   adjacent    a set of the only intervals allowed between neighbouring
--               voices - fourths and fifths for quartal harmony, seconds
--               for clusters
--   close       the whole voicing inside an octave: close position
function M.candidates(ch, ranges, opts)
  opts = opts or {}
  local nv = #ranges
  local out = {}
  local options = {}
  for v = 1, nv do
    local list = {}
    if v == 1 and opts.fixedBass then list = { opts.fixedBass }
    elseif v == nv and opts.fixedTop then list = { opts.fixedTop }
    else
      for p = ranges[v][1], ranges[v][2] do
        local okPc
        if v == 1 and opts.bassRoot ~= false then okPc = (p % 12 == ch.root)
        else okPc = M.hasPc(ch, p) end
        if okPc then list[#list + 1] = p end
      end
    end
    options[v] = list
  end

  -- The members a voice must supply. A fixed bass or top is a pedal, not a
  -- chord tone, so the others have to cover the chord between them.
  local need = {}
  for _, m in ipairs(ch.essential) do need[#need + 1] = ch.pcs[m] end

  local cur = {}
  local function covered()
    for _, pc in ipairs(need) do
      local found = false
      for v = 1, nv do
        local pedal = (v == 1 and opts.fixedBass) or (v == nv and opts.fixedTop)
        if not pedal and cur[v] % 12 == pc then found = true; break end
      end
      if not found then return false end
    end
    return true
  end

  local function walk(v)
    if #out >= 20000 then return end
    if v > nv then
      if covered() then
        local c = {}
        for i = 1, nv do c[i] = cur[i] end
        out[#out + 1] = c
      end
      return
    end
    for _, p in ipairs(options[v]) do
      local fine = true
      if v > 1 then
        local below = cur[v - 1]
        local gap = p - below
        if gap <= 0 then fine = false
        elseif v == 2 then
          -- The bass may sit wider than the upper voices, but not past a
          -- twelfth, where it stops sounding like the bottom of this chord.
          -- A pedal is allowed two octaves: it is under the chords, not in them.
          if gap > (opts.fixedBass and 24 or 19) then fine = false end
        elseif gap > ((v == nv and opts.fixedTop) and 16 or 12) then fine = false end
        if fine and opts.adjacent and not opts.adjacent[gap] then fine = false end
        if fine and opts.close and v == nv and p - cur[1] > 12 then fine = false end
      end
      if fine then
        cur[v] = p
        walk(v + 1)
      end
    end
    cur[v] = nil
  end
  walk(1)
  return out
end

-- Parallel fifths and octaves: two voices a perfect fifth or octave apart
-- that both move, the same way, to the same interval again.
function M.parallels(a, b)
  local n = 0
  for i = 1, #a - 1 do
    for j = i + 1, #a do
      local was, now = interval(a[i], a[j]), interval(b[i], b[j])
      if (was == 0 or was == 7) and was == now then
        local mi, mj = b[i] - a[i], b[j] - a[j]
        if mi ~= 0 and mj ~= 0 and (mi > 0) == (mj > 0) then n = n + 1 end
      end
    end
  end
  return n
end

local function sign(x) if x > 0 then return 1 elseif x < 0 then return -1 end return 0 end

-- What one voicing costs, after `prev` (nil for the first chord).
function M.cost(ch, v, prev, opts, ctx)
  opts = opts or {}
  local nv, c = #v, 0

  -- Doubling. The leading tone is never doubled; in a triad in four or more
  -- voices, doubling the root is the textbook choice.
  local counts = {}
  for _, p in ipairs(v) do counts[p % 12] = (counts[p % 12] or 0) + 1 end
  if ctx.lt and (counts[ctx.lt] or 0) > 1 then c = c + 20 end
  if ch.kind == "triad" and nv >= 4 and (counts[ch.root] or 0) < 2 then c = c + 2 end
  -- A fifth is the member a full chord can most afford to lose, but a chord
  -- that could have had it and did not is thinner than it needed to be.
  for _, pc in ipairs(ch.pcs) do
    if not counts[pc] then c = c + 3 end
  end

  -- An inversion, where one is allowed at all.
  if opts.bassRoot == false and not opts.fixedBass then
    if v[1] % 12 ~= ch.root then
      c = c + ((ch.pcs[3] and v[1] % 12 == ch.pcs[3]) and 6 or 3)
    end
  end

  if not prev then
    -- The first chord is judged on where it sits and how it is spaced:
    -- wider at the bottom than the top, like the harmonic series.
    local sum = 0
    for _, p in ipairs(v) do sum = sum + p end
    c = c + math.abs(sum / nv - ctx.centre) * 0.6
    if nv >= 3 then
      local lowGap, topGap = v[2] - v[1], v[nv] - v[nv - 1]
      if lowGap < topGap then c = c + 2 end
    end
    return c
  end

  -- Movement, and common tones held.
  for i = 1, nv do
    local d = math.abs(v[i] - prev[i])
    c = c + d
    if d > 7 then c = c + (d - 7) * 2 end
  end

  if opts.noParallels ~= false then c = c + 50 * M.parallels(prev, v) end

  -- The leading tone in the top voice rises to the tonic when the tonic chord
  -- follows. Inner voices are allowed to let it fall, as they are in chorales.
  if ctx.lt and ctx.tonicPc and ch.root == ctx.tonicPc and prev[nv] % 12 == ctx.lt then
    if v[nv] - prev[nv] ~= 1 then c = c + 10 end
  end

  -- Outer voices in contrary motion, when that is the point of the block.
  if opts.contrary then
    local s, b = sign(v[nv] - prev[nv]), sign(v[1] - prev[1])
    if s ~= 0 and s == b then c = c + 12
    elseif s == 0 or b == 0 then c = c + 5 end
    if s ~= opts.contrary then c = c + 6 end
  end
  return c
end

-- The whole progression voiced. `chords` is a list from M.chord; `ranges` is
-- one {lo, hi} per voice, bass first. Returns one voicing per chord, or nil
-- when some chord has no voicing inside those ranges.
function M.voiceLead(key, chords, ranges, opts)
  opts = opts or {}
  local ctx = {
    lt = M.leadingTonePc(key), tonicPc = M.rootPc(key),
    centre = 0,
  }
  for _, r in ipairs(ranges) do ctx.centre = ctx.centre + (r[1] + r[2]) / 2 end
  ctx.centre = ctx.centre / #ranges

  local beam = { { cost = 0, path = {} } }
  for i, ch in ipairs(chords) do
    local cands = M.candidates(ch, ranges, opts)
    if #cands == 0 then return nil end
    local next_ = {}
    for _, state in ipairs(beam) do
      local prev = state.path[#state.path]
      for _, v in ipairs(cands) do
        local cc = state.cost + M.cost(ch, v, prev, opts, ctx)
        next_[#next_ + 1] = { cost = cc, path = state.path, v = v }
      end
    end
    table.sort(next_, function(a, b)
      if a.cost ~= b.cost then return a.cost < b.cost end
      -- Equal costs are settled by the voicing itself, so the answer never
      -- depends on the order the sort happened to see them in.
      for k = 1, #a.v do
        if a.v[k] ~= b.v[k] then return a.v[k] < b.v[k] end
      end
      return false
    end)
    beam = {}
    local seen = {}
    for _, s in ipairs(next_) do
      local sig = table.concat(s.v, ",")
      if not seen[sig] then
        seen[sig] = true
        local path = {}
        for k, p in ipairs(s.path) do path[k] = p end
        path[#path + 1] = s.v
        beam[#beam + 1] = { cost = s.cost, path = path }
        if #beam >= M.BEAM then break end
      end
    end
    if i == 1 and opts.firstOnly then break end
  end
  return beam[1].path
end

-- Diatonic planing: every voice moves by the same number of scale steps as
-- the root does. Parallel fourths are the sound of quartal harmony rather
-- than a fault in it, so this is not voice leading and does not pretend to be.
function M.plane(key, first, chords)
  local out = { first }
  local firstPos = {}
  for i, p in ipairs(first) do firstPos[i] = M.nearestPos(key, p) end
  for c = 2, #chords do
    local shift = chords[c].degree - chords[1].degree
    local prev = out[c - 1]
    -- The same shape, moved by the root's step, in whichever octave is
    -- nearest to where the last chord was.
    local best, bestD
    for o = -1, 1 do
      local v = {}
      for i, s in ipairs(firstPos) do v[i] = M.pitch(key, s + shift + o * M.scaleLen(key)) end
      local d = 0
      for i = 1, #v do d = d + math.abs(v[i] - prev[i]) end
      if not bestD or d < bestD then best, bestD = v, d end
    end
    out[c] = best
  end
  return out
end

return M
