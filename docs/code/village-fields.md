# Ves – pole, osev, zarůstání, pole ve scéně

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: fields.md v `docs/design/`.

- **Hospodářský rok** (`FarmSeason`, `types-construction.ts`; fields.md – Osevní postup po dílech,
  Úloha 2 plánu `docs/superpowers/plans/2026-10-25-sowing-rotation.md`): evidence práce od 1. 9.
  do 31. 8. – `startDay`, `crops: SeasonCrop[]` (`SeasonCrop` = `CropWork` + `crop`; pořadí
  ozim, luštěniny, len, jař; jař je vždy; `putSeasonCrop` / `dropSeasonCrop`), `ard`, `flaxNeedKg`
  (potřeba lnu k 1. 9. – `startSeason`; chybí u plánů z doby lnu na zahrádkách a vsí založených
  během roku),
  `lordHelp`. Stav vsi nese `VillageState.season`
  a `threshingSeason` (dřív `plan`, `threshingFromPlan`). Název `FarmSeason`, protože `Season`
  je roční období kalendáře. Přístup: `seasonCrop(season, crop)`, `springCrop(season)`,
  `seasonCrops`, `seasonPartIds`, `putSeasonCrop` / `dropSeasonCrop` (`year-plan.ts`).
  Uložené vsi převádí `withSeason` (`year-plan.ts`; v `advanceVillage` i `updateVillage`) jednou
  a idempotentně: `plannedDay` → `startDay`, jař z nejvyšší úrovně + `winter` / `legume` / `flax`
  → `crops`. Změna je jen tvar a názvy, chování a otisky beze změny.
- **Převod starších vsí na osevní postup** (`withSowingRotation`, `rotation.ts`; fields.md – Osevní
  postup po dílech, bod 7; Úloha 6 plánu): v `advanceVillage` i `updateVillage` hned za
  `withSeason`, jednou – značka `VillageState.sowingRotation` (dostane ji i nová ves; otisky ji
  nepočítají). Plodiny hospodářského roku zůstanou s hotovou prací (díly, `required` / `done`,
  orba, sklizeň, snopy) a jsou nutné: čekající příprava začatých dílů osevu navíc
  (`CropWork.extraLeft`) je v potřebné práci, převod jen smaže klíč. Nezačaté díly osevu navíc
  (starší tvar stavu): osévaný díl, který ležel ladem jen od plánu (`sownYears` v záznamu), je
  `ready` s léty v řadě, příloh leží dál. `fallowBeforePlan` → `FieldPart.fallowBeforeSeason`.
  Zda se díl osévá dál, rozhodne 1. 9. `rotateAfterSeason` podle úrodnosti (přílohová soustava). Při chybě vrátí vstup se značkou (jako
  `withRoadsRebuilt`). Testy `rotation-migration.test.ts`: stav nové vsi převedený zpět do tvaru
  plánu (1. 9., 25. 10., 15. 3., 15. 6., 10. 8.) se převede na totéž a dopočte do 31. 8. stejně.
- **Ozim a jař – osevní postup po dílech** (fields.md – Osevní postup po dílech a setí do konce
  okna, 25. 10. 2026): ves nemá plán k 1. 9. Hospodářský rok `FarmSeason` (1. 9. – 31. 8.) nese
  práci dílů po plodinách jako `SeasonCrop`; díly osevu mají `crop?` (chybí = jař). Okna prací
  `CROP_WINDOWS` (`WINDOWS` = jař, `WINTER_WINDOWS`) v `rules*.ts`. Krok 1 `startSeason`
  (`simulate-plan.ts`, 1. 9.): `closeFieldFoodYear`, `rotateAfterSeason` všech dílů (`rotation.ts`
  – díl, kterému po osevu zůstalo aspoň 70 %, `ready` v osevu, jinak příloh – přílohová soustava), prázdný rok
  (`createSeason`, `ard` podle spřežení); pak páry k rádlům z `ploughPairsForRotation`
  (`nextPloughPairs` v `draft.ts`; pod pojistkou i s nutnými díly mimo postup a nahoru hned –
  `village-livestock.md`). Krok 2 `seasonDay` (každý den): konce oken setí – první den po setí
  ozimu jdou díly ozimu bez zasetého podílu (`unsownPartIds` – úsek setí nezačal) do jaře
  (`moveParts` v `land-taken.ts`: příprava půdy podle úseků `taskSpans`, na začátek pořadí jaře,
  `crop: 'spring'`); první den po setí jaře, luštěnin a lnu vypadnou nezasetí z práce
  (`releasePart` – `shrinkInPlan`, `dropFromWork`, `returnPart`: příloh podle
  `fallowBeforeSeason`, jinak `ready`, `sownYears` zůstanou). Napřed `fellReclaimed` – klády
  (`clearedLogs`) za díly, přes které došlo čelo vracení přílohu (`taskSpans('reclaim')`),
  a `fallowBeforeSeason.overgrowthYears` pryč (uvolněný díl se vrátí bez lesa). Ve dnech, kdy může
  začít ozim nebo jař (`sowingCropToday('first')`), `turnSelection`
  (všechny díly na řadě bez stropu – luštěniny nikdy; v dávce obilí ozim
  před jaří) → **čelo práce** (`workFront`, `frontRoom`, `WORK_FRONT_DAYS`): díl přibude, jen
  když rozdělaná příprava a setí v dnes otevřených oknech plodin se stejným nebo dřívějším
  koncem okna přípravy (`prepEnd`) je pod 3 dny volné práce (`freeLabor`) a orby
  (`ploughCapacityPerDay`); ostatní čekají – `seasonDay` je vrátí a `lordHelpDay` je přičte
  k zátěži (`partWork`). Přibrané díly `addToCropWork` / `putSeasonCrop` (dávka dne
  `workOrder`), `sowParts`; `release` (nezačaté díly nad
  potřebu + `FIELD_STORES.trimMarginYears`, jen když nepřibírá obilí) → `releasePart`. Ves bez roku (založená během roku) ho dostane
  s prvním dílem. **Výběr jen s místem na čele** (`seasonJoins` → `seasonSelection`, výkon 31. 10. 2026): napřed čelo (`workFront`); nemá-li místo pro žádnou plodinu a ve stavu je
  `FarmSeason.selection` téhož `window` (`selectionWindow` – měsíc a plodiny, které smí začít),
  vrátí čekající díly z ní bez `turnSelection`
  i povýšení. Jinak úplný výběr a `selection` se přepíše; mimo dny, kdy smí začít díl, se smaže.
  Test `season-day.test.ts` (plné čelo – nový výběr by nepřibral nic). `startedPartIds` nebere úlohu bez práce (ozim se neplete) za začatou.
  `sowing.ts` nese už jen okna a zátěž pro pomoc rodiny ve žních (`planLoad`, `cropLoadOf`,
  `lordHarvestHelp`). **Výhled zásob k sklizni** (fields.md – Výhled zásob
  k sklizni, 9. 11. 2026; cíl osevu zrušen): `storesOutlook` ve `field-food.ts` (ve vsi
  `fieldStoresOutlook` v `simulate-plan.ts`) vrací jen `needKg`, `leftKg`, `shortKg`, `bufferKg` –
  potřeba z pole (podíl jídla z pole za uplynulý hospodářský rok – `VillageState.fieldFood`, součty
  v `eat`, uzávěrka 1. 9. `closeFieldFoodYear`; nejméně `FIELD_FOOD.minShare`, bez změřeného roku
  1 – × roční potřeba podle růstu vsi `expectedYearlyFoodNeed`, `food-outlook.ts`), zásoby z pole
  (obilí, snopy, luštěniny – `storesLeft` / `storesNeeded` se ztrátami) bez osiva, které ves ještě
  zaseje (`seedOutsideFoodKg`), pojistka `bufferKg` (`bufferEnergyYears`, po krutém roce 10 let
  0,75 – `bufferEnergyYearsOf`). Dlouhodobý podíl `FieldFoodYear.longShare` (k 1. 9. o třetinu
  rozdílu – `FIELD_STORES.balanceYears`). Cílová zásoba `storesTargetKg` a `steadyHarvestKg` zůstaly
  jen pro kapacitu polí (správce, kalibrace, kalkulačka).
  ~~Nutné díly navíc ves uvolní~~ (zrušeno 9. 11. 2026 – nouzové první, pak nejdál
  od domu, ladem jako příloh – `FieldPart.fallowBeforeSeason` – nebo zpět na řadu).
  **Díly jedna fronta** (fields.md – Osevní postup po dílech, bod 3; 9. 11. 2026): díly nad potřebu
  (`SeasonCrop.surplus`, uvolňování
  `releasable`) zmizely – výběr `turnSelection` (`rotation.ts`) vrací všechny díly na řadě bez
  stropu; přílohy 70–95 % až po oseté řadě v okně setí (`turnSown`), nouzové jen při nedostatku
  (`TurnOptions.shortage` – `grainShortage` v `simulate-plan.ts`: zrno k sklizni bez osiva jen na
  setí pod `seedKeepKg`). Převod uložených vsí `withoutSurplusCrops` (`merge-surplus.ts` – slití
  plodin `moveParts`, po žních součtem; smaže `selection.floorKg`). Platba z přebytku
  (`paymentPool`) bere jen vymlácené zrno bez hromady osiva a zrna na dnešní jídlo
  (`foodGrainReserveKg`). **Nouzový osev** (fields.md – Přílohová
  soustava, Martin 19. 10. 2026): ~~když díly od 70 % nedají úrodu cíle~~ – od 9. 11. 2026
  nouzové přílohy jen při nedostatku (`TurnOptions.shortage`), jen obilí, čistá
  úroda > 0)úroda > 0), jen obilí, a jen od 40 % přirozené (`FERTILITY.emergencyMin` – Martin: „ves neoseje
  díly pod 40 % úrodnosti“); úrodnost dílu klesá nejvýš na nulu (pojistka). Potřebou z pole jde odhad ozimu na srpen
  (`daysUntilFoodHarvest`) a dobré zásoby štěstí; ustálená úroda `steadyHarvestKg` (kalibrace,
  kalkulačka – zásoba na cílové zásobě). Kalibrace vypisuje práci na poli a volnou práci po rocích
  (průměr, variační koeficient, změna z roku na rok). Volná práce plánu (`sowingCapacity`) je po
  denním minimu dospělých (`adultDailyMin` – zvířata a domácí výroba bokem), bez cvičící
  vojvodovy rodiny. **Rodina ve žních** (lord.md – Kdy jde rodina na pole; Martin 9. 11. 2026):
  `lordHelpDay` (`simulate-plan.ts`) každý den v oknech žní `HARVEST_HELP_WINDOWS` (červenec,
  srpen) zapíše do `FarmSeason.lordHelp` podíl dne rodiny (`lordHarvestHelp` ze zbývající práce
  `planLoad` a `sowingCapacity` vsi od dneška bez rodiny a s ní – `{ lord: true }` přidá do
  července a srpna `manorLabor.free`, práci celé rodiny přítomné ve vsi po minimu dvorce:
  chybějící práce ÷ práce rodiny, nejvýš 1); necvičící rodina pomoc nemá. Den: ve žňový den
  (`harvestHandsDay`) `lordHelpShare` × `free` = `manorLabor.help` → `allocateDay` – `lordHelp` až
  po práci vsi a žňových rukou, jen žeň a výmlat (`HARVEST_HANDS_TASKS`; jen co ves dnes nestihne);
  kdo jde na pole, určí `lordFieldShares` (`lord.ts`) ze spotřeby: napřed ženy a dcery
  (`free − freeMen`), pak muži rodiny (`freeMen − freeLord`), vojvoda až nakonec (`freeLord`;
  Martin 9. 11. 2026) – podíly `LordFieldShares` pro `trainLordDay`, `huntDay` a `lordDayCounts`. Pomoc
  s osevem a při hladu (`lord.field`) je zrušená; převod `withoutSowingHelp` (`lord.ts`).
  **Pletí – děti** (fields.md – Pletí – děti, 25. 10. 2026): `weedingChildren` (harvest-hands.ts)
  = věk výrostků 7–13 let mimo `lordTraineeIds` bez pasáků (`herdingDay` – `freeHerders.children`,
  pasou nejstarší); `work()` je počítá jen v den s úlohou `weed` a dá `allocateDay` zásobník
  `weedChildren` (× `WEEDING_CHILDREN.perDay` 0,5) jen na pletí, před `light` a prací vsi;
  spotřeba `DayAllocation.weedChildren`. `laborDay` rozdělí podíly pletí poměrem dětí a jejich díl
  nese `ages` (`DayWork.weedChildAges`) – scéna kreslí malé postavy (`villager-plan.ts`, `ages`).
  **Pletí jednou a rychle** (fields.md, 25. 10. 2026): sazby `GRAIN_WEEDING_PER_HA` 8 / 5
  a `LOW_CROP_WEEDING_PER_HA` 10 / 6 (luštěniny, len) v rules-fields.ts; okno jaře, luštěnin a lnu
  `[[5, 5]]`, ozim `weed: []` a `WINTER_WORK_PER_HA` (pletí 0 – `CROP_WORK_PER_HA.winter`
  v productivity.ts); `unweededYield('winter')` = 1 (year-plan.ts) a `withoutWinterWeeding`
  (idempotentně na začátku `work()`) vynuluje pletí ozimu ve starším hospodářském roce (`state.season`). `withOnceWeedingRates`
  (hned za ním) přepočte pletí jaře, luštěnin a lnu starších let (víc pletí na sklizeň, než dá nová
  nejhorší mez) × nová ÷ stará nejhorší mez (`LEGACY_WEEDING_WORST_PER_HA`) – jinak by se starý
  požadavek v květnovém okně nestihl (Vlkov 816: opleto 63 %, jař −0,3 t). Ženy: `work()` dá
  `allocateDay` práci žen vsi `womenLabor` (`p.sex === 'female'` mezi `villagers`);
  `allocateDay` pleje napřed (děti → `light` → ženy = jejich práce − `WEEDING_WOMEN.dailyMinShare`
  × denní minimum, nejvýš práce po minimu, koních, výpravách a vozech, i před úlohami dřív
  v pořadí), pak ostatní úlohy a teprve pak muži zbytek pletí (`allot` ve třech průchodech) – jen
  díl, který by děti a ženy tempem, které dnes pletí opravdu daly, × `paceShare` nestihly do konce
  okna bez posledních `spareDays` dní (`weedDaysLeft` z `work()` podle konce okna úloh `weed`); spotřeba `DayAllocation.weedWomen`. `laborDay` dá podílu pletí dospělých
  `LaborShare.women` (ženy ÷ pletí dospělých) – scéna podle něj kreslí ženy.
  **Žně všemi rukama** (fields.md – Žně všemi rukama, `harvest-hands.ts`): `harvestHandsDay`
  (měsíce `HARVEST_HANDS_MONTHS` z oken žní `CROP_WINDOWS` a výmlatu hned po žni
  `HARVEST_THRESH_WINDOWS` – 7–10, zimní výmlat ne – a v okně zbývá žeň plánu nebo práce snopů) je jedno místo pravdy pro `workshopLabor` (řemeslník se syny →
  `WorkshopLabor.harvest`, `craft` 0), `manorLabor` (cvičící muži → `ManorLabor.harvest` =
  `freeMen`, `help` 0 – i ženatí synové v dvorci; vedlejší manželky vojvody mimo dvorec ne, jsou
  v `lordApartIds`, takže je nepočítá ani `harvestHelperLabor`) i `work()`; v `allocateDay` zásobníky `harvestHands` (`craftHarvestLabor`
  - výrostci od 10 let a starší po `HARVEST_HELPERS.perDay` – `harvestHelperLabor`, mimo
    `lordApartIds`) a `lordHelp` jen na `HARVEST_HANDS_TASKS` (žeň, výmlat) za lehkou prací žen, před prací vsi,
    nevyužité propadne; spotřebu mužů vrací `lordField` (podíl dne ÷ `freeMen`). `sowingCapacity`
    přičte tytéž ruce (`craft + harvest` dílen, `freeMen`, `harvestHelperLabor` × štěstí) v oknech `july` a `august` a z výmlatu
    v podzimních oknech nechá vsi jen její díl (volná práce vsi ÷ (vsi + ruce)). Výhled jídla do sklizně (`eatDiet`) počítá s mlékem stád do sklizně
    (`milkAheadEnergy` z `milkEnergyBetween`) a celou zásobou sýra.
    Polní úlohy obou plodin řadí `fieldTasks` v `simulate-work.ts`
    (konec okna, ozim před jaří); `allocateDay` vrací i `taskAmounts` po úlohách vstupu (stejný
    název víckrát). Sklizeň ozimu 31. 7. (`harvestWinter`), jaře 31. 8. – do snopů, výmlat hned
    po žni (Snopy a výmlat níž); příděl počítá do sklizně
    podle `daysUntilFoodHarvest` (31. 7., když ozim podle odhadu uživí srpen). **Žně i v srpnu**
    (fields.md, Martin 9. 11. 2026): okno žně ozimu a luštěnin je červenec–srpen
    (`WINTER_WINDOWS.harvest` [7, 8], luštěniny sdílí; len jen srpen – Len níž), výmlat srpen–únor
    (`WINTER_WINDOWS.thresh` – dva úseky přes konec roku). `harvestEarlyCrops` (`simulate-food.ts`) 31. 7. dá do snopů
    úrodu červencové žně (`sheaveCrop` – `harvestKg(…, fromDone)` a `threshRemainingAfter`
    v `year-plan.ts`); nedosklizená plodina dostane `CropWork.sheaved` (práce žně a kg v snopech)
    a `harvestedKg` zůstane null – plodina je dál na poli (zvěř, pohromy, scéna, výhled). `harvest` 31. 8. zavolá `harvestEarlyCrops(…, true)` před jaří – zbytek do snopů, nesklizené propadne.
    Len se zapíše 31. 8. (`harvestFlax`). V srpnu má zbytek ozimu a luštěnin přednost před jaří
    samo – stejný konec okna, pořadí `CROP_ORDER` (návrh Clauda).
    Plán a výhled: `SOWING_CAPACITY_WINDOWS.july` = okno žně ozimu bez měsíců žně jaře
    (`withoutMonths`), přetečení července do srpna `harvestOverflow` (`lordHarvestHelp`,
    `seasonShortfalls` – výhled dílu má jedno okno žně do konce srpna); ruce výmlatu
    (`threshHands`) odečtou v srpnu nutnou žeň všech plodin, obilné jámy čekají i na zbytek ozimu
    (`springHarvestAhead`). **Kde se násobí
    úroda:** `cropYieldKg` (`year-plan.ts`) – hrubá úroda dílu × `kept` = 1 − `PartLosses[id].share`,
    osivo se odečte celé. Ztráty skládá `dayPartLosses` (`disasters.ts`) – počasí dílu
    (`partWeatherFactor`) × (1 − škoda zvěře); volají ho `harvestWinter` (ozim, luštěniny),
    `harvest` a `harvestFlax`, odhad ozimu pro příděl `winterEstimateLosses`
    (jen počasí, které je vidět) v `diet.ts` a `emergency-slaughter.ts`
    ([village-disasters.md](village-disasters.md) – Sucho, deštivé léto, krutá zima). Plán po plodinách
    prochází `seasonCrops`, všechny díly `seasonPartIds`. **Luštěniny** (fields.md – Luštěniny, Martin 18. 10. 2026): třetí plodina `legume` (`SeasonCrop` s `crop: 'legume'`, `LEGUME_WINDOWS` – jař se sklizní
    v červenci, `LEGUMES` a `LEGUME_WORK_PER_HA` v `rules*.ts`, úroda `cropGrossPerHa` /
    `cropSeedPerHa`, `partWork(…, crop)`). **Z polí vyřazené (Martin 9. 11. 2026, fields.md –
    Luštěniny, zrušeno):** `turnSelection` je nepřidělí, cíl luštěnin
    a `FoodCosts.legumePerKg` jsou pryč; pravidla a okna zůstala jen pro
    dorůstající luštěniny starších vsí. Převod `withoutFieldLegumes` (`field-legumes.ts`, řetěz
    převodů na začátku `advanceVillageSteps`, den `lastDay`): nezaseté díly luštěnin
    (`unsownPartIds` z `field-progress.ts`) přejdou `moveParts` do nutné jaře i s přípravou půdy,
    `part.crop = 'spring'`, prázdná plodina luštěnin zmizí; výběr z paměti (`season.selection`)
    s luštěninami propadne. Zasetá luštěnina dál – sklizeň 31. 7. (zbytek 31. 8.) do `VillageState.legumesKg` (`harvestWinter`), osev úrodnost vrátí
    (`LEGUMES.fertilityGain` v `endOfSeason`). Scéna: `SceneFieldPart.crop: 'legume'` – trsy
    hrachu `crop-pea-green` / `crop-pea-ripe` a hromádky `pea-heap` v `crops.glb`.
    **Len** (fields.md – Len, diet.md – Oděv; Martin 19. 10. 2026: „na částech pole musí být zasetý
    len“, čísla návrh Clauda podle rešerše `research/2026-10-19-flax.md`): čtvrtá plodina `flax`
    (`SeasonCrop` s `crop: 'flax'`, `FLAX_WINDOWS` = okna luštěnin, `FLAX` a `FLAX_WORK_PER_HA` v `rules*.ts` –
    potřeba 2 / 1 kg třeného lnu na dospělého / dítě, 550 kg/ha, osivo 0, neopletý 50 %, úrodnost
    −0,18 v `endOfSeason`, nemlátí se). **Zpět na poli (Martin 9. 11. 2026 večer, fields.md –
    Len):** `startSeason` zapíše `FarmSeason.flaxNeedKg` (`flaxNeedKg` lidí k 1. 9.);
    `turnSelection` (`rotation.ts`, `TurnOptions.flaxNeedKg`) vybere len napřed – jen když jař
    smí začít (okna kopání), do potřeby (`expectedFlaxKg` lnu letošní práce + nových dílů) –
    z `flaxCandidates` (jeden seznam: všechny díly na řadě `again` / `first` / `late` bez ohledu
    na druh osevu, od nejlepší `effectiveFertility`, při shodě id; Martin 10. 11. 2026 „Ano. Jak jsme
    řekli, len je extrémně náročná plodina, ale zase ho není potřeba moc“ – napřed díly v osevu je
    pryč). **Odložení na podzim:** dokud běží okno ozimu (`winterStartable`), `turnSelection` projde
    stejný seznam do potřeby a díly jen přidá do `used` (bez `join`) – ozim je nedostane, len
    se jim přidělí v listopadu / dubnu; nic se neukládá, odvodí se ze stavu dílů; jen `isSowableFertility` a `flaxAllowedIn` (rok sklizně
    `seasonHarvestYear` − `FieldPart.flaxYear` ≥ `FLAX.returnYears` 7; chybí = smí).
    `rotateAfterSeason` 1. 9. zapíše `flaxYear` osetému lnu (i nevytrhanému). Trhání:
    `FLAX_WINDOWS.harvest` [8, 8]; v pořadí práce dne (`dayTaskOrder`) má trhání
    skupinu `flax-harvest` (`DAY_WORK_ORDER`) – z obecné práce za výmlatem na dnešní jídlo a všemi
    žněmi obilí (i jař s oknem do září), před sečí a výmlatem; **ženy a děti trhají napřed**
    (`womenFirst` v `allocateDay` – před všemi úlohami dne výrostci a starší ze žňových rukou
    `harvestYouth` = `harvestHelperLabor`, ženy řemeslníků `light`, ženy vsi nad
    `WEEDING_WOMEN.dailyMinShare` minima jako při pletí; řemeslníci se syny a muži dál žnou obilí;
    Martin 10. 11. 2026); rodina vojvody nepomáhá
    (`noLordHelp` v `allocateDay`, `addSideCrop(…, false)` – trhání lnu není v zátěži žní
    `cropLoadOf`), dřinu (`isToilDay`) nepřidá. `harvestFlax(state, day)` v `harvestEarlyCrops` 31. 8. (`final`): `harvestKg` vytrhané části (zbytek propadne), `VillageState.linen` = kg ÷
    `flaxNeedKg` plánu, `linen-short` při nedostatku; plán bez `flaxNeedKg` nic. `linenUnhappiness`
    (`HappinessFactors.linen`, až `FLAX.unhappiness` 4). **Zahrádka u obydlí** (`garden.ts`, čísla
    `GARDEN` v `rules-fields.ts`): `harvestGardens` (31. 7. v `harvestWinter` – dostane `landscape`
    ze `simulateDaySteps`) – obydlí s `plot`, obyvateli a bez `disusedDay`: `gardenLegumeKg`
    (celé záhony `gardenBedAreaM2` – políčko `CELL_SIZE_M`² bez `shapedFootprint` domu a cestičky
    `GARDEN.pathWidthM` × vzdálenost čela domu od okraje podle `PLOT_HOUSE_OFFSET_M`, dvůr dvorce
    ne – čisté luštěniny bez osiva), úrodnost `gardenFertility` (`landscape.fertility` políčka
    `plot.cell`, nejméně `GARDEN.manuredFertility` – hnojená; bez krajiny `manuredFertility`),
    počasí `gardenWeather` (`partWeatherFactor` luštěnin bez ochrany, pohromy dílů ne); luštěniny
    do `legumesKg`, zápis `Dwelling.garden` (`{ legumeKg }` – panel obydlí, ikona `legumes`),
    kronika `garden-harvest` (souhrn za ves; `flaxKg` jen ve starších zápisech); ves založená po
    `GARDEN.sowingEnd` (`gardensSown`) nic. Převod `withoutGardenFlax` (`garden.ts`, řetěz
    v `advanceVillageSteps`): zápis zahrádky ztratí `flaxKg`.
    Zpracování lnu je v domácí výrobě
    (přerozdělení), žádná zásoba v liště. Web: `SceneFieldPart.crop: 'flax'` a `bloom` (červen –
    `FLAX_BLOOM_MONTH` ve `village-view-fields.ts`), scéna `FLAX_STYLES` / `FLAX_BLOOM` ve `field-crops.ts`
    (druhy trsů `flax-green` / `flax-bloom` / `flax-ripe` – kopie uzlu `crop-sprout` s vlastní
    geometrií, `CROP_NODE` ve `field-renderer.ts`; kvetoucí len napůl modré trsy), malé panáky,
    nízká koruna; panel `CROP_LABELS.flax` (ikona `resources/flax` – `icons.py flax`),
    `fieldPartName` („Zelený / Kvetoucí / Zralý len“, „Trhání lnu“), upozornění „Chybí len na oděv“,
    `/dev/buildings` pole **Len** (`FLAX_SHOWCASE_PHASES`).

- **Přílohová soustava do roku 1100** (fields.md – Přílohová soustava do roku 1100, Martin 10. 11. 2026; nahrazuje pevný sled ozim → jař → úhor z 25. 10. 2026): `rotation.ts` –
  `nextSowing` (`first` čerstvý díl a příloh ≥ `fallowReady`, `again` díl v osevu – `ready`
  s `sownYears` > 0, `late` příloh 70–95 %, `emergency` 40–70 %, `rest`; díl v sezóně null),
  `sowingCropToday` (každý díl na řadě ozim, dokud běží okno setí ozimu, pak jař v oknech kopání
  – `springStartable`; žádný předepsaný sled), `rotateAfterSeason` (1. 9.: úrodnost jako
  `endOfSeason`; díl s ≥ `sowableMin` → `ready` v osevu, jinak ho `endOfSeason` pošle do přílohu
  – platí pro obilí, len, luštěniny i nouzový osev), `onTurn` (`first` a `again`). `sowingGroup`
  dává připravenému dílu se `sownYears` > 0 skupinu 1. Převod starších vsí `withoutRotationNext`
  (v řetězu převodů `advanceVillage` za `withSowingRotation`): smaže `FieldPart.next` (pole z typu
  zmizelo), díl na řadě pod 70 % pošle od `lastDay` do přílohu; bez `next` vrátí tentýž stav.
  `ploughPairsForRotation`: `first` do podzimního okna orby ozimu, `again` do všech oken orby.
  `THREE_FIELD_FROM_YEAR` = 1100 (`rules-fields.ts`) – jen mez pro budoucí trojpolí. Testy
  `sowing-rotation.test.ts` (rok po roku do 70 %, ozim po ozimu, příloh do 95 %, převod `next`).
- **Osevní postup po dílech** (fields.md – Osevní postup po dílech a setí do konce okna, 25. 10.
  2026; plán `2026-10-25-sowing-rotation`, Úloha 1; pevný sled na dílu od 10. 11. 2026 nahradila
  přílohová soustava – výše): `rotation.ts` (výběr k práci plánu zrušen 9. 11. 2026 s cílem osevu – `turnSelection`
  vrací všechny díly na řadě; len je na zahrádce).
  Sem se přesunuly i `sowParts` a `reclaimedLogs`.
  **Panel – Příště a Na řadě** (fields.md – Osevní postup po dílech, bod 6; Úloha 7):
  Obnova přílohu `FERTILITY.fallowRecovery` = 0,05 ročně (26. 10. 2026, dřív 0,025): odpočatý díl
  95 → 83 → 71 → 59 % a 7–8 let přílohu, `field-capacity.ts` počítá z ustálené dráhy odpočatého
  dílu (`steadyPath` – osev rok po roku do `sowableMin`, příloh do `fallowReady`, perioda 51 let =
  5 oběhů): `rotationYears` / `ROTATION` průměr na oběh (3 osevy, 7,2 roku přílohu),
  `ROTATION_FACTOR` 3,4, `averageSownShare` 0,85, `averageRotationShare` 0,79,
  `STEADY_PATH_YEARS` 51 (do 10. 11. 2026 2 osevy a 5 let, 7 / 2, 0,89). Kalkulačka
  (`steady-state.ts` – `winterHectares` až celý osev v ozimu) i měření berou `ROTATION`.
  `part-rotation.ts` – `partRotation(state, day, yearWork?)` → díl id → `PartRotation`: `next`
  (`NextCrop` – plodina nebo `'fallow'`; nezasetý díl letošní práce svou plodinu, zasetý postup na
  kopii dílu přes `rotateAfterSeason` k dalšímu 1. 9., díl na řadě ozim / jař podle
  `sowingCropToday` den po dni dopředu), `rest` (úhor: `fertilityShare / FERTILITY.fallowReady`
  na setiny a roky do osevu po `fallowRecovery`), `round` (kolikátý osev oběhu), `onTurn` (na
  řadě mimo letošní práci). Zakládaný díl chybí. Jen
  čte stav. `fieldPartLooks`: připravený díl v osevu (`sownYears` > 0) je strniště, dokud na něj
  nepřijde další práce.

- **Osivo ze zásob** (fields.md – Úroda, Osivo ze zásob; Martin 27. 10. 2026): `seed.ts`.
  `CropWork.seedKg` = osivo vzaté ze zásob (`createCropWork` dá 0; chybí = práce z doby před
  změnou – převod `withSeedForgiven` v `advanceVillage` jí dá `seedKg` = zasetý podíl × osivo
  plánu; `harvestKg` osivo neodečítá nikdy). Polní úlohy (`fieldTasks` v `simulate-work.ts`)
  omezí setí na `seedSowCap` (zasetý podíl ≤ (vzaté + `sowableSeedKg`) / osivo plánu); po práci
  `takeSeed` vezme osivo zasetého podílu – obilí napřed z hromady osiva okna, pak ze zrna nad
  přežívací zásobu `keepKg`, u dílů na řadě pak z `reservedSeedKg`, pak ze zbytku (`storesKg` +
  `drawGrainPits`); dosévané luštěniny starších vsí jen z `legumesKg`. `sowableSeedKg(state,
store, keepKg, needed)` = `reservedSeedKg` (jen `needed`) + max(hromada, běžné zrno − `keepKg`).
  `seedKeepKg` = přežívací zásoba do žní (zásoby i snopy; `slack` = nejnižší `STARVATION.threshold`
  skupin ve vsi – s `reservedSeedKg` nejvýš `SEED_BUYING.eatFromStarvationDays` –
  − `SEED_STORES.marginDays` − `starvationDays`; cílový příděl 0,9 × (1 − `slack` / dny do žní),
  zrno na něj `grainAheadForOutlookKg` nad `baseMealInput` (`meal-input.ts`) ÷ `grainKeepPerDay`
  ^ ((dny + 1) / 2)). `grainSeedTakenKg` – osivo obilí, které letošní nutná práce vzala.
- **Hromada osiva okna** (fields.md – Osivo bez cíle osevu; Martin 9. 11. 2026):
  `VillageState.sowingSeed` (`SowingSeed` – `crop` ozim / jař, `totalKg`, `days`, `kg`) – jen
  v okně setí (`sowingWindowCrop`: ozim září–říjen, jař březen–duben a po dlouhé zimě do 14. 5. –
  `springSowingExtended`) a jako zimní osivo (níž), od konce jarního okna do září chybí. `sowingSeedDay` (konec `seasonDay`, po výběru dílů dne):
  první den okna zapíše `totalKg` = `windowSeedNeedKg` (nezasetý podíl letošní práce plodiny i nad
  potřebu + díly mimo práci na řadě podle `nextSowing` – pro ozim i jař `onTurn`)
  a `days` = `sowingDaysLeft` (dny setí do konce okna bez dní `springSowingHeld`); každé ráno
  `kg` = min(`totalKg` × dny setí zbývající / `days`, `windowSeedNeedKg`) − `reservedSeedKg`, nejvýš
  běžné zrno a běžné zrno + `sheavesOutlook` − `seedKeepKg`. `settleSowingSeed` (v `simulateDay`
  hned po `work()`) srazí `kg` na ideální zbytek od zítřka – osivo za nestihnutou část dne zpět do
  jídla, v poslední den okna celé. Ves ho nejí: `dayMealInput` odečte `uneatenSeedKg` (hromada +
  `reservedSeedKg`). Převod `withoutSeedTarget` smaže `FarmSeason.seedWaitingKg` a `seedFloorKg`
  (jednou, idempotentně).
- **Zimní osivo** (fields.md – Zimní osivo; Martin 9. 11. 2026): od listopadu do konce února
  (`winterSeedMonth` – měsíce mezi koncem okna setí ozimu a začátkem jaře v `CROP_WINDOWS`)
  `sowingSeedDay` každý den zapíše `sowingSeed` = `{ crop: 'spring', totalKg: windowSeedNeedKg
jaře, days: 0, kg, beforeWindow: true }` s `kg` jako hromada okna (`pileKg` – nejvýš běžné zrno
  a zrno + snopy − `seedKeepKg`); `settleSowingSeed` ho nevrací. Ves ho nejí (`uneatenSeedKg` –
  jídlo dne, výmlat na jídlo, platby), takže šetří už v zimě. 1. 3. `sowingSeedDay` hromadu
  s `beforeWindow` založí znovu jako hromadu jarního okna. Starší vsi převod nepotřebují – zimní
  osivo se zapíše první den po načtení.
- **Výhled zásob a osivo** (fields.md – Výhled zásob k sklizni): `seedOutsideFoodKg(state, day,
tools)` = s hromadou `pileSowsKg` (osivo, které ves ještě zaseje: `sowingHaPerDay` – spřežení
  `ableTeams` × `PLOUGH_HA_PER_DAY` × `oxenStrength`, bez spřežení práce dospělých ÷ kopání a setí
  hektaru – × dny setí do konce okna, v zimě `windowDaysLeft` jarního okna, × osivo na hektar,
  nejvýš hromada) + `reservedSeedKg`; bez hromady jen osivo zakladatelů v lhůtě `keptSeedKg`.
  Odečítá ho `fieldStoresOutlook` i `paymentPool` (přebytek energie); vymlácené zrno k platbě
  odečte celou hromadu (`uneatenSeedKg`).
- **Setí týž den za orbou a motykou** (fields.md – Práce; Martin 9. 11. 2026): `fieldTasks` dá
  úloze setí jen zpracovanou půdu do včerejška a orbě a kopání `FieldTaskEntry.sowRatio`
  (`sowPerTill` v `year-plan.ts` × podíl, který dovolí osivo); `allocateDay` (`labor.ts`) dá úloze
  s `follow` práci i na setí za sebou v poměru `ratio` a přičte ji úloze setí. V `work()` se setí
  plodiny použije až po jejím kopání (`applyOrder`) a nejvýš na zpracovanou půdu
  (`cropTaskRemaining`). **Rozsévač za spřežením** (Martin 9. 11. 2026): `partWork` dá oranému
  dílu setí `SOWERS.perTeam` × dny spřežení (orba ÷ `PLOUGH_HA_PER_DAY` × sazba orby – jako
  `pairCapacityPerDay`; drn 2,5× víc dní), motyka
  `FIELD_WORK_PER_HA.sow` = 1 ÷ `SOWERS.hoeHaPerDay` ≈ 3,3 čd/ha (`rules-fields.ts`); `ploughToHoe`
  přepočte setí oraných dílů na sazbu motyky s hotovým podílem (ne u plánu s `digWeight`).
  `winterStartable` / `springStartable` (`rotation.ts`) – díl smí začít i v poslední den okna.
  Plán kapacity (`sowingCapacity`, páry k rádlům) dál počítá s dnem rezervy `SOW_AFTER_DIG_DAYS`
  (návrh Clauda – celé okno posouvá zakládání polí správcem, samostatná změna). Výmlat na dnešní
  jídlo (`threshForFoodToday`) počítá jen zrno, které ves jí (bez `uneatenSeedKg`), a v rozdělení
  práce jde i před orbou (`dayTaskOrder`) – orba nese setí za sebou a jinak by jídlu dne vzala
  práci (Vlkov 1. 10. 871: hromada držela celé zásoby, 4,9 t ve snopech, příděl 0,115).
- **Osivo pro ves bez zásob** (fields.md – Osivo ze zásob, Osivo pro ves bez zásob; Martin 27. 10. 2026): `VillageState.reservedSeedKg` = osivo ve `storesKg` jen na setí (osadníků –
  `Settlers.seedKg`, village-people.md; koupené). `reservedSeedKg()` ho omezí zásobami;
  `sowableSeedKg` ho přičte vždy a přežívací zásobu počítá ze zbytku zásob (obilí nad potřebu ho
  nedostane); ves ho nesní nikdy (`uneatenSeedKg`); `takeSeed(…, keepKg)` u nutných dílů bere napřed
  běžné zrno nad přežívací zásobu (`seedKeepKg` – `work()` jednou za den `sowKeepKg`), pak
  rezervu, pak zbytek zásob (oprava 2. 11. 2026, dřív rezervu napřed).
  `seed-buying.ts` (`seedBuyingDay` v `simulateDay` po `startPurchases`): 1. 6.
  (`SEED_BUYING.releaseDay`) ho smaže; 1. 9. a 1. 3. (`SEED_BUYING.days`) `seedShortKg` = osivo
  na díly na řadě v okně (`windowSeedNeedKg`) − `sowableSeedKg` − snopy; od `minKg` `buySeed`: zásoba obilí sousedů (`neighbourStock` ve směrech
  `NEIGHBOR_DIRECTIONS`, ubude `storeStock`), cena `buyPrice('grain')`, platba hřivny → krávy
  `surplusCows` (husbandry.ts – nad krávy na mléko a voly, jako porážka; od 2. 11. 2026, dřív
  `cattleForSale`) (`sellPrice` × `goodWorth`), přeplatek obilím do zásob (`changeKg`); kronika
  `seed-bought` / `seed-short` (`reason`: `pay`, když `getKg` < zásoba sousedů, jinak `supply` –
  oprava 2. 11. 2026; upozornění `seed-short`).
- **Příprava jaře jen na díly s osivem** (fields.md – Osivo ze zásob; oprava, návrh Clauda 2. 11. 2026): `seedPrepShares` (seed.ts) v březnu–dubnu – nutné plány jaře, luštěnin a lnu
  v otevřeném okně setí (ne ozim, ne `surplus`) → podíl plánu, na který stačí `seedKg` + osivo
  z poolu (`sowableSeedKg` + `sheaves.grainKg` / `legumesKg`, dělí se v pořadí `seasonCrops`).
  `fieldTasks` omezí `reclaim`, `dig` a `plough` na podíl × potřebná práce − hotová.
- **Postup práce po čtvercích** (Martin – fields.md): kopání, setí a sklizeň mění díl, až k němu
  dojde práce. `field-progress.ts` (jen čte): díly plodiny v pořadí `CropWork.partIds` (dávka
  po úsecích hospodářství od domu ven – řadí `createCropWork` s `workOrder`, ves bez hospodářství
  nejblíž obydlím první, při shodě id), váha = plocha × vzdálenost;
  `fieldPartLooks` → vzhled dílu `{ look, work?, before? }` (bare, plowed, sown, sprouted, green,
  ripe, harvesting, stubble, young-fallow, pasture; vzejití a zrání podle kalendáře; starší
  příloh bez vzhledu – doplní scéna), `fieldFrontiers` (čelo práce úloh dne), `partsWorked`
  (díly, přes které dnes práce postoupila). Rozdělení práce dne (`labor-report.ts`) dostává
  `fieldWork` (před a po po plodinách) a cílí polní práce na `{ kind: 'field', id, parts }`.
  Ve scéně (`village-view-scene-types.ts`) je díl `SceneFieldPart` (`id`, `look`, `work`, `before` –
  `FieldLook`) a podíl práce `SceneLaborShare` s `parts`; postavy (`villager-plan.ts`) pracují na
  `parts`. Simulace se tím nemění.

- **Klučení lesa pro pole** (forest.md – Klučení lesa pro pole – postup; Martin 24. 10. 2026, fáze
  a čísla návrh Clauda): díl v lese (`surface: 'forest'`, ne louka rádlem) dostane při založení
  `clearing` (`PartClearing` – stojící stromy v pořadí kácení `fell` s `log` u dospělých,
  `felled`, `burnCost`, `felledDay`) místo `trees`. Cena zůstává sazba lesa: kácení s kameny
  = `foundingCost − burnCost` (60 %), pálení `burnCost` (40 %, `FOREST_CLEARING`). Fáze
  (`forest-clearing.ts`, čisté funkce): `clearingStage` – `'fell'`, dokud není odvedena práce
  kácení, `'dry'` `dryDays` (30) dní od `felledDay` a mimo `BURN_WINDOWS` (březen–říjen), jinak
  `'burn'`. Simulace (`simulate-build.ts`): `constructionNeed` pole = Σ `clearingNeedToday`
  (kácení zbytek kácení, schnutí 0 – práce jde do jiných staveb, pálení zbytek celku);
  `invest` bere díly v pořadí `clearingWorkOrder` (napřed pálení, pak kácení a díly bez fází,
  obojí od nejbližšího, při shodě id). **`completes`** = pole dostalo celou dnešní potřebu, ne
  „založ vše“: kácený díl dostane jen zbytek kácení (všechny stromy padnou, `felledDay` = dnes,
  pak schne), založí se jen díl, který dnes dohoří. `fellDueTrees` (jednou za díl a den) pokácí
  stromy, na které došla práce (`treesDue`) – pařez přes `fellTrees`, strom, který mezitím padl
  jinak, bez klády; klády dospělých na hromadu pole u cesty nejblíž čtverci (`addLogs` s `fieldId`, místo
  `partCenter`; bez cesty do 60 m u čtverce). Dohoření (`foundPart`):
  zbylé stromy padnou, překážky zmizí (`recordClearedObstacles`), záznamy kácení stromů dílu se
  smažou, `burnedDay` = dnes, bonus popela od dneška, `clearing` zmizí; překážky a stromy dílu
  si stavba pole zapíše do `Construction.burntObstacles` – trasy chodců a vozů je vidí až
  s dohořením celého pole (village-roads.md – Klučení a mapa tras); `build` díl s fázemi
  bez práce hned nezakládá. Ubraný díl (`land-taken.ts`) zmenší i `burnCost` a zkrátí stojící stromy `fell`
  úměrně zbytku plochy, odebraný dá klády za nepokácené dospělé stromy a smaže záznamy jeho
  pokácených stromů; `build` dopíše pád dílu s nulovou prací kácení (jinak by schnul navždy). Vzhled (`fieldPartLooks`): kácení `slash` s `work` = padlé / všechny,
  schnutí `slash`, pálení `burnt` s `work` = podíl pálení a `before: 'slash'`, připravený díl
  s `burnedDay` do první práce `burnt` (`isFreshBurn` – první oběh, bonus běží); doutnání
  `isSmoldering` (`smolderDays` od `burnedDay`). Scéna zatím kreslí `slash` jako rozrytý drn
  a `burnt` tmavě (`LOOK_STYLES`). Testy `forest-clearing.test.ts`, `forest-clearing-sim.test.ts`
  (fáze po dnech, leden → pálení od 1. 3., červen → po 30 dnech, po kouscích). Malá testovací
  ves (2 dospělí, pole se 2–4 čtverci lesa): založeno 1. 10. → pokáceno 16.–22. 10. → dohoří
  2.–11. 3. → první čtverec zaseto 4. 3. (154 dní); založeno 5. 1. → dohoří 9.–12. 3., zaseto 11. 3. (65 dní); založeno 1. 6. → dohoří 10. 7. (39 dní), v září zařazeno do osevu.
  **Převod starších vsí** (`forest-clearing-migration.ts`, `withForestClearing`; volá se v
  `updateVillage` po `withGrainPits` a na začátku `advanceVillageSteps`, jen s vrstvou
  překážek): zakládaný díl v lese bez `clearing`, s `obstacles` a čtvercem dostane `fell` ze
  stojících stromů svých překážek (pořadí `fellingOrder`), prvních `trees` dospělých dá kládu,
  `trees` zmizí, `burnCost` = `foundingCost × (1 − fellShare)`. Odvedená práce se nemění: došla-li
  na kácení, všechny stromy padnou v den převodu a `felledDay` = dnes − `dryDays` (suché hned),
  jinak padnou stromy podle `treesDue`. Bez vrstvy nebo bez takového dílu vrací týž objekt;
  selhání jen poznamená `forestClearingFailed` (log v `updateVillage`). Vlkov (stav z 26. 10. 2026) žádný zakládaný díl nemá – převod je beze změny a rok dopočtu trvá jako dřív
  (≈ 30 s). Test `forest-clearing-migration.test.ts`.
  **Pohled pro rozhraní** (`village-view-fields.ts`): `fieldPartView` dílu s `clearing` přidá
  `founding.clearing` (`PartClearingView` – `stage` z `clearingStage`, `treesLeft` = zbylé
  stromy z `fell`, `burnFrom` z `burnFromDay` jen po pádu posledního stromu), `fieldViews` počty
  čtverců po fázích `clearing: { fell, dry, burn }` (jen když nějaké běží);
  `VillageView.woodLogsForest` = `summary.forestLogs` (klády u lesa, chybí při nule). Test
  `village-view.test.ts`.

- **Hospodaření podle polohy domů** (Martin – fields.md): `holdings.ts` – díl patří k nejbližšímu
  domu (vzdušnou čarou; `villageHoldings`/`fieldHoldings`), hospodářství se dělí na úseky od domu
  (prstence po 15 m, v každém tolik dílů po směru, kolik čtverců má první prstenec – výseče kolem
  samoty, lány za domy v řadě). Nic se neukládá, vše se odvodí z polohy domů a čtverců. Plán osevu
  bere `sowingBlocks` (bloky úseku ve skupině přílohové soustavy od domu ven, osev mezi
  hospodářstvími podle plochy) a osevní postup bere díly na řadě po blocích; pořadí práce
  `workOrder`. Ves bez hospodářství (bez domů nebo bez políček – i `measure-village.ts --land v1`)
  jede dřívějším pořadím bit po bitu; kalibrace na skutečných krajinách hospodaří podle domů. Měření `packages/game/scripts/measure-holdings.ts`; na
  `/dev/landscape` tlačítka „Hospodaření“ (ukázka po 20 letech simulace), „Úseky“ (překryv
  `HoldingsOverlay`) a „Po 20 letech“.

- **Navazující pole** (Martin): `foundField` – čtverce navazující stranou na pole ho rozšíří
  (`fieldsTouching` ve `fields.ts`, stejné id, rozestavěné založení dostane cenu, jinak nová stavba
  pole), na víc polí je sloučí do nejstaršího (`mergeFields` ve `fields.ts`: díly, stavby
  založení, kronika, `labor` – cíl i stavba). Průběh stavby pole se počítá jen z jejích dílů
  (`invest`). Náhled (`fieldPartsFromCells`) vrací `joinedFields` a nejmenší výměru měří i
  s navazujícím polem. **Stará navazující pole** (založená samostatně dřív) sloučí při načtení
  vsi `withMergedFields` v `updateVillage` (souvislé skupiny stranou do nejmenšího id, pole
  z obrysu ne; Martin) – stejným `mergeFields`, bez příznaku „převedeno“ (idempotentní a levné).

- **Zarůstání přílohu** (fields.md – Zarůstání, Les vsi; Martin 18. 10. 2026: „Ano udělej to
  tak“ – nepasený a nesečený příloh zarůstá, les z pole vypadne; čísla návrh Clauda podle rešerše
  `research/2026-10-18-overgrowth.md`): 1–2 roky mladý příloh, pak louka (pastvina, louka na
  seno). `overgrowth.ts`: pastva po dílech `grazedPartIds(state, day, demand)` z `pasture.ts`
  (`pastureGrazing` – Martin 19. 10. 2026, louky určené ke spásání: napřed příloh ve fázi louky
  mimo letošní seč od nejbližšího, pak přirozené louky mimo seč, pak mladý příloh třetinou píce,
  nakonec otava posečených dílů – `PASTURE`; potřeba jen podílem uhlídaným pasáky –
  `herdingCoverage`; díl nejvýš svou plochou, spásl se při polovině –
  `OVERGROWTH.grazedMinShare`; nosnost `pastureHa(state, day)` stejně – přirozená louka bez luk
  letošní seče `naturalPastureHa`, otava a mladý příloh třetinou; stejnou funkcí
  `pastureGrazedParts` v `paths/village.ts` chodí
  pasáček v síti pěšin a pasou se stáda ve scéně – `SceneFieldPart.grazed`; seno se seče i na
  přirozených loukách do 600 m, ty nezarůstají), roční krok
  `overgrowthDay` 1. 11. před porážkou (jen díly ladem celé období od 1. 4.): nespasený a
  neposečený díl (`mownPartIds` v `hay.ts`) přidá `FieldPart.overgrowthYears`, pastva či seč ho ve
  fázi louky vynuluje, od křovin ne. Stadia `OVERGROWTH_STAGES` (5 křoviny, 15 mladý les, 30 les)
  → `fallowStage` / `PartStage` `shrubs`, `young-forest`; křoviny a mladý les nejsou pastvinou
  (`pastureHa`), nesečou se (`isHayMeadow`) a rádlo je nezorá; vrácení podle stadia
  (`RECLAIM_COST_PER_HA` – louka, křoviny, les) a mladý les dá klády (`reclaimedLogs`; nutné díly
  až za skácené stromy – `clearedLogs` ve `fellReclaimed`). Díl v lese
  z pole vypadne (`dropForestParts`, pole bez dílů zanikne, kronika `part-became-forest` s polem
  a počtem dílů, upozornění) do **lesa vsi** `VillageState.woods` (`woods.ts`: políčko, střed,
  plocha, povrch, den – stáří od 30 let): jeho stromy jsou překážky nad vrstvou jako stromy
  u cest (`obstacleChangesAt` → `added`, id `WOOD_TREE_ID_BASE` = 2^31 + políčko × 64 + pořadí,
  místa `woodTreeSpots`; 240/ha, dospělé od 15 do 70 let – `VILLAGE_WOOD`), kácí se na dřevo
  (`nearestMatureTrees`, `availableTrees`; i uhlíř – `isBeech` / `'beeches'` les vsi bere,
  pařezy se sazenicí přes `felledTreeStage`), pole na nich mýtí les (`buildSquares` – povrch les,
  stromy z `added` dají klády; `clearWoodAt` po založení dílu), ostatní stavby ho vyklučí jako les
  krajiny (Stavba v lese; les vsi bez stromů zmizí – `dropClearedWoods` v `recordClearedObstacles`).
  Prasatům je les vsi lesem (`pigForestHa`).
  Starší vsi začínají roky bez pastvy počítat od nuly.

- **Opuštěný díl** (fields.md – Opuštěný díl; Martin 8. 11. 2026: „A“ – akce pro hráče
  i správce): `FieldPart.abandoned?: true` (volitelné, starší vsi beze změny). Doména
  `abandon-parts.ts`: `abandonPartBlock` / `abandonPartsBlock` (důvody `ABANDON_NO_PART`,
  `ABANDON_FOUNDING` – nezaložený díl, `ABANDON_ALREADY`, `RETURN_NOT_ABANDONED`),
  `setPartsAbandoned(state, day, ids, abandon)` mutuje (pro den správce) a `abandonFieldParts`
  je čistá funkce pro use-case (`validateActionDay`, `structuredClone`); kronika
  `parts-abandoned` / `parts-returned` s počtem dílů. Připravený díl jde hned do přílohu
  (`toAbandonedFallow` v `rotation.ts`), příloh zůstane, osetý roste a do přílohu jde 1. 9.
  v `rotateAfterSeason`; `returnPart` vyřazený opuštěný díl nechá ladem. Osev ho přeskočí přes
  `sowingGroup` (null), `isEmergencyFallow` (false) a `nextSowing` (`'rest'`) – na nich stojí
  `sowingOrder`, `sowingBlocks` i `ploughPairsForRotation`;
  `partRotation` u něj ukáže úhor bez odpočinku, `fieldCapacity` ho nepočítá. Zarůstání, pastva
  a seč beze změny (opuštěný příloh je přílohem). Use-case `abandonVillageFieldParts`
  (`application/abandon-field-parts.ts`, právo `abandonFieldParts: 'build'`), server action
  `abandonFieldParts` (`parseAbandonFieldPartsInput` – `{ partIds, abandon }`,
  `abandonFieldPartsForPlayer`). Panel dílu: `VillageFieldPart.abandoned`, v detailech výběru
  `partId`, `abandoned`, `abandonBlock`; přepínač `AbandonPartButton` (ikona
  `resources/abandon-part.png`, `aria-pressed`, popisek `abandonPartLabel`) vpravo nahoře
  v `SelectionPanel` (`onAbandonPart`). Scéna kreslí podle stavu dílu – beze změny.
  `/dev/panels?panel=pole-dil-opusteny`.

- **Výběr dílu pole a čtverce sadu** (fields.md – Co hráč vidí; Martin 19. 10. 2026: „Když
  kliknu na pole, zobrazí se mi jen to jedno políčko s parametry. Když dvojkliknu, označí se
  celé pole jako teď.“): `pickVillageTarget` vrací `{ kind: 'field-part', id: pole, cell }`
  a `{ kind: 'orchard-square', id: sad, cell }` (čtverec v mřížce stavby), `nextSelection(…,
double)` je dvojklikem rozšíří na celé pole / sad (`wholeTarget`; první klik vybere díl hned,
  dvojklik na ostatní je jako klik), `presentTarget` zahodí díl, který zanikl. Hřbitov se vybírá
  celý (hroby, plot – rozhodnutí Clauda). Obrys čtverců (díl, pole, sad, hřbitov, háj, ohrada)
  má v `SelectionHighlight` druhou průsvitnou kopii bez testu hloubky – prosvítá přes korunu
  vystouplého obilí a stromy. Data panelu: `VillageView.fields[].parts` (`VillageFieldPart` –
  úsporně, výchozí údaje chybí: výměra jen u neúplného čtverce, přirozená úrodnost jen když se
  liší, `holding` = obydlí hospodářství z `villageHoldings`, `work` = `partYearWork` z
  `field-progress.ts` – plodina, příprava půdy `reclaim` / `plough` / `dig`, setí, sklizeň, seč,
  `surplus`; `next` a `rest` z `partRotation`; osev oběhu, roky ladem, zakládání), `VillageOrchard.cells` (`VillageOrchardSquare` – stáří,
  `squareExpectedYieldKg`, výsadba, obnova, cesta); co je vidět (vzhled, stadium, zarůstání,
  pastva) bere `selectionDetails` ze scény (`selectedFieldPart`, `selectedOrchardSquare`).
  Panel: `FieldPartBody` / `OrchardSquareBody`, název pod portrétem `fieldPartName` /
  `orchardSquareName`, dům hospodářství je tlačítko (`onSelectTarget` ho vybere); ikony
  `resources/harvest` (srp s klasy) a `resources/walk` (šlépěje – cesta z domu). Při malování
  po čtvercích vybraný díl dá mřížku svého pole (`wholeTarget` ve `startBuild`).
  `/dev/landscape` vybírá jako hra (čísla panelu odhaduje `app/dev/landscape/dev-selection.ts`),
  `/dev/panels?panel=pole-dil` (`pole-dil-na-rade`, `pole-dil-priloh`, `pole-dil-zaklada`,
  `sad-ctverec`).

- **Pole ve scéně** (fields.md – Co hráč vidí; podle 0 A.D.): vzhled dílu `FieldLook`
  (`village-view-scene-types.ts`: `bare`, `plowed`, `sown`, `sprouted`, `green`, `ripe`, `harvesting`,
  `stubble`, `young-fallow`, `pasture`, `meadow`, `mown`, `haystacks`, zarůstání `shrubs`
  a `young-forest` – bez obtisku, `LOOK_STYLES` alfa 0) posílá po dílech herní
  jádro (`SceneFieldPart.look`, rozpracovaný díl `work` 0–1 a `before`, `id`; fronta práce
  `SceneLaborShare.parts`) – **dokud neposílá, odhadne ho `field-look.ts` ze stadia a data**
  (`fieldPartViews`, `estimatePart`: zakládaný díl s `work` 0 jen vytyčený, osetý díl prochází
  rokem po čtvercích od obydlí – kopání, setí, růst, žeň s panáky, strniště; mladý úhor se pase,
  starší úhor je louka na seno – od 18. 10. 2026 posílá jádro i vzhled úhoru ve fázi louky:
  `pasture`, seč `meadow` → `mown` → `haystacks`). Práce mění díl, až když k němu dojde: rozpracovaný díl se dělí
  napříč řádky (po 8 pruzích – `WORK_STEPS`) na hotovou a nehotovou část, práce jde od strany
  blíž vsi (`workFrame`). Kreslí `field-renderer.ts` (`FieldRenderer` ve `VillageRenderer`),
  **po blocích 8 × 8 dílů** (`field-blocks.ts`): obtisky a rostliny bloku se přepočítají, jen
  když se změnil vzhled jeho dílů (postup práce, žeň po čtvercích) nebo okraj, směr řádků či
  střed pole; hotové bloky se jen spojí (rostliny v pořadí dílů – výsledek jako celé pole
  najednou, hlídá `field-blocks.test.ts`). `fieldPartViews` má mezipaměť pro stav vsi (díly,
  obydlí, den). **Obnova vsi musí být levná** (výkon 19. 10. 2026 – Vlkov ≈ 1 800 dílů: obnova
  1,5 s → 25–120 ms): blok na dni nezávisí – kupky a stohy sena (jediné rostliny podle dne) skládá
  pole zvlášť (`fieldHay`, `FieldView.hay`); spojení použije znovu výšky a normály sítí obtisků
  (`drapedGrid`, `drapePoints`), meshe vrstev, řádků sena a koruny se stejným obsahem
  (`MeshSlot`, `sameContent`) a rostliny dílů, které vyšly stejně; druh trsů beze změny se znovu
  nenahrává (`setPlants` – `sameItems`), řazení podle `rank` je `sortByRank` a obal instancí
  `instancesBounds` (`plant-order.ts`, bit po bitu jako Babylon). `setDay` přestaví pole, jen když
  se změní den vzhledu (s rozdělením práce je to jeho den). Kreslí se:
  obtisky z textur 0 A.D. (`public/textures/fields/` – zem s měkkými brázdami podél řádků,
  osetá zem, strniště, porost shora; tráva a kvetoucí louka z terénu) s nepravidelným měkkým
  okrajem (`raggedCoverage`) bez meze (Martin) – kde pole sousedí s jiným polem, okraj se
  netlumí (`touchingSquares`) a pole navážou bez švu, skvrny (plevel, prošlapaná místa) druhou vrstvou;
  obilí jako 3D trsy v řádcích (`crops.glb` – uzly `crop-green|ripe|sprout|stubble`, jeden
  atlas, thin instances, tón druhu v barvě instance) – z dálky řídnou (`cropDensity`: plné do
  130 m, k 360 m pětina, od 620 m nic – pole pak nese obtisk), zralé a zelené se vlní ve větru
  (vertex shader `CropSwayPlugin`, jen v záběru, `WATER_FPS`, při omezeném pohybu stojí), pod
  sněhem nízké trsy zmizí; panáky (`stook.glb`) na sklizené části, plevel (trsy trávy) na
  úhoru a louce, seno – řádky, kupky a stohy (`haystack.glb`) přes podzim a zimu postupně mizí
  (`hay-meadows.ts`: `hayPhase`, `stackStands`; řádky sena jen na čerstvě posečených dílech –
  `PartView.swaths`: rozpracovaný díl a díly dnešní seče z rozdělení práce, v odhadu do
  `SWATH_DAYS` po seči, jinak kupky; zelenožluté, zvlněné a trhané – `swathTexture`, `swathAlpha`,
  `SWATH_COLOR`); kolíky a provázek kolem vytyčeného pole
  (Martin: hned po zadání, `fieldStaking`). Rozmístění trsů a panáků je v `field-crops.ts`
  (čisté funkce, deterministicky po políčkách). **Vystouplé obilí** (fields.md – Co hráč vidí;
  Martin 19. 10. 2026, dvouzrnka): zelené a zralé obilí má nad sebou neprůhlednou „korunu“
  porostu (`field-canopy.ts` – `fieldCanopy`, čisté funkce: síť po krocích obtisku ve výšce
  `CANOPY_M` – obilí 0,62 / 0,88 m, luštěniny ≈ 0,3 m –, k okraji pole podle krytí zanořená pod
  zem, svislé stěny tam, kde vedle nestojí stejný porost – schod na čáře žně; po blocích v
  `FieldBlockContent.canopy`, natočené pole `FieldSpace.canopy`, mesh `village-field-canopy-<id>`
  s texturou porostu, `applySeasonGround`); 3D trsy (zelené 0,85, zralé 1,15 m) z ní vyčnívají.
  Pole s 1 566 zralými díly: +1 draw call, ≈ +0,2 M trojúhelníků. **Kulaté rohy** (oxen.md –
  Kulaté rohy, Jen rádlo): pole vsi, která letos orá rádlem (`SceneVillage.fields[].ard` z
  `ploughsThisYear` v jádru – stav vsi, ne díly), má vnější rohy zakulacené obloukem
  `PLOUGH_CORNER_M` (5 m) – každý vypouklý roh, i schod obrysu (`outerCorners` a rohy
  v `cellsCoverage` – stačí, že oba čtverce po stranách rohu chybí, kulatější pole, fields.md);
  okraj každého pole se místy odsune až o `EDGE_WOBBLE_M` (2 m) dovnitř (`EdgeInset`,
  `raggedCoverage(…, wobbleM)`) –
  `cellsCoverage(…, rounding)` / `raggedCoverage(…, rounding)` v `field-cells.ts`, vnější rohy
  `outerCorners`; obtisk, trsy i koruna podle krytí, v klíči bloku (`partViewsKey`). Jen vzhled –
  plochu dílu roh neubírá. **Pod cestou obilí neroste**
  (fields.md – Co hráč vidí, Martin 19. 10. 2026): maska `track-mask.ts` (`trackMask` – úsečky
  a plácky rozcestí s hloubkou,
  přihrádky po 8 m, `keyNear` = klíč pásů v bloku) z průřezů obtisku (`ribbonSections` /
  `ribbonTrack` v `path-ribbon.ts`) – pevné cesty `roadTrack` (`road-works-layout.ts`, klíč cest
  `roadsKey` + `roadWorksKey`) s okrajem 0,8 m a pěšiny dne z `VillagePaths.pathTrack()` (síla po
  čtvrtinách) s okrajem 0,5 m, předává je `onChange` sítě pěšin přes
  `VillageRenderer.setPathTrack` → `FieldRenderer.setPaths` (odloženě s přepočtem pěšin, nikdy za
  snímek – síť pěšin, jejich obtisky a přestavba polí jsou tři samostatné úlohy). Násobí krytí pole (obtisk, trsy, panáky, plevel, koruna svahem); klíč bloku nese pásy
  bloku, takže se přestaví jen bloky, kudy pás vede nebo vedl; kusy pod pásem mají jemnější síť
  (`TRACK_DETAIL` – koruna 4×, obtisk 2×). Ukázka: /dev/landscape **Cesta** se zralým polem
  15 × 15 přes rozcestí; **Velké pole** – zralé pole ≈ 10 ha se schody v obrysu (tvar polí z
  výchozí kamery). Jen vzhled – plochu dílu cesta neubírá (roads.md – Cesta je cesta).
  **Louky na seno** ve vsi jsou data – políčka
  přirozených luk v seči (`SceneVillage.hayMeadows`, `hayMeadowFields` je kreslí jako pole
  se vzhledem `meadow` / `mown` / `haystacks`, postavy sečou po čele práce); dekorativní
  `chooseHayMeadows` jen ve vývojové ukázce (oxen.md). Den pro
  odhad a seno: herní den rozdělení práce, jinak roční období scény (`setSeason`).
  **Odvoz sena na stoh** (villagers.md – Fáze činností, Rolník; úloha 11 scény): na louce sečou,
  hrabou (`rake`) a skládají kupky (`pitch`), vůz se senem jede plný k ohradě a skládá do stohu
  (`CART_TEXTS.hay` v draft-activity.ts). Stoh u hotové ohrady roste se zásobou sena vsi
  (`HayState.kg` rovným dílem na hotové ohrady → `ScenePen.hay` 0–3 podle `HAY_STACK_KG` ve
  village-view-buildings.ts; `haystackSize` / `HAYSTACK_SIZES` v pen-layout.ts), přes zimu
  ubývá, bez sena není; bez údaje (ukázky) plný.
  Assety z `tools/blender/fields.py` (postup v hlavičce). Vývojové stránky: /dev/buildings
  projde posuvníkem všechny vzhledy pole i louku na seno, /dev/landscape tlačítka „Vzhled“
  a „Ukázka polí“ (pole v každém vzhledu; s „Lidé“ postavy na rozpracovaných čtvercích).
  **Zarůstání ve scéně** (fields.md – Zarůstání, Les vsi): `wild-growth.ts` (čisté funkce, testy)
  – na dílu s `SceneFieldPart.overgrowth` (roky bez pastvy a seče) keře od 3 let (plné křoviny
  v 15), průkopnické stromky od 8 let na místech budoucího lesa (`woodTreeSpots`), les vsi
  (`SceneVillage.woods`, stáří) ze stromů jádra v `obstacles.added` (dospělý, mladý, pařez – druh
  podle místa, s věkem víc dubů a buků, roste do 70 let) s podrostem; kreslí
  `wild-growth-renderer.ts` (`WildGrowthRenderer` ve `VillageRenderer`) v instancích z modelů
  krajiny, meshe `trees-<model>` / `decor-<model>` (roční období podle modelu, listnáče v zimě
  mimo stínovou mapu), přestavba jen při změně `wildKey`. Pod křovinami a mladým lesem obtisk
  pole není (`isWildStage` – okraj sousedního pole se k nim tlumí jako k louce). Stáda se pasou
  jen na dílech s `grazed` (`grazeablePart`), minimapa kreslí les vsi jako les, panel pole ikonu
  zarůstání (`resources/overgrowth.png`) s plochou (`VillageView.fields[].overgrowingM2`).
  /dev/landscape tlačítko „Zarůstání“ (`dev-overgrowth.ts` – díly 0–29 let a les vsi 30–70 let).

- **Humno** ([production-chains.md](../design/production-chains.md) – Humno, úloha 1; čísla
  návrh Clauda podle rešerše `research/2026-10-20-production-chains.md`): stavba hráče –
  `threshing-floors.ts`, `HUMNO` v `rules*.ts` (8 × 10 m, jen mlat bez přístřešku – Martin 21. 10. 2026:
  20 čd, žádné dřevo ani stromy, nerovnost do 1 m; přístřešek případně později jako vylepšení). `BuildKind` / `ConstructionKind` `'threshing-floor'`, kontrola
  `checkThreshingFloorPlacement` (volně jako dílna: louka i les – Stavba v lese –, na poli pole
  ustoupí – `takenLand`, ne voda, výchoz, posvátný dub a háj, jiná stavba ani nerovná zem),
  akce `startThreshingFloor(state, day, position, obstacles, site)` – humno vznikne hned
  ve `VillageState.threshingFloors` (`ThreshingFloor`, id = id stavby, `builtDay` null), po
  dostavění dostane den (`finishThreshingFloor`, `builtThreshingFloors`); půdorys
  `threshingFloorFootprint` znají kontroly ostatních staveb (`PlacementVillage.threshingFloors`,
  čtverce – příznak `threshing`), zbytky jam,
  stromy u cest a vzdálenost vsí. Use-case `placeThreshingFloor`, server action
  `placeThreshingFloor` (`{ villageId, position }`), mřížka staveb [K] (umístění i `PlacementMode`
  `threshing-floor` – duch jen obrys půdorysu), ikona
  `icons/build/humno.png`. Scéna: obtisk mlatu (`SceneVillage.threshingFloors`,
  `VillageRenderer.updateThreshingFloors`) – světlá udusaná hlína s ostrým okrajem (21. 10. 2026
  zesvětlená, `alphaIndex` 2,2 a `LIFT.turf` nad poli a hlínou vsi – dřív splývala se zemí), krytí
  podle fáze stavby; stoh, klasy, zrno a staveniště – scene-village.md, Humno ve scéně. **Výběr** (Martin 21. 10. 2026: „humno nemohu označit“):
  `VillageTarget` `{ kind: 'threshing-floor', id }` – klik na půdorys (`pickVillageTarget` přes
  `threshingFloorFootprint`), obrys půdorysu v `targetOutline`, panel `ThreshingFloorBody`
  (portrét `humno`; staveniště průběh stavby, hotové nevymlácené snopy v kg a značka „dnes se
  mlátí“ – `VillageView.threshingFloors` z `threshingFloorsOf`, podíl práce `thresh` s cílem
  humna).
- **Žeň jaře i v září** (fields.md, Martin 9. 11. 2026: „Ano, ať se jař sklízí i v září“):
  `WINDOWS.harvest` [8, 9], `thresh` [9, 10], `LATE_HARVEST_DAY` 30. 9., `THRESH_END_DAY` 1. 11.
  `harvest` 31. 8. dá jař do snopů přes `sheaveCrop(…, false)` – nedosklizená dostane `sheaved`
  a jde s plánem do `threshingSeason`; `lateSpringCrop` / `lateHarvestRemaining` / `cropsAfield`
  (`year-plan.ts`) ji v září vrací k práci. `harvestLateSpring` (`simulate-food.ts`, každý den září
  po jídle) ji dá do snopů v den, kdy je dožatá, nejpozději 30. 9. (`final`), pak
  `rotateAfterSeason` jejích dílů a `wildlifeSeasonEnd` (31. 8. jen, když jař sklizená je).
  `startSeason` 1. 9. díly nedosklizené jaře neposune, `turnSelection` je nevybere (`inSeason`).
  `activeTasks(…, late)` – žeň v září (`PLANNING_DAY.month`) jen pro ni, plodina letošní práce se
  žne až za rok. Práce dne: `fieldTasks` přidá její žeň (konec okna 9); `dayTaskOrder(…, reaping)`
  – ve dni, kdy ves žne, orba přednost nemá (žeň před orbou a setím; Martin 9. 11. 2026: „Je
  lepší za každou cenu sklidit…“). `harvestHandsDay`, `threshHands`, `springHarvestAhead`,
  zvěř (`cerealCrops`, v září jen ona – `dailyThreatShare`), scéna (`partYearWork`,
  `fieldPartLooks` přes `yearCrops`), výhled (`fieldOutlook` – okno `september`) a příděl
  (`baseMealInput` – `unharvestedKg` jako snopy) ji počítají. Plán: `SowingCapacity.september`
  a `CropLoad.september` (`augustOverflow`, `SOWING_CAPACITY_WINDOWS.august` [8, 8] a `september`
  [9, 9]), `sowingCapacity` ubere zbytek žně podzimu (správce ne – `withoutLateHarvest`), čelo
  práce (`workFront`) ho odečte; `lordHarvestHelp` a `HARVEST_HELP_WINDOWS` mají září.
  `domainFoodReadyYear` čeká, až je jař sklizená.
- **Snopy a výmlat hned po žni** ([production-chains.md](../design/production-chains.md) –
  Humno, úloha 2; fields.md – Výmlat hned po žni; Martin 20. 10. 2026: „Humno je podmínka“,
  „Klasy neskladovali.“, „Rok odkladu“; čísla `THRESHING` v `rules*.ts` – návrh Clauda podle
  rešerše – Výmlat na humně): `threshing.ts`. Sklizeň jde do snopů `VillageState.sheaves`
  (`Sheaves` – kg zrna obilí a luštěnin a zbývající práce výmlatu po plodinách `work` – sklizená
  část práce `thresh` plánu; `addSheaves` v `harvestWinter` / `harvest`), ne do `storesKg`.
  Okna `thresh` (fields.md – Pořadí důležitosti polních prací a výmlat do zimy): ozim a luštěniny
  srpen–únor, jař září–únor – dva úseky přes konec roku; `threshWindowLast` spojí úsek do prosince
  s lednovým, `threshWindowDaysLeft` počítá do konce února; `threshTasks` (úlohy dne v `work()` –
  skupina `thresh` za polními pracemi a hlídkou polí; mezi plodinami konec úseku okna a pořadí
  plodin, po okně – březen až srpen – `THRESH_OVERDUE_END` poslední; **výmlat na osivo** –
  `seedKg` z `seedThreshKg` v seed.ts, `ThreshTask.seed`, skupina `seed-thresh` před přípravou
  půdy: v okně setí obilí, když hromada osiva ráno narazila na vymlácené zrno, osivo na
  `THRESHING.seedDays` dní setí dnešním tempem, nejvýš ideál zbytku okna a nad přežívací zásobu;
  `urgentProgress` s `before` za výmlatem na jídlo; **výmlat na dnešní jídlo** napřed –
  `threshForFoodKg`: chybí-li zrno na 2 dny jídla, úloha `urgent` s `THRESH_URGENT_END` před
  žní; `urgentProgress` – na humnech do jejich kapacity plným výnosem, zbytek nouzově a o ztrátu
  `emergencyLoss` víc snopů, aby zrna bylo, kolik chybí; oprava 2. 11. 2026) a `threshCrop` převede snopy do zásob podílem postupu na práci druhu (obilí ozimu a jaře
  spolu). Úroda bez práce výmlatu jde rovnou do zásob (`addSheaves`). Výmlat v okně je dřina
  (`threshSeasonTasks` v `isToilDay`). Mlátí se jen
  s hotovým humnem (`threshingCapacity` – `floorManDaysPerDay` 12 čd na humno, humna se sčítají),
  nebo bez humna **vždy nouzově** na udusané zemi (Martin 21. 10. 2026: „Ať mlátí aspoň
  nouzově“) – bez omezení místa, o 30 % víc práce a 10 % zrna méně (`ThreshingCapacity.emergency`
  = bez hotového humna, nebo v odkladu `threshingGraceUntil` – ten zůstal
  jen v datech: humno v odkladu mlátí plným tempem, zbytek nouzově). Upozornění: jen
  `ThreshingStatus.emergency` („Mlátí se na udusané zemi – postav humno“, info); „Před žněmi
  postav humno“ a „Snopy čekají na humno“ zmizely. Snopy, které dnes nikdo v okně nemlátí, se kazí 10 % za měsíc i s prací výmlatu
  (`spoilSheaves` na začátku dne). Nová ves (`foundVillage`) má prázdné snopy bez odkladu; ves uložená dřív
  dostane `withThreshingGrace` (v `updateVillage` od dneška, v `advanceVillageSteps` od dne po
  dopočtu) – prázdné snopy a rok odkladu, úroda už v zásobách zůstane. `threshingSeason` se
  zahodí 1. 11. (`THRESH_END_DAY` – den po žňovém výmlatu jaře; snopy se mlátí dál bez něj).
  Výhled jídla (`DietInput.sheavesGrainKg` / `sheavesLegumesKg` – `sheavesOutlook`, jen když ves
  smí mlátit, se ztrátami `sheafYields` – nouzově −10 % podílu mimo humna po druzích snopů
  v pořadí úloh dne `threshTasks`; oprava 2. 11. 2026, dřív společný podíl obou druhů a mrtvá
  větev „pomalé humno“; **ruce do konce okna** – oprava 2. 11. 2026: `sheafYields` mlátí den po
  dni s rukama `VillageState.threshHands` (simulate.ts je uloží na začátku dne po `spoilSheaves`
  z `harvestLaborPerDay` – simulate-plan.ts, práce vsi za den ve žních, tatáž jako okna `july` /
  `august` v `sowingCapacity`; uložené, ne počítané ve výhledu – import práce vsi z threshing.ts
  by přes dobytek a stavby udělal cyklus s nedefinovanými konstantami `PROTEIN` a `PEN`) bez zbytku
  nutné žně jaře rozloženého do konce srpna (`threshHands()`); humna do kapacity, zbytek nouzově;
  po okně plodiny (`threshWindowDaysLeft`, v den žně i celé okno) ubytek `DAILY_KEEP` jako
  `spoilSheaves`, nejvýš rok; bez `threshHands` (ves před prvním dopočítaným dnem, testy) výmlat
  dne při dost rukou – jako dřív, kdy výhled počítal všechno dnes), plán osevu (`storesOutlook`,
  `fieldStoresKg(state, day)`) a dobré zásoby
  štěstí počítají snopy jako zrno; jí se jen vymlácené. Hlad a příděl (`eat` – `state.ration`)
  jdou podle menšího z výhledu a snědené energie. Odchod do nové vsi dělí snopy jako zásoby
  (`leavingFood`, `takeSheaves`). Plán osevu výmlat
  z podzimní kapacity (`sowingCapacity`) neodečítá a do zátěže srpna (`CropLoad.august` ve
  `sowing.ts`) nepřičítá – výmlat počká za polními pracemi do zimy. Rozdělení práce: výmlat na hotová humna rovným dílem (cíl `threshing-floor`),
  nouzový u vsi (`DayWork.threshing`); ve scéně mlátí podíl s cílem `threshing-floor` na humně (`threshingOnFloor` ve `villager-plan-fields.ts` – páry mlatců s holemi, prohazovači, nosič slámy), podíl s cílem ves nouzově u vsi (`threshing` – dva páry mlatců a dva prohazovači na místo; issue #3 – dřív mlátili všichni u vsi), pěší nosiči snopů jdou z pole na humno (`sheafFloor`, scene-village.md – Humno ve scéně); síť pěšin vede k humnu vstupem na předku
  (`threshingFloorEntrance` v `paths/entrances.ts`, `PathVillage.threshingFloors`, klíče sítě
  a chůze), humno je stavba, kterou obejdou pěšiny, vozy, vozové cesty (`villageBuildings`)
  i zemská stezka (`trailRoutes(…, floors)`); svoz snopů vozem jede i k humnu
  (`threshingFloorHaulPoints` – jízdy do ročního provozu cest). Stav pro upozornění
  `threshingStatus` → `VillageView.threshing` (`threshingOf` ve `village-view-buildings.ts`): „Před žněmi
  postav humno“ (`floorNeeded` – nejvýš 90 dní před sklizní ves bez humna i rozestavěného, která
  po sklizni nesmí mlátit), „Snopy čekají na humno“ (`waiting`) – obě i při prvním pohledu
  a přepnutí vsi (`FIRST_LOOK_NOTICES` v `newNotices`) a z jiné vsi (`VillageListItem.threshing`,
  `otherVillageNotices`) –, „Mlátí se na udusané zemi – postav humno“ (`emergency`), „Humno
  nestačí na výmlat“ (`floorShort` – výmlat po okně plodiny, jejíž celé okno humno stálo). Horní
  lišta: snopy s kg zrna (`resources/sheaves.png`, `icons.py sheaves`; do červena při `waiting`).
  Scéna výmlatu je úloha 5 plánu.
- **Obilné jámy** ([production-chains.md](../design/production-chains.md) – Obilné jámy, úloha 3;
  Martin 20. 10. 2026: „Obilné jámy by asi neměl řešit hráč, ale vesničané sami… Označit půjde
  jen otevřená jáma“; čísla `GRAIN_PITS` v `rules*.ts` – návrh Clauda podle rešerše – Obilné
  jámy): `grain-pits.ts` (zásoba a práce), `grain-pit-site.ts` (místo, převod, jáma pod stavbou).
  `VillageState.grainPits` (`GrainPit` – id z `nextId`, střed, `capacityKg` 1 500, `grainKg`,
  `state` `sealed` / `open` / `empty`, `dugDay`, `filledDay`) a `grainPitWork` (`GrainPitWork` –
  vymlácené zrno čekající na humně `queueKg`, práce vložená do další dávky, místo kopané jámy
  `site` s id). **Zásoba zůstává `storesKg`** – jídlo, osev, obchod, platby i odchod o jamách
  nevědí; zrno mimo jámy = `storesKg` − jámy (`looseGrainKg`). Odběr `drawGrainPits`: co zásoby
  ubyly víc, než bylo mimo jámy, jde z otevřené jámy, prázdná → `empty`, otevře se zapečetěná
  nejdéle (jedna otevřená); v `eat` napřed (prodej a platby dne) a po jídle `settleGrainPits`
  (ztráty jam – zapečetěná `sealedLossPerYear` 3 %, otevřená jako doma –, odběr, prázdné po
  `lifeYears` 10 let se zasypou). Jídlo dne bere ztrátu podle jam (`grainKeepInput` →
  `DietInput.grainKeepPerDay` v `villageMeal` a `dayMealInput`; bez zapečetěného zrna jako dřív
  bit po bitu); plán osevu a cílová zásoba počítají ztráty jako doma. Výmlat (`threshCrop`,
  `addSheaves` bez práce) přidá zrno do fronty (`addThreshedGrain` – jen ves s jamami). Práce dne
  `grain-pit` (`LaborTaskName`, `grainPitTask` / `workGrainPits` ve `work()`): v době plnění
  (`fillFrom`–`fillTo` srpen–listopad, `isPitFillingDay`) dávky po plných jamách, napřed do
  prázdných (jen naplnit `fillManDays` 1 čd), pak nové (+ `digManDays` 2,5 čd); neúplná (aspoň
  `minFillKg`) až po výmlatu letošní úrody (snopy, které ves vymlátí, a `springHarvestAhead` –
  jař do 31. 8.), v listopadu vždy; konec úlohy listopad – za setím ozimu, před stavbami; práce se
  střádá. Místo nové jámy `chooseGrainPitSite` / `grainPitSites` (jen server – scéna dostane
  polohy): od humna (bez humna od dvorce – `grainPitCenter`) po kružnicích do 60 m (bez místa až do
  180 m, pak null – `GrainPitWork.noSiteYear`: letos jen do prázdných jam, zrno navíc mimo jámy),
  suché (terén pěšin – ne voda, břeh, brod, mokřina, les), mimo čtverce staveb, `structureShapes`
  (ruins.ts – obydlí, pozemky, stavby, humna), milíře, pevné cesty, zemní práce vozových cest
  (`earthworkCheck` – pláň a svahy celé plánované osy přes `editedHeight`), vstup humna, překážky a ostatní jámy; bez
  krajiny řada jam kus od humna. **Stavba na jámě** (hráč zavřenou nevidí – kontrola umístění jámy
  nezná): `withoutBuiltOverGrainPits` po akci v `updateVillage` a `moveGrainFromCoveredPits`
  v simulaci (jen den, kdy přibylo id – stavby vsi berou id z `nextId` a vznikají před kontrolou;
  podmínka popsaná u kontroly v `simulateDay`) – i pod zemními pracemi vozové cesty;
  `moveGrainFromPits` přendá zrno do prázdných jam nebo domů bez ztráty, jáma zmizí. Nová ves `grainPits: []` (zásoby osadníků doma),
  ves uložená dřív `withGrainPits` v `updateVillage` (zásoby do jam bez
  práce, zapečetěné kromě poslední, ke dni `lastDay`, co se pro chybějící místo nevejde, zůstane
  mimo jámy; jednou). Rozdělení práce: činnost a cíl `grain-pit`
  (`{ kind: 'grain-pit', id, x, z }` – `DayWork.grainPits`); síť pěšin vede k otevřené jámě pro zrno
  (`PathVillage.grainPits`, `BASE_TRIPS.grainPit`, klíč `grainPitsKey` – ne v klíči chůze) a k jámě,
  kterou kopou, za prací. Web: `lib/grain-pit-view.ts` (`openGrainPits` z jádra – jámy po odběru
  i před dalším dnem) → `VillageView.grainPits` (`VillageGrainPit` – kg, kapacita, stáří)
  a `SceneVillage.grainPits` (`SceneGrainPit` – jen otevřené, plnost po 5 %); scéna
  `scene/grain-pits.ts` (`GrainPitRenderer` ve `VillageRenderer`, geometrie `grain-pit-layout.ts` –
  hrdlo s valem, zrno podle plnosti, hroudy pečeti; zástupný vzhled, model přinese úloha 5),
  výběr `{ kind: 'grain-pit', id }` (`pickVillageTarget` na zemi, kruh v `selection-highlight.ts`),
  panel `GrainPitBody` (zrno v kg, stáří, plnost; portrét `icons/build/obilna-jama.png` –
  `icons.py obilna-jama`), postavy u hrdla (`grainPitWorkers` ve `villager-plan-crafts.ts`, činnost
  „ukládá zrno do obilné jámy“), ukázka `/dev/panels?panel=jama`.
- **Výhled osetých dílů – očekávaná úroda a jestli práce stačí** (fields.md – Co hráč vidí,
  Očekávaná úroda a jestli práce stačí; návrh Clauda 2. 11. 2026; `field-outlook.ts`):
  `fieldOutlook(state, day, coverage, landscape, yearWork?)` → díl id → `PartOutlook` jen pro
  díly plodin letošního `season`, které ještě nejsou sklizené (`harvestedKg === null`) a jsou
  `sown`. Úroda dílu: `cropGrossPerHa(effectiveFertility)` × ha (`fullKg`) × podíl práce
  (`workFactor`: setí a pletí, jejichž okno skončilo – `windowDaysLeft(CROP_WINDOWS…)` je 0 –
  hotovým podílem `sownShare` / `workedShare` s `unweededYield`, jinak celé; `isWeedFree`) × ztráty
  `dayPartLosses(…, estimate = true)` – stejný výpočet jako `harvestKg` při sklizni, počasí jen co
  už je vidět, škoda zvěře `wildlife.damage.parts` jen u obilí. Rozpad do popisku: `weather`
  (`partWeatherFactor` s ochranou dílu), `wildlife`, `disasters` (zbytek ztrát – kroupy, voda,
  smršť), `work` – podíly 1 − násobek (dobrý rok záporný). Jestli práce stačí
  (`seasonShortfalls`): `cropLoadOf(planLoad(season, orchardHarvestLoad))` proti
  `sowingCapacity(…, { lord: true })` (rodina jen v červenci a srpnu) – okna `autumnWinter` (ozim, konec
  října), `spring` (jař, luštěniny, len – podzim napřed, konec dubna), `july` (sklizeň ozimu,
  luštěnin, lnu), `august` (sklizeň jaře a výmlat ozimu); orba zvlášť (`plough.autumnWinter`,
  zbytek podzimu + jaro); okno, které letos už neběží (`SOWING_CAPACITY_WINDOWS`), se nehlásí.
  `PartOutlook.short` = `WorkShortfall` (`steps`, `endMonth`, `manDays`, `ploughManDays`) jen pro
  kroky, které díl podle `partYearWork` ještě nemá hotové – všechny díly (jedna fronta, 9. 11.
  2026). Simulace výhled nepoužívá. Testy `field-outlook.test.ts` (den před žní výhled ozimu
  ≈ sklizeň do 5 %, pletí po okně, setí nad síly). Zobrazení: `web-ui.md` – Panel pole a dílu –
  očekávaná úroda.
