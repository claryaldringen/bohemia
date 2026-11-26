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

- **Rozložení `LandscapeScene`** (`landscape-scene.ts`, rozděleno 11. 11. 2026 – čistý
  refaktoring, chování a vzhled beze změny): třída je **fasáda** s veřejným API pro React
  (`GameView`, HUD, `/dev/landscape`) a drží části scény (renderer vsi, zvířata, lidé, pěšiny,
  terén, voda…); samostatné úlohy mají vlastní soubory s výslovnými vstupy (scéna, kamera,
  `requestRender` místo přímého `needsRender`, části scény přes getter – vznikají postupně):
  - `scene-loop.ts` – `SceneLoop`: klidová smyčka, příznak překreslení (`requestRender`),
    `renderBurst` / `renderWhenReady`, takt animací, plynulost na pozadí, ztráta kontextu.
    Co se ve snímku děje a v jakém pořadí, skládá dál `LandscapeScene.frame`.
  - `scene-atmosphere.ts` – `SceneAtmosphere`: roční období, světlo dne a noci, déšť, bouřka
    s kroupami, povodeň, smršť a záblesky i vývojová vynucení (den v roce, déšť, den pohrom,
    hodiny dne); světla a obraz scény ze světla dne nastavuje `applySceneLight`
    (`scene-light.ts`).
  - `shadow-casters.ts` – `ShadowCasters`: stínová mapa slunce, vrhače čekající na ni, holé
    listnáče v zimě.
  - `scene-pointer.ts` – `ScenePointer`: políčko pod kurzorem, kliknutí a dvojklik, výběr,
    brána opevnění, pick terénu (`pickGround`); čisté převody kamera → obrazovka a záběr kamery
    na zemi v `scene-projection.ts`.
    Picking Babylonu (side-effect import `@babylonjs/core/Culling/ray`) se registruje **první**
    v `landscape-scene.ts` – registrace až se `scene-pointer.ts` rozbila tah bodu opevnění (e2e).
  - `scene-selection.ts` – `SceneSelection`: výběr rozhraní a stav vybraného člověka, spřežení
    a vozu pro posluchače; `scene-war.ts` – `SceneWarView`: vojsko a poslední snímek války.
  - `placement-factory.ts` – `createPlacement`: druh umisťování (body opevnění, malování po
    čtvercích, duch stavby); životní cyklus umisťování zůstává ve fasádě.
  - `landscape-build.ts` – čisté kroky stavby: výšky terénu (`sceneGround`), plán stromů,
    dekorací a zvířat z vrstvy překážek (`planScenery`), načtení modelů (`loadSceneryModels`),
    `nextPaint`, typy průběhu `SceneStep` / `SceneProgress`.

  `setLandscape` skládá pojmenované kroky v **pevném pořadí** (pořadí vzniku meshů je i pořadí
  kreslení): `terrain` – výšky, renderer vsi (`buildVillageRenderer`), překryvy; `forest` – plán
  krajiny, zbytky lesa (`buildForestRemnants`), déšť a bouřka → vojsko → smršť → ohně
  (`buildWeatherAndFires`), zvířata, zvěř, lidé a pěšiny (`buildVillageLife`); `surface` – terén,
  voda, prémiové prvky, koruny a kamera (`buildTerrain`); `models` – modely krajiny; pak stíny,
  roční období, ves, `shaders` a zvuky (`startAmbient`). Hlášení průběhu (`onProgress` – značky
  `scene:<krok>` v `GameView`) i `renderBurst(1500)` na konci zůstávají.

- **Kreslí se jen při změně** (pohled kamery, velikost okna, data) – co se ve scéně mění samo
  (animace, voda, roční období), musí nastavit `needsRender`. **Výjimka: voda teče** (Martin) –
  dokud je hladina v záběru, scéna se překresluje `WATER_FPS` (30) za sekundu; vlnky plují po
  proudu (`water.ts`, rychlost proudu odvozuje osa potoka v jádru ze spádu a šířky potoka,
  kalnost a podloží `scene/stream-geometry.ts`). Zamrzlá voda neteče: `flowsInView` zná čtverce
  hladiny (`FLOW_CHUNK_M`) a od jaké zimy jsou celé zamrzlé – kreslí se, jen dokud je v záběru
  nezamrzlá voda. **Na pozadí nižší plynulost** (Martin 18. 10. 2026): okno bez fokusu (záložka
  vidět) 10 fps, po 2 minutách bez vstupu hráče 20 fps, vstup nebo fokus hned zpět na 30
  (`animationFps` v `render-loop.ts`); skrytá záložka nekreslí vůbec.

- **Klidová smyčka** (`SceneLoop` v `scene-loop.ts`, takt `render-loop.ts`): vlastní
  `requestAnimationFrame` místo `engine.runRenderLoop` – snímek enginu (`beginFrame` /
  `endFrame`, ve WebGPU odeslání příkazů) vzniká **jen když se kreslí**. Kontroly animací
  (voda, zvířata, lidé, dým, obilí) a dokreslování po načtení (`renderBurst`) jdou v taktu
  animací (`tickDue` / `nextTick` – i na displeji 120 Hz přesně 30×/s), pohyb kamery se kreslí
  s displejem. Nové animace patří do `animate()`, ne přímo do smyčky. Výkon měří vývojový
  ukazatel vpravo dole na `/dev/landscape` a ve hře s `?perf=1` v adrese (i v produkčním buildu –
  vývojový režim kreslení zkresluje; bez příznaku nic nestojí a hráč ho nevidí):
  `ScenePerfPanel`, `scene-perf.ts` – kreslící snímky, smyčka, CPU a GPU snímku, draw cally,
  trojúhelníky, pick, CPU kontroly animací, **„Hýbe se“** (které animace v poslední sekundě
  chtěly kreslit – proč scéna v klidu kreslí: `animateParts` hlásí jména) a ve hře doba načtení
  (značky User Timing `scene:<krok>` a `scene-ready` z `GameView` – vidět i v profilu prohlížeče).
  S ukazatelem je Babylon scéna v konzoli jako `__bohemiaScene` (rozbor trojúhelníků po meshích).

- **Výkon – měření 11. 11. 2026** (Martin: „vykreslování je nějaké pomalé“ – načtení i pohyb
  kamery). Vlkov, M1 Pro, Chromium s oknem (WebGPU přes Metal), 1600 × 900; skript Playwright
  měří kroky načtení, mezery mezi snímky (requestAnimationFrame), odeslání příkazů GPU
  (`GPUQueue.submit` = kreslené snímky) a ukazatel. „Hotovo“ = konec posledního dlouhého snímku
  po načtení (zasekávání po zmizení „Připravuji…“).

  |                               | dev (`next dev`) před                | produkce před                            | produkce po           |
  | ----------------------------- | ------------------------------------ | ---------------------------------------- | --------------------- |
  | „Připravuji…“ zmizí           | 2,5–3,0 s                            | 2,1–2,3 s                                | 1,9–2,1 s             |
  | zaseknutí hned po něm (ves)   | 4,0 s                                | 3,8 s                                    | 2,3 s                 |
  | další dlouhé snímky           | 470 + 340 + 270 + 920 ms             | 470 + 270 + 260 + 760 ms                 | 320 + 250 + 280 ms    |
  | hotovo (plynulá scéna)        | 8,3–9,5 s                            | 7,6–7,8 s                                | 5,1–5,4 s             |
  | v klidu kreslí                | 30 sn./s (lidé)                      | 30 sn./s, CPU 2,1 ms                     | 30 sn./s, CPU 1,9 ms  |
  | posun šipkami                 | 108 sn./s, 3 snímky > 50 ms (226 ms) | 120 sn./s, CPU 1,5 ms                    | 120 sn./s, CPU 1,5 ms |
  | kolečko (oddálit a přiblížit) | 31 sn./s, mezera 1,5 s               | 99 sn./s, p95 24 ms                      | 100 sn./s, p95 23 ms  |
  | oddáleno, posun               | 84 sn./s smyčky                      | 48 sn./s kreslí, 9,4 M △, 305 draw callů | 46 sn./s, 9,1 M △     |

  **Příčiny načtení** (profil CPU): po hotové krajině se ves staví synchronně v jedné úloze –
  hledání míst hromad klád 1,4 s (každé ze stovek zkoušených míst znovu skládalo políčka polí
  a plochy obydlí – teď `FreeContext` jednou na hledání, 0,24 s), pole bez pásu pěšin a po síti
  pěšin bloky u pěšin znovu (a nový chodec jim pás mezitím vzal – potřetí): ≈ 1,1 s. Pole teď
  dostanou pás ze stálých tras před první stavbou (`VillagePaths.initialTrack`, `show` pro touž
  ves vrátí týž pás) a ves se stálými trasami (hra) síť pěšin nepočítá (0,3 s při každé změně
  dílů polí – i za hry zaškobrtnutí kamery); síť jen pro teplotní mapu provozu.
  **Zbývá:** stavba polí 1,4–2,1 s (`fieldBlockContent` – krytí okraje a šum, rostliny, obtisky
  `mergedDecal`), příprava shaderů vsi ≈ 0,6 s (Babylon `ProcessIncludes` a převod GLSL → WGSL
  u vlastních materiálů), první kreslení vsi 0,4 s – kandidáti na rozložení do více úloh nebo
  workeru. **Pohyb:** v produkci posun 120 sn./s; oddálená kamera je omezená GPU – stromy
  v plném modelu (duby 3 745 instancí = 3,3 M △, břízy 1,3 M △); bez změny vzhledu nejde
  (vzdálenost impostorů, LOD). Vývojový režim přidává zasekávání Reactu (dlouhé snímky při
  posunu a přiblížení) – plynulost posuzovat v produkčním buildu. GPU snímku Chromium
  neukazuje (timestamp-query bez čísel). V klidu scéna kreslí 30×/s, dokud jsou v záběru lidé,
  zvířata nebo voda (záměr – `animate()`); celou scénu včetně stromů. **Regres?** Build
  z 6. 11. (`3429aca6`) dnešní Vlkov neotevře (novější data vsi – chyba serveru), srovnat přímo
  nešlo. Pomalé části jsou ale starší (hromady klád u lesa 26. 10., pás pěšin v polích 19. 10.,
  pěšiny ze stálých tras 24. 10.) – zpomalení roste s vsí (víc hromad, polí a tras), ne s kódem
  po 6. 11.

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
  kamery). Na místo pokáceného stromu dá `felled-trees.ts` pařez
  (mladý stromek jen nízký pahýl – `stumpScale`), po TREE_SAPLING_AFTER_YEARS mladý stromek. **Vymýcený les** (`cleared-forest.ts`, čistý
  modul; výpočet masky `clearedForest` a typ `ClearedForest` jsou v jádru – `core/cleared-forest.ts`, scéna je re-exportuje; `villageClearedForest` jen převede pohled na zdroje jádra (`clearedForestOf`), hledání cesty vojska čte totéž ze `villageClearings`, village-core.md – Vymýcený les (jádro)): maska po políčkách ze stavu vsi – políčko lesa bez aspoň poloviny dospělých stromů
  nebo pod založeným dílem pole, a paseky pod stavbami v lese přesně podle tvaru
  (`ClearedForest.areas` – vyklízené plochy obydlí a dílen s pruhem pod korunami
  `forestClearingsOf` z jádra, natočené pozemky, modly a svatyně, milířiště a pás opevnění –
  každý úsek, i rozestavěný (`SceneVillage.forts`); `clearingDistance` měří i k nim). Plocha korun nad pasekou zapadne pod zem
  (`ForestCanopy.setCleared` mění jen výšky vrcholů, klíč i z `clearedAreasKey`), ztmavení trávy se přepočítá bez skrytých
  stromů do modrého kanálu splat textury (`TerrainMaterial.setHiddenTrees` – žádný sampler
  navíc), stínová mapa se jednou překreslí a minimapa kreslí vykácený les jako paseku. Vše jen
  při změně (`applyVillage`).

- **Paseka klučení** (forest.md – Klučení lesa pro pole – postup; Úloha 5 plánu
  `2026-10-27-forest-clearing.md`): vzhled dílu dává jádro (`fieldPartLooks` – `slash` s podílem
  kácení, `burnt` s podílem pálení a `before: 'slash'`, po dohoření `burnt` do první práce,
  pak `before: 'burnt'` pod kopáním či setím). Obtisky v `LOOK_STYLES` (`field-crops.ts`):
  paseka = hrabanka lesa (`forest-floor`) se skvrnami rozryté hlíny, spálenina = černá zem se
  šedým popelem. Pařezy padlých stromů kreslí `felled-trees.ts` (`obstacles.stumps`); čtverec
  je vymýcený les, jakmile padne polovina dospělých stromů (`CLEARED_SHARE`), po dohoření jsou
  stromy čtverce odstraněné (žádné pařezy). **Hromady větví** – `clearing-slash-layout.ts`
  (čisté): `slashHeapSites` 2–4 místa na čtverec z `hash01(id dílu, k)`, uvnitř čtverce
  `SLASH_EDGE_MARGIN_M` od okraje, `STUMP_CLEAR_M` od všech překážek vrstvy na čtverci (stálá
  místa – neskáčou, jak stromy padají), tři velikosti; `clearingHeaps` podle povrchu pod
  hromadou po pruzích práce jako obtisk (`workFrame` / `workSteps`): paseka → hromada větví,
  spálenina → ohořelý zbytek na stejném místě, jinde nic. `clearing-slash.ts` (`ClearingSlash`)
  – dvě vlastní procedurální sítě (kupa klestí s klacky; placka popela s ohořelými pahýly –
  tmavá a menší než kupa, `ASH_SPREAD`, ať pod hořící hromadou nepůsobí jako světlý talíř),
  thin instances (pozice, normála, barva + matice = 7 vertex bufferů), PBR s `applyGammaFog`
  a sněhem; přestaví se jen při změně `clearingHeapsKey` (díly s pasekou či spáleninou,
  vzhled, hotové pruhy). Kupa větví vrhá stín, popel ne. **Hromady klád** (u cesty
  i u místa kácení – forest.md, Mýcení a hromada klád) – `SceneVillage.logStacks` kreslí
  `LogPile` stejnou sítí kmenů (nejvýš MAX_SHOWN_LOGS na hromadu); místo `logStackSite`
  (`log-pile-layout.ts`): hromada u cesty (`road`) nejdřív přesně na místě z jádra, čely klád
  k cestě (`atan2` od bodu osy ke kotvě), jinak do STACK_REACH_M od kotvy po kružnicích ven, mimo díly polí, hřbitovy, vodu, cesty a obydlí, bez stojících
  stromů (pařezy, keře a kameny nevadí), pro 3 hranice, jinak méně (`LogPileSite.stacks`);
  mezi volnými místy se bere nejrovnější (`siteRelief` – rozdíl výšek pod půdorysem, první místo s
  převýšením do `FLAT_RELIEF_M` hned; scéna, ne herní data – výšku dává `groundHeight`); hromada se dá
  vybrat klikem (`LogPile.pickable()` → `pickVillageTarget` `logPiles`, cíl `log-pile`, panel
  `selection/log-pile.tsx` – ikona dřeva a počet klád, rámeček z půdorysu);
  předchozí volné místo zůstane (hromada neskáče) a místo se nehledá znovu při každém pokáceném
  stromu – hromadě bez místa jen po každých `RETRY_REMOVED` pokácených; hromady se navzájem
  nepřekrývají (`pileCorners` ostatních jde do `isFree`). **Hromady kamene** (návrh Clauda) leží na volném místě stejným hledáním jako klády –
  `stoneStackSite` (společné `stackSite` s `logStackSite`; půdorys `LogPileSite.size` – čtverec
  kolem kruhu dílů `stackRadius`): kotva u cesty (`road` ze `StoneStack`) napřed, jinak po
  kružnicích do STACK_REACH_M, mimo staveniště a obydlí, díly polí, hřbitovy, cesty, vodu, stojící
  stromy i sebe navzájem; platí pro kámen z lomu, obchodu i přinesený celou vsí (migration.md – Co
  si vezmou). Místo se počítá jednou v datech scény (`sceneVillage` → `stoneStacks[].site`): kreslí
  ho `StonePiles` (`stoneLayout`), hromady klád se mu vyhnou (`stoneFootprints` → `occupied`
  v `LogPile`) a míří k němu nosiči i vůz s kamenem k zásobě u dvorce (`stoneDestination`,
  `withStoneCartHeaps`). Bez volného místa `site: null` – hromada se nekreslí a nosiči i vůz míří
  ke kotvě jako dřív. Dým `slashPlumes` má přednost hořících
  čtverců před doutnajícími; `burnCrew` jde jen k hromadám za čarou práce (`burnHeaps`);
  `setWorldClock` přestaví ohně i bez změny vsi a `ClearingFireRenderer.animate` v taktu nealokuje.

- **Paseka klučení – ohně a kouř** (forest.md – Klučení lesa pro pole – postup, bod 3; issue #10
  – Martin 24. 10. 2026: „musí být vidět ohně a kouř“; Úloha 6 plánu). Čisté funkce bez
  Babylonu: `clearing-fire.ts` – `burningSquares(village, day)` (čtverce, které dnes hoří:
  rozpracované pálení `isBurningPart` – `burnt` s `before: 'slash'` a podílem 0–1 na poli
  s dnešní prací `found-field`, bez rozdělení práce se předpokládá; dohořelé `burnedDay` ještě
  `isSmoldering` z jádra), `heapFires` (hromady větví na těch čtvercích – místa jako
  `slashHeapSites`, překážky čtverce `squareObstacles` sdílí hromady, ohně i postavy;
  rozpracované pálení hoří jen na spálené části, dohořelé dnes všechny; `order` 0–1 = pořadí
  zapálení napříč čtvercem jako obtisk), `slashPlumes` (nejvýš `MAX_SLASH_PLUMES` = 16 sloupců
  dýmu ze středu čtverce podle id dílu), `burningKey`. Časování v `smoke-schedule.ts` –
  `clearingFireState(burn, gameDay, order)` → `{ fire, glow, smoke }`: pálí se přes pracovní
  den jako pec (`CRAFT_FIRE` 0,26–0,78 dne), hromada vzplane podle `order` a hoří
  `HEAP_BURN_DAY` (≈ 19 s), pak do půlnoci žhnou uhlíky; dým čtverce hustý přes práci, večer
  slábne k doutnání `SMOLDER_SMOKE`, v dnech doutnání jen kouř a na konci zmizí; rozpracované
  pálení (bez `burnedDay`) hoří každý pracovní den, přes noc doutná. Dým = `VillageSmoke`
  s druhem `slash` (`SLASH_PLUME` – hustší než dýmník a vyšší než hranice: vystoupá ≈ 34 m, nad koruny lesa,
  které paseku v hustém lese z herní kamery zakryjí – forest.md, Ověření klučení; sloupec má tvar podle
  druhu – `plumeShape`, síla z `SmokeSource.burn`), zdroje v `updateSmokeSources`
  (village-renderer.ts, seed `SLASH_SMOKE_SEED` + id dílu). Plameny, jiskry a záře =
  `fireSprites` z pohřební hranice s tvarem ohně (`FireShape` – `PYRE_FIRE`, `heapFireShape`:
  10 plamenů, 5 jisker, menší), `clearing-fire-renderer.ts` (`ClearingFireRenderer` v
  landscape-scene.ts vedle `ClearingSlash`) – jeden `SpriteManager` s `fire.png` (aditivně,
  skupina 1 jako dým, 1 draw call) s pevnou zásobou spritů `MAX_FIRE_SQUARES` (12) × 4 hromady
  × 16; oheň jen na 12 čtvercích v záběru nejblíž kameře, ostatní hořící čtverce jen kouří.
  Večer v uhlících problikne pár nízkých plamínků. Animace v `animate()` (takt `WATER_FPS`,
  herní den podle hodin světa) jen při ohni či žáru v záběru; při omezeném pohybu se ohně
  nastaví jen po změně vsi a stojí. **Postavy** (`villager-plan-fields.ts` – `founding`):
  napřed čtverce, které se dnes pálí (`isBurningView`), u hořících hromad lidé dokola s motykou
  čelem k ohni (`burnCrew`, klip `hoe`); bez překážek čtverce (`VillagerGround.squareObstacles`)
  v řadě na čáře práce; na kácené pasece půlka kácí, půlka nosí kmeny k nejbližší hromadě klád
  u lesa (`logCarrier`, `SceneVillage.logStacks`, `walkRoute` + `shuttle` s `carry-wood`); na
  schnoucí pasece nikdo. **Ukázka:** `/dev/landscape` tlačítko „Klučení“ (`dev-clearing.ts`) –
  řada lesních čtverců u vsi: kácení, schnutí, pálení, dohořelo dnes, doutnání (den pálení podle
  hodin scény; oheň jen přes pracovní den ≈ 45 s z 86 s; s „Lidé“ i postavy). Testy
  `clearing-fire.test.ts`.

- **Obtisky cest a křižovatky** (podrobně village-roads.md – Křižovatky, Scéna): pás cesty
  (`path-ribbon.ts`) má průřez ze čtyř bodů – plné krytí do 0,35 × půl šířky od osy, k okraji pásu
  a měkkému okraji lineárně do nuly; u konců pásu (4 m) se osa nevlní a šířka nekolísá, takže
  navazující pás i plácek sedí na spoji. **Plácek křižovatky** (`junction-patch.ts`, oprava 24. 10. 2026 – Martin: „ty ostrý křižovatky už jsou upravený?“ a „Předtím ty křižovatky byly
  tedy lepší“: šedý štěrkový plácek s ostrým obrysem a rovně uříznutými rameny zmizel): pásy cest
  končí v řezu 1,5 m za vchody (`junctionCuts`, `roadBands(roads, cuts)`), kus osy do středu je
  rameno plácku. Krytí v bodě je průřez pásu podle vzdálenosti k osám ramen, ramena slitá hladkým
  minimem (`PATCH_BLEND`) – ve vnitřních rozích oblouk, v řezu přesně průřez pásu (žádný šev ani
  překryv). Síť: paprsky ze středu po 2,5° a navíc přesně do čtyř bodů průřezu v řezu, 24 kroků
  k řezu (jinde ke kružnici za dosahem ramen), trojúhelníky bez krytí se vynechají. Povrch jako
  cesty – obtisky `roads-junction-worn` / `roads-junction-earth` (prošlapaná tráva a hlína, šířka
  a měkký okraj ramene podle navazující cesty, vyjetá vozová bez hlíny), **žádný štěrk na plácku**;
  koleje vozové cesty vedou přes plácek jen mezi rameny, která svírají aspoň 120° (Bézierova
  křivka řez–řez), jinak dojdou ke středu a vytratí se. Krátký úsek celý v dosahu řezu (5 m
  k brance) je celý rameno plácku a k volnému konci se vytrácí jako pás. **Úsek mezi dvěma
  křižovatkami, jejichž řezy se překrývají** (přijatá výjimka rozestupu, paths.md – Rozestup;
  oprava 2. 11. 2026 – Martin, Vlkov: vozová 1387 ≈ 10 m mezi 1131 a 1619 „nevypadá“ jako
  vozová): `overlapSplit` ho rozdělí v půli překryvu – ramena obou plácků začínají v témže bodě
  a míří po ose úseku (tečna pro průjezd 120° je tam, ne v zatáčce u druhé křižovatky); pás nemá,
  koleje jdou z dělicího bodu průjezdem nebo ke středu. Dřív první řez sebral skoro celý úsek
  a koleje vynechal – úsek byl jen hlína plácku bez štěrku.
- **Světlo:** letní slunce a obloha podle 0 A.D., kontrast 1,1. **Stíny od slunce**
  (`sun-shadows.ts`) – stínová mapa 4096 přes celou krajinu se vykreslí jednou (s denní dobou po krocích – Den a noc); vrhají je meshe
  pojmenované `trees-*`, `impostors-*` a `decor-*` (při přejmenování zachovat prefix). Znovu se
  kreslí **jen při změně vrhačů** (`castersChanged`: stavby a pole vsi, skryté stromy, pařezy,
  klády, stromy u cest přes `refreshShadows`) – ne kvůli zvířatům, lidem, ztmavení trávy, ploše
  korun ani nové síti pěšin.

- **Roční období** (jen vzhled, žádná pravidla): `season-look.ts` (čisté funkce, testy) z dne
  v roce spočítá sníh (stopy sněhu, holomrazu a dlouhé zimy a `seasonTrack` jsou v jádře –
  `packages/game/.../village/disasters/snow.ts`, simulace podle nich pozná, kdy leží sníh – `snowLies`; test
  hlídá, že `seasonLook(…).snow` = `snowCover`), led na vodě, suchou / svěží trávu, množství, podzimní barvu a mladost listí, květy,
  světlo, opar, vodu a zvuky – plynulé přechody 2–5 týdnů, **léto (`REFERENCE_DAY`) je
  výchozí vzhled a nesmí se měnit**. `LandscapeScene.updateSeason` se jednou za sekundu podívá
  na herní datum (celé dny, svět mimo běh = léto) a jen při znatelné změně nastaví světlo,
  opar, vodu, zvuky a uniformy a jednou překreslí – vzhled se mění nejvýš jednou za herní den.
  Shadery v `season-materials.ts` (GLSL i WGSL, bez textury navíc – šum je procedurální):
  terén (tráva podle vah vrstev, sníh podle šumu a sklonu, ne na dně potoka), obtisky vsi
  (`applySeasonGround`; obtisky jsou poloprůhledné a krytí se v překryvu sčítá – v zimě je každý
  překryv tmavší skvrna ve sněhu: plácek křižovatky pásy cest nepřekrývá – viz Obtisky cest, svahy
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

- **Roční období – počasí** (disasters.md – Ve scéně; village-disasters.md – Scéna): počasí roku
  vsi (`SceneVillage.weather` – jen odhalené, scéna ho bere jen ve stejném herním roce,
  `weatherNow`; s vývojovým dnem vždy) jde do `seasonLook(day, weather)` jako další násobek
  světla a barev období – **bez počasí přesně dnešní vzhled** (test). Průběh v roce
  (`weatherAmounts`, × síla léta): sucho od 1. 5. sílí do poloviny června, drží do konce srpna,
  do poloviny října odezní; deštivé léto od 1. 6. za 2 týdny, odezní v září; holomráz od 1. 2.
  za 5 dní; vzhled nikdy neskočí (test: krok za den < 0,36).
  - **Sucho – slunce praží** (Martin 27. 10. 2026): při plném suchu slunce × 1,16 (1,05 → 1,22)
    a žlutější (modrá −10 %, červená +3 %), světlo oblohy × 0,86 (vyšší kontrast), obloha
    vybledlá (55 % k 0,80 / 0,82 / 0,80), prašný opar (50 % k 0,84 / 0,82 / 0,74, hustota × 1,3),
    teplejší odraz od země; `day-light.ts` – síla stínů × 1,35 (`shadowDarkness` v
    `sun-shadows.ts`: tmavost 0,35 → 0,23, mapa se nepřekresluje) a kontrast obrazu × 1,12
    (1,1 → 1,23, `DayLight.contrast`); část listnáčů žloutne dřív (`leafAutumn` ≥ 0,2). Tráva
    (`seasonGrass`, uniforma `seasonC` = sucho, mokro, jinovatka) usychá jako na podzim
    (× 0,65) a ve skvrnách ≈ 33 m spálená hněď; obtisky vsi dostávají poloviční sucho – díly polí
    barví `droughtPartTint` podle ochrany (nechráněný žlutohnědý, díl za stromy zelenější; po
    čtvrtinách sucha, ať se pole přestaví nejvýš 4×).
  - **Mokro** – slunce × 0,7 a šedé, obloha × 1,12, šedá obloha a opar (hustota × 1,6), odraz
    oblohy na vodě šedý, stíny × 0,5; tráva tmavší a sytější (× 0,8 / 0,93 / 0,72).
  - **Holomráz** – sníh × (1 − jinovatka), šedobílá jinovatka na trávě i zemi, odraz od země bez
    sněhu, slunce × 1,12. **Dlouhá zima** – den vzhledu se opozdí o 21 dní (od 1. 3. za 6 dní se
    sníh vrátí, taje 13. 3.–3. 4., listí a tráva o 3 týdny později, do poloviny července se rok
    srovná – den vzhledu jen roste).
  - **Obilí podle počasí** (`partWeather` ve `field-look.ts` → `PartView.weather`, po čtvrtinách
    jako barva dílu): v suchu nižší (−35 %) a řidší (−40 %) trsy i porost shora, plná ochrana
    dílu z toho ubere 70 %; v deštivém létě **polehlé zralé obilí** ve skvrnách ≈ 7 m
    (`lodgedSpot` – podíl 0,6 × mokro, ochrana proti mokru ubere až 60 %, luštěniny a len ne) –
    trsy leží jedním směrem (`PlantInstance.lean`, zkosená matice instance), porost ve skvrně
    o 70 % níž a tmavší; po holomrazu **řídký ozim** (`SceneFieldPart.winter`, od 1. 2. do žní,
    −35 % trsů ve skvrnách `frostSpot`) – porost ve skvrnách klesne pod zem a obtisk ukáže hlínu
    (`sown`), díl lehce žloutne.
  - **Mělký potok v suchu** (`water.ts`): hladina klesne o 0,35 m × sucho jen ve shaderu (průhlednost
    podle hloubky ve vrcholech, `seasonC.x`) – mělčiny u břehů a brody zmizí, potok je užší
    a tůně menší, bez nové geometrie.
  - **Déšť** (`rain.ts` čisté funkce, testy; `rain-renderer.ts`; délka čárky roste s časem mezi posuny – `streakLength`, rozmazání pohybem proti aliasingu při řídkém taktu 10–20 fps, platí i pro kroupy): dny deště ze seedu dne světa
    (`gameDayAt`, hash pořadí dne – jen vzhled, jádro o nich neví), déšť v obdobích 2–4 dnů za sebou
    (`inRainPeriod`: okna po 6 dnech, v každém nejvýš jedno období s pravděpodobností úměrnou 0,55 × mokro, začíná nejdřív druhý den okna – podíl dnů ≈ 0,55 × mokro, nejvýš ½; Martin 14. 11. 2026 „Seskupit“), síla 0,6–1, na přelomu dnů plynulý přechod (po desetinách). Za deště
    **zataženo** (`overcast` – slunce × 0,5 a šedé, hustší opar, stíny × 0,2) a kapky: jeden
    mesh čárky s instancemi (1800 při plném dešti, **jeden draw call**, bez deště vypnutý)
    v kvádru kolem cíle kamery (strana 0,9 × vzdálenost kamery, 30–420 m), kapky ukotvené ve
    světě, padají v `animate()` v taktu animací, při omezeném pohybu stojí. Vývojové vynucení
    `setRainOverride`.
  - **Kaluže** (`seasonPuddle` v season-materials.ts, `seasonC.w` = `puddleAmount` – 0,45 × mokro
    - 0,7 × déšť, `setPuddles`): na terénu na vyšlapané trávě, břehu a bahně v nivě, na obtiscích
      cest (`applySeasonGround(…, puddles)` jen v `path-renderer.ts` – zralé obilí na poli by
      zešedlo) – tmavší mokrá zem a šedé kaluže s odrazem oblohy ve skvrnách ≈ 5 m.
  - Zvuk deště zatím není (žádný CC0 zvuk deště), tetelení vzduchu v suchu vynechané – v poledne
    by se scéna musela překreslovat bez přestání.
  - **Bouřka s kroupami** (Martin 27. 10. 2026: „Když přijde bouřka s kroupami, chci, aby scéna
    potemněla a blýskalo se.“; `storm.ts` čisté funkce, testy; `storm-renderer.ts`): jen v den
    krupobití (`SceneVillage.hail`, průběh podle podílu dne `gameDayAt` − den krupobití, po
    desetinách). Bouřka se stáhne za 0,1 dne, drží do 0,6, odejde do 0,8; **ztmavení** jako
    násobek světla dne (`stormLight` po `overcast`): slunce × 0,3, oblaka × 0,55, odraz od země
    × 0,6, okolní světlo a tón impostorů a dýmu × 0,6, stíny × 0,05, tmavá mračna místo oblohy
    (0,17 / 0,19 / 0,23), tmavší a hustší opar (× 1,6), odraz oblohy na vodě tmavý, sytost −30
    (filtr obrazu, jen s denní dobou); s bouřkou prší (déšť 0,7 × bouřka). **Záblesky** v síle
    bouřky ≥ 0,6: deterministicky z času (`lightningFlash(epochMs)` – okna 1,8 s, blesk v 45 %
    oken, náběh, úder a dosvit ≈ 0,45 s, síla 0,5–1) – oblaka +2,2, okolní světlo +0,7, tón +0,9,
    obloha a opar zesvětlí; slunce ne (stínová mapa se nepřekresluje). **Bezpečné pro oči**
    (WCAG 2.3.1 – nejvýš 3 záblesky za sekundu): blesk má jedinou špičku (jas jen roste, pak jen
    klesá, žádný druhý úder) a začíná v okně tak, aby do dalšího okna zbyla tma ≥ 400 ms
    (`FLASH_GAP_MS`) – za libovolnou 1 s nejvýš 2 vzestupy jasu (test na 100 000 oken). Záblesky
    jdou v `animate()` (překreslí se jen při změně síly), **při omezeném pohybu bez záblesků**,
    jen ztmavení (po krocích v kontrole období); zapne-li hráč omezený pohyb během záblesku,
    `frame()` záblesk hned zhasne. **Kroupy** – `RainRenderer` s druhem `DropKind`
    (bílé kuličky, 1600 při plné síle, pád 16 m/s, jeden draw call) jen v pruhu (`setArea` –
    `hailZone` z jádra, mimo pruh nulová matice), padají 0,1–0,5 dne. **Bílý pás na zemi**
    (`overlayGrid` ve `flood-water.ts` – obtisk v mřížce 7,5 m na terénu, krytí ve vrcholech):
    vnitřek pruhu 1, okraj 0,5, skvrny ≈ 35 m, na vodě nic, ± 800 m od středu vsi; přibývá
    s kroupami, roztaje do půlky dalšího dne; slabě svítí (`emissive` 0,5), ať je v tmě bílý.
    **Potlučené obilí** do žní (`withHail` ve `field-look.ts`, osetý díl v pruhu podle středu):
    trsy o 45 % nižší a o 50 % řidší, zralé obilí celé polehlé, díl hnědne (okraj polovina).
    **Sad bez jablek** v pruhu do sklizně (`village-view-scene.ts` – `fruit: false`). Střechy
    podle stavu z jádra (kroupy ubírají stav – `dwelling-decay.ts` beze změny). Zvuk hromu
    a krup chybí (žádný CC0 zvuk).
  - **Povodeň** (`flood-water.ts` čisté funkce, testy; `storm-renderer.ts`): `SceneVillage.flood`
    od dne povodně do konce bahna. Zatopená políčka ze **stejné funkce jako jádro**
    (`streamHeights` – výška nad potokem < výška vody), plocha vody ve středech políček
    (zatopená + sousední – břeh je průsečík s vyšším terénem): hladina = dno nejbližšího potoka +
    výška vody (× převýšení), kalná šedohnědá s modrým nádechem (léto 0,36 / 0,33 / 0,27, jaro
    0,38 / 0,40 / 0,38), **odraz oblohy Fresnelem** (`diffuseFresnelParameters` ubere světlo
    vody, `emissiveFresnelParameters` přičte oblohu – shora 10 %, šikmo až 55 %; barva oblohy
    `DayLight.waterSky` v `applyLight` přes `setSky`, i za bouřky a v noci) – z ptačí perspektivy
    lesklá voda, ne hnědá cesta; lesk slunce (`specularColor` 0,8, `specularPower` 140), krytí
    podle hloubky 0,25–0,92 (u břehu prosvítá tráva), jemné vlnky normálovou mapou potoka
    (`createRippleNormalMap`, `level` 0,15, dlaždice 56 m – bez šachovnice). Voda stojí
    `FLOOD.standDays` (3 dny), pak za den ustoupí – plocha klesá (`position.y`, po desetinách)
    a terén ji zakryje; mesh vody se staví, až voda stoupne, a po ústupu se zahodí; **hnědé
    bahno a naplavenina** (obtisk jako bílý pás, síla podle hloubky) 14 dní po ústupu zarůstá.
    Naplavené větve vynechané.
  - **Smršť** (`storm.ts` – `tornadoStorm`, `funnelProgress`; `tornado-track.ts` čisté funkce,
    testy `tornado.test.ts`; `tornado-funnel.ts`): `SceneVillage.tornado` jen v den smrště a po
    něm do konce roku. **Ztmavení jako bouřka** – síla `max(bouřka krupobití, tma smrště)` jde
    do `stormNow` (`updateDisasters`), takže světlo, déšť (× `STORM_RAIN`) i záblesky jsou
    společné; tma odpoledne (podíl dne 0,56–0,62 náběh, do 0,78 drží, do 0,86 odejde – smrště
    bývají odpoledne, návrh Clauda). **Trychtýř** (`TornadoFunnel`, meshe `tornado-funnel`
    a `tornado-dust`) přejde mezi 0,64 a 0,76 dne (≈ 10 s) po ose stopy ± `FUNNEL_PATH_HALF_M`
    (450 m) kolem bodu nejblíž středu vsi (`funnelPoint`; stopa je dlouhá kilometry), na
    začátku a konci roste ze země a rozplyne se (`funnelGrowth`). Rotační plochy (lathe – jen
    pozice, normály, uv): **trychtýř** 260 m vysoký, nahoře rozevřený do mraku (poloměr 1 ×
    šířka stopy, 90–260 m), u země úzký provazec 3–5 m (obrys `b + (1 − b)·v^1,6`), osa
    ohnutá (vrchol posunutý o 0,35 × poloměr nahoře, s výškou na druhou) proti směru postupu
    a pomalu se kývá (natočení ± 0,45 rad, náklon ± 0,05 rad); uvnitř **tmavé jádro**
    (`tornado-core`, 0,45 × poloměr, sdílí texturu). Obrys se staví znovu jen při jiné šířce
    stopy (`shapeFunnel`). **Prachová sukně** (`tornado-dust`, `tornado-dust-outer`): poloměr
    `0,25 + 1,6·(1 − v)²` × 0,18 šířky (12–55 m), 60–80 m vysoká, hnědá; druhá vrstva nižší
    a širší, pomaleji opačně. **Úlomky** (`tornado-debris`) – 40 tmavých kvádrů jako tenké
    instance, krouží kolem sukně a převalují se (matice v `animate()`,
    `alwaysSelectAsActiveMesh`). Materiály bez světla (barva emisní × textura pruhů víru –
    `RawTexture` 128²: u trychtýře ostré pruhy `smoothstep` s kontrastem 0,2–1, dole hustší,
    šikmost 2,5, dolních 40 % tmavší; u prachu chomáče s mezerami, řídne nahoru i k okraji),
    tón `DayLight.tone` odmocninou (za bouřky tmavý, pruhy zůstanou vidět). Vír: trychtýř
    posunem textury (`uOffset`, 1,6 rad/s – ohnutá osa se neotáčí), prach otáčením meshí
    (2,6 / −1,1 rad/s). Stín nevrhá. **Při omezeném pohybu** se trychtýř nekreslí
    (`updateDisasters` ho skryje, `animate()` se vůbec nevolá) – zůstane ztmavení a stopa. Bez smrště
    meshe vypnuté a `animate` se nevolá – draw cally normálního dne beze změny. Stopa ve vsi
    (padlé kmeny, polehlá pole, rozmetané stohy, poškozené a zřícené stavby):
    [scene-village.md – Smršť](scene-village.md). Zvuk hukotu chybí (žádný CC0 záznam lokálně).
  - Bez pohromy jsou kroupy, pás, voda i bahno vypnuté – draw cally v normálním roce beze změny;
    v bouřce +3 (déšť, kroupy, pás), v povodni +1–2 (voda, bahno).
  - Vývojový náhled: přepínač **Počasí** (`dev-weather.ts`) – i „mokré žně – prší“ (vynucený
    déšť), u holomrazu oseté díly jako ozim, **krupobití** (pruh přes pole náhledu, vynucený den
    světa `setDisasterDay` – plná bouřka 0,4 dne) a **povodeň stoletá / tisíciletá** (2 / 3,5 m,
    první den); e2e `weather-scene.spec.ts` (jen s `WEATHER_DEV_URL`, vývojový server): sucho
    a déšť mění snímek, normální rok přesně stejný, draw cally bez deště stejné, s deštěm +1;
    krupobití tmavší (jas < 0,75 × normální) s kroupami a pásem v záběru, povodeň – voda nad
    políčky mění snímek.
  - Při omezeném pohybu kapky a kroupy stojí – po posunu kamery se přeskládají kolem nového cíle
    (`placeDrops` ve větvi pohybu kamery).

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
- **Vojsko, boj a mlha války** (war.md – Ve scéně; `army.ts`, `battle-fx.ts`, `fog-of-war.ts`
  čisté, kreslí `army-renderer.ts`): `LandscapeScene.setWar(SceneWar | null)` – poslední snímek
  boje po taktu (`sceneBattle(BattleState)` – `Pick<>` z `Fighter`, `BattleGroup`,
  `BattleBreach`), pochod (`sceneMarch` – muži a skupiny `CampaignState`), útěk vsi a odehnané
  stádo (`planFlight`, `fleeWalkAt` s `gone`, `drivenHerd` ve `villager-plan.ts`, `fleeFigures`
  v `refugee-march.ts` – kdo doběhl k hustému lesu, zmizel), mlha z pohledu strany
  a konec dne. Mezi takty se muži posouvají plynule v `animate()` (`battleFigures`, podíl
  `glideMs` – takty mezi snímky × `TICK_MS`, ale nejvýš 1,5× doba od předchozího snímku – po
  přestávce worker dopočítává a snímky chodí rychleji než takty – a nejvýš 15 s), pochod taky (`marchAt` – od
  nakresleného místa k novému snímku po dobu jeho taktů `SceneMarch.tick`, ve směru posunu; nová
  skupina a skok rychlejší než 12 m/s – jiná mapa – stojí rovnou); při omezeném pohybu stojí na
  posledním snímku. Postavy jsou `man.glb` /
  `woman.glb` (VAT jako lidé vsi, `createBakedFigure`) – zbraně z 0 A.D. už v klipech modelu
  (`walk-spear`, `spear-thrust`, `sword-strike` + `shield-block` se štítem, `bow-draw` /
  `bow-release`, licence `public/models/people/LICENSES.md`), muži rodu na koních (`ride`,
  `ride-trot`, kůň `horse.glb` jako dobytek – `createAnimalMesh`), hloučky po skupinách
  (`huddleSlots`, jezdci vpředu, ranění vzadu), ikona rozkazu nad středem skupiny (tři meshe
  `army-order-*`, natočené ke kameře, kreslí se přes vše). Prolamující má sekeru (`fell`), padlý
  leží tváří k zemi (matice instance) do konce dne (`fallenShown`), raněný sedí u domu (`sit`),
  utečený zmizí. Rány se poznají ze dvou snímků (jádro v taktu rány nastaví `cooldown` na plný
  interval a každý takt ho sníží – `strikeTicks`, `strikesOf`), i z taktů, které dotaz scény
  vynechal: poslední rána `full − cooldown` taktů zpět, dřívější téhož boje (stejný cíl už
  v předchozím snímku) po intervalu rány; začnou, až k nim dojde plynulý pohyb, z místa mezi
  snímky; jen z posledních taktů v délce posunu a nejvýš 240 ran ze snímku
  (`MAX_STRIKES_PER_SNAPSHOT` – dopočet po přestávce nezahltí scénu). Šíp letí obloukem (`arrowAt`, 45 m/s), srážka zvíří prach (`dustAt`).
  Opevnění z boje: `battleFortifications` – zavřená brána (`gatesClosed`), hotový průlom jako
  `breachedDay` úseku (vyvrácené kůly, rozsekaná brána – fortification-layout.ts). **Mlha
  války texturou:** mřížka 10 m (`createFog`, `revealFog` – dohled 150 m, z lesa a do lesa 50 m,
  objevené zůstane šeré), závoj je jeden přehozený mesh `fog-veil` (160 × 160 buněk, 2 m nad
  terénem) s průhledností z RGBA textury – žádný vertex buffer navíc (postava jich má právě 8);
  cizí muži mimo dohled se nekreslí. Stromy závojem prorůstají (návrh Clauda – závoj jen přes
  zem). Na cizí mapě výjezdu odkrývá závoj stopa rodu a okolí jezdců (`setJourneyFog`,
  journey.md – Scéna cizí mapy); ve scéně tažení stopa rodu přidá šeré k mlze války a dohled dává
  vojsko (jedna mlha – `updateFog`, Úloha 12b). **Draw cally** (`measure-scenery-culling.ts`): ukázka Bitva – 22 mužů (2 na koních),
  2 rozkazy, šípy, prach a mlha = **8 draw callů**, ≈ 123 k trojúhelníků (muž 3 102, kůň 1 666,
  závoj 51 k); bez války 0. Ukázka **Bitva** na `/dev/landscape` (`dev-battle.ts`) běží
  skutečným `battleTick` (palisáda 6 × 6 čtverců s branou na jihu, dvě skupiny útočníků proti
  mužům u domů), druhý krok útěk vsi, třetí útok na hradbu; e2e `e2e/battle-scene.spec.ts` (jen
  s `BATTLE_DEV_URL`). **Výjezd vojvody** (jezdci, praporek, hodiny, návštěvníci) kreslí tentýž
  renderer – journey.md – Scéna vsi. **Ve hře** (war.md – Ve scéně – napojení na hru): `VillageGame` (`useWarWatch`) předává
  `sceneWarOf(useWarScene(sídlo))` – válku na mapě sídla po mlze války ze serveru (napadená ves,
  vlastní vojsko); `setWar` zapíše na plátno `data-war-men` (počet mužů snímku, e2e).
- **Průvod uprchlíků a posel** (war.md – Varování, poslové a útěk do hradiště, Ve scéně; Ú14;
  `refugee-march.ts` čisté, kreslí `army-renderer.ts`): `SceneWar.alarm` (`SceneAlarm` – takt
  snímku, průvody `SceneRefugees`, poslové `SceneMessenger`; web `alarmOf`). Lidé vsi jdou hloučkem
  (`huddleSlots`, rozestup 1,9 m – návrh Clauda) oděvem vsi (`ARMY_LOOKS.folk`), dospělí vpředu,
  děti menší vzadu (`ArmyFigure.scale` – `CHILD_FIGURE_SCALE` 0,68), kdo nese zásoby, klipem
  `carry`; stádo za hloučkem (`drivenHerd` jako odehnané stádo, krávy – nejvýš `SCENE_HERD_MAX`);
  ukrytá skupina (`hidden`) se nekreslí a pohled ji neposílá, proto `SceneRefugees` nemá `moving`
  – průvod vždy jde (plán 2026-11-16-dense-forest – Úloha 7). Posel pěšky zrychlenou chůzí (`walk` × 1,9 – postava nemá klip
  běhu), na koni jako jezdec (`ride`, kůň, oděv muže rodu). Mezi snímky plynule (`alarmAt` – jako
  `marchAt`: posun ve směru posunu po `glideMs`, nový a skok přes mapu stojí rovnou); při
  omezeném pohybu stojí. Žádný nový mesh ani vertex buffer – tytéž instance postav a zvířat vojska.
  Scéna se zapne i bez vojska na mapě (`sceneWarOf`); `setWar` zapíše `data-war-refugees` (lidé
  průvodů + poslové, e2e). **Zatím ne:** vozy průvodu (`carts` jde v pohledu, ale `CartRenderer`
  patří scéně vsi – návrh Clauda: později).
- **Boj u hradby** (fortifications.md – Hradby a obrana, Ve scéně; plán hradeb Úloha 21; `army.ts`,
  `battle-fx.ts`, kreslí `army-renderer.ts`): `sceneBattle(b, walls)` nese žebříky (`ladders` –
  `BattleLadder`), lezce (`Fighter.climb` – fáze a zbývající takty), `onWall`, `underground`,
  nesený žebřík (`ladder`) a průlomy s `method`, `phase`, `moat` a podíly `fuel` / `fill`; `walls`
  (`battleWalls(forts, day)` – lomená čára úseku, stojící hradba z `crossingLayers` a výška valu)
  jednou za boj. **Výšky** (`WALL_STAND_M`, `LADDER_TOP_M`): obránce na ochozu stojí na fošnách
  (`WALKWAY.deckM` 2 m), na roštové a komorové na koruně (3 / 4 m), na valu navíc
  `RAMPART.heightM × výška valu` (`wallStandLift` – nejbližší čára hradby do 6 m); vrchol
  žebříku na špičkách kůlů (3,5 m), u roštové a komorové na předprsni (+1 m). **Lezec**
  (`climberPose`): jádro ho drží u paty a po fázi `up` na vrcholu – scéna ho zvedá po žebříku
  podílem fáze (v půli 5 m žebříku 2,5 m), nahoře stojí na koruně (na palisádě bez ochozu visí
  1,3 m pod špičkami), slézá dovnitř po vnitřním žebříku; přes plot jen přeskočí. Takty fáze
  plynule mezi snímky. **Žebříky** (`ladderPoses`, díly `ladder-5` / `ladder-7` ze
  `siege.glb` podle délky od paty k vrcholu): opřený, ležící u paty ven od hradby, opíraný se
  zvedá s fází `lean`, přetažený vnitřní a nesený na rameni (1,35 m, podél chůze); příčky napříč
  (natočení `atan2(−x, −z)` před nakloněním). **Klipy** (`fighterClip` + místo průlomu): sekat
  `fell`, zasypat / odkopat / podkopat `hoe`, nanosit otepi `carry-wood` a u paty `build`,
  přikládat `seed`; lezec v lese `fell`, nese `carry-wood`, opírá `pitch`, leze `build`, nahoře
  bojuje; hod z ochozu `spear-thrust`. Kopáč v podkopu (`underground`) se nekreslí. **Otepi**
  (`breachFagots`, díl `fagot`): nanosí se podle `fuel` – až 10 ve dvou vrstvách podél paty vně,
  leží, dokud hoří; **oheň** (`breachFires` – fáze `burn`) sprity ohně pálení paseky
  (`ClearingFireRenderer` s druhem `battle-fire`: hoří naplno, 6 ohňů × 16 spritů, hromada × 1,4
  podél hradby); **jáma podkopu** (`minePits`, `army-pit` – tmavý kotouč) roste do pětiny práce.
  **Hody** (`strikesOf`): z ochozu hod do 15 m (`THROW_TICKS`, kámen či oštěp střídavě,
  `army-stone`, `army-javelin`) a kámen k patě (do 3 m, místo srážky) letí 0,5 s
  (`THROW_FLIGHT_S`) po oblouku z výšky ochozu; souboj s lezcem na žebříku bez prachu. Šíp i hod
  letí k tomu, komu v taktu ubylo zdraví (cíl, nebo nejbližší zraněný do 8 m od cíle – kruh
  rozptylu ze serveru se nekreslí); nikomu – dopadne 2,5 m za cíl na zem (`miss`).
  **Opevnění** (`battleFortifications`): průlom ohněm nese `burnedDay` – ohořelé pahýly kůlů
  (`CHARRED_TINT`, ¼–½ výšky) a spadlá ohořelá vrata bez trámu (fortification-layout.ts);
  zasypávaný vodní příkop `moatFills` – pruh čerstvé hlíny 4 m od zasypávajících k hradbě,
  hladina zásypu stoupá ode dna podle `fill` (`moatFillMeshData`, fortification-renderer.ts).
  Ukázka **útok na hradbu** (`dev-battle.ts`): palisáda s ochozem, obránci se stanovišti po 5 m
  na jižní straně, skupina se žebříky (přinesla je – `Fighter.ladder`) a skupina s ohněm (dříví
  vsi 40 m před hradbou – `BattleField.fuel`); test `__tests__/dev-battle-walls.test.ts`.

- **Prémiové krajiny ve scéně** (landscape.md – Prémiové krajiny ve scéně): řeka jde stejnou
  cestou jako potok – `RenderSurface.stream` = `watersCenterline` (body osy potoka),
  `RenderSurface.river` = všechny řeky dohromady (`riverCenterline`, dotazy na koryto),
  `RenderSurface.rivers` = osa každé řeky zvlášť (`riverCenterlines` – stanice rákosu, leknínů,
  ryb a zvuk: `decorPlacements(l, stream, rivers)`, `fishSchools`, `AmbientEnvironment.rivers`),
  výšková síť přes `nearestWaterPair` s hlubším korytem řeky (`RIVER_DEPTH_M`). Shader hladiny počítá led jen při
  `seasonB.w > 0` (v létě stejný výsledek, voda o ≈ 45 % levnější – řeka ji nezdraží). Prvky
  typu kreslí `premium-sites.ts` (`PremiumSites`, v `setLandscape`) z čistých funkcí
  `premium-sites-layout.ts`: obtisky (`premiumDecals` – náplav, rudiště, hliniště, slanisko, lom,
  žíla, stružka, přístaviště, stezka `route`, zvěřní stezky, kaliště, místo úlů), dřevo a tůňky
  (`premiumProps` – molo a člun, kůly brodu, klátové úly na okraji lesa u brtí – `beeYard`, kůl na
  mohyle, tůňky), ozdoby z modelů dekorací (`premiumDecor` – mohyla v sedle, kamenný kruh na
  posvátné hoře, rákosí mokřadu; `DecorPlacement.group` `site` = vlastní mesh bez id), odstín skal
  (`premiumRockTint` – `ore` / `limestone`, meshe `decor-<model>-<skupina>`) a louky
  (`premiumMeadow` → 4. parametr `groundWeights`). Horský průsmyk: vnější svah hor dobíhá k terénu
  na okraji mapy už v generátoru (`sculptPass` v `premium/relief.ts`), scéna terén nemění;
  kamera se nezaboří do svahu (`cameraTerrainLift` v `camera-input.ts` – cíl se zvedne, kamera
  4 m nad terénem). Minimapa: `premiumMinimapMarks` / `drawMinimapPremium` (`PREMIUM_COLORS`).
  Průměrná krajina bit po bitu jako dřív (výšková síť, ozdoby, ryby, povrch, minimapa i snímky).
  Náhled `/dev/landscape?seed=42&premium=<typ>` – odkazy 19 typů a „průměrná“, pohled na hlavní
  prvek (`premiumFocus` – kamera od vsi k prvku, `moveCameraTo(x, z, radius, alpha)`), tlačítka
  **Prvek** a **Obrysy prvků** (`app/dev/landscape/dev-premium.ts`).
  Výběr prvku kliknutím: `pickPremiumSite` (`premium-picking.ts`) v `pickTarget` až po
  `pickVillageTarget` (nic ze vsi pod kurzorem) – cíl `premium-site` (typ, druh, pořadí prvku),
  obrys výběru nekreslí (web-ui.md – Prémiová krajina v rozhraní).

- **Řeky kostry světa ve scéně** (landscape.md – Kostra světa na mapě): voda, koryto, břehy
  a hladina berou všechny toky přes osu vod (`watersCenterline`, `riverCenterline` – hlavní tok,
  přítoky, potok), stanice podél vody jdou po každé řece zvlášť (`RenderSurface.rivers`): k-tá
  řeka má čísla stanic od (k + 1) × `RIVER_STATION_BASE` (rákos, lekníny, ryby – vlastní los),
  zvuk vody bere nejhlasitější tok. Řeka prémie 1 je jediná řeka – ozdoby, ryby i zvuk jako dřív.
  Ústí: přítok končí v ose hlavního toku a potok mapy ve vodě řeky na její hladině (generátor –
  `planMapStream`, konec osy potoka se prodlouží o políčko do řeky), hladina je bez schodu; konce
  řeky kostry uvnitř mapy (pramen, ústí přítoku) se neprodlužují (`edgeEnds`). Proud hladiny
  v soutoku (`flowSampleAt`, `stream-geometry.ts`; `water.ts`): přítok končí v ose hlavního toku,
  takže nejbližší tok se uvnitř řeky střídá a hladina by ukázala šev, kde se náhle mění směr
  proudu – na mapě s víc řekami proto směr, rychlost a tůň řek prolíná: hlavní tok (první řeka)
  přebírá proud ve své vodě, v pásu `CONFLUENCE_BLEND_M` (14 m) od svého břehu plynule, další
  řeka ve své, zbytek měkce bližší řeka; voda potoka a mapa s jednou řekou beze změny (test
  `skeleton-water.test.ts` – kolem ústí se směr mezi body 2 m od sebe nezlomí o 20° a víc). Náhled
  `/dev/landscape?skeleton=straight|corner|junction|source|trail|ford|crossroads` (výřezy jako
  testy pásma kostry, `app/dev/landscape/dev-skeleton.ts`; s výřezem jen prémie na svém místě
  kostry – `premium: 2`, seed bez přijatého pokusu = krajina přesně ze seedu): překryv trasy
  stezky kostry (`skeletonOverlay` – úseky `skeletonFeaturesOf(l).route` a kroužky brodů,
  tlačítko **Stezka kostry**, zapnuté; prvek prémie `route` na kostře táž čára – `premiumOverlay`
  ho nekreslí), pohled na místo kostry (`skeletonFocus` – brod trasy, ústí přítoku, pramen;
  tlačítko **Místo kostry**). E2e `e2e/skeleton-scene.spec.ts` (jen s `SKELETON_SCENE_DEV_URL`,
  `SKELETON_SCENE_SHOTS` = snímky): každý výřez se načte bez chyby konzole.
