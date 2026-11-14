# Nadzemní dílny a uhlíř v lese – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hrnčíř, kovář, tesař a uhlíř smějí od roku 750 stavět vypletenou a od roku 800 roubenou dílnu (dům té varianty a vedle přístřešek dílny). Uhlíř si u milíře staví zemnici a opakovaně ji využívá. Uhlí do kovárny nesou dva muži v košatině na tyči.

**Architecture:** Nadzemní dílna je obydlí typu `vypleteny` / `srub` s `Dwelling.workshop`. Nový typ obydlí ani druh stavby nevzniká – záměr, akce a vstup webu dostanou jen volitelný `type`. Cenu, půdorys (přístřešek u boční stěny) a obsazení odvodí pravidla z typu a řemesla. Zemnice u milíře je volitelná část stavu dílny uhlíře (`Workshop.camp`, opuštěné v `VillageState.campRemnants`) a staví se z práce milíře v `charcoal.ts`. Odnos na tyči nahradí nošení kovářovou domácností (`smithFetchPlans` → `charcoalCarryDay`) se stejnou prací. Scéna jen kreslí data z jádra.

**Tech Stack:** TypeScript 6, Vitest, Next.js 16 / React 19, Babylon.js 9, Playwright, Blender (`tools/blender`).

**Spec:** `docs/design/workshops.md` (schváleno – Martin 14. 11. 2026: „Ano, uhlíře schvaluji“). Navazuje na:

- `docs/design/crafts.md` – Budovy (Dílna je zároveň obydlí), Uhlíř – buky, milíř, Milíř u skácených buků, Uhlí a ruda kováře;
- `docs/design/log-house.md` – Dům, Dům s vypletenými stěnami, Kdo v domě bydlí, Správce;
- `docs/design/wagons.md` – Co vozy vozí.

Vzor implementace je vypletený dům D27: `bd022a49` (jádro a web), `4d47988f` (model a ikona). Cesty `rules/…`, `crafts/…` a podobné bez kořene jsou v `packages/game/src/domain/village/`.

## Global Constraints

- **Čísla ze specifikace doslova**, jen v `rules*.ts` s odkazem na sekci `workshops.md`:
  - vypletená dílna od roku **750**, roubená od roku **800**; důvod u kurzoru „Od roku 750“ / „Od roku 800“ dává `dwellingYearReason`;
  - cena, práce, životnost a dětská úmrtnost jako dům té varianty (vypletený 14 stromů, 260 čd, 25 let, × 0,75; roubený 28 stromů, 300 čd, 35 let, × 0,7) a k tomu dnešní přirážka dílny (Rozhodnutí 2);
  - zemnice u milíře: 3 stromy a 10 čd, do 30 m od milíře, na místě bez stromů; využívá se opakovaně, dokud do 150 m od ní je 15 buků; opuštěná zmizí za 5 let;
  - syn jde k tyči od 12 let; práce odnosu se nemění; vůz pro uhlí jezdí jako dosud (wagons.md).
- **Dnešní dílny se nemění** a dál jdou postavit. Ceny 286 čd / 23 stromů (hrnčíř, kovář, tesař) a 60 čd / 7 stromů (uhlíř) zůstanou bit po bitu.
- **Determinismus:** žádná nová náhoda. Místo zemnice se hledá po kružnicích přes `det-math`, jako `findKilnSite`. Dopočet po kouscích musí dát týž stav jako vcelku.
- **Nové části stavu jsou volitelné** (`Workshop.camp`, `VillageState.campRemnants`, `LaborShare.pole`). Chybějící údaj znamená „žádná zemnice“, převod ve `VILLAGE_MIGRATIONS` není potřeba. Rozdělaný milíř starší vsi dojede bez zemnice, zemnici postaví až další milíř.
- **Zlatý otisk:** úloha, která mění výsledek simulace (2 a 3), přepíše otisky, které spadnou (`crafts/__tests__/smith-golden.test.ts`, `craft-skill-golden.test.ts`, `EXPECTED_YEAR_*` ve `core/__tests__/village-golden*.test.ts`), a v commitu napíše proč. Spadne-li pomalý test na mezích, ne na otisku, zastav se a nahlas to.
- **Hexagon:** pravidla jen v doméně. Web posílá záměr (`type` dílny) a zobrazuje, server ověří rok, cenu i místo.
- **UI jako 0 A.D.:** ikony s čísly, slova jen v `Tooltip`, zašedlá varianta s důvodem u kurzoru.
- **Scéna:** Babylon z konkrétních modulů, kreslí se jen při změně (`needsRender`). Modely a ikony jsou vlastní render z `tools/blender` (CC0) s řádkem v `LICENSES.md`. Tyč s košatinou je prop v `man.glb`, ne nový atribut postavy (ta má právě 8 vertex bufferů).
- **Před commitem** projde `npm run typecheck`, `npm run lint`, `npm run test` a `npm run format:check`. Úlohy 1–3 navíc `npm run test:slow`, úlohy 5–6 `npm run test:e2e`. Změna v `docs/code` vyžaduje `npm run check:docs`.
- **Souběh:** `feat/hides-honey` mění `core/simulate-work-apply.ts` a otisky. Po sloučení se otisky přepíšou znovu v integrační větvi, hashe se ručně nespojují. Kdo je pryč (`isAway` – výjezd, výprava), k tyči nejde.
- Komentáře a docs česky s „–“. Rozhodnutí plánu se v docs značí jako „návrh Clauda“, Martinova slova s datem.

## Rozhodnutí plánu (návrh Clauda)

1. **Varianta je typ obydlí dílny.** Nadzemní dílna je `Dwelling` typu `vypleteny` nebo `srub` s `workshop.craft`. Nový `DwellingType` ani `BuildKind` nevzniká. Záměr, akce a vstup webu dostanou volitelné `type?: HouseType`; bez něj se staví dnešní dílna na `CRAFT_BASE`. Výroba dílny se typem nemění.
2. **Ceny.** Přirážka dílny `workshopShelter(craft)` je dnešní `workshopCost(craft) − DWELLINGS[CRAFT_BASE[craft]].cost` (u stromů totéž). Přístřešek stojí u každé varianty stejně:

   | Řemeslo              | Dnešní dílna      | Vypletená (od 750) | Roubená (od 800)  |
   | -------------------- | ----------------- | ------------------ | ----------------- |
   | hrnčíř, kovář, tesař | 286 čd, 23 stromů | 326 čd, 19 stromů  | 366 čd, 33 stromů |
   | uhlíř (bez přirážky) | 60 čd, 7 stromů   | 260 čd, 14 stromů  | 300 čd, 28 stromů |

   Práce bez dřeva (`workshopBuildLabor`) vychází na 288 / 300 čd u hrnčíře, kováře a tesaře a 232 / 244 čd u uhlíře. Kapacita, životnost, dětská úmrtnost, chátrání prázdné dílny a podíl tesaře (`CARPENTRY.dwellingWoodShare`) se berou podle typu.

3. **Přístřešek vedle domu** (spec – Ve scéně):
   - Pultový přístřešek stojí u pravé boční stěny (+x v osách domu), 6 m podél ní a `WORKSHOP_SIDE_M` od ní: 3,2 m u hrnčíře, kováře a tesaře (hloubka dnešního přístřešku), 2 m u uhlíře.
   - Uhlíř má pod přístřeškem volnou hromadu dřeva, ne vyskládanou hráň – Martin u modelu dílny: „tak vyskládané dřevo tehdy neměli, navíc na dešti“. Přirážka zůstane 0 podle specifikace.
   - Půdorys dílny je obdélník domu rozšířený o přístřešek a vyklízená plocha se posune o totéž.
   - Dílna stojí bez pozemku jako dnešní dílny. S variantou rozměrů se přístřešek nenatahuje, jen se posune s boční stěnou.
4. **Kdo v nadzemní dílně bydlí:** platí pro ni pravidla dílny, ne nadzemního domu z pořadí.
   - Osídlí ji rodina jako dnešní dílnu, přednost mají dočasně ubytovaní.
   - `isLogHouse` platí jen pro nadzemní dům **bez** dílny.
   - Rozestavěná nadzemní dílna se počítá mezi stavby, na které čeká rodina, ne mezi nadzemní domy správce.
5. **Přestavba:** dosloužilá dílna se přestaví na týž typ za cenu dílny toho typu (`workshopBuildLabor(craft, d.type)`, `workshopTrees(craft, d.type)`).
6. **Správce** zkouší typy od nejlepšího, který už jde (od 800 roubená, od 750 vypletená), a nakonec dnešní dílnu. Postaví první, na kterou má cenu předem a místo – vypletená chce méně dřeva než dnešní dílna.
7. **Rozhraní:**
   - Tlačítko řemesla (F, G, H, T) je rozcestník variant: dnešní, vypletená a roubená. Ikony jsou `build/<model>-<typ>` a popisky „Kovář – Vypletená“ apod.; roubená je do roku 800 zašedlá s „Od roku 800“.
   - Do roku 750, kdy nejde ani vypletená, se rozcestník přeskočí. Tlačítko i klávesa staví rovnou dnešní dílnu – stejně jako rozcestník obydlí s jediným druhem.
8. **Zemnice u milíře** (`Workshop.camp`):
   - **Použitelná zemnice:** při výběru dávky nového milíře (`startKiln`) leží 15 nejbližších volných buků (`nearestMatureTrees(…, CHARCOAL_KILN.trees, claimed, isBeech)`) do 150 m od zemnice. Pak se dávka vybírá od zemnice – první buk nejblíž zemnici. Jinak se dávka vybírá jako dnes od dílny a stará zemnice se opustí. Dávku od zemnice plán vyvozuje z Martinova „opakovaně využívat, dokud v okolí bude dost stromů“ – jinak by uhlíř nespal u milíře.
   - **Místo nové zemnice** se hledá u milíře nové dávky po kružnicích po 2 m, od 8 m (mimo milířiště) do 30 m, body jako ve `findKilnSite`.
     - Vybere se první místo, které projde `checkCampSite`. Půda jako u milíře: ne pole, sad, hřbitov, ohrada, pozemek, voda, svah, výchoz, posvátné místo ani pevná cesta, aspoň 20 m od domů, mimo milíře a jiné zemnice.
     - Na půdorysu + 0,5 m nesmí stát strom ani souš – ani ty, které pro milíř teprve padnou.
     - Zemnice se natočí vchodem k milíři.
     - Když místo není, zemnice tentokrát nevznikne – uhlíř hlídá u milíře jako dnes – a zkusí se to u dalšího milíře.
   - **3 stromy** jsou klády z vyklízení milířiště: `kiln.clearing.logs` se o ně zmenší a na hromadu vsi nejdou. Chybějící stromy se skácí navíc: nejbližší dospělé stromy k zemnici (ne z dávky, posvátné ani vyhrazené). Přidají se ke `kiln.clearing` za `OBSTACLE_COST.tree` a klády nedají.
   - **10 čd** jdou z práce milíře. Dokud zemnice dílny není hotová, jde práce fáze `build` kteréhokoli milíře uhlíře napřed do ní, s přirážkou za chůzi `kilnWalkFactor`. Pálení tak bez zemnice nezačne. Odhad cyklu milíře (`kilnCycleDays`) se nemění.
   - **Opuštěná zemnice** (nahrazená novou nebo po zániku dílny uhlíře) přejde do `VillageState.campRemnants` a za 5 let zmizí (`updateCampRemnants` vedle `updateKilnRemnants`).
   - Hotová, rozestavěná i opuštěná zemnice brání stavbám a milíři (`PlacementVillage.camps` – „Stojí tu zemnice uhlíře.“) a pěšina ji obchází (`PathVillage.camps`).
   - Přespávání práci nemění – pálení je už teď celá práce domácnosti uhlíře. Mění jen scénu.
9. **Odnos na tyči:**
   - **Práce celkem beze změny:** `kg × basketManDaysPerKg(walkM, SMITH_SUPPLY.basketKg.charcoal)`. To je „pětina vytahání“ ze specifikace – od 20. 10. ji počítá nošení v koších podle cesty kovárna ↔ milíř. Každý z dvojice nese polovinu.
   - **Dvojice:** uhlíř (`smithHead` domácnosti uhlíře) a druhý muž v tomto pořadí: syn uhlíře 12–13 (nejstarší z nich), syn uhlíře od 14, syn kováře 12–13, syn kováře od 14, kovář. Věk 12 platí i pro syna kováře, protože tyč chce dva dost velké.
   - **Odkud jde práce:**
     - polovina uhlíře a polovina jeho syna od 14 let z práce dílny uhlíře;
     - syn 12–13, uhlíře i kováře, ten den nepase a nešlape měch;
     - polovina kováře nebo jeho syna od 14 let z práce dílny kováře, u odpočívajícího kováře z práce vsi (jako dnes).
   - **Cesta uhlíře pro kováře:** jednou za den nošení, `walkM ÷ SMITH_SUPPLY.carryMps ÷ DAY_S` (od milíře ke kovárně), z práce dílny uhlíře.
   - **Plán uhlíře** (`burnerPlans`) počítá s nošením pěšky, protože vůz se rozhoduje až z vytahaného uhlí. Uhlí, které odveze vůz, nikdo nenese a ušetřený čas uhlíře jde na další práci u milíře. Srovnání vozu s nošením se nemění.
   - Synové kováře 10–11 už uhlí nenosí (`charcoalYoungsters` zmizí). Ruda zůstává beze změny.
10. **Scéna:**
    - Nadzemní dílna je model domu typu (`vypleteny.glb`, `srub.glb`, i se staveništěm) a vedle něj `pristresek-<model>.glb`. Předpona `pristresek` a `milir` drží modely mimo variantu rozměrů – rozhoduje `shapeableAs`.
    - Staveniště: dům se staví v podílu práce `DWELLINGS[type].cost ÷ workshopCost(craft, type)`, pak přibudou sloupky přístřešku, hotová dílna je celá. Dílny se dál nerozpadají po dílech.
    - Zemnice u milíře je `milir-zemnice.glb`; než se dostaví, leží na místě tři klády. Opuštěná sesedá a zarůstá.
    - Při pálení zemnice nestojí prázdná: uhlíř chodí k milíři ze zemnice, ne ze vsi, a kdo z domácnosti uhlíře zrovna nehlídá, sedí u vchodu (`sit`). Noc herní scéna zatím nemá (Den a noc je jen na `/dev/landscape`).
    - Dvojice s košatinou na tyči jde po pěšinách mezi milířem a kovárnou: přední muž `carry-pole` s rekvizitou, zadní `carry-pole-back`, rozestup 2,4 m. Uhlíř bez syna jde napřed sám do kovárny.
11. **Pro koho zemnice a tyč platí – otázka na Martina.** Plán počítá s každým uhlířem hned, i v dnešní zemnici a před rokem 750. Když Martin řekne „jen nadzemní dílna“, přibude podmínka `isHouseType(burner.type)` na dvou místech: u zemnice při začátku milíře a u výběru dvojice (`charcoalCarryDay`, `burnerPlans`).

## Review Focus

1. **Starší uložená ves** – uhlíř bez `camp`, milíř ve fázi `build` nebo `burn`, bez `campRemnants` – se načte a dopočítá bez pádu. Rozdělaný milíř dojede bez zemnice, zemnice vznikne u dalšího milíře. Test v Úloze 2.
2. **Dopočet po kouscích** přes začátek milíře, stavbu zemnice, její opuštění a zmizení dá týž stav jako vcelku. Test v Úloze 2.
3. **Prázdná nebo rozestavěná nadzemní dílna** se osídlí jako dílna (ne jen elitou), počítá se v `availableSettlers` a neblokuje správci nadzemní dům. Nadzemní dům bez dílny dál osídlí jen lidé z pořadí. Testy v Úloze 1.
4. **Uhlí, které odveze vůz,** nikdo nenese a uhlíř za něj nemá cestu pro kováře. U odpočívajícího kováře jde jeho polovina z práce vsi. Syn 12–13 u tyče ten den nepase ani nešlape měch. Testy v Úloze 3.
5. **Varianta před svým rokem přes ruční volání serveru** (`type: 'srub'` v roce 790) vrátí „Od roku 800“ a neplatný `type` vstup odmítne. Do roku 750 klávesa řemesla staví rovnou dnešní dílnu. Testy v Úlohách 1 a 5.

---

### Task 1: Nadzemní dílny v jádru, na serveru a v nabídce staveb (Sonnet)

**Files:**

- Modify (jádro):
  - ceny a půdorys: `rules/rules-crafts.ts`, `buildings/costs.ts` (exportovat `workshopBuildCost`, nové `workshopCosts`), `crafts/crafts.ts` (`workshopFootprints`);
  - stavba: `core/actions.ts` (`startWorkshop`), `buildings/build-intent.ts` (`WorkshopIntent`, `buildWorkshop`), `core/simulate-build.ts` (`decideRebuilds`), `buildings/demolition.ts`;
  - umístění: `placement/placement-dwellings.ts` (`checkWorkshopPlacement`, ř. 215) a další volání `workshopFootprints` v `placement/placement-geometry.ts`, `placement/placement-squares.ts`, `buildings/ruins.ts` a `disasters/fire.ts`;
  - obsazení a správce: `people/log-house-settle.ts` (`isLogHouse`), `people/households.ts` (`availableSettlers`), `people/displaced.ts` (`hosts`), `steward/steward-log-house.ts` (`buildingLogHouses`), `steward/steward.ts` (`workshopStep`).
- Modify (aplikace a web – jen data, bez rozhraní):
  - vstup: `packages/game/src/application/place-workshop.ts`, `apps/web/lib/village-input.ts`, `apps/web/lib/village.ts` (`placeWorkshopForPlayer`), `apps/web/app/game/actions/village.ts` (JSDoc);
  - nabídka staveb: `apps/web/lib/village-view.ts` (`buildOptions`), `apps/web/lib/village-view-types.ts` (`BuildOption.variants`);
  - `apps/web/lib/scene/village-placement.ts:406` – zatím `CRAFT_BASE[mode.craft]` do povinného typu `workshopFootprints`.
- Create (testy): `crafts/__tests__/workshop-house.test.ts`, `people/__tests__/workshop-house-settle.test.ts`, `steward/__tests__/steward-workshop-house.test.ts`.
- Modify (testy): `apps/web/lib/__tests__/village-input.test.ts`, `apps/web/lib/__tests__/village-view.test.ts`.
- Docs:
  - `docs/code/village-crafts.md` (Řemesla – nadzemní dílna), `docs/code/village-buildings.md` (nová sekce „Nadzemní dílny (workshops.md)“), `docs/code/village-steward.md` (dílna nejlepší varianty), `docs/code/web-ui.md` (vstup `type`);
  - `docs/design/crafts.md` (Budovy – odkaz na `workshops.md`), `docs/design/workshops.md` (Rozhodnutí 2–6 jako návrh Clauda).

**Interfaces:**

- Produces:
  - `workshopShelter(craft: Craft): { manDays: number; trees: number }` – `{ manDays: 66, trees: 5 }` u hrnčíře, kováře a tesaře, `{ manDays: 0, trees: 0 }` u uhlíře.
  - `workshopCost`, `workshopTrees` a `workshopBuildLabor` dostanou parametr `type: DwellingType = CRAFT_BASE[craft]`, např. `workshopCost(craft: Craft, type: DwellingType = CRAFT_BASE[craft]): number`.
    - Pro základní typ dnešním vzorcem.
    - Pro nadzemní typ `DWELLINGS[type].cost + shelter.manDays`, resp. `DWELLING_TREES[type] + shelter.trees`.
  - `WORKSHOP_SIDE_M: Readonly<Record<Craft, number>>` – `{ potter: 3.2, smith: 3.2, carpenter: 3.2, burner: 2 }`.
  - `workshopBuildCost(craft: Craft, type?: DwellingType): BuildCost`.
  - `workshopCosts(craft: Craft, type: DwellingType): Record<BuildKind, BuildCost>` – `BUILD_COSTS` s cenou dílny daného typu pro `buildAffordability` a `payUpfront`.
  - `workshopLaborManDays(craft, obstacleCost, plan, type?: DwellingType): number`.
  - `workshopFootprints(craft: Craft, position: Position, shape: DwellingShape, type: DwellingType): Point[][]`.
    - `type` je povinný.
    - U nadzemního typu vrátí jeden obdélník – dům rozšířený o `WORKSHOP_SIDE_M[craft]` na +x.
  - `checkWorkshopPlacement(landscape, village, craft, position, obstacles?, type?: HouseType)`.
  - `WorkshopIntent.type?: HouseType` a `PlaceWorkshopInput.type?: HouseType`.
  - `startWorkshop(state, day, craft, position, obstacleCost, obstacleIds?, site?, type?: HouseType): VillageState` – typ, který není `HouseType`, hodí RangeError.
  - `parsePlaceWorkshopInput(value): { craft: Craft; position: Position; type?: HouseType } | null`.
  - `isLogHouse(d)` vrací `isHouseType(d.type) && d.workshop === undefined`.
  - `BuildOption.variants`:
    - `payment` a `extendAffordable` budou volitelné (jen ohrada koní);
    - u řemesel klíče `vypleteny` a `srub` s `laborManDays`, `upfront`, `affordable` a `blocked` = `dwellingYearReason(type, day)`.

- [ ] **Step 1: Failing testy**
  - `workshop-house.test.ts`:
    - ceny podle tabulky v Rozhodnutí 2 a beze změny dnešní: `workshopCost('smith')` 286, `workshopTrees('smith')` 23, `workshopCost('burner')` 60, `workshopTrees('burner')` 7, `workshopBuildLabor('carpenter', 'srub')` 300, `workshopBuildLabor('burner', 'vypleteny')` 232;
    - `workshopFootprints('smith', { x: 0, z: 0, rotation: 0 }, rovný tvar, 'srub')` je jeden obdélník x −2,5…5,7, z −3…3;
    - `'burner', …, 'vypleteny'` dá x −2,5…4,5 a `'smith', …, 'polozemnice'` dnešní obdélník (z −2,5…5,7);
    - `applyBuildIntent` s `{ kind: 'workshop', craft: 'smith', type: 'vypleteny' }`:
      - 31. 12. 749 → `{ ok: false, reason: 'Od roku 750' }`;
      - 1. 1. 750 → stavba s `dwellingType: 'vypleteny'` a `craft: 'smith'`;
      - s `type: 'srub'` 31. 12. 799 → „Od roku 800“;
    - `startWorkshop(…, 'dvorec' as HouseType)` → RangeError;
    - dostavěná dílna má `type: 'vypleteny'`, `workshop.craft: 'smith'` a žádný `plot`;
    - roubená kovárna po 35 letech → stavba `rebuild` s `dwellingType: 'srub'` a cenou `workshopBuildLabor('smith', 'srub')` + kácení dřeva.
  - `workshop-house-settle.test.ts`:
    - prázdnou nadzemní kovárnu po `occupyEmptyDwellings` osídlí rodina ženatého syna z přeplněného domu;
    - `isLogHouse` i `isEmptyLogHouse` jsou pro ni false;
    - rozestavěná nadzemní dílna (`dwellingType: 'srub'`, `craft`, `dwellingId: null`) sníží `availableSettlers` o 1 jako dnešní dílna;
    - `logHouseStep` ji nepočítá jako rozestavěný nadzemní dům.
  - `steward-workshop-house.test.ts` (fixtury jako `steward-log-house.test.ts`): `workshopStep` v roce 700 postaví `polozemnice`, v roce 760 `vypleteny` a v roce 810 `srub`; v roce 810 s dřevem na 20 stromů postaví `vypleteny`.
  - `village-input.test.ts`: `type: 'srub'` projde, `type: 'dvorec'` → null, bez `type` výsledek klíč `type` nemá.
  - `village-view.test.ts`:
    - v roce 700 `build.smith.variants.vypleteny` → `laborManDays: 326`, `blocked: 'Od roku 750'`;
    - v roce 760 `vypleteny.blocked` → `null` a `srub.blocked` → „Od roku 800“.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/domain/village/crafts/__tests__/workshop-house.test.ts src/domain/village/people src/domain/village/steward/__tests__/steward-workshop-house.test.ts` → FAIL (funkce s typem a testované chování chybí).
- [ ] **Step 3: Implementace.** Pasti:
  - Volání `CRAFT_BASE[craft]` v souborech z výčtu nahraď typem dílny (`d.type`, `intent.type ?? CRAFT_BASE[craft]`). Povinný typ ve `workshopFootprints` ukáže kompilátor u všech volání.
  - Vyklízená plocha nadzemní dílny je `freeDwellingClearings(type, …)` s `maxX + WORKSHOP_SIDE_M[craft]`.
  - `availableSettlers` počítá stavbu s `craft` vždy, `buildingLogHouses` jen stavby bez `craft` a `hosts` použije `isLogHouse`.
  - Správce zkouší typy od nejlepšího `trySlots` po jednom (`HOUSE_TYPES_BEST_FIRST` podle `dwellingYearReason`, nakonec dnešní) a skončí u prvního, který začne.
  - `buildOptions` počítá varianty řemesel z `workshopBuildCost(craft, type)` přes `affordability(stock, …)`.
- [ ] **Step 4:** Testy z kroku 2 projdou, stejně jako `npx vitest run lib/__tests__/village-input.test.ts lib/__tests__/village-view.test.ts` v `apps/web`.
- [ ] **Step 5:** Kontroly z Global Constraints včetně `npm run test:slow`. Dílny před rokem 750 se nemění, takže otisky musí projít beze změny – když spadnou, hledej chybu, nepřepisuj je.
- [ ] **Step 6:** Docs a commit `feat(game): nadzemní dílny řemeslníků – vypletená od 750, roubená od 800`.

### Task 2: Zemnice u milíře (opus – stav uhlíře, determinismus)

**Files:**

- Create: `crafts/burner-camp.ts`; test `crafts/__tests__/burner-camp.test.ts`
- Modify:
  - stav a čísla: `types/types-crafts.ts`, `types/types-state.ts`, `rules/rules-crafts.ts`;
  - `crafts/charcoal.ts` – `startKiln` dostane `anchor`; kde `workBurner` začíná nový milíř, rozhodne o zemnici; ve fázi `build` jde práce napřed do zemnice;
  - `placement/placement-dwellings.ts` (nová `checkCampSite`, zemnice brání v `checkKilnSite` i u obydlí), `placement/placement-types.ts`, `placement/placement-village.ts`;
  - pěšiny: `paths/network-types.ts`, `paths/village.ts` (`pathVillageOf`), `paths/network-keys.ts` (`campsKey`); v mřížce zemnice blokuje stejně jako `kilns`;
  - `core/simulate-build.ts` – zaniklá dílna uhlíře převede zemnici do `campRemnants`; `updateCampRemnants` se volá tam, kde `updateKilnRemnants`;
  - web data: `apps/web/lib/village-view-scene.ts`, `apps/web/lib/village-view-types.ts` – `SceneVillage.burnerCamps` a `camps` v PlacementVillage ze scény (musí se shodovat se serverem).
- Test: `burner-camp.test.ts`, `apps/web/lib/__tests__/village-view.test.ts` (shoda `camps` scény s `placementVillageOf`); otisky
- Docs: `docs/code/village-crafts.md` – Uhlíř, nový odstavec „Zemnice u milíře“; `docs/design/workshops.md` – Rozhodnutí 8 jako návrh Clauda

**Interfaces:**

- Consumes: nic nového z Úlohy 1 – jde po ní kvůli sdíleným souborům.
- Produces:
  - `BURNER_CAMP = { trees: 3, buildManDays: 10, minFromKilnM: 8, maxFromKilnM: 30, stepM: 2, reuseRadiusM: 150, abandonedYears: 5, footprintM: { width: 3, depth: 3.5 }, treeMarginM: 0.5 } as const` – komentář odkazuje na `workshops.md`, Uhlíř – zemnice u milíře.
  - `interface BurnerCamp { id: number; x: number; z: number; rotation: number; done: number; builtDay?: number }` – `id` z `nextId`, `done` je odvedená práce v čd.
  - `interface CampRemnant { id: number; burnerId: number; x: number; z: number; rotation: number; day: number }`.
  - `Workshop.camp?: BurnerCamp`, `VillageState.campRemnants?: CampRemnant[]`.
  - `campUsable(state: VillageState, day: number, obstacles: ObstacleLayer, camp: { x: number; z: number }): boolean`.
  - `findCampSite(state, day, landscape, obstacles, kilnSite: { x: number; z: number }): { x: number; z: number; rotation: number } | null`.
  - `checkCampSite(landscape, village, site: { x: number; z: number; rotation: number }, obstacles?): PlacementCheck`.
  - `abandonCamp(state: VillageState, burner: Dwelling, day: number): void`, `campRemnantOvergrowth(r: Pick<CampRemnant, 'day'>, day: number): number` a `updateCampRemnants(state, day): void`.
  - `startKiln(…, options: { walk?; site?; anchor?: { x: number; z: number } })` – první buk nejblíž `anchor ?? dwelling.position`; chůze se dál měří od dílny.
  - `PlacementVillage.camps?` a `PathVillage.camps?`: `readonly { x: number; z: number; rotation: number }[]` – hotové, rozestavěné i opuštěné zemnice.
  - `SceneBurnerCamp { id: number; burnerId: number; x: number; z: number; rotation: number; built: number; occupied: boolean; overgrowth: number | null }` a `SceneVillage.burnerCamps?: SceneBurnerCamp[]`.
    - `built` je 0–1 po 5 %.
    - `occupied` je true, když je zemnice hotová a milíř uhlíře pálí.
    - `overgrowth` je u opuštěné zemnice 0–1 po 5 %, jinak null.

- [ ] **Step 1: Failing testy** – `burner-camp.test.ts`, fixtury jako `charcoal.test.ts` a `kiln-site.test.ts`:
  - **Místo:** první milíř založí `workshop.camp`.
    - Střed leží 8–30 m od `kiln.site`.
    - Na půdorysu + 0,5 m nestojí strom ani souš, ani buk z dávky.
    - Vchod míří k milíři.
  - **Stromy:**
    - milířiště s 5 kládami → `clearing.logs` o 3 menší, `clearing.ids` beze změny;
    - s 1 kládou → `logs` 0, v `clearing.ids` přibudou 2 nejbližší dospělé stromy k zemnici a `cost` vzroste o 2 × 3.
  - **Práce:**
    - ve fázi `build` jde prvních 10 čd (× `kilnWalkFactor`) do `camp.done` a `builtDay` dostane den dokončení – teprve pak se staví kupa;
    - pálení nezačne, dokud zemnice není hotová.
  - **Opakované využití:**
    - další milíř s aspoň 15 volnými buky do 150 m od zemnice dostane tutéž zemnici (stejné `id`); první buk dávky je nejbližší zemnici;
    - bez nich přejde stará zemnice do `campRemnants` s dnešním dnem a u nového milíře vznikne nová.
  - **Zánik:** `updateCampRemnants` za 5 let zemnici smaže; prázdné `campRemnants` zmizí ze stavu.
  - **Bez místa:**
    - hustá syntetická vrstva bez místa bez stromů do 30 m → `camp` nevznikne a milíř jede dál;
    - ves bez vrstvy překážek (milíř bez `site`) → žádná zemnice.
  - **Brání stavbám:** obydlí i `checkKilnSite` přes zemnici → „Stojí tu zemnice uhlíře.“
  - **Starší ves:** milíř ve fázi `burn` a bez `camp` se dopočítá bez pádu; zemnice vznikne až u dalšího milíře.
  - **Dopočet po kouscích:** po 1, 7 a 30 dnech přes začátek milíře, dostavění a opuštění zemnice → `toEqual` s dopočtem vcelku.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/domain/village/crafts/__tests__/burner-camp.test.ts` → FAIL.
- [ ] **Step 3: Implementace**
  - `findCampSite` počítá body kružnic přes `detCos` / `detSin` jako `findKilnSite`, od úhlu 0.
  - Natočení zemnice se odvodí z úhlu bodu (vchod k milíři), bez `atan2`.
  - „Strom“ znamená stojící dospělý i mladý strom nebo souš z vrstvy překážek se změnami vsi (`obstacleStatus`) a také strom lesa vsi.
- [ ] **Step 4:** Testy z kroku 2 projdou, stejně jako `npx vitest run lib/__tests__/village-view.test.ts` v `apps/web`.
- [ ] **Step 5: Zlatý otisk.** `smith-golden` a `craft-skill-golden` běží bez vrstvy překážek (`advanceVillage(…, null)`). Milíř bez `site` zemnici nestaví, takže se tyto otisky nesmí změnit. Přepiš jen otisky s krajinou, které spadnou (o 3 klády méně na hromadě, 10 čd práce u milíře navíc). Pak kontroly včetně `npm run test:slow`.
- [ ] **Step 6:** Docs a commit `feat(game): uhlíř si staví zemnici u milíře a opakovaně ji využívá` (v těle důvod nových otisků).

### Task 3: Odnos uhlí na tyči (opus – pořadí práce dne)

**Files:**

- Create: `crafts/charcoal-pole.ts`; test `crafts/__tests__/charcoal-pole.test.ts`
- Modify:
  - `rules/rules-crafts.ts` (`CHARCOAL_POLE`; `SMITH_SUPPLY.charcoalFromAge` smaž, když ho nic nečte), `types/types-chronicle.ts` (`PolePartnerKind`, `LaborShare.pole?`);
  - `crafts/crafts.ts` (`burnerPlans`, předání práce odnosu do `workCrafts`), `crafts/charcoal.ts` (`workBurner` platí odnos z práce dílny), `crafts/smith-supply.ts` (smaž `smithFetchDay`, `SmithFetchDay`, `charcoalYoungsters` a `SmithOreSummary.sons`);
  - den: `core/simulate-hauls.ts` (`smithFetchPlans` nahradí `charcoalCarryDay`), `core/simulate-work-people.ts` (`restingFetch`, `restingCarry`), `core/simulate-work-apply.ts` (`fetchPlans`, `busy`, supply), `core/simulate-work-context.ts`, `core/labor-report.ts` (podíl `fetch` s `pole`);
  - `apps/web/components/game/hud/selection/crafts.tsx` – smaž řádek o synech, kteří nosí uhlí, z panelu kovárny.
- Test: `charcoal-pole.test.ts`, `crafts/__tests__/smith-supply.test.ts`, `crafts/__tests__/crafts.test.ts` (`burnerPlans`); otisky
- Docs:
  - `docs/code/village-crafts.md` – Uhlí a ruda kováře: odnos na tyči;
  - `docs/design/crafts.md` – Uhlí ke kováři: bod „Kdo nosí“ přeškrtni s odkazem na `workshops.md` (14. 11. 2026);
  - `docs/design/workshops.md` – Rozhodnutí 9 jako návrh Clauda.

**Interfaces:**

- Consumes: soubory po Úloze 2 (jde po ní).
- Produces:
  - `CHARCOAL_POLE = { sonFromAge: 12 } as const`.
  - `type PolePartnerKind = 'burner-son' | 'smith-son' | 'smith'`; `LaborShare.pole?: PolePartnerKind`.
  - `interface PolePartner { personId: number; age: number; dwellingId: number; kind: PolePartnerKind }`.
  - `polePartner(state: Pick<VillageState, 'people'>, day: number, burnerId: number, smithId: number): PolePartner | null` – pořadí podle Rozhodnutí 9; vynechá `isAway`.
  - `fetchWalkManDays(walkM: number): number` = `walkM / SMITH_SUPPLY.carryMps / DAY_S`.
  - `interface PoleCarry { burnerId: number; kilnId?: number; smithId: number; at: { x: number; z: number }; kg: number; manDays: number; burner: { personId: number; age: number }; partner: PolePartner; fetchWalk: number }` – `manDays` je práce celé dvojice.
  - `interface CharcoalCarryDay { pairs: PoleCarry[]; burners: Map<number, number>; smiths: Map<number, number>; busy: number[] }` – práce domácností uhlířů a kovářů v čd a synové 12–13, kteří nepasou.
  - `charcoalCarryDay(state, day, deliveries: readonly CharcoalDelivery[], carts: { charcoal: readonly CharcoalCartJob[] }, resting: ReadonlyMap<number, WorkshopActivity>, restingOnly: boolean): CharcoalCarryDay`.
    - Nahradí `smithFetchPlans` ve stejných dvou fázích dne: odpočívající kovárny před rozdělením práce vsi, ostatní po něm.
  - Podíl práce dvojice v `state.labor`:
    - `activity: 'fetch'`, `target: { kind: 'kiln', id: burnerId, kiln, x, z, from: smithId }`;
    - `ages: [věk uhlíře, věk druhého]`, `pole: partner.kind`;
    - `manDays` = práce dvojice + cesta pro kováře.

- [ ] **Step 1: Failing testy**
  - `polePartner`:
    - uhlíř se syny 15 a 12 → `{ kind: 'burner-son', age: 12 }`; jen se synem 15 → věk 15;
    - bez syna, kovář se synem 13 → `smith-son`; jen kovář → `smith`;
    - syn 12, který `isAway`, se přeskočí; syn 11 nejde.
  - `charcoalCarryDay` pro 120 kg a `walkM` 300 – `manDays` = `120 × basketManDaysPerKg(300, 15)`:
    - se synem uhlíře 13: `burners.get(uhlíř)` = `manDays / 2`, `busy` = `[syn]`, `smiths` prázdné, `fetchWalk` 0;
    - se synem uhlíře 15: `burners` = `manDays`;
    - s kovářem: `burners` = `manDays / 2 + fetchWalkManDays(300)`, `smiths` = `manDays / 2`;
    - vůz odveze všechno → `pairs` prázdné a mapy prázdné;
    - odpočívající kovář se objeví jen ve fázi `restingOnly: true`.
  - `burnerPlans` při práci 1 čd a `walkM` 300 vytahá kg = (1 − cesta pro kováře) ÷ (`DRAW_MAN_DAYS_PER_KG × kilnWalkFactor` + `basketManDaysPerKg(300, 15) × podíl`):
    - podíl ½ se synem 12–13 nebo s kovářem;
    - podíl 1 se synem od 14 let;
    - cesta pro kováře se odečte jen s kovářem nebo jeho synem.
  - Den simulace – ves s uhlířem, jeho synem 12, kovářem a synem kováře 11:
    - syn kováře 11 pase (není v `busy`), syn uhlíře nepase;
    - `state.labor` má podíl `fetch` s `pole: 'burner-son'` a věky;
    - syn 12 téhož dne není měchař.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/domain/village/crafts` → FAIL.
- [ ] **Step 3: Implementace**
  - `workBurner` odečte `burners.get(id)` z práce dílny po vytahání dávky, před ostatní prací u milíře.
  - Kovárna odečte `smiths.get(id)` z práce dílny – dnes to dělá `SmithFetchDay.household`.
  - `busy` jde do `herdingDay` a `smithBellowsToday`.
- [ ] **Step 4:** Testy z kroku 2 projdou.
- [ ] **Step 5: Zlatý otisk.** `smith-golden` (ves bez kováře) se nesmí změnit. Ostatní otisky, které spadnou, přepiš s důvodem. Pak kontroly včetně `npm run test:slow`.
- [ ] **Step 6:** Docs a commit `feat(game): uhlí do kovárny na tyči – uhlíř se synem, nebo s kovářem`.

### Task 4: Modely, ikony a klip tyče (Sonnet, nezávislá – může běžet souběžně s 1–3)

**Files:**

- Modify `tools/blender/crafts.py` (výstup `apps/web/public/models/crafts/`, osy a počátek popiš v hlavičce skriptu):
  - `pristresek-{hrncir,kovar,tesar}.glb`:
    - pultový přístřešek 6 m podél boční stěny × 3,2 m od ní, sloupky na vnější hraně;
    - horní hrana pod okapem domu – změř v `dwellings.py` u `vypleteny` i `srub`;
    - pod přístřeškem obsah dnešní dílny: `kiln` a `potter_wheel` (hrnčíř), `forge`, `anvil` a `bellows` (kovář), `trestle` a rozdělaný vůz (tesař);
    - počátek na ose boční stěny v polovině její délky; přístřešek míří od stěny k −X Blenderu, ve scéně je to +x domu.
  - `pristresek-uhlir.glb` – přístřešek 6 × 2 m nad volnou hromadou bukového dřeva (`log()`), ne vyskládanou hrání.
  - Díly staveniště `pristresek-<model>-posts` (sloupky a vazné trámy) v `construction.glb`.
  - `milir-zemnice.glb` – nízká zemnice ≈ 3 × 3,5 m s drnovou střechou, hřeben ≈ 1,3 m, vchod v −Y.
  - Díl `milir-zemnice-logs` (tři klády u vyhloubené jámy) v `construction-moss.glb`.
- Modify `tools/blender/icons.py` – 8 ikon `apps/web/public/icons/build/{hrncir,kovar,tesar,uhlir}-{vypleteny,srub}.png`, 128 × 128 jako `build/vypleteny.png`: dům z `dwellings.py` a vedle přístřešek, kamera jako ostatní ikony staveb.
- Modify `tools/blender/people.json` (případně `people_from_0ad.py` kvůli novému propu), výstup `apps/web/public/models/people/man.glb`:
  - prop `pole-basket` – tyč 2,6 m z pravého ramene dozadu, proutěná košatina ⌀ 0,6 m s uhlím uprostřed, 0,4 m pod tyčí;
  - klip `carry-pole` – animace nesení na rameni z 0 A.D., props `head` a `pole-basket`;
  - klip `carry-pole-back` – táž animace, jen `head`.
- Modify: `apps/web/public/models/crafts/LICENSES.md`, `apps/web/public/icons/LICENSES.md`, `apps/web/public/models/people/LICENSES.md`.

- [ ] **Step 1:** Spusť skripty příkazy z hlaviček `crafts.py`, `icons.py` a `people_from_0ad.py`.
- [ ] **Step 2: Ověř**
  - `sips -g pixelWidth -g pixelHeight apps/web/public/icons/build/*-vypleteny.png apps/web/public/icons/build/*-srub.png` → všude 128 a 128.
  - V `construction.glb` jsou díly `pristresek-*-posts`, v `construction-moss.glb` díl `milir-zemnice-logs`.
  - `man.glb` má klipy `carry-pole` a `carry-pole-back`, ostatní klipy zůstaly.
  - Podívej se na jednu malou koláž (srub s kovárnou, vypletený dům s hrnčířem, uhlíř, zemnice, dvojice s tyčí).
- [ ] **Step 3:** `npm run format:check` a commit `feat(web): modely nadzemních dílen, zemnice u milíře a tyče s košatinou`.

### Task 5: Nadzemní dílny v rozhraní a ve scéně (Sonnet)

**Files:**

- Modify (nabídka staveb):
  - `apps/web/lib/build-items.ts` – `WORKSHOP_VARIANTS`, `workshop(…)` s `variants`, `check(…, variant)`, `workshopPlacementCost(…, type)`;
  - `apps/web/components/game/hud/BuildGrid.tsx` – rozcestník pro `placement: 'workshop'`, `blockedVariants` z `options[craft].variants`;
  - `apps/web/components/game/village-game/use-build-mode.ts` (rozcestník, přeskočení s jedinou dostupnou variantou, `placement.start({ kind: 'workshop', craft, type })`) a `use-pending-sites.ts` (typ staveniště, `placeWorkshop({ …, type })`).
- Modify (scéna, vše v `apps/web/lib/scene/`):
  - `workshop-layout.ts` (`workshopModelKeys`, `craftSpots` u boční stěny), `craft-yard-layout.ts` (dvůr u bočního přístřešku);
  - `village-renderer.ts` (dům podle typu a přístřešek vedle), `village-renderer-shared.ts` (`siteKind`, `CRAFT_MODEL_KEYS`, `trampledArea`), `village-placement.ts` (náhled s typem z režimu), `village-construction.ts` (stadia);
  - `building-showcase-layout.ts` a `building-showcase.ts`; e2e `apps/web/e2e/village.spec.ts` (ukázka staveb).
- Test:
  - `apps/web/lib/__tests__/build-items.test.ts`;
  - `apps/web/components/game/hud/__tests__/BuildGrid.test.tsx`;
  - `apps/web/lib/scene/__tests__/workshop-layout.test.ts`, `craft-yard-layout.test.ts`, `village-construction.test.ts`, `building-showcase-layout.test.ts`.
- Docs: `docs/code/scene-village.md` – nová sekce „Nadzemní dílny ve scéně (workshops.md – Ve scéně)“; `docs/code/web-ui.md` – rozcestník řemesla

**Interfaces:**

- Consumes:
  - z Úlohy 1: `workshopCost` a `workshopTrees(craft, type)`, `checkWorkshopPlacement(…, type)`, `workshopFootprints(…, type)`, `WORKSHOP_SIDE_M`, `BuildOption.variants.{vypleteny,srub}` a `placeWorkshop` s `type`;
  - z Úlohy 4: modely a ikony.
- Produces:
  - `WORKSHOP_VARIANTS(craft: Craft): readonly (SquaresVariant & { id: BuildableDwellingType })[]`:
    - `{ id: CRAFT_BASE[craft], icon: 'build/<model>', name: 'Polozemnice' }` (u uhlíře `'Zemnice'`);
    - `{ id: 'vypleteny', icon: 'build/<model>-vypleteny', name: 'Vypletená' }`;
    - `{ id: 'srub', icon: 'build/<model>-srub', name: 'Roubená' }`.
  - `workshopModelKeys(craft: Craft, type: DwellingType): { house: ModelKey; side: string | null }`:
    - dnešní typ → `{ house: CRAFT_MODEL[craft], side: null }`;
    - nadzemní typ → `{ house: type, side: 'pristresek-<model>' }`.
  - `craftSpots(…, type)` – u nadzemní dílny jsou místa dnešního přístřešku otočená k boční stěně (+x) a posouvají se s ní (`shapedToWorld`).

- [ ] **Step 1: Failing testy**
  - `BuildGrid` a `build-items`:
    - v roce 700 klik i `KeyG` spustí umisťování kovárny `polozemnice` bez rozcestníku;
    - v roce 760 `KeyG` otevře rozcestník se třemi variantami – roubená zašedlá s „Od roku 800“, popisek „Kovář – Vypletená“;
    - cena u kurzoru vypletené kovárny = `workshopLaborManDays(…, 'vypleteny')` a stromy z plánu s `workshopTrees('smith', 'vypleteny')`.
  - `workshop-layout`:
    - `workshopModelKeys('smith', 'srub')` → `{ house: 'srub', side: 'pristresek-kovar' }`;
    - pro každé řemeslo a oba typy, i s variantou rozměrů, leží místa řemeslníků pod přístřeškem nebo do 1,8 m od něj;
    - zároveň leží mimo dům a uvnitř vyklízené plochy (`DWELLING_CLEARING_M[type]`, `maxX + WORKSHOP_SIDE_M`).
  - `village-construction`:
    - roubená kovárna v polovině podílu domu = stadium srubu v 50 %;
    - po podílu domu přibude díl `pristresek-kovar-posts`, díly existují v GLB;
    - dílny se dál nerozpadají po dílech.
  - `building-showcase-layout`: 8 nadzemních dílen na ukázce bez překryvu.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/__tests__/build-items.test.ts components/game/hud/__tests__/BuildGrid.test.tsx lib/scene/__tests__` → FAIL.
- [ ] **Step 3:** Implementace podle Interfaces a Rozhodnutí 3, 7 a 10.
- [ ] **Step 4:** Testy z kroku 2 projdou.
- [ ] **Step 5:** `npm run test:e2e` – kontroluje i importy Babylonu a ukázku staveb. Na konec jeden malý snímek `/dev/buildings` s nadzemními dílnami pro vizuální kontrolu Martinem.
- [ ] **Step 6:** Docs, kontroly a commit `feat(web): nadzemní dílny v nabídce staveb a ve scéně`.

### Task 6: Zemnice u milíře a nosiči na tyči ve scéně (Sonnet)

**Files:**

- Create: `apps/web/lib/scene/burner-camp-layout.ts` (čisté funkce); test `apps/web/lib/scene/__tests__/burner-camp-layout.test.ts`
- Modify:
  - `apps/web/lib/scene/village-renderer.ts` a `village-renderer-shared.ts` – modely `milir-zemnice*`; zemnice se kreslí jako `kilnPlaces`, `needsRender` jen při změně klíče;
  - `apps/web/lib/scene/villager-plan-crafts.ts` – uhlí na tyči ve `smithFetchFigures`, sedící u zemnice ve `kilnWorkers`;
  - `apps/web/lib/scene/villager-plan-traffic.ts` a `road-traffic.ts` – při pálení vychází proud uhlíře ze zemnice;
  - `apps/web/lib/kiln-view.ts` a panel milíře `KilnBody` – kdo dnes nese uhlí.
- Test: `burner-camp-layout.test.ts`, `apps/web/lib/scene/__tests__/villager-plan.test.ts`, `road-traffic.test.ts`, `apps/web/lib/__tests__/kiln-view.test.ts`
- Docs: `docs/code/scene-village.md` – sekce „Zemnice u milíře a nosiči na tyči“; `docs/code/village-people.md` – klipy `carry-pole` a `carry-pole-back`

**Interfaces:**

- Consumes: `SceneVillage.burnerCamps` (Úloha 2), `LaborShare.pole` s věky (Úloha 3), modely a klipy (Úloha 4).
- Produces:
  - `campLook(camp: SceneBurnerCamp): { part: 'milir-zemnice' | 'milir-zemnice-logs'; sinkM: number; tiltDeg: number }`:
    - rozestavěná (`built < 1`) zemnice je jen díl s kládami;
    - opuštěná sesedá o `sinkM = 0.6 × overgrowth` a střecha se nakloní o `tiltDeg = 12 × overgrowth`.
  - `campsKey(camps: readonly SceneBurnerCamp[]): string`.
  - `POLE_SPACING_M = 2.4`.
  - `poleCarriers(ctx, labor): PlannedVillager[]` pro podíly s `pole`:
    - dvě postavy – uhlíř z dílny uhlíře a druhý muž podle `pole`;
    - obě jdou toutéž trasou kovárna ↔ milíř (`walkRoute`), zadní posunutá o `POLE_SPACING_M` po trase;
    - k milíři jdou `walk`, zpět `carry-pole` a `carry-pole-back`;
    - s `pole` `smith` nebo `smith-son` jde uhlíř napřed sám od milíře ke kovárně (`walk`) a pak teprve dvojice.

- [ ] **Step 1: Failing testy**
  - `campLook`:
    - `built: 0.5` → díl `milir-zemnice-logs`; `built: 1` → `milir-zemnice`;
    - `overgrowth: 0.5` → `sinkM: 0.3`, `tiltDeg: 6`.
  - Nosiči na tyči:
    - podíl s `pole: 'burner-son'` a věky `[40, 12]` → dvě postavy, druhá dětská (věk pod 14);
    - obě na téže trase, 2,4 m od sebe, cestou zpět klipy `carry-pole` a `carry-pole-back`;
    - s `pole: 'smith'` jde uhlíř první úsek sám od milíře ke kovárně.
  - Provoz:
    - uhlíř s pálícím milířem a hotovou zemnicí chodí k milíři od vchodu zemnice, ne od dílny ve vsi;
    - jeden muž domácnosti uhlíře, který u milíře nehlídá, sedí u vchodu zemnice (`sit`).
  - Panel milíře ukáže dnešní dvojici – uhlíř se synem a věk, uhlíř s kovářem, nebo uhlíř se synem kováře – a vůz se sedlákem. Ikony s čísly ve stylu dnešního `KilnBody`.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/scene/__tests__ lib/__tests__/kiln-view.test.ts` → FAIL.
- [ ] **Step 3:** Implementace podle Interfaces a Rozhodnutí 10.
- [ ] **Step 4:** Testy z kroku 2 projdou.
- [ ] **Step 5:** `npm run test:e2e`. Na konec dva malé snímky pro vizuální kontrolu Martinem: zemnice u pálícího milíře a dvojice s tyčí na pěšině.
- [ ] **Step 6:** Docs, kontroly a commit `feat(web): zemnice u milíře a uhlí na tyči ve scéně`.

## Mimo plán (později)

- Výběr zemnice kliknutím a její panel. Zemnice v cizí mapě (`domain/war/seen.ts`) a při nájezdu.
- Noc v herní scéně, kdy uhlíř spí v zemnici – až bude Den a noc i ve hře.
- Přestavba dnešní dílny na nadzemní – dnes se dílna přestaví na týž typ.

## Pořadí a souběh

- Úlohy 1 → 2 → 3 jdou postupně. Sdílejí `rules-crafts.ts`, `crafts.ts`, `charcoal.ts`, `smith-supply.ts` a otisky.
- Úloha 4 může běžet souběžně s 1–3.
- Úloha 5 jde po 1 a 4.
- Úloha 6 jde po 2, 3, 4 a 5 – s Úlohou 5 sdílí `village-renderer.ts` a `villager-plan-crafts.ts`.
- Otázka z Rozhodnutí 11 nic nebrzdí. Úlohy 2 a 3 jdou s výchozím „každý uhlíř“; jiná odpověď znamená jednu podmínku na dvou místech.
