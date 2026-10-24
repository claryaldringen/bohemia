# Scéna – krajina, voda, světlo, roční období

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: [docs/design/landscape.md](../design/landscape.md) v `docs/design/`.

- **Scéna** (`apps/web/lib/scene/`): `LandscapeScene` bez Reactu, React (`GameView`) ji jen
  vytvoří, pošle data a poslouchá `onTileHover`, `onSelect` a `onViewChange`. Plátno scény má
  `data-scene` (rozhraní má i plátno minimapy), políčko pod kurzorem nese `data-tile`. Babylon importovat **z konkrétních modulů**
  (`@babylonjs/core/Meshes/mesh`…), nikdy z `@babylonjs/core` – a jen ze scény, aby se engine
  nestahoval mimo herní plochu (hlídá e2e test). **Pick terénu** (políčko pod kurzorem,
  umisťování, výběr) jde po výškové síti (`terrain-pick.ts`, `TerrainMesh.pick` – DDA po
  políčkách sítě pod paprskem, stejné trojúhelníky a test jako Babylon, setiny ms), nikdy
  `scene.pick` na terénu (516 tisíc trojúhelníků); shodu hlídá `terrain-pick.test.ts` proti
  `scene.pick` v NullEngine.

- **Kreslí se jen při změně** (pohled kamery, velikost okna, data) – co se ve scéně mění samo
  (animace, voda, roční období), musí nastavit `needsRender`. **Výjimka: voda teče** (Martin) –
  dokud je hladina v záběru, scéna se překresluje `WATER_FPS` (30) za sekundu; vlnky plují po
  proudu (`water.ts`, rychlost proudu odvozuje osa potoka v jádru ze spádu a šířky potoka,
  kalnost a podloží `scene/stream-geometry.ts`). Zamrzlá voda neteče: `flowsInView` zná čtverce
  hladiny (`FLOW_CHUNK_M`) a od jaké zimy jsou celé zamrzlé – kreslí se, jen dokud je v záběru
  nezamrzlá voda. **Na pozadí nižší plynulost** (Martin 18. 10. 2026): okno bez fokusu (záložka
  vidět) 10 fps, po 2 minutách bez vstupu hráče 20 fps, vstup nebo fokus hned zpět na 30
  (`animationFps` v `render-loop.ts`); skrytá záložka nekreslí vůbec.

- **Klidová smyčka** (`startLoop` v `landscape-scene.ts`, takt `render-loop.ts`): vlastní
  `requestAnimationFrame` místo `engine.runRenderLoop` – snímek enginu (`beginFrame` /
  `endFrame`, ve WebGPU odeslání příkazů) vzniká **jen když se kreslí**. Kontroly animací
  (voda, zvířata, lidé, dým, obilí) a dokreslování po načtení (`renderBurst`) jdou v taktu
  animací (`tickDue` / `nextTick` – i na displeji 120 Hz přesně 30×/s), pohyb kamery se kreslí
  s displejem. Nové animace patří do `animate()`, ne přímo do smyčky. Výkon měří vývojový
  ukazatel vpravo dole na `/dev/landscape` (`ScenePerfPanel`, `scene-perf.ts` – kreslící
  snímky, smyčka, CPU a GPU snímku, draw cally, trojúhelníky, pick).

- **Vývojový náhled** bez přihlášení a databáze: http://localhost:3010/dev/landscape?seed=42
  (tlačítka předchozí / další / náhodná / původní vrstvy, lišta vsi s minimapou – pole jde
  malovat i do lesa a překážky z něj hned zmizí, „Kácet 20 stromů“). V produkci vrací 404.

- `?renderer=webgl` vynutí WebGL 2 (test záložní cesty). `HEIGHT_SCALE` v `scene/constants.ts`
  převyšuje terén jen vizuálně. Tamtéž rozsah přiblížení kamery `CAMERA_ZOOM_M` (výchozí 120 m
  a nejblíž 50 m jako v 0 A.D.) – řídí se jím i mix zvuků.

- **Vzhled terénu:** `render-surface.ts` zjemní výšky 4× (Catmull-Rom) a vyhloubí hladké koryto
  podél vyhlazené osy potoka (`streamCenterline` z jádra) – tůně hlubší, mělčiny mělké, vnitřní strana
  oblouku mělčí s náplavem; `terrain-material.ts` míchá 11 textur podle splat map
  (`ground-layers.ts`, dno potoka podle proudu: štěrk, písek, bahno) pluginem pro GLSL i WGSL –
  i se stínem je to 15 samplerů, WebGL 2 zaručuje 16 (další vrstva = pole textur). Vrstvu
  shader čte **jen při nenulové váze** v pixelu (`terrain-shader.ts` – kód GLSL i WGSL z jedné
  tabulky, `textureGrad` / `textureSampleGrad` s derivacemi x, z spočtenými před podmínkami;
  obvykle 2–4 vrstvy z 11). Novou vrstvu přidat do `TERRAIN_LAYER_SLOTS`. Louky podle
  tvaru terénu (`buildRelief` z jádra): kamenitá půda a skalní výchozy kde je prudký svah nebo
  ostrý hřbet (`rockinessAt`, jako útesy 0 A.D. podle sklonu), sušší tráva na svazích ke slunci
  (`SUN_RAYS` v jádru, stejný směr jako `SUN_DIRECTION` scény), ostrůvky kvetoucí louky.
  Hranici lesa vyhlazuje a zvlňuje `buildForestField` (jádro, znaménková vzdálenost od
  hranice). **Scéna kreslí stromy, keře a kameny z vrstvy překážek** (`obstacle-scenery.ts`
  je rozdělí na 3D stromy, impostory a dekorace; rozmisťovače jsou v `landscape/obstacles/`).
  **Okraj lesa** jsou 2–3 husté řady 3D stromů z 0 A.D. (`forest-trees.ts`, do 18 m od
  hranice) + lem a ojedinělé stromy v louce; **vnitřek** (od 10 m) jsou impostory (`impostors.ts`) –
  desítky tisíc svislých obrázků stromů z atlasu vyrenderovaného pod pevným náklonem kamery,
  natáčejí se jen při změně směru kamery. Jejich začátek musí z každého směru zakrýt 3D stromy.
  Skladba druhů je jedna funkce pro obojí (`species.ts`): okraj světlomilný (dub, bříza,
  buk), uvnitř buk, dub, trochu břízy a jedle ve skupinách (výš víc) – Martin. **Stromy mimo
  les** (`meadow-trees.ts`, jen 3D): osamělé duby a jilmy v loukách (parkové i volné části)
  a břehový porost topolů a jilmů podél potoka; `woodland.ts`: borovice na skalách
  a suchých hřbetech, mladé stromky ve skupinkách před lesem, souše, padlé stromy a pařezy
  u vesnice; `rocks-shrubs.ts`: keře, kameny, balvany, skalní výchozy a vrby. V lese se kreslí tráva, ne lesní půda (Martin),
  pod stromy ztmavená. Tmavá plocha korun (`forest-canopy.ts`)
  jen vyplňuje mezery hluboko v lese. PBR materiály se oparem musí volat `applyGammaFog`
  (`gamma-fog.ts`) – vestavěný opar PBR zešedí zeleň. **Změna náklonu kamery (`BETA`
  v `camera.ts`) nebo modelů stromů = nový render atlasu** (`tools/blender/impostors.py`)
  a přepis hodnot v `impostor-atlas.ts` – **letního i zimního** (`impostors.py … winter`:
  listnáče holé – listí z textur zmizí podle barvy, zbudou kmeny, větve a řídký závoj
  větviček –, smrky se sněhem; buňky vyjdou stejné, výřez se počítá ze stromu s listím).

- **Dekorace** (`decorations.ts`): překážky z vrstvy (keře, kameny, skalní výchozy naklopené
  podle svahu, souše, padlé stromy, pařezy, vrby) a ozdoby vody bez herní funkce
  (`decor-placement.ts`: rákos, orobinec, lekníny, kmeny v potoce – zůstávají ve scéně). Modely
  načítá `instanced-model.ts` (thin instances, s id překážek), převod z 0 A.D. přes
  `tools/blender/decor.json`.

- **Ořez podle záběru po čtvercích** (`scenery-chunks.ts` čisté funkce, `scenery-culling.ts`
  adaptér): krajina 16 × 16 čtverců po ≈ 120 m (`SCENERY_CHUNKS`). Každý mesh s nehybnými
  instancemi (`setStaticInstances`, jméno `trees-` / `decor-` / `impostors-` / `felled-` /
  `pathside-` – `CULLED_MESHES`; i les vsi, pařezy a stromy u cest, které se mění) dostane klon
  pro kameru `view-<jméno>` (sdílí materiál – roční období platí dál –, ale má **vlastní kopii
  geometrie**: Babylon drží buffery thin instances na geometrii, sdílená by kreslila buffer
  zdroje; změny vrcholů zdroje – natáčení impostorů – se do kopie přenesou), do jehož
  bufferu se před snímkem nakopírují jen instance čtverců, jejichž obal je v záběru; draw cally
  zůstanou (jeden na model), ve výchozím pohledu ≈ 3 % trojúhelníků (0,3 M místo 10 M). Původní
  mesh se všemi instancemi kreslí **jen stínová mapa** (`SHADOW_ONLY_LAYER` – kamera ho
  přeskočí, stínový generátor vrstvy nekontroluje), takže stíny jsou jako dřív. Obaly čtverců
  se pro ořez převádějí světovou maticí meshe (`transformBounds` – i mesh pod rodičem). Nový renderer
  instancí stromů a keřů: instance přes `setStaticInstances` (ne `thinInstanceSetBuffer`)
  a jméno s předponou z `CULLED_MESHES`, vypínat zdroj (`setEnabled`) – klon ho následuje.
  Impostory mají obal přes všechna natočení (`localBounds`). Měření bez prohlížeče:
  `npx tsx apps/web/scripts/measure-scenery-culling.ts` (8 × 8 dá 4,8 %, 32 × 32 1 % – ale
  dražší testy obalů při oddálené kameře).

- **Změny krajiny vsi ve scéně:** `SceneVillage.obstacles` (`removed`, `stumps`, `saplings` –
  id) skryje `InstanceHider` podle id (3D stromy, impostory i dekorace krajiny – jen meshe
  z `addTrees` / `addDecorations` / `addImpostors`, ne les vsi); ozdoby bez id skrývá pod
  stavbami a poli podle tvaru. Skrytí jde do zdroje (stín) i přes `onApply` do ořezu (klon
  kamery). Na místo pokáceného stromu dá `felled-trees.ts` pařez,
  po TREE_SAPLING_AFTER_YEARS mladý stromek. **Vymýcený les** (`cleared-forest.ts`, čistý
  modul): maska po políčkách ze stavu vsi – políčko lesa bez aspoň poloviny dospělých stromů
  nebo pod založeným dílem pole, a paseky pod stavbami v lese přesně podle tvaru
  (`ClearedForest.areas` – vyklízené plochy obydlí a dílen s pruhem pod korunami
  `forestClearingsOf` z jádra, natočené pozemky, modly a svatyně; `clearingDistance` měří
  i k nim). Plocha korun nad pasekou zapadne pod zem
  (`ForestCanopy.setCleared` mění jen výšky vrcholů, klíč i z `clearedAreasKey`), ztmavení trávy se přepočítá bez skrytých
  stromů do modrého kanálu splat textury (`TerrainMaterial.setHiddenTrees` – žádný sampler
  navíc), stínová mapa se jednou překreslí a minimapa kreslí vykácený les jako paseku. Vše jen
  při změně (`applyVillage`).

- **Světlo:** letní slunce a obloha podle 0 A.D., kontrast 1,1. **Stíny od slunce**
  (`sun-shadows.ts`) – stínová mapa 4096 přes celou krajinu se vykreslí jednou (s denní dobou po krocích – Den a noc); vrhají je meshe
  pojmenované `trees-*`, `impostors-*` a `decor-*` (při přejmenování zachovat prefix). Znovu se
  kreslí **jen při změně vrhačů** (`castersChanged`: stavby a pole vsi, skryté stromy, pařezy,
  klády, stromy u cest přes `refreshShadows`) – ne kvůli zvířatům, lidem, ztmavení trávy, ploše
  korun ani nové síti pěšin.

- **Roční období** (jen vzhled, žádná pravidla): `season-look.ts` (čisté funkce, testy) z dne
  v roce spočítá sníh, led na vodě, suchou / svěží trávu, množství, podzimní barvu a mladost listí, květy,
  světlo, opar, vodu a zvuky – plynulé přechody 2–5 týdnů, **léto (`REFERENCE_DAY`) je
  výchozí vzhled a nesmí se měnit**. `LandscapeScene.updateSeason` se jednou za sekundu podívá
  na herní datum (celé dny, svět mimo běh = léto) a jen při znatelné změně nastaví světlo,
  opar, vodu, zvuky a uniformy a jednou překreslí – vzhled se mění nejvýš jednou za herní den.
  Shadery v `season-materials.ts` (GLSL i WGSL, bez textury navíc – šum je procedurální):
  terén (tráva podle vah vrstev, sníh podle šumu a sklonu, ne na dně potoka), obtisky vsi
  (`applySeasonGround`; obtisky jsou poloprůhledné a krytí se v překryvu sčítá – v zimě je každý
  překryv tmavší skvrna ve sněhu: plácek křižovatky patří do vrstvy navazující cesty, svahy
  zemních prací kreslí jen nejbližší osa – village-roads.md), PBR stromy a dekorace (`applySeasonModel` podle jména modelu –
  druhy v `season-foliage.ts`: listnáče se barví a opadávají, z koruny zbudou větvičky, kůra
  ztratí zelený tón; jehličí a kameny pod sněhem; rákos stojí suchý; trnka a jabloně kvetou),
  střechy (`applySeasonSnow`), tvary na zemi se StandardMaterial (`applySeasonRelief`) –
  mohyly a staré hroby hřbitova, zarostlé i čerstvé, a kůl vojvody jen poprášený
  (Martin, 19. 10. 2026: „V zimě by i mohyly na hřbitově měly zapadat sněhem.“): šum a sklon
  `seasonSnowSlope` jako terén, sníh až po osvětlení nasvícený jako terén, bez vlastní barvy
  a okolního světla materiálu. Impostory (`applySeasonImpostors`) mají druhý sampler se
  zimním atlasem (stahuje se souběžně, nečeká se na něj): listnáč s opadem listí přechází po
  pixelech na holý obrázek, smrk se sněhem na zasněžený; podzim barví letní obrázek. Plocha
  korun s opadem po skvrnách mizí – v zimě je pod holými stromy vidět zasněžená zem (u kmenů
  místy prosvítá, stín stromů slabší). Nový model stromu nebo keře = záznam v
  `seasonFoliageFor`. **Led** (`water-ice.ts`, čisté funkce, testy): jde za sněhem – v prosinci
  zamrzá stojatá a pomalá voda (tůně, klidné úseky; rychlost proudu jako ve shaderu vody)
  a okraje u břehů, kde proud slábne, rychlý proud zůstane otevřený s ledem podél břehů;
  v březnu roztaje. Shader hladiny počítá totéž (konstanty odsud, led v uniformě `seasonB.w`,
  šum procedurální): na ledu stojí vlnky, leží sníh se skvrnami holého ledu. Ryby pod ledem
  zmizí a nehýbou se (`Fauna.setIce`, `FishSchool.iceFlow`), potok je pod ledem tišší
  (`frozenShare` v `ambient-mix.ts`). Stínová mapa listí nezná – pod 30 % listí 3D listnáče
  (`isDeciduousMesh`) ze stínové mapy vypadnou a impostory dostanou do `diffuseTexture` zimní
  atlas (stín kmenů a větví), mapa se překreslí jednou. Vývojový náhled má posuvník dne v roce
  a „přehrát rok“ (`setSeasonDay`).

- **Den a noc** (landscape.md – Den a noc; Martin 19. 10. 2026, **zatím jen `/dev/landscape`**,
  hra `/game` beze změny – do hry po Martinově schválení): `day-light.ts` (čisté funkce, testy) –
  z dne v roce a hodiny (`dayLight(season, day, hour)`) směr slunce (50° s. š., v poledne
  referenčního dne přesně `SUN_DIRECTION`, dráha otočená a výška měkce převedená), v noci měsíc
  (úplněk naproti slunci), fáze podle skutečné výšky slunce (zlatá hodinka, západ, soumrak, modrá
  hodinka, noc) jako násobky světla období, okolní světlo, tón materiálů bez světla (impostory –
  `ImpostorForest.setTone`, dým – `VillageRenderer.setLightTone`), odraz oblohy na vodě, síla
  stínů a filtr obrazu (`Grade` → `ColorCurves`, zapne se s prvními hodinami dne – přeloží
  shadery). `hour` null = bez denní doby (pevné světlo jako dřív). Scéna: `setDayClock(clock)`
  (hodiny dne – epoch ms → hodina; fáze 2 `dayHourAt`), `applyLight` v `animate()` po
  `DAY_LIGHT_MS` (při omezeném pohybu jednou za sekundu), stínová mapa `SunShadows.aim` – obnoví se
  po `SHADOW_STEP_DEG` (1,5°), mezi obnovami stíny čtou matici vykreslené mapy. Náhled: posuvník
  **Hodina**, **▶ Přehrát den** (≈ 86 s), **Bez denní doby** (`DayTimeControls`).

- **Ukazatel načítání:** `setLandscape(landscape, onProgress)` hlásí kroky přípravy a mezi
  náročnými kroky pustí prohlížeč překreslit; `GameView` ukazuje `SceneLoading`.

- **Zvuky** (podle 0 A.D.): `ambient-mix.ts` (čisté funkce, testy) spočítá z cíle a přiblížení
  kamery hlasitost vrstev – ptáci dne, zpěv ptáků u okraje lesa, vítr v listí, potok jen kde
  teče přes oblázky (štěrkové dno z `bedMix`, Martin), střední / rychlý podle `speed`.
  `ambient-sound.ts` je přehrává přes Web Audio (bez Babylonu):
  soubory stahuje až po přípravě scény, mix mění jen při pohybu kamery, zvuk pustí po prvním
  gestu (pravidlo prohlížečů), ve skrytém panelu uspí. Stav nese `canvas[data-sound]`, přepínač
  v horní liště hry (`hud/TopBar.tsx`, ve vývojovém náhledu `SoundToggle`; volba v localStorage). Soubory Opus/WebM v `public/audio/ambient/` (převod
  `tools/audio/ambient.sh` – smyčky mají délku N + 312 ≡ 0 mod 960, viz `loopRegion`).

- **Zvířata** (podle 0 A.D., jen ozdoba): hejna ryb kroužících v tůních a klidné hluboké vodě,
  hejna vran nad loukami u lesa a jedno káně. Kde jsou, určuje `fauna-placement.ts`, jak se
  hýbou `fauna-motion.ts` (čisté funkce skutečného času, ne herního – testy); `fauna.ts` je kreslí jako instance (mesh
  `fauna-*` na druh – ne vrhač stínu). Mávání křídel a mrskání ocasem je přechod mezi třemi
  pózami z animací 0 A.D. (morph targety GLB z `tools/blender/fauna_from_0ad.py`) ve vertex
  shaderu (GLSL i WGSL). **Výjimka z kreslení jen při změně jako voda:** hýbou se jen skupiny
  v záběru, sdílejí `WATER_FPS`, při omezeném pohybu stojí. Ryby se kreslí po vodě (skupina
  vykreslování 1) – hloubku pod kalnou hladinou dělá jejich průhlednost.

- **Grafika (licence):** CC0, nebo z **0 A.D.** pod **CC BY-SA 3.0** (textury terénu, stromy –
  uvést Wildfire Games, upravené soubory pod stejnou licencí). Zdroj a původní název každého
  souboru do `LICENSE.md` / `LICENSES.md` vedle něj. Převod stromů, atlas impostorů a render
  textury korun: `tools/blender/` (headless Blender 5, `blender -b --factory-startup --python …`).
