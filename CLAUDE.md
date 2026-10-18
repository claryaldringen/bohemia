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
  (datum v liště, roční období a dým ve scéně). Posun jen roste, platí i bez `devMode`.
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
  nestahoval mimo herní plochu (hlídá e2e test).
- **Kreslí se jen při změně** (pohled kamery, velikost okna, data) – co se ve scéně mění samo
  (animace, voda, roční období), musí nastavit `needsRender`. **Výjimka: voda teče** (Martin) –
  dokud je hladina v záběru, scéna se překresluje `WATER_FPS` (30) za sekundu; vlnky plují po
  proudu (`water.ts`, rychlost proudu odvozuje osa potoka v jádru ze spádu a šířky potoka,
  kalnost a podloží `scene/stream-geometry.ts`). Zamrzlá voda neteče: `flowsInView` zná čtverce
  hladiny (`FLOW_CHUNK_M`) a od jaké zimy jsou celé zamrzlé – kreslí se, jen dokud je v záběru
  nezamrzlá voda.
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
  i se stínem je to 15 samplerů, WebGL 2 zaručuje 16 (další vrstva = pole textur). Louky podle
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
- **Změny krajiny vsi ve scéně:** `SceneVillage.obstacles` (`removed`, `stumps`, `saplings` –
  id) skryje `InstanceHider` podle id (3D stromy, impostory i dekorace); ozdoby bez id skrývá
  pod stavbami a poli podle tvaru. Na místo pokáceného stromu dá `felled-trees.ts` pařez,
  po TREE_SAPLING_AFTER_YEARS mladý stromek. **Vymýcený les** (`cleared-forest.ts`, čistý
  modul): maska po políčkách ze stavu vsi – políčko lesa bez aspoň poloviny dospělých stromů
  nebo pod založeným dílem pole. Plocha korun nad pasekou zapadne pod zem
  (`ForestCanopy.setCleared` mění jen výšky vrcholů), ztmavení trávy se přepočítá bez skrytých
  stromů do modrého kanálu splat textury (`TerrainMaterial.setHiddenTrees` – žádný sampler
  navíc), stínová mapa se jednou překreslí a minimapa kreslí vykácený les jako paseku. Vše jen
  při změně (`applyVillage`).
- **Světlo:** letní slunce a obloha podle 0 A.D., kontrast 1,1. **Stíny od slunce**
  (`sun-shadows.ts`) – stínová mapa 4096 přes celou krajinu se vykreslí jednou; vrhají je meshe
  pojmenované `trees-*`, `impostors-*` a `decor-*` (při přejmenování zachovat prefix).
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
  střechy (`applySeasonSnow`). Impostory (`applySeasonImpostors`) mají druhý sampler se
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
  ovce s kozami (stádo na 5 domácností) a krávy se pasou **přednostně na úhoru vsi** (Martin:
  na úhoru pasáček se zvířaty – mladý úhor vždy, louka na seno jen po seči na otavě, srpen až
  listopad: `grazeablePart`, `grazingDay` z rozdělení práce), jinak na louce do 300 m (ne osetý
  díl, hřbitov, obydlí, voda, skála, prudký svah), prasata na okraji lesa (−7 až +5 m od hranice, hlouběji je
  zakryjí koruny) do 150 m (jinak do 260 m), nejbližší vhodný okraj první – za lesem po otočení
  kamery zmizí, to nevadí (Martin). **Pohyb běží ve skutečném čase, ne v herním** – ve
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
  na obsazeném políčku až přestavbou na nejbližším volném do 50 m – `relocationPlot`, proto
  `advanceVillage` dostává krajinu), `PLOT_TYPES`, `PLOT_VARIANTS`, `PLOT_HOUSE_OFFSET_M`,
  `plotHousePosition` a `checkPlotPlacement` v `placement.ts` (louka, bez výchozu, bez
  posvátného dubu a čtverce háje, dům ne pod korunou dubu, nezabrané polem, hřbitovem, sadem ani
  jiným obydlím či pozemkem, rovno jen pod domem, `spared` vždy prázdné; překážky celého
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
  přepínají variantu místo otáčení), vytyčení při 0 % kolíky a provázkem kolem pozemku
  (`plotStakingLine`), výběr i kliknutí kamkoli na pozemek označí celé políčko, rekvizity
  staveniště rohového domu se zrcadlí dovnitř (`sitePropPlace`), slepice zůstávají uvnitř
  plotu, cizí ani lidé do pozemku nechodí, hromada klád leží za plotem. Dílny z polozemnice
  (hrnčíř, kovář) pozemek nemají – stojí volně jako dřív. **Hřbitov** (`cemetery-renderer.ts`,
  geometrie bez Babylonu v `cemetery-layout.ts`): nízký pletený plot po obrysu čtverců (sdílený
  pletený plot, zakulacené rohy) s brankou k nejbližšímu hotovému obydlí (při rozšíření jinam
  zůstane), uvnitř mohylky po hrobech (mřížka 7 × 8 na čtverec, poslední čerstvé z hlíny);
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
  (`models/sacred/oak-offerings.glb`, počátek v ose kmene; dub sám se nikdy neskrývá – není
  v `obstacles.removed`; dub i obětiny se postupně zvětší – `SceneSacred.oaks[].growth`
  z `lib/sacred-look.ts`, jen vzhled, po herních letech, strom zvětší `InstanceHider` přes
  `scales`), hraniční kameny a oltář na okraji čtverců háje (`grove-stones.glb`,
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
- **Řemeslné dílny** (ve hře od 18. 10. 2026, pravidla v [docs/design/crafts.md](docs/design/crafts.md),
  jádro a rozhraní viz Ves – Řemesla): `public/models/crafts/`
  hrnčíř a kovář (polozemnice s přístřeškem o `PORCH` 3,6 m vpředu, pod ním pec / výheň
  s kovadlinou), uhlíř (zemnice s mechovou střechou) a samostatný milíř ≈ 9,5 m od ní
  (`MILIR_OFFSET` v `tools/blender/crafts.py` = `MILIR.offset` v `rules.ts` jádra – podle něj
  stojí milíř i ve hře). Tvary bere `crafts.py` z `dwellings.py` (ten má proto
  `if __name__ == "__main__"`), sedí do jam obydlí (hrnčíř, kovář = polozemnice, uhlíř = zemnice).
  Atlas: `tools/blender/craft_atlas.py` (atlas obydlí + pec, kámen, zem milíře, uhlí…; varianta
  `atlas-moss.jpg` s mechem místo slámy). Postup v hlavičce `crafts.py`, ikony `icons.py hrncir,kovar,uhlir`.
  **Fáze stavby** řemesel: `village-construction.ts` má tabulku fází pro každý druh
  (`ConstructionKind` = obydlí + `CraftKind`; dílny na fázích svého obydlí + přístřešek, pec /
  výheň, dílna, uhlíř mech místo došků, milíř zvlášť), díly v `public/models/crafts/construction.glb`
  a `construction-moss.glb` (předpona druhu). Obydlí se tím nezměnila.
  Dílny bez hráně polen: hrnčíř a kovář mají místo dílu `wood` díl `yard` (koše), uhlíř
  volnou hromadu polen na milíř (`log_heap` v `crafts.py`).
  **Náhled všech staveb** bez databáze: http://localhost:3010/dev/buildings (`building-showcase.ts`,
  staveniště `showcase-sites.ts`, posuvník a přehrání stavby; v produkci 404). Za řadou staveb
  pole, hřbitov a sad po čtvercích – kreslí je herní `VillageRenderer` (bez obydlí) podle
  `showcaseGrounds` v `building-showcase-layout.ts`: pole zakládání → brázdy → osev, pak jen
  jako náhled zelené a zralé obilí a strniště (`CropLook` / `crop` dílu v `SceneVillage`, server
  ho zatím neposílá), hřbitov vytyčení → kůly → plot → přibývající mohylky, sad vytyčení → kůly
  → sazenice → rostoucí stromky → jablka.
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
  `startWorkshop`, `foundField`, `foundCemetery`, `foundOrchard`, `foundPen` a `trainTeam`. Stav
  vsi je JSON-serializovatelný, funkce vstupní stav nemění. Nové části stavu jsou volitelné
  (`VillageState.cemeteries?`, `orchards?`, `applesKg?`, `orchardWork?`, `starvationDays?`,
  `extinctDay?`, `crafts?`, `Dwelling.workshop?`, `livestock?`, `meatKg?`, `hay?`, `pens?`,
  `diet?`) – vsi uložené dřív se načtou a beze sadů či dílen se jejich stav nemění.
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
- **Hřbitov** (`cemetery.ts`, cemetery.md): čtverce s 56 hroby, zemřelý se pohřbí do hotového
  hřbitova s místem nejblíž k obydlím (`bury` v `populationDay`), kronika `cemetery-full`.
  Čtverce navazující stranou na hřbitov ho **rozšíří** (`foundCemetery`: stejné id, čtverce na
  konec s `constructionId`, dokud se ohrazují, a nepočítají se); na dva hřbitovy navázat nejde.
  Hráči se říká vždy **Hřbitov** (texty), v kódu zůstává `cemetery`.
  **Hygiena** (`villageHygiene`, 0 bez hřbitova s místem, jinak podle vzdálenosti od hotových
  obydlí a vody – vzdálenost od vody se ukládá u čtverce při založení, simulace krajinu nemá)
  násobí úmrtnost, hájení chrání. Je jen vnitřní – **nikdy ji neukazovat hráči** (Martin), panel
  ukáže jen hroby (obsazené / všechny) a na kolik let (`CemeterySummary.yearsLeft` z úmrtí
  v kronice).
- **Sad** (`orchard.ts`, orchard.md): staví se po čtvercích jako pole (`orchardPartsFromCells`,
  sad, pole, hřbitov ani obydlí se nepřekrývají). Výsadba je stavba ze společné práce jen v oknech
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
  pracují jen v dílně (`workshopLabor`, `workCrafts` v kroku práce – mimo `allocateDay`, do sil
  plánu osevu se nepočítají); uhlíř a hrnčíř kácejí strom po stromu (`Workshop.felling` je
  vyhrazený – `reservedTrees` / `claimedObstacles` ho znají), zásoby `VillageState.crafts`
  (kg uhlí, nástrojů, keramiky; opotřebení `wearCraftStocks` jen v užívání). **Pokrytí**
  `craftCoverage` se spočítá na začátku dne a jde všude, kde platí meze (plán osevu, přidané díly,
  založení pole – i `PlacementVillage.toolCoverage` pro náhled –, denní minimum, ztráty zásob,
  jablka v nádobách `applesSpoiled` / `appleKeepDays`). Rozdělení práce dne má `craft` (u dílny)
  a `fell` u stromu dílny. Web: `VillageView.crafts` (zásoby, pokrytí, dílny s `activity`),
  `households[].craft`, `SceneVillage.dwellings[].craft` / `working`, server action
  `placeWorkshop`, mřížka staveb hrnčíř [F], kovář [G], uhlíř [H] (`placement: 'workshop'`),
  lišta uhlí / nástroje / keramika (jen ves s dílnou), panel výběru dílny, upozornění
  `no-charcoal` / `no-wood`.
- **Ozim a jař** (fields.md – Ozim a jař): roční plán (`YearPlan`) nese práci jaře nahoře (tvar
  plánu z doby před ozimem) a ozimu v `winter?` (`CropWork`); díly osevu mají `crop?` (chybí =
  jař). Okna prací po plodinách `CROP_WINDOWS` (`WINDOWS` = jař, `WINTER_WINDOWS`) v `rules.ts`.
  K 1. 9. rozhodne `chooseCrops` (`sowing.ts`): díly v pořadí `sowingOrder`, každý do ozimu, když
  ho podzim (září–říjen po sklizni jablek) stihne a červenec sklidí, jinak do jaře, když se
  vejde do zbytku podzimu, jara a srpna – volná práce `windowDaysLeft` × práce po denním minimu.
  Díly hotové po plánu jdou jen do jaře. Polní úlohy obou plodin řadí `fieldTasks` v `simulate.ts`
  (konec okna, ozim před jaří); `allocateDay` vrací i `taskAmounts` po úlohách vstupu (stejný
  název víckrát). Sklizeň ozimu 31. 7. (`harvestWinter`), jaře 31. 8.; příděl počítá do sklizně
  podle `daysUntilFoodHarvest` (31. 7., když ozim podle odhadu uživí srpen). Plán po plodinách
  prochází `planCrops`, všechny díly `planPartIds`.
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
- **Příloh je pastvina** (Martin): 1–2 roky mladý příloh, pak napořád `meadow` (pastvina) –
  nálet, křoviny ani les na přílohu nejsou (`OVERGROWTH_STAGES`), vrácení stojí nejvýš drn louky
  (`RECLAIM_COST_PER_HA`), kronika `part-became-forest` už nevzniká (typ zůstává pro staré
  kroniky). Na přílohu se pasou stáda a úhor ve fázi louky se seče na seno (oxen.md).
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
  `checkSacredBuildingPlacement` (půdorys 4 × 4 / 30 × 30 m na louce, svatyně ≤ 1 m převýšení,
  jedna na ves), `startSacredBuilding` (stavba `kind` `idol` / `shrine` s `position`, dub(y) přes
  `planSacredWood` – nejbližší dospělé duby, ne posvátné; cena `sacredLaborManDays`), po
  dostavění `VillageState.sacredBuildings` (id = id stavby). Surovina předem `oaks`
  (`oakSupply`). Use-case `placeSacredBuilding` (`NO_OAKS`, `SHRINE_EXISTS`), server action
  `placeSacred`. Štěstí z míst `sacredHappiness` (stropy počtu a +40).
- **Strava a dobytek** ([diet.md](docs/design/diet.md)): jídlo dne `eatDiet` / `villageMeal`
  (`diet.ts`) – ovoce (jablka; v rozhraní „ovoce“) rovným dílem do zkažení 1. 3., maso rovným
  dílem do porážky 1. 11., obilí dorovná; stropy ovoce 25 % a maso 40 % potřeby energie
  (`DIET`). `VillageState.diet` nese jídlo posledního dne (energie, pestrost, nasycení = energie
  × pestrost, podíly). **Hlad z energie:** `nextStarvationDays` a přirážka úmrtnosti dostávají
  energii, porody a štěstí nasycení (`populationDay(state, day, satiation, energy)`, ovoce
  štěstí +5 – `HappinessFactors.fruit`). Stáda `VillageState.livestock` (`livestock.ts`: počty
  s podílem kusu, mláďata 1. 4., porážka 1. 11. – nad nosnost a nejvýš polovina mláďat na maso,
  chovný pár zůstane; nosnost pastvy `pastureHa`, lesa `pigForestHa` a sena; vejce denně;
  `meatKg` se uzí 20 %/rok). Louka a les do 600 m pro pastvu jsou z krajiny ve stavu
  (`LivestockState.land`) – doplní je `withLivestockLand` (založení vsi i migrace v
  `updateVillage`); bez nich výchozí `LIVESTOCK.defaultLand`. Den hospodářství `husbandryDay`
  (`husbandry.ts`) běží před plánem osevu: ohrady, mláďata, plán seče, porážka, vejce, zimní seno.
- **Ohrada, spřežení a orba rádlem** ([oxen.md](docs/design/oxen.md), `oxen.ts`, `plough.ts`,
  `hay.ts`): ohrada (`BuildKind` `'pen'`, `checkPenPlacement`, `foundPen`, use-case `placePen`)
  je čtverec louky, stavba se dřevem jako obydlí; `trainTeam` (use-case `trainTeamInPen`,
  `trainingBlock` = důvod pro tlačítko) vezme 2 telata ze stáda a postaví rádlo (stavba `'ard'`);
  po 2 letech `Pen.team`, po 10 letech na maso. Seno `VillageState.hay` (seč 1. 6. z úhoru ve
  fázi louky – `planMowing`, sezónní úloha `mow`; zimní krmení, pokrytí volů `oxenHayCoverage`
  k 1. 3.). **Orba:** plán s vycvičeným spřežením dá díly bez drnu (`isPloughable`) do
  `CropWork.plough` (jejich kopání v `required.dig` není); úloha `plough` v oknech kopání, nejvýš
  `ploughCapacityPerDay`; setí jde za `tilledShare`; `returnPloughToHoe` vrátí díly motyce
  (konec řady kopání – `PloughWork.returned`). Postup po dílech zná úlohu `plough`
  (`field-progress.ts`), rozdělení práce posílá činnosti `plough`, `mow`, `slaughter`, `pen`.
- **Hráč staví kdy chce** (Martin) – stavbu smí zablokovat jen **cena předem** (`costs.ts`:
  `BUILD_COSTS`, `buildAffordability`): suroviny ze zásob (dnes žádné) a u obydlí **lidé
  k osídlení** (`settlers` = `availableSettlers` v `dwellings.ts`: možné nové domácnosti
  `possibleNewHouseholds` − prázdná − rozestavěná nová obydlí); pole a hřbitov lidi nechtějí.
  Tlačítko je pak zašedlé, zkratka nic nespustí, v popisku chybějící část červeně; server odmítne
  (`NO_SETTLERS`, `CANNOT_AFFORD`). `waitingHouseholds` (upozornění „Domácnost je plná“) =
  kladní lidé k osídlení.
- **Osídlení prázdného obydlí** (population.md – Prázdné obydlí): nové obydlí po dokončení
  a prázdné obydlí v kroku 6 (`occupyEmptyDwellings`) nejdřív zabere mladý pár z plné domácnosti
  se 4 dospělými 14–44 (`qualifyingDwellings`, `moveInYoungestPair`); co zůstane úplně prázdné,
  osídlí **dospělé děti z přeplněné domácnosti** (Martin, 18. 10. 2026; `adultChildrenSettlers`):
  lidé 14–44 kromě `HOUSEHOLD_HEADS` (2) nejstarších od 14 let, u neplodných rodičů (oba 45+)
  i kromě nejstaršího dospělého dítěte – dědice (`householdHeir`, Martin), všichni z jedné
  domácnosti, nebo dva jednotlivci z různých (jediný člověk by se rozpadl), a ne z domácnosti,
  jejíž zbytek by se rozpadl (`householdBreaksUp`, v `people.ts`). Možné nové domácnosti = kvalifikované + ostatní
  přeplněné s aspoň dvěma dospělými dětmi + jednotlivci po dvou. **Prázdné obydlí chátrá
  rychleji** (Martin): `decayEmptyDwelling` – bez oprav podle stáří a navíc pevný denní podíl,
  nové zanikne za `DWELLINGS[type].emptyLifespanYears` (zemnice 5, polozemnice 8 let).
- **Determinismus:** simulace jde den po dni v pevném pořadí kroků (`simulate.ts`), náhoda dne
  je ze seedu vsi a indexu dne – výsledek nezávisí na tom, po jakých kouscích se ves dopočítá.
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
  drnu). Ustálený stav bez simulace (osev, pole, práce po měsících, špičky, zásoby, dřevo, sad)
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
- **Web:** server actions `app/game/actions.ts` (`getVillageView`, `foundVillage`, `placeDwelling`,
  `placeWorkshop`, `placeField`, `placeCemetery`, `placeOrchard`, `renameVillage` → `VillageView` / `null` /
  `{ error }`; `restartGame(input?)` → `{ ok: true }` / `{ error }`),
  composition root `lib/village.ts`, `lib/village-view.ts` (DTO, smí i do prohlížeče). Typy pro scénu jsou
  odvozené odtud a z `@bohemia/game` – nedefinovat je znovu ve scéně.
- **Rozhraní jako v 0 A.D., bez popisků a průvodce** (Martin): `components/game/VillageGame.tsx`
  skládá `hud/` – `TopBar` (jméno vsi, klik = přejmenovat; ikony s čísly: lidé, obilí, maso,
  ovoce (jablka) jen když jsou nebo je sad, seno s ohradou, klády, uhlí / nástroje / keramika
  jen ves s řemesly, volná práce, nasycení (barva ikony podle energie – hlad, tooltip nasycení
  s podíly obilí / maso / ovoce), štěstí, datum; zvuk a tlačítko nabídky),
  `GameMenu` (nabídka hry jako v 0 A.D. pod lištou vpravo, F10 – smí mít slova: Začít znovu,
  Odhlásit s e-mailem v popisku, Zpět do hry; Začít znovu se živou vsí jen po potvrzení v panelu,
  bez dialogů prohlížeče, při zakládání vsi zamčené; otevření zruší umisťování i výběr, klávesy
  hry zachytí na `window` ve fázi capture, Esc zavře – z potvrzení vrátí –, klik mimo panel zavře
  a do krajiny nedojde; po konci hry se neotevře; logika kláves v `lib/game-menu.ts`), `Minimap` (vlevo dole, `lib/minimap.ts`,
  klik / tažení přesune pohled), `SelectionPanel` (dole uprostřed, jen při výběru,
  `lib/selection-details.ts`), `BuildGrid` (vpravo dole), `NoticeLines` (mizející řádky nahoře),
  `CursorReason` (jde s kurzorem při umisťování: u prošlého umístění **cena ikonami s čísly** –
  práce celkem v člověkodnech i s překážkami, u obydlí i s kácením, a ikona stromů s počtem
  stromů ke kácení, když nestačí klády, u modly a svatyně ikona dubu s počtem dubů ke kácení –
  `PlacementCost` z `lib/build-items.ts`, obydlí přes
  `dwellingPlacementCost` = `planDwellingWoodFrom` + `dwellingLaborManDays` z jádra jako při
  zahájení stavby, modla a svatyně `sacredPlacementCost`; pod ní oranžově `check.warning`, které
  stavbu neblokuje – hřbitov blízko obydlí nebo vody, obydlí blízko hřbitova, posvátný dub nebo
  háj zůstane stát; když umístění nejde, místo ceny krátký červený důvod). Kromě důvodu a varování u kurzoru žádná slova ani souhrny. Popisky = `hud/Tooltip.tsx`, jeden krátký
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
  kolik přidávají štěstí, průběh stavby a duby ke kácení).
- **Založení vsi:** dokud ves není, mřížka nabízí jen zemnici – její umístění ves založí
  s navrženým jménem (`suggestVillageName`). Pole není podmínkou. Zemnici si osadníci teprve
  postaví (stavba s `dwellingId` = id jejich domácnosti; do dostavění bydlí na staveništi, pak
  se nastěhují – `finishConstructions`). Domácnost = `Person.dwellingId`, i když obydlí ještě
  nestojí (`householdCount` v `simulate.ts`, porody po domácnostech). Starší uložené vsi se
  zemnicí od založení se dopočítají beze změny.
- **Ovládání (jako 0 A.D., hraje se i na trackpadu):** výběr `village-picking.ts` (rámeček
  `selection-highlight.ts`), kamera `camera.ts` (čisté funkce `camera-input.ts`,
  `edge-scroll.ts`). Kliknutí = do 6 px pohybu (`CLICK_SLOP_PX`), delší tah je tah.

  | Vstup                  | Nic se neumisťuje                             | Obydlí (`village-placement.ts`) | Po čtvercích (`field-painting.ts`) |
  | ---------------------- | --------------------------------------------- | ------------------------------- | ---------------------------------- |
  | levé kliknutí          | vybere obydlí / pole / hřbitov, na zemi zruší | postaví, Shift + klik staví dál | přepne čtverec                     |
  | levé tažení            | posouvá krajinu (uchopená mapa)               | –                               | přidá obdélník, s Ctrl (Cmd) ubere |
  | mezerník + levé tažení | posouvá                                       | posouvá                         | posouvá                            |
  | prostřední tažení      | posouvá                                       | posouvá                         | posouvá                            |
  | pravé tlačítko         | zruší výběr                                   | zruší                           | zruší malování                     |
  | Esc                    | zruší výběr                                   | zruší                           | zruší tah, pak malování            |
  | F10                    | otevře nabídku hry, zruší výběr               | otevře nabídku, zruší           | otevře nabídku, zruší malování     |
  | další                  |                                               | `[` / `]` otáčí, Enter postaví  | Backspace / Ctrl+Z vrátí, Enter    |

  Vždy: WASD / šipky a kurzor u okraje okna posouvají, kolečko i rozevření prstů na trackpadu
  (Ctrl + kolečko, v Safari `gesturechange`) přibližují, Q/E otáčí, R vrátí pohled na ves
  (`setCameraHome`). Zkratky staveb Z zemnice, X polozemnice, C pole, V hřbitov, B sad,
  N modla, M svatyně, O ohrada (modla a svatyně se umisťují půdorysem jako obydlí – `PlacementMode`
  `sacred`). V otevřené nabídce hry žádná klávesa hry neběží – F10 nebo Esc ji zavře (Tab jen
  po jejích položkách). Rozhraní
  obydlí hned ukáže jako staveniště a akce posílá na server za sebou (fronta v `VillageGame`).

- **Stavby po čtvercích** (pole, hřbitov; políčka krajiny 15 × 15 m, díl = políčko):
  `fieldPartsFromCells` a `cemeteryPartsFromCells` v `placement.ts` (společné kontroly čtverců;
  u hřbitova navíc `check.warning` a `warningCells`, které neblokují – oranžově). Pole smí na
  louku, do křovin i do lesa – povrch dílu `fieldSquareSurface` (les z krajiny, křoviny = louka
  s keři za aspoň rozdíl sazeb); sad a hřbitov jen na louku. Obrys výběru při malování
  prosvítá přes stromy. Server
  actions dostávají `cells` / `fieldCells` (`{ x, y }[]`). Malování ve scéně
  `lib/scene/field-painting.ts` (`FieldPainter`, režim `squares`, logika výběru ve
  `field-cells.ts`) – ovládání v tabulce výše. Obrys pole (`Field.outline`) zůstal jen u starých
  vsí.
- **Pole ve scéně** (fields.md – Co hráč vidí; podle 0 A.D.): vzhled dílu `FieldLook`
  (`village-view.ts`: `bare`, `plowed`, `sown`, `sprouted`, `green`, `ripe`, `harvesting`,
  `stubble`, `young-fallow`, `pasture`, `meadow`, `mown`, `haystacks`) posílá po dílech herní
  jádro (`SceneFieldPart.look`, rozpracovaný díl `work` 0–1 a `before`, `id`; fronta práce
  `SceneLaborShare.parts`) – **dokud neposílá, odhadne ho `field-look.ts` ze stadia a data**
  (`fieldPartViews`, `estimatePart`: zakládaný díl s `work` 0 jen vytyčený, osetý díl prochází
  rokem po čtvercích od obydlí – kopání, setí, růst, žeň s panáky, strniště; mladý úhor se pase,
  starší úhor je louka na seno – od 18. 10. 2026 posílá jádro i vzhled úhoru ve fázi louky:
  `pasture`, seč `meadow` → `mown` → `haystacks`). Práce mění díl, až když k němu dojde: rozpracovaný díl se dělí
  napříč řádky (po 8 pruzích – `WORK_STEPS`) na hotovou a nehotovou část, práce jde od strany
  blíž vsi (`workFrame`). Kreslí `field-renderer.ts` (`FieldRenderer` ve `VillageRenderer`):
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
  (`hay-meadows.ts`: `hayPhase`, `stackStands`); kolíky a provázek kolem vytyčeného pole
  (Martin: hned po zadání, `fieldStaking`). Rozmístění trsů a panáků je v `field-crops.ts`
  (čisté funkce, deterministicky po políčkách). **Louky na seno** (`chooseHayMeadows`) jsou jen
  ve vývojové ukázce – ve vsi vypnuté, seno dávají jen díly úhoru (oxen.md). Den pro
  odhad a seno: herní den rozdělení práce, jinak roční období scény (`setSeason`).
  Assety z `tools/blender/fields.py` (postup v hlavičce). Vývojové stránky: /dev/buildings
  projde posuvníkem všechny vzhledy pole i louku na seno, /dev/landscape tlačítka „Vzhled“
  a „Ukázka polí“ (pole v každém vzhledu; s „Lidé“ postavy na rozpracovaných čtvercích).
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
  (`claimedObstacles`). Mýcení (díly polí, čtverce hřbitova, staveniště) dá kládu za dospělý
  strom (`trees` u dílu / čtverce). Dřevo je surovina předem (`villageStock` s vrstvou překážek:
  klády + stromy, které jde skácet – počet stromů vrstvy v mezipaměti). Palivo: přirážka domácí
  práce podle `forestDistanceM` obydlí. Scéna: hromada klád `lib/scene/log-pile.ts` (místo
  a hranice v `log-pile-layout.ts`, bez volného místa se nekreslí), staveniště ukazuje průběh
  bez kácení (`buildProgress`).
- **Upozornění** (`lib/village-notices.ts`): plná domácnost (fakt), lidé umírají hlady, hlad,
  stojící stavby, plný hřbitov (žádný hotový nemá volný hrob), vesničané ušetřili posvátný dub
  / dubový háj (fakt, když přibude), podzimní porážka, spřežení vycvičené / dosloužilo, vůl
  uhynul, vesničané obnovují starý sad a starý sad dosloužil (nové události kroniky –
  `VillageView.chronicle[].kind`, `CHRONICLE_NOTICES`) – nově vzniklé jako krátký mizející
  řádek nahoře, žádný trvalý seznam; vymřelá ves žádná. Kronika je jen v DTO.
- **Krajina sídla** se na serveru drží v LRU mezipaměti (`lib/landscape-cache.ts`, port
  `LandscapeSource` v `enterGame`) – negeneruje se při každé akci a dotazu. Vrstva překážek
  se generuje až pro stavby (`obstaclesOf`, mezipaměť podle objektu krajiny); dotaz na ves
  (`getVillageView`) ji potřebuje jen při prvním načtení vsi založené před vrstvou (doplnění
  odstraněných překážek, ≈ 300 ms jednou).
- **Překážky ve vsi** (`domain/village/obstacles.ts`, fields.md – tabulka překážek): obydlí
  platí překážky na vyklízené ploše (`DWELLING_CLEARING_M` = staveniště scény) po kusech,
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
  v činnosti – `shareCounts`; domácí práce a nečinní venku jen z části, v zimě méně; **každá
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
- **Spřežení volů s rádlem** (ve vsi orá na prvním dílu čela orby – podíl práce `plough`
  v `SceneLabor`, 6 řad podél delší strany, kolik ohrad s voly, tolik spřežení; ukázka
  **Orání** na `/dev/buildings`): voli a oráč z `people_from_0ad.py` s `tools/blender/plough-team.json` – vůl
  `cattle_male_c` (srst přebarvená, maska srsti), oráč = muž s klipy `plough` (předklon + ruce
  dvoukloubovou IK na rukojeti, „pose“ v JSON) a `lead` (honáček s provazem); rádlo, jho, oj
  a provaz `tools/blender/plough.py` (malý atlas vyříznutý z atlasu obydlí). Rozestavění
  a pohyb `plough-team.ts` (čisté funkce času: dráha přes čtverec – řady, obraty na souvrati,
  návrat; rádlo za jhem na tětivě oje, na souvrati nadzvednuté, oráč u rukojeti), kreslení
  `plough-team-renderer.ts` (VAT jako lidé + pevné díly v instancích). Rozměry rádla a jha musí
  sedět s `TEAM_PARTS` (hlídá test).
- **Vyšlapané pěšiny** ([docs/design/paths.md](docs/design/paths.md), jen vzhled, Martin 18. 10. 2026): síť se počítá v prohlížeči z vsi a krajiny – `path-terrain.ts` (cena chůze po
  bodech sítě vykreslení ≈ 3,75 m v okně kolem vsi: sklon, voda a brody, les, příznaky břehu
  a okraje lesa; `withObstacles` přidá kmeny, keře, balvany a výchozy), `path-network.ts`
  (`computePathNetwork` – čistá deterministická funkce: cesty domácností pro vodu a dřevo
  (každá zvlášť, A* s napojením na pěšinu souseda), do cílů podle práce dne
  (`SceneLabor`) + základ zavedených míst, k sousedům; Dijkstra od cíle ke všem branám; 2 kola,
  vyšlapané buňky zlevní hned – trasy se slijí; síla z provozu `pathStrength`, stáří obydlí
  `SceneDwelling.since` → `pathAgeFactor`; výstup vyhlazené čáry se sílou a stářím v bodech,
  pochůzky domácností, provoz pro teplotní mapu; `pathRouter` – trasy po pěšinách pro postavy).
  Kreslí `path-renderer.ts` (`VillagePaths` v `LandscapeScene`: přepočet jen při změně
  `pathNetworkKey`, odloženě, nikdy za snímek; ≈ 10–30 ms) – obtisky `paths-worn` (tráva)
  a `paths-earth` (holá hlína) z `path-ribbon.ts` pod obtisky polí a vsi (alphaIndex 0,2 / 0,4,
  lift 0,018 / 0,022), sníh přes `applySeasonGround`; stromy podél starých silných pěšin
  v polní krajině `path-trees.ts` (meshe `pathside-<model>` – listnáče v zimě bez stínu podle
  `isDeciduousMesh`). Postavy: `VillagerPlanOptions.paths` (`VillagerPaths`) – `walkRoute` jde
  po pěšině, ženy pro vodu a dřevo na konec pěšiny domácnosti. Vývojová stránka: tlačítka
  **Pěšiny**, **Provoz** (teplotní mapa) a **Stáří** (stáří obydlí, s „Lidé“), čísla výpočtu.
- **Ohrada s přístřeškem** ([oxen.md](docs/design/oxen.md); ve vsi `SceneVillage.pens` –
  `village-pens.ts` ve `VillageRenderer`: fáze podle `progress`, branka k nejbližšímu obydlí,
  zvířata `penAnimalsFor` na místa `spots` – voli spřežení (v den orby na poli), telata ve
  výcviku menší, v zimě krávy; výběr `{ kind: 'pen' }`, panel s tlačítkem „Vycvičit spřežení“;
  ukázka **Ohrada** na `/dev/buildings`): přístřešek s pultovou doškovou střechou, jesle,
  žlab a branka ze žerdí z `tools/blender/pen.py` (`models/pen/pen.glb`, díly staveniště
  `pen-construction.glb` „ohrada-…“; materiál `…-low` = jen poprašek sněhu – pod střechou
  nesněží), plot je sdílený pletený plot (`PEN_FENCE`), stoh = kupka z polí. Rozmístění,
  fáze stavby a póza zvířat `pen-layout.ts` (čisté funkce, testy – branka na straně ke vsi,
  přístřešek v zadním rohu naproti; `SHELTER_M` musí sedět s rozměry v `pen.py`), kreslení
  `pen-renderer.ts`, voli (VAT klip `idle`) a kráva `pen-animals.ts`. Na stránce přepínač **Zima**.
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
