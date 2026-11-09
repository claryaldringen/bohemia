# Ves – pěšiny, cesty, vozová síť

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: paths.md, roads.md, wagons.md v `docs/design/`.

- **Vyšlapané pěšiny** ([docs/design/paths.md](../design/paths.md), Martin 18. 10. 2026 –
  i práce): síť počítá herní jádro `domain/village/paths/` stejně na serveru i v prohlížeči
  (soubory jsou v deterministické vrstvě – ESLint zakazuje Math.sin/cos/hypot/log, `**`; jen
  det-math). `terrain.ts` (cena chůze po bodech mřížky ≈ 3,75 m z krajiny: bilineární výška,
  sklon, voda a brody z osy potoka, les; `pathTerrainOf` – výřez z mezipaměti podle krajiny,
  nezávisí na jejím stavu; `withObstacles` – kmeny, keře, balvany, výchozy), `network.ts` (dělí se na `network-*.ts`)
  (`computePathNetwork(PathVillage)` – cesty domácností pro vodu a dřevo každá zvlášť s napojením
  na pěšinu souseda – **pro vodu vždy k nejbližší vodě v okně, bez meze a naplno** (0,4 cesty na
  člověka – `WATER_FETCHING`; dřevo nejvýš 450 m a za 130 m řidčeji – `nearCost`; okno sítě
  `villagePathBounds` sahá k nejbližší vodě – `nearestWaterTiles`, jen k ní, ± 45 m, do 1 000 m), do cílů podle práce dne + základ zavedených míst, k sousedům – **„pole z domu“**
  (8. 11. 2026, `routeAllSteps` v `network-search.ts`): domácnosti po sobě v pořadí
  `householdOrder` (součet cest za den před prvním kolem, návštěva sousedů oběma, shoda → nižší
  index), každá **jedno Dijkstrovo hledání z brány ke všem svým cílům** (`routeHome` – konec =
  nejlevnější buňka cíle, shoda → vyšší index, rozhodne se po vyjmutí všech buněk té ceny;
  pochůzka bere i pěšinu souseda `ErrandTrail` do `GOAL_SLACK` 1,3×), pak se všechny její trasy
  vyšlapou (`addTrip` / `addErrand`) – další se přidá k čerstvě vyšlapaným pěšinám, souběžné pěšiny
  nevzniknou; cíle v jiné souvislé oblasti než brána (`passableAreas`, 4-okolí) se předem vyřadí;
  bez A*; 2 kola,
  vyšlapané buňky hned zlevní; buňky pod pevnou cestou (`PathVillage.roads`, maska `roadMask`) od
  začátku jako plná pěšina – trasy se k ní stahují – a **bez ohledu na povrch** (Martin, 19. 10.
  2026; `roadCellCost` = 1 / rychlost cesty podle stupně a mokřiny, pěšina dne ji nezrychlí –
  `Grid.plain`: díl pole v jakémkoli stadiu, sad, les vsi i krajiny,
  svah a překážky krajiny se pod cestou nepočítají; brod a neprůchodné buňky zůstávají, ploty
  hřbitova a ohrady, okrsek svatyně a stavby taky – roads.md, Cesta je cesta); ohrady (`pens` –
  plot jako hřbitov, krmení jako cíl) a stáda na pastvě (`livestock` → `pastureHerds`, cesta na
  stádo denně na úhor; ze stavu `pastureLivestock` jako `SceneVillage.livestock`); cena buňky pole
  podle nejbližšího dílu přes přihrádky políček (`nearest.ts` – bit po bitu jako průchod všemi
  díly, zlatý otisk sítě v `paths-nearest.test.ts`) – **rychlosti chůze** (Martin, 19. 10. 2026:
  „berme louku za výchozí: 1 vyšlapaná denní cesta 1.3 stálá vyšlapaná cesta 1.5. Pole, které
  zrovna neleží ladem: 0.5. Upravená cesta: 1.7“, strniště 0,8; „nejkratší cesta je ta
  nejrychlejší“ – mění dřívější „pole lidi nezdržuje“): cena buňky = 1 / rychlost z `walk-speed.ts`
  (`partWalkSpeed` podle vzhledu dílu `look` jako scéna – v osevu 0,5, strniště 0,8, úhor
  a zakládaný díl 1; mokřina 0,5 – nejpomalejší platí; `pathCostFactor` – plná pěšina 1 / 1,3,
  přes osev pěšina nezrychlí; `roadWalkSpeed`), čísla `PATH_WALK`, `FIELD_WALK`, `ROAD_WALK`;
  křoviny a mladý les dražší (`OVERGROWN_COST`); pole není zákaz – přes osev se jde, když je
  obcházení delší; vůz jede po poli stálou cenou (`CART_SPEED.field`, v každém stadiu – paths.md,
  Stálé trasy) a úrodu nepošlape;
  síla `pathStrength` (odmocnina provozu), stáří obydlí →
  `pathAgeFactor`; vyhlazené čáry se sílou a stářím v bodech, provoz po buňkách `traffic.raw`;
  `annual: true` = roční provoz; provoz ke stavbám `visits` – opuštěné stavby, abandonment.md;
  `PathVillage` splňuje `SceneVillage`), **vchody staveb** `entrances.ts` (Martin, 19. 10. 2026:
  „každá budova by měla mít nějaký vchod, od kterého cesta povede“ – paths.md, Vchody: jedna
  funkce pro síť i scénu – `cemeteryEntrance` branka hřbitova, `penEntrance` branka ohrady,
  `sacredEntrance` předek modly a svatyně; k hotové stavbě vede pěšina k vchodu, staveniště ze
  všech stran; obydlí bránou `gateOf` (pro kontrolu umístění `dwellingGatePoint`), brána v cizím
  pozemku → nejbližší volné místo do 7,5 m kolem obydlí `gateAround` (jinak by domácnost vypadla
  ze sítě); **nové obydlí brankou do cizího pozemku nesmí** (Martin 19. 10. 2026 – `gateProblem`
  v `placement.ts`: obydlí a pozemky i dvůr dvorce, modla, svatyně, hřbitov, ohrada, voda; opačně
  `blocksGate` v `checkFootprintFree` a u hřbitova – „Zatarasí sousedům branku.“; platí
  i pro `relocationPlot`, přestěhování a `freeVillageSite`); konstanty pleteného plotu `WOVEN_FENCE_CORNER_M`,
  `CEMETERY_GATE`, `PEN_GATE`, `FENCE_INSET_M` bere scéna odsud; `PathVillage.cemeteries` nese
  `built` a čtverce `pending`), `walking.ts` (`walkGraph`, `walkingDistances` – vzdálenost chůze se
  stejnými rychlostmi jako síť, rovně i přes pole – `withFieldWalk` z `PathVillage.fields`, nikdy
  víc než rovně – čistá funkce pro každého, kdo měří cestu na pole)
  a `village.ts` (`pathVillageOf` ze stavu vsi jako scéna i s pevnými cestami, `refreshWalkDistances`
  – den po dni v `simulateDay` při změně `walkLayoutKey` (i pevné cesty), jen s krajinou;
  **stadia dílů, rychlost chůze přes ně (osev, strniště) a pastva úhoru (`walkStageKey`) se do klíče promítají jen 1. dne v měsíci**
  (Martin, 18. 10. 2026 – osev postupuje po dílech a síť se přepočítávala každých pár dní; otisk
  stadií z posledního 1. dne je ve stavu `walkStages`), strukturální změny hned; ve stavu jen
  otisky `walkLayoutHash`; `villagePathNetwork` si pamatuje poslední síť po krajinách (otisk `pathVillageOf`) –
  seč luk ve stejný den po přepočtu chůze síť nepočítá znovu →
  `FieldPart.walkDistanceM`, práce přes `partWalkDistance` v `year-plan.ts` (`partWork`, `partWeight`),
  `field-progress.ts` a seči `hay.ts`).
  **Úloha 4a – pěšiny z tras:** čáry obtisku a pás pod nimi dává `routePaths(SceneVillage.routes.list,
decodeWear(wear.cells), pathCellM)` (`path-renderer.ts`, `updateRouteLines`), přestaví se jen při
  změně `routes.key` / `wear.day` (síť pro `paths()` a teplotní mapu se dál počítá z
  `pathNetworkKey`, postavy po trasách přijdou v 4b); bez tras nebo bez vyšlapanosti (stará ves bez `state.roads`, zahozená data; `routeLinesOf`) i na vývojové stránce (`app/dev/landscape`, trasy nedostává) čáry sítě.
  Pěšiny dne nemají kruhové plácky (`dayPathRibbons` / `dayPathTrack` v `path-ribbon.ts`).
  **Data jen při změně:** `lib/scene-routes.ts` – dotaz na ves nese `routesKey` a `wearDay`,
  server (`trimKnown` v `app/game/actions.ts`) při shodě pošle `routes.list` / `wear.cells` jako
  `null`, klient (`keepSceneData` v `applyVillage`) doplní z posledního pohledu; akce vracejí vše. Když klient data nemá z čeho doplnit (`lostSceneData`), uloží pohled bez `stamp` a další dotaz pošle plný pohled hned. `trimKnown` ořezává jen pohled vsi, na kterou se klient ptal (`result.id`). Klíč vyšlapanosti je `wear.day` (`settleWear` posouvá den vždy; změna `cells` ve stejný den by potřebovala `rev`).
  Scéna `path-renderer.ts` (`VillagePaths` v `LandscapeScene`: přepočet jen při změně
  `pathNetworkKey`, odloženě; výpočet sítě, obtisky a pás pod nimi v polích jdou ve třech
  úlohách – mezi ně se vejde snímek pohybu kamery) – obtisky `paths-worn` / `paths-earth` z `path-ribbon.ts` **nad**
  obtisky polí a vsi (alphaIndex 3 / 3,5, lift 0,05 / 0,055, zOffset −3,5 / −4; přes osetý díl
  úzká stopa; v pevné cestě se pěšina dne ztrácí – `roadFade`; křižovatka pevných cest je udusaný obrys
  `junctionShape` (Úloha 12 – viz Křižovatky níž; kruhy `roadJunctions` zmizely), pěšiny dne
  plácek nemají). **Pěšina dne
  je nevýrazná** (Martin, 19. 10. 2026: „denní pěšina ať je nevýrazná“): vrstvy `PATH_WORN_LAYER`
  / `PATH_EARTH_LAYER` – slabě prošlapaná tráva 0,6–1,2 m, krytí 0,2–0,45, holá hlína jen u silné
  pěšiny, úzká a slabá, rozcestí jen jemně (`RibbonLayer.junction`); pevná cesta (`ROAD_*`) je vedle
  ní jasně výraznější. Sníh přes `applySeasonGround` – materiály pěšin a cest zvlášť
  (`decalMaterial(group, kind)`, `SNOW`: pěšina dne 0,3, ať stopa ve sněhu trochu prosvítá, cesta
  0,55). Pěšiny dne stromy nemají (stromy jsou jen u pevných cest – níž).
  Postavy (paths.md – Odhad vzdáleností, kudy chodí postavy ve scéně): `path-router.ts` –
  `routeWalker(routes, cellM, { lines, roads, ground })`: `route` = uložená trasa od brány domu
  k cíli nebo obráceně (osa z `routeLine`, tempo `PATH_WALK`, do 30 m od obou konců); `network`
  a `walkLength` = trasa chodce a její cena z jádra (`walkingRoute` v `paths/walking.ts` – týž
  model jako `walkingDistances` simulace, zpětné sledování předchůdců, Dijkstra končí u ceny
  rovně) nad grafem `walkGraph(pěšiny stálých tras se silou z vyšlapanosti – routeLinesOf, pevné
cesty, půda)`; graf a půda (`walkGroundOf` + `withFieldWalk` – pole v `VillagePaths.walkGround`
  v paměti podle dílů a jejich ceny) se staví až při prvním dotazu, dotazy v paměti (4 000).
  `VillagePaths` staví chodce při změně klíče tras, dne vyšlapanosti nebo `roadsKey`; bez tras
  `paths()` = null a postavy jdou krátkým pohybem. `walkRoute` (`villager-plan-geometry.ts`):
  uložená trasa, když je nejvýš o `STORED_ROUTE_SLACK` (10 %) delší než odhad → `network`
  (`pathRouteOk`) → rovně kolem domů (`straightRoute`) → uložená delší → `network`
  (`trafficRouteOk`) → null; `route(points, pace)` – `shuttle` jde po pěšině a cestě rychleji
  (tempo úseku = délka ÷ cena, oříznuté na 0,4–`WALK_PACE_MAX` 1,3; `walkLength` = součet délka ÷
  tempo – délka chůze rozvrhu, po nakreslené trase nikdy rychleji než 1,3×; `scheduledWalk`
  ve `villager-plan.ts` trasu rozvrhu delší než 1,3 × délka chůze zahodí – rovně; délku chůze
  rozvrhu dává `scheduledLength` – odhad simulace, ale když schůdná trasa `walkRoute` je delší než
  1,3 × odhad, její délka – cíl hned za domem, roh domu; `planVillagersWithCrew().length` v paměti
  dne, `Timetable.setEstimate` ve `villagers.ts`). Testy `walk-network.test.ts`,
  `paths-walking.test.ts` (`walkingRoute`). Vývojová stránka: tlačítka
  **Pěšiny**, **Cesta** (ukázka pevné cesty se stromy v každém stadiu – `dev-road.ts`), **Provoz**
  (teplotní mapa) a **Stáří**.
  - **Zvyk a ploty** (Úloha 2 nového systému cest, `WALK_VERSION` `routes-v2`): `ROUTE_HABIT.offRoad`
    (`rules-roads.ts`) – `trodden` v `network-search.ts` zdraží nevyšlapané místo o 25 % jen pro výběr
    trasy (pod pevnou cestou a osevem 0; čas chůze zůstává skutečný). Hotová ohrada a hřbitov jsou
    v `villageGrid` neprůchodné přes `fencedCells` (stejná funkce jako u vozů, ulička 3 m zůstává),
    vstup jen buňkami branky (`gateCells` kolem `penSquaresEntrance` / `cemeteryEntrance`); hotová
    svatyně je neprůchodná celou plochou `footprintM` (30 m, ne jen příkop – uvnitř stojí modla
    a obětiny) kromě vchodu. Staveniště (rozestavěná ohrada, hřbitov i jeho rozšíření `pending`,
    svatyně) je průchodné: `PEN_COST` / `CEMETERY_COST` / `SHRINE_SITE_COST`. Branka odemyká jen
    buňky vlastního plotu.
    Martin 22. 10. 2026 (#3): „Lidi nesmí chodit přes ohrady. Vždyť jsou oplocené.“
  - **Odstup od plotu** ([paths.md – Odstup od plotu](../design/paths.md#odstup-od-plotu-26-10-2026),
    `FENCE_CLEARANCE` v `rules-roads.ts`, `WALK_VERSION` `routes-v5`): `fenceOutline(squares, inset)`
    v `entrances.ts` – plot ve světě z `outlineRuns` (úsek nese `endInner`): rovné úseky, čtvrtkruhy
    rohů (`WOVEN_FENCE_CORNER_M`), obdélník a `inside` (ostré rohy, čtverec `inset` kolem bodu ve
    sjednocení); `fenceDistance` – k úsekům a obloukům (jen v úhlu čtvrtkruhu). `paths/fences.ts`:
    `villageFences(v, plots)` – hotové hřbitovy (bez `pending`), hotové ohrady (`penPathSquares`)
    s brankou, s `plots` i pozemky hotových obydlí (ne staveniště) (`FENCE_INSET_M`, dvorec i s dvorem); `fenceClearance`.
    `villageGrid` → `fenceBand(grid, gridFences(grid, v), passable)` v `network-grid.ts` (po plotech
    a ohradách, ne pozemcích – ty jsou celé neprůchodné jako stavba; tentýž výpočet bere mřížka
    vozové cesty `wagonRoadGrid`; vrací `blocked` a `near`): střed uvnitř plotu → Infinity, do `axisM` → Infinity jen s aspoň třemi průchodnými sousedy mimo pruh (úzký průchod zůstane dražší; volá se až po stavbách na konci `villageGrid`), do `nearM` → × `nearCost` (ne pod
    pevnou cestou), buňky branky všech plotů (`entranceCells`) nic, buňka do `alleyM` od dvou plotů (ulička) jen
    dražší. Projeví se i ve `villageBlockedAt` (ohyb do branky). `routeLine(route, cellM, fences)`
    (`routes.ts`): když vyhlazená osa jde k plotu blíž než `axisM` (vzorky po 0,5 m, mimo `gateM` od
    konců), podrží nejbližší vnitřní střed buňky do dvou buněk a vyhladí kusy mezi podrženými zvlášť
    (`smoothPinned`, nejvýš 12 bodů); trasa bez plotu v dosahu dá tutéž osu bit po bitu. Ploty dodá
    `fencesOf` v `roads.ts` (obrysy líně z `pathVillageOf`; mezipaměť čar `monthRoutes` ověřuje kromě sady tras i
    `fenceLayoutKey` – čáry nezávisí na tom, kdy se spočtou) do `monthRoutes` a přes `GateGuard.fences`
    (`gateGuardOf`) do `accessRoads` / `accessDue` / `gateBend`. Scéna (`path-router.ts`) a čáry
    `routePaths` ploty nehlídají. Testy `fence-clearance.test.ts`.

- **Pevné cesty a stromy u nich** ([docs/design/roads.md](../design/roads.md) – fáze 1; výběr,
  vylepšení a chůze podle stupně = fáze 2, jabloně = fáze 3): simulace vsi (server) – modul
  `domain/village/paths/roads.ts` + `roads-<téma>.ts` (deterministická vrstva jako pěšiny), z `simulateDay` jediné
  volání `roadsDay` na konci dne (jen s krajinou; bez ní – kalibrace – žádné cesty). Stav
  `VillageState.roads` (volitelný – starší vsi začnou sčítat při prvním dopočtu): úseky `Road`
  (id, osa na cm, den vzniku, stupeň `RoadGrade` – zatím jen `trodden`, provoz posledních 5 let,
  místa na stromy `spots` určená jednou při vzniku), stromy `RoadTree` (id od `ROAD_TREE_ID_BASE`
  nad id vrstvy překážek, místo, poloha, druh, den uchycení a smrti), příznak `v2` (ves převedená
  `withRoadsV2`) a práce roku cest
  po místech `labor` (od 1. 11., z rozdělení práce dne). Roční
  kontrola 1. 11. (`updateRoads`; roční síť pěšin se od Úlohy 6 nepočítá, terén dává `annualTerrain`):
  provoz cest z provozního pole uložených tras (`fieldTraffic` – medián `trafficAt` po ose, `TrafficOf`)
  (zarůstání je od Úlohy 7 měsíční – `road-condition.ts`, `roads-overgrow.ts`, bod **Stav cest**
  níž) → (cesty pěších roční kontrola nezakládá –
  vznikají měsíčně z vyšlapanosti, bod Vznik cest z vyšlapanosti níž; konec nové cesty se připojí
  k pevné cestě a ta se v rozcestí rozdělí – `splitRoad`, osa se jinak nikdy nemění) → **falešná rozcestí** (uzel jen se dvěma úseky stejného stupně, bez
  rozdílného vylepšení) se spojí (`mergeRoadChains` – i po dokončení vylepšení ve
  `finishConstructions`, starší vsi při načtení `withMergedRoads` v `updateVillage`; id a den
  vzniku staršího, roads.md – Úseky a rozcestí; dva úseky mezi stejnými uzly do okruhu ne,
  nejrovnější pokračování první) → **souběžné cesty** (do 12 m stejným směrem) se sloučí (`mergeParallelRoads` – kus
  slabší cesty souběžný aspoň 25 m se vyřízne; vozová jen se souběžnou silnější vozovou a jen když
  konec, který by zmizel, leží do `WAGON_MERGE.endM` od osy silnější vozové – `wagonCutKeepsEnds`;
  u vozové jsou silnější i partner jen úseky mimo stavby (`roadsInWork`) – rozestavěná vozová ne,
  paths.md – Zdvojená vozová cesta; zemní práce vyříznutého kusu zůstanou terénem), `removeBraids` – copánek přes 1–2 mezilehlé uzly
  (`ringBraid`, jen se stavbami vsi `SpotContext.buildings` – níž) a copánek mezi stejnými uzly do
  25 m: zmizí oklika; vše v `tidyRoads`) → **díry** (volný konec do 12 m od jiného
  úseku, který není u konce trasy roční sítě – brány, cíle) se napojí (`joinRoadGaps`, starší
  vsi jednou při načtení `withRoadsV2`) a určí se skutečné volné
  konce `Road.openEnds` (jen tam se pás cesty ve scéně vytrácí; pěšina dne se za koncem úseku
  neskrývá – `roadFade`) → místa na stromy (`roadTreeSpots`, `plantingBlocker` – ne ve vsi, na
  čtvercích staveb (pole ano – Pole jako krajina), v lese, ve vodě, u překážek krajiny) → konec pařezů a stromy odstraněné stavbou →
  uchycení (10 % ročně, los ze seedu vsi, roku a místa). Čísla v `rules*.ts` (`ROADS`,
  `ROAD_TREES`). Stadium stromu jen ze dne (`road-trees.ts`: `roadTreeLook` – keř, strom
  s velikostí, souš, pařez; `roadTreeObstacleKind`). **Strom u cesty je překážka stavby:**
  `obstacleChangesAt` ho dá do `ObstacleChanges.added`, `obstacleStatus(...).addedIn` a tally
  funkce (`cellObstacles`, `polygonObstacles`, `polygonsObstacles`) ho počítají jako překážky
  vrstvy (dospělý strom od 20 let dá kládu, mladší je mladý stromek) – stejná cena u kurzoru
  v prohlížeči (`placementVillageFromScene` bere `scene.obstacles`) i na serveru; odstraněný se
  zapíše do `clearedObstacles`. Na dřevo se nekácí (nejsou ve vrstvě – `nearestMatureTrees` je
  nevidí). Kronika `road-formed`, `road-overgrown`. Web: `SceneVillage.roads` (`SceneRoad`)
  a `roadTrees` (`SceneRoadTree` – stadium a velikost po dvacetinách z `sceneRoadTrees`), typy
  odvozené z jádra. Scéna `path-renderer.ts`: pevné cesty z dat (`roadBands` v
  `road-works-layout.ts` – plně vyšlapaný pás `roads-worn` / `roads-earth`, vrstvy `ROAD_WORN_LAYER`
  / `ROAD_EARTH_LAYER` v `path-ribbon.ts` – vzhled jako dřív silná pěšina, Martin 19. 10. 2026:
  „Vyšlapanou cestu nechme jako teď“; volný konec se vytrácí, přestaví se jen při změně
  `roadsKey`), stromy z dat (`path-trees.ts`: `roadsideInstance` – keř `shrub-*`
  z dekorací, strom podle druhu z `ROAD_TREE_MODELS`, souš `snag-*` / `snag-oak`, pařez `stump`;
  meshe `pathside-<model>` – roční období a stíny jako stromy krajiny; přestaví se jen při změně
  `roadTreesKey`).

- **Vznik cest z vyšlapanosti** (nový systém cest, Úloha 5; [paths.md – Vyšlapanost a vznik
  cesty](../design/paths.md#vyšlapanost-a-vznik-cesty), Síť – kotvy, Stavba přes cestu; Martin, #6):
  `roadsMonth` (`paths/roads.ts`) volá simulace **1. dne v měsíci na začátku dne** (před
  `roadFieldsDay` a přepočtem tras) – sečte vyšlapanost (`settleVillageWear`), z čar uložených tras
  (`routeLine`, nejsilnější trasa napřed, stálé pořadí; čáry a kotvy drží `monthRoutes` v paměti
  podle `routes.key`) založí cesty a po vzniku uklidí síť – **nad kopií stavu** (`formRoadsKept`:
  `formWearRuns` + `tidyRoads` nad kopií cest, `roadIds` staveb a kusů zemských stezek). Stav se
  změní, jen když každá nová cesta úklid přežije (`survivedTidy` – po jejích bodech mimo dřívější
  cesty vede po úklidu cesta aspoň `ON_ROAD_M`); kus, jehož cestu úklid smazal (objížďka souběžná se
  starší cestou), se v dalším kole (nejvýš `FORM_ROUNDS`) vynechá – smazaná cesta nerozdělí cizí
  cesty, nezmění jejich id, místa na stromy, stavby ani `nextId` (recenze Ú5, I1). **Smazané kusy**
  (oprava 31. 10. 2026 – paths.md): klíč kusu je poloha konců na 1 m (`wearRunKey`), smazané kusy
  jdou do `VillageRoads.lostRuns` (seřazeně, `rememberLostRuns`) a `formRoadsKept` je vynechá od
  prvního kola; `wearRoadDue` taky – s pamětí projde všechny kusy a zapíše, které jsou dál
  vyšlapané, ostatní ves zapomene (test `road-form-wear.test.ts`). Levná kontrola
  `wearRoadDue` napřed: bez kusu, ze kterého by cesta vznikla, se kontext míst na stromy ani kopie
  nestaví a úklid neběží. Konce tras pro úklid jsou kotvy (`anchorTermini` – dosah kotvy a kraj
  mapy jako `nearAnchor`, nebo do 6 m). `formRoad` napřed spočítá osu bez rozdělení
  (`plannedAxis`, `joinTarget`) – krátká cesta nic nerozdělí. Kronika `road-formed` jen pro cesty,
  jejichž id úklid nepohltil. `formWearRuns` (`formRoadsFromWear` je obálka pro testy): body čáry po
  `SAMPLE_M`, vyšlapanost `wearAt`; kus od `WEAR.roadAt` dál než `ON_ROAD_M` od pevné cesty se
  prodlouží po čáře oběma směry, dokud je aspoň `WEAR.extendFrom`; vznikne jen, když je každý konec
  u kotvy (`nearAnchor`) nebo u pevné cesty (připojí se do `ATTACH_M` – `joinPoint`, rozcestí
  `splitRoad`), jinak počká na další měsíc; kratší než `MIN_ROAD_M` nic (`formRoad`). Provoz nové
  cesty z provozního pole tras (`fieldTraffic` – medián `trafficAt`). Kotvy `paths/road-anchors.ts`:
  `roadAnchors(routes, landscape)` – začátek trasy (brána domu) vchod, konec podle cíle
  (`anchorKindOf`: `edge:*` kraj mapy, voda, dřevo, pastva, pole, sad, louka… cíl, stavby se vchodem
  – `d`, `cemetery`, `pen`, `threshing-floor`, `idol`, `shrine`… – vchod), dosah `ROAD_ANCHORS`
  (vchod 3 m, cíl 7,5 m; kraj mapy = pás `EDGE_MARGIN_M` + `TRAIL.edgeBandM` + 7,5 m od okraje, `nearAnchor`, směr `edgeDirectionAt`; `RoadAnchor.place` – klíč trasy pro konce cesty v panelu, `paths/road-ends.ts` – [web-ui.md – Konce cesty](web-ui.md#konce-cesty-v-panelu-cesty)). Roční kandidáti (`formRoads`, `hotRuns`, `MATCH_M` u pěších)
  zrušeni. **Stavba přes cestu:** objížďka dál než 5 m od staré osy se po vyšlapání stane cestou
  napojenou rozcestími na zbytky staré cesty (test `road-form-wear.test.ts`); kus pod stavbou zatím
  zůstává a úklid ho bere jako starší (silnější) – objížďku souběžnou s ním (Vlkov – polozemnice)
  by pohltil, takže se nezaloží (`formRoadsKept`), dokud ho Úloha 7 nevyřadí ze sítě. `road-report.ts` vypisuje i `vzniklo` (kronika) a nová id úseků. Testy
  `road-form-wear.test.ts`, `roads.test.ts` (1. 11. nezakládá, dopočet po kouscích).

- **Úklid sítě – pahýly a cesty k vchodům** (nový systém cest, Úloha 8; [paths.md – Síť – kotvy,
  pahýly a úklid](../design/paths.md#síť--kotvy-pahýly-a-úklid-pravidlo-11) a
  [Vchody](../design/paths.md#vchody); Martin 22. 10. 2026, pravidla 10 a 11): `roadsMonth` po
  zániku kusů a vzniku z vyšlapanosti pustí `tidyMonth` – jen když se od posledního úklidu změnily
  osy úseků (`VillageRoads.tidyKey`, otisk FNV-1a `networkKey`), nebo nové kotvy a trasy dají práci
  (`tidyDue` – okruh, díra, pahýl, copánek přes křižovatku `hasRingBraid`; `accessDue` – vchod bez cesty, počítá tutéž cestu jako `accessRoads` přes `accessPlan`, takže vchod bez možné cesty úklid nespouští); jinak nic, ani kontext míst na
  stromy (čítač `TIDY_RUNS` pro testy). Ploty pro osy tras (`fencesOf`), stavby pro copánek
  (`ringBuildingsOf`), vchody (`entrancesOf`) a stavby s ploty pro ohyb ramene (`footprintOf`) bere
  měsíční kontrola i `tidyRoadsNow` z jedné vsi pro pěšiny (`monthLayoutOf` – `pathVillageOf` líně
  a jednou, dřív až čtyřikrát za měsíc); zánik, vznik a úklid cest stavby, pozemky ani ploty
  nemění, takže je jedno, kdo ji spočte první (jen zrychlení, výsledek týž). Pořadí: `tidyRoads` s kotvami a čarami tras (`StubNetwork`):
  okruh přes jeden uzel se rozdělí v nejvzdálenějším bodě (`splitLoops`, `roads-stubs.ts`) →
  souběžné → díry (`joinRoadGaps` už nespojí konec zpět do uzlu, ze kterého úsek vychází – vznikal
  okruh tam a zpět) → copánky (mezi týmiž uzly, pak **přes křižovatku** – `ringBraid`: slabší úsek
  A–B, druhá větev přes 1–2 uzly jen ze silnějších úseků, `staysNear` 25 m, okruh do 150 m a uvnitř
  žádná stavba ani pozemek (`maxInside` 0, Martin 26. 10.) – `ringBuildingPoints` z `pathVillageOf` (`RingBuilding` = body jedné stavby,
  u pozemků středy a rohy čtverců; uvnitř je, když je uvnitř kterýkoli), líně přes `ringBuildingsOf`
  v `roads.ts`, `insideRing` sudý počet průsečíků; úsek, který je jediným přístupem k vchodu
  (`soleAccess`, vchody z `entrancesOf` → `SpotContext.entrances`, do `ROAD_ANCHORS.entranceM`),
  se nezruší; `ROAD_BRAID_RING`, paths.md – Copánek přes
  křižovatku; starší ves bez převodu – `tidyDue` ho najde i v síti beze změny) → spojení → **pahýly** (`trimStubs`: konec vyšlapaného úseku mimo kotvu a mimo jinou cestu zmizí bez ohledu na délku
  – nejbližší úklid, ne až zarůstání; upravená cesta zmizí jen kratší než `MIN_ROAD_M` a jinak zarůstá
  podle `ROAD_DECAY`, vozová, rozestavěná a zemská stezka se nemění) → **cesty k vchodům** (`accessRoads`, `roads-access.ts`: stavba s trasou s provozem
  stavby – `StoredRoute.visit` – do vchodu, hotová – rozestavěný hřbitov ne; když u vchodu do 3 m
  nekončí ani nevede živá cesta, vznikne vyšlapaná cesta po nejvytíženější trase od vchodu k první
  pevné cestě do `ATTACH_M` – rozcestí –, nejméně `ROAD_ACCESS.minM`; kronika `road-formed`;
  nezarůstá, dokud končí ve vchodu – `settleRoadCondition`). `formRoad` má volitelnou nejkratší
  osu. `road-report.ts` počítá jen živé úseky (opuštěné zvlášť) a vypisuje i konce mimo kotvu,
  souběžné páry a vchody bez cesty; hlavní metrika je „konce mimo kotvu“ (s polohou), „pahýly < 30 m“ je jen vedlejší (paths.md). Testy
  `road-stubs.test.ts` (pahýl 10 m, pahýl 50 m zmizí a upravený zůstane, kraj mapy jako kotva, malý okruh, vozová pohltí souběžnou, fixtura Vlkova,
  hřbitov – cesta do branky, 12 měsíců bez změny tras bez úklidu a bez nových id),
  `road-detour.test.ts` (napojení objížďky po úklidu, `nextId`).

- **Křižovatky** (nový systém cest, Úloha 9a – čisté funkce; [paths.md –
  Křižovatky](../design/paths.md#křižovatky-pravidlo-9); Martin 22. 10. 2026, pravidla 9 a 11):
  `paths/junctions.ts`, čísla `JUNCTION` (`rules-roads.ts`), data `RoadJunction` a volitelné
  `VillageRoads.junctions` (`types-roads.ts` – tvar `cross` / `y` / `star`, natočení a β v rad, ramena = id
  úseků ve vchodech v pořadí `junctionArmDirs`, znamení, den vzniku). `fitJunction(dirs, fixed)` –
  5 cest hvězda (kříž a páté rameno `JUNCTION.starArmDeg` 45° od ramene 0 – Martin 3. 11. 2026),
  4 cesty kříž, 3 cesty Y s β 30–60°; natočení po 5° s nejmenším součtem čtverců odchylek přes
  všechna přiřazení (nejvýš 120), při shodě menší natočení a menší β; pevná cesta (stezka, vozová)
  určí natočení přesně. `junctionEntranceM` (1,5 × nejširší cesta), `junctionEntrances` (vchody
  na cm). `bendRoadEnd(points, entrance, armDir, bendM)` – posledních 12 m osy u křižovatky (bližší
  konec) nahradí kubický Bézierův oblouk do vchodu (tečna osy i ramene, body po 1 m, na cm).
  `splitCrowdedNode` – uzel s 5+ cestami na dvě skupiny sousedních ramen a dva středy 10 m od sebe.
  `drawLandmark(seed, id)` – strom 40 % / kámen 30 % / kůl 30 %, podoba, natočení, druh stromu
  (`speciesOf` z `roads-trees.ts`); `landmarkPlace` – nejširší mezera, 1,5 m za vchody. Testy
  `junctions.test.ts`.
  **Zapojení (Úloha 9b):** `updateJunctions(roads, day, seed, { fixed, … })` – krok 6 měsíčního
  úklidu (`tidyMonth` v `roads.ts`, po cestách k vchodům), běží každý měsíc i bez úklidu (starší ves
  se srovná v prvním měsíci, kotvy a plocha vsi se mění se stavbami), beze změny nic a žádná nová
  id; vrací, jestli se něco změnilo (pak se posune `tidyKey`). Uzel = bod, kde končí úseky (klíč na
  cm); křižovatka stojí, kde končí 3–5 ramen (`JUNCTION.maxArms`) – **rameno = `junctionArm`**: každý neopuštěný úsek
  (i zarůstající bez provozu – zanikne až s ním; spojka `link` vždy), stejná množina jako při
  spojování úseků (`chainPair` v `roads-form.ts`), takže uzel se 2 rameny se spojí a „cesta na
  cestě bez křižovatky“ (`road-ends.ts`, `kind: 'road'`) v uzlu nevzniká (Vlkov 1. 11. 2026 – dřív
  ramena jen z provozu tras, `liveRoadEnd`, a uzel se zarůstající třetí cestou zůstal bez
  křižovatky i bez spojení; paths.md – Křižovatka i se zarůstající cestou). Test
  `road-stubs.test.ts` – „křižovatka se zarůstající cestou“. **Osa vede přesně do vchodu a odtud rovně po rameni do středu**
  (`bendEnd`) – úseky dál sdílejí bod uzlu, takže spojení, pahýly, copánky i díry v úklidu se
  nemění; oblouk po 1 m se uloží zjednodušený (`simplifyPathLine`, `SIMPLIFY_M`) – body osy
  zdražují chůzi a vozy. Oblouk, který by vedl neprůchodnou plochou (`JunctionRoads.blocked` –
  `villageBlockedAt`) víc než neohnutá osa (`blockedRun` v `roads-overgrow.ts`, nejdelší běh vzorků
  po 1 m), se nepoužije, stejně jako oblouk, který má ve stavbě či u plotu větší podíl délky (vzorky
  po 1 m, `bentFootprintWorse`) než neohnutá osa (`JunctionRoads.footprint` – `footprintOf` v `roads.ts`: obdélníky
  `villageBuildings` přesně, `inBuilding`, a pruh `FENCE_CLEARANCE.axisM` u plotů `villageFences`;
  mřížka po buňkách kraj domu nepozná – Vlkov, rameno 1060 přes dům 2137; paths.md – Křižovatky,
  Ohyb ramene) – jinak by ho měsíční kontrola opustila a vznikal by znovu (obilná jáma ve
  Vlkově). Neohýbá se vozová cesta, stezka, cesta ve vylepšení ani úsek kratší než
  `bendM` (`isFixed` – rameno přesně v jejich směru). Beze změny (`keptJunction` – ohnuté konce
  leží přesně ve vchodech, počet ramen sedí) jen nová id úseků v `arms`; jinak `fitNode` znovu
  (id, den vzniku a znamení zůstanou; kámen a kůl se posunou do nejširší mezery, strom stojí).
  Místa na stromy a jabloně do `ROAD_CLEAR_M` (2,2 m) od ohnutých os v okolí středu zmizí (místo
  se stromem zůstane). Znamení: strom = `RoadTree` v `roads.trees` (`spot` = id křižovatky, id
  z `nextId`, roste od keře) a zůstane i po zániku; kámen a kůl jsou v `obstacleChangesAt`
  (`added`, id `junctionLandmarkId` = ROAD_TREE_ID_BASE + id křižovatky) jako balvan a keř
  a zmizí s křižovatkou. Uzel se 6+ živými konci se rozdělí (`splitCrowded` / `splitCrowdedNode`
  – skupiny 3 + 3, 3 + 4 …, 10+ se dělí dál). Plocha pod křižovatkou (`roadCapsules` v `road-land.ts`): místo kruhu
  pásy ramen (pásy cest) a spojnice sousedních ramen (mezera pod 180°) ve vzdálenosti šířky
  nejširší cesty. Scéna: `SceneVillage.junctions` (Úloha 12 níž). Měření `road-report.ts` – objekty po tvarech
  a znameních, uzly 5+, přepočty a ohyby (`JUNCTION_RUNS`). Testy `junctions-network.test.ts`,
  `road-stubs.test.ts` (Y u branky hřbitova, 12 měsíců beze změny).
  **Rozestup (paths.md – Křižovatky, Rozestup; Martin 24. 10. 2026):** `junctionReachM(widths)` –
  dosah plácku (kružnice opsaná obrysu ve scéně: `length2(vchod, půl šířky nejširší cesty)`),
  `junctionSpacingM(a, b)` = dosah + dosah + `JUNCTION.spacingReserveM` (1 m; vyšlapané ≈ 7 m,
  vozové ≈ 12,1 m). `spaceJunctions` v `updateJunctions` po `splitCrowded`, před tvarem: uzly s 3–5
  živými konci (`hubsOf`, pořadí podle klíče – nezávisí na pořadí úseků), nejbližší dvojice pod
  rozestupem napřed, po každé změně znovu (`guard` = počet uzlů). **Sloučení** (`mergeHubs`):
  jediný spojovací úsek, ne v `fixed` (stezka, vylepšení), živý v obou uzlech a bez něj nejvýš
  5 živých konců (kříž a Y) → konce do středu mezi uzly (na cm), spojka zmizí (`relinkApples`), zůstane
  křižovatka s menším id (znamení, vznik), druhá zanikne; `fitNode` pak dá kříž nebo hvězdu.
  **Přitažení napojení** (`pullJoin` / `pullInto`, paths.md – Napojení blízko křižovatky, Martin 3. 11. 2026) – i když mají oba uzly pevné rameno: uzel se 3 rameny, kde spojka a další rameno jsou
  kusy jedné cesty (stejný `grade`, `cart`, `unbridged`, `fixed`; nejrovnější pokračování), a cíl
  s nejvýš 4 rameny (napřed starší křižovatka) → osa napojené cesty bez posledních `bendM`
  (`axisHead`) a rovně do středu cíle; ne `isFixed`, ne kotva, ne přes `blocked` / `footprint` víc
  než dřív; `delete lined`, místa na stromy daleko od osy zmizí. Pak `net.chain` (`tidyMonth`:
  `mergeRoadChains`) spojí kusy cesty. **Při napojení** `junctionSnap(roads, road, at, widthM)` –
  `joinTarget` (`roads-form.ts`, vznik z vyšlapanosti) a `joinRoadGaps` (`roads-tidy.ts`, ne do
  vlastního uzlu): bod blíž než `junctionSpacingM` od konce úseku s 3–4 rameny → střed uzlu, úsek se
  nerozdělí. Testy `junctions-snap.test.ts` (Vlkov 1131 + 1619, po kouscích = vcelku). **Odsunutí**
  (`moveHub`) jinak: oba uzly po spojnici o půl chybějícího rozestupu + `SPACING_TIE` (2 cm – po
  zaokrouhlení na cm nad rozestupem, podruhé nic); konce úseků i `junction.x/z` se posunou, ohnuté
  konce `fitNode` ohne znovu. Kotva `net.anchor` (`tidyMonth`: do `ROAD_ANCHORS.entranceM` od vchodu
  – `nearEntrance` v `road-condition.ts`) se nehýbe; dvě kotvy zůstanou. Starší vsi se srovnají
  v prvním měsíci (Vlkov 114701: J563/J564 → kříž, J569/J570 6 → 12,1 m, J574/J578 11,7 → 12,1 m;
  dopočet 40 dní = 13 + 27). Testy `junctions-spacing.test.ts`.
  **Scéna (Úloha 12):** `lib/scene/junction-shape.ts` (čisté, bez Babylonu; test
  `junction-shape.test.ts`). `junctionShape(j, roads)` – ramena jen s cestou, vchody z
  `junctionEntranceM`, obrys proti směru hodin: u každého ramene dva rohy ve vchodu (± půl šířky
  nejširší cesty kolmo na rameno) a mezi sousedními rameny vnitřní roh na ose mezery, kde se
  protnou okraje pásů (nejvýš u vchodů, ± 12 % nepravidelnost podle polohy; od mezery 180° střed).
  Obrys (výběr) má mezi rameny oblouk tečný k okrajům pásů (`CORNER_ROUND` × půl šířky, tečné
  body nejvýš ve vchodech; mezera od 180° oblouk kolem středu). Obtisk plácku (oprava 24. 10. 2026 – Martin: „ty ostrý křižovatky už jsou upravený?“, „Předtím ty křižovatky byly tedy
  lepší“; šedý štěrk plácku `roads-wagon-gravel-hub` a obrys s tvrdým okrajem zmizely):
  `junctionCuts` – pásy cest končí v řezu `entranceM + JUNCTION_CUT_EXTRA_M` (1,5 m) od středu
  (`roadBands(roads, cuts)` vrací i `arms` – kus osy od řezu do středu, druh pásu, sílu),
  `junctionPatchGrid(arms, cuts, 'worn' | 'earth')` → `junction-patch.ts`: krytí = průřez pásu
  navazující cesty podle vzdálenosti k osám ramen, ramena slitá hladkým minimem (oblouk ve
  vnitřních rozích), v řezu přesně průřez pásu; obtisky `roads-junction-worn/earth` (barva
  a povrch jako cesty, bez štěrku). Koleje (`gravel`, `ruts`) přes plácek jen mezi rameny téhož
  druhu kolejí, která svírají aspoň 120° (`throughCurve`), jinak dojdou ke středu a vytratí se.
  Krátký úsek celý v dosahu řezu je celý rameno (`openM` – vytrácí se k volnému konci); úsek
  mezi dvěma křižovatkami s překrytými řezy se dělí v půli překryvu (`overlapSplit`, koleje po
  celé délce – Vlkov 1387, 2. 11. 2026). Maska
  polí (`roadTrack`) se neřeže – pásy do středu a kruh o průměrném poloměru obrysu
  (`junctionRibbons`, plácek upravené vrstvy i u vozové cesty). Znamení: `junctionLandmarkPieces` → modely `junction-stone-1…2`,
  `junction-post-1…2` (`tools/blender/roads.py`, atlas jako hať, 0 A.D. textury, vlastní tvary)
  v instancích `RoadWorks.update(…, junctions)`; strom je dál `roadTrees` (stejně jako dřív).
  Kámen a kůl se jako překážky dál počítají jádrem (`obstacleChangesAt` – balvan a keř), scéna je
  nekreslí z `obstacles`. Klíč `junctionsKey` je v klíčích `path-renderer`, `field-renderer`
  i `RoadWorks`. Výběr: `{ kind: 'junction', id }` – `nearestJunction` do `JUNCTION_PICK_M` (3 m)
  od středu, přebíjí cestu; obrys výběru `selection-highlight.ts` (obrys + 0,35 m); údaje panelu
  `junction-view.ts` (`VillageView.junctions`: tvar, počet cest, znamení, stáří), panel
  `JunctionBody` (`selection/roads.tsx` – ikony `krizovatka-kriz` / `krizovatka-y` z
  `tools/blender/icons.py`, počet cest, znamení, stáří; názvy jen v popiscích). Náhled
  `/dev/panels?panel=krizovatka`, ukázka čtyř křižovatek (i vozová hvězda) `/dev/landscape` (tlačítko Křižovatky,
  `dev-junctions.ts`).

- **Vylepšení pevné cesty a chůze podle stupně** ([roads.md](../design/roads.md) – fáze 2):
  terén pěšin má příznaky `PATH_WETLAND` (mokřina – suchá rovina do 3 buněk od vody) a `PATH_WATER`;
  úsek nese `Road.ground` (mokřina od–do a brody na ose – `roadGroundOf` při vzniku, starší při
  roční kontrole; `splitRoad` je dělí). `road-upgrades.ts`: `roadUpgradeOptions` (nabídka, cena
  `roadUpgradeCost` – `ROAD_UPGRADES` v `rules*.ts`, důvod česky), `startRoadUpgrade` → stavba
  `kind: 'road'` s `roadIds` a `roadGrade` (dřevo `planWoodFrom` k polovině úseku),
  `finishRoadUpgrade` v `finishConstructions`; úsek ve stavbě nezaroste (`roadsInWork`). Use-case
  `upgradeRoad`, server action `upgradeRoad` (`{ roadId, upgrade }`), práce `{ kind: 'road' }`
  (labor-report, postavy `roadWork` (u čela úseku, kde se pracuje) a `wagonWork` (vozová cesta ve stavbě: kopáči, nosiči s koši, dusání u čela `LaborTarget.wagon`; `villager-plan-sites.ts`), pěšina k polovině úseku). **Chůze** jen ve `walking.ts`:
  `walkGraph(lines, { roads, ground })` – pěšiny dne, pevné cesty podle `ROAD_WALK`
  (`roadPieceCost` – stupeň: vyšlapaná i vyježděná 1,5×, upravená 1,7× i přes mokřinu (hať) a brod
  bez zdržení (lávka), jen `Road.unbridged` jako vyšlapaná: mokřina 0,5×, brod + 30 m; stromy u cesty přidají – Stromy u cesty zrychlí
  chůzi níž), `groundWalkLength` (rovně: mokřina 0,5×, pole
  podle `WalkGround.fields`, vstup do vody + 30 m), `walkingDistances(graph, origins, targets,
ground)`; půda `walkGroundOf(landscape)` je pevné okno kolem místa vsi, pole do ní přidá
  `withFieldWalk` (vzdálenosti dílů, sadu, paliva a luk; kácení staveb po pevných cestách bez
  polí). `refreshWalkDistances` počítá
  `FieldPart.walkDistanceM`, `OrchardSquare.walkDistanceM` (`squareWalkDistance`) a
  `Dwelling.forestWalkM` (`dwellingForestDistance` – palivo) a `Dwelling.waterWalkM` (k nejbližšímu
  břehu vzdušnou čarou – jedna funkce `waterWalkDistance(ground, walk, from)`: po pěšinách a cestách,
  jen po cestách – `roadWalk`, nebo rovně – `straightWalk`; `WALK_VERSION` v otisku přepočte starší
  vsi); kácení staveb přes `walk` v plánu
  dřeva (`roadWalk` / `villageRoadWalk` jen po pevných cestách, u kurzoru `placementWalk`
  s `PlacementVillage.walkRoads`). Bez krajiny (kalibrace) se nic z toho nepočítá. Web:
  `VillageView.roads` (`VillageRoad` – panel), `SceneRoad.ground` a `upgrade` (průběh pro fáze),
  výběr `{ kind: 'road' }` (`nearestRoad`, `ROAD_PICK_M`), panel `RoadBody` (ikony `cesta`,
  `cesta-upravena`, `hat`). **Upravená cesta je jen širší vyšlapaná** (Martin, 19. 10. 2026:
  „upravená cesta ať je prostě jenom širší – ta odvodňovací strouha vypadá divně, zrušíme ji“):
  tytéž obtisky, pás `ROAD_WIDTH_M.improved` 3 m místo 1,9 m (`IMPROVED_WORN_LAYER` /
  `IMPROVED_EARTH_LAYER`), žádná strouha ani kameny (zrušené i s `road-stone.glb`). Scéna:
  `road-works-layout.ts` (čisté funkce – pásy `roadBands` – rozestavěná úprava širší od začátku
  úseku –, kmeny hatě na šířku upravené cesty – `LOG_SCALE`, lávky, vytyčení po okrajích širší
  cesty – `STAKING_OFFSET_M`), `road-works.ts` (`RoadWorks` – modely `public/models/roads/`
  z `tools/blender/roads.py` v instancích, `roadRibbonMeshes` i pro `/dev/buildings` – ukázka
  **Cesty** s posuvníkem stavby); `/dev/landscape` tlačítko **Cesta: …** přepíná stupně
  a rozestavěné fáze (i cesta k nejbližšímu brodu).

  **Úloha 10 (plán cest v2) – hať a lávka jsou součást úpravy** (Martin, 24. 10. 2026): stupeň
  `causeway` zanikl (`RoadGrade` = `trodden | improved | wagon`), `Road.unbridged?: true` = upravená
  cesta přes mokřinu nebo brod bez hatě a lávky (`roadBridged` v `types-roads.ts`). Nabídka je
  jedna, „Upravit cestu“ (`RoadUpgrade` = `'improved'`): `roadUpgradeCost(road)` = úprava (vyšlapaná)
  plus `roadBridgeCost` (hať a lávka, kde úsek vede mokřinou či brodem a nemá je); rozpad pro
  popisek je `RoadUpgradeOption.parts` (`roadBridgeParts`, `chainParts`); `unbridged` úsek
  nabídne jen hať a lávku, `finishRoadUpgrade` smaže `unbridged`. Rychlost v mokřině: `roadWalkSpeed`
  a `cartRoadSpeed` mají poslední parametr `unbridged`; příznak nese `WalkRoad`, cesty v síti
  (`PathVillage.roads`), `CartRoad`, `WagonTimeRoad`, kopírují ho `splitRoad`/úklid/zarůstání
  a spojení úseků vyžaduje shodu. Druh `causeway` zůstává jen jako pohled (`roadKind`: upravená
  s mokřinou či brodem a bez `unbridged`). Převod starých vsí `withBridgedRoads`
  (`road-upgrades.ts`, volá `updateVillage`): `causeway` → `improved` (úseky, stavby i úseky
  stezky), upravená přes mokřinu bez hatě → `unbridged`; jednou a idempotentně
  (`VillageRoads.bridgesSeeded`, nové vsi ho mají od začátku). Scéna: hať a lávka podle
  `ground` a `!unbridged` (`causewayShare` v `road-works-layout.ts`), rozestavěná podle průběhu.
  Vozová cesta: `roadBridged` platí i pro `wagon` (pěší lávkou bez +30 m na brodu, vůz brodem),
  lávka je 15 čd na brod v ceně úseku (`fordArcsOf` v `wagon-road.ts`; dřevo na ni se nevyhrazuje).

- **Vozová síť a vyjeté cesty** ([wagons.md](../design/wagons.md) – fáze 2; Martin, 19. 10.
  2026: „ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset vyjezdit serpentiny“; čísla
  `CART_ROUTES` a `CART_ROADS` – návrh Clauda): `paths/cart.ts` (deterministická vrstva jako
  pěšiny) – `cartGrid` na mřížce terénu pěšin (výšky `PathTerrain.heights`, les `PATH_FOREST`,
  překážky `cartObstacleMask` v `terrain.ts`; voda jen brodem, les jen po pevné cestě, pole
  v lese vymýcené, křoviny, sad, hřbitov, ohrada, les vsi a okrsek svatyně ne, pole stálou cenou (`cartPartSpeed` – `CART_SPEED.field` v každém stadiu, zarostlý díl ne; vůz úrodu nepošlape – paths.md, Stálé trasy; `flushCartTrips` v `cart-jobs.ts` – jediné místo, kam `work()` zapisuje jízdy dne – deník `CartTripLog`: svoz, voda, uhlí, ruda, klády, osivo; provoz cest), domy
  a pozemky s půl šířkou vozu; každá pevná cesta sjízdná – pás buněk do 0,75 buňky od bodů osy
  (`ROAD_BAND_CELLS`) a úhlopříčka z buňky cesty na buňku cesty i přes roh lesa či
  okraje domu (`CartGrid.road`), jinak by šikmá cesta lesem a ohyb u domu nebyly sjízdné (Vlkov 23. 10. 2026; návrh Clauda); stavba přes cestu ji přehradí i vozu (roads.md – Co platí dál); rychlost podle povrchu a druhu cesty –
  `CART_SPEED`, `cartPartSpeed`, `cartRoadSpeed`: vyšlapaná 1,3, vyježděná 1,6, upravená a hať
  1,8, strniště i připravený díl 0,8, zoraný 0,6, mokřina 0,55 – i na cestě kromě hatě, podle
  `Road.ground` jako chůze, `cartVillageOf`; návrh Clauda) a `cartRoutes` – Dijkstra po stavech
  buňka × 16 směrů (osy, úhlopříčky, skoky 2 : 1), sklon ve směru jízdy nad 10 % nejede, stoupání
  zdražuje se čtvercem (serpentiny samy), dvoukolák zatočí o 2 směry, čtyřkolák o 1 (širší
  oblouk); jedno hledání od depa (`cartDepots` – kolem ohrad se spřežením `teamPens`) ke všem
  cílům. `axisCartCheck` – sjízdnost osy (zemská stezka, `trailRoutes` beze změny). Ze stavu vsi
  `villageCartRoutes` (rozhraní pro svoz fáze 1 – `CartAccess`). Jízdy svozu sčítá
  `addRoadCartTrips` do `VillageRoads.labor.cart`; roční kontrola `annualCartNetwork` → provoz
  vozů, `Road.cartTraffic`, příznak `Road.cart` (`markCartRoads` – 2 roky nad 0,25 jízdy denně,
  5 let pod polovinou pryč); **vůz přebije vyšlapanou** (Martin, 19. 10. 2026: „pokud nějakou
  cestu vyjezdí vůz, bude to vyježděná cesta. Pokud vůz takhle vyjezdí vyšlapanou cestu, tak to
  vozová cesta přebije.“) – `formCartRoads` s `cartCandidates` třídí body tras po trasách
  (`CartPoint`): po cestě, kterou vozy mají, provoz patří jí; po vyšlapané (do 5 m, stejným směrem)
  ji převezmou (`takeOverRoads` – kus od 15 m dostane `cart`, úsek se rozdělí); souběžně vedle
  (5–12 m) od 25 m nová cesta po ose vozu (souběžnou vyšlapanou pak vyřízne `mergeParallelRoads`),
  kratší převezme; jinde nová – provoz se neztratí, souběžná nevznikne. Kus s provozem vozů
  nezaroste, vozová a pěší se nespojují. Pro hráče je vyšlapaná s `cart` druh **vyježděná cesta**
  (`RoadKind`, `roadKind`, `ROAD_KIND_ORDER` v `road-chains.ts`; upravená a hať zůstanou),
  ikona `icons/build/cesta-vyjezdena.png` (`icons.py`). Scéna: `roadBands` → `cart` (širší pás) a `ruts` (dvě
  koleje ±0,65 m, `CART_RUT_LAYER` bez vlnění), `roadsKey` nese `:v`. Ves bez vozů beze změny.
  `/dev/landscape` tlačítko **Vozy ve svahu** (`dev-cart.ts`).

- **Cesta pro hráče** ([roads.md](../design/roads.md) – Cesta pro hráče; Martin 19. 10. 2026:
  „tohle by rozhodně neměly být dvě cesty, ale měly by se spojit do jedné“): řetěz úseků mezi
  rozcestími (uzel ≥ 3 konců) a volnými konci bez ohledu na druh cesty – `roadChain` /
  `roadChains` / `roadChainIds` (`paths/road-chains.ts`, začíná koncem s menším id úseku, okruh
  nejmenším id). Data zůstávají po úsecích. Vylepšení (`roadUpgradeOptions`, `startRoadUpgrade`)
  i jabloně (`roadApplesOption`, `startRoadApples`, `chainAppleSpots`) berou `roadId` kteréhokoli
  úseku a pracují s celou cestou – stavba `roadIds` v pořadí cesty, průběh po úsecích
  `roadUpgradeProgress`, čelo `roadWorkFront` / `roadApplesWorkRoad` (labor-report). Web:
  `VillageRoad` = cesta (`segments`, převládající druh `roadKind`, délka po druzích `kinds` –
  vyšlapaná, vyježděná, upravená, hať; `ROAD_KIND_NAMES`), výběr `{ kind: 'road', id }` s id
  prvního úseku (`pickVillageTarget`), zvýraznění celé cesty, `SceneRoad.upgrade.fromEnd`;
  přechod pásů různé šířky se zúží (`RibbonLine.narrowStart` / `narrowEnd`, `NARROW_M`).

- **Průsek lesem** ([roads.md](../design/roads.md) – Průsek lesem, trade.md – Zemská stezka;
  Martin 19. 10. 2026: „Tam, kde zemská stezka prochází lesem, ať se les vykácí.“): upravená
  cesta a stezka lesem (`PATH_WOODLAND`, les vsi) vykácí pruh `ROAD_SWATH.halfM` (3,5 m) od osy
  – v pásu cesty (`roadbedM` 1,5 m) i pařezy a kameny, po stranách pařezy (`road-swath.ts`:
  `swathTally`, `roadSwathTally`, `cutRoadSwath`). Cena v úseku stezky (`pieceOf`) a vylepšení
  (`roadUpgradeOptions(…, walk, landscape)`, `swathTrees`); kácí krok dne `roadSwathDay`
  s `swathRoadsInWork` (trail.ts), klády na hromadu, `Road.swath`. Pařezy průseků
  (`VillageRoads.swath`) nedorostou (`obstacleChangesAt`, `fellTrees`, `plantOnStump`,
  `isTreeStanding`), nový les vsi do pruhu nevstoupí (`keepSwathsClearOfWoods`). Posvátné duby
  a háje: trasa stezky se jim vyhne (`sacredMask` v `trailRoutes`), v pásu cesty úpravu
  nedovolí (`ROAD_SACRED`, `TRAIL_SACRED`). Starší vsi `withRoadSwaths` (bez klád, příznak
  `swathChecked`). `trailTerrain` je v `paths/terrain.ts`. Scéna: `SceneRoad.swath` →
  `swath-bands.ts` (plocha korun `setCleared(…, swaths)`, zarůstání `wildPlants`), dev ukázka
  Stezka lesem (`dev-forest-trail.ts`). Vozová cesta průsek nedostane.

- **Cesta přes pole** ([roads.md](../design/roads.md) – Cesta přes pole; Martin 19. 10. 2026:
  „Ano má. … pokud oráč narazí na cestu, tak spřežení otočí. Nebude pak moci vzniknout takový
  růžek…“): pás pevné cesty (šířky `ROAD_LAND.widthM` = obtisk, i `ROAD_WIDTH_M` ve scéně)
  a plácky rozcestí se neorou; kus pole oddělený cestami pod `cornerMinM2` (80 m²) nebo bez místa
  širšího než `stripMinM` (3 m) zůstane loukou. `roadLand` (`paths/road-land.ts`, buňky 0,5 m
  v mřížce pole, `fieldFrame`) → `PartRoadLand`; krok dne `roadFieldsDay` (`road-fields.ts`, jen
  s krajinou – i kalibrace `--land real`) při změně otisku `roadLandKey` (cesty + čtverce polí,
  `VillageState.roadLandKey`) zavolá `giveWayToRoads` (`land-taken.ts`, `resizeParts` –
  zmenšení i vrácení plochy s plánem, sečí a založením; pod 20 % políčka díl vypadne, kronika
  `land-taken` s `by: 'road'`). Díl nese `roadM2` (už odečtené z `areaM2`) a `roadCut` (řádky
  bitů buněk); scéna `SceneFieldPart.roadCut` → `roadCutMask` (`road-cut-mask.ts`) v krytí pole,
  dev ukázka Cesta (`withRoadCuts`). **Brázdy končí na cestě** (oxen.md): jádro – výkon orby
  s průměrnou délkou kusu pásu mezi cestami (`bandFurrowM` v `plough-trip.ts`, `roadCapsules` /
  `roadFreeRuns` v `road-land.ts`, i plán osevu `plannedFurrowEfficiency(…, state, landscape)`);
  scéna – `roadPieces` (`plough-roads.ts`): pruh dne po kusech mezi cestami (`PloughField.rowRuns`,
  `fillLo` / `fillHi` – brázda řady po celé šířce až k cestě), oddělený kousek (`roadCut`) se
  neorá, v `dayStints` i `ploughFront`; `/dev/landscape` **Orba přes cestu** (`demoRoadPlough`).

- **Jabloně podél pevné cesty** ([roads.md](../design/roads.md) – fáze 3): `VillageRoads.apples`
  (`RoadApple` – místo, úsek, `distanceM` vzdušnou čarou, `plantedDay` null = čeká na výsadbu,
  `constructionId`). `road-apples.ts`: `roadAppleSpots` (po 10 m střídavě – `roadTreeSpots`
  s rozestupy `ROAD_APPLES`, mimo stavby (pole ano – jabloň mu vezme 20 m², `treeTakenLand`),
  les, vodu, osy cest, překážky, stromy u cest a jiné jabloně), `roadApplesOption` (počet, práce, důvod česky), `startRoadApples` → stavba
  `kind: 'road-apples'` s `roadIds`; práce jen v oknech výsadby (`roadApplesNeed`, kroky
  `workRoadApples` / `finishRoadApples` se neexportují). Úroda a práce jako sad na strom
  (`roadAppleYieldKg`, `roadAppleHarvestWork`, `roadAppleCareWork`, `roadApplePlantingWork`
  v `orchard.ts`, `startWork` je přičte k sadům); stadium `roadAppleStage` (čeká, strom, souš
  10 let – pak zmizí v `updateRoads`), překážka `roadAppleObstacleKind` v `obstacleChangesAt`.
  Práce v rozdělení `{ kind: 'road' }` (`orchardAreas` – jabloně podle plochy na strom).
  Use-case `plantApplesAlongRoad`, server action `plantRoadApples` (`{ roadId }`). Web:
  `VillageRoad.apples` (panel – počet, plodící, výsadba, nabídka), `SceneVillage.roadApples`
  (`sceneRoadApples` – velikost a plody jako sad z `orchard-look.ts`), tlačítko „Vysadit jabloně“
  (ikona `jablone`), jabloně ve scéně přes `path-trees.ts` (`roadAppleInstance`, meshe
  `pathside-apple-*` s materiálem `prepareAppleMaterial` ze sadu, kůly `createTreeStakeMesh`),
  vytyčení `appleStaking` v `RoadWorks`, postavy `roadApples` ve `villager-plan.ts`;
  `/dev/landscape` tlačítko **Jabloně: …** (s **Cesta**) přepíná stadia.

- **Vozová cesta** ([roads.md](../design/roads.md) – Vozová cesta; Martin 20. 10. 2026: „tato
  cesta spojí dva body, které spojuje stará cesta pro pěší, ale co nejvíc přímo tak, aby vůz
  projel“; čísla `WAGON_ROAD` v `rules*.ts`, rešerše `research/2026-10-20-earthworks.md`): stupeň
  `wagon` (`RoadGrade`, `RoadKind`, vůz `CART_SPEED.road.wagon` 2,2, pěšky 1,7, v mokřině jako hať,
  brod zůstává; pás `ROAD_LAND.widthM.wagon` 3,5 m). **Postupně** (Martin 24. 10. 2026):
  `wagonChainStatus` vrací `WAGON_FIRST` („Napřed uprav cestu.“), dokud v řetězu některý úsek splňuje
  `roadNeedsUpgrade` (`road-upgrades.ts`, táž podmínka jako `chainTargets`) – platí v panelu, plánu
  i `startWagonRoad`; plán účtuje lávku jen u brodů, které stará osa neměla (`newFordArcs`, `WAGON_ROAD.oldFordMatchM`; brody z `Road.ground.fords`) a `WAGON_ROAD.pavingPerM` je doplatek
  0,15 čd/m; `profileHeights` počítá na mm a mez kroku zaokrouhluje dolů (sklon ≤ 6 % na každém kroku); `abandonBypassed` bere za obejitý i zbytek
  souběžný s dostavěnou částí, pokud je souběžných aspoň `WAGON_ROAD.bypassShare` (80 %) délky. **Trasa po staré ose** (Úloha 11a; Martin 22. 10. 2026, #6: „vznikne ze staré pěší cesty a vede po ní“): osa = řetěz úseků cesty hráče
  (`chainAxis` v `wagon-road.ts`, od konce blíž vsi), bez vyhledávání a bez vyhlazení. Mřížka
  `paths/wagon-route.ts` (deterministická vrstva): `wagonRoadGrid` – zákazy jako vozová síť, ohrada
  a hřbitov uvnitř plotu (`fencedCells`, ulička 3 m průjezdná – natočená ohrada jen buňky celé
  uvnitř) a po stavbách pruh u plotu jako u chodců (`fenceBand` → `blocked`, `nearFence` – v hledání
  `findWagonRoute` krok × `FENCE_CLEARANCE.nearCost`; `fences` – obrysy plotů v okně; paths.md –
  Odstup od plotu i u vozové cesty), pevná cesta pásem `roadBandCells` z `cart.ts` (díl pole ani samotný strom či keř na ní
  ji nezavřou), `barred` = zákazy bez okrajů staveb, mez úprav terénu `limit` u staveb a vody;
  `wagonAxisBlocked` – body osy po 2 m mimo 9 m u konců: `barred` (plot, voda mimo brod, sráz,
  balvan) nebo stavba blíž než půl šířky vozu (`inBuilding` přesně v bodě, ne po buňkách) →
  `WAGON_BLOCKED`, s `fences` (výchozí) i osa blíž plotu než `axisM` (`wagonAxisFenceAt` – vzorky po
  0,5 m, `fenceClearance`, mimo `gateM` od konců; tětivy, narovnání v `rangeAlong`, vyhlazení
  v `wagonProfile` totéž, narovnání navíc nově nevjede do pruhu `nearM`); `planAlong` vrátí osu
  u plotu jako `WAGON_BLOCKED` s místem selhání → objížďka (`detourPlan`) po mřížce s pruhem; posvátný strom přesně kácením (`wagonClearing` → `WAGON_SACRED`);
  `wagonProfile(grid, osa, asIs = true)` – profil po ose jak je, nevyjde-li sklon 6 % ani s úvozem
  a náspem 3 m → `WAGON_STEEP` „Cesta je pro vůz moc prudká.“ **Narovnání** (Úloha 11b):
  `straightenStretches` v `wagon-road.ts` (`WAGON_STRAIGHTEN` – 1,3× / 3 m / 120 m) na osu po 6 m
  najde kličkující kusy, zkusí nejvýš 8 tětiv, vlásenky napřed, pak od nejvíc ušetřené délky (`wagonAxisBlocked` +
  `wagonProfile` bez vyhlazení, cena = zemní práce + zpevnění) a přijme tětivu, je-li levnější než
  stará osa nebo stará nejde; **vlásenku** (`WAGON_HAIRPIN` – kus do 60 m víc než 2× delší než
  tětiva, tětiva ne prudší než 6 %, `isHairpin`) narovná i na rovině a bez ohledu na cenu (kus do
  120 m); `planAlong` po průjezdu odmítne osu s vlásenkou (`wagonHairpinAt` – index uprostřed
  nejostřejší ve `wagonAxisPoints`, důvod `WAGON_HAIRPIN_REASON`) a objížďka (`detourPlan`) ji
  zkusí obejít; nevyjde-li tětiva ani objížďka, `planWagonRoad` zkusí `planAlong(…, allowHairpin)` po staré ose
  (paths.md – Vozová cesta bez vlásenky); plán nese `bypassed` a `footbridgeTrees`, `startWagonRoad` je uloží
  (`RoadEarthwork.bypassed`, `Construction.wood`) a `wagonRoadsDay` po `absorbParallelRoads`
  označí obejité zbytky `Road.abandoned` (`abandonBypassed`). **Serpentiny** (Úloha B, roads.md –
  Postupná úprava a serpentiny): `planAlong` vrací i místo selhání (index ve `wagonAxisPoints` –
  profil `wagonProfileFailure`/`profileFailure`, posvátný strom `WagonClearing.sacredArc`);
  `detourPlan` kolem něj zkusí okna `WAGON_DETOUR.windowsM` (±60/120/200 m po ose, do stran stejně)
  – `detourStretch`: `findWagonRoute` (A\*, mez `WAGON_DETOUR.maxLabels`) → `straightenWagonRoute`
  → `wagonProfile` s vyhlazením (nevyjde-li s konci v terénu, narovnaná trasa) – vloží kus do osy
  a spočítá celý plán nad mřížkou nové osy; nejlevnější hotový (práce, délka, pořadí oken), jinak
  pokračuje od prvního okna, které posune selhání za objížďku (nejvýš `maxDetours`). Obejitý kus
  jde do `bypassed`. Selže-li profil do 10 m od posvátného stromu (`wagonNearSacred`), důvod je
  `WAGON_SACRED`. Plán bez selhání se nemění (stejná mřížka i osa jako dřív).
  Lávky u brodů chtějí dřevo (`planWoodFrom`/`takeWood`); `earthworkReachedM` počítá kácení před
  zemními pracemi. Ostatní: `wagonProfile` (víc stupňů vyhlazení osy pro hledanou trasu,
  `profileHeights` – DP po mm jen v pásu výšek dosažitelných od začátku i ke konci, dva řádky cen
  a rodiče Int16 ≈ 12 kB na bod osy, sklon ≤ 6 %, úvoz a násep ≤ 3 m), `wagonEarthworks` (objemy na
  rastru 1 m, `balanceEarth` – hlína z úvozu do náspu), `roadsCartMinutes` / `profileCartMinutes`.
  **Plán** `wagon-road.ts`: `planWagonRoad(WagonPlanInput)` – stejně na serveru
  (`wagonPlanInputOf`) i v prohlížeči (`LandscapeScene.previewWagonRoad`), krajina s přesností
  prohlížeče (`browserLandscape` – bit po bitu stejně), důvody česky (`WAGON_*`), kácení `wagonClearing` (průsek, pláň a zemní práce); `wagonChainStatus`
  (zemní práce k cestě – `chainEarthwork`, oba konce profilu v uzlech řetězu). **Stavba**
  `startWagonRoad` → `VillageRoads.earthworks` (`RoadEarthwork` – profil, úseky ≈ 60 m od vsi ven
  `pieces`, `constructionId`) a stavba `road` s `Construction.earthwork`; krok `wagonRoadsDay`
  (po `trailsDay`) dá dostavěné úseky hned jako pevnou cestu (`addWagonRoad` v `paths/roads-trails.ts`),
  `finishWagonRoad`; stará cesta pod hotovým úsekem (táž osa) zmizí hned (`absorbParallelRoads`)
  – souběžná nevznikne; vozová cesta
  nezarůstá, souběhem se neřeže, konce se nenapojují samy. Práce
  `{ kind: 'wagon' }` (`wagonWorkTarget`). **Výšky jako herní data** (landscape.md – Úpravy
  terénu): `paths/earthworks.ts` – `terrainEditsOf` / `terrainEditsFrom` (mezipaměť),
  `editedHeight`, `groundHeightAt`, `withTerrainEdits`; síť pěšin a vozová síť (`villageTerrain`
  v `network-grid.ts`, `cartGrid`) berou hotové úseky (`earthworkBuiltM`), scéna průběh
  (`earthworkReachedM`, `SceneEarthwork.shownM`). Use-case `buildWagonRoad`, server action
  `buildWagonRoad({ villageId, roadId })`. Web: `VillageRoad.wagon` (`wagonView`), panel – tlačítko
  „Upravit pro vozy“ (`road-wagon`, ikona `cesta-vozova`, `WagonTooltip`), náhled trasy
  `VillageGame` → `LandscapeScene.previewWagonRoad` (plán i vytyčení – `setWagonPreview`), průběh `selection-wagon-progress`. Scéna: `terrain-edits.ts`
  (`editSurfaceHeights`, `recomputeNormals` jako Babylon), `TerrainMesh.setTerrainEdits`,
  `applyTerrainEdits` v `landscape-scene.ts` před obnovou vsi, `terrainChanged` (pole po blocích –
  `#t` v klíči bloku, pěšiny, cesty), pás `roadBands` `wagon` + `gravel` (`WAGON_*_LAYER`), svahy
  `earthworkSlopeGrid` (`roads-slopes`, krytí podle strmosti úpravy napříč osou `SLOPE_GRADE` proti původnímu terénu, takže úvoz 0,8 m a násep 1 m jsou plně vidět i na bočním svahu 50 % a dorovnání o pár cm nic; ke koncům hotové osy, na které nenavazuje jiná zemní práce (`SLOPE_JOIN_M`), a krajům řezu se vytrácí `SLOPE_FADE_M`; plácek křižovatky vozových cest má i štěrk (`roads-wagon-gravel-hub`), kde je blíž jiná osa (sousední zemní práce, vnitřek oblouku), kreslí jen ta – `SLOPE_OVERLAP_M`, bez tmavých šmouh a rovných hran po řezech; zarůstají pomalu podle `SLOPE_LOOK` – za 15 let řídká tráva, nikdy plná; lem hrany úvozu a paty náspu `earthworkEdges` – jen vně strmého svahu, kde potká původní terén, `roads-edge-cut` světlý, `roads-edge-fill` tmavý; sníh na svazích tenčí `SNOW_SLOPE`; kameny na svazích zatím ne – později s modelem; nosiči kmenů u hatě a kůly u lávky ve scéně zatím ne – scéna nemá data o hati), vytyčení
  `wagonStakingLines`. Ukázka `/dev/landscape` **Vozová cesta** (`dev-wagon-road.ts` – svahy, které vozová cesta po
  staré ose srovná; hotové úseky nahradí starou cestu).

- **Stromy u cesty zrychlí chůzi** ([roads.md](../design/roads.md); Martin 20. 10. 2026:
  „…přidat třeba 0.03? A pokud to budou jabloně, přidalo by se 0.05.“; čísla `ROAD_TREE_SPEED`):
  přírůstek k rychlosti cesty pro chodce i vůz (+0,03 stromy, +0,05 jabloně) × olemovaný podíl
  délky po desetinách – `Road.lined` (`RoadLining`, `paths/road-lining.ts`: `roadLining` –
  místa `Road.spots` se stromem ve stadiu `tree`, živé jabloně úseku, jabloně mají přednost;
  `lineRoads` v `refreshWalkDistances` 1. dne v měsíci, chybějící hned – rozdělený či spojený úsek
  ho smaže; klíč `walkStageKey` a `liningKey` v `pathNetworkKey`). Rychlost `roadTreeSpeed`
  (walk-speed.ts) bere `roadWalkSpeed` / `roadPieceCost` (walking.ts), `cartRoadSpeed` (cart.ts)
  a buňky sítě pěšin (`roadTreeSpeedMask` → `roadCellCost`) – mimo mokřinu a brod; dosah seče
  `fastestWalkShare`. Do sítě (`pathVillageOf`) a scény (`SceneRoad.lined`) jde jen nenulové –
  ves bez stromů beze změny. Panel cesty: `VillageRoad.treeSpeed` (ikona `walk`, „+0,03“).

- **Měření cest** (nový systém cest, Úloha 0): `packages/game/scripts/road-report.ts <kopie vsi.json> --years N` –
  vstup je JSON `{ state, landscapeSeed, layerVersions, name? }` (sloupce `village.state`,
  `settlement.landscape_seed`, `settlement.layer_versions`; kopie jen ve scratchpadu, necommitovat), ves
  načte `updateVillage` (stejné převody jako hra, repozitář `scripts/lib/memory-villages.ts`) a
  dopočte N let. Řádek: čas krajiny, načtení a dopočtu, velikost stavu, cesty po druzích (počet, km),
  křižovatky (body se ≥ 3 konci úseků) a pahýly (úsek < 30 m s volným koncem). Další úlohy přidávají
  řádky. Výchozí čísla Vlkova (23. 10. 2026, stav `lastDay` z DB, 1 MB stavu): dopočet 1 rok
  20,6 s, 10 let 157 s, 40 let 214 s (ves cestou zřejmě vymře, proto 40 let není 4× déle);
  načtení 0,32 s; cesty 27 (3,89 km: upravené 17 / 3,22 km, vyšlapané 8 / 0,24 km, vozové 2 /
  0,43 km), po 10 letech 29 (3,94 km), po 40 letech 18 (3,71 km); křižovatky 13 / 14 / 8; pahýly
  0 / 0 / 1. Po Úloze 1 (24. 10. 2026): dopočet 1 rok 19,9 s, stav 1 079 kB, z toho trasy 144
  (17,0 kB).

- **Závěrečné ověření na Vlkově** (nový systém cest, Úloha 15, 24. 10. 2026; kopie `diag-vlkov2`, den
  114 037; základ = commit `439338f8` před Úlohou 1 ve vedlejším worktree, měřeno současně na
  zatíženém stroji, základ je před koňmi, vojvodovou rodinou a žněmi, takže rozdíl času není jen
  z cest). `road-report.ts` navíc píše `trasy přes neprůchodné` (uložené trasy, jejichž vnitřek
  jde přes `villageBlockedAt` – stavby, ohrady) a `roadsMonth` (počet a čas měsíčních kontrol přes
  `ROADS_MONTH_TIMING` v `paths/roads.ts`, hodiny jen v měření). Po 10 letech: cesty 29 (mez 38),
  křižovatky 14 (18), pahýly 1 (0), konce mimo kotvu 1 (0), nová id 68 (100), vchody bez cesty 0,
  trasy přes neprůchodné 0, dopočet 186,8 / 201,9 s proti základu 160,5 / 174,2 s (+16 %, mez
  +5 %), `roadsMonth` Ø 48 ms (mez 5 ms). Po 40 letech: cesty 30, křižovatky 14, konce mimo kotvu 3
  (vše upravené), dopočet 261,2 s proti 241,7 s (+19,5 s, mez +1 s), `roadsMonth` Ø 37 ms, stav
  1 009 kB (základ 1 051). Pahýl a konec mimo kotvu je 25m zbytek upravené cesty 547, kterou
  zarůstání uřízlo od okraje mapy: `trimStubs` upravené cesty záměrně nechává (zarůstají podle
  druhu), v základu byl pahýl také. Integrační test převodu: `application/__tests__/update-village-roads.test.ts`.

- **Po Úloze 15 – pahýl a výkon** (24. 10. 2026, Claude Opus 5.5): zbytek upravené nebo vozové
  cesty kratší než `ROAD_STUB.remnantM` (30 m) s koncem mimo kotvu zmizí v úklidu (`stubAction`
  v `paths/roads-stubs.ts`; vozové cesty pahýly řeší také, okruhy dál ne), delší zarůstá.
  Zrychlení `roadsMonth` (profil `--cpu-prof`, 2 roky Vlkova): 56 % času dělala neprůchodná
  plocha `villageBlockedAt` – mezipaměť měla klíč `state.walkLayoutKey` se stadii dílů, takže
  se přepočítávala skoro každý měsíc. Klíč jsou teď jen části rozložení, které dělají neprůchodné
  (`walkLayoutParts` – obydlí, staveniště, hřbitovy, posvátná místa, ohrady, milíře, humna)
  a zemní práce; výpočet pouští `villageGrid` bez polí, sadů, lesa a cest (jen zdražují). Druhá
  byla `wearRoadDue` – blízkost vzorků čar k cestám (`eachWearRun`) se počítá líně jen u vzorků,
  na kterých záleží, a čára bez vyšlapaného vzorku mimo cestu se přeskočí (dá totéž);
  `axisDistance` má číselné kyblíky a vzdálenost bez objektu. Mezipaměti po čarách nepomohly –
  trasy se přepočítají skoro každý měsíc. Determinismus: klíč pokrývá všechny vstupy plochy,
  dopočet po kouscích (`wear-village.test.ts`) beze změny. Vlkov 10 let: `roadsMonth` Ø 48 →
  14,4 ms (mez 5 ms – **pořád mimo**: zbytek je úklid sítě, křižovatky, provozní pole a čáry
  tras pro nové trasy), pahýly 0, konce mimo kotvu 0, cesty 28, křižovatky 13, nová id 68,
  dopočet 178,9 s proti základu `439338f8` 156,8 s (+14 %, souběžně, load 49 → 6). Podíl cest
  (profil 10 let obou verzí souběžně, kroky `simulateDay`): kroky cest (`refreshWalkDistances`
  s trasami, `roadFieldsDay`, `roadsMonth`, `roadsDay`) 124,1 s proti 115,6 s v základu, tedy
  **cesty + 8,5 s (≈ 4 % dopočtu)**: chůze a trasy + 4,9 s, `roadFieldsDay` + 2,8 s, `roadsMonth`
  - 2,2 s (v základu není), `roadsDay` − 1,5 s; celkem v tom běhu 220,8 s obě verze (load až 57),
    ostatní kroky − 8,3 s (`work` − 7,2 s – ves se v obou verzích vyvíjí jinak). Zbytek rozdílu
    mimo profil je mimo cesty (koně, rod vojvody, žně) a šum zatíženého stroje.

- **Trasy ve stavu vsi** (nový systém cest, Úloha 1; [paths.md – Kdy se trasy počítají a co se
  ukládá](../design/paths.md#kdy-se-trasy-počítají-a-co-se-ukládá)): `VillageState.routes`
  (`VillageRoutes { day, key, list }`, typy v `types-routes.ts`) – trasy posledního kola sítě pěšin,
  `StoredRoute { from, to, purpose, trips, start, steps, visit? }`: odkud `d:<id obydlí>`, kam klíč
  cíle skupiny (`TripGroup.to` – `field:<id>`, `water`, `wood`, `cemetery:<id>`, `pen:<id>`,
  `oak:<id>`, `pasture`, `d:<id>` u sousedů…), účel `RoutePurpose` (`TripGroup.purpose`), cest za
  den v setinách (trasy pod `MIN_TRIP` se neukládají). Síť s `keepRoutes` (`PathNetworkInput`)
  zapíše v posledním kole `routeAll` buňky každé trasy (domácnost × skupina) od brány k cíli –
  u pochůzky obráceně od místa k bráně a dál po pěšině souseda (`addErrand`) – do
  `PathNetwork.routes` (`NetworkRoute`); hledání ani provoz se tím nemění (provoz po buňkách
  z tras je týž bit po bitu). Kódování `paths/routes.ts`: `encodeRoute` (buňka světa = index okna
  - `originX / cellM`, mřížka je vůči krajině pevná; kroky po 8 směrech, 3 bity, dva kroky na znak
    base64, lichý konec `=`), `routeCells`, `routePoints` (středy buněk), `routeLine`
    (`simplifyPathLine` + `smoothPathLine`), `storedRoutes`. Ukládá je `refreshWalkDistances` při
    přepočtu chůze (`key` = `walkLayoutKey`, síť serveru `computeVillageNetwork` vždy s
    `keepRoutes`); stará ves bez tras nebo s jiným otiskem je dostane při načtení – `withRoutes`
    v `updateVillage` po dopočtu (síť dne `lastDay`, bez posunu dne, jednou a idempotentně). Testy
    `routes.test.ts`, use-case ve `villages.test.ts`. **Trasy a z nich vyšlapané čáry se aktualizují
    jen při změně rozložení** (`walkLayoutKey`), ne měsíčně se vyšlapaností: `walkLayoutKey`
    vyšlapanost neobsahuje, takže slévání tras a síla pěšin v chůzi (`walkDistanceM`) se mění jen
    tehdy – deterministické (závisí jen na dnech změny), ne chyba (M2 recenze 3b). `withRoutes`
    při načtení staví síť s uloženou (nesečtenou) vyšlapaností, `refreshWalkDistances` se sečtenou –
    jiný vstup, týž determinismus (M3).
- **Vyšlapanost** (nový systém cest, Úloha 3a – jádro, Úloha 3b – zapojení;
  [paths.md – Vyšlapanost a vznik cesty](../design/paths.md#vyšlapanost-a-vznik-cesty)):
  `VillageRoads.wear?` (`RoadWear { day, cells, labor, cellM? }`) – setiny cesty na políčko 3,75 m
  světa = buňka mřížky pěšin (`WEAR.cellM`, Stálé trasy – pravidlo 4),
  čísla `WEAR` v `rules-roads.ts` (práh cesty `roadAt` 100 000, strop `max` 150 000, tráva ubere
  `regrowPerDay` 100 denně). `paths/wear.ts`: klíč políčka `wearKey(i, j)` / `wearCellAt(x, z)` (nejbližší
  buňka – políčko i je buňka tras i),
  kódování `encodeWear` / `decodeWear` (seřazené klíče, rozdíl klíče a hodnota jako varint v base64
  – 5 bitů na znak, nuly se neukládají), `wearCellsOf(route, cellM, band?)` – buňky trasy bez
  sousedů (s `band` i ± 1), každé jednou; jízdy vozů (`addCartWear`) také jen buňky jízdy. **Provozní pole** `trafficField(routes, cellM)` se spočítá jednou pro `routes.key` (pár
  posledních sad v paměti, kontrola počtu tras a součtu cest) – `cells`: cesty za den, které se
  sčítají (trasy mimo práci celé, trasy `work` jen stálá část `StoredRoute.base`; `base` zapisuje
  `network-targets.ts` přes `TripGroup.baseWeights` u pole, sadu, ohrady a staveniště a
  `storedRoutes` ji ukládá), `targets`: pro cíl práce (`StoredRoute.to`) políčka tras k němu a kolik
  cest jimi vede, `walk`: celé `trips` všech tras v pásu ± 1 buňky (každá trasa jednou – osa cesty je
  vyhlazená čára trasy); `trafficAt(field, x, z)` čte `walk` (provoz nové cesty a roční
  `road.traffic`). Čáry tras čtou vyšlapanost přes `wearNear` (buňka bodu a sousední – vyhlazený
  bod leží až o buňku vedle trasy): `wearStrengthAt` i vznik cesty (`eachWearRun`). `wearKey` mimo ± 32 768 políček vyhodí `RangeError`. `settleWear(wear, field, fromDay, toDay)` projde jen
  sjednocení políček pole, práce a vyšlapanosti: `w = clamp(min(w + práce, max) + (provoz − 100) × dny, 0, max)`, práce intervalu `wear.labor` (klíč `wearLaborKey` = cíl trasy) se rozdělí po políčkách
  tras k cíli podle jejich cest za den (celé setiny, dolů); vynuluje `labor`, posune `day`, vrátí
  počet prošlých políček. **Pracovní políčka** drží dopočet v paměti (`WeakMap` podle objektu
  `RoadWear`, `wearMap(wear)` – i ještě nezapsaná); `settleWear` nekóduje, do `wear.cells` je zapíše
  `flushWear` na konci `advanceVillageSteps` (klon stavu začne dekódováním kódu). Syntetické
  měření ≈ 1,3 ms na interval při 4,5 tisících políček. Celá čísla, dopočet po kouscích
  = najednou (provoz v intervalu stálý).
  Ve výběru trasy: `PathNetworkInput.wear` (dekódovaná vyšlapanost) – `wearStrengths` dá buňkám
  okna sílu vyšlapanost / `roadAt` (od `visibleFrom`), `computePathNetwork` ji drží jako spodní mez
  síly jako u pevných cest, takže se trasy slévají po vyšlapaných pěšinách. Kdo ji předá (Úloha 3b),
  musí ji zahrnout do klíče sítě. Testy `wear.test.ts`, slévání ve `paths-network.test.ts`.
  `wearStrengths` prochází jen nenulová políčka (buňky okna, jejichž bod do políčka padne – týž
  `wearIndex` jako průchod oknem, test proti němu).

  **Zapojení (Úloha 3b):** `roadsDay` založí nové vsi `roads.wear` od dneška a denně přičte práci
  `addWearLabor` (člověkodny po `wearLaborKey`, bez celé vsi a vozu pro vodu – stálou část nese pole,
  nic dvakrát). Interval sečte `settleVillageWear` (`paths/village.ts`, provozní pole uložených tras)
  **1. dne v měsíci** (`simulateDay` před přepočtem chůze) a v `refreshWalkDistances` **před novými
  trasami** – dny určuje stav, ne kousky dopočtu (test po kouscích s prací ve `wear-village.test.ts`).
  Síť vsi (`villagePathNetwork`) dostává `wearMap` jako `PathNetworkInput.wear` a kód vyšlapanosti
  je v klíči její mezipaměti (`wearRevisionKey` – bez nového kódování: zapsaná políčka jsou sama kód `wear.cells`, nezapsaná uprostřed dopočtu číslo změny `rev`; M1 recenze 3b). Chůze (`refreshWalkDistances`,
  `walkDistancesTo`) bere čáry z **`routePaths(routes, wear, cellM)`** (`paths/route-paths.ts`):
  provoz uložených tras po hranách buněk → `extractLines` (začátky tras jsou kotvy), síla v bodě
  `wearStrengthAt` = vyšlapanost / `roadAt` (od `visibleFrom`), stáří 0 – tentýž zdroj vezme scéna
  (Úloha 4a); `pathCellM(landscape)` je strana buňky tras. Stará ves: `withWearSeed`
  (`updateVillage` před dopočtem) – chybí-li `wear`, podél loňských `LegacyRoadFields.candidates` (osa vzorkovaná po
  čtvrtině políčka, ± 1 políčko – osa je přibližná) `WEAR.seed` 50 000, den `lastDay + 1`; ves bez cest
  nechá být, druhé načtení vrátí týž stav. `withWearCells` (`updateVillage`, po `withWearSeed`) –
  vyšlapanost bez `cellM` (políčka 7,5 m) rozdělí: políčko (i, j) do buněk 2i…2i + 1 × 2j…2j + 1
  s toutéž hodnotou, značka `cellM = 3,75`; jednou a idempotentně (Vlkov 825 políček 4,4 kB →
  3 300 buněk 16,4 kB; se stálými trasami po 1 500 dnech 350 buněk 2,2 kB). `road-report.ts` vypisuje políčka a kB vyšlapanosti
  a čas `settleWear` a `encodeWear` zvlášť (`WEAR_TIMING` – hodiny dává jen měření). Vlkov
  (24. 10. 2026, stroj zatížený jinými agenty): dopočet 1 roku 23,7 s (základ
  feat/landscape týž okamžik 23,5 s), 40 let 246,4 s (základ 253,5 s) – mez + 1 s drží; `settleWear`
  za 40 let 373 intervalů celkem 36 ms, `encodeWear` jednou; vyšlapanost po roce 698 políček
  (4,6 kB), po 40 letech 326 políček (1,7 kB).

- **Stav cest a zarůstání podle druhů** (plán cest v2, Úloha 7; paths.md – Zarůstání, Stavba přes
  cestu; Martin 23. 10. 2026: „Cesta, po které se nechodí, postupně zaroste a zmizí. Platí to pro
  každou cestu, i upravenou a vozovou, jen pro ty pomaleji.“). `Road.condition` – stav kusů osy ≈ 25 m
  (`roadPieces`: střed, `c`; jen kusy pod plným stavem, chybí = plný), plný stav
  `roadFullCondition` = `ROAD_DECAY[druh].keep × years × 365,25` (vyšlapaná 5 let, upravená i hať 15,
  vozová 30; čísla v `rules-roads.ts`). `settleRoadCondition` (`road-condition.ts`) se volá
  z `settleVillageWear` po `settleWear` se stejným polem a týmiž dny `from`–`to`, takže dopočet po
  kouscích = najednou (celá čísla; provoz kusu = medián provozu po cestě po 3 m, nejméně loňské
  jízdy vozů): `c = clamp(c + (provoz − keep) × dny, 0, plný)`. **Provoz po cestě** (Martin 25. 10. 2026: „proč by lidé chodili kousek vedle, když tam je cesta?“): `trafficOnRoads(routes,
cellM)` (`road-condition.ts`, index buněk tras v `WeakMap` podle pole tras) – součet `trips` tras,
  které mají buňku (`routeCells`) do `ROAD_TRAFFIC.bandCells` (0,75) buňky od bodu osy (pás jako
  `roadBandCells`), každá trasa jednou; ne provozní pole vyšlapanosti (`trafficAt` – pás ± 1 buňky
  3,75 m – zůstává pro vznik cesty a roční `road.traffic`). Ramena křižovatek provoz neurčuje
  (`junctionArm`, od 1. 11. 2026). **Opuštěný úsek** provoz nedostane nikdy (ani jízdy vozů) – bledne
  podle druhu. Kus pod hotovou stavbou: `capUnderBuilding` z `abandonBlockedStretches` (každý měsíc
  pro všechny opuštěné; kus osy s během ≥ `BLOCK_MIN_RUN_M` v neprůchodné ploše) – stav nejvýš
  `keep × ROAD_TRAFFIC.underBuildingDays` (330), zmizí do roka. Nezarůstá zemská stezka, cesta ve
  vylepšení (`fixedRoadIds`) a cesta, jejíž konec leží do `ROAD_ANCHORS.entranceM` od vchodu
  (kotva `entrance` z tras – ke stavbě se chodí; bez pole `Road.access`). **Zánik v `roadsMonth`**
  (1. dne v měsíci, po `settleVillageWear`, **před** vznikem `formRoadsKept`): `cutDeadRoads`
  (`roads-overgrow.ts`) – kus na nule pryč, celá cesta pryč, jinak `reshapeRoad` rozřízne úsek
  (první živý zbytek si nechá id, místa na stromy a jabloně jdou k nejbližšímu živému, `cutEnds`),
  kronika `road-overgrown`, pak `mergeRoadChains`; `abandonBlockedStretches` – kus osy v
  neprůchodné ploše hotových staveb (`villageBlockedAt` v `village.ts`: mřížka sítě pěšin, buňky
  `Infinity` mimo brány; pozemek, ohrada, hřbitov, okrsek svatyně, dům) se vyřízne jako
  `Road.abandoned` (řez o vzorek od stavby, zbytek < `MIN_ROAD_M` se přidá), celá cesta pod stavbou
  zůstane jedním opuštěným úsekem. Drží jen práce na cestě (`Construction.roadIds` – vylepšení,
  stezka ve stavbě), **úsek hotové zemské stezky ne** (Vlkov 24. 10. 2026: upravená cesta 4, úsek
  stezky 2178, vedla přes dvorec 1985 a polozemnici 2008 postavené po ní – `fixedRoadIds` ji
  vyňalo navždy); `retrailPieces` pak vede stezku po živých zbytcích v jejím pořadí od vsi ven
  (`againstAxis`), opuštěné ze stezky vypadnou a zarostou. Stará ves se srovná sama první měsíc.
  Test `road-under-house.test.ts` (stezka pod dvorcem, vozová cesta pod polozemnicí). **Opuštěný úsek není v síti:** `roadChains`/`roadChain`,
  `nearestOnRoads` (napojení, díry), `chainPair`, `mergeParallelRoads`, `removeBraids`,
  `endDegrees`, `markRoadEnds`, vznik cest (`eachWearRun` – není „už cesta“), `survivedTidy`
  ho přeskakují; jen bledne podle druhu a zmizí. Díky tomu objížďka kolem stavby přestane být
  „souběžná se starou cestou“ a vznikne. `withRoadCondition` (`update-village.ts`, jednou, příznak
  `VillageRoads.conditionSeeded`, nová ves ho má z `emptyRoads`): kus s provozem loni nad `keep`
  plný, jinak plný × (1 − tiché roky / roky druhu), nejvýš `years − 1` tichých let – nic nezmizí
  hned. Starý `Road.quiet`, `overgrowRoads`, `keepingApples` a roční zarůstání zanikly (jabloně
  cestu nedrží, péče a sklizeň jsou trasy). Web: `SceneRoad.fade` (bledé kusy – krytí od poloviny
  stavu úměrně, `fadeOf` ve `village-view-roads.ts`) → `roadBands` je dá do `strength`;
  `SceneRoad.abandoned` – `nearestRoad` ho nevybere.
- **Převod starých vsí (Úloha 14, Martin 23. 10. 2026: jednou a idempotentně):** `withRoadsV2(state,
landscape, obstacles)` v `paths/roads-v2.ts`, `updateVillage` ho volá po `withRoutes` (kotvy z tras).
  Starší ves bez `roads.v2` dostane hned `tidyRoadsNow` (`roads.ts`, týž úklid jako měsíční
  `tidyMonth` bez ohledu na `tidyKey`: souběžné cesty, copánky, díry, spojení, pahýly, cesty k
  vchodům, křižovatky; bez tras jen `tidyRoads` bez kotev), smažou se stará pole `LegacyRoadFields`
  (`candidates`, `endsChecked`, `parallelsChecked` – typy jen pro převody; `withJoinedRoads` zanikl)
  a nastaví se `v2` (nová ves ho má z `emptyRoads`). Upravené a vozové cesty zůstanou, nepoužívané
  bledne dál (`withRoadCondition`). `cutEnds` a `cartCandidates` zůstávají – pořád je čte a píše
  úklid a převzetí vyšlapaných cest vozy. Ves bez cest a ves s `v2` vrací týž objekt. Test
  `roads-v2.test.ts`.
- **Jednorázová přestavba sítě (Úloha R1, Martin 24. 10. 2026 – varianta A):** `withRoadsRebuilt(state,
landscape, obstacles)` v `paths/roads-rebuild.ts`; `updateVillage` volá po `withRoadsV2` jeho
  kroky `withRoadsRebuiltSteps` (`rebuiltWithPauses` – port `Pause` mezi průchody a kolem přepočtu
  vozových cest, generátor `rebuildRoadsSteps`). `roads.rebuilt` je verze přestavby
  (`ROAD_REBUILD.version`, 26. 10. 2026 verze 2 – paths.md, Jednorázová přestavba podle nových
  pravidel): přestaví se ves s `roads.v2`, s trasami a s nižší nebo chybějící verzí (nová ves má
  aktuální z `emptyRoads`); po přestavbě se smaže `repaired` / `repairFailed`, takže oprava
  (`withRoadsRepaired`, volá se hned po ní) proběhne znovu. Výjimka v přestavbě → klon vstupu
  s `rebuilt` a `rebuildFailed` = verze (stará síť zůstane, příště se nezkouší). Čistá
  `rebuildRoads`: `seedWear` (vyšlapanost z `trafficField(routes).cells` × `ROAD_REBUILD.seedDays`,
  max se stávající), zahodí úseky mimo pevné (`Construction.roadIds`, úseky nehotových stezek,
  vozové úseky na ose rozestavěných zemních prací – do `BUILDING_M` 1 m, opuštěné) a `junctions`,
  pak průchody `rebuildRoadsPass` (`roads.ts` – `roadsMonthRun` s `tidyKey` smazaným) → v 1.
  průchodu `patchAxes` (nepokryté kusy starých os hotových stezek přes `formRoad`; kus vozové
  vrátí jako upravený) → `transferUpgrades` (podíl délky do `nearM` od starých
  upravených / vyježděných / průsekových os, `shareNear`) → `restoreTrails` (`trailAxisRoads`,
  záložně s `trodden = true` a úpravou vyšlapaných úseků na ose) → `relinkTrees` (stromy bez místa
  k nejbližšímu úseku do `ROAD_TREES.offsetM.to + nearM`) a `relinkApples` → `lineRoads(all)` →
  `refreshWalkDistances` (nové trasy); konec, když se `networkOf` (osy živých úseků a středy
  křižovatek bez id) nezmění, nejvýš `ROAD_REBUILD.passes`. Nové úseky opuštěné v průchodu
  (id ≥ původní `nextId`) se smažou – kromě obejitých kusů vozových cest. **Vozové cesty (R2):** po
  ustálení `patchAxes` vrátí kusy starých vozových os dál než `nearM` od sítě a aspoň
  `ROAD_REBUILD.wagonPatchM` dlouhé, pak `rebuildWagonRoads` (`village/wagon-rebuild.ts`): staré
  hotové zemní práce dostanou `RoadEarthwork.abandonedDay` (terén zůstává – `terrainEditsOf`,
  `villageBlockedAt` je berou dál; `chainEarthwork` a `WagonPlanEarthwork.abandoned` je
  přeskočí), řetězy `roadChains` s podílem ≥ `share` do `nearM` od starých vozových os (bez
  vozových úseků a úseků v práci) se upraví a naplánují `planWagonRoad(wagonPlanInputOf(…))`;
  hotový plán zapíše `buildWagonRoadNow` (`wagon-road.ts` – zemní práce bez stavby, všechny
  `pieces` s `builtDay` = den přestavby, `buildPiece` – `addWagonRoad`, kácení, klády –, pak
  `absorbParallelRoads` a `abandonBypassed` jako `wagonRoadsDay`). Výsledek a počet průchodů
  v nepovinném `RebuildReport` (parametr `report` – testy a měření). Řetěz pod podílem: kusy jeho
  osy (`chainPoints`) u staré vozové osy souvisle aspoň `wagonPatchM` (`nearStretches`) se naplánují
  samy – `planWagonRoad` s `roads: [kus]` (syntetický upravený úsek id −1, řetěz je jen on),
  `buildWagonRoadNow` geometricky (`absorbParallelRoads` vyřízne starou cestu pod ním), zbytky
  napojí další ustálení. `patchAxes` napojuje konce vrácených kusů do `ROAD_JOIN.gapM` (12 m). Průchody dostanou `rebuildRoadsPass(…, RebuildHints)` → `roadsMonthRun` →
  `tidyMonth` → `rebuildJunctionHints` (`roads.ts`): úsek u staré vozové osy (`wagon`) má pro
  křižovatku šířku `ROAD_LAND.widthM.wagon` (`JunctionRoads.width`; práh živosti `asBuilt` odpadl
  1. 11. 2026 – ramenem je každý neopuštěný úsek), úseky stezek jsou `JunctionRoads.loose` (uzel při rozestupu nedrží,
     spojka se smí sloučit – stezka se znovu najde), takže křižovatky s budoucím vozovým ramenem se
     odsunou či sloučí předem. Po `patchAxes` vozových os se síť ustálí znovu (`settle(futureWagon)`
     – vrácený kus se napojí do uzlu u křižovatky, Vlkov J1130 5,9 m) a teprve pak se přepočítají
     vozové. Pak znovu průchody až do ustálení. Kronika se vrátí na původní délku, `flushWear` na
     konci.
     Pozor: vznik cesty (`commitDraft`) nahradí `state.roads` kopií – po průchodu číst znovu ze stavu.
     `trailAxisRoads` (`trail-axis.ts`) bere křižovatky jako jeden uzel (`junctions`, konce ramen
     nejblíž středu) – `restoredTrailPieces` je předává. Test
     `roads-rebuild.test.ts` (i syntetická ves s hotovou, nepoužitou a rozestavěnou vozovou cestou);
     měření Vlkova ve scratchpadu (`diag-rebuild/metrics.mts`). Scéna: `SceneEarthwork.abandonedYears`
     (`sceneEarthworks`) – svahy i lem opuštěné zemní práce zarostou za `SLOPE_LOOK.wildYears`
     (`slopeLattice`), opuštěná ustoupí živé zemní práci v dosahu svahů (`SlopeContext.live`) a živá
     na opuštěnou nenavazuje (konec se vytrácí).
- **Jednorázová oprava sítě (Martin 25. 10. 2026 – „ty cesty pořád zlobí“, hřbitov ve Vlkově):**
  `withRoadsRepaired` / `withRoadsRepairedSteps` (`paths/roads-repair.ts`) při načtení po přestavbě
  (`update-village.ts` – `withPauses`, port `Pause` mezi kroky), příznak `VillageRoads.repaired`
  (nová ves ho má z `emptyRoads`), chyba → `repairFailed` a ves beze změny (try/catch jako
  přestavba). `repairRoadsSteps`: `abandonBlockedStretches` (kusy pod stavbami, stav do roka) →
  `tidyRoadsNow` (díry i u hotových vozových cest, ohyb do branek, křižovatky) →
  `joinWagonChains` (řetěz bez vozové, oba konce na vozové cestě – `endsOf.wagonAt`: konec jiné
  vozové v témž bodě nebo rameno křižovatky s vozovým ramenem do 15 m –, podíl ≥ `share` u os
  hotových zemních prací → upravit, `planWagonRoad`, `buildWagonRoadNow`) → přepočet tras
  a úklid → `abandonLooseWagons` (vozová s volným koncem mimo kotvu, bez provozu po cestě a bez
  jízd → `abandoned`; ne do `ROAD_LOOSE_WAGON.freshDays` od dostavění – `wagonBuiltDay`, poslední
  `builtDay` živých hotových zemních prací pod úsekem, bez nich `bornDay` – a ne na hotových zemních
  pracích s aspoň jedním napojeným koncem) → přepočet tras a úklid. Diagnostika `RepairReport`. **Díry** (`firstGap`,
  `roads-tidy.ts`): vozová cesta se vynechá jen tam, kde její konec leží do 2 m od osy zemních
  prací se stavbou (`BUILDING_END_M`); opuštěné úseky nejsou cílem napojení. **Ohyb do branky**
  (`gateBend`, `roads-access.ts`): trasa ke stavbě (`accessRoutes`), žádný živý úsek nekončí do
  `ROAD_ANCHORS.entranceM` od vchodu, nejbližší úsek do té vzdálenosti není vozový ani zamčený
  (`GateGuard.fixed` = `fixedRoadIds`) → osa
  `axisSlice(0, at − bendM)` + bod `ROAD_GATE.frontM` před vchodem (po čáře trasy zpět) +
  `axisSlice(at + bendM, konec)`, jen když nová část osy po 0,5 m nikde neleží v `GateGuard.blocked`
  (`gateGuardOf` v `tidyMonth`: `villageBlockedAt` a voda bez brodu z `trailTerrain`, obojí líně);
  konce zůstanou, `ground` znovu, `lined` pryč. `accessDue` (se stejnou hlídkou) ho
  hlásí, takže úklid proběhne; podruhé nic (osa do `toleranceM` od bodu). Testy
  `road-condition.test.ts` (provoz po cestě), `road-parallel.test.ts` (vozové díry),
  `road-gate.test.ts`, `roads-loose-wagons.test.ts`, `roads-rebuild.test.ts` (oprava,
  `nearStretches`).

## Stálé trasy – cena pole a remízy

Návrh `docs/design/paths.md` – Stálé trasy (25. 10. 2026), Úloha A1.

- **Cena pole bez stadia:** `FIELD_WALK.field` 0,875 (cena 1,14 – průměr osevního postupu, Martin 26. 10. 2026 „A“; dřív 0,6) a `CART_SPEED.field` 0,25 (cena 4)
  v `rules-roads.ts`. `partWalkSpeed` / `isCropPart` (`paths/walk-speed.ts`) i `cartPartSpeed`
  (`paths/cart.ts`) znají jen zarostlý díl (křoviny, mladý les – chůze jako louka × `OVERGROWN_COST`,
  vůz neprojede); jinak stálá cena a pěšina dne přes pole nezrychlí. Dvoukolák i čtyřkolák stejně
  (`CartRoutesInput.fourWheel` zmizel), `harvestReachState` zmizel. `pathVillageOf` už nenese
  vzhled dílů (`look`, `work`, `before`, `partId`).
- **Trasa na pole jako celek:** cíl `field:<id>` jsou všechny buňky dílů (`network-targets.ts`) –
  s jednou cenou končí trasa na téže buňce v každém stadiu (`stable-routes.test.ts`).
- **Remízy vozu:** `cartRoutes` sčítá ceny kroků po kvantech 1/1024 m (`quantizedStep`,
  `STEP_QUANTUM` v `paths/network-search.ts` – součty ve Float64 přesné); při stejné ceně vyhraje
  předchůdce s nižším indexem stavu (buňka × směr), po posledním cíli se dobírají stavy se stejnou
  cenou a z koncových stavů cíle vyhraje nižší index (`PathHeap.peekKey`).
- **Remízy chodců** (A2a): `search` (Dijkstra z brány) v `network-search.ts` sčítá ceny kroků po
  `quantizedStep`, `trodden` bere sílu pěšiny po setinách; ze stejně drahých předchůdců vyhraje
  **vyšší** index (návrh Clauda – s nižším se v „jedna pěšina“ trasy sousedů nesejdou; každé pevné
  pravidlo dá přednost jednomu směru, slévání v zrcadleném rozložení není zaručené ani dřív).
- **Pošlapání zmizelo:** `CART_TRAMPLE`, `trampleSownParts`, `FieldPart.trampledM2`,
  `CartRoute.sown`, `RoadCartTrips.sown/spare`; `flushCartTrips(state, log)` jen sečte provoz cest.
  Starší ves převede `withoutTrampledParts` (`cart-jobs.ts`, v `updateVillage`) jednou
  a idempotentně.
- **Mapa tras a klíč** (A2b, [paths.md – Stálé trasy, pravidlo 5](../design/paths.md#stálé-trasy-25-10-2026)):
  `refreshWalkDistances` (`paths/village.ts`) drží v `VillageState.walkLayoutKey` = `routes.key`
  otisk `routeMapKey | WALK_VERSION` (`routes-v9` – bez tras k práci dne).
  - **Přepočet 1. dne měsíce** (8. 11. 2026, Martin: „a“): má-li ves platné trasy
    (`routes.key === walkLayoutKey`), jiný klíč mimo 1. den měsíce trasy nehledá – trasy,
    `walkLayoutKey` i vzdálenosti chůze zůstanou ze staré mapy, obsazenost je dál hned převáží
    (mřížka převážení podle dnešního klíče – `reweighedList(…, mapKey)`). 1. dne měsíce (po
    `roadsMonthSteps`) se přepočítá najednou za všechny změny. Hned: ves bez platných tras a volání
    s `now` (`repairRoads`, `rebuildRoads` – trasy po nové síti cest hned). Den přepočtu je den
    kalendáře, ne kousku dopočtu (test `změna mapy v půli měsíce – dopočet po kouscích`). Scéna
    trasy jen čte (`SceneVillage.routes`), vidí tedy tutéž starou mapu jako server.
  - **Denní kontrola mapy bez skládání klíče** (31. 10. 2026): `routeMapKey` vrací rovnou otisk
    (`KeyHash` – tytéž dvě FNV-1a jako `walkLayoutHash`, části klíče se míchají po řetězcích
    s oddělovači, celý JSON se neskládá). Zemní práce v klíči bez celého profilu – id, počet bodů
    a konce osy (`earthworksKey`; profil se určí se založením, nové zemní práce = nové id – u
    Vlkova byl profil 83 % klíče). Vlkov: klíč 303 kB → 64 kB, 2,8 → ≈ 0,7 ms za den.
    Počítadlo ve stavu zvyšované při postavení / zániku stavby (návrh na 31. 10.) zavedené není –
    změn mapy je přes 140 míst ve 45 souborech a zapomenuté místo by se neprojevilo (trasy by se
    tiše nepřepočítaly); otisk se den po dni shoduje se starým klíčem (`keycheck.mts` mimo repo –
    Vlkov 20 let a nová ves se správcem 15 let: každá změna starého klíče = změna otisku a naopak).
  - `routeMapKey` – obydlí a staveniště (poloha, natočení, druh, pozemek – bez obyvatel a stáří),
    díly polí (políčka, bez stadia), sady, hřbitovy, posvátná místa, ohrady (políčka, hotová),
    les vsi, milíře, humna, pevné cesty
    (`roadsKey` – olemování je součást cesty, v klíči zvlášť není), zemní práce a překážky
    k poslednímu 1. 11. bez stromů u cest (`routeTreesDay`, `routeTreesKey`; síť i `pathVillageOf`
    berou pařezy a mladé stromy přes `routeObstacleChanges` k témuž dni). Paseka rozestavěného
    pole v lese je les, dokud pole nedohoří (Klučení a mapa tras níž). Opuštění cesty síť nezná
    (`pathVillageOf` ho nepředává), stav kusů a provoz také ne.
  - **Obilné jámy mimo otisk** (Martin 9. 11. 2026 – [paths.md – Obilné jámy a vzdálenosti
    chůze](../design/paths.md#obilné-jámy-a-vzdálenosti-chůze-9-11-2026)): síť je bere jako cíle
    (`pathVillageOf` → `grainPits`, `network-targets.ts` – `grain-pit:<id>`), ale vykopání ani
    zánik jámy přepočet nespustí – trasa k nové jámě vznikne s nejbližším přepočtem z jiného
    důvodu. Mřížka převážení (`WEIGHT_GRIDS`, klíč `routeMapKey`) jámy nenese (`cellsAround` jen
    čte průchodnost), proto klíč bez jam stačí. Trasa k zaniklé jámě dostane převážením 0 cest
    (skupina `grain-pit:<id>` chybí); práce u jámy bez trasy do vyšlapanosti nic nepřidá
    (`laborCells` cíl nenajde) – nic nepředpokládá, že k jámě trasa vede (scéna `grain-pit` nezná).
  - **Otisk jen, když je potřeba** (9. 11. 2026, jen zrychlení): `refreshWalkDistancesSteps`
    počítá `routeMapKey` líně (`keyOf`) – 1. dne v měsíci, s `now`, u neplatných tras (otisk tras
    jiný než `walkLayoutKey`) a pro mřížku převážení při změně obsazenosti (`moved`). Jiný den
    s platnými trasami a stejnou obsazeností skončí bez klíče (dřív ≈ 0,25 s za rok Vlkova).
  - **Otisk vzdáleností chůze** (`VillageState.walkDistanceKey`, Martin 9. 11. 2026 – paths.md
    tamtéž): přepočet tras změří vzdálenosti (`walkDistanceKey` v `paths/village.ts`) jen při jiném otisku než
    uloženém. Otisk obsahuje vše, z čeho se staví graf chůze, půda a cíle, kromě čar pěšin
    (`villageRouteLines`) a zarostlých dílů: `WALK_VERSION`; obydlí (id, poloha – palivo a voda)
    a rozestavěná obydlí (poloha – `dwellingOrigins`); díly polí s políčkem (id, pole, políčko,
    mřížka pole – `squareCenter` cíle i čtverce `withFieldWalk`); čtverce sadů (id, mřížka,
    políčka); pevné cesty včetně opuštěných
    (id, stupeň, hať, všechny body osy, mokřina a brody `Road.ground`, olemování `Road.lined` –
    `roadPieceCost`); opevnění (`fortLayoutKey` – `withFortWalk`). Terén okna (`walkGroundOf`),
    okraj lesa a voda jsou z krajiny. Ves bez otisku (uložená dřív) změří vzdálenosti s nejbližším
    přepočtem tras a otisk uloží (jednou a idempotentně, převod není potřeba); bez sítě (`!network`)
    se vzdálenosti i otisk smažou. `now` (oprava, přestavba cest) vzdálenosti nevynutí (návrh
    Clauda) – jiné cesty změní otisk. Otisk se uloží až po změření (přerušený dopočet nenechá
    otisk bez vzdáleností). **Zarostlý díl** (rychlost chůze přes díl – `isCropPart`
    ve `withFieldWalk`) v otisku není, jako stadium u mapy tras (Martin 9. 11. 2026: „Ano, vynech
    je“): zarůstání ani vyčištění dílu vzdálenosti nepřepočítá, promítne se až s další změnou
    otisku (obydlí, pole, sady, pevné cesty, opevnění). Test „zarostlý díl otisk vzdáleností
    nemění“ v `routes.test.ts`.
  - **Jen stavba nebo zánik** (Martin 31. 10. 2026 – [paths.md, pravidlo 5](../design/paths.md#stálé-trasy-25-10-2026)):
    stálé trasy se hledají nad `establishedVillage` (`network.ts`) – každé hotové obydlí jako
    obydlené (lidé vsi rozdělení na všechna), každá hotová ohrada se zvířaty, každá obilná jáma
    otevřená (`PathVillage.grainPits[].open`). Hned po hledání je `routesOf` převáží podle skutečné
    vsi (`reweighedList`) – trasa z prázdného obydlí, k prázdné ohradě či zavřené jámě má 0 cest.
    Cache sítě (`villagePathNetwork`) je klíčovaná toutéž vsí, obsazenost ji nezmění.
  - `routePlacesKey` – obydlené domácnosti, ohrady se zvířaty, otevřené jámy. V otisku mapy není:
    změna (`VillageRoutes.placesKey`) v `refreshWalkDistances` hned převáží stálé trasy
    (`reweighRoutes`, značka `WEIGHED` i s obsazeností), nic nehledá. Vzdálenosti
    chůze se měří z nejbližšího obydlí i prázdného a rozestavěného (`dwellingOrigins`) –
    obsazenost je nemění.
  - **Olemování** (`paths/road-lining.ts`, Martin 31. 10. 2026 „Stromy jsou součást cesty“):
    `roadLining(road, apples)` z míst na stromy (`Road.spots`) a jabloní úseku (i čekajících
    a souší), bez dne. `lineRoads(state)` určí jen chybějící (nový či přestavěný úsek);
    vylepšení smaže olemování (`relineRoad` – `finishRoadUpgrade`, `upgradePieces` v `trail.ts`,
    úprava před vozovou cestou ve `wagon-rebuild.ts`), další přepočet chůze ho určí znovu.
    Převod `withPlannedLining` (v `updateVillage`) jednou – značka `VillageRoads.liningPlanned`.
  - Změna otisku = stálé trasy znovu (`computeStableNetwork` – síť bez práce dne, `stableVillage`)
    - vzdálenosti chůze (`villageRouteLines`) – od 9. 11. 2026 jen s jiným otiskem vzdáleností
      (`walkDistanceKey` výš). **Trasy k práci dne a na pastvu se nehledají**
      (Martin 31. 10. 2026 – `routes-v9`; dřívější `computeWorkRoutes`, `StoredRoute.daily`,
      `routes.workKey`, `routeMonthKey` zmizely, vsi uložené s nimi je zahodí přepočtem).
      Práce k cílům bez stálé trasy (kácení, seč, úprava cesty, opravy, humno, kovář…) do
      vyšlapanosti nic nepřidá (`laborCells` cíl nenajde).
  - 1. dne v měsíci beze změny otisku: `reweighRoutes` převáží stálé trasy (`stableRouteWeights` –
       skupiny bez hledání, váha domácnosti × `StoredRoute.scale` u dřeva; trasa bez skupiny 0
       cest). Opakované volání týž den (oprava a přestavba cest) převážení nepočítá znovu
       (`WEIGHED`, jen zrychlení). **Po trasách, ne po buňkách** (31. 10. 2026): váhy berou
       z mřížky jen průchodnost (brány domácností, buňky cílů), která se mění jen s mapou tras –
       `reweighedList` drží mřížku a terén okna posledního převážení po krajinách (`WEIGHT_GRIDS`,
       otisk `walkLayoutKey` + vrstva překážek) a `stableRouteWeights(input, grid)` ji jen
       použije; vyšlapanost po buňkách sčítá dál až `settleVillageWear` (`trafficField`). Výsledek
       bit po bitu stejný (Vlkov 100 dní týž otisk; test „mřížka z dřívějšího dne“).
  - Váhy: pole má stálou část `BASE_TRIPS.field` bez ohledu na stadia (dřívější `fallow` a poloviční
    stáří zakládaného pole zmizely). Práci dne k cílům se stálou částí nese stálá trasa: do
    vyšlapanosti `wear.labor`, do stavu cest `trafficOnRoads(…, labor)` (`laborTripsPerDay` –
    práce intervalu po cílech, podíl podle cest trasy – `tripsWithLabor` v `road-condition.ts`).
  - Převod: `withoutWalkStages` (v `updateVillage`) smaže `walkStages`; uložené trasy mají otisk
    starší verze → první den dopočtu je spočítá znovu i se vzdálenostmi chůze, podruhé otisk sedí.
  - Scéna: klíč tras `sceneRoutesKey` (otisk + počet a součet cest), aby klient dostal
    i převážení; známá vyšlapanost nese i `wearCellM` (převod 7,5 → 3,75 m týž
    den se pošle znovu).
  - Testy `routes.test.ts` – „trasy jen při změně mapy“ (i nastěhování / vystěhování a zapečetěná
    / otevřená jáma jen převáží), `road-tree-speed.test.ts` – olemování ve stavu vsi (zasazení
    jabloně ani uschnutí stromu přepočet nespustí, vylepšení a převod). Vlkov (kopie `vlkov.json`, rok po dnech
    od 7. 5. 816): stálé trasy se hledaly 11× → 7× (z toho 1× převod; 4× 1. dne v měsíci jiná síť
    cest, olemování nebo pařezy k 1. 11., 2× v půli měsíce jiné stavby či domácnosti), navíc 3× jen
    trasy k práci dne a na pastvu; 1× jen převážení. Stadia dílů žádný přepočet nevyvolala.
  - **Naměřeno 31. 10. 2026** (Vlkov, den 117895, 46 lidí, rok po dnech; skripty a logy mimo repo
    v `scratchpad/routes/`): stálé trasy 8× → 3× (před: 5× otevřená či zavřená obilná jáma, 1×
    nastěhování, 2× pařezy a stromy u cest; po: 1× převod `routes-v7`, 2× pařezy k 1. 11.), trasy
    k práci dne 10× → 10× (1. dne v měsíci), převážení 1× → 7× (6× obsazenost – jáma,
    nastěhování). Rok střídavě před / po při zátěži 13–24: 29,8–30,8 s → 26,3–26,8 s (−12 %);
    profil `refreshWalkDistances` 9,8 s → 7,8 s (`computeStableNetwork` 1,5 → 0,8 s,
    `walkingDistances` 3,3 → 1,7 s, z toho `groundWalkLength` 1,8 → 1,1 s; převážení 0,9 → 1,7 s).
    Vozy beze změny (`villageCartRoutes` 2,4 → 2,0 s, `villageCartCost` 4,0 → 3,5 s,
    `cartRoutesOn` 2,4 → 2,2 s, `cartGrid` 0,9 → 0,8 s – mřížka se staví 15–19× za rok, většinou
    kvůli kácení dne; klíč mřížky bere i `inhabited` obydlí).

## Odhad vzdáleností – simulace bez trasy vozu (31. 10. 2026)

Návrh [paths.md – Odhad vzdáleností](../design/paths.md#odhad-vzdáleností-31-10-2026) (Martin 31. 10. 2026: „simulace bude počítat jen s odhadem vzdáleností a přesné trasy zůstanou
prohlížeči – udělej to rovnou“).

- **Chůze** (`paths/walking.ts`): `groundWalkLength` = `straightWalkCost` (po půlbuňkách – mokřina,
  les `1 / PATH_FOREST_COST`, pole; pole v lese je vymýcené) a přes potok mimo brod (`WALK_DEEP` –
  `PATH_WATER` bez `PATH_FORD`) objížďka `fordDetour` – buňka brodu s nejmenším |a F| + |F b|
  (`groundSpots(ground, PATH_FORD)`), druhý úsek začíná ve vodě (brodí se jednou). Bez brodu v okně
  brodění kdekoli jako dřív. Paměť chůze (`memoWalkLength`) drží jen úsečky bez objížďky; úsečka
  přes potok má zápornou hodnotu a objížďka se skládá z úseček (`memoDetour`) – výsledek týž jako
  bez paměti. Graf pěšin a pevných cest (`walkGraph`) beze změny; **napojení jen v nejbližším
  bodě** (31. 10. 2026, `routes-v10`): `WalkGraph.chains` – uzly každé pěšiny a cesty v pořadí;
  `walkingDistances` seje Dijkstru jen z nejbližšího uzlu (vzdušnou čarou, `nearestNode`) každého
  řetězu ke každému obydlí a cíl bere z nejbližšího uzlu každého řetězu (ořez dolní mezí jako
  dřív) – jako `cartEstimates`. Vlkov: den s přepočtem chůze 2,3 → 1,8 s; vzdálenosti dílů
  medián +1,5 %, p90 +8 %, max +22 % (test „průchod všemi napojeními“ v `paths-walking.test.ts`).
- **Vůz** (`paths/cart-estimate.ts`): `villageCartEstimates(state, day, landscape, kind, targets,
from)` – výjezd z hotových ohrad se spřežením (`teamPens`) nebo z `from`; `CartEstimate`
  (`reached`, `cost` m po louce, `lengthM`, `end` – `reachM` před cílem na poslední úsečce).
  Půda vozu `cartGroundOf` po buňkách půdy chůze (`baseCost` – louka 1, mokřina `1 / CART_SPEED.wet`,
  les a neprůchodné Infinity, brod `CART_ROUTES.fordCost`, voda mimo brod `DEEP`; díly polí
  `1 / cartPartSpeed` – zarostlý Infinity, pole v lese vymýcené) – v paměti podle polí (jen
  zrychlení). Rovně `straightCartCost` po půlbuňkách, svah po kusech 4 kroků (`slopeCost` – do
  poloviny meze × (1 + gradeCost g² / max²), nad ní nejvýš serpentiny), potok `fordDetour`.
  Síť `cartRoadGraph` z `state.roads.roads` (`roadPieceCartCost` – `cartRoadSpeed`, mokřina na
  ose, brod `fordCost × widthM`; svah mimo vozovou cestu); výjezd a cíl se k ní připojí v nejbližším
  bodě každé cesty, Dijkstra (`PathHeap`). Nad `CART_ROUTES.maxCost` nedojede.
- **Kdo ho volá:** `villageCartDrives` (`cart-jobs.ts` – svoz, voda, uhlí, ruda, osivo; `nearest`
  už nic nemění), `networkCartAccess` (`carts.ts` – dosah svozu, `lengthM`), `tripCost`
  a `moveCost` (`plough-trip.ts` – spřežení k bloku a mezi bloky). `villageCartRoutes`
  a `villageCartCost` (mřížka vozu, `cart-memo.ts`) volá jen pohled na ves – `scenePloughLegs`,
  `cartRouteToday` (`apps/web/lib/village-view-crafts.ts`) – a roční síť vozů 1. 11.
  (`annualCartNetwork` – `cartRoutes`, jízdy roku do vyšlapanosti a příznak vozová).
- **Testy:** `walk-estimate.test.ts` – objížďka přes nejbližší brod (chůze i vůz), les, cesta
  zrychlí a lesem jen po ní, bez brodu vůz nedojede, simulace dne nestaví mřížku ani nehledá trasy
  vozu (obal `cartGrid` / `cartRoutesOn` / `cartCostOn` přes `vi.mock`), dopočet najednou = po
  dnech, odhad nezávisí na paměti půdy. `road-upgrades.test.ts` – objížďka mimo brod;
  `carpentry.test.ts` – díl na pasece za nevymýceným lesem vůz odhadem nedosáhne (pás pole 2
  mimo les).
- **Naměřeno 31. 10. 2026** (Vlkov, den 117895, 46 lidí, rok po dnech, střídavě, zátěž 6–14;
  skripty a logy mimo repo v `scratchpad/estimate/`): rok 25,8–26,2 s → 22,4–22,8 s (−13 %),
  `work` 5,9 → 1,9 s (`villageCartRoutes` 1,9 s a `villageCartCost` 3,4 s → `villageCartEstimates`
  1,2 s), `annualCartNetwork` 0,4–0,5 s (1. 11.), `walkingDistances` 1,6 → 2,1 s. Vlkov za 20 let:
  lidé 63 / 63, úroda +10,8 % (196,7 → 218,0 t), hladové dny 385 → 394, úmrtí hladem 0 / 0, dny
  orby 2 171 → 2 113, práce orby 7 170 → 7 804 čd. Nová ves zakladatelů (krajina 1, 15 let po
  10 dnech): bez správce beze změny, se správcem lidé 7/9/12 → 7/9/12, úroda 22,0 → 21,9 t,
  hladové kroky 99 → 104, cest 19 → 21.

## Trasy v paměti – vozy a chůze (výkon)

Plán `docs/superpowers/plans/2026-10-25-stable-routes.md`, Úloha B1. Jen zrychlení – výsledek je
bit po bitu týž jako bez paměti (Vlkov, rok vcelku: otisk stavu `75dad0432a58` před i po, i se
studeným startem každý den; `cart-memo.test.ts`).

- **Mřížka vozu** (`paths/cart-memo.ts`): `villageCartRoutes` staví `cartGrid` jen pro nový klíč
  `cartGridKey` – okno terénu (podle cílů), změny překážek dne (`obstacleChangesAt`) a z vsi
  přesně to, co mřížka čte: díly (políčko, poloha, velikost, natočení a ze stadia jen „zarostlý“
  – jinak stálá cena), les vsi, pevné cesty (osa, druh, stupeň, mokřina, olemování), sady,
  hřbitovy, ohrady, svatyně a modly, obydlí, milíře, humna, zemní práce. Stadia, lidé, práce dne
  ani den v klíči nejsou – táž mapa jiný den mřížku najde. „Zarostlý“ po dílech je v klíči zvlášť
  na konci (za `#`): mřížku, která se od mřížky v paměti liší jen jím (orba – díl po zoraném bloku
  přestane být zarostlý), `withPartStages` z ní odvodí – položí znovu jen vrstvu dílů (C3 níž).
  `routeMapKey` klíčem být nemůže (návrh Clauda): mřížka vozu bere pokácené stromy dne (ne
  k 1. 11.), zarostlé díly a olemování přesně (ne po desetinách) – s ním by výsledek nebyl týž.
- **Trasy po cílech:** `cartRoutesOn(grid, …)` – trasa k cíli nezávisí na ostatních cílech
  (hledání je do posledního cíle totéž, remízy podle indexu – A1), proto se známé cíle nehledají
  a neznámé dohledá jedno hledání. Hledání = vůz a místa výjezdu (ohrady se spřežením, nebo díl,
  odkud spřežení přejíždí – `plough-trip.ts`).
- **Meze paměti:** `WeakMap` podle krajiny, nejvýš 2 mřížky (nejdéle nepoužitá vypadne), na
  mřížku 64 hledání (nejstarší vypadne) po nejvýš 1 024 trasách (nad mez se hledání zapomene).
  K tomu mez buněk: součet `cells.length` pamatovaných tras na mřížku nejvýš
  `MAX_CELLS_PER_GRID` (200 tis.) – nad ni vypadnou nejstarší hledání (použité hledání se řadí na
  konec fronty), aby paměť při dlouhém dopočtu nerostla do stovek MB. `dist` / `parent` hledání se
  k mřížce nepamatují – všechna hledání sdílí jednu sadu polí (B2a níž).
  `forgetCartRoutes(landscape)` – studený start v testech.
- **Chůze** (`walkingDistances`, `paths/walking.ts`): horní mez napřed – rovně z obydlí ke každému
  cíli se spočítá první; uzel sítě, ke kterému je rovně aspoň tak daleko jako nejdelší z nich, do
  hledání nevstupuje (cestu k žádnému cíli nezkrátí). `cheapest` spočítá přesně napřed kandidáta
  s nejmenší dolní mezí a řadí jen kandidáty pod ním (dřív řadil všechny uzly sítě pro každý cíl);
  cesta přes síť se hledá rovnou s mezí „rovně z obydlí“. Vzdálenosti chůze se počítají jen se
  změnou otisku `walkLayoutKey` (mapa tras a místa – A2b).
- **Naměřeno** (Vlkov rok vcelku, `diag-b1/cpu.mts`, střídavě před / po při zátěži 3–10): stěna
  48,5–49,4 s → 38,4–40,6 s, CPU 54–55 s → 46–49 s. Zbývá: hledání tras vozu (`cartRoutesOn`)
  38 % – přejezdy spřežení mezi díly (každý z jiného dílu, v paměti se netrefí), voda vozem, dosah
  svozu; mřížka vozu z paměti v ≈ polovině volání (jinak nový díl nebo zarostlý díl). Přepočet
  chůze 31 % (`walkingDistances` 14 % – skoro celé `groundWalkLength`, síť pěšin 5 %). Další krok
  B2 (rychlejší `cartRoutes`).
- **Rychlejší hledání vozu** (B2a, `cartRoutesOn` v `paths/cart.ts`): stavy (buňka × směr) jen
  v typovaných polích, cíle po buňkách v řetězech indexů místo `Map`, pole `dist` / `parent` /
  ceny kroků jedna sada pro všechna hledání (roste podle největší mřížky – u Vlkova ≈ 45 MB)
  s razítkem běhu po buňkách místo nulování. Cena kroku z buňky bez zatočení se spočítá jednou za
  hledání pro všech 16 směrů (dřív v každém ze 16 stavů buňky znovu); zatočení se přičte zvlášť
  ve stejném pořadí sčítání. Cíl mimo souvislý kus mřížky depa (`cartParts` – kroky vozu bez
  ohledu na směr jízdy, krok platí oběma směry; po mřížce ve `WeakMap`) se nečeká – hledání
  skončí po posledním dosažitelném cíli místo prohledání celé mřížky do `maxCost`. Halda
  (`PathHeap`), pořadí kroků a pravidla remíz zůstaly, výsledek bit po bitu týž:
  `cart-routes-fast.test.ts` porovná s původní implementací (`fixtures/cart-routes-reference.ts`)
  50 náhodných map (rovné se samými remízami, pestré, drahé nad `maxCost`, zdi a nedosažitelné
  cíle). Otisk roku Vlkova `75dad0432a58` na stavu B1 před i po;
  na `feat/landscape` s ohradou koní `a92138125afb` před i po, vcelku i po dnech se studeným
  startem.
- **Naměřeno B2a** (Vlkov rok vcelku, `diag-b2/cpu.mts`, střídavě před / po, 2×, zátěž 7–27):
  stěna 38,2–39,1 s → 30,4–30,7 s, CPU 44,4–45,4 s → 34,7–34,8 s. `cartRoutesOn` 16,4 s (39 %) →
  8,4 s (27 %); 37 hledání z prvních 120 dní samostatně ≈ 6,9 s → 3,1–3,5 s CPU. Zbývá: hledání
  do konce mřížky, když cíl leží ve stejném kusu, ale vůz k němu nedojede (zatáčení) nebo je dál
  než `maxCost` – ≈ 35 % vytažených stavů; přepočet chůze (`walkingDistances` 20 %, z toho
  `groundWalkLength` 16 %), mřížka vozu (`cartGrid` 8 %).
- **Naměřeno B3 – souhrn** (Vlkov, den 115545, 32 lidí, rok dopočtu vcelku na jednom jádru;
  stroje bývají vytížené, proto rozsahy; skripty a logy mimo repo v `scratchpad/diag-b3/`):

  | stav                                  | rok, stěna  | rok, CPU    | poznámka                                                                               |
  | ------------------------------------- | ----------- | ----------- | -------------------------------------------------------------------------------------- |
  | před A (výchozí měření)               | 47–53 s     | –           | 130–145 ms/den; přes `updateVillage` při zátěži 26: 73 s                               |
  | po A (A1–A3, před B1)                 | 48,5–49,4 s | 54–55 s     | zátěž 3–10                                                                             |
  | po B1 (mřížky a trasy v paměti)       | 38,4–40,6 s | 46–49 s     |                                                                                        |
  | po B2a (rychlejší hledání vozu)       | 30,4–30,7 s | 34,7–34,8 s | otisk `a92138125afb`                                                                   |
  | po B2b, s kováním koní, 26. 10.       | 31,5–33,0 s | 36,0–37,9 s | zátěž 6,5; otisk `08dd07c6c8fe`; 31 dní 5,7 s, 1 095 dní 91 s (≈ 83 ms/den)            |
  | po C1 (cena A*, voda, chůze), 26. 10. | 26,1–27,6 s | 30,5–32,0 s | zátěž 11–58, střídavě s B3 (tam 36,4–39,5 s, CPU 40,5–40,6 s); otisky beze změny       |
  | po C2 (paměť chůze rovně), 27. 10.    | 22,0 s      | 27,1–27,2 s | se zvěří a klučením, zátěž 8–23, střídavě s C1 (29,0–29,4 s, CPU 33,9–34,4 s)          |
  | po C3 (orba vrstvou dílů), 27. 10.    | 18,9–19,0 s | 24,0–24,1 s | zátěž 2–3, střídavě s hlavou před C3 (27,0–27,2 s, CPU 32,4–32,8 s); otisky beze změny |

  Otisk stavu po 31 / 365 dnech vcelku i po dnech se studeným startem (`forgetCartRoutes` před
  každým dnem) je shodný (`66553dbed171` / `08dd07c6c8fe`); po 1 095 dnech vcelku `d765fb2240fd`.
  Otisk se od B2a změnil jen kvůli sloučenému kování koní (`f58780ee`) – na stavu B2a
  (`9cad0af4`) vychází stejný skript `a92138125afb`. Mezi B2a a „teď“ rozdíl v čase není
  měřitelný nad šumem (B2b a okrajové testy jádro nemění; kování přidalo trochu práce).
  Podíly kroků (profil roku, self / inkluzivně): `refreshWalkDistances` 39,5 % (z toho
  `walkingDistances` 19 %, `groundWalkLength` self 15 %), `work` 38,7 % (z toho
  `villageCartRoutes` 36,8 % napříč kroky – `cartRoutesOn` 27 %, self 25,5 %; `cartGrid` 7,5 %),
  zbytek dne ≈ 20 % (sezóna, pěšiny, hospodářství). Souběh dotazu a skoku: žádný skript z měření
  neumí souběžný dotaz proti skoku; pokrývají ho testy `exclusive.test.ts` (jeden dopočet, žádný
  konflikt verze, skok během dopočtu) a `village-action-day.test.ts` (den akce až ve frontě).
  Zbývá brzdit: `cartRoutesOn` (přejezdy spřežení mezi díly při orbě – `moveCost` 16 %,
  voda vozem 12 %) a `groundWalkLength`; cíl 20–25 s na rok tím není splněn (návrh Clauda).

- _*Jen cena trasy – A* s odhadem od cíle_* (C1, `cartCostOn` v `paths/cart.ts`): orba chce od
  trasy jen cenu – cesta spřežení z ohrady k dílu (`tripCost`) a přesun mezi bloky (`moveCost`
  v `plough-trip.ts`) volají `villageCartCost` (táž mřížka a paměť mřížek jako
  `villageCartRoutes`). Rozbor roku Vlkova (`scratchpad/diag-c1/`): 49 takových hledání, každé
  s jiným výjezdem i cílem (paměť tras proto netrefuje – opakování žádné), cena 2–4× vzdušné
  čáry (objíždění polí), 0–260 ms. Napřed hledání od cíle po buňkách bez směru jízdy (tytéž kroky
  a ceny kroků, jen bez zatočení), dokud nedojde k první buňce výjezdu (z jiných buněk výjezdu
  může být cesta zavřená); to je odhad zbytku pro A* se směrem jízdy (buňky dál = cena, kam
  hledání od cíle došlo). Odhad nikdy nepřecení (zatočení jen přidá, `quantizedStep` roste
  s cenou) a kroky jsou po kvantech – nejlevnější cena bit po bitu táž jako z `cartRoutesOn`
  (i „nedojede“ nad `maxCost`); trasa se nevrací, při remízách by mohla vést jinudy. 49 hledání
  roku 3,45 s → 0,93 s (`cart-routes-fast.test.ts` – 80 náhodných map, `cart-memo.test.ts`).
- **Voda vozem jen k nejlevnějšímu břehu** (`waterCartDrive` volá `CartDrives` s `nearest`,
  `cartRoutesOn(…, nearestM)`): ze 40 břehů se bere nejlevnější (po centimetrech, při remíze
  první v pořadí) – hledání skončí `NEAREST_DRIVE_M` (1 m) za prvním dosaženým břehem místo za
  posledním. Trasy do té ceny jsou bit po bitu tytéž (všechny stavy do ní jsou vytažené,
  předchůdci i remízy rozhodnuté), dražší břehy vrátí „nedojede“ a do paměti tras se nezapíšou.
  Rozbor: 22 hledání za rok (dvoukolák i čtyřkolák po změně rozložení vsi), dřív 3,4 s.
- **Chůze rovně po kusech stejné půdy** (`groundWalkLength`, `walkCellsOf` v `paths/walking.ts`):
  půda po buňkách jednou za objekt půdy (rychlost, voda, osev) a součty švů (buňka jiná než
  soused vpravo / dole) po obdélnících. Kus 8 kroků úsečky, jehož obdélník mezi krajními kroky
  (s buňkou rezervy) leží celý v mřížce a bez švu, sečte tentýž člen 8× bez čtení buněk – ve
  stejném pořadí, bit po bitu týž (`ground-walk-fast.test.ts` proti původní funkci). U Vlkova
  84 % kusů. Rozbor: 2,2 mil. volání za rok, 418 mil. kroků; táž úsečka se mezi 13 půdami roku
  opakuje ≈ 8×, jenže pole se mezi nimi mění – paměť výsledků by musela hlídat změněné buňky
  (další možný krok, návrh Clauda).
- **Naměřeno C1** (Vlkov rok vcelku, `diag-b3/cpu.mts`, střídavě před / po 2× při zátěži 16–58):
  stěna 36,4–39,5 s → 26,1–27,1 s, CPU 40,5–40,6 s → 30,5–31,3 s (≈ −25 % CPU); při zátěži ≈ 6
  jako u B3 odhadem ≈ 23–24 s. Otisk po 31 / 365 / 1 095 dnech vcelku `66553dbed171` /
  `08dd07c6c8fe` / `d765fb2240fd`, po dnech se studeným startem po 365 dnech `08dd07c6c8fe` –
  beze změny. Zbývá (profil roku): přepočet chůze 46 % (`walkingDistances` 21 %, z toho
  `groundWalkLength` 16 %; síť pěšin 8 %), mřížka vozu 9 % (při orbě nový klíč s každým zoraným
  blokem – díl přestane být zarostlý), hledání tras vozu 11 % (dosah svozu – stovky cílů).
- **Paměť chůze rovně po úsečkách** (C2, `WalkMemo` v `paths/walking.ts`): přepočet chůze vsi
  (`refreshWalkDistances` – díly a sady, palivo, voda) volá `walkingDistances` s pamětí krajiny
  (`walkMemoOf`). Chůze rovně bez pěšiny se pamatuje podle krajních bodů úsečky (přesná čísla
  v otevřené tabulce, ne řetězce). Délka závisí jen na buňkách půdy v obdélníku kolem úsečky
  (krajní buňky ± 2 – kroky i obdélníky kusů leží uvnitř), proto záznam platí, dokud se tam žádná
  buňka nezmění. Paměť drží buňky půdy poslední generace: nová půda se stejným obsahem (nový objekt
  každým přepočtem) generaci nemění; jiné buňky (díl přibyl, zmizel, zarostl, zoral se) založí
  další generaci se součty změněných buněk po obdélnících (jako švy) – záznam předchozí generace
  se ověří jedním součtem obdélníku, jinak se spočítá znovu, starší záznamy vypadnou. Meze:
  tabulka nejvýš 2¹⁸ míst (≈ 11,5 MB, zaplní se nejvýš ze ¾ – nad mez se nezapisuje), paměť nejvýš
  pro 2 krajiny (`WeakRef`, nejstarší vypadne – server drží v mezipaměti až 32 krajin);
  `forgetWalkMemo(landscape)` – studený start. Jen zrychlení, bit po bitu tytéž délky:
  `walk-memo.test.ts` (30 náhodných map se sledem půd – stejná, málo a hodně změněná, bez polí;
  přepočet vsi s přidanými a odebranými díly teplou pamětí = studený start před každým
  přepočtem; test selže, když se změny buněk neověřují). Rozbor roku Vlkova
  (`scratchpad/diag-c2/`): 11 přepočtů mapy tras za rok (≈ 3 570 cílů, 1 218 uzlů sítě,
  10 obydlí), 2,13 mil. délek rovně přes paměť (258 tis. různých úseček); z paměti 81,5 % (46 %
  tatáž generace, 35,6 % ověřeno proti změnám), 7 % změněno, 11,5 % nových; půda se změnila jen
  v 5 z 10 přepnutí. `groundWalkLength` 4,1 s → 0,75 s, `walkingDistances` 4,9 s → 2,3 s.
- **Naměřeno C2** (Vlkov `diag-stable/vlkov.json`, den 116 771, rok vcelku, `diag-b3/cpu.mts`,
  střídavě před / po 2× při zátěži 8–23; od C1 přibyla divoká zvěř a klučení lesa – otisk proto
  jiný než u C1): stěna 29,0–29,4 s → 22,0 s, CPU 33,9–34,4 s → 27,1–27,2 s (≈ −20 % CPU). Otisk
  po 31 / 365 dnech vcelku `3ed8a413850e` / `ebd291dad162`, po dnech se studeným startem
  (`forgetCartRoutes` i `forgetWalkMemo` před každým dnem) po 365 dnech `ebd291dad162` – před
  i po stejný. Zbývá (profil roku, 22,6 s): přepočet chůze 38,5 % – síť pěšin
  (`villagePathNetwork`) 9,3 %, `walkingDistances` 9,3 % (dolní meze přes všechny uzly sítě pro
  každý cíl; omezení na uzly blíž než rovně z obydlí ušetřilo jen 0,2 s – nezařazeno), trasy
  k práci (`routesOf`) 6 %, klíč mapy tras každý den (`routeMapKey`) 2,8 %; `work` 30 % – mřížka
  vozu ≈ 10 % (při orbě nový klíč s každým zoraným blokem – inkrementální mřížka by musela
  hlídat překryvy polí a přepsání pozdějšími vrstvami), ceny přesunů spřežení 11 %.
- **Klučení a mapa tras** (rozbor C2; [forest.md – Klučení – trasy](../design/forest.md), Martin 27. 10. 2026): klíč mapy tras bral počet `clearedObstacles` bez dne (`routeTreesKey`), proto se
  mapa tras přepočítala každý den, kdy dohořel díl klučení. Teď je paseka rozestavěného pole v lese
  pro trasy les, dokud pole celé nedohoří (`paths/clearing-routes.ts`):
  - `clearingRouteObstacles(state)` – překážky dílů stavby pole (`Construction.kind === 'field'`):
    dohořelé díly (`Construction.burntObstacles` – `foundPart` do něj při dohoření dílu s `clearing`
    připíše `obstacles` a stromy `clearing.fell`) a zakládané díly s `clearing` (`obstacles`
    a `clearing.fell`). Bez rozestavěného pole v lese null.
  - `withoutHiddenChanges` z `clearedObstacles` a `felledTrees` tyto překážky vynechá – volá ho
    `treesAtCut` (`routeObstacleChanges` – síť pěšin, `pathVillageOf`), `routeTreesKey` (počty
    v klíči) a `cartGridOf` (`roads-carts.ts` – změny dne pro mřížku vozu a `cartGridKey`).
    Klíč mapy se tak za kácení, schnutí ani pálení nezmění; se skončením stavby pole zmizí
    `burntObstacles` i zakládané díly a klíč se změní jednou.
  - Scéna a ostatní jádro (`obstacleChangesAt` – stavby, palivo, cesty) vidí paseku hned.
    `burntObstacles` je volitelné; rozestavěné pole uložené dřív nemá dohořelé díly v seznamu –
    ty jsou v trasách už vyklučené, zbytek pole čeká na dohoření (převod netřeba).
  - Pole na lese vsi (`clearWoodAt` mění `woods` v klíči) se dál projeví s každým dílem.
  - Test `forest-clearing-routes.test.ts` (pole v lese s 5 čtverci – klíč se změní jen v den
    dohoření pole, scéna vs. trasy, vcelku = po dnech = po 7 dnech). Vlkov (`feb.json`, březen 822
    po dnech): přepočtů mapy tras 8 → 2 (první den dopočtu a den po dohoření pole), březen po dnech
    8,6 s → 5,4 s, dopočet vcelku = po dnech; rok s polem v lese (po 30 dnech) 26,1 s → 23,7 s
    (březen 5,3 s → 2,3 s); osetí dílů beze změny.
- **Mřížka vozu při orbě jen vrstvou dílů** (C3, `withPartStages` v `paths/cart.ts`): `cartGrid`
  si k mřížce pamatuje vrstvu dílů polí (`CartFieldCells` – buňky po polích v pořadí, v jakém je
  vrstva položila, nejbližší díl a cenu buňky před vrstvou), jen buňky, které pozdější vrstvy (les
  vsi, pevná cesta, sad, hřbitov, ohrada, svatyně, stavby) nepřepíšou. Liší-li se nový klíč mřížky
  od mřížky v paměti jen „zarostlý“ dílů (`cartGridKey` je má zvlášť na konci), `memoGrid` ji
  předá `makeGrid` a ta položí vrstvu dílů znovu s novými stadii – ve stejném pořadí na tytéž ceny
  před vrstvou, bit po bitu jako celá mřížka (i pole přes sebe – nejpomalejší platí, zarostlý
  neprůjezdný). Rok Vlkova: 41 staveb mřížky → 28 celých a 13 odvozených (zlomek ms místo
  ≈ 85 ms). Rozbor (`scratchpad/diag-c3/`): z 28 celých 14 kvůli jinému oknu terénu (cíle mimo
  ves – svoz, voda; víc mřížek v paměti by ušetřilo jen 4 stavby za cenu paměti), zbytek nové
  cesty, obydlí a pokácené stromy. Test `cart-grid-stages.test.ts`: 60 náhodných vsí s poli přes
  sebe, cestou, sadem, ohradou, svatyní a stavbami přes pole – odvozená (i z odvozené) = celá
  mřížka bitově; selže, když se přepsané buňky nevynechají.
- **Buňky polí v paměti** (C3, `fieldCellsOf` v `paths/network-grid.ts`): buňky pole
  (`squareCells`) a nejbližší díl každé buňky (`nearestPartFinder`) počítala mřížka vozu, mřížka
  pěšin (`villageGrid` – síť i trasy k práci) a půda chůze (`withFieldWalk`) pro tatáž pole znovu
  a znovu (dřív ≈ 10 % roku). Teď z paměti podle okna mřížky a čtverců dílů (políčko, poloha, velikost,
  natočení – nic jiného obojí nečte), nejvýš 256 polí (nejdéle nepoužité vypadne),
  `forgetFieldCells()` – studený start. Tytéž buňky ve stejném pořadí a tentýž díl
  (`cart-grid-stages.test.ts` – 80 náhodných polí, i natočená a v menším okně, teplá i studená
  paměť, díl posunutý na místě).
- **Orba v plánu osevu jednou** (C3, `lordHelpDay` v `simulate-plan.ts`): `sowingCapacity` se
  volá dvakrát (bez rodiny a s ní) a orba spřežení (`plannedFurrowEfficiency` – brázdy po pásech
  přes pevné cesty) na rodině nezávisí – podruhé se převezme (`ploughCapacity`; test
  `lord-sowing.test.ts`). Dřív ≈ 5 % roku, polovina zbytečně.
- **Naměřeno C3** (Vlkov `diag-stable/vlkov.json`, rok vcelku, `diag-b3/cpu.mts`, střídavě před /
  po 2× při zátěži 2–3; hlava před C3 je pomalejší než C2 – přibyla scéna humna, rekvizity
  a další mechaniky): stěna 27,0–27,2 s → 18,9–19,0 s, CPU 32,4–32,8 s → 24,0–24,1 s (≈ −26 %
  CPU). Otisk po 31 / 365 dnech vcelku `c5f5010daa4f` / `d3f7d44c5d6a`, po dnech se studeným
  startem (`forgetCartRoutes`, `forgetWalkMemo` i `forgetFieldCells` před každým dnem) po 365
  dnech `d3f7d44c5d6a` – před i po stejný. Zbývá (profil roku, 19,7 s): přepočet chůze 42 % –
  `walkingDistances` 15 %, síť pěšin 11 %, trasy k práci 6 %, `routeMapKey` 3 %; `work` 26 % –
  hledání tras vozu (`cartRoutesOn`, svoz a voda) 13 %, ceny přesunů spřežení 4 %, mřížka vozu
  4,5 %; plán sezóny 7 % (`neededSelection` 3 %).

## Brány opevnění v síti (Ú5.3, 6. 11. 2026)

Pravidla: [fortifications.md](../design/fortifications.md) – Brány, Pro implementaci (Chůze
a cesty); opevnění samo: [village-fortifications.md](village-fortifications.md).

- **Stěny** – `fortWalls(geo, fort, work)` (`fortification/walls.ts`, deterministická vrstva):
  pás každého **blokujícího** úseku (`segmentBlockKind` – Martin 6. 11. 2026: celý obvod blokuje
  od zahájení stavby) jako čtyřúhelníky z `fortBandPieces` se šířkou druhu, jak bude postaven
  (vylepšení plotu od zahájení pásem palisády); brána z pásu strany vyřízne obdélník 4 m kolem
  středu (`offsetM` od začátku rovné části = `endRadius` předchozí strany + `offsetM`) – otvor
  přes celou šířku pásu. Blokuje stojící úsek i staveniště běžící stavby (`work` =
  `fortRunningWork`); mezera po zrušené stavbě, mezera po chátrání (stav 0) a průlom stěnu
  nemají – jsou průchozí.
- **Ves pro pěšiny** – `PathVillage.fortifications` (`PathFortification { id, walls, gates }`)
  skládá `pathFortificationsOf(state, geo)` v `pathVillageOf`; opevnění bez blokujícího úseku
  vynechá a **ves bez blokujícího opevnění údaj nemá** – JSON vsi, klíče a mřížky beze změny.
- **Ploty** – `villageFences` vrací i opevnění: `outline` je obrys stěn (`wallOutline` – hrany
  čtyřúhelníků, uvnitř = uvnitř stěny) pro odstup osy trasy (`routeLine`, `fenceClearance`,
  `wagonFenceAt`), `wall` nese stěny a brány. `gridFences` z nich udělá buňky (`fortWallCells`):
  buňka, které se stěna **dotkne čtvercem buňky** (`quadTouchesSquare` – oddělující osy), je stěna,
  buňka, které se dotkne otvor brány, je brána. Stěna užší než buňka (plot 1 m, buňka 3,75 m)
  tak síť nepropustí ani úhlopříčným krokem, brána vede přes celý pás aspoň sloupcem buněk.
- **`fenceBand`** – stěny opevnění pruh ani uličku plotů nemají (v počítání plotů u buňky se
  vynechají – hřbitov a ohrada se chovají jako dřív), jejich buňky jdou rovnou do `blocked`;
  buňky bran patří mezi branky (pruh jiného plotu je nezavře). Tímtéž `fenceBand` jde mřížka
  chodců (`villageGrid` – pěšiny, **stádo na pastvu** – cíl `pasture`, práce, voda, dřevo)
  i mřížka vozové cesty (`wagonRoadGrid` – plánuje se jen branou).
- **Vůz** – `cartGrid` (`cart.ts`) zablokuje buňky stěn (`fortWallCells`) jako plot hřbitova:
  vůz pro seno, dříví či hnůj projede jen branou (4 m – vůz se spřežením), i po pevné nebo vozové
  cestě. Prohlížeč počítá trasy vozů z `CartWorld` (`cartWorldOf` → `pathVillageOf`) a náhled
  vozové cesty z `SceneVillage.fortifications` (`pathFortificationsOf`) – tytéž funkce.
- **Cesta přes opevnění dostane bránu** – `gateRoadCrossings(state, geo)` (`fortifications.ts`)
  každý den před přepočtem tras (`simulate.ts`, po `roadFieldsDay`): blokující úsek bez brány,
  který protne osa pevné cesty (i vozové a zemské stezky – `roadAxes`), dostane bránu u prvního
  průsečíku (`roadGates` v `gates.ts`, jako `autoGates`). Tak bránu dostane nová cesta
  z vyšlapanosti, dostavěný úsek vozové cesty a stezky i staveniště opevnění přes starou cestu
  (hned se zahájením – blokuje od něj). Ves bez opevnění nebo bez cest beze změny.
- **Klíče a `WALK_VERSION`** – `fortLayoutKey(state)` (plocha, druh, blokující úseky s druhem
  pásu – `fortBlockingSegments`, brány; bez opevnění null; ne den dokončení, průběh ani stav
  úseků, který blokování nemění) se připojí na konec proudu `routeMapKey`, do `fenceLayoutKey`
  a klíče `villageBlockedAt`; `cartGridKey` bere `village.fortifications`. Vše jen když opevnění
  je, takže **ves bez opevnění má klíče, mřížky, trasy i vozovou síť bit po bitu stejné**
  (zlatý otisk v `paths/__tests__/fortification-paths.test.ts`; Vlkov ověřen 6. 11. 2026 –
  klíč mapy, mřížky chodců, vozové cesty i vozu a stálé trasy beze změny). Ves s opevněním
  dostane nový klíč mapy sama (opevnění je v něm), proto **`WALK_VERSION` zůstává `routes-v11`**
  – nová verze by jen jednou přepočítala trasy všech vsí se stejným výsledkem.
- **Měření 6. 11. 2026** (blokování od zahájení): dřív každý dokončený, přestavěný či chátrající
  úsek změnil `fortLayoutKey` → `routeMapKey` → plný přepočet sítě pěšin (≈ 1,3 s), při stavbě
  plotu 35–57× za rok. Rok Vlkova s plotem (60 úseků, položen 30. 4. 862): **50,6 s → 14,8 s**
  (dnů nad 500 ms 33 → 5); bez plotu 11,0 s → 10,5 s, rok Vlkova bez opevnění (simulace) 12,1 s
  → 12,1 s a stav po roce bez opevnění bit po bitu stejný.
- **Chůze a stěny** (6. 11. 2026, Martin: „někteří lidi procházejí palisádou“) – odhad chůze
  simulace (`walkGraph`, `walkingDistances`) i trasy postav ve scéně (`walkingRoute`,
  `path-router.ts`) jdou stěnou jen branou. Dřív stěny znala jen mřížka sítě pěšin: Vlkov
  (palisáda, 60 úseků, 7 bran) – z 38 048 tras obydlí → díl pole, les, voda šlo stěnou 11 446
  (úseky rovně k cíli 2 545, rovně celé 1 077, po pevné cestě 7 882 – vozová cesta 1264 protne
  úsek s branou 1–2 m vedle otvoru, upravená cesta 1495 roh bez brány), ve scéně 81 z 569
  uložených tras s odbočkou rovně. Teď: `withFortWalk(ground, village.fortifications)`
  (`walk-walls.ts` – `walkWallsOf`, `cutsWall`, `wallDetour`) dá půdě chůze stěny. Úsečka rovně
  (k síti, od ní k cíli, celá) i úsek osy pěšiny či pevné cesty přes stěnu mimo bránu jde
  **objížďkou** (`wallDetour`): nejkratší lomená čára přes graf objížďky (`detourGraphOf` – středy
  otvorů bran a vypouklé rohy pásu stěn odsazené o 1 m, úsečky bez stěny, nejkratší cesty mezi
  všemi body; v paměti podle stěn, dosah bodu do grafu také – `reachOf`) – rovně k bráně, branou,
  kolem rohů k cíli. Cena objížďky = chůze rovně po půdě po jejích kusech; body objížďky jsou
  v trase postavy (`walkingRoute` – `gateLegs`) i v řetězu grafu chůze (`walkGraph`). Přirážka
  `WALL_CLIMB_M` (1000 m) jen jako poslední záchrana, kam se bez stěny dojít nedá (opevnění bez
  brány, kout mezi stěnami). Volající předá mez (`straight(…, limit)` – dosavadní nejlepší): objížďka
  s dolní mezí (vzdušnou čarou po lomené čáře) aspoň mez se nedopočítá – výsledek týž. Osa stálé
  trasy jde středy buněk brány (`fortWallCells` – buňka, které se otvor dotkne), proto smí zasáhnout
  do stěny nejvýš `GATE_SLACK_M` (1 m) od otvoru; úsečky rovně a osy pevných cest bez rezervy.
  Scéna: `routeWalker.route` nevezme uloženou trasu, jejíž osa nebo odbočka rovně jde stěnou
  (`walkRoute` pak jde po síti), záložní `straightRoute` jde objížďkou (`VillagerPaths.gates`);
  půdu se stěnami staví `path-renderer.ts` (`walkGround` – `SceneVillage.fortifications`). Vlkov
  po opravě: 0 z 38 048 tras jde stěnou mimo bránu (jen osy pěšin do 1 m u otvoru), ve scéně 0
  z 532 uložených tras; graf objížďky 64 bodů, `walkingDistances` všech dílů 0,32 → 0,47 s.
  Opevnění z bodů má stovky kusů pásu – stěny hledá mřížka obalů (`wall-grid.ts`: `cutsWall`,
  obrys stěn `wallOutline` s `FenceOutline.near`), stejné stěny jsou tentýž objekt (`walkWallsOf`)
  a graf objížďky si pamatuje i viditelnost cíle (village-core.md – Kolo 2 výkonu dopočtu).
  Ves bez opevnění: `withFortWalk` vrátí tutéž půdu,
  graf i ceny bit po bitu stejné – `WALK_VERSION` zůstává (scéna počítá trasy za běhu, uložené
  vzdálenosti dílů vsi s opevněním se srovnají při dalším přepočtu tras).
