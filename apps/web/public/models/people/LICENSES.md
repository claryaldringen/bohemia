# Licence modelů lidí

Postavy pocházejí ze hry **0 A.D.** – autor **Wildfire Games** (https://www.wildfiregames.com/),
licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).

Úpravy: převedeno ze skinovaného COLLADA do GLB skriptem `tools/blender/people_from_0ad.py`
(nastavení v `tools/blender/people.json`) – kostra bipeda 0 A.D. a animace jako animace glTF,
hlava a nástroje (motyka, sekera, palička, nůše, otep dřeva) pevně přivázané ke kostem, měřítko
na výšku postavy. Textury jsou složené do jednoho atlasu (JPEG, zmenšené), kostkovaný vzor
keltských šatů a tuniky je nahrazený jednolitou nebarvenou látkou, barva vlasů je pevná; vedle
atlasu je maska látky a vlasů (PNG, odvozená z ploch barvy hráče). Srp v ruce je nový jednoduchý
model (skript) s texturou z `prop_weap.dds`. Upravené soubory jsou šířeny pod stejnou licencí
CC BY-SA 3.0. Licence se týká jen těchto souborů, ne zbytku hry Bohemia.

Původní soubory jsou z `art/meshes/`, `art/animation/biped/` a `art/textures/skins/`:

| Soubor      | Tělo a hlava                                                    | Animace                                                                                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `woman.glb` | `skeletal/new/f_dress.dae`, `props/new/dudette_head_a.dae`      | `citizen/walk_relax_f.dae`, `citizen/idle_relax_f.dae`, `citizen/build.dae`, `gatherer/gather_meat.dae`, `gatherer/farming.dae`, `gatherer/seeding.dae`, `gatherer/gather_berries.dae`, `gatherer/carry_grain_f.dae`, `gatherer/carry_wood_f.dae`, `gatherer/gather_wood.dae`, `gatherer/gather_fruit_f.dae`   |
| `man.glb`   | `skeletal/new/m_tunic_short.dae`, `props/new/head_longhair.dae` | `citizen/walk_relax_m.dae`, `citizen/idle_relax_m_a.dae`, `citizen/build.dae`, `gatherer/gather_meat.dae`, `gatherer/farming.dae`, `gatherer/seeding.dae`, `gatherer/gather_berries.dae`, `gatherer/carry_grain_m.dae`, `gatherer/carry_wood_m.dae`, `gatherer/gather_wood.dae`, `gatherer/gather_fruit_m.dae` |

Nástroje a náklad (oba soubory): `props/tool_hoe.dae`, `props/tool_axe.dae`,
`props/prop_mallet.dae`, `props/shuttle_wood.dae`, `props/special/luggage_female_back.dae`.

Textury: `skeletal/celt/dress_female_01_01.png` (žena), `skeletal/celt/tunic_01_01.png` (muž),
`props/head/celt_fem_b.dds` (žena), `props/head/celt_a.dds` (muž), `props/prop_weap.dds`,
`props/basket_iber_1.dds`, `props/wood_e.png`.
