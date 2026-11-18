# Strava po vrstvách a porážka celý rok – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ves jí napřed to, co se kazí (maso a mléčné, ovoce, luštěniny, obilí, med) bez stropů, jídlo se dělí po čtyřech vrstvách nad životním minimem 75 %, rod vojvody má maso celý rok z letní porážky, ryby se loví vždy a spokojenost ze stravy se počítá po lidech.

**Architecture:**

- `eatDiet` (`core/diet.ts`) dál počítá, co ves dnes sní ze zásob celkem, a výhled do sklizně – nově bez stropů, rychle se kazící jídlo napřed a hned, šetří se jen obilí (a v hladu med). Výsledek nese i snědené `eaten`.
- Nový čistý modul `core/tier-meal.ts` rozdělí dnešní snědené po vrstvách: příděl energie podle `rationShares` (75 % minimum, nad ním přednost), pak úrovně jídla od vrstvy 1 (ovoce rovně). Z něj berou energii vrstev hlad, porody a odchod mistrů a štěstí ze stravy (průměr po lidech).
- Porážka (`livestock/livestock.ts`) dostane letní den porážky pro vrstvu 1 a zimní tempo „zbývající maso čekajících kusů ÷ zbývající dny“ místo stropu masa.

**Tech Stack:** TypeScript 6 (strict), `packages/game` (doména vsi, Vitest), zlaté otisky vsi (`npm run test`, `npm run test:slow`).

**Spec:**

- `docs/design/diet.md` – sekce „Strava po vrstvách a porážka celý rok (Martin, 18. 11. 2026 …)“ – závazná; dál tamtéž Porážka v zimě, Nouzová porážka, Bílkoviny a nasycení.
- `docs/design/population.md` – Přednost v hladu; `docs/design/happiness.md` – Štěstí; `docs/design/hides-honey.md` – Med v hladu; `docs/design/wildlife.md` – Drobná zvěř a ryby.
- Mapa kódu: `/private/tmp/claude-503/-Users-martin-pracovni-Projects-Bohemia/9a7f0167-ccbc-4d15-9942-288a97ee5c46/scratchpad/diet-codemap.md` (body 1–9 a Rizika; řádky k HEAD 9008ab37). Dokumentace kódu: `docs/code/village-core.md` (strava, hlad), `docs/code/village-livestock.md` (porážka), `docs/code/village-wildlife.md` (ryby).

## Global Constraints

- Martin, 18. 11. 2026 (doslova v návrhu): pořadí „1. maso (a to i ryby a drobná zvěř) 2. ovoce … 3. luštěniny 4. obilí“, „Mléko, sýr a vejce … na stejnou úroveň jako maso“, med „v pořadí za obilí“, „Strop bych úplně zrušil“, „Nejde, aby elita měla plný příděl a rolníci byli pod hranicí hladomoru“, „75% je ok.“, „na to ser, na to máme vlkov“ (žádné měření na víc vsích).
- Vrstvy = skupiny `hungerSplit` (`people/hunger-groups.ts`): 0 rod vojvody, 1 domácnosti mistrů huti, 2 řemeslníci a učni, 3 ostatní a hosté.
- Nová čísla jen v `rules*.ts`: `HUNGER_PRIORITY = { minimumShare: 0.75 }` v `rules/rules-people.ts`, `HONEY.happiness = 2` v `rules/rules-wares.ts` – s odkazem na sekci návrhu. `DIET.caps` zmizí celé.
- Determinismus: čisté funkce stavu a dne, žádné `Date.now`/`Math.random`; výsledek nezávisí na kouscích dopočtu (hlídá `village-golden.test.ts` – `advanceChunked`).
- Stav vsi: nové části jen volitelné a převod v `VILLAGE_MIGRATIONS` (`core/migrations.ts`); plán je navržen bez nových částí stavu.
- Zlaté otisky vsi: každá úloha, která změní simulaci, přepíše `EXPECTED_YEAR_1` (`core/__tests__/village-golden.test.ts`) a `EXPECTED_YEAR_2/3` (`village-golden-long.test.ts`) podle `Received` a nad konstantu doplní řádek „18. 11. 2026 – strava po vrstvách, úloha N; dřív <otisk>“.
- Každá úloha na konci: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:docs`, `nice -n 19 npm run test`, `nice -n 19 npm run test:slow`. E2e jen v Úloze 5 a jen když se změnil `apps/web`.
- Česky komentáře i docs, krátká pomlčka „–“; vlastní rozhodnutí v docs „návrh Clauda“, Martinova slova s datem. Commity Conventional Commits česky, končí `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Agenti: žádné subagenty, žádné `sleep` v popředí, `pkill`, `rm -rf`, `git branch -D`; neslučovat, nepushovat; nejvýš ≈ 150 kroků.

## Rozhodnutí plánu (návrh Clauda)

1. **Pevný příděl medu** (0,5 kg na člověka za rok) se jí každý den jako dnes, i když obilí stačí – „za obilím“ platí pro med navíc v hladu (celá zásoba jako obilí, jako dnes). Jinak by med nikdy nedal štěstí.
2. **Tempo proti zkažení:** dnešní energie ves = příděl z výhledu, ale nejméně tolik, aby se vejce, ovoce (do 1. 3.) a maso (do 1. 9. / porážky) stihly sníst rovným tempem do zkažení – nejvýš plná potřeba. Tak „co by se zkazilo, sní ostatní“.
3. **Zimní porážka po zlomcích kusů jako dnes** (stáda jsou v modelu zlomková); „po celých kusech“ z návrhu platí jen pro letní porážku (1 celý kus). Úloha 5 text návrhu upraví.
4. **Letní porážka nezapisuje kroniku** (byla by denně); kronika `slaughter` 1. 11. zůstává.
5. **Nasycení pro štěstí** (`satiation`) zůstává ze stravy celé vsi; po lidech se počítá jen maso, ovoce a med.
6. **Výhled do sklizně** sdílí jeden pomocný výpočet „jídla mimo obilí do sklizně“ s `grainAheadForOutlookKg` – obě funkce tak dají stejný výsledek.
7. **Ryby** jsou malá změna bez vazby na stravu – jdou s pravidly do Úlohy 1.

## Review Focus

1. **Ves bez rodu vojvody** (vojvoda na výjezdu, ves správce, NPC ves bez rodu): vrstva 0 prázdná – letní porážka se nespustí, rozdělení po vrstvách s prázdnými vrstvami nepadne a energie prázdné vrstvy je 1. Test v Úloze 3 a 4.
2. **Hosté a nově narození mimo `groupOf`** spadnou do vrstvy 3 a jejich potřeba se do vrstvy 3 počítá (`guestFoodNeedPerDay`). Test v Úloze 3.
3. **Masa víc, než ves do 1. 9. sní** (Vlkov 895: 12 lidí, ≈ 1 000 kg uzeného): ves jí maso nad příděl až do plné potřeby, nic, co jde sníst, se nezkazí. Test v Úloze 2.
4. **Hluboký hlad pod 75 %**: všichni dostanou přesně stejný podíl potřeby, žádná přednost. Test v Úloze 1 a 3.
5. **Letní porážka s jediným velkým kusem** (kráva 130 kg na potřebu 5 kg): porazí se, zbytek snědí nižší vrstvy a zbytek se vyudí; chovné minimum a letošní mláďata (kromě selat od 1. 9.) zůstanou. Test v Úloze 4.

## Mapa souborů

| Soubor                                                                                                                                                     | Úlohy | Co                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| `rules/rules-people.ts`, `rules/rules-wares.ts`                                                                                                            | 1     | `HUNGER_PRIORITY`, `HONEY.happiness`                  |
| `people/hunger-groups.ts`                                                                                                                                  | 1, 3  | `rationShares` místo `priorityEnergy`, `proteinNeeds` |
| `wildlife/small-game.ts`                                                                                                                                   | 1     | ryby bez `wantsProtein`                               |
| `core/diet.ts`, `core/meal-input.ts`, `core/food-lasts.ts`, `core/simulate-work.ts`, `livestock/emergency-slaughter.ts`, `livestock/livestock.ts` (stropy) | 2     | strava bez stropů, nové pořadí, `DietResult.eaten`    |
| `core/tier-meal.ts` (nový), `core/simulate-food.ts`, `people/happiness.ts`, `core/simulate.ts`                                                             | 3     | rozdělení po vrstvách, štěstí po lidech               |
| `livestock/livestock.ts`, `livestock/husbandry.ts`                                                                                                         | 4     | letní porážka, zimní tempo, práce porážky v létě      |
| `docs/design/*.md`, `docs/design/history/`, `docs/code/*.md`                                                                                               | 5     | dokumenty, přepočet Vlkova                            |

Cesty v tabulce jsou relativní k `packages/game/src/domain/village/`.

---

### Task 1: Pravidla, příděl nad minimem a ryby vždy (Sonnet)

**Files:**

- Modify: `packages/game/src/domain/village/rules/rules-people.ts` (u `STARVATION`), `rules/rules-wares.ts` (`HONEY`)
- Modify: `packages/game/src/domain/village/people/hunger-groups.ts:77–93` (`priorityEnergy`)
- Modify: `packages/game/src/domain/village/core/simulate-food.ts:309–314` (volání)
- Modify: `packages/game/src/domain/village/wildlife/small-game.ts:187` (a `wantsProtein` 150, je-li jinde nevolaná – smazat)
- Test: `core/__tests__/hunger-priority.test.ts`, `wildlife/__tests__/small-game.test.ts`, zlaté otisky

**Interfaces:**

- Produces: `HUNGER_PRIORITY: { readonly minimumShare: 0.75 }`; `HONEY.happiness: 2` (jen číslo, čte Úloha 3); `rationShares(ratio: number, needs: readonly number[], minimum?: number): number[]` (výchozí `minimum = HUNGER_PRIORITY.minimumShare`) – nahrazuje `priorityEnergy` (smazat).

- [ ] **Step 1: Testy `rationShares`** v `hunger-priority.test.ts` (místo testů `priorityEnergy`):

```ts
expect(rationShares(1, [2, 1, 1, 6])).toEqual([1, 1, 1, 1]);
expect(rationShares(1.2, [2, 1, 1, 6])).toEqual([1, 1, 1, 1]);
// 0,9 z potřeby 4: každý 0,75 (3), zbytek 0,6 po vrstvách – 0 a 1 plně, 2 dostane 0,1
const s = rationShares(0.9, [1, 1, 1, 1]);
expect(s[0]).toBeCloseTo(1, 12);
expect(s[1]).toBeCloseTo(1, 12);
expect(s[2]).toBeCloseTo(0.85, 12);
expect(s[3]).toBeCloseTo(0.75, 12);
// pod minimem všichni stejně
expect(rationShares(0.6, [2, 1, 1, 6])).toEqual([0.6, 0.6, 0.6, 0.6]);
// prázdná vrstva má plno, potřebu nenese
expect(rationShares(0.8, [0, 1, 1, 2])[0]).toBe(1);
// součet energie = ratio × potřeba
const needs = [3, 2, 1, 14];
const r = rationShares(0.83, needs);
expect(r.reduce((a, x, i) => a + x * needs[i]!, 0)).toBeCloseTo(0.83 * 20, 9);
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/core/__tests__/hunger-priority.test.ts` – FAIL (`rationShares` neexistuje).
- [ ] **Step 3: Implementovat** `rationShares` v `hunger-groups.ts`: `ratio ≥ 1` → všem 1 (jako dnes kvůli plovoucí čárce); `ratio < minimum` → všem `max(0, ratio)`; jinak všem `minimum` a `(ratio − minimum) × Σneeds` po vrstvách v pořadí až do 1. JSDoc s citací Martina (18. 11. 2026) a odkazem na `docs/design/diet.md` – Kdo dostane co. `simulate-food.ts:312, 314` volá `rationShares(meal.diet.energy, split.needs)`.
- [ ] **Step 4: Ryby vždy** – v `smallGameDay` smazat podmínku `kind === 'fish' && !wantsProtein(...)`; kvóty, `urgent` a pořadí práce beze změny. Test v `small-game.test.ts`: ves bez potřeby bílkovin (sytá, stádo nad potřebu) v červnu s volnou prací chytí ryby (`meatKg > 0`, `state.freshMeatKg > 0`); dosavadní test „ryby jen při potřebě“ převrátit.
- [ ] **Step 5: Spustit** oba testy – PASS; pak celé sady (Global Constraints), přepsat zlaté otisky.
- [ ] **Step 6: Commit** `feat(game): příděl v hladu nad životním minimem 75 %, ryby se loví vždy`.

### Task 2: Strava bez stropů – napřed, co se kazí (Opus)

**Files:**

- Modify: `packages/game/src/domain/village/core/diet.ts` – `DIET` (bez `caps`), `dietPlan` 381, `eatDiet` 545, `grainAheadForOutlookKg` 503, `DietResult` 287, `villageMeal` 768
- Modify: `core/meal-input.ts:101` (`milkAheadEnergy` – strop na den = celá potřeba), `core/simulate-work.ts:959` (`drinkable` = celá potřeba), `core/food-lasts.ts` (pořadí a bez stropů), `livestock/emergency-slaughter.ts:82`, `livestock/livestock.ts:792` (`freshMeatPerDayKg` = potřeba ÷ `DIET.meatEnergy`), `:919` (`freshMeatAheadEnergy` bez stropu), `:1103` (`sizeHerdsToNeed` – stropy = celá potřeba), `:1226` (`meatEatableKg` smazat – bez volání), komentář `rules/rules-livestock.ts:27`
- Test: `core/__tests__/diet.test.ts`, `core/__tests__/food-lasts.test.ts`, `livestock/__tests__/{winter-slaughter,emergency-slaughter,dairy}.test.ts`, `fields/__tests__/*` (výhled osiva), zlaté otisky

**Interfaces:**

- Consumes: nic z Úlohy 1.
- Produces: `DietResult.eaten: Eaten` (snědené dnes celkem – Úloha 3); `DIET` bez `caps` (zbytek beze změny); `eatDiet`, `grainAheadForOutlookKg`, `foodLastsDays`, `stockLastsDays` se stávajícími podpisy.

- [ ] **Step 1: Testy** v `diet.test.ts` (nahradit testy stropů; stávající testy výhledu a medu upravit na nové hodnoty):
  - `bez stropů – samo maso nasytí energií`: `needPerDay 10`, `meatKg 2000`, `grainKg 0`, ostatní 0, `daysToHarvest 100`, `daysToMeatEnd 200` (maso do sklizně ≈ 1 200 ≥ potřeba 1 000) → `eaten.meatKg ≈ 10 / 0.6` (16,67), `diet.energy ≈ 1`, `outlook = 1`.
  - `uzené se jí před obilím`: `needPerDay 10`, `meatKg 6`, `grainKg 5000`, `daysToHarvest 100` → `eaten.meatKg ≈ 6 × DAILY_MEAT_KEEP`, `eaten.grainKg ≈ 10 − meatEnergy(6 × DAILY_MEAT_KEEP)`.
  - `ovoce před luštěninami a obilím, bez stropu 25 %`: ovoce s energií nad 25 % potřeby se sní celé do potřeby (`eaten.fruitKg × APPLE_FOOD_VALUE` > 0,25 × potřeba).
  - `mléko celé, sýr jen z přebytku`: mléko pod potřebou se vypije celé, `cheeseMadeKg = 0`; mléko nad potřebu → sýr z přebytku.
  - `přebytek masa se sní nad příděl` (Review Focus 3): `needPerDay 8`, `meatKg 1000`, `daysToMeatEnd 150`, `grainKg 0`, `daysToHarvest 300` → `outlook ≈ 0.25` (maso ≈ 600 na potřebu 2 400), ale ves jí tempem do zkažení: `eaten.meatKg ≈ 1000 × DAILY_MEAT_KEEP / 150` a `diet.energy ≈ meatEnergy(1000 × DAILY_MEAT_KEEP) / 150 / 8` (≈ 0,5; `toBeCloseTo(…, 3)`) – maso se do 1. 9. celé sní.
  - `výhled a obrácený výhled souhlasí`: pro tři vstupy (hlad, hraniční, dostatek) a `x ∈ {0.5, 0.8, 1}`: `eatDiet({...input, grainKg: grainAheadForOutlookKg(input, x)}).outlook ≈ x` (±1e-6) – stávající test rozšířit.
  - `pevný příděl medu se jí i při dostatku obilí` (`eaten.honeyKg > 0`); v hladu celá zásoba jako obilí (stávající test).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/core/__tests__/diet.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** v `diet.ts`. Postup dne (tělo píše implementátor; pořadí a vztahy jsou závazné):
  1. Ztráty zásob jako dnes (`DAILY_MEAT_KEEP`, `DAILY_CHEESE_KEEP`, `legumeKeepPerDay`, `grainKeepPerDay`).
  2. Sdílený pomocný výpočet `aheadEnergy` (jídlo mimo obilí do sklizně – Rozhodnutí 6): dnešní mléko, vejce a čerstvé maso; `milkAheadEnergy`, vejce × (dny − 1), `freshAheadEnergy`; uzené maso nejvýš `potřeba × min(dny, dny do konce masa)`; ovoce nejvýš `potřeba × min(dny, dny do zkažení)`; sýr a luštěniny (i snopy) po ztrátách; pevný příděl medu do sklizně (`honeyUntilHarvest`). Celé nejvýš `potřeba × dny`.
  3. Výhled: obilí do sklizně po ztrátách (`grainEatenShare`) proti `potřeba × dny − aheadEnergy`; dost → `outlook = 1`, `grainSpareKg` jako dnes; jinak med v hladu jako dnes (celá zásoba jako obilí); jinak `outlook = (aheadEnergy + obilí + celý med) ÷ (potřeba × dny)`.
  4. Dnešní energie `E = potřeba` při `outlook ≥ 1`, jinak `outlook × potřeba`; pak `E = min(potřeba, max(E, tempo proti zkažení))` – tempo = vejce dnes + ovoce ÷ dny do zkažení + (uzené + čerstvé) ÷ dny do konce masa (Rozhodnutí 2).
  5. Složení `E`: pevný příděl medu, pak úroveň 1 v pořadí mléko → vejce → čerstvé maso → uzené → sýr, úroveň 2 ovoce, 3 luštěniny, 4 obilí (nejvýš zásoba), 5 med navíc v hladu (podílem jako dnes `honeyShare`). Nevypité mléko → sýr (`cheeseFromMilk`), nesnědené čerstvé → uzené, nesnědená vejce se zkazí.
  6. `DietResult.eaten = Eaten` z kroku 5; `diet = dietOf(potřeba, bílkoviny, eaten)`.
  - `grainAheadForOutlookKg(input, x)` = `max(0, x × potřeba × dny − aheadEnergy − (x < 1 ? celý med : 0)) ÷ grainEatenShare(keep, 0, dny)` – přesně inverze kroku 3.
  - JSDoc `eatDiet` a `DIET` přepsat podle návrhu (citace Martina 18. 11. 2026, Rozhodnutí 1–2 jako návrh Clauda).
- [ ] **Step 4: Ostatní místa se stropy** (soubory výš): `food-lasts.ts` jí v pořadí uzené maso a sýr → ovoce → luštěniny → obilí → med bez stropů (se zkažením ovoce a masa a ztrátami); `freshMeatPerDayKg` = `villageFoodNeed ÷ DIET.meatEnergy`; `freshMeatAheadEnergy` = `meatEnergy(cullingMeatKg)` (nejvýš potřeba × dny); `sizeHerdsToNeed` bere jako strop masa i mléka celou potřebu; `meatEatableKg` smazat i s testy. Testy `food-lasts.test.ts` a `winter-slaughter.test.ts` („čerstvé maso ve stravě“) upravit na hodnoty bez stropů.
- [ ] **Step 5: Spustit** `diet.test.ts`, `food-lasts.test.ts`, livestock a fields testy – PASS; pak celé sady, přepsat zlaté otisky.
- [ ] **Step 6: Commit** `feat(game): strava bez stropů – napřed maso a mléčné, ovoce, luštěniny, obilí, med`.

### Task 3: Jídlo po vrstvách a spokojenost po lidech (Opus)

**Files:**

- Create: `packages/game/src/domain/village/core/tier-meal.ts`
- Modify: `people/hunger-groups.ts` (`HungerSplit.proteinNeeds`), `core/simulate-food.ts` (`eat()` – skupiny a návrat), `core/simulate.ts:~549–583` (předání), `people/happiness.ts:57–75, 180–230` (`HappinessFactors.honey`, vstup), panel štěstí ve webu, jen když vyjmenovává faktory (`grep -rn "fruit" apps/web/components/game/hud` – řádek medu s ikonou medu)
- Test: `core/__tests__/tier-meal.test.ts` (nový), `core/__tests__/hunger-priority.test.ts`, `people/__tests__/happiness.test.ts`, zlaté otisky

**Interfaces:**

- Consumes: `rationShares` (Úloha 1), `DietResult.eaten` (Úloha 2), `HONEY.happiness` (Úloha 1).
- Produces:

```ts
export interface TierMeal {
  /** Snědené každé vrstvy (součet přes vrstvy = snědené vsi). */
  readonly eaten: readonly Eaten[];
  /** Strava vrstvy (`dietOf` s potřebou vrstvy). */
  readonly diets: readonly DietDay[];
  /** Energie vrstvy 0–1 (prázdná vrstva 1) – hlad, porody, odchod mistrů. */
  readonly energy: readonly number[];
}
export function tierMeal(
  split: Pick<HungerSplit, 'needs' | 'proteinNeeds'>,
  eaten: Eaten,
): TierMeal;
/** Štěstí ze stravy průměrem po lidech (diet.md – Spokojenost ze stravy). */
export function dietHappiness(
  meal: TierMeal,
  counts: readonly number[],
): { fruit: number; meat: number; honey: number };
```

- `HungerSplit.proteinNeeds: readonly number[]` (bílkoviny za den, kg – `proteinNeedPerDay` lidí vrstvy).
- `updateHappiness(state, day, { satiation, events, toil, diet?: { fruit: number; meat: number; honey: number }, obstacles?, premiumSacred? })` – `diet` nahrazuje `fruit?` a `meatShare?`; `HappinessFactors.honey: number`.

- [ ] **Step 1: Testy** `tier-meal.test.ts`:
  - `příděl nad minimem`: potřeby `[2, 0, 0, 8]`, snědené obilí 9 kg (90 %) → vrstva 0 dostane 2 (0,75 × 2 + 0,5), vrstva 3 sedm: `energy[0] = 1`, `energy[1] = 1`, `energy[2] = 1` (prázdné), `energy[3] ≈ 0.875`.
  - `pod minimem stejně` (Review Focus 4): snědené obilí 5 kg na potřeby `[2, 0, 0, 8]` → `energy[0] ≈ energy[3] ≈ 0.5`.
  - `maso napřed elitě`: potřeby `[2, 0, 0, 8]`, snědené maso s energií 3 a obilí 7 → `eaten[0].meatKg × 0.6 ≈ 2`, `eaten[3].meatKg × 0.6 ≈ 1`, `eaten[3].grainKg ≈ 7`.
  - `ovoce rovně nesytým`: potřeby `[2, 0, 0, 8]`, maso s energií 2, ovoce s energií 4, obilí 4 → vrstva 0 sytá z masa, ovoce celé vrstvě 3.
  - `součet vrstev = ves`: pro náhodně pevné vstupy (pevná čísla v testu) každé pole `Eaten` sečtené přes vrstvy = vstup (±1e-9).
  - `prázdná vrstva` (Review Focus 1): potřeby `[0, 0, 0, 5]` → `energy[0] = 1`, `eaten[0]` samé nuly.
  - `dietHappiness`: vrstva 0 (2 lidé) jí maso 30 % energie a med, vrstva 3 (8 lidí) jen obilí → `meat ≈ 3 × 2/10`, `honey ≈ 2 × 2/10`, `fruit = 0`.
  - `hosté ve vrstvě 3` (Review Focus 2) v `hunger-priority.test.ts`: ves s hostem – `hungerSplit(...).needs[3]` obsahuje `guestFoodNeedPerDay`.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/core/__tests__/tier-meal.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** `tierMeal`: příděl vrstvy = `rationShares(energie snědeného ÷ Σneeds, needs) × needs`; úrovně v pořadí mléko → vejce → čerstvé maso → uzené → sýr → ovoce → luštěniny → obilí → med; na každé úrovni vrstvy 0 → 3 berou do zbytku svého přídělu, ovoce rovným dílem podle zbytku přídělu; bílkoviny se dělí s jídlem (`PROTEIN.perKg`, mléko podle podílu energie). `dietHappiness`: maso `meatHappiness(diets[t].shares.meat)`, ovoce `DIET.fruitHappiness` a med `HONEY.happiness`, když vrstva ovoce / med jedla – průměr vážený `counts`.
- [ ] **Step 4: Zapojit** v `eat()` (`simulate-food.ts`): `hungerSplit` a `tierMeal` počítat každý den (i při sytosti – štěstí), `groups.energy = meal.energy`; vracet `diet: dietHappiness(...)` místo `fruit`/`meat`; `simulate.ts` předá do `updateHappiness`. `HappinessFactors.honey` zahrnout do cílové hodnoty (`happinessTarget`).
- [ ] **Step 5: Spustit** testy (tier-meal, hunger-priority, happiness, starvation, simulate) – PASS; celé sady, přepsat zlaté otisky.
- [ ] **Step 6: Commit** `feat(game): jídlo po vrstvách nad životním minimem, štěstí ze stravy po lidech a z medu`.

### Task 4: Porážka celý rok (Opus)

**Files:**

- Modify: `packages/game/src/domain/village/livestock/livestock.ts` – nová `summerSlaughterDay`, `winterSlaughterDay` 929 (tempo), `winterWait` 823 (bez stropu), `freshMeatAheadEnergy` 911 (i letní odhad), `slaughterRemaining` 460 (práce i v létě)
- Modify: `livestock/husbandry.ts:~511` (volání v létě)
- Test: `livestock/__tests__/winter-slaughter.test.ts`, nový `livestock/__tests__/summer-slaughter.test.ts`, zlaté otisky

**Interfaces:**

- Consumes: `hungerSplit(state, day).needs[0]` (potřeba vrstvy 0), `retiringHeads`, `winterKeepTargets`, `breedingFloor`, `EMERGENCY_SLAUGHTER.pigletsFromMonth`, `LIVESTOCK.meatKg`.
- Produces: `summerSlaughterDay(state: VillageState, day: number, input: WinterInput): void` (mutuje: `livestock.herds`, `state.freshMeatKg`, práce porážky; `noteSlaughtered`); `summerSlaughterCandidates(state, day, input): Record<HerdSpecies, number>`.

- [ ] **Step 1: Testy** `summer-slaughter.test.ts`:
  - `kníže má maso`: 15. 6., vrstva 0 s potřebou 4 kg obilí/den, bez masa v zásobě, kandidáti ovce i kráva → porazí se 1 ovce (`herds.sheep −1`, `freshMeatKg = 15`), kráva zůstane.
  - `jen velký kus` (Review Focus 5): kandidát jen kráva → porazí se 1 kráva, `freshMeatKg = 130`.
  - `zásoba stačí`: uzené s energií ≥ potřebě vrstvy 0 → nic se neporáží.
  - `bez rodu` (Review Focus 1): potřeba vrstvy 0 = 0 → nic.
  - `chovné minimum a mláďata`: stádo = chovné minimum + letošní mláďata → nic; selata 2. 9. jdou, 15. 8. ne.
  - `práce v létě`: po porážce `slaughterRemaining(state, day) > 0`.
  - v `winter-slaughter.test.ts`: `zimní tempo` – 1. 12. s čekajícími kusy za 600 kg masa → dnes `freshMeatKg ≈ 600 / slaughterSeasonDaysLeft(day)` (±1e-6); poslední den zimy zbytek do uzení (stávající test).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/livestock/__tests__/summer-slaughter.test.ts` – FAIL.
- [ ] **Step 3: Implementovat:**
  - `summerSlaughterCandidates`: `retiringHeads` + kusy nad `winterKeepTargets` (odhad dnešními daty), bez letošních mláďat (kromě prasat od měsíce `pigletsFromMonth`), nikdy pod `breedingFloor`.
  - `summerSlaughterDay` (1. 4.–31. 10.): potřeba vrstvy 0 dnes; je-li energie masa v zásobě (`meatKg` + `freshMeatKg`) ≥ potřebě, nic; jinak 1 celý kus nejmenšího druhu, jehož `LIVESTOCK.meatKg` pokryje chybějící maso a má kandidáty ≥ 1, jinak největšího s kandidáty ≥ 1; maso do `freshMeatKg`, `addSlaughterWork`, `noteSlaughtered`. Bez kroniky (Rozhodnutí 4).
  - `winterSlaughterDay`: denně `cullingMeatKg ÷ slaughterSeasonDaysLeft(day)` kg v pořadí `WINTER_SLAUGHTER_ORDER` (zlomky kusů jako dnes – Rozhodnutí 3).
  - `winterWait`: kolik masa ves přes zimu sní čerstvého = celá potřeba ÷ `DIET.meatEnergy` × dny zimy (bez stropu); seno, les a místa beze změny; `winterWaitHayKg` drží stejný odhad.
  - `freshMeatAheadEnergy`: v zimě energie čekajících kusů; v létě navíc potřeba vrstvy 0 × dny do sklizně (v létě), nejvýš energie kandidátů.
  - `slaughterRemaining`: práce i v létě, když `slaughterWork.required` čeká.
  - `husbandry.ts`: v létě volat `summerSlaughterDay` se stejným `WinterInput` jako blok 1. 11. (vytáhnout pomocnou funkci, pokud ho blok skládá na místě).
- [ ] **Step 4: Spustit** livestock testy – PASS; celé sady, přepsat zlaté otisky.
- [ ] **Step 5: Commit** `feat(game): porážka celý rok – v létě pro rod vojvody, v zimě rozložená na celou zimu`.

### Task 5: Dokumenty, přepočet Vlkova a kontrola celku (Sonnet)

**Files:**

- Modify: `docs/design/diet.md` (sekce z „návrh ke schválení“ na „schváleno 18. 11. 2026“; Rozhodnutí plánu 1–4 jako návrh Clauda; zimní porážka „po kusech jako dnes (i zlomky)“), přesun nahrazených pravidel do `docs/design/history/diet-history.md` (strop podílů energie, maso rovným dílem do porážky, Porážka jen v zimě, Na maso jen to, co ves sní) s odkazem z původního místa; `docs/design/population.md` (Přednost v hladu – nad minimem), `docs/design/happiness.md` (med +2, po lidech), `docs/design/hides-honey.md` (štěstí z medu), `docs/design/wildlife.md` (ryby vždy)
- Modify: `docs/code/village-core.md` (strava, hlad – `tierMeal`, `rationShares`), `docs/code/village-livestock.md` (letní a zimní porážka), `docs/code/village-wildlife.md` (ryby)
- Scratchpad: přepočet Vlkova `/private/tmp/claude-503/-Users-martin-pracovni-Projects-Bohemia/9a7f0167-ccbc-4d15-9942-288a97ee5c46/scratchpad/vlkov/forecast2.mts` (stav ze zálohy `bohemia-before-d89-chronicle.dump` obnovené do pomocné DB; DB `bohemia` jen čtení) a `vlkov/forecast.mts` (z dnešního stavu)

- [ ] **Step 1:** Upravit docs (výš); `npm run check:docs`, `npm run format:check`.
- [ ] **Step 2:** Přepočet Vlkova novým kódem: ze zálohy 17. 11. 13:38 do 2. 10. 895 (srovnat s 22 lidmi bez D92 a 8 s D92) a z dnešního stavu na 10 let; výsledek (tabulka lidé / úmrtí hladem / zkažené maso / krávy) do zprávy úlohy.
- [ ] **Step 3:** Celé sady (Global Constraints); e2e jen pokud se změnil `apps/web` – specy s panelem štěstí a jídla (`grep -ln "štěstí\|nasycen" apps/web/e2e`).
- [ ] **Step 4: Commit** `docs: strava po vrstvách a porážka celý rok – návrh schválen, historie, mapa kódu`.

## Pořadí a souběh

Úlohy jdou po sobě 1 → 2 → 3 → 4 → 5: všechny mění zlaté otisky vsi a Úloha 3 stojí na výstupech Úloh 1 a 2. Pracovní strom `Bohemia-wt/steward`, větev `feat/diet-tiers` z `feat/landscape`.

## Mimo plán (později)

- Sušení a vaření ovoce (Martin: „čerstvé je nejlepší“).
- Prodej dobytka na trzích vsí samou.
- Čísla stravy (`DIET`, `PROTEIN`) přesunout do `rules*.ts` (dnešní stav to porušuje – mimo tento plán).
