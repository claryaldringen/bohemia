# Kůže, kožešiny, med a vosk – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ves má nové zboží – kůže, kožešiny, med a vosk. Vzniká z klátů, z porážky a z lovu (oka v zimě, kdykoli je čas, nově i liška). Domácnost ho v zimě zpracuje pro sebe, med ves jí a přebytek smí měnit se sousedy. Ve scéně je klát a kůže na rámu.

**Architecture:** Nová doménová oblast `packages/game/src/domain/village/wares/` (stav `VillageState.wares`, čísla v `rules/rules-wares.ts`). Napojuje se na pevné pořadí dne (`core/simulate.ts`) a na zbytek volné práce (`core/simulate-work-apply.ts` – `freeLaborDay`). Med vstupuje do stravy přes `DietInput` (`core/diet.ts`, `core/meal-input.ts`, `core/simulate-food.ts`). Do obchodu jde zboží přes `TradeGood` a vlastní proud losů sousedů, stejně jako kámen. Web nic nepočítá, jen zobrazuje (`summary` → `VillageView` → panel dvorce, obchod, scéna).

**Tech Stack:** TypeScript 6, Vitest, Next.js 16 / React 19, Babylon.js 9, Blender (`tools/blender`).

**Spec:** `docs/design/hides-honey.md` (schváleno 14. 11. 2026, včetně upřesnění Martina 14. 11. – oka jen v zimě). Navazuje na `docs/design/wildlife.md` (Drobná zvěř a ryby), `diet.md`, `trade.md` (Jen společné suroviny) a `premium-landscapes.md` (Brtě a lesní včely, Hojná zvěř a kožešiny).

## Global Constraints

- **Determinismus:** simulace nedostane žádnou novou náhodu. Sousedé losují jen z vlastního proudu `deriveSeed(seed, \`neighbour-wares:${direction}\`)`, ostatní zboží souseda se tím nezmění.
- **Čísla jen v `rules*.ts`** s odkazem na sekci návrhu. Ze specifikace platí doslova:
  - klát dá za rok ≈ 6 kg medu a ≈ 0,4 kg vosku, přibývá od května do září;
  - zpracování (Martin 14. 11. 2026 – tukem a kouřem, kožešina kvašením; tuk, popel a kvas se nepočítají): kůže skotu 10 h, kozí a prasečí 4 h, ovčí kožešina 3 h, zaječí a liščí 1,5 h práce; hotové ≈ 10 dní po začátku zpracování (čekání bez práce – zpracování má stav „v práci“ s dnem dokončení, hotový výrobek až po něm);
  - spotřeba: 1 ovčí kožešina na člověka za 3 roky, 1 kůže na 2 lidi za rok;
  - oka: 0,05 zajíce za hodinu × zajíci ÷ strop, liška 0,02 za hodinu × lišky ÷ strop; obojí jen nad ½ stropu a do ročního přírůstku;
  - zajíc dá kožešinu a 2 kg masa, liška kožešinu.
- **Nové části stavu jsou volitelné a vznikají líně** (`ensureWares`). Chybějící hodnota znamená 0, u lišek strop, takže převod ve `VILLAGE_MIGRATIONS` není potřeba.
- **Past starého převodu:** převod `foreign-goods` (`withoutForeignGoods`, `trade/trade.ts`) běží při každém načtení a maže `state.goods` i `diet.shares.honey`. Proto se nový stav jmenuje **`wares`**, nikdy `goods`, a podíl medu se smí mazat jen u vsi bez `wares` (Úloha 4).
- **Zlatý otisk:** úloha, která mění stav simulace, přepíše `EXPECTED_YEAR_1` (`core/__tests__/village-golden.test.ts`) i `EXPECTED_YEAR_2/3` (`village-golden-long.test.ts`, spouští se přes `npm run test:slow`). V commitu napíše, proč se výsledek změnil. Když spadne pomalý test na mezích (ne na otisku), zastav se a nahlas to – meze bez zdůvodnění nepřepisuj.
- **Horní lišta se nemění** – `TopBar.tsx` zůstává beze změny včetně tooltipu nasycení, podíl medu v něm není.
- **UI jako 0 A.D.:** ikony s čísly, slova jen v `Tooltip`.
- **Scéna:** Babylon se importuje z konkrétních modulů, kreslí se jen při změně (`needsRender`) a bez animace. Modely i ikony jsou vlastní render z `tools/blender` (CC0) a každý soubor má řádek v `LICENSES.md` / `LICENSE.md`.
- **Před commitem** projde `npm run typecheck`, `npm run lint`, `npm run test` a `npm run format:check`.
  - Úlohy 1–5 a 7 navíc `npm run test:slow`, úlohy 8–9 `npm run test:e2e`.
  - Změna v `docs/code` vyžaduje `npm run check:docs`.
- **Souběh s jinými větvemi:**
  - **Nájezd (`domain/war`, `alarm`):** plán do `domain/war` ani do `AlarmButtons` nesahá a nové zboží není kořist. Úloha 8 ale mění `hud/selection/dwelling.tsx` a `lib/selection-details.ts`, kde jsou i `AlarmButtons` – při slučování bude potřeba ruční spojení.
  - **Brod a chůze (`paths/walking.ts`, `steward-land.ts`, krajina potoka):** plán na ně nesahá. Cesta k brtím se měří přímou vzdáleností od středu vsi (`tileCenterWorld`), ne po síti pěšin.
  - **Lišta (`TopBar`):** beze změny.
  - **Zlaté otisky a hlavní soubory dne:** `EXPECTED_YEAR_*` a soubory `core/simulate.ts` / `core/simulate-work-apply.ts` mění i jiné větve. Po sloučení se otisky přepíšou znovu v integrační větvi, hashe se ručně nespojují.
- Komentáře a docs česky s „–“; vlastní rozhodnutí se v docs značí jako „návrh Clauda“.

## Rozhodnutí plánu (návrh Clauda)

1. **Pořadí dne** (`simulateDaySteps`):
   - **Ráno:** `storesAndHerdsDay` hned za `husbandryDay` (porážka 1. 11. i zimní porážka už proběhla) zavolá `waresDay`. Ten přidá med a vosk z klátů (1. 5.–30. 9.) a do brtí a 1. 11. nastaví roční potřebu kůží a kožešin.
   - **Kůže a kožešiny přibývají** hned při porážce (`noteSlaughtered`, `retireOxen`; nouzová porážka také přes `noteSlaughtered`). Z lovu rodu přibývají v `huntDay` a `patrolHuntDay`, z ok v `work()`.
   - **Práce:** ve `freeLaborDay` ze zbytku `freeLabor − weedMen − extraMow` jde napřed `waresWorkDay` (vybrání brtí od 1. 10., zpracování listopad–březen), pak `smallGameDay` ze zbytku. Hladová ves dál chytá před stavbami, beze změny.
   - **Jídlo:** med se jí v `eat()` i s dnešním přírůstkem.
2. **Oka a lišky:**
   - `smallGameDay` už nevyžaduje `wantsProtein` pro oka (prosinec–březen). Ryby (duben–listopad) se dál chytají jen při `wantsProtein` nebo hladu. Zdroj práce je stejný jako dnes.
   - Lišky dostanou stav `WildlifeState.foxes?` (chybí = strop `foxCount(land)`). 1. 5. se vrátí na strop – dnes jsou lišky na stropu vždy, takže to není nové pravidlo. Roční kvóta jsou lišky nad ½ stropu.
   - `foxEggFactor` (škody lišek na vejcích) se nemění.
3. **Med ve stravě:**
   - Energie 0,9 obilního ekvivalentu na kg (3 040 / 3 400 kcal).
   - Bez bílkovin, bez stropu, bez štěstí, bez vlivu na kvalitu stravy.
   - ~~Jí se rovným dílem do příštího 1. 5.~~ **Pevný příděl 0,5 kg na člověka za rok** (sladké pečivo – Martin 14. 11. 2026: „Med se nekazí, takže se dá dlouho skladovat a hromadit. Na druhou stranu – med se většinou přidával do sladkého pečiva nebo se z něj dělala medovina – samotného medu totiž člověk moc nesní“), denně rovným dílem z toho, co je; zbytek se hromadí (nekazí se) a jde na prodej. Počítá se i do výhledu (`daily`). Medovina později.
4. **Obchod:**
   - Do `TradeGood` přibudou `'honey' | 'hides' | 'furs' | 'wax'`.
   - Hodnota v kg obilí: med 6 za kg, vosk 30 za kg, kůže 20 za kus (5 kg na nosiče), kožešina 8 za kus (1 kg). Odvozeno od masa 3 a klády 40 = 1 čd.
   - Pastevci a lesní ves nabízejí, obilnáři a řemeslníci shánějí. Roční množství: kůže 5–20, kožešiny 10–40, med 20–80 kg, vosk 2–8 kg.
   - Při prodeji kožešin jdou napřed kožešiny z lovu. Koupené se přidají ke kožešinám z lovu.
5. **Rozhraní:** zásoby čtyř druhů ukáže řádek ikon v panelu dvorce. Obchod převezme řádky sám z `TRADE_GOODS`.
6. **Scéna:** klát u každého obydlí, od května do září se včelami u česna. Rám s kůží stojí u obývaných obydlí ve dny zpracování.
7. **Prémiové krajiny:** „Brtě a lesní včely“ jde hned (Úloha 5). „Hojná zvěř a kožešiny“ (kuna, bobr) až později – chybí strop a úlovek, návrh čísel nejdřív Martinovi.

## Review Focus

1. **Starší uložená ves** (bez `wares`, bez `foxes`, kvóta bez lišek, starý `shares.honey`) se načte bez pádu. `withoutForeignGoods` u vsi s `wares` vrátí týž objekt, starý podíl medu smaže jen u vsi bez `wares` – testy v Úlohách 2 a 4.
2. **Ryby v dubnu–listopadu** se bez potřeby bílkovin dál nechytají a oka mimo prosinec–březen nikdy – test v Úloze 2.
3. **Zlomkové zásoby** (zlomky kusů ze stád a ok): obchod nabízí jen celé kusy, prodej kožešin nikdy nejde pod nulu a bere napřed z lovu – test v Úloze 7.
4. **Dopočet po kouscích** přes 1. 10., 1. 11. a dny zpracování dá stejný stav jako dopočet vcelku – test v Úloze 3.
5. **Ves bez obydlí, bez lidí, bez krajiny nebo bez zvěře:** žádné `NaN`, `wares` nevznikne zbytečně. Na 30. 4. je příděl medu celá zásoba, na 1. 5. ≈ 1/365 – testy v Úlohách 1, 3 a 4.

---

### Task 1: Zboží vsi – stav, klát, kůže a kožešiny z porážky a lovu (Sonnet)

**Files:**

- Create: `packages/game/src/domain/village/types/types-wares.ts` (export v `types/index.ts`); Modify: `types/types-state.ts` (`wares?: WaresState`)
- Create: `packages/game/src/domain/village/rules/rules-wares.ts` (export v `rules/index.ts`)
- Create: `packages/game/src/domain/village/wares/wares.ts`, `wares/hives.ts`
- Modify: `livestock/livestock.ts` (`noteSlaughtered`), `livestock/oxen.ts` (`retireOxen`), `wildlife/hunt.ts` (`huntDay` – u `butcher`), `wildlife/field-patrol.ts` (`patrolHuntDay` – u `butcher`), `core/simulate.ts` (`storesAndHerdsDay`)
- Test: `wares/__tests__/wares.test.ts`, `wares/__tests__/hives.test.ts`; otisky v `core/__tests__/village-golden*.test.ts`
- Docs: `docs/code/village-livestock.md` – nová sekce „Kůže, kožešiny, med a vosk (`wares/`)“

**Interfaces:**

- Produces:
  - `interface WaresState { hides: number; sheepFurs: number; wildFurs: number; honeyKg: number; waxKg: number }` – kusy jsou zlomkové jako stáda.
  - `HIVES = { honeyKgPerYear: 6, waxKgPerYear: 0.4, fromMonth: 5, toMonth: 9, seasonDays: 153 }`
  - `ensureWares(state): WaresState`
  - `addHides(state, count: number): void`, `addWildFurs(state, count: number): void`
  - `addSlaughterWares(state, species: HerdSpecies, heads: number): void` – ovce dá `sheepFurs`, koza, prase a kráva `hides`.
  - `beesFlying(day: number): boolean`
  - `waresDay(state, day: number, landscape: Landscape | null): void` – teď volá jen `hivesDay`.
  - `hivesDay(state, day): void` – denně v sezóně přidá `state.dwellings.length × roční ÷ seasonDays` medu i vosku.

- [ ] **Step 1: Failing testy**
  - `wares.test.ts`:
    - `addSlaughterWares(s, 'sheep', 2)` → `sheepFurs 2`; `'pig', 1.5` → `hides 1.5`.
    - `addHides(s, 0)` nevytvoří `wares`.
  - `hives.test.ts`:
    - 3 obydlí, 15. 6. → `honeyKg ≈ 3 × 6 / 153`, `waxKg ≈ 3 × 0.4 / 153`;
    - 1. 5. a 30. 9. přibývá, 30. 4. a 1. 10. ne;
    - 0 obydlí → `wares` undefined;
    - `beesFlying` je true v květnu až září.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/domain/village/wares` → FAIL (moduly neexistují).
- [ ] **Step 3: Implementace**
  - Napoj volání:
    - `noteSlaughtered` volá `addSlaughterWares` (oprav i komentář – už to není „jen hlášení pro scénu“);
    - `retireOxen` volá `addHides(state, oxen)`;
    - `huntDay` volá `addHides(state, kills.boar + kills.deer)` (vlk a medvěd kůži nedávají, nejsou v návrhu);
    - `patrolHuntDay` volá `addHides(state, kills)`;
    - `storesAndHerdsDay` volá za `husbandryDay` `waresDay(state, day, landscape)`.
  - Koně kůži nedávají (nejsou v návrhu).
- [ ] **Step 4:** Testy z kroku 2 projdou.
- [ ] **Step 5: Zlatý otisk**
  - Ověř dočasným výpočtem (necommitovat), že otisk stavu bez klíče `wares` je pořád dnešní `EXPECTED_YEAR_1` – tím je jisté, že úloha nic jiného nezměnila.
  - Pak přepiš `EXPECTED_YEAR_1` a `EXPECTED_YEAR_2/3` (`npm run test:slow`).
- [ ] **Step 6:** Docs, kontroly z Global Constraints, commit `feat(game): zboží vsi – klát, kůže a kožešiny z porážky a lovu` (v těle důvod nového otisku).

### Task 2: Oka v zimě kdykoli je čas a liška do ok (Sonnet)

**Files:**

- Modify: `wildlife/small-game.ts` (`yearlyQuota`, `quotaLeft`, `smallGameCapacity`, `smallGameDay`), `wildlife/wildlife.ts` (`wildlifeYearDay`), `types/types-wildlife.ts` (`WildlifeState.foxes?`, `SmallGameYear.foxes?`, `SmallGameState.quota.foxes?`), `rules/rules-wildlife.ts` (`SMALL_GAME.snares.foxPerHour: 0.02`)
- Test: `wildlife/__tests__/small-game.test.ts`, `wildlife/__tests__/wildlife-year.test.ts`; otisky
- Docs:
  - `docs/design/wildlife.md` – Drobná zvěř a ryby: odrážka „Kdy se vyplatí“ (oka bez podmínky, citace Martina 14. 11. 2026) a liška;
  - `docs/code/village-wildlife.md` – Ryby a oka vesničanů.

**Interfaces:**

- Consumes: `addWildFurs` (Úloha 1); `foxCount(land)` z `wildlife/fox-eggs.ts`.
- Produces: `yearlyQuota(w, fishKg, hares, foxes): { fishKg: number; hares: number; foxes: number }` – lišky: `max(0, foxes − foxCount(land) × SMALL_GAME.minStockShare)`.

- [ ] **Step 1: Failing testy** – ves, která `wantsProtein` nechce (hodně masa ze stád):
  - `snares in winter without protein need`: 15. 1., `labor 3` → `manDays > 0`, zajíci ubudou, `wares.wildFurs` = chycení zajíci + lišky, `freshMeatKg` přibude 2 kg na zajíce;
  - `no fish without protein need`: 15. 6. → `manDays 0`;
  - `fox snare`: lišky na stropu 4, 1 čd → +0,2 lišky; lišky 2 (= ½ stropu) → 0, zajíci se chytají dál;
  - `old quota without foxes`: `quota = { fishKg, hares }` → kvóta lišek se dopočte a nic nespadne;
  - `wildlife-year`: 1. 5. → `foxes === foxCount(land)`, kvóta má `foxes`.
- [ ] **Step 2:** `npx vitest run src/domain/village/wildlife` → FAIL.
- [ ] **Step 3: Implementace** – v `smallGameDay` platí `if (!urgent && kind === 'fish' && !wantsProtein(state, day)) return NONE`.
  - Oka chytají zajíce i lišky ze stejných hodin, každý druh svým vzorcem a do své kvóty.
  - `smallGameCapacity` je u ok > 0, když jde chytat aspoň jeden druh.
- [ ] **Step 4:** Testy projdou.
- [ ] **Step 5: Otisky + `npm run test:slow`.** Důvod do commitu: oka každou zimu, i když ves bílkoviny nepotřebuje → víc čerstvého masa a kožešiny; v létě to o kousek sníží potřebu ryb (`wantsProtein` počítá letošní úlovek ok).
- [ ] **Step 6:** Docs, kontroly, commit `feat(game): oka v zimě kdykoli je čas, liška do ok`.

### Task 3: Zpracování v domácnosti a roční potřeba (opus – pořadí práce dne)

**Files:**

- Modify: `types/types-wares.ts` (`need?`, `today?`), `rules/rules-wares.ts` (`HIDES`), `wares/wares.ts` (`waresDay`: 1. 11. potřeba)
- Create: `wares/hides.ts`, `wares/wares-work.ts`
- Modify: `core/simulate-work-apply.ts` (`freeLaborDay`)
- Test: `wares/__tests__/hides.test.ts`, `wares/__tests__/wares-day.test.ts`; otisky
- Docs: `docs/code/village-livestock.md` (sekce z Úlohy 1); `docs/code/village-wildlife.md` – oka ze zbytku po zpracování.

**Interfaces:**

- Produces:
  - `WaresState.need?: { hides: number; furs: number }`, `WaresState.today?: { day: number; hides: number; furs: number }`
  - `HIDES = { hoursPerHide: 3, hoursPerFur: 1, hidesPerPersonYear: 0.5, fursPerPersonYear: 1 / 3, fromMonth: 11, toMonth: 3 }` – hodiny na člověkoden bere ze `SMALL_GAME.hoursPerManDay` (10), novou konstantu nezavádí.
  - `setWaresNeed(state, day): void` – v den `SLAUGHTER_DAY` (`core/diet.ts`) nastaví potřebu: lidé × sazby.
  - `processHidesDay(state, day, labor: number): number` – vrací spotřebované čd.
    - Mimo listopad–březen vrací 0.
    - Napřed kůže, pak kožešiny: ovčí, a teprve když nestačí, z lovu.
    - Zpracuje nejvýš do potřeby, zásoby a hodin práce, zlomky jsou dovolené.
    - Zpracované zboží ze zásoby ubyde a zapíše se do `today`.
  - `waresWorkDay(state, day, labor: number, landscape: Landscape | null): number` – teď jen `processHidesDay` (Úloha 5 do něj přidá brtě).

- [ ] **Step 1: Failing testy**
  - `hides.test.ts`:
    - 12 lidí, 1. 11. → `need { hides: 6, furs: 4 }`;
    - `sheepFurs 3`, `wildFurs 5`, `need.furs 4`, 1 čd, prosinec → `sheepFurs 0`, `wildFurs 4`, `need.furs 0`;
    - `hides 5`, `need.hides 5`, 0,5 čd → zpracováno 5/3 kůže a vráceno 0,5;
    - červen → 0;
    - 0 lidí → potřeba 0 bez `NaN`.
  - `wares-day.test.ts` (fixture vsi z `__tests__/village-fixtures.ts`):
    - dopočet 25. 10.–10. 11. vcelku a po 3 dnech dá stejné `wares` i `villageDigest`;
    - zimní den se zásobou a potřebou → `wares.today.day === day` a potřeba ubyla.
- [ ] **Step 2:** `npx vitest run src/domain/village/wares` → FAIL.
- [ ] **Step 3: Implementace** – úprava `freeLaborDay`:
  - `const rest = freeLabor − weedMen − extraMow;`
  - `const waresWork = waresWorkDay(state, day, rest, ctx.landscape);`
  - když ves nehladoví, `smallGameDay(state, day, rest − waresWork, false)`.
  - Zpracování běží i u hladové vsi, ze zbytku po stavbách.
- [ ] **Step 4:** Testy projdou.
- [ ] **Step 5: Otisky + `npm run test:slow`.** Důvod: nový stav potřeby a zpracování; práce na zpracování ubere zbytek pro oka, jen když ho je málo.
- [ ] **Step 6:** Docs, kontroly, commit `feat(game): domácnost zpracuje kůže a kožešiny v zimě`.

### Task 4: Med ve stravě (opus – strava)

**Files:**

- Modify:
  - `rules/rules-wares.ts` (`HONEY = { energyPerKg: 0.9 }`);
  - `core/diet.ts` (`DietInput`, `Eaten` a jeho nulová hodnota, `DietResult`, `dietPlan`, `eatDiet`, `dietOf`);
  - `types/types-livestock.ts` (`DietDay['shares'].honey?: number`);
  - `core/meal-input.ts` (`baseMealInput`), `core/simulate-food.ts` (`eat`);
  - `wares/hives.ts` (`daysUntilHoneyFlow`);
  - `trade/trade.ts` (`withoutForeignGoods`).
- Test: `core/__tests__/diet.test.ts`, `core/__tests__/migrations.test.ts`, `wares/__tests__/hives.test.ts`; otisky
- Docs:
  - `docs/design/diet.md` – Pojmy, Energie: med 0,9 (návrh Clauda; Martin 14. 11. 2026 „Má ho i jíst“);
  - `docs/design/trade.md` – oprav větu „med se nejí“;
  - `docs/code/village-livestock.md`.

**Interfaces:**

- Produces:
  - `DietInput.honeyKg?: number`, `DietInput.daysToHoneyFlow?: number`
  - `Eaten.honeyKg: number`, `DietResult.honeyKg: number` (zbytek)
  - `honeyEnergy(kg: number): number`
  - `daysUntilHoneyFlow(day): number` – dny do příštího 1. 5., nejméně 1; 30. 4. → 1, 1. 5. → 365.
- Příděl: `honeyRation = honeyEnergy(honey) / max(1, daysToHoneyFlow)`, přičte se do `daily`. Ověř, že ho tak vidí i `grainAheadForOutlookKg`.

- [ ] **Step 1: Failing testy**
  - `diet.test.ts`:
    - med 10 kg, `daysToHoneyFlow 100`, `needPerDay 10` → `eaten.honeyKg 0.1`, `diet.shares.honey ≈ 0.009`, `result.honeyKg 9.9`;
    - bílkoviny i `diversity` jsou stejné jako bez medu;
    - vstup bez medových polí dá stejný výsledek jako s `honeyKg: 0`.
  - `hives.test.ts`: `daysUntilHoneyFlow` na 30. 4. vrací 1, na 1. 5. vrací 365.
  - `migrations.test.ts`:
    - ves s `wares` a `diet.shares.honey` → `withoutForeignGoods` vrátí týž objekt;
    - ves bez `wares` se `shares.honey` → podíl zmizí.
- [ ] **Step 2:** `npx vitest run src/domain/village/core/__tests__/diet.test.ts src/domain/village/core/__tests__/migrations.test.ts` → FAIL.
- [ ] **Step 3: Implementace**
  - `baseMealInput` předá `honeyKg: state.wares?.honeyKg ?? 0` a `daysToHoneyFlow`.
  - `eat()` zapíše `state.wares.honeyKg = meal.honeyKg`, jen když `wares` existuje.
  - V `withoutForeignGoods` platí podmínka mazání podílu `shares?.honey !== undefined && state.wares === undefined`.
- [ ] **Step 4:** Testy projdou.
- [ ] **Step 5: Otisky + `npm run test:slow`.** Důvod: med šetří obilí a mírně mění osev podle stravy (`fieldShare`).
- [ ] **Step 6:** Docs, kontroly, commit `feat(game): ves jí med`.

### Task 5: Brtě v prémiové krajině „Brtě a lesní včely“ (Sonnet)

**Files:**

- Create: `wares/bee-trees.ts`
- Modify: `wares/wares.ts` (`waresDay`), `wares/wares-work.ts` (`waresWorkDay`), `types/types-wares.ts` (`beeTrees?`), `rules/rules-wares.ts` (`BEE_TREE_HARVEST = { month: 10, day: 1 }`)
- Test: `wares/__tests__/bee-trees.test.ts`
- Docs: `docs/design/premium-landscapes.md` (Brtě jsou hned; Hojná zvěř – kuna a bobr později), `docs/code/village-livestock.md`

**Interfaces:**

- Consumes: `beeTreeSpots(landscape)` (`landscape/premium/trees.ts`, případně ho přidej do exportu `landscape`), `tileCenterWorld`, rychlost chůze z `waterFetchingLabor` (`core/labor.ts`).
- Produces:
  - `WaresState.beeTrees?: { honeyKg: number; waxKg: number }` – med a vosk v brtích, které ještě nikdo nevybral.
  - `beeTreeWalksM(landscape): readonly number[]` – vzdálenosti od středu vsi k brtím, vzestupně; memo `WeakMap` podle krajiny; krajina bez typu `wild-bees` dá `[]`.
  - `beeTreesDay(state, day, walksM): void` – každá brť přibývá jako klát.
  - `collectBeeTrees(state, day, labor: number, walksM): number`
    - Od 1. 10. vybere všechno najednou, když `labor ≥ Σ 2 × walk ÷ rychlost ÷ 3600 ÷ 10`, a vrátí tuto práci.
    - Jinak vrátí 0 a med zůstane v brtích.
- `waresWorkDay` volá napřed `collectBeeTrees`, pak `processHidesDay` ze zbytku.

- [ ] **Step 1: Failing testy**
  - `walks [300, 600]`: 15. 6. → `beeTrees.honeyKg ≈ 2 × 6 / 153`;
  - 1. 10. s prací 1 čd → zásoba přejde do `honeyKg`, vrácená práce ≈ (600 + 1 200) ÷ 1 ÷ 3600 ÷ 10;
  - práce 0,01 čd → vrací 0, zásoba zůstane v brtích;
  - `beeTreeWalksM` na jedné krajině `wild-bees` (helper z `landscape/premium/__tests__/soil-forest.test.ts`) má délku `beeTreeSpots(l).length` a hodnoty ≤ 900 + 2 × 4·√2.
  - `waresDay` a `waresWorkDay` s `landscape: null` nevytvoří `beeTrees` a vrátí jen práci zpracování.
- [ ] **Step 2:** FAIL. **Step 3:** Implementace. **Step 4:** PASS.
- [ ] **Step 5:** Zlatý otisk se nezmění (zlatá krajina nemá typ). Pokud se změní, je to chyba – oprav ji, otisk nepřepisuj. Spusť `npm run test:slow`.
- [ ] **Step 6:** Docs, kontroly, commit `feat(game): brtě v krajině Brtě a lesní včely`.

### Task 6: Ikony a modely (Sonnet, nezávislá – může běžet souběžně)

**Files:**

- Modify: `tools/blender/icons.py` – ikony `hide` (napnutá kůže), `fur` (srolovaná kožešina), `honey` (hliněný hrnec s medem), `wax` (žlutý voskový koláč) → `apps/web/public/icons/resources/{hide,fur,honey,wax}.png` (64 × 64)
- Create: `tools/blender/wares.py` → `apps/web/public/models/wares/hive.glb` (vydlabaný kmen ⌀ ≈ 0,45 m, výška ≈ 1,1 m, stříška, česno), `hive-bees.glb` (týž s tečkami včel u česna), `hide-frame.glb` (rám z tyčí ≈ 1,4 × 1,2 m s napnutou kůží); `apps/web/public/models/wares/LICENSE.md`
- Modify: `apps/web/public/icons/LICENSES.md`

- [ ] **Step 1:** Spusť skripty (příkaz podle hlavičky `icons.py` a `crafts.py`; nový `wares.py` dostane stejnou hlavičku).
- [ ] **Step 2:** Ověř: `sips -g pixelWidth -g pixelHeight apps/web/public/icons/resources/{hide,fur,honey,wax}.png` → 64 a 64. Každý GLB < 60 kB a má jednu mesh. Dívej se jen na jednu malou koláž.
- [ ] **Step 3:** `npm run format:check`, commit `feat(web): ikony a modely kůží, kožešin, medu, vosku a klátu`.

### Task 7: Nové zboží v obchodě (Sonnet)

**Files:**

- Modify:
  - `types/types-trade.ts` (`TradeGood`);
  - `rules/rules-trade.ts` (`TRADE_GOOD_VALUES`, `NEIGHBOURS.waresKinds`, `NEIGHBOURS.waresAmounts`);
  - `trade/neighbours.ts` (`TRADE_GOODS`, nová `waresAmounts(seed, direction, kind)`, `neighbourOf`);
  - `trade/trade.ts` (`villageGoodStock`, `addGood`);
  - `apps/web/lib/trade-names.ts` (`TRADE_GOOD_NAMES`).
- Test: `trade/__tests__/neighbours.test.ts`, `trade/__tests__/trade.test.ts`, `apps/web/components/game/hud/__tests__/TradePanel.test.tsx`; otisky
- Docs: `docs/design/trade.md` (Jen společné suroviny – nové zboží, druhy sousedů, ceny s odvozením; Rozhodnutí), `docs/code/village-trade.md`

**Interfaces:**

- Produces:
  - `TradeGood` += `'honey' | 'hides' | 'furs' | 'wax'`.
  - `TRADE_GOODS`: `grain, legumes, meat, cheese, honey, …dobytek, …koně, logs, pottery, ironBars, charcoal, stone, hides, furs, wax`.
  - Hodnoty: `honey { valueKg: 6, carryKg: 1 }`, `wax { 30, 1 }`, `hides { 20, 5 }`, `furs { 8, 1 }`.
  - `waresKinds { farmers: 'demands', herders: 'offers', woodsmen: 'offers', crafters: 'demands' }`.
  - `waresAmounts { hides: [5, 20], furs: [10, 40], honey: [20, 80], wax: [2, 8] }` – stejný tvar jako `stoneM3`.
  - Názvy v `TRADE_GOOD_NAMES` (ikony z Úlohy 6):
    - `hides`: Kůže / kůží, ks, ikona `hide`;
    - `furs`: Kožešiny / kožešin, ks, ikona `fur`;
    - `honey`: Med / medu, kg;
    - `wax`: Vosk / vosku, kg.
  - `villageGoodStock`: `floor` z `hides`, ze `sheepFurs + wildFurs`, z `honeyKg` a z `waxKg`.
  - `addGood`: u `furs` se záporné množství bere napřed z `wildFurs`, kladné jde do `wildFurs`; ostatní druhy přes `ensureWares`.

- [ ] **Step 1: Zapiš otisk před změnou.** Ještě před úpravou zapiš do testu `neighbours.test.ts` `supply` a `demand` pro seed 1 a všech 8 směrů.
- [ ] **Step 2: Failing testy**
  - `neighbours.test.ts`:
    - bez klíčů nového zboží je soused shodný se zapsaným otiskem;
    - každý nový druh nabízí aspoň jeden soused a shání aspoň jeden soused;
    - množství leží v mezích.
  - `trade.test.ts`:
    - `wildFurs 2.5`, `sheepFurs 3` → stock `furs` 5;
    - `addGood(s, 'furs', -4)` → `wildFurs 0`, `sheepFurs 1.5`;
    - prodej nad zásobu → `OVER_STOCK`;
    - nákup 10 kg medu → `honeyKg +10`.
  - `TradePanel.test.tsx`: soused nabízí med → řádek s ikonou `honey` a tooltipem „Med“.
- [ ] **Step 3:** FAIL. **Step 4:** Implementace (`waresAmounts` po vzoru `stoneAmounts`). Projdi `grep -rn "Record<TradeGood\|TRADE_GOODS"`; vazalské makrokomodity nové zboží nedostanou – dávky až později. **Step 5:** PASS.
- [ ] **Step 6: `npm run test:slow`.** Když se otisk změní, protože zásoby sousedů ve stavu mají nové klíče, přepiš ho a tento důvod napiš do commitu. Uložené zbytky roku sousedů bez nového zboží zahodí `fitsNeighbour` při načtení (soused dostane plný rok) – zapiš to do trade.md.
- [ ] **Step 7:** Docs, kontroly, commit `feat(game): kůže, kožešiny, med a vosk v obchodě se sousedy`.

### Task 8: Zásoby v panelu dvorce (Sonnet)

**Files:**

- Modify:
  - `packages/game/src/domain/village/core/summary.ts` (`VillageSummary.wares`);
  - `apps/web/lib/village-view-types.ts` a `village-view.ts` (`VillageView.wares`);
  - `apps/web/lib/selection-details.ts` (`wares` u dvorce);
  - `apps/web/components/game/hud/selection/dwelling.tsx` (vykreslení u `details.manor`).
- Create: `apps/web/components/game/hud/selection/wares.tsx` (`WaresStock`)
- Test: `apps/web/components/game/hud/__tests__/WaresStock.test.tsx`, `packages/game/src/domain/village/core/__tests__/summary.test.ts`
- Docs: `docs/code/web-ui.md` – nová sekce „Kůže, kožešiny, med a vosk v rozhraní“

**Interfaces:**

- Produces:
  - `type WaresView = { hides: number; furs: number; sheepFurs: number; honeyKg: number; waxKg: number }` – celé kusy a kg, `floor`.
  - `VillageSummary.wares: WaresView | null` – `null`, když `wares` chybí.
  - `WaresStock({ wares }: { wares: WaresView | null }): ReactElement | null`

- [ ] **Step 1: Failing testy**
  - `summary.test.ts`: `wares { hides: 2.7, sheepFurs: 1.2, wildFurs: 3.9, honeyKg: 5.5, waxKg: 0.3 }` → `{ hides: 2, furs: 5, sheepFurs: 1, honeyKg: 5, waxKg: 0 }`.
  - `WaresStock.test.tsx`:
    - 4 ikony (`hide`, `fur`, `honey`, `wax`) s čísly;
    - tooltipy „Kůže“, „Kožešiny – ovčí 1“, „Med“, „Vosk“;
    - `null` i samé nuly → nic se nevykreslí.
- [ ] **Step 2:** `cd apps/web && npx vitest run components/game/hud/__tests__/WaresStock.test.tsx` → FAIL. **Step 3:** Implementace. **Step 4:** PASS.
- [ ] **Step 5:** `npm run test:e2e`. Malý snímek panelu dvorce si nech na konec pro Martina.
- [ ] **Step 6:** Docs, kontroly, commit `feat(web): zásoby kůží, kožešin, medu a vosku v panelu dvorce`.

### Task 9: Klát a rám s kůží ve scéně (Sonnet)

**Files:**

- Modify:
  - `apps/web/lib/village-view-scene-types.ts` (`SceneVillage.wares?`) a místo, kde se skládá `SceneVillage` (`grep -n "dwellings:" apps/web/lib/village-view*.ts`);
  - `apps/web/lib/scene/dwelling-decor.ts` – exportuj tabulku `SHAPES` jako `DWELLING_EAVES`;
  - napojení rendereru tam, kde vzniká `CraftYardRenderer`.
- Create:
  - `apps/web/lib/scene/wares-placement.ts` – čisté funkce;
  - `apps/web/lib/scene/wares-renderer.ts` – Babylon, po vzoru `craft-yard-renderer.ts`.
- Test: `apps/web/lib/scene/__tests__/wares-placement.test.ts`
- Docs: `docs/code/scene-village.md` – nová sekce „Klát a rám s kůží“

**Interfaces:**

- Consumes: `beesFlying(day)` (Úloha 1); `wares.today` (Úloha 3); modely z Úlohy 6.
- Produces:
  - `SceneVillage.wares?: { beesOut: boolean; frames: number }`
    - `frames = ceil(today.hides + today.furs)`, když `today.day` je dnešní den, jinak 0.
  - `hivePlacement(type: DwellingType, frame: ShapeFrame): { x: number; z: number; rotationY: number }`
    - Klát stojí u boční stěny za okapem (`eaveX + 0,8 m`), u zadního štítu, česnem ven.
    - V souřadnicích obydlí přes `shapedToWorld`.
  - `hideFramePlacement(type, frame)` – rám je u přední stěny vedle vchodu (`frontY − 1,5 m`, `x = eaveX − 0,6`).
  - `hideFrameDwellings(dwellings: readonly { id: number; inhabited?: boolean }[], frames: number, day: number): number[]`
    - Vybírá z obývaných obydlí seřazených podle id, začíná na indexu `day mod n` a bere jich `min(n, frames)`.
- Renderer:
  - pro každé obydlí `built` přidá jeden klát, model `hive-bees` při `beesOut`, jinak `hive`;
  - rámy přidá u vybraných obydlí;
  - `needsRender` nastaví jen při změně.

- [ ] **Step 1: Failing testy**
  - Klát ani rám neleží v obdélníku domu a nekryje se s pozemkem ani se slepicemi (`chickenBox`) pro každý `DwellingType`.
  - `hideFrameDwellings`: 5 obydlí, 2 neobývaná, `frames 2`, den 7 → dvě obývaná podle rotace; `frames 0` → `[]`; stejné vstupy dají stejný výstup.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/scene/__tests__/wares-placement.test.ts` → FAIL. **Step 3:** Implementace. **Step 4:** PASS.
- [ ] **Step 5:** `npm run test:e2e` – e2e kontroluje i importy Babylonu. Na konec jeden malý snímek vsi v létě a jeden v zimě se zpracováním pro vizuální kontrolu Martinem.
- [ ] **Step 6:** Docs, kontroly, commit `feat(web): klát u obydlí a kůže na rámu ve scéně`.

## Mimo plán (později)

- Kuna a bobr („Hojná zvěř a kožešiny“) – chybí strop a úlovek, návrh čísel nejdřív Martinovi.
- Dávky vazalů v novém zboží, specializovaní řemeslníci (koželuh, kožešník), následky nedostatku – podle návrhu později.

## Pořadí a souběh

1 → 2 → 3 → 4 → 5 jdou postupně (sdílený stav, `freeLaborDay` a otisky). Úloha 6 může běžet souběžně s 1–5. 7 jde po 1 a 6, 8 po 7, 9 po 3 a 6.
