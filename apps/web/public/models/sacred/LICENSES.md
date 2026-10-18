# Licence modelů posvátných míst

Modla, svatyně, obětiny u posvátného dubu a kameny dubového háje jsou vymodelované procedurálně
skriptem Blenderu `tools/blender/sacred.py` (postup a příkaz v jeho hlavičce, půdorys svatyně
v `tools/blender/sacred_layout.py`). Atlas textur sestavuje `tools/blender/sacred_atlas.py` z atlasu
řemeslných staveb (`tools/blender/craft_atlas.py`, licence a výřezy v `../crafts/LICENSES.md`
a `../dwellings/LICENSES.md`) a z textur terénu v repu. Textury, ze kterých vychází, pocházejí ze hry
**0 A.D.** – autor **Wildfire Games** (https://www.wildfiregames.com/), licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).

Převzato z atlasu řemesel beze změny: kůra (`celt_struct.dds`), čela polen (`celt_struct_1.dds`),
kameny v hlíně (`shoreline_stoney_a.png`), drny a vykopaná hlína (`grass_04.png`, `mud_01.png`),
uhlí, žhavé uhlíky, vypálená keramika a hlína (procedurální). Nově z textur terénu
(`apps/web/public/textures/terrain/LICENSE.md`): **mapa země svatyně a modly** (udusaná plocha,
příkop, val, navážka) z `mud_01.png` (`mud.jpg`), `grass_dirt_01.png` (`grass-dirt.jpg`)
a `grass_01.png` (`grass.jpg`) přebarvených a smíchaných podle půdorysu; **kámen** hraničních
kamenů, oltáře a ohnišť z `shoreline_stoney_a.png` (`gravel.jpg`) rozmazaného na tón žuly; **ohořelá
polena** z kůry atlasu převedené do černé. Dubové dřevo modly, lišejník, popel, stébla snopu, zrno
a látky stužek jsou procedurální (šum, bez cizích souborů). **Žádný výřez nezasahuje do loga
Wildfire Games** – používají se jen výřezy atlasu obydlí. Upravené soubory jsou šířeny pod stejnou
licencí CC BY-SA 3.0. Licence se týká jen těchto souborů, ne zbytku hry Bohemia.

| Soubor                    | Obsah a původní soubory (art/textures/…)                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idol.glb`                | modla na udusaném kruhu s obětinami – atlas posvátných míst: `terrain/types/temperate/mud_01.png`, `grass_dirt_01.png`, `grass_01.png`, `../shoreline_stoney_a.png`, kůra a čela polen z `skins/structural/celt_struct.dds` a `celt_struct_1.dds` |
| `idol-construction.glb`   | díly staveniště modly – stejné zdroje jako `idol.glb`                                                                                                                                                                                             |
| `shrine.glb`              | svatyně podle Perynu (plocha, příkop s osmi výběžky, val, ohniště, modla, dlažba) – stejné zdroje jako `idol.glb`                                                                                                                                 |
| `shrine-construction.glb` | díly staveniště svatyně – stejné zdroje jako `idol.glb`                                                                                                                                                                                           |
| `oak-offerings.glb`       | kameny, pahýl větve se stužkami a misky u paty dubu – stejný atlas zmenšený na polovinu                                                                                                                                                           |
| `grove-stones.glb`        | hraniční kameny a kamenný oltář háje – stejný atlas zmenšený na polovinu                                                                                                                                                                          |

Stromy, ke kterým obětiny a kameny patří (posvátný dub, duby háje), jsou modely z
`../trees/` (`oak-large-*.glb`, licence v `../LICENSES.md`).
