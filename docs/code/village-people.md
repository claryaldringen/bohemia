# Ves – lidé, rodiny, sňatky, stěhování, postavy

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: kinship.md, population.md, migration.md, villagers.md v `docs/design/`.

- **Příbuzenství a pohlaví** ([kinship.md](../design/kinship.md), Martin 18. 10. 2026;
  `kinship.ts`): `Person.sex`, `motherId`, `fatherId`, `spouseId`, u nevěsty z okolí a lidí od
  souseda (výměna lidí – trade.md) `origin` (směr sousední vsi – válka); zemřelí a odešlí rodiče
  žijících v `VillageState.ancestors` (id a rodiče, jen dokud jsou rodičem někoho žijícího –
  `removePeople`), dcery vdané pryč a lidé daní sousedovi v `emigrants` (se směrem). `areCloseKin` (do bratranců), `hasCloseKinIn` (příbuzní ve vsi ve
  směru – war.md), `familyCounts` (muži, ženy, děti, starší, páry – panel obydlí a pohlaví postav).
  Staré vsi převede `withKinship` (seznam převodů – village-core.md, bez příznaku –
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

- **Domácnosti – nadzemní dům** (`log-house-settle.ts`; [log-house.md](../design/log-house.md) –
  Kdo v domě bydlí, Martin 12. 11. 2026): prázdný nadzemní dům (`isLogHouse` – typ `srub`
  i `vypleteny` – `isHouseType`;
  `isEmptyLogHouse` – v provozu, bez dílny) obsadí **jen lidé z pořadí** – `logHouseFamilies`:
  mistři huti (`mason`) → kněz (`priest`) → synové hlavní manželky (muži rodu s `elite`) → synové
  vedlejších manželek (muži rodu bez `mainWifeSon`), ve skupině od nejstaršího (`byAge`). Dnešní
  vojvoda ani muž, který už ve srubu bydlí, se nestěhuje; rodina s vojvodou nebo s tím, kdo drží
  dvorec (`holdsManor`), taky ne. Ženatý jde s manželkami z domu a svobodnými dětmi, svobodný sám;
  jen rodina, která dům udrží, a zbytek domácnosti se nesmí rozpadnout (`householdBreaksUp` – jako
  u jiných obydlí, návrh Clauda); kdo jde s otcem, další rodinu nezakládá. `settleLogHouse`
  (kronika `household-founded`, z dvorce `son-left-manor` – `moveIn` v `move-in.ts`) volá
  `settleNewDwelling` pro dostavěný srub a `occupyEmptyDwellings` napřed pro prázdné sruby (podle
  id), teprve pak ostatní obydlí – do srubu nejde `rehouseDisplaced` ani `loneSons`. Host
  z `displaced` (mistr ve dvorci) se nastěhuje jako kdokoli z pořadí a `pruneDisplaced` ho ze
  seznamu hostů smaže. `logHouseWaiting` = počet rodin z `logHouseFamilies` (pro správce).
  - **Elita v nejlepším volném domě** (log-house.md – Dům s vypletenými stěnami, Martin 14. 11.
    2026): `logHouseFamilies(state, day, type)` vezme i muže z horšího nadzemního domu
    (`DWELLING_QUALITY` – z vypleteného do srubu, ne naopak; bez `type` jen lidi bez nadzemního
    domu). `occupyEmptyDwellings` osídlí napřed prázdné sruby, pak vypletené domy
    (`HOUSE_TYPES_BEST_FIRST`, v druhu podle id) – vypletený dům, ze kterého se elita přestěhovala
    do srubu, osídlí ještě týž den další z pořadí. Mistr z ciziny dostane napřed srub
    (`emptyLogHouseId` – kvalita, pak id). Zemnice a polozemnice se obsazují jako dosud.
  - **Obyčejná rodina do srubu nejde:** `availableSettlers` nepočítá prázdný ani rozestavěný srub
    (`dwellingType` `srub`) – „Rodina čeká na dům“ trvá; prázdný srub nehostí vystěhované
    (`hosts` v `displaced.ts` – ani `freePlaces`) a rodina od souseda do něj nejde
    (`newcomerHome`). Rozpadlá domácnost jde jen do obydleného domu (`roomiest`) – beze změny.
  - **Mistr a kněz z ciziny** (`settleArrival` v `lodge.ts`): napřed prázdný srub
    (`emptyLogHouseId`, i když čeká vystěhovaná domácnost – ta do srubu nejde), pak volné obydlí,
    jinak host ve dvorci (`displaced`).
  - **Testy:** `people/__tests__/log-house-settle.test.ts` (i vcelku = po kouscích, vypletený dům
    a stěhování do lepšího).

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
  - **Na pole jen ve žních** (lord.md – Kdy jde rodina na pole; Martin 9. 11. 2026): rodina ve
    vsi dá ve žňový den podíl z plánu (`manorLabor.help` – `lordHelpDay`,
    [village-fields.md](village-fields.md) – Rodina ve žních) v pořadí ženy a dcery → muži →
    vojvoda (`lordFieldShares`; `ManorLabor.freeLord` – minimum, na které ženy nestačí, kryjí
    napřed synové). `lordFieldIds` = cvičící dnes na poli – nejezdí ani neloví. Pomoc při hladu (`lord.field`,
    `lord.fedDays`, kronika `lord-to-field` / `lord-to-training`) zrušená – převod
    `withoutSowingHelp` (`lord.ts`) je smaže; staré zápisy kroniky web dál umí.
  - **Výcvik:** `trainLordDay` po jídle – cvičící `trainArms`, dospělí jen
    `1 −` podíl své skupiny na poli (muži rodiny `men`, vojvoda `lord`), chlapci 7–13 vždy; kdo necvičí a má `arms`, `decayArms`. Jízdu
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
  (testy, e2e seed, starší varianty kalibrace)
  i `travellingVillage`.
  - **Zakladatelé** (lord.md – Zakladatelé; Martin 24. 10. 2026: „Vesnici zakládá vojvoda a jeho
    rodina.“, 15. 11. 2026: aspoň 4 dospělí synové): `foundVillage({ …, lord: { name? } })` →
    `dynastyFounders` – vojvoda (`LORD.founders.lordAge` 42, id 2, `line`, jméno je-li zadané)
    s hlavní manželkou 38 (id 3, `spouseId` vojvody) a vedlejšími 35, 25, 20 (id 4–6) a synové
    (`LORD.founders.sons` – věk a pořadí matky): 20 a 18 let (id 7, 8, matka 3, `mainWifeSon`)
    a 17 a 16 let (id 9, 10, matka 4), všichni `fatherId` 2, `line` a jméno `generatedLineName`
    s `nameByHouse` (hráč ho smí jednou přepsat; jména se neopakují ani s vojvodou), elitu jim dá
    první den `markElite`. Rodiče vojvody a manželek neznámí, všechny manželky `nextBirthFrom` =
    den + 9 měsíců; `dynasty = { lordId: 2, lords: [{ id: 2, name?, fromDay }] }`. Všech devět na
    staveništi (stavba zemnice id 11) a pak v první zemnici – 9 ze 6 míst, přeplněná: druhá
    manželka se syny je rodinou k osídlení (`secondaryWifeFamilies`) a do prvního dalšího obydlí
    odejde se syny. Zásoby a stáda z potřeby devíti lidí (4 860 kg jídla a 3 240 kg osiva); rodina
    zpočátku pracuje (nikdo mimo rodinu – `familyTrains` false). Bez `lord` dva páry `START_AGES`. Osadníci
    (`settlers`) zakladatele nemění – vojvodou je nejstarší muž rodu mezi nimi (jeho jméno
    zůstane), bez něj ves bez rodu (`lord` se nepoužije). Web zakládá první ves vždy s rodem
    (`foundVillageForSettlement`, `lordName?`); odchod (`foundedVillageState` bez `lord`) beze
    změny.
  - **Jména od hráče** (lord.md – Jména): `checkPersonName` (`dynasty-names.ts`) – po
    `normalizePersonName` (NFC, ořez) jen `\p{L}`, 1–`LORD.nameMaxLength` (20) znaků (počítá se
    `[...name]`); důvody „Jen písmena.“, „Nejvýš 20 písmen.“, prázdné „Vojvoda potřebuje jméno.“ /
    „Syn potřebuje jméno.“. `nameLineMan(state, personId, name, day)` (`dynasty.ts`) – jen žijící
    muž rodu bez jména, trvalé, u vojvody i do `lords`, kronika `line-named`; use-case
    `nameLineManInVillage` (`application/name-line-man.ts`, přes `updateLivingVillage`). Svatba
    muže rodu (`marriage`, `bride-from-outside`) nese v kronice `name` ženicha.
  - **Převod** `withDynasty` (v seznamu převodů za `withKinship`, jen když `dynasty` chybí):
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
  - **Jména synů po roce** (absence.md – Jména synů): `nameWaitingSons` (`dynasty-kin-names.ts`,
    volá `dynastyDay`) pojmenuje muže rodu bez jména (ne vojvodu), kterému je `SON_NAME_GRACE_DAYS`
    (365) dní. `houseNameForSon`: děd z otcovy strany → strýc (otcův bratr) → praděd → jiný muž rodu
    (los ze seedu `'kin-name:' + den + syn`) → `generatedLineName`; jméno žijícího muže rodu se
    přeskočí. Jména zemřelých drží `dynasty.deceased` (`removePeople` → `rememberLineName`, nejvýš
    `DECEASED_NAMES_MAX`). Syn dostane `nameByHouse` – `nameLineMan` ho smí jednou přepsat (příznak
    se smaže). Kronika `line-named` s `house` a `after` („Syn dostal jméno X po dědovi“). Upozornění
    „Syn vojvody čeká na jméno“ zmizí samo (fronta = muži bez jména).
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
    **Elita** (hillfort.md – Elita): `Person.elite` je trvalý příznak, dává ho `markElite`
    (`dynasty.ts`, na konci `dynastyDay` po nástupnictví – nový vojvoda označí syny týž den; bez
    převodu starších vsí) žijícímu muži rodu s `mainWifeSon`, jehož žijící otec je `isElite`
    (příznak, nebo dnešní vojvoda); opakuje do ustálení (vnuk týž den jako otec). `eliteHomes`
    (`dynastyFamily` – `eliteHomesOf`) = obydlí mimo dvorec, kde bydlí elitní muž od
    `AGE.fertile`, bez dílny (`workshop` má přednost) a bez domů `wivesApart`; druhý průchod je
    třídí jako dvorec: muži rodu od 7 let → `trainees` (i synové vedlejších manželek, dokud
    neodejdou), ženy a dcery mužů rodu → `household`, ostatní → `others`. Elita se tak počítá do
    rodiny i do „4 dospělých mimo rodinu“ (`familyTrains` beze změny). `familyHomes` vrací i
    `eliteHomes` (minimum domu mimo minimum vsi), `lordApartIds` jejich lidi z rodiny.
    Ve scéně (`manorHousehold` v `village-view-scene.ts`) se u dvorce kreslí jen `household`, kdo
    bydlí v dvorci; ženy elity z `eliteHomes` stojí u svého domu jako ostatní domácnosti.
    `manorLabor` počítá po domech `[dvorec, ...eliteHomes]`: minimum domu (`homeNeed`) kryje
    kapacita lidí rodiny z toho domu (napřed `household`, pak `trainees`), `free += cap − min`,
    `freeMen += min(cap − min, muži)`; ke dvorci patří, kdo nebydlí v domě elity – samotný dvorec
    vychází bit po bitu jako před elitou (`lord-elite.test.ts`). Vedlejší manželky elitního muže
    v jiném domě pracují se vsí; `wivesApart` (a návštěvy ve scéně) zůstává jen vojvodovi.
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
  předá líně počítané naplnění pojistky `bufferFill(fieldStoresOutlook(…))` (`field-food.ts`,
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
  `startReplacement` (`actions.ts`; dnes jen správce – náhrada domu,
  village-steward.md) = nová stavba obydlí (`kind: 'dwelling'`) s
  `Construction.relocates` = id domácnosti a `replaces` – dřevo, pozemek polozemnice, překážky a cena jako
  `startNewDwelling`, jen **bez lidí k osídlení** (`replacementAffordability` v `relocation.ts`;
  `availableSettlers` přestěhování nepočítá). Domácnost, která si staví nový dům, starý
  nepřestavuje (`relocatingHouseholds` v `decideRebuilds`) a znovu se stěhovat nemůže
  (`relocationBlock`: prázdné obydlí, už se stěhuje, přestavuje). Po dostavění se obyvatelé
  přestěhují (`moveRelocatedHousehold` ve `finishConstructions`, kronika `household-relocated`);
  s `replaces` se starý dům hned opustí a zbourá (`startDemolition`), rozestavěné přestěhování ze
  starší vsi (bez `replaces`) ho nechá stát prázdný – dál ho řeší běžná pravidla (osídlení,
  chátrání, rozpad, zbytek jámy). Rozestavěné stěhování zruší obecné `cancelConstruction` (stavba zmizí, nespotřebované dřevo se
  vrátí na hromadu, `returnConstructionWood`; kronika `relocation-cancelled`). Use-case
  přestěhování domácnosti **zanikl** s tlačítkem Přestěhovat (8. 11. 2026,
  [demolition.md](../design/demolition.md)); doména (`startReplacement`, `relocates`,
  `relocationBlock` – ten hlídá i Odejít) zůstává pro správce a rozestavěná stěhování starých vsí.
  V rozhraní je rozestavěný nový dům běžné staveniště se Zrušit, starý dům nese jen Odejít
  (návrh Clauda); kronika `relocation-started` / `household-relocated` / `relocation-cancelled`
  je dál čitelná.

- **Víc vsí jednoho hráče** (migration.md, fáze 2): sídlo (`settlement`) = mapa s krajinou,
  **jedna ves, jedna mapa** (Martin 1. 11. 2026) – `village.id` je primární klíč, `settlement_id`
  cizí klíč s unikátním indexem `village_settlement_uq` (migrace `0011`);
  nová mapa = nové sídlo s polohou v mřížce map (`settlement.grid_x` / `grid_y`, port
  `Settlement.worldCell`). **Mřížka je společná všem hráčům** (migrace `0013`, unikátní
  `settlement_grid_idx` na (grid_x, grid_y) mezi aktivními): `create` a `createSeat` na obsazené
  políčko vrátí null, `occupiedCells()` dává `placeNewPlayer` mapu obsazení. Odchod na políčko,
  kde leží mapa **jiného hráče**, odmítne `targetSettlement` textem `FOREIGN_MAP_THERE`
  (`new-village.ts`); správce (`settleStewardDepartures`) zkusí další směr ze záznamu, bez volného
  směru záznam čeká. Migrace posunula mapy hráče o `16 × k` sloupců (k = pořadí podle prvního
  sídla). `assignWorldCell` zůstává jen pro sídla z doby před mřížkou.
  Modul `domain/world` (`placement.ts`, `cell-seed.ts`, `rules-world.ts`) je základ společné mřížky
  světa: `placeNewPlayer` najde nováčkovi políčko po prstencích (nezávislý od středu, odstup 3;
  pozvaný nejblíž pánovi, odstup 2) a `cellLandscapeSeed` odvodí seed krajiny políčka ze seedu světa.
  Port `VillageRepository` jde podle id vsi (`find`, `save`, `rename`), `listBySettlement`,
  `create` (ves sídla – atomicky, zámek řádku sídla; sídlo s vsí → null), `addOnce` (schránka
  správce – sídlo s jinou vsí → null); `add` (další ves sídla) je pryč. Use-casy berou
  `villageId`; `findPlayerVillage` ověří, že ves patří hráči (sídlo mezi jeho aktivními),
  `firstPlayerVillage` = výchozí ves (sídelní sídlo první). `dynastyStatus` projde všechny vsi
  všech aktivních sídel (konec hry až po vymření všech), `restartGame` archivuje všechna sídla.
  `foundVillageForSettlement` sídlo s vsí odmítne (`ALREADY_FOUNDED`); druhá ves
  hráče na téže mapě není – `village-site.ts` má jen
  `freeVillageSite(landscape, obstacles)` pro příjezd vsi na cestě se správcem.
- **Rod hráče** (multiplayer-vassalage-war.md, úloha 1.3): rod = řádek tabulky `house`
  (`packages/db/src/schema/house.ts`, port `HouseRepository` v `application/houses.ts`, adaptér
  `house-repository.ts`, migrace `0014` převedla každého hráče s aktivním sídlem na jeden živý
  rod). Hráč má nejvýš jeden živý rod (`ended_at IS NULL`, unikátní `house_player_alive_idx`);
  `create` pro hráče se živým rodem vrátí ten existující. `enterGame` zajistí rod po vstupu,
  `restartGame` živý rod ukončí (`ended_at`, `ended_day` = herní den restartu) a další `enterGame`
  založí nový. `lord_village_id` / `lord_person_id` = hlava rodu (`setLord`).
- **Hráčův muž a vlastní ves** (seniorate.md, úloha 2.1): `House.lord` = hráčův muž (ves + číslo
  osoby), `playerLordOf` ho čte. `ensurePlayerLord` (`application/player-lord.ts`) je převod
  rozehrané hry – jen dokud je `house.lord` prázdný: mužem je vojvoda první vsi se správcem
  **vypnutým**, jinak vojvoda nejstarší vsi s vojvodou (`foundedDay`); ostatním živým vsím hráče
  zapne správce (verzovaný `save` s opakováním). Správci se zapínají před zápisem muže, takže
  přerušený převod doběhne stejně a opakování nic nemění. Volá ho `dynastyForVillage` na konci
  každého pohledu a akce hráče (pod jeho zámkem, vsi jsou už převedené na rod; u hráče s mužem je
  to jeden dotaz na rod) a vrací `DynastyView.playerLord`; bez vojvody k převodu se zkusí příště.
  `followPlayerLord`: odejde-li hráčův muž (jeho `personId` je mezi osadníky) na novou mapu,
  přepíše `lord.villageId` na novou ves – volá ho `leaveVillage` a `settleStewardDepartures`
  (`houses` v jejich závislostech je volitelné). V přepínači vsí je u vsi hráčova muže praporec
  (`VillageListItem.playerLord`, `banner.svg`, popisek „Tvůj muž“).

- **Odchod do nové vsi** (migration.md, fáze 3 a 4; `departure.ts`): `departVillage` – domácnosti
  vybraných obydlí odejdou celé (rodokmen – rodiče osadníků jako předci, odešlí ve staré vsi
  v `ancestors` / `emigrants` se směrem), s jídlem `leavingFood` (`LEAVING`: 25 kg na člověka od
  7 let, nejvýš poměrný díl zásob, ze všech zásob stejný podíl; s vozem navíc jeho náklad),
  napřed **osivo** `leavingSeedKg` (fields.md – Osivo pro ves bez zásob: půl roční potřeby
  odcházejících `START_SEED_YEARS`, nejvýš `LEAVING.seedKgPerCarrier` na nosiče + náklad vozu – co
  je na voze, ubere místo jídlu; jen z dílu zásob bez `reservedSeedKg` mateřské vsi; obilí na jídlo
  je díl bez osiva, mateřské vsi ubude `seedStoresKg` navíc k podílu `fraction`) – `Settlers.seedKg`
  → v nové vsi (`foundVillage`, `travellingVillage`, zpět `settlersOf`) zásoby + `reservedSeedKg`
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
  vsi. Use-case `leaveVillage` (`leave-village.ts`): jen na novou mapu – jiný cíl než `map`
  (dřívější `here`) odmítne `LEAVE_ONLY_TO_NEW_MAP` (`map` – sídlo vedle ve směru `neighbourCell` z `world-grid.ts`;
  vede-li tím políčkem řeka či stezka kostry, nejbližší suché – `dryCellNear`, world.md – Ves syna jen na suché mapě; `generateAcceptedLandscape`,
  prázdné vlastní sídlo na políčku se použije znovu, vlastní ves tam → `OWN_MAP_THERE`; ves na
  cestě `travellingVillage` s `VillageState.journey` – `create` na novém sídle, dny `travelDays`
  – 1–3 podle `edgeDistanceM` od dvorce, po hotové stezce 1). `settleJourney` po příjezdu založí
  ves (`settlersOf`). **Vsi na téže mapě** (od 1. 11. 2026 nejsou – jedna ves, jedna mapa; kód přehledu
  `state.neighbours`, cizí půdy v kontrolách umístění i stavby cizích vsí
  ve scéně je pryč; `withoutSameMapVillages` v `cart-iron.ts` při načtení jednou a idempotentně
  zahodí zbytky ve starších vsích – `neighbours` a cestu pro kování ke kovárně jiné vsi).

- **Odchod syna vojvody s poměrnou částí vsi** (lord.md – Dělení vsi, #9 fáze 2;
  `son-departure.ts`): `checkSonLeader(state, sonId, day)` → `PlacementCheck` – syn
  `dynasty.lordId` (muž rodu) ve vsi, od `LORD.leaveMinAge` let, ne nástupce (`successorOf`),
  se jménem, rodina si nestaví dům, nikdo z dílu (`sonShare`) není na výpravě – `onExpedition`
  (`SUCCESSOR_STAYS`, `SON_NAME_MISSING`, `LEAD_TOO_YOUNG`, `LEAD_NOT_SON`, `SON_SHARE_AWAY`…); `leadingSons` – synové od 16 let s kontrolou pro řadu ikon v panelu.
  `sonShare(state, sonId, day)` → `SonShare` (dílníci = žijící vojvoda + synové od 16 let, cíl
  lidé ÷ dílníci, `familyIds` – `sonFamily`: syn, `wivesOf`, svobodné děti –, `dwellingIds` celých
  domácností od nejbližšího domu syna / dvorce podle čtverce vzdálenosti, při shodě nižší id, dokud
  se počet blíží cíli (domácnost, která by díl oddálila od cíle, se přeskočí a pokračuje další); mimo díl dvorec, domy vojvody, ostatních synů a rodiny syna, stavějící
  domácnosti). `departWithSon(state, day, sonId, { direction, villageName })` – lidé dílu po
  lidech do společného jádra `departLeavers` (jídlo, osivo, stáda, vůz jako `departVillage`),
  `Settlers.lordId` = syn a `Settlers.horse` = jeho jezdecký kůň (`sonHorse`, `riderId`) z ohrady,
  kronika `son-left-village` (jméno syna a nové vsi). `departVillage` dá `lordId` vojvodovi, odchází-li
  s domácnostmi. Nová ves: `foundVillage` – vojvodou `settlersLord` (vůdce, jinak nejstarší muž
  rodu) a kronika `lord`; kůň v `VillageState.looseHorses` (seno bez obilí `hayHorsesKg`
  v `husbandry.ts`, nejezdí se, s první ohradou koní s místem `looseHorsesDay` v `horse-stock.ts`);
  ves na cestě drží vůdce v `journey.lordId` a koně v `looseHorses` (`settlersOf` je vrátí). Use-case
  `leaveVillage` s `sonId` místo `dwellingIds` – ověří `checkSonLeader`, jméno nové vsi vybere
  napřed (`suggestVillageName`) a předá ho do kroniky.

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
  u pletí dospělých bere `LaborShare.women` z jádra – fields.md, Pletí jednou a rychle; podíly
  stavby – `LaborShare.construction` – jen muži: podíl žen 0 a `shareWorker` bere `onlySex: 'male'`,
  population.md – Práce, Stavby staví muži); domácí práce a nečinní venku
  jen z části, v zimě méně; práce bokem – dojení, péče o zvířata, domácí výroba žen a denní
  minimum starších – přijde z `LaborDay.aside` mezi podíly, `sceneLabor` ji připojí (zahrádka
  u obydlí – luštěniny domácnosti, `garden.ts`, village-fields.md – jde bokem bez vlastní
  práce a postav; len je od 9. 11. 2026 večer zpět na poli); **každá
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
  `villagers-shadow` (alphaIndex 5 – po obtiscích vsi). Klipy úlohy 10 (villagers.md – Pro
  implementaci, bod 10): z 0 A.D. modlitba `pray` (léčení `heal` vyřazeno 1. 11. –
  nic ho nepoužívalo, šetří VAT), varianty stání `rest-a`–`rest-e` (žena jen `a`, `b` – místo ostatních `idle`,
  `MAN_ONLY_CLIPS`), cesta s nářadím `walk-hoe` / `walk-axe` (`TOOL_WALK` – ode dveří k práci
  s motykou či sekerou a zpět, `villager-schedule.ts`; tempo nohou `isWalkClip`), vojvoda
  `lord-idle-a`–`c` (mimo výcvik střídá po `LORD_IDLE_S`, `SceneLord.lordId`) a `walk-lord`
  (návštěva manželky); vlastní klipy z klíčových póz (`keys` v `people.json`,
  `keyed_frames` v `people_from_0ad.py`, CC0) `milk` (dojení na špalku – `milkers`), `spin`
  (předení – ženy u dveří, `SPIN_SHARE`), `sit` (starší), `wheel` (hrnčíř u kruhu –
  `PORCH_SPOTS`), `weave`, `pipe`, `drum` (tkaní a hudba – v GLB, zapojí úloha 12: stav,
  hudebníci na svatbě), `carry-pole` (přední nosič uhlí na tyči – animace `carry_meat_m`, prop
  `pole-basket`: tyč 2,6 m s košatinou) a `carry-pole-back` (zadní konec tyče, bez propu; scéna
  ho staví ≈ 2,3 m za předního – `poleCarriers`, scene-village.md). Špalek pod sedící postavou je volný prop `stump` (bod `seat` v počátku
  postavy). VAT: half-float (`TEXTURETYPE_HALF_FLOAT`, kde ho engine neumí, float32 – `getCaps()
.textureHalfFloat`), jedno pole rovnou ve formátu textury, peče se po kouscích
  `BAKE_SLICE_MS` (8 ms) mezi `requestIdleCallback` – žádná dlouhá úloha; zdrojový model je při
  pečení vypnutý. Babylon si pole drží pro obnovu po ztrátě kontextu – jiná kopie v JS není.
  Textura muže 412 × 3823 px (12,5 MB na GPU, s klipy mistrů huti), ženy 344 × 2602 px (7,2 MB);
  dřív float32 360 × 3467 a 344 × 2804 (35,4 MB obě). **WebGPU má limit 8 vertex bufferů**
  a postava jich má právě 8 (pozice, normála, uv, kosti 2×, matice, VAT, look) – další atribut
  na vrchol nepřidávat, patří do textury. Klipy se střídají střihem (VAT prolínat neumí). Hýbou
  se jen v záběru (`WATER_FPS`), při omezeném pohybu stojí. Ve vývojovém náhledu tlačítko
  **Lidé** (ukázkové rozdělení práce podle měsíce – `app/dev/landscape/dev-labor.ts`, i lidé po
  obydlích pro provoz na cestách a ukázkoví lidé – `demoPersons`).
  **Výběr postavy** (villagers.md – Výběr postavy; Martin 20. 10. 2026: „Stačí mi jenom vědět info
  typu - žena rolníka, jde pro vodu.“): **postava = konkrétní člověk** – server posílá
  `SceneLabor.persons` (`lib/person-view.ts`: id, věk, pohlaví, domácnost, role z
  `lib/person-roles.ts`), `planVillagers` přiřadí každé postavě člověka (`DayRoster` ve
  `villager-roster.ts` – los ze seedu vsi a id člověka, stejný napříč dny, nikdo dvakrát; `cast` ve `villager-plan-cast.ts`) v pořadí
  pohřeb → karavany (tesař na cestě pro kování podle `SceneExpedition.trip.travellerId`) → nosiči
  kováře podle věku → pasáci → dílny u své práce → první člověk u stavby → práce vsi → provoz na
  cestách (z domácnosti proudu) → domácí práce a nečinní → starší; na koho nezbude člověk, ta
  postava není. Postava nese `person` a `job` (`PersonJob`), póza úsek pochůzky
  (`VillagerPose.stage`). Výběr `{ kind: 'person', id }` – `VillageVillagers.pick` (do 12 px od
  průmětu, `villager-pick.ts`, jen při kliknutí) má přednost před `pickVillageTarget`; žlutý
  kroužek `villagers-ring` (jedna instance), stav vybraného člověka `onPersonState` jen při změně →
  `selectionDetails(…, personState)` → panel `PersonBody` (činnost `lib/person-activity.ts`).
  Bez `persons` jsou postavy jako dřív (nejdou vybrat). Ukázka `/dev/panels?panel=postava`.
  **Rozvrh člověka** (villagers.md – Činnosti od začátku do konce; úlohy 1–3):
  `planVillagersWithCrew` vrací i `tasks` – obsazení dne jako člověk → úloha (`PersonTask`: klíč
  postavy, `job`, druh `errand` / `bout` / `hold`, rozsah práce, póza, cyklus pochůzky, místo;
  `personTasks` a `taskKind` ve `villager-schedule.ts`, první stavitel `hold`, vojvodova rodina
  `hold` s `PersonTask.placeAt` – místo v čase z pózy dne rodiny: chůze tam a zpět se měří
  k místu v chvíli příchodu a odchodu (`lengthOf(id, task, { out, back })`), `Timetable.setDay`
  dá běžícímu dni rodiny dnešní úlohu stejného klíče (lov, jízdy); test `lord-harvest.test.ts` –
  žňový den chůzí; místo z pózy na
  začátku dne se stády teď – `herdPlaces`, jinak by pasák „stál“ u návsi a ke stádu sprintoval) a `doors` (id
  obydlí → `doorPoint`). `villager-schedule.ts` (čisté funkce, testy
  `villager-schedule.test.ts`): řetěz činností člověka – doma (pauza `PAUSE_S` 30–90 s), vyjití
  s úlohou obsazení v tu chvíli (`castOf`, `castTimeline` – dny před nejstarším jako nejstarší),
  pochůzka celá z délky (`lengthOf`), práce na místě losem `WORK_RANGE_S`, úloha u objektu do
  přelomu dne, od kterého ji obsazení nedává; začátky a konce na mřížce `GRID_S` 30 s,
  `scheduleAt` dohrává od `t − HISTORY_S` 60 min. **Zvon** `BELL_S` 55 min (návrh Clauda; Martin 31. 10. 2026: „Podle tvého doporučení“ – dlouhá pochůzka venku ≈ 86 % času): činnost, která
  by přesáhla zvon člověka, nezačne, po zvonu vyjde každý řetěz v týž okamžik – řetězy z různých
  počátků tak splynou nejpozději u prvního zvonu (bez zvonu nesplývají – test). `activityPose`
  (ode dveří rovně k práci, póza úlohy, zpět; pochůzka cyklem posunutým na začátek činnosti; doma
  skrytá).
  **Ve scéně** (úloha 3): `Timetable` (`villager-timetable.ts`, čistý, testy
  `villager-timetable.test.ts`) drží obsazení nejvýš `MAX_DAYS` 30 dnů (`setDay` – den práce od
  začátku okna `dayWindow`, týž den nahradí obsazení) a poslední činnost každého člověka; další
  se vybere, až skončí (`departAfter`), poprvé a po víc než `HISTORY_S` mimo záběr
  `scheduleAt(t − HISTORY_S)` (splyne s nepřetržitým během). Nový den rozběhnutou pochůzku ani
  práci na místě nemění – přepočítá jen, kdy vyjde, kdo je doma, a konec úloh u objektu.
  `VillageVillagers.rebuild` (`scheduleDay`, `personFigures`): postava každého člověka
  `labor.persons` (`personFigure` – vzhled, velikost a šátek či šediny podle člověka, klíč
  `person:id`), póza `Timetable.pose`, chůze ode dveří tempem `SCHEDULE_WALK_M_S`. Postavy dne
  bez rozvrhu zůstávají jen pro cizí (`STRANGER`) a ukázky bez `persons` (s `carryErrands` –
  pochůzka na cestě se dojde). Oráč, honák a vozka mají postavu z rozvrhu skrytou (kreslí je
  spřežení a vůz – `crewJobs`). **Události přerušují** (úloha 5): úloha obsazení
  s `PersonTask.interrupt` (`interruptOf` – pohřeb, svatba, karavana a jezdec `all`, požár
  `near` do `FIRE_REACH_M`) utne rozběhnutou činnost od přelomu dne, kdy ji obsazení dá
  (`settle` → `Activity.cut`), a člověk jde z místa přerušení (`Activity.from` – kreslená póza po
  fázích a trase, `ScheduleInput.placeAt` → `Timetable.placeAt`; od něj se měří i dosah požáru)
  k póze události (`nextActivity`, `rehold` – konec podle obsazení); povodeň `Timetable.setWet` (env `flooded` →
  `StormRenderer.floodedAt`) – místo práce pod vodou: domů (`Activity.retreat`), na vodu se
  nevychází (`departAfter`). Jezdec s trasou (riders.ts) v bloku jízdy sedí na koni vždy
  (`mounted`, `mountedAt` – kůň nejede bez jezdce; `riderPose` zruší i skrytou pózu rozvrhu). **Délky a trasy** (úloha 6): délka chůze
  = odhad po síti vsi `VillagerPaths.walkLength` (`path-router.ts` – cena `walkingRoute`
  z jádra nad pěšinami stálých tras a pevnými cestami, paměť dotazů) ÷ `SCHEDULE_WALK_M_S` (`Timetable.setEstimate`,
  bez sítě rovně); přesná trasa `planVillagersWithCrew` → `walk` (`walkRoute` – týž model, village-roads.md)
  přes `Timetable.setRouter` jen pro kreslenou pózu, jednou za úsek (`activityPose` – `PoseWalk`,
  `walkLeg`: po trase v čase z odhadu, `pace` = délka ÷ čas ÷ tempo, 0,6–1,8). Testy
  `villager-events.test.ts`, `path-router.test.ts`.
  **Fáze činností** (villagers.md – Fáze činností; úlohy 7–8): `villager-phases.ts` (čisté,
  testy `villager-phases.test.ts`, `villager-schedule.test.ts`) – `activityPhases(a, seed, walkS)`
  rozloží činnost na fáze (`ActivityPhase` – jméno, od–do, klip a tempo, místo jinde, chůze):
  `out` ode dveří, práce v místě po krocích role (`PHASE_STEPS` – podíly mírně losem
  `PHASE_JITTER` podle člověka a začátku; kratší práce než `MIN_PHASE_S` na krok a úloha
  u objektu a pochůzka jen `work`), `back` domů (rybář `bring-catch` s rybami v nůši); součet = délka
  činnosti, přerušení ji utne. Krok jinde (`PhasePlaces` – `drop` cizí dům, `aid` řada žnečů)
  s cestou tam a zpět, jen když se cesta vejde do `TRANSIT_SHARE` jeho délky. `phaseAt`,
  `phaseWalking`, `schedulePhaseAt` (rozvrh + fáze + klip). Role z plánu dne
  `villager-plan-phases.ts` (`planPhases` → `personTasks` – `PersonTask.role`, `places`): žnec
  `reap` (vázání `bind` – povříslo), louka `meadow` (hrabání `rake`, kupky vidlemi `pitch`),
  nakladač u vozu `load-sheaves` / `load-hay` (`pitch`), kovář podle dvora dne `smelt` (praní
  v sítu `sieve`, pražení `winnow`) / `refine` (kladivo a kleště `forge` tempem 0,7) / `forge`
  (`forge` 1,3, odnos nástrojů v nůši `carry-tools` k cizímu domu – `PhaseStep.carry`), uhlíř
  podle stavu milíře `kiln-wood` (štípání na špalku `split`) / `kiln-build` (zahrnutí `hoe`)
  / `kiln-burn` (hlídání `idle`, zahrnutí) / `kiln-draw` (hrábě `rake`, do koše `fruit`),
  hrnčíř `pottery` (sušení a vsazení `pots`, hlídání, odnos nádob `carry-pots`), rybář `fish`
  (úlovek domů `carry-fish`; rekvizity úlohy 9 – scene-village.md, Rekvizity fází činností),
  o žních cvičící muži `train` (žne a váže u řady žnečů), starší `elder` a nečinní `idle`
  (paběrky); starší mimo žně `elder-home` (úloha 10): sedí na špalku (póza úlohy `sit`),
  postojí variantou stání (`rest` – `variants: REST_CLIPS`, los podle člověka a kroku)
  a zajdou se pomodlit (`pray`) k nejbližší hotové modle či svatyni (`PhasePlaces.shrine` –
  `SHRINE_GAP_M` od okraje půdorysu na straně, odkud jdou; bez modly krok odpadne). `activityPose(…, phases)` – fáze s klipem stojí, kde ji zastihla (póza úlohy
  v začátku fáze), krok jinde jde rovně na místo a zpět; `Timetable.phase` (fáze v paměti
  s činností), `scheduledState(…, phase)` → `PersonFigureState.phase` → `PHASE_TEXTS`
  v `person-activity.ts` („váže snopy“, „pere rudu“, „nese nástroje do domácností“…; rybář „jde
  k tůni“). Tempo nohou na cestách fází podle klipu (`walkSpeed` – s košem jinak než bez).
  Tesař s rozdělaným vozem (úloha 11) má roli `cart` – otesává díly (`split`, „otesává díly
  vozu“) a staví vůz (póza úlohy `build` u korby, „staví vůz“); vůz po fázích kreslí scéna
  (scene-village.md – Tesař – vznikající vůz).
  **Implementováno – Žena, děti a svatba (úloha 12, 1. 11. 2026):** ženy u dveří (`domestic`
  → `doorChore` podle `phase` postavy, villager-plan-folk.ts) předou (`SPIN_SHARE` 0,5),
  vaří (`COOK_SHARE` 0,25), tkají u stavu (`WEAVE_SHARE` 0,1 – klip `weave`), zbytek postává;
  s malým dítětem v domě (`DayRoster.hasSmallChild` – pod `AGE.olderChild`) ho hlídá u dveří.
  Úsek pózy (`VillagerStage` `spin` / `cook` / `weave` / `mind`) řekne panel („přede před
  domem“, „vaří na ohništi před domem“, „tká na stavu před domem“, „hlídá děti u domu“ –
  `DOOR_CHORE_TEXTS`); muži u dveří postávají. Postava dítěte u matky ani nošení na zádech
  není (žádná rekvizita ani klip – návrh Clauda: jen stání u dveří). Hudebníci na svatbě
  (wedding-plan.ts – `weddingMusicians`, `WEDDING_MUSIC`): dva dospělí svatebčané losem podle
  svatby hrají na svém místě v podkově na píšťalu a buben (`WeddingMember.music` → klip
  `pipe` / `drum`, úloha `wedding` s `music` – „hraje na píšťalu na svatbě“, „bubnuje na
  svatbě“), v průvodu jdou. Oka na zajíce – Lovci, rybáři a děti s řehtačkou. Pomoc o žních
  (paběrky, nosiči) je z úlohy 8.
  Rozvrh se počítá líně: jen když `write` kreslí pózy (ves v záběru, při omezeném pohybu stojí)
  nebo pro vybraného (`updateSelection`); mimo záběr nic. Obal postav pro ořez (`bounds`) skládá
  `write` z posledních póz a z obdélníku dne (`extent`): dveře lidí s rozvrhem a místa úloh dne
  i s kroky jinde (`dayExtent` ve `villager-timetable.ts`), trasy jízd (`rideArea`), stezky
  karavan, pohřby a svatby – kdo vyjde z domu, když jsou všichni doma, se hýbe hned. Vlasce rybářů se překreslí, jen když se
  změní, kdo rybaří. Výběr: `scheduledState` – úloha a cesta (`leg` – „jde na pole“, „jde domů“
  v `person-activity.ts`) z rozběhnuté činnosti, i přes přelom dne; když vybraný zajde do domu
  (byl od výběru venku), `onPersonState` ohlásí `indoors` a `useSelection` / `DevVillagePreview`
  výběr zruší – **kromě vojvody** (role `voivode`, panel „doma“). Pryč `walkThen` při
  přeplánování (dojití na další čtverec – nahrazuje cesta ode dveří k nové práci).
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
  přivezené vozem `cartWater`), k lesu (`woodErrandTrips` z jádra) a uhlíř k milíři
  (`KILN_TRIPS_PER_MAN_DAY`); **proud na pole není** (od 31. 10. 2026 – úloha 4 Činností od
  začátku do konce: řady na poli a nosiči úrody jdou z rozvrhu ode dveří svého domu a na konci
  činnosti domů); na cestě cesty × doba cesty ÷ `TRAFFIC_DAY_S` (900 s) lidí, nejvýš
  `MAX_TRAFFIC` (24), voda a dřevo aspoň jeden (`trafficCounts`), fáze se zlatým řezem
  (`streamPhase`). `trafficFigures` ve `villager-plan-traffic.ts` – po pěšinách (`errandPath`, k milíři
  `walkRoute` – po síti pěšin a pevných cest týmž modelem jako odhad, village-roads.md; kontrola `trafficRouteOk`
  – ohrady se neberou, do domu jen o `ROUTE_HOUSE_SLACK_M`), vyjde se od vchodu (`trafficDoor` –
  volné místo do 16 m), doma na chvíli zmizí (`ShuttleOptions.restHidden`).
  **Dům s plotem** (D16, Martin 14. 11. 2026): rozvrh (`Timetable.setEntrances`, `plan.entrances`) mizí a vychází
  postava ve dveřích domu uvnitř pozemku (`houseDoor` – `own`), trasa vede dvorkem a brankou
  (`routeViaGate`); odhady a trasy mimo pozemek dál míří k brance (`doors`). Dům bez plotu beze změny.
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
  30 → 250 m, `WOOD_SEARCH_M`; jeden index na plán), trasa `walkRoute`, cíl 2,5 m
  před krajním stromem; mez `ERRAND_MAX_M.wood` 400 m. Pro vodu s vahadlem
  a vědry (klipy `carry-water` a `water-idle`, prop `yoke` – `procedural_yoke` v
  `people_from_0ad.py`, ruce `reach` na provazech). Schůdná země postav přes celou krajinu líně
  po 4 m (`lazyWalkable`, `VillageLivestock.walkGroundFor`) – pole až 800 m od obydlí; `inBox`
  má rychlé odmítnutí podle dosahu domu, `routeWalker` (`path-router.ts`) vede postavy po
  síti vsi týmž modelem jako odhad simulace a pamatuje si dotazy (`route(a, b, reach, dwellingId)` –
  uložená trasa domácnosti `d:<id>` má přednost před geometricky bližší cizí; `network` – po
  pěšinách a pevných cestách, když je to kratší než rovně – village-roads.md); pochůzka pro
  vodu a dřevo, když pěšina domácnosti neprojde, jde ke konci pěšiny přes `walkRoute`; krátké pohyby (`walkRoute`)
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
  (`takeId` – do práce vsi pak rodina nejde). Panel muže rodiny podle úseku (`stage` z `traineePose`:
  `out` na cvičiště, `back` ke dvorci, `hitch` ke koni, `wait` u koně, `visit` k manželce a u ní;
  `ride` na koni – `riderPose`; `hunt` – pěší lovec a `huntBridge`; texty `LORD_TEXTS`
  v `person-activity.ts`). **Den rodiny ve skutečném čase** (`lord-day.ts`,
  návrh Clauda; lord.md – Ve scéně, villagers.md – Bez časosběru): cyklus `LORD_CYCLE_S` 20 minut
  zarovnaný na `LIVESTOCK_EPOCH_MS` (celá rodina naráz), `traineeSteps(day, k)` dá kroky cyklu `k`
  – doma (skrytý ve dveřích dvorce, `manorDoor`) nejméně do `LORD_CYCLE.lead` 1 min, chůze
  k prvnímu cvičení, které končí v `switch` 8 min (sudé cykly luk, liché boj), chůze ke druhému,
  jezdec chůze ke koni (`besideHorse`), čekání a jízda v `ride` 13 min (`rideSlot`, nejvýš
  `rideMax` 4 min), stání u dvorku (`restSpot`, vojvoda klipy vladaře po `LORD_IDLE_S`) do `rest`
  19 min a vejde. Délky z hodin jádra `drillSeconds` (`DRILL_S_PER_H` 120 s za hodinu, aspoň
  `MIN_DRILL_S` 60 s). Návštěva (`visitPlan`, `SceneLord.visit.homes` – manželky se střídají po
  cyklech): od `LORD_VISIT.from` 17,5 min po trase `visitRoute` k jejím dveřím, `stay` 4 min
  skrytý, zpět nejpozději `backBy` (5 min do dalšího cyklu – další cyklus začne až po návratu
  a `HOME_MIN_S`); nevejde-li se aspoň `minStay` nebo zasáhne do lovu (`busy`), v cyklu nejde.
  `traineePose` – chůze rovně tempem chůze (vladař `walk-lord`), skrytý jen doma a u manželky,
  noc herního dne nic neschovává. Lov přeruší den (`huntBridge` – `HUNT_BRIDGE_S` 40 s chůzí ke
  kůlu a po lovu zpět). Ženy domácnosti `householdPose` – cyklus `HOUSEHOLD_CYCLE_S` 10 min
  posunutý podle ženy: doma 1–2 min, pak celé otočky pochůzky mezi vchodem a kouskem dvora (jako
  `fetcher`) a vejde. Luk: dráhy cvičiště, na střídačku po dvou výstřelech
  (`bow-draw` 2,2 s, `bow-release`), ostatní čekají v řadě za střelcem – k terči a zpět do řady
  dojdou chůzí. Boj: napřed dvojice
  (útok `sword-strike` a krytí `shield-block` se střídají po 1,6 s), pak kůl (meč a oštěp po 4 s),
  ostatní čekají u kůlu. Ženy rodiny před vchodem domu dvorce (`own` – uvnitř pozemku). Činnost v panelu (`PersonJob` `lord`, úsek pózy `bow` / `combat`): „cvičí lukostřelbu“,
  „cvičí boj“, „vede domácnost“. **Výjimka pozemku:** `plotBox` dvorce zahrnuje i dvůr – ostatní
  postavy na celý pozemek dvorce nevstoupí (ženy u domů, starší, provoz vycházejí před bránou),
  stojí na něm jen rodina.

## Nepřítomnost na výjezdu (lord-control.md – Kdo jede; plán 2026-11-13 – Úloha 2)

- `AwayKind` má druh `journey` (types-people.ts): vojvoda a jeho lidé na výpravě zůstávají ve stavu
  domovské vsi s `away: { kind: 'journey', refId: <id výjezdu> }` bez `untilDay` – návrat ukončí
  událost výjezdu `away-ends`. Doma nepracují (`isAway`, `laborPerDay`) a nejdou na tažení
  (`lineCandidates` je přeskočí), ale **jedí dál ze zásob vsi** – `foodNeedPerDay` pro druh `journey`
  vrací obvyklou potřebu (výjezd neveze zásoby), na rozdíl od tažení a ostatních druhů (jedí jinde).
  Vyslání lidí na výpravu (výběr, příkaz): `docs/code/journey.md` – Rozkaz vybraným lidem; starý výběr družiny mužů rodu zanikl v Úloze 12 výprav.
- Kdo je pryč (`isAway`, jakýkoli druh – tažení, výjezd, uprchlík, posel…), se nekreslí doma u rodiny
  ani při práci: `sceneLord` ho vyřadí ze dvorku, cvičiště a jízdy, `ScenePerson.away` ho nechá v panelu a výběru,
  ale `DayRoster` mu doma nedá postavu.

## Nepřítomnost na výpravě (každý od 12 let – expeditions.md; plán 2026-11-14 – Úloha 2)

- Výprava (`docs/code/journey.md`) posílá kohokoli od 12 let (ženy, děti od 12, vesničany, muže rodu). Každý člen má jako dřív `away: { kind: 'journey', refId: <id výpravy> }`; jedí dál doma (`foodNeedPerDay`), ale nepracují (`laborPerDay` = 0 přes `isAway`).
- **Návrat po hloučcích:** událost `away-ends` nese volitelné `personIds` (`VillageEventBody`, `inbox.ts`) a `endAway(state, refId, untilDay, personIds?)` (`vassalage/guests.ts`) nastaví den návratu jen těm lidem; ostatní se stejným `refId` zůstávají pryč. Bez `personIds` všichni jako dosud (ochrana).
- **Kdo ve vsi chybí při výběru práce** (`isAway`, výsledek vsi bez lidí pryč se nemění):
  - `isYoungster` (`herding.ts`) – výrostek 12–13 let pryč nepase (`youngsterCount`, pletí `weedingChildren`, noční hlídači `nightGuards`; staří pryč také nehlídají);
  - `villagersToday` (`morning-water.ts`) – pryč nenosí vodu domů;
  - `smithBellows` (`iron.ts`) – pryč nešlape měch;
  - `nextFamily` / `nextSingle` (`people-trade.ts`) – ves pryč nikoho sousedovi nevymění;
  - `lordRides` (`lord.ts`) – jezdec pryč neobjíždí pole (hlídka polí `riderPatrol` ho nepočítá);
  - `lineCandidates` / `villagerCandidates` (`muster.ts`) a `laborPerDay` už `isAway` znaly.
- Koně venku: `docs/code/village-livestock.md` – Koně venku s výpravou.

## Jezdec a výcvik (klipy a rekvizity `man.glb` – lord-horses Úloha 8; luk a boj kreslí Úloha 9)

`man.glb` nese navíc klipy `ride` (krok), `ride-trot`, `ride-idle` (sed z `rider/cavalry/crossbowman`),
`bow-draw` a `bow-release` (luk), `spear-thrust`, `walk-spear`, `sword-strike`, `shield-block` a rekvizity `bow`,
`training-sword`, `wicker-shield`, `spear` (všechny dřevěné, bez kovu; body `prop-weapon_bow`,
`prop-weapon_R`, `prop-shield`). Jezdec nepřidává žádný vertex atribut (JOINTS_0, WEIGHTS_0,
POSITION, NORMAL, TEXCOORD_0 jako dosud – 8 bufferů s VAT a barvou instance; hlídá `fauna.test.ts`).
Klipy sedu mají sed na koni, poloha jezdce se odvodí z koně ve scéně (Úloha 11).
`people_from_0ad.py` navíc umí `<polygons>` v COLLADA (luk, meč a štít z 0 A.D.).
Porážka (návrh `slaughter`): klipy `butcher` (`gather_meat` + nůž, klek), `bleed` (klek s miskou),
`gut` (`slaughter.dae` + nůž, vestoje), `carry-meat` (kýta na rameni; `carry-meat-idle` vyřazeno

1. 11. – nic ho nepoužívalo) a propy
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
  podle podílu práce. Oka (`snare` – v zimě, small-game.ts): nejvýš 3 postavy klečí s okem
  na okraji lesa nejblíž vsi (`snarers`, `SNARE_EDGE` – stromy do 160 m od středu vsi, po
  devátém stromu, 1,8 m od kmene ke vsi, čelem k lesu); samotná oka se nekreslí (úloha 12 scény).
- **Děti s řehtačkou:** výrostci (`YOUNGSTERS`) po pasácích, jedno na hlídaný díl (nejvýš 4) –
  úloha `watch`, panel „hlídá pole“. Chodí s řehtačkou zvednutou v pravé ruce (`walk-rattle`,
  na koncích `idle-rattle`); pěší lovec nese cestou oštěp (`walk-spear`).

## Seniorát a práva ve vsích rodu (seniorate.md – Seniorát; Martin 2. 11. 2026: „Jen se dívat“)

- **Senior** = `dynastySenior(villages, day)` (`domain/village/people/seniority.ts`): nejstarší žijící muž
  rodu (`isLineMan`) ze všech živých vsí rodu, shoda – nižší `bornDay`, pak id osoby, pak id vsi.
  Čistá funkce stavů vsí, nic se neukládá do simulace.
- **Práva:** `application/rights.ts`. `villageRights(ctx)` (čistá) dá množinu `VillageRight` a důvod:
  vlastní ves (`House.lord.villageId`), ves bez vojvody a hráč před převodem (bez `House.lord`) –
  `ALL_RIGHTS`; senior v cizí vsi rodu – `build`, `veto`, `evacuate` (důvod `ledBy(vojvoda)` =
  „Ves vede …“); nesenior v cizí vsi – nic (`decidesSenior(senior)` = „Rozhoduje …“). Jméno bez
  jména: „Vojvoda“, „Senior rodu“.
- **`requireRight(deps, { playerId, villageId, right, today })`** nahrazuje `findPlayerVillage`
  v akcích: vrátí `PlayerVillage`, nebo důvod česky. Stavy ostatních vsí rodu načte, jen když
  na nich záleží (cizí ves s vojvodou) – ve vlastní vsi je to jeden dotaz na rod.
- **Akce → právo:** `ACTION_RIGHTS` (stejný soubor). Use-casy hráče neznají, ověřuje je vstupní
  bod: `apps/web/lib/village.ts` – `actOn(playerId, villageId, '<akce>', …)` a `guardedAction`
  berou klíč `VillageAction` z `ACTION_RIGHTS`, `context()` volá `requireVillageRight`
  (`lib/game.ts`). Nová akce nad vsí = nový klíč v `ACTION_RIGHTS` (bez něj se nepřeloží); testy
  `rights.test.ts` (každý klíč odmítne bez práva) a `apps/web/lib/__tests__/action-rights.test.ts`
  (žádná `…ForPlayer` mimo `actOn`, žádný nepoužitý klíč).
- **Kronika:** druh `senior` (`types-chronicle.ts`, text v `village-view-chronicle.ts`).
  `announceSenior` (`application/announce-senior.ts`) porovná seniora s `house.senior`
  (sloupce `senior_village_id`, `senior_person_id`, migrace `0019_house_senior`) a při změně
  pošle událost `chronicle` do všech živých vsí rodu (`ref` = `senior:<rod>:<den>:<ves>` – `ref`
  je ve schránce unikátní globálně, proto i s vsí) a zapíše nového seniora (`setSenior`). Volá ho
  `advanceDynasty` a `dynastyForVillage` (jen když jsou všechny vsi celé, ne souhrny).

## Nástupnictví hráče (seniorate.md – Nástupnictví hráče; úloha 2.4)

- **Los** (`domain/village/people/player-lot.ts`): `playerLotCandidates(state, deathDay, deadId)` = nástupce
  vsi z rodu (`successorOf`) + mladší synové zemřelého, kteří ve vsi žijí a ke dni smrti měli aspoň
  `LORD.leaveMinAge` let; `drawPlayerLot(seed, deathDay, candidates)` losuje ze seedu
  `deriveSeed(state.seed, 'player-lot:' + deathDay)` – nástupce `PLAYER_SUCCESSION.successorWeight`
  (½), zbytek rovným dílem. Los je jen při aspoň dvou kandidátech (`isPlayerLot`). Čísla v `rules-lord.ts`.
- **Use-case** `application/player-succession.ts`: `resolvePlayerSuccession` (rodu hráčův muž
  `House.lord` už není ve vsi) → `successor` / `younger-son` (+ `deadlineDay` = den smrti +
  `departDays`; odchod po pohřbu viz níž) / `senior` / `oldest-lord` (ves bez muže rodu) /
  `none` (konec hry) / `alive` (nic k řešení). Kredit (`consumeOne`) jen místo losu.
- **Den smrti** se bere z kroniky vojvodů vsi (`dynasty.lords[].toDay`), ne z doby dopočtu – los i
  `succession_day` tak nezávisí na dělení dopočtu. Jiný muž rodu (po losu na mladšího syna) má den
  smrti v kronice vsi: událost `death` nese `personId` (jen u mužů rodu, spolu s `name`; plní
  `population.ts`, `hunt.ts`, `disaster-deaths.ts`). Dnešek zbývá jen jako záloha pro starší stavy
  bez `personId`.
- **Idempotence:** `HouseRepository.commitSuccession` je jediný podmíněný UPDATE (hlava rodu +
  `house.succession_day` + `house.pending_departure`, jen když `succession_day` je NULL nebo
  menší než den smrti). Kredit a upozornění `'player-succession'` jdou až po úspěšném zápisu.
- **Volání:** `settleSuccessionOf(deps, …)` (= `resolveSuccessionOf` + `autoPlayerDeparture`) v `dynastyForVillage` (web – každý pohled a akce),
  `advanceDynasty` a `closeAtDay` workeru (`advance-world.ts`); chybí-li rody, upozornění nebo
  kredity, nic nedělá.
- Text upozornění: `apps/web/lib/player-notices.ts` (`accusativeOf` skloňuje jméno).

## Odchod mladšího syna po pohřbu (seniorate.md, bod 4; úloha 2.5)

- **Čekající odchod:** při `younger-son` zapíše `commitSuccession` do `house.pending_departure`
  (jsonb `PendingDeparture` `{ villageId, sonId, deathDay, deadlineDay }`, migrace
  `0021_house_pending_departure`; nahradila sloupec `younger_son_deadline_day`). Smaže ho jen
  `HouseRepository.clearPendingDeparture(houseId, sonId)` (podmíněný UPDATE, uspěje jedno volání).
- **Díl:** `leaveVillage` s `sonId` a `afterFuneral` – syn je mladší bratr nynějšího vojvody, takže
  `checkSonLeader` / `sonShare` / `departWithSon` / `sonDeparturePreview` berou volitelné `fatherId`
  (zemřelý otec = `son.fatherId`): synové otce jsou vojvoda i bratři, dílníci se počítají jako
  množina (vojvoda jednou, otec už neděluje), nástupce zůstává. Bez `fatherId` se chování nemění.
  `afterFuneral` navíc pojmenuje syna bez jména (`name` z panelu, nebo `generateName` →
  `generatedLineName`), zapne správce **mateřské vsi** (`setStewardOn`) a řídí správce na cestě
  (`stewardOnTheWay`: hráč false, auto true). `followPlayerLord` přepíše `House.lord` na novou ves.
- **Use-case** `application/player-departure.ts`: `choosePlayerDeparture` (ve lhůtě `today <
deadlineDay`; vyrazí hned, správce na cestě vypnutý, první zemnici umístí hráč; selhání – cizí mapa,
  chybějící jméno – pending ponechá; po úspěchu `clearPendingDeparture`) a `autoPlayerDeparture`
  (`today >= deadlineDay`; směry z `stewardDirections`, přeskočí vlastní ves / cizí mapu; seedy
  `deriveSeed(seed vsi, 'departure:' + deathDay)`; syn nebo ves zanikly → pending se smaže, nástupnictví
  rozhodne znovu). Opakování nic nezdvojí – syn už ve vsi není. `settleSuccessionOf` je volá všude
  tam, kde se volá `resolveSuccessionOf`. Pozn.: odchod po lhůtě proběhne v den dopočtu, ne přesně
  v `deadlineDay` (ves je už dopočtená do dneška).
- **Právo** akce `choosePlayerDeparture` je `sendSons` (`ACTION_RIGHTS`): hráčův muž žije v mateřské
  vsi, takže `villageRights` mu dává všechna práva (`dependsOnDynasty` je u vlastní vsi false) a
  `sendSons` je nejbližší význam (odchod syna s dílem); ves navíc ověřuje use-case (`pending.villageId`).

## Dosazení vojvody do vsi bez muže rodu (seniorate.md – Ves bez muže rodu; úloha 2.6)

- **Stav** `VillageState.awaitingLord?: { sinceDay; appointee?: { fromVillageId, personId,
arrivesDay } }` (volitelné). Nastaví ho `succeedLord` (`succession.ts`), když po smrti vojvody
  není ve vsi žádný muž rodu (`dynasty.lordId = null`); starší ves bez vojvody ji dostane z
  `withAwaitingLord` (v seznamu převodů za `withDynasty`; den = `dynasty.endedDay`, jednou
  a idempotentně, jen když `lordId === null`).
- **Doména** `domain/village/people/appoint-lord.ts` (čisté funkce): `appointCandidate(villages,
targetVillageId, day, exclude)` – nejstarší muž rodu od `APPOINT_LORD.minAge` (16) let v jiné
  živé vsi, který není vojvodou své vsi, jejím nástupcem (`successorOf`) ani v `exclude` (hráčův
  muž), a nikdo z jeho rodiny není pryč (`familyAway(state, personId, day)` – `isAway`; výprava,
  tažení…); shoda → nižší id osoby, pak vsi; ves bez vojvody kandidáty nedává. `finishDeparture`
  (use-case) s odchodem čeká, dokud `familyAway`; `checkEnnoble` odmítne `familyAway`.
  `rehomePeople` obranně maže `away` druhu `journey` (expeditions.md – Doma mezitím). `departAppointee(state,
day, personId, toVillageName)` – muž, jeho manželky a svobodné děti (`AppointeeParty`), jídlo
  `leavingFood` (25 kg na člověka od 7 let, nejvýš zásoby vsi), `removePeople`, kronika `lord-sent`.
  `settleAppointee(state, day, party)` (mutuje) – nová id z `nextId`, vazby uvnitř družiny
  převedené, rodiče mimo družinu zapomenuti, jídlo do zásob, `moveIntoManor`, `dynasty.lordId` +
  `lords`, smazání `endedDay` a `awaitingLord`, kronika `lord`. **Ves, která už vojvodu má**
  (příjezd přišel pozdě): družina se přijme (lidé už z domova odešli) a žije v dvorci jako ostatní
  muži rodu, kronika `line-arrived`, vojvoda se nemění. Číslo cesty `APPOINT_LORD.daysPerMapStep`
  (2 dny na mapu) je v `rules-lord.ts`.
- **Schránka:** tělo `lord-arrives` (`inbox.ts`) volá `settleAppointee` na začátku dne příjezdu;
  vymřelá, opuštěná i putující ves událost nepoužije (dopočet je přeskočí).
- **Use-case** `application/appoint-lord.ts` `appointLords(deps, { playerId, today })`: pro každou
  živou ves hráče s `awaitingLord` bez `appointee` najde kandidáta (bez něj ves čeká a zkusí se při
  dalším volání), 1. verzovaně zapíše `appointee` do cílové vsi (`arrivesDay = today + 2 ×
cellDistance` sídel), 2. spočte družinu a pošle `lord-arrives` do schránky cíle (`ref`
  `appoint:<cílová ves>:<sinceDay>` – druhý zápis se zahodí), 3. uloží zdrojovou ves bez družiny.
  Přerušení mezi kroky dokončí další volání (cíl s `appointee`, jehož muž je ještě ve zdrojové vsi).
  Volá se v `settleSuccessionOf` (`player-departure.ts`) – tedy na stejných místech jako nástupnictví
  hráče: web `dynastyForVillage`, `advanceDynasty`, worker `closeAtDay`. Testy:
  `domain/village/people/__tests__/appoint-lord.test.ts` (včetně dopočtu po kouscích 1 / 3 / 10),
  `application/__tests__/appoint-lord.test.ts`.
- **Kronika** (`village-view-chronicle.ts`): `lord-sent` – „… odešel vládnout do vsi X.“ (ve vsi
  odkud), `lord` – „Vojvodou se stal …“ (ve vsi kam), `line-arrived`.

## Povýšený vesničan

Muž (s manželkou a svobodnými dětmi) putuje do vsi bez vojvody schránkou jako dosazený vojvoda (`noble-arrives`,
`Person.noble`, `VillageState.nobles`) – podrobnosti a pravidla v [vassalage.md](vassalage.md#povýšení-vesničana-a-npc-rod-vassalagemd--povýšení-vesničana-úloha-49).

## Křest a víra (christianity.md – Křest rodu; plán 2026-11-10 – K4)

- **Stav:** `Person.faith?: 'christian'` (chybí = pohan), `VillageState.faith?: VillageFaith` –
  `rodBaptizedDay` (křest rodu hráče, kterému ves patří) a `nobles: { houseId, baptizedDay }` (křest
  NPC rodu, který ves řídí – `VillageState.nobles`). `rodBaptized(state)` (`faith.ts`): ves NPC rodu
  podle jeho křtu, jinak podle rodu hráče – po konci NPC rodu (`endNobleHouse`, dosazení vojvody)
  platí zase křest rodu hráče, nic se nepřepočítává (návrh Clauda). Starší vsi nic nemají – převod
  netřeba.
- **Use-case** `baptizeLord` (`application/baptize.ts`): právo `ennoble` (jen držitel vlastní vsi),
  důvody `BAPTIZE_REASONS` (rod nezná, už pokřtěný, vojvoda rodu `House.lord` žije jinde); nejdřív
  `sendRodBaptized` (`advance-christianity.ts`), pak `markBaptized`.
- **Ves** (`domain/village/people/baptism.ts` `baptizeVillage`, ze schránky `rod-baptized`; idempotentní):
  rod hráče – den do `faith.rodBaptizedDay`; s `lord` a bez `nobles` se vojvoda (`currentLord`)
  pokřtí (kronika `lord-baptized`), zůstane mu hlavní manželka (zemřela-li, napřed
  `ensureMainWives`) a ostatní ztratí `spouseId` (kronika `wives-released` s počtem) – zůstávají
  ve svých domech, mohou se vdát (`isSingle`), z rodiny vojvody (`lordFamily`) zmizí; jejich synové
  zůstávají `line`. Z přeplněného domu odcházejí jako vdovy po vojvodech (`lordWidows` – svobodná
  matka dítěte kteréhokoli vojvody z `dynasty.lords`). NPC rod (`npc`) – jen ve vsi, kterou ještě
  řídí: `faith.nobles` a křest hlavy vsi bez kroniky.
- **Pokřtěný rod ve vsi:** `extraWivesDay` nic nepřidá (ani za nástupce narozeného před křtem);
  dítě je křesťan, je-li křesťan aspoň jeden rodič (`populationDay`).
- **Nová ves rodu:** `departLeavers` dá osadníkům `Settlers.rodBaptizedDay`, `travellingVillage`,
  `settlersOf` a `foundVillage` ho nesou (`faithOfSettlers` – bez `desecrated`); ves na cestě
  použije ze schránky jen `rod-baptized` bez `lord` (`withJourneyInbox`; `arrive` v `simulate.ts`
  – při příjezdu se správcem jen dny před založením, ať den křtu přinesou osadníci).
- **Změna držitele vsi** (odúmrť, postoupení, věnování dílu – `vassalage.md` – Převod držitele):
  `acceptHolderTransfers` (`application/escheat.ts`, 2. krok převodu pod zámkem nového držitele –
  `advancePlayer`, `advanceDynasty`, `transferVillages`) dá vsím převzatých sídel křest nového rodu
  (`withHolderFaith(state, House.baptizedDay)` v `faith.ts`): pokřtěný → jeho den křtu, jinak
  `rodBaptizedDay` zmizí. `desecrated` zůstává (lid si zničená místa pamatuje) a `nobles` také.
  Verzovaný zápis, beze změny nic neukládá (návrh Clauda). Událost `rod-baptized` starého rodu,
  která ve schránce čeká na den po křtu, by ves převzatou ještě před ním označila – okno jednoho
  dne se neřeší.
- **Obrácení vesničanů** (`conversion.ts`, 1. 1., jen `rodBaptized`) a štěstí pohanů a křesťanů:
  `village-core.md` – Víra a štěstí. Kostrové pohřby a hřbitov po křtu: `village-buildings.md`.
- **Testy:** `domain/village/people/__tests__/baptism.test.ts` (i vcelku = po kouscích přes JSON),
  `faith.test.ts` (`withHolderFaith`), `application/__tests__/baptize.test.ts`,
  `escheat.test.ts` (víra vsi při změně držitele).

## Dočasné ubytování (demolition.md – Obydlí s obyvateli)

Soubor `domain/village/people/displaced.ts`, stav `VillageState.displaced?: DisplacedHousehold[]`
(`household` = id původního obydlí, `day`, `people: { id, host }[]`).

- `vacateDwelling(next, day, id)` – vystěhuje obydlí a vrátí počet lidí, kterým chybělo místo.
  Je-li ve vsi prázdné obydlí v provozu, celá vlastní domácnost jde do nejbližšího (kronika
  `household-relocated`, bez záznamu). Jinak se skupiny (`familiesOf` + zbytek, sestupně podle
  velikosti) rozejdou do nejbližšího obydlí (čtverec vzdálenosti, pak id) s místem pro celou
  skupinu, jinak po lidech. Cizí ubytovaní téhož domu se přesunou taky a drží si záznam s novým
  `host`. Dvorec a opuštěná obydlí nehostí.
- `lodgingShortfall(state, id, day)` – totéž na klonu; `disuseBlock` z toho dělá důvod
  `noRoomReason(n)`. (`disuseBlock` má třetí parametr `day`, výchozí `state.lastDay`.)
- Dočasně ubytovaní mají `Person.dwellingId` = hostitel, tedy v simulaci jsou členy hostitele
  (návrh Clauda). `availableSettlers` je počítá mimo (`withoutDisplaced`) a přičte
  `displacedCount` – domácnost čeká na dům.
- `settleNewDwelling` napřed zkusí `rehouseDisplaced` (nejstarší záznam, pak nižší `household`);
  `occupyEmptyDwellings` záznamy uklidí (`pruneDisplaced` – mrtví a ti, co už bydlí jinde).
- V indexu je `freePlaces` exportováno jako `freeDwellingPlaces` (kolize s hřbitovem).
