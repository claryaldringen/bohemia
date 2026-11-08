# Kostra světa – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Řeky a dálkové obchodní stezky navazují přes mapy sousedů v nekonečné mřížce světa;
každá mapa z kostry dostane body na okraji a generátor je respektuje, sídlo hráče dostane typ
prémie podle místa kostry a stezka kostry je na každé mapě hotová dálková cesta.

**Architecture:** Kostra je čistá funkce `WORLD_SEED` a souřadnic (`domain/world/skeleton/`):
odvodnění po políčkách (povodí ≥ 500 = řeka) a síť uzlů stezek v blocích 20 × 20; výsledkem je
výřez `SkeletonSlice` (body řek a stezek na okraji mapy). Výřez je čtvrtý vstup generátoru krajiny
(`landscape/skeleton/` – mapa s řekou staví terén „řeka první“, stezka je prvek krajiny), ukládá se
u sídla (`settlement.skeleton`) a řídí umístění sídla (`placeSeat`) a typ prémie. Suchá mapa
(výřez null) se generuje bit po bitu jako dnes.

**Tech Stack:** TypeScript 6, Vitest, Drizzle + PostgreSQL (jedna migrace), Next.js 16
(`/dev/skeleton`, `/dev/landscape`), Babylon.js 9 (voda víc řek), Playwright.

**Spec:** [docs/design/world-skeleton.md](../../design/world-skeleton.md) (návrh Clauda 8. 11. 2026,
rámec v [premium-landscapes.md](../../design/premium-landscapes.md) – Kostra světa). Odpovědi
Martina (Otevřené otázky návrhu): Úloha 1 čeká na otázku 1 (směr řek – jezera by změnila
odvodnění), Úloha 14 na otázku 3; otázka 2 mění jen čísla `SKELETON` (Úlohy 1–3 smí běžet s návrhem
a doladit je).

## Global Constraints

- Hexagon a determinismus podle CLAUDE.md: doména bez I/O, žádné `Date.now()`, `new Date()` bez
  argumentu ani `Math.random()`. `packages/game/src/domain/world/skeleton/**` a
  `packages/game/src/domain/landscape/skeleton/**` patří do `DETERMINISTIC_LAYER_FILES`
  v `eslint.config.mjs` (žádné `Math.sin/cos/atan2/hypot/log`, žádné `**`). Výjimky jen
  v pomocných funkcích `premium/river.ts`, které je už mají (volá je jen server).
- Čísla kostry světa jen v `SKELETON` (`domain/world/skeleton/rules-skeleton.ts`, komentář
  s odkazem na world-skeleton.md) – verbatim:
  `river: { minUpstream: 500, upstreamCap: 2000, lateralShare: 0.25, biasWavelength: 16,
widths: [[500, 25], [750, 30], [1000, 35], [1500, 40], [2000, 45]] }`,
  `trail: { block: 20, nodeMargin: 5, edgeShare: 0.7 }`, `port: { margin: 24, trailGap: 16 }`,
  `seat: { slackRings: 1 }`, `world: 1`. Čísla mapy (soutok ≥ 20 políček od okraje, ústí potoka
  ≥ 20 políček od bodu řeky) v `SKELETON_MAP` (`landscape/skeleton/rules-map.ts`); ostatní z `RIVER`.
- Body na okraji: políčko 24–103 ze 128 podél strany, počítané od západu (strany N, S) a od jihu
  (E, W); sever = +y mřížky světa = +z mapy.
- Suchá mapa (výřez null) bit po bitu: zlaté otisky `generate.test.ts`, `obstacles.test.ts`,
  `premium/__tests__` (premium 1) a zlaté otisky vsí se v žádné úloze nemění.
- Nové verze: `LayerVersions.skeleton?: 1` (jen s neprázdným výřezem, jinak chybí – výřez bez
  verze nebo verze bez výřezu = `RangeError`), `premium: 2` (typy na kostře). Graf kostry nese
  `world: 1` a po ostrém spuštění se nesmí změnit – hlídá zlatý otisk z Úlohy 2.
- Pásmo: mapa s řekou projde celým pásmem (celomapové meze bez koryta a nivy řeky) a kontrolou
  kostry; ≥ 95 % z 300 seedů do `MAX_ATTEMPTS` (16) – stejný test jako `premium/__tests__/type-band.ts`.
- Komentáře a texty česky, krátká pomlčka „–“, nikdy „—“; rozhodnutí v docs „návrh Clauda“.
- Každá úloha zapíše mechaniku do své sekce `docs/code/` (landscape.md – Kostra světa na mapě,
  world.md – Kostra světa) a před commitem projde `typecheck`, `lint`, `test`, `format:check`;
  úlohy s DB i `test:db`, se stránkami a scénou i `test:e2e` (souběžné stromy: `E2E_PORT`,
  `TEST_DATABASE`). Subagenti nepouští `db:migrate` do `bohemia` – migraci po sloučení pustí
  hlavní relace (záloha předem).

## Review Focus

1. Dvě sídla se stejným seedem a verzemi, ale jiným výřezem (soused na řece, ves syna bez řeky) →
   mezipaměť krajin vrátí každému jeho krajinu (klíč obsahuje `skeletonKey`) – Úloha 9.
2. Prémiový typ na kandidátovi neprojde pásmem ani ve čtyřech oknech seedů (bod řeky blízko rohu)
   → `enterGame` zkusí dalšího kandidáta, hráč chybu nevidí – Úloha 13.
3. Pán sedí uprostřed řek a stezek, kolem není suché políčko pro odříznutý shluk → hledání pokračuje
   dál po prstencích a skončí, nevyhodí výjimku – Úloha 12.
4. Mezipaměť kostry sdílená mezi dvěma seedy světa (testy, měření) → špatný výřez; mezipaměť nese
   seed a jiný seed odmítne – Úloha 1.
5. Vývojové sídlo bez výřezu (`skeleton` null, verze bez `skeleton`) na políčku, kudy kostra vede →
   krajina sídla i pochod přes něj bit po bitu jako dřív; prázdné políčko vedle má řeku – Úloha 9.

---

## Pořadí a souběh

| Vlna | Úlohy (souběžně)                                                 | Čeká na                                                             |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| A    | Ú1 graf řek a výřez                                              | Otázka 1                                                            |
| B    | Ú2 stezky a místa, Ú4 koryta řek                                 | Ú1                                                                  |
| C    | Ú3 měření a náhled, Ú5 terén s řekou, Ú12 místo sídla – doména   | Ú3, Ú12: Ú2; Ú5: Ú4                                                 |
| D    | Ú6 stezka na mapě, Ú7 víc řek, Ú9 výřez u sídla, Ú10 prémie řeky | Ú5 (Ú9 i Ú2)                                                        |
| E    | Ú8 scéna, Ú11 prémie stezky, Ú13 umístění v aplikaci, Ú14 ves    | Ú8: Ú7; Ú11: Ú6 + Ú10; Ú13: Ú9 + Ú12 + Ú10; Ú14: Ú6 + Ú9 + Otázka 3 |
| F    | Ú15 závěr                                                        | vše                                                                 |

Překryvy souborů v téže vlně: Ú6 × Ú10 `band.ts` (Ú6 přidá volání `checkSkeleton`, Ú10 nic) a
`premium/route.ts` (Ú6 jen nové exporty); Ú7 × Ú9 žádné; Ú11 × Ú13 `premium/assign.ts` (Ú13 ho
nemění – změna je v Ú12). Ú2 × Ú4: Ú2 jen `world/skeleton/`, Ú4 jen `landscape/skeleton/`
a `premium/river.ts`.

---

### Úloha 1: Graf řek a výřez kostry (≈ 130 kroků)

**Files:**

- Create: `packages/game/src/domain/landscape/skeleton/types.ts`, `index.ts`;
  `packages/game/src/domain/world/skeleton/{rules-skeleton.ts,hash.ts,drainage.ts,ports.ts,slice.ts,index.ts}`;
  testy `world/skeleton/__tests__/{drainage,slice}.test.ts`.
- Modify: `packages/game/src/domain/world/index.ts`, `packages/game/src/domain/landscape/index.ts`
  (export typů), `eslint.config.mjs` (`DETERMINISTIC_LAYER_FILES` += obě složky `skeleton/**`).

**Interfaces:**

- Produces (`landscape/skeleton/types.ts`): `type MapSide = 'N' | 'E' | 'S' | 'W'`;
  `interface SkeletonRiverPort { readonly side: MapSide; readonly at: number; readonly widthM: number; readonly flow: 'in' | 'out' }`;
  `interface SkeletonTrailPort { readonly side: MapSide; readonly at: number }`;
  `interface SkeletonSlice { readonly world: 1; readonly rivers: readonly SkeletonRiverPort[]; readonly trails: readonly SkeletonTrailPort[] }`
  (porty seřazené N, E, S, W a podle `at`); `skeletonKey(slice: SkeletonSlice | null): string`
  (stabilní řetězec, `''` pro null).
- Produces (`world/skeleton/`): `SKELETON` (Global Constraints);
  `cellHash(seed: number, salt: number, x: number, y: number): number` (uint32, jen `Math.imul`,
  posuny, xor), `cellUnit(…): number` v [0, 1); `drainTarget(worldSeed: number, cell: GridCell): GridCell`;
  `upstreamSize(worldSeed: number, cell: GridCell, cache?: SkeletonCache): number` (≤ `upstreamCap`);
  `riverWidthM(upstream: number): number | null` (null pod `minUpstream`);
  `riverPortAt(worldSeed: number, a: GridCell, b: GridCell): number` (24–103, symetrické v a, b);
  `sideTowards(from: GridCell, to: GridCell): MapSide`;
  `createSkeletonCache(worldSeed: number): SkeletonCache`;
  `skeletonSlice(worldSeed: number, cell: GridCell, cache?: SkeletonCache): SkeletonSlice | null`
  (v této úloze jen řeky; null = bez řeky i stezky).

Odtok (spec – Řeky): sousedé `S = (x, y − 1)`, `E`, `W`; `v = cellUnit(seed, V, …)`;
sklon `b = 2·šum − 1`, šum = hodnotový šum mřížky `biasWavelength` (bilineárně se smoothstep,
jen + − × /); `pE = v(E) < v(c) ? lateralShare·(1 + b) : 0`, `pW = v(W) < v(c) ? lateralShare·(1 − b) : 0`,
`r = cellUnit(seed, D, …)`: `r < pE` → E, `r < pE + pW` → W, jinak S. Povodí = 1 + políčka
z {N, E, W}, která sem odtékají, rekurzivně (zásobník), stop na `upstreamCap`. Vtok řeky = soused
s `riverWidthM ≠ null`, který sem odtéká; výtok = odtok políčka s řekou; šířka portu = šířka
horního políčka hrany.

- [ ] **Krok 1:** testy `drainage.test.ts`: (a) z 1000 políček (seed 7) vede `drainTarget` vždy
      na jih, nebo v řádku k nižšímu `v` – sled 500 kroků se nevrátí na navštívené políčko;
      (b) `upstreamSize` ≤ 2000 a po proudu neklesá; (c) `riverWidthM`: 499 → null, 500 → 25,
      749 → 25, 750 → 30, 1999 → 40, 2000 → 45.
- [ ] **Krok 2:** testy `slice.test.ts`: (a) okno 64 × 64 (seed 7): pro každou hranu výtok řeky
      jednoho políčka = vtok druhého (protější strana, stejné `at` a `widthM`); (b) výřez spočítaný
      s čerstvou mezipamětí = výřez po dotazech na 4000 jiných políček v náhodném pořadí se sdílenou
      mezipamětí (`toEqual`); (c) `at` vždy 24–103; (d) výtok nejvýš jeden, vtoků nejvýš tři,
      `widthM` výtoku ≥ každého vtoku; (e) `skeletonSlice(8, cell, createSkeletonCache(7))` →
      `RangeError` (Review Focus 4); (f) podíl políček s řekou v okně 200 × 200 pro seedy 1–3 je
      8–14 %.
- [ ] **Krok 3:** pusť testy – padají (moduly chybí).
- [ ] **Krok 4:** implementace podle Interfaces; `deriveSeed(worldSeed, 'skeleton')` jako základ
      soli; mezipaměť = `Map` povodí podle `x,y` + seed.
- [ ] **Krok 5:** testy prochází; `npm run lint` (deterministická vrstva) bez chyb.
- [ ] **Krok 6:** `docs/code/world.md` – nová sekce „Kostra světa“ (soubory, funkce, odkaz na
      návrh); commit `feat(game): kostra světa – odvodnění a výřez řek`.

### Úloha 2: Síť stezek, místa kostry a zlatý otisk (≈ 110 kroků)

**Files:**

- Create: `world/skeleton/{trails.ts,sites.ts}`, testy `__tests__/{trails,sites,golden}.test.ts`.
- Modify: `world/skeleton/{ports.ts,slice.ts,index.ts}`.

**Interfaces:**

- Consumes: Ú1.
- Produces: `trailNode(worldSeed: number, block: GridCell): GridCell` (uvnitř bloku ≥ `nodeMargin`
  od kraje); `trailEdgeExists(worldSeed: number, block: GridCell, dir: 'E' | 'N'): boolean`;
  `trailSides(worldSeed: number, cell: GridCell): MapSide[]`;
  `trailPortAt(worldSeed: number, a: GridCell, b: GridCell, riverAt: number | null): number`
  (24–103, ≥ `trailGap` od `riverAt`); `riverCrossings(slice: SkeletonSlice): number`;
  `type SeatSlot = 'dry' | 'river' | 'ford' | 'trail'`; `seatSlot(slice: SkeletonSlice | null): SeatSlot | null`;
  `isDry(slice: SkeletonSlice | null): boolean`; `skeletonSlice` nově vyplní `trails`.

Tvar spojení (spec – Stezky): spojení na východ z uzlu A = řádek `yA` od `xA` ke sloupci
`m = (BX + 1)·block`, sloupec `m` od `yA` k `yB`, řádek `yB` k `xB`; na sever = sloupec `xA`
k řádku `r = (BY + 1)·block`, řádek `r` k `xC`, sloupec `xC` k `yC`. Políčko hledá spojení
v 3 × 3 blocích kolem. `riverCrossings`: obvod 0–511 (S od západu 0–127, E od jihu 128–255,
N od východu 256–383, W od severu 384–511), body řek ho dělí na oblouky; přechody = počet oblouků
s bodem stezky − 1 (0 bez řeky). `seatSlot`: null → `'dry'`; 1 vtok + 1 výtok bez stezky →
`'river'`; bez řeky a právě 2 body stezky → `'trail'`; 1 vtok + 1 výtok, 2 body stezky,
`riverCrossings === 1` → `'ford'`; jinak null.

- [ ] **Krok 1:** testy `trails.test.ts`: (a) v okně 120 × 120 (seed 7) má každé políčko stezky
      2 strany, kromě uzlů (1, 3 nebo 4); (b) body stezky na společné hraně se shodují u obou
      políček; (c) pro všechna `riverAt` 0–127 i null je `trailPortAt` v 24–103 a ≥ 16 od `riverAt`;
      (d) podíl políček se stezkou 6–11 % pro seedy 1–3.
- [ ] **Krok 2:** testy `sites.test.ts`: `riverCrossings` – řeka N→S a stezka W→E = 1; stezka
      W→N u řeky N→S se stezkou západně od řeky = 0; křižovatka 3 body přes řeku = 1;
      `seatSlot` všech pěti větví (včetně pramene → null a soutoku 2 vtoků → null).
- [ ] **Krok 3:** `golden.test.ts`: otisk (`deriveSeed` přes `skeletonKey` po řádcích) okna
      32 × 32 se středem (0, 0) pro seed `20270101`; komentář „po ostrém spuštění se nesmí změnit
      (world-skeleton.md – Uložení)“.
- [ ] **Krok 4:** pusť testy – padají; implementace; testy prochází (otisk zapsat po prvním běhu).
- [ ] **Krok 5:** `docs/code/world.md` – Kostra světa (stezky, místa, otisk); commit
      `feat(game): kostra světa – stezky a místa`.

### Úloha 3: Měření hustot a náhled `/dev/skeleton` (≈ 70 kroků)

**Files:**

- Create: `packages/game/scripts/measure-skeleton.ts`; `apps/web/app/dev/skeleton/page.tsx`
  (serverová komponenta, SVG).
- Modify: `docs/design/world-skeleton.md` (tabulka hustot – sloupec „změřeno“).

**Interfaces:** Consumes Ú1, Ú2 (`skeletonSlice`, `seatSlot`, `createSkeletonCache`).

- [ ] **Krok 1:** `measure-skeleton.ts [--size 200] [--seeds 1,2,3]` vypíše podíl map: řeka,
      stezka, řeka i stezka, brod (`seatSlot === 'ford'`), soutok řek, pramen, křižovatka, suchá
      a čas na výřez; a pro 1000 náhodných středů podíl, kdy je mezi políčky prstenců 3–4 aspoň
      jeden `'river'`, `'trail'`, `'ford'`.
- [ ] **Krok 2:** spusť (`npx tsx packages/game/scripts/measure-skeleton.ts`), výsledek do tabulky
      v návrhu; když je brod v prstencích pod 10 %, zapiš to do Otázek na Martina (ne měnit čísla
      bez něj).
- [ ] **Krok 3:** `/dev/skeleton?x=0&y=0&size=64` – mřížka políček, řeky modře (tloušťka podle
      `widthM`), stezky hnědě, uzly tečkou, suchá šedě, popisek políčka v `title`; jen ve vývoji
      jako ostatní `/dev/*` stránky.
- [ ] **Krok 4:** e2e smoke (stránka se načte, SVG má > 0 čar řek) v existujícím dev spec souboru;
      `test:e2e`; malý snímek pro Martina (vizuální kontrola).
- [ ] **Krok 5:** commit `feat(dev): měření a náhled kostry světa`.

### Úloha 4: Koryta řek z bodů na okraji (≈ 130 kroků)

**Files:**

- Create: `landscape/skeleton/{rules-map.ts,ports-map.ts,river-course.ts,rivers.ts}`,
  `__tests__/river-course.test.ts`.
- Modify: `landscape/premium/river.ts` (exporty `shapeChannel`, `carveRiver`, `chooseFords`,
  `placeFords`, `rasterize` použití; `shapeChannel` volitelný profil šířky), `landscape/types.ts`
  (`Terrain.rivers?`, `Landscape.rivers?: readonly (readonly StreamPoint[])[]`).

**Interfaces:**

- Consumes: Ú1 typy.
- Produces: `SKELETON_MAP = { junctionEdgeCells: 20, streamMouthPortCells: 20 }`;
  `portTile(side: MapSide, at: number, size: number): { x: number; y: number }` (ověř orientaci
  proti `cellWorld` v `premium/route.ts` – sever = +z);
  `interface RiverCoursePlan { readonly cells: readonly { x: number; y: number }[]; readonly fromWidthM: number; readonly toWidthM: number; readonly joins: number | null }`
  (`joins` = index hlavního toku, do kterého přítok ústí);
  `planRiverCourses(heights: Float32Array, size: number, slice: SkeletonSlice, random: Random): RiverCoursePlan[] | null`
  (hlavní tok od nejširšího vtoku – u pramene od bodu 40 políček od výtoku do mapy – k výtoku;
  ostatní vtoky k nejbližšímu bodu hlavního toku ≥ `junctionEdgeCells` od okraje; `cheapestPath`
  s cenou podle výšky a přirážkou u okraje jako `routeSideRiver`);
  `carveRiverCourses(terrain: Terrain, plans: readonly RiverCoursePlan[], seed: number, options: { floodplainCells: number }): Terrain`
  (vrací terén s `rivers`, vodou a údolím; šířka podél toku lineárně `fromWidthM` → `toWidthM`);
  `riversOf(l: { river?: readonly StreamPoint[]; rivers?: readonly (readonly StreamPoint[])[] }): readonly (readonly StreamPoint[])[]`.

- [ ] **Krok 1:** testy na umělém terénu (rovina klesající k jihu + šum `createRandom(3)`), výřezy
      rovně (N 60 → S 70), ohyb (W 40 → S 90), soutok (N 50 + E 64 → S 80), pramen (S 64):
      (a) první políčko každého toku do 1 políčka od `portTile` vtoku, konec hlavního do 1 od výtoku;
      (b) konec přítoku leží na hlavním toku; (c) šířka vody v bodě okraje = `widthM` ± 15 m (1 políčko);
      (d) hladina po proudu neroste; (e) tok se sám nedotkne (`selfTouching` false).
- [ ] **Krok 2:** pusť – padají; implementace; testy prochází.
- [ ] **Krok 3:** `premium/__tests__` (zlaté otisky prémie 1) beze změny.
- [ ] **Krok 4:** `docs/code/landscape.md` – nová sekce „Kostra světa na mapě“ (koryta); commit
      `feat(game): koryta řek z bodů kostry`.

### Úloha 5: Terén mapy s řekou, generátor a pásmo (≈ 140 kroků)

**Files:**

- Create: `landscape/skeleton/terrain.ts`, `__tests__/{terrain,golden}.test.ts`,
  `__tests__/skeleton-band.ts` (jako `type-band.ts`).
- Modify: `landscape/terrain.ts` (exporty `baseHeights`, `relaxSlopes`; `routeStream(…, goal?)`;
  `chooseVillageSite(…, allowed?)` – bez nich bit po bitu), `landscape/types.ts`
  (`LayerVersions.skeleton?: 1`, `SKELETON_LAYER_VERSION = 1`, `Landscape.skeleton?: SkeletonSlice`),
  `landscape/generate.ts`, `landscape/band.ts`, `packages/game/scripts/measure-landscapes.ts`.

**Interfaces:**

- Consumes: Ú4.
- Produces: `generateSkeletonTerrain(seed: number, version: 1 | 2, slice: SkeletonSlice, options?: SkeletonTerrainOptions): Terrain`,
  `interface SkeletonTerrainOptions { readonly floodplainCells?: number }` (výchozí
  `RIVER.floodplainCells`); čtvrtý parametr `skeleton?: SkeletonSlice | null` u
  `generateAcceptedLandscape`, `generateLandscape`, `generateLandscapeAttempt`; `KNOWN_VERSIONS.skeleton = [1]`;
  `riverCorridorMask(l: Landscape): Uint8Array`; `measure-landscapes … --skeleton straight|corner|junction|source|trail|ford`.

Pořadí (spec – Mapa z kostry): výšky + sesypání → `planRiverCourses` + `carveRiverCourses` →
potok `routeStream` od okraje (start ≥ `streamMouthPortCells` od bodů řeky) s cílem břeh řeky
(u pramene = začátek hlavního toku) → `chooseVillageSite` s podmínkou ≥ `RIVER.villageMinCells`
od os řek → `carveStream`, skály u potoka (verze 2) → normalizace výšek. Výřez jen se stezkou:
`averageTerrain` beze změny, krajina jen nese `skeleton`. `checkBand`: na krajině s `rivers`
počítá podíl lesa a úrodná políčka celé mapy bez `riverCorridorMask` (voda řeky + niva).

- [ ] **Krok 1:** testy `terrain.test.ts`: (a) `generateLandscapeAttempt(s, CURRENT, undefined, null)`
      `toEqual` volání se třemi parametry pro seedy 1–5; (b) výřez se stezkou: `heights` shodné se
      suchou krajinou, `l.skeleton` nastavený; (c) výřez s řekou: potok končí do 2 políček od toku
      řeky a jen jeho první bod leží na okraji; ves ≥ 20 políček od každého bodu `rivers`;
      (d) `versions.skeleton` bez výřezu i výřez bez `versions.skeleton` → `RangeError`.
- [ ] **Krok 2:** `skeleton-band.ts`: 300 seedů × {rovně, ohyb, soutok, pramen} → ≥ 95 % přijato
      do `MAX_ATTEMPTS`; zařadit do `generate.test.ts` jako `type-band.ts`.
- [ ] **Krok 3:** pusť – padají; implementace; testy prochází, dosavadní zlaté otisky beze změny.
- [ ] **Krok 4:** `golden.test.ts`: otisk 4 výřezů × 2 seedy (výšky, povrch, úrodnost, `rivers`).
- [ ] **Krok 5:** `measure-landscapes 30 --skeleton …` pro všechny výřezy – tabulka (1. pokus,
      ms / pokus, louka do 600 m, úrodná) do `docs/design/world-skeleton.md` (nová podsekce
      „Výsledky měření generátoru“).
- [ ] **Krok 6:** `docs/code/landscape.md` – Kostra světa na mapě (terén, verze, pásmo); commit
      `feat(game): terén mapy s řekou kostry`.

### Úloha 6: Stezka kostry na mapě a kontrola kostry (≈ 120 kroků)

**Files:**

- Create: `landscape/skeleton/{route.ts,features.ts,check.ts}`, `__tests__/route.test.ts`.
- Modify: `landscape/band.ts` (`checkSkeleton` u krajiny s `skeleton`, selhání `skeleton-<důvod>`),
  `landscape/premium/route.ts` (jen nové exporty, je-li třeba).

**Interfaces:**

- Consumes: Ú5 (`Landscape.skeleton`, `riversOf`), `routeLeg`, `villageBypass`, `trailCellCost`,
  `smoothLine`, `lineKeepsAway` z `premium/route.ts`.
- Produces: `interface SkeletonRoute { readonly legs: readonly (readonly WorldPoint[])[]; readonly ends: readonly { readonly side: MapSide; readonly point: WorldPoint }[]; readonly fords: readonly WorldPoint[] }`;
  `skeletonRoute(l: Landscape): SkeletonRoute | null`;
  `skeletonFeaturesOf(l: Landscape): SkeletonFeatures | null` (mezipaměť `WeakMap` jako
  `premiumFeaturesOf`), `interface SkeletonFeatures { readonly route: SkeletonRoute | null; readonly crossroads: boolean; readonly trailEnd: boolean }`;
  `checkSkeleton(l: Landscape): 'river' | 'route' | 'village' | null`.

Trasa (spec – Mapa z kostry): každý bod stezky → obejití vsi (`villageBypass`, nejblíž 150 m) →
další bod; přes řeku jen brodem (u `riverCrossings` 1 je cesta přes nejbližší mělký úsek k přímce
mezi body, jinak zůstane na břehu); křižovatka = větve z bodu obejití; konec stezky = jedna větev
k obejití.

- [ ] **Krok 1:** testy na krajině z `generateLandscapeAttempt(seed, verze, undefined, výřez)`:
      (a) stezka W→E: konce do 15 m od `portTile` obou bodů, `lineKeepsAway` 150 m od vsi, nejbližší
      bod ≤ 450 m od vsi; (b) křižovatka 3 body → 3 větve, `crossroads`; (c) konec stezky → 1 větev
      končící ≤ 200 m od vsi; (d) brod (řeka N→S, stezka W→E) → trasa přejde řeku právě jednou
      u mělkého vzorku, `fords.length === 1`; (e) stezka i řeka bez přechodu → žádný bod trasy ve
      vodě; (f) `checkSkeleton` vrací null na všech výřezech testu pásma.
- [ ] **Krok 2:** pusť – padají; implementace; testy i `skeleton-band.ts` (s `checkSkeleton`)
      prochází, ≥ 95 %.
- [ ] **Krok 3:** `docs/code/landscape.md` – Kostra světa na mapě (stezka, kontrola); commit
      `feat(game): stezka kostry na mapě`.

### Úloha 7: Víc řek v krajině – spotřebitelé a přenos (≈ 100 kroků)

**Files:**

- Modify: `landscape/stream-geometry.ts` (`riverCenterline`, `watersCenterline`, `nearestWaterPair`
  přes `riversOf`), `landscape/quantize.ts`, `village/wildlife-land.ts`, `war/march-grid.ts`,
  `apps/web/lib/landscape-transfer.ts` (`LandscapeTransfer.rivers`, břehy po tocích, `skeleton`).
- Test: `apps/web/lib/__tests__/landscape-transfer.test.ts`, testy `stream-geometry`, `march-grid`.

**Interfaces:** Consumes Ú5, Ú6. Krajina jen s `river` (prémie 1) = výstup bit po bitu.

- [ ] **Krok 1:** testy: (a) přenos krajiny se soutokem řek (výřez z Ú4) → prohlížeč dostane bit po
      bitu vrstvu překážek i `skeletonFeaturesOf(…).route` jako server; (b) `watersCenterline` na
      soutoku vrací nejbližší bod obou toků; (c) `marchGrid` na mapě s řekou: řeka neprůchodná mimo
      brody; (d) otisky překážek a prémie 1 beze změny.
- [ ] **Krok 2:** pusť – padají; implementace; testy prochází.
- [ ] **Krok 3:** `docs/code/landscape.md` (osa vod, přenos), `docs/code/war.md` (pochod přes
      řeku); commit `feat(game): víc řek na mapě – osa vod, přenos, pochod`.

### Úloha 8: Scéna a `/dev/landscape` s kostrou (≈ 110 kroků)

**Files:**

- Modify: `apps/web/lib/scene/{render-surface.ts,stream-geometry.ts,landscape-scene.ts,ambient-mix.ts,fauna-placement.ts}`
  (smyčka přes toky, ústí potoka do řeky), `apps/web/app/dev/landscape/page.tsx` a ovládání
  (`?skeleton=straight|corner|junction|source|trail|ford|crossroads`, čára `skeletonRoute`).

**Interfaces:** Consumes Ú7 (`LandscapeTransfer.rivers`, `riversOf`, `skeletonFeaturesOf`). Babylon
jen z konkrétních modulů; kreslí se jen při změně.

- [ ] **Krok 1:** e2e v existujícím spec `/dev/landscape`: každý výřez se načte bez chyby konzole;
      snímek soutoku řek a brodu (malé) pro Martina.
- [ ] **Krok 2:** implementace; `test:e2e`.
- [ ] **Krok 3:** `docs/code/scene.md` – voda víc řek; commit `feat(web): scéna řek kostry`.

### Úloha 9: Výřez u sídla, krajina políčka a vsi synů (≈ 120 kroků)

> **Změna 8. 11. 2026 (Martin – otázka 3 návrhu):** „NPC budou mít normální mapy. Prémiové jen lidští
> hráči.“ Ves syna (NPC vojvody) se umisťuje **jen na mapu bez kostry** – nejbližší suchou, stejně
> jako odříznutý nováček; výřez s řekou nebo stezkou nedostane. Kroky níž, které počítají s výřezem
> u vsi syna, uprav podle toho (a totéž v Úloze 14).

**Files:**

- Modify: `packages/db/src/schema/settlement.ts` (`skeleton: jsonb('skeleton').$type<SkeletonSlice | null>()`),
  nová migrace `npm run db:generate` (`packages/db/drizzle/0040_…sql`),
  `packages/db/src/adapters/settlement-repository.ts`, `packages/game/src/application/settlements.ts`
  (`Settlement.skeleton: SkeletonSlice | null`, `NewSettlement.skeleton?`, `LandscapeSource.landscapeOf(seed, versions, premium?, skeleton?)`),
  `application/enter-game.ts` (`settlementLandscape` předá výřez), `application/cell-landscape.ts`,
  `application/new-village.ts` (`targetSettlement`), `packages/server/src/landscape-cache.ts`
  (klíč + `skeletonKey`), volající `settledCellLandscape` (`campaign-view.ts` a další – `grep -rn`).
- Test: `packages/db/src/adapters/__tests__/settlement-repository.db.test.ts`,
  `packages/server/src/__tests__/landscape-cache.test.ts`, `application/__tests__` (new-village,
  cell-landscape).

**Interfaces:**

- Consumes: Ú1–Ú2 (`skeletonSlice`), Ú5 (čtvrtý parametr).
- Produces: `emptyCellLandscape(worldSeed: number, cell: GridCell, versions?: LayerVersions, cache?: SkeletonCache): CellLandscape`
  (výřez z kostry; s řekou/stezkou verze `{ …CURRENT_LAYER_VERSIONS, skeleton: 1 }`);
  `settledCellLandscape(seed, versions, premium?, skeleton?)`; `cellSkeletonVersions(slice): LayerVersions`.

- [ ] **Krok 1:** testy: (a) db – sídlo s výřezem se uloží a načte `toEqual`, bez výřezu `null`;
      (b) mezipaměť krajin: stejný seed a verze, jiný výřez → jiné objekty krajiny (Review Focus 1);
      (c) `targetSettlement` na políčku s řekou uloží výřez a `skeleton: 1`, v odříznuté mřížce
      `null` bez `skeleton`; (d) sídlo s `skeleton` null a verzemi bez `skeleton` → krajina
      `toEqual` dnešní a `emptyCellLandscape` souseda s řekou má `rivers` (Review Focus 5).
- [ ] **Krok 2:** pusť – padají; implementace a migrace (jen soubor; `bohemia` nemigrovat);
      `test`, `test:db` prochází.
- [ ] **Krok 3:** `docs/code/landscape.md` (uložený výřez), `docs/code/world.md`; commit
      `feat(db): výřez kostry u sídla`.

### Úloha 10: Prémie na kostře – řeka (`premium: 2`) (≈ 130 kroků)

**Files:**

- Modify: `landscape/premium/{generate.ts,types.ts,water.ts,river.ts,check.ts}`, `landscape/generate.ts`
  (průchod dostane výřez), `landscape/types.ts` (`premium?: 1 | 2`).
- Test: `premium/__tests__/skeleton-river-types.test.ts` (+ pásmo po typech).

**Interfaces:**

- Consumes: Ú5, Ú6 (`skeletonFeaturesOf`).
- Produces: `PREMIUM_LAYER_VERSION = 2`; `PremiumPassContext.skeleton: SkeletonSlice | null`;
  `PremiumPass.skeletonTerrainOptions?: SkeletonTerrainOptions` (splavná: `{ floodplainCells: NAVIGABLE_FLOODPLAIN_CELLS }`);
  `SKELETON_PREMIUM_SLOTS: Partial<Record<PremiumType, SeatSlot>>` – `navigable-river`
  a `confluence` → `'river'`, `ford-hill` → `'ford'`, `mountain-pass` → `'trail'`.

Splavná řeka: terén znovu přes `generateSkeletonTerrain` s širší nivou, přístaviště `portSite`
na řece kostry. Soutok: ostrožna (`SPUR`, `CONFLUENCE.heightM`) mezi řekou a potokem nad ústím
potoka. S `premium: 1` beze změny (náhodný vstup a výstup); typ kostry s `premium: 2` bez
odpovídajícího `seatSlot(výřez)` → `RangeError`.

- [ ] **Krok 1:** testy: (a) splavná na výřezu „rovně“ – niva 4 políčka na straně vsi, prvek
      přístaviště, `rivers` končí v bodech výřezu; (b) soutok – ostrožna mezi řekou a potokem,
      ≥ 120 m od vsi; (c) pásmo po typech 300 seedů ≥ 95 %; (d) zlaté otisky `premium: 1` beze změny;
      (e) `ford-hill` s výřezem bez brodu → `RangeError`.
- [ ] **Krok 2:** pusť – padají; implementace; testy prochází.
- [ ] **Krok 3:** `docs/code/landscape.md` (Prémiové krajiny – premium 2); commit
      `feat(game): prémie řeky na kostře`.

### Úloha 11: Prémie na kostře – brod a průsmyk (≈ 130 kroků)

**Files:**

- Modify: `landscape/premium/{water.ts,river.ts,relief.ts,check.ts}`.
- Test: `premium/__tests__/skeleton-trail-types.test.ts`.

**Interfaces:** Consumes Ú6 (`skeletonRoute` – brod stezky), Ú10 (`premium: 2`, kontext s výřezem).

Vyvýšenina nad brodem: `planFordHill` s pevným brodem = brod trasy kostry, ostrožna 16–20 m
(`FORD_HILL`). Průsmyk: `passPlan` s hřebenem napříč stezkou u okraje, kterým stezka vstupuje
(strana bodu dál od vsi), sedlo na trase, hřbety ≥ 60 m nad sedlem; trasa jde přes sedlo (prvek
`route` = `skeletonRoute`, ne vlastní stezka).

- [ ] **Krok 1:** testy: (a) brod – ostrožna u brodu trasy, výška ≥ 15 m nad hladinou brodu;
      (b) průsmyk – sedlo do 2 políček od trasy kostry, oba hřbety ≥ 60 m nad sedlem, konce trasy
      v bodech výřezu; (c) pásmo po typech ≥ 95 %; (d) otisky `premium: 1` beze změny.
- [ ] **Krok 2:** pusť – padají; implementace; testy prochází.
- [ ] **Krok 3:** `docs/code/landscape.md`; commit `feat(game): brod a průsmyk na kostře`.

### Úloha 12: Místo a typ sídla – doména (≈ 90 kroků)

**Files:**

- Create: `packages/game/src/domain/world/seat-placement.ts`, `__tests__/seat-placement.test.ts`.
- Modify: `world/placement.ts` (`placeCluster(occupied, cluster, request, cellOk?)`),
  `landscape/premium/assign.ts` (`choosePremiumType(seed, counts, allowed?)`), `world/index.ts`.

**Interfaces:**

- Consumes: Ú2 (`SeatSlot`), Ú10 (`SKELETON_PREMIUM_SLOTS` – do jeho sloučení stejná mapa jako
  lokální konstanta v testu).
- Produces: `SLOT_TYPES: Readonly<Record<SeatSlot, readonly PremiumType[]>>` (`'dry'` = 15 typů bez
  kostry); `interface SeatPlacementInput { readonly occupied: readonly OccupiedCell[]; readonly request: PlacementRequest; readonly slotOf: (cell: GridCell) => SeatSlot | null; readonly counts: Partial<Record<PremiumType, number>>; readonly seed: number; readonly owned?: PremiumType | null; readonly exclude?: readonly GridCell[] }`;
  `placeSeat(input: SeatPlacementInput): { cell: GridCell; type: PremiumType }`;
  `placeCluster(…, cellOk: (cell: GridCell) => boolean = () => true)`.

`placeSeat` (spec – Hustota): R0 = první prstenec s volným políčkem (odstup podle žádosti);
kandidáti = volná políčka R0 … R0 + `SKELETON.seat.slackRings` mimo `exclude` se `slotOf ≠ null`
(žádný → další prstenec); typy = sjednocení `SLOT_TYPES` kandidátů; `owned` v nich → ten, jinak
`choosePremiumType(seed, counts, typy)`; políčko = první kandidát v pořadí prstenců a cílů s typem.

- [ ] **Krok 1:** testy: (a) prázdný svět, `slotOf` vše `'dry'` → (0, 0) a nejméně zastoupený typ
      bez kostry; (b) R0 má jen suchá, R0 + 1 brod a `ford-hill` má počet 0 → brod na R0 + 1;
      (c) `owned = 'mountain-pass'` a stezka v dosahu → průsmyk; bez stezky → nejméně zastoupený
      z nabízených; (d) `exclude` vyřadí políčko; (e) `placeCluster` s `cellOk` – pán obklopený
      kostrou do poloměru 3 → shluk na poloměru ≥ 4, bez výjimky (Review Focus 3);
      (f) `choosePremiumType` bez `allowed` = dnešní výsledek pro seedy 0–50.
- [ ] **Krok 2:** pusť – padají; implementace; testy prochází.
- [ ] **Krok 3:** `docs/code/world.md` (Mřížka a umístění); commit `feat(game): místo sídla podle kostry`.

### Úloha 13: Umístění v aplikaci – pozvaný, svobodný, odříznutý (≈ 130 kroků)

**Files:**

- Modify: `application/enter-game.ts` (pozvaný: `placeSeat`; odříznutý: typ z `SLOT_TYPES.dry`,
  výřez null; `PREMIUM_LAYER_VERSIONS` s `premium: 2` a `skeleton: 1` u výřezu; kandidát, jehož typ
  neprojde `BandFailureError` ve všech oknech → `exclude` a znovu), `application/newcomers.ts`
  (`placeNewcomer`: `cellOk = isDry(skeletonSlice(…))`; `startFree` bez vsi → přesídlení),
  `application/settlements.ts` + `packages/db/src/adapters/{settlement-repository.ts,newcomer-placement.ts}`
  (`lastPremiumType(playerId)` jen ze sídel s vsí nebo archivovaných; nová metoda
  `PlacementTx.reseatIsolated(playerId: string, seat: { worldCell: WorldCell; landscapeSeed: number; layerVersions: LayerVersions; premiumType: PremiumType; skeleton: SkeletonSlice | null }): Promise<boolean>`
  – podmíněně „sídlo odříznuté a bez vsi“, jinak false a pokračuje dnešní přesun).
- Test: `application/__tests__/{enter-game,newcomers}.test.ts`, `newcomer-placement.db.test.ts`,
  `e2e/newcomers.spec.ts`.

**Interfaces:** Consumes Ú9, Ú10, Ú12. Produces `seatOnWorld(deps, request, generate)` (pomocná
funkce aplikace: `placeSeat` + generování s opakováním přes `exclude`; `generate` jako parametr –
test podstrčí selhání).

- [ ] **Krok 1:** testy: (a) pozvaný u pána → sídlo s typem podle `seatSlot` políčka a s jeho
      výřezem; (b) `seatOnWorld` s `generate`, který na prvním kandidátovi vyhodí `BandFailureError`
      → sídlo na dalším kandidátovi (Review Focus 2); (c) odříznutý → typ bez kostry, výřez null;
      (d) svobodný bez vsi → sídlo na políčku u jazykové skupiny s krajinou z políčka, typ podle
      místa; (e) svobodný s vsí → shluk jen na suchá políčka; (f) db – souběh dvou `reseatIsolated`
      na stejné políčko: jeden uspěje, druhý zkusí znovu (`PLACEMENT_ATTEMPTS`).
- [ ] **Krok 2:** pusť – padají; implementace; `test`, `test:db`, `test:e2e` (newcomers) prochází.
- [ ] **Krok 3:** `docs/code/world.md` (Vstup nováčka), `docs/code/landscape.md` (Přidělení typu);
      commit `feat(game): umístění sídla podle kostry`.

### Úloha 14: Hotová stezka kostry ve vsi (≈ 80 kroků)

**Files:**

- Modify: `packages/game/src/domain/village/premium-route.ts` (→ `withSkeletonRoute`; prémie 1
  dál ze site `route`), `village/founding.ts` (`foundedState`), `village/index.ts`.
- Test: `village/__tests__/premium-route.test.ts` (rozšířit).

**Interfaces:** Consumes Ú6 (`skeletonFeaturesOf(l).route`), Ú9 (ves syna s výřezem). Produces
`withSkeletonRoute(state: VillageState, landscape: Landscape, day: number): VillageState` – větve
trasy jako upravené cesty (`addTrailRoads`, `upgradePieces`, `cutRoadSwath`) a hotová stezka
(`Trail.builtDay = day`) ve směru strany každého konce (`N/E/S/W` z `DIRECTION_VECTORS`).

- [ ] **Krok 1:** testy: (a) průměrná mapa se stezkou W→E → při založení hotové stezky W a E,
      cesty bez klád z průseku; (b) křižovatka → 3 směry; (c) konec stezky → 1 směr; (d) suchá mapa
      → stav `toEqual` dnešní; zlaté otisky vsí beze změny; (e) prémie 1 (brod s `route`) beze změny.
- [ ] **Krok 2:** pusť – padají; implementace; testy prochází.
- [ ] **Krok 3:** `docs/code/village-trade.md` (Stezka kostry – každá mapa); commit
      `feat(game): hotová stezka kostry ve vsi`.

### Úloha 15: Závěr – měření, kontrola vývojové DB, dokumentace (≈ 80 kroků)

**Files:**

- Create: `packages/server/scripts/skeleton-check.ts` (jen čte: sídla s `grid_*`, jejichž
  `skeleton` se liší od `skeletonSlice(worldSeed, cell)`; výpis id, políčko, rozdíl).
- Modify: `docs/design/world-skeleton.md` (výsledky měření, Rozhodnutí), `docs/code/{landscape,world}.md`,
  `CLAUDE.md` (řádek „Krajina a deterministická vrstva“: graf kostry se po spuštění nemění;
  tabulka Mapa kódu – world.md „kostra světa“), `package.json` (skript `skeleton-check`).

- [ ] **Krok 1:** `measure-skeleton` a `measure-landscapes --skeleton` znovu, čísla do návrhu.
- [ ] **Krok 2:** `npm run skeleton-check` proti `bohemia` (jen čtení) – výsledek do zprávy pro
      Martina (vývojová sídla na kostře).
- [ ] **Krok 3:** `typecheck`, `lint`, `test`, `test:db`, `test:e2e`, `format:check`.
- [ ] **Krok 4:** commit `docs: kostra světa – závěr a kontrola`.

## Rizika

- **Pásmo map s řekou** (Ú5): řeka první mění okolí vsi; když přijetí do 16 pokusů klesne pod
  95 %, nejdřív ladit cenu trasy řeky a podmínku vsi, pak `SKELETON_MAP` – meze pásma okolí vsi
  ne (stejné podmínky).
- **Čas generování** (Ú5, Ú13): `placeSeat` může zkusit víc kandidátů; výřez je levný (< 1 ms),
  krajina s řekou ≈ 2× suchá – měřit v Ú5, při potřebě omezit počet kandidátů s generováním.
- **Orientace stran** (Ú4): chyba v `portTile` (sever = +z) by řeky „zrcadlila“ jen na jedné
  straně švu – test sousedů na úrovni světa (Ú1) ji nechytí; `/dev/skeleton` + `/dev/landscape`
  dvou sousedních políček v Ú8 ano (vizuální kontrola).

## Otázky na Martina

Otevřené otázky 1–3 v [world-skeleton.md](../../design/world-skeleton.md): směr řek (k jihu,
bez jezer), hustota kostry, kostra i na mapách synů a NPC.
