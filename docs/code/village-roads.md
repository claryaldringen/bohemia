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
  obcházení delší; vozy přes osetý díl jen bez jiné cesty (`CART_SPEED.sown`);
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
  Postavy: `path-router.ts` – `routeWalker(routes, cellM)` (osa uložené trasy z `routeLine`, tempo
  `PATH_WALK`; trasa od brány domu k cíli nebo obráceně; bez hledání cesty; `VillagePaths` ho staví
  při změně klíče tras, bez tras `paths()` = null a postavy jdou krátkým pohybem) → `VillagerPaths.route` →
  `route(points, pace)` – `shuttle` jde po pěšině rychleji. Vývojová stránka: tlačítka
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
  slabší cesty souběžný aspoň 25 m se vyřízne, `removeBraids` – copánek mezi stejnými uzly do
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
  cesty, nezmění jejich id, místa na stromy, stavby ani `nextId` (recenze Ú5, I1). Levná kontrola
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
  (vchod 3 m, cíl 7,5 m; kraj mapy = pás `EDGE_MARGIN_M` + `TRAIL.edgeBandM` + 7,5 m od okraje, `nearAnchor`). Roční kandidáti (`formRoads`, `hotRuns`, `MATCH_M` u pěších)
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
  (`tidyDue` – okruh, díra, pahýl; `accessDue` – vchod bez cesty, počítá tutéž cestu jako `accessRoads` přes `accessPlan`, takže vchod bez možné cesty úklid nespouští); jinak nic, ani kontext míst na
  stromy (čítač `TIDY_RUNS` pro testy). Pořadí: `tidyRoads` s kotvami a čarami tras (`StubNetwork`):
  okruh přes jeden uzel se rozdělí v nejvzdálenějším bodě (`splitLoops`, `roads-stubs.ts`) →
  souběžné → díry (`joinRoadGaps` už nespojí konec zpět do uzlu, ze kterého úsek vychází – vznikal
  okruh tam a zpět) → copánky → spojení → **pahýly** (`trimStubs`: konec vyšlapaného úseku mimo kotvu a mimo jinou cestu zmizí bez ohledu na délku
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
  `VillageRoads.junctions` (`types-roads.ts` – tvar `cross` / `y`, natočení a β v rad, ramena = id
  úseků ve vchodech v pořadí `junctionArmDirs`, znamení, den vzniku). `fitJunction(dirs, fixed)` –
  4 cesty kříž, 3 cesty Y s β 30–60°; natočení po 5° s nejmenším součtem čtverců odchylek přes
  všechna přiřazení (nejvýš 24), při shodě menší natočení a menší β; pevná cesta (stezka, vozová)
  určí natočení přesně. `junctionEntranceM` (1,5 × nejširší cesta), `junctionEntrances` (vchody
  na cm). `bendRoadEnd(points, entrance, armDir, bendM)` – posledních 12 m osy u křižovatky (bližší
  konec) nahradí kubický Bézierův oblouk do vchodu (tečna osy i ramene, body po 1 m, na cm).
  `splitCrowdedNode` – uzel s 5+ cestami na dvě skupiny sousedních ramen a dva středy 10 m od sebe.
  `drawLandmark(seed, id)` – strom 40 % / kámen 30 % / kůl 30 %, podoba, natočení, druh stromu
  (`speciesOf` z `roads-trees.ts`); `landmarkPlace` – nejširší mezera, 1,5 m za vchody. Testy
  `junctions.test.ts`.
  **Zapojení (Úloha 9b):** `updateJunctions(roads, day, seed, { live, fixed })` – krok 6 měsíčního
  úklidu (`tidyMonth` v `roads.ts`, po cestách k vchodům), běží každý měsíc i bez úklidu (ramena
  určuje provoz tras), beze změny nic a žádná nová id; vrací, jestli se něco změnilo (pak se posune
  `tidyKey`). Uzel = bod, kde končí úseky (klíč na cm); křižovatka stojí, kde končí 3–4 živé konce
  – `liveRoadEnd` (`road-condition.ts`): neopuštěný úsek s provozem kusu u konce ≥ `ROAD_DECAY.keep`
  druhu, stejně jako stav kusů (cesta do vchodu se drží, jízdy vozů); zemská stezka a cesta ve
  vylepšení (`fixedRoadIds`) živé. **Osa vede přesně do vchodu a odtud rovně po rameni do středu**
  (`bendEnd`) – úseky dál sdílejí bod uzlu, takže spojení, pahýly, copánky i díry v úklidu se
  nemění; oblouk po 1 m se uloží zjednodušený (`simplifyPathLine`, `SIMPLIFY_M`) – body osy
  zdražují chůzi a vozy. Neohýbá se vozová cesta, stezka, cesta ve vylepšení ani úsek kratší než
  `bendM` (`isFixed` – rameno přesně v jejich směru). Beze změny (`keptJunction` – ohnuté konce
  leží přesně ve vchodech, počet ramen sedí) jen nová id úseků v `arms`; jinak `fitNode` znovu
  (id, den vzniku a znamení zůstanou; kámen a kůl se posunou do nejširší mezery, strom stojí).
  Místa na stromy a jabloně do `ROAD_CLEAR_M` (2,2 m) od ohnutých os v okolí středu zmizí (místo
  se stromem zůstane). Znamení: strom = `RoadTree` v `roads.trees` (`spot` = id křižovatky, id
  z `nextId`, roste od keře) a zůstane i po zániku; kámen a kůl jsou v `obstacleChangesAt`
  (`added`, id `junctionLandmarkId` = ROAD_TREE_ID_BASE + id křižovatky) jako balvan a keř
  a zmizí s křižovatkou. Uzel s 5+ živými konci křižovatku zatím nemá (`splitCrowdedNode` se
  nevolá – na Vlkově žádný). Plocha pod křižovatkou (`roadCapsules` v `road-land.ts`): místo kruhu
  pásy ramen (pásy cest) a spojnice sousedních ramen (mezera pod 180°) ve vzdálenosti šířky
  nejširší cesty. Scéna: `SceneVillage.junctions` (Úloha 12 níž). Měření `road-report.ts` – objekty po tvarech
  a znameních, uzly 5+, přepočty a ohyby (`JUNCTION_RUNS`). Testy `junctions-network.test.ts`,
  `road-stubs.test.ts` (Y u branky hřbitova, 12 měsíců beze změny).
  **Scéna (Úloha 12):** `lib/scene/junction-shape.ts` (čisté, bez Babylonu; test
  `junction-shape.test.ts`). `junctionShape(j, roads)` – ramena jen s cestou, vchody z
  `junctionEntranceM`, obrys proti směru hodin: u každého ramene dva rohy ve vchodu (± půl šířky
  nejširší cesty kolmo na rameno) a mezi sousedními rameny vnitřní roh na ose mezery, kde se
  protnou okraje pásů (nejvýš u vchodů, ± 12 % nepravidelnost podle polohy; od mezery 180° střed).
  `junctionRibbons(junctions, roads)` – plácky po vrstvách obtisku nejširší cesty (vozová cesta pro
  vozy `wagon` → `roads-wagon-worn/earth`, jinak upravená, jinak vyjetá `cart`, jinak vyšlapaná)
  s `RibbonJunction.outline`; `path-ribbon.ts` `addOutline` kreslí vějíř ze středu po
  obrysu a měkký okraj (u vchodů po straně pásu, u vnitřních rohů od středu), obrys pro užší
  vrstvu (holá hlína) má užší ramena, ale vchody na stejném místě (`RibbonJunction.outlineFor`) –
  hlína plácku navazuje na hlínu pásů (oprava 24. 10. 2026, Martin: „křižovatky vypadají extrémně
  divně“ – křižovatka vozových cest se dřív kreslila obtisky upravené cesty jako tmavá skvrna); maska polí (`ribbonTrack`) bere kruh o průměrném
  poloměru obrysu. Znamení: `junctionLandmarkPieces` → modely `junction-stone-1…2`,
  `junction-post-1…2` (`tools/blender/roads.py`, atlas jako hať, 0 A.D. textury, vlastní tvary)
  v instancích `RoadWorks.update(…, junctions)`; strom je dál `roadTrees` (stejně jako dřív).
  Kámen a kůl se jako překážky dál počítají jádrem (`obstacleChangesAt` – balvan a keř), scéna je
  nekreslí z `obstacles`. Klíč `junctionsKey` je v klíčích `path-renderer`, `field-renderer`
  i `RoadWorks`. Výběr: `{ kind: 'junction', id }` – `nearestJunction` do `JUNCTION_PICK_M` (3 m)
  od středu, přebíjí cestu; obrys výběru `selection-highlight.ts` (obrys + 0,35 m); údaje panelu
  `junction-view.ts` (`VillageView.junctions`: tvar, počet cest, znamení, stáří), panel
  `JunctionBody` (`selection/roads.tsx` – ikony `krizovatka-kriz` / `krizovatka-y` z
  `tools/blender/icons.py`, počet cest, znamení, stáří; názvy jen v popiscích). Náhled
  `/dev/panels?panel=krizovatka`, ukázka tří křižovatek `/dev/landscape` (tlačítko Křižovatky,
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
  v lese vymýcené, křoviny, sad, hřbitov, ohrada, les vsi a okrsek svatyně ne, osetý díl jen draze (`CART_SPEED.sown` – `CartGrid.sownPart` nese id dílu, `CartRoute.sown` metry trasy přes osetý díl, `CartDrive.sown` je předá simulaci; `flushCartTrips` v `cart-jobs.ts` – jediné místo, kam `work()` zapisuje jízdy dne (deník `CartTripLog`: svoz, voda, uhlí, ruda, klády, osivo; provoz cest + `trampleSownParts`, metry hledá `villageCartRoutes`, voda je zná z `CartDrive.sown`) – z nich zvedá `FieldPart.trampledM2`, `cropYieldKg` v `year-plan.ts` o podíl zmenší úrodu, `endOfSeason` nuluje), domy
  a pozemky s půl šířkou vozu; každá pevná cesta sjízdná – pás buněk do 0,75 buňky od bodů osy
  (`ROAD_BAND_CELLS`) a úhlopříčka z buňky cesty na buňku cesty i přes roh lesa, osetého dílu či
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
  a hřbitov jen uvnitř plotu (`fencedCells`, ulička 3 m průjezdná – natočená ohrada jen buňky celé
  uvnitř), pevná cesta pásem `roadBandCells` z `cart.ts` (díl pole ani samotný strom či keř na ní
  ji nezavřou), `barred` = zákazy bez okrajů staveb, mez úprav terénu `limit` u staveb a vody;
  `wagonAxisBlocked` – body osy po 2 m mimo 9 m u konců: `barred` (plot, voda mimo brod, sráz,
  balvan) nebo stavba blíž než půl šířky vozu (`inBuilding` přesně v bodě, ne po buňkách) →
  `WAGON_BLOCKED`; posvátný strom přesně kácením (`wagonClearing` → `WAGON_SACRED`);
  `wagonProfile(grid, osa, asIs = true)` – profil po ose jak je, nevyjde-li sklon 6 % ani s úvozem
  a náspem 3 m → `WAGON_STEEP` „Cesta je pro vůz moc prudká.“ **Narovnání** (Úloha 11b):
  `straightenStretches` v `wagon-road.ts` (`WAGON_STRAIGHTEN` – 1,3× / 3 m / 120 m) na osu po 6 m
  najde kličkující kusy, zkusí nejvýš 8 tětiv od nejvíc ušetřené délky (`wagonAxisBlocked` +
  `wagonProfile` bez vyhlazení, cena = zemní práce + zpevnění) a přijme tětivu, je-li levnější než
  stará osa nebo stará nejde; plán nese `bypassed` a `footbridgeTrees`, `startWagonRoad` je uloží
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
  `VillageRoads.wear?` (`RoadWear { day, cells, labor }`) – setiny cesty na políčko 7,5 m světa,
  čísla `WEAR` v `rules-roads.ts` (práh cesty `roadAt` 100 000, strop `max` 150 000, tráva ubere
  `regrowPerDay` 100 denně). `paths/wear.ts`: klíč políčka `wearKey(i, j)` / `wearCellAt(x, z)`,
  kódování `encodeWear` / `decodeWear` (seřazené klíče, rozdíl klíče a hodnota jako varint v base64
  – 5 bitů na znak, nuly se neukládají), `wearCellsOf(route, cellM)` – políčka trasy ± 1, každé
  jednou. **Provozní pole** `trafficField(routes, cellM)` se spočítá jednou pro `routes.key` (pár
  posledních sad v paměti, kontrola počtu tras a součtu cest) – `cells`: cesty za den, které se
  sčítají (trasy mimo práci celé, trasy `work` jen stálá část `StoredRoute.base`; `base` zapisuje
  `network-targets.ts` přes `TripGroup.baseWeights` u pole, sadu, ohrady a staveniště a
  `storedRoutes` ji ukládá), `targets`: pro cíl práce (`StoredRoute.to`) políčka tras k němu a kolik
  cest jimi vede, `walk`: celé `trips` všech tras; `trafficAt(field, x, z)` čte `walk` (provoz pro
  zarůstání cest). `wearKey` mimo ± 32 768 políček vyhodí `RangeError`. `settleWear(wear, field, fromDay, toDay)` projde jen
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
  čtvrtině políčka, ± 1 políčko jako u tras) `WEAR.seed` 50 000, den `lastDay + 1`; ves bez cest
  nechá být, druhé načtení vrátí týž stav. `road-report.ts` vypisuje políčka a kB vyšlapanosti
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
  kouscích = najednou (celá čísla; provoz kusu = medián `trafficAt` po 3 m, nejméně loňské jízdy
  vozů): `c = clamp(c + (provoz − keep) × dny, 0, plný)`. Nezarůstá zemská stezka, cesta ve
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
