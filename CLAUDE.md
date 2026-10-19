# Bohemia – CLAUDE.md

## Účel projektu

Online feudální strategie v prohlížeči. Hráč je feudální pán – přesněji hlava rodu. Buduje
vesnice, hradiště, tvrze, hrady a města, rozšiřuje rodový majetek a prestiž a snaží se rod
udržet naživu. Všichni hráči sdílejí **jeden svět** propojený vazalskými vztahy.

Podrobná vize, kdo co rozhodl a otevřené otázky: [docs/design/vision.md](docs/design/vision.md).
Herní design vzniká postupně – jedna mechanika = jeden dokument v `docs/design/`.

---

## Klíčová fakta

- **Ostré spuštění: 1. 1. 2027 v 00:00 (Europe/Prague)** – svět startuje 1. 1. roku 500.
- Svět běží jeden skutečný rok: **1. 1. 2028 v 00:00 = 1. 1. roku 1500**.
- 365 skutečných dní = 1000 herních let, svět běží nepřetržitě i bez přihlášených hráčů.

| Herní jednotka     | Skutečný čas       |
| ------------------ | ------------------ |
| den                | ≈ 86 s             |
| roční období       | ≈ 2 h 11 min       |
| rok                | ≈ 8 h 46 min       |
| generace (~25 let) | ≈ 9 dní            |
| lidský život       | ≈ 2–3 týdny        |
| 1 skutečný den     | ≈ 2,74 herních let |

**Důsledek:** skutečnou „postavou“ hráče je **rod**, ne jeden pán. Za rok hraní se vystřídá
kolem 40 generací – dědictví, sňatky a nástupnictví jsou hlavní mechanika, ne okrajová.

## Hráči a vazalství

- Registrace a přihlášení jsou povinné.
- Nový hráč **s pozvánkou** (unikátní kód od stávajícího hráče) začíná jako vazal toho, kdo ho
  pozval.
- Nový hráč **bez pozvánky** je automaticky přidělen jako vazal některému ze stávajících hráčů –
  podle herní mechaniky, která se teprve navrhne.
- Svět je strom vazalství. Vazalství není trvalé (osamostatnění, vzpoura, přísaha jinému pánovi) –
  detaily se navrhnou.

---

## Technologický stack

**Současný stav:**

- **Monorepo:** Turborepo + npm workspaces (`apps/*`, `packages/*`), Node 24 (`.nvmrc`)
- **Jazyk:** TypeScript 6 (strict, `noUncheckedIndexedAccess`), společný `tsconfig.base.json`
- **Web:** Next.js 16 (App Router, `output: 'standalone'`), React 19, Tailwind CSS v4
- **Herní jádro:** `packages/game` – doména (kalendář, generování krajiny, simulace vsi) a use-casy, bez I/O
- **3D:** Babylon.js 9 (`@babylonjs/core` + `@babylonjs/loaders`), WebGPU se záložním WebGL 2
- **Databáze:** PostgreSQL + Drizzle (`packages/db`), migrace jako SQL v `packages/db/drizzle/`
- **Účty:** Better Auth – e-mail + heslo s ověřením e-mailu, obnova hesla, Google, sessions v DB
- **Kvalita:** ESLint 10 + typescript-eslint (kořenový `eslint.config.mjs`), Prettier, Vitest

Next.js 16 má oproti starším verzím breaking changes – dokumentace k nainstalované verzi je
v `node_modules/next/dist/docs/`. Soubor `apps/web/AGENTS.md` generuje sám `next dev`; patří
do gitu (po smazání by ho vytvořil znovu).

**Plánováno (zatím neexistuje):**

- `apps/worker` – samostatný Node proces, který posouvá svět (stavby, narození, úmrtí, roční
  období) i když nikdo není online
- Pozvánkové kódy (s mechanikou vazalství), odesílání skutečných e-mailů

## Struktura repa

```
apps/web/            Next.js – úvodní stránka, registrace, přihlášení, herní plocha (/game)
  app/api/auth/      Better Auth endpointy
  components/        React komponenty (auth/ formuláře, game/ herní plocha a ves, game/hud/ rozhraní)
  hooks/             React hooky (umisťování staveb ve scéně, dotazování na ves)
  lib/               serverová a pomocná logika (auth, session, db, game a village – composition root)
  lib/scene/         3D scéna krajiny v Babylonu – čisté TS třídy bez Reactu
  public/models/     modely stromů, dekorací, zvířat a lidí a atlas impostorů z 0 A.D. (licence v LICENSES.md)
  e2e/               Playwright testy (proti produkčnímu buildu a databázi bohemia_test)
packages/game/       herní jádro
  src/domain/        pravidla – calendar.ts, landscape/ (generování krajiny po vrstvách)
    village/         simulace vsi – lidé, obydlí, pole, jídlo a práce den po dni
  src/application/   use-casy a porty (enterGame, SettlementRepository, SeedSource)
  scripts/           vývojové nástroje (measure-landscapes.ts, measure-village.ts, village-calculator.ts)
packages/db/         Drizzle schéma, klient, migrace a adaptéry portů (src/adapters/)
docs/design/         herní design – vize + dokument pro každou mechaniku, rešerše v research/
```

## Herní kalendář

Pravidla v [docs/design/calendar.md](docs/design/calendar.md). Hlavní API z `@bohemia/game`:

- `getWorldState(nowMs, world)` – stav světa (`not-started` / `running` s herním datem / `ended`)
- `realTimeOf(date, world)` – skutečný okamžik, kdy herní den začíná (pro plánování událostí)
- `resolveWorldClock(env)` – ostrý svět, nebo testovací svět z `WORLD_START` a `WORLD_END`

Testovací svět: zkopíruj `apps/web/.env.example` do `apps/web/.env.local` a nastav obě
proměnné – příklady (svět od dneška, zrychlený svět) jsou přímo v souboru.

## Účty hráčů

Pravidla v [docs/design/accounts.md](docs/design/accounts.md). Na serveru `getSession()`
(`apps/web/lib/session.ts`), v prohlížeči `authClient` (`lib/auth-client.ts`). Instance Better
Auth vzniká líně přes `getAuth()` – `next build` stránky jen importuje a databázi nepotřebuje.

- **E-maily** se zatím jen vypisují do terminálu dev serveru (ověřovací odkaz se zkopíruje
  odtamtud). V produkci bez nastaveného odesílání `sendMail` záměrně spadne.
- **Vývojový účet** bez registrace: `npm run db:seed-dev` založí (nebo obnoví) ověřený účet
  v lokální DB `bohemia`, přihlašovací údaje jsou na začátku `apps/web/scripts/seed-dev-user.ts`.
  Ve vývoji jde přihlásit i samotným jménem (`lib/dev-login.ts` doplní `@bohemia.test`).
- **Vývojový režim (dev mód):** příznak účtu `devMode` (`user.dev_mode`, Better Auth pole
  s `input: false` – klient ho nenastaví; zapíná ho jen `db:seed-dev`, dnes jen Jarmil). Vedle
  data v liště jsou tři šipky – ▶ +1 měsíc (30 dní), ⏩ +1 rok (365 dní), ⏭ +10 let (3 650 dní). Server action
  `skipTime` → use-case `skipTime` (bez `devMode` odmítne) zvětší **posun času hráče**
  (tabulka `player_time_offset`, port `TimeOffsetRepository`) a dopočítá jeho vsi. Dnešní den
  hráče je vždy `playerToday` z `lib/game.ts` (den světa + posun, nejvýš 31. 12. 1499) – nikdy
  `gameDayIndex` přímo; prohlížeč dostane posun se stránkou a hodiny posune `shiftWorldClock`
  (datum v liště, roční období a dým ve scéně). Posun jen roste, platí i bez `devMode`. Vedle
  šipek je i tlačítko **Druhá ves na téže mapě** (server action `foundDevVillage` → use-case
  `foundDevVillage`, bez `devMode` odmítne) – jen pro vyzkoušení přepínače vsí, dokud odchod do
  nové vsi (migration.md, fáze 3 a 4) není: nová ves se 4 lidmi na nejbližším volném místě
  aspoň 300 m od ostatních (`freeVillageSite`), lidé ze staré vsi neodcházejí.
- **Hlášky Better Auth** se překládají v `lib/auth-errors.ts` – nové chybové kódy doplnit tam.
- **Změna polí uživatele** (`user.additionalFields` v `lib/auth.ts`) → upravit i
  `packages/db/src/schema/auth.ts` a vygenerovat migraci.
- **Google:** přihlašovací údaje z Google Cloud Console do `apps/web/.env.local`
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); bez nich se tlačítko Google nezobrazí.

## Krajina sídla

Pravidla v [docs/design/landscape.md](docs/design/landscape.md).

- **Generování** (`packages/game/src/domain/landscape/`): `generateLandscape(seed, versions)` –
  vrstvy terén a voda → vegetace → úrodnost, každá s vlastním seedem (`deriveSeed`) a verzí.
  Pásmo srovnatelnosti hlídá `checkBand(landscape, versions)` (pásmo podle verzí – `bandFor`,
  `BAND_V1` / `BAND_V2` v `band.ts`) a testy na 300 seedech. Po změně generátoru pusť
  `measure-landscapes` a zkontroluj podíl krajin na první pokus, čas a louky do 600 m od vsi.
- **Verze vrstev:** nová sídla `CURRENT_LAYER_VERSIONS` (vegetace a úrodnost 2 – víc kvalitní
  louky kolem vsi, 18. 10. 2026), sídla založená dřív `INITIAL_LAYER_VERSIONS` (vše 1). Stará
  verze se generuje dál beze změny (`vegetationV1`, `byWaterDistance`) – zlatý otisk krajiny
  (`generate.test.ts`) i vrstvy překážek (`obstacles.test.ts`) hlídá obě verze. Původní
  krajinu ukáže `/dev/landscape?seed=…&layers=initial`.
- **Uložené sídlo nese seed přijatého pokusu** a jeho krajina se generuje přes
  `generateLandscapeAttempt` bez kontroly pásma. Změna pásma (`band.ts`) proto platí jen pro nová
  sídla. **Po ostrém spuštění** se existující vrstva nesmí změnit (přepsala by krajiny hráčů) –
  nová verze vrstvy, nebo nová vrstva.
- **Use-case** `enterGame` (sídelní sídlo hráče, atomicky přes unikátní index); ve webu
  `enterGameForPlayer` v `lib/game.ts`. Restart hry (`restartGame`, viz Ves – Hlad a vymření)
  sídla archivuje (`settlement.archived_at`, `is_seat` false) – port vrací jen aktivní sídla. Krajinu generuje server, do prohlížeče jde zakódovaná
  (`lib/landscape-transfer.ts`, přesnost = `transferPrecision`).
- **Stromy, keře a kameny jsou herní data** – vrstva překážek
  (`packages/game/src/domain/landscape/obstacles/`, fields.md – Překážky jsou herní data):
  `obstaclesOf(landscape)` = líně generovaná vrstva (seed `landscape.obstacleLayer`, verze
  `LayerVersions.obstacles`), sloupce typovaných polí (`id`, `x`, `z`, `kind`, `look`,
  `rotation`, `scale`, `impostor`) + index po políčkách (`obstaclesInTile`, `obstaclesNear`,
  `obstacleIndex` půlením). Druhy = řádky tabulky cen: `tree`, `youngTree`, `snag`,
  `fallenTree`, `stump`, `shrub`, `stone`, `boulder`, `outcrop`. **Id je stabilní**: zdroj
  (rozmisťovač) × 2²² + buňka jeho mřížky × 8 + pořadí ve skupině (`obstacleId`). Generuje ji
  server (mezipaměť podle objektu krajiny – s LRU krajin) **i prohlížeč** ze stejné funkce
  (≈ 250–350 ms, přenos by byl ≈ 470 kB gzip): vstupem je krajina s přesností prohlížeče
  a jen deterministická matematika (`det-math.ts` – žádné Math.sin/cos/atan2/hypot, liší se
  mezi enginy – v souborech vrstvy je **hlídá ESLint**, i mocninu `**`). Test
  v `landscape-transfer.test.ts` ověřuje, že prohlížeč dostane bit po bitu serverovou vrstvu –
  **dokazuje to ale jen shodu ve V8** (Node = Chrome); u Firefoxu a Safari shodu drží jen to,
  že vrstva používá výhradně přesně zaokrouhlované operace. Zlatý otisk vrstvy (3 seedy,
  `obstacles.test.ts`) spadne při jakékoli změně. **Novou verzi vrstvy překážek po ostrém
  spuštění vyžaduje změna čehokoli, na čem stojí:** rozmisťovače (`landscape/obstacles/`), pole lesa (`forest-field.ts`), osa potoka ve světě
  (`stream-geometry.ts`), tvar terénu (`relief.ts`, `SUN_RAYS`), `det-math.ts`,
  `transferPrecision` i přesnost kodéru ve webu (`landscape-transfer.ts`: výšky na cm, osa
  potoka ve Float32), pomocné funkce `world.ts`, `deriveSeed` a `createRandom`, verze
  `simplex-noise` (připnutá bez stříšky), číslování `OBSTACLE_SOURCES` (id) a
  `VILLAGE_CLEARING_TILES` – a samozřejmě generátor krajiny, ze které vrstva vychází.
  Pozor: `streamCenterline` (`deriveFlow`) řídí i vzhled vody a zvuk potoka – ladění vody
  přes osu potoka mění i vrstvu (vzhledovou část pak oddělit).
- **Scéna** (`apps/web/lib/scene/`): `LandscapeScene` bez Reactu, React (`GameView`) ji jen
  vytvoří, pošle data a poslouchá `onTileHover`, `onSelect` a `onViewChange`. Plátno scény má
  `data-scene` (rozhraní má i plátno minimapy), políčko pod kurzorem nese `data-tile`. Babylon importovat **z konkrétních modulů**
  (`@babylonjs/core/Meshes/mesh`…), nikdy z `@babylonjs/core` – a jen ze scény, aby se engine
  nestahoval mimo herní plochu (hlídá e2e test). **Pick terénu** (políčko pod kurzorem,
  umisťování, výběr) jde po výškové síti (`terrain-pick.ts`, `TerrainMesh.pick` – DDA po
  políčkách sítě pod paprskem, stejné trojúhelníky a test jako Babylon, setiny ms), nikdy
  `scene.pick` na terénu (516 tisíc trojúhelníků); shodu hlídá `terrain-pick.test.ts` proti
  `scene.pick` v NullEngine.
- **Kreslí se jen při změně** (pohled kamery, velikost okna, data) – co se ve scéně mění samo
  (animace, voda, roční období), musí nastavit `needsRender`. **Výjimka: voda teče** (Martin) –
  dokud je hladina v záběru, scéna se překresluje `WATER_FPS` (30) za sekundu; vlnky plují po
  proudu (`water.ts`, rychlost proudu odvozuje osa potoka v jádru ze spádu a šířky potoka,
  kalnost a podloží `scene/stream-geometry.ts`). Zamrzlá voda neteče: `flowsInView` zná čtverce
  hladiny (`FLOW_CHUNK_M`) a od jaké zimy jsou celé zamrzlé – kreslí se, jen dokud je v záběru
  nezamrzlá voda. **Na pozadí nižší plynulost** (Martin 18. 10. 2026): okno bez fokusu (záložka
  vidět) 10 fps, po 2 minutách bez vstupu hráče 20 fps, vstup nebo fokus hned zpět na 30
  (`animationFps` v `render-loop.ts`); skrytá záložka nekreslí vůbec.
- **Klidová smyčka** (`startLoop` v `landscape-scene.ts`, takt `render-loop.ts`): vlastní
  `requestAnimationFrame` místo `engine.runRenderLoop` – snímek enginu (`beginFrame` /
  `endFrame`, ve WebGPU odeslání příkazů) vzniká **jen když se kreslí**. Kontroly animací
  (voda, zvířata, lidé, dým, obilí) a dokreslování po načtení (`renderBurst`) jdou v taktu
  animací (`tickDue` / `nextTick` – i na displeji 120 Hz přesně 30×/s), pohyb kamery se kreslí
  s displejem. Nové animace patří do `animate()`, ne přímo do smyčky. Výkon měří vývojový
  ukazatel vpravo dole na `/dev/landscape` (`ScenePerfPanel`, `scene-perf.ts` – kreslící
  snímky, smyčka, CPU a GPU snímku, draw cally, trojúhelníky, pick).
- **Vývojový náhled** bez přihlášení a databáze: http://localhost:3010/dev/landscape?seed=42
  (tlačítka předchozí / další / náhodná / původní vrstvy, lišta vsi s minimapou – pole jde
  malovat i do lesa a překážky z něj hned zmizí, „Kácet 20 stromů“). V produkci vrací 404.
- `?renderer=webgl` vynutí WebGL 2 (test záložní cesty). `HEIGHT_SCALE` v `scene/constants.ts`
  převyšuje terén jen vizuálně. Tamtéž rozsah přiblížení kamery `CAMERA_ZOOM_M` (výchozí 120 m
  a nejblíž 50 m jako v 0 A.D.) – řídí se jím i mix zvuků.
- **Vzhled terénu:** `render-surface.ts` zjemní výšky 4× (Catmull-Rom) a vyhloubí hladké koryto
  podél vyhlazené osy potoka (`streamCenterline` z jádra) – tůně hlubší, mělčiny mělké, vnitřní strana
  oblouku mělčí s náplavem; `terrain-material.ts` míchá 11 textur podle splat map
  (`ground-layers.ts`, dno potoka podle proudu: štěrk, písek, bahno) pluginem pro GLSL i WGSL –
  i se stínem je to 15 samplerů, WebGL 2 zaručuje 16 (další vrstva = pole textur). Vrstvu
  shader čte **jen při nenulové váze** v pixelu (`terrain-shader.ts` – kód GLSL i WGSL z jedné
  tabulky, `textureGrad` / `textureSampleGrad` s derivacemi x, z spočtenými před podmínkami;
  obvykle 2–4 vrstvy z 11). Novou vrstvu přidat do `TERRAIN_LAYER_SLOTS`. Louky podle
  tvaru terénu (`buildRelief` z jádra): kamenitá půda a skalní výchozy kde je prudký svah nebo
  ostrý hřbet (`rockinessAt`, jako útesy 0 A.D. podle sklonu), sušší tráva na svazích ke slunci
  (`SUN_RAYS` v jádru, stejný směr jako `SUN_DIRECTION` scény), ostrůvky kvetoucí louky.
  Hranici lesa vyhlazuje a zvlňuje `buildForestField` (jádro, znaménková vzdálenost od
  hranice). **Scéna kreslí stromy, keře a kameny z vrstvy překážek** (`obstacle-scenery.ts`
  je rozdělí na 3D stromy, impostory a dekorace; rozmisťovače jsou v `landscape/obstacles/`).
  **Okraj lesa** jsou 2–3 husté řady 3D stromů z 0 A.D. (`forest-trees.ts`, do 18 m od
  hranice) + lem a ojedinělé stromy v louce; **vnitřek** (od 10 m) jsou impostory (`impostors.ts`) –
  desítky tisíc svislých obrázků stromů z atlasu vyrenderovaného pod pevným náklonem kamery,
  natáčejí se jen při změně směru kamery. Jejich začátek musí z každého směru zakrýt 3D stromy.
  Skladba druhů je jedna funkce pro obojí (`species.ts`): okraj světlomilný (dub, bříza,
  buk), uvnitř buk, dub, trochu břízy a jedle ve skupinách (výš víc) – Martin. **Stromy mimo
  les** (`meadow-trees.ts`, jen 3D): osamělé duby a jilmy v loukách (parkové i volné části)
  a břehový porost topolů a jilmů podél potoka; `woodland.ts`: borovice na skalách
  a suchých hřbetech, mladé stromky ve skupinkách před lesem, souše, padlé stromy a pařezy
  u vesnice; `rocks-shrubs.ts`: keře, kameny, balvany, skalní výchozy a vrby. V lese se kreslí tráva, ne lesní půda (Martin),
  pod stromy ztmavená. Tmavá plocha korun (`forest-canopy.ts`)
  jen vyplňuje mezery hluboko v lese. PBR materiály se oparem musí volat `applyGammaFog`
  (`gamma-fog.ts`) – vestavěný opar PBR zešedí zeleň. **Změna náklonu kamery (`BETA`
  v `camera.ts`) nebo modelů stromů = nový render atlasu** (`tools/blender/impostors.py`)
  a přepis hodnot v `impostor-atlas.ts` – **letního i zimního** (`impostors.py … winter`:
  listnáče holé – listí z textur zmizí podle barvy, zbudou kmeny, větve a řídký závoj
  větviček –, smrky se sněhem; buňky vyjdou stejné, výřez se počítá ze stromu s listím).
- **Dekorace** (`decorations.ts`): překážky z vrstvy (keře, kameny, skalní výchozy naklopené
  podle svahu, souše, padlé stromy, pařezy, vrby) a ozdoby vody bez herní funkce
  (`decor-placement.ts`: rákos, orobinec, lekníny, kmeny v potoce – zůstávají ve scéně). Modely
  načítá `instanced-model.ts` (thin instances, s id překážek), převod z 0 A.D. přes
  `tools/blender/decor.json`.
- **Ořez podle záběru po čtvercích** (`scenery-chunks.ts` čisté funkce, `scenery-culling.ts`
  adaptér): krajina 16 × 16 čtverců po ≈ 120 m (`SCENERY_CHUNKS`). Každý mesh s nehybnými
  instancemi (`setStaticInstances`, jméno `trees-` / `decor-` / `impostors-` / `felled-` /
  `pathside-` – `CULLED_MESHES`; i les vsi, pařezy a stromy u cest, které se mění) dostane klon
  pro kameru `view-<jméno>` (sdílí materiál – roční období platí dál –, ale má **vlastní kopii
  geometrie**: Babylon drží buffery thin instances na geometrii, sdílená by kreslila buffer
  zdroje; změny vrcholů zdroje – natáčení impostorů – se do kopie přenesou), do jehož
  bufferu se před snímkem nakopírují jen instance čtverců, jejichž obal je v záběru; draw cally
  zůstanou (jeden na model), ve výchozím pohledu ≈ 3 % trojúhelníků (0,3 M místo 10 M). Původní
  mesh se všemi instancemi kreslí **jen stínová mapa** (`SHADOW_ONLY_LAYER` – kamera ho
  přeskočí, stínový generátor vrstvy nekontroluje), takže stíny jsou jako dřív. Obaly čtverců
  se pro ořez převádějí světovou maticí meshe (`transformBounds` – i mesh pod rodičem). Nový renderer
  instancí stromů a keřů: instance přes `setStaticInstances` (ne `thinInstanceSetBuffer`)
  a jméno s předponou z `CULLED_MESHES`, vypínat zdroj (`setEnabled`) – klon ho následuje.
  Impostory mají obal přes všechna natočení (`localBounds`). Měření bez prohlížeče:
  `npx tsx apps/web/scripts/measure-scenery-culling.ts` (8 × 8 dá 4,8 %, 32 × 32 1 % – ale
  dražší testy obalů při oddálené kameře).
- **Změny krajiny vsi ve scéně:** `SceneVillage.obstacles` (`removed`, `stumps`, `saplings` –
  id) skryje `InstanceHider` podle id (3D stromy, impostory i dekorace krajiny – jen meshe
  z `addTrees` / `addDecorations` / `addImpostors`, ne les vsi); ozdoby bez id skrývá pod
  stavbami a poli podle tvaru. Skrytí jde do zdroje (stín) i přes `onApply` do ořezu (klon
  kamery). Na místo pokáceného stromu dá `felled-trees.ts` pařez,
  po TREE_SAPLING_AFTER_YEARS mladý stromek. **Vymýcený les** (`cleared-forest.ts`, čistý
  modul): maska po políčkách ze stavu vsi – políčko lesa bez aspoň poloviny dospělých stromů
  nebo pod založeným dílem pole, a paseky pod stavbami v lese přesně podle tvaru
  (`ClearedForest.areas` – vyklízené plochy obydlí a dílen s pruhem pod korunami
  `forestClearingsOf` z jádra, natočené pozemky, modly a svatyně; `clearingDistance` měří
  i k nim). Plocha korun nad pasekou zapadne pod zem
  (`ForestCanopy.setCleared` mění jen výšky vrcholů, klíč i z `clearedAreasKey`), ztmavení trávy se přepočítá bez skrytých
  stromů do modrého kanálu splat textury (`TerrainMaterial.setHiddenTrees` – žádný sampler
  navíc), stínová mapa se jednou překreslí a minimapa kreslí vykácený les jako paseku. Vše jen
  při změně (`applyVillage`).
- **Světlo:** letní slunce a obloha podle 0 A.D., kontrast 1,1. **Stíny od slunce**
  (`sun-shadows.ts`) – stínová mapa 4096 přes celou krajinu se vykreslí jednou; vrhají je meshe
  pojmenované `trees-*`, `impostors-*` a `decor-*` (při přejmenování zachovat prefix). Znovu se
  kreslí **jen při změně vrhačů** (`castersChanged`: stavby a pole vsi, skryté stromy, pařezy,
  klády, stromy u cest přes `refreshShadows`) – ne kvůli zvířatům, lidem, ztmavení trávy, ploše
  korun ani nové síti pěšin.
- **Roční období** (jen vzhled, žádná pravidla): `season-look.ts` (čisté funkce, testy) z dne
  v roce spočítá sníh, led na vodě, suchou / svěží trávu, množství, podzimní barvu a mladost listí, květy,
  světlo, opar, vodu a zvuky – plynulé přechody 2–5 týdnů, **léto (`REFERENCE_DAY`) je
  výchozí vzhled a nesmí se měnit**. `LandscapeScene.updateSeason` se jednou za sekundu podívá
  na herní datum (celé dny, svět mimo běh = léto) a jen při znatelné změně nastaví světlo,
  opar, vodu, zvuky a uniformy a jednou překreslí – vzhled se mění nejvýš jednou za herní den.
  Shadery v `season-materials.ts` (GLSL i WGSL, bez textury navíc – šum je procedurální):
  terén (tráva podle vah vrstev, sníh podle šumu a sklonu, ne na dně potoka), obtisky vsi
  (`applySeasonGround`), PBR stromy a dekorace (`applySeasonModel` podle jména modelu –
  druhy v `season-foliage.ts`: listnáče se barví a opadávají, z koruny zbudou větvičky, kůra
  ztratí zelený tón; jehličí a kameny pod sněhem; rákos stojí suchý; trnka a jabloně kvetou),
  střechy (`applySeasonSnow`), tvary na zemi se StandardMaterial (`applySeasonRelief`) –
  mohyly a staré hroby hřbitova, zarostlé i čerstvé, a kůl vojvody jen poprášený
  (Martin, 19. 10. 2026: „V zimě by i mohyly na hřbitově měly zapadat sněhem.“): šum a sklon
  `seasonSnowSlope` jako terén, sníh až po osvětlení nasvícený jako terén, bez vlastní barvy
  a okolního světla materiálu. Impostory (`applySeasonImpostors`) mají druhý sampler se
  zimním atlasem (stahuje se souběžně, nečeká se na něj): listnáč s opadem listí přechází po
  pixelech na holý obrázek, smrk se sněhem na zasněžený; podzim barví letní obrázek. Plocha
  korun s opadem po skvrnách mizí – v zimě je pod holými stromy vidět zasněžená zem (u kmenů
  místy prosvítá, stín stromů slabší). Nový model stromu nebo keře = záznam v
  `seasonFoliageFor`. **Led** (`water-ice.ts`, čisté funkce, testy): jde za sněhem – v prosinci
  zamrzá stojatá a pomalá voda (tůně, klidné úseky; rychlost proudu jako ve shaderu vody)
  a okraje u břehů, kde proud slábne, rychlý proud zůstane otevřený s ledem podél břehů;
  v březnu roztaje. Shader hladiny počítá totéž (konstanty odsud, led v uniformě `seasonB.w`,
  šum procedurální): na ledu stojí vlnky, leží sníh se skvrnami holého ledu. Ryby pod ledem
  zmizí a nehýbou se (`Fauna.setIce`, `FishSchool.iceFlow`), potok je pod ledem tišší
  (`frozenShare` v `ambient-mix.ts`). Stínová mapa listí nezná – pod 30 % listí 3D listnáče
  (`isDeciduousMesh`) ze stínové mapy vypadnou a impostory dostanou do `diffuseTexture` zimní
  atlas (stín kmenů a větví), mapa se překreslí jednou. Vývojový náhled má posuvník dne v roce
  a „přehrát rok“ (`setSeasonDay`).
- **Ukazatel načítání:** `setLandscape(landscape, onProgress)` hlásí kroky přípravy a mezi
  náročnými kroky pustí prohlížeč překreslit; `GameView` ukazuje `SceneLoading`.
- **Zvuky** (podle 0 A.D.): `ambient-mix.ts` (čisté funkce, testy) spočítá z cíle a přiblížení
  kamery hlasitost vrstev – ptáci dne, zpěv ptáků u okraje lesa, vítr v listí, potok jen kde
  teče přes oblázky (štěrkové dno z `bedMix`, Martin), střední / rychlý podle `speed`.
  `ambient-sound.ts` je přehrává přes Web Audio (bez Babylonu):
  soubory stahuje až po přípravě scény, mix mění jen při pohybu kamery, zvuk pustí po prvním
  gestu (pravidlo prohlížečů), ve skrytém panelu uspí. Stav nese `canvas[data-sound]`, přepínač
  v horní liště hry (`hud/TopBar.tsx`, ve vývojovém náhledu `SoundToggle`; volba v localStorage). Soubory Opus/WebM v `public/audio/ambient/` (převod
  `tools/audio/ambient.sh` – smyčky mají délku N + 312 ≡ 0 mod 960, viz `loopRegion`).
- **Zvířata** (podle 0 A.D., jen ozdoba): hejna ryb kroužících v tůních a klidné hluboké vodě,
  hejna vran nad loukami u lesa a jedno káně. Kde jsou, určuje `fauna-placement.ts`, jak se
  hýbou `fauna-motion.ts` (čisté funkce skutečného času, ne herního – testy); `fauna.ts` je kreslí jako instance (mesh
  `fauna-*` na druh – ne vrhač stínu). Mávání křídel a mrskání ocasem je přechod mezi třemi
  pózami z animací 0 A.D. (morph targety GLB z `tools/blender/fauna_from_0ad.py`) ve vertex
  shaderu (GLSL i WGSL). **Výjimka z kreslení jen při změně jako voda:** hýbou se jen skupiny
  v záběru, sdílejí `WATER_FPS`, při omezeném pohybu stojí. Ryby se kreslí po vodě (skupina
  vykreslování 1) – hloubku pod kalnou hladinou dělá jejich průhlednost.
- **Domácí zvířata** (skutečná stáda – diet.md, od 18. 10. 2026): počty ovcí, koz, prasat
  a krav bere scéna ze `SceneVillage.livestock` (`herdCounts`; krávy v zimě v ohradě nejsou
  na pastvě, stádo ovcí a koz nejvýš 20 kusů); bez nich se odvodí z domácností jako dřív:
  slepice u hotových obydlí (zemnice 2, polozemnice 3 – `chickensFor`), na obývané obydlí
  3 ovce, koza a 2 prasata, kráva na dvě domácnosti; ohrady jsou pro stáda překážka; u stád jsou pasáčci z postav
  (Postavy níž – `herdViews`).
  `livestock-placement.ts` je odvodí z dat vsi pro scénu (`SceneVillage`, i nepovinné
  `cemeteries`) a krajiny: slepice obcházejí dům mimo obdélník domu se šíjí (`chickenBox`),
  ovce s kozami (stádo na 5 domácností) a krávy se pasou **přednostně na úhoru vsi, kam je jádro
  posílá** (`SceneFieldPart.grazed`; louka na seno jen po seči na otavě, srpen až listopad:
  `grazeablePart`, `grazingDay` z rozdělení práce; strniště po sklizni ano), jinak na louce do
  300 m (ne osetý díl, louka letošní seče před sečí – `hayMeadows`, `grazedMeadow` –, sad,
  záhony pozemků, hřbitov, obydlí, voda, skála, prudký svah). **Vždy s pasákem** (Martin:
  „Stáda domácího zvířectva se nesmí potulovat sama. Vždycky s nimi musí být nějaký
  člověk. Ten je bude primárně vodit na louky, určené ke spásání. Domácí zvířata by neměla spásat
  jídlo pro lidi ani ho pošlapat a na čerstvém úhoru toho k pastvě také asi moc není.“ – mění
  dřívější „mladý úhor vždy“): na pastvu jde jen tolik stád, kolik je dnes pasáků
  (`herderCount` – výrostci z `SceneLabor.herders`, ve starších datech i starší a dospělí po
  člověkodnech `herding`; bez údaje neomezeně), málo pasáků → pasák vede víc zvířat (`tendedHerds`); stádo bez pasáka
  (`Herd.tended` false) stojí u domů s trasou o jedné pastvině; v zimě ovce, kozy a krávy u domů,
  s pasákem jen prasata. Stáda s pasákem jsou v plánu napřed – pasák `k` patří ke stádu `k`
  (`herderKinds` dostane jen jejich počet). Prasata na okraji lesa (−7 až +5 m od hranice, hlouběji je
  zakryjí koruny) do 150 m (jinak do 260 m), nejbližší vhodný okraj první – za lesem po otočení
  kamery zmizí, to nevadí (Martin). Dotazy „bod na čtverci“ jdou přes přihrádky (`squareLookup`)
  a sousední pastviny trasy z přihrádek – u pole s tisíci díly by průchod všemi trval sekundy;
  rozmístění je stejné (zlatý otisk v `livestock-golden.test.ts`). **Pohyb běží ve skutečném čase, ne v herním** – ve
  zrychleném světě zvířata „běhala jak na koksu“ (Martin); scéna dosadí epoch ms
  (`livestockClock`), stejný okamžik = stejná póza. Stádo je na pastvině své trasy (sousední
  pastviny) 3–9 minut a pak se za pevnou dobu krokem přesune na další, tam a zpět
  (`livestock-motion.ts`); během přesunu má každé zvíře vlastní čas zastavený (`pausedS`),
  chůze se nesčítá. Po přepočtu vsi zůstane stádo na své pastvině, když ji nová trasa má
  (`keepRouteSpot`). Zvíře se desítky sekund pase / zobe / ryje nebo stojí a popojde pár metrů
  krokem (≈ 0,6–1 m/s) – čisté funkce času, deterministicky. `livestock.ts` (`VillageLivestock`, háček v
  `landscape-scene.ts`) je kreslí jako fauna: mesh `livestock-*` na druh, krok (parabola přes
  dvě pózy) a hlava dolů (třetí morph target) ve vertex shaderu, výška a náklon podle terénu.
  Textury z GLB (dobytek, ryby i ptáci – `loadGeometry` ve `fauna.ts`) se čtou v barvách
  obrazovky (glTF bez sRGB bufferů) a StandardMaterial je kreslí bez převodu jako 0 A.D. – se
  sRGB čtením by GPU barvy převedlo do lineárních a zvířata by ztmavla (WebGPU i WebGL 2).
  Modely v `fauna.json` (ovce, koza, kráva, prase, slepice) jsou ve
  skutečné velikosti, ve scéně stylizovaně větší (`SCALE`). Terén pro zvířata je rastr 4 m
  kolem vsi (`livestockGround`) – přepočet jen při změně obydlí, polí nebo hřbitovů.
- **Ves** (`village-renderer.ts`): obydlí stojí nad skutečnou jámou – terén a obtisky se v ní
  prořezávají (`pit-cut.ts`, discard ve fragment shaderu podle pole uniform, ne textury – terén
  už má 15 samplerů), stěny, dno a schody šíje kreslí `dwelling-pit.ts` (ornice, podloží a stín
  okraje ve vrcholech). Rozměry jam a šíje musí sedět s `tools/blender/dwellings.py`.
  Staveniště jde po fázích (`village-construction.ts`, ≥ 8 fází, průběh 0–1) z dílů
  `construction.glb` v instancích. U obydlí **není hráň polen** (Martin: tak vyskládané dřevo
  tehdy neměli, navíc na dešti) ani samostatný kus pleteného plotu vedle polozemnice (Martin).
  **Pozemek polozemnice** (Martin, 18. 10. 2026): celé políčko krajiny (15 × 15 m, v mřížce
  jako čtverec pole) obehnané polským plotem, dům uprostřed nebo v jednom ze 4 rohů (5 variant,
  vchod vždy k brance na přední straně −z, natočení π), ve zbytku záhony a cestička od branky
  ke dveřím. Jádro: `DwellingPlot` (`cell`, `variant`) na obydlí i stavbě (nepovinné – starší
  polozemnice dostanou pozemek při načtení vsi: `withPlots` v `plots.ts`, jednou – `plotsMigrated`,
  políčko pod středem domu, když je volné, varianta `nearestPlotVariant`, dům se posune jen do 2 m;
  na obsazeném políčku až přestavbou na nejbližším volném do 50 m – `relocationPlot` (bez polí
  a sadů – `takeLand: false`), proto `advanceVillage` dostává krajinu), `PLOT_TYPES`,
  `PLOT_VARIANTS`, `PLOT_HOUSE_OFFSET_M`, `plotHousePosition` a `checkPlotPlacement`
  v `placement.ts` (louka nebo les – les se vyklučí, viz Ves – Stavba v lese –, bez výchozu, bez posvátného dubu a čtverce háje, dům ne pod korunou
  dubu, nezabrané hřbitovem ani jiným obydlím či pozemkem – čtverec pole či sadu smí, viz Ves –
  Obydlí na poli a v sadu –, rovno jen pod domem, `spared` vždy prázdné; překážky celého
  políčka jako u čtverce pole, stromy dají klády); `dwellingPlot` zabírá celé políčko
  a `placeDwelling` u polozemnice pozemek vyžaduje (`NO_PLOT`). **Pletený plot** je jeden pro
  celou hru – polský plot pozemku i proutěný plot hřbitova (Martin): `woven-fence.ts` bez
  Babylonu (`wovenFence` podél čar s ohrazením vlevo – **všechny rohy zakulacené**, vnější
  poloměr 1,25 m, vnitřní roh tvaru L 0,5 m, kůly nejvýš po kroku i po oblouku, branka na rovném
  úseku nejblíž k cíli; `fenceStage` – kůly, pak větve zdola, střídavě vně a uvnitř kůlu), hustota
  je `FenceStyle` (`PLOT_FENCE` 7 větví, `CEMETERY_FENCE` 11 větví a širší branka). Kreslí ho
  jeden `WovenFenceRenderer` (`woven-fence-renderer.ts`, vlastníci `set` + `commit`) v instancích
  z `models/dwellings/woven-fence.glb` (kůl, kůl branky, kus větve 1 m natažený od kůlu ke kůlu –
  `woven_fence_parts` v `dwellings.py`, poloviční atlas). Pozemek: rozmístění bez Babylonu
  `homestead-layout.ts` (záhony, rostliny, cestička, `plotStage` podle stavby), kreslí
  `homestead.ts` v instancích z dílů `models/dwellings/homestead.glb` (záhon 1 × 0,8 m natažený
  na délku, zelí, řepa, cibule, kopr – `homestead_parts`, oblasti atlasu `veg` a `soil`); každý
  díl stojí na terénu sám. Fáze polozemnice po hřebeni: `fence` (kůly, pak větve zdola)
  a `beds` (`ConstructionState.plot`). Umisťování: režim `plot` (políčko pod kurzorem, [ a ]
  otáčejí celým pozemkem, Tab přepíná variantu), vytyčení při 0 % kolíky a provázkem kolem pozemku
  (`plotStakingLine`), výběr i kliknutí kamkoli na pozemek označí celé políčko, rekvizity
  staveniště rohového domu se zrcadlí dovnitř (`sitePropPlace`), slepice zůstávají uvnitř
  plotu, cizí ani lidé do pozemku nechodí, hromada klád leží za plotem. **Natočený pozemek**
  (Martin 18. 10. 2026, varianta a – viz Ves – Natočené stavby): `DwellingPlot.square` (střed
  na cm, natočení po 15°; `cell` = políčko pod středem), [ a ] otáčejí celým pozemkem, **Tab**
  (Shift + Tab zpět) přepíná variantu; bez natočení a po 90° se přichytí na políčko pod kurzorem
  (`rotatedPlot` / `canonicalPlot` – ukládaná podoba stejně v prohlížeči i na serveru).
  `homesteadLayout` natočený pozemek rozmístí v jeho osách a otočí do světa (`HomesteadLayout.rotation`
  – záhony v instancích natočené), `insidePlot`, `plotStakingLine`, `plotFenceCorners` v osách
  pozemku, `ScenePlot.rotation`. Dílny z polozemnice
  (hrnčíř, kovář) pozemek nemají – stojí volně jako dřív. **Hřbitov** (`cemetery-renderer.ts`,
  geometrie bez Babylonu v `cemetery-layout.ts`): nízký pletený plot po obrysu čtverců (sdílený
  pletený plot, zakulacené rohy) s brankou k nejbližšímu hotovému obydlí (při rozšíření jinam
  zůstane; místo branky = vchod z jádra `cemeteryEntrance`, paths.md – Vchody), uvnitř mohyly
  podle významu (`SceneVillage.cemeteries[].mounds` – místo, velikost, `fresh` první rok –
  `FRESH_MOUND_DAYS`; `moundPlacements` se středem z jádra `gravePlaceCenter`, tvary
  `MOUND_SHAPES`: malá dítěte, běžná, podlouhlá hlavy rodiny po řadách, největší vojvody
  a jeho ženy s dřevěným kůlem; sítě po vzhledu a velikosti) a staré hroby (`graves` – pohřbení před
  mohylami, mřížka 7 × 8 po řadách jako dřív, `gravePlacements`, čerstvé jen bez mohyl);
  založení vytyčení (kolíky a provázek po ostrém obrysu) → kůly → pletení; rozšíření ve stavbě
  má vlastní kus plotu bez branky jen tam, kde plot ještě není (na starý jen navazuje), po
  dokončení plot obepne celý hřbitov.
  **Sad** (`orchard-renderer.ts`, bez Babylonu `orchard-layout.ts`): jabloně z 0 A.D.
  (`models/trees/apple-1…4.glb`, s plody `apple-fruit-1…4.glb` – převod
  `tools/blender/orchard.json`, textura bez plodů `apple_leaves.py`, zralá `apple_ripe.py`)
  v pravidelných řadách (mřížka 7,5 m, 4 na čtverec, řady přes celý sad – Martin); výsadba čáry
  vytyčení po obrysu a podél řad → kůly → sazenice po řadách, mladé stromky u kůlu
  rostou 12 let, na skalním výchozu z vrstvy překážek strom chybí. Velikost (`growth`) a jablka
  (`fruit`, srpen až sklizeň) počítá server (`lib/orchard-look.ts`) v `SceneVillage.orchards` –
  háček pro podzim; květ, podzimní listí a holé koruny dodají roční období (`applySeasonModel`
  podle jména `apple*`, meshe `orchard-*` jsou v zimě mezi holými vrhači stínu). Modely se
  načtou až s prvním sadem.
  Dým z dýmníku (`village-smoke.ts`, sprity) podle rozvrhu ohně za herní den (`smoke-schedule.ts`, deterministicky) – hýbe se jen v záběru, ve stejném
  taktu `WATER_FPS` jako voda, při omezeném pohybu stojí.
- **Posvátná místa** (happiness.md, `SceneVillage.sacred`; modely `tools/blender/sacred.py`,
  licence v `public/models/sacred/LICENSES.md`): `sacred-renderer.ts` (`SacredRenderer`
  ve `VillageRenderer`, inkrementálně) kreslí obětiny u kmene ušetřeného posvátného dubu
  (`models/sacred/oak-offerings.glb`, počátek v ose kmene; živý dub se nikdy neskrývá – není
  v `obstacles.removed`; dub i obětiny se postupně zvětší – `SceneSacred.oaks[].growth`
  z `lib/sacred-look.ts`, jen vzhled, po herních letech, strom zvětší `InstanceHider` přes
  `scales`; uschlý dub `SceneSacredOak.snag` – strom skryje `applyVillage` podle id a místo něj
  stojí souš `models/decor/snag-oak.glb` s obětinami, padlá souš `SceneSacred.fallenOaks` –
  padlý kmen `fallen-1.glb` bez obětin, rozměry `sacredSnagInstance` / `fallenOakInstance`
  v `sacred-layout.ts`), hraniční kameny a oltář na okraji čtverců háje (`grove-stones.glb`,
  uzly `stone-a`, `stone-b`, `altar`), hotovou modlu a svatyni (`idol.glb`, `shrine.glb`, počátek
  uprostřed půdorysu, předek +Z) a staveniště z dílů `idol-construction.glb` /
  `shrine-construction.glb` (uzly `modla-…` / `svatyne-…`). Fáze a díly staveniště jsou jen
  v `village-construction.ts` (druhy `modla`, `svatyne` – `constructionState`; kružnice
  vytyčení a ušlapaná tráva podle `ROUND_SITE_M`, u svatyně jen uvnitř příkopu do 9,8 m).
  **Vytyčení kolíky a provázkem je vidět hned od průběhu 0** (Martin: „Když někde zadám stavbu,
  ať se hned vytyčí provázkem a kolíky“). Sítě modly a svatyně se kladou na terén po vrcholech
  (terén + 3 cm) – příkop svatyně tak na svahu nezapadne a terén se neprořezává. Dým stoupá
  z prázdných uzlů `fire-1…8` hotové svatyně (`loadMergedModelWithNodes`) jako z obydlí
  (`VillageSmoke`). **GLB s víc meshi načítat po dílech** (`loadModelParts`) – `loadMergedModel`
  spojením pokazí ořez stěn; oba načítače nastavují i `mesh.sideOrientation` (loader glTF
  materiálu dílů stranu po načtení vrátí na výchozí a jednostranné plochy by zmizely).
  Nenačtený GLB nahradí tvary z `sacred-fallback.ts` (jedno varování na soubor). Duch při
  umisťování (`PlacementMode` `sacred`), výběr (`village-picking.ts`: obydlí → modla/svatyně →
  posvátný dub → čtverce), zvýraznění, značky na minimapě (`sacredMinimapMarks`), stavitelé
  u staveniště (`villager-plan.ts`) a jabloně sadu se vyhnou koruně posvátného dubu. Vývojový
  náhled má tlačítka Modla, Svatyně, Ukázka svatyní a „Mýtit les s posvátným dubem / hájem“;
  náhled staveb (/dev/buildings) kreslí modlu a svatyni po fázích svým potrubím.
  **Rozpad opuštěné modly a svatyně** (abandonment.md, `structure-decay.ts` – čisté funkce,
  testy): stupeň `structureDecayStage` jako u obydlí (≥ 70 / 45 / 20 %), díly `sacredDecayParts`
  – celá navštěvovaná = hotový model, opuštěné svatyni vyhasnou ohniště hned (díly staveniště
  a `shrine-fires-cold`, bez dýmu), sešlá zšedlá modla s mechem bez obětin, nakloněná a rozpadlá
  se kloní (`sacredLean` – ≈ 12° a 28°, směr podle id; `leanPoint` posune vrcholy před položením
  na terén) a zarůstá; zbytek `sacredRuinParts` (padlá modla u pahýlu zapadá do trávy, příkop
  svatyně se srovná – `heightScale`). Díly `models/sacred/sacred-decay.glb` z `sacred.py` (čtvrtý
  argument `decay`; načtou se až s první chátrající stavbou, do té doby nejbližší díly
  staveniště – `DECAY_SUBSTITUTES`); zarostlá plocha a příkop svatyně dostanou ve scéně trávu
  terénu po světových souřadnicích (`overgrow`). Plot opuštěného hřbitova a ohrady `decayFence`
  podle `fenceDecayAmount` (po dvacetinách), mohylky zarůstají a slehnou se s ním; spadlý plot
  hřbitova (stav 0 – `cemeteryFenceGone`) zmizí úplně, zůstanou
  jen mohyly (Martin, 19. 10. 2026). Náhled:
  /dev/buildings tlačítko **Rozpad staveb** (modla, svatyně, hřbitov, ohrada – stejný posuvník
  ▶ Rozpad jako obydlí, `showcaseAbandoned`), přepínač **Oprava staveb** (posuvník = průběh
  opravy – `showcaseRepair`). Opravovaná svatyně (`SceneSacred.buildings[].repairing`) má ohniště
  studená až do konce opravy (`sacredDecayParts(…, cold)`, bez dýmu).
- **Řemeslné dílny** (ve hře od 18. 10. 2026, pravidla v [docs/design/crafts.md](docs/design/crafts.md),
  jádro a rozhraní viz Ves – Řemesla): `public/models/crafts/`
  hrnčíř, kovář a tesař (polozemnice s přístřeškem o `PORCH` 3,6 m vpředu, pod ním pec / výheň
  s kovadlinou, u tesaře kozlíky s otesávaným trámem, špalek se sekerou, kola a zásoba trámů –
  wagons.md), uhlíř (zemnice s mechovou střechou) a samostatný milíř ≈ 9,5 m od ní
  (`MILIR_OFFSET` v `tools/blender/crafts.py` = `MILIR.offset` v `rules.ts` jádra – podle něj
  stojí milíř i ve hře). Tvary bere `crafts.py` z `dwellings.py` (ten má proto
  `if __name__ == "__main__"`), sedí do jam obydlí (hrnčíř, kovář, tesař = polozemnice, uhlíř =
  zemnice).
  Atlas: `tools/blender/craft_atlas.py` (atlas obydlí + pec, kámen, zem milíře, uhlí…; varianta
  `atlas-moss.jpg` s mechem místo slámy). Postup v hlavičce `crafts.py`, ikony
  `icons.py hrncir,kovar,tesar,uhlir`.
  **Fáze stavby** řemesel: `village-construction.ts` má tabulku fází pro každý druh
  (`ConstructionKind` = obydlí + `CraftKind`; dílny na fázích svého obydlí + přístřešek, pec /
  výheň / tesařské pracoviště `carpentry`, dílna, uhlíř mech místo došků, milíř zvlášť), díly
  v `public/models/crafts/construction.glb` a `construction-moss.glb` (předpona druhu). Obydlí se
  tím nezměnila. **Tesař** (`tesar`, díly `tesar-trestles` / `-beam` / `-block` / `-beams` /
  `-wheels` / `-chips`) je ve scéně hotový – model, staveniště, místa řemeslníků (`modelSpots`),
  bez dýmu (`modelVents`), ušlapaná tráva i pod přístřeškem (`hasPorch`, `PORCH_WORKSHOPS`);
  řemeslo `carpenter` (Ves – Tesař a vozy) má `CRAFT_MODEL.carpenter = 'tesar'`.
  Dílny bez hráně polen: hrnčíř a kovář mají místo dílu `wood` díl `yard` (koše), uhlíř
  volnou hromadu polen na milíř (`log_heap` v `crafts.py`).
  **Náhled všech staveb** bez databáze: http://localhost:3010/dev/buildings (`building-showcase.ts`,
  staveniště `showcase-sites.ts`, posuvník a přehrání stavby; v produkci 404). Za řadou staveb
  pole, hřbitov a sad po čtvercích – kreslí je herní `VillageRenderer` (bez obydlí) podle
  `showcaseGrounds` v `building-showcase-layout.ts`: pole zakládání → brázdy → osev, pak jen
  jako náhled zelené a zralé obilí a strniště (`CropLook` / `crop` dílu v `SceneVillage`, server
  ho zatím neposílá), hřbitov vytyčení → kůly → plot → přibývající mohyly podle významu
  (`showcaseMounds` – místo vybírá jádro), sad vytyčení → kůly
  → sazenice → rostoucí stromky → jablka. Vpravo vzadu dílna tesaře a pahorek s vozy (**Vozy**,
  **Další vůz zblízka**, **Sledovat vůz** – Vozy se spřežením níž).
- **Grafika (licence):** CC0, nebo z **0 A.D.** pod **CC BY-SA 3.0** (textury terénu, stromy –
  uvést Wildfire Games, upravené soubory pod stejnou licencí). Zdroj a původní název každého
  souboru do `LICENSE.md` / `LICENSES.md` vedle něj. Převod stromů, atlas impostorů a render
  textury korun: `tools/blender/` (headless Blender 5, `blender -b --factory-startup --python …`).

## Ves (hratelný prototyp)

Pravidla v [docs/design/population.md](docs/design/population.md),
[docs/design/fields.md](docs/design/fields.md), [docs/design/cemetery.md](docs/design/cemetery.md),
[docs/design/orchard.md](docs/design/orchard.md) a [docs/design/crafts.md](docs/design/crafts.md),
rozhraní částí v
[docs/superpowers/plans/2026-10-17-village-slice.md](docs/superpowers/plans/2026-10-17-village-slice.md).

- **Jádro** `packages/game/src/domain/village/` (simulace, umístění `placement.ts`, souhrn
  `summary.ts`), use-casy a port `VillageRepository` v `application/`, tabulka `village`.
  Ves se dopočítá při každém načtení a akci (worker zatím není).
- **API jádra:** `foundVillage` (4 lidé, zásoby, stavba první zemnice, volitelně první pole),
  `advanceVillage(state, toDay)` (dopočítá ves do dne včetně) a akce hráče `startNewDwelling`,
  `startWorkshop`, `foundField`, `foundCemetery`, `foundOrchard`, `foundPen`, `startTrail`
  a `startExpedition` (trade.md); spřežení se cvičí samo (`trainTeamsWhenReady`). Stav
  vsi je JSON-serializovatelný, funkce vstupní stav nemění. Nové části stavu jsou volitelné
  (`VillageState.cemeteries?`, `orchards?`, `applesKg?`, `orchardWork?`, `starvationDays?`,
  `extinctDay?`, `crafts?`, `Dwelling.workshop?`, `livestock?`, `meatKg?`, `cheeseKg?`,
  `legumesKg?`, `hay?`, `pens?`, `diet?`, `ruins?`, `woods?`, `FieldPart.overgrowthYears?`,
  `manorId?`, `trails?`, `trade?`, `DwellingPlot.yard?`, `Construction.trail?`, `carts?`,
  `CraftStocks.woodToolsKg?`, `Workshop.timber?` / `cart?`) – vsi
  `sacredRuins?`, `SacredBuilding.wear?`, `Cemetery.fenceWear?`, `Pen.wear?`) – vsi
  uložené dřív se načtou a beze sadů či dílen se jejich stav nemění.
- **Pořadí práce dne** (population.md a fields.md – Práce; Martin 19. 10. 2026: „pokud se něco
  staví, tak čas věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla
  hlad“): pracovní síla vsi = dospělí (`laborPerDay`); starší kryjí jen denní minimum své
  domácnosti (`adultDailyMin`, `householdElders` – přebytek propadne), výrostci 7–13 let pasou.
  Denní minimum domácnosti nese **přirážku za chůzi pro vodu** (paths.md – Pochůzky pro vodu,
  Martin 19. 10. 2026): `householdWaterLabor` / `waterFetchingLabor` z `Dwelling.waterWalkM` –
  cesty (`WATER_FETCHING` 0,4 na člověka) × 2 × (chůze − 100 m) ÷ 1 m/s ÷ 10 h; starší ji kryjí
  jako zbytek minima, i v plánu osevu (`sowingCapacity`) a v dílnách (`workshopLabor`); bez
  krajiny 0. `allocateDay`: denní minimum → výpravy (`away`) → potřebné sezónní úlohy → `common` (volná práce
  v liště, `commonLaborHistory`) do staveb (`build`) → z toho, co stavby nespotřebovaly, opravy
  obydlí (`afterConstructions`) → zbytek (místo pro polní práci navíc – fields.md, Osev navíc)
  propadne. Zvířata a domácí výroba (`DOMESTIC`) jdou bokem – jen `LaborDay.aside` pro postavy;
  `domesticBacklog` a přirážka paliva zmizely (starší vsi pole jen nesou).
- **Hlad a vymření** (population.md, Martin 18. 10. 2026): nahromaděný hlad
  `VillageState.starvationDays` (`nextStarvationDays` po jídle dne – pod 90 % přídělu
  přibývá, od 90 % ubývá, čísla `STARVATION` v `rules.ts`) přidá k běžnému riziku úmrtí riziko hladem
  (`deathChances` → `base` + `starvation`; úmrtí z části hladu má v kronice `cause: 'hunger'`).
  Hájení chrání dospělé i před hladem a drží hlad den pod prahem skupiny (`luckyStarvationCap`,
  uložený hlad nejvýš `LUCKY_STARVATION_CAP` = 19); ochrana posledních dvou dospělých už není. Poslední úmrtí → `extinctDay`
  a `village-extinct`; `advanceVillage` vymřelou ves dál nesimuluje (posune jen `lastDay`),
  doménové akce ji odmítnou. **Konec hry** (`extinction.ts`: `isGameOver` – hráč má vsi a žádná
  nežije, obecně pro víc vsí): use-case `dynastyStatus` (vsi aktivních sídel dopočítané do
  dneška) a `restartGame` (archivuje aktivní sídla přes `SettlementRepository.archive`, pak
  `enterGame` založí nové sídelní sídlo s novým seedem; se živou vsí `DYNASTY_ALIVE`,
  s `abandon: true` – nabídka hry, Martin 18. 10. 2026 – archivuje i živé vsi; bez vsi vrátí
  sídlo beze změny, takže opakovaný i souběžný restart založí jediné sídlo). Akce ve vymřelé vsi odmítá
  `updateLivingVillage` (`VILLAGE_EXTINCT`), přejmenování taky. Web: `VillageView.extinct` /
  `gameOver` / `starving` (konec hry zjistí `lib/village.ts` jen u vymřelé vsi), server action
  `restartGame` (bez vstupu po konci hry, `{ abandon: true }` z nabídky) a `hud/DefeatScreen.tsx`
  (Rod vymřel, jméno, roky, Začít znovu → `window.location.reload()` kvůli nové krajině). Scéna:
  neobývaná obydlí nemají dým ani zvířata a hlína u vchodu zarůstá (`ABANDONED_EARTH_ALPHA`).
  **Stupně hladu** (population.md – Hlad a vymření, Martin 19. 10. 2026): `eat` zapíše příděl do
  sklizně `VillageState.ration` (jen když ves šetří – `hungry`), `hungerLevel` v `summary.ts` →
  `VillageSummary.hunger` (`fed` / `rationing` 90–100 % / `hungry` pod `STARVATION.fedFrom` /
  `starving`) → `VillageView.hunger`, `VillageListItem.hunger`; upozornění „Ves šetří jídlem“
  (info), „Ves hladoví“, „Lidé umírají hlady“ – jen nejvyšší stupeň, ohlásí se při zhoršení (i
  z jiné vsi – `otherVillageNotices`).
- **Rozpad obydlí a zbytek jámy** (population.md – Co hráč vidí, Chátrání a přestavba – Po
  zániku; Martin 18. 10. 2026): jádro – `ruins.ts`: obydlí, které zchátrá na nulu
  (`decayEmptyDwellings`), nebo jehož přestavba ho přestěhuje na nový pozemek, zapíše
  `recordRuins` do `VillageState.ruins` (`DwellingRuin` – id, typ, poloha, pozemek, řemeslo, den
  zániku); `updateRuins` (krok dne v `simulateDay`) zbytky po `RUIN_YEARS` (10) odebere a zbytky
  pod stavbou (i rozestavěnou, s krajinou i pod čtverci a pozemky) taky; po akci hráče totéž
  `withoutBuiltOverRuins` v `updateVillage`. Jen vzhled – simulace ani kontrola umístění
  zříceniny neznají, na jejich místo jde stavět. Web: `SceneVillage.dwellings[].condition`
  (jen < 1) a `SceneVillage.ruins` (`overgrowth` 0–1 – `ruinOvergrowth`). Scéna:
  `dwelling-decay.ts` (čisté funkce, testy) – stupeň podle stavu `decayStage` (≥ 70 % celý, ≥ 45
  sešlý, ≥ 20 propadá se, pod 20 zřícený); rozpadá se jen prázdné obydlí (`dwellingDecayStage` –
  obydlené je vždy celé, i znovu osídlený zchátralý dům), `DECAY_LOOKS` (kryt jámy střechou, hlína
  u vchodu, plot a záhony pozemku, kopřivy),
  `ruinLook` (hloubka prohlubně, trámy `ruin` / `ruin-late`, kopřivy – po krocích 5 %),
  `ruinHollowData` / `ruinHollowY` (zarostlá prohlubeň – síť přes obdélník jámy s úzkým lemem za
  řezem terénu `ruinPitShape` bez šíje – jinak na okraji prosvítá obloha –, uvnitř nízký zarostlý
  val po okraji, který se s časem srovná; přední strana nahoru jako terén – hlídá test),
  `decayNettles`. Díly v `models/dwellings/decay.glb` z
  `tools/blender/dwellings.py` (pátý argument `decay` – ostatní GLB se nepřepíšou; uzly
  `<typ>-<1|2|3>` konstrukce, `-thatch` vybledlé došky – materiál `decay-faded`, `-moss` zarostlé
  došky – `decay-moss`, `<typ>-ruin`, `-ruin-late` trámy na dně (počátek = dno), `nettle` –
  `decay-nettle`, v zimě
  suché jako trsy trávy); barvy jsou glTF baseColorFactor, atlas obydlí v GLB jednou. Kreslí
  `VillageRenderer` (`updateDecay`, `updateRuins`, jámy obydlí i zbytků v `updatePitCuts`):
  rozpadlé obydlí díly místo hotového modelu (do načtení decay.glb hotový model), mění se jen
  při změně stupně (`dwellingKey`). Pozemek: `plotStage(…, decay)` – `decayFence` v
  `woven-fence.ts` (větve vypadávají, kůly nakřivo `lean`, pahýly `sink`, pevně podle seedu)
  a plevel na záhonech (`PlotWeed`, trs trávy v `HomesteadRenderer`). **Řemeslné dílny se zatím
  nerozpadají** (`dwellingDecay` jim dává stupeň 0). Náhled: /dev/buildings – tlačítka **Rozpad**
  (opuštěná zemnice a polozemnice na pozemku, posuvník ▶ Rozpad: stav 100 → 0 %, pak zbytek
  jámy 10 let) a **Stupně rozpadu** (řada stupňů 0–3 a zbytek jámy) – `showcaseDecay`.
- **Opuštěné stavby chátrají** ([abandonment.md](docs/design/abandonment.md), Martin 18. 10. 2026:
  „Jo ty stavby, kam nikdo nechodí, budou postupně chátrat a rozpadnou se“; čísla podle rešerše
  `research/2026-10-18-abandonment.md`): `abandonment.ts`. **Opuštěná** = stavba, ke které podle
  roční sítě cest (1. 11., stejná `computePathNetwork` jako pevné cesty) za rok nevedla žádná
  cesta – síť vrací provoz ke stavbám `PathNetwork.visits` (klíč `visitKey` – `idol:<id>`,
  `shrine:<id>`, `cemetery:<id>`, `pen:<id>`; jen domácnosti, ke kterým se trasa našla; k modle,
  svatyni a hřbitovu chodí každá domácnost jen k nejbližšímu). `roadsDay` ho vrátí v den roční
  kontroly (jinak a bez krajiny null – kalibrace nic neopouští) a `simulateDay` zavolá
  `abandonmentCheck` (začne / přestane chátrat; dokončená za poslední rok – `graceDays` – ne;
  ohrada se zvířaty – `stockedPenIds`: spřežení, výcvik, zimní krávy rovným dílem jako ve
  scéně – nikdy) a každý den `abandonmentDay` (pád, zbytky). Do ohrady bez zvířat se nechodí
  krmit (`PathVillage.pens[].stocked: false` – `pathVillageOf`, `ScenePen.stocked`, i v klíčích
  sítě). Stav `StructureWear` (`condition` ke dni `abandonedDay`; bez dne zastavené chátrání –
  sám se nezvedá, jen prací opravy) na `SacredBuilding.wear`, `Cemetery.fenceWear`, `Pen.wear`;
  stav dne `structureCondition`, den pádu `structureFallDay`. Spadne za `ABANDONMENT.fallYears` (modla
  20, svatyně 30, plot hřbitova 10, ohrada 10 let) → kronika `structure-fell` (`structure`,
  `id`; upozornění „Modla padla“ / „Svatyně se rozpadla“ / „Plot hřbitova se rozpadl“ / „Ohrada se
  rozpadla“): modla a svatyně zmizí ze `sacredBuildings` (štěstí jen ze stojících, svatyni jde
  postavit znovu) a zůstane `VillageState.sacredRuins` (`sacredRuinOvergrowth`, modla 10,
  příkop 20 let – `remnantYears`, pod stavbou zmizí), u hřbitova jen plot (`fenceWear`
  `{ condition: 0 }`, pohřbívá se dál, ve scéně plot zmizí úplně), ohrada zmizí; ohrada, do
  které se vrátila zvířata, chátrat přestane hned (nejméně 1 %). Web: `VillageSacred.buildings`,
  `VillagePen` a `VillageCemetery` nesou `condition` / `fenceCondition` a `abandoned` (panel –
  `Wear`: ikona `resources/condition` s %, ikona `resources/abandoned`), scéna
  `SceneSacred.buildings[].condition` / `abandoned`, `SceneSacred.ruins`, `ScenePen.condition`,
  `SceneVillage.cemeteries[].fence` (jen pod 1, po setinách).
  **Oprava** (abandonment.md – Oprava; Martin 19. 10. 2026: plot hřbitova vesničané opraví sami,
  jakmile se ke hřbitovu zase chodí, postupně z práce vsi, spadlý postaví znovu – a „ano“ i pro
  modlu, svatyni a ohradu): `repair.ts` (nezávisí na `abandonment.ts`). Roční kontrola
  (`keepRepaired` v `abandonmentCheck`) navštěvované stojící stavbě pod plným stavem založí stavbu
  `kind: 'repair'` (`Construction.repair` – `StructureRepair`: druh, id a stav při zahájení
  `from`; `startRepair`, ohrada i v `abandonmentDay` po návratu zvířat), opuštěné ji zruší
  (`cancelRepair` – spravené zůstane ve stavu). Spadlá modla, svatyně a ohrada se neopravují
  (zmizely), spadlý plot hřbitova ano (od 0). Cena `fullRepairManDays` = `STRUCTURE_REPAIR.share`
  (plot 0,3 z 10 čd na hotový čtverec, modla a svatyně 0,25 z `sacredBuildLabor`, ohrada 0,5
  z `penBuildLabor`) × (1 − stav), bez dřeva, ze společné práce kdykoli v roce (`build` –
  `repairNeed`; `workRepair` zvedá `wear.condition` na `repairedCondition`); hotová
  (`isRepairFinished`, `finishRepair`) záznam chátrání smaže, kronika `structure-repaired`
  (řádky „Modla opravena“, „Svatyně opravena“, „Plot hřbitova opraven“, „Ohrada opravena“,
  obecné `construction-finished` ne). Rozdělení práce: plot `cemetery` (po obvodu jako
  ohrazení), ohrada `pen`, modla a svatyně `repair` u cíle `{ kind: 'sacred', id }` – v síti
  pěšin i to provoz ke stavbě (`work('sacred:<id>')` s `visit`). Web: `ConstructionSummary.repair`,
  `VillageCemetery.repair`, `VillagePen.repair`, `VillageSacred.buildings[].repair` (průběh 0–1 –
  panel `RepairBar` „Oprava“ / „Oprava plotu“), scéna jen podle rostoucího stavu (stupně
  rozpadu a `decayFence` jdou opačně).
- **Hřbitov** (`cemetery.ts`, cemetery.md): čtverce s 56 místy na hroby, zemřelý se pohřbí do
  hotového hřbitova s místem nejblíž k obydlím (`bury(state, day, person)` v `populationDay` – za
  života, před `removePeople`), kronika `cemetery-full` (žádné volné místo). **Mohyly podle
  významu** (cemetery.md; Martin 19. 10. 2026: „Významnější lidé budou mít větší mohyly a na
  prominentnějších místech… Největší mohyly bude mít vojvodova rodina.“, velikosti schválil):
  `burials.ts` – `graveRank` (domácnost dvorce odstupňovaná – Martin 19. 10. 2026: „I ve
  vojvodově rodině jsou významnější a méně významní členové.“: vojvoda – hlava domácnosti dvorce
  i ovdovělý – a jeho žena `voivode`, ostatní dospělí z dvorce `manor-adult`, děti z dvorce
  `manor-child`; jinak dítě do 14 let `child`, hlava domácnosti od 35 let s dítětem `head` –
  nejstarší muž a jeho žena, bez muže nejstarší žena –, jinak `adult`; `manor` = celá vojvodova
  rodina podle prvního pravidla, jen staré mohyly), velikosti po druzích `GRAVE_RANK_MOUNDS`
  (vojvoda 2 × 2, dospělí z dvorce a hlava 2, dítě z dvorce a dospělý 1, dítě 1 malá – i menší
  náhrady), `placeMound` (místo v mřížce 7 × 8 čtverce – `GRAVE_PLACES`; mohyla zabere
  `MOUND_SIZES` míst: `great` 2 × 2, `large` 2 za sebou, `normal` a `small` 1; prominence =
  hloubka od branky `cemeteryEntrance` + 2 × od osy – `GRAVE_RANKS`; vojvodova rodina
  nejprominentněji, hlavy rodin hned za ní – začátek osy do `manorFrontM` od branky jim nechávají,
  dospělí a děti z dvorce u branky mimo pruh osy, ostatní děti vzadu; velká se zmenší, když se
  nevejde)
  → `Cemetery.mounds` (`GraveMound`: čtverec, sloupec, řada, velikost, druh, den). `graves` =
  pohřbení celkem; staré hroby (`oldGraves` = `graves` − mohyly) leží po jednom místě na prvních
  místech po řadách jako dřív – hřbitov uložený dřív se načte a vypadá stejně. Kapacita
  v místech: `cemeteryCapacity`, `usedPlaces`, `freePlaces` (i `acceptsBurials`, hygiena,
  `CemeterySummary.usedPlaces` / `freePlaces`, `yearsLeft` s průměrnou velikostí mohyl).
  Čtverce navazující stranou na hřbitov ho **rozšíří** (`foundCemetery`: stejné id, čtverce na
  konec s `constructionId`, dokud se ohrazují, a nepočítají se); na dva hřbitovy navázat nejde.
  Hráči se říká vždy **Hřbitov** (texty), v kódu zůstává `cemetery`.
  **Hygiena** (`villageHygiene`, 0 bez hřbitova s místem, jinak podle vzdálenosti od hotových
  obydlí a vody – vzdálenost od vody se ukládá u čtverce při založení, simulace krajinu nemá)
  násobí úmrtnost, hájení chrání. Je jen vnitřní – **nikdy ji neukazovat hráči** (Martin), panel
  ukáže jen místa na hroby (obsazená / všechna, v bublině pohřbení) a na kolik let
  (`CemeterySummary.yearsLeft` z úmrtí v kronice).
- **Sad** (`orchard.ts`, orchard.md): staví se po čtvercích jako pole (`orchardPartsFromCells`,
  sad a hřbitov se nepřekrývají, na pole sad smí – Pole jako krajina, obydlí do sadu smí –
  Obydlí na poli a v sadu). Výsadba je
  stavba ze společné práce jen v oknech
  jara a podzimu (`orchardPlantingNeed` mimo okna 0), čtverec dostane `plantedDay`. Rok sadu
  začíná 1. 3. (`orchardYear`), úroda `orchardYieldShare`. Sezónní práce celé vsi
  (`VillageState.orchardWork` – sklizeň září–říjen, péče v zimě; `orchardSeasonDay` na začátku
  dne) jde do `allocateDay` mezi polní úlohy podle konce okna. Jablka `applesKg` se jí před
  obilím (`eatMeal` ve `food.ts`, bez jablek přesně `eatDay`) a ráno 1. 3. shnijí; osev se jimi
  neřídí. Hlad (`hungry`) se řídí výhledem `outlook` – hlásí se hned, když obilí po zkažení
  jablek nevystačí. Překážky čtverce zmizí s první prací na něm a dospělé stromy (nevyhrazené
  stavbou) dají klády jako u pole; nevyklizené čtverce sadu jsou v `claimedObstacles`. Kroky
  simulace sadů (`plantOrchard`, `workOrchards`, `orchardSeasonDay`) se z `@bohemia/game`
  neexportují. **Obnova sadu** (orchard.md – Obnova sadu, Martin 18. 10. 2026 – vesničané
  obnovují sami jako přestavbu obydlí): `renewOrchards` (v `orchardSeasonDay`, každý den v oknech
  výsadby) zařadí čtverce od 50. roku sadu (`squareDueForRenewal`) – nejstarší první, nejvýš
  `renewalQuota` (desetina, nahoru, aspoň 1 – `ORCHARD.renewalShareYear`), jednou za rok sadu
  (`Orchard.renewedSeason`) a jen bez rozestavěné výsadby či obnovy sadu – do stavby sadu
  s `Construction.renewal` (čtverce nesou `OrchardSquare.renewal` = id stavby, kronika
  `orchard-renewal-started`). Práce jako výsadba (`plantingPerHa`, okna výsadby, společná práce);
  staré stromy čtverce se skácí s první prací (`plantedDay` null, nová cena výsadby bez překážek),
  během běžící sklizně jablek ne; po výsadbě nový `plantedDay` a značka zmizí. Dokončená obnova
  `construction-finished` nepíše. Čtverec, na který obnova do 60. roku nedojde, zaroste 1. 3. jako
  dřív (`retireOrchards`, `orchard-gone`). Scéna: velikost stromů a jablka po čtvercích,
  obnovovaný čtverec nese `renewal` a vytyčuje se jen on (`stakedSquares` v `orchard-layout.ts`).
- **Řemesla** (`crafts.ts`, crafts.md): dílna = obydlí s `Dwelling.workshop` (řemeslo
  `Craft` = `potter` / `smith` / `burner` patří budově; hrnčíř a kovář polozemnice, uhlíř
  zemnice – `CRAFT_BASE`), stavba je `kind: 'dwelling'` s `craft` (cena `workshopCost` /
  `workshopTrees` – obydlí + 30 %), akce `startWorkshop`, use-case `placeWorkshop`, umístění
  `checkWorkshopPlacement` (volně jako zemnice; půdorys `workshopFootprints` i s přístřeškem
  a u uhlíře s milířem kus od zemnice – `MILIR`, `milirPosition`; `PlacementVillage.dwellings`
  nese `workshop.craft`, ať se do milíře nestaví). Domácnosti obývaných dílen (`craftHouseholds`)
  pracují v dílně (`workshopLabor` – po denním minimu, domácí výroba bokem; `workCrafts` v kroku
  práce – mimo `allocateDay`, do sil plánu osevu se nepočítají), jen dokud je co dělat: **podle potřeby** (Martin 18. 10. 2026 –
  volný čas na poli) kovář a hrnčíř vyrábějí do zásoby `craftTargets` (potřeba + opotřebení za
  rok), uhlíř má vždy milíř a z vypáleného nosí uhlí podle kování (Uhlíř níž); s plnou zásobou
  nebo bez vstupu je dílna v `restingCrafters`
  (na začátku kroku práce, hodnota `resting` / `no-charcoal` / `no-wood`) a její domácnost
  pracuje v `allocateDay` se vsí (`craftHouseholds(state, resting)`); uhlíř a hrnčíř kácejí strom po stromu (`Workshop.felling` je
  vyhrazený – `reservedTrees` / `claimedObstacles` ho znají), zásoby `VillageState.crafts`
  (kg uhlí u kováře, nástrojů, keramiky; opotřebení `wearCraftStocks` jen v užívání, uhlí
  neubývá; celá zásoba uhlí i s vypálenými milíři `charcoalStockKg`). **Pokrytí**
  `craftCoverage` se spočítá na začátku dne a jde všude, kde platí meze (plán osevu, přidané díly,
  založení pole – i `PlacementVillage.toolCoverage` pro náhled –, denní minimum, ztráty zásob,
  jablka v nádobách `applesSpoiled` / `appleKeepDays`). Rozdělení práce dne má `craft` (u dílny)
  a `fell` u stromu dílny. Web: `VillageView.crafts` (zásoby, pokrytí, dílny s `activity`),
  `households[].craft`, `SceneVillage.dwellings[].craft` / `working`, server action
  `placeWorkshop`, mřížka staveb hrnčíř [F], kovář [G], uhlíř [H] (`placement: 'workshop'`),
  lišta uhlí / nástroje / keramika (jen ves s dílnou), panel výběru dílny, upozornění
  `no-charcoal` / `no-wood`. **Uhlíř** (`charcoal.ts`, crafts.md – Uhlíř, Martin 18. 10. 2026):
  kácí jen buky (`isBeech`, `availableTrees(…, 'beeches')`) po dávkách do milíře
  (`Workshop.kiln` – `CharcoalKiln`: buky vyhrazené v `reservedTrees`, fáze `wood` → `build` →
  `burn` 8 dní → `draw`, čísla `CHARCOAL_KILN`); první buk do 150 m od milíře u zemnice = pálí
  doma, dál milíř v lese (`kiln.site`, přirážka chůze `kilnWalkFactor` – `kiln.walkM` po pevných
  cestách s půdou `villageRoadWalk`, dovoz dřeva `fellingsOf` jako u staveb; bez krajiny
  vzdušně). Na pařezy sází mladé buky (`Workshop.toPlant`, `plantOnStump` → `ObstacleChange.planted`; `felledTreeStage` – sazenice
  dospěje za `BEECH_PLANTING.matureYears`, bez sazenice nálet jako dřív; `saplingGrowth`).
  **Milíř stojí vždy** (crafts.md – Milíř stojí vždy; Martin 19. 10. 2026: „Uhlíř: měl by vždy
  postavit milíř, z hotového milíře by se mělo kouřit a pak by jej měl rozebírat podle toho, jak
  mu bude uhlí odebírat kovář.“): uhlíř má jeden milíř (`Workshop.kiln`) – bez něj začne nový
  (bez buků `no-wood`), vypálený (`draw`, `CharcoalKiln.charcoalKg` – uhlí v něm) je zásobou uhlí:
  uhlí jde do `crafts.charcoalKg` („u kováře“) jen tak, jak ho kovář odebírá – `charcoalDrawKg`:
  když u kováře nestačí na dnešní kování (`smithsForgeCharcoalKg` – kovající kováři na plný
  úvazek), donese uhlí na `CHARCOAL_KILN.drawBatchDays` (30) dní kování (2 čd na 120 kg, v lese
  s přirážkou); zbytek, který stačí jen na přípravu a pálení dalšího milíře (`kilnLeadKg` –
  `smithsCharcoalPerYear` po dnech × `kilnLeadDays`), vytahá celý. Rozebraný milíř zmizí, nový od
  dalšího dne. Bez kováře (rozhodnutí Clauda) vypálený milíř čeká a další se nestaví. S vypáleným
  milířem a uhlím u kováře uhlíř odpočívá (`restingBurners` v `restingCrafters` – napřed uhlíři,
  kovář `no-charcoal` jen, když mu dnes nikdo nedonese). Obchod prodává uhlí u kováře i z milířů
  (`takeCharcoal` – milíř se rozebírá), koupené jde ke kováři. Starší dílna uhlíře se převede
  v kroku práce (`migrateBurner` – palivo a kácení; `migrateKiln` – vytahovaný milíř bez
  `charcoalKg` je vypálený s celou dávkou; čtení přes `kilnCharcoalKg` platí i před převodem). Rozdělení práce: `fell` u buků (i příprava dřeva), `craft` u milíře – v lese
  cíl `{ kind: 'kiln', id, x, z }`, `plant` u pařezů. Web: `VillageWorkshop.kiln` (i `charcoalKg`)
  / `toPlant`, lišta a panel uhlí = `charcoalStockKg`, `SceneVillage.kilns` (lesní milíře)
  a `SceneVillage.dwellings[].kiln` (milíř u dílny) – `SceneKilnState`: fáze, průběh a u vypáleného
  podíl uhlí `charcoal` (po 2 %), `plantedSaplings` (velikost mladých buků). Scéna: vzhled podle
  fáze jedna čistá funkce `kilnLook` (`workshop-layout.ts` – staveniště `constructionState('milir')`,
  hráň polen, hotový milíř se `scale` / `scaleY` – vypálený sesedne, rozebíraný se zmenšuje,
  `ModelInstance.scaleY` –, dým jen při pálení, koše u rozebíraného); milířiště se staví se zemnicí
  (`milirGroundProgress`), milíř na něm až z buků; lesní milíř kreslí funkce milíře u dílny přes
  kotvu `forestKilnAnchor` (`VillageRenderer.kilnPlaces` – oba druhy), postavy u lesního milíře
  `kilnWorkers`, sázení `planting`, polena nosí k lesnímu milíři (`felling`). Ukázka /dev/buildings
  **Cyklus milíře** (posuvník ▶ Milíř – `showcaseKiln`, `kilnCycleAt`).
- **Nákup u sousedů** ([crafts.md](docs/design/crafts.md) – Nákup u sousedů, Martin 19. 10. 2026:
  „Nástroje ať vesničané obchodují individuálně… Sami si spočítají, jestli se jim to vyplatí.“;
  čísla `CRAFT_BUYING` v `rules.ts`, rešerše `research/2026-10-19-craft-buying.md`):
  `craft-buying.ts`. Sousedé mají řemeslníky podle druhu (`neighbourCrafts` – řemeslníci kováře,
  hrnčíře i tesaře jistě, ostatní s pravděpodobností). Ves se rozhoduje sama 15. 11.
  (`startPurchases` na začátku dne – `planPurchases`): u výrobku bez vlastního pracujícího
  řemeslníka (`ownCraftsmanWorks` – dílna bez vstupů se nepočítá) chybí do `craftTargets` –
  nejbližší soused s řemeslníkem (`purchaseRoute`: po hotové stezce `trailTripDays`, jinak krajinou
  ke kraji mapy × 1,5 a den navíc), cena `productPrice` (0,96 hodnoty), platba obilím nebo
  luštěninami z přebytku nad pojistkou (`sowingTargets` – `leftKg − bufferKg`) nejlevnější v práci
  (`villageFoodCosts`; u nástrojů při pokrytí po nákupu), skupina polovina dospělých (nejvýš 8)
  po 25 kg, nejvýš 60 dní; koupí, když práce ušetřená za dobu služby (1 ÷ opotřebení let –
  nástroje polní práce a seč, keramika ztráty zásob a denní minimum, dřevěné nářadí práce vsi)
  převýší práci za platbu a cestu – z jednoho přebytku napřed nejvyšší poměr ušetřené práce
  k ceně (rozhodnutí Clauda). `VillageState.purchases` (`CraftPurchase` – směr, skupina, dny,
  stezka nebo bod na kraji `edge`, zboží a platba); lidé na cestě chybí v práci vsi od prvního dne
  (`purchaseTravelers` – kapacita `allocateDay`), `walkPurchases` → podíl práce `trade` s cílem
  stezky nebo `{ kind: 'edge' }`; ve scéně karavana (`sceneExpeditions` v `caravan-view.ts` –
  `SceneExpedition` s `trailId` null a čarou `line` od dvorce ke kraji – `purchaseLine`, každá
  cesta tam a zpět zvlášť podle `CraftPurchase.tripDays`; body cesty `caravanPoints`),
  `finishPurchases` → zásoby a kronika `crafts-bought`. Web: kronika a upozornění „Vesničané
  koupili nástroje u souseda (sever)“, `VillageCrafts.sources` (`craftSources`),
  `VillageView.purchases`, panel dvorce `BuyingRow` (výrobky se šipkou ke zdroji, nákup na cestě),
  panel dílny bez vstupů `SelectionWorkshop.buying`; řádek kalibrace „Nákup u sousedů“.
- **Tesař a vozy** ([wagons.md](docs/design/wagons.md) – fáze 1, Martin 19. 10. 2026; čísla
  `CARPENTRY`, `WOODWORK_LABOR`, `CARPENTER_TOOLS_WORK`, `WOOD_TOOLS`, `WOOD_TOOLS_LABOR`, `CARTS`,
  `CART_ACCESS` v `rules.ts`, rešerše `research/2026-10-19-carts-carpentry.md`): řemeslo
  `carpenter` (polozemnice + přístřešek, [T], ikona `tesar`) – `carpentry.ts`. Krok práce
  (`simulate.ts`): `restingCarpenters` (odpočívá jen bez výroby i bez stavby s dřevěnou prací),
  `carpentryHelp` před stavbami (čd tesaře vede `crew` čd dřevěné práce dne – `woodworkToday`
  rozdělí práci rovným dílem jako `build`; jeho práce jde do staveb a `build` s pokrytím násobí
  práci stavby `constructionLaborFactor` – podíl dřevěné práce `constructionWoodShare` od 1
  k 0,6), pak `workCarpenters` (vůz – `missingCart`, `addCart`,
  kronika `cart-made` –, pak dřevěné nářadí `CraftStocks.woodToolsKg`; klády `Workshop.timber`
  z hromady, jinak kácí – `nextTree`; práce × `carpenterWorkFactor` podle nástrojů). `workCrafts`
  tesaře přeskakuje. Dřevěné nářadí: `craftNeeds` / `craftTargets` / `craftCoverage.woodTools?`
  (jen když nějaké je) a `woodToolsLaborFactor` násobí práci vsi s `villageLaborFactor`
  (`villageProductivity` v `simulate.ts` – i plán osevu). **Vozy** (`carts.ts`):
  `VillageState.carts` (`Cart` – druh, `builtDay`), `cartTargets` (dvoukolák na spřežení,
  čtyřkolák s hotovou stezkou), `retireCarts` (10 let, `cart-worn-out`); svoz – `haulCartsToday`
  (dvoukoláky doma se spřežením, ne ve dny orby), `planTaskHauls` v `simulate.ts` (sklizeň –
  `harvestCarryShare`, seč – `haulShare.hay`; `haulPlan` / `haulProgress` / `haulAvailable` –
  nejvýš podíl celé úlohy, převzaté v `CropWork.hauled`, `HayMowing.hauled`), `haulLogs` (klády
  ke stavbám – `fellingHaulable`, `ConstructionWood.hauled`), rozdělení práce `haul` s
  `LaborShare.carts`. Výprava: `expeditionTransport` / `tradeCarts` (`TradeQuote.carts`,
  `TradeExpedition.carts` – spřežení je pryč, `teamsHomeShare` krátí orbu; jen po stezce sjízdné
  pro vozy – `trailCartPassable`, `axisCartCheck`). **Dosah vozu je rozhraní `CartAccess`** (cíle
  najednou) – s krajinou vozová síť (`networkCartAccess` → `villageCartRoutes`), bez krajiny
  `EVERYWHERE`; dosah úlohy se spočítá jednou při prvním svozu a uloží (`CartReach` –
  `CropWork.cartReach`, `HayMowing.cartReach`, `ConstructionWood.cartReach`; `cropCartReach` se
  žní po strništi – `harvestReachState`, `mowingCartReach`, `logsCartReach`); jízdy svozu do
  ročního provozu cest `addHaulTrips` → `addRoadCartTrips` (vyjeté cesty).
  Web: `VillageCrafts.carts` / `cartTargets`, `VillageWorkshop.carpenter`, lišta dřevěné nářadí
  a vozy (`showsWoodTools`, `cartsLabel`), panel dílny (`CarpenterStats`), upozornění
  `cart-made`, `cart-worn-out`, `carpenter-no-wood`, náhled obchodu s vozy
  (`VillageNeighbour.carts`), `SceneVillage.carts` (`sceneCarts` – u ohrady, cíl dne, náklad
  `job.load` a trasa dne `route` – osa `villageCartRoutes` zjednodušená `simplifiedRoute`; scéna
  je kreslí – Vozy se spřežením). Dílna tesaře má model `tesar` (Řemeslné dílny).
- **Ozim a jař** (fields.md – Ozim a jař): roční plán (`YearPlan`) nese práci jaře nahoře (tvar
  plánu z doby před ozimem) a ozimu v `winter?` (`CropWork`); díly osevu mají `crop?` (chybí =
  jař). Okna prací po plodinách `CROP_WINDOWS` (`WINDOWS` = jař, `WINTER_WINDOWS`) v `rules.ts`.
  K 1. 9. rozhodne `chooseCrops` (`sowing.ts`): díly v pořadí `sowingOrder`, každý do ozimu, když
  ho podzim (září–říjen po sklizni jablek) stihne a červenec sklidí, jinak do jaře, když se
  vejde do zbytku podzimu, jara a srpna – volná práce `windowDaysLeft` × práce po denním minimu.
  Díly hotové po plánu jdou jen do jaře. **Cíl osevu podle stravy a zásob** (fields.md – Osev
  podle stravy, Osev podle zásob, 19. 10. 2026): `sowingTargets` ve `field-food.ts` (v plánu
  `fieldSowingTargets`) – potřeba z pole (podíl jídla z pole za uplynulý hospodářský rok –
  `VillageState.fieldFood`, součty v `eat`, uzávěrka 1. 9. `closeFieldFoodYear`; nejméně
  `FIELD_FOOD.minShare`, bez změřeného roku 1 – × roční potřeba). **Osev podle růstu vsi**
  (fields.md, Martin 19. 10. 2026): roční potřeba není dnešní, ale výhled `expectedYearlyFoodNeed`
  (`food-outlook.ts` – po měsících věk, běžná úmrtnost, porody manželských párů) – do sklizně pro
  zásoby, rok po sklizni pro úrodu, pojistku a cílovou zásobu. Maso z nouzové porážky se do
  `fieldFood` počítá jako potřeba z pole. **Plynulejší osev** (fields.md –
  Plynulejší osev, Martin 19. 10. 2026): seje se podle dlouhodobého podílu
  `FieldFoodYear.longShare` (k 1. 9. o třetinu rozdílu – `FIELD_STORES.balanceYears`; starší ves
  začne ročním `share`) – úroda rok co rok na cílovou zásobu `storesTargetKg` = pojistka (`bufferKg`
  – `bufferEnergyYears` celé potřeby) + `cushionYears` roční potřeby z pole (zásoby z pole – obilí
  a luštěniny, `fieldStoresKg`; `storesNeeded` / `storesLeft` se ztrátami), odchylku od ní (přebytek
  i schodek) vyrovná po třetinách, pod pojistkou doplní do pojistky hned; luštěniny potřeba bez
  zbytku zásoby.
  Rozjetý plán zkrátí `trimPlan` (každý den 1. 9. – 30. 4., `plan-trim.ts`: nezačaté díly obilí
  od konce pořadí – nouzové první – přes `shrinkInPlan` / `dropFromWork` z `land-taken.ts`, ladem
  jako příloh – `FieldPart.fallowBeforePlan` – a na začátek osevu navíc).
  **Osev navíc** (fields.md – Osev navíc, Martin 19. 10. 2026; `extra-sowing.ts`): ostatní díly od
  70 % v pořadí výběru čekají v `YearPlan.extra` (`ExtraPart` – `sownYears` u dílu, který se
  osíval; plán k 1. 9., hotové díly `joinFinishedParts`, ubrané `trimPlanToTarget`); krok
  `extraSowingDay` ve `work()` z `afterBuild.left` (práce po stavbách a opravách) a ze zbylé
  kapacity spřežení (`FieldTaskEntry.teamDays`) začne díly navíc – ozim do 30. 10., pak jař
  (`extraSowingCrop`), jen obilí – a přidá je k práci plodiny (`addToCropWork`); jejich příprava
  půdy čeká v `CropWork.extraLeft` (potřebné úlohy berou `neededTaskRemaining`), setí až výmlat
  jsou potřebné. Od 1. 5. se `extra` smaže. Volná práce v liště (`allocation.common`) je před
  polem navíc; v rozdělení práce `DayWork.extraField`. **Nouzový osev** (fields.md – Přílohová
  soustava, Martin 19. 10. 2026): když díly od 70 % nedají `SowingTargets.harvestKg`, plán vybere
  znovu i s přílohy pod 70 % (`sowingBlocks(…, EMERGENCY_GROUP)`, `isEmergencyFallow`, čistá
  úroda > 0), jen obilí, a jen od 40 % přirozené (`FERTILITY.emergencyMin` – Martin: „ves neoseje
  díly pod 40 % úrodnosti“); úrodnost dílu klesá nejvýš na nulu (pojistka). Potřebou z pole jde i `energyFloorKg`, odhad ozimu na srpen
  (`daysUntilFoodHarvest`) a dobré zásoby štěstí; ustálená úroda `steadyHarvestKg` (kalibrace,
  kalkulačka – zásoba na cílové zásobě). Kalibrace vypisuje práci na poli a volnou práci po rocích
  (průměr, variační koeficient, změna z roku na rok). Volná práce plánu (`sowingCapacity`) je po
  denním minimu dospělých (`adultDailyMin` – zvířata a domácí výroba bokem). Výhled jídla do sklizně (`eatDiet`) počítá s mlékem stád do sklizně
  (`milkAheadEnergy` z `milkEnergyBetween`) a celou zásobou sýra.
  Polní úlohy obou plodin řadí `fieldTasks` v `simulate.ts`
  (konec okna, ozim před jaří); `allocateDay` vrací i `taskAmounts` po úlohách vstupu (stejný
  název víckrát). Sklizeň ozimu 31. 7. (`harvestWinter`), jaře 31. 8.; příděl počítá do sklizně
  podle `daysUntilFoodHarvest` (31. 7., když ozim podle odhadu uživí srpen). Plán po plodinách
  prochází `planCrops`, všechny díly `planPartIds`. **Luštěniny** (fields.md – Luštěniny, Martin 18. 10. 2026): třetí plodina `legume` (`YearPlan.legume?`, `LEGUME_WINDOWS` – jař se sklizní
  v červenci, `LEGUMES` a `LEGUME_WORK_PER_HA` v `rules.ts`, úroda `cropGrossPerHa` /
  `cropSeedPerHa`, `partWork(…, crop)`); `chooseCrops` dostane `legumeTargetKg`
  (`plannedLegumeKg` – rovnovážné hospodaření, diet.md, bez zásoby – `sowingTargets`) a `energyFloorKg` – obilí napřed na celý cíl, pak luštěniny na
  díly výběru od domu (loňské luštěniny až nakonec) a obilí doplní energii (`chooseLegumes`);
  sklizeň 31. 7. do `VillageState.legumesKg` (`harvestWinter`), osev úrodnost vrátí
  (`LEGUMES.fertilityGain` v `endOfSeason`). Scéna: `SceneFieldPart.crop: 'legume'` – trsy
  hrachu `crop-pea-green` / `crop-pea-ripe` a hromádky `pea-heap` v `crops.glb`.
  **Len** (fields.md – Len, diet.md – Oděv; Martin 19. 10. 2026: „na částech pole musí být zasetý
  len“, čísla návrh Clauda podle rešerše `research/2026-10-19-flax.md`): čtvrtá plodina `flax`
  (`YearPlan.flax?`, `FLAX_WINDOWS` = okna luštěnin, `FLAX` a `FLAX_WORK_PER_HA` v `rules.ts` –
  potřeba 2 / 1 kg třeného lnu na dospělého / dítě, 550 kg/ha, osivo 0, neopletý 50 %, úrodnost
  −0,18 v `endOfSeason`, nemlátí se); `flax.ts` – `flaxNeedKg`, `expectedFlaxKg`, `harvestFlax`
  (31. 7. v `harvestWinter` – `VillageState.linen` = podíl oděvu vůči `YearPlan.flaxNeedKg`
  zapsané v `planYear`; plán bez ní – starší ves, ves založená během roku – nic nezapíše, kronika
  `linen-short`), `linenUnhappiness` (`HappinessFactors.linen`, až `FLAX.unhappiness` 4).
  `chooseCrops` dostane `flaxTargetKg` – `chooseSideCrop` dá len napřed (před luštěninami) na díly
  výběru obilí **od konce** (vysiluje půdu, delší příloh neleží domům v cestě; loňský len až
  nakonec; když se práce nevejde, zkusí další díl – `fitsSideCrop`), obilí doplní energii, a když
  nejde, len ubere obilí nejvýš o svůj díl ze zásob nad pojistku (`flaxSpareKg` = `leftKg` −
  `bufferKg` ze `sowingTargets`); trhání v červenci napřed (`CROP_ORDER` – len první);
  `trimPlan` len neubírá. Zpracování je v domácí výrobě
  (přerozdělení), žádná zásoba v liště. Web: `SceneFieldPart.crop: 'flax'` a `bloom` (červen –
  `FLAX_BLOOM_MONTH` ve `village-view.ts`), scéna `FLAX_STYLES` / `FLAX_BLOOM` ve `field-crops.ts`
  (druhy trsů `flax-green` / `flax-bloom` / `flax-ripe` – kopie uzlu `crop-sprout` s vlastní
  geometrií, `CROP_NODE` ve `field-renderer.ts`; kvetoucí len napůl modré trsy), malé panáky,
  nízká koruna; panel `CROP_LABELS.flax` (ikona `resources/flax` – `icons.py flax`),
  `fieldPartName` („Zelený / Kvetoucí / Zralý len“, „Trhání lnu“), upozornění „Chybí len na oděv“,
  `/dev/buildings` pole **Len** (`FLAX_SHOWCASE_PHASES`).
- **Postup práce po čtvercích** (Martin – fields.md): kopání, setí a sklizeň mění díl, až k němu
  dojde práce. `field-progress.ts` (jen čte): díly plodiny v pořadí `CropWork.partIds` (dávka
  po úsecích hospodářství od domu ven – řadí `createCropWork` s `workOrder`, ves bez hospodářství
  nejblíž obydlím první, při shodě id), váha = plocha × vzdálenost;
  `fieldPartLooks` → vzhled dílu `{ look, work?, before? }` (bare, plowed, sown, sprouted, green,
  ripe, harvesting, stubble, young-fallow, pasture; vzejití a zrání podle kalendáře; starší
  příloh bez vzhledu – doplní scéna), `fieldFrontiers` (čelo práce úloh dne), `partsWorked`
  (díly, přes které dnes práce postoupila). Rozdělení práce dne (`labor-report.ts`) dostává
  `fieldWork` (před a po po plodinách) a cílí polní práce na `{ kind: 'field', id, parts }`.
  Ve scéně (`village-view.ts`) je díl `SceneFieldPart` (`id`, `look`, `work`, `before` –
  `FieldLook`) a podíl práce `SceneLaborShare` s `parts`; postavy (`villager-plan.ts`) pracují na
  `parts`. Simulace se tím nemění.
- **Hospodaření podle polohy domů** (Martin – fields.md): `holdings.ts` – díl patří k nejbližšímu
  domu (vzdušnou čarou; `villageHoldings`/`fieldHoldings`), hospodářství se dělí na úseky od domu
  (prstence po 15 m, v každém tolik dílů po směru, kolik čtverců má první prstenec – výseče kolem
  samoty, lány za domy v řadě). Nic se neukládá, vše se odvodí z polohy domů a čtverců. Plán osevu
  bere `sowingBlocks` (bloky úseku ve skupině přílohové soustavy od domu ven, osev mezi
  hospodářstvími podle plochy) a `chooseCrops` dává blok celý do ozimu, nebo do jaře; pořadí práce
  `workOrder`. Ves bez hospodářství (bez domů nebo bez políček – i `measure-village.ts --land v1`)
  jede dřívějším pořadím bit po bitu; kalibrace na skutečných krajinách hospodaří podle domů. Měření `packages/game/scripts/measure-holdings.ts`; na
  `/dev/landscape` tlačítka „Hospodaření“ (ukázka po 20 letech simulace), „Úseky“ (překryv
  `HoldingsOverlay`) a „Po 20 letech“.
- **Navazující pole** (Martin): `foundField` – čtverce navazující stranou na pole ho rozšíří
  (`fieldsTouching` ve `fields.ts`, stejné id, rozestavěné založení dostane cenu, jinak nová stavba
  pole), na víc polí je sloučí do nejstaršího (`mergeFields` ve `fields.ts`: díly, stavby
  založení, kronika, `labor` – cíl i stavba). Průběh stavby pole se počítá jen z jejích dílů
  (`invest`). Náhled (`fieldPartsFromCells`) vrací `joinedFields` a nejmenší výměru měří i
  s navazujícím polem. **Stará navazující pole** (založená samostatně dřív) sloučí při načtení
  vsi `withMergedFields` v `updateVillage` (souvislé skupiny stranou do nejmenšího id, pole
  z obrysu ne; Martin) – stejným `mergeFields`, bez příznaku „převedeno“ (idempotentní a levné).
- **Stavba v lese** (population.md – Stavba v lese; Martin 19. 10. 2026: „Oprav – obydlí může jít
  postavit i v lese – les se prostě vyklučí.“ a „pokud jsem pole založil v lese, tak na něm nemohu
  postavit kovárnu“; podrobnosti návrh Clauda): `placement.ts` les krajiny ani les vsi nezakazuje
  žádné stavbě (`checkFootprintTerrain(…, clearForest)`, `LandUse.woods`, pozemek
  `plotGroundProblem`, ohrada, sad a hřbitov v `buildSquares` / `cemeteryPartsFromCells`, modla
  a svatyně `checkSacredTerrain`); výchoz, voda a prudký svah dál ano. **Cena = sazba lesa jako
  díl pole** (`forestClearingCost` – `foundingCostPerHa('forest', toolCoverage)` × plocha lesa):
  volně stojící stavba (obydlí, dílna, modla, svatyně) vyklučí vyklízenou plochu a v lese i pruh
  `FOREST_CROWN_MARGIN_M` (4 m) pod korunami (`freeForestClearing` – mnohoúhelníky
  `dwellingClearing(…, margin)`, `milirClearing(…, margin)`, `freeDwellingClearings(…, margin)`,
  v pruhu jen les – `ClearingOptions.only`); plocha lesa `forestAreaUnder` (políčko lesa bez staveb
  přesně, se čtverci staveb a lesa vsi body po 0,5 m – `forestLandAt`: políčko lesa krajiny nebo
  čtverec lesa vsi mimo půdu polí, sadů, hřbitovů, ohrad a hájů); druhy v sazbě
  (`SURFACE_INCLUDED_OBSTACLES.forest`) se po kusech neplatí – `RatedLand` v `polygonObstacles` /
  `polygonsObstacles` (`ClearingOptions.rated`), kameny a balvany ano. Čtverce (pozemek, ohrada,
  sad, hřbitov) v lese jako díl pole: `squareInForest`, `squareObstacleCost` za plochu čtverce bez
  půdy pole a sadu (`squareFreeArea`). Na poli v lese (i natočeném) stavba za les neplatí – půda
  patří poli (`owned`). Obyvatelé les nevyklučí (`clearForest: false` – `relocationPlot`
  přes `takeLand: false`, `existingPlotSquare`, `freeVillageSite`). Dospělé stromy dají klády
  jako dřív (`clearedTrees`), les vsi bez stromů zmizí. Scéna: paseka podle tvaru
  (`cleared-forest.ts` – `areas`), podrost a zarůstání pod stavbou neroste (`wildPlants`
  s `buildingClearings`), `/dev/landscape` odstraní překážky postavené stavby jako hra.
- **Obydlí na poli a v sadu** (population.md – Obydlí na poli a v sadu; Martin 18. 10. 2026:
  „Pole a sad se prostě zmenší o plochu domu“): `checkDwellingPlacement`, `checkPlotPlacement`
  a `checkWorkshopPlacement` pole a sad nezakazují (`checkFootprintFree(…, DWELLING_LAND)`,
  hřbitov dál ano) a vrací `takenLand` (`TakenLand` – políčko, zabraná plocha, plocha políčka): pozemek
  celé políčko, obydlí bez pozemku průnik vyklízené plochy (`freeDwellingClearings`, `coveredArea`
  v `polygon.ts`) s každým čtvercem; u kurzoru `check.warning` „Pole se zmenší“ / „Pole zanikne“
  (u sadu „Sad …“). Překážky na čtvercích polí a sadů obydlí neplatí (patří jim). Use-case předá
  `takenLand` do `startNewDwelling` / `startWorkshop` (`site.takenLand`) a ty po plánu dřeva
  zavolají `giveWayToBuilding` (`land-taken.ts`): díl / čtverec se zmenší, pod
  `TAKEN_LAND_MIN_SHARE` (20 %) políčka zmizí (`landLeftM2`); plán osevu i orba rádlem
  (`CropWork.plough` – váhy oraných a kopaných dílů) ubere jeho podíl práce podle `taskSpans`
  (ostatním dílům zůstane hotová práce, sklizená plodina beze změny), seč sena (`hay.mowing`)
  podíl práce podle `mowingSpans` a seno podle plochy, založení
  pole a výsadba úměrně, `orchardWork` úměrně (sklizený podíl zůstane); zmizelý zakládaný díl či
  nevysazený čtverec předá překážky a klády; pole / sad bez čtverců zanikne i se stavbou; kronika
  `land-taken`. Scéna: `building-clearings.ts` – pod vyklízenou plochou obydlí `FieldRenderer`
  nekreslí obtisk ani trsy (`clearingMask` násobí krytí) a `orchardTreeSpots` vynechá jabloně.
- **Pole jako krajina** (fields.md – Pole jako krajina; Martin 18. 10. 2026: „Pole by se mělo
  chovat jako normální krajina. Takže by na něm mělo jít postavit cokoliv kromě jiného pole.“):
  pole ustoupí každé stavbě kromě pole – `giveWayToBuilding(state, day, takenLand, by)`
  (`LandTaker`; sad ustupuje jen obydlí, kronika `land-taken` s `by`). Sad a hřbitov
  (`buildSquares` / `cemeteryPartsFromCells` – příznak `field` neblokuje, čtverec na poli
  `onField`), ohrada (`checkPenPlacement`) a modla se svatyní (`checkSacredBuildingPlacement`,
  `checkFootprintFree(…, FIELD_LAND)`) vrací `takenLand` (čtverce celé, modla průnik půdorysu)
  a varování; překážky vrstvy na čtvercích polí patří poli (`cellObstacles(…, { layerOwned })`,
  `skipTiles` v `polygonObstacles` přeskakuje jen vrstvu – stromy u cest a jabloně se platí
  vždy). Akce `foundOrchard`, `foundCemetery` (`takenLand` ve vstupu), `foundPen`
  (`PenInput.takenLand`, ústup až ve `foundPen` – oxen.ts nesmí importovat land-taken, cyklus
  přes `costs.ts`), `startSacredBuilding` (`site.takenLand`). Jabloně a stromy u cest smí na pole
  (`plantingBlocker` díly polí nezná): `treeTakenLand` – TAKEN_LAND_TREE_M2 (20 m²) za strom na
  čtverci pole; jabloně při `startRoadApples`, strom u cesty při uchycení (`rootTrees`, jen
  nové cesty mají místa i na polích – místa se určují jednou). `RoadApplesOption.warning`
  (`landTakenWarning`) – v popisku „Vysadit jabloně“ oranžově. Scéna: `fieldClearings` (obydlí,
  modly, svatyně a kruh 20 m² pod stromy na poli) maskuje pole, `build-items` dá čtverce polí
  pod sadem, hřbitovem a ohradou do `warningCells`.
- **Zarůstání přílohu** (fields.md – Zarůstání, Les vsi; Martin 18. 10. 2026: „Ano udělej to
  tak“ – nepasený a nesečený příloh zarůstá, les z pole vypadne; čísla návrh Clauda podle rešerše
  `research/2026-10-18-overgrowth.md`): 1–2 roky mladý příloh, pak louka (pastvina, louka na
  seno). `overgrowth.ts`: pastva po dílech `grazedPartIds(state, day, demand)` z `pasture.ts`
  (`pastureGrazing` – Martin 19. 10. 2026, louky určené ke spásání: napřed příloh ve fázi louky
  mimo letošní seč od nejbližšího, pak přirozené louky mimo seč, pak mladý příloh třetinou píce,
  nakonec otava posečených dílů – `PASTURE`; potřeba jen podílem uhlídaným pasáky –
  `herdingCoverage`; díl nejvýš svou plochou, spásl se při polovině –
  `OVERGROWTH.grazedMinShare`; nosnost `pastureHa(state, day)` stejně – přirozená louka bez luk
  letošní seče `naturalPastureHa`, otava a mladý příloh třetinou; stejnou funkcí
  `pastureGrazedParts` v `paths/village.ts` chodí
  pasáček v síti pěšin a pasou se stáda ve scéně – `SceneFieldPart.grazed`; seno se seče i na
  přirozených loukách do 600 m, ty nezarůstají), roční krok
  `overgrowthDay` 1. 11. před porážkou (jen díly ladem celé období od 1. 4.): nespasený a
  neposečený díl (`mownPartIds` v `hay.ts`) přidá `FieldPart.overgrowthYears`, pastva či seč ho ve
  fázi louky vynuluje, od křovin ne. Stadia `OVERGROWTH_STAGES` (5 křoviny, 15 mladý les, 30 les)
  → `fallowStage` / `PartStage` `shrubs`, `young-forest`; křoviny a mladý les nejsou pastvinou
  (`pastureHa`), nesečou se (`isHayMeadow`) a rádlo je nezorá; vrácení podle stadia
  (`RECLAIM_COST_PER_HA` – louka, křoviny, les) a mladý les dá klády (`reclaimedLogs`). Díl v lese
  z pole vypadne (`dropForestParts`, pole bez dílů zanikne, kronika `part-became-forest` s polem
  a počtem dílů, upozornění) do **lesa vsi** `VillageState.woods` (`woods.ts`: políčko, střed,
  plocha, povrch, den – stáří od 30 let): jeho stromy jsou překážky nad vrstvou jako stromy
  u cest (`obstacleChangesAt` → `added`, id `WOOD_TREE_ID_BASE` = 2^31 + políčko × 64 + pořadí,
  místa `woodTreeSpots`; 240/ha, dospělé od 15 do 70 let – `VILLAGE_WOOD`), kácí se na dřevo
  (`nearestMatureTrees`, `availableTrees`; i uhlíř – `isBeech` / `'beeches'` les vsi bere,
  pařezy se sazenicí přes `felledTreeStage`), pole na nich mýtí les (`buildSquares` – povrch les,
  stromy z `added` dají klády; `clearWoodAt` po založení dílu), ostatní stavby ho vyklučí jako les
  krajiny (Stavba v lese; les vsi bez stromů zmizí – `dropClearedWoods` v `recordClearedObstacles`).
  Prasatům je les vsi lesem (`pigForestHa`).
  Starší vsi začínají roky bez pastvy počítat od nuly.
- **Štěstí a posvátná místa** ([happiness.md](docs/design/happiness.md), `happiness.ts`,
  `sacred.ts`): štěstí 0–100 (`VillageState.happiness` – hodnota, úmrtí posledního roku, dny dřiny
  posledních 60 dní; chybí = 50) se den po dni posouvá o denní podíl k cíli
  (`happinessTarget` z `happinessFactors`: hlad, úmrtí, přeplněnost, dřina `isToilDay` – ves by
  běžící polní práce dnešním tempem nedodělala do konce oken –, zásoby, posvátná místa) – krok
  `updateHappiness` na konci dne. Násobí veškerou práci: `allocateDay` má jediný háček
  `productivity` (`villageLaborFactor`, 0,8–1,1; násobí se i kapacita v `sowingCapacity`).
  **Posvátné duby a háje** jsou čistá funkce vrstvy překážek – `sacredSitesOf(layer)` (mezipaměť
  podle vrstvy, ≈ 30 ms, jen přesná aritmetika – stejně v prohlížeči): posvátný dub = horní
  třetina velikosti dubů (`OAK_MODEL_HEIGHT_M` × měřítko) a nejvýš 5 stromů do 15 m, háj = aspoň
  6 dubů v 25 m s převahou dubů ≥ 65 %, čtverce háje po políčkách (`groveByTile`),
  `protectedTrees` = posvátné duby + stromy na čtvercích hájů. Ty se nikdy nekácí ani nemýtí:
  `nearestMatureTrees` a `availableTrees` je vynechávají, `cellObstacles` / `dwellingObstacles`
  / `polygonObstacles` mají parametr `keep`. Čtverce: dub zůstane stát (plocha dílu / čtverce sadu
  − 50 m²), čtverce háje se z pole, sadu i hřbitova vyjmou (`sacredCells` v náhledu = oranžové
  varování, `spared` = co se ušetří); hřbitov na čtverec s dubem nesmí. Obydlí, modla a svatyně
  nesmí pod korunu dubu ani na čtverec háje (`sacredUnder`), dub na vyklízené ploše obydlí
  zůstane (`DwellingPlacementCheck.spared`). Akce (`foundField`, `foundOrchard`, `foundCemetery`,
  `startNewDwelling`, `foundVillage`) dostanou `sacred` / `dwellingSpared` a ušetřená místa
  zapíší (`recordSpared` → `sacredOaks`, `groves`, kronika `sacred-spared`). **Modla a svatyně**:
  `checkSacredBuildingPlacement` (půdorys 4 × 4 / 30 × 30 m na louce i v lese, svatyně ≤ 1 m převýšení,
  jedna na ves), `startSacredBuilding` (stavba `kind` `idol` / `shrine` s `position`, dub(y) přes
  `planSacredWood` – nejbližší dospělé duby, ne posvátné; cena `sacredLaborManDays`), po
  dostavění `VillageState.sacredBuildings` (id = id stavby). Surovina předem `oaks`
  (`oakSupply`). Use-case `placeSacredBuilding` (`NO_OAKS`, `SHRINE_EXISTS`), server action
  `placeSacred`. Štěstí z míst `sacredHappiness(state, day, obstacles)` (stropy počtu a +40).
  **Stáří, život a štěstí posvátného dubu** (`sacred-life.ts`, čisté funkce vrstvy a dne – žádný
  stav vsi): `sacredOakLife(layer, id)` – stáří k roku 500 z velikosti (`oakAgeYears`, 150–400
  let), délka života 800–2000 let (`SACRED_OAK_LIFE`, Beta(2, 4) ze seedu z id a polohy dubu),
  den uschnutí v létě a pádu souše po 50–100 letech; `sacredOakNow(layer, id, day)` – stadium
  `alive` / `snag` / `fallen`, stáří (souš – ve kterém uschla), štěstí (`oakAgeHappiness` 1–10
  podle logaritmu stáří, souš 1, padlá 0; započítají se 3 nejvyšší). Simulace i souhrn proto
  dostávají vrstvu překážek (`happinessFactors(…, obstacles)`, `summarizeVillage(state, day,
obstacles)` – bez ní se dub počítá jako nejmladší); krok simulace `sacredOakEvents` zapíše do
  kroniky `sacred-oak-died` / `sacred-snag-fell` (upozornění přes `CHRONICLE_NOTICES`). Padlá
  souš už posvátným dubem není (panel, výběr, štěstí), místo ale zůstává chráněné vrstvou.
- **Strava a dobytek** ([diet.md](docs/design/diet.md)): jídlo dne `eatDiet` / `villageMeal`
  (`diet.ts`) – ovoce (jablka; v rozhraní „ovoce“) rovným dílem do zkažení 1. 3., čerstvé mléko
  a vejce, maso rovným dílem do zkažení 31. 8. (`daysUntilMeatEnd`; 1. 9. ráno se zbytek zkazí –
  `spoilMeat`, kronika `meat-spoiled`, upozornění; maso ze září a října do porážky – Martin:
  „uzené maso určitě také nevydrží 3 roky“), sýr do 1. 5. (`daysUntilMilking`), obilí
  dorovná; stropy ovoce 25 %, maso 40 %, mléko a sýr 30 %, luštěniny 25 % potřeby energie
  (`DIET`); luštěniny (`legumes.ts`) rovným dílem do sklizně 31. 7. (`daysUntilLegumeHarvest`).
  **Bílkoviny** (Martin 18. 10. 2026): 1,6 g na kg tělesné váhy (`PROTEIN`, `proteinNeedPerDay`
  – 20 / 60 / 58 kg), nasycení = energie × kvalita (`dietQuality` = 0,6 + 0,34 × bílkoviny +
  0,06 × ovoce; jen obilí ≈ 80 %). **Mléko a sýr** (`dairy.ts`): dojí se 40 % skotu a 50 % ovcí
  a koz v době dojení (`dailyMilk`, `DAIRY`), nevypité mléko → sýr (`cheeseFromMilk`,
  `VillageState.cheeseKg`, ztráta 15 %/rok). **Práce se zvířaty** (`animalCareNeed`,
  `ANIMAL_CARE`) jde **bokem** (Martin 19. 10. 2026 – dojení a péče ženy, pasení výrostci;
  population.md – Práce): z práce vsi nebere, dojí se vždy celé stádo; činnosti `milking`
  a `animal-care` jsou jen v `LaborDay.aside` (`asideWork` v `simulate.ts`) pro postavy.
  `VillageState.diet` nese jídlo posledního dne (energie, bílkoviny, kvalita, nasycení, podíly
  obilí / maso / mléko / vejce / ovoce / luštěniny – `legumes?`, starší jídlo bez něj). **Hlad z energie:**
  `nextStarvationDays` a přirážka úmrtnosti dostávají energii, porody a štěstí nasycení
  (`populationDay(state, day, satiation, energy)`, ovoce štěstí +5 – `HappinessFactors.fruit`,
  maso až +3 – `meatHappiness`, `HappinessFactors.meat`). Stáda `VillageState.livestock` (`livestock.ts`: počty
  s podílem kusu, mláďata 1. 4., porážka 1. 11. – nad nosnost a nejvýš polovina mláďat na maso,
  chovný pár zůstane; potřeba masa z bílkovin, které chybí i po luštěninách ze zásoby
  `meatNeedPerYear` / `proteinBudget`; vejce denně; `meatKg` se uzí 20 %/rok).
  **Stáda realističtěji** (diet.md, Martin 19. 10. 2026; čísla návrh Clauda podle rešerše
  `research/2026-10-19-herds-hay-meat.md`): roční ztráty `LIVESTOCK.lossPerYear` (ovce 12, kozy
  10, prasata 12, skot 6 %) po dnech (`herdLosses`, i z `young`); nosnost `winterTargets` –
  pastva a seno podle přednosti (`GRAZING_ORDER`: voli, ovce na vlnu `minSheep`, krávy `minCows`, ovce,
  kozy – napřed zarůstající příloh `goatBrowseHa`, zbytek krav), seno po ztrátách ve stohu
  (`winterHayAvailable`), prasata podle lesa celý rok, nejvýš podíl uhlídaný pasáky (`herding`);
  **chovné stádo podle potřeby** `sizeHerdsToNeed` – pár a krávy `breedingCows` (husbandry.ts:
  kráva na 2 domácnosti, 3 na ohradu), pak **rovnovážné hospodaření** (diet.md – Rovnovážné
  hospodaření; Martin 19. 10. 2026: „aby byla sytá, měla ± ideální kombinaci stravy, ale aby jí
  zároveň zbylo co nejvíc volného času na rozvoj“): cena jídla v práci `foodCosts` (`economy.ts` –
  čd na kg obilí a luštěnin z dílů v osevu, sena z plánu seče; ve vsi `villageFoodCosts`
  v husbandry.ts), kus za rok `headEconomy` (maso z mláďat, mléko × 0,85, práce vsi jen na seno
  a porážku; pasáci nic nestojí a plán je nepočítá – výrostci omezí stádo jen přes nosnost
  `winterTargets` s `herdingCoverage`); hladový výběr po kusech (luštěniny po `BALANCE.legumeStepKg`) podle práce mínus
  ušetřené obilí na kg bílkovin navíc proti obilí – napřed co práci šetří, vždy, v pořadí
  `BREEDING_ORDER` (ovce → kozy → krávy → prasata – Martin: ovce napřed) do nosnosti a stropů
  `DIET.caps`; pak do potřeby × 1,1 (`BALANCE.proteinReserve`) nejlevnější (přežvýkavci
  v pořadí, prasata a luštěniny cenou), nad 88 % (`minProteinCoverage`) jen bílkoviny levnější
  než z obilí. Týž plán `balancedPlan` (s luštěninami – zásoba luštěnin stádo
  nezmenší) řídí seč 1. 6. (`wantedWinterHerds`), luštěniny osevu 1. 9. (`plannedLegumeKg` →
  `sowingTargets`) i porážku 1. 11.; zbytek i dospělé kusy na maso, ale stádo v nosnosti jen
  o tolik masa, kolik ves do 31. 8. sní pod stropem (`keepUneatable`, `meatEatableKg` – zbytek
  žije; co přeroste nosnost, jde vždy – diet.md, Chovné stádo podle potřeby); stádo pod potřebou dá na
  maso navíc mláďata v pořadí prasata, krávy, kozy, ovce (`MEAT_ORDER`).
  **Nouzová porážka** (diet.md – Nouzová porážka, Martin 19. 10. 2026; `emergency-slaughter.ts`,
  `EMERGENCY_SLAUGHTER` v `rules.ts`): v `eat` před jídlem dne, když výhled do sklizně nevychází
  (`dayMealInput` – týž vstup `eatDiet` jako jídlo dne), ves porazí zvířata navíc – prasata, kozy,
  krávy nad `breedingCows`, ovce nad `woolSheep`, chovný pár zůstane (`emergencySpare`); nejméně
  masa, se kterým výhled vyjde i s rezervou `reserveShare` (5 % potřeby do sklizně – půlení
  v `emergencySlaughterPlan`, mléko zabitých dojnic se odečte), nejvýš kolik pod stropem masa
  (`DIET.caps.meat` platí i v nouzi) pomůže. Maso přes `butcher` (uzení, zkažení 1. 9.), práce
  mimo listopad `slaughterWork.emergency` (úloha `slaughter` hned), kronika `emergency-slaughter`
  (kusy), upozornění „Vesničané porazili 12 prasat navíc“ (`formatAnimals`). Prasata jen nad chovné
  prasnice (`emergencyPigFloor` – `EMERGENCY_SLAUGHTER.pigForestShare` 0,5 nosnosti lesa pro
  prasata jako ve `winterTargets`, aspoň chovný pár; Martin 19. 10. 2026). Letošní mláďata ne,
  kromě selat od 1. 9. (`pigletsSpared`, `EMERGENCY_SLAUGHTER.pigletsFromMonth`; Martin 19. 10.
  2026: „Ano ke všem návrhům“ – hladový podzim) – ta se počítají do prasat nad prasnicemi.
  **Oděv – vlna** (diet.md – Oděv; Martin 19. 10. 2026: „Ovce jsou hlavně kvůli vlně, aby se lidé
  mohli vůbec oblékat.“; `wool.ts`, `WOOL` v `rules.ts`): ovce na vlnu `woolSheep` (dospělý 1,6 kg,
  dítě 0,8 kg ÷ 0,8 kg z ovce) jsou spodní hranicí ovcí – `minSheep` ve `farmInput` →
  `winterTargets` (pastva a seno: voli, ovce na vlnu, krávy `minCows`, …; pasáci napřed ovce na
  vlnu – `watchedShares`) i `sizeHerdsToNeed`, maso navíc z mláďat je nebere; osadníci nové vsi
  `foundingLivestock` a seno na první zimu (`foundVillage` – `winterHayKg`). Vlna není
  zásoba – porážka zapíše podíl oděvu `LivestockState.wool` (`recordWool`, kronika `wool-short`,
  upozornění „Chybí vlna na oděv“ pod `WOOL.noticeBelow`), štěstí `HappinessFactors.wool` až −6 (`woolUnhappiness`); vsi
  bez zápisu (dřívější) beze změny do porážky 1. 11. Práce na vlně je v `DOMESTIC` (přerozdělení). Zimní úhyn 1. 3.
  (`starveHerds` z `herdHayCoverage` – pod polovinou přídělu, chovný pár přežije, kronika
  `herd-starved`). **Pasáci** (`herding.ts`, `HERDING`): plný pasák 40 krav (i voli), 100 ovcí či
  koz, 50 prasat, výrostek 7–13 let `childShare` 40 %; **pasou jen výrostci** (`isYoungster`,
  mimo práci vsi; dospělí ani starší ne – Martin 19. 10. 2026: „Když bude ve vsi málo vhodných
  dětí na pasení, tak to omezí i velikost stád.“); `herdingDay` – kolik výrostků dnes pase;
  přežvýkavci duben–říjen, prasata celý rok; `recordHerding` sčítá `LivestockState.herding` od
  porážky do porážky, `herdingCoverage` jde do porážky, `pastureGrazing` a pastvy; `LaborDay.herders`
  (výrostci u stád) → `SceneLabor.herders` → `herderKinds` ve `villager-plan.ts`. Porážka a uzení jdou před polními úlohami listopadu.
  Louka a les do 600 m pro pastvu jsou z krajiny ve stavu
  (`LivestockState.land`) – doplní je `withLivestockLand` (založení vsi i migrace v
  `updateVillage`); bez nich výchozí `LIVESTOCK.defaultLand`. Den hospodářství `husbandryDay`
  (`husbandry.ts`) běží před plánem osevu: ztráty stád a seno ve stohu, ohrady a zimní úhyn,
  mláďata, zkažené staré seno a plán seče, zkažené maso, porážka, zimní seno.
- **Ohrada, spřežení a orba rádlem** ([oxen.md](docs/design/oxen.md), `oxen.ts`, `plough.ts`,
  `hay.ts`): ohrada (`BuildKind` `'pen'`, `checkPenPlacement`, `foundPen`, use-case `placePen`)
  je čtverec louky, stavba se dřevem jako obydlí. **Výcvik spřežení začne sám** (Martin:
  „ve chvíli, kdy mají vesničané k dispozici cokoliv, co jim ulehčí práci – zde
  rádlo a voly – začnou to automaticky používat“ – princip pro celou hru, oxen.md – Spřežení):
  `trainTeamsWhenReady` v `husbandryDay` (po mláďatech 1. 4.) každý den, kdy `trainingBlock` je
  null – ohrada stojí, nic se necvičí, spřežení není nebo je v posledních 2 letech služby
  (`serviceYearsBeforeTraining`), aspoň 3 krávy, dřevo na rádlo, v zimě seno volům i telatům do
  konce března (`hayWinterDaysLeft`) – vezme 2 telata ze stáda a postaví rádlo (stavba `'ard'`
  ze společné práce); po 2 letech `Pen.team`, po 10 letech na maso; druhé spřežení = druhá ohrada.
  Hráč výcvik nezadává (akce, use-case i tlačítko zmizely). Seno `VillageState.hay` (seč 1. 6. z úhoru ve
  fázi louky a přirozených luk do 600 m od obydlí – `planMowing` s potřebou `winterHayNeedKg`
  (zimní stádo podle potřeby `wantedWinterHerds` + voli ohrad, se ztrátou do zkrmení
  `PLAN_HAY_KEEP`), práce `HAY_WORK_PER_HA` meze 15 → 10 čd/ha
  (`hayWorkPerHa`), dávky `HAY.dailyKg` kráva 5, vůl 6, ovce a koza 1 kg, stoh 10 %/rok (`rotHay`),
  zbytek loňského k 1. 6. shnije (`spoilOldHay`) – oxen.md, Seno, Martin 19. 10. 2026;
  `HayMowing.squares`,
  od nejbližší po pěšinách a pevných cestách (`partWalkDistance`, přirozené louky
  `walkDistancesTo` z `paths/village.ts` přes `walking.ts` – měří se jen louky v dosahu podle
  `FASTEST_WALK_SHARE`), jen kolik je třeba; pěšina k sečeným loukám – `PathVillage.hayMeadows`
  a práce `meadow`; sezónní úloha `mow`, vzhled políček `hayMeadowLooks`; zimní krmení `feedHay` –
  voli první, krávy, ovce a kozy poměrně; pokrytí volů `oxenHayCoverage` a stáda
  `herdHayCoverage` k 1. 3.). **Orba – jen rádlo** (oxen.md – Jen rádlo; Martin 19. 10. 2026:
  „Pokud je k dispozici rádlo, kopání motykou úplně vynech.“): plán s vycvičeným spřežením
  (`YearPlan.ard`) orá všechny díly všech plodin (`CropWork.plough` – `partIds` = díly plodiny,
  `required.dig` 0, i prázdná plodina orbu má, ať přidané díly orá – `addToCropWork` podle
  `work.plough`); drn (`hasSod` – příloh ve fázi louky, louka založená rádlem `FieldPart.sod`)
  `PLOUGH_SOD_FACTOR` (2,5×) práce a ve váze orby (`PloughWork.sodIds`), křoviny a mladý les
  vrácení ručně a pak běžná orba. Založení louky vsí se spřežením jen za překážky
  (`partFoundingCost(…, ard)`, díl dostane `sod`, bez překážek hotový hned – `foundPart` v `build`;
  u kurzoru `PlacementVillage.ploughTeam`). Plán osevu hlídá kapacitu spřežení
  (`SowingCapacity.plough` – okna orby, `fitsWinter` / `fitsSpringPlough`), co nezorají, se
  nezaseje (setí za `tilledShare`). Úloha `plough` v oknech kopání, nejvýš `ploughCapacityPerDay`
  (slabí voli po zimě `team.weak` od 1. 3.). Ztráta posledního spřežení: `finishPlanByHoe` →
  `ploughToHoe` – letošní plán dokončí motyka (kopání s hotovým podílem, kam došla orba). Starší
  plán s částí kopanou motykou doběhne (`digWeight`). **Co nejdelší brázda** (oxen.md; Martin 19. 10. 2026): `plough-blocks.ts` – `ploughLayout` rozloží díly plodiny na bloky (sousední díly
  pole) a pásy podél osy bloku (`furrowAxis` – delší průměrná brázda, Martin: i sever – jih;
  ve scéně textury a koruna dílu orby podél brázdy – `DecalPiece.rows`), bloky od
  nejbližšího, pásy napříč od vsi (`sweep`), U rameno po rameni; `CropWork.partIds` ve vsi s orbou
  v pořadí orby, `PloughWork.bands` (`PloughBand` – díly, osa, směr, blok). Díly pásu mají ve
  `field-progress` úsek celého pásu (`bandSpans`, `PartSpan.share` – podíl dílu; orba i setí),
  `PartView.furrow` → `SceneFieldPart.furrow`. Výkon `furrowEfficiency` (L / (L + v·t), `FURROW`)
  a cesta k bloku `plough-trip.ts` (`ploughDayFactor` – pás na čele orby, `PloughWork.trip` se
  spočítá při začátku bloku vozovou sítí `villageCartRoutes` jako dvoukolák, `travelShare`,
  `TEAM_TRAVEL`) násobí denní kapacitu v `fieldTasks`; plán osevu `plannedFurrowEfficiency`.
  Postup po dílech zná úlohu `plough`
  (`field-progress.ts`), rozdělení práce posílá činnosti `plough`, `mow`, `slaughter`, `pen`.
- **Hráč staví kdy chce** (Martin) – stavbu smí zablokovat jen **cena předem** (`costs.ts`:
  `BUILD_COSTS`, `buildAffordability`): suroviny ze zásob (dnes žádné) a u obydlí **lidé
  k osídlení** (`settlers` = `availableSettlers` v `households.ts`: možné nové domácnosti
  `possibleNewHouseholds` − prázdná − rozestavěná nová obydlí); pole a hřbitov lidi nechtějí.
  Tlačítko je pak zašedlé, zkratka nic nespustí, v popisku chybějící část červeně; server odmítne
  (`NO_SETTLERS`, `CANNOT_AFFORD`). `waitingHouseholds` (upozornění „Rodina čeká na dům“, dřív
  „Domácnost je plná“; `VillageSummary.fullHousehold`) = kladní lidé k osídlení.
- **Příbuzenství a pohlaví** ([kinship.md](docs/design/kinship.md), Martin 18. 10. 2026;
  `kinship.ts`): `Person.sex`, `motherId`, `fatherId`, `spouseId`, u nevěsty z okolí a lidí od
  souseda (výměna lidí – trade.md) `origin` (směr sousední vsi – válka); zemřelí a odešlí rodiče
  žijících v `VillageState.ancestors` (id a rodiče, jen dokud jsou rodičem někoho žijícího –
  `removePeople`), dcery vdané pryč a lidé daní sousedovi v `emigrants` (se směrem). `areCloseKin` (do bratranců), `hasCloseKinIn` (příbuzní ve vsi ve
  směru – war.md), `familyCounts` (muži, ženy, děti, starší, páry – panel obydlí a pohlaví postav).
  Staré vsi převede `withKinship` (v `updateVillage` i na začátku `advanceVillage`, bez příznaku –
  ves, kde mají všichni pohlaví, se nemění; `availableSettlers` počítá na převedené).
  **Porody** (`population.ts`) jen manželským párům: žena 16–44 s manželem od 16 let v témže domě,
  chlapec `BOY_SHARE` (105/205); šance podle věku ženy (`maritalFertility` – přirozená plodnost
  `NATURAL_MARITAL_FERTILITY` × `MARITAL_FERTILITY_LEVEL` 0,85, Martin 19. 10. 2026 „aby se
  populace co nejvíce rozrůstala“, čísla návrh Clauda – rešerše
  `research/2026-10-19-population-growth.md`) a **rozestup** `BIRTH_SPACING` (po porodu 21 měsíců,
  po svatbě a od založení vsi 9 měsíců – `Person.nextBirthFrom`; ve vsích uložených dřív od
  nejmladšího žijícího dítěte – `birthPauses`), potom `birthRatePerYear` (průměrný odstup =
  1 / plodnost věku). **Domácnost drží člověk 16–44** (`householdBreaksUp` v `people.ts`;
  osamělý 16–44 zůstává), rozpadlá jde k příbuzným (syn, dcera, sourozenec), jinak do domu
  s nejvíc místy – jen kam se vejde bez přeplnění, jinak zůstane doma (Martin; samotné děti jdou
  i do přeplněného).
- **Osídlení obydlí** (`households.ts`; population.md – Nové obydlí, kinship.md – Domácnosti): nové
  obydlí po dokončení (`settleNewDwelling`) a prázdné v kroku 6 (`occupyEmptyDwellings`) osídlí
  **rodina ženatého syna** (muž, žena, jejich svobodné děti – `familiesOf` / `leavingFamilies`)
  **z jakéhokoli domu** (Martin, 19. 10. 2026 – „ženatý pár, který dům nedrží, smí odejít kdykoli“;
  dřív jen z plné domácnosti), dokud se zbytek nerozpadá (`departingFamilies` – i lidé k osídlení;
  prázdný dům nejdřív rodina z nejvíc přeplněného domu, v něm od nejstaršího muže);
  dům drží jeden dědic – nejstarší ženatý syn s rodiči, v domě bez ženatého syna vdova s vlastními dětmi, jinak nejstarší ženatý muž; ostatní ženatí se oddělí (i muž bez rodičů v domě vedle dědice). Co zůstane prázdné,
  osídlí **svobodný nejstarší syn – jen z plného domu** (`loneSonOf`, Martin – „nejstarší dítě může
  odejít“, „ať prázdný dům obsadí i plná domácnost“; od 16 let, bez ženatého dědice a s neplodnou matkou zůstává nejstarší a jde druhý; bez syna jiný svobodný muž od 16 let bez rodičů v domě, ne otec dětí z domu – `lodgerOf`).
  Dcery odcházejí sňatkem. Ne z domácnosti, jejíž zbytek by se rozpadl, a jen kdo nový dům udrží
  (rodina i svobodný muž s někým 16–44 – starší pár by se v novém domě rozpadl, vrátil a odešel
  znovu: stěhování tam a zpět, kalibrace 19. 10. 2026). **Chátrá jen prázdné
  obydlí** (Martin: „obydlená budova nechátrá – obyvatelé ji opravují“): `decayEmptyDwelling` – bez
  oprav podle stáří a navíc pevný denní podíl, nové zanikne za `DWELLINGS[type].emptyLifespanYears`
  (zemnice 5, polozemnice 8 let). Obydlené stav neztrácí – opravy podle stáří (`repairNeedPerDay`)
  dál berou práci vsi, nedodělek se jen neudělá; přestavbu rozhoduje jen stáří (`wantsRebuild`).
- **Sňatky** (`marriage.ts`, kinship.md – Sňatky; Martin, varianta c; 19. 10. 2026: „Vdova by se
  měla snažit co nejdříve vdát, ideálně ve vesnici.“): svobodný = muž od 16 / žena 16–44 bez
  manžela, i vdova s malými dětmi (`isSingle`); vdova / vdovec = svobodný s dítětem
  (`isWidowed`, `parentIds` – bez příznaku, pozná se i ve starých vsích). V kroku 6 po osídlení
  obydlí se berou nepříbuzní muž a žena – **vdovy a vdovci první**, pak od nejstaršího, nejbližší
  věkem (`bestMatch`), rozdíl do `MARRIAGE.maxAgeGapYears` (s vdovou či vdovcem
  `maxAgeGapWidowedYears` 20). Kam (`weddingHome`): **žena k muži**, i do přeplněného domu; drží-li
  dům ona a on ne (`holdsHome` – po jeho odchodu s dětmi do 16 by doma nezůstal nikdo 16–44), **on
  k ní**; drží-li oba, kde bude méně těsno, při shodě žena. Stěhuje se i s vlastními dětmi do 16
  (`dependants`); nevěsta dostane `nextBirthFrom` (9 měsíců). Okolí (`MARRIAGE.outside`, los ze
  seedu a dne, kdo nemá s kým): muž od 18 nevěsta 30 % ročně (16–22, staršímu nejvýš o povolený
  rozdíl mladší, `origin`); žena od 18 ženich z okolí 10 % ročně (vdova, dědička – `holdsHome`
  – a žena z domu bez mužů 50 %, `favouredBride`), jinak pryč 20 % ročně (záznam v `emigrants`;
  vdova, dědička ani žena z domu bez mužů ne); v hladu a do přeplněného domu z okolí nikdo.
  Kronika `marriage` (`groomMoved`, `widow`), `bride-from-outside`, `groom-from-outside`
  (`widow`), `married-away`; upozornění „Svatba“ (`VillageView.lastMarriageDay`), „Nevěsta
  z okolí“, „Ženich z okolí“, „Dcera se vdala pryč“.
- **Přestěhování domácnosti** ([migration.md](docs/design/migration.md), fáze 1): akce
  `startRelocation` (`actions.ts`) = nová stavba obydlí (`kind: 'dwelling'`) s
  `Construction.relocates` = id domácnosti – dřevo, pozemek polozemnice, překážky a cena jako
  `startNewDwelling`, jen **bez lidí k osídlení** (`relocationAffordability` v `relocation.ts`;
  `availableSettlers` přestěhování nepočítá). Domácnost, která si staví nový dům, starý
  nepřestavuje (`relocatingHouseholds` v `decideRebuilds`) a znovu se stěhovat nemůže
  (`relocationBlock`: prázdné obydlí, už se stěhuje, přestavuje). Po dostavění se obyvatelé
  přestěhují (`moveRelocatedHousehold` ve `finishConstructions`, kronika `household-relocated`),
  starý dům zůstane prázdný – dál ho řeší běžná pravidla (osídlení, chátrání, rozpad, zbytek
  jámy). `cancelRelocation` stavbu zruší, klády z hromady i skácené stromy vrátí na hromadu
  (`returnConstructionWood`). Use-casy `relocateHousehold` a `cancelHouseholdRelocation`
  (`relocate-household.ts`, důvody česky `RELOCATION_BLOCKED`, `NO_RELOCATION`).
- **Víc vsí jednoho hráče** (migration.md, fáze 2): sídlo (`settlement`) = mapa s krajinou,
  na jedné mapě může být víc vsí (`village.id` je primární klíč, `settlement_id` jen cizí klíč);
  nová mapa = nové sídlo s polohou v mřížce map (`settlement.grid_x` / `grid_y`, port
  `Settlement.worldCell`, `SettlementRepository.create` – mřížka je zatím každého hráče zvlášť,
  políčko nejvýš jedno aktivní na hráče; `assignWorldCell` dá sídelnímu sídlu (0, 0)).
  Port `VillageRepository` jde podle id vsi (`find`, `save`, `rename`), `listBySettlement`,
  `create` (první ves sídla – atomicky, zámek řádku sídla) a `add` (další ves). Use-casy berou
  `villageId`; `findPlayerVillage` ověří, že ves patří hráči (sídlo mezi jeho aktivními),
  `firstPlayerVillage` = výchozí ves (sídelní sídlo první). `dynastyStatus` projde všechny vsi
  všech aktivních sídel (konec hry až po vymření všech), `restartGame` archivuje všechna sídla.
  `foundAnotherVillage` = další ves téhož sídla nejméně `NEW_VILLAGE_MIN_DISTANCE_M` (300 m)
  od staveb ostatních (`villages-apart.ts`).
- **Odchod do nové vsi** (migration.md, fáze 3 a 4; `departure.ts`): `departVillage` – domácnosti
  vybraných obydlí odejdou celé (rodokmen – rodiče osadníků jako předci, odešlí ve staré vsi
  v `ancestors` / `emigrants` se směrem), s jídlem `leavingFood` (`LEAVING`: 25 kg na člověka od
  7 let, nejvýš poměrný díl zásob, ze všech zásob stejný podíl) a poměrným dílem stád; domy
  zůstanou prázdné, kronika `households-left`. Odejdou-li všichni, `abandonedDay` + kronika
  `village-abandoned` – ves se nesimuluje (`isVillageDormant` v `advanceVillageSteps`: vymřelá,
  opuštěná, na cestě), akce odmítne `updateLivingVillage` (`VILLAGE_ABANDONED`,
  `VILLAGE_TRAVELLING`), pohled ji ukáže přes `abandonedVillageAt` (domy chátrají podle dne
  odchodu, pak jámy; pole ladem); `isGameOver` ji počítá jako mrtvou. Nová ves z osadníků:
  `foundVillage({ settlers })` – jedna domácnost na staveništi první zemnice, id lidí ze staré
  vsi. Use-case `leaveVillage` (`leave-village.ts`): na téže mapě (`here` – místo první zemnice
  ověří proti stavbám všech vsí mapy a 300 m dřív, než lidé odejdou, pak `add`), nebo na novou mapu
  (`map` – sídlo vedle ve směru `neighbourCell` z `world-grid.ts`, `generateAcceptedLandscape`,
  prázdné vlastní sídlo na políčku se použije znovu, vlastní ves tam → `OWN_MAP_THERE`; ves na
  cestě `travellingVillage` s `VillageState.journey`, dny `travelDays` – 1–3 podle
  `edgeDistanceM` od dvorce, po hotové stezce 1). `settleJourney` po příjezdu založí ves
  (`settlersOf`). **Vsi na téže mapě o sobě vědí:** `neighbourSnapshot` (`neighbourhood.ts`) –
  stavby a políčka jiných vsí mapy (natočené čtverce polí, sadů, hřbitovů, ohrad a lesa
  s mřížkou zvlášť v `squares`, natočený pozemek jen jako tvar obydlí – fields.md, Natočené
  stavby), jejich
  odstraněné, pokácené a vyhrazené stromy;
  `updateVillage` ho připojí (`withNeighbours`, jen když na mapě jiná ves je – otisk napřed)
  a před uložením odebere. `obstacleChangesAt` a `reservedTrees` ho započítají (kácení se
  nekříží), `placementVillageOf` dává `PlacementVillage.foreign` – kontroly umístění
  (`checkFootprintFree`, čtverce `foreign`, pozemky – rejstřík cizí půdy `foreignIndex` podle
  skutečných ploch) odmítnou `FOREIGN_LAND`; v prohlížeči totéž `foreignFromScene`.
- **Determinismus:** simulace jde den po dni v pevném pořadí kroků (`simulate.ts`), náhoda dne
  je ze seedu vsi a indexu dne – výsledek nezávisí na tom, po jakých kouscích se ves dopočítá.
- **Dopočet po kouscích na serveru:** `advanceVillageSteps` je `advanceVillage` po dnech
  (generátor – tatáž smyčka, stav se klonuje jednou). `loadVillage` / `dynastyStatus` dostanou
  port `Pause` (`application/villages.ts`) a mezi dny se ptají, jestli počkat; web
  (`lib/compute-pause.ts`, v `dynastyDeps`) po ≈ 50 ms počítání v kuse pustí přes `setImmediate`
  ke slovu ostatní požadavky – dopočet po dlouhé nepřítomnosti nebo přeskok o 10 let neblokuje
  server (jedno vlákno). Jeden drahý den (přepočet sítě pěšin) se nedělí. Výsledek na
  přestávkách nezávisí (test v `villages.test.ts`).
- **Čísla** pravidel jsou jen v `rules.ts` (u každého odkaz na sekci návrhu); změna čísla = i
  text v návrhu. Kalibrace: `measure-village.ts` nasimuluje stovky vsí a vypíše cíle z Kalibrace
  obou dokumentů s OK / MIMO (`--quick` = 50 vsí na denní ladění, `200 60` závěrečné ověření,
  `100 1000` vymření do roku 1500). Vsi stojí na skutečných krajinách sídel (`--land real`,
  vrstvy `CURRENT_LAYER_VERSIONS`; hráč zakládá čtverce podle úrody za člověkoden –
  `scripts/lib/calibration-land.ts`), `--land v1` je syntetická louka 35 ha ze starších měření;
  sondy pevných domácností běží vždy na syntetické louce s úrodností 70. Běží na pozadí (nice 19,
  polovina jader, `--workers N`, `--eco` jen úsporná jádra – ≈ 6× pomalejší) a s
  `--out soubor.jsonl` si hotové vsi ukládá – přerušený běh (Ctrl+C) stejný příkaz dokončí, po
  změně pravidel nový soubor; `--report-only` vypíše tabulku z hotových vsí bez počítání (i u
  běhu, který stojí). Varianty pravidel jen pro kalibraci: `--variant meadow-burn` (pálení
  drnu). Řádek **Práce – hráč staví** sčítá rozdělení práce dne po skupinách (volná práce, pole,
  seč, porážka, denní minimum – hráč, který staví, se proto dopočítává den po dni – `trackLabor`).
  Ustálený stav bez simulace (osev, pole, práce po měsících, špičky, zásoby, dřevo, sad)
  okamžitě: `village-calculator.ts` (jádro `scripts/lib/steady-state.ts`). Kopii stavu na začátku
  `advanceVillage` dělá `cloneState` (`clone.ts` – ručně, stav jsou data jako v JSON) a stavby polí
  hledají zakládané díly v indexu po polích – obojí kvůli rychlosti, výsledky stejné.
- **Meze produktivity** (Martin): čísla s rozpětím v literatuře jsou v `rules.ts` dvojice
  `{ worst, best }` – **nejhorší mez** (nejvíc člověkodní, nejvyšší ztráty – bez řemesel)
  a **nejlepší mez** (plně pokrytá potřeba výrobků řemeslníků); řemeslníci zvyšují produktivitu
  = snižují pracnost od `worst` k `best`. V textech nepsat „horní / dolní mez“.
  Hodnotu podle pokrytí 0–1 dávají funkce v `productivity.ts` (`withinBounds`, `fieldWorkPerHa`,
  `storageLossPerYear`…). Pokrytí počítá `craftCoverage` (crafts.ts) ze zásob vsi na začátku
  dne v `simulate.ts`; `NO_CRAFTS` (pokrytí 0) jen pro ves bez řemesel a testy. Zdroje čísel
  jsou v rešerších `docs/design/research/`.
- **Web:** server actions `app/game/actions.ts` (`getVillageView`, `selectVillage`, `foundVillage`,
  `foundDevVillage`, `placeDwelling`, `relocateHousehold`, `cancelRelocation`, `leaveVillage`,
  `settleJourney`, `placeWorkshop`,
  `placeField`, `placeCemetery`, `placeOrchard`, `placeSacred`, `placePen`,
  `buildTrail`, `sendExpedition`, `renameVillage` → `VillageView` / `null` / `{ error }`; `restartGame(input?)` → `{ ok: true }` /
  `{ error }`). **Každá akce nad vsí nese `villageId`** (UUID – `villageIdOf` v
  `lib/village-input.ts`) a server ověří, že ves patří hráči (`context` v `lib/village.ts` →
  `findPlayerVillage`); `getVillageView({ villageId: null })` = první ves hráče (zakládá-li ves,
  null), založení první vsi jde na sídelní sídlo. Composition root `lib/village.ts` (pohled na ves
  dopočítá všechny vsi hráče – přepínač a konec hry), `lib/village-view.ts` (DTO, smí i do
  prohlížeče – `id`, `settlementId`, `villages` pro přepínač, `relocation` cena nového domu bez
  lidí k osídlení), `lib/village-list.ts`, `lib/relocation-view.ts`. Vybraná ves se pamatuje
  v cookie, kterou zapisuje prohlížeč (`lib/village-choice.ts` – zápis cookie v server action by
  Next.js odpověděl novým vykreslením stránky a novou scénou); stránka /game ji přečte
  (`lib/village-cookie.ts`) a otevře přes `gameEntryForPlayer` (`lib/game.ts`), cizí nebo
  archivovaná ves → první ves hráče. Typy pro scénu jsou odvozené odtud a z `@bohemia/game` – nedefinovat je znovu ve scéně.
- **Dotazování na ves** (`VillageGame` + `hooks/use-polling.ts`): klient se zeptá na začátku
  dalšího herního dne hráče (`nextPollDelayMs` v `lib/village-polling.ts` – začátek dne po dni
  pohledu přes `realTimeOf` + 1 s, nejdřív za 5 s, nejpozději za 86 s; po návratu do panelu hned). Pošle
  `{ villageId, known }` – `known` = `VillageView.stamp`, otisk pohledu (`villageViewStamp`
  v `application/village-stamp.ts`: vybraná ves, den, id + jméno + verze všech vsí hráče –
  pohled je čistá funkce těchto údajů). Server (`villageViewIfChanged`) nejdřív levně
  (`currentVillageViewStamp` – sídla hráče a `VillageRepository.stampsOf`: id, jméno, verze
  a `state->>'lastDay'` bez stavu) a při shodě, když jsou všechny vsi dopočítané do dneška,
  vrátí `{ unchanged: true }` bez načtení stavů (Vlkov: celý řádek ≈ 830 kB / 50 ms, dotaz na
  něj jde v celé cestě 3×). Akce a přeskok času vracejí vždy celý pohled. Změna jména verzi
  nemění, proto je jméno v otisku zvlášť. e2e testy po přímé změně uložené vsi volají háček
  `pollVillage` (`lib/e2e-hooks.ts`) – sám by dotaz přišel až s dalším herním dnem.
- **Uložení vsi** (`save`) vrací jen id, sídlo, jméno a verzi – záznam nese předaný stav (ne kopii
  z databáze).
- **Rozhraní jako v 0 A.D., bez popisků a průvodce** (Martin): `components/game/VillageGame.tsx`
  skládá `hud/` – `TopBar` (jméno vsi = přepínač vsí `hud/VillageSwitcher.tsx` – klik otevře
  seznam vsí hráče se jménem a lidmi, klik na ves ji přepne – ves na téže mapě na místě, na jiné
  mapě novým načtením stránky; přejmenování dvojklikem nebo tužkou; upozornění z jiné vsi
  krátkým řádkem se jménem vsi – `otherVillageNotices`; ikony s čísly: lidé, obilí, luštěniny
  (ikona `legumes`, když jsou v zásobě, na poli nebo v jídle – `showsLegumes`), maso,
  sýr (ikona `cheese`, v popisku mléko za den) když je mléko nebo sýr, ovoce (jablka) jen když
  jsou nebo je sad, seno s ohradou, klády, uhlí / nástroje / keramika jen ves s řemesly, volná
  práce, nasycení (barva ikony podle energie – hlad, tooltip nasycení s energií, bílkovinami
  a podíly obilí / luštěniny / maso / mléko a sýr / vejce / ovoce), štěstí, datum – obnoví se
  na začátku dalšího herního dne, ne každou sekundu (`dateRefreshDelay` v `lib/game-date.ts`);
  zvuk a tlačítko nabídky),
  `GameMenu` (nabídka hry jako v 0 A.D. pod lištou vpravo, F10 – smí mít slova: Začít znovu,
  Odhlásit s e-mailem v popisku, Zpět do hry; Začít znovu se živou vsí jen po potvrzení v panelu,
  bez dialogů prohlížeče, při zakládání vsi zamčené; otevření zruší umisťování i výběr, klávesy
  hry zachytí na `window` ve fázi capture, Esc zavře – z potvrzení vrátí –, klik mimo panel zavře
  a do krajiny nedojde; po konci hry se neotevře; logika kláves v `lib/game-menu.ts`), `Minimap` (vlevo dole, `lib/minimap.ts`,
  klik / tažení přesune pohled; krajina a ves se kreslí jednou do vrstvy v rozlišení plátna
  – `drawMinimapVillage` – a při pohybu kamery se přes ni kreslí jen záběr – `drawMinimapView`), `SelectionPanel` (dole uprostřed, jen při výběru,
  `lib/selection-details.ts`; **roste s obsahem** (Martin 19. 10. 2026 – text se nesmí zalamovat
  ani být nahňácaný): `w-max` a `whitespace-nowrap`, meze v `hud-selection` (globals.css – na
  středu mezi minimapou a mřížkou staveb, nejvýš 70 % okna, širší obsah se zalomí po celých
  položkách – řádky `ROW` s `flex-wrap`; na okně pod 55rem stojí nad nimi, svislý posuv
  `useOverflowScroll` až když přeroste výšku okna – ořízl by popisky); příkazy (dvorec, Přestěhovat,
  Odejít, vylepšení cesty) vpravo za čarou – `Commands`, `hud-split` / `hud-commands`, na okně
  55–72rem pod údaji; rozbalené nabídky (růžice stezek a odchodu, obchod) nad panelem u pravého
  okraje – `hud-popup`, zavře je stisk myši mimo ně (`hooks/use-dismiss.ts`); popisky (`Tooltip`)
  se zalomit smí – `whitespace-normal`; náhled bez hry s nejbohatšími daty:
  http://localhost:3010/dev/panels (`?panel=dvorec`, `ohrada`, `pole`, `pole-dil`… – `app/dev/panels/dev-panels.ts`,
  i seznam vsí a nabídka hry); u obydlí a víc vybraných obydlí – počet domácností a lidí –
  tlačítka Přestěhovat po typu nového domu a Odejít – růžice odchodu `LeaveCompass`: uprostřed
  nová ves na téže mapě (umístění první zemnice nejméně 300 m od staveb všech vsí mapy, pak se
  rozhraní přepne), kolem 8 směrů nové mapy (dny cesty, lidé a jídlo v popisku, směr s vlastní
  vsí zašedlý) –, průběh stěhování se Zrušit – `hud/RelocationControls.tsx`; u víc domácností se
  nové domy umisťují postupně, po umístění jednoho hned další jako Shift + klik; ves na cestě
  ukáže řádek `JourneyBanner` a po příjezdu nabídne jen zemnici – `settleJourney`; stavby jiných
  vsí na téže mapě se kreslí s vlastními a nevybírají – `lib/scene/neighbour-villages.ts`,
  `SceneVillage.neighbours`, pohled `lib/departure-view.ts`), `BuildGrid` (vpravo dole), `NoticeLines` (mizející řádky nahoře),
  `CursorReason` (jde s kurzorem při umisťování: u prošlého umístění **cena ikonami s čísly** –
  práce celkem v člověkodnech i s překážkami, u obydlí i s kácením, a ikona stromů s počtem
  stromů ke kácení, když nestačí klády, u modly a svatyně ikona dubu s počtem dubů ke kácení –
  `PlacementCost` z `lib/build-items.ts`, obydlí přes
  `dwellingPlacementCost` = `planDwellingWoodFrom` + `dwellingLaborManDays` z jádra jako při
  zahájení stavby, modla a svatyně `sacredPlacementCost`; pod ní oranžově `check.warning`, které
  stavbu neblokuje – hřbitov blízko obydlí nebo vody, obydlí blízko hřbitova, posvátný dub nebo
  háj zůstane stát; když umístění nejde, místo ceny krátký červený důvod). Kromě důvodu a varování u kurzoru žádná slova ani souhrny – **výjimka:** v panelu obchodu dvě
  hlavičky sloupců „Dáš“ a „Dostaneš“ (se šipkou ze vsi ven / do vsi, jako „Prodat“ a „Koupit“
  v 0 A.D. – Martin 19. 10. 2026, trade.md – Rozhraní). Popisky = `hud/Tooltip.tsx`, jeden krátký
  název (u staveb i cena). Vzhled panelů: třídy `hud-*` v `app/globals.css` (tlačítko se slovy
  `hud-button`). Komponenty se testují statickým renderem (`react-dom/server`, JSX převádí
  `vitest.config.ts`) – panel bez stavu zvlášť (`GameMenuPanel`). Ikony
  `public/icons/build/` a `public/icons/resources/`. Panely, nad kterými se krajina neposouvá
  okrajem okna, mají `data-hud-block`.
- **Katalog staveb** `lib/build-items.ts` (název, ikona, zkratka, umístění `footprint` /
  `plot` / `squares` / `sacred` / `workshop`, kontrola) – nová stavba = záznam tam, cena v `BUILD_COSTS` a server action
  v `SUBMIT_SQUARES` (`VillageGame`); mřížka, zkratky i malování po čtvercích se nemění. Stavba,
  kterou nejde zahájit z jiného důvodu než surovin (druhá svatyně), má v `BuildOption.blocked`
  důvod – v popisku červeně. Panel výběru umí i posvátný dub, háj, modlu a svatyni (ikona,
  kolik přidávají štěstí, průběh stavby a duby ke kácení); u posvátného dubu i jeho stáří
  (u háje nejstaršího dubu) – `oakAgeYears` v `sacred-life.ts` z velikosti dubu (150–400 let
  k roku 500, `OAK_AGE`) + herní roky do dneška hráče, ve `VillageSacred` jako `ageYears`;
  uschlý dub (`snag`) má portrét posvátné souše (`icons/build/sous.png`).
- **Založení vsi:** dokud ves není, mřížka nabízí jen zemnici – její umístění ves založí
  s navrženým jménem (`suggestVillageName`). Pole není podmínkou. Zemnici si osadníci teprve
  postaví (stavba s `dwellingId` = id jejich domácnosti; do dostavění bydlí na staveništi, pak
  se nastěhují – `finishConstructions`). Domácnost = `Person.dwellingId`, i když obydlí ještě
  nestojí (`householdCount` v `simulate.ts`, porody po domácnostech). Starší uložené vsi se
  zemnicí od založení se dopočítají beze změny.
- **Ovládání (jako 0 A.D., hraje se i na trackpadu):** výběr `village-picking.ts` (rámeček
  `selection-highlight.ts`, výběr víc obydlí `village-selection.ts` – `VillageTarget`
  `dwellings`), kamera `camera.ts` (čisté funkce `camera-input.ts`,
  `edge-scroll.ts`). Kliknutí = do 6 px pohybu (`CLICK_SLOP_PX`), delší tah je tah. Dvojklik =
  druhé levé kliknutí do 400 ms a 6 px od prvního (`nextClick`, `DOUBLE_CLICK_MS` v
  `camera-input.ts`; tah, pravé tlačítko i umisťování řadu přeruší) – `onSelect` ho ohlásí jako
  `double`.

  | Vstup                  | Nic se neumisťuje                                                | Obydlí (`village-placement.ts`) | Po čtvercích (`field-painting.ts`) |
  | ---------------------- | ---------------------------------------------------------------- | ------------------------------- | ---------------------------------- |
  | levé kliknutí          | vybere obydlí / díl pole / čtverec sadu / hřbitov, na zemi zruší | postaví, Shift + klik staví dál | přepne čtverec                     |
  | dvojklik               | celé pole / celý sad (jinde jako klik)                           | jako dvě kliknutí               | jako dvě kliknutí                  |
  | levé tažení            | posouvá krajinu (uchopená mapa)                                  | –                               | přidá obdélník, s Ctrl (Cmd) ubere |
  | Ctrl / Shift + klik    | přidá obydlí k výběru, vybrané ubere                             | Shift + klik staví dál          | Ctrl (Cmd) + klik čtverec ubere    |
  | Ctrl (Cmd) + A         | vybere všechna hotová obydlí vsi                                 | –                               | –                                  |
  | mezerník + levé tažení | posouvá                                                          | posouvá                         | posouvá                            |
  | prostřední tažení      | posouvá                                                          | posouvá                         | posouvá                            |
  | pravé tlačítko         | zruší výběr                                                      | zruší                           | zruší malování                     |
  | Esc                    | zruší výběr                                                      | zruší                           | zruší tah, pak malování            |
  | F10                    | otevře nabídku hry, zruší výběr                                  | otevře nabídku, zruší           | otevře nabídku, zruší malování     |
  | `[` / `]`              |                                                                  | otáčí po 15° (pozemek celý)     | otáčí mřížku po 15° (všechny)      |
  | Tab                    |                                                                  | pozemek: místo domu (varianta)  | –                                  |
  | další                  |                                                                  | Enter postaví                   | Backspace / Ctrl+Z vrátí, Enter    |

  Vždy: WASD / šipky a kurzor u okraje okna posouvají, kolečko i rozevření prstů na trackpadu
  (Ctrl + kolečko, v Safari `gesturechange`) přibližují, Q/E otáčí, R vrátí pohled na ves
  (`setCameraHome`). Malování pole, sadu, hřbitova a ohrady: [ a ] jen před prvním čtvercem
  (pak je mřížka zamčená), nad stavbou stejného druhu se malování chytí její mřížky (`gridAt`,
  drží ji i mimo ni – rozšíření), vybraná stavba dá mřížku hned (`PlacementMode.squares.grid`);
  natočená mřížka má čtverec pod kurzorem ve středu políčka. Ctrl ve výběru obydlí platí i jako Cmd; Ctrl / Shift + klik na cestu či
  pole vybraná obydlí nezruší; Ctrl + A při umisťování nic nevybere. Zkratky staveb Z zemnice, X polozemnice, C pole, V hřbitov, B sad,
  N modla, M svatyně, O ohrada (modla a svatyně se umisťují půdorysem jako obydlí – `PlacementMode`
  `sacred`). V otevřené nabídce hry žádná klávesa hry neběží – F10 nebo Esc ji zavře (Tab jen
  po jejích položkách). Rozhraní
  obydlí hned ukáže jako staveniště a akce posílá na server za sebou (fronta v `VillageGame`).

- **Výběr dílu pole a čtverce sadu** (fields.md – Co hráč vidí; Martin 19. 10. 2026: „Když
  kliknu na pole, zobrazí se mi jen to jedno políčko s parametry. Když dvojkliknu, označí se
  celé pole jako teď.“): `pickVillageTarget` vrací `{ kind: 'field-part', id: pole, cell }`
  a `{ kind: 'orchard-square', id: sad, cell }` (čtverec v mřížce stavby), `nextSelection(…,
double)` je dvojklikem rozšíří na celé pole / sad (`wholeTarget`; první klik vybere díl hned,
  dvojklik na ostatní je jako klik), `presentTarget` zahodí díl, který zanikl. Hřbitov se vybírá
  celý (hroby, plot – rozhodnutí Clauda). Obrys čtverců (díl, pole, sad, hřbitov, háj, ohrada)
  má v `SelectionHighlight` druhou průsvitnou kopii bez testu hloubky – prosvítá přes korunu
  vystouplého obilí a stromy. Data panelu: `VillageView.fields[].parts` (`VillageFieldPart` –
  úsporně, výchozí údaje chybí: výměra jen u neúplného čtverce, přirozená úrodnost jen když se
  liší, `holding` = obydlí hospodářství z `villageHoldings`, `work` = `partYearWork` z
  `field-progress.ts` – plodina, příprava půdy `reclaim` / `plough` / `dig`, setí, sklizeň, seč;
  rok osevu, roky ladem, zakládání), `VillageOrchard.cells` (`VillageOrchardSquare` – stáří,
  `squareExpectedYieldKg`, výsadba, obnova, cesta); co je vidět (vzhled, stadium, zarůstání,
  pastva) bere `selectionDetails` ze scény (`selectedFieldPart`, `selectedOrchardSquare`).
  Panel: `FieldPartBody` / `OrchardSquareBody`, název pod portrétem `fieldPartName` /
  `orchardSquareName`, dům hospodářství je tlačítko (`onSelectTarget` ho vybere); ikony
  `resources/harvest` (srp s klasy) a `resources/walk` (šlépěje – cesta z domu). Při malování
  po čtvercích vybraný díl dá mřížku svého pole (`wholeTarget` ve `startBuild`).
  `/dev/landscape` vybírá jako hra (čísla panelu odhaduje `app/dev/landscape/dev-selection.ts`),
  `/dev/panels?panel=pole-dil` (`pole-dil-priloh`, `pole-dil-zaklada`, `sad-ctverec`).
- **Natočené stavby** ([fields.md](docs/design/fields.md) – Natočené stavby; Martin 18. 10. 2026:
  „Je to 3D, takže všechny stavby by měly jít natáčet po 15 stupních“): `square-grid.ts`
  (deterministická vrstva – přesné cos/sin násobků 15° z odmocnin, `rotationTurn`,
  `rotationCosSin`, `squareCenter` / `squareCorners` / `gridCellAt` v mřížce, `normalizeGrid`,
  `rotatedSquareCorners`, `squareKey`, `sameGrid`) – pole a sad mají volitelnou mřížku
  `Field.grid` / `Orchard.grid` (`SquareGrid` – střed čtverce 0, 0 a natočení 15–75°, čtverce
  dílů v ní), pozemek `DwellingPlot.square`, les vsi z natočeného pole `VillageWood.grid` (id
  stromů `woodIdCell` – buňka 7,5 m pod středem), zabraný kus `TakenLand.grid`. Bez mřížky =
  mřížka krajiny, všechno bit po bitu jako dřív. `squares.ts`: čtverce staveb ve světě
  (`villageLandSquares`, `fieldGrids`, `fieldGridOf`) a rejstřík `PolygonIndex` po políčkách (dva
  čtverce v mřížce krajiny podle rovnosti políček, jinak `polygonsOverlap`; `containing` pro
  paty překážek), `tilesUnder`. Kontroly v `placement.ts` (tvary `Shape` – `plotShapes`
  v `plot-cells.ts`): krajina pod natočeným čtvercem 5 × 5 body (`sampledGround` – voda
  kterýkoli bod, les většina, úrodnost průměr), překážky s patou v mnohoúhelníku
  (`squareObstacles`, vlastník překážek test bodu – `OwnedLand`), zabraná půda průnikem
  (`takenSquareLand`, `takenLandUnder`), navazování jen ve stejné mřížce (`fieldsTouching`
  s mřížkou, `withMergedFields` po mřížkách), les vsi jen přesným čtvercem (`woodEdge`).
  `fieldPartsFromCells` / `orchardPartsFromCells` a use-casy `placeField` / `placeOrchard` berou
  `grid`, akce `foundField` / `foundOrchard` mřížku uloží. Hospodaření, síť pěšin (`PathSquare.rotation`,
  `squareCells` v mřížce), louky na seno, stromy u cest, zbytky jam a vzdálenosti vsí znají
  mřížku. **Hřbitov** (Martin 19. 10. 2026) má mřížku `Cemetery.grid` jako pole
  (`cemeteryPartsFromCells(…, grid)`, `touchingCemeteries` jen ve stejné mřížce, vzdálenost od
  obydlí v osách čtverce – `distanceToSquare(…, rotation)`, od vody `squareWaterDistanceM`
  – nejkratší vzdálenost natočeného čtverce od políčka vody), **ohrada** je čtverec natočené
  mřížky `Pen.grid` (`checkPenPlacement(…, grid)`, střed z mřížky – volný střed jako pozemek
  zatím ne, rozhodnutí Clauda), use-casy `placeCemetery` / `placePen` a server actions berou
  `grid`. Scéna: čtverce nesou `rotation`
  (`SceneFieldPart`, čtverce sadu a hřbitova, `ScenePen`, `SceneWood`, `ScenePlot`), plot
  a hroby hřbitova v rovném prostoru jeho mřížky (`cemetery-layout.ts`), ohrada celá v osách
  čtverce (`penLayout` – `turnedLayout`, `penToFlat`, `PenLayout.rotation`), `field-cells.ts` počítá v „rovném
  prostoru“ mřížky (`gridFrame` – `toSpace` / `toWorld`, `inFrame`, `squaresContain`,
  `structureGridAt`, `squareContains`), pole se kreslí v rovném prostoru a otočí do světa
  (`field-space.ts`), jabloně v řadách os sadu, výběr, minimapa, stáda, postavy, vymýcený les
  a plochy pod polem (`fieldClearings`) natočené čtverce znají. `/dev/landscape` tlačítko
  **Natočené stavby** (pozemek 15°, pole 30°, sad 45°, hřbitov 60° s hroby, ohrada 15°; hřbitov
  jde malovat natočeně).
- **Stavby po čtvercích** (pole, hřbitov; políčka krajiny 15 × 15 m, díl = políčko – pole, sad,
  hřbitov i ohrada i v natočené mřížce, viz Natočené stavby):
  `fieldPartsFromCells` a `cemeteryPartsFromCells` v `placement.ts` (společné kontroly čtverců;
  u hřbitova navíc `check.warning` a `warningCells`, které neblokují – oranžově). Pole smí na
  louku, do křovin i do lesa – povrch dílu `fieldSquareSurface` (les z krajiny, křoviny = louka
  s keři za aspoň rozdíl sazeb); sad a hřbitov na louku i do lesa (sazba lesa – Stavba v lese). Obrys výběru při malování
  prosvítá přes stromy. Server
  actions dostávají `cells` / `fieldCells` (`{ x, y }[]`). Malování ve scéně
  `lib/scene/field-painting.ts` (`FieldPainter`, režim `squares`, logika výběru ve
  `field-cells.ts`) – ovládání v tabulce výše. Obrys pole (`Field.outline`) zůstal jen u starých
  vsí.
- **Pole ve scéně** (fields.md – Co hráč vidí; podle 0 A.D.): vzhled dílu `FieldLook`
  (`village-view.ts`: `bare`, `plowed`, `sown`, `sprouted`, `green`, `ripe`, `harvesting`,
  `stubble`, `young-fallow`, `pasture`, `meadow`, `mown`, `haystacks`, zarůstání `shrubs`
  a `young-forest` – bez obtisku, `LOOK_STYLES` alfa 0) posílá po dílech herní
  jádro (`SceneFieldPart.look`, rozpracovaný díl `work` 0–1 a `before`, `id`; fronta práce
  `SceneLaborShare.parts`) – **dokud neposílá, odhadne ho `field-look.ts` ze stadia a data**
  (`fieldPartViews`, `estimatePart`: zakládaný díl s `work` 0 jen vytyčený, osetý díl prochází
  rokem po čtvercích od obydlí – kopání, setí, růst, žeň s panáky, strniště; mladý úhor se pase,
  starší úhor je louka na seno – od 18. 10. 2026 posílá jádro i vzhled úhoru ve fázi louky:
  `pasture`, seč `meadow` → `mown` → `haystacks`). Práce mění díl, až když k němu dojde: rozpracovaný díl se dělí
  napříč řádky (po 8 pruzích – `WORK_STEPS`) na hotovou a nehotovou část, práce jde od strany
  blíž vsi (`workFrame`). Kreslí `field-renderer.ts` (`FieldRenderer` ve `VillageRenderer`),
  **po blocích 8 × 8 dílů** (`field-blocks.ts`): obtisky a rostliny bloku se přepočítají, jen
  když se změnil vzhled jeho dílů (postup práce, žeň po čtvercích) nebo okraj, směr řádků či
  střed pole; hotové bloky se jen spojí (rostliny v pořadí dílů – výsledek jako celé pole
  najednou, hlídá `field-blocks.test.ts`). `fieldPartViews` má mezipaměť pro stav vsi (díly,
  obydlí, den). Kreslí se:
  obtisky z textur 0 A.D. (`public/textures/fields/` – zem s měkkými brázdami podél řádků,
  osetá zem, strniště, porost shora; tráva a kvetoucí louka z terénu) s nepravidelným měkkým
  okrajem (`raggedCoverage`) bez meze (Martin) – kde pole sousedí s jiným polem, okraj se
  netlumí (`touchingSquares`) a pole navážou bez švu, skvrny (plevel, prošlapaná místa) druhou vrstvou;
  obilí jako 3D trsy v řádcích (`crops.glb` – uzly `crop-green|ripe|sprout|stubble`, jeden
  atlas, thin instances, tón druhu v barvě instance) – z dálky řídnou (`cropDensity`: plné do
  130 m, k 360 m pětina, od 620 m nic – pole pak nese obtisk), zralé a zelené se vlní ve větru
  (vertex shader `CropSwayPlugin`, jen v záběru, `WATER_FPS`, při omezeném pohybu stojí), pod
  sněhem nízké trsy zmizí; panáky (`stook.glb`) na sklizené části, plevel (trsy trávy) na
  úhoru a louce, seno – řádky, kupky a stohy (`haystack.glb`) přes podzim a zimu postupně mizí
  (`hay-meadows.ts`: `hayPhase`, `stackStands`; řádky sena jen na čerstvě posečených dílech –
  `PartView.swaths`: rozpracovaný díl a díly dnešní seče z rozdělení práce, v odhadu do
  `SWATH_DAYS` po seči, jinak kupky; zelenožluté, zvlněné a trhané – `swathTexture`, `swathAlpha`,
  `SWATH_COLOR`); kolíky a provázek kolem vytyčeného pole
  (Martin: hned po zadání, `fieldStaking`). Rozmístění trsů a panáků je v `field-crops.ts`
  (čisté funkce, deterministicky po políčkách). **Vystouplé obilí** (fields.md – Co hráč vidí;
  Martin 19. 10. 2026, dvouzrnka): zelené a zralé obilí má nad sebou neprůhlednou „korunu“
  porostu (`field-canopy.ts` – `fieldCanopy`, čisté funkce: síť po krocích obtisku ve výšce
  `CANOPY_M` – obilí 0,62 / 0,88 m, luštěniny ≈ 0,3 m –, k okraji pole podle krytí zanořená pod
  zem, svislé stěny tam, kde vedle nestojí stejný porost – schod na čáře žně; po blocích v
  `FieldBlockContent.canopy`, natočené pole `FieldSpace.canopy`, mesh `village-field-canopy-<id>`
  s texturou porostu, `applySeasonGround`); 3D trsy (zelené 0,85, zralé 1,15 m) z ní vyčnívají.
  Pole s 1 566 zralými díly: +1 draw call, ≈ +0,2 M trojúhelníků. **Kulaté rohy** (oxen.md –
  Kulaté rohy, Jen rádlo): pole vsi, která letos orá rádlem (`SceneVillage.fields[].ard` z
  `ploughsThisYear` v jádru – stav vsi, ne díly), má vnější rohy zakulacené obloukem
  `PLOUGH_CORNER_M` (5 m) – každý vypouklý roh, i schod obrysu (`outerCorners` a rohy
  v `cellsCoverage` – stačí, že oba čtverce po stranách rohu chybí, kulatější pole, fields.md);
  okraj každého pole se místy odsune až o `EDGE_WOBBLE_M` (2 m) dovnitř (`EdgeInset`,
  `raggedCoverage(…, wobbleM)`) –
  `cellsCoverage(…, rounding)` / `raggedCoverage(…, rounding)` v `field-cells.ts`, vnější rohy
  `outerCorners`; obtisk, trsy i koruna podle krytí, v klíči bloku (`partViewsKey`). Jen vzhled –
  plochu dílu roh neubírá. **Pod cestou obilí neroste**
  (fields.md – Co hráč vidí, Martin 19. 10. 2026): maska `track-mask.ts` (`trackMask` – úsečky
  a plácky rozcestí s hloubkou,
  přihrádky po 8 m, `keyNear` = klíč pásů v bloku) z průřezů obtisku (`ribbonSections` /
  `ribbonTrack` v `path-ribbon.ts`) – pevné cesty `roadTrack` (`road-works-layout.ts`, klíč cest
  `roadsKey` + `roadWorksKey`) s okrajem 0,8 m a pěšiny dne z `VillagePaths.pathTrack()` (síla po
  čtvrtinách) s okrajem 0,5 m, předává je `onChange` sítě pěšin přes
  `VillageRenderer.setPathTrack` → `FieldRenderer.setPaths` (odloženě s přepočtem pěšin, nikdy za
  snímek). Násobí krytí pole (obtisk, trsy, panáky, plevel, koruna svahem); klíč bloku nese pásy
  bloku, takže se přestaví jen bloky, kudy pás vede nebo vedl; kusy pod pásem mají jemnější síť
  (`TRACK_DETAIL` – koruna 4×, obtisk 2×). Ukázka: /dev/landscape **Cesta** se zralým polem
  15 × 15 přes rozcestí; **Velké pole** – zralé pole ≈ 10 ha se schody v obrysu (tvar polí z
  výchozí kamery). Jen vzhled – plochu dílu cesta neubírá (roads.md – Cesta je cesta).
  **Louky na seno** ve vsi jsou data – políčka
  přirozených luk v seči (`SceneVillage.hayMeadows`, `hayMeadowFields` je kreslí jako pole
  se vzhledem `meadow` / `mown` / `haystacks`, postavy sečou po čele práce); dekorativní
  `chooseHayMeadows` jen ve vývojové ukázce (oxen.md). Den pro
  odhad a seno: herní den rozdělení práce, jinak roční období scény (`setSeason`).
  Assety z `tools/blender/fields.py` (postup v hlavičce). Vývojové stránky: /dev/buildings
  projde posuvníkem všechny vzhledy pole i louku na seno, /dev/landscape tlačítka „Vzhled“
  a „Ukázka polí“ (pole v každém vzhledu; s „Lidé“ postavy na rozpracovaných čtvercích).
  **Zarůstání ve scéně** (fields.md – Zarůstání, Les vsi): `wild-growth.ts` (čisté funkce, testy)
  – na dílu s `SceneFieldPart.overgrowth` (roky bez pastvy a seče) keře od 3 let (plné křoviny
  v 15), průkopnické stromky od 8 let na místech budoucího lesa (`woodTreeSpots`), les vsi
  (`SceneVillage.woods`, stáří) ze stromů jádra v `obstacles.added` (dospělý, mladý, pařez – druh
  podle místa, s věkem víc dubů a buků, roste do 70 let) s podrostem; kreslí
  `wild-growth-renderer.ts` (`WildGrowthRenderer` ve `VillageRenderer`) v instancích z modelů
  krajiny, meshe `trees-<model>` / `decor-<model>` (roční období podle modelu, listnáče v zimě
  mimo stínovou mapu), přestavba jen při změně `wildKey`. Pod křovinami a mladým lesem obtisk
  pole není (`isWildStage` – okraj sousedního pole se k nim tlumí jako k louce). Stáda se pasou
  jen na dílech s `grazed` (`grazeablePart`), minimapa kreslí les vsi jako les, panel pole ikonu
  zarůstání (`resources/overgrowth.png`) s plochou (`VillageView.fields[].overgrowingM2`).
  /dev/landscape tlačítko „Zarůstání“ (`dev-overgrowth.ts` – díly 0–29 let a les vsi 30–70 let).
- **Les a dřevo** ([forest.md](docs/design/forest.md), `domain/village/wood.ts`): klády na hromadě
  (`woodLogs`, staré vsi 0, hnijí 4 % ročně), obydlí, první zemnice i přestavby berou dřevo
  (`DWELLING_TREES` 7 / 18) nejdřív z hromady, zbytek vyhradí při zahájení mezi nejbližšími
  dospělými stromy (`planDwellingWood`, bez stavu vsi `planDwellingWoodFrom` s `WoodSource` – cena
  u kurzoru; `nearestMatureTrees` – hledá po políčkách) a kácí je jako
  první část práce stavby (`fellAsWorked` → pařezy). Simulace proto povinně dostává vrstvu
  překážek (`advanceVillage(state, day, obstacles)`; `null` = kácení bez polohy jen v testech),
  use-casy krajinu (`updateVillage`, `loadVillage`, `renameVillage`); kalibrace les skutečné
  krajiny (`--land v1` syntetický). Vyhrazený strom patří své stavbě: mýcení za něj kládu nedá (`reservedTrees`
  v `PlacementVillage`) a stromy zakládaných dílů a čtverců hřbitova obydlí nevyhradí
  (`claimedObstacles`). Dospělé stromy lesa vsi (fields.md – Les vsi) se kácí jako stromy krajiny.
  Mýcení (díly polí, čtverce hřbitova, staveniště) dá kládu za dospělý
  strom (`trees` u dílu / čtverce). Dřevo je surovina předem (`villageStock` s vrstvou překážek:
  klády + stromy, které jde skácet – počet stromů vrstvy v mezipaměti). Palivo je v domácí výrobě
  bokem – přirážka za les daleko zmizela (`forestDistanceM` / `forestWalkM` se dál měří). Scéna: hromada klád `lib/scene/log-pile.ts` (místo
  a hranice v `log-pile-layout.ts`, bez volného místa se nekreslí), staveniště ukazuje průběh
  bez kácení (`buildProgress`).
- **Upozornění** (`lib/village-notices.ts`): rodina čeká na dům (fakt), stupně hladu (šetří
  jídlem, hladoví, umírají hlady – jen nejvyšší), nouzová porážka,
  stojící stavby, plný hřbitov (žádný hotový nemá volný hrob), vesničané ušetřili posvátný dub
  / dubový háj, svatba, nevěsta a ženich z okolí a dcera vdaná pryč, přišla rodina / muž / žena od souseda
  (`newcomer` – trade.md, Výměna lidí) (fakt, když přibude – svatba podle
  `VillageView.lastMarriageDay`), podzimní porážka, spřežení vycvičené / dosloužilo, vůl
  uhynul, vesničané obnovují starý sad a starý sad dosloužil (nové události kroniky –
  `VillageView.chronicle[].kind`, `CHRONICLE_NOTICES`) – nově vzniklé jako krátký mizející
  řádek nahoře, žádný trvalý seznam; vymřelá ves žádná. Kronika je jen v DTO.
- **Krajina sídla** se na serveru drží v LRU mezipaměti (`lib/landscape-cache.ts`, port
  `LandscapeSource` v `enterGame`) – negeneruje se při každé akci a dotazu. Vrstva překážek
  se generuje až pro stavby (`obstaclesOf`, mezipaměť podle objektu krajiny); dotaz na ves
  (`getVillageView`) ji potřebuje jen při prvním načtení vsi založené před vrstvou (doplnění
  odstraněných překážek, ≈ 300 ms jednou).
- **Překážky ve vsi** (`domain/village/obstacles.ts`, fields.md – tabulka překážek): obydlí
  platí překážky na vyklízené ploše (`DWELLING_CLEARING_M` = staveniště scény) po kusech (les za
  sazbu lesa – Stavba v lese),
  skalní výchoz pod půdorysem stavbu nedovolí; díl pole platí překážky v políčku jen mimo
  sazbu povrchu (`tallyCost`, `SURFACE_INCLUDED_OBSTACLES` – v lese stromy a podrost v ceně,
  v křovinách keře), výchoz zůstane a plocha pod ním se nepočítá; čtverec hřbitova
  platí překážky jako díl pole, ale výchoz ho zablokuje (hroby jdou v pevné mřížce). Kontroly
  (`checkDwellingPlacement`, `fieldPartsFromCells`, `cemeteryPartsFromCells`) berou vrstvu
  výchozím parametrem `obstaclesOf(landscape)` a vrací `obstacleCost` a id; v prohlížeči i na
  serveru stejně. **Odstranění:** obydlí (i první zemnice při založení vsi) při zahájení
  stavby, díl pole až po založení (`FieldPart.obstacles`), čtverec hřbitova až s dostavěním
  hřbitova nebo rozšíření (`CemeterySquare.obstacles`) → `VillageState.clearedObstacles`. Pokácené stromy (`felledTrees`) nechají pařez a dorostou
  (`TREE_REGROWTH_YEARS`). Pomocníci pro les a dřevo: `matureTreesByDistance`, `fellTrees`,
  `treeRegrowth`, `countMatureTrees`, `obstacleChangesAt`. Vsi z doby před vrstvou si
  odstraněné překážky doplní při načtení s krajinou (`withObstacleClearing` v `updateVillage`).
- **Postavy – lidé ve vsi** ([docs/design/villagers.md](docs/design/villagers.md), jen zobrazení,
  žádná pravidla): ukazují, kde ves dnes pracuje. Jádro: krok práce simulace uloží rozdělení
  práce dne po činnostech a místech (`labor-report.ts`, `VillageState.labor` – JSON, simulace ho
  nečte, na kouscích nezávisí; vsi uložené dřív ho mají od dalšího dne), sklizeň se dělí na žeň
  a odnos podle `HARVEST_WORK_PER_HA`; do scény jde jako `SceneVillage.labor` (člověkodny na
  setiny, lidé podle věku, měsíc). Scéna: `villager-plan.ts` (čisté funkce, testy) převede
  člověkodny na postavy (jedna na pracujícího, nejvýš `MAX_WORKERS` = 60, po skupinách až 4
  v činnosti – `shareCounts`; muž nebo žena podle podílu činnosti posunutého podílem žen ve vsi –
  `figureSexes` a `womenChance` ze `SceneLabor.people`, kinship.md; domácí práce a nečinní venku
  jen z části, v zimě méně; práce bokem – dojení, péče o zvířata, domácí výroba žen a denní
  minimum starších – přijde z `LaborDay.aside` mezi podíly, `sceneLabor` ji připojí; **každá
  stavba s dnešní prací má aspoň jednoho člověka** – `LaborShare.construction` z jádra,
  `withBuilderAtEachConstruction`, náhradní místo `builderNearby`) a rozestaví
  je (postavy stylizovaně o 20 % větší – `FIGURE_SCALE`, rozestupy s nimi): řady na polích
  přesně na čtvercích, kde se pracuje (Martin – fronta práce `workedParts`: díly z
  `SceneLaborShare.parts`, jinak rozpracovaný díl a za ním další; řada stojí hned za čarou práce
  a jde podél řádků), po přeplánování dojde postava na nové místo pěšky (`walkThen`),
  nosiči polem ↔ obydlí (`walkRoute` obchází domy), stavitelé za
  staveništěm (`siteBox` = vyklízená plocha), dřevorubci u vyhrazených stromů, sad, obvod
  hřbitova, výmlat u vsi, ženy u vchodu, starší (šediny) u domů a děti u stád (`herdViews`
  ze zvířat). Nikdo nestojí ve vodě (rastr schůdné země sdílený se zvířaty – `groundFor`),
  v domě se šíjí, na pozemku polozemnice ani na hrobech. Pohyb `villager-motion.ts` – čisté funkce skutečného času
  jako u zvířat. Kreslení `villagers.ts`: GLB z `tools/blender/people_from_0ad.py`
  (`people.json` – klipy z 0 A.D., rotace klíčů jako int16, maska látky a vlasů jako
  occlusionTexture), animace zapečené do textury matic kostí (Babylon VAT) a postavy jako thin
  instances – mesh `villagers-woman` / `villagers-man` (klip, fáze, tempo na instanci,
  `villagerLook` = barva oděvu a kód vlasů: šátek, šediny) + měkký kruhový stín
  `villagers-shadow` (alphaIndex 5 – po obtiscích vsi). **WebGPU má limit 8 vertex bufferů**
  a postava jich má právě 8 (pozice, normála, uv, kosti 2×, matice, VAT, look) – další atribut
  na vrchol nepřidávat, patří do textury. Klipy se střídají střihem (VAT prolínat neumí). Hýbou
  se jen v záběru (`WATER_FPS`), při omezeném pohybu stojí. Ve vývojovém náhledu tlačítko
  **Lidé** (ukázkové rozdělení práce podle měsíce – `app/dev/landscape/dev-labor.ts`).
- **Spřežení volů s rádlem** (oxen.md – Spřežení postupuje s orbou; Martin 19. 10. 2026,
  podrobnosti návrh Clauda): ve vsi orá na čele orby – `plough-front.ts` (`ploughFront`, čisté
  funkce bez Babylonu): díl s čárou práce z fronty `SceneLaborShare.parts` podílu `plough` (bez fronty odhad
  jako u kopání – `workedParts`), na něm **pruh u čáry práce** ve stejném rámci jako obtisk
  (`workFrame`, `workSteps` – řady podél `rowDirection`, napříč od vsi; `frontStrip`: končí na
  čáře, nejvýš 4 řady zpět, aspoň 2 – `ploughedTo`, `stripRows`, řady po 2,5 m). Jen čelo dne,
  ne všechny dnešní díly (0,3 ha ≈ 13 čtverců za ≈ 86 s by voly hnalo 13× rychleji). Kolik ohrad
  s voly, tolik spřežení (`ploughTeamCount`): každé na jiném dílu fronty, kam jeho dráha i se
  souvratěmi nesahá (obdélníky `footprint`, `overlaps`), jinak dvě na jednom dílu v půlkách
  (`SHARED_STRIP_M`, stejná dráha posunutá napříč – v zákrytu), kdo se nevejde, zůstane v ohradě
  (`penHerds(village, teamsOut)`). Natočené pole v osách mřížky (`rowDirection` natočených dílů).
  Další den (nová dráha – `PloughTeams.setPaths(paths, nowMs)`) spřežení **dojde pěšky**:
  `transitTrack` (rovně ≈ 1 m/s – `TRANSIT_SPEED_M_S`, rádlo nahoře, natočení na začátku a konci,
  čas příchodu dopočítaný, ať naváže bez skoku; nad `TRANSIT_M.max` 60 m skok), póza `trackPose`;
  jen když animace běží (`liveAt`), při omezeném pohybu stálá póza na novém místě; obal pro ořez
  záběrem stálý přes celé dráhy i přechody (`updateBounds`). V kulatém rohu pole (Kulaté rohy)
  končí řady na oblouku (`PloughField.corners`, `rowExtent`) a radlice se zvedá (`outsideSquare`).
  **Orba za herní den – LADICÍ** (oxen.md; Martin 19. 10. 2026: „aby spřežení projelo opravdu
  všechna obdělávaná políčka a nechávalo za sebou brázdu“): přepínač `PLOUGH_DAY_DEBUG`
  v `plough-day.ts` (false = skutečné tempo, jen čelo dne). Jádro dává k orbě v rozdělení práce
  `progress` (ráno a večer na dílu – `partsWorked` vrací `from` / `to`) a zoraný díl rádlem nese
  `before`; `dayStints` (pruhy po pruzích obtisku; sousední díly pásu se stejným postupem jeden
  pruh přes celý pás – `bandCandidates`, `PloughField.length`, `DayStint.partIds`), `splitStints`
  (souvislé kusy fronty mezi spřežení), `startOfDayVillage` (pole na začátku dne); trasa
  `ploughRoute` (z ohrady po cestě `SceneVillage.ploughApproach` – vozová síť z `village-view`,
  řady všech pruhů s obraty, přesuny se zvednutým rádlem, večer po cestě zpět), `RouteTrack` (od příchodu plánu do konce
  herního dne – okno z hodin světa, `realTimeOf`, nebo `VillageRenderer.setPloughClock`),
  `routePose`, brázda `routeFurrows` (pásy řad, kudy radlice projela – čistá funkce času)
  → `FieldRenderer.setFurrows` (obtisk `village-field-furrow-<id>` s krytím pole, v
  `animateOxen`); `PloughTeams.setRoutes` / `furrows`. Jen s animací (`VillageContext.animated`
  – při omezeném pohybu konec dne a čelo jako dřív). Ukázka **Orání** na `/dev/buildings`: tři
  čtverce, vlastní `VillageRenderer` (`ploughDemo`) s polem a orbou dne ukázky (40 s –
  `showcasePloughDay`, `showcasePloughWindow`, díly a `progress` jako od jádra – `showcasePlough`),
  tři čtverce jsou jeden pás (`furrow`) – orba postoupí za den napříč o 3/8 čtverce plochy. Voli a oráč z `people_from_0ad.py` s `tools/blender/plough-team.json` – vůl
  `cattle_male_c` (srst přebarvená, maska srsti), oráč = muž s klipy `plough` (předklon + ruce
  dvoukloubovou IK na rukojeti, „pose“ v JSON) a `lead` (honáček s provazem); rádlo, jho, oj
  a provaz `tools/blender/plough.py` (malý atlas vyříznutý z atlasu obydlí). Rozestavění
  a pohyb `plough-team.ts` (čisté funkce času: dráha přes čtverec nebo jeho pruh – `PloughField`
  `from` / `to` / `across…`, řady, obraty na souvrati, návrat; rádlo za jhem na tětivě oje, na
  souvrati nadzvednuté, oráč u rukojeti – `composePose`), kreslení
  `plough-team-renderer.ts` (VAT jako lidé + pevné díly v instancích). Rozměry rádla a jha musí
  sedět s `TEAM_PARTS` (hlídá test).
- **Vozy se spřežením** ([docs/design/wagons.md](docs/design/wagons.md) – modely fáze 3a, ve vsi
  fáze 3; ukázka **Vozy** na `/dev/buildings`): dvoukolák a čtyřkolák z 0 A.D. převádí
  `tools/blender/wagons_from_0ad.py` (vlastní parser skinovaného COLLADA, model rozdělený podle
  kostí, koňský postroj pryč, vlastní oj ke jhu, náklad modelovaný ve skriptu) do
  `public/models/wagons/wagons.glb` – díly `wagon2-body`, `wagon4-body`, `wagon4-front` (předek na
  čepu), `wagon4-pole`, `wagon-wheel` (levé kolo, pravé = otočené o 180°) a náklad
  `wagon{2,4}-{hay,sheaves,logs,goods}`. **Kola se točí maticí instance podle ujeté dráhy, ne VAT**
  (animace 0 A.D. jen točí kosti kol; VAT by se s jízdou po terénu nesešla a postava s kostrou má
  ve WebGPU vyčerpaných 8 vertex bufferů). Pohyb `cart-layout.ts` (čisté funkce, testy):
  `cartRoute` (lomená čára → úseky a oblouky jako dráha rádla, rohy zaoblené `turnRadius`,
  uzavřená / otevřená), `routeAt`, `cartPose(track, t, out, ground)` – jho na trase (`composeDraft`
  v `plough-team.ts`: voli, jho a honák s provazem jako u rádla, u vozu dospělý
  `CART_PARTS.drover`), dvoukolák = náprava na tětivě oje za jhem a korba naklopená tak, aby špička
  oje ležela pod jhem, čtyřkolák = přední náprava za jhem (`yokeReach`), zadní po rozvoru, korba na
  obou (sklon a náklon podle terénu pod koly), předek natočený ke jhu, oj od špičky rozvory ke jhu;
  dráha kola = dráha osy ± polovina rozchodu × změna směru (vnější kolo v oblouku víc). Rozměry
  `CART_PARTS` musí sedět s modely (test čte obaly dílů z GLB). Kreslení `cart-renderer.ts`
  (`CartRenderer.setCarts(tracks)` / `animate` – voli a honák VAT z `plough/`, jho a provaz
  z `ard.glb`, díly vozů v instancích, měkké stíny; skrytý díl – náklad prázdného vozu, voli
  stojícího – nulová matice). Druhy vozů jako v jádru (`two-wheel`, `four-wheel`). **Ve vsi**
  (`village-carts.ts`, čisté funkce, testy): `villageCartPlans` z `SceneVillage.carts` – vůz s trasou
  dne jede tam a zpět (`CartShuttle`: `shuttleRoute` – osa tam, smyčka obratiště za cílem
  `CART_TURN_M`, zpět, smyčka u ohrady jako uzavřená trasa; `shuttleAt` – prázdný tam, u cíle
  nakládá, plný zpět, u ohrady skládá; svoz v okně herního dne – ladicí `PLOUGH_DAY_DEBUG` jako
  orba: jízd kolik se vejde při `CART_FAST_M_S`, nejvýš `CARTS.loadsPerCartDay`, den se opakuje;
  výprava dokola tempem volů naložená tam i zpět), vůz bez jízdy stojí u ohrady (`CartParked`,
  `parkedCartSpot`, `parkedCartPose` – dvoukolák na oji, bez volů). `cartPlanPose` = póza podle
  plánu (`poseOnRoute`). `VillageRenderer.updateCarts` (klíč z vozů, okna dne a ohrad) a
  `animateOxen`; voli táhnou buď vůz, nebo rádlo – `draftTeamsToday` (orba jen se spřežením, které
  nevozí), `penHerds` bez volů na cestě; honák jde s vozem (`villager-plan.ts` – haul bez honáků).
  Panel cesty: vyšlapaná s vozy je **Vyježděná cesta** (Vozová síť a vyjeté cesty níž). `/dev/landscape`
  **Vozy ve svahu** – vůz stojí, pak dvoukolák a čtyřkolák vozí snopy po vyjeté cestě
  (`LandscapeScene.setWorkDayClock` – den ukázky 86 s).
- **Vyšlapané pěšiny** ([docs/design/paths.md](docs/design/paths.md), Martin 18. 10. 2026 –
  i práce): síť počítá herní jádro `domain/village/paths/` stejně na serveru i v prohlížeči
  (soubory jsou v deterministické vrstvě – ESLint zakazuje Math.sin/cos/hypot/log, `**`; jen
  det-math). `terrain.ts` (cena chůze po bodech mřížky ≈ 3,75 m z krajiny: bilineární výška,
  sklon, voda a brody z osy potoka, les; `pathTerrainOf` – výřez z mezipaměti podle krajiny,
  nezávisí na jejím stavu; `withObstacles` – kmeny, keře, balvany, výchozy), `network.ts`
  (`computePathNetwork(PathVillage)` – cesty domácností pro vodu a dřevo každá zvlášť s napojením
  na pěšinu souseda – **pro vodu vždy k nejbližší vodě v okně, bez meze a naplno** (0,4 cesty na
  člověka – `WATER_FETCHING`; dřevo nejvýš 450 m a za 130 m řidčeji – `nearCost`; okno sítě
  `villagePathBounds` sahá k nejbližší vodě – `nearestWaterTiles`, jen k ní, ± 45 m, do 1 000 m), do cílů podle práce dne + základ zavedených míst (ke společnému cíli každá
  domácnost zvlášť A* od cíle k bráně, nejvytíženější první – další se přidá k čerstvě vyšlapané
  pěšině, souběžné pěšiny nevzniknou), k sousedům; 2 kola,
  vyšlapané buňky hned zlevní; buňky pod pevnou cestou (`PathVillage.roads`, maska `roadMask`) od
  začátku jako plná pěšina – trasy se k ní stahují – a **bez ohledu na povrch** (Martin, 19. 10.
  2026; `roadCellCost` = 1 / rychlost cesty podle stupně a mokřiny, pěšina dne ji nezrychlí –
  `Grid.plain`: díl pole v jakémkoli stadiu, sad, les vsi i krajiny,
  svah a překážky krajiny se pod cestou nepočítají; brod a neprůchodné buňky zůstávají, ploty
  hřbitova a ohrady, okrsek svatyně a stavby taky – roads.md, Cesta je cesta); ohrady (`pens` –
  plot jako hřbitov, krmení jako cíl) a stáda na pastvě (`livestock` → `pastureHerds`, cesta na
  stádo denně na úhor; ze stavu `pastureLivestock` jako `SceneVillage.livestock`); cena buňky pole
  podle nejbližšího dílu přes přihrádky políček (`nearest.ts` – bit po bitu jako průchod všemi
  díly, zlatý otisk sítě v `paths-nearest.test.ts`) – **rychlosti chůze** (Martin, 19. 10. 2026:
  „berme louku za výchozí: 1 vyšlapaná denní cesta 1.3 stálá vyšlapaná cesta 1.5. Pole, které
  zrovna neleží ladem: 0.5. Upravená cesta: 1.7“, strniště 0,8; „nejkratší cesta je ta
  nejrychlejší“ – mění dřívější „pole lidi nezdržuje“): cena buňky = 1 / rychlost z `walk-speed.ts`
  (`partWalkSpeed` podle vzhledu dílu `look` jako scéna – v osevu 0,5, strniště 0,8, úhor
  a zakládaný díl 1; mokřina 0,5 – nejpomalejší platí; `pathCostFactor` – plná pěšina 1 / 1,3,
  přes osev pěšina nezrychlí; `roadWalkSpeed`), čísla `PATH_WALK`, `FIELD_WALK`, `ROAD_WALK`;
  křoviny a mladý les dražší (`OVERGROWN_COST`); pole není zákaz – přes osev se jde, když je
  obcházení delší; vozy přes osetý díl dál ne;
  síla `pathStrength` (odmocnina provozu), stáří obydlí →
  `pathAgeFactor`; vyhlazené čáry se sílou a stářím v bodech, provoz po buňkách `traffic.raw`;
  `annual: true` = roční provoz; provoz ke stavbám `visits` – opuštěné stavby, abandonment.md;
  `PathVillage` splňuje `SceneVillage`), **vchody staveb** `entrances.ts` (Martin, 19. 10. 2026:
  „každá budova by měla mít nějaký vchod, od kterého cesta povede“ – paths.md, Vchody: jedna
  funkce pro síť i scénu – `cemeteryEntrance` branka hřbitova, `penEntrance` branka ohrady,
  `sacredEntrance` předek modly a svatyně; k hotové stavbě vede pěšina k vchodu, staveniště ze
  všech stran; obydlí bránou `gateOf` (pro kontrolu umístění `dwellingGatePoint`), brána v cizím
  pozemku → nejbližší volné místo do 7,5 m kolem obydlí `gateAround` (jinak by domácnost vypadla
  ze sítě); **nové obydlí brankou do cizího pozemku nesmí** (Martin 19. 10. 2026 – `gateProblem`
  v `placement.ts`: obydlí a pozemky i dvůr dvorce, modla, svatyně, hřbitov, ohrada, voda; opačně
  `blocksGate` v `checkFootprintFree` a u hřbitova – „Zatarasí sousedům branku.“; platí
  i pro `relocationPlot`, přestěhování a `freeVillageSite`); konstanty pleteného plotu `WOVEN_FENCE_CORNER_M`,
  `CEMETERY_GATE`, `PEN_GATE`, `FENCE_INSET_M` bere scéna odsud; `PathVillage.cemeteries` nese
  `built` a čtverce `pending`), `walking.ts` (`walkGraph`, `walkingDistances` – vzdálenost chůze se
  stejnými rychlostmi jako síť, rovně i přes pole – `withFieldWalk` z `PathVillage.fields`, nikdy
  víc než rovně – čistá funkce pro každého, kdo měří cestu na pole)
  a `village.ts` (`pathVillageOf` ze stavu vsi jako scéna i s pevnými cestami, `refreshWalkDistances`
  – den po dni v `simulateDay` při změně `walkLayoutKey` (i pevné cesty), jen s krajinou;
  **stadia dílů, rychlost chůze přes ně (osev, strniště) a pastva úhoru (`walkStageKey`) se do klíče promítají jen 1. dne v měsíci**
  (Martin, 18. 10. 2026 – osev postupuje po dílech a síť se přepočítávala každých pár dní; otisk
  stadií z posledního 1. dne je ve stavu `walkStages`), strukturální změny hned; ve stavu jen
  otisky `walkLayoutHash`; `villagePathNetwork` si pamatuje poslední síť po krajinách (otisk `pathVillageOf`) –
  seč luk ve stejný den po přepočtu chůze síť nepočítá znovu →
  `FieldPart.walkDistanceM`, práce přes `partWalkDistance` v `year-plan.ts` (`partWork`, `partWeight`),
  `field-progress.ts` a seči `hay.ts`).
  Scéna `path-renderer.ts` (`VillagePaths` v `LandscapeScene`: přepočet jen při změně
  `pathNetworkKey`, odloženě) – obtisky `paths-worn` / `paths-earth` z `path-ribbon.ts` **nad**
  obtisky polí a vsi (alphaIndex 3 / 3,5, lift 0,05 / 0,055, zOffset −3,5 / −4; přes osetý díl
  úzká stopa; v pevné cestě se pěšina dne ztrácí – `roadFade`; rozcestí – konec aspoň tří čar –
  je udusaný plácek `ribbonJunctions` / `JUNCTION`, u pevných cest `roadJunctions`). **Pěšina dne
  je nevýrazná** (Martin, 19. 10. 2026: „denní pěšina ať je nevýrazná“): vrstvy `PATH_WORN_LAYER`
  / `PATH_EARTH_LAYER` – slabě prošlapaná tráva 0,6–1,2 m, krytí 0,2–0,45, holá hlína jen u silné
  pěšiny, úzká a slabá, rozcestí jen jemně (`RibbonLayer.junction`); pevná cesta (`ROAD_*`) je vedle
  ní jasně výraznější. Sníh přes `applySeasonGround` – materiály pěšin a cest zvlášť
  (`decalMaterial(group, kind)`, `SNOW`: pěšina dne 0,3, ať stopa ve sněhu trochu prosvítá, cesta
  0,55). Pěšiny dne stromy nemají (stromy jsou jen u pevných cest – níž).
  Postavy: `path-router.ts` (trasa s tempem úseků) → `VillagerPaths.route` →
  `route(points, pace)` – `shuttle` jde po pěšině rychleji. Vývojová stránka: tlačítka
  **Pěšiny**, **Cesta** (ukázka pevné cesty se stromy v každém stadiu – `dev-road.ts`), **Provoz**
  (teplotní mapa) a **Stáří**.
- **Pevné cesty a stromy u nich** ([docs/design/roads.md](docs/design/roads.md) – fáze 1; výběr,
  vylepšení a chůze podle stupně = fáze 2, jabloně = fáze 3): simulace vsi (server) – modul
  `domain/village/paths/roads.ts` (deterministická vrstva jako pěšiny), z `simulateDay` jediné
  volání `roadsDay` na konci dne (jen s krajinou; bez ní – kalibrace – žádné cesty). Stav
  `VillageState.roads` (volitelný – starší vsi začnou sčítat při prvním dopočtu): úseky `Road`
  (id, osa na cm, den vzniku, stupeň `RoadGrade` – zatím jen `trodden`, provoz posledních 5 let,
  místa na stromy `spots` určená jednou při vzniku), stromy `RoadTree` (id od `ROAD_TREE_ID_BASE`
  nad id vrstvy překážek, místo, poloha, druh, den uchycení a smrti), loňské úseky nad prahem
  `candidates` a práce roku cest po místech `labor` (od 1. 11., z rozdělení práce dne). Roční
  kontrola 1. 11. (`updateRoads`): roční síť `annualPathNetwork` (stejná `computePathNetwork`,
  průměrné člověkodny na den, sleva za pevné cesty) → provoz cest (`roadTraffic` – medián
  `traffic.raw` po ose) a zarůstání vyšlapané cesty **po kusech** (Martin, 19. 10. 2026 –
  roads.md, Zarůstá jen nepoužívaný kus: `overgrowRoads` – osa po kusech ≈ 25 m `roadPieces`,
  tichý kus pod polovinou prahu sčítá roky v `Road.quiet` (střed kusu, roky – jen tiché kusy,
  starší vsi od další kontroly), po 5 letech zaroste – celý úsek zmizí, jinak `cutOvergrown`
  vyřízne tiché kusy a zbytek zůstane se starým id, konec u zarostlého kusu volný
  `VillageRoads.cutEnds`; nezaroste cesta, která se vylepšuje – `roadsInWork`, kus u živé jabloně
  – `keepingApples`; upravená a hať nezarůstají) → nové cesty z úseků nad prahem
  (`ROADS.tripsPerDay`), které leží i na loňských (`MATCH_M`) a nevedou po pevné cestě; konec se připojí k pevné cestě a ta se v rozcestí rozdělí (`splitRoad`) – osa se
  jinak nikdy nemění → **falešná rozcestí** (uzel jen se dvěma úseky stejného stupně, bez
  rozdílného vylepšení) se spojí (`mergeRoadChains` – i po dokončení vylepšení ve
  `finishConstructions`, starší vsi při načtení `withMergedRoads` v `updateVillage`; id a den
  vzniku staršího, roads.md – Úseky a rozcestí; dva úseky mezi stejnými uzly do okruhu ne,
  nejrovnější pokračování první) → **souběžné cesty** se nevytvoří (`alongsideRoad` ve
  `formRoads` – do 12 m stejným směrem; konec nové cesty za souběžným kusem se k té cestě připojí
  do 14 m – `joinPoint` s dosahem) a existující se sloučí (`mergeParallelRoads` – kus
  slabší cesty souběžný aspoň 25 m se vyřízne, `removeBraids` – copánek mezi stejnými uzly do
  25 m: zmizí oklika; vše v `tidyRoads`, příznak `parallelsChecked`) → **díry** (volný konec do 12 m od jiného
  úseku, který není u konce trasy roční sítě – brány, cíle) se napojí (`joinRoadGaps`, starší
  vsi jednou při načtení `withJoinedRoads` s příznakem `endsChecked`) a určí se skutečné volné
  konce `Road.openEnds` (jen tam se pás cesty ve scéně vytrácí; pěšina dne se za koncem úseku
  neskrývá – `roadFade`) → místa na stromy (`roadTreeSpots`, `plantingBlocker` – ne ve vsi, na
  čtvercích staveb (pole ano – Pole jako krajina), v lese, ve vodě, u překážek krajiny) → konec pařezů a stromy odstraněné stavbou →
  uchycení (10 % ročně, los ze seedu vsi, roku a místa). Čísla v `rules.ts` (`ROADS`,
  `ROAD_TREES`). Stadium stromu jen ze dne (`road-trees.ts`: `roadTreeLook` – keř, strom
  s velikostí, souš, pařez; `roadTreeObstacleKind`). **Strom u cesty je překážka stavby:**
  `obstacleChangesAt` ho dá do `ObstacleChanges.added`, `obstacleStatus(...).addedIn` a tally
  funkce (`cellObstacles`, `polygonObstacles`, `polygonsObstacles`) ho počítají jako překážky
  vrstvy (dospělý strom od 20 let dá kládu, mladší je mladý stromek) – stejná cena u kurzoru
  v prohlížeči (`placementVillageFromScene` bere `scene.obstacles`) i na serveru; odstraněný se
  zapíše do `clearedObstacles`. Na dřevo se nekácí (nejsou ve vrstvě – `nearestMatureTrees` je
  nevidí). Kronika `road-formed`, `road-overgrown`. Web: `SceneVillage.roads` (`SceneRoad`)
  a `roadTrees` (`SceneRoadTree` – stadium a velikost po dvacetinách z `sceneRoadTrees`), typy
  odvozené z jádra. Scéna `path-renderer.ts`: pevné cesty z dat (`roadBands` v
  `road-works-layout.ts` – plně vyšlapaný pás `roads-worn` / `roads-earth`, vrstvy `ROAD_WORN_LAYER`
  / `ROAD_EARTH_LAYER` v `path-ribbon.ts` – vzhled jako dřív silná pěšina, Martin 19. 10. 2026:
  „Vyšlapanou cestu nechme jako teď“; volný konec se vytrácí, přestaví se jen při změně
  `roadsKey`), stromy z dat (`path-trees.ts`: `roadsideInstance` – keř `shrub-*`
  z dekorací, strom podle druhu z `ROAD_TREE_MODELS`, souš `snag-*` / `snag-oak`, pařez `stump`;
  meshe `pathside-<model>` – roční období a stíny jako stromy krajiny; přestaví se jen při změně
  `roadTreesKey`).
- **Vylepšení pevné cesty a chůze podle stupně** ([roads.md](docs/design/roads.md) – fáze 2):
  terén pěšin má příznaky `PATH_WETLAND` (mokřina – suchá rovina do 3 buněk od vody) a `PATH_WATER`;
  úsek nese `Road.ground` (mokřina od–do a brody na ose – `roadGroundOf` při vzniku, starší při
  roční kontrole; `splitRoad` je dělí). `road-upgrades.ts`: `roadUpgradeOptions` (nabídka, cena
  `roadUpgradeCost` – `ROAD_UPGRADES` v `rules.ts`, důvod česky), `startRoadUpgrade` → stavba
  `kind: 'road'` s `roadIds` a `roadGrade` (dřevo `planWoodFrom` k polovině úseku),
  `finishRoadUpgrade` v `finishConstructions`; úsek ve stavbě nezaroste (`roadsInWork`). Use-case
  `upgradeRoad`, server action `upgradeRoad` (`{ roadId, upgrade }`), práce `{ kind: 'road' }`
  (labor-report, postavy `roadWork`, pěšina k polovině úseku). **Chůze** jen ve `walking.ts`:
  `walkGraph(lines, { roads, ground })` – pěšiny dne, pevné cesty podle `ROAD_WALK`
  (`roadPieceCost` – stupeň: vyšlapaná i vyježděná 1,5×, upravená 1,7×, hať a lávka 1,7× i přes
  mokřinu; mokřina 0,5×, brod + 30 m bez lávky), `groundWalkLength` (rovně: mokřina 0,5×, pole
  podle `WalkGround.fields`, vstup do vody + 30 m), `walkingDistances(graph, origins, targets,
ground)`; půda `walkGroundOf(landscape)` je pevné okno kolem místa vsi, pole do ní přidá
  `withFieldWalk` (vzdálenosti dílů, sadu, paliva a luk; kácení staveb po pevných cestách bez
  polí). `refreshWalkDistances` počítá
  `FieldPart.walkDistanceM`, `OrchardSquare.walkDistanceM` (`squareWalkDistance`) a
  `Dwelling.forestWalkM` (`dwellingForestDistance` – palivo) a `Dwelling.waterWalkM` (k nejbližšímu
  břehu vzdušnou čarou – jedna funkce `waterWalkDistance(ground, walk, from)`: po pěšinách a cestách,
  jen po cestách – `roadWalk`, nebo rovně – `straightWalk`; `WALK_VERSION` v otisku přepočte starší
  vsi); kácení staveb přes `walk` v plánu
  dřeva (`roadWalk` / `villageRoadWalk` jen po pevných cestách, u kurzoru `placementWalk`
  s `PlacementVillage.walkRoads`). Bez krajiny (kalibrace) se nic z toho nepočítá. Web:
  `VillageView.roads` (`VillageRoad` – panel), `SceneRoad.ground` a `upgrade` (průběh pro fáze),
  výběr `{ kind: 'road' }` (`nearestRoad`, `ROAD_PICK_M`), panel `RoadBody` (ikony `cesta`,
  `cesta-upravena`, `hat`). **Upravená cesta je jen širší vyšlapaná** (Martin, 19. 10. 2026:
  „upravená cesta ať je prostě jenom širší – ta odvodňovací strouha vypadá divně, zrušíme ji“):
  tytéž obtisky, pás `ROAD_WIDTH_M.improved` 3 m místo 1,9 m (`IMPROVED_WORN_LAYER` /
  `IMPROVED_EARTH_LAYER`), žádná strouha ani kameny (zrušené i s `road-stone.glb`). Scéna:
  `road-works-layout.ts` (čisté funkce – pásy `roadBands` – rozestavěná úprava širší od začátku
  úseku –, kmeny hatě na šířku upravené cesty – `LOG_SCALE`, lávky, vytyčení po okrajích širší
  cesty – `STAKING_OFFSET_M`), `road-works.ts` (`RoadWorks` – modely `public/models/roads/`
  z `tools/blender/roads.py` v instancích, `roadRibbonMeshes` i pro `/dev/buildings` – ukázka
  **Cesty** s posuvníkem stavby); `/dev/landscape` tlačítko **Cesta: …** přepíná stupně
  a rozestavěné fáze (i cesta k nejbližšímu brodu).
- **Vozová síť a vyjeté cesty** ([wagons.md](docs/design/wagons.md) – fáze 2; Martin, 19. 10.
  2026: „ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset vyjezdit serpentiny“; čísla
  `CART_ROUTES` a `CART_ROADS` – návrh Clauda): `paths/cart.ts` (deterministická vrstva jako
  pěšiny) – `cartGrid` na mřížce terénu pěšin (výšky `PathTerrain.heights`, les `PATH_FOREST`,
  překážky `cartObstacleMask` v `terrain.ts`; voda jen brodem, les jen po pevné cestě, pole
  v lese vymýcené, osetý díl, křoviny, sad, hřbitov, ohrada, les vsi a okrsek svatyně ne, domy
  a pozemky s půl šířkou vozu; každá pevná cesta sjízdná; rychlost podle povrchu a druhu cesty –
  `CART_SPEED`, `cartPartSpeed`, `cartRoadSpeed`: vyšlapaná 1,3, vyježděná 1,6, upravená a hať
  1,8, strniště i připravený díl 0,8, zoraný 0,6, mokřina 0,55 – i na cestě kromě hatě, podle
  `Road.ground` jako chůze, `cartVillageOf`; návrh Clauda) a `cartRoutes` – Dijkstra po stavech
  buňka × 16 směrů (osy, úhlopříčky, skoky 2 : 1), sklon ve směru jízdy nad 10 % nejede, stoupání
  zdražuje se čtvercem (serpentiny samy), dvoukolák zatočí o 2 směry, čtyřkolák o 1 (širší
  oblouk); jedno hledání od depa (`cartDepots` – kolem ohrad se spřežením `teamPens`) ke všem
  cílům. `axisCartCheck` – sjízdnost osy (zemská stezka, `trailRoutes` beze změny). Ze stavu vsi
  `villageCartRoutes` (rozhraní pro svoz fáze 1 – `CartAccess`). Jízdy svozu sčítá
  `addRoadCartTrips` do `VillageRoads.labor.cart`; roční kontrola `annualCartNetwork` → provoz
  vozů, `Road.cartTraffic`, příznak `Road.cart` (`markCartRoads` – 2 roky nad 0,25 jízdy denně,
  5 let pod polovinou pryč); **vůz přebije vyšlapanou** (Martin, 19. 10. 2026: „pokud nějakou
  cestu vyjezdí vůz, bude to vyježděná cesta. Pokud vůz takhle vyjezdí vyšlapanou cestu, tak to
  vozová cesta přebije.“) – `formCartRoads` s `cartCandidates` třídí body tras po trasách
  (`CartPoint`): po cestě, kterou vozy mají, provoz patří jí; po vyšlapané (do 5 m, stejným směrem)
  ji převezmou (`takeOverRoads` – kus od 15 m dostane `cart`, úsek se rozdělí); souběžně vedle
  (5–12 m) od 25 m nová cesta po ose vozu (souběžnou vyšlapanou pak vyřízne `mergeParallelRoads`),
  kratší převezme; jinde nová – provoz se neztratí, souběžná nevznikne. Kus s provozem vozů
  nezaroste, vozová a pěší se nespojují. Pro hráče je vyšlapaná s `cart` druh **vyježděná cesta**
  (`RoadKind`, `roadKind`, `ROAD_KIND_ORDER` v `road-chains.ts`; upravená a hať zůstanou),
  ikona `icons/build/cesta-vyjezdena.png` (`icons.py`). Scéna: `roadBands` → `cart` (širší pás) a `ruts` (dvě
  koleje ±0,65 m, `CART_RUT_LAYER` bez vlnění), `roadsKey` nese `:v`. Ves bez vozů beze změny.
  `/dev/landscape` tlačítko **Vozy ve svahu** (`dev-cart.ts`).
- **Cesta pro hráče** ([roads.md](docs/design/roads.md) – Cesta pro hráče; Martin 19. 10. 2026:
  „tohle by rozhodně neměly být dvě cesty, ale měly by se spojit do jedné“): řetěz úseků mezi
  rozcestími (uzel ≥ 3 konců) a volnými konci bez ohledu na druh cesty – `roadChain` /
  `roadChains` / `roadChainIds` (`paths/road-chains.ts`, začíná koncem s menším id úseku, okruh
  nejmenším id). Data zůstávají po úsecích. Vylepšení (`roadUpgradeOptions`, `startRoadUpgrade`)
  i jabloně (`roadApplesOption`, `startRoadApples`, `chainAppleSpots`) berou `roadId` kteréhokoli
  úseku a pracují s celou cestou – stavba `roadIds` v pořadí cesty, průběh po úsecích
  `roadUpgradeProgress`, čelo `roadWorkFront` / `roadApplesWorkRoad` (labor-report). Web:
  `VillageRoad` = cesta (`segments`, převládající druh `roadKind`, délka po druzích `kinds` –
  vyšlapaná, vyježděná, upravená, hať; `ROAD_KIND_NAMES`), výběr `{ kind: 'road', id }` s id
  prvního úseku (`pickVillageTarget`), zvýraznění celé cesty, `SceneRoad.upgrade.fromEnd`;
  přechod pásů různé šířky se zúží (`RibbonLine.narrowStart` / `narrowEnd`, `NARROW_M`).
- **Průsek lesem** ([roads.md](docs/design/roads.md) – Průsek lesem, trade.md – Zemská stezka;
  Martin 19. 10. 2026: „Tam, kde zemská stezka prochází lesem, ať se les vykácí.“): upravená
  cesta a stezka lesem (`PATH_WOODLAND`, les vsi) vykácí pruh `ROAD_SWATH.halfM` (3,5 m) od osy
  – v pásu cesty (`roadbedM` 1,5 m) i pařezy a kameny, po stranách pařezy (`road-swath.ts`:
  `swathTally`, `roadSwathTally`, `cutRoadSwath`). Cena v úseku stezky (`pieceOf`) a vylepšení
  (`roadUpgradeOptions(…, walk, landscape)`, `swathTrees`); kácí krok dne `roadSwathDay`
  s `swathRoadsInWork` (trail.ts), klády na hromadu, `Road.swath`. Pařezy průseků
  (`VillageRoads.swath`) nedorostou (`obstacleChangesAt`, `fellTrees`, `plantOnStump`,
  `isTreeStanding`), nový les vsi do pruhu nevstoupí (`keepSwathsClearOfWoods`). Posvátné duby
  a háje: trasa stezky se jim vyhne (`sacredMask` v `trailRoutes`), v pásu cesty úpravu
  nedovolí (`ROAD_SACRED`, `TRAIL_SACRED`). Starší vsi `withRoadSwaths` (bez klád, příznak
  `swathChecked`). `trailTerrain` je v `paths/terrain.ts`. Scéna: `SceneRoad.swath` →
  `swath-bands.ts` (plocha korun `setCleared(…, swaths)`, zarůstání `wildPlants`), dev ukázka
  Stezka lesem (`dev-forest-trail.ts`). Vozová cesta průsek nedostane.
- **Cesta přes pole** ([roads.md](docs/design/roads.md) – Cesta přes pole; Martin 19. 10. 2026:
  „Ano má. … pokud oráč narazí na cestu, tak spřežení otočí. Nebude pak moci vzniknout takový
  růžek…“): pás pevné cesty (šířky `ROAD_LAND.widthM` = obtisk, i `ROAD_WIDTH_M` ve scéně)
  a plácky rozcestí se neorou; kus pole oddělený cestami pod `cornerMinM2` (80 m²) nebo bez místa
  širšího než `stripMinM` (3 m) zůstane loukou. `roadLand` (`paths/road-land.ts`, buňky 0,5 m
  v mřížce pole, `fieldFrame`) → `PartRoadLand`; krok dne `roadFieldsDay` (`road-fields.ts`, jen
  s krajinou – i kalibrace `--land real`) při změně otisku `roadLandKey` (cesty + čtverce polí,
  `VillageState.roadLandKey`) zavolá `giveWayToRoads` (`land-taken.ts`, `resizeParts` –
  zmenšení i vrácení plochy s plánem, sečí a založením; pod 20 % políčka díl vypadne, kronika
  `land-taken` s `by: 'road'`). Díl nese `roadM2` (už odečtené z `areaM2`) a `roadCut` (řádky
  bitů buněk); scéna `SceneFieldPart.roadCut` → `roadCutMask` (`road-cut-mask.ts`) v krytí pole,
  dev ukázka Cesta (`withRoadCuts`). **Brázdy končí na cestě** (oxen.md): jádro – výkon orby
  s průměrnou délkou kusu pásu mezi cestami (`bandFurrowM` v `plough-trip.ts`, `roadCapsules` /
  `roadFreeRuns` v `road-land.ts`, i plán osevu `plannedFurrowEfficiency(…, state, landscape)`);
  scéna – `roadPieces` (`plough-roads.ts`): pruh dne po kusech mezi cestami (`PloughField.rowRuns`,
  `fillLo` / `fillHi` – brázda řady po celé šířce až k cestě), oddělený kousek (`roadCut`) se
  neorá, v `dayStints` i `ploughFront`; `/dev/landscape` **Orba přes cestu** (`demoRoadPlough`).
- **Jabloně podél pevné cesty** ([roads.md](docs/design/roads.md) – fáze 3): `VillageRoads.apples`
  (`RoadApple` – místo, úsek, `distanceM` vzdušnou čarou, `plantedDay` null = čeká na výsadbu,
  `constructionId`). `road-apples.ts`: `roadAppleSpots` (po 10 m střídavě – `roadTreeSpots`
  s rozestupy `ROAD_APPLES`, mimo stavby (pole ano – jabloň mu vezme 20 m², `treeTakenLand`),
  les, vodu, osy cest, překážky, stromy u cest a jiné jabloně), `roadApplesOption` (počet, práce, důvod česky), `startRoadApples` → stavba
  `kind: 'road-apples'` s `roadIds`; práce jen v oknech výsadby (`roadApplesNeed`, kroky
  `workRoadApples` / `finishRoadApples` se neexportují). Úroda a práce jako sad na strom
  (`roadAppleYieldKg`, `roadAppleHarvestWork`, `roadAppleCareWork`, `roadApplePlantingWork`
  v `orchard.ts`, `startWork` je přičte k sadům); stadium `roadAppleStage` (čeká, strom, souš
  10 let – pak zmizí v `updateRoads`), překážka `roadAppleObstacleKind` v `obstacleChangesAt`.
  Práce v rozdělení `{ kind: 'road' }` (`orchardAreas` – jabloně podle plochy na strom).
  Use-case `plantApplesAlongRoad`, server action `plantRoadApples` (`{ roadId }`). Web:
  `VillageRoad.apples` (panel – počet, plodící, výsadba, nabídka), `SceneVillage.roadApples`
  (`sceneRoadApples` – velikost a plody jako sad z `orchard-look.ts`), tlačítko „Vysadit jabloně“
  (ikona `jablone`), jabloně ve scéně přes `path-trees.ts` (`roadAppleInstance`, meshe
  `pathside-apple-*` s materiálem `prepareAppleMaterial` ze sadu, kůly `createTreeStakeMesh`),
  vytyčení `appleStaking` v `RoadWorks`, postavy `roadApples` ve `villager-plan.ts`;
  `/dev/landscape` tlačítko **Jabloně: …** (s **Cesta**) přepíná stadia.
- **Dvorec vojvody** ([trade.md](docs/design/trade.md) – Dvorec vojvody, Jak je postavené;
  `manor.ts`): `VillageState.manorId` = obydlí (domácnost), odkud jdou vylepšení vsi – nová ves
  první zemnice zakladatelů (`foundVillage`), starší nejstarší obydlí (`withManor` v
  `updateVillage`, `keepManor` krok dne, `villageManorId` / `villageManor`). Typ obydlí `dvorec`
  (`DwellingType`; hráč ho nestaví – `BuildableDwellingType` = zemnice a polozemnice v nabídce,
  stěhování a vstupu server actions): kapacita 10, cena a dřevo polozemnice × 1,5 (`DWELLINGS`,
  `DWELLING_TREES`, `MANOR`), dožilý dvorec `decideRebuilds` přestaví vždy na `dvorec`.
  **Pozemek dvou políček:** `DwellingPlot.yard` (dvůr stranou vedle políčka domu, varianta
  `center`, dům vchodem ke dvoru – `yardRotation`, `plotCells` v `plot-cells.ts`, `copyPlot`),
  `checkPlotPlacement` u dvorce dvůr vyžaduje, `relocationPlot(…, 'dvorec')` hledá dvojici volných
  políček (`YARD_SIDES`). Model `tools/blender/dwellings.py` pátým argumentem `dvorec` (jen
  `dvorec.glb`, brána `dvorec-gate.glb`, díly staveniště `dvorec-construction.glb` – uzly
  `dvorec-…`, řezby `carving` ve fázi `carve`; srub 4,6 × 8,4 m, zubořez na štítech, koňské hlavy
  na kozách – `DVOREC_*`, musí sedět s `PIT_SHAPES.dvorec`, `SHAPES` a `SMOKE_VENT` v
  `dwelling-decor.ts`, `MANOR_HOUSE_RECT_M` v `homestead-layout.ts`). Scéna: model a díly
  staveniště se načtou až s prvním dvorcem (`loadManorModels`), `ScenePlot.yard` /
  `PlotSquare.yard` – plot přes obě políčka (`plotFenceRect`), brána `MANOR_FENCE` a model brány
  (`HomesteadLayout.gate`, `HomesteadRenderer`), výběr a zvýraznění celého pozemku; dvorec se
  zatím nerozpadá (`dwellingDecayStage`), zbytek jámy jako po polozemnici (`decayModelType`).
  Panel: portrét „Dvorec vojvody“ a vylepšení vsi (`hud/ManorPanel.tsx`, data `lib/manor-view.ts`).
  Ikona `icons/build/dvorec.png`, ukázka **Dvorec vojvody** na `/dev/buildings`.
- **Zemská stezka** (trade.md – Zemská stezka; `trail.ts`): `trailRoutes` – jedna Dijkstra po
  terénu pěšin celé krajiny (`trailTerrain` s překážkami, po pevné cestě × 0,5 – `TRAIL`) z místa
  za branou dvorce (`trailStart`) do všech 8 směrů (`DIRECTIONS`, `Direction8` = `NeighborDirection`
  z příbuzenství, sever +z), v mezipaměti podle krajiny, bodu a sítě cest (první dotaz ≈ 0,7 s,
  pak ≈ 10–30 ms). `planTrail` uloží osu jako pevné cesty na kopii stavu (`addTrailRoads` v
  `paths/roads.ts` – nové úseky po 150 m přes `formRoad`, po pevné cestě vede po ní, rozdělení
  úseku přidá kus stezky – `splitTrailPieces`), úseky `Trail.pieces` se stupněm a prací
  (`roadUpgradeCost`, hať a lávka přes mokřinu a brod, dřevo `planWoodFrom`), důvody česky
  (`TRAIL_BLOCKED`, `TRAIL_NO_WOOD`…). `startTrail` → stavba `road` s `Construction.trail`
  a `roadIds` od vsi ven; `trailsDay` (krok po práci) dá dostavěným úsekům stupeň hned,
  `finishTrail` (ve `finishConstructions`) hotovou stezku, kronika `trail-built`. Práce na úseku
  u čela (`trailWorkFront`, `trailWorkRoad` v `labor-report.ts`). `trailOptions` – nabídka 8 směrů
  (stav, průběh, délka, cena, dny cesty `trailTripDays`). Use-case `buildTrail`, server action
  `buildTrail` (`{ villageId, direction }`). Web: růžice šipek `TrailCompass`, scéna
  `lib/trail-view.ts` (`sceneTrails` – osa stezky, `trailRoadWork` – vytyčení a průběh po úsecích
  v `sceneRoads`), `SceneVillage.trails`. Ikona `icons/build/stezka.png`.
- **Sousedé a obchod** (trade.md – Sousedé, Obchod; `neighbours.ts`, `trade.ts`): `neighbourOf(seed,
směr)` – stálá povaha podle druhu souseda (`neighbourKind` – obilnáři, pastevci, lesní ves,
  řemeslníci, každý dvakrát kolem vsi; `NEIGHBOURS.kinds`: 2–3 nabízí ze své nabídky, 2–3 shání –
  `always` vždy, zbytek z `needs`), roční zásoby a poptávka `NEIGHBOURS`, jméno
  `suggestVillageName`), `neighbourStock` – zbytek roku obchodu
  (`tradeSeason` – od 1. 11.), ukládá se jen `VillageTrade.neighbours`. Hodnoty zboží v kg obilí
  `TRADE_GOOD_VALUES` (rešerše `research/2026-10-18-trade-values.md`), ceny `sellPrice` / `buyPrice`
  (přirážka a příplatky `TRADE`), `tradeQuote` – kontrola a ocenění (bilance pro souseda ≥ 0,
  nosiči `expeditionPorters`, dny, práce; důvody česky). `startExpedition` odebere zboží a zapíše
  výpravu (`TradeExpedition`). **Lidé na výpravě mají vlastní podíl práce** (Martin 19. 10. 2026):
  jediné pravidlo pro každou výpravu ve `state.trade.expeditions` (i nákup u sousedů) –
  `expeditionLaborToday` = `expeditionLaborNeed` (každá výprava kolik s ní jde lidí – nosiči,
  honáci, posádky vozů –, nejvýš co jí zbývá), nejvýš kolik je dospělých mimo dílny; jde do
  `allocateDay` jako `away` hned po denním minimu domácností (to má přednost), před úlohami dne –
  výprava trvá přesně dny z náhledu, zdrží se jen ves bez dost dospělých;
  `workExpeditions(state, allocation.away)` ho rozdělí mezi výpravy (v rozdělení práce dne nejde
  ze společné práce – `idle` nezmenší); `finishExpeditions` (po práci – zboží do zásob, kronika
  `trade-departed` / `trade-returned`). Rozdělení práce: činnost `trade`, cíl `{ kind: 'trail' }`
  – ve scéně jde výprava jako **karavana** (`scene/caravan.ts`, data `SceneVillage.expeditions`
  z `lib/caravan-view.ts`): jedna skupina po zemské stezce podle postupu výpravy v herním čase
  (`caravanProgress` – postup dne plynule dnešním tempem, `caravanHead` – tam, den za krajem mapy
  pryč, zpátky), ne podle práce dne – nosiči nezmizí, ani když výprava dnes nepostoupila; tam
  nosiči s nákladem a lidé, kteří odcházejí (`givePeople.members`), zpátky nosiči a lidé od
  souseda (`newcomerProfiles`); postavy `caravanFigures` ve `villager-plan.ts` (podíl `trade`
  se pak nekreslí; `VillagerPose.hidden` za krajem mapy), vůz v čele `caravanCartPlan`
  (`CartCaravan` v `cart-layout.ts`, `CartPose.hidden`); obal postav zahrne celé stezky
  s karavanou (`caravanExtent`). Ukázka `/dev/landscape` – **Karavana**. Use-case `sendExpedition`,
  server action `sendExpedition` (`{ villageId, direction, give, get, givePeople?, getPeople? }` –
  `parseSendExpeditionInput`).
  Web: `VillageManor.neighbours` (`neighbourViews`), panel `hud/TradePanel.tsx` (soused a směr,
  bilance pro souseda ikonou vah `resources/balance.png` – zeleně ≥ 0, červeně záporná –, dva
  sloupce v `hud-inset` s viditelnými hlavičkami „Dáš“ / „Dostaneš“ a portrétem dvorce, řádky
  `TradeRow` s popiskem „Soused shání – vezme ještě …“ / „Soused nabízí – má ještě …“
  – `tradeAmountText`; záložky sousedů jen při víc sousedech; náhled `lib/trade-quote.ts`),
  upozornění, ikona `icons/build/obchod.png`. **Po odeslání** (Martin 19. 10. 2026 – „dál nějak
  nevím, co se bude dít“): výběr se s novým pohledem ořízne na meze souseda (`clampSelection`,
  `tradeLimits` – úprava stavu během renderu při změně `neighbour`), náhled `tradePreview` dělá
  všechny kontroly `tradeQuote` se stejnými důvody (konstanty z jádra), `onSend` vrací důvod
  odmítnutí – panel zůstane otevřený a ukáže ho červeně (`trade-error`), dokud se výběr nezmění;
  výprava na cestě `ExpeditionView` (`expeditionView` v `manor-view.ts`: `daysLeft`, `pace`
  `full` / `slow` / `waiting` / `starting` z podílu `trade` v rozdělení práce dne; `slow`
  a `waiting` jen výjimečně – málo dospělých, přesýpací hodiny „Výprava stojí“ / „Málo
  dospělých“); u práce kolik vozy ušetří (`savedManDays`).
- **Jen společné suroviny** (trade.md – Jen společné suroviny; Martin 19. 10. 2026: „Nech jen
  společné suroviny, nezaváděj nové.“): obchod zná jen zboží, které má i ves (`TradeGood` – obilí,
  luštěniny, maso, sýr, dobytek, klády, keramika, nástroje, uhlí; `TRADE_GOODS`). Zboží zvenku
  (sůl, železo, med, kožešiny – dřívější `goods.ts`) ve hře není. Starší vsi převede
  `withoutForeignGoods` (`trade.ts`; v `updateVillage` i na začátku `advanceVillage`, bez příznaku,
  idempotentně): zahodí `goods` a podíl medu v jídle, uložený zbytek roku souseda, který nesedí na
  jeho povahu, a výpravu na cestě pro zboží zvenku zruší – nosiči přinesou zpět, co nesli
  (`get` = `give`); z kroniky výprav zboží zvenku zmizí.
- **Výměna lidí** (trade.md – Výměna lidí; Martin 19. 10. 2026: „Se sousedem půjde vyměnit
  i lidi…“, „Mohou se stěhovat celé rodiny i jen dospělí. Podle toho, co je v nabídce.“;
  `people-trade.ts`): soused má na rok obchodu lidi navíc, nebo je shání (`neighbourPeople` – ze
  seedu, směru a roku; `NeighbourStock.people` – `families` počty dětí rodin, které dá, `men`,
  `women`, `takes`; chybí u zbytku roku uloženého dřív – doplní `neighbourStock`, uložený
  s `adults` převede `storedNeighbourPeople`). **Muži a ženy zvlášť** (Martin 19. 10. 2026 – dvě
  ženy od souseda neměly s kým založit domácnost): `TradePeople` = `families`, `men`, `women`,
  pohlaví svobodných souseda se losuje v nabídce (na konci losu – rodiny a počty beze změny);
  výprava s `getPeople.adults` (uložená dřív) losuje pohlaví při příchodu jako dřív. Cena `PEOPLE_TRADE`
  (dospělý 360 kg obilí, dítě polovina – `personValue`, `neighbourFamilyValue`, přirážky
  `sellValue` / `buyValue`). `TradeOffer.givePeople` / `getPeople` (`TradePeople`);
  `tradeQuote` je ocení a zkontroluje (`NO_PEOPLE_WANTED`, `OVER_PEOPLE_DEMAND`,
  `NO_EMIGRANTS`…). Koho ves dá, vybere `emigrantGroups` (`Emigrants` – rodiny podle
  `familiesOf`, pak svobodní muži, pak ženy 16–44 – `nextSingle`, z nejvíc přeplněného domu, ne
  dvorec, ne dědic – `unmarriedHeir` v `households.ts` –, ne rozpad domácnosti; postupně, prefix
  stálý); odejdou hned v `startExpedition` (`removePeople` se směrem, `TradeExpedition.givePeople`
  i s `members` – pohlaví a den narození pro postavy karavany). Lidé souseda
  (`TradeExpedition.getPeople`, `ComingPeople`) přijdou v `finishExpeditions` – `settleNewcomers`
  podle `newcomerProfiles` (pohlaví a věk z losu ze seedu a id výpravy – stejně pro postavy ve
  scéně; rodina do prázdného obydlí, jinak do domu s nejvíc místy mimo dvorec, svobodný do
  obydleného domu s nejvíc místy; kronika `newcomer`). Lidé nosiče nepotřebují. Web:
  `VillageNeighbour.people` (`neighbourViews` – `offers`, `takes`, `have` po výběru jádra), náhled
  `tradePreview(…, people)`, řádky rodina / muž / žena v `TradePanel` (ikony
  `resources/family.png`, `man.png`, `woman.png`), upozornění „Přišla rodina ze severu“.
- **Ohrada s přístřeškem** ([oxen.md](docs/design/oxen.md); ve vsi `SceneVillage.pens` –
  `village-pens.ts` ve `VillageRenderer`: fáze podle `progress`, branka k nejbližšímu obydlí
  (vchod z jádra – `penEntrance`, `penEntranceFacing`; paths.md – Vchody),
  zvířata `penAnimalsFor` na místa `spots` – voli spřežení (v den orby na poli), telata ve
  výcviku menší, v zimě krávy; výběr `{ kind: 'pen' }`, panel se stářím spřežení a průběhem
  výcviku (bez tlačítka – cvičí se samo);
  ukázka **Ohrada** na `/dev/buildings`): přístřešek s pultovou doškovou střechou, jesle,
  žlab a branka ze žerdí z `tools/blender/pen.py` (`models/pen/pen.glb`, díly staveniště
  `pen-construction.glb` „ohrada-…“; materiál `…-low` = jen poprašek sněhu – pod střechou
  nesněží), plot je sdílený pletený plot (`PEN_FENCE`), stoh = kupka z polí. Rozmístění,
  fáze stavby a póza zvířat `pen-layout.ts` (čisté funkce, testy – branka na straně ke vsi,
  přístřešek v zadním rohu naproti; `SHELTER_M` musí sedět s rozměry v `pen.py`), kreslení
  `pen-renderer.ts`, voli (VAT klip `idle`) a kráva `pen-animals.ts`. Na stránce přepínač **Zima**.
  **Rozpad opuštěné ohrady** (abandonment.md): `PenView.condition` → `penDecayParts` (sešlá:
  vybledlé děravé došky s mechem, prázdné jesle, žlab bez vody; propadlá: prověšená střecha,
  spadlá branka; rozpadlá: sloupy a krokve) z `models/pen/pen-decay.glb` (`pen.py`, pátý
  argument `decay`; místo dílu `penDecayPlace`), bláto mizí (`PEN_MUD_BY_STAGE`), stoh jen
  u celé, plot `decayFence`.
- **e2e:** testy běží v běžícím pomalém světě (2000–2200). Kliknutí do scény při umisťování
  nahrazuje háček `window.__bohemiaE2E.confirmPlacement`, kam kliknout myší pro výběr řekne
  `projectToScreen` (`lib/e2e-hooks.ts`) – existují jen v buildu s `NEXT_PUBLIC_E2E_HOOKS=1`
  (nastavuje `playwright.config.ts`), jinde se z kódu vypustí.

## Příkazy

```bash
npm install
npm run db:migrate    # migrace do lokální DB bohemia (bez DATABASE_URL)
npm run dev           # http://localhost:3010
npm run build
npm run typecheck     # next typegen + tsc
npm run lint
npm run test          # unit testy (Vitest)
npm run test:db       # testy adaptérů proti DB bohemia_test (Homebrew Postgres musí běžet)
npm run test:e2e      # Playwright – build + next start na :3011 proti DB bohemia_test
npm run format:check  # npm run format = oprava
npm run db:generate   # nová migrace po změně schématu v packages/db/src/schema
npm run db:seed-dev   # vývojový účet v lokální DB bez registrace
npx tsx packages/game/scripts/measure-landscapes.ts 500   # měření generátoru krajiny (+ initial = verze 1)
npx tsx packages/game/scripts/measure-village.ts --quick --out quick.jsonl   # kalibrace vsi (50 vsí)
npx tsx packages/game/scripts/measure-village.ts 200 60 --out base.jsonl     # závěrečné ověření
npx tsx packages/game/scripts/measure-village.ts 200 60 --variant meadow-burn --out burn.jsonl
npx tsx packages/game/scripts/village-calculator.ts --preset full --fertility 56   # ustálený stav
npx tsx apps/web/scripts/measure-scenery-culling.ts   # trojúhelníky a draw cally s ořezem po čtvercích
```

Všechny příkazy jdou přes Turborepo do jednotlivých workspaces. Před commitem musí projít
`typecheck`, `lint`, `test` a `format:check`; u změn adaptérů DB i `test:db`, u změn
přihlašování, stránek nebo scény i `test:e2e`.

---

## Architektura – hexagonální (porty a adaptéry)

**Závazné pro všechny herní mechaniky** (schváleno 16. 10. 2026).

```
packages/game/src/domain/       doména – entity a pravidla, čisté deterministické funkce
packages/game/src/application/  use-casy (herní akce) + porty (rozhraní: repozitáře, Clock…)
packages/db/src/adapters/       adaptéry portů – Drizzle implementace repozitářů
apps/web, apps/worker           vstupní body – spojí adaptéry s use-casy (composition root)
```

- **Závislosti míří jen dovnitř:** vstupní body a adaptéry → use-casy → doména. Doména nezná
  nic jiného, use-casy znají jen doménu a vlastní porty.
- **Doména a use-casy neimportují infrastrukturu** (DB, Drizzle, Next.js, React, Better Auth,
  `node:*`) a doména neimportuje use-casy – **hlídá ESLint** (`eslint.config.mjs`).
- **Determinismus:** v `packages/game` žádné `Date.now()`, `new Date()` bez argumentu ani
  `Math.random()` – čas a náhoda přicházejí parametrem nebo přes port – **hlídá ESLint**.
- **Use-case = jedna herní akce** hráče nebo světa (např. `buildStructure`, `resolveSeason`):
  načte stav přes port, zavolá doménové pravidlo, uloží výsledek přes port. Žádná herní logika
  v adaptérech, route handlerech, server actions ani React komponentách.
- **Web i worker volají stejné use-casy** – herní logika existuje jen jednou.
- **Testy:** doména a use-casy unit testy s in-memory implementacemi portů (ne mocky Drizzlu);
  adaptéry proti skutečné databázi `bohemia_test`.
- **Přihlašování (Better Auth) je mimo hexagon** – služba frameworku v `apps/web`. Doména zná
  jen ID hráče.
- **Herní čas je čistá funkce skutečného času**, ne čítač tiků (`domain/calendar.ts`). Výpadek
  workeru tak čas neposune – worker po restartu doběhne zmeškané události podle jejich herního
  termínu.
- **Server je jediná autorita.** Klient jen zobrazuje a posílá záměry hráče; výsledky
  (stavby, suroviny, boje) počítá a ověřuje server.

## Konvence

- **Jazyk:** UI a dokumentace česky, identifikátory v kódu anglicky, komentáře v kódu česky.
- **Typografie:** v češtině krátká pomlčka „–“ s mezerami, nikdy „—“.
- **Commity:** Conventional Commits česky, např. `feat(web): registrace hráče`.
- **TypeScript:** explicitní návratové typy funkcí (vynucuje ESLint), žádné `any`.
- **Repo je veřejné:** žádná tajemství v gitu. `.env` je v `.gitignore`, do repa patří jen
  `.env.example`. Do dokumentace nepatří IP adresy, hesla ani přístupy k serveru.
- **Herní design před kódem:** novou mechaniku nejdřív popsat v `docs/design/` a nechat
  schválit, teprve pak implementovat.

## Lokální vývoj a nasazení

**Zatím se vyvíjí a běží jen lokálně.** Nasazení na VPS se řeší až později – do té doby nic
nenasazovat ani nepřipravovat produkční infrastrukturu.

- **Databáze lokálně:** PostgreSQL 17 z Homebrew (`postgresql@17`, běží jako služba na
  `127.0.0.1:5432`, uživatel `postgres` bez hesla). Databáze `bohemia` (vývoj) a `bohemia_test`
  (e2e testy). Bez `DATABASE_URL` se použije `bohemia`. `psql` není v PATH – plná cesta
  `/opt/homebrew/opt/postgresql@17/bin/psql`.
- **`apps/web/.env.local`** (mimo git) drží `BETTER_AUTH_SECRET` a `BETTER_AUTH_URL`; vzor
  všech proměnných je v `apps/web/.env.example`.
- **Později:** Hetzner VPS (PostgreSQL už tam je), PM2 + Caddy, Next.js ve standalone režimu.
  Až se bude nasazovat, popsat v `docs/deployment.md`. Nezapomenout: skutečné odesílání
  e-mailů, `BETTER_AUTH_SECRET` a `DATABASE_URL` v produkci, Google redirect URI pro produkční
  doménu a `advanced.ipAddress` v Better Auth (za Caddy věřit jen jeho `X-Forwarded-For`, jinak
  jde omezení pokusů o přihlášení obejít podvrženou IP).
