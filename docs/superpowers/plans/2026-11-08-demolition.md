# Bourání a opuštění staveb – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hráč i správce smí dokončenou stavbu opustit, zbourat a opuštěnou vrátit; obydlí jen
s místem pro obyvatele, kteří dočasně bydlí jinde; obydlí jde stavět bez lidí k osídlení; akce
Přestěhovat zaniká (NPC správce postaví nový dům a starý zbourá); opevnění se zboří a vylepší po
úsecích mezi branami.

**Architecture:** Stavba dostane volitelný den pokynu `disusedDay` – od něj se nepoužívá (opuštěná
nebo bouraná). Bourání je nový druh stavby `demolition` ze společné práce vsi (jako `repair`), po
dokončení stavbu odstraní a klády dá na hromadu u cesty. Vystěhovaní lidé bydlí v hostitelských
obydlích (`Person.dwellingId` = hostitel) a záznam `VillageState.displaced` drží, kdo patří
k jaké domácnosti a kam se má nastěhovat první. Opevnění dostane úseky pro hráče (`sections.ts`),
díl úseku nese vlastní nástavbu a den zboření.

**Tech Stack:** TypeScript 6, Next.js 16, Babylon.js 9, Vitest, Playwright. Bez migrace DB – vše je
ve stavu vsi (JSON).

**Spec:** [docs/design/demolition.md](../../design/demolition.md) (schváleno Martinem 8. 11. 2026).

## Global Constraints

- Hexagon a determinismus podle CLAUDE.md: doména bez I/O, žádné `Date.now()` ani
  `Math.random()`; vzdálenosti ve výběru obydlí jako čtverec vzdálenosti (bez `Math.hypot`).
- Čísla jen v `rules-buildings.ts`: `DEMOLITION = { laborShare: 0.25, logShare: 0.5,
rampartLaborShare: 0.25 }` s odkazem na demolition.md – Čísla; klády
  `Math.floor(logShare × klády stavby × stav 0–1)`.
- Kapacita obydlí z `DWELLINGS[type].capacity` (zemnice 6, polozemnice 8); dvorec nehostí, nejde
  opustit ani zbourat, hřbitov taky ne.
- Nové části stavu jsou volitelné, chybějící = dnešní chování; žádný přepis starých vsí
  (idempotentní převod = nic se nepřidá). Rozestavěné přestěhování (`Construction.relocates` bez
  `replaces`) se dostaví a domácnost se přestěhuje jako dřív.
- Zlaté otisky: `smith-golden.test.ts`, `craft-skill-golden.test.ts`,
  `paths/__tests__/fortification-paths.test.ts` a otisky krajiny se v žádné úloze nemění;
  `steward.test.ts` smí změnit jen Úloha 6 (s komentářem proč).
- Rozhraní jako 0 A.D.: ikony s číslem, slova jen v `Tooltip`, důvod u kurzoru (`denied`), právo
  `build` (`useRightDenied('build')`). Ikony CC0, zdroj do `apps/web/public/icons/LICENSES.md`.
- Komentáře a texty česky, krátká pomlčka „–“, nikdy „—“; rozhodnutí v docs „návrh Clauda“.
- Každá úloha zapíše mechaniku do své sekce `docs/code/` a před commitem projde `typecheck`, `lint`,
  `test`, `format:check`; úlohy s webem i `test:e2e` (souběžné stromy: `E2E_PORT`,
  `TEST_DATABASE`).
- Klády z bourání: `addLogs(state, logs, position)` z větve feat/log-piles-road (hromada u cesty
  nejblíž stavbě) – úlohy s kládami až po jejím sloučení.

## Review Focus

1. Hráč opustí obydlí, ve kterém už dočasně bydlí lidé z jiného zbouraného domu → musí se vejít
   všichni; cizí si drží svůj původní záznam a nastěhují se jako první (Úloha 2).
2. Stavba se během bourání sama rozpadne (prázdné obydlí dojde na nulu, opuštěná ohrada spadne)
   → bourání zmizí bez klád, bez kroniky a bez chyby (Úloha 3).
3. Hráč přidá bránu do úseku, který se právě boří → práce pokračuje po dílech, které měla (stavba
   drží indexy dílů, ne číslo úseku) (Úloha 8).
4. Dvojklik Zbourat (dva požadavky naráz) → druhý dostane `'Stavba se už bourá.'`, ves má jednu
   stavbu bourání; Opustit a pak Zbourat projde (Úloha 10 – test use-casu; tlačítka `busy`).
5. Starší ves se správcem a rozestavěným přestěhováním → po dostavění se domácnost přestěhuje,
   starý dům zůstane stát prázdný (nebourá se) (Úloha 6).

---

## Pořadí a souběh

| Vlna | Úlohy (souběžně)                                         | Čeká na                                                      |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------ |
| A    | Ú1 doména, Ú4 obydlí bez osadníků, Ú5 konec Přestěhovat  | Ú5 až po sloučení feat/abandon-part                          |
| B    | Ú2 vystěhování, Ú3 bourání, Ú8 opevnění – úseky a Zbořit | Ú1; Ú3 a Ú8 až po feat/log-piles-road, Ú8 i perf/detour-step |
| C    | Ú6 správce, Ú9 opevnění – Vylepšit, Ú10 UI, Ú11 scéna    | Ú6: Ú3 + Ú5; Ú9: Ú8; Ú10: Ú2 + Ú3 + Ú5; Ú11: Ú3              |
| D    | Ú7 humno/jáma/sad, Ú12 opevnění – rozhraní a scéna       | Ú7: Ú10 + Ú11 + Otázky 2–3; Ú12: Ú9 + Ú10                    |

Překryvy souborů v téže vlně (malé konflikty při slučování): Ú4 × Ú5 `relocation-view.ts` (Ú5 soubor
maže – platí smazání); Ú2 × Ú3 `structure-use.ts` (Ú2 mění větev obydlí, Ú3 jen `restoreStructure`);
Ú10 × Ú11 `village-view-types.ts`; Ú7 × Ú12 `selection-details.ts` (jiné druhy výběru). Ú3, Ú6, Ú7
a Ú8 přidávají události do `types-chronicle.ts` – konflikty jen v seznamu.

---

### Úloha 1: Nepoužívaná stavba – Opustit a Vrátit (≈ 110 kroků)

**Files:**

- Create: `packages/game/src/domain/village/structure-use.ts`, `__tests__/structure-use.test.ts`.
- Modify: `types-people.ts:219` (`Dwelling.disusedDay?: number`), `types-livestock.ts:201`
  (`Pen.disusedDay`), `types-land.ts:430` (`SacredBuilding.disusedDay`), `types-chronicle.ts`
  (`structure-abandoned`, `structure-restored`), `rules-buildings.ts` (`DEMOLITION`), `households.ts`
  (`occupyEmptyDwellings`, `availableSettlers` – prázdné obydlí jen v provozu), `pens.ts`
  (`penOccupancy` jen ohrady v provozu), `sacred.ts:439` (`sacredHappiness` jen v provozu;
  `hasShrine` dál počítá i opuštěnou – stojí), `abandonment.ts` (`abandonmentCheck`), `index.ts`.

**Interfaces:**

- Produces (`structure-use.ts`):
  `type UsableStructure = 'dwelling' | 'pen' | 'idol' | 'shrine'` (Ú7 rozšíří),
  `interface UsableRef { structure: UsableStructure; id: number }`,
  `isDisused(s: { disusedDay?: number } | undefined): boolean`,
  `disuseBlock(state: VillageState, ref: UsableRef, day: number): string | null`,
  `beginDisuse(next: VillageState, day: number, ref: UsableRef): void` (mutuje klon),
  `abandonStructure(state, day, ref): BuildResult`, `restoreStructure(state, day, ref): BuildResult`
  (`BuildResult` z `build-intent.ts`; vstupní stav nemění). Dílna = obydlí s `workshop`.
- Texty: `STRUCTURE_MISSING = 'Taková stavba ve vsi není.'`, `STRUCTURE_UNFINISHED = 'Rozestavěnou
stavbu jde jen zrušit.'`, `MANOR_STAYS = 'Dvorec je sídlo vojvody – opustit ani zbourat nejde.'`,
  `STRUCTURE_BUSY = 'Na stavbě se staví – nejdřív stavbu dokonči nebo zruš.'`,
  `ALREADY_DISUSED = 'Stavba už je opuštěná.'`, `NOT_DISUSED = 'Stavba se používá.'`; dočasně
  `DWELLING_OCCUPIED = 'V obydlí bydlí lidé.'` (obydlí s obyvateli – Ú2 ho nahradí volnými místy).
- Kronika: `{ kind: 'structure-abandoned' | 'structure-restored'; structure: UsableStructure; id }`.

- [ ] **Krok 1:** testy `structure-use.test.ts`: (a) opuštěná ohrada → `disusedDay === day`,
      `wear.abandonedDay === day` se stavem z `structureCondition`, `penOccupancy` ji nevrací, koně
      z ní jsou ve `looseHorses` (návrh Clauda), kronika `structure-abandoned`; (b) opuštěná modla →
      `sacredHappiness` jako bez ní; (c) `abandonmentCheck` s návštěvou (`visits` > 0) → opuštěná
      modla dál chátrá a nevznikne stavba `repair`; (d) `restoreStructure` modly se stavem 0,8 → bez
      `disusedDay`, `wear` bez `abandonedDay`, stavba `repair` z 0,8; (e) prázdné opuštěné obydlí →
      `occupyEmptyDwellings` ho neosídlí, `availableSettlers` ho nepočítá mezi prázdná, chátrá
      `decayEmptyDwelling` a na nule zanikne se zříceninou (dnešní pravidlo); (f) důvody: obydlí
      s lidmi `DWELLING_OCCUPIED`, dvorec `MANOR_STAYS`, ohrada s `builtDay === null`
      `STRUCTURE_UNFINISHED`, ohrada s rozestavěným rozšířením (`kind: 'pen'`, `extends`)
      `STRUCTURE_BUSY`, opuštěná znovu `ALREADY_DISUSED`, Vrátit u používané `NOT_DISUSED`.
- [ ] **Krok 2:** pusť testy – padají (modul chybí).
- [ ] **Krok 3:** typy, `DEMOLITION` (komentář s odkazem na demolition.md – Čísla), `structure-use.ts`.
      `beginDisuse`: zapíše `disusedDay`; obydlí – zruší jeho stavbu `rebuild`
      (`returnConstructionWood`); modla, svatyně, ohrada – `cancelRepair` a `wear = { condition,
abandonedDay: day }`. `restoreStructure`: smaže `disusedDay`, u modly, svatyně a ohrady zastaví
      chátrání a pod plným stavem `startRepair`; obydlí stav nezvedá (population.md – znovuosídlené
      obydlí; návrh Clauda).
- [ ] **Krok 4:** filtry užívání: `penOccupancy`, `sacredHappiness`, `occupyEmptyDwellings`,
      `availableSettlers` (prázdná), `abandonmentCheck` (nepoužívaná stavba `on = false`, bez
      opravy). Kreslení, kolize a umístění dál berou všechny stavby (`villagePens` ap. beze změny).
- [ ] **Krok 5:** testy prochází; zlaté otisky a `steward.test.ts` beze změny.
- [ ] **Krok 6:** `docs/code/village-buildings.md` – nová sekce „Opuštění a vrácení stavby“;
      `typecheck`, `lint`, `test`, `format:check`; commit `feat(game): opuštění a vrácení stavby`.

### Úloha 2: Obydlí s obyvateli – volná místa a dočasné ubytování (≈ 120 kroků)

Návrh Clauda: id domácnosti = id obydlí se **neodděluje** (225 výskytů `.dwellingId` v 76 souborech).
Vystěhovaní dostanou `dwellingId` hostitele a záznam `displaced` drží jejich domácnost a pořadí
nastěhování (viz Otázka 5).

**Files:**

- Create: `packages/game/src/domain/village/displaced.ts`, `__tests__/displaced.test.ts`.
- Modify: `types-state.ts` (`displaced?: DisplacedHousehold[]`), `structure-use.ts` (větev obydlí:
  `DWELLING_OCCUPIED` → volná místa, `beginDisuse` → `vacateDwelling`), `households.ts:171`
  (`settleNewDwelling` napřed `rehouseDisplaced`), `households.ts:183` (`occupyEmptyDwellings` uklidí
  prázdné záznamy), `households.ts:220` (`availableSettlers`).

**Interfaces:**

- Consumes: `UsableRef`, `beginDisuse`, `isDisused` (Ú1); `familiesOf` (`families.ts:64`),
  `villageManorId` (`manor.ts`), `occupants` (`people.ts:117`).
- Produces (`displaced.ts`):
  `interface DisplacedHousehold { household: number; day: number; people: { id: number; host: number }[] }`,
  `freePlaces(state: VillageState, exceptId: number): number` (součet `max(0, capacity − obyvatelé)`
  obydlí v provozu kromě `exceptId` a dvorce), `vacateDwelling(next, day, dwellingId): void`,
  `rehouseDisplaced(next, day, dwellingId): boolean`, `displacedCount(state): number`;
  `noRoomReason(missing: number): string` – „Obyvatelé nemají kam jít – v ostatních obydlích chybí
  1 místo / 2–4 místa / 5+ míst.“

- [ ] **Krok 1:** testy: (a) A zemnice 5 lidí, B polozemnice 6 lidí, C zemnice 3 lidi → Opustit A
      projde, s C o 4 lidech `noRoomReason(1)`; (b) rodina (muž, žena, 2 děti) skončí v jednom
      obydlí, když se tam vejde, jinak se rozdělí po lidech (id vzestupně) do nejbližších s místem;
      (c) je-li ve vsi prázdné obydlí v provozu, celá domácnost se do nejbližšího z nich
      přestěhuje (i přeplněná, jako dřív přestěhování), záznam nevznikne, kronika
      `household-relocated`; (d) po dostavění nového obydlí se jako první nastěhuje vystěhovaná
      domácnost (i když čeká rodina ženatého syna) a záznam zmizí; (e) člen, který se mezitím
      oženil do vlastního domu, se zpět nestěhuje (`dwellingId !== host`), mrtví se vynechají;
      (f) `availableSettlers` je o 1 vyšší se záznamem (upozornění „Rodina čeká na dům“);
      (g) Review Focus 1 – opuštění hostitele s cizími ubytovanými: musí se vejít všichni, cizí
      si drží svůj záznam (nový `host`); (h) dvorec nikoho nehostí.
- [ ] **Krok 2:** testy padají.
- [ ] **Krok 3:** `displaced.ts` – rozejití: skupiny = rodiny z `familiesOf` + zbytek domácnosti,
      řazení podle velikosti sestupně, pak nejnižšího id; hostitel = nejbližší (čtverec
      vzdálenosti, pak id) s dost místy pro celou skupinu, jinak po lidech.
- [ ] **Krok 4:** `households.ts` – `settleNewDwelling` volá napřed `rehouseDisplaced` (nejstarší
      záznam podle `day`, pak `household`); `availableSettlers` = dnešní výpočet nad lidmi mimo
      záznamy + `displacedCount`; `occupyEmptyDwellings` smaže záznamy bez živého člena u hostitele.
- [ ] **Krok 5:** testy prochází, zlaté otisky beze změny.
- [ ] **Krok 6:** `docs/code/village-people.md` – sekce „Dočasné ubytování“; `docs/design/population.md`
      – Nové obydlí: vystěhovaná domácnost má přednost (odkaz na demolition.md); kontroly; commit
      `feat(game): obyvatelé opuštěného obydlí bydlí dočasně jinde`.

### Úloha 3: Bourání jako stavba (≈ 130 kroků) – až po sloučení feat/log-piles-road

**Files:**

- Create: `packages/game/src/domain/village/demolition.ts`, `__tests__/demolition.test.ts`.
- Modify: `types-construction.ts:12` (`'demolition'`, `Construction.demolition?: UsableRef`),
  `types-chronicle.ts` (`structure-demolished`), `simulate-build.ts:88` (`constructionNeed`), `:336`
  (`isFinished`), `:350` (`finishConstructions`), `cancel-construction.ts:42,269` (zrušení),
  `labor-report.ts:713` (podíl práce u stavby), `structure-use.ts` (`restoreStructure` při bourání),
  `index.ts`. Jen pro `typecheck` ve webu: `apps/web/lib/person-activity.ts:342`,
  `apps/web/lib/scene/villager-plan.ts:729`, `apps/web/lib/village-view-chronicle.ts:871`
  (jméno stavby „Bourání – Zemnice“); texty a scéna dál Ú10 a Ú11.

**Interfaces:**

- Consumes: `UsableRef`, `disuseBlock`, `beginDisuse`, `isDisused`, `DEMOLITION` (Ú1);
  `addLogs(state, logs, at)` (feat/log-piles-road).
- Produces: `demolitionCost(state, ref, day): { laborManDays: number; logs: number } | null`,
  `demolishStructure(state, day, ref): BuildResult`, `startDemolition(next, day, ref): void` (bez
  kontrol – správce Ú6), `demolitionOf(state, ref): Construction | undefined`,
  `finishDemolition(next, day, c): ChronicleEvent | null`. Texty `ALREADY_DEMOLISHING = 'Stavba se
už bourá.'`, `DEMOLISHING = 'Stavba se bourá – nejdřív bourání zruš.'` (Vrátit).
- Kronika `{ kind: 'structure-demolished'; structure: UsableStructure; id: number; logs: number }`.

Práce = `DEMOLITION.laborShare` × cena stavby z nabídky (`BUILD_COSTS[druh].laborManDays` – obydlí
podle typu, dílna podle řemesla, ohrada `PEN.laborManDays`, modla a svatyně
`SACRED_BUILDINGS[druh].laborManDays`; návrh Clauda – cena, kterou hráč zná). Klády =
`floor(DEMOLITION.logShare × stromy × stav v den dokončení)`: `DWELLING_TREES[type]`,
`workshopTrees(craft)`, `PEN.trees`, `SACRED_BUILDINGS[druh].oaks`; stav obydlí `condition`,
ostatních `structureCondition(wear, …)`.

- [ ] **Krok 1:** testy: (a) zemnice se stavem 0,6 → stavba `demolition` s `cost = 0.25 ×
    BUILD_COSTS.zemnice.laborManDays`, obydlí `disusedDay`; po dokončení obydlí zmizí bez
      zříceniny, klády `floor(0.5 × 7 × 0.6) = 2` na hromadě u obydlí, kronika `logs: 2`;
      (b) ohrada se stavem 1 → 3 klády, rozestavěná rozšíření `penId` zmizí; (c) modla zmizí bez
      `sacredRuins`; (d) bourání bere společnou práci rovným dílem s ostatními stavbami (`build`);
      (e) opuštěnou stavbu jde zbourat, bouranou znovu ne (`ALREADY_DEMOLISHING`), Vrátit při
      bourání `DEMOLISHING`; (f) zrušení: stavba zůstane opuštěná, práce propadne, kronika
      `construction-cancelled` s `constructionKind: 'demolition'` (návrh Clauda); (g) Review
      Focus 2 – stavba zmizí během bourání → bourání zmizí bez klád a bez kroniky.
- [ ] **Krok 2:** testy padají.
- [ ] **Krok 3:** `demolition.ts` + větve v `simulate-build.ts` (potřeba 0, když stavba už není →
      dokončí se naprázdno), `cancel-construction.ts` (bez `dropSite`), `labor-report.ts`
      (práce u polohy stavby), `restoreStructure`.
- [ ] **Krok 4:** nutné větve ve webu (typecheck); testy prochází, zlaté otisky beze změny.
- [ ] **Krok 5:** `docs/code/village-buildings.md` – sekce „Bourání“; kontroly; commit
      `feat(game): bourání staveb ze společné práce`.

### Úloha 4: Obydlí bez lidí k osídlení (≈ 70 kroků)

Riziko zlatých otisků (zjištěno): simulace `BUILD_COSTS.settlers` nečte – cenu předem čte jen
příkaz stavby (hráč a správce). Správce staví obydlí i dílnu jen při `waitingHouseholds > 0`
(`steward.ts:753`), tedy s `settlers ≥ 1` – odebrání ceny jeho rozhodnutí nezmění. Vsi bez nových
akcí se proto nemění; ověří to zlaté testy a `steward.test.ts` (krok 4).

**Files:**

- Modify: `packages/game/src/domain/village/costs.ts:89-99` (zemnice, polozemnice bez `settlers`;
  dílny `:81` podle Otázky 1), `build-intent.ts:346-349` (a `:455-457` podle Otázky 1),
  `steward.ts:61` (`NOT_THE_SLOT` – `NO_SETTLERS` pryč, když zanikne), `households.ts:213-224`
  (komentáře), `application/place-dwelling.ts:12`; při Otázce 1 = ano i `StockResource`
  `'settlers'` pryč (`costs.ts:56-58,186`, `apps/web/components/game/hud/BuildGrid.tsx:20`,
  `apps/web/lib/relocation-view.ts:44`); `apps/web/e2e/village.spec.ts:334`;
  `docs/design/population.md` (Odemčení, Lidé k osídlení); `docs/code/village-people.md`.

**Interfaces:**

- Produces: `BUILD_COSTS.zemnice.upfront = { wood: 7 }`, `polozemnice = { wood: 18 }`; `NO_SETTLERS`
  zanikne, zůstane-li bez použití.

- [ ] **Krok 1:** test `build-intent.test.ts`: ves s `availableSettlers === 0` → `applyBuildIntent`
      zemnice `ok`; po dostavění obydlí prázdné (nikdo k nastěhování); ves s rodinou k oddělení →
      rodina se nastěhuje jako dnes.
- [ ] **Krok 2:** test padá (`NO_SETTLERS`).
- [ ] **Krok 3:** ceny a důvody podle Files.
- [ ] **Krok 4:** testy prochází; zlaté otisky a `steward.test.ts` beze změny (jinak zastav a hlas).
- [ ] **Krok 5:** e2e `village.spec.ts:334` → „obydlí jde stavět i bez lidí k osídlení – pole
      kdykoli“ (stavba projde, obydlí po dostavění prázdné); `test:e2e` jen tento soubor;
      docs; commit `feat(game): obydlí bez lidí k osídlení`.

### Úloha 5: Konec akce Přestěhovat (≈ 100 kroků) – až po sloučení feat/abandon-part

Doména `RelocationIntent`, `startRelocation`, `relocates` a kontroly v `departure.ts`,
`son-departure.ts` zůstávají (správce a staré vsi) – mění je až Ú6.

**Files:**

- Delete: `packages/game/src/application/relocate-household.ts` (+ test), `apps/web/lib/relocation-view.ts`.
- Modify: `application/index.ts`, `application/rights.ts:83` (akce `relocateHousehold` pryč),
  `apps/web/lib/village.ts:510-527`, `app/game/actions.ts:98,147,373`,
  `lib/village-input.ts:421` (`parseRelocateHouseholdInput` pryč),
  `components/game/VillageGame.tsx:51,963-1075,1621` (umisťování nového domu pro stěhování),
  `hud/RelocationControls.tsx` (jen `RelocateButtons` a `RelocationProgress` pryč – odchod, cesta
  a `CancelConstructionButton` zůstávají), `hud/selection/dwelling.tsx`, `hud/SelectionPanel.tsx:71-118,282,301`,
  `lib/selection-details.ts:179-210,917,946-947,1307-1316,1373`, `lib/village-view.ts:82-85,401-402,433,446`,
  `lib/village-view-types.ts:438-440,519,532`, `app/dev/panels/dev-panels.ts`, testy ve
  `hud/__tests__/` a `lib/__tests__/`, `e2e/village.spec.ts:940-1016` (test smazat – nahradí ho
  Ú10), `docs/design/migration.md` (Přestěhování domácnosti zaniká – odkaz demolition.md),
  `docs/code/village-people.md`, `docs/code/web-ui.md`.

**Interfaces:**

- Produces: rozestavěné přestěhování se v rozhraní ukáže jako běžná stavba obydlí (staveniště se
  Zrušit) – návrh Clauda. Kronika starých vsí (`relocation-started`, `household-relocated`,
  `relocation-cancelled`) dál čitelná.

- [ ] **Krok 1:** upravené testy: `rights.test.ts` bez `relocateHousehold`; `SelectionPanel.test.tsx`
      – panel obydlí i výběr víc obydlí bez `relocate-*` tlačítek; `village-input.test.ts` bez
      parseru stěhování.
- [ ] **Krok 2:** odebrání podle Files; `typecheck`, `lint`, `test` prochází.
- [ ] **Krok 3:** `test:e2e` (`village.spec.ts`), docs; commit `refactor(web): akce Přestěhovat zaniká`.

### Úloha 6: NPC správce – nový dům a zbourání starého (≈ 90 kroků) – po Ú3 a Ú5

**Files:**

- Modify: `packages/game/src/domain/village/steward-rebuild.ts:76-124` (`stewardRelocate` →
  `stewardReplace`), `build-intent.ts:87-119,223,275,391-430` (`RelocationIntent` →
  `ReplacementIntent`, `RELOCATION_BLOCKED` pryč), `actions.ts:717-750` (`startRelocation` →
  `startReplacement`), `relocation.ts` (`relocationAffordability` pryč; `relocatingHouseholds`,
  `relocationBlock`, `moveRelocatedHousehold`, `returnConstructionWood` zůstávají),
  `types-construction.ts:139` (`replaces?: true`, komentář `relocates`), `simulate-build.ts:485,557,575`,
  `docs/design/steward.md` (Přestavba), `docs/code/village-steward.md`.

**Interfaces:**

- Consumes: `startDemolition(next, day, { structure: 'dwelling', id })` (Ú3).
- Produces: `interface ReplacementIntent { kind: 'replacement'; dwellingId: number; type:
BuildableDwellingType; position: Position; plot?: DwellingPlot }` – stavba `dwelling`
  s `relocates: dwellingId` a `replaces: true`; po dostavění `moveRelocatedHousehold`, pak
  `startDemolition` starého (už prázdného) domu – bez kontroly volných míst.

- [ ] **Krok 1:** testy `steward-rebuild.test.ts`: dožilé obydlí správce s lepším slotem → stavba
      s `relocates` + `replaces`; po dostavění domácnost v novém domě, starý dům `disusedDay`
      a stavba `demolition`, po ní kronika `structure-demolished`; Review Focus 5 – stará stavba
      `relocates` bez `replaces` → domácnost přestěhovaná, starý dům stojí prázdný a nebourá se;
      veto zrušené stavby (`cancel-construction.ts:287`) jako dnes.
- [ ] **Krok 2:** testy padají; implementace podle Files; testy prochází.
- [ ] **Krok 3:** `steward.test.ts` – změnu otisku zapiš komentářem „správce místo stěhování
      bourá (demolition.md – Správce)“; ostatní zlaté otisky beze změny.
- [ ] **Krok 4:** docs; kontroly; commit `feat(game): správce postaví nový dům a starý zbourá`.

### Úloha 7: Humno, obilná jáma a sad (≈ 100 kroků) – po Ú10, Ú11 a odpovědích na Otázky 2–3

**Files:**

- Modify: `types-land.ts:299,356,375` (`disusedDay` u `Orchard`, `ThreshingFloor`, `GrainPit`;
  chátrání podle Otázky 2), `structure-use.ts` (`UsableStructure` + `'threshing-floor' | 'grain-pit' |
'orchard'`), `demolition.ts` (cena: `HUMNO.laborManDays`, `GRAIN_PITS.digManDays`,
  `ORCHARD.plantingPerHa × ha`; klády: humno a jáma 0, sad podle Otázky 3), `threshing-floors.ts`
  (mlácení jen na humně v provozu), `grain-pits.ts` (plnění a odběr jen z jam v provozu; Opustit
  vyprázdní jámu – `grainKg = 0`, `state: 'empty'`, zrno je pak mimo jámy, `storesKg` se nemění),
  `orchard.ts` (péče, sklizeň a obnova jen v provozu; zbouraný sad uvolní čtverce jako zrušená
  výsadba), `rules-buildings.ts` (`ABANDONMENT.fallYears` podle Otázky 2), `abandonment.ts`;
  panely a scéna: `apps/web/lib/selection-details.ts` (`use` u `threshing-floor`, `grain-pit`,
  `orchard`), `threshing-floor-layout.ts` (`floorPhase` s `1 − průběh`); docs.

- [ ] **Krok 1:** testy: opuštěné humno nemlátí (snopy čekají na jiném humně), jáma s 800 kg →
      `looseGrainKg` +800, zásoby stejné; sad bez sklizně; Zbourat sad s 10 dospělými jabloněmi →
      klády podle Otázky 3; chátrání podle Otázky 2.
- [ ] **Krok 2:** implementace; testy a zlaté otisky; e2e panelu humna (ikony Opustit/Zbourat).
- [ ] **Krok 3:** docs (`village-buildings.md`, `production-chains`/`orchard` v `docs/design/`
      jen odkaz); commit `feat(game): opuštění a bourání humna, jámy a sadu`.

### Úloha 8: Opevnění – úseky mezi branami a Zbořit (≈ 140 kroků) – po Ú1, až po sloučení perf/detour-step a feat/log-piles-road

Návrh Clauda: úsek = díl s branou + díly po směru hodin až před další díl s branou; obvod bez
brány i s jednou branou = jeden úsek. Zbořit vynechá díl s branou („brány zůstávají na koncích“).
Akce míří na **díl** (`segment`), server dohledá úsek – pozdější brána úsek rozdělí. Na opevnění
dál běží jen jedna stavba (`FORT_BUSY`).

**Files:**

- Create: `packages/game/src/domain/village/fortification/sections.ts`, `__tests__/sections.test.ts`.
- Modify: `fortification/types.ts:11` (`FortSegment.demolishedDay?: number`,
  `FortSegment.top?: FortTop | 'none'`), `:55` (`FortBuildWork` + `'demolish' | 'level'`),
  `fortification/life.ts:64` (`segmentIsGap`), `fortifications.ts:69` (`segmentTop`), `:443-516`
  (`segmentDone`, `workFortification`, `finishFortification` – zboření dílu, klády), nové
  `startSectionDemolition`; `fortification/decay.ts:42,64,79,101,108,154` (zbořený díl se nepřestavuje,
  nechátrá, val se neudržuje), `fortification/walls.ts:103`, `fortification/defense.ts:26,85`,
  `war/march-grid.ts:217,246`, `war/battle.ts:333-344`, `war/raid-apply.ts:437`, všech 19 čtení
  `fort.top` (`grep -rn "fort\.top\|f\.top\b"`) → `segmentTop`; `types-chronicle.ts`
  (`fortification-demolished`).

**Interfaces:**

- Produces: `interface FortSection { segments: readonly number[]; gateSegment: number | null }`,
  `fortSections(fort: Pick<Fortification, 'segments' | 'gates'>): FortSection[]`,
  `sectionOf(fort, segment: number): FortSection | null`,
  `segmentIsGap(s: Pick<FortSegment, 'builtDay' | 'breachedDay' | 'demolishedDay'>): boolean`,
  `segmentTop(fort: Fortification, s: FortSegment): FortTop | null` (`s.top ?? fort.top`, `'none'` →
  null), `sectionDemolition(state, landscape, input: { fortificationId: number; segment: number }):
{ work: 'demolish' | 'level'; laborManDays: number; logs: number } | { reason: string }`,
  `startSectionDemolition(state, day, landscape, input): FortificationResult`.
- Pravidla: `demolish` – plot a palisáda (díl `demolishedDay`), na valu jen nástavba (`top: 'none'`);
  `level` – val bez nástavby (`demolishedDay`). Práce dílu = `DEMOLITION.laborShare` × práce dílu
  podle `fortificationCost` (val `rampartLaborShare`); klády = `floor(logShare × stromy dílů ×
stav)` sečtené za celou stavbu, na hromadu při `finishFortification` (návrh Clauda – dolů na celé
  jednou). Text `FORT_SECTION_GONE = 'Úsek už je zbořený.'`.

- [ ] **Krok 1:** testy `sections.test.ts`: 3 brány → 3 úseky začínající dílem s branou; 1 brána →
      1 úsek ze všech dílů; 0 bran → 1 úsek.
- [ ] **Krok 2:** testy zboření: palisáda – stavba `fortification` s `fortWork: 'demolish'` bez dílu
      s branou, cena podle pravidla; po dokončení díly `demolishedDay`, klády na hromadě, kronika;
      zbořený díl je mezera (`fortBlockingSegments` ho nevrací, `defense.ts` – průchod jako průlom),
      `decideFortRebuilds` ho nepřestaví; val s plotem: 1. Zbořit → `top: 'none'`, 2. Zbořit →
      `level`; Review Focus 3 – `addGate` během zboření nezmění díly stavby.
- [ ] **Krok 3:** testy padají; implementace; refaktor `fort.top` a mezer přes `segmentTop`
      a `segmentIsGap` bez změny chování.
- [ ] **Krok 4:** testy, `fortification-paths.test.ts` a válečné testy beze změny.
- [ ] **Krok 5:** `docs/code/village-fortifications.md` – sekce „Úseky pro hráče a zboření“;
      kontroly; commit `feat(game): zboření opevnění po úsecích mezi branami`.

### Úloha 9: Opevnění – Vylepšit po úsecích (≈ 110 kroků) – po Ú8

**Files:**

- Modify: `fortifications.ts:323-421` (`startFortificationUpgrade` – vstup `segment?: number`; bez
  něj celé opevnění jako dnes = správce), `placement-fortifications.ts:129`
  (`checkFortificationPlacement(…, onlySegments?: ReadonlySet<number>)` – pás palisády jen v úseku),
  `fortification/band.ts:84-138` (pás po dílech), `build-intent.ts:141` (`segment?`),
  `application/upgrade-fortification.ts` (`segment?`).

**Interfaces:**

- Produces: `sectionUpgrades(state, landscape, obstacles, input: { fortificationId; segment }):
FortUpgradeOption[]`, `interface FortUpgradeOption { work: 'upgrade' | 'top'; kind: FortKind;
top: FortTop | null; laborManDays: number; trees: number; block: string | null }`.
- Pravidla (demolition.md – Opevnění): plot → palisáda; val → val s plotem / val s palisádou;
  val s plotem → val s palisádou (plot na valu nic nevrací – jako plot → palisáda, návrh
  Clauda); cena podle délky úseku (`fortificationCost`). Mezera podle Otázky 4.

- [ ] **Krok 1:** testy: plot se 2 branami – Vylepšit úsek A → palisáda jen v A, B plot; val –
      úsek A nástavba plot, úsek B palisáda (`segmentTop` po dílech); val s plotem → val
      s palisádou v úseku; překážka v pásu palisády jen v úseku B → A projde, B důvod; bez
      `segment` výsledek jako dnes (`steward.test.ts`, zlaté otisky beze změny).
- [ ] **Krok 2:** testy padají; implementace; testy prochází.
- [ ] **Krok 3:** docs (`village-fortifications.md`, `docs/design/fortifications.md` – Druhy: po
      úsecích); kontroly; commit `feat(game): vylepšení opevnění po úsecích`.

### Úloha 10: Rozhraní staveb – use-casy, práva, panely, e2e (≈ 140 kroků) – po Ú2, Ú3, Ú5

**Files:**

- Create: `packages/game/src/application/structure-use.ts` (+ test s in-memory repozitářem),
  `apps/web/components/game/hud/StructureUseButtons.tsx` (+ behavior test), ikony
  `apps/web/public/icons/resources/{abandon-structure,demolish,restore}.svg` (CC0, `LICENSES.md`).
- Modify: `application/index.ts`, `application/rights.ts` (`abandonStructure`, `demolishStructure`,
  `restoreStructure`: `'build'`), `apps/web/lib/village-input.ts` (`parseStructureUseInput`),
  `lib/village.ts` (3× `…ForPlayer` přes `actOn`), `app/game/actions.ts` (3 server actions),
  `lib/selection-details.ts` (`use?: StructureUseView` u `dwelling`, `pen`, `sacred`),
  `lib/village-view.ts`, `lib/village-view-types.ts`, `lib/village-view-chronicle.ts` (texty kroniky),
  `lib/person-activity.ts` („Bourá zemnici“), `hud/selection/dwelling.tsx`, `hud/selection/sacred.tsx`,
  panel ohrady, `components/game/VillageGame.tsx` (`runBuildAction`), `app/dev/panels/dev-panels.ts`,
  `e2e/village.spec.ts`, `docs/code/web-ui.md`.

**Interfaces:**

- Consumes: `abandonStructure`, `restoreStructure`, `disuseBlock` (Ú1), `demolishStructure`,
  `demolitionCost`, `demolitionOf` (Ú3), `displaced` (Ú2).
- Produces: use-casy `abandonStructure | demolishStructure | restoreStructure(deps: { villages },
input: { villageId; landscape; today; structure: UsableStructure; id: number }): Promise<VillageResult>`
  (`updateLivingVillage`); `interface StructureUseView { structure; id; state: 'in-use' | 'abandoned'
| 'demolishing'; block: string | null; demolition: { laborManDays: number; logs: number } | null;
demolishing: { constructionId: number; progress: number } | null; lodgers?: number }`.
- Texty: popisky „Opustit – stavba se přestane používat a začne chátrat“, „Zbourat – {práce} čd,
  {klády} zpět na hromadu“, „Vrátit – stavba se zase bude používat“; kronika „Stavba opuštěna.“,
  „Stavba zbourána – N klád na hromadu.“ (skloňování 1 kláda / 2–4 klády / 5 klád), „Stavba
  vrácena.“; u obydlí s ubytovanými ikona s počtem a popisek „Dočasně tu bydlí N lidí
  z opuštěného domu“. `data-testid`: `structure-abandon`, `structure-demolish`, `structure-restore`.

- [ ] **Krok 1:** test use-casu: Opustit → uloženo; Opustit a hned Zbourat téže stavby projde
      (opuštěnou jde zbourat); Review Focus 4 – dvakrát Zbourat → `'Stavba se už bourá.'`, jedna
      stavba `demolition`.
- [ ] **Krok 2:** use-casy, práva, vstup, server actions; `rights.test.ts` zahrne nové akce.
- [ ] **Krok 3:** behavior testy `StructureUseButtons` (vzor `AbandonPartButton` z feat/abandon-part):
      v provozu Opustit + Zbourat, opuštěná Vrátit + Zbourat, bouraná jen Zrušit
      (`CancelConstructionButton`); `block` zašedí s důvodem; bez práva `build` důvod práva;
      během akce `busy`.
- [ ] **Krok 4:** view, panely, kronika, aktivita, dev panely.
- [ ] **Krok 5:** e2e `village.spec.ts`: ves se dvěma obydlími (druhé prázdné – Ú4) → vyber původní,
      Zbourat → obyvatelé v druhém, staveniště bourání; ohrada Opustit → Vrátit; obydlí bez místa
      → `structure-demolish` zašedlé s důvodem u kurzoru.
- [ ] **Krok 6:** `test:e2e`, docs; commit `feat(web): opustit, zbourat a vrátit stavbu`.

### Úloha 11: Scéna staveb – rozebírání a opuštěné stavby (≈ 100 kroků) – po Ú3 (souběžně s Ú10)

**Files:**

- Modify: `apps/web/lib/village-view-buildings.ts` (`demolition?: number` průběh 0–1 u obydlí,
  ohrady, modly a svatyně ve scéně), `lib/scene/village-types.ts`, kreslení obydlí a dílen
  (`village-construction.ts:670` `constructionState(kind, 1 − průběh)` – rozestavěná stavba
  pozpátku), `sacred-renderer.ts`, `village-pens.ts` / `pen-layout.ts:946` (`penStage(1 − průběh)`),
  `villager-plan-sites.ts` a `villager-plan.ts:729` (vesničané pracují u bourané stavby jako na
  staveništi), `structure-decay.ts` (opuštěná podle dnešních stupňů – ověřit, že `wear` z Ú1 dává
  stupně; obydlí chátrá přes `condition` – `dwelling-decay.ts`), `docs/code/scene-village.md`.

**Interfaces:**

- Consumes: `Construction.demolition`, průběh `done / cost` (Ú3).
- Produces: scéna bez nových modelů – rozebírání = fáze staveniště pozpátku (návrh Clauda); jáma
  a sad zmizí až po dokončení (Ú7).

- [ ] **Krok 1:** unit testy čistých funkcí: průběh bourání 0,25 → stejné díly jako
      `constructionState(kind, 0.75)`; ohrada `penStage(0.75)`; opuštěná modla se stavem 0,4 →
      `structureDecayStage(0.4)`.
- [ ] **Krok 2:** implementace; „kreslí se jen při změně“ – průběh bourání nastaví `needsRender`
      jen při změně stupně.
- [ ] **Krok 3:** e2e kontrola, že scéna s bouranou stavbou se nakreslí (rozšíř test z Ú10, malý
      snímek na konci); docs; commit `feat(web): rozebírání a opuštěné stavby ve scéně`.

### Úloha 12: Opevnění – rozhraní, scéna a e2e (≈ 140 kroků) – po Ú9 a Ú10

**Files:**

- Create: `packages/game/src/application/demolish-fortification-section.ts` (+ test).
- Modify: `application/upgrade-fortification.ts` (`segment`), `application/rights.ts`
  (`demolishFortificationSection: 'build'`), `apps/web/lib/village-input.ts`, `lib/village.ts:795`,
  `app/game/actions.ts:466`, `lib/scene/village-picking.ts:75,296,443` (`{ kind: 'fortification';
id; segment }` – díl nejblíž kliku), `lib/fort-view.ts` (úsek: díly, možnosti vylepšení, zboření),
  `lib/selection-details.ts:634`, `hud/selection/fortification.tsx` (ikony Vylepšit podle
  `FortUpgradeOption` a Zbořit), `lib/scene/selection-highlight.ts` (zvýraznění pásu úseku),
  `fortification-layout.ts` / `fortification-renderer.ts` (`fortSitePhase(layer, 1 − průběh)`,
  zbořený díl se nekreslí, `top: 'none'` bez nástavby), `rampart-mesh.ts` (srovnaný val – mezera),
  `e2e/fortification.spec.ts`, `docs/code/village-fortifications.md`,
  `docs/design/fortifications.md` (Rozhraní – úseky).

**Interfaces:**

- Consumes: `fortSections`, `sectionOf`, `sectionDemolition`, `startSectionDemolition` (Ú8),
  `sectionUpgrades` (Ú9).

- [ ] **Krok 1:** test use-casu zboření a `village-picking` (klik u dílu 5 → `segment: 5`).
- [ ] **Krok 2:** akce, práva, view, panel; behavior test panelu: ikony Vylepšit podle možností
      úseku, Zbořit s prací a kládami v popisku, důvod u kurzoru.
- [ ] **Krok 3:** zvýraznění úseku a scéna zboření (unit test čistých funkcí rozvržení).
- [ ] **Krok 4:** e2e `fortification.spec.ts`: plot se dvěma branami – klik na obvod zvýrazní úsek,
      Vylepšit → staveniště palisády jen v úseku; Zbořit → mezera.
- [ ] **Krok 5:** `test:e2e`, docs; commit `feat(web): úseky opevnění – vylepšit a zbořit`.

---

## Závěr po sloučení všech úloh

- Celé `test:e2e`, `test`, zlaté otisky; `docs/design/demolition.md` doplnit „Stav: implementováno“
  a odpovědi na otázky níž (Martinova slova s datem).

## Rizika

- **Obydlí bez osadníků a zlaté otisky:** podle kódu se vsi bez nových akcí nemění (simulace cenu
  předem nečte, správce staví jen pro čekající rodinu). Kdyby Ú4 přesto pohnula otiskem nebo
  `steward.test.ts`, zastavit a hlásit – znamenalo by to skrytou cestu stavby obydlí bez
  `waitingHouseholds`.
- **Správce:** od Ú6 se ves správce s dožilým obydlím na horším místě liší (bourání bere společnou
  práci a vrací klády) – změna otisku `steward.test.ts` je očekávaná; deník vsí ze hry ji ukáže.
- **Refaktor opevnění (Ú8):** 19 čtení `fort.top` a kontroly průlomu ve válce přejdou na
  `segmentTop` / `segmentIsGap` – musí být bit po bitu stejné (`fortification-paths`, válečné testy).
- **Souběžné větve:** feat/abandon-part (panely, práva, vstup, e2e), feat/log-piles-road (`addLogs`
  s místem, `relocation.ts`, `simulate-build.ts`) a perf/detour-step (průchody hradbou) – úlohy
  označené „až po sloučení“ nepouštět dřív.
- **Domácnost = obydlí (Ú2):** ubytovaní se v simulaci chovají jako členové hostitelského domu
  (Otázka 5); záznam `displaced` musí přežít smrt, sňatek i odchod členů (testy e–g).

## Otázky na Martina

1. **Dílny bez lidí k osídlení?** Návrh mluví o obydlí; dílna je obydlí s řemeslem a dnes taky chce
   jednu domácnost. Doporučení: **ano, stejně** – prázdná dílna stojí, dokud se nenastěhuje rodina
   (Ú4).
2. **Jak chátrá opuštěné humno, obilná jáma a sad?** Dnes nechátrají vůbec. Doporučení: humno
   zaroste za 10 let, jáma se zasype za 5 let; sad se přestane ošetřovat a sklízet, stromy stojí,
   dokud nedožijí, a Vrátit je zase sklízí (Ú7).
3. **Kolik klád dá vykácený sad?** Návrh říká „klády za dospělé stromy“. Doporučení: ½ klády za
   dospělou jabloň (polovina jako u bourání), dolů na celé (Ú7).
4. **Jde zbořený úsek opevnění postavit znovu?** Doporučení: ano – Vylepšit na mezeře postaví
   úsek znovu druhem opevnění za cenu nového úseku (Ú9).
5. **Dočasně ubytovaní jako členové hostitelského domu?** V simulaci se počítají do domu, kde
   bydlí (tísnění, odchod rodin, hlava domácnosti); svou domácností jsou pro nastěhování do
   prvního prázdného domu. Oddělit id domácnosti od id obydlí by znamenalo projít 225 míst kódu.
   Doporučení: **ano, takhle** (Ú2).
