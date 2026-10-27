# Ves – počasí kraje a přírodní pohromy

Mapa kódu – podrobnosti k mechanikám. Pravidla a rozhodnutí: [disasters.md](../design/disasters.md)
v `docs/design/`, postup po úlohách v [plánu](../superpowers/plans/2026-10-27-disasters.md).

## Počasí kraje (P1)

- **Seed počasí mapy** – sloupec `settlement.weather_seed` (`packages/db/src/schema/settlement.ts`,
  migrace `0007_weather_seed.sql`): náhodný z databáze (`floor(random() * 2147483647)`, volatilní
  výchozí – migrace dala každému stávajícímu sídlu vlastní). **Není to seed krajiny** – ten zná
  prohlížeč (krajinu a překážky počítá sám) a kód je veřejný. Port `VillageRepository.weatherSeedOf(settlementId)`
  (`application/villages.ts`, adaptér `village-repository.ts`; neznámé sídlo a úložiště bez počasí
  – `InMemoryVillages` bez záznamu ve `weatherSeeds`, `SingleVillageRepository` měřicích skriptů –
  vrací null).
- **Kopie ve vsi** – `VillageState.weatherSeed` (volitelné): `withWeatherSeed(state, seed)`
  (`weather.ts`) v `updateVillage` hned po načtení (starší vsi – jednou, idempotentně; seed se řídí
  mapou, null nemění nic) a v `foundedVillageState(seed, input, lord, weatherSeed)` před dopočtem
  dne založení (`foundVillageForSettlement`, `foundAnotherVillage`, osadníci v `leave-village.ts`).
  **Ves bez `weatherSeed` má všechny roky normální** (unit testy, kalibrace, zlaté otisky).
- **Klient seed nikdy nedostane** – `buildVillageView` ho neposílá (test v `village-view.test.ts`);
  co už je vidět, dává `revealedWeather`.
- **`yearWeather(weatherSeed, year)`** (`weather.ts`) – čistá funkce, memo v modulu (nejvýš
  20 000 položek, jen výsledky – žádný stav vsi), vrací zmrazený `YearWeather { year, summer,
winter, flood }`. Los z vlastních proudů `deriveSeed(weatherSeed, 'summer:' | 'winter:' |
'flood:' + year)` – pevné pořadí položek (`SUMMER_ORDER`, `WINTER_ORDER`).
  **Shlukování:** po zlém létě (`isBadSummer` – suché, kruté sucho, deštivé, mokré žně) jsou
  šance zlých lét i zim ×1,25, v ostatních letech × `CALM` = 1 ÷ (1 + 0,25 × 0,29) – dlouhodobé
  četnosti tak přesně sedí s tabulkou návrhu (návrh Clauda). Historie se počítá od roku −8
  (dlouhodobé četnosti) dopředu – O(1). Řetězy z roku −8 a −9 se rozejdou jen, když 8 let po sobě
  padne los do pásma, které závisí na loňsku (≈ 7 %), tj. ≈ 4 · 10⁻¹⁰ – zanedbatelné.
- **Povodeň kraje** (Martin 27. 10. 2026: „Ano a ano“ – výška společná pro celý kraj): `flood`
  v `YearWeather` – stupeň (`FLOOD_WATER.levels`), o stupeň výš po dlouhé zimě nebo v deštivém
  létě, jarní (1.–20. 3.) po dlouhé zimě, letní (15. 6. – 15. 8.) v deštivém létě, jinak půl na
  půl; den v okně. Škody po vsi (políčka pod výškou vody, ochrana nové vsi) přidá P6.
- **`weatherOf(state, year)`** – počasí roku vsi: z `weatherSeed`, nebo normální rok; vynucené
  počasí `disasters.override.weather[year]` (jen testy a dev) přebije uvedené části (shlukování
  dalších let jde dál podle losu). `isCruelYear` – kruté sucho, mokré žně, holomráz se zlým létem.
- **`revealedWeather(state, day)`** – jen co už je vidět (`WEATHER.summerRevealed`,
  `winterRevealed`, `wetHarvestRevealed`): sucho od 1. 5., dobré / deštivé / normální léto od 1. 6.
  (mokré žně do 15. 7. jako deštivé), holomráz od 1. 2., dlouhá zima od 1. 3., normální zima od
  1. 4.; voda v den povodně.
- **Krok dne** – `weatherDay(state, day)` v `simulateDay` hned za `wildlifeYearDay`: v den
  odhalení zlé zimy nebo neobvyklého léta událost kroniky `weather` (`{ summer? , winter? }`,
  text `weatherText` v `apps/web/lib/village-view-chronicle.ts`). Stav nemění – vcelku = po
  kouscích (test přes 1. 5. a 1. 6.).
- **Čísla** – `rules-disasters.ts`: `WEATHER` (četnosti, násobky úrody, sena a pastvy pro P3, dny
  odhalení, shlukování, `historyYears`, `expectedYield`), `FLOOD_WATER` (stupně vody, okna),
  `LOCAL_DISASTERS` (ochrana 5 let). Typy v `types-disasters.ts`.
- **Ochrana nové vsi** – `inDisasterProtection(foundedDay, day)` (`disasters.ts`): prvních
  5 × 365,25 dne od založení žádná místní pohroma; počasí platí naplno. Použijí ji P5–P9.
- **Testy** – `weather.test.ts` (10⁵ let: četnosti ±1 %, shlukování ×1,25 ±0,05, vsi téže mapy,
  odhalení, povodeň, dopočet po kouscích, ochrana), `update-village-weather.test.ts` (seed při
  načtení a založení), `village-repository.db.test.ts` (`weatherSeedOf`).

## Ochrana dílu (P2)

- **Kdy** – `partProtectionDay(state, day, landscape, obstacles)` (`part-protection.ts`) v `simulateDay`
  hned za `weatherDay`: jen **1. 4.** a jen ves se `weatherSeed`, zapíše `disasters.protection`
  (`{ year, parts: { [partId]: PartProtection } }`). Bez krajiny má každý díl `green` 0,25. Jednou
  za rok, ne denně; výsledek je čistá funkce stavu v ten den, takže vcelku = po kouscích.
- **Složky dílu** (`PartProtection`, typy v `types-disasters.ts`): `green` 0–1 (zeleň + solitéry),
  příznaky `nearWater` (voda do 60 m nebo niva), `lowland` (≤ 1,5 m nad potokem), `raised`
  (> 6 m nad potokem a nad průměrem políček do 45 m), `slope` (soused o ≥ 1,5 m jinak vysoko).
- **Zeleň** – `computePartProtections`: vzdálenost středu dílu k nejbližší zeleni _d_, zeleň =
  (100 − _d_) ÷ 85 oříznuto na 0–1 (`fullGreenM` 15, `noGreenM` 100). Les: chamfer distanční
  transformace `greenEdgeScan` (`wildlife-land.ts`; sdílí ji `forestEdgeDistances` zvěře) se
  počítá jen do `forestEdgeM` 15 m od okraje, dál se les ignoruje. Sad: středy jeho políček
  v `PointGrid` jako remíz. Remízy a solitéry: stojící stromy a keře z vrstvy překážek
  (`obstaclesNear` + `obstacleStatus(obstacleChangesAt(state, day))`, bez pařezů, souší
  a padlých, s jabloněmi a stromy u cest, bez stromů v masce lesa). Remíz = strom či keř s ≥ 2
  dalšími do 15 m; solitér = dospělý strom bez stromu do 15 m a každá jabloň u cesty, každý
  do 50 m +0,25; zeleň dílu nejvýš 1. Hledání v mřížce po 30 m (`PointGrid`).
- **Vlhkost** – `streamHeights(landscape)` = `heightAboveStream` z masky vodních políček, paměť
  `WeakMap<Landscape, …>`; mapa bez vody nemá nivu ani vyvýšené díly (nekonečno).
- **Složení pro P3 a P5** – `protectionAgainst(part, kind)` (čistá funkce) a
  `partProtectionOf(state, partId, kind)`: `dry` = zeleň + u vody 0,2 − vyvýšené 0,2 (0–1),
  `frost` = zeleň − vyvýšené 0,2 (0–1), `wet` = svah +0,2 − niva 0,2 (−0,2 až +0,2, zeleň ne),
  `hail` = zeleň × 0,4. Ztráta se pak násobí `1 − PROTECTION.lossShare × ochrana`. Díl bez údaje
  (založený po 1. 4., ves bez krajiny) má zeleň 0,25.
- **Čísla** – `PROTECTION` v `rules-disasters.ts`.
- **Výkon** – 150 dílů ≈ 10 ms v klidu (test hlídá 100 ms kvůli zátěži); Vlkov (≈ 3 800 dílů) ≈ 60 ms jednou ročně.
- **Testy** – `part-protection.test.ts` (vzdálenost k lesu a sadu, solitéry, remíz, pokácený remíz,
  voda, vyvýšené, niva a svah, kroupy, jen 1. 4., vcelku = po kouscích, výkon).

## Sucho, deštivé léto, krutá zima (P3)

Všechno jen ve vsi s počasím kraje (`hasWeather` – `weatherSeed` nebo vynucené počasí); **ves bez
počasí počítá jako dřív** (zlaté otisky beze změny). Funkce v `weather-effects.ts`, čísla
`WEATHER.summerEffects` a `WEATHER_EFFECTS` v `rules-disasters.ts`.

- **Úroda dílu** – `partWeatherFactor(weather, crop, part)`: léto z tabulky (ozim, nebo jařiny –
  jař, luštěniny, len); sucho s ochranou `dry`, deštivé léto a mokré žně s ochranou `wet` (niva
  −0,2, svah +0,2 – ztráta v nivě o desetinu větší), dobré léto ×1,15 bez ochrany; holomráz ozim
  ×0,65 s ochranou `frost`. Ztráta s ochranou: `protectedFactor` = 1 − (1 − násobek) × (1 − 0,5 ×
  ochrana). Kruté sucho: jař u lesa ×0,75, uprostřed lánu ×0,5, typická ves (zeleň 0,25) ×0,5625.
- **Kde se násobí** – `dayPartLosses(state, day, crop, partIds, base, estimate)` (`disasters.ts`)
  složí počasí dílu se škodou zvěře (`base`): `share` = 1 − počasí × (1 − škoda); `cropYieldKg`
  pak násobí **hrubou** úrodu a osivo odečte celé (čistá klesne víc). Rok, kdy počasí plodinu
  nemění, a ves bez počasí vrací `base` beze změny (bez nového objektu). Sklizeň počítá s celým
  počasím roku sklizně (`harvestYearOf` – od 1. 9. příští rok), odhad ozimu pro příděl
  (`winterEstimateLosses` v `diet.ts` a `emergency-slaughter.ts`) jen s tím, co je vidět
  (`cropWeatherOf(…, true)` – na podzim nic, sucho od 1. 5., mokré žně do 15. 7. jako deštivé).
- **Výmlat** – v deštivém létě a za mokrých žní práce výmlatu sklizené části × 1,2
  (`threshWorkFactor` při `addSheaves` v `simulate-food.ts`).
- **Seno** – `mow(state, amount, day)` přičte seno × `mowingWeatherFactor` (seno roku s ochranou
  každé louky – díly podle ochrany, přirozené louky jako typická ves, vážené plochou; memo
  `WeakMap` na objektu seče). Plán seče (`mowingTargets` v `planMowing`, `planAftermath`,
  `raiseAftermath`) chce o 15 % víc (`hayReserve`) a ÷ seno roku, které je vidět (25. 5. jen
  sucho, 1. 8. všechno) – v suchém roce poseče víc luk, dokud stačí.
- **Pastva** – `pastureHa` × `pastureWeatherFactor` (léto, které je vidět; bez ochrany; **od
  1. 9. násobek 1** – letošní léto je minulé, příští se nezná) – podle ní ves na podzim drží
     stáda (`winterTargets`).
- **Dlouhá zima** (`isLongWinter` – listopad a prosinec patří k zimě příštího roku): krmení
  senem v dubnu (`husbandryDay`) jde podle skutečnosti, ale **rozhodnutí vsi** (porážka
  `hayShortSlaughter`, výcvik volů v `oxen.ts`) jen podle `isLongWinterRevealed` (od 1. 3.; v listopadu
  a prosinci ne) – bez úniku budoucnosti. `hayWinterDaysLeft(day, true)` počítá do konce posledního
  měsíce z `longWinterHayMonths`. Setí jařin (jař, luštěniny, len) se drží do 22. 3.
  (`springSowingHeld` ve `fieldTasks` a `surplusTasks`).
- **Dohra setí jařin 1.–14. 5.** (návrh Clauda – levná cesta místo oken po dnech):
  `springSowingExtended(state, day, crop)` platí jen v odhalené dlouhé zimě a se `weatherSeed`
  (nebo vynuceným počasím). Díly, které už jsou v práci plodiny, se dosévají i po 30. 4. – nové
  díly se po 30. 4. nepřidávají (okno `CROP_WINDOWS` se nemění). Zasahuje `activeTasks` (parametr
  `sowExtended`), `fieldTasks`, `surplusTasks`, `fieldFrontiers`, dřinu a `sowingJustEnded`
  (`simulate-plan.ts`; nerozseté díly se uvolní až 15. 5.). Číslo `longWinterSpringSowExtraDays` 14.
- **Osev s průměrem let** – `sowingTargets` dělí úrodu obilí `sowingYieldFactor` (0,95) – ves
  zaseje ≈ 5 % víc. **Paměť hladu** – `famineMemoryDay` (1. 9. v `simulateDay` před
  `startSeason`): po krutém roce (`isCruelYear`) `disasters.famineMemoryUntilYear` = rok + 10;
  `bufferEnergyYearsOf` pak dává pojistku 0,75 místo 0,5.
- **Čísla** – `WEATHER_EFFECTS`: `blackFrostWinterCrop` 0,65, `wetThreshWork` 0,2, `hayReserve`
  0,15, `longWinterHayMonths` [4], `longWinterSpringSowFrom` 22. 3., `longWinterSpringSowExtraDays` 14, `famineMemoryYears` 10,
  `famineBufferEnergyYears` 0,75.
- **Vlkov** (stav DB 27. 10. 2026, 44 lidí, vynucené roky): normální × 5 bez hladu; kruté sucho
  – čistá sklizeň −51 %, seno −8 % (ves poseče víc luk), rok po něm 61 dní příděl 0,75 a nouzová
  porážka, 0 úmrtí hladem, zásoby se ani ve 2 dalších normálních letech nevrátí na pojistku;
  dvě krutá sucha za sebou – 258 dní hladu, 11 úmrtí (9 hladem), 48 → 38 lidí (−21 %), ves žije;
  dlouhá zima – bez hladu, ale jař −19 % (zkrácené okno setí). Výkon roku beze změny (30,6 s bez
  počasí, 30,0 s s počasím).
- **Testy** – `weather-effects.test.ts` (násobky dílu podle ochrany, ztráty a odhad, seno seče,
  dlouhá zima, výmlat, paměť hladu, sklizeň v krutém suchu vcelku = po kouscích přes 31. 7.
  a 31. 8.).

## Kraj kolem vsi: sousedé a zvěř (P4)

- **Sousedé** (`trade-weather.ts`, `DISASTER_TRADE` v `rules-disasters.ts`): `tradeWeather(state, season)`
  vrací násobky roku obchodu (`tradeSeason` = rok doplnění 1. 11.): normální 1 a 1, zlý rok
  (`isBadSummer` léta toho roku) zásoba obilí ½ a hodnota ostatního zboží ×0,67, krutý rok
  (`isCruelYear`) ¼ a ×0,5. Zásobu krátí `seasonSupply` (jen `grain`, `Math.floor`; `neighbourStock`
  jí předá počasí vsi), ceny počítá jediná funkce `goodWorth(state, good, day)` v `trade.ts` (obilí 1, ostatní zboží včetně
  luštěnin násobek roku obchodu dne `day`) a používá ji `tradeQuote` (`credit` i `price` včetně koní;
  lidé beze změny), platba za ohradu koní a její vrácení (`horse-pen-payment.ts`, hřivny, zvířata,
  luštěniny, koně) a nákupy řemesel (`productPrice(product, state, day)`, luštěniny v `pay`,
  `ironPriceKg` kování). Uložený zbytek roku (`NeighbourStock`) se nepřepočítává.
- **Mimo násobek:** jen panelový údaj `paymentValueKg` (součet zaplacených kg) a lidé.
- **Zvěř** (`wildlife.ts`, `DISASTER_WILDLIFE`): `wildlifeYearDay` 1. 5. po holomrazné nebo dlouhé
  zimě tohoto roku odečte navíc 10 % jelení zvěře (`deerYear`) a 15 % dospělých prasat
  (`boarYear`); po krutém suchu **loňského** léta (žaludy padají na podzim) jsou selata poloviční.
- **Ves bez `weatherSeed`** má všechny roky normální – nic se nemění (zlaté otisky, kalibrace).
- Testy: `__tests__/trade-weather.test.ts`.

## Rámec místních pohrom (P5)

Návrh: `docs/design/disasters.md` – Kraj a ochrana nové vsi, Místní pohromy – jedna ves.

- **Krok dne** – `localDisastersDay(state, day, landscape, obstacles)` (`local-disasters.ts`)
  v `simulateDay` po `damageWindowStart`, před `startPurchases` a `work()` (krok 6 Pořadí dne
  v plánu): v pevném pořadí smršť (`tornadoDay`), kroupy (`hailDay`), povodeň (`floodDay`),
  požár (`fireDay`). Vrací zápisy kroniky; úmrtí (P6, P9) jdou i do štěstí jako u lovu
  (`happinessEvents`). Samostatný soubor kvůli cyklu importů: `disasters.ts` čte i strava
  (`winterEstimateLosses`), kdyby natahoval požár, kroupy a seno, rozbije se pořadí načtení modulů
  (`PROTEIN` v `livestock.ts`).
- **Ochrana nové vsi** – `inDisasterProtection(foundedDay, day)` (`disaster-schedule.ts`, vyváží
  i `disasters.ts`): prvních 5 let (`LOCAL_DISASTERS.protectionYears`) žádná místní pohroma;
  vynucená (`disasters.override.fire`, `.hail`, `.tornado` – testy a dev) ochranu přebije.
- **Rozpis roku** – `yearSchedule(seed, year)` (memo, nejvýš 4096 rozpisů): čistá funkce seedu
  vsi a roku – dvě vsi téže mapy mají jiný seed, tedy jiné kroupy. Zatím `hail: HailPlan | null`
  (den, úhel pruhu, posun). Povodeň má vodu z počasí kraje (P6), smršť stopy přes mapu ze seedu
  počasí (`yearTornadoes`, P9).
- **Ztráty dílů** – `disasters.losses = { year, hail, flood, tornado }` (rok sklizně `harvestYearOf`,
  podíly hrubé úrody po dílech); `dayPartLosses` je sloučí s počasím a škodou zvěře: zůstane
  počasí × (1 − zvěř) × (1 − kroupy) × (1 − povodeň) × (1 − smršť). Bez počasí a bez potlučených dílů vrací `base` beze změny (zlaté
  otisky). Odhad (`estimate`) kroupy, které už padly, vidí.
- **Testy** – `__tests__/disasters-protection.test.ts`: ves ve 3. roce bez krupobití, v 6. roce
  s ním; žádná místní pohroma prvních 5 let a po nich všechny druhy rámce (`KINDS` – kroupy,
  povodeň na rovině u potoka, požár); smršť a její ochranu testuje `tornado.test.ts`.

## Kroupy (P5)

Návrh: `docs/design/disasters.md` – Kroupy (Martin 27. 10. 2026: „Stromy by měly pole před
kroupami částečně chránit“). Jádro: `hail.ts`, čísla `HAIL` v `rules-disasters.ts`.

- **Kdy** – `yearSchedule` ze `'hail:' + year`: šance 6 % ročně, den rovnoměrně 1. 6. – 31. 8.,
  směr pruhu (úhel 0–π) a posun středu pruhu ±450 m kolmo ke směru (návrh Clauda). Ves bez
  `weatherSeed` kroupy nemá (jen vynucené `disasters.override.hail[den] = { angle, offsetM }`).
- **Pruh** – `hailZone(strip, x, z)`: pruh 300 m přes celé okolí vsi, střed = průměr poloh
  obydlí a dílen v den krupobití (`HailStrip` v `disasters.hail` – i pro scénu). Vnitřek 200 m
  (`core`), vnějších 50 m z každé strany okraj (`edge` – poloviční škoda). Díly polí podle středu
  čtverce (`villageLandSquares`); bez krajiny mřížka běžné krajiny (128 × 15 m – políčka dílů
  jsou stejná). Vzdálenost od osy přes `detSin` / `detCos`.
- **Pole** – nesklizené plodiny letošního plánu (`season.crops`, `harvestedKg === null`):
  `hailLoss` = 0,6 (okraj 0,3) × (1 − `partProtectionOf(state, partId, 'hail')`) – ochrana je
  0,4 × zeleň (zeleň 1 → 36 %). Do `disasters.losses.hail` (druhé krupobití roku se sloučí).
  Sklizený díl a díl mimo plodiny nic.
- **Louky** – dnešní seč v jejím okně (`isMowingSeason`): úseky seče (`mowingSpans`) za hotovou
  prací, díly s ochranou dílu, přirozené louky s typickou zelení. Ztracený podíl zbylé louky →
  `HayMowing.hailFactor`, kterým `mow()` násobí seno další práce (rozložené na zbytek seče – návrh
  Clauda). Posečené louky nic, nová seč (otava) začíná bez krup.
- **Sad** – letošní jablka čtverců v pruhu −40 % (okraj −20 %, návrh Clauda) podle očekávané
  úrody čtverce; podíl, který zbyl, v `disasters.hail.apples` – `applesAfterHail` ho uplatní při
  začátku sklizně 1. 9. téhož roku (`orchard.ts`, `startWork`). Jabloně u cest beze změny.
- **Střechy** – obydlí a dílny v pruhu: stav − `roofYears` ÷ `emptyLifespanYears` (rok
  chátrání prázdné stavby; okraj půl roku). Stav neklesne pod
  `HAIL.roofMinCondition` (0,05) – kroupy samy stavbu nezboří, prázdná dožije běžným chátráním
  (návrh Clauda). Obydlí s lidmi a dílny: ubraný rok života je trvalý, obnova jako po běžném
  chátrání (návrh Clauda).
- **Kronika** – `hail` (`partIds`, `dwellingIds`, `meadowShare`, `appleShare`); text
  v `village-view-chronicle.ts`.
- **Testy** – `__tests__/hail.test.ts`: četnost 6 % (2000 let), okno června až srpna, dvě vsi
  téže mapy, pruh a okraje, strom chrání (36 %), sklizený díl a díl mimo nic, sloučení se zvěří,
  střechy, louka a sad, ves bez počasí, požár v rámci, dopočet po kouscích přes den krupobití.

## Povodeň (P6)

Návrh: `docs/design/disasters.md` – Povodeň potoka (Martin 27. 10. 2026: „Velikost povodně by se
měla lišit … Naplavenina by měla hnojit víc“, „A ať zabíjí tak jak navrhuješ“, „Ano a ano“ –
výška společná pro celý kraj). Jádro: `flood.ts`, čísla `FLOOD` (škody) a `FLOOD_WATER` (stupně
vody, P1) v `rules-disasters.ts`.

- **Voda kraje** – `floodToday(state, day)`: stupeň, výška, jaro / léto a den z
  `weatherOf(state, year).flood` (P1 – `yearWeather`, vynucená `disasters.override.weather`). Dvě
  vsi téže mapy mají stejnou vodu týž den; škody počítá každá ves sama. Vynucená voda
  (`override.weather[rok].flood`) ochranu nové vsi **přebije** stejně jako `override.hail`, `.fire`
  (dev, testy); povodeň z rozpisu ji nepřebije.
- **Kdy nic** – `floodDay(state, day, landscape)`: bez krajiny (kalibrace, testy – žádné výšky),
  ves bez `weatherSeed` bez vynucené vody (zlaté otisky) a nová ves (`inDisasterProtection`, 5 let).
- **Hloubka** – výška vody − výška políčka nad potokem (`streamHeights` z `part-protection.ts`,
  `heightAboveStreamAt` pro bod světa; mapa bez vody = nekonečno). Díly podle políčka čtverce
  (`villageLandSquares`) – hloubka dílu je **průměr přes jeho čtverce**, nezatopený čtverec = 0
  (`meanPartDepths`; návrh Clauda); stavby a jámy podle svého středu. Pásmo `floodBand`: do 0,5 m, 0,5–1,5 m,
  nad 1,5 m. Krajina se nemění.
- **Úroda** – nesklizené plodiny (`season.crops`, `harvestedKg === null`): letní voda ×0,7 / 0,3 /
  0, jarní jen ozim ×0,85 / 0,5 / 0,2 (jařiny se v březnu teprve sejí – návrh Clauda). Do
  `disasters.losses.flood` (druhá voda roku se sloučí), sklizeň přes `dayPartLosses`.
- **Louky** – nesečené úseky dnešní seče v jejím okně (`damageUnmownMeadows` v `hay.ts` – sdílí
  ho kroupy): ztráta úseku 1 − `cropKept` podle hloubky jeho políčka → `HayMowing.hailFactor`.
  Voda mimo okno seče (jaro, 10. 7. mezi sečemi) louky nebere.
- **Naplavenina** – všechny zatopené díly (i příloh a louka): `fertilityShare` +0,1 / 0,2 / 0,3,
  nejvýš 1,3 (`siltMaxShare`). Ubývá osevem jako jiná úrodnost; příloh a luštěniny ji nesrazí
  (`withinNatural` ve `fields.ts` – přírůstek nejvýš do přirozené, víc se nezvedne).
- **Jámy** – zatopená jáma ztratí čtvrtinu zrna (`soakGrainPits`, zásoby obilí s ní). Nová jáma
  se ve vsi s počasím kraje nekope níž než 1,2 m nad potokem (`grainPitSites` – `floodSafe`).
- **Stavby** – obydlí a dílny: stav −0,1 / 0,3 / 0,6, zemnice −0,3 / 0,6 / zřítí se. Na nule
  spadnou jako po požáru (`collapseDwellings` ve `fire.ts` – obyvatelé k příbuzným, stavby vázané
  na dům padají, zbytek jámy; poslední obydlí vsi zůstane se stavem 0,1). Obydlený dům opraví
  ves jako po chátrání.
- **Úmrtí** – od 3 m (pětisetletá a tisíciletá) každý obyvatel zatopeného obydlí s šancí 2 %
  (proud `'flood-death:' + day`, obydlí a lidé podle id) – `death` s `cause: 'flood'`, pohřeb,
  nástupnictví `dynastyDay`. Úmrtí se losují před poškozením staveb.
- **Úklid záznamů** – `disasters.flood` se maže na začátku `floodDay`, když `den > den povodně +
FLOOD.mudDays` (14 dní – scéna kreslí 3 dny vodu `FLOOD.standDays` a pak bahno a naplaveninu;
  ztráty úrody jsou v `disasters.losses`). `disasters.hail` (pruh pro scénu, `apples` pro `applesAfterHail`) se maže na
  začátku `hailDay` od 1. 1. roku následujícího po krupobití – jablka a pruh platí celý rok.
- **Kronika** – `flood` (`level`, `heightM`, `partIds` zatopených dílů, `dwellingIds`,
  `collapsedDwellingIds`, `meadowShare`, `lostGrainKg`) jen když vsi něco zatopila; poslední
  taková voda v `disasters.flood` (den, stupeň, výška – pro scénu, voda stojí `FLOOD.standDays`, bahno do `FLOOD.mudDays`).
  Texty v `village-view-chronicle.ts` (`FLOOD_LEVEL_NAMES` – „Stoletá voda – 2 m nad hladinou“).
- **Testy** – `__tests__/flood.test.ts`: pásma, četnosti stupňů za 10 000 let, hloubka podle
  terénu (umělý svah u potoka), letní a jarní voda, stavby a zemnice, jámy, naplavenina se stropem
  a koncem roku, jáma ne pod 1,2 m, úmrtí jen od pětisetleté (≈ 2 %), dvě vsi téže mapy, ochrana
  nové vsi, bez krajiny, ves bez počasí, dopočet po kouscích přes den vody.
- **Vlkov** (stav z DB, seed počasí ručně, voda vynucená): všechna obydlí a jámy 11–14 m nad
  potokem – stavby ani lidé povodeň nepoznají; zatopí jen díly v nivě (tisíciletá 232 dílů,
  5,2 ha, z toho 28 osetých). Sklizeň nejvýš o pár procent nižší, naplavenina zvedne úrodnost
  nivy.

## Požár (P7)

Návrh: `docs/design/disasters.md` – Požár. Jádro: `fire.ts`, čísla `FIRE` v `rules-disasters.ts`.

- **Krok dne** – `fireDay(state, day, obstacles, landscape, efficiency = 0)` poslední v rámci
  `localDisastersDay` (viz Rámec místních pohrom – po `damageWindowStart`, před nákupy a `work()`,
  takže hasí i bez pěších lovců dne); vrací zápis kroniky `fire` (`startedDwellingId`, `burnedDwellingIds`, ztráty
  zrna, masa, sýra a sena v kg; text v `village-view-chronicle.ts`). Ves bez `weatherSeed` (testy,
  kalibrace) nehoří; ochrana nové vsi (`inDisasterProtection`) požár vypíná prvních 5 let.
- **Vznik** – `dwellingFireChance`: 0,4 % na obydlí a rok × suché léto 2, kruté sucho 3, deštivé
  léto ½ (duben–srpen), zima 1,5 (listopad–únor), kovárna / milíř / pec 3, zemnice ½. Hazard dne
  = Σ šancí ÷ 365,25; jedno losování `'fire:' + day` ze seedu vsi, stavbu vybere podle součtu
  (obydlí podle id). Dílna a dvorec jsou obydlí (`Dwelling.workshop`), hoří stejně.
- **Šíření** – `spreadFire`, los každé dvojice zvlášť (`deriveSeed(seed, 'fire-spread:' + den + ':' +
z + ':' + na)`, nezávisí na pořadí průchodu): každá nově hořící stavba zkusí
  každého souseda jednou (pořadí podle id), podle vzdálenosti obrysů (`convexDistance`, dílna
  má víc půdorysů) do 6 m 70 %, do 12 m 40 %. Zeleň na spojnici středů (listnatý strom a keř
  z vrstvy překážek do 2 m od spojnice, stromy u cest, sad podle čtverců) šanci půlí; jehličnany
  ne. Hašení (P8): šance × (1 − 0,7 × účinnost řetězu, viz Hašení).
- **Dopad** – `burnDown`: hořící obydlí se zřítí (`recordRuins`, zmizí ze `state.dwellings`;
  s hašením klesne stav o 1 − 0,5 × účinnost a zřítí se jen na nule). Obyvatelé jdou k příbuzným
  (`evacuationTarget` v `population.ts` – jako rozpad domácnosti, nevejdou-li se, i do plného
  domu; návrh Clauda); každá stavba vázaná na shořelý dům (`Construction.dwellingId` – přestavba,
  oprava) padá a klády se vrátí. Zásoby (návrh Clauda – zjednodušení): volné zrno
  (`looseGrainKg`, zrno v jamách přečká), maso, sýr a seno ubydou o podíl shořelých staveb ze
  všech obydlí; shořelá kovárna odnese podíl uhlí, hřiven a houby, hrnčířství podíl keramiky
  (`burnWorkshopStocks`, podíl = 1 ÷ počet dílen řemesla; milíř stojí venku, uhlíř o nic nepřijde).
  Poslední stojící obydlí vsi se nezboří (zůstane se stavem 0,1). Nikdo neumírá.
  **Žádná automatická přestavba** (Martin 27. 10. 2026: „dům musí postavit hráč“): vyhořelý dům
  zůstane zbytkem jámy (`recordRuins`, ruina ve scéně jako po rozpadu) a rodina bydlí u příbuzných,
  dokud hráč nepostaví nový dům běžnou stavbou – prázdné obydlí pak osídlí první rodina v pořadí
  (`occupyEmptyDwellings` / `settleNewDwelling`, stejně jako po rozpadu domácnosti).
- **Vynucený požár** – `disasters.override.fire[den] = id obydlí` (testy a dev): přebije los
  i ochranu.
- **Stohy** – jádro stohy s polohou nemá (seno je jedna zásoba, stohy kreslí jen scéna), proto
  seno ubývá o podíl shořelých staveb (návrh Clauda; „stoh do 12 m“ z návrhu zatím nic nečte).
- **Testy** – `fire.test.ts`: násobky šance, četnost ≈ 6–9 % ročně u 15 domů, pásma přeskoku
  (5 m ≈ 70 %, 10 m ≈ 40 %, 15 m nic), řetěz, strom a sad půlí, hašení, zásoby a jámy, lidé,
  ochrana 5 let, ves bez počasí, dopočet po kouscích, zásoby dílen, ruina a nový dům hráče,
  365 dní po požáru bez výjimky, nezávislý los dvojice.

## Hašení řetězem (P8)

`firefighting.ts`, čísla `FIRE.firefighting` (`spreadCut` 0,7, `damageShare` 0,5, `handoverM` 2,5).

- **Plán** – `fireDay` po výběru hořící stavby zavolá `planFireFight`: voda = **tentýž břeh, kam chodí ženy pro vodu**
  (`PATH_WATER_SPOT`, `groundSpots` + `nearestSpot` z `paths/walking.ts` – jako `waterWalkDistance`
  u `Dwelling.waterWalkM`), nejbližší k hořící stavbě; vzdálenost řetězu je **přímka** od něj ke
  stavbě (řetěz se staví rovně). `waterWalkM` je jiné číslo ke stejnému místu: váží chůzi po
  pěšinách a cestách (rychlejší než louka), proto bývá menší než geometrická vzdálenost (Vlkov
  ≈ 296 vs. ≈ 455 m); lidé = dospělí, kdo jsou dnes ve vsi
  (`fireFighters(state, day)`: `isAdult` mimo pěší lovce `huntFootIds` a cestu pro kování `ironTravellers`; cvičící rodina vojvody na dvorci hasí); rozestup = vzdálenost ÷ lidé; **účinnost = min(1; 2,5 ÷ rozestup)**
  (`chainEfficiency`; bez lidí 0, u vody 1). Bez krajiny nebo bez vody je účinnost 0.
- **Pro scénu (P13)** – plán jde do `state.disasters.fireFight` (`FireFight`: den, hořící obydlí,
  `water` {x, z} nebo null, `distanceM`, `people`, `spacingM`, `efficiency`) – jen ke čtení,
  platí v `day`; `fireDay` na začátku smaže plán starší než dnešek (stav nenese starý požár) a `efficiency` plánu je použitá hodnota (i přebitá v testech). Lidé stojí rovnoměrně na přímce od `water` k obydlí.
- **Práce dne** – `fireFighting(state, day)` je pravda v den požáru: `villagersToday`
  (`morning-water.ts`) vyřadí všechny dospělé (děti a staří pracují dál) a v `simulate-work.ts`
  se všechny dílny označí `resting` (řemeslníci hasí, dílna stojí). Uhlíř hasí taky: `burners.clear()` zruší jeho plán dne a pálící milíř ten den stojí (`done` se neposune, nic se nezkazí ani neshoří), dohoří o den později. Platí i ve žních. Účinnost
  jde do `spreadFire` a `burnDown`; parametr `efficiency` u `fireDay` ji jen přebíjí (testy).
- **Testy** – `firefighting.test.ts`: bod vody hašení = bod vody obydlí (`waterWalkM`), tabulka účinnosti, plán na
  skutečné krajině, dospělí nepracují jen v den požáru, s hašením nezbude méně domů než bez,
  dopočet po kouscích, lovci a cesta pro kování nehasí, starý plán se maže, přebitá účinnost v plánu, milíř při hašení stojí (`charcoal.test.ts`).

## Smršť (P9)

Návrh: `docs/design/disasters.md` – Smršť (tornádo) (Martin 27. 10. 2026: „Přidej i tornádo. Máme
ho doložené z Kosmovy kroniky. Jen dej pravděpodobnost obvyklou pro střední Evropu“, „Takhle
vzácné tornádo je dobré“; rešerše §6). Jádro: `tornado.ts`, stopy v `disaster-schedule.ts`, čísla
`TORNADO` v `rules-disasters.ts`.

- **Stopy mapy** – `yearTornadoes(weatherSeed, year)` (memo jako `yearSchedule`): proud
  `'tornado:' + year` ze **seedu počasí mapy** – všechny vsi mapy vidí tytéž stopy. Poissonův počet
  ve čtverci mapy (`MAP_HALF_M` = 960 m, `tileCenterWorld`) rozšířeném o 30 km (0,5 na 10 000 km²
  ročně → průměr 0,19), každá stopa: střed, měsíc (V 10 %, VI 25 %, VII 40 %, VIII 25 % – návrh
  Clauda), den, síla F0–F4 (40 / 35 / 20 / 4,5 / 0,5 %), délka a šířka = průměr ESWD × (0,5–1,5),
  směr 80 % od JZ k SV (kurz 45° ± 45° trojúhelníkově), jinak libovolný (návrh Clauda). Vrací
  jen stopy, které protnou mapu (`tornadoTrackHitsSquare` – oddělující osy), podle dne. Úhel:
  0 = k východu (+x), π/2 = k severu (+z); pás bodu `inTornadoTrack` (`detSin` / `detCos`).
- **Četnost** (1 000 000 let): přes mapu 0,105 % let, přes pole vsi (1 × 1 km) 0,052 %, přes
  jádro vsi (300 × 300 m) 0,018 %; ze zásahů jádra je polovina F2 a silnějších – jako rešerše.
- **Den smrště** – `tornadoDay(state, day, landscape, obstacles)` (krok 1 `localDisastersDay`):
  ves bez `weatherSeed` (zlaté otisky) a nová ves (5 let) nic; vynucená smršť
  (`disasters.override.tornado[day] = { strength, angle, offsetM }` – stopa přes střed vsi
  s průměrnou délkou a šířkou síly) ochranu přebije. Škody podle `tornadoStrengthRule`:
  - **díly** se středem čtverce v pásu – nesklizená úroda −20 / 50 / 80 / 100 / 100 % do
    `disasters.losses.tornado` (druhá smršť roku se sloučí), sklizeň přes `dayPartLosses`;
    nesečené louky dnešní seče stejně (`damageUnmownMeadows`),
  - **stromy** – dospělé stromy vrstvy překážek a lesa vsi v pásu do `TORNADO.reachM` (600 m) od
    středu vsi; padne 10 / 30 / 70 / 100 / 100 % – los po stromu `deriveSeed(seed počasí,
'tornado-trees:' + day)` + `'tree:' + id` (dvě vsi vidí tytéž vývraty). Vývrat se zapíše jako
    kácení (`felledTrees` – pařez, pak nálet) a kmen zůstane ležet: `addFallenTrunks` (wood.ts) založí hromady klád u lesa (`logStacks`, `fieldId` 0, čtverce `TORNADO.trunkPileM` = 60 m, 1 kláda na strom, odběr `takeLogs`), u vsi nic zdarma; klády jen za stromy, které `neighbours.felled` ještě nemá (druhá ves téže mapy je nezapočte; slabina jako u běžného kácení);
    mladé stromky a keře se ohnou, dál od vsi kmeny shnijí,
  - **sad** – vyvrácený čtverec (středem v pásu, týž podíl) ves obnoví jako starý
    (`uprootOrchardSquares` v `orchard.ts`: `plantedDay` null, výsadba bez překážek; převezme ho
    rozestavěná obnova nebo výsadba, jinak nová obnova bez kvóty); **jabloně u cest** vesničané
    hned zasadí znovu (`plantedDay` = den smrště – návrh Clauda),
  - **úmrtí** jen F3 1 % a F4 3 % na obyvatele zasaženého obydlí – `disasterDeaths`
    (`disaster-deaths.ts`, sdílí ho povodeň; proud `'tornado-death:' + day`), `cause: 'tornado'`;
    losují se před poškozením staveb,
  - **seno** – stohy stojí u obydlí (jako u požáru): ubude seno × zasažená ÷ všechna obydlí × ½ (F0)
    nebo × 1,
  - **stavby** se středem v pásu – stav −0,15 / 0,4 / zřítí se, zemnice −0,05 / 0,15 / 0,4 / zřítí
    se; na nule `collapseDwellings` (zbytek jámy, obyvatelé k příbuzným, poslední obydlí zůstane).
- **Kronika** – `tornado` (`strength`, `partIds`, `dwellingIds`, `collapsedDwellingIds`,
  `uprootedTrees`, `orchardSquares`, `roadApples`, `meadowShare`, `lostHayKg`) jen když vsi něco
  poničila; text „Silná smršť – zbořené stavby: 3, vyvrácené stromy: 140…“ (od F2 „Silná“) a „…
  zahynul ve smršti“ v `village-view-chronicle.ts`. Poslední taková smršť v `disasters.tornado`
  (den, síla, stopa – pro scénu); `tornadoDay` ji smaže v dalším roce.
- **Testy** – `__tests__/tornado.test.ts`: četnost přes mapu (200 000 let, ±15 %) a přes jádro vsi
  (1 000 000 let), pás stopy, dvě vsi téže mapy – tatáž stopa, ochrana 5 let a vynucená smršť,
  ves bez počasí beze změny, F0 jen střechy a −20 % úrody, F2 zřícení a zemnice −40 % a seno, F3
  úmrtí ≈ 1 % (F2 nikdo), vývraty → pařezy a klády (F1 ≈ 30 %), sad do obnovy a jabloně znovu,
  dopočet po kouscích přes den smrště a smazání záznamu v dalším roce.
- **Vlkov** (stav z DB 30. 11. 822, seed počasí ručně, vynucená smršť 15. 7. 823 od JZ k SV
  středem vsi; 10 obydlí, 885 osetých dílů): F0 – 6 staveb −15 % (zemnice −5 %), 11 vývratů,
  9 dílů −20 %, seno −30 %; F1 – 9 staveb −40 %, 53 vývratů, 6 jabloní; F2 – zřítí se 8 z 9
  zasažených, 264 vývratů, 56 dílů −80 %; F3 – zřítí se vše kromě dvorce (poslední obydlí), 1589
  vývratů na hromadách klád u lesa, 236 dílů bez úrody (sklizeň −19 %), 1 mrtvý ze 46; F4 obdobně (1803
  vývratů).

## Scéna – počasí roku v barvách a světle (P11, první polovina)

- **Data** – `sceneWeather(state, day)` (`apps/web/lib/weather-view.ts`) → `SceneVillage.weather`
  (`SceneWeather` ve `village-view-scene-types.ts`): rok, odhalené zlé (nebo dobré) léto a zima
  z `revealedWeather`, síla léta pro vzhled (sucho a deštivé léto 0,6, kruté sucho a mokré žně 1)
  a ochrana dílů proti odhalenému létu po stupních 0–4 (`protectionLevel` – mokro −0,2…+0,2
  převedeno na 0–1; stupeň 0 chybí). Normální rok `weather` nemá. **Seed počasí ani budoucí rok
  se do prohlížeče nedostanou** – testy v `village-view.test.ts` (JSON pohledu bez `drought`,
  `override` a seedu před 1. 5.).
- **Vzhled** – `seasonLook(day, weather)` a světlo (`day-light.ts`), podrobně
  [scene.md – Roční období – počasí](scene.md). Barva dílu podle ochrany – `droughtPartTint`
  (`field-look.ts`), `PartView.tint` → obtisk, porost shora a trsy obilí.
- **Obilí, voda a déšť (P11b)** – nižší a řidší obilí v suchu, polehlé obilí v deštivém létě,
  řídký ozim po holomrazu (`partWeather`, ozim podle `SceneFieldPart.winter` z `crop: 'winter'`),
  mělký potok v suchu, déšť ve dnech deště (ze seedu dne v prohlížeči, ne z jádra), zataženo
  a kaluže – podrobně [scene.md – Roční období – počasí](scene.md). Zvuk deště chybí (žádný CC0
  zvuk).
- **Vývojová ukázka** – `/dev/landscape`, přepínač **Počasí** (`dev-weather.ts`, `data-testid`
  `dev-weather`): vynucené počasí vsi náhledu s vývojovým dnem (rok se nekontroluje), ochrana dílů
  podle id dílu (id % 5).

## Scéna – bouřka s kroupami a povodeň (P12)

- **Data** – `sceneHail(state, day)` a `sceneFlood(state, day)` (`apps/web/lib/weather-view.ts`) →
  `SceneVillage.hail` (`SceneHail` – den a pruh) a `.flood` (`SceneFlood` – den, výška vody,
  jaro / léto podle měsíce). `disasters.hail` / `.flood` se v jádru nemažou – scéna je dostane
  **jen v den pohromy a po něm**: kroupy do konce téhož roku (potlučená pole do žní), povodeň
  `FLOOD.standDays` + 1 den ústupu + 14 dní bahna (`FLOOD_SCENE_DAYS`, návrh Clauda). Vynucené
  kroupy (`override.hail`), podíl jablek ani budoucí rozpis se do prohlížeče nedostanou (testy
  ve `storm.test.ts`). Sad v pruhu bez jablek do sklizně (`fruit: false` v `village-view-scene.ts`
  – `hailZone` z jádra, nově exportovaný).
- **Vzhled** – ztmavení, záblesky, kroupy, bílý pás, potlučené obilí, voda povodně a bahno:
  [scene.md – Roční období – počasí](scene.md) (Bouřka s kroupami, Povodeň). Voda ve scéně
  bere zatopená políčka ze `streamHeights` jako jádro – shoduje se se škodami.
- **Vývojová ukázka** – přepínač **Počasí** na `/dev/landscape`: krupobití, povodeň stoletá
  a tisíciletá (`dev-weather.ts`, `devDisasterDay`).

## Scéna – požár s řetězem s vědry (P13, požár)

- **Data** – `sceneFire(state, day)` (`apps/web/lib/fire-view.ts`) → `SceneVillage.fire`
  (`SceneFire`) **jen v den požáru**: hořící stavby ze zápisu kroniky `fire` (`burnedDwellingIds`,
  `startedDwellingId` → `started`; poloha stojící poškozené z obydlí, zřícené ze zbytku jámy
  téhož dne) a řetěz (`SceneFireChain` – bod vody, hořící stavba, počet dospělých a rozestup)
  z `disasters.fireFight`, jen když platí pro ten den a má vodu. Vynucený požár
  (`override.fire`) ani budoucí rozpis se do prohlížeče nedostanou. Zbytky jam po požáru mají
  `charred` (`charredRuinKeys` – zápisy kroniky; kronika drží posledních 500 zápisů, starší
  požár už ohořelý odstín nemá). Testy `fire-view.test.ts`.
- **Vzhled** – plameny, hustý dým, řetěz s vědry a ohořelé trosky:
  [scene-village.md – Požár a řetěz s vědry](scene-village.md).
- **Vývojová ukázka** – přepínač **Počasí** na `/dev/landscape`: „požár – podávají vědra“
  (rozestup 2,2 m) a „požár – chodí s vědry“ (7 m) – hoří obydlí nejblíž vodě (aspoň 25 m)
  a soused do 45 m, řetěz od nejbližšího bodu vody jako v jádru; den světa vynucený na 0,4 dne
  požáru (`devDisasterDay`). Ukázka nemá skutečné lidi řetězu (`labor.persons` vynechané)
  a práce vsi ten den není. e2e `weather-scene.spec.ts` (jen s `WEATHER_DEV_URL`): plameny
  a vědra v obou režimech, po návratu na normální rok žádné plameny ani vědra a draw cally
  stejné (91 → požár 93 → 91).
- **Zvuk praskání ohně** – zatím není (lokálně žádný CC0 záznam), stejně jako hukot smrště.

## Scéna – smršť (P13, smršť)

- **Data** – `sceneTornado(state, day)` (`apps/web/lib/weather-view.ts`) → `SceneVillage.tornado`
  (`SceneTornado`) jen od dne smrště do konce jejího roku ze zápisu `disasters.tornado` (den,
  síla, stopa) – **nikdy `yearTornadoes`** ani vynucená smršť (`override.tornado`) či budoucí
  rozpis. Prvních `TORNADO_TRUNK_DAYS` (10) dní i `trunks` – id stromů pokácených v den smrště
  (`felledTrees` s `day` smrště) pro padlé kmeny. Testy `apps/web/lib/scene/__tests__/tornado.test.ts`.
- **Vzhled** – trychtýř a ztmavení: [scene.md – Smršť](scene.md); vývraty, polehlá pole,
  rozmetané stohy a zřícené stavby: [scene-village.md – Smršť](scene-village.md).
- **Vývojová ukázka** – přepínač **Počasí** na `/dev/landscape`: „smršť F2“ a „smršť F3“
  (`withDevTornado` v `dev-weather.ts`, jako `tornadoDay` jádra) – stopa průměrné délky
  a šířky síly od JZ k SV přes střed obydlí, dospělé stromy vrstvy překážek ve stopě do 600 m
  padnou s podílem síly (pařez a padlý kmen), obydlí ve stopě ztratí stav, na nule se zřítí
  (poslední zůstane); den světa vynucený na 0,7 dne smrště (trychtýř u středu vsi, plná tma).
  e2e `weather-scene.spec.ts` (jen s `WEATHER_DEV_URL`): s animacemi trychtýř a padlé kmeny,
  při omezeném pohybu bez trychtýře, scéna tmavší a kmenů víc (F3), po návratu na normální rok
  žádný trychtýř ani kmeny a draw cally stejné (91 → F2 92, F3 83 → 91; padlých kmenů F2 907, F3 3391 – hustý les ukázky).
- **Zvuk hukotu** – není (lokálně žádný CC0 záznam).

## Rozhraní (P10)

- Lišta (ikona počasí roku a povodně s výškou vody), panel dílu (ochrana 0–4 a odhad ztrát),
  obchod (zdražení po zlém roce) a upozornění: [web-ui.md – Počasí a pohromy v rozhraní](web-ui.md).
  Do prohlížeče jde jen odhalené počasí (`weatherView` nad `revealedWeather`) – nikdy
  `weatherSeed`, `override` ani budoucí rok (test JSON 30. 4. v `village-view.test.ts`).
- **Vynucené pohromy (dev)** – `forceBadYear` / `forceDisaster` (`application/dev-disasters.ts`)
  zapisují `disasters.override` skutečné vsi, jen s `devMode`: [accounts.md](accounts.md).
- **Kronika** – požár „Požár – vyhořel jeden dům / vyhořely 2 domy / vyhořelo 5 domů.“, kroupy
  „Kroupy – potlučené díly: 4, potlučené střechy: 2.“ (`fireText`, `hailText`
  v `village-view-chronicle.ts`); povodeň, smršť a počasí beze změny.
