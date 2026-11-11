# Ves – kamenné zdivo, stavební huť a kostely

Mapa kódu – podrobnosti k mechanikám. Pravidla a rozhodnutí: stone-masonry.md, churches.md v `docs/design/`, plán `docs/superpowers/plans/2026-11-11-masonry-churches.md`.

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
