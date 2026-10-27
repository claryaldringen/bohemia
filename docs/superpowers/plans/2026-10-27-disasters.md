# Přírodní pohromy – plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cíl:** Ves prožívá **zlé roky počasí** společné celé mapě (sucho, deštivé léto a mokré žně,
holomráz, dlouhá zima) a **místní pohromy** (kroupy, povodeň potoka podle doby návratu, požár,
smršť). Dopad na díl závisí na krajině – **ochrana dílu** ze zeleně a vlhkosti. Požár hasí všichni
dospělí **řetězem s vědry** od nejbližší vody. Nová ves má 5 let bez místních pohrom. Hráč vidí
počasí, ochranu dílu, škody, kroniku a pohromy ve scéně. Martin 27. 10. 2026 návrh prošel otázku
po otázce a schválil; tornádo doplnil týž den („Přidej i tornádo …“).

**Architektura:** Počasí roku je čistá funkce `yearWeather(weatherSeed, year)` – **žádný sdílený
stav mezi vsemi**: každá ves nese kopii seedu počasí své mapy (`VillageState.weatherSeed`), takže
všechny vsi mapy počítají totéž počasí samy. Seed počasí je nový sloupec mapy (`settlement`) na
serveru – **není to seed krajiny** (ten zná prohlížeč a kód je veřejný). Kroupy a požár ze seedu
vsi a roku; **výška povodně je součást počasí roku kraje** (Martin 27. 10. 2026: „Ano a ano“ –
tentýž potok, tatáž voda; škody po vsích), smršť ze seedu počasí mapy (stopa v souřadnicích mapy
– dvě vsi vidí tutéž). Nová
volitelná část stavu `VillageState.disasters` (`types-disasters.ts`), čísla v novém
`rules-disasters.ts`. Doménové moduly po tématech: `weather.ts`, `part-protection.ts`,
`weather-effects.ts`, `hail.ts`, `flood.ts`, `fire.ts`, `firefighting.ts`, `tornado.ts`,
`disasters.ts` (rámec, ochrana nové vsi, sloučení ztrát dílu). Škody na úrodě jdou stejnou cestou
jako škody zvěře – `PartLosses` v `cropYieldKg` (`year-plan.ts`).

**Stack:** TypeScript, doména a use-casy – Vitest (`packages/game`), DB – Drizzle migrace
(jen sloupec `weather_seed`), web – Vitest a Playwright, scéna – Babylon.

**Spec:** [docs/design/disasters.md](../../design/disasters.md) – schváleno Martinem 27. 10. 2026;
rozhodnutí v ledgeru `.superpowers/sdd/2026-10-23-issues/progress.md` (řádky „Pohromy …“).
Rešerše [research/2026-10-27-disasters.md](../../design/research/2026-10-27-disasters.md) (§6
tornáda; Martin 27. 10. 2026: „Takhle vzácné tornádo je dobré“). Scéna podle `disasters.md – Ve
scéně` (Martin 27. 10. 2026: „Jinak je to dobré“ + slunce praží v suchu, tma a blesky při
kroupách). Co v plánu není Martinovo, je návrh Clauda.

## Globální omezení

- **Nové části stavu volitelné**, převod starších vsí jednou a idempotentně: `withWeatherSeed(state,
seed)` a `withDisasters(state)` v `application/update-village.ts` (vedle `withLivestockLand`)
  a `withDisasters` i v řetězu převodů `advanceVillageSteps` (`simulate.ts`). **Ves bez
  `weatherSeed` nemá počasí ani pohromy** (všechny roky normální, žádná místní pohroma) – testy,
  kalibrace a zlaté otisky (`smith-golden.test.ts`, `craft-skill-golden.test.ts`) se nemění,
  dokud test seed nedá. Osev s průměrem 0,95 a seno +15 % platí také jen s `weatherSeed`.
- **Determinismus:** počasí `yearWeather(weatherSeed, year)` a stopa smrště `yearTornadoes(weatherSeed,
year)` jsou čisté funkce (memo v modulu); místní pohromy z **vlastních proudů**
  `createRandom(deriveSeed(state.seed, 'hail:' + year))`, `'fire:' + day`,
  `'fire-spread:' + day`, `'flood-death:' + day`, `'tornado-death:' + day` – ať se nezmění losy
  úmrtí a porodů (`populationDay` bere `'day:' + day`) ani lovu (`'hunt:' + day`). Výška
  a den povodně jsou v `yearWeather` (`deriveSeed(weatherSeed, 'flood:' + year)`). Každá úloha,
  která mění chování, má test „po kouscích“ (1 den, 7 dní, 30 dní, celý rok přes den pohromy –
  stejný stav).
- **Stejné počasí pro vsi mapy:** test v P1 (dvě vsi, týž `weatherSeed`, jiný `seed` → stejné
  `yearWeather` 1000 let, včetně výšky a dne povodně) a v P9 (stejná stopa smrště); kroupy,
  požár a škody povodně se liší.
- **Ochrana nové vsi:** `inDisasterProtection(foundedDay, day)` – prvních 5 let žádná místní
  pohroma (kroupy, povodeň, požár, smršť); počasí naplno. Test v každé úloze místní pohromy.
- **Výkon:** rok Vlkova dnes ≈ 19–23 s. Počasí O(1) (memo), ochrana dílů **jednou 1. 4.**,
  výšky nad potokem (`heightAboveStream`, Dijkstra 128²) jednou na krajinu (`WeakMap`), místní
  pohromy počítají rozpis roku jednou (den, místo) a v ostatní dny jsou O(1); požár jedno losování
  dne (součet hazardu staveb). Měřítko: rok Vlkova před a po P2, P3, P5–P9 – nejvýš **+3 %** celkem.
- **Čísla jen v `rules-disasters.ts`** s odkazem na sekci návrhu (`disasters.md – …`); změna
  čísla = i text v návrhu.
- **Kronika:** každý nový druh události v `types-chronicle.ts` dostane text v `chronicleText`
  (`apps/web/lib/village-view-chronicle.ts`) – jinak neprojde `typecheck`. Jedna událost na
  pohromu, ne na díl.
- **Smrt z pohromy** (povodeň od pětisetleté vody, smršť F3–F4) jako smrt na lovu (`hunt.ts`):
  `bury(state, day, p)` (`cemetery.ts`) a `removePeople(state, dead)`, událost `death`
  s `cause: 'flood' | 'tornado'` jde i do štěstí (`happinessEvents` v `simulateDay`).
- **Server je autorita, klient nevidí budoucnost:** `weatherSeed` se nikdy neposílá do
  `VillageView` ani scény; počasí jen to, které už je vidět (`disasters.md – Léto, Zima`, sloupec
  „Kdy je vidět“). Test na JSON pohledu.
- **Hexagon:** doména bez I/O; seed počasí přichází do use-casů z adaptéru sídla (port
  `settlements.ts`), dev „Vynutit …“ přes use-case a server action.
- **Mapa kódu:** nový `docs/code/village-disasters.md` (založí P1) + řádek v tabulce „Mapa kódu“
  v `CLAUDE.md`; pořadí dne do `docs/code/village-core.md`, scéna do `docs/code/scene-village.md`,
  panely do `docs/code/web-ui.md`. Martinova slova s datem, vlastní rozhodnutí „návrh Clauda“.
- **Kalibrace** (`measure-village`) jen na Martinův pokyn – ověřuje se na kopii Vlkova
  (`3af7269a-5efd-4755-bb08-2dc45aa21ea5`, JSON stavu z DB `bohemia` jen čtením, scratchpad
  `diag-disasters/`) a na čerstvých vsích.
- Před commitem `npm run typecheck`, `lint`, `test`, `format:check`; P1 i `test:db`; P10 i
  `test:e2e` (stránky), P11–P13 i `test:e2e` (scéna). Výstupy ořezávat (`| tail`, `grep "Tests "`).

## Výchozí stav kódu (27. 10. 2026, `feat/landscape` 78ba363d)

- **Den vsi:** `simulateDay` v `packages/game/src/domain/village/simulate.ts` (pořadí kroků níž).
  Převody starších vsí v `advanceVillageSteps` a v `application/update-village.ts` (`updateVillage`,
  `updateLivingVillage`).
- **Úroda:** `harvestKg` → `cropYieldKg` (`year-plan.ts`) – `kept = 1 − losses[id].share`,
  osivo celé; `PartLosses = Record<string, { share }>`. Volají `harvestWinter`, `harvest`
  a `harvestSurplus` (`simulate-food.ts`) s `state.wildlife?.damage?.parts`; odhad přídělu
  `expectedWinterKg` a `daysUntilFoodHarvest` (`year-plan.ts`).
- **Úrodnost:** `effectiveFertility` (`fields.ts:53`, strop 100), `FieldPart.fertilityShare`
  0–1 (`types-land.ts`); ořezy `Math.min(1, …)` v `fields.ts:178` (luštěniny) a `fields.ts:196`
  (příloh) – naplavenina nad 1 by se jimi ztratila.
- **Osev a pojistka:** `sowingTargets` (`field-food.ts:153`), `FIELD_STORES.bufferEnergyYears`
  0,5 (`rules-fields.ts`), okna `CROP_WINDOWS` (`rules-fields.ts:218`) po měsících
  (`taskWindowEnd`, `windowEndOf` v `year-plan.ts`).
- **Seno a pastva:** `hay.ts` – `HAY_WINTER_DAYS` 151, `HAY_WINTER_MONTHS`, `isHayWinter`,
  `winterHayKg`, `mowingYieldPerHa`, `planMowing`; louky jsou díly (`isHayMeadow(part, day)`).
  `pasture.ts` – `PASTURE`, `pastureParts`.
- **Zeleň:** `forestEdgeDistances(landscape, state)` a maska lesa `scanLand` (`wildlife-land.ts`);
  vrstva překážek `obstaclesNear`, `obstacleKind`, `TREE_KINDS` (`domain/landscape/obstacles/`);
  změny stromů `obstacleChangesAt`, `fellTrees(state, ids, day)` (`village/obstacles.ts`); sady
  `Orchard` (`types-land.ts`), jabloně u cest `villageRoadApples` (`road-apples.ts`).
- **Terén a voda:** `heightAboveStream(water, heights, size)` a `alluvialness`
  (`domain/landscape/floodplain.ts` – dnes jen pro úrodnost a vegetaci), `surfaceAt`,
  `LANDSCAPE_SIZE` 128, `CELL_SIZE_M` 15 (`landscape/types.ts`), `tileCenterWorld`,
  `tileOfWorldPoint` (`landscape/world.ts`).
- **Stavby a zásoby:** `Dwelling.condition` 0–1 (`types-people.ts`), `recordRuins` a `updateRuins`
  (`ruins.ts`), `decideRebuilds` (`simulate-build.ts`), `repair.ts`; obilné jámy
  `villageGrainPits`, `looseGrainKg` (`grain-pits.ts`), místo jámy `grain-pit-site.ts`.
- **Práce dne:** `villagersToday` (`morning-water.ts`) – lovci dne chybí (`huntFootIds`,
  `hunt-party.ts`); vzor dne mimo práci `planHuntDay` (`hunt.ts:75`).
- **Sousedé:** `seasonSupply`, `neighbourStock` (`neighbours.ts`), ceny v `trade.ts`
  / `rules-trade.ts`. Zvěř: `wildlifeYearDay` (`wildlife.ts`).
- **Seedy:** `createRandom`, `deriveSeed` (`domain/landscape/random.ts`); `VillageState.seed`,
  `foundedDay` (`types-state.ts`); mapa `settlement.landscapeSeed` (`packages/db/src/schema/settlement.ts`).
- **Web:** `buildVillageView`, `sceneOfVillage` (`apps/web/lib/village-view.ts`),
  `village-view-scene-types.ts`, `chronicleText`, `villageNotices` a `NoticeKind`
  (`village-notices.ts`), vzor panelu škod `fieldDamageViews` (`wildlife-view.ts`). Scéna:
  `season-look.ts` (`seasonLook`, `REFERENCE_DAY`), `water.ts` (`WaterSurface`), `pyre-fire.ts`
  (`fireSprites`), `village-smoke.ts` (`VillageSmoke`), `felled-trees.ts`, `structure-decay.ts`,
  `villager-plan-*.ts`, `field-look.ts`, `hay-meadows.ts`, `ambient-sound.ts`. Dev:
  `apps/web/app/dev/landscape/` (vzor `dev-shoeing.ts`, `DevVillagePreview.tsx`).

## Datový model (návrh Clauda)

```ts
// types-disasters.ts
export type SummerWeather = 'good' | 'normal' | 'dry' | 'drought' | 'wet' | 'wetHarvest';
export type WinterWeather = 'normal' | 'blackFrost' | 'long';
export type FloodLevel =
  'small' | 'five' | 'twenty' | 'hundred' | 'twoHundred' | 'fiveHundred' | 'thousand';
/** Roční nejvyšší voda potoka – společná pro kraj (Martin 27. 10. 2026: „Ano a ano“). */
export interface RegionFlood {
  level: FloodLevel;
  season: 'spring' | 'summer';
  month: number;
  day: number;
}
export interface YearWeather {
  year: number;
  summer: SummerWeather;
  winter: WinterWeather;
  flood: RegionFlood | null; // žádná voda = null
}

/** Ochrana dílů spočtená 1. 4. (disasters.md – Ochrana dílu); klíč = id dílu. */
export interface PartProtection {
  year: number;
  green: Record<string, number>; // zeleň 0–1 (kroupy, holomráz)
  dry: Record<string, number>; // zeleň + vlhkost, 0–1 (sucho)
  wet: Record<string, number>; // −0,2 niva / +0,2 svah (deštivé léto)
  frost: Record<string, number>; // zeleň − 0,2 vyvýšené, 0–1 (holomráz)
}

/** Podíly ztráty hrubé úrody po dílech za hospodářský rok – sloučí se se zvěří při sklizni. */
export interface PartDisasterLosses {
  year: number;
  hail: Record<string, number>;
  flood: Record<string, number>;
  tornado: Record<string, number>;
}

export interface DisasterState {
  protection?: PartProtection;
  losses?: PartDisasterLosses;
  hail?: { day: number; strip: Strip }; // poslední krupobití (scéna 30 dní)
  flood?: { day: number; level: FloodLevel; heightM: number; season: 'spring' | 'summer' };
  fire?: FireDay; // dnešní požár a řetěz (jako hunt.today)
  tornado?: { day: number; track: TornadoTrack }; // poslední smršť přes ves
  famineMemoryUntilYear?: number; // pojistka 0,75 (disasters.md – Zásoby a pojistka)
  /** Jen testy a dev („Vynutit zlý rok / pohromu“): přebije los. */
  override?: { weather?: Record<number, Partial<YearWeather>>; local?: ForcedDisaster[] };
}
// types-state.ts: weatherSeed?: number; disasters?: DisasterState;
```

- **Kde žije počasí kraje:** nikde jako stav – `yearWeather(weatherSeed, year)` je čistá funkce;
  ves má jen kopii `weatherSeed` své mapy. Shlukování (×1,25 po zlém létě) přes předchozí roky
  rekurzí omezenou na 8 let zpět (rok −8 ze stacionárního rozdělení) – O(1) a stejné pro všechny
  vsi. Sousedé (`neighbours.ts`) berou počasí z téhož seedu.
- **Seed počasí mapy:** `settlement.weather_seed integer NOT NULL DEFAULT floor(random() *
2147483647)` – nová i stávající sídla dostanou náhodný seed v DB (migrace). Do vsi ho dá
  composition root při zakládání (`found-village.ts`) a při načtení (`withWeatherSeed` v
  `updateVillage`). Klient ho nikdy nedostane.
- **Ztráty dílu:** `dayPartLosses(state, crop, day)` (`disasters.ts`) sloučí počasí s ochranou,
  kroupy, povodeň, smršť a zvěř: share = 1 − Π(1 − share_i) → `PartLosses` pro `harvestKg`,
  `expectedWinterKg` a `daysUntilFoodHarvest` (odhad zná jen to, co už je vidět).

## Pořadí dne – kam kroky patří

V `simulateDay` (`simulate.ts`):

1. `updateLordTraining`, `wildlifeYearDay` (1. 5. – P4 přidá úbytek zvěře po kruté zimě).
2. **`weatherDay(state, day, landscape, obstacles)`** (P1, P2): odhalení počasí v kronice (1. 2.
   holomráz, 1. 3. dlouhá zima, 1. 5. sucho, 1. 6. deštivé / dobré léto, 15. 7. mokré žně);
   **1. 4. ochrana dílů** (`partProtectionDay`).
3. Beze změny až po `husbandryDay` – uvnitř seč a zimní krmení podle počasí (P3).
4. Před `startSeason` (1. 9.): **`famineMemoryDay`** (P3) – po krutém roce pojistka 0,75 na 10 let.
5. `seasonDay`, `lordHelpDay`, `damageWindowStart`.
6. **`localDisastersDay(state, day, landscape, obstacles)`** (P5–P9) – v tomto pořadí: smršť,
   kroupy, povodeň, požár (požár nastaví `disasters.fire` – `villagersToday` pak vrátí bez
   dospělých). Vrací události kroniky včetně úmrtí. Před `startPurchases` a `work()`.
7. `work()` … `finishConstructions`, `decideRebuilds` (přestavba po požáru a smršti od zítřka),
   `updateRuins`. Pohromy nové id nedávají – kontrola `moveGrainFromCoveredPits` beze změny.
8. `eat()` – zásoby už po požáru. Úmrtí z kroku 6 jdou do `happinessEvents` jako `huntEvents`.
9. Sklizeň (31. 7., 31. 8.) – `harvestWinter`, `harvest` a `harvestSurplus` dostanou
   `dayPartLosses` místo `state.wildlife?.damage?.parts`.

## Přehled úloh

| Úloha | Co                                                                    | Kroky |
| ----- | --------------------------------------------------------------------- | ----- |
| P1    | Jádro počasí kraje – seed mapy, roční los, shlukování, převod, dev    | ≈ 120 |
| P2    | Ochrana dílu – zeleň, solitéry, vlhkost, svah                         | ≈ 120 |
| P3    | Sucho, deštivé léto, krutá zima – úroda, seno, pastva, osev, pojistka | ≈ 140 |
| P4    | Kraj kolem vsi – sousedé a ceny, zvěř po zlém roce                    | ≈ 80  |
| P5    | Místní pohromy – rámec, ochrana nové vsi, kroupy                      | ≈ 110 |
| P6    | Povodeň – doba návratu, hloubka, škody, úmrtí, naplavenina            | ≈ 130 |
| P7    | Požár a šíření                                                        | ≈ 120 |
| P8    | Hašení – všichni dospělí, řetěz s vědry                               | ≈ 100 |
| P9    | Smršť (tornádo) – stopa mapy, škody, vývraty                          | ≈ 130 |
| P10   | Rozhraní – lišta, upozornění, kronika, panel dílu, obchod, dev        | ≈ 130 |
| P11   | Scéna – počasí roku: slunce praží, déšť, holomráz, dlouhá zima        | ≈ 140 |
| P12   | Scéna – bouřka s kroupami (tma, blesky) a povodeň                     | ≈ 130 |
| P13   | Scéna – požár s řetězem s vědry, smršť a vývraty                      | ≈ 140 |
| P14   | Ověření na Vlkově a nových vsích                                      | ≈ 80  |

Závislosti: P1 → P2 → P3 → P4; P5 po P2 (zeleň pro kroupy); P6–P9 po P5 (rámec); P8 po P7;
P10 po P3 a P5–P9 (lze po částech); P11 po P3; P12 po P5 a P6; P13 po P7–P9; P14 nakonec. Jeden
proud (sériově), každá úloha vlastní větev z `feat/disasters`.

**Scéna obecně** (`disasters.md – Ve scéně`, Martin 27. 10. 2026: „Jinak je to dobré“): normální
rok = vzhled beze změny (`REFERENCE_DAY` a jeho testy v `season-look.ts`); **animace jen v den
pohromy**, jinak kreslení jen při změně – počasí jde přes `LandscapeScene.updateSeason` (nejvýš
jednou za herní den, `needsRender`), animace dne pohromy v `animate()` v taktu `WATER_FPS`
a při omezeném pohybu stojí. Světlo navazuje na `docs/code/scene.md` – Světlo, Roční období, Den
a noc: počasí je **další násobek** `SeasonLook` (světlo, opar, tráva, voda) a fáze dne
(`dayLight`, `Grade`), ne nové světlo. Server posílá jen odhalené počasí, stupeň a den pohromy;
co je kde (zatopená políčka, pruh krupobití, stopa smrště, řetěz), dostane scéna z
`SceneVillage` nebo spočítá z krajiny.

## Úloha P1 – Jádro počasí kraje (≈ 120 kroků)

**Cíl:** Každá ves mapy má `weatherSeed` a `yearWeather` dává pro rok léto a zimu podle tabulek.
Na úrodu ještě nepůsobí – jen kronika odhalení a dev přepis.

**Soubory:** nové `rules-disasters.ts`, `types-disasters.ts`, `weather.ts`,
`__tests__/weather.test.ts`; úpravy `types-state.ts`, `index.ts`, `simulate.ts`,
`types-chronicle.ts` + `chronicleText`; `packages/db/src/schema/settlement.ts` + migrace
(`npm run db:generate`), adaptér sídel (`packages/db/src/adapters/`), port
`application/settlements.ts`, `application/update-village.ts`, `application/found-village.ts`,
composition root `apps/web/lib/village.ts` (ověřit `grep -rn "updateLivingVillage(" apps/web`);
nový `docs/code/village-disasters.md`, řádek v `CLAUDE.md`.

- [ ] `rules-disasters.ts` – `WEATHER` (léto: šance 25 / 46 / 10 / 4 / 11 / 4 %, násobky ozim,
      jařiny, seno, pastva z tabulky; zima 82 / 9 / 9 %; dny odhalení; shlukování 1,25; průměr
      `expectedYield` 0,95; `historyYears` 8) – `disasters.md – Léto, Zima`; `FLOOD_LEVELS`
      (šance a výšky stupňů, o stupeň výš, okna jarní a letní vody) – `disasters.md – Povodeň`.
- [ ] `weather.ts`: `yearWeather(weatherSeed, year)` – los z `deriveSeed(weatherSeed, 'summer:' +
year)` a `'winter:' + year`, šance zlých let × 1,25 po zlém létě (rekurze 8 let, memo);
      **výška povodně kraje** z `'flood:' + year` (stupeň, o stupeň výš po dlouhé zimě / v mokrém
      létě, jarní nebo letní, den – Martin 27. 10. 2026: „Ano a ano“);
      `isBadSummer`, `isCruelYear`; `weatherOf(state, year)` – přepis `override`, bez `weatherSeed`
      normální rok; `revealedWeather(state, day)` – jen to, co už je vidět.
- [ ] `weatherDay(state, day)` – kronika `weather` (`{ day, kind: 'weather', summer | winter }`)
      v den odhalení; zapojit za `wildlifeYearDay`.
- [ ] DB: sloupec `weather_seed` s náhodným výchozím (Drizzle `default(sql\`…\`)`), migrace
vyplní i stávající řádky; adaptér a port vrací `weatherSeed`; `withWeatherSeed(state, seed)`    (idempotentní – existující seed nemění) v`updateVillage`, `foundVillage` ho nastaví.
- [ ] Testy: četnosti léta a zimy přes 10 000 let ±1 %; po zlém létě zlých víc (×1,25 ±0,05);
      **dvě vsi téže mapy** (týž `weatherSeed`, jiný `seed`) mají 1000 let stejné počasí i povodně;
      četnosti stupňů vody v letech bez posunu ±1 %, po dlouhé zimě jarní a o stupeň výš; jiný seed
      mapy jiné; ves bez `weatherSeed` normální roky; odhalení – 30. 4. sucho nevidět, 1. 5. ano;
      po kouscích přes 1. 5. a 1. 6. stejný stav; adaptér (`test:db`) vrací seed, nový sídlo má
      jiný seed než druhé.
- [ ] Commit `feat(game): počasí roku pro celou mapu ze seedu počasí`.

**Provedení P1 (27. 10. 2026, návrh Clauda):** seed jde do use-casů přes
`VillageRepository.weatherSeedOf(settlementId)` (adaptér vsí čte `settlement.weather_seed`), ne
přes `Settlement` – `updateVillage` i založení vsi ho tak mají bez nového parametru u ~30 volání
a objekt sídla, který web posílá dál, seed nenese. `withWeatherSeed` seed řídí mapou (ves na jiné
mapě dostane její). `inDisasterProtection` (`disasters.ts`, `LOCAL_DISASTERS`) je hotová už
v P1 – P5 ji jen použije. Dlouhodobé četnosti léta a zimy přesně z tabulky: v letech po
nezlém létě jsou zlé šance × 1 ÷ (1 + 0,25 × 0,29).

**Hotovo:** `typecheck`, `lint`, `test`, `test:db`, `format:check`; otisky beze změny.

## Úloha P2 – Ochrana dílu ze zeleně a vlhkosti (≈ 120 kroků)

**Cíl:** 1. 4. má každý díl pole i louky ochranu (zeleň, sucho, mokro, holomráz) podle
`disasters.md – Ochrana dílu`. Zatím jen spočtená a uložená.

**Soubory:** nový `part-protection.ts`, `__tests__/part-protection.test.ts`; `rules-disasters.ts`
(`PROTECTION`: plná do 30 m, nula v 150 m, solitér do 50 m +0,25, remíz ≥ 3 stromy do 15 m,
u vody 60 m nebo do 1,5 m nad potokem +0,2, vyvýšené > 6 m nad potokem a nad průměrem do 45 m
−0,2, svah ≥ 1,5 m na políčko, bez krajiny 0,25); `wildlife-land.ts` (vytáhnout masku lesa ze
`scanLand` do sdílené funkce); `domain/landscape/floodplain.ts` (bez změny – jen import);
`simulate.ts` (`weatherDay`).

- [ ] `greenMask(landscape, state, obstacles, day)` – rastr 5 m kolem vsi: les (maska
      `scanLand`), čtverce sadů (`Orchard`), remízy z vrstvy překážek (`obstaclesNear`, druhy
      `TREE_KINDS` a keře, bez pokácených – `obstacleChangesAt`); distanční transformace 3–4 jako
      `forestEdgeDistances` → vzdálenost středu dílu k zeleni.
- [ ] `solitaires(part)` – stojící stromy bez souseda do 15 m a `villageRoadApples` do 50 m.
- [ ] `streamHeights(landscape)` – `heightAboveStream` z masky vody (`surfaceAt === 'water'`),
      memo `WeakMap<Landscape, Float32Array>`; vyvýšené, u vody, svah po políčku dílu.
- [ ] `partProtectionDay(state, day, landscape, obstacles)` – jen 1. 4. a jen s `weatherSeed`:
      zapíše `disasters.protection`; bez krajiny 0,25 všude.
- [ ] Testy: díl u lesa 1, díl 90 m od lesa 0,5, uprostřed lánu 0; 2 solitéry +0,5; u vody +0,2,
      na hřbetu −0,2, oříznutí 0–1; mokro niva −0,2 a svah +0,2; pokácený remíz se nepočítá;
      Vlkov – čas výpočtu (< 30 ms) a rozdělení ochrany do `docs/code/village-disasters.md`.
- [ ] Commit `feat(game): ochrana dílu před počasím ze zeleně a vlhkosti`.

**Provedení P2 (27. 10. 2026, návrh Clauda):** maska lesa se nevytahovala do samostatné funkce –
`forestEdgeDistances` se rozdělila na `greenEdgeScan(landscape, state, seedTiles)` (les + sady jako
semínka) a starou funkci. Remízy a solitéry se hledají přímo z bodů překážek (ne z rastru 5 m),
přesnost lepší a levnější. Detaily: [village-disasters.md](../../code/village-disasters.md).

## Úloha P3 – Sucho, deštivé léto, krutá zima (≈ 140 kroků)

**Cíl:** Počasí roku mění úrodu, seno, pastvu, krmení a osev; ves seje s průměrem let, seče
s rezervou a po krutém roce drží vyšší pojistku.

**Soubory:** nové `weather-effects.ts`, `disasters.ts` (`dayPartLosses`),
`__tests__/weather-effects.test.ts`, `__tests__/weather-famine.test.ts`; `simulate-food.ts`
(`harvestWinter`, `harvest`, `harvestSurplus`, `eat` – odhad), `year-plan.ts`
(`daysUntilFoodHarvest` volající), `hay.ts` (`mowingYieldPerHa`, `planMowing` +15 %,
`isHayWinter` a `HAY_WINTER_DAYS` podle zimy – nové parametry), `pasture.ts`, `field-food.ts`
(`sowingTargets` × 0,95, pojistka 0,75), `rules-fields.ts` / `year-plan.ts` (okno setí jaře
v dlouhé zimě), `threshing.ts` (výmlat +20 %), `simulate.ts` (`famineMemoryDay`).

- [ ] `partWeatherFactor(weather, crop, protection, partId)` – sucho a holomráz: 1 − (1 − f) ×
      (1 − 0,5 × ochrana); deštivé léto s `wet` (−0,2…+0,2); dobré léto bez ochrany.
- [ ] `dayPartLosses` sloučí počasí (jen odhalené pro odhad, celé při sklizni) se škodou zvěře;
      nahradit `state.wildlife?.damage?.parts` ve sklizni i odhadu.
- [ ] Seno: výnos seče × seno roku × ochrana louky; `planMowing` +15 %; dlouhá zima – krmení do 30. 4. (`isHayWinter(day, weather)`), pastva od 1. 5.; pastva × násobek roku.
- [ ] Osev: `sowingTargets` × `WEATHER.expectedYield`; okno setí jařin v dlouhé zimě o 3 týdny
      později začátek a o 2 týdny konec – `CROP_WINDOWS` jsou po měsících, posun po dnech přes
      `seasonDay` (jař se nezačne set před posunutým dnem); **ověřit, že plán setí nepočítá
      s plným oknem** (riziko níž).
- [ ] `famineMemoryDay` (1. 9. před `startSeason`) – krutý rok → `famineMemoryUntilYear` +10;
      pojistka `bufferEnergyYears` 0,75 do té doby.
- [ ] Výmlat v deštivém létě +20 % práce (vlhké snopy).
- [ ] Testy: vynucený sled let na ustálené testovací vsi (`override`) – [normální × 10] bez hladu,
      [krutý] 0 úmrtí hladem, [krutý, krutý] úmrtí 10–25 % a ves žije; díl u lesa v krutém suchu
      ×0,75, uprostřed lánu ×0,5; dlouhá zima – seno do 30. 4.; paměť hladu 10 let; po kouscích
      přes 31. 7. a 31. 8.; ves bez `weatherSeed` beze změny (otisky stejné).
- [ ] Commit `feat(game): zlé roky – sucho, deštivé léto a krutá zima`.

**Hotovo:** jako P1; rok Vlkova změřit (nejvýš +1 %).

**Provedení P3 (27. 10. 2026, návrh Clauda):** dopady v `weather-effects.ts`, ztráty dílů
`dayPartLosses` / `winterEstimateLosses` v `disasters.ts`; `protectionAgainst` a
`partProtectionOf` se přestěhovaly z `part-protection.ts` do `weather-effects.ts` (re-export
zůstal) – jinak kruhový import přes `livestock.ts`. Seno: plán seče počítá v běžném výnosu
(potřeba × 1,15 ÷ seno roku, které je vidět), skutečné seno přičte `mow` × seno roku s ochranou
luk. **Okno setí jařin v dlouhé zimě:** začátek o 3 týdny později (22. 3.), konec levnou cestou
(oprava recenze P3, návrh Clauda): dohra 1.–14. 5. jen pro díly, které už jsou v práci
(`springSowingExtended`; okna `CROP_WINDOWS` po měsících zůstala). Oprava recenze také: rozhodnutí
vsi (porážka, výcvik) jen podle odhalené zimy, pastva od 1. 9. bez letošního léta. Plán setí 1. 9. dlouhou zimu nezná, takže s plným oknem počítá – **Vlkov v dlouhé zimě
nestihne zasít všechno: jař −19 %** (návrh dopad na úrodu nečeká – otevřené). `weather-famine.test.ts` nevznikl – testovací ves bez krajiny
nemá pole ani ustálený stav; cíle kalibrace (jeden a dva kruté roky) ověřuje Vlkov ze stavu DB.
Detaily: [village-disasters.md](../../code/village-disasters.md).

## Úloha P4 – Kraj kolem vsi: sousedé a zvěř (≈ 80 kroků)

**Cíl:** Sousedé ve stejném kraji mají po zlém roce méně obilí a dražší; zvěř po kruté zimě
ubude.

**Soubory:** `neighbours.ts` (`seasonSupply`, `neighbourStock`), `trade.ts` / `rules-trade.ts`
(ceny – ověřit `grep -n "price" trade.ts`), `rules-disasters.ts` (`DISASTER_TRADE`),
`wildlife.ts` (`wildlifeYearDay`), testy `__tests__/trade-weather.test.ts`.

- [ ] Doplnění 1. 11. po zlém roce ½ obilí a cena ×1,5 (ostatní zboží v kg obilí ×0,67), po krutém
      ¼ a ×2 (×0,5).
- [ ] 1. 5. po holomrazné nebo dlouhé zimě −10 % jelení a −15 % prasat navíc; v krutém suchu
      poloviční selata.
- [ ] Testy: ceny a zásoba podle roku, beze změny bez `weatherSeed`; zvěř po kruté zimě.
- [ ] Commit `feat(game): sousedé a zvěř podle počasí kraje`.

## Úloha P5 – Rámec místních pohrom a kroupy (≈ 110 kroků)

**Cíl:** `localDisastersDay` s ochranou nové vsi, rozpisem roku a slučováním ztrát; kroupy
potlučou díly v pruhu.

**Soubory:** `disasters.ts` (`localDisastersDay`, `inDisasterProtection`, `yearSchedule` – memo),
nový `hail.ts`, `__tests__/hail.test.ts`, `__tests__/disasters-protection.test.ts`;
`rules-disasters.ts` (`HAIL`, `LOCAL` – 5 let), `simulate.ts`, `orchard.ts` (letošní jablka),
stav staveb (`Dwelling.condition`, dílny), `types-chronicle.ts` (`hail`).

- [ ] Rozpis roku ze `'hail:' + year`: šance 6 %, den 1. 6. – 31. 8., pruh 300 m (směr, posun
      v okolí vsi), okraje 50 m.
- [ ] V den krupobití: nesklizené díly a louky v pruhu `hail[partId]` = 0,6 (okraj 0,3) ×
      (1 − 0,4 × zeleň); sad −40 % letošních jablek; stavby v pruhu − roční chátrání.
- [ ] `inDisasterProtection(foundedDay, day)` – 5 let (hotová v P1); testy pro všechny místní pohromy
      (rozhraní připravené pro P6–P9).
- [ ] Testy: četnost 6 % přes 2000 let; ves ve 3. roce nic, v 6. ano; strom chrání (zeleň 1 →
      −36 %); sklizený díl nic; po kouscích přes den krupobití; dvě vsi téže mapy – jiné kroupy.
- [ ] Commit `feat(game): kroupy v pruhu přes okolí vsi`.

## Úloha P6 – Povodeň (≈ 130 kroků)

**Cíl:** Roční nejvyšší voda podle doby návratu zaplaví políčka pod svou výškou; škody podle
hloubky, úmrtí od pětisetleté vody, naplavenina hnojí.

**Soubory:** nový `flood.ts`, `__tests__/flood.test.ts`; `rules-disasters.ts` (`FLOOD` – tabulka
výšek a šancí, škody po hloubce, úmrtí 2 %, naplavenina, strop 1,3, jámy nad 1,2 m);
`part-protection.ts` (`streamHeights` – sdílené), `fields.ts` (ořezy 178 a 196 nesmí srazit
`fertilityShare` nad 1 – `Math.min(Math.max(1, share), …)`), `grain-pit-site.ts` (jámy ne pod
1,2 m), `grain-pits.ts` (zrno −25 %), `ruins.ts` (zřícené stavby), `hunt.ts` vzor smrti.

- [ ] Výška, jaro / léto a den vody z počasí kraje – `weatherOf(state, year).flood` (P1; Martin 27. 10. 2026: „Ano a ano“ – výška společná pro celý kraj, tentýž potok); P6 počítá jen
      škody po vsi.
- [ ] V den povodně: hloubka po políčku = výška vody − výška nad potokem; díly (úroda a ozim),
      louky, stavby (−10 / −30 / −60 %, zemnice −30 / −60 % / zřícení), jámy, naplavenina
      (+0,1 / 0,2 / 0,3 do 1,3); od 3 m úmrtí 2 % na obyvatele zatopeného obydlí
      (`'flood-death:' + day`).
- [ ] Bez krajiny povodeň není (žádné výšky) – kalibrace beze změny.
- [ ] Testy: četnosti stupňů přes 10 000 let; stupeň výš po dlouhé zimě; zatopení podle výšky
      (umělá krajina se známými výškami); dvě vsi téže mapy – stejná voda týž den, jiné škody;
      naplavenina se strop 130 % a nepropadne příloh ani
      luštěniny; jáma pod 1,2 m se nekope; úmrtí jen od 500leté; ochrana 5 let; po kouscích.
- [ ] Commit `feat(game): povodeň potoka podle doby návratu`.

## Úloha P7 – Požár a šíření (≈ 120 kroků)

**Cíl:** Stavba chytí podle hazardu, oheň přeskakuje na sousedy, shoří stavba, zásoby domu
a stohy; přestavba jako po rozpadu. Zatím bez hašení (účinnost 0).

**Soubory:** nový `fire.ts`, `__tests__/fire.test.ts`; `rules-disasters.ts` (`FIRE` – 0,4 %,
násobky, přeskok 6 m 70 % / 12 m 40 %, zeleň ½, stoh 12 m); `ruins.ts`, `simulate-build.ts`
(`decideRebuilds` – přestavba po požáru), `grain-pits.ts` (`looseGrainKg`), `hay.ts` (seno
stohu), `placement-geometry.ts` / `polygon.ts` (vzdálenost obrysů – ověřit), `types-chronicle.ts`
(`fire`).

- [ ] Hazard dne = Σ šance staveb ÷ 365 s násobky (sucho, kovárna, milíř, pec, zemnice, zima,
      mokré léto); jedno losování `'fire:' + day`, výběr stavby podle součtu.
- [ ] Šíření **řetězově** v kolech (`'fire-spread:' + day`; Martin 27. 10. 2026: „Ano a ano“):
      každá nově hořící stavba zkusí sousedy jednou (do 6 m 70 %, do 12 m 40 %);
      zeleň na spojnici (strom, keř, sad) šanci půlí; × (1 − 0,7 × účinnost) (P8).
- [ ] Dopad: stav podle účinnosti (zatím zřícení), zásoby domu (zrno mimo jámy, maso, sýr ÷ obydlí),
      stoh do 12 m (seno ÷ stohy); obyvatelé k příbuzným; nikdo neumírá.
- [ ] Testy: četnost u vsi 15 domů ≈ 6 % / rok; kovárna ×3; rozestup 15 m nepřeskočí, 5 m
      přeskočí 70 %; řetěz se zastaví na zeleni; jámy přečkají; ochrana 5 let; po kouscích.
- [ ] Commit `feat(game): požár staveb a šíření ohně`.

## Úloha P8 – Hašení řetězem s vědry (≈ 100 kroků)

**Cíl:** V den požáru hasí všichni dospělí; řetěz od nejbližší vody, účinnost podle rozestupu.

**Soubory:** nový `firefighting.ts`, `__tests__/firefighting.test.ts`; `fire.ts`;
`morning-water.ts` (`villagersToday` – v den požáru bez dospělých), `simulate-work.ts` /
`labor.ts` (práce dne 0 – ověřit, že rozvrh `labor` nese hasiče pro scénu), `rules-disasters.ts`
(`FIREFIGHTING` – 2,5 m, 70 %, 50 %).

- [ ] `nearestWater(landscape, point)` – nejbližší vodní políčko (střed na břehu); bez krajiny
      výchozí vzdálenost 80 m (návrh Clauda).
- [ ] `bucketChain(state, day, target)` – dospělí, rozestup = vzdálenost ÷ dospělí, podávají
      (≤ 2,5 m) / nosí; účinnost = min(1; 2,5 ÷ rozestup); uložit `disasters.fire.chain` (body
      pro scénu: voda, cíl, pozice lidí).
- [ ] `fire.ts` – přeskok × (1 − 0,7 × účinnost), stav hořící stavby −(1 − 0,5 × účinnost),
      zásoby ve stejném poměru.
- [ ] Testy: 40 dospělých na 100 m účinnost 1, 20 → 0,5; plný řetěz – dům 50 %; ten den žádná
      jiná práce (`labor` prázdný mimo hašení); po kouscích.
- [ ] Commit `feat(game): hašení – celá ves v řetězu s vědry`.

## Úloha P9 – Smršť (≈ 130 kroků)

**Cíl:** Stopy smrští mapy ze seedu počasí; ves, přes kterou stopa přejde (mimo ochranu 5 let),
má škody podle síly.

**Soubory:** nový `tornado.ts`, `__tests__/tornado.test.ts`; `rules-disasters.ts` (`TORNADO` –
0,5 / 10 000 km² ročně, podíly F0–F4, délky a šířky ±50 %, směr převážně JZ → SV, škody po síle,
úmrtí F3 1 %, F4 3 %); `obstacles.ts` (`fellTrees` – vývraty jako pokácené, klády), `orchard.ts`,
`road-apples.ts` (obnova), `ruins.ts`, `hay.ts` (stohy), `hunt.ts` vzor smrti, `types-chronicle.ts`
(`tornado`).

- [ ] `yearTornadoes(weatherSeed, year)` – Poissonův počet ve čtverci mapy rozšířeném o 30 km,
      střed, směr, síla, délka, šířka, den (V–VIII, nejvíc VII); jen stopy, které protnou mapu;
      memo. Souřadnice mapy (`tileCenterWorld`).
- [ ] V den smrště: stavby, díly, stromy (vrstva překážek + sad + jabloně) a stohy v pásu podle
      tabulky síly; úmrtí `'tornado-death:' + day`.
- [ ] Testy: četnost přes mapu ≈ 0,10 % ročně (Monte Carlo 200 000 let ±15 %), přes jádro vsi
      ≈ 0,017 %; **dvě vsi téže mapy vidí stejnou stopu**; F0 jen střechy, F2 zřícení, F3 úmrtí;
      vývraty zmizí z překážek a dají klády; ochrana 5 let; vynucená smršť (`override`) po kouscích.
- [ ] Commit `feat(game): smršť se stopou přes mapu`.

## Úloha P10 – Rozhraní (≈ 130 kroků)

**Cíl:** UI jako 0 A.D. – ikony s čísly, slova jen v `Tooltip`.

**Soubory:** nový `apps/web/lib/disasters-view.ts` (`weatherView`, `partProtectionView`,
`disasterNotices`), `village-view.ts` (`buildVillageView` – jen odhalené počasí, **bez
`weatherSeed`**), `village-view-types.ts`, `village-notices.ts` (`NoticeKind`: `drought`,
`wet-harvest`, `black-frost`, `hail`, `flood`, `fire`, `fire-out`, `tornado`; i z jiné vsi
hráče – `otherVillageNotices`), `village-view-chronicle.ts`, komponenty HUD (horní lišta – ikona
počasí; panel dílu – ikona ochrany a řádky odhadu jako `fieldDamageViews`; obchod – ikona
zdražení), ikony (`tools/blender/icons.py` nebo SVG – ověřit vzor), dev
`apps/web/app/dev/landscape/` (tlačítka „Vynutit zlý rok“ a „Vynutit pohromu“ přes server action
a use-case – vzor `dev-shoeing.ts`), e2e.

- [ ] Upozornění „Sucho – nejvíc trpí pole bez stromů“ (Martin 27. 10. 2026), „Mokré žně“,
      „Holomráz – ozim vymrzá“, „Kroupy potloukly obilí“, „Povodeň“ (velikost v popisku), „Hoří!“,
      „Vyhořel dům“, „Smršť“.
- [ ] Test: JSON `VillageView` neobsahuje `weatherSeed` ani budoucí počasí (30. 4. sucho chybí).
- [ ] e2e: dev vynucené sucho – ikona na liště a upozornění; panel dílu ukazuje ochranu.
- [ ] Commit `feat(web): počasí a pohromy v rozhraní`.

## Úloha P11 – Scéna: počasí roku a světlo (≈ 140 kroků)

**Cíl:** Sucho, deštivé léto, holomráz a dlouhá zima jsou vidět; v suchu **slunce praží**
(Martin 27. 10. 2026: „Když je sucho, šlo by nějak zintenzivnit světlo ve scéně? Ať to vypadá,
že slunce opravdu praží?“).

**Soubory:** `village-view-scene-types.ts` (`SceneWeather` – odhalené léto a zima, síla, ochrana
dílů jako 0–4), `village-view-scene.ts`, `season-look.ts` (vstup `weather` do `seasonLook` –
nové složky: sucho 0–1, mokro 0–1, jinovatka, posun jara; testy), `day-light.ts` (násobek
slunce a stínů v suchu), `sun-shadows.ts` (ostřejší stíny = síla stínů, ne nová mapa),
`season-materials.ts` (tráva žlutá a hnědá podle sucha, tmavší a sytější v mokru, jinovatka bez
sněhu), `field-look.ts` / `field-crops.ts` (nižší a řidší obilí, chráněné díly zelenější,
polehlé obilí, řídký ozim s hlínou po holomrazu), `water.ts` (méně vody v potoce, menší tůně),
nový `rain.ts` (částice deště ve dnech deště, zataženo), `ground-layers.ts` nebo
`terrain-shader.ts` (kaluže na cestách a v nivě), `gamma-fog.ts` (vybledlý opar), volitelně
tetelení vzduchu (post-proces jen v poledne suchého dne – změřit cenu, jinak vynechat),
`ambient-sound.ts` (déšť).

- [ ] `seasonLook(day, weather?)` – bez počasí přesně dnešní výstup (test proti `REFERENCE_DAY`);
      sucho = jasnější a žlutější slunce, vyšší kontrast stínů, vybledlá obloha a opar; mokro =
      šedé světlo, víc oparu; dlouhá zima = sníh do dubna, jaro o 3 týdny později.
- [ ] Dny deště v deštivém létě – ze seedu dne v prohlížeči (jen vzhled, ne pravidla).
- [ ] Barva dílu podle ochrany (díl za stromy zelenější).
- [ ] e2e (dev vynucené kruté sucho a deštivé léto): snímek se liší od normálního roku, normální
      rok beze změny; draw cally (`measure-scenery-culling.ts`) bez nárůstu mimo déšť.
- [ ] Do `docs/code/scene.md` (Roční období – počasí) a `docs/code/village-disasters.md`.
- [ ] Commit `feat(web): sucho s pražícím sluncem, déšť a krutá zima ve scéně`.

## Úloha P12 – Scéna: bouřka s kroupami a povodeň (≈ 130 kroků)

**Cíl:** Martin 27. 10. 2026: „Když přijde bouřka s kroupami, chci, aby scéna potemněla
a blýskalo se.“ Povodeň rozlije vodu do výšky dané stupněm.

**Soubory:** `village-view-scene-types.ts` (`SceneHail` – den a pruh, `SceneFlood` – den, výška,
období), nový `storm.ts` (v den krupobití tmavá mračna, ztmavení celé scény jako násobek světla
`dayLight` / `Grade`, **záblesky světla scény** – krátké zvýšení světla a okolního světla, ne jen
obloha; bílé kroupy v pruhu jako částice a bílý pás na zemi), `field-crops.ts` (pruh potlučených
a polehlých polí do žní), `orchard-renderer.ts` (sad bez jablek), `structure-decay.ts` /
`dwelling-decay.ts` (poškozené střechy), `water.ts` (plocha vody povodně nad zatopenými
políčky – políčka z krajiny a výšky vody, 3 dny, pak ustupuje), `ground-layers.ts` (hnědé bahno
a naplavenina 2 týdny), `felled-trees.ts` nebo dekorace (naplavené větve), `ambient-sound.ts`
(hrom, kroupy).

- [ ] Animace bouřky a ústupu vody **jen v den pohromy** (`animate()` v taktu `WATER_FPS`),
      záblesky deterministicky z času dne; při omezeném pohybu bez záblesků (jen ztmavení).
- [ ] Výška vody v popisku (`SceneFlood.heightM`) – UI z P10.
- [ ] e2e: dev vynucené kroupy – scéna tmavší, pruh vidět; vynucená povodeň – voda nad políčky.
- [ ] Commit `feat(web): bouřka s kroupami a povodeň ve scéně`.

## Úloha P13 – Scéna: požár s řetězem s vědry a smršť (≈ 140 kroků)

**Soubory:** `clearing-fire.ts` a `clearing-fire-renderer.ts` (**znovu použít oheň z klučení**
pro hořící dům a stoh), `village-smoke.ts` (hustý dým nad domem), `villager-plan-events.ts` /
nový `villager-plan-fire.ts` (řetěz z `SceneVillage` – body od vody k ohni, lidé rovnoměrně;
do 2,5 m podávají vědro, jinak chodí každý po svém úseku), rekvizita vědra (jako prut rybářů –
**WebGPU limit 8 vertex bufferů**, vědro jako samostatný mesh u kosti), model vědra (CC0 nebo
0 A.D., licence do `LICENSES.md`), `dwelling-pit.ts` / `ruins` (ohořelé trosky do obnovy),
nový `tornado-funnel.ts` (tmavý trychtýř s vířícím prachem přejde stopou za pár sekund),
`felled-trees.ts` (pruh vývratů – padlé kmeny), `hay-meadows.ts` / `pen-renderer.ts` (rozmetané
stohy), `field-crops.ts` (polehlá pole), `structure-decay.ts` (poškozené a zřícené stavby),
`ambient-sound.ts` (praskání ohně, hukot).

- [ ] Babylon importy z konkrétních modulů; animace jen v den pohromy, jinak kreslení při změně;
      stínová mapa se překreslí jednou po změně vrhačů (vývraty, zřícené stavby).
- [ ] e2e: dev vynucený požár – plameny a řada lidí s vědry; vynucená smršť – trychtýř a vývraty.
- [ ] Commit `feat(web): požár s řetězem s vědry a smršť ve scéně`.

## Úloha P14 – Ověření na Vlkově a nových vsích (≈ 80 kroků)

- [ ] Kopie Vlkova (JSON z DB `bohemia` jen čtením) → dopočet 50 let s `weatherSeed`: počet
      zlých a krutých let, hlad, úmrtí hladem, škody pohrom; rok Vlkova ≤ +3 % proti stavu před P1.
- [ ] Vynucené sledy na Vlkově: [krutý], [krutý, krutý], povodeň stoletá, požár, smršť F2 –
      hlad, porážka, hašení, přestavba, kronika.
- [ ] Tři čerstvé vsi: prvních 5 let bez místních pohrom; krutý rok ve 2. roce – dospělí
      nehladoví k smrti (osadnické zásoby).
- [ ] Výsledky do `docs/code/village-disasters.md` (Vlkov) a tabulka pro Martina; kalibraci
      `measure-village --variant disasters` jen na Martinův pokyn.

**Kritéria hotovo:** cíle kalibrace 1–5 z `disasters.md – Kalibrace` na Vlkově a nových vsích
(bez `measure-village`), výkon v mezích, žádná změna otisků krajiny a překážek.

## Rizika

- **Kalibrace** – Martin 26. 10. 2026: ves **za normálních okolností nehladoví**. Počasí přidá
  rozptyl; průměr 0,95 vyrovná osev s průměrem. Kdyby [normální × 10] na Vlkově nebo ustálené
  vsi hladověl, je to úkol dvojpolí a čísel úrody (před pohromami), ne pohrom – zastavit P3
  a zeptat se Martina.
- **Výkon** – rok Vlkova ≈ 19–23 s. Riziko: ochrana dílů (rastr 5 m) a výšky nad potokem; obojí
  jednou ročně / jednou na krajinu. Požár: denní losování musí zůstat O(1) – hazard staveb
  přepočítat jen při změně staveb.
- **Determinismus po kouscích** – rozpis místních pohrom roku musí záviset jen na seedu a roce,
  ne na stavu z prvního dne dopočtu (stav ve dni pohromy ano). Smršť a počasí jako čisté funkce
  s memo – memo nesmí nést stav vsi.
- **Bezpečnost** – `weatherSeed` nesmí do klienta (VillageView, scéna, dev stránky, které posílají
  celý stav – ověřit `grep -rn "JSON.stringify(state" apps/web`).
- **Okna setí po měsících** – posun setí jaře o 2–3 týdny v dlouhé zimě nejde přes `CROP_WINDOWS`;
  plán setí (`sowingTargets`, `planLoad`) nesmí počítat s nedosažitelnou kapacitou okna.
- **Úrodnost nad 1** – `fertilityShare` > 1 po naplavenině: ořezy v `fields.ts`, `rotation.ts`
  (`fallowReady`), `part-rotation.ts` a `holdings.ts` (sloučení dílů) zkontrolovat; efektivní
  úrodnost má strop 100.
- **Scéna** – limit 8 vertex bufferů postavy (vědro), Babylon jen z modulů, kreslení jen při změně.
- **Zlaté otisky** se nezmění, dokud testovací ves nemá `weatherSeed`; úlohy, které je změní
  záměrně, zapíší nový otisk s komentářem (datum, proč, dřívější hash).

## Otevřené podrobnosti (návrh Clauda – nebrzdí)

- Čísla škod povodně podle hloubky a smrště podle síly.
- Mokré žně: ledger má „obilí ×0,6“ (ozim i jařiny), noční tabulka měla jařiny ×0,65 – plán bere
  ledger; kdy je vidět, že jsou žně mokré (15. 7.).
- Výmlat +20 % v celém deštivém létě (i mírném).

## Mimo plán

Dobytčí mor (fáze 2), epidemie lidí, sarančata, pevné historické události (Martin 27. 10. 2026:
„Ne“), požár lesa, předpověď počasí, změna krajiny povodní.
