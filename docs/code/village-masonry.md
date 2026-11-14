# Ves – kamenné zdivo, stavební huť a kostely

Mapa kódu – podrobnosti k mechanikám. Pravidla a rozhodnutí: stone-masonry.md, churches.md v `docs/design/`, plán `docs/superpowers/plans/2026-11-11-masonry-churches.md`.

## Stavební huť

- **Stav:** `VillageState.lodge` (okruh, den pozvání, `arriving` – mistři a kněží na cestě,
  počítadla odchodu), `VillageState.churches`; mistři a kněz jsou osoby vsi (`Person.mason`,
  `Person.priest`, `Person.masonryXp`). Starší vsi je nemají, převod netřeba.
- **Pozvání** (`domain/village/people/lodge.ts`): `canInviteLodge` (pokřtěný rod, ves s vojvodou,
  huť ještě není), `inviteLodge` (pět mistrů s příchodem za `LODGE.arrivalDays`), `canInviteMaster`
  a `inviteMaster` (chybějící obor stejného okruhu).
- **Příchod:** `lodgeArrivalsDay` je krok dne v `core/simulate.ts` těsně před `occupyEmptyDwellings`;
  losy ze seedu vsi, oboru a dne příchodu. `arriveFromAbroad` (čistá, pro mistra i kněze) vytvoří
  svobodného křesťana ve věku `LODGE.masterAge`, jméno z `MASTER_NAMES` podle okruhu, `origin` podle
  `MASTER_ORIGIN`. Bydlení: volné obydlí bez dílny, jinak host ve dvorci vojvody se záznamem
  `VillageState.displaced` (nové obydlí osídlí přednostně – `rehouseDisplaced`). Kronika `newcomer`.
- **Práce:** `isLodgeIdle` (mistr, kněz) – `villagersToday` (`core/morning-water.ts`) je z práce vsi
  vynechává; jedí jako ostatní (`marriagesAndMealDay` bere všechny osoby).
- **Use-casy:** `application/invite-lodge.ts` (`inviteLodgeForVillage`, `inviteMasterForVillage`,
  texty `INVITE_LODGE_REASONS`); právo `ennoble` v `ACTION_RIGHTS`. Web: `inviteLodgeForPlayer`,
  `inviteMasterForPlayer` v `apps/web/lib/village.ts`, server actions `inviteLodge`, `inviteMaster`.

## Odchod a noví mistři

Soubor `domain/village/people/lodge-life.ts`; návrh `docs/design/stone-masonry.md` – Svoboda,
rodina a odchod, Zkušenost a noví mistři. Vše jen u vsi s `lodge`, ves bez huti krok přeskočí bez
losu (zlatý otisk).

- **Krok dne:** `lodgeLifeDay(state, foodCoverage, day)` volá `peopleDay` (`core/simulate.ts`) na konci dne
  po jídle, úmrtích a štěstí (ves, která vymřela, ho nedostane); zavolá `lodgeLeavingDay` a pak
  `promoteMasters`.
- **Odchod:** `lodgeLeavingDay` vede `lodge.hungryDays` (pokrytí potřeby jídla – energie bez kvality stravy – pod `LODGE.leaving.foodBelow`)
  a `lodge.unhappyDays` (štěstí vsi pod `happinessBelow`); po dosažení `hungryDays` / `unhappyDays`
  padne los na každého mistra (`createRandom(deriveSeed(seed, 'lodge-leave:<id>:<den>'))`, v pořadí
  id), bez manželky a dětí ve vsi odchází vždy, jinak s `familyChance`. Počítadla se po losu
  vynulují, i když mistr zůstal. Odchází `masterHousehold` (mistr, manželka, jejich svobodné děti
  v jeho obydlí) přes `removePeople` s emigranty (směr `MASTER_ORIGIN`) a zápis `master-left`.
- **Noví mistři:** `promoteMasters` – za obor bez živého mistra i bez mistra na cestě dostane
  `mason` dospělý (≥ `AGE.fertile`) bez `mason` a `priest` s nejvyšším `masonryXp[obor]` ≥
  `LODGE.masterXpManDays`, při shodě nižší id; zápis `master-promoted`. Nikdo vhodný → obor zůstane
  prázdný a `canInviteMaster` dá `ok`.
- **Učni:** `masonApprentices(state, master, day = state.lastDay)` – synové (`fatherId`) v obydlí
  mistra od `LODGE.apprenticeFromAge`; zkušenost jim přičítá práce huti (úloha M3).
- **Sňatky:** mistr je obyčejný svobodný muž (`isSingle`), žení se jako ostatní.
- **Kronika:** `master-left` / `master-promoted` (`types-chronicle.ts`), text
  v `apps/web/lib/village-view-chronicle.ts`.

## Geometrie a cena kostela

Typy: `types/types-masonry.ts` (`ChurchType`, `ChurchDims`, `ChurchCost`, `ChurchWork`), čísla:
`rules/rules-masonry.ts` (`CHURCH`, `LIME`, `MORTAR`, `CHURCH_WORK_CRAFT`) a `STONE` z
`rules/rules-stone.ts`. Vše počítá čistá doména v `buildings/church-geometry.ts` (testy
`buildings/__tests__/church-geometry.test.ts`); ze stejných funkcí čerpá cena, umístění i scéna.

- **Místní souřadnice** (churches.md – Velikost a cena): x = osa vstup → kněžiště, z = napříč,
  střed hlavní lodi v 0,0; míry částí jsou vnitřní, zdi jsou vně. `churchParts(type, dims)` vrací
  `ChurchPart[]` (`nave`, `aisle`, `chancel`, `apse`, `atrium`; tvar `rect` / `circle` / `half`,
  výška, střecha `gable` / `cone` / `halfCone` / `lean` / `none`): rotunda 3 části (kruhová loď +
  dvě půlkruhové apsidy na ose), `apse` loď + půlkruhová apsida, `chancel` loď + obdélné kněžiště,
  `basilica` 5 částí (střední loď, dvě boční, apsida, atrium na západě bez střechy).
- **Typy a rozměry:** `churchTypesFor(circle)` (malý, velký), `defaultChurchDims(type)` (rotunda
  Ø 6,5 × 6, jednolodní 5 × 8 × 7, bazilika 8 × 20 × 10), `clampChurchDims` (`CHURCH.limits`,
  0,5 m, druh `round` jen u rotundy), `wallThickness(výška)`.
- **Cena** `churchCost(type, dims)`: objem zdiva = délka zdi po ose zdi (vnitřní míra + tloušťka;
  stěna sdílená s lodí patří lodi, bez otvorů) × výška × tloušťka + základy (`foundationDepthM`);
  vápno, písek, vápenec z `MORTAR` a `LIME`; dřevo = střecha × `roofWoodKgPerM2` + vápno ×
  `woodKgPerLimeT`; práce po druzích `work` (základy = výkop + zdění, lámání = kámen + vápenec bez
  vzdálenosti, pálení vápna + pec, písek, zdění + opracování, střecha 45°, výzdoba = vnitřní plocha
  zdí bez atria). Kalibrace: rotunda Ø 6,5 × 6 ≈ 162 m³, 10,5 t vápna, ≈ 1 185 čd.
- **Kapacita** `churchCapacity` = plocha lodí (hlavní i boční) ÷ `m2PerPerson`, dolů (rotunda 44).
- **Hřbitůvek:** `churchyardRect` (obdélník o `churchyardBeltM` kolem vnějšího obrysu, `offsetX`
  = střed v ose x), `churchyardGraves` = (plocha obdélníku − půdorys) ÷ `graveM2`.
- **Obrys ve světě:** `churchFootprintWorld(type, dims, position)` – vnější obrysy částí (kruh
  24úhelník, půlkruh 12 úseků), otočené o `position.rotation` (x = ose vstup → kněžiště) a
  posunuté; jen `detSin` / `detCos` z `landscape/det-math.ts`. Převod bodu je jediná funkce
  `churchLocalToWorld` – konvence budov (`rectangleSamples`, `buildingLocalToWorld`, Babylon
  `rotation.y`): místní +x míří do (cos r, −sin r); používají ji i `churchLocalRect`
  (`church-plot.ts`), vzorky terénu v `placement-church.ts` a pec a písník v `startChurch`.
  Krok rozměrů `CHURCH_DIMS_STEP_M` (0,5 m – `clampChurchDims` i tlačítka +/−).

## Stavba kostela

Doména `buildings/church-build.ts` (testy `buildings/__tests__/church-build.test.ts`), umístění
`placement/placement-church.ts` a `placement/church-plot.ts`, use-case `application/place-church.ts`.

- **Stav:** `ConstructionKind` `'church'`, `Construction.church` (`ChurchSite` v
  `types/types-masonry.ts`): typ, rozměry, `done` po druzích `ChurchWork`, vypálené vápno `limeT`,
  pec (`kilnDone`, dávka `burnT` do `burnUntilDay`), poloha pece (`kiln`, západní roh pásu
  hřbitůvku) a písníku (`sandPit` – `nearestWater`), lom `quarryId` a jeho vzdušná vzdálenost
  `quarryDistanceM` z `nearestQuarry` (lámání = m³ × `quarryManDaysPerM3` – lámání a nošení
  v nůších, village-fortifications.md – Nošení kamene a vůz), kámen z hromad `stoneFromPileM3`, příprava
  `prepManDays` (kácení dřeva stavby + překážky). Dodaný kámen, vápenec a písek se odvodí z hotové
  práce (`churchMaterials`), postup částí 0–1 `churchProgress` (základy, zdi, střecha, výzdoba)
  a po druzích práce `churchWorkProgress` (panel staveniště).
- **Křest jen u hráče:** `playerChurchStartProblem` (`CHURCH_NOT_BAPTIZED` + `churchStartProblem`) hlídá
  akce `placeChurchForVillage` a tlačítka `churchBuildChoices`; NPC správce a simulace stavby křest
  nevyžadují (Martin 14. 11. 2026: ikonu nemá vidět hráč před přijetím křesťanství).
- **Zahájení:** `applyBuildIntent` s `ChurchIntent` → `churchStartProblem` (`CHURCH_NO_LODGE` bez
  stavbyvedoucího, `CHURCH_WRONG_TYPE` mimo `churchTypesFor`, `CHURCH_NO_QUARRY` bez lomu) →
  `checkChurchPlacement` → `startChurch`. Bez ceny předem; dřevo `woodKg` ÷ `CHURCH.woodKgPerLog`
  klád (`planWoodFrom`; chybějící stromy stavbu nezastaví), kámen z hromad (`takeStone`), natočení
  `snapChurchRotation` (krok `ROTATION_STEP`), výchozí `CHURCH_EAST_ROTATION` = 0 (osa vstup →
  kněžiště = místní +x, východ = světové +x jako `DIRECTION_VECTORS`).
- **Umístění:** `checkChurchPlacement` – terén pod kostelem (`checkFootprintTerrain` „Kostel“),
  obdélník hřbitůvku `churchyardWorld` volný (`checkFootprintFree`, pole smí – `takenLand`, díly se
  zmenší přes `giveWayToBuilding` s `LandTaker` `'church'`), výchoz a posvátná místa jako u humna,
  les a překážky v obdélníku do `obstacleCost`. Kostely i staveniště jsou v `PlacementVillage.churches`
  (`placementVillageOf`) – stavby přes ně „Překrývá se s kostelem.“, čtverce polí, sadů a hřbitovů
  `SquareProblems.church`.
- **Práce dne:** kostel bere ze společné práce jako ostatní stavby (`build` – `constructionNeed`
  → `churchNeedToday`, `invest` → `churchWorkDay`). Uvnitř napřed příprava (kácení – `fellAsWorked`,
  překážky), pak `allocate` v pořadí: lámání (kameník), písek (stavbyvedoucí), pec a nakládání další
  dávky vápna (vápeník; jen v `CHURCH.season` a z vylámaného vápence), základy a zdi (zedník, jen
  v sezóně; podíl zdiva nejvýš nejmenší podíl dodaného kamene, vápna a písku), střecha po zdech
  (stavbyvedoucí), výzdoba po střeše (štukatér). Bez stavbyvedoucího nic (`churchNeedToday` 0).
  Potřeba dne = `allocate` s neomezenou prací bez zápisu – rozdělení i potřeba počítají totéž.
  S vozem s kamenem (`StoneCart` z `planCartJobs` → `churchNeedToday` / `churchWorkDay` s `cart`)
  stojí lámání méně práce (`stoneCartLabor`, `stoneCartProgress`) – lámání postoupí o `bonus` víc
  a `c.done` roste o postup; `ChurchWorkResult.stone` = lámání dne (`StoneDay`).
  `churchQuarryLeft` – zbytek lámání (plán vozu). **Převod** `church-quarry-carry`
  (`withChurchQuarryDistance`, konec `VILLAGE_MIGRATIONS`): staveniště se starým
  `quarryManDaysPerM3` dostane `quarryDistanceM` (lom `quarryId`, jinak nejbližší) a lámání se
  přecení – podíl hotového lámání (dodaný kámen) zůstane, `done.quarry`, `c.done` i `c.cost` se
  posunou o rozdíl.
  `churchMorning` (ráno v `buildDay`, `core/simulate-work-apply.ts`) přičte vypálenou dávku a naloženou dávku v sezóně dá do volné pece –
  pálení doběhne i v zimě a v den bez práce. `churchBlocked` – obor, jehož mistr chybí (panel).
- **Rozdělení práce dne pro scénu:** `build` si u kostela zapamatuje ranní `done`
  (`ConstructionWork.churchDoneBefore`, `core/simulate-build.ts`), `constructionShares`
  (`core/labor-report.ts`) dá podílu `build` u staveniště `LaborShare.churchWork` – druhy práce,
  na které dnes došlo (`churchWorksToday`, pořadí `CHURCH_WORK_CRAFT`), bez lámání: to je
  samostatný podíl `quarry` u lomu (`LaborTarget` `{ kind: 'quarry', id: quarryId }`, s `construction`
  = id kostela) a jízda vozu s kamenem `haul` s `job: 'stone'` (`quarryShares` z
  `ConstructionWork.quarry`). Simulace ho nečte; scéna podle něj staví mistry k jejich práci
  (kameník v lomu podle podílu `quarry` kostela – `churchToday` ve `villager-plan-masons.ts`;
  postavy u lomu a vůz s kamenem zatím ne). Lom pro kameníka nese `SceneChurchSite.quarryId`.
- **Zkušenost:** `buildDay` si před stavbami zapamatuje `done` kostelů (`churchSitesBefore`),
  po nich `churchCraftWork` (čd po oborech `CHURCH_WORK_CRAFT`) → `gainMasonryXp(state, byCraft,
day, villagers)`: učni (synové mistra od `LODGE.apprenticeFromAge` v jeho domácnosti) 1 čd, pak
  po 1 čd dospělým z `villagersToday` (ne mistři, kněz, elita) od nejzkušenějších v oboru.
- **Dokončení:** `finishConstructions` – po střeše `finishChurchRoof` přidá `Church` do
  `VillageState.churches` (id = id stavby, `finishedDay`) a kroniku `construction-finished`;
  staveniště končí (`isChurchFinished`) po výzdobě (`finishChurch` – `decoratedDay`), nebo hned bez
  štukatéra. Zrušení vrátí nezazděný kámen (`returnChurchStone`). Ves bez kostela nic z toho
  nespouští (zlatý otisk beze změny).
- **Web:** `placeChurchForPlayer` (`apps/web/lib/village.ts`, právo `placeChurch` = `build`),
  server action `placeChurch`, vstup `parsePlaceChurchInput` / `parseChurchDims`
  (`lib/village-input.ts`). Kalibrace testu: rotunda Ø 6,5 × 6 v zakládající vsi s hutí a lomem
  300 m (≈ 1 690 čd i s přípravou – lámání s nošením v nůších) má střechu za 788 dní a výzdobu
  za 798 dní; s ohradou se spřežením a dvoukolákem uveze vůz ≈ 128 m³ kamene a vápence, práce
  ≈ 1 530 čd, střecha za 621 dní, výzdoba za 650 dní.

## NPC rod – huť, lom a kostel

Soubor `domain/village/steward/npc-masonry.ts` (testy `steward/__tests__/npc-masonry.test.ts`);
návrh churches.md – NPC rod staví kostel, stone-masonry.md – Stavební huť (NPC rod).

- **Krok dne:** `npcMasonryDay(state, day, landscape, obstacles)` – v `simulateDay` (`core/simulate.ts`)
  hned za `stewardDay`; jen ves s `VillageState.nobles`, s lidmi, s krajinou i vrstvou překážek
  a v den správce (`STEWARD.everyDays`), na zapnutém správci nezávisí. Ves bez `nobles` krok přeskočí
  bez losu (zlatý otisk beze změny). Pořadí: huť, lom, kostel.
- **Huť:** bez `lodge` při `LODGE.npcMinPeople` lidech a `canInviteLodge` `ok` → `inviteLodge` s okruhem
  `createRandom(deriveSeed(seed, 'npc-lodge'))` (pod 0,5 adriatický); s hutí `inviteMaster` za každý
  obor, kde `canInviteMaster` dá `ok`.
- **Lom:** s `lodge`, bez lomu i bez staveniště lomu → záměr `quarry` na výchozu `quarryNear`
  (`fortification/state/stone.ts`) od středu vsi `planCentre`, přes `startStewardBuild`.
- **Kostel:** s lomem, všemi `MASON_CRAFTS` mezi lidmi, bez staveniště `church` a po
  `Lodge.npcRetryDay`; první vždy, další při `churchCoverage` < `CHURCH.npc.coverageBelow`. Typ
  `churchTypesFor(circle)[0]`, rozměry `churchDimsForCapacity(type, ⌈lidé × capacityPerPerson⌉)`
  (`church-geometry.ts` – od dolní meze po `CHURCH_DIMS_STEP_M` v délce, u rotundy v průměru;
  šířka a výška `defaultChurchDims`). Místo `meadowTilesNearCentre` (`steward-land.ts`, sdílí ho
  `sacredStep`) do `CHURCH.npc.searchTiles`, nejvýš `checks` × `checkChurchPlacement` s
  `CHURCH_EAST_ROTATION`, napřed bez `takenLand`; stavba záměrem `church` přes `startStewardBuild`
  (značka správce). Bez místa (nebo odmítnutá stavba) → `Lodge.npcRetryDay` = den + `retryDays`.
- `startStewardBuild` bere jen `Pick<StewardContext, 'day' | 'landscape' | 'obstacles'>`.

## Kostel ve vsi

Kostel s knězem dává křesťanům štěstí, zrychluje obrácení a má hřbitůvek
([churches.md](../design/churches.md) – Co kostel dává). Vše v `domain/village/people/church-life.ts`;
ves bez `VillageState.churches` se nemění (zlatý otisk beze změny).

- `churchCoverage(state)` – `{ coverage, decorated }`: kostely s živým knězem (`Church.priestId`),
  kapacity (`churchCapacity`) ÷ `state.people.length`, nejvýš 1; `decorated` jen z kostelů
  s `decoratedDay`. `churchHappiness(state)` = `CHURCH.happinessPerCoverage × coverage +
decorHappinessPerCoverage × decorated` (jde do `HappinessFactors.church` v `faithFactors`,
  `happiness.ts`, jen pro křesťany přes `christianShare`). `conversionBase(state)` =
  `CHURCH.conversion.base + perCoverage × coverage` (`conversionDay`, `conversion.ts`).
- `priestDay(state, day)` (`simulate.ts`, hned za `lodgeArrivalsDay`) – kostel bez kněze dostane
  `Church.priestArrivalDay` = `finishedDay + priestAfterDays` (0, hned); mrtvý kněz (`priestId`
  není mezi lidmi) → `priestId` zmizí a nový přijde za `newPriestAfterDays` (60). V den příchodu
  `settleArrival` (`lodge.ts`, exportovaná) usadí osobu s `priest: true`, id se zapíše do
  `Church.priestId`; bez obydlí čeká dál. Los `priest:<kostel>:<den příchodu>`. Kněz se nežení
  (`isSingle` v `marriage.ts`) a nepracuje (`isLodgeIdle`).
- `buryAtChurch(state, day, person)` (volá ho `bury` v `cemetery.ts` pro křesťany): nejbližší kostel
  (od domu zemřelého) s knězem a volným hrobem (`churchyardGraves` − hroby) → `Church.graves`;
  hroby starší než `CHURCH.graveReuseYears` (30 let) se přitom uvolní (zahodí ze seznamu). Jinak
  `bury` pokračuje po staru (starý hřbitov kostrově). Pozice hrobu ve scéně dopočítá web z indexu
  v `graves`.
