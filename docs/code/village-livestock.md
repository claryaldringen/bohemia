# Ves – strava, dobytek, ohrady, voli, vozy ve scéně

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: diet.md, oxen.md, wagons.md v `docs/design/`.

- **Dvě seče podle stád** (oxen.md – Seno, dvě seče; Martin 25. 10. 2026, návrh Clauda schválený):
  `HAY_CUTS` (rules-livestock.ts) – 1. seč 25. 5. – 30. 6. (`MOWING_DAY`, plán `planMowing`),
  otava 1. 8. – 30. 9. (`AFTERMATH_DAY`, plán `planAftermath` – jen posečené louky 1. seče,
  rozpracovaná posečenou plochou, výnos `aftermathYieldShare` 0,4, práce na ha
  `aftermathWorkShare` 0,6). `mowingNeed` (husbandry.ts): `necessaryKg` = dnešní stádo (nejvýš
  `wantedWinterHerds`), voli `hayOxen`, koně a čekající na porážku; `capKg` = `winterHayNeedKg`
  × (1 + `reserve` 0,2). Plán (`mowingPlan` v hay.ts) bere louky od nejbližší do stropu bez zásoby
  (`mowingTargets`), `needed` = práce do nutného. Otava nahradí `hay.mowing` (`cut: 2`,
  `firstCut` – posečené díly, plocha přirozených luk a seno 1. seče: `mownPartIds`,
  `hayPlanPartIds`, `hayPlanNaturalHa`, `seasonHayYieldKg`); bez potřeby otavy zůstane 1. seč.
  Okno podle seče `isMowingSeason(day, cut)` / `mowingCut`. Práce (simulate-work.ts): úloha
  `mow` jen s nutnou prací (`mowingNeededRemaining`), `end: Infinity`, `tie: 3` – za všemi
  úlohami dne, před stavbami; **seč navíc** (`extraMow`) až po stavbách, opravách a osevu navíc,
  pěšky, v `LaborDay` přes `DayWork.extraMow` (díl `mow`, ne `idle`). Seč bez `needed` (uložená
  před 24. 10. 2026) je celá nutná. Výnos a práce otavy znají `economy.ts` (`mowingYieldPerHa`,
  `mowingWorkShare`) a `land-taken.ts`. Předtím (24. 10. 2026) se plánovaly všechny louky na
  dosah 1. 6. a seč běžela v červnu–červenci. Přednost stád `HERD_PRIORITY` (livestock.ts – krávy, ovce, kozy, prasata; voli před
  všemi) pro pastvu a seno (`winterTargets`), pasáky (`watchedShares` po druzích)
  i výrostky (`youngRoomTargets` nad `breedingFloor`). `sizeHerdsToNeed` stádo nezmenšuje – celé
  stádo v nosnosti a jen plán luštěnin (`legumeKg`, `sufficient`); `keepUneatable` zrušeno, maso
  navíc z mláďat `MEAT_ORDER` prasata, kozy, ovce, krávy. **V zimě** `hayShortSlaughter`
  (husbandryDay před `feedHay`): seno do konce března (`hayWinterDaysLeft`, `hayLeftAvailable`)
  po volech a koních v pořadí přednosti, chybí-li na celý kus, hned porazí celé kusy (kozy,
  ovce, krávy) i všechny čekající (`culling`), chovný pár zůstane, maso do uzení – kronika
  `hay-slaughter`, upozornění „Chybí seno – porazili …“. Zimní úhyn `starveHerds` zrušen (kronika
  `herd-starved` jen ze starších vsí). Náhrada posledního páru (`oxenTraining` – `lastPair`) platí
  i po rozpadu páru, když ves má rádlo (`villageArds`). Ves sama nekupuje ani neprodává.

- **Strava a dobytek** ([diet.md](../design/diet.md)): jídlo dne `eatDiet` / `villageMeal`
  (`diet.ts`) – ovoce (jablka; v rozhraní „ovoce“) rovným dílem do zkažení 1. 3., čerstvé mléko
  a vejce, maso rovným dílem do zkažení 31. 8. (`daysUntilMeatEnd`; 1. 9. ráno se zbytek zkazí –
  `spoilMeat`, kronika `meat-spoiled`, upozornění; maso ze září a října do porážky – Martin:
  „uzené maso určitě také nevydrží 3 roky“), sýr do 1. 5. (`daysUntilMilking`), obilí
  dorovná; stropy ovoce 25 %, maso 40 %, mléko a sýr 30 %, luštěniny 25 % potřeby energie
  (`DIET`); luštěniny (`legumes.ts`) rovným dílem do sklizně 31. 7. (`daysUntilLegumeHarvest`).
  **Bílkoviny** (Martin 18. 10. 2026): 1,6 g na kg tělesné váhy (`PROTEIN`, `proteinNeedPerDay`
  – 20 / 60 / 58 kg), nasycení = energie × kvalita (`dietQuality` = 0,6 + 0,34 × bílkoviny +
  0,06 × ovoce; jen obilí ≈ 80 %). **Mléko a sýr** (`dairy.ts`): dojí se samice, které letos rodily
  (`dairyDams` – Porážka v zimě) v době dojení (`dailyMilk`, `DAIRY`), nevypité mléko → sýr (`cheeseFromMilk`,
  `VillageState.cheeseKg`, ztráta 15 %/rok). **Práce se zvířaty** (`animalCareNeed`,
  `ANIMAL_CARE`) jde **bokem** (Martin 19. 10. 2026 – dojení a péče ženy, pasení výrostci;
  population.md – Práce): z práce vsi nebere, dojí se vždy celé stádo; činnosti `milking`
  a `animal-care` jsou jen v `LaborDay.aside` (`asideWork` v `simulate-work.ts`) pro postavy.
  `VillageState.diet` nese jídlo posledního dne (energie, bílkoviny, kvalita, nasycení, podíly
  obilí / maso / mléko / vejce / ovoce / luštěniny – `legumes?`, starší jídlo bez něj). **Hlad z energie:**
  `nextStarvationDays` a přirážka úmrtnosti dostávají energii, porody a štěstí nasycení
  (`populationDay(state, day, satiation, energy)`, ovoce štěstí +5 – `HappinessFactors.fruit`,
  maso až +3 – `meatHappiness`, `HappinessFactors.meat`). Stáda `VillageState.livestock` (`livestock.ts`: počty
  s podílem kusu, mláďata 1. 4., porážka v zimě – nad nosnost, staré kusy a nejvýš polovina mláďat na maso,
  chovný pár zůstane; potřeba masa z bílkovin, které chybí i po luštěninách ze zásoby
  `meatNeedPerYear` / `proteinBudget`; vejce denně; `meatKg` se uzí 20 %/rok).
  **Stáda realističtěji** (diet.md, Martin 19. 10. 2026; čísla návrh Clauda podle rešerše
  `research/2026-10-19-herds-hay-meat.md`): roční ztráty `LIVESTOCK.lossPerYear` (ovce 12, kozy
  10, prasata 12, skot 6 %) po dnech (`herdLosses`, i z `young`); nosnost `winterTargets` –
  pastva a seno podle přednosti (`HERD_PRIORITY` od 24. 10. 2026: voli, krávy, ovce,
  kozy – napřed zarůstající příloh `goatBrowseHa`; dřív `GRAZING_ORDER` s ovcemi na vlnu napřed), seno po ztrátách ve stohu
  (`winterHayAvailable`), prasata podle lesa celý rok, nejvýš podíl uhlídaný pasáky (`herding`);
  **místa na noc** (oxen.md – Ohrady podle druhu, diet.md – Místa na noc): `WinterInput.room` =
  `herdRoom` (pens.ts – ohrady svého druhu `penCapacity` + pár kusů u domů `homesteadRoom`) – přes
  zimu nejvýš `roomForWinter` (místa ÷ (1 + mláďata na kus)), chovný pár vždy, čekající kusy
  `winterWait` jen do volných míst; **chovné stádo podle potřeby** `sizeHerdsToNeed` – pár a krávy
  `breedingCows` (husbandry.ts: kráva na 2 domácnosti a k ní s ohradou volů 3 + půl krávy na
  každého vola, kterého ves chce na rádla i vozy – `oxenCows`, cíl krav podle volů; Martin 20. 10. 2026: „Dejme možnost 1.“ – dřív víc z obojího), pak **rovnovážné hospodaření** (diet.md – Rovnovážné
  hospodaření; Martin 19. 10. 2026: „aby byla sytá, měla ± ideální kombinaci stravy, ale aby jí
  zároveň zbylo co nejvíc volného času na rozvoj“): cena jídla v práci `foodCosts` (`economy.ts` –
  čd na kg obilí a luštěnin z dílů v osevu, sena z plánu seče; ve vsi `villageFoodCosts`
  v husbandry.ts), kus za rok `headEconomy` (maso z mláďat, mléko × 0,85, práce vsi jen na seno
  a porážku; pasáci nic nestojí a plán je nepočítá – výrostci omezí stádo jen přes nosnost
  `winterTargets` s `herdingCoverage`); hladový výběr po kusech (luštěniny po `BALANCE.legumeStepKg`) podle práce mínus
  ušetřené obilí na kg bílkovin navíc proti obilí – napřed co práci šetří, vždy, v pořadí
  `BREEDING_ORDER` (ovce → kozy → krávy → prasata – Martin: ovce napřed) do nosnosti a stropů
  `DIET.caps`; pak do potřeby × 1,1 (`BALANCE.proteinReserve`) nejlevnější (přežvýkavci
  v pořadí, prasata a luštěniny cenou), nad 88 % (`minProteinCoverage`) jen bílkoviny levnější
  než z obilí. Týž plán `balancedPlan` (s luštěninami – zásoba luštěnin stádo
  nezmenší) řídí seč 25. 5. a otavu 1. 8. (`wantedWinterHerds`), luštěniny osevu 1. 9. (`plannedLegumeKg` →
  `sowingTargets`) i porážku 1. 11.; zbytek i dospělé kusy na maso, ale stádo v nosnosti jen
  o tolik masa, kolik ves do 31. 8. sní pod stropem (`keepUneatable`, `meatEatableKg` – zbytek
  žije; co přeroste nosnost, jde vždy – diet.md, Chovné stádo podle potřeby); stádo pod potřebou dá na
  maso navíc mláďata v pořadí prasata, krávy, kozy, ovce (`MEAT_ORDER`).
  **Nouzová porážka** (diet.md – Nouzová porážka, Martin 19. 10. 2026; `emergency-slaughter.ts`,
  `EMERGENCY_SLAUGHTER` v `rules*.ts`): v `eat` před jídlem dne, když výhled do sklizně nevychází
  (`dayMealInput` – týž vstup `eatDiet` jako jídlo dne), ves porazí zvířata navíc – prasata, kozy,
  krávy nad `breedingCows`, ovce nad `woolSheep`, chovný pár zůstane (`emergencySpare`); nejméně
  masa, se kterým výhled vyjde i s rezervou `reserveShare` (5 % potřeby do sklizně – půlení
  v `emergencySlaughterPlan`, mléko zabitých dojnic se odečte), nejvýš kolik pod stropem masa
  (`DIET.caps.meat` platí i v nouzi) pomůže. Maso přes `butcher` (uzení, zkažení 1. 9.), práce
  mimo listopad `slaughterWork.emergency` (úloha `slaughter` hned), kronika `emergency-slaughter`
  (kusy), upozornění „Vesničané porazili 12 prasat navíc“ (`formatAnimals`). Prasata jen nad chovné
  prasnice (`emergencyPigFloor` – `EMERGENCY_SLAUGHTER.pigForestShare` 0,5 nosnosti lesa pro
  prasata jako ve `winterTargets`, aspoň chovný pár; Martin 19. 10. 2026). Letošní mláďata ne,
  kromě selat od 1. 9. (`pigletsSpared`, `EMERGENCY_SLAUGHTER.pigletsFromMonth`; Martin 19. 10.
  2026: „Ano ke všem návrhům“ – hladový podzim) – ta se počítají do prasat nad prasnicemi.
  **Porážka v zimě** (diet.md – Porážka v zimě, Martin 19. 10. 2026; `HERD_BREEDING`,
  `HERD_RETIREMENT` v `rules*.ts`, rešerše `research/2026-10-19-breeding-culling.md`): rodí všechny
  chovné samice (`LIVESTOCK.growth` = podíl samic × mláďata na samici – ovce +64 %, kozy +78 %,
  prasata +144 %, krávy +40 %), dojí se jen samice, které letos rodily (`dairyDams` /
  `villageDams` – dospělé kusy bez letošních mláďat × podíl samic; `dailyMilk`, `yearlyMilk`,
  `milkEnergyBetween` berou dojné samice). Porážka 1. 11. (`slaughter`): stádo přes zimu nejvýš
  `winterKeepTargets` – `winterTargets`, místo pro jarní mláďata podle výrostků příštího léta
  (`youngRoomTargets`, `nextSummerDay` 1. 7., `youngsterHerders` z věku dnešních dětí), bez
  starých kusů (`retiringHeads`), chovné minimum `breedingFloor` vždy; staré a nad nosnost na maso
  vždy, `keepUneatable` jen pro ostatní. Kusy na maso čekají přes zimu (`winterWait` – čerstvá
  spotřeba zimy `freshMeatPerDayKg` × 151 dní, napřed prasata v lese, pak krávy, ovce, kozy; co
  seno neuživí, hned do uzení) v `LivestockState.culling` (ve `herds`), `winterSlaughterDay`
  (husbandryDay) je porazí po dnech v pořadí kozy, ovce, krávy, prasata do `VillageState.freshMeatKg`
  – jí se napřed (`DietInput.freshMeatKg`, výhled `freshAheadEnergy` / `freshMeatAheadEnergy`,
  `DietDay.shares.freshMeat`), co se nesní, se udí; 31. 3. zbytek do uzení. Seč 1. 6. počítá se
  senem čekajících (`winterWaitHayKg` ve `winterHayNeedKg`), práce porážky po dnech přes zimu
  (`slaughterRemaining` – `isSlaughterSeason`), kronika `slaughter` s `fresh`.
  **Oděv – vlna** (diet.md – Oděv; Martin 19. 10. 2026: „Ovce jsou hlavně kvůli vlně, aby se lidé
  mohli vůbec oblékat.“; `wool.ts`, `WOOL` v `rules*.ts`): ovce na vlnu `woolSheep` (dospělý 1,6 kg,
  dítě 0,8 kg ÷ 0,8 kg z ovce) jsou spodní hranicí ovcí – `minSheep` ve `farmInput` →
  `winterTargets` (pastva a seno: voli, ovce na vlnu, krávy `minCows`, …; pasáci napřed ovce na
  vlnu – `watchedShares`) i `sizeHerdsToNeed`, maso navíc z mláďat je nebere; osadníci nové vsi
  `foundingLivestock` a seno na první zimu (`foundVillage` – `winterHayKg`). Vlna není
  zásoba – porážka zapíše podíl oděvu `LivestockState.wool` (`recordWool`, kronika `wool-short`,
  upozornění „Chybí vlna na oděv“ pod `WOOL.noticeBelow`), štěstí `HappinessFactors.wool` až −6 (`woolUnhappiness`); vsi
  bez zápisu (dřívější) beze změny do porážky 1. 11. Práce na vlně je v `DOMESTIC` (přerozdělení). Zimní úhyn 1. 3. (do 24. 10. 2026 – nahradila ho `hayShortSlaughter`)
  (`starveHerds` z `herdHayCoverage` – pod polovinou přídělu, chovný pár přežije, kronika
  `herd-starved`). **Pasáci** (`herding.ts`, `HERDING`): plný pasák 40 krav (i voli), 100 ovcí či
  koz, 50 prasat, výrostek 7–13 let `childShare` 40 %; **pasou jen výrostci** (`isYoungster`,
  mimo práci vsi; dospělí ani starší ne – Martin 19. 10. 2026: „Když bude ve vsi málo vhodných
  dětí na pasení, tak to omezí i velikost stád.“); `herdingDay` – kolik výrostků dnes pase;
  přežvýkavci duben–říjen, prasata celý rok; `recordHerding` sčítá `LivestockState.herding` od
  porážky do porážky, `herdingCoverage` jde do porážky, `pastureGrazing` a pastvy; `LaborDay.herders`
  (výrostci u stád) → `SceneLabor.herders` → `herderKinds` ve `villager-plan-cast.ts`. Porážka a uzení jdou před polními úlohami (přes zimu po dnech).
  Louka a les do 600 m pro pastvu jsou z krajiny ve stavu
  (`LivestockState.land`) – doplní je `withLivestockLand` (založení vsi i migrace v
  `updateVillage`); bez nich výchozí `LIVESTOCK.defaultLand`. Den hospodářství `husbandryDay`
  (`husbandry.ts`) běží před plánem osevu: ztráty stád a seno ve stohu, ohrady a zimní úhyn,
  mláďata, zkažené staré seno a plán seče, zkažené maso, porážka, zimní seno.

- **Ohrada, spřežení a orba rádlem** ([oxen.md](../design/oxen.md), `oxen.ts`, `plough.ts`,
  `hay.ts`): ohrada (`BuildKind` `'pen'`, `penSquaresFromCells` / `checkPenPlacement` po
  čtvercích, `foundPen`, use-case `placePen` s `species` a `cells`) – **ohrady podle druhu**
  (oxen.md – Ohrady podle druhu; Martin 19. 10. 2026: „Zvířata je potřeba na noc zavírat do ohrad.
  Každý druh zvířete by měl mít vlastní ohradu, ať se nemíchají. … má to být ohrada, ne výběh.“;
  `pens.ts`): `Pen.species` (`PenSpecies` – `sheep`, `goat`, `pig`, `cattle`, `team`; starší
  ohrady převede `withPenSpecies` v `updateVillage` i na začátku `advanceVillage` – se spřežením
  nebo výcvikem `team`, jinak `cattle`), první čtverec `cell` / `x` / `z` (přístřešek) a další
  `Pen.extraSquares` (`PenSquare`, rozšíření ve stavbě s `constructionId` – `finishPen(…, c.id)`),
  nejvýš `PEN_SQUARES.max` (4) souvislé stranou; čtverce navazující na ohradu téhož druhu ve
  stejné mřížce ji rozšíří (`touchingPens`), na dvě navázat nejde; cena po čtvercích (40 čd
  a 6 stromů na čtverec, z toho plot polovina práce a 4 stromy jen za nové vnější strany –
  `penLaborManDays(…, squares, fenceSides)`, `penTrees`, `newFenceSides`; plot 1,5 m uvnitř čtverce,
  mezi sousedními ohradami ulička 3 m – oxen.md, Plot ohrady podle délky; vozová síť `cartGrid`
  blokuje jen buňky uvnitř plotu, `fencedCells` v `paths/network-grid.ts`). Místa `PEN_PLACES_PER_SQUARE` (ovce 130,
  kozy 100, prasata 80, krávy 45) a u domů `HOMESTEAD_HERD` v `rules*.ts`; `penCapacity`,
  `penOccupancy`, `herdRoom`; panel ohrady ukáže místa všech ohrad druhu / potřebu stáda
  (`herdPlaces` v husbandry.ts → `VillageSummary.herdPlaces` → `VillagePen.herdPlaces`, červeně
  když chybí – Martin 20. 10. 2026); **roční odklad** – místa omezí stádo až od
  `LivestockState.pensFromDay` (`pensLimitHerds`; nová ves rok po založení – `foundVillage`, starší
  ves rok od načtení – `withPenGrace(state, today)` jen v `updateVillage`, `PEN_GRACE`), upozornění
  `herdsOverRoom` platí i během odkladu; výcvik jen v ohradě spřežení (`oxPens`, `trainingBlock` – „Ohrada
  není pro spřežení.“). Stavba se dřevem jako obydlí. **Výcvik spřežení začne sám** (Martin:
  „ve chvíli, kdy mají vesničané k dispozici cokoliv, co jim ulehčí práci – zde
  rádlo a voly – začnou to automaticky používat“ – princip pro celou hru, oxen.md – Spřežení):
  `trainTeamsWhenReady` v `husbandryDay` (po mláďatech 1. 4.) každý den, kdy `trainingBlock` je
  null – ohrada stojí, nic se necvičí, spřežení není nebo je v posledních 2 letech služby
  (`serviceYearsBeforeTraining`), aspoň 3 krávy, dřevo na rádlo, v zimě seno volům i telatům do
  konce března (`hayWinterDaysLeft`) – vezme 2 telata ze stáda a postaví rádlo (stavba `'ard'`
  ze společné práce); po 2 letech `Pen.team`, po 10 letech na maso; druhé spřežení = druhá ohrada.
  Hráč výcvik nezadává (akce, use-case i tlačítko zmizely). Seno `VillageState.hay` (seč 1. 6. z úhoru ve
  fázi louky a přirozených luk do 600 m od obydlí – `planMowing` s potřebou `winterHayNeedKg`
  (zimní stádo podle potřeby `wantedWinterHerds` + voli ohrad, se ztrátou do zkrmení
  `PLAN_HAY_KEEP`), práce `HAY_WORK_PER_HA` meze 15 → 10 čd/ha
  (`hayWorkPerHa`), dávky `HAY.dailyKg` kráva 5, vůl 6, ovce a koza 1 kg, stoh 10 %/rok (`rotHay`),
  zbytek loňského k 1. 6. shnije (`spoilOldHay`) – oxen.md, Seno, Martin 19. 10. 2026;
  `HayMowing.squares`,
  od nejbližší po pěšinách a pevných cestách (`partWalkDistance`, přirozené louky
  `walkDistancesTo` z `paths/village.ts` přes `walking.ts` – měří se jen louky v dosahu podle
  `FASTEST_WALK_SHARE`), jen kolik je třeba; pěšina k sečeným loukám – `PathVillage.hayMeadows`
  a práce `meadow`; sezónní úloha `mow`, vzhled políček `hayMeadowLooks`; zimní krmení `feedHay` –
  voli první, krávy, ovce a kozy poměrně; pokrytí volů `oxenHayCoverage` a stáda
  `herdHayCoverage` k 1. 3.). **Orba – jen rádlo** (oxen.md – Jen rádlo; Martin 19. 10. 2026:
  „Pokud je k dispozici rádlo, kopání motykou úplně vynech.“): plán s vycvičeným spřežením
  (`YearPlan.ard`) orá všechny díly všech plodin (`CropWork.plough` – `partIds` = díly plodiny,
  `required.dig` 0, i prázdná plodina orbu má, ať přidané díly orá – `addToCropWork` podle
  `work.plough`); drn (`hasSod` – příloh ve fázi louky, louka založená rádlem `FieldPart.sod`)
  `PLOUGH_SOD_FACTOR` (2,5×) práce a ve váze orby (`PloughWork.sodIds`), křoviny a mladý les
  vrácení ručně a pak běžná orba. Založení louky vsí se spřežením jen za překážky
  (`partFoundingCost(…, ard)`, díl dostane `sod`, bez překážek hotový hned – `foundPart` v `build`;
  u kurzoru `PlacementVillage.ploughTeam`). Plán osevu hlídá kapacitu spřežení
  (`SowingCapacity.plough` – okna orby, `fitsWinter` / `fitsSpringPlough`), co nezorají, se
  nezaseje (setí za `tilledShare`). Úloha `plough` v oknech kopání, nejvýš `ploughCapacityPerDay`
  (slabí voli po zimě `team.weak` od 1. 3.). Ztráta posledního spřežení: `finishPlanByHoe` →
  `ploughToHoe` – letošní plán dokončí motyka (kopání s hotovým podílem, kam došla orba). Starší
  plán s částí kopanou motykou doběhne (`digWeight`). **Co nejdelší brázda** (oxen.md; Martin 19. 10. 2026): `plough-blocks.ts` – `ploughLayout` rozloží díly plodiny na bloky (sousední díly
  pole) a pásy podél osy bloku (`furrowAxis` – delší průměrná brázda, Martin: i sever – jih;
  ve scéně textury a koruna dílu orby podél brázdy – `DecalPiece.rows`), bloky od
  nejbližšího, pásy napříč od vsi (`sweep`), U rameno po rameni; `CropWork.partIds` ve vsi s orbou
  v pořadí orby, `PloughWork.bands` (`PloughBand` – díly, osa, směr, blok). Díly pásu mají ve
  `field-progress` úsek celého pásu (`bandSpans`, `PartSpan.share` – podíl dílu; orba i setí),
  `PartView.furrow` → `SceneFieldPart.furrow`. Výkon `furrowEfficiency` (L / (L + v·t), `FURROW`)
  a cesta k bloku `plough-trip.ts` (`ploughDayFactor` – pás na čele orby, cesta jen tam
  `travelShare`, `TEAM_TRAVEL`) násobí denní kapacitu v `fieldTasks`; plán osevu
  `plannedFurrowEfficiency`. **Spřežení zůstane na poli** (oxen.md, 24. 10. 2026):
  `PloughWork.trip` (`PloughTrip` – blok, `arrived` den a odkud, `home` den návratu) – cestu dne
  určí `ploughDayFactor` jednou (`PloughTravels`, ze stavu ráno: výjezd vozovou sítí
  `villageCartRoutes` z ohrady, přesun od konce bloku `villageCartRoutes(…, from)`, u bloku nic),
  večer `settlePloughTeams` (v `work` po osevu navíc) zapíše příjezd, jen když plodina dnes
  orala, a návrat (zoráno potřebné, okno zítra neběží, ves bez párů). `ploughTeamsAfield` ráno:
  vozy nemají páry (`cartFleetToday`) a voda ráno jen v den výjezdu.
  Postup po dílech zná úlohu `plough`
  (`field-progress.ts`), rozdělení práce posílá činnosti `plough`, `mow`, `slaughter`, `pen`.

- **Ohrada volů a kolik volů a vozů ves chce** ([oxen.md](../design/oxen.md) – Ohrada volů,
  voli po kusech a potah, Kolik volů ves chce; [wagons.md](../design/wagons.md) – Kolik vozů ves
  chce; Martin 20. 10. 2026: „Ať to funguje jako se stády - ohrada pro voly udrží určitý počet
  spřežení a když bude vesnice potřebovat víc vozů, ohrada se musí zvětšit.“): ohrada spřežení je
  ohrada volů (druh `team`, hráč „Ohrada volů“ / „Voli“), voli po kusech `Pen.oxen` (`Ox.trainedDay`
  – výcvik 2 roky, služba 10 let), 6 volů na čtverec (`PEN_PLACES_PER_SQUARE.team`, `oxPlaces`),
  rádla `VillageState.ards`, potah `DRAFT_OXEN` (rádlo 2, čtyřkolák 2, dvoukolák 1); páry s rádlem
  `ableTeams` / `ploughPairsHome`, výcvik `oxenTraining` / `trainTeamsWhenReady` k cíli `OxenGoal`
  (`oxenTrainingTarget`, páry, telata jen nad `breedingCows`; krávy navíc na telata
  `oxenCalvesWanted` v `minCows`), převod starých vsí `withOxen` (spřežení = 2 voli, výcvik = 2 telata – čtení
  přes `oxenOf` funguje i bez převodu). `draft.ts`: páry k rádlům k 1. 9. (potřeba `DraftState.ploughNeed` – nejméně
  párů, se kterými plán osevu vybere totéž jako bez meze orby; páry `ploughPairs` s hysterezí
  `nextPloughPairs` – mění se, jen když potřeba trvá dva plány po sobě), rok vozů
  (`DraftState.demand.days` – každý den `CartDemandDay`: dnešní nošení podél pevných cest
  a jinam, úspory jízd dvoukoláku pro uhlí, rudu, hlínu a vodu, den orby; čtyřkoláky výprav
  `'four-wheel'`; `addCartDemand`, `addExpeditionDemand`; 1. 11. `closeCartYear` → `lastYear`
  = tabulka úspor `CartYear` – `base[dvoukoláky][čtyřkoláky]`, ve dny orby `plough[…][…][voli]`,
  den `cartDayValue` – s cenou vola `oxYearCost`; rok uložený dřív s úsporami k-tých vozů se čte
  dál), volba `chooseCarts` (úspora mínus cena vozu na 10 let
  a volů navíc, v místech ohrad) → `draftChoice`, `cartTargets`, `missingCart`, `wantedOxen`
  (víc z párů a volů vozů – voli se sdílí), upozornění `oxenOverRoom` („Voli se nevejdou do
  ohrady“), krávy `oxenCows`. Web: `VillageView.oxen` (`VillageOxen`), panel ohrady volů (ikona
  `resources/ard.png`), `SceneVillage.ploughPairs`. **Čtyřkolák po louce a strništi kamkoli**
  (wagons.md – Co se vozí a na čem; Martin 20. 10. 2026: „Po strništích a loukách může
  libovolně“ – dřív jen po pevných cestách; `CartRoutesInput.fourWheel` z `villageCartRoutes` pro
  `four-wheel` – jako dvoukolák, širší oblouk, zakládaný díl objede; uložené dosahy čtyřkoláku
  starší vsi jednou zahodí `withFourWheelReach`, příznak `DraftState.fourWheelOffRoad`) a **levnější vůz pro
  každou práci**: flotila dne `CartFleet` (`cartFleetToday`, `fleetCarts`, `takeCart`) – svoz
  snopů, sena, jablek a klád `fleetHaulPlan` (čtyřkoláky napřed, kam dojedou – dosah `cartReach4`
  u úloh, `HaulPlan.four` / `fourWork`, `LaborShare.fourWheel`), uhlí a vodu veze levnější vůz
  (`kilnCartOffer(…, kind)`, `CharcoalKiln.cart4`, `waterCartPlan(…, kind)`,
  `VillageState.waterCart4`), ruda, hlína a osivo dvoukolák.

- **Spřežení volů s rádlem** (oxen.md – Spřežení postupuje s orbou; Martin 19. 10. 2026,
  podrobnosti návrh Clauda): ve vsi orá na čele orby – `plough-front.ts` (`ploughFront`, čisté
  funkce bez Babylonu): díl s čárou práce z fronty `SceneLaborShare.parts` podílu `plough` (bez fronty odhad
  jako u kopání – `workedParts`), na něm **pruh u čáry práce** ve stejném rámci jako obtisk
  (`workFrame`, `workSteps` – řady podél `rowDirection`, napříč od vsi; `frontStrip`: končí na
  čáře, nejvýš 4 řady zpět, aspoň 2 – `ploughedTo`, `stripRows`, řady po 2,5 m). Jen čelo dne,
  ne všechny dnešní díly (0,3 ha ≈ 13 čtverců za ≈ 86 s by voly hnalo 13× rychleji). Kolik párů
  s rádlem doma (`SceneVillage.ploughPairs`), tolik spřežení (`ploughTeamCount`; páry jen z volů,
  kteří netáhnou vůz – `draftTeamsToday`, v ohradě stojí zbytek – `penHerds(…, oxenOut)`): každé na jiném dílu fronty, kam jeho dráha i se
  souvratěmi nesahá (obdélníky `footprint`, `overlaps`), jinak dvě na jednom dílu v půlkách
  (`SHARED_STRIP_M`, stejná dráha posunutá napříč – v zákrytu), kdo se nevejde, zůstane v ohradě
  (`penHerds(village, teamsOut)`). Natočené pole v osách mřížky (`rowDirection` natočených dílů).
  Další den (nová dráha – `PloughTeams.setPaths(paths, nowMs)`) spřežení **dojde pěšky**:
  `transitTrack` (rovně ≈ 1 m/s – `TRANSIT_SPEED_M_S`, rádlo nahoře, natočení na začátku a konci,
  čas příchodu dopočítaný, ať naváže bez skoku; nad `TRANSIT_M.max` 60 m skok), póza `trackPose`;
  jen když animace běží (`liveAt`), při omezeném pohybu stálá póza na novém místě; obal pro ořez
  záběrem stálý přes celé dráhy i přechody (`updateBounds`). V kulatém rohu pole (Kulaté rohy)
  končí řady na oblouku (`PloughField.corners`, `rowExtent`) a radlice se zvedá (`outsideSquare`).
  **Orba za herní den – LADICÍ** (oxen.md; Martin 19. 10. 2026: „aby spřežení projelo opravdu
  všechna obdělávaná políčka a nechávalo za sebou brázdu“): přepínač `PLOUGH_DAY_DEBUG`
  v `plough-day.ts` (false = skutečné tempo, jen čelo dne). Jádro dává k orbě v rozdělení práce
  `progress` (ráno a večer na dílu – `partsWorked` vrací `from` / `to`) a zoraný díl rádlem nese
  `before`; `dayStints` (pruhy po pruzích obtisku; sousední díly pásu se stejným postupem jeden
  pruh přes celý pás – `bandCandidates`, `PloughField.length`, `DayStint.partIds`), `splitStints`
  (souvislé kusy fronty mezi spřežení), `startOfDayVillage` (pole na začátku dne); trasa
  `ploughRoute` (cesty dne `SceneVillage.ploughLegs` ze `scenePloughLegs` – z `PloughWork.trip`
  jádra, vozová síť: `out` výjezd z ohrady nebo přesun od konce bloku jen v den příjezdu,
  `home` návrat do ohrady jen v den návratu, `stand` – den bez orby, spřežení na poli stojí na
  čele (`ploughFrontBand`); jinak jen pruhy dne za celý den – pomaleji; řady všech pruhů
  s obraty, přesuny se zvednutým rádlem), `RouteTrack` (od příchodu plánu do konce
  herního dne – okno z hodin světa, `realTimeOf`, nebo `VillageRenderer.setPloughClock`),
  `routePose`, brázda `routeFurrows` (pásy řad, kudy radlice projela – čistá funkce času)
  → `FieldRenderer.setFurrows` (obtisk `village-field-furrow-<id>` s krytím pole, v
  `animateOxen`); `PloughTeams.setRoutes` / `furrows`. Jen s animací (`VillageContext.animated`
  – při omezeném pohybu konec dne a čelo jako dřív). Ukázka **Orání** na `/dev/buildings`: tři
  čtverce, vlastní `VillageRenderer` (`ploughDemo`) s polem a orbou dne ukázky (40 s –
  `showcasePloughDay`, `showcasePloughWindow`, díly a `progress` jako od jádra – `showcasePlough`),
  tři čtverce jsou jeden pás (`furrow`) – orba postoupí za den napříč o 3/8 čtverce plochy. Voli a oráč z `people_from_0ad.py` s `tools/blender/plough-team.json` – vůl
  `cattle_male_c` (srst přebarvená, maska srsti), oráč = muž s klipy `plough` (předklon + ruce
  dvoukloubovou IK na rukojeti, „pose“ v JSON) a `lead` (honáček s provazem); rádlo, jho, oj
  a provaz `tools/blender/plough.py` (malý atlas vyříznutý z atlasu obydlí). Rozestavění
  a pohyb `plough-team.ts` (čisté funkce času: dráha přes čtverec nebo jeho pruh – `PloughField`
  `from` / `to` / `across…`, řady, obraty na souvrati, návrat; rádlo za jhem na tětivě oje, na
  souvrati nadzvednuté, oráč u rukojeti – `composePose`), kreslení
  `plough-team-renderer.ts` (VAT jako lidé + pevné díly v instancích). Rozměry rádla a jha musí
  sedět s `TEAM_PARTS` (hlídá test).

- **Vozy se spřežením** ([docs/design/wagons.md](../design/wagons.md) – modely fáze 3a, ve vsi
  fáze 3; ukázka **Vozy** na `/dev/buildings`): dvoukolák a čtyřkolák z 0 A.D. převádí
  `tools/blender/wagons_from_0ad.py` (vlastní parser skinovaného COLLADA, model rozdělený podle
  kostí, koňský postroj pryč, vlastní oj ke jhu – dvoukolák oplení a jednoduché jho `wagon2-yoke`
  pro jednoho vola, `composeDraft(…, 1)`, `CartPose.team` –, náklad modelovaný ve skriptu) do
  `public/models/wagons/wagons.glb` – díly `wagon2-body`, `wagon4-body`, `wagon4-front` (předek na
  čepu), `wagon4-pole`, `wagon-wheel` (levé kolo, pravé = otočené o 180°) a náklad
  `wagon{2,4}-{hay,sheaves,logs,goods,water}` (voda = stojící sudy s víkem a provazem). **Kola se
  točí maticí instance podle ujeté dráhy, ne VAT**
  (animace 0 A.D. jen točí kosti kol; VAT by se s jízdou po terénu nesešla a postava s kostrou má
  ve WebGPU vyčerpaných 8 vertex bufferů). Pohyb `cart-layout.ts` (čisté funkce, testy):
  `cartRoute` (lomená čára → úseky a oblouky jako dráha rádla, rohy zaoblené `turnRadius`,
  uzavřená / otevřená), `routeAt`, `cartPose(track, t, out, ground)` – jho na trase (`composeDraft`
  v `plough-team.ts`: voli, jho a honák s provazem jako u rádla, u vozu dospělý
  `CART_PARTS.drover`), dvoukolák = náprava na tětivě oje za jhem a korba naklopená tak, aby špička
  oje ležela pod jhem, čtyřkolák = přední náprava za jhem (`yokeReach`), zadní po rozvoru, korba na
  obou (sklon a náklon podle terénu pod koly), předek natočený ke jhu, oj od špičky rozvory ke jhu;
  dráha kola = dráha osy ± polovina rozchodu × změna směru (vnější kolo v oblouku víc). Rozměry
  `CART_PARTS` musí sedět s modely (test čte obaly dílů z GLB). Kreslení `cart-renderer.ts`
  (`CartRenderer.setCarts(tracks)` / `animate` – voli a honák VAT z `plough/`, jho a provaz
  z `ard.glb`, díly vozů v instancích, měkké stíny; skrytý díl – náklad prázdného vozu, voli
  stojícího – nulová matice). Druhy vozů jako v jádru (`two-wheel`, `four-wheel`). **Ve vsi**
  (`village-carts.ts`, čisté funkce, testy): `villageCartPlans` z `SceneVillage.carts` – vůz s trasou
  dne jede tam a zpět (`CartShuttle`: `shuttleRoute` – osa tam, smyčka obratiště za cílem
  `CART_TURN_M`, zpět, smyčka u ohrady jako uzavřená trasa; `shuttleAt` – prázdný tam, u cíle
  nakládá, plný zpět, u ohrady skládá; svoz v okně herního dne – ladicí `PLOUGH_DAY_DEBUG` jako
  orba: jízd kolik se vejde při `CART_FAST_M_S`, nejvýš `CARTS.loadsPerCartDay`, den se opakuje;
  výprava dokola tempem volů naložená tam i zpět), vůz bez jízdy stojí u ohrady (`CartParked`,
  `parkedCartSpot`, `parkedCartPose` – dvoukolák na oji, bez volů). `cartPlanPose` = póza podle
  plánu (`poseOnRoute`). `VillageRenderer.updateCarts` (klíč z vozů, okna dne a ohrad) a
  `animateOxen`; voli táhnou buď vůz, nebo rádlo – `draftTeamsToday` (orba jen se spřežením, které
  nevozí), `penHerds` bez volů na cestě; honák jde s vozem (`villager-plan.ts`, `villager-plan-folk.ts` – haul bez honáků).
  Panel cesty: vyšlapaná s vozy je **Vyježděná cesta** (Vozová síť a vyjeté cesty níž). `/dev/landscape`
  **Vozy ve svahu** – vůz stojí, pak dvoukolák a čtyřkolák vozí snopy po vyjeté cestě
  (`LandscapeScene.setWorkDayClock` – den ukázky 86 s).

- **Ohrada s přístřeškem** ([oxen.md](../design/oxen.md); ve vsi `SceneVillage.pens` –
  `ScenePen.species`, `extraSquares` (`pending` – rozšíření ve stavbě, jen vytyčené), `night`
  (kolik zvířat v noci stojí – pro den a noc), `scenePenSquares`, `scenePenSpecies`;
  `village-pens.ts` ve `VillageRenderer`: fáze podle `progress`, branka k nejbližšímu obydlí
  (vchod z jádra – `penSquaresEntrance`, `penGateToward`; paths.md – Vchody; plot po obrysu všech
  čtverců odsazený dovnitř – `penLayout(square, facing, extra)`, `PenLayout.outline` /
  `fenceRects` / `squares`, přístřešek v prvním čtverci zády a bokem k vnějšímu plotu –
  `shelterAxes`, místa pro zvířata ve všech čtvercích, `penAnimalsFor` zná i ovce, kozy
  a prasata – kreslí je den a noc, `PenAnimals` jen voly a krávy),
  zvířata `penAnimalsFor` na místa `spots` – voli spřežení (v den orby na poli), telata ve
  výcviku menší, v zimě krávy; výběr `{ kind: 'pen' }`, panel se stářím spřežení a průběhem
  výcviku (bez tlačítka – cvičí se samo);
  ukázka **Ohrada** na `/dev/buildings`): přístřešek s pultovou doškovou střechou, jesle,
  žlab a branka ze žerdí z `tools/blender/pen.py` (`models/pen/pen.glb`, díly staveniště
  `pen-construction.glb` „ohrada-…“; materiál `…-low` = jen poprašek sněhu – pod střechou
  nesněží), plot je sdílený pletený plot (`PEN_FENCE`), stoh = kupka z polí. Rozmístění,
  fáze stavby a póza zvířat `pen-layout.ts` (čisté funkce, testy – branka na straně ke vsi,
  přístřešek v zadním rohu naproti; `SHELTER_M` musí sedět s rozměry v `pen.py`), kreslení
  `pen-renderer.ts`, voli (VAT klip `idle`) a kráva `pen-animals.ts`. Na stránce přepínač **Zima**.
  **Rozpad opuštěné ohrady** (abandonment.md): `PenView.condition` → `penDecayParts` (sešlá:
  vybledlé děravé došky s mechem, prázdné jesle, žlab bez vody; propadlá: prověšená střecha,
  spadlá branka; rozpadlá: sloupy a krokve) z `models/pen/pen-decay.glb` (`pen.py`, pátý
  argument `decay`; místo dílu `penDecayPlace`), bláto mizí (`PEN_MUD_BY_STAGE`), stoh jen
  u celé, plot `decayFence`.

- **Ohrada koní ve scéně** ([horses.md](../design/horses.md) – Ve scéně): `ScenePen.species 'horse'`,
  `ScenePen.horses` (`id`, `kind` z `horseKind`, `riderId`; plní `scenePens`). `penLayout(..., species)`:
  vyšší plot `PEN_FENCE_HORSE` (≈ 1,4 m; `PenLayout.fenceStyle`, `penFenceStage` ho bere z rozložení),
  4 místa na čtverec (`horseSpotKept`: žlab, jesle, pastva + 1; v dalších čtvercích rohy mřížky);
  přístřešek, jesle a žlab z `pen.glb` beze změny (varianta `pen-horse` v `pen.py` není).
  `PenHerd.horses` – klisny a jezdečtí koně po jednom na místo, hříbě vedle klisny bez místa
  (`horseAnimalsFor`); `penHerds` dá do ohrady jen koně, kteří se dnes nepasou.
- **Panel ohrady a slepice v UI** (issue #3): panel ukazuje jen druh ohrady (`penHerd` v
  `selection-details.ts`), `LivestockSummary.chickens` zůstává v datech (scéna, vejce), ale
  žádné rozhraní ho nezobrazuje.

- **Ohrada koní a koně po kusech** (horses.md, issue #5): `PenSpecies` + `'horse'`, `Pen.horses?:
Horse[]` (`id`, `bornDay`, `sex`, `training`, `riderId?`). `horses.ts` – `horsePens`,
  `villageHorses`, `horseKind` (hříbě do roku / klisna / jezdecký samec), `horsePlaces` (4 na hotový
  čtverec, `PEN_PLACES_PER_SQUARE.horse`), `horseRoom` (hříbě místo nezabírá). Cena čtverce
  50 čd a 8 stromů (`PEN_BY_SPECIES.horse`; `penBuildLabor` / `penLaborManDays` / `penTrees` berou
  druh, rozšíření bere druh cílové ohrady), plot podle délky beze změny (`PEN_FENCE`).
  `penOccupancy` počítá koně ohrady (chátrání `abandonment.ts` beze změny – prázdná ohrada chátrá).
  Číslo `HORSES` v `rules-livestock.ts`, výška plotu `PEN_FENCE_HEIGHT_M` jen pro scénu.
- **Péče a krmení koní** (horses.md – Péče, Krmení; issue #5): péče 0,1 čd na koně denně
  (`horseCareLabor`, hříbě do roka nic) jde z práce vsi hned za denním minimem (`allocateDay` –
  `horseCare`); pokrytí 0–1 v `state.horsesCaredToday` (chybí = ves bez koní). Obilí –
  `feedHorseGrain` (`horse-feed.ts`) na konci `eat()`: jezdečtí koně (samci od 3 let,
  `isGrainHorse`, `horseGrainToday`) dostanou 1,5 kg jen, když ves nešetří a obilí navíc do sklizně
  (`DietResult.grainSpareKg`) vystačí i jim; po dni bez obilí až s rezervou `grainResumeDays`
  (hystereze). `state.horsesFed` (chybí = bez koní). Seno – `horseHayDailyKg` (hříbě 3 / 5, kůň 6,
  jezdecký bez obilí 7), `feedHay(…, horsesKg)` voli → koně → stádo, `winter.horsesNeedKg` /
  `horsesEatenKg` jen ves s koňmi; `horsesHayCoverage`, `herdHayCoverage` odečte březen koní;
  1. 3. `horsesWinterEnd` (nejmladší napřed, kronika `horse-starved`). Seč 1. 6. s koňmi
     (`winterHayNeedKg`), zimní stádo po koních (`WinterInput.horsePastureHa` / `horseHayKg`). Pastva
     1 ha na koně (`grazingDemandHa(…, horses)` – zarůstání, pěšiny, souhrn). Plán osevu přičte obilí
     koní za rok do potřeby do sklizně i po ní (`sowingTargets`). Nouzová porážka koně nebere.
- **Chov koní, výcvik koně a jezdci** (horses.md – Chov, Výcvik koně a jezdec; issue #5):
  `horse-breeding.ts` – `horsesDay` v `husbandryDay` (po úhynu 1. 3., před porážkou stád). Hříbata
  dne 1. 5. (`horseBirths`): klisna 4–20 let rodí, když `(rok + id) % 2 === 0` a ves má samce od
  3 let; pohlaví `deriveSeed(seed, 'foal:den:id')`, id z `nextId`, hříbě jen do míst (počítají se
  všichni koně), kronika `foal-born`. Porážka dne 1. 11. (`retireHorses`): od 20 let na maso
  (`age`), pak jezdečtí koně a klisny nad `horsesWanted` od nejstarších (`surplus`), 100 kg do
  `butcher`, hříbata zůstávají; kronika `horse-retired`. `horsesWanted` – jezdci rodiny od 10 let
  (`familyRiders`), klisny 1 + ⌊jezdci / 3⌋, hříbata = cvičící rodina − jezdečtí koně, kteří za
  3 roky ještě slouží; strop místa (jezdečtí, klisny, hříbata). `horse-riders.ts` – `assignRiders`
  (pár drží, volné koně od nejlépe vycvičeného vojvodovi a synům od nejstaršího), `trainHorsesDay`
  z `trainLordDay`: přírůstek 100 / (9 × 365,25) denně × podíl dne jezdce, bez obilí ½, stojí při
  `horsesCaredToday` < 1 a `lord.field`; plný výcvik → `horse-trained`. V dnech na poli
  (`lord.field`) `trainLordDay` nikoho nepočítá jako jezdce – i chlapci cvičí luk a boj bez koně.
  `lord.ts` – `lordRides(state, day)` (pro scénu, jen čte): jezdci rodiny se svým koněm a hodinami
  jízdy (vojvoda první, pak od nejstaršího), každý `HORSES.borderRideEveryDays` (7.) den hotová
  zemská stezka k hranici (`trailId`, střídají se po id), doprovod výpravy, která dnes vyráží
  (`escort` – nejstarší jezdec mimo vojvodu); v dnech na poli null. `riderPower` = jízda ×
  (0,4 + 0,6 × výcvik) jen pro panel. Čísla v `HORSES` (`birthDay`, `foalEveryYears`, `maresBase`,
  `ridersPerMare`, `trainingFull`, `trainedAtYears`, `riderPower`, `borderRideEveryDays`).
