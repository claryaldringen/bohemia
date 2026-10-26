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
Rekvizity (výcvikové, dřevěné – všechny s texturou `props/wood_e.png`, štít s `props/basket_iber_1.dds`):
`props/bow_long_indian_a.dae` (luk), `props/broadsword_celt.dae` (výcvikový meč),
`props/weap_shaft_wood_a.dae` (kopí bez hrotu), `props/shield/round_noboss_f.dae` (pletený štít).
Jezdecké klipy 0 A.D. mají na koni sed – poloha jezdce na koni se odvozuje ve scéně.

Porážka (oba soubory, klipy `butcher`, `bleed`, `gut`, `carry-meat`, `carry-meat-idle`): animace
`animation/biped/gatherer/gather_meat.dae` (butcher), `gather_berries.dae` (bleed),
`slaughter.dae` (gut), `carry_meat_f.dae` / `carry_meat_m.dae` a `idle_carry_meat_f.dae` /
`idle_carry_meat_m.dae` (žena / muž). Rekvizity: nůž `props/weapons/dagger_01.dae` (textura
`props/prop_weap.dds`), kýta `props/special/brontoburger.dae` (textura `props/shuttle_meat.png`).
Miska na krev je nový jednoduchý model (skript, `procedural_bowl`) s texturou z `prop_weap.dds`.

Prut (klip `fish`, oba soubory): nový jednoduchý model (skript, `procedural_rod`, **CC0**) – kuželovitý
šestiboký válec ≈ 3 m s texturou dřeva z `prop_weap.dds` (0 A.D.); klip `fish` je klidová póza
(`idle_relax_f.dae` / `idle_relax_m_a.dae`), vlasec se kreslí až ve scéně.
