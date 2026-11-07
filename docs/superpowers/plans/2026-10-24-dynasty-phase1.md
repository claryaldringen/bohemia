# Rod vojvody – fáze 1 – plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cíl:** Ves zakládá vojvoda s hlavní a třemi vedlejšími manželkami. Muži rodu (vojvoda a jeho
potomci po meči) mají jména – vojvodu a jeho syny pojmenuje hráč, vnuci dostanou jméno ze
seznamu. Muži rodu smějí mít až 4 manželky, další přicházejí z okolí. Vedlejší manželka odchází
z přeplněného dvorce do vlastního obydlí, ženatí synové odcházejí všichni a mají přednost při
osídlení. Cvičí všichni synové bydlící ve dvorci, po smrti vojvody nastoupí nejstarší syn hlavní
manželky. Vymře-li rod po meči, hra končí obrazovkou „Rod vymřel“ a vsi zaniknou.

**Architektura:** V jádře (`packages/game/src/domain/village/`) přibudou `dynasty.ts` (kdo je
muž rodu, manželky, převod, pojmenování), `dynasty-names.ts` (seznam a validace jmen),
`dynasty-wives.ts` (další manželky, nová hlavní), `dynasty-housing.ts` (odchod synů a vedlejších
manželek, přednost) a `succession.ts` (nástupnictví). Upraví se `lord.ts`, `households.ts`,
`population.ts`, `simulate.ts`, `actions.ts` (`foundVillage`) a `extinction.ts`. Use-casy
`found-village.ts`, `restart-game.ts` a nový `name-line-man.ts`. Web dostane panel jména,
upozornění, jména v panelech a obrazovku „Rod vymřel“ s kronikou rodu.

**Stack:** TypeScript (doména a use-casy – Vitest s in-memory porty
`application/__tests__/in-memory-*.ts`), Next.js (server actions, HUD), Playwright (e2e). Drizzle
se nemění – stav vsi je `jsonb` (`packages/db/src/schema/village.ts`), jméno i příznaky jsou
v JSON stavu vsi, **žádná nová tabulka ani migrace**.

**Spec:** [docs/design/lord.md](../../design/lord.md), sekce „Rod vojvody – zakladatelé, manželky,
jména, domácnost synů a konec rodu (#9, fáze 1)“ včetně Rozhodnutí a odpovědí Martina
(24. 10. 2026: „Schvaluji“). Issue #9.

## Globální omezení

- **Nové části stavu volitelné**, starší vsi se převedou jednou a idempotentně (`withDynasty`
  v řetězu převodů `advanceVillageSteps` v `simulate.ts` i `updateVillage`
  v `application/update-village.ts`, hned za `withKinship`).
- **Ves bez rodu** (`dynasty.lords` prázdné) se chová **bit po bitu jako dnes**: vojvoda je
  nejstarší muž dvorce (`householdHead`), nikdo nemá víc manželek, osídlení podle
  `leavingFamilies`, konec hry jen vymřením. Takovou ves vytvoří `foundVillage` **bez** `lord`
  (testy, staré varianty kalibrace, e2e seed přes `helpers.ts`) a převod vsi bez jediného muže.
  Díky tomu se ≈ 95 testů, které volají `foundVillage`, nemění.
- **Determinismus:** nová náhoda jen ve **vlastních proudech** – `deriveSeed(state.seed,
'wife:' + day)` (další manželky), `deriveSeed(state.seed, 'line-name:' + day)` (jména vnuků).
  Proud sňatků (`'marriage:' + day`) a porodů se ve vsi bez vedlejších manželek nemění.
  Nástupnictví, stěhování a výběr hlavní manželky jsou bez náhody. Každá úloha s novou
  dynamikou má test „po kouscích = vcelku“.
- **Čísla jen v `rules-lord.ts`** (`LORD.*`) s odkazem na sekci lord.md; seznam jmen jako data
  domény v `dynasty-names.ts`.
- **Hexagon:** doména bez I/O; use-casy přes porty; server actions jen parsují a volají use-case.
- **Každá úloha končí funkční hrou:** `npm run typecheck`, `npm run lint`, `npm run test`,
  `npm run format:check`; úlohy 5–7 i `npm run test:e2e` (sériově). Výstupy ořezávat
  (`| tail -20`, `grep "Tests "`). **Nenechávat běžet procesy** (dev server jen jeden, po
  ověření vypnout).
- **Kalibraci (`measure-village`) nespouštět** – jen na Martinův pokyn (Úloha 9 ji jen připraví).
- **Vlkov a lokální DB `bohemia`:** převod proběhne při prvním dopočtu. Před Úlohou 1 zálohovat
  (`/opt/homebrew/opt/postgresql@17/bin/pg_dump -U postgres bohemia > <scratchpad>/bohemia.sql`,
  mimo repo) a dev server proti `bohemia` pouštět až po Úloze 4 (převod je úplný už v Úloze 1,
  ale nástupnictví a bydlení až ve 2–4).
- Komentáře a dokumentace česky, krátká pomlčka „–“; rozhodnutí plánu jsou „návrh Clauda“
  a patří i do lord.md (sekce Pro implementaci fáze 1).

## Datový model (návrh Clauda)

| Kde                    | Pole                                                                    | Význam                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Person`               | `name?: string`                                                         | Jméno muže rodu – trvalé, jen písmena (lord.md – Jména).                                                                                                                                                                                                     |
| `Person`               | `line?: true`                                                           | Muž rodu po meči (lord.md – Kdo patří k rodu); jen muži, nastaví se při narození synovi muže rodu.                                                                                                                                                           |
| `Person`               | `mainWifeSon?: true`                                                    | Syn ženy, která kdy byla hlavní manželkou svého muže – přednost v nástupnictví i po její smrti.                                                                                                                                                              |
| `Person.spouseId`      | beze změny typu                                                         | **U ženy** = její muž (i u vedlejší). **U muže** = hlavní manželka. Vedlejší manželka = žena, jejíž muž má `spouseId` jiný. Manželky muže = `people.filter(w => w.spouseId === man.id)`. „Nejdéle vdaná“ = nižší id (nevěsta z okolí dostává id při svatbě). |
| `VillageState`         | `dynasty?: DynastyState`                                                | `{ lordId: number \| null; lords: LordRecord[]; endedDay?: number }`. Chybí = ves před rodem (převod). `lords: []` = ves bez rodu.                                                                                                                           |
| `LordRecord`           | `{ id; name?; fromDay; toDay? }`                                        | Vojvodové po sobě pro kroniku rodu na obrazovce porážky (kronika vsi se ořezává – `CHRONICLE_MAX_EVENTS`).                                                                                                                                                   |
| `ChronicleEvent`       | nové druhy                                                              | `line-birth`, `line-named {name}`, `extra-wife {name?}`, `main-wife {name?}`, `wife-left-manor`, `son-left-manor {name?}`, `lord {name?}`, `line-ended {name?}`; `death` a `marriage` dostanou volitelné `name`.                                             |
| `rules-lord.ts` `LORD` | `maxWives`, `extraWife*`, `founders`, `nameMaxLength`, `nameGeneration` | Čísla s odkazem na lord.md.                                                                                                                                                                                                                                  |

## Přehled úloh

| #   | Úloha                                                                 | Kroků | Model  | Staré vsi                        |
| --- | --------------------------------------------------------------------- | ----- | ------ | -------------------------------- |
| 1   | Rod v jádru – příznak, jméno, převod, vojvoda, jména vnuků            | ≈ 90  | Opus   | jen data (příznaky, jména vnuků) |
| 2   | Manželky – vícežeňství, další manželka z okolí, porody, nová hlavní   | ≈ 100 | Opus   | od převodu další ženy vojvody    |
| 3   | Bydlení – odchod synů, vedlejší manželka z přeplněného domu, přednost | ≈ 100 | Opus   | ženatí synové odcházejí          |
| 4   | Výcvik a nástupnictví                                                 | ≈ 110 | Opus   | cvičí synové v dvorci, nástupce  |
| 5   | Zakladatelé a jména na serveru                                        | ≈ 100 | Opus   | beze změny                       |
| 6   | Rozhraní jmen                                                         | ≈ 120 | Sonnet | panel „Jméno vojvody“ při vstupu |
| 7   | Konec rodu                                                            | ≈ 100 | Opus   | ves bez rodu končí jen vymřením  |
| 8   | Návštěvy vedlejších manželek ve scéně (jen zobrazení)                 | ≈ 60  | Sonnet | –                                |
| 9   | Ověření – krátké simulace, invarianty, e2e, kalibrace připravená      | ≈ 70  | Sonnet | Vlkov po převodu ručně (záloha)  |

Pořadí je závazné: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Úloha 8 je volitelná (lze přeskočit
bez dopadu na ostatní).

---

## Úloha 1 – Rod v jádru: příznak, jméno, převod, vojvoda, jména vnuků

**Cíl:** Datový model rodu, převod starších vsí a jména vnuků při narození. Chování vsi se
nemění (výcvik, bydlení, sňatky jako dosud).

**Soubory:**

- `packages/game/src/domain/village/types-people.ts` – `Person.name?`, `line?`, `mainWifeSon?`
  (JSDoc s odkazem na lord.md).
- `packages/game/src/domain/village/types-state.ts` – `DynastyState`, `LordRecord`,
  `VillageState.dynasty?`.
- `packages/game/src/domain/village/types-chronicle.ts` – `line-birth`, `lord`; `death`
  s `name?`.
- **Nový** `packages/game/src/domain/village/dynasty.ts`:
  - `NO_DYNASTY: DynastyState` (`{ lordId: null, lords: [] }`), `isDynastyTracked(state)`
    (`lords.length > 0`), `isLineMan(p)`, `lineMen(state)`, `currentLord(state)` (žijící
    `lordId`, jinak `undefined`), `wivesOf(state, man)`, `mainWifeOf(state, man)`,
    `isSecondaryWife(state, woman)`.
  - `withDynasty(state)` – převod (lord.md – Převod starších vsí): jen když `dynasty` chybí;
    vojvoda = nejstarší muž dvorce (`villageManorId` z `manor.ts`) **i chlapec**; bez muže
    v dvorci nejstarší muž vsi, který se s manželkou a svobodnými dětmi přestěhuje do dvorce
    (`moveIntoManor`); bez muže ve vsi `NO_DYNASTY`. `line` vojvodovi a jeho žijícím potomkům
    po meči (`parentIndex` z `kinship.ts`, i přes zemřelé předky v `ancestors`), `mainWifeSon`
    žijícím synům vojvody. Jména: vojvoda a jeho synové **bez jména**, ostatní muži rodu
    vygenerovaná (`generatedLineName`). `lords = [{ id, fromDay: state.lastDay }]`. Nikoho
    jiného nestěhuje (Vlkov beze změny).
  - `moveIntoManor(state, man, day)` – muž, jeho manželky v domě a jejich svobodné děti do
    dvorce (použije i Úloha 4).
  - `dynastyDay(state, day): ChronicleEvent[]` – krok dne po `populationDay`: jména dnes
    narozeným mužům rodu, jejichž otec není vojvoda; `keepLordId` (dočasné do Úlohy 4:
    zemřel-li vojvoda, `lordId` = nejstarší muž rodu v dvorci, jinak `null`; `lords` doplní
    záznam).
- **Nový** `packages/game/src/domain/village/dynasty-names.ts` – `LINE_NAMES` (≈ 60
  předkřesťanských slovanských jmen – seznam z lord.md doplnit na 60), `generatedLineName(state,
day, personId)` (proud `'line-name:' + day`, jen jméno, které nenosí žijící muž rodu; vyčerpaný
  seznam → libovolné ze seznamu), `suggestLineName(seed, taken)` (pro kostku v Úloze 6).
- `packages/game/src/domain/village/population.ts` – `populationDay`, blok porodů (≈ ř. 329–363):
  chlapci muže rodu `line: true`; `mainWifeSon`, když `father.spouseId === mother.id`; kronika
  `line-birth`, je-li otec vojvoda (`currentLord`). Událost `death` s `name` zemřelého (≈ ř. 316).
- `packages/game/src/domain/village/simulate.ts` – `withDynasty` do řetězu převodů (≈ ř. 107,
  za `withKinship`); `dynastyDay` hned za `populationDay` (≈ ř. 235).
- `packages/game/src/application/update-village.ts` – `withDynasty` do řetězu převodů (≈ ř. 138).
- `packages/game/src/domain/village/actions.ts` – `foundVillage` (ř. 354): zatím vždy
  `dynasty: NO_DYNASTY` (zakladatelé přijdou v Úloze 5).
- `packages/game/src/domain/village/index.ts` – exporty.
- `packages/game/src/domain/village/__tests__/smith-golden.test.ts` a
  `craft-skill-golden.test.ts` – do odstraněných klíčů přidat `dynasty` (komentář: „ves bez
  rodu – přibude jen značka `dynasty`“). **Otisky `e92e2e86` a `f0150b51` se nesmí změnit.**

**Kroky (TDD):**

- [ ] Testy převodu (`__tests__/dynasty.test.ts`, fixtury ručně): vojvoda + synové + vnuci
      dostanou `line`; vojvoda a synové bez jména, vnuci se jménem; synové `mainWifeSon`;
      převod 2× = 1× (idempotence); dvorec jen s chlapcem → vojvoda je chlapec; dvorec bez muže →
      nejstarší muž vsi se s domácností přestěhuje; ves bez muže → `NO_DYNASTY`; nikdo jiný se
      nestěhuje (porovnat `dwellingId` všech).
- [ ] Testy narození: syn muže rodu má `line`, dcera ne; syn vojvody bez jména + `line-birth`;
      syn ženatého syna se jménem, které nenosí žijící muž rodu.
- [ ] Test determinismu: sledovaná ves N dní vcelku = po kouscích (jména i příznaky stejné).
- [ ] Implementace, převod do obou řetězů, golden testy se značkou.
- [ ] `docs/code/village-people.md` – nová odrážka **Rod vojvody** (data, `spouseId`
      u vícežeňství, převod, jména vnuků, ves bez rodu).

---

## Úloha 2 – Manželky: vícežeňství, další manželka z okolí, porody, nová hlavní

**Cíl:** Muži rodu mají až 4 žijící manželky, další jen z okolí; porody vedlejších manželek
v jejich domě; po smrti hlavní nastoupí matka dědice.

**Soubory:**

- `packages/game/src/domain/village/rules-lord.ts` – `LORD.maxWives: 4`,
  `LORD.extraWifePerYear: 0.3`, `LORD.extraWifeFromAge: 18`, `LORD.extraWifeAge: { from: 16,
to: 22 }` (lord.md – Manželky).
- **Nový** `packages/game/src/domain/village/dynasty-wives.ts`:
  - `extraWivesDay(state, day): ChronicleEvent[]` – muži rodu od 18 let s 1–3 žijícími
    manželkami v pořadí id, jeden los na muže (proud `'wife:' + day`, los vždy). Ne při
    `state.hungry`. Nevěsta: `sex: 'female'`, věk 16–22, `origin` (jako `outsideMarriages`
    v `marriage.ts`), `spouseId = man.id` (`man.spouseId` zůstává), `nextBirthFrom = day +
BIRTH_SPACING.afterWeddingDays`. Bydlí v domě muže, nepřeplní-li ho; jinak v **prázdném
    obydlí** (po kroku 6 `occupyEmptyDwellings` na prázdné obydlí žádná rodina nečeká); jinak
    nepřijde. Kronika `extra-wife` se jménem muže.
  - `ensureMainWives(state, day): ChronicleEvent[]` – muž rodu bez `spouseId` se žijícími
    manželkami: hlavní = matka nejstaršího žijícího syna se živou matkou, jinak nejnižší id;
    jejím synům `mainWifeSon`; nebydlí-li s mužem, přestěhuje se se svobodnými dětmi k němu
    (i do přeplněného). Kronika `main-wife`.
- `packages/game/src/domain/village/population.ts` – porody (`couples`, ≈ ř. 337): pro
  **vedlejší manželku** je otec žijící `spouseId` kdekoli ve vsi (mapa id → člověk jednou
  za den); ostatní páry beze změny (otec v témže domě). Přeplnění podle domu ženy (už je).
- `packages/game/src/domain/village/simulate.ts` – `extraWivesDay` hned za `arrangeMarriages`
  (≈ ř. 220); `ensureMainWives` v `dynastyDay` před `keepLordId`.
- `packages/game/src/domain/village/people-trade.ts` – `givingDwellings` / `nextFamily` /
  `nextSingle`: ves nedá muže rodu ani manželku muže rodu (návrh Clauda – rod se nesmí dát
  sousedovi; zapsat do lord.md).
- Ověřit (bez změny, test): `kinship.ts` `removePeople` (smrt muže ovdoví všechny manželky,
  smrt hlavní smaže `man.spouseId`), `marriage.ts` `isSingle` (vedlejší manželka se za živého
  muže nevdává), `food-outlook.ts` ř. 46 (výhled porodů počítá i vedlejší manželky),
  `departure.ts` ř. 277 (výprava – muž bez hlavní ženy → v nové vsi `ensureMainWives`),
  `burials.ts` ř. 67.

**Kroky (TDD):**

- [ ] `__tests__/dynasty-wives.test.ts`: nejvýš 4 žijící; v hladu nepřijde; do plného domu ne –
      jde do prázdného obydlí, bez něj nepřijde; po smrti manželky si vezme další; muži mimo rod
      nikdy; ve vsi bez rodu jsou sňatky dne stejné jako bez `extraWivesDay` (události i stav).
- [ ] Nová hlavní: matka nejstaršího syna; bez živé matky další syn; bez synů nejnižší id;
      přestěhování k muži i do přeplněného; `mainWifeSon` jejím synům.
- [ ] Porody: vedlejší manželka v jiném domě rodí; přeplnění podle jejího domu; ves bez
      vedlejších manželek – stejné losy (porovnat s kopií stavu před změnou na fixtuře).
- [ ] Výměna lidí: muž rodu ani jeho žena nejsou mezi `emigrantGroups`.
- [ ] Determinismus po kouscích (rok sledované vsi se 2 manželkami).
- [ ] `docs/code/village-people.md` – Sňatky (další manželky), Příbuzenství (asymetrické
      `spouseId`), Výměna lidí.

---

## Úloha 3 – Bydlení: odchod synů, vedlejší manželka z přeplněného domu, přednost

**Cíl:** Ve sledované vsi odcházejí z dvorce všichni ženatí synové; z přeplněného domu muže rodu
odchází vedlejší manželka s nejstarším synem; přednost při osídlení syn → vedlejší manželka →
ostatní.

**Soubory:**

- `packages/game/src/domain/village/households.ts`:
  - `familiesOf` (ř. 77): v dvorci sledované vsi drží dům vojvoda (`stays = h === lord`), ženatí
    muži rodu jsou vždy rodiny k osídlení (i nejstarší). Rodina = muž, **všechny jeho manželky
    v domě** (nový `wivesHere`) a svobodné děti. Mimo dvorec beze změny – dům vedlejší manželky
    drží ona jako vdova (`widowHolds`), ženatý syn je dědic (test).
  - `settleNewDwelling` (ř. 254) bere `settlingFamilies(state, day)[0]` místo
    `leavingFamilies(...)[0]`; `possibleNewHouseholds` (ř. 284) přičte vedlejší manželky
    z přeplněných domů → `availableSettlers` a `waitingHouseholds` („Rodina čeká na dům“,
    odemčení obydlí).
  - `loneSonOf` (ř. 170): svobodný muž rodu z dvorce sám neodchází.
  - `moveIn` – kronika `son-left-manor` (jméno) a `wife-left-manor` při odchodu z dvorce.
- **Nový** `packages/game/src/domain/village/dynasty-housing.ts`:
  - `secondaryWifeFamilies(state, dwelling, day): Family[]` – jen v přeplněném domě muže rodu:
    vedlejší manželky (a od Úlohy 4 vdovy po vojvodovi kromě matky vojvody) se svobodnými
    dětmi, od té s nejstarším synem, při shodě nižší id; kolik jich je třeba, aby dům přestal
    být přeplněný. Odešlá se nevrací (není pravidlo, které by ji vrátilo – test).
  - `settlingFamilies(state, day): Family[]` – 1. ženatí muži rodu z dvorce od nejstaršího, 2. vedlejší manželky z přeplněných domů mužů rodu (dvorec první), 3. `leavingFamilies`.
    Ves bez rodu → přesně `leavingFamilies`.
- `packages/game/src/domain/village/population.ts` – `dissolveHouseholds` /
  `dissolveTarget` (ř. 200–262): samotné děti muže rodu (nikdo od 16 let) jdou k otci i do
  přeplněného domu (lord.md – Manželky, Dům vedlejší manželky).
- `packages/game/src/domain/village/simulate-build.ts` ř. 409 – beze změny (volá
  `settleNewDwelling`), ověřit testem dostavěného obydlí.

**Kroky (TDD):**

- [ ] `__tests__/dynasty-housing.test.ts`: odcházejí všichni ženatí synové včetně nejstaršího;
      bez obydlí zůstávají; přednost syn → vedlejší manželka → ostatní (prázdné obydlí
      i dostavěné); vedlejší manželka odchází jen z přeplněného domu, ta s nejstarším synem; po
      odchodu se nevrací; ženatý syn odchází se všemi ženami; svobodný syn z dvorce neodchází
      sám; dům vedlejší manželky drží ona, ženatý syn je dědic; osiřelé děti jdou k otci.
- [ ] `waitingHouseholds` počítá vedlejší manželky z přeplněného dvorce.
- [ ] Ves bez rodu: `settlingFamilies` = `leavingFamilies` na fixturách z
      `__tests__/departure*.ts` a `households` testů (stávající testy beze změny).
- [ ] `docs/code/village-people.md` – Osídlení obydlí (přednost, dvorec bez dědice, vedlejší
      manželky).

---

## Úloha 4 – Výcvik a nástupnictví

**Cíl:** Cvičí všichni muži rodu bydlící v dvorci; vedlejší manželky vojvody vedou svou
domácnost; po smrti vojvody nastoupí nejstarší syn hlavní manželky a vrátí se do dvorce.

**Soubory:**

- `packages/game/src/domain/village/lord.ts`:
  - `lordFamily` (ř. 38): ve sledované vsi vojvoda = `currentLord`; `trainees` = muži rodu
    v dvorci od 7 let (synové všech manželek, ženatí synové čekající na dům, vnuci, bratři);
    `household` = manželky vojvody v dvorci, dcery a vnučky po meči, snachy; nové
    `LordFamily.wivesApart` = vedlejší manželky vojvody mimo dvorec (patří k rodině, jejich
    děti ne). Ves bez rodu → dnešní výpočet. `LordView` + `'dynasty'`.
  - `lordApartIds` (ř. 196) + `wivesApart`.
  - `manorLabor` (ř. 249): denní minimum domů vedlejších manželek kryjí ony jako dvorec,
    nekryté jde z práce vsi; na pole jen při hladu (`field`), na žeň ne (`harvest` jen
    `freeMen` – beze změny, Martin 24. 10. 2026: „Dílny i vojvodova rodina“).
- `packages/game/src/domain/village/morning-water.ts` `villagersToday` (ř. 19): `manorSkip`
  - domy vedlejších manželek.
- `packages/game/src/domain/village/harvest-hands.ts` – beze změny kódu; test: ve žňový den
  jdou cvičící muži (i ženatí synové v dvorci) na žeň, vedlejší manželka ne,
  `harvestHelperLabor(apart)` ji nepočítá.
- **Nový** `packages/game/src/domain/village/succession.ts` – `succeedLord(state, day):
ChronicleEvent[]` nahradí `keepLordId` v `dynastyDay`: nástupce 1. nejstarší žijící syn
  vojvody s `mainWifeSon` (i chlapec), 2. nejstarší syn vojvody, 3. nejstarší vnuk po meči, 4. nejstarší muž rodu ve vsi. Stěhování (`moveIntoManor`): nástupce s hlavní manželkou a jejími
  svobodnými dětmi; vedlejší se svobodnými dětmi, vejdou-li se (nižší id první); nezletilý
  s matkou a sourozenci do 16 let. `lords` – `toDay` starému, nový záznam. Bez nástupce
  `lordId = null` (konec rodu – Úloha 7). Kronika `lord`.
- `packages/game/src/domain/village/marriage.ts` `holdsHome` (ř. 86) – matka nezletilého vojvody
  drží dvorec (ženich se přižení k ní); test.
- `packages/game/src/domain/village/dynasty-housing.ts` – vdovy po vojvodovi (kromě matky
  vojvody) jako vedlejší manželky při přeplnění dvorce, před vedlejšími manželkami nového
  vojvody.
- Scéna a role (aby se nezobrazovalo špatně): `apps/web/lib/village-view-scene.ts` ř. 334
  a `apps/web/lib/scene/villager-plan-lord.ts` `lordFigures` (ř. 213) – na dvorku jen lidé
  z dvorce; `apps/web/lib/person-roles.ts` – `RoleHomes.lordId` (vojvoda podle
  `dynasty.lordId`, ne nejstarší muž dvorce); `apps/web/lib/manor-view.ts` ř. 164 beze změny.

**Kroky (TDD):**

- [ ] `__tests__/lord-dynasty.test.ts`: cvičí synové obou manželek v dvorci; syn s matkou mimo
      dvorec necvičí a je v práci vsi; ženatý syn v dvorci cvičí; vedlejší manželka mimo dvorec
      v `lordApartIds` a kryje minimum svého domu; vojvoda cvičí i ve stáří (3 h).
- [ ] `__tests__/succession.test.ts`: syn hlavní i po smrti matky; chlapec hlavní před dospělým
      synem vedlejší; bez nich syn vedlejší; pak vnuk; pak bratr; stěhování nástupce
      a vedlejších, jen vejdou-li se; nezletilý vojvoda s matkou; vdovy zůstávají, přeplnění řeší
      Úloha 3; bez nástupce `lordId = null`.
- [ ] Žně – test s `manorLabor` a `harvestHelperLabor`.
- [ ] Stávající `lord-day.test.ts`, `lord-sowing.test.ts`, `horse-*.test.ts` beze změny
      (ves bez rodu).
- [ ] Determinismus po kouscích přes smrt vojvody.
- [ ] `docs/code/village-people.md` – Vojvodova rodina (ř. 42 – kdo cvičí, `wivesApart`,
      nástupnictví); `docs/code/village-fields.md` – žně a rodina (jen věta o vedlejších
      manželkách).

---

## Úloha 5 – Zakladatelé a jména na serveru

**Cíl:** Nová ves z webu zakládá vojvoda (25) s hlavní (22) a vedlejšími (20, 18, 16)
manželkami; jméno vojvody přichází se založením; hráč pojmenuje syna akcí.

**Soubory:**

- `packages/game/src/domain/village/rules-lord.ts` – `LORD.founders: { lordAge: 25, wifeAges:
[22, 20, 18, 16] }`, `LORD.nameMaxLength: 20`.
- `packages/game/src/domain/village/actions.ts` `foundVillage` (ř. 354): vstup `lord?: { name?:
string }` → 5 zakladatelů (id: vojvoda, hlavní, vedlejší podle věku), `spouseId` dle modelu,
  `nextBirthFrom` všem manželkám, `line` a `name` vojvodovi, `dynasty = { lordId, lords: [{ id,
name, fromDay: day }] }`. Všichni na staveništi a pak v první zemnici (5 ze 6 míst). Bez
  `lord` dnešní dva páry (`START_AGES`) + `NO_DYNASTY`. Osadníci (`settlers`): `lordId` =
  nejstarší muž rodu mezi nimi, bez něj `NO_DYNASTY` (návrh Clauda – rod ve víc vsích řeší
  fáze 2–4).
- `packages/game/src/domain/village/dynasty-names.ts` – `normalizePersonName` (NFC, ořez),
  `checkPersonName(name): PlacementCheck` – `/^\p{L}+$/u`, 1–20 znaků (počítat
  `[...name].length`), důvody „Jen písmena“, „Nejvýš 20 písmen“, prázdné „Vojvoda potřebuje
  jméno“ (vzor `checkVillageName` v `names.ts`).
- `packages/game/src/domain/village/dynasty.ts` – `nameLineMan(state, personId, name, day)` –
  žijící muž rodu bez jména, jinak důvod; trvalé; u vojvody doplní `lords`; kronika
  `line-named`.
- `packages/game/src/domain/village/marriage.ts` `wed` (ř. 190) – událost `marriage` se jménem
  muže rodu („Svatba – Bořivoj“).
- `packages/game/src/application/found-village.ts` – `FoundVillageInput.lordName?: string`,
  ověření v `foundVillageForSettlement`, `foundedVillageState` předá `lord: { name }` – **web
  zakládá vždy ves s rodem** (bez jména vojvoda na jméno čeká); `foundAnotherVillage`
  a osadníci beze změny.
- **Nový** `packages/game/src/application/name-line-man.ts` – `nameLineMan(deps, { villageId,
today, landscape, personId, name })` přes `updateLivingVillage`; export v `index.ts`.
- `apps/web/lib/village-input.ts` – `parseFoundVillageInput` (ř. 71) + volitelné `lordName`;
  nový `parseNameLineManInput`.
- `apps/web/lib/village.ts` – `foundVillageForPlayer` (ř. 250) předá `lordName`; nový
  `nameLineManForPlayer` (vzor `renameVillageForPlayer`, ř. 420).
- `apps/web/app/game/actions.ts` – `foundVillage` (ř. 170) beze změny podpisu; nová akce
  `nameLineMan` (vzor `renameVillage`, ř. 324).

**Kroky (TDD):**

- [ ] `__tests__/dynasty-founders.test.ts`: 5 lidí, věky, hlavní a vedlejší, všichni
      v zemnici; zásoby a stáda z potřeby 5 lidí (`foundingLivestock`, `annualNeed`); rodina
      pracuje (`familyTrains` false); žádný porod před 9 měsíci; bez `lord` přesně dnešní stav
      (+ `NO_DYNASTY`).
- [ ] `checkPersonName`: „Mrdomír“, „Ярослав“, NFC složené znaky ok; „Bořivoj II“, „Bo-ři“,
      „Bořivoj1“, 21 písmen ne; okrajové mezery se oříznou.
- [ ] `nameLineMan`: jen žijící muž rodu bez jména; podruhé odmítne; vojvoda → `lords`.
- [ ] Use-case testy s `in-memory-villages.ts`: založení s neplatným jménem → důvod; pojmenování
      syna; ves jiného hráče odmítne (`villageId` přes `actOn`).
- [ ] `apps/web/lib/__tests__/village-input.test.ts` – nové parsery.
- [ ] `npm run test:e2e` – zakládání přes UI (bez jména) projde s 5 zakladateli (např. test
      „obydlí jde stavět, jen když je kým ho osadit“ v `e2e/village.spec.ts` ř. 367).
- [ ] `docs/code/village-people.md` – Založení vsi (zakladatelé rodu); `docs/code/web-ui.md` –
      server actions (`nameLineMan`, `lordName`).

---

## Úloha 6 – Rozhraní jmen

**Cíl:** Panel „Jméno vojvody“ před první zemnicí a u vojvody bez jména, upozornění „Syn vojvody
čeká na jméno“, jména v panelech osoby a dvorce, nové role.

**Soubory:**

- `apps/web/lib/village-view.ts`, `village-view-types.ts` – `VillageView.dynasty?: { lordId;
lordName?; unnamed: { id; age; lord: boolean }[] }` (žijící muži rodu bez jména od
  nejstaršího – fronta se neukládá).
- `apps/web/lib/person-view.ts` `scenePersons` (ř. 49) a `selection-details.ts` – `name`.
- `apps/web/lib/person-roles.ts` – role `voivode-secondary-wife` („Vojvodova vedlejší žena“)
  v `PersonRole` a `ROLE_NAMES`; `RolePerson.name?`.
- **Nový** `apps/web/components/game/hud/LineNamePanel.tsx` – portrét (`PersonPortrait`
  z `selection/people.tsx`), popisek „Jméno vojvody“ / „Jméno syna“, textové pole, kostka
  (`suggestLineName`, popisek „Navrhni jméno“), fajfka i Enter; důvod u kurzoru z
  `checkPersonName` (Tooltip). Výjimka z „bez popisků“ jen pro textové pole (lord.md).
- `apps/web/components/game/VillageGame.tsx` – bez vsi panel před umístěním zemnice (ř. 564:
  `foundVillage({ name, lordName, dwelling })`); vojvoda bez jména (převod, výprava) → panel;
  po „Začít znovu“ předvyplnit posledním jménem ze `sessionStorage` (`try/catch`, návrh
  Clauda – bez nového portu DB).
- `apps/web/lib/village-notices.ts` – druh `line-name` („Syn vojvody čeká na jméno“, s počtem);
  `apps/web/components/game/hud/NoticeLines.tsx` – trvalé upozornění (nezmizí po `NOTICE_MS`,
  ř. 31), klik otevře panel na nejstaršího čekajícího; „Rodina čeká na dům“ – jména čekajících
  synů v popisku.
- `apps/web/components/game/hud/selection/people.tsx` `PersonBody` (ř. 117) – jméno jako první
  řádek nad rolí; popisek portrétu a postavy „Bořivoj – vojvodův syn“.
- `apps/web/lib/manor-view.ts` + `apps/web/components/game/hud/ManorPanel.tsx` `ManorFamily`
  (ř. 232) – jména v popiscích ikon („Bořivoj – Lukostřelba 64 / 100“).
- Popisek domu vedlejší manželky jmenuje vojvodu (`selection-details.ts`).
- `apps/web/e2e/village.spec.ts` – helper `found()` (ř. 265) vyplní jméno vojvody; nový test.

**Kroky (TDD):**

- [ ] `apps/web/lib/__tests__/village-notices.test.ts` – `line-name` s počtem; bez čekajících
      nic.
- [ ] Role a jména: test `personRoles` (vedlejší manželka, vojvoda podle `lordId`).
- [ ] `components/game/hud/__tests__/LineNamePanel.test.tsx` (vzor `ManorPanel.test.tsx`) –
      důvod u neplatného jména, kostka vyplní, Enter potvrdí.
- [ ] e2e: nový hráč – panel, „Bořivoj1“ ukáže důvod, kostka, potvrzení, zemnice, jméno v panelu
      vojvody; seed syna bez jména → upozornění → pojmenování → jméno v panelu osoby.
- [ ] `docs/code/web-ui.md` – Jména rodu (panel, upozornění, předvyplnění).

---

## Úloha 7 – Konec rodu

**Cíl:** Zemře-li poslední muž rodu ve všech vsích hráče, hra končí: vsi se přestanou dopočítávat
(„Ves opuštěna – rod vymřel“), obrazovka „Rod vymřel“ s kronikou rodu, Začít znovu.

**Soubory:**

- `packages/game/src/domain/village/succession.ts` / `dynastyDay` – nezbyl-li ve vsi muž rodu
  (smrt, výprava), `dynasty.endedDay = day`, kronika `line-ended` se jménem posledního.
  Ves žije dál jako ves bez vojvody (rod může žít v jiné vsi hráče).
- `packages/game/src/domain/village/extinction.ts` – `isLineExtinct(villages)`: některá ves je
  sledovaná a žádná ves nemá žijícího muže rodu; `isGameOver` (ř. 18) navíc `||
isLineExtinct`; `lineEndDay(villages)` = nejpozdější `endedDay`. Převod hru neukončí (ves bez
  muže → `NO_DYNASTY`).
- `packages/game/src/domain/village/departure.ts` – `abandonForLineEnd(state, day)`:
  `abandonedDay = day`, kronika `village-abandoned` s důvodem „rod vymřel“ (nové pole
  `reason?: 'line-ended'`); lidé zůstanou jako záznam, `isVillageDormant` ves zastaví.
- `packages/game/src/application/restart-game.ts` – `dynastyStatus` (ř. 41): po dopočtu
  vyhodnotí rod; vymřel-li, každá žijící ves `abandonForLineEnd(lineEndDay)` a uloží se
  (`updateVillage`); `restartGame` (ř. 82) – podmínka `!status.gameOver` místo „některá ves
  nevymřela“.
- `apps/web/lib/village-view.ts` (ř. 281, 293) – `VillageView.lineEnded?: { lords: { name?;
fromYear; toYear }[]; last?: string; village; years }`; scéna opuštěné vsi bez lidí, dýmu
  a zvířat (ověřit `village-view-scene.ts` pro `abandoned` se žijícími lidmi ve stavu).
- `apps/web/components/game/hud/DefeatScreen.tsx` – varianta s kronikou rodu („Bořivoj
  500–541“, „Zemřel Ctibor – poslední muž rodu“), jméno a roky vsi, jediné „Začít znovu“;
  uloží jméno zakladatele do `sessionStorage` pro předvyplnění (Úloha 6).
- `apps/web/components/game/VillageGame.tsx` ř. 1132–1140 – třetí větev obrazovky porážky.

**Kroky (TDD):**

- [ ] nový `__tests__/line-end.test.ts`: konec po smrti posledního
      muže rodu i dítěte; ženy rodu rod nedrží; rod v druhé vsi hru drží; ves bez rodu končí jen
      vymřením; `endedDay` nezávisí na kouscích.
- [ ] `application/__tests__/restart-game.test.ts`: rod vymřel → `gameOver`, vsi opuštěné
      a uložené, restart bez `abandon` povolen; živý rod → restart odmítne.
- [ ] e2e: seed sledované vsi, odstranit muže rodu (`writeVillageState` jako test ř. 648) →
      „Rod vymřel“ s kronikou → Začít znovu → panel „Jméno vojvody“ předvyplněný.
- [ ] `docs/code/village-core.md` (konec hry) a `docs/code/web-ui.md` (obrazovka porážky).

---

## Úloha 8 – Návštěvy vedlejších manželek ve scéně (volitelná, jen zobrazení)

**Cíl:** Večer po výcviku jde vojvoda po pěšinách k domu jedné vedlejší manželky (střídá je
po dnech – `day % počet`, podle id), ráno se vrátí. Výcvik ani práce se nemění.

**Soubory:** `apps/web/lib/scene/villager-plan-lord.ts` (`lordFigures`, ř. 213),
`apps/web/lib/village-view-scene.ts` (domy `wivesApart` do pohledu), případně
`villager-plan-traffic.ts` (trasa po pěšinách).

**Kroky:** test plánovače (večerní cíl, střídání, bez vedlejších manželek beze změny); ověření
ve scéně jedním snímkem na konci; `docs/code/village-people.md` – Vojvodova rodina na dvorku.

---

## Úloha 9 – Ověření

**Kroky:**

- [ ] `packages/game/src/domain/village/__tests__/dynasty-smoke.test.ts` – ves se zakladateli
      5 let (pod 30 s, jinak 3 roky): každý rok invarianty – nejvýš 4 žijící manželky; žena se
      `spouseId` má žijícího muže; `man.spouseId` → žena, jejíž `spouseId` je on; každý muž
      rodu kromě zakladatele má otce v rodu (`parentIndex`); jméno mají všichni muži rodu kromě
      čekajících synů vojvody; vedlejší manželka v přeplněném dvorci jen bez volného obydlí.
      Determinismus: 5 let vcelku = 2 + 3 roky.
- [ ] `packages/game/scripts/measure-village.ts` – volba `--founders dynasty|pairs` (výchozí
      `dynasty`); `scripts/lib/lord-columns.ts` – muži rodu, manželky, čekající vedlejší
      manželky, podíl práce rodiny a oprav jejích domů, vymření rodu (lord.md – Dopad na
      kalibraci). **Jen připravit, nespouštět** – příkaz do lord.md (Příkaz na noc).
- [ ] Celá kontrola: `typecheck`, `lint`, `test`, `format:check`, `test:db`, `test:e2e`
      (sériově, výstupy ořezat).
- [ ] Vlkov ručně (po záloze DB): jeden dev server, vojvoda a synové bez jména → panel
      a upozornění s počtem, nikdo se nepřestěhoval, vnuci se jménem; server vypnout.
- [ ] lord.md – Stav fáze 1 „implementováno“, návrhy Clauda z plánu (výměna lidí, nejdéle
      vdaná = nižší id, ves z výpravy bez muže rodu, `sessionStorage`, `foundVillage` bez
      `lord`) do sekce Pro implementaci fáze 1.

---

## Rizika

1. **Zlaté otisky simulace:** `smith-golden.test.ts` (`e92e2e86`) a `craft-skill-golden.test.ts`
   (`f0150b51`) zakládají ves přes `foundVillage` bez `lord` → ves bez rodu, přibude jen klíč
   `dynasty` (odstranit při hashování). **Otisk se nesmí změnit** – změna znamená, že ves bez
   rodu se chová jinak (chyba). Otisky krajiny a překážek se nemění (žádná vrstva). Kalibrační
   základ `measure-village` se změní záměrně (5 zakladatelů) – srovnání jen s `--founders
pairs`.
2. **Ručně stavěné fixtury bez `dynasty`** projdou převodem a stanou se sledovanými – od Úloh
   2–4 v nich vojvoda bere další ženy (vlastní los), ženatí synové odcházejí z dvorce. Oprava:
   do fixtury `dynasty: NO_DYNASTY`, pokud test není o rodu – **ne** měnit očekávání. Seznam
   upravených testů do těla commitu.
3. **Kinship invarianty – vícežeňství v `spouseId`:** symetrie platí jen pro hlavní manželku.
   Místa s předpokladem symetrie: `households.ts` (`wifeHere`, `unmarriedHere`, `familiesOf`),
   `population.ts` (porody – otec v domě), `lord.ts` ř. 64–65, `food-outlook.ts` ř. 46,
   `burials.ts` ř. 67, `departure.ts` ř. 277, `people-trade.ts`, `marriage.ts` ř. 31
   (`isSingle`), `apps/web/lib/person-view.ts` ř. 61 a `person-roles.ts`. Invarianty hlídá
   test v Úloze 2 a smoke test v Úloze 9.
4. **Determinismus:** nové losy jen ve vlastních proudech; pořadí losů porodů se mění jen ve vsi
   s vedlejšími manželkami. Testy po kouscích v Úlohách 1, 2, 4, 7 a 9.
5. **Výkon:** `lordFamily` se volá mnohokrát za den (`lordApartIds` z `morning-water.ts`,
   `craft-buying.ts`, `simulate-plan.ts`, `herding.ts`, `simulate-work.ts`) – vedlejší manželky
   jsou další průchod lidmi; `settlingFamilies` při každém prázdném obydlí; `availableSettlers`
   už volá `withKinship`. Měřit dobu `npm run test` před a po; cache na den (WeakMap stav → den)
   jen, když se zpomalení ukáže.
6. **e2e založení vsi:** všechna zakládání přes UI jdou přes `found()` v `village.spec.ts` –
   panel jména vyřeší helper. Pět zakladatelů může změnit testy osídlení a počtů lidí (Úloha 5).
   E2e seed přes `helpers.ts` (`foundVillage` bez `lord`) dá ves bez rodu – panel se neukáže.
7. **Převod Vlkova:** proběhne jednou při prvním dopočtu – záloha DB před Úlohou 1, dev server
   proti `bohemia` až po Úloze 4.
8. **Konec rodu u víc vsí:** vsi se dopočítají k dnešku a teprve pak se vyhodnotí rod –
   `abandonedDay` = den smrti posledního muže rodu, stav vsi za ním je jen záznam (návrh Clauda,
   herní výsledek nemění).
9. **Hlad a kalibrace:** 4 plodné ženy od prvního roku – riziko hladu 2.–3. rok a přeplněného
   dvorce; ověří kalibrace na Martinův pokyn (lord.md – Dopad na kalibraci a hlad).

## Mimo plán

- Fáze 2–4 (dělení vsi, NPC, seniorát), rod ve víc vsích, náhoda „bez pozvánky“.
- Kronika v rozhraní (data budou připravená v událostech a `dynasty.lords`).
- Změna jména (jméno je trvalé).
