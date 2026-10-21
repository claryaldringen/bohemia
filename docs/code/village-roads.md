# Ves – pěšiny, cesty, vozová síť

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: paths.md, roads.md, wagons.md v `docs/design/`.

- **Vyšlapané pěšiny** ([docs/design/paths.md](../design/paths.md), Martin 18. 10. 2026 –
  i práce): síť počítá herní jádro `domain/village/paths/` stejně na serveru i v prohlížeči
  (soubory jsou v deterministické vrstvě – ESLint zakazuje Math.sin/cos/hypot/log, `**`; jen
  det-math). `terrain.ts` (cena chůze po bodech mřížky ≈ 3,75 m z krajiny: bilineární výška,
  sklon, voda a brody z osy potoka, les; `pathTerrainOf` – výřez z mezipaměti podle krajiny,
  nezávisí na jejím stavu; `withObstacles` – kmeny, keře, balvany, výchozy), `network.ts`
  (`computePathNetwork(PathVillage)` – cesty domácností pro vodu a dřevo každá zvlášť s napojením
  na pěšinu souseda – **pro vodu vždy k nejbližší vodě v okně, bez meze a naplno** (0,4 cesty na
  člověka – `WATER_FETCHING`; dřevo nejvýš 450 m a za 130 m řidčeji – `nearCost`; okno sítě
  `villagePathBounds` sahá k nejbližší vodě – `nearestWaterTiles`, jen k ní, ± 45 m, do 1 000 m), do cílů podle práce dne + základ zavedených míst (ke společnému cíli každá
  domácnost zvlášť A* od cíle k bráně, nejvytíženější první – další se přidá k čerstvě vyšlapané
  pěšině, souběžné pěšiny nevzniknou), k sousedům; 2 kola,
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
  obcházení delší; vozy přes osetý díl dál ne;
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
  Scéna `path-renderer.ts` (`VillagePaths` v `LandscapeScene`: přepočet jen při změně
  `pathNetworkKey`, odloženě; výpočet sítě, obtisky a pás pod nimi v polích jdou ve třech
  úlohách – mezi ně se vejde snímek pohybu kamery) – obtisky `paths-worn` / `paths-earth` z `path-ribbon.ts` **nad**
  obtisky polí a vsi (alphaIndex 3 / 3,5, lift 0,05 / 0,055, zOffset −3,5 / −4; přes osetý díl
  úzká stopa; v pevné cestě se pěšina dne ztrácí – `roadFade`; rozcestí – konec aspoň tří čar –
  je udusaný plácek `ribbonJunctions` / `JUNCTION`, u pevných cest `roadJunctions`). **Pěšina dne
  je nevýrazná** (Martin, 19. 10. 2026: „denní pěšina ať je nevýrazná“): vrstvy `PATH_WORN_LAYER`
  / `PATH_EARTH_LAYER` – slabě prošlapaná tráva 0,6–1,2 m, krytí 0,2–0,45, holá hlína jen u silné
  pěšiny, úzká a slabá, rozcestí jen jemně (`RibbonLayer.junction`); pevná cesta (`ROAD_*`) je vedle
  ní jasně výraznější. Sníh přes `applySeasonGround` – materiály pěšin a cest zvlášť
  (`decalMaterial(group, kind)`, `SNOW`: pěšina dne 0,3, ať stopa ve sněhu trochu prosvítá, cesta
  0,55). Pěšiny dne stromy nemají (stromy jsou jen u pevných cest – níž).
  Postavy: `path-router.ts` (trasa s tempem úseků) → `VillagerPaths.route` →
  `route(points, pace)` – `shuttle` jde po pěšině rychleji. Vývojová stránka: tlačítka
  **Pěšiny**, **Cesta** (ukázka pevné cesty se stromy v každém stadiu – `dev-road.ts`), **Provoz**
  (teplotní mapa) a **Stáří**.

- **Pevné cesty a stromy u nich** ([docs/design/roads.md](../design/roads.md) – fáze 1; výběr,
  vylepšení a chůze podle stupně = fáze 2, jabloně = fáze 3): simulace vsi (server) – modul
  `domain/village/paths/roads.ts` (deterministická vrstva jako pěšiny), z `simulateDay` jediné
  volání `roadsDay` na konci dne (jen s krajinou; bez ní – kalibrace – žádné cesty). Stav
  `VillageState.roads` (volitelný – starší vsi začnou sčítat při prvním dopočtu): úseky `Road`
  (id, osa na cm, den vzniku, stupeň `RoadGrade` – zatím jen `trodden`, provoz posledních 5 let,
  místa na stromy `spots` určená jednou při vzniku), stromy `RoadTree` (id od `ROAD_TREE_ID_BASE`
  nad id vrstvy překážek, místo, poloha, druh, den uchycení a smrti), loňské úseky nad prahem
  `candidates` a práce roku cest po místech `labor` (od 1. 11., z rozdělení práce dne). Roční
  kontrola 1. 11. (`updateRoads`): roční síť `annualPathNetwork` (stejná `computePathNetwork`,
  průměrné člověkodny na den, sleva za pevné cesty) → provoz cest (`roadTraffic` – medián
  `traffic.raw` po ose) a zarůstání vyšlapané cesty **po kusech** (Martin, 19. 10. 2026 –
  roads.md, Zarůstá jen nepoužívaný kus: `overgrowRoads` – osa po kusech ≈ 25 m `roadPieces`,
  tichý kus pod polovinou prahu sčítá roky v `Road.quiet` (střed kusu, roky – jen tiché kusy,
  starší vsi od další kontroly), po 5 letech zaroste – celý úsek zmizí, jinak `cutOvergrown`
  vyřízne tiché kusy a zbytek zůstane se starým id, konec u zarostlého kusu volný
  `VillageRoads.cutEnds`; nezaroste cesta, která se vylepšuje – `roadsInWork`, kus u živé jabloně
  – `keepingApples`; upravená a hať nezarůstají) → nové cesty z úseků nad prahem
  (`ROADS.tripsPerDay`), které leží i na loňských (`MATCH_M`) a nevedou po pevné cestě; konec se připojí k pevné cestě a ta se v rozcestí rozdělí (`splitRoad`) – osa se
  jinak nikdy nemění → **falešná rozcestí** (uzel jen se dvěma úseky stejného stupně, bez
  rozdílného vylepšení) se spojí (`mergeRoadChains` – i po dokončení vylepšení ve
  `finishConstructions`, starší vsi při načtení `withMergedRoads` v `updateVillage`; id a den
  vzniku staršího, roads.md – Úseky a rozcestí; dva úseky mezi stejnými uzly do okruhu ne,
  nejrovnější pokračování první) → **souběžné cesty** se nevytvoří (`alongsideRoad` ve
  `formRoads` – do 12 m stejným směrem; konec nové cesty za souběžným kusem se k té cestě připojí
  do 14 m – `joinPoint` s dosahem) a existující se sloučí (`mergeParallelRoads` – kus
  slabší cesty souběžný aspoň 25 m se vyřízne, `removeBraids` – copánek mezi stejnými uzly do
  25 m: zmizí oklika; vše v `tidyRoads`, příznak `parallelsChecked`) → **díry** (volný konec do 12 m od jiného
  úseku, který není u konce trasy roční sítě – brány, cíle) se napojí (`joinRoadGaps`, starší
  vsi jednou při načtení `withJoinedRoads` s příznakem `endsChecked`) a určí se skutečné volné
  konce `Road.openEnds` (jen tam se pás cesty ve scéně vytrácí; pěšina dne se za koncem úseku
  neskrývá – `roadFade`) → místa na stromy (`roadTreeSpots`, `plantingBlocker` – ne ve vsi, na
  čtvercích staveb (pole ano – Pole jako krajina), v lese, ve vodě, u překážek krajiny) → konec pařezů a stromy odstraněné stavbou →
  uchycení (10 % ročně, los ze seedu vsi, roku a místa). Čísla v `rules.ts` (`ROADS`,
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

- **Vylepšení pevné cesty a chůze podle stupně** ([roads.md](../design/roads.md) – fáze 2):
  terén pěšin má příznaky `PATH_WETLAND` (mokřina – suchá rovina do 3 buněk od vody) a `PATH_WATER`;
  úsek nese `Road.ground` (mokřina od–do a brody na ose – `roadGroundOf` při vzniku, starší při
  roční kontrole; `splitRoad` je dělí). `road-upgrades.ts`: `roadUpgradeOptions` (nabídka, cena
  `roadUpgradeCost` – `ROAD_UPGRADES` v `rules.ts`, důvod česky), `startRoadUpgrade` → stavba
  `kind: 'road'` s `roadIds` a `roadGrade` (dřevo `planWoodFrom` k polovině úseku),
  `finishRoadUpgrade` v `finishConstructions`; úsek ve stavbě nezaroste (`roadsInWork`). Use-case
  `upgradeRoad`, server action `upgradeRoad` (`{ roadId, upgrade }`), práce `{ kind: 'road' }`
  (labor-report, postavy `roadWork`, pěšina k polovině úseku). **Chůze** jen ve `walking.ts`:
  `walkGraph(lines, { roads, ground })` – pěšiny dne, pevné cesty podle `ROAD_WALK`
  (`roadPieceCost` – stupeň: vyšlapaná i vyježděná 1,5×, upravená 1,7×, hať a lávka 1,7× i přes
  mokřinu; mokřina 0,5×, brod + 30 m bez lávky; stromy u cesty přidají – Stromy u cesty zrychlí
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

- **Vozová síť a vyjeté cesty** ([wagons.md](../design/wagons.md) – fáze 2; Martin, 19. 10.
  2026: „ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset vyjezdit serpentiny“; čísla
  `CART_ROUTES` a `CART_ROADS` – návrh Clauda): `paths/cart.ts` (deterministická vrstva jako
  pěšiny) – `cartGrid` na mřížce terénu pěšin (výšky `PathTerrain.heights`, les `PATH_FOREST`,
  překážky `cartObstacleMask` v `terrain.ts`; voda jen brodem, les jen po pevné cestě, pole
  v lese vymýcené, osetý díl, křoviny, sad, hřbitov, ohrada, les vsi a okrsek svatyně ne, domy
  a pozemky s půl šířkou vozu; každá pevná cesta sjízdná; rychlost podle povrchu a druhu cesty –
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
  projel“; čísla `WAGON_ROAD` v `rules.ts`, rešerše `research/2026-10-20-earthworks.md`): stupeň
  `wagon` (`RoadGrade`, `RoadKind`, vůz `CART_SPEED.road.wagon` 2,2, pěšky 1,7, v mokřině jako hať,
  brod zůstává; pás `ROAD_LAND.widthM.wagon` 3,5 m). **Trasa** `paths/wagon-route.ts`
  (deterministická vrstva): `wagonRoadGrid` (zákazy jako vozová síť, mez úprav terénu `limit`
  u staveb a vody), `findWagonRoute` – A\* po terénu pěšin × 16 směrů (`CART_HEADINGS`), zatáčení
  `WAGON_ROAD.turnSteps`, štítky s rozsahem výšky pláně (sklon hledání 5,5 %), **co nejpříměji**
  (Martin 20. 10. 2026: „Co nejpříměji“ – metr délky `WAGON_ROAD.directPerM` 25 čd, víc než metr
  nejhlubšího úvozu; mezi stejně dlouhými stavba + čas vozu za `trafficYears`),
  `straightenWagonRoute` (přímé úseky, kudy vůz projede a profil vyjde – rozsahy výšek odpředu
  i odzadu, rohy do 45°, posvátný strom `WagonGrid.sacred` ani u konce); `wagonProfile` (víc stupňů vyhlazení osy,
  `profileHeights` – DP po cm, sklon ≤ 6 %, úvoz a násep ≤ 3 m), `wagonEarthworks` (objemy na
  rastru 1 m, `balanceEarth` – hlína z úvozu do náspu), `roadsCartMinutes` / `profileCartMinutes`.
  **Plán** `wagon-road.ts`: `planWagonRoad(WagonPlanInput)` – stejně na serveru
  (`wagonPlanInputOf`) i v prohlížeči (`LandscapeScene.previewWagonRoad`), krajina s přesností
  prohlížeče (`browserLandscape` – bit po bitu stejně), důvody česky (`WAGON_*`, oklika
  `wagonDetourReason`), kácení `wagonClearing` (průsek, pláň a zemní práce); `wagonChainStatus`
  (zemní práce k cestě – `chainEarthwork`, oba konce profilu v uzlech řetězu). **Stavba**
  `startWagonRoad` → `VillageRoads.earthworks` (`RoadEarthwork` – profil, úseky ≈ 60 m od vsi ven
  `pieces`, `constructionId`) a stavba `road` s `Construction.earthwork`; krok `wagonRoadsDay`
  (po `trailsDay`) dá dostavěné úseky hned jako pevnou cestu (`addWagonRoad` v `paths/roads.ts`),
  `finishWagonRoad`; stará cesta po ose vozové zmizí hned (`absorbParallelRoads`); vozová cesta
  nezarůstá, souběhem se neřeže, konce se nenapojují samy. Práce
  `{ kind: 'wagon' }` (`wagonWorkTarget`). **Výšky jako herní data** (landscape.md – Úpravy
  terénu): `paths/earthworks.ts` – `terrainEditsOf` / `terrainEditsFrom` (mezipaměť),
  `editedHeight`, `groundHeightAt`, `withTerrainEdits`; síť pěšin a vozová síť (`villageTerrain`
  v `network.ts`, `cartGrid`) berou hotové úseky (`earthworkBuiltM`), scéna průběh
  (`earthworkReachedM`, `SceneEarthwork.shownM`). Use-case `buildWagonRoad`, server action
  `buildWagonRoad({ villageId, roadId })`. Web: `VillageRoad.wagon` (`wagonView`), panel – tlačítko
  „Upravit pro vozy“ (`road-wagon`, ikona `cesta-vozova`, `WagonTooltip`), náhled trasy
  `VillageGame` → `LandscapeScene.previewWagonRoad` (plán i vytyčení – `setWagonPreview`), průběh `selection-wagon-progress`. Scéna: `terrain-edits.ts`
  (`editSurfaceHeights`, `recomputeNormals` jako Babylon), `TerrainMesh.setTerrainEdits`,
  `applyTerrainEdits` v `landscape-scene.ts` před obnovou vsi, `terrainChanged` (pole po blocích –
  `#t` v klíči bloku, pěšiny, cesty), pás `roadBands` `wagon` + `gravel` (`WAGON_*_LAYER`), svahy
  `earthworkSlopeGrid` (`roads-slopes`, zarostou za `SLOPE_GRASS_YEARS`), vytyčení
  `wagonStakingLines`. Ukázka `/dev/landscape` **Vozová cesta** (`dev-wagon-road.ts`).

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
