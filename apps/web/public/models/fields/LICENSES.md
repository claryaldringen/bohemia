# Licence modelů polí

Trsy obilí, panák snopů a kupka sena vznikly skriptem Blenderu `tools/blender/fields.py`
z textur a modelu ze hry **0 A.D.** – autor **Wildfire Games** (https://www.wildfiregames.com/),
licence [Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).
Upravené soubory jsou šířeny pod stejnou licencí CC BY-SA 3.0. Licence se týká jen těchto
souborů, ne zbytku hry Bohemia. Žádný výřez nezasahuje do loga Wildfire Games (použité textury
logo nemají).

| Soubor         | Původní soubory (art/…)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crops.glb`    | atlas 4 × 2: `textures/skins/gaia/farming_wheat_harvest_a.png` (zralá pšenice – méně sytá; zelené obilí – přebarvená do modrozelené; strniště – spodní třetina stébel), `textures/skins/gaia/grass_field_lush_tall.dds` (vzcházející obilí, do modrozelené); hrách (zelený, zralý, hromádka vytrhaného hrachu – uzly `crop-pea-green`, `crop-pea-ripe`, `pea-heap`) kreslený procedurálně ve `fields.py` (vlastní); tvar trsu (tři karty do hvězdy) vlastní, jako `meshes/gaia/cross_large_short.dae` |
| `stook.glb`    | procedurální tvar panáku (osm snopů a čepice); textura ze `textures/skins/props/wrld_hay_a.dds` (stébla, do zlata) a `textures/skins/gaia/farming_wheat_harvest_a.png` (klasy)                                                                                                                                                                                                                                                                                                                        |
| `haystack.glb` | `meshes/props/wrld_hay_la.dae` (zvýšená a zúžená do stohu, přidaná tyč), `textures/skins/props/wrld_hay_a.dds`                                                                                                                                                                                                                                                                                                                                                                                        |

Plevel na úhoru a vysoká tráva louky jsou trsy trávy z `apps/web/public/models/dwellings/`
(licence v tamním `LICENSES.md`), louky a pastviny obtisky z textur terénu
(`apps/web/public/textures/terrain/`).
