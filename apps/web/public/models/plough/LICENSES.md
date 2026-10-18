# Licence modelů spřežení (voli, oráč, rádlo)

Voli a oráč s honáčkem pocházejí ze hry **0 A.D.** – autor **Wildfire Games**
(https://www.wildfiregames.com/), licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).
Upravené soubory jsou šířeny pod stejnou licencí CC BY-SA 3.0. Licence se týká jen těchto
souborů, ne zbytku hry Bohemia.

## `ox.glb` – vůl

Převedeno skriptem `tools/blender/people_from_0ad.py` (nastavení v
`tools/blender/plough-team.json`) ze skinovaného COLLADA do GLB s kostrou a animacemi glTF
(klipy `walk`, `idle`). Textura je zmenšená, převedená do JPEG a přebarvená z béžové na
hnědou; vedle je maska srsti (PNG, odvozená – celá textura kromě rohů). Měřítko na délku
těla 2,2 m.

| Původní soubor (`art/`)                           | Co z něj je  |
| ------------------------------------------------- | ------------ |
| `meshes/skeletal/cattle_male_c.dae`               | tělo, kostra |
| `textures/skins/skeletal/animal_cattle_beige.png` | textura      |
| `animation/quadraped/bovidae_walk.dae`            | klip `walk`  |
| `animation/quadraped/bovidae_idle_a.dae`          | klip `idle`  |

## `plowman.glb` – oráč a honáček

Postava muže jako `../people/man.glb` (stejný převod), jen s klipy `walk`, `idle` a dvěma
novými odvozenými z chůze: `plough` (předklon trupu a ruce dvoukloubovou IK na příčné
rukojeti rádla, nohy dál kráčí) a `lead` (pravá ruka natažená dopředu s vodicím provazem).
Klipy upravuje skript, žádná nová animace se nekreslila.

| Původní soubor (`art/`)                                                                 | Co z něj je              |
| --------------------------------------------------------------------------------------- | ------------------------ |
| `meshes/skeletal/new/m_tunic_short.dae`, `textures/skins/skeletal/celt/tunic_01_01.png` | tělo a oděv              |
| `meshes/props/new/head_longhair.dae`, `textures/skins/props/head/celt_a.dds`            | hlava                    |
| `animation/biped/citizen/walk_relax_m.dae`                                              | `walk`, `plough`, `lead` |
| `animation/biped/citizen/idle_relax_m_a.dae`                                            | `idle`                   |

## `ard.glb` – rádlo, jho, oj a provaz

Nový model (skript `tools/blender/plough.py`, 0 A.D. rádlo ani jho nemá). Textura je malý
atlas vyříznutý z atlasu obydlí a řemesel (`tools/blender/atlas.py`, `craft_atlas.py`),
tedy z textur 0 A.D. pod CC BY-SA 3.0: kůra trámů (`celt_struct.dds`) zesvětlená do
oloupaného a ohlazeného dřeva, čela polen (`celt_struct_1.dds`), železo a kůže
(procedurální v `craft_atlas.py`); provaz je procedurální. Atlas je proto šířen také pod
CC BY-SA 3.0.
