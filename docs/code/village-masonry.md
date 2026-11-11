# Ves – kamenné zdivo, stavební huť a kostely

Mapa kódu – podrobnosti k mechanikám. Pravidla a rozhodnutí: stone-masonry.md, churches.md v `docs/design/`, plán `docs/superpowers/plans/2026-11-11-masonry-churches.md`.

## Stavební huť

- **Stav:** `VillageState.lodge` (okruh, den pozvání, `arriving` – mistři a kněží na cestě,
  počítadla odchodu), `VillageState.churches`; mistři a kněz jsou osoby vsi (`Person.mason`,
  `Person.priest`, `Person.masonryXp`). Starší vsi je nemají, převod netřeba.
- **Pozvání** (`domain/village/people/lodge.ts`): `canInviteLodge` (pokřtěný rod, ves s vojvodou,
  huť ještě není), `inviteLodge` (pět mistrů s příchodem za `LODGE.arrivalDays`), `canInviteMaster`
  a `inviteMaster` (chybějící obor stejného okruhu).
- **Příchod:** `lodgeArrivalsDay` je krok dne v `core/simulate.ts` těsně před `occupyEmptyDwellings`;
  losy ze seedu vsi, oboru a dne příchodu. `arriveFromAbroad` (čistá, pro mistra i kněze) vytvoří
  svobodného křesťana ve věku `LODGE.masterAge`, jméno z `MASTER_NAMES` podle okruhu, `origin` podle
  `MASTER_ORIGIN`. Bydlení: volné obydlí bez dílny, jinak host ve dvorci vojvody se záznamem
  `VillageState.displaced` (nové obydlí osídlí přednostně – `rehouseDisplaced`). Kronika `newcomer`.
- **Práce:** `isLodgeIdle` (mistr, kněz) – `villagersToday` (`core/morning-water.ts`) je z práce vsi
  vynechává; jedí jako ostatní (`marriagesAndMealDay` bere všechny osoby).
- **Use-casy:** `application/invite-lodge.ts` (`inviteLodgeForVillage`, `inviteMasterForVillage`,
  texty `INVITE_LODGE_REASONS`); právo `ennoble` v `ACTION_RIGHTS`. Web: `inviteLodgeForPlayer`,
  `inviteMasterForPlayer` v `apps/web/lib/village.ts`, server actions `inviteLodge`, `inviteMaster`.

## Odchod a noví mistři

Soubor `domain/village/people/lodge-life.ts`; návrh `docs/design/stone-masonry.md` – Svoboda,
rodina a odchod, Zkušenost a noví mistři. Vše jen u vsi s `lodge`, ves bez huti krok přeskočí bez
losu (zlatý otisk).

- **Krok dne:** `lodgeLifeDay(state, satiety, day)` volá `peopleDay` (`core/simulate.ts`) na konci dne
  po jídle, úmrtích a štěstí (ves, která vymřela, ho nedostane); zavolá `lodgeLeavingDay` a pak
  `promoteMasters`.
- **Odchod:** `lodgeLeavingDay` vede `lodge.hungryDays` (nasycení pod `LODGE.leaving.satietyBelow`)
  a `lodge.unhappyDays` (štěstí vsi pod `happinessBelow`); po dosažení `hungryDays` / `unhappyDays`
  padne los na každého mistra (`createRandom(deriveSeed(seed, 'lodge-leave:<id>:<den>'))`, v pořadí
  id), bez manželky a dětí ve vsi odchází vždy, jinak s `familyChance`. Počítadla se po losu
  vynulují, i když mistr zůstal. Odchází `masterHousehold` (mistr, manželka, jejich svobodné děti
  v jeho obydlí) přes `removePeople` s emigranty (směr `MASTER_ORIGIN`) a zápis `master-left`.
- **Noví mistři:** `promoteMasters` – za obor bez živého mistra i bez mistra na cestě dostane
  `mason` dospělý (≥ `AGE.fertile`) bez `mason` a `priest` s nejvyšším `masonryXp[obor]` ≥
  `LODGE.masterXpManDays`, při shodě nižší id; zápis `master-promoted`. Nikdo vhodný → obor zůstane
  prázdný a `canInviteMaster` dá `ok`.
- **Učni:** `masonApprentices(state, master, day = state.lastDay)` – synové (`fatherId`) v obydlí
  mistra od `LODGE.apprenticeFromAge`; zkušenost jim přičítá práce huti (úloha M3).
- **Sňatky:** mistr je obyčejný svobodný muž (`isSingle`), žení se jako ostatní.
- **Kronika:** `master-left` / `master-promoted` (`types-chronicle.ts`), text
  v `apps/web/lib/village-view-chronicle.ts`.

## Geometrie a cena kostela

Typy: `types/types-masonry.ts` (`ChurchType`, `ChurchDims`, `ChurchCost`, `ChurchWork`), čísla:
`rules/rules-masonry.ts` (`CHURCH`, `LIME`, `MORTAR`, `CHURCH_WORK_CRAFT`) a `STONE` z
`rules/rules-stone.ts`. Vše počítá čistá doména v `buildings/church-geometry.ts` (testy
`buildings/__tests__/church-geometry.test.ts`); ze stejných funkcí čerpá cena, umístění i scéna.

- **Místní souřadnice** (churches.md – Velikost a cena): x = osa vstup → kněžiště, z = napříč,
  střed hlavní lodi v 0,0; míry částí jsou vnitřní, zdi jsou vně. `churchParts(type, dims)` vrací
  `ChurchPart[]` (`nave`, `aisle`, `chancel`, `apse`, `atrium`; tvar `rect` / `circle` / `half`,
  výška, střecha `gable` / `cone` / `halfCone` / `lean` / `none`): rotunda 3 části (kruhová loď +
  dvě půlkruhové apsidy na ose), `apse` loď + půlkruhová apsida, `chancel` loď + obdélné kněžiště,
  `basilica` 5 částí (střední loď, dvě boční, apsida, atrium na západě bez střechy).
- **Typy a rozměry:** `churchTypesFor(circle)` (malý, velký), `defaultChurchDims(type)` (rotunda
  Ø 6,5 × 6, jednolodní 5 × 8 × 7, bazilika 8 × 20 × 10), `clampChurchDims` (`CHURCH.limits`,
  0,5 m, druh `round` jen u rotundy), `wallThickness(výška)`.
- **Cena** `churchCost(type, dims)`: objem zdiva = délka zdi po ose zdi (vnitřní míra + tloušťka;
  stěna sdílená s lodí patří lodi, bez otvorů) × výška × tloušťka + základy (`foundationDepthM`);
  vápno, písek, vápenec z `MORTAR` a `LIME`; dřevo = střecha × `roofWoodKgPerM2` + vápno ×
  `woodKgPerLimeT`; práce po druzích `work` (základy = výkop + zdění, lámání = kámen + vápenec bez
  vzdálenosti, pálení vápna + pec, písek, zdění + opracování, střecha 45°, výzdoba = vnitřní plocha
  zdí bez atria). Kalibrace: rotunda Ø 6,5 × 6 ≈ 162 m³, 10,5 t vápna, ≈ 1 185 čd.
- **Kapacita** `churchCapacity` = plocha lodí (hlavní i boční) ÷ `m2PerPerson`, dolů (rotunda 44).
- **Hřbitůvek:** `churchyardRect` (obdélník o `churchyardBeltM` kolem vnějšího obrysu, `offsetX`
  = střed v ose x), `churchyardGraves` = (plocha obdélníku − půdorys) ÷ `graveM2`.
- **Obrys ve světě:** `churchFootprintWorld(type, dims, position)` – vnější obrysy částí (kruh
  24úhelník, půlkruh 12 úseků), otočené o `position.rotation` (x = ose vstup → kněžiště) a
  posunuté; jen `detSin` / `detCos` z `landscape/det-math.ts`.
