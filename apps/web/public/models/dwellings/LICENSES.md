# Licence modelů obydlí

Tvary obydlí (zemnice, polozemnice, plot z proutí, hráň polen) jsou vymodelované procedurálně
skriptem Blenderu `tools/blender/dwellings.py` (atlas textur `tools/blender/atlas.py`, postup
v hlavičce `dwellings.py`). Textury, koše a trsy trávy pocházejí ze hry **0 A.D.** – autor
**Wildfire Games** (https://www.wildfiregames.com/), licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).

Zemnice i polozemnice mají **jeden atlas textur** (pásy opakované vodorovně) složený z výřezů
0 A.D. – úpravy: vyříznuté jednotlivé plochy, přebarvené (sláma do světle zlaté, omítka do
teplé okrově šedé mazanice, ostřik hlíny u země), řady došků poskládané znovu s nepravidelnou
výškou a zvlněnou hranou, převedeno do JPEG. **Žádný výřez nezasahuje do loga Wildfire Games**
(v `celt_struct.dds` na 345–512 × 130–210 px) ani do emblémů atlasu (modrý kruh, štítek) –
zkontrolováno vizuálně na náhledu s vyznačenými výřezy. Upravené soubory jsou šířeny pod
stejnou licencí CC BY-SA 3.0. Licence se týká jen těchto souborů, ne zbytku hry Bohemia.

| Soubor             | Původní soubory (art/…)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zemnice.glb`      | atlas: `textures/skins/structural/celt_struct_1.dds` (došky 0–380 × 45–128, omítka 256–512 × 412–510, proutí 250–343 × 133–229, čela trámů 362–500 × 358–382 px), `textures/skins/structural/celt_struct.dds` (kůra 546–586 × 520–875, polena 704–767 × 930–960, seno 612–680 × 542–606 px), `textures/terrain/types/temperate/grass_01.png` + `mud_01.png` (drny, hlína, dno vstupní šíje); koš `meshes/props/wrld_basket_a.dae` + `textures/skins/props/basket_celt_1.dds` |
| `polozemnice.glb`  | stejný atlas jako `zemnice.glb`; koše `meshes/props/wrld_basket_a.dae`, `meshes/props/wrld_basket_b.dae`, `textures/skins/props/basket_celt_1.dds`                                                                                                                                                                                                                                                                                                                           |
| `construction.glb` | díly staveniště obou obydlí (kolíky, sloupy, krov, latě, výplet, srub, řady došků) a rekvizity (drny, hráň, proutí, snopy, rýč) ze stejného atlasu jako `zemnice.glb`; koš `meshes/props/wrld_basket_a.dae`, `textures/skins/props/basket_celt_1.dds`                                                                                                                                                                                                                        |
| `grass-tuft-1.glb` | `meshes/gaia/cross_large_short.dae`, `textures/skins/gaia/grass_field_lush_tall.dds` (actor `actors/props/flora/grass_field_lush_tall.xml`), zmenšeno na 0,11                                                                                                                                                                                                                                                                                                                |
| `grass-tuft-2.glb` | `meshes/gaia/cross_large_tall.dae`, `textures/skins/gaia/grass_field_lush_tall_b.dds` (týž actor), zmenšeno na 0,1                                                                                                                                                                                                                                                                                                                                                           |

Vyšlapaná hlína před vchodem, staveniště a pole jsou obtisky ve scéně z textur terénu; jámu
se schody a hromadu vykopané hlíny kreslí scéna s texturou bahna z terénu
(`apps/web/public/textures/terrain/`, licence v tamním `LICENSE.md`).
