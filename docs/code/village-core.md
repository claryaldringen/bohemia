# Ves – jádro simulace, práce, hlad, štěstí, les

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: population.md, fields.md, happiness.md, forest.md v `docs/design/`.

- **Jádro** `packages/game/src/domain/village/` (simulace, umístění `placement.ts` (rozcestník, kontroly v `placement-<téma>.ts`), souhrn
  `summary.ts`), use-casy a port `VillageRepository` v `application/`, tabulka `village`.
  Ves se dopočítá při každém načtení a akci (worker zatím není).

- **API jádra:** `foundVillage` (4 lidé, zásoby, stavba první zemnice, volitelně první pole),
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

- **Pořadí práce dne** (population.md a fields.md – Práce; Martin 19. 10. 2026: „pokud se něco
  staví, tak čas věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla
  hlad“): pracovní síla vsi = dospělí (`laborPerDay`); starší kryjí jen denní minimum své
  domácnosti (`adultDailyMin`, `householdElders` – přebytek propadne), výrostci 7–13 let pasou.
  Denní minimum domácnosti nese **přirážku za chůzi pro vodu** (paths.md – Pochůzky pro vodu,
  Martin 19. 10. 2026): `householdWaterLabor` / `waterFetchingLabor` z `Dwelling.waterWalkM` –
  cesty (`WATER_FETCHING` 0,4 na člověka) × 2 × (chůze − 100 m) ÷ 1 m/s ÷ 10 h; starší ji kryjí
  jako zbytek minima, i v plánu osevu (`sowingCapacity`) a v dílnách (`workshopLabor`); bez
  krajiny 0. `allocateDay`: denní minimum → péče o koně (`horseCare` – `horseCareLabor`, horses.md – Péče; pokrytí v `state.horsesCaredToday`) → výpravy (`away`) → potřebné sezónní úlohy v pořadí `dayTaskOrder` – **orba rádlem první** (oxen.md – Orba má přednost, Martin 24. 10. 2026; překrývá se jen s osevem, výmlatem jaře a jablky, žeň ne), pak nejbližší konec okna (žeň a výmlat napřed ze žňových rukou – `harvestHands`, `lordHarvest`, fields.md – Žně všemi rukama) → `common` (volná práce
  v liště, `commonLaborHistory`) do staveb (`build`) → z toho, co stavby nespotřebovaly, opravy
  obydlí (`afterConstructions`) → osev navíc (fields.md) → **seč navíc** pro růst stád (oxen.md –
  Seno, dvě seče; `extraMow`) → zbytek propadne. **Seč nutného sena** je úloha dne `mow` za
  všemi ostatními (`end: Infinity`, `tie: 3`) – polním pracím práci nikdy nebere (kromě pletí
  mužů, které jde až za ní), stavbám ano. Zvířata a domácí výroba (`DOMESTIC`) jdou bokem – jen `LaborDay.aside` pro postavy;
  `domesticBacklog` a přirážka paliva zmizely (starší vsi pole jen nesou). Úlohy dne berou práci
  ze zásobníků v pořadí **`weedChildren`** (děti 7–13 let, které nepasou, jen pletí –
  `weedingChildren` v harvest-hands.ts, `WEEDING_CHILDREN` 0,5 čd; fields.md – Pletí – děti) →
  **`light`** (ženy řemeslníků, jen lehké úlohy) → u pletí **ženy vsi** (`weedWomen` – podíl žen
  na práci vsi; pletí je bere napřed, i před úlohami dřív v pořadí) → **`lordField`**
  (vojvodova rodina na poli při hladu, jen úlohy dne, nikdy stavby; co nevyužije, propadne) →
  obecná kapacita. **Pletí mužů až za ostatními úlohami dne** (fields.md – Pletí jednou a rychle):
  co děti a ženy nedoplejí, dostane obecnou kapacitu až po všech ostatních úlohách dne včetně
  nutné seče, a jen díl, který by děti a ženy do konce okna nestihly (`weedDaysLeft`) – jen
  v tom se pořadí úloh dne liší. **Cvičící vojvodova rodina** (lord.md) je mimo `villagers` jako dílny; minimum
  dvorce kryje sama (`manorLabor`, domácnost dvorce je ve `householdElders` / `householdWater`
  vynechaná přes `skip`), co nepokryje, jde z práce vsi jako `manorMin`. `DayAllocation.lordField`
  = spotřebovaná práce rodiny; `work()` vrací podíl `lordField` pro `trainLordDay`.

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
  `BUILD_COSTS`, `buildAffordability`): suroviny ze zásob (dnes žádné) a u obydlí **lidé
  k osídlení** (`settlers` = `availableSettlers` v `households.ts`: možné nové domácnosti
  `possibleNewHouseholds` − prázdná − rozestavěná nová obydlí); pole a hřbitov lidi nechtějí.
  Tlačítko je pak zašedlé, zkratka nic nespustí, v popisku chybějící část červeně; server odmítne
  (`NO_SETTLERS`, `CANNOT_AFFORD`). `waitingHouseholds` (upozornění „Rodina čeká na dům“, dřív
  „Domácnost je plná“; `VillageSummary.fullHousehold`) = kladní lidé k osídlení.

- **Determinismus:** simulace jde den po dni v pevném pořadí kroků (`simulate.ts`), náhoda dne
  je ze seedu vsi a indexu dne – výsledek nezávisí na tom, po jakých kouscích se ves dopočítá.

- **Dopočet po kouscích na serveru:** `advanceVillageSteps` je `advanceVillage` po dnech
  (generátor – tatáž smyčka, stav se klonuje jednou). `loadVillage` / `dynastyStatus` dostanou
  port `Pause` (`application/villages.ts`) a mezi dny se ptají, jestli počkat; web
  (`lib/compute-pause.ts`, v `dynastyDeps`) po ≈ 50 ms počítání v kuse pustí přes `setImmediate`
  ke slovu ostatní požadavky – dopočet po dlouhé nepřítomnosti nebo přeskok o 10 let neblokuje
  server (jedno vlákno). Jeden drahý den (přepočet sítě pěšin) se nedělí. Výsledek na
  přestávkách nezávisí (test v `villages.test.ts`).

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
  hledají zakládané díly v indexu po polích – obojí kvůli rychlosti, výsledky stejné.

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
  strom (`trees` u dílu / čtverce). Dřevo je surovina předem (`villageStock` s vrstvou překážek:
  klády + stromy, které jde skácet – počet stromů vrstvy v mezipaměti). Palivo je v domácí výrobě
  bokem – přirážka za les daleko zmizela (`forestDistanceM` / `forestWalkM` se dál měří). Scéna: hromada klád `lib/scene/log-pile.ts` (místo
  a hranice v `log-pile-layout.ts`, bez volného místa se nekreslí), staveniště ukazuje průběh
  bez kácení (`buildProgress`).

- **Upozornění** (`lib/village-notices.ts`): rodina čeká na dům (fakt), stupně hladu (šetří
  jídlem, hladoví, umírají hlady – jen nejvyšší), nouzová porážka,
  stojící stavby, plný hřbitov (žádný hotový nemá volný hrob), vesničané ušetřili posvátný dub
  / dubový háj, svatba, nevěsta a ženich z okolí a dcera vdaná pryč, přišla rodina / muž / žena od souseda
  (`newcomer` – trade.md, Výměna lidí) (fakt, když přibude – svatba podle
  `VillageView.lastMarriageDay`), podzimní porážka, spřežení vycvičené / dosloužilo, vůl
  uhynul, vesničané obnovují starý sad a starý sad dosloužil (nové události kroniky –
  `VillageView.chronicle[].kind`, `CHRONICLE_NOTICES`) – nově vzniklé jako krátký mizející
  řádek nahoře, žádný trvalý seznam; vymřelá ves žádná. Kronika je jen v DTO.

- **Krajina sídla** se na serveru drží v LRU mezipaměti (`lib/landscape-cache.ts`, port
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
