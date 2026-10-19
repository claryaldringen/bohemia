# Licence modelů vozů

Dvoukolý a čtyřkolý vůz pocházejí ze hry **0 A.D.** – autor **Wildfire Games**
(https://www.wildfiregames.com/), licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).
Upravený soubor `wagons.glb` je šířen pod stejnou licencí CC BY-SA 3.0. Licence se týká jen
tohoto souboru, ne zbytku hry Bohemia.

## `wagons.glb` – vozy, kola, oj a náklad

Převedeno skriptem `tools/blender/wagons_from_0ad.py` (postup v jeho hlavičce) ze skinovaného
COLLADA do GLB s díly (uzly): korba dvoukoláku, korba a předek čtyřkoláku, oj čtyřkoláku, kolo
a náklad obou vozů. Úpravy:

- **měřítko** zmenšené na skutečnou velikost (kolo ⌀ 0,98 m), kostra se nepřevádí – model je
  rozdělený podle kostí na korbu, předek a kolo (kola točí scéna, animace jízdy 0 A.D. se
  nepoužívá),
- **koňský postroj je pryč** (dvě oje dvoukoláku s chomoutem, zakřivená oj čtyřkoláku s dvojitým
  chomoutem a železná pouzdra ojí) a místo něj je **vlastní oj** ke šíjovému jhu volů
  (tools/blender/plough.py),
- **náklad je vlastní model** (seno s pavuzou, snopy, klády, pytle, soudky a balík kožešin,
  sudy na vodu).

Textura je atlas 512 × 512 px: celá textura vozu, výřez slámy z textury iberských staveb (seno
přebarvené do olivova), kůra a čela klád z atlasu řemesel (`../crafts/LICENSES.md`, textury
`celt_struct.dds` a `celt_struct_1.dds` z 0 A.D.); pytlovina, kožešina a provaz jsou procedurální.

| Část                                | Původní soubor (`art/`)                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `wagon2-body`, `wagon-wheel`        | `meshes/props/special/wagon_two_wheel_empty.dae` (aktér `actors/props/special/wagon_two_wheel_empty.xml`)   |
| `wagon4-body`, `wagon4-front`       | `meshes/props/special/wagon_four_wheel_empty.dae` (aktér `actors/props/special/wagon_four_wheel_empty.xml`) |
| textura vozu, oj                    | `textures/skins/props/wooden_wagon.png`                                                                     |
| seno a sláma (náklad)               | `textures/skins/structural/iber_struct.png` (výřez slámy, jako `meshes/props/hay_cart.dae`)                 |
| klády (náklad)                      | atlas řemesel – `textures/skins/structural/celt_struct.dds`, `celt_struct_1.dds`                            |
| animace jízdy (jen ověření osy kol) | `animation/mechanical/wagon_two_wheel_empty_move.dae`, `wagon_four_wheel_empty_move.dae`                    |
