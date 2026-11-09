# Ves – jádro simulace, práce, hlad, štěstí, les

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: population.md, fields.md, happiness.md, forest.md v `docs/design/`.

- **Jádro** `packages/game/src/domain/village/` (simulace, umístění `placement.ts` (rozcestník, kontroly v `placement-<téma>.ts`), souhrn
  `summary.ts`), use-casy a port `VillageRepository` v `application/`, tabulka `village`.
  Ves se dopočítá při každém načtení a akci (mezitím ji posouvá worker – `docs/code/worker.md`).

- **API jádra:** `foundVillage` (4 lidé, zásoby – zakladatelé s vojvodou `FOUNDERS_STORES`: jídlo `foodYears` + osivo `seedYears` roční potřeby, osivo jako `reservedSeedKg` s lhůtou `reservedSeedUntilDay` = den založení + `seedKeepYears`; `seedBuyingDay` ji 1. 6. ani 1. 12. před lhůtou neuvolní, jen ve skutečném hladu; `takeSeed` na ni sáhne, až když běžné zrno nad `keepRation` nestačí (village-fields.md – Osivo pro ves bez zásob); ves, která šetří (`hungry`), ji v lhůtě zkrátí na `foundersSeedKeepKg` (seed-buying.ts – `seedFloorKg`, nejméně `seedAheadKg` nutných dílů); `fieldSowingTargets` ji v lhůtě nepočítá za jídlo – `keptSeedKg`, seed.ts; ves bez rodu `START_STORES_MONTHS` + `START_SEED_YEARS`, ves z výpravy svůj náklad –, stavba první zemnice, volitelně první pole),
  `advanceVillage(state, toDay)` (dopočítá ves do dne včetně) a akce hráče `startNewDwelling`,
  `startWorkshop`, `foundField`, `foundCemetery`, `foundOrchard`, `foundPen`, `startTrail`
  a `startExpedition` (trade.md); spřežení se cvičí samo (`trainTeamsWhenReady`). Stav
  vsi je JSON-serializovatelný, funkce vstupní stav nemění. Nové části stavu jsou volitelné
  (`VillageState.cemeteries?`, `orchards?`, `applesKg?`, `orchardWork?`, `starvationDays?`,
  `extinctDay?`, `crafts?`, `Dwelling.workshop?`, `livestock?`, `meatKg?`, `cheeseKg?`,
  `legumesKg?`, `hay?`, `pens?`, `diet?`, `ruins?`, `woods?`, `FieldPart.overgrowthYears?`,
  `manorId?`, `trails?`, `trade?`, `DwellingPlot.yard?`, `Construction.trail?`, `carts?`,
  `CraftStocks.woodToolsKg?`, `Workshop.timber?` / `cart?`) – vsi
  `sacredRuins?`, `SacredBuilding.wear?`, `Cemetery.fenceWear?`, `Pen.wear?`) – vsi
  uložené dřív se načtou a beze sadů či dílen se jejich stav nemění.

- **Opevnění v pořadí dne** (fortifications.md – Životnost a oprava; podrobnosti
  [village-fortifications.md](village-fortifications.md#stáří-přestavba-a-údržba-valu-ú54)):
  `decideFortRebuilds` běží v `simulate.ts` hned za `decideRebuilds` (přestavby obydlí) a před
  `occupyEmptyDwellings`; údržba opevnění po úsecích (`fortUpkeep`) v `work()` hned za opravami obydlí –
  bere ze zbytku společné práce (`afterBuild.left`), co zbude, jde dál (díly nad potřebu, seč).
  Ves bez opevnění nebo bez krajiny: žádný krok nic nemění.

- **Pořadí práce dne** (population.md a fields.md – Práce; Martin 19. 10. 2026: „pokud se něco
  staví, tak čas věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla
  hlad“): pracovní síla vsi = dospělí (`laborPerDay`); starší kryjí jen denní minimum své
  domácnosti (`adultDailyMin`, `householdElders` – přebytek propadne), výrostci 7–13 let pasou.
  Denní minimum domácnosti nese **přirážku za chůzi pro vodu** (paths.md – Pochůzky pro vodu,
  Martin 19. 10. 2026): `householdWaterLabor` / `waterFetchingLabor` z `Dwelling.waterWalkM` –
  cesty (`WATER_FETCHING` 0,4 na člověka) × 2 × (chůze − 100 m) ÷ 1 m/s ÷ 10 h; starší ji kryjí
  jako zbytek minima, i v plánu osevu (`sowingCapacity`) a v dílnách (`workshopLabor`); bez
  krajiny 0. Před prací dne (`simulate.ts`): 1. 9. `startSeason`, každý den `seasonDay` (konce oken
  setí, nutné díly podle potřeby úrody – fields.md, Osevní postup po dílech) a `lordHelpDay`
  (podíl dne rodiny na nutné práci) a 1. 5. `wildlifeYearDay` (roční přepočet zvěře; hned za ním `weatherDay` – kronika počasí kraje v den odhalení, `village-disasters.md` –, `dogsYear` smečka dvorce a `planHuntDay` ranní plán lovu, W4), 1. 6. `damageWindowStart` (ohrožené díly polí pro zvěř – wildlife.md, Škody); po `lordHelpDay` `settlePatrol` (jezdecká hlídka polí, W6), po práci dne `wildlifeDamageDay` (škoda zvěře a vran na nesklizených dílech, před jídlem) dále v závěru dne `huntDay` (úlovek velkého lovu), `patrolHuntDay` (úlovek z hlídky), při jídle `feedDogs` (obilí psů dvorce, `simulate-food.ts`) a po sklizni jaře `wildlifeSeasonEnd` (kronika, vynulování ztrát dílů – podrobnosti `village-wildlife.md`); potřebné sezónní úlohy jsou práce nutných dílů – plodiny
  hospodářského roku bez `SeasonCrop.surplus` (`fieldTasks`; `neededTaskRemaining` je u dílů nad
  potřebu 0). `allocateDay`: denní minimum → péče o koně (`horseCare` – `horseCareLabor`, horses.md – Péče; pokrytí v `state.horsesCaredToday`) → výpravy (`away`) → potřebné sezónní úlohy v pořadí `dayTaskOrder` – **orba rádlem první** (oxen.md – Orba má přednost, Martin 24. 10. 2026; překrývá se jen s osevem, výmlatem jaře a jablky, žeň ne), pak nejbližší konec okna (žeň a výmlat napřed ze žňových rukou – `harvestHands`, `lordHarvest`, fields.md – Žně všemi rukama) → noční hlídka polí (úloha `'watch'`, `end` Infinity, `tie` 4 – za polními úlohami dne i za nutnou sečí (`mow`, `tie` 3), wildlife.md – Noční hlídka vesničanů; v žních soupeří se sklizní) → `common` (volná práce
  v liště, `commonLaborHistory`) do staveb (`build`) → z toho, co stavby nespotřebovaly, opravy
  obydlí (`afterConstructions`) → **díly nad potřebu** (`surplusFieldDay` – fields.md, Osevní
  postup po dílech, bod 3; Martin 25. 10. 2026: „ve chvíli, kdy stavba přijde, prostě vesnice
  o část úrody přijde“): všechna jejich práce na poli (příprava půdy, setí, pletí, žně, odnos)
  a nové díly – nutná práce proti hladu je tak před stavbami, díly nad potřebu až po nich → **seč
  navíc** pro růst stád (oxen.md – Seno, dvě seče; `extraMow`) → **ryby a oka vesničanů**
  (`smallGameDay`, W7 – jen když ves chce bílkoviny; při hladu už před stavbami) → zbytek propadne. Volná práce
  v liště a zápis na seč (`recordMowingLabor` z `mowWork + allocation.common`) počítají práci
  dílů nad potřebu jako volnou – strop stád nezmenší. **Seč nutného sena** je úloha dne `mow` za
  všemi ostatními (`end: Infinity`, `tie: 3`) – polním pracím práci nikdy nebere (kromě pletí
  mužů, které jde až za ní), stavbám ano. Zvířata a domácí výroba (`DOMESTIC`) jdou bokem – jen `LaborDay.aside` pro postavy;
  `domesticBacklog` a přirážka paliva zmizely (starší vsi pole jen nesou). Úlohy dne berou práci
  ze zásobníků v pořadí **`weedChildren`** (děti 7–13 let, které nepasou, jen pletí –
  `weedingChildren` v harvest-hands.ts, `WEEDING_CHILDREN` 0,5 čd; fields.md – Pletí – děti) →
  **`light`** (ženy řemeslníků, jen lehké úlohy) → u pletí **ženy vsi** (`womenLabor` – práce žen nad
  jejich díl denního minima `WEEDING_WOMEN.dailyMinShare`; pletí je bere napřed, i před úlohami
  dřív v pořadí) → **`lordField`**
  (vojvodova rodina na poli při hladu, jen úlohy dne, nikdy stavby; co nevyužije, propadne) →
  obecná kapacita. **Pletí mužů až za ostatními úlohami dne** (fields.md – Pletí jednou a rychle):
  co děti a ženy nedoplejí, dostane obecnou kapacitu až po všech ostatních úlohách dne včetně
  nutné seče, a jen díl, který by děti a ženy dnešním skutečným tempem × `paceShare` do konce okna bez
  posledních `spareDays` dní nestihly (`weedDaysLeft`, `WEEDING_WOMEN`) – jen
  v tom se pořadí úloh dne liší. **Cvičící vojvodova rodina** (lord.md) je mimo `villagers` jako dílny; minimum
  dvorce kryje sama (`manorLabor`, domácnost dvorce je ve `householdElders` / `householdWater`
  vynechaná přes `skip`), co nepokryje, jde z práce vsi jako `manorMin`. `DayAllocation.lordField`
  = spotřebovaná práce rodiny; `work()` vrací podíl `lordField` pro `trainLordDay`.

- **Den požáru** (disasters.md – Hašení; Martin 27. 10. 2026): `fireFighting(state, day)`
  (`firefighting.ts`, plán v `state.disasters.fireFight`) – `villagersToday` nezahrnuje dospělé
  (hasí; děti a staří pracují dál) a dílny jsou `resting`. Podrobnosti: village-disasters.md.
- **Hlad a vymření** (population.md, Martin 18. 10. 2026): nahromaděný hlad
  `VillageState.starvationDays` (`nextStarvationDays` po jídle dne – pod 90 % přídělu
  přibývá, od 90 % ubývá, čísla `STARVATION` v `rules*.ts`) přidá k běžnému riziku úmrtí riziko hladem
  (`deathChances` → `base` + `starvation`; úmrtí z části hladu má v kronice `cause: 'hunger'`).
  Hájení chrání dospělé i před hladem a drží hlad den pod prahem skupiny (`luckyStarvationCap`,
  uložený hlad nejvýš `LUCKY_STARVATION_CAP` = 19); ochrana posledních dvou dospělých už není. Poslední úmrtí → `extinctDay`
  a `village-extinct`; `advanceVillage` vymřelou ves dál nesimuluje (posune jen `lastDay`),
  doménové akce ji odmítnou. **Konec hry** (`extinction.ts`: `isGameOver` – hráč má vsi a žádná
  nežije, obecně pro víc vsí): use-case `dynastyStatus` (vsi aktivních sídel dopočítané do
  dneška) a `restartGame` (archivuje aktivní sídla přes `SettlementRepository.archive`, pak
  `enterGame` založí nové sídelní sídlo s novým seedem; se živou vsí `DYNASTY_ALIVE`,
  s `abandon: true` – nabídka hry, Martin 18. 10. 2026 – archivuje i živé vsi; bez vsi vrátí
  sídlo beze změny, takže opakovaný i souběžný restart založí jediné sídlo). Akce ve vymřelé vsi odmítá
  `updateLivingVillage` (`VILLAGE_EXTINCT`), přejmenování taky. Web: `VillageView.extinct` /
  `gameOver` / `starving` (konec hry zjistí `lib/village.ts` jen u vymřelé vsi), server action
  `restartGame` (bez vstupu po konci hry, `{ abandon: true }` z nabídky) a `hud/DefeatScreen.tsx`
  (Rod vymřel, jméno, roky, Začít znovu → `window.location.reload()` kvůli nové krajině). Scéna:
  neobývaná obydlí nemají dým ani zvířata a hlína u vchodu zarůstá (`ABANDONED_EARTH_ALPHA`).
  **Konec rodu** (lord.md – Konec rodu): nezbyl-li ve vsi muž rodu (smrt, odchod), `succeedLord`
  zapíše jednou `dynasty.endedDay` a kroniku `line-ended` se jménem posledního vojvody – ves žije
  dál bez vojvody. `isLineExtinct` (ves sleduje rod a v žádné vsi hráče nežije muž rodu, ani
  chlapec) je druhá podmínka `isGameOver`; vsi bez rodu i před převodem končí jen vymřením.
  `dynastyStatus` po dopočtu každou žijící ves zastaví `abandonForLineEnd(lineEndDay)` (nejpozdější
  `endedDay`; `abandonedDay`, kronika `village-abandoned` s `reason: 'line-ended'`, lidé zůstanou
  jako záznam) a uloží; `restartGame` bez `abandon` povolí podle `gameOver`. Pohled
  `abandonedVillageAt` lidi a dobytek opuštěné vsi nezobrazí (přepínač vsí ukáže 0 lidí).
  **Stupně hladu** (population.md – Hlad a vymření, Martin 19. 10. 2026): `eat` zapíše příděl do
  sklizně `VillageState.ration` (jen když ves šetří – `hungry`), `hungerLevel` v `summary.ts` →
  `VillageSummary.hunger` (`fed` / `rationing` 90–100 % / `hungry` pod `STARVATION.fedFrom` /
  `starving`) → `VillageView.hunger`, `VillageListItem.hunger`; upozornění „Ves šetří jídlem“
  (info), „Ves hladoví“, „Lidé umírají hlady“ – jen nejvyšší stupeň, ohlásí se při zhoršení (i
  z jiné vsi – `otherVillageNotices`).

- **Štěstí a posvátná místa** ([happiness.md](../design/happiness.md), `happiness.ts`,
  `sacred.ts`; body za úmrtí `deathPointsFor` = max(0,5; 5 − 0,06 × věk), věk nese událost kroniky `death.age`, bez něj dítě 5 / jinak 3): štěstí 0–100 (`VillageState.happiness` – hodnota, úmrtí posledního roku, dny dřiny
  posledních 60 dní; chybí = 50) se den po dni posouvá o denní podíl k cíli
  (`happinessTarget` z `happinessFactors`: hlad, úmrtí, přeplněnost, dřina `isToilDay` – ves by
  běžící polní práce dnešním tempem nedodělala do konce oken –, zásoby, posvátná místa) – krok
  `updateHappiness` na konci dne. Násobí veškerou práci: `allocateDay` má jediný háček
  `productivity` (`villageLaborFactor`, 0,8–1,1; násobí se i kapacita v `sowingCapacity`).
  **Posvátné duby a háje** jsou čistá funkce vrstvy překážek – `sacredSitesOf(layer)` (mezipaměť
  podle vrstvy, ≈ 30 ms, jen přesná aritmetika – stejně v prohlížeči): posvátný dub = horní
  třetina velikosti dubů (`OAK_MODEL_HEIGHT_M` × měřítko) a nejvýš 5 stromů do 15 m, háj = aspoň
  6 dubů v 25 m s převahou dubů ≥ 65 %, čtverce háje po políčkách (`groveByTile`),
  `protectedTrees` = posvátné duby + stromy na čtvercích hájů. Ty se nikdy nekácí ani nemýtí:
  `nearestMatureTrees` a `availableTrees` je vynechávají, `cellObstacles` / `dwellingObstacles`
  / `polygonObstacles` mají parametr `keep`. Čtverce: dub zůstane stát (plocha dílu / čtverce sadu
  − 50 m²), čtverce háje se z pole, sadu i hřbitova vyjmou (`sacredCells` v náhledu = oranžové
  varování, `spared` = co se ušetří); hřbitov na čtverec s dubem nesmí. Obydlí, modla a svatyně
  nesmí pod korunu dubu ani na čtverec háje (`sacredUnder`), dub na vyklízené ploše obydlí
  zůstane (`DwellingPlacementCheck.spared`). Akce (`foundField`, `foundOrchard`, `foundCemetery`,
  `startNewDwelling`, `foundVillage`) dostanou `sacred` / `dwellingSpared` a ušetřená místa
  zapíší (`recordSpared` → `sacredOaks`, `groves`, kronika `sacred-spared`). **Modla a svatyně**:
  `checkSacredBuildingPlacement` (půdorys 4 × 4 / 30 × 30 m na louce i v lese, svatyně ≤ 1 m převýšení,
  jedna na ves), `startSacredBuilding` (stavba `kind` `idol` / `shrine` s `position`, dub(y) přes
  `planSacredWood` – nejbližší dospělé duby, ne posvátné; cena `sacredLaborManDays`), po
  dostavění `VillageState.sacredBuildings` (id = id stavby). Surovina předem `oaks`
  (`oakSupply`). Use-case `placeSacredBuilding` (`NO_OAKS`, `SHRINE_EXISTS`), server action
  `placeSacred`. Štěstí z míst `sacredHappiness(state, day, obstacles)` (stropy počtu a +40).
  **Stáří, život a štěstí posvátného dubu** (`sacred-life.ts`, čisté funkce vrstvy a dne – žádný
  stav vsi): `sacredOakLife(layer, id)` – stáří k roku 500 z velikosti (`oakAgeYears`, 150–400
  let), délka života 800–2000 let (`SACRED_OAK_LIFE`, Beta(2, 4) ze seedu z id a polohy dubu),
  den uschnutí v létě a pádu souše po 50–100 letech; `sacredOakNow(layer, id, day)` – stadium
  `alive` / `snag` / `fallen`, stáří (souš – ve kterém uschla), štěstí (`oakAgeHappiness` 1–10
  podle logaritmu stáří, souš 1, padlá 0; započítají se 3 nejvyšší). Simulace i souhrn proto
  dostávají vrstvu překážek (`happinessFactors(…, obstacles)`, `summarizeVillage(state, day,
obstacles)` – bez ní se dub počítá jako nejmladší); krok simulace `sacredOakEvents` zapíše do
  kroniky `sacred-oak-died` / `sacred-snag-fell` (upozornění přes `CHRONICLE_NOTICES`). Padlá
  souš už posvátným dubem není (panel, výběr, štěstí), místo ale zůstává chráněné vrstvou.

- **Hráč staví kdy chce** (Martin) – stavbu smí zablokovat jen **cena předem** (`costs.ts`:
  `BUILD_COSTS`, `buildAffordability`): suroviny ze zásob (dřevo u obydlí a dílen). Lidi k osídlení nechce žádná stavba (obydlí
  i dílny od 8. 11. 2026 – demolition.md; `availableSettlers` v `households.ts`: možné nové domácnosti
  `possibleNewHouseholds` − prázdná − rozestavěná nová obydlí – už není cena, jen počet čekajících rodin pro
  správce a upozornění); prázdná dílna nevyrábí (`occupiedWorkshops`), rodina do ní nastoupí v `occupyEmptyDwellings`.
  Tlačítko je pak zašedlé, zkratka nic nespustí, v popisku chybějící část červeně; server odmítne
  (`NO_WOOD`, `CANNOT_AFFORD`). `waitingHouseholds` (upozornění „Rodina čeká na dům“, dřív
  „Domácnost je plná“; `VillageSummary.fullHousehold`) = kladní lidé k osídlení.

- **Determinismus:** simulace jde den po dni v pevném pořadí kroků (`simulate.ts`), náhoda dne
  je ze seedu vsi a indexu dne – výsledek nezávisí na tom, po jakých kouscích se ves dopočítá.
  - **Občasná neshoda „po kouscích × vcelku“ pod zátěží (8. 11. 2026)** – test „den správce –
    dlouhý běh“ (`steward.test.ts`) zhruba v 1 z 8 souběžných běhů souboru (vytížený stroj) padl:
    dopočet po kouscích byl vždy správný (týž otisk jako samostatně i s `node --jitless`), ale
    stav vcelku – spočítaný napřed a správný hned po dopočtu – měl na konci jinou krajinu zvěře
    (`wildlife.land.forestHa` / `openHa` = krajina nové vsi). Týž objekt `land` se přepsal během
    prvního kousku (založení vsi, `withWildlife` → `wildlifeLandAt`), ač pole krajiny žádný kód
    nemění (jen `w.land = …` vymění odkaz). Odkaz v kódu to není: po dopočtu vcelku (i po
    předchozích testech souboru) výsledek, jeho `wildlife` ani `land` nedrží nic kromě testu –
    po uvolnění je GC sebere (`WeakRef`), takže do nich žádný kód zapsat nemůže; se zmrazeným
    výsledkem i `start` (42 běhů) nepadl žádný TypeError. Mezipaměti to nejsou (`WeakMap` je pro program
    neviditelná, jediný `WeakRef` – `walkMemoOf` – vyhazuje deterministicky; samostatný běh
    s `global.gc()` mezi kousky, jednovláknovým GC, menším zásobníkem i s `--jitless` sedí) –
    vypadá to na sdílení číselných polí (boxy `double`) ve V8 13.6 (Node 24.14) závislé na
    souběžné kompilaci; deterministicky ani mimo vitest to vyvolat nešlo. Test proto porovnává
    otisk vcelku pořízený hned po dopočtu. **Riziko:** stav držený v paměti (paměť vsí serveru) by
    se mohl takto změnit dalším dopočtem jiné vsi; krajina zvěře se přepočítá každý 1. 5.
- **Pořadí dne – pohromy** (plán pohrom – Pořadí dne): `weatherDay` a `partProtectionDay` hned
  za `wildlifeYearDay`; `famineMemoryDay` před `startSeason`; **`localDisastersDay`** (smršť,
  kroupy, povodeň, požár – `local-disasters.ts`) po `damageWindowStart`, před `startPurchases`
  a `work()` – požár nastaví `disasters.fireFight` a `villagersToday` / `work()` dnes vidí dospělé
  u hašení; pěší lovci dne (`planHuntDay`) už jsou mimo ves a nehasí. Pohromy nedávají nová id
  (kontrola `moveGrainFromCoveredPits` beze změny). Podrobnosti: village-disasters.md.

- **Dopočet po kouscích na serveru:** `advanceVillageSteps` je `advanceVillage` po dnech
  (generátor – tatáž smyčka, stav se klonuje jednou). `loadVillage` / `dynastyStatus` dostanou
  port `Pause` (`application/villages.ts`) a mezi dny se ptají, jestli počkat; web
  (`packages/server/src/compute-pause.ts`, v `dynastyDeps`) po ≈ 50 ms počítání v kuse pustí přes `setImmediate`
  ke slovu ostatní požadavky – dopočet po dlouhé nepřítomnosti nebo přeskok o 10 let neblokuje
  server (jedno vlákno). Jeden drahý den (přepočet sítě pěšin) se nedělí. Výsledek na
  přestávkách nezávisí (test v `villages.test.ts`).

- **Schránka vsi** – jediná cesta, jak cizí věc (jiný hráč, svět) změní ves (plán multiplayeru,
  technické rozhodnutí 4). Doména `domain/village/inbox.ts`: `VillageEvent { id, villageId, day,
seq, body }`, `NewVillageEvent` (bez `id` a `seq`, s jedinečným `ref` – idempotence zápisu),
  tělo `VillageEventBody` je unie podle `kind`: `{ kind: 'chronicle'; event }` (zápis do kroniky
  s dnem použití) a `{ kind: 'lord-arrives'; party; fromVillageId }` (příjezd dosazeného vojvody –
  `settleAppointee`, village-people.md – Dosazení vojvody do vsi bez muže rodu); nový druh = nová
  větev v `applyEvent` (kompilátor ohlídá úplnost).
  - **Kde se použijí:** `advanceVillageSteps(state, toDay, obstacles, landscape, inbox = [])` na
    začátku dne `d`, před `simulateDaySteps(d)`, použije události dne `d` v pořadí `seq`
    (`applyInboxDay` – mutuje klon stavu jako kroky dne, zápisy kroniky vrací). Události mimo
    dopočítávané dny (`day ≤ lastDay`, `day > toDay`, dny spící vsi – vymřelé, opuštěné, na
    cestě) se přeskočí, takže výsledek nezávisí na kouscích ani na přestávkách (test „po
    kouscích“ 1 / 3 / 10 dní a přerušený generátor v `__tests__/inbox.test.ts`). `advanceVillage`
    bez `inbox` (testy, měření) dává totéž co dřív.
  - **Port** `VillageInbox` (`application/inbox.ts`): `post(event)` – den zápisu
    `max(day, lastDay + 1)`, zápis zvedne verzi vsi, `null` = `ref` už zapsaný; `pending(villageId,
afterDay, toDay)` – události `afterDay < day ≤ toDay` podle dne a `seq`. Schránka je člen
    úložiště vsí (`VillageRepository.inbox`), takže ji má každý dopočet přes `updateVillage`
    (`loadVillage`, `advancePlayer`, `dynastyStatus`, všechny akce hráče) bez zvláštní
    závislosti. `EMPTY_INBOX` – prázdná (kalibrace). Adaptér Postgresu `createInboxRepository` (tabulka
    `village_inbox`, transakce `post`) je popsaný ve `world.md` – Schránka vsi.
  - **Souběh:** `updateVillage` si po načtení vsi vyžádá `pending(villageId, lastDay, dnešek)`
    a předá je dopočtu. Zápis do schránky během dopočtu zvedne verzi vsi → uložení selže na
    kontrole verze → další pokus načte čerstvou ves i události a použije je právě jednou (test
    v `__tests__/village-inbox.test.ts`). Proto ne zámek cílového hráče – dva zámky v jedné operaci
    by porušily pravidlo „nikdy vnořený“.
  - **In-memory** `__tests__/in-memory-inbox.ts` (`InMemoryVillages.inbox`) se chová jako budoucí
    adaptér: posune den, zvedne verzi vsi v `InMemoryVillages`, hlídá `ref`.

- **Nepřítomní a hosté** (plán 2026-11-03 – rozhodnutí 11; vassalage.md – Lidé a robota; kód
  `domain/vassalage/guests.ts`, `people.ts`) – kdo je pryč jen na čas (robota, později služba,
  tažení, zajetí, ochrana), zůstává ve stavu domovské vsi s `Person.away` (`kind`, `untilDay`,
  `hostVillageId`, `refId`); hostitelská ves ho vede jako hosta (`VillageState.guests`, `Guest
{ ref: PersonRef, kind, untilDay, adult: true }`). Obě části stavu jsou volitelné – starší vsi
  bez nich se nemění (zlaté hodnoty simulace drží).
  - **Doma:** `isAway(person, day)` (do dne `untilDay`) – `laborPerDay` i `foodNeedPerDay` vrátí 0,
    takže nepřítomný nepracuje (práce dne, řemesla, výhledy správce) ani nejí (`villageFoodNeed`,
    jídlo, maso, mléko). Jinak žije dál ve vsi (stárne, může zemřít).
  - **U hostitele:** `guestsToday` / `guestFoodNeedPerDay` / `guestLaborToday` – host je dospělý:
    jí jako dospělý ze zásob hostitele (`villageFoodNeed` ho přičte) a pracuje 1 čd denně.
    Práce hostů ve `work()` (`simulate-work.ts`) jde **napřed do rozestavěného opevnění**
    (`build(…, 'fortification')` – rovným dílem po úsecích, bez tesaře), co zbude, se přičte ke
    společné práci před stavbami – ostatní stavby rovným dílem, opravy obydlí, údržba valu, díly
    nad potřebu, seč navíc (návrh Clauda podle fortifications.md – Robota vazalů). Polní úlohy
    dne hosté nedělají; ukazatel volné práce na seč (`recordMowingLabor`) práci hostů nepočítá.
    Rozdělení práce dne (`labor-report.ts`) dostane práci hostů na opevnění jako další řádky
    staveb.
  - **Návrat v pevný den:** `returnHome(state, day)` na začátku každého dne v `advanceVillageSteps`
    (před událostmi schránky dne): kdo má `untilDay <= day`, je doma (`away` zmizí, kronika
    `people-back`), hosté s `untilDay <= day` odejdou (prázdné `guests` zmizí). Bez události
    schránky – výsledek nezávisí na kouscích dopočtu obou vsí (test po kouscích v
    `vassalage/__tests__/guests.test.ts`).
  - **Příchod hostů:** tělo schránky `guests-arrive` (`fromVillageId`, `fromName`, `guests`) –
    `hostGuests` přidá ty, kdo ještě neodešli a ve vsi nejsou; kronika `guests-came`.

- **Výkon dopočtu** (Vlkov, 44 lidí, rok vcelku): po stálých trasách (A4) ≈ 49 s, po mřížce
  a trasách vozu v paměti a chůzi s horní mezí napřed (B1 – village-roads.md, Trasy v paměti)
  ≈ 39 s, po rychlejším hledání vozu (B2a) ≈ 31 s, po C1 (orba chce jen cenu trasy – A* s odhadem
  od cíle, voda vozem jen k nejlevnějšímu břehu, chůze rovně po kusech stejné půdy) ≈ 26 s při
  vysoké zátěži (≈ −25 % CPU); se zvěří a klučením ≈ 29 s a po paměti chůze rovně po úsečkách
  (C2 – délka platí, dokud se buňky půdy kolem úsečky nezmění) ≈ 22 s (≈ −20 % CPU). Po C3
  (mřížka vozu při orbě jen vrstvou dílů – `withPartStages`, buňky polí a nejbližší díly
  v paměti – `fieldCellsOf`, orba v plánu osevu jednou; village-roads.md – Trasy v paměti) rok
  27,0–27,2 s → 18,9–19,0 s (≈ −26 % CPU, hlava před C3 už s dalšími mechanikami). Nejvíc teď
  bere přepočet chůze se změnou mapy tras (`refreshWalkDistances`, ≈ 42 % – dolní meze chůze,
  síť pěšin, trasy k práci), hledání tras vozu ≈ 17 %. Mezipaměti a zkratky hledání jsou jen
  zrychlení – výsledek bit po bitu týž i po studeném startu (`cart-memo.test.ts`,
  `cart-routes-fast.test.ts`, `ground-walk-fast.test.ts`, `walk-memo.test.ts`,
  `cart-grid-stages.test.ts`).
  Po stálých trasách jen se stavbou (obsazenost domácností, ohrad a obilných jam trasy jen
  převáží) a olemování jako součásti cesty (Martin 31. 10. 2026 – village-roads.md, Mapa tras
  a klíč) Vlkov (46 lidí, rok po dnech, zátěž 13–24): stálé trasy 8× → 3× za rok, rok 29,8–30,8 s
  → 26,3–26,8 s (−12 %); přepočet chůze ≈ 28 % (`refreshWalkDistances` 7,8 s), vozy ≈ 20 %
  (`villageCartCost` 3,5 s, `villageCartRoutes` 2,0 s).
  Po odhadu vzdáleností (Martin 31. 10. 2026 – village-roads.md, Odhad vzdáleností; vozy bez
  mřížky, chůze lesem a přes brod) rok Vlkova střídavě před / po (zátěž 6–14): 25,8–26,2 s →
  22,4–22,8 s (−13 %); práce dne (`work`) 5,9 s → 1,9 s (odhad vozu 1,2 s), přepočet chůze 7,4 →
  7,9 s (objížďky přes brod a jednou `routes-v8`). Cíl < 10 s splněn není – nejvíc bere přepočet
  chůze (`walkingDistances` 2,1 s, trasy k práci dne 1,6 s, převážení 1,3 s, denní klíč mapy
  `routeMapKey` 0,9 s, stálé trasy 0,8 s), sezóna (`seasonDay` 3,5 s), měsíc cest (`roadsMonth`
  3,0 s) a kopie stavu při každém dni dopočtu (`cloneState` 1,5 s).
  Jisté úspory (Martin 31. 10. 2026 – village-roads.md): bez tras k práci dne, denní kontrola mapy
  otiskem bez skládání klíče, převážení s mřížkou z paměti, chůze s jedním napojením na síť. Rok
  Vlkova střídavě před / po (zátěž 5–19): 23,4–24,3 s → 19,0–19,6 s (−19 %, CPU 28,4–30,0 →
  23,7–24,4 s); přepočet chůze (`refreshWalkDistances`) 8,1 → 4,4 s (`walkingDistances` 2,2 →
  1,1 s, převážení 1,4 → 0,7 s, `routeMapKey` 0,9 → 0,4 s, `workRoutesOf` 1,7 s → 0). Nejvíc teď
  bere sezóna (`seasonDay` 3,6 s), měsíc cest (`roadsMonth` 3,0 s), práce dne (`work` 2,1 s)
  a kopie stavu (`cloneState` 1,5 s).
  Sezóna a měsíc cest (Martin 31. 10. 2026 – „úspory jsme se snad shodli, že uděláme“; rok
  Vlkova po dnech, střídavě před / po, profil): **S1** paměť hospodářství podle obsahu dílů
  (`villageHoldings` – přežije `cloneState`; bit po bitu týž) `villageHoldings` 0,93 → 0,09 s;
  **S2** výběr dílů jen s místem na čele (village-fields.md, `FarmSeason.selection`) `seasonDay`
  3,8 → 1,7 s (bez místa na čele 82 ze 151 dní výběru; úroda, hlad, orba i zásoby beze změny);
  **R1** smazané kusy si ves pamatuje (village-roads.md, `VillageRoads.lostRuns`) – oprava vzniku
  cest, který na Vlkově celý rok uvízl: `roadsMonth` 3,1–3,3 → 1,7–2,3 s první rok (vznik nad
  kopií 2,6 → 0,7 s), vzniknou 3 cesty (36 → 41 úseků, sklizeň −0,1 %). Rok po dnech CPU (zátěž
  15–80) ≈ 30–33 s → 28–29 s po S2; druhý rok Vlkova (zátěž 4–5) 28,1 → 24,8 s (−12 %, všechny tři úspory). Otisk po dnech = najednou = po 10 a 37 dnech u všech tří. Za 20 let se výsledek rozejde (lidé, úroda, hladové dny) stejně jako po změně zásob o 1 mg na začátku – chaos dlouhého běhu, ne posun pravidla.
  Kolo 1 výkonu dopočtu (Martin 31. 10. 2026: „udělej všechny performance vylepšení, kterých jsi
  schopen“) – jen paměť, užší kontroly a méně alokací, výsledek bit po bitu týž (otisk roku Vlkova
  `7af6be0f6c11`, 20 let i nová ves se správcem 15 let beze změny). Rok Vlkova po dnech, střídavě
  před / po (zátěž 10–13): 13,9–14,8 s → 11,1–11,4 s (−20 %, CPU 18,4–18,5 → 14,9–15,2 s):
  kopie stavu (`cloneState` – primitivní hodnoty bez volání, `for…in`) 3,7 → 3,4 ms; brázdy přes
  cesty (`roadFreeRuns` – pásy cest daleko od pásu orby se nepočítají) `lordHelpDay` 1,36 →
  0,57 s; buňky čtverců staveb v paměti (`squareCellsOf` pro cíle tras – `tripGroups` 0,69 →
  0,27 s); ceny úseček vozu v paměti podle půdy vozu (`cartSegment`, `SegmentMemo` – půda se mění
  jen se změnou polí) `cartEstimates` 0,45 → 0,24 s; paměť chůze rovně ověřuje platnost po pruhu
  32 kroků podél úsečky místo obdélníku celé úsečky (`unchangedAround` – přepočty 127 → 49 tisíc
  za rok); otisk klíče mapy tras stejného proudu z paměti (`routeMapKey` 0,40 → 0,21 s); terén
  pěšin s rezervou 600 m – u skutečné krajiny jedna stavba místo dvou při studeném startu
  (`buildPathTerrain` 0,77 → 0,42 s); u chůze k cílům se řetězy pěšin, jejichž dolní mez nevyjde
  pod dosavadní nejlepší, nehledají. Nejvíc teď bere přepočet chůze se změnou mapy (5× za rok –
  síť pěšin 1,4 s, chůze 1,1 s, z toho studený start paměti ≈ 0,5 s), kopie stavu (1,4 s – jednou
  za dopočet, u hráče, který se dívá denně, za den), sezóna (`seasonDay` 1,1 s – výběr dílů),
  měsíc cest (`roadsMonth` 1,0 s), práce dne (`work` 1,0 s) a roční přepočet cest (`roadsDay`
  0,5 s, trasy vozů jednou za rok). Měřicí skript klonuje stav každý den (jako dopočet po jednom
  dni); `tsx` k tomu přidává `__name` u vnořených funkcí a překlad modulů (≈ 0,8 s před měřením).
  Kolo 2 (Martin 31. 10. 2026: „Udělej všechny ty navrhované optimalizace“) – pět úspor; čtyři
  vyšly bit po bitu stejně (otisk roku `7af6be0f6c11`, 20 let i nová ves se správcem beze změny,
  vše se zmrazenými sdílenými záznamy): kopie stavu sdílí záznamy překážek, pokácených stromů,
  kroniky a bodů cest (`SHARED_RECORD_LISTS` – 3,78 → 3,39 ms na kopii); vstup jídla dne jednou
  pro nouzovou porážku i jídlo, hledání masa porážky přepočítá jen mléko (`withMealDams`); výkon
  orby plánu osevu z paměti po krajině, dokud se díly, mřížky polí a cesty nezmění
  (`sowingFurrowEfficiency` – přesné porovnání vstupů, 5 přepočtů z 214 volání za rok); zbytky jam
  pod stavbou jen se změnou vstupů kontroly (`updateRuins` – `coverInputs`, kontrola, která nic
  nenašla, si je pamatuje). Pátou – chůzi rovně po celých buňkách místo půlbuněk – jsem vrátil
  (revert): měnila výsledek (úsečky Vlkova medián 0,09 %, nejvíc 3,2 %, u brodu ±30 m) a za rok
  nic měřitelného nepřinesla (chůze rovně je po kolu 1 skoro celá v paměti); chůze dál krokuje
  po půlbuňkách. Rok Vlkova po dnech střídavě před / po (zátěž 11–16): 11,8–12,3 s → 10,0–10,8 s
  (−14 %, CPU 15,5–15,9 → 14,0–14,2 s).
  Kolo 3 (Martin 31. 10. 2026: „udělej všechny performance vylepšení, kterých jsi schopen“) – jen
  zrychlení, výsledek bit po bitu týž (otisk roku `7af6be0f6c11` vcelku, po 10 i po 37 dnech, 20 let
  `dc4bf7fa6a73`, nová ves se správcem 15 let `65f3f4bcd431`, vše se zmrazenými sdílenými záznamy):
  kopie stavu sdílí i body profilů zemních prací a buňky dílů (`parts[].cell`) a díl kopíruje
  rozložením (`clonePart`) – 2,5 → 1,5 ms na kopii; díly podle id z paměti po seznamu dílů
  (`partsByIdOf`, parts-by-id.ts – mapa platí, dokud má seznam tytéž díly ve stejném pořadí
  a pod týmiž id; ≈ 2 900 map za rok); klíč plotů (`fenceLayoutKey`) a neprůchodné plochy
  (`villageBlockedAt`) skládají jen části se stavbami a ploty, ne texty 3,8 tisíce dílů; bloky
  osevu (`sowingBlocks`) se skupinou dílu jednou a bez mapy vzdáleností úseku (1,6 → 0,65 ms);
  chůze k loukám při seči (`walkDistancesTo`) bez výpočtu sítě pěšin (bere jen uložené trasy)
  a s pamětí úseček (0,27 → 0,10 s za rok); půda vozu (`cartGroundOf`) porovná vstupy dílů jako
  čísla místo skládání textu klíče (≈ 150 kB za volání). Rok Vlkova po dnech střídavě před / po
  (6639658f → 0e0ed2a2, zátěž 4–7): 9,4–9,7 s → 8,0–8,3 s (−15 %, CPU 13,3–13,6 → 11,7–11,9 s).
  Nejvíc dál bere přepočet chůze se změnou mapy (≈ 2,0 s – síť pěšin inkrementálně bit po bitu
  nejde: kola hledání sčítají provoz všech tras, jedna stavba může změnit kteroukoli trasu),
  sezóna (`seasonSelection` 0,8 s), měsíc cest (0,95 s, rozprostřeno) a roční trasy vozů (0,6 s).
  Kolo 2 výkonu dopočtu (7. 11. 2026, po opevnění z bodů – fortifications.md, křivka po 1,5 m):
  palisáda Vlkova má stovky krátkých kusů pásu a vše, co procházelo všechny stěny, zdražilo – rok
  Vlkova po dnech (stav z DB 7. 11., 33 lidí, palisáda se 7 branami) 33,9–42,3 s (CPU 38–42 s).
  Jen zrychlení, výsledek bit po bitu týž (otisk roku `4491a922af16` po dnech, vcelku, po 10
  i po 37 dnech; nová ves 20 let `e37105322688`, nová ves se správcem 15 let `248ba0483ad8`):
  **mřížka obalů stěn** (`wall-grid.ts` – buňky 4 m, obal s rezervou 5 cm) – `cutsWall` zkouší jen
  kusy z buněk sloupců, přes které úsečka vede, obrys stěn pro odstup osy trasy (`wallOutline` –
  `fenceClearance` z `routeLine` / `fencePin`, dřív 13,7 s za rok) jen kusy a hrany u bodu
  (`FenceOutline.near` – přesná vzdálenost jen pod dosahem, volající ji s ním jen porovnávají);
  objížďka si pamatuje viditelnost cíle z bodů grafu (`DetourGraph.sees` – týž cíl ze všech
  obydlí); `walkWallsOf` vrátí pro stěny se stejnými čísly tentýž objekt, takže graf objížďky
  a paměť dosahu přežijí přepočty tras; průsečíky cest s úseky (`roadGates` – denně
  `gateRoadCrossings`, 1,0 s) přeskočí úsečky mimo obal úseku; hledání sítě pěšin (`search`) bez
  vnořené funkce odhadu. Rok Vlkova po dnech střídavě / souběžně před / po (zátěž 5–20):
  33,9–42,3 s → 14,0–14,5 s (CPU 38,3–41,9 → 18,4–19,0 s, nejdražší den 7,7–9,7 → 2,3–2,5 s).
  **Cíl < 10 s splněn není.** Zbytek (profil ≈ 15 s): tři přepočty mapy tras za rok po ≈ 2,1 s
  (6,5 s – hledání sítě pěšin 3,0 s, chůze 2,4 s, z toho objížďky stěn 2,1 s), práce dne 1,6 s
  (`surplusFieldDay` 0,9 s), sezóna 1,2 s, kopie stavu 1,0 s, odhady vozu při orbě 0,9 s, správce
  0,6 s – zbylých 362 dní ≈ 7,9 s rozprostřeno po desítkách funkcí. Pod 10 s bez změny pravidel
  nevidím: návrh Clauda – (a) hrubší body objížďky stěn (`DETOUR_STEP_M` 5 → 10 m, graf 210 →
  ≈ 110 bodů – objížďky ±1–2 m, nová verze tras) nebo (b) přepočet mapy tras po změně stavby až
  další den ráno jednou za týden (ne hned) – obojí mění výsledek, proto jen na pokyn.
  **Kolo 3 (Martin 8. 11. 2026, volba „B“ – objížďka po 10 m):** body objížďky vně obvodu hradeb po
  10 m místo po 5 m (`DETOUR_STEP_M`, `fortification/walls.ts`) – graf objížďky je zhruba o třetinu
  menší (testovací palisáda 4 × 4 čtverce 47 → 33 bodů, malý čtverec 23 → 20); vesničané obcházejí
  palisádu o kus méně přesně, výsledek vsí s opevněním se mění, vsi bez opevnění ne. Samotných
  10 m protnulo zeď na rozích (test „bez pěšiny na straně cíle“ padal), proto návrh Clauda:
  zhušťování jen tam, kde to hrana potřebuje – kde úsečka mezi sousedními body řízne stěnu, vloží se
  bod doprostřed (půlí se až na ≈ 2,5 m) a před každou bránu se bod klade vždy. Větší odstup u
  ostrých míst jsem nezvolil: odsouvá bod od zdi a zhoršuje objížďku, zhušťování je jednodušší a
  nechává běžné rovné úseky řídké. Čas roku Vlkova: změří se (měření na zatíženém stroji
  nic neříkalo).
  **Kolo 4 (8. 11. 2026, rok Vlkova pod 10 s bez změny výsledku):** stav z DB 8. 11. (26 lidí,
  palisáda z bodů, 47f58434) – rok 21,6–23,0 s, z toho 9 dní po 1,6–2,9 s (23. 5., 1. 11., 12. 12., 17. 12., 20. 12., 6. 2., 1. 3., 1. 4., 1. 5.) ≈ 78 %. Všech 9 je přepočet mapy tras se skutečnou
  změnou klíče (`routeMapKey`): ohrady (5×), pevné cesty (1. 3.–1. 5.), pařezy k 1. 11., opevnění
  (23. 5.); jinak drahé dny nejsou. Jeden přepočet ≈ 1,7 s: síť pěšin ≈ 1,1 s – 367 hledání
  (A* k bráně každé domácnosti zvlášť, Dijkstra u jediné, dvě kola) po mřížce 375 × 375, ≈ 5,5 mil.
  vyjmutí z haldy (29 % zastaralých); hledání jde po sobě, každá trasa hned mění ceny buněk, takže
  se nedá rozdělit ani převzít z minulého přepočtu (počáteční ceny se mezi přepočty liší jen
  v 21–3 000 buňkách ze 140 tisíc, ale váhy cest se stářím domácností mění provoz a ceny po
  trasách). Vzdálenosti chůze ≈ 0,55 s, z toho objížďky stěn ≈ 0,45 s: 174 tisíc úseček rovně
  z obydlí k dílům a uzlům sítě, 82 % protne palisádu (pole leží vně). Změna – **paměť objížděk**
  (`wallCrossing`, walk-walls.ts): průchod stěnou i body objížďky podle úsečky v číselné tabulce
  (`SegmentMemo`) u stěn – `walkWallsOf` vrací pro tytéž stěny tentýž objekt a úsečky se mezi
  přepočty opakují (za rok 1,54 mil. dotazů, 146 tisíc různých; paměť ≈ 15 MB na stěny, nejvýš
  2^18 úseček, pak začne znovu – drží ji jen stěny z `walkWallsOf`, posledních 8). Mez `limit` výsledek v paměti
  nemění: konce objížďky se zkoušejí v pořadí dolní meze nezávisle na ní, takže body objížďky
  i 'none' platí pro každou mez nad uloženou hranicí `at` (pod ní 'far'); 'far' z menší meze se pro
  větší dopočítá. Test `paměť objížděk` porovná paměť s výpočtem bez ní pro čtyři meze. Chůze
  přepočtu 4,9 → 2,4 s za rok. Otisk roku `5b5fccae7d5b` týž před i po – po dnech (každý den),
  vcelku i po 37 dnech. Rok Vlkova třikrát střídavě před / po (stroj vytížený jinými procesy,
  zátěž 40–98, proto i cykly procesu z `time -l`): 22,4–36,2 s → 20,3–36,5 s (nejlepší běh
  22,4 → 20,3 s, CPU 27,6–32,3 → 24,5–29,5 s), cykly 88,8–96,0 → 79,2–86,9 mld. (≈ −10 %).
  Zkoušeno bez úspory (počet instrukcí i cyklů sítě beze změny nebo horší, zahozeno): Floydovo
  prosévání haldy, `quantizedStep` přes `floor` a násobení kvantem, vnitřní buňky hledání bez
  hlídání okraje. **Cíl < 10 s splněn není** – hledání sítě pěšin je ≈ 70 % přepočtu a bit po
  bitu ho zrychlit neumím. Návrhy Clauda (mění výsledek, jen na pokyn): (a) přepočet mapy tras až
  1. dne dalšího měsíce (změny měsíce najednou) – Vlkov 9 → 6 přepočtů, ≈ −5 s (−25 %); (b) jedno
     kolo hledání místo dvou (`PASSES` 2 → 1) – hledání −50 %, ≈ −5 s, pěšiny se slévají jen
     v rámci kola; (c) hrubší mřížka sítě pěšin (`PATH_GRID_PER_TILE` 4 → 3 – buněk −44 %, hledání
     ≈ −40 %, ≈ −4 s; nová verze tras, pěšiny ve scéně hrubší); (d) silnější odhad A*
     (`A_STAR_WEIGHT` 0,5 → 1) jen −8 % instrukcí sítě – nevyplatí se.
     Souběžné požadavky téhož hráče dopočet nezdvojují: web je řadí do fronty (`apps/web/lib/exclusive.ts`,
     web-ui.md – Jeden dopočet vsí naráz), druhý jen dopočte zbytek do svého dne.

  **Kolo 5 (8. 11. 2026, mění výsledek):** Martin k [rešerši modelů pěšin](../design/research/2026-11-08-trail-models.md)
  – otázka 1 „Ano“, 2 „A“, 3 „a“, 4 „a“ (zatím ne). Síť pěšin **„pole z domu“** – v kole
  domácnosti po sobě (`householdOrder`), každá jedno Dijkstrovo hledání z brány ke všem svým cílům
  (`routeHome` v `network-search.ts`), šlape se po domácnosti, dvě kola, cíle v jiné souvislé
  oblasti vyřazené předem (`passableAreas`), bez A*; pochůzky dál s pěšinou souseda
  (`ErrandTrail`, `GOAL_SLACK`). Stávající vsi bez převodu – nové trasy s příštím přepočtem
  (`WALK_VERSION` beze změny). **Přepočet mapy tras 1. dne dalšího měsíce**
  (`refreshWalkDistancesSteps` – mimo 1. den jen převážení obsazenosti; hned jen ves bez platných
  tras a oprava / přestavba cest s `now`). `PASSES` zůstává 2. Stálá síť Vlkova (stav 8. 11.):
  2,1–2,4 s → 0,42–0,66 s (≈ 4×, zátěž 74–92), délka viditelných pěšin 3 092 → 3 104 m, objížďka
  1,379 → 1,378 (max 3,51), rozdíl 4 / 5 buněk z 709, žádná dál než 1 buňku (Jaccard 0,99); bez
  cest a vyšlapanosti (čistý vznik) 3 152 → 3 156 m, objížďka 1,266 → 1,261, 102 / 104 buněk
  jinde, 19 / 21 dál než 1 buňku (Jaccard 0,75). Přepočtů za rok 9 → 6 (vždy 1. den měsíce –
  června, listopadu, ledna, března, dubna a května). Rok Vlkova třikrát střídavě před / po (stroj
  silně vytížený, zátěž 92–147): 48,5 / 49,7 / 20,3 s → 26,9 / 27,6 / 10,7 s, CPU 25,4–28,3 →
  15,5–18,2 s, cykly 80,3–85,0 → 49,6–56,1 mld. (≈ −37 %). Otisk roku `5b5fccae7d5b` →
  `195f6d4995db` – týž po dnech, vcelku i po 10, 31 a 37 dnech. **Cíl < 10 s** na nevytíženém
  stroji nejspíš splněn (nejlepší běh 10,7 s při zátěži 92); jedno kolo (návrh b) zůstává
  v záloze.

  **Kolo 6 (9. 11. 2026, přepočet tras):** Martin 9. 11. 2026: „Ok, udělejme to tak jak říkáš“
  ([paths.md – Obilné jámy a vzdálenosti chůze](../design/paths.md#obilné-jámy-a-vzdálenosti-chůze-9-11-2026),
  village-roads.md – Stálé trasy). Tři změny: otisk mapy tras jen, když je potřeba (jen zrychlení
  – otisk roku `2822763fcee9` týž vcelku, po dnech i po 37 dnech), obilné jámy mimo mapu tras
  a vzdálenosti chůze jen při jiném otisku vstupů bez pěšin (`walkDistanceKey`; obě mění výsledek
  – otisk roku `2822763fcee9` → `8a445a6b87a5`, týž vcelku, po dnech, po 10 i 37 dnech; nová ves se
  správcem 5 let `5fb911255c48` → `c24778b28a59`). Stav Vlkova z DB 9. 11. (39 lidí), skripty
  mimo repo (`scratchpad/prof9`, `prof9-route`), střídavě před / po po dvou bězích. **Rok 1
  (se zahřátím mezipamětí a JIT):** vcelku 9,03 / 9,10 s → 8,71 / 8,75 s (zátěž 9,0 → 6,6), po
  dnech 10,76 / 10,91 s → 10,73 / 10,69 s (zátěž 6,5 → 5,0). **Zahřáté roky 2–4** (`years.mts`,
  zátěž 4,0 → 3,3): 5,23 / 6,44 / 5,34 a 5,17 / 6,22 / 5,38 s → 5,02 / 6,46 / 5,45 a 4,96 / 6,02 /
  5,02 s (průměr 5,63 → 5,49 s, −2,5 %). Přepočty tras v roce 1: před dny 1. 10. (jen jámy),
  dále 1. 11. a 1. 2.; po dny 1. 4. (jednorázově – jiný otisk mapy bez jam a ves bez
  `walkDistanceKey`, den 1,7 s), dále 1. 11. a 1. 2. V rocích 2–4 se jámy nemění a dny přepočtu
  jsou před i po tytéž (každý rok 1. 11. s pařezy, v roce 3 navíc 1. 1. a v roce 4 1. 3. – jiná
  cesta). Vzdálenosti se po změně přepočítaly při **každém** přepočtu tras roků 1–4 (5 z 5 po
  převodu): přepočet tras s nimi vždy přišel se skutečnou změnou vstupů – díly pole 10 přestaly
  být zarostlé (9–28 dílů, jednou 50 nově zarostlých) a zkracuje se vozová cesta 1350 (71 → 42
  bodů osy za tři roky, jiné olemování). Úspora vzdáleností se tak ve Vlkově zatím neprojeví;
  projeví se ve vsích, kde přepočet spustí ohrada, hřbitov, posvátné místo nebo pařezy bez změny
  polí a cest. Bez zarostlých dílů v otisku (rychlost chůze přes díl – změna pravidla, jen na
  pokyn) by roky 2–4 ušetřily 3 z 5 měření (≈ 0,2–0,3 s každé).
  **Zarostlé díly mimo otisk vzdáleností** (Martin 9. 11. 2026: „Ano, vynech je“): otisk roku
  Vlkova `8a445a6b87a5` → `39ed37c46b1c` (rok 1 – stejné dny měření, liší se jen text
  `walkDistanceKey` ve stavu; týž vcelku, po dnech i po 37 dnech), nová ves se správcem 5 let
  `c24778b28a59` → `1d4bf0017c43` (týž vcelku i po 37 dnech). Měření vzdáleností v rocích 2–4
  5 → 2 (odpadla všechna 1. 11., zbyla 1. 1. v roce 3 a 1. 3. v roce 4 – jiná cesta), rok 1 beze
  změny (1. 4. převod, 1. 11. a 1. 2. jiná cesta); den přepočtu 1. 11. 0,6–0,7 → 0,5 s. Zahřáté
  roky 2–4 (`years.mts`, střídavě před `d9f61153` / po, zátěž 7,9 → 4,1): 4,94 / 5,98 / 5,11
  a 4,89 / 6,10 / 5,17 s → 4,76 / 5,93 / 4,93 a 4,88 / 6,08 / 5,11 s (průměr 5,37 → 5,28 s,
  −1,7 %); rok 1 8,66–8,70 → 8,68–8,82 s (v šumu – v roce 1 se nic neušetří).

- **Čísla** pravidel jsou jen v `rules*.ts` (u každého odkaz na sekci návrhu); změna čísla = i
  text v návrhu. Kalibrace: `measure-village.ts` nasimuluje stovky vsí a vypíše cíle z Kalibrace
  obou dokumentů s OK / MIMO (`--quick` = 50 vsí na denní ladění, `200 60` závěrečné ověření,
  `100 1000` vymření do roku 1500). Vsi stojí na skutečných krajinách sídel (`--land real`,
  vrstvy `CURRENT_LAYER_VERSIONS`; hráč zakládá čtverce podle úrody za člověkoden –
  `scripts/lib/calibration-land.ts`), `--land v1` je syntetická louka 35 ha ze starších měření;
  sondy pevných domácností běží vždy na syntetické louce s úrodností 70. Běží na pozadí (nice 19,
  polovina jader, `--workers N`, `--eco` jen úsporná jádra – ≈ 6× pomalejší) a s
  `--out soubor.jsonl` si hotové vsi ukládá – přerušený běh (Ctrl+C) stejný příkaz dokončí, po
  změně pravidel nový soubor; `--report-only` vypíše tabulku z hotových vsí bez počítání (i u
  běhu, který stojí). Varianty pravidel jen pro kalibraci: `--variant meadow-burn` (pálení
  drnu). Řádek **Práce – hráč staví** sčítá rozdělení práce dne po skupinách (volná práce, pole,
  seč, porážka, denní minimum – hráč, který staví, se proto dopočítává den po dni – `trackLabor`).
  Řádek **Vojvodova rodina a koně** (`scripts/lib/lord-columns.ts`, `addLordStep` po každém kroku,
  od 3. roku vsi): podíl rodiny na kapacitě vsi, čd výcviku a pole za rok, průměr koní, obilí koní
  (kg ročně), dny šetření jídlem a dovednosti mužů (luk, boj, jízda). `addLabor` dál počítá
  kapacitu vsi včetně rodiny. Ve starších kontrolních bodech sloupce chybí (řádek se nevypíše).
  Ustálený stav bez simulace (osev, pole, práce po měsících, špičky, zásoby, dřevo, sad)
  okamžitě: `village-calculator.ts` (jádro `scripts/lib/steady-state.ts`). Kopii stavu na začátku
  `advanceVillage` dělá `cloneState` (`clone.ts` – ručně, stav jsou data jako v JSON) a stavby polí
  hledají zakládané díly v indexu po polích – obojí kvůli rychlosti, výsledky stejné. Stejně
  kopírují stav akce staveb (`actions.ts` – obydlí, dílna, pole, hřbitov, sad, posvátné místo,
  humno; `startRoadUpgrade`, `startTrail`, `startWagonRoad`, `startRoadApples`, `startPen`)
  – `structuredClone` celého stavu byla u velké vsi polovina času dne správce (2. 11. 2026). **Záznamy
  v `clearedObstacles`, `felledTrees`, `chronicle` a body pevných cest se nemění na místě** – kopie
  stavu je sdílí (kopíruje jen seznamy); změna záznamu = nový objekt na jeho místě (`plantOnStump`,
  `mergeHaySlaughter`, `mergeFields`). V testech je hlídá `freezeSharedRecords` (`src/test-setup.ts`
  – sdílené záznamy zmrazí, zápis spadne).

- **Meze produktivity** (Martin): čísla s rozpětím v literatuře jsou v `rules*.ts` dvojice
  `{ worst, best }` – **nejhorší mez** (nejvíc člověkodní, nejvyšší ztráty – bez řemesel)
  a **nejlepší mez** (plně pokrytá potřeba výrobků řemeslníků); řemeslníci zvyšují produktivitu
  = snižují pracnost od `worst` k `best`. V textech nepsat „horní / dolní mez“.
  Hodnotu podle pokrytí 0–1 dávají funkce v `productivity.ts` (`withinBounds`, `fieldWorkPerHa`,
  `storageLossPerYear`…). Pokrytí počítá `craftCoverage` (crafts.ts) ze zásob vsi na začátku
  dne v `simulate.ts`; `NO_CRAFTS` (pokrytí 0) jen pro ves bez řemesel a testy. Zdroje čísel
  jsou v rešerších `docs/design/research/`.

- **Založení vsi:** dokud ves není, mřížka nabízí jen zemnici – její umístění ves založí
  s navrženým jménem (`suggestVillageName`). Pole není podmínkou. Zemnici si osadníci teprve
  postaví (stavba s `dwellingId` = id jejich domácnosti; do dostavění bydlí na staveništi, pak
  se nastěhují – `finishConstructions`). Domácnost = `Person.dwellingId`, i když obydlí ještě
  nestojí (`householdCount` v `simulate-plan.ts`, porody po domácnostech). Starší uložené vsi se
  zemnicí od založení se dopočítají beze změny.

- **Les a dřevo** ([forest.md](../design/forest.md), `domain/village/wood.ts`): klády na hromadě
  (`woodLogs`, staré vsi 0, hnijí 4 % ročně), obydlí, první zemnice i přestavby berou dřevo
  (`DWELLING_TREES` 7 / 18) nejdřív z hromady, zbytek vyhradí při zahájení mezi nejbližšími
  dospělými stromy (`planDwellingWood`, bez stavu vsi `planDwellingWoodFrom` s `WoodSource` – cena
  u kurzoru; `nearestMatureTrees` – hledá po políčkách) a kácí je jako
  první část práce stavby (`fellAsWorked` → pařezy). Simulace proto povinně dostává vrstvu
  překážek (`advanceVillage(state, day, obstacles)`; `null` = kácení bez polohy jen v testech),
  use-casy krajinu (`updateVillage`, `loadVillage`, `renameVillage`); kalibrace les skutečné
  krajiny (`--land v1` syntetický). Vyhrazený strom patří své stavbě: mýcení za něj kládu nedá (`reservedTrees`
  v `PlacementVillage`) a stromy zakládaných dílů a čtverců hřbitova obydlí nevyhradí
  (`claimedObstacles`). Dospělé stromy lesa vsi (fields.md – Les vsi) se kácí jako stromy krajiny.
  Mýcení (díly polí, čtverce hřbitova, staveniště) dá kládu za dospělý
  strom (`trees` u dílu / čtverce). **Hromady klád u cesty** (forest.md – Mýcení a hromada klád;
  Martin 8. 11. 2026; `logStacks` – `LogStack` s místem a počtem, Σ = `woodLogs`): každé mýcení
  volá `addLogs(state, logs, at, fieldId?)` s místem kácení `at` (střed čtverce – `partCenter`,
  `orchardSquareCenter`, čtverec hřbitova; staveniště, milířiště, prostředek průseku či úseku
  vozové cesty; `null` = klády odjinud – obchod, dávky vazalů – u `logArrivalPoint`: dvorec, první
  obydlí). Místo nové hromady `logPilePlace` (`log-piles.ts`, deterministická vrstva):
  `nearestRoadPoint` – nejbližší bod os `state.roads.roads` bez `abandoned` (při shodě dřívější
  cesta a úsek), do `LOG_PILES.roadReachM` (60 m) hromada `roadSideM` (6 m) od osy na straně
  místa kácení s `road` = bod osy (místo kácení na ose – vlevo od směru úseku), jinak `at` bez
  `road`; na cm. Klučení pole (`fieldId` > 0) skládá na svou hromadu, dokud leží; jinak se doplní
  hromada do `LOG_PILES.joinM` (10 m, bližší, pak menší id), jinak nová. Místo se už nemění.
  Kácení stavby, když hromady nestačí, jde rovnou do stavby (`fellAsWorked`) – hromadu nezakládá.
  Odběr staveb, tesaře a prodeje jen přes `takeLogs` (od hromady nejbližší k `near`, bez něj od
  nejmenšího id; pak klády bez hromady a neceločíselné zbytky; `dropSpentStacks` – hromada pod
  půl klády zmizí a zbytek přejde na nejbližší, která zůstane), hnijí stejně (`rotLogs`). Klády
  bez hromady (`pileLogs`) má jen ves před převodem: `withRoadLogPiles` (`log-piles-migration.ts`,
  v `updateVillage` po `withForestClearing`, s krajinou) z nich jednou udělá hromadu u obydlí
  nejblíž okraji lesa (obydlí i staveniště obydlí, při shodě menší id – jako `logPileSite`) s
  `dwellingId`, idempotentně (po převodu `pileLogs` = 0). Dřevo je surovina předem (`villageStock` s vrstvou překážek:
  klády + stromy, které jde skácet – počet stromů vrstvy v mezipaměti). Palivo je v domácí výrobě
  bokem – přirážka za les daleko zmizela (`forestDistanceM` / `forestWalkM` se dál měří). Scéna: hromady klád `lib/scene/log-pile.ts` (místo
  a hranice v `log-pile-layout.ts`, bez volného místa se nekreslí) – `SceneVillage.logStacks`
  hromady v celých kládách s `road` a `dwellingId` (místo `logStackSite`: hromada u cesty nejdřív
  přesně na místě z jádra, čely klád k cestě, pak po kružnicích; s `dwellingId` `logPileSite` u toho
  obydlí – bývalá hromada u vsi na dnešním místě, kreslí se první), `SceneVillage.woodLogs` klády
  bez hromady (ves před převodem, u obydlí nejblíž lesu); viz `docs/code/scene.md` – Paseka klučení; staveniště ukazuje průběh bez
  kácení (`buildProgress`).

- **Upozornění** (`lib/village-notices.ts`): rodina čeká na dům (fakt), stupně hladu (šetří
  jídlem, hladoví, umírají hlady – jen nejvyšší), nouzová porážka,
  stojící stavby, plný hřbitov (žádný hotový nemá volný hrob), vesničané ušetřili posvátný dub
  / dubový háj, svatba, nevěsta a ženich z okolí a dcera vdaná pryč, přišla rodina / muž / žena od souseda
  (`newcomer` – trade.md, Výměna lidí) (fakt, když přibude – svatba podle
  `VillageView.lastMarriageDay`), podzimní porážka, spřežení vycvičené / dosloužilo, vůl
  uhynul, vesničané obnovují starý sad a starý sad dosloužil (nové události kroniky –
  `VillageView.chronicle[].kind`, `CHRONICLE_NOTICES`) – nově vzniklé jako krátký mizející
  řádek nahoře, žádný trvalý seznam; vymřelá ves žádná. Kronika je jen v DTO.

- **Krajina sídla** se na serveru drží v LRU mezipaměti (`packages/server/src/landscape-cache.ts`, port
  `LandscapeSource` v `enterGame`) – negeneruje se při každé akci a dotazu. Vrstva překážek
  se generuje až pro stavby (`obstaclesOf`, mezipaměť podle objektu krajiny); dotaz na ves
  (`getVillageView`) ji potřebuje jen při prvním načtení vsi založené před vrstvou (doplnění
  odstraněných překážek, ≈ 300 ms jednou).

- **Překážky ve vsi** (`domain/village/obstacles.ts`, fields.md – tabulka překážek): obydlí
  platí překážky na vyklízené ploše (`DWELLING_CLEARING_M` = staveniště scény) po kusech (les za
  sazbu lesa – Stavba v lese),
  skalní výchoz pod půdorysem stavbu nedovolí; díl pole platí překážky v políčku jen mimo
  sazbu povrchu (`tallyCost`, `SURFACE_INCLUDED_OBSTACLES` – v lese stromy a podrost v ceně,
  v křovinách keře), výchoz zůstane a plocha pod ním se nepočítá; čtverec hřbitova
  platí překážky jako díl pole, ale výchoz ho zablokuje (hroby jdou v pevné mřížce). Kontroly
  (`checkDwellingPlacement`, `fieldPartsFromCells`, `cemeteryPartsFromCells`) berou vrstvu
  výchozím parametrem `obstaclesOf(landscape)` a vrací `obstacleCost` a id; v prohlížeči i na
  serveru stejně. **Odstranění:** obydlí (i první zemnice při založení vsi) při zahájení
  stavby, díl pole až po založení (`FieldPart.obstacles`), čtverec hřbitova až s dostavěním
  hřbitova nebo rozšíření (`CemeterySquare.obstacles`) → `VillageState.clearedObstacles`. Pokácené stromy (`felledTrees`) nechají pařez a dorostou
  (`TREE_REGROWTH_YEARS`). Pomocníci pro les a dřevo: `matureTreesByDistance`, `fellTrees`,
  `treeRegrowth`, `countMatureTrees`, `obstacleChangesAt`. Vsi z doby před vrstvou si
  odstraněné překážky doplní při načtení s krajinou (`withObstacleClearing` v `updateVillage`).

## Spící vsi se kvůli dni neukládají

`isVillageAsleep` (`departure.ts`) = vymřelá nebo opuštěná (odpovídá sloupci `asleep`; ves na cestě
nespí, čeká na správce). `advancedToToday` u ní nic nesimuluje: jen převody z `advanceVillage` bez
posunu dne, a když nic nezmění (JSON shodný), vrátí týž objekt – `updateVillage` ji pak neuloží
(`untouched`). `lastDay` spící vsi zaostává; `abandonedVillageAt` ho v pohledu zvedne na den
pohledu, `currentVillageViewStamp` spící vsi s `lastDay < dnes` ignoruje.

## Deník vsí (`village_year`)

Martin 1. 11. 2026: „na tohle asi ser, podle mě bude stačit logovat hru“ (místo velkého měření správce). Za každou ves a dokončený herní rok jeden řádek – `villageYearRow(stav)` v `domain/village/year-log.ts` (čistá funkce nad stavem na konci roku: lidé dospělí/děti, narození a úmrtí z kroniky roku, z toho hladem, sklizeň, zásoby, dny hladu, pole a oseto (skutečně zasetý podíl prací hospodářského roku – `sownShare` × výměra dílů práce; od 6. 11. 2026, dřív díly ve stavu `sown` už od výběru do plánu), stáda, správce zapnutý, dostavěné stavby podle druhu, odchody synů, pohromy).

- `updateVillage` dopočítává po kouscích končících na přelomu roku (`nextYearEnd`; stav je týž jako bez dělení) a řádky předá `VillageRepository.save(…, yearRows)`; adaptér je zapíše v téže transakci jako stav (`ON CONFLICT (village_id, year) DO UPDATE` – opakovaný zápis řádek přepíše). Worker i web jdou stejnou cestou. Cena zápisu: jeden upsert za ves a rok, v měření v řádu jednotek ms na save (v šumu).
- Počty událostí se čtou z kroniky (max. 500 událostí) – při přetečení je `chronicleFull` a počty jsou dolní odhad. Nejnižší zásoby za rok se nesledují (stav na konci roku jen).
- Spotřeba obilí není ve stavu: příkaz ji dopočítá jako zásoby loni + sklizeň – zásoby letos (jen když je řádek loňska). Dostavěné stavby jsou všechny, ne jen správcovy.
- Výpis: `npm run village-log -- --village <id|jméno> [--player <id>] [--from rok]` (bez filtrů všechny vsi; `DATABASE_URL` jinak `bohemia`).
