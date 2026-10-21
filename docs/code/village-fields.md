# Ves – pole, osev, zarůstání, pole ve scéně

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: fields.md v `docs/design/`.

- **Ozim a jař** (fields.md – Ozim a jař): roční plán (`YearPlan`) nese práci jaře nahoře (tvar
  plánu z doby před ozimem) a ozimu v `winter?` (`CropWork`); díly osevu mají `crop?` (chybí =
  jař). Okna prací po plodinách `CROP_WINDOWS` (`WINDOWS` = jař, `WINTER_WINDOWS`) v `rules.ts`.
  K 1. 9. rozhodne `chooseCrops` (`sowing.ts`): díly v pořadí `sowingOrder`, každý do ozimu, když
  ho podzim (září–říjen po sklizni jablek) stihne a červenec sklidí, jinak do jaře, když se
  vejde do zbytku podzimu, jara a srpna – volná práce `windowDaysLeft` × práce po denním minimu.
  Díly hotové po plánu jdou jen do jaře. **Cíl osevu podle stravy a zásob** (fields.md – Osev
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
  Rozjetý plán zkrátí `trimPlan` (každý den 1. 9. – 30. 4., `plan-trim.ts`: nezačaté díly obilí
  od konce pořadí – nouzové první – přes `shrinkInPlan` / `dropFromWork` z `land-taken.ts`, ladem
  jako příloh – `FieldPart.fallowBeforePlan` – a na začátek osevu navíc).
  **Osev navíc** (fields.md – Osev navíc, Martin 19. 10. 2026; `extra-sowing.ts`): ostatní díly od
  70 % v pořadí výběru čekají v `YearPlan.extra` (`ExtraPart` – `sownYears` u dílu, který se
  osíval; plán k 1. 9., hotové díly `joinFinishedParts`, ubrané `trimPlanToTarget`); krok
  `extraSowingDay` ve `work()` z `afterBuild.left` (práce po stavbách a opravách) a ze zbylé
  kapacity spřežení (`FieldTaskEntry.teamDays`) začne díly navíc – ozim do 30. 10., pak jař
  (`extraSowingCrop`), jen obilí – a přidá je k práci plodiny (`addToCropWork`); jejich příprava
  půdy čeká v `CropWork.extraLeft` (potřebné úlohy berou `neededTaskRemaining`), setí až výmlat
  jsou potřebné. Od 1. 5. se `extra` smaže. Volná práce v liště (`allocation.common`) je před
  polem navíc; v rozdělení práce `DayWork.extraField`. **Nouzový osev** (fields.md – Přílohová
  soustava, Martin 19. 10. 2026): když díly od 70 % nedají `SowingTargets.harvestKg`, plán vybere
  znovu i s přílohy pod 70 % (`sowingBlocks(…, EMERGENCY_GROUP)`, `isEmergencyFallow`, čistá
  úroda > 0), jen obilí, a jen od 40 % přirozené (`FERTILITY.emergencyMin` – Martin: „ves neoseje
  díly pod 40 % úrodnosti“); úrodnost dílu klesá nejvýš na nulu (pojistka). Potřebou z pole jde i `energyFloorKg`, odhad ozimu na srpen
  (`daysUntilFoodHarvest`) a dobré zásoby štěstí; ustálená úroda `steadyHarvestKg` (kalibrace,
  kalkulačka – zásoba na cílové zásobě). Kalibrace vypisuje práci na poli a volnou práci po rocích
  (průměr, variační koeficient, změna z roku na rok). Volná práce plánu (`sowingCapacity`) je po
  denním minimu dospělých (`adultDailyMin` – zvířata a domácí výroba bokem). Výhled jídla do sklizně (`eatDiet`) počítá s mlékem stád do sklizně
  (`milkAheadEnergy` z `milkEnergyBetween`) a celou zásobou sýra.
  Polní úlohy obou plodin řadí `fieldTasks` v `simulate.ts`
  (konec okna, ozim před jaří); `allocateDay` vrací i `taskAmounts` po úlohách vstupu (stejný
  název víckrát). Sklizeň ozimu 31. 7. (`harvestWinter`), jaře 31. 8.; příděl počítá do sklizně
  podle `daysUntilFoodHarvest` (31. 7., když ozim podle odhadu uživí srpen). Plán po plodinách
  prochází `planCrops`, všechny díly `planPartIds`. **Luštěniny** (fields.md – Luštěniny, Martin 18. 10. 2026): třetí plodina `legume` (`YearPlan.legume?`, `LEGUME_WINDOWS` – jař se sklizní
  v červenci, `LEGUMES` a `LEGUME_WORK_PER_HA` v `rules.ts`, úroda `cropGrossPerHa` /
  `cropSeedPerHa`, `partWork(…, crop)`); `chooseCrops` dostane `legumeTargetKg`
  (`plannedLegumeKg` – rovnovážné hospodaření, diet.md, bez zásoby – `sowingTargets`) a `energyFloorKg` – obilí napřed na celý cíl, pak luštěniny na
  díly výběru od domu (loňské luštěniny až nakonec) a obilí doplní energii (`chooseLegumes`);
  sklizeň 31. 7. do `VillageState.legumesKg` (`harvestWinter`), osev úrodnost vrátí
  (`LEGUMES.fertilityGain` v `endOfSeason`). Scéna: `SceneFieldPart.crop: 'legume'` – trsy
  hrachu `crop-pea-green` / `crop-pea-ripe` a hromádky `pea-heap` v `crops.glb`.
  **Len** (fields.md – Len, diet.md – Oděv; Martin 19. 10. 2026: „na částech pole musí být zasetý
  len“, čísla návrh Clauda podle rešerše `research/2026-10-19-flax.md`): čtvrtá plodina `flax`
  (`YearPlan.flax?`, `FLAX_WINDOWS` = okna luštěnin, `FLAX` a `FLAX_WORK_PER_HA` v `rules.ts` –
  potřeba 2 / 1 kg třeného lnu na dospělého / dítě, 550 kg/ha, osivo 0, neopletý 50 %, úrodnost
  −0,18 v `endOfSeason`, nemlátí se); `flax.ts` – `flaxNeedKg`, `expectedFlaxKg`, `harvestFlax`
  (31. 7. v `harvestWinter` – `VillageState.linen` = podíl oděvu vůči `YearPlan.flaxNeedKg`
  zapsané v `planYear`; plán bez ní – starší ves, ves založená během roku – nic nezapíše, kronika
  `linen-short`), `linenUnhappiness` (`HappinessFactors.linen`, až `FLAX.unhappiness` 4).
  `chooseCrops` dostane `flaxTargetKg` – `chooseFlax`: napřed `chooseSideCrop` (před luštěninami)
  na díly výběru obilí **od konce** (vysiluje půdu, delší příloh neleží domům v cestě; loňský len
  až nakonec; když se práce nevejde, zkusí další díl – `fitsSideCrop`), obilí doplní energii, a
  když nejde, len ubere obilí nejvýš o svůj díl – i se zásobami pod pojistkou. **Len napřed**
  (fields.md, Martin 20. 10. 2026 – „občas mi to píše chybí len na oděv“): když to potřebu
  nepokryje (ves bez volné práce – červenec plný ozimu, obilí doplněné za díl lnu práci hned zabere),
  `flaxFirst` vyhradí díly a práci lnu před obilím (výběr `base` před `chooseGrain`; díl, který se
  nevejde, přeskočí – bližší či menší) a obilí vybere po něm; bere se, co dá víc lnu – ves, které
  len za obilím vycházel, má plán beze změny (zlatý otisk ve `flax.test.ts`). Trhání v červenci
  napřed (`CROP_ORDER` – len první); `trimPlan` ani osev navíc len neubírají. Zpracování je v domácí výrobě
  (přerozdělení), žádná zásoba v liště. Web: `SceneFieldPart.crop: 'flax'` a `bloom` (červen –
  `FLAX_BLOOM_MONTH` ve `village-view.ts`), scéna `FLAX_STYLES` / `FLAX_BLOOM` ve `field-crops.ts`
  (druhy trsů `flax-green` / `flax-bloom` / `flax-ripe` – kopie uzlu `crop-sprout` s vlastní
  geometrií, `CROP_NODE` ve `field-renderer.ts`; kvetoucí len napůl modré trsy), malé panáky,
  nízká koruna; panel `CROP_LABELS.flax` (ikona `resources/flax` – `icons.py flax`),
  `fieldPartName` („Zelený / Kvetoucí / Zralý len“, „Trhání lnu“), upozornění „Chybí len na oděv“,
  `/dev/buildings` pole **Len** (`FLAX_SHOWCASE_PHASES`).

- **Postup práce po čtvercích** (Martin – fields.md): kopání, setí a sklizeň mění díl, až k němu
  dojde práce. `field-progress.ts` (jen čte): díly plodiny v pořadí `CropWork.partIds` (dávka
  po úsecích hospodářství od domu ven – řadí `createCropWork` s `workOrder`, ves bez hospodářství
  nejblíž obydlím první, při shodě id), váha = plocha × vzdálenost;
  `fieldPartLooks` → vzhled dílu `{ look, work?, before? }` (bare, plowed, sown, sprouted, green,
  ripe, harvesting, stubble, young-fallow, pasture; vzejití a zrání podle kalendáře; starší
  příloh bez vzhledu – doplní scéna), `fieldFrontiers` (čelo práce úloh dne), `partsWorked`
  (díly, přes které dnes práce postoupila). Rozdělení práce dne (`labor-report.ts`) dostává
  `fieldWork` (před a po po plodinách) a cílí polní práce na `{ kind: 'field', id, parts }`.
  Ve scéně (`village-view.ts`) je díl `SceneFieldPart` (`id`, `look`, `work`, `before` –
  `FieldLook`) a podíl práce `SceneLaborShare` s `parts`; postavy (`villager-plan.ts`) pracují na
  `parts`. Simulace se tím nemění.

- **Hospodaření podle polohy domů** (Martin – fields.md): `holdings.ts` – díl patří k nejbližšímu
  domu (vzdušnou čarou; `villageHoldings`/`fieldHoldings`), hospodářství se dělí na úseky od domu
  (prstence po 15 m, v každém tolik dílů po směru, kolik čtverců má první prstenec – výseče kolem
  samoty, lány za domy v řadě). Nic se neukládá, vše se odvodí z polohy domů a čtverců. Plán osevu
  bere `sowingBlocks` (bloky úseku ve skupině přílohové soustavy od domu ven, osev mezi
  hospodářstvími podle plochy) a `chooseCrops` dává blok celý do ozimu, nebo do jaře; pořadí práce
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
  (`RECLAIM_COST_PER_HA` – louka, křoviny, les) a mladý les dá klády (`reclaimedLogs`). Díl v lese
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
  `field-progress.ts` – plodina, příprava půdy `reclaim` / `plough` / `dig`, setí, sklizeň, seč;
  rok osevu, roky ladem, zakládání), `VillageOrchard.cells` (`VillageOrchardSquare` – stáří,
  `squareExpectedYieldKg`, výsadba, obnova, cesta); co je vidět (vzhled, stadium, zarůstání,
  pastva) bere `selectionDetails` ze scény (`selectedFieldPart`, `selectedOrchardSquare`).
  Panel: `FieldPartBody` / `OrchardSquareBody`, název pod portrétem `fieldPartName` /
  `orchardSquareName`, dům hospodářství je tlačítko (`onSelectTarget` ho vybere); ikony
  `resources/harvest` (srp s klasy) a `resources/walk` (šlépěje – cesta z domu). Při malování
  po čtvercích vybraný díl dá mřížku svého pole (`wholeTarget` ve `startBuild`).
  `/dev/landscape` vybírá jako hra (čísla panelu odhaduje `app/dev/landscape/dev-selection.ts`),
  `/dev/panels?panel=pole-dil` (`pole-dil-priloh`, `pole-dil-zaklada`, `sad-ctverec`).

- **Pole ve scéně** (fields.md – Co hráč vidí; podle 0 A.D.): vzhled dílu `FieldLook`
  (`village-view.ts`: `bare`, `plowed`, `sown`, `sprouted`, `green`, `ripe`, `harvesting`,
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
