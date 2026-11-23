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

- **Konec smyšlených sousedů** (markets.md – Pravidla 1 a 10; 23. 11. 2026): sousedé za krajem
  mapy – povaha, roční zásoby a poptávka, výměna lidí – skončili; ves neobchoduje, nekupuje, nikoho
  nedá ani nepřijme. Z obchodu zůstává zboží ve vsi (`goods.ts` – `TRADE_GOODS`, druhy dobytka
  a koní; `villageGoodStock`, `addGood` v `trade.ts`) a jeho hodnota v kg obilí
  `TRADE_GOOD_VALUES` (rešerše `research/2026-10-18-trade-values.md`) – `sellPrice` a `goodWorth`
  (zdražení zboží po zlém roce kraje, rok obchodu `tradeSeason` od 1. 11.) platí koně nové ohrady
  (`horsePenPayment`). Uložené zbytky roku sousedů (`neighbours`) smaže převod
  `fictional-neighbours` (`withoutFictionalNeighbours` v `trade/legacy-neighbours.ts`, poslední
  v `VILLAGE_MIGRATIONS` – village-core.md, Převody starších vsí); `VillageTrade` = `expeditions`
  a `nextId` (zásilka z vsi bez obchodu ho založí – `dispatchShipment`).
- **Výprava na cestě** (`TradeExpedition`; markets.md – Pravidla 10): výprava k dřívějšímu
  sousedovi uložená před koncem smyšlených sousedů doběhne – nová nevyrazí; přinese zboží,
  dobytek, koně i lidi. **Lidé na výpravě mají vlastní podíl práce** (Martin 19. 10. 2026):
  jediné pravidlo pro každou výpravu ve `state.trade.expeditions` (i zásilku a výpravu na trh) –
  `expeditionLaborToday` = `expeditionLaborNeed(state, day)` (každá výprava kolik s ní jde lidí –
  nosiči, honáci, posádky vozů –, nejvýš co jí zbývá; výprava na trh jen v okně dní – Výprava na
  trh níž), nejvýš kolik je dospělých mimo dílny; jde do `allocateDay` jako `away` hned po denním
  minimu domácností (to má přednost), před úlohami dne – výprava trvá přesně své dny cesty, zdrží
  se jen ves bez dost dospělých (výprava na trh ne – má pevný termín);
  `workExpeditions(state, allocation.away, day)` ho rozdělí mezi výpravy (v rozdělení práce dne
  nejde ze společné práce – `idle` nezmenší); `finishExpeditions` (po práci – zboží do zásob,
  kronika `trade-returned`; staré `trade-departed` v kronice zůstávají; výpravu na trh nechá – tu
  uzavře výsledek trhu). Rozdělení práce: činnost `trade`, cíl `{ kind: 'trail' }`
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
  `caravanSpeed`; Vozy, D117). Ukázka `/dev/landscape` – **Karavana**. Panel obchodu se sousedy, use-case
  `sendExpedition` ani server action zmizely (markets.md – Pravidla 1; 23. 11. 2026): tlačítko Obchod
  ve dvorci není, `VillageManor` nenese sousedy. Výprava na cestě dál doběhne v `finishExpeditions`
  a karavana a kronika ji jmenují jménem dřívějšího souseda (`legacyNeighbourName` v
  `trade/legacy-neighbours.ts` – týž los jako dřív).
  – **zásilka do vsi jiného hráče** (`TradeExpedition.kind = 'shipment'`, bez stezky, bez návratu
  zboží) je táž výprava s jinou událostí na konci: `docs/code/vassalage.md` – Zásilky mezi vsemi hráčů.
  – **výprava na trh** (`TradeExpedition.kind = 'market'`, bez stezky, zboží přijde s výsledkem
  trhu) – Výprava na trh níž.

- **Trh – ceny a zápočet** (markets.md – Pravidla 4 a 5, Rozhodnutí plánu 2, body 3 a 4; čisté
  funkce `trade/market-prices.ts` a `trade/market-clearing.ts`, typy `types-market.ts`, čísla
  `MARKET` v `rules-market.ts`). **Ceny** `MarketPrices` (mince za kg, kus nebo m³; chybí =
  výchozí): `initialPrice` = hodnota v kg obilí (`TRADE_GOOD_VALUES`) ÷ `MARKET.grainKgPerCoin`
  (15 kg obilí za minci – kráva 40 mincí), `priceOf` zapamatovaná nebo výchozí; `nextPrices` ze
  součtů nabídek S a seznamů D tržního dne P × (1 + `MARKET.priceStep` × (D − S) / (D + S)) – za
  den nejvýš ±10 %, nikdy na nulu, zboží bez nabídky i poptávky beze změny (nový objekt). **Zápočet**
  `clearMarket(parties, prices)`: strany `MarketParty` (`key`, nabídka `offer`, seznam `wants`)
  v pořadí hostitel, pak výpravy podle příjezdu; každá prodá přesně za tolik, za kolik koupí, kus
  jen celý (`PIECE_GOODS` / `isPieceGood` v `goods.ts` – dobytek, koně, klády, kámen, kůže,
  kožešiny), kg libovolně. Kola se stropem V = min(hodnota nabídky, hodnota seznamu): strana prodá
  nejvýš za V a koupí nejvýš za V, kupci v pořadí stran a zboží seznamu v pořadí `TRADE_GOODS`, od
  prodávajících v pořadí stran; kupující koupí jen od strany svého kruhu (`tradeCircles` – silně
  souvislé komponenty grafu „kupuje od“, jinak by se prodávajícímu hodnota nevrátila). Nevyrovnaná
  strana (|utrženo − utraceno| > `TOLERANCE` = 10⁻⁷ většího z obou, relativně – výsledek nezávisí na měřítku cen) → V = min(V, utrženo, utraceno) u všech a nové
  kolo; po `CLEARING_ROUNDS` (32, technická mez, ne pravidlo) se poslední nevyrovnaná strana vyřadí
  a počítá se bez ní. Výsledek `MarketClearing`: `trades` (`MarketTrade` – kdo komu, co, kolik)
  v pořadí přidělení, `offered` / `wanted` součty celých nabídek a seznamů všech stran pro
  `nextPrices`; `partyTotals` – co strana prodala a koupila. Proti zadání plánu tři změny (návrh
  Clauda): strop omezuje, za kolik strana prodá, ne které zboží (nabídka oříznutá předem v pořadí
  `TRADE_GOODS` – obilí hostitele by vytlačilo jeho klády a dobytek), kruhy, a krok 5 vyřadí
  z nevyrovnaných poslední v pořadí stran.

- **Trh – co ves nabízí a shání, zpráva na pivo** (markets.md – Pravidla 3 a 8, Rozhodnutí plánu 2,
  body 5 a 7). `marketStance(state, day)` (`trade/market-stance.ts`) vrátí `MarketStance`
  (`offer`, `wants`) hostitelské vsi – jen makrokomodity výhledu dávek, `stewardOutlook` se počítá
  jednou a `villageSpare` celý se nevolá. Obilí: nabídka `grainSpareKg`, shání
  `grainReserveKg − grainOnHandKg` (`vassalage/spare.ts`); krávy a voli: nabídka `cattleSpare`,
  shání krav `breedingCows + oxenCalvesWanted − krávy` (celé nahoru) a vycvičených volů
  `oxenTrainingTarget − villageOxen − oxenComing`; koně po druzích: nabídka
  `min(horsesForSale, horsesOf − chce)`, shání `chce − horsesOf` (`chce` = `horsesWanted`);
  klády a kámen jen nabízí celou hromadu. Nabídka je nejvýš `villageGoodStock`, nulové položky se
  nezapisují, stav se nemění. `horsesOf(state, druh, day)` (`trade/horse-trade.ts`) počítá koně
  druhu v ohradách i pod jezdcem (prodat jde jen `horsesForSale`). `villageReport(state, day)`
  (`trade/village-report.ts`) složí `VillageReport`: lidé a hotová obydlí `roughCount` (násobek
  `MARKET.report.round`, nejméně 5), řemesla s pracujícím řemeslníkem (`ownCraftsmanWorks`) v pořadí
  potter, smith, burner, carpenter a obchodníci z `state.market.arrivals` (`VillageMarket`) od
  nejnovějšího, nejvýš `MARKET.report.traders` – technický strop paměti vsi, ne pravidlo hry (návrh
  Clauda).
- **Trh ve vsi** (markets.md – Pravidla 2, 3, 5 a 8, Rozhodnutí plánu 2, body 4–7; `trade/market.ts`,
  typy `types-market.ts`). Trh drží stav hostitelské vsi (`VillageState.market` – `VillageMarket`:
  ceny `prices`, výpravy na trhu `visitors`, `nextOrder`, paměť příjezdů `arrivals`) a počítá jen
  ze stavu hostitele a událostí schránky dne, takže výsledek nezávisí na kouscích dopočtu.
  - **Příjezd:** událost schránky `market-arrive` s `MarketArrival` (klíč `market:<domovská
ves>:<id výpravy>`, `stayDays`, `travelDays`, zboží `goods` – koně i tady jako počty po
    druzích, koně po kusech `MarketHorse` { `good`, `horse` }, seznam `wants`, zpráva na pivo
    `report`). `joinMarket(state, day, arrival)` založí trh, chybí-li, přidá návštěvníka
    `MarketVisitor` s `order` = `nextOrder` a `lastDay` = den + `stayDays` − 1 (kopie, kladné
    položky; počty koní ve zboží jsou počty kusů v `horses` po druzích – kůň, který nepřišel, se
    neprodá), poznámku do `arrivals` (posledních `MARKET.report.traders`), zprávu o domovské vsi
    (`rememberNews` → `VillageState.news`, `VillageNews` – jedna na ves, novější `report.day`
    vyhrává, při stejném dni pozdější zpráva) a kroniku `market-arrived`. Týž klíč podruhé (výprava
    na trhu nebo její výsledek v odchozí schránce) nic neudělá.
  - **Tržní den:** `marketDay(state, day)` – krok dne hned po událostech schránky
    (village-core.md – Pořadí práce dne). Bez návštěvníků nic (stav beze změny, klíč `market`
    nevznikne). Jinak strany zápočtu hostitel (`'host'`, `marketStance`) a návštěvníci podle
    `order`, `clearMarket` za ceny `market.prices`. Vyrovnání (`settleTrades`): hostitel prodané
    ubere (`addGood` záporně, koně `takeHorses` v pořadí prodeje) a koupené přidá (`addGood`, koně
    `addHorses`); návštěvníkovi ubude z `goods` a `wants` a přibude do `sold` a `bought`, koupení
    koně po kusech do `boughtHorses` – od hostitele z `takeHorses`, od výpravy její první kusy
    druhu; zbytky do šumu plovoucí čárky se smažou. Pak `market.prices = nextPrices(…)` z nabídek
    a seznamů dne a kronika `market-held` (co ves prodala a koupila – jen když něco).
  - **Odjezd:** návštěvník s `lastDay ≤ day` odjede – do odchozí schránky `VillageState.outbox`
    (`VillageMail` { `villageId`, `day`, `ref`, `body` } – tvar nové události schránky) jde
    `market-result` k domovské vsi na den `day + 1 + travelDays` (`ref` `marketResultRef` =
    `…:out`; příjezd má `marketArrivalRef` = `…:in`) se zprávou o hostiteli (`villageReport`) a cenami
    trhu. `marketResult` je jediné místo, kde vzniká `MarketResult` (`sold`, `bought`, `unsold` –
    co zbylo, koně domů `horses` – neprodaní i koupení, `report?`, `prices?`, `returned?`);
    nepoužitý příjezd nic neprodal ani nekoupil a domů jde vše, co vezl. Výsledek použije domovská
    ves (`applyMarketResult` – Výprava na trh níž); odchozí schránku doručí `deliverVillageMail`
    (Pošta mezi vsemi níž).
  - **Koně:** `takeHorses(state, druh, n, day)` (`horse-trade.ts`) – koně z `horsesToSell`
    odejdou z ohrad a vrátí se jako `TradedHorse` (den narození, pohlaví, výcvik); používá ho
    i `dispatchShipment` (zásilky beze změny výsledku), `removeHorses` je `takeHorses` bez výsledku.
  - **Stav:** `market`, `outbox` a `news` jsou volitelné a zapíšou se až při prvním použití –
    ves bez návštěv simuluje stejně (zlaté otisky beze změny), převod se nepřidává. Zaniklá ves se
    nesimuluje a schránku nepoužije.
- **Výprava na trh** (markets.md – Pravidla 2 a 3, Rozhodnutí plánu 2, body 1, 2 a 6;
  `trade/market-trip.ts`, typy `MarketOrder`, `MarketTarget`, `MarketTrip` v `types-market.ts`,
  čísla `MARKET.dayTripCells`, `daysPerCell`, `minStayDays`). Výprava domovské vsi je druh karavany
  (`TradeExpedition.kind = 'market'`, `trailId` −1, `destination` { `cells`, `firstStep` },
  `market` – `MarketTrip`: klíč, hostitel, seznam, pobyt, dny cesty, `arriveDay`, `returnDay`).
  - **Dny:** `marketTravelDays(cells)` = max(0, políčka − `dayTripCells`) × `daysPerCell` – ves
    na sousední mapě ráno tam a večer zpět (Martin 22. 11. 2026), každá další mapa den tam a den
    zpět. Výprava vyrazí ráno dne po odeslání (`departDay` = dnešek + 1 – dnešek vsi je spočtený),
    `arriveDay` = `departDay` + cesta, tržní dny `arriveDay` … `arriveDay` + pobyt − 1,
    `returnDay` = `arriveDay` + pobyt + cesta je první den doma.
  - **Lidé:** `marketCrew(give, wants, carts)` – jedna jízda: vozy (`tradeCarts`, v jeho pořadí)
    vezou kg zboží a celé klády, s každým `CARTS.tradeCrew` lidí; co se nevejde, nesou nosiči
    (`TRADE.porterKg`), klády po `TRADE.logCarriers`, dobytek a koně ženou honáci; kámen se
    nakládá jako u zásilky vazala (`shipment.ts`) – na každý započatý náklad čtyřkoláku
    `CARTS.tradeCrew` lidí, vůz netřeba; nosiči = víc z cesty tam (`give`) a zpět (`wants`),
    aspoň 1; zvolí počet vozů s nejméně lidmi (při shodě méně vozů).
  - **Kontroly:** `checkMarketTrip(order, input)` – jediné místo (server i náhled ve webu, vstup
    `MarketTripCheck` bez stavu – `stock`, `homeCarts` (`tradeHomeCarts`, bez ohledu na voly),
    `oxenHome`, `adults`, `cells`, `day`): tvar objednávky (konečná nezáporná čísla, kusové zboží
    celé – `MARKET_BAD_ORDER`), pobyt celé dny ≥ `minStayDays` (`MARKET_STAY`), zboží nejvýš
    `villageGoodStock` (`MARKET_OVER_STOCK`), vozy jen s voly, které po prodeji zbudou
    (`cartsWithOxen(homeCarts, oxenHome − give.trainedOxen)` – sdílí ho `tradeCarts`), nosiči
    nejvýš volní dospělí (`MARKET_NO_PEOPLE`), návrat před koncem světa (`MARKET_WORLD_END`).
    Prázdné `give` i `wants` jsou dovolené (výprava na pivo). `planMarketTrip` vstup složí ze
    stavu a přidá `cartIds`; `marketFreeAdults(state, day)` = dospělí mimo lidi pryč (`awayFromWork`)
    − `expeditionLaborNeed(day + 1)` − `purchaseTravelers` − `ironTripHelpers` (jeden pomocník
    pro server i náhled).
  - **Odchod:** `departMarket(state, day, order, target)` (kopie stavu): zboží `give` odejde
    (`addGood` záporně, koně po kusech `takeHorses`), výprava s `porters`, `carts`, `days` =
    2 × cesta + pobyt a `cost` = nosiči × dny, klíč `market:<domovská ves>:<id>`; do odchozí
    schránky příjezd (`market-arrive`, `marketArrivalRef`) k hostiteli na `arriveDay` se zprávou
    na pivo o domovské vsi (`villageReport`) a kronika `market-departed`.
  - **Pryč v pevné dny** (Rozhodnutí 2 – termín trhu je pevný): `expeditionLaborNeed` /
    `workExpeditions` berou nosiče výpravy na trh jen ve dnech `startedDay` … `returnDay` − 1,
    mimo ně nic, i když vsi chyběli dospělí; výprava nemá podíl po stezce. `marketTripsDay` (krok
    dne hned za `returnHome`) od `returnDay` vrátí vozy se spřežením (výpravě zmizí `carts`).
    `finishExpeditions` výpravu na trh nechá a jezdec vojvody ji nedoprovází (`lordRides` – jen
    výprava po stezce).
  - **Návrat:** událost schránky `market-result` → `applyMarketResult`: koupené a neprodané zboží
    do vsi (`addGood`, koně po kusech `addHorses`) – i bez záznamu výpravy, nic nezmizí –, výprava
    s klíčem výsledku se smaže, zpráva na pivo s cenami trhu do `news` (`rememberNews`, jen se
    záznamem výpravy) a kronika `market-returned` (`returned` – hostitel zanikl; bez záznamu
    výpravy s prázdným jménem vsi). Výsledek přijde nejdřív v `returnDay`.
- **Pošta mezi vsemi** (markets.md – Rozhodnutí plánu 2, bod 6; `application/village-mail.ts`,
  odchozí schránka obecně: village-core.md – Schránka vsi). Příjezd i výsledek jdou odchozí
  schránkou (`outbox`) a `deliverVillageMail` je zapíše do schránek cílových vsí – po odeslání
  výpravy a po dopočtu za odchody správce (`advancePlayer`, `dynastyForVillage`,
  `advanceDynasty`). Worker doručí i ves, kterou už dopočítal web a kterou proto nedopočítává
  (`stamp.lastDay ≥ cíl` – worker.md, Pošta mezi vsemi), takže pád webu mezi uložením vsi
  a doručením dožene příští kolo. Každá zpráva výpravy má pevný `ref` (`…:in`, `…:out`) – domů
  přijde nejvýš jeden výsledek, i když ho zapíše hostitel i domovská ves.
  - **Výprava po termínu** (`lastDay ≥ returnDay`, výsledek nepřišel – `hasVillageMail`): domovská
    ves načte hostitele. Výsledek v jeho odchozí schránce zapíše sama (hostitel ho pak zapíše
    znovu – zahodí se). Jinak, je-li hostitel pryč (`sleeps` – vymřel, opuštěn, ves chybí;
    `placeOf` null – sídlo v archivu): nepoužitý příjezd (ve schránce hostitele po jeho `lastDay` –
    `inbox.pending` do `TOTAL_GAME_DAYS`) se vrátí jako `marketResult(příjezd, { returned: true })`
    se vším, co výprava vezla; výprava, která už na trhu stojí (`market.visitors`), s tím, co drží
    (`unsold`, `bought`, koně). Výsledek jde do vlastní schránky s `ref` `marketResultRef` na den
    `lastDay + 1`. Živý hostitel pozadu znamená čekat – lidé jsou doma v plánovaný den, zboží
    přijde se zprávou v nejbližší nespočtený den. Příjezd v odchozí schránce vsi se za nepoužitý
    bere jen u hostitele, jehož ves chybí (návrh Clauda, upřesnění zadání): u existujícího ho
    doručení právě zapsalo do jeho schránky a zpráva, kterou minule nešlo smazat, nedokazuje, že ji
    hostitel nepoužil – vrácení se vším by zdvojilo zboží (test „příjezd, který minule nešlo
    smazat“).
  - **Pomocníci zásilek** (`application/shipments.ts`, exportované beze změny chování pro poštu
    a výpravu na trh): `sleeps`, `placeOf` (`ShipmentPlace` – políčko, držitel, odříznutí),
    `stepToward`, `crossesIsolation`.
  - **Testy:** `application/__tests__/village-mail.test.ts` (kolo tam a zpět, hostitel pozadu,
    vymřelý a archivovaný hostitel, zmizelá ves, chyba a souběh, web po dopočtu) a
    `advance-world.test.ts` – Pošta mezi vsemi ve workeru (ves dopočtená webem, zámek, kola workeru
    = ruční postup); dva hráči na sousedních mapách v `__tests__/market-world.ts`.
- **Jen společné suroviny** (trade.md – Jen společné suroviny; Martin 19. 10. 2026: „Nech jen
  společné suroviny, nezaváděj nové.“): obchod zná jen zboží, které má i ves (`TradeGood`,
  `TRADE_GOODS`). Zboží zvenku (sůl, železo, med, kožešiny – dřívější soubor zboží) ve hře není.
  Starší vsi převede `withoutForeignGoods` (`trade.ts`; v `updateVillage` i na začátku
  `advanceVillage`, bez příznaku, idempotentně): zahodí `goods` a podíl medu v jídle a výpravu na
  cestě pro zboží zvenku zruší – nosiči přinesou zpět, co nesli (`get` = `give`); z kroniky výprav
  zboží zvenku zmizí. Hřivny místo nástrojů ve výpravách a kronice převede `withIronBarsTrade`.

- **Kůže, kožešiny, med a vosk** (hides-honey.md – Obchod): `TradeGood` += `honey` / `hides` /
  `furs` / `wax` (`TRADE_GOODS` za kamenem), hodnoty v `TRADE_GOOD_VALUES`. Zásoba ve vsi
  `villageGoodStock` (`trade.ts`): `floor` z `hides` + `smallHides × smallHideRatio()`
  (`HIDES.smallHideM2 / hideM2`), ze `sheepFurs + wildFurs`, z `honeyKg` a `waxKg`; `addGood`
  ubírá napřed velké kůže a kožešiny z lovu, přidané kůže jdou do `hides`, kožešiny do `wildFurs`
  (`ensureWares`). Názvy a ikony: `TRADE_GOOD_NAMES` (`trade-names.ts`); kronika je bere
  z `goodsText`.

- **Dobytek ve třech druzích** (trade.md – Dobytek ve třech druzích; Martin 20. 10. 2026: „s
  dobytkem by také mělo jít obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí se
  vycvičit) a vycvičené voly“; `cattle-trade.ts`): `CattleGood` = `cows` / `youngOxen` /
  `trainedOxen` (`CATTLE_GOODS`, `isCattleGood`) místo `cattle`; hodnoty 600 / 350 / 1 200 kg obilí
  (rešerše `research/2026-10-20-cattle-trade.md`). Dobytek z výpravy na cestě přijde
  v `finishExpeditions` – `addCattle` (krávy do stáda skotu, mladý vůl `oxTrainedDay` od příchodu,
  vycvičený se `CATTLE_TRADE.servedYears` 3 roky služby – `boughtOxTrainedDay`; kdo se do ohrad
  volů nevejde, do `looseOxen`). Co ves dá (zásilky vazalů – vassalage.md): `cattleForSale` /
  `removeCattle` (krávy bez chovného páru, mladí voli z výcviku – nejdelší výcvik napřed, vycvičení
  doma mimo posledních 2 let služby – nejstarší napřed); `villageGoodStock(state, good, day)`.
  Krávy a voli na cestě (`cowsComing`, `oxenComing`) jsou v `lastingOxen`, místech výcviku a seči;
  pár bez rádla dostane rádlo bez výcviku (`ardsWithoutTraining` v `trainTeamsWhenReady`). Dobytek
  jde po svých s honákem (`carriers`). Převod `withCattleKinds` (před `withoutForeignGoods`,
  v `updateVillage` i `advanceVillage`) přejmenuje `cattle` výprav a kroniky na krávy. Ikony
  `cow`, `young-ox` (menší světlejší vůl – `icons.py`) a `ox`; karavana – `SceneExpedition.cattle`,
  `CaravanColumn.animals` po dvou za vozy, kreslí `VillageLivestock` modelem krávy
  (`caravan-cattle.ts`).

- **Koně ve třech druzích** (horses.md – Nákup a prodej; Martin 23. 10. 2026: koně jako ostatní
  zvířata; čísla návrh Clauda; `horse-trade.ts`): `HorseGood` = `foals` | `mares` |
  `ridingHorses` (kusy, `HORSE_GOODS`, `isHorseGood`, `isLivestockGood` = dobytek nebo koně).
  Hodnoty `TRADE_GOOD_VALUES` 800 / 1 600 / 2 400 – jezdecký kůň má cenu **za kus** podle výcviku
  (`horseValueKg` = 2 400 + 1 200 × výcvik/100; platba koní nové ohrady, půjčky vazalů). Ves dá
  (`horsesForSale`, `horsesToSell`) jen koně bez jezdce: hříbata do 3 let (napřed nejstarší),
  klisny nad chovné (`horsesWanted.mares` nejmladších zůstane) a jezdecké koně – napřed nejméně
  vycvičené; bez koně s jezdcem zůstane nejlépe vycvičený hřebec (i bez klisny). Koně výpravy na
  cestě mají věk a výcvik uložené od odchodu (`TradeExpedition.horses?`, chybí = žádní);
  `finishExpeditions` je přidá (`addHorses` – do volných míst, přebytek do první ohrady koní, bez
  ohrady na maso). Doprava zásilek: honák na 4 koně (`TRADE.horsesPerDrover`). Web: názvy a ikony
  `foal`, `mare`, `horse` v `TRADE_GOOD_NAMES`; karavana koně nenese (`carries`).

- **Nákup osiva** (trade.md – Nákup osiva, fields.md – Osivo pro ves bez zásob): zrušen 23. 11.
  2026 (markets.md – Pravidla 1) – ves bez osiva na nutné díly ho nekoupí, 1. 9. a 1. 3. jen
  zapíše do kroniky, kolik chybí (`seedReserveDay` v `seed-reserve.ts`); podrobnosti
  village-fields.md – Osivo pro ves bez zásob.
- **Lidé – koho ves dá a kdo přijde** (trade.md – Výměna lidí; Martin 19. 10. 2026;
  `people-trade.ts`): výměna lidí se sousedy skončila s obchodní výpravou (markets.md – Pravidla 1).
  Koho ves smí dát (zásilky vazalů – vassalage.md), vybere `emigrantGroups` (`Emigrants` – rodiny
  podle `familiesOf`, pak svobodní muži, pak ženy 16–44 – `nextSingle`, z nejvíc přeplněného domu,
  ne dvorec, ne dědic – `unmarriedHeir` v `households.ts` –, ne rozpad domácnosti, ve vsi s rodem
  ne muž rodu ani manželka muže rodu – `keptByLine`, lord.md – Manželky; postupně, prefix stálý).
  **Muži a ženy zvlášť** (Martin 19. 10. 2026): `TradePeople` = `families`, `men`, `women`.
  Lidé z výpravy na cestě (`TradeExpedition.getPeople`, `ComingPeople`) přijdou
  v `finishExpeditions` – `settleNewcomers` podle `newcomerProfiles` (pohlaví a věk z losu ze seedu
  a id výpravy, věky `PEOPLE_TRADE` – stejně pro postavy ve scéně; výprava s `getPeople.adults`
  uložená dřív losuje pohlaví jako dřív; rodina do prázdného obydlí, jinak do domu s nejvíc místy
  mimo dvorec, svobodný do obydleného domu s nejvíc místy; kronika `newcomer`). Kdo s výpravou
  odešel, nese `TradeExpedition.givePeople` i s `members` (pohlaví a den narození pro postavy
  karavany). Ikony `resources/family.png`, `man.png`, `woman.png` zůstaly.

Počasí kraje mění hodnotu zboží od 1. 11. – [village-disasters.md](village-disasters.md#kraj-kolem-vsi-hodnota-zboží-a-zvěř-p4).
