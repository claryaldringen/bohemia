# Simulace vsi – implementační plán (1/4: herní jádro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Čistá deterministická simulace jedné vsi v `packages/game` – lidé, domácnosti, obydlí, společná pole v přílohové soustavě, práce, zásoby, nasycení a kronika – s herními akcemi hráče a kalibračním skriptem.

**Architecture:** Nový doménový modul `packages/game/src/domain/village/`. Stav vsi je obyčejný JSON (pole a čísla – později se uloží do DB beze změny). Hlavní funkce `advanceVillage(state, toDay)` krokuje po herních dnech; náhoda každého dne se odvodí ze seedu vsi a indexu dne, takže výsledek nezávisí na tom, po jakých kouscích se ves dopočítává. Geometrie (půdorysy, obrysy polí, překážky) sem nepatří – akce dostanou hotové díly pole a ceny překážek od volajícího (plány 2 a 3).

**Tech Stack:** TypeScript 6 strict (`noUncheckedIndexedAccess`), Vitest, `tsx` pro skript. Žádné nové závislosti.

**Spec:** `docs/design/population.md` a `docs/design/fields.md` (obojí schváleno 17. 10. 2026). Executor čte oba dokumenty – plán z nich vychází a čísla bere z nich.

**Navazující plány (samostatně, až po tomto):** 2 – vrstva překážek v krajině (`packages/game` + scéna kreslí z ní); 3 – ukládání (Drizzle), use-casy a API (založit ves, postavit obydlí, založit, upravit a zrušit pole, načíst a dopočítat ves; ověření polohy půdorysu a obrysu proti krajině a překážkám); 4 – rozhraní a scéna (umístění půdorysu, kreslení obrysu pole, panel vsi a kronika, modely zemnic, pole ve scéně, přestavba krajiny za běhu).

## Global Constraints

- Doména neimportuje infrastrukturu ani `application/` (hlídá ESLint `domainRule`); žádné `Date.now()`, `new Date()` bez argumentu, `Math.random()` v `packages/game/src`.
- Explicitní návratové typy funkcí, žádné `any`; komentáře česky, identifikátory anglicky; typografie v komentářích „–“ s mezerami.
- Stav vsi je JSON-serializovatelný: jen objekty, pole, čísla, řetězce, `null` – žádné `Map`, `Set`, třídy, `undefined` v polích.
- Všechna čísla ze specifikace jsou pojmenované konstanty v jediném souboru `domain/village/rules.ts` (kalibrace je mění jen tam).
- Herní den = index dne od 1. 1. 500 (`dayIndexOf` z kalendáře); rok = 365,25 dne pro věk, roční okna podle kalendářních měsíců.
- Testy: Vitest, názvy `describe`/`it` česky, soubory v `domain/village/__tests__/`. Jeden soubor spustíš z `packages/game`: `npx vitest run src/domain/village/__tests__/<soubor>.test.ts` (kalendář: `src/domain/__tests__/calendar.test.ts`).
- Před každým commitem z kořene repa: `npm run typecheck && npm run lint && npm run test && npm run format:check`. Commity Conventional Commits česky, `feat(game): …`, na konci řádek `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Dopočítání po kouscích:** ves dopočítaná jedním voláním na 10 let a stejná ves po 1 dni, 1 měsíci a nepravidelných kouscích musí mít bitově stejný stav (hráč chodí nepravidelně). Test v Task 9.
2. **Prázdné a okrajové vsi:** domácnost bez dospělých, ves bez polí, nulová potřeba jídla – žádné `NaN`, nasycení v ⟨0, 1⟩, zásoby nikdy záporné. Testy v Task 3 a Task 9.
3. **Hlad nesmí vyhubit ves:** ves s nasycením 0 dlouhé roky si podrží aspoň jeden dospělý pár (po hájení i během něj). Test v Task 7.
4. **Konec světa:** `advanceVillage` za 1. 1. 1500 (index `TOTAL_GAME_DAYS`) vyhodí `RangeError`, dopočet přesně do posledního dne projde. Test v Task 9.
5. **Pole založené pozdě v sezóně** (po dubnu) a ves, která ještě nemá hotový žádný díl: žije ze zásob, osev se naplánuje k 1. září, nic nespadne. Test v Task 9.

---

### Task 1: Kalendářní převody a datový model vsi

**Files:**

- Modify: `packages/game/src/domain/calendar.ts` (exportovat `dayIndexOf`, přejmenovat vnitřní `dateFromDayIndex` na exportované `dateOfDayIndex`)
- Create: `packages/game/src/domain/village/types.ts`, `packages/game/src/domain/village/rules.ts`, `packages/game/src/domain/village/index.ts`
- Modify: `packages/game/src/index.ts` (`export * from './domain/village';`)
- Test: `packages/game/src/domain/__tests__/calendar.test.ts`, `packages/game/src/domain/village/__tests__/rules.test.ts`

**Interfaces:**

- Produces: `dayIndexOf(date: CalendarDate): number`, `dateOfDayIndex(dayIndex: number): GameDate`; typy níže; konstanty níže.

```ts
// types.ts – stav vsi (JSON)
export type DwellingType = 'zemnice' | 'polozemnice';
export type FieldSurface = 'meadow' | 'shrub' | 'forest';
export interface Position {
  x: number;
  z: number;
  rotation: number;
} // svět, m; ověřuje plán 3
export interface Person {
  id: number;
  bornDay: number;
  dwellingId: number;
}
export interface Dwelling {
  id: number;
  type: DwellingType;
  builtDay: number;
  condition: number /* 0–1 */;
  position: Position;
}
export type PartState = 'founding' | 'ready' | 'sown' | 'fallow';
export interface FieldPart {
  id: number;
  fieldId: number;
  areaM2: number;
  distanceM: number;
  naturalFertility: number; // 0–100 z krajiny
  fertilityShare: number; // aktuální úrodnost / přirozená, 0–1
  bonusUntilDay: number | null; // +20 po vymýcení lesa
  state: PartState;
  sownYears: number; // kolik let v řadě oseto
  fallowSinceDay: number | null; // od kdy leží v přílohu
  foundingCost: number; // člověkodny (povrch × plocha + překážky)
  foundingDone: number;
  surface: FieldSurface; // povrch při založení
}
export interface Field {
  id: number;
  outline: [number, number][];
} // obrys jen nese plán 3
export type ConstructionKind = 'dwelling' | 'rebuild' | 'field';
export interface Construction {
  id: number;
  kind: ConstructionKind;
  startedDay: number;
  cost: number;
  done: number;
  dwellingType: DwellingType | null;
  position: Position | null; // dwelling
  dwellingId: number | null; // rebuild
  fieldId: number | null; // field – zakládá díly od nejbližšího
}
export type TaskName = 'reclaim' | 'dig' | 'sow' | 'weed' | 'harvest' | 'thresh';
export interface YearPlan {
  plannedDay: number;
  partIds: number[];
  required: Record<TaskName, number>;
  done: Record<TaskName, number>;
}
export type ChronicleEvent = { day: number } & (
  | { kind: 'village-founded' }
  | { kind: 'birth' }
  | { kind: 'death'; group: 'child' | 'adult' | 'elder' }
  | { kind: 'household-founded'; dwellingId: number }
  | { kind: 'household-merged'; fromDwellingId: number; toDwellingId: number }
  | {
      kind: 'construction-finished';
      constructionKind: ConstructionKind;
      dwellingId: number | null;
      fieldId: number | null;
    }
  | { kind: 'rebuild-decided'; dwellingId: number; type: DwellingType }
  | { kind: 'harvest'; kg: number }
  | { kind: 'hunger-began' }
  | { kind: 'hunger-ended' }
  | { kind: 'part-became-forest'; partId: number }
);
export interface VillageState {
  seed: number;
  foundedDay: number;
  lastDay: number; // poslední už odsimulovaný den
  nextId: number;
  people: Person[];
  dwellings: Dwelling[];
  fields: Field[];
  parts: FieldPart[];
  constructions: Construction[];
  plan: YearPlan | null;
  threshingFromPlan: YearPlan | null;
  storesKg: number;
  domesticBacklog: number;
  hungry: boolean;
  commonLaborHistory: number[]; // společná práce posledních 30 dní (pro „má na to“)
  chronicle: ChronicleEvent[];
}
```

`rules.ts` – hodnoty přesně ze specifikace (komentář u každé odkazuje na dokument):

```ts
export const DWELLINGS = {
  zemnice: {
    capacity: 6,
    cost: 60,
    lifespanYears: 15,
    repairAtEndOfLifePerYear: 35,
    childDeathFactor: 1,
  },
  polozemnice: {
    capacity: 8,
    cost: 220,
    lifespanYears: 22,
    repairAtEndOfLifePerYear: 40,
    childDeathFactor: 0.8,
  },
} as const;
export const BETTER_DWELLING: Record<DwellingType, DwellingType> = {
  zemnice: 'polozemnice',
  polozemnice: 'polozemnice',
};
export const AGE = { olderChild: 7, adult: 14, elder: 45 } as const;
export const LABOR_PER_DAY = { olderChild: 0.3, adult: 1, elder: 0.5 } as const;
export const START_AGES = [25, 25, 13, 12] as const;
export const BIRTHS_PER_PAIR_PER_YEAR = 1 / 3;
export const CHILD_DEATH_BEFORE_ADULT = 0.4; // → ročně 1 − 0,6^(1/14)
export const ADULT_DEATHS_PER_YEAR = 0.015;
export const ELDER_DEATHS_PER_YEAR = 0.08;
export const CROWDED_BIRTH_FACTOR = 0.3;
export const CROWDED_DEATH_FACTOR = 1.5;
export const LUCKY_YEARS = 30;
export const LUCKY_CHILD_DEATH_FACTOR = 0.5;
export const HUNGER = { birthsStopAt: 0.5, birthsFullAt: 0.95, deathExtraAtZero: 3 } as const;
export const UNLOCK_MIN_ADULTS = 4;
export const FOOD_NEED_KG_PER_YEAR = { child: 100, adult: 180, elder: 140 } as const;
export const STORAGE_LOSS_PER_YEAR = 0.1;
export const START_STORES_MONTHS = 18;
export const SOW_RESERVE = 0.1;
export const STORES_HIGH_YEARS = 1.5;
export const YIELD_BASE_KG_PER_HA = 760; // × (0,4 + 0,6 × úrodnost / 100)
export const SEED_KG_PER_HA = 175;
export const UNWEEDED_YIELD = 0.6; // neopletý díl dá 60 % (návrh Clauda, kalibrace)
export const FERTILITY = {
  sowDepletion: 0.12,
  fallowRecovery: 0.05,
  sowableMin: 0.7,
  fallowReady: 0.95,
  forestBonus: 20,
  forestBonusYears: 3,
} as const;
export const FIELD_WORK_PER_HA = { dig: 80, sow: 10, weed: 30, harvest: 50, thresh: 30 } as const; // sklizeň 30 + odnos 20
export const RECLAIM_COST_PER_HA = [
  { maxYears: 2, cost: 0 },
  { maxYears: 5, cost: 40 },
  { maxYears: 10, cost: 60 },
  { maxYears: 15, cost: 150 },
  { maxYears: Infinity, cost: 250 },
] as const;
export const FOUNDING_COST_PER_HA: Record<FieldSurface, number> = {
  meadow: 40,
  shrub: 150,
  forest: 250,
};
export const OBSTACLE_COST = {
  stone: 1,
  boulder: 8,
  tree: 3,
  youngTree: 1,
  snag: 3,
  fallenTree: 2,
  stump: 2,
  shrub: 0.5,
} as const;
export const DISTANCE = { freeM: 100, percentPer10M: 1 } as const;
export const FIELD_LIMITS = { maxDistanceM: 800, minAreaM2: 1000 } as const;
export const DAILY_MIN_PER_HOUSEHOLD = 0.5;
export const DOMESTIC = { perHousehold: 0.3, perPerson: 0.12, backlogMaxDays: 60 } as const;
export const COMMON_LABOR_HISTORY_DAYS = 30;
// Okna prací (měsíce včetně); kopání, které se na podzim nestihne, pokračuje v březnu–dubnu.
export const WINDOWS: Record<TaskName, readonly (readonly [number, number])[]> = {
  reclaim: [[9, 11]],
  dig: [
    [9, 11],
    [3, 4],
  ],
  sow: [[3, 4]],
  weed: [[5, 6]],
  harvest: [[7, 8]],
  thresh: [
    [11, 12],
    [1, 2],
  ],
};
```

- [ ] **Step 1: Write the failing tests** – kalendář: `dayIndexOf({ year: 500, month: 1, day: 1 })` → `0`; `dateOfDayIndex(dayIndexOf({ year: 1024, month: 10, day: 16 }))` → `{ year: 1024, month: 10, day: 16, dayOfYear: 290, season: 'autumn' }`; `dateOfDayIndex(TOTAL_GAME_DAYS - 1)` → 31. 12. 1499. Pravidla: `childDeathsPerYear()` (exportovaná funkce v `rules.ts`) `toBeCloseTo(0.03583, 4)`; `DWELLINGS.zemnice.capacity === 6`.
- [ ] **Step 2: Run** (z `packages/game`) `npx vitest run src/domain` – FAIL (chybí exporty).
- [ ] **Step 3: Implement** exporty v `calendar.ts`, `types.ts`, `rules.ts` (`childDeathsPerYear(): number` = `1 − (1 − CHILD_DEATH_BEFORE_ADULT) ** (1 / AGE.adult)`), `village/index.ts` re-exportuje moduly, `src/index.ts`.
- [ ] **Step 4: Run** testy – PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(game): datový model vsi a pravidla obyvatelstva a polí`

### Task 2: Lidé – věk, práce, potřeba jídla

**Files:** Create `packages/game/src/domain/village/people.ts`; Test `__tests__/people.test.ts`

**Interfaces:**

- Consumes: `Person`, `AGE`, `LABOR_PER_DAY`, `FOOD_NEED_KG_PER_YEAR` (Task 1).
- Produces: `ageYears(bornDay: number, day: number): number` (celé roky, `Math.floor((day − bornDay) / 365.25)`); `ageGroup(person: Person, day: number): 'child' | 'adult' | 'elder'`; `laborPerDay(person: Person, day: number): number`; `foodNeedPerDay(person: Person, day: number): number` (kg); `isFertileAdult(person: Person, day: number): boolean` (14–44); `occupants(state: VillageState, dwellingId: number): Person[]` (seřazení podle `id`).

- [ ] **Step 1: Write the failing test** – osoba narozená v den 0: v den `365.25 * 6` práce `0`, ve věku 7 `0.3`, 14 `1` a skupina `'adult'`, 45 `0.5` a `'elder'`; potřeba dospělého `180 / 365`, dítěte `100 / 365`, staršího `140 / 365`; `isFertileAdult` ve 44 `true`, ve 45 `false`.
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement** funkce v `people.ts`.
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(game): věk, práce a potřeba jídla obyvatel`

### Task 3: Zásoby a nasycení

**Files:** Create `packages/game/src/domain/village/food.ts`; Test `__tests__/food.test.ts`

**Interfaces:**

- Consumes: `foodNeedPerDay` (Task 2), `STORAGE_LOSS_PER_YEAR` (Task 1), `dateOfDayIndex` (Task 1).
- Produces: `daysUntilHarvest(day: number): number` (dní do konce 31. 8. včetně dneška; 31. 8. → 1, 1. 9. → délka do dalšího 31. 8.); `eatDay(storesKg: number, needPerDayKg: number, daysToHarvest: number): { storesKg: number; satiation: number }` – nejdřív ztráta `storesKg × (1 − (1 − STORAGE_LOSS_PER_YEAR) ** (1 / 365))`, pak příděl: když `storesKg ≥ need × daysToHarvest`, nasycení 1 a sní se `need`; jinak nasycení `storesKg / (need × daysToHarvest)` a sní se `need × nasycení`.

- [ ] **Step 1: Write the failing tests** – dost zásob: nasycení `1`, úbytek = potřeba + ztráta; málo zásob (100 kg, potřeba 2 kg/den, 100 dní) → nasycení `0.5` (± ztráta, `toBeCloseTo(0.5, 2)`); `needPerDayKg = 0` → nasycení `1`, žádné `NaN`; `storesKg = 0` → nasycení `0`, zásoby `0` (ne záporné); 1000 kg bez lidí po 365 dnech `toBeCloseTo(900, 0)`; `daysUntilHarvest` pro 31. 8. 600 = 1 a pro 1. 9. 600 = 365.
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(game): zásoby vsi, ztráty a přídělový systém`

### Task 4: Obydlí – kapacita, odemčení, opravy, přestavba

**Files:** Create `packages/game/src/domain/village/dwellings.ts`; Test `__tests__/dwellings.test.ts`

**Interfaces:**

- Consumes: `occupants`, `ageGroup` (Task 2); `DWELLINGS`, `BETTER_DWELLING`, `UNLOCK_MIN_ADULTS` (Task 1).
- Produces:
  - `isFull(state, dwellingId, day): boolean` (lidí ≥ kapacita), `isOvercrowded(...)` (lidí > kapacita);
  - `qualifyingDwellings(state, day): Dwelling[]` – plná a aspoň 4 lidé 14+ (dospělí i starší), seřazeno od nejvíc přeplněné, při shodě podle `id`;
  - `canStartNewDwelling(state, day): boolean` – `qualifyingDwellings.length > počet rozestavěných staveb kind 'dwelling'`;
  - `repairNeedPerDay(dwelling, day): number` = `repairAtEndOfLifePerYear × (věk / životnost)² / 365`, věk od `builtDay`;
  - `applyRepairs(dwelling, workDone, need): void` – nedodělek ubírá `condition` o `(need − workDone) / cost` (nejméně 0);
  - `wantsRebuild(dwelling, day): boolean` – věk ≥ životnost nebo `condition ≤ 0`;
  - `rebuildType(current: DwellingType, averageCommonLaborPerDay: number): DwellingType` – lepší, když `average × 365 ≥ DWELLINGS[lepší].cost`, jinak stejný.

- [ ] **Step 1: Write the failing tests** – startovní ves (4 lidé, věky 25, 25, 13, 12) → `qualifyingDwellings` prázdné; 6 lidí, z toho 4 ve věku 14+ → zemnice v seznamu a `canStartNewDwelling` `true`, po přidání stavby `'dwelling'` `false`; 7 lidí, jen 2 dospělí → nekvalifikuje; `repairNeedPerDay` v den postavení `0`, po 15 letech zemnice `toBeCloseTo(35 / 365, 4)`; `wantsRebuild` po 15 letech zemnice `true`, po 14 `false`; `rebuildType('zemnice', 0.7)` → `'polozemnice'` (0,7 × 365 = 255,5 ≥ 220), `rebuildType('zemnice', 0.5)` → `'zemnice'`.
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(game): obydlí – kapacita, odemčení stavby, opravy a přestavba`

### Task 5: Díly pole – úroda, úrodnost, zarůstání, výběr osevu

**Files:** Create `packages/game/src/domain/village/fields.ts`; Test `__tests__/fields.test.ts`

**Interfaces:**

- Consumes: `FieldPart` (Task 1), konstanty `FERTILITY`, `YIELD_BASE_KG_PER_HA`, `SEED_KG_PER_HA`, `RECLAIM_COST_PER_HA`, `FOUNDING_COST_PER_HA`, `DISTANCE` (Task 1).
- Produces:
  - `effectiveFertility(part, day): number` = `min(100, natural × share + (bonusUntilDay ≥ day ? 20 : 0))`;
  - `grossYieldPerHa(fertility: number): number`;
  - `distanceFactor(distanceM: number): number` = `1 + max(0, d − 100) / 10 × 0,01`;
  - `fallowYears(part, day): number` (celé roky od `fallowSinceDay`, jinak 0);
  - `reclaimCostPerHa(years: number): number` podle `RECLAIM_COST_PER_HA`;
  - `partFoundingCost(surface: FieldSurface, areaM2: number, obstacleCost: number): number` = `FOUNDING_COST_PER_HA[surface] × ha + obstacleCost`;
  - `endOfSeason(part: FieldPart, day: number): ChronicleEvent | null` – volá se 1. 9. pro každý díl: osetý díl `share −= 0,12`, `sownYears++`, při `share < 0,7` → `'fallow'`, `fallowSinceDay = day`, `sownYears = 0`; příloh `share = min(1, share + 0,05)`; příloh, který tímto dnem překročí 15 let, vrátí událost `'part-became-forest'` (jen jednou);
  - `selectPartsToSow(parts: FieldPart[], targetKg: number, maxHa: number, day: number): FieldPart[]` – pořadí ze spec (fields.md, Přílohová soustava, „Pořadí“): 1) `'sown'` se `share ≥ 0,7`; 2) `'ready'`; 3) `'fallow'` se `share ≥ 0,95`, nejmladší příloh první, při shodě menší `distanceM`; 4) `'fallow'` se `share ≥ 0,7`, nejvyšší `share` první. Přidává, dokud součet očekávané čisté úrody `(grossYieldPerHa(effectiveFertility) − SEED_KG_PER_HA) × ha` nepokryje `targetKg` a nepřekročí `maxHa`.

- [ ] **Step 1: Write the failing tests** – `grossYieldPerHa(70)` → `623.2`; `distanceFactor(100)` → `1`, `distanceFactor(500)` → `1.4`; tři roky osevu: share `1 → 0.88 → 0.76 → 0.64` a po třetím roce stav `'fallow'`; z 0,64 po 7 letech přílohu `share ≥ 0.95`, po 6 `< 0.95`; `reclaimCostPerHa(7)` → `60`, `(16)` → `250`, `(1)` → `0`; událost `'part-became-forest'` právě jednou; `selectPartsToSow`: osetý díl přednostně před `'ready'`, `'ready'` před přílohem, mezi přílohy ≥ 0,95 mladší dřív a při shodě bližší; respektuje `maxHa`; díl s `share 0.65` nevybere.
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(game): přílohová soustava – úroda, úrodnost, zarůstání a výběr osevu`

### Task 6: Roční plán polních prací a denní rozdělení práce

**Files:** Create `packages/game/src/domain/village/year-plan.ts`, `packages/game/src/domain/village/labor.ts`; Test `__tests__/year-plan.test.ts`, `__tests__/labor.test.ts`

**Interfaces:**

- Consumes: Task 2, Task 5, `WINDOWS`, `FIELD_WORK_PER_HA`, `DAILY_MIN_PER_HOUSEHOLD`, `DOMESTIC`.
- Produces:
  - `createPlan(parts: FieldPart[], selected: FieldPart[], day: number): YearPlan` – `required.<task> = Σ ha × sazba × distanceFactor`; `reclaim` jen u vybraných přílohů (`reclaimCostPerHa(fallowYears) × ha × distanceFactor`);
  - `activeTasks(plan: YearPlan, day: number): TaskName[]` – úlohy s nedodělkem, jejichž okno dnes běží, seřazené podle konce okna (nejbližší první); `sow` jen do výše hotového `dig` (podíl `done.sow / required.sow ≤ done.dig / required.dig`);
  - `harvestKg(plan, parts, day): number` – čistá úroda: pro každý vybraný díl `ha × (grossYieldPerHa(efektivní úrodnost) × sowFrac × (UNWEEDED_YIELD + (1 − UNWEEDED_YIELD) × weedFrac) × harvestFrac) − ha × SEED_KG_PER_HA × sowFrac`, nejméně 0; zlomky = `done / required` (při `required = 0` je zlomek 1);
  - `threshLossKg(plan: YearPlan, harvestedKg: number): number` = `harvestedKg × (1 − threshFrac)` (uplatní se 1. 3.);
  - `allocateDay(input: { capacity: number; households: number; people: number; tasks: { name: TaskName; remaining: number }[]; repairNeed: number; domesticBacklog: number; isWinter: boolean }): { dailyMin: number; tasks: Record<TaskName, number>; repairs: number; domestic: number; domesticBacklog: number; common: number }` – pořadí ze spec (fields.md, Práce): denní minimum → úlohy v daném pořadí → opravy → domácí výroba (dnešní potřeba + nedodělek; nedodělek nejvýš `backlogMaxDays × denní potřeba`, přebytek propadá) → zbytek je `common`. V zimě (`isWinter`) se nedodělek doháněl přednostně – je to tentýž algoritmus, jen se v ostatních obdobích na nedodělek dostane méně, protože úlohy berou práci první.

- [ ] **Step 1: Write the failing tests** – 1 ha ve 100 m → `required.dig 80`, `harvest 50`, `thresh 30`; ve 500 m `dig 112`; `activeTasks` 10. 10. → `['dig']` (+ `'reclaim'`, když ho plán má), 10. 4. → `['dig', 'sow']` jen s nedodělaným kopáním, 10. 6. → `['weed']`; `sow` neroste nad hotové kopání; `harvestKg` pro 1 ha s úrodností 70 a vším hotovým `toBeCloseTo(448.2, 1)`, bez pletí `toBeCloseTo(623.2 * 0.6 - 175, 1)`; `allocateDay` s kapacitou 2,6, jednou domácností, bez úloh → `dailyMin 0.5`, `domestic` = `0.3 + 0.12 × 4`, `common` = zbytek; součet všech složek = kapacita; při kapacitě menší než denní minimum je vše ostatní `0` a nic není záporné; nedodělek nikdy nepřekročí 60denní potřebu.
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(game): roční plán polních prací a denní rozdělení práce vsi`

### Task 7: Porody, úmrtí, hájení a rozpad domácností

**Files:** Create `packages/game/src/domain/village/population.ts`; Test `__tests__/population.test.ts`

**Interfaces:**

- Consumes: Task 2, Task 4, konstanty porodnosti a úmrtnosti, `createRandom`, `deriveSeed` (`domain/landscape/random.ts`).
- Produces:
  - `birthChancePerDay(ctx: { satiation: number; overcrowded: boolean }): number` = `BIRTHS_PER_PAIR_PER_YEAR / 365 × hungerBirthFactor(satiation) × (overcrowded ? 0,3 : 1)`; `hungerBirthFactor` lineárně 0 při ≤ 0,5 → 1 při ≥ 0,95;
  - `deathChancePerDay(person, ctx: { day: number; foundedDay: number; satiation: number; overcrowded: boolean; dwellingType: DwellingType; protectFromHunger: boolean }): number` – roční riziko podle skupiny (dítě `childDeathsPerYear() × childDeathFactor`, dospělý 0,015, starší 0,08) × přeplněnost 1,5 × hlad `(1 + 3 × (1 − satiation))` (hlad se nepočítá, když `protectFromHunger`), převedené na den `1 − (1 − p) ** (1 / 365)`; v hájení (`day − foundedDay < 30 × 365,25`) dospělí a starší `0`, děti × 0,5;
  - `populationDay(state: VillageState, day: number, satiation: number): ChronicleEvent[]` – mutuje `state`: náhoda dne `createRandom(deriveSeed(state.seed, 'day:' + day))`, losování v pevném pořadí (úmrtí po lidech podle `id`, pak porody po obydlích podle `id`, jeden pokus na pár = `floor(plodní dospělí / 2)`); `protectFromHunger` platí pro dospělé, dokud by ve vsi po úmrtí zbyli méně než 2 dospělí (pojistka „hlad ves nezničí“); pak rozpad: obydlí bez člověka 14+ a obydlí s jediným dospělým bez dětí se přestěhují do obydlí s nejvíc volnými místy (`'household-merged'`); prázdné obydlí zůstává.

- [ ] **Step 1: Write the failing tests** – `birthChancePerDay({ satiation: 1, overcrowded: false })` `toBeCloseTo(1 / 3 / 365, 8)`, při nasycení 0,5 `0`; dospělý mimo hájení `deathChancePerDay` ≈ `1 − 0.985 ** (1 / 365)`; v hájení dospělý `0`, dítě poloviční; vlastnost: 200 seedů × startovní ves × 30 let `populationDay` s nasycením 1 → žádné úmrtí dospělého (událost `death` se `group: 'adult'`); 50 seedů × ves po hájení × 20 let s nasycením 0 → vždy aspoň 2 dospělí; rozpad: obydlí jen s dětmi se přestěhuje do obydlí s nejvíc volnými místy a vznikne `'household-merged'`; stejný stav a den dají stejné události.
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(game): porody, úmrtí, hájení a rozpad domácností`

### Task 8: Založení vsi a akce hráče

**Files:** Create `packages/game/src/domain/village/actions.ts`; Test `__tests__/actions.test.ts`

**Interfaces:**

- Consumes: Task 1–5.
- Produces:
  - `type PartInput = { areaM2: number; distanceM: number; naturalFertility: number; surface: FieldSurface; obstacleCost: number }`;
  - `foundVillage(input: { seed: number; day: number; dwellingPosition: Position; firstField: { outline: [number, number][]; parts: PartInput[] } }): VillageState` – zemnice (`condition 1`, `builtDay = day`), 4 lidé s věky `START_AGES` (narození `day − věk × 365,25`, zaokrouhleno dolů), zásoby `potřeba za rok × START_STORES_MONTHS / 12` (startovní ves 560 × 1,5 = **840 kg**), první pole jako stavba `'field'`, `lastDay = day − 1`, kronika `[{ day, kind: 'village-founded' }]`;
  - `startNewDwelling(state: VillageState, day: number, type: DwellingType, position: Position, obstacleCost: number): VillageState` – `RangeError`, když `!canStartNewDwelling`; cena `DWELLINGS[type].cost + obstacleCost`;
  - `foundField(state: VillageState, day: number, field: { outline: [number, number][]; parts: PartInput[] }): VillageState` – `RangeError` při ploše `< 1000 m²` nebo dílu dál než 800 m; díly se stavem `'founding'`, `foundingCost = partFoundingCost(surface, areaM2, obstacleCost)`, les dostane `bonusUntilDay` až při dokončení dílu.
  - Akce vrací nový stav (`structuredClone` na začátku) a nemění vstup.

- [ ] **Step 1: Write the failing tests** – `foundVillage` → 4 lidé (2 dospělí, 2 děti 12 a 13 let k `day`), 1 zemnice, `storesKg` `840`, jedna stavba `'field'`, kronika začíná `'village-founded'`; `startNewDwelling` na startovní vsi → `RangeError`; po úpravě stavu na 6 lidí se 4 dospělými projde a druhá stavba hned potom → `RangeError`; `foundField` s 900 m² → `RangeError`, s dílem ve 850 m → `RangeError`; vstupní stav se nezměnil (`toEqual` s kopií před voláním).
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(game): založení vsi a akce hráče – nové obydlí a pole`

### Task 9: Denní simulace a dopočítání vsi

**Files:** Create `packages/game/src/domain/village/simulate.ts`; Test `__tests__/simulate.test.ts`

**Interfaces:**

- Consumes: všechno výše.
- Produces: `advanceVillage(state: VillageState, toDay: number): VillageState` – `RangeError`, když `toDay ≥ TOTAL_GAME_DAYS` nebo `toDay < state.lastDay`; jinak pro každý den `lastDay + 1 … toDay` v tomto pořadí:
  1. **1. 9.:** `endOfSeason` pro všechny díly (události do kroniky); nový `plan` = `createPlan` z `selectPartsToSow(cíl, maxHa)`, kde cíl = roční potřeba × 1,1 (× 1, když zásoby > 1,5 roční potřeby) a `maxHa` = co stihne jarní a letní špička: `min(springCapacity / (dig/2 + sow), summerCapacity / harvest)` na hektar, kapacita okna = (dnešní kapacita − denní minimum) × dní okna × 0,8; vybrané díly → `'sown'` (příloh: `fallowSinceDay = null`; příloh starší 15 let – vrací se z lesa – dostane `bonusUntilDay = den + 3 × 365`);
  2. **dokončený díl pole** před koncem dubna, když plán nepokrývá cíl: přidá se do `plan` (Review Focus 5);
  3. **práce:** `allocateDay` s úlohami z `activeTasks(plan)` a výmlatem z `activeTasks(threshingFromPlan)`; úlohy dostanou svou práci (`done += …`, nejvýš `required`); opravy podle `repairNeedPerDay` a `applyRepairs`; `common` rovným dílem do rozestavěných staveb (`'field'` stavba plní nejbližší nedokončený díl, hotový díl → `'ready'`, u lesa `bonusUntilDay = den + 3 × 365`); `commonLaborHistory` posune o den;
  4. **dokončené stavby:** `'dwelling'` → nové obydlí, přestěhují se dva nejmladší dospělí 14–44 z prvního obydlí v `qualifyingDwellings` (`'household-founded'`), jinak zůstane prázdné; `'rebuild'` → `type`, `builtDay`, `condition 1`; `'field'` hotová, když jsou hotové všechny díly; vždy `'construction-finished'`;
  5. **přestavba:** pro obydlí s `wantsRebuild` bez rozestavěné přestavby založí stavbu `'rebuild'` typu `rebuildType(typ, průměr commonLaborHistory)` (`'rebuild-decided'`);
  6. **prázdné obydlí** obsadí první obydlí z `qualifyingDwellings` (dva nejmladší dospělí);
  7. **31. 8.:** `harvestKg` do zásob (`'harvest'`), plán se přesune do `threshingFromPlan` (výmlat listopad–únor), `plan = null`; **1. 3.:** `threshLossKg` ze zásob, `threshingFromPlan = null`;
  8. **jídlo:** `eatDay` s potřebou všech lidí; změna hladu → `'hunger-began'` / `'hunger-ended'`;
  9. **populace:** `populationDay(state, den, nasycení)`.
     `lastDay = toDay`; vstup se nemění.

- [ ] **Step 1: Write the failing tests** – (a) **po kouscích:** ves založená 15. 3. 600 s polem 1,7 ha (75 dílů po 225 m², úrodnost 70, 50–100 m, louka) dopočtená do +10 let jedním voláním `toEqual` totéž po 1 dni, 30 dnech a pak nepravidelných skocích (7, 400, 1, 1000 … dní); (b) po 3 letech: aspoň jedna událost `'harvest'` s `kg > 0` a nasycení po celou dobu 1 (žádné `'hunger-began'`); (c) zásoby nikdy záporné a žádné `NaN` (kontrola po každém roce); (d) `advanceVillage(s, TOTAL_GAME_DAYS)` → `RangeError`, `advanceVillage(s, TOTAL_GAME_DAYS - 1)` projde (ves založená v roce 1495); (e) ves založená 20. 6. bez hotových dílů dožije do 1. 9. ze zásob a 1. 9. má plán s díly; (f) ves bez polí (díly odstraněné přímo ve stavu testu) 5 let: žádná výjimka, nasycení klesne, aspoň 2 dospělí zůstanou.
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement** `advanceVillage` (`structuredClone` na začátku, pak mutace kopie; pomocné kroky jako soukromé funkce v `simulate.ts`).
- [ ] **Step 4: Run** – PASS; ověř dobu: 10 let startovní vsi pod 1 s (`npx vitest run --reporter=verbose` ukáže čas testu).
- [ ] **Step 5: Commit** `feat(game): denní simulace a dopočítání vsi`

### Task 10: Kalibrační skript a dokumentace

**Files:** Create `packages/game/scripts/measure-village.ts`; Modify `CLAUDE.md` (sekce Struktura repa a nová podsekce „Ves“ s odkazy na `population.md`, `fields.md` a API `foundVillage` / `advanceVillage` / `startNewDwelling` / `foundField`), `docs/design/population.md` a `docs/design/fields.md` (řádek Stav: „Implementace: `packages/game/src/domain/village/`“).

**Interfaces:**

- Consumes: `foundVillage`, `advanceVillage`, `startNewDwelling`, `foundField`, `qualifyingDwellings`.
- Produces: `npx tsx packages/game/scripts/measure-village.ts [počet vsí] [roky]` – vypíše tabulku cílů z Kalibrace obou dokumentů s naměřenou hodnotou a OK / MIMO.

Strategie hráče ve skriptu (popsat v komentáři na začátku): ves na syntetické louce (úrodnost 70, díly 225 m² ve 50–600 m od obydlí podle pořadí zakládání, za 35 ha louky les s úrodností 60); hráč staví zemnici, kdykoli může (pozice bez významu); 1. 9. založí nové díly, když pole (`'ready'` + `'sown'` + přílohy ≥ 0,7) nepokryje potřebu celého oběhu (osev × 3,3).

Měří a porovná se spec: první možnost stavět (medián, 90. a 99. percentil let; cíl 90 % do ≈ 8 let), doba stavby zemnice a polozemnice čerstvě plnou domácností, věk přestaveb, podíl práce na obživu startovní vsi v ustáleném oběhu (85–90 %) a plné domácnosti (≈ 80 %), oběh dílu (3 roky osevu, 7–8 let přílohu), zásoby mezi 1 a 1,5 roční potřeby a nasycení ≥ 0,95 po 95 % let, vymření do roku 1500 (cíl ≤ 1 %, na 100 vsích; jediná domácnost bez staveb ≈ 90 % – druhá strategie „nikdy nestaví“).

- [ ] **Step 1: Write** skript; spusť `npx tsx packages/game/scripts/measure-village.ts 200 60` (rychlé cíle) a `… 100 1000` (vymření).
- [ ] **Step 2: Kalibrace:** cíle MIMO doladit **jen** hodnotami v `rules.ts` (žádné nové mechaniky); každou změnu čísla zapsat i do příslušného dokumentu (`population.md` / `fields.md`) a do commit message. Co nejde doladit bez změny pravidel, sepsat do závěrečné zprávy pro Martina – neopravovat.
- [ ] **Step 3: Docs:** `CLAUDE.md`, řádky Stav v obou dokumentech.
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm run test && npm run format:check` – vše PASS.
- [ ] **Step 5: Commit** `feat(game): kalibrační skript simulace vsi` (+ případně `chore(game): kalibrace pravidel vsi` se seznamem změněných čísel).
