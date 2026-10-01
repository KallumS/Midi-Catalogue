--[[ What the catalogue makes, printed as note names, so it can be read and
     judged without REAPER.

       lua5.4 tools/demo.lua                        every type, piano, C major, I-V-vi-IV
       lua5.4 tools/demo.lua Ostinato vc 1 2 i-VI-III-VII
                                                    one type, an instrument, root and
                                                    scale indices, a progression id
       lua5.4 tools/demo.lua Arch vln1 1 2 0:c:maj,3:d:Triad,4:c:7,0:d:Triad
                                                    or a chain of chords
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local R = HERE .. "/../reascripts/"
local T = dofile(R .. "mc_theory.lua")
local O = dofile(R .. "mc_orchestra.lua")
local C = dofile(R .. "mc_catalogue.lua").init(T, O)

local only, inst = arg[1], arg[2] or "pno"
local ens = O.ensembleById(inst)
-- arg[5] is a progression id ("ii-V-I") or a chain ("0:c:maj,4:c:7").
local chain = arg[5] and arg[5]:find(":") and arg[5] or nil
local ctx = C.context({ root = tonumber(arg[3]) or 1, scale = tonumber(arg[4]) or 1,
                        prog = (not chain) and arg[5] or "I-V-vi-IV", chain = chain,
                        inst = ens and "pno" or inst,
                        ensemble = ens and inst or nil, bars = tonumber(arg[6]) or 4 })

local function show(entry)
  print(("  %s   [%s, %.2f a beat]"):format(entry.label, entry.band, entry.density))
  for _, part in ipairs(entry.parts) do
    local out, lastT = {}, nil
    for _, n in ipairs(part.notes) do
      local t = ("%.2f"):format(n.start)
      if t ~= lastT then out[#out + 1] = "|" .. t .. " "; lastT = t end
      out[#out + 1] = T.pitchName(n.pitch, ctx.key) .. (n.accent and ">" or "") .. " "
    end
    print(("    %-12s %s"):format(part.name, table.concat(out)))
  end
end

print(("%s %s   %s   %s"):format(T.ROOTS[ctx.key.root].name, T.SCALES[ctx.key.scale].name,
  T.chainName(ctx.key, ctx.chain), ens and ens.name or ctx.inst.name))
for _, cat in ipairs(C.CATEGORIES) do
  for _, ty in ipairs(cat.types) do
    if not only or only == ty then
      local res = C.catalogue(ctx, ty)
      print(("== %s (%d)"):format(ty, #res.entries))
      if res.avoided then print("  not for this instrument: " .. res.avoided) end
      for _, h in ipairs(res.hidden) do print(("  hidden: %d %s"):format(h.count, h.reason)) end
      for _, e in ipairs(res.entries) do show(e) end
    end
  end
end
