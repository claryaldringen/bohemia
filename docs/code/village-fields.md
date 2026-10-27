# Ves – pole, osev, zarůstání, pole ve scéně

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: fields.md v `docs/design/`.

- **Hospodářský rok** (`FarmSeason`, `types-construction.ts`; fields.md – Osevní postup po dílech,
  Úloha 2 plánu `docs/superpowers/plans/2026-10-25-sowing-rotation.md`): evidence práce od 1. 9.
  do 31. 8. – `startDay`, `crops: SeasonCrop[]` (`SeasonCrop` = `CropWork` + `crop`; pořadí
  ozim, luštěniny, len, jař; jař je vždy; za nimi ozim a jař nad potřebu se `surplus: true` –
  `surplusCrop`, `putSeasonCrop` / `dropSeasonCrop` je řadí zvlášť), `ard`, `flaxNeedKg`,
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
  Postup (`next`) převod nenastavuje – 1. 9. ho z `sownYears` dopočítá `rotateAfterSeason`
  (osévané díly s víc lety v řadě jdou do úhoru). Při chybě vrátí vstup se značkou (jako
  `withRoadsRebuilt`). Testy `rotation-migration.test.ts`: stav nové vsi převedený zpět do tvaru
  plánu (1. 9., 25. 10., 15. 3., 15. 6., 10. 8.) se převede na totéž a dopočte do 31. 8. stejně.
- **Ozim a jař – osevní postup po dílech** (fields.md – Osevní postup po dílech a setí do konce
  okna, 25. 10. 2026): ves nemá plán k 1. 9. Hospodářský rok `FarmSeason` (1. 9. – 31. 8.) nese
  práci dílů po plodinách jako `SeasonCrop`; díly osevu mají `crop?` (chybí = jař). Okna prací
  `CROP_WINDOWS` (`WINDOWS` = jař, `WINTER_WINDOWS`) v `rules*.ts`. Krok 1 `startSeason`
  (`simulate-plan.ts`, 1. 9.): `closeFieldFoodYear`, `rotateAfterSeason` všech dílů (`rotation.ts`
  – ozim i jař jako první osev → `ready` s `FieldPart.next`, jinak úhor), prázdný rok
  (`createSeason`, `ard` podle spřežení) s `flaxNeedKg`; páry k rádlům z `ploughPairsForRotation`
  (`nextPloughPairs` v `draft.ts`). Krok 2 `seasonDay` (každý den): konce oken setí – první den po setí
  ozimu jdou díly ozimu bez zasetého podílu (`unsownPartIds` – úsek setí nezačal) do jaře
  (`moveParts` v `land-taken.ts`: příprava půdy podle úseků `taskSpans`, na začátek pořadí jaře,
  `crop: 'spring'`); první den po setí jaře, luštěnin a lnu vypadnou nezasetí z práce
  (`releasePart` – `shrinkInPlan`, `dropFromWork`, `returnPart`: příloh podle
  `fallowBeforeSeason`, jinak `ready`, `next` zůstane). Napřed `fellReclaimed` – klády
  (`clearedLogs`) za díly, přes které došlo čelo vracení přílohu (`taskSpans('reclaim')`),
  a `fallowBeforeSeason.overgrowthYears` pryč (uvolněný díl se vrátí bez lesa). Ve dnech, kdy může
  začít ozim nebo jař (`sowingCropToday('first')`), `fieldSowingTargets` → `neededSelection`
  (pořadí: len, obilí do `energyFloorKg`, luštěniny, obilí do `harvestKg`; v dávce obilí ozim
  před jaří) → **čelo práce** (`workFront`, `frontRoom`, `WORK_FRONT_DAYS`): díl přibude, jen
  když rozdělaná příprava a setí v dnes otevřených oknech plodin se stejným nebo dřívějším
  koncem okna přípravy (`prepEnd`) je pod 3 dny volné práce (`freeLabor`) a orby
  (`ploughCapacityPerDay`); ostatní čekají – `seasonDay` je vrátí a `lordHelpDay` je přičte
  k zátěži (`partWork`). Přibrané díly `addToCropWork` / `putSeasonCrop` (dávka dne
  `workOrder`), `sowParts` (`next` zůstává do konce sezóny); `release` (nezačaté díly nad
  potřebu + `FIELD_STORES.trimMarginYears`, jen když nepřibírá obilí) → `releasePart`. Ves bez roku (založená během roku) ho dostane
  s prvním dílem. `startedPartIds` nebere úlohu bez práce (ozim se neplete) za začatou.
  `sowing.ts` nese už jen okna a zátěž pro pomoc rodiny (`planLoad`, `cropLoadOf`,
  `lordSowingHelp`) a `sideCropOrder`. **Cíl osevu podle stravy a zásob** (fields.md – Osev
  podle stravy, Osev podle zásob, 19. 10. 2026): `sowingTargets` ve `field-food.ts` (v plánu
  `fieldSowingTargets`) – potřeba z pole (podíl jídla z pole za uplynulý hospodářský rok –
  `VillageState.fieldFood`, součty v `eat`, uzávěrka 1. 9. `closeFieldFoodYear`; nejméně
  `FIELD_FOOD.minShare`, bez změřeného roku 1 – × roční potřeba). **Osev podle růstu vsi**
  (fields.md, Martin 19. 10. 2026): roční potřeba není dnešní, ale výhled `expectedYearlyFoodNeed`
  (`food-outlook.ts` – po měsících věk, běžná úmrtnost, porody manželských párů) – do sklizně pro
  zásoby, rok po sklizni pro úrodu, pojistku a cílovou zásobu. Maso z nouzové porážky se do
  `fieldFood` počítá jako potřeba z pole. **Plynulejší osev** (fields.md –
  Plynulejší osev, Martin 19. 10. 2026): seje se podle dlouhodobého podílu
  `FieldFoodYear.longShare` (k 1. 9. o třetinu rozdílu – `FIELD_STORES.balanceYears`; starší ves
  začne ročním `share`) – úroda rok co rok na cílovou zásobu `storesTargetKg` = pojistka (`bufferKg`
  – `bufferEnergyYears` celé potřeby) + `cushionYears` roční potřeby z pole (zásoby z pole – obilí
  a luštěniny, `fieldStoresKg`; `storesNeeded` / `storesLeft` se ztrátami), odchylku od ní (přebytek
  i schodek) vyrovná po třetinách, pod pojistkou doplní do pojistky hned; luštěniny potřeba bez
  zbytku zásoby.
  Nutné díly navíc ves uvolní (`neededSelection.release` v `seasonDay` – nouzové první, pak nejdál
  od domu, ladem jako příloh – `FieldPart.fallowBeforeSeason` – nebo zpět na řadu).
  **Díly nad potřebu** (fields.md – Osevní postup po dílech, bod 3, Martin 25. 10. 2026;
  `surplus-fields.ts`): krok `surplusFieldDay` ve `work()` z `afterBuild.left` (práce po stavbách
  a opravách) a ze zbylých dnů spřežení (`FieldTaskEntry.teamDays`) napřed dělá úlohy ozimu a jaře
  nad potřebu (`SeasonCrop.surplus` – příprava, setí, pletí, žně, odnos v pořadí jako
  `fieldTasks`), pak bere další díly na řadě s obilím (`surplusOrder` v `rotation.ts` – první
  osev, jař po ozimu, ozim po jaři; přílohy 70–95 % a nouzové ne) po jednom: nový díl plodiny
  začne, až má rozpracovaný díl hotovou přípravu půdy; plodina dne `sowingCropToday`, příloh mimo
  okno vracení nezačne. Nový díl nezačne, dokud nutné díly čekají na čelo (`seasonDay` vrací
  čekající, `work(…, neededWaiting)`). Konec října: nezasetý ozim nad potřebu → jař nad potřebu
  (`moveParts`); 1. 5. nezasetá jař nad potřebu z práce vypadne. Sklizeň do snopů jako nutné
  (`harvestSurplus` v `simulate-food.ts`, kronika součtem); výhled jídla (`daysUntilFoodHarvest`)
  počítá jen nutný ozim. Povýšení: `neededSelection` bere při rostoucí potřebě napřed díly nad
  potřebu (plodina zůstává) a `seasonDay` je přesune do nutné plodiny i s hotovou prací
  (`promoteSurplus` → `moveParts`, v téže plodině nese i setí a další práci) – na čelo nečekají.
  Čelo nutných dílů (`workFront`) díly nad potřebu nepočítá. Spřežení dílů nad potřebu jde večer
  domů jen po zorání (`settlePloughTeams` – `cropTaskRemaining`); `surplusWantsTeam` drží páry
  u rádel místo vozů. V rozdělení práce `DayWork.surplusField`; panel dílu
  `PartYearWork.surplus`. **Nouzový osev** (fields.md – Přílohová
  soustava, Martin 19. 10. 2026): když díly od 70 % nedají `SowingTargets.harvestKg`, plán vybere
  znovu i s přílohy pod 70 % (`sowingBlocks(…, EMERGENCY_GROUP)`, `isEmergencyFallow`, čistá
  úroda > 0), jen obilí, a jen od 40 % přirozené (`FERTILITY.emergencyMin` – Martin: „ves neoseje
  díly pod 40 % úrodnosti“); úrodnost dílu klesá nejvýš na nulu (pojistka). Potřebou z pole jde i `energyFloorKg`, odhad ozimu na srpen
  (`daysUntilFoodHarvest`) a dobré zásoby štěstí; ustálená úroda `steadyHarvestKg` (kalibrace,
  kalkulačka – zásoba na cílové zásobě). Kalibrace vypisuje práci na poli a volnou práci po rocích
  (průměr, variační koeficient, změna z roku na rok). Volná práce plánu (`sowingCapacity`) je po
  denním minimu dospělých (`adultDailyMin` – zvířata a domácí výroba bokem), bez cvičící
  vojvodovy rodiny. **Pomoc rodiny s potřebným osevem** (lord.md – Kdy jde rodina na pole, bod 1):
  `lordHelpDay` (`simulate-plan.ts`) každý den v oknech `SOWING_CAPACITY_WINDOWS` zapíše do
  `FarmSeason.lordHelp` podíl dne rodiny po oknech (`lordSowingHelp` ze zbývající nutné práce
  `planLoad` a `sowingCapacity` vsi od dneška bez rodiny a s ní – `{ lord: true }`, práce
  cvičících mužů po minimu dvorce – `manorLabor.freeMen`; ženy a dcery jen při hladu: chybějící
  práce ÷ práce mužů rodiny, nejvýš 1; jař napřed z jara, zbytek z podzimu); necvičící rodina
  pomoc nemá. Den: `lordHelpShare`
  (nejvyšší podíl oken dneška, okna `SOWING_CAPACITY_WINDOWS`) × `freeMen` = `manorLabor.help` →
  `allocateDay` – `lordHelp` až po práci vsi, jen na úlohy osevu (`SOWING_HELP_TASKS`: vrácení, plet, žně, výmlat,
  kopání, orba, setí; jen co ves dnes nestihne, vsi neuvolní práci na stavby ani osev navíc);
  podíl dne na poli pro `trainLordDay` = spotřeba ÷ `freeMen` (při hladu ÷ `free`, i ženy).
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
  (hned za ním) přepočte pletí jaře, luštěnin a lnu starších let (víc pletí na setí, než dá nová
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
  (měsíce `HARVEST_HANDS_MONTHS` z oken žní a výmlatu `CROP_WINDOWS` – 7–9 – a v okně zbývá žeň
  plánu nebo práce snopů) je jedno místo pravdy pro `workshopLabor` (řemeslník se syny →
  `WorkshopLabor.harvest`, `craft` 0), `manorLabor` (cvičící muži → `ManorLabor.harvest` =
  `freeMen`, `help` 0 – i ženatí synové v dvorci; vedlejší manželky vojvody mimo dvorec ne, jsou
  v `lordApartIds`, takže je nepočítá ani `harvestHelperLabor`) i `work()`; v `allocateDay` zásobníky `harvestHands` (`craftHarvestLabor`
  - výrostci od 10 let a starší po `HARVEST_HELPERS.perDay` – `harvestHelperLabor`, mimo
    `lordApartIds`) a `lordHarvest` jen na `HARVEST_HANDS_TASKS` (žeň, výmlat) za lehkou prací žen, před prací vsi,
    nevyužité propadne; spotřebu mužů vrací `lordField` (podíl dne ÷ `freeMen`). `sowingCapacity`
    přičte tytéž ruce (`craft + harvest` dílen, `freeMen`, `harvestHelperLabor` × štěstí) v oknech `july` a `august` a z výmlatu
    v podzimních oknech nechá vsi jen její díl (volná práce vsi ÷ (vsi + ruce)). Výhled jídla do sklizně (`eatDiet`) počítá s mlékem stád do sklizně
    (`milkAheadEnergy` z `milkEnergyBetween`) a celou zásobou sýra.
    Polní úlohy obou plodin řadí `fieldTasks` v `simulate-work.ts`
    (konec okna, ozim před jaří); `allocateDay` vrací i `taskAmounts` po úlohách vstupu (stejný
    název víckrát). Sklizeň ozimu 31. 7. (`harvestWinter`), jaře 31. 8. – do snopů, výmlat hned
    po žni (Snopy a výmlat níž); příděl počítá do sklizně
    podle `daysUntilFoodHarvest` (31. 7., když ozim podle odhadu uživí srpen). Plán po plodinách
    prochází `seasonCrops`, všechny díly `seasonPartIds`. **Luštěniny** (fields.md – Luštěniny, Martin 18. 10. 2026): třetí plodina `legume` (`SeasonCrop` s `crop: 'legume'`, `LEGUME_WINDOWS` – jař se sklizní
    v červenci, `LEGUMES` a `LEGUME_WORK_PER_HA` v `rules*.ts`, úroda `cropGrossPerHa` /
    `cropSeedPerHa`, `partWork(…, crop)`); cíl luštěnin `legumeTargetKg`
    (`plannedLegumeKg` – rovnovážné hospodaření, diet.md, bez zásoby – `sowingTargets`) a `energyFloorKg`
    pokrývá `neededSelection` (luštěniny od domu, loňské až nakonec – `sideCropOrder`);
    sklizeň 31. 7. do `VillageState.legumesKg` (`harvestWinter`), osev úrodnost vrátí
    (`LEGUMES.fertilityGain` v `endOfSeason`). Scéna: `SceneFieldPart.crop: 'legume'` – trsy
    hrachu `crop-pea-green` / `crop-pea-ripe` a hromádky `pea-heap` v `crops.glb`.
    **Len** (fields.md – Len, diet.md – Oděv; Martin 19. 10. 2026: „na částech pole musí být zasetý
    len“, čísla návrh Clauda podle rešerše `research/2026-10-19-flax.md`): čtvrtá plodina `flax`
    (`SeasonCrop` s `crop: 'flax'`, `FLAX_WINDOWS` = okna luštěnin, `FLAX` a `FLAX_WORK_PER_HA` v `rules*.ts` –
    potřeba 2 / 1 kg třeného lnu na dospělého / dítě, 550 kg/ha, osivo 0, neopletý 50 %, úrodnost
    −0,18 v `endOfSeason`, nemlátí se); `flax.ts` – `flaxNeedKg`, `expectedFlaxKg`, `harvestFlax`
    (31. 7. v `harvestWinter` – `VillageState.linen` = podíl oděvu vůči `FarmSeason.flaxNeedKg`
    zapsané v `startSeason`; rok bez ní – starší ves, ves založená během roku – nic nezapíše, kronika
    `linen-short`), `linenUnhappiness` (`HappinessFactors.linen`, až `FLAX.unhappiness` 4).
    Len a luštěniny bere `neededSelection` (místo jaře, len od konce – vysiluje půdu, delší příloh
    neleží domům v cestě; luštěniny od domu – `sideCropOrder`; loňská plodina až nakonec). Trhání
    v červenci napřed (`CROP_ORDER` – len první); díly nad potřebu len neubírají. Zpracování je v domácí výrobě
    (přerozdělení), žádná zásoba v liště. Web: `SceneFieldPart.crop: 'flax'` a `bloom` (červen –
    `FLAX_BLOOM_MONTH` ve `village-view-fields.ts`), scéna `FLAX_STYLES` / `FLAX_BLOOM` ve `field-crops.ts`
    (druhy trsů `flax-green` / `flax-bloom` / `flax-ripe` – kopie uzlu `crop-sprout` s vlastní
    geometrií, `CROP_NODE` ve `field-renderer.ts`; kvetoucí len napůl modré trsy), malé panáky,
    nízká koruna; panel `CROP_LABELS.flax` (ikona `resources/flax` – `icons.py flax`),
    `fieldPartName` („Zelený / Kvetoucí / Zralý len“, „Trhání lnu“), upozornění „Chybí len na oděv“,
    `/dev/buildings` pole **Len** (`FLAX_SHOWCASE_PHASES`).

- **Osevní postup po dílech** (fields.md – Osevní postup po dílech a setí do konce okna, 25. 10.
  2026; plán `2026-10-25-sowing-rotation`, Úloha 1 – **zatím nezapojené**, ves dál osévá podle
  plánu): `rotation.ts` – `nextSowing` (co je na dílu na řadě: `first`, `spring` po ozimu,
  `winter` po jaři jako prvním osevu – Martin 25. 10. 2026, `late` příloh 70–95 %, `emergency`,
  `rest`; díl v sezóně null), `sowingCropToday` (ozim, dokud po dnešku zbývá den setí ozimu, pak
  jař v oknech kopání; díl po ozimu jen jař), `rotateAfterSeason` (1. 9.: úrodnost jako `endOfSeason`, ozim / obilní jař jako první
  osev od 70 % → `ready` + `FieldPart.next`, jinak úhor bez bonusu) a `neededSelection` (k práci
  plánu přibírá díly na řadě v pořadí `sowingBlocks` – len od konce, luštěniny od domu, napřed
  díly po ozimu (`sideCropOrder` v `sowing.ts`), obilí do `harvestKg`, nouzové přílohy až za
  ostatními; nezačaté obilí nad toleranci `FIELD_STORES.trimMarginYears` vrátí v `release`).
  `sowingGroup` dává připravenému dílu s `next` skupinu 1. Sem se přesunuly i `sowParts`
  a `reclaimedLogs`.
  **Panel – Příště a Na řadě** (fields.md – Osevní postup po dílech, bod 6; Úloha 7):
  Obnova přílohu `FERTILITY.fallowRecovery` = 0,05 ročně (26. 10. 2026, dřív 0,025): odpočatý díl
  95 → 83 → 71 % a 5 let úhoru, `field-capacity.ts` (`rotationYears`, `ROTATION_FACTOR` 7 / 2,
  `averageSownShare` 0,89) počítá oběh odpočatého dílu (začíná na `fallowReady`), ne čerstvého.
  `part-rotation.ts` – `partRotation(state, day, yearWork?)` → díl id → `PartRotation`: `next`
  (`NextCrop` – plodina nebo `'fallow'`; nezasetý díl letošní práce svou plodinu, zasetý postup na
  kopii dílu přes `rotateAfterSeason` k dalšímu 1. 9., díl na řadě ozim / jař podle
  `sowingCropToday` den po dni dopředu), `rest` (úhor: `fertilityShare / FERTILITY.fallowReady`
  na setiny a roky do osevu po `fallowRecovery`), `round` (kolikátý osev oběhu), `onTurn` (na
  řadě mimo letošní práci), `surplus` (díl letošní práce nad potřebu). Zakládaný díl chybí. Jen
  čte stav. `fieldPartLooks`: připravený díl s `next` (po prvním osevu) je strniště, dokud na něj
  nepřijde podzimní práce.

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
  jinak, bez klády; klády dospělých na hromadu u lesa (`addStackLogs`). Dohoření (`foundPart`):
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
  čtverce – příznak `threshing`), jiné vsi (`NeighbourSnapshot.threshingFloors`), zbytky jam,
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
- **Snopy a výmlat hned po žni** ([production-chains.md](../design/production-chains.md) –
  Humno, úloha 2; fields.md – Výmlat hned po žni; Martin 20. 10. 2026: „Humno je podmínka“,
  „Klasy neskladovali.“, „Rok odkladu“; čísla `THRESHING` v `rules*.ts` – návrh Clauda podle
  rešerše – Výmlat na humně): `threshing.ts`. Sklizeň jde do snopů `VillageState.sheaves`
  (`Sheaves` – kg zrna obilí a luštěnin a zbývající práce výmlatu po plodinách `work` – sklizená
  část práce `thresh` plánu; `addSheaves` v `harvestWinter` / `harvest`), ne do `storesKg`.
  Okna `thresh`: ozim a luštěniny srpen, jař září (`WINTER_WINDOWS`, `LEGUME_WINDOWS`,
  `WINDOWS`); `threshTasks` (úlohy dne v `work()` – za polními úlohami téhož konce okna, žeň má
  přednost – `THRESH_RANK`; po konci okna se mlátí dál – září–únor s koncem v dnešním měsíci,
  březen–srpen `THRESH_OVERDUE_END` po všech pracích; **výmlat na dnešní jídlo** napřed –
  `threshForFoodKg`: chybí-li zrno na 2 dny jídla, úloha `urgent` s `THRESH_URGENT_END` před
  žní) a `threshCrop` převede snopy do zásob podílem postupu na práci druhu (obilí ozimu a jaře
  spolu). Úroda bez práce výmlatu jde rovnou do zásob (`addSheaves`). Výmlat v okně je dřina
  (`threshSeasonTasks` v `isToilDay`). Mlátí se jen
  s hotovým humnem (`threshingCapacity` – `floorManDaysPerDay` 12 čd na humno, humna se sčítají),
  nebo bez humna **vždy nouzově** na udusané zemi (Martin 21. 10. 2026: „Ať mlátí aspoň
  nouzově“) – bez omezení místa, o 30 % víc práce a 10 % zrna méně (`ThreshingCapacity.emergency`
  = bez hotového humna, nebo v odkladu `threshingGraceUntil` / `inThreshingGrace` – ten zůstal
  jen v datech: humno v odkladu mlátí plným tempem, zbytek nouzově). Upozornění: jen
  `ThreshingStatus.emergency` („Mlátí se na udusané zemi – postav humno“, info); „Před žněmi
  postav humno“ a „Snopy čekají na humno“ zmizely. Snopy, které dnes nikdo v okně nemlátí, se kazí 10 % za měsíc i s prací výmlatu
  (`spoilSheaves` na začátku dne). Nová ves (`foundVillage`) má prázdné snopy bez odkladu; ves uložená dřív
  dostane `withThreshingGrace` (v `updateVillage` od dneška, v `advanceVillageSteps` od dne po
  dopočtu) – prázdné snopy a rok odkladu, úroda už v zásobách zůstane. `threshingSeason` se
  zahodí 1. 10. (`THRESH_END_DAY`, bez ztráty – dřívější „nevymlácené 1. 3. propadne“ zmizelo).
  Výhled jídla (`DietInput.sheavesGrainKg` / `sheavesLegumesKg` – `sheavesOutlook`, jen když ves
  smí mlátit, se ztrátami `sheafYield` – nouzově −10 % podílu mimo humna, pomalé humno o snopy
  zkažené za oknem), plán osevu (`sowingTargets`, `fieldStoresKg(state, day)`) a dobré zásoby
  štěstí počítají snopy jako zrno; jí se jen vymlácené. Hlad a příděl (`eat` – `state.ration`)
  jdou podle menšího z výhledu a snědené energie. Odchod do nové vsi dělí snopy jako zásoby
  (`leavingFood`, `takeSheaves`). Plán osevu odečte
  čekající výmlat (`pendingThreshLabor` – na humnech nejvýš kapacita za dny okna) z podzimní
  kapacity (`sowingCapacity`) a výmlat ozimu a luštěnin přičte k srpnu (`CropLoad.august` ve
  `sowing.ts`). Rozdělení práce: výmlat na hotová humna rovným dílem (cíl `threshing-floor`),
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
  (`earthworkCheck` – pláň a svahy celé plánované osy přes `editedHeight`), vstup humna, půdu
  jiných vsí (`onForeignGround` z placement.ts – `state.neighbours`), překážky a ostatní jámy; bez
  krajiny řada jam kus od humna. **Stavba na jámě** (hráč zavřenou nevidí – kontrola umístění jámy
  nezná): `withoutBuiltOverGrainPits` po akci v `updateVillage` a `moveGrainFromCoveredPits`
  v simulaci (jen den, kdy přibylo id – stavby vsi berou id z `nextId` a vznikají před kontrolou;
  podmínka popsaná u kontroly v `simulateDay`) – i pod zemními pracemi vozové cesty;
  `moveGrainFromPits` přendá zrno do prázdných jam nebo domů bez ztráty, jáma zmizí. Stavba jiné
  vsi jámu neodstraní (jámy se kopou jen na vlastní půdě). Nová ves `grainPits: []` (zásoby osadníků doma),
  ves uložená dřív `withGrainPits` v `updateVillage` (s přehledem jiných vsí; zásoby do jam bez
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
