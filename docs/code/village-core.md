# Ves – jádro simulace, práce, hlad, štěstí, les

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: population.md, fields.md, happiness.md, forest.md v `docs/design/`.

- **Jádro** `packages/game/src/domain/village/` (simulace `core/`, umístění `placement/placement.ts` (rozcestník, kontroly v `placement/placement-<téma>.ts`), souhrn
  `core/summary.ts`), use-casy a port `VillageRepository` v `application/`, tabulka `village`.
  Ves se dopočítá při každém načtení a akci (mezitím ji posouvá worker – `docs/code/worker.md`).

- **Složky jádra** (11. 11. 2026, návrh Clauda – rozdělení podle oblastí mapy kódu a shluků
  importů; veřejné API je dál jen barel `domain/village/index.ts`). Testy leží v `__tests__`
  složky, kterou testují; v kořenovém `village/__tests__/` zůstaly jen fixtures sdílené víc
  oblastmi (`village-fixtures.ts`, `placement-fixtures.ts`, `paths-fixtures.ts`, `kin-fixtures.ts`,
  `horse-fixtures.ts`, `abandonment-fixtures.ts`).

  | Složka                 | Co v ní je                                                                                                        | Dokument                    |
  | ---------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------- |
  | `core/`                | `simulate*.ts` (pořadí dne), `migrations.ts`, `clone.ts`, `actions.ts`, jídlo a strava, práce, upozornění, souhrn | `village-core.md`           |
  | `rules/`               | všechna čísla pravidel `rules-*.ts`, barel `rules/index.ts` (dřív rules.ts)                                       | podle tématu                |
  | `types/`               | typy stavu `types-*.ts`, barel `types/index.ts` (dřív types.ts)                                                   | podle tématu                |
  | `fields/`              | pole, osev, osevní postup, len, zahrádka, žně, výmlat, obilní jámy, osivo                                         | `village-fields.md`         |
  | `livestock/`           | stáda, seno, ohrady, voli a koně, orba, mléko, vlna, potřeba tažných zvířat                                       | `village-livestock.md`      |
  | `people/`              | lidé, příbuzenství, domácnosti, sňatky, rod a vojvoda, dvorec, víra a posvátná místa, štěstí, pohřby, odchod      | `village-people.md`         |
  | `crafts/`              | dílny, kovář, uhlíř, hrnčíř, tesař, vozy, nákup u sousedů                                                         | `village-crafts.md`         |
  | `trade/`               | obchod, zemská stezka, trh ve vsi (ceny, zápočet, výpravy na trhu), výměna lidí a dobytka, počasí obchodu         | `village-trade.md`          |
  | `buildings/`           | stavby, obydlí, chátrání a oprava, bourání, hřbitov, sad, pole a sad pod stavbou                                  | `village-buildings.md`      |
  | `placement/`           | umisťování staveb `placement*.ts`, geometrie (`polygon.ts`, `squares.ts`, `square-grid.ts`, `plot-cells.ts`)      | `village-buildings.md`      |
  | `roads/`               | vylepšení cest, vozová cesta, jabloně a stromy u cest, cesta přes pole                                            | `village-roads.md`          |
  | `paths/`               | síť pěšin a vozová síť (deterministická vrstva)                                                                   | `village-roads.md`          |
  | `steward/`             | správce vsi, založení vsi                                                                                         | `village-steward.md`        |
  | `wildlife/`            | divoká zvěř, lov, psi, hlídky polí                                                                                | `village-wildlife.md`       |
  | `disasters/`           | počasí, sníh, povodně, kroupy, vichřice, požár, ochrana dílu                                                      | `village-disasters.md`      |
  | `forest/`              | les a dřevo, klučení, hromady klád                                                                                | `village-core.md`           |
  | `fortification/`       | obvod, úseky, brány a obrana opevnění (deterministická vrstva)                                                    | `village-fortifications.md` |
  | `fortification/state/` | stavba a vylepšení opevnění ve stavu vsi, val, kámen a lom, útočiště                                              | `village-fortifications.md` |

  `rules/` a `types/` drží pohromadě schválně: čísla pravidel mají jedno místo (kalibrace i návrh
  na ně odkazují), barely `rules` a `types` importuje skoro každý soubor vsi a `types-state.ts`
  skládá stav ze všech oblastí. Deterministická vrstva (seznam v kořenovém eslint.config.mjs) je
  v `paths/`, v kořeni `fortification/` (bez `state/`) a v souborech `placement/square-grid.ts`,
  `buildings/dwelling-shape.ts`, `forest/log-piles.ts` a `steward/` `steward.ts`,
  `steward-extras.ts`, `steward-land.ts`, `steward-plan.ts`, `steward-rebuild.ts`.

- **API jádra:** `foundVillage` (4 lidé, zásoby – zakladatelé s vojvodou `FOUNDERS_STORES`: jídlo `foodYears` + osivo `seedYears` roční potřeby, osivo jako `reservedSeedKg` s lhůtou `reservedSeedUntilDay` = den založení + `seedKeepYears`; `seedReserveDay` ji 1. 6. ani 1. 12. před lhůtou neuvolní, jen ve skutečném hladu; `takeSeed` na ni sáhne, až když běžné zrno nad `keepKg` nestačí (village-fields.md – Osivo pro ves bez zásob); ves, která šetří (`hungry`), ji v lhůtě zkrátí na `foundersSeedKeepKg` (seed-reserve.ts – osivo na díly na řadě příštího okna, `windowSeedNeedKg`); `fieldStoresOutlook` ji v lhůtě nepočítá za jídlo – `keptSeedKg`, seed.ts; ves bez rodu `START_STORES_MONTHS` + `START_SEED_YEARS`, ves z výpravy svůj náklad –, stavba první zemnice, volitelně první pole),
  `advanceVillage(state, toDay)` (dopočítá ves do dne včetně) a akce hráče `startNewDwelling`,
  `startWorkshop`, `foundField`, `foundCemetery`, `foundOrchard`, `foundPen` a `startTrail`;
  spřežení se cvičí samo (`trainTeamsWhenReady`). Stav
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
  bere ze zbytku společné práce (`afterBuild.left`), co zbude, jde dál (seč navíc).
  Ves bez opevnění nebo bez krajiny: žádný krok nic nemění.

- **Pořadí práce dne** (population.md a fields.md – Práce; Martin 19. 10. 2026: „pokud se něco
  staví, tak čas věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla
  hlad“): pracovní síla vsi = dospělí (`laborPerDay`); starší kryjí jen denní minimum své
  domácnosti (`adultDailyMin`, `householdElders` – přebytek propadne), výrostci 7–13 let pasou.
  Denní minimum domácnosti nese **přirážku za chůzi pro vodu** (paths.md – Pochůzky pro vodu,
  Martin 19. 10. 2026): `householdWaterLabor` / `waterFetchingLabor` z `Dwelling.waterWalkM` –
  cesty (`WATER_FETCHING` 0,4 na člověka) × 2 × (chůze − 100 m) ÷ 1 m/s ÷ 10 h; starší ji kryjí
  jako zbytek minima, i v plánu osevu (`sowingCapacity`) a v dílnách (`workshopLabor`); bez
  krajiny 0. **Skladba dne podle období** (population.md – Skladba dne podle ročního období;
  `day-chores.ts` – `dayChores`, `DayChores`, `DAY_CHORES`): žňový den (`harvestHandsDay`)
  `HARVEST_CHORES` – minimum × 0,5 a bez vody (`allocateDay` – `minimumShare`, `harvestHelperLabor`
  vždy, dílny, dvorec); listopad–březen dříví – `woodFetchingLabor` z `Dwelling.forestWalkM` v
  `HouseholdWater.wood` (vůz s vodou ho neušetří, `work()` ho přičte k vodě domácnosti); když leží
  sníh (`snowLies` – `snow.ts`, týž výpočet jako scéna, zima roku z `weatherOf`), voda 0 – vozy pro
  vodu nejedou. Minimum domácnosti podle období počítá `householdMinimum` (dvorec – `manorLabor`
  s `chores`, dílny – `workshopLabor`). Plán: okna setí letní skladba (`SUMMER_CHORES`), žně
  `HARVEST_CHORES` (`freeLabor` s `chores`), čelo práce dnešní. `freeLabor` bere lidi `planVillagers`
  (`morning-water.ts` – bez trvale nepřítomných `isAway`, mistrů huti a kněze `isLodgeIdle`, lidí na
  cestě pro kování `ironTravellers`; D102 kolo 2) – tytéž jako `villagersToday`, které k nim přidá
  denní vyřazení (dílny, rodina, lov, požár). **Délka dne**
  (`daylight.ts` – `daylightFactor`, `DAYLIGHT_WORK`; lineárně mezi polovinami měsíců):
  `allocateDay` – `daylight` násobí `left` po kování, výpravách a vozech pro kováře a zásobníky
  `light`, `harvestHands`, `weedChildren`, `lordHelp`, `lordSowing` (strop `lordFree`) a práci žen při pletí
  (kdo z rodiny byl na poli, převede zpět na lidi na celý den `lordFieldSharesToday`); `work()` násobí
  kapacitu spřežení (`teamsCap`) a robotu hostů. Plán: `sowingCapacity` a `ploughPairsForRotation`
  světlými dny oken (`windowDaylightLeft` / `windowDaylightWithout` v sowing.ts), čelo práce
  (`workFront`), ruce pro výmlat (`harvestLaborPerDay`) a tempo setí (`sowingHaPerDay`) dnešní
  délkou dne. Bez délky dne zůstávají řemeslo v dílnách, tesařova pomoc stavbám, jízdy vozu za den
  a roční odhady správce (`sacredLaborGainPerYear`, `raidLossManDays`). Rozdělení práce pro
  postavy (`laborDay`, `DayWork.daylight`) dělí venkovní podíly délkou dne – podíly jsou lidé, ne
  práce (domácnost, koně, dílny, výpravy a vozy pro kováře beze změny). Ráno každého dne
  (`advanceVillageSteps`): návraty domů (`returnHome`), vozy výprav na trh od prvního dne doma
  (`marketTripsDay` – village-trade.md, Výprava na trh), události schránky (`applyInboxDay`), hned
  po nich příjezd **cizích kupců** (`merchantsArrive` – jen ves se zastávkou dálkové stezky
  a v den plánu; village-trade.md – Cizí kupci ve vsi), **trh ve vsi** (`marketDay` – výprava
  i kupci, kteří dnes přijeli, obchodují už dnes; zápisy
  kroniky za příjezdem; village-trade.md – Trh ve vsi) a úmrtí na rány (`woundDeathsDay`). Po práci
  dne napřed hotové zakázky (`fillOrders` – před opotřebením `wearCraftStocks`; village-trade.md –
  Zakázky). Hned za rezervou osiva (`seedReserveDay`), před `work()`, vesničané na trhu
  (`villagerTripsDay` – jen ves s okolím; village-trade.md – Vesničané na trhu). Hned za `work()`
  (a `settleSowingSeed`), tedy za kováním dne `finishShoeing`, dotaz na kováře souseda
  (`askSmithDay` – jen ves s okolím; village-livestock.md – Kovář souseda). Hned za sňatky ve vsi
  (`arrangeMarriages`) dotaz na partnera v sousední vsi (`askKinDay` – jen ves s okolím, proud
  `'kin:' + den`; odpověď `kin-ask` → `answerKinAsk` je větev schránky; village-people.md – Sňatky
  – se sousedy). Před prací dne
  (`simulate.ts`): 1. 9. `startSeason`, každý den `seasonDay` (konce oken
  setí, díly na řadě a čelo práce – fields.md, Osevní postup po dílech) a `lordHelpDay`
  (podíly dne rodiny ve žních `lordHelp` a s přípravou půdy a setím `lordSowing` – D102) a 1. 5. `wildlifeYearDay` (roční přepočet zvěře; hned za ním `weatherDay` – kronika počasí kraje v den odhalení, `village-disasters.md` –, `dogsYear` smečka dvorce, W4), 1. 6. `damageWindowStart` (ohrožené díly polí pro zvěř – wildlife.md, Škody); po `lordHelpDay` `settlePatrol` (jezdecká hlídka polí, W6), po práci dne `wildlifeDamageDay` (škoda zvěře a vran na nesklizených dílech, před jídlem) dále v závěru dne `patrolHuntDay` (úlovek z hlídky), a po sklizni jaře `wildlifeSeasonEnd` (kronika, vynulování ztrát dílů – podrobnosti `village-wildlife.md`); potřebné sezónní úlohy jsou práce nutných dílů – plodiny
  hospodářského roku (`fieldTasks` – všechny díly jedna fronta, díly nad potřebu zrušené 9. 11. 2026). `allocateDay`: denní minimum → péče o koně (`horseCare` – `horseCareLabor`, horses.md – Péče; pokrytí v `state.horsesCaredToday`) → výpravy (`away`) → potřebné sezónní úlohy v pořadí `dayTaskOrder` – **pevné pořadí skupin** `DAY_WORK_ORDER` (rules-fields.ts; `dayWorkGroup` v simulate-work.ts; fields.md – Pořadí důležitosti polních prací a výmlat do zimy, Martin 9. 11. 2026): výmlat na dnešní jídlo → žeň a odnos obilí (i luštěnin) → trhání lnu (ženy a děti napřed před všemi úlohami – `womenFirst`, Martin 10. 11. 2026) → nutná 1. seč (`mow`) → nutná otava (`mow` s `DayTask.aftermath` – skupina `'aftermath'` podle `mowingCut` plánu seče; Martin 10. 11. 2026: před orbou a setím ozimu, dřív ~~až po nich~~) → porážka a uzení (`slaughter` – od 18. 11. 2026 za žní a sečí, porážka celý rok; maso je k jídlu hned, práce jen spotřebuje ruce; v zimě se nežne ani neseče, tam hned za výmlatem na jídlo; dřív ~~hned za výmlatem na jídlo~~) → sklizeň jablek → pletí → výmlat na osivo (`ThreshTask.seed`, `seedThreshKg` v seed.ts) → příprava půdy a setí (vrácení přílohu, kopání, orba, setí – **orba rádlem první** uvnitř skupiny, oxen.md – Orba má přednost; **setí zorané a zkopané půdy před vracením přílohu téže plodiny**, rank −0,5 ve `fieldTasks`; zorané je jen vyklučené – orba, kopání a setí po `tillableRemaining`, village-fields.md – Orba a setí až po vyklučení; **výsadba jabloní u cest a sadu** v oknech výsadby po orbě, kopání a setí, před vracením přílohu – `DayAllocationInput.planting` s pořadím úloh `plantingOrder` (simulate-work.ts) a prací `fruitPlantingNeed` (simulate-build.ts), Martin 22. 11. 2026; práce `DayAllocation.planting` jde v `commonWorkDay` do `plantFruit` – `build` po druzích, napřed jabloně, pak sad –, zbytek do společné práce; v rozdělení práce pro postavy je mezi stavbami) → péče o sad → noční hlídka polí (`'watch'`, wildlife.md – Noční hlídka vesničanů) → výmlat → obilné jámy → dospělý pasák; uvnitř skupiny nejbližší konec okna, `tie` a `rank` (žeň a výmlat napřed ze žňových rukou – `harvestHands`, `lordHelp`, fields.md – Žně všemi rukama) → `common` (volná práce
  v liště, `commonLaborHistory`) do staveb (`build`) – **stavby jen z dílu mužů** (population.md –
  Práce, Stavby staví muži; Martin 14. 11. 2026: „D24 ano“): `allocateDay` vrací
  `DayAllocation.build` = `menCommon` – min(`common`, venkovní práce vsi po pracích „za den“ −
  venkovní práce žen po denním minimu (`womenLabor` × štěstí − denní minimum, × délka dne));
  denní minimum a úlohy dne (i pletí a len) nesou napřed ženy a muži je doplní, jen když práce žen
  nestačí, práci „za den“ (koně, kování, výpravy, vozy pro kováře) nesou muži; bez `womenLabor`
  staví všichni. Pletí žen bere dál jen jejich práci nad `WEEDING_WOMEN.dailyMinShare`
  minima. **Honci lovu** (hunting.md – Pravidla 2; plán 2026-11-22-hunting, Úloha 3): po všech
  úlohách dne vezme `allocateDay` `DayAllocationInput.beaters` (člověkodny – `dayLabor`
  v simulate-work.ts: `hunt.beaters.men` × `LABOR_PER_DAY.adult`, jen když `hunt.beaters.day` je
  dnešek; starší rezervace zůstává ve stavu a nepočítá se) z dílu mužů na stavby –
  `DayAllocation.beaters` = min(honci, díl mužů), `common` i `build` o ně menší, úlohy dne
  (pole v oknech, žně) nedotčené; stavby a opravy den počkají. Do `commonLaborHistory` jde díl
  mužů po honcích. `commonWorkDay` dá `buildDay`
  nejvýš díl mužů (vozy s kládami a drobná zvěř hladové vsi berou ze společné práce jako dřív),
  hosté na robotě a tesař staví dál celí; posledních 30 dní (`commonLaborHistory` – lišta, rozpočet
  správce, „Stavby stojí“) je díl mužů, roční průměr (`commonLaborYearly` – doprava dávek, robota,
  přestavby) celá společná práce → z toho, co stavby nespotřebovaly (i díl žen), opravy
  obydlí (`afterConstructions`) → **pletí mužů** (`allocateDay` s `menWeedLater` vrátí jejich díl
  v `menWeed`, `work()` ho dá ze zbytku po stavbách, opravách a údržbě opevnění; `DayWork.weedMen` –
  fields.md, Osevní postup po dílech, bod 3; Martin 9. 11. 2026: „pletí obstarají ženy a děti“);
  ostatní polní práce všech dílů je úlohou dne před stavbami → **seč
  navíc** pro růst stád (oxen.md – Seno, dvě seče; `extraMow`) → **kůže a kožešiny domácností**
  (`waresWorkDay`, hides-honey.md – Zpracování v domácnosti; listopad–březen, i v hladu) – **jen
  z volné práce žen** (population.md – Práce, Stavby staví muži: „Domácí zpracování kůží a kožešin
  dělají ženy z volného času“): `commonWorkDay` předá `freeLaborDay` díl společné práce, který na
  stavby nejde (`womenFreeLabor` – `common − build` po vozech s kládami a drobné zvěři hladové
  vsi), zpracování bere nejvýš ten a nejvýš zbytek; opravy, údržba opevnění, pletí mužů, seč navíc
  a brtě berou napřed ze zbytku práce mužů (návrh Clauda), práce mužů na zpracování nejde; bez
  pohlaví (vsi před příbuzenstvím) z celého zbytku jako dřív → **ryby
  a oka vesničanů** (`smallGameDay`, W7 – ryby jen když ves chce bílkoviny, oka v zimě kdykoli; při
  hladu už před stavbami) → zbytek propadne. Volná práce
  v liště a zápis na seč (`recordMowingLabor` z `mowWork + allocation.common`) počítají práci
  pletí mužů jako volnou – strop stád nezmenší. **Seč nutného sena** je úloha dne `mow` ve skupině
  za žní obilí a trháním lnu, před jablky, pletím, přípravou půdy a výmlatem (fields.md – Pořadí
  důležitosti polních prací – 3. sklizeň sena); stavbám práci bere. Zvířata a domácí výroba (`DOMESTIC`) jdou bokem – jen `LaborDay.aside` pro postavy;
  Dřívější nedodělek domácí práce a přirážka paliva zmizely (pole ve starších uložených vsích se ignoruje). Úlohy dne berou práci
  ze zásobníků v pořadí **`weedChildren`** (děti 7–13 let, které nepasou, jen pletí –
  `weedingChildren` v harvest-hands.ts, `WEEDING_CHILDREN` 0,5 čd; fields.md – Pletí – děti) →
  **`light`** (ženy řemeslníků, jen lehké úlohy) → u pletí **ženy vsi** (`womenLabor` – práce žen nad
  jejich díl denního minima `WEEDING_WOMEN.dailyMinShare`; pletí je bere napřed, i před úlohami
  dřív v pořadí) → obecná kapacita → **`lordField`** (vojvodova rodina až po práci vsi: žeň
  a výmlat ze `lordHelp`, vracení, kopání, orba a setí ze `lordSowing` – D102, dohromady nejvýš
  `lordFree`, v zimě výmlat do tempa okna ze zbytku; nikdy stavby; co nevyužije, propadne). **Pletí mužů až za ostatními úlohami dne** (fields.md – Pletí jednou a rychle):
  co děti a ženy nedoplejí, dostane obecnou kapacitu až po všech ostatních úlohách dne včetně
  nutné seče, a jen díl, který by děti a ženy dnešním skutečným tempem × `paceShare` do konce okna bez
  posledních `spareDays` dní nestihly (`weedDaysLeft`, `WEEDING_WOMEN`) – jen
  v tom se pořadí úloh dne liší. **Cvičící vojvodova rodina** (lord.md) je mimo `villagers` jako dílny; minimum
  dvorce kryje sama (`manorLabor`, domácnost dvorce je ve `householdElders` / `householdWater`
  vynechaná přes `skip`), co nepokryje, jde z práce vsi jako `manorMin`. `DayAllocation.lordField`
  = spotřebovaná práce rodiny; `work()` vrací podíl `lordField` pro `trainLordDay`.
  **Rozložení `work()`** (11. 11. 2026, výsledek bit po bitu beze změny): `work()` v simulate-work.ts
  jen skládá pojmenované kroky v pevném pořadí – každý krok má vlastní funkci se vstupem
  a výstupem, sdílený stav dne nese kontext `WorkDay` (simulate-work-context.ts – vstupy, `month`,
  `cartLog`, `partsById`, `daylight`, `demand`, líné `drivesOf` / `drives4Of`; výsledky kroků jako
  `PloughDay`, `DayTaskList`, `DayCartPlan`, `DayPeople`, `DayCartJobs`, `DayTravel`). Pořadí:
  `startWorkDay` (převod starších sazeb pletí) → `ploughDay` → `dayTaskList` (`fieldTasks`,
  `threshDayTasks`, `grainPitDay`, `villageDayTasks`, řazení `dayTaskOrder`) → `dayCartPlan` →
  `dayPeople` → `dayCartJobs` (simulate-work-people.ts) → `dayLabor` (vstupy a `allocate(jobs)`) →
  `morningWaterDay` (voda ráno – nové `jobs` i rozdělení) → `horseCareDay` → `applyDayTasks`
  (`taskApplyOrder`, svoz `recordTaskHaul`) → `smithHerdingTravel` → `commonWorkDay`
  (`commonHauls` → drobná zvěř hladové vsi → `buildDay` → `freeLaborDay`; simulate-work-apply.ts) →
  `settlePloughTeams` → `craftsDay` → `smithCartTrips` → `flushCartTrips` → `laborReport` →
  `recordCommonLabor` → `toilToday`. Nový krok patří na své místo v tomto pořadí – přesun kroku
  mění losy i mutace dne (zlatý otisk vsi).

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
  doménové akce ji odmítnou. Den konce vsi (`extinctDay`, `abandonedDay`) zapisuje jen `endVillage`
  (`extinction.ts`) – cizí kupci z jejího trhu přitom odjedou (village-trade.md – Cizí kupci ve vsi).
  **Konec hry** (`extinction.ts`: `isGameOver` – hráč má vsi a žádná
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
  **Přednost v hladu** (population.md – Přednost v hladu, Martin 17. 11. 2026, D92):
  `people/hunger-groups.ts` – `hungerSplit` (skupiny 0–3: `lordFamily`, `masterHousehold`, obydlí
  s dílnou a `Person.practice`, zbytek a hosté; potřeby a počty), `rationShares(poměr, potřeby,
minimum)` (životní minimum všem, pod ním všem stejně, zbytek po vrstvách v pořadí; minimum
  `rationMinimum(stav, den, potřeby, `groupOf`, dny do žní)` = max(`HUNGER_PRIORITY.minimumShare` 75 %,
  `survivalRation`) – v dlouhém hladu příděl k přežití zbytku vsi do žní, D112, Martin 22. 11.
  2026 „ano“ na uskromnění rodu; `survivalRation(práh, hlad, dny do žní)` = `STARVATION.fedFrom`
  × (1 − (práh − `SEED_STORES.marginDays` − hlad) / dny), `survivalLimit` = nejnižší
  `STARVATION.threshold` lidí nejnižší vrstvy s potřebou (`groupOf` z `hungerSplit`; práh dětí a starších, když v ní je dítě, starší, kdo do žní zestárne
  (`daysToHarvest`), nebo žena v plodném věku, jinak dospělých – dítě v rodu minimum zbytku vsi nezvedne; bez `groupOf` lidí celé vsi, tak ho volá `seedKeepKg`) a hlad té
  vrstvy – táž definice jako přežívací zásoba, bez meze osiva; volá ho jídlo dne `eat` pro `tierMeal`
  i ukázaný příděl a předpověď štěstí `nextDayDiet`), `advanceGroupStarvation`
  (hlad skupin: `starvationDays` = nejnižší neprázdná skupina, `starvationGroups?` = skupiny 0–2,
  jen když se liší; prázdná skupina přebírá hlad nejbližší neprázdné; bez části stavu mají všechny
  skupiny `starvationDays` – `groupStarvation` to čte jako výchozí hodnotu, takže položka ve
  `VILLAGE_MIGRATIONS` netřeba; člověk, který přejde do jiné skupiny – sňatek, stěhování, smrt
  řemeslníka –, má od té chvíle hlad své nové skupiny, hlad se vede po skupinách, ne po lidech).
  `rationShares` při poměru ≥ 1 vrací samé jedničky (sytá ves bit po bitu jako dřív). Obrácené
  `villageRationFor(podíl, potřeby)` – nejmenší příděl vsi, při kterém nejnižší skupina s potřebou
  (`lowestFedGroup`; bez zbytku vsi nejbližší vyšší) dostane `podíl`: do minima `podíl`, nad ním
  (potřeba vyšších + `podíl` × potřeba nejnižší) ÷ potřeba vsi, nejvýš 1 – přežívací zásoba
  `seedKeepKg` (village-fields.md, od 18. 11. 2026) s minimem 75 %: `rationMinimum` je nejvýš
  cíl přežívací zásoby, rozdělení při tomto přídělu vsi dá zbytku vsi týž cíl (D112 – zásoba
  beze změny, test `long-hunger.test.ts`).
  **Strava po vrstvách** (diet.md – Strava po vrstvách a porážka celý rok, 18. 11. 2026):
  `eatDiet` (`core/diet.ts`) sní den bez stropů – `dietPlan` spočítá výhled `aheadEnergy` (jídlo
  mimo obilí a med do sklizně), pevný příděl medu a tempo proti zkažení (`fruitPace` = ovoce ÷
  dny do zkažení, `meatPace` = maso čerstvé i ostatní uzené ÷ dny do konce masa, `spoilPace` i s
  vejci) – to se sní napřed i v hojnosti, šetří se jen obilí a v hladu med. **Jablka nad 5 %
  jen bez ztráty bílkovin** (diet.md – Pořadí jídla; Martin 22. 11. 2026, D115 kolo 1): s potřebou
  bílkovin je `fruitPace` nejvýš `fruitAlways` (5 % potřeby – `DIET.fruitShare`) a ovoce za den
  nejvýš `DietPlan.fruitMost` (5 % + `fruitExtra`); výhled počítá s ovocem `fruitAhead` (nejvýš
  `fruitMost` za dny do zkažení). Jídlo dne sestaví `serveMeal` (pořadí jídla vsi): napřed s ovocem
  do 5 %, z něj `fruitSpare` – energie, kterou nic nedorovnalo (`Served.unmet`), plus obilí
  (v hladu s medem – `grainPart`, bílkoviny jako samo obilí) a luštěniny nad potřebu bílkovin – a
  s ním znovu. Při plném přídělu se `fruitSpare` spočte napřed a výhled (i `grainSpareKg`) s ním
  počítá; v hladu (výhled s ovocem do 5 % pod 1, po dílu zásoby z porážky do sklizně) přidá
  `hungerFruit` jablka nad 5 % – `fruitAhead` plánu se všemi jablky (`dietPlan` s `hungerFruit`
  = ∞) bez `fruitAhead` do 5 %, nejvýš chybějící energie do sklizně (s celou zásobou medu),
  ÷ dny do zkažení (nejvýš do sklizně) – jako 4. vstup `dietPlan` (zvedne `fruitMost` i strop
  `fruitPace`); výhled se s nimi spočte znovu (D115 kolo 2). Bez potřeby bílkovin
  (`proteinNeedPerDay` chybí) bez omezení jako dřív. Obrácený výhled `grainAheadForOutlookKg` pod
  cílem 1 se všemi jablky (`hungerFruit` = ∞), cíl 1 s ovocem do 5 %. **Dvě zásoby
  uzeného** (D98 kolo 1, 18. 11. 2026 – Martin: „Uzené rozlož“ na otázku po uzeném z listopadové
  porážky): `VillageState.meatKg` je uzené celé, `slaughterMeatKg` jeho část ze zásoby z porážky
  z 1. 11. (`slaughter` přičte kusy pod nůž hned); `core/meat-stocks.ts` – `villageSlaughterMeatKg`
  (nejvýš celé uzené), `takeVillageMeatKg` (oheň, prodej, kořist, odchod, `appoint-lord` – součet
  přesně, zásoba z 1. 11. poměrně). V jídle ostatní uzené hned za čerstvým, díl zásoby z 1. 11.
  (`slaughterShare` = zásoba po dnešní ztrátě ÷ dny do konce masa, v hladu ÷ min(dny do konce
  masa, dny do sklizně) – `dietPlan(input, untilHarvest)`, D112; poslední den zbytek) až po
  mléku, vejcích, čerstvém a ostatním uzeném – do plné potřeby (i nad příděl), co se nevejde,
  zůstane; jen co by se jinak zkazilo (`slaughterMust` = zásoba − potřeba × (dny do konce masa
  − 1), nejvýš potřeba – D98 kolo 2), se sní v tempu proti zkažení před mlékem. Hlad pozná
  `eatDiet` výhledem s dílem do konce masa (`harvestOutlook`): pod plným přídělem, se zásobou
  z 1. 11. a sklizní dřív než konec masa spočte `dietPlan(input, true)` a výhled znovu – jídlo
  dne i výhled pak mají díl do sklizně (bez kruhu: díl do sklizně výhled jen zvedá);
  `grainAheadForOutlookKg` pod plným přídělem počítá s dílem do sklizně taky (přesně obrácený
  výhled), na plný příděl s dílem do konce masa (D112). `DietResult.daysToHarvest` = dny výhledu.
  Výhled ji počítá `min(díl, potřeba) × keptDays(min(dny, dny do konce masa))` (Σ
  `DAILY_MEAT_KEEP`^j – i se ztrátou uzením), ostatní uzené celé, nejvýš potřeba za dny do konce
  masa. Starší ves převede `smoked-meat-stocks` (níž). `tierMeal` (`core/tier-meal.ts`)
  rozdělí snědené vsi mezi vrstvy: `rationShares` dá příděl (životní minimum `minimum` všem –
  75 %, v dlouhém hladu `rationMinimum` –, zbytek po vrstvách), pak
  úrovně `LEVELS` – ovoce a pevný příděl medu všem stejně (`evenTakes`), ostatní po vrstvách
  (`levelTakes`) v pořadí čerstvé maso, uzené, mléko, vejce, sýr, luštěniny, obilí, med navíc –
  maso elitě napřed (od 18. 11. 2026, po závěrečné kontrole; pořadí jídla vsi v `eatDiet`
  a `foodLastsDays` má mléko a vejce napřed – záměrně, množství je dané); co se nevejde do
  přídělů, sní nejnižší vrstva s potřebou (`sink`). Vrstva
  s potřebou 0 (lidé pryč) má energii 1 a nic nesní. `dietHappiness` počítá štěstí z maso +3,
  ovoce +5 a med +2 po vrstvách a bere průměr přes jedlíky (`HungerSplit.eaters`). `eatDiet`
  v hladu mírně kloní příděl během sezóny (trvanlivé mimo obilí se jí dřív, nejvýš ≈ 2 p. b.).
  `eat` (`simulate-food.ts`) dělí energii dne
  a příděl do sklizně (`ration` = příděl zbytku vsi; `hungry` a nouzová porážka celé vsi), jen
  když ves šetří, nejí se dosyta nebo skupiny mají různý hlad – jinak výpočet jako dřív.
  `peopleDay` posune hlad skupin, `populationDay(…, hunger)` bere hlad a energii skupiny člověka
  (úmrtí) a matky (porody), `lodgeLifeDay` energii skupiny mistrů; štěstí a `summary` celou vsi.
  **Stupně hladu** (population.md – Hlad a vymření, Martin 19. 10. 2026): `eat` zapíše příděl do
  sklizně `VillageState.ration` (jen když ves šetří – `hungry`), `hungerLevel` v `summary.ts` →
  `VillageSummary.hunger` (`fed` / `rationing` 90–100 % / `hungry` pod `STARVATION.fedFrom` /
  `starving`) → `VillageView.hunger`, `VillageListItem.hunger`; upozornění „Ves šetří jídlem“
  (info), „Ves hladoví“, „Lidé umírají hlady“ – jen nejvyšší stupeň, ohlásí se při zhoršení (i
  z jiné vsi – `otherVillageNotices`).
- **Na jak dlouho vystačí zásoby** (diet.md – Hlad; Martin 15. 11. 2026, D56): `foodLastsDays`
  (`core/food-lasts.ts`) – kolik dní od zítřka uživí dnešní zásoby lidi plným přídělem
  (`villageFoodNeed` zítřka, stálá), bez sklizní a příjmů (mléko, vejce, porážka, med z klátů).
  Zásoby jako jídlo dne: obilí bez osiva, které ves nejí (`uneatenSeedKg`), se snopy
  (`sheavesOutlook`), luštěniny, uzené maso, sýr, jablka a med. Den po dni ráno ztráty jako
  výhled do sklizně (`grainKeepPerDay`, `legumeKeepPerDay`, `DAILY_MEAT_KEEP`,
  `DAILY_CHEESE_KEEP`), maso do zkažení (`daysUntilMeatSpoil`), jablka do shnití
  (`daysUntilAppleRot`); ves jí v pořadí jídla bez stropů (diet.md – Strava po vrstvách a porážka
  celý rok, 18. 11. 2026) – ostatní uzené maso hned, zásoba z porážky 1. 11.
  (`villageSlaughterMeatKg`) jen svým dílem (zásoba ÷ dny do konce masa – `daysUntilMeatEnd`, po 31. 10. přepočet; D98), sýr, ovoce, luštěniny, pak obilí a nakonec med (jídlo
  jako obilí – Med v hladu). Ovoce jako jídlo dne v hladu (předpověď nezná sklizeň): do 5 %
  potřeby (`DIET.fruitShare`, s potřebou bílkovin `villageProteinNeed`) a jablka nad 5 % rovným
  dílem do zkažení, co nic nedorovná, doplní zbylá jablka (D115 kolo 2). Počítá se do prvního
  dne bez plného přídělu (tolerance `SATIATION_EPSILON`), nejvýš do konce světa; nikdo nejí →
  null. `VillageSummary.foodLastsDays` → `VillageView.foodLastsDays` (chybí místo null) → řádek
  pod rozpisem plodin v liště (web-ui.md). Starší `storesMonths` (jen obilí ÷ potřeba) zůstává
  beze změny.
- **Zásoby u sklizně v kronice** (population.md – Kronika, Martin 17. 11. 2026, D90):
  `stockLastsDays(state, day, 'grain' | 'legumes' | 'apples')` (`core/food-lasts.ts`) – kg a dny
  jedné potraviny stejnými pravidly jako `foodLastsDays`. `attachHarvestStocks` (simulate-food.ts)
  ji na konci `harvestWinter`, `harvest` a `harvestLateSpring` připíše jako nepovinné `stock`
  (`HarvestStock` – kg, dny, lidé) do zápisů `harvest` a `garden-harvest` dne; `apple-harvest`
  dostane `stock` v `simulate.ts` po `orchardSeasonDay`. `birth` a `death` (population.ts) nesou
  `population` – počet lidí po události, stejně i všechna ostatní úmrtí (`disaster-deaths.ts`,
  `hunt.ts`, `beast-casualty.ts`, `warDeath` v `raid-apply.ts`). Text: `stockSentence`,
  `populationSentence` (`lib/village-view-chronicle.ts`).

- **Štěstí a posvátná místa** ([happiness.md](../design/happiness.md), `happiness.ts`,
  `sacred.ts`; body za úmrtí `deathPointsFor` = max(0,5; 5 − 0,06 × věk), věk nese událost kroniky `death.age`, bez něj dítě 5 / jinak 3; úmrtí dne se berou z událostí `death` populace, lovu správce, pohrom a ze začátku dne – schránky `applyInboxDay` a ran `woundDeathsDay`, tj. `morningDeaths` v `advanceVillage` → `peopleDay`; zajatí a odvedení `death` nemají): štěstí 0–100 (`VillageState.happiness` – hodnota, úmrtí posledního roku, dny dřiny
  posledních 60 dní; chybí = 50) se den po dni posouvá o denní podíl k cíli
  (`happinessTarget` z `happinessFactors`: hlad, úmrtí, přeplněnost, dřina `isToilDay` – ves by
  běžící polní práce dnešním tempem nedodělala do konce oken; tempo v `toilToday` = dnešní polní
  práce, výmlat, seč a otava `mowLabor` (od 19. 11. 2026 – D99 kolo 2) a práce všech lidí na cestách `allocation.away` (výpravy, nákupy u sousedů, cesty pro kování) × světlo dne (od 22. 11. 2026 – D113; čistá `toilPace`, happiness.ts); termín úlohy = dny okna, které zbývají v jeho úsecích, `taskWindowDaysLeft` (D113) –, zásoby, posvátná místa) – krok
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
- **Víra a štěstí** ([christianity.md](../design/christianity.md), `conversion.ts`, `happiness.ts`):
  `conversionDay` (1. 1. v `simulateDaySteps`, jen `rodBaptized`) obrací dospělé pohany s šancí
  `(CHURCH.conversion.base + perCoverage × pokrytí kostely) × (1 + podíl křesťanů)` (`conversionBase`), los `convert:rok:id`; kronika
  `converted`. Pokrytí kostely počítá `churchCoverage` ([village-masonry.md](village-masonry.md) – Kostel ve vsi). Cíl štěstí (`happinessTarget`) je vážený průměr cíle
  pohanů (`sacred` − `desecration` z `faith.desecrated`, nejvýš 30) a křesťanů (posvátná místa 0,
  `church` = `churchHappiness`, bez kostelů s knězem 0) podle `christianShare`; bez křesťanů a zničených míst přesně jako dřív.
  Rozpis (`HappinessSummary`) nese `christianShare` a `desecration`. Správce (`sacredLaborGainPerYear`)
  počítá zisk jen z podílu pohanů.
  obstacles)`– bez ní se dub počítá jako nejmladší); krok simulace`sacredOakEvents`zapíše do
kroniky`sacred-oak-died`/`sacred-snag-fell`(upozornění přes`CHRONICLE_NOTICES`). Padlá
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
  Den (`simulateDaySteps`, 11. 11. 2026 rozložený beze změny výsledku) skládá pojmenované kroky:
  `morningDay` → `routesDaySteps` (zastávky) → `craftCoverage` → `seasonPloughAtTools` (orba plánu
  při dnešním pokrytí nástroji – village-fields.md) → `storesAndHerdsDay` →
  `seasonPlanDay` → `workDayStep` (`work()`) → `afterWorkDay` → `remnantsDay` (obilné jámy pod
  novými stavbami podle `idsBefore`) → `marriagesAndMealDay` (`eat`) → `lordEveningDay` (lov
  správce `npcHuntDay`, úlovek z hlídky, výcvik dne – village-wildlife.md, Lov správce) →
  `peopleDay` (vymřelá ves končí) → `harvestAndUpkeepDay`; zastávky (`yield`) mezi kroky zůstaly.
  - **Zlatý otisk celé vsi** (`village-golden.test.ts`, `village-golden-fixture.ts`): ves ze seedu
    4242 v krajině seedu 1, od založení pod správcem, po 20 letech (10 polí, stáda, uhlíř, hrnčíř,
    kovář, 14 lidí, rod) se dopočte o rok; otisk (cyrb53 z `JSON.stringify` stavu) musí sedět
    vcelku i po kouscích 37 dní. Po 2. a 3. roce hlídá `village-golden-long.test.ts` (pomalá sada).
    Úklid a zrychlování otisk měnit nesmí; změna pravidel vsi ho přepíše vědomě (postup v komentáři
    testu).
  - **Pomalá sada** (`npm run test:slow`, seznam v `packages/game/slow-tests.ts`, config
    `vitest.slow.config.ts`): pásma krajin `*band*`, `steward.test.ts`, `simulate.test.ts`
    a dlouhý zlatý otisk. Běžné `npm run test` je nepouští; při změně `domain/landscape`,
    `world/skeleton` nebo pravidel simulace vsi je nutné pustit obojí.
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
  kroupy, povodeň, požár – `local-disasters.ts`) po `damageWindowStart`, před `seedReserveDay`
  a `work()` – požár nastaví `disasters.fireFight` a `villagersToday` / `work()` dnes vidí dospělé
  u hašení. Pohromy nedávají nová id
  (kontrola `moveGrainFromCoveredPits` beze změny). Podrobnosti: village-disasters.md.

- **Dopočet po kouscích na serveru:** `advanceVillageSteps` je `advanceVillage` po dnech
  (generátor – tatáž smyčka, stav se klonuje jednou). `loadVillage` / `dynastyStatus` dostanou
  port `Pause` (`application/villages.ts`) a mezi dny se ptají, jestli počkat; web
  (`packages/server/src/compute-pause.ts`, v `dynastyDeps`) po ≈ 50 ms počítání v kuse pustí přes `setImmediate`
  ke slovu ostatní požadavky – dopočet po dlouhé nepřítomnosti nebo přeskok o 10 let neblokuje
  server (jedno vlákno). Jeden drahý den (přepočet sítě pěšin) se nedělí. Výsledek na
  přestávkách nezávisí (test v `villages.test.ts`).

- **Schránka vsi** – jediná cesta, jak cizí věc (jiný hráč, svět) změní ves (plán multiplayeru,
  technické rozhodnutí 4). Doména `domain/village/core/inbox.ts`: `VillageEvent { id, villageId, day,
seq, body }`, `NewVillageEvent` (bez `id` a `seq`, s jedinečným `ref` – idempotence zápisu),
  tělo `VillageEventBody` je unie podle `kind`: `{ kind: 'chronicle'; event }` (zápis do kroniky
  s dnem použití) a `{ kind: 'lord-arrives'; party; fromVillageId }` (příjezd dosazeného vojvody –
  `settleAppointee`, village-people.md – Dosazení vojvody do vsi bez muže rodu); nový druh = nová
  větev v `applyEvent` (kompilátor ohlídá úplnost).
  - **Trh** (markets.md – Rozhodnutí plánu 2, bod 6; village-trade.md – Trh ve vsi): těla
    `MarketMailBody` – `{ kind: 'market-arrive'; arrival }` (výprava přijela na trh vsi –
    `joinMarket`) a `{ kind: 'market-result'; result }` (výsledek trhu pro domovskou ves výpravy –
    `applyMarketResult`). Posílá je odchozí schránka vsi (`VillageState.outbox`,
    `VillageMail` – stejný tvar jako `NewVillageEvent`), `ref` příjezdu `marketArrivalRef`,
    výsledku `marketResultRef`.
  - **Odchozí schránka** (`application/village-mail.ts`; markets.md – Rozhodnutí plánu 2, bod 6):
    ves sama do cizí vsi nepíše – zprávy pro jiné vsi nechá v `outbox` a `deliverVillageMail(deps,
villageId)` je zapíše do schránek cílových vsí (`inbox.post`, druhý zápis téhož `ref` se
    zahodí) a doručené smaže verzovaným zápisem vsi (při souběhu znovu, nejvýš `MAIL_ATTEMPTS` = 5 –
    technická mez, ne pravidlo; prázdný `outbox` ze stavu zmizí). Existenci cílových vsí ověří
    jeden levný dotaz `stampsOfVillages`: příjezd do zmizelé vsi se změní ve výsledek `returned`
    se vším do vlastní schránky na den plánovaného návratu (den příjezdu + pobyt + cesta – lidé
    jsou doma v plánovaný den, návrh Clauda), výsledek pro zmizelou domovskou ves se zahodí – jen
    lidé a mince z něj jdou zpět k hostiteli (`stranded-people` – `receiveStranded`; domov zaniklý až
    s výsledkem ve schránce – úloha světa `returnStrandedPeople`), dotazy plánu 3 do zaniklé
    vsi se zahodí (village-trade.md – Pošta mezi vsemi, Zaniklé vsi a zprávy plánu 3).
    `hasVillageMail(state)` – neprázdný `outbox` (i spící vsi) nebo výprava živé vsi na trh po termínu
    bez výsledku; jen s ní se doručuje po dopočtu (`advancePlayer`, `dynastyForVillage`, `advanceDynasty` – za
    odchody správce), takže ves bez pošty nestojí ani dotaz navíc. `deliverVillageMailSafely`
    chybu zapíše do logu a vrátí 0 – dopočet nezastaví, zprávy zůstanou v `outbox` a doručí je
    příští volání (idempotentně podle `ref`). Výprava po termínu a zaniklý hostitel:
    village-trade.md – Pošta mezi vsemi.
  - **Okolí** (markets.md – Rozhodnutí plánu 3, bod 1; village-trade.md – Okolí vsi): tělo
    `{ kind: 'nearby'; nearby }` – snímek vsí na 8 sousedních mapách (`VillageNearby`) –
    `applyNearby` zapíše do `VillageState.nearby` s dnem události, kronika nic. Zapíše ho sám
    dopočet (`updateVillage` přes podport `villages.nearby`) v pevné dny obnovy před dopočtem přes
    ně (`ref` `nearby:<ves>:<den>`) – den snímku nezávisí na kouscích dopočtu.
  - **Kde se použijí:** `advanceVillageSteps(state, toDay, obstacles, landscape, inbox = [])` na
    začátku dne `d`, před `simulateDaySteps(d)`, použije události dne `d` v pořadí `seq`
    (`applyInboxDay` – mutuje klon stavu jako kroky dne, zápisy kroniky vrací). Události mimo
    dopočítávané dny (`day ≤ lastDay`, `day > toDay`, dny spící vsi – vymřelé, opuštěné, na
    cestě) se přeskočí, takže výsledek nezávisí na kouscích ani na přestávkách (test „po
    kouscích“ 1 / 3 / 10 dní a přerušený generátor v `__tests__/inbox.test.ts`). `advanceVillage`
    bez `inbox` (testy, měření) dává totéž co dřív.
  - **Port** `VillageInbox` (`application/inbox.ts`): `post(event)` – den zápisu
    `max(day, lastDay + 1)`, zápis zvedne verzi vsi, `null` = `ref` už zapsaný;
    `pending(villageId, afterDay, toDay)` – události `afterDay < day ≤ toDay` podle dne a `seq`;
    `pruneUsed(villageId, upToDay)` – smaže použité události druhů `PRUNED_INBOX_KINDS` (snímky
    okolí `nearby` a zprávy bez nákladu `kin-ask`, `smith-ask`, `order-ready`) do dne včetně, verzi
    nemění (úklid schránky – ostatní řádky živých vsí drží `ref` proti dvojímu zápisu;
    village-trade.md – Okolí vsi); `strandedResults()` – výsledky trhu s lidmi nebo mincemi ve
    schránkách zaniklých vsí (spí, sídlo v archivu), `dropStranded(eventIds)` – smaže vyřízené z nich,
    verzi nemění (úloha světa `returnStrandedPeople`, village-trade.md – Pošta mezi vsemi). Schránka je člen úložiště vsí (`VillageRepository.inbox`), takže ji má každý dopočet přes `updateVillage`
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
  - **U hostitele:** `guestFoodNeed` / `guestFoodNeedPerDay` / `guestLaborToday` – host je dospělý:
    jí jako dospělý ze zásob hostitele (`villageFoodNeed` ho přičte) a pracuje 1 čd denně.
    Práce hostů ve `work()` (`simulate-work.ts`) jde **napřed do rozestavěného opevnění**
    (`build(…, 'fortification')` – rovným dílem po úsecích, bez tesaře), co zbude, se přičte ke
    společné práci před stavbami – ostatní stavby rovným dílem, opravy obydlí, údržba valu,
    seč navíc (návrh Clauda podle fortifications.md – Robota vazalů). Polní úlohy
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
  - **Kovář u koní souseda** (`away` druhu `craft`; village-livestock.md – Kovář souseda):
    `untilDay` = návrat výpravy kováře, nepracuje, **jí doma** (`foodNeedPerDay` – jako nosiči
    výpravy na trh), jeho dílna ty dny nekuje (`craftHands`); návrat bez kroniky `people-back`
    (`craft` není v `AWAY_KINDS`).
  - **Uprchlíci a posel** (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 – Ú7,
    kód `domain/village/fortification/state/refugees.ts`, podrobně docs/code/war.md – Ves na útěku): `away` druhu
    `refuge` (s `hostVillageId` v hradišti, bez něj ukrytý v lese) a `messenger` nemá `untilDay` –
    končí událostí schránky. **Uprchlík v lese** (`hidesInForest`) nepracuje, ale **jí doma**
    (`foodNeedPerDay`). **Host se dnem narození** (`Guest.bornDay` – uprchlíci) jí podle věku
    (`guestFoodNeed`) a pracuje jen jako dospělý 14–44 let; hosté bez něj se počítají jako dřív
    (počet × dospělý – bit po bitu). Krok dne `refugeFoodDay` těsně před jídlem (`simulate.ts`):
    z `refuge.hidden.foodKg` a z `RefugeStay.foodKg` přesune do zásob tolik, kolik dnes uprchlíci
    snědí – jedí napřed své, pak ze zásob vsi. Návrat z hradiště (Ú10 – use-case
    `returnFromRefuge`) odebere hosty a pobyt (`departRefuge`) a do `refugeLeaving` hostitele zapíše,
    co lidé nesou, dokud událost `refuge-back` nestojí ve schránce domova (pak záznam zmizí);
    simulace ho nečte. Dostižená skupina (Ú8 – `refuge-caught`) může mít i zajaté muže rodu
    a šlechtice (`captured` – `markCaptive` u věznitele jako po nájezdu). Chycený posel
    (`messenger-caught`) nese klíč zajetí `prisonerId` (`<tažení>:<ves>:<osoba>`; starší událost bez
    něj `<tažení>:<osoba>`). Muži uprchlíků od 16 let hradiště brání a jejich ztráty dojdou domů
    jako ztráty hostů z ochrany (`guard-losses` – Ú9, war.md – Pobyt v hradišti).

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
  1,1 s, převážení 1,4 → 0,7 s, `routeMapKey` 0,9 → 0,4 s). Nejvíc teď
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
  pod stavbou jen se změnou vstupů kontroly (`updateRuins` – kontrola, která nic
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
  (6,5 s – hledání sítě pěšin 3,0 s, chůze 2,4 s, z toho objížďky stěn 2,1 s), práce dne 1,6 s,
  sezóna 1,2 s, kopie stavu 1,0 s, odhady vozu při orbě 0,9 s, správce
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
     (váha 0,5 → 1) jen −8 % instrukcí sítě – nevyplatí se.
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
  **Kolo drobná zrychlení (9. 11. 2026, fronta zrychlení výpočtu – Martin schválil):** jen
  zrychlení, otisk stavu Vlkova po 1, 2 a 3 letech před / po týž vcelku i po 37 dnech (sha256
  `5e16b6751d5b`, `240f4aec6ab0`, `f3de54797adb`). **Kování** (village-livestock.md – Kování):
  ves bez kováře zkouší platit cizímu každý den po termínu – napřed levná kontrola, zda platba
  vůbec projde (samo železo nad přebytkem → dnes ne), cena práce (`villageFoodCosts`) až potom;
  `planShoeing` 0,19 → 0,07 s, `villageFoodCosts` 0,15 → 0,02 s za zahřáté roky 2–4.
  **Měsíční kontrola cest** (village-roads.md – Úklid sítě): ploty, stavby pro copánek, vchody
  a stavby s ploty pro ohyb ramene z jedné vsi pro pěšiny za měsíc (`monthLayoutOf`; dřív
  `pathVillageOf` až čtyřikrát) – `tidyMonth` 1,04 → 0,63 s (`hasRingBraid` 0,36 → 0,25,
  `accessDue` 0,28 → 0,11, `updateJunctions` 0,31 → 0,12 s), `pathVillageOf` 1,10 → 0,80 s
  (zbylé jedno volání nese `monthRoutes` 0,60 → 0,85 s). Profil roků 2–4 při rozkolísané zátěži
  (8–60; běh po byl celkově o 55 % pomalejší), proto i podíl na celém dopočtu: měsíc cest
  (`roadsMonthRunSteps`) 14,5 → 10,4 %, `tidyMonth` 6,5 → 2,5 %, kování 1,2 → 0,3 %. Zahřáté
  roky 2–4 střídavě před / po: 14,96 / 26,30 / 16,93 s → 14,84 / 16,37 / 15,50 s (CPU 18,3 /
  25,2 / 20,0 → 17,9 / 19,8 / 18,5 s). Přeskočit kontroly úplně podle otisku vstupů se nevyplatí:
  provoz tras (`trips`) se převažuje každý 1. v měsíci a pořadí tras se tak mění každý měsíc
  (osy cest, stavby a stezky Vlkova se za rok nezměnily, sada tras jen 1. 11.) a otisk by musel
  nést celé rozložení vsi – právě to, co stojí čas; zbylé ≈ 0,2 s za rok je vlastní práce kontrol.
  **Kolo po novém dni pole (9. 11. 2026 večer, fronta zrychlení výpočtu – Martin schválil):** po
  osevu naplno, žních v srpnu a září, skladbě dne, pořadí polních prací, zahrádkách a lnu na poli;
  stav Vlkova z DB 9. 11. (`scratchpad/prof9`, kopie skriptů `prof9-round`). Jen zrychlení – otisk
  stavu po 1, 2 a 3 letech před / po týž vcelku i po 37 dnech (sha256 `b21ac57c84c5`,
  `5787b9ce31d2`, `b7ae76df6e01`), zlaté otisky testů beze změny. Šest úprav (profil zahřátých
  roků 2–4, před → po): **len na poli** – obilí dne podle druhu osevu jednou za druh, kandidáti
  lnu jedním průchodem do dvou skupin a první osev se řadí, jen když druhý potřebu nepokryje
  (`flaxCandidates` 0,66 → 0,03 s, `turnSelection` 1,46 → 0,80 s); **odhad úrody plodiny**
  (`cropYieldKg`) s díly z `partsByIdOf` místo mapy přes všechny díly při každém volání
  (`baseMealInput` 0,99 → 0,55 s, `daysUntilFoodHarvest` 0,80 → 0,37 s); **paměť úseček vozu
  přežije změnu polí** – 10 z 11 změn vstupů půdy vozu za rok nezmění žádnou buňku (díl změní
  stadium, ne rychlost vozu), půda zůstane tatáž i s pamětí; při skutečné změně se převedou úsečky,
  které žádný čtverec 8 × 8 buněk se změnou nemíjí ani o buňku (`carryCartSegments`), objížďky přes
  brod mají vlastní paměť a nepřevádějí se (test proti výpočtu bez paměti ve
  `walk-estimate.test.ts`) – `villageCartEstimates` 1,27 → 0,83 s, `straightCartCost` 0,74 →
  0,27 s; **zbytky jam** porovnají čtverce dílů s pamětí přímo, bez skládání řady ≈ 19 tisíc čísel
  denně (`updateRuins` 0,54 → 0,32 s); **obvod opevnění z paměti** podle druhu a bodů (posledních
  16, zmrazený a sdílený jen ke čtení – `fortificationOutline` 0,45 s → ≈ 0, `builtLengths` 0,26 →
  0,07 s, `decideFortRebuilds` 0,25 → 0,04 s); **bloky orby** bez textových klíčů políček a s frontou
  po indexu (`ploughLayout` 0,87 → 0,66 s). Rozpad zahřátých roků 2–4 po částech dne (profil,
  zátěž 30 → 23; celkem 16,1 → 14,0 s): sezóna 3,45 → 2,56 s, práce dne 2,57 → 1,97 s, přepočet
  tras 2,43 → 2,51 s (beze změny – hledání sítě pěšin), správce 2,24 → 2,14 s, měsíc cest 1,54 →
  1,57 s, zbytky jam 0,54 → 0,31 s, jídlo 0,46 → 0,31 s, škody zvěře 0,43 s, pole u cest 0,37 s.
  Rok Vlkova (`years.mts`) střídavě před / po (zátěž 32): roky 2–4 4,57 / 5,19 / 5,44 a 5,03 /
  5,51 / 6,01 s → 3,91 / 4,70 / 5,32 a 3,94 / 4,34 / 4,82 s (průměr 5,29 → 4,51 s, −15 %), rok 1
  8,09 / 8,54 → 7,56 / 7,71 s. Nejvíc dál bere výběr dílů sezóny (`seasonSelection` 1,5 s za tři
  roky – každý den oken setí), hledání sítě pěšin (≈ 1,0 s), výkon orby plánu osevu (tři přepočty
  za tři roky po ≈ 0,2 s – mění se díly na řadě a jejich vzdálenosti) a úseky úloh při zmenšení
  plánu na konci oken setí (`shrinkInPlan` – každý uvolněný díl přepočítá úseky všech úloh).
  **Kolo 10 – studený rok a správce (10. 11. 2026, fronta zrychlení výpočtu – Martin schválil):**
  po otavě, setí ozimu za orbou a útěku do hradiště; stav Vlkova z DB 9. 11. (4 754 dílů, 39 lidí;
  skripty `scratchpad/prof10` – `hash.mts`, `days.mts`, `cold.mts`, `cold2.mts`, `diff.mjs`). Jen
  zrychlení – otisk stavu po 1, 2 a 3 letech před i po každé úpravě týž vcelku i po 37 dnech
  (sha256 `d1c7bf955acd`, `c02e0b05790f`, `9c4e1cdb2d58`), zlaté otisky testů beze změny. Pět
  úprav: **terén pěšin** (`buildPathTerrain`) – výška bodu mřížky a voda kolem jako funkce mimo
  smyčku, žádné uzávěry ani objekty pro každou buňku (pod `tsx` workeru je každá uzávěra navíc
  pojmenovaná přes `defineProperty` – ve studeném roce 0,45–0,8 s jen na tom); terén celé krajiny
  Vlkova bajt po bajtu týž, 420 → 200 ms; **výkon orby ve výhledu správce** – `stewardOutlook`
  volá `sowingCapacity` bez krajiny každý den a `plannedFurrowEfficiency` (rozvržení orby všech
  dílů na řadě) se dřív počítal pokaždé; bez krajiny čte jen díly, takže stačí poslední výpočet se
  stejnými `furrowInputs` (paměť zvlášť od paměti po krajině; test ve `furrow-roads.test.ts`);
  **cena předem** (`buildAffordability`) zjišťuje dřevo a duby (počítání stromů ve vrstvě
  překážek), jen když je cena chce – zásoba je vždy aspoň 0, surovina bez ceny nikdy nechybí;
  **škody zvěře** berou díly podle id z `partsByIdOf` místo dvou nových map denně; **bloky osevu**
  (`sowingBlocks`) počítají skupinu dílu jednou a druh osevu ve výběru dne (`turnSelection`) jde
  jedním dotazem do mapy. Profil zahřátých roků 2–4 (zátěž 44, celkem 13,14 → 12,05 s): správce
  2,05 → 1,39 s (`stewardOutlook` 0,80 → 0,27, `plannedFurrowEfficiency` 0,63 → 0,02,
  `buildAffordability` 0,37 → 0,20 s), sezóna 2,33 → 2,18 s (`turnSelection` 0,81 → 0,67,
  `sowingBlocks` 0,34 → 0,18 s), škody zvěře 0,46 → 0,26 s. Rok Vlkova (`years.mts`) střídavě
  před / po (stroj silně vytížený, zátěž 46–71): roky 2–4 6,58 / 7,39 / 8,55 a 7,20 / 6,96 /
  7,44 s → 6,11 / 6,40 / 7,50 a 5,16 / 6,32 / 6,49 s (průměr 7,35 → 6,33 s; v šumu zátěže – profil
  říká −8 %), rok 1 13,29 / 12,71 → 12,50 / 10,30 s. **Proč je první rok dražší:** po dnech
  (zátěž 33–35) 9,54 → 8,97 s; drahé dny 4. 3. (první den – stavba terénu pěšin, mezipaměti)
  557 → 330 ms, 1. 4. 1,8 s, 1. 11. ≈ 1,0 s a 1. 2. ≈ 0,6 s (přepočet tras – jiná cesta). Den 1. 4.
  je jednorázový převod: stav z DB nemá `walkDistanceKey`, vzdálenosti chůze se měří celé
  s prázdnou pamětí úseček chůze a objížděk stěn – v roce 1 `wallCrossing` 667 885× a 144 225
  hledání objížďky přes 154 bodů, v roce 2 39 842× a 10 hledání. Studený rok ze stavu po převodu
  (stav po roce 1, nový proces, `cold2.mts` / `years2.mts`, zátěž 30–39) 6,87 / 5,83 → 5,83 /
  5,36 s, následující zahřátý 6,10 / 5,90 → 5,60 / 5,57 s – nový proces se stavem po převodu je
  tedy po úpravě terénu stejně rychlý jako zahřátý; rozdíl 7,6 proti 4,5 s nesou převod stavu
  z DB a dva přepočty tras roku 1, ne mezipaměti. Objížďku stěn zkrátit dolní mezí podle dosahu
  nejde (dosah 98 % bodů je pod nalezenou mezí – 15,96 z 16,29 mil.). Paměť chůze drží jen
  2 krajiny (`MEMO_LANDSCAPES`) – worker s mnoha vsemi přepočty vzdáleností počítá studeně;
  změřeno 10. 11. (village-roads.md – Paměť chůze ve workeru): ≈ 0,16 s na přepočet, v přirozeném
  roce ≈ 3 % roku vsi, beze změny. Nejvíc dál bere (zahřáté roky
  2–4 po úpravách) přepočet tras 2,39 s (hledání sítě pěšin `routeAllSteps` 1,12 s, převážení tras
  0,68 s – `tripGroups` 0,32 s, z toho textový klíč `squareCellsOf` 0,20 s), sezóna 2,18 s (výběr
  dílů 1,34 s – `turnSelection` 0,67, pásy dávky `joinBands` 0,33 s – rozvržení orby dílů výběru
  každý den), práce dne 1,78 s (cesta orby `travelToday` a dosah vozů po ≈ 0,45 s), měsíc cest
  1,50 s a správce 1,39 s.
  **Kolo 11 (10. 11. 2026, fronta zrychlení výpočtu – Martin schválil):** navazuje na kolo 10;
  stav Vlkova z DB 9. 11. (skripty `scratchpad/prof11` – kopie `prof10`, strom před změnami
  `prof11/base`). Jen zrychlení – otisk stavu po 1, 2 a 3 letech před i po každé úpravě týž
  vcelku i po 37 dnech (sha256 `d1c7bf955acd`, `c02e0b05790f`, `9c4e1cdb2d58`), zlaté otisky testů
  beze změny. Pět úprav: **úseky dílů úlohy** (`taskSpans` – volá je přenos práce na díly,
  zmenšení plánu po dílech, začaté díly pásů a čelo orby mnohokrát denně) počítají díly a váhy
  v souběžných polích místo `flatMap` s objektem na díl, díly zakládání berou z množiny (dřív
  `includes` pro každý díl) a množinu drnu staví, jen když drn je; součty ve stejném pořadí;
  **čáry tras měsíce** (`monthRoutes`) – převážení tras každý 1. v měsíci mění cesty za den
  a pořadí tras, ne jejich buňky, a čára trasy (`routeLine`) čte jen buňky, buňku mřížky a ploty:
  čára se bere z minula podle první buňky a kroků trasy při stejném klíči plotů, obrysy plotů se
  počítají, jen když některá čára chybí; **číselný klíč paměti buněk čtverců** (`fieldCellsOf`,
  `squareCellsOf`) – dřív text z desetinných čísel všech čtverců, teď čísla v poli se součtem
  pro vyhledání a porovnáním číslo po čísle (shoda znamená totéž co shoda textu); **pásy výběru
  dílů sezóny líně** – `seasonSelection` rozvrhovala každý den orbu celého výběru (≈ 1 300 dílů,
  ≈ 90 dní oken setí za rok), pásy ale potřebuje jen u dílů, které se vejdou na čelo práce (bloky
  s nimi mají ≈ 6 % výběru); `ploughBandFinder` rozvrhne jen blok dílu, díly bloku v pořadí jako
  `ploughLayout` (od dílu s nejmenším id po sousedech) – tytéž pásy (test proti celému rozvržení
  i s dvojím políčkem a díly bez políčka); **vstupy výkonu orby plánu** (`sowingFurrowEfficiency`)
  porovná s pamětí číslo po čísle přímo (`sameFurrowInputs`, napřed délka řady), řadu vstupů
  skládá jen při změně (test: každá změna vstupu se pozná). Profil zahřátých roků 2–4 před / po
  hned po sobě (zátěž 2,3; celkem 10,62 → 9,77 s, −8 %): `taskSpans` 0,56 → 0,22 s, čáry tras
  měsíce 0,48 → 0,08 s (`routeLine` 0,35 → 0,11 s – zbytek volají přístupy k vchodům a roční konce tras), pásy výběru
  0,30 → ≈ 0,07 s (`ploughLayout` 0,24 → 0,06 s), `squareCellsOf` 0,19 → 0,11 s (zbytek jsou
  skutečné změny polí – ≈ 5 za rok, pole až 4 520 čtverců), `sowingFurrowEfficiency` 0,23 →
  0,13 s; po částech dne sezóna 1,92 → 1,56 s (výběr dílů 1,19 → 0,92 s), měsíc cest 1,37 →
  1,13 s, práce dne 1,55 → 1,47 s, přepočet tras 2,16 → 2,11 s, správce 1,19 → 1,17 s. Rok Vlkova
  (`years.mts`) střídavě před / po (zátěž 2,1–2,3): roky 2–4 3,19 / 3,72 / 3,90 a 3,17 / 3,78 /
  3,86 s → 2,90 / 3,51 / 3,93 a 2,80 / 3,47 / 3,70 s (průměr 3,60 → 3,38 s, −6 %), rok 1 6,61 /
  6,58 → 6,21 / 6,27 s. Nejvíc dál bere (zahřáté roky 2–4) přepočet tras 2,11 s (hledání sítě
  pěšin `routeAllSteps` 1,02 s – Dijkstra z brány, ceny se mezi domácnostmi mění), sezóna 1,56 s
  (`turnSelection` 0,57 s – druh osevu a bloky osevu všech dílů každý den oken setí), práce dne
  1,47 s (dosah vozů `reachOf` 0,39 s, cesta orby `travelToday` 0,30 s – první volání dne po
  změně stadia dílů přestaví půdu vozu), správce 1,17 s a měsíc cest 1,13 s.
  **Kolo 12 (10. 11. 2026, fronta zrychlení výpočtu – Martin schválil):** navazuje na kolo 11 po
  přílohové soustavě, zimě bez sena, lnu a křesťanství; stav Vlkova z DB 9. 11. (skripty
  `scratchpad/prof12`, strom před změnami `prof12/base`, mikroměření funkcí na stavu ze 14. 9.
  `bench.mts` a úplného přepočtu tras `bench2.mts`). Jen zrychlení – otisk stavu po 1, 2 a 3
  letech před i po každé úpravě týž vcelku i po 37 dnech (sha256 `68650dfcae5f`, `fd83bf7e3fac`,
  `1f72d30671ed` – nové otisky po změně pravidel od kola 11), zlaté otisky testů beze změny. Nové
  kroky jsou levné: `recordFelledSacredOn` po každém dni, štěstí se dvěma skupinami
  (`updateHappiness` 0,04 s) a `snowDaysAhead` v profilu zahřátých roků 2–4 pod 0,01 s. Tři
  úpravy: **výhled ozimu přídělu** (`daysUntilFoodHarvest` – jídlo dne a přežívací zásoba
  `seedKeepKg` ho volají ≈ 5× denně) potřebuje jen vědět, zda odhad ozimu (`expectedWinterKg`)
  dosáhne potřeby do sklizně jaře – sčítání úrody dílů skončí, jakmile ji dosáhne (sčítance nejsou
  záporné, sčítání je monotónní, porovnání dopadne stejně; `cropYieldKg` s `stopAtKg`); **výběr
  dílů dne** (`turnSelection` – každý den oken setí, ≈ 2 200 dílů ve výběru) drží druh osevu,
  díly letošní práce a vybrané díly v polích podle id místo map a množin (díly jsou seřazené podle
  id; id mimo rozsah nebo necelá – mapy jako dřív), díly pro len hledá, jen když len letošní práce
  potřebu nepokryje, a vydává je z haldy v pořadí stabilního řazení (úrodnost, id, pořadí v blocích
  – len bere jen pár nejlepších z ≈ 2 000 kandidátů; rok sklizně lnu `flaxAllowedIn` jednou za
  den) – na stavu ze 14. 9. 2,78 → 1,34 ms za volání; **ves pro pěšiny a pastva**
  (`pathVillageOf` – měsíční úklid cest, převážení tras) rozdělí díly po polích jedním průchodem
  (dřív průchod všemi díly pro každé pole s prázdným polem pro každý cizí díl), `grazedPartIds`
  bere plochu z mapy dílů z paměti (`partsByIdOf`) místo nové mapy ploch – 5,2 → 4,7 ms za volání
  (`pastureGrazedParts` 1,86 → 1,54 ms); `windowSeedNeedKg` sčítá plochu dílů na řadě bez
  seznamu (beze změřitelného zisku – čas nese čtení dílů různých tvarů, `nextSowing` a množina).
  Zkoušeno a vráceno: hledání sítě pěšin bez kontroly okraje u vnitřních buněk (`search`) – úplný
  přepočet tras ≈ 270 ms před i po, v šumu. Profil zahřátých roků 2–4 před / po hned po sobě
  (zátěž 8,5 / 7,7; celkem 11,46 → 11,12 s, −3 %): sezóna 2,18 → 1,77 s (výběr dílů
  `seasonSelection` 1,32 → 0,97, `turnSelection` 0,78 → 0,48, `flaxCandidates` 0,18 → 0,03 s),
  `baseMealInput` 0,57 → 0,39 s (`daysUntilFoodHarvest` 0,34 → 0,17 s), `pathVillageOf` 0,48 →
  0,42 s. Rok Vlkova (`years.mts`) střídavě před / po (zátěž 10,7–12,4): roky 2–4 3,06 / 3,71 /
  4,32 a 3,25 / 3,88 / 4,44 s → 3,02 / 3,61 / 4,46 a 2,93 / 3,59 / 4,15 s (průměr 3,78 → 3,63 s,
  −4 %), studený rok 1 6,90 / 6,93 → 6,86 / 6,70 s. Nejvíc dál bere (zahřáté roky 2–4 po úpravách)
  přepočet tras 2,11 s (`routeAllSteps` 1,09 s, převážení `reweighedList` 0,47 s), sezóna 1,77 s,
  práce dne 1,59 s (odhad jízd vozů `villageCartEstimates` 0,65 s – ≈ 100 volání za rok, čas nesou
  úsečky mimo paměť po změně půdy vozu), správce 1,27 s a měsíc cest 1,21 s (úklid `tidyMonth`
  0,53 s – copánek přes křižovatku `ringBraid` 0,31 s, z toho ves pro pěšiny 0,19 s; vyšlapané kusy
  `eachWearRun` 0,33 s); konce oken setí (`shrinkInPlan` 0,25 s – úseky práce pro každý vrácený
  díl znovu) a denní kontroly změn po všech dílech (`roadFieldsDay` 0,36 s, `updateRuins` 0,25 s).

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
  – `structuredClone` celého stavu byla u velké vsi polovina času dne správce (2. 11. 2026).
  **Záznamy
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

- **Les a dřevo** ([forest.md](../design/forest.md), `domain/village/forest/wood.ts`): klády na hromadě
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

- **Upozornění vsi do kroniky** (absence.md – Upozornění vsi do kroniky,
  `domain/village/core/lasting-notices.ts`): podmínky trvalých stavů jsou v jádře –
  `lastingNotices(state, day)` vrací `LastingNotice[]` v pořadí `LASTING_NOTICES`: stupně hladu
  vnořeně (`rationing` ⊂ `hungry` ⊂ `starving` z `hungerLevel`; `seed-rationing` místo
  `rationing`, když ves šetří jen kvůli osivu – `VillageState.seedRation`), `stalled`
  (`constructionsStalled`), dílny bez vstupu (`no-charcoal`, `no-ore`, `no-clay`, `no-wood`,
  `carpenter-no-wood` – jen obydlené, `workshopActivity`), `pen-short` (`herdsOverRoom` – jeden stav za všechny druhy, stáda přerůstají ohrady každé jaro),
  `oxen-short` (`oxenOverRoom`), `horses-short` (`horsesOverRoom`), `horses-ungrained`
  (`horsesUngrained`), `emergency-threshing` a
  `threshing-floor-short` (`threshingStatus`). Web z týchž funkcí skládá pohled (souhrn,
  `horsesView.ungrained`) a upozornění nahoře. Simulace na konci dne
  (`noticeStatesDay` – poslední krok `simulateDaySteps`) porovná dnešní stavy s
  `VillageState.noticeStates` (`{ since, logged?, off? }` po stavu) a do kroniky zapíše
  `notice-began` (`day` = den začátku, až stav trvá `NOTICE_CHRONICLE_MIN_DAYS` = 7 dní)
  a `notice-ended` (`day` = první den bez stavu, až chybí 7 dní, jen když byl zapsán začátek;
  kratší přerušení stav neukončí; konce téhož dne od nejhoršího stupně). Ves bez
  `noticeStates` (uložená dřív) začne sledovat od prvního dopočítaného dne – převod není
  potřeba; prázdné stavy se neukládají. Denní `hunger-began` / `hunger-ended` zůstávají pro
  deník vsí (`year-log.ts`), panel Kronika je neukazuje.
- **Šetří na osivo** (`VillageState.seedRation?: true`; absence.md – Upozornění vsi do kroniky):
  `eat` (`simulate-food.ts`) v den, kdy ves šetří a drží osivo, které nejí (`seedGrain` –
  `uneatenSeedKg` v `dayMealInput`), spočte jídlo ještě jednou se zrnem celých zásob (`eatsFull`);
  jedla by plně → `seedRation`, jinak se smaže. Starší vsi ho dostanou s jídlem dalšího dne.
  Web: `VillageView.seedRationing` → řádek „Ves šetří na osivo“ (`village-notices.ts`).

- **Krajina sídla** se na serveru drží v LRU mezipaměti (`packages/server/src/landscape-cache.ts`, port
  `LandscapeSource` v `enterGame`) – negeneruje se při každé akci a dotazu. Vrstva překážek
  se generuje až pro stavby (`obstaclesOf`, mezipaměť podle objektu krajiny); dotaz na ves
  (`getVillageView`) ji potřebuje jen při prvním načtení vsi založené před vrstvou (doplnění
  odstraněných překážek, ≈ 300 ms jednou).

- **Překážky ve vsi** (`domain/village/core/obstacles.ts`, fields.md – tabulka překážek): obydlí
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
  odstraněné překážky doplní při načtení s krajinou (`withObstacleClearing` v seznamu převodů).

## Převody starších vsí

Stav vsi je JSON a nové části jsou volitelné (CLAUDE.md – Ves). Starší ves se převádí **jedním
seřazeným seznamem** `VILLAGE_MIGRATIONS` (`domain/village/core/migrations.ts`, položka `{ id, since,
loadOnly?, run(state, ctx) }`), který prochází `migrateVillage(state, ctx)`:

- **Načtení vsi** (`updateVillage`) volá seznam jednou před dopočtem s `ctx.load` (den, do kterého se
  ves dopočítá – `heldDay`, seed počasí a zastávky stezek mapy z úložiště – na zastávky se ptá jen ves,
  která je ještě nemá, jednou za volání –, krajina a vrstva překážek sídla) – projde všechny převody.
  Selhání převodu (`sowingRotationFailed`, `wildlifeFailed`, `horsePenStockFailed`,
  `forestClearingFailed`) zapíše do logu (seznam `failures` v `updateVillage`).
- **Dopočet** (`advanceVillageSteps`, tedy i `advanceVillage`, `foundedVillageState`, spící ves
  v `asleepStay`) volá seznam jednou po `arrive` (ves na cestě se v den příjezdu založí) a před
  `cloneState` – bez `ctx.load`, převody `loadOnly` přeskočí. Po načtení vsi už nic nezmění.
- Každý převod je v seznamu **jednou** (do 11. 11. 2026 byly dva řetězy – 37 převodů v
  `updateVillage`, 27 v `advanceVillage`, 14 v obou v jiném pořadí). Pořadí seznamu je pořadí, ve
  kterém převody dosud skutečně běžely: celý řetěz načtení, za ním převody, které uměl jen dopočet.
  Dopočet tak sdílené převody pouští v pořadí načtení (např. `wildlife` před `kinship`,
  `threshing-grace` před `oxen`, `forest-clearing` před `rotation-next`) – sahají na jiné části
  stavu, výsledek je týž. Jediný střet byl v pořadí klíčů JSONu: starší ves (Chotěšov v DB) dostávala
  `wildlife` před `armsCapped`, nová ves obráceně – nová ves proto má `armsCapped` od založení
  (`foundVillage` volá `withArmsCaps`; dovednosti osadníků nad strop se srazí jako dřív při prvním
  dopočtu) a ze seznamu dostane jen zvěř.
- **`loadOnly`** – převod potřebuje kontext načtení (`weather-seed` seed počasí a `merchant-stops`
  zastávky stezek z úložiště, `pen-grace` den načtení – dopočet sám den nemění), nebo by jednal na
  stavech, které načtením nikdy neprošly: zlatý svět (`foundVillage` bez pozemků, variant domů,
  vzdálenosti k lesu a pastvy) a cesty vzniklé během dopočtu (bez `swathChecked` a `liningPlanned`)
  by `plots`, `dwelling-shapes`, `forest-distances`, `livestock-land`, `road-swaths`
  a `planned-lining` změnily – zlaté otisky i unit testy by se pohnuly. Ostatní převody z řetězu
  načtení zůstaly `loadOnly` jako dřív.
- **Převody po dopočtu** jsou mimo seznam, v `updateVillage` za dopočtem: `withRoutes` (trasy
  z dopočítaného stavu – i opakovaně, když se změní rozložení), `withRoadsV2`, `withRoadsRebuiltSteps`
  a `withRoadsRepairedSteps` (s přestávkami `pause`; kotvy jsou z tras po dopočtu – před dopočtem by
  dal jiný výsledek). Za změnou `withoutBuiltOverRuins` a `withoutBuiltOverGrainPits` – důsledek
  stavby, ne převod.
- **Bez čísla verze stavu** (stateVersion; návrh Clauda, 11. 11. 2026): nový klíč by změnil JSON každé vsi (zlaté
  otisky, uložené stavy) a část převodů není jednorázová (`manor`, `merged-fields`, `merged-roads`,
  `weather-seed`, `cattle-kinds`, `iron-bars-trade`, `foreign-goods` hlídají podmínku při každém
  načtení). Celý seznam na převedené vsi stojí ≈ 2,8 ms při načtení a ≈ 0,3 ms při dopočtu (Vlkov
  z DB) – přeskakováním by se nic neušetřilo.
- **Nová ves** dostane části, které dřív zakládaly převody, už při založení – `foundVillage`
  (`dynasty`, `steward`, `sowingRotation`, `sheaves`, `grainPits`, `manorId`, `armsCapped`)
  a `foundedState` (`withWeatherSeed`, `withPlots`, `withDwellingShapes`, `withLivestockLand`) –
  převody pak mění jen starší vsi. Výjimky: zvěř (`wildlife`) zakládá seznam – `foundVillage` nemá
  krajinu (zlatý svět, osadníci přes `stewardArrival`) – a zastávky kupců (`merchant-stops`) dostane
  i nová ves až prvním načtením; ves na cestě si je přenese do založené vsi (`stewardArrival`,
  `settleJourney`), jinak by je příjezd uvnitř dopočtu zahodil a další dny téhož dopočtu by kupci
  nechodili.

**Nový převod** (pravidlo od 11. 11. 2026): přidej položku **na konec** `VILLAGE_MIGRATIONS` –
`id` (jedinečné), `since` (den zavedení `RRRR-MM-DD`), `run` jednorázový a idempotentní (ves, které
nic nechybí, vrací týž objekt; vstupní stav nemění, mutující funkci pusť na kopii jako
`fourWheelReach`). `loadOnly: true` jen když potřebuje kontext načtení nebo by změnil stavy, které
načtením neprošly. Žádný nový řetěz v `updateVillage` ani `advanceVillage`. Část nové vsi patří do
založení (`foundVillage` / `foundedState`), převod ji doplní jen starším vsím. Selhání = pole
`…Failed` ve stavu a řádek v `failures` (`updateVillage`).

| Převod (`id` – funkce)                                | Co dělá                                                      | Idempotentní       | Potřebuje                | Zakládá novou ves            | Kde     |
| ----------------------------------------------------- | ------------------------------------------------------------ | ------------------ | ------------------------ | ---------------------------- | ------- |
| `same-map-villages` – `withoutSameMapVillages`        | zahodí kování u jiné vsi a `neighbours` (vsi na téže mapě)   | ano                | –                        | ne                           | načtení |
| `weather-seed` – `withWeatherSeed`                    | kopie seedu počasí mapy                                      | ano (při každém)   | seed z úložiště          | ne (`foundedState`)          | načtení |
| `season` – `withSeason`                               | roční plán → hospodářský rok                                 | ano                | –                        | ne                           | oba     |
| `sowing-rotation` – `withSowingRotation`              | osevní postup po dílech, značka                              | ano (značka)       | –                        | ne (`foundVillage`)          | oba     |
| `obstacle-clearing` – `withObstacleClearing`          | doplní odstraněné překážky                                   | ano (značka)       | překážky                 | ne                           | načtení |
| `forest-distances` – `withForestDistances`            | vzdálenost obydlí k lesu                                     | ano                | krajina                  | ne                           | načtení |
| `plots` – `withPlots`                                 | pozemky polozemnic                                           | ano (značka)       | krajina, překážky        | ne (`foundedState`)          | načtení |
| `dwelling-shapes` – `withDwellingShapes`              | varianty rozměrů staveb                                      | ano (značka)       | krajina, překážky        | ne (`foundedState`)          | načtení |
| `merged-fields` – `withMergedFields`                  | sloučí navazující pole                                       | ano (při každém)   | –                        | ne                           | načtení |
| `livestock-land` – `withLivestockLand`                | výchozí stádo, louka a les pro pastvu                        | ano                | krajina                  | ne (`foundedState`)          | načtení |
| `wildlife` – `withWildlife`                           | zvěř na stropu                                               | ano                | krajina (bez ní výchozí) | **ano**                      | oba     |
| `merged-roads` – `withMergedRoads`                    | spojí falešná rozcestí, opraví stezky                        | ano (při každém)   | krajina                  | ne                           | načtení |
| `road-swaths` – `withRoadSwaths`                      | průsek lesem hotových cest, značka                           | ano (značka)       | překážky, krajina        | ne                           | načtení |
| `kinship` – `withKinship`                             | pohlaví a manželé                                            | ano                | –                        | ne                           | oba     |
| `dynasty` – `withDynasty`                             | rod vojvody                                                  | ano                | –                        | ne (`foundVillage`)          | oba     |
| `cattle-kinds` – `withCattleKinds`                    | dobytek ve třech druzích v obchodu                           | ano (při každém)   | –                        | ne                           | oba     |
| `tool-equipment` – `withToolEquipment`                | zásoba nástrojů do vybavení a hřiven                         | ano                | –                        | ne                           | oba     |
| `iron-bars-trade` – `withIronBarsTrade`               | hřivny místo nástrojů v obchodu                              | ano (při každém)   | –                        | ne                           | oba     |
| `foreign-goods` – `withoutForeignGoods`               | zahodí zboží zvenku                                          | ano (při každém)   | –                        | ne                           | oba     |
| `pen-species` – `withPenSpecies`                      | ohrady s druhem                                              | ano                | –                        | ne                           | oba     |
| `pen-grace` – `withPenGrace`                          | roční odklad míst ohrad od dneška                            | ano                | den načtení              | ne                           | načtení |
| `threshing-grace` – `withThreshingGrace`              | snopy a rok odkladu mlácení                                  | ano                | den (načtení / další)    | ne (`foundVillage`)          | oba     |
| `charred-ruins` – `withCharredRuins`                  | ohořelé jámy po požáru                                       | ano                | –                        | ne                           | načtení |
| `walk-stages` – `withoutWalkStages`                   | smaže otisk stadií dílů                                      | ano                | –                        | ne                           | načtení |
| `planned-lining` – `withPlannedLining`                | olemování cest, značka                                       | ano (značka)       | –                        | ne                           | načtení |
| `trampled-parts` – `withoutTrampledParts`             | smaže pošlapanou úrodu                                       | ano                | –                        | ne                           | načtení |
| `bridged-roads` – `withBridgedRoads`                  | hať a lávka místo `causeway`, značka                         | ano (značka)       | –                        | ne                           | načtení |
| `oxen` – `withOxen`                                   | voli po kusech, rádla                                        | ano                | –                        | ne                           | oba     |
| `horse-pen-stock` – `withHorsePenStock`               | koně do ohrady bez koní                                      | ano                | –                        | ne                           | oba     |
| `manor` – `withManor`                                 | dvorec = nejstarší obydlí                                    | ano (při každém)   | –                        | ne (`foundVillage`)          | načtení |
| `wear-seed` – `withWearSeed`                          | vyšlapanost podél loňských úseků                             | ano                | –                        | ne                           | načtení |
| `wear-cells` – `withWearCells`                        | vyšlapanost do buněk 3,75 m                                  | ano (značka)       | –                        | ne                           | načtení |
| `visits-seed` – `withVisitsSeed`                      | provoz ke stavbám od dalšího dne                             | ano                | –                        | ne                           | načtení |
| `road-condition` – `withRoadCondition`                | stav kusů cest z provozu, značka                             | ano (značka)       | –                        | ne                           | načtení |
| `grain-pits` – `withGrainPits`                        | zásoby obilí do jam                                          | ano                | krajina, překážky        | ne (`foundVillage`)          | načtení |
| `forest-clearing` – `withForestClearing`              | fáze klučení dílů v lese                                     | ano                | překážky                 | ne                           | oba     |
| `road-log-piles` – `withRoadLogPiles`                 | klády bez hromady na hromadu u obydlí                        | ano                | krajina                  | ne                           | načtení |
| `rotation-next` – `withoutRotationNext`               | díly bez pevného sledu (přílohová soustava)                  | ano                | –                        | ne                           | oba     |
| `seed-forgiven` – `withSeedForgiven`                  | odpuštěné osivo zaseté části                                 | ano                | –                        | ne                           | oba     |
| `surplus-crops` – `withoutSurplusCrops`               | díly nad potřebu jednou frontou                              | ano                | –                        | ne                           | oba     |
| `seed-target` – `withoutSeedTarget`                   | plán bez cíle osevu                                          | ano                | –                        | ne                           | oba     |
| `sowing-help` – `withoutSowingHelp`                   | rodina bez pomoci s osevem a při hladu                       | ano                | –                        | ne                           | oba     |
| `field-legumes` – `withoutFieldLegumes`               | nezasetý díl luštěnin do jaře                                | ano                | –                        | ne                           | oba     |
| `garden-flax` – `withoutGardenFlax`                   | zahrádka bez lnu                                             | ano                | –                        | ne                           | oba     |
| `arms-caps` – `withArmsCaps`                          | stáhne dovednosti nad strop, značka                          | ano (značka)       | –                        | ne (`foundVillage`, 11. 11.) | oba     |
| `awaiting-lord` – `withAwaitingLord`                  | ves bez muže rodu čeká na vojvodu                            | ano                | –                        | ne                           | oba     |
| `craft-skill` – `withCraftSkill`                      | praxe řemeslníků                                             | ano (značka dílny) | –                        | ne                           | oba     |
| `steward` – `withSteward`                             | správce (vypnutý)                                            | ano                | –                        | ne (`foundVillage`)          | oba     |
| `four-wheel-reach` – `withFourWheelReach`             | dosahy čtyřkoláku znovu (mutuje – na kopii)                  | ano (značka)       | –                        | ne                           | oba     |
| `fort-points` – `withFortPoints`                      | opevnění po čtvercích na body (mutuje – na kopii)            | ano                | krajina                  | ne                           | oba     |
| `quarry-area` – `withQuarriesBesideRocks`             | starý lom z výchozu na plochu u skal (mutuje – na kopii)     | ano (značka)       | krajina, překážky        | ne                           | oba     |
| `people-names` – `withPeopleNames`                    | jména lidem bez jména (muž rodu bez jména čeká na hráče)     | ano (při každém)   | –                        | ne (`foundVillage`)          | oba     |
| `sheaf-work-by-kg` – `convertSheafWorkByKg`           | práce uložených snopů podle kg (D95)                         | ano (`byKg`)       | –                        | ne (sklizeň `byKg`)          | oba     |
| `smoked-meat-stocks` – `smokedMeatStocks`             | uzené 1. 11.–31. 8. do zásoby z porážky 1. 11. (D98)         | ano (vždy číslo)   | –                        | ne (`foundVillage` – 0)      | oba     |
| `fictional-neighbours` – `withoutFictionalNeighbours` | smaže zbytky roku smyšlených sousedů, výpravy na cestě nechá | ano (při každém)   | –                        | ne                           | oba     |
| `plough-rate` – `setPloughRate`                       | sazba orby letošního plánu (25. 11. 2026, oxen.md)           | ano (`perHa`)      | –                        | ne (`createCropWork`)        | oba     |
| `merchant-stops` – `withMerchantStops`                | zastávky dálkových stezek mapy, i prázdné (markets.md)       | ano                | zastávky z úložiště      | **ano**                      | načtení |

„Zakládá novou ves“ = jedná na právě založené vsi; v závorce, kde tu část nová ves dostane při
založení. „Při každém“ = bez příznaku, hlídá podmínku při každém průchodu (levné).

## Spící vsi se kvůli dni neukládají

`isVillageAsleep` (`departure.ts`) = vymřelá nebo opuštěná (odpovídá sloupci `asleep`; ves na cestě
nespí, čeká na správce). `advancedToToday` u ní nic nesimuluje: jen převody seznamu (bez `loadOnly`) bez
posunu dne, a když nic nezmění (JSON shodný), vrátí týž objekt – `updateVillage` ji pak neuloží
(`untouched`). `lastDay` spící vsi zaostává; `abandonedVillageAt` ho v pohledu zvedne na den
pohledu, `currentVillageViewStamp` spící vsi s `lastDay < dnes` ignoruje.

## Uložení stavu vsi (tabulka `village`, kodek)

Martin 11. 11. 2026 schválil („Ano“) návrh Clauda: stav na hranici adaptéru zeštíhlit, zřídka
měněné části ukládat zvlášť jen při změně a ukládat komprimovaně místo jsonb.

- **Doménový tvar `VillageState` se nemění** – kodek `packages/db/src/adapters/village-state-codec.ts`
  (`encodeVillageState` / `decodeVillageState`) ho při zápisu rozdělí podle stromu `LAND` na **zem**
  (`parts`, `clearedObstacles`, `felledTrees`, `disasters`, `routes`, podklíče
  `roads.{earthworks, roads, trees, apples, junctions, swath}` a `wildlife.damage.risk`) a **den**
  (zbytek; nese i pořadí klíčů rozdělených objektů). Obě části jsou `JSON.stringify` + zstd úrovně 1
  (`node:zlib`; úroveň 1 je u stavu vsi stejně malá jako 3–6 a několikrát rychlejší) ve sloupcích
  `state_day` a `state_land` (`bytea`, `STORAGE EXTERNAL` – TOAST už nekomprimuje). Dekódování vrátí
  tentýž JSON včetně pořadí klíčů (`JSON.stringify(decode(encode(s))) === JSON.stringify(s)`;
  jsonb klíče přeřazoval).
- **Zem jen při změně:** `land_hash` = sha256 zemského JSON. `save` napřed zapíše jen den
  s podmínkou `version = očekávaná AND land_hash = nový` (zem se ani nekomprimuje); když se nic
  nezapsalo, druhý `UPDATE` zapíše i zem a o konfliktu verze rozhodne sám. Optimistické zamykání
  `version` a souhrn `digest` beze změny.
- **Odvozené sloupce** zapisuje adaptér s každým stavem (`villageDerivedColumns`,
  `village-state-row.ts`): `last_day`, `asleep` (do migrace 0043 generované z jsonb), `origin`
  (unikátní index `village_origin_uq`) a `refuge_ref_id` / `refuge_host_village_id`
  (`RefugeRepository.awayVillages`). SQL do stavu nesahá.
- **Líný převod** (migrace `0043_village_state_codec`): `state` jsonb je nullable; řádek bez
  `state_day` se čte ze `state` (`storedVillageState`) a první uložení ho převede (`state` = NULL).
  Odvozené sloupce migrace doplnila z jsonb hned. Sloupec `state` jde smazat, až se převedou všechny
  vsi.
- **Přímé SQL** (e2e, měřicí skripty) jen přes `@bohemia/db/village-state`: `readVillageState`,
  `writeVillageState` (jako server – odvozené sloupce, souhrn, verze + 1), `updateVillageState`
  (transakce s `FOR UPDATE` – náhrada `jsonb_set`), `VILLAGE_STATE_SQL_COLUMNS` pro kopii řádku,
  `villageStateSizeSql` pro řazení podle velikosti; e2e pomocníci `villageStateById`,
  `changeVillageState…` (`apps/web/e2e/village-helpers.ts`). Testy, které vkládají ves samy,
  berou `newVillageRow`.
- **Pravidlo:** nový klíč stavu patří do dne, pokud se nemění jen se zemí (stavbou polí a cest,
  klučením, pohromou). Do země jen velká a zřídka měněná část – každá změna země přepíše celou zem.
- **Měření** (11. 11. 2026, Vlkov 3,3 MB JSON): řádek na disku 640 → 373 kB (den 69 + zem 304 kB),
  uložení 97 → 24 ms, načtení 29 → 13 ms (starý zápis emulovaný tabulkou s jsonb a generovanými
  sloupci). Rok den po dni (starší kopie Vlkova, uložení každý den): zem se přepsala 94× z 365,
  zapsáno ⌀ 117 kB za den (den 42 + zem 75 kB), WAL za uložení 631 → 131 kB.

## Vymýcený les (jádro)

- `core/cleared-forest.ts`: `clearedForest` (maska po políčkách krajiny – podíl vykácených, pokácených a dorůstajících dospělých stromů ≥ `CLEARED_SHARE`, založené díly polí, `areas` pasek pod stavbami) přesunutý ze scény bez změny chování; scéna ho re-exportuje (`apps/web/lib/scene/cleared-forest.ts`, scene.md – Vymýcený les).
- `clearedForestOf(l, layer, sources)`: jediný výpočet vymýceného lesa vsi ze zdrojů `ClearingSources` – změny překážek, díly polí (zakládaný díl se nepočítá; díl natočené mřížky = políčka, jejichž střed na dílu leží), plochy `forestClearingsOf` obydlí a dílen bez pozemku (i rozestavěných), u obydlí s pozemkem jen čtverec, který nezabírá přesně políčko (`plotClearing` – natočený, i po 90° jako dřív, nebo bez natočení se středem mimo střed políčka – D96, 18. 11. 2026), posvátné stavby, `kilnCircle` milířů a milířišť a pás opevnění (`fortificationBand(l, f, true)` – každý úsek v šíři stojícího, i rozestavěný a zbořený: stromy v pásu padnou už se zahájením stavby, `startFortification`; plán 2026-11-16-dense-forest – Rozhodnutí 1, návrh Clauda). `villageClearings(l, layer, village, day)` skládá zdroje ze `VillageState` (pro hledání cesty vojska), scéna z pohledu na ves (`villageClearedForest`) – oba dávají tytéž paseky (test `apps/web/lib/scene/__tests__/cleared-forest-core.test.ts`).
- Čte ho `war/dense-forest.ts` (`withoutClearings`): paseky odřezávají hustý les pochodu do `WAR.march.denseForestM` od sebe (war.md, forest.md – Hustý les).

## Deník vsí (`village_year`)

Martin 1. 11. 2026: „na tohle asi ser, podle mě bude stačit logovat hru“ (místo velkého měření správce). Za každou ves a dokončený herní rok jeden řádek – `villageYearRow(stav)` v `domain/village/core/year-log.ts` (čistá funkce nad stavem na konci roku: lidé dospělí/děti, narození a úmrtí z kroniky roku, z toho hladem, sklizeň, zásoby (vymlácené i zrno v nevymlácených snopech – výmlat běží do konce února, od 9. 11. 2026), dny hladu, pole a oseto (skutečně zasetý podíl prací hospodářského roku – `sownShare` × výměra dílů práce; od 6. 11. 2026, dřív díly ve stavu `sown` už od výběru do plánu), stáda, správce zapnutý, dostavěné stavby podle druhu, odchody synů, pohromy).

- `updateVillage` dopočítává po kouscích končících na přelomu roku (`nextYearEnd`; stav je týž jako bez dělení) a řádky předá `VillageRepository.save(…, yearRows)`; adaptér je zapíše v téže transakci jako stav (`ON CONFLICT (village_id, year) DO UPDATE` – opakovaný zápis řádek přepíše). Worker i web jdou stejnou cestou. Cena zápisu: jeden upsert za ves a rok, v měření v řádu jednotek ms na save (v šumu).
- Počty událostí se čtou z kroniky (max. 500 událostí) – při přetečení je `chronicleFull` a počty jsou dolní odhad. Nejnižší zásoby za rok se nesledují (stav na konci roku jen).
- Spotřeba obilí není ve stavu: příkaz ji dopočítá jako zásoby loni + sklizeň – zásoby letos (jen když je řádek loňska). Dostavěné stavby jsou všechny, ne jen správcovy.
- Výpis: `npm run village-log -- --village <id|jméno> [--player <id>] [--from rok]` (bez filtrů všechny vsi; `DATABASE_URL` jinak `bohemia`).
