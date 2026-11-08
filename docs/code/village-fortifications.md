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
rozhraní opevnění (katalog, kreslení, panel, minimapa) je v
[web-ui.md – Opevnění v rozhraní](web-ui.md), modely ve scéně zatím nejsou.

## Obvod z bodů (`curve.ts`, `outline.ts`; Martin 7. 11. 2026)

Obvod nese body (`Fortification.points`), vnější okraj je **hladká uzavřená křivka** přes ně.
Dřívější obvod po čtvercích zůstal jen pro převod (`squares-outline.ts`, `squares-segments.ts` –
`fortificationArea`, `squareOutline`, `squareSegments`; testy `squares-outline.test.ts`).

- **`curve.ts`** – `normalizeFortPoints` (po směru hodin, začátek v nejsevernějším bodě – sever =
  +z, při shodě nejzápadnější; body bližší než 0,1 m se sloučí – výsledek nezávisí na začátku ani
  směru zadání), centripetální Catmull-Rom jako Hermitova kubika (uzly po odmocnině vzdáleností),
  `sampleCurve` (krok ≈ `FORTIFICATIONS.outline.sampleStepM` 1,5 m, nejméně 2 vzorky na kus),
  `curveBend` (poloměr z derivací |v|³ ÷ |x′z″ − z′x″|), `polylineLength`, `polylineArea`
  (shoelace), `steinerInnerArea` (A − L·b + π·b², ≥ 0) a `selfCrossing`.
- **`fortificationOutline(points, kind)`** → `FortOutline | null` (méně než 3 různé body null):
  `points` (v pevném pořadí), `polyline` + `stations` (navzorkovaná křivka a poloha bodů na obvodu),
  `runs` (krátké `FenceSegment`, `arc: null`), `corners` (nejmenší poloměr druhu – pro scénu),
  `lengthM`, `areaM2`, `bandM`, `innerAreaM2` (Steiner) a `segmentStarts` (hranice úseků vložené do
  lomené čáry). `outlinePointAt(outline, s)` – bod v dané vzdálenosti po obvodu.
- **`fortShapeError(outline)`** – `too-few` (< 4 body), `sharp` (ohyb ostřejší než
  `FORTIFICATIONS.minBendM`: plot 1,25, palisáda 3, val 8 m), `crossing`, `too-small` (< 900 m²);
  u ohybu a křížení `at` (místo problému). **Ohyb se měří v měřítku poloměru druhu**
  (`outlineBend` – kružnice přes body o poloměr druhu po obvodu před a za každým bodem lomené čáry;
  návrh Clauda): spline na přechodu z rovného kusu do oblouku krátce zakolísá (poloměr
  z derivací až o ~50 % menší), takže by s ním neprošel ani návrh hry; roh ostřejší než poloměr
  se pozná dál.
- **Zlaté hodnoty** (`__tests__/curve.test.ts`): kruh r = 30 m (16 bodů) 188,4219 m / 2 824,63 m²,
  ovál 40 × 25 m 206,8273 m / 3 138,97 m², promáčknutý kruh 179,4080 m / 2 223,32 m²; útočiště
  plot / palisáda / val a počty úseků (13, 14, 12) tamtéž. 4 × 4 čtverce převedené na body: plot
  237,829 m (dřív 237,854), útočiště plot 3 374,5 m² (dřív 3 363,95), val 1 615,7 m² (dřív 1 600).

## Návrh obvodu (`proposal.ts`, `fortification-proposal.ts`)

- **`hullOffsetPoints(polygons, offsetM)`** – vypouklý obal rohů jádra (`convexHull`, Andrew, po
  směru hodin) odsunutý o odstup: u rohu obalu oblouk (tečny a střed; oblouk nad 45° nebo
  s tětivou nad 15 m se dál půlí – směry půlením, bez úhlů), na rovných kusech body po nejvýš
  15 m. `circlePoints(center, r)` – kruh po nejvýš 15 m, od severu.
- **`fortificationCore(state, geo)`** – obrysy jádra: pozemky obydlí (i dvorce a dílny; obydlí bez
  pozemku čtverec 10 m), humna (`threshingFloorFootprint`), obilné jámy (2 m) a čtverce ohrad.
- **`proposeFortification(state, day, landscape, obstacles, kind, at)`** – jádro bez staveb uvnitř
  jiného opevnění; odstup šířka pásu + 3 m, neprojde-li `checkFortificationPlacement`, po 1 m víc
  (nejvýš +20 m – `FORTIFICATIONS.proposal`); nic neprojde → návrh s výchozím odstupem a důvodem.
  Bez jádra kruh 20 m kolem `at`. `proposeFortificationIn(landscape, village, …)` – totéž nad
  `PlacementVillage` (+ obilné jámy); volá ho prohlížeč (`build-items.ts` – web-ui.md, Opevnění).
- **`stewardFortificationProposal`** – celé jádro, odstup po 5 m (nejvýš `STEWARD.fortMaxRings`
  kroků), dokud návrh neprojde kontrolou a útočiště nepojme `refugeNeedM2`.

## Převod opevnění po čtvercích (`convert.ts`)

- **`withFortPoints(state, geo)`** na začátku `advanceVillage` (za `withFourWheelReach`, jen
  s krajinou) – jednou a idempotentně: `squarePoints` (tečny a středy oblouků zakulaceného okraje
  druhu, na rovných kusech po ≤ 15 m) → `points`, `grid` a `cells` zmizí. Nový úsek převezme stav
  (`builtDay`, `state`, `breachedDay`, `kind`, `topBuiltDay`) starého úseku, ve kterém leží jeho
  střed; brány podle polohy (nejvýš jedna na nový úsek). Plán rozestavěné stavby (`fortSegments`)
  se přerozdělí: práce starého úseku mezi nové úseky s jeho středem podle délky, bez nich na
  další – součet práce zůstane. Test `__tests__/convert.test.ts`.
- **`fortPointsOf` / `fortOutlineOf(geo, fort, kind?)`** – body uložené, nebo u nepřevedeného
  opevnění ze čtverců; `outlineOf` (`fortifications.ts`) a všichni konzumenti jdou přes ně.
  `areaOutline(area, kind)` – obvod z bodů staré plochy (testy).

## Úseky (`segments.ts`)

- **`fortSegments(outline)`** → `FortSegmentShape[]` – stejně dlouhé úseky ≈ 15 m (délka ÷
  zaokrouhlený počet), pořadí po směru hodin od nejsevernějšího bodu. `path` (lomená čára úseku),
  `startM`, `lengthM`, `mid` (střed na křivce), `line` = tětiva úseku a `arc: null` (kompatibilita
  se scénou, která zatím kreslí tětivy). `nearestOnSegment` / `nearestOnPath` – vzdálenost
  a poloha po čáře.

## Brány (`gates.ts`)

- **`autoGates(outline, roads, anchor)`** – průsečíky os cest s lomenou čarou úseku, nejvýš jedna
  brána na úsek (první po směru hodin); bez průsečíku jedna uprostřed úseku nejblíž `anchor`.
- `FortGate { segment, offsetM, x, z }` – střed brány na křivce (`offsetM` po obvodu od začátku
  úseku); brána se celá vejde do úseku (střed nejméně půl brány od konců). **`gateChord`** – rovná
  4 m tětiva se středem v bodě brány (konce stejně daleko po obvodu, zpřesněné na šířku brány).
- **`addGate`** (klik do max(pás, půl brány) od křivky, `off-outline` / `segment-taken`) a
  **`roadGates`** (Ú5.3) jako dřív.

## Stěny (`walls.ts`, Ú5.3)

- **`fortWalls(geo, fort, work)`** – stěny (kusy pásu blokujících úseků – `bandPieces` – bez části
  pod tětivou brány), otvory bran (tětiva × šířka pásu) a `detour` – body vně křivky po ≈ 10 m (kde úsečka mezi sousedními body řízne stěnu, vloží se bod doprostřed, půlí se až na ≈ 2,5 m; před každou bránou stojí bod vždy – `detourPoints`), 1 m
  za okrajem: hladký obvod nemá ostré rohy, kolem kterých by se lámala objížďka chůze
  (`walk-walls.ts` je přidá do grafu objížďky). `quadTouchesSquare` a `insideQuad` pro buňky mřížek
  a obrys plotu.
- **Celý obvod blokuje od zahájení** (Martin 6. 11. 2026): `segmentBlockKind(fort, seg, work)` –
  druh pásu, kterým úsek blokuje, nebo null: nehotový úsek blokuje při běžící stavbě či vylepšení
  (`work` = `fortRunningWork(state, id)` – `Construction.fortWork` stavby na opevnění), stojící
  úsek (`segmentStands`) vždy; vylepšení plotu pásem palisády; průlom, mezera na nule a nehotové
  úseky zrušené stavby ne. `fortBlockingSegments` je seznam `{ index, kind }` – z něj stěny,
  `gateRoadCrossings` i `fortLayoutKey`, takže dokončení úseku stěny ani klíče nemění.
  Podrobnosti a použití v síti pěšin a vozů:
  [village-roads.md – Brány opevnění v síti](village-roads.md#brány-opevnění-v-síti-ú53-6-11-2026).

## Cena (`cost.ts`; Hradby a obrana – Cena, Martin 8. 11. 2026 – „komplet“)

- **Ceny komplet** (`FORTIFICATIONS.costPer100M`, na 100 m úměrně délce, i s kácením a odvozem):
  plot 35 čd + 15 klád, palisáda 300 + 70, s ochozem 450 + 80, roštová 1 050 + 330 + 100 m³
  kamene, komorová 1 450 + 350 + 320 m³, val 150 čd. `walkwayAddPer100M` – ochoz na palisádu
  150 čd + 10 klád.
- **`fortificationFullCost(target, lengthM, from?)`** → `FortCost { laborManDays, logs, stoneM3 }`
  komplet. **`fortificationCost(target, lengthM, from?)`** → totéž, ale práce = komplet − 1 čd ×
  klády − 1 čd × m³ kamene (`pileSaves`) – kácení a lámání přičte stavba podle zdroje (`pushWork`).
  100 m: plot 20 čd, palisáda 230, s ochozem 370, roštová 620, komorová 780, val 150. `from`
  (`WallKind`, chybí / null = nové, hradba na valu, přestavba): vyšší stupeň za cenu cílového,
  `palisade → walkway` přístavba (140 čd + 10 klád), stejný či nižší cíl vyhodí chybu; val `from`
  nezná. Nezaokrouhluje – zaokrouhlí až rozhraní.
- **Rok** – `wallAvailable(kind, day)` (rok `dateOfDayIndex(day).year` ≥ `wallFromYear` – roštová
  790, komorová 830), `wallYearReason(kind, day)` → `FORT_WALL_YEAR(kind)` („Roštová hradba až od
  roku 790.“) nebo null. Texty `FORT_WALKWAY_NEW` („Palisáda s ochozem vzniká jen vylepšením
  palisády.“) a `FORT_NO_STONE(m3)` („Chybí {m3} m³ kamene.“, celé m³ nahoru).

## Pás (`band.ts`)

- **`bandPieces(outline, band, index, fromM?, toM?)`** – pás úseku po kusech lomené čáry:
  čtyřúhelník kus × šířka pásu dovnitř s vnitřními rohy na ose ohybu (sousední kusy sdílejí hranu,
  pás nemá mezery); kde se vnitřní rohy zkříží (ohyb ostřejší, než pás dovolí), trojúhelník – vnitřní
  okraj se sejde do rohu. Kusy přesahují o 5 cm, ať úsečka po společné hraně neprojde mezi nimi.
  `fortBandPieces` / `fortBandPolygons` – celý obvod.
- **`fortificationBand(geo, fort, building)`** – pás, který zabírá místo jiným stavbám: hotové
  nezbořené díly a díly, na kterých běží stavba (`building` = `fortRuns` po dílech; `true` – celý
  obvod, pohled na ves bez dílů staveb). Šířka po dílech: stojící díl podle svých vrstev
  (`segmentBand`, nejméně pás druhu opevnění), díl s rozdělaným vylepšením pás cílové hradby (na valu
  `wallOnRampartBandM`), mezera stavěná znovu pás cílové hradby bez valu. `checkFootprintFree` (`placement-land.ts`)
  ho bere u každé stavby s půdorysem (`PlacementVillage.fortifications`, důvod
  `OVERLAPS_FORTIFICATION` „Stojí tu opevnění.“).

## Druhy hradeb a vrstvy úseku (`life.ts`, `band.ts`, `stone.ts`)

Hradby a obrana (fortifications.md, 8. 11. 2026) – Úloha 1 plánu
`docs/superpowers/plans/2026-11-08-ramparts.md`: refaktor bez změny výsledku, uložené hodnoty
platí dál, staré vsi se nepřevádějí.

- **Druhy** (`types-fortifications.ts`): `WallKind` = `fence` | `palisade` | `walkway` (palisáda
  s ochozem) | `crib` (roštová) | `chamber` (komorová), `FortKind = WallKind | 'rampart'`,
  `FortTop = WallKind`; pořadí stupňů 1–5 `WALL_ORDER` (`life.ts`). Nové druhy zatím nikde
  nevznikají – katalog (`village-input.ts`) a nabídka nástavby dál jen plot, palisáda a val; scéna
  je kreslí jako palisádu (`sceneWall` ve `fortification-layout.ts`), panel s ikonou palisády,
  obrana, prolomení a správce je počítají jako palisádu, dokud je nepřepíšou další úlohy.
- **Vrstvy úseku** – `segmentWall(fort, seg): WallLayer | null` (`{ kind, builtDay, state }`; bez
  valu úsek sám, na valu nástavba `segmentTop` s `topBuiltDay`; holý val či zbořená nástavba null)
  a `segmentRampart(fort, seg): RampartLayer | null` (`{ builtDay, height, outside, water }` – výška
  `seg.rampartHeight ?? fort.rampartHeight ?? 1`, `rampartOutside`, `moatDay`). `segmentKind` (druh
  základu – val, jinak hradba) je jediné čtení `seg.kind ?? fort.kind`; `layerBuilt(layer)` – vrstva
  je a je dostavěná.
- **Otevřený díl** – `segmentBuilt(seg)` stojí aspoň jedna vrstva (`builtDay`, nebo `topBuiltDay`);
  `segmentIsOpen` = nic nestojí, průlom nebo zboření. Kombinace „hradba stojí, val pod ní se staví“
  (`kind: 'rampart'`, `builtDay: null`, `topBuiltDay: den` – doplnění valu, další úloha) tak není
  mezera: hradba brání, stárne a hnije podle svého dne (`segmentState`, `segmentIsOld`,
  `segmentStands`). **Žádné čtení `builtDay === null` mimo vrstvy** – převedené jsou
  `fortifications.ts` (vylepšení, nástavba, zboření, `segmentDone` – stavba čte základ
  `segmentRampart ?? segmentWall`), `decay.ts`, `defense.ts`, `breach.ts`, `walls.ts`, `band.ts`,
  `war/march-grid.ts`, `war/battle.ts` (`blocks` = stojí hradba), `war/raid-apply.ts`,
  `steward-extras.ts` (rozdělaná stavba = některá vrstva nedostavěná), `apps/web/lib/fort-view.ts`
  (`partBuiltDay` – den valu, jinak hradby) a scéna (`segmentBuild`). Scéna dál dostává surové
  `age` / `topAge` (`sceneFortifications`).
- **`segmentBand(fort, seg): { inM, outM }`** (`band.ts`) – pás od křivky: hradba bez valu `bandM`
  (1 / 1,5 / 5,5 / 7 / 8 m), hradba na valu `wallOnRampartBandM` (10 / 10 / 12,5 / 14 / 15), holý
  val 10; val doplněný vně (`rampartOutside`) 7 m ven a dovnitř šířka hradby, nejméně 3 m. Čtou ho
  stěny, pás pro jiné stavby, pochod a příkop – [Val pod hradbou a vodní příkop](#val-pod-hradbou-a-vodní-příkop-fortification-rampartts-moatts).
- **Nová pole stavu (volitelná)**: `FortSegment.rampartOutside?`, `rampartHeight?`, `moatDay?`,
  `extraAgeDays?`, `burnedDay?`; `FortGate.pincerDay?` / `towerDay?` (null = staví se);
  `Construction.fortTarget?: WallKind` (chybí – `upgrade` na palisádu, `top` = `fort.top`)
  a `fortGate?: { segment, level: 'pincer' | 'tower' }`; `FortBuildWork` + `rampart` | `moat` |
  `gate`. Nic z toho zatím nevzniká.
- **Čísla** (`FORTIFICATIONS`): `bandM`, `minBendM`, `cornerM`, `lifeYears` (s ochozem 20,
  roštová 30, komorová 50) a `costPer100M` (s ochozem 450 čd + 80 klád, roštová 1 050 + 330
  - 100 m³ kamene, komorová 1 450 + 350 + 320 m³ – `FortCostPer100M.stoneM3?`) pro nové druhy;
    `wallOnRampartBandM`, `rampartOutside { outM: 7, minInM: 3 }`, `wallFromYear { crib: 790,
chamber: 830 }`, `walkwayAddPer100M` (150 čd + 10 klád), `pileSaves { logManDays: 1,
stoneManDaysPerM3: 1 }`. Ceny plotu a palisády komplet – Cena.
- **Kámen** (`stone.ts`): `VillageState.stoneM3?` (zásoba m³), `stoneStacks?: StoneStack[]`
  (`{ id, x, z, m3, road? }`, podmnožina zásoby) a `nextStoneStackId?` – vlastní čítač, ne `nextId`
  (jinak by se posunula id ostatních věcí a zlaté otisky). `stoneOnHand(state)`, `takeStone(state,
m3, at)` – z hromad od nejbližší k `at` (při shodě menší id), prázdná hromada zmizí, zbytek ze
  zásoby bez hromady; `quarryNear(obstacles, at)` – nejbližší skalní výchoz na mapě sídla
  `{ x, z, distanceM }`, bez výchozu null. Zdroje kamene zatím nejsou (Úloha 4).

## Stav vsi (Ú5.2)

- **`VillageState.fortifications?: Fortification[]`** (`fortification/types.ts`, přes
  `types-fortifications.ts` v `types.ts`) – volitelné, starší vsi ho nemají.
  `Fortification { id, points?, grid?, cells?, kind, top?, segments, gates, rampartHeight? }` –
  `points` od obvodu z bodů, `grid` a `cells` jen u opevnění po čtvercích do převodu
  (`withFortPoints`); tvar (křivka, úseky, pás) se z bodů vždy spočítá znovu (`outlineOf`).
- **`FortSegment { index, builtDay (null = základ nestojí), topBuiltDay?, state, breachedDay?, kind? }`** –
  `kind` jen u rozdělaného vylepšení (úsek s hotovou palisádou `'palisade'`, `segmentKind`).
  `state` plní chátrání (Ú5.4), `breachedDay` válka (další úlohy F5). Čte se jen přes vrstvy –
  [Druhy hradeb a vrstvy úseku](#druhy-hradeb-a-vrstvy-úseku-lifets-bandts-stonets).
- **Stavba `'fortification'`** (`ConstructionKind`, `LandTaker`) s `fortificationId`, `fortWork`
  (`FortBuildWork`: `build` | `upgrade` | `top` | `rebuild` | `restore`),
  `segmentIndex` (nepoužité – přestavba je jedna stavba pro všechny dožilé úseky opevnění) a `fortSegments` (`FortSegmentWork { index, cost }` –
  úseky v pořadí práce). `cost` = kácení vyhrazených stromů (`woodFellingCost`) + práce úseků.

## Stavba po úsecích (`fortifications.ts`)

- **`checkFortificationPlacement(landscape, village, obstacles, points, kind)`**
  (`placement-fortifications.ts`) → `FortPlacementCheck` (obvod, překážky v pásu, `clearedTrees`,
  `takenLand`). Pořadí: neplatné body (`FORT_BAD_POINTS` – konečná čísla, nejvýš 400), tvar
  (`fortShapeError` – `FORT_TOO_FEW`, `FORT_SHARP` a `FORT_CROSSING` s místem problému,
  `FORT_TOO_SMALL`), pás uvnitř krajiny (`FORT_OUTSIDE`), dotyk s jiným opevněním – překryv křivek
  nebo bližší než 5 cm (`FORT_TOUCHES`, i obvod uvnitř jiného), voda pod pásem (`FORT_OVER_WATER`),
  `checkFootprintFree` s `DWELLING_LAND` (obydlí → `FORT_OVER_BUILDING`, jinak důvod překryvu –
  hřbitov, ohrada, humno, modla, svatyně, milíř, branka souseda), skalní výchoz, posvátný háj a dub.
  Obilné jámy kontrola nezná – stejně jako u ostatních staveb (`placementVillageOf`). Val vezme
  kusy polí a sadů pod pásem (`takenLandUnder`), stejně široké hradby – s ochozem, roštová
  a komorová (pás 5,5–8 m; návrh Clauda); plot a palisáda ne – překážky dílů pod nimi patří poli
  a sadu.
- **`startFortification(state, day, landscape, obstacles, { points, kind }, walk?)`** – napřed
  `walkway` → `FORT_WALKWAY_NEW` a rok (`wallYearReason` podle `day` = `state.lastDay` akce), pak
  kontrola umístění; brány samy (`autoGates` s osami všech pevných cest vsi `state.roads.roads`,
  kotva dvorec, bez něj průměr poloh obydlí), val ubere pole a sady
  (`giveWayToBuilding(…, 'fortification')` – sad ustoupí valu jako obydlí), překážky pásu osadníci
  odstraní hned (`recordClearedObstacles`, dospělé stromy dají klády na hromadu). Plán
  `segmentPlan(shapes, indices, target, from?)` → `FortWorkPlan { segments, wood, stoneM3? }`
  (kámen po úsecích).
- **`pushWork(next, day, obstacles, input, walk)`** → důvod nebo null. **Cena předem jen klády
  a kámen**: klády celé stavby (součet nahoru na celé) z hromady, zbytek vyhradí mezi nejbližšími
  stromy k těžišti plochy (`planWoodFrom` s `fellManDaysPerTree: pileSaves.logManDays` – strom
  opevnění za 1 čd × `distanceFactor`, ne obecné 2 čd); chybí → `FORT_NO_WOOD`. Kámen
  `fortStonePlan`: napřed z hromad (`stoneOnHand`, `takeStone` od nejbližší k těžišti), zbytek
  z lomu v nejbližším skalním výchozu (`quarryNear`) za `stoneManDaysPerM3` × m³ × `distanceFactor`
  vzdušné vzdálenosti; bez výchozu → `FORT_NO_STONE(chybí)`, stav se nemění. Lámání se rozpočítá
  do práce úseků podle jejich kamene (`fortSegments[].cost` – úsek je hotový i s kamenem; pořadí
  práce ani `workFortification` se nemění). Bez vrstvy překážek (testy) se láme jako u blízkého
  lomu. Práce se nečeká. Cena překážek pásu se k práci nepřičítá – cena je jen podle délky (návrh
  Clauda). Rozdělaná stavba drží uloženou `cost` a `fortSegments` – ceny komplet ji nepřecení.
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
  úseky, které palisádu ještě nemají, za cenu palisády (`fortificationCost('palisade', …, 'fence')`),
  plot nic nevrací. `top` jen na valu (`FORT_NOT_RAMPART`), celý postavený (`FORT_RAMPART_UNFINISHED`),
  úseky bez nástavby za cenu samotného plotu nebo palisády po délkách valu (ochoz `FORT_WALKWAY_NEW`,
  roštová a komorová podle roku – vstup je zatím nenabízí); rozdělanou nástavbu jen stejným druhem
  (`FORT_TOP_DONE`). `FORT_BUSY`, když na dílech, které by stavba měnila, běží jiná stavba
  (vylepšení: díly bez palisády; nástavba: celý val) – [Vylepšení po
  úsecích](#vylepšení-po-úsecích-fortification-upgradets-fortificationupgradets).
- **`addGateToFortification(state, geo, fortificationId, position)`** – `addGate` na obvod
  (`FORT_GATE_OFF`, `FORT_GATE_TAKEN`), kdykoli, nic nestojí.
- **Zrušení** (`cancel-construction.ts`, `dropFortificationWork`): hotové úseky stojí, nehotové
  jsou mezera (`builtDay` null – pás mezery jiným stavbám nepřekáží); nové opevnění bez hotového
  úseku zmizí celé, nástavba bez hotového úseku zruší `top`. Nespotřebované dřevo se vrátí
  (`returnConstructionWood`).
- **Robota hostů** napřed do opevnění – až Ú4.5 (`VillageState.guests` zatím není; komentář
  v `labor.ts`).

## Vylepšení po úsecích (`fortification-upgrade.ts`, `fortification/upgrade.ts`)

Plán hradeb Úloha 8 (nahrazuje Úlohu 9 plánu bourání); fortifications.md – Hradby a obrana, Druhy
a postup vylepšení; demolition.md – Opevnění.

- **Víc staveb na opevnění** (Martin 8. 11. 2026 – „B“): každý úsek zvlášť, jedna stavba na díl.
  `fortRuns(constructions, id)` (`fortification/runs.ts`) → `FortRuns { byIndex, all }` – práce
  a cíl (`FortSegmentRun { work, target }`) po dílech z `fortSegments`; stavba nového opevnění
  (`build`) a stavba bez dílů na celém obvodu (`all`). `busySegments` – díly s běžící stavbou;
  `FORT_BUSY` vrací vylepšení, nástavba i zboření jen, když běží stavba na některém z jejich dílů.
  `runTarget(run)` – hradba, kterou práce staví (`fortTarget`, starší `upgrade` palisádu).
  Stavba bere práci ze společné práce rovným dílem jako ostatní stavby (`simulate-build.ts` beze
  změny). Obyvatelé dál nepřestavují ani neobnovují opevnění, na kterém běží jakákoli stavba
  (`decay.ts` – po dílech až Úloha 10).
- **Stěny** – `segmentBlockKind(fort, seg, work)` bere `FortRuns` (nebo jednu práci pro celý obvod –
  starší volání a testy): díl s rozdělaným vylepšením blokuje pásem cílové hradby (bez valu), na valu
  pásem valu; zbořený díl, který vylepšení staví znovu (`fortTarget`), blokuje pásem cílové hradby
  (staveniště). Bez nových staveb bit po bitu jako dřív (`fortification-paths` beze změny).
- **Co na dílu stojí** – `upgradeBase(fort, seg)` → `wall` (stojící hradba `{ wall, onRampart }`,
  i prolomená), `rampart` (holý val, i se zbořenou nástavbou), `gap` (zbořený nebo nedostavěný
  díl). `needsUpgrade(base, target)` – hradbu stejnou či vyšší vylepšení nechá (stupně
  `WALL_ORDER`, `wallRank`).
- **`startSectionUpgrade(state, day, landscape, obstacles, { fortificationId, segment, target },
walk?)`** – úsek s dílem `segment` (`sectionOf`), `null` = „Vylepšit vše“ (všechny díly v jedné
  stavbě, zbořené díly vynechá – demolition.md). Díly úseku mezi branami, které cíl ještě nemají:
  stojící nižší hradba za `fortificationCost(target, délka, from)` (skok o víc stupňů za cenu
  cílového, ochoz z palisády přístavba 150 čd + 10 klád na 100 m), holý val a mezera za cenu nové.
  **Díl s branou** (rozhraní dvou úseků – druh má jeden pro celý díl; návrh Clauda) se zvedne, jen
  když hradba po obou stranách brány (sousední díly) bude mít aspoň cílový stupeň – jinak brána
  zůstane nižší, dokud se nevylepší i sousední úsek; úsek tak nesahá do sousedního a ten smí mít
  vlastní stavbu. Kusy dílů bran, které jsou mezerou (zbořený úsek – `demolishedBeforeGate` /
  `demolishedAfterGate`), se postaví znovu jako to, co na dílu stojí (val a hradba jako nové podle
  délky kusu; `FortSegmentWork.part`). Pořadí práce `fortWorkOrder`, celý díl před kusem.
  Kontroly v pořadí: rok (`wallYearReason` podle `day` = `state.lastDay` akce), nic k vylepšení
  (`FORT_UPGRADE_NONE` „Úsek už takovou hradbu má.“), ochoz jen na stojící palisádu
  (`FORT_WALKWAY_NEW`; Martin 8. 11. 2026: „ne – napřed palisáda, pak vylepšení v podobě ochozu“),
  `FORT_BUSY`, umístění. **Umístění** – `checkFortificationPlacement(…, kind, only)`: `only` = díl →
  šířka pásu cílové hradby (bez valu `bandM`, na valu `wallOnRampartBandM`), jen díly, kde se pás
  rozšíří, a mezery; ohyb jen v dílech `only` (`outlineBend(outline, reach, only)`) – ostřejší než
  nejmenší ohyb cíle `FORT_BEND_KIND` („Ohyb je na tento druh příliš ostrý.“); pás, voda, stavby,
  skalní výchoz, posvátný háj a dub jako u nového opevnění (bez sebe sama); překážky osadníci
  odstraní, široké hradby vezmou díly polí a sadů (`giveWayToBuilding`). Klády a kámen předem
  (`pushWork` – `FORT_NO_WOOD`, `FORT_NO_STONE`). Stavba `fortWork` `upgrade` (bez valu) nebo
  `top` (některý díl na valu) s **`fortTarget`**; nic se na dílech na začátku nemění – stará hradba
  stojí a brání, dokud díl není hotový.
- **`sectionUpgrades(state, day, landscape, obstacles, { fortificationId, segment }, walk?)`** →
  `FortUpgradeOption { target, laborManDays, logs, stoneM3, block }[]` – stupně, na které by se
  v úseku něco změnilo (vyšší než nejnižší stojící hradba; na mezeře a holém valu všechny), cena
  bez kácení a lámání a důvod z `startSectionUpgrade` (na klonu). Rozhraní ji zatím nevolá
  (tlačítka Vylepšit – Úloha 17).
- **Práce** – `segmentDone` / `workFortification` pro stavbu s `fortTarget`: díl je hotový, když na
  něm stojí cílová hradba (`upgradeDone`), kus dílu brány, když už není mezerou.
  `completeUpgrade(fort, seg, target, day, part?)`: mezera dostane hradbu bez valu (`builtDay`, stav
  1, `kind`, zmizí `demolishedDay`, nástavba a údaje valu); na valu nástavba (`top`, `topBuiltDay`);
  bez valu nový `kind` a `builtDay`. Ochoz je přístavba – palisáda drží `builtDay` (na valu
  `topBuiltDay`) i stav. Průlom a ohořelý průlom vylepšení zavře. Konec (`finishFortification`):
  `settleUpgrade` – mají-li všechny nezbořené díly týž druh jiný než opevnění, stane se druhem
  opevnění (plot celý palisádou je palisáda; i pro starší `upgrade`), opevnění bez valu ztratí
  nástavbu. **Zrušení** (`dropFortificationWork`): hotové díly mají cílovou hradbu, ostatní starou –
  nic se nevrací ani nemaže. Zboření, po kterém nestojí žádný díl, opevnění smaže jen bez jiné běžící
  stavby. Přestavba (`rebuild`) pozná nástavbu podle valu dílu (`segmentRampart`), ne podle druhu
  opevnění – díl bez valu v opevnění s valem se přestaví jako hradba.
- **Akce** – `upgradeFortification` (use-case) a záměr `fortification-upgrade` (`build-intent.ts`)
  s `target` (a `segment`) volají `startSectionUpgrade`, bez něj starší `startFortificationUpgrade`
  (správce, panel celého opevnění) beze změny výsledku.
- **Rozhraní** (minimum, plné ve Úloze 17): `VillageFortSection` nese průběh, práci a id stavby na
  dílech úseku (`selectionDetails` je dá panelu úseku – zrušení té správné stavby);
  `SceneFortSegment.work` – práce stavby dílu, když na opevnění běží víc staveb (`segmentBuild`
  čte `look.work ?? fort.work`). Scéna nových druhů ve stavbě a vytyčení po dílech – Úloha 18.

## Val pod hradbou a vodní příkop (`fortification-rampart.ts`, `moat.ts`)

Plán hradeb Úloha 11; fortifications.md – Hradby a obrana, Druhy (dvě vrstvy, doplnění valu, vodní
příkop), Cena. Scéna valu vně a vody je Úloha 18 – zatím kreslí díl jako dřív.

- **Doplnění valu** – `startRampartAddition` (stav, den, krajina, překážky, opevnění a díl úseku –
  `segment` null = celé opevnění, chůze): díly úseku s dostavěnou hradbou bez valu (ne prolomené
  ani zbořené – `canAddRampart`); díl s branou až s valem po obou stranách brány (jako
  vylepšení). Důvody `FORT_RAMPART_DONE` „Úsek už val má.“ (i rozestavěný), `FORT_RAMPART_NO_WALL`
  „Val se doplňuje jen pod stojící hradbu.“, `FORT_BUSY` a důvod z umístění –
  `checkFortificationPlacement` s druhem `rampart` a pásem přes křivku (`FortBandSpan` – 7 m ven,
  dovnitř šířka hradby), ohyb valu 8 m, dotyk s jiným opevněním i vnějším okrajem; val vezme díly
  polí a sadů (`giveWayToBuilding`). Cena valu (`fortificationCost`, 150 čd na 100 m), bez klád;
  stavba `fortWork: 'rampart'`.
- **Přepis při zahájení** (`fortification/rampart.ts` – `startRampartOn`): `kind: 'rampart'`, `top`
  = hradba, `topBuiltDay` = dřívější `builtDay`, `builtDay: null`, `rampartOutside: true` – „hradba
  stojí, val se staví“: díl není mezera, hradba brání a stárne dál, staveniště blokuje celým pásem
  od zahájení. `rampartHeight: 1` jen u opevnění se sníženým valem (návrh Clauda – jinak díl sleduje
  výšku valu opevnění a jeho údržbu). Dokončení dílu dá jen `builtDay` (stav, stárnutí a průlom
  hradby zůstanou); `settleUpgrade` opevnění s valem vně na val nepřevede.
- **Zrušení** (`dropFortificationWork` → `revertRampartAddition`): díly bez hotového valu jsou
  přesně jako před zahájením (druh, `builtDay` hradby, stav, `extraAgeDays`); hotové díly val mají.
- **Pás přes křivku** (`band.ts`): `spanPieces` – kusy pásu mezi dvěma okraji od křivky (dovnitř
  kladně, vně záporně), u vydutého ohybu, kde se boční hrany zkříží, trojúhelník u vnitřního okraje;
  `bandPieces` je `spanPieces` od křivky (beze změny). `bandLine` – rovnoběžka s křivkou podél dílu
  (osa příkopu). `fortificationBand` přidá dílům s valem vně jejich vnější pás; `bandWidthOf` u nich
  počítá dovnitř jen šířku hradby (i cílové při vylepšení – `targetBand` ve
  `fortification-upgrade.ts`).
- **Stěny** (`walls.ts`): `fortBlockingSegments` vrací u valu vně `outside` (7 m ven, dovnitř šířka
  hradby – při vylepšení cílové –, nejméně 3 m); stěny ze `spanPieces`, otvor brány přes celý pás
  (hráz), objížďka (`detourPoints`) u dílu s valem vně a u jeho sousedů o 7 m dál; `fortLayoutKey`
  přidá `:o7/3` jen u nich. Pochod (`march-grid.ts`) tím dostane buňky valu vně – se stojící
  hradbou stěna, bez ní pás valu.
- **Vodní příkop** (`fortification/moat.ts`): osa příkopu `moatAxisOffsetM` = −`outM` + 2 m (val na
  křivce 2 m uvnitř, val vně 5 m vně). `moatSource` – nejbližší vodní políčko (potok, řeka, tůň) do
  `moat.reachM` (30 m) od osy dílu (střed políčka, při shodě menší index): hladina `levelM` = výška
  terénu políčka, `distanceM`. `moatSegments` – díly úseku (i díl s branou na jeho konci)
  s hotovým nezbořeným valem; zdroj je díl nejblíž vodě s dnem (nejvyšší terén osy −
  `rampartBand.ditchDepthM` 1,5 m) pod hladinou, voda zaplní souvislé díly s dnem pod hladinou.
  `startMoatFill` – důvody `FORT_MOAT_NO_RAMPART`, `FORT_MOAT_NO_WATER` „Příkop nedosáhne k vodě.“,
  `FORT_MOAT_DONE`, `FORT_BUSY`; strouha `moat.manDaysPerM` (¼ čd) na 1 m nenapuštěných dílů,
  `fortWork: 'moat'`. Voda přijde naráz s koncem stavby (`finishMoatFill` – `moatDay`; návrh
  Clauda: strouha napustí příkop, až je hotová); zrušení nic nenapustí, srovnaný val příkop ztratí.
- **Voda v pochodu a přechodu**: `moatDitchPieces` – pás příkopu 4 m napuštěných dílů bez kusu pod
  tětivou brány; `marchGrid` z něj (mimo `moatFrozen` – měsíce 12, 1, 2) dá buňky `MARCH_WATER`
  s tempem 0, buňky brány zůstanou průchozí. `assaultSteps` – zasypat vodní příkop jen mimo bránu
  (brána má hráz či most – návrh Clauda).
- **Akce**: use-casy `addFortificationRampart`, `fillFortificationMoat`
  (`application/fortification-rampart.ts`); tlačítka a server actions – Úloha 17. Testy
  `fortification/__tests__/rampart-addition.test.ts` a `moat.test.ts`.

## Úseky pro hráče a zboření (`sections.ts`, `fortifications.ts`; demolition.md – Opevnění)

- **`fortSections(fort)`** → `FortSection { segments, gateSegment }[]` – úsek pro hráče = díl
  s branou a díly po směru hodin až před další díl s branou (návrh Clauda); bez brány i s jedinou
  branou jeden úsek (bez brány od dílu 0, `gateSegment` null). Úseky se neukládají – vždy znovu
  z `gates`, takže nová brána úsek rozdělí. **`sectionOf(fort, segment)`** – úsek dílu.
- **Přesně zvýrazněná hradba** (`section-spans.ts`, sdílí server i web – `apps/web/lib/fort-sections.ts`
  jen vyvezuje): **`fortSectionSpans(lengths, gates)`** = úsek od okraje brány po okraj další brány
  (`fromM`, `lengthM`); **`sectionPieces(lengths, gates, gateSegment)`** → `SectionPiece { index,
part?, lengthM }[]` – kusy dílů téhož úseku: celé díly mezi branami a z dílu s branou kus
  od okraje brány do úseku (`part` `'after'` za bránou na začátku úseku, `'before'` před bránou na
  konci; s jedinou branou má její díl obojí; kus kratší než 5 cm se vynechá). Součet délek kusů =
  `lengthM` úseku (test na Vlkovu).
- **Díl ve stavu** (`FortSegment`): `demolishedDay` – zbořený plot či palisáda, srovnaný val;
  `demolishedBeforeGate` / `demolishedAfterGate` – den zboření kusu dílu s branou před / za bránou
  (jen díly bran; brána a zbytek dílu stojí, kus je mezera; volitelné, starší vsi beze změny);
  `top` – nástavba dílu, když se liší od `Fortification.top` (`'none'` = zbořená nástavba).
  **`segmentTop(fort, seg)`** (`life.ts`) = `seg.top ?? fort.top`, `'none'` → null – čtou ji
  `rotting` (stáří nástavby), `breachWork`, `fortCells` (march-grid),
  `blocks` (battle) a cena přestavby nástavby (`decay.ts`). **`segmentIsOpen(seg)`** – díl bez stěny
  (nedostavěný, prolomený, zbořený); používá ho `segmentStands` a `segmentIsGap` (defense.ts).
  Bez nových údajů bit po bitu jako dřív (`fortification-paths`, válečné testy beze změny).
- **`sectionDemolition(state, geo, { fortificationId, segment })`** → `{ work, laborManDays, logs }`
  nebo `{ reason }` (popisek tlačítka Zbořit); **`startSectionDemolition(state, day, geo, input)`**
  založí stavbu `fortification` s `fortWork` `demolish` / `level` (bez ceny předem, jen práce ze
  společné práce). Kusy = `sectionPieces` (brány zůstávají, zboří se hradba od okraje brány po
  okraj brány), jen dostavěné a nezbořené (i prolomené a shnilé); `FortSegmentWork.part` označuje
  kus dílu brány, práce i klády podle jeho délky. Kus dílu brány na valu se srovná až při `level`
  (nástavbu valu boří jen celé díly – nástavba je údaj celého dílu). Plot a palisáda: `demolish` celého dílu; val s nástavbou: `demolish` jen
  dílů, kde nástavba stojí; val bez nástavby: `level`. Práce dílu `DEMOLITION.laborShare` × práce
  komplet podle délky (`fortificationFullCost(druh či nástavba, délka)` – „práce stavby“ je od 8. 11. cena komplet, návrh Clauda), val `rampartLaborShare` × práce valu. Klády dílu `logShare` × klády dílu × `seg.state` (necelé
  v `FortSegmentWork.logs`), celé dolů jednou za stavbu; místo hromady `Construction.fortLogsAt`
  (střed prostředního dílu). Důvody `FORT_BUSY` (na dílech úseku běží jiná stavba), `FORT_SECTION_GONE`
  („Úsek už je zbořený.“), `FORT_SECTION_GATE_ONLY` (úsek jen z dílu s branou), `FORT_UNKNOWN`.
- **Práce** (`workFortification`, `demolishSegment`): díl hotový, když na něj dojde práce – val
  s nástavbou `top: 'none'`, bez `topBuiltDay`, stav 1; jinak `demolishedDay`, stav 0, průlom
  zmizí; kus dílu brány jen nastaví `demolishedBeforeGate` / `demolishedAfterGate` (stav dílu
  a průlom se nemění). Mezera kusu: `fortWalls` vynechá pás před / za tětivou brány (chodci, vozy,
  stáda, pochod `march-grid` jdou mezerou; `fortBlockingSegments` nese `gone` pro `fortLayoutKey`),
  `fortGaps` přidá `gap` o délce kusu. Scéna kus nekreslí (`inGoneGatePart`), obrys výběru ho
  vynechá (`standingPieces`), rozebírání kusu bez průběhu (kus zmizí hotový). Stavba drží indexy dílů – brána přidaná během zboření práci nezmění (Review Focus 3).
- **Konec** (`finishFortification` → `settleDemolition`): klády na hromadu (`addLogs` u cesty
  nejblíž úseku), kronika **`fortification-demolished`** `{ logs, level? }` místo
  `construction-finished` (`simulate-build.ts` – `finishFortification` vrací událost). Val, na
  kterém žádná nástavba nestojí, je val bez nástavby (`top` zmizí z opevnění i dílů); opevnění bez
  jediného stojícího dílu zmizí (obvod bez brány zbořený celý – návrh Clauda). **Zrušení**
  (`dropFortificationWork`): zbořené díly zůstanou, jejich klády přijdou na hromadu (návrh Clauda).
- **Zbořený díl jinde:** mezera v obraně (`segmentIsGap`, `fortGaps` druh `gap` celou délkou dílu),
  stěny a cesty ho nevidí (`segmentBlockKind`), pás jiným stavbám uvolní (`fortificationBand`),
  obyvatelé ho nepřestaví ani neudržují (`dueSegments`, obnova a údržba valu, stav nechátrá),
  nájezd ho neprolomí (`applyFortificationBreach`), pochod jím projde (`fortCells` – srovnaný val
  není pás čtvrtinového tempa). Vylepšení celého opevnění (`startFortificationUpgrade`) zbořené
  díly vynechá, nástavba se zbořenou nástavbou dílu postaví znovu (`delete seg.top`); plot je
  palisádou, když jsou palisádou všechny nezbořené díly.
- **Rozhraní** (Úloha 12 – zatím jen Zbořit; Vylepšit po úsecích – doména hotová (plán hradeb Ú8), tlačítka Úloha 17 plánu hradeb; výběr podle
  Martina 8. 11. 2026): tři výběry ve `village-picking.ts` – `fortTargetAt` (čisté funkce
  z `lib/fort-sections.ts`, polohu kliku po obvodu dá `perimeterPosition`):
  - **brána** `{ kind: 'fortification-gate', id, segment }` (díl brány) – klik na pás nebo do
    `FORT_PICK_M` od okraje do `FORT_GATE_PICK_MARGIN_M` (0,75 m) za okrajem brány po obvodu; má
    přednost před úsekem i cestou (jako křižovatka);
  - **úsek** `{ kind: 'fortification-section', id, segment }` – `segment` je první díl úseku jádra
    (díl brány na začátku, bez brány 0); úsek se hledá **podle polohy kliku po obvodu**
    (`fortSectionSpans` + `spanAt`), ne podle dílu – brána leží uvnitř dílu (`offsetM`), takže
    začátek dílu s branou patří ještě k předchozímu úseku. Zbořený díl je mezera (`fortSegmentAt`
    – kus pásu podle `SceneFortification.bandSegments`, jinak nejbližší okraj dílu do `FORT_PICK_M`);
  - **celé opevnění** `{ kind: 'fortification', id }` – dvojklik (`wholeTarget` úseku i brány, jako
    díl pole → pole); `fortTargetId` drží režim přidávání brány u všech tří výběrů.
- **Úsek pro hráče** (`fortSectionSpans` v `lib/fort-sections.ts`): hradba od okraje brány po okraj
  další brány po obvodu (střed brány `gateCenterM` = začátek dílu + `offsetM`, ± `FORT_GATE_HALF_M`),
  `segments` = díly, kterých se dotkne (i díly bran na koncích – napůl sousední úsek), bez brány
  celý obvod od dílu 0, s jednou branou kolem dokola. Úseky + brány = celý obvod. Úsek jádra pro
  zboření (`fortSections`) se k němu přiřadí podle `gateSegment`.
- **Panel** (`fortificationViews`): `sections` – `VillageFortSection` = díly jádra a zboření
  (`sectionDemolition` → `FortDemolishOption { work, cost, blocked }`, běžící stavba „Stavba už
  běží.“) + `lengthM` hradby úseku a stav dílů úseku (`FortPartsState`: `parts`, `builtParts`,
  `weakest`, `oldParts`, `ageYears` nejstaršího; zbořené díly se nepočítají jako hotové);
  `gateViews` – `VillageFortGate { segment, state, old, ageYears }` dílu brány. `selectionDetails`
  (`fortificationDetails`): `fortification` = celé (`VillageFortification`), `fortification-section`
  = úsek + průběh stavby a id stavby (zrušení), `fortification-gate` = brána + cesta branou
  (`nearestRoad` do půl šířky brány od středu brány → `view.roads`, druh a id cesty). Panely
  (`hud/selection/fortification.tsx`): `FortificationBody` – délka obvodu, stav, brány
  (násobek zrušen 8. 11. 2026), útočiště, průběh, vylepšení celého opevnění, Přidat bránu; `FortSectionBody` – délka úseku
  (`selection-fort-section-length`), díly hotové / všechny, stav nejslabšího dílu (oranžově za
  životností), stáří nejstaršího dílu, průběh, ikona Zbořit (`fort-demolish`; popisek „Zbořit úsek“
  / „Zbořit nástavbu úseku“ / „Srovnat val úseku“, práce a klády `+N` zpět, nebo důvod červeně),
  Přidat bránu; `FortGateBody` – portrét brány (`FORT_GATE_NAMES`: „Brána plotu / palisády /
  valu“), stav a stáří dílu brány, ikona cesty branou (klik ji vybere). Zrušit bránu nejde.
- **Zvýraznění** (`selection-highlight.ts`): `fortBandRings(fort, fromM, lengthM, margin)` – obrys
  pásu z `perimeterSamples` (tentýž pás, podle kterého scéna staví kůly, plot i val: křivka
  = vnější okraj, šířka pásu druhu, v ostrém ohybu vnitřní okraj do rohu), zbořené díly ho dělí;
  `fortSectionRings` – úsek mezi okraji bran, `fortGateRings` – brána s okrajem 0,5 m, celé
  opevnění – oba okraje pásu jako dvě uzavřené čáry. **Dřív nesedělo** (Martin 8. 11. 2026 na
  Vlkově): obrys šel po dílech úseku jádra – od začátku dílu s branou (brána Vlkova v dílu 0 stojí
  14 m od jeho začátku, v dílu 44 4 m) po konec dílu před další branou, takže přesahoval přes
  bránu do sousedního úseku a před další branou končil o kus dřív; klik před branou v jejím dílu
  vybral úsek za branou.
- **Scéna** (`segmentBuild` ve `fortification-layout.ts`): zbořený díl nekreslí nic (palisáda,
  plot, nástavba, brána dílu ne – díl s branou se nebourá; val výška 0 → bez náspu a příkopu
  v `rampart-mesh.ts` i `ditchCuts`); bouraný díl je staveniště pozpátku –
  `fortSitePhase(vrstva, 1 − průběh)` pro plot a palisádu u země i nástavbu (`demolish`), hlína
  valu `1 − průběh` (`level`). Nástavba dílu přes `segmentTop` (`top: 'none'` – val bez ní).

## Stáří, přestavba a údržba valu (Ú5.4)

- **`fortification/life.ts`** (čistá matematika, bez stavu vsi): `segmentState(fort, seg, day)` –
  1 do konce životnosti (`FORTIFICATIONS.lifeYears`: plot 15, palisáda 20 let od `builtDay`; val
  s nástavbou od `topBuiltDay` podle `top`; holý val nehnije), potom rovnoměrně na 0 za
  `decayYears` (5). `segmentIsOld` = dožilý, `segmentStands` = hotový, neprolomený a (plot,
  palisáda) se stavem nad 0 – **mezera na nule**; používá ji `segmentBlockKind` (stěny,
  `gateRoadCrossings` i klíč `fortLayoutKey` shnilý úsek nevidí). Rok = 365 dní.
- **`fortification/decay.ts`** `decideFortRebuilds(state, day, geo, obstacles)` (krok dne za
  `decideRebuilds`): u každého opevnění **bez běžící stavby** zapíše `seg.state` ke dni; úsek, na
  který se staví, stav drží (stojí a brání). Pak založí jednu stavbu `rebuild` pro všechny dožilé
  úseky (průlom `breachedDay` v plánu první, pak v pořadí práce od brány) za cenu nového úseku
  (`fortificationCost` bez `from`, kámen roštové a komorové zůstane – plán bez kamene; klády předem
  přes `pushWork`, strom za 1 čd × vzdálenost – **bez dřeva se nezačne a úsek chátrá dál**, zkouší
  se každý den). Dokončený úsek: `builtDay` (`topBuiltDay`)
  = den, `state` 1, `breachedDay` pryč (`workFortification`). Staré kůly nic nevrátí. Hráčovo
  opevnění stejně – rozhoduje jen stáří. Bez lidí (opuštěná, vymřelá ves) ani bez krajiny nic.
- **Údržba po úsecích** `fortUpkeep(state, laborLeft, geo): { used }` (v `work()` hned za opravami
  obydlí; Hradby a obrana – Životnost a údržba): každá hotová nezbořená vrstva dílu (hradba i val)
  potřebuje `upkeepPer100MYear` čd na 100 m ročně (plot 1, palisáda 1, ochoz 2, roštová a komorová
  5, val 2), počítá se za den ze zbytku společné práce, opevnění po opevnění. Díl, na kterém běží
  stavba (`busySegments`), se neudržuje. Nedodělek se dělí rovným dílem na všechny vrstvy:
  hradba dostane `extraAgeDays += podíl` (rok bez údržby = o rok víc; `rotting` v `life.ts` ho
  odečte od `builtDay`, dokončená přestavba ho smaže), val tratí výšku tempem `rampartNeglect`
  (0,5 za 50 let, `Fortification.rampartHeight`). Víc práce výšku nevrací.
- **Přestavba po dílech:** `decideFortRebuilds` už nečeká, až na opevnění neběží nic – díly se
  stavbou (`busySegments`) drží stav a nepřestavují se, ostatní chátrají a přestavují se dál;
  obnova valu se přeskočí jen na dílech se stavbou. Cena přestavby dožilé hradby
  `fortificationRebuildCost(druh, délka)`: plot a palisáda plná cena, **ochoz** cena palisády
  (30 h na 1 m) + fošny ochozu 2 h na 1 m (20 čd a 10 klád na 100 m, `rebuild.walkwayPlanksPer100M`),
  násyp zůstane (návrh Clauda; Martin: „nevím, něco navrhni“), **roštová a komorová** ⅓ práce
  a klád bez kamene (`rebuild`). Průlom a nedostavěný díl se staví za cenu nového úseku.
- **Obnova valu** (`restore`): výška pod `renewBelowHeight` 0,75 a žádná jiná stavba na opevnění →
  stavba za `renewCostShare` (½) ceny valu přes všechny hotové úseky, bez dřeva; po dokončení
  (`finishFortification`) se `rampartHeight` smaže (plná).
- **Odchylky od plánu / zatím nehotové:** funkce berou i `geo` (délky úseků se počítají z tvaru
  plochy); přednost průlomu před _jinými stavbami vsi_ a podmínka „cizí vojsko odešlo“ patří
  k válce (Ú5.5); opuštěná ves je mimo simulaci, takže val v ní výšku neztrácí (rozdíl proti
  abandonment.md řeší až probuzení vsi).

## Obrana, útočiště a prolomení (Ú5.5)

Čistá doména pro válku (F6), nic ji zatím nevolá; soubory `fortification/{defense,refuge,breach}.ts`,
testy `__tests__/defense.test.ts`. Funkce berou `geo` (`GridGeometry`) jako ostatní.

- **`defense.ts`** – **násobek obrany zrušen 8. 11. 2026** (fortifications.md – Obrana bez násobku;
  `segmentMultiplier` a `defenderMultiplier` pryč). Mezera `segmentIsGap` (nedostavěný, prolomený,
  plot / palisáda shnilé na 0). `fortsContaining(geo, forts, body)` – pro každý bod pořadí
  opevnění, uvnitř jehož obvodu (křivky) leží, jinak null; obvod každého opevnění jednou (vzdání
  za opevněním a NPC velitel – `docs/code/war.md`). `fortGaps(geo, fort, day, closedGates)` –
  otevřené brány (`closedGates` = indexy úseků se zavřenou bránou), `gap` a `breach` (4 m).
- **`refuge.ts`** – `refugeCapacity(geo, fort)` = `innerAreaM2`; `refugeAdmit(capacityM2, arrivals,
gateCloseTick)` (bere plochu místo opevnění): příchozí po zavření brány venku; ostatní podle
  přednosti lidé → koně a voli → skot → drobný dobytek (uvnitř skupiny podle taktu příchodu);
  `homeInside` lidé nic nenesou, zvenku 25 / 10 kg (`carriedKg`).
- **`breach.ts`** – `breachWork(fort, seg, 'gate' | 'wall')` (0 / 2 / 12 / 96; val podle nástavby,
  holý val 0), `breachPace` (val `rampartAssaultPace` = 0,25), `breachStart`, `breachStep(progress,
men, hours)` (nejvýš 4 muži). Práh vzdání s násobkem (`surrenderThreshold`) je od 8. 11. 2026
  pryč – za opevněním se skupina nevzdá, dokud útočník nestojí uvnitř obvodu (`war/stance.ts`).
- **Odchylky od plánu:** funkce navíc berou `geo`; `refugeAdmit` bere kapacitu, ne opevnění;
  `closedGates` je množina indexů úseků; pozice jsou `{ x, z }`. Čísla navíc v `FORTIFICATIONS`:
  `refuge.carryKgAdult/Child` (`rampartHeightBonus`, `surrenderOddsPerDefender`
  a `defenderKnowsPlace` zrušeny s násobkem 8. 11. 2026; `multiplier` zbývá jen pro odhad správce
  `planMultiplier`, než ho nahradí ochrana druhu – Úloha 15 plánu hradeb).

## Přechod hradby (`assault.ts`)

Čistá doména (fortifications.md – Přechod hradby, Obrana bez násobku); čísla `FORTIFICATIONS.assault`,
`.defense`, `.moat`. Bitva (`war/ladders.ts`, `wall-defense.ts`) a NPC velitel z ní jen čtou.

- `crossingLayers(fort, seg, day, atGate)` – hradba (druh, stav podle stáří), val (výška, voda jen
  napuštěná a nezamrzlá) a brána (klešťová, věž); prolomený či zbořený úsek bez vrstev.
- `assaultSteps(layers)` – všechny postupy místa (`open`, `climb`, `ladder`, `cut`, `burn`, `dig`,
  `mine`); práce a hoření × stav hradby, stav 0 = `open`. Plot: přelézt, sekat; brána: sekat, pálit,
  žebřík (u plotu jen sekání za 0); palisáda i s ochozem: žebřík, sekat, odkopat, pálit; roštová
  a komorová: žebřík, podkop. Oheň u palisády na valu má `fill: 'rampart'` (80 mužohodin), vodní
  příkop `fill: 'moat'` (48) u každého postupu mimo bránu (hráz či most – Úloha 11); obojí = `moat`
  se součtem práce.
- `assaultHours(step, men, fuelDistanceM)` – nejvýš 4 muži, otepi do 100 m (dál úměrně), hoří 2
  přikládající. `mineUnderground` – po pětině podkopu jsou kopáči pod zemí.
- `climbTicks(wall)` (takty: opřít, vylézt, druhý žebřík jen u palisády bez ochozu, slézt),
  `rampartPace` = 1 ÷ (1 + 3 v), `rampartFatigue` = 1 − 0,15 v, `fatigueFactor` (zpět za 120
  taktů), `moatFrozen` (měsíce 12, 1, 2), `fortOccupancy` (1 obránce na 5 m ochozu).
- `manHours` žebříku je jeden žebřík (4); druhý u palisády bez ochozu počítá bitva.

## Akce

- Use-casy `application/place-fortification.ts` (`placeFortification`),
  `upgrade-fortification.ts` (`upgradeFortification`), `add-fortification-gate.ts`
  (`addFortificationGate`), `demolish-fortification-section.ts` (`demolishFortificationSection`
  – díl `segment`, úsek dohledá `startSectionDemolition`) – `updateLivingVillage` v den `state.lastDay`, chůze ke stromům
  `villageRoadWalk`. Testy `application/__tests__/fortification-use-cases.test.ts`, doména
  `domain/village/__tests__/fortifications.test.ts`, adaptér `village-repository.db.test.ts`.
- Web: server actions `placeFortification` (vstup `{ points: [x, z][], kind }`),
  `upgradeFortification`, `addFortificationGate`, `demolishFortificationSection` (vstup
  `{ fortificationId, segment }`, díl od 0) (`apps/web/app/game/actions.ts`, vstupy
  `parse…FortificationInput` v `village-input.ts`; body posílá editor návrhu – web-ui.md),
  `…ForPlayer` přes `actOn` s právem `build` (`ACTION_RIGHTS`). Tlačítka a kreslení – Ú5.6; cena
  v katalogu (`BUILD_COSTS`) také až s ním – opevnění nemá pevnou cenu, jen `fortificationCost`.

## Správce a hrozba (Ú5.8)

- `fortification/threat.ts`: `villageThreat(signals, day)`, `threatWeight`, `pruneThreats`, `halfLifeFactor` (poločas bez `Math.pow`); `ThreatSignal` (`fortification/types.ts`) žije ve `VillageState.threats`, zapisuje ho schránka (`threat-signal`). Čísla `FORTIFICATIONS.threat` / `raidLoss` / `stewardRefugeMargin`, horizonty `STEWARD.fortPaybackYears`.
- Rozhodování a útočiště správce: `steward-fortification.ts`, krok `fortificationStep` v `steward-extras.ts` – podrobnosti `docs/code/village-steward.md` (Opevnění podle hrozby).
- **Obvod správce** `stewardFortificationFor(state, landscape, obstacles, day, kind)` → `{ points, lengthM }` – návrh kolem celého jádra vsi (`stewardFortificationProposal`), odstup po 5 m, dokud návrh neprojde kontrolou a útočiště nepojme lidi a dobytek + 20 %; záměr `{ kind: 'fortification', points, fortKind }`.
