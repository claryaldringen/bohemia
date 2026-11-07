# Ves – stavby, rozpad, hřbitov, sad, umístění

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: population.md, cemetery.md, orchard.md, abandonment.md, fields.md v `docs/design/`.

- **Rozpad obydlí a zbytek jámy** (population.md – Co hráč vidí, Chátrání a přestavba – Po
  zániku; Martin 18. 10. 2026): jádro – `ruins.ts`: obydlí, které zchátrá na nulu
  (`decayEmptyDwellings`), nebo jehož přestavba ho přestěhuje na nový pozemek, zapíše
  `recordRuins` do `VillageState.ruins` (`DwellingRuin` – id, typ, poloha, pozemek, řemeslo, den
  zániku); `updateRuins` (krok dne v `simulateDay`) zbytky po `RUIN_YEARS` (10) odebere a zbytky
  pod stavbou (i rozestavěnou, s krajinou i pod čtverci a pozemky) taky; po akci hráče totéž
  `withoutBuiltOverRuins` v `updateVillage`. Jen vzhled – simulace ani kontrola umístění
  zříceniny neznají, na jejich místo jde stavět. Web: `SceneVillage.dwellings[].condition`
  (jen < 1) a `SceneVillage.ruins` (`overgrowth` 0–1 – `ruinOvergrowth`). Scéna:
  `dwelling-decay.ts` (čisté funkce, testy) – stupeň podle stavu `decayStage` (≥ 70 % celý, ≥ 45
  sešlý, ≥ 20 propadá se, pod 20 zřícený); rozpadá se jen prázdné obydlí (`dwellingDecayStage` –
  obydlené je vždy celé, i znovu osídlený zchátralý dům), `DECAY_LOOKS` (kryt jámy střechou, hlína
  u vchodu, plot a záhony pozemku, kopřivy),
  `ruinLook` (hloubka prohlubně, trámy `ruin` / `ruin-late`, kopřivy – po krocích 5 %),
  `ruinHollowData` / `ruinHollowY` (zarostlá prohlubeň – síť přes obdélník jámy s úzkým lemem za
  řezem terénu `ruinPitShape` bez šíje – jinak na okraji prosvítá obloha –, uvnitř nízký zarostlý
  val po okraji, který se s časem srovná; přední strana nahoru jako terén – hlídá test),
  `decayNettles`. Díly v `models/dwellings/decay.glb` z
  `tools/blender/dwellings.py` (pátý argument `decay` – ostatní GLB se nepřepíšou; uzly
  `<typ>-<1|2|3>` konstrukce, `-thatch` vybledlé došky – materiál `decay-faded`, `-moss` zarostlé
  došky – `decay-moss`, `<typ>-ruin`, `-ruin-late` trámy na dně (počátek = dno), `nettle` –
  `decay-nettle`, v zimě
  suché jako trsy trávy); barvy jsou glTF baseColorFactor, atlas obydlí v GLB jednou. Kreslí
  `VillageRenderer` (`updateDecay`, `updateRuins`, jámy obydlí i zbytků v `updatePitCuts`):
  rozpadlé obydlí díly místo hotového modelu (do načtení decay.glb hotový model), mění se jen
  při změně stupně (`dwellingKey`). Pozemek: `plotStage(…, decay)` – `decayFence` v
  `woven-fence.ts` (větve vypadávají, kůly nakřivo `lean`, pahýly `sink`, pevně podle seedu)
  a plevel na záhonech (`PlotWeed`, trs trávy v `HomesteadRenderer`). **Řemeslné dílny se zatím
  nerozpadají** (`dwellingDecay` jim dává stupeň 0). Náhled: /dev/buildings – tlačítka **Rozpad**
  (opuštěná zemnice a polozemnice na pozemku, posuvník ▶ Rozpad: stav 100 → 0 %, pak zbytek
  jámy 10 let) a **Stupně rozpadu** (řada stupňů 0–3 a zbytek jámy) – `showcaseDecay`.

- **Opuštěné stavby chátrají** ([abandonment.md](../design/abandonment.md), Martin 18. 10. 2026:
  „Jo ty stavby, kam nikdo nechodí, budou postupně chátrat a rozpadnou se“; čísla podle rešerše
  `research/2026-10-18-abandonment.md`): `abandonment.ts`. **Opuštěná** = stavba, ke které podle
  provozu z uložených tras (1. 11.) za rok nevedla žádná cesta – trasy s `StoredRoute.visit` se
  po intervalech jako vyšlapanost sčítají do `VillageRoads.visits` (cesto-dny, `accrueVisits` ve
  `settleVillageWear`; starší ves ho dostane od dne načtení – `withVisitsSeed` – a rozhodne až
  po roce dat, `yearVisits` vrátí do té doby null; hřbitov s úmrtím za rok se navštívil) (klíč `visitKey` – `idol:<id>`,
  `shrine:<id>`, `cemetery:<id>`, `pen:<id>`; jen domácnosti, ke kterým se trasa našla; k modle,
  svatyni a hřbitovu chodí každá domácnost jen k nejbližšímu). `roadsDay` ho vrátí v den roční
  kontroly (jinak a bez krajiny null – kalibrace nic neopouští) a `simulateDay` zavolá
  `abandonmentCheck` (začne / přestane chátrat; dokončená za poslední rok – `graceDays` – ne;
  ohrada se zvířaty svého druhu – `stockedPenIds` z `penOccupancy`: stádo druhu do ohrad podle
  id a míst, u spřežení spřežení a výcvik – nikdy) a každý den `abandonmentDay` (pád, zbytky). Do ohrady bez zvířat se nechodí
  krmit (`PathVillage.pens[].stocked: false` – `pathVillageOf`, `ScenePen.stocked`, i v klíčích
  sítě). Stav `StructureWear` (`condition` ke dni `abandonedDay`; bez dne zastavené chátrání –
  sám se nezvedá, jen prací opravy) na `SacredBuilding.wear`, `Cemetery.fenceWear`, `Pen.wear`;
  stav dne `structureCondition`, den pádu `structureFallDay`. Spadne za `ABANDONMENT.fallYears` (modla
  20, svatyně 30, plot hřbitova 10, ohrada 10 let) → kronika `structure-fell` (`structure`,
  `id`; upozornění „Modla padla“ / „Svatyně se rozpadla“ / „Plot hřbitova se rozpadl“ / „Ohrada se
  rozpadla“): modla a svatyně zmizí ze `sacredBuildings` (štěstí jen ze stojících, svatyni jde
  postavit znovu) a zůstane `VillageState.sacredRuins` (`sacredRuinOvergrowth`, modla 10,
  příkop 20 let – `remnantYears`, pod stavbou zmizí), u hřbitova jen plot (`fenceWear`
  `{ condition: 0 }`, pohřbívá se dál, ve scéně plot zmizí úplně), ohrada zmizí; ohrada, do
  které se vrátila zvířata, chátrat přestane hned (nejméně 1 %). Web: `VillageSacred.buildings`,
  `VillagePen` a `VillageCemetery` nesou `condition` / `fenceCondition` a `abandoned` (panel –
  `Wear`: ikona `resources/condition` s %, ikona `resources/abandoned`), scéna
  `SceneSacred.buildings[].condition` / `abandoned`, `SceneSacred.ruins`, `ScenePen.condition`,
  `SceneVillage.cemeteries[].fence` (jen pod 1, po setinách).
  **Oprava** (abandonment.md – Oprava; Martin 19. 10. 2026: plot hřbitova vesničané opraví sami,
  jakmile se ke hřbitovu zase chodí, postupně z práce vsi, spadlý postaví znovu – a „ano“ i pro
  modlu, svatyni a ohradu): `repair.ts` (nezávisí na `abandonment.ts`). Roční kontrola
  (`keepRepaired` v `abandonmentCheck`) navštěvované stojící stavbě pod plným stavem založí stavbu
  `kind: 'repair'` (`Construction.repair` – `StructureRepair`: druh, id a stav při zahájení
  `from`; `startRepair`, ohrada i v `abandonmentDay` po návratu zvířat), opuštěné ji zruší
  (`cancelRepair` – spravené zůstane ve stavu). Spadlá modla, svatyně a ohrada se neopravují
  (zmizely), spadlý plot hřbitova ano (od 0). Cena `fullRepairManDays` = `STRUCTURE_REPAIR.share`
  (plot 0,3 z 10 čd na hotový čtverec, modla a svatyně 0,25 z `sacredBuildLabor`, ohrada 0,5
  z `penBuildLabor`) × (1 − stav), bez dřeva, ze společné práce kdykoli v roce (`build` –
  `repairNeed`; `workRepair` zvedá `wear.condition` na `repairedCondition`); hotová
  (`isRepairFinished`, `finishRepair`) záznam chátrání smaže, kronika `structure-repaired`
  (řádky „Modla opravena“, „Svatyně opravena“, „Plot hřbitova opraven“, „Ohrada opravena“,
  obecné `construction-finished` ne). Rozdělení práce: plot `cemetery` (po obvodu jako
  ohrazení), ohrada `pen`, modla a svatyně `repair` u cíle `{ kind: 'sacred', id }` – v síti
  pěšin i to provoz ke stavbě (`work('sacred:<id>')` s `visit`). Web: `ConstructionSummary.repair`,
  `VillageCemetery.repair`, `VillagePen.repair`, `VillageSacred.buildings[].repair` (průběh 0–1 –
  panel `RepairBar` „Oprava“ / „Oprava plotu“), scéna jen podle rostoucího stavu (stupně
  rozpadu a `decayFence` jdou opačně).

- **Plot podle délky** (`fence-cost.ts`: `newFenceSides`, `outerFenceSides`, `fencedSquareEquivalents`;
  oxen.md i cemetery.md – Plot podle délky; Martin 22. 10. 2026, issue #3): cena hřbitova
  (`cemeteryFoundingCost(squares, fenceSides)`, `CEMETERY.fenceShare` 0,3) i ohrady
  (`penLaborManDays(…, squares, fenceSides)`, `penTrees`, `PEN_FENCE.share` 0,5, `PEN_FENCE.trees` 4)
  platí plot jen za nové vnější strany, rozšíření tak ušetří; `fullRepairManDays` počítá s vnějším
  obrysem. Plot stojí `PEN_FENCE_INSET_M` / `CEMETERY_FENCE_INSET_M` = 1,5 m uvnitř čtverce
  (`rules-buildings.ts`, `rules-people.ts`; `GRAVE_PLACES.marginM` 2 m) – vchod `cemeteryEntrance`,
  `penEntrance`, `penSquaresEntrance` v `paths/entrances.ts`. Vrstva překážek a zlaté otisky krajiny
  se nemění.
- **Návštěva hřbitova z pohřbů** (`buriedWithinYear` v `paths/roads.ts`): 0,01 dostane jen hřbitov
  s mohylou s dnem pohřbu v posledních 365 dnech, ne všechny (starý hřbitov chátrá dál).
- **Hřbitov** (`cemetery.ts`, cemetery.md): čtverce s 56 místy na hroby, zemřelý se pohřbí do
  hotového hřbitova s místem nejblíž k obydlím (`bury(state, day, person)` v `populationDay` – za
  života, před `removePeople`), kronika `cemetery-full` (žádné volné místo). **Mohyly podle
  významu** (cemetery.md; Martin 19. 10. 2026: „Významnější lidé budou mít větší mohyly a na
  prominentnějších místech… Největší mohyly bude mít vojvodova rodina.“, velikosti schválil):
  `burials.ts` – `graveRank` (domácnost dvorce odstupňovaná – Martin 19. 10. 2026: „I ve
  vojvodově rodině jsou významnější a méně významní členové.“: vojvoda – hlava domácnosti dvorce
  i ovdovělý – a jeho žena `voivode`, ostatní dospělí z dvorce `manor-adult`, děti z dvorce
  `manor-child`; jinak dítě do 14 let `child`, hlava domácnosti od 35 let s dítětem `head` –
  nejstarší muž a jeho žena, bez muže nejstarší žena –, jinak `adult`; `manor` = celá vojvodova
  rodina podle prvního pravidla, jen staré mohyly), velikosti po druzích `GRAVE_RANK_MOUNDS`
  (vojvoda 2 × 2, dospělí z dvorce a hlava 2, dítě z dvorce a dospělý 1, dítě 1 malá – i menší
  náhrady), `placeMound` (místo v mřížce 7 × 8 čtverce – `GRAVE_PLACES`; mohyla zabere
  `MOUND_SIZES` míst: `great` 2 × 2, `large` 2 za sebou, `normal` a `small` 1; prominence =
  hloubka od branky `cemeteryEntrance` + 2 × od osy – `GRAVE_RANKS`; vojvodova rodina
  nejprominentněji, hlavy rodin hned za ní – začátek osy do `manorFrontM` od branky jim nechávají,
  dospělí a děti z dvorce u branky mimo pruh osy, ostatní děti vzadu; velká se zmenší, když se
  nevejde)
  → `Cemetery.mounds` (`GraveMound`: čtverec, sloupec, řada, velikost, druh, den). `graves` =
  pohřbení celkem; staré hroby (`oldGraves` = `graves` − mohyly) leží po jednom místě na prvních
  místech po řadách jako dřív – hřbitov uložený dřív se načte a vypadá stejně. Kapacita
  v místech: `cemeteryCapacity`, `usedPlaces`, `freePlaces` (i `acceptsBurials`, hygiena,
  `CemeterySummary.usedPlaces` / `freePlaces`, `yearsLeft` s průměrnou velikostí mohyl).
  Čtverce navazující stranou na hřbitov ho **rozšíří** (`foundCemetery`: stejné id, čtverce na
  konec s `constructionId`, dokud se ohrazují, a nepočítají se); na dva hřbitovy navázat nejde.
  Hráči se říká vždy **Hřbitov** (texty), v kódu zůstává `cemetery`.
  **Hygiena** (`villageHygiene`, 0 bez hřbitova s místem, jinak podle vzdálenosti od hotových
  obydlí a vody – vzdálenost od vody se ukládá u čtverce při založení, simulace krajinu nemá)
  násobí úmrtnost, hájení chrání. Je jen vnitřní – **nikdy ji neukazovat hráči** (Martin), panel
  ukáže jen místa na hroby (obsazená / všechna, v bublině pohřbení) a na kolik let
  (`CemeterySummary.yearsLeft` z úmrtí v kronice).
  **Pohřeb ve scéně** (cemetery.md – Pohřeb ve scéně; Martin 20. 10. 2026: „Když je pohřeb, chtěl
  bych vidět průvod lidí na hřbitov a pak na hřbitově hranici.“ – jen zobrazení): mohyla nese
  domácnost zemřelého `GraveMound.from` (zapíše `bury`); `lib/funeral-view.ts` →
  `SceneVillage.funerals` (posledních 7 dnů, lidé za márami `funeralMourners`); scéna
  `funeral-plan.ts` (čisté funkce času z okna dne pohřbu – průvod skutečnou chůzí po pěšinách
  k brance, hranice hoří do konce dne, herní den doutná, mohyla až po vychladnutí –
  `withoutHiddenMounds`), plány `planFunerals` ve `villager-plan-events.ts` → `onFunerals` →
  `funeral-renderer.ts` (máry, hranice a zbytky z `tools/blender/funeral.py`, oheň `pyre-fire.ts`,
  dým `PYRE_PLUME`). Ukázka **Pohřeb** na `/dev/landscape`.

- **Sad** (`orchard.ts`, orchard.md): staví se po čtvercích jako pole (`orchardPartsFromCells`,
  sad a hřbitov se nepřekrývají, na pole sad smí – Pole jako krajina, obydlí do sadu smí –
  Obydlí na poli a v sadu). Čtverec na teplém jižním svahu prémiové krajiny
  (`OrchardSquare.sunny` – `markSunnyOrchards` v kroku dne, premium-landscapes.md) dá úrodu
  × `PREMIUM_EFFECTS.southSlopeOrchard`. Výsadba je
  stavba ze společné práce jen v oknech
  jara a podzimu (`orchardPlantingNeed` mimo okna 0), čtverec dostane `plantedDay`. Rok sadu
  začíná 1. 3. (`orchardYear`), úroda `orchardYieldShare`. Sezónní práce celé vsi
  (`VillageState.orchardWork` – sklizeň září–říjen, péče v zimě; `orchardSeasonDay` na začátku
  dne) jde do `allocateDay` mezi polní úlohy podle konce okna. Jablka `applesKg` se jí před
  obilím (`eatMeal` ve `food.ts`, bez jablek přesně `eatDay`) a ráno 1. 3. shnijí; osev se jimi
  neřídí. Hlad (`hungry`) se řídí výhledem `outlook` – hlásí se hned, když obilí po zkažení
  jablek nevystačí. Překážky čtverce zmizí s první prací na něm a dospělé stromy (nevyhrazené
  stavbou) dají klády jako u pole; nevyklizené čtverce sadu jsou v `claimedObstacles`. Kroky
  simulace sadů (`plantOrchard`, `workOrchards`, `orchardSeasonDay`) se z `@bohemia/game`
  neexportují. **Obnova sadu** (orchard.md – Obnova sadu, Martin 18. 10. 2026 – vesničané
  obnovují sami jako přestavbu obydlí): `renewOrchards` (v `orchardSeasonDay`, každý den v oknech
  výsadby) zařadí čtverce od 50. roku sadu (`squareDueForRenewal`) – nejstarší první, nejvýš
  `renewalQuota` (desetina, nahoru, aspoň 1 – `ORCHARD.renewalShareYear`), jednou za rok sadu
  (`Orchard.renewedSeason`) a jen bez rozestavěné výsadby či obnovy sadu – do stavby sadu
  s `Construction.renewal` (čtverce nesou `OrchardSquare.renewal` = id stavby, kronika
  `orchard-renewal-started`). Práce jako výsadba (`plantingPerHa`, okna výsadby, společná práce);
  staré stromy čtverce se skácí s první prací (`plantedDay` null, nová cena výsadby bez překážek),
  během běžící sklizně jablek ne; po výsadbě nový `plantedDay` a značka zmizí. Dokončená obnova
  `construction-finished` nepíše. Čtverec, na který obnova do 60. roku nedojde, zaroste 1. 3. jako
  dřív (`retireOrchards`, `orchard-gone`). Scéna: velikost stromů a jablka po čtvercích,
  obnovovaný čtverec nese `renewal` a vytyčuje se jen on (`stakedSquares` v `orchard-layout.ts`).

- **Stavba v lese** (population.md – Stavba v lese; Martin 19. 10. 2026: „Oprav – obydlí může jít
  postavit i v lese – les se prostě vyklučí.“ a „pokud jsem pole založil v lese, tak na něm nemohu
  postavit kovárnu“; podrobnosti návrh Clauda): `placement.ts` les krajiny ani les vsi nezakazuje
  žádné stavbě (`checkFootprintTerrain(…, clearForest)`, `LandUse.woods`, pozemek
  `plotGroundProblem`, ohrada, sad a hřbitov v `buildSquares` / `cemeteryPartsFromCells`, modla
  a svatyně `checkSacredTerrain`); výchoz, voda a prudký svah dál ano. **Cena = sazba lesa jako
  díl pole** (`forestClearingCost` – `foundingCostPerHa('forest', toolCoverage)` × plocha lesa):
  volně stojící stavba (obydlí, dílna, modla, svatyně) vyklučí vyklízenou plochu a v lese i pruh
  `FOREST_CROWN_MARGIN_M` (4 m) pod korunami (`freeForestClearing` – mnohoúhelníky
  `dwellingClearing(…, margin)`, `milirClearing(…, margin)`, `freeDwellingClearings(…, margin)`,
  v pruhu jen les – `ClearingOptions.only`); plocha lesa `forestAreaUnder` (políčko lesa bez staveb
  přesně, se čtverci staveb a lesa vsi body po 0,5 m – `forestLandAt`: políčko lesa krajiny nebo
  čtverec lesa vsi mimo půdu polí, sadů, hřbitovů, ohrad a hájů); druhy v sazbě
  (`SURFACE_INCLUDED_OBSTACLES.forest`) se po kusech neplatí – `RatedLand` v `polygonObstacles` /
  `polygonsObstacles` (`ClearingOptions.rated`), kameny a balvany ano. Čtverce (pozemek, ohrada,
  sad, hřbitov) v lese jako díl pole: `squareInForest`, `squareObstacleCost` za plochu čtverce bez
  půdy pole a sadu (`squareFreeArea`). Na poli v lese (i natočeném) stavba za les neplatí – půda
  patří poli (`owned`). Obyvatelé les nevyklučí (`clearForest: false` – `relocationPlot`
  přes `takeLand: false`, `existingPlotSquare`, `freeVillageSite`). Dospělé stromy dají klády
  jako dřív (`clearedTrees`), les vsi bez stromů zmizí. Scéna: paseka podle tvaru
  (`cleared-forest.ts` – `areas`), podrost a zarůstání pod stavbou neroste (`wildPlants`
  s `buildingClearings`), `/dev/landscape` odstraní překážky postavené stavby jako hra.

- **Varianty rozměrů** (population.md – Varianty rozměrů; Martin, GitHub #1: plocha, poměr stěn
  a výška „jiný max o 10%“, i dílny): `dwelling-shape.ts` (deterministická vrstva) – varianta je
  čistá funkce polohy na cm (`dwellingShapeAt`, `dwellingShape(d)` – dvorec a `plainShape` bez
  varianty, dům v rohu pozemku nejvýš `DWELLING_SHAPE.plotCornerMaxWidth` širší), zobrazení
  souřadnic modelu `shapeFrame` / `shapeX` / `shapeY` / `shapeZ` / `shapeRect`: pás dveří
  `doorHalfM` zůstává, šíje od `frontM` (= `PIT_SHAPES.halfZ`) se jen posune, pod terénem beze
  změny; bez varianty přesně identita. Půdorys (`dwellingFootprint(type, position, shape)`,
  `workshopFootprints`, `shapedFootprint`), vyklízená plocha (`dwellingClearing(…, shape)`),
  kontroly umístění a obdélníky domů pro pěšiny jdou podle něj. Starší vsi `withDwellingShapes`
  (příznak `shapesChecked`; srážka s jinou stavbou → `plainShape` na obydlí, stavbě i zbytku
  jámy; nově zabrané překážky zmizí – `dwellingShapeFits`). Scéna: model domu, díly staveniště
  a rozpadu mají kosti 12 oblastí (`shape-bones.ts`) a VAT se snímkem na variantu
  (`shaped-model.ts` – `makeShapeable` při načtení, `ModelInstance.shape`, `setShapeFrames`
  v `setInstances`; duch u kurzoru `shapeGhost` do vrcholů); jáma `pitShapeOf` / `shapedPit`,
  `sceneFrame(d)` a `shapedToWorld` pro hlínu, trsy, dým (`smokeVent`), rekvizity, místa
  řemeslníků, `footprintRect` / `clearanceRect` pro výběr, minimapu, slepice a postavy (`houseBox`
  / `siteBox(type, frame)` – vchod `trafficDoor` i průvody pohřbu a svatby z jejich `maxZ`). Ukázka
  `/dev/buildings` **Varianty** (`showcaseVariants`).

- **Obydlí na poli a v sadu** (population.md – Obydlí na poli a v sadu; Martin 18. 10. 2026:
  „Pole a sad se prostě zmenší o plochu domu“): `checkDwellingPlacement`, `checkPlotPlacement`
  a `checkWorkshopPlacement` pole a sad nezakazují (`checkFootprintFree(…, DWELLING_LAND)`,
  hřbitov dál ano) a vrací `takenLand` (`TakenLand` – políčko, zabraná plocha, plocha políčka): pozemek
  celé políčko, obydlí bez pozemku průnik vyklízené plochy (`freeDwellingClearings`, `coveredArea`
  v `polygon.ts`) s každým čtvercem; u kurzoru `check.warning` „Pole se zmenší“ / „Pole zanikne“
  (u sadu „Sad …“). Překážky na čtvercích polí a sadů obydlí neplatí (patří jim). Use-case předá
  `takenLand` do `startNewDwelling` / `startWorkshop` (`site.takenLand`) a ty po plánu dřeva
  zavolají `giveWayToBuilding` (`land-taken.ts`): díl / čtverec se zmenší, pod
  `TAKEN_LAND_MIN_SHARE` (20 %) políčka zmizí (`landLeftM2`); plán osevu i orba rádlem
  (`CropWork.plough` – váhy oraných a kopaných dílů) ubere jeho podíl práce podle `taskSpans`
  (ostatním dílům zůstane hotová práce, sklizená plodina beze změny), seč sena (`hay.mowing`)
  podíl práce podle `mowingSpans` a seno podle plochy, založení
  pole a výsadba úměrně, `orchardWork` úměrně (sklizený podíl zůstane); zmizelý zakládaný díl či
  nevysazený čtverec předá překážky a klády; pole / sad bez čtverců zanikne i se stavbou; kronika
  `land-taken`. Scéna: `building-clearings.ts` – pod vyklízenou plochou obydlí `FieldRenderer`
  nekreslí obtisk ani trsy (`clearingMask` násobí krytí) a `orchardTreeSpots` vynechá jabloně.

- **Pole jako krajina** (fields.md – Pole jako krajina; Martin 18. 10. 2026: „Pole by se mělo
  chovat jako normální krajina. Takže by na něm mělo jít postavit cokoliv kromě jiného pole.“):
  pole ustoupí každé stavbě kromě pole – `giveWayToBuilding(state, day, takenLand, by)`
  (`LandTaker`; sad ustupuje jen obydlí, kronika `land-taken` s `by`). Sad a hřbitov
  (`buildSquares` / `cemeteryPartsFromCells` – příznak `field` neblokuje, čtverec na poli
  `onField`), ohrada (`checkPenPlacement`) a modla se svatyní (`checkSacredBuildingPlacement`,
  `checkFootprintFree(…, FIELD_LAND)`) vrací `takenLand` (čtverce celé, modla průnik půdorysu)
  a varování; překážky vrstvy na čtvercích polí patří poli (`cellObstacles(…, { layerOwned })`,
  `skipTiles` v `polygonObstacles` přeskakuje jen vrstvu – stromy u cest a jabloně se platí
  vždy). Akce `foundOrchard`, `foundCemetery` (`takenLand` ve vstupu), `foundPen`
  (`PenInput.takenLand`, ústup až ve `foundPen` – oxen.ts nesmí importovat land-taken, cyklus
  přes `costs.ts`), `startSacredBuilding` (`site.takenLand`). Jabloně a stromy u cest smí na pole
  (`plantingBlocker` díly polí nezná): `treeTakenLand` – TAKEN_LAND_TREE_M2 (20 m²) za strom na
  čtverci pole; jabloně při `startRoadApples`, strom u cesty při uchycení (`rootTrees`, jen
  nové cesty mají místa i na polích – místa se určují jednou). `RoadApplesOption.warning`
  (`landTakenWarning`) – v popisku „Vysadit jabloně“ oranžově. Scéna: `fieldClearings` (obydlí,
  modly, svatyně a kruh 20 m² pod stromy na poli) maskuje pole, `build-items` dá čtverce polí
  pod sadem, hřbitovem a ohradou do `warningCells`.

- **Natočené stavby** ([fields.md](../design/fields.md) – Natočené stavby; Martin 18. 10. 2026:
  „Je to 3D, takže všechny stavby by měly jít natáčet po 15 stupních“): `square-grid.ts`
  (deterministická vrstva – přesné cos/sin násobků 15° z odmocnin, `rotationTurn`,
  `rotationCosSin`, `squareCenter` / `squareCorners` / `gridCellAt` v mřížce, `normalizeGrid`,
  `rotatedSquareCorners`, `squareKey`, `sameGrid`) – pole a sad mají volitelnou mřížku
  `Field.grid` / `Orchard.grid` (`SquareGrid` – střed čtverce 0, 0 a natočení 15–75°, čtverce
  dílů v ní), pozemek `DwellingPlot.square`, les vsi z natočeného pole `VillageWood.grid` (id
  stromů `woodIdCell` – buňka 7,5 m pod středem), zabraný kus `TakenLand.grid`. Bez mřížky =
  mřížka krajiny, všechno bit po bitu jako dřív. `squares.ts`: čtverce staveb ve světě
  (`villageLandSquares`, `fieldGrids`, `fieldGridOf`) a rejstřík `PolygonIndex` po políčkách (dva
  čtverce v mřížce krajiny podle rovnosti políček, jinak `polygonsOverlap`; `containing` pro
  paty překážek), `tilesUnder`. Kontroly v `placement.ts` (tvary `Shape` – `plotShapes`
  v `plot-cells.ts`): krajina pod natočeným čtvercem 5 × 5 body (`sampledGround` – voda
  kterýkoli bod, les většina, úrodnost průměr), překážky s patou v mnohoúhelníku
  (`squareObstacles`, vlastník překážek test bodu – `OwnedLand`), zabraná půda průnikem
  (`takenSquareLand`, `takenLandUnder`), navazování jen ve stejné mřížce (`fieldsTouching`
  s mřížkou, `withMergedFields` po mřížkách), les vsi jen přesným čtvercem (`woodEdge`).
  `fieldPartsFromCells` / `orchardPartsFromCells` a use-casy `placeField` / `placeOrchard` berou
  `grid`, akce `foundField` / `foundOrchard` mřížku uloží. Hospodaření, síť pěšin (`PathSquare.rotation`,
  `squareCells` v mřížce), louky na seno, stromy u cest, zbytky jam a vzdálenosti vsí znají
  mřížku. **Hřbitov** (Martin 19. 10. 2026) má mřížku `Cemetery.grid` jako pole
  (`cemeteryPartsFromCells(…, grid)`, `touchingCemeteries` jen ve stejné mřížce, vzdálenost od
  obydlí v osách čtverce – `distanceToSquare(…, rotation)`, od vody `squareWaterDistanceM`
  – nejkratší vzdálenost natočeného čtverce od políčka vody), **ohrada** je čtverec natočené
  mřížky `Pen.grid` (`checkPenPlacement(…, grid)`, střed z mřížky – volný střed jako pozemek
  zatím ne, rozhodnutí Clauda), use-casy `placeCemetery` / `placePen` a server actions berou
  `grid`. Scéna: čtverce nesou `rotation`
  (`SceneFieldPart`, čtverce sadu a hřbitova, `ScenePen`, `SceneWood`, `ScenePlot`), plot
  a hroby hřbitova v rovném prostoru jeho mřížky (`cemetery-layout.ts`), ohrada celá v osách
  čtverce (`penLayout` – `turnedLayout`, `penToFlat`, `PenLayout.rotation`), `field-cells.ts` počítá v „rovném
  prostoru“ mřížky (`gridFrame` – `toSpace` / `toWorld`, `inFrame`, `squaresContain`,
  `structureGridAt`, `squareContains`), pole se kreslí v rovném prostoru a otočí do světa
  (`field-space.ts`), jabloně v řadách os sadu, výběr, minimapa, stáda, postavy, vymýcený les
  a plochy pod polem (`fieldClearings`) natočené čtverce znají. `/dev/landscape` tlačítko
  **Natočené stavby** (pozemek 15°, pole 30°, sad 45°, hřbitov 60° s hroby, ohrada 15°; hřbitov
  jde malovat natočeně).

- **Stavby po čtvercích** (pole, hřbitov; políčka krajiny 15 × 15 m, díl = políčko – pole, sad,
  hřbitov i ohrada i v natočené mřížce, viz Natočené stavby):
  `fieldPartsFromCells` a `cemeteryPartsFromCells` v `placement.ts` (společné kontroly čtverců;
  u hřbitova navíc `check.warning` a `warningCells`, které neblokují – oranžově). Pole smí na
  louku, do křovin i do lesa – povrch dílu `fieldSquareSurface` (les z krajiny, křoviny = louka
  s keři za aspoň rozdíl sazeb); sad a hřbitov na louku i do lesa (sazba lesa – Stavba v lese). Obrys výběru při malování
  prosvítá přes stromy. Server
  actions dostávají `cells` / `fieldCells` (`{ x, y }[]`). Malování ve scéně
  `lib/scene/field-painting.ts` (`FieldPainter`, režim `squares`, logika výběru ve
  `field-cells.ts`) – ovládání v tabulce výše. Obrys pole (`Field.outline`) zůstal jen u starých
  vsí.

- **Zrušení rozestavěné stavby** (population.md – Zrušení rozestavěné stavby; Martin 23. 10.
  2026): jádro – `cancel-construction.ts`: `cancelBlock(c)` (důvod, proč nejde; null = jde),
  `isCancellable`, `cancelConstruction(state, day, constructionId)` (vrací nový stav; RangeError,
  když stavba není nebo nejde). Zrušitelné: `dwelling` (i dílna a stěhování; ne první zemnice
  zakladatelů s `dwellingId`), `field`, `cemetery`, `orchard` (ne obnova – `renewal`), `idol`,
  `shrine`, `pen`, `threshing-floor`, `road` (rozdělaná úprava cesty i vozová cesta, ne zemská
  stezka s `trail` – hotové úseky zůstanou: `dropRoadUpgrade` dá stupeň úsekům, na které podle
  `roadUpgradeProgress` práce došla; `dropWagonRoad` zkrátí zemní práce na hotové úseky, bez nich je
  smaže; panel cesty: `VillageRoad.cancelId`); ostatní druhy (`rebuild`, `repair`, `ard`,
  `road-apples`) ne. `dropSite` odstraní vytýčení: nehotové díly pole (`state: 'founding'`),
  nevysázené čtverce sadu (prázdný sad zmizí), čtverce rozšíření hřbitova či ohrady podle
  `constructionId` (základ nehotového hřbitova či ohrady, `builtDay` null, zmizí celý i
  s navazujícími rozšířeními, `dropLinked`; hotový hřbitov či ohrada se nikdy nemaže), rozestavěné humno. Dřevo: `returnConstructionWood`
  (`relocation.ts`) vrací `fromPile + felled − floor(trees × done / cost)` klád. Kronika:
  `construction-cancelled` (stěhování dál `relocation-cancelled`). Use-case:
  `application/cancel-construction.ts`.
