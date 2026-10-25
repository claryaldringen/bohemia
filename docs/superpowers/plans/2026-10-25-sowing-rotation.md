# Osevní postup po dílech místo ročního plánu – plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cíl:** Ves nemá roční plán osevu k 1. 9. Každý díl ví, co na něm poroste příště (první osev
oběhu – ozim, nestihne-li ozim, jař; po ozimu jař; po jaři úhor; odpočatý úhor ≥ 95 % zase první
osev; luštěniny a len místo jaře). Ves v oknech obdělá všechno, co je na řadě, dokud stačí lidé
a spřežení; co nestihne, zůstane na další sezónu. Práce **nutných dílů** (potřeba úrody proti
hladu) jde před stavbami, práce **dílů nad potřebu** po stavbách – když stavba přijde, ves o část
jejich úrody přijde. Seno beze změny.

**Architektura:** Roční plán (`YearPlan` – rozhodnutí k 1. 9. a evidence práce) se rozdělí:
rozhodnutí zmizí, evidence práce zůstane jako **hospodářský rok** `Season` (1. 9. – 31. 8.) se
seznamem plodin `SeasonCrop` – na plodinu nejvýš jedna nutná a jedna nad potřebu. `CropWork`
(potřebná a hotová práce po úlohách, pořadí dílů, orba po pásech, vozy) se nemění – na něm stojí
postup po čtvercích, scéna, rozdělení práce i sklizeň. Díly do `Season` přibývají den po dni
podle čistých funkcí v novém `rotation.ts` (postup dílu, plodina dne, výběr nutných dílů). Zmizí
`planYear` (výběr), `joinFinishedParts`, `trimPlan` + `plan-trim.ts`, `extra-sowing.ts`,
`chooseCrops` s kapacitou plánu a `YearPlan.extra` / `CropWork.extraLeft` / `ExtraPart`.

**Stack:** TypeScript, doména a use-casy – Vitest (`packages/game`), web – Vitest a Playwright.
Drizzle se nemění – stav vsi je `jsonb`, **žádná migrace**; převod starších vsí v řetězu převodů.

**Spec:** [docs/design/fields.md](../../design/fields.md) – „Osevní postup po dílech a setí do
konce okna (25. 10. 2026)“ (návrh Clauda, Martin 25. 10. 2026: „Ano“). Navazuje na Pletí jednou
v květnu (souběžná větev `feat/weeding-once`).

## Globální omezení

- **Nové části stavu volitelné**, převod starších vsí jednou a idempotentně (`withSeason`
  v řetězu `advanceVillageSteps` v `simulate.ts` – za `withThreshingGrace` – i v
  `application/update-village.ts`).
- **Determinismus:** postup dílu, výběr nutných dílů, podíl rodiny i páry k rádlům jsou čisté
  funkce stavu a dne; žádná nová náhoda. Každá úloha, která mění chování, má test „po kouscích“
  (1 den, 7 dní, 30 dní, celé – stejný stav).
- **Výkon:** denní krok nesmí zpomalit. Potřeba úrody (`fieldSowingTargets` – výhled lidí po
  měsících) se počítá jen 1. 9. – 30. 4. (jako dnes `trimPlan`), výběr nutných dílů jen v den,
  kdy je některé okno přípravy nebo setí otevřené a existuje díl na řadě; bez O(dílů²).
  Měřítko: dopočet Vlkova 8 let před a po (`advanceVillage`, čas) – nejvýš +10 %.
- **Čísla jen v `rules*.ts`** – návrh nová čísla nezavádí (úrodnost, okna a sazby zůstávají).
- **Testy:** doména s in-memory stavem, žádné mocky Drizzlu. Testy, které hlídají zrušená
  pravidla (kapacita plánu, zkrácení, osev navíc), se smažou nebo přepíšou na postup – seznam do
  těla commitu. Zlaté otisky `smith-golden.test.ts` (`573d22e4`) a `craft-skill-golden.test.ts`
  (`1661516a`) se v Úlohách 3–5 změní záměrně – nový otisk s komentářem (datum, proč, dřívější
  hash) jako dosud. Otisky krajiny a překážek se nemění (žádná vrstva).
- **Souběžná větev `feat/weeding-once`** (pletí jednou v květnu, jen jař, luštěniny a len): sloučit
  ji do `feat/sowing-rotation` **před Úlohou 3**. Úlohy berou okna z `CROP_WINDOWS`, takže pravidla
  pletí přejímají samy; konflikty čekej v `rules-fields.ts`, `simulate-work.ts`
  (`weedChildren`), `fields.md` (Pletí) a `flax.test.ts`.
- **Mapa kódu:** každá úloha zapíše změny do `docs/code/village-fields.md` (Ozim a jař – první
  odstavec se přepíše celý), `village-core.md` (Pořadí práce dne), `village-livestock.md` (orba,
  spřežení) – ne do `CLAUDE.md`. V dokumentech „návrh Clauda“, Martinova slova s datem.
- **Kalibrace** (`measure-village`) jen na Martinův pokyn a v noci; ověření Úlohy 9 je dopočet
  kopie Vlkova, ne kalibrace.
- Před commitem `npm run typecheck`, `lint`, `test`, `format:check`; v Úloze 7 i `test:e2e`.
  Výstupy ořezávat (`| tail`, `grep "Tests "`).

## Soupis – co dnes závisí na plánu

`grep -rn "\.plan\b\|YearPlan\|planCrops" packages apps` (bez `node_modules`) = **370 míst
v 60 souborech**; z toho 24 míst v 12 souborech jsou jiné „plány“ (svatba, pohřeb, nákup
u sousedů `o.plan`, vozová cesta `plan.cleared`, seč v `hay.ts`, scéna zvířat). **Skutečně
346 míst ve 48 souborech – 107 ve 23 zdrojových, 239 ve 25 testech.** Širší API plánu
(`CropWork`, `fieldTasks`, `chooseCrops`, `sowingCapacity`, `lordHelp`, `threshingFromPlan`,
`wantedPloughPairs`, `fallowBeforePlan`…) používá 41 zdrojových souborů. Cesty bez předpony jsou
v `packages/game/src/domain/village/`.

| Oblast                       | Soubory                                                                                                                                                                                                                                                                                                              | Co se stane                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typy a stav                  | `types-construction.ts` (`YearPlan`, `CropWork.extraLeft`, `ExtraPart`, `LordHelp`), `types-state.ts` (`plan`, `threshingFromPlan`), `types-land.ts` (`fallowBeforePlan`), `departure.ts`, `actions.ts`, `application/leave-village.ts`                                                                              | `Season`, `SeasonCrop`, `FieldPart.next`; `ExtraPart`, `extraLeft` pryč; `fallowBeforePlan` → `fallowBeforeSeason`                                        |
| Rozhodnutí k 1. 9.           | `simulate-plan.ts` (`planYear`, `joinFinishedParts`, `trimPlan`, `springLordHelp`, `cropsKey`, `wantedPloughPairsOf`), `sowing.ts` (`chooseCrops`, `chooseLegumes`, `chooseFlax`, `flaxFirst`, `fits*`, `planLoad`), `plan-trim.ts`, `extra-sowing.ts`, `year-plan.ts` (`createYearPlan`), `simulate.ts` (kroky 1–3) | zrušit; řazení lnu a luštěnin a `extraSowingCrop` přejdou do `rotation.ts`; `sowingCapacity` a `lordSowingHelp` zůstanou pro podíl rodiny a páry k rádlům |
| Práce dne                    | `simulate-work.ts` (`fieldTasks`, `springHarvestAhead`, volání `extraSowingDay`, `settlePloughTeams`), `labor.ts` (`lordHelp`), `labor-report.ts` (`DayWork.extraField`), `harvest-hands.ts`, `lord.ts`, `morning-water.ts`, `simulate-hauls.ts`                                                                     | nutné plodiny v sezónních úlohách, plodiny nad potřebu v kroku po stavbách; `extraField` → `surplusField`                                                 |
| Sklizeň, výmlat, jídlo       | `simulate-food.ts` (`harvestWinter`, `harvest`, `endThreshing`), `threshing.ts`, `flax.ts` (`harvestFlax`), `year-plan.ts` (`harvestKg`, `expectedWinterKg`, `daysUntilFoodHarvest`), `diet.ts`, `emergency-slaughter.ts`, `field-food.ts`                                                                           | sklizeň po všech plodinách sezóny i nad potřebu; výhled jídla z nutných i nad potřebu (zaseté); `sowingTargets` beze změny                                |
| Orba a spřežení              | `oxen.ts` (`finishPlanByHoe`), `plough-trip.ts`, `plough-blocks.ts` (`ploughLayout`), `year-plan.ts` (`ploughToHoe`, `tilledShare`, `ploughsThisYear`), `draft.ts`, `husbandry.ts`, `summary.ts`, `carts.ts`                                                                                                         | pásy po dávkách dílů, spřežení po plodinách sezóny, páry k rádlům z postupu                                                                               |
| Díly                         | `fields.ts` (`endOfSeason`, `sowingGroup`, `sowingOrder`), `holdings.ts` (`sowingBlocks`), `land-taken.ts` (`shrinkInPlan`, `dropFromWork`, `giveWayToBuilding`)                                                                                                                                                     | `rotateAfterSeason`, `moveParts` (přesun dílů mezi plodinami s hotovou prací)                                                                             |
| Seno                         | `husbandry.ts` (`mowingNeed`, `mowableHerdHayKg`), `hay.ts` (`recordMowingLabor` z `mowWork + allocation.common`)                                                                                                                                                                                                    | beze změny – ověřit, že zápis volné práce na seč nebere práci dílů nad potřebu                                                                            |
| Obilné jámy, ranní voda      | `simulate-work.ts` (`springHarvestAhead`), `morning-water.ts` (dny orby)                                                                                                                                                                                                                                             | jen přes `seasonCrops`                                                                                                                                    |
| Scéna a panely               | `field-progress.ts` (`fieldPartLooks`, `fieldFrontiers`, `partYearWork` – `extra`), `apps/web/lib/village-view-fields.ts`, `village-view-types.ts`, `village-view-crafts.ts`, `selection-details.ts`, `components/game/hud/SelectionPanel.tsx`, `app/dev/landscape/dev-holdings.ts`                                  | `surplus` místo `extra`, nový údaj Příště a Na řadě                                                                                                       |
| Skripty                      | `packages/game/scripts/measure-village.ts`, `scripts/lib/steady-state.ts` (`winterHectares` napodobuje `chooseCrops`), `scripts/village-calculator.ts`, `scripts/measure-holdings.ts`                                                                                                                                | přepsat na postup                                                                                                                                         |
| Testy (25 souborů, 239 míst) | nejvíc `simulate` 41, `oxen` 19, `field-progress` 19, `extra-sowing` 18, `land-taken` 17, `plan-trim` 16, `plough-blocks` 15, `lord-sowing` 14, `flax` 12, `sowing` 11, `field-like-land` 10                                                                                                                         | `plan-trim`, `extra-sowing` a výběrové části `sowing`, `lord-sowing`, `emergency-sowing`, `flax`, `legumes` přepsat na postup; ostatní jen názvy          |
| Dokumentace                  | `docs/code/village-fields.md`, `village-core.md`, `village-livestock.md`, `docs/design/lord.md` (Kdy jde rodina na pole, bod 1), `oxen.md` (Kolik volů ves chce)                                                                                                                                                     | přepsat odstavce o plánu                                                                                                                                  |

## Datový model (návrh Clauda)

```ts
// types-construction.ts – místo YearPlan
/** Práce jedné plodiny hospodářského roku; surplus = díly nad potřebu (vše po stavbách). */
export interface SeasonCrop extends CropWork {
  crop: Crop;
  surplus?: true; // jen 'winter' | 'spring'; chybí = nutné díly
}
/** Hospodářský rok 1. 9. – 31. 8. – evidence práce dílů, které jsou na řadě; žádné rozhodnutí. */
export interface Season {
  startDay: number;
  ard?: true; // ves letos orá rádlem (kulaté rohy pole) – jako YearPlan.ard
  crops: SeasonCrop[]; // pořadí jako planCrops: ozim, luštěniny, len, jař; nad potřebu za nimi
  lordHelp?: LordHelp; // podíl dne rodiny – přepočet každý den v oknech
  flaxNeedKg?: number; // potřeba lnu k 1. 9. – pro VillageState.linen při trhání
}
// types-state.ts: season: Season | null; threshingSeason: Season | null
// types-land.ts:  FieldPart.next?: 'spring' | 'winter' – po ozimu čeká na jař, po jaři (1. osev) na ozim
//                 FieldPart.fallowBeforeSeason?: {…}  – příloh před sezónou (dnes …BeforePlan)
```

Čisté funkce v novém `rotation.ts`: `nextSowing(part)` → `'first' | 'spring' | 'winter' | 'late' |
'emergency' | 'rest' | null` (hotový nebo odpočatý ≥ 95 %, po ozimu, po jaři jako prvním osevu,
příloh 70–95 %, 40–70 %, odpočívá, v sezóně či zakládaný); `sowingCropToday(kind, day)` (z `extraSowingCrop` – ozim jen,
když po dnešku zbývá den setí ozimu; jař v oknech kopání jaře, na jaře jen dokud zbývá den setí);
`rotateAfterSeason(part, day)` (1. 9. místo větve `sown` v `endOfSeason`: ozim jako první osev
a úrodnost ≥ 70 % → `ready` + `next: 'spring'`, obilní jař jako první osev a úrodnost ≥ 70 % →
`ready` + `next: 'winter'` – Martin 25. 10. 2026: „Jestli bude možné mu dát ozim, ať dostane
ozim.“, jinak úhor); `neededSelection(state, day,
targets)` → díly, které mají přibýt k nutným plodinám (s plodinou), a nezačaté nutné díly, které
ves už nepotřebuje; `moveParts(from, to, ids, parts)` v `land-taken.ts` – přesune díly s jejich
hotovou prací (podle `taskSpans`), součet hotové práce se nezmění.

## Přehled úloh

| #   | Úloha                                                | Kroků | Model  | Chování a otisky                              |
| --- | ---------------------------------------------------- | ----- | ------ | --------------------------------------------- |
| 1   | Postup dílu a výběr nutných dílů (čisté funkce)      | ≈ 100 | Opus   | beze změny, otisky stejné                     |
| 2   | Hospodářský rok místo plánu – tvar a názvy           | ≈ 140 | Sonnet | beze změny; otisky jen přejmenováním (ověřit) |
| 3   | Nutné díly den po dni – denní úlohy polí             | ≈ 150 | Opus   | mění se – nové otisky                         |
| 4   | Díly nad potřebu po stavbách                         | ≈ 110 | Opus   | mění se – nové otisky                         |
| 5   | Orba a spřežení – pásy, cesta k bloku, páry k rádlům | ≈ 130 | Opus   | mění se ves s voly – nové otisky              |
| 6   | Převod starších vsí                                  | ≈ 80  | Opus   | starší vsi jednou (Vlkov)                     |
| 7   | Scéna a panely – Příště, Na řadě, nad potřebu        | ≈ 90  | Sonnet | jen zobrazení                                 |
| 8   | Skripty a mapa kódu                                  | ≈ 80  | Sonnet | –                                             |
| 9   | Ověření na Vlkově – 8 let                            | ≈ 70  | Sonnet | –                                             |

Pořadí je závazné: 1 → 2 → (sloučit `feat/weeding-once`) → 3 → 4 → 5 → 6 → 7 → 8 → 9. Mezi
Úlohami 3 a 4 ves osévá jen nutné díly (osev navíc už není, díly nad potřebu ještě ne) – větev se
neslučuje, dokud nejsou hotové Úlohy 3–6. Dev server proti DB `bohemia` až po Úloze 6 (a se
zálohou DB).

---

## Úloha 1 – Postup dílu a výběr nutných dílů (čisté funkce)

**Cíl:** Pravidla postupu a výběru jako čisté funkce s testy, zatím nezapojené – chování vsi se
nemění.

**Soubory:** nový `rotation.ts`; `types-land.ts` (`FieldPart.next?`, JSDoc s odkazem na fields.md);
`sowing.ts` (vytáhnout řazení `chooseFlax` – od konce, `chooseLegumes` – od domu – do sdílených
funkcí); `extra-sowing.ts` (`extraSowingCrop`, `sowParts`, `reclaimedLogs` přesunout do
`rotation.ts`, v `extra-sowing.ts` jen re-export do Úlohy 4); nový
`__tests__/sowing-rotation.test.ts` (`rotation.test.ts` už testuje natočené stavby). Sdílené řazení
(`SideCrop`, `rotatedFor`, `sideCropOrder`) zůstává do Úlohy 3 v `sowing.ts` – `rotation.ts`
importuje `field-progress.ts` a import opačným směrem by uzavřel kruh přes `summary.ts` → `lord.ts`
(rozbité načtení `costs.ts` v testech vozů).

- [x] `nextSowing(part)` podle `state`, `next`, `fertilityShare` (`FERTILITY.fallowReady`,
      `sowableMin`, `emergencyMin`) – `sowingGroup` zůstává pro pořadí.
- [x] `sowingCropToday(kind, day)` – `'first'` → ozim / jař podle oken (`windowOpen`), `'spring'`
      → jen jař; test na 29. 10., 30. 10., 31. 10., 1. 3., 29. 4., 30. 4.
- [x] `rotateAfterSeason(part, day)` – úrodnost jako `endOfSeason`, pak ozim s `sownYears` 1
      a úrodností ≥ 70 % → `ready` + `next: 'spring'`; obilní jař s `sownYears` 1 a úrodností
      ≥ 70 % → `ready` + `next: 'winter'` (Martin 25. 10. 2026 – díl, který nestihl ozim, dostane
      ozim; `nextSowing` → `'winter'`, plodina dne jako první osev); luštěniny, len, nouzový osev
      a druhý osev → `fallow` (`fallowSinceDay`, `sownYears` 0, bez `crop`, bez bonusu). Test oběhu: díl
      95 % → 12 sezón (ozim, jař, 10 let úhoru) → zase `first`; čerstvý 100 % → úhor 8 let;
      luštěniny po ozimu → úhor 4 roky, len → 12 let.
- [x] `neededSelection(state, day, targets)`: zasetá a začatá nutná práce sezóny (očekávaná energie
      jako dnes `planEnergyKg` – plná práce, dnešní úrodnost) + kandidáti v pořadí `sowingBlocks`
      (skupiny 1–3, pak 4, pak `EMERGENCY_GROUP` s `expectedNetKg > 0`); len od konce do
      `targets.flaxNeedKg`, luštěniny od domu do `targets.legumeKg` (napřed díly `'spring'`, pak
      `'first'`), obilí do `targets.harvestKg`; plodina z `sowingCropToday`. Vrací díly k přidání
      s plodinou (`join`) a nutné díly bez začaté práce, které ves už nepotřebuje (`release` – jen
      obilí, až nad toleranci `FIELD_STORES.trimMarginYears × targets.needKg`, nouzové první, pak
      nejdál od domu; návrh Clauda). `targets` = `harvestKg`, `legumeKg`, `needKg`
      (`SowingTargets`) + `flaxNeedKg` (potřeba lnu sezóny). Díly po prvním osevu (`next`) mají
      v `sowingGroup` skupinu 1 (jako osévaný díl) – před čerstvými.
- [x] Testy výběru (len od konce, luštěniny od domu, stop po pokrytí, nouzové jen při
      nedostatku, release) a determinismu (stejný vstup → stejný výstup, nezávisle na pořadí
      `state.parts`).
- [x] Commit `feat(game): osevní postup dílu a výběr nutných dílů – čisté funkce`.

**Hotovo:** `typecheck`, `lint`, `test` (otisky beze změny), `format:check`.

## Úloha 2 – Hospodářský rok místo plánu – tvar a názvy

**Cíl:** Mechanická změna tvaru, **chování beze změny**: `YearPlan` → `Season` (`crops:
SeasonCrop[]`), `state.plan` → `state.season`, `threshingFromPlan` → `threshingSeason`,
`planCrops` → `seasonCrops`, `planPartIds` → `seasonPartIds`, `plannedDay` → `startDay`,
`createYearPlan` → `createSeason`. `extra`, `lordHelp`, `flaxNeedKg` zatím zůstávají (na `Season`).

**Soubory:** 23 zdrojových a 25 testových souborů ze Soupisu, web (`village-view-crafts.ts`,
`dev-holdings.ts`), skripty (`measure-village.ts`, `measure-holdings.ts`), `simulate.ts`
a `application/update-village.ts` (převod).

- [ ] Před změnou: lokálně spočítat otisky `smith-golden` a `craft-skill-golden` **bez klíčů**
      `plan` a `threshingFromPlan` (dočasně do `learning`) a poznamenat.
- [ ] Typy, `year-plan.ts` (`seasonCrops` vrací `{ crop, work }` jako dnes `planCrops`, pořadí
      ozim, luštěniny, len, jař), `seasonCrop(season, crop)` – nutná plodina.
- [ ] `withSeason(state)` – starý `plan` (jař nahoře, `winter` / `legume` / `flax`) → `season`,
      `threshingFromPlan` → `threshingSeason`; bez `plan` nic (idempotentní). Test: převod
      ručně postaveného plánu ze 3 plodin a dvojí převod = jeden.
- [ ] Spotřebitelé – `sed` na názvy, ručně tvar (`state.plan.winter` → `seasonCrop(…, 'winter')`).
      Testy, které stavějí plán ručně (`s.plan = { plannedDay, ...createCropWork(…) }`), přes
      `createSeason`.
- [ ] Po změně: otisky **bez klíčů** `season` a `threshingSeason` = poznamenané; teprve pak
      zapsat nové plné otisky s komentářem „jen přejmenování plánu na sezónu“.
- [ ] Commit `refactor(game): hospodářský rok místo ročního plánu – tvar a názvy`.

**Hotovo:** `typecheck`, `lint`, `test`, `format:check`;
`grep -rn "YearPlan\|planCrops\|threshingFromPlan"`
jen v převodu. Přesáhne-li úloha 150 kroků: 2a doména a simulace, 2b testy, web a skripty.

## Úloha 3 – Nutné díly den po dni – denní úlohy polí

**Cíl:** Ves bez plánu: 1. 9. nová sezóna a postup dílů, každý den v oknech přibývají nutné díly
(i ve vsi s voly – orba zatím přes `addToCropWork`, pásy po dávkách doladí Úloha 5), ozim, který
nestihl setí, jde na jaře do jaře, nezasetá jař čeká na další sezónu. Bez osevu navíc (do Úlohy 4).

**Soubory:** `simulate.ts` (kroky 1–3), `simulate-plan.ts` (`planYear` → `startSeason`,
`seasonDay`; smazat `joinFinishedParts`, `trimPlan`, `springLordHelp`, `cropsKey`), `plan-trim.ts`
(smazat), `sowing.ts` (smazat výběr s kapacitou – **kromě** toho, co do Úlohy 5 potřebuje
`wantedPloughPairsOf`), `simulate-work.ts` (`fieldTasks` jen nutné plodiny, `springHarvestAhead`),
`simulate-food.ts`, `flax.ts`, `lord.ts` (`lordHelpToday`), `land-taken.ts` (`moveParts`),
`fields.ts` (`endOfSeason` – větev `sown` volá `rotateAfterSeason`), `labor-report.ts`.

- [ ] `startSeason(state, day)` (1. 9.): `closeFieldFoodYear`, `rotateAfterSeason` /
      `endOfSeason` všech dílů, `state.season = createSeason(day, ard)`, `flaxNeedKg`.
- [ ] `seasonDay(state, day, coverage)` (1. 9. – 30. 4., po `startSeason`): `fieldSowingTargets`,
      `neededSelection` → `addToCropWork` nutné plodiny (`workOrder(holdings)`), `sowParts`,
      `fallowBeforeSeason` u přílohů, klády z vráceného lesa (`reclaimedLogs`) při přidání;
      `release` → `shrinkInPlan` / `dropFromWork` a návrat přílohu jako dnes `trimPlanToTarget`.
- [ ] Konec okna ozimu (první den po posledním dni setí ozimu): díly ozimu bez zasetého podílu →
      `moveParts` do jaře (`crop: 'spring'`, zkopaná a zoraná práce jde s nimi). 1. 5.: nezasetá
      jař → z práce ven, díl zpět (příloh podle `fallowBeforeSeason`, hotový díl `ready`), `next`
      zůstane – přibude zase od 1. 9. pod jař.
- [ ] Podíl rodiny `lordHelpToday(state, day)` – každý den v oknech `SOWING_CAPACITY_WINDOWS`
      z nutné práce, která v okně zbývá, a `sowingCapacity` vsi od dneška (`lordSowingHelp`);
      `lord.ts` volá místo `lordHelpShare(plan)`.
- [ ] Sklizeň po `seasonCrops` (ozim, luštěniny a len 31. 7., jař 31. 8.), výhled jídla
      (`daysUntilFoodHarvest`, `expectedWinterKg`) beze změny vzorců.
- [ ] Testy: nový `season-day.test.ts` – ves bez staveb oseje všechny díly na řadě, které stihne
      (žádný díl na řadě nezůstane ladem, když má ves volnou práci v okně); ozim → jař na konci
      října; nezasetá jař čeká; nutné díly před stavbou (stavba stojí, dokud nutná práce v okně
      zbývá); `release` při velké zásobě; po kouscích 1 / 7 / 30 dní. Smazat `plan-trim.test.ts`,
      výběrové testy `sowing.test.ts`, `lord-sowing.test.ts` (plánové části), přepsat
      `emergency-sowing.test.ts`, `flax.test.ts` (Len napřed → len vždy nutný), `legumes.test.ts`.
- [ ] Nové otisky s komentářem. Commit `feat(game): nutné díly den po dni místo plánu osevu`.

**Hotovo:** `typecheck`, `lint`, `test`, `format:check`; v kódu žádné `planYear`, `trimPlan`,
`joinFinishedParts`, `plan-trim`. Přesáhne-li 150 kroků: 3a nový rok, výběr a konce oken,
3b sklizeň, rodina, úklid testů.

**Oprava po recenzi (review-sowing-3, 25. 10. 2026 – návrh Clauda v duchu Martina):** hladová ves
s nutnými díly přibranými najednou celý podzim jen vracela příloh a nezasela nic (C1) a klády
z mladého lesa dostávala při každém přibrání (C2). Oprava: díly přibývají **po dávkách na čele
práce** (`workFront`, `WORK_FRONT_DAYS` = 3 dny volné práce a orby – fields.md, Postup práce po
dílech), pořadí výběru len → obilí do `energyFloorKg` → luštěniny → obilí do `harvestKg` (obilí má
přednost, I3), v dávce ozim před jaří; čekající díly výběru počítá `lordHelpDay`; uvolnění obilí
nebrzdí přibírání lnu a luštěnin. Klády `clearedLogs` až za díly, přes které došlo čelo vracení
přílohu; vyklučený díl se po uvolnění vrátí bez lesa. Testy: `season-day.test.ts` (hladová ves
ze sondy zaseje ozim i jař, nouzové až po připravených; dávky rostou s čelem; uvolnění – čelo
a vzhled se nepohnou; klády jen za skácené), `sowing-rotation.test.ts` (obilí do roční potřeby
před luštěninami), `emergency-sowing.test.ts` (původní síla – osetý nouzový je nejvíc zotavený,
nezasetý zbude, −12 %), dosažitelnost v `holdings.test.ts` měří obdělané díly 31. 8. (0,14).

## Úloha 4 – Díly nad potřebu po stavbách

**Cíl:** Ostatní díly na řadě (jen obilí) dostanou práci po stavbách a opravách obydlí – všechna
polní práce (příprava, setí, pletí, žně, odnos); výmlat na humně společný. Díl nad potřebu se
stane nutným, když potřeba vzroste.

**Soubory:** `extra-sowing.ts` → nový `surplus-fields.ts` (`surplusFieldDay` místo
`extraSowingDay`), `simulate-work.ts` (`work()` – krok po `afterBuild.left`, před seč navíc),
`year-plan.ts` (`neededTaskRemaining` bez `extraLeft`), `types-construction.ts` (smazat
`ExtraPart`, `extraLeft`), `labor-report.ts` (`surplusField`), `rotation.ts` (`neededSelection`
– povýšení `surplus` → nutné přes `moveParts`), `field-progress.ts` (`extra` → `surplus`).

- [ ] `surplusFieldDay(state, day, { labor, teamDays })`: napřed úlohy plodin `surplus: true`
      (aktivní úlohy dne podle oken, pořadí jako `fieldTasks`), pak nový díl nad potřebu
      (`nextSowing` + `sowingCropToday`, jen obilí, nejvýš jeden rozpracovaný na plodinu –
      vrácení přílohu jen v jeho okně), přidaný do plodiny `surplus` (`addToCropWork`).
- [ ] Sklizeň plodin nad potřebu do snopů jako nutných (`addSheaves`) – výmlat se neliší.
- [ ] Zápis volné práce na seč (`recordMowingLabor(mowWork + allocation.common)`) a volná práce
      v liště beze změny – test, že práce dílů nad potřebu je nesnižuje.
- [ ] Testy: ves bez staveb obdělá i díly nad potřebu; stavba zadaná v květnu → díly nad potřebu
      bez pletí (úroda × nevypletý podíl), v červenci bez žní (propadne); nutné díly beze ztráty;
      povýšení dílu při narození / zabrání stavbou; po kouscích; **nutné díly před stavbou**
      (stavba stojí, dokud nutná práce v okně zbývá – přesunuto z Úlohy 3 po recenzi). Díly nad
      potřebu berou práci až za čelem nutných dílů (`workFront`). `extra-sowing.test.ts` přepsat na
      `surplus-fields.test.ts`.
- [ ] Nové otisky s komentářem. Commit `feat(game): díly nad potřebu po stavbách`.

**Hotovo:** jako Úloha 3; v kódu žádné `extraSowing`, `ExtraPart`, `extraLeft`.

**Provedení (25. 10. 2026, návrh Clauda):** `surplusFieldDay(state, day, { labor, teamDays,
ploughFactor, toolCoverage, neededWaiting })` – vstup `order` odpadl (díl nad potřebu přibývá po
jednom). „Rozpracovaný“ = plodina nad potřebu má nehotovou přípravu půdy; nový díl nezačne, dokud
nutné díly čekají na čelo (`seasonDay` vrací čekající → `work(…, neededWaiting)`). Povýšení
(`promoteSurplus` v `simulate-plan.ts`) jde mimo čelo, `moveParts` v téže plodině nese i setí
a další práci. Přídělový výhled (`daysUntilFoodHarvest`) počítá jen nutný ozim. Konec října: ozim
nad potřebu → jař nad potřebu; 1. 5. nezasetá jař nad potřebu vypadne. Starý `extra` a `extraLeft`
ze stavu s ročním plánem zůstávají jako netypované klíče – převede je Úloha 6. Otisky: jen
`flax.test.ts` (171:fcbccd0e, plodiny nad potřebu s klíčem `winter+`); `field-food.test.ts` – nutné
obilí smí s díly nad potřebu pár let ustat (zásoby rostou), test hlídá poslední tři roky.

## Úloha 5 – Orba a spřežení – pásy, cesta k bloku, páry k rádlům

**Cíl:** Ves s voly orá nutné díly v souvislých pásech i bez plánu, díly nad potřebu zbylou
kapacitou; spřežení na poli a návrat do ohrady fungují po plodinách sezóny; páry k rádlům podle
postupu.

**Soubory:** `plough-blocks.ts` (`ploughLayout` na dávku přidaných dílů), `year-plan.ts`
(`addToCropWork` – bloky dávky za stávajícími, `ploughToHoe`, `ploughsThisYear`), `oxen.ts`
(`finishPlanByHoe` → po plodinách sezóny), `plough-trip.ts` (`PloughWork.trip` po plodinách,
`settlePloughTeams`), `simulate-work.ts` (kapacita spřežení: nutné napřed, `teamDays` zbytek pro
nad potřebu), `simulate-plan.ts` (`wantedPloughPairsOf` → `ploughPairsForRotation`), `sowing.ts`
(smazat zbytek výběru s kapacitou), `morning-water.ts`, `carts.ts` (dosahy vozů na osivo a žeň).

- [ ] Nutné díly přibývají v dávkách (1. 9. všechny na řadě pod ozim i jař, 1. 11. přesunuté
      ozimy, další jen při růstu potřeby) – každá dávka svým `ploughLayout`, aby pás neztratil
      délku brázdy; test: Vlkov-like pole 1. 9. má stejné bloky a průměrnou brázdu jako plán
      z dneška (± 5 %).
- [ ] `ploughPairsForRotation(state, day)` – páry, které v oknech orby zorají všechny díly na
      řadě v příštím hospodářském roce (nutné i nad potřebu – váha orby a `ploughCapacityPerDay`,
      `plannedFurrowEfficiency`), nejvýš `OXEN.maxPairs`, přes `nextPloughPairs` (dva roky).
- [ ] Ztráta posledního spřežení dokončí všechny plodiny motykou (`ploughToHoe`) – i nad potřebu.
- [ ] Testy: `oxen.test.ts`, `plough-blocks.test.ts`, `cart-jobs.test.ts`, `morning-water.test.ts`
      na sezóně; spřežení po nutných orá díly nad potřebu jen zbylou kapacitou a ne v den, kdy
      vozí; po kouscích.
- [ ] Nové otisky s komentářem. Commit `feat(game): orba a spřežení podle osevního postupu`.

**Hotovo:** jako Úloha 3; v kódu žádné `chooseCrops`, `wantedPloughPairsOf`.

**Provedení (25. 10. 2026, návrh Clauda):** dávky 1. 9. / 1. 11. z plánu nahradilo čelo práce
z Úlohy 3 (díly přibývají den po dni) – proto: díl nutné plodiny přibude s celým pásem
z rozvržení výběru dne (`joinBands` v `seasonDay`), díl nad potřebu s celým pásem dílů na řadě
(`bandWith` v `surplus-fields.ts`), nezačaté pásy se s dávkou rozvrhnou znovu
(`relayUntouchedBands` v `plough-trip.ts`; čísla nových bloků za všemi dosavadními). Test
`plough-blocks.test.ts` (Orba po dávkách dílů, pole 24 × 16): výkon brázdy ozimu k 31. 10.
0,60 → 0,97 (najednou 1,04), díly nad potřebu 0,44 → 1,12–1,13 (= najednou), 2. 9. přesně jako
najednou; zbylý rozdíl ozimu = díly, o které potřeba během podzimu vzroste (k zoraným pásům se
nepřipojí) – test hlídá ≥ 90 %. Spřežení na poli počká, když má plodina zoráno, ale její nutné
díly čekají na čelo (`settlePloughTeams(…, waiting)`). `ploughPairsForRotation` – ozim v okně
orby ozimu, vše v okně orby jaře, výkon páru `pairCapacityPerDay` × `plannedFurrowEfficiency`
dílů na řadě (`onTurn` – přílohy 70–95 % a nouzové ne). `finishPlanByHoe` → `finishSeasonByHoe`
(i nad potřebu – už dřív přes `seasonCrops`). Otisky beze změny: `smith-golden` a
`craft-skill-golden` mají díly bez políček (pole z obrysu – každý díl je pás sám pro sebe, pás
dávky = díl); páry k rádlům vyšly stejně (otisk stavu se nezměnil). `chooseCrops` a výběr s kapacitou v `sowing.ts` zůstávají jen
kvůli testům výběru (`sowing`, `flax`, `legumes`, `holdings`, `lord-sowing`) – smazat s nimi
v Úloze 8.

## Úloha 6 – Převod starších vsí

**Cíl:** Ves uložená s plánem (Vlkov) se převede jednou a bez ztráty zasetého, ať je v kterémkoli
dni roku.

**Soubory:** `rotation.ts` (`withSowingRotation`), `simulate.ts` a
`application/update-village.ts` (řetěz za `withSeason`),
nový `__tests__/rotation-migration.test.ts`.

- [x] `withSowingRotation(state)` (jen když sezóna nese `extra`, `extraLeft` nebo chybí značka
      převodu): plodiny sezóny zůstanou s hotovou prací a jsou nutné (i začaté díly osevu navíc –
      `extraLeft` se přičte k potřebné práci); `extra` → díly čekají podle stavu (osévaný díl
      se `sownYears` → `ready`, příloh → `fallow`); `lordHelp`, `flaxNeedKg` zůstanou do 31. 8.;
      `fallowBeforePlan` → `fallowBeforeSeason`; ~~`next: 'spring'` jen dílům v ozimu sezóny, které
      byly prvním osevem (`sownYears` 0)~~ – zbytek dopočítá `rotateAfterSeason` 1. 9.
- [x] Testy na ručně postavené vsi s plánem ve 4 dnech (1. 9., 25. 10., 15. 3., 15. 6.): zasetá
      plocha, hotová práce a úroda k 31. 8. stejné jako bez převodu; dvojí převod = jeden;
      dopočet po kouscích.
- [x] Ověřit na kopii Vlkova (jen čtená, mimo DB – JSON stavu do `/tmp`, ne do repa): převod
      a 1 rok dopočtu bez chyby, žádný díl nezmizí, zasetá plocha k 31. 8. ≥ před převodem.
- [x] Commit `feat(game): převod starších vsí na osevní postup`.

**Hotovo:** `typecheck`, `lint`, `test`, `format:check` (adaptéry beze změny – `test:db` ne).
Značka `VillageState.sowingRotation` – i nová ves od založení (`foundVillage`), převod je pak
no-op; otisky `smith-golden` a `craft-skill-golden` ji nepočítají (jako `dynasty`), jinak beze
změny. `extraLeft` už je v `required` (stará `neededTaskRemaining` ho jen odečítala) – převod
jen smaže klíč. `fallowBeforePlan` přejmenované v kódu na `FieldPart.fallowBeforeSeason`.
**`next` převod nenastavuje** (návrh Clauda): v osevním postupu díl v sezóně nese `next` jen
z doby před osevem (`sowParts` ho nechá pro `returnPart`) a `rotateAfterSeason` ho 1. 9. smaže
a odvodí z `sownYears` – `next: 'spring'` na zasetém ozimu by uvolněný díl poslal jen na jař.
Testy `rotation-migration.test.ts`: stav nové vsi převedený zpět do tvaru plánu (1. 9., 25. 10., 15. 3., 15. 6., 10. 8.) se převede na totéž (díly, sezóna, snopy, zaseto ha, hotové čd) a do 31. 8. dopočte shodně; `extraLeft`, `extra`, `fallowBeforePlan`, dvojí převod, chyba → ves se
načte se značkou, dopočet po kouscích. **Vlkov** (27. 8. 817, výpis `diag-sowing/convert.txt`
ve scratchpadu): převod 1 ms, díly i práce beze změny (19,9 ha, 1246,8 z 1486,3 čd, snopy 0,
585 × `fallowBeforeSeason`); sezóna 816/817 doběhne jako starým plánem (jař 2429 kg); za 12
měsíců bez výjimky a bez hladu – ozim 9,8 ha / 2879 kg, jař 18,2 ha, luštěniny 0,4 ha, osev
28,6 ha proti starému plánu 23,0 ha (ozim 14,5 ha / 3376 kg); zásoby 664 kg + snopy 2156 kg
(výmlat po žních) proti 3261 kg. Převod uprostřed roku (starý plán do 25. 10., 15. 3., 15. 6.,
pak osevní postup do 27. 8. 818): zaseté a rozdělané beze změny, ozim 3478 / 3361 / 3376 kg
proti 3376 kg, žádný hlad. **Známá mez:** ves uložená s plánem mezi 1. 11. a 31. 8. nechá
nezasetý ozim plánu v ozimu do 31. 8. jako starý plán (přesun do jaře je jen první den po
setí ozimu) – zkopané a zorané nepropadne; Vlkov se to netýká (ozim zasetý celý).

## Úloha 7 – Scéna a panely – Příště, Na řadě, nad potřebu

**Cíl:** Hráč vidí u dílu, co na něm poroste příště, u pole, co je na řadě; díl nad potřebu má
popisek. Scéna beze změny (postup po čtvercích).

**Soubory:** `field-progress.ts` (`partYearWork` – `surplus`, `next`, `restLeft` – podíl
odpočinku k 95 %), `apps/web/lib/village-view-fields.ts`, `village-view-types.ts`,
`selection-details.ts`, `components/game/hud/SelectionPanel.tsx`, ikony (stávající ikony plodin
a přílohu – nic nového nekreslit), `apps/web/lib/__tests__/village-view.test.ts`, e2e panelu pole.

- [x] Panel dílu: **Příště** (ikona ozim / jař / luštěniny / len / úhor, u úhoru % odpočinku,
      popisek „Osev za ≈ N let“), osetý díl „1. / 2. osev oběhu“, díl nad potřebu popisek „Jen
      z volné práce – stavby mají přednost“. Jen ikony s čísly, slova v `Tooltip`.
- [x] Panel pole: **Na řadě** – počty dílů s ozimem, s jaří, odpočívajících; v popisku kolik je
      nad potřebu.
- [x] Strniště po ozimu (`ready` + `next`) vypadá jako strniště do začátku podzimní práce
      (`fieldPartLooks`) – test vzhledu.
- [x] Commit `feat(web): panel dílu a pole – osevní postup`.

**Hotovo:** `typecheck`, `lint`, `test`, `format:check`, `test:e2e`.

## Úloha 8 – Skripty a mapa kódu

**Soubory:** `scripts/lib/steady-state.ts` (`winterHectares` → postup: v ustáleném stavu polovina
osevu ozim, polovina jař; kapacita jen pro odhad, co ves stihne), `scripts/village-calculator.ts`,
`scripts/measure-village.ts` (osev po plodinách a nutné / nad potřebu, podzimní kopání ze sezóny),
`scripts/measure-holdings.ts`; `docs/code/village-fields.md`, `village-core.md`,
`village-livestock.md`; `docs/design/lord.md` (bod 1), `oxen.md` (Kolik volů ves chce) – odkaz na
fields.md a nový výpočet.

- [ ] Skripty přeložit a pustit jen `--quick` na 1 ves 2 roky (kontrola, že běží; kalibrace ne).
- [ ] `rotationYears()` ve `field-capacity.ts` (`ROTATION_FACTOR` – popisek „Pole uživí ≈ N
      lidí“, dnes 16 / 3 ≈ 5,3) podle postupu: 2 osevy (100 → 88 → 76 %) a úhor 8 let → 10 / 2 =
      5,0, průměrná úrodnost osevu 0,94 – změna čísla i v textu fields.md (Co hráč vidí).
- [ ] Commit `docs: mapa kódu a skripty pro osevní postup`.

## Úloha 9 – Ověření na Vlkově – 8 let

**Cíl:** Kopii Vlkova (JSON stavu, jen čtená) dopočítat 8 let dosavadním kódem (`feat/landscape`)
a novým kódem, bez zásahu hráče, a jednou se dvěma stavbami zadanými v dubnu 2. roku.

- [ ] Tabulka po hospodářských letech: osev ha (ozim, jař, luštěniny, len; nutné / nad potřebu),
      úroda (kg energie), zásoby z pole po sklizni ÷ potřeba, nejnižší nasycení roku, úmrtí hladem,
      volná práce (čd na člověka a rok), dny dostavění staveb, ozimy přesunuté na jaro, jař
      nezasetá do 30. 4.
- [ ] Čas dopočtu 8 let – starý a nový kód (nejvýš +10 %); determinismus – dopočet po 1 dni
      a po 30 dnech dá stejný stav.
- [ ] Test dosažitelnosti (`holdings.test.ts`, recenze review-sowing-3b – Important 1): práh
      obdělaných dílů 31. 8. byl v Úloze 3 snížen 0,4 → 0,12 (rozdíl proti staré verzi 0,04) –
      ověřit na Vlkově a práh zpřísnit podle naměřeného.
- [ ] Výsledek do fields.md (Osevní postup – Naměřeno), zprávu Martinovi s tabulkou.
- [ ] Commit `docs: osevní postup – ověření na Vlkově`.

**Kritéria hotovo (Vlkov 8 let):**

- **Osev:** bez staveb oseje každý rok všechny díly na řadě, které lidé a spřežení stihnou –
  osetá plocha ≥ dosavadní kód v každém roce a v ustálení ≈ šestina polí v oběhu; ozim přesunutý
  na jaro a nezasetá jař jen na čele práce (≤ 10 % dílů na řadě).
- **Úroda a hlad:** nasycení ≥ 0,95 celý rok, žádné úmrtí hladem; zásoby z pole po sklizni
  ≥ potřeba úrody každý rok.
- **Volná práce a stavby:** stavby zadané v dubnu se dostaví nejvýš o 10 % dnů později než
  s dosavadním kódem; v letech bez staveb jde volná práce v oknech na díly nad potřebu.
- **Kód:** `grep -rn "YearPlan\|planYear\|trimPlan\|extraSowing\|chooseCrops"` mimo převod = 0;
  `typecheck`, `lint`, `test`, `format:check`, `test:e2e` zelené.

## Rizika

1. **Rozsah:** 346 míst ve 48 souborech (239 v testech). Mechanická Úloha 2 drží změnu tvaru
   odděleně od změny chování; otisky bez klíčů plánu ji hlídají. Testy zrušených pravidel se
   mažou, ne ohýbají – seznam do commitu.
2. **Přesun rozdělané práce mezi plodinami** (ozim → jař na konci října, nad potřebu → nutné,
   uvolnění nezačatých): `CropWork` nese součty, ne práci po dílech – `moveParts` musí brát
   práci dílu z `taskSpans` (pořadí po čtvercích). Invariant v testu: součet hotové práce přes
   plodiny se přesunem nezmění, čelo práce ve scéně neposkočí.
3. **Podzim bez odhadu:** ves začne ozim na všech dílech na řadě; co setí do konce října
   nestihne, jde na jaro jako jař a po ní – když to úrodnost dovolí – ozim (Martin 25. 10. 2026),
   pak úhor. Měří Úloha 9 (ozimy přesunuté na jaro); dřívější otevřená volba ve fields.md (druhý osev
   ozimem) je rozhodnutá.
4. **Orba po pásech:** díly přibývající po dávkách mohou zkrátit brázdu a zpomalit orbu – dávky
   (1. 9., 1. 11.) a test brázdy v Úloze 5; díly nad potřebu se orají po jednom jako dnes osev
   navíc.
5. **Pomoc rodiny a páry volů** se počítají jinak (každý den, z postupu) – změní výcvik rodiny
   (`trainLordDay`) a počet volů; páry na všechny díly na řadě znamenají víc volů a sena pro ně.
   Testy `lord-day`, `oxen`; v Úloze 9 sledovat seno a stáda.
6. **Determinismus:** výběr nutných dílů denně ze stavu – testy po kouscích v Úlohách 1, 3, 4,
   5, 6; žádný stav mimo `VillageState`.
7. **Výkon:** `fieldSowingTargets` a výběr každý den 1. 9. – 30. 4. (dnes už `trimPlan`), u vsí
   s tisíci dílů (Vlkov ≈ 2 000) výběr jen nad díly na řadě; měřit v Úloze 9, cache na den až
   při zpomalení.
8. **Souběžná větev pletí:** sloučit před Úlohou 3, jinak konflikty v pravidlech pletí a otiscích.
9. **Převod Vlkova** proběhne jednou při prvním dopočtu – záloha DB před dev serverem po Úloze 6;
   do té doby dev server jen proti `bohemia_test` nebo nové vsi.
10. **Kalibrační skripty** napodobují výběr plánu (`winterHectares`) – do Úlohy 8 dávají
    neplatná čísla; kalibraci nepouštět.

## Mimo plán

- Kratší úhor (trojpolí) – jen na Martinův pokyn. (Ozim po jaři jako prvním osevu Martin rozhodl 25. 10. 2026 – je v Úloze 1.)
- Autopilot staveb, předvídání staveb vesničany (Martin: vesničané stavby dopředu neznají).
- Změny sena, stád a výmlatu na humně.
