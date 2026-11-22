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
  staveniště se načtou až s prvním dvorcem (`loadLazyDwelling`, `LAZY_DWELLING_TYPES` – i nadzemní dům a srubový dvorec, log-house.md), `ScenePlot.yard` /
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
  `paths/roads-trails.ts` (`addTrailRoads`, D86) – nové úseky po 150 m přes `formRoad` (kde trasa
  není do `ON_ROAD_M` od neopuštěné pevné cesty; opuštěná se nepočítá), cesta, po které trasa jde
  jen kus, se rozdělí v místě, kde ji opouští (`splitPartlyFollowed`, `splitRoad`; rozdělení
  úseku přidá kus stezky – `splitTrailPieces`), úseky stezky jsou spojitá řada po síti od začátku
  ke konci trasy (`trailChain` – nejkratší cesta jen po úsecích v koridoru trasy `TRAIL_CORRIDOR_M`,
  úseky trasy za čtvrtinu; `avoid` = cesta s posvátným stromem v pásu se do řady nebere jako opuštěná a trasu podél ní kryje nová cesta; `TRAIL_SACRED` až když strom stojí v pásu nové cesty po trase; kde řada v koridoru nejde složit, mezeru kryje nová cesta po trase). Řada bývá o desítky metrů delší než `Trail.lengthM` (cesty vlní kolem osy trasy; dny nosičů jdou dál z `lengthM`; Vlkov E +79 m). Hotové stezky se zpětně nepřestavují. Úseky `Trail.pieces` se stupněm a prací
  (`roadUpgradeCost`, hať a lávka přes mokřinu a brod, dřevo `planWoodFrom`), důvody česky
  (`TRAIL_BLOCKED`, `TRAIL_NO_WOOD`…). `startTrail` → stavba `road` s `Construction.trail`
  a `roadIds` od vsi ven; `trailsDay` (krok po práci) dá dostavěným úsekům stupeň hned,
  `finishTrail` (ve `finishConstructions`) hotovou stezku, kronika `trail-built`. Práce na úseku
  u čela (`trailWorkFront`, `trailWorkRoad` v `labor-report.ts`). `trailOptions` – nabídka 8 směrů
  (stav, průběh, délka, cena, dny cesty `trailTripDays`). Use-case `buildTrail`, server action
  `buildTrail` (`{ villageId, direction }`). Web: růžice šipek `TrailCompass`, scéna
  `lib/trail-view.ts` (`sceneTrails` – osa stezky, `trailRoadWork` – vytyčení a průběh po úsecích
  v `sceneRoads`), `SceneVillage.trails`. Ikona `icons/build/stezka.png`.
- **Převod stezky bez úseků** (`withMergedRoads` s krajinou v `updateVillage`): spojení úseků
  přepisuje id ve stezkách (`joinTrailPieces`), starší vsi ale mohou odkazovat na zmizelé úseky.
  Hotová stezka bez úseků nebo se zmizelým id dostane osu znovu (`restoredTrailPieces` /
  `trailAxisRoads` v `trail-axis.ts`): nejkratší cesta po pevných cestách (upravené, vozové, ne
  opuštěné; uzly = konce úseků) z uzlu do 30 m od `trailStart` (přístup vzdušnou čarou × 4) do
  konce úseku v pásu kraje mapy ve směru nejblíž paprsku (±`TRAIL.wideConeDeg`), stupeň z cesty,
  práce 0. Bez spojení zmizelá id jen vypadnou (`dropGoneTrailPieces`). Vlkov: stezka na sever
  412 → 619 → 370 → 372 → 631 → 547; jih a východ spojení nemají (mezera u kraje, opuštěný kus).
- **Stezka kostry – každá mapa lidského hráče** (premium-landscapes.md – Kostra světa; brod,
  průsmyk, Úloha 14 plánu kostry): `withSkeletonRoute` (`premium-route.ts`, volá ho `foundedState`) – osa prvku `route` od místa
  nejblíž vsi k oběma krajům mapy jako pevné cesty (`addTrailRoads`), stupeň hotové stezky
  (`upgradePieces` – upravená, hať a lávka, i přes brod), průsek lesem bez klád (`cutRoadSwath`)
  a hotová stezka (`Trail.builtDay` = den založení) ve směru každého konce (`DIRECTION_VECTORS`
  – nejbližší paprsek) – obchod se sousedy oběma směry hned. Návrh Clauda: upravená cesta místo
  vyšlapané (vyšlapaná bez provozu zaroste a „hotová zemská stezka“ je upravená).
  Zdroj větví: prvek `route` prémiové krajiny (brod, průsmyk), jinak úseky `skeletonFeaturesOf(l).route`
  mapy se stezkou kostry (od okraje k bodu obejití vsi, obrácené od vsi ven; směr = strana mapy,
  kde úsek končí: průchod 2 směry, křižovatka 3, konec stezky 1). Suchá mapa a ves syna (NPC mapa
  bez kostry, Martin 8. 11. 2026) stezku nemají – stav je bit po bitu dnešní.
- **Pokračování na sousední mapě** (trade.md – Zemská stezka; Martin 16. 11. 2026: „ano“; plán
  2026-11-16-dense-forest – Rozhodnutí 13, podrobnosti návrh Clauda): hotová stezka nekončí na
  kraji mapy. Nic se neukládá – stav vsi ani DB se nemění.
  - **Výstup** (`trade/trail-exits.ts`, det-math): `trailExitsOf(stav)` – `TrailExit` { `direction`
    (krok k sousednímu políčku přes stranu – N, E, S, W, `GRID_STEPS`), `end` (konec osy), `edge`
    (bod okraje ±960 m), `builtDay` } jen hotových stezek v pořadí `trails`. Konec = nejdále
    položený bod cest všech úseků ve směru stezky (úseky mohou být mimo pořadí); strana s menší
    mezerou a kolmý průmět. Výstup je jen tehdy, když konec leží v pásu `TRAIL_END_BAND_M` (+ 1 m –
    táž konstanta `EDGE_SLACK_M` jako v `trailAxisRoads`) u strany, kterou stezka opouští – rozbitá
    stezka (mezera) se na okraj nepromítá; týž predikát je díl u okraje v mřížce pochodu.
    **Úhlopříčná stezka s koncem u rohu** (obě mezery do `TRAIL_END_BAND_M` = 30 m + 1 m) rohem
    nevede (návrh Clauda 17. 11. 2026 – závěrečná revize B-M4): svět pochodu je čtyřsousedný, na
    úhlopříčnou mapu se jde přes kolmou mapu, kde by u rohu pokračování ani průsek nebyl; výstup
    proto vede stranou s menší mezerou, při rovnosti v pevném pořadí stran N, E, S, W (NE → N,
    SE → E, SW → S, NW → N).
  - **Souhrn vsi** nese výstupy (`VillageDigest.trailExits`, `villageDigest`); chybí = souhrn uložený
    dřív, `VILLAGE_DIGEST_VERSION` zůstává 4.
  - **Vstupy na mapě** (`war/trail-continuation.ts` – `trailEntriesOf`): výstupy vsí 8 sousedních
    políček, jejichž krok vede na mapu, bod `edgeCrossing` a den dostavění (`TrailEntry`). Čte je
    `createCampaignCells` při každém `mapOf` (`CampaignMap.trailEntries`) přes port
    `TrailExitSource` (`application/neighbour-trails.ts`; adaptér `createTrailExitSource` v
    `packages/db/src/adapters/trail-exits.ts` – jeden dotaz `settlement` ⋈ `village`, ze souhrnu jen
    `v` a `trailExits`); souhrn bez výstupů (`exits` null – starší, jiné verze tvaru nebo stavu) →
    `find` + `trailExitsOf` v paměti podle `id@verze` (`CAMPAIGN_CELL_CACHE_SIZE`).
  - **Osa** (`trailContinuations`, jen server – trasa není det-math): každý vstup zvlášť – konec
    stezky krajiny (`landscapeTrailLines`) do 30 m od vstupu → bez osy; jinak `walkAll` po
    `trailTerrain` s `sacredMask`, bez pevných cest a humen, ze schůdné buňky nejbližší vstupu
    (`nearestTrailCell`) k buňce nejbližší brance dvorce, bez branky k nejbližší (po síti, remíza
    nižší index) buňce největší souvislé oblasti mřížky mapy bez vsi (`largestRegion`, jednou na
    krajinu a vrstvu); vstup v oblasti nebo nedosažitelný cíl → bez osy; osa `traceRoute` od vstupu.
    Pro tentýž vstup tentýž objekt (mezipaměť podle krajiny jako `trailRoutes`, 16 klíčů), žádná osa
    `NO_CONTINUATIONS`.
  - **Den** (`continuationsOf(mapa, ves, den)`): jen vstupy s `builtDay < den` (Review Focus 6 –
    takt přepočtený z bodu nevidí pokračování dřív, než stezka stála), branka `trailStart` první vsi
    mapy. Mřížku pochodu skládá `gridOf` / `mapGrid` / `gridOn` (war.md – Mřížka) a pro pohledy
    `mapTrailContinuations` (scéna a minimapa – osy jako data).
  - **Vlkov (16. 11. 2026, DB jen čtením):** výstup S (konec 30 m od kraje) zůstává. Úseky N a E
    končí uvnitř mapy (z = −129, x = 321) – síť cest Vlkova ke kraji N ani E nevede (viz převod
    stezky výš), konec leží mimo pás kraje, takže jejich výstup (rozbitá stezka) po opravě
    „jen u stezky, která končí u okraje“ nevzniká. Dosah ze vstupu měřený před opravou: N (48; 1)
    23,1 % mapy (bez něj 3,0 %), E (49; 0) 22,2 % (2,1 %), S (48; −1) 26,6 % (0 %) – vždy celá
    největší oblast. První `continuationsOf` mapy ≈ 0,5 s, další z paměti ≈ 0,02 ms.

- **Sousedé a obchod** (trade.md – Sousedé, Obchod; `neighbours.ts`, `trade.ts`): `neighbourOf(seed,
směr)` – stálá povaha podle druhu souseda (`neighbourKind` – obilnáři, pastevci, lesní ves,
  řemeslníci, každý dvakrát kolem vsi; `NEIGHBOURS.kinds`: 2–3 nabízí ze své nabídky, 2–3 shání –
  `always` vždy, zbytek z `needs`), roční zásoby a poptávka `NEIGHBOURS`, jméno
  `suggestVillageName` – kronika ho skloňuje: kovář a směna se sousedem, web-ui.md – Panel
  Kronika), `neighbourStock` – zbytek roku obchodu
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
  z `lib/caravan-view.ts`): jedna skupina po zemské stezce ve skutečném čase od začátku dne, kdy
  běžící cesta začala (`SceneExpedition.startDay`; `caravanTimeline` – tam chůzí 1,2 m/s, s vozy
  nebo dobytkem tempem volů 0,85 m/s – `caravanSpeed`, herní den za krajem mapy, do vsi na téže
  mapě bez něj, zpátky; `caravanHead`; po návratu `CARAVAN_LINGER_S` v hloučku), ne podle práce
  dne ani postupu v jádru – výprava se v jádru vrátí dřív a scéna si karavanu i s vozy pamatuje do
  jejího konce (`ActivityMemory` v `scene/activity-memory.ts`, klíč výprava + `startDay`; naráz jich
  může jít víc, starší napřed – vůz dojede rozjetou cestu; `withoutArriving` – koupené krávy a voli
  dohrávané karavany ubudou z ohrad a `livestock.cow`, lidé přibylí po posledních datech s ní
  (`SeenCaravan.known`, nejvýš `coming.length`, ne novorozenci) z `labor.persons`, dokud nedojde); tam
  nosiči s nákladem a lidé, kteří odcházejí (`givePeople.members`), zpátky nosiči a lidé od
  souseda (`newcomerProfiles`); postavy `caravanFigures` ve `villager-plan.ts` (podíl `trade`
  se pak nekreslí; `VillagerPose.hidden` za krajem mapy), vůz v čele `caravanCartPlan`
  (`CartCaravan` v `cart-layout.ts`, `CartPose.hidden`); obal postav zahrne celé stezky
  s karavanou (`caravanExtent`). **Karavana nákupu u sousedů** (`purchaseCaravan` – crafts.md,
  Nákup u sousedů): `porters` = skupina nákupu (i posádky vozů), jede-li vozem, `carts` z
  `CraftPurchase.carts` a `cartCrew` `CARTS.tradeCrew` jako u výprav (vozy tempem volů –
  `caravanSpeed`; Vozy, D117). Ukázka `/dev/landscape` – **Karavana**. Use-case `sendExpedition`,
  server action `sendExpedition` (`{ villageId, direction, give, get, givePeople?, getPeople? }` –
  `parseSendExpeditionInput`).
  Web: `VillageManor.neighbours` (`neighbourViews` – ceny řádků × `goodWorth` jako na serveru, jinak
  by po zlém roce kraje náhled ukázal férovou výměnu, kterou server odmítne), panel
  `hud/TradePanel.tsx` (soused a směr,
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
  – **zásilka do vsi jiného hráče** (`TradeExpedition.kind = 'shipment'`, bez stezky, bez návratu
  zboží) je táž výprava s jinou událostí na konci: `docs/code/vassalage.md` – Zásilky mezi vsemi hráčů.

- **Jen společné suroviny** (trade.md – Jen společné suroviny; Martin 19. 10. 2026: „Nech jen
  společné suroviny, nezaváděj nové.“): obchod zná jen zboží, které má i ves (`TradeGood` – obilí,
  luštěniny, maso, sýr, dobytek, klády, keramika, nástroje, uhlí; `TRADE_GOODS`). Zboží zvenku
  (sůl, železo, med, kožešiny – dřívější soubor zboží) ve hře není. Starší vsi převede
  `withoutForeignGoods` (`trade.ts`; v `updateVillage` i na začátku `advanceVillage`, bez příznaku,
  idempotentně): zahodí `goods` a podíl medu v jídle, uložený zbytek roku souseda, který nesedí na
  jeho povahu, a výpravu na cestě pro zboží zvenku zruší – nosiči přinesou zpět, co nesli
  (`get` = `give`); z kroniky výprav zboží zvenku zmizí.

- **Kůže, kožešiny, med a vosk** (trade.md – Jen společné suroviny; hides-honey.md – Obchod):
  `TradeGood` += `honey` / `hides` / `furs` / `wax` (`TRADE_GOODS` za kamenem). Hodnoty v
  `TRADE_GOOD_VALUES`, druhy sousedů a roční množství `NEIGHBOURS.waresKinds` / `waresAmounts`
  (`rules-trade.ts`), losy `waresAmounts` v `neighbours.ts` z proudu `neighbour-wares:{směr}`.
  Zásoba ve vsi `villageGoodStock` (`trade.ts`): `floor` z `hides` + `smallHides × smallHideRatio()`
  (`HIDES.smallHideM2 / hideM2`), ze `sheepFurs + wildFurs`, z `honeyKg` a `waxKg`; `addGood` při
  prodeji bere napřed velké kůže a kožešiny z lovu, nákup kůží jde do `hides`, kožešin do
  `wildFurs` (`ensureWares`). Rozpis kůží a kožešin pro popisek: `VillageNeighbour.wares`
  (`manor-view.ts`) → `waresNote` v `TradePanel.tsx`. Názvy a ikony: `TRADE_GOOD_NAMES`
  (`trade-names.ts`); kronika je bere z `goodsText`. Zbytek roku souseda uložený bez nového zboží
  zahodí `fitsNeighbour` (`withoutForeignGoods`) – soused dostane plný rok.

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
  (`horsesWanted.mares` nejmladších zůstane) a jezdecké koně – bez koně s jezdcem
  zůstane nejlépe vycvičený hřebec (i bez klisny). Koupě potřebuje místo v ohradách koní (`horseTradeRoom` – bez
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

- **Nákup osiva** (trade.md – Nákup osiva, fields.md – Osivo pro ves bez zásob; Martin 27. 10.
  2026): `seed-buying.ts` – ves bez osiva na nutné díly ho 1. 9. a 1. 3. sama koupí (`buySeed`):
  zásoba obilí sousedů `neighbourStock` (po zlém roce menší – `seasonSupply`) ubude přes
  `storeStock` (z `trade.ts`), platba hřivny → krávy `surplusCows` (husbandry.ts – nad
  `breedingCows` + `oxenCalvesWanted`, jako porážka; od 2. 11. 2026, dřív `cattleForSale` nad
  `TRADE.keepCows`) v `sellPrice` × `goodWorth`,
  bez stezky a bez nosičů (zboží hned); podrobnosti village-fields.md – Osivo pro ves bez zásob.
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
  dvorec, ne dědic – `unmarriedHeir` v `households.ts` –, ne rozpad domácnosti, ve vsi s rodem ne
  muž rodu ani manželka muže rodu – `keptByLine`, lord.md – Manželky; postupně, prefix
  stálý); odejdou hned v `startExpedition` (`removePeople` se směrem, `TradeExpedition.givePeople`
  i s `members` – pohlaví a den narození pro postavy karavany). Lidé souseda
  (`TradeExpedition.getPeople`, `ComingPeople`) přijdou v `finishExpeditions` – `settleNewcomers`
  podle `newcomerProfiles` (pohlaví a věk z losu ze seedu a id výpravy – stejně pro postavy ve
  scéně; rodina do prázdného obydlí, jinak do domu s nejvíc místy mimo dvorec, svobodný do
  obydleného domu s nejvíc místy; kronika `newcomer`). Lidé nosiče nepotřebují. Web:
  `VillageNeighbour.people` (`neighbourViews` – `offers`, `takes`, `have` po výběru jádra), náhled
  `tradePreview(…, people)`, řádky rodina / muž / žena v `TradePanel` (ikony
  `resources/family.png`, `man.png`, `woman.png`), upozornění „Přišla rodina ze severu“.

Počasí kraje mění zásoby a ceny sousedů 1. 11. – [village-disasters.md](village-disasters.md#kraj-kolem-vsi-sousedé-a-zvěř-p4).
