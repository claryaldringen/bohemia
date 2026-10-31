# Ves – řemesla, tesař a vozy

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: crafts.md, wagons.md v `docs/design/`.

- **Řemesla** (`crafts.ts`, crafts.md): dílna = obydlí s `Dwelling.workshop` (řemeslo
  `Craft` = `potter` / `smith` / `burner` patří budově; hrnčíř a kovář polozemnice, uhlíř
  zemnice – `CRAFT_BASE`), stavba je `kind: 'dwelling'` s `craft` (cena `workshopCost` /
  `workshopTrees` – obydlí + 30 %), akce `startWorkshop`, use-case `placeWorkshop`, umístění
  `checkWorkshopPlacement` (volně jako zemnice; půdorys `workshopFootprints` i s přístřeškem
  a u uhlíře s milířem kus od zemnice – `MILIR`, `milirPosition`; `PlacementVillage.dwellings`
  nese `workshop.craft`, ať se do milíře nestaví). Domácnosti obývaných dílen (`craftHouseholds`)
  pracují v dílně (`workshopLabor` – po denním minimu, domácí výroba bokem; řemeslo dělají jen muži domácnosti – `craftHands` v `smith-supply.ts`, Martin 22. 10. 2026 – a zbytek práce žen `WorkshopLabor.light` dá `craftLightLabor` jako `light` do `allocateDay` – samostatný zásobník mimo `capacity`, kryje jen `LIGHT_LABOR_TASKS` (setí, okopávání, žně, výmlat), orbu, kácení ani stavby nikdy; měchař `smithBellows`, praxe `gainPractice` a `workshopSkill` taky jen muži; ve scéně `shareWorker` bere k dílně `onlySex: 'male'` (a `hasMen` nepočítá kojence jako `craftHands`) a `DayRoster.take` pouští ženy zaneprázdněných domácností jen s `light: true` (`LIGHT_ACTIVITIES` ve `villager-plan.ts`); `workCrafts` v kroku
  práce – mimo `allocateDay`, do sil plánu osevu se nepočítají – kromě žňových dnů: řemeslník se
  syny pak jde na žeň a výmlat, `WorkshopLabor.harvest` místo `craft`, `craftHarvestLabor` →
  `allocateDay` – `harvestHands`; fields.md – Žně všemi rukama, village-fields.md), jen dokud je co dělat: **podle potřeby** (Martin 18. 10. 2026 –
  volný čas na poli) kovář a hrnčíř vyrábějí do zásoby `craftTargets` (potřeba + opotřebení za
  rok), uhlíř má vždy milíř a z vypáleného nosí uhlí podle kování (Uhlíř níž); s plnou zásobou
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

- **Uhlí a ruda kováře** ([crafts.md](../design/crafts.md) – Uhlí a ruda kováře;
  Martin 20. 10. 2026: „Pokud má dostatečně starého syna nebo syny, pošle pro uhlí jeho/je. Taky
  musí někam chodit kopat rudu. To místo, kde kope rudu, chci na mapě vidět.“; čísla
  `SMITH_SUPPLY` v `rules*.ts`, rešerše `research/2026-10-20-bog-ore.md` – většinou odhad): `smith-supply.ts`.
  Uhlí, které uhlíř vytahá (`burnerDraws`), nese do nejbližší kovárny (`charcoalDeliveries`,
  chůze `CharcoalKiln.carry` po pevných cestách s půdou) kovářova domácnost v koších po 15 kg
  (`basketManDaysPerKg`): napřed synové 10–13 let (`charcoalYoungsters`, 40 % práce dospělého – ten
  den nepasou: `herdingDay(…, busy)`), zbytek domácnost z práce dílny (`smithFetchDay`; synové od
  14 jsou ve hře dospělí – rozhodnutí Clauda), u odpočívajícího kováře z práce vsi (kapacita
  `allocateDay`). Ruda: 8 kg na kg nástrojů (`Workshop.oreKg`, bez rudy kovář nekove – `workSmith`
  v crafts.ts), kopání 60 kg/čd s přirážkou za chůzi (`workOre` – dávka na 30 dní kování pěšky,
  s vozem na celý dvoukolák a dřív o `CART_JOBS.ore.reserveDays`, hromada u jámy `OreBatch.heap`),
  rudiště `chooseOreSite` (nejbližší `PATH_WETLAND`, jinak břeh; ne na čtvercích staveb ani u domů;
  na očích – Martin: „chci na mapě vidět“, návrh Clauda `DUG_SITE_VIEW`: mimo les `PATH_FOREST`
  a bez dospělého stromu vrstvy překážek, stromu u cesty či lesa vsi do 8 m – `inView`; les jen
  když volné místo není do 1,5× vzdálenosti nejbližšího (aspoň +30 m), uložená místa se nemění;
  `Workshop.oreSite`, ložisko 3 t, další 20 m od `oreSitesUsed`), jámy `VillageState.orePits`
  (`openOrePit` ze seedu, `updateOrePits` – 10 let). Přirážka za vodu daleko (`oreFactor`)
  zmizela u kováře i hrnčíře. Starší kovárny `migrateSmith` (zásoba na dávku). Činnosti `digging`, `no-ore`; podíly práce `ore` (cíl
  `{ kind: 'ore', id, x, z }`) a `fetch` (cíl rudiště, nebo milíř s `from` = kovárna) s věky
  `LaborShare.ages`; v síti pěšin jen z kovárny (`smithWalks` v network-targets.ts). Web: panel
  `SmithOreStats` (`VillageWorkshop.ore` ze `smithOreSummary`), upozornění `no-ore`, scéna
  `SceneVillage.oreSites` / `orePits` → `OreSiteRenderer` (`ore-sites.ts`, geometrie
  `ore-site-layout.ts` – val, voda, zarůstání, hromada rudy), ikona `resources/ore.png`; ukázka
  `/dev/landscape` **Rudiště** (`dev-ore.ts`). Ves bez kováře a hrnčíře beze změny
  (`smith-golden.test.ts`).
  **Výběr rudiště** (Martin 20. 10. 2026: „Půjde rudiště také označit?“): `VillageTarget`
  `{ kind: 'ore-site', id: kovárna }` – `pickVillageTarget` po posvátném dubu paprskem přes tvary
  `oreSiteDiscs` (jámy do `ORE_SITE_PIT_REACH_M` od místa – `oreSitePits`, s valem, hromada, místo),
  obrys `oreSiteOutline` (konvexní obal); panel z `VillageView.oreSites` (`lib/ore-site-view.ts` –
  ložisko, hromada, zásoba v kovárně, cesta, jámy, kdo tu dnes kope / nosí / jede s vozem z rozdělení
  práce dne a vůz se sedlákem), `OreSiteBody` s tlačítkem kovárny, portrét `icons/build/rudiste.png`
  (`icons.py rudiste`), `/dev/panels?panel=rudiste`. **Hliniště** stejně (návrh Clauda): cíl
  `{ kind: 'clay-site', id: dílna hrnčíře }` (`dugSiteOf`), tvary `oreSiteDiscs` jen s jámami téže
  suroviny (`dugSitePits`), panel z `VillageView.claySites`; jeden kód pro obě místa – pohled
  `dugSiteViews(state, day, material)` / `dugSitesField` (`VillageDugSite` – `workshopId`,
  `DugSiteWorker.craftsman`), panel `DugSiteBody` s texty `DUG_SITE_TEXTS`, portrét
  `icons/build/hliniste.png` (`icons.py hliniste`), `/dev/panels?panel=hliniste`.

- **Hlína hrnčíře** ([crafts.md](../design/crafts.md) – Hlína hrnčíře; Martin 20. 10. 2026:
  „Ano, udělej to jak říkáš“ – wagons.md, Co se vozí a na čem; čísla `CLAY` v `rules*.ts`, návrh
  Clauda): jako ruda kováře – jedna funkce `workDug` (`DugMaterial` `ore` / `clay`: zásoba, místo,
  dávka, kopání a koše po surovinách; `workOre` je obal) a `chooseDugSite` (hliniště i rudiště aspoň
  20 m od míst, kde kopou jiné dílny). Hrnčíř `workPotter` (crafts.ts): 1,5 kg hlíny na kg
  keramiky (`Workshop.clayKg`, potřeba dne `potteryClayKg` podle výkonu dílny podle praxe), kopání
  300 kg/čd s přirážkou za chůzi (`clayDigManDaysPerKg`), koš 25 kg, hliniště `Workshop.claySite`
  (20 t), dávky `clayBatch` (30 dní, s vozem celý dvoukolák – `SmithSupply.cartBatch(…, 'clay')`,
  `clayCarts`), jámy v `orePits` s `clay`; hrnčíř točí jen z hlíny (`workWithWood(…, maxKg)`).
  Starší dílny `migratePotter`. Činnosti `digging`, `no-clay` (`restingCrafters`); podíly práce
  `clay` (cíl `{ kind: 'clay', id, x, z }`) a `fetch`; vůz job `clay` (`CART_JOBS.clay`, pořadí po
  rudě). Web: panel `PotterClayStats` (`VillageWorkshop.clay` z `potterClaySummary`), upozornění
  „Hrnčíř nemá hlínu“, scéna jámy a hromada hlíny (`SceneOreSite.clay`, `SceneOrePit.clay` – barvy
  v `ore-site-layout.ts`), náklad `wagon{2,4}-clay`, ikona `resources/clay.png`;
  `/dev/panels?panel=hrncir`.

- **Nákup u sousedů** ([crafts.md](../design/crafts.md) – Nákup u sousedů, Martin 19. 10. 2026:
  „Nástroje ať vesničané obchodují individuálně… Sami si spočítají, jestli se jim to vyplatí.“;
  čísla `CRAFT_BUYING` v `rules*.ts`, rešerše `research/2026-10-19-craft-buying.md`):
  `craft-buying.ts`. Sousedé mají řemeslníky podle druhu (`neighbourCrafts` – řemeslníci kováře,
  hrnčíře i tesaře jistě, ostatní s pravděpodobností). Ves se rozhoduje sama 15. 11.
  (`startPurchases` na začátku dne – `planPurchases`): u výrobku bez vlastního pracujícího
  řemeslníka (`ownCraftsmanWorks` – dílna bez vstupů se nepočítá) chybí do `craftTargets` –
  nejbližší soused s řemeslníkem (`purchaseRoute`: po hotové stezce `trailTripDays`, jinak krajinou
  ke kraji mapy × 1,5 a den navíc), cena `productPrice` (0,96 hodnoty), platba obilím nebo
  luštěninami z přebytku nad pojistkou (`sowingTargets` – `leftKg − bufferKg`) nejlevnější v práci
  (`villageFoodCosts`; u nástrojů při pokrytí po nákupu), skupina polovina dospělých (nejvýš 8)
  po 25 kg, nejvýš 60 dní; koupí, když práce ušetřená za dobu služby (1 ÷ opotřebení let –
  nástroje polní práce a seč, keramika ztráty zásob a denní minimum, dřevěné nářadí práce vsi)
  převýší práci za platbu a cestu – z jednoho přebytku napřed nejvyšší poměr ušetřené práce
  k ceně (rozhodnutí Clauda). `VillageState.purchases` (`CraftPurchase` – směr, skupina, dny,
  stezka nebo bod na kraji `edge`, zboží a platba); lidé na cestě chybí v práci vsi od prvního dne
  (`purchaseTravelers` – kapacita `allocateDay`), `walkPurchases` → podíl práce `trade` s cílem
  stezky nebo `{ kind: 'edge' }`; ve scéně karavana (`sceneExpeditions` v `caravan-view.ts` –
  `SceneExpedition` s `trailId` null a čarou `line` od dvorce ke kraji – `purchaseLine`, každá
  cesta tam a zpět zvlášť podle `CraftPurchase.tripDays`; body cesty `caravanPoints`),
  `finishPurchases` → zásoby a kronika `crafts-bought`. Web: kronika a upozornění „Vesničané
  koupili nástroje u souseda (sever)“, `VillageCrafts.sources` (`craftSources`),
  `VillageView.purchases`, panel dvorce `BuyingRow` (výrobky se šipkou ke zdroji, nákup na cestě),
  panel dílny bez vstupů `SelectionWorkshop.buying`; řádek kalibrace „Nákup u sousedů“.

- **Učení řemesla** ([crafts.md](../design/crafts.md) – Učení řemesla; Martin 20. 10. 2026:
  „Každý řemeslník vychovává svého nástupce - syna. Pokud je řemeslník úplně nový, trvá mu, než se
  řemeslo naučí“; čísla `CRAFT_SKILL`): `craft-skill.ts`. Praxe v letech u člověka
  (`Person.practice` po řemeslech, nejvýš 5) – `gainPractice` v kroku práce: dospělí z dílen, které
  dnes pracovaly (`crafts` – ne `resting`), a učni `craftApprentices` (synové od 10 let jako
  `smithSons`; u kováře i ve dny nošení uhlí – `restingFetch`); kdo jde pro kování, ne. Výkon dílny
  `workshopSkill` (nejzkušenější dospělý doma, 0,5 → 1 za 5 let) je `WorkshopLabor.skill`: kovář
  kove pomaleji (`workSmith`, `smithForgeCharcoalKg` přes `forgeLabor`), hrnčíř vypaluje
  (`workWithWood` – kácení ne), uhlíř celá práce u milíře (`forgeLabor`, i `kilnLeadKg`), tesař
  `carpenterWorkFactor ÷ skill` (i vedení party v `carpentryHelp`). Dílna bez `Workshop.skillTracked`
  (z doby před učením) pracuje jako vyučená; převod `withCraftSkill` (na začátku
  `advanceVillageSteps`) dá jejím lidem praxi za dobu, co domácnost dílnu drží (kronika), jinak 5 let;
  nová dílna z `finishConstructions` má `skillTracked` – nový řemeslník 50 %. Ves bez dílen bit po
  bitu (`craft-skill-golden.test.ts`). Web: `VillageWorkshop.skill` (`craftSkillSummary` – výkon,
  praxe, učni), panel `SkillStats` (ikona `resources/skill`, %, synové s věkem), výroba za den
  × výkon.

- **Tesař a vozy** ([wagons.md](../design/wagons.md) – fáze 1, Martin 19. 10. 2026; čísla
  `CARPENTRY`, `WOODWORK_LABOR`, `CARPENTER_TOOLS_WORK`, `WOOD_TOOLS`, `WOOD_TOOLS_LABOR`, `CARTS`,
  `CART_ACCESS` v `rules*.ts`, rešerše `research/2026-10-19-carts-carpentry.md`): řemeslo
  `carpenter` (polozemnice + přístřešek, [T], ikona `tesar`) – `carpentry.ts`. Krok práce
  (`simulate.ts`): `restingCarpenters` (odpočívá jen bez výroby i bez stavby s dřevěnou prací),
  `carpentryHelp` před stavbami (čd tesaře vede `crew` čd dřevěné práce dne – `woodworkToday`
  rozdělí práci rovným dílem jako `build`; jeho práce jde do staveb a `build` s pokrytím násobí
  práci stavby `constructionLaborFactor` – podíl dřevěné práce `constructionWoodShare` od 1
  k 0,6), pak `workCarpenters` (vůz – `missingCart`, `addCart`,
  kronika `cart-made` –, pak dřevěné nářadí `CraftStocks.woodToolsKg`; klády `Workshop.timber`
  z hromady, jinak kácí – `nextTree`; práce × `carpenterWorkFactor` podle nástrojů). `workCrafts`
  tesaře přeskakuje. Dřevěné nářadí: `craftNeeds` / `craftTargets` / `craftCoverage.woodTools?`
  (jen když nějaké je) a `woodToolsLaborFactor` násobí práci vsi s `villageLaborFactor`
  (`villageProductivity` v `simulate-plan.ts` – i plán osevu). **Vozy** (`carts.ts`):
  `VillageState.carts` (`Cart` – druh, `builtDay`), `cartTargets` (vozy, které se vyplatí –
  `draft.ts`, Ohrada volů níž), `retireCarts` (10 let, `cart-worn-out`); svoz – `haulCartsToday`
  (dvoukoláky doma s volem, který neorá – ve dny orby jdou páry napřed), `planTaskHauls` v `simulate-hauls.ts` (sklizeň –
  `harvestCarryShare`, seč – `haulShare.hay`; `haulPlan` / `haulProgress` / `haulAvailable` –
  nejvýš podíl celé úlohy, převzaté v `CropWork.hauled`, `HayMowing.hauled`), `haulLogs` (klády
  ke stavbám – `fellingHaulable`, `ConstructionWood.hauled`), rozdělení práce `haul` s
  `LaborShare.carts`. Výprava: `expeditionTransport` (vozy, `trips` jízd a lidé najednou – plné jízdy vozů, jízda navíc od zbytku `TRADE.restTripShare` (0,5) vozu, menší zbytek nosiči přesně mezi jízdy (floor + zbytek), `work` = součet lidí přes jízdy → `manDays`; klády jen na voze, `TRADE.logCarriers` = 2 bez vozu; `TradeQuote.trips`, `TradeExpedition.trips`, `days` = všechny jízdy; scéna `caravan-view.ts` ukazuje postup právě běžící jízdy; nosnost a náklad vozu `SceneCart.job.loadKg` → panel výběru vozu) / `tradeCarts` (`TradeQuote.carts`,
  `TradeExpedition.carts` – spřežení je pryč, `teamsHomeShare` krátí orbu; jen po stezce sjízdné
  pro vozy – `trailCartPassable`, `axisCartCheck`). **Dosah vozu je rozhraní `CartAccess`** (cíle
  najednou) – s krajinou vozová síť (`networkCartAccess` → `villageCartRoutes`), bez krajiny
  `EVERYWHERE`; dosah úlohy se spočítá jednou při prvním svozu a uloží (`CartReach` –
  `CropWork.cartReach`, `HayMowing.cartReach`, `ConstructionWood.cartReach`; `cropCartReach` – pole
  stálou cenou, stadium dílu dosah nemění (paths.md – Stálé trasy), `mowingCartReach`, `logsCartReach`); jízdy svozu do
  ročního provozu cest `addHaulTrips` → `addRoadCartTrips` (vyjeté cesty).
  Web: `VillageCrafts.carts` / `cartTargets`, `VillageWorkshop.carpenter`, lišta dřevěné nářadí
  a vozy (`showsWoodTools`, `cartsLabel`), panel dílny (`CarpenterStats`), upozornění
  `cart-made`, `cart-worn-out`, `carpenter-no-wood`, náhled obchodu s vozy
  (`VillageNeighbour.carts`), `SceneVillage.carts` (`sceneCarts` – u ohrady, cíl dne, náklad
  `job.load` a cíl dne `goal` – trasu `route` z něj spočítá prohlížeč, `withCartRoutes` v
  `lib/cart-routes.ts`: osa jako `villageCartRoutes` zjednodušená `simplifiedRoute`; scéna
  je kreslí – Vozy se spřežením). Dílna tesaře má model `tesar` (Řemeslné dílny).

- **Co vozy vozí** ([wagons.md](../design/wagons.md) – Co vozy vozí; Martin 19. 10. 2026:
  „Pokud budou mít k dispozici vůz, ať na pole, pro vodu nebo pro dřevěné uhlí jede vůz.“;
  čísla `CART_JOBS` v `rules*.ts`, návrh Clauda): `cart-jobs.ts` + `planCartJobs` v `simulate-hauls.ts`.
  Dvoukolák, který dnes nesváží úrodu ani seno (`planTaskHauls`) a nevozí klády (ty mají přednost
  – `logHaulCandidates` / `logHaulPlan` před rozdělením práce, `haulLogs` po něm), jede v pořadí
  `CART_JOBS.order` – ne když voli orají ani orbu navíc (`surplusWantsTeam`): **uhlí** – kam
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
  kování a dvorce cvičící rodiny). Jízdy vozí `villageCartDrives` (vozová síť – cena v m po louce a konec trasy, bez
  krajiny vzdušně), do ročního provozu cest `addRoadCartTrips`. Rozdělení práce: `haul`
  s `LaborShare.job` (`charcoal` / `ore` / `clay` / `seed` / `water`), cíl milíř (`kiln` i u
  dílny), rudiště (`ore`), hliniště (`clay`), díl pole, sad (jablka – orchard.md, Jablka vozem:
  `ORCHARD.harvestCarryShare` sklizně, `orchardCartReach`, `OrchardWork.hauled`, náklad
  `apples` – `wagon{2,4}-apples`), břeh
  (`LaborTarget` `{ kind: 'water', x, z }`); voda v práci `domestic` ubere posádku. Web:
  `SceneCart.job.load` – uhlí a osivo `goods`, ruda `ore` (hromada `wagon{2,4}-ore`), voda `water`
  (sudy `wagon{2,4}-water` tam i zpět),
  osivo `outbound` (`CartShuttle.loadedOut` – naložené tam), trasa k milíři a břehu
  (`cartGoalToday` → `cartGoalRoute` v prohlížeči); voda, uhlí, ruda a osivo jezdí tempem volů ve skutečném čase (`steadyJob`
  v `village-carts.ts`), ne v okně herního dne jako svoz úrody. Komu vůz vodu přivezl, ukazuje
  `SceneLabor.homes[].cartWater` (týž `waterCartPlan` z `waterHouseholdsToday` ve `village-view-scene.ts` – druh vozu
  vítězného plánu z `LaborShare.fourWheel` a jeho uložená jízda `storedWaterCartDrive`) – pěšky pro
  ni chodí méně lidí (Postavy – Provoz na cestách).

- **Kování vozů** ([wagons.md](../design/wagons.md) – Kování vozů; Martin 20. 10. 2026: „…vozy
  mají železnou složku. Pokud vesnice nemá kováře, musí tesař (nebo jeho syn, pokud ho má) dojít do
  nejbližší vesnice, kde kovář je“; čísla `CART_IRON`): `cart-iron.ts`. Dvoukolák 3 kg, čtyřkolák
  6 kg kování ze zásoby nástrojů. Vůz s hotovou dřevěnou prací čeká (`cartAwaitingIron` v crafts.ts –
  `workCarpenter` ho nedokončí, tesař dělá nářadí, `nextProduct` ho nepočítá); krok dne
  `cartIronDay` (po `finishPurchases`) vezme kování ze zásoby a vůz dokončí (`cart-made`), vlastní
  kovář (`smithAtHome`) ho vyrobí jako zakázku (`ironOrderKg` → `smithToolsTarget` v
  `restingCrafters`, `smithsForgeCharcoalKg`, `smithsCharcoalPerYear`), jinak `Workshop.ironTrip`
  (`IronTrip`): syn tesaře od 14 (`ironCarrier`), nebo tesař jde do vsi s kovářem s nejmenší prací
  vsi celkem (`ironDestinations` – kovárny jiných vsí mapy `NeighbourSnapshot.smithies` s jménem –
  `neighbourSnapshot(…, names)` –, dny `mapTripDays`; sousedé `neighbourCrafts` přes
  `purchaseRoute(…, from)` od dílny; `ironOptions` – pěšky s nosiči i vozem, `ironPlan` – nejméně
  čd, při shodě kratší cesta; úspora vozu proti cestě pěšky do roku vozů – `addCartDemand`),
  platba obilím `ironPriceKg` ze zásob, jen když ves nešetří jídlem (`hungry`); kronika `iron-trip`
  (`porters`, `byCart`), `iron-brought`. Na cestě chybí v dílně (`workshopLabor` – `away`) i ve vsi
  (`ironTravellers` v `work`). **Platbu sám neunese** (Martin: „Buď si musel půjčit vůz nebo muselo
  jít alespoň 6 lidí“): volný vůz s voly po zemské stezce sjízdné pro vozy (`freeIronCart` – dvoukolák
  napřed, `IronTrip.cartId`, sedlák z vsi `CART_IRON.cartCrew`; vůz a vůl pryč – `cartsAway`
  a `oxenAway` čtou i `dwellings`), jinak nosiči po 25 kg jako nákup u sousedů (`tripOf`,
  `groupCap` z craft-buying – 173 kg = tesař a 6 nosičů, `IronTrip.porters`; málo dospělých →
  víckrát, `tripDays`). Nosiči a sedlák chybí v práci vsi (`ironTripHelpers` do `away`,
  `ironTripShares` – podíl `trade`). Web: `carpenter.iron` (`ironSummary` v summary.ts – i `porters`
  a `cart`), panel `IronStat` („Čeká na kování“, „Syn tesaře jde se 6 nosiči…“, „Tesař jede s vozem
  a sedlákem…“ s dny), upozornění (`ironTripWho`), scéna skupina nosičů nebo vůz (`ironCaravan`
  v `caravan-view.ts` – `ironTripLine`, cesty po `tripDays`; vůz jede jako vůz výpravy – job `trade`
  v `sceneCarts`).

- **Kovář – houba, hřivny a vybavení** ([production-chains.md](../design/production-chains.md) – Kovář): řetěz ruda + uhlí → houba (tavba s měchařem – dospělý z domácnosti nebo syn od 10, sám kovář polovičním tempem) → hřivny → nástroje jako vybavení domácností (kuje se jen z hřiven nad rezervou na příští kování koní – `shoeingBarsKg`, kování má přednost); v liště jen hřivny, v obchodu `ironBars`.
  - **Soubory:** `packages/game/src/domain/village/iron.ts` (řetěz, měchař, převod vybavení),
    `iron-rates.ts` (ceny kroků `SMELT`, `REFINE`, `FORGE`, `ORE_KG_PER_TOOL_KG`, `smeltOreKg`),
    `crafts.ts` (`workSmith`, `smithIronDeficit`, `smithBarsTargetKg`, `ironOrderBarsKg`,
    `cartIronBarsKg`, `smithBellowsToday`, `smithIronSummary`, `SmithIronSummary`), `trade.ts`
    (`withIronBarsTrade`), `cart-iron.ts`, `craft-buying.ts` (`productStock`), `summary.ts`,
    `labor-report.ts` (syn u měchu), `simulate.ts` (měchaři před pasením, převody).
  - **Pravidla:** `IRON`, `TRADE_GOOD_VALUES.ironBars`, `CRAFT_BUYING.toolsValueKg`,
    `NEIGHBOURS.kinds` (`ironBars`); `SMITH_SUPPLY.oreKgPerToolKg` zrušeno.
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
