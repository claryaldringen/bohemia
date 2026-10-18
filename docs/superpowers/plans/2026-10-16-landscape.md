# Krajina sídla – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Po prvním vstupu na `/game` hráč dostane vlastní sídlo s vygenerovanou krajinou (voda, les, louky, úrodnost) a uvidí ji ve 3D v Babylon.js s kamerou ve stylu AoE2 a infem o políčku pod kurzorem.

**Architecture:** Hexagonálně podle `CLAUDE.md`. Doména (`packages/game/src/domain/landscape/`) generuje krajinu po vrstvách jako čisté deterministické funkce ze seedu. Use-case `enterGame` (`packages/game/src/application/`) přes porty najde nebo atomicky založí sídelní sídlo. Drizzle adaptér je v `packages/db`. Web je composition root: server stránky zavolá use-case, krajinu zakóduje a klientská komponenta ji předá Babylon scéně, což je obyčejná TS třída bez Reactu.

**Tech Stack:** TypeScript 6, Next.js 16, React 19.3, `@babylonjs/core` + `@babylonjs/loaders` 9.31 (WebGPU se záložním WebGL 2), `simplex-noise` 4.0.3, Drizzle + PostgreSQL, Vitest, Playwright.

**Spec:** `docs/design/landscape.md` (schváleno 16. 10. 2026). Kontext: `CLAUDE.md`, `docs/design/vision.md`.

## Global Constraints

- Krajina **128 × 128 políček**, políčko **15 m**; index políčka `y * size + x`.
- Povrchy přesně `water`, `forest`, `meadow`; úrodnost celé číslo 0–100; výška v metrech nad nejnižším políčkem krajiny.
- Pásmo srovnatelnosti: voda od okraje k okraji · les **55–70 %** · místo pro vesnici = souvislá rovinatá **louka** s úrodností **≥ 60**, **400–1 200 políček**, celá do **300 m (20 políček)** od vody · převýšení **≤ 40 m** (a ≥ 10 m – „mírně zvlněná“) · celkový počet políček s úrodností ≥ 60 v pásmu změřeném v Task 4.
- Verze vrstev `{ terrain: 1, vegetation: 1, fertility: 1 }`, ukládají se u sídla.
- V `packages/game` žádné `Date.now()`, `new Date()` bez argumentu, `Math.random()`, ani importy infrastruktury (hlídá ESLint). `simplex-noise` je povolený.
- Babylon importovat **z konkrétních modulů** (`@babylonjs/core/Engines/engine`, …), nikdy z barrelu `@babylonjs/core`. Loader glTF jako side-effect import `@babylonjs/loaders/glTF`. Žádný `react-babylonjs`, žádné Babylon GUI, žádné compute shadery.
- Babylon se smí dostat jen do JS herní plochy `/game`, ne do úvodní stránky ani přihlášení.
- Modely jen s licencí **CC0** v `apps/web/public/models/nature/`, licence a zdroj v `apps/web/public/models/LICENSES.md`.
- Texty UI česky, typografie „–“ s mezerami. Commity česky (Conventional Commits) a s řádkem `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Před každým commitem musí projít `npm run typecheck`, `npm run lint`, `npm run test` a `npm run format:check`.

## Review Focus

1. **Prohlížeč bez WebGPU** (Firefox na Macu a Linuxu, headless Chromium): scéna musí naběhnout na WebGL 2. Pokrývá e2e test s `?renderer=webgl` v Task 8.
2. **Odhlášení nebo odchod ze stránky, zatímco se scéna ještě načítá:** žádná chyba v konzoli a uvolněný engine. Pokrývá e2e „okamžité odhlášení“ v Task 8 a test `dispose` během `create` v Task 7.
3. **Modely stromů se nenačtou** (404, výpadek sítě): krajina se zobrazí bez stromů a stránka nespadne. Pokrývá e2e s `page.route('**/models/**', abort)` v Task 9.
4. **Kurzor mimo krajinu nebo mimo plátno:** info o políčku zmizí a nezůstane viset staré. Pokrývá unit test `tileAt` mimo mřížku v Task 7 a e2e `mouse.move` na okraj v Task 8.
5. **Babylon v balíčku úvodní stránky nebo přihlášení** (pomalé první načtení): pokrývá e2e, který stáhne skripty `/login` a ověří, že žádný neobsahuje `Babylon.js v`, v Task 8.

---

### Task 1: Deterministická náhoda a odvozené seedy

**Files:**

- Create: `packages/game/src/domain/landscape/random.ts`
- Test: `packages/game/src/domain/landscape/__tests__/random.test.ts`
- Modify: `packages/game/package.json` (dependency `simplex-noise@^4.0.3`)

**Interfaces:**

- Produces:
  - `interface Random { next(): number }`, kde `next()` vrací číslo v [0, 1),
  - `createRandom(seed: number): Random` (sfc32 nebo mulberry32),
  - `deriveSeed(seed: number, label: string): number` (uint32; hash seedu a štítku, např. FNV-1a + míchání).

- [ ] **Step 1: Write the failing tests** – `stejný seed dává stejnou posloupnost` (prvních 5 hodnot dvou instancí `toEqual`); `hodnoty leží v [0, 1)` (10 000 vzorků); `průměr 10 000 vzorků je mezi 0,48 a 0,52`; `jiný seed dává jinou posloupnost`; `deriveSeed je deterministický a pro různé štítky dává různé seedy` (`deriveSeed(42,'terrain') !== deriveSeed(42,'vegetation')`, výsledek je celé číslo 0 … 2^32 − 1).
- [ ] **Step 2:** `npm run test -w @bohemia/game` → FAIL (modul neexistuje).
- [ ] **Step 3:** Implement `random.ts`, nainstalovat `simplex-noise` do `@bohemia/game`.
- [ ] **Step 4:** `npm run test -w @bohemia/game` → PASS; `npm run lint` → bez chyb.
- [ ] **Step 5: Commit** `feat(game): deterministická náhoda pro generování krajiny`

### Task 2: Typy krajiny a vrstva terénu (výšky, potok, místo pro vesnici)

**Files:**

- Create: `packages/game/src/domain/landscape/types.ts`, `terrain.ts`
- Test: `packages/game/src/domain/landscape/__tests__/terrain.test.ts`, `__tests__/landscape-checks.ts` (nezávislé pomocné kontroly pro testy)

**Interfaces:**

- Consumes: `createRandom`, `deriveSeed` (Task 1).
- Produces (`types.ts`):
  ```ts
  export const LANDSCAPE_SIZE = 128;
  export const CELL_SIZE_M = 15;
  export type Surface = 'water' | 'forest' | 'meadow';
  export const SURFACE_CODES = { water: 0, forest: 1, meadow: 2 } as const;
  export interface LayerVersions {
    terrain: 1;
    vegetation: 1;
    fertility: 1;
  }
  export const CURRENT_LAYER_VERSIONS: LayerVersions;
  export interface Landscape {
    readonly size: number;
    readonly cellSizeM: number;
    readonly heights: Float32Array; // m nad nejnižším políčkem
    readonly surface: Uint8Array; // SURFACE_CODES
    readonly fertility: Uint8Array; // 0–100
    readonly villageSite: { x: number; y: number }; // střed místa pro vesnici
  }
  export function surfaceAt(l: Landscape, x: number, y: number): Surface;
  ```
- Produces (`terrain.ts`):
  - `interface Terrain { size: number; heights: Float32Array; water: Uint8Array /* 1 = voda */; villageSite: { x: number; y: number } }`,
  - `generateTerrain(seed: number, version: 1): Terrain`.
- `landscape-checks.ts` (jen pro testy, nezávisle na kódu domény):
  - `waterTouchesOppositeEdges(water: Uint8Array, size: number): boolean` (8-souvislá komponenta vody, která se dotýká dvou protilehlých okrajů),
  - `reliefM(heights)`,
  - `maxNeighbourStepM(heights, size, x, y)`.

Algoritmus terénu, protože ho signatura neurčuje:

1. fBm ze `simplex-noise` (`createNoise2D(random.next)`), 4–5 oktáv, škálované na převýšení 10–40 m.
2. Zvolit místo pro vesnici (střed v 25–75 % mapy) a kolem něj terén cíleně vyrovnat (plynulý přechod, poloměr ≈ 15 políček).
3. Potok: cesta nejmenšího odporu (Dijkstra/A* přes výšky) mezi dvěma body na protilehlých okrajích, vedená tak, aby prošla do 20 políček od místa pro vesnici, ale ne jím. Koryto zahloubit o 0,5–1,5 m a šířka 1–3 políčka.
4. Volitelný rybník v prohlubni.
5. Výšky posunout tak, aby minimum bylo 0.

- [ ] **Step 1: Write the failing tests:**
  - `stejný seed → shodné výšky, voda i místo` (`toEqual`),
  - `jiný seed → jiné výšky`,
  - `převýšení je mezi 10 a 40 m` (50 seedů),
  - `potok spojuje protilehlé okraje` (50 seedů, `waterTouchesOppositeEdges`),
  - `nejnižší políčko má výšku 0`,
  - `žádné útesy: sousední políčka se liší nejvýš o 3 m` (50 seedů).
- [ ] **Step 2:** `npm run test -w @bohemia/game` → FAIL.
- [ ] **Step 3:** Implement `types.ts` and `terrain.ts`.
- [ ] **Step 4:** `npm run test -w @bohemia/game` → PASS.
- [ ] **Step 5: Commit** `feat(game): terén krajiny s potokem a místem pro vesnici`

### Task 3: Vrstva vegetace

**Files:**

- Create: `packages/game/src/domain/landscape/vegetation.ts`
- Test: `packages/game/src/domain/landscape/__tests__/vegetation.test.ts`, doplnit `landscape-checks.ts`

**Interfaces:**

- Consumes: `Terrain`, `generateTerrain` (Task 2), `SURFACE_CODES`.
- Produces: `generateVegetation(seed: number, terrain: Terrain, version: 1): Uint8Array` (kódy povrchu; voda z terénu → `water`).
- `landscape-checks.ts`: `share(surface, code): number`, `largestComponentSize(mask: Uint8Array, size: number): number`.

Pravidla:

- Les se rozmístí prahováním vlastního šumu tak, aby tvořil 55–70 % neúrodných i úrodných ploch dohromady (práh dopočítat z kvantilu, ne pokusem).
- Louky jsou v nivě kolem potoka a na rovinách.
- Okolí `villageSite` je vždy louka (mýtina).
- Les tvoří souvislé celky, takže se ostrůvky menší než 4 políčka sloučí s okolím.

- [ ] **Step 1: Write the failing tests:**
  - `podíl lesa je 55–70 %` (100 seedů),
  - `voda z terénu zůstane vodou a jinde voda není`,
  - `místo pro vesnici je louka`,
  - `les netvoří osamělá políčka` (žádná lesní komponenta < 4 políčka),
  - `změna seedu vegetace nezmění terén` (terén před a po `generateVegetation` se dvěma seedy `toEqual` původní; obě vegetace se liší).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(game): vegetace krajiny – les a louky`

### Task 4: Úrodnost, pásmo srovnatelnosti a `generateLandscape`

**Files:**

- Create: `packages/game/src/domain/landscape/fertility.ts`, `band.ts`, `generate.ts`, `index.ts`
- Create: `packages/game/scripts/measure-landscapes.ts` (vývojový nástroj, `npx tsx`)
- Modify: `packages/game/src/index.ts` (`export * from './domain/landscape'`)
- Test: `packages/game/src/domain/landscape/__tests__/generate.test.ts`, doplnit `landscape-checks.ts`

**Interfaces:**

- Consumes: Task 1–3.
- Produces:
  - `computeFertility(seed: number, terrain: Terrain, surface: Uint8Array, version: 1): Uint8Array`,
  - `band.ts`: konstanty `FOREST_SHARE = [0.55, 0.70]`, `VILLAGE_SITE_CELLS = [400, 1200]`, `VILLAGE_SITE_MIN_FERTILITY = 60`, `VILLAGE_SITE_MAX_WATER_DISTANCE_CELLS = 20`, `RELIEF_M = [10, 40]`, `FLAT_MAX_STEP_M = 1.0`, `FERTILE_CELLS` (z měření); `checkBand(l: Landscape): { ok: boolean; failures: string[] }`,
  - `generateLandscape(seed: number, versions?: LayerVersions): Landscape` (výchozí `CURRENT_LAYER_VERSIONS`). Pokus `k` použije seed `(seed + k) >>> 0`, vrstvy `deriveSeed(attemptSeed, 'terrain' | 'vegetation' | 'fertility')`. Vrátí první krajinu s `checkBand().ok`. Po `MAX_ATTEMPTS = 16` vyhodí `Error`. Neznámá verze vrstvy → `RangeError`.
- `landscape-checks.ts`: `largestVillageSite(l): number` (největší 4-souvislá komponenta políček, která jsou `meadow`, mají úrodnost ≥ 60, jsou rovinatá (`maxNeighbourStepM ≤ 1.0`) a leží do 20 políček euklidovsky od vody), `fertileCellCount(l)`.

Pravidla úrodnosti:

- Základ dává rovinatost a vzdálenost od vody: optimum 3–15 políček od vody, těsně u vody (≤ 1 políčko) je půda podmáčená a úrodnost nízká.
- Na svazích a vršcích klesá.
- Jemný šum ±10.
- V místě pro vesnici ≥ 60.

- [ ] **Step 1: Write the failing tests** (300 seedů `0..299`, kontroly z `landscape-checks.ts`, ne z `band.ts`):
  - `každá krajina má potok od okraje k okraji`,
  - `les 55–70 %`,
  - `místo pro vesnici má 400–1 200 políček`,
  - `převýšení 10–40 m`,
  - `celková úrodná plocha v pásmu FERTILE_CELLS`,
  - `stejný seed → shodná krajina, jiný seed → jiná`,
  - `neznámá verze vrstvy vyhodí RangeError` (`{ terrain: 2 } as never`),
  - `úrodnost je celé číslo 0–100`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement `fertility.ts`, `band.ts` (zatím s dočasným `FERTILE_CELLS = [0, 16384]`) a `generate.ts`.
- [ ] **Step 4:** Implement `measure-landscapes.ts` a spustit `npx tsx packages/game/scripts/measure-landscapes.ts 500`. Skript vypíše min / p5 / medián / p95 / max pro: podíl lesa, velikost místa pro vesnici, úrodnou plochu, převýšení, počet pokusů a průměrný čas `generateLandscape`.
  - Očekávané výsledky: ≥ 95 % krajin projde na první pokus, průměrný čas < 50 ms. Pokud ne, ladit generátor, ne pásmo.
  - `FERTILE_CELLS` nastavit na [p5, p95] úrodné plochy z měření.
  - Čísla zapsat do `docs/design/landscape.md` (sekce Generování, odrážka o celkovém počtu úrodných políček).
- [ ] **Step 5:** `npm run test -w @bohemia/game` → PASS (všech 300 seedů).
- [ ] **Step 6: Commit** `feat(game): úrodnost a generování krajiny v pásmu srovnatelnosti`

### Task 5: Use-case vstupu do hry

**Files:**

- Create: `packages/game/src/application/settlements.ts` (porty a typ `Settlement`), `enter-game.ts`, `index.ts`
- Create: `packages/game/src/application/__tests__/in-memory-settlements.ts` (testovací utilita)
- Modify: `packages/game/src/index.ts` (`export * from './application'`)
- Test: `packages/game/src/application/__tests__/enter-game.test.ts`

**Interfaces:**

- Consumes: `generateLandscape`, `Landscape`, `LayerVersions`, `CURRENT_LAYER_VERSIONS`.
- Produces:
  ```ts
  export interface Settlement {
    id: string;
    ownerId: string;
    isSeat: boolean;
    landscapeSeed: number;
    layerVersions: LayerVersions;
    createdAt: Date;
  }
  export interface SettlementRepository {
    findSeat(ownerId: string): Promise<Settlement | null>;
    /** Atomicky založí sídelní sídlo hráče; když už existuje, vrátí existující beze změny. */
    createSeat(input: {
      ownerId: string;
      landscapeSeed: number;
      layerVersions: LayerVersions;
    }): Promise<Settlement>;
  }
  export interface SeedSource {
    nextSeed(): number;
  } // celé číslo 0 … 2^31 − 1
  export interface EnterGameDeps {
    settlements: SettlementRepository;
    seeds: SeedSource;
  }
  export interface EnterGameResult {
    settlement: Settlement;
    landscape: Landscape;
  }
  export function enterGame(deps: EnterGameDeps, playerId: string): Promise<EnterGameResult>;
  ```
- `InMemorySettlements implements SettlementRepository`: `createSeat` před zápisem udělá `await Promise.resolve()`, aby šel nasimulovat souběh.

- [ ] **Step 1: Write the failing tests:**
  - `první vstup založí sídelní sídlo s novým seedem a aktuálními verzemi vrstev`,
  - `další vstup vrátí totéž sídlo a stejnou krajinu` (id, seed, `heights` `toEqual`),
  - `souběžné první vstupy založí jediné sídlo` (`Promise.all` ×3 → stejné id, v repozitáři 1 sídlo),
  - `sídlo s uloženými verzemi vrstev generuje podle nich` (repozitář předvyplněný sídlem s `CURRENT_LAYER_VERSIONS` a seedem 7 → krajina `toEqual(generateLandscape(7))`).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `npm run lint` (pravidla hexagonu) → bez chyb.
- [ ] **Step 5: Commit** `feat(game): use-case vstupu do hry se sídelním sídlem`

### Task 6: Tabulka `settlement` a Drizzle adaptér

**Files:**

- Create: `packages/db/src/schema/settlement.ts`, `packages/db/src/adapters/settlement-repository.ts`, `packages/db/src/adapters/index.ts`, `packages/db/vitest.db.config.ts`
- Create: `packages/db/drizzle/0001_settlement.sql` (generuje `npm run db:generate -- --name settlement`)
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/index.ts` (export `createSettlementRepository`), `packages/db/package.json` (dependency `@bohemia/game: "*"`, script `test:db`), `packages/db/vitest.config.ts` nebo `package.json` test (vyloučit `**/*.db.test.ts`), kořenový `package.json` (script `test:db`)
- Test: `packages/db/src/adapters/__tests__/settlement-repository.db.test.ts`

**Interfaces:**

- Consumes: `SettlementRepository`, `Settlement`, `LayerVersions` z `@bohemia/game`.
- Produces: `createSettlementRepository(db: Database): SettlementRepository`.
- Schéma tabulky `settlement`:
  - `id` uuid, pk, `defaultRandom`,
  - `owner_id` text not null, odkaz na `user.id` s `onDelete: cascade`,
  - `is_seat` boolean not null default false,
  - `landscape_seed` integer not null,
  - `layer_versions` jsonb not null (`$type<LayerVersions>()`),
  - `created_at` timestamptz default now,
  - **částečný unikátní index** `settlement_owner_seat_idx` na `owner_id` `WHERE is_seat`.
- `createSeat` je `INSERT … ON CONFLICT DO NOTHING RETURNING *`. Když nic nevrátí, zavolá `findSeat`.

- [ ] **Step 1: Write the failing tests** proti `postgres://postgres@127.0.0.1:5432/bohemia_test`. Před testy se pustí migrace, `TRUNCATE "user" CASCADE` a vloží se testovací hráč přímo SQL.
  - `createSeat založí sídlo a findSeat ho najde`,
  - `druhé createSeat vrátí původní sídlo (seed se nezmění)`,
  - `pět souběžných createSeat vytvoří jediný řádek`,
  - `findSeat neznámého hráče vrátí null`,
  - `smazání hráče smaže i jeho sídla`.
- [ ] **Step 2:** `npm run test:db` → FAIL.
- [ ] **Step 3:** Implement schéma a adaptér. `npm run db:generate -w @bohemia/db -- --name settlement`, `npm run db:migrate` (lokální `bohemia`).
- [ ] **Step 4:** `npm run test:db` → PASS; `npm run test` stále neběží proti DB (jen `client.test.ts`).
- [ ] **Step 5: Commit** `feat(db): tabulka sídel a Drizzle adaptér repozitáře`

### Task 7: Přenos krajiny, composition root a Babylon scéna (terén, voda, kamera, políčko pod kurzorem)

**Files:**

- Create: `apps/web/lib/db.ts` (`getDatabase(): Database`, líně a přes `globalThis`; `lib/auth.ts` ho začne používat místo vlastní instance)
- Create: `apps/web/lib/game.ts` (`server-only`; `enterGameForPlayer(playerId: string): Promise<EnterGameResult>`, `SeedSource` přes `randomInt(0, 2 ** 31)` z `node:crypto`)
- Create: `apps/web/lib/landscape-transfer.ts`, `apps/web/lib/tile-info.ts`
- Create: `apps/web/lib/scene/create-engine.ts`, `landscape-scene.ts`, `terrain-mesh.ts`, `water.ts`, `camera.ts`, `tile-at.ts`
- Test: `apps/web/lib/__tests__/landscape-transfer.test.ts`, `tile-info.test.ts`, `apps/web/lib/scene/__tests__/tile-at.test.ts`
- Modify: `apps/web/package.json` (`@babylonjs/core@^9.31.0`, `@babylonjs/loaders@^9.31.0`)

**Interfaces:**

- Consumes: `enterGame`, `Landscape`, `Surface`, `SURFACE_CODES` (`@bohemia/game`); `createSettlementRepository` (`@bohemia/db`).
- Produces:
  ```ts
  // landscape-transfer.ts – serializovatelné do props klientské komponenty
  export interface LandscapeTransfer {
    size: number;
    cellSizeM: number;
    villageSite: { x: number; y: number };
    heightsDm: string;
    surface: string;
    fertility: string; // base64 (Uint16 decimetry, Uint8, Uint8)
  }
  export function encodeLandscape(l: Landscape): LandscapeTransfer;
  export function decodeLandscape(t: LandscapeTransfer): Landscape;
  // tile-info.ts
  export interface TileInfo {
    x: number;
    y: number;
    surface: Surface;
    fertility: number;
    heightM: number;
  }
  export function formatTileInfo(tile: TileInfo): string; // „Louka · úrodnost 72“
  // scene/tile-at.ts – svět: osa X = x políčka, osa Z = y políčka, střed krajiny v počátku
  export function tileAt(
    l: Landscape,
    worldX: number,
    worldZ: number,
  ): { x: number; y: number } | null;
  export function tileCenter(
    l: Landscape,
    x: number,
    y: number,
  ): { worldX: number; worldZ: number };
  // scene/landscape-scene.ts – bez Reactu
  export class LandscapeScene {
    static create(
      canvas: HTMLCanvasElement,
      options?: { renderer?: 'auto' | 'webgl' },
    ): Promise<LandscapeScene>;
    readonly renderer: 'webgpu' | 'webgl';
    setLandscape(landscape: Landscape): Promise<void>;
    onTileHover(listener: (tile: TileInfo | null) => void): () => void;
    dispose(): void;
  }
  ```

Rozhodnutí pro scénu:

- `create-engine.ts`: když `renderer !== 'webgl'` a `await WebGPUEngine.IsSupportedAsync`, vytvoří `WebGPUEngine` (`await initAsync()`), jinak `Engine` (WebGL 2).
- Terén je jedna `Mesh` z `VertexData` 128 × 128 vrcholů s vertex barvami podle povrchu: louka světle zelená, lesní půda tmavě zelenohnědá, břeh u vody pískově hnědá. Materiál `StandardMaterial`, bez vlastních shaderů.
- Voda je síť z vodních políček ve výšce hladiny (dno koryta + 0,4 m), poloprůhledná modrá.
- Kamera: `ArcRotateCamera`, `beta` zamčená na ≈ 0,8 rad.
  - Levé tlačítko posouvá cíl, pravé otáčí `alpha`, kolečko mění `radius` v rozmezí 150–1 400 m.
  - Cíl je omezený na plochu krajiny a výchozí cíl je `villageSite`.
  - WASD/šipky posouvají v rovině kamery, Q/E otáčejí.
- Kurzor: `onPointerMove` → `scene.pick` na terén → `tileAt` → `TileInfo`. Událost se pošle jen při změně políčka. Mimo terén nebo při `pointerleave` plátna se pošle `null`.
- `dispose()` volané během běžícího `create()` nebo `setLandscape()` nesmí vyhodit chybu a uvolní engine.

- [ ] **Step 1: Write the failing tests:**
  - `encodeLandscape → decodeLandscape zachová povrch a úrodnost přesně a výšky s chybou ≤ 0,05 m` (krajina `generateLandscape(1)`),
  - `zakódovaná krajina má po JSON.stringify méně než 150 kB`,
  - `formatTileInfo`: `{surface:'meadow',fertility:72}` → `'Louka · úrodnost 72'`, `'forest'` → `'Les · …'`, `'water'` → `'Voda · …'`,
  - `tileAt`: střed světa → `{x:64,y:64}`, roh `(-960+1, -960+1)` → `{x:0,y:0}`, bod mimo krajinu (`worldX = 2000`) → `null`; `tileAt(tileCenter(x,y))` vrátí `(x,y)` pro 10 různých políček.
- [ ] **Step 2:** `npm run test -w @bohemia/web` → FAIL.
- [ ] **Step 3:** Implement `landscape-transfer.ts`, `tile-info.ts`, `tile-at.ts`, `db.ts` a `game.ts` (`auth.ts` převést na `getDatabase()`).
- [ ] **Step 4:** Implement scénu (`create-engine.ts`, `terrain-mesh.ts`, `water.ts`, `camera.ts`, `landscape-scene.ts`), Babylon importovat jen z konkrétních modulů.
- [ ] **Step 5:** `npm run test`, `npm run typecheck`, `npm run lint` → PASS.
- [ ] **Step 6: Commit** `feat(web): Babylon scéna krajiny – terén, voda, kamera, políčko pod kurzorem`

### Task 8: Herní plocha s krajinou a e2e

**Files:**

- Create: `apps/web/components/game/GameView.tsx` (`'use client'`), `apps/web/components/game/TileInfoPanel.tsx`
- Modify: `apps/web/app/game/page.tsx`
- Create: `apps/web/e2e/helpers.ts` (přesunout `uniqueEmail`, `register`, `login`, `signOut`, IP hlavičku z `accounts.spec.ts`; přidat `registerAndEnterGame(page)`)
- Modify: `apps/web/e2e/accounts.spec.ts` (použít helpers)
- Test: `apps/web/e2e/landscape.spec.ts`

**Interfaces:**

- Consumes: `enterGameForPlayer`, `encodeLandscape`, `decodeLandscape`, `LandscapeScene`, `formatTileInfo`.
- Produces:
  - `<GameView landscape={LandscapeTransfer} />`: plátno přes celé okno.
  - Scéna se načítá dynamickým `import('@/lib/scene/landscape-scene')` v `useEffect`, Babylon se tak nedostane do SSR ani do jiných stránek.
  - Plátno má atributy `data-scene-ready="true"` po dokončení `setLandscape` a `data-renderer="webgpu|webgl"`.
  - Parametr `?renderer=webgl` vynutí WebGL.
  - `TileInfoPanel` je vlevo dole, při `null` se skryje.
  - Stránka `/game` volá `enterGameForPlayer(session.user.id)` a předá `encodeLandscape(result.landscape)`. Hlavička (Bohemia, e-mail, „Odhlásit“) a `GameDateBadge` zůstávají jako překryvná vrstva. Text „Tady jednou bude tvoje panství.“ zmizí.

- [ ] **Step 1: Write the failing e2e tests** (`landscape.spec.ts`):
  - `po vstupu do hry se vykreslí krajina`: `canvas[data-scene-ready="true"]` do 30 s, `mouse.move` na střed plátna → panel odpovídá `/^(Voda|Les|Louka) · úrodnost \d+$/`,
  - `krajina zůstane po načtení stránky znovu stejná`: text panelu na středu před a po `page.reload()` je shodný,
  - `bez WebGPU běží na WebGL`: `/game?renderer=webgl` → `data-renderer="webgl"` a `data-scene-ready="true"`,
  - `odhlášení během načítání scény nezpůsobí chybu`: hned po `goto('/game')` klik na „Odhlásit“, `page.on('pageerror')` nezachytí nic,
  - `info o políčku zmizí mimo krajinu`: `mouse.move(0, viewport.height / 2)` po předchozím najetí → panel není vidět, nebo ukazuje políčko pod kurzorem (ne staré),
  - `plátno se přizpůsobí oknu`: `setViewportSize(800, 600)` → bounding box plátna 800 × 600,
  - `Babylon se nestahuje na přihlášení`: na `/login` stáhnout všechny `script[src]` a ověřit, že žádný neobsahuje `Babylon.js v`.
- [ ] **Step 2:** `npm run test:e2e` → nové testy FAIL.
- [ ] **Step 3:** Implement `GameView`, `TileInfoPanel`, `/game` a e2e helpers.
- [ ] **Step 4:** `npm run test:e2e` 2× po sobě → PASS (všechny, včetně `accounts.spec.ts`).
- [ ] **Step 5:** Ruční kontrola: `npm run dev`, Playwright screenshot `/game`.
  - Vzhled: mírně zvlněná krajina, potok, kamera na místě pro vesnici.
  - Ovládání: posun, kolečko, pravé tlačítko, WASD, Q/E.
  - Čas do `data-scene-ready` v produkčním buildu (cíl ≤ 2 s) změřit a zapsat do commitu.
- [ ] **Step 6: Commit** `feat(web): herní plocha s 3D krajinou sídla`

### Task 9: Stromy – CC0 modely a instancované vykreslení

**Files:**

- Create: `apps/web/public/models/nature/deciduous-1.glb`, `deciduous-2.glb`, `conifer-1.glb`, `conifer-2.glb`, `apps/web/public/models/LICENSES.md`
- Create: `apps/web/lib/scene/tree-placement.ts`, `apps/web/lib/scene/trees.ts`
- Modify: `apps/web/lib/scene/landscape-scene.ts` (`setLandscape` přidá stromy)
- Test: `apps/web/lib/scene/__tests__/tree-placement.test.ts`, doplnit `apps/web/e2e/landscape.spec.ts`

**Interfaces:**

- Produces:
  - `interface TreePlacement { species: 'deciduous-1' | 'deciduous-2' | 'conifer-1' | 'conifer-2'; worldX: number; worldZ: number; rotationY: number; scale: number }`,
  - `treePlacements(l: Landscape): TreePlacement[]`: deterministicky z hashe polohy políčka, 2–3 stromy na lesní políčko, na jiných políčkách žádné; jehličnany převažují ve vyšších polohách,
  - `addTrees(scene, placements, modelsBaseUrl): Promise<void>`: jeden zdrojový mesh na druh a thin instances; chyba načtení modelu se zaloguje (`console.warn`) a krajina zůstane bez stromů.

Modely:

- Zdroj je **Kenney Nature Kit (CC0)**, 2 listnaté a 2 jehličnaté stromy ve formátu GLB, každý < 150 kB.
- Když stažení ze stránky Kenney nepůjde, použij Blender MCP (`search_assets` Poly Pizza, autor Kenney nebo Quaternius) a export GLB.
- Když nepůjde ani jedno, zastav a zeptej se Martina.
- Do `LICENSES.md` zapiš zdroj, autora, licenci a původní názvy souborů.
- Výsledná výška stromů ve scéně je ≈ 10–18 m.

- [ ] **Step 1: Write the failing tests:**
  - `stromy stojí jen na lesních políčkách` (každá pozice → `tileAt` → povrch `forest`),
  - `počet stromů je 2–3× počet lesních políček`,
  - `rozmístění je deterministické` (dvakrát `toEqual`).
  - e2e `krajina naběhne i bez modelů stromů`: `page.route('**/models/**', r => r.abort())` → `data-scene-ready="true"`, žádný `pageerror`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Stáhnout modely, zapsat `LICENSES.md`, implement `tree-placement.ts` a `trees.ts`, napojit do scény.
- [ ] **Step 4:** `npm run test`, `npm run test:e2e` → PASS.
- [ ] **Step 5:** Ruční kontrola v prohlížeči (screenshot):
  - les v souvislých celcích, jednotný styl modelů,
  - plynulý pohyb kamery (cíl ≈ 60 fps; ověřit přes `engine.getFps()` v konzoli),
  - čas do `data-scene-ready` v produkčním buildu ≤ 2 s.
- [ ] **Step 6: Commit** `feat(web): lesy z CC0 low-poly modelů`

### Task 10: Dokumentace a závěrečné ověření

**Files:**

- Modify: `CLAUDE.md`:
  - struktura (`domain/landscape`, `application`, `packages/db/src/adapters`, `apps/web/lib/scene`, `components/game`),
  - příkazy (`test:db`, `measure-landscapes`),
  - sekce „Krajina“ (API, `?renderer=webgl`, pravidlo importů Babylonu, kde jsou modely a licence),
- Modify: `docs/design/landscape.md` (naměřená čísla z Task 4, skutečně použitá sada modelů).

- [ ] **Step 1:** Upravit dokumentaci.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm run test && npm run test:db && npm run format:check && npm run build && npm run test:e2e` → vše PASS.
- [ ] **Step 3: Commit** `docs: krajina sídla v CLAUDE.md a návrhu`
