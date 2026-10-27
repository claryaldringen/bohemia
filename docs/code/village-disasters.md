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
