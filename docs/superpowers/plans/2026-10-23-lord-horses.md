# Vojvodova rodina a koně – plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cíl:** Vojvoda a jeho synové nepracují na poli. Cvičí lukostřelbu, boj a jízdu na koni. Žena,
dcery a snachy vedou jen domácnost dvorce. Na pole jde rodina jen při hrozícím hladu. Na dvorku
dvorce stojí terče. Ves chová koně v ohradě koní, stará se o ně z práce vsi, krmí je senem
a obilím, kupuje a prodává je. Koně se cvičí pod jezdci. Jezdci jsou ve scéně vidět už teď.

**Architektura:** V jádře (`packages/game/src/domain/village/`) přibude:

- `lord.ts` + `rules-lord.ts` – kdo patří k rodině, den rodiny, dovednosti, kdy jde rodina na pole;
- `horses.ts` + `horse-trade.ts` + čísla v `rules-livestock.ts` a `rules-trade.ts` – koně po
  kusech v ohradě koní (jako voli v ohradě volů), péče, krmení, chov, výcvik koně, obchod.

Scéna (`apps/web/lib/scene/`) dostane cvičiště na dvorku, rodinu při výcviku, ohradu koní, koně
a jezdce. Rozhraní dostane role, dovednosti, druh ohrady Koně, panel ohrady koní a tři řádky
obchodu.

**Stack:** TypeScript (doména, Vitest s in-memory porty), Next.js a Babylon (scéna), Blender
(`tools/blender/fauna_from_0ad.py`, `people_from_0ad.py`). Drizzle se nemění – stav vsi je JSON.

**Spec:** [docs/design/lord.md](../../design/lord.md) (#8) a
[docs/design/horses.md](../../design/horses.md) (#5) – obojí schváleno (Martin 23. 10. 2026:
„Schvaluji, implementuj“). Čísla zdůvodňuje
[rešerše](../../design/research/2026-10-23-horses-lord.md).

## Globální omezení

- **Nové části stavu volitelné**, starší vsi se převedou jednou a idempotentně:
  - `Person.arms?` – dovednosti; chybí = 0, převod netřeba.
  - `VillageState.lord?` – režim rodiny (pole / výcvik, hystereze); chybí = výcvik.
  - `YearPlan.lordHelp?` – podíl dne rodiny na potřebném osevu; chybí = 0.
  - `PenSpecies` + `'horse'`, `Pen.horses?` – ves bez ohrady koní beze změny.
  - `HayState.winter.horsesNeedKg?` / `horsesEatenKg?`.
  - `TradeGood` + `'foals' | 'mares' | 'ridingHorses'`.
  - Uložené zásoby sousedů (`NeighbourStock`) bez koní – koně v nich přibudou při doplnění 1. 11.
- **Determinismus:** všechno je čistá funkce stavu a dne. Pohlaví hříběte a věk koupeného koně
  ze seedu vsi a dne (`deriveSeed`), jako ostatní náhoda vsi. Dovednosti a výcvik koně rostou
  deterministicky bez náhody. Výsledek nezávisí na tom, po jakých kouscích se ves dopočítá.
- **Čísla jen v `rules*.ts`** s odkazem na sekci návrhu (`lord.md – …`, `horses.md – …`).
- **Ves bez koní se nemění bit po bitu** (úlohy 4–7). Zlaté otisky to hlídají.
- **Hráč nic nezadává** – rodina i ves se rozhodují samy. Ohrada koní je stavba hráče, nic
  neblokuje (jen cena předem).
- **Scéna:** jezdec nepřidá vertex atribut (postava má 8 vertex bufferů). Babylon jen z modulů.
  Kreslí se jen při změně. Jedoucí jezdec nastaví `needsRender`, stojící ne.
- **Grafika** jen z 0 A.D. (CC BY-SA 3.0, Wildfire Games) nebo CC0. Každý soubor zapsat do
  `LICENSES.md` vedle něj.
- **Kalibraci (`measure-village`) nepouštět.** Úloha 14 připraví příkaz na noc.
- Každá úloha končí zeleným `npm run typecheck`, `npm run lint`, `npm run test`
  a `npm run format:check`. Úlohy se scénou a rozhraním navíc `npm run test:e2e`.
- Rozhodnutí v kódu a dokumentech: Martinova slova s datem, ostatní jako „návrh Clauda“.

## Otázky před úlohou 2 (rozhodne Martin, výchozí volba je návrh Clauda)

1. **Zakládání vsi.** Nová ves má jednu domácnost – zakladatele v první zemnici, a ta je dvorcem
   (`foundVillage`, `START_AGES` 25/25/13/12). Vojvoda (25) by cvičil a jeho žena (25) vedla jen
   domácnost. Ves by neměla nikoho, kdo staví první zemnici a obydlí. Chlapec (13) a dívka (12)
   nejsou děti vojvody (rodiče neznámí), dospějí za rok.
   **Rozhodnuto (Martin 24. 10. 2026: „Až má ves ≥ 4 dospělé mimo rodinu“), hystereze návrh
   Clauda (zpět k práci pod 3, `LORD.keepVillageAdults`).** Rodina cvičí, jen když má ves **mimo rodinu aspoň 4 dospělé**
   (`LORD.minVillageAdults` – „čtyři dospělí pro nové obydlí“). Do té doby pracuje jako dosud.
   Je to čistá funkce stavu a dne. Bez tohoto pravidla se ves nezaloží.
2. **Vojvodou se stane zeť.** Po smrti vojvody bez syna je vojvodou nejstarší muž dvorce
   (`isHouseholdHead` v `burials.ts`), třeba zeť. **Návrh Clauda:** rodina = nový vojvoda a jeho
   potomci po meči v dvorci. Jeho výcvik začne od nynějška (dovednosti od 0, nebo co mu zůstalo).
   Synové předchozího vojvody v dvorci zůstanou rodinou jen jako jeho potomci, jinak jsou rolníci.
   **Martin 24. 10. 2026: „Tohle pořešíme později, až budeme řešit nástupnické linie.“** – zatím
   platí toto pravidlo bez zvláštností pro zetě, otevřená otázka v lord.md.

## Na co plán navazuje (ověřeno grepem)

| Oblast            | Soubor a funkce                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| dvorec            | `manor.ts` – `villageManorId`, `villageManor`, `isManor`, `keepManor`                                                                                                                                                                                                                                                                                                    |
| hlava domácnosti  | `burials.ts` – soukromá `isHouseholdHead` (nejstarší muž, který není dítě); web `lib/person-roles.ts` – `personRoles`, role `voivode-son`, `voivode-daughter`, `daughter-in-law`                                                                                                                                                                                         |
| příbuzenství      | `kinship.ts` – `parentIndex`, `spouseOf`; `Person.fatherId`, `spouseId`                                                                                                                                                                                                                                                                                                  |
| práce dne         | `labor.ts` – `allocateDay` (`DayAllocationInput`: `capacity`, `light`, `away`, `carting`, `householdElders`, `householdWater`), `LIGHT_LABOR_TASKS`, `householdElders(people, day, skip)`, `adultDailyMin`                                                                                                                                                               |
| volání práce      | `simulate-work.ts` – `work()`: `villagers` bez dílen (`craftHouseholds`) a cestujících, `allocateDay({...})` ř. ≈ 382; `gainPractice` ř. ≈ 649                                                                                                                                                                                                                           |
| vzor domácnosti   | `crafts.ts` – `workshopLabor` (denní minimum domácnosti mimo práci vsi), `craftLightLabor`                                                                                                                                                                                                                                                                               |
| plán osevu        | `simulate-plan.ts` – `planYear` (`chooseCrops`, nouzové bloky, když `chosenEnergyKg < targets.harvestKg`), `sowingCapacity` (bez dílen), `trimPlan`; `field-food.ts` – `sowingTargets`                                                                                                                                                                                   |
| hlad              | `simulate-food.ts` – `eat()`: `state.hungry`, `state.ration`, kronika `hunger-began` / `hunger-ended`                                                                                                                                                                                                                                                                    |
| pasáci            | `herding.ts` – `isYoungster`, `youngsterCount`, `youngsterHerders`                                                                                                                                                                                                                                                                                                       |
| osoba             | `types-people.ts` – `Person` (vzor volitelné části: `practice?`)                                                                                                                                                                                                                                                                                                         |
| ohrady            | `types-livestock.ts` – `PenSpecies`, `Pen` (`oxen?`, `team`, `training`); `pens.ts` – `PEN_SPECIES`, `penHerdSpecies`, `penPlaces`, `penCapacity`, `touchingPens`, `withPenSpecies`; `rules-livestock.ts` – `PEN_PLACES_PER_SQUARE`, `PEN_SQUARES`                                                                                                                       |
| cena ohrady       | `oxen.ts` – `PEN = { laborManDays: 40, trees: 6 }`, `penBuildLabor`, `penLaborManDays`, `penTrees`, `startPen`, `finishPen`; `rules-buildings.ts` – `PEN_FENCE`, `PEN_FENCE_INSET_M`; `fence-cost.ts` – `fencedSquareEquivalents`; `placement-pens.ts` – `checkPenPlacement`                                                                                             |
| voli jako vzor    | `oxen.ts` – `Ox`, `penOxen`, `oxRetireDay`, `retireOxen`, `penDay`, `withOxen`                                                                                                                                                                                                                                                                                           |
| stáda a seno      | `husbandry.ts` – `husbandryDay`, `winterHayNeedKg`, `hayOxen`; `hay.ts` – `feedHay`, `oxenHayCoverage`, `herdHayCoverage`, `winterHayKg`; `livestock.ts` – `grazingDemandHa`, `slaughter`, `starveHerds`, `herdBirths`                                                                                                                                                   |
| obchod s dobytkem | `types-trade.ts` – `TradeGood`, `CattleGood`; `cattle-trade.ts` – `cattleForSale`, `cattleRoom`, `cattleRoomBlocked`, `addCattle`, `removeCattle`; `neighbours.ts` – `CATTLE_GOODS`, `amounts` (losy dobytku z `extra`); `rules-trade.ts` – `cattleKinds`, `TRADE_GOOD_VALUES`, `headsPerDrover`; `trade.ts` – `sellPrice`, `buyPrice`, `villageGoodStock`, `tradeQuote` |
| zpráva o práci    | `labor-report.ts` – `laborDay`; `types-chronicle.ts` – `LaborDay`, `LaborShare`, `LaborActivity`                                                                                                                                                                                                                                                                         |
| převody           | `application/update-village.ts` – řetěz `with…` převodů, `withManor(withOxen(…))`                                                                                                                                                                                                                                                                                        |
| scéna – postavy   | `villagers.ts` (VAT, 8 vertex bufferů), `villager-plan.ts` – `planVillagers`, `villager-plan-cast.ts` (pořadí přiřazení lidí), `villager-roster.ts`; `tools/blender/people.json` (klipy a rekvizity – srp, motyka, sekera…)                                                                                                                                              |
| scéna – zvířata   | `fauna.ts`, `livestock.ts`, `livestock-placement.ts`, `pen-layout.ts` (`PEN_FENCE`, `penAnimalsFor`), `pen-animals.ts`, `village-pens.ts` (`penHerds`), `pen-renderer.ts`; `tools/blender/fauna.json`, `pen.py`                                                                                                                                                          |
| scéna – dvorek    | `homestead-layout.ts` (`MANOR_FENCE`, `gate`, `plotFenceRect`), `homestead.ts`                                                                                                                                                                                                                                                                                           |
| rozhraní          | `components/game/hud/ManorPanel.tsx`, `lib/manor-view.ts` (`VillageManor`, `manorView`), `lib/build-items.ts` (`PEN_VARIANTS`, `PEN_NAMES`), `lib/selection-details.ts` (`kind: 'pen'`, `kind: 'person'`), `TopBar.tsx` („Volná práce“), `lib/village-notices.ts`, `TradePanel.tsx`                                                                                      |
| kalibrace         | `packages/game/scripts/measure-village.ts` (`addLabor`, `--out`, `--report-only`)                                                                                                                                                                                                                                                                                        |

## Zlaté otisky – co se změní a proč

| Otisk                                                                                 | Úloha                      | Proč                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smith-golden.test.ts` (`6bd77b28`)                                                   | 2, možná 3                 | Ves má dvorec a mimo něj víc domácností s dospělými. Vojvoda přestane pracovat a ves má méně práce, takže se jinak staví, orá i jí. Je to zamýšlená změna pravidla – otisk se přepočítá a komentář řekne proč (lord.md). Úloha 3 ho změní jen tehdy, když ves nestíhá osev. |
| `craft-skill-golden.test.ts` (`f0150b51`)                                             | 2 jen bez otázky 1         | Ves má jedinou domácnost (dvorec, muž 30, žena 28, chlapci 12 a 16). S pravidlem „aspoň 4 dospělí mimo rodinu“ zůstane beze změny. Bez něj se změní jako `smith-golden`.                                                                                                    |
| oba otisky – úlohy 4–7                                                                | nesmí se změnit            | Ves bez koní je beze změny. Nové klíče (`horses`, `horsesNeedKg`…) se v nich nesmí objevit. Kdyby se objevila značka nové vsi, přidá se do množiny `marks` / `learning` jako dřív `sheaves`.                                                                                |
| `apps/web/lib/scene/__tests__/livestock-golden.test.ts` (`51283:fe569083`)            | nesmí se změnit (úloha 10) | Rozmístění stád bez koní zůstane. Koně se rozmisťují zvlášť (`horseHerd`), ne v losu stád.                                                                                                                                                                                  |
| `domain/landscape/__tests__/generate.test.ts`, `obstacles.test.ts`, `paths-*.test.ts` | nesmí se změnit            | Terče jsou jen scéna. Ohrada koní je stavba jako ostatní ohrady (překážky ve vsi, ne vrstva). Objížďka nemění síť pěšin. Žádná nová verze vrstvy.                                                                                                                           |
| `application/__tests__/village-stamp.test.ts`                                         | ne                         | Otisk verze a jména, ne simulace.                                                                                                                                                                                                                                           |

## Rizika

1. **Dopad na práci vsi 25–30 %** (Martin 23. 10. 2026: „Ano, tak to má být“). Napřed ubude
   volné práce na stavby. Malé a mladé vsi to pocítí víc (zakládání – otázka 1). Pojistky jsou
   dvě: pomoc s potřebným osevem (úloha 3) a návrat při hladu (úloha 2). Kalibrace jen na
   Martinův pokyn – úloha 14 připraví srovnání před a po.
2. **Kmitání rodiny mezi polem a dvorkem.** `state.hungry` se počítá až v `eat()` po práci dne.
   Rodina se tak rozhoduje podle včerejška a vrací se po 30 dnech plného přídělu (hystereze).
   Test: 60 dní se střídáním příděl / plný – žádné přeskakování den po dni.
3. **Obilí koní proti lidem.** Koně jedí až po lidech a jen tehdy, když ves nešetří. Zásoby do
   sklizně musí vystačit lidem i koním, jinak koně obilí nedostanou. Nesmí vzniknout smyčka
   „koně jedí → ves šetří → koně nejedí → ves nešetří“ den po dni. Test se zásobou těsně na hraně.
4. **Zlaté otisky simulace** – úloha 2 je přepočítá (viz tabulka). Před přepočtem ověřit, že
   rozdíl vzniká jen u vsí s rodinou (test: ves bez mužů v dvorci beze změny).
5. **Výkon.** Rodina a dovednosti jsou O(lidé) za den. Koně O(koně ≤ 64). Přidělení jezdců jen
   při změně rodiny nebo koní, ne každý den znovu. Ve scéně jezdci jako thin instances (jako
   postavy a zvířata), objížďka se počítá jednou za den hry, ne za snímek.
6. **Vertex buffery jezdce (WebGPU 8).** Jezdec = postava `man` s novým klipem sedu ve VAT, žádný
   nový atribut. Poloha a natočení z koně jdou do matice instance. Kůň = fauna s morph targety
   (krok, hlava dolů) jako kráva. Úloha 8 ověří počet bufferů koně v testu i ve WebGPU. Kdyby
   klus přidal čtvrtý morph target nad limit, pózy se zapečou do textury jako u postav.
7. **Licence modelů.** Kůň `horse_breed.dae` / `horse_celtic.dae` a klipy jezdce jsou
   z 0 A.D. (CC BY-SA 3.0). Sedlo a čabraka bez barev hráče. Každý soubor do `LICENSES.md`
   (`public/models/fauna/`, `public/models/people/`). Žádné jiné zdroje.
8. **Cena jezdeckého koně podle výcviku.** `TRADE_GOOD_VALUES` má jednu hodnotu na zboží. Cena
   2 400–3 600 se musí počítat za kus (`horseValueKg`) a obchod s ní musí počítat v nabídce
   i v bilanci. Úloha 7 je proto pro Opus.
9. **Postavy na dvorku.** Pravidlo „nikdo nestojí na oploceném pozemku“ má výjimku jen pro rodinu
   na dvorku dvorce. Jinde platí dál – test v `villager-plan`.

## Review Focus

1. Ves se zakládá a vojvoda cvičí – první zemnice se postaví (otázka 1, úloha 2).
2. Ves hladoví – rodina jde do sezónních úloh, ženy kryjí denní minimum dvorce, chlapci cvičí
   dál. Návrat až po 30 dnech plného přídělu (úloha 2).
3. Ves nestíhá potřebný osev – rodina dá jen chybějící podíl dne a jen v okně, kde chybí. Osev
   navíc, stavby ani opravy nedělá (úloha 3).
4. Starší ves bez nových částí stavu se načte a dopočítá. Převod je idempotentní (úlohy 2, 4).
5. Koně bez obilí a bez sena – výcvik polovičním tempem, úhyn 1. 3. od nejmladších (úloha 5).
6. Obchod: ves nikdy neprodá koně, na kterém někdo jezdí. Koupený kůň potřebuje místo v ohradě
   koní (úloha 7).

---

## Fáze A – vojvodova rodina (#8), bez jízdy

### Úloha 1: Rodina a dovednosti – čisté funkce (Sonnet, ≈ 70 kroků)

Nic se nezapojí do simulace – otisky beze změny.

**Soubory:**

- nový `domain/village/rules-lord.ts` (export z `rules.ts`), nový `domain/village/lord.ts`,
  export z `domain/village/index.ts`;
- `types-people.ts` – `Person.arms?: ArmsSkills`;
- `burials.ts` → `households.ts`: soukromou `isHouseholdHead` vytáhnout jako exportovanou
  `householdHead(people, dwellingId, day): Person | undefined`, `burials.ts` ji použije beze
  změny chování;
- testy `__tests__/lord.test.ts`.

**Rozhraní:**

- `LORD = { minVillageAdults: 4, keepVillageAdults: 3, hours: { boy: 2, youth: 4, man: 6, older: 3 }, split: {…},
gainPerHour: 0.00047, cap: { boy: 40, man: 100, declinePerYear: 3 }, decayPerYear: 0.05,
floorShare: 0.5, backToTrainingDays: 30 }` – každé číslo s odkazem na sekci lord.md;
- `interface ArmsSkills { bow: number; combat: number; riding: number; best?: { bow: number;
combat: number; riding: number } }` – `best` je nejvyšší dosažená hodnota (spodní hranice
  úbytku);
- `lordFamily(state, day): { lord: Person | null; trainees: Person[]; household: Person[];
others: Person[] }`:
  - `lord` – hlava dvorce (`householdHead` dvorce `villageManorId`);
  - `trainees` – vojvoda a jeho potomci po meči v dvorci (`fatherId` řetězem) od 7 let;
  - `household` – žena vojvody, dcery, snachy a vnučky v dvorci;
  - `others` – zbytek dvorce (zeť, ženich) – pracují jako dosud;
- `trainingHours(person, day, lord, hasHorse): { bow: number; combat: number; riding: number }`
  podle tabulky Den rodiny. Bez koně se jízda rozdělí do luku a boje;
- `armsCap(person, day): number` – 7–13 let 40, 14–44 let 100, od 45 let −3 ročně;
- `trainArms(skills, hours, cap): ArmsSkills` – jeden den růstu:
  `+ (cap − x) × gainPerHour × hodiny`;
- `decayArms(skills): ArmsSkills` – den bez výcviku: `× (1 − decayPerYear / 365)`, nejníž
  `best × floorShare`;
- `familyTrains(state, day, training = false): boolean` – aspoň `minVillageAdults` dospělých mimo
  `trainees` a `household` (otázka 1); kdo už cvičí (`training` = režim z `VillageState.lord?`),
  zůstane u výcviku, dokud jich je aspoň `keepVillageAdults` (hystereze). Zapojení je Úloha 2.

**Postup:**

- [ ] **Krok 1:** Testy:
  - rodina: vojvoda + syn 16 + vnuk 8 cvičí; žena, dcera a snacha jsou `household`; zeť je
    `others`; syn, který se odstěhoval do jiného obydlí, rodinou není;
  - hodiny: tabulka Den rodiny, bez koně jízda 0;
  - růst: 2 h denně rok od 0 dá ≈ 29 (± 0,5), 5 let ≈ 80, 7 let ≈ 90;
  - strop 40 do 13 let, v 65 letech 40;
  - úbytek −5 % ročně, nejníž polovina `best`;
  - `householdHead` dává totéž co dřívější `isHouseholdHead` (pohřby beze změny).
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou, `npm run typecheck && npm run lint`.
- [ ] **Krok 5:** Commit `feat(game): vojvodova rodina a dovednosti – pravidla`.

**docs/code:** `village-people.md` – nová odrážka **Vojvodova rodina** (kdo patří k rodině,
`lordFamily`, `householdHead`, dovednosti `Person.arms`).

### Úloha 2: Rodina mimo práci vsi, výcvik den po dni a návrat při hladu (Opus, ≈ 110 kroků)

**Soubory:**

- `lord.ts` – nové `manorLabor`, `lordFieldMode`, `trainLordDay`;
- `labor.ts` – `DayAllocationInput.lordField?` a `DayAllocation.lordField`;
- `simulate-work.ts` – `work()`;
- `herding.ts` – `isYoungster` / `youngsterHerders` bez chlapců rodiny;
- `types-state.ts` – `VillageState.lord?: { field?: { since: number; reason: 'hunger' | 'sowing' };
fedDays?: number }`;
- `types-chronicle.ts` – kronika `lord-to-field` / `lord-to-training`, `LaborDay.lord?`;
- `labor-report.ts` – `laborDay` zapíše `lord`;
- `simulate.ts` – volání `trainLordDay` po `eat()`;
- testy `__tests__/lord-day.test.ts`, úprava `labor.test.ts`, `herding.test.ts`, obou zlatých
  otisků.

**Rozhraní a pravidla:**

- `work()`: když `familyTrains`, `villagers` vynechá celý dvorec – jako dílny (`crafts`).
  - `others` v dvorci (zeť) zůstávají ve `villagers`.
  - Domácnost dvorce se z `householdElders` / `householdWater` vynechá přes `skip` – její
    minimum kryje `manorLabor`.
- `manorLabor(state, day, coverage, productivity): { dailyMin: number; field: number }` – jako
  `workshopLabor`:
  - starší a ženy rodiny kryjí denní minimum dvorce (s vodou);
  - zbytek žen propadne (domácí výroba bokem);
  - `field` – kolik rodina dá do sezónních úloh:
    - `VillageState.lord.field` (hlad) – všichni dospělí rodiny po minimu;
    - jinak 0 (úloha 3 přidá podíl na osevu).
- `allocateDay`: nový zásobník `lordField` jako `light`:
  - pokryje jen úlohy kroku 3 (pole, orba, seč, sklizeň, výmlat – `input.tasks`), ne stavby;
  - co nevyužije, propadne;
  - pořadí: `light`, pak `lordField`, pak obecná kapacita.
- `lordFieldMode(state, day)` (volá se po `eat()`, mutuje `state.lord`):
  - `state.hungry` → `field = { since: day, reason: 'hunger' }`, `fedDays = 0`;
  - jinak `fedDays += 1`;
  - po `LORD.backToTrainingDays` dnech `field` smazat;
  - kronika jen při změně.
- `trainLordDay(state, day)`:
  - `trainees` ve výcviku (ne v poli) dostanou `trainArms`;
  - ti, kdo necvičí (rodina na poli, muž mimo dvorec s `arms`), `decayArms`;
  - jízda v této úloze 0 – `hasHorse` = false.
- Chlapci rodiny 7–13 let nepasou: `youngsterHerders` počítá jen výrostky mimo `trainees`.
- `LaborDay.lord = { training: number; field: number; household: number }` (počty lidí) – pro
  scénu a lištu.

**Postup:**

- [ ] **Krok 1:** Testy (in-memory stav, `village-fixtures.ts`):
  - ves s rodinou (vojvoda, 2 synové, žena, snacha) a 4 dospělými jinde – `allocateDay` dostane
    kapacitu bez rodiny a minimum dvorce nejde z práce vsi;
  - `lordField` nepokryje stavbu, pokryje sklizeň;
  - hlad: den po `hunger-began` je rodina na poli, chlapec 11 cvičí, návrat po 30 dnech plného
    přídělu, ne dřív; kronika jen dvakrát;
  - ves se 2 dospělými mimo rodinu: rodina pracuje jako dosud (otázka 1);
  - zakladatelé (`foundVillage`) postaví první zemnici – dopočet 400 dní;
  - dovednosti po roce výcviku: syn 16 luk ≈ 40 (6 h, bez koně luk 3 h), vojvoda 50 let ve
    stropu;
  - dopočet po kouscích (1 × 365 vs 73 × 5 dní) dá stejný stav;
  - starší ves bez `lord` a `arms` se dopočítá a převod je idempotentní.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace. `smith-golden` přepočítat a do komentáře napsat proč (lord.md –
      rodina mimo práci vsi). `craft-skill-golden` jen když se změnil (otázka 1).
- [ ] **Krok 4:** `npm run test`, `npm run typecheck`, `npm run lint`.
- [ ] **Krok 5:** Commit `feat(game): vojvodova rodina cvičí místo práce na poli`.

**docs/code:** `village-core.md` – Pořadí práce dne (zásobník `lordField`, minimum dvorce);
`village-people.md` – Vojvodova rodina (den rodiny, hlad, hystereze, pasáci).

### Úloha 3: Pomoc rodiny s potřebným osevem (Opus, ≈ 90 kroků)

**Soubory:** `simulate-plan.ts` (`planYear`, `trimPlan`, `sowingCapacity`), `types-construction.ts`
(`YearPlan.lordHelp?`), `lord.ts` (`manorLabor` – `field` z plánu), testy
`__tests__/lord-sowing.test.ts`.

**Pravidla:**

- `sowingCapacity(state, day, coverage, plough, landscape, pairs, { lord })`:
  - bez `lord` vynechá domácnost dvorce jako dílny, kromě `others`;
  - s `lord` přičte práci dospělých rodiny po minimu dvorce (jen kapacita lidí, ne spřežení).
- `planYear`: napřed `chooseCrops` bez rodiny.
  - Když `chosenEnergyKg < targets.harvestKg` (potřebný osev), znovu s `lord`, ještě před
    nouzovými bloky.
  - Pro každé okno (`autumnWinter`, `autumn`, `spring`, `july`, `august`) uložit
    `lordHelp[okno] = min(1, chybějící práce ÷ práce rodiny v okně)`.
  - Osev navíc (`extra`) se počítá jen z kapacity bez rodiny.
- Jarní úprava (`trimPlan`) přepočítá `lordHelp` pro jaro.
- `manorLabor.field` = `lordHelp[dnešní okno] × práce dospělých rodiny po minimu`, když rodina
  není na poli kvůli hladu. Zbytek dne cvičí – `trainLordDay` dostane hodiny × (1 − podíl).

**Postup:**

- [ ] **Krok 1:** Testy:
  - ves, která osev stihne bez rodiny – `lordHelp` chybí, rodina jen cvičí;
  - ves, které chybí 30 % podzimní práce – rodina dá podíl jen v září–říjnu, v zimě cvičí celý
    den;
  - osev navíc se kvůli rodině nezvětší;
  - starší plán bez `lordHelp` = 0.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace. Otisky přepočítat jen při změně, s komentářem.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat(game): vojvodova rodina pomůže s potřebným osevem`.

**docs/code:** `village-fields.md` – Kolik ves oseje (kapacita bez rodiny, `lordHelp`).

## Fáze B – koně v jádru (#5)

### Úloha 4: Ohrada koní a koně po kusech (Sonnet, ≈ 80 kroků)

**Soubory:**

- `types-livestock.ts` – `PenSpecies` + `'horse'`,
  `interface Horse { id: number; bornDay: number; sex: 'male' | 'female'; training: number;
riderId?: number }`, `Pen.horses?: Horse[]`;
- `pens.ts` – `PEN_SPECIES`, `penHerdSpecies('horse') = null`, `penPlaces` pro koně
  (`PEN_PLACES_PER_SQUARE.horse = 4`);
- `rules-livestock.ts` – `PEN_PLACES_PER_SQUARE.horse`, `HORSES` (služba 3–20 let, chov 4–20,
  maso 100 kg, březost, péče, krmení, ceny jdou do úloh 5–7);
- `oxen.ts` – `PEN_BY_SPECIES` nebo parametr druhu: `penBuildLabor(species)`,
  `penLaborManDays(…, species)`, `penTrees(…, species)` – koně 50 čd a 8 stromů na čtverec,
  ostatní beze změny (výchozí parametr);
- `rules-buildings.ts` – `PEN_FENCE_HEIGHT_M = { default: …, horse: 1.4 }` (jen pro scénu);
- nový `horses.ts` – `villageHorses`, `horsePens`, `horseKind(horse, day): 'foal' | 'mare' |
'riding'`, `horsePlaces`, `horseRoom`;
- `placement-pens.ts` – `checkPenPlacement` s druhem `'horse'` (koně se nemíchají –
  `touchingPens` už podle druhu);
- testy `__tests__/horses.test.ts`, `pens.test.ts`, `costs.test.ts`.

**Pravidla:** ohrada koní 1–4 čtverce, 4 koně na hotový čtverec. Hříbě do 1 roku nemá vlastní
místo. Bez koní chátrá jako ostatní ohrady (`abandonment.ts` beze změny – ověřit testem).

**Postup:**

- [ ] **Krok 1:** Testy: cena čtverce 50 čd + 8 stromů, rozšíření podle stran plotu
      (`fencedSquareEquivalents`), místa 4 / čtverec, hříbě do roka bez místa, ohrada koní se
      nespojí s ohradou volů, ves bez ohrady koní beze změny (oba zlaté otisky).
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat(game): ohrada koní`.

**docs/code:** `village-livestock.md` – nová odrážka **Ohrada koní a koně po kusech**.

### Úloha 5: Péče a krmení koní (Opus, ≈ 110 kroků)

**Soubory:**

- `horses.ts` – nové `horseCareLabor`, `horseGrainToday`, `horseHayDailyKg`;
- `labor.ts` – `DayAllocationInput.horseCare?`, `DayAllocation.horseCare` – hned za denním
  minimem, před výpravami (`away`);
- `simulate-work.ts` – předá `horseCare`;
- `hay.ts` – `feedHay(state, oxen, herds, horsesKg = 0)`: pořadí voli → koně → stádo,
  `winter.horsesNeedKg/horsesEatenKg`, nová `horsesHayCoverage`; `herdHayCoverage` odečte
  březen koní; `winterHayKg(herds, oxen, horsesKg = 0)`;
- `husbandry.ts` – `winterHayNeedKg` s koňmi (seč 1. 6.), `husbandryDay` → `horsesDay`;
- `livestock.ts` – `grazingDemandHa(herds, oxen, horses = 0)` (1 ha na koně v létě);
- `simulate-food.ts` – po `eat()` `feedHorseGrain(state, day)`;
- `field-food.ts` – `sowingTargets` přičte obilí koní do příští sklizně a rok po ní;
- `rules-livestock.ts` – `HORSES.careHoursPerDay = 1`, `hayKg = { horse: 6, horseNoGrain: 7,
foalFirstWinter: 3, foal: 5 }`, `grainKgPerDay = 1.5`, `pastureHa = 1`;
- testy `__tests__/horse-feed.test.ts`, `hay.test.ts`, `labor.test.ts`.

**Pravidla:**

- Péče 0,1 čd na koně denně (hříbě do roka 0). Pokrytí `horseCare` (0–1) se uloží
  v `VillageState` jako `horsesCaredToday`. Bez péče výcvik koně stojí (úloha 6).
- Obilí – lidé napřed. `feedHorseGrain` dá jezdeckým koním 1,5 kg, jen když:
  - `!state.hungry`;
  - zásoba po dnešním jídle vystačí lidem i koním do sklizně (`storesKg − grain × daysUntilHarvest`
    proti potřebě lidí do sklizně).
  - Jinak koně obilí nedostanou: `horsesFed = false`, seno 7 kg místo 6, upozornění.
- Seno po volech a před stádem. 1. 3. pod polovinu přídělu → úhyn tolika koní, aby ostatní měli
  polovinu, nejdřív nejmladší. Kronika `horse-starved`.
- Na nouzovou porážku koně nejdou (`emergency-slaughter.ts` beze změny – test).

**Postup:**

- [ ] **Krok 1:** Testy:
  - 5 koní = 0,5 čd denně z práce vsi před výpravami;
  - zima: voli dostanou seno první, pak koně, pak stádo;
  - bez obilí 7 kg sena;
  - ves šetří → koně obilí nedostanou a ves nešetří kvůli koním;
  - smyčka na hraně zásob se nehoupe den po dni (60 dní);
  - plán osevu se 3 koňmi chce o ≈ 1 650 kg víc;
  - úhyn 1. 3.;
  - ves bez koní beze změny (oba zlaté otisky).
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat(game): péče o koně a jejich krmení`.

**docs/code:** `village-livestock.md` – Ohrada koní (péče, seno, obilí, pastva);
`village-core.md` – Pořadí práce dne (péče o koně za minimem).

### Úloha 6: Chov, výcvik koně a jezdci (Opus, ≈ 110 kroků)

**Soubory:** `horses.ts` (nové `horsesWanted`, `horseBirths`, `retireHorses`, `assignRiders`,
`trainHorsesDay`, `riderPower`), `lord.ts` (`trainingHours` s `hasHorse`, `trainLordDay`
s jízdou), `husbandry.ts` (`horsesDay` v `husbandryDay`: 1. 3. úhyn, 1. 5. hříbata, 1. 11.
porážka), `types-chronicle.ts` (`foal-born`, `horse-trained`, `horse-retired`), testy
`__tests__/horse-breeding.test.ts`, `__tests__/horse-riders.test.ts`.

**Pravidla:**

- **Hříbata 1. 5.:** klisna 4–20 let rodí každý druhý rok – podle parity roku a jejího id, ne
  náhodou, ať je chov stálý. Jen když má ves jezdeckého koně od 3 let (hřebec = nejstarší).
  Pohlaví z `deriveSeed(state.seed, 'foal', day, mare.id)`. Hříbě potřebuje místo.
- **Ve 3 letech:** z hřebečka je jezdecký kůň (`training` 0), z klisničky klisna.
- **`horsesWanted(state, day)`:**
  - jezdečtí koně = muži rodiny od 10 let;
  - hříbata = kolik hřebečků bude za 3 roky chybět;
  - klisny = 1 + 1 na každé 3 jezdce;
  - strop = místa v ohradách koní.
- **1. 11.:**
  - koně od 20 let jdou na maso (100 kg do `meatKg`), kronika `horse-retired`;
  - koně od 3 let nad `horsesWanted` jdou na maso, nejdřív nejstarší;
  - hříbata zůstávají, dokud jsou místa.
- **`assignRiders`:** nejlépe vycvičený kůň vojvodovi, další synům od nejstaršího, chlapci
  10–13 let až po dospělých. Pár drží, dokud oba žijí a jezdec je v rodině (`trainees`).
- **Výcvik koně:** den, kdy jezdec cvičí jízdu a kůň má péči:
  - `training += denní přírůstek`, aby kůň od 3 do 12 let došel na 100 při obilí (≈ 11 %
    ročně);
  - bez obilí polovina;
  - bez jezdce, bez péče nebo v dnech rodiny na poli 0;
  - kronika `horse-trained` při dosažení 100.
- **Jezdec:** `trainingHours(…, hasHorse = true)` dá jízdu, `riding` roste.
  `riderPower = riding × (0,4 + 0,6 × training)` – jen pro panel, lov a válka později.

**Postup:**

- [ ] **Krok 1:** Testy:
  - ves s hřebcem a 2 klisnami – hříbata každý druhý rok, bez hřebce žádná;
  - koně ve 20 letech 1. 11. na maso;
  - přebytek od nejstarších;
  - přidělení jezdců a výměna po smrti jezdce;
  - výcvik 3 → 12 let = 100 (± 1), bez obilí poloviční;
  - jízda roste jen s koněm;
  - dopočet po kouscích dá stejný stav;
  - ves bez koní beze změny.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat(game): chov koní, výcvik koně a jezdci`.

**docs/code:** `village-livestock.md` – Ohrada koní (chov, kolik koní ves chce, výcvik, jezdci);
`village-people.md` – Vojvodova rodina (jízda jen s koněm).

### Úloha 7: Obchod s koňmi (Opus, ≈ 100 kroků)

**Soubory:**

- `types-trade.ts` – `HorseGood = 'foals' | 'mares' | 'ridingHorses'`, `TradeGood` + `HorseGood`;
- `neighbours.ts` – `HORSE_GOODS`, `isHorseGood`. Losy koní z **vlastního proudu**
  `deriveSeed(seed, 'neighbour-horses', …)`, ať se ostatní zboží souseda nezmění (jako
  `extra` u dobytka);
- `rules-trade.ts`:
  - `horseKinds`: pastevci nabízejí hříbata a klisny, jezdecké koně jen některý rok; obilnáři
    a řemeslníci shánějí jezdecké koně; lesní ves nic;
  - roční množství 1–3;
  - `TRADE_GOOD_VALUES.foals = 800`, `mares = 1 600`, `ridingHorses = 2 400` (základ);
  - `TRADE.horsesPerDrover = 4`;
- nový `horse-trade.ts` (vzor `cattle-trade.ts`):
  - `horsesForSale` – nikdy kůň s jezdcem; klisny nad chovné; hříbata;
  - `horseRoom`, `horseRoomBlocked` („Tolik koní se do ohrady koní nevejde.“);
  - `addHorses` (koupený jezdecký kůň 3–12 let ze seedu sezóny souseda, výcvik podle věku);
  - `removeHorses`;
  - `horseValueKg(horse) = 2 400 + 1 200 × training`;
- `trade.ts` – `villageGoodStock`, `tradeQuote` a bilance s cenou za kus jezdeckého koně,
  `expeditionPorters` (honák na 4 koně), `finishExpeditions` přidá koně;
- testy `__tests__/horse-trade.test.ts`, `neighbours.test.ts` (ostatní zboží souseda beze
  změny), `trade.test.ts`.

**Postup:**

- [ ] **Krok 1:** Testy:
  - nabídka pastevců má koně a ostatní zboží stejné jako před změnou;
  - ves neprodá koně s jezdcem;
  - koupě bez místa je zablokovaná s důvodem;
  - cena jezdeckého koně podle výcviku;
  - honáci po 4;
  - uložené `NeighbourStock` bez koní se načte.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou, oba zlaté otisky beze změny.
- [ ] **Krok 5:** Commit `feat(game): obchod s koňmi`.

**docs/code:** `village-trade.md` – nová odrážka **Koně ve třech druzích** za Dobytkem.

## Fáze C – scéna

### Úloha 8: Modely koně, hříběte a jezdce z 0 A.D. (Sonnet, ≈ 80 kroků)

**Soubory:**

- `tools/blender/fauna.json` – záznamy `horse` (`meshes/skeletal/horse_breed.dae` nebo
  `horse_celtic.dae`, póza `animation/quadraped/horse_breed_idle_*.dae`, klíče kroku
  `horse_breed_walk.dae`, klusu `horse_breed_trot.dae`, hlava dolů) a `foal` (≈ 0,6×). Sedlo
  a čabraka bez barev hráče;
- `tools/blender/people.json` – klip `ride` (sed z `art/animation/biped/rider/cavalry/`),
  klipy výcviku `bow-draw` a `bow-release`, `spear-thrust`, `sword-strike`, `shield-block`
  (z `art/animation/biped/infantry/` – konkrétní soubory vybrat při převodu), rekvizity `bow`,
  `training-sword` (dřevo), `wicker-shield`, `spear`;
- výstup `apps/web/public/models/fauna/horse.glb`, `foal.glb`,
  `apps/web/public/models/people/man.glb` (nové klipy);
- `LICENSES.md` v `public/models/fauna/` a `public/models/people/`;
- `tools/blender/pen.py` – varianta `pen-horse` (plot 1,4 m, žlab na obilí pod přístřeškem);
- test `apps/web/lib/scene/__tests__/fauna.test.ts` – počet vertex bufferů koně ≤ 8.

**Postup:**

- [ ] **Krok 1:** Převod koně (a stejně `people_from_0ad.py` s `people.json`). Náhled jen malý.

  ```bash
  blender -b --factory-startup --python tools/blender/fauna_from_0ad.py -- \
    tools/blender/fauna.json <0ad>/binaries/data/mods/public/art apps/web/public/models/fauna
  ```

- [ ] **Krok 2:** Test bufferů a velikosti (kůň o 20 % větší jako ostatní zvířata – `SCALE`).
- [ ] **Krok 3:** Licence do `LICENSES.md`.
- [ ] **Krok 4:** Commit `feat(web): modely koně a jezdce z 0 A.D.`.

**docs/code:** `scene-village.md` – Domácí zvířata (kůň, hříbě), `village-people.md` – Postavy
(nové klipy a rekvizity).

### Úloha 9: Scéna – cvičiště na dvorku a rodina při výcviku (Opus, ≈ 110 kroků)

**Soubory:**

- nový `apps/web/lib/scene/training-ground-layout.ts` (čisté funkce):
  - z pozemku dvorce (`homestead-layout.ts` – obdélník plotu, `gate`) střelnice ≈ 20 m podél
    delší osy, 2 terče na konci, proutěný plůtek za nimi, cvičný kůl u plotu, stojan se zbraněmi,
    kůl na koně u brány;
  - bez dvorce (první zemnice bez pozemku) 1 terč a kůl ≈ 10 m od dveří, odvrácené od obydlí;
- nový `training-ground.ts` (Babylon, modely z `tools/blender/` – terč ze slámy, trojnožka, kůl,
  stojan; CC0, vlastní) – instance jen při změně dvorce;
- `lib/village-view.ts` / `village-view-scene-types.ts` – `SceneLabor.lord` (kdo cvičí, kdo je na
  poli) z `LaborDay.lord`;
- `villager-plan-cast.ts` – nový krok obsazení „rodina na dvorku“ hned po pohřbu a karavanách:
  - muži a chlapci střílejí na terče nebo bojují ve dvojici či u kůlu (klipy z úlohy 8);
  - ženy rodiny u dvorce jako ženy u domů;
  - jen ve dne;
  - v dnech na poli jsou mezi ostatními;
- `villager-plan.ts` – výjimka „nikdo nestojí na oploceném pozemku“ jen pro dvorek dvorce
  a rodinu;
- testy `__tests__/training-ground-layout.test.ts`, `villager-plan.test.ts`.

**Postup:**

- [ ] **Krok 1:** Testy:
  - terče uvnitř plotu, střelnice nemíří na bránu;
  - bez dvorce terč mimo obydlí;
  - rodina na dvorku jen ve dne;
  - ostatní postavy na pozemcích dál ne.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace. Pohyb ve skutečném čase (`WATER_FPS`), střídání klipů střihem.
- [ ] **Krok 4:** `npm run test`, `npm run test:e2e` (import Babylonu z modulů), malý snímek.
- [ ] **Krok 5:** Commit `feat(web): cvičiště a vojvodova rodina na dvorku`.

**docs/code:** `scene-village.md` – nová odrážka **Cvičiště na dvorku dvorce**;
`village-people.md` – Postavy (obsazení rodiny, výjimka pozemku).

### Úloha 10: Scéna – ohrada koní a koně (Sonnet, ≈ 90 kroků)

**Převzato z Úlohy 8 (recenze 24. 10. 2026):** varianta `pen-horse` v `pen.py` chybí – `pen.py` potřebuje atlas z `craft_atlas.py`, který lokálně není, a regenerace by přepsala `pen.glb`. Buď ohradu koní složit ze stávajícího přístřešku, jeslí a žlabu s vyšším pletencem (1,4 m), nebo atlas obnovit bez změny stávajících modelů.

**Soubory:**

- `pen-layout.ts` – výška plotu podle druhu (`PEN_FENCE` → styl podle `species`), žlab na obilí,
  místa pro koně (`penAnimalsFor` s druhem `horse`, hříbata u klisen);
- `pen-renderer.ts` – model `pen-horse`;
- `village-pens.ts` – `penHerds` pro koně (z `SceneVillage.pens[].horses`);
- `pen-animals.ts` – kůň a hříbě z `fauna.ts`;
- `livestock-placement.ts` – nový `horseHerd`: v létě se koně pasou se stády, mimo los ostatních
  stád (otisk `livestock-golden` beze změny). Jezdečtí koně, kteří jsou právě pod jezdcem, se
  vynechají;
- koňák ráno a večer u ohrady a ráno vede koně ke dvorci (`villager-plan-cast.ts` – péče
  `horse-care` z `LaborDay`);
- `village-view-scene-types.ts` – `ScenePen.horses?`;
- testy `pen-layout.test.ts`, `village-pens.test.ts`, `livestock-golden.test.ts` (beze změny).

**Postup:**

- [ ] **Krok 1:** Testy:
  - plot koní 1,4 m;
  - 4 místa na čtverec;
  - hříbě u klisny;
  - koně se nemíchají se stády v ohradě;
  - `livestock-golden` beze změny.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** `npm run test`, `npm run test:e2e`, malý snímek.
- [ ] **Krok 5:** Commit `feat(web): ohrada koní ve scéně`.

**docs/code:** `village-livestock.md` – Ohrada s přístřeškem (druh koně, vyšší plot, žlab);
`scene-village.md` – Domácí zvířata (koně na pastvě).

### Úloha 11: Scéna – jezdci a objížďka (Opus, ≈ 120 kroků)

**Převzato z Úlohy 8 (recenze 24. 10. 2026):** sedlo a čabraka (`props/horse/*` z 0 A.D.) – `fauna_from_0ad.py` rekvizity koně neumí; doplnit, nebo jezdit bez sedla (raný středověk – sedlo s třmeny až později; zdůvodnit). Okem zkontrolovat velikost luku, štítu a sed jezdce na koni.

**Soubory:**

- nový `apps/web/lib/scene/rider-route.ts` (čisté funkce):
  - denní objížďka okraje polí po pěšinách, mezích a loukách, nikdy přes osetý čtverec;
  - jednou za 7 dní po zemské stezce k okraji mapy a zpět;
  - doprovod výpravy nejstarším volným jezdcem;
  - v zimě se sněhem kratší okruh;
  - tempo krok 1,5 m/s, klus 3 m/s na louce;
  - skupina až 4;
  - trasa jednou za den hry, poloha je čistá funkce času;
- nový `riders.ts`:
  - jezdec = instance `villagers-man` s klipem `ride`, matice z polohy koně;
  - kůň = instance fauny s krokem a klusem;
  - jedoucí jezdec nastaví `needsRender`, stojící ne;
  - žádný nový vertex atribut;
- `village-picking.ts` / `villager-pick.ts` – klik na jezdce nebo koně vybere člověka (kroužek
  sleduje), klik na koně v ohradě vybere ohradu;
- `village-view-scene-types.ts` – `SceneLabor.lord.riders` (jezdec, kůň, výcvik koně) z jádra;
- testy `__tests__/rider-route.test.ts` (ne přes osetý díl, stezka jen se stezkou, determinismus
  času), e2e kontrola importu modulů.

**Postup:**

- [ ] **Krok 1:** Testy trasy.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementace. `scene-perf` – draw cally jezdců.
- [ ] **Krok 4:** `npm run test`, `npm run test:e2e`, WebGPU i WebGL 2 v náhledu, malý snímek.
- [ ] **Krok 5:** Commit `feat(web): jezdci a objížďka polí`.

**docs/code:** `scene-village.md` – nová odrážka **Jezdci** (trasa, tempo, buffery, výběr).

## Fáze D – rozhraní a ověření

### Úloha 12: Rozhraní – vojvodova rodina (Sonnet, ≈ 90 kroků)

**Soubory:**

- `lib/person-roles.ts` – role `voivode-grandson`, `voivode-daughter-in-law` (vedle
  `voivode-son`, `voivode-daughter`), `ROLE_NAMES`;
- `lib/person-view.ts` – činnosti „cvičí lukostřelbu“, „cvičí boj“, „jezdí na koni“, „pomáhá na
  poli“, „vede domácnost“; dovednosti z `Person.arms`;
- `lib/manor-view.ts` – `VillageManor.family` (lidé, role, dovednosti, kůň);
- `components/game/hud/ManorPanel.tsx` – obyvatelé jako u obydlí, u mužů rodiny tři ikony (luk,
  štít s mečem, kůň) s čísly, popisek „Lukostřelba 64 / 100“. Kůň jen u toho, kdo koně má;
- `components/game/hud/selection/people.tsx` – dovednosti a kůň;
- `TopBar.tsx` – popisek pracovní síly doplní řádek s ikonou dvorce („Vojvodova rodina: 5 cvičí“
  / „5 na poli“);
- `lib/village-notices.ts`, `lib/village-view-chronicle.ts` – zprávy „Vojvodova rodina jde na
  pole“ (popisek: nestihne osev / šetří jídlem), „Vojvodova rodina se vrací k výcviku“;
- `tools/blender/icons.py` – ikony luk, štít s mečem, kůň, dvorec;
- testy `person-roles.test.ts`, `manor-view.test.ts`, komponent v `hud/__tests__/`.

**Postup:** testy → selžou → implementace → `npm run test`, `npm run test:e2e` → commit
`feat(web): vojvodova rodina v rozhraní`.

**docs/code:** `web-ui.md` – nová odrážka **Panel dvorce – vojvodova rodina**.

### Úloha 13: Rozhraní – koně (Sonnet, ≈ 110 kroků)

**Soubory:**

- `lib/build-items.ts` – `PEN_VARIANTS` + `{ id: 'horse', icon: 'horse', name: 'Koně' }`,
  `PEN_NAMES.horse = 'Ohrada koní'`, cena v popisku (`penPlacementCost` s druhem);
- `lib/selection-details.ts` – `kind: 'pen'` + `horses?`:
  - koně, místa, kolik ves chce (v popisku jezdečtí, klisny, hříbata);
  - seznam koní: druh, věk, výcvik (přesýpací hodiny do 12 let), hřebec;
  - obilí koní za den („bez obilí“ červeně), seno na zimu;
- panel ohrady v `components/game/hud/selection/fields.tsx`;
- `components/game/hud/TradePanel.tsx`, `lib/trade-names.ts` – tři řádky (hříbata, klisny,
  jezdečtí koně), nové ikony;
- `lib/village-notices.ts` – „Koně jsou bez obilí“, „Koně se nevejdou do ohrady“, „Kůň uhynul –
  chybělo seno“; kronika „Narodilo se hříbě“, „Kůň je vycvičený“, „Kůň dosloužil“;
- výběr jezdce – panel člověka ukáže i koně (věk, výcvik, obilí);
- e2e `apps/web/e2e/` – postavit ohradu koní (rozcestník ohrad), panel ohrady.

**Postup:** testy → selžou → implementace → `npm run test`, `npm run test:e2e` → commit
`feat(web): koně v rozhraní`.

**docs/code:** `web-ui.md` – Katalog staveb (druh Koně), Panel ohrady (koně);
`village-trade.md` – Koně ve třech druzích (UI).

### Úloha 14: Ověření a měřicí skript (Sonnet, ≈ 60 kroků)

**Soubory:**

- `packages/game/scripts/measure-village.ts` – nové sloupce na rok:
  - práce rodiny (čd výcviku, čd na poli – osev / hlad);
  - podíl rodiny na práci vsi;
  - volná práce (`commonLaborHistory`);
  - počet koní a obilí koní (kg);
  - dny šetření.
- `addLabor` dál počítá kapacitu vsi bez rodiny.

**Postup:**

- [ ] **Krok 1:** Test skriptu (`scripts/__tests__/`) – sloupce pro 1 ves × 2 roky.
- [ ] **Krok 2:** Krátký běh `npx tsx packages/game/scripts/measure-village.ts 2 3` jen jako
      zkouška, že skript běží (není to kalibrace).
- [ ] **Krok 3:** Do `docs/design/lord.md` – Dopad na pracovní sílu – zapsat **příkaz na noc**
      (nespouštět, jen na Martinův pokyn):

  ```bash
  # základ – poslední commit před úlohou 2 ve vlastním worktree
  git worktree add ../bohemia-before-lord <commit-před-úlohou-2>
  (cd ../bohemia-before-lord && npm install && \
    npx tsx packages/game/scripts/measure-village.ts 200 60 --out before-lord.jsonl)
  # po změně
  npx tsx packages/game/scripts/measure-village.ts 200 60 --out lord-horses.jsonl
  # tabulky
  npx tsx packages/game/scripts/measure-village.ts --report-only --out before-lord.jsonl
  npx tsx packages/game/scripts/measure-village.ts --report-only --out lord-horses.jsonl
  ```

- [ ] **Krok 4:** Celá sada: `npm run typecheck`, `npm run lint`, `npm run test`,
      `npm run test:db`, `npm run test:e2e`, `npm run format:check`.
- [ ] **Krok 5:** grep `koordinátor|za Martina` v `docs/` (značení rozhodnutí).
- [ ] **Krok 6:** Commit `chore: měření dopadu vojvodovy rodiny a koní`.

**docs/code:** `village-core.md` – Čísla (sloupce kalibrace).

## Pořadí a souběh

1 → 2 → 3 (jádro rodiny, sériově – stejné soubory `labor.ts`, `simulate-work.ts`) → 4 → 5 → 6 →
7 (jádro koní, sériově – `husbandry.ts`, `hay.ts`, `horses.ts`). Úloha 8 (modely) smí běžet
souběžně s úlohami 4–7 – nesahá na jádro. Úlohy 9–11 až po 8. Úlohy 12–13 až po 3 a 7. Úloha 14
nakonec. Po každé úloze je hra funkční. Nová pravidla bez rozhraní jen nejsou vidět. Ohradu koní
půjde postavit až od úlohy 13.

| Úloha | Název                                           | Model  | Kroky |
| ----- | ----------------------------------------------- | ------ | ----- |
| 1     | Rodina a dovednosti – čisté funkce              | Sonnet | ≈ 70  |
| 2     | Rodina mimo práci vsi, výcvik, návrat při hladu | Opus   | ≈ 110 |
| 3     | Pomoc rodiny s potřebným osevem                 | Opus   | ≈ 90  |
| 4     | Ohrada koní a koně po kusech                    | Sonnet | ≈ 80  |
| 5     | Péče a krmení koní                              | Opus   | ≈ 110 |
| 6     | Chov, výcvik koně a jezdci                      | Opus   | ≈ 110 |
| 7     | Obchod s koňmi                                  | Opus   | ≈ 100 |
| 8     | Modely koně, hříběte a jezdce                   | Sonnet | ≈ 80  |
| 9     | Cvičiště a rodina na dvorku                     | Opus   | ≈ 110 |
| 10    | Ohrada koní a koně ve scéně                     | Sonnet | ≈ 90  |
| 11    | Jezdci a objížďka                               | Opus   | ≈ 120 |
| 12    | Rozhraní – vojvodova rodina                     | Sonnet | ≈ 90  |
| 13    | Rozhraní – koně                                 | Sonnet | ≈ 110 |
| 14    | Ověření a měřicí skript                         | Sonnet | ≈ 60  |
