# Ves – opevnění

Mapa kódu – podrobnosti k mechanikám. Pravidla a rozhodnutí: [fortifications.md](../design/fortifications.md)
v `docs/design/`, postup po úlohách v [plánu](../superpowers/plans/2026-11-03-multiplayer-vassalage-war.md)
(Fáze 5).

## Modul `fortification/` (Ú5.1)

`packages/game/src/domain/village/fortification/` – čistá doména, **deterministická vrstva**
(ESLint glob `fortification/**` v `eslint.config.mjs` – jen `det-math.ts`, žádné `Math.sin/cos/atan2/hypot/log`
ani `**`): tvar počítá server i prohlížeč (u kurzoru) ze stejných funkcí. Čísla v
`rules-fortifications.ts` (`FORTIFICATIONS` – celá tabulka Čísla kromě horizontů správce), typy
`FortKind` (`fence` | `palisade` | `rampart`) a `FortTop` v `types-fortifications.ts`. Stav vsi
a stavba po úsecích (Ú5.2) – níž; stěny a brány v síti cest (Ú5.3) –
[village-roads.md – Brány opevnění v síti](village-roads.md#brány-opevnění-v-síti-ú53-6-11-2026);
rozhraní a scéna opevnění zatím nejsou.

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
- **`roadGates(outline, gates, roads, standing)`** (Ú5.3) – stojící úsek bez brány, který protne
  cesta, dostane bránu u prvního průsečíku jako v `autoGates`; bez nové brány vrátí totéž pole.
  Volá ji denní `gateRoadCrossings` (`fortifications.ts`) – cesta přes hotové opevnění dostane
  bránu (síť cest: [village-roads.md](village-roads.md#brány-opevnění-v-síti-ú53-6-11-2026)).

## Stěny (`walls.ts`, Ú5.3)

- **`fortWalls(geo, fort)`** – stěny (pás stojících úseků bez otvorů bran) a otvory bran jako
  čtyřúhelníky ve světě; `quadTouchesSquare` a `insideQuad` pro buňky mřížek a obrys plotu.
  Podrobnosti a použití v síti pěšin a vozů:
  [village-roads.md – Brány opevnění v síti](village-roads.md#brány-opevnění-v-síti-ú53-6-11-2026).

## Cena (`cost.ts`)

- **`fortificationCost(kind, lengthM, work)`** → `BuildCost` – na 100 m `FORTIFICATIONS.costPer100M`
  úměrně délce (plot 20 čd + 15 klád, palisáda 80 + 70, val 150 čd bez klád – `upfront: {}`).
  `work`: `'new'`, `'upgrade'` (jen `palisade` – jako nová palisáda, plot nevrací nic), `'top'`
  (plot nebo palisáda na valu za cenu samotného); jiné kombinace vyhodí chybu. Nezaokrouhluje –
  zaokrouhlí až rozhraní.

## Pás (`band.ts`)

- **`fortBandPieces(outline)`** – pás jako obdélníky: strana okrajového čtverce × šířka pásu dovnitř
  plochy (plocha vpravo od směru obvodu), u vnitřního rohu navíc čtverec šířky pásu za koncem
  strany. U vnějšího rohu obdélník zahrne i špičku za obloukem – kontrola je o kus přísnější.
  `fortBandPolygons` – jen mnohoúhelníky.
- **`fortificationBand(geo, fort, building)`** – pás, který zabírá místo jiným stavbám: hotové
  úseky, a dokud na opevnění běží stavba, celý obvod. `checkFootprintFree` (`placement-land.ts`)
  ho bere u každé stavby s půdorysem (`PlacementVillage.fortifications`, důvod
  `OVERLAPS_FORTIFICATION` „Stojí tu opevnění.“).

## Stav vsi (Ú5.2)

- **`VillageState.fortifications?: Fortification[]`** (`fortification/types.ts`, přes
  `types-fortifications.ts` v `types.ts`) – volitelné, starší vsi ho nemají a nic se nepřevádí.
  `Fortification { id, grid (null = krajina), cells, kind, top?, segments, gates, rampartHeight? }`;
  tvar (obvod, úseky, pás) se z `cells` a `grid` vždy spočítá znovu (`outlineOf`).
- **`FortSegment { index, builtDay (null = nestojí), topBuiltDay?, state, breachedDay?, kind? }`** –
  `kind` jen u rozdělaného vylepšení (úsek s hotovou palisádou `'palisade'`, `segmentKind`).
  `state` a `breachedDay` plní až další úlohy F5 (chátrání, válka).
- **Stavba `'fortification'`** (`ConstructionKind`, `LandTaker`) s `fortificationId`, `fortWork`
  (`FortBuildWork`: `build` | `upgrade` | `top`; `rebuild` a `restore` jsou další úlohy F5),
  `segmentIndex` (přestavba úseku – později) a `fortSegments` (`FortSegmentWork { index, cost }` –
  úseky v pořadí práce). `cost` = kácení vyhrazených stromů (`woodFellingCost`) + práce úseků.

## Stavba po úsecích (`fortifications.ts`)

- **`checkFortificationPlacement(landscape, village, obstacles, cells, grid, kind)`**
  (`placement-fortifications.ts`) → `FortPlacementCheck` (plocha, obvod, překážky v pásu,
  `clearedTrees`, `takenLand`). Pořadí: neplatné čtverce a mřížka, plocha (`FORT_NOT_CONNECTED`,
  `FORT_TOO_SMALL`), pás uvnitř krajiny (`FORT_OUTSIDE`), dotyk s jiným opevněním – čtverce ploch
  zvětšené o 5 cm (`FORT_TOUCHES`, i plocha uvnitř jiné), voda pod pásem (`FORT_OVER_WATER`),
  `checkFootprintFree` s `DWELLING_LAND` (obydlí → `FORT_OVER_BUILDING`, jinak důvod překryvu –
  hřbitov, ohrada, humno, modla, svatyně, milíř, branka souseda), skalní výchoz, posvátný háj a dub.
  Obilné jámy kontrola nezná – stejně jako u ostatních staveb (`placementVillageOf`). Val vezme
  kusy polí a sadů pod pásem (`takenLandUnder`), plot a palisáda ne – překážky dílů pod nimi patří
  poli a sadu.
- **`startFortification(state, day, landscape, obstacles, { cells, grid, kind }, walk?)`** – brány
  samy (`autoGates` s osami všech pevných cest vsi `state.roads.roads`, kotva dvorec, bez něj
  průměr poloh obydlí), val ubere pole a sady (`giveWayToBuilding(…, 'fortification')` – sad
  ustoupí valu jako obydlí), překážky pásu osadníci odstraní hned (`recordClearedObstacles`,
  dospělé stromy dají klády na hromadu). **Cena předem jen dřevo**: klády celé stavby
  (`fortificationCost` po úsecích, součet nahoru na celé) z hromady, zbytek vyhradí mezi
  nejbližšími stromy k těžišti plochy (`planWoodFrom`); `plan.missing > 0` → `FORT_NO_WOOD`. Práce
  se nečeká. Cena překážek pásu se k práci nepřičítá – cena je jen podle délky (návrh Clauda).
- **Pořadí úseků** `fortWorkOrder(count, gates, anchor)` – od úseku brány nejblíž kotvě (při shodě
  menší úsek) po směru hodin, uložené v `fortSegments` stavby (pozdější dvorec pořadí nezmění).
- **Práce** – `build` (`simulate-build.ts`) rovným dílem s ostatními stavbami, `invest` jako
  u obydlí (`done`, `fellAsWorked` – stromy jako první část práce) a `workFortification`: úsek je
  hotový v den, kdy `done` přejde konec jeho práce (kácení + úseky před ním + on) – `builtDay`,
  `state` 1; vylepšení `kind: 'palisade'` (plot do té doby stojí), nástavba `topBuiltDay`. Pořadí
  kroků dne se nemění, výsledek nezávisí na kouscích dopočtu. `finishFortification` v kroku 4:
  vylepšení na všech úsecích → `kind = 'palisade'` a `segment.kind` zmizí; kronika
  `construction-finished`.
- **`startFortificationUpgrade(…, { fortificationId, work, top? })`** – `upgrade` jen u plotu
  (`FORT_NOT_FENCE`, `FORT_ALREADY_PALISADE`): kontrola umístění pásu palisády bez sebe sama,
  úseky, které palisádu ještě nemají, za cenu palisády (`fortificationCost(…, 'upgrade')`), plot nic
  nevrací. `top` jen na valu (`FORT_NOT_RAMPART`), celý postavený (`FORT_RAMPART_UNFINISHED`),
  úseky bez nástavby za cenu samotného plotu nebo palisády po délkách valu; rozdělanou nástavbu
  jen stejným druhem (`FORT_TOP_DONE`). Na opevnění běží nejvýš jedna stavba (`FORT_BUSY`).
- **`addGateToFortification(state, geo, fortificationId, position)`** – `addGate` na obvod
  (`FORT_GATE_OFF`, `FORT_GATE_TAKEN`), kdykoli, nic nestojí.
- **Zrušení** (`cancel-construction.ts`, `dropFortificationWork`): hotové úseky stojí, nehotové
  jsou mezera (`builtDay` null – pás mezery jiným stavbám nepřekáží); nové opevnění bez hotového
  úseku zmizí celé, nástavba bez hotového úseku zruší `top`. Nespotřebované dřevo se vrátí
  (`returnConstructionWood`).
- **Robota hostů** napřed do opevnění – až Ú4.5 (`VillageState.guests` zatím není; komentář
  v `labor.ts`).

## Akce

- Use-casy `application/place-fortification.ts` (`placeFortification`),
  `upgrade-fortification.ts` (`upgradeFortification`), `add-fortification-gate.ts`
  (`addFortificationGate`) – `updateLivingVillage` v den `state.lastDay`, chůze ke stromům
  `villageRoadWalk`. Testy `application/__tests__/fortification-use-cases.test.ts`, doména
  `domain/village/__tests__/fortifications.test.ts`, adaptér `village-repository.db.test.ts`.
- Web: server actions `placeFortification`, `upgradeFortification`, `addFortificationGate`
  (`apps/web/app/game/actions.ts`, vstupy `parse…FortificationInput` v `village-input.ts`),
  `…ForPlayer` přes `actOn` s právem `build` (`ACTION_RIGHTS`). Tlačítka a kreslení – Ú5.6; cena
  v katalogu (`BUILD_COSTS`) také až s ním – opevnění nemá pevnou cenu, jen `fortificationCost`.
