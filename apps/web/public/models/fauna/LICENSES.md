# Licence modelů zvířat

Ryby, ptáci a domácí zvířata pocházejí ze hry **0 A.D.** – autor **Wildfire Games**
(https://www.wildfiregames.com/), licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).

Úpravy: převedeno ze skinovaného COLLADA do GLB skriptem `tools/blender/fauna_from_0ad.py`
(nastavení v `tools/blender/fauna.json`) – bez kostry a animací, model je napózovaný snímkem
animace 0 A.D. a k němu jsou jako morph targety přidané dvě klíčové pózy z dalších snímků
(křídla nahoře a dole, ocas na jednu a druhou stranu; u domácích zvířat nohy v kroku na jednu
a druhou stranu a třetí póza s hlavou dole při pastvě). Pózy ptáků jsou zrcadlením souměrné,
pohyb ocasu ryby je zesílený, model je natočený, vystředěný a má změněné měřítko, textura ryby
je zmenšená, textury domácích zvířat jsou převedené do JPEG. Upravené soubory jsou šířeny pod stejnou licencí CC BY-SA 3.0. Licence se týká jen
těchto souborů, ne zbytku hry Bohemia.

| Soubor        | Původní soubory (art/meshes/skeletal/, art/animation/, art/textures/skins/skeletal/)                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crow.glb`    | `crow.dae`, `other/crow_glide.dae`, `other/crow_flight.dae`, `animal_crow.png`                                                                        |
| `hawk.glb`    | mesh a kostra z `other/hawk_flight.dae` (shodný s `hawk.dae`), `other/hawk_glide.dae`, `animal_hawk2.png`                                             |
| `fish.glb`    | `fish_single.dae`, `others/fish_move.dae`, `animal_fish_generic.png`                                                                                  |
| `sheep.glb`   | `sheep.dae`, `quadraped/sheep_idle_01.dae`, `quadraped/sheep_walk.dae`, `quadraped/sheep_idle_02.dae`, `animal_sheep_no_player_color_a.dds`           |
| `goat.glb`    | `goat.dae`, `quadraped/goat_idle_02.dae`, `quadraped/goat_walk.dae`, `quadraped/goat_idle_01.dae`, `animal_goat.png`                                  |
| `cow.glb`     | `cattle_female_a.dae`, `quadraped/bovidae_idle_a.dae`, `quadraped/bovidae_walk_relax.dae`, `quadraped/bovidae_feeding.dae`, `animal_cattle_beige.png` |
| `pig.glb`     | `pig.dae`, `quadraped/animal_pig_idle_01.dae`, `quadraped/animal_pig_walk_01.dae`, `quadraped/animal_pig_feeding_01.dae`, `animal_pig_d.png`          |
| `chicken.glb` | `chicken.dae`, `quadraped/chicken_idle_01.dae`, `quadraped/chicken_walk.dae`, `quadraped/chicken_idle_02.dae`, `animal_chicken_b.dds`                 |
