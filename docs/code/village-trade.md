# Ves – dvorec, stezka, sousedé a obchod

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: trade.md v `docs/design/`.

- **Dvorec vojvody** ([trade.md](../design/trade.md) – Dvorec vojvody, Jak je postavené;
  `manor.ts`): `VillageState.manorId` = obydlí (domácnost), odkud jdou vylepšení vsi – nová ves
  první zemnice zakladatelů (`foundVillage`), starší nejstarší obydlí (`withManor` v
  `updateVillage`, `keepManor` krok dne, `villageManorId` / `villageManor`). Typ obydlí `dvorec`
  (`DwellingType`; hráč ho nestaví – `BuildableDwellingType` = zemnice a polozemnice v nabídce,
  stěhování a vstupu server actions): kapacita 10, cena a dřevo polozemnice × 1,5 (`DWELLINGS`,
  `DWELLING_TREES`, `MANOR`), dožilý dvorec `decideRebuilds` přestaví vždy na `dvorec`.
  **Pozemek dvou políček:** `DwellingPlot.yard` (dvůr stranou vedle políčka domu, varianta
  `center`, dům vchodem ke dvoru – `yardRotation`, `plotCells` v `plot-cells.ts`, `copyPlot`),
  `checkPlotPlacement` u dvorce dvůr vyžaduje, `relocationPlot(…, 'dvorec')` hledá dvojici volných
  políček (`YARD_SIDES`). Model `tools/blender/dwellings.py` pátým argumentem `dvorec` (jen
  `dvorec.glb`, brána `dvorec-gate.glb`, díly staveniště `dvorec-construction.glb` – uzly
  `dvorec-…`, řezby `carving` ve fázi `carve`; srub 4,6 × 8,4 m, zubořez na štítech, koňské hlavy
  na kozách – `DVOREC_*`, musí sedět s `PIT_SHAPES.dvorec`, `SHAPES` a `SMOKE_VENT` v
  `dwelling-decor.ts`, `MANOR_HOUSE_RECT_M` v `homestead-layout.ts`). Scéna: model a díly
  staveniště se načtou až s prvním dvorcem (`loadManorModels`), `ScenePlot.yard` /
  `PlotSquare.yard` – plot přes obě políčka (`plotFenceRect`), brána `MANOR_FENCE` a model brány
  (`HomesteadLayout.gate`, `HomesteadRenderer`), výběr a zvýraznění celého pozemku; dvorec se
  zatím nerozpadá (`dwellingDecayStage`), zbytek jámy jako po polozemnici (`decayModelType`).
  Panel: portrét „Dvorec vojvody“ a vylepšení vsi (`hud/ManorPanel.tsx`, data `lib/manor-view.ts`).
  Ikona `icons/build/dvorec.png`, ukázka **Dvorec vojvody** na `/dev/buildings`.

- **Zemská stezka** (trade.md – Zemská stezka; `trail.ts`): `trailRoutes` – jedna Dijkstra po
  terénu pěšin celé krajiny (`trailTerrain` s překážkami, po pevné cestě × 0,5 – `TRAIL`) z místa
  za branou dvorce (`trailStart`) do všech 8 směrů (`DIRECTIONS`, `Direction8` = `NeighborDirection`
  z příbuzenství, sever +z), v mezipaměti podle krajiny, bodu a sítě cest (první dotaz ≈ 0,7 s,
  pak ≈ 10–30 ms). `planTrail` uloží osu jako pevné cesty na kopii stavu (`addTrailRoads` v
  `paths/roads-trails.ts` (`addTrailRoads`) – nové úseky po 150 m přes `formRoad`, po pevné cestě vede po ní, rozdělení
  úseku přidá kus stezky – `splitTrailPieces`), úseky `Trail.pieces` se stupněm a prací
  (`roadUpgradeCost`, hať a lávka přes mokřinu a brod, dřevo `planWoodFrom`), důvody česky
  (`TRAIL_BLOCKED`, `TRAIL_NO_WOOD`…). `startTrail` → stavba `road` s `Construction.trail`
  a `roadIds` od vsi ven; `trailsDay` (krok po práci) dá dostavěným úsekům stupeň hned,
  `finishTrail` (ve `finishConstructions`) hotovou stezku, kronika `trail-built`. Práce na úseku
  u čela (`trailWorkFront`, `trailWorkRoad` v `labor-report.ts`). `trailOptions` – nabídka 8 směrů
  (stav, průběh, délka, cena, dny cesty `trailTripDays`). Use-case `buildTrail`, server action
  `buildTrail` (`{ villageId, direction }`). Web: růžice šipek `TrailCompass`, scéna
  `lib/trail-view.ts` (`sceneTrails` – osa stezky, `trailRoadWork` – vytyčení a průběh po úsecích
  v `sceneRoads`), `SceneVillage.trails`. Ikona `icons/build/stezka.png`.

- **Sousedé a obchod** (trade.md – Sousedé, Obchod; `neighbours.ts`, `trade.ts`): `neighbourOf(seed,
směr)` – stálá povaha podle druhu souseda (`neighbourKind` – obilnáři, pastevci, lesní ves,
  řemeslníci, každý dvakrát kolem vsi; `NEIGHBOURS.kinds`: 2–3 nabízí ze své nabídky, 2–3 shání –
  `always` vždy, zbytek z `needs`), roční zásoby a poptávka `NEIGHBOURS`, jméno
  `suggestVillageName`), `neighbourStock` – zbytek roku obchodu
  (`tradeSeason` – od 1. 11.), ukládá se jen `VillageTrade.neighbours`. Hodnoty zboží v kg obilí
  `TRADE_GOOD_VALUES` (rešerše `research/2026-10-18-trade-values.md`), ceny `sellPrice` / `buyPrice`
  (přirážka a příplatky `TRADE`), `tradeQuote` – kontrola a ocenění (bilance pro souseda ≥ 0,
  nosiči `expeditionPorters`, dny, práce; důvody česky). `startExpedition` odebere zboží a zapíše
  výpravu (`TradeExpedition`). **Lidé na výpravě mají vlastní podíl práce** (Martin 19. 10. 2026):
  jediné pravidlo pro každou výpravu ve `state.trade.expeditions` (i nákup u sousedů) –
  `expeditionLaborToday` = `expeditionLaborNeed` (každá výprava kolik s ní jde lidí – nosiči,
  honáci, posádky vozů –, nejvýš co jí zbývá), nejvýš kolik je dospělých mimo dílny; jde do
  `allocateDay` jako `away` hned po denním minimu domácností (to má přednost), před úlohami dne –
  výprava trvá přesně dny z náhledu, zdrží se jen ves bez dost dospělých;
  `workExpeditions(state, allocation.away)` ho rozdělí mezi výpravy (v rozdělení práce dne nejde
  ze společné práce – `idle` nezmenší); `finishExpeditions` (po práci – zboží do zásob, kronika
  `trade-departed` / `trade-returned`). Rozdělení práce: činnost `trade`, cíl `{ kind: 'trail' }`
  – ve scéně jde výprava jako **karavana** (`scene/caravan.ts`, data `SceneVillage.expeditions`
  z `lib/caravan-view.ts`): jedna skupina po zemské stezce podle postupu výpravy v herním čase
  (`caravanProgress` – postup dne plynule dnešním tempem, `caravanHead` – tam, den za krajem mapy
  pryč, zpátky), ne podle práce dne – nosiči nezmizí, ani když výprava dnes nepostoupila; tam
  nosiči s nákladem a lidé, kteří odcházejí (`givePeople.members`), zpátky nosiči a lidé od
  souseda (`newcomerProfiles`); postavy `caravanFigures` ve `villager-plan.ts` (podíl `trade`
  se pak nekreslí; `VillagerPose.hidden` za krajem mapy), vůz v čele `caravanCartPlan`
  (`CartCaravan` v `cart-layout.ts`, `CartPose.hidden`); obal postav zahrne celé stezky
  s karavanou (`caravanExtent`). Ukázka `/dev/landscape` – **Karavana**. Use-case `sendExpedition`,
  server action `sendExpedition` (`{ villageId, direction, give, get, givePeople?, getPeople? }` –
  `parseSendExpeditionInput`).
  Web: `VillageManor.neighbours` (`neighbourViews`), panel `hud/TradePanel.tsx` (soused a směr,
  bilance pro souseda ikonou vah `resources/balance.png` – zeleně ≥ 0, červeně záporná –, dva
  sloupce v `hud-inset` s viditelnými hlavičkami „Dáš“ / „Dostaneš“ a portrétem dvorce, řádky
  `TradeRow` s popiskem „Soused shání – vezme ještě …“ / „Soused nabízí – má ještě …“
  – `tradeAmountText`; záložky sousedů jen při víc sousedech; náhled `lib/trade-quote.ts`),
  upozornění, ikona `icons/build/obchod.png`. **Po odeslání** (Martin 19. 10. 2026 – „dál nějak
  nevím, co se bude dít“): výběr se s novým pohledem ořízne na meze souseda (`clampSelection`,
  `tradeLimits` – úprava stavu během renderu při změně `neighbour`), náhled `tradePreview` dělá
  všechny kontroly `tradeQuote` se stejnými důvody (konstanty z jádra), `onSend` vrací důvod
  odmítnutí – panel zůstane otevřený a ukáže ho červeně (`trade-error`), dokud se výběr nezmění;
  výprava na cestě `ExpeditionView` (`expeditionView` v `manor-view.ts`: `daysLeft`, `pace`
  `full` / `slow` / `waiting` / `starting` z podílu `trade` v rozdělení práce dne; `slow`
  a `waiting` jen výjimečně – málo dospělých, přesýpací hodiny „Výprava stojí“ / „Málo
  dospělých“); u práce kolik vozy ušetří (`savedManDays`).

- **Jen společné suroviny** (trade.md – Jen společné suroviny; Martin 19. 10. 2026: „Nech jen
  společné suroviny, nezaváděj nové.“): obchod zná jen zboží, které má i ves (`TradeGood` – obilí,
  luštěniny, maso, sýr, dobytek, klády, keramika, nástroje, uhlí; `TRADE_GOODS`). Zboží zvenku
  (sůl, železo, med, kožešiny – dřívější `goods.ts`) ve hře není. Starší vsi převede
  `withoutForeignGoods` (`trade.ts`; v `updateVillage` i na začátku `advanceVillage`, bez příznaku,
  idempotentně): zahodí `goods` a podíl medu v jídle, uložený zbytek roku souseda, který nesedí na
  jeho povahu, a výpravu na cestě pro zboží zvenku zruší – nosiči přinesou zpět, co nesli
  (`get` = `give`); z kroniky výprav zboží zvenku zmizí.

- **Dobytek ve třech druzích** (trade.md – Dobytek ve třech druzích; Martin 20. 10. 2026: „s
  dobytkem by také mělo jít obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí se
  vycvičit) a vycvičené voly“; `cattle-trade.ts`): `CattleGood` = `cows` / `youngOxen` /
  `trainedOxen` (`CATTLE_GOODS`, `isCattleGood`) místo `cattle`; hodnoty 600 / 350 / 1 200 kg obilí
  (rešerše `research/2026-10-20-cattle-trade.md`). Koupené krávy do stáda skotu jen do volných míst
  ohrad skotu, voli do ohrad volů (mladí i vycvičení sdílejí místa) – `cattleRoom`,
  `cattleRoomBlocked` v `tradeQuote` (`NO_COW_ROOM`, `NO_OX_ROOM`), bez dobytka na cestě; po návratu
  `addCattle` (mladý vůl `oxTrainedDay` od příchodu, vycvičený se `CATTLE_TRADE.servedYears` 3 roky
  služby – `boughtOxTrainedDay`; kdo se nevejde, do `looseOxen`). Prodej `cattleForSale` /
  `removeCattle` (krávy bez chovného páru, mladí voli z výcviku – nejdelší výcvik napřed, vycvičení
  doma mimo posledních 2 let služby – nejstarší napřed); `villageGoodStock(state, good, day)`.
  Voli na cestě (`oxenComing`) jsou v `lastingOxen` a místech výcviku; pár bez rádla dostane rádlo
  bez výcviku (`ardsWithoutTraining` v `trainTeamsWhenReady`). Prodaní vycvičení voli vůz výpravy
  netáhnou (`withoutSoldOxen`). Dobytek jde po svých s honákem (`carriers`). Sousedé: v povaze
  zůstává `cattle` (`NeighbourGood`, pořadí losu beze změny – ostatní zboží souseda stejné) a rozloží
  se podle druhu (`NEIGHBOURS.cattleKinds` – pastevci všechny tři vždy, obilnáři krávy a mladé
  voly, řemeslníci shánějí všechny tři). Převod `withCattleKinds` (před `withoutForeignGoods`,
  v `updateVillage` i `advanceVillage`). Web: `VillageNeighbour.room`, `tradeLimits` / `tradePreview`
  s místy, řádky s ikonami `cow`, `young-ox` (menší světlejší vůl – `icons.py`), `ox` a popiskem
  místa v ohradě; karavana – `SceneExpedition.cattle`, `CaravanColumn.animals` po dvou za vozy,
  kreslí `VillageLivestock` modelem krávy (`caravan-cattle.ts`).

- **Koně ve třech druzích** (horses.md – Nákup a prodej; Martin 23. 10. 2026: koně jako ostatní
  zvířata; čísla návrh Clauda; `horse-trade.ts`): `HorseGood` = `foals` | `mares` |
  `ridingHorses` (kusy, `HORSE_GOODS`, `isHorseGood`, `isLivestockGood` = dobytek nebo koně).
  Hodnoty `TRADE_GOOD_VALUES` 800 / 1 600 / 2 400 – jezdecký kůň má cenu **za kus** podle výcviku
  (`horseValueKg` = 2 400 + 1 200 × výcvik/100): `tradeQuote` sčítá prodávané koně
  (`horsesSaleValues` – napřed nejméně vycvičení) a koně souseda (`offeredHorses`). Ves prodá
  (`horsesForSale`) jen koně bez jezdce: hříbata do 3 let (napřed nejstarší), klisny nad chovné
  (`horsesWanted.mares` nejmladších zůstane) a jezdecké koně – bez koně s jezdcem a s klisnou
  zůstane nejlépe vycvičený hřebec. Koupě potřebuje místo v ohradách koní (`horseTradeRoom` – bez
  koní na cestě, `horseRoomBlocked` – „Tolik koní se do ohrady koní nevejde.“). Koupení koně se
  věkem a výcvikem určí při odchodu výpravy (`boughtHorses` → `TradeExpedition.horses?`, chybí =
  žádní): los ze seedu souseda, roku obchodu, druhu a pořadí koně v roce (`neighbour-horse:…`) –
  hříbě 1–3 roky, klisna 4–12, jezdecký kůň 3–12 s výcvikem podle věku; `finishExpeditions` je
  přidá (`addHorses` – do volných míst, přebytek do první ohrady koní, bez ohrady na maso).
  Doprava: honák na 4 koně (`TRADE.horsesPerDrover`) zvlášť od honáků dobytka (`legCrew`). Sousedé:
  koně mimo povahu (`PROFILE_ORDER` bez nich – ostatní zboží souseda beze změny, hlídá otisk
  v `neighbours.test.ts`), `NEIGHBOURS.horseKinds` – pastevci nabízejí všechny tři, obilnáři
  a řemeslníci shánějí všechny tři, lesní ves nic; 1–3 kusy z proudu `neighbour-horses:<směr>`.
  Jezdecké koně mají pastevci jen některý rok (`seasonSupply` – `HORSE_TRADE.ridingYearChance`,
  proud `neighbour-horses:<směr>:<rok>`). Uložený zbytek roku bez koní se nezahodí (`sameGoods`
  koně nepočítá) – koně přibudou 1. 11. Web: názvy a ikony `foal`, `mare`, `horse` v `TRADE_GOOD_NAMES`, řádky v panelu
  obchodu jako u dobytka (`TradePanel`); `manor-view.ts` je neskrývá, jen řádek nabídky se zásobou 0
  (pastevec v roce bez jezdeckých koní) vynechá. Místo v ohradách koní `VillageNeighbour.room.horses`
  (`horseTradeRoom`), popisek řádku a důvod v náhledu (`trade-quote.ts`, `NO_HORSE_ROOM` – koně
  všech tří druhů dohromady); karavana koně nenese (`carries`).

- **Výměna lidí** (trade.md – Výměna lidí; Martin 19. 10. 2026: „Se sousedem půjde vyměnit
  i lidi…“, „Mohou se stěhovat celé rodiny i jen dospělí. Podle toho, co je v nabídce.“;
  `people-trade.ts`): soused má na rok obchodu lidi navíc, nebo je shání (`neighbourPeople` – ze
  seedu, směru a roku; `NeighbourStock.people` – `families` počty dětí rodin, které dá, `men`,
  `women`, `takes`; chybí u zbytku roku uloženého dřív – doplní `neighbourStock`, uložený
  s `adults` převede `storedNeighbourPeople`). **Muži a ženy zvlášť** (Martin 19. 10. 2026 – dvě
  ženy od souseda neměly s kým založit domácnost): `TradePeople` = `families`, `men`, `women`,
  pohlaví svobodných souseda se losuje v nabídce (na konci losu – rodiny a počty beze změny);
  výprava s `getPeople.adults` (uložená dřív) losuje pohlaví při příchodu jako dřív. Cena `PEOPLE_TRADE`
  (dospělý 360 kg obilí, dítě polovina – `personValue`, `neighbourFamilyValue`, přirážky
  `sellValue` / `buyValue`). `TradeOffer.givePeople` / `getPeople` (`TradePeople`);
  `tradeQuote` je ocení a zkontroluje (`NO_PEOPLE_WANTED`, `OVER_PEOPLE_DEMAND`,
  `NO_EMIGRANTS`…). Koho ves dá, vybere `emigrantGroups` (`Emigrants` – rodiny podle
  `familiesOf`, pak svobodní muži, pak ženy 16–44 – `nextSingle`, z nejvíc přeplněného domu, ne
  dvorec, ne dědic – `unmarriedHeir` v `households.ts` –, ne rozpad domácnosti; postupně, prefix
  stálý); odejdou hned v `startExpedition` (`removePeople` se směrem, `TradeExpedition.givePeople`
  i s `members` – pohlaví a den narození pro postavy karavany). Lidé souseda
  (`TradeExpedition.getPeople`, `ComingPeople`) přijdou v `finishExpeditions` – `settleNewcomers`
  podle `newcomerProfiles` (pohlaví a věk z losu ze seedu a id výpravy – stejně pro postavy ve
  scéně; rodina do prázdného obydlí, jinak do domu s nejvíc místy mimo dvorec, svobodný do
  obydleného domu s nejvíc místy; kronika `newcomer`). Lidé nosiče nepotřebují. Web:
  `VillageNeighbour.people` (`neighbourViews` – `offers`, `takes`, `have` po výběru jádra), náhled
  `tradePreview(…, people)`, řádky rodina / muž / žena v `TradePanel` (ikony
  `resources/family.png`, `man.png`, `woman.png`), upozornění „Přišla rodina ze severu“.
