# Ves – opevnění

Mapa kódu – podrobnosti k mechanikám. Pravidla a rozhodnutí: [fortifications.md](../design/fortifications.md)
v `docs/design/`, postup po úlohách v [plánu](../superpowers/plans/2026-11-03-multiplayer-vassalage-war.md)
(Fáze 5).

## Modul `fortification/` (Ú5.1)

`packages/game/src/domain/village/fortification/` – čistá doména, **deterministická vrstva**
(ESLint glob `fortification/**` v `eslint.config.mjs` – jen `det-math.ts`, žádné `Math.sin/cos/atan2/hypot/log`
ani `**`): tvar počítá server i prohlížeč (u kurzoru) ze stejných funkcí. Čísla v
`rules-fortifications.ts` (`FORTIFICATIONS` – celá tabulka Čísla kromě horizontů správce), typy
`FortKind` (`fence` | `palisade` | `rampart`) a `FortTop` v `types-fortifications.ts`. Stav vsi,
stavba ani scéna opevnění zatím nemají.

## Plocha a obvod (`outline.ts`)

- **`fortificationArea(cells, grid, geo)`** – čtverce v mřížce stavby (`SquareGrid`, null = mřížka
  krajiny; `geo` = `GridGeometry` krajiny – strana políčka) → `FortArea { grid, geo, cells,
squares }`, nebo `{ error: 'empty' | 'disconnected' | 'too-small' }`. Opakované čtverce sloučí,
  souvislost stranou (dotyk rohem nestačí), díry zaplní (prázdné čtverce, kam se zvenku stranou
  nedostane), nejméně jeden blok 2 × 2. `squares` (`EntranceSquare` – střed ve světě, strana,
  natočení) jsou podklad pro `fenceOutline`.
- **`fortificationOutline(area, kind)`** → `FortOutline`:
  - `sides` – strany okrajových čtverců **po směru hodin** (plocha vpravo), začátek na
    nejsevernějším středu strany (sever = +z), při shodě nejzápadnějším; roh na konci strany
    `outer` / `inner` / null a jeho poloměr. Obrys je jedna smyčka – po zaplnění děr se dva čtverce
    jen rohem nedotýkají.
  - `corners` – poloměry rohů vnějšího okraje z `FORTIFICATIONS.cornerM` (plot 1,25 / 0,5 m,
    palisáda 3 / 1,5 m, val 8 / 4 m). Když se dva rohy nevejdou na rovný kus mezi sebou (val na
    pruhu širokém jeden čtverec: 2 × 8 m > 15 m), zmenší se všechny stejným poměrem
    (`fittedCorners` – 7,5 / 3,75 m).
  - `runs` – rovné kusy vnějšího okraje (přes víc stran na přímce, zkrácené o tečny) a oblouk
    rohu na konci každého (`FenceSegment`, `FenceArc` z `paths/entrances.ts`). Stejné kusy
    a oblouky dá `fenceOutline(area.squares, 0, outline.corners)` (test) – plot pozemků má poloměry
    parametrem `corners` (výchozí `WOVEN_FENCE_CORNER_M`, dnešní volání beze změny).
  - `lengthM` – délka vnějšího okraje se zakulacenými rohy (obvod − (2 − π/2) × poloměr za roh).
  - `bandM` – pás uvnitř plochy (1 / 1,5 / 10 m).
  - `innerAreaM2` – útočiště uvnitř vnitřní hrany pásu (`innerArea`): ostrá eroze plochy čtvercem
    ± pás přesně na stlačené mřížce (zlomy na hranách čtverců ± pás), pak zakulacení na jejích
    rozích – vnější roh poloměrem max(vnější − pás, 0), vnitřní (vnitřní + pás), (1 − π/4) × r².
    Pruh užší než dva pásy (val na pruhu jednoho čtverce) zmizí sám.
- **Zlaté hodnoty** (4 × 4 čtverce, `__tests__/outline.test.ts`): délka plot 237,854 m, palisáda
  234,850 m, val 226,266 m; útočiště 3 363,95 / 3 247,07 / 1 600 m². Natočená mřížka dá tutéž
  délku i plochu.

## Úseky (`segments.ts`)

- **`fortSegments(outline)`** → `FortSegmentShape[]` – úsek = jedna strana okrajového čtverce,
  pořadí z `outline.sides` (po směru hodin od severu, pevné – nezávisí na pořadí čtverců). `line` –
  rovná část bez tečen oblouků, `arc` – oblouk rohu na konci (patří k úseku, ve kterém začíná),
  `lengthM` – součet délek = `outline.lengthM`. Úsek je jednotka stavby, stáří, přestavby i průlomu
  (další úlohy F5).

## Brány (`gates.ts`)

- **`autoGates(outline, roads, anchor)`** – `roads` jsou osy cest (`RoadPoint[]`; které cesty –
  pevná, vozová, zemská stezka – vybírá volající, pěšiny ne). Průsečíky s rovnou částí i obloukem
  úseku, nejvýš jedna brána na úsek (první po směru hodin). Bez průsečíku jedna brána uprostřed
  úseku nejblíž `anchor` (dvorec, bez něj střed obydlí; při shodě menší pořadí).
- **`addGate(outline, gates, pos)`** – úsek nejblíž kliku do vzdálenosti max(pás, půl brány) od
  vnějšího okraje, jinak `{ error: 'off-outline' }`; úsek s bránou `{ error: 'segment-taken' }`.
  Vrací nové pole seřazené podle úseku.
- `FortGate { segment, offsetM, x, z }` – střed brány na rovné části úseku. Brána 4 m stojí celá
  na rovné části: průsečík na oblouku nebo u konce se posune (`gateAt`), kratší rovná část než
  brána – střed.

## Cena (`cost.ts`)

- **`fortificationCost(kind, lengthM, work)`** → `BuildCost` – na 100 m `FORTIFICATIONS.costPer100M`
  úměrně délce (plot 20 čd + 15 klád, palisáda 80 + 70, val 150 čd bez klád – `upfront: {}`).
  `work`: `'new'`, `'upgrade'` (jen `palisade` – jako nová palisáda, plot nevrací nic), `'top'`
  (plot nebo palisáda na valu za cenu samotného); jiné kombinace vyhodí chybu. Nezaokrouhluje –
  zaokrouhlí až rozhraní.
