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
  public/models/     modely stromů, dekorací a zvířat a atlas impostorů z 0 A.D. (licence v LICENSES.md)
  e2e/               Playwright testy (proti produkčnímu buildu a databázi bohemia_test)
packages/game/       herní jádro
  src/domain/        pravidla – calendar.ts, landscape/ (generování krajiny po vrstvách)
    village/         simulace vsi – lidé, obydlí, pole, jídlo a práce den po dni
  src/application/   use-casy a porty (enterGame, SettlementRepository, SeedSource)
  scripts/           vývojové nástroje (measure-landscapes.ts, measure-village.ts)
packages/db/         Drizzle schéma, klient, migrace a adaptéry portů (src/adapters/)
docs/design/         herní design – vize + dokument pro každou mechaniku
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
- **Hlášky Better Auth** se překládají v `lib/auth-errors.ts` – nové chybové kódy doplnit tam.
- **Změna polí uživatele** (`user.additionalFields` v `lib/auth.ts`) → upravit i
  `packages/db/src/schema/auth.ts` a vygenerovat migraci.
- **Google:** přihlašovací údaje z Google Cloud Console do `apps/web/.env.local`
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); bez nich se tlačítko Google nezobrazí.

## Krajina sídla

Pravidla v [docs/design/landscape.md](docs/design/landscape.md).

- **Generování** (`packages/game/src/domain/landscape/`): `generateLandscape(seed, versions)` –
  vrstvy terén a voda → vegetace → úrodnost, každá s vlastním seedem (`deriveSeed`) a verzí.
  Pásmo srovnatelnosti hlídá `checkBand` (konstanty v `band.ts`) a testy na 300 seedech. Po
  změně generátoru pusť `measure-landscapes` a zkontroluj podíl krajin na první pokus a čas.
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
  kalnost a podloží `scene/stream-geometry.ts`).
- **Vývojový náhled** bez přihlášení a databáze: http://localhost:3010/dev/landscape?seed=42
  (tlačítka předchozí / další / náhodná, lišta vsi s minimapou – pole jde malovat i do lesa
  a překážky z něj hned zmizí, „Kácet 20 stromů“). V produkci vrací 404.
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
  v roce spočítá sníh, suchou / svěží trávu, množství, podzimní barvu a mladost listí, květy,
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
  `seasonFoliageFor`. Stínová mapa listí nezná – pod 30 % listí 3D listnáče (`isDeciduousMesh`)
  ze stínové mapy vypadnou a impostory dostanou do `diffuseTexture` zimní atlas (stín kmenů
  a větví), mapa se překreslí jednou. Vývojový náhled má posuvník dne v roce a „přehrát rok“
  (`setSeasonDay`).
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
- **Domácí zvířata** (Martin, zatím jen oživení – mechanika později): slepice u hotových obydlí
  (zemnice 2, polozemnice 3 – `chickensFor`, řemesla později podle základního typu), na
  obývané obydlí 3 ovce, koza a 2 prasata, kráva na dvě domácnosti; pasáci nejsou.
  `livestock-placement.ts` je odvodí z dat vsi pro scénu (`SceneVillage`, i nepovinné
  `cemeteries`) a krajiny: slepice obcházejí dům mimo obdélník domu se šíjí (`chickenBox`),
  ovce s kozami (stádo na 5 domácností) a krávy se pasou na louce do 300 m (ne pole, hřbitov,
  obydlí, voda, skála, prudký svah), prasata na okraji lesa (−7 až +5 m od hranice, hlouběji je
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
  Textura z GLB se čte jako sRGB – StandardMaterial ji převádí zpět (`LIVESTOCK_GAMMA`), jinak
  jsou zvířata tmavá. **Známá vada:** ryby a ptáci (`fauna.ts`) ten převod nemají, jsou proto
  tmavší, než by měli být – barvy ryb jsou na tom vyladěné, zatím se nechávají. Modely v `fauna.json` (ovce, koza, kráva, prase, slepice) jsou ve
  skutečné velikosti, ve scéně stylizovaně větší (`SCALE`). Terén pro zvířata je rastr 4 m
  kolem vsi (`livestockGround`) – přepočet jen při změně obydlí, polí nebo hřbitovů.
- **Ves** (`village-renderer.ts`): obydlí stojí nad skutečnou jámou – terén a obtisky se v ní
  prořezávají (`pit-cut.ts`, discard ve fragment shaderu podle pole uniform, ne textury – terén
  už má 15 samplerů), stěny, dno a schody šíje kreslí `dwelling-pit.ts` (ornice, podloží a stín
  okraje ve vrcholech). Rozměry jam a šíje musí sedět s `tools/blender/dwellings.py`.
  Staveniště jde po fázích (`village-construction.ts`, ≥ 8 fází, průběh 0–1) z dílů
  `construction.glb` v instancích. **Hřbitov** (`cemetery-renderer.ts`, geometrie bez Babylonu
  v `cemetery-layout.ts`): nízký proutěný plot kolem čtverců (kůly v instancích, pletení z vlastní
  sítě a textury z kódu) s brankou k nejbližšímu hotovému obydlí (při rozšíření jinam zůstane),
  uvnitř mohylky po hrobech (mřížka 7 × 8 na čtverec, poslední čerstvé z hlíny); založení
  vytyčení → kůly → pletení, rozšíření ve stavbě má vlastní plot, pak plot obepne celý hřbitov.
  **Sad** (`orchard-renderer.ts`, bez Babylonu `orchard-layout.ts`): jabloně z 0 A.D.
  (`models/trees/apple-1…4.glb`, s plody `apple-fruit-1…4.glb` – převod
  `tools/blender/orchard.json`, textura bez plodů `apple_leaves.py`, zralá `apple_ripe.py`)
  sponem do pětky, 2 na čtverec; výsadba čára vytyčení → kůly → sazenice, mladé stromky u kůlu
  rostou 12 let, skalní výchozy z vrstvy překážek stromy obejdou. Velikost (`growth`) a jablka
  (`fruit`, srpen až sklizeň) počítá server (`lib/orchard-look.ts`) v `SceneVillage.orchards` –
  háček pro podzim; květ, podzimní listí a holé koruny dodají roční období (`applySeasonModel`
  podle jména `apple*`, meshe `orchard-*` jsou v zimě mezi holými vrhači stínu). Modely se
  načtou až s prvním sadem.
  Dým z dýmníku (`village-smoke.ts`, sprity) podle rozvrhu ohně za herní den (`smoke-schedule.ts`, deterministicky) – hýbe se jen v záběru, ve stejném
  taktu `WATER_FPS` jako voda, při omezeném pohybu stojí.
- **Řemeslné dílny – zatím jen modely** (pravidla v [docs/design/crafts.md](docs/design/crafts.md)
  čekají na schválení, do hry, jádra ani panelu staveb nepatří): `public/models/crafts/`
  hrnčíř a kovář (polozemnice s přístřeškem o `PORCH` 3,6 m vpředu, pod ním pec / výheň
  s kovadlinou), uhlíř (zemnice s mechovou střechou) a samostatný milíř ≈ 9,5 m od ní
  (`MILIR_OFFSET` v `tools/blender/crafts.py` = `MILIR_OFFSET_M` v
  `lib/scene/building-showcase-layout.ts`). Tvary bere `crafts.py` z `dwellings.py` (ten má proto
  `if __name__ == "__main__"`), sedí do jam obydlí (hrnčíř, kovář = polozemnice, uhlíř = zemnice).
  Atlas: `tools/blender/craft_atlas.py` (atlas obydlí + pec, kámen, zem milíře, uhlí…; varianta
  `atlas-moss.jpg` s mechem místo slámy). Postup v hlavičce `crafts.py`, ikony `icons.py hrncir,kovar,uhlir`.
  **Fáze stavby** řemesel: `village-construction.ts` má tabulku fází pro každý druh
  (`ConstructionKind` = obydlí + `CraftKind`; dílny na fázích svého obydlí + přístřešek, pec /
  výheň, dílna, uhlíř mech místo došků, milíř zvlášť), díly v `public/models/crafts/construction.glb`
  a `construction-moss.glb` (předpona druhu). Obydlí se tím nezměnila.
  **Náhled všech staveb** bez databáze: http://localhost:3010/dev/buildings (`building-showcase.ts`,
  staveniště `showcase-sites.ts`, posuvník a přehrání stavby; v produkci 404).
- **Grafika (licence):** CC0, nebo z **0 A.D.** pod **CC BY-SA 3.0** (textury terénu, stromy –
  uvést Wildfire Games, upravené soubory pod stejnou licencí). Zdroj a původní název každého
  souboru do `LICENSE.md` / `LICENSES.md` vedle něj. Převod stromů, atlas impostorů a render
  textury korun: `tools/blender/` (headless Blender 5, `blender -b --factory-startup --python …`).

## Ves (hratelný prototyp)

Pravidla v [docs/design/population.md](docs/design/population.md),
[docs/design/fields.md](docs/design/fields.md), [docs/design/cemetery.md](docs/design/cemetery.md)
a [docs/design/orchard.md](docs/design/orchard.md),
rozhraní částí v
[docs/superpowers/plans/2026-10-17-village-slice.md](docs/superpowers/plans/2026-10-17-village-slice.md).

- **Jádro** `packages/game/src/domain/village/` (simulace, umístění `placement.ts`, souhrn
  `summary.ts`), use-casy a port `VillageRepository` v `application/`, tabulka `village`.
  Ves se dopočítá při každém načtení a akci (worker zatím není).
- **API jádra:** `foundVillage` (4 lidé, zásoby, stavba první zemnice, volitelně první pole),
  `advanceVillage(state, toDay)` (dopočítá ves do dne včetně) a akce hráče `startNewDwelling`,
  `foundField`, `foundCemetery` a `foundOrchard`. Stav vsi je JSON-serializovatelný, funkce
  vstupní stav nemění. Nové části stavu jsou volitelné (`VillageState.cemeteries?`,
  `orchards?`, `applesKg?`, `orchardWork?`, `starvationDays?`, `extinctDay?`) – vsi uložené
  dřív se načtou a beze sadů se jejich stav nemění.
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
  `enterGame` založí nové sídelní sídlo s novým seedem; se živou vsí `DYNASTY_ALIVE`, bez vsi
  vrátí sídlo beze změny). Akce ve vymřelé vsi odmítá `updateLivingVillage` (`VILLAGE_EXTINCT`),
  přejmenování taky. Web: `VillageView.extinct` / `gameOver` / `starving` (konec hry zjistí
  `lib/village.ts` jen u vymřelé vsi), server action `restartGame` a `hud/DefeatScreen.tsx`
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
  neexportují.
- **Hráč staví kdy chce** (Martin) – stavbu smí zablokovat jen **cena předem** (`costs.ts`:
  `BUILD_COSTS`, `buildAffordability`): suroviny ze zásob (dnes žádné) a u obydlí **lidé
  k osídlení** (`settlers` = `availableSettlers` v `dwellings.ts`: domácnosti s párem navíc −
  prázdná − rozestavěná nová obydlí); pole a hřbitov lidi nechtějí. Tlačítko je pak zašedlé,
  zkratka nic nespustí, v popisku chybějící část červeně; server odmítne (`NO_SETTLERS`,
  `CANNOT_AFFORD`). `waitingHouseholds` (upozornění „Domácnost je plná“) = kladní lidé
  k osídlení.
- **Determinismus:** simulace jde den po dni v pevném pořadí kroků (`simulate.ts`), náhoda dne
  je ze seedu vsi a indexu dne – výsledek nezávisí na tom, po jakých kouscích se ves dopočítá.
- **Čísla** pravidel jsou jen v `rules.ts` (u každého odkaz na sekci návrhu); změna čísla = i
  text v návrhu. Kalibrace: `measure-village.ts` nasimuluje stovky vsí a vypíše cíle z Kalibrace
  obou dokumentů s OK / MIMO (`200 60` rychlé cíle, `100 1000` vymření do roku 1500).
- **Web:** server actions `app/game/actions.ts` (`getVillageView`, `foundVillage`, `placeDwelling`,
  `placeField`, `placeCemetery`, `placeOrchard`, `renameVillage` → `VillageView` / `null` /
  `{ error }`; `restartGame` → `{ ok: true }` / `{ error }`),
  composition root `lib/village.ts`, `lib/village-view.ts` (DTO, smí i do prohlížeče). Typy pro scénu jsou
  odvozené odtud a z `@bohemia/game` – nedefinovat je znovu ve scéně.
- **Rozhraní jako v 0 A.D., bez popisků a průvodce** (Martin): `components/game/VillageGame.tsx`
  skládá `hud/` – `TopBar` (jméno vsi, klik = přejmenovat; ikony s čísly: lidé, obilí, jablka
  jen když jsou, volná práce, nasycení barvou ikony, datum; zvuk a odhlášení), `Minimap` (vlevo dole, `lib/minimap.ts`,
  klik / tažení přesune pohled), `SelectionPanel` (dole uprostřed, jen při výběru,
  `lib/selection-details.ts`), `BuildGrid` (vpravo dole), `NoticeLines` (mizející řádky nahoře),
  `CursorReason` (důvod, proč umístění nejde; oranžově `check.warning`, které stavbu
  neblokuje – hřbitov blízko obydlí nebo vody, obydlí blízko hřbitova). Popisky = `hud/Tooltip.tsx`, jeden krátký
  název (u staveb i cena). Vzhled panelů: třídy `hud-*` v `app/globals.css`. Ikony
  `public/icons/build/` a `public/icons/resources/`. Panely, nad kterými se krajina neposouvá
  okrajem okna, mají `data-hud-block`.
- **Katalog staveb** `lib/build-items.ts` (název, ikona, zkratka, umístění `footprint` /
  `squares`, kontrola) – nová stavba = záznam tam, cena v `BUILD_COSTS` a server action
  v `SUBMIT_SQUARES` (`VillageGame`); mřížka, zkratky i malování po čtvercích se nemění.
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
  | další                  |                                               | `[` / `]` otáčí, Enter postaví  | Backspace / Ctrl+Z vrátí, Enter    |

  Vždy: WASD / šipky a kurzor u okraje okna posouvají, kolečko i rozevření prstů na trackpadu
  (Ctrl + kolečko, v Safari `gesturechange`) přibližují, Q/E otáčí, R vrátí pohled na ves
  (`setCameraHome`). Zkratky staveb Z zemnice, X polozemnice, C pole, V hřbitov. Rozhraní
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
- **Les a dřevo** ([forest.md](docs/design/forest.md), `domain/village/wood.ts`): klády na hromadě
  (`woodLogs`, staré vsi 0, hnijí 4 % ročně), obydlí, první zemnice i přestavby berou dřevo
  (`DWELLING_TREES` 7 / 18) nejdřív z hromady, zbytek vyhradí při zahájení mezi nejbližšími
  dospělými stromy (`planDwellingWood`, `nearestMatureTrees` – hledá po políčkách) a kácí je jako
  první část práce stavby (`fellAsWorked` → pařezy). Simulace proto povinně dostává vrstvu
  překážek (`advanceVillage(state, day, obstacles)`; `null` = kácení bez polohy jen v testech),
  use-casy krajinu (`updateVillage`, `loadVillage`, `renameVillage`); kalibrace má syntetický
  les. Vyhrazený strom patří své stavbě: mýcení za něj kládu nedá (`reservedTrees`
  v `PlacementVillage`) a stromy zakládaných dílů a čtverců hřbitova obydlí nevyhradí
  (`claimedObstacles`). Mýcení (díly polí, čtverce hřbitova, staveniště) dá kládu za dospělý
  strom (`trees` u dílu / čtverce). Dřevo je surovina předem (`villageStock` s vrstvou překážek:
  klády + stromy, které jde skácet – počet stromů vrstvy v mezipaměti). Palivo: přirážka domácí
  práce podle `forestDistanceM` obydlí. Scéna: hromada klád `lib/scene/log-pile.ts` (místo
  a hranice v `log-pile-layout.ts`, bez volného místa se nekreslí), staveniště ukazuje průběh
  bez kácení (`buildProgress`).
- **Upozornění** (`lib/village-notices.ts`): plná domácnost (fakt), lidé umírají hlady, hlad,
  stojící stavby, plný hřbitov (žádný hotový nemá volný hrob) – nově vzniklé jako krátký
  mizející řádek nahoře, žádný trvalý seznam; vymřelá ves žádná. Kronika je jen v DTO.
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
npx tsx packages/game/scripts/measure-landscapes.ts 500   # měření generátoru krajiny
npx tsx packages/game/scripts/measure-village.ts 200 60   # kalibrace simulace vsi
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
