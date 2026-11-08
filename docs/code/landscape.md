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
  `LayerVersions.premium` (`PREMIUM_LAYER_VERSION` = 2, chybí = 1 – průchod 2 viz Prémie na
  kostře níž), krajina nese
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
  místo potoka i řek, body osy potoka) – podle ní rozmisťovače překážek a terén pěšin, krajina bez
  řeky má přesně `streamCenterline` (víc řek kostry – Osa vod víc řek níž). Stezka přes brod (`route`) a přístaviště se počítají v `sites`
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
  vrstvy jdou v pořadí zdrojů (`GROUP_ORDER` – chybějící skupina `ObstacleGroups` je chyba typu,
  `Exhaustive`), kolem prémiových překážek uvolní místo `mapGroups`. Rudiště a hliniště leží celé
  (obrys) do `maxDistanceM` od vsi. Vnější svah průsmyku dobíhá k terénu na okraji mapy už
  v generátoru (`sculptPass` – vnější svah na `crestCells`, vnitřní na `flankCells`). Úrodnost typů
  reliéfu (`PremiumPass.fertilityAverageMean`) počítá s průměrnou výškou souše průměrné krajiny
  pokusu (`computeFertility(…, meanHeight)`, `meanLandHeight`) – hora nezvedne úrodnost zbytku
  mapy; uložené sídlo přirozené pevnosti proto generuje terén dvakrát (vlastní terén typu
  a průměrný pro průměr). **Přidělení typu** (premium-landscapes.md – Kdo dostane jakou krajinu):
  `choosePremiumType(seed, counts)` (`premium/assign.ts`) – nejméně zastoupený typ, při shodě
  podle seedu krajiny. `enterGame` dá sídelnímu sídlu (odříznutému i pozvanému)
  `lastPremiumType(hráč) ?? choosePremiumType(seed, premiumTypeCounts())`, verze vrstev
  s `premium: 1`; typ, který neprojde pásmem do `MAX_ATTEMPTS`, zkusí další okna seedů (+16, +32,
  `PREMIUM_SEED_WINDOWS`). Začít znovu jde přes `enterGame` – stejný typ. Vsi synů (`targetSettlement`
  na mapě světa i v místní mřížce), NPC rody a sídla z doby před prémiemi mají `premiumType` null
  (průměrná krajina); umístění odříznutého shluku typ ani krajinu nemění. Sloupce
  `settlement.premium_type` a `premium_owner_id` (hráč, kterému typ patří – převod sídla
  odúmrtí nebo postoupením ho nemění; z něj `lastPremiumType` i počty `premiumTypeCounts` po
  hráčích), migrace `0039_premium_type`. Krajina sídla jde vždy přes `settlementLandscape`
  (`LandscapeSource.landscapeOf(seed, verze, typ)`, klíč mezipaměti serveru s typem).
  Posvátná hora má holý vrchol (průchod vegetace – les do `baldCells` od středu ustoupí louce).
  Krajina bez typu (NPC, Vlkov, dnešní hráči) prémiovým průchodem neprojde – zlaté otisky všech
  verzí i vrstvy překážek beze změny. **Vrstvu překážek krajiny s typem** mění i průchod typu
  (`premium/`), `patches.ts` a rozmisťovače `obstacles/bee-trees.ts`, `spring-rocks.ts`
  a `premium-rocks.ts` – po ostrém spuštění nová `PREMIUM_LAYER_VERSION`. Pochod války
  (`march-grid.ts`) čte osu všech vod (`watersCenterline`), loviště ryb vsi (`wildlife-land.ts`)
  i body řek (`riverCenterlines`). **Účinky typů „hned“** (premium-landscapes.md – Typy krajin,
  sloupec „Hned“; čísla `PREMIUM_EFFECTS` v `rules-premium.ts`) jdou přes existující mechaniky
  vsi – `village/premium-effects.ts` a `village/premium-route.ts`, krajina bez typu ves nemění
  (zlaté otisky vsí): bohatá ruda a dobrá hlína (`premiumDugSpot`, `OreSite.rich` – rudiště
  a hliniště na prvku typu, polovina suroviny na kg výrobku – `dugMaterialFactor`, ložisko se
  nevyčerpá; village-crafts.md), sad na jižním svahu (`markSunnyOrchards` – krok dne,
  `OrchardSquare.sunny`, úroda × 1,25), posvátná hora a pramen (`premiumSacredHappiness` – +10 jako
  háj mezi háji, do stropů posvátných míst; `sacredHappiness`, `happinessFactors`,
  `updateHappiness`, `summarizeVillage(…, landscape)`, `sacredLaborGainPerYear`), pramen
  a slanisko jako voda pro pole, sad a hřbitov (`premiumSpringShapes` v `squareFlags`), stezka
  kostry brodu a průsmyku (`withPremiumRoute` ve `foundedState` – osa `route` jako upravené pevné
  cesty s průsekem lesem bez klád a hotová zemská stezka v obou směrech, kam vede; trade.md).
  Úrodná krajina, doubravy a nivní louky působí samy přes krajinu.
- **Osa vod víc řek** (Úloha 7 plánu kostry; world-skeleton.md – Kde všude kostra působí): mapa
  z kostry má víc řek (`Landscape.rivers` – soutok), všechny řeky mapy dá `riversOf`.
  `riverCenterlines(l)` (`stream-geometry.ts`) – osa každé řeky zvlášť v pořadí `riversOf`
  (řeky kostry, pak řeka prémie), bez tůní a s proudem jako řeka prémie; řeka prémie se prodlouží
  k okraji na obou koncích jako dřív, řeka kostry jen na koncích u okraje (`edgeEnds` – pramen
  uvnitř mapy a ústí přítoku do osy hlavního toku ne, přítok by jinak vyčníval za protější břeh).
  `riverCenterline(l)` – všechny řeky dohromady (`nearest`/`nearestPair` přes všechny, při shodě
  dřívější; `points` = osa první řeky; jediná řeka = přesně její osa, krajina bez řeky null);
  `watersCenterline(l)` a `nearestWaterPair(potok, řeky, …)` tak počítají s potokem i všemi řekami
  (v soutoku dá dvojice místo z přítoku i hlavního toku). Přes osu vod jdou vrstva překážek, terén
  pěšin, pochod (`march-grid.ts` – i mapa s řekou bez potoka) a loviště ryb (`wildlife-land.ts`
  – bod nejbližší řeky, proud podle jejích bodů). **Přenos:** `transferPrecision` dá osy řek
  kostry ve Float32 (i s výškami stěn) jako osu řeky prémie; `LandscapeTransfer.rivers`
  (`RiverTransfer` – `axis` a `banks` po tocích, hlavní tok první) a `skeleton` (výřez beze
  změny – stezku kostry si prohlížeč spočítá sám); suchá mapa a prémie bez nich jako dřív. Testy
  `stream-geometry.test.ts` (soutok, pramen), `landscape-transfer.test.ts` (soutok – vrstva
  překážek bit po bitu), `march.test.ts` (řeky kostry jen přes brod), `wildlife-land.test.ts`.
- **Kostra světa na mapě** ([world-skeleton.md](docs/design/world-skeleton.md) – Mapa z kostry;
  `landscape/skeleton/`, deterministická vrstva v ESLint): výřez kostry (`SkeletonSlice`, body
  řek a stezek na okraji) je vstup generátoru mapy. Čísla mapy v `SKELETON_MAP`
  (`rules-map.ts` – soutok ≥ 20 políček od okraje, ústí potoka ≥ 20 od bodu řeky, pramen 40
  políček od výtoku, rovný úsek 6 políček kolmo od bodu okraje), tvar řeky z `RIVER`.
  `portTile(side, at, size)` (`ports-map.ts`) dá políčko bodu – sever = poslední řádek (+z),
  východ = poslední sloupec, `at` = x (N, S) nebo y (E, W). **Koryta** (Úloha 4 plánu kostry):
  `planRiverCourses(heights, size, slice, random)` (`river-course.ts`) – trasy `cheapestPath`
  s cenou jako `routeSideRiver` (nízká místa, přirážka u okraje): hlavní tok od nejširšího vtoku
  (u pramene od bodu uvnitř mapy) k výtoku, přítoky k políčku hlavního toku ≥ 20 od okraje
  (`joins`; hlavní tok u rohu mapy, který se od okraje na 20 políček nevzdálí – W 24 → S 24 –,
  přijme přítok v nejhlubším místě), přes rovné úseky jiných bodů trasa nevede; null = trasa
  nevede.
  `carveRiverCourses(terrain, plans, seed, { floodplainCells })` (`rivers.ts`) – na místě:
  `shapeChannel` s profilem šířky (lineárně vtok → výtok ± 10 %, v bodech okraje přesně),
  meandry jako řeka prémie (u dotyku sebe sama bez meandrů), 1–2 brody (ne do 8 políček od
  soutoku), `carveRiver` od políčka vtoku či pramene (`source`) bez ohledu na ves
  (`ignoreVillage` – ves se vybírá až po řekách); přítok ústí do osy hlavního toku a jeho dno
  nekončí pod dnem soutoku (`bedFloor`). Osy jdou do `Terrain.rivers` / `Landscape.rivers`
  (hlavní tok první), všechny řeky mapy dá `riversOf` (i řeku prémie `river`). Testy
  `skeleton/__tests__/river-course.test.ts` (rovně, ohyb, soutok, pramen na umělém svahu).
  **Terén mapy s řekou** (Úloha 5): `generateSkeletonTerrain(seed, version, slice, options?)`
  (`skeleton/terrain.ts`; `options.floodplainCells` pro prémie na kostře) – výřez bez řeky dá
  `generateTerrain` beze změny; s řekou „řeka první“: `terrainStart` (šum, převýšení, sesypání –
  stejné losy jako suchá mapa) → náklon k výtoku (`SKELETON_MAP.tiltM` 8 m: podíl vzdálenosti
  od výtoku k součtu vzdáleností od výtoku a nejbližšího vtoku; u pramene roste od výtoku dál,
  nejvýš 2 × `tiltM`, ať potok k prameni teče z kopce – řeka tak má spád i se vtokem v nejnižším
  místě) → `planRiverCourses` + `carveRiverCourses` → potok mapy (`routeStream(…, goal)`: start
  na okraji ≥ 20 políček od bodů i vody řeky, zkouší se `streamStartTries` startů nejdál od řeky
  s losem; cíl souš hned u vody řeky, u pramene okolí počátku řeky; voda řeky neprůchozí, pás
  2 × `RIVER.streamGapCells` kolem ní dražší, po okraji mapy nevede; start musí být výš než ústí)
  → `chooseVillageSite(…, allowed)` ≥ `RIVER.villageMinCells` + 0,75 od os řek → ostrožna potoka
  (terén 2, smyčka ne k řece) → rovina kolem vsi bez zásahu do údolí řeky
  (`villageFlattenRiverCells` 3–11 políček od vody) → `carveStream(…, bedFloor)` s hladinou ústí
  rovnou hladině řeky → skály u potoka (voda řeky se netesá) → výšky od nejnižšího políčka (i
  hladiny řek). Když trasa řeky či potoka nevede, vrátí terén suché mapy bez `rivers` – pokus
  neprojde (`skeleton-rivers`). **Generátor:** čtvrtý parametr `skeleton?: SkeletonSlice | null`
  u `generateAcceptedLandscape`, `generateLandscape`, `generateLandscapeAttempt`; prázdný výřez =
  null; verze `LayerVersions.skeleton?: 1` (`SKELETON_LAYER_VERSION`) jen s neprázdným výřezem –
  výřez bez verze, verze bez výřezu i typ prémie, který výřezu neodpovídá (`assertPremiumSlot` –
  Prémie na kostře níž), = `RangeError`. Krajina
  nese `skeleton` (výřez) a `rivers`; suchá mapa bit po bitu jako dřív. **Pásmo** (`band.ts`):
  mapa s řekou kostry projde celým pásmem; podíl lesa a úrodná políčka se měří bez
  `riverCorridorMask` (voda řek a souš do `RIVER_CORRIDOR_CELLS` = 8 políček od ní – úrodná
  počtem mimo masku, bez přepočtu), okolí vsi beze změny; „voda od okraje k okraji“ nahradí
  „potok souvisí s výtokem řeky“ a `skeleton-rivers` hlídá počet řek (hlavní tok + přítok za
  každý další vtok). Testy `skeleton/__tests__/terrain.test.ts`, `golden.test.ts` (zlaté otisky
  4 výřezů × 2 seedy) a pásmo `skeleton-band.ts` (300 seedů, ≥ 95 % do `MAX_ATTEMPTS`;
  `skeleton-band-river.test.ts`, `skeleton-band-junction.test.ts`). Měření:
  `measure-landscapes.ts 30 --skeleton straight|corner|junction|source|trail|ford`.
  **Stezka kostry na mapě** (Úloha 6; `skeleton/route.ts`, `features.ts`, `check.ts`, jen
  det-math): `skeletonRoute(l)` – od každého bodu stezky (`portTile`) nejlevnější cesta
  (`routeLeg`, cena `trailCellCost`) k jednomu bodu obejití vsi (`villageBypass`, 13 políček ≈ 195 m
  od vsi, zkouší se bokem ke směru od každého bodu stezky); ves ≥ 11 políček, voda řeky
  neprůchozí a souš do `SKELETON_ROUTE.bankCells` (1,5) od ní taky, kromě **brodu** (políčka do
  `šířka + 1,5` od mělkých bodů osy – `shallow`) a prvních 4 políček od okraje; potok mapy se
  přebrodí s příplatkem 6 ×. Úseky se vyhladí (2 průchody), první bod se přisune na okraj mapy,
  každý musí vést ≥ 150 m od vsi. `SkeletonRoute { legs, ends, fords }` – `fords` = mělčiny,
  kterými trasa opravdu vede. Dva body = stezka kolem vsi, víc = křižovatka (`crossroads`, větve
  se potkají v bodě obejití), jeden = konec stezky (`trailEnd`). `skeletonFeaturesOf(l)`
  (`WeakMap`, počítá z `transferPrecision`) vrací `SkeletonFeatures`, null bez výřezu.
  `checkSkeleton(l)` → `'river' | 'route' | 'village' | null` (`check.ts`): každý bod řeky je
  u začátku či konce některé osy, trasa existuje a končí do 15 m od políček bodů stezky na
  okraji, řeka ani stezka nevedou do 120 m od vsi. `checkBand` ji volá až u pokusu, který jinak
  prošel (selhání `skeleton-<důvod>`). Testy `skeleton/__tests__/route.test.ts`,
  `skeleton-band-trail.test.ts` (stezka, křižovatka, konec, brod; 300 seedů).
- **Prémie na kostře** (`premium: 2`, Úloha 10 plánu kostry; world-skeleton.md – Mapa z kostry):
  průchod 2 bere řeku a stezku z výřezu, vlastní nepřidává. `SKELETON_PREMIUM_SLOTS`
  (`premium/types.ts`) – splavná řeka a soutok na místě `river`, vyvýšenina nad brodem na `ford`,
  horský průsmyk na `trail` (`seatSlot` výřezu z `world/skeleton/sites.ts`); ostatní typy jen na
  suché mapě s průchodem stejným jako 1. `assertPremiumSlot(type, version, slice)` (volá ho
  generátor hned na začátku): průchod 1 jen bez výřezu, průchod 2 jen typ na svém místě, jinak
  `RangeError`. `premiumPassOf(type, version)` – typy kostry ve verzi 2 z `SKELETON_PREMIUM_PASSES`
  (zatím `SKELETON_WATER_PASSES`; brod a průsmyk přijdou s Úlohou 11 – do té doby průchod nemají
  a pásmem neprojdou), `hasPremiumPass(type, version = 1)`. `premiumFeaturesOf` verzi bere z krajiny:
  s výřezem 2, bez něj 1 (verze 1 výřez nemá, ostatní typy mají v obou verzích stejný průchod).
  `PremiumPassContext.skeleton` (výřez nebo null); `PremiumPass.skeletonTerrainOptions` – terén
  mapy z kostry se generuje znovu ze seedu terénu pokusu a výřezu s nimi (`passTerrain` →
  `generateSkeletonTerrain(…, options)`). **Splavná řeka:** `{ floodplainCells:
NAVIGABLE_FLOODPLAIN_CELLS }` (rovná niva 4 políčka), prvky řeka a brody hlavního toku
  (`riverSites(l, l.rivers[0])`) a přístaviště (`portSite(l, river)` – břeh na straně vsi). **Soutok:**
  potok mapy už do řeky ústí, `addSkeletonConfluence` (`premium/river.ts`) přidá ostrožnu `SPUR`
  s výškou `CONFLUENCE.heightM` nad hladinou řeky v soutoku – na ose mezi směrem proti proudu
  potoka a proti proudu řeky od ústí potoka (když se tam nevejde, po proudu řeky), první místo
  ≥ 3,4 políčka od vody, ≥ 28 políček od vsi (`spurClearOfVillage`), mimo okraj a jiné ostrožny;
  řeka a potok se nemění, jen dostanou stěny u ostrožny. Prvky řeka, brody, `confluence` (konec
  potoka) a ostrožna. Krajina nese `skeleton`, `rivers` a `premium`, `river` nemá. `enterGame`
  ukládá do Úlohy 13 dál průchod 1 (sídlo zatím bez výřezu). Testy
  `premium/__tests__/skeleton-river-types.test.ts` (niva, přístaviště, ostrožna, zlatý otisk
  průchodu 1 – `PREMIUM1_GOLDEN` všech typů, `RangeError`) a pásmo `skeleton-type-band.ts`
  (`skeleton-river-band.test.ts` – 2 typy × výřez rovně a ohyb, 300 seedů: projde 300/300,
  napoprvé splavná 62 / 80 %, soutok 47 / 65 %, mapa bez prémie 64 / 81 %). Měření:
  `measure-landscapes.ts 200 navigable-river --skeleton straight`.
