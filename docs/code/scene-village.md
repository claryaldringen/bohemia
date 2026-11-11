# Scéna vsi – obydlí, zvířata, posvátná místa, dílny

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: population.md, happiness.md, crafts.md, diet.md v `docs/design/`.

- **Domácí zvířata** (skutečná stáda – diet.md, od 18. 10. 2026): počty ovcí, koz, prasat
  a krav bere scéna ze `SceneVillage.livestock` (`herdCounts`; krávy v zimě v ohradě nejsou
  na pastvě, stádo ovcí a koz nejvýš 20 kusů); bez nich se odvodí z domácností jako dřív:
  slepice u hotových obydlí (zemnice 2, polozemnice 3 – `chickensFor`), na obývané obydlí
  3 ovce, koza a 2 prasata, kráva na dvě domácnosti; ohrady jsou pro stáda překážka; u stád jsou pasáčci z postav
  (Postavy níž – `herdViews`).
  `livestock-placement.ts` je odvodí z dat vsi pro scénu (`SceneVillage`, i nepovinné
  `cemeteries`) a krajiny: slepice obcházejí dům mimo obdélník domu se šíjí (`chickenBox`),
  ovce s kozami (stádo na 5 domácností) a krávy se pasou **přednostně na úhoru vsi, kam je jádro
  posílá** (`SceneFieldPart.grazed`; louka na seno jen po seči na otavě, srpen až listopad:
  `grazeablePart`, `grazingDay` z rozdělení práce; strniště po sklizni ano), jinak na louce do
  300 m (ne osetý díl, louka letošní seče před sečí – `hayMeadows`, `grazedMeadow` –, sad,
  záhony pozemků, hřbitov, obydlí, voda, skála, prudký svah). **Vždy s pasákem** (Martin:
  „Stáda domácího zvířectva se nesmí potulovat sama. Vždycky s nimi musí být nějaký
  člověk. Ten je bude primárně vodit na louky, určené ke spásání. Domácí zvířata by neměla spásat
  jídlo pro lidi ani ho pošlapat a na čerstvém úhoru toho k pastvě také asi moc není.“ – mění
  dřívější „mladý úhor vždy“): na pastvu jde jen tolik stád, kolik je dnes pasáků
  (`herderCount` – výrostci z `SceneLabor.herders`, ve starších datech i starší a dospělí po
  člověkodnech `herding`; bez údaje neomezeně), málo pasáků → pasák vede víc zvířat (`tendedHerds`); stádo bez pasáka
  (`Herd.tended` false) stojí u domů s trasou o jedné pastvině; v zimě ovce, kozy a krávy u domů,
  s pasákem jen prasata. Stáda s pasákem jsou v plánu napřed – pasák `k` patří ke stádu `k`
  (`herderKinds` dostane jen jejich počet). Prasata na okraji lesa (−7 až +5 m od hranice, hlouběji je
  zakryjí koruny) do 150 m (jinak do 260 m), nejbližší vhodný okraj první – za lesem po otočení
  kamery zmizí, to nevadí (Martin). Dotazy „bod na čtverci“ jdou přes přihrádky (`squareLookup`)
  a sousední pastviny trasy z přihrádek – u pole s tisíci díly by průchod všemi trval sekundy;
  rozmístění je stejné (zlatý otisk v `livestock-golden.test.ts`). **Pohyb běží ve skutečném čase, ne v herním** – ve
  zrychleném světě zvířata „běhala jak na koksu“ (Martin); scéna dosadí epoch ms
  (`livestockClock`), stejný okamžik = stejná póza. Stádo je na pastvině své trasy (sousední
  pastviny) 3–9 minut a pak se za pevnou dobu krokem přesune na další, tam a zpět
  (`livestock-motion.ts`); během přesunu má každé zvíře vlastní čas zastavený (`pausedS`),
  chůze se nesčítá. Po přepočtu vsi zůstane stádo na své pastvině, když ji nová trasa má
  (`keepRouteSpot`). Zvíře se desítky sekund pase / zobe / ryje nebo stojí a popojde pár metrů
  krokem (≈ 0,6–1 m/s) – čisté funkce času, deterministicky. `livestock.ts` (`VillageLivestock`, háček v
  `landscape-scene.ts`) je kreslí jako fauna: mesh `livestock-*` na druh, krok (parabola přes
  dvě pózy) a hlava dolů (třetí morph target) ve vertex shaderu, výška a náklon podle terénu.
  Textury z GLB (dobytek, ryby i ptáci – `loadGeometry` ve `fauna.ts`) se čtou v barvách
  obrazovky (glTF bez sRGB bufferů) a StandardMaterial je kreslí bez převodu jako 0 A.D. – se
  sRGB čtením by GPU barvy převedlo do lineárních a zvířata by ztmavla (WebGPU i WebGL 2).
  Modely v `fauna.json` (ovce, koza, kráva, prase, slepice) jsou ve
  skutečné velikosti, ve scéně stylizovaně větší (`SCALE`). Terén pro zvířata je rastr 4 m
  kolem vsi (`livestockGround`) – přepočet jen při změně obydlí, polí nebo hřbitovů.

- **Ves** (`village-renderer.ts`): obydlí stojí nad skutečnou jámou – terén a obtisky se v ní
  prořezávají (`pit-cut.ts`, discard ve fragment shaderu podle pole uniform, ne textury – terén
  už má 15 samplerů), stěny, dno a schody šíje kreslí `dwelling-pit.ts` (ornice, podloží a stín
  okraje ve vrcholech). Rozměry jam a šíje musí sedět s `tools/blender/dwellings.py`.
  Staveniště jde po fázích (`village-construction.ts`, ≥ 8 fází, průběh 0–1) z dílů
  `construction.glb` v instancích. U obydlí **není hráň polen** (Martin: tak vyskládané dřevo
  tehdy neměli, navíc na dešti) ani samostatný kus pleteného plotu vedle polozemnice (Martin).
  **Pozemek polozemnice** (Martin, 18. 10. 2026): celé políčko krajiny (15 × 15 m, v mřížce
  jako čtverec pole) obehnané polským plotem, dům uprostřed nebo v jednom ze 4 rohů (5 variant,
  vchod vždy k brance na přední straně −z, natočení π), ve zbytku záhony a cestička od branky
  ke dveřím. Jádro: `DwellingPlot` (`cell`, `variant`) na obydlí i stavbě (nepovinné – starší
  polozemnice dostanou pozemek při načtení vsi: `withPlots` v `plots.ts`, jednou – `plotsMigrated`,
  políčko pod středem domu, když je volné, varianta `nearestPlotVariant`, dům se posune jen do 2 m;
  na obsazeném políčku až přestavbou na nejbližším volném do 50 m – `relocationPlot` (bez polí
  a sadů – `takeLand: false`), proto `advanceVillage` dostává krajinu), `PLOT_TYPES`,
  `PLOT_VARIANTS`, `PLOT_HOUSE_OFFSET_M`, `plotHousePosition` a `checkPlotPlacement`
  v `placement.ts` (louka nebo les – les se vyklučí, viz Ves – Stavba v lese –, bez výchozu, bez posvátného dubu a čtverce háje, dům ne pod korunou
  dubu, nezabrané hřbitovem ani jiným obydlím či pozemkem – čtverec pole či sadu smí, viz Ves –
  Obydlí na poli a v sadu –, rovno jen pod domem, `spared` vždy prázdné; překážky celého
  políčka jako u čtverce pole, stromy dají klády); `dwellingPlot` zabírá celé políčko
  a `placeDwelling` u polozemnice pozemek vyžaduje (`NO_PLOT`). **Pletený plot** je jeden pro
  celou hru – polský plot pozemku i proutěný plot hřbitova (Martin): `woven-fence.ts` bez
  Babylonu (`wovenFence` podél čar s ohrazením vlevo – **všechny rohy zakulacené**, vnější
  poloměr 1,25 m, vnitřní roh tvaru L 0,5 m, kůly nejvýš po kroku i po oblouku, branka na rovném
  úseku nejblíž k cíli; `fenceStage` – kůly, pak větve zdola, střídavě vně a uvnitř kůlu), hustota
  je `FenceStyle` (`PLOT_FENCE` 7 větví, `CEMETERY_FENCE` 11 větví a širší branka). Kreslí ho
  jeden `WovenFenceRenderer` (`woven-fence-renderer.ts`, vlastníci `set` + `commit`) v instancích
  z `models/dwellings/woven-fence.glb` (kůl, kůl branky, kus větve 1 m natažený od kůlu ke kůlu –
  `woven_fence_parts` v `dwellings.py`, poloviční atlas). Pozemek: rozmístění bez Babylonu
  `homestead-layout.ts` (záhony, rostliny, cestička, `plotStage` podle stavby), kreslí
  `homestead.ts` v instancích z dílů `models/dwellings/homestead.glb` (záhon 1 × 0,8 m natažený
  na délku, zelí, řepa, cibule, kopr – `homestead_parts`, oblasti atlasu `veg` a `soil`); každý
  díl stojí na terénu sám. Fáze polozemnice po hřebeni: `fence` (kůly, pak větve zdola)
  a `beds` (`ConstructionState.plot`). Umisťování: režim `plot` (políčko pod kurzorem, [ a ]
  otáčejí celým pozemkem, Tab přepíná variantu), vytyčení při 0 % kolíky a provázkem kolem pozemku
  (`plotStakingLine`), výběr i kliknutí kamkoli na pozemek označí celé políčko, rekvizity
  staveniště rohového domu se zrcadlí dovnitř (`sitePropPlace`), slepice zůstávají uvnitř
  plotu, cizí ani lidé do pozemku nechodí, hromada klád leží za plotem. **Natočený pozemek**
  (Martin 18. 10. 2026, varianta a – viz Ves – Natočené stavby): `DwellingPlot.square` (střed
  na cm, natočení po 15°; `cell` = políčko pod středem), [ a ] otáčejí celým pozemkem, **Tab**
  (Shift + Tab zpět) přepíná variantu; bez natočení a po 90° se přichytí na políčko pod kurzorem
  (`rotatedPlot` / `canonicalPlot` – ukládaná podoba stejně v prohlížeči i na serveru).
  `homesteadLayout` natočený pozemek rozmístí v jeho osách a otočí do světa (`HomesteadLayout.rotation`
  – záhony v instancích natočené), `insidePlot`, `plotStakingLine`, `plotFenceCorners` v osách
  pozemku, `ScenePlot.rotation`. Dílny z polozemnice
  (hrnčíř, kovář) pozemek nemají – stojí volně jako dřív. **Hřbitov** (`cemetery-renderer.ts`,
  geometrie bez Babylonu v `cemetery-layout.ts`): nízký pletený plot po obrysu čtverců **odsazený
  1,5 m dovnitř** (`CEMETERY_FENCE_INSET_M`; `outlinePaths(…, inset)` + `insetPoints`, rozšíření ve
  stavbě zasahuje zpět na přímý úsek starého plotu; sdílený pletený plot, zakulacené rohy; vytyčení
  `stakingSegments` stejným obrysem; hroby mají okraj 2 m a `GRAVE_SCALE` zmenší mohyly; obrys se
  neukládá, odvozuje se z čtverců, starší vsi netřeba převádět) s brankou k nejbližšímu hotovému obydlí (při rozšíření jinam
  zůstane; místo branky = vchod z jádra `cemeteryEntrance`, paths.md – Vchody), uvnitř mohyly
  podle významu (`SceneVillage.cemeteries[].mounds` – místo, velikost, `fresh` první rok –
  `FRESH_MOUND_DAYS`; `moundPlacements` se středem z jádra `gravePlaceCenter`, tvary
  `MOUND_SHAPES`: malá dítěte, běžná, podlouhlá hlavy rodiny po řadách, největší vojvody
  a jeho ženy s dřevěným kůlem; sítě po vzhledu a velikosti; kostrový hrob křesťana
  – `rite: 'inhumation'`, christianity.md – Pohřby – je plochý hrob `FLAT_GRAVE` v ose čtverce s malým
  dřevěným křížem v čele `graveCross`, síť `flat` a kříže v instancích; pohřeb bez hranice –
  `funeralTimeline(…, rite)`: máry položí k hrobu a spustí do země, `FUNERAL_TIMING.graveS` u hrobu,
  `pyreState` nic nezapálí) a staré hroby (`graves` – pohřbení před
  mohylami, mřížka 7 × 8 po řadách jako dřív, `gravePlacements`, čerstvé jen bez mohyl);
  založení vytyčení (kolíky a provázek po ostrém obrysu) → kůly → pletení; rozšíření ve stavbě
  má vlastní kus plotu bez branky jen tam, kde plot ještě není (na starý jen navazuje), po
  dokončení plot obepne celý hřbitov.
  **Sad** (`orchard-renderer.ts`, bez Babylonu `orchard-layout.ts`): jabloně z 0 A.D.
  (`models/trees/apple-1…4.glb`, s plody `apple-fruit-1…4.glb` – převod
  `tools/blender/orchard.json`, textura bez plodů `apple_leaves.py`, zralá `apple_ripe.py`)
  v pravidelných řadách (mřížka 7,5 m, 4 na čtverec, řady přes celý sad – Martin); výsadba čáry
  vytyčení po obrysu a podél řad → kůly → sazenice po řadách, mladé stromky u kůlu
  rostou 12 let, na skalním výchozu z vrstvy překážek strom chybí. Velikost (`growth`) a jablka
  (`fruit`, srpen až sklizeň) počítá server (`lib/orchard-look.ts`) v `SceneVillage.orchards` –
  háček pro podzim; květ, podzimní listí a holé koruny dodají roční období (`applySeasonModel`
  podle jména `apple*`, meshe `orchard-*` jsou v zimě mezi holými vrhači stínu). Modely se
  načtou až s prvním sadem. **Nálet opuštěného sadu** (`SceneVillage.wildTrees` z
  `village-view-wild.ts`: místo z jádra, jabloň/jiná dřevina, stáří v letech) kreslí `wild-growth.ts`
  (`wildTreePlants`): jabloně modely `apple-1…4` ve velikosti `treeGrowth(věk)`, jiné dřeviny
  bříza/topol/dub/buk; rozmístění je nepravidelné, mimo řady.
  Dým z dýmníku (`village-smoke.ts`, sprity) podle rozvrhu ohně za herní den (`smoke-schedule.ts`, deterministicky) – hýbe se jen v záběru, ve stejném
  taktu `WATER_FPS` jako voda, při omezeném pohybu stojí.

- **Posvátná místa** (happiness.md, `SceneVillage.sacred`; modely `tools/blender/sacred.py`,
  licence v `public/models/sacred/LICENSES.md`): `sacred-renderer.ts` (`SacredRenderer`
  ve `VillageRenderer`, inkrementálně) kreslí obětiny u kmene ušetřeného posvátného dubu
  (`models/sacred/oak-offerings.glb`, počátek v ose kmene; živý dub se nikdy neskrývá – není
  v `obstacles.removed`; dub i obětiny se postupně zvětší – `SceneSacred.oaks[].growth`
  z `lib/sacred-look.ts`, jen vzhled, po herních letech, strom zvětší `InstanceHider` přes
  `scales`; uschlý dub `SceneSacredOak.snag` – strom skryje `applyVillage` podle id a místo něj
  stojí souš `models/decor/snag-oak.glb` s obětinami, padlá souš `SceneSacred.fallenOaks` –
  padlý kmen `fallen-1.glb` bez obětin, rozměry `sacredSnagInstance` / `fallenOakInstance`
  v `sacred-layout.ts`), hraniční kameny a oltář na okraji čtverců háje (`grove-stones.glb`,
  uzly `stone-a`, `stone-b`, `altar`), hotovou modlu a svatyni (`idol.glb`, `shrine.glb`, počátek
  uprostřed půdorysu, předek +Z) a staveniště z dílů `idol-construction.glb` /
  `shrine-construction.glb` (uzly `modla-…` / `svatyne-…`). Fáze a díly staveniště jsou jen
  v `village-construction.ts` (druhy `modla`, `svatyne` – `constructionState`; kružnice
  vytyčení a ušlapaná tráva podle `ROUND_SITE_M`, u svatyně jen uvnitř příkopu do 9,8 m).
  **Vytyčení kolíky a provázkem je vidět hned od průběhu 0** (Martin: „Když někde zadám stavbu,
  ať se hned vytyčí provázkem a kolíky“). Sítě modly a svatyně se kladou na terén po vrcholech
  (terén + 3 cm) – příkop svatyně tak na svahu nezapadne a terén se neprořezává. Dým stoupá
  z prázdných uzlů `fire-1…8` hotové svatyně (`loadMergedModelWithNodes`) jako z obydlí
  (`VillageSmoke`). **GLB s víc meshi načítat po dílech** (`loadModelParts`) – `loadMergedModel`
  spojením pokazí ořez stěn; oba načítače nastavují i `mesh.sideOrientation` (loader glTF
  materiálu dílů stranu po načtení vrátí na výchozí a jednostranné plochy by zmizely).
  Nenačtený GLB nahradí tvary z `sacred-fallback.ts` (jedno varování na soubor). Duch při
  umisťování (`PlacementMode` `sacred`), výběr (`village-picking.ts`: obydlí → modla/svatyně →
  posvátný dub → čtverce), zvýraznění, značky na minimapě (`sacredMinimapMarks`), stavitelé
  u staveniště (`villager-plan.ts`) a jabloně sadu se vyhnou koruně posvátného dubu. Vývojový
  náhled má tlačítka Modla, Svatyně, Ukázka svatyní a „Mýtit les s posvátným dubem / hájem“;
  náhled staveb (/dev/buildings) kreslí modlu a svatyni po fázích svým potrubím.
  **Rozpad opuštěné modly a svatyně** (abandonment.md, `structure-decay.ts` – čisté funkce,
  testy): stupeň `structureDecayStage` jako u obydlí (≥ 70 / 45 / 20 %), díly `sacredDecayParts`
  – celá navštěvovaná = hotový model, opuštěné svatyni vyhasnou ohniště hned (díly staveniště
  a `shrine-fires-cold`, bez dýmu), sešlá zšedlá modla s mechem bez obětin, nakloněná a rozpadlá
  se kloní (`sacredLean` – ≈ 12° a 28°, směr podle id; `leanPoint` posune vrcholy před položením
  na terén) a zarůstá; zbytek `sacredRuinParts` (padlá modla u pahýlu zapadá do trávy, příkop
  svatyně se srovná – `heightScale`). Díly `models/sacred/sacred-decay.glb` z `sacred.py` (čtvrtý
  argument `decay`; načtou se až s první chátrající stavbou, do té doby nejbližší díly
  staveniště – `DECAY_SUBSTITUTES`); zarostlá plocha a příkop svatyně dostanou ve scéně trávu
  terénu po světových souřadnicích (`overgrow`). Plot opuštěného hřbitova a ohrady `decayFence`
  podle `fenceDecayAmount` (po dvacetinách), mohylky zarůstají a slehnou se s ním; spadlý plot
  hřbitova (stav 0 – `cemeteryFenceGone`) zmizí úplně, zůstanou
  jen mohyly (Martin, 19. 10. 2026). Náhled:
  /dev/buildings tlačítko **Rozpad staveb** (modla, svatyně, hřbitov, ohrada – stejný posuvník
  ▶ Rozpad jako obydlí, `showcaseAbandoned`), přepínač **Oprava staveb** (posuvník = průběh
  opravy – `showcaseRepair`). Opravovaná svatyně (`SceneSacred.buildings[].repairing`) má ohniště
  studená až do konce opravy (`sacredDecayParts(…, cold)`, bez dýmu).

- **Cvičiště na dvorku dvorce** (lord.md – Terče a cvičiště na dvorku; Martin 22. 10. 2026: „Na
  dvorku vojvodova dvorce tak musí být terče na lukostřelbu.“; podoba návrh Clauda): jen scéna –
  není stavba ani překážka, nemá stav, síť pěšin ani vrstvu překážek nemění.
  `training-ground-layout.ts` (čisté funkce, testy): `trainingGroundOf` – dvorec s dvorem má
  cvičiště vždy (`manorTrainingGround`): střelnice `RANGE_M` = 20 m podél delší osy pruhem vedle
  domu (≈ 0,35 strany políčka od osy), 2 terče 1,8 m před koncem dvora (bez zástěny – Martin 24. 10. 2026: „To cvičiště by takhle nemělo předsahovat plot. Stačí, když odebereš tu zástěnu za terči“);
  brána je uprostřed konce dvora, pruh ji míjí. Na druhé straně dvorku cvičný kůl u plotu, stojan
  se zbraněmi, dvě místa pro dvojice a u brány kůl na koně. Záhony dvorce pruh střelnice vynechají
  (`rangeStrip` v `homestead-layout.ts`). Bez dvorce (`hutTrainingGround` – jen když rodina dnes
  cvičí, `labor.lord.home`): 1 terč ≈ 10 m od obydlí na straně odvrácené od ostatních obydlí
  (osamělé obydlí – před vchodem) a kůl stranou. Modely `training.glb` (`tools/blender/training_ground.py`,
  vlastní CC0, paleta 8 × 1 px, jeden materiál) – `training-ground.ts` v nehybných instancích
  (měřítko jako postavy – `FIGURE_SCALE`), instance jen při změně cvičiště.

- **Řemeslné dílny** (ve hře od 18. 10. 2026, pravidla v [docs/design/crafts.md](../design/crafts.md),
  jádro a rozhraní viz Ves – Řemesla): `public/models/crafts/`
  hrnčíř, kovář a tesař (polozemnice s přístřeškem o `PORCH` 3,6 m vpředu, pod ním pec / výheň
  s kovadlinou, u tesaře kozlíky s otesávaným trámem, špalek se sekerou, kola a zásoba trámů –
  wagons.md), uhlíř (zemnice s mechovou střechou a koši uhlí – bez hráně polen a lopaty u domu)
  a samostatný milíř (`milir.glb` – ve hře samostatná stavba u skácených buků, crafts.md – Milíř
  u skácených buků; `MILIR_OFFSET` v `crafts.py` = `MILIR.offset` jen pro ukázky a převod starých
  vsí). Tvary bere `crafts.py` z `dwellings.py` (ten má proto
  `if __name__ == "__main__"`), sedí do jam obydlí (hrnčíř, kovář, tesař = polozemnice, uhlíř =
  zemnice).
  Atlas: `tools/blender/craft_atlas.py` (atlas obydlí + pec, kámen, zem milíře, uhlí…; varianta
  `atlas-moss.jpg` s mechem místo slámy). Postup v hlavičce `crafts.py`, ikony
  `icons.py hrncir,kovar,tesar,uhlir,milir`.
  **Fáze stavby** řemesel: `village-construction.ts` má tabulku fází pro každý druh
  (`ConstructionKind` = obydlí + `CraftKind`; dílny na fázích svého obydlí + přístřešek, pec /
  výheň / tesařské pracoviště `carpentry`, dílna, uhlíř mech místo došků, milíř zvlášť), díly
  v `public/models/crafts/construction.glb` a `construction-moss.glb` (předpona druhu). Obydlí se
  tím nezměnila. **Tesař** (`tesar`, díly `tesar-trestles` / `-beam` / `-block` / `-beams` /
  `-wheels` / `-chips`) je ve scéně hotový – model, staveniště, místa řemeslníků (`modelSpots`),
  bez dýmu (`modelVents`), ušlapaná tráva i pod přístřeškem (`hasPorch`, `PORCH_WORKSHOPS`);
  řemeslo `carpenter` (Ves – Tesař a vozy) má `CRAFT_MODEL.carpenter = 'tesar'`.
  Dílny bez hráně polen: hrnčíř a kovář mají místo dílu `wood` díl `yard` (koše), uhlíř jen koše
  uhlí (fáze `workshop` – díl `coal`).
  **Náhled všech staveb** bez databáze: http://localhost:3010/dev/buildings (`building-showcase.ts`,
  staveniště `showcase-sites.ts`, posuvník a přehrání stavby; v produkci 404). Za řadou staveb
  pole, hřbitov a sad po čtvercích – kreslí je herní `VillageRenderer` (bez obydlí) podle
  `showcaseGrounds` v `building-showcase-layout.ts`: pole zakládání → brázdy → osev, pak jen
  jako náhled zelené a zralé obilí a strniště (`FieldLook` / `crop` dílu v `SceneVillage`, server
  ho zatím neposílá), hřbitov vytyčení → kůly → plot → přibývající mohyly podle významu
  (`showcaseMounds` – místo vybírá jádro), sad vytyčení → kůly
  → sazenice → rostoucí stromky → jablka. Vpravo vzadu dílna tesaře a pahorek s vozy (**Vozy**,
  **Další vůz zblízka**, **Sledovat vůz** – Vozy se spřežením níž).
- **Spřežení na poli** (oxen.md – Spřežení zůstane na poli, 24. 10. 2026): orba za herní den
  (`PLOUGH_DAY_DEBUG`) jede po pruzích dne celý den bez ranní cesty a večerního návratu; cesty
  dne jsou v `SceneVillage.ploughLegs` (`out` – výjezd / přesun, `home` – návrat, spočítá je
  prohlížeč z cílů `outGoals` / `homeGoals` – `withCartRoutes`, web-ui.md; `stand` – den bez orby,
  stojí na čele) a `ploughRoute` je přidá jen ve dny, kdy k nim
  došlo (podrobně village-livestock.md – Orba za herní den).

- **Seno mimo stavby a cesty** (issue #3, Martin 22. 10. 2026: „nesmí tyto snopy být na cestě, na
  budovách (včetně zahrádek), v ohradách (sežrala by je zvířata), ani na humně“):
  `FieldRenderer.updateFields` po složení kupek a stohů (`hayOf`) vyřadí ty, které leží na pásu
  cesty či pěšiny (`TrackMask.at < 0,5`) nebo do `HAY_CLEAR_M` (1,2 m) od plochy z `hayBlockers`
  (`building-clearings.ts`): obydlí a dílny (půdorys i pozemek s dvorkem), ruiny, celé čtverce
  ohrad (plot je odsazený dovnitř), hřbitovů a sadů, humna, obilné jámy, milíře, rudiště, jámy
  po rudě, posvátná místa. Rozmístění v `hayOnSquares` zůstává deterministické, vyřazuje se až
  po něm; klíč sena (`hayKey`) nese i podpis ploch a cest, takže nová stavba seno přestaví.
- **Dno obilné jámy** (issue #3): hrdlo `grain-pit-layout.ts` je vždy zakryté – zrno (hladina
  stoupá s plností o `GRAIN_RISE_M`), u prázdné jámy hliněné dno `FLOOR`; materiál má `zOffset`,
  aby louka neprosvítala. Bez nové textury, jen barvy vrcholů.

## Humno ve scéně (production-chains.md – Humno, Obilné jámy; úloha 5 výrobních řetězů)

Humno je jen mlat bez přístřešku (Martin 21. 10. 2026), mlátí se **holemi** – cepy se tehdy
nepoužívaly (Martin 21. 10. 2026: „ať do něj mlátí holemi“). Místa jsou v osách humna
(`threshing-floor-layout.ts` – `floorPoint`, x napříč 8 m, z podél 10 m, vstup před předkem +z jako
`threshingFloorEntrance`), stejná pro scénu i postavy.

- **Data** (`sceneThreshingFloors` ve `village-view-scene.ts`): `SceneThreshingFloor.straw` (stoh
  0–1 – `threshingFloorStraw` ve `village-view-buildings.ts`, návrh Clauda: roste v srpnu a září
  `STRAW_RISE_DAYS` od loňského zbytku `STRAW_LEFT` 0,3 do plného, přes zimu se zkrmí a podestele
  zpět na zbytek; humno postavené po výmlatu ho má až od příští žně; po dvacetinách),
  `threshing` (dnes podíl `thresh` s cílem humna) a `grainKg` (vymlácené zrno čekající na jámy –
  `grainPitWork.queueKg` rovným dílem na hotová humna, na desítky kg).
- **Kreslení** (`ThreshingFloorRenderer` v `threshing-floor-renderer.ts`, vedle obtisku mlatu ve
  `VillageRenderer`): staveniště po fázích `FLOOR_PHASES` (vytyčení 0–5 %, sejmutí drnu do 35 %,
  hlína do 60 %, kropení a dusání do 90 %, vymazání) – `floorSiteLook`: kolíky a provázek
  (`StakingPegs`, `createStringMesh` jako ohrada) do 35 %, krytí obtisku mlatu, hromada drnů
  (`TURF_HEAP`) a hlíny na mazanici (`CLAY_HEAP`), které přibývají a při dusání a mazání ubývají.
  Hotové humno: rozprostřené klasy (`SHEAF_BED`, nerovná vrstva 16–26 cm – `SHEAF_BED_HEIGHT_M`;
  obtisk mlatu leží o `LIFT.turf` výš se `THRESHING_FLOOR_Z_OFFSET`, nižší vrstva z něj koukala
  jen hrbolky) jen ve dny výmlatu,
  hromádka zrna (`GRAIN_HEAP`, `grainHeapScale` podle kg) – hromady a klasy jsou jedna síť
  s barvami vrcholů (`threshingFloorGeometry`, bez textury); stoh slámy (`STRAW_STACK` v zadním
  rohu) je kupka `models/fields/haystack.glb` (0 A.D., licence v `models/fields/LICENSES.md`)
  do zlata (`STRAW_TINT` násobí texturu silně, `STRAW_GLOW` je vlastní světlo, jinak ji okolní zeleň a opar táhnou do olivy), v instancích, nižší a užší, když ubývá. Přestaví se jen při změně, kterou je vidět
  (`threshingFloorsKey`). Dobytek a slepice mlat obcházejí jako ohradu (`threshingSquaresOf` v
  `livestock-placement.ts`, součást `obstacles` a `villageKey`).
- **Postavy** (`villager-plan-fields.ts`): klipy `thresh` (mlatcí hůl `procedural_stick` ≈ 1,2 m,
  animace `gather_mine` z 0 A.D. – úder oběma rukama shora) a `winnow` (dřevěná lopata
  `procedural_shovel`, animace `farming`) v `man.glb` i `woman.glb` (`tools/blender/people.json`,
  modely CC0, licence v `models/people/LICENSES.md`; bez nového vertex atributu – test ve
  `fauna.test.ts`). `threshingOnFloor`: páry mlatců naproti sobě přes klasy (`thresherSpot`, nejvýš
  `THRESHER_PAIRS` 4, jen v párech – lichý nosí slámu, jediný člověk mlátí sám), každý třetí
  prohazuje u hromádky zrna čelem proti větru (`WINNOW_FACING`, nejvýš 3), další nosí slámu
  z klasů na stoh (shuttle po humně), zbytek obrací klasy za mlatci. Ve hře to hlídá test nad
  simulací (`threshing-floors-view.test.ts` – humno, snopy, srpen → klasy a mlatci na humně).
  Nouzový výmlat (`threshing`): na volném místě u vsi dva páry mlatců a dva prohazovači; porážka
  má dřívější kruh s paličkou (`groundWork`). Stavba humna (`threshingFloorSite`, podíl `build`
  s cílem staveniště humna): paličkou u kolíků, motykou v řadách (drn), u hromady hlíny motykou
  a na mlatu roztírání, dusání holí přes mlat, mazání v podřepu.
- **Nošení**: pěší nosiči snopů (`carriers` – podíl `carry`) nesou snopy obilí a luštěnin z pole na
  nejbližší hotové humno (`sheafFloor` – vstup před mlatem, len domů); bez humna domů jako dřív.
  **Vůz se snopy jede k humnu** (villagers.md – Fáze činností; návrh Clauda): cíl svozu snopů
  s hotovým humnem nese `CartGoal.via` (`sheafFloor` ve `village-view-crafts.ts`, dosah
  `FLOOR_CART_REACH_M` 9 m od středu mlatu); prohlížeč dopočítá `SceneCart.viaRoute` (pole →
  humno → ohrada vozovou sítí – `cartViaRoute` v `cart-routes.ts`, i ve Web Workeru), vůz jede
  prázdný k poli, nakládá, plný k humnu, skládá (`ShuttleRoute.dropM`) a prázdný k ohradě
  (úsek `return` – panel „vrací se k ohradě“, „veze snopy na humno“, „skládá snopy na humně“).
  Zrno z humna do jam (`grainPitWorkers` ve `villager-plan-crafts.ts`): první dva u hrdla
  s motykou, další nosí v koši od vstupu humna, kde zrno čeká (`grainKg`), k jámě po pěšinách.
- **Ukázky**: `/dev/buildings` – Humno mezi plochami (`showcaseThreshingFloor`: posuvník do
  poloviny stavba po fázích, pak výmlat s klasy a rostoucím stohem, na konci plný stoh; bez
  postav), `/dev/landscape` – tlačítko Humno (`dev-threshing.ts`: žně a nosiči snopů na humno →
  výmlat a prohazování → zrno do jam). Vývojová ves začíná bez domů a polí – bez obydlí nejsou
  postavy (`planVillagersWithCrew`), proto ukázka v prázdné vsi přinese šest domů na místě vsi
  a zralé pole vedle humna (`withThreshingDemo`; další krok počítá z vsi bez nich –
  `withoutThreshingDemo`) a lidi práce dne podle domů (víc práce než lidí by nechalo mlatce bez
  prohazovačů).

## Kovárna a hrnčíř ve scéně (production-chains.md – Kovář; crafts.md – Hlína hrnčíře; úloha 6 výrobních řetězů)

Dvůr dílny je jedna síť s barvami vrcholů bez textury (`craft-yard-layout.ts` – čisté funkce,
`CraftYardRenderer` v `craft-yard-renderer.ts`, volá ho `VillageRenderer`), přestaví se jen při
změně, kterou je vidět (`craftYardsKey`), a nevrhá stín (jako hromady humna). Místa jsou v osách
modelu dílny (x napříč, z k vchodu – jako `PORCH_SPOTS`), s variantou rozměrů domu se posunou
(`shapedToWorld`), a leží ve vyklízené ploše dílny (`DWELLING_CLEARING_M` – před vchodem do 7,5 m;
hlídá test). Klíč zná z práce dne jen tavbu (pec se mění jen při ní), žár pece sedí nad
`decalHeight` jako síť.

Hrnčíř u kruhu sedí na špalku (vlastní klip `wheel` – předklon, ruce na hrnci 0,45 m před patou,
pravá noha roztáčí kruh; místo `PORCH_SPOTS.hrncir[0]` 0,6 m od středu kruhu, pánev na přední
hraně špalku). Ženy u dojných zvířat (`milkers`) dojí na špalku (`milk`), starší u domů sedí
(`sit`) a chodí se modlit před hotovou modlu či svatyni (`pray` – klip 0 A.D. s rukama k nebi,
role fází `elder-home`). Špalek je prop postavy (`stump`), ne objekt scény – úloha 10 scény.

### Rekvizity fází činností (úloha 9 scény)

Rekvizity jsou **propy postav** v `man.glb` / `woman.glb` (`tools/blender/people.json`,
`people_from_0ad.py`), ne objekty scény: každá má vlastní kloub kostry a v klipu, kde není, má
měřítko 0 (kanály posunu a natočení skrytého propu skript vynechá). Postava tak zůstává jeden mesh
s jedním atlasem a materiálem – žádný další draw call ani vertex buffer (WebGPU: postava má právě
8); cena je ve vrcholech (≈ 7,9–8,1 tisíce na postavu místo ≈ 6) a ve VAT (klouby × snímky).
Klip = animace 0 A.D. + rekvizita (jiný název téže animace): `bind` (povříslo – snop na zemi),
`rake` (hrábě), `pitch` (vidle 0 A.D.), `forge` (kladivo a kleště 0 A.D.), `split` (úder
krumpáče se sekerou a štípací špalek 0,8 m před patou), `sieve` (síto), `pots` (nádoby na zemi),
`carry-tools` / `carry-pots` / `carry-fish` (nůše s nástroji, nádobami, rybami – rychlost chůze
jako `carry`), `snare` (oko – zatím nezapojeno: oka se ve scéně nekreslí, wildlife.md), `cook`
(vařečka a hrnec na ohništi – ženy u dveří `COOK_SHARE` za přadlenami, `villager-plan-folk.ts`).
Vlastní klipy mají rekvizitu přímo: `milk` džber, `spin` přeslici, `weave` stav (stojí před
tkající, jen když tká – zapojí úloha 12), `pipe` píšťalu, `drum` buben.
**Volné propy** (bod `seat` – snop, špalek, síto, nádoby, oko, hrnec, džber, přeslice, stav,
píšťala, buben) stojí v prostoru postavy (natáčí se s ní) i v klipu 0 A.D.; nástroje drží ruka
(`prop-weapon_R/L`), náklad sedí na nůši (`prop-back`). Test `villager-motion.test.ts` hlídá,
že klip v GLB svou rekvizitu ukazuje.

- **Pěšiny**: obdélník hotové kovárny a hrnčíře pro pěšiny zahrne dvůr (`WORKSHOP_YARD_PATH_BOX_M`
  v `network-grid.ts` – `dwellingBox`, test v `craft-yard-layout.test.ts`), brána leží před dvorem
  a od vchodu se k ní chodí osou mezi pecí a jámou; pěšina tak nevede přes pec ani jámu ani po
  zjednodušení čáry (dřív ji `SIMPLIFY_M` uřízl přes roh jámy). Kontrola umístění se ptá stejné
  brány (`GateOwner.craft`), `WALK_VERSION` `routes-v6`.

- **Data** (`SceneVillage.dwellings[].yard` – `SceneCraftYard`, village-crafts.md – Kovář):
  `task` (`smelt` tavba / `refine` překování / `forge` kování nástrojů), `bellows` (měchař u tavby),
  `bloom` a `bars` (stupně 0–3), u hrnčíře `clay` (0–3) a `treading`. Stupně jsou návrh Clauda
  („pár stupňů“): houba od 0,05 / 3 / 8 kg, hřivny od 0,05 / 5 / 20 kg na kovárnu, hlína od
  0,5 / 30 / 120 kg (`CRAFT_YARD_STEPS`).
- **Kovárna**: **redukční pec** (návrh Clauda – nízká hliněná šachta ⌀ 0,85 m, výška 1,1 m, jako
  raně středověké kusové pece) stojí vždy před levým rohem přístřešku (`BLOOMERY`), u paty ruční
  klínový měch s hubicí (`BLOOMERY_BELLOWS`); při tavbě žhne uhlí v hrdle, z hrdla šlehá žár
  a jiskry (sprity `fireSprites` z `pyre-fire.ts`, `FIRE_SCALE` 0,2 – `animate` jen v záběru, při
  omezeném pohybu stojí) a stoupá dým z pece místo z výhně (`smeltVents`). **Houba** – 2 / 4 / 6 rezavých
  hrud se struskou vedle pece (`BLOOM_PILE`, `LUMP_SPOTS` – poslední navrchu), **hřivny** –
  hromádka světlých plochých prutů křížem (2 / 4 / 7 vrstev po třech, `BAR`) pod přístřeškem
  u levé stěny (`BAR_PILE`). Obojí je větší a světlejší než skutečnost, aby šlo z herní výšky
  rozeznat (noční ověření 27. 10. 2026), a nižší než polovina pece; dosah hromádek (`reach`)
  hlídá vyklízená plocha dílny a obdélník dvora pro pěšiny. Při překování a kování
  kouří výheň (`workshopSmokes`).
- **Postavy** (`craftsmen` ve `villager-plan-crafts.ts`): při tavbě kovář sype rudu a uhlí z koše
  do hrdla (`smeltSpots` – klip `seed`, šikmo zpředu od houby čelem k peci, uvnitř vyklízené
  plochy), měchař klečí u měchu (`weed`) – dospělý
  z podílu dílny, syn 10–13 z vlastního podílu `craft` s věkem (bere ho z rosteru podle věku);
  kovář sám jen u pece. Při překování a kování kovář u kovadliny s kladivem (klip `build` –
  palička z 0 A.D. `build.dae`), další u měchů výhně a u koryta. Postavy bez nového klipu ani
  vertex bufferu. **Fáze** (villager-phases.ts – village-people.md, Fáze činností): při tavbě
  napřed praní rudy v sítu (`sieve`) a pražení (`winnow` s lopatou), překování s kladivem
  a kleštěmi (`forge`) tempem 0,7, kování nástrojů `forge` 1,3 a odnos nástrojů do cizí
  domácnosti v nůši s nástroji (`carry-tools`); hrnčíř po kruhu či šlapání suší a vsazuje do pece
  (`pots` – sehnutí nad třemi nádobami na zemi), hlídá oheň a nese nádoby v nůši (`carry-pots`);
  uhlíř podle stavu milíře štípe na špalku (`split`), zahrnuje (`hoe`), hlídá (`idle`), vytahuje
  uhlí hráběmi (`rake`) a sype do koše (`fruit`). Rekvizity jsou propy postav – viz Rekvizity
  fází činností.
- **Hrnčíř**: mělká **jáma s hlínou** před přístřeškem vpravo (`CLAY_PIT`) – val vykopané země
  a hladina hlíny podle stupně (prázdná jáma tmavé dno; kreslí se jen s hlínou nebo šlapáním).
  Když hrnčíř vyrábí, jeden šlape hlínu – pomalu tam a zpět napříč jámou (`treadingLine`, klip
  `walk`, `TREADING`); jeden hrnčíř každý druhý den, s pomocníkem vždy jeden z nich.
- **Ukázka**: `/dev/buildings` – **Kovárna a hrnčíř** (`showcaseCraftYards`, kreslí renderer
  variant): tavba s žárem a dýmem, překování (hodně houby), kování nástrojů (plná hromádka
  hřiven), hrnčíř s plnou jámou a se skoro prázdnou. Bez postav (ty ukazuje ves).
- **Tesař – vznikající vůz** (villagers.md – Fáze činností, Tesař; úloha 11 scény): rozdělaný
  vůz (`SceneCraftYard.cart` – druh a fáze 1–3 z `cartBuildStage` ve village-view-crafts.ts:
  průběh dřevěné práce `Workshop.cart.done` ÷ `CARPENTRY.cartManDays`, od `CART_BUILD_STAGES.wheels`
  0,45 kola, s hotovou dřevěnou prací celý) stojí před dílnou (`CARPENTER_CART` –
  `carpenterCartSpot`, oj podél vchodu). Kreslí ho **cart-renderer.ts z dílů `wagons.glb`** jako
  stojící vůz bez id (`buildingCartPlans` ve village-carts.ts, `CartParked.build`): fáze 1 korba
  rovně spodkem na zemi bez kol (`buildingCartPose`, `CART_BODY_LOW_M`), 2 korba
  s koly (čtyřkolák i s předkem), 3 celý s ojí (`buildingCartParts`) – žádný nový model ani draw
  call. Tesař s pomocníkem stojí u korby (`carpenterCartSpots` – po bocích a u zadku, klip
  `build`), role fází `cart`: otesává díly (`split` – sekera a špalek), staví vůz (póza úlohy);
  vůz čekající na kování už jen stojí (tesař dělá nářadí u přístřešku).

## Divoká zvěř, pes a prut (modely – wildlife Úloha W8; ve scéně W10–W11)

`apps/web/public/models/fauna/wild-{boar,stag,hind,wolf,bear,fox,hare}.glb` a `dog.glb` (pes
z mastifa; vše ≤ 200 kB, 0 A.D., licence v `LICENSES.md` vedle). Stejná pipeline jako dobytek
(`tools/blender/fauna_from_0ad.py` + `fauna.json`): statický mesh a **tři morph targety**
`stride_a`, `stride_b`, `graze` (pes `lie` – mastif ležení nemá, je to póza s hlavou u země),
tedy 3 atributy + 3 targety + „stav“ instance = 7 vertex bufferů pod limitem WebGPU (8).
Skutečné délky: prase 1,5 m, jelen 2,1 m (srnec/samice `wild-hind` 1,9 m), vlk 1,3 m, medvěd
2 m, liška 1 m, zajíc 0,6 m, pes 1,1 m. Zajíc má v základní póze „sloupek“ (sedí), kroky jsou
skok. Pozn.: `wild-hind` je ta samice bez paroží (`animal_deer_01`).

- **Paroží jelena** (`wild-stag`): nové pole `props` ve `fauna.json` – `{"dae", "bone", "anchor"}`;
  statický mesh se přilepí k bodu `prop-antler-node` kostry (v animaci není, dopočte se z klidové
  matice a rodiče) a v každé póze, i klíčové, se hýbe s hlavou; mesh i textura se sloučí do
  jednoho meshe. Klíč `smooth` místo normál 0 A.D. (po rozích, ztrojnásobí vrcholy) nechá Blender
  spočítat normály (medvěd).
- **Prut**: `tools/blender/people_from_0ad.py` – `procedural_rod` (kužel ≈ 3 m, CC0), prop
  `fishing-rod` v `man.glb` a `woman.glb` u bodu `prop-weapon_R`, klip `fish` (klidová póza +
  prut). Bod ruky má v klidové póze ženy jiné osy – ženě prut natáčí `rotate_deg` [−6, 15, 0]
  (muži [−60, 0, 0]), spočtený klíčem `report_tip` s `aim` (směr prutu muže). Vlasec a splávek
  až ve scéně.
- **Řehtačka a oštěp na cestě**: `procedural_rattle` (držadlo, ozubené kolečko, rámeček; CC0),
  prop `rattle` v obou souborech, klipy `walk-rattle` a `idle-rattle` (chůze / klidová póza
  s pravou rukou zvednutou `pose.reach` a řehtačkou nahoru, natočení z `report_tip`); `walk-spear`
  jen v `man.glb` (chůze kopiníka 0 A.D. `infantry/spearman/walk_relax.dae` s propem `spear`,
  rychlost 0,97 – `CLIP_SPEED_M_S`). Bez nového vertex atributu – jen klouby a klipy.
- **Ikony** (`tools/blender/icons.py`): `resources/{boar,deer,wolf,bear,hare,fox,fish,dog}.png`
  z modelů, `spear` (oštěp) a `watch-fire` (pochodeň hlídky) procedurálně.
- Test `apps/web/lib/scene/__tests__/fauna.test.ts` hlídá buffery, morph targety a velikost GLB.

## Divoká zvěř ve scéně (wildlife Úloha W10)

Zvěř je v jádru jen počty – scéna ukáže **pár kusů podle stupně stavu**, ne jedince simulace.
Data: `SceneVillage.wildlife` (`SceneWildlife` – `sceneWildlife` ve `lib/wildlife-view.ts`, volá ho
`sceneVillage`): `shown` (kusy podle stupně 0–3 z `wildlifeView`: jelení 0/4/8/12 rozdělení
v poměru jeleni / laně / kolouši – jelen aspoň jeden, prasata 0/4/7/10 s podílem selat, zajíci
0/1/2/4, liška 1, vlci 0/2/3/5, medvěd 1, když je – `SCENE_WILD_SHOWN`, `sceneWildShown`),
měsíc herního dne, `topPartId` (díl s největší škodou, jen v okně škod), `crowFlocks` (jádro –
podle osetých ha dílů `sown`) a `fishShare` (biomasa ÷ strop).

- **Rozmístění** (`lib/scene/wildlife-placement.ts`, čisté, `planWildlife`): deterministicky ze
  seedu krajiny vsi a dat vsi, na rastru terénu dobytka (`LivestockGround` – sdílí ho
  `VillageLivestock.groundFor`). Stanoviště po 8 m do 320 m od středu vsi: **okraj lesa**
  (`forestEdge`, −7 až +5 m jako prasata vsi, vlci a medvěd, ≥ 45 m od obydlí), **louka před
  lesem** (`verge`, 8–20 m před hranicí lesa na louce – `ForestField` je v lese kladné, ≥ 45 m od obydlí – jelení zvěř; z kamery ji
  nezakryjí koruny, bez `verge` se bere `pasture`; návrh Clauda), **louka** (`pasture`, ≥ 55 m od
  obydlí, i strniště – díl `look: 'stubble'`), **kraj vsi** (22–60 m od obydlí – liška) a **díl se
  škodou** (`topPartId`, červen–srpen; na sousední díly smí). Nikdy ve stavbě, na poli (mimo díl
  se škodou), na hřbitově, v sadu, ohradě ani ve vodě (`free` – schůdná zem a kruhy staveb přes
  přihrádky). Skupiny (`wantedGroups`): rota prasat (v létě na dílu se škodou, jinak okraj lesa),
  laně s kolouchy (na dílu se škodou, když tam nejsou prasata) a jeleni zvlášť – v říji
  (září–říjen) spolu, zajíci každý zvlášť, liška, vlci jen v zimě (prosinec–únor), medvěd
  duben–listopad. Skupina je `Herd` dobytka s trasou ≤ 3 stanovišť 14–34 m od sebe, skupiny
  ≥ 40 m od sebe; kusy v kruhu 2,5 + 0,55 m na kus (osamělé zvíře se toulá do 3 m). Když se
  skupina na díl se škodou nevejde, zůstane na okraji lesa (jelení zvěř na louce před lesem). Bod trasy se přijme jen tehdy, když
  je volná i úsečka z předchozího bodu (vzorky po 4 m, `segmentFree`) a okruh toulání kolem něj.
- **Hra zatím nemá noc** (den a noc jen `/dev/landscape`) – zóny „za soumraku a v noci louky“
  se řídí jen měsícem; noční louky a liška za soumraku až s denní dobou ve hře (návrh Clauda).
- **Pohyb** (`wildlife-motion.ts`): pastva a stěhování po trase jako stádo (`herdState`,
  `herdAnimalPose`, skutečný čas `livestockClock`) s chůzí nejbližšího dobytka (prase → prase,
  jelen a laň → kůň, kolouch → hříbě, vlk a liška → koza, medvěd → kráva, zajíc → slepice).
  Vzácní jsou vidět jen v podílu 20minutových úseků skutečného času (`wildPresent` – vlci 35 %,
  medvěd 30 %, liška 60 %); jinak se zapíšou s nulovým měřítkem. **Příchod a odchod**
  (`presenceWalk`, `APPROACH`): skupina se neobjeví ani nezmizí naráz – na začátku úseku, kdy je
  vidět a v předchozím nebyla, vyjde krokem 40 m z lesa na trasu (45 s), před úsekem, kdy nebude,
  stejně odejde do lesa; posun se přičte k útěku a cestou se nový útěk nespouští. Směr do lesa
  (`WildGroup.retreat`) určí `planWildlife` z 16 směrů od prvního stanoviště – kde je les 40 m
  daleko nejhlubší (`LivestockGround.forestDepth`) a cesta schůdná, jinak pryč od středu vsi.
  Čistá funkce skutečného času (deterministicky ze seedu skupiny). **Útěk** (jen scéna): člověk
  (i jezdec) blíž než 30 m ke středu skupiny (`nearestThreat` nad `VillageVillagers.figureSpots`)
  → skupina uteče 45 m od něj (`startFlight`, odklon nejvýš 1,4 rad, když je přímo voda nebo
  stavba; celá dráha se vzorkuje po 5 m; kam utéct není – zůstane), rychlostí druhu (jelen 7 m/s … medvěd 4 m/s), 75 s stojí
  a krokem 0,9 m/s se vrátí na trasu (`flightAt`). Běh = rychlejší krok ze stejných morph
  targetů (délka kroku `RUN_STRIDE_M`), hlava nahoře – žádný nový vertex atribut.
- **Kreslení** (`wildlife.ts`, `VillageWildlife`, háček v `landscape-scene.ts` vedle dobytka):
  mesh `wild-<model>` na model (`createAnimalMesh` z `livestock.ts` – klíčové pózy jako vertex
  atributy + `LivestockPlugin`, 7 bufferů + matice, `fauna.test.ts` hlídá i `WILD_MODELS`),
  výška a náklon podle terénu (`writeAnimalPose`). Modely se stahují líně – jen ty, které plán
  potřebuje. Přepočet jen při změně `wildlifeKey` (zvěř z jádra, obydlí s pozemky, díly, hřbitovy,
  sady, ohrady, počty pokácených stromů); rozběhlý útěk přežije přestavbu (podle seedu skupiny); `animate()` v taktu scény pohne jen skupinami v záběru do 900 m (pevný obal dosahu skupiny se testuje dřív než útěk a obal), při omezeném pohybu
  stojí. Ořez: obal skupiny (kontrola záběru) a obal modelu přes trasy a dosah útěku – ořez po
  čtvercích (`scenery-chunks`) je jen pro nehybné instance, zvěře je pár desítek kusů.
- **Ryby a vrány z jádra** (`Fauna.setAbundance`, `landscape-scene.ts` – `applyFaunaAbundance`):
  hejn ryb je dosavadní počet × `fishShare` (aspoň jedno, když ryby jsou – `shownSchools`
  ve `fauna-placement.ts`), hejn vran `crowFlocks` (nejvýš kolik jich krajina má); skrytá hejna
  mají nulové měřítko a nehýbou se. Bez zvěře všechna jako dřív.
- **Výběr:** klik na zvíře (`VillageWildlife.pickHit` – průmět od nohou po hřbet do 14 px, bližší
  než postava a spřežení vyhraje) → cíl `{ kind: 'wildlife', species }` → panel druhu (W9).

## Lovci, psi, hlídky a rybáři ve scéně (wildlife Úloha W11)

Data: `SceneWildlife` (`sceneDefense` ve `lib/wildlife-view.ts`) – `hunt` (jádro `hunt.today`:
cíl, jezdci s koňmi, pěší, `kills` – celé kusy dne, jádro je zapíše v `huntDay`), `dogs` (celé kusy
smečky, nejvýš 8), `patrol` (jezdecká hlídka dne se silou > 0), `watchParts` (díly noční hlídky)
a `pools` (loviště dnešních rybářů – jádro `fishingPools`: tůně do 1 km jako `land.pools`, od
nejbližší, bod osy u nejhlubšího místa se směrem toku a šířkou vody; bez tůně, kde jádro rybaří
na `waterHa`, bod osy potoka nejblíž vsi – `streamSpot`; bez potoka nic). Nová pole zvěř
nepřeplánují (`wildlifeKey` bere jen pole W10).

- **Lov** (`huntPlans` v `riders.ts`, `huntRoute` v `rider-route.ts`): jezdci lovu jsou plány jízdy
  (`RidePlan`) ve skutečném čase (`RidePlan.span` z `huntSpan` – od 3 h dne lovu `HUNT_START_H`
  `HUNT_REAL_S` 600 s, přes ≈ 7 herních dní; `rideBlockAt` vrací sekundy) – `rideState` jede půlku
  lovu po trase tam a pak po téže trase zpět, koně kreslí livestock.ts a ohrada je skryje (`ridingHorseIds`) jako u objížďky.
  Trasa: od kůlu u brány po pěšinách (`walkRoute`) k okraji lesa u zvěře (`VillageWildlife.huntSpot`
  – první stanoviště skupiny na okraji lesa podle cíle: prasata, jinak jelení, vlci, medvěd; bez
  zvěře ve scéně `forestEdge` – první kruh kolem kůlu se 3 stromy), pak sem a tam podél okraje
  (`huntSweep`, ±22 m, 6 m do lesa), dokud trasa nepokryje půlku lovu (nikdy se nepřetočí). Tempo
  `HUNT_PACE`: pěší 1,0–1,45 m/s (svižná chůze, klip `walk-spear` nejvýš ≈ 1,25×), jezdci krokem až
  klusem (1,5–3 m/s); okno lovu je den lovu (`SceneHunt.day`). Jádro má lov jen v den lovu – běžící
  lov si scéna pamatuje do návratu lovců (`ActivityMemory` v `activity-memory.ts`, nový lov jiného
  dne až po něm) a jezdci lovu mezitím nejedou objížďku.
  Tempo cesty k lesu = délka ÷ 70 % půlky bloku v mezích `HUNT_PACE` (jezdci 1,5–6 m/s – klus nad
  1,5, pěší 1–3,2 m/s, k dalšímu lesu poklusem až 4,5 m/s). Cestu volí `huntWay` zvlášť pro jezdce
  a pěší: les u zvěře dál, než stihnou (pěší ≈ 73 m chůzí, jezdci ≈ 136 m) → nejbližší okraj lesa
  (`forestEdge`, `nearEdge`), a cesta zkrácená na dosah (`cutWay` – pěší poklusem ≈ 100 m), sweep
  pak kolem konce cesty – nikdy se neotočí v poli. Pěší lovci
  (`footHunterPose` ve `villager-plan-lord.ts`) jdou stejnou trasou vlastním tempem v řadě; na
  okraji lesa a na krajích sweepu je úsek 0,3 m tempem 0,05 m/s – lovec stojí s oštěpem
  (`spear-thrust`); cestou tam i zpět nese oštěp (`walk-spear`). Zastávka hned
  u okraje je nutná – na kraj sweepu (≈ 23 m krokem) by po cestě (70 % půlky bloku) nedošli. **Úlovek:** první pěší lovec nese cestou zpět maso
  (`carry-meat`), když jádro dnes ulovilo (`kills` > 0) – bez nového modelu (kus na koni by
  potřeboval mršinu natočenou podle koně). Cvičící mimo blok cvičí, odešlí synové jsou doma.
  Prasata před lovci utíkají sama (útěk W10 – lovci jsou postavy).
- **Psi** (`dogs.ts`, kreslí `VillageLivestock.setDogs` – druh `dog` z `dog.glb`, velikost 1,1):
  na kruhu 4,5 m kolem kůlu u brány chodí po oblouku sem a tam (46 s) a na krajích čichají
  (morph `lie` – hlava u země); v bloku vůdce běží vedle něj (2,2 m před, 1,5 m stranou, krok podle
  tempa, kde pěší stojí, čichají); prvních a posledních `DOG_JOIN_S` (3 s) bloku dobíhají od
  svého místa u dvorce k vůdci a zpět (lerp – neskočí). Model psa se načte líně, až má ves psy
  (`loadDog`). V den lovu všichni s pěšími (bez pěších s jezdci), v den hlídky
  nejvýš 3 s jezdci objížďky. Plány psů jdou s postavami (`DraftCrew.dogs`, `onCrew`).
- **Hlídka:** jezdecká = dosavadní objížďka (`fieldRing`) se psy. Noční hlídku scéna nekreslí – hra
  nemá noc a oheň by ve dne vypadal jako požár na poli; ve dne na každém hlídaném dílu nejvýš jedno
  dítě s řehtačkou (`watchChildren`, nejvýš 4; klipy `walk-rattle` / `idle-rattle` – řehtačka
  zvednutá v pravé ruce) chodí po okraji dílu blíž ke vsi (návrh Clauda) –
  vždy dítě, ať v jádru hlídá kdokoli; bere se z výrostků až po pasácích (`herderPeople`).
- **Rybáři** (`anglers` / `anglerSpot` ve `villager-plan-folk.ts`): podíl práce `fish` s cílem
  `pool` – postava stojí na břehu tůně (`stand`, klip `fish` s prutem), střídavě na obou březích,
  po 3,2 m podél toku, na prvním schůdném místě od vody, čelem k vodě, nejvýš 3 na tůň. Vlasec:
  `fishing-lines.ts` – jedna čára od špičky prutu (`ROD_TIP` spočtený z kostry klipu `fish`: muž
  2,15 m vpřed, 0,8 m vlevo, 1,6 m vzhůru; žena stejně šikmo nad vodu – 2,15 m vpřed, 0,8 m
  vlevo, 1,5 m vzhůru) 2 m dál k vodě; konec leží 0,3 m pod terénem, takže za strmým břehem končí viditelná čára
  na hladině. Všechny vlasce jeden LinesMesh, přestaví se jen se změnou postav. Oka se nekreslí.

## Kůň a hříbě (modely – Úloha 8; ve scéně Úloha 10)

`apps/web/public/models/fauna/horse.glb` (≈ 175 kB, 2,2 m dlouhý) a `foal.glb` (≈ 165 kB, 1,3 m,
≈ 0,6×) z `tools/blender/fauna_from_0ad.py` + `fauna.json` (`horse_breed.dae`, `horse_brown.png`).
Stejná stavba jako kráva: statický mesh s třemi morph targety `stride_a`, `stride_b`, `graze` –
tedy stejné vertex buffery jako kráva (POSITION, NORMAL, TEXCOORD_0 + 3 klíče + stav instance = 7,
limit WebGPU je 8; hlídá `lib/scene/__tests__/fauna.test.ts`). Pastva: 0 A.D. u `horse_breed`
žádnou nemá, klíč `graze` je proto vytvořený skriptem (`"bend"` – krk a hlava základní pózy se
skloní o 85°, nos skončí ≈ 0,6 m nad zemí). Sedlo a čabraka v modelu nejsou. Velikost ve scéně
(`SCALE` v `livestock-placement.ts`: kůň 1,0–1,12, hříbě 1,0–1,15; v ohradě `HORSE_SCALE` / `FOAL_SCALE`
v `pen-animals.ts`).

**Koně na pastvě (Úloha 10):** `LivestockSpecies` má `horse` a `foal` (modely `horse.glb`, `foal.glb`
jako kráva, pózy `GAIT`). `grazingHorses(village)` v `livestock-placement.ts`: v létě (mimo
`HAY_WINTER_MONTHS`), je-li pasák navíc (`herderCount` ≥ stáda ovcí s kozami, krav a prasat + 1; stádo nikdy samo, koně jdou na pastvu poslední), se pasou koně ohrad koní **bez jezdce**
(`riderId`); v zimě, bez pasáka a bez herního dne stojí v ohradě. Pasou se jako vlastní stádo
(`kind 'cattle'`, index `HORSE_HERD_INDEX`) spočítané **až po** ostatních stádech, takže jejich
rozmístění (`livestock-golden`) zůstává. Klíč plánu v `livestock.ts` nese i koně na pastvě.
Jedno rozhodnutí `grazingHorses` sdílí `planLivestock`, `penHerds` (kůň na pastvě není v ohradě)
a `villageKey`. Koňák: `labor-report.ts` dává podíl `horse-care` (hodina denně na koně, poměrně
po ohradách koní) a `villager-plan.ts` ho pošle k plotu ohrady (`penFence`); zimní `animal-care`
bere jen ohradu, která není koňská. Kůň jezdce je mimo ohradu jen v bloku jízdy (`penHerds(…, ridingNow)` – id koní z `ridingHorseIds`, `VillageRenderer.setRidingHorses` z `LandscapeScene.animate`), jinak v ohradě i v noci a v zimě; vedení koňákem se nekreslí. Koně nad
kapacitu míst se nevykreslí (`horseAnimalsFor`, 4 na čtverec – jádro tolik nepustí). Modely krávy,
koně a hříběte se stahují po druzích (`PenAnimals.load`, `morphKindsToLoad`), takže kůň, který
přijde později, se vykreslí. Koně se v noci do ohrady nezahánějí – sdílený nedodělek se dnem a nocí.

## Mršiny pro porážku (modely – kreslí `slaughter-renderer`, níž)

`apps/web/public/models/fauna/carcass-{cow,pig,sheep,goat}.glb` (`fauna.json`, `fauna_from_0ad.py`):
základ = **leží** (poslední snímek smrti z 0 A.D.), morph targety **`stands`** (první, p = +1) a
**`hangs`** (druhý, p = −1; vzniklo natočením stojící pózy kolem kyčle o −90° hlavou dolů, zadní
nohy o −180° vzhůru – klíč `hang` ve specifikaci; původní +90° věšelo zvíře hlavou nahoru, klíč
byl 26. 10. přepočten ze stojící pózy). Visí břichem k místní −Z (plán ho natočí k řezníkovi). `loadGeometry` je načte jako `keyA/keyB`: pád = p 1 → 0,
zvednutí na kozlinu p 0 → −1. Měřítko podle stojícího zvířete (`size_from`), takže sedí na živý
model. Buffery: pozice, normála, uv, keyA, keyB, stav instance, matice = **7** (hlídá `fauna.test.ts`).
**Mizení po čtvrtinách** bez dalšího bufferu: stojící souřadnice vrcholu = `position + keyA + keyB`
(strana x, podél těla z); vertex shader z nich pošle varying a fragment `discard` podle bitů ve
`stavu` (přední/zadní × levá/pravá čtvrť). Řez je rovný, vnitřnosti se nekreslí.
Pózy v GLB nejsou na stejném místě (ležící má střed obalu v počátku, stojící je posunutá stranou
a pod zemí, visící kotva háku jinde) – srovná je až `alignCarcass` při načtení (níž).

### Rekvizity porážky

`apps/web/public/models/slaughter/slaughter.glb` (`tools/blender/slaughter.py`, ≈ 40 kB, jeden atlas
256 px, licence v `LICENSES.md`). Uzly, počátek každého na zemi pod středem, rozměry v metrech
(Blender Z nahoru, −Y vpředu = ve scéně +Z):

- `trestle-large` – kozlina na krávu: tři kůly (základna r 1,25 m, vrchol 2,97 m), bidlo podél X
  ve výšce 2,83 m, provaz, rozpěrák ±0,22 m a dva háky; **hroty háků ve výšce 2,45 m** (kráva visí
  za hlezna, kopyta 0,18 m nad háky, celá 2,33 m – hlava ≈ 30 cm nad zemí, nad okrajem neckí). Otevřená strana mezi
  kůly je vpředu (−Y Blenderu). Střed háků je v ose (x = 0, y = 0).
- `trestle-small` – totéž na prase, ovci a kozu (visí 1,34–1,42 m, kopyta 0,1 m nad háky): vrchol
  2,0 m, základna r 0,85 m, **hroty háků ve výšce 1,50 m** – hlava 0,18–0,26 m nad zemí, v neckách.
  Dvě velikosti proto, aby zvíře viselo hlavou nízko nad zemí.
- `trough` – necky 1,4 × 0,5 m, výška 0,28 m, bez krve (Martin 26. 10. 2026: krev jen tmavá
  hladina v misce); pod hlavou visícího zvířete.
- `block` – špalek r 0,3 m, výška 0,55 m, nahoře prkno 0,7 × 0,34 m (vršek 0,59 m) pro kýty.
- `bowl` – miska na zemi (r 0,19 m, výška 0,13 m, tmavá kůra a tmavá hnědočervená hladina, aby okraj
  i hladina byly z výšky vidět) s krví; stojí vedle necek za jejich koncem (`BOWL_LOCAL`), řezník při
  vyvržení stojí z boku (`gutLocal`), ne před zvířetem. Miska v ruce ženy v klipu `bleed` je prop
  `bowl` v `people.json`.

Výška počátku visícího zvířete = hroty háků − `CARCASS.hangTop` (výška háku nad počátkem visícího
modelu, slaughter-plan.ts – s kopyty nad háky). Rekvizity kreslí `slaughter-renderer` (níž).

### Data porážky ze simulace

Scéna dostává z jádra **kusy poražené dnes** jako `SceneLabor.slaughter` (`Partial<Record<HerdSpecies,
number>>`, i zlomky kusů; bez údaje se neporáželo) – z `LaborDay.slaughterHeads`
(`labor-report.ts`; nouzovou porážku, která běží až v `eat()` po `work()`, doplní `simulateDay` do dnešního rozvrhu), ten z `LivestockState.slaughtered` (`{ day, heads }`, plní `noteSlaughtered`
v `livestock.ts`: `slaughter()` – jen hned poražené, `winterSlaughterDay`, `hayShortSlaughter`,
`emergencySlaughter`). Jen hlášení – simulace ho nečte. Dev náhled: `demoLabor` v listopadu
(`app/dev/landscape/dev-labor.ts`) přidá `slaughter` s ukázkovými kusy. Převod zlomků na
stanoviště je v plánu porážky (níž).

### Plán porážky

`apps/web/lib/scene/slaughter-plan.ts` – čistá funkce bez Babylonu (vzor `funeral-plan.ts`):

- **Stanoviště** (`slaughterSites`): počet `stationCount` = zaokrouhlený součet dnešních kusů,
  1 až `min(3, postavy / 2)`; zimní den s méně než jedním kusem má stanoviště jen s pravděpodobností rovnou součtu (`slaughterRoll(seed, den, 0)`), takže průměr přes zimu odpovídá kusům; 1. 11., nouzová a porážka pro seno víc.
  Druh losem váženým kusy (zlomky jsou podíly, každé další stanoviště bez už vylosovaného kusu),
  domácnost losem ze seedu a dne (`slaughterRoll`, každá nejvýš jednou). Kozlina 2–3 m před
  vchodem (`STATION_FROM_DOOR_M`, stranou až 3 m), otevřenou stranou k vchodu; všechny body
  `footprint` (nohy kozliny, ležící zvíře, špalek, místo řezníka) schůdné; kráva na velké kozlině
  u branky hotové ohrady skotu (bez ní ohrady spřežení, bez ohrady u domu), ostatní na malé.
- **Parta** (`SLAUGHTER_CREW`: ovce a koza 2, prase 3, kráva 4; role `butcher`, `bowl`, `holder`,
  `helper`): postavy napřed po jednom řezníkovi na stanoviště, pak doplnit party; s jednou
  postavou dělá řezník vše (bez misky). Jen dospělí 16+ (`SLAUGHTER_MIN_AGE`).
- **Osa dne** (`SLAUGHTER_PHASES`, podíly okna herního dne, den se opakuje jako u jízd):
  přivedení 0–6 %, omráčení 6–14 % (prase a kráva: 2–3 údery klipem `build` s palicí, pád ve 12 %
  za 0,6 s; ovce a koza `hold` – jen přidržení, řezník podřízne vestoje `gut` a zvíře padne až
  ve 14 %), vykrvení 14–35 % (řezník `butcher` u krku, žena `bleed` s miskou, pomocníci `weed`),
  zavěšení 35–40 % (v 37,5 % se zvíře za 1,2 s – `liftS` – zvedne z místa, kde leží, pod háky,
  otočí se a morph přejde leží → visí; lidé jdou kolem přední strany kozliny), vyvržení 40–62 %
  (`gut` u visícího, pod ním necky), rozčtvrcení 62–85 % (4 kroky: půl kroku `fell` se sekerou,
  v půlce čtvrtina zmizí, čtvrt kroku ji nosič nese `carry-meat` na prkno), odnos 85–100 %
  (kýta j – nosič j % parta, stálou rychlostí `carryMS` ke vchodu domácnosti, uvnitř `insideS`,
  zpět pro další; nakonec zůstanou doma – `hidden`).
- **Výstup pro kreslení**: `SlaughterStation` – kozlina (`x`, `z`, natočení, `trestle`
  large/small), `animal` (kde stojí a leží, hlavou k vchodu), `hang` (pod háky, natočení
  `−heading`, výška počátku `lift` = háky − `CARCASS.hangTop`), `trough` (pod háky), `block`
  (místa kýt `BLOCK.legSlots`, výška `boardY`), `bowl` (miska na zemi od střihu, jen se ženou
  s miskou). Okamžik: `slaughterState` – fáze, `carcass` (`pose` 1 stojí / 0 leží / −1 visí,
  poloha, `lift`, `quarters` a `cutMask` po `QUARTER_BITS`), `legsOnBoard`, `bowlOnGround`.
  Lidé: `slaughterPose` – poloha, natočení, klip a tempo podle scénáře kroků (rekvizitu v ruce
  dává klip).
- **Postavy** (`villager-plan-slaughter.ts`, `slaughterFigures`): v `planVillagersWithCrew` hned
  po řemeslnících; bez `labor.slaughter`, hodin světa nebo podílu `slaughter` nic. Postav je
  tolik, kolik má podíl porážky (aspoň 2, nejvýš dospělých; nadbytek nad podílem se ubere z domácích prací a nečinných, ať nikomu nechybí postava); řezník muž a žena s miskou
  přednostně z domácnosti stanoviště (`roster.take`), klíč `slaughter-crew:`. Lidé party
  nedělají nic jiného – o ně se zmenší podíl porážky, jeho zbytek stojí jako dřív u výmlatu.
  Plán vrací `planVillagersWithCrew` jako `slaughter` (pro `slaughter-renderer`). Nosič s masem
  (`carry-meat`) jde jako s dřevem (`CLIP_SPEED_M_S`: žena 1,05, muž 1,0 m/s – stejná kadence).

### Kreslení porážky

`apps/web/lib/scene/slaughter-renderer.ts` (`SlaughterRenderer`, vzor `funeral-renderer.ts`):

- **Háček:** `villagers.ts` po `planVillagersWithCrew` ohlásí plán `onSlaughter` (jen při změně,
  klíč den + okno + stanoviště + parta; bez modelů postav null) → `landscape-scene.ts` →
  `VillageRenderer.setSlaughter` → `set`. Animace: `animate()` scény volá
  `VillageRenderer.animateSlaughter` (skutečný čas jako lidé); dispose s vsí.
- **Modely líně**, až je porážka: `slaughter.glb` (`loadModelParts`, PBR s `applyGammaFog`)
  a `carcass-<druh>.glb` jen pro druhy v plánu (`loadGeometry`).
- **Rekvizity** – díl = mesh v instancích (instance = stanoviště, skrytá = nulová matice):
  kozlina velká/malá, necky (pod háky, podél bidla), špalek; nehybné – matice jen
  v `set` a po načtení. Miska na zemi od zavěšení (`bowlOnGround`). Nevrhají stín (jen den porážky).
- **Mršina** – mesh `slaughter-carcass-<druh>`, instance = stanoviště tohoto druhu. `alignCarcass`
  při načtení přepočítá základ a klíče: ležící a stojící střed obalu na počátek a spodek na zem,
  visící kotva háku (kopyta – vrcholy do 8 cm pod vrcholem) nad počátek (výška beze změny –
  `CARCASS.hangTop`). Matice: místo a natočení z `slaughterState` (při zvednutí plynule od ležícího
  k hákům), výška terénu + `lift`. **`CarcassPlugin`** (GLSL i WGSL nad StandardMaterialem):
  stav instance `carcassState` = (póza p, `cutMask`); vertex `position + A·p + B·p²` a varying
  stojících souřadnic, fragment `discard` čtvrtiny podle bitu (přední z > 0, pravá x > 0; bit 1
  přední pravá, 2 přední levá, 4 zadní pravá, 8 zadní levá – přední, dolní, se sekají první).
  Buffery: pozice, normála, uv, `carcassKeyA/B`, `carcassState`, matice = **7**
  (`slaughter-renderer.test.ts`, `fauna.test.ts`).
- **Kýty na prkně** – komolý kužel (0,3 m, `LEG`) v instancích, 4 na stanoviště v místech
  `BLOCK.legSlots` napříč prknem; měřítko podle druhu (`LEG_SCALE`); kolik, říká `legsOnBoard`.
- **Kdy se kreslí:** `write` porovná stav každého stanoviště (viditelnost, póza, místo, výška,
  natočení, `cutMask`, kýty, miska) se zapsaným a přepíše buffery jen při změně – `animate` pak
  vrátí true a scéna nastaví `needsRender`. Plynule se mění jen pád (0,6 s) a zvednutí na háky
  (1,2 s), jinak skokově (čtvrtiny, kýty, miska). Mimo záběr (obal stanovišť) a dál než 1,5 km
  se nepřepisuje; při omezeném pohybu se `animate` nevolá – zůstane stav ze `set`.

## Jezdci (lord-horses Úloha 11)

Kdo, kdy a na kterém koni jede, určuje jádro (`lordRides` → `SceneLord.riders`, `borderTrailId`,
`escort` v `village-view-scene.ts`; jen cvičící, ne na poli). Scéna jen kreslí:

- **Trasa** `lib/scene/rider-route.ts` (čisté funkce): okruh `fieldRing` = konvexní obal rohů všech
  dílů polí a obydlí rozšířený o `RING_MARGIN_M` (5 m – po mezi a louce); pole, které by okruh
  protnul, se přidá do obalu, takže **nikdy nevede přes čtverec pole**. V zimě (`WINTER_MONTHS`)
  kratší okruh kolem obydlí (`WINTER_RING_M` 14 m) se stejnou pojistkou. `loopRoute` – od kůlu na
  koně u brány (`training-ground-layout` `hitch`) k nejbližšímu vrcholu okruhu, kam vede cesta mimo
  pole (`walkRoute` po pěšinách a kolem domů), dokola a zpět; `trailRoute` – po zemské stezce ke
  kraji mapy a zpět (jízda k hranici, doprovod výpravy). Tempo `RIDE_PACE` krok 1,5 m/s, nejdelší
  úsek okruhu klusem 3 m/s; `rideDistance` – ujetá vzdálenost jako čistá funkce skutečného času
  (po celé jízdě znovu od kůlu), `rideSpot` – poloha a směr. Skupiny po 4 (`rideGroups`).
- **Plán dne** `lib/scene/riders.ts`: `ridePlans` (v `lordFigures`, `villager-plan-lord.ts`) – trasa,
  místo ve skupině (po dvou, 3,6 m za sebou, 0,9 m stranou), víc skupin rozestoupeně po trase,
  koně u kůlu vedle sebe. `rideSpan` – výcviková jízda ve skutečném čase v každém cyklu dne rodiny
  (`span` od `LORD_CYCLE.ride`, `period` = `LORD_CYCLE_S`; lord-day.ts), skupina tak dlouho, kolik
  dá nejdelší jízda ve skupině (hodina jádra 2 minuty, nejvýš 4); `except` – opakovaná jízda, která
  zasáhne do lovu jezdce, se nejede. `rideBlockAt` počítá i opakování. `rideState` – jede jen
  v bloku (`isRiding`): od kůlu po trase a v půlce bloku zpět (odsazení do strany podle směru
  tam i zpět – na obratu žádný skok), takže blok začíná i končí u kůlu; mimo blok jezdec cvičí na
  dvorku (`lordFigures`) a kůň je v ohradě, mezi bloky ho `livestock.ts` skrývá (`Group.hidden`).
  Kdo jede a kudy, scéna drží po celou jízdu, jak byla na začátku (`ActivityMemory` – `rideAt`).
  Kůň z ohrady ke kůlu: `withLead(plan, gate, leg)` (`RidePlan.lead` – od branky ohrady koně
  `horseGate` + 1 m tam, kde jízda začne; `lordFigures` pro výcvikové jízdy i lov), `leadAt` /
  `isLed` – před jízdou krokem `LEAD_M_S` 1,2 m/s a `LEAD_WAIT_S` 10 s u kůlu, po jízdě zpět;
  `isAway` je zahrnuje (ohrada koně nekreslí), `rideHorsePose` kreslí cestu, `livestock.ts` – `still`.
  Lov (`huntSpan`) začíná v chvíli výcvikové jízdy cyklu (`rideSlot`), aspoň `HUNT_BRIDGE_S` po
  začátku dne lovu. Jízda k hranici a doprovod se
  do bloku nevejdou – jen vyjedou a vrátí se, neprojedou celou trasu (známé omezení, doprovod
  není sladěný s karavanou; horses.md – Kdy jsou jezdci venku). Plány jdou přes `DraftCrew.rides` → `VillageVillagers.rides()`
  → `onCrew` → `VillageLivestock.setRides`.
- **Kreslení a buffery:** jezdec = instance `villagers-man` s klipem `ride` / `ride-trot`
  (`riderPose`; jezdec za čelem skupiny, který v bloku jízdy čeká na začátku trasy, sedí na
  stojícím koni klipem `ride-idle` – kůň bez kroku, `waiting`), zvednutá o výšku sedu `RIDER_SEAT_M` × `RIDE_HORSE_SCALE` přes `VillagerPose.lift`
  – jen posun matice, **žádný vertex atribut** (8 bufferů jako dosud). Kůň = skupina `horse`
  v `livestock.ts` (`rideHorsePose` – krok a klus morph targety jako kráva, 7 bufferů). Stojící kůň
  (`Group.still`) se zapíše jednou a překreslení nenastavuje, jedoucí ano. Bez sedla (horses.md).
- **Výběr:** klik na jezdce nebo koně vybere člověka (`pickPersonHit` od země – průmět kryje koně
  i jezdce), kroužek ho sleduje.

## Kování ve scéně (horses.md – Kování, Ve scéně)

Kdo a kdy kuje, určuje jádro (`shoeingDay` → `SceneLabor.shoeing`); scéna jen kreslí.

- **Plán** `lib/scene/shoeing-plan.ts` (čisté funkce času): `shoeingSpots` – u branky ohrady
  (`penSquaresEntrance` jako porážka) kůl 2 m stranou podél plotu, kůň vně ohrady podél plotu hlavou
  ke kůlu (`hitch`), kovář u předního kopyta čelem k ohradě. `shoeingSchedule` – kování kolem
  ve skutečném čase (villagers.md – Činnosti od začátku do konce): kovář vyjde se začátkem dne
  kování (`SceneShoeing.day`; server posílá poslední kování za `SHOEING_VIEW_DAYS` 40 dní –
  `sceneShoeing` ve `village-view-scene.ts`), jde běžnou chůzí (`walkSpeed`, klip 1×), u branky
  `SHOE_HORSE_S` 120 s na koně a zpět chůzí – i přes víc herních dní. `tiedSpans` – kůň po koni
  (ms; `RidePlan.tied` je skutečný čas). Po návratu kováře ho plán nemá (`VillagerPlanOptions.nowMs`;
  konec se odhaduje s pomalou chůzí, ať postava nezmizí cestou). Kování nové, než staré doběhne,
  staré nahradí (vzácné). `smithShoeingPose` – mimo výpravu skrytý
  (v kovárně, u souseda), cestou `walk` po `way` (stage `out` / `back`), u koně klip `build`
  (předklon s kladívkem), na začátku každého koně chvíli `idle`. Bez hodin světa se nekuje.
- **Postava** `lib/scene/villager-plan-shoeing.ts` – `shoeingFigures` (volá `planVillagersWithCrew`
  hned po vojvodově rodině, mezi lidmi s pevným místem dne): vlastní kovář je muž z domácnosti
  kovárny (`ctx.roster`, záložně starší chlapec), cesta od dveří kovárny po pěšinách (`walkRoute`);
  cizí kovář je `STRANGER`, cesta po zemské stezce (`trailId`), jinak po čáře `line` od kraje mapy –
  konec bližší ohradě je u vsi – a od ní po pěšinách. Klíč postavy `SHOEING_KEY`. Podíly
  `horse-shoeing` pak postavu nemají.
- **Kůň u kůlu:** plány koní jsou `RidePlan` bez trasy s hodinami `tied` (`shodHorsePlans`) –
  jdou do `DraftCrew.rides` za jezdce. `isTied` / `isAway` (`riders.ts`): kůň mimo ohradu jede, nebo
  stojí uvázaný; `ridingHorseIds` (ohrada ho skryje) i `livestock.ts` (skupina koně je vidět jen mimo
  ohradu) berou `isAway`. Stojící kůň se zapíše jednou a znovu jen při příchodu ke kůlu a odchodu
  (`written` v `livestock.ts`). **Buffery:** kovář je instance `villagers-man` s klipem `build`, kůň
  skupina `horse` – žádný nový vertex atribut (hlídá `fauna.test.ts`).
- **Ukázka** `/dev/landscape` – tlačítko „Kování“ (`dev-shoeing.ts`): vypnuto → vlastní kovář →
  cizí kovář (krajinou z kraje mapy na východě); bez ohrady koní si ji ukázka přinese i s kovárnou.

## Požár a řetěz s vědry (disasters.md – Požár, Hašení – řetěz s vědry; P13)

Data `SceneVillage.fire` jen v den požáru – [village-disasters.md – Scéna – požár](village-disasters.md).

- **Plameny** – oheň pálení paseky (`clearing-fire-renderer.ts`) s jiným druhem ohně (`FireKind`
  – rozvrh, tvar, kapacita, jméno správce, den světa): `houseFireKind` v `house-fire.ts`, druhá
  instance `ClearingFireRenderer` v `landscape-scene.ts` (`houseFire`, `updateHouseFires` podle
  `houseFireKey`). Na stavbu dva ohně podél hřebene (`houseFires`, 14 plamenů a 6 jisker, tvar
  `houseFireShape` – plameny nad střechou), nejvýš `MAX_BURNING_HOUSES` (12) staveb. Rozvrh
  `houseFireState` (`smoke-schedule.ts`, `HOUSE_FIRE`): požár je událost celého herního dne –
  chytne hned po půlnoci (sousední stavby o kus později podle pořadí v šíření), hoří naplno, od
  0,55 dne slábne, od 0,8 jen žhavé uhlíky a dým doutnání do konce dne.
- **Hustý dým** – dým vsi (`village-smoke.ts`) druhu `house-fire` (`HOUSE_FIRE_PLUME` – 34
  obláčků, 40 m vysoko, tmavší na polovinu), zdroj 2,5 m nad středem každé hořící stavby
  (`houseFirePlumes`, `HOUSE_FIRE_SMOKE_SEED`), síla z `houseFireState` přes `ClearingBurn`
  (`burnedDay` = den požáru, `order`). Vývojově vynucený den světa (`setDisasterDay`) platí
  i pro plameny a dým.
- **Řetěz s vědry** (`villager-plan-fire.ts`; Martin 27. 10. 2026: „Chci, aby všichni dospělí
  hasili. Ať udělají řetěz s vědry od nejbližší vody“, „Lidé musí být rozložení ve stejných
  vzdálenostech“) – `fireChainLayout`: úsečka od bodu vody k hořící stavbě, poslední člověk
  kousek před stěnou (`HOUSE_CLEAR_M`), rovně (i přes sad nebo pole – jako jádro). Rozestup
  jádra ≤ 2,5 m (`FIRE.firefighting.handoverM`) – **podávají**: stojí rovnoměrně, střídavě
  0,45 m vlevo a vpravo od osy čelem k ní (`idle`), vědra jdou po ose od vody k ohni po jednom
  předání za 1,1 s (chvíli je člověk drží, mezi lidmi se zhoupnou), vědro na dva lidi; u ohně se
  vylije, u vody se nabere. Větší rozestup – **chodí**: každý tam a zpět po svém úseku (od souseda
  k sousedovi, 1,15 m/s, tempo klipu `walk` podle velikosti postavy), sousedé v protifázi – na
  konci úseku se potkají a 0,8 s stojí proti sobě (předají si vědro), k ohni nese plné, zpět
  prázdné. Postavy `fireChainFigures` hned po pohřbech (dospělí z `DayRoster`, jádro jim ten den
  jinou práci nedává), klíč `fire:<i>`, činnost v panelu „hasí požár“ (`PersonJob` `fire`);
  nejvýš `MAX_FIRE_FIGURES` (80) – víc dospělých: řada od ohně s rozestupem jádra. Při změně
  plánu nepřecházejí pěšky (`walkThen`), modely postav se načtou i při prázdné práci vsi.
- **Vědra** (`fire-buckets.ts`) – samostatný mesh, ne rekvizita postavy (postava má právě 8
  vertex bufferů, limit WebGPU): procedurální dřevěný válec (vlastní práce, CC0) v tenkých
  instancích, polohy `fireBuckets` ze stejného rozvrhu a času jako postavy (při chůzi v pravé
  ruce u boku, při podávání na ose řady ve výšce rukou). Jen v den požáru; při omezeném pohybu
  stojí. Draw cally: požár +2 (sprity plamenů, vědra), normální den beze změny.
- **Ohořelé trosky** – zbytek jámy (`ruinHollowData`, `charred`) má uvnitř jámy popel
  a ohořelé dřevo (`CHARRED_TINT`), na lemu slabě; jak zbytek zarůstá, vrací se k trávě. Zmizí
  jako každý zbytek – zarostením nebo novou stavbou hráče na místě (`withoutBuiltOverRuins`).
- Testy `fire-chain.test.ts` (rovnoměrné rozestupy, střídání stran, chodci se potkají na konci
  úseku, vědra, rozvrh ohně).

## Smršť – stopa ve vsi (disasters.md – Smršť, Ve scéně; P13)

Data `SceneVillage.tornado` (den, síla, stopa, prvních pár dní vývraty) –
[village-disasters.md – Scéna – smršť](village-disasters.md); trychtýř a ztmavení –
[scene.md – Smršť](scene.md). Pásmo stopy počítá scéna stejnou funkcí jako jádro
(`inTornadoTrack`), podíly škod podle síly z `TORNADO.strengths` (`strengthRule`).

- **Vývraty** – jádro je zapíše jako kácení (`felledTrees`), scéna je tak kreslí jako každý
  pokácený strom: strom zmizí (InstanceHider) a na jeho místě je pařez (`felled-trees.ts`,
  `obstacles.stumps`); klády leží na hromadách u lesa (`logStacks`, `log-pile.ts`). Navíc
  `TORNADO_TRUNK_DAYS` (10) dní po smršti leží vyvrácené stromy vrstvy překážek **na boku se
  zelenou korunou** – plný model stromu podle podoby (`lyingTreeModel`; vrba z dekorací, vzácné
  varianty jilmu, topolu a velkého dubu jedním modelem rodu), pata na místě stromu zvednutá
  o 0,8 m, osa skloněná o 80° od svislice (`up` v `ModelInstance` – koruna nepropadá terénem)
  ve směru pádu po stopě ± 0,45 rad (`fallenTrunk`). U paty **kořenový talíř** – hrouda
  (`stone-2`, 14 trojúhelníků, obarvená do hlíny) postavená na hranu kolmo na kmen, místo
  pařezu (ten se ukáže, až ves kmen rozřeže). Nikdy impostor (atlas je pro stojící strom) –
  meshe `felled-fallen-<model>` a `felled-root-plate`, ořez po čtvercích. Souš bez modelu
  stromu leží jako holý padlý kmen (`fallen-2`, `fallen-3`, střed 5 m od pařezu, 0,85 ×
  strom); mladé stromky ne. Pak je ves rozřeže na klády (návrh Clauda). Výkon (F3 ukázka,
  3391 vývratů): výchozí pohled draw cally i trojúhelníky jako normální den (stromy stopy jsou
  skryté), trojnásobné oddálení +10 draw callů a +0,33 mil. trojúhelníků (1,58 → 1,91 mil.). Kmeny jdou přes `FelledTrees.update` (`tornadoTrunks`) – změna nastaví
  `felled`, takže se **stínová mapa překreslí jednou** (`castersChanged`).
- **Polehlá pole** – `withTornado` ve `field-look.ts` (po krupobití): osetý díl se středem ve
  stopě nižší a řidší podle ztráty úrody síly (F0 0,2 … F3 1 – `crop`), polehlý (i luštěniny
  a len) a do hněda – do žní jako kroupy (sklizený díl už osetý není).
- **Rozmetané stohy** – `scatterStacks` (`tornado-track.ts`) v `FieldRenderer.updatePlants`:
  stoh louky nebo pole ve stopě (podíl `hay` – F0 polovina, jinak všechny; `stackScattered`)
  rozfouká vítr na 5 nízkých kupek po směru stopy do 14 m; jen stohy, které v den smrště stály
  (`hayPhase` dne smrště – `stacks`), nové stohy po ní stojí celé. Změna smrště přestaví seno
  i bez nového dne (náhled). Stoh u ohrady (`pen-renderer.ts`, `PenView.tornado`) ve stopě
  leží jako nízká široká hromada (× 1,3 šířka, × 0,25 výška).
- **Poškozené a zřícené stavby** – jádro ubere stav (`condition`) a na nule obydlí zboří
  (`collapseDwellings` – zbytek jámy v `ruins`); scéna je kreslí jako rozpad
  (`dwelling-decay.ts`, `structure-decay.ts`) a zbytek po zániku – bez vlastní cesty. Změna
  staveb nastaví `village` → stínová mapa se překreslí jednou.

## Opevnění ve scéně (fortifications.md – Ve scéně; Ú5.7)

- **Data:** `sceneFortifications(state, landscape, day)` (`lib/fort-view.ts`) dává ke každému
  opevnění i tvar úseků z jádra (`shapes` – lomená čára křivky `path` a délka, `fortSegments`;
  obvod z bodů – fortifications.md, Obvod), body obvodu (`points`), vzhled
  úseků (`looks` – stáří v letech, stáří nástavby, podíl práce úseku ve stavbě podle
  `fortSegmentProgress` – práce jde napřed do kácení, pak úsek po úseku), co se staví (`work`),
  výšku valu a `gatesClosed` (zatím jen ukázka – nájezd přinese F6). Vše, co scéna kreslí, se
  z toho odvozuje pevně podle id opevnění a pořadí kůlu (`hash01`), bez náhody.
- **Rozmístění** (`lib/scene/fortification-layout.ts`, bez Babylonu, testy
  `fortification-layout.test.ts`): `perimeterSamples` vzorkuje vnější okraj po lomené čáře
  křivky (`shape.path`, nejvýš po kroku) s normálou dovnitř (kolmo na tečnu z obou sousedů)
  a protějším bodem vnitřního okraje pásu (`ix`, `iz`) o šířku pásu po normále. **Ostrý ohyb**
  (val: ohyb 8 m, pás 10 m): posun se přehne do smyčky – `trimLoops` body smyčky sejde do jejího
  průsečíku, vnitřní okraj se sejde do rohu (fortifications.md – Obvod), průřez se nepřehne
  (Martin 7. 11. 2026 – obvod z bodů; dřív rohy valu na oblouku se středem po ose rohu).
  `insetPoint(p, d, fortBand(fort))`: příkop (prvních 4 m, u plotu a palisády celý pás) drží
  vzdálenost od vnějšího okraje, násep vede poměrně mezi koncem příkopu a vnitřním okrajem –
  výška podle poměrné polohy, nic se nepřehne. Dřív se pás u vnějšího oblouku stlačoval do jeho poloměru a násep se v rohu smrštil do
  „věže“ (Martin 6. 11. 2026). `insetLine` dá čáru uvnitř pásu po stejných krocích – palisáda
  0,75 m (polovina pásu 1,5 m), plot 0,5 m, koruna valu 7 m.
  Brány: mezera 4 m kolem `offsetM` úseku – rovná tětiva, křídla a závora podél tečny obvodu
  u brány (`tangentAt`); zavřené brány, prolamování a průlom (scéna války) jdou po týchž úsecích.
  - **Palisáda** (`palisadeLayout`): kůl po 0,25 m (4 na metr) i po obloucích, varianta (3),
    výška 0,95–1,03 × 3,5 m, natočení a drobný náklon pevně z id a pořadí; stáří – dřevo šedne
    (`woodTint` – barva instance), posledních 30 % životnosti se kůly naklánějí, za životností
    řídnou podle stavu úseku (mezery); průlom – 4 m uprostřed úseku vyvrácené kůly ven.
  - **Plot** (`fortFenceStage`): `FenceStage` pro sdílený `WovenFenceRenderer` (tentýž pletený
    plot jako u pozemků – vlastník `fort-<id>`), kůly po 1 m, 7 výšek větví, kůly u brány vyšší;
    stáří – kůly nakřivo, pahýly, vypadané větve; na valu kůl zvednutý (`sink` záporný).
  - **Brány** (`fortGateInstances`): palisáda – dvě křídla z prken, kůly brány a trám; plot –
    dvě proutěná křídla; val bez nástavby – závora. Otevřené křídlo míří dovnitř, zavřené
    napříč; průlom brány – křídla vyvrácená. Brána valu stojí v průchodu bez náspu a příkopu.
  - **Staveniště po úsecích** (`fortSitePhase` v `village-construction.ts`): plot – kůly
    (první polovina práce úseku), pak větve; palisáda – žlab (30 %), pak kůly; obojí od začátku
    úseku po směru hodin, tedy od brány (`fortWorkOrder`); val – příkop a násep rostou spolu.
    Vylepšení plotu staví palisádu vedle stojícího plotu, nástavba valu staví na koruně.
  - **Vytyčení od 0 %** (`fortStakingLines`; Martin 6. 11. 2026): při stavbě a vylepšení
    kolíky a provázek (`staking.ts` – tentýž jako u obydlí, hřbitova a sadu) po čáře plotu či
    palisády nehotových úseků (vylepšení – čára palisády), u valu po vnějším okraji příkopu
    a patě valu; body po `PEG_SPACING_M` (3 m), mezery bran volné, kde práce úseku začala (kůly,
    žlab, hlína), vytyčení ustoupí. Renderer z čar udělá provázek (síť opevnění), pod ním světlou čáru na zemi 0,2 m (vyšlapaná
    tráva jako u hřbitova – obvod je vidět i z dálky) a kolíky do vlastního `StakingPegs`. Klik na pás vybere opevnění i na 0 % (`pickVillageTarget` průběh
    nezná – výběr šel i dřív, jen nebylo vidět kam kliknout).
- **Val** (`lib/scene/rampart-mesh.ts`): průřez po 1,5 m obvodu – okraj o 0,3 m přes terén,
  příkop 0–4 m (dno 1,5 m pod terénem), násep 4–10 m (koruna 2 m, `rampartProfile`); úseky na
  sebe plynule navazují (přechod 3 m), v bráně průchod. Starý val (`rampartHeight` pod 1) je
  nižší a zaoblený. Hlína a tráva jsou dvě sítě (hlína – materiál jam obydlí, tráva – textura
  trávy terénu se sezónou): čtverec sítě je tráva podle podílu zarostení úseku – od 0,3 do 2,7
  roku po dokončení (`RAMPART_GRASS_YEARS`), dno příkopu zaroste poslední.
- **Prořez příkopu** (`pit-cut.ts`, `ditchCuts`, `packDitchCuts`): terén a obtisky na něm se
  v příkopu zahodí ve fragment shaderu podle **vzdálenosti od úseček osy příkopu** (pole
  uniform – vec4 na úsečku, nejvýš `MAX_DITCH_CUTS` = 48; víc – ty nejblíž středu obvodu).
  Maska by byla 16. sampler terénu (má jich 15, WebGL 2 zaručuje jen 16) a musela by se
  překreslovat se stavbou; úseček je málo – změřeno: čtvercový val 350 m 20 úseček, s branou 21,
  se dvěma 22; obvod z bodů – osa příkopu zjednodušená Douglas–Peuckerem na 0,1 m
  (`simplifyLine`), mimo obdélník všech úseček stojí
  test jedno porovnání. Úsečky
  jen tam, kde je příkop hlubší než 8 cm, konce souvislého kusu zkrácené o půl šířky (prořez
  kolem úsečky je zakulacený a nesmí do průchodu brány).
- **Renderer** (`lib/scene/fortification-renderer.ts`): díly
  `models/fortifications/fortifications.glb` (`tools/blender/fortifications.py`, CC0 –
  3 varianty kůlu, kůl a trám brány, křídla z prken a z proutí, závora; bez UV, jen barva
  materiálu – pozice, normála, 4 sloupce matice a barva instance = 7 vertex bufferů) jako
  nehybné instance `fort-…` (`CULLED_MESHES` – ořez po čtvercích, stínová mapa kreslí všechny).
  Změna se pozná podle otisku opevnění (`JSON.stringify`) – jen tehdy se přestaví instance,
  plot, sítě valu a prořez; `VillageRenderer.update` pak vrátí true (kreslí se jen při změně).
- **Ukázka:** `/dev/buildings` – tlačítko **Opevnění** (`fortification-showcase.ts`): plot,
  palisáda, val (zarostlý), val s palisádou, staveniště palisády (žlab a kůly od brány),
  stará palisáda (šedá, nakřivo, mezery), průlom (zavřená rozsekaná brána) a rozestavěný val.
- **Hradby – ochoz, roštová, komorová** (fortifications.md – Hradby a obrana, Rozhraní
  a scéna; plán hradeb Ú7): druh dílu z jádra (`segmentWall` → `SegmentBuild.ground/top.layer`
  = `WallKind`), na valu stojí hradba od koruny (7 m) a vše se zvedne o korunu (`crownLift`).
  Rozměry jsou čísla scény (`WALKWAY`, `CRIB`, `CHAMBER` ve `fortification-layout.ts`), díly
  z `fortifications.glb` (Ú3). Instance mají navíc vodorovné měřítko `scaleX` / `scaleZ`
  (`fortInstanceMatrix`) – fošny a komory se roztáhnou napříč.
  - **Palisáda s ochozem** (`walkwayLayout`): kůly kreslí `palisadeLayout` na čáře palisády
    (0,75 m – ochoz je přístavba, kůly se nehnou); za nimi fošny po 2 m roztažené na 0,9 m, vrch
    `WALKWAY.deckM` = 2 m (1,5 m pod špičkami), sloupek na spoji fošen od zeminy k fošně, schůdky
    jednou v úseku (čtvrtina délky – mimo bránu) od paty za ochozem ke kůlům (výška
    `scaleY`). Násyp zevnitř (síť): koruna 1,2 m za kůly do 1,75 m, svah k vnitřnímu okraji
    pásu 5,5 m; zarůstá trávou jako val. Na valu násyp není (je jím val), sloupky a schůdky stojí
    na skutečné výšce valu (`rampartProfile`).
  - **Roštová** (`cribLayout`, pás 7 m, výška 3 m): kamenná plenta po 1 m na vnější hraně
    (`facing-stone-a/-b` podle `hash01`, svislé měřítko na 3 m), na koruně dvě příčné klády
    roštu po 2 m napůl v hlíně, stupňovitý týl – podélná kláda po 4 m v každém z 6 pater, patro
    o 0,2 m dovnitř, předprseň po 2 m za plentou. Hliněné jádro (síť) od plenty, koruna do 5,6 m,
    týl k zemi na 7 m.
  - **Komorová** (`chamberLayout`, pás 8 m, výška 4 m): srubové komory po 5 m roztažené přes pás
    (`scaleZ` 2,4), čelní kamenná zeď po 1 m vně, předprseň po 2 m; výplň komor (síť) mezi
    vnitřními líci srubů ve výšce 3,85 m.
  - **Staveniště** (`fortSitePhase`): ochoz – žlab (20 %), kůly (do 60 %), pak násyp a fošny od
    začátku úseku; roštová roste po patrech (výška jádra, plenty i týlu); komorová – komory od
    začátku úseku (první polovina), pak výplň a čelní zeď (výška). Předprseň až na hotovém
    dílu. Vytyčení ustoupí, jakmile práce dílu začala. Brány vyšších stupňů jako u palisády,
    klešťová brána a věž – níž (Ú18).
  - **Stáří a průlom:** dřevo šedne podle `woodTint(stáří, druh)` (životnost druhu), plenta
    a čelní zeď nestárnou; za životností díly řídnou podle stavu úseku, v průlomu chybí.
  - **Zemina hradeb** (`wallCoreMeshData` v `rampart-mesh.ts`, `wallCoreAt`, `wallCoreProfile`):
    průřezy po 1,5 m obvodu se stejným počtem sloupců pro všechny druhy
    (`WALL_CORE_COLUMNS`), v bráně a ve zbořené části nic; kus bez zeminy se nekreslí. Hlína
    a tráva jako val – sítě `village-fort-core-<id>` a `…-grass-<id>`.
  - **Ukázka:** `/dev/buildings` – tlačítko **Hradby** (`SHOWCASE_WALLS`): ochoz, roštová,
    komorová (12 let), ochoz na valu, staveniště roštové a komorové.
- **Val vně, vodní příkop, klešťová brána a věž** (fortifications.md – Hradby a obrana, Druhy
  a Brány; plán hradeb Ú18):
  - **Val vně hradby** (`rampartOutside` – vrstvy dílu z jádra, `segmentRampart` →
    `SegmentBuild.rampart.outside` / `water`): týž průřez valu posunutý o `rampartOutside.outM`
    (7 m) ven – příkop 7–3 m vně křivky (osa 5 m vně), koruna na křivce (`RampartLook.offset`).
    Hradba stojí na místě (čára kůlů, plenta) a zvedne se o korunu po dílech (`crownLift` – kde val
    není, 0); pod širší hradbou se koruna rozšíří (`RampartLook.wide` = `segmentBand.inM` − 3 m,
    vnitřní svah se posune dovnitř), násyp ochozu na valu není – sloupky a schůdky stojí na valu
    (`rampartGround`). Síť valu, prořez příkopu (`ditchCuts`) a vytyčení běží po dílech, ne podle
    druhu opevnění. Doplňovaný val (`fortWork: 'rampart'`) roste s prací dílu a hradba na něm stojí
    dál (staveniště valu vně – vytyčení okrajů jeho pásu). Návrh Clauda: jádro hradeb pod širokou
    korunou se zvedá vcelku jako na valu na křivce.
  - **Voda v příkopu** (`moatWaterRuns`, `moatWaterLine`, `moatWaterMeshData`): hladina po
    souvislých kusech dílů s napuštěným příkopem (`moatDay`) a hotovým valem, jen kde je příkop
    hlubší než 0,6 m (průchod brány – hráz); rovná napříč, 0,5 m pod okrajem plného příkopu
    (u nižšího valu nejvýš 0,35 m), okraje zasunuté do stěn příkopu. Síť `village-fort-moat-<id>`
    s PBR materiálem s oparem (`applyGammaFog`), nevrhá stín.
  - **Led** (`moatIceOn(dayOfYear)` – měsíce `moat.frozenMonths` jako `moatFrozen` v jádru; Martin 8. 11. 2026: „Má zamrznout“): `VillageRenderer.setSeason` → `FortificationRenderer.setSeason`
    vymění materiál hladiny za led jen při změně (vrátí true → `needsRender`).
  - **Klešťová brána** (`SceneFortification.gateLooks` z `sceneFortGates` ve `fort-view.ts` –
    ulička z jádra `pincerAlley` od vnitřního okraje pásu blokujícího dílu, druh `pincerArmKind`,
    stáří a průběh stavby brány; `pincerGateInstances`): ramena od čáry hradby po vnitřní konec
    uličky – u palisády palisáda s ochozem (kůly k uličce, fošny na sloupcích, schůdky u konce),
    u roštové a komorové kamenné čelo s ochozem a předprsní na koruně. Rozestavěná ramena rostou od
    ústí; vrata (kůly, křídla, trám) na vnitřním konci až na hotové bráně – pak v pásu zůstanou
    jen kůly a trám (`fortGateInstances`).
  - **Věž nad branou** (`towerInstances`, díl `tower`): stojící věž (`gateTowerStands`) nad vraty
    – střed na vnitřním konci uličky, natočená podél tětivy, dřevo šedne podle `tower.lifeYears`;
    rozestavěná se nekreslí (návrh Clauda).
  - **Ukázka:** `/dev/buildings` – tlačítko **Brány** (`SHOWCASE_GATES`): palisáda s valem vně
    a vodou v polovině příkopu (tlačítko Zima – led), ochoz s valem vně, klešťovou bránou a věží,
    palisáda s klešťovou bránou (vrata zavřená), roštová s klešťovou bránou a věží a palisáda,
    ke které se val vně dosypává. Ukázka prořízne příkopy nejblíž cíli kamery (`setView`).
  - **Hradba na koruně valu** (Martin 9. 11. 2026: „Pokud se jedná o palisádu nebo polský plot,
    má stát na koruně valu“): scéna vsi ji tak kreslí – na valu na křivce kůly na koruně 7 m od
    křivky, na valu vně na místě zvednuté o korunu (`crownLift`, ověřeno snímkem 9. 11.: kůly
    stojí na koruně, průchod valem v bráně). Scéna boje (`army.ts`) bere čáru hradby z bojiště
    (`battleWallsOf` – u valu na křivce koruna, dřív vnější okraj příkopu, kde lezci a žebříky
    zvednutí o val viseli nad příkopem).
  - Testy `__tests__/rampart-mesh.test.ts` a `fortification-layout.test.ts` (klešťová brána).
- **Výkon** (`measure-scenery-culling.ts`, Vlkov 1138310652): palisáda 355 m (6 × 6 čtverců,
  2 brány) = 1376 instancí v 6 dílech, 39,9 k trojúhelníků a 6 draw callů kamery (+ 6 do stínové
  mapy); s ořezem 16 × 16 je opevnění kolem vsi v záběru celé (odstup 60, 120 i 400 m – 100 %),
  ořez pomůže, až je ves mimo záběr. Val stejného obvodu 8,3 k trojúhelníků ve 2 sítích, plot
  nepřidá žádný draw call (sdílené instance pleteného plotu). Les a dekorace krajiny pro
  srovnání: 0,1–1,5 M trojúhelníků a 41–86 draw callů podle odstupu.

## Rozebírání a opuštěné stavby ve scéně (demolition.md – Rozhraní; Ú11)

Scéna nemá nové modely – **rozebírání = fáze staveniště pozpátku** (návrh Clauda). Pomocné čisté
funkce jsou v `apps/web/lib/demolition-view.ts` (`demolitionLooks`, `demolitionSiteProgress`).

- **Zdroj:** stavba `Construction` druhu `demolition` (`demolition.structure/id`); průběh je
  `buildProgress` z `summary.constructions` (po setinách – scéna se přestaví jen při změně).
- **Obydlí a modla/svatyně:** bouraná stavba se ve scéně nahradí **záznamem staveniště** s
  `built: false`, `progress = 1 − průběh`, `demolition` (průběh) a **`id` = id stavby bourání** (ne
  stavby). Kreslí ji tedy existující cesta staveniště (`constructionState(kind, progress)`,
  `dwellingKey` po 2 %, `sacredBuildingKey`) a práce vesničanů (`LaborTarget { kind: 'site', id }`
  z `labor-report.ts`) najde dům v `ctx.houses` bez změny `villager-plan-sites.ts`.
  `sceneVillage` (obydlí) a `sceneSacred` (modla, svatyně) v `village-view-scene.ts` a
  `village-view-buildings.ts`.
- **Ohrada:** `ScenePen` zůstává (`built: true`, zvířata a stoh pryč), nese `demolition` a
  `demolitionSite`. `scenePenViews` dá `PenView.progress = 1 − demolition` (max 0,999) – `penStage`
  ubírá plot po fázích stavby; v `villager-plan-cast.ts` je ohrada `House` s `id = demolitionSite`
  a `built: false`, takže bouračka stojí kolem plotu jako na staveništi.
- **Kreslí se jen při změně:** klíče (`dwellingKey`, `sacredBuildingKey`, klíč ohrady) nesou
  průběh po 2 % (ohrada po 0,25 %); bez změny klíče se nic nepřestaví a `needsRender` se nesáhne.
- **Opuštěné stavby** (`disusedDay`, `wear.abandonedDay`) nepotřebují nic nového: modla a
  svatyně i ohrada nesou `condition` z `structureCondition(wear, …)` (a `abandoned` u modly a
  svatyně) a scéna volí stupeň rozpadu z `structure-decay.ts`; vyklizené obydlí chátrá přes
  `condition` a `inhabited: false` (`dwelling-decay.ts`). Hranice stupňů jsou beze změny.
- **Humno (Ú7):** bourané humno je záznam `SceneThreshingFloor` s `built: false`, `progress = 1 − průběh`,
  `demolition` a `id` = id stavby bourání (stejný trik jako obydlí); renderer humna i `floorPhase`
  fáze staveniště bez změny, práce vesničanů jde na `threshingFloorSite`. Pohled
  (`threshingFloorsOf`) pak nese stejné id a `use.demolishing`, takže jde bourání zrušit. Opuštěné
  humno nemlátí a nemá hromadu zrna. **Jáma a sad:** pro bourání bez vlastní animace (sad zmizí
  po dokončení, jáma také); opuštěná jáma se kreslí jako prázdná (`fill` 0, `visiblePits`).
- **Chování na začátku:** při průběhu 0 (práce ještě nezačala) je stavba hned celé staveniště
  (`progress` 1) – rozdíl proti hotovému modelu je jen v dílech staveniště, ne v tvaru.
- Test: `apps/web/lib/__tests__/demolition-view.test.ts`.
