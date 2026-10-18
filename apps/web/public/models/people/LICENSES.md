# Licence modelů lidí (spike)

Postavy pocházejí ze hry **0 A.D.** – autor **Wildfire Games** (https://www.wildfiregames.com/),
licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).

Úpravy: převedeno ze skinovaného COLLADA do GLB skriptem `tools/blender/people_from_0ad.py`
(nastavení v `tools/blender/people.json`) – kostra bipeda 0 A.D. a animace jako animace glTF,
hlava, motyka a nůše pevně přivázané ke kostem, měřítko na výšku postavy. Textury jsou složené
do jednoho atlasu (JPEG, zmenšené), kostkovaný vzor keltských šatů a tuniky je nahrazený
jednolitou nebarvenou látkou, barva vlasů je pevná. Srp v ruce ženy je nový jednoduchý model
(skript) s texturou z `prop_weap.dds`. Upravené soubory jsou šířeny pod stejnou licencí
CC BY-SA 3.0. Licence se týká jen těchto souborů, ne zbytku hry Bohemia.

| Soubor      | Původní soubory (art/meshes/, art/animation/biped/, art/textures/skins/)                                                                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `woman.glb` | `skeletal/new/f_dress.dae`, `props/new/dudette_head_a.dae`, `props/tool_hoe.dae`, `props/special/luggage_female_back.dae`; `citizen/walk_relax_f.dae`, `citizen/idle_relax_f.dae`, `gatherer/gather_meat.dae`, `gatherer/farming.dae`, `gatherer/carry_grain_f.dae`; `skeletal/celt/dress_female_01_01.png`, `props/head/celt_fem_b.dds`, `props/prop_weap.dds`, `props/basket_iber_1.dds` |
| `man.glb`   | `skeletal/new/m_tunic_short.dae`, `props/new/head_longhair.dae`, `props/tool_hoe.dae`, `props/special/luggage_female_back.dae`; `citizen/walk_relax_m.dae`, `citizen/idle_relax_m_a.dae`, `gatherer/farming.dae`, `gatherer/carry_grain_m.dae`; `skeletal/celt/tunic_01_01.png`, `props/head/celt_a.dds`, `props/prop_weap.dds`, `props/basket_iber_1.dds`                                 |
