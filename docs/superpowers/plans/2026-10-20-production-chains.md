# Výrobní řetězy – plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cíl:** Celý postup práce je vidět. Obilí jde z pole na humno a hned se mlátí, zrno do obilných
jam. Kovář taví rudu na houbu, houbu překove na hřivny a z nich kove nástroje. V liště jsou
hřivny místo nástrojů. Hrnčíř a tesař ukazují své kroky.

**Architektura:** V jádře (`packages/game/src/domain/village/`) přibude:

- **humno** – stavba hráče, nový `BuildKind`;
- **snopy** – zásoba mezi žní a výmlatem;
- **obilné jámy** – rozložení zásoby obilí, které vesničané spravují sami;
- **řetěz kováře** – houba, hřivny, nástroje jako vybavení domácností.

Scéna (`apps/web/lib/scene/`) dostane rekvizity a postavy každého kroku. Postavy jsou lidé vsi
(`villager-roster.ts`).

**Stack:** TypeScript (doména, Vitest), Next.js a Babylon (scéna), Blender (modely
`tools/blender/`), Drizzle se nemění.

**Spec:** [docs/design/production-chains.md](../../design/production-chains.md) (schváleno 20. 10. 2026).

## Global Constraints

- **Determinismus a migrace:** simulace je dál deterministická, stav JSON se volitelnými novými
  poli. Starší vsi se převedou při načtení (`updateVillage`), jednou a bez rozbití.
- **Ves bez humna:**
  - Nová ves nemlátí, dokud hráč humno nepostaví.
  - Starší vsi mají **rok odkladu** od převodu, kdy mlátí nouzově na udusané zemi: +30 % práce
    výmlatu a −10 % zrna.
  - Snopy bez humna se kazí **10 % za měsíc**.
- **Výmlat hned po žni:** ozim v srpnu, jař v září, luštěniny hned po sklizni. Snopy se
  neskladují.
- **V liště jen hřivny** (ne nástroje). Nástroje jsou vybavení domácností.
- **Hřivny:**
  - Na 1 kg nástrojů jdou 1,2 kg hřiven.
  - Rozdělení dnešní ceny kování: tavba 60 % práce a 80 % uhlí, překování 25 % a 15 %, kování
    nástrojů 15 % a 5 %.
  - Kovář drží zásobu hřiven na rok obnovy vybavení, přebytky netaví.
- **Obchod:** hřivny (`ironBars`). Nákup nástrojů u sousedů (`craft-buying.ts`) zůstává.
- **Měch:** druhý člověk u tavby – dospělý nebo syn od 10 let, ten den nepase. Sám kovář taví
  polovičním tempem.
- **Jámy:**
  - Zavřená jáma není vidět, vybrat jde jen otevřená a panel ukáže kg zrna.
  - Prázdnou jámu ves použije znovu.
  - Stavba na zavřené jámě je dovolená – zrno se přendá bez ztráty.
- **Hodnoty z rešerše:** cena humna, kapacita jámy, ztráty v jámě, výtěžek tavby – každá úloha,
  která je potřebuje, je dohledá a zapíše se zdrojem do `rules.ts` a
  `docs/design/research/2026-10-20-production-chains.md`.
- **Psaní a commity:**
  - Čeština s en dash „–“.
  - Rozhodnutí jako „návrh Clauda“ (nikdy „koordinátor“).
  - Commity Conventional Commits česky s `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Bez kalibrace** (`measure-village`) – Martin ověřuje hraním.
- **Kontrola každé úlohy:** `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npx vitest run --testTimeout=120000` (packages/game) a `npx vitest run --testTimeout=60000`
  (apps/web).
- **Výkon:** nejdelší snímek se nezhorší (harness `scratchpad/zoom-perf/harness/`).

## Review Focus

1. Ves nemá humno a přijdou žně. Hráč dostane upozornění včas a starší vsi nouzově mlátí.
   Úloha 2: upozornění měsíc před žní a nouzový výmlat ve starší vsi.
2. Převod starší vsi: zásoba nástrojů a obchod s `tools` (zbytky roku sousedů, výpravy na
   cestě) nesmí zmizet. Úloha 4: převod `toolsKg` na vybavení a hřivny a `tools` na `ironBars`.
3. Výmlat v srpnu a září soupeří s orbou a setím ozimu. Plán osevu s ním musí počítat. Úloha 2:
   `sowingCapacity` odečte výmlat.
4. Stavba na zavřené jámě. Úloha 3: zrno se přendá bez ztráty.
5. Kovář bez rudy, uhlí nebo měchaře. Úloha 4: zastaví se se správnou činností
   a upozorněním, sám taví polovičním tempem.

---

### Úloha 1: Humno – stavba hráče

**Soubory:**

- jádro: `costs.ts` (`BuildKind` + `'threshing-floor'`, `BUILD_COSTS`), `types.ts` (`ThreshingFloor`, `VillageState.threshingFloors?`, `ConstructionKind` + `'threshing-floor'`), `placement.ts` (`checkThreshingFloorPlacement`), `actions.ts` (`startThreshingFloor`), `simulate.ts` (dokončení stavby);
- use-case `application/place-threshing-floor.ts`;
- web: server action `placeThreshingFloor`, `lib/build-items.ts` (záznam „Humno“, zkratka **K**, ikona `humno` z `icons.py`).

**Rozhraní:**

- `interface ThreshingFloor { id: number; position: Position; builtDay: number | null }`;
- `checkThreshingFloorPlacement(landscape, village, position): PlacementCheck`;
- `startThreshingFloor(state, day, position, obstacles)`;
- `HUMNO = { sizeM: { x: 8, z: 10 }, laborManDays: number, trees: number }` – čísla z rešerše.

**Postup:**

- [ ] **Krok 1:** Testy:
  - stavba humna jako stavba ze společné práce (dřevo jako ostatní);
  - umístění volně jako dílna (louka i les – Stavba v lese; ne na vodě, výchozu ani v cizí stavbě; na poli – pole ustoupí, Pole jako krajina);
  - hotové humno ve `threshingFloors`.
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat: humno – stavba hráče`.

### Úloha 2: Snopy a výmlat hned po žni

**Soubory:** `rules.ts` (okna `thresh`: `WINTER_WINDOWS` srpen, `WINDOWS` září, luštěniny srpen), `types.ts` (`VillageState.sheaves?: { grainKg: number; legumesKg: number }`, `threshingGraceUntil?: number`), sklizeň (`harvestWinter`, sklizeň jaře), výmlat (úloha `thresh` v `simulate.ts`), `field-food.ts` / `food-outlook.ts` (výhled), `sowing.ts` (`sowingCapacity`), `village-notices.ts` (web).

**Rozhodnutí:**

- **Sklizeň** jde do `sheaves`, ne rovnou do `storesKg`.
- **Výmlat** převádí snopy do zásob podle postupu úlohy `thresh`. Úloha běží jen s hotovým humnem, nebo v odkladu (`threshingGraceUntil` – starší vsi rok od převodu, nouzový výmlat +30 % práce a −10 % zrna).
- **Snopy** se kazí 10 % za měsíc. Dnešní „nevymlácené 1. 3. propadne“ zmizí.
- **Výhled jídla** počítá snopy jako zrno, jen když je humno nebo odklad.
- **Více humen:** kapacita humna se sčítá (návrh: humno na ≈ 60 ha osevu) – víc humen zrychlí výmlat.

**Postup:**

- [ ] **Krok 1:** Testy:
  - sklizeň jde do snopů;
  - výmlat v srpnu a září s humnem;
  - bez humna se nemlátí a snopy ubývají 10 % za měsíc;
  - starší ves (převod) mlátí rok nouzově (+30 % práce, −10 %);
  - plán osevu odečte práci výmlatu z podzimní kapacity;
  - upozornění „Před žněmi postav humno“ (měsíc před žní bez humna) a „Snopy čekají na humno“.
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Implementace a převod starších vsí.
- [ ] **Krok 4:** Testy projdou. Upravené zlaté otisky zdůvodni ve zprávě (mění se termín výmlatu).
- [ ] **Krok 5:** Commit `feat: výmlat na humně hned po žni`.

### Úloha 3: Obilné jámy

**Soubory:**

- jádro: nové `grain-pits.ts`, `types.ts` (`GrainPit { id; x; z; capacityKg; grainKg; state: 'sealed' | 'open' | 'empty'; dugDay }`, `VillageState.grainPits?`), `productivity.ts` (ztráty), `placement.ts` (stavba na zavřené jámě);
- scéna: `apps/web/lib/scene/grain-pits.ts`;
- výběr a panel: `village-picking.ts`, `SelectionPanel`.

**Rozhodnutí:**

- **Kopání:** po výmlatu vesničané vykopou a naplní jámy (práce kopání z rešerše).
- **Kde:** místo `chooseGrainPitSite` – suché, ne na poli, cestě, stavbě ani ve vodě, do 60 m od humna, deterministicky.
- **Zásoba:** `storesKg` = součet zrna v jamách a v otevřené jámě. Otevírá se jedna jáma, ze které se jí a seje.
- **Ztráty:** v zapečetěné jámě ztráty z rešerše, v otevřené jako dnes.
- **Opakovaně:** prázdná jáma se znovu naplní, po 10 letech se zasype a vykope nová.
- **Stavba na zavřené jámě:** zrno se přendá do jiné jámy a jáma zmizí.

**Postup:**

- [ ] **Krok 1:** Testy:
  - jámy po výmlatu, `storesKg` sedí se součtem;
  - jedna otevřená jáma;
  - nižší ztráty v zapečetěné;
  - prázdná jáma znovu;
  - stavba na zavřené jámě přendá zrno bez ztráty;
  - scéna: zavřená jáma není vidět, otevřenou jde vybrat a panel ukáže kg.
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat: obilné jámy`.

### Úloha 4: Kovář – houba, hřivny, nástroje jako vybavení

**Soubory:** `crafts.ts`, `smith-supply.ts`, `types.ts` (`CraftStocks.ironBarsKg`, `CraftStocks.bloomKg`, `VillageState.toolEquipmentKg`; `TradeGood` `tools` → `ironBars`), `trade.ts` a `people-trade.ts` (převod), `craft-buying.ts` (kupuje vybavení), `carpentry.ts` (kování vozů z hřiven), `summary.ts` a web lišta (`TopBar` – hřivny), panel dílny a obchodu.

**Rozhodnutí** (z Global Constraints):

- tavba s měchařem;
- houba → hřivny → nástroje do vybavení podle opotřebení;
- pokrytí `craftCoverage.tools` = vybavení / potřeba;
- zásoba hřiven na rok obnovy.

**Převod:** `toolsKg` → vybavení do potřeby, přebytek na hřivny (÷ 1,2). Zbytky roku sousedů a výpravy s `tools` → `ironBars`.

**Postup:**

- [ ] **Krok 1:** Testy:
  - řetěz ruda + uhlí → houba → hřivny → vybavení;
  - bez měchaře poloviční tempo;
  - bez rudy nebo uhlí stojí s činností a upozorněním;
  - vybavení se opotřebí a doplní;
  - pokrytí z vybavení;
  - obchod s hřivnami;
  - převod starší vsi a obchodu;
  - kování vozu z hřiven.
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat: kovář taví houbu a kove hřivny, nástroje jako vybavení`.

### Úloha 5: Scéna – humno a jámy

**Soubory:** Blender `tools/blender/threshing.py` (humno – jen mlatová plocha bez přístřešku (Martin 21. 10. 2026), stoh slámy na kraji; hole a lopata jako rekvizity), scéna `threshing-floor.ts`, postavy (`villager-plan.ts` – mlácení holemi (ne cepy – Martin 21. 10. 2026), prohazování lopatou proti větru, nošení snopů z pole na humno a zrna do jam – provoz na cestách), výběr humna (panel – výmlat, snopy čekající).

**Postup:**

- [ ] **Krok 1:** Ukázka `/dev/buildings` **Humno** (mlat bez přístřešku, stavba po fázích – vytyčení, sejmutí drnu, hlína, dusání, vymazání, mlácení, prohazování).
- [ ] **Krok 2:** Ukázka `/dev/landscape` (žně → humno → jámy).
- [ ] **Krok 3:** Snímky z harnessu.
- [ ] **Krok 4:** Měření nejdelšího snímku.
- [ ] **Krok 5:** Commit.

### Úloha 6: Scéna – kovář, hrnčíř, tesař a nošení výrobků

**Soubory:**

- **kovárna:** pec u dílny (redukční pec, dým a žár), měch a měchař, houba, hromádka hřiven (Blender `crafts.py` díly);
- **hrnčíř:** jáma s hlínou a šlapání, kruh, lavice se sušícími nádobami, pec;
- **tesař:** rekvizity jsou, doplnit nošení nářadí;
- **nošení** nástrojů, nádob a nářadí do domácností – provoz na cestách, postavy z rosteru (role a činnost).

**Postup:**

- [ ] **Krok 1:** Ukázky `/dev/buildings` – kovárna, hrnčířství, tesař po krocích.
- [ ] **Krok 2:** Snímky.
- [ ] **Krok 3:** Měření.
- [ ] **Krok 4:** Commit.

### Úloha 7: Dokumentace

`fields.md` (výmlat hned po žni, humno, jámy), `crafts.md` (kovář – řetěz, hřivny, vybavení), `trade.md` (hřivny), `CLAUDE.md`, rešerše `docs/design/research/2026-10-20-production-chains.md`. Commit `docs: výrobní řetězy`.
