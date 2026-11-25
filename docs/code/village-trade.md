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
  den nejvýš ±10 %, **dno = `initialPrice`** (Martin 23. 11. 2026 – nikdo neprodá pod výchozí hodnotou, nahoru volně; uložená cena pod dnem se při dalším tržním dni zvedne na dno; výchozí cena nezávisí na počasí kraje, takže žádné zdražení; zápočet se nemění), zboží bez nabídky i poptávky beze změny (nový objekt). **Zápočet**
  `clearMarket(parties, prices)`: strany `MarketParty` (`key`, nabídka `offer`, seznam `wants`)
  v pořadí hostitel, pak výpravy podle příjezdu; každá prodá přesně za tolik, za kolik koupí, kus
  jen celý (`PIECE_GOODS` / `isPieceGood` v `goods.ts` – dobytek, koně, klády, vozy, kámen, kůže,
  kožešiny, lidé), kg libovolně. Kola se stropem V = min(hodnota nabídky, hodnota seznamu): strana prodá
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
  body 5 a 7; Rozhodnutí plánu 3, bod 5). `marketStance(state, day)` (`trade/market-stance.ts`)
  vrátí `MarketStance` (`offer`, `wants`) hostitelské vsi – makrokomodity výhledu dávek a výrobky
  dílen, `stewardOutlook` se počítá jednou a `villageSpare` celý se nevolá. Obilí: nabídka
  `grainSpareKg`, shání `grainReserveKg − grainOnHandKg` (`vassalage/spare.ts`); krávy a voli:
  nabídka `cattleSpare`, shání krav `breedingCows + oxenCalvesWanted − krávy` (celé nahoru)
  a vycvičených volů `oxenTrainingTarget − villageOxen − oxenComing`; koně po druzích: nabídka
  `min(horsesForSale, horsesOf − chce)`, shání `chce − horsesOf` (`chce` = `horsesWanted`);
  klády a kámen jen nabízí celou hromadu. Výrobky dílen (plán 3): nabídka nad vlastní potřebu –
  nástroje `toolEquipmentKg − toolNeedKg`, keramika a dřevěné nářadí zásoba (`craftStocks`) nad
  `craftTargets`, hřivny `ironBarsKg − smithBarsTargetKg`; shání jen bez vlastního pracujícího
  řemeslníka (`ownCraftsmanWorks` – kovář, hrnčíř, tesař) do potřeby – nástroje
  `toolNeedKg − toolEquipmentKg`, keramika a dřevěné nářadí `craftTargets − zásoba`, hřivny jen na
  vozy čekající na kování `ironOrderBarsKg − ironBarsKg`. Vozy po druzích: nabídka volné vozy
  (`idleCartsOf`) nad vozy, které ves chce (`cartsWanted` = `cartTargets[druh]`, `draft.ts`), bez
  vlastního pracujícího tesaře shání jeden vůz druhu `missingCart`. Nabídku výrobků dílen a vozů
  počítá `craftOffer(state, day)` – bez výhledu správce, levně; volá ji i `fillOrders`. Jídlo (maso, sýr, luštěniny), med, vosk,
  kůže, kožešiny a uhlí hostitel nenabízí ani neshání. Lidi nabízí, bez kterých ves pole udrží
  (`peopleSpare` z `vassalage/spare.ts` – po druzích, které jde vybrat celé najednou:
  `emigrantGroups` přes všechny druhy), a shání rodiny, když je půdy víc než práce (`peopleWanted`
  – Lidé na trhu níž). Nabídka je nejvýš `villageGoodStock`,
  nulové položky se nezapisují, stav se nemění. `horsesOf(state, druh, day)`
  (`trade/horse-trade.ts`) počítá koně druhu v ohradách i pod jezdcem (prodat jde jen
  `horsesForSale`). `villageReport(state, day)`
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
    vyhrává, při stejném dni pozdější zpráva) a kroniku `market-arrived` s vsí výpravy
    (`villageId` – Rozhodnutí plánu 3, bod 15); směr od domovské vsi `MarketArrival.firstStep`
    si návštěvník nese (`MarketVisitor.firstStep`, chybí u starších příjezdů). Týž klíč podruhé
    (výprava na trhu nebo její výsledek v odchozí schránce) nic neudělá. Kovář souseda
    (`MarketArrival.service` → `MarketVisitor.service`, Rozhodnutí plánu 3, bod 9) kuje hned po
    příjezdu (`serveShoeing` – village-livestock.md, Kovář souseda; kronika `horses-shod` za
    `market-arrived`). Partner za hledajícím (`MarketArrival.kin` → `MarketVisitor.kin`,
    Rozhodnutí plánu 3, bod 11) zbožím není (lidé příjezdu se do `goods` nepočítají) – usadí se hned
    po příjezdu (`receiveKin` – village-people.md, Sňatky – se sousedy; kronika svatby nebo
    `newcomer` za `market-arrived`).
  - **Tržní den:** `marketDay(state, day)` – krok dne hned po událostech schránky
    (village-core.md – Pořadí práce dne). Bez návštěvníků nic (stav beze změny, klíč `market`
    nevznikne). Výprava se `service` (kovář souseda) ani doprovod partnera (`kin`) do zápočtu
    nevstupují – jen v poslední den odjedou; jsou-li na trhu jen ony, tržní den není (ceny stojí). Jinak dva zápočty (`clearMarket`
    za ceny `market.prices`), oba se stranami
    hostitel (`'host'`) a návštěvníci podle `order`: napřed zápočet řemeslníků – výrobky dílen jen
    za obilí a luštěniny (`craftStance`, `craftParties` – Obilí za výrobky níž; bez nich se
    přeskočí), pak dnešní zápočet se zbytkem zboží – hostitel `marketStance` bez toho, co prodal
    v prvním (`goodsLeft`), návštěvníci, co jim zbylo. Vyrovnání po každém (`settleTrades`):
    hostitel prodané ubere (`addGood` záporně, koně `takeHorses` v pořadí prodeje) a koupené přidá
    (`addGood`, koně `addHorses`); návštěvníkovi ubude z `goods` a `wants` a přibude do `sold`
    a `bought`, koupení koně po kusech do `boughtHorses` – od hostitele z `takeHorses`, od výpravy
    její první kusy druhu; lidé po skupinách – hostitel vybere prodané najednou (`leavingGroups`),
    odejdou ve směru kupující výpravy do jejích `boughtPeople` (`sendPeople`), od výpravy první
    skupiny druhu (`takeVisitorPeople`) – k jiné výpravě do `boughtPeople`, hostitel je hned usadí
    (`settlePeople`, kronika `newcomer` za `market-held`); zbytky do šumu plovoucí čárky se smažou; prodej zakázkového zboží vsi se
    zakázkou ji zmenší, hotovou uzavře (`reduceOrder` – Zakázky níž). Pak
    `market.prices = nextPrices(…)` z původních nabídek a seznamů dne (`totalGoods` – i s obilím za
    výrobky, jako v jednom zápočtu) a kronika `market-held` (co ves prodala a koupila v obou
    zápočtech – jen když něco).
  - **Odjezd:** návštěvník s `lastDay ≤ day` odjede – do odchozí schránky `VillageState.outbox`
    (`VillageMail` { `villageId`, `day`, `ref`, `body` } – tvar nové události schránky) jde
    `market-result` k domovské vsi na den `day + 1 + travelDays` (`ref` `marketResultRef` =
    `…:out`; příjezd má `marketArrivalRef` = `…:in`) se zprávou o hostiteli (`villageReport`), cenami
    trhu a zakázkami, které hostitel zapsal (`recordOrders` – Zakázky níž). `marketResult` je jediné
    místo, kde vzniká `MarketResult` (`sold`, `bought`, `unsold` – co zbylo, koně domů `horses` –
    neprodaní i koupení, lidé – neprodaní vlastní `people?` a koupení `newcomers?`, `report?`,
    `prices?`, `returned?`, `ordered?`);
    nepoužitý příjezd nic neprodal ani nekoupil a domů jde vše, co vezl, i lidé. Výsledek použije domovská
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
  `market` – `MarketTrip`: klíč, hostitel, seznam, pobyt, dny cesty, `arriveDay`, `returnDay`
  a `oxen?` – voli pro koupené vozy).
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
    `villageGoodStock` (`MARKET_OVER_STOCK`), prodaný vůz nejede jako dopravní
    (`withoutSoldCarts` – z `homeCarts` odejde posledních `give[g]` vozů druhu, v pořadí
    `tradeHomeCarts` nejmladší volné, tytéž, které prodá `removeIdleCart`; odjede bez spřežení jako
    prodaní voli), vozy jen s voly, které po prodeji zbudou (`cartsWithOxen` nad zbylými vozy
    s `oxenHome − give.trainedOxen` – sdílí ho `tradeCarts`), nosiči nejvýš volní dospělí
    (`MARKET_NO_PEOPLE`; lidé na prodej nosiči nejsou – `planMarketTrip` počítá volné dospělé nad
    mělkou kopií vsi bez nich, `withoutGroups`, a jejich zásobu jako počet skupin, které s celým
    `give` odejdou – `leavingGroups`; stejně počítá roční výprava správce), koupené vozy jen s voly, kteří zbudou po prodeji i dopravních vozech
    (`oxenForCarts(wants)` = Σ `cartOxen(druh)` × kusy – `MARKET_NO_OXEN`; Rozhodnutí plánu 3,
    bod 4), návrat před koncem světa (`MARKET_WORLD_END`). Výsledek nese `oxen` – hráč voly
    nezadává, spočítá je server i náhled touž funkcí. Prázdné `give` i `wants` jsou dovolené
    (výprava na pivo). Kovář souseda jde sám (`MarketTripCheck.alone` – Rozhodnutí plánu 3, bod 9):
    `porters` 0, `carts` 0, volní dospělí se nekontrolují. `planMarketTrip(…, { alone? })` vstup
    složí ze stavu a přidá `cartIds` (jen ze zbylých
    vozů); `marketFreeAdults(state, day)` = dospělí mimo lidi pryč (`awayFromWork`)
    − `expeditionLaborNeed(day + 1)` − `purchaseTravelers` − `ironTripHelpers` (jeden pomocník
    pro server i náhled).
  - **Odchod:** `departMarket(state, day, order, target)` = kopie stavu + `departMarketInPlace(state,
day, order, target, { by?, seedKg?, alone?, service?, kin?, people? })` (mutuje – i krok dne bez klonu celé vsi; den
    jde parametrem, `lastDay` se nemění; odmítnutí `planMarketTrip` stav nezmění): zboží `give` odejde
    (`addGood` záporně – prodané vozy `removeIdleCart`, koně po kusech `takeHorses`), výprava s
    `porters`, `carts`, `days` = 2 × cesta + pobyt a `cost` = nosiči × dny, voli pro koupené vozy
    `market.oxen`, kdo ji poslal `TradeExpedition.by` (`TripBy` – `villagers`, `steward`, `smith`,
    `kin`; chybí = hráč), klíč `market:<domovská ves>:<id>`; do odchozí schránky příjezd
    (`market-arrive`, `marketArrivalRef`) k hostiteli na `arriveDay` se zprávou na pivo o domovské
    vsi (`villageReport` – před odchodem zboží) a směrem `firstStep` a kronika `market-departed`
    s hostitelem `villageId` a `by` (Úloha 11 podle `villageId` maskuje jména pro cizího správce).
    **Výprava kováře** (Rozhodnutí plánu 3, bod 9; `answerSmithAsk` – village-livestock.md, Kovář
    souseda): `by: 'smith'`, `alone` – kovář jde sám, `porters` 0, bez vozů, `cost` 0 (pryč je jako
    `Person.away` `'craft'`); `give` = hřivny na koně, `wants` prázdné, příjezd nese `service`
    { `kind: 'shoeing'`, `horses` }. U hostitele do zápočtu nevstupuje (Trh ve vsi výš); výsledek
    s poplatkem v `bought` a nespotřebovanými hřivnami v `unsold` jde domů jako u každé výpravy.
    **Výprava partnera** (Rozhodnutí plánu 3, bod 11; `answerKinAsk` – village-people.md, Sňatky –
    se sousedy): `by: 'kin'`, `kin` (`MarketKin` – id hledajícího, `extraWife`) a `people` – partner,
    který už odešel ze vsi (`sendPeople`); v příjezdu je v `people` za lidmi z `give`, ve zboží ani
    v `give` výpravy není. `give` / `wants` prázdné, doprovod aspoň 1 nosič.
    `marketCarryKg(adults, carts)` – obráceně k `marketCrew`: kolik kg nošeného zboží unese jedna
    cesta s nejvýš `adults` lidmi a vozy `carts` (vesničané podle toho nakoupí jen to, co unesou).
  - **Pryč v pevné dny** (Rozhodnutí 2 – termín trhu je pevný): `expeditionLaborNeed` /
    `workExpeditions` berou nosiče výpravy na trh jen ve dnech `startedDay` … `returnDay` − 1,
    mimo ně nic, i když vsi chyběli dospělí; výprava nemá podíl po stezce. Voli pro koupené vozy
    jsou pryč jako voli vozů výpravy (`oxenAway` přičte `market.oxen`, takže je `oxenHome` nevidí).
    `marketTripsDay` (krok dne hned za `returnHome`) od `returnDay` vrátí vozy se spřežením i voly
    pro koupené vozy (výpravě zmizí `carts` a `market.oxen`, i bez výsledku trhu).
    `finishExpeditions` výpravu na trh nechá a jezdec vojvody ji nedoprovází (`lordRides` – jen
    výprava po stezce).
  - **Návrat:** událost schránky `market-result` → `applyMarketResult`: koupené a neprodané zboží
    do vsi (`addGood`, koně po kusech `addHorses`, vozy po kusech se stářím `addMarketCarts` – neprodaný
    vůz se vrátí stejně starý; neprodaní vlastní lidé `restorePeople`, koupení `settlePeople` ze
    směru výpravy, kronika `newcomer` za `market-returned`) – i bez záznamu
    výpravy, nic nezmizí (lidé se pak usadí bez směru a kroniky) –, koupené obilí do `MarketTrip.seedKg` jde do rezervy osiva
    (`reservedSeedKg` – ves ho nesní, village-fields.md – Osivo – nákup na trhu), výprava
    s klíčem výsledku se smaže, zpráva na pivo s cenami trhu do `news` (`rememberNews`, jen se
    záznamem výpravy), zakázky vsi (`rememberOrders`, jen se záznamem výpravy – Zakázky níž)
    a kronika `market-returned` s hostitelem `villageId` a `by` výpravy (`returned` – hostitel
    zanikl; bez záznamu výpravy s prázdným jménem vsi, bez `villageId` a `by`). Výsledek přijde
    nejdřív v `returnDay`.
- **Pošta mezi vsemi** (markets.md – Rozhodnutí plánu 2, bod 6; `application/village-mail.ts`,
  odchozí schránka obecně: village-core.md – Schránka vsi). Příjezd i výsledek jdou odchozí
  schránkou (`outbox`) a `deliverVillageMail` je zapíše do schránek cílových vsí – po odeslání
  výpravy a po dopočtu za odchody správce (`advancePlayer`, `dynastyForVillage`,
  `advanceDynasty`). Worker doručí i ves, kterou už dopočítal web a kterou proto nedopočítává
  (`stamp.lastDay ≥ cíl` – worker.md, Pošta mezi vsemi), takže pád webu mezi uložením vsi
  a doručením dožene příští kolo. Každá zpráva výpravy má pevný `ref` (`…:in`, `…:out`) – domů
  přijde nejvýš jeden výsledek, i když ho zapíše hostitel i domovská ves.
  - **Zaniklé vsi a zprávy plánu 3** (markets.md – Rozhodnutí plánu 3, bod 13; krok 1
    `deliverVillageMail`): ves je zaniklá, když chybí, spí (`asleep` v otisku – vymřela, opuštěná)
    nebo má sídlo v archivu (Začít znovu – `archivedOf`; jako zaniklý hostitel výpravy po termínu,
    návrh Clauda – archivovanou ves nikdo nedopočítá). Zjistí to `goneTargets` jen pro zprávy, na
    kterých záleží (dotazy a výsledky s lidmi), jedním dotazem `archivedOf`.
    - Dotaz a ohlášení bez nákladu (`kin-ask`, `smith-ask`, `order-ready` – `isQuery`) do zaniklé
      vsi se zahodí a zmizí z `outbox` – nikdo nikam nejde (hledající se zeptá znovu, ves s koňmi
      jiné vsi s kovářem, zakázka u hostitele vyprší).
    - Výsledek s lidmi (`people`, `newcomers`) pro zaniklou domovskou ves: lidé jdou zprávou
      `stranded-people` (`strandedMail` – `ref` `<ref výsledku>:back`, den výsledku; `own` =
      skupiny, které prodal sám hostitel – `MarketPerson.fromHost` z `settleTrades`, `people` =
      ostatní – vlastní lidé výpravy a koupení od jiné výpravy; `from` = `MarketResult.origin`)
      rovnou do schránky vsi, jejíž `outbox` se doručuje (hostitel); zboží výsledku se zahodí jako
      v plánu 2. Spí-li i hostitel (`sleeps`), zahodí se celý – obě vsi jsou pryč; hostitele
      v archivu krok nezkoumá (`sleeps` ho nepozná): zpráva padne do jeho schránky, kterou nikdo
      nepoužije – ztráta je táž. Výsledek, který domovská ves už použila (výprava není v jejím
      stavu – `awaitedTrip`; opakované doručení po pádu mezi zápisem a smazáním z `outbox`), se
      zahodí – lidé by se zdvojili. Výsledek bez lidí beze změny (zmizelé vsi se zahodí, spící
      zapíše).
    - **Domov zanikl, když už výsledek ležel v jeho schránce** (hostitel doručuje hned po dávce, takže
      výsledek je ve schránce domova většinou dávno před svým dnem): úloha světa
      `returnStrandedPeople` (worker, `runWorldTasks` 1× za minutu; návrh Clauda: nikdo nesmí
      zmizet) vezme výsledky s lidmi ve schránkách zaniklých vsí (`inbox.strandedResults` –
      ves spí nebo má sídlo v archivu) a nepoužité (výprava je ještě ve stavu vsi – `awaitedTrip`,
      hostitel je její cíl) pošle hostiteli jako `stranded-people` – tentýž `strandedMail` i `ref`
      jako krok 1, takže se zpráva nezdvojí ani při souběhu webu a workeru. Zanikl-li i hostitel
      (spí, chybí, sídlo v archivu), lidé se ztratí – **jediná přijatá ztráta**, oba konce jsou
      mrtvé. Vyřízené výsledky (vrácené, použité před zánikem, ztracené) úloha smaže ze schránky
      zaniklé vsi (`inbox.dropStranded`, až po zápisu zpráv – pád mezi tím znamená příště týž
      `ref`), takže je příště nečte znovu. Nepoužitý výsledek pozná podle stavu vsi, ne podle dne:
      vymřelá ves posune `lastDay` přes den vymření až na konec dávky, dny po vymření ale
      nesimuluje.
    - **Zboží výsledku pro zaniklý domov se zahodí** (návrh Clauda, Opravné kolo 1 úlohy 10): jako
      v plánu 2 a v kroku 1 – zboží s vsí zanikne (zásoby vymřelé vsi také zůstanou ležet), lidé ne.
      Vrátit ho hostiteli by mu dalo zaplacené zboží podruhé (platbu ze zápočtu už má).
    - `stranded-people` ve schránce hostitele, který zanikne dřív, než ji použije: domov je už pryč
      (zpráva vzniká jen po zániku domova) – oba konce mrtvé, táž přijatá ztráta.
    - Příjezd (`market-arrive`) jako v plánu 2 – do zmizelé vsi se vrátí jako `returned`, do spící
      nebo archivované se zapíše a vrátí ho výprava po termínu. Lidé na cestě (rodina na prodej,
      nevěsta či ženich výpravy `kin`) se tak po zániku cílové vsi vrátí domů s původními id
      (`applyMarketResult` → `restorePeople`).
    - Den `stranded-people` u hostitele závisí na tom, kdy se jeho odchozí schránka doručí (po
      dávce dopočtu – nejbližší nespočtený den) – mezivesnická výjimka jako všechna pošta
      (worker.md – Výjimky a omezení).
  - **Výprava po termínu** (`lastDay ≥ returnDay`, výsledek nepřišel – `hasVillageMail`): domovská
    ves načte hostitele. Výsledek v jeho odchozí schránce zapíše sama (hostitel ho pak zapíše
    znovu – zahodí se). Jinak, je-li hostitel pryč (`sleeps` – vymřel, opuštěn, ves chybí;
    `placeOf` null – sídlo v archivu): nepoužitý příjezd (ve schránce hostitele od `arriveDay − 1` –
    `inbox.pending` do `TOTAL_GAME_DAYS`; ne od jeho `lastDay`, spící ves se dopočtem přes den příjezdu
    posune dál; napřed se hledá návštěvník) se vrátí jako `marketResult(příjezd, { returned: true })`
    se vším, co výprava vezla; výprava, která už na trhu stojí (`market.visitors`), s tím, co drží
    (`unsold`, `bought`, koně). Výsledek jde do vlastní schránky s `ref` `marketResultRef` na den
    `lastDay + 1`. Archivované vsi nikdo nedopočítává – snímek, ze kterého se výsledek vezme, je konečný. Živý hostitel pozadu znamená čekat – lidé jsou doma v plánovaný den, zboží
    přijde se zprávou v nejbližší nespočtený den. Příjezd v odchozí schránce vsi se za nepoužitý
    bere jen u hostitele, jehož ves chybí (návrh Clauda, upřesnění zadání): u existujícího ho
    doručení právě zapsalo do jeho schránky a zpráva, kterou minule nešlo smazat, nedokazuje, že ji
    hostitel nepoužil – vrácení se vším by zdvojilo zboží (test „příjezd, který minule nešlo
    smazat“).
  - **Pomocníci zásilek** (`application/shipments.ts`, exportované beze změny chování pro poštu
    a výpravu na trh): `sleeps`, `placeOf` (`ShipmentPlace` – políčko, držitel, odříznutí),
    `stepToward`, `crossesIsolation`.
  - **Testy:** `application/__tests__/village-mail.test.ts` (kolo tam a zpět, hostitel pozadu,
    vymřelý a archivovaný hostitel, zmizelá ves, chyba a souběh, web po dopočtu; plán 3 – dotazy
    do spící, zmizelé a archivované vsi, rodina zpět domů po zániku hostitele, `stranded-people`
    po zániku kupce, použitý výsledek se nevrací, úloha světa `returnStrandedPeople` – domov
    vymřel nebo je v archivu s výsledkem ve schránce, zaniklý i hostitel, použitý výsledek, živá
    ves; nevěsta zpět po archivu vsi ženicha) a `advance-world.test.ts` – Pošta mezi vsemi
    ve workeru (ves dopočtená webem, zámek, kola workeru = ruční postup) a Pošta plánu 3 a svět
    (nevěsta přes kola obou hráčů, lidí je po každém kole stejně – `peopleOfWorld`,
    `bornMinusDied`); dva hráči na sousedních mapách v `__tests__/market-world.ts` (`marketWorld`
    s jinou domovskou či hostitelskou vsí, `kinWorld` – syn a dcera z přípravků sňatků,
    `neighbours` – okolí obou vsí, `askBride` – dotaz do schránky M). `receiveStranded` v jádru:
    `trade/__tests__/market-people.test.ts` (i sonda kontroly – cizí skupina se shodou emigranta
    a kolizním id); `fromHost`: `market-people-budget.test.ts`; `origin` výsledku:
    `market-two-villages.test.ts`; adaptér `strandedResults` / `dropStranded`:
    `inbox-repository.db.test.ts`.
- **Jen společné suroviny** (trade.md – Jen společné suroviny; Martin 19. 10. 2026: „Nech jen
  společné suroviny, nezaváděj nové.“): obchod zná jen zboží, které má i ves (`TradeGood`,
  `TRADE_GOODS`). Zboží zvenku (sůl, železo, med, kožešiny – dřívější soubor zboží) ve hře není.
  Starší vsi převede `withoutForeignGoods` (`trade.ts`; v `updateVillage` i na začátku
  `advanceVillage`, bez příznaku, idempotentně): zahodí `goods` a podíl medu v jídle a výpravu na
  cestě pro zboží zvenku zruší – nosiči přinesou zpět, co nesli (`get` = `give`); z kroniky výprav
  zboží zvenku zmizí. Hřivny místo nástrojů ve výpravách k sousedovi po stezce (bez `kind`)
  a v kronice převede `withIronBarsTrade` – výprava na trh a zásilka nesou skutečné nástroje
  (plán 3) a zůstanou.

- **Kůže, kožešiny, med a vosk** (hides-honey.md – Obchod): `TradeGood` += `honey` / `hides` /
  `furs` / `wax` (`TRADE_GOODS` za kamenem), hodnoty v `TRADE_GOOD_VALUES`. Zásoba ve vsi
  `villageGoodStock` (`trade.ts`): `floor` z `hides` + `smallHides × smallHideRatio()`
  (`HIDES.smallHideM2 / hideM2`), ze `sheepFurs + wildFurs`, z `honeyKg` a `waxKg`; `addGood`
  ubírá napřed velké kůže a kožešiny z lovu, přidané kůže jdou do `hides`, kožešiny do `wildFurs`
  (`ensureWares`). Názvy a ikony: `TRADE_GOOD_NAMES` (`trade-names.ts`); kronika je bere
  z `goodsText`.

- **Mince a zbroj** (markets.md – Rozhodnutí plánu 4, body 1 a 7): `TradeGood` += `ArmsGood`
  (`swords`, `mailShirts`, `helmets`; `ARMS_GOODS`, `isArmsGood`) a `coins` (`COIN_GOOD`), obojí
  v `TRADE_GOODS` a `PIECE_GOODS` za voskem před lidmi – celé kusy. Stav vsi: `VillageState.coins`
  a `arms` (chybí = nic). `villageGoodStock` je čte po celých kusech, `addGood` je nikdy nedá pod 0
  a nulu ze stavu smaže (i prázdné `arms`). Hodnoty v `TRADE_GOOD_VALUES`: mince
  `MARKET.grainKgPerCoin` a `carryKg` 0 (nosiče nepřidají), meč 1 800, kroužková košile 7 200,
  helma 3 600 kg obilí (nosnost 1,5, 12 a 1,5 kg). `withoutCoins` vrátí zboží bez mincí;
  `MarketPanel` je do „Dostaneš“ nenabízí. Mince a zbroj bere odchod celé vsi jako ostatní
  zásoby (`CARRIED_STOCKS` v `belongings.ts`). Zbroj je zatím jen zboží, účinek v boji bude až
  vlastní mechanikou (war.md – Výzbroj).

- **Nástroje a dřevěné nářadí** (markets.md – Rozhodnutí plánu 3, bod 4): `TradeGood` += `tools` /
  `woodTools` (`TRADE_GOODS` za keramikou – i pořadí zápočtu), hodnoty v `TRADE_GOOD_VALUES` 60
  a 2 kg obilí za kg, nesou se kg za kg (obnovená `CRAFT_BUYING.toolsValueKg` a
  `woodToolsValueKg`). Zásoba `villageGoodStock`: celé kg vybavení domácností
  (`toolEquipmentKg`) a zásoby tesaře (`crafts.woodToolsKg`); `addGood` koupené nástroje přidá
  rovnou do vybavení a prodané z něj ubere, dřevěné nářadí do `crafts.woodToolsKg` – obojí nikdy
  pod 0. Názvy a ikony `tools` a `wood-tools` jako v panelu dílny (`TRADE_GOOD_NAMES`).

- **Vozy na trhu** (markets.md – Rozhodnutí plánu 3, bod 4): `TradeGood` += `twoWheelCarts` /
  `fourWheelCarts` (`CartGood`, `CART_GOODS` za dřevěným nářadím – i pořadí zápočtu, kusové
  `PIECE_GOODS`; `cartGoodKind` – druh vozu), hodnoty v `TRADE_GOOD_VALUES` 320 a 640 kg obilí za
  kus (obnovená cena vozu u tesaře souseda `cartValueKg` @ b4f8dadc – práce tesaře, klády
  a kování), nese se 0 – vůz táhnou voli. Zásoba `villageGoodStock` = volné vozy druhu
  (`idleCartsOf` – mimo `cartsAway`: výpravy, nákupy i vůz na cestě pro kování, v pořadí id);
  `addGood` po celých vozech (bez záznamu stáří nový `addCart`); na trhu jdou vozy po kusech
  `MarketCart` se `builtDay` (`takeCarts` → `MarketArrival.carts` → `MarketVisitor.carts`,
  `boughtCarts` → `MarketResult.carts` → `addMarketCarts`): kupující dostane stáří prodejce, neprodaný
  vůz se vrátí stejně starý. Prodá se nejmladší volný vůz druhu (`removeIdleCart` – nejvyšší id;
  poslední vůz vsi smaže `carts`) a jeho id se znovu nepoužije (`VillageState.nextCartId`). Co
  ves nabízí a shání: Trh – co ves nabízí a shání výš; voli pro koupený vůz a prodaný vůz ve
  výpravě: Výprava na trh výš. Názvy Dvoukoláky / Čtyřkoláky s ikonou `cart`
  (`TRADE_GOOD_NAMES`).

- **Obilí za výrobky** (markets.md – Rozhodnutí plánu 3, bod 5; Martin 24. 11. 2026: „Ano,
  řemeslník bere obilí vždy“; `trade/craft-orders.ts`): zápočet řemeslníků – první ze dvou
  zápočtů `marketDay`, ve kterém řemeslníci hostitele prodávají výrobky jen za obilí a luštěniny.
  `craftStance(state, stance, visitors, prices)` – co v něm hostitel nabízí: výrobky dílen
  `ORDER_GOODS` (`goods.ts` – keramika, nástroje, dřevěné nářadí, vozy, hřivny) ze `stance.offer`,
  jejichž řemeslník ve vsi pracuje (`ownCraftsmanWorks(state, ORDER_CRAFT[g])` – `ORDER_CRAFT`
  je jediná mapa řemesel výrobků, `PRODUCT_CRAFT` je z ní); a co shání: hodnota V = Σ min(nabídka,
  Σ co výpravy shánějí) × cena trhu (`priceOf`), obilí za min(V, obilí výprav), pak luštěniny za
  zbytek V nejvýš do luštěnin výprav (kg přes cenu trhu). Null – řemeslníci nemají co prodat nebo
  výpravy čím zaplatit – a zápočet se přeskočí. `stance` se nemění. `craftParties(hostKey, craft,
visitors)` – strany: hostitel a výpravy podle příjezdu, každá nabízí jen obilí a luštěniny, které
  veze, a shání jen výrobky z nabídky řemeslníků. Zápočet je vyrovnaný, takže hostitel obilí koupí
  nejvýš za hodnotu výrobků, které ten den prodá, a nic jiného za ně neprodá (dobytek, koně,
  klády); dnešní zápočet potom beze změny se zbytkem zboží – obilí v něm hostitel shání jen podle
  výpočtu potřeby, výrobky, které mu zbyly, smí prodat i za to, co sám shání. Výprava, která chce
  krávu, ji tak za obilí nekoupí, i když jiná výprava kupuje nástroje.

- **Zakázky** (markets.md – Rozhodnutí plánu 3, bod 6; Martin 22. 11. 2026: „Řemeslníkovi je
  jedno, kdo mu platí za výrobky“; `trade/craft-orders.ts`, typy `CraftOrder`, `PlacedOrder`,
  `OrderReady`, `OrderGood` v `types-market.ts`). Zakázka se zapíše při odjezdu výpravy a platí se
  až při vyzvednutí – zápočet bez mincí nezná dluh ani platbu předem (odchylka od neighbours.md –
  Pravidla 6). Žádný převod stavu – chybějící seznamy jsou prázdné.
  - **Hostitel** (`VillageMarket.orders?`): `recordOrders(state, day, visitor, hostWants)`
    v `departVisitors` – seznam výpravy nahradí zakázky její vsi (novější zakázka téže vsi a zboží
    starou nahradí): výrobek `ORDER_GOODS`, který má výprava ještě na seznamu, s pracujícím
    řemeslníkem, když výprava pořád veze obilí nebo luštěniny nebo něco, co hostitel po dnešním
    zápočtu shání (`goodsLeft`), zapíše `CraftOrder` { `villageId` kupujícího, `name`, `good`,
    `amount`, `day` } a zapsané jdou do `MarketResult.ordered`; výrobek ze seznamu, který se
    nezapíše (koupený, bez řemeslníka, bez platby, vyzvednutý), starou zakázku smaže – zakázku tak
    obě vsi vedou stejně (návrh Clauda; Kupující níž). `reduceOrder(state, visitor, good, amount)`
    v `settleTrades` zakázku o prodané zmenší, na nule smaže; vyzvednutí hotové zakázky
    (`readyDay`) ji uzavře celou – i se zbytkem z opotřebení od ohlášení – a zboží jde do
    `MarketVisitor.pickedUp`, takže ho `recordOrders` té výpravě znovu nezapíše (ani při pobytu přes
    víc dní) a zakázka na gramy nevznikne. `liveOrders` – bez vypršelých (`day − order.day > MARKET.orderDays`, 365 – technická mez, ne
    pravidlo: stav hostitele nesmí růst donekonečna), `orderTargets` – součty živých zakázek po
    zboží (i ohlášených, dokud je kupující nevyzvedne), podle nich řemeslníci vyrábějí navíc
    (village-crafts.md – Výroba na zakázku).
  - **Ohlášení:** `fillOrders(state, day)` – krok dne po práci, před opotřebením
    (`wearCraftStocks` zásobu nad potřebou ubírá; village-core.md – Pořadí práce dne); ves bez
    zakázek nic. Vypršelé zakázky smaže; nabídka výrobků dílen `craftOffer` (vlastní potřeba bez
    zakázek, táž jako v `marketStance`, jen bez výhledu správce) se rozdělí postupně podle `day`,
    pak `villageId` – ohlášená zakázka si svůj díl drží. Pokrytá
    zakázka dostane `readyDay` a do `outbox` jde zpráva bez nákladu `order-ready` (`OrderReady` –
    hostitel, zboží, množství) na den `day + 1 + marketTravelDays(cells)` (posel; `cells`
    z okolí, kupující mimo okolí 1), `ref` `order:<hostitel>:<kupec>:<zboží>:<den zakázky>`. Bez
    okolí (`nearby.self`) se neohlašuje. Hotové kusy jsou na prodej komukoli.
  - **Kupující** (`VillageState.orders?`, `PlacedOrder` se `status`): `rememberOrders` v
    `applyMarketResult` – objednané (`ordered`) → `open` s množstvím hostitele, i když výprava část
    koupila (má přednost); koupené bez `ordered` zakázku u té vsi smaže (koupila, co chtěla, nebo
    vyzvedla hotovou zakázku – hostitel ji uzavřel taky); ze seznamu výpravy nekoupené
    a neobjednané → `refused`. Výsledek zaniklého hostitele (`returned`) nic neodmítne a zakázky
    u něj smaže (zanikly s ním – nežijí rok); vypršelé zmizí. `markOrderReady` – událost
    schránky `order-ready`: otevřená zakázka → `ready` a kronika `order-ready` { `villageName`,
    `villageId`, `good` } (web zatím „Zakázka ve vsi … je hotová.“); bez otevřené zakázky nic.
    `placedOrder(state, day, good)` – živá otevřená nebo hotová zakázka na zboží, jinak null;
    `readyOrders(state, day)` – živé hotové zakázky; `orderRefused(state, day, villageId, good)` –
    ves zakázku na zboží nevzala (živé `refused` – vesničané tam to zboží rok nehledají).

- **Vesničané na trhu** (markets.md – Pravidla 9, Rozhodnutí plánu 3, bod 7; Martin 22. 11. 2026
  – vesničané na trh pro nástroje, keramiku a osivo: „Ano“; Martin 24. 11. 2026 – řemeslník bere
  obilí vždy; `trade/villager-trips.ts`). Krok dne `villagerTripsDay(state, day, coverage)` hned za
  `seedReserveDay` (village-core.md – Pořadí práce dne) – **bez okolí (`nearby`) nic**, cíle jen
  z okolí (`nearestWith` – ves, o jejímž řemeslníkovi ves ví ze zprávy na pivo; `nearestNearby`;
  `nearbyTarget`). Rozhoduje jen ze stavu vsi a dne – po kouscích dopočtu stejně. V pořadí:
  - **Hotová zakázka** (`readyOrders` – `order-ready` přišla ráno): výprava pro ni týž den
    (vyrazí zítra, `departDay`), `wants` = zakázka, platba z přebytku; po odjezdu je zakázka zase
    `open` do výsledku (`rememberOrders`).
  - **15. 11.** (`CRAFT_BUYING.day`): `planVillagerPurchases(state, day, coverage)` – port
    `planPurchases` @ b4f8dadc (stav nemění; `VillagerPurchase` { `good`, `villageId`, `amount`,
    `pay`, `savedManDays`, `costManDays`, `worthIt` }): nástroje, keramika, dřevěné nářadí (bez
    vlastního pracujícího řemeslníka `ORDER_CRAFT[g]`, bez živé zakázky `placedOrder`, chybí do
    `craftTargets` aspoň `CRAFT_BUYING.minKg`) a vůz (`missingCart`, bez tesaře, s volnými
    vycvičenými voly `cartOxen`, žádná výprava ho už neveze), cíl nejbližší ves s řemeslníkem
    kromě té, která zakázku nevzala (`nearestWith(state, craft, skip)` se `skip` =
    `orderRefused` – rok ji vynechá a jede k další, Rozhodnutí plánu 3, bod 6).
    Cena v kg obilí = cena trhu cíle ze zprávy × `MARKET.grainKgPerCoin`, bez ní
    `TRADE_GOOD_VALUES`; platba obilím a luštěninami z `paymentPool` (`pay` – ceny cíle);
    náklad = práce platby + nosiči `marketCrew` × dny výpravy (2 × cesta + pobyt). Koupí se
    nejvýš, co výprava unese (`marketCarryKg` volných dospělých a dopravních vozů – dřívější
    `carryKg`, víc ves koupí příště), a jen co ušetří víc práce, než stojí; z jednoho přebytku
    napřed nejlepší poměr ušetřené práce k ceně.
  - **1. 9. a 1. 3.** (`SEED_RESERVE.days`): osivo `seedShortKg` od `SEED_RESERVE.minKg` u
    nejbližší vsi okolí za hřivny a krávy; seznam je obilí v hodnotě platby, osivem je z něj
    chybějící osivo (`MarketTrip.seedKg` – výsledek ho zapíše do rezervy osiva;
    village-fields.md – Osivo – nákup na trhu).
  - **Kdykoli:** vozy čekají na kování (`ironOrderBarsKg` nad hřivnami vsi), ves nemá pracujícího
    kováře, žádná výprava vesničanů hřivny neveze a nečeká se na zakázku → `wants.ironBars` =
    rozdíl u nejbližší vsi s kovářem (kromě té, která zakázku nevzala), platba z přebytku;
    hřivny doma vůz dokončí (`cartIronDay`).
  - **Lidé a vozy dne se dělí:** výprava dne (`Haul`) vznikne až s prvním nákupem a pamatuje si
    nosiče a dopravní vozy (`shareCrews` – v pořadí výprav každá vezme `marketCrew` ze zbytku
    vozů). Kolik další nákup unese, počítá `spaceFor` z volných dospělých a dopravních vozů bez
    nosičů a vozů ostatních výprav dne (`marketCarryKg` − co výprava už nese).
  - **Odjezd:** co jde do jedné vsi, jede jednou výpravou (`departMarketInPlace`, pobyt
    `MARKET.minStayDays`, `by: 'villagers'`, osivo `seedKg`), výpravy v pořadí přijetí nákupů
    (zakázky, výrobky od nejlepšího, osivo, hřivny) – každá další počítá s lidmi a vozy, které
    zbyly. Odmítne-li výpravu `planMarketTrip` (lidé, voli, konec světa), ten den nejede.
  - **Nezbudou-li lidé, vozy ani místo:** nákup s pevným dnem (výrobek a vůz 15. 11., osivo), na
    který nezbylo na nejmenší nákup, protože lidi a vozy mají jiné výpravy dne, výpravy na cestě
    nebo místo zabral dřívější nákup téže výpravy (`Space.held` – i `taken`), nebo jehož výprava
    neprošla kontrolou, a výrobek, který výprava koupí jen zčásti, protože víc neunese (`limited`),
    vesničané zkusí znovu (`VillageTrade.villagersRetry` { `day`, `goods`: `VillagerRetry`[] } –
    `tools`, `pottery`, `woodTools`, `cart`, `seed`; `takeRetry` ho ráno smaže, nesplněná paměť se
    sloučí) – nepropadne na rok, víc ves koupí příští cestou. Den pokusu (`retryDay`): den před
    návratem první výpravy na trh, jejíž lidé jsou zítra pryč (výprava vyrazí v den jejich návratu),
    jinak zítra – opakování neodvede zbylé jednoho dva dospělé. Výrobek a osivo, které veze výprava
    vesničanů na cestě, čekají na její výsledek (`'blocked'`, `seedOnTheWay`) – znovu se nekupují.
    Zbytek osiva jede další cestou, jen když místo vzaly dnešní nákupy (`taken`) – výprava, kterou
    omezila jen nosnost vsi, se neopakuje (hostitel ji mohl odmítnout). Zakázka (zůstane `ready`)
    a hřivny se zkoušejí každý den samy. Rozhodují jen zakázky u vsí okolí (`nearbyOrder`) – zakázka
    u vsi mimo okolí (zaniklý hostitel, výprava hráče či správce do vzdálené vsi) nákup neblokuje
    (plán 3, závěrečná kontrola I1 a Minor 1).
  - **Vozy a voli** výpravy vesničanů, odeslané v kroku dne před prací, ten den ještě pracují doma
    a pryč jsou ode dne odjezdu (`startedDay`) – jako u výpravy hráče: `cartsAway` / `oxenAway`
    s dnem práce (`workDay`) počítají jen výpravy, které už vyrazily (`departedBy`), práce dne
    bere `cartFleetToday` a `ploughPairsHome` (`oxenAtWork`); bez dne (plán další výpravy,
    `tradeHomeCarts`, `oxenHome`) jsou pryč všechny.

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

- **Nákup osiva** (trade.md – Nákup osiva, fields.md – Osivo pro ves bez zásob): u smyšlených
  sousedů zrušen 23. 11. 2026 (markets.md – Pravidla 1) – 1. 9. a 1. 3. ves zapíše do kroniky,
  kolik chybí (`seedReserveDay` v `seed-reserve.ts`), a s okolím pro ně vesničané jedou na trh
  (Vesničané na trhu výš); podrobnosti village-fields.md – Osivo pro ves bez zásob.
- **Lidé – koho ves dá a kdo přijde** (trade.md – Výměna lidí; Martin 19. 10. 2026;
  `people-trade.ts`): výměna lidí se smyšlenými sousedy skončila s obchodní výpravou (markets.md –
  Pravidla 1); lidé jdou na trh (Lidé na trhu níž). Koho ves smí dát (trh, zásilky vazalů –
  vassalage.md), vybere `emigrantGroups` (`Emigrants` – rodiny
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
- **Lidé na trhu** (markets.md – Rozhodnutí plánu 3, bod 10; `trade/market-people.ts`): lidé jsou
  kusové zboží s cenou jako ostatní – `TradeGood` += `families`, `men`, `women` (`PeopleGood`,
  `PEOPLE_GOODS` na konci `TRADE_GOODS`, kusové `PIECE_GOODS`, `isPeopleGood`, skupina kroniky
  `PEOPLE_GROUP`), hodnoty `TRADE_GOOD_VALUES` rodina 720, muž a žena 360 kg obilí za kus, nese se
  0 – jdou po svých (`marketCrew` je nepočítá, posádka aspoň 1). Cestují ale jako skuteční lidé
  (`MarketPerson` { `good`, `people` – celé záznamy osob s id vsi }) a **nikdo nevznikne ani
  nezmizí**: člověk je vždy ve vsi, v nákladu výpravy (`MarketArrival.people` – odchozí schránka,
  schránka cíle; `MarketVisitor.people` a `boughtPeople` na trhu) nebo ve výsledku na cestě domů
  (`MarketResult.people` – neprodaní vlastní, `newcomers` – koupení). Zásoba `villageGoodStock`
  = počet skupin druhu z `emigrantGroups` jen s tím druhem (druhy berou z týchž lidí, nesčítají se);
  `addGood` lidi nebere a vyhodí chybu – smyčky přes `TRADE_GOODS` (`departMarketInPlace`,
  `settleTrades`, `applyMarketResult`) je přeskočí jako koně. Odchod `takePeople(state, day, good,
n, direction)` – n skupin podle `emigrantGroups`, `sendPeople` → `removePeople` se směrem
  (`emigrants`, dokud ve vsi žije rodič, sourozenec nebo dítě; bez směru se nezapíšou). Příchod do
  jiné vsi `settlePeople(state, day, groups, from)` – `rehomePeople` (nová místní id, vazby uvnitř
  skupiny přepsané, ven přerušené), dům `newcomerHome`, `origin` = směr, kronika `newcomer`
  s `villageName` a `villageId`. Návrat domů `restorePeople(state, groups)` – původní id a vazby,
  dům `newcomerHome`, z `emigrants` i `ancestors` pryč, `nextId` beze změny, kdo už ve vsi je, se
  nezdvojí. Hostitel shání `peopleWanted(state, day, outlook)`: půdy víc než práce (`landHa >
laborHa`) → chybí ceil(dospělí × (landHa ÷ laborHa − 1)) dospělých, rodiny po
  `MARKET.familyAdults` (2) nahoru; nabízí `peopleSpare` (export z `vassalage/spare.ts`).
  `peopleOf(goods)` – lidé ze zboží (celé kladné počty). Vesničané lidi nevozí – jen hráč a správce
  (roční výprava správce bere lidi z nabídky vsi). Výsledek s lidmi pro zaniklou domovskou ves
  `deliverVillageMail` ani úloha světa nezahodí – lidé jdou zpět k hostiteli (`stranded-people`,
  Pošta mezi vsemi výš). Skupiny, které prodal sám hostitel, nesou `fromHost` (`settleTrades`,
  větev `seller === HOST`) – jen u nich je jisté, že jde o jeho lidi s jeho id.
  `receiveStranded(state, day, back)` (větev schránky `stranded-people`): skupiny `own` se vrátí
  celé s původními id (`restorePeople` – i děti, které v `emigrants` nejsou, protože ve vsi nemají příbuzné) a kronikou
  `newcomer` s `returned` („Ze západu se vrátila prodaná rodina“); obsazené id (nemá nastat –
  `nextId` jen roste) skupinu usadí jako ostatní. `people` (vlastní lidé výpravy, koupení od jiné
  výpravy – id jiné vsi) se usadí s novými id (`settlePeople` s `from` = `MarketResult.origin`,
  kronika `newcomer`). Dřívější párování podle `emigrants` (týž id a `bornDay`) je pryč: osadníci
  si nesou id mateřské vsi a nová ves čísluje hned za nimi, takže cizí skupina mohla převzít id
  emigranta nebo předka hostitele a v řetězu člověk zmizel (kontrola úlohy 10, Important 1). Bez
  `from` bez směru a kroniky. Výsledek s lidmi nese `origin` (domovská ves, jméno a směr od
  hostitele k ní – `departVisitors`), bez lidí ho nemá.

Počasí kraje mění hodnotu zboží od 1. 11. – [village-disasters.md](village-disasters.md#kraj-kolem-vsi-hodnota-zboží-a-zvěř-p4).

- **Přehled vsí a odeslání výpravy** (markets.md – Pravidla 2, 3 a 8; Rozhodnutí plánu 2, bod 7;
  `application/market.ts`, `MarketDeps`). `marketOverview(deps, { playerId, villageId })` vrací
  `MarketVillage[]` (`null` – ves není hráče): vlastní vsi, vsi na 8 sousedních mapách
  (`holderAt` → `listActive` → ves sídla), vsi z map ze znalosti rodu (`knownCellsOf`, jen ves,
  jejíž stavbu rod viděl; `seen` = domy a řemesla z `knowledge.of`) a vsi ze zpráv na pivo (`news`
  domovské vsi). Bez domovské vsi a archivovaných sídel; odříznutý rod vidí jen své vsi
  (`crossesIsolation`). **Správce cizí vsi** (`actorId` ≠ `playerId`) nevidí ostatní vsi držitele ani jeho znalost mapy a nesmí je zvolit (`MARKET_UNKNOWN`): zůstávají vsi na sousedních mapách (bez vsí držitele) a vsi ze zpráv spravované vsi. Zaniklá ves (`sleeps`) je v přehledu s `blocked: MARKET_GONE`, ves na cestě
  s `VILLAGE_TRAVELLING`; válka obchod nezakazuje. Řazeno podle `cells`, pak jména.
  `sendMarketExpedition` vezme cíl jen z přehledu a bez `blocked` (jinak `MARKET_UNKNOWN` nebo
  důvod blokace), ves pozadu napřed dopočte do `today` (`updateLivingVillage`), zavolá `departMarket`
  a doručí odchozí schránku (`deliverVillageMailSafely`). Právo `trade` a zámek hráče přidá akce
  ve webu (Úloha 7).
- **Okolí vsi** (markets.md – Rozhodnutí plánu 3, bod 1; jádro `trade/nearby.ts`, server
  `application/nearby.ts`). Simulace nezná ostatní vsi ani své id, a vesničané se přitom musí
  rozhodovat uvnitř dne – proto ves dostává snímek okolí do stavu: `VillageState.nearby`
  (`VillageNearby` – `day`, `self` { `villageId`, `name` }, `villages`: `NearbyVillage` {
  `villageId`, `name`, `cells`, `firstStep` }), řazený podle `cells`, pak `villageId`. Chybí = ves
  okolí nezná; převod ani kodek se nemění. `NearbyVillage.singles` (`NearbySingle` – pohlaví a věk po
  5 letech) – svobodní, kteří by šli za partnerem odjinud (Rozhodnutí plánu 3, bod 11; village-people.md
  – Sňatky – se sousedy); chybí = nikdo.
  - **Obsah** (`nearbyVillages(deps, home)` – `NearbyDeps`: otisky vsí a sídla; záznam domovské
    vsi přichází parametrem): sídla na 8 sousedních políčkách (`holderAt`, `listActive` – i vsi
    téhož hráče, ne vsi téže mapy ani dál; archivované sídlo ani sídlo s čekajícím převodem mezi
    nimi není), jejich otisky (`stampsOf` – jméno, spící ves vynechá) a souhrny (`digestsOf` –
    svobodní `VillageDigest.singles` = `kinSingles` ve dni souseda; souhrn bez nich nebo ves bez
    souhrnu současné verze = nikdo) – **žádný stav se nenačte**. `cells` (`cellDistance`) a `firstStep` (`stepToward`) jako přehled trhu a výprava,
    `self` = id a jméno záznamu vsi. Sídla na prstenci mají políčko mapy světa, odříznutý nováček
    mezi nimi není (proto bez `crossesIsolation`); odříznutá nebo archivovaná ves sama (newcomers.md
    – místní mřížka není mapa světa) má okolí prázdné. Válka nevadí. Snímek je stav ostatních vsí
    **v okamžiku zápisu** – mezivesnická výjimka jako pošta (worker.md – Výjimky a omezení); den je
    pevný.
  - **Kdy – pevné dny** (`nearbyDays(afterDay, toDay)`): dny kalendáře dělitelné
    `NEARBY_REFRESH_DAYS` (30 dní; technická mez, ne pravidlo – snímek se celý nahradí, stav vsi
    neroste a sousedé se nečtou každý den, mez určí jen, jak rychle se ves dozví o nové vsi za
    kopcem). Den nezávisí na vsi, dávkách workeru ani chvíli pohledu – ves dopočtená vcelku i po
    kouscích dostane snímek týchž dnů.
  - **Zápis** – podport úložiště vsí `villages.nearby` (`NearbyRefresh`, jako bariéra `holds`;
    `nearbyRefresh(deps)` – úložiště v DB ho má vždy, `createVillageRepository`; testy ho zapnou
    `InMemoryVillages.withNearby`, bez něj se okolí nezapisuje – kalibrace a zlaté otisky beze
    změny). `updateVillage` po načtení událostí schránky dopočítávaných dnů zavolá jeho `post` se
    záznamem vsi, dny dopočtu a čekajícími událostmi: na každý den obnovy v `(lastDay, day]`, na
    který událost `nearby` ve schránce ještě není, zapíše snímek s `ref` `nearby:<ves>:<K>` (jeden
    sken na všechny dny obnovy dopočtu), a když se něco zapsalo, pokus zopakuje (zápis zvedl verzi
    vsi – nové načtení, pak dopočet se snímkem). Čekající událost (odmítnutá akce) je čerstvé okolí
    – sken se neopakuje. Prázdné okolí se zapíše také (ves bez sousedů i odříznutá ves se dál neptají).
    Spící ves nic. Chyba skenu nebo zápisu dopočet zastaví jako chyba načtení – bez snímku se přes
    den obnovy nepočítá. Cena jednou za 30 dní na ves: dotazy na sídla prstence, jeden na otisky
    a jedno načtení vsi navíc (nový pokus); dopočet bez dne obnovy nic navíc.
  - **Úklid schránky** (Úloha 10 plánu 3): když `post` snímek zapsal, smaže použité snímky vsi se
    dnem ≤ `afterDay − NEARBY_KEEP_DAYS` a se snímky i použité zprávy bez nákladu (`inbox.pruneUsed`
    – jen druhy `PRUNED_INBOX_KINDS`: `nearby`, `kin-ask`, `smith-ask`, `order-ready`; jejich `ref`
    je ze dne a po dni použití se znovu nezapisuje; verzi vsi nemění – plán 3, závěrečná kontrola
    I2). `NEARBY_KEEP_DAYS` = 365 – technická mez, ne pravidlo: použitý snímek už nic nečte, ale
    řádek drží `ref` proti dalšímu zápisu téhož dne (dopočet se starším stavem vsi při souběhu webu
    a workeru by ho po smazání zapsal znovu na nejbližší nespočtený den); rok je daleko za každou
    dávkou. Schránka tak drží nejvýš ~12 snímků na ves místo ~12 za každý herní rok. Ostatní
    události schránky se nemažou – jejich `ref` brání dvojímu zápisu (výsledek trhu dvakrát = zboží
    dvakrát).
  - **Jádro** (`trade/nearby.ts`): `applyNearby` (větev schránky – village-core.md, Schránka vsi),
    `nearbyTarget(state, villageId)` – `MarketTarget` do vsi okolí s domovskou vsí ze `self` (mimo
    okolí null), `nearestNearby(state)` – první ves okolí, `nearestWith(state, craft, skip?)` –
    první ves okolí, o jejímž řemeslníkovi ves ví ze zprávy na pivo (`news`, `report.crafts`;
    Rozhodnutí plánu 3, bod 2), kromě vsí, které `skip` vynechá (vesničané – ves, která zakázku
    nevzala).
  - **Správce cizí vsi:** okolí nese i ostatní vsi držitele na sousedních mapách (vesničané k nim
    jezdí) – stav vsi se klientovi neposílá a web je cizímu správci nesmí ukázat jménem
    (Rozhodnutí plánu 3, bod 14 – Úloha 11).
  - **Testy:** `trade/__tests__/nearby.test.ts` (zápis a náhrada snímku, nejbližší ves, cíl),
    `application/__tests__/nearby.test.ts` (`nearbyDays`, obsah bez načtení stavů, svobodní souseda
    ze souhrnu, odříznutí,
    vymřelý a archivovaný soused, čekající událost bez nového skenu, cena dopočtu přes den obnovy,
    víc dnů obnovy, spící ves, úložiště bez podportu) a `advance-world.test.ts` – Okolí vsi v pevné
    dny (ves sama na mapě po 1, 3 a 10 dnech i se zbytkem ve webu = jeden `loadVillage`; dvě vsi na
    sousedních mapách totéž; dávka končí den před dnem obnovy, na něm a den po něm; ves dopočtená
    webem – worker nic nečte navíc; kola workeru přes dva dny obnovy – snímek jen v nich) a úklid
    (`nearby.test.ts` – nový snímek smaže použité starší než mez, bez nového nic; adaptér DB
    `inbox-repository.db.test.ts`).
