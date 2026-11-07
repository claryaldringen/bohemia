# Vstup nového hráče do světa – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nový hráč bez pozvánky začne v odříznuté krajině a vybere si pána z nejmenších rodů nad
sebou (první potvrzení vyhraje, po týdnu los), nebo začne svobodný u své jazykové skupiny.

**Architecture:** Doména (`domain/world`) dostane čisté funkce nabídky pánů a umístění shluku
vsí; use-casy (`application/newcomers.ts`) řídí odříznutí, žádosti, umístění a týdenní los
(úloha světa ve workeru); web přidá volbu jazyka při registraci, úvodní volbu cesty, nabídku
a čekání. Odříznuté sídlo má `worldCell = null` a místní souřadnice ve vlastní mřížce rodu.

**Tech Stack:** TypeScript 6, Next.js 16, Drizzle + PostgreSQL, Better Auth, Vitest, Playwright.

**Spec:** [docs/design/newcomers.md](../../design/newcomers.md) (schváleno Martinem 7. 11. 2026).

## Global Constraints

- Jazyky přesně `cs`, `en`, `de`, `pl`, `it`, `fr`, `es`; výchozí a dosavadní účty `cs`; zatím
  jen příznak – rozhraní zůstává česky.
- Nabídka: jen rody hráčů (ne NPC), živé, s nejmenším počtem živých vsí ≥ 2, který některý rod
  hráče má; nahoře stejný jazyk; uvnitř skupiny pevné pořadí ze seedu účtu nováčka; výběr 1–5.
- Podmínky žádosti: holá přísaha (`terms: {}`), pán jen přijme / odmítne (bez protinávrhu).
- Týden = 7 skutečných dní od první žádosti; pak los ze seedu účtu mezi vybranými rody, které
  neodmítly; nikdo → svobodný. Nový výběr po odmítnutí všemi jen v témže týdnu.
- Umístění: vazal – nejblíž mapě sídla pána, odstup 2 (`invitedGap`); svobodný – nejblíž mapě
  kterékoli vsi rodu stejného jazyka, odstup 3 (`independentGap`), bez takového rodu nejblíž
  středu světa; shluk vsí rodu se přesune celý se zachováním vzájemných poloh.
- Ochrana nováčka 7 dní (`WAR.newLineProtectionDays`) běží od umístění (`house.placedAt`).
- Hexagon: doména a use-casy bez I/O, čas a náhoda parametrem (CLAUDE.md); komentáře česky,
  en dash „–“, nikdy „—“; UI jako 0 A.D. (slova jen v `Tooltip`; výjimka: registrační formulář
  mimo hru má popisky jako dnes).
- Migrace číslovat od **0037**; DB `bohemia` migruje jen koordinátor.

## Review Focus

1. Dva páni přijmou žádost téhož nováčka naráz → vznikne právě jedno vazalství, druhý dostane
   „Nováček už má pána.“ (Úloha 3, db test souběhu).
2. Týden vyprší ve chvíli, kdy pán přijímá → jediný výsledek, nováček umístěný jednou (Úloha 3).
3. Syn odříznutého rodu odejde na novou mapu před umístěním → po umístění leží obě vsi na mapě
   světa vedle sebe ve stejné vzájemné poloze (Úloha 3).
4. Odříznutý rod se neobjeví v adresáři rodů, v nabídce pánů, ve válce ani v obchodu mezi hráči;
   vydat pozvánku nesmí, dokud není umístěný (Úloha 3 – test adresáře a pozvánky).
5. Prázdná nabídka (nikdo nemá ≥ 2 vsi) a prázdná jazyková skupina → nabídka ukáže jen
   „Svobodný“, svobodný se umístí u středu světa (Úlohy 2 a 4).

---

### Úloha 1: Jazyková skupina (≈ 90 kroků)

**Files:**

- Modify: `packages/db/src/schema/auth.ts:17` (hodnoty jazyka), `packages/db/src/schema/house.ts`
  (nový sloupec `language text not null default 'cs'`), migrace `0037_language`.
- Create: `packages/game/src/domain/world/languages.ts` (+ test).
- Modify: `apps/web/lib/auth.ts:20-22` (`additionalFields.language` – `input: true`, ověření
  hodnoty), `apps/web/components/auth/RegisterForm.tsx` (výběr jazyka), `HouseRepository.create`
  (`packages/game/src/application/houses.ts`, adaptér `house-repository.ts`) – rod dostane jazyk
  účtu, `enterGame` (`application/enter-game.ts:46`) ho předá; `PublicHouse` + adaptér
  `world-directory.ts` (jazyk veřejný).

**Interfaces:**

- Produces: `type LanguageGroup = 'cs' | 'en' | 'de' | 'pl' | 'it' | 'fr' | 'es'`,
  `LANGUAGE_GROUPS: readonly LanguageGroup[]`, `isLanguageGroup(v: unknown): v is LanguageGroup`
  (v `languages.ts`, export z `@bohemia/game`); `House.language: LanguageGroup`;
  `PublicHouse.language: LanguageGroup`; `chooseLanguage(deps, { playerId, language }):
Promise<{ ok: true } | { ok: false; reason: string }>` (`application/languages.ts`) – uloží
  jazyk účtu i rodu, jen dokud hráč nezaložil ves (pro účty přes Google – spec).

- [ ] **Krok 1:** test `languages.test.ts` – `isLanguageGroup('de') === true`,
      `isLanguageGroup('ru') === false`, `LANGUAGE_GROUPS` má 7 položek v pořadí výš.
- [ ] **Krok 2:** `languages.ts`; test prochází.
- [ ] **Krok 3:** schéma + migrace `0037_language` (dosavadní rody `cs`), `npm run db:generate`;
      db test `house-repository.db.test.ts`: `create({ …, language: 'pl' })` → `byId(id).language ===
'pl'`; adresář vrací `language`.
- [ ] **Krok 4:** Better Auth `language` vstupem s ověřením (`isLanguageGroup`, jinak chyba
      registrace); `RegisterForm` – výběr (nativní `select`, výchozí `cs`, popisek „Jazyk“);
      behavior test formuláře: zvolený `de` odejde v `signUp.email`.
- [ ] **Krok 5:** `enterGame` – rod dostane `language` účtu (port pro jazyk účtu: rozšiř
      `EnterGameDeps` o `accountLanguage(playerId): Promise<LanguageGroup>` s adaptérem nad
      tabulkou `user`); unit test s in-memory porty.
- [ ] **Krok 6:** `chooseLanguage` + server action; unit test: po založení vsi
      `{ ok: false, reason: 'Jazyk se volí jen na začátku.' }`.
- [ ] **Krok 7:** `typecheck`, `lint`, `test`, `format:check`, `test:db`; e2e
      `accounts.spec.ts` (registrace s jazykem); commit `feat(web): jazyková skupina při
registraci`.

### Úloha 2: Nabídka pánů a umístění shluku – doména (≈ 80 kroků)

**Files:**

- Create: `packages/game/src/domain/world/lord-offer.ts`, `packages/game/src/domain/world/cluster-placement.ts` (+ testy v `__tests__/`).
- Modify: `packages/game/src/domain/world/placement.ts:11,35` (nový druh žádosti),
  `rules-world.ts` (`NEWCOMERS = { maxChoices: 5, waitDays: 7 }` s odkazem na spec).

**Interfaces:**

- Consumes: `LanguageGroup` (Úloha 1), `cellDistance`, `ringCells`, `OccupiedCell`,
  `GridCell` (`placement.ts`), `deriveSeed` / `createRandom` (`landscape/random`).
- Produces:
  - `interface OfferCandidate { houseId: string; kind: 'player' | 'npc'; alive: boolean;
villages: number; language: LanguageGroup }`
  - `lordOffer(candidates: readonly OfferCandidate[], newcomer: { language: LanguageGroup;
seed: number }): string[]` – id rodů v pořadí nabídky.
  - `PlacementRequest` rozšířený o `{ kind: 'independent'; sameLanguage: readonly GridCell[] }`
    (prázdné pole = jako dnes, střed světa).
  - `placeCluster(occupied: readonly OccupiedCell[], cluster: readonly GridCell[], request:
PlacementRequest): { offset: GridCell; cells: GridCell[] }` – `cluster` v místních
    souřadnicích (první = sídlo); hledá po prstencích od cíle první posun, kde mají všechny
    buňky shluku odstup ≥ gap od cizích; pro jednu buňku dá totéž co `placeNewPlayer`.

- [ ] **Krok 1:** testy `lord-offer.test.ts`: rody s 1 / 2 / 2 / 3 vsemi → jen ty se 2; když
      nikdo nemá 2, rody se 3; NPC a mrtvé vynechané; nikdo s ≥ 2 → `[]`; stejný jazyk první;
      stejný seed → stejné pořadí, jiný seed → jiné pořadí (aspoň pro 6 rodů).
- [ ] **Krok 2:** `lordOffer`; testy prochází.
- [ ] **Krok 3:** testy `cluster-placement.test.ts`: jedna buňka = `placeNewPlayer` (pro
      `independent` i `invited`); shluk `[(0,0),(1,0)]` vedle obsazeného pána drží odstup 2 u obou
      buněk a vzájemnou polohu; svobodný s `sameLanguage: [(10,10)]` skončí blíž (10,10) než středu;
      prázdné `sameLanguage` → jako dnes.
- [ ] **Krok 4:** `placeCluster` + rozšíření `placeNewPlayer` (cíl u `sameLanguage` = nejbližší
      buňka z nich k prstenci; jen det-math); testy prochází.
- [ ] **Krok 5:** `typecheck`, `lint`, `test`, `format:check`; commit `feat(game): nabídka pánů
a umístění shluku vsí`.

### Úloha 3: Odříznutí, žádosti, umístění a týdenní los – use-casy a DB (≈ 150 kroků)

**Files:**

- Modify: `packages/db/src/schema/settlement.ts:40-41` (`local_x`, `local_y` int null – místní
  souřadnice odříznutého sídla; unikátní index jen pro `grid_x/grid_y` beze změny),
  `schema/house.ts` (`placed_at timestamptz null` – dosavadní = `created_at`;
  `newcomer_since timestamptz null`), `schema/negotiation*.ts` (`newcomer boolean default
false`), migrace `0038_newcomers`.
- Create: `packages/game/src/application/newcomers.ts` (+ test), db testy
  `newcomer-placement.db.test.ts`.
- Modify: `application/enter-game.ts` (bez pozvánky odříznuté sídlo), `application/new-village.ts`
  (`targetSettlement` v místní mřížce odříznutého rodu), `application/negotiate.ts`
  (`acceptNegotiation` u `newcomer` → `placeNewcomer`, `counterNegotiation` u `newcomer`
  odmítne), `application/succession-credits.ts:62,76` (`runWorldTasks` + úloha
  `expireNewcomerWaits`), `apps/worker/src/main.ts:70`, `domain/war/protection.ts:18`
  (`placedAt ?? createdAt`), adaptéry `settlement-repository.ts`, `house-repository.ts`,
  `world-directory.ts` (odříznuté rody vynechat), `notices.ts:7` (`newcomer-request`,
  `newcomer-accepted`, `newcomer-rejected-all`, `newcomer-assigned`, `newcomer-taken`),
  vydání pozvánky (najdi `issueInvite`) – odříznutý rod nesmí.

**Interfaces:**

- Consumes: `lordOffer`, `placeCluster`, `NEWCOMERS` (Úloha 2), `House.language` (Úloha 1),
  `openNegotiation` / `acceptNegotiation` / `rejectNegotiation` / `withdrawNegotiation`
  (`negotiate.ts`), `NEGOTIATION_EFFECTS.oath` (`negotiation-effects.ts:84`).
- Produces (vše v `application/newcomers.ts`, výsledky `{ ok: true; … } | { ok: false; reason:
string }` jako ostatní use-casy):
  - `interface OfferHouse { houseId: string; lordName: string; language: LanguageGroup }`
    (jen veřejné údaje – praporec kreslí web podle `houseId`).
  - `newcomerStatus(deps, playerId): Promise<NewcomerStatus>` – `{ phase: 'isolated'; offer:
OfferHouse[]; requests: { houseId: string; state: 'pending' | 'rejected' }[]; deadline:
Date | null } | { phase: 'placed' }`.
  - `requestLords(deps, { playerId, houseIds: string[], now }): Promise<Result>` – 1–5 rodů
    z aktuální nabídky; otevře jednání `newcomer: true` s `oath` a `terms: {}`; první volání
    nastaví `newcomer_since`.
  - `startFree(deps, { playerId, now }): Promise<Result>` – stáhne žádosti, umístí jako
    svobodného (jazyk).
  - `placeNewcomer(tx, { houseId, lordHouseId: string | null, origin: 'newcomer' |
'newcomer-lot', now }): Promise<Result>` – podmíněně (`placed_at IS NULL`) umístí celý shluk
    vsí rodu, zapíše `placed_at`, u pána založí vazalství a zruší ostatní žádosti (upozornění
    `newcomer-taken` jejich pánům).
  - `expireNewcomerWaits(deps, { now }): Promise<void>` – po `NEWCOMERS.waitDays` los (seed z id
    účtu) mezi neodmítnutými, jinak svobodný.

- [ ] **Krok 1:** migrace `0038_newcomers` + adaptéry (`Settlement.localCell: GridCell | null`,
      `House.placedAt: Date | null`); db test: odříznuté sídlo (`worldCell null`, `localCell (0,0)`)
      se neobjeví v `nearestHouses`.
- [ ] **Krok 2:** `enterGame` bez pozvánky → odříznuté sídlo: `localCell (0,0)`, krajina ze seedu
      `deriveSeed(worldSeed, 'isolated:' + playerId)` (zredukovaný jako `cellLandscapeSeed`),
      `placed_at null`; s pozvánkou beze změny (`placed_at = now`). Unit testy.
- [ ] **Krok 3:** `targetSettlement` u odříznutého rodu – soused v místní mřížce, seed
      `deriveSeed(worldSeed, 'isolated:' + houseId + ':' + x + ',' + y)`; test: odchod syna vytvoří
      druhé odříznuté sídlo `localCell (1,0)` pro směr východ.
- [ ] **Krok 4:** `requestLords` / `newcomerStatus` / `startFree` + testy: jen rody z nabídky,
      1–5, opakování po odmítnutí všemi jen do `deadline`; `startFree` umístí k jazyku.
- [ ] **Krok 5:** `acceptNegotiation` u `newcomer` → `placeNewcomer`; `counterNegotiation`
      u `newcomer` → `{ ok: false, reason: 'Nováček žádá jen o přijetí.' }`; db test souběhu: dva
      páni přijmou naráz → jedno vazalství, druhému `'Nováček už má pána.'`; shluk dvou vsí
      umístěný vedle pána se stejnou vzájemnou polohou.
- [ ] **Krok 6:** `expireNewcomerWaits` v `runWorldTasks` + worker; testy: po 7 dnech los
      deterministický, odmítnutí vynechaní, nikdo → svobodný; souběh s přijetím (podmíněný
      `placed_at IS NULL`) → jediný výsledek.
- [ ] **Krok 7:** ochrana od `placedAt`; odříznutý rod nesmí vydat pozvánku (`'Nejdřív musíš
být na mapě světa.'`); válka ani obchod mezi hráči na něj nemíří (test adresáře). Ověř, že
      pohled na cizí mapu (`apps/web/lib/foreign-map.ts`) bere uložený seed sídla, ne
      `cellLandscapeSeed` – jinak oprav.
- [ ] **Krok 8:** `typecheck`, `lint`, `test`, `format:check`, `test:db`; commit
      `feat(game): odříznutá krajina a výběr pána nováčkem`.

### Úloha 4: Rozhraní – volba cesty, nabídka, čekání, pán (≈ 120 kroků)

**Files:**

- Create: `apps/web/components/game/hud/NewcomerPanel.tsx`, `apps/web/lib/newcomers.ts`
  (server actions přes `guardedAction` – `newcomerStatusAction`, `requestLordsAction`,
  `startFreeAction`), ikony CC0 (praporec s korunou, praporec svobodný, jazyky) + `LICENSES.md`.
- Modify: `apps/web/components/game/VillageGame.tsx:564,1706` (před `LineNamePanel` volba cesty
  pro odříznutého), `hud/HousePanel.tsx:982,1036` (čekání: žádosti, odpočet, „Stáhnout žádosti“
  = svobodný; u pána karta nováčka jen Přijmout / Odmítnout), `hud/NegotiationCard.tsx`,
  `apps/web/lib/player-notices.ts` (texty a panel nových druhů), minimapa (prázdná, `Tooltip`
  „Odříznutá krajina“), adresář / panel rodů (ikona jazyka).

**Interfaces:**

- Consumes: `newcomerStatus`, `requestLords`, `startFree` (Úloha 3), `LanguageGroup` (Úloha 1).

- [ ] **Krok 1:** behavior testy `NewcomerPanel`: dvě ikony; výběr 1–5 (šestý zašedne s
      důvodem „Nejvýš 5 rodů.“); prázdná nabídka → jen „Svobodný“; odeslání volá `requestLordsAction`
      s vybranými id.
- [ ] **Krok 2:** `NewcomerPanel` + napojení ve `VillageGame` (odříznutý bez rozhodnutí → panel
      před jménem vojvody); účet přes Google (provider `google` v tabulce `account`) má v úvodu
      nejdřív řádek ikon jazyků (i pozvaný) → `chooseLanguage`; testy prochází.
- [ ] **Krok 3:** `HousePanel` – čekání (odpočet do `deadline`, stav žádostí ikonou) a karta
      nováčka u pána (jen Přijmout / Odmítnout, `testId="newcomer-accept"` / `"newcomer-reject"`);
      texty upozornění: `newcomer-request` „Nováček žádá o přijetí za vazala.“, `newcomer-accepted`
      „… tě přijal za vazala.“, `newcomer-rejected-all` „Všechny rody žádost odmítly.“,
      `newcomer-assigned` „Los ti přidělil pána.“, `newcomer-taken` „Nováčka přijal jiný rod.“
- [ ] **Krok 4:** e2e `apps/web/e2e/newcomers.spec.ts`: hráč A má rod se 2 vsemi (připraveno
      zápisem do `bohemia_test`), nováček B (jazyk `de`) zvolí „Vybrat pána“, vybere A, staví ves
      v odříznuté krajině; A přijme → B je vazal A a jeho mapa leží u mapy A; nováček C zvolí
      „Svobodný“ → je hned na mapě světa.
- [ ] **Krok 5:** `typecheck`, `lint`, `test`, `format:check`, celé `test:e2e`; commit
      `feat(web): nováček vybírá pána`.

---

Pořadí: Úlohy 1 a 2 souběžně → Úloha 3 → Úloha 4. Mapa kódu po každé úloze do
`docs/code/world.md` (Vstup nováčka).
