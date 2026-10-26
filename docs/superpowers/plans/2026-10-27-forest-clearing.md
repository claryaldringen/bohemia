# Klučení lesa pro pole po fázích – plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cíl:** Díl pole v lese se už nezaloží naráz. Vesničané napřed pokácí stromy čtverce strom po
stromu (pařez po každém) a klády složí na **hromadu klád u lesa**, větve 30 dní schnou, pak je
v březnu až říjnu i s pařezy **vypálí** – ve scéně hoří ohně a stoupá kouř – a díl je připravený
k osevu s bonusem popela od dohoření. Celková práce (sazba lesa 250 / 150 čd/ha) se nemění.

**Architektura:** Díl v lese dostane volitelnou část stavu `FieldPart.clearing` (stromy ke
skácení v pořadí, kolik padlo, práce pálení, den pádu posledního stromu) a `burnedDay`. Fáze dílu
(`'fell' | 'dry' | 'burn'`) je čistá funkce odvedené práce `foundingDone` a dne – nová
`domain/village/forest-clearing.ts`. Práce dne do stavby pole (`constructionNeed`, `invest`
v `simulate-build.ts`) bere ohled na fáze: pálení suchých čtverců napřed, kácení potom, schnoucí
čtverce nic. Klády jdou při pádu stromu na hromadu u lesa – `VillageState.logStacks` je
podmnožina zásoby `woodLogs` (celková zásoba zůstává jedno číslo, stavby, obchod i tesař berou
přes nový `takeLogs`). Scéna kreslí paseku z fáze dílu: pařezy už umí (`felledTrees`), přibudou
hromady větví, hromady klád u lesa, ohně (sprity jako pohřební hranice) a kouř (`VillageSmoke`).

**Stack:** TypeScript, doména a use-casy – Vitest (`packages/game`), web – Vitest a Playwright,
Babylon.js 9 (sprity, thin instances), Blender skript na model hromad větví. Drizzle se nemění –
stav vsi je `jsonb`, **žádná migrace**; převod starších vsí v řetězu převodů.

**Spec:** [docs/design/forest.md](../../design/forest.md) – „Klučení lesa pro pole – postup“
(Martin 24. 10. 2026, issue #10; podrobnosti návrh Clauda 26. 10. 2026 – **čeká na Martinovo
potvrzení**, implementovat až po něm). Navazuje na fields.md – Založení pole, Úroda (bonus
popela), Postup práce po čtvercích.

## Globální omezení

- **Nové části stavu volitelné** (`FieldPart.clearing`, `FieldPart.burnedDay`,
  `VillageState.logStacks`), převod starších vsí jednou a idempotentně (Úloha 4).
- **Determinismus:** fáze, pády stromů, dohoření a hromady klád jsou čisté funkce stavu a dne;
  žádná nová náhoda v jádru. Úlohy 3 a 4 mají test „po kouscích“ (1 den, 7 dní, 30 dní, celé –
  stejný stav). Ohně a kouř ve scéně deterministicky z herního času (`hash01`, jako dým a hranice).
- **Výkon jádra:** denní krok nesmí zpomalit – `fellTrees` volat jednou za díl a den (dávka id),
  ne po stromu; při dohoření smazat záznamy `felledTrees` čtverce (odstranění má přednost, seznam
  pak neroste). Měřítko: dopočet kopie Vlkova 2 roky před a po – nejvýš +5 %.
- **Scéna:** kreslí se jen při změně – ohně a kouř v `animate()` v taktu `WATER_FPS`, při
  omezeném pohybu stojí; Babylon jen z konkrétních modulů (`@babylonjs/core/Sprites/spriteManager`
  …) a jen v `lib/scene`; WebGPU ≤ 8 vertex bufferů (sprity a thin instances bez nových atributů);
  grafika jen vlastní (CC0) nebo z 0 A.D. – zdroj do `LICENSE.md` / `LICENSES.md` vedle souboru.
- **Čísla jen v `rules-fields.ts`** s odkazem na forest.md – `FOREST_CLEARING`, `BURN_WINDOWS`;
  scéna má své konstanty (počet hromad, strop ohňů) v `lib/scene`.
- **Testy:** doména s in-memory stavem a syntetickou vrstvou překážek, žádné mocky Drizzlu.
  Zlaté otisky (`smith-golden.test.ts`, `craft-skill-golden.test.ts`) se v Úloze 3 změní, jen
  pokud jejich ves zakládá pole v lese – nový otisk s komentářem (datum, proč, dřívější hash).
  Otisky krajiny a překážek se nemění (žádná nová vrstva – kácení a odstranění jsou změny krajiny
  sídla jako dosud).
- **Mapa kódu:** každá úloha zapíše změny do `docs/code/village-fields.md` (nový odstavec
  „Klučení lesa“ u Les vsi / Postup práce po čtvercích), `village-core.md` (Les a dřevo –
  hromady u lesa), `scene.md` / `scene-village.md` (paseka, ohně a kouř), `web-ui.md` (panel) –
  ne do `CLAUDE.md`. V dokumentech „návrh Clauda“, Martinova slova s datem.
- **Kalibrace** (`measure-village`) jen na Martinův pokyn; ověření Úlohy 8 je dopočet kopie
  Vlkova, ne kalibrace.
- Před commitem `npm run typecheck`, `lint`, `test`, `format:check`; v Úlohách 5–7 i
  `test:e2e`. Výstupy ořezávat (`| tail`, `grep "Tests "`). Commity česky, `Refs #10`.

## Soupis – kde se dnes díl v lese zakládá

| Místo                                                         | Co dělá dnes                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `placement-fields.ts` `fieldPartsFromCells` (ř. ~81–140)      | `PartInput` – povrch, `obstacleCost`, `obstacleIds`, `trees` (nevyhrazené dospělé) |
| `obstacles.ts` `addToTally` / `addAddedToTally` (ř. ~296–320) | sčítá překážky čtverce, `treeIds` jen `kind === 'tree'`                            |
| `actions.ts` (ř. ~290–320)                                    | vytvoří `FieldPart` (`foundingCost` z `partFoundingCost` v `fields.ts`)            |
| `simulate-build.ts` `constructionNeed`, `build`, `invest`     | potřeba pole = Σ (`foundingCost − foundingDone`), díly od nejbližšího, `completes` |
| `simulate-build.ts` `foundPart` (ř. ~247)                     | naráz: `recordClearedObstacles`, `addLogs(trees)`, `clearWoodAt`, `bonusUntilDay`  |
| `wood.ts` `addLogs`, `takeWood` (ř. ~468), `rotLogs`          | hromada u vsi = `woodLogs`; přímé odečty i v `carpentry.ts:287`, `trade.ts:172`    |
| `field-progress.ts` `fieldPartLooks` (ř. ~591)                | zakládaný díl `bare` s `work`; `FieldPartLook` v jádru, `FieldLook` ve web typech  |
| `apps/web/lib/scene/villager-plan-fields.ts` `founding`       | postavy kácí stromy čtverce naoko (`atTree … 'fell'`) a kopou (`'hoe'`)            |
| `apps/web/lib/scene/log-pile.ts`, `log-pile-layout.ts`        | jedna hromada u obydlí nejblíž lesu, místo hledá scéna (`logPileSite`)             |
| `apps/web/lib/scene/village-renderer.ts` `updateSmokeSources` | dým dýmníků, dílen, milířů a svatyní (`SmokeSource.kind`)                          |
| `apps/web/lib/scene/funeral-renderer.ts`, `pyre-fire.ts`      | oheň hranice – sprity `textures/particles/fire.png`, `fireSprites`, `PYRE_PLUME`   |
| `apps/web/components/game/hud/selection/fields.tsx` (ř. ~417) | panel dílu – pruh „Založení“, zbývá práce, stromy                                  |

## Datový model (návrh Clauda)

```ts
// rules-fields.ts – forest.md, Klučení lesa pro pole – postup (návrh Clauda 26. 10. 2026)
export const FOREST_CLEARING = { fellShare: 0.6, dryDays: 30, smolderDays: 2 } as const;
export const BURN_WINDOWS: readonly WindowSegment[] = [[3, 10]]; // březen–říjen

// types-land.ts
export type ClearingStage = 'fell' | 'dry' | 'burn';
export interface PartClearing {
  /** Stojící stromy čtverce v pořadí kácení – dospělé, mladé, souše (bez vyhrazených jinou
   *  stavbou); `log` = dospělý strom, dá kládu na hromadu u lesa. */
  fell: { id: number; log: boolean }[];
  /** Kolik stromů z `fell` padlo. */
  felled: number;
  /** Práce pálení (čd); kácení s kameny je zbytek `foundingCost`. */
  burnCost: number;
  /** Den pádu posledního stromu – od něj schnou větve; chybí, dokud se kácí. */
  felledDay?: number;
}
// FieldPart: clearing?: PartClearing;  burnedDay?: number (den dohoření – doutnání, panel)

// types-state.ts
export interface LogStack {
  id: number; // z nextId
  fieldId: number;
  x: number; // kotva – střed čtverce, na kterém padl první dospělý strom (m, svět)
  z: number;
  logs: number; // hnije jako hromada u vsi
}
// VillageState: logStacks?: LogStack[]  – podmnožina woodLogs (u vsi = woodLogs − Σ logs)
```

Díl s `clearing` nemá `trees` (klády dává po stromech). `foundingCost` a `foundingDone` zůstávají
– pruh založení, potřeba stavby i ceny jedou dál; fáze se z nich odvozuje:
`done < foundingCost − burnCost` → `'fell'`; jinak `'dry'`, dokud `day < felledDay + dryDays`
nebo měsíc není v `BURN_WINDOWS`; jinak `'burn'`.

## Přehled úloh

| #   | Úloha                                                 | Kroků | Model  | Chování a otisky                         |
| --- | ----------------------------------------------------- | ----- | ------ | ---------------------------------------- |
| 1   | Pravidla a fáze čtverce – čisté funkce, díly s fázemi | ≈ 100 | Opus   | beze změny (fáze zatím nezapojené)       |
| 2   | Hromady klád u lesa – zásoba a `takeLogs`             | ≈ 90  | Opus   | beze změny (hromady u lesa ještě nejsou) |
| 3   | Klučení v simulaci – kácení, schnutí, pálení          | ≈ 140 | Opus   | mění se – nové otisky                    |
| 4   | Převod starších vsí                                   | ≈ 70  | Opus   | starší vsi jednou (Vlkov)                |
| 5   | Scéna – paseka, hromady větví, klády u lesa           | ≈ 120 | Sonnet | jen zobrazení                            |
| 6   | Scéna – ohně a kouř, postavy u ohňů, ukázka cyklu     | ≈ 130 | Opus   | jen zobrazení                            |
| 7   | Rozhraní – panel dílu a pole, horní lišta, kurzor     | ≈ 80  | Sonnet | jen zobrazení                            |
| 8   | Mapa kódu a ověření na kopii Vlkova                   | ≈ 80  | Sonnet | –                                        |

Pořadí: 1 → 2 → 3 → 4, pak 5 → 6 a 7 (souběžně smí 7 s 5). Větev se neslučuje do
`feat/landscape`, dokud nejsou hotové Úlohy 3 a 4 (ves bez převodu by měla díly bez fází vedle
dílů s fázemi – to jde, ale ať se ověří spolu). Dev server proti DB `bohemia` až po Úloze 4
(a se zálohou DB).

---

## Úloha 1 – Pravidla a fáze čtverce (čisté funkce, díly s fázemi)

**Cíl:** Nové díly v lese vznikají s `clearing`, fáze jsou čisté funkce s testy; simulace je
zatím nepoužívá (díl se dál zakládá naráz – `foundPart` dá klády z `clearing.fell` místo `trees`,
ať se počet klád nezmění).

**Soubory:** `rules-fields.ts` (`FOREST_CLEARING`, `BURN_WINDOWS` – komentář s odkazem na
forest.md); `types-land.ts` (`PartClearing`, `ClearingStage`, `FieldPart.clearing?`,
`burnedDay?` – JSDoc); nový `domain/village/forest-clearing.ts`; `obstacles.ts` (`ObstacleTally`
– nové `standingIds` pro `tree`, `youngTree`, `snag`, i v `addAddedToTally`);
`placement-fields.ts` (`PartInput` – `standing?: { id, log }[]` pro povrch `forest`, pořadí od
stromu nejblíž nejbližšímu obydlí, při shodě id; vyhrazené stromy jiné stavby vynechat – vzor
`unreservedTrees`); `placement-types.ts` (`PartInput`); `actions.ts` (ř. ~297 – díl `forest`
bez `ard` dostane `clearing` místo `trees`); `simulate-build.ts` `foundPart` (klády z
`clearing.fell` s `log`); `index.ts` exporty; nový `__tests__/forest-clearing.test.ts`.

- [ ] `clearingBurnCost(areaM2, toolCoverage)` = `foundingCostPerHa('forest', tools)` × plocha /
      ha × (1 − `fellShare`); `clearingFellCost(part)` = `foundingCost − burnCost`.
- [ ] `clearingStage(part, day)` → `'fell' | 'dry' | 'burn' | null` (null = díl bez fází nebo
      hotový); okno přes `monthInWindow(BURN_WINDOWS, dateOfDayIndex(day).month)` (vzor
      `inPlantingWindow` v `charcoal.ts`).
- [ ] `clearingNeedToday(part, day)` – kácení: zbytek kácení, schnutí: 0, pálení: zbytek celku;
      díl bez fází: `foundingCost − foundingDone` (jako dnes).
- [ ] `treesDue(part, done)` – kolik stromů má padnout při odvedené práci (strom `i` padne při
      `done ≥ fellCost × (i + 1) / n`, `EPSILON` jako `fellAsWorked`); čtverec bez stromů – kácení
      jen kameny.
- [ ] `burnFromDay(part)` – první den pálení (schnutí + okno) pro panel („Pálí se od března“).
- [ ] Testy: rozdělení ceny 60/40 (s řemesly i bez), fáze na hranicích (29. a 30. den schnutí, 28. 2. → 1. 3., 31. 10. → 1. 11.), pády po podílech, `standing` v pořadí, vyhrazený strom
      vynechaný, počet klád z nového dílu = dřívější `trees` (test založení pole v lese
      v `actions.test.ts` – `grep -n "surface: 'forest'"`).
- [ ] Commit `feat(game): fáze klučení lesa pro pole – čisté funkce`.

**Hotovo:** `typecheck`, `lint`, `test` (otisky beze změny), `format:check`.

## Úloha 2 – Hromady klád u lesa – zásoba a `takeLogs`

**Cíl:** Zásoba klád umí hromady u lesa jako podmnožinu `woodLogs`; všechny odběry jdou přes
jednu funkci. Hromady zatím nikdo nezakládá – chování beze změny.

**Soubory:** `types-state.ts` (`LogStack`, `VillageState.logStacks?`); `wood.ts` (`addStackLogs`,
`takeLogs`, `pileLogs`, `rotLogs`, `takeWood`); `carpentry.ts` (ř. ~287); `trade.ts` (ř. ~172 –
prodej; nákup jde na hromadu u vsi přes `addLogs`); `summary.ts` (souhrn klád – u vsi a u lesa);
nový `__tests__/log-stacks.test.ts`.

- [ ] `addStackLogs(state, fieldId, anchor, logs)` – přičte do `woodLogs` i do hromady pole (nová
      hromada s id z `nextId`, kotva při vzniku; existující hromada pole se jen doplní).
- [ ] `takeLogs(state, n, near?)` – bere z hromad u lesa od nejbližší k `near` (bez `near` od
      nejmenšího id), pak z hromady u vsi; vrací vzaté; hromada pod půl klády zmizí
      (`wholeLogs` = 0). Invariant `Σ logStacks.logs ≤ woodLogs` (+ tolerance).
- [ ] `rotLogs` hnije i hromady u lesa stejným denním činitelem (`DAILY_LOG_KEEP`).
- [ ] `takeWood` (`plan.fromPile`), tesař a prodej přes `takeLogs` – stavba s polohou staveniště
      jako `near`. `pileLogs(state)` = `woodLogs − Σ hromad` pro scénu.
- [ ] Testy: invariant po přidání / odběru / hnití 365 dní, pořadí odběru (nejbližší hromada
      u lesa, pak u vsi), zmizení prázdné hromady, ves bez `logStacks` beze změny (otisky).
- [ ] Commit `feat(game): hromady klád u lesa jako část zásoby vsi`.

**Hotovo:** `typecheck`, `lint`, `test` (otisky beze změny), `format:check`.

## Úloha 3 – Klučení v simulaci – kácení, schnutí, pálení

**Cíl:** Díl s `clearing` prochází fázemi den po dni; stromy padají s prací, klády jdou na
hromadu u lesa, pálení čeká na schnutí a okno, dohoření díl založí.

**Soubory:** `simulate-build.ts` (`constructionNeed`, `build`, `invest`, `foundPart`, nová
`workClearing`); `forest-clearing.ts` (`fellDueTrees(state, part, day)`); `field-progress.ts`
(`fieldPartLooks` – vzhledy `slash`, `burnt`; typ `FieldPartLook`);
`apps/web/lib/village-view-scene-types.ts` (`FieldLook` + `'slash' | 'burnt'`) a
`apps/web/lib/scene/field-look.ts` (zatím `slash` jako `bare`, `burnt` tmavý – plná grafika
v Úloze 5, ať projde typecheck); nový `__tests__/forest-clearing-sim.test.ts`.

- [ ] `constructionNeed` pro pole = Σ `clearingNeedToday` zakládaných dílů (schnoucí 0).
- [ ] `invest` pro pole: napřed díly ve fázi `'burn'` (od nejbližšího k obydlí, při shodě id),
      pak `'fell'`, schnoucí přeskočit. **Pozor na `completes`:** znamená „stavba dostala dnešní
      potřebu“, ne „založ všechno“ – díl ve fázi kácení dostane jen zbytek kácení (všechny stromy
      padnou, `felledDay = day`), nikdy nepřeskočí schnutí; jen díl ve fázi pálení se dnes založí.
- [ ] Kácení: `fellDueTrees` pokácí stromy, na které došla práce – jedno `fellTrees` za díl
      a den, strom, který mezitím padl jinak (`isTreeStanding`), se přeskočí bez klády; dospělé
      (`log`) → `addStackLogs(state, part.fieldId, kotva, n)` (kotva = střed čtverce dílu ve
      světě – `fieldGridOf` + střed buňky; ověř helper `grep -n "squareCenter\|cellCenter"`).
- [ ] Dohoření → `foundPart`: `recordClearedObstacles(part.obstacles)`, smazat záznamy
      `felledTrees` stromů dílu, `clearWoodAt`, `burnedDay = day`, `bonusUntilDay` od `day`,
      `delete part.clearing`. Díl bez fází postaru (`trees` → `addLogs`).
- [ ] `build` – počáteční smyčka „díl bez práce se založí hned“ jen pro díly bez `clearing`.
- [ ] `fieldPartLooks`: kácení `{ look: 'slash', work: felled / n }`, schnutí `'slash'`, pálení
      `{ look: 'burnt', work: podíl pálení, before: 'slash' }`; připravený díl s `burnedDay`,
      `sownYears` 0 a bez práce plodiny → `'burnt'` (práce plodiny ho přepíše – `cropLooks`).
- [ ] Testy (syntetická vrstva s lesem – vzor testů pole v lese v `actions.test.ts` /
      `overgrowth.test.ts`): stromy padají postupně a nechají pařezy; klády na hromadě u lesa
      = dospělé stromy; kácení v lednu → pálení až 1. 3.; v červnu → po 30 dnech; dohoření
      odstraní překážky a spustí bonus od dne dohoření; schnoucí pole nebere práci (jde do jiné
      stavby); celková práce = dřívější `foundingCost`; **po kouscích** (1 / 7 / 30 dní / celé).
- [ ] Zlaté otisky – spustit; změněné jen záměrně, s komentářem.
- [ ] Commit `feat(game): klučení lesa pro pole po fázích – kácení, schnutí, pálení`.

**Hotovo:** `typecheck`, `lint`, `test`, `format:check`; měřítko výkonu (dopočet 2 roky).

## Úloha 4 – Převod starších vsí

**Cíl:** Rozestavěný díl v lese bez fází je dostane jednou, odvedená práce se zachová.

**Soubory:** `forest-clearing.ts` (`withForestClearing(state, layer, day)`);
`application/update-village.ts` (řetěz převodů s vrstvou – vedle `withObstacleClearing`, ř. ~183);
`simulate.ts` `advanceVillageSteps` (jen s `obstacles !== null`, idempotentně – ověř, jestli
všechny cesty k dopočtu jdou přes `update-village.ts`); `__tests__/forest-clearing-migration.test.ts`.

- [ ] Díl `founding`, `surface === 'forest'`, bez `clearing`, s `obstacles`: `fell` z jeho
      překážek podle druhu ve vrstvě (`tree`, `youngTree`, `snag`) a lesa vsi (`obstacles.added`);
      `log` dostane prvních `part.trees` dospělých (počet klád se nezmění), `trees` smazat;
      `burnCost` = `foundingCost × (1 − fellShare)` (cena kamenů zvlášť uložená není).
- [ ] Odvedená práce ≥ kácení → všechny stromy padnou v den převodu (klády na hromadu u lesa),
      `felledDay = day − dryDays` (suché hned); jinak `fellDueTrees` podle práce.
- [ ] Bez vrstvy nebo bez `obstacles` dílu – beze změny (díl se založí postaru).
- [ ] Testy: idempotence (dvakrát = jednou), práce zachovaná, klády celkem = dřívější `trees`,
      hotové díly beze změny, ves bez lesních dílů vrácená beze změny (stejný objekt).
- [ ] Commit `feat(game): převod rozestavěných dílů v lese na fáze klučení`.

**Hotovo:** `typecheck`, `lint`, `test`, `test:db` (načtení uložené vsi), `format:check`.

## Úloha 5 – Scéna – paseka, hromady větví, klády u lesa

**Cíl:** Na čtverci ve fázi kácení a schnutí je paseka s pařezy a hromadami větví, spálenina je
černá s popelem, hromady klád u lesa jsou vidět a ubývají.

**Soubory:** nový `tools/blender/clearing.py` → `apps/web/public/models/clearing/clearing.glb`
(hromada větví ve 3 velikostech, ohořelý zbytek; vlastní dílo – `LICENSE.md` vedle, vzor
`funeral.py`); `apps/web/lib/scene/field-look.ts` (obtisky `slash` – hrabanka s klestím,
`burnt` – černá zem s šedým popelem; najdi tabulku barev/textur vzhledů `grep -n "'bare'"`);
nový `lib/scene/clearing-slash-layout.ts` (čisté – místa hromad z `hash01(partId, k)`, 2–4 na
čtverec, mimo pařezy) a `lib/scene/clearing-slash.ts` (thin instances, přestavba jen při změně
klíče dílů a fází); `log-pile-layout.ts` (`logStackSite` – volné místo do 20 m od kotvy mimo
díly pole, vodu, cesty a stavby; bez místa `null`); `log-pile.ts` (hromada u vsi =
`pileLogs`, k ní hromady u lesa – instance jedné sítě, `MAX_SHOWN_LOGS` na hromadu);
`lib/village-view-scene.ts` `sceneVillage` a `village-view-scene-types.ts`
(`SceneVillage.logStacks?: { id, x, z, logs }[]` v celých kládách, `woodLogs` = u vsi,
`SceneFieldPart.burnedDay?`); `village-renderer.ts` (zapojení, `needsRender` při změně).

- [x] Ověř pařezy mladých stromků a souší ve `felled-trees.ts` (měřítko pařezu) a že
      `villageClearedForest` (`cleared-forest.ts`) přepne čtverec na vymýcený, jakmile padne
      polovina dospělých stromů – jinak oprav.
- [x] Hromady větví na `slash` a na nevypálené části `burnt` (`work`, `before`); na spálenině
      ohořelé zbytky do první práce.
- [x] Testy layoutů (deterministická místa, ne na pařezu, hromada klád ne na poli ani ve vodě).
- [x] Commit `feat(web): paseka s hromadami větví a hromady klád u lesa`.

**Hotovo:** `typecheck`, `lint`, `test`, `test:e2e` (importy Babylonu), `format:check`; snímek
paseky malý, až na konci.

**Provedení (návrh Clauda 26. 10. 2026):** sítě hromad větví a ohořelého zbytku jsou
procedurální v `clearing-slash.ts` (jednodušší než Blender – žádný soubor modelu ani licence,
tři velikosti = násobek instance); `ClearingSlash` i hromady u lesa zapojené v
`landscape-scene.ts` vedle `LogPile` (tam se hromada klád kreslí). Pařez mladého stromku
zmenšen (`stumpScale`). Mapa kódu: `docs/code/scene.md` – Paseka klučení. E2e a snímek
zůstávají na Úlohu 6 (bez dev serveru).

## Úloha 6 – Scéna – ohně a kouř, postavy u ohňů, ukázka cyklu

**Cíl:** Při pálení hoří hromady větví (plameny, jiskry, záře), stoupá hustý kouř, večer žhnou
uhlíky, dohořelý čtverec 2 dny kouří; postavy rozhrnují oheň; cyklus je k vidění v `/dev`.

**Soubory:** `lib/scene/pyre-fire.ts` (`fireSprites` s tvarem ohně – hranice / hromada větví,
nebo nový `heapFireSprites` nad `hash01` a `FIRE_CELLS`); `lib/scene/smoke-schedule.ts`
(`SmokeKind` + `'slash'`, `SLASH_PLUME` – hustší než dýmník, menší než hranice, `plumeShape`,
čistá `clearingFireState(part, gameDay)` → `{ fire, glow, smoke }` – plameny v pracovní den
pálení jako `CRAFT_FIRE`, večer záře, doutnání do `burnedDay + smolderDays`); nový
`lib/scene/clearing-fire-renderer.ts` (vzor `FuneralRenderer` – `SpriteManager` s `fire.png`,
kapacita `MAX_FIRE_SQUARES` × hromady × sprity, jen v záběru – `BoundingInfo`); `village-renderer.ts`
`updateSmokeSources` (ř. ~1401 – zdroje `'slash'`, nejvýš `MAX_SLASH_PLUMES`, pořadí podle id
dílu) a zapojení rendereru do `animate` / `dispose`; `landscape-scene.ts` (takt `WATER_FPS`,
omezený pohyb); `lib/scene/villager-plan-fields.ts` `founding` (na čtverci pálení postavy
u hromad s klipem `'hoe'`, při kácení půlka kácí, půlka nosí kmen k hromadě u lesa – klip
`'carry-wood'`, `walkRoute`); `lib/scene/building-showcase-layout.ts` (`SHOWCASE_CLEARING`
`'kluceni-cyklus'` – posuvník kácení → schnutí → pálení → spálenina, vzor `SHOWCASE_KILN`
`'milir-cyklus'`); nový `__tests__/clearing-fire.test.ts`.

- [ ] Strop ohňů: velká ves spálí celé pole za den – ohně jen na `MAX_FIRE_SQUARES` (≈ 12)
      čtvercích nejblíž středu záběru, ostatní hořící čtverce jen kouř; změřit draw cally.
- [ ] Testy: sprity deterministické (stejný čas → stejné), `clearingFireState` na hranicích dne
      a doutnání, strop zdrojů kouře.
- [ ] Commit `feat(web): ohně a kouř při pálení paseky`.

**Hotovo:** `typecheck`, `lint`, `test`, `test:e2e`, `format:check`; snímek pálení v ukázce
(malý).

## Úloha 7 – Rozhraní – panel dílu a pole, horní lišta, kurzor

**Cíl:** Hráč pozná fázi čtverce ikonou, kdy se bude pálit a kolik klád leží u lesa.

**Soubory:** `apps/web/lib/village-view-fields.ts` (ř. ~185 – `founding.clearing: { stage,
progress, treesLeft, burnFrom? }`, u pole počty čtverců po fázích); `village-view-types.ts`;
`components/game/hud/selection/fields.tsx` (ř. ~241 a ~417 – ikony `wood` kácení,
`hourglass` schne – datum v `Tooltip`, nová `fire` pálí se – pruh); `tools/blender/icons.py`
→ `public/icons/resources/fire.png` + řádek v `public/icons/LICENSES.md`; `TopBar.tsx`
(ř. ~454 – popisek „u vsi“ / „u lesa“, `view.woodLogsForest`); popisek u kurzoru při malování
pole v lese (najdi `grep -rn "forest" lib/build-items.ts components/game/hud/CursorReason.tsx`);
ukázka `/dev/panels`; testy `SelectionPanel.test.tsx`.

- [ ] Jen ikony s čísly, slova v popiscích (CLAUDE.md – Rozhraní).
- [ ] Commit `feat(web): fáze klučení v panelu dílu a klády u lesa v horní liště`.

**Hotovo:** `typecheck`, `lint`, `test`, `test:e2e`, `format:check`.

## Úloha 8 – Mapa kódu a ověření na kopii Vlkova

**Cíl:** Dokumentace odpovídá kódu, mechanika ověřená na skutečné vsi.

- [ ] `docs/code/village-fields.md`, `village-core.md`, `scene.md` / `scene-village.md`,
      `web-ui.md` – krátké odstavce s názvy funkcí; forest.md – „Implementováno“ do stavu.
- [ ] Kopie Vlkova (záloha DB `bohemia`): založit pole v lese ≈ 0,5 ha v listopadu a dopočítat
      1 rok – stromy padají, hromada u lesa roste a ubývá stavbami, pálení 1. 3., bonus od
      dohoření, jař na spálenině; čas dopočtu před a po (nejvýš +5 %).
- [ ] Jeden malý snímek pálení ve hře; Martinovi celá URL dev serveru (jen jeden server).
- [ ] Commit `docs: mapa kódu klučení lesa` a sloučit do `feat/landscape` (`Refs #10`).

## Rizika

- **`completes` v `invest`** dnes zakládá všechny díly stavby – s fázemi by přeskočil schnutí.
  Test: velká společná práce na pole v lese v lednu → nic se nezaloží před 1. 3.
- **Vyhrazený strom jiné stavby** na čtverci: v kácení nepadne, při dohoření zmizí jako dosud
  (stavba ho počítá jako pokácený bez klády – forest.md, Vyhrazený strom patří své stavbě).
- **Les vsi** (`obstacles.added`) – stromy se kácí jako stromy krajiny, `clearWoodAt` až po
  dohoření; ověř `dropClearedWoods`.
- **Záznamy `felledTrees`** při dohoření smazat jen pro stromy dílu – průseky cest
  (`roads.swath`) a jiné pařezy nechat; `grep -rn "felledTrees" packages apps` na místa, která
  počítají pařezy.
- **Mnoho ohňů naráz** – strop ohňů a kouře, sprity bez nových vertex bufferů.
- **Pole v lese bude hotové později** (schnutí, okno pálení) – ves, která na pole v lese čeká
  s jídlem, může hladovět dřív; kalibrace jen na pokyn, upozornit Martina v souhrnu.

## Mimo plán

- Stavby v lese (obydlí, dílny) – klučí se dál naráz; vracení zarostlého přílohu beze změny.
- Počasí (pálení jen za sucha, déšť prodlouží schnutí), požár lesa, zvuk ohně.
- Postavy a vozy vozící klády z hromady u lesa na staveniště.
- Setí do popela bez kopání – otázka na Martina (forest.md).
