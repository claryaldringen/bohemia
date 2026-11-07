# Licence modelů lidí

Postavy pocházejí ze hry **0 A.D.** – autor **Wildfire Games** (https://www.wildfiregames.com/),
licence
[Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).

Úpravy: převedeno ze skinovaného COLLADA do GLB skriptem `tools/blender/people_from_0ad.py`
(nastavení v `tools/blender/people.json`) – kostra bipeda 0 A.D. a animace jako animace glTF,
hlava a nástroje (motyka, sekera, palička, nůše, otep dřeva) pevně přivázané ke kostem, měřítko
na výšku postavy. Textury jsou složené do jednoho atlasu (JPEG, zmenšené), kostkovaný vzor
keltských šatů a tuniky je nahrazený jednolitou nebarvenou látkou, barva vlasů je pevná; vedle
atlasu je maska látky a vlasů (PNG, odvozená z ploch barvy hráče). Srp v ruce a vahadlo s vědry
(nošení vody) jsou nové jednoduché modely (skript) s texturou z `prop_weap.dds`. Upravené soubory jsou šířeny pod stejnou licencí
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

Jezdec a výcvik (jen `man.glb`, klipy `ride`, `ride-trot`, `ride-idle`, `bow-draw`,
`bow-release`, `spear-thrust`, `sword-strike`, `shield-block`): animace
`animation/biped/rider/cavalry/crossbowman/pace_relax.dae`, `trot_relax.dae`, `idle_relax_01.dae`,
`animation/biped/infantry/archer/idle_ready.dae`, `attack_ranged.dae`,
`animation/biped/infantry/spearman/attack_melee_01.dae`,
`animation/biped/infantry/swordsman/attack_melee_shield_01.dae`, `idle_ready_shield_01.dae`.
Pěší lovec s oštěpem (klip `walk-spear`): chůze kopiníka
`animation/biped/infantry/spearman/walk_relax.dae`, rekvizita kopí jako u `spear-thrust`.
Rekvizity (výcvikové, dřevěné – všechny s texturou `props/wood_e.png`, štít s `props/basket_iber_1.dds`):
`props/bow_long_indian_a.dae` (luk), `props/broadsword_celt.dae` (výcvikový meč),
`props/weap_shaft_wood_a.dae` (kopí bez hrotu), `props/shield/round_noboss_f.dae` (pletený štít).
Jezdecké klipy 0 A.D. mají na koni sed – poloha jezdce na koni se odvozuje ve scéně.

Porážka (oba soubory, klipy `butcher`, `bleed`, `gut`, `carry-meat`): animace
`animation/biped/gatherer/gather_meat.dae` (butcher), `gather_berries.dae` (bleed),
`slaughter.dae` (gut), `carry_meat_f.dae` / `carry_meat_m.dae` (žena / muž). Rekvizity: nůž `props/weapons/dagger_01.dae` (textura
`props/prop_weap.dds`), kýta `props/special/brontoburger.dae` (textura `props/shuttle_meat.png`).
Miska na krev je nový jednoduchý model (skript, `procedural_bowl`) s texturou z `prop_weap.dds`.

Prut (klip `fish`, oba soubory): nový jednoduchý model (skript, `procedural_rod`, **CC0**) – kuželovitý
šestiboký válec ≈ 3 m s texturou dřeva z `prop_weap.dds` (0 A.D.); klip `fish` je klidová póza
(`idle_relax_f.dae` / `idle_relax_m_a.dae`), vlasec se kreslí až ve scéně. Ženě je prut natočený
(`rotate_deg`), aby mířil šikmo nad vodu jako u muže.

Dítě s řehtačkou (klipy `walk-rattle` a `idle-rattle`, oba soubory): chůze a klidová póza
(`walk_relax_f.dae` / `walk_relax_m.dae`, `idle_relax_f.dae` / `idle_relax_m_a.dae`) se zvednutou
pravou rukou (úprava klipu skriptem – `pose.reach`). Řehtačka (`procedural_rattle` – držadlo,
ozubené kolečko a rámeček s jazýčkem) je nový jednoduchý model (skript, **CC0**) s texturou dřeva
z `prop_weap.dds` (0 A.D.).

Humno (klipy `thresh` a `winnow`, oba soubory): mlácení holí je animace
`animation/biped/gatherer/gather_mine.dae` (úder krumpáčem oběma rukama shora), prohazování zrna
lopatou `animation/biped/gatherer/farming.dae`. Mlatcí hůl (`procedural_stick`, ≈ 1,2 m)
a dřevěná lopata (`procedural_shovel`, násada a list z jednoho kusu dřeva) jsou nové jednoduché
modely (skript, **CC0**) s texturou dřeva z `prop_weap.dds` (0 A.D.).

Další klipy 0 A.D. (úloha 10 scény, 1. 11. 2026; Martin 31. 10. 2026: „Z OAD použij vše, co je pro
nás použitelné“) – animace z `art/animation/biped/`, CC BY-SA 3.0 (Wildfire Games):

| Klip                                     | `woman.glb`                                               | `man.glb`                                                                |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pray` (modlitba u modly a svatyně)      | `citizen/pray.dae`                                        | `citizen/pray.dae`                                                       |
| `rest-a` … (varianty stání)              | `citizen/idle_relax_f_short.dae`, `idle_relax_f_long.dae` | `citizen/idle_relax_m_b.dae`, `_d`, `_f`, `_h`, `_j` (`rest-a`–`rest-e`) |
| `walk-hoe`, `walk-axe` (cesta s nářadím) | `gatherer/walk_hoe.dae`, `walk_axe.dae` (motyka, sekera)  | totéž                                                                    |
| `lord-idle-a`–`c`, `walk-lord` (vojvoda) | –                                                         | `citizen/idle_minister_01.dae`–`03`, `walk_relax_minister.dae`           |

Vlastní klipy z klíčových póz – **vlastní práce, CC0** (skript `keyed_frames` v
`people_from_0ad.py`, pózy v `people.json` – klíč `keys`): `milk` (dojení), `spin` (předení),
`weave` (tkaní), `sit` (sezení starších), `wheel` (hrnčířský kruh), `pipe` (píšťala), `drum`
(buben). Pohyb je vlastní, kostra a výchozí póza (`idle_relax_f.dae` / `idle_relax_m_a.dae`)
jsou z 0 A.D. – soubory GLB jako celek zůstávají pod CC BY-SA 3.0. Špalek k sezení
(`procedural_stump`) je nový jednoduchý model (skript, **CC0**) s texturou dřeva z `prop_weap.dds`
(0 A.D.).

Rekvizity fází činností (úloha 9 scény, 1. 11. 2026 – `docs/design/villagers.md`, Fáze činností),
oba soubory. Klipy jsou stávající animace 0 A.D. s novou rekvizitou: `bind` (vázání snopu,
`gatherer/gather_berries.dae`), `rake` a `pitch` (hrábě, vidle – `gatherer/farming.dae`), `forge`
(kladivo a kleště – `citizen/build.dae`), `split` (štípání na špalku – `gatherer/gather_mine.dae`),
`sieve`, `pots`, `snare`, `cook` (síto, nádoby, oko, vaření – `gatherer/gather_berries.dae`)
a `carry-tools`, `carry-pots`, `carry-fish` (nůše s nástroji, nádobami, rybami –
`gatherer/carry_grain_f.dae` / `carry_grain_m.dae`); vlastní klipy `milk`, `spin`, `weave`, `pipe`
a `drum` dostaly džber, přeslici, stav, píšťalu a buben.

- **Z 0 A.D.** (CC BY-SA 3.0, Wildfire Games): vidle `art/meshes/props/tool_pitchfork.dae`
  (textura `art/textures/skins/props/prop_tools.dds`), kladivo `props/tool_hammer.dae`, kleště
  `props/tool_tongs_01.dae` a sekera ke štípání `props/tool_axe.dae` (textura
  `props/prop_weap.dds`); zmenšené skriptem (`scale` v `people.json`).
- **Nové jednoduché modely** (skript `people_from_0ad.py`, tvar **vlastní práce, CC0**) s texturami
  z 0 A.D.: snop s povříslem a pletené síto (`props/basket_iber_1.dds`), hrábě, štípací špalek,
  nástroje v nůši, ryby, oko na zajíce, vařečka, džber a píšťala (`props/prop_weap.dds`), nádoby
  na zemi i v nůši a hrnec na ohništi (`props/vase_rome_1.dds`), přeslice, stav a buben
  (`props/prop_tools.dds`). Soubory GLB jako celek zůstávají pod CC BY-SA 3.0.

Vojsko ve scéně (`apps/web/lib/scene/army-renderer.ts`, war.md – Ve scéně) používá tytéž soubory
a klipy se zbraněmi – oštěp (`walk-spear`, `spear-thrust`, `props/weap_shaft_wood_a.dae`), štít
s mečem (`sword-strike`, `shield-block`, `props/shield/round_noboss_f.dae`,
`props/broadsword_celt.dae`) a luk (`bow-draw`, `bow-release`, `props/bow_long_indian_a.dae`);
nové soubory nevznikly.
