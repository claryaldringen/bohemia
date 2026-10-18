# Licence modelů ohrady (přístřešek, jesle, žlab, branka)

Přístřešek s doškovou střechou, jesle se senem, žlab z vydlabaného kmene a branka ze žerdí jsou
vymodelované procedurálně skriptem Blenderu `tools/blender/pen.py` (postup v jeho hlavičce) –
došky jsou tytéž řady jako na obydlí z `tools/blender/dwellings.py`. Atlas textur je atlas
obydlí a řemesel (`tools/blender/atlas.py`, `craft_atlas.py`; licence a výřezy v
`../dwellings/LICENSES.md` a `../crafts/LICENSES.md`) zmenšený na polovinu a doplněný o oblast
sena. Textury, ze kterých vychází, pocházejí ze hry **0 A.D.** – autor **Wildfire Games**
(https://www.wildfiregames.com/), licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).
**Žádný výřez nezasahuje do loga Wildfire Games** (`celt_struct.dds` 345–512 × 130–210 px) –
používají se jen výřezy atlasu obydlí a textura sena, která logo nemá. Upravené soubory jsou
šířeny pod stejnou licencí CC BY-SA 3.0. Licence se týká jen těchto souborů, ne zbytku hry
Bohemia.

| Soubor                 | Původní soubory (art/…)                                                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pen.glb`              | atlas obydlí a řemesel: došky, proutí výpletu a čela trámů z `textures/skins/structural/celt_struct_1.dds`, kůra trámů z `textures/skins/structural/celt_struct.dds` (výřezy viz `../dwellings/LICENSES.md`), voda procedurální (`craft_atlas.py`); seno `textures/skins/props/wrld_hay_a.dds` (sušší a tmavší) |
| `pen-construction.glb` | díly staveniště (sloupy, vaznice, krokve, latě, výplet, řady došků, jesle, kmen, žlab, branka) a rekvizity (hráň žerdí, svazky prutů, snopy slámy) – stejné zdroje jako `pen.glb`                                                                                                                               |
| `pen-decay.glb`        | díly rozpadu opuštěné ohrady (vybledlé a děravé došky s mechem, prověšená a zřícená konstrukce, jesle bez sena, žlab bez vody, spadlá branka) – stejné zdroje jako `pen.glb`, barvy jen přenásobené (glTF baseColorFactor)                                                                                      |

Pletený plot ohrady je sdílený `../dwellings/woven-fence.glb`, stoh sena `../fields/haystack.glb`,
voli `../plough/ox.glb` a kráva `../fauna/cow.glb` – licence u nich.
