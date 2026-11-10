# Křesťanství – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Každý rod jednou za rok losuje, jestli narazil na křesťanství (šance exponenciálně roste
od roku 500 do 900); vojvoda se pak smí tlačítkem pokřtít – propustí vedlejší manželky, jeho děti
jsou křesťané, rod smí kácet posvátné duby a háje a zaorat slovanský hřbitov; vesničané se obracejí
pomalu (kostel s knězem je samostatné téma po kamenném zdivu) a štěstí vsi je vážený průměr pohanů
a křesťanů; NPC rody se pokřtí samy.

**Architecture:** Rod má záznam v tabulce `house` bez herního stavu, vojvoda a rodina žijí ve stavu
vsi (`VillageState.dynasty`). Proto **rodové příznaky** (zná křesťanství, pokřtěný) jsou nové sloupce
`house` (migrace) a mění je **use-casy** (roční úloha světa, akce hráče); do vsí rodu se dostanou
**událostí schránky** `rod-baptized`, kterou ves zapíše do nové volitelné části
`VillageState.faith` a v den události deterministicky provede křest vojvody (víra, propuštění
manželek). **Víra osob** je volitelné `Person.faith` (chybí = pohan). Obrácení, štěstí a pohřby
jsou čisté funkce simulace dne (náhoda ze seedu vsi). Posvátnost míst zůstává funkcí vrstvy
překážek (`sacredSitesOf`) – **vrstva se nemění**; povolení kácení je filtr podle `VillageState.faith`
jen v umístění staveb a polí hráčem a ve stavbě (vesničané dřevo dál berou mimo posvátné stromy,
pěšiny a vozová síť se nemění).

**Tech Stack:** TypeScript 6, Vitest, Drizzle + PostgreSQL (migrace `0042`), Next.js 16, Babylon.js 9,
Playwright, Blender (`tools/blender`).

**Spec:** [docs/design/christianity.md](../../design/christianity.md) (schváleno Martinem 10. 11. 2026:
„Takhle je to ok“). Navazuje: [happiness.md](../../design/happiness.md),
[cemetery.md](../../design/cemetery.md), [lord.md](../../design/lord.md),
[hillfort.md](../../design/hillfort.md), [kinship.md](../../design/kinship.md),
[demolition.md](../../design/demolition.md), [fields.md](../../design/fields.md) (trojpolí).

## Global Constraints

- Čísla jen v `rules*.ts` (nový `packages/game/src/domain/village/rules-faith.ts`) s odkazem na sekci
  `christianity.md`; změna čísla = i text v návrhu.
- Determinismus: žádné `Math.random`, `Date.now`, `new Date()` v `packages/game`; los ze
  `createRandom(deriveSeed(…))` (`domain/landscape/random.ts`); výsledek nezávisí na kouscích
  dopočtu (test „vcelku = po kouscích“ u každé simulační změny).
- Nové části stavu volitelné, starší vsi bez nich = pohané bez křesťanství; převod idempotentní.
- Vrstva překážek, síť pěšin a vozová síť se **nesmí změnit** (zlaté otisky krajiny a překážek).
- Hexagon: doména neimportuje use-casy ani infrastrukturu; web volá use-casy přes `lib/`.
- Rozhraní jako 0 A.D.: ikony s čísly, slova jen v `Tooltip`, důvod zašedlého tlačítka u kurzoru.
- Texty česky, krátká pomlčka „–“, nikdy „—“; rozhodnutí bez Martina v docs = „návrh Clauda“.
- Čísla specu: objev `p(rok) = 0,0000518 × (e^(0,0185 × (rok − 500)) − 1)` za rok; obrácení
  0,5 % bez kostela / 3 % s kostelem × (1 + podíl křesťanů); nespokojenost pohanů −15 za dub či háj,
  −20 za hřbitov, nejvýš −30, bez časové meze; kostel přidá křesťanům jako posvátná místa (strop +40);
  NPC rod se pokřtí 1–20 let po objevu.

## Review Focus

1. **Rod s víc vsemi** – křest musí dorazit do všech vsí rodu a ves založená až po křtu (dělení vsi,
   stěhování) příznak zdědí; jinak by v jedné vsi rodu nešlo kácet a obracet. Test v K4.
2. **Nástupce po křtu** – syn narozený před křtem je pohan, rod ale zůstává pokřtěný: nové vedlejší
   manželky nepřibudou (`extraWivesDay` v pokřtěném rodu nic nedělá), tlačítko se znovu neukáže.
   Test v K4.
3. **Přehrání losu objevu** pro rody, které už žijí (vývojový svět ≈ rok 870) – výsledek musí být
   stejný jako rok po roku a úloha idempotentní při opakovaném běhu workeru. Test v K3.
4. **Vesničané a správce posvátná místa neničí** – dřevo, milíře, pěšiny a správce je dál obcházejí;
   nespokojenost vzniká jen z hráčovy stavby, pole nebo bourání. Test v K6.
5. **Propuštěné manželky** – zmizí z dvorce, `wivesOf`, `lordFamily` a elity; jejich synové
   s vojvodou zůstávají muži rodu (`line`), dcery také; nová svatba propuštěné je možná. Test v K4.

---

### K1: Pravidla, typy a čisté funkce víry

**Files:**

- Create: `packages/game/src/domain/village/rules-faith.ts`, `packages/game/src/domain/village/faith.ts`
- Modify: `packages/game/src/domain/village/types-people.ts` (`Person`), `types-state.ts` (`VillageState`)
- Test: `packages/game/src/domain/village/__tests__/faith.test.ts`

**Interfaces:**

- Produces:
  - `FAITH` v `rules-faith.ts`: `{ discovery: { a: 0.0000518, k: 0.0185, fromYear: 500 },
conversion: { withoutChurch: 0.005, withChurch: 0.03 }, desecration: { oakOrGrove: 15,
cemetery: 20, max: 30 }, churchHappiness: 40, npcBaptismYears: { min: 1,
max: 20 }, cemeteryUnusedYears: 10 }` (každé číslo s odkazem na sekci specu).
  - `type Faith = 'christian'`; `Person.faith?: Faith` (chybí = pohan);
  - `interface VillageFaith { rodBaptizedDay?: number; desecrated?: { oaksOrGroves: number;
cemeteries: number } }`; `VillageState.faith?: VillageFaith`.
  - `christianityChance(year: number): number`, `discoveryYear(seed: number, fromYear: number,
toYear: number): number | null` (první rok ≤ `toYear`, kdy los padl; rok po roku `deriveSeed(seed,
'faith:' + rok)`), `isChristian(p: Person): boolean`, `rodBaptized(state: VillageState): boolean`,
    `threeFieldAllowed(year: number, baptized: boolean): boolean` (rok ≥ `THREE_FIELD_FROM_YEAR` a
    pokřtěný – zatím nikde nevolané).

- [x] **Step 1:** Testy: `christianityChance(500) === 0`; kumulativně do roku 600 ≈ 1 % (0,8–1,2),
      do 800 ≈ 51 % (48–54), do 900 ≥ 98,5 % (spočti `1 − Π(1 − p)`); `discoveryYear` deterministický
      a `discoveryYear(s, 500, 900)` = první rok, kdy padne los rok po roku (porovnej s ruční smyčkou);
      `threeFieldAllowed(1099, true) === false`, `(1100, false) === false`, `(1100, true) === true`.
- [x] **Step 2:** Spusť `npx vitest run src/domain/village/__tests__/faith.test.ts` (v `packages/game`) –
      FAIL.
- [x] **Step 3:** Implementuj `rules-faith.ts`, `faith.ts` a typy.
- [x] **Step 4:** Testy PASS; `npm run typecheck` z kořene.
- [x] **Step 5:** Commit `feat(game): víra – pravidla, typy a los objevu křesťanství`.

### K2: Rodové příznaky v DB

**Files:**

- Modify: `packages/game/src/application/houses.ts` (`House`, `HouseRepository`),
  `packages/game/src/application/__tests__/in-memory-houses.ts`, `packages/db/src/schema/house.ts`,
  `packages/db/src/adapters/house-repository.ts`
- Create: migrace `packages/db/drizzle/0042_*.sql` (`npm run db:generate`)
- Test: `packages/db/src/adapters/__tests__/house-repository.db.test.ts`

**Interfaces:**

- Produces: `House.christianityKnownYear: number | null`, `House.baptizedDay: number | null`;
  `HouseRepository.markChristianityKnown(houseId: string, year: number): Promise<boolean>` (zapíše jen
  když je null – vzor `claimEnnoble`), `markBaptized(houseId: string, day: number): Promise<boolean>`
  (jen když zná a ještě není pokřtěný).

- [x] **Step 1:** Test DB: nový rod má obojí null; `markChristianityKnown` podruhé vrátí false a rok
      nezmění; `markBaptized` bez znalosti false, po ní true a podruhé false.
- [x] **Step 2:** `TEST_DATABASE=bohemia_test_faith npm run test:db` – FAIL.
- [x] **Step 3:** Sloupce `christianity_known_year integer`, `baptized_day integer` (null), adaptér,
      in-memory. **`bohemia` nemigrovat** (migraci pouští hlavní relace).
- [x] **Step 4:** test:db PASS (DB pak zrušit `dropdb`).
- [x] **Step 5:** Commit `feat(db): rod zná křesťanství a den křtu`.

### K3: Roční úloha světa – objev a NPC křest

**Files:**

- Create: `packages/game/src/application/advance-christianity.ts`
- Modify: `packages/game/src/application/succession-credits.ts` (`runWorldTasks`),
  `packages/game/src/application/notices.ts` (`PlayerNoticeKind` + `'christianity-known'`),
  `packages/game/src/domain/village/inbox.ts` (`VillageEventBody` + `{ kind: 'christianity-known' }`
  a `{ kind: 'rod-baptized'; houseId: string }`), `types-chronicle.ts` (`christianity-known`)
- Test: `packages/game/src/application/__tests__/advance-christianity.test.ts`

**Interfaces:**

- Consumes: K1 `discoveryYear`, `FAITH.npcBaptismYears`; K2 repozitář.
- Produces: `advanceChristianity(deps: { houses: HouseRepository; inbox: …; notices: …; worldSeed:
number }, today: number): Promise<{ known: number; npcBaptized: number }>` – pro každý rod bez
  znalosti `discoveryYear(deriveSeed(worldSeed, 'faith:' + houseId), rok založení rodu (nebo 500),
letošní rok)`; padne-li → `markChristianityKnown`, upozornění hráči, zápis do kroniky vsi vojvody
  schránkou (`christianity-known`). NPC rod (`kind: 'npc'`) se zná-li pokřtí v roce
  `known + 1–20` (los ze seedu rodu) → `markBaptized` + `sendRodBaptized`.
  - `sendRodBaptized(deps, houseId: string, day: number): Promise<void>` – událost `rod-baptized`
    do schránky všech vsí rodu (K4 ji použije pro hráče a doplní, co ves s událostí udělá).

- [x] **Step 1:** Testy: rod založený 520 při běhu v roce 870 – výsledek = smyčka rok po roku;
      druhý běh téhož dne nic nezapíše (idempotence); upozornění a událost schránky jen jednou;
      NPC rod známý v roce X je pokřtěný nejdřív X+1 a nejpozději X+20.
- [x] **Step 2:** FAIL.
- [x] **Step 3:** Implementace + zapojení do `runWorldTasks` (vzor `openAnnualDialogs` v
      `annual-levies.ts`). Text kroniky „Rod se dozvěděl o novém Bohu.“ v
      `apps/web/lib/village-view-chronicle.ts` (`chronicleText`).
- [x] **Step 4:** PASS, `npx vitest run` v `packages/game` a `apps/worker`.
- [x] **Step 5:** Commit `feat(game): rod se dozví o křesťanství – roční los a NPC křest`.

**Provedeno jinak než výš (návrh Clauda):** seed rodu `houseFaithSeed` = `deriveSeed(worldSeed,
'house:' + id)` (los roku z `'faith:' + rok` dělá `discoveryYear`); první los `firstDiscoveryYear`
– rod založený během roku losuje poprvé příští 1. 1.; kronika jde obecnou událostí `chronicle`
(nový druh kroniky `christianity-known`, ne nový druh schránky); deps navíc `settlements`,
`villages`, `stewardships`, `vassalages` (výpis NPC rodů), `dayOf` a paměť workeru `doneYear`.
NPC rod objev ani křest do kroniky nepíše.

### K4: Křest vojvody a rodu

**Files:**

- Create: `packages/game/src/application/baptize.ts`, `packages/game/src/domain/village/baptism.ts`
- Modify: `inbox.ts` (`applyInboxDay` – `rod-baptized`), `dynasty-wives.ts` (`extraWivesDay`),
  `population.ts` (`populationDay` – víra novorozence), `dynasty.ts` (`markNewborn`), převody
  (`simulate.ts` řetěz `with*`, `application/update-village.ts`), založení nové vsi rodu (najdi, kde
  se kopíruje `dynasty` do nové vsi – dělení vsi, stěhování) – zdědí `faith.rodBaptizedDay`
- Test: `packages/game/src/domain/village/__tests__/baptism.test.ts`,
  `packages/game/src/application/__tests__/baptize.test.ts`

**Interfaces:**

- Consumes: K1, K2, K3 (událost `rod-baptized`).
- Produces:
  - `baptizeLord(deps, input: { playerId: string; villageId: string; today: number }):
Promise<{ ok: true } | { ok: false; reason: string }>` (vzor `order-breakout.ts`: `requireRight`,
    důvody v konstantě – „Rod křesťanství nezná.“, „Rod je už pokřtěný.“, „Tvůj vojvoda tu není.“).
  - (`sendRodBaptized` je z K3.)
  - `baptizeVillage(state: VillageState, day: number): VillageState` (doména): `faith.rodBaptizedDay`;
    ve vsi vojvody `lord.faith = 'christian'`, vedlejší manželky propuštěné (`spouseId` = null,
    zůstávají ve svých domech, mohou se znovu vdát), jejich děti s vojvodou beze změny (`line`
    zůstává), kronika `lord-baptized` a `wives-released` (počet).
  - Novorozenec je `faith: 'christian'`, je-li křesťan aspoň jeden rodič.

- [ ] **Step 1:** Testy domény: po `baptizeVillage` vojvoda křesťan, `wivesOf(lord)` jen hlavní,
      propuštěné nejsou v `lordFamily`/`isElite`; syn vedlejší manželky dál `isLineMan`; dítě narozené
      po křtu je křesťan; `extraWivesDay` v pokřtěné vsi nic nepřidá ani po smrti vojvody (nástupce
      pohan); idempotence (událost dvakrát = jednou); vcelku = po kouscích přes JSON.
- [ ] **Step 2:** Testy use-casu: bez znalosti důvod, podruhé důvod, rod se dvěma vsemi → obě
      dostanou `faith.rodBaptizedDay`; ves založená rodem po křtu ho má.
- [ ] **Step 3:** FAIL → implementace → PASS.
- [ ] **Step 4:** `npx vitest run` v `packages/game` (zlaté otisky beze změny – stará ves nic nemá).
- [ ] **Step 5:** Commit `feat(game): křest vojvody – jediná manželka, pokřtěné děti, příznak ve vsích rodu`.

### K5: Obrácení vesničanů a štěstí

**Files:**

- Modify: `packages/game/src/domain/village/happiness.ts` (`happinessFactors`, `updateHappiness`),
  `sacred.ts` (`sacredHappiness` jen pro pohany), `summary.ts` (`happinessSummary` – rozpis obou
  skupin), `simulate.ts` (`simulateDaySteps` – roční krok 1. 1.)
- Create: `packages/game/src/domain/village/conversion.ts`
- Test: `packages/game/src/domain/village/__tests__/conversion.test.ts`, `happiness.test.ts`

**Interfaces:**

- Consumes: K1 `FAITH`, `isChristian`, `rodBaptized`. Vytvoř v `conversion.ts`
  `hasChurch(state: VillageState): boolean` – zatím vždy false (kostel je samostatné téma).
- Produces: `conversionDay(state: VillageState, day: number): VillageState` (1. 1., jen
  `rodBaptized`; dospělý pohan s šancí `(hasChurch ? 0,03 : 0,005) × (1 + podíl křesťanů)`, los
  `deriveSeed(state.seed, 'convert:' + rok + ':' + id)`); kronika `converted` (počet za rok).
  Cílové štěstí = vážený průměr cíle pohanů (posvátná místa − nespokojenost z `faith.desecrated`)
  a křesťanů (kostel `FAITH.churchHappiness`, posvátná místa 0) podle počtu lidí.

- [ ] **Step 1:** Testy: ves bez křtu – štěstí přesně jako dnes (zlatý otisk beze změny); ves samých
      pohanů po zničení háje −15 bez časové meze; 2 háje + hřbitov = −30 (strop); ves samých křesťanů
      nespokojenost 0 (kostel zatím není – posvátná místa jim 0); půl na půl = průměr; obrácení: 1 000
      pohanů bez kostela a 0 % křesťanů → za rok ≈ 5 (1–10); bez křtu rodu nikdo; vcelku = po kouscích.
- [ ] **Step 2:** FAIL → implementace → PASS.
- [ ] **Step 3:** `npx vitest run` v `packages/game`.
- [ ] **Step 4:** Commit `feat(game): obrácení vesničanů a štěstí pohanů a křesťanů`.

### K6: Posvátná místa a hřbitov po křtu

**Files:**

- Modify: umístění hráčem – `placement-dwellings.ts`, `placement-pens.ts`,
  `placement-fortifications.ts`, `placement-squares.ts` (`sacredSelection`, koruna dubu),
  `placement-fields.ts`, `placement-land.ts` (`checkFootprintFree` – hřbitov), `structure-use.ts`
  (`Target` + hřbitov), `demolition.ts`, stavba, která kácí stromy v půdorysu (najdi – les pod stavbou,
  `forest-buildings`), `placement-types.ts` (`PlacementVillage` + `faith`)
- Create: `packages/game/src/domain/village/desecration.ts`
- Test: `packages/game/src/domain/village/__tests__/desecration.test.ts`

**Interfaces:**

- Consumes: K1 `rodBaptized`, `FAITH.cemeteryUnusedYears`.
- Produces: `protectedTreesFor(state: PlacementVillage, layer): ReadonlySet<number>` (pokřtěný rod →
  prázdná množina, jinak `sacredSitesOf(layer).protectedTrees`) – použít **jen** v umístění hráčem
  a stavbě; `wood.ts`, `crafts.ts`, `charcoal.ts`, `trail.ts`, `road-swath.ts`, `wagon-road.ts`
  a správce zůstávají na `sacredSitesOf`. `recordDesecration(state, kind: 'oakOrGrove' | 'cemetery',
day): VillageState` (+1 do `faith.desecrated`, kronika `sacred-felled` / `cemetery-ploughed`).
  `cemeteryMayGo(state, cemetery, day): boolean` = pokřtěný rod a (`freePlaces` 0 nebo poslední
  pohřeb před ≥ 10 lety).

- [ ] **Step 1:** Testy: nepokřtěná ves – stavba na háji odmítnuta jako dnes; pokřtěná – povolena
      a po dokončení `desecrated.oaksOrGroves` +1; pole přes háj v pokřtěné vsi bez odečtu koruny; zaorání
      plného hřbitova povoleno, hřbitova s volným místem a pohřbem loni ne; vesničané na dřevo posvátný dub
      nevezmou ani v pokřtěné vsi; zlaté otisky překážek, pěšin a vozové sítě beze změny.
- [ ] **Step 2:** FAIL → implementace → PASS.
- [ ] **Step 3:** `npx vitest run` v `packages/game`; scéna zrušený strom nakreslí jako dnes
      (`clearedObstacles`).
- [ ] **Step 4:** Commit `feat(game): pokřtěný rod smí kácet posvátná místa a zaorat hřbitov`.

### K7: Kostrové pohřby křesťanů

> Kostel, kněz a hřbitůvek u kostela jsou **samostatné téma** (Martin 10. 11. 2026: „Podle mě jsou
> kostely velké téma, které bude potřeba probrat zvlášť. Navíc ještě předtím musíme vytvořit celou
> infrastrukturu pro stavbu kamenného zdiva“) – v tomto plánu nejsou; `hasChurch` zůstává false.

**Files:**

- Modify: `cemetery.ts` / `burials.ts` (`bury` – obřad podle víry zemřelého), `types-land.ts`
  (hrob + `rite?: 'inhumation'`; chybí = žárový)
- Test: `packages/game/src/domain/village/__tests__/burials.test.ts`

**Interfaces:**

- Consumes: K1 `isChristian`.
- Produces: křesťan se pohřbí na starém slovanském hřbitově **kostrově** (`rite: 'inhumation'`,
  bez mohyly – zabere jedno místo jako dnes hrob bez mohyly); pohan dál žárově jako dnes.

- [ ] **Step 1:** Testy: křesťan → hrob s `rite: 'inhumation'` bez mohyly; pohan beze změny; plnost
      hřbitova se počítá stejně; vcelku = po kouscích.
- [ ] **Step 2:** FAIL → implementace → PASS; `npx vitest run` v `packages/game`.
- [ ] **Step 3:** Commit `feat(game): křesťané se pohřbívají kostrově`.

### K8: Rozhraní

**Files:**

- Modify: `apps/web/app/game/actions.ts` (+ `baptizeLord`), `apps/web/lib/village.ts` (volání
  use-casu), `apps/web/lib/village-input.ts` (parser), `apps/web/lib/person-view.ts`
  (`baptizable`, `faith`), `apps/web/lib/selection-details.ts`, `apps/web/components/game/hud/selection/people.tsx`
  (tlačítko u vojvody vedle `EnnobleActions`), potvrzovací dialog (vzor `hud/FortConfirm.tsx`),
  `apps/web/lib/village-view-chronicle.ts` (texty `lord-baptized`, `wives-released`, `converted`,
  `sacred-felled`, `cemetery-ploughed`), rozpis štěstí (`happinessSummary` v popisku – pohané
  a křesťané)
- Test: `apps/web/components/game/hud/__tests__/SelectionPanel.test.tsx`, nový
  `BaptizeButton.behavior.test.tsx`, `apps/web/lib/__tests__/village-view.test.ts`

**Interfaces:**

- Consumes: K4 `baptizeLord`, K5 rozpis štěstí.
- Produces: tlačítko s ikonou kříže víry (`/icons/house/faith-cross.png`, popisek „Nechat se
  pokřtít“), jen když `baptizable`; zašedlé s důvodem jinak se neukazuje; po kliknutí dialog
  „Křest nejde vzít zpět. Vedlejší manželky budou propuštěny.“ a potvrzení.

- [ ] **Step 1:** Testy komponent: tlačítko jen u vojvody rodu, který zná a není pokřtěný; dialog;
      volání akce; texty kroniky.
- [ ] **Step 2:** FAIL → implementace → PASS; `npx vitest run` v `apps/web`.
- [ ] **Step 3:** Commit `feat(web): křest vojvody a texty kroniky`.

### K9: Scéna, ikona a e2e

**Files:**

- Create: ikona `house/faith-cross` v `tools/blender/icons.py` → `apps/web/public/icons/house/`
  (+ `LICENSES.md`; pozor, `house/cross.png` je křížek „zavřít“)
- Modify: `apps/web/lib/scene/funeral-plan.ts` (`rite: 'inhumation'` – bez hranice, plochý hrob
  s dřevěným křížem na starém hřbitově)
- Test: `apps/web/lib/scene/__tests__/funeral-plan.test.ts`; e2e `apps/web/e2e/village.spec.ts`
  (nový test: rodu se zapíše znalost do DB → tlačítko → křest → propuštěná manželka v kronice)

**Interfaces:**

- Consumes: K7 hroby, K8 rozhraní.

- [ ] **Step 1:** Ikona z Blenderu; snímek tlačítka a kostrového hrobu do scratchpadu ke kontrole
      Martinem.
- [ ] **Step 2:** Test plánu pohřbu (kostrový bez hranice) – FAIL → PASS.
- [ ] **Step 3:** e2e na vlastním portu a DB (`E2E_PORT`, `TEST_DATABASE`) – PASS.
- [ ] **Step 4:** Commit `feat(web): ikona křtu a kostrové pohřby ve scéně`.

### K10: Dokumentace a integrace

**Files:**

- Modify: `docs/code/village-people.md` (víra, obrácení), `village-buildings.md` (hřbitov – kostrové hroby),
  `village-core.md` (štěstí), `world.md` (roční úloha), `web-ui.md` (tlačítko),
  `docs/design/christianity.md` (Stav: implementováno, odškrtnuté body), tento plán (odškrtnout).

- [ ] **Step 1:** Zápisy do `docs/code/` (jen potřebné sekce).
- [ ] **Step 2:** Z kořene `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test`.
- [ ] **Step 3:** Commit `docs: křesťanství – mapa kódu a stav návrhu`.

## Pořadí a souběh

K1 → K2 → K3 → K4 → (K5 ∥ K6 ∥ K7) → K8 → K9 → K10 (K7 jen kostrové pohřby – kostel samostatně). Integrační větev `feat/christianity`, každá
úloha vlastní větev `feat/christianity-kN` z ní. Migraci `0042` do `bohemia` pouští hlavní relace
po sloučení K2 (se zálohou). Celé e2e až v integraci.
