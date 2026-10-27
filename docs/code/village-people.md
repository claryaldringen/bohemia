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
  1 / plodnost věku). Vedlejší manželka muže rodu rodí i v jiném domě než muž (`fatherOf`
  v `populationDay` – mapa lidí nejvýš jednou za den; pár v různých domech mimo to dál ne),
  přeplnění podle domu ženy (lord.md – Návštěvy a porody) a hlad podle **energie** dne
  (`hungerBirthFactor` v `population.ts`, `HUNGER.birthsStopAt/FullAt`; pestrost porody nebrzdí,
  Martin 25. 10. 2026). **Domácnost drží člověk 16–44**
  (`householdBreaksUp` v `people.ts`; osamělý 16–44 zůstává), rozpadlá jde k příbuzným (syn,
  dcera, sourozenec), jinak do domu s nejvíc místy – jen kam se vejde bez přeplnění, jinak zůstane doma (Martin; samotné děti jdou
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

- **Vojvodova rodina** ([lord.md](../design/lord.md)): `lord.ts` – `lordFamily` (ves bez rodu:
  vojvoda = `householdHead` dvorce, jen muž – dvorec vdovy vojvodu nemá; `trainees` potomci po
  meči od 7 let, `household` ženy rodiny, `others` zbytek – zeť pracuje se vsí; ves s rodem viz
  Rod vojvody – Výcvik), `trainingHours` (vojvoda
  3 h v každém věku, výrostek od `LORD.youthFrom`), `armsCap`, `trainArms` / `decayArms`
  (dovednosti `Person.arms`, nejvyšší dosažená v `best`) a `familyTrains` (rodina cvičí, až má ves
  4 dospělé mimo rodinu, hystereze 3 – Martin 24. 10. 2026; bez vojvody false). Čísla `LORD`
  v `rules-lord.ts`. `householdHead` je v `households.ts`, pohřby ji sdílejí.
  - **Den rodiny v simulaci:** `work()` volá `updateLordTraining` (režim `VillageState.lord.trains`
    s hysterezí; chybí = rodina pracuje jako ostatní, i ve starší vsi – převod netřeba).
    Cvičící rodina je mimo práci vsi, `manorLabor` kryje minimum dvorce (starší, pak dospělí
    rodiny; zbytek žen propadne). `LaborDay.lord` = počty `{ training, field, household }`.
  - **Hlad:** `lordFieldMode` po jídle dne – `state.hungry` → `lord.field = { since, reason:
'hunger' }` (kronika `lord-to-field`), rodina dá od zítřka práci dospělých po minimu do úloh
    dne (`lordField`); po `LORD.backToTrainingDays` (30) dnech plného přídělu po sobě
    (`lord.fedDays`) zpět (`lord-to-training`).
  - **Výcvik:** `trainLordDay` po jídle – cvičící `trainArms`, dospělí jen
    `1 − podíl práce na poli`, chlapci 7–13 vždy; kdo necvičí a má `arms`, `decayArms`. Jízdu
    (`trainingHours(…, hasHorse)`) cvičí jen jezdec s koněm – páry `assignRiders`
    (`horse-riders.ts`, i když rodina necvičí); bez koně jízda 0 a hodiny jdou do luku a boje.
    Koně pod jezdci, kteří dnes jezdili, cvičí `trainHorsesDay` – `trainLordDay` vrací kroniku.
    **Den lovu** (`hunt.today`, W4 – `docs/code/village-wildlife.md`): hodiny `HUNT.training` místo
    `trainingHours`, odešlí synové na lovu cvičí místo `decayArms`.
  - **Pasáci:** synové cvičící rodiny nepasou (`lordTraineeIds` v `youngsterCount`,
    `herdingDay`, `youngsterHerders`).
- **Rod vojvody** (lord.md – Rod vojvody, fáze 1, #9; `dynasty.ts`, `dynasty-names.ts`): data
  `Person.name` (jméno muže rodu), `line` (muž rodu po meči), `mainWifeSon` (syn hlavní manželky)
  a `VillageState.dynasty` = `{ lordId, lords, endedDay? }` (`lords` – vojvodové po sobě pro
  kroniku rodu). `spouseId` u ženy = její muž (i vedlejší manželky), u muže hlavní manželka –
  `wivesOf`, `mainWifeOf`, `isSecondaryWife`. **Ves bez rodu** (`lords: []`, `NO_DYNASTY`,
  `isDynastyTracked` false) se chová jako před rodem – zakládá ji `foundVillage` bez `lord`
  (testy, e2e seed, starší varianty kalibrace, vývojová druhá ves `foundDevVillage`)
  i `travellingVillage`.
  - **Zakladatelé** (lord.md – Zakladatelé; Martin 24. 10. 2026: „Vesnici zakládá vojvoda a jeho
    rodina.“): `foundVillage({ …, lord: { name? } })` – vojvoda (`LORD.founders.lordAge` 25, id
    2, `line`, jméno je-li zadané) s hlavní manželkou 22 (id 3, `spouseId` vojvody) a vedlejšími
    20, 18, 16 (id 4–6); rodiče neznámí, všechny manželky `nextBirthFrom` = den + 9 měsíců;
    `dynasty = { lordId: 2, lords: [{ id: 2, name?, fromDay }] }`. Všech pět na staveništi a pak
    v první zemnici (5 ze 6 míst), zásoby a stáda z potřeby pěti lidí; rodina zpočátku pracuje
    (nikdo mimo rodinu – `familyTrains` false). Bez `lord` dva páry `START_AGES`. Osadníci
    (`settlers`) zakladatele nemění – vojvodou je nejstarší muž rodu mezi nimi (jeho jméno
    zůstane), bez něj ves bez rodu (`lord` se nepoužije). Web zakládá první ves vždy s rodem
    (`foundVillageForSettlement`, `lordName?`); `foundAnotherVillage` a odchod (`foundedVillageState`
    bez `lord`) beze změny.
  - **Jména od hráče** (lord.md – Jména): `checkPersonName` (`dynasty-names.ts`) – po
    `normalizePersonName` (NFC, ořez) jen `\p{L}`, 1–`LORD.nameMaxLength` (20) znaků (počítá se
    `[...name]`); důvody „Jen písmena.“, „Nejvýš 20 písmen.“, prázdné „Vojvoda potřebuje jméno.“ /
    „Syn potřebuje jméno.“. `nameLineMan(state, personId, name, day)` (`dynasty.ts`) – jen žijící
    muž rodu bez jména, trvalé, u vojvody i do `lords`, kronika `line-named`; use-case
    `nameLineManInVillage` (`application/name-line-man.ts`, přes `updateLivingVillage`). Svatba
    muže rodu (`marriage`, `bride-from-outside`) nese v kronice `name` ženicha.
  - **Převod** `withDynasty` (v obou řetězech převodů za `withKinship`, jen když `dynasty` chybí):
    vojvoda = nejstarší muž dvorce i chlapec, bez muže v dvorci nejstarší muž vsi, který se se
    ženou a svobodnými dětmi přestěhuje do dvorce (`moveIntoManor`); bez muže ve vsi ves bez
    rodu. `line` vojvodovi a žijícím potomkům po meči (`parentIndex`, i přes zemřelé předky),
    `mainWifeSon` všem mužům rodu kromě vojvody (ves před rodem měla jednu ženu na muže – matka
    byla hlavní manželkou otce, stejně jako u `markNewborn`); vojvoda a synové bez jména, ostatní
    muži rodu jméno vygenerované. Nikdo jiný se nestěhuje (Vlkov: vojvoda 25 let a syn 3 roky,
    oba bez jména).
  - **Narození:** `populationDay` volá u každého dítěte `markNewborn` – syn muže rodu `line`,
    syn hlavní manželky `mainWifeSon`; syn vojvody bez jména (kronika `line-birth`), ostatní
    jméno hned – `generatedLineName` (proud `'line-name:' + den + člověk`, jen jméno, které nenosí
    žijící muž rodu; `LINE_NAMES` – 62 jmen). Úmrtí muže rodu nese v kronice `name`.
  - **Nástupnictví** (`succession.ts`, lord.md – Nástupnictví): `currentLord` (žijící `lordId`);
    `dynastyDay` po `populationDay` = `ensureMainWives` + `succeedLord`. Zemřel-li vojvoda,
    `successorOf`: nejstarší syn s `mainWifeSon` (i chlapec, i po smrti matky) → nejstarší syn →
    nejstarší vnuk po meči (otec i z `ancestors`) → nejstarší muž rodu; bez náhody. Stěhování do
    dvorce (`moveSuccessor`): nezletilý (do 16 let) s matkou, je-li svobodná a bydlí s ním, a jejími
    dětmi do 16 let; dospělý s hlavní manželkou, jejími svobodnými dětmi a svými dětmi bez matky
    v domě, vedlejší manželky z jeho domu se svobodnými dětmi jen, vejdou-li se (od nižšího id).
    `lords` – `toDay` starému, nový záznam, kronika `lord`; bez muže rodu `lordId = null`.
    `holdsManor` (`dynasty.ts`): dvorec drží vojvoda a za nezletilého jeho matka – `weddingHome`
    stěhuje druhého k nim, `holdsHome` je bere jako dům držící. Dvorec bez vojvody nedrží nikdo –
    ženatí muži z něj odcházejí všichni (`familiesOf`); rodina, ve které je vojvoda (matka
    s mužem, nezletilý syn), neodchází.
  - **Výcvik** (`lordFamily` → `dynastyFamily`; lord.md – Manželky – Výcvik, „Cvičí, dokud
    neodejde“): vojvoda je `dynasty.lordId` (jen když bydlí v dvorci, jinak rodina není), cvičí
    všichni muži rodu v dvorci od 7 let (synové všech manželek, ženatí synové čekající na dům,
    vnuci, bratři); `household` = manželky vojvody v dvorci, matka nezletilého vojvody (i vdaná),
    dcery mužů rodu i dřívějších vojvodů, ženy mužů rodu; `others` = zeť, vdovy po dřívějším
    vojvodovi, chlapci pod 7 let. `wivesApart` = vedlejší manželky vojvody mimo dvorec – v
    `lordApartIds`, ve `familyHomes` (spolu s dvorcem mimo minimum vsi – `villagersToday`,
    `sowingCapacity`) a v `manorLabor` kryjí minimum svého domu, nekryté platí ves (`uncovered`),
    zbytek jen do `free` (pole při hladu), ne do `freeMen` (osev, žeň). Do „4 dospělých mimo
    rodinu“ se nepočítají. Jejich děti pracují se vsí. Vojvoda cvičí celý život (3 h).
  - **Manželky** (`dynasty-wives.ts`, lord.md – Manželky): `spouseId` je **asymetrický** – žena
    ukazuje na muže (i vedlejší), muž jen na hlavní; manželky muže = ženy s jeho id. Vedlejší
    manželka se za živého muže nevdává (`isSingle`), smrt muže ovdoví všechny (`removePeople`),
    smrt hlavní smaže `spouseId` muže. `extraWivesDay` (krok po `arrangeMarriages`): muž rodu od
    `LORD.extraWifeFromAge` s 1–3 žijícími manželkami, v pořadí id jeden los (proud
    `'wife:' + den`, `LORD.extraWifePerYear`), ne v hladu; žena z okolí 16–22 let s `origin`
    a svatební pauzou porodů bydlí **vždy v domě muže**, i když ho přeplní (`extraWifeHome`;
    Martin 24. 10. 2026 – vedlejší odchází až z přeplněného domu, viz Bydlení rodu); kronika
    `extra-wife`. Ves bez rodu – nic. `ensureMainWives` (v `dynastyDay` i před `arrangeMarriages` – osadníci výpravy, kde muž
    přišel jen s vedlejší): muž bez `spouseId` se žijícími manželkami dostane hlavní – matku
    nejstaršího žijícího syna, jehož matka žije, jinak nejnižší id; jejím synům `mainWifeSon`,
    nebydlí-li s ním, přestěhuje se k němu se svobodnými dětmi i do přeplněného (kronika
    `main-wife`). Bez náhody; ve vsi bez vícežeňství se nic nestane.
  - **Bydlení rodu** (`dynasty-housing.ts`, `households.ts`; lord.md – Manželky – Bydlení
    a Přednost, Synové po sňatku): v dvorci vsi s rodem drží dům vojvoda (`familiesOf` – dvorec
    nemá dědice mezi ženatými syny), **všichni ženatí muži rodu** jsou rodiny k osídlení, i nejstarší;
    rodina muže rodu = on, **všechny jeho ženy z domu** (`wivesHere`) a svobodné děti. Svobodný muž
    rodu z dvorce sám neodchází (`loneSonOf`). `secondaryWifeFamilies` – z přeplněného domu muže
    rodu (každého, u vojvody dvorec) odchází vedlejší manželka se svobodnými dětmi, od té
    s nejstarším synem (bez syna až po nich, při shodě nižší id), po jedné, dokud dům zůstává
    přeplněný i po odchodu rodin, které odcházejí tak jako tak (`departingFamilies`); jen kdo dům
    udrží. Zpět ji nevrací nic, jen `ensureMainWives` (nová hlavní). `settlingFamilies` – pořadí
    při osídlení (`settleNewDwelling` – prázdné i dostavěné obydlí): ženatí muži rodu z dvorce od
    nejstaršího → vedlejší manželky z přeplněných domů (dvorec první, pak od nejvíc přeplněného) →
    `leavingFamilies`; ves bez rodu přesně `leavingFamilies`. `possibleNewHouseholds` přičte
    vedlejší manželky (lidé k osídlení, „Rodina čeká na dům“). Kronika `son-left-manor` (jméno)
    a `wife-left-manor` při odchodu z dvorce (`moveIn`). Samotné děti (nikdo od 16 let) muže rodu
    jdou při rozpadu domácnosti k otci, i do přeplněného (`lineFatherOf` v `population.ts`). Dům
    vedlejší manželky drží ona jako vdova, nejstarší ženatý syn je dědic (beze změny). Z přeplněného
    dvorce odcházejí napřed vdovy po dřívějších vojvodech se svobodnými dětmi (`lordWidows` – kromě
    matky vojvody; pozná je dítě s otcem z `lords`), pak vedlejší manželky nového vojvody. Rodiny
    k oddělení (`familiesOf`, `departingFamilies`, `byCrowding`) jsou ve `families.ts` pod
    `households.ts` i `dynasty-housing.ts` (bez cyklického importu; `households.ts` je re-exportuje).
  - **Výměna lidí:** ves s rodem nedá sousedovi muže rodu ani manželku muže rodu (`keptByLine`
    v `people-trade.ts`, návrh Clauda).
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
  **Čekání na zásoby** (kinship.md – Sňatky čekají na zásoby; Martin 27. 10. 2026):
  `arrangeMarriages(state, day, storesFill)` a `extraWivesDay(…, storesFill)` – `simulate.ts`
  předá líně počítané naplnění pojistky `bufferFill(fieldSowingTargets(…))` (`field-food.ts`,
  výhled `leftKg` / `bufferKg`, jednou za den, jen když je svatba na řadě; v hájení – `inLuckyYears`
  – vždy 1). Pod 1 se svatba ve vsi
  koná s denní šancí `weddingChancePerDay(null, fill)` (střední odklad
  `MARRIAGE_STORES.waitYears` × (1 − fill), vlastní los `'wedding-wait:' + den`; čekající snoubenci
  jsou ten den zabraní), z okolí a další manželka s `weddingChancePerDay(perYear, fill)` – nad
  pojistkou přesně `perDay(perYear)`, losy beze změny; vdát se pryč beze změny.
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
  jámy). Rozestavěné stěhování zruší obecné `cancelConstruction` (stavba zmizí, nespotřebované dřevo se
  vrátí na hromadu, `returnConstructionWood`; kronika `relocation-cancelled`). Use-case
  `relocateHousehold` (`relocate-household.ts`, důvody česky `RELOCATION_BLOCKED`).

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
  člověkodny na postavy (dělníci na cestě – `roadWork` a `wagonWork`, osa podle zemní práce své stavby
  přes `SceneEarthwork.constructionId` – viz village-roads.md; jedna na pracujícího, nejvýš `MAX_WORKERS` = 60, po skupinách až 4
  v činnosti – `shareCounts`; muž nebo žena podle podílu činnosti posunutého podílem žen ve vsi –
  `figureSexes` a `womenChance` ze `SceneLabor.people`, kinship.md (`WOMEN` – pletí 0,9, seč 0,1;
  u pletí dospělých bere `LaborShare.women` z jádra – fields.md, Pletí jednou a rychle); domácí práce a nečinní venku
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
  volné místo do 16 m), doma na chvíli zmizí (`ShuttleOptions.restHidden`).
  **Pochůzka se dokončí** (villagers.md – Pochůzka se dokončí; Martin 24. 10. 2026): postavy
  proudu a nosiči kováře nesou `PlannedVillager.errand` (`shuttleErrand` – cyklus `shuttleCycle`:
  délka, posun fáze, kdy v cyklu dojde domů, a otisk trasy `sig`); `VillageVillagers.rebuild`
  po novém plánu volá `carryErrands(staré, nové, t)` (`villager-errands.ts`, čisté funkce, testy
  `villager-errands.test.ts`): kdo je venku a v novém plánu nemá tutéž pochůzku (klíč, otisk,
  člověk, postava), dojde ji jako postava `…#done` (`untilS` – ve dveřích zmizí, příští
  přeplánování ji vynechá); nové pochůzky čekají doma do svého začátku cyklu (`fromS`,
  `nextStart`) a ne dřív, než se jejich člověk vrátí; jiná práce člověka, který se vrací, je
  skrytá do návratu a od dveří k ní dojde (`WALK_OVER_M`, přesunuté z `villagers.ts`). Bez
  minulého plánu (první zobrazení) je proud rozběhnutý. Pochůzky se nepřecházejí `walkThen`.
  **K lesu pro dřevo** (villagers.md – K lesu pro dřevo): `errandPath` pro dřevo vybere nejkratší
  chůzi ke konci pěšiny pro dřevo (okraj lesa ze sítě pěšin jádra) nebo k jedné ze tří
  nejbližších větších skupinek stromů (`WOOD_GROVE` – 6 stromů do 15 m, `GroveIndex` – stromy
  z `VillagerGround.treesIn` líně po čtvercích 30 m, hustota jen u prošlých stromů, poloměry
  30 → 250 m, `WOOD_SEARCH_M`; jeden index na plán), trasa `walkRoute` / `fieldPath`, cíl 2,5 m
  před krajním stromem; mez `ERRAND_MAX_M.wood` 400 m. Pro vodu s vahadlem
  a vědry (klipy `carry-water` a `water-idle`, prop `yoke` – `procedural_yoke` v
  `people_from_0ad.py`, ruce `reach` na provazech). Schůdná země postav přes celou krajinu líně
  po 4 m (`lazyWalkable`, `VillageLivestock.walkGroundFor`) – pole až 800 m od obydlí; `inBox`
  má rychlé odmítnutí podle dosahu domu, `routeWalker` (`path-router.ts`) vede postavy po
  uložených trasách simulace a pamatuje si dotazy (`route(a, b, reach, dwellingId)` – trasa
  domácnosti `d:<id>` má přednost před geometricky bližší cizí); krátké pohyby (`walkRoute`)
  obcházejí plot ohrady (box ohrady = plot odsazený `PEN_FENCE_INSET_M`, ulička 3 m mezi
  ohradami průchozí; strana, kde navazuje další čtverec téže ohrady, plot nemá). Svatby, pohřby
  a karavany bez uložené trasy jdou také přes `walkRoute`, plot nepřekročí.
  **Kovář** (crafts.md – Uhlí a ruda kováře): kopáči na valu jámy s motykou (`oreDiggers`), nosiči
  uhlí a rudy s košem (`smithFetchFigures` – postava na každého nosiče z `LaborShare.ages`, nejvýš
  `FETCH_MAX`, ne proud; synové pod 14 let menší postavy dětí); kovář s vozem se nekreslí.

- **Vojvodova rodina na dvorku** (lord.md – Ve scéně; `villager-plan-lord.ts`, Úloha 9): pohled
  posílá `SceneLabor.lord` (`village-view-scene.ts` – `sceneLord`) – obydlí vojvody, cvičící
  s hodinami dne z jádra (`trainingFamily` + `trainingHours`, jízda jen s koněm – `Horse.riderId`)
  a ženy domácnosti dvorce; kdo je dnes na poli (podle počtů `LaborDay.lord`, napřed nejmladší dospělí –
  jádro dává jen počty, jména volí scéna), tam není a je mezi ostatními. Obsazení `lordFigures` jde hned po pohřbu a karavanách
  (`takeId` – do práce vsi pak rodina nejde). Rozvrh (návrh Clauda): dva bloky od 8 a 14 h, v každém
  polovina hodin – napřed luk, pak boj, pak jízda (na dvorku ten čas není); mimo bloky ve dne (7–19 h)
  muži stojí (`idle`) u dvorku, skrytí (`hidden`) jsou jen v noci; ženy domácnosti chodí
  mezi vchodem a kouskem dvora (`fetcher` jako domácí práce u domů). Luk: dráhy cvičiště, na střídačku po dvou výstřelech
  (`bow-draw` 2,2 s, `bow-release`), ostatní čekají v řadě za střelcem. Boj: napřed dvojice
  (útok `sword-strike` a krytí `shield-block` se střídají po 1,6 s), pak kůl (meč a oštěp po 4 s),
  ostatní čekají u kůlu. Ženy rodiny před vchodem domu dvorce (`own` – uvnitř pozemku) od 7 do
  19 h. Činnost v panelu (`PersonJob` `lord`, úsek pózy `bow` / `combat`): „cvičí lukostřelbu“,
  „cvičí boj“, „vede domácnost“. **Výjimka pozemku:** `plotBox` dvorce zahrnuje i dvůr – ostatní
  postavy na celý pozemek dvorce nevstoupí (ženy u domů, starší, provoz vycházejí před bránou),
  stojí na něm jen rodina.

## Jezdec a výcvik (klipy a rekvizity `man.glb` – lord-horses Úloha 8; luk a boj kreslí Úloha 9)

`man.glb` nese navíc klipy `ride` (krok), `ride-trot`, `ride-idle` (sed z `rider/cavalry/crossbowman`),
`bow-draw` a `bow-release` (luk), `spear-thrust`, `walk-spear`, `sword-strike`, `shield-block` a rekvizity `bow`,
`training-sword`, `wicker-shield`, `spear` (všechny dřevěné, bez kovu; body `prop-weapon_bow`,
`prop-weapon_R`, `prop-shield`). Jezdec nepřidává žádný vertex atribut (JOINTS_0, WEIGHTS_0,
POSITION, NORMAL, TEXCOORD_0 jako dosud – 8 bufferů s VAT a barvou instance; hlídá `fauna.test.ts`).
Klipy sedu mají sed na koni, poloha jezdce se odvodí z koně ve scéně (Úloha 11).
`people_from_0ad.py` navíc umí `<polygons>` v COLLADA (luk, meč a štít z 0 A.D.).
Porážka (návrh `slaughter`): klipy `butcher` (`gather_meat` + nůž, klek), `bleed` (klek s miskou),
`gut` (`slaughter.dae` + nůž, vestoje), `carry-meat` a `carry-meat-idle` (kýta na rameni) a propy
`knife` (`dagger_01`), `meat` (`brontoburger`) a `bowl` (procedurální `procedural_bowl`); sekvenci
zatím nic nepoužívá, GLB jsou o ≈ 190 kB větší, VAT texturu tvoří ≈ 1400 řádků (man).
Propy mají volitelná pole `scale` (měřítko kolem bodu), `rotate_deg` a `offset_m` (posun v osách bodu,
metry): kýta má `scale` 0,55 (≈ 0,4 m), u muže `offset_m` ji snižuje o 0,3 m z výšky nad hlavou na rameno;
miska je natočená o −90° kolem X (svislice bodu `weapon_L` je jeho osa Y) a dnem stojí v bodě ruky.

## Lovci, rybáři a děti s řehtačkou (postavy – wildlife Úloha W11)

- **Lovci:** jezdci lovu sedí na koni po trase lovu (`huntPlans`), pěší lovci jdou za nimi
  (`footHunterPose`) – cvičící muži dvorce mimo blok lovu cvičí, odešlí synové rodu se berou
  z rozpisu (`takeId`) jen na blok lovu, jinak jsou doma. Panel: úloha `lord`.
- **Rybáři:** podíl práce `fish` s cílem tůně – postava na břehu s prutem (`anglers`), panel
  podle podílu práce. Oka (`snare`) postavu nemají.
- **Děti s řehtačkou:** výrostci (`YOUNGSTERS`) po pasácích, jedno na hlídaný díl (nejvýš 4) –
  úloha `watch`, panel „hlídá pole“. Chodí s řehtačkou zvednutou v pravé ruce (`walk-rattle`,
  na koncích `idle-rattle`); pěší lovec nese cestou oštěp (`walk-spear`).
