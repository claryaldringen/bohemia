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
  a jeho ženy s dřevěným kůlem; sítě po vzhledu a velikosti) a staré hroby (`graves` – pohřbení před
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
  načtou až s prvním sadem.
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
  jako náhled zelené a zralé obilí a strniště (`CropLook` / `crop` dílu v `SceneVillage`, server
  ho zatím neposílá), hřbitov vytyčení → kůly → plot → přibývající mohyly podle významu
  (`showcaseMounds` – místo vybírá jádro), sad vytyčení → kůly
  → sazenice → rostoucí stromky → jablka. Vpravo vzadu dílna tesaře a pahorek s vozy (**Vozy**,
  **Další vůz zblízka**, **Sledovat vůz** – Vozy se spřežením níž).
- **Spřežení na poli** (oxen.md – Spřežení zůstane na poli, 24. 10. 2026): orba za herní den
  (`PLOUGH_DAY_DEBUG`) jede po pruzích dne celý den bez ranní cesty a večerního návratu; cesty
  dne posílá `village-view` v `SceneVillage.ploughLegs` (`out` – výjezd / přesun, `home` –
  návrat, `stand` – den bez orby, stojí na čele) a `ploughRoute` je přidá jen ve dny, kdy k nim
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
  prut). Vlasec a splávek až ve scéně.
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
  (`forestEdge`, −7 až +5 m jako prasata vsi, ≥ 45 m od obydlí), **louka** (`pasture`, ≥ 55 m od
  obydlí, i strniště – díl `look: 'stubble'`), **kraj vsi** (22–60 m od obydlí – liška) a **díl se
  škodou** (`topPartId`, červen–srpen; na sousední díly smí). Nikdy ve stavbě, na poli (mimo díl
  se škodou), na hřbitově, v sadu, ohradě ani ve vodě (`free` – schůdná zem a kruhy staveb přes
  přihrádky). Skupiny (`wantedGroups`): rota prasat (v létě na dílu se škodou, jinak okraj lesa),
  laně s kolouchy (na dílu se škodou, když tam nejsou prasata) a jeleni zvlášť – v říji
  (září–říjen) spolu, zajíci každý zvlášť, liška, vlci jen v zimě (prosinec–únor), medvěd
  duben–listopad. Skupina je `Herd` dobytka s trasou ≤ 3 stanovišť 14–34 m od sebe, skupiny
  ≥ 40 m od sebe; kusy v kruhu 2,5 + 0,55 m na kus (osamělé zvíře se toulá do 3 m). Když se
  skupina na díl se škodou nevejde, zůstane na okraji lesa. Bod trasy se přijme jen tehdy, když
  je volná i úsečka z předchozího bodu (vzorky po 4 m, `segmentFree`) a okruh toulání kolem něj.
- **Hra zatím nemá noc** (den a noc jen `/dev/landscape`) – zóny „za soumraku a v noci louky“
  se řídí jen měsícem; noční louky a liška za soumraku až s denní dobou ve hře (návrh Clauda).
- **Pohyb** (`wildlife-motion.ts`): pastva a stěhování po trase jako stádo (`herdState`,
  `herdAnimalPose`, skutečný čas `livestockClock`) s chůzí nejbližšího dobytka (prase → prase,
  jelen a laň → kůň, kolouch → hříbě, vlk a liška → koza, medvěd → kráva, zajíc → slepice).
  Vzácní jsou vidět jen v podílu 20minutových úseků skutečného času (`wildPresent` – vlci 35 %,
  medvěd 30 %, liška 60 %); jinak se zapíšou s nulovým měřítkem. **Útěk** (jen scéna): člověk
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
  koně u kůlu vedle sebe. `rideBlocks` – bloky jízdy z hodin jádra (`DRILL_BLOCKS_H` 8 a 14 h, po luku a boji jako
  `drillAt`). `rideState` – jede jen v bloku (`isRiding`): od kůlu po trase a v půlce bloku zpět,
  takže blok začíná i končí u kůlu; mimo blok jezdec cvičí na dvorku (`lordFigures`) a kůň je
  v ohradě, mezi bloky ho `livestock.ts` skrývá (`Group.hidden`). Jízda k hranici a doprovod se
  do bloku nevejdou – jen vyjedou a vrátí se, neprojedou celou trasu (známé omezení, doprovod
  není sladěný s karavanou; horses.md – Kdy jsou jezdci venku). Plány jdou přes `DraftCrew.rides` → `VillageVillagers.rides()`
  → `onCrew` → `VillageLivestock.setRides`.
- **Kreslení a buffery:** jezdec = instance `villagers-man` s klipem `ride` / `ride-trot`
  (`riderPose`), zvednutá o výšku sedu `RIDER_SEAT_M` × `RIDE_HORSE_SCALE` přes `VillagerPose.lift`
  – jen posun matice, **žádný vertex atribut** (8 bufferů jako dosud). Kůň = skupina `horse`
  v `livestock.ts` (`rideHorsePose` – krok a klus morph targety jako kráva, 7 bufferů). Stojící kůň
  (`Group.still`) se zapíše jednou a překreslení nenastavuje, jedoucí ano. Bez sedla (horses.md).
- **Výběr:** klik na jezdce nebo koně vybere člověka (`pickPersonHit` od země – průmět kryje koně
  i jezdce), kroužek ho sleduje.
