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
