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
