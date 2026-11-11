# Kamenné zdivo a kostely – plán implementace

**Stav:** rozpracováno v noci 11.→12. 11. 2026 (Martin: „udělej toho do rána co nejvíc, věci nějak
rozhodni sám“). Rozhodnutí při implementaci zapisovat do návrhů jako „návrh Clauda“.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pokřtěný vojvoda pozve stavební huť (adriatický nebo karolinský okruh) – pět mistrů
dorazí za 60 dní, usadí se, ves je živí, mezi stavbami čekají, při hladu a nízkém štěstí odcházejí,
žení se, učí syny a z nejzkušenějších pomocníků vyrůstají noví mistři; hráč postaví kostel typu
podle okruhu s rozměry, které sám zvolí, cena se odvodí z objemu zdiva (kámen, vápno pálené u stavby,
písek z písníku, dřevo, práce po oborech mistrů); kostel s knězem dává křesťanům štěstí, zrychluje
obrácení, má hřbitůvek a oddávají se v něm.

**Architecture:** Typy a čísla jsou hotové: `domain/village/types/types-masonry.ts`
a `domain/village/rules/rules-masonry.ts` (LODGE, MASON_CRAFTS, LIME, MORTAR, CHURCH,
CHURCH_WORK_CRAFT) – úlohy je **nemění bez důvodu**, nové typy přidávají vedle. Geometrie kostela je
jedna čistá funkce jádra (`churchParts`), ze které čerpá cena, umístění i scéna. Mistři a kněz jsou
obyčejné osoby vsi (`Person.mason`, `Person.priest`), huť je volitelná část `VillageState.lodge`,
kostely `VillageState.churches`, staveniště kostela je `Construction` druhu `church` s podstavem
`Construction.church`. Žádná migrace DB (stav vsi je JSON); nové části stavu jsou volitelné, starší
vsi je nemají – **zlatý otisk vsi a otisky Vlkova se nesmí změnit**.

**Tech Stack:** TypeScript 6, Vitest, Next.js 16, React 19, Babylon.js 9, Playwright.

**Spec:** [stone-masonry.md](../../design/stone-masonry.md), [churches.md](../../design/churches.md)
(obojí schváleno 11. 11. 2026), navazuje [christianity.md](../../design/christianity.md).

## Global Constraints

- Čísla jen v `rules*.ts` s odkazem na sekci návrhu; nové číslo = i věta v návrhu (návrh Clauda).
- Determinismus: žádné `Math.random`, `Date.now`, `new Date()` v `packages/game`; los ze
  `createRandom(deriveSeed(…))`; test „vcelku = po kouscích“ u každé simulační změny.
- Ves bez huti a bez kostela simuluje **bit po bitu stejně** – `village-golden.test.ts` beze změny.
- Hexagon: doména neimportuje use-casy ani infrastrukturu; web volá use-casy přes `apps/web/lib/`.
- Rozhraní jako 0 A.D.: ikony s čísly, slova jen v `Tooltip`, důvod zašedlého tlačítka u kurzoru.
- Babylon jen z konkrétních modulů, kreslení jen při změně, WebGPU ≤ 8 vertex bufferů.
- Texty česky, krátká pomlčka „–“, nikdy „—“; commity Conventional Commits česky s
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pracovní strom: `git -C /Users/martin-pracovni/Projects/Bohemia worktree add
/Users/martin-pracovni/Projects/Bohemia-wt/<úloha> -b feat/<úloha> feat/landscape`, pak
  `npm install --prefer-offline --no-audit --no-fund`. Zakázáno: `git stash`, `rm -rf`, push,
  `db:migrate` do `bohemia`, kalibrace. Před koncem `npm run typecheck`, `lint`, `test`,
  `format:check`, `check:docs`; u simulace i `npm run test:slow`. E2e pouští hlavní relace Clauda.
- Mapu kódu (`docs/code/`) doplnit u každé úlohy: nový soubor `docs/code/village-masonry.md`
  (huť, vápno, kostel) + řádek v tabulce v `CLAUDE.md`.

## Review Focus

1. **Ves bez huti** – nic se nemění (zlatý otisk, Vlkov); huť ani kostel nevzniknou v NPC vsi sami.
2. **Mistr zemře nebo odejde uprostřed stavby** – práce jeho oboru stojí, ostatní pokračují, nový
   mistr (≥ 600 čd) práci převezme; stavba bez stavbyvedoucího stojí celá. Test v M3/M4.
3. **Zima** – zdění, základy a pálení vápna stojí mimo duben–říjen, lámání a písek běží; dopočet po
   kouscích přes přelom října a dubna dává stejný výsledek. Test v M3.
4. **Víc kostelů** – pokrytí se sčítá a ořízne na 1; každý kostel má svého kněze a hřbitůvek;
   plný hřbitůvek → starý hřbitov kostrově. Test v M5.
5. **Převody a odchody** – rozdělení vsi, stěhování, smrt mistra bez syna; mistr odchází
   s celou rodinou (`removePeople` s emigranty). Test v M4.

---

### M1: Geometrie a cena kostela (čistá doména)

**Files:** Create `packages/game/src/domain/village/buildings/church-geometry.ts`, test
`buildings/__tests__/church-geometry.test.ts`.

**Interfaces – Produces:**

- `churchTypesFor(circle: MasonryCircle): readonly [small: ChurchType, large: ChurchType]` (z `CHURCH.types`).
- `defaultChurchDims(type: ChurchType): ChurchDims` – rotunda Ø 6,5 × 6 m, jednolodní 5 × 8 × 7 m,
  bazilika 8 × 20 × 10 m.
- `clampChurchDims(type: ChurchType, dims: ChurchDims): ChurchDims` – `CHURCH.limits`, druh
  `round` jen u rotundy; zaokrouhlení na 0,5 m.
- `wallThickness(height: number): number` = `wall.baseM + wall.perHeightM × height`.
- `ChurchPart` = `{ kind: 'nave' | 'aisle' | 'chancel' | 'apse' | 'atrium'; shape:
{ kind: 'rect'; cx; cz; length; width } | { kind: 'circle'; cx; cz; r } | { kind: 'half';
cx; cz; r; facing: 1 | -1 }; height: number; roof: 'gable' | 'cone' | 'halfCone' | 'lean' |
'none' }` – **místní souřadnice** (x = osa vstup → kněžiště, z = napříč, střed lodi v 0,0),
  vnitřní míry (zdi jsou vně).
- `churchParts(type: ChurchType, dims: ChurchDims): readonly ChurchPart[]` – rotunda: loď
  `circle` + dvě `half` apsidy na ose (východ, západ); `apse`: loď `rect` + `half` apsida na
  východě; `chancel`: loď + `rect` kněžiště; `basilica`: střední loď + dvě `aisle` (`lean`) +
  `half` apsida + `atrium` (`none`) na západě. Poměry z `CHURCH.parts`.
- `churchCost(type, dims): ChurchCost` – objem zdi = délka obvodu po ose zdi × výška × tloušťka
  (stěny mezi částmi jen jednou, bez otvorů) + základy (`foundationDepthM`); kámen = objem;
  vápno a písek z `MORTAR`; vápenec z `LIME.limestonePerLimeT`; dřevo = střecha × `roofWoodKgPerM2`
  - vápno × `woodKgPerLimeT`; `work`: foundation (výkop + zdění základů), quarry (kámen
  - vápenec v m³ × `STONE.quarryManDaysPerM3`, bez vzdálenosti), lime (`manDaysPerLimeT` × t
  - `kilnBuildManDays`), sand, walls (zdění + opracování), roof (plocha střech; sedlová 45°, kužel
    45°), decor (vnitřní plocha zdí × `decorManDaysPerM2`).
- `churchCapacity(type, dims): number` = plocha lodi (+ boční lodě baziliky) ÷ `m2PerPerson`, dolů.
- `churchyardRect(type, dims): { length: number; width: number; offsetX: number }` – obdélník
  kolem vnějšího obrysu o `churchyardBeltM`; `churchyardGraves(type, dims): number` =
  (plocha obdélníku − půdorys) ÷ `graveM2`, dolů.
- `churchFootprintWorld(type, dims, position: Position): readonly { x: number; z: number }[][]` –
  vnější obrysy částí ve světě (pro kontrolu terénu a scénu), jen `det-math.ts` (bez `Math.sin/cos`).

- [ ] Test: rotunda Ø 6,5 × 6 m → zdivo 150–180 m³, vápno 9,5–12 t, práce celkem 1 100–1 300 čd;
      kapacita 44; bazilika 8 × 20 × 10 dražší než jednolodní 5 × 8 × 7 alespoň 4×; `clamp` drží meze;
      `churchParts` rotundy má 3 části, baziliky 5; větší rozměr = vyšší cena i kapacita (monotónnost).
- [ ] Implementace, testy zelené, `docs/code/village-masonry.md` (sekce Geometrie a cena), commit
      `feat(game): geometrie a cena kostela z rozměrů`.

### M2: Stavební huť – pozvání, příchod, bydlení, čekání

**Files:** Create `domain/village/people/lodge.ts` (+ test), `application/invite-lodge.ts` (+ test);
modify `types/types-people.ts` (`Person.mason?: MasonCraft`, `Person.priest?: true`,
`Person.masonryXp?: MasonryXp`), `types/types-state.ts` (`lodge?: Lodge`, `churches?: readonly
Church[]`), `core/simulate.ts` (krok příchodu v pořadí dne), `core/simulate-work-people.ts`
/ `core/morning-water.ts` (mistři a kněz nepracují se vsí), `application/rights.ts`,
`apps/web/lib/village.ts` + `apps/web/app/game/actions/village.ts` (server actions bez UI).

**Interfaces – Produces:**

- `canInviteLodge(state: VillageState, day: number): 'ok' | 'not-baptized' | 'already' | 'no-lord'`
  – rod pokřtěný (`rodBaptized`), huť ani pozvání není.
- `inviteLodge(state, circle: MasonryCircle, day): VillageState` – `lodge = { circle, invitedDay:
day, arriving: MASON_CRAFTS.map(role => ({ role, day: day + LODGE.arrivalDays })) }`.
- `inviteMaster(state, craft: MasonCraft, day): VillageState` – jen chybějící obor, stejný okruh.
- `arriveFromAbroad(state, role: MasonCraft | 'priest', day, random): VillageState` – nová osoba
  (muž, věk `LODGE.masterAge`, svobodný, křesťan, `origin` cizinec, jméno podle okruhu – adriatický
  latinsko-dalmatská, karolinský bavorská jména; kněz bez jména okruhu), vlastní domácnost: volné
  obydlí, jinak host ve dvorci vojvody a obydlí se mu staví přednostně (vzor `displaced.ts`,
  `settleNewDwelling`); kronika `newcomer`.
- `lodgeArrivalsDay(state, day, random): VillageState` – zpracuje `lodge.arriving` s `day ≤ den`.
- `isLodgeIdle(person: Person): boolean` – mistr / kněz → nepracuje na poli ani ve vsi (jí).
- Use-casy `inviteLodgeForVillage({ villageId, circle })`, `inviteMasterForVillage({ villageId,
craft })` přes `updateLivingVillage` (vzor `application/quarry.ts`), právo `'ennoble'`;
  `lib/village.ts`: `inviteLodgeForPlayer`, `inviteMasterForPlayer`; server actions `inviteLodge`,
  `inviteMaster`.

- [ ] Testy: nepokřtěný rod → `not-baptized`; pozvání → po 60 dnech 5 mistrů s `mason`, každý
      ve vlastní domácnosti nebo host ve dvorci s předností do nového obydlí; mistři nepracují; dopočet
      vcelku = po kouscích; ves bez huti beze změny (zlatý otisk).
- [ ] Implementace, `docs/code/village-masonry.md` (sekce Stavební huť), commit
      `feat(game): pozvání stavební huti a příchod mistrů`.

### M3: Stavba kostela v simulaci (po M1, M2)

**Files:** Create `domain/village/buildings/church-build.ts` (+ test), `domain/village/placement/
placement-church.ts` (+ test), `application/place-church.ts` (+ test); modify
`types/types-construction.ts` (`ConstructionKind` + `'church'`, `Construction.church?: ChurchSite`),
`buildings/build-intent.ts`, `core/simulate-build.ts`, `core/simulate-work-apply.ts`,
`apps/web/lib/village.ts`, `apps/web/app/game/actions/village.ts`.

**Interfaces – Produces:**

- `ChurchSite` = `{ type; dims; done: Partial<Record<ChurchWork, number>>; limeT: number;
stoneM3: number; sandM3: number; kilnDone: number; burnUntilDay?: number; kiln: { x; z };
sandPit: { x; z }; quarryId?: number }`.
- `checkChurchPlacement(state, land, type, dims, position): PlacementCheck` – celý obdélník
  hřbitůvku (`churchyardRect`, natočený) volný jako u ostatních staveb, terén pod obrysy
  (`checkFootprintTerrain`), stromy se kácí jako u stavby v lese; vykácený posvátný háj = nespokojenost
  (`recordFelledSacred`); chyby `CHURCH_NO_LODGE`, `CHURCH_NO_QUARRY` (žádný lom ve vsi).
- `startChurch(state, land, intent): VillageState` – `kiln` vedle staveniště, `sandPit` u nejbližší
  vody (deterministicky z krajiny), `quarryId` = nejbližší lom.
- `churchWorkDay(state, land, constructionId, manDays, day): { state; used; byWork }` – rozdělí
  čd dne podle priority: kámen a písek do zásoby napřed (strop = potřeba celé stavby), pec, pálení
  dávkami (`kilnBatchLimeT`, `kilnBurnDays`, dřevo z dřeva stavby), základy, zdi omezené zásobou
  kamene, vápna a písku (podíl `walls` ≤ min podílů materiálu), střecha po zdech, výzdoba po
  střeše. Práce oboru bez mistra (`CHURCH_WORK_CRAFT`) stojí, bez `builder` stojí všechno;
  základy, zdi a pálení jen v `CHURCH.season`. Lámání podle vzdálenosti lomu
  (`quarryManDaysPerM3`), kámen z hromad vsi napřed (`takeStone`).
- `churchProgress(site): { foundation; walls; roof; decor }` (0–1) – pro scénu a panel.
- Dokončení (střecha hotová) → `VillageState.churches` (`Church`), výzdoba pokračuje a nastaví
  `decoratedDay`; staveniště končí po výzdobě, nebo hned bez štukatéra.
- `gainMasonryXp(state, byCraft: Partial<Record<MasonCraft, number>>, day): VillageState` – čd
  oboru dostanou dospělí vesničané (ne mistři, ne elita), kteří dnes pracovali, po 1 čd od
  nejzkušenějších v oboru (soustředí zkušenost); synové mistra od `LODGE.apprenticeFromAge` dostanou
  1 čd v oboru otce za den, kdy otec pracoval.
- Use-case `placeChurchForVillage({ villageId, type, dims, position })` (právo `'build'`),
  `lib/village.ts`: `placeChurchForPlayer`; server action `placeChurch`. Typ musí patřit okruhu huti.

- [ ] Testy: malá rotunda u vsi s hutí a lomem se dostaví za 1–3 roky; zima zdi stojí, lámání ne;
      bez vápeníka nevznikne vápno a zdi se zastaví po vyčerpání zásoby; bez stavbyvedoucího nic;
      vcelku = po kouscích přes 1. 11. a 1. 4.; zkušenost pomocníků roste; zlatý otisk beze změny.
- [ ] Implementace, `docs/code/village-masonry.md` (sekce Stavba kostela), commit
      `feat(game): stavba kostela – kámen, vápno, písek a práce mistrů`.

### M4: Odchod mistrů, rodina, noví mistři (po M2)

**Files:** Create `domain/village/people/lodge-life.ts` (+ test); modify `core/simulate.ts`,
`people/marriage.ts` (jen pokud mistři nejsou svobodní k sňatku), `people/kinship.ts` (smrt mistra).

**Interfaces – Produces:**

- `lodgeLeavingDay(state, satiety: number, day, random): VillageState` – počítadla
  `lodge.hungryDays` / `unhappyDays` (`LODGE.leaving`); po dosažení meze jeden los na mistra:
  bez manželky a dětí ve vsi odchází vždy, jinak `familyChance`; odchází s celou domácností
  (`removePeople` s emigranty, kronika), počítadlo se vynuluje.
- `promoteMasters(state, day): VillageState` – za každý obor bez živého mistra (ani na cestě) se
  mistrem stane osoba s nejvyšší `masonryXp[obor]` ≥ `LODGE.masterXpManDays` (syn nebo pomocník).
- Mistr se žení jako ostatní svobodní (ověřit `isSingle`, `arrangeMarriages`).

- [ ] Testy: hlad 30 dní → svobodný mistr odejde, ženatý s dětmi ve vsi zůstane ve 3 ze 4 losů (seed);
      smrt mistra + pomocník s 650 čd → nový mistr; s 500 čd → nikdo, `inviteMaster` povoleno;
      vcelku = po kouscích; zlatý otisk beze změny.
- [ ] Implementace, `docs/code/village-masonry.md` (sekce Odchod a noví mistři), commit
      `feat(game): odchod mistrů huti, rodiny a noví mistři`.

### M5: Kostel ve vsi – kněz, pokrytí, štěstí, obrácení, hřbitůvek (po M3)

**Files:** Create `domain/village/people/church-life.ts` (+ test); modify `people/conversion.ts`
(`hasChurch` → `churchCoverage`), `people/happiness.ts`, `buildings/cemetery.ts` / `people/burials.ts`,
`people/__tests__/conversion.test.ts`, `rules/rules-faith.ts` (`conversion.withChurch` a
`churchHappiness` nahradit odkazem na `CHURCH`, text `christianity.md` upravit).

**Interfaces – Produces:**

- `churchCoverage(state): { coverage: number; decorated: number }` – jen kostely s knězem;
  kapacity se sčítají, ÷ lidé ve vsi, ≤ 1; `decorated` jen z vyzdobených.
- Štěstí křesťanů = `happinessPerCoverage × coverage + decorHappinessPerCoverage × decorated`;
  obrácení = `conversion.base + conversion.perCoverage × coverage`, × (1 + podíl křesťanů).
- Kněz: `priestDay(state, day, random)` – kostel bez kněze dostane `LodgeArrival { role: 'priest',
churchId }` na `finishedDay + priestAfterDays`, po smrti na den smrti + `newPriestAfterDays`;
  příchod přes `arriveFromAbroad`, nežení se, nepracuje.
- Pohřeb křesťana: kostel s knězem a volným hrobem (`churchyardGraves`; hrob starší než
  `CHURCH.graveReuseYears` = 30 let se uvolní – Martin „Ať se po čase uvolní“) nejblíž domu →
  `graves`, jinak starý hřbitov kostrově (dnešní chování).

- [ ] Testy: pokrytí 0 → stejné obrácení i štěstí jako dnes (zlatý otisk); kostel pro polovinu vsi
      → +20; dva kostely se sčítají, strop 1; kněz po roce, po smrti nový za 60 dní; plný hřbitůvek →
      starý hřbitov; vcelku = po kouscích.
- [ ] Implementace, docs (`village-masonry.md` sekce Kostel ve vsi, `christianity.md` Kostel →
      odkaz na churches.md), commit `feat(game): kostel s knězem – štěstí, obrácení a hřbitůvek`.

### M6: Scéna – model kostela z rozměrů (po M1)

**Files:** Create `apps/web/lib/scene/church-mesh.ts` (+ test), `apps/web/lib/scene/church-renderer.ts`;
modify `apps/web/lib/scene/village-construction.ts` (stadia), `apps/web/lib/village-view-buildings.ts`
(data kostelů a stavenišť pro scénu).

**Interfaces – Produces:**

- `churchMeshData(parts: readonly ChurchPart[], progress: { foundation; walls; roof; decor },
thickness: number): { walls; roofs; windows }` (pozice, normály, UV, indexy) – zdi jako
  tlusté stěny (`rect` = 4 stěny, `circle` / `half` = 24 / 12 segmentů), výška zdí × `walls`,
  základy nad terén 0,3 m, střechy: `gable` 45°, `cone`, `halfCone` (koncha), `lean` k lodi; malá
  okna (tmavé obdélníky) po 3 m ve horní třetině lodi, vchod na západě.
- `ChurchRenderer` – omítnuté zdi (světlý vápenný materiál, `applyGammaFog`), šindel, holé
  kamenné zdi bez výzdoby o stupeň tmavší; lešení (tyče) při stavbě zdí; kreslí jen při změně.
- Kostel ve scéně podle `Church.position` (natočení), staveniště podle `churchProgress`.

- [ ] Testy: počty trojúhelníků rotundy a baziliky, výška zdí roste s `walls`, bez střechy při
      `roof = 0`; e2e test importů Babylonu projde.
- [ ] Implementace, `docs/code/scene-village.md` (sekce Kostel), commit
      `feat(web): model kostela složený z rozměrů`.

### M7a: Rozhraní huti (po M2)

Tlačítko u vojvody „Pozvat stavební huť“ (ikona huti, tooltip), výběr ze dvou okruhů (ikony, tooltip
s typy kostelů), zašedlé s důvodem u kurzoru (nepokřtěný, už pozváno); v panelu osoby ikona oboru
mistra (5 ikon), kněz; u vojvody „Pozvat mistra“ pro chybějící obor; na cestě odpočet dní. Vzor
`BaptizeButton`, `EnnobleActions` (`components/game/hud/selection/people.tsx`), příznaky přes
`lib/selection-details.ts`. Ikony podle stávajícího postupu ikon (`tools/blender/icons.py`, nebo jak
vznikla ikona `faith-cross`). Testy komponent jako `BaptizeButton.behavior.test.tsx`; docs
`web-ui.md`. Commit `feat(web): pozvání stavební huti a mistři v rozhraní`.

### M7b: Rozhraní kostela (po M3, M6)

V nabídce staveb dva kostely okruhu huti (bez huti zašedlé s důvodem). Umístění: tah – začátek =
vstup (západ), konec = délka a směr osy (rotunda: průměr), šířka a výška tlačítky +/− v panelu u
potvrzení (vzor `FortConfirm`, `QuarryBody`), čísla rozměrů a cena (kámen, vápno, písek, dřevo, čd)
u kurzoru (`PlacementPreview`), náhled modelem z M6; kontrola `checkChurchPlacement`. Panel kostela
a staveniště: postup po druzích práce (ikony a %), kapacita, pokrytí, hroby, kněz; chybějící mistr
jako varování. Testy `build-items`, placement; docs `web-ui.md`. Commit `feat(web): umístění kostela
s rozměry a panel kostela`.

### M8: Scéna – staveniště, hřbitůvek, svatby (po M5, M6)

Zahloubená vápenná pec (jáma s ohněm a kouřem při pálení), vápenná jáma, hromady kamene a písku,
písník u vody (vzor `ore-site-layout.ts`), hroby na hřbitůvku (vzor `cemetery-layout.ts`), svatby
křesťanů u kostela (`wedding-plan.ts`, nový druh místa `church`), kněz ve scéně jako postava.
Docs `scene-village.md`. Commit `feat(web): staveniště kostela, hřbitůvek a svatby u kostela`.

### M9: E2e a závěr (hlavní relace)

E2e: pokřtěný dev rod pozve huť, skok v čase o 60 dní, mistři ve vsi; umístění rotundy, stavba se
rozběhne. Celé `test:e2e`, `test:slow`, docs v `CLAUDE.md` a `village-masonry.md`, ranní tabulka.
