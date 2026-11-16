# Válka – kód

Pravidla: [docs/design/war.md](../design/war.md). Hotová je síla vojska a stropy výcviku
(Ú6.1), válka mezi rody s ochranou nováčka a opovědí (Ú6.2), mírové jednání (Ú6.3), pohyb
vojska mapu po mapě (Ú6.4), tažení po taktech, boj a dohra (Ú6.5–Ú6.17) a boj u hradby
(plán hradeb 2026-11-08 – obránci na hradbě, prolomení, brány, NPC velitel).

## Stropy výcviku

- `ARMS_CAPS = { home: 50, hunt: 70, war: 100 }` v `domain/village/rules/rules-lord.ts` (war.md – Síla).
- `trainingCap(person, day, source)` v `lord.ts` – menší z věku (`armsCap`) a zdroje. `trainLordDay`
  cvičí doma se stropem 50, v den lovu (jezdec, pěší syn) se stropem 70; válka (100) zatím nikoho
  necvičí.
- `domain/village/people/arms-caps.ts` – `withArmsCaps(state)`: dovednosti (i `best`) nad 70 jednou stáhne
  na 70; příznak `VillageState.armsCapped` zaručí, že se válečná zkušenost nad 70 už nesráží.
  Volá se v `advanceVillageSteps` (`simulate.ts`) vedle ostatních `with…` převodů.

## Síla

- `domain/war/rules-war.ts` – `WAR` (čísla war.md – Čísla; čísla opevnění jsou ve `FORTIFICATIONS`).
- `domain/war/strength.ts` – `militaryExperience` ((boj + luk) ÷ 2), `lineManStrength` (muž rodu,
  kůň přes `riderPower`), `villagerStrength` (0,4, nucený × 0,5, štěstí přes `happinessLaborFactor`),
  `armyStrength` (součet × výzbroj, pokrytí nástroji z `craftCoverage(...).tools`).
- Soubory ve `domain/war/**` jsou v `eslint.config.mjs` mezi deterministickými (jen `det-math`).

## Válka mezi rody, ochrana, opověď (Ú6.2)

- **Data:** tabulky `war` (seřazená dvojice `house_low` < `house_high`, `how` declared | ambush,
  `status` active | peace | quiet | extinct, `started_at`, `started_day`, `last_clash_day`; částečný
  unikátní index = jediná aktivní válka na dvojici), `war_attack` (kdy rod poprvé sám napadl) a
  `war_protection_notice` (upozornění na konec ochrany jednou na rod); migrace `0029_war`. Port
  `WarRepository` / `WarTx` v `application/wars.ts`, adaptér `war-repository.ts`.
- **Ochrana** (`domain/war/protection.ts`): `houseProtectedUntil(house, ownAttackAt)` = 7 skutečných dní
  od založení rodu, vlastní opověď nebo útok ji ukončí (`markAttack`); `villageProtected(state, day)`
  = totéž co ochrana před pohromami (`inDisasterProtection`, 5 herních let). `protectedReason` skládá
  „Ctibor je pod ochranou ještě 3 dny.“.
- **`declareWar`** (`application/declare-war.ts`): ověří ochranu napadeného (jméno hlavy rodu, dny),
  běžící válku; s požadavkem nebo vzkazem otevře jednání (`openNegotiation` s řádkem `war-demand`),
  pak založí válku, ukončí vlastní ochranu, pošle upozornění `war-declared` a zapíše kroniku
  (`war-chronicle.ts`, neutrální). Válka uvnitř stromu vazalství je dovolená.
- **`war-demand { items }`** (`domain/negotiation/war-demand.ts`, účinek v `negotiation-effects.ts`):
  jediný řádek kola; smí nést jen přísahu, dávku, službu a odměnu (podmínky bez přísahy nic neurčí).
  Přijetí (`acceptNegotiation`) = aktivní válka mezi stranami končí `peace` a vnořené řádky se
  provedou stejným registrem; neběží-li už válka, přijetí selže. Protinávrh k opovědi smí být jen
  mírové jednání (`peace`, Ú6.3), jiný se odmítne důvodem „Na opověď se odpovídá mírovým jednáním.“.
- **`startWarByAttack`** – přepadení: zavolá ho tažení při prvním útoku; chráněný rod odmítne, běžící
  válce jen posune `last_clash_day`. Nová válka (opověď i přepadení) pošle domů výjezd vojvody, který
  stojí na mapě protivníka nebo tam míří (`WarDeps.journeyRecall` → `recallJourneysAtWar`,
  `docs/code/journey.md` – Worker). **`quietWars`** – 3 herní roky bez střetu → `quiet` + kronika
  „Válka s Bořivojem utichla.“. **`notifyProtectionEnding`** – upozornění `protection-ending`. Obě
  úlohy jedou v `runWorldTasks` (`deps.wars`, worker je zapojuje). `endHouse` ukončí války vymřelého
  rodu (`extinct`).
- **Web:** horní lišta – zkřížené oštěpy s počtem válek (`war-toggle`, `war-count`) a štít s hodinami
  se zbývajícími dny (`protection-shield`); `WarPanel.tsx` – textový přehled válek (z `HouseView.wars`);
  `HousePanel` – tlačítko opovědi (`house-war`, zašedlé s důvodem z `actions.war`), formulář `TermsForm`
  s volitelným požadavkem vazalství a vzkazem; server action `declareWarOnHouse`. Ikony
  `house/spears.png`, `house/shield-hourglass.png`.

## Mírové jednání (Ú6.3)

- **`peace`** (`domain/negotiation/{types,peace}.ts`): jediný řádek kola mezi stranami **aktivní války**
  `{ fee?, payer?, vassalage?: { lord, vassal, terms }, tribute?: { goods, payer }, cede?, releasePrisoners? }`;
  všechno volitelné, mír bez podmínek smí. Otevře, protinávrhuje, přijímá a odmítá se jako běžné jednání
  (`openNegotiation` / `counterNegotiation` / `acceptNegotiation`; stejně jako `war-demand` nepotřebuje
  přísahu ani dohodu). `checkPeaceItems` hlídá tvar (poplatek smí být zboží i lidé (ne robota; `answerTrade` je u `fee-send` povolí jako u rozsudku), tribut jen zboží bez lidí, plátce je strana,
  vazalství mezi stranami), `checkPeaceRound` v `negotiate.ts` navíc běžící válku a postoupení vsí.
  `termLinesOf` řádek míru nezahrnuje.
- **Přijetí** (`PEACE` účinek v `negotiation-effects.ts`, v transakci): válka `peace` (`wars.end`, souběžné
  přijetí = jediný mír), vazalství z míru s původem `peace`. Po transakci: dialog poplatku, postoupení vsí
  a kronika obou rodů (`chronicleWar`, neutrálně).
- **Poplatek:** dialog `fee-send` plátci (jedinečný klíč `fee:<jednání>:<rod>`, cíl = ves hlavy příjemce),
  odpověď je táž jako u obchodu (`answerLevy` → `answerTrade`): celé, míň, nic; poslané zboží jde
  `sendShipment`. Plátce dostane upozornění `levy-pending` s `peace`.
- **Tribut:** nemá vazalství, proto se nečte z `vassalage`, ale z přijatých jednání
  (`NegotiationRepository.peaceTributes()`, `peaceTributeOf`). `openAnnualDialogs` (`tributes` v
  `AnnualLevyDeps`, worker je zapojuje) otevře plátci 1. 11. dialog `tribute-send` (klíč
  `tribute:<jednání>:<rok>`; rok i den přijetí ve dni plátce – posun času hráče); mír přijatý až po 1. 11. se ptá příště, čekající dialog jen naroste o rok.
  Neplnění se nevymáhá, ale zapíše se (`tributeBreach` v `annual-levies.ts`): míň než domluveno při odpovědi
  i každý zmeškaný 1. 11. → kronika obou rodů `tribute-short` a – trvá-li mezi nimi vazalství plátce → příjemce –
  `addBreach('levy')`.
- **Postoupení vsí** (`application/cede-village.ts`): `checkCede` – všechny vsi patří jedné straně a
  postupujícímu **zbývá živá ves na jiné mapě** (jinak `PEACE_REASONS.lastVillage`, „jen vazalství“;
  Martin 2. 11. 2026). `cedeVillages` po transakci: muži rodu (`isLineMan`) všech vsí postoupených
  map odejdou s rodinami (`departAppointee`) do nejbližší živé vsi postupujícího – událost `lord-arrives`
  ve schránce cílové vsi (`ref cede:<jednání>:<ves>:<muž>`), pak převod držitele po celých mapách
  (`transferVillages`, zámky postupně, jako odúmrť) a zapnutý správce (`setStewardOn`) ve vsích. Je
  idempotentní. Háčky `CedeHooks` (`check`, `apply`) skládá `createGameDeps` (`deps.cede`).
- **Propuštění zajatců:** `releasePrisoners` se zatím jen nese (kontrola tvaru); zajetí přijde v Ú6.11.
- **Web:** `WarPanel.tsx` – u každé války pečeť **Nabídnout mír** (`war-offer-peace`) a mini-formulář
  (`peace-form`: poplatek (obilí a lidé – `peace-fee-men/women/families`), tribut, vazalství; `peace-send`); řádek `term-row-peace` (`TermsForm.tsx`)
  v kartě jednání; `parsePeace` v `lib/house-input.ts`. Dialogy poplatku a tributu zobrazuje `LevyDialog`.

## Pohyb vojska (Ú6.4)

Čistá doména, jen det-math (`domain/war/**` v `eslint.config.mjs`); čísla ve `WAR.pace`,
`WAR.march`, `WAR.snowPace`, `WAR.frost` a `rampartPace(výška)` (`fortification/assault.ts`).

- **Mřížka** (plán 2026-11-16-dense-forest – Rozhodnutí 1–4, Úloha 4) – `domain/war/march-grid.ts`:
  `marchGrid(landscape, obstacles, village, { day, closedGates })` → `MarchGrid` (buňky
  `WAR.march.cellM` = 2,5 m přes celou mapu 1 920 m, 768 × 768 – brána měření; `pace` = násobek
  tempa, 0 neprůchodná; `flags` `MARCH_*`). Hledání zná jen průchozí a neprůchozí, tempo buňky
  platí jen pro chůzi. Pořadí skládání:
  1. **terén krajiny** – `march-terrain.ts` `marchTerrain` (jednou na krajinu, `WeakMap`): buňka do
     půl úhlopříčky od vody (potok a všechny řeky – řeka prémiové krajiny i řeky kostry světa,
     soutok; `watersCenterline`, landscape.md – Osa vod víc řek) je voda – krok mezi středy ji
     nepřeskočí; brod = mělčina potoka či řeky (`StreamSample.shallow ≥ WAR.march.fordShallow`;
     řeka kostry má 1–2 brody – world-skeleton.md – Kde všude kostra působí; úzký brod chodců
     `FORD` v `paths/terrain.ts` v krajinách nevychází); sráz nad `PATH_SLOPE_MAX`. Předběžná síta
     výsledek nemění (test „terén se sítem = terén bez síta“, seedy 1–3): voda se přesně počítá jen
     u buněk, jejichž bod hrubé sítě po 10 m leží blízko břehu, sráz jen tam, kde ho dovolí mez
     spádu čtverců výšek 3 × 3 kolem (výška je bilineární mezi středy políček). Průsek **stezky
     krajiny** (`landscapeTrailLines` v `trade/premium-route.ts` – osa prvku `route` prémiové
     krajiny, jinak úseky `skeletonFeaturesOf(l).route.legs`; tytéž zdroje jako
     `withSkeletonRoute`) je v terénu – pás `BASE_TRAIL`, osa `BASE_AXIS` (`supercover`), buňky
     v `MarchTerrain.trail` –, takže platí i na mapě bez vsi;
  2. **hustý les** (`MARCH_FOREST`, neprůchodný – forest.md – Hustý les) – vnitřek lesa
     `forestInterior` (`dense-forest.ts`: pole lesa > `WAR.march.denseForestM` = 10 m; krajina bez
     lesního políčka pole lesa nestaví) bez pasek vsi `withoutClearings(…, villageClearings(…))` –
     jen s vrstvou překážek a vsí, bez vrstvy celý vnitřek krajiny. Paseka je i pás opevnění (každý
     úsek, i rozestavěný – village-core.md – Vymýcený les (jádro)); `withoutClearings` bere buňky se
     středem v pasece a u plochy i buňky jejích rohů – úzký pás plotu (1 m) středy buněk mine.
     Voda, brod a sráz uvnitř hustého lesa mají tempo podle terénu a `MARCH_FOREST` navíc (průsek
     přes ně má dohled a šelmy hustého lesa);
  3. **skály** (`MARCH_ROCK`, neprůchodné) – balvan a skalní výchoz vrstvy překážek do poloměru
     jako u pěšin (`obstacleBlockRadiusM` v `paths/terrain.ts` – `OBSTACLE_COST` s cenou Infinity;
     a vždy buňka, ve které překážka stojí – i poloměr 1,25–1,77 m, kdy středy okolních buněk leží
     za ním; `marchRocks` jednou na terén a vrstvu); kámen, který ves odstranila
     (`obstacleChangesAt`), neblokuje;
  4. **průseky** (`MARCH_ROAD`, tempo `WAR.pace.road` × 1,5) – stezka krajiny z terénu a pevné
     cesty vsi (`village.roads.roads`, i úseky zemské stezky): pás `ROAD_SWATH.halfM` (3,5 m) kolem
     osy (`swathCells`) je průchodný i hustým lesem a `MARCH_FOREST` na něm zůstává (dohled 50 m,
     šelmy); vodu, sráz a skálu ruší jen buňky osy (`supercover` – po stranách souvislé, rohem obě
     buňky) – lávka, hať a brod jako dřív. Stejně (`openLine`; Úloha 4b – Rozhodnutí 13) **kus ke
     kraji** hotových stezek vsi (`edgePieces` – úsečka konec osy → bod okraje výstupu
     `trailExitsOf` – výstup má jen stezka s koncem v pásu `TRAIL_END_BAND_M` = 30 m u kraje –
     dostavěný před dnem mřížky) a **osy
     pokračování** stezek sousedních vsí (`options.trailContinuations` – i na mapě bez vsi; osy
     odvodí jen server – `trail-continuation.ts`, prohlížeč je dostane jako data). Pokračování:
     `CampaignMap.trailEntries` (`TrailEntry` { `point`, `builtDay` } – vstupy z výstupů stezek vsí
     8 sousedních políček, `trailEntriesOf`; skládá `createCampaignCells`, village-trade.md –
     Pokračování na sousední mapě) → `continuationsOf(mapa, ves, den)` – vstupy s `builtDay < den`
     (Review Focus 6), branka dvorce první vsi mapy; bez vstupů `NO_CONTINUATIONS`. Osu
     `trailContinuations` vede po terénu stezek k brance, bez ní k nejbližšímu místu největší
     souvislé oblasti mřížky mapy bez vsi (`largestRegion` v `march-search.ts` – 1 = buňka
     největší oblasti `marchAreas`, remíza oblast s nižším indexem buňky). Mřížku s pokračováním
     skládají `gridOf` (`campaign-tick.ts`), `mapGrid` (`campaign-view.ts`) a `gridOn`
     (`expedition.ts`); `MarchGridMemo.gridOf(…, day, continuations = NO_CONTINUATIONS)` má další
     úroveň `WeakMap` podle identity pole os (paměť `trailContinuations` vrací pro tentýž vstup
     tentýž objekt);
  5. **stavby vsi** (`blockBuildings`, `MARCH_BUILDING`, tempo 0) – obdélníky `villageBuildings`
     jako u pěšin (obydlí s pozemkem, dvorec, dílna s dvorem, staveniště, milíř, modla, humno):
     buňka se středem do `WAR.march.buildingClearanceM` (1 m) od obdélníku – mezera mezi domy
     širší než 2 m zůstane průchozí (D55); hotová ohrada celou plochou plotu kromě branky; pole
     průchozí tempem louky. Přednost před průsekem;
  6. **opevnění** (`fortCells`, kód beze změny – počítá obecně nad `cellM`): hotový plot, palisáda
     a val se stojící nástavbou neprůchodné, val bez nástavby tempem `rampartPace(výška dílu)` =
     1 ÷ (1 + 3 × v) (plný val ¼) – buňka, která zůstala hustým lesem bez průseku (bez vrstvy
     překážek pasek není), jen `MARCH_RAMPART` s tempem 0, val průchod lesem neotevře; průchozí
     otevřené brány (zavřené v `closedGates`) a mezery
     (`segmentIsGap` – nedostavěný, shnilý, prolomený úsek celým pásem). Buňky přes `fortWalls`
     a `fortWallCells` (pěšiny); buňka, které se dotkne průchod, stěnou není.

  Start uvnitř stavby unikne do nejbližší volné buňky, cíl uvnitř stavby přesune `outOfBuilding`
  (Únik z neprůchodné buňky níž); v boji (`battle.ts` `paceAt`) stavby neblokují. Výkon
  (Apple M1 Pro, seedy 1–3): terén 64–100 ms a vnitřek lesa 60–90 ms jednou na krajinu, mřížka
  vsi a dne 1,6–3,3 ms, oblasti 1,3–1,9 ms.

- **Trasa** (plán 2026-11-16-dense-forest – Rozhodnutí 5–7, Úloha 2) – `domain/war/march.ts`:
  `marchPath(grid, from, to)` = nejkratší průchozí cesta ve třech krocích:
  - **hledání** `gridSearch(grid, start, goal, toward)` v `march-search.ts` – rovnoměrná cena:
    krok rovně `STEP_STRAIGHT` (1000), úhlopříčně `STEP_DIAGONAL` (1414 tisícin buňky), odhad
    `octileCost`; průchodná je buňka s `pace` > 0, start vždy; úhlopříčně jen kolem průchodných
    rohů. Tempo buňky se pro hledání nepočítá – trasa les ani val neobchází a cesty sama
    nevyhledává. JPS bez řezání rohů (brána po Úloze 1 – stejná cena jako A*, přes mapu ≈ 3,4×
    rychlejší); skoky se rozvinou na souvislý řetěz buněk. Klíč haldy f × 2²² + (2²² − 1 − g) –
    při stejném f dřív hlubší uzel; ze stejně drahých předchůdců vyšší index. Průchodnost = štítky
    oblastí s okrajem (`marchAreas` – bez kontroly mezí mapy), pracovní pole jedna na proces
    s razítkem běhu;
  - **vyhlazení** na dohled `smoothCells(grid, cells, from, to)` v `march-smooth.ts` – kandidáti
    jsou zlomy řetězu a cíl, dopředný hladový tah od kotvy, dokud je kandidát na dohled
    (`lineOfSight` – průchod buňkami Amanatides–Woo; přesně rohem musí být průchodné obě buňky);
    bez dohledu z přesného bodu přes střed buňky kotvy;
  - **úseky podle tempa** `pathAlong(grid, points)` – na hranici změny tempa přibude bod, `meadowM`
    je součet `quantizedStep(délka ÷ tempo)` po kouscích, takže `marchProgress` je přesný;
    neprůchodná buňka (únik, vstup do stavby) tempem louky 1.

  **Dosažitelnost předem:** `marchAreas(grid)` – jedno pole štítků s okrajem jedné buňky na
  mřížku (WeakMap): štítek > 0 = průchodná buňka a číslo její souvislé oblasti (oblasti po indexech
  první buňky), 0 = neprůchodná a okraj; hledání ho čte jako průchodnost. `Uint16Array`, nad
  65 535 oblastí `Int32Array`; číslo buňky `marchArea(grid, c)` / `marchAreaOf(areas, width, c)`.
  Úhlopříčný krok vede jen kolem průchodných rohů, oblasti jsou proto tytéž jako po 4 sousedech
  – počítají se po úsecích řádků se sjednocením. Paměť mřížky 2,5 m: `pace` + `flags` 3,38 MiB
  a štítky 1,13 MiB = 4,5 MiB (dřív s oblastmi `Int32Array` a průchodností s okrajem zvlášť
  6,2 MiB). Nedosažitelný cíl by hledání
  vyčerpalo celou oblast (na jemné mřížce desítky ms), proto `marchPath` i `marchPathToEdge` vrátí
  null bez hledání. `marchReachable(grid, from, to)` = `marchPath` ≠ null bez hledání – i pro
  kurzor v prohlížeči. `reachableCells` (zaplavení z buňky, start vždy průchodný) je
  v `march-search.ts`.

  `marchPathToEdge(grid, from, direction, arrival?)` vede k nejbližší buňce okraje, pro kterou
  platí `arrival(c)` (chybí = každá), úhlopříčně do rohu; skupina v takové buňce okraje jde rovně
  do jejího středu. Oblasti s průchodnou buňkou přechodu se poznají předem z `marchAreas` – bez
  nich null bez hledání. `MarchPath` = body (start a cíl přesně, mezi nimi zlomy a hranice tempa),
  buňka každého bodu, `meadowM` (metry louky od startu) a `lengthM`; `marchSeconds(path, speed)`,
  `marchProgress(path, meadow)` (poloha po ušlých metrech louky).

- **Únik z neprůchodné buňky** (Rozhodnutí 7) – start v neprůchodné buňce (hustý les ze starého
  bodu, dorostlý les, stavba, nová palisáda): první úsek vede rovně do středu nejbližší průchodné
  buňky (`departureOf`; `nearestPassable(grid, c, maxM)` – čtverec vzdálenosti v buňkách, remíza
  nižší index). **Ze stavby a ze stěny opevnění jen do ní** (oprava Úlohy 5; stěna – palisáda
  postavená pod skupinou – re-revize, jinak by únik pustil skupinu dovnitř zavřeného opevnění): střed dvorce je stavba a únik do
  „užitečné“ oblasti vedl dvorcem a lesem do oblasti za ním – z kotvy Vlkova na západ 13 m přes
  dvorec, v pasece obklopené hustým lesem 400 m lesem; tažení z kotvy a výprava od branky se
  neshodly. Mimo stavbu (voda, les ze starých poloh) má přednost nejbližší buňka souvislé oblasti,
  se kterou skupina něco svede (Úloha 5, návrh Clauda) – `marchPath` a `marchReachable` oblast
  cíle, `marchPathToEdge` oblast s průchodnou buňkou přechodu, `reachableGoal` oblast nejbližší
  průchodné buňky k cíli –, ale nejvýš `BUILDING_REACH_M` (40 m) dál než nejbližší průchodná buňka
  (ta bývá paseka nebo ostrůvek, odkud by nevedlo nikam); dál ne – únik by byl průchod lesem. Cíl
  neprůchodný (oblast 0) nebo žádná oblast s přechodem – null hned, bez úniku (dřív prstence přes
  celou mapu). Únik se nevyhlazuje; pak běžná trasa. Stojí-li skupina na průchodné buňce, neuniká –
  i v pasece zůstane. Vesnice vyráží od branky dvorce (`villageGate` – Plán tažení), ne ze stavby. Cíl ve stavbě přesune `outOfBuilding` na nejbližší průchodnou buňku nejvýš
  `BUILDING_REACH_M` (40 m) daleko; poslední úsek vede z jejího středu rovně do cíle. Cíl ve stejné
  buňce jako start – rovně.
- **Přechod okraje** (plán 2026-11-16-dense-forest – Rozhodnutí 8; `movement.ts`) – `planMoverLeg`
  hledá úsek k okraji jen do okrajové buňky, jejíž protějšek na sousední mapě (`edgeCrossing` středu
  buňky) má na mřížce `gridOf(route[0], den)` tempo > 0 – skupina tak nikdy nepřejde do hustého lesa
  ani do vody sousední mapy (Review Focus 4). Napřed jen do souvislé oblasti, odkud se jde dál
  (`onwardArea`, návrh Clauda po kontrole Vlkova): na mapě cíle oblast nejbližší průchodné buňky
  k cíli, na mapě po cestě oblast s průchodnou buňkou okraje směrem k `route[1]` (`crossingAreas`
  v `march.ts`); není-li takový přechod, kamkoli průchozího. Nejbližší průchozí protějšek bývá kapsa
  u okraje – vojsko Vlkova by na východ přešlo 215 m jižně od stezky na louku odříznutou hustým
  lesem a uvízlo. Pokračování zemské stezky je v mřížce sousední mapy průsekem, filtr ho vidí bez
  změny. Mapu `route[0]` načte předem `missingMaps`; mapu i ves sousední mapy teď čte už úsek
  k okraji (dřív až takt přechodu) – chybí-li, takt počká (`MissingData`).
- **Uvíznutí** (Rozhodnutí 8; Martin 16. 11. 2026: „Má zůstat stát.“ – žádná objížďka přes jiné
  mapy) – když úsek spočíst nejde (okraj bez průchodu na obou stranách, nedosažitelný cíl),
  `stepMover` vrátí `stuck` a zapíše `stuckDay` = den (`Mover`, `CampaignGroup`, `AlarmMover` –
  posel i skupina uprchlíků). Týž den už úsek nehledá – mřížku ani mapu nečte (Review Focus 3:
  uvízlá skupina by jinak spálila hledáním na jemné mřížce čas workeru každý takt). Volající pohyb
  na `stuck` končí: skupina tažení a hlouček výpravy stojí (`arrived`), posel se vrátí, uprchlíci
  zůstanou, kde jsou – **nový pokus až po novém rozkazu** (`sendGroup` `stuckDay` smaže; úspěšný
  úsek taky). `stuckDay` je jen pojistka pro volajícího, který by týž den zkoušel znovu; další den
  sám nic nespustí (oprava Úlohy 5 – revize: dřív tu stálo „další den plánuje znovu“). Skupina
  stojí i v slepé kapse cizí mapy: přejde-li na mapě po cestě do oblasti, odkud vede okraj
  k dalšímu políčku trasy (`onwardArea`), mapu za ní ale nezná (výhled jen o jedno políčko), může
  na další mapě skončit v kapse bez přechodu dál – tam `stuck` a čeká na nový rozkaz.
- **Rozjeté úseky** (Rozhodnutí 9) – `MARCH_GRID_VERSION` (`march-grid.ts`) = 2 – jemná mřížka
  s hustým lesem. Bod tažení nebo výpravy bez `marchGridVersion` (uložený dřív) zahodí úseky
  `replanLegs(state, extra)` (`movement.ts` – `leg = null` u skupin a `extra`, tj. uprchlíků
  a poslů tažení, úhlopříčné kroky tras světa na dva kolmé – `sideBySide`; nastaví verzi): tažení na kopii taktu (`campaignTick`), výprava při čtení
  (`upgradeJourney`). Další takt úseky spočte z uložené polohy (únik z lesa) a cíl na mapě cíle
  posune znovu `settleGoal`. `newCampaign` a `newJourney` verzi nesou od začátku. **Rozjetý boj**
  (drobnost 6 opravy Úlohy 5): bod bez verze ve fázi `raiding` s bojem `ongoing` přesune
  bojovníky v buňce s tempem 0 (dnešní hustý les – dřív jen zpomaloval) na místo `formationSpot`
  (`settleFighters` v `battle.ts` – útočník do oblasti místa své skupiny, obránce na nejbližší
  průchodnou buňku); jinak by se nepohnuli a boj by zamrzl. Jen jednou – verze se zapíše.
- **Cíl v neprůchodné buňce** (design war.md – Pohyb; jako v 0 A.D., návrh Clauda 10. 11. 2026) –
  `reachableGoal(grid, from, to)` v `march.ts`: cíl v neprůchodné buňce (voda bez brodu, sráz,
  hotová hradba; po `outOfBuilding`) i v průchodné, kam z `from` cesta nevede (za řekou bez
  brodu), posune na střed nejbližší průchodné buňky dosažitelné z `from` – ve stejné souvislé
  oblasti (`marchAreas`) jako buňka, odkud skupina vyráží (po úniku z neprůchodné buňky);
  nejbližší podle čtverce vzdálenosti v buňkách, remíza – nejmenší index; jen celočíselná
  matematika. Dosažitelný cíl (`marchReachable`, i cíl ve stavbě) vrátí beze změny (týž objekt).
  Null = mapa nemá průchodnou buňku (dřív i skupina sevřená ve vodě – teď unikne).
  Zaplavení běží jen při plánování úseku na mapě cíle (`settleGoal`), ne každý takt. `settleGoal`
  (`movement.ts` – sdílí ho tažení, `moveGroups` v `campaign.ts`, i výprava, `moveGroups`
  v `journey.ts`): skupina na mapě cíle bez úseku (hned po záměru `march`,
  `turnBack`, rozpadu, nebo po vstupu na mapu cíle) si cíl posune před plánováním úseku – stav pak
  nese posunutý cíl a mapa tažení ho ukáže. Use-case `commandCampaign` záměr k místu na mapě
  skupiny velitele na pochodu odmítne jako `unreachable`, když `reachableGoal` vrátí null.
  Chování se oproti dřívějšku mění u případů, které dřív skončily `stuck`, a všude, kde dřív trasa vedla hustým lesem (ten je teď neprůchozí) – otisky tažení proto nejsou zárukou beze změny. Skupina z neprůchodné
  buňky unikne do oblasti nejbližší průchodné buňky k cíli (Úloha 5), cíl tak neskončí v pasece.
- **Tempo** – `marchSpeed(group: GroupPace, day)` (m/s skutečného času): 3,5 m/s, nejpomalejší
  z jezdců × 1,5, pěších × 1, pěších raněných × 0,75 a stáda × 0,5; v zimě sníh × 0,75. 1 km po
  louce ≈ 286 s ≈ 4,8 min ≈ 3,3 herního dne; po průseku pevné cesty a zemské stezky × 1,5 – tempo
  platí jen pro chůzi, trasa průseky sama nevyhledává. Hustý les tempo nemá – je neprůchozí.
- **Zima** – `domain/war/season.ts`: `isMarchWinter(day)` (prosinec–únor), `frostDay(member,
outside, day)` → `MemberDelta` (`health`, `vigor` = podíl plné síly): v zimě venku −3 a −0,02,
  ve vsi kdykoli +10 a +0,05 až do plných, jinak 0.
- **Mapu po mapě** – `domain/war/world-route.ts`: `worldRoute(from, to, avoid)` (4 směry – cesta
  mezi mapami je čtyřsousedná, krok 5, manhattanský odhad, uhne nejvýš 8 políček za obdélník startu
  a cíle; start a cíl se nezakazují; nedosažitelný `[]`), `edgeCrossing(cellFrom, cellTo, pos)` –
  osa pohybu se převrátí na opačný okraj (± (960 − `cellM` ÷ 2) = ± 958,75 m, střed okrajové
  buňky), druhá zůstane. **Úhlopříčný soused dvěma kolmými kroky** (návrh Clauda – oprava Úlohy 5):
  úhlopříčný přechod vedl jedinou rohovou buňkou mřížky pochodu (2,5 m), která musela být průchozí
  na obou mapách – Vlkov z kotvy NE, SE a NW `stuck`, v rozích map vůbec nejčastěji. Objížďka
  zavřeného okraje to není – trasa je pevná, u zavřeného okraje prvního kroku skupina stojí
  (Martin 16. 11. 2026: „Má zůstat stát.“). `firstRouteStep(direction)` – směr prvního kroku
  k sousedovi (kurzor nad rohem mapy v prohlížeči – `edgeReachable` v `march-cursor.ts`);
  `sideBySide(cell, route)` – starší trasa s úhlopříčným krokem na dva kolmé (`replanLegs`).
  `edgeCrossing` i `marchPathToEdge` úhlopříčný směr dál znají (cíl „Přes okraj“ do rohu
  úhlopříčné mapy výpravy – `journey-parties.ts`).
- **Krajina políčka** – `application/cell-landscape.ts`: `emptyCellLandscape(worldSeed, cell)`
  (`generateAcceptedLandscape(cellLandscapeSeed(...))` – tatáž krajina, jakou by dostala nová ves,
  i s `obstaclesOf`), `settledCellLandscape(seed, versions)` (políčko se vsí – uložený seed),
  `emptyCellMarchGrid`.
- **Testy** – `domain/war/__tests__/march.test.ts` (tempo, hustý les trasa obejde, brod, řeky
  kostry jen přes brod – umělé i mapa se soutokem, cíl ve vodě – posun na dosažitelný břeh, remíza,
  sevřené vojsko unikne, únik z neprůchodné buňky, únik do oblasti cíle nebo přechodu okraje, ne
  do izolované paseky – Úloha 5, únik nejvýš 40 m za nejbližší průchodnou buňku a ze stavby jen do
  ní – oprava Úlohy 5, opevnění, cesta, zima, zlatá cesta na seedech
  1–3 – otisk počtu brodů, buněk hustého lesa a dvou tras ze středu mapy k dosažitelnému místu
  u rohů, determinismus, okraj, z branky dvorce rovně a ze středu domu únikem a obloukem –
  výprava, D49), `march-forest.test.ts` (Úloha 4 – vnitřek lesa neprůchozí a okraj 10 m ne,
  krajina bez lesa, stezka hustým lesem a bez ní cíl na téže straně, stezka krajiny bez vsi, ves
  v pasece od okraje jen po cestě – Review Focus 1, z kotvy i od branky bez cesty nikam a s cestou
  obojí – oprava Úlohy 5, paseka po kácení, mezera 4 m mezi domy – D55,
  balvan a jeho odstranění, determinismus, terén se sítem = bez síta), `march-search.test.ts`
  (cena, rohy, start v neprůchodné buňce, nedosažitelný cíl, JPS = Dijkstra na 200 náhodných
  mřížkách, souvislé oblasti = zaplavení, štítky s okrajem Uint16 a nad 65 535 oblastí Int32),
  `march-smooth.test.ts` (dohled a roh, vyhlazení na
  otevřené mřížce a kolem L, rozdělení podle tempa a poloha po metrech louky),
  `movement.test.ts` (Úloha 5 – přechod okraje jen do průchozí buňky sousední mapy, ne do kapsy
  u okraje, když vede přechod k cíli – bez něj i do kapsy, okraj bez přechodu: `stuck`
  a `stuckDay`, týž den svět nečte, volající, který zkusí další den, plánuje znovu; nový rozkaz
  `stuckDay` smaže), `campaign.test.ts` – rozjeté úseky po změně mřížky (bod bez verze: nový úsek
  jen průchozími buňkami kromě úniku, 400 × 1 takt = 1 × 400, rozjetý boj – muž z hustého lesa
  na průchodné místo), chybějící mapa až druhého políčka trasy (stav po několika taktech pochodu
  = stav na konci posledního celého taktu),
  `world-route.test.ts` (čtyřsousedná trasa, první krok k rohu, starší trasa s úhlopříčkou),
  `movement.test.ts` – úhlopříčný cíl přes kolmou mapu i se zavřeným rohem, zavřený okraj prvního
  kroku stojí, `application/__tests__/cell-landscape.test.ts`. Změna mřížky, hledání
  nebo vyhlazení změní zlatý otisk – zapsat nový jen se záměrem. Testy tažení krokují po kouscích
  přes `stepInChunks` (`__tests__/campaign-fixtures.ts`): skončené tažení `stepCampaign`
  neposouvá, krok bez posunu, krok čekající na data i podmínka `until`, která do konce nenastane,
  proto hodí chybu místo nekonečné smyčky. Světy testů, které krokují po kouscích, sdílejí
  `MarchGridMemo` jako worker – jemná mřížka se staví v ms.

## Tažení po taktech (Ú6.5)

Plán 2026-11-03 – rozhodnutí 12; Review bod 5. Čísla ve `WAR.campaign`.

- **Takty** – `domain/war/ticks.ts`: `TICKS_PER_SECOND` = 4 (`TICK_MS` 250), takt 0 = začátek
  světa; `tickOfMs(ms, world)`, `msOfTick`, `dayOfTick(tick, world)` (BigInt, shodně
  s kalendářem); `INTENT_LEAD_TICKS` = 2, `CHECKPOINT_TICKS` = 40; `tickRandom(seed, tick, label)`
  – náhoda jen ze seedu tažení a čísla taktu (boj Ú6.8).
- **Stav** – `domain/war/campaign-types.ts`: `CampaignState` (JSON; `tick` = poslední spočtený
  takt, `day` = jeho herní den; `phase` `assembling` → `marching` → `raiding` → `returning` → `done`,
  `disbanded` pro rozpad Ú6.12; vůdce `playerId` / `leaderName`, `commander`, `deputy`, `assembly`
  a `target` (`CampaignVillage` – ves, políčko, bod), `members` (`CampaignMember` – osoba
  `PersonRef`, hráč, muž rodu, kůň, nucený, síla, zdraví, `vigor`, raněný, skupina, `status`),
  `groups` (`CampaignGroup` – rozkaz, políčko a poloha, cíl, `route` = zbývající políčka světa,
  `leg` = úsek po mapě `{ points, meadowM, walkedM }`, `stuckDay` – den uvíznutí, `arrived`),
  `marchGridVersion` (verze mřížky, podle které vznikly úseky – `MARCH_GRID_VERSION`; bod bez ní
  zahodí úseky v prvním taktu na kopii, `replanLegs` – Pohyb vojska, Rozjeté úseky), `supplies.foodKg`,
  `loot { foodKg, herd }`, `captives`, `liveCommand`, `discovered`, `returnReason`).
  `CampaignIntent { tick, seq, byPlayer, body }`, `IntentBody` = `set-out` | `march { to }` (jen
  `liveCommand`, ve fázi pochodu; v boji pošle velitele) | `turn-back` (`restart` – Začít znovu během
  nájezdu) | `set-order` | `strike`
  (Ú6.8 – Boj muž po muži).
- **Krok** – `domain/war/campaign.ts`: `newCampaign(input, clock)` (muži ve shromaždišti, skupiny
  podle `member.group`), `stepCampaign(state, toTick, intents, world)` → `{ state, villageEvents,
notices, waiting }` – čistá, vstup nemění. Takt na kopii stavu (`cloneData` z `village/core/clone.ts`
  – ruční kopie čistých dat, ≈ 5× rychlejší než `structuredClone`; sdílené odkazy uvnitř stavu
  rozdělí jako JSON kontrolního bodu): když taktu uprostřed chybí mapa nebo ves (`MissingData`),
  kopie se zahodí a výsledkem je stav na konci posledního celého taktu; kopie zároveň odděluje stav
  předchozího taktu a vše, co z něj takt vydal (události, upozornění), od dalších taktů. Kopie za
  takt zůstává i ve workeru, kde je volání skoro vždy na jeden takt – předání vlastnictví stavu
  (měnit na místě) by ušetřilo už jen ≈ 40 µs za takt, a ne zadarmo (`docs/code/worker.md` – Kopie
  stavu za takt). Na začátku nového herního dne denní krok (mráz `frostDay` – venku, ve shromaždišti zotavení; jídlo 1 kg na aktivního muže, bez
  jídla na pochodu obrat `supplies`), záměry taktu podle `seq` (záměr s taktem ≤ `state.tick`
  a cizí hráč se zahodí), pak fáze. **Pohyb:** skupina jde tempem `marchSpeed ÷ 4` metrů louky za
  takt po `leg` (`marchPathToEdge` k okraji ve směru `route[0]`, na posledním políčku `marchPath`
  k cíli; úsek se plánuje na mřížce `marchGrid` políčka a dne – mezipaměť v rámci volání, napříč
  voláními `CampaignWorld.grids` – `MarchGridMemo`, klíč identita krajiny, překážek, stavu vsi, os
  pokračování stezek a den);
  konec úseku na okraji = `edgeCrossing` na sousední mapu (zbytek taktu propadne), v cíli stojí;
  skupina bez cesty nebo bez mužů stojí. Trasa po světě `worldRoute` (bez zákazů – průchod Ú6.13).
  Všechny skupiny na mapě cíle → `raiding`; **`raidTick` počítá boj** (Ú6.8 – Boj muž po muži;
  Ú6.9 obránci, Ú6.10 kořist, Ú6.11 vzdaní). Návrat ke shromaždišti
  (rozpad po hloučcích – NPC velitel, zástupce a rozpad, Ú6.12) → `done`: zápis „Vojsko Bořivoje se vrátilo.“ do kroniky každé
  domovské vsi a upozornění `campaign-returned { campaignId, reason }`; při vyrazení „Vojsko
  Bořivoje vyrazilo.“ do shromaždiště. Události jdou do schránky na **následující den** (rozhodnutí
  13), `ref` = `camp:<id>:<takt>:<n>`. Stádo kořisti jde se skupinou velitele.
- **Svět tažení** – `CampaignWorld { clock, landscapeOf(cell), villageAt(villageId, day) }`
  (synchronní): `null` = data ještě nejsou → takt se zastaví a `waiting` vrátí chybějící políčka /
  vsi; výsledek se tím nezmění. Mřížka bere cesty a opevnění **první** vsi mapy; `villageAt` dá stav
  vsi ke konci dne `d − 1` (bariéra – Ú6.7). Vymřelá nebo opuštěná (spící) ves je hotová – její uložený stav platí pro každý den. Volitelný `villageGone?(villageId)` – svět ves zkusil
  načíst a není (zanikla) – čte jen výjezd vojvody (`docs/code/journey.md`); tažení se neptá.
- **Use-case** – `application/step-campaigns.ts`: `stepCampaigns(deps, { nowMs })` – pro každé
  `campaigns.active()` pod `CampaignLock.tryRun` (jinak `busy`): kontrolní bod (s pamětí workeru
  `readCheckpoint` – jen verze `checkpointVersion`, stav z JSON jen při jiné verzi) → nejdřív
  doručí starý `outbox`, záměry `intentsAfter(tick)`, `computeCampaign` (načítá chybějící mapy
  `CampaignCells.mapOf` a vsi a pokračuje, nejvýš 8 kol; s pamětí workeru vsi téže verze jen
  otiskem `stampsOfVillages` a mapy a vsi, které tažení četlo minulé kolo, načte předem –
  `CampaignMemory.needs`; docs/code/worker.md – Výkon – Tažení) do `tickOfMs(now)`. Bod se uloží, když
  přibylo ≥ 40 taktů, vznikly události nebo tažení skončilo (jinak `computed` – další kolo počítá
  znovu z bodu, s pamětí workeru `memory` od posledního spočteného stavu, platí-li pro týž bod –
  jeho verzi – a tytéž záměry do jeho taktu; docs/code/worker.md – Výkon – Tažení); `saveCheckpoint` uloží stav i `outbox` (události a upozornění) atomicky a odmítne
  (`stale`), když se bod posunul nebo přibyl záměr do spočtených taktů (počet záměrů v rozsahu ≠
  `seenIntents`). Po uložení doručí `outbox` (`villages.inbox.post` – stejný `ref` podruhé zahozen,
  `notices.post`) a smaže ho (`clearOutbox`); pád mezi uložením a doručením → další kolo doručí
  znovu. Chyba tažení = `failed`, ostatní tažení počítají dál. `queueCampaignIntent(deps, {
campaignId, playerId, body, nowMs })` – záměr na takt `tickOfMs(now) + 2`; úložiště odmítne takt
  ≤ bodu (null). Porty v `application/campaigns.ts`.
- **DB** – `schema/campaign.ts`, migrace `0030_campaign`: `campaign` (válka, vůdce, `status`
  `active` / `done`), `campaign_checkpoint` (`tick`, `state` jsonb – čísla přesně, pořadí klíčů
  jiné, takt na něm nezávisí; `outbox` jsonb), `campaign_intent` (`seq` serial, takt, hráč, tělo).
  Adaptér `adapters/campaign-repository.ts`: `addIntent` = `INSERT … SELECT … FOR SHARE OF cp`
  (takt > bod, tažení aktivní), `saveCheckpoint` v transakci `FOR UPDATE` na bodu a počet záměrů až
  pod zámkem; `active()` = aktivní nebo s `outbox`. Verze bodu (`CampaignCheckpoint.version`,
  `checkpointVersion`) = `xmin` řádku – mění ji každý UPDATE (uložení, `clearOutbox`), zámky řádku
  ani záměry ne; bez sloupce a migrace. Zámek `adapters/campaign-lock.ts`
  (`createCampaignLock(pool)` – advisory zámek zámku hráče v prostoru `CAMPAIGN_LOCK_NAMESPACE`).
  Mapy políček `packages/server/src/campaign-cells.ts` (`createCampaignCells` – políčko se sídlem
  z uloženého seedu a jeho vsi, prázdné políčko `emptyCellLandscape` v LRU 16).
- **Testy** – `domain/war/__tests__/campaign.test.ts` (po 1, 7, 40, 400 taktech = vcelku – stejný
  JSON stavu i události; restart z JSON bodu i s obráceným pořadím klíčů = bez restartu; záměr přesně
  ve svém taktu, v minulosti a cizí zahozen; obrat rozkazem; bez jídla obrat; chybějící mapa
  zastaví a po načtení stejný výsledek; přípravky `campaign-fixtures.ts` – rovné mapy),
  `application/__tests__/step-campaigns.test.ts` (kola po 1 s s restartem portů = vcelku, bod
  nejvýš po 40 taktech; pád po uložení před doručením – nic se nezdvojí; záměr ≤ bod odmítnut,
  teď + 2 použit v něm; záměr do spočteného taktu → `stale` a další kolo ho použije; chyba
  a cizí zámek jednoho tažení nezastaví ostatní; paměť workeru se zmraženými body = bez paměti,
  bod téže verze se nečte znovu), `db/adapters/__tests__/campaign-repository.db.test.ts`
  (bod bit po bitu, odmítnutí záměru, `stale`, `outbox`, verze bodu, souběh záměru s uložením, dva
  workery – tažení počítá jen jeden).

## Příprava a vyslání tažení (Ú6.6)

Panel Vojsko (`web-ui.md`) posílá **plán** (`CampaignPlan`, `application/plan-campaign.ts`): velitel
(`PersonRef` – muž rodu od 16 let), volitelně zástupce, vsi rodu s výběrem (`lineMen`, přihlášení
`villagers`, nucení `forced`), shromaždiště, cíl, `groups` (`together` / `by-village`), rozkaz
ke vzdaným (`surrendered`: `kill` / `lead` / `leave`, uloží se do `CampaignState.surrendered`)
a `food` (kg obilí ze zásob shromaždiště).

- **`prepareCampaign`** je jediné ověření, které používá odhad i vyslání: rod hráče, jen **vlastní
  vsi** (`findPlayerVillage` přes aktivní sídla držitele – ves spravovaná cizí hráčem sem nepatří,
  právo `war` ve `STEWARD_RIGHTS` chybí), žijící vsi, velitel a zástupce mezi vybranými muži rodu,
  cíl (ves cizího rodu, žijící; **cíl v ochraně se odmítne** – nová ves `villageProtected`, rod
  nováčka `houseProtectedUntil` + `protectedReason`, ochrana rodu platí jen když mezi rody neběží
  válka), jídlo (nejvýš zásoba shromaždiště bez osiva a nosnost mužů). Odhad: `CampaignEstimate`
  (síla `armyStrength` po vsích s pokrytím nástroji, počty mužů, cesta ve dnech vzdušnou čarou
  ≈ 3,5 m/s, na kolik dní vystačí jídlo, `ambush`, `liveCommand`). **Poloha shromaždiště, cíle
  i domovů** (`villageStandingPlace` v `plan-campaign.ts`): branka dvorce `villageGate`
  (`departure.ts` – `dwellingGatePoint` dvorce; bez hotového dvorce `villageCentre`) – odtud vyráží
  i výprava (`journeyHome`), útěk a posel (`villageStart` v `campaign-tick.ts` – evakuace, posel,
  volby `refugeOptions` i správce); dřív kotva `villageAnchor` – střed dvorce v buňce stavby, únik
  z ní (oprava Úlohy 5 plánu 2026-11-16-dense-forest). Ves bez obydlí má střed místa pro ves
  (`villagePlace`). Jen nově plánovaná tažení – běžící nesou uložené body.
- **`musterOf`** (`domain/war/muster.ts`): vesničané 16–44 let (`villagerCandidates`); příbuzní
  v cíli (`kinInTarget` – příchozí ze sousední mapy ve směru cíle: muž, jeho žena nebo rodiče) →
  neochotný; ostatní losují vlastním losem (`musterSeed` = seed vsi + cíl) s pravděpodobností
  `volunteerShare` (30 % + 0,5 % za bod štěstí nad 50, hlad +15 %, vdovská domácnost × 0,5 – čísla
  `WAR.muster`). `volunteers` jsou id přihlášených, `others` ostatní způsobilí (kandidáti na rozkaz).
  Server přijme v `villagers` jen dobrovolníky a v `forced` jen ostatní způsobilé.
- **`launchCampaign`** (`application/launch-campaign.ts`; **volající drží zámek hráče** – web
  `guardedAction`): ověří, `startWarByAttack` (mezi rody neběží válka = přepadení, válka začne
  vysláním), pro každou ves **verzovaným zápisem** pošle muže pryč (`sendAway`, `away: campaign`
  s `refId` = id tažení, bez `untilDay` – návrat řeší tažení; doma pak nepracují ani nejí), shromaždiště
  odečte jídlo, nařízený útok na příbuzné (nucený, nebo muž rodu s příbuznými v cíli) přidá vsi
  `{ day, points: 5 }` do `happiness.deaths` (−5 štěstí na rok za každého, strop úmrtí 20), založí
  tažení (`newCampaign`, seed z `SeedSource`) a záměr `set-out` (`queueCampaignIntent`). Nepovede-li
  se uložit další ves, vrátí muže, jídlo i štěstí do vsí, kam už sáhl (`release`). Koně zůstávají
  ve vsi (jezdec má `mounted`, síla z koně se počítá).
- **Zásoby** (`domain/war/supplies.ts`): `campaignSupplies(men, horses, carts, days)` → potřeba
  1 kg/muž/den, nosnost 25 / 80 / 400 kg. Zatím se vezou jen muži (koně a vozy v plánu nejsou).
- **Dezerce** (`domain/war/desertion.ts`, `desert` v `campaign.ts`): v denním kroku venku nucený
  (`CampaignMember.forced`) dezertuje s los ze seedu tažení, dne a pořadí muže – 5 % denně, s příbuznými
  v cíli (`CampaignMember.kin`) 15 % (`WAR.desertion`); `status: 'deserted'`. Dezertér s příbuznými
  v cíli cíl varuje: do schránky cílové vsi jde `threat-signal` s `army-seen` (den po dni dezerce;
  body `army-seen` vlastní schránka zatím nemá – signál hrozby je stávající tělo). Dezerce z hladu
  živě vedeného tažení a odchod dezertéra z bojiště: Hráč ve vsi a mimo ni – Živé vedení bez rozkazu.
- **Dezertér jde domů hned** (Martin 15. 11. 2026; `sendHome` v `campaign.ts`, `deserterHomeDay`
  v `desertion.ts`): v den dezerce (hlad i nucení) dostane jeho ves den nato `away-ends`
  (`refId` = id tažení, `personIds`, `untilDay`, `deserted`) – ve vsi je pryč jen do dne dezerce +
  cesta domů (`endAway` – `PersonAway.deserted`, `returnHome` – kronika „Z tažení utekl domů sedlák
  Bořivoj.“, `people-back` s `deserted` a `who`). Řádný návrat zapíše `applyCampaignReturn`
  (`people-back` s `who` – „Z tažení se vrátili vojvoda Bořivoj a 2 sedláci.“; web-ui.md – Panel
  Kronika). Cesta = `walkDays` (vzdušnou čarou
  tempem pěšího jako `daysHome`; návrh Clauda) z místa jeho skupiny do jeho vsi (`homes`, jinak
  shromaždiště), nejméně 1 den; strana mapy je konstanta `LANDSCAPE_SIZE × CELL_SIZE_M`, mapy se
  nečtou. Dezertéři téže vsi se stejným dnem jdou jednou událostí. Den si nese
  `CampaignMember.homeDay` a návrat tažení (`returnOf`) takového dezertéra už nevrací; dezertér ze
  staršího bodu bez `homeDay` se vrací s koncem tažení jako dřív. Raněný dezertér (`wounded`) přijde
  domů zdravý (`returnOf.wounded` bere jen aktivní) – neměněno.
- Právo: `ACTION_RIGHTS` `planCampaign` a `launchCampaign` = `war`; ve web `lib/village.ts`
  `planCampaignActionForPlayer` / `launchCampaignActionForPlayer` (přes `guardedAction`),
  `lib/army.ts` je skládá s `LaunchDeps` (`GameDeps.campaigns`).
- Testy: `domain/war/__tests__/muster.test.ts` (nábor, zásoby, dezerce, varování),
  `application/__tests__/launch-campaign.test.ts` (plán, vlastní vsi, velitel, ochrana, jídlo,
  vyslání, přepadení, štěstí, vrácení při selhání), e2e `multiplayer.spec.ts` (panel Vojsko).

## Boj muž po muži (Ú6.8)

war.md – Boj, Ztráty; fortifications.md – Obrana bez násobku, Střelba a viditelná plocha,
Prolomení. Čísla ve `WAR.combat` (zdraví, zásah, luk 20–60 m, zblízka 3 m, los zásahu zblízka
1 : 1, rány po 2 / 4 s, `aim` – kruh rozptylu a viditelné plochy), `WAR.sight` (150 m, v hustém
lese 50 m), `WAR.houseGroupM`, `WAR.holdPlaceM`, `WAR.defenderAges`, `WAR.downed`,
`WAR.breakpoint`, `WAR.lastLineManMinHealth`, `WAR.orderHearingMeters`.

- **Obránci** – `domain/war/defenders.ts`: `houseGroups(dwellings)` (obydlí blíž než 40 m i řetězem
  → číslo skupiny podle nejmenšího id), `defenderRoster(state, day, { lineMenElsewhere })` →
  `Defender[]` (pořadí podle id): muži 16–44 `villagerStrength(false, štěstí)`, muži rodu od 14 let
  `lineManStrength(p, null)` s lukem a `bowSkill` (`bowSkillOf` – `ArmsSkills.bow`), ženy, starší a chlapci 14–15 let 0,1 `atHouseOnly`; kdo je
  pryč (`isAway`) nebo zraněný, chybí. `lastLine` = jediný muž rodu ve vsi a `lineMenElsewhere`
  (výchozí 0 – tažení zatím jiné vsi hráče nezná). `defenderPlan` – výchozí postoj u domů:
  útočník do 40 m od domů skupiny (nebo kdo útočí na obránce) a ve dohledu, vodítko 40 m od domů;
  `atHouseOnly` jen na dosah u svého domu. Postoje, včasný útěk a skryté jámy – Ú6.9.
- **Rozkazy** – `domain/war/orders.ts`: `attackerPlan` – `follow-leader` (jde za velitelem, když je
  dál než 6 m; napadne, kdo útočí na velitele nebo na něj), `attack-all` (nejbližší viditelný
  i prchající, nikoho nevidí → nejbližší vůbec – projdou ves), `hold-place` (`holdAt`, jinak kde
  skupina stojí; nepřítel do 30 m + dosah zblízka od místa, lukem kdo je na dostřel, vodítko 30 m;
  jen na koho přes hradby dosáhne – `PlanContext.reaches` = `reachable` v `battle.ts`: každá stěna
  na čáře k cíli musí ránu pustit (`canStrikeAcross` – luk na dostřel, jinak zblízka), ať skupina
  kvůli cíli za palisádou místo neopustí, nepřeleze ani neprolomí – hradby Ú20).
  Bez velitele „útočit na vše“; NPC velitel řídí velitele (jinak zástupce) jako řízeného muže
  (`syncControl` – NPC velitel, zástupce a rozpad, Ú6.12).
  `controlledPlan` – hráčem řízený muž: `chosen` (pokyn `strike`), jinak `goal` (pokyn `march` na
  mapě cíle), brání se jen tomu, kdo na něj útočí na dosah. `battleLeader` = velitel, když bojuje,
  jinak zástupce; `orderHeard` = bojující muž skupiny do 30 m od velitele; `setGroupOrder(state,
group, order, at)` – před bitvou kdykoli, v boji jen na doslech (jinak false); mění
  `CampaignGroup.order` / `holdAt` i skupinu boje.
- **Boj** – `domain/war/battle.ts`: `BattleState` (JSON v `CampaignState.battle`) – `fighters`
  (`Fighter`: `a:<index muže>` / `d:<id člověka>`, strana, skupina, síla × `vigor`, zdraví, poloha,
  `home` – dům, nebo kde útočník vstoupil, `state` `fight` | `breach` | `flee` | `fled` | `down`,
  `cooldown`, `aim`, `controlled` / `chosen` / `goal`, `route` průchodem, `breachAt`, `fleeTo`,
  `killed`), `groups` (`BattleGroup` – rozkaz, `holdAt`, `entered`, `broken`), `commander`,
  `deputy`, `closedGates` `<opevnění>:<úsek>`, `breaches` (`BattleBreach` – místo, `at`, postup,
  fáze, `BreachProgress` – viz Prolomení v boji), `outcome` `ongoing` | `attackers` | `defenders` | `withdrawn`. `openBattle`
  (útočníci u skupin, obránci u domů), `battleTick(b, field, rng)` mění `b` na místě:
  brány do 30 m od útočníka se zavřou (ne ty, které otevřeli obránci – `openedGates`) → bod zlomu
  (padlí a ranění ÷ `entered`, 30 % útok, 45 % obrana; velitel neuteče sám; obránci za hradbou po
  opevněních jen ze ztrát v útoku – [Kryt pod palbou, bod zlomu za hradbou a
  probíjení](#kryt-pod-palbou-bod-zlomu-za-hradbou-a-probíjení-9-11-2026)) a probíjení → stěny
  taktu → muži v pevném pořadí (plán, krok) → práce na
  průlomech (`breachWorkStep`, nejvýš 4 na místo, `hoursPerTick` z `ticks.ts`) → rány (cooldown 8 / 16
  taktů; zblízka los 1 : 1, šíp `bowShot` z `aim.ts` – viz Střelba podle dovednosti;
  `hitDamage(síla, luk)` = `10 × síla`, luk polovina – **násobek obrany zrušen 8. 11. 2026**, i u
  domu) se sečtou a použijí až po všech – kdo padne, v tomto taktu ještě udeřil → výsledek (útočníci bez bojujících = `defenders`; obránci bez bojujících
  i prchajících a všechna útočiště dobytá = `attackers`). Na nule `down`, `killed` losem (vesničan 1 : 1, muž rodu 1 ze 3);
  `lastLine` neklesne pod 10, pak uteče (i `controlled`). Útěk (`rout.ts` – `startFlee`, `battle.ts`
  – `fleeStep`): útočník do `home`, obránce do nejbližší buňky hustého lesa (bez lesa hned
  `fled`); obránce za hradbou napřed nejbližším průchodem (body před a za ním), bez průchodu je
  odříznutý a vzdá se; kdo se nepohne, je `fled`. Pohyb tempem
  pochodu (3,5 m/s ÷ 4, jezdec × 1,5, terén z `MarchGrid` – val ¼; voda a sráz neprůchodné).
  Muž jde k cíli rovně; krok do buňky s tempem 0 (hustý les, voda, sráz, skála) neudělá a sklouzne
  podél jejího kraje jako podél stěny – průmět kroku do osy x, nebo z, napřed delší složka
  (`alongEdge` – plán 2026-11-16-dense-forest, Úloha 5). **Objížďka útočníka** (`detour` – oprava
  Úlohy 5, revize: skvrna lesa r = 40 m nebo pás 120 × 40 m mezi útočníky a domem – po 2400
  taktech `ongoing`, nájezd neskončil): když přímka k cíli vede buňkou, kam boj nevstoupí
  (`lineClear` z `march-smooth.ts` s průchodností `paceAt` – stavby a stěny opevnění ne, ty řeší
  boj sám), uloží si body trasy `marchPath` po `field.grid` do `route` / `routeFor` jako průchod
  opevněním a jde po nich – i objížďkou, která vede napřed od cíle (průsek do U). Totéž platí pro
  úsek k bodu průchodu opevněním (`followRoute` vloží body objížďky před první bod trasy) a k místu
  průlomu (`toBreach`, `routeFor` = `breach:<klíč>`) – re-revize: skvrna lesa před branou palisády
  dřív nechala útočníky stát (3000 taktů `ongoing`). Bod v neprůchodné buňce mřížky (místo
  průlomu u stěny) se napřed posune `reachableGoal` – trasa končí tam, dál rovně
  (`detourPoints`). Hledá nejvýš jednou za `DETOUR_RETRY_TICKS` (20) taktů (`detourTick`); bez
  trasy jde rovně jako dřív.
  **Pojistka proti zastavení** – útočník bez vodítka, který se `STALL_TICKS` (8) taktů v řadě
  nepohne dál než 1 m od cíle kroku (`stall`), zahodí trasu a hledá novou. Obránce objížďky
  nehledá (průchody hradbou také ne, ke vsi to má blízko) – jeho stav se nemění. Testy „pohyb
  v boji podél hustého lesa“ v `battle.test.ts` (průsek do L, skvrna, pás, skvrna před branou
  palisády, kapsa lesa před místem průlomu, průsek do U, zastaralá trasa do lesa).
- **Opevnění v boji** – `battleForts(geo, forts)` (tvar úseků a střed); stěny jsou úsečky úseků,
  které stojí (ne holý val, ne mezera, prolomený úsek = `breachedDay` dne boje), s výřezem otevřené
  brány a tětivou rohu. Pohyb stěnu neprojde (sklouzne podél), luk i dosah zblízka (3 m) přes ni
  ano. Útočník, kterému k cíli vadí stěna, jde nejbližším průchodem (`route` – 3 m před a za ním;
  když se zavře, cesta neplatí); bez průchodu hradbu přejde nebo prolomí nejrychlejším postupem
  (Prolomení v boji), prolamující nebojují, průlom je mezera.
- **Tažení** – `campaign.ts`: `raidTick` – první takt `campaignBattle` (muži na nohou na mapě cíle
  v šiku po pěti; místo v buňce s tempem 0 mimo stavbu a stěnu – hustý les u průseku, voda, sráz,
  skála – nahradí `formationSpot` (`battle.ts`) středem nejbližší průchodné buňky téže oblasti jako
  skupina (`nearestInArea` v `march.ts`), jinak by muž stál – boj únik nemá; obránci
  z `villageAt(cíl, den)`; ves není na mapě cíle → bez obránců),
  pak `battleTick` s `tickRandom(seed, tick, 'battle')`, `syncMembers` (zdraví, `fallen`,
  `wounded`). Konec: `attackers` → obrat `arrived` (háček Ú6.10 kořist a škody, Ú6.11 zajetí),
  `defenders` → `routed` (háček Ú6.12 rozpad, Ú6.11 ranění zůstanou); `turnBack` v boji →
  `leaveBattle` (`withdrawn`, skupiny se sejdou u velitele). Padlí a ranění obránci do vsi jako
  vnější události – Ú6.10.
- **Střelba podle dovednosti** – `domain/war/aim.ts` (fortifications.md – Střelba a viditelná
  plocha; Martin 8. 11. 2026): `spreadRadiusM(dovednost, d)` = `(2 − 1,5 × dovednost ÷ 100) × d ÷ 30`
  (mistr 0,5 m na 30 m, nováček 2 m); `poseOf(f, field, b, zespodu = true)` – lezec na žebříku
  a přes plot `climbing` (`onLadder`), obránce na ochozu (`Fighter.onWall`) proti ráně přes hradbu
  `parapet`, v krytu pod palbou (`Fighter.cover`) `cover`, jinak `standing`, `visibleAreaM2`
  0,85 / 0,25 / 0,025 / 0,85 / 0;
  `shotCandidates` – všichni na nohou obou stran (ne `down` ani `fled`) se středem v kruhu kolem cíle,
  v pořadí bojovníků, bez střelce; `shotChance` = Σ ploch ÷ π r² (nejvýš 1); `shotHit(kandidáti, r,
roll, pick)` – zásah, když `roll` < šance, zasažený váhou podle plochy. `bowShot(střelec, cíl,
bojovníci, pose, rng, dovednost?)` – dovednost `Fighter.bowSkill` (muž rodu z `CampaignMember.bowSkill` /
  `Defender.bowSkill`; chybí = vesničan 20; hod z ochozu pevně 20); **v kruhu žádný viditelný nepřítel → nestřílí**
  (`{ fired: false }`, cooldown zůstane, žádný los), jinak dva losy taktu (`roll`, `pick`) – šíp smí
  trefit vlastního. `CampaignMember.bowSkill` nastaví `launchCampaign` (`bowSkillOf` muže rodu);
  starší tažení ho nemají.
- **Testy** – `__tests__/battle.test.ts` (příklad war.md 5 vs. 25 ran, u domu 5 ran po 2 s; bod
  zlomu 30 % / 45 %, velitel zůstane; poslední muž rodu doma pod řízením hráče – nejníž 10, uteče
  do lesa; palisáda – brána se zavře, 4 muži ≈ 3 h, zeď ≈ 24 h, šíp za palisádu plný poloviční;
  šíp do hloučku trefí i vlastního, nováček na 60 m trefí zřídka, mistr často; tažení po
  1 / 7 / 40 taktech přes JSON = vcelku, ztráty v mužích), `aim.test.ts` (kruh, plochy, šance
  u nováčka a hloučku, výběr podle ploch, jen vlastní v kruhu = nestřílí), `orders.test.ts` (za velitelem, obrana
  velitele, útočit na vše mimo dohled, držet místo ≤ 30 m, změna rozkazu na doslech),
  `defenders.test.ts` (skupiny domů, soupis, poslední muž rodu); přípravky `battle-fixtures.ts`.

## Přechod hradby v boji (hradby Ú9)

fortifications.md – Obrana bez násobku 1, 4, 5; Přechod hradby. Logika v `domain/war/ladders.ts`,
`battle.ts` jen volá. Čísla `FORTIFICATIONS.assault` (žebřík 4 mužohodiny, `climbSeconds`, únava)
a `FORTIFICATIONS.defense` (shození 1 : 3 / 1 : 2, pád 20, lezec × 0,5, žebříky 1 m od sebe);
dosah obránce na vrchol žebříku 2,5 m = `perDefenderM ÷ 2`.

- **Stav** – `FighterState` + `climb`; `Fighter.climb?: FighterClimb` (`ladder` – klíč žebříku
  nebo null, `phase` `make` / `carry` / `lean` / `up` / `over` / `down`, `ticks`, `fort`,
  `segment`, `at` – les nebo pata), `Fighter.ladder?` (nese vyrobený žebřík do opření),
  `Fighter.fatigue?: { factor, tick }`, `BattleState.ladders?: BattleLadder[]` (`key`
  `<opevnění>:<úsek>:<n>`, `foot` vně 1 m, `top` na čáře úseku, `inner` – pata druhého žebříku
  uvnitř palisády bez ochozu po přetažení, `climber`, `up`). `inFight` počítá i `climb` (cíl,
  výsledek boje, bod zlomu). Všechno volitelné – staré boje beze změny.
- **Volba postupu** – `approach`: stěna bez průchodu → `startCrossing(f, opevnění, úsek, volba,
hodiny prolomení)`; jinak prolamuje jako dosud. Úsek z `WallLine.segment`, druh z
  `crossingLayers` + `assaultSteps`. Plot → přelézt (`carry` k místu, `up` 8 taktů, 1 m za
  plot). Palisáda a hradba → žebřík: volný žebřík opevnění blíž než les vezme, jinak (bez nesení)
  jde k nejbližší buňce `MARCH_FOREST` a vyrábí `ladderMakeTicks` = ⌈4 ÷ hodin taktu⌉ = 58
  taktů; bez lesa prolamuje. Bez volby (i NPC) nejrychlejší: 4 h výroby + chůze les a zpět +
  takty přechodu proti hodinám nejlepšího místa a postupu s muži skupiny (`chooseSpot` – brána
  palisády 3 h → sekání; osamělý muž u palisády → žebřík, čtyři → oheň 12 h). Zevnitř ven se
  neleze. Přes napuštěný vodní příkop jen zasypaným kusem (`ClimbWorld.moatFilled`, vrchol
  žebříku do 2 m od středu pruhu – `FighterClimb.near`); dokud není, prolamuje – zasype.
- **Rozkaz hráče** (Martin 8. 11. 2026 – „ano“, volí hráč rozkazem skupině) – `GroupAssault`
  (`campaign-types.ts`: postupy bez `open` a `climb`) v `CampaignGroup.assault?` a
  `BattleGroup.assault?` (`campaign.ts` předá do boje); `setGroupAssault(stav, skupina, volba |
null)` v `orders.ts` – před bitvou kdykoli, v boji na doslech velitele jako `setGroupOrder`.
  `ladder` = žebříky i tam, kde je prolomení rychlejší; `cut`, `burn`, `dig`, `mine` = prolamuje
  tímto postupem, nabízí-li ho místo (plot při `cut` nepřeleze), jinak jako bez volby (Prolomení
  v boji). Rozhraní – Úloha 17.
- **Takt přechodu** – `climbStep`: `make` (do lesa, pak takty výroby), `carry` (místo
  `ladderSpot` – průmět na úsek, po metru na obě strany, nejméně 1 m od žebříků opevnění; žebřík
  se založí a nese), `lean` 8, `up` 16 / 20 / 24 (na nule nahoře na `top`), `over` 16 (jen
  palisáda bez ochozu a jen první – pak `inner`), `down` 16 / 8 / 12 → 1 m za hradbou (palisáda
  na `inner`), boj; s valem pod hradbou únava. Dokud vyrábí a nese, vrátí se do boje, má-li
  opevnění průchod; zablokovaný krok (neprůchodno) = zpět do boje.
- **Souboj u žebříku** – nahoře (`up` na nule) obránce do 2,5 m od vrcholu lezce nepustí: lezec
  mu dává rány (`aim`, los 1 : 1) silou `fighterStrength` = `strength × únava × 0,5`, každá rána
  obránce na lezce na žebříku (`onLadder` – `up`, `over`, `down` po vnitřním žebříku) padne bez
  losu. `defendLadder` v ranách: obránce do 2,5 m od vrcholu opřeného žebříku s lezcem ho místo
  rány shodí, je-li čekaný pád 20 ÷ 3 víc než jeho rána (vesničan 4 → shazuje, muž rodu 10 a víc
  → bije); prázdný žebřík shodí, když nemá na koho udeřit (návrh Clauda). Los `pushLadder`,
  pokus stojí ránu (2 s). Shozený lezec −20 (zásah na konci taktu), leží u paty a opírá znovu;
  z vnitřního žebříku padne dovnitř a druhý žebřík se musí přetáhnout znovu. `settleLadders`
  (po bodu zlomu a na konci taktu): kdo přestal lézt, pustí žebřík, z vrcholu leží u paty.
- **Únava po valu** – `rampartFatigueStep`: muž, který krokem sešel z buňky `MARCH_RAMPART`, má
  `rampartFatigue(v)` (výška z tempa buňky), po žebříku přes hradbu na valu taky; `fighterStrength`
  ji vrací lineárně za 120 taktů (`fatigueFactor`), `restFatigue` pak záznam smaže.
- **Testy** – `__tests__/ladders.test.ts` (palisáda: výroba 58, opřít 8, vylézt 16, přetáhnout
  16, slézt 16; ochoz bez druhého žebříku, dolů 8; plot 8 bez žebříku; nejrychlejší – palisáda
  žebřík, brána sekání; bez lesa prolamuje; rozkaz `cut` a `ladder`; lezec na půl síly a každá rána
  obránce padne; shození 1 : 3, pád −20 k patě; 1 m mezi žebříky; únava 0,85 → za 120 taktů
  zpět; bitva se žebříky po 1 / 7 / 40 přes JSON = vcelku); přípravky `fortOf`, `forestSouth`.

## Prolomení v boji – oheň, sekání, kopání, podkop, zasypání (hradby Ú14)

fortifications.md – Přechod hradby (Oheň, Podkop, S valem), Obrana bez násobku 1. Pravidla
z `assault.ts` (`crossingLayers`, `assaultSteps`, `assaultHours`, `mineUnderground`), boj v
`battle.ts`; dřívější soubor prolomení je pryč.

- **Místa** (`wallsOf`) – brána (1 m před vraty) a zeď (uprostřed úseku, u dílu s branou čtvrtina
  od kraje – `wallSpotSegment`); `Spot.steps` = postupy prolomení místa (`cut`, `burn`, `dig`,
  `mine`; žebřík jen jako `ladder` s `fill: 'moat'` – zasypat příkop pro žebříky).
- **Volba** (`chooseSpot(w, opevnění, odkud, volba skupiny, muži)`) – nejméně hodin
  (`assaultHours` s muži skupiny v boji, nejvýš 4; rozdělaný průlom – zbývajících, `breachHoursLeft`),
  pak nejblíž, pak klíč; nejvýš 4 prolamující na místo. Oheň jen s otepi: nejbližší místo u hustého
  lesa – průchodná buňka, která v 8 směrech sousedí s neprůchodnou buňkou `MARCH_FOREST`
  (`atDenseForest`; hustý les je neprůchozí i v boji, muž bere dřevo na jeho kraji – plán
  2026-11-16-dense-forest, Rozhodnutí 11, návrh Clauda; `nearestForestOf` – středy jednou na mřížku v kbelících 8 × 8 buněk, hledání po prstencích kbelíků, dokud dolní mez prstence nepřekročí nejlepší `dist2`; výsledek týž jako lineární průchod včetně shody – vyhraje nejmenší index buňky; vzdálenost se pamatuje na mřížku a místo) nebo hromada klád vsi
  (`BattleField.fuel` – `campaign.ts` `fuelOf`, `logStacks` s kládami); keře zatím ne. Bez valu
  vyhraje oheň (12 h), s valem odkopání (20 h; oheň napřed zasypat val 20 h), bez otepí odkopání.
- **`BattleBreach`** – `method` (`cut` | `burn` | `dig` | `mine` | `ladder`), `phase` (`fill` →
  `fuel` → `burn` → `work` → `done`), `need` (mužohodiny fází: zasypat, otepi × max(1, vzdálenost ÷
  100 m), hoření × 2 přikládající, práce), `progress` (`done` a `required` = součet fází,
  `breached`), `moat?` (`MoatFill` – pruh zasypání). Fáze plyne z `progress.done` (`syncPhase`);
  `advanceBreach` – zasypat, otepi a práce nejvýš 4 muži, hoří nejvýš 2 přikládající (bez mužů
  oheň stojí); po zasypání vodního příkopu takt končí. Hotový `ladder` průlom nedělá. Průlom
  uložený dřív (bez `need`) se v taktu převede na sekání (`upgradeBreaches`).
- **Vodní příkop** – `moatStrip`: zasypávající stojí na prvním suchém bodu ven od hradby (po metru,
  nejvýš 40 m), pruh 4 m (`FORTIFICATIONS.breach.widthM`) sahá stejně daleko dovnitř. Po zasypání
  je voda v pruhu průchozí jako suchý příkop (`march-grid.ts` – `moatFillPace`, `rampartPace(1)`;
  mřížka se nemění, `Walls.fills` z `moatFills(b)`), muži přejdou k hradbě. Zamrzlý příkop
  (prosinec až únor) je suchý už v mřížce (`fortCells`) a v `crossingLayers` – bez zasypání.
  Žebříky jdou zasypaným pruhem (vrchol do 2 m od jeho středu).
- **Podkop** – po pětině práce (`mineUnderground`) má kopáč u místa `Fighter.underground` (nastaví
  `breachWorkStep` každý takt): `canAttack` ho vyloučí (nikdo na něj nemíří ani nebije), `poseOf`
  = `'underground'` (plocha 0). Zřícení = průlom 4 m.
- **Po boji** – `campaign.ts` `breachesOf`: `fortification-breach` nese `segments`, `burned?`
  (průlom ohněm) a `gatesBurned?` (vypálená brána). `applyFortificationBreach`: `burnedDay` (scéna
  – ohořelý průlom), vypálená brána smaže `towerDay` (věž shořela; klešťová zůstává). Přestavba
  a zboření dílu `burnedDay` smažou.
- **Testy** – `__tests__/breach.test.ts` (palisáda oheň 4 + 8 h, s valem napřed 20 h, brána 6 h,
  otepi ze 200 m 2×; volba oheň / odkopání / bez otepí; podkop roštové 120 h, pod zemí od 96
  mužohodin a lučištník je nezasáhne; vodní příkop v létě 12 h + 20 h, v lednu bez zasypání; věž
  shoří s branou; po kouscích 1 / 7 / 40 s ohněm, příkopem a podkopem = vcelku). `battle.test.ts`
  „palisáda mimo bránu ≈ 1 den“ a bitva se žebříky po kouscích (`ladders.test.ts`) si postup
  vynutí rozkazem – bez lesa je nejrychlejší odkopat, šest mužů by palisádu vypálilo.

## Obránci na hradbě (hradby Ú12)

fortifications.md – Obrana bez násobku 2, 3, 6; Střelba a viditelná plocha. Logika
v `domain/war/wall-defense.ts`, `battle.ts`, `stance.ts` a `defenders.ts` jen volají. Čísla
`FORTIFICATIONS.defense` (`perDefenderM` 5, `gateMen` 2, `postInsideM` 1, `throwM` 15,
`throwSeconds` 4, `footStoneM` 3, `walkwayPace` 0,5).

- **Stav** – `Defender.post?` / `Fighter.post?` (stanoviště na hradbě, nebo záloha ve středu
  opevnění; chybí = obránce domu) a `onWall?` (stojí na ochozu či koruně – `true`, jinak chybí);
  `openBattle` je převezme. Staré boje beze změny.
- **Rozestavění** – `planDefense`: muži v útočišti (bez vzdaných) dostanou `wallPosts([opevnění],
počet, den)` po řadě podle id: napřed věže nad branami po 4, pak brány po 2 (± ¼ šířky
  brány od středu; u klešťové brány ramena jeden na 5 m – Brány v bitvě), zbytek po obvodu podle
  délky – mezi branami v mezerách podle délky mezery (brány jsou kotvy), bez bran rovnoměrně; nejvýš ⌊obvod ÷ 5⌋ mimo brány, kdo nedostane, je záloha ve středu. Obvod =
  stěny bitvy (čáry úseků a tětivy rohů); stanoviště 1 m za čarou hradby; `onWall` =
  `crownAt` (do 1,25 m od čáry hradby s korunou – `walkway`, `crib`, `chamber`; druh v místě
  `wallKindAt` přes kusy dílu s branou). 300 m se 2 branami a 20 muži: 4 u bran, 16 po ≈ obvod ÷ 18 (≈ 16 m).
- **Obsazení** – `occupied(opevnění, místo, bojovníci)`: obránce na nohou do 2,5 m, který nestojí
  víc než 0,5 m před čarou hradby. Neobsazeným místem lezec vyleze bez boje (`guardOf` v `ladders.ts`).
- **Muži uprchlíků** v hradišti obsadí hradbu za domácími (stanoviště dostanou až po nich) –
  [Varování – Pobyt v hradišti (Ú9)](#varování-poslové-a-útěk-do-hradiště).
- **Plán obránce se stanovištěm** – `defenderPlan(f, ctx, wall)` → `wallDefenderPlan`: (1) útočník
  ve stavu `fight` uvnitř obvodu (`withinWalls`), bez stěny mezi, v dohledu, do 40 m od stanoviště
  nebo útočí na něj – boj jako u domů (vodítko 40 m od stanoviště), a nedosáhne-li odsud, sleze
  z ochozu; (2) rána zblízka přes hradbu (lezec, muž u paty); (3) posila (`reinforceTarget`) – na
  místě nebo cestou; kdo posilou není a na opevnění dopadají šípy, je v krytu (`cover`) a na
  ochozu nestřílí ani nehází; (4) na místě střela či hod odsud; (5) zpět na stanoviště. Probíjení
  opevnění má přednost (`breakoutPlan`). `walkTo`: podél
  hradby (střed cesty do 2 m od čáry) zůstane na ochozu polovičním tempem (`stepToward` × 0,5), přes
  nádvoří sleze a jde po zemi plným; na místě s korunou na ochoz vystoupí.
- **Posily** – `reinforceTarget(f, w)` čte přidělení taktu (`assign`, jednou za takt v `WallWorld`):
  místa = žebříky s lezcem ve fázi `lean` / `up` / `over` / `down` (1 útočník) a rozdělané průlomy
  s prolamujícími (`breachAt`), v pořadí stavu; na místě zůstanou obránci, kteří tam jsou (nejvýš
  počet útočníků), chybějící doplní nejbližší volní obránci téhož opevnění (nejbližší střed) podle
  času cesty – volný = se stanovištěm, neřízený, ne u žádného místa, nebojuje zblízka (`aim` do 3 m).
  Stanoviště posily = 1 m za čarou hradby u místa.
- **Rány přes hradbu** – `battle.ts` `strikeOf(f, t, w)`: druh podle vzdálenosti `strikeReach`
  (zblízka 3 m; luk 20–60 m, kdo má luk; z ochozu hod do 15 m – i muž rodu pod 20 m, návrh Clauda),
  pak každá stěna na úsečce mezi nimi (`crosses`, druh `lineWall` – `WallLine.along` přes
  `wallKindAt`, jednou za takt) musí ránu pustit: `canStrikeAcross(hradba, od, na, melee | ranged)`
  – bez hradby a plot ano, palisáda bez ochozu ne, hradba s korunou z ochozu dolů zblízka do 3 m
  a ven na dálku, zespodu jen na dálku na obránce na ochozu (`parapet`), jinak ne. Lezec nahoře na
  hradbě (`onWallTop` – na vrcholu žebříku) za hradbou není. Hod: `bowShot` s dovedností 20,
  poloviční zásah, cooldown `throwSeconds`; kámen k patě je rána zblízka (plný zásah, los 1 : 1).
  Rána přes hradbu (`across`) dá obránci na ochozu pózu `parapet`. Útočník, který na cíl nedosáhne,
  jde k němu (`approach` – průchod, žebřík, prolomení).
- **Testy** – `__tests__/wall-defense.test.ts` (300 m obvodu a 20 mužů, strop 1 na 5 m, koruna
  podle druhu, obsazení, lezec neobsazeným úsekem bez boje, posila k žebříku po ochozu ½ tempa
  a za palisádou plným, přes nádvoří po zemi, za útočníkem uvnitř sleze a zase vystoupí, tabulka přes hradbu, hod a kameny, předprseň 0,25,
  luk z ochozu ano a přes palisádu ne, kameny na prolamujícího, Review Focus 5, bitva po 1 / 7 / 40
  přes JSON = vcelku); `battle.test.ts` – obránce za palisádou šípem ne, na ochozu poloviční zásah;
  `stance.test.ts` – muži v útočišti obsadí hradbu.

## Kryt pod palbou, bod zlomu za hradbou a probíjení (9. 11. 2026)

fortifications.md – Obrana bez násobku 3 (Kryt pod palbou a bod zlomu jen v útoku; Bod zlomu
a probíjení). Logika v `domain/war/rout.ts`, plán obránce ve `wall-defense.ts`, takt v `battle.ts`.
Čísla `FORTIFICATIONS.defense.coverSeconds` (30 s), `WAR.combat.aim.visibleM2.cover` (0,025 –
los 1 : 10 proti předprsni), `WAR.rout` (útěk od 50 zdraví, matky dětí do 7 let, staří od 60),
`WAR.breakout` (30 % ztrát, brána do 30 m, slabě hlídaná = nejvýš ½ útočníků proti probíjejícím,
shromáždění do 6 m nejvýš 60 s).

- **Stav** (vše volitelné, staré boje beze změny): `Fighter.cover` (v krytu – plán ho nastaví každý
  takt), `shotDown` (srazilo ho ostřelování přes hradbu mimo místo útoku), `surrendered` (vzdal se –
  stav `fled`); `BattleState.underFire` (opevnění → takt posledního šípu přes hradbu na jeho
  obránce), `openedGates` (otevřeli obránci – nezavřou se), `routed`, `breakouts`
  (`BattleBreakout` – opevnění, úsek brány, les `to`, takt, `gathered`), `taken` (dobytá útočiště);
  `ShelterReport.refugeAt` (opevnění každého z `refuge`).
- **Kryt pod palbou** – výstřel útočníka přes hradbu (`strike.across`) na obránce se stanovištěm
  zapíše `underFire[opevnění]`; `wallDefenderPlan`: obránce bez posily (`reinforceTarget` null) je
  do 30 s po posledním šípu v krytu – na ochozu a koruně nestřílí ani nehází (`poseOf` → `cover`).
  Kdo jde k žebříku či průlomu nebo ho brání, nebo bojuje s útočníkem uvnitř či zblízka, kryt nemá.
- **Bod zlomu jen v útoku** – zásahy taktu se značí: šíp či hod přes hradbu na obránce se
  stanovištěm bez posily (`fromAfar`) je ostřelování; kdo padne jen od takových zásahů, má
  `shotDown`. `breakpoints`: skupiny domů bez obránců se stanovištěm; `fortBreakpoints` – obránci
  opevnění (stanoviště podle `fortOfPost`) = jeden celek, `assaultLossShare` = padlí a ranění bez
  `shotDown` ÷ všichni.
- **Chaos** (`routFort` při 45 %) – `routed`, brány opevnění se otevřou (`openGates`), probíjení
  končí; pod 50 zdraví `surrender`, jinak `startFlee`. `fleeStep`: obránce se stanovištěm jde
  `openingRoute` (nejbližší průchod, body před a za ním), bez průchodu nebo zaseknutý na cestě
  `cutOff` (vzdá se; poslední muž rodu bojuje dál).
- **Probíjení** – `orderBreakout(stav, bojiště, opevnění, úsek)` otevře bránu a zapíše
  `BattleBreakout`; veřejně `orderDefenderBreakout(stav, bojiště, opevnění, úsek?)`. Brána
  `breakoutGate` – nejméně útočníků do 30 m; velitel obrany (`fortBreakpoints`, při 30 % ztrát
  v útoku, jednou na opevnění) jen volnou či slabě hlídanou (nejvýš ½ proti probíjejícím), rozkaz
  hráče (`weakOnly` false) i hlídanou (návrh Clauda – hráč rozkáže sám). Hráč obránců: záměr tažení
  `{ kind: 'breakout', fort, segment? }` (`campaign-types.ts`) zapíše `BattleState.breakoutOrder`,
  takt ho na začátku provede (před bodem zlomu). `stepCampaign` z cizích záměrů přijme jen
  `breakout` (a ten nikdy od vůdce tažení). `breakoutStep` (před stěnami
  taktu): `gathered`, když jsou všichni na nohou do 6 m od brány nebo uplynulo 60 s; kdo je venku
  u lesa (bez lesa hned venku), je `fled`. `breakoutPlan`: z ochozu dolů, útočníka do 3 m bije,
  jinak k bodu uvnitř průchodu (`WallWorld.exits`), po vyražení po ose průchodu ven a do lesa.
- **Dobytí útočiště** – `refugeForts` (opevnění s obránci se stanovištěm nebo s lidmi
  v útočišti), `markTaken` po ranách (útočník ve stavu `fight` uvnitř obvodu – `withinWalls`).
  Výsledek `attackers` až bez obránců a s dobytými útočišti; mezitím jdou neřízení útočníci
  (kromě „držet místo“) dovnitř (`enterRefuge` – k průchodu kolem hradby `leadTo`, jím dovnitř;
  bez průchodu přes hradbu). NPC velitel (`npc-commander.ts` – `emptyRefuge`): nedobyté útočiště
  bez obránců s nejrychlejším postupem nad 1 herní den → `plunder`. `fortPassages` bere otevřené
  brány jako průchod.
- **Po boji** (`campaign.ts` – `raidResultOf`): útočiště dobyté = `taken` neprázdné (dřív stačilo,
  že někdo z útočiště bojoval); vzdaní z boje a lidé dobytého útočiště podle `refugeRout`
  (`rout.ts`) se odvedou jako vzdaní.
- **Rozkaz hráče „Probít se“** (`application/order-breakout.ts` – `orderBreakout(deps, { playerId,
villageId, today, nowMs })`): právo `war` ověří use-case sám (`requireRight` – správce cizí vsi ho
  nemá), bez zámku vsi (stav vsi se nemění, rozkaz v boji nečeká na dopočet – návrh Clauda). Najde
  cizí tažení s bojem u vsi (`activeAgainst`, fáze `raiding`, cíl na mapě sídla), opevnění bojiště
  (`battleForts` z mapy `cells.mapOf` a opevnění vsi) a komu rozkázat (`breakoutChoice` v `rout.ts`:
  opevnění s branou před bodem zlomu, bez probíjení a bez čekajícího `breakoutOrder`, s obránci na
  nohou – víc takových: nejvíc obránců; jinak `BreakoutBlock` `over` | `undefended` | `routed` |
  `underway`). Zapíše záměr `breakout` na takt teď + 2 (`queueCampaignIntent`); bránu vybere takt.
  Důvody česky v `BREAKOUT_BLOCKED` (+ `BREAKOUT_NO_GATE`) – jediné místo textů i pro tlačítko.
  Web: server action `orderBreakout({ villageId })` → `orderBreakoutForPlayer` (`lib/war-scene.ts`),
  tlačítko web-ui.md – Rozkaz „Probít se“.
- **Ve scéně** – `WarSceneFighter` nese `cover` a `surrendered` (cizí jen v dohledu jako ostatní);
  `WarSceneView.breakout { blocked }` jen obránci s opevněním s branou při boji (`breakoutChoice`
  nad `input.forts`; rozhodnutý dnes = `over`). Scéna (`army.ts`): kryjící se na ochozu stojící na
  místě je skrčený (`fighterClip` → `weed`, podřep bez zbraně – klip vsi, žádný nový vertex buffer),
  vzdaný (`fled` + `surrendered`) zůstane stát, kde se vzdal (na ochozu ve výšce ochozu), klipem
  `idle` (ruce dolů, bez zbraně), neotáčí se (`surrenderedFigure`); utečený dál zmizí.
- **Testy** – `__tests__/wall-cover.test.ts` (půl hodiny ostřelování 12 obránců šesti lučištníky –
  kryt, bez bodu zlomu, padlí jen `shotDown`, pod 60 zásahů; padlí ostřelováním do bodu zlomu
  nejdou; po žebříku obránce u vrcholu bez krytu, jinde kryt; chaos – brána otevřená, raněný se
  vzdá, zdraví utečou branou; útočiště dobyté až s útočníkem uvnitř; bez brány odříznutí; po
  kouscích přes JSON = vcelku; probíjení velitelem při 30 % volnou branou do lesa, hlídanou ne,
  rozkaz s branou a před bodem zlomu, záměr hráče přes `breakoutOrder`, rozkaz hráče i hlídanou
  branou, `breakoutChoice` a důvody; `refugeRout`); `npc-commander.test.ts` – záměr `breakout` od
  obránce tažení provede, od vůdce ne; `scene-view.test.ts` – kryt, vzdaní, `breakout` a mlha;
  `application/__tests__/order-breakout.test.ts` – záměr na takt + 2, cizí hráč, důvody. Nájezd na
  palisádu s ochozem (`palisade-walkway-raid.test.ts`) dál končí žebříky a útočníkem uvnitř;
  `npc-commander.test.ts` – NPC velitel na palisádu s ochozem a bránou: proseknutí, bod zlomu
  v útoku, útočiště dobyté s útočníkem uvnitř.

## Hradba na koruně valu (9. 11. 2026)

fortifications.md – Hradby a obrana, Druhy – Pás s valem (Martin 9. 11. 2026: „Pokud se jedná
o palisádu nebo polský plot, má stát na koruně valu“). Čísla `FORTIFICATIONS.defense.crest`
a `assault.climbSeconds.upRampart`; testy `__tests__/rampart-crest.test.ts`.

- **Čára hradby** – `wallLineInM(opevnění)` (`fortification/band.ts`): val na křivce (opevnění
  druhu `rampart`) 7 m od křivky (`rampartBand.ditchM` + `footM` ÷ 2), jinak 0 (val vně má korunu
  na křivce). `battleForts` posune úseky na čáru hradby (`onWallLine` – body `bandLine` na ose
  ohybu, nejmenší ohyb valu 8 m se nepřehne) a brány v kopii opevnění bojiště poměrně s délkou
  úseku (`offsetM × nová ÷ stará tětiva`) – stěny, stanoviště, žebříky (vrchol na koruně, pata 1 m
  vně na vnějším svahu), místa prolomení, klešťová brána i scéna boje (`battleWallsOf` – lezci
  a obránci zvednutí o val stojí na koruně) tak berou korunu. Klešťová brána: `endM` = pás − čára
  hradby + ulička (`battlePincers`).
- **Obránce na koruně** – `crestAt(opevnění, bod)`: do 1,25 m za čarou hradby (ne víc než
  0,5 m před ní) dílu s hotovým nezbořeným valem (`segmentRampart`), mimo průchod brány valem
  (½ šířky brány od středu); mezipaměť na objekt polohy (`WeakMap` – poloha se nemění na místě).
  `towerReach` – obránce na koruně dohled `sight.openM` + 25 m a luk `bowMaxM` + 5 m (věž má
  přednost); `reachOf` přidá dohoz – z ochozu na koruně `throwM` + 2 m (`strikeReach(…, bowMaxM,
throwM)`). `ctx.sees` v taktu – z věže `tower.sightM`, z koruny `openM + crest.sightM` (jen
  když bojiště val má).
- **Útočník přes val** – `fortCells` vrátí i `crest` (buňky dílů se stojící hradbou na hotovém
  valu); `marchGrid` jim k `MARCH_WALL` přidá `MARCH_RAMPART` (tempo 0 – pochod neprojde, jen
  branou). V boji `paceAt(…, útočník)`: buňka stěny s valem → útočník `rampartPace(1)` (¼, plnou
  výškou – mřížka nese u stěny jen příznak), obránce plné tempo; `rampartFatigueStep` po sestupu
  z takové buňky unaví jen útočníka. Žebřík: `climbTicks(druh, výška valu)` – `up` + `upRampart`
  (2 s) × výška (`ladders.ts` – `climbTotal`, `climbStep`; plot beze změny – na val se vyleze
  chůzí). NPC odhad hodin (`npc-assault.ts` – `climbHours`) val nepočítá (2 s proti hodinám
  výroby nehrají roli).

## Brány v bitvě – ulička a věž (hradby Ú19)

fortifications.md – Hradby a obrana, Brány. Geometrie a obránci ve `wall-defense.ts`, stěny
a místo prolomení v `battle.ts` (`wallsOf`), pochod v `march-grid.ts`. Čísla
`FORTIFICATIONS.pincerGate` a `FORTIFICATIONS.tower` (4 obránci, dohled 250 m, luk 80 m).

- **Klešťová brána na bojišti** – `battlePincers(bf, den)` (`BattlePincer`, mezipaměť na opevnění
  a den): stojící klešťová brána (`gatePincerStands`) na dílu, který stojí nebo je prolomený
  (`pincerBandInM`); osa na čáře úseku (bitva bere úsek jako úsečku), dovnitř `-outward`, vrata
  `endM` = vnitřní okraj pásu + 12 m, druh ramen `pincerArmKind`, `tower` = `gateTowerStands`.
  `pincerPoint(p, podél, dovnitř)` – bod v ose brány.
- **Stěny** (`wallsOf`, `WallLine.pincer`) – ramena jako dvě úsečky po stranách uličky od čáry
  hradby po vrata (druh ramen předem – rány přes ně podle `canStrikeAcross` jako přes ochoz); stojí
  i na prolomeném dílu (návrh Clauda – vlastní stěny s ochozem; zbořený díl je vezme). Ústí uličky
  v hradbě je vždy otevřené; zavřená vrata jsou úsečka přes uličku na jejím vnitřním konci,
  otevřenými vede průchod od 3 m před branou po 3 m za vraty. Prolomený díl (i vrata) – mezera
  jako dosud. Ramena ani vrata se nepřelézají: `approach` hledá žebřík jen přes hradbu na cestě
  (`firstWall(…, climbable)`), jinak prolamuje.
- **Vrata** – místo `gate` 1 m před vraty v uličce; `Spot.maxMen` = `pincerGate.maxMen` (4) –
  víc prolamujících se k vratům nevejde (`chooseSpot`).
- **Obránci** – `wallPosts(opevnění, muži, den)`: napřed věže (`towerPosts` – 4 rovnoměrně přes
  uličku 1 m za vraty), pak brány; klešťová brána místo 2 v hradbě ramena – na každém jeden na
  5 m ochozu jako na hradbě (⌊`endM` ÷ 5⌋, nejméně 1; Martin 9. 11. 2026: „Ramena jsou součástí
  brány. Obránce jak říkáš“), rovnoměrně po délce ramene 1 m od uličky, po dvojicích (levé, pravé)
  od středu uličky za pásem – odtud zasahují útočníky v uličce z obou stran (hod do 15 m, luk). `planDefense` (`stance.ts`) dá na věž napřed muže rodu (jen když věž stojí – jinak
  pořadí beze změny). `crownAt` – rameno i plošina věže jsou ochoz (`onWall`). Posila k vratům
  (`placeAt`): s věží na ni, bez věže na rameno vedle vrat.
- **Věž** – `towerReach(f, {forts, day})`: obránce na ochozu věže (`towerAt`) vidí
  `tower.sightM` a dostřelí `tower.bowMaxM`, jinak `WAR.sight.openM` a `WAR.combat.bowMaxM`.
  `strikeReach(f, t, bowMaxM)` a `inSight(grid, od, kam, openM)` mají dosah parametrem; `battleTick`
  dá věži dohled podle polohy (`towerAt` – kdo stojí na plošině věže), luk v `strikeOf`. Kryt na věži
  jako ochoz (`poseOf` – `parapet`). Vypálená brána v boji vezme věž hned (`breachedForts` smaže
  `towerDay` v kopii opevnění taktu; po boji `raid-apply.ts`).
- **Pochod** – `fortCells` přidá ramena (`fortPincerArms`) ke stěnám vždy – i u zavřené brány
  (dřív je `fortWalls` bez zavřených bran vynechal) a u prolomeného dílu; ulička průchozí jen
  u otevřené brány.
- **Testy** – `__tests__/gate-battle.test.ts` (ulička 13,5 m u palisády; k vratům nejvýš 4 a místo
  u vrat; obránci na obou ramenech zasahují útočníka v uličce; věž 4 obránci napřed; z věže luk na
  75 m ano, bez věže ne; věž vidí na 200 m; pochod – ramena blokují u zavřené brány; prolomený díl
  ramena nechá, zbořený ne; bitva s věží po 1 / 7 / 40 přes JSON = vcelku).

## Bariéra dopočtu a dny nájezdu (Ú6.7)

Plán 2026-11-03 – rozhodnutí 13, Úloha 6.7. Ves čeká jen na tažení u sebe, tažení jen na ves ke dni
`d − 1` – obě strany se střídají, cyklus čekání nevznikne.

- **Mez vsi** – port `application/village-holds.ts`: `VillageHolds.limitOf(villageIds)` → mapa ves →
  den, do kterého se smí dopočítat; ves bez tažení chybí. Tažení drží ves, když jeho skupina (nebo
  běžící posel) stojí na mapě vsi nebo políčko od ní, nebo ji drží varováním (Varování, poslové
  a útěk do hradiště – bariéra, Ú3): mez = `CampaignState.throughDay` (poslední den, jehož takty jsou
  všechny spočtené – `dayOfTick(tick + 1) − 1`, počítá ho každý takt, úložiště tak hodiny nepotřebuje;
  bod bez něj → `day − 1`), nedoručené události `outbox` mez sníží na svůj den − 1 (i u vsi daleko –
  posel, kronika). `holdDay`, `heldDay(today, lastDay, limit)` (nikdy pod spočítaný `lastDay`).
  Adaptér `db/adapters/village-holds.ts` (`createVillageHolds` – CTE nad aktivními body:
  `state->'groups'`, `state->'alarm'` a `outbox` se rozbalí jednou na tažení; aktivní tažení najde
  index `campaign_status_idx`, body s nedoručenými událostmi částečný index
  `campaign_checkpoint_outbox_idx` – body skončených tažení se nečtou; body výjezdů vojvody stejně,
  navíc drží domovskou ves běžícího výjezdu – journey.md, Úložiště; `villagesNearCampaigns`
  – přednostní vsi = všechny držené vsi kromě těch jen s nedoručenou událostí), úložiště vsí ho
  nese jako `VillageRepository.holds` (patří k dopočtu jako schránka; `cachedVillages` ho propouští).
- **Dopočet vsi** – `updateVillage` se zeptá na mez při každém pokusu a dopočítá ves jen do
  `heldDay`; akce `change` dostane ves k tomu dni. `advancePlayer` vezme meze všech vsí hráče jedním
  dotazem: ves na mezi se nenačítá a do nejstaršího dne dávky se nepočítá (nebrzdí ostatní vsi);
  `closeAtDay` počká, až vsi doběhnou (všechny na cílovém dni).
- **Tažení** – `computeCampaign`: `villageAt(v, d)` = uložený stav, má-li `lastDay ≥ d − 1`, jinak null
  (takt čeká; ves se v dalším kole načte znovu). Čeká-li tažení na ves a postoupilo, **bod se uloží
  hned** – mez vsi povyroste na den, na který tažení čeká (jinak by čekaly obě strany). Ves dopočtená
  dál, než ji tažení drželo, dá svůj stav (o den novější – výsledek pak závisí na tom, kdo počítal
  dřív). U tažení, které stíhá hodiny, to nenastane: mez platí už na sousedním políčku a přejít
  políčko (1920 m) trvá i jezdcům přes 4 herní dny. Zbývá den vyhlášení (vyrazí týž den – ves
  shromaždiště mohla mít spočtený dnešek) a dohánění tažení po výpadku o víc dní – zatím otevřené.
- **Dny nájezdu** – `watchVillages` po každém taktu (kromě shromáždění a konce): každá ves na mapě,
  kde stojí skupina s aktivním mužem a které vojsko škodí (`harmless`), dostane na každý den
  `raid-day { campaignId }` **na týž den** (bariéra ji před tím dnem drží) – `VillageState.raidDay`;
  `raidHiding(state, day)` (`domain/village/fortification/state/raid-day.ts`) zastaví práci jako hašení požáru (dílny,
  milíře, `villagersToday` prázdné). Den po odchodu vojska ves pracuje. **Od 9. 11. 2026 až od
  varování** (`isWarned` – [Varování, poslové a útěk do hradiště](#varování-poslové-a-útěk-do-hradiště),
  Ú2) nebo když se na mapě vsi bojuje (cíl ve fázi `raiding`); do té doby lidé pracují dál. Signál
  hrozby `threat-signal` `army-seen` jde s varováním (`sightAlarms`). Paměť `CampaignState.raidDays`
  (ves → poslední den).
- **Posel** (do 9. 11. 2026) – ves, kterou vojsko prošlo a patřila témuž hráči jako cíl, posílala do
  cíle `army-seen` (`CampaignWorld.messengerTo`, `messengerSent`). **Zrušeno v Ú2** plánu 2026-11-09:
  posla do hradiště posílá hráč nebo správce (Ú5); `messengerTo` tažení už nevolá, `messengerSent`
  a `VillageState.armySeen` zůstaly kvůli starým bodům (čtou se – nedoručený `army-seen` ves zapíše,
  `campaignBattle` ho bere jako varování). Při otevření boje `planDefense({ warned })` – postoj platí
  dřív, do útočiště doběhnou všichni, kdo se vejdou (brány se zavřou až za nimi).
- **Worker** – přednostní vsi `WorldQueue.priorityVillages()` a jejich meze jdou do
  `behind(worldDay, limit, holds)` (docs/code/worker.md – Přednostní vsi).
- **Testy** – `domain/village/fortification/state/__tests__/raid-day.test.ts` (den nájezdu bez práce, den nato práce, po
  kouscích = vcelku, starý posel), `domain/war/__tests__/raid-watch.test.ts` (dny nájezdu až od
  varování, signál jednou, nespatřené vojsko – ves pracuje, neškodné vojsko, bariéra zastaví takt,
  posel z prošlé vsi zmizel), `stance.test.ts` (varovaná ves – útočiště i s útočníky u brány),
  `apps/worker` `loop.test.ts` (krátký spánek), `packages/server/src/__tests__/campaign-race.db.test.ts`
  (souběh worker vsí + tažení + web = jeden proces, do 60 s, dny nájezdu – vojsko stojí na dohled
  staveniště zakladatelů Vlkova, posel do Kněžic už nejde, ves daleko na dnešku; oba
  světy mají pevný `weather_seed` sídel – v DB je náhodný a jiné počasí by vsi rozešlo).

## Postoje vsi a včasný útěk (Ú6.9)

Rozhodnutí: `VillageState.defense?: { stance }` (`DefenseStance` = `defend` | `flee`; starší `surrender` převádí `stance-surrender` na `flee`),
bez nastavení `flee` (`stanceOf`, `WAR.flight.defaultStance`). Postoj mění akce `setDefenseStance`
(`application/set-defense-stance.ts`, `ACTION_RIGHTS` → právo **`war`** – obrana vsi je válka, správce
cizí vsi ani senior ji nemají; držitel vsi ano). Čísla útěku: `WAR.flight` (25 / 10 kg, děti od 7 let,
návrat za 1 den), `WAR.surrenderRatio`, `WAR.pitFoundChance`.

- `domain/war/forest-doors.ts` – **dveře lesa** (plán 2026-11-16-dense-forest, Rozhodnutí 10; Martin 16. 11. 2026: vesničané utečou do hustého lesa a zmizí jako do budovy, vojsko je nenajde ani
  nepronásleduje): `nearestForestDoor(grid, from)` – střed nejbližší průchodné buňky, která v 8
  směrech sousedí s neprůchodnou buňkou hustého lesa (`MARCH_FOREST` a `pace` 0 – brod v hustém lese
  s `pace` 1 les neotevírá), remíza nižší index; index po přihrádkách je jeden na mřížku
  (`nearestForestOf` v `ladders.ts`, sdílí ho žebříky, dříví a útěk). `nearestReachableForest(grid,
from)` totéž jen mezi dveřmi ve stejné souvislé oblasti (`marchAreas`, O(1), bez zaplavení) – les jen za řekou bez brodu je null.
  Použití: `refugeOptions` (les → `no-forest`), `Evakuace – Ukrýt v lese`, postoj `planDefense` (null
  → při přesile vzdání, jinak obrana); bod zlomu v bitvě (`rout.ts`) míří k nejbližším dveřím bez
  ohledu na dosažitelnost (levný dotaz po tiku).
- `domain/war/flight.ts` – `nearestForest(grid, from)` (jen `nearestForestDoor`; používá i útěk při
  bodu zlomu v `battle.ts`), `fleeParty(state, day, who?)` (dospělý 25 kg, dítě 7–15 let 10 kg, mladší
  nic, dobytek celý, zásoby nejvýš do výše zásob), `pitFound(seed, pitId, daysInGroup)` (30 % ze
  seedu jámy po 1 herním dni ve skupině domů), `returnDayAfter(dnes)` (+1 den), `isOverpowered`
  (útočníků > 1,5× obránců, jezdec za dva), `isHarmlessArmy(armyHouse, villageHouse, edges)`
  (vlastní rod, pán a vazalové = strom `treeBelow` na kterékoli straně).
- `domain/war/stance.ts` – `planDefense` se zavolá **jednou při otevření boje** (`campaignBattle`):
  1. s opevněním s plochou jdou **všichni** přítomní lidé a dobytek napřed do útočiště – nejbližší
     opevnění, doběh tempem vojska, brány se zavřou, jakmile je první útočník do 30 m (takt
     `gateCloseTick`), `refugeAdmit` rozhodne, kdo se vejde. Muži uvnitř obsadí hradbu
     (`wallPosts` – [Obránci na hradbě](#obránci-na-hradbě-hradby-ú12)), zbytek je záloha ve středu,
     ženy a starší nebojují. Skupina uvnitř se podle postoje nevzdává (14. 11. 2026 zrušen postoj
     `surrender` a pravidlo vzdání za opevněním smazány); bod zlomu a `rout` platí dál;
  2. kdo zůstal venku, jedná po **skupinách domů**: `defend` bojuje; `flee` do lesa (zásoby, dobytek), **bez lesa se
     vzdá při přesile (`isOverpowered`), jinak bojuje**. Poslední muž rodu se nevzdá – uteče do lesa (bez lesa bojuje);
  3. kdo odešel nebo se vzdal, v `BattleState` není (nezapočítá se do bodu zlomu); co odnesl, je
     v `BattleState.shelter` (`ShelterReport`: útočiště, les, vzdaní, `carriedKg`, dobytek) – použije
     Ú6.10 (kořist, jámy), Ú6.11 (vzdaní).
- Neškodná vojska: `CampaignWorld.harmless?(villageId, armyPlayerId)`; v `raidTick` bez boje rovnou
  `turnBack('arrived')`. Upozornění: `CampaignWorld.watcherOf?(villageId)` → při otevření boje
  `CampaignNotice` druhu `foreign-army` (payload `{ villageId, name }`) majiteli vsi.
- Zapojení: `application/step-campaigns.ts` – `StepCampaignsDeps.watchers` (volitelné),
  `villageWatchers(...)` je složí z portů (majitel sídla vsi, `isHarmlessArmy` nad `edgesNear`
  do 8 kroků); worker je předává v `apps/worker/src/main.ts`.
- Včasný útěk skupinou (do hradiště, do lesa) před bojem: [Varování, poslové a útěk do
  hradiště](#varování-poslové-a-útěk-do-hradiště) – Evakuace v tažení (Ú8); `planDefense` platí pro
  ves, která se nerozhodla včas.
- Zjednodušení proti návrhu: rozhodnutí o postoji padá při otevření boje (všichni útočníci na mapě
  jsou „v dohledu“), utíkající lidé se nedohání, domy uvnitř obvodu (zásoby v bezpečí) se
  neodlišují od přibíhajících zvenku, vozy a koně se do útěku nepočítají (jen stáda ovcí, koz, prasat
  a krav). Zásoby a jámy aplikuje Ú6.10 (utečení lidé ve stavu vsi zůstávají).

## Varování, poslové a útěk do hradiště

Návrh: [war.md – Varování, poslové a útěk do hradiště](../design/war.md#varování-poslové-a-útěk-do-hradiště-schváleno-9-11-2026--implementováno);
plán `docs/superpowers/plans/2026-11-09-hillfort-refuge.md` (úlohy Ú1–Ú15, volby „Otevřené – návrh
Clauda“). Co se hýbe v taktech (vesničan běžící domů, posel, skupina uprchlíků), žije v tažení
útočníka (`CampaignState.alarm`); do stavů vsí jdou jen události schránky.

- **Čísla, typy a události (Ú1).** Čísla `WAR.alarm` (`rules-war.ts`; war.md – Čísla): běh 2× pěší
  tempo (`runFactor`), dostižení do 30 m (`catchM`), ~~lhůta hráče 344 taktů = 1 herní den~~
  (číslo lhůty smazáno Úlohou 8 plánu 2026-11-14), obnova přítomnosti
  hráče po 86 taktech (`presenceRefreshTicks` – Hráč ve vsi a mimo ni), hradiště do 8 políček
  (`refugeMaxCells`), odhad cesty × 1,3 (`routeFactor`),
  doména do 3 políček a nejvýš 4 poslové hradiště (`domainRadiusCells`, `hillfortMessengers`), hosté
  uprchlíků do `openUntilDay` (odejdou jen návratem). Typy tažení `domain/war/alarm-types.ts`:
  `CampaignAlarm` (`villages` podle `villageId`, `messengers` a `flights` podle `refId`, `nextRef` –
  `refId` = `<tažení>:a<n>`), `AlarmVillage` (vlastník `AlarmOwner`, spatření `seenTick` / `seenAt`,
  `warnTick`, `by`, posel, skupina, `decided`, kandidáti hradišť `hosts`), `AlarmMover` (políčko,
  poloha, `route`, `leg`, `target` – jako `CampaignGroup`), `AlarmMessenger`, `AlarmFlight`. Záměry
  obránce `IntentBody`: `alarm-messenger`, `alarm-flee` (`FlightMode` = `forest` | `people` |
  `all`), `alarm-domain`. Porty světa (volitelné, Ú6): `CampaignWorld.alarmOf`, `refugeHostsOf`,
  `domainOf`. Upozornění `army-warned`, `refuge-arrived`, `refuge-caught`, `messenger-caught` (texty
  `apps/web/lib/player-notices.ts`, panel války). Stav vsi: `AwayKind` + `refuge` | `messenger`,
  `Guest.bornDay?`, `VillageState.refuge?` (`VillageRefuge` – domov), `refugeStays?` (`RefugeStay` –
  hradiště); `FlightMode` a `RefugeePerson` jsou ve vesnických typech (`types-state.ts` – typy vsi
  válku neimportují). Události schránky `messenger-out` / `-back` / `-caught`, `refuge-depart` /
  `-hidden` / `-caught` / `-arrive` / `-back` – aplikace Ú7. Test `alarm-types.test.ts` hlídá tvar
  přes JSON a zlatý otisk tažení bez varování.
- **Oči vsi a varování během do vsi (Ú2).** `domain/war/lookouts.ts`: `villageLookouts(state, day)`
  – kde vesničané jsou (`Lookout { kind, id, pos }`, pořadí druh, pak id): domy (obydlí i dvorec;
  bez obydlí staveniště zakladatelů – návrh Clauda) vždy, díly polí s políčkem mimo zimu tažení
  (`isMarchWinter`, ne opuštěné), milíře uhlířů s místem, lomy, hromady klád s kládami, sady (první
  čtverec), ohrady; ves, která se dnes skrývá (`raidHiding`), má oči jen v domech, ves bez
  přítomného člověka žádné. `runTicks(grid, from, to)` – doběh po mřížce (`marchPath`, metry louky)
  tempem `WAR.pace.metersPerSecond × WAR.alarm.runFactor`, nahoru na takty; bez cesty vzdušnou
  čarou. `domain/war/alarm.ts`: `sightAlarms(s, tick, ctx, out)` v každém taktu po pohybu
  (`campaignTick`: pohyb → spatření → dny nájezdu): pro ves na mapě se skupinou s aktivním mužem
  (kromě `harmless`), která ještě neví, oči × polohy skupin (`inSight` – 150 m, v lese 50 m); první
  spatření zapíše `AlarmVillage` (`seenTick`, `seenAt` = poloha skupiny, `warnTick` = takt + doběh
  od oka do `villageCentre` – z domu 0, `by: 'villager'` (vojvoda doma – `by: 'lord'`, viz Hráč ve
  vsi a mimo ni), vlastník z `CampaignWorld.alarmOf` –
  `null` = takt čeká, bez portu `{ playerId: null, npc: true, houseId: null }`); pozdější spatření s
  kratším doběhem `warnTick` zkrátí. V taktu `warnTick` (i když vojsko už mapu opustilo)
  `threat-signal` `army-seen` na týž den a majiteli (`watcherOf`, jen cizí vojsko) upozornění
  `army-warned` `{ villageId, name, campaignId }`. `isWarned(s, villageId, tick)`,
  `alarmVillage(s, villageId)`. Mezipaměti volání v `TickContext` (`lookouts` – ves@den, `runs` –
  ves@den:oko). Společné součástky taktu (`MissingData`, `TickOut`, `TickContext`, `tickContext`,
  `gridOf`, `villageEvent`, `cellKey`, `sameCell`) jsou v `domain/war/campaign-tick.ts`.
  `campaignBattle`: `warned` = `isWarned(cíl)` nebo starý `armySeen`. Testy `lookouts.test.ts`,
  `alarm-sight.test.ts` (dům 140 m, uhlíř 600 m – varování o doběh dřív než z domů, les 50 m,
  `raid-day` až od varování, neškodné vojsko, po 1 / 7 / 40 taktech přes JSON = vcelku, upozornění
  jednou, nenačtený vlastník).
- **Bariéra a dotaz na varované vsi (Ú3).** Tažení drží (`db/adapters/village-holds.ts`, mez
  `throughDay` jako u skupin, i daleko od vojska) vsi ve varování (`alarm.villages[].villageId` – i
  ty, ke kterým vesničan ještě běží), kandidáty hradišť (`alarm.villages[].hosts` – zapisuje Ú6) a
  hradiště skupin uprchlíků (`alarm.flights[].hostVillageId`, i po příchodu – dokud tažení běží); id
  mimo uuid se zahodí. Návrh Clauda nad plán: drží i vsi na mapě **běžícího posla** a políčko od ní
  (jako skupina vojska – posel varuje každou ves na trase a tažení pak čte její stav; mez platí s
  předstihem – přejít políčko trvá i poslu na koni po cestě přes herní den). Držené vsi jsou i
  přednostní (`villagesNearCampaigns`) – jinak by je fronta workeru (`world-queue.ts`) brala jako
  pozadu a hráče vybírala dokola. Skončené tažení bez nedoručených událostí nedrží nic. Port
  `CampaignRepository.activeAlarming(villageId)` – běžící tažení, kde je ves cílem, ve varování nebo
  hradištěm skupiny (kandidáti hradišť ne), od nejstaršího (`@>` nad `state->'alarm'`); pro pohled
  na varování (Ú12) a návrat (Ú10). In-memory `InMemoryCampaigns.activeAlarming` totéž. Testy
  `village-holds.db.test.ts` (Ú3), `campaign-repository.db.test.ts`.
- **Hradiště, odhady a volba správce (Ú4).** Čistá doména `domain/war/refuge-choice.ts` (test
  `refuge-choice.test.ts`); tažení ji volá posel (Ú5), dál evakuace Ú8, správce Ú11, pohled Ú12.
  `refugeHostOf(villageId, state, geo, cell, day)` – ves je hradiště, má-li **hotové** opevnění s
  plochou (každý úsek s dostavěným valem nebo hradbou ke dni `day` – návrh Clauda; průlom ani
  chátrání nevadí) a `refugeCapacity > 0`; útočiště = největší takové opevnění (shoda – menší id),
  střed = těžiště obvodu (`RefugeHost`). `flightLoad(state, day, mode)` – vždy všichni přítomní
  (`RefugeePerson` – `man` od 16 let, `line`); „jen lidé“ bez zásob a dobytka; les = `fleeParty`;
  „se vším“ navíc vozy se spřežením (`teamedCarts` – vycvičení voli doma i bez ohrady napřed na
  dvoukoláky, pak čtyřkoláky; vůz na výpravě nebo s platbou za kování doma není) po
  `WAR.carryKg.cart`; zásoby nejvýš `storesKg − reservedSeedKg −` zrno zapečetěných jam (Ú7); tempo
  `GroupPace` – ranění zpomalí, dobytek i vůz jdou tempem stáda. Odhady vzdušnou čarou mezi místy
  světa (políčko = 1920 m): `flightEtaTicks` × `routeFactor` ÷ `marchSpeed`, `leaveMapTicks` k
  okraji mapy ve směru dalšího políčka trasy (trasa je čtyřsousedná), `armyEtaTicks` od místa spatření
  ÷ pěší tempo (bez násobku – obránce počítá s nejhorším), `messengerSpeed` (běh × 2, na koni ×
  1,5). `refugeOptions` (`RefugeOptionsInput` – stav vsi bez toho, co tažení dnes odvedlo, místo
  vsi, mřížka, `seenAt`, takty od spatření, kandidáti) vrátí pro `messenger`, `forest`, `people`,
  `all` `AlarmOption` (`blocked`, `etaTicks`, `leaveTicks`, `armyEtaTicks` – zbývá od teď) a
  `host` + `route` (`refugeRoute` = `worldRoute` bez vyhýbání – tutéž trasu použije posel i skupina).
  Hradiště = kandidát do `refugeMaxCells` s nejkratším odhadem, shoda – menší id. Důvody: `gone`
  (lidé odešli – `fled`, `state.refuge`, nikdo doma), `no-hillfort`, `too-late` (skupina neopustí
  mapu dřív, než vojsko dojde do vsi, nebo trasa vede přes políčko spatření – kromě vlastního),
  `no-forest`, posel `sent` → `no-hillfort` → `no-runner`. `messengerOf(state, day, personId?)` –
  Martin 9. 11. 2026: „Posel jde pěšky“, „Kdo je poslem, volí hráč“ (Ú5): bez volby (i za správce)
  nejmladší zdravý přítomný vesničan 16–44 let pěšky (návrh Clauda: „nejzdatnější“ = nejmladší), bez
  něj nejmladší zdravý muž rodu (návrh Clauda); `personId` = muž, kterého vybral hráč (vesničan
  16–44 let, nebo muž rodu od 16 let), jinak null. Na koni (`MessengerPick.mounted`) jen muž rodu,
  který umí jezdit a má jezdeckého koně – jeho kůň (`Horse.riderId`), samec od 3 let, ves ne po
  termínu kování (`isUnshod`); `RefugeOptionsInput.messengerId` = výběr hráče. `stewardAlarmChoice`
  – posel, jde-li; útěk jen s postojem `flee` a bez vlastního útočiště: `all` → `people` → `forest`
  → nic.
- **Posel z vsi (Ú5).** Pohyb po mapách `domain/war/movement.ts` (`Mover`,
  `stepMover(m, goal, stepM, day, ctx)` → `moved` | `crossed` | `arrived` | `stuck`, `planMoverLeg`)
  – vytažený z `moveGroups` / `planLeg`, skupiny vojska bit po bitu stejně.
  `domain/war/messenger.ts`: záměr `alarm-messenger` (`village`, volitelně `personId` – výběr hráče)
  platí jen od majitele varované vsi (`AlarmVillage.owner.playerId`, `isWarned`; filtr
  `stepCampaign` – `isDefenderIntent`: `breakout` a `alarm-*` jen od cizího hráče, `applyIntent` →
  `applyAlarm`, přítomnost vůdce nemění); `sendMessenger(s, ves, ctx, out, { personId?, by })` –
  stav vsi bez toho, co tažení dnes odvedlo (`alarmTaken` / `withoutTaken`), kandidáti hradišť
  `CampaignWorld.refugeHostsOf` (bez portu [] – „Pán nemá hradiště“; `null` = takt čeká) →
  `refugeHostOf` → `refugeOptions` (posel `blocked` → nic); `AlarmMessenger` (`refId`
  `<tažení>:a<n>`, `departTick`, trasa `refugeRoute` bez výchozího políčka, cíl střed útočiště),
  `AlarmVillage.messenger`, `decided`, `hosts` (kandidáti – bariéra Ú3), `messenger-out` domů na týž
  den; vsi na mapě vsi se dozví hned. Pořadí v taktu (`campaignTick`): pohyb vojska → spatření
  (`sightAlarms`) → `moveMessengers` → `catchMessengers` → dny nájezdu. **Běh**
  `messengerSpeed(mounted)` ÷ takty za sekundu po mřížce pochodu; na nové mapě (`crossed`) varuje
  vsi na ní (kromě hradiště a vsí, kterým vojsko neškodí – `harmless`): nová `AlarmVillage` s
  `by: 'messenger'`, `warnTick` = takt, `cell` = políčko vsi (nové volitelné pole – bez něj
  `seenAt.cell`, `alarmCellOf`), spatření (`seenTick`, `seenAt`) z vsi posla – odhady „Stihnou to“
  počítají od místa a času, kde vojsko viděla ona; ves, které vesničan ještě běží, se varování
  uspíší. Upozornění `army-warned` a `threat-signal` jako u vesničana, signál ale **den nato**
  (rozhodnutí 13 – ves daleko bariéra držet nemusí). V cíli hradiště varované při příchodu,
  `status: 'arrived'`, `messenger-back` domů na den `dayOfTick(příchod + (příchod − odchod))`.
  Nemá-li kudy, nebo tažení skončí (`finish` → `recallMessengers`), vrátí se domů stejně (`recalled`
  – návrh Clauda; jinak by zůstal pryč navždy). **Chycení** (`catchMessengers`, Otevřené 4): skupina
  s aktivním mužem na mapě posla do `WAR.alarm.catchM`, nebo skupina s jezdcem, která ho vidí
  (`inSight`); osud podle `CampaignState.surrendered` (výchozí odvést): pobít – `killed`, odvést –
  vesničan `led` (snímek osoby do `CampaignLoot.people`), muž rodu a šlechtic `captured` – zajetí u
  vsi shromaždiště (`CampaignLoot.prisoners`, klíč `guardPrisonerKey` `<tažení>:<ves>:<osoba>` – i v
  těle události `prisonerId`; starší událost bez něj `prisonerKey` – Ú9; NPC velitel zajme vždy –
  jako po nájezdu), nechat – běží dál; `s.captives`, `messenger-caught` domů den nato, majiteli
  upozornění `messenger-caught` (`fate`). `reportRaid` kořist s poslem slučuje (dřív ji přepsal).
  **Den odchodu** (Review Focus 2): `campaignBattle` bere stav cíle bez lidí z
  `alarmTaken(s, ves, den)` – posel, který dnes vyběhl, v `planDefense` / `defenderRoster` není
  (skupiny, zásoby a stádo – Ú8). Správce a NPC posílají posla pravidlem správce (Ú11). Test
  `messenger.test.ts` (tři mapy v řadě: záměr majitele, cizí záměr, neškodné vojsko, jezdec z rodu
  rychleji, bez muže / bez hradiště nic, chycení do 30 m a jezdcem na dohled, zajetí muže rodu, po 1
  / 7 / 40 taktech přes JSON = vcelku, den odchodu).
- **Hradiště varuje doménu a svět varování (Ú6).** **Porty světa** `CampaignWorld.alarmOf`,
  `refugeHostsOf`, `domainOf` (`null` = svět ještě nenačetl – takt čeká; bez portu rod neznámý
  `UNKNOWN_ALARM_OWNER` – rozhoduje pravidlo, hradiště ani doména žádné); port `messengerTo` zmizel.
  Port aplikace `AlarmOwnerPort` (`application/campaigns.ts`: `ownerOf`, `refugeHostsOf`, `domainOf`
  → `VillageCell`), `StepCampaignsDeps.alarmOwners` – `computeCampaign` (`alarmWorld`) odpovídá
  synchronně z načteného, jinak si dotaz zapamatuje a po `MissingData` ho dočte (vlastník zvlášť –
  s pamětí workeru z `CampaignMemory.owners`; kandidáti hradišť jen u vsi, která do varování
  vstupuje, a pro posla a útěk; neznámá ves = neznámý rod – Hráč ve vsi a mimo ni: Opravy po
  závěrečné recenzi). Adaptér
  `db/adapters/alarm-owners.ts` (`createAlarmOwners`; test `alarm-owners.db.test.ts`): rod vsi =
  živý rod hráče, kterému patří sídlo vsi (`settlement.owner_id` → `house`), `npc` = ves spravuje
  NPC rod (živá `stewardship` druhu `npc` – rozhoduje pravidlo správce; návrh Clauda), hráč bez rodu
  `houseId: null`, neznámá ves null; `refugeHostsOf` = vsi rodu kromě ní a přímých pánů (živé hrany
  `vassalage`, jeden stupeň) do `WAR.alarm.refugeMaxCells`, `domainOf` = vsi rodu (i ona) a přímých
  vazalů – vazal vazala ne; obojí bez archivovaných sídel, spících vsí a vsí bez políčka, od
  nejbližší (shoda – menší id). Zapojení ve workeru (`apps/worker/src/main.ts`) a
  `measure-campaign-db.ts`; `measure-campaigns.ts` má porty v paměti (každá ves NPC, hradiště jen ve
  scénáři varování – Ú11). **Kandidáti hradišť** (`hostCandidates` v `alarm.ts`) se do
  `AlarmVillage.hosts` zapíší, jakmile ves do varování vstoupí (`sightAlarms`, posel –
  `warnByMessenger`) – všichni v dosahu, i bez opevnění (tažení čte jejich stav – bariéra Ú3 je drží
  už před volbou); `sendMessenger` je přepíše týmiž. **Hradiště varuje doménu** (`warnDomain` v
  `messenger.ts`, Otevřené 5): vsi z `domainOf` do `WAR.alarm.domainRadiusCells` políček od místa
  spatření (`seenAt` hradiště), které nevědí, nikdo k nim neběží a vojsko jim škodí, nejbližší k
  místu spatření první (čtverec vzdálenosti políček, shoda – menší id), celkem nejvýš
  `WAR.alarm.hillfortMessengers` poslů (`AlarmVillage.domain` – jejich `refId`); každý posel jiný
  muž hradiště (`messengerOf` bez volby – nejmladší vesničan pěšky, `alarmTaken` vynechá ty, kdo už
  běží), cíl střed vsi domény, trasa `refugeRoute`, `messenger-out` hradišti na týž den; běží,
  varuje mapy a vrací se jako posel vsi (společné `launch`). **NPC hradiště** (`owner.npc`) rozešle
  posly hned, jak doběhne posel vsi (ne posel hradiště – `AlarmVillage.messenger` odesílatele),
  jednou; vyběhnou až další takt. **Hradiště hráče** čeká na záměr `alarm-domain` (`to` – vybrané
  vsi, v pořadí podle vzdálenosti; platí od majitele varované vsi, i opakovaně do součtu 4) –
  bez hráče (správce, vojvoda pryč) hned, jinak podle přítomnosti hráče (`deciderOf` – Ú11).
  Testy `messenger.test.ts` (NPC hradiště – 4 nejbližší, pátá a vzdálená ne, B už ví; hradiště
  hráče až záměrem, cizí záměr, mez 4; bez portu
  nic, nenačtená doména čeká; po 1 / 7 / 40 taktech přes JSON = vcelku),
  `application/__tests__/alarm-world.test.ts` (smyčka `stepCampaigns` s portem v paměti = vcelku s
  daty předem, dotazy jen na potřebné).
- **Ves na útěku – události schránky, jídlo a hosté (Ú7).** `domain/village/fortification/state/refugees.ts` (test
  `village/fortification/state/__tests__/refugees.test.ts`); `applyInboxDay` volá pro každou z osmi událostí funkci
  `apply…` – mutují stav jako kroky dne, idempotentně (kdo je už pryč nebo doma, se přeskočí; zásoby
  a dobytek nejvýš co ves má). **Odchod** `refuge-depart` – lidé ze seznamu, kteří jsou doma,
  dostanou `away` `{ kind: 'refuge', hostVillageId?, refId }` (bez hradiště = les), zásoby ubudou o
  `carriedKg` – jen obilí, nejvýš volné (bez `reservedSeedKg` a zapečetěných jam; otevřená jáma přes
  `drawGrainPits`), stádo o `herd` (napřed dospělé kusy), ves zapíše `refuge` (první skupina, druhá
  ho nepřepíše – Otevřené 12); kronika `refuge-left` („Lidé odešli do hradiště {jméno}.“ – volitelné
  `hostName` v těle, návrh Clauda), do lesa bez zápisu. **Les** `refuge-hidden` –
  `refuge.hidden = { foodKg, herd }` jednou; kronika „Lidé se ukryli v lese.“. **Dostižení**
  `refuge-caught` – padlí zemřou bez pohřbu (`applyLineManFell` – muž rodu = nástupnictví), odvedení
  zmizí (`removePeople`), zajatí (Ú8 – `captured` s klíčem zajetí `prisonerId`, muži rodu a
  šlechtici) jsou v zajetí u `captorVillageId` (`markCaptive`; bez věznitele zmizí), ostatní
  zůstávají pryč (jdou dál); nezbyl-li nikdo a nic neukryli, `refuge` zmizí; kronika „Vojsko
  dostihlo uprchlíky: padli N, odvedeno M, zajato K.“. **Hradiště** `refuge-arrive` – hosté druhu
  `refuge` s `bornDay`, `untilDay = WAR.alarm.openUntilDay`; pobyt `RefugeStay` (nové pole `people`
  – id uprchlíků, podle nich jídlo a odchod) se zásobami a stádem – stádo se pase u hradiště, do
  stád hostitele nepřibude; týž `refId` podruhé nic; kronika `guests-came`.
  `leaveRefuge(host, refId)` (pro use-case návratu Ú10) odebere hosty a pobyt a vrátí zbylé zásoby a
  stádo (bez pobytu null). **Návrat** `refuge-back` – `away` skupiny zmizí, zásoby + `foodKg` (jako
  obilí) a stádo + `herd` (jako dospělé kusy), z lesa navíc `refuge.hidden` (tělo z lesa nese 0 –
  ukryté vrátí ves sama), `refuge` zmizí; kronika `people-back` druhu `refuge`. **Jídlo**
  `refugeFoodDay` (krok dne těsně před `eat()`): lidé v lese jedí doma (`foodNeedPerDay` –
  `hidesInForest`) napřed z `refuge.hidden.foodKg`, hosté pobytu napřed ze `RefugeStay.foodKg` (dítě
  jí podle věku, robotu dělá jen dospělý 14–44 let – `guestFoodNeed`, `guestLaborToday`), pak ze
  zásob vsi. Skupina do lesa jí doma už od odchodu – Ú8 ji v `flightFoodDay` vynechá. **Posel**
  `messenger-out` – `away` `{ kind: 'messenger', hostVillageId: hradiště, refId }`; s `mounted`
  (Martin 9. 11. 2026: na koni jen muž rodu, který umí jezdit a má jezdeckého koně) jede na svém
  jezdeckém koni (`Horse.riderId`), jinak na nejlépe vycvičeném volném – `away.horseId` (nové
  volitelné pole `PersonAway`); kdo je pryč jinak, posla nedělá. `messenger-back` – doma i s koněm
  (kronika `people-back` druhu `messenger`); `messenger-caught` – `killed` padne (bez pohřbu), `led`
  zmizí, `captured` (Ú5 – muž rodu, šlechtic) zajat u `captorVillageId` (`markCaptive` jako po
  nájezdu; bez věznitele zmizí), kůň `horseId` se nevrátí (z ohrady i bez ohrady); kronika „Posel
  {jméno} padl.“ / „Posla {jméno} odvedlo vojsko.“ / „Posla {jméno} zajalo vojsko.“ (bez jména
  vesničan). Po kouscích dopočtu 1 / 3 / 10 dní = vcelku.
- **Evakuace v tažení (Ú8).** `domain/war/evacuation.ts` (test `evacuation.test.ts`). Záměr
  `alarm-flee` (`mode` – **Do hradiště – jen lidé** `people`, **Do hradiště – se vším** `all`,
  **Ukrýt v lese** `forest`) platí od majitele varované vsi (`applyAlarm`) →
  `departFlight(s, ves, mode, ctx, out, { by })` (správce – Ú11): ves ještě neodešla
  (`AlarmVillage.flight`), boj u ní nezačal (pak rozhoduje postoj – `planDefense`) a `refugeOptions`
  volbu pustí (kandidáti hradišť `refugeHosts` – přesunuto z `messenger.ts` do `alarm.ts`; les je
  nepotřebuje). Složení `flightLoad` ze stavu vsi bez toho, co tažení dnes odvedlo; `AlarmFlight`
  (`refId` `<tažení>:a<n>`, `people` – kdo odešel, `carried` – co odnesli, `wounded`, cíl střed
  útočiště hradiště po trase `refugeRoute`, nebo dveře nejbližšího dosažitelného hustého lesa mapy vsi – `nearestReachableForest`; skupina nikdy nestojí v neprůchodné buňce),
  `refuge-depart` domů na týž den s `hostName` (nový volitelný port `CampaignWorld.villageNameOf` –
  jména načtených vsí; `computeCampaign` je plní spolu se stavem vsi, takže výsledek nezávisí na
  kouscích). Skupina do hradiště sní hned jídlo dne odchodu (doma už nejí), pak v denním kroku
  (`flightFoodDay` v `dailyStep`) každý den podle věku (`guestFoodNeed`) ze svých zásob; bez jídla
  jde dál. Skupina do lesa jí doma (Ú7) – vynechá se. **Cesta** (`moveFlights` po poslech):
  `stepMover` tempem `marchSpeed` (pěší, ranění pomaleji, dobytek a vozy tempem stáda); v lese
  `hidden` + `refuge-hidden` domů na týž den (zásoby a stádo, které donesli), v hradišti `arrived` +
  `refuge-arrive` hostiteli den nato (zbylí lidé, zásoby po jídle, stádo; `fromName`) a majiteli
  upozornění `refuge-arrived` (`hostName`). Nemá-li kudy, nebo tažení skončí (`finish` →
  `settleFlights`), skupina dojde, kam šla (návrh Clauda – zbytek cesty se nesimuluje).
  **Dostižení** (`catchFlights` po pohybu, Otevřené 8): skupiny vojska s aktivním mužem na mapě
  skupiny do `WAR.alarm.catchM` (cíleně je nepronásleduje); přesila (`isOverpowered` – jejich muži
  proti mužům uprchlíků) → skupina se vzdá jednou (`caughtTick`): lidé podle
  `CampaignState.surrendered` (výchozí odvést) – pobít padnou, odvést: vesničan do
  `CampaignLoot.people`, muž rodu a šlechtic do zajetí (`CampaignLoot.prisoners`, klíč
  `guardPrisonerKey` `<tažení>:<ves>:<osoba>` – osoba není z napadené vsi; NPC velitel zajme vždy),
  nechat – jdou dál; **poslední muž rodu** vsi se nevzdá a jde dál sám (návrh Clauda – „uteče
  lesem“; jinak by zůstal pryč navždy). Zásoby do nosnosti (`lootCapacity` bez už nesené kořisti) a
  celé stádo do kořisti (`takeLoot` – `CampaignLoot.detail` se sčítá – `sumLoot`; `reportRaid` ho už
  nepřepíše a nosnost nájezdu odečte kořist z uprchlíků), zbytek zásob zahodí; kdo padl, byl odveden
  nebo zajat, je v `AlarmFlight.lost`, nikdo nejde dál → `caught`. Domů `refuge-caught` den nato
  (nové volitelné `captured` a `captorVillageId` – `applyRefugeCaught` zajatce `markCaptive`),
  majiteli upozornění `refuge-caught` (počty). Bez přesily jde dál. **Den odchodu** (Review Focus
  2): `alarmTaken(s, ves, den)` vrací i lidi, nesené obilí a sehnané stádo skupin, které odešly v
  den `den` (`carried`; stav vsi ode dne nato odchod zná), a zajatce a odvedené tažení z té vsi
  (`s.captives` bez ohledu na den – jdou s vojskem do konce tažení, ves o nich ví až po zprávě;
  plán 2026-11-14, Úloha 5b), `withoutTaken` je odečte stejně jako
  `applyRefugeDepart` (`takeGrain`, `takeHerd` – exportované z `village/fortification/state/refugees.ts`);
  `campaignBattle` i `reportRaid` (kořist, odvedení, zajatí) počítají se stavem bez nich. **Prázdná
  ves**: odešli-li všichni, v boji nikdo nestojí a útočník vezme, co zůstalo (zásoby mimo nesené,
  nesehnaný dobytek, osivo a zapečetěné jámy jako dřív). `alarmTaken` / `withoutTaken` jsou nově v
  `evacuation.ts` (`messenger.ts` je reexportuje). Testy `evacuation.test.ts` (se vším – zásoby po
  jídle v hradišti, prázdná ves a bilance obilí; jen lidé – rychleji, kořist vezme stádo a zásoby;
  les týž den; přesila – kořist, odvedení, poslední muž rodu jde dál; bez přesily dál; pobít; zajetí
  mužů rodu; den odchodu – boj téhož dne; blokovaná volba a cizí záměr; po 1 / 7 / 40 / 400 taktech
  přes JSON = vcelku).
- **Pobyt v hradišti – útočiště a obrana (Ú9).** Uprchlíci bydlí v hradišti jako hosté druhu
  `refuge` (Ú7 – `applyRefugeArrive`); když vojsko hradiště napadne, `campaignBattle` je bere z
  hostů jako hosty z ochrany: `guardGuestsOf` – přítomní (osoba ve stavu domovské vsi je pryč s
  `refuge` u hradiště; domov nenačtený = takt čeká), **muži od 16 let** (`refugeeFighter` –
  `WAR.army.minAge`; muž rodu v každém věku, vesničan do `AGE.elder`) jsou obránci pod zápornými
  čísly (`GuardGuest.refugee`, `Defender.refugee`, `CampaignGuard.kind` `refuge`, vesničan s
  `villager`); muž rodu bojuje jako muž rodu s lukem, vesničan silou vesničana podle štěstí hradiště
  (návrh Clauda), bez luku. Ženy, děti, starší a ranění muži se stády pobytů (`RefugeStay.herd`)
  jdou do `planDefense` jako `StanceInput.refugeLoad` (`refugeLoadOf`; bez uprchlíků chybí –
  rozdělení jako dřív). **Místo v útočišti** (`admitWithRefugees`, Otevřené 9): napřed lidé vsi (kdo
  stihne bránu), pak muži uprchlíků (návrh Clauda – obsadí hradbu), pak ostatní uprchlíci (bydlí
  uvnitř – brána je nezastaví, zásoby nenesou), pak dobytek vsi a nakonec stádo uprchlíků – co se
  nevejde, stojí venku (stáda první); uprchlíci jdou do útočiště nejbližšího dvorci. Muži uprchlíků
  v útočišti dostanou stanoviště na hradbě za domácími (obsazenost roste), kdo se nevešel, jedná se
  skupinou dvorce podle postoje hradiště (jako hosté z ochrany – návrh Clauda místo „u brány“).
  `ShelterReport.refugees` (`RefugeesPlace`) – kolik nebojujících uprchlíků a kusů je uvnitř a
  venku. **Ztráty** jako hosté z ochrany (`reportGuards`): domov dostane `guard-losses` (padlý zemře
  bez pohřbu, muž rodu – nástupnictví; ranění; zajatí u vsi shromaždiště pod `guardPrisonerKey`),
  hradiště `guests-leave` druhu `refuge` za padlé a zajaté. Vzdaného muže rodu nebo šlechtice
  útočník zajme (NPC vždy), vesničana uprchlíků při „pobít“ zabije, jinak zůstane v hradišti (odvést
  ho z hradiště zatím nelze – jako ženy, děti, zásoby a stáda uprchlíků při dobytí hradiště –
  Později). Test `refuge-defense.test.ts` (20 domácích a 15 uprchlíků – 6 mužů na hradbě; malé
  útočiště – domácí, uprchlíci, dobytek venku; boj u hradiště – ztráty domů, zajetí muže rodu,
  vesničan zůstane; po kouscích přes JSON = vcelku).
- **Návrat (Ú10).** Use-case mimo tažení `application/refuge-return.ts` (test
  `application/__tests__/refuge-return.test.ts`), čistá pravidla `domain/war/refuge-return.ts`
  (`armyOnCell`, `armyApproaching`, `refugeReturnDays`, `stewardMayReturn` – test
  `war/__tests__/refuge-return.test.ts`). `returnFromRefuge(deps, { playerId, villageId, today })`
  (tlačítko **Vrátit se** – Ú12, Ú13) – právo `war` (`requireRight`; klíč
  `ACTION_RIGHTS.returnFromRefuge` – Ú12, akce webu bez zámku hráče), ves má `refuge`, skupina
  dorazila (les – `refuge.hidden`; hradiště – pobyt `RefugeStay` u hostitele) a žádné tažení z
  `activeAlarming(ves)` nemá skupinu s aktivním mužem na políčku vsi; důvody (návrh Clauda) „Ves
  nikoho neodvedla.“, „Lidé ještě nedorazili.“, „Vojsko je ještě na mapě.“. **Les:** `refuge-back` s
  0 domů na dnešek (ukryté vrátí ves sama). **Hradiště:** pod zámkem držitele hradiště
  `updateVillage` s `departRefuge` (`leaveRefuge` + záznam `VillageState.refugeLeaving` –
  `RefugeLeaving` se zbylými zásobami, stádem a dnem příchodu; simulace ho nečte), pak `refuge-back`
  domů (`ref` = `refuge-back:<refId>`, den = dnes + `refugeReturnDays` – `flightEtaTicks` ÷ takty
  herního dne, středy map, se stádem tempem stáda) a druhé uložení hradiště záznam smaže
  (`clearRefugeLeaving`). Návrh Clauda nad plán: po `leaveRefuge` by opakování po pádu mezi uložením
  hradiště a zápisem události nevědělo, co lidé nesou (pobyt zmizel) – záznam to drží a opakování
  dopíše událost z něj (bez kontroly vojska – rozhodnuto bylo). Opakování (dvojklik, souběh hráče a
  úlohy světa) najde nespotřebovanou událost ve schránce domova a vrátí její den – jedna událost.
  Hradiště zaniklé i se sídlem – lidé se vrátí s prázdnou. **Správce a NPC rod** – úloha světa
  `returnStewardRefugees` (`runWorldTasks` po `reconcileShipments`, ve dni držitele domovské vsi; port
  `RefugeRepository.awayVillages` – adaptér `db/adapters/refuge-repository.ts` nad
  sloupci `refuge_ref_id` / `refuge_host_village_id` odvozenými z `VillageState.refuge`, spící vsi ne): ves se zapnutým správcem (`steward.on`) nebo se správou
  NPC rodu vrátí, když `stewardMayReturn` – vojsko na mapě nestojí, **na ves teprve netáhne** (cíl
  tažení ve shromáždění, na pochodu nebo v nájezdu – návrh Clauda nad plán, jinak by lidi vrátil
  vstříc vojsku) a uplynul den po posledním dni nájezdu (`returnDayAfter` – `raidDay`, bez nájezdu
  den odchodu); tělo nese `steward: true` → kronika `people-back` se `steward` („Správce vrátil lidi
  domů.“). Hráčovu ves bez správce nevrací – jen jí dopíše návrat po pádu.
- **Kdo rozhoduje – hráč ve vsi, nebo nastavení (Ú11, plán 2026-11-14 – Úloha 5, 5b).**
  `domain/war/alarm-steward.ts` (test `alarm-steward.test.ts`; war.md – Hráč ve vsi a mimo ni;
  lhůta hráče 1 herní den z 9. 11. 2026 zrušena).
  `decideAlarms(s, tick, ctx, out)` v každém taktu po poslech (`campaignTick`: pohyb → spatření →
  `moveMessengers` → `catchMessengers` → **`decideAlarms`** → `moveFlights` → `catchFlights` → dny
  nájezdu): ves, jejíž varování skončilo vzdáním vojvody (`alarmEnded`), přeskočí; za ves ve
  varování, za kterou ještě nerozhodl správce, určí `deciderOf(s, v, tick, ctx)`
  → `'steward' | 'player' | 'ask'`, v tomto pořadí: ves bez hráče (`withoutPlayer` – `owner.npc` i
  neznámý rod bez portu; hráčův muž není doma – `lordHomeAt`, i když ho tažení dnes odvedlo jako
  posla, se skupinou nebo do zajetí) → správce hned; zapnutý správce na tom nic nemění (Úloha 5b,
  přebíjí Rozhodnutí plánu 3 – Martin 14. 11. 2026: „Pokud je hráč ve své vesnici, tak jí
  ovládá“); čeká se na odpověď (`askedTick`) → hráč;
  bez údaje (`presenceTick` chybí – i starý bod) → `'ask'`, ves zapíše `askedTick = tick`;
  `presenceTick` null nebo `tick − presenceTick > absentTicks` (1 herní den; `absentTicks(world)`
  přesunuté z `campaign.ts` do `ticks.ts`, platí i pro živé vedení) → správce; jinak hráč (nic).
  **Přítomnost:** záměr `alarm-presence` (`{ village, seenTick: number | null }` – zapíše ho worker
  za vlastníka, `answerPresence` – Hráč ve vsi a mimo ni: Odpověď workeru) i každý jiný záměr
  `alarm-*` vlastníka varované vsi projde `applyAlarm` →
  `notePresence(v, seen)`: `askedTick` zmizí, `presenceTick` = pozdější ze známé a `seenTick` (u
  jiného záměru takt záměru; null jen, když žádnou neznáme); `alarm-presence` dál nic nedělá. Cizí
  hráč přítomnost nedává (kontrola vlastníka napřed). `WAR.alarm.presenceRefreshTicks` (86 = ¼ dne)
  – po kolika taktech worker přítomnost obnoví (Úloha 6). **Volba hráče** (`decided: 'player'`):
  zbytek převezme správce, když za ves teď rozhoduje nastavení (`playerLeft` → `deciderOf` =
  `'steward'` – vojvoda vyběhl jako posel, odjel, je v zajetí, nebo hráč déle než `absentTicks` není
  u hry; Review Focus 2, Úloha 5b – doslovné čtení „hráč není u hry → nastavení“) a lidé jsou ještě
  doma (`flight` chybí – skupina uprchlíků bere všechny přítomné, po ní správce nemá co rozhodnout),
  pak `decided = 'steward'` (správce na volbu jen naváže – posla ani skupinu podruhé nepošle; worker
  proto obnovuje přítomnost i po volbě hráče – Úloha 6). Pravidlo
  správce: `refugeOptions` ze stavu bez toho, co tažení dnes odvedlo, postoj `stanceOf`, vlastní
  útočiště `refugeHostOf` (hotové opevnění s plochou) → `stewardAlarmChoice` →
  `sendMessenger(…, { by: 'steward' })` (`messengerOf` bez volby – vesničan pěšky, bez vesničana muž
  rodu, na koni umí-li jezdit; Martin „Ano“), pak `departFlight(…, { by: 'steward' })` (`all` →
  `people` → `forest`; posel ve skupině nejde). `decided = 'steward'` i když nic nešlo – správce
  rozhoduje jednou. Ves varovaná poslem správce v témž taktu rozhodne v témž taktu (smyčka přes nové
  vsi). **Hradiště hráče** (NPC dál `hillfortHeard` při příchodu) rozešle posly do domény
  (`warnDomain(…, null)`) od příchodu prvního posla vsi (`heardTick` – z `messengers`) podle
  `deciderOf` téže vsi (`'ask'` zapíše `askedTick`, přítomnost se nepřepíná volbou vsi); záměr
  `alarm-domain` (i prázdný výběr) ho vypne (`AlarmVillage.domain`). Testy `alarm-steward.test.ts`
  (NPC ves – posel a „se vším“ v taktu varování; zapnutý správce s vojvodou doma – rozhoduje hráč
  u hry, bez hráče správce; vojvoda mimo ves – správce hned; vojvoda doma bez odpovědi – čeká
  s `askedTick`; odpověď null – správce v taktu odpovědi; hráč u hry – do `T + absentTicks` nic, pak
  správce; každý záměr `alarm-*` vlastníka je přítomnost, cizí ne, null ani starší takt ji neuberou;
  vojvoda vyběhne jako posel – útěk v témž taktu; po volbě hráče hráč odejde od hry – správce dořeší
  útěk bez druhého posla; po volbě hráče vojvoda odjede nebo je zajat – správce v témž taktu; starý
  bod bez nových polí se zeptá, bez `lordId` správce hned; postoj bránit – jen posel, boj
  s obránci; vlastní opevnění – jen posel; nestihnou – les, bez lesa nic; hradiště se správcem hned,
  hradiště hráče podle téhož pravidla; `alarmTaken` se zajatci; vzdání bez boje i v boji – posel ani
  útěk s vojvodou v témž taktu neprojdou, ves pak neutíká; po 1 / 7 / 40 taktech přes JSON =
  vcelku i se správcem, volbou hráče a vzdáním). Měření `measure-campaigns.ts` – scénář
  „varování 5“ (vojsko na okraji mapy neopevněné vsi NPC, hradiště o políčko dál – posel a útěk
  „se vším“; port `alarmOwners` ve smyčce workeru) – změřeno v Ú15 (docs/code/worker.md – Výkon –
  Tažení).
- **Pohled na varování a příkazy obránce (Ú12).** `application/alarm-view.ts` (test
  `application/__tests__/alarm-view.test.ts`; rozhraní – web-ui.md, Varování a útěk v rozhraní).
  Volby počítá táž doména jako pravidlo správce: `alarmChoices(s, v, tick, ctx, messengerId?)`
  (`alarm-steward.ts` – stav bez toho, co tažení dnes odvedlo, kandidáti hradišť, mřížka, spatření,
  běžící posel a odešlá skupina → `refugeOptions`; `decideVillage` ho volá bit po bitu stejně).
  `villageAlarmView(deps, { playerId, villageId, today })` – vidí, kdo ves vidí (`villageAccess`;
  odchylka od plánu, ten chtěl právo `war` – rozhraní Ú13 zašedne ikony důvodem práva), cizí null;
  tažení z `activeAlarming` s nejnovějším varováním vsi, za kterou rozhoduje držitel
  (`AlarmVillage.owner.playerId`), ves v taktu kontrolního bodu ví (`warnTick ≤ tick`). Svět pro
  výpočet (`AlarmWorld`) načítá mapy (`CampaignCells`) a vsi, když na ně výpočet čeká
  (`MissingData`, jako `computeCampaign`), **bez bariéry** – uložený stav vsi je odhad, tažení volbu
  ověří znovu; kandidáti hradišť = `AlarmVillage.hosts` s políčky sídel. Odhady v herních dnech
  (takty ÷ takty dne, 2 desetinná místa); útěk při boji u vsi zašedne `battle` (rozhoduje postoj –
  jako `departFlight`); `runners` – `messengerCandidates(state, day)` (`refuge-choice.ts`: výchozí
  posel, pak každý muž rodu, který běžet může – návrh Clauda: ostatní vesničany hráč nevybírá),
  odhad zvlášť pro pěšího a jezdce; `yieldLord` – vzdání vojvody (`yieldState`: `lordHomeAt`
  - `yieldingLord`; už vzdaný v jiném tažení na touž ves – `battle.lordYielded` nebo zajatec
    `prisonerKey(s.id, lordId)` v `loot.prisoners` – `lordAway`; příkaz `yield-lord` → záměr
    `lord-surrender` na takt teď + 2; `alarmEnded` → pohled bez voleb); skupina na cestě – `flightEtaTicks` od polohy tempem `flightPace`
    (exportované z `evacuation.ts`); `ret` – `refugeReturnState` (`refuge-return.ts`, tytéž podmínky
    jako `returnFromRefuge`, rozhodnutý návrat „Lidé se už vracejí.“ – nový důvod
    `REFUGE_RETURN_REASONS.returning`, návrh Clauda), i po skončeném tažení. **Hradiště hráče**
    (doběhl k němu posel vsi – `heardTick`, poslů do domény méně než `hillfortMessengers`): `domain` =
    `domainTargets(s, av, domainOf(...))` (`messenger.ts` – vsi domény v dosahu od místa spatření,
    nejbližší první, `warned` – ví, nebo k ní posel běží; `warnDomain` z nich bere nevarované – bit po
    bitu stejně) přes volitelný port `AlarmOwnerPort.domainOf`.
    `commandAlarm(deps, { playerId, villageId, command, today, nowMs })` – právo `war`
    (`ACTION_RIGHTS.commandAlarm`), totéž tažení, volba znovu nad kontrolním bodem (zablokovaná –
    důvod `ALARM_BLOCKED`, žádný záměr; doména – jen nevarované vsi z výběru, prázdný výběr jde) a
    záměr `alarm-messenger` / `alarm-flee` / `alarm-domain` na takt teď + 2 (`queueCampaignIntent`;
    tažení skončilo – „Vojsko už odtáhlo.“). `returnFromRefuge` bere právo z
    `ACTION_RIGHTS.returnFromRefuge`. Důvody pohledu (návrh Clauda kromě doslovných ze specu): „Pán
    nemá hradiště.“, „Nestihnou to.“ (rozhraní doplní odhad), „Na mapě není les.“, „Nikdo nemůže
    běžet.“, „Lidé už odešli.“, „Posel už běží.“, „Ves o vojsku neví.“, „U vsi se už bojuje.“, „Do
    domény není koho varovat.“, „Vojsko už odtáhlo.“.
- **Ikony v panelu dvorce (Ú13).** `hud/AlarmButtons.tsx` – řádek ikon pod postojem vsi (Poslat
  posla s výběrem posla, Ukrýt v lese, Do hradiště – jen lidé / se vším, po útěku stav skupiny a
  Vrátit se, Varovat doménu u hradiště hráče, bílá vlajka); zašedlé s důvodem a odhadem, bez práva
  `war` důvodem práva; klik na upozornění varování vybere dvorec vsi (`noticeOpener`). Ikony
  `public/icons/war/alarm-*.png` z Blenderu (`tools/blender/icons.py`). Podrobnosti web-ui.md –
  Varování a útěk v rozhraní.
- **Průvod uprchlíků a posel ve scéně (Ú14).** `warSceneView` (`domain/war/scene-view.ts`) nese
  `refugeMarch` (`WarSceneRefugeMarch` – `refId`, `own`, `mode`, poloha, směr chůze, `moving`, lidé
  jen vzhledem `WarSceneRefugee` – postava, dítě, nese zásoby; kusů dobytka, vozů) a `messengers`
  (`WarSceneMessenger` – poloha, směr, `mounted`). Na mapě jen skupina na cestě (`marching`) nebo
  běžící posel; ukrytá u lesa (`hidden`) se nekreslí nikomu, ani vlastníkovi (zmizela jako do budovy), v hradišti, dostižená, doručený a chycený také ne. **Mlha:**
  skupiny a posly vsí hráče, který se dívá (`WarSceneInput.playerId` =
  `AlarmVillage.owner.playerId`), vidí vždy – i na mapě své jiné vsi (hradiště); cizí jen v dohledu
  (`inSight`) – obránce z domů a svých bojovníků na nohou, útočník ze skupin s aktivním mužem a
  bojovníků na nohou; ukrytou skupinu nevidí nikdo. Pohlaví uprchlík nenese – muž od 16
  let `man`, jiná dospělá žena, dítě podle id (návrh Clauda – jen vzhled); zásoby nese od
  `WAR.flight.childFromYears`, „jen lidé“ nic. Směr chůze `moverHeading` – k dalšímu bodu úseku
  **před ušlými metry** (`walkedM`; dřív první bod dál než 1 m – u skupiny vojska uprostřed úseku to
  byl bod za ní), jinak k cíli na mapě cíle. Pohled vznikne i bez boje a pochodu. `warSceneFor` bere
  i tažení z `activeAlarming(ves)` (ves ve varování, hradiště skupiny) – vojsko na mapě být nemusí,
  stačí průvod nebo posel (`alarmOn`). **Mapa tažení:** `campaignView` – `CampaignView.flights`
  (`CampaignViewFlight` – `refugees` | `messenger`, políčko, poloha, lidí, kusů, `mounted`) jen v
  dohledu vlastních mužů na nohou na téže mapě (mřížka jen na mapě cíle, jinde dohled jako v lese);
  ikony v `CampaignMap` – Ú15. Scéna: scene.md – Průvod uprchlíků a posel. Testy
  `scene-view.test.ts` (vlastní vždy – vzhled, směr, stádo, vozy, bez padlých; „jen lidé“ a ukrytí;
  útočník mimo dohled nic, v dohledu skupina, posel; ukrytou ne; cizí hráč jen z domů; jiná mapa,
  hradiště a chycení nic; `campaignView.flights`), `application/__tests__/war-scene.test.ts`
  (tažení, které ves jen varovalo, vojsko jinde; v hradišti nic), web `war-scene-view.test.ts`
  (`alarmOf`, scéna bez boje a pochodu), `refugee-march.test.ts` (hlouček, děti, stádo za lidmi,
  posel pěšky i na koni, `alarmAt`), e2e `multiplayer-war.spec.ts` (varovaná ves B – deset uprchlíků
  se stádem a posel, vojsko A doma – `data-war-refugees`, `army-cow`, snímek `uprchlici.png`).
- **Mapa tažení, měření a e2e (Ú15).** Ikony skupin uprchlíků a poslů na mapě tažení
  (`CampaignMap` – `FlightMarks` z `CampaignView.flights`; web-ui.md – Varování a útěk v rozhraní).
  Pohled na varování levněji: volitelný `AlarmViewDeps.grids` (`MarchGridMemo` – `AlarmWorld` ho
  předá světu tažení) a web drží stavy vsí přes dotazy (`VillageMemory`, `withVillageMemory` –
  `packages/server/village-cache.ts`); měření `apps/worker/scripts/measure-alarm-view.ts`
  a `measure-campaigns.ts` (scénáře „varování 5“ a „pochod 15 + varování 5“) – worker.md – Výkon.
  E2E `multiplayer-war.spec.ts` – „ves B varovaná utíká do hradiště pána a po odtažení vojska se
  vrátí“ (záměr `alarm-flee`, `refuge-arrive` v hradišti pána, hosté `refuge`, Vrátit se zašedlé
  s vojskem na mapě, po odtažení lidé doma).

## Výsledky nájezdu a kořist (Ú6.10)

`domain/war/raid-apply.ts` (war.md – Ztráty, Kořist; fortifications.md – Prolomení). Tažení spočte,
co se stalo, a pošle to do schránek vsí na **následující den** (rozhodnutí 13, `post` v
`campaign.ts`); vsi to použijí na začátku dne jako ostatní události schránky (`inbox.ts`).

- **Kdy:** `reportRaid` na konci taktu, jakmile boj skončí (`attackers`, `defenders`, `withdrawn`),
  jen jednou (`CampaignState.raidDay`); i z `finish`. Ves čte stavem `villageAt(cíl, s.day)` jako
  bojiště (chybí-li, takt se zastaví – `MissingData`).
- **`raid-result`** do napadené vsi (`RaidResult`): padlí a ranění obránci z bojovníků `down`
  (`killed`); drží-li útočníci bojiště, i odvedení – vzdaní (`yieldedOf`: `ShelterReport.surrendered`,
  obránci s `Fighter.surrendered` a lidé dobytého útočiště, kteří neutekli – `refugeRout`) podle
  `CampaignState.surrendered` (výchozí `lead`; `kill` = padlí; muže rodu a šlechtice zajme Ú6.11,
  zatím zůstanou) – a kořist `raidLoot`:
  - jídlo ze zásob (obilí, luštěniny, maso, sýr) do nosnosti `lootCapacity` – 25 kg na muže na
    nohou (`WAR.carryKg.man`, raněný nenese) minus zbylé jídlo tažení; po druzích ve stejném poměru;
  - zůstane: odnesené do lesa (`fleeParty` lesních), do útočiště, které útočník nedobyl (dobyté =
    útočník stál uvnitř obvodu – `BattleState.taken`, 9. 11. 2026), osivo `reservedSeedKg`
    a zapečetěné jámy, které útočník
    nenajde (`pitFound(seed tažení, jáma, dny boje)` – dny = takty boje × `hoursPerTick` ÷ 24);
  - dobytek (ovce, kozy, prasata, krávy) celý kromě útočiště a lesa. Koně a voli zatím ne.
- **`applyRaidResult`**: padlí zemřou (`death`, `cause: 'war'`) a pohřbí se (`bury`), ranění
  `Person.woundedUntil` = den + 60 (`isInjured` – nepracují, necvičí, neloví, nebojují) a los
  `woundDeathDayOf(seed vsi, člověk, den zranění)` – 1 z 5 do 30 dní (`Person.woundDeathDay`),
  odvedení odejdou (`removePeople`), kořist ubude (nejvýš co ves má; nalezené jámy prázdné, zbytek
  z otevřené jámy `drawGrainPits`; dobytek napřed dospělý). Kronika `raid` s tím, co se opravdu
  stalo, a smrti padlých.
- **`woundDeathsDay`** (simulate.ts – po schránce, před simulací dne): kdo má `woundDeathDay` dnes,
  zemře (`cause: 'wounds'`), doma se pohřbí; muž rodu – `dynastyDay` ještě týž den.
- **`fortification-breach`**: prolomené úseky (`BattleBreach.progress.breached`, opevnění podle
  pořadí ve vsi → `id`) dostanou `breachedDay` a stav 0; `decideFortRebuilds` je přestaví
  přednostně a stav průlomu nepřepisuje stářím; po přestavbě `breachedDay` zmizí.
- **`line-man-fell`**: padlý muž rodu útočníka (`raidTick` po `syncMembers`) hned do domovské vsi –
  smrt se jménem a id (nástupnictví vsi `dynastyDay`, nástupnictví hráče z `death.personId`), bez
  pohřbu (padlí útočníci zůstanou na cizí mapě).
- **Kronika obou rodů**: napadená ves z `applyRaidResult`, ves shromaždiště událostí `chronicle`
  se stejným zápisem (`raidChronicle`). Jména vsí `CampaignVillage.name` a `CampaignState.ambush`
  plní `plan-campaign.ts` / `launch-campaign.ts`; text `raidText` v `village-view-chronicle.ts`
  („Nájezd Bořivoje z vsi Lhota na ves Kněžice bez opovědi: padli 3, …“).
- **Kořist s vojskem**: `CampaignLoot.detail` (rozpis), `people` (snímky odvedených ke dni nájezdu),
  `foodKg`/`herd` součty (stádo zpomalí návrat); odvedení i v `captives`.
- **`campaign-return`** (`finish` – každé domovské vsi mužů, kořist a odvedení jen vsi
  shromaždiště): `applyCampaignReturn` zruší `away` tažení mužům `back` (aktivní a dezertéři ze
  starších bodů bez `homeDay` – ostatní šli domů hned, Ú6.6 Dezertér jde domů hned; ne zajatí),
  raněným dá 60 dní od `CampaignMember.woundedDay` a los smrti, padlí vesničané zemřou bez
  pohřbu, kořist do zásob a stád, odvedení přijdou s novými id (`rehomePeople`; rodina do
  `newcomerHome`, děti k rodičům).
- Testy: `war/__tests__/raid-apply.test.ts` (bilance, útočiště, jámy, ztráty, nástupnictví, ranění,
  návrat, po kouscích), `raid-campaign.test.ts` (vzdaná ves přes `stepCampaign`, kronika obou rodů,
  po kouscích taktů), průlom v `village/fortification/state/__tests__/fortification-decay.test.ts`.

## Zajetí a výkupné (Ú6.11)

Spec: [war.md](../design/war.md) – Vzdaní, zajetí a výkupné. Zajetí žije ve stavech vsí, DB drží jen
rozhodnutí.

- **Vzdání** – `domain/war/surrender.ts`: `surrenders(member, situation, rng)` – bezvýchodná situace
  (`hopeless`) → `WAR.lineSurrenderChance` (80 %, los ze seedu); jezdec s volnou cestou uteče.
  `reportRaid` (`campaign.ts`, `raidResultOf`) ho hází o raněné muže rodu na bojišti (hloučky
  `shelter.surrendered` jsou bezvýchodné z definice). Poslední muž rodu doma se nevzdá ani nezajme.
- **Co s nimi útočník** – muži rodu a šlechtici (`Person.line` / `noble`) vzdaných skupin: u NPC
  velitele **vždy zajmout** (bez ohledu na `surrendered`), u živého podle `CampaignState.surrendered`
  (`lead` = zajmout, `kill` = pobít, `leave` = nechat). Záměr `choose-surrendered { group; choice }`
  (`applyIntent`) volbu nastaví, dokud boj neskončí (`group` jen ověřuje existující skupinu;
  volba platí pro celé tažení). Ostatní vzdaní (ženy, děti, vesničané) dál `led` jako odvedení.
- **Vzdání vojvody** (war.md – Hráč ve vsi a mimo ni; plán 2026-11-14 – Úloha 7, Rozhodnutí plánu 5):
  záměr obránce `lord-surrender { village }` – `isAlarmIntent`, tedy jen od vlastníka varované vsi
  (`applyAlarm`, je to i přítomnost). `yieldingLord` ho pustí jen pro cíl tažení, dokud nájezd není
  rozhodnutý (`raidDay`; fáze `marching` nebo `raiding`), se skupinou s aktivním mužem na mapě cíle
  (`armyEyes`) a s vojvodou doma (`lordHomeAt`), který v boji nepadl (padlý je ve stavu vsi až do
  výsledku nájezdu). Druhé vzdání téhož taktu neprojde – vojsko už jde domů; záměry se v taktu
  počítají před bojem, takže vzdání v taktu, kdy by boj skončil, platí. `yieldLord`:
  - **v boji** `BattleState.lordYielded` = vojvoda a `turnBack(s, 'yielded')` (boj `withdrawn`); `reportRaid`
    v témž taktu ho přes `raidResultOf` přidá do `captured` vždy, mimo volbu `surrendered` (raněný
    vojvoda už není mezi raněnými). Boj nevyhrálo – vzdaní z boje se neodvedou a kořist z vsi není;
  - **bez boje** (vojsko na mapě cíle ještě pochoduje, nebo boj ještě nezačal) `raid-result` jen
    s `captured` (prázdná kořist), kronika shromaždiště jako po boji, `raidDay`, zajatec do
    `loot.prisoners` (`capturedPrisoners`) a `captives`, pak `turnBack(s, 'yielded')`.

  Vojsko odnese jen to, co už má v `s.loot` (dostižení uprchlíci, chycení poslové). Ve vsi dál cesta
  zajetí níž; vůdce dostane `campaign-returned` s důvodem `yielded` („Vojsko se vrátilo i se zajatým
  vojvodou.“ – `apps/web/lib/player-notices.ts`, text návrh Clauda). Test
  `war/__tests__/lord-surrender.test.ts`.

  Vzdáním končí varování cílové vsi (`alarmEnded`, Úloha 5b): ves před odcházejícím vojskem
  neutíká, neposílá posla a správce za ni nerozhoduje. Posel ani útěk s vojvodou v taktu vzdání
  neprojdou. Bez boje je zajatý vojvoda hned v `captives`, a tedy mimo `alarmTaken`. Testy
  `alarm-steward.test.ts`.

- **Dva konce zajatců**: `RaidResult.captured` + `captorVillageId` (napadená ves: osoba **zůstává ve
  stavu** s `away { kind: 'captive', hostVillageId, refId }` bez `untilDay`, `captureMen`; zajatý
  vojvoda zapne správce se značkou `StewardState.byCaptivity` = formální správce řídí ves) a
  `CampaignLoot.prisoners` → `CampaignReturn.prisoners` (ves shromaždiště: `VillageState.prisoners`
  - host druhu `captive` s `untilDay = 1e9`, takže jí z jejích zásob – `villageFoodNeed` – a
    `guestLaborToday` ho nepočítá; necvičí).
- **Klíč zajetí** `<id tažení>:<číslo osoby>` (`prisonerKey`) – lidé napadené vsi; kdo je z jiné
  vsi (hosté z ochrany a ze svolání, muži uprchlíků v hradišti, dostižení uprchlíci, chycený posel),
  `<id tažení>:<ves>:<číslo osoby>` (`guardPrisonerKey` – číslo by se mohlo potkat s lidmi napadené
  vsi).
- **Schránka `captive-returns { role: 'home' | 'captor'; prisonerId; personId }`**
  (`domain/war/captives.ts`): `home` zruší `away` (+ vypne správce zapnutého zajetím, kronika
  `people-back` druhu `captive`); `captor` odebere zajatce i hosta. Poprava = `captor` +
  `line-man-fell` (smrt a nástupnictví `dynastyDay` / `resolvePlayerSuccession` jako u padlého).
- **DB**: `schema/prisoner.ts`, migrace `0034_prisoner.sql`, `adapters/prisoner-repository.ts`:
  `claim` = INSERT … ON CONFLICT DO NOTHING (primární klíč = klíč zajetí) – druhé souběžné
  rozhodnutí neprojde (`prisoner-repository.db.test.ts`).
- **Use-casy** (`application/prisoners.ts`): `decidePrisoner(deps, { playerId, prisonerId, action,
today })` (`hold` / `release` / `execute`, zajatec se hledá ve vsích hráče, pod zámkem hráče;
  propuštění pošle `captive-returns` home za `max(1, 2 × cellDistance)` dní) a `ransomHooks(deps)`
  (`NegotiateDeps.ransom`): `check` (zajatce drží jedna strana jednání), `apply` (zásilka výkupného
  z vsi platícího do vsi věznitele, pak propuštění), `release` (mír). **Výkupné je nedělitelné:**
  `apply` napřed dopočítá ves plátce (`prepareVillage`, bez zámků) a pak pod zámkem věznitele
  i držitele vsi plátce (`runUnderLocks` v `locks.ts` – pevné pořadí podle id hráče, každý jednou)
  ověří, že věznitel zajatce drží a o žádném ještě není rozhodnuto (řádek `prisoner`; uložený stav
  vsi věznitele vede zajatce až do použití události schránky), pošle zásilku (`sendShipmentLocked`
  – zámek není reentrantní, proto ne `sendShipment`) a zapíše rozhodnutí `ransomed`. `decidePrisoner`
  čeká na týž zámek věznitele, takže poprava ani propuštění mezi platbu a zápis nevstoupí – buď je
  zaplaceno a zajatec propuštěn, nebo se nezaplatí nic. Je to jediné místo, které drží zámky dvou
  hráčů naráz (převod držitele se tomu vyhýbá dvěma kroky – vassalage.md); v Postgresu jde o dvě
  spojení poolu zámků a srážka otisků právě těchto dvou hráčů (`playerLockHash`, ≈ 2⁻³² na dvojici)
  by skončila čekáním do `WEB_LOCK_WAIT_MS` a chybou bez platby i zápisu (db test
  `player-lock.db.test.ts` – protisměrné operace se nezablokují).
- **Jednání**: řádek `ransom { prisonerIds; price; vassalage? }` (`domain/negotiation/ransom.ts`),
  samostatné jednání jako obchod (nevyžaduje vazalství; `open` / `counter` / `accept` v
  `negotiate.ts`); vazalství z výkupného vznikne účinkem řádku. `peace.releasePrisoners` po přijetí
  míru volá `ransom.release`. Kdo platí, je strana, která zajatce nedrží.
- **Web**: `lib/prisoners.ts` (`decidePrisonerForPlayer`, `ransom()`), akce `decidePrisonerAction`,
  `VillageManor.prisoners` (`manor-view.ts`), `PrisonersPanel.tsx` (portrét s pouty, držet /
  propustit / popravit; poprava druhým stiskem), formulář výkupného: `TermsContext.captives` (zajatci vsi z
  `VillageManor.prisoners`, jen rodu protistrany – `houseId` doplní `viewOf` ve `lib/village.ts` z vsi původu), v `TermsForm` řádek `RansomRow` (výběr zajatců, cena jako zboží) a v `HousePanel`
  tlačítko `house-ransom` (směr `ransom`; zda zajatec patří protistraně, ověří server), ikony `public/icons/war/{captive,hold,release,execute}.svg`.
- Nevykonáno (později): zajetí **útočníků** obráncem (raněné na bojišti), zajatý hráčův muž nevede tažení díky `away` (`launch-campaign`).
- Testy: `war/__tests__/surrender.test.ts`, `captives-campaign.test.ts` (zajetí přes `stepCampaign`),
  `application/__tests__/prisoners.test.ts`, `ransom-negotiation.test.ts`, db test výše.

## NPC velitel, zástupce a rozpad (Ú6.12)

Spec: [war.md](../design/war.md) – Velení a příprava tažení (NPC velitel, Hráč odejde od tažení,
Rozpad). Čísla `WAR.npc` (`attackRatio` 1,5, `lostShare` 0,5) a `WAR.absentLeaderDays`.

- **Kdy vede NPC** (`campaign.ts`, `npcLeads`): ve fázi `marching` / `raiding`, když velí jiný muž
  (`liveCommand = false`), nebo je hráč pryč a vede zástupce (`CampaignState.absent`). Po záměrech
  hráče a kontrole velení (`command`) takt spočte `npcIntents(state, world)` a použije je jako
  záměry NPC (`applyBody(…, npc = true)` – stejné úkony jako hráč, navíc `plunder`). Rozhoduje jen
  ze stavu a světa v taktu, takže výsledek nezávisí na kouscích taktů; před rozhodnutím na mapě
  cíle se načte opevnění (`battleFieldOf`, jinak `MissingData`).
- **`domain/war/npc-commander.ts`** – `npcIntents`: obrat (`turn-back { reason }`) při bodu zlomu
  skupiny velícího muže (`routed`), padlé / zajaté / dezertované nebo v boji prchající polovině
  vojska (`routed`), plné nosnosti – kořist jídla ≥ `lootCapacity` (`arrived`) –, nebo když jídla
  zbývá jen na cestu domů (`daysHome` – vzdušnou čarou do shromaždiště 3,5 m/s; `supplies`).
  Pochod: skupiny, které hráč poslal jinam, pošle k cíli (`march`); trasa je pochod Ú6.4
  (nejkratší průchozí cesta, potoky po brodech). Nájezd: `npcLeader` (velitel, dokud bojuje i prolamuje,
  jinak zástupce) – drží napadeného, dokud bojuje; jinak skupiny domů obránců v dohledu (150 m od
  kteréhokoli útočníka) poměří součtem sil obránců (bez násobku – 8. 11. 2026); nejslabší napadne
  (`strike` na nejbližšího jejího muže), má-li vojsko aspoň 1,5 × její sílu, jinak se obrátí
  (`turn-back { reason: 'order' }`). Stojí-li všichni obránci uvnitř obvodu opevnění, ve kterém
  velitel není (`behindWalls` – `fortsContaining` nad opevněním bojiště), napadne jen se silou
  a postupem přes hradbu nejvýš `WAR.npc.maxAssaultHours` (24 h – NPC velitel u hradby níž),
  jinak `plunder` (boj `attackers` + `BattleState.plundered` → `raidResultOf` bere útočiště za
  nedobyté – kořist jen zvenku). Nevidí-li nikoho, jde k nejbližšímu obránci (`march`).
  `npcIntents(state, world, field)` – `field` je bojiště nájezdu (`battleFieldOf` v `campaign.ts`);
  bez něj (testy) velitel o hradbě neví.
- **NPC velitel u hradby (hradby Ú20)** – `domain/war/npc-assault.ts`, `fastestApproach(field, b,
men, from)` → `{ fort, segment, at, method, hours }` | null. Mezery, průlomy boje a nejrychlejší
  místo prolomení každého opevnění bere z boje – `fortPassages` v `battle.ts` (stejné `wallsOf`
  a `chooseSpot` jako takt, brány zavřené, `min(4, muži)`, oheň jen s otepi z lesa či dříví vsi;
  `Opening.segment`; u vrat klešťové brány nejvýš `maxMen` a velitel stojí před ústím uličky –
  k vratům dojdou muži v boji sami), žebřík přes vodní příkop z nich vynechá. Sám odhadne přelézt plot (`climb`)
  a žebříky jen na neobsazeném místě (`occupied` v bodě i ±0,5 m – ne škvíra mezi obránci 5 m od
  sebe; mimo vrata a u klešťové brány mimo ramena – uličku 2 m + rameno 5,5 m + 1 m od
  středu brány, i na sousedním úseku; 1 m od stojících žebříků): volný žebřík opevnění jen výstup, nový = výroba 4 h
  - do nejbližšího lesa (od středu úseku, `nearestForestOf`, mezipaměť na mřížku a tvar) a zpět
  - výstup (`climbTicks`), zasypání příkopu `assaultHours` bez výroby. Vybere nejmenší
    `hours + cesta od from` (3,5 m/s; při shodě první v pořadí); `hours` je jen postup.
    `approachStep(field, from, way)` – další bod cesty velitele: do 5 m od místa rovnou k němu, jinak
    k bodu 4 m dál od středu opevnění (ať nejde těsně podél hradby a nestojí na její čáře – tam by
    ho `fortsContaining` měl za uvnitř) přes `leadTo`: vede-li přímka přes obvod (úseky i tětivy
    rohů, blokuje vše), napřed radiálně ven na kruh obchůzky (nejvzdálenější roh + 5 m), pak po
    kruhu (půlením k nejdelší tětivě bez hradby) – boj sám kolem hradby nechodí (`stepToward` jen
    klouže podél stěny a na rohu uvízne). `raidIntents`: u místa (do 3 m) `strike` na nejbližšího
    obránce nejslabší skupiny (u hradby muži volí postup místa sami – `startCrossing`,
    `chooseSpot`), jinak `march` na `approachStep` (nový bod, až se posune o víc než 3 m).
    `insideOrders` (před záměry velitele, i když drží napadeného): stojí-li obránci uvnitř obvodu
    a průchod je otevřený (`passageOpen` – lezec nahoře: `over` / `down` / vrchol žebříku, útočník
    uvnitř obvodu, nebo mezera či průlom z `fortPassages`), pošle skupiny, které ho slyší
    (`orderHeard`) a nemají „útočit na vše“, dovnitř – `set-order` `attack-all`; velitel sám
    (lučištník) smí zůstat u průchodu (návrh Clauda). Testy:
    `war/__tests__/npc-assault.test.ts` (palisáda se 6 obránci → žebříky na neobsazeném místě, bez
    lesa s dřívím vsi oheň 12 h a bez otepí odkopání 20 h, plně obsazená roštová → podkop 120 h →
    `plunder`, mezera po průlomu, obchůzka hradby, obrat, „držet místo“ za palisádu nejde, lučištník
    na ochoz střílí), `npc-commander.test.ts` (silnější vojsko u palisády obejde hradbu k bráně,
    prosekne ji, skupina jde dovnitř a bitvu vyhraje; po kouscích 1 / 7 / 100).
- **Řízení v boji** – `syncControl`: `controlled` má jen muž, kterého řídí NPC (`npcLeader`), nebo
  při živém vedení velitel tažení; kdo řízení ztratí, zapomene `chosen` a `goal`.
- **Přítomnost** – záměr `presence` (web ho pošle z tepu spojení událostí s otevřeným tažením –
  Ú6.14, plán 2026-11-15 – Úloha 5; Hráč ve vsi a mimo ni) i každý jiný záměr
  hráče nastaví `presenceTick` a zruší `absent`. `command`: živé vedení bez přítomnosti déle než
  1 herní den (`absentTicks` = 24 h ÷ `hoursPerTick` ≈ 345 taktů) → se zástupcem `absent = true`
  (vede NPC, po návratu hráč převezme), bez zástupce rozpad. Padlý nebo zajatý velitel → živý
  zástupce převezme velení (`liveCommand = false` – hráč už vliv nemá), jinak rozpad (i když padl
  i zástupce). Vede-li jiný muž, hráčův `turn-back` se zahodí.
- **Rozpad** (`disband`): boj končí (`leaveBattle`), `phase = 'disbanded'`, živí muži se rozdělí do
  hloučků podle domovské vsi (nová id skupin, hlouček stojí u skupiny svého prvního muže) a jdou
  domů – `CampaignState.homes` (místa vsí z přípravy, `homePlaces` v `plan-campaign.ts`), chybí-li,
  do shromaždiště. Kronika všech domovských vsí a shromaždiště `campaign { step: 'disbanded' }` →
  „Výprava Bořivoje se rozpadla.“ (`village-view-chronicle.ts`), upozornění `campaign-disbanded
{ campaignId, leader }` vůdci i vazalům, jejichž muži jdou („Výprava se rozpadla.“ –
  `player-notices.ts`, panel války). Hloučky nebojují; doma `finish` pošle jen `campaign-return`
  (bez zápisu „vrátilo se“ a bez `campaign-returned`). Kořist a stádo jdou s hloučkem vsi
  shromaždiště.
- Testy: `war/__tests__/npc-commander.test.ts` (nájezd NPC na bránící se ves po kouscích 1 / 7 / 100,
  silná ves za palisádou – kořist jen zvenku, obraty, přítomnost, zástupce, rozpad); živé testy
  tažení posílají přítomnost (`present`, `LIVE` v `campaign-fixtures.ts`).

## Průchod, svolání a ochrana (Ú6.13)

war.md – Pohyb (Průchod územím neutrálního rodu), vassalage.md – Svolání, Ochrana vojskem.

- **Průchod** – port `application/passages.ts` (`Passage`, `PassageRepository`: `announce`, `byId`,
  podmíněné `answer` – jen bez odpovědi a platné, `validBetween`, `openTo`, `voidBetween` v obou
  směrech; `passageCovers(passages, cell, campaignId)` – platné ohlášení téhož tažení bez „Nevěřit“ na políčku; `Passage.campaignId` null = čeká na vyslání). Use-case
  `application/passage.ts`: `announcePassage(deps, { playerId, house, cells, eta, message, today })`
  (ne vlastní rod, ne ve válce, 1–`WAR.passage.maxCells` map, upozornění `passage-announced`,
  kronika obou rodů `passage-announced` „Bořivoj ohlásil průchod.“), `answerPassage(deps, {
playerId, passageId, trust, message, today })` (jen oslovený rod, jednou; `passage-answered`
  ohlašujícímu), `passagesToAnswer` (panel války). **Neškodnost:** `villageWatchers({ …, passages })`
  – `harmless(armyPlayerId, ownerPlayerId, villageId)` je true i pro ves na ohlášené mapě (sídlo
  `worldCell`); bez odpovědi platí (spící hráč nic nedělá), „Nevěřit“ = ves podle postoje (dny
  nájezdu, signál hrozby). **Zrušení:** `WarDeps.passages` – `declareWar` i `startWarByAttack`
  (přepadení po ohlášení) zavolají `voidBetween`; web `launchDeps` ho předává. **Jedno tažení**
  (Martin 7. 11. 2026): `launchCampaign` po `campaigns.create` zavolá `bindToCampaign(houseId,
campaignId)` (čekající ohlášení rodu dostanou `campaignId`); `harmless(…, campaignId)` bere jen
  ohlášení téhož tažení; `stepCampaigns` (`endPassages`, `StepCampaignsDeps.passages`) po uložení
  tažení ve fázi `done` / `disbanded` (i u už skončeného) zavolá `voidOfCampaign`. DB `schema/passage.ts`,
  migrace `0035_passage` + `0036` (`campaign_id`), adaptér `adapters/passage-repository.ts`.
  **Úhlopříčná mapa** (cesta mezi mapami je čtyřsousedná – Mapu po mapě, oprava Úlohy 5): tažení
  na úhlopříčně sousední mapu jde přes kolmou sousední mapu – tamní vsi ho mohou spatřit
  a ohlášení průchodu ji musí pokrýt (`worldRoute` ji v `cells` vrací); `WAR.passage.maxCells` tak
  na úhlopříčce dosáhne jen na polovinu dřívější vzdálenosti.
- **Svolání** – `application/summons.ts`, dialog `summons` (`SummonsBody`: válka a její strany,
  vazalství, pán, vazal, cílová ves, domluvení muži, dny; `forDialogId` u vazala vazalů; po odpovědi
  `sent`, `message`). `summonVassals(deps, { playerId, warId, vassalageIds, targetVillageId, days?,
today })` – válka rodu, nebo otevřené svolání od pána se stejnou válkou (vazal vazalů – cíl se
  převezme od pána); jen vlastní vazalové s `terms.service`, jedno čekající svolání na vazalství
  (klíč `summons:<vazalství>:<pořadí>` – souběh projde jeden), dny = zbytek roku (součet `days`
  nepropadlých svolání roku, `DialogRepository.listFor`) nebo menší `days`; upozornění
  `summons-open`. `serviceMenOf` – muži rodu schopní služby ze všech vsí hráče (`lineCandidates`),
  nejzdatnější první (`lineManStrength`). `answerSummons(deps, { playerId, dialogId, men, message,
today })` – jen muži rodu schopní služby z vlastních vsí, podmíněné `answer` s odpovědí v těle,
  pak `sendMen` (shipments.ts – `away` `service`, host `guests-arrive` na `days` dní, cesta 2 dny
  na políčko tam i zpět, kronika `people-away`); míň než domluveno (i s muži vazalů na jeho
  svolání – `forDialogId`) = `addBreach('summons')`; `summons-sent` pánovi. `lapseSummons` (úloha
  světa ve `runWorldTasks.summons`, worker) – otevřené svolání po konci války `lapse` → neplnění,
  kronika obou rodů `no-show` „Ctibor nepřišel do války.“, `summons-lapsed`.
  Bez odpovědi do 30 herních dní pošle muže správce – `answerAbsentSummons` (úloha světa před
  `lapseSummons`; `vassalage.md` – Správce za nepřítomného hráče).
- **Ochrana pánem** – `application/protection.ts`: `requestProtection(deps, { playerId,
vassalageId, villageId, message, today })` (vazal, vlastní ves – upozornění
  `protection-requested` pánovi), `sendProtection(deps, { playerId, vassalageId, villageId, men,
today })` (pán, jen muži rodu schopní služby z vlastních vsí, do vsi vazala – `sendMen` druhu
  `protection` do odvolání: doma `away` bez `untilDay`, host do konce světa; `protection-sent`),
  `recallProtection(deps, { playerId, vassalageId, villageId, today })` – schránka chráněné vsi
  `guests-leave` (dnes, `dismissGuests`), domovské vsi `away-ends` (`endAway` – návrat za 2 dny na
  políčko); `protection-recalled`. Odkaz `protectionRef` = `protection:<dohoda>:<ves>`.
- **Hosté z ochrany a ze svolání v boji** – `campaignBattle` → `guardGuestsOf`: hosté cílové vsi
  druhu `protection` i `service` (svolání; `CampaignGuard.kind = 'service'`, `guests-leave` se pošle
  zvlášť pro každý druh; muž, který odešel s tažením, má `away.kind = 'campaign'` a nebrání), jejichž osoba (stav domovské vsi ke dni `d − 1` přes `villageAt`, jinak
  `MissingData` – takt čeká) je pryč právě u cíle a má 16 let; čísla v boji −1, −2, … (pořadí ves,
  osoba), paměť `CampaignState.guards` (`CampaignGuard` – číslo, `ref`, jméno, šlechtic).
  `defenderRoster(state, day, { guests })` je přidá za lidi vsi (`GuardGuest`, `Defender.guest` –
  u prvního obydlí, síla `lineManStrength`, luk, nikdy `lastLine`), `planDefense` je zařadí do
  skupiny jejich místa (útočiště, les, vzdání). `raidResultOf` je bere jako muže rodu (vzdaný /
  raněný → zajetí); `reportRaid` napadené vsi pošle jen její lidi, `reportGuards` domovským vsím
  `guard-losses` (`GuardLosses`: padlí, ranění, zajatí, `captorVillageId`, `villageId`) a chráněné
  vsi `guests-leave` za padlé a zajaté. `applyGuardLosses` (raid-apply.ts): padlí `warDeath` bez
  pohřbu (muž rodu – nástupnictví jako `line-man-fell`), ranění `wound`, zajatí `markCaptive` s
  klíčem `guardPrisonerKey` (`<tažení>:<ves>:<osoba>` – číslo osoby by se mohlo potkat s lidmi
  napadené vsi); vězeň u útočníka `guardPrisoner`. Kronika útočníka počítá i hosty.
- **NPC vazal na svolání** – `summonVassals` otevře dialog i NPC rodu (drží ho svolávající, tělo
  stejné), vrátí `npcDialogIds`; web je hned po zámku vsi splní `answerNpcSummons` (domluvený počet
  nejzdatnějších mužů NPC rodu ze vsí, které spravuje – `stewardships.listByStewardHouse`,
  `nobleLineCandidates`; míň mužů = neplnění jako u hráče). Společné odeslání `dispatchSummons`.
  Panel Svolání (`summonsDialogsForPlayer`) ukáže jen svolání vlastního rodu.
- **Rozsudky ve válce** – `WarDeps.disputes` a `vassalages` jsou povinné; `launchDeps` (web) je
  předává, takže přepadení tažením přes rozsudek „mír“ zapíše neposlušnost. Smyčka tažení válku
  nezačíná (vše začne vysláním) – nic dalšího nepotřebuje.
- **Web ochrany a průchodu** – `lib/protection.ts` (`protectionViewForPlayer` – pánové k žádosti,
  hosté zobrazené vsi, vsi přímých vazalů s počtem vlastních mužů, muži schopní služby;
  `requestProtectionForPlayer` přes `guardedAction` `requestProtection` = `war`; poslat / odvolat
  bez zámku vsi – `sendMen` bere zámek sám; `sendProtectionForPlayer` vezme `men` nejzdatnějších
  z `serviceMenOf`; `announceWarPassageForPlayer` – trasa `worldRoute` od sídla k sídlu nepřítele,
  den dnes). Server actions `protectionView`, `requestProtection`, `sendProtection`,
  `recallProtection`, `announceWarPassage`. `WarPanel` – `war-protection` (štít s hosty
  `war-guards`, sepjaté ruce `war-request-protection`, řádky `war-guard-village` se štítem
  `war-guard-sent`, počtem `war-guard-count`, `war-guard-send`, `war-guard-recall`), u války
  stopy `war-passage-open` → `war-passage-list` (vzkaz, `war-announce-passage` u rodů). Ikony
  `house/{passage,guard-send,guard-recall}.svg` (CC0).
- **Port dialogů** – nové `listFor(refId, kind)`, `openOfKind(kind)`, `lapse(id)`, `answer(id,
expected, reply?)` (odpověď se přidá do `body` – `body || reply`).
- **Web** – `lib/summons.ts` (composition root; `summonVassalsForPlayer` přes
  `summonVassalsActionForPlayer` = `guardedAction` s `ACTION_RIGHTS.summonVassals` = `war` na cílové
  vsi; odpověď na svolání jako u Odvodů bez zámku – `sendMen` bere zámek sám), server actions
  `summonVassals`, `answerSummons`, `passagesToAnswer`, `answerPassage` (průchod se ohlašuje přes `announceWarPassage`);
  `levyDialogs` vrací i `summons`. `WarPanel` – roh `war-summon` u války rozbalí přímé vazaly
  (štít s muži schopnými služby `war-vassal-shield`, roh `war-summon-vassal`, bez služby zašedlý),
  ohlášení průchodu `war-passage` (podání ruky – vzít na vědomí, zlomená pečeť – Nevěřit).
  `LevyDialog` – řádek `summons-row` (muži rodu se zaškrtnutím, předvybraní nejzdatnější, štít
  vybraní / domluvení, hodiny s dny, vzkaz, roh Odeslat). Ikona `house/horn.png`.
- **Testy** – `application/__tests__/summons.test.ts` (jen muži rodu, nejzdatnější první, víc svolání
  do vyčerpání dnů, vazal vazala do služby B, míň = neplnění, propadnutí s koncem války – kronika
  a neplnění jednou), `passage.test.ts` (ohlášení, neškodné na ohlášené mapě, „Nevěřit“, jedna
  odpověď, útok = přepadení a zrušení), `db/adapters/__tests__/passage-repository.db.test.ts`
  (souběh tří odpovědí – projde jedna, zrušení v obou směrech, odpověď dialogu v těle jednou),
  e2e `multiplayer.spec.ts` („svolání: …“, „ochrana: …“), `domain/war/__tests__/guard-campaign.test.ts`
  (hosté „bránit se“ / evakuace bez lesa = vzdání, ztráty domů, po kouscích = vcelku, padlý host = nástupnictví),
  `summons.test.ts` (NPC vazal přesně), `launch-campaign.test.ts` (přepadení přes rozsudek).

## Živé vedení a pohled na tažení (Ú6.14)

- **Mlha války** (`domain/war/sight.ts`): `inSight(grid, z, na)` – dohled `WAR.sight` 150 m, stojí-li
  kterýkoli z dvojice v lese (`MARCH_FOREST` mřížky pochodu) 50 m; bez mřížky lesní dohled (raději
  skryje víc). Bere ho i boj (`battle.ts` – `sees`). `discoverBuildings` přidá k `discovered` domy
  cílové vsi, na které dohlédne kterýkoli muž; `stepCampaign` ho volá v každém taktu nájezdu
  (`raidTick` → `discover`, muži útoku ve stavu `fight` / `breach`) – objevené zůstane.
- **Pohled** (`domain/war/view.ts` – `campaignView`, typy `CampaignView*`): vlastní muži celí (zdraví,
  raněný, velitel, zástupce, stav v boji), muži vazalů ve službě jen poloha (`allies`), obránci jen
  v dohledu vlastních mužů na nohou na mapě cíle (`foreign`), domy jen objevené (`discovered` – id,
  druh, poloha); nic dalšího o cizí vsi. `fresh` = stav je novější než `sinceTick` dotazu.
  `leadsLive` = hráč je vůdce, velí jeho muž a ten stojí na nohou (padlý, zajatý, dezertér = ne);
  hráč bez vůdcovství i bez vlastního muže dostane null.
- **Use-casy** (`application/campaign-view.ts`): `campaignViewFor(deps, { playerId, campaignId,
sinceTick })` – kontrolní bod z úložiště, mřížka mapy cíle jen při boji (mezipaměť `grids`, klíč
  `políčko@den`), domy cílové vsi jen s něčím objeveným. `commandCampaign` – pokyn
  (`CampaignCommand`: `lead` s cílem `place` / `building` / `fighter` / `home`, `order`,
  `surrendered`, `presence`) → záměr na takt teď + 2 (`queueCampaignIntent`), výsledek
  `CampaignCommandResult` – `{ queued: true, tick }` (takt záměru), nebo `{ queued: false, reason }`.
  Odmítne (`refused`, bez důvodu): hráč, který živě nevede (vazal, cizí hráč, velí jiný muž, padlý
  či zajatý velitel), místo mimo mapu nebo dál než sousední políčko velitele (kromě mapy cíle),
  neobjevený dům, cizí muž mimo dohled nebo ležící, neznámá skupina. `unreachable` (důvod u kurzoru):
  místo na mapě, na které skupina velitele na pochodu stojí, kam nedojde vůbec (`reachableGoal` →
  null – Pohyb vojska); cíl ve vodě, ke kterému dosažitelné místo je, přijme s místem kliku a posune
  ho tažení. Přítomnost smí poslat jen vůdce živého tažení.
- **Seznam v panelu Vojsko** (`campaignsOf` → `CampaignSummary` s `leads`; Úloha 6.17, návrh
  Clauda v mezích specu – vlastní muže hráč vidí vždy): běžící tažení, která hráč vede, i ta, ve
  kterých jdou jeho muži jako vazala ve službě. Vazal tažení otevře a sleduje svými muži (pohled
  výš), vést smí jen vůdce (`liveCommand` jen u vůdce, tlačítko nese `data-leads`).
- **Úložiště:** `CampaignRepository.activeOf(playerId)` – běžící tažení vůdce nebo s muži hráče
  (`state->'members' @> [{ playerId }]` v kontrolním bodu).
- **Cizí mapa** (`apps/web/lib/foreign-map.ts`): krajina políčka (veřejná – prázdné z
  `cellLandscapeSeed`, se vsí z uloženého seedu sídla přes `createCampaignCells`) jako
  `LandscapeTransfer`; vrstvu překážek si prohlížeč vygeneruje ze seedu vrstvy. Jen pro účastníka
  a jen mapu cíle, políčko vlastního muže a jeho sousedy; stavby nese `CampaignView.discovered`
  a od Úlohy 11 i `CampaignView.known`.
- **Znalost rodu** (lord-control.md – Co vojvoda vidí: Znalost rodu, Tažení se jinak nemění; plán
  2026-11-13 – Úloha 11 a kolo oprav; `domain/war/campaign-knowledge.ts`). Boj, pohyb, kořist,
  varování ani výsledek nájezdu se nemění; opevnění cíle vidí útočník v boji jako dřív.
  - **Pohled za tažení** `CampaignState.seen` (volitelné; políčko `x,y` → `SeenCell` jako
    `JourneyState.seen` – stopa po `JOURNEY.trailStepM`, naposled viděné stavby všech druhů včetně
    opevnění, `since`): tažení objevuje jako výjezd – `lookOnMap` (`lookAround`) z očí mužů nad
    `sightingsOf` první vsi na mapě v den taktu a mřížkou `gridOf`. Po pohybu `lookOut` – až za
    `watchVillages`, který čte stav všech vsí na mapách se skupinou s mužem na nohou (`armyEyes`),
    takže pohled nečte stav žádné vsi navíc (bariéra a čekání workeru stejné); na mapě cíle při
    nájezdu `lookAtTarget` s očima útoku (`attackEyes` – tytéž jako objevování, ves přečetl boj).
    Mapu či ves, kterou takt nemá, pohled nečte a stopu tam nezapíše; takt konce tažení (fáze
    `done`) vsi nečte – nedívá se. Shromaždiště tu není. Znalost nečte boj ani pohyb – jen vydání
    a pohled hráče; takt ji nekopíruje (`campaignTick` – mění se jen novým objektem). Bod, který
    znalost nezapisuje (`recordsKnowledge` – bez `houseId`, z doby před Úlohou 11), pokračuje bit po
    bitu jako dřív (hlídá otisk v `alarm-types.test.ts`).
  - **Rod vůdce** `CampaignState.houseId` (volitelné, `newCampaign` – `launchCampaign` ho dá
    z `prepared.house`): znalost z tažení dostane jen on (muži vazalů ve službě ji svému rodu
    nedoplní – návrh Clauda, `docs/design/lord-control.md` – Co vojvoda vidí: Znalost rodu).
  - **Vydání** `CampaignStep.knowledge` (`KnowledgeOut[]`): v taktu, kdy nájezd skončí (výhra,
    porážka, obrat, rozpad – fáze přestane být `raiding`), `shareTarget` – `seen` mapy cíle; bod
    bez znalosti map vydá objevená obydlí (`discoveredSeen`: `discovered` jako `SeenPart` ze
    `sightingsOf` stavu cílové vsi v den taktu – ves se čte jen s něčím objeveným, jako v boji);
    bez stopy i staveb nic. Na konci tažení (`finish`) `seenKnowledge` – všechny cizí mapy,
    seřazené podle políčka.
  - **Doručení** – `stepOne` (`leaderKnowledge`) doplní rod: `houseId` ze stavu, u bodu bez něj
    `StepCampaignsDeps.houses.activeOf(playerId)`; vloží ji do `CampaignOutbox.knowledge` (bod se
    uloží hned) a `deliverOutbox` ji doručí `KnowledgeRepository.merge` (`mergeKnowledge` s pokrytím
    – dům ze starší znalosti, na jehož místo muži jistě dohlédli a neviděli ho, zmizí;
    `docs/code/journey.md` – Znalost rodu). Bez `StepCampaignsDeps.knowledge` se zahodí a bod se
    kvůli ní neukládá. Worker obojí předává v `campaignDeps`.
  - **Pohled** – `knowledgeOfTarget` (`KnowledgeOfTargetDeps`: `knowledge`, `houses`) přečte znalost
    rodu hráče o mapě cíle – jeden dotaz na pohled; rod vůdce ze stavu, vazal ve službě vidí znalost
    svého rodu. `knownTarget` ji sloučí s tím, co viděli muži tažení na mapě cíle (`targetSeenOf`;
    `mergeKnowledge` i s pokrytím – znalost jiné vsi jen stopou) a vynechá objevená obydlí (pohled je
    nese živě), opevnění (útočník ho vidí ze stavu vsi jako dřív) a obydlí, na jejichž místo muži
    tažení dohlédli (stopa, `inSight` s mřížkou pohledu) a ve vsi už nejsou; jinak „stará zpráva“ –
    dům, který už nestojí, zůstane. Výsledek nese `CampaignView.known` a `WarSceneView.known`
    (`warSceneOnMap`, útočník na mapě cíle); bez znalosti i pohledu tažení pole chybí. Na mapě po
    cestě nese `WarSceneView.known` znalost rodu té mapy, jak je (`knowledgeOfCell` – rod jako
    `knowledgeOfTarget`, jeden dotaz na pohled; Úloha 12b), kreslení ve scéně tažení – Ve scéně –
    Cizí mapa. `campaignViewFor` načte obydlí cílové vsi (s něčím objeveným, nebo
    se stopou tažení na mapě cíle – kvůli zániku) z mezipaměti po dnech `CampaignViewDeps.targets`
    (`TargetDwelling`, klíč `villageId@den` – jako `defenders` scény války; web `TARGETS` v
    `apps/web/lib/campaign.ts`) a znalost, mřížku i obydlí čte souběžně. `commandCampaign` s cílem
    `building` přijme i dům ze znalosti (`dwelling:<id>` – pochod na místo, kde ho rod viděl).
  - **Testy** – `campaign.test.ts` (znalost jen na cizích mapách, vydání na konci, opevnění, ohrady,
    kostel a další stavby v dohledu, pohled nečte žádnou ves navíc – ves po cestě se stavbami,
    prázdná mapa se stopou, po kouscích, z JSON a ze zmraženého bodu = vcelku; s rodem i bez něj
    stejné – vzdání, boj s padlými, rozpad, bod bez znalosti), `step-campaigns.test.ts` (rod ze
    stavu i podle hráče), `campaign-view.test.ts` (známé domy dřív, než je vojsko spatří, rozkaz
    k nim, zaniklý dům do pohledu na jeho místo, vazal, obydlí z mezipaměti po dnech),
    `war-scene.test.ts` (útočník na mapě cíle, vlastní stopa, obránce bez znalosti).
- **Testy:** `application/__tests__/campaign-view.test.ts` (Review Focus 4 – cizí muž, mrtvý
  a zajatý velitel, neobjevený dům, obránce skrytý v lese, cizí hráč = null; místo ve vodě – takt
  záměru a `unreachable`), `domain/war/__tests__/campaign.test.ts` (cíl ve vodě – skupiny dojdou na
  břeh),
  `domain/war/__tests__/sight.test.ts`, `raid-campaign.test.ts` (objevený dům), e2e
  `multiplayer.spec.ts` („živé vedení: …“ – tažení zapsané přímo do DB, worker vedle).

## Ve scéně – napojení na hru

Scéna vojska (scene.md – Vojsko, boj a mlha války) kreslí válku i ve hře, ne jen v ukázce Bitva.
Scéna hry ukazuje **mapu sídla hráče** – vojsko je v ní vidět, když na ní stojí.

- **Pohled** (`domain/war/scene-view.ts` – `warSceneView(state, { cell, side, grid, eyes, forts })`,
  typy `WarSceneFighter`, `WarSceneWall`…): co strana `side` vidí z tažení na mapě `cell`. Vlastní strana celá (útočník =
  celé vojsko tažení i s muži vazalů), druhá jen v dohledu (`inSight`) vlastních bojovníků na
  nohou a očí `eyes` – u obránce domy vsi (návrh Clauda: ves vidí i tehdy, když lidé utekli do
  lesa). Bojovník jen se vším, co scéna kreslí (`WarSceneFighter` – bez `ref`, síly, cílů a tras);
  zdraví jen vlastní strana, cizí muž nese hrubý stav (`state`, `killed`) a počet zásahů `hits`
  (`Fighter.hits` – přičte `takeHit`; scéna podle něj pozná ránu – `strikesOf`); cizímu se domov
  nahradí polohou a cíl (`aim`, `climber`) mimo dohled se smaže. Průlomy
  a žebříky obránce vidí v dohledu, zavřené brány a hradby všichni (stavba, ne vojsko). Boj jen na
  mapě cíle (`shownBattle`): běžící celý; **rozhodnutý do konce dne rozhodnutí** (`raidDay = day`)
  jen padlí a ranění (`down`, bez skupin) vedle pochodu – padlí leží, ranění sedí u domů (vlastní
  strana nese domov), druhá strana jen v dohledu; další den zmizí (bez nového stavu). Jinak pochod
  – skupiny na mapě a jejich aktivní muži se směrem chůze (`heading`). Hradby bojiště počítá
  `battleWallsOf` (web `battleWalls` ji volá).
- **Odehnané stádo** (`WarSceneMarch.herd { group, count }`): kořist `CampaignLoot.herd` jde se
  skupinou s nejmenším id, ve které je muž na nohou (návrh Clauda – kořist nese vojsko jako celek);
  pošle se jen s tou skupinou – obránce ho tak vidí jen v dohledu jako ostatní cizí, útočník vždy.
- **Útěk vsi do lesa** (`WarSceneView.flight` – `WarSceneFlight`; jen obránce na mapě své vsi, vedle
  boje či pochodu): kdo utekl (`ShelterReport.forest`) – dům, postava, dítě, nese zásoby (lidé vsi
  `sceneFolkOf` – přítomní, skupiny domů `houseGroups`, věk jako `fleeParty`); každá skupina domů
  k okraji lesa nejbližšímu jejímu prvnímu člověku (`nearestForest` nad mřížkou dohledu jako
  v `planDefense`), dobytek do lesa (`livestockForest` – součet kusů). Začátek = takt otevření boje
  `BattleState.openTick` (volitelné, zapíše `raidTick`; návrh Clauda – boj, ve kterém všichni utekli,
  se rozhodne hned prvním taktem a bez něj by se chůze k lesu nikdy neukázala); starší stav – běžící
  boj z počtu taktů, rozhodnutý null (lidé stojí u lesa). Útočník útěk nedostane (návrh Clauda –
  ves utekla, než dohlédl). Do útočiště (`refuge`) se útěk nekreslí.
- **Use-case** (`application/war-scene.ts` – `warSceneFor(deps, { playerId, settlementId })`):
  sídlo musí být hráče a ležet v mřížce světa; tažení proti vsi sídla
  (`CampaignRepository.activeAgainst` – `state->'target'->>'villageId'`) z pohledu obránce (mřížka
  pro dohled v lese `sightGrid`, opevnění `battleForts` jen při boji), pak tažení hráče
  (`activeOf`) z pohledu útočníka. Boj má přednost, napadení před vlastním vojskem; jeden pohled.
  Vojsko je na mapě (`present`), stojí-li tu skupina, nebo je tu boj (`shownBattle` – i rozhodnutý
  dnes). Ves sídla se hledá otiskem bez stavu (`stampsOf`); domy, opevnění a lidé obránce
  (`WarSceneDefender` – `folk` jen pro obránce) se čtou ze stavu vsi jednou za herní den –
  mezipaměť `defenders` (klíč `ves@den`, web LRU 16).
  **Pohled obránce (Hráč ve vsi a mimo ni, Úloha 9):** tažení bere z `activeAlarming(ves)` (cíl
  i ves ve varování), nechá ta se skupinou na mapě, bojem nebo průvodem; pořadí pohledů boj > cíl
  > ostatní. `seesAll` = ves varovaná (`warnTick ≤ state.tick`) a `lordAtHome(defender.people,
alarm.owner.lordId, den)` (`people` ve `WarSceneDefender` z téže mezipaměti); `warSceneView`
  > pak ukáže skupiny, bojovníky i průvody a posly bez ohledu na dohled domů, takže vojsko, které ves
  > jen míjí, je s vojvodou doma vidět celé. S vojvodou na výjezdu platí mlha jako dřív.
- **Web:** route `GET /api/war-scene/<sídlo>` (`lib/war-scene.ts`, `no-store`) → `{ war }`; cizí
  sídlo i mapa bez války = `{ war: null }`. Stav nese událost serveru `war` (klíč
  `warKeyOfSettlement`, počítá ji týž `warSceneForPlayer` – po mlze války; server-events.md –
  Válka), dotaz jde jen se scénou, při jiném sídle a po mezeře spojení. `MapWatch` (D62) už
  neexistuje (návrh Clauda – `war` by prozradil cizí tažení proti vsi dřív, než ho ves spatří;
  web-ui.md – Válka ve scéně). `useWarScene` (web-ui.md – Dotazování na tažení) a `sceneWarOf`
  (`lib/war-scene-view.ts`) → `LandscapeScene.setWar` v `useWarWatch`. Na vlastní
  mapě bez závoje mlhy (svou zem hráč zná; cizí mimo dohled server neposlal), padlí do konce dne.
  Útěk `flightOf` – `planFlight` ke dveřím lesa (rozptyl `FLEE_SPREAD_M` 3 m – lidé mizí u okraje
  lesa, ne v louce; návrh Clauda), `startMs = msOfTick(startTick)`; takt neznámý (`startTick` null,
  starší stav tažení) → null, lidé už jsou v lese. Hustým lesem se nejde, proto kdo doběhl
  (`fleeWalkAt(...).gone`), zmizel a `fleeFigures` (`refugee-march.ts`) ho nekreslí; dobytek žene
  poslední, kdo z vsi vyšel (`drivenHerd` za ním), a zmizí s posledním, kdo doběhl; stádo
  s vojskem `herdOf` za skupinou (poloha a směr chůze). Scéna kreslí nejvýš `SCENE_HERD_MAX` (24)
  kusů – krávy (jiný dobytek scéna vojska nemá).
- **Cizí mapa** (`warSceneOnMap(deps, { playerId, campaignId, cell })`; web `?scene=x,y` na route
  tažení, web-ui.md – Cizí mapa ve scéně): útočník – účastník tažení (vůdce i vazal ve službě,
  `isCampaignParticipant`) – vidí ve 3D mapu, na které jeho vojsko stojí. Pohled `attack`: vojsko
  tažení celé, obránci jen v dohledu jeho mužů na nohou (mřížka mapy cíle při boji jako
  `campaignView`), hradby bojiště, z cílové vsi jen objevené domy (`WarSceneView.buildings` –
  `discovered`, poloha a natočení; nic dalšího o cizí vsi). Domy a opevnění cílové vsi z mezipaměti
  `defenders` (`WarSceneDefender.buildings`, klíč `ves@den`). null – cizí hráč, konec tažení
  (`done`, `disbanded`) nebo vojsko na mapě nestojí → scéna jde za vojskem (design „mapu po mapě“):
  zeptá se na pohled na tažení a přepne se na mapu, kde teď stojí velitel, jinak vlastní muž, jinak
  spojenec (web `followCellOf`); na ves se vrátí jen po konci tažení, když vojsko přijde na mapu
  sídla ve scéně, nebo když ho pohled nemá nikde jinde. Dokud na mapě stojí kterákoli skupina
  vojska, scéna zůstane (návrh Clauda – za velitelem jde, až mapu opustí všichni). Scéna se závojem mlhy
  (design „Mlha války na cizí mapě“); vlastní vsi útočník vidí jen na své mapě. Vazal vidí jako
  vlastní stranu celé vojsko tažení i se zdravím mužů pána (návrh Clauda – je jeho součástí).
  - **Co rod zná** (lord-control.md – Co vojvoda vidí: „Při dalším výjezdu i tažení je mapa od
    začátku odkrytá tam, kde už rod byl, a stavby na ní stojí.“; plán 2026-11-13 – Úloha 12b):
    `WarSceneView.known` na každé mapě, kde vojsko stojí – jeden dotaz na pohled, v taktu workeru
    se nečte. Na mapě cíle `knownTarget` jako dřív (objevená obydlí mají přednost, opevnění ze
    stavu vsi, dům, na jehož místo muži dohlédli a ve vsi není, se nepošle), na mapě po cestě
    znalost rodu té mapy (`knowledgeOfCell`; rod vůdce ze stavu, vazal ve službě svůj, bod bez
    `houseId` podle hráče) sloučená s tím, co tam tažení vidí teď (`knownOnWay` –
    `mergeKnowledge` se `CampaignState.seen` té mapy, jako výjezd): stará zpráva platí jen mimo
    dohled – dům, který mezitím shořel, v dohledu vojska nestojí a nový ano (návrh Clauda po
    závěrečné recenzi). Obránce znalost útočníkova rodu nedostane (`warSceneFor` ji nečte,
    `warSceneOnMap` jen pro účastníka). Scéna: stavby, jak je rod naposled viděl, stojí od začátku
    vedle objevených domů (opevnění ze znalosti jen na mapě po cestě – na mapě cíle ho útočník vidí ze stavu vsi) a stopa rodu odkryje šeré místo k mlze války –
    dohled vojska zůstává jasný (web-ui.md – Cizí mapa ve scéně). Boj, pohyb, kořist, varování ani
    výsledek se nemění. Testy `war-scene.test.ts` (mapa po cestě, shořelý dům v dohledu, vazal, bod
    bez rodu, obránce),
    `war-scene-view.test.ts` (`foreignVillageOf`), e2e `multiplayer-war.spec.ts`.
- **Plynulost mezi snímky** (scene.md – Vojsko, boj a mlha války): snímek je uložený kontrolní bod
  tažení, který worker uloží po ≥ 40 taktech (10 s) nebo s událostí – a ten přijde rovnou
  (událost `war`, server-events.md – Válka; dřív se scéna ptala 2× za sekundu na týž bod). Snímky
  tak dělí i desítky taktů. Muži boje i skupiny pochodu (`SceneMarch.tick` = takt pohledu)
  jdou k novému snímku tak dlouho, kolik taktů uběhlo (`glideMs` – při dopočtu po přestávce kratší,
  nejvýš 15 s); rány z vynechaných
  taktů scéna pozná z `cooldown` (`strikeTicks`) a ukáže je, až k nim pohyb dojde. Údery od `since`
  ze serveru ne (návrh Clauda): server zná jen poslední bod – rány mezi body by musel stav boje
  zapisovat do bodu (stovky ran za 40 taktů v jsonb); rytmus ran určuje jádro
  (`cooldown`), scéna ho z bodu dopočte sama a zásahy zná ze součtu `hits` / zdraví.
- **Zatím ne:** lidé cizí vsi mimo boj (útěk útočník nevidí – průvod uprchlíků a posla
  v dohledu ano, Ú14), vozy průvodu uprchlíků, pole a další stavby
  cizí vsi, padlí po skončení tažení týž den (`done` – `activeAgainst` ho nevrátí), ranění
  vesničané po dni boje (`woundedUntil` – scéna vsi je nekreslí zvlášť); stádo za vojskem bere
  polohu skupiny ze snímku, ne plynulou.
- **Testy:** `domain/war/__tests__/scene-view.test.ts` (padlí a ranění do konce dne vedle pochodu,
  další den ne, mlha padlých; `sceneFolkOf`; útěk – kdo, kam, od kdy, dobytek, rozhodnutý boj,
  starší stav, útočník ani bez lesa nic; odehnané stádo – útočník vždy, obránce jen v dohledu),
  `application/__tests__/war-scene.test.ts` (obránce – útočníci v dohledu mužů i domů,
  mlha, cíl mimo dohled, cizí bez zdraví se zásahy, ves jednou za herní den; po boji pochod; padlí
  a útěk ze stavu vsi i po odchodu vojska, další den nic;
  útočník na své mapě; cizí sídlo; `warSceneOnMap` – obránci v dohledu, jen objevené domy, obránce
  cizí domy nedostane, cizí hráč / jiná mapa / konec tažení = null, vazal ve službě), web
  `lib/__tests__/war-scene-view.test.ts` (i výběr mapy `watchCellOf`, další mapa `followCellOf`,
  závoj na cizí mapě, cizí ves z domů, takt pochodu, útěk po okrajích lesa, stádo za skupinou,
  rozhodnutý boj s padlými), `army.test.ts` (plynulý pochod `marchAt`), `battle-fx.test.ts` (rána
  podle zásahů, rány z vynechaných taktů `strikeTicks`), e2e `multiplayer-war.spec.ts` (napadená
  ves B má ve scéně vojsko – `data-war-men` na plátně, útěk do lesa se stádem – `armyStats`
  `army-cow` = ovce v lese, vojsko doma u A, B ho pak nevidí; útočník A přepne scénu na mapu vsi
  B – `foreign-scene`, `data-war-men`, `armyStats`, vojsko přejde na sousední mapu – nová
  `data-cell` a vojsko dál, po návratu domů zpět na ves), db
  `campaign-repository.db.test.ts` (`activeAgainst`).

## Začít znovu během nájezdu (14. 11. 2026)

design/war.md – Začít znovu během nájezdu (útočník i obránce).

- **Restart** – `restartGame` (`application/restart-game.ts`) po archivu sídel, konci výjezdu
  a konci rodu zavolá `turnBackLedCampaigns(deps, { playerId, nowMs })`: každé tažení
  z `CampaignRepository.activeOf`, které hráč vede (`state.playerId` – tažení, kde je jen vazal
  ve službě, ne), dostane jeho jménem záměr `turn-back` se značkou `restart` na takt
  `tickOfMs(now) + INTENT_LEAD_TICKS`. Odmítne-li `addIntent` takt (bod je dál), zkusí první takt
  za bodem (nejvýš `TURN_BACK_ATTEMPTS` = 3× – `queueIntentPastPoint` v `application/campaigns.ts`,
  sdílí ho i obránce); skončené tažení nechá být. Volá se i bez vsí –
  opakovaný restart po pádu záměry dopíše. `RestartGameDeps` mají `campaigns` a `world` (web
  `restartGameForPlayer` – `currentWorld()`). Nové upozornění nevzniká.
- **Doména** – `applyBody` (`domain/war/campaign.ts`): `turn-back` s `restart` platí i bez
  živého vedení (NPC velitel, zástupce) a ve fázi `assembling` (vojsko jde rovnou domů, pozdější
  `set-out` se zahodí); na pochodu a v boji jako „Domů“ (`turnBack` – boj `withdrawn`, důvod
  `order`); ve fázích `returning`, `disbanded` a `done` nic – druhý obrat nic nezmění. Přítomnost
  hráče počítá jako každý jeho záměr (`presenceTick`), takže dál platí Hráč odejde od tažení.
- **Archivovaná ves domova** – políčko archivovaného sídla je pro tažení prázdné
  (`createCampaignCells` – `holderAt` vidí jen nearchivovaná sídla), vojsko na archivovanou ves
  nečeká; `computeWithLoads` archiv pro tažení dál nečte.
- **Obránce** – `surrenderRaidedVillages` (`application/surrender-village.ts`) volá `restartGame`
  před archivem (pod zámkem obránce) se sídly a vsemi z `dynastyStatus`:
  - mapa bez živé vsi (`isVillageAsleep` u všech) se nevzdává – archiv; putující ves se vzdává;
  - nájezd = `CampaignRepository.activeAgainst(ves)` ve fázi `assembling` / `marching` /
    `raiding`, nebo s `CampaignState.yielded.byPlayer` = tento hráč (opakování po pádu; restart
    pozdějšího držitele ji nebere), ne vedený obráncem. Vítěz (`winnerOf`): ze značky vzdání téhož
    hráče ve vsi (`VillageState.surrender` – i když nájezd mezitím skončil), jinak první nájezd
    v pořadí `activeAgainst` (založení, id; víc vsí na mapě – první ves mapy); vůdce musí mít živý
    rod tažení (staré vojsko ne);
  - kroky v pořadí: značka `surrender` `{ byPlayer, toPlayerId, houseId, campaignId, day }` ve
    vsích mapy (`withMark`, stejná se nepřepíše) → záměr obránce `turn-back` se `restart`
    a `surrender` (`isSurrenderIntent` v `alarm.ts`, součást `isDefenderIntent` – od vůdce se
    zahodí; `applyIntent` ho bere před přítomností; `applyBody` jako Začít znovu vůdce a zapíše
    `yielded: { byPlayer, villageId }`) do nájezdů na vsi mapy bez `yielded` tohoto hráče →
    `guestsLeave` (uprchlíci vsí obránce, které jdou do archivu, ve vzdané vsi – `departFromHost`;
    muži pána z ochrany – `sendGuardsHome` z `protection.ts`, klíče `restart-guard:<ves>:<domov>`
    a `restart-guard-home:…`) a `refugeesHome` (uprchlíci vsi v hradišti jiné vsi obránce, která
    jde do archivu – `departFromHost`, `refuge-back:<refId>` jednou) → `transferHolder` (false –
    mapa se nevzdala, nehlásí se) → `updateVillage` se `surrenderVillage` (`domain/vassalage/
escheat.ts` – `escheatVillage` + konec vlády vojvody dnem vzdání, `endedDay`, bez
    `deceased`; kronika „konec rodu“ se nezapíše) → upozornění `village-surrendered`
    `{ villageId, name, campaignId }` s klíčem `surrenderNoticeRef` =
    `restart-surrender:<nájezd>:<ves>` (text a panel války v `apps/web/lib/player-notices.ts`).
    Vrací `SurrenderedMap[]` (`RestartGameResult.surrendered`); web (`restartGameForPlayer`) po
    uvolnění zámku obránce zavolá `finishSurrendered` (`cede-village.ts` – `finishCeded` na mapu,
    chyba se zaloguje) – jinak převezme worker. `RestartGameDeps.campaigns` má i `activeAgainst`.
  - **Převzetí** (`acceptHolderTransfers` v `application/escheat.ts`, pro každý převod): mapa se
    značkou vzdání pro hráče, jehož rod není živý nebo není rodem ze značky (vítěz dal Začít
    znovu), jde do archivu (`settlements.archive`); jinak každá ves `adoptVillage` – se značkou
    pro hráče `surrenderVillage` (dovzdání po pádu po převodu) a upozornění se stejným klíčem,
    `withHolderFaith`, `forNewHolder` (`holderEpoch` +1, bez `awaitingLord` a značky).
  - **Muži rodu na cestě** – `lord-arrives` / `noble-arrives` nesou `holderEpoch` cílové vsi
    (`holderStamp` – `appointLords`, `sendMenAway` v `cede-village.ts`, `ennoble`);
    `settleAppointee` a `settleNoble` (`isHolderArrival` v `domain/village/people/appoint-lord.ts`
    – jediná kontrola) přijmou jinou epochu jako obyčejné lidi (`settleStrangers` – bez `line`
    a `noble`, obydlí mimo dvorec, jídlo do zásob, ves čeká dál). `appointLords` vyslance ze vsi
    mimo rod hráče nepošle a ves ho zapomene (`forgetAppointee`) – do cizí (archivované) vsi
    nezapíše.
- **Archiv v loaderu** – `computeWithLoads(…, { archivedFinal: true })` (jen `computeCampaign`):
  `villageAt` vsi, na jejíž den by takt čekal, prověří archiv (líně jako `villageGone` –
  `archive.wanted` → `VillageRepository.archivedOf`) a pro ves archivovaného sídla vrátí uložený
  stav pro jakýkoli den (jako spící ves – Ruling 40). Výjezd (bez volby) dál `villageAt` null
  a `villageGone`.
- **Staré vojsko** – `ledByEndedHouse(houseId, živý rod)` (`application/campaigns.ts`): tažení
  s `houseId`, které není živým rodem hráče. `campaignsOf` s `houses` ho vůdci nevrací (vazal ve
  službě své muže vidí dál; web `campaignsOfPlayer`); `deliverOutbox(deps, outbox, leader)`
  upozornění vůdci ze starého vojska zahodí (rod se hledá, jen když nějaké jde vůdci; `stepOne`
  předává stav tažení, výjezd ne). Pohled (`campaignViewFor`), pokyny (`commandCampaign`), panel
  (`campaignsOf`) i scéna (`warSceneOnMap`, pohled `attack` ve `warScene`) jdou přes jednu kontrolu
  `mayHandleCampaign(deps, state, playerId)` (`HandleCampaignDeps`): vůdce – rod tažení je živý rod
  hráče; vazal – aspoň jeden jeho muž žije ve vsi, kterou hráč drží (sídlo vsi ze
  `stampsOfVillages` je v `settlements.listActive` – ne archiv, ne vzdaná ani čekající na převod).
  Pohled obránce (`defend`) kontrolu nemá – cizí vojsko vidí dál.
- **Výjezd vzdané vsi** – `restartGame` před `journeys.end` zavolá `endJourneyAtHome`: je-li domov
  výjezdu v úložišti a ne v archivu (vzdal se), pošle mu `away-ends` s `ref` `journey:<id>:restart`;
  u domova v archivu nic.
- **Testy** – `domain/war/__tests__/campaign-restart.test.ts` (fáze, NPC, idempotence; obránce –
  pochod, shromaždiště, boj, záměr od vůdce zahozen, přítomnost beze změny),
  `evacuation.test.ts` (útěk obránců jako po „Domů“), `application/__tests__/restart-game.test.ts`
  (vedené tažení × vazal, odmítnutý takt, pád a opakovaný restart; obránce ve třech fázích,
  zpáteční cesta = archiv, dva nájezdy, uprchlíci z archivovaného hradiště, pád po převodu),
  `step-campaigns.test.ts` (worker ve všech fázích s archivovanou vsí domova, muži vazala domů
  jednou, dvojitý restart; archiv v loaderu, upozornění starého vojska), `campaign-view.test.ts`
  (panel bez starého vojska).

## Hráč ve vsi a mimo ni (14. 11. 2026)

**Přítomnost hráče (Úloha 2).** Tabulka `player_presence(player_id → user.id on delete cascade,
seen_at)`, jeden řádek na hráče (migrace `0051_player_presence`). Port `PresenceRepository`
(`application/presence.ts`): `note(playerId, at)` je upsert s `GREATEST(seen_at, nový)` (starší zápis
nepřepíše novější), `lastSeen(playerIds)` vrací mapu ms jen pro hráče se zápisem; adaptér
`adapters/presence-repository.ts`. Zapisuje web: `notePlayerPresent` (`apps/web/lib/game.ts`) s procesní
mapou, nejvýš jednou za `PRESENCE_NOTE_MS` (10 s, návrh Clauda); volá ho `notePlayerActive` (akce,
dotaz na ves, pohled na varování) a hlavně tep spojení událostí `/api/events` – při připojení
a každých `SSE_HEARTBEAT_MS` (20 s), dokud má hráč hru otevřenou ve viditelném panelu
(`absentTicks` je 1 herní den ≈ 86 s, tep ho bezpečně drží; server-events.md – Spojení
`/api/events`). `GET /api/war-scene/<sídlo>` přítomnost nezapisuje (scéna se na válku ptá jen po
otevření a mezeře, dál ji nese událost `war`). Přítomnost je po hráči, ne po vsi. Čte ji worker
(Odpověď workeru níž). **Přítomnost vůdce u tažení** (záměr `presence`, Velení) posílá také
spojení: s tažením v rozsahu (otevřená mapa tažení) při připojení a v každém tepu
`commandCampaignForPlayer(hráč, tažení, { kind: 'presence' })`, odmítnutí (nevede živě) se
zahodí – dřívější maják z prohlížeče po 20 s a server action `presence` jsou pryč (server-events.md
– Válka).

**Vojvoda doma (`war/lord-home.ts`).** `AlarmOwner.lordId` = hráčův muž (`house.lord_person_id`) jen
u sídelní vsi rodu (`house.lord_village_id`); jiná ves rodu a NPC ves ho nemají. `ownerOf`
(`adapters/alarm-owners.ts`) ho dopočte jedním `CASE`. `lordAtHome(state, lordId, day, gone?)` –
muž žije ve vsi, dnes není pryč (`isAway`: výjezd, tažení, zajetí, posel, útočiště) a tažení ho
dnes neodvedlo (`gone`); `lordHomeAt(s, villageId, owner, ctx)` totéž v taktu nad stavem
`villageAt(villageId, s.day)` (chybí → `MissingData`) a `alarmTaken(…).people` – posel, skupina
uprchlíků i zajatec tažení (`s.captives`), takže zajatý vojvoda není doma hned v taktu zajetí
(Úloha 5b).

**Vojvoda vidí vojsko při vstupu na mapu.** `sightAlarms` (`alarm.ts`) nejdřív zjistí vlastníka vsi
(`ownerOf`; ves už ve varování – zapsaný `owner`) a pro ves, kde je vojvoda doma (`lordHomeAt`), použije `lordSighting`: spatření bez
doběhu (`run: 0`) v poloze skupiny nejblíž `villageCentre` (shoda – první v `armyEyes`), takže
`warnTick` = takt vstupu na mapu a `AlarmVillage.by = 'lord'` (`'villager' | 'messenger' | 'lord'`).
Vojvoda pryč (výjezd, tažení) – `spot` jako dřív, varuje vesničan. Ves už varovanou poslem s pozdějším
`warnTick` vstup s vojvodou doma jen uspíší (`by` se přepíše na `'lord'`). Zápis a zkrácení
`warnTick` beze změny.

**Kdo za ves rozhoduje (Úloha 5).** `deciderOf` (`alarm-steward.ts`) – ves bez hráče (NPC, vojvoda
není doma) rozhodne pravidlem správce hned; ves s vojvodou doma se zeptá na přítomnost
(`AlarmVillage.askedTick`), odpověď `alarm-presence` a každý záměr `alarm-*` vlastníka zapíše
`presenceTick` (`notePresence`); bez přítomnosti déle než `absentTicks` (`ticks.ts`) rozhodne
správce. Podrobnosti: Varování, poslové a útěk do hradiště – Kdo rozhoduje.

**Vzdání vojvody (Úloha 7).** Záměr obránce `lord-surrender` ukončí nájezd na cíl: vojvoda je zajat
vždy, vojsko se vrátí s důvodem `'yielded'` a odnese jen to, co už vzalo (`yieldingLord`,
`yieldLord`, `BattleState.lordYielded` v `campaign.ts`). Podrobnosti: Zajetí a výkupné – Vzdání vojvody.

**Opravy rozhodování varované vsi (Úloha 5b).**

- **Zapnutý správce** o tom, kdo rozhoduje, nerozhoduje (Martin 14. 11. 2026: „Pokud je hráč ve své
  vesnici, tak jí ovládá.“): `withoutPlayer` je jen NPC rod nebo vojvoda mimo ves. Ves se správcem
  se řídí stejně jako ves bez něj.
- **Po volbě hráče** (`decided: 'player'`) převezme zbytek správce i tehdy, když hráč není u hry
  (`playerLeft` – `deciderOf` = `'steward'`, lidé doma). Co hráč zvolil, nezopakuje.
- **Zajatý vojvoda není doma** hned v taktu zajetí: `alarmTaken` vrací i `s.captives` té vsi. Platí
  i pro lidi odvedené po boji.
- **Vzdáním končí varování cílové vsi** (`alarmEnded` v `alarm.ts`: `returnReason === 'yielded'`
  a ves je cíl). Záměr obránce k ní je pak jen přítomnost (`applyAlarm`), `decideAlarms` ji
  přeskočí. Ves před odcházejícím vojskem neutíká, neposílá posla a správce za ni nerozhoduje.
  Posel ani útěk s vojvodou v taktu vzdání proto neprojdou ani v boji, kde zajatce zapíše až
  `reportRaid`.
- **`notePresence`** u ostatních záměrů bere takt záměru (`applyAlarm(…, tick, …)`). Záměry se
  počítají právě v taktu záměru, výsledek je tedy stejný.
- **`yieldingLord`** je exportovaná. Pohled obránce (Úloha 8) se ptá, zda jde vzdát.
- **Vzdání za pochodu** nevolá `shareTarget`, protože fáze nebyla `raiding`. Nic tím nechybí: co
  muži na mapě cíle viděli, jde rodu s návratem (`seenKnowledge`) a objevená obydlí bez boje nejsou.

Testy: `alarm-steward.test.ts`, describe „zajatý vojvoda a vzdání“ a „po kouscích taktů“.

**Odpověď workeru (Úloha 6).** `answerPresence` (`application/defender-presence.ts`) volá `stepOne`
(`step-campaigns.ts`) po výpočtu kola v obou větvích – stav jen v paměti i uložený bod (po `stale`
ne). Port `StepCampaignsDeps.presence` (`Pick<PresenceRepository, 'lastSeen'>`), ve workeru
`createPresenceRepository(db)` (`apps/worker/src/main.ts`). Které vsi odpověď chtějí, určí doména
(`presenceWanted` v `alarm-steward.ts`; NPC ves nikdy):

- `'ask'` – ves se ptá (`askedTick`). Odpověď dostane každý dotaz bez ohledu na `decided` – hradiště
  se ptá kvůli doméně i tam, kde vesnickou část už rozhodl správce.
- `'refresh'` – známá přítomnost je stará `presenceRefreshTicks` (86 taktů) a víc a o vsi ještě může
  rozhodnout (`presenceMatters`): `decided` chybí, nebo je `'player'` a skupina neodešla (Ruling 4 –
  hráč, který po volbě dál hraje, o ves nepřijde), nebo hradiště s doběhlým poslem vsi ještě
  nerozeslalo posly do domény. Po vzdání vojvody (`alarmEnded`) ne, když se vojsko vrací domů ne
  (Ruling 9 níž); `presenceTick` null (u hry nebyl – rozhodl správce) ne.

Pro všechny vlastníky je jeden dotaz `lastSeen`; když žádná ves nic nechce, žádný dotaz. Záměr
`alarm-presence` od vlastníka jde na takt `state.tick + INTENT_LEAD_TICKS`. `seenTick` je poslední
přítomnost oříznutá na takt záměru (`min(tickOfMs(ms), takt záměru)`). Worker, který zaostává za
skutečným časem (restart, výpadek), tak tažení nedá přítomnost „z budoucnosti“ (Review Focus 1).
Bez záznamu nebo bez portu je `seenTick` null a rozhodne správce. Obnova se píše jen s novější
přítomností (`seenTick > presenceTick`). Čeká-li už záměr `alarm-presence` téže vsi od vlastníka za
`state.tick`, další se nepíše. Skončené tažení nic. Záměr za `state.tick` paměť kola nezneplatní –
`memoIntentsKey` bere jen záměry do spočteného taktu.

Kolo končí dotazem (`stepCampaign(…, { pauseOnAsk: true })` z `computeCampaign`): po taktu, ve
kterém se ves zeptala (`askedTick` = takt), krok skončí s `waiting.presence`, `stepOne` uloží bod
v taktu dotazu (i bez paměti workeru se tak další kolo pohne dál) a odpoví na takt dotazu + 2.
Takt odpovědi tak nezávisí na hranicích kol ani na doběhu workeru (závěrečná recenze, drobný 1).

Výsledek: nepřítomnému hráči ves zareaguje v taktu dotazu + 2 (další kolo workeru). Přítomnému worker
přítomnost obnovuje nejvýš po 86 taktech a kole, ves proto čeká na jeho pokyn. Když hráč odejde,
rozhodne správce `absentTicks` + 1 taktů po posledním zápisu přítomnosti.

Testy: `defender-presence.test.ts` (dotaz, čekající záměr, bez portu, obnova, vojsko se vrací, ořez
na takt záměru), `alarm-world.test.ts` – describe „worker odpovídá na přítomnost obránce“ (přítomný
hráč 700 taktů, nepřítomný v taktu dotazu + 2, odchod, volba hráče, paměť kola); přítomnost v paměti
`InMemoryPresence`.

**Opravy po závěrečné recenzi (14. 11. 2026).**

- **Nastavení jen, dokud vojsko hrozí (Ruling 9 – návrh Clauda).** Ves, která čekala na hráče
  (`waitedForPlayer` – `presenceTick` je takt: hráč byl u hry, nebo dal pokyn), rozhodne nastavením
  (hráč odešel, vojvoda ves opustil, `playerLeft`) jen, když jí vojsko hrozí (`armyThreatens`
  v `alarm-steward.ts`): tažení je na pochodu nebo v nájezdu a ves je cíl, na její mapě stojí
  skupina s aktivním mužem (podmínka spatření), nebo ji varoval posel. Jinak čekající rozhodnutí
  propadne (žádný posel ani útěk); hrozí-li vojsko znovu, rozhodne pak. Rozesílání do domény
  hradiště – dokud tažení nejde domů. Okamžité rozhodnutí (NPC, vojvoda není doma, hráč u hry
  nebyl) beze změny. Obnova přítomnosti (`presenceMatters`) skončí, když se vojsko vrací.
  Testy: `alarm-steward.test.ts` – describe „nastavení rozhoduje, jen dokud vojsko hrozí“.
- **Vlastníci vsí v kole (D1).** `sightAlarms` sbírá, co ze světa chybí, přes všechny vsi
  (`gatherMissing` v `campaign-tick.ts` – jedno `MissingData`); totéž posel na mapě (`warnMap`,
  vlastník před kandidáty hradišť). Takt s libovolně mnoha neznámými vlastníky tak potřebuje
  nejvýš tři průchody (vlastníci a vsi → kandidáti hradišť → hotovo), ne jeden na ves – dřív se
  takt s ≥ 9 vlastníky nedopočítal nikdy (`MAX_LOADS`). Ves už ve varování bere zapsaného
  `owner`. Worker si vlastníky pamatuje napříč koly (`CampaignMemory.owners`, `KeptOwner` s taktem
  kola; platí `OWNER_KEEP_TICKS` = 86 taktů ≈ 22 s, starší zapomene konec kola) – vlastník
  nevarované vsi na mapě vojska se tak čte nejvýš jednou za ¼ herního dne, ne každé kolo.
  `refugeHostsOf` jen na dotaz (vstup do varování, posel, útěk), s vlastníkem se nespojuje.
  Testy: `alarm-world.test.ts` – describe „vlastníci vsí v kole smyčky“.
- **Pohled varování** (`alarm-view.ts`): `latestAlarm` přeskočí varování skončené vzdáním
  (`alarmEnded`) – jiné tažení, které ves dál ohrožuje, zůstane vidět a dostane příkazy; body
  tažení čte jednou (`FoundAlarm.all` pro `yieldedBefore`). Bílá vlajka (`yieldLord`) jen u cíle
  tažení – ves, na kterou vojsko netáhne, nemá co vzdát (vzdáním končí nájezd), vlajka chybí.
- **Scéna:** vojvoda doma vidí celé vojsko (`warSceneFor` – `seesAll`) jen, když ho tažení dnes
  neodvedlo (`alarmTaken` – posel, uprchlíci, zajetí; `WarSceneDeps.world`).
- **Postoj** `stanceOf` (`flight.ts`) čte neznámý postoj (nepřevedený `'surrender'`) jako výchozí.
- **Dezerce:** raněný, který leží na bojišti (`down`), neuteče – los ho mine (`desert`).
- **Vzdaný vojvoda v boji** je `BattleState.lordYielded` (dřív `yielded` – plete se s
  `CampaignState.yielded`, ves vzdaná Začít znovu); návrat `'yielded'` beze změny.

**Živé vedení bez rozkazu – dezerce z hladu (Úloha 10).** Spec: war.md – Zásoby tažení, bod Živé
vedení bez rozkazu (Martin 14. 11. 2026). Živě vedené tažení se samo neobrátí ani nenapadne (to dělá
jen NPC velitel). V denním kroku (`dailyStep` v `campaign.ts`) se před dezercí zjistí hlad
(`starving` v `desertion.ts`). Tažení musí být na pochodu nebo v nájezdu, vést ho musí hráčův muž
(`liveCommand`), hráč nesmí být pryč (`absent`) a jídla musí být méně než `homeFoodKg`. To je jídlo na
cestu domů, totéž, podle kterého se obrací NPC velitel (`npc-commander.ts`: muži na nohou × 1 kg ×
`daysHome`). Hladovému tažení `deserters(state, hungry)` přidá každému muži kromě vůdce (`commander`)
`WAR.hungerDesertPerDay` (5 %). U nuceného se přičte k jeho šanci, los zůstává jeden na muže a den
(`desert:<den>:<pořadí>`). Kdo by utekl bez hladu, uteče i s ním, a bez hladu je dezerce nucených bit
po bitu stejná jako dřív.

- **Dezertér** (`desert`): `status: 'deserted'`. Jeho bojovník v probíhajícím boji z bojiště zmizí
  hned (`slipAway` v `rout.ts` – stav `fled`, nikdo ho nepronásleduje). Platí i pro nuceného, který
  by jinak na bojišti dál bojoval. Domů jde hned (Martin 15. 11. 2026): jeho ves dostane den nato
  `away-ends` s dnem dezerce + cesta domů a návrat tažení (`campaign-return`) ho už nevrací – Ú6.6,
  Dezertér jde domů hned.
- **Zůstane jen vůdce:** když po dezerci hladového dne nezbývá jiný muž na nohou, `dailyStep` zavolá
  `disband`. Kronika a upozornění „Výprava se rozpadla.“ (`campaign-disbanded`) jdou jednou, vůdce
  jde domů jako při rozpadu. Výprava jen s vůdcem se tak rozpadne první hladový den.
- **Beze změny:** NPC velitel a zástupce (hráč pryč) se obrátí s `supplies`, když jídla zbývá jen na
  cestu domů. Na pochodu se vojsko obrátí, když jídlo dojde (i živě vedené – Martin 2. 11. 2026).

Testy: `hunger-desertion.test.ts` (los ≈ 5 %, vůdce ne, nucený s přičtenou šancí; nájezd za palisádou:
dezerce podle losu, bojovník pryč, žádný obrat ani útok, rozpad s jedním upozorněním; dezertér domů
hned – `away-ends` den nato s dnem dezerce + cesta (blízká Lhota i vzdálený Brod), konec tažení ho
nevrátí podruhé, ve vsi pryč jen do dne návratu (`returnHome` + `applyInboxDay` den po dni), vůdce
do konce tažení; po kouscích 1 / 37 / 400 s kontrolním bodem; jídlo nad cestou domů; pochod; NPC
a zástupce beze změny).

## Měření tažení a e2e celé války (Ú6.17)

- **Měření** `apps/worker/scripts/measure-campaigns.ts` (v paměti, skutečné `stepCampaigns`) –
  tabulka a rozbor v `docs/code/worker.md` – Výkon – Tažení. Změřeno 7. 11. 2026 (jedno jádro):
  pochod 1 / 5 / 20 tažení × 60 mužů 0,4 / 1,6 / **4,4 %** jádra (cíl ≤ 25 % pro 20 tažení
  **splněn**; bez paměti workeru 2,4 / 10,5 / 39,7 %), 5 tažení u opevněných vsí (15 průlomů,
  útočiště) 2,5 % (dřív 16,2 %). Zrychlení: worker pokračuje od posledního spočteného stavu místo
  opakování taktů od kontrolního bodu a mřížky pochodu drží napříč koly (`MarchGridMemo`); kopie
  stavu v každém taktu zůstává (≈ 45 % zbytku – proč, viz worker.md), od 10. 11. 2026 ruční
  `cloneData` ≈ 5× levnější (pochod 20 tažení 5,2 → 3,4 % jádra, výsledek beze změny). Také
  od 10. 11. 2026 drží worker kontrolní bod v paměti podle verze z úložiště (`xmin` řádku – stav z
  JSON jen při změně, bez `JSON.stringify` otisku) a mapy a vsi z minulého kola načte předem:
  pochod 20 tažení 2,9 → 1,3 % jádra, pochod 15 + varování 5 3,9 → 2,2 %, opevněné 5 3,9 → 3,1 %,
  výsledek beze změny.
- **e2e** `apps/web/e2e/multiplayer-war.spec.ts`: A přepadne B (tažení zapsané rovnou u vsi B,
  velí vesničan – NPC), B s výchozím postojem útěk uteče do lesa i se stádem
  (`battle.shelter`), B má upozornění „Cizí vojsko u vsi …“, A po návratu (vojsko přenesené do
  shromaždiště) „Vojsko se vrátilo domů.“; obě vsi den nájezdu dopočítají znovu i se schránkou
  (`lastDay` o den zpět – herní den trvá v testech ≈ 4,8 h) a kronika obou má nájezd bez opovědi.
  A pak nabídne mír s ročním tributem (platí B), B přijme – válka `peace`, tribut v přijatém kole,
  kronika míru ve schránce obou vsí. Vedle `next start` běží worker se smyčkou tažení (jako test
  živého vedení), mezi nájezdem a návratem se restartuje.
- **e2e hradby** (plán hradeb, Úloha 22) – druhý test téhož souboru: ves B má kolem vsi hotovou
  palisádu s ochozem (`proposeFortification` + `startFortification`, díly dostavěné, `kind:
'walkway'`) **bez bran** – brána by se prosekla dřív, než se vyrobí žebřík. Tažení A (8 mužů,
  velí vesničan – NPC) stojí 40 m vně hradby; NPC velitel volí postup sám (`fastestApproach` –
  žebříky z lesa). Výroba žebříku trvá 4 herní hodiny, v pomalém světě testů ≈ 11 500 taktů, proto
  kontrolní bod začne o 16 000 taktů (≈ 67 min) dřív a worker boj dopočítá najednou. Test ověří
  stanoviště obránců u čáry hradby (`Fighter.post`), žebříky v `BattleState.ladders`, útočníka
  uvnitř obvodu (bod v mnohoúhelníku středů dílů) a nájezd bez opovědi v kronice obou vsí – vsi
  se dopočítají znovu ode dne nájezdu (`replayFrom`; boj mohl začít i včera).
