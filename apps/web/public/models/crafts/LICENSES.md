# Licence modelů řemeslných staveb

Hrnčíř, kovář, uhlíř a milíř jsou vymodelované procedurálně skriptem Blenderu
`tools/blender/crafts.py` – hrnčíř a kovář jsou polozemnice, uhlíř zemnice z
`tools/blender/dwellings.py` (postup v hlavičce `crafts.py`). Atlas textur sestavuje
`tools/blender/craft_atlas.py`: je to atlas obydlí (`tools/blender/atlas.py`, licence a výřezy
v `../dwellings/LICENSES.md`) rozšířený o pásy a oblasti řemesel. Textury, ze kterých vychází,
pocházejí ze hry **0 A.D.** – autor **Wildfire Games** (https://www.wildfiregames.com/), licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).

Úpravy nad atlasem obydlí: **mech** (střecha uhlíře, `atlas-moss`) z `grass_04.png` a
`forestfloor_003.png` přebarvený do mechových polštářů po řadách došků; **zem milíře** z `mud_01.png`
ztmavená sazemi a popelem s drny z `grass_04.png`; **hliněná kopule pece** z `mud_01.png` přebarvená
do vypálené hlíny se sazemi; **kameny** z `shoreline_stoney_a.png` zvětšené na lomový kámen (soubory
terénu viz `apps/web/public/textures/terrain/LICENSE.md`, v repu jako `grass-lush.jpg`, `forest-floor.jpg`,
`mud.jpg`, `gravel.jpg`). Uhlí, žhavé uhlíky, železo, keramika, kůže a voda jsou procedurální
(šum, bez cizích souborů). **Žádný výřez nezasahuje do loga Wildfire Games** (`celt_struct.dds`
345–512 × 130–210 px) – používají se jen výřezy atlasu obydlí. Upravené soubory jsou šířeny pod
stejnou licencí CC BY-SA 3.0. Licence se týká jen těchto souborů, ne zbytku hry Bohemia.

| Soubor                  | Původní soubory (art/…)                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hrncir.glb`            | atlas obydlí (viz `../dwellings/LICENSES.md`) + `textures/terrain/types/temperate/mud_01.png`, `../shoreline_stoney_a.png`; koš `meshes/props/wrld_basket_b.dae` + `textures/skins/props/basket_celt_1.dds` |
| `kovar.glb`             | atlas obydlí + `mud_01.png`, `../shoreline_stoney_a.png`; koš `meshes/props/wrld_basket_a.dae` + `textures/skins/props/basket_celt_1.dds`                                                                   |
| `uhlir.glb`             | atlas obydlí s mechem místo slámy: `textures/terrain/types/temperate/grass_04.png`, `forestfloor_003.png`, `mud_01.png`; koše `meshes/props/wrld_basket_a.dae` + `basket_celt_1.dds`                        |
| `milir.glb`             | stejný atlas jako `uhlir.glb` (zem milíře z `mud_01.png` a `grass_04.png`, věnec polen z `celt_struct.dds`); koš `meshes/props/wrld_basket_a.dae` + `basket_celt_1.dds`                                     |
| `construction.glb`      | díly staveniště hrnčíře a kováře a rekvizity (kameny, hlína) – stejné zdroje jako `hrncir.glb` a `kovar.glb`                                                                                                |
| `construction-moss.glb` | díly staveniště uhlíře a milíře – stejné zdroje jako `uhlir.glb` a `milir.glb`                                                                                                                              |

Jámu se schody, ve které hrnčíř, kovář (jáma polozemnice) a uhlíř (jáma zemnice) stojí, kreslí
scéna (`apps/web/lib/scene/dwelling-pit.ts`) s texturou bahna z terénu.
