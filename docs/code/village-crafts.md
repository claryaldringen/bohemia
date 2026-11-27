# Ves – řemesla, tesař a vozy

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: crafts.md, wagons.md v `docs/design/`.

- **Řemesla** (`crafts.ts`, crafts.md): dílna = obydlí s `Dwelling.workshop` (řemeslo
  `Craft` = `potter` / `smith` / `burner` patří budově; hrnčíř a kovář polozemnice, uhlíř
  zemnice – `CRAFT_BASE`), stavba je `kind: 'dwelling'` s `craft` (cena `workshopCost` /
  `workshopTrees` – obydlí + 30 %), akce `startWorkshop`, use-case `placeWorkshop`, umístění
  `checkWorkshopPlacement` (volně jako zemnice; půdorys `workshopFootprints` i s přístřeškem
  a u uhlíře s milířem kus od zemnice – `MILIR`; `PlacementVillage.dwellings`
  nese `workshop.craft`, ať se do milíře nestaví). Domácnosti obývaných dílen (`craftHouseholds`)
  pracují v dílně (`workshopLabor` – po denním minimu, domácí výroba bokem; řemeslo dělají jen muži domácnosti – `craftHands` v `smith-supply.ts`, Martin 22. 10. 2026 – a zbytek práce žen `WorkshopLabor.light` dá `craftLightLabor` jako `light` do `allocateDay` – samostatný zásobník mimo `capacity`, kryje jen `LIGHT_LABOR_TASKS` (setí, okopávání, žně, výmlat), orbu, kácení ani stavby nikdy; měchař `smithBellows`, praxe `gainPractice` a `workshopSkill` taky jen muži; ve scéně `shareWorker` bere k dílně `onlySex: 'male'` (a `hasMen` nepočítá kojence jako `craftHands`) a `DayRoster.take` pouští ženy zaneprázdněných domácností jen s `light: true` (`LIGHT_ACTIVITIES` ve `villager-plan.ts`); `workCrafts` v kroku
  práce – mimo `allocateDay`, do sil plánu osevu se nepočítají – kromě žňových dnů: řemeslník se
  syny pak jde na žeň a výmlat, `WorkshopLabor.harvest` místo `craft`, `craftHarvestLabor` →
  `allocateDay` – `harvestHands`; fields.md – Žně všemi rukama, village-fields.md), jen dokud je co dělat: **podle potřeby** (Martin 18. 10. 2026 –
  volný čas na poli) kovář a hrnčíř vyrábějí do zásoby `craftTargets` (potřeba + opotřebení za
  rok) a zakázek (Výroba na zakázku níž), uhlíř má vždy milíř a z vypáleného nosí uhlí podle kování (Uhlíř níž); s plnou zásobou
  nebo bez vstupu je dílna v `restingCrafters`
  (na začátku kroku práce, hodnota `resting` / `no-charcoal` / `no-wood`) a její domácnost
  pracuje v `allocateDay` se vsí (`craftHouseholds(state, resting)`); uhlíř a hrnčíř kácejí strom po stromu (`Workshop.felling` je
  vyhrazený – `reservedTrees` / `claimedObstacles` ho znají), zásoby `VillageState.crafts`
  (kg uhlí u kováře, nástrojů, keramiky; opotřebení `wearCraftStocks` jen v užívání, uhlí
  neubývá; celá zásoba uhlí i s vypálenými milíři `charcoalStockKg`). **Pokrytí**
  `craftCoverage` se spočítá na začátku dne a jde všude, kde platí meze (plán osevu, přidané díly,
  založení pole – i `PlacementVillage.toolCoverage` pro náhled –, denní minimum, ztráty zásob,
  jablka v nádobách `applesSpoiled` / `appleKeepDays`). Rozdělení práce dne má `craft` (u dílny)
  a `fell` u stromu dílny. Web: `VillageView.crafts` (zásoby, pokrytí, dílny s `activity`),
  `households[].craft`, `SceneVillage.dwellings[].craft` / `working`, server action
  `placeWorkshop`, mřížka staveb hrnčíř [F], kovář [G], uhlíř [H] (`placement: 'workshop'`),
  lišta uhlí / nástroje / keramika (jen ves s dílnou), panel výběru dílny, upozornění
  `no-charcoal` / `no-wood`. **Uhlíř** (`charcoal.ts`, crafts.md – Uhlíř, Martin 18. 10. 2026):
  kácí jen buky (`isBeech`, `availableTrees(…, 'beeches')`) po dávkách do milíře (`CharcoalKiln`:
  buky vyhrazené v `reservedTrees`, fáze `wood` → `build` → `burn` 8 dní → `draw`, čísla
  `CHARCOAL_KILN`). Na pařezy sází mladé buky (`Workshop.toPlant`, `plantOnStump` →
  `ObstacleChange.planted`; `felledTreeStage` – sazenice dospěje za `BEECH_PLANTING.matureYears`,
  bez sazenice nálet jako dřív; `saplingGrowth`). **Milíř u skácených buků** (crafts.md; Martin 20. 10. 2026: „Vyčleň milíř jako samostatnou stavbu. … uhlíř udělá milíř na místě, kde na něj
  skácel buky … Uhlíř bude k milíři chodit ze svého domku“): `startKiln` – dávka = buky nejblíž
  prvnímu buku u zemnice, milíř uprostřed nich na volném rovném místě (`findKilnSite` v
  `kiln-site.ts` po kružnicích, kontrola `checkKilnSite` v `placement.ts` – ne pole, sad, hřbitov,
  ohrada, domy do `KILN_SITE.homeM`, cesta, jiný milíř, posvátný dub, háj, výchoz, voda, svah;
  kruh `kilnCircle`; přednost místo, kde milíř z výchozí kamery od jihu nezakryjí stromy –
  `kilnViewBlockers`, `KILN_SITE.view`), id z `nextId`; milířiště je paseka (`CharcoalKiln.clearing`
  – překážky v kruhu a stromy, jejichž koruna sahá nad milíř nebo do `KILN_SITE.clearAroundM` kolem
  – `kilnCrownTrees` → `recordClearedObstacles`, klády); dřevo se nosí pár metrů, za chůzi ze zemnice `kilnWalkFactor` (`kiln.walkM` po pevných
  cestách s půdou `villageRoadWalk`) na veškerou práci u milíře. Dílna uhlíře je jen zemnice (cena
  zemnice – `workshopExtra`, `workshopFootprints` bez milíře); přes milíř se nestaví
  (`PlacementVillage.kilns`). `Workshop.kilns` – nejvýš `CHARCOAL_BALANCE.maxKilns` (2); starší
  `Workshop.kiln` převede jednou `migrateKilns` (milíř u zemnice dostane polohu `homeKilnCenter`,
  dodělá se na místě); čtení přes `workshopKilns`. Rozebraný milíř (`dismantleKiln`) nechá
  milířiště `VillageState.kilnRemnants` (zaroste za 10 let – `kilnRemnantOvergrowth`,
  `updateKilnRemnants`). **Rovnováha uhlíř – kovář** (crafts.md; Martin 20. 10. 2026: „Uhlíř
  i kovář přece musí za ty roky vědět, jaká je nabídka a poptávka“): plán dne `burnerPlans`
  (crafts.ts – jednou v simulate.ts pro práci vsi, vůz i dílnu, `SmithSupply.burners`) – poptávka
  kovářů klouzavě za rok `VillageState.charcoalUse` (`recordCharcoalUse` jen ve vsi s uhlířem,
  i nesplněná poptávka; `charcoalUsePerDay`, prvních 30 dní odhad `smithsCharcoalPerYear`), doba
  cyklu `Workshop.kilnCycles` (`kilnCycleDays`); další milíř `startsNextKiln`, když uhlí ve vsi
  stačí jen na cyklus + `reserveDays`; kovář pro uhlí `charcoalFetchKg`, když vystačí jen na cestu
  - rezervu – dávka na `fetchDays` (60) dní, uhlíř ji tahá den po dni (`Workshop.charcoalOrderKg`)
    od nejstaršího milíře (`BurnerPlan.draws` po milířích, `burnerDraws` → `charcoalDeliveries` s
    `kilnId`, `findKiln`). Bez kováře se uhlí nevytahá a další milíř nezačne; s vypáleným milířem
    uhlíř odpočívá (`restingBurners`). Obchod prodává uhlí u kováře i z milířů (`takeCharcoal`).
    Starší dílna uhlíře se převede `migrateBurners` na začátku kroku práce (palivo, kácení,
    `migrateKiln`). Rozdělení práce: `fell` u buků (i vyklízení), `craft` u milíře – cíl
    `{ kind: 'kiln', id: uhlíř, kiln: id milíře, x, z }` (`WorkshopDay.kilns`), `plant` u pařezů; síť
    pěšin vede ze zemnice k milíři a kupu obchází (`PathVillage.kilns`). Web:
    `VillageWorkshop.kilns` (`KilnSummary`) / `toPlant`, lišta a panel uhlí = `charcoalStockKg`,
    `SceneVillage.kilns` (`SceneKiln` – id milíře, `burnerId`, fáze, průběh, podíl uhlí `charcoal` po
    2 %) a `kilnRemnants` (zarůstání po 5 %), `plantedSaplings`. Scéna: vzhled podle fáze čistá
    funkce `kilnLook` (`workshop-layout.ts` – staveniště `constructionState('milir')`, hráň polen,
    hotový milíř se `scale` / `scaleY`, dým jen při pálení – `kilnVents`, koše u rozebíraného);
    milíř kreslí `VillageRenderer.kilnPlaces` přes kotvu `forestKilnAnchor`, milířiště
    `updateKilnRemnants` (černá zem z bahna), paseka pod korunami `villageClearedForest`; postavy
    u milíře `kilnWorkers`, uhlíř chodí ze zemnice k milíři (provoz na cestách – druh `kiln`),
    sázení `planting`, polena k milíři (`felling`). Výběr milíře a milířiště `{ kind: 'kiln', id }`
    (`pickVillageTarget`, kruh v `selection-highlight.ts`), panel `KilnBody` z `lib/kiln-view.ts`
    (`VillageView.kilns`), panel dílny má milíře jako tlačítka; ukázky /dev/panels?panel=milir,
    /dev/buildings **Cyklus milíře** (`showcaseKiln`, `kilnCycleAt` – i milířiště).

- **Dílny zlata** (plán 6, issue #13; gold.md – Pravidla 2, 4, 5, Rozhodnutí plánu 6, bod 10): `Craft` má navíc `panner` (rýžovník, zemnice jako uhlíř, ale s přirážkou 30 %), `jeweller` (šperkař) a `minter` (mincíř) na polozemnici; `CRAFTS` = `burner`, `panner`, `potter`, `smith`, `jeweller`, `minter`, `carpenter` (dnešní pořadí se nemění). `GOLD_CRAFTS` (`crafts/gold-crafts.ts`) je jejich výčet. Činnosti `no-placer` (rýžovník bez náplavu) a `no-gold` (šperkař a mincíř bez zlata) přibyly do `WorkshopActivity`. Šperkař a mincíř mají vlastní větev ve `workCrafts` (jinak by `else` → `workPotter` vyráběl keramiku) a práci z úlohy 5 (Šperkař a mincovna níž); rýžovník také (Rýžování níž). Web: `CRAFT_LOOKS[craft].product` je u dílen zlata nepovinný (výrobek v `CraftStocks` nemají – `workshopDetails` dá zásobu 0 a pokrytí null), `workshopOutputKg` jim dá 0 kg, `workshopSmokes` – rýžovník nekouří, šperkař a mincovna při `producing` ano; model dílny ve scéně je dočasně `uhlir` / `kovar` / `kovar` (`CRAFT_MODEL`), vlastní modely přijdou později. **Správce je nestaví:** `STEWARD_CRAFTS` (`rules-steward.ts`) jsou dnešní čtyři řemesla; `slotChecks('workshop')` a `slotFits` v `steward-plan.ts` berou jen je a `workshopValue` dá dílnám zlata 0, takže plán a zlatý otisk vsi se správcem zůstávají beze změny.
  **Zámky dílen** (úloha 3b; gold.md – Pravidla 1, 3, 5): `workshopBlocked(state, day, landscape, craft)` v `crafts/gold-crafts.ts` vrací důvod `PANNER_NO_PLACER` (krajina bez zlatonosného náplavu – `goldPlacers` v `core/premium-effects.ts` je `[]` pro krajinu bez typu `gold-stream`), `PANNER_PLACERS_EMPTY` (všechny náplavy vyrýžované – `placerLeftG` = `PANNING.placerG` − `goldPanned[index]`) nebo `MINT_YEAR` (mincovna před 1. 1. `MINT.fromYear`), jinak null (šperkař a ostatní řemesla nikdy). `applyBuildIntent` dílnu se zámkem odmítne `{ ok: false, reason }` a `startWorkshop` odmítne mincovnu před rokem 950 i bez krajiny (`RangeError(MINT_YEAR)`).
  **Šperkař a mincovna** (úloha 5; gold.md – Pravidla 4 a 5; Martin 22. 11. 2026: „šperkař bude prostě fungovat jen jako jakýsi zlevňovač při nákupu a zdražovač při prodeji zlata“): šperk není zboží, jen kapacita `VillageState.jewelleryG` (g, i zlomky). `trade/jewellery.ts`: `jewelleryMaterialG` (kov vsi = zlato i se zlomkem + mince × `GOLD.coinGrams` – mince 2,4 g, gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 6; na setiny), `jewelleryOf` (min(`jewelleryG`, kov) – použitelná výhoda), `useJewellery` (ubere, nulu pole smaže), `addJewellery` (přidá nejvýš do kovu vsi). `workJeweller` (`crafts/gold-crafts.ts`): `jewelleryG += min(labor.craft × skill × JEWELLER.gPerManDay, kov − jewelleryG)`, zlato ani mince se nemění; `restingCrafters`: kov 0 → `no-gold`, `jewelleryG` ≥ kov → `resting`. `workMinter` (bod 5): celé mince `n = floor(min(gold + ε, labor.craft × skill × MINT.gPerManDay) ÷ coinGrams)` – 200 g = 83 mincí, zbytek zlata počká → `addGood(gold, −n × coinGrams)` (na setiny) a `addGood(coins, n)` (součet zlato + mince × `coinGrams` se nemění, zlato pod nulou pole smaže, kov šperkaře se ražbou nemění); méně zlata než na minci (2,4 g) → `no-gold` (i `restingCrafters`). Rýžovník přičte vyrýžované na setiny gramu (`roundGold`) do `gold` i `goldPanned`. Oba dílny pracují jako dílna (`producing`, `WorkshopDay.making`), požár beze změny. `WaresView.jewelleryG` = `jewelleryOf` v celých gramech, jen kladné.
  **Rýžování** (úloha 4; gold.md – Pravidla 1 a 2; `crafts/gold-crafts.ts`): rýžuje se v měsících `PANNING.months` (`inPanningSeason` – 1. 4. až 31. 10.), mimo ně dá `restingCrafters` rýžovníkovi `resting`. Náplav je `Workshop.placer` (`index` v `goldPlacers`, `walkM` – chůze z dílny na cm): v sezóně ho na den vybere `pannerPlacer` (volá ho `restingCrafters` s krajinou z `dayPeople` – mutuje jen `Workshop.placer`, jako `migrateBurners` před ním), chybí-li, nebo náplav dobral jiný rýžovník; `choosePlacer` bere nejbližší náplav se zlatem (`placerLeftG` > 0) po pevných cestách s půdou (`pannerWalk` – `villageRoadWalk`, graf až při výběru; bez krajiny vzdušně), **jen s konečnou chůzí** (`Number.isFinite` – přes potok bez brodu je `Infinity` a JSON by ji uložil jako `null`, `distanceFactor(null)` = 1 a dopočet po kouscích by se rozešel s dopočtem vcelku), při shodě nižší index. Bez dosažitelného náplavu se zlatem `placer: null` a `no-placer` (domácnost pracuje se vsí); `null` platí do 1. 4., pak se hledá znovu. `workPanner` (větev rýžovníka ve `workCrafts`, nikdy hrnčíř): výkon `labor.craft` × `labor.skill` × `PANNING.gPerManDay` ÷ `distanceFactor(walkM)`, nejvýš zbytek náplavu (zbytek pod `EPSILON` se dobere týž den); zlato přibude do `VillageState.gold` a `goldPanned[index]` (pole doplněné nulami), činnost `producing`. Vyčerpaný náplav: `Workshop.placer` se smaže (další den další náplav), `WorkshopDay.placerExhausted` = kolik náplavů ještě má zlato a `craftsDay` (`core/simulate-work-apply.ts`) zapíše kroniku `placer-exhausted` (`left`). `WorkshopDay.pan` = náplav, kde dnes rýžoval (scéna), `producedKg` 0. Web: věta kroniky v `chronicleText` (poslední náplav vlastní větou), upozornění `placer-exhausted` (zpráva) a `placers-exhausted` (poslední – varování) s ikonou `resources/gold.png`; `left` nese pohled kroniky (`chronicle` ve `village-view.ts`).

- **Zemnice u milíře** ([workshops.md](../design/workshops.md) – Uhlíř – zemnice u milíře; Martin 14. 11. 2026: „…[postaví] si jednoduchou zemnici přímo v lese u milíře … Tuto zemnici bude
  opakovaně využívat, dokud v jejím okolí bude dost stromů“; podrobnosti návrh Clauda – Rozhodnutí
  8): `crafts/burner-camp.ts`, čísla `BURNER_CAMP`. Stav `Workshop.camp` (`BurnerCamp` – id
  z `nextId`, střed, natočení, `done` v čd, `builtDay`), opuštěné `VillageState.campRemnants`
  (`CampRemnant` – nedostavěná nese `done`, scéna ji kreslí jako staveniště, které zarůstá);
  obojí volitelné; zemnici má **jen uhlíř v nadzemní dílně** (`isHouseType(dwelling.type)`, Martin 15. 11. 2026) – `workBurner` u uhlíře v dnešní dílně nestaví `moveCamp` ani nepoužívá `anchor`
  a případnou zemnici na začátku dne opustí (`abandonCamp`); odnos na tyči se nemění. Dílna ze starší vsi zemnici nemá a rozdělaný milíř dojede bez ní. Kde
  `workBurner` začíná nový milíř: `campUsable` (15 nejbližších volných buků do
  `reuseRadiusM` od zemnice) → `startKiln` s `anchor` (první buk nejblíž zemnici, chůze se dál
  měří od dílny); jinak `moveCamp` – stará zemnice se opustí (`abandonCamp`) a u milíře se hledá
  nová (`findCampSite` v `kiln-site.ts` po kružnicích 8–30 m přes det-math, natočení
  `campRotation` vchodem k milíři, kontrola `checkCampSite` v `placement-dwellings.ts` – půda
  jako u milíře, na půdorysu s pruhem `treeMarginM` žádný strom ani souš, ani buk z dávky); místo
  není → zemnice tentokrát nevznikne. Stromy: klády z `kiln.clearing.logs`, chybějící se přidají
  do `clearing.ids` (nejbližší dospělé stromy k zemnici, za `OBSTACLE_COST.tree`, bez klád).
  Práce: ve fázi `build` jde napřed do rozestavěné zemnice (× `kilnWalkFactor`), pálení bez ní
  nezačne. Zánik dílny uhlíře (zchátrání, požár, zbourání) zemnici opustí; `updateCampRemnants`
  vedle `updateKilnRemnants` (za `abandonedYears` zmizí). Zemnice brání stavbám i milíři
  (`PlacementVillage.camps` – „Stojí tu zemnice uhlíře.“ v `checkFootprintFree`, seznam
  `burnerCampSites`), pěšina i vůz ji obejdou (`PathVillage.camps` ve `villageBuildings`, klíče
  `campsKey`, mapa tras a mřížka vozu – ves bez zemnic beze změny). Web: `SceneVillage.burnerCamps`
  (`SceneBurnerCamp` – `built` a `overgrowth` po 5 %, `occupied` = hotová a milíř pálí;
  `sceneBurnerCamps`), `camps` v `placementVillageFromScene` ve stejném pořadí jako na serveru.

- **Uhlí a ruda kováře** ([crafts.md](../design/crafts.md) – Uhlí a ruda kováře;
  Martin 20. 10. 2026: „Pokud má dostatečně starého syna nebo syny, pošle pro uhlí jeho/je. Taky
  musí někam chodit kopat rudu. To místo, kde kope rudu, chci na mapě vidět.“; čísla
  `SMITH_SUPPLY` v `rules*.ts`, rešerše `research/2026-10-20-bog-ore.md` – většinou odhad): `smith-supply.ts`.
  Uhlí, které uhlíř vytahá (`burnerDraws`), jde do nejbližší kovárny (`charcoalDeliveries`,
  `nearestSmith`, chůze `CharcoalKiln.carry` po pevných cestách s půdou) – nese ho uhlíř na tyči
  (odnos na tyči níž). Ruda: 8 kg na kg nástrojů (`Workshop.oreKg`, bez rudy kovář nekove – `workSmith`
  v crafts.ts), kopání 60 kg/čd s přirážkou za chůzi (`workOre` – dávka na 30 dní kování pěšky,
  s vozem na celý dvoukolák a dřív o `CART_JOBS.ore.reserveDays`, hromada u jámy `OreBatch.heap`),
  rudiště `chooseOreSite` (nejbližší `PATH_WETLAND`, jinak břeh; ne na čtvercích staveb ani u domů;
  na očích – Martin: „chci na mapě vidět“, návrh Clauda `DUG_SITE_VIEW`: mimo les `PATH_FOREST`
  a bez dospělého stromu vrstvy překážek, stromu u cesty či lesa vsi do 8 m – `inView`; les jen
  když volné místo není do 1,5× vzdálenosti nejbližšího (aspoň +30 m), uložená místa se nemění;
  `Workshop.oreSite`, ložisko 3 t, další 20 m od `oreSitesUsed`), jámy `VillageState.orePits`
  (`openOrePit` ze seedu, `updateOrePits` – 10 let). Přirážka za vodu daleko (`oreFactor`)
  zmizela u kováře i hrnčíře. Starší kovárny `migrateSmith` (zásoba na dávku). Činnosti `digging`, `no-ore`; podíly práce `ore` (cíl
  `{ kind: 'ore', id, x, z }`) a `fetch` (cíl rudiště; uhlí – milíř s `from` = kovárna, odnos na
  tyči níž) s věky `LaborShare.ages`; v síti pěšin jen z kovárny (`smithWalks` v
  network-targets.ts). Web: panel `SmithOreStats` (`VillageWorkshop.ore` ze `smithOreSummary` –
  vůz, jinak řádek „nese uhlíř na tyči“; o uhlí od milíře jen s uhlířem ve vsi – `burner`),
  upozornění `no-ore`, scéna
  `SceneVillage.oreSites` / `orePits` → `OreSiteRenderer` (`ore-sites.ts`, geometrie
  `ore-site-layout.ts` – val, voda, zarůstání, hromada rudy), ikona `resources/ore.png`; ukázka
  `/dev/landscape` **Rudiště** (`dev-ore.ts`). Ves bez kováře a hrnčíře beze změny
  (`smith-golden.test.ts`).
  **Výběr rudiště** (Martin 20. 10. 2026: „Půjde rudiště také označit?“): `VillageTarget`
  `{ kind: 'ore-site', id: kovárna }` – `pickVillageTarget` po posvátném dubu paprskem přes tvary
  `oreSiteDiscs` (jámy do `ORE_SITE_PIT_REACH_M` od místa – `oreSitePits`, s valem, hromada, místo),
  obrys `oreSiteOutline` (konvexní obal); panel z `VillageView.oreSites` (`lib/ore-site-view.ts` –
  ložisko, hromada, zásoba v kovárně, cesta, jámy, kdo tu dnes kope / nosí / jede s vozem z rozdělení
  práce dne a vůz se sedlákem), `DugSiteBody` s tlačítkem kovárny, portrét `icons/build/rudiste.png`
  (`icons.py rudiste`), `/dev/panels?panel=rudiste`. **Hliniště** stejně (návrh Clauda): cíl
  `{ kind: 'clay-site', id: dílna hrnčíře }` (`dugSiteOf`), tvary `oreSiteDiscs` jen s jámami téže
  suroviny (`dugSitePits`), panel z `VillageView.claySites`; jeden kód pro obě místa – pohled
  `dugSiteViews(state, day, material)` / `dugSitesField` (`VillageDugSite` – `workshopId`,
  `DugSiteWorker.craftsman`), panel `DugSiteBody` s texty `DUG_SITE_TEXTS`, portrét
  `icons/build/hliniste.png` (`icons.py hliniste`), `/dev/panels?panel=hliniste`.

- **Odnos uhlí na tyči** ([workshops.md](../design/workshops.md) – Uhlíř – odnos uhlí na tyči;
  Martin 14. 11. 2026: „Pokud má dostatečně velkého syna, donesou košatinu s uhlím mezi sebou na
  tyči do kovárny. Pokud syna nemá, dojde si do kovárny pro kováře či jeho syna…“; číslo
  `CHARCOAL_POLE`, podrobnosti návrh Clauda – plán Rozhodnutí 9): `charcoal-pole.ts`. Práce
  odnosu se nemění – kg × `basketManDaysPerKg` (koš 15 kg, cesta kovárna ↔ milíř), každý z dvojice
  nese polovinu. Uhlíř `poleBurner` (hlava domácnosti `smithHead`), druhý `polePartner`: syn
  uhlíře 12–13 (nejstarší), syn uhlíře od 14 (nejmladší), syn kováře 12–13, syn kováře od 14,
  kovář – od `CHARCOAL_POLE.sonFromAge`, kdo je pryč (`isAway`), nejde; kdo už dnes nese s jiným
  uhlířem (`taken` – id člověka → uhlíř; plán `burnerPlans` → `plannedPoleCarry` i den ho vedou
  ve stejném pořadí), taky ne – kovář i jeho syn nese jen s jedním uhlířem. Den: `charcoalCarryDay`
  ve dvou fázích jako dřív nošení – odpočívající kovárny v `dayCartJobs` (`restingFetch`, díl
  kováren `restingCarry` z kapacity `allocateDay`), ostatní ve `smithHerdingTravel` s vozy
  zaplacenými `paySmithCarts`; `mergeCarryDays` → `DayTravel.fetchPlans` → `SmithSupply.carry`.
  `CharcoalCarryDay`: `pairs` (`PoleCarry` – kg, práce dvojice `manDays`, `fetchWalk`), `burners`
  (polovina uhlíře, se synem od 14 celé nošení, a cesta pro kováře `fetchWalkManDays` – jednou za
  den za uhlíře a kovárnu), `smiths` (polovina kováře nebo syna od 14 – `workSmith` ji odečte
  z práce dílny), `busy` (synové 12–13 – `herdingDay` a `smithBellowsToday`, ten den nepasou ani
  nešlapou měch). `workBurner` odečte díl uhlíře (`options.carry`, × `WorkshopLabor.skill` –
  nošení praxe nezpomaluje) po vytahání dávky, před ostatní prací u milíře. Plán `burnerPlans`
  počítá s nošením pěšky (`plannedPoleCarry` – kovárna `nearestSmith`, chůze z `CharcoalKiln.carry`,
  jinak vzdušně; `burnerPoleShare` ½, se synem od 14 let 1): vytahá (práce − cesta pro kováře) ÷
  (vytahání + díl nošení); bez druhého u tyče nevytahá a dávka počká. Uhlí, které odveze vůz,
  nikdo nenese. Podíl práce `fetch` dvojice je u dílny uhlíře (`WorkshopDay.fetch` –
  `poleFetchEntry`): cíl milíř s `from` = kovárna, práce dvojice + cesta pro kováře, věky
  [uhlíř, druhý] a `LaborShare.pole` (`PolePartnerKind`). Učni kovárny se učí i v den, kdy kovář
  nebo syn nesl uhlí a kovář pracoval se vsí (`gainPractice` v `craftsDay`).

- **Hlína hrnčíře** ([crafts.md](../design/crafts.md) – Hlína hrnčíře; Martin 20. 10. 2026:
  „Ano, udělej to jak říkáš“ – wagons.md, Co se vozí a na čem; čísla `CLAY` v `rules*.ts`, návrh
  Clauda): jako ruda kováře – jedna funkce `workDug` (`DugMaterial` `ore` / `clay`: zásoba, místo,
  dávka, kopání a koše po surovinách; `workOre` je obal) a `chooseDugSite` (hliniště i rudiště aspoň
  20 m od míst, kde kopou jiné dílny). Hrnčíř `workPotter` (crafts.ts): 1,5 kg hlíny na kg
  keramiky (`Workshop.clayKg`, potřeba dne `potteryClayKg` podle výkonu dílny podle praxe), kopání
  300 kg/čd s přirážkou za chůzi (`clayDigManDaysPerKg`), koš 25 kg, hliniště `Workshop.claySite`
  (20 t), dávky `clayBatch` (30 dní, s vozem celý dvoukolák – `SmithSupply.cartBatch(…, 'clay')`,
  `clayCarts`), jámy v `orePits` s `clay`; hrnčíř točí jen z hlíny (`workWithWood(…, maxKg)`).
  Starší dílny `migratePotter`. **Bohaté naleziště prémiové krajiny** (premium-landscapes.md –
  Bohatá železná ruda, Dobrá keramická hlína; `premium-effects.ts`): `chooseDugSite` napřed zkusí
  prvek typu (`premiumDugSpot` – rudiště `iron-ore`, hliniště `clay`), když tam nekope jiná dílna
  a místo je volné; místo nese `OreSite.rich` – ložisko se nevyčerpá (po `depositKg` kope dál na
  témž místě, do `oreSitesUsed` nejde), kovář taví se 4 kg rudy na kg nástrojů místo 8 a hrnčíř
  potřebuje poloviční hlínu na kg keramiky (`dugMaterialFactor`, `PREMIUM_EFFECTS.richOre` /
  `fineClay` – podle místa, kde dílna dnes kope). Činnosti `digging`, `no-clay` (`restingCrafters`); podíly práce
  `clay` (cíl `{ kind: 'clay', id, x, z }`) a `fetch`; vůz job `clay` (`CART_JOBS.clay`, pořadí po
  rudě). Web: panel `PotterClayStats` (`VillageWorkshop.clay` z `potterClaySummary`), upozornění
  „Hrnčíř nemá hlínu“, scéna jámy a hromada hlíny (`SceneOreSite.clay`, `SceneOrePit.clay` – barvy
  v `ore-site-layout.ts`), náklad `wagon{2,4}-clay`, ikona `resources/clay.png`;
  `/dev/panels?panel=hrncir`.

- **Nákup u sousedů → na trhu** ([crafts.md](../design/crafts.md) – Nákup u sousedů;
  [markets.md](../design/markets.md) – Pravidla 1, 9, bod 10; Rozhodnutí plánu 3, bod 7):
  nákup u smyšlených sousedů zrušen (Martin 22. 11. 2026: „Ves by měla být schopná přežít
  a rozvíjet se dle současných pravidel i bez obchodu“); s okolím vesničané výrobky řemeslníků
  (nástroje, keramika, dřevěné nářadí) a vůz kupují 15. 11. na trhu nejbližší vsi okolí
  s řemeslníkem (`planVillagerPurchases` v `trade/villager-trips.ts` – village-trade.md,
  Vesničané na trhu). Rozhodnutí „vyplatí se“ je port dřívějšího `planPurchases` @ b4f8dadc se
  vzorci beze změny v `craft-buying.ts`: `buyingContext` (`BuyingContext` – úroda dílů v osevu,
  seno letošní seče `seasonHayYieldKg`, zásoby, domácnosti, práce vsi za rok bez cvičící rodiny,
  cena jídla v práci), `yearlySaving` (nástroje – polní práce a seč, keramika – ztráty zásob
  a denní minimum, dřevěné nářadí – práce vsi), `withToolCoverage` (obilí na platbu za nástroje
  při pokrytí po nákupu), `pay` (obilí, nebo luštěniny – nejlevnější v práci i s nošením první;
  hodnoty kg jsou ceny cíle `PayValues`), `productStock`, `productCoverage`,
  `PRODUCT_WEAR_PER_YEAR` (výrobek slouží 1 ÷ opotřebení let); vůz ušetří `cartYearSaving`
  (draft.ts, obnoveno) × `CARTS.lifespanYears`. Bez okolí ves výrobky ani vůz nekupuje – má je
  jen od vlastních pracujících řemeslníků (`ownCraftsmanWorks` – dílna
  bez vstupů se nepočítá; `craftSources` → `VillageCrafts.sources`, panel dvorce `BuyingRow`:
  vlastní ✓, jinak zašedlá ikona „… – ve vsi není řemeslník“; stojí-li vlastní dílna bez vstupu,
  popisek řekne důvod textem upozornění – `buyingDetails` v `selection-details.ts`,
  `workshopStopNotice`: „Nástroje – Kovář nemá uhlí“). Nákup uložený ve starší vsi na
  cestě (`VillageState.purchases`, `CraftPurchase` – směr, skupina, dny, stezka nebo bod na kraji
  `edge`, zboží, platba, vozy vsi `carts`, koupený vůz `cart`) doběhne: lidé chybí v práci vsi
  (`purchaseTravelers` – kapacita `allocateDay`), `walkPurchases` → podíl práce `trade` s cílem
  stezky nebo `{ kind: 'edge' }`, vozy a voli jsou do návratu pryč (`cartsAway`, `oxenAway`); ve
  scéně karavana (`sceneExpeditions` v `caravan-view.ts` – `SceneExpedition` s `trailId` null
  a čarou `line` od dvorce ke kraji – `purchaseLine`, každá cesta tam a zpět zvlášť podle
  `CraftPurchase.tripDays`; body cesty `caravanPoints`); `finishPurchases` → nástroje do vybavení,
  keramika a dřevěné nářadí do zásob, vůz `addCart`, kronika `crafts-bought` („Vlkovští směnili
  394 kg obilí za 120 kg keramiky s Lhotskými.“ – web-ui.md, Panel Kronika), upozornění
  „Vesničané koupili nástroje u souseda (sever)“, `VillageView.purchases` (nákup na cestě
  v `BuyingRow`). Zůstává cesta ke kraji mapy ve směru `purchaseRoute` (po hotové stezce
  `trailTripDays`, jinak krajinou × `CRAFT_BUYING.offTrailFactor` a `offTrailExtraDays` – karavana
  zásilky, cizí kovář ze starší kroniky) a přebytek k platbě `paymentPool` (ohrada koní).
  Rozhodnutí 15. 11. o nákupu, ceny výrobků a vozu, vozy nákupu i koupě vozu u tesaře souseda
  zrušeny 23. 11. 2026 – vrátí se s trhem skutečných vsí (markets.md bod 9).

- **Učení řemesla** ([crafts.md](../design/crafts.md) – Učení řemesla; Martin 20. 10. 2026:
  „Každý řemeslník vychovává svého nástupce - syna. Pokud je řemeslník úplně nový, trvá mu, než se
  řemeslo naučí“; čísla `CRAFT_SKILL`): `craft-skill.ts`. Praxe v letech u člověka
  (`Person.practice` po řemeslech, nejvýš 5) – `gainPractice` v kroku práce: dospělí z dílen, které
  dnes pracovaly (`crafts` – ne `resting`), a učni `craftApprentices` (synové od 10 let jako
  `smithSons`; u kováře i ve dny, kdy kovář nebo syn nesl uhlí na tyči – `restingFetch`); kdo jde
  pro kování, ne. Výkon dílny
  `workshopSkill` (nejzkušenější dospělý doma, 0,5 → 1 za 5 let) je `WorkshopLabor.skill`: kovář
  kove pomaleji (`workSmith`, `smithForgeCharcoalKg` přes `forgeLabor`), hrnčíř vypaluje
  (`workWithWood` – kácení ne), uhlíř celá práce u milíře (`forgeLabor`, i `kilnLeadDays`), tesař
  `carpenterWorkFactor ÷ skill` (i vedení party v `carpentryHelp`). Dílna bez `Workshop.skillTracked`
  (z doby před učením) pracuje jako vyučená; převod `withCraftSkill` (na začátku
  `advanceVillageSteps`) dá jejím lidem praxi za dobu, co domácnost dílnu drží (kronika), jinak 5 let;
  nová dílna z `finishConstructions` má `skillTracked` – nový řemeslník 50 %. Ves bez dílen bit po
  bitu (`craft-skill-golden.test.ts`). Web: `VillageWorkshop.skill` (`craftSkillSummary` – výkon,
  praxe, učni), panel `SkillStats` (ikona `resources/skill`, %, synové s věkem), výroba za den
  × výkon.

- **Tesař a vozy** ([wagons.md](../design/wagons.md) – fáze 1, Martin 19. 10. 2026; čísla
  `CARPENTRY`, `WOODWORK_LABOR`, `CARPENTER_TOOLS_WORK`, `WOOD_TOOLS`, `WOOD_TOOLS_LABOR`, `CARTS`,
  v `rules*.ts`, rešerše `research/2026-10-19-carts-carpentry.md`): řemeslo
  `carpenter` (polozemnice + přístřešek, [T], ikona `tesar`) – `carpentry.ts`. **Nadzemní dílna**
  (workshops.md – vypletená od 750, roubená od 800; ceny, půdorys a obsazení v
  [village-buildings.md](village-buildings.md) – Nadzemní dílny). Krok práce
  (`simulate.ts`): `restingCarpenters` (odpočívá jen bez výroby i bez stavby s dřevěnou prací),
  `carpentryHelp` před stavbami (čd tesaře vede `crew` čd dřevěné práce dne – `woodworkToday`
  rozdělí práci rovným dílem jako `build`; jeho práce jde do staveb a `build` s pokrytím násobí
  práci stavby `constructionLaborFactor` – podíl dřevěné práce `constructionWoodShare` od 1
  k 0,6), pak `workCarpenters` (vůz – `missingCart` nebo na zakázku, `addCart`,
  kronika `cart-made` –, pak dřevěné nářadí `CraftStocks.woodToolsKg` do zásoby a zakázek; klády `Workshop.timber`
  z hromady, jinak kácí – `nextTree`; práce × `carpenterWorkFactor` podle nástrojů). `workCrafts`
  tesaře přeskakuje. Dřevěné nářadí: `craftNeeds` / `craftTargets` / `craftCoverage.woodTools?`
  (jen když nějaké je) a `woodToolsLaborFactor` násobí práci vsi s `villageLaborFactor`
  (`villageProductivity` v `simulate-plan.ts` – i plán osevu). **Vozy** (`carts.ts`):
  `VillageState.carts` (`Cart` – druh, `builtDay`), `cartTargets` (vozy, které se vyplatí –
  `draft.ts`, Ohrada volů níž; `cartsWanted` – po druzích), `retireCarts` (10 let,
  `cart-worn-out`). **Vůz z trhu** (markets.md – Rozhodnutí plánu 3, bod 4): volné vozy
  (`idleCartsOf`) jsou zboží trhu – ves nabízí volné nad `cartsWanted`, bez tesaře shání vůz
  `missingCart`; prodá se nejmladší volný (`removeIdleCart`), koupený přibude jako nový
  (`addCart`) a domů ho dovedou voli, kteří jdou s výpravou (`MarketTrip.oxen`) – village-trade.md,
  Vozy na trhu a Výprava na trh. Svoz – `haulCartsToday`
  (dvoukoláky doma s volem, který neorá – ve dny orby jdou páry napřed), `planTaskHauls` v `simulate-hauls.ts` (sklizeň –
  `harvestCarryShare`, seč – `haulShare.hay`; `haulPlan` / `haulProgress` / `haulAvailable` –
  nejvýš podíl celé úlohy, převzaté v `CropWork.hauled`, `HayMowing.hauled`), `haulLogs` (klády
  ke stavbám – `fellingHaulable`, `ConstructionWood.hauled`), rozdělení práce `haul` s
  `LaborShare.carts`. Výprava na cestě (markets.md – Pravidla 10; nová k sousedovi nevyrazí):
  `TradeExpedition.trips` – kolikrát vozy jedou, `days` = všechny jízdy; scéna `caravan-view.ts`
  ukazuje postup právě běžící jízdy; nosnost a náklad vozu `expeditionCartLoads` →
  `SceneCart.job.loadKg` → panel výběru vozu; `tradeCarts` – vozy doma bez vozů výprav
  (`TradeExpedition.carts` – spřežení je pryč, `teamsHomeShare` krátí orbu). **Dosah vozu je rozhraní `CartAccess`** (cíle
  najednou) – s krajinou vozová síť (`networkCartAccess` → `villageCartRoutes`), bez krajiny
  `EVERYWHERE`; dosah úlohy se spočítá jednou při prvním svozu a uloží (`CartReach` –
  `CropWork.cartReach`, `HayMowing.cartReach`, `ConstructionWood.cartReach`; `cropCartReach` – pole
  stálou cenou, stadium dílu dosah nemění (paths.md – Stálé trasy), `mowingCartReach`, `logsCartReach`); jízdy svozu do
  ročního provozu cest `addHaulTrips` → `addRoadCartTrips` (vyjeté cesty).
  Web: `VillageCrafts.carts` / `cartTargets`, `VillageWorkshop.carpenter`, lišta dřevěné nářadí
  a vozy, panel dílny (`CarpenterStats`), upozornění
  `cart-made`, `cart-worn-out`, `carpenter-no-wood`, náhled obchodu s vozy
  (`VillageNeighbour.carts`), `SceneVillage.carts` (`sceneCarts` – u ohrady, cíl dne, náklad
  `job.load` a cíl dne `goal` – trasu `route` z něj spočítá prohlížeč, `withCartRoutes` v
  `lib/cart-routes.ts`: osa jako `villageCartRoutes` zjednodušená `simplifiedRoute`; scéna
  je kreslí – Vozy se spřežením). Dílna tesaře má model `tesar` (Řemeslné dílny). Rozdělaný vůz
  (`Workshop.cart`) stojí ve scéně před dílnou po fázích stavby (`SceneCraftYard.cart` –
  `cartBuildStage`; scene-village.md – Tesař – vznikající vůz), tesař s pomocníkem u něj.

- **Co vozy vozí** ([wagons.md](../design/wagons.md) – Co vozy vozí; Martin 19. 10. 2026:
  „Pokud budou mít k dispozici vůz, ať na pole, pro vodu nebo pro dřevěné uhlí jede vůz.“;
  čísla `CART_JOBS` v `rules*.ts`, návrh Clauda): `cart-jobs.ts` + `planCartJobs` v `simulate-hauls.ts`.
  Dvoukolák, který dnes nesváží úrodu ani seno (`planTaskHauls`) a nevozí klády (ty mají přednost
  – `logHaulCandidates` / `logHaulPlan` před rozdělením práce, `haulLogs` po něm), jede v pořadí
  `CART_JOBS.order` – ne když voli orají ani orbu navíc: **uhlí** – kam
  dnes uhlíř vytahal uhlí (`charcoalDeliveries`), jízda k milíři (`kilnCartDrive`, uložená
  v `CharcoalKiln.cart`), `kilnCartOffer` (jen když je práce sedláka na kg menší než nošení
  kovářovou domácností – Martin 20. 10. 2026: „přiveze uhlí sedlák s vozem (a odečte se jeho
  práce)“); **ruda** – hromada vykopané dávky na celý vůz (`oreCartDrive`, `oreCartOffer` – sedlák
  a kovář, `SmithSupply.oreCarts`); sedlák s uhlím a rudou jde z práce vsi před úlohami dne
  (`DayAllocation.carting`, `paySmithCarts`), kovář z práce dílny; **osivo** – `planSeedHauls` na úlohu `sow` jako svoz (`CropWork.seedHauled`,
  `seedReach` – `sowingCartReach`); **voda** – `waterCartDrive` (břeh nejblíž ohradě, kam vůz
  sjede, uložený ve `VillageState.waterCart` – čtyřkolák `waterCart4` – podle klíče chůze, tedy
  i podle pevných cest a měsíčních stadií dílů; v době osevu může vyjít null a po žni jízda) a `waterCartPlan` z
  `householdWater` (labor.ts) – přirážka za vodu se zmenší a přičte se díl posádky (v denním
  minimu); výběr druhu vozu `bestWaterPlan` (simulate-hauls.ts). **Voda ráno ve dny orby**
  (`morning-water.ts`, wagons.md – Voda ráno ve dny orby): když vodu neveze vůz se zbylými voly,
  `work()` po prvním rozdělení práce spočítá orbu, kterou ves dnes opravdu naplánovala, a
  `morningWater` rozhodne (podíl dne páru `WaterCartPlan.cartDays`, rezerva okna
  `ploughWindowsToday`, `MORNING_WATER`); vyhraje-li voda, `cutPlough` zkrátí orbu dne o podíl
  páru (i kapacitu pro osev navíc) a práce se rozdělí znovu. Domácnosti pro vodu
  `villagersToday` / `waterHouseholdsToday` – týž výběr pro simulaci i scénu (bez dílen,
  kování a dvorce cvičící rodiny). **Kámen** (pátá jízda, `CART_JOBS.stone`; Martin 12. 11. 2026:
  „Vůz vozí kameny na staveniště.“): `planStoneCarts` – po jednom dvoukoláku stavbám, pro které
  dnes láme lom (kostel, hradba, zásoba), z lomu ke stavbě (`stoneCartDrive`, uložená
  `Construction.stoneCart`), `stoneCartOffer` jen když posádka stojí méně než nošení v nůších;
  posádka a kolik vůz uveze se rozhodnou v práci stavby (`build(…, stone)`) – podrobnosti
  village-fortifications.md, Lom a kámen – Nošení kamene a vůz. Jízdy vozí `villageCartDrives`
  (vozová síť – cena v m po louce a konec trasy, bez krajiny vzdušně; `from` = jízda z jiného bodu
  než z ohrady – vůz s kamenem), do ročního provozu cest `addRoadCartTrips` (kámen z `buildDay` – `StoneDay.trips`; poptávku po vozech
  `stoneDemand` v `jobsDemand`). Rozdělení
  práce: `haul` s `LaborShare.job` (`charcoal` / `ore` / `clay` / `seed` / `water` / `stone`),
  cíl milíř (`kiln` i u
  dílny), rudiště (`ore`), hliniště (`clay`), díl pole, sad (jablka – orchard.md, Jablka vozem:
  `ORCHARD.harvestCarryShare` sklizně, `orchardCartReach`, `OrchardWork.hauled`, náklad
  `apples` – `wagon{2,4}-apples`), břeh
  (`LaborTarget` `{ kind: 'water', x, z }`), lom (`{ kind: 'quarry', id }` – vůz s kamenem); voda
  v práci `domestic` ubere posádku. Vůz s kamenem a lámání u lomu scéna zatím nekreslí. Web:
  `SceneCart.job.load` – uhlí a osivo `goods`, ruda `ore` (hromada `wagon{2,4}-ore`), voda `water`
  (sudy `wagon{2,4}-water` tam i zpět),
  osivo `outbound` (`CartShuttle.loadedOut` – naložené tam), trasa k milíři a břehu
  (`cartGoalToday` → `cartGoalRoute` v prohlížeči); voda, uhlí, ruda a osivo jezdí tempem volů ve skutečném čase jako všechny vozy
  (`village-carts.ts`). Komu vůz vodu přivezl, ukazuje
  `SceneLabor.homes[].cartWater` (týž `waterCartPlan` z `waterHouseholdsToday` ve `village-view-scene.ts` – druh vozu
  vítězného plánu z `LaborShare.fourWheel` a jeho uložená jízda `storedWaterCartDrive`) – pěšky pro
  ni chodí méně lidí (Postavy – Provoz na cestách).

- **Výroba na zakázku** (markets.md – Rozhodnutí plánu 3, bod 6; village-trade.md – Zakázky):
  řemeslník vyrábí do vlastní potřeby plus živé zakázky (`orderTargets`). Kovář – `smithIronDeficit`
  bere `toolNeedKg + zakázky nástrojů` a `smithBarsTargetKg + zakázky hřiven` (tím i `workSmith`,
  `restingCrafters`, `smithsForgeCharcoalKg`, `smithsCharcoalPerYear`, `smithBellowsToday`);
  kovárna dál jde do práce až od celého dne práce (`smithRests`), takže zakázka menší než den
  práce ji nespustí, dokud vybavení opotřebením neklesne. Hrnčíř odpočívá od `craftTargets` +
  zakázek keramiky (`restingCrafters`). Tesař (`carpentry.ts`): dřevěné nářadí do
  `woodToolsTargetKg` (`craftTargets` + zakázky), vůz `cartToMake` – chybějící (`missingCart`),
  jinak druh se zakázkou, jehož vozů vsi i na cestě a v dílnách (`cartsHad` v `draft.ts`) je méně
  než `cartsWanted` + zakázky (vůz na cestě se vrátí, vůz v dílně se už dělá). `craftTargets`,
  `smithBarsTargetKg` a `missingCart` se nemění – správce a výhledy počítají jen vlastní potřebu.
  Ves bez zakázek vyrábí stejně jako dřív (zlaté otisky).

- **Kování vozů** ([wagons.md](../design/wagons.md) – Kování vozů; Martin 20. 10. 2026: „…vozy
  mají železnou složku“; čísla `CART_IRON`): `cart-iron.ts`. Dvoukolák 3 kg, čtyřkolák 6 kg kování
  z hřiven (1,2 kg hřiven na kg). Vůz s hotovou dřevěnou prací čeká (`cartAwaitingIron` v crafts.ts –
  `workCarpenter` ho nedokončí, tesař dělá nářadí, `nextProduct` ho nepočítá); krok dne
  `cartIronDay(state, day)` (po `finishPurchases`) vezme kování z hřiven vsi (`cartIronBarsKg`)
  a vůz dokončí (`cart-made`); vlastní kovář ho vyrobí jako zakázku (`ironOrderBarsKg` v
  `restingCrafters`, `smithsForgeCharcoalKg`, `smithsCharcoalPerYear`). **Ves bez kováře a bez
  hřiven vůz nedokončí – čeká** (23. 11. 2026 – markets.md, Pravidla 1: cesta tesaře pro kování
  k sousedovi zrušena, vrátí se se skutečnými sousedy v plánu 3). Cesta uložená ve starší vsi
  (`Workshop.ironTrip`, `IronTrip`) doběhne: den po dni `done`, po návratu `iron-brought` a vůz
  hotový, kdo zemřel, kování nepřinese. Na cestě chybí v dílně (`workshopLabor` – `away`) i ve vsi
  (`ironTravellers` v `work`); nosiči a sedlák s vozem (`CART_IRON.cartCrew`) chybí v práci vsi
  (`ironTripHelpers` do `away`, `ironTripShares` – podíl `trade`; `cartsAway` a `oxenAway` čtou
  i `dwellings`). Web: `carpenter.iron` (`ironSummary` v summary.ts), panel `IronStat` („Čeká na
  kování“, u cesty ze starší vsi dny), scéna skupina nosičů nebo vůz (`ironCaravan` v
  `caravan-view.ts` – `ironTripLine`).

- **Kovář – houba, hřivny a vybavení** ([production-chains.md](../design/production-chains.md) – Kovář): řetěz ruda + uhlí → houba (tavba s měchařem – dospělý z domácnosti nebo syn od 10, sám kovář polovičním tempem) → hřivny → nástroje jako vybavení domácností (kuje se jen z hřiven nad rezervou na příští kování koní – `shoeingBarsKg`, kování má přednost); v liště jen hřivny, v obchodu `ironBars`, na trhu i nástroje rovnou z vybavení a do něj (`tools` – village-trade.md, Nástroje a dřevěné nářadí).
  - **Soubory:** `packages/game/src/domain/village/crafts/iron.ts` (řetěz, měchař, převod vybavení),
    `iron-rates.ts` (ceny kroků `SMELT`, `REFINE`, `FORGE`, `ORE_KG_PER_TOOL_KG`, `smeltOreKg`),
    `crafts.ts` (`workSmith`, `smithIronDeficit`, `smithBarsTargetKg`, `ironOrderBarsKg`,
    `cartIronBarsKg`, `smithBellowsToday`, `smithIronSummary`, `SmithIronSummary`), `trade.ts`
    (`withIronBarsTrade`), `cart-iron.ts`, `summary.ts`,
    `labor-report.ts` (syn u měchu), `simulate.ts` (měchaři před pasením, převody).
  - **Pravidla:** `IRON`, `TRADE_GOOD_VALUES.ironBars`;
    `SMITH_SUPPLY.oreKgPerToolKg` zrušeno.
  - **Stav:** `VillageState.toolEquipmentKg`, `CraftStocks.ironBarsKg` / `bloomKg` (bez `toolsKg`),
    `TradeGood` `ironBars`, `WorkshopActivity` `smelting` / `refining`, `WorkshopDay.smelt` /
    `refine`, `SmithSupply.bellows`, `DugOptions.needKg`.
  - **Převody:** `withToolEquipment`, `withIronBarsTrade` (před `withoutForeignGoods`) –
    `advanceVillageSteps` i `updateVillage`.
  - **Web:** `TopBar` (`village-iron-bars`), `SelectionPanel` (`SmithIronStats`, činnosti),
    `selection-details` (`SelectionWorkshop.iron`), `village-view` (`VillageCrafts.equipmentKg`,
    `VillageWorkshop.iron`, `CRAFT_LOOKS.smith` = hřivny), `trade-names` (`ironBars`), ikony
    `resources/iron-bars.png`, `resources/bloom.png`.
  - **Scéna** (jen čtení – scene-village.md, Kovárna a hrnčíř ve scéně): `craftYard`
    ve `village-view-crafts.ts` dá obydlené kovárně a hrnčíři `SceneVillage.dwellings[].yard`
    (`SceneCraftYard`): činnost dne (`smelting` → `smelt`, `refining` → `refine`, `producing` →
    `forge`), měchař u tavby (podíl `craft` s věkem v rozdělení práce dne = syn, jinak dospělý
    z domácnosti podle `smithBellows`), houba a hřivny po stupních 0–3 (`yardStage`,
    `CRAFT_YARD_STEPS` – zásoba kovářů dělená obydlenými kovárnami), u hrnčíře hlína v jámě
    (`Workshop.clayKg`) a šlapání, když dnes vyrábí. `workshopSmokes` – kovárna kouří i při tavbě
    a překování.
  - **Dokumentace:** crafts.md – Kovář – houba, hřivny a vybavení; trade.md – Hřivny místo nástrojů;
    production-chains.md – Kovář (Jak to běží); rešerše – Kovář.
