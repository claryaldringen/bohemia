# Ves – lidé, rodiny, sňatky, stěhování, postavy

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: kinship.md, population.md, migration.md, villagers.md v `docs/design/`.

- **Příbuzenství a pohlaví** ([kinship.md](../design/kinship.md), Martin 18. 10. 2026;
  `kinship.ts`): `Person.sex`, `motherId`, `fatherId`, `spouseId`, u nevěsty z okolí a lidí od
  souseda (výměna lidí – trade.md) `origin` (směr sousední vsi – válka); zemřelí a odešlí rodiče
  žijících v `VillageState.ancestors` (id a rodiče, jen dokud jsou rodičem někoho žijícího –
  `removePeople`), dcery vdané pryč a lidé daní sousedovi v `emigrants` (se směrem). `areCloseKin` (do bratranců), `hasCloseKinIn` (příbuzní ve vsi ve
  směru – war.md), `familyCounts` (muži, ženy, děti, starší, páry – panel obydlí a pohlaví postav).
  Staré vsi převede `withKinship` (v `updateVillage` i na začátku `advanceVillage`, bez příznaku –
  ves, kde mají všichni pohlaví, se nemění; `availableSettlers` počítá na převedené).
  **Porody** (`population.ts`) jen manželským párům: žena 16–44 s manželem od 16 let v témže domě,
  chlapec `BOY_SHARE` (105/205); šance podle věku ženy (`maritalFertility` – přirozená plodnost
  `NATURAL_MARITAL_FERTILITY` × `MARITAL_FERTILITY_LEVEL` 0,85, Martin 19. 10. 2026 „aby se
  populace co nejvíce rozrůstala“, čísla návrh Clauda – rešerše
  `research/2026-10-19-population-growth.md`) a **rozestup** `BIRTH_SPACING` (po porodu 21 měsíců,
  po svatbě a od založení vsi 9 měsíců – `Person.nextBirthFrom`; ve vsích uložených dřív od
  nejmladšího žijícího dítěte – `birthPauses`), potom `birthRatePerYear` (průměrný odstup =
  1 / plodnost věku). **Domácnost drží člověk 16–44** (`householdBreaksUp` v `people.ts`;
  osamělý 16–44 zůstává), rozpadlá jde k příbuzným (syn, dcera, sourozenec), jinak do domu
  s nejvíc místy – jen kam se vejde bez přeplnění, jinak zůstane doma (Martin; samotné děti jdou
  i do přeplněného).

- **Osídlení obydlí** (`households.ts`; population.md – Nové obydlí, kinship.md – Domácnosti): nové
  obydlí po dokončení (`settleNewDwelling`) a prázdné v kroku 6 (`occupyEmptyDwellings`) osídlí
  **rodina ženatého syna** (muž, žena, jejich svobodné děti – `familiesOf` / `leavingFamilies`)
  **z jakéhokoli domu** (Martin, 19. 10. 2026 – „ženatý pár, který dům nedrží, smí odejít kdykoli“;
  dřív jen z plné domácnosti), dokud se zbytek nerozpadá (`departingFamilies` – i lidé k osídlení;
  prázdný dům nejdřív rodina z nejvíc přeplněného domu, v něm od nejstaršího muže);
  dům drží jeden dědic – nejstarší ženatý syn s rodiči, v domě bez ženatého syna vdova s vlastními dětmi, jinak nejstarší ženatý muž; ostatní ženatí se oddělí (i muž bez rodičů v domě vedle dědice). Co zůstane prázdné,
  osídlí **svobodný nejstarší syn – jen z plného domu** (`loneSonOf`, Martin – „nejstarší dítě může
  odejít“, „ať prázdný dům obsadí i plná domácnost“; od 16 let, bez ženatého dědice a s neplodnou matkou zůstává nejstarší a jde druhý; bez syna jiný svobodný muž od 16 let bez rodičů v domě, ne otec dětí z domu – `lodgerOf`).
  Dcery odcházejí sňatkem. Ne z domácnosti, jejíž zbytek by se rozpadl, a jen kdo nový dům udrží
  (rodina i svobodný muž s někým 16–44 – starší pár by se v novém domě rozpadl, vrátil a odešel
  znovu: stěhování tam a zpět, kalibrace 19. 10. 2026). **Chátrá jen prázdné
  obydlí** (Martin: „obydlená budova nechátrá – obyvatelé ji opravují“): `decayEmptyDwelling` – bez
  oprav podle stáří a navíc pevný denní podíl, nové zanikne za `DWELLINGS[type].emptyLifespanYears`
  (zemnice 5, polozemnice 8 let). Obydlené stav neztrácí – opravy podle stáří (`repairNeedPerDay`)
  dál berou práci vsi, nedodělek se jen neudělá; přestavbu rozhoduje jen stáří (`wantsRebuild`).

- **Sňatky** (`marriage.ts`, kinship.md – Sňatky; Martin, varianta c; 19. 10. 2026: „Vdova by se
  měla snažit co nejdříve vdát, ideálně ve vesnici.“): svobodný = muž od 16 / žena 16–44 bez
  manžela, i vdova s malými dětmi (`isSingle`); vdova / vdovec = svobodný s dítětem
  (`isWidowed`, `parentIds` – bez příznaku, pozná se i ve starých vsích). V kroku 6 po osídlení
  obydlí se berou nepříbuzní muž a žena – **vdovy a vdovci první**, pak od nejstaršího, nejbližší
  věkem (`bestMatch`), rozdíl do `MARRIAGE.maxAgeGapYears` (s vdovou či vdovcem
  `maxAgeGapWidowedYears` 20). Kam (`weddingHome`): **žena k muži**, i do přeplněného domu; drží-li
  dům ona a on ne (`holdsHome` – po jeho odchodu s dětmi do 16 by doma nezůstal nikdo 16–44), **on
  k ní**; drží-li oba, kde bude méně těsno, při shodě žena. Stěhuje se i s vlastními dětmi do 16
  (`dependants`); nevěsta dostane `nextBirthFrom` (9 měsíců). Okolí (`MARRIAGE.outside`, los ze
  seedu a dne, kdo nemá s kým): muž od 18 nevěsta 30 % ročně (16–22, staršímu nejvýš o povolený
  rozdíl mladší, `origin`); žena od 18 ženich z okolí 10 % ročně (vdova, dědička – `holdsHome`
  – a žena z domu bez mužů 50 %, `favouredBride`), jinak pryč 20 % ročně (záznam v `emigrants`;
  vdova, dědička ani žena z domu bez mužů ne); v hladu a do přeplněného domu z okolí nikdo.
  Kronika `marriage` (`groomMoved`, `widow`), `bride-from-outside`, `groom-from-outside`
  (`widow`), `married-away`; upozornění „Svatba“ (`VillageView.lastMarriageDay`), „Nevěsta
  z okolí“, „Ženich z okolí“, „Dcera se vdala pryč“.
  **Svatba ve scéně** (kinship.md – Svatba ve scéně; Martin, GitHub issue #2: „Jako máme pohřeb,
  udělej i svatbu. Svatebčané půjdou na některé z posvátných míst v okolí, kde budou oddáni.“ –
  jen zobrazení): události svatby nesou `groomId` / `brideId` (`WeddingCouple`) a `marriage`
  i domy před svatbou (`groomFromDwellingId`, `brideFromDwellingId`; starší z `from` / `to`);
  `lib/wedding-view.ts` → `SceneVillage.weddings` (posledních 40 dnů, svatebčané `weddingGuests`,
  lidé z okolí `weddingCompanions` a bod na kraji mapy); scéna `wedding-plan.ts` (místo
  `weddingSiteCandidates` / `pickWeddingSite` – stojící navštěvovaná modla a svatyně, živý dub,
  háj do 600 m, váha 1 ÷ (d + 40 m)², jinak ohniště na návsi; průvod od domu nevěsty, lidé z okolí
  od kraje mapy po stezce, obě skupiny naráz; podkova `horseshoeSpots`; cesta do nového domova –
  čisté funkce času, sdílí pomocníky průvodu z `funeral-plan.ts`), plány `planWeddings` ve
  `villager-plan-events.ts` → `onWeddings` → `wedding-renderer.ts` (oheň v ohništích svatyně u vstupu
  a na návsi – `pyre-fire.ts` menší, věnec s pentlemi na kmeni dubu jen při obřadu – poloměr kmene
  podle modelu `OAK_TRUNK_M`). Ukázka **Svatba** na `/dev/landscape` (dub, svatyně, nevěsta
  z okolí, náves).

- **Přestěhování domácnosti** ([migration.md](../design/migration.md), fáze 1): akce
  `startRelocation` (`actions.ts`) = nová stavba obydlí (`kind: 'dwelling'`) s
  `Construction.relocates` = id domácnosti – dřevo, pozemek polozemnice, překážky a cena jako
  `startNewDwelling`, jen **bez lidí k osídlení** (`relocationAffordability` v `relocation.ts`;
  `availableSettlers` přestěhování nepočítá). Domácnost, která si staví nový dům, starý
  nepřestavuje (`relocatingHouseholds` v `decideRebuilds`) a znovu se stěhovat nemůže
  (`relocationBlock`: prázdné obydlí, už se stěhuje, přestavuje). Po dostavění se obyvatelé
  přestěhují (`moveRelocatedHousehold` ve `finishConstructions`, kronika `household-relocated`),
  starý dům zůstane prázdný – dál ho řeší běžná pravidla (osídlení, chátrání, rozpad, zbytek
  jámy). `cancelRelocation` stavbu zruší, klády z hromady i skácené stromy vrátí na hromadu
  (`returnConstructionWood`). Use-casy `relocateHousehold` a `cancelHouseholdRelocation`
  (`relocate-household.ts`, důvody česky `RELOCATION_BLOCKED`, `NO_RELOCATION`).

- **Víc vsí jednoho hráče** (migration.md, fáze 2): sídlo (`settlement`) = mapa s krajinou,
  na jedné mapě může být víc vsí (`village.id` je primární klíč, `settlement_id` jen cizí klíč);
  nová mapa = nové sídlo s polohou v mřížce map (`settlement.grid_x` / `grid_y`, port
  `Settlement.worldCell`, `SettlementRepository.create` – mřížka je zatím každého hráče zvlášť,
  políčko nejvýš jedno aktivní na hráče; `assignWorldCell` dá sídelnímu sídlu (0, 0)).
  Port `VillageRepository` jde podle id vsi (`find`, `save`, `rename`), `listBySettlement`,
  `create` (první ves sídla – atomicky, zámek řádku sídla) a `add` (další ves). Use-casy berou
  `villageId`; `findPlayerVillage` ověří, že ves patří hráči (sídlo mezi jeho aktivními),
  `firstPlayerVillage` = výchozí ves (sídelní sídlo první). `dynastyStatus` projde všechny vsi
  všech aktivních sídel (konec hry až po vymření všech), `restartGame` archivuje všechna sídla.
  `foundAnotherVillage` = další ves téhož sídla nejméně `NEW_VILLAGE_MIN_DISTANCE_M` (300 m)
  od staveb ostatních (`villages-apart.ts`).

- **Odchod do nové vsi** (migration.md, fáze 3 a 4; `departure.ts`): `departVillage` – domácnosti
  vybraných obydlí odejdou celé (rodokmen – rodiče osadníků jako předci, odešlí ve staré vsi
  v `ancestors` / `emigrants` se směrem), s jídlem `leavingFood` (`LEAVING`: 25 kg na člověka od
  7 let, nejvýš poměrný díl zásob, ze všech zásob stejný podíl; s vozem navíc jeho náklad)
  a poměrným dílem stád; **vůz s voly** (migration.md – Vůz při odchodu: `leavingCart` – vůz doma
  a voli nad páry k rádlům, celá ves bere i ty, napřed čtyřkolák; `takeLeavingCart`,
  `Settlers.cart` / `oxen`; v nové vsi `VillageState.looseOxen` – s první ohradou volů do ní
  `looseOxenDay`; náhled `VillageLeave.cart` / `allCart`, popisek odchodu); domy
  zůstanou prázdné, kronika `households-left`. Odejdou-li všichni, `abandonedDay` + kronika
  `village-abandoned` – ves se nesimuluje (`isVillageDormant` v `advanceVillageSteps`: vymřelá,
  opuštěná, na cestě), akce odmítne `updateLivingVillage` (`VILLAGE_ABANDONED`,
  `VILLAGE_TRAVELLING`), pohled ji ukáže přes `abandonedVillageAt` (domy chátrají podle dne
  odchodu, pak jámy; pole ladem); `isGameOver` ji počítá jako mrtvou. Nová ves z osadníků:
  `foundVillage({ settlers })` – jedna domácnost na staveništi první zemnice, id lidí ze staré
  vsi. Use-case `leaveVillage` (`leave-village.ts`): na téže mapě (`here` – místo první zemnice
  ověří proti stavbám všech vsí mapy a 300 m dřív, než lidé odejdou, pak `add`), nebo na novou mapu
  (`map` – sídlo vedle ve směru `neighbourCell` z `world-grid.ts`, `generateAcceptedLandscape`,
  prázdné vlastní sídlo na políčku se použije znovu, vlastní ves tam → `OWN_MAP_THERE`; ves na
  cestě `travellingVillage` s `VillageState.journey`, dny `travelDays` – 1–3 podle
  `edgeDistanceM` od dvorce, po hotové stezce 1). `settleJourney` po příjezdu založí ves
  (`settlersOf`). **Vsi na téže mapě o sobě vědí:** `neighbourSnapshot` (`neighbourhood.ts`) –
  stavby a políčka jiných vsí mapy (natočené čtverce polí, sadů, hřbitovů, ohrad a lesa
  s mřížkou zvlášť v `squares`, natočený pozemek jen jako tvar obydlí – fields.md, Natočené
  stavby), jejich
  odstraněné, pokácené a vyhrazené stromy;
  `updateVillage` ho připojí (`withNeighbours`, jen když na mapě jiná ves je – otisk napřed)
  a před uložením odebere. `obstacleChangesAt` a `reservedTrees` ho započítají (kácení se
  nekříží), `placementVillageOf` dává `PlacementVillage.foreign` – kontroly umístění
  (`checkFootprintFree`, čtverce `foreign`, pozemky – rejstřík cizí půdy `foreignIndex` podle
  skutečných ploch) odmítnou `FOREIGN_LAND`; v prohlížeči totéž `foreignFromScene`.

- **Postavy – lidé ve vsi** ([docs/design/villagers.md](../design/villagers.md), jen zobrazení,
  žádná pravidla): ukazují, kde ves dnes pracuje. Jádro: krok práce simulace uloží rozdělení
  práce dne po činnostech a místech (`labor-report.ts`, `VillageState.labor` – JSON, simulace ho
  nečte, na kouscích nezávisí; vsi uložené dřív ho mají od dalšího dne), sklizeň se dělí na žeň
  a odnos podle `HARVEST_WORK_PER_HA`; do scény jde jako `SceneVillage.labor` (člověkodny na
  setiny, lidé podle věku, měsíc). Scéna: `villager-plan.ts` (čisté funkce, testy) převede
  člověkodny na postavy (jedna na pracujícího, nejvýš `MAX_WORKERS` = 60, po skupinách až 4
  v činnosti – `shareCounts`; muž nebo žena podle podílu činnosti posunutého podílem žen ve vsi –
  `figureSexes` a `womenChance` ze `SceneLabor.people`, kinship.md; domácí práce a nečinní venku
  jen z části, v zimě méně; práce bokem – dojení, péče o zvířata, domácí výroba žen a denní
  minimum starších – přijde z `LaborDay.aside` mezi podíly, `sceneLabor` ji připojí; **každá
  stavba s dnešní prací má aspoň jednoho člověka** – `LaborShare.construction` z jádra,
  `withBuilderAtEachConstruction`, náhradní místo `builderNearby`) a rozestaví
  je (postavy stylizovaně o 20 % větší – `FIGURE_SCALE`, rozestupy s nimi): řady na polích
  přesně na čtvercích, kde se pracuje (Martin – fronta práce `workedParts`: díly z
  `SceneLaborShare.parts`, jinak rozpracovaný díl a za ním další; řada stojí hned za čarou práce
  a jde podél řádků), po přeplánování dojde postava na nové místo pěšky (`walkThen`),
  nosiči polem ↔ obydlí (`walkRoute` obchází domy), stavitelé za
  staveništěm (`siteBox` = vyklízená plocha), dřevorubci u vyhrazených stromů, sad, obvod
  hřbitova, výmlat u vsi, ženy u vchodu, starší (šediny) u domů a děti u stád (`herdViews`
  ze zvířat). Nikdo nestojí ve vodě (schůdná země se stejnými mezemi jako rastr zvířat, ale přes
  celou krajinu – `walkGroundFor`),
  v domě se šíjí, na pozemku polozemnice ani na hrobech. Pohyb `villager-motion.ts` – čisté funkce skutečného času
  jako u zvířat. Kreslení `villagers.ts`: GLB z `tools/blender/people_from_0ad.py`
  (`people.json` – klipy z 0 A.D., rotace klíčů jako int16, maska látky a vlasů jako
  occlusionTexture), animace zapečené do textury matic kostí (Babylon VAT) a postavy jako thin
  instances – mesh `villagers-woman` / `villagers-man` (klip, fáze, tempo na instanci,
  `villagerLook` = barva oděvu a kód vlasů: šátek, šediny) + měkký kruhový stín
  `villagers-shadow` (alphaIndex 5 – po obtiscích vsi). **WebGPU má limit 8 vertex bufferů**
  a postava jich má právě 8 (pozice, normála, uv, kosti 2×, matice, VAT, look) – další atribut
  na vrchol nepřidávat, patří do textury. Klipy se střídají střihem (VAT prolínat neumí). Hýbou
  se jen v záběru (`WATER_FPS`), při omezeném pohybu stojí. Ve vývojovém náhledu tlačítko
  **Lidé** (ukázkové rozdělení práce podle měsíce – `app/dev/landscape/dev-labor.ts`, i lidé po
  obydlích pro provoz na cestách a ukázkoví lidé – `demoPersons`).
  **Výběr postavy** (villagers.md – Výběr postavy; Martin 20. 10. 2026: „Stačí mi jenom vědět info
  typu - žena rolníka, jde pro vodu.“): **postava = konkrétní člověk** – server posílá
  `SceneLabor.persons` (`lib/person-view.ts`: id, věk, pohlaví, domácnost, role z
  `lib/person-roles.ts`), `planVillagers` přiřadí každé postavě člověka (`DayRoster` ve
  `villager-roster.ts` – los ze seedu a dne, nikdo dvakrát; `cast` ve `villager-plan-cast.ts`) v pořadí
  pohřeb → karavany (tesař na cestě pro kování podle `SceneExpedition.trip.travellerId`) → nosiči
  kováře podle věku → pasáci → dílny u své práce → první člověk u stavby → práce vsi → provoz na
  cestách (z domácnosti proudu) → domácí práce a nečinní → starší; na koho nezbude člověk, ta
  postava není. Postava nese `person` a `job` (`PersonJob`), póza úsek pochůzky
  (`VillagerPose.stage`). Výběr `{ kind: 'person', id }` – `VillageVillagers.pick` (do 12 px od
  průmětu, `villager-pick.ts`, jen při kliknutí) má přednost před `pickVillageTarget`; žlutý
  kroužek `villagers-ring` (jedna instance), stav vybraného člověka `onPersonState` jen při změně →
  `selectionDetails(…, personState)` → panel `PersonBody` (činnost `lib/person-activity.ts`).
  Bez `persons` jsou postavy jako dřív (nejdou vybrat). Ukázka `/dev/panels?panel=postava`.
  **Výběr spřežení a vozu** (villagers.md – Výběr spřežení a vozu; Martin 20. 10. 2026: „nešlo mi
  kliknout na volské spřežení ani na člověka, co jej vedl“, podrobnosti návrh Clauda): oráč, honák
  a vozka jsou lidé vsi – `planVillagersWithCrew` (`DraftCrew`; vstup `draft` =
  `VillageRenderer.draftCrews()` – kolik spřežení a id zapřažených vozů ves kreslí) jim přiřadí
  člověka hned po pasácích (vozku vozu výpravy s karavanou; oráč dospělý muž, honák nejblíž
  `LEADER_AGE` 12), podíl orby a svoz jejich vozů postavy nemají; úloha `PersonJob` `plough`
  (`team`, `role`) a `cart`. Klik: `VillageRenderer.pickDraft` (`PloughTeams.pick`,
  `CartRenderer.pick` – válce dílů promítnuté na plátno, `draft-pick.ts`, jen při kliknutí)
  se porovná s `VillageVillagers.pickHit` (bližší vyhraje); `draftHitTarget` vybere spřežení
  `plough-team` (pořadí dne `team`) nebo vůz `cart` (id), na oráče, honáka či vozku `person`.
  `LandscapeScene.setSelection` → `draftSelectionFor` → `VillageRenderer.selectDraft` – kroužek
  `SelectionRing` (`selection-ring.ts`, i kroužek postav) sleduje pohyb, stav (`TeamActivity`
  z `draft-state.ts`, `CartPose.leg`) jen při změně → `onDraftState` (`DraftFigureState`
  z `lib/draft-activity.ts` – i lidé u spřežení) → `selectionDetails(…, personState, draftState)`
  → panely `TeamBody`, `CartBody` (texty, `teamPen`, `cartPen`), u oráče a vozky tlačítko
  spřežení / vozu. `CartPlan.id`. Ukázky `/dev/panels?panel=sprezeni` (`vuz`, `vuz-stoji`,
  `postava-orac`, `postava-vozka`); `/dev/landscape` ukázky s prací dne bez lidí dostanou ukázkové
  lidi (`withDemoPersons`).
  **Pohřeb** (villagers.md – Pohřeb): průvod s márami a kruh kolem hranice jsou postavy s klíčem
  `funeral:` z `funeral-plan.ts` (`funeralFigures` ve `villager-plan-events.ts`) – jdou mimo rozpočet
  `MAX_WORKERS`, ve dnech obřadu se o ně sníží počet pracujících postav (`funeralActiveIn`).
  **Svatba** (villagers.md – Svatba): průvod, pár a podkova svatebčanů jsou postavy s klíčem
  `wedding:` (`weddingFigures`, nejvýš `MAX_WEDDING_FIGURES_TOTAL` = 60) – mimo `MAX_WORKERS`,
  lidé vsi ubírají z pracujících ve dnech, kdy jsou vidět (`weddingVillagersIn`); nevěsta má kód
  vlasů `wreath` (věnec z kvítků – shader po masce vlasů, villagerLook.w = 4), svatebčané pestřejší
  oděv (`WEDDING_CLOTH`). Svatebčan je člověk vsi (`WeddingMember.person` → `roster.takeId`,
  jen kdo je ten den vidět – `weddingMembersIn`; lidé z okolí jako cizí postavy), jde vybrat
  kliknutím; činnost `PersonJob` `wedding` – „jde na svatbu“, „je oddávána“ / „je oddáván“,
  „stojí u obřadu“, „vrací se ze svatby“ (úseky `wait` / `ring` / `home` ve `weddingPose`).
  **Provoz na cestách** (villagers.md – Provoz na cestách; Martin 19. 10. 2026: „Chci vidět
  vesničany, jak chodí pro vodu nebo na pole.“): `road-traffic.ts` (čisté funkce) – proud lidí
  pro vodu (`waterTrips` – `WATER_FETCHING.tripsPerPerson` × lidé z `SceneLabor.homes`, bez vody
  přivezené vozem `cartWater`), k lesu (`woodErrandTrips` z jádra) a na pole (člověkoden polní
  práce = cesta); na cestě cesty × doba cesty ÷ `TRAFFIC_DAY_S` (900 s) lidí, nejvýš
  `MAX_TRAFFIC` (24), každý druh aspoň jeden (`trafficCounts`), fáze se zlatým řezem
  (`streamPhase`). `trafficFigures` ve `villager-plan-traffic.ts` – po pěšinách (`errandPath`, na vzdálený
  díl `fieldPath`: po pěšině k poli, `route(a, b, reach)`, a přes pole; kontrola `trafficRouteOk`
  – ohrady se neberou, do domu jen o `ROUTE_HOUSE_SLACK_M`), vyjde se od vchodu (`trafficDoor` –
  volné místo do 16 m), doma na chvíli zmizí (`ShuttleOptions.restHidden`); pro vodu s vahadlem
  a vědry (klipy `carry-water` a `water-idle`, prop `yoke` – `procedural_yoke` v
  `people_from_0ad.py`, ruce `reach` na provazech). Schůdná země postav přes celou krajinu líně
  po 4 m (`lazyWalkable`, `VillageLivestock.walkGroundFor`) – pole až 800 m od obydlí; `inBox`
  má rychlé odmítnutí podle dosahu domu, hledání po pěšinách si trasy pamatuje (`pathRouter`).
  **Kovář** (crafts.md – Uhlí a ruda kováře): kopáči na valu jámy s motykou (`oreDiggers`), nosiči
  uhlí a rudy s košem (`smithFetchFigures` – postava na každého nosiče z `LaborShare.ages`, nejvýš
  `FETCH_MAX`, ne proud; synové pod 14 let menší postavy dětí); kovář s vozem se nekreslí.
