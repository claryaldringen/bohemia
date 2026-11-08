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

## Cena (`cost.ts`)

- **`fortificationCost(kind, lengthM, work)`** → `BuildCost` – na 100 m `FORTIFICATIONS.costPer100M`
  úměrně délce (plot 20 čd + 15 klád, palisáda 80 + 70, val 150 čd bez klád – `upfront: {}`).
  `work`: `'new'`, `'upgrade'` (jen `palisade` – jako nová palisáda, plot nevrací nic), `'top'`
  (plot nebo palisáda na valu za cenu samotného); jiné kombinace vyhodí chybu. Nezaokrouhluje –
  zaokrouhlí až rozhraní.

## Pás (`band.ts`)

- **`bandPieces(outline, band, index, fromM?, toM?)`** – pás úseku po kusech lomené čáry:
  čtyřúhelník kus × šířka pásu dovnitř s vnitřními rohy na ose ohybu (sousední kusy sdílejí hranu,
  pás nemá mezery); kde se vnitřní rohy zkříží (ohyb ostřejší, než pás dovolí), trojúhelník – vnitřní
  okraj se sejde do rohu. Kusy přesahují o 5 cm, ať úsečka po společné hraně neprojde mezi nimi.
  `fortBandPieces` / `fortBandPolygons` – celý obvod.
- **`fortificationBand(geo, fort, building)`** – pás, který zabírá místo jiným stavbám: hotové
  úseky, a dokud na opevnění běží stavba, celý obvod. `checkFootprintFree` (`placement-land.ts`)
  ho bere u každé stavby s půdorysem (`PlacementVillage.fortifications`, důvod
  `OVERLAPS_FORTIFICATION` „Stojí tu opevnění.“).

## Stav vsi (Ú5.2)

- **`VillageState.fortifications?: Fortification[]`** (`fortification/types.ts`, přes
  `types-fortifications.ts` v `types.ts`) – volitelné, starší vsi ho nemají.
  `Fortification { id, points?, grid?, cells?, kind, top?, segments, gates, rampartHeight? }` –
  `points` od obvodu z bodů, `grid` a `cells` jen u opevnění po čtvercích do převodu
  (`withFortPoints`); tvar (křivka, úseky, pás) se z bodů vždy spočítá znovu (`outlineOf`).
- **`FortSegment { index, builtDay (null = nestojí), topBuiltDay?, state, breachedDay?, kind? }`** –
  `kind` jen u rozdělaného vylepšení (úsek s hotovou palisádou `'palisade'`, `segmentKind`).
  `state` plní chátrání (Ú5.4), `breachedDay` válka (další úlohy F5).
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
  kusy polí a sadů pod pásem (`takenLandUnder`), plot a palisáda ne – překážky dílů pod nimi patří
  poli a sadu.
- **`startFortification(state, day, landscape, obstacles, { points, kind }, walk?)`** – brány
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

## Úseky pro hráče a zboření (`sections.ts`, `fortifications.ts`; demolition.md – Opevnění)

- **`fortSections(fort)`** → `FortSection { segments, gateSegment }[]` – úsek pro hráče = díl
  s branou a díly po směru hodin až před další díl s branou (návrh Clauda); bez brány i s jedinou
  branou jeden úsek (bez brány od dílu 0, `gateSegment` null). Úseky se neukládají – vždy znovu
  z `gates`, takže nová brána úsek rozdělí. **`sectionOf(fort, segment)`** – úsek dílu.
- **Díl ve stavu** (`FortSegment`): `demolishedDay` – zbořený plot či palisáda, srovnaný val;
  `top` – nástavba dílu, když se liší od `Fortification.top` (`'none'` = zbořená nástavba).
  **`segmentTop(fort, seg)`** (`life.ts`) = `seg.top ?? fort.top`, `'none'` → null – čtou ji
  `rotting` (stáří nástavby), `segmentMultiplier`, `breachWork`, `fortCells` (march-grid),
  `blocks` (battle) a cena přestavby nástavby (`decay.ts`). **`segmentIsOpen(seg)`** – díl bez stěny
  (nedostavěný, prolomený, zbořený); používá ho `segmentStands` a `segmentIsGap` (defense.ts).
  Bez nových údajů bit po bitu jako dřív (`fortification-paths`, válečné testy beze změny).
- **`sectionDemolition(state, geo, { fortificationId, segment })`** → `{ work, laborManDays, logs }`
  nebo `{ reason }` (popisek tlačítka Zbořit); **`startSectionDemolition(state, day, geo, input)`**
  založí stavbu `fortification` s `fortWork` `demolish` / `level` (bez ceny předem, jen práce ze
  společné práce). Díly = úsek bez dílu s branou (brány zůstávají), jen dostavěné a nezbořené
  (i prolomené a shnilé). Plot a palisáda: `demolish` celého dílu; val s nástavbou: `demolish` jen
  dílů, kde nástavba stojí; val bez nástavby: `level`. Práce dílu `DEMOLITION.laborShare` × práce
  podle délky (`fortificationCost(druh, délka, 'new')`, nástavba `'top'`), val
  `rampartLaborShare` × práce valu. Klády dílu `logShare` × klády dílu × `seg.state` (necelé
  v `FortSegmentWork.logs`), celé dolů jednou za stavbu; místo hromady `Construction.fortLogsAt`
  (střed prostředního dílu). Důvody `FORT_BUSY` (jedna stavba na opevnění), `FORT_SECTION_GONE`
  („Úsek už je zbořený.“), `FORT_SECTION_GATE_ONLY` (úsek jen z dílu s branou), `FORT_UNKNOWN`.
- **Práce** (`workFortification`, `demolishSegment`): díl hotový, když na něj dojde práce – val
  s nástavbou `top: 'none'`, bez `topBuiltDay`, stav 1; jinak `demolishedDay`, stav 0, průlom
  zmizí. Stavba drží indexy dílů – brána přidaná během zboření práci nezmění (Review Focus 3).
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
  palisádou, když jsou palisádou všechny nezbořené díly. Scéna a rozhraní – Úloha 12.

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
  (`fortificationCost`, nástavba valu za cenu `top`, klády předem přes `pushWork` – **bez dřeva se
  nezačne a úsek chátrá dál**, zkouší se každý den). Dokončený úsek: `builtDay` (`topBuiltDay`)
  = den, `state` 1, `breachedDay` pryč (`workFortification`). Staré kůly nic nevrátí. Hráčovo
  opevnění stejně – rozhoduje jen stáří. Bez lidí (opuštěná, vymřelá ves) ani bez krajiny nic.
- **Údržba valu** `rampartMaintenance(state, labor, geo): čd` (v `work()` hned za opravami
  obydlí): 2 čd na 100 m hotových úseků ročně (`rampartUpkeep`), počítá se za den ze zbytku
  společné práce. Nedodělek (podíl) sníží `Fortification.rampartHeight` (chybí = plná) tempem
  `rampartNeglect` – bez údržby 0,5 za 50 let. Víc práce výšku nevrací.
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

- **`defense.ts`** – `segmentMultiplier(fort, seg, day)`: plot / palisáda `1 + (m − 1) × stav`, val
  `v × (1 + (m ÷ 1,5 − 1) × stav nástavby)`, `v = 1 + 0,5 × rampartHeight`; nástavba, která na
  úseku ještě nestojí (`topBuiltDay` chybí), se nepočítá. Mezera (`segmentIsGap`: nedostavěný,
  prolomený, plot / palisáda shnilé na 0) = 1. `defenderMultiplier(geo, forts, defender, attacker,
day)`: obránce uvnitř plochy → `1,5 × násobek` nejbližšího úseku (u mezery slabší ze sousedů),
  jinak 1,5; útočník v ploše dál než šířka pásu od nejbližšího úseku = uvnitř, opevnění nepočítá
  (v pásu je „v bráně / průlomu / na valu“, tedy násobek platí). `fortGaps(geo, fort, day,
closedGates)` – otevřené brány (`closedGates` = indexy úseků se zavřenou bránou), `gap` a `breach`
  (4 m).
- **`refuge.ts`** – `refugeCapacity(geo, fort)` = `innerAreaM2`; `refugeAdmit(capacityM2, arrivals,
gateCloseTick)` (bere plochu místo opevnění): příchozí po zavření brány venku; ostatní podle
  přednosti lidé → koně a voli → skot → drobný dobytek (uvnitř skupiny podle taktu příchodu);
  `homeInside` lidé nic nenesou, zvenku 25 / 10 kg (`carriedKg`).
- **`breach.ts`** – `breachWork(fort, seg, 'gate' | 'wall')` (0 / 2 / 12 / 96; val podle nástavby,
  holý val 0), `breachPace` (val `rampartAssaultPace` = 0,25), `breachStart`, `breachStep(progress,
men, hours)` (nejvýš 4 muži), `surrenderThreshold(defenders, fortMultiplier)` (útočníků musí být
  _víc_ než výsledek: 20 obránců za palisádou → 60, vzdání při 61).
- **Odchylky od plánu:** funkce navíc berou `geo`; `refugeAdmit` bere kapacitu, ne opevnění;
  `closedGates` je množina indexů úseků; pozice jsou `{ x, z }`. Čísla navíc v `FORTIFICATIONS`:
  `refuge.carryKgAdult/Child`, `rampartHeightBonus`, `surrenderOddsPerDefender`.

## Akce

- Use-casy `application/place-fortification.ts` (`placeFortification`),
  `upgrade-fortification.ts` (`upgradeFortification`), `add-fortification-gate.ts`
  (`addFortificationGate`) – `updateLivingVillage` v den `state.lastDay`, chůze ke stromům
  `villageRoadWalk`. Testy `application/__tests__/fortification-use-cases.test.ts`, doména
  `domain/village/__tests__/fortifications.test.ts`, adaptér `village-repository.db.test.ts`.
- Web: server actions `placeFortification` (vstup `{ points: [x, z][], kind }`),
  `upgradeFortification`, `addFortificationGate` (`apps/web/app/game/actions.ts`, vstupy
  `parse…FortificationInput` v `village-input.ts`; body posílá editor návrhu – web-ui.md),
  `…ForPlayer` přes `actOn` s právem `build` (`ACTION_RIGHTS`). Tlačítka a kreslení – Ú5.6; cena
  v katalogu (`BUILD_COSTS`) také až s ním – opevnění nemá pevnou cenu, jen `fortificationCost`.

## Správce a hrozba (Ú5.8)

- `fortification/threat.ts`: `villageThreat(signals, day)`, `threatWeight`, `pruneThreats`, `halfLifeFactor` (poločas bez `Math.pow`); `ThreatSignal` (`fortification/types.ts`) žije ve `VillageState.threats`, zapisuje ho schránka (`threat-signal`). Čísla `FORTIFICATIONS.threat` / `raidLoss` / `stewardRefugeMargin`, horizonty `STEWARD.fortPaybackYears`.
- Rozhodování a útočiště správce: `steward-fortification.ts`, krok `fortificationStep` v `steward-extras.ts` – podrobnosti `docs/code/village-steward.md` (Opevnění podle hrozby).
- **Obvod správce** `stewardFortificationFor(state, landscape, obstacles, day, kind)` → `{ points, lengthM }` – návrh kolem celého jádra vsi (`stewardFortificationProposal`), odstup po 5 m, dokud návrh neprojde kontrolou a útočiště nepojme lidi a dobytek + 20 %; záměr `{ kind: 'fortification', points, fortKind }`.
