# Krajina – generování a vrstvy

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: [docs/design/landscape.md](../design/landscape.md) v `docs/design/`.

- **Generování** (`packages/game/src/domain/landscape/`): `generateLandscape(seed, versions)` –
  vrstvy terén a voda → vegetace → úrodnost, každá s vlastním seedem (`deriveSeed`) a verzí.
  Pásmo srovnatelnosti hlídá `checkBand(landscape, versions)` (pásmo podle verzí – `bandFor`,
  `BAND_V1` / `BAND_V2` v `band.ts`) a testy na 300 seedech. Po změně generátoru pusť
  `measure-landscapes` a zkontroluj podíl krajin na první pokus, čas a louky do 600 m od vsi.

- **Verze vrstev:** nová sídla `CURRENT_LAYER_VERSIONS` – terén 2 a překážky 2 (skály u potoka, 20. 10. 2026), vegetace a úrodnost 2 (víc kvalitní louky kolem vsi, 18. 10. 2026); nová sídla do 20. 10. `PREVIOUS_LAYER_VERSIONS` (`{ 1, 2, 2, 1 }`), sídla založená do 18. 10.
  `INITIAL_LAYER_VERSIONS` (vše 1, Vlkov). Staré verze se generují dál beze změny (`vegetationV1`,
  `byWaterDistance`, terén bez `sculptStreamRocks`) – zlatý otisk krajiny (`generate.test.ts`)
  i vrstvy překážek (`obstacles.test.ts`) hlídá všechny tři. Na stejném seedu je porovná
  `/dev/landscape?seed=…&layers=previous` / `layers=initial`.

- **Skály u potoka** (landscape.md – Skály u potoka, terén 2 – `stream-rocks.ts`, jen server):
  v ostrém ohybu (poloměr osy pod 1,5 šířky koryta, stočení přes 50° – `sharpBends`) skalní ostroh
  4–9 m, na vnější straně oblouků nárazový břeh podle výšky okolí (v rovině 1,5 m hlinitý, nejvýš
  8 m skála), na ≈ 1 z 7–8 map zaříznutý meandr (smyčka Ω vložená do osy – `planPromontory`,
  `buildStream` se `StreamLoop`) s ostrožnou 0,7–1,4 ha, 8–12 m nad potokem. Terén se jen zvedá –
  osa, hladina, brody, tůně a voda zůstanou (bez ostrožny bit po bitu jako terén 1), do 450 m od
  místa pro vesnici nic. Data: `StreamPoint.bankLeft` / `bankRight` (výška stěny, přenos ve
  Float32 – `landscape-transfer.ts`, `StreamSample.bank`) a `Landscape.promontories` /
  `promontoriesOf` (druh, obrys plochy, šíje, výška, plocha – obecná data pro budoucí hradiště
  a zvláštní místa). Scéna: čelo stěny se suťovým svahem od okraje vody (`render-surface.ts` –
  `cliffBank`, `cliffFaceM`), skála a suť v `ground-layers.ts`, balvany v korytě
  (`decor-placement.ts`); vrstva překážek 2 výchozy a suť na stěnách (`cliff-rocks.ts`, zdroj
  `cliffRock`). Náhled `/dev/landscape` – seedy s ostrožnou a tlačítko **Ostrožna** (obrys).

- **Seed krajiny z políčka světa:** nová mapa (`enterGame`, `targetSettlement`) bere seed z
  `cellLandscapeSeed(worldSeed, cell)` (`domain/world/cell-seed.ts`) – odvozený seed
  zúžený do rozsahu sloupce `landscape_seed` (int32 s rezervou na pokusy); `generateAcceptedLandscape`
  dál hledá přijatý pokus a ukládá se jeho seed. Seed světa je `WORLD_SEED` (env, `worldSeed()` v
  `packages/server/src/world.ts`, výchozí `DEFAULT_WORLD_SEED` pro vývoj) – po ostrém spuštění se
  nesmí změnit; `SeedSource` zůstává jen pro seedy vsí a jmen.
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

- **Prémiové krajiny** ([premium-landscapes.md](docs/design/premium-landscapes.md)): typ prémie
  (`PremiumType`, katalog `premium/catalog.ts`) je třetí vstup generátoru –
  `generateLandscapeAttempt(seed, versions, premium?)` a
  `generateAcceptedLandscape(seed, versions?, premium?)`; bez typu bit po bitu jako dřív (zlaté
  otisky i s třetím parametrem `undefined`). Průchod typu (`PremiumPass` v `premium/generate.ts` – úpravy terénu, vegetace
  a úrodnosti s vlastním seedem `deriveSeed(seed, 'premium')` a hledání prvků `sites`) se
  zapisuje do `PREMIUM_PASSES`; typ bez průchodu nemá prvky a pásmem neprojde. Verze průchodu
  `LayerVersions.premium` (`PREMIUM_LAYER_VERSION` = 1, chybí = 1), krajina nese
  `Landscape.premium`. Prvky `premiumFeaturesOf(landscape)` – čistá funkce krajiny s přesností
  prohlížeče, mezipaměť podle objektu jako `obstaclesOf`; složka `premium/` je v deterministické
  vrstvě (ESLint). Kontrola typu `checkPremium` (prvek existuje, obrys ani osa nezasahuje do
  120 m od místa vsi – `PREMIUM_VILLAGE_CLEARANCE_M`, stezka smí k okraji) je součástí
  `checkBand` – počítá se až u pokusu, který jinak prošel, selhání `premium-<důvod>`. Přenos do
  prohlížeče nese typ (`LandscapeTransfer.premium`). Test pásma po typech (300 seedů, ≥ 95 %,
  `premium/__tests__/type-band.ts` – skupina typů má vlastní soubor, ostatní
  `generate.test.ts`) se typu zapne sám, až má průchod. Druhy prvků půdy a lesa
  (`PREMIUM_LAND_KINDS` – louka, les, svah, honitba, brtě) okruh vsi nemají. Pásmo s typem:
  `generateAcceptedLandscape` měří celé pásmo na průměrné krajině pokusu (vrstvy před průchodem),
  `checkBand` na prémiové krajině jen dolní meze a kontrolu typu; průchod dostane vlastní kopie
  vrstev. **Typy půdy a lesa** (`premium/soil-forest.ts`, landscape.md – Typy půdy a lesa):
  úrodnost a vegetace v průchodu; doubravy (`premiumForestLook` – jedle a bříza na buk, duby
  beze změny) a brtě (`beeTreeSpots`, zdroj
  překážek `beeTree`, kolem 6,5 m volno) v `premium/trees.ts` čtou rozmisťovače překážek podle
  `landscape.premium` – krajina bez typu má vrstvu bit po bitu stejnou. Obrysy prvků
  `premium/geometry.ts` (`cellsOutline`, `circleOutline`); úklid drobných skvrn povrchu je
  v `patches.ts` (sdílí ho vegetace). **Typy vody** (`premium/water.ts`, landscape.md – Typy
  vody): řeka (`premium/river.ts` – `addSideRiver` pro splavnou řeku a vyvýšeninu nad brodem,
  `addConfluence` pro soutok) je průchod terénu – nový tok vedle potoka, šířka aspoň 1,5× medián
  potoka téže mapy v mezích 25–45 m (`RIVER.width`, `riverMinWidthM`), osa `Landscape.river`
  ve tvaru osy potoka (`Terrain.river`, přenos `LandscapeTransfer.river` / `riverBanks`,
  `transferPrecision`), ostrožny nad brodem a soutokem jsou `Promontory` druhů `ford-hill`
  a `confluence`. Osa řeky `riverCenterline(l)`, osa všech vod `watersCenterline(l)` (nejbližší
  místo potoka i řeky, body osy potoka) – podle ní rozmisťovače překážek a terén pěšin, krajina bez
  řeky má přesně `streamCenterline`. Stezka přes brod (`route`) a přístaviště se počítají v `sites`
  z hotové krajiny (`fordRoute`, `cheapestPath`). Zlatonosný potok a solný pramen jen označí místa
  v průměrné krajině; posvátný pramen (`sacredSpringSpot`) má ve vrstvě překážek skalku (zdroj
  `springRock`, `obstacles/spring-rocks.ts`). Typ, který mění terén, nepočítá průměrné vrstvy
  zbytečně: uložené sídlo každou vrstvu jednou, přijetí terén jednou (průchodu kopie
  `cloneTerrain`) – hlídá `premium/__tests__/attempt-layers.test.ts`. Osa řeky nemá tůně a teče
  aspoň rychlostí 0,5 (`RIVER_COURSE` – řeka 25–45 m by s prahy tůní potoka vyšla jako stojatá
  voda), mezipaměť podle objektu; `nearestWaterPair` = dotaz osy vod i s tím, jestli je místo na
  řece (scéna hloubí řece hlubší koryto). Stezky od okraje k okraji (brod, průsmyk) sdílí `premium/route.ts`
  (`routeLeg`, `villageBypass`, `trailCellCost`, `smoothLine`, `lineToEdges`). **Typy reliéfu
  a nalezišť** (landscape.md – Typy reliéfu a nalezišť): kde prvek leží, je čistá funkce vody
  a místa vsi (`PlanInput` z terénu i z hotové krajiny – `planInputOfTerrain` / `planInputOf`;
  `passPlan`, `mountainPlan`, `quarryPlan`, `veinPlan`, obecně `pickSite`), terén mění jen server
  (`reliefKeep` – rovina vsi a okolí vody beze změny). `premium/relief.ts`: horský průsmyk
  (pohoří podél okraje mapy, sedlo a dva hřbety ≥ 60 m nad ním, stezka `route` přes sedlo, prvek
  `pass` s osou hřebene), posvátná hora (`summit` – plošina ≥ 0,5 ha ≥ 50 m nad úpatím do 1 km),
  přirozená pevnost (ostrožna nad meandrem ≥ 1 ha – `PremiumPass.terrainOptions` →
  `generateTerrain(seed, version, options)` a `planPromontory(…, options)` s jinými mezemi
  `PromontoryOptions`; terén typu se generuje znovu ze seedu terénu, přijetí tedy terén dvakrát).
  `premium/deposits.ts`: lom ve skalní stěně (`quarry`), skalnatý hřbet se žílou (`deposit`),
  rudiště (`iron-ore`) a hliniště (`clay`) u potoka do 500 m od vsi (jen místa). Skály lomu a žíly
  ve vrstvě překážek (`obstacles/premium-rocks.ts`, zdroje `quarryRock` a `oreRock`); skupiny
  vrstvy jdou v pořadí zdrojů (`GROUP_ORDER`), kolem prémiových překážek uvolní místo `mapGroups`.
  Posvátná hora má holý vrchol (průchod vegetace – les do `baldCells` od středu ustoupí louce).
  Krajina bez typu (NPC, Vlkov, dnešní hráči) prémiovým průchodem neprojde – zlaté otisky všech
  verzí i vrstvy překážek beze změny. **Vrstvu překážek krajiny s typem** mění i průchod typu
  (`premium/`), `patches.ts` a rozmisťovače `obstacles/bee-trees.ts`, `spring-rocks.ts`
  a `premium-rocks.ts` – po ostrém spuštění nová `PREMIUM_LAYER_VERSION`. Pravidla vsi a války
  (`wildlife-land.ts`, `march-grid.ts`) zatím čtou jen osu potoka (`streamCenterline`), řeku ne –
  účinky typů jsou až úloha 7 plánu.
