# Hustý les neprůchozí a jemná mřížka pochodu – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vojsko, výpravy, poslové i uprchlíci chodí po jemné mřížce pochodu nejkratší průchozí cestou jako v 0 A.D. Hustý les (vnitřek lesa dál než 10 m od okraje) je neprůchozí kromě zemské stezky a pevné cesty. Vesničané v něm při útěku mizí jako v budově. Hotová zemská stezka pokračuje na sousední mapě k tamní vsi, nebo k velké louce.

**Architecture:**

- **Mřížka pochodu** (`domain/war/march-grid.ts`) zjemní buňku z 10 m na velikost z měření (předpoklad 2 m). Pro hledání zná jen průchozí a neprůchozí:
  - neprůchozí je hustý les (pole lesa > 10 m bez pasek vsi), voda mimo brody, sráz a skály (balvan, výchoz) a stavby s odstupem 1 m;
  - průsek pevné cesty a zemské stezky vede i hustým lesem;
  - tempo buňky (cesta × 1,5, val) platí jen pro chůzi.
- **Hledání** (`march-search.ts`) má rovnoměrnou cenu kroku (JPS, nebo A* – podle měření). Trasu vyhladí přímkami na dohled a rozdělí ji tam, kde se mění tempo (`march-smooth.ts`). `MarchPath` má stejný tvar, jen méně bodů.
- **Útěk** míří k „dveřím lesa“ – průchozí buňce u hustého lesa. Kdo k nim dojde, zmizí.
- **Přechod na sousední mapu** jen tam, kde je okraj průchozí na obou stranách. Rozjeté úseky tažení a výprav se po nasazení jednou přepočtou.
- **Pokračování zemské stezky** (Úloha 4b) se nikam neukládá. Odvodí se z krajiny sousední mapy, výstupů stezek v souhrnech sousedních vsí a branky tamního dvorce. V mřížce je průsekem jako pevná cesta, ve scéně a na minimapě stezkou.

**Tech Stack:** TypeScript 6 (strict), `packages/game` (det-math v `domain/war/**`), Vitest, Next.js 16 + Babylon.js 9 (scéna), Playwright, `tsx` (měření).

**Spec:**

- `docs/design/forest.md` – Hustý les.
- `docs/design/war.md`:
  - Pohyb – Terén, Cíl v neprůchodné buňce;
  - Čísla – „Terén a náklad“, „Mřížka pochodu“;
  - Obránci – postoje a útěk.
- `docs/design/expeditions.md` – Co platí dál z výjezdu (hustý les, šelmy).
- `docs/design/trade.md` – Zemská stezka (Pokračování na sousední mapě).
- Motivace D55: `.superpowers/sdd/2026-11-14-fixes/d49-expedition-path-report.md` – Obavy, „Trasy uvnitř vsi obecně“.
- Mapa kódu:
  - `docs/code/war.md` – Pohyb vojska, Postoje vsi a včasný útěk, Varování (Evakuace v tažení, Průvod uprchlíků), Ve scéně;
  - `docs/code/journey.md` – Objevování, Šelmy;
  - `docs/code/scene.md` – Vymýcený les, Průvod uprchlíků a posel.

## Global Constraints

- **Martin 16. 11. 2026:**
  - „Můžeme ten vnitřek pojmenovat jako "hustý les" a nadále se o něm tak bavit a udělat jej neprůchozím? Vojsko ve středověku reálně chodilo po zemských stezkách právě kvůli neprůchodnosti lesa.“
  - „Vesničané by pak utekli do hustého lesa a zmizeli v něm jako v budově“.
  - Schválení návrhu: „ano“.
  - Pokračování zemské stezky na sousední mapě: „ano“ k návrhu Clauda (trade.md – Zemská stezka).
- **Hustý les** je les dál než **10 m** od okraje: pole lesa `buildForestField` > 10 m – tam scéna začíná kreslit vnitřek lesa (`RAMP_START_M` v `obstacles/forest-trees.ts`).
  - Okraj (pruh 10 m), skupiny stromů a osamělé stromy hustým lesem nejsou.
  - Paseka po klučení hustým lesem přestává být.
- **Neprůchozí:** hustý les, voda mimo brody, skály, stavby. Hustým lesem vede jen zemská stezka a pevná cesta.
  - Trasa je nejkratší průchozí cesta bez zdražování terénu.
  - Po pevné cestě a zemské stezce se jde × 1,5, trasa je ale sama nevyhledává.
- **Dohled:** 50 m na stezce v hustém lese (z lesa i do lesa), jinde 150 m. `WAR.sight` se nemění.
- **Cíl v neprůchodné buňce** – nejbližší dosažitelné místo. „Tam vojsko nedojde.“ jen když skupina nedojde nikam. Pravidlo se nemění.
- **Šelmy** napadnou jen na stezce hustým lesem, nejvýš dva lidi (`JOURNEY.predatorGroupMax` 2). Čísla se nemění.
- **Útěk:** vesničané utečou do hustého lesa a zmizí v něm jako v budově. Vojsko je tam nenajde ani nepronásleduje.
- **Beze změny:** práce vsi v lese (kácení, lov, uhlíř) a vozy – „jen mimo hustý les a přes brody“ plyne z mřížky.
- **Determinismus:**
  - `packages/game` bez `Date.now()`, `new Date()` a `Math.random()`;
  - `domain/war/**` jen det-math (ESLint; `Math.sqrt` smí);
  - stejný vstup dá stejnou mřížku i trasu;
  - tažení a výprava dají týž výsledek vcelku i po kouscích – stávající testy po 1, 7, 40 a 400 taktech musí projít.
- **Zlaté otisky:**
  - Krajina, překážky, kostra světa a ves (`village-golden-long`) se **nesmí změnit**. `domain/landscape`, `world/skeleton` ani simulace vsi se nemění.
  - Otisky tras a čísla v testech války se smí přepsat (před spuštěním 1. 1. 2027 dovoleno) – jen se záměrem a s větou v commitu proč.
- **Stav:** stav vsi se nemění (žádný převod ve `VILLAGE_MIGRATIONS`) a DB nemá migraci. Nové části stavu tažení a výpravy jsou volitelné.
- **Hexagon beze změny.** Čísla jen v `rules*.ts` s odkazem na sekci návrhu.
- **Docs:** česky, „–“, vlastní rozhodnutí jako „návrh Clauda“, Martinova slova s datem.
  - Každá úloha doplní svou sekci v `docs/code/`.
  - Po změně `docs/code` projde `npm run check:docs`.
- **Před commitem** projde `npm run typecheck`, `npm run lint`, `npm run test` a `npm run format:check`.
  - Úlohy 7 a 8 navíc `npm run test:e2e` – sériově; souběžně jen s jiným `E2E_PORT` a `TEST_DATABASE`.
  - Úloha 3 mění modul scény (re-export) – `npm run test:e2e` jednou po ní; běží-li souběžně s Úlohou 2, jednou po sloučení obou v integrační větvi.
  - Úloha 8 navíc `npm run test:slow`.
- **DB `bohemia`** jen pro čtení (Úloha 1). Agent nemigruje.
- **Rozsah:** agent nejvýš ≈ 150 kroků. Zprávy a stav mezi úlohami do `.superpowers/sdd/2026-11-16-dense-forest/`.
- **Commity:** Conventional Commits česky, např. `feat(game): hustý les je neprůchozí`.

## Rozhodnutí plánu (návrh Clauda)

1. **Hustý les z pole lesa, ne z počtu stromů.**
   - `forestInterior` = buňka, v jejímž středu je `field.distanceAt` > `WAR.march.denseForestM` (10 m). Počítá se jednou na krajinu a velikost buňky.
   - Paseky vsi podle pravidla scény (`CLEARED_SHARE` 0,5 pokácených dospělých stromů v políčku, založené díly polí, paseky pod stavbami v lese).
   - Kód `clearedForest` se přesune z `apps/web/lib/scene/cleared-forest.ts` do jádra a scéna ho importuje. Plocha korun a hustý les se tak kryjí.
   - Buňka do 10 m od paseky hustým lesem není – paseka je nový okraj lesa.
   - Nahrazuje `WAR.march.denseForestTrees` a `treeCounts`. `WAR.pace.forest` (¼) zmizí.
2. **Průsek stezky a cesty.**
   - Pás `ROAD_SWATH.halfM` (3,5 m – šířka průseku lesem) kolem osy je průchozí i hustým lesem a jde se po něm × 1,5 (`MARCH_ROAD`). `MARCH_FOREST` na něm zůstává (dohled 50 m, šelmy).
   - Osy:
     - každá pevná cesta vsi (`village.roads.roads`, úseky zemské stezky jsou mezi nimi);
     - vždy i stezka krajiny (`landscapeTrailLines` – prvek `route` prémiové krajiny, jinak úseky `skeletonFeaturesOf(l).route`), i na mapě bez vsi. Závisí jen na krajině – její průsek patří do terénu (paměť na krajinu).
   - Vodu a sráz ruší jen buňky, kterými osa prochází – supercover, tedy souvislé po stranách. Lávka, hať a brod platí jako dnes.
3. **Stavby s odstupem 1 m** (`WAR.march.buildingClearanceM`).
   - Blokuje se buňka se středem do 1 m od obdélníku stavby. Dnes do půl buňky, tj. 5 m, a to zavírá mezery mezi domy (D55).
   - Ohrada, opevnění a brány – kód beze změny (počítá obecně nad `cellM`).
4. **Skály:**
   - sráz nad `PATH_SLOPE_MAX` jako dnes;
   - balvan a výchoz vrstvy překážek s poloměrem jako u pěšin (`OBSTACLE_COST` s `extra: Infinity`) – nový příznak `MARCH_ROCK`;
   - kámen, který ves odstranila, neblokuje.
5. **Rovnoměrná cena hledání.**
   - Krok rovně 1000, úhlopříčně 1414 (tisíciny buňky). Celá čísla mají přesné součty a jisté remízy.
   - Úhlopříčně jen kolem průchodných rohů jako dnes. Start je průchodný vždy.
   - Klíč haldy (`PathHeap`) je `f × 4194304 + (4194303 − g)`: při stejném `f` jde dřív hlubší uzel, jinak rozhoduje pořadí vložení. `g` se pro klíč ořízne na 4194303 – mění to jen pořadí remíz, ne cenu.
   - Algoritmus určí brána: JPS bez řezání rohů, nebo A*.
6. **Vyhlazení na dohled.**
   - Kandidáti jsou body zlomu buněk trasy (kde se mění směr).
   - Dopředný hladový tah: od kotvy co nejdál ke kandidátovi na dohled.
   - `lineOfSight` prochází supercoverem. Prochází-li úsečka přesně rohem, musí být průchodné obě buňky u rohu.
   - První a poslední bod jsou přesně `from` a `to`.
   - Úseky se rozdělí na hranicích změny tempa, takže `marchProgress` je přesný.
   - `meadowM` je součet `quantizedStep(délka ÷ tempo)` po kouscích. Neprůchodná buňka (únik ze startu) má tempo louky 1.
7. **Únik z neprůchodné buňky.**
   - Start v neprůchodné buňce (hustý les ze starého bodu, dorostlý les, stavba, nová palisáda): první úsek vede rovně do středu nejbližší průchodné buňky (`nearestPassable` – čtverec vzdálenosti v buňkách, remíza nižší index), pak běžná trasa.
   - Cíl ve stavbě dál přesune `outOfBuilding`, nejvýš o `BUILDING_REACH_M` = 40 m; jinak cíl posune `reachableGoal` (beze změny).
8. **Přechod okraje.**
   - Úsek k okraji končí jen v okrajové buňce, jejíž protějšek na sousední mapě (`edgeCrossing`) je průchozí. Mřížka sousední mapy přes `gridOf`; mapu `route[0]` načte předem už dnes `missingMaps`. Chybí-li stav vsi sousední mapy, `gridOf` hodí `MissingData` a takt počká jako dnes.
   - Když taková buňka dosažitelná není, skupina stojí (`stuck`). Znovu plánuje až další herní den nebo po novém rozkazu (`stuckDay`), ne neúspěšným hledáním každý takt.
   - Objížďka přes jiné mapy jen podle odpovědi Martina (Otázka na Martina).
9. **Rozjeté úseky.**
   - `MARCH_GRID_VERSION` = 2. Tažení a výprava bez `marchGridVersion` při prvním taktu zahodí všechny úseky (`leg = null` – skupiny, uprchlíci, poslové) a nastaví verzi.
   - Další takt úseky přepočte z uložené polohy (Rozhodnutí 7). Cíl na mapě cíle posune znovu `settleGoal` – volá se před každým krokem skupiny.
10. **Dveře lesa.**
    - `nearestForest` vrátí střed nejbližší průchodné buňky, která v 8 směrech sousedí s neprůchodnou buňkou hustého lesa. Index po přihrádkách, jeden na mřížku (WeakMap).
    - Útěk skupiny vsi (evakuace, „Ukrýt v lese“) bere nejbližší dveře **dosažitelné** ze vsi (`nearestReachableForest`, jedno zaplavení na rozhodnutí).
    - Útěk z boje (bod zlomu) bere nejbližší dveře bez zaplavení. Jako dnes: kdo se nepohne, je pryč.
    - Došlá skupina je `hidden` jako dnes a **nekreslí se nikomu**, ani vlastnímu hráči (jako lidé v budově). Stav skupiny ukazuje panel varování.
    - Ve scéně vsi kdo doběhne k lesu, zmizí.
11. **Les na otepi a žebříky** (`ladders.ts` – `nearestForestOf`) dál bere buňky `MARCH_FOREST`. Ty jsou teď hustý les, tedy o ≈ 10 m dál než dřív – nosí se z lesa, ne z okraje.
12. **Val bez nástavby** je průchozí (`rampartPace` jen zpomalí chůzi). Bez zdražování terénu ho trasa neobchází branou. Plot, palisáda a val s nástavbou zůstávají neprůchodné mimo brány a mezery.
13. **Pokračování zemské stezky na sousední mapě** (Úloha 4b; Martin 16. 11. 2026: „ano“, podrobnosti návrh Clauda).
    - **Nic se neukládá.** Pokračování se odvodí z krajiny a vrstvy překážek sousední mapy, ze vstupů (bodů okraje hotových stezek sousedních vsí) a z branky tamního dvorce. Stav vsi ani DB se nemění (žádný převod, žádná migrace); Vlkov (N, E, S) ho má hned.
    - **Výstup stezky** (`trailExitsOf`):
      - konec osy = konec posledního úseku ve směru stezky;
      - bod okraje = kolmý průmět konce na tu stranu ve směru stezky, ke které má konec nejblíž;
      - úhlopříčná stezka s koncem do 30 m od obou stran vede rohem na úhlopříčnou mapu. 30 m = `EDGE_MARGIN_M` + `TRAIL.edgeBandM` – pásmo, kde stezka končí.
    - **Souhrn vsi nese výstupy** (`VillageDigest.trailExits`). Mapa je čte ze souhrnů vsí na 8 sousedních políčkách jedním dotazem; souhrn bez nich (uložený dřív) → ves se načte celá.
    - **Vstup** = `edgeCrossing(políčko vsi, mapa, bod okraje)`. Platí od dne po dostavění (`builtDay < day`) – takt přepočtený z bodu nevidí pokračování dřív, než stezka stála.
    - **Trasa** – táž síť jako stezka vsi (`trailTerrain`, mimo posvátné duby a háje), jen bez pevných cest a humen tamní vsi, takže se nemění den po dni:
      - k brance dvorce tamní vsi (`trailStart`);
      - bez vsi nebo bez dvorce k místu největší souvislé oblasti mřížky mapy bez vsi (`largestRegion`), které je po síti nejblíž; vstup už v ní → bez pokračování;
      - nedosažitelný cíl → bez pokračování;
      - stezka krajiny (`landscapeTrailLines`) s koncem do 30 m od vstupu → bez pokračování – stezka kostry tam už pokračuje.
    - **Později založená ves** – pokračování se odvodí znovu, k její brance a po její krajině. Sídlo mívá jinou krajinu než prázdné políčko (prémie, odříznutý rod), stará osa by tam neplatila.
    - **Cena a doba stavby stezky beze změny.** Pokračování nemá stavbu, práci ani údržbu a není stezkou tamní vsi – obchod, síť cest ani simulace vsi ho neznají.
    - **Mřížka:** osy pokračování jsou průsekem jako pevná cesta (Rozhodnutí 2). Navíc **kus ke kraji**: hotová stezka vsi s koncem do 30 m od bodu okraje má průsek až k okraji – jinak by stezku zavřel hustý les v pásu u kraje.
    - **Počítá jen server** – trasa stezky není det-math. Prohlížeč dostane osy jako data.
    - **Scéna a minimapa:** upravená cesta s průsekem, stromy v pásu se nekreslí, klikem se nevybírá. Pokračování je veřejné jako krajina – vidí ho tamní hráč i cizí vojsko a výprava na té mapě.

## Rozhodovací brána (po Úloze 1)

Meze (návrh Clauda) platí pro Node 24 na Martinově stroji – medián z 10 běhů po 3 zahřívacích:

| Měřené                                                  | Mez                                                       |
| ------------------------------------------------------- | --------------------------------------------------------- |
| trasa přes celou mapu (okraj → okraj 1,9 km, roh → roh) | medián ≤ 25 ms, nejhorší ≤ 60 ms                          |
| trasa ve vsi (≤ 150 m)                                  | ≤ 2 ms; délka ≤ 1,3 × vzdušná u 20 tras Vlkova (D55)      |
| k okraji mapy (8 směrů)                                 | ≤ 40 ms                                                   |
| `reachableGoal` (zaplavení celé mapy)                   | ≤ 15 ms                                                   |
| terén krajiny (`marchTerrain`, jednou na krajinu)       | ≤ 400 ms                                                  |
| mřížka vsi a dne (`marchGrid` nad hotovým terénem)      | ≤ 40 ms                                                   |
| paměť                                                   | mřížka (`pace` + `flags`) ≤ 6 MB, terén ≤ 2 MB na krajinu |

Pravidla brány:

1. **Velikost buňky** = nejjemnější z 1 m, 2 m a 2,5 m, kde nejlepší algoritmus splní všechny meze. Předpoklad: 2 m – 1 m má mřížku ≈ 22 MB.
2. **Algoritmus:**
   - JPS, když splní meze a na trasách přes mapu je aspoň 3× rychlejší než A*;
   - jinak A* – je jednodušší;
   - JPS+ jen jako odhad z času předvýpočtu a paměti (mřížka se mění každý den), neimplementuje se.
3. **Nesplní-li meze ani 2,5 m:** stop. Koordinátor pošle Martinovi čísla a navrhne hierarchické hledání jako samostatný plán.
4. **Odříznutá ves:** nemá-li některá měřená ves (Vlkov, založené vsi na seedech 1–3) z branky dvorce průchod k žádnému okraji mapy, kudy vede stezka – stop. Otázka Martinovi: pěšiny vsi jako průchod hustým lesem?
5. **Okraje bez přechodu:** podíl dvojic (mapa, strana), kde není přechod průchozí na obou stranách, jde do zprávy jako podklad k Otázce na Martina.

Koordinátor zapíše výsledek do sekce Výsledek brány (velikost buňky, algoritmus, odkaz na zprávu). Úlohy 2 a 4 berou čísla odtud.

**Výsledek brány:** doplní koordinátor po Úloze 1.

## Otázka na Martina (jedna)

> Když hustý les zavře celý okraj mapy a vojsko nebo výprava nemůže na sousední mapu (na žádném místě okraje není průchod na obou stranách), má si samo najít objížďku přes jiné mapy (návrh Clauda), nebo zůstat stát u okraje jako u nedosažitelného cíle?

Do odpovědi platí „zůstat stát“ (Rozhodnutí 8 – nic nového se nepřidá). Objížďka je volitelný krok Úlohy 5.

**Odpověď (Martin 16. 11. 2026):** „Má zůstat stát. Ideální by bylo, kdyby kurzor na místech, kam se nedá dojít, podle toho vypadal.“

- Úloha 5: **žádná objížďka** – volitelný krok odpadá; skupina stojí u okraje jako u nedosažitelného cíle.
- Úloha 7 navíc: **kurzor nad místem, kam vybraná skupina nedojde** (hustý les, voda bez brodu, místo bez spojení s polohou skupiny, okraj mapy bez průchodu), vypadá jinak – jako v 0 A.D. (ikona zákazu). Prohlížeč pozná dosažitelnost z téže jemné mřížky (stejné deterministické funkce jako server) a jejích souvislých oblastí od polohy skupiny; jen vizuální nápověda, rozkaz dál ověří server (Rozhodnutí – Cíl v neprůchodné buňce).

## Review Focus

1. **Ves odříznutá hustým lesem** – dvorec bez průchodu k okraji. Vlastní výprava by nemohla ven a cizí vojsko by stálo u lesa.
   - Úloha 1: kontrola skutečných vsí (pravidlo brány 4).
   - Úloha 4: test „ves v pasece se stezkou je dosažitelná od okraje, bez stezky ne“.
2. **Skupina v neprůchodné buňce nesmí zamrznout** – starý bod v lese, dorostlý les, palisáda postavená pod ní.
   - Úloha 2: test úniku.
   - Úloha 5: test starého bodu s úsekem lesem.
3. **Opakované neúspěšné hledání každý takt** – uvízlá skupina by na jemné mřížce spálila čas workeru (4 takty/s).
   - Úloha 5: s `stuckDay` = dnes `stepMover` mřížku nečte. Svět, který při čtení mapy hodí, nehodí.
4. **Přechod do hustého lesa sousední mapy** by postavil skupinu do neprůchozí buňky.
   - Úloha 5: test přechodu jen do průchozího pruhu.
5. **Útěk bez dosažitelného lesa** (les za řekou bez brodu, mapa bez hustého lesa) musí dát `no-forest` a dnešní náhradu (vzdání při přesile, jinak obrana).
   - Úloha 6: testy dosažitelných dveří a `refugeOptions`.
6. **Pokračování, které souhrn souseda přinese až po taktu** – takt přepočtený z bodu nesmí vidět pokračování ve dnech před dostavěním stezky.
   - Úloha 4b: test dne dostavění (`continuationsOf` v den `builtDay` bez osy, den poté s osou).

---

## Mapa souborů

| Soubor                                                           | Odpovědnost                                                                                       | Úloha |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----- |
| `packages/game/src/domain/war/march-search.ts` (nový)            | hledání s rovnoměrnou cenou (`gridSearch`), zaplavení (`reachableCells`)                          | 2     |
| `packages/game/src/domain/war/march-smooth.ts` (nový)            | dohled po buňkách, vyhlazení, rozdělení podle tempa → `MarchPath`                                 | 2     |
| `packages/game/src/domain/war/march.ts`                          | `marchPath`, `marchPathToEdge`, `reachableGoal`, únik (`nearestPassable`)                         | 2, 5  |
| `packages/game/src/domain/village/core/cleared-forest.ts` (nový) | vymýcený les vsi po políčkách (přesun ze scény) a `villageClearings` ze stavu vsi                 | 3     |
| `packages/game/src/domain/war/dense-forest.ts` (nový)            | vnitřek lesa na mřížce (`forestInterior`) a paseky (`withoutClearings`)                           | 3     |
| `packages/game/src/domain/war/march-grid.ts`                     | terén a mřížka mapy – hustý les, průseky (i pokračování stezek), stavby, skály                    | 4, 4b |
| `packages/game/src/domain/village/trade/trail-exits.ts` (nový)   | výstupy hotových stezek vsi – strana a bod okraje (`trailExitsOf`)                                | 4b    |
| `packages/game/src/domain/war/trail-continuation.ts` (nový)      | vstupy od sousedů a trasa pokračování (`trailEntriesOf`, `trailContinuations`, `continuationsOf`) | 4b    |
| `packages/game/src/application/neighbour-trails.ts` (nový)       | port `TrailExitSource`, osy pokračování mapy pro pohledy (`mapTrailContinuations`)                | 4b    |
| `packages/db/src/adapters/trail-exits.ts` (nový)                 | výstupy stezek vsí na sousedních políčkách ze souhrnů (`createTrailExitSource`)                   | 4b    |
| `packages/game/src/domain/war/movement.ts`                       | přechod okraje, `stuckDay`, `replanLegs`                                                          | 5     |
| `packages/game/src/domain/war/forest-doors.ts` (nový)            | dveře lesa – nejbližší a nejbližší dosažitelné                                                    | 6     |
| `apps/web/lib/scene/villager-plan.ts`, `army-renderer.ts`        | lidé mizí u lesa                                                                                  | 7     |

---

### Task 1: Měření a rozhodovací brána (Opus)

**Files:**

- Create (mimo repo, scratchpad session agenta): `$SCRATCH/dense-forest/measure.ts`, `proto-grid.ts`, `proto-search.ts`.
- Create: `.superpowers/sdd/2026-11-16-dense-forest/measure-report.md` a `measure-raw.json` (mimo git).
- Repo se nemění, nic se necommituje.

**Interfaces:**

- Consumes:
  - `marchGrid` a `march.ts` jako vzor;
  - `buildForestField`, `obstacleChangesAt`, `ROAD_SWATH`, `skeletonFeaturesOf`, `foundVillage`, `generateLandscape`, `obstaclesOf`, `emptyCellLandscape`;
  - `createCampaignCells` (`packages/server/src/campaign-cells.ts`) s adaptéry `@bohemia/db` – jen čtení.
- Produces: zpráva podle šablony ve Step 6 – podklad brány.

- [ ] **Step 1: Mapy**
  - **Vlkov:** z DB `bohemia` (`postgres://postgres@127.0.0.1:5432/bohemia`) jen čtením.
    - Krajina políčka přes `createCampaignCells(...).mapOf(cell)` (sídlo z uloženého seedu, prémie, kostra) – políčko `grid_x`, `grid_y` sídla vsi „Vlkov“.
    - Stav vsi z `VillageRepository`, den = `state.lastDay`.
  - **Seedy 1–3:** `generateLandscape(seed)` + `obstaclesOf` a ves `foundVillage` jako v `apps/worker/scripts/measure-campaigns.ts`.
  - **Tři prázdná sousední políčka Vlkova:** `emptyCellLandscape(WORLD_SEED, cell)` jako v `measure-campaigns.ts`.
  - **Nejlesnatější krajina** ze seedů 1–30 podle podílu políček `SURFACE_CODES.forest`.
- [ ] **Step 2: Prototyp mřížky** `protoGrid(map, cellM)` – kopie `marchTerrain` a `marchGrid` s parametrem `cellM` a s Rozhodnutími 1–4.
  - Paseky stačí podle podílu pokácených stromů v políčku.
  - Pro `cellM` ∈ {1; 2; 2,5} změřit čas terénu, čas mřížky vsi a bajty polí.
- [ ] **Step 3: Prototyp hledání** – A* (`search` z `march.ts` s cenami podle Rozhodnutí 5), JPS bez řezání rohů, zaplavení a vyhlazení (Rozhodnutí 6).
  - Kontrola ve skriptu – měření je platné, jen když obě platí:
    - délka JPS = délka A* na všech trasách;
    - dva běhy dají totožné pole buněk.
- [ ] **Step 4: Trasy na každé mapě:**
  - 3 okraj → okraj Z → V a 3 J → S (odsazení −600, 0, 600 m) a 2 roh → roh;
  - 8 směrů k okraji ze středu vsi (mapa bez vsi ze středu mapy);
  - `reachableGoal` k 10 bodům ze seedu;
  - hledání dveří lesa po celé mapě.
  - Ve Vlkově navíc 20 tras od domova výpravy (`journeyHome` v `application/expedition.ts` – branka dvorce) k bodům na kružnici 40–80 m po 18°. U každé poměr délky ke vzdušné čáře.
- [ ] **Step 5: Souvislost.**
  - Pro každou mapu a stranu: existuje okrajová buňka dosažitelná ze středu vsi (mapy)?
  - Pro sousední dvojice (Vlkov a jeho tři sousedé): existuje přechod průchozí na obou stranách?
  - U každé měřené vsi: je dvorec spojen s každým okrajem, kde končí stezka (`skeletonFeaturesOf(l)?.route.ends`)?
- [ ] **Step 6: Zpráva** `measure-report.md`:
  - tabulka `cellM × algoritmus × měřené` (medián, nejhorší);
  - paměť, souvislost, poměry D55;
  - počet bodů trasy před vyhlazením a po něm;
  - doporučení podle pravidel brány 1–5 s jednou větou proč.
  - Příkaz: `npx tsx $SCRATCH/dense-forest/measure.ts --out .superpowers/sdd/2026-11-16-dense-forest/measure-raw.json`.
  - Expected: zpráva má všechny řádky tabulky brány pro tři velikosti buňky.

---

### Task 2: Hledání s rovnoměrnou cenou, vyhlazení a únik (Opus)

Mřížka zůstává 10 m; mění se jen hledání a tvar trasy. Les je tu ještě průchozí (tempo ¼ platí jen pro chůzi).

**Files:**

- Create: `packages/game/src/domain/war/march-search.ts`, `packages/game/src/domain/war/march-smooth.ts`.
- Modify:
  - `packages/game/src/domain/war/march.ts` – `search` a `pathOf` nahradí `gridSearch` + `smoothCells` + `pathAlong`; `outOfBuilding` použije `nearestPassable`; `BUILDING_REACH` → `BUILDING_REACH_M` = 40;
  - `packages/game/src/domain/war/index.ts` – exporty.
- Test:
  - Create `packages/game/src/domain/war/__tests__/march-search.test.ts`, `march-smooth.test.ts`.
  - Modify `march.test.ts` (GOLDEN, test lesa, D49) a testy války s čísly poloh, které se změnou geometrie trasy rozbijí.
- Docs: `docs/code/war.md` – Pohyb vojska – Trasa, Cíl v neprůchodné buňce.

**Interfaces:**

- Produces (`march-search.ts`):
  - `STEP_STRAIGHT = 1000`, `STEP_DIAGONAL = 1414`;
  - `octileCost(di: number, dj: number): number` – `1000 × (max − min) + 1414 × min` absolutních hodnot;
  - `gridSearch(grid: MarchGrid, start: number, goal: (c: number) => boolean, toward: (i: number, j: number) => number): number[] | null`:
    - souvislý řetěz buněk (8 sousedů) ze `start` do první buňky s `goal`;
    - `toward` = celočíselný odhad v tisícinách buňky;
    - průchodná je buňka s `pace > 0`, start vždy;
  - `reachableCells(grid: MarchGrid, start: number): Uint8Array` – přesun z `march.ts`, stejná pravidla.
- Produces (`march-smooth.ts`):
  - `lineOfSight(grid: MarchGrid, a: Pos, b: Pos): boolean`;
  - `smoothCells(grid: MarchGrid, cells: readonly number[], from: Pos, to: Pos): Pos[]`;
  - `pathAlong(grid: MarchGrid, points: readonly Pos[]): MarchPath`.
- Produces (`march.ts`):
  - `nearestPassable(grid: MarchGrid, c: number, maxM: number): number` – c je-li průchodná; −1 nic do `maxM`;
  - `marchPath`, `marchPathToEdge`, `reachableGoal`, `marchProgress`, `marchSeconds` – podpisy beze změny;
  - start neprůchodný → únik (Rozhodnutí 7) – i v `reachableGoal`.

- [ ] **Step 1: Failing testy `march-search.test.ts`.** Pomocník `openGrid(w, h, cellM)` vrátí `MarchGrid` s `pace` 1 a `flags` 0.
  - otevřená 10 × 10: z buňky 0 do 99 → 10 buněk, součet cen 9 × 1414;
  - 2 × 2 s neprůchodnými (1,0) a (0,1): ze 0 do 3 → `null` (roh se neřeže);
  - start s `pace` 0, sousedé volní → trasa existuje;
  - nedosažitelný cíl → `null`;
  - stejné volání dvakrát → `toEqual`;
  - jen při JPS z brány: 200 mřížek 64 × 64 (`createRandom(deriveSeed(7, 'march'))`, 30 % neprůchodných, náhodný start a cíl) → součet cen kroků `gridSearch` = cena referenčního Dijkstry v testu; obě `null` současně.
- [ ] **Step 2: Failing testy `march-smooth.test.ts`:**
  - `lineOfSight`: volno → true; přes neprůchodnou buňku → false; přesně rohem mezi dvěma úhlopříčně neprůchodnými buňkami → false;
  - `smoothCells` na otevřené 50 × 50 (buňka 1 m) z (0; 0) do (40; 17) → `[from, to]`;
  - překážka tvaru L:
    - ≥ 3 body;
    - každý úsek má `lineOfSight` true;
    - délka ≤ délka řetězu buněk;
  - `pathAlong` – rovný úsek 40 m přes pás tempa 1,5 široký 10 m:
    - 4 body (start, vstup do pásu, výstup, cíl);
    - poslední `meadowM` = 30 + 10 ÷ 1,5 (± 2 ÷ 1024);
    - `marchProgress(path, meadow ÷ 2)` leží na úsečce.
- [ ] **Step 3: Spustit – FAIL.** `npx vitest run packages/game/src/domain/war/__tests__/march-search.test.ts packages/game/src/domain/war/__tests__/march-smooth.test.ts` (z kořene) → FAIL, funkce neexistují.
- [ ] **Step 4: `march-search.ts`** – algoritmus z brány, ceny a klíč haldy podle Rozhodnutí 5.
  - JPS: body skoku rozvinout na souvislý řetěz buněk.
  - `PathHeap` se použije beze změny.
- [ ] **Step 5: `march-smooth.ts`** podle Rozhodnutí 6.
  - Dohled: Amanatides–Woo s pravidlem rohu.
  - `pathAlong` prochází týmž průchodem a vkládá bod na hranici, kde se mění `pace`.
- [ ] **Step 6: Přepojit `march.ts`.**
  - `marchPath` a `marchPathToEdge` skládají `gridSearch` → `smoothCells` → `pathAlong`.
  - `reachableGoal` volá `reachableCells` z `march-search.ts`.
  - Únik ze startu podle Rozhodnutí 7: body `[from, střed únikové buňky, …]`, první úsek se nevyhlazuje.
- [ ] **Step 7: Testy `march.test.ts`:**
  - nový „únik z neprůchodné buňky“ – blok 30 × 30 m kolem startu:
    - `points[0]` = `from`;
    - `points[1]` = střed nejbližší průchodné buňky;
    - další úseky `lineOfSight`;
  - „hustým lesem čtyřikrát déle“ → „trasa les neobchází, chůze lesem ¼“;
  - D49 testy přepsat na nový tvar trasy;
  - GOLDEN přepsat.
- [ ] **Step 8: Celé testy.** `npm run test` → opravit čísla poloh a taktů v testech války, které se změnily jen geometrií trasy. Každý soubor jednou větou v commitu. Změnu chování opravit v kódu.
- [ ] **Step 9: Ověření a commit.** Spustit `npm run typecheck && npm run lint && npm run format:check && npm run check:docs` – vše projde. Pak `git add -A packages/game docs/code/war.md && git commit -m "feat(game): trasa pochodu s rovnoměrnou cenou a vyhlazením"`.

---

### Task 3: Hustý les v jádru – vymýcený les a vnitřek lesa (Sonnet)

Smí běžet souběžně s Úlohou 2 – jiné soubory.

**Files:**

- Create: `packages/game/src/domain/village/core/cleared-forest.ts`.
  - Přesun ze scény bez změny chování: `CLEARED_SHARE`, `ClearedForest`, `treesPerTile`, `tileOf`, `clearedForest`, `touchesForest`.
  - Nově `villageClearings`.
- Modify: `apps/web/lib/scene/cleared-forest.ts`.
  - Přesunuté názvy importuje z `@bohemia/game` a dál je re-exportuje – importy v `Minimap.tsx`, `minimap.ts`, `forest-canopy.ts`, `landscape-scene.ts` se nemění.
  - `villageClearedForest`, `clearedAreasKey`, `sameClearing`, `clearingDistance` zůstávají ve scéně.
- Create: `packages/game/src/domain/war/dense-forest.ts`.
- Modify:
  - `packages/game/src/domain/war/march-grid.ts` – `export type MarchGeometry = Pick<MarchGrid, 'width' | 'height' | 'originX' | 'originZ' | 'cellM'>`;
  - `rules-war.ts` – `WAR.march.denseForestM: 10` s odkazem forest.md – Hustý les;
  - exporty `index.ts`.
- Test:
  - Create `packages/game/src/domain/village/core/__tests__/cleared-forest.test.ts` – případy `clearedForest` přesunuté z webového testu a nové `villageClearings`;
  - Modify `apps/web/lib/scene/__tests__/cleared-forest.test.ts` – zůstanou případy scény;
  - Create `packages/game/src/domain/war/__tests__/dense-forest.test.ts`.
- Docs:
  - `docs/code/village-core.md` – krátká sekce „Vymýcený les (jádro)“;
  - `docs/code/scene.md` – Vymýcený les (výpočet v jádru);
  - `docs/code/landscape.md` – u pole lesa: hustý les pro pochod > 10 m.

**Interfaces:**

- Produces:
  - `clearedForest(l: Landscape, layer: ObstacleLayer, changes: ObstacleChanges, clearedSquares?: readonly TileCell[], areas?: readonly (readonly Point[])[]): ClearedForest` – bit po bitu jako dnes ve scéně.
  - `villageClearings(l: Landscape, layer: ObstacleLayer, village: VillageState, day: number): ClearedForest`:
    - změny = `obstacleChangesAt(village, day)`;
    - políčka = díly polí ve stavu jiném než `founding`; natočené díly jen přes podíl pokácených stromů;
    - plochy:
      - `forestClearingsOf` obydlí bez pozemku (typ, poloha, `craft`, `plainShape`) a posvátných staveb;
      - `kilnCircle(k, MILIR.footprintM / 2 + KILN_SITE.clearAroundM)` milířů a pozůstatků.
    - Tatáž pole jako `villageClearedForest`, jen čtená ze `VillageState` – mapování je v `apps/web/lib/village-view.ts`.
  - `forestInterior(l: Landscape, geo: MarchGeometry): Uint8Array`:
    - 1 = `buildForestField(l, { remember: false }).distanceAt(střed)` > `WAR.march.denseForestM`;
    - paměť `WeakMap<Landscape, Map<cellM, Uint8Array>>`.
  - `withoutClearings(interior: Uint8Array, geo: MarchGeometry, cleared: ClearedForest): Uint8Array`:
    - bez vymýcených políček a ploch vrátí tentýž objekt;
    - jinak kopii, kde má 0 každá buňka se středem do `denseForestM` od vymýceného políčka (čtverec) nebo plochy (mnohoúhelník);
    - postup: rasterizace pasek na buňky, pak razítko kruhu celočíselnými posuny `dx² + dy² ≤ r²`, kde `r = denseForestM ÷ cellM`; jen celočíselná matematika.

- [ ] **Step 1: Failing testy:**
  - jádro: přesunuté případy `clearedForest` beze změny očekávání;
  - `villageClearings`:
    - ves s ≥ 50 % pokácených dospělých stromů políčka lesa → políčko v `tiles`;
    - ves s milířem → jedna plocha v `areas`;
  - `dense-forest`:
    - na `generateLandscape(1)` pro `cellM` 10 a 2 má každá buňka s 1 `distanceAt(střed)` > 10 a každá s 0 ≤ 10;
    - druhé volání pro tutéž krajinu a `cellM` → tentýž objekt;
    - `withoutClearings` na syntetické geometrii 100 × 100 buněk po 2 m, celé 1, jedno vymýcené políčko 15 m:
      - buňky do 10 m od políčka = 0, ve 10,5 m = 1;
      - bez pasek → `toBe(interior)`.
- [ ] **Step 2: Spustit – FAIL** (moduly neexistují).
- [ ] **Step 3: Implementace** – přesun, `villageClearings`, `forestInterior`, `withoutClearings`.
- [ ] **Step 4: Spustit – PASS:** testy jádra i webový `cleared-forest.test.ts` a `minimap.test.ts` beze změny očekávání.
- [ ] **Step 5: Ověření a commit.** `npm run typecheck && npm run lint && npm run test && npm run format:check && npm run check:docs` – vše projde; `npm run test:e2e` podle Global Constraints (modul scény). Pak `git commit -m "feat(game): vymýcený les a vnitřek lesa v jádru"`.

---

### Task 4: Jemná mřížka – hustý les neprůchozí, průseky, stavby a skály (Opus)

Navazuje na Úlohy 2 a 3. Velikost buňky z brány.

**Files:**

- Modify: `packages/game/src/domain/war/march-grid.ts`.
  - Terén: `BASE_WOODLAND` nahradí `forestInterior`; zmizí `treeCounts` a `treesAround`.
  - Mřížka:
    - hustý les neprůchozí (`withoutClearings(…, villageClearings(…))` – jen s vrstvou překážek a vsí; bez vrstvy celý vnitřek krajiny);
    - průseky (Rozhodnutí 2), odstup staveb (Rozhodnutí 3), skály (Rozhodnutí 4).
  - Přesáhne-li soubor ≈ 600 řádků, terén a skály do nového `march-terrain.ts`.
- Modify: `rules-war.ts`.
  - `WAR.march = { cellM: <brána>, denseForestM: 10, fordShallow: 0.55, buildingClearanceM: 1 }`.
  - Bez `denseForestTrees`; `WAR.pace` bez `forest`.
  - Komentář odkazuje na war.md – Čísla (Mřížka pochodu) a forest.md – Hustý les.
- Modify: `packages/game/src/domain/village/trade/premium-route.ts` – `export function landscapeTrailLines(l: Landscape): RoadPoint[][]`. Tytéž zdroje jako `routeBranches` bez dělení u vsi; `routeBranches` ji použije.
- Modify: `packages/game/src/domain/village/paths/terrain.ts` – `export function obstacleBlockRadiusM(kind: ObstacleKind, scale: number): number | null`. Vrací `radius × scale` druhů s `extra: Infinity`, jinak `null`; vnitřní použití beze změny.
- Test:
  - Create `packages/game/src/domain/war/__tests__/march-forest.test.ts`.
  - Modify `march.test.ts` (GOLDEN, brod, okraj ± (960 − `cellM` ÷ 2)).
  - Další testy rozbité velikostí buňky:
    - `domain/war/__tests__`: `alarm-sight`, `breach`, `gate-battle`, `journey`, `nearest-forest`, `refuge-choice`, `scene-view`, `world-route`;
    - `application/__tests__/cell-landscape.test.ts`;
    - `village/fortification/__tests__/moat.test.ts`, `rampart-addition.test.ts`;
    - `apps/web/lib/scene/__tests__/army.test.ts`, `apps/web/lib/__tests__/scene-routes.test.ts`, `apps/web/app/dev/landscape/__tests__/dev-battle-walls.test.ts`.
- Docs:
  - `docs/code/war.md` – Pohyb vojska: Mřížka, Tempo (bez „hustým lesem čtyřikrát déle“), Testy;
  - `docs/code/landscape.md` – pole lesa a hustý les;
  - `docs/code/village-roads.md` – Průsek lesem: je i průchodem vojska hustým lesem.

**Interfaces:**

- Consumes: Úloha 2 (`gridSearch`, `nearestPassable`), Úloha 3 (`forestInterior`, `withoutClearings`, `villageClearings`, `MarchGeometry`).
- Produces – `marchGrid(landscape, obstacles, village, options)` má stejný podpis, příznaky znamenají:
  - `MARCH_FOREST` = buňka hustého lesa; bez `MARCH_ROAD` neprůchodná (`pace` 0);
  - `MARCH_ROAD` = průsek pevné cesty nebo stezky (× 1,5, průchodný i lesem);
  - nový `export const MARCH_ROCK = 512` (balvan, výchoz; `pace` 0);
  - `grid.cellM === WAR.march.cellM`.

- [ ] **Step 1: Failing testy `march-forest.test.ts`:**
  - **Hustý les:** na krajině seedu s lesem má buňka s `forestInterior` 1 `pace` 0 a `MARCH_FOREST`. Buňka s `distanceAt` 5 m má `pace` 1 bez `MARCH_FOREST`.
  - **Stezka hustým lesem:** syntetická ves (přípravky `village()` z `march.test.ts`) s osou cesty napříč vnitřkem lesa:
    - `marchPath` z jedné strany na druhou existuje;
    - všechny buňky trasy `pace > 0`;
    - buňky pod osou mají `MARCH_FOREST | MARCH_ROAD`;
    - bez cesty `reachableGoal` posune cíl na tutéž stranu lesa.
  - **Stezka krajiny bez vsi:** krajina se `skeletonFeaturesOf(l)?.route` (první vhodný seed 1–20, nebo `emptyCellLandscape` políčka se stezkou):
    - `marchGrid(l, obstaclesOf(l), null)` má `MARCH_ROAD` pod `landscapeTrailLines(l)`;
    - trasa mezi dvěma body `route.ends` existuje.
  - **Ves v pasece:** dvorec ve vymýcené pasece uprostřed vnitřku lesa (Review Focus 1):
    - s cestou k okraji mapy: `marchPath` od okraje k brance existuje;
    - bez cesty: `reachableGoal` z okraje vrátí bod mimo pasek.
  - **Paseka vsi hustým lesem není** (přepis testu z `march.test.ts`): ≥ 50 % pokácených stromů políčka → buňky políčka a do 10 m od něj bez `MARCH_FOREST`, `pace` 1.
  - **Mezera mezi domy (D55):** dvě obydlí 4 m od sebe → trasa napříč řadou ≤ 1,15 × vzdušná a vede mezerou.
  - **Skály:**
    - balvan ve vrstvě (přípravek vrstvy) → buňky v poloměru `pace` 0 a `MARCH_ROCK`;
    - po `clearedObstacles` téhož id průchodné.
  - **Determinismus:** dvě stavby mřížky z téhož vstupu → shodné `pace` i `flags`.
- [ ] **Step 2: Spustit – FAIL** (`npx vitest run packages/game/src/domain/war/__tests__/march-forest.test.ts`).
- [ ] **Step 3: Implementace podle Rozhodnutí 1–4.**
  - Pořadí v `marchGrid`:
    1. terén;
    2. hustý les;
    3. skály;
    4. průseky – vodu a sráz ruší jen buňky osy;
    5. stavby;
    6. opevnění – beze změny.
  - Terén nad mezí z brány (400 ms): voda se počítá jen v buňkách, které hrubé předběžné síto 10 m nevyloučí. Test „terén se sítem = terén bez síta“ na seedech 1–3.
- [ ] **Step 4: Spustit – PASS.**
- [ ] **Step 5: GOLDEN a rozbité testy.**
  - Přepsat GOLDEN v `march.test.ts`. Brodů přibude zhruba s `(10 ÷ cellM)²`.
  - Opravit testy ze seznamu Files: čísla z velikosti buňky se přepíšou. Kde test hlídá chování (les ¼, hustý les podle stromů), nahradit ho chováním nového pravidla.
  - `grep -rn "pace.forest\|denseForestTrees" packages apps` → nic.
- [ ] **Step 6: Ověření a commit.** `npm run typecheck && npm run lint && npm run test && npm run format:check && npm run check:docs` – vše projde. Pak `git commit -m "feat(game): hustý les neprůchozí na jemné mřížce pochodu"`.

---

### Task 4b: Zemská stezka pokračuje na sousední mapě (Opus; scéna Sonnet)

Navazuje na Úlohu 4 (průseky), před Úlohou 5 (přechod okraje). Podle Rozhodnutí 13. Kroky 1–9 (jádro, svět, server) dělá jeden agent (Opus); kroky 10–12 (scéna) po commitu Kroku 9 nový agent (Sonnet).

**Files:**

- Create:
  - `packages/game/src/domain/village/trade/trail-exits.ts` – jen det-math (počítá ho i mřížka v prohlížeči); přidat do seznamu det-math souborů v `eslint.config.mjs`;
  - `packages/game/src/domain/war/trail-continuation.ts` – v hlavičce: počítá jen server, prohlížeč dostane osy jako data;
  - `packages/game/src/application/neighbour-trails.ts`;
  - `packages/db/src/adapters/trail-exits.ts`.
- Modify – jádro a svět (Kroky 1–9):
  - `packages/game/src/domain/village/trade/trail.ts` – vyexportovat `nearestPassable`, `walkAll`, `sacredMask`, `traceRoute` beze změny chování;
  - `packages/game/src/domain/village/core/digest.ts` – `trailExits`;
  - `packages/game/src/domain/war/march-search.ts` – `largestRegion`;
  - `packages/game/src/domain/war/march-grid.ts` – `MarchGridOptions.trailContinuations`, kus ke kraji, `MarchGridMemo.gridOf`;
  - `packages/game/src/domain/war/campaign-types.ts` – `CampaignMap.trailEntries`;
  - `packages/game/src/domain/war/campaign-tick.ts` – `gridOf`;
  - `packages/game/src/application/campaign-view.ts` (`mapGrid`) a `expedition.ts` (`gridOn`);
  - exporty `index.ts` (village, war, application);
  - `packages/server/src/campaign-cells.ts`; skládání v `apps/web/lib/campaign.ts` a `apps/worker/src/main.ts`.
- Modify – scéna (Kroky 10–12):
  - `apps/web/lib/trail-view.ts`, `village-view-scene-types.ts`, `village-view-scene.ts` (a jeho serverový volající), `foreign-map.ts`, `journey.ts`, `minimap.ts`;
  - `apps/web/lib/scene/path-renderer.ts`, `swath-bands.ts`, `village-picking.ts`, `selection-highlight.ts`;
  - `apps/web/components/game/ForeignWarScene.tsx`, `ForeignJourneyScene.tsx`.
- Test:
  - Create `packages/game/src/domain/village/trade/__tests__/trail-exits.test.ts`, `packages/game/src/domain/war/__tests__/trail-continuation.test.ts`, `packages/db/src/adapters/__tests__/trail-exits.db.test.ts`.
  - Modify `march-search.test.ts` (Úloha 2), `march-forest.test.ts` (Úloha 4), `packages/game/src/domain/village/core/__tests__/digest.test.ts`, `packages/server/src/__tests__/campaign-cells.test.ts`, `apps/web/lib/__tests__/trail-view.test.ts`, `apps/web/lib/__tests__/minimap.test.ts`.
- Docs:
  - `docs/code/village-trade.md` – Zemská stezka: odstavec „Pokračování na sousední mapě“;
  - `docs/code/village-roads.md` – Průsek lesem: pokračování a kus ke kraji (mřížka; scéna bez stromů v pásu);
  - `docs/code/landscape.md` – pokračování není vrstva krajiny ani kostry, otisky beze změny;
  - `docs/code/war.md` – Pohyb vojska – Mřížka: osy pokračování, `trailEntries`.

**Interfaces:**

- Consumes:
  - Úloha 4: průsek os v `marchGrid` (Rozhodnutí 2), `landscapeTrailLines`, `MARCH_ROAD`, `MARCH_FOREST`;
  - Úloha 2: `reachableCells`, `marchPath`, `reachableGoal`;
  - stávající: `trailTerrain`, `trailStart`, `villageManor`, `edgeCrossing`, `GRID_STEPS`, `DIRECTION_VECTORS`, `DIRECTIONS`, `TRAIL`, `EDGE_MARGIN_M`, `ROAD_SWATH`, `marchCellAt`, `villageDigest`, `isCurrentDigest`.
- Produces – jádro:
  - `interface TrailExit { direction: Direction8; end: RoadPoint; edge: RoadPoint; builtDay: number }` – `direction` = krok k sousednímu políčku (`GRID_STEPS`), `end` = konec osy, `edge` = bod okraje této mapy (strana ±960 m);
  - `trailExitsOf(state: Pick<VillageState, 'trails' | 'roads'>): TrailExit[]` – jen hotové stezky, v pořadí `trails`;
  - `VillageDigest.trailExits?: TrailExit[]` – chybí = souhrn uložený před Úlohou 4b; `VILLAGE_DIGEST_VERSION` zůstává;
  - `interface TrailEntry { point: RoadPoint; builtDay: number }`; `CampaignMap.trailEntries?: readonly TrailEntry[]` (chybí = žádné);
  - `trailEntriesOf(cell: GridCell, neighbours: readonly { cell: GridCell; exits: readonly TrailExit[] }[]): TrailEntry[]` – výstupy, jejichž `GRID_STEPS[direction]` vede na `cell`; pořadí podle políčka souseda (y, pak x), pak výstupů;
  - `largestRegion(grid: MarchGrid): Uint8Array` – 1 = buňka největší souvislé průchodné oblasti (8 sousedů, roh jako `gridSearch`); remíza – oblast s nižším indexem buňky;
  - `NO_CONTINUATIONS: readonly (readonly RoadPoint[])[]` – prázdné, zmrazené;
  - `trailContinuations(landscape: Landscape, obstacles: ObstacleLayer | null, entries: readonly RoadPoint[], gate: RoadPoint | null): readonly (readonly RoadPoint[])[]` – pro tentýž vstup tentýž objekt (`WeakMap<Landscape, …>`, mez jako `routeCache` v `trail.ts`);
  - `continuationsOf(map: Pick<CampaignMap, 'landscape' | 'obstacles' | 'trailEntries'>, village: VillageState | null, day: number): readonly (readonly RoadPoint[])[]` – vstupy s `builtDay < day`; branka `trailStart(map.landscape, villageManor(village))`, bez dvorce null; bez vstupů `NO_CONTINUATIONS`;
  - `MarchGridOptions.trailContinuations?: readonly (readonly RoadPoint[])[]`; `MarchGridMemo.gridOf(landscape, obstacles, village, day, continuations = NO_CONTINUATIONS)`.
- Produces – svět a pohledy:
  - port `interface TrailExitSource { trailExitsAround(cell: GridCell): Promise<NeighbourTrailExits[]> }` a `interface NeighbourTrailExits { villageId: string; version: number; cell: GridCell; exits: TrailExit[] | null }` – vsi aktivních sídel na 8 sousedních políčkách; `exits` null = souhrn bez `trailExits`;
  - `createTrailExitSource(db: Database): TrailExitSource`;
  - `createCampaignCells` – `villages: Pick<VillageRepository, 'stampsOf' | 'find'>` a volitelné `trailExits?: TrailExitSource`; `mapOf` vrací `trailEntries`;
  - `mapTrailContinuations(deps: { cells: CampaignCells; villages: Pick<VillageRepository, 'find'> }, cell: GridCell, day: number, state?: VillageState | null): Promise<readonly (readonly RoadPoint[])[]>`;
  - web: `ForeignMap.trailContinuations?: RoadPoint[][]`, `SceneVillage.trailContinuations?: SceneRoad[]`, `sceneTrailContinuations(axes: readonly (readonly RoadPoint[])[]): SceneRoad[]`.
- Pro další úlohy:
  - Úloha 5: `gridOf` a `mapGrid` skládají mřížku s pokračováním – filtr příchodu ho vidí bez změny;
  - Úloha 7: kurzor předá prohlížečové mřížce osy z pohledů jako `trailContinuations`.

- [ ] **Step 1: Failing testy výstupů.**
  - `trail-exits.test.ts` (stav se stezkou a cestami jako přípravky `trail.test.ts`):
    - stezka N, `builtDay` 5, poslední úsek (100; 800) → (120; 935) → `[{ direction: 'N', end: { x: 120, z: 935 }, edge: { x: 120, z: 960 }, builtDay: 5 }]`; úsek s obráceným pořadím bodů → totéž;
    - `builtDay` null → `[]`; poslední úsek se zmizelou cestou → konec dá předchozí úsek;
    - NE s koncem (300; 940) → `N`, okraj (300; 960); (945; 942) → `NE`, okraj (960; 960); (950; 700) → `E`, okraj (960; 700);
    - S s koncem (−50; −880), mezera 80 m → `S`, okraj (−50; −960).
  - `digest.test.ts`: `villageDigest(stav se stezkou).trailExits` `toEqual(trailExitsOf(stav))`; ves bez stezek → `[]`.
- [ ] **Step 2: Failing testy oblasti a pokračování.**
  - `march-search.test.ts` – `largestRegion`:
    - mřížka 10 × 10 se zdí ve sloupci 3 → 1 právě v 60 buňkách vpravo od zdi;
    - dvě oblasti po 4 buňkách → 1 v oblasti s buňkou 0;
    - dvě oblasti spojené jen rohem mezi dvěma neprůchodnými buňkami → dvě oblasti.
  - `trail-continuation.test.ts`:
    - **Vstupy:**
      - soused (0; 0) s výstupem E, okraj (960; 120), `builtDay` 3 → na mapě (1; 0) `[{ point: { x: −EDGE_M, z: 120 }, builtDay: 3 }]`, `EDGE_M` = 960 − `WAR.march.cellM` ÷ 2;
      - výstup N téhož souseda na (1; 0) nevede;
      - výstup NE s okrajem (960; 960) → na (1; 1) bod (−EDGE_M; −EDGE_M);
      - sousedé v obráceném pořadí → `toEqual`.
    - **Krajina testu:** první seed 1–20 s buňkou hustého lesa (`forestInterior`) na západním okraji; vstup = střed nejdelšího souvislého úseku hustého lesa na západním okraji.
    - **K louce:** `gate` null → osa začíná přesně ve vstupu, poslední bod leží v buňce `largestRegion(marchGrid(l, obstaclesOf(l), null))`; vstup uvnitř oblasti → `[]`.
    - **Stezka krajiny:** vstup do 30 m od konce `landscapeTrailLines(l)` (krajina se stezkou kostry z testu Úlohy 4) → `[]`.
    - **Paměť a determinismus:** totéž volání dvakrát → `toBe`; krajina vygenerovaná ze seedu znovu → `toEqual`.
    - **Den dostavění (Review Focus 6):** `continuationsOf` s `trailEntries: [{ point: vstup, builtDay: 10 }]` → den 10 `toBe(NO_CONTINUATIONS)`, den 11 jedna osa.
    - **Branka vsi:** ves s dvorcem z přípravků `trail.test.ts` (jejich krajina, vstup na západním okraji) → osa `continuationsOf` končí do jedné buňky terénu stezky (`trailTerrain(l, o).cellM`) od `trailStart(l, villageManor(ves))`; táž ves bez dvorce → poslední bod v `largestRegion`.
- [ ] **Step 3: Failing testy mřížky** (`march-forest.test.ts`):
  - **Pokračování průchozí:** osa „K louce“ z Kroku 2 → `marchGrid(l, o, null, { trailContinuations: [osa] })`:
    - buňky pod osou `MARCH_ROAD` a `pace > 0`, v hustém lese `MARCH_FOREST | MARCH_ROAD`;
    - `marchPath` ze vstupu na konec osy existuje;
    - bez osy `reachableGoal` ze vstupu na konec osy cíl posune.
  - **Kus ke kraji:** syntetická ves (přípravky `village()` z `march.test.ts`) na krajině testu, hotová stezka W s koncem 25 m od západního kraje v hustém lese → buňky úsečky konec → okraj `MARCH_ROAD`, `pace > 0`. Konec 80 m od kraje, nebo stezka ve stavbě → bez kusu (buňky hustého lesa `pace` 0).
  - **Paměť:** `MarchGridMemo.gridOf` dvakrát se stejným polem os → `toBe`; s `NO_CONTINUATIONS` jiný objekt.
  - **Přechod u konce stezky** (rozhraní Úlohy 5): svět tažení – mapa (0; 0) rovná (`campaign-fixtures.ts`) s vsí, jejíž hotová stezka E končí v (935; z vstupu); mapa (1; 0) = krajina testu s `trailEntries` z `trailEntriesOf` → `gridOf({ x: 1, y: 0 }, den, ctx)` má buňku bodu `edgeCrossing((0; 0), (1; 0), výstup.edge)` průchozí; bez `trailEntries` má `pace` 0.
- [ ] **Step 4: Spustit – FAIL.** `npx vitest run packages/game/src/domain/village/trade/__tests__/trail-exits.test.ts packages/game/src/domain/village/core/__tests__/digest.test.ts packages/game/src/domain/war/__tests__/march-search.test.ts packages/game/src/domain/war/__tests__/trail-continuation.test.ts packages/game/src/domain/war/__tests__/march-forest.test.ts` (z kořene) → FAIL, funkce neexistují.
- [ ] **Step 5: Implementace jádra** podle Rozhodnutí 13.
  - `trailExitsOf`:
    - konec osy = ten konec cesty posledního úseku s existující cestou, který má větší `x·v.x + z·v.z` (`v` = `DIRECTION_VECTORS[direction]`; remíza poslední bod cesty);
    - mezera ke straně = 960 − souřadnice konce ve směru strany; strany jen ze složek směru stezky;
    - úhlopříčný směr s oběma mezerami ≤ `EDGE_MARGIN_M + TRAIL.edgeBandM` → roh (obě souřadnice ±960); jinak strana s menší mezerou (remíza – dřív v `DIRECTIONS`) a kolmý průmět.
  - `trailContinuations` – každý vstup zvlášť:
    1. konec osy `landscapeTrailLines(l)` do `EDGE_MARGIN_M + TRAIL.edgeBandM` od vstupu → bez osy;
    2. `trailTerrain(l, o)`, blokace `sacredMask` (s vrstvou), bez pevných cest a humen; `walkAll` ze schůdné buňky nejbližší vstupu (`nearestPassable`);
    3. cíl: s brankou buňka nejbližší brance; bez branky buňka s nejmenší vzdáleností z `walkAll`, jejíž střed leží v `largestRegion(marchGrid(l, o, null))` (`marchCellAt`; oblast jednou na krajinu ve `WeakMap`), remíza nižší index; start v oblasti → bez osy;
    4. nedosažitelný cíl → bez osy, jinak `traceRoute(terrain, prev, cíl, vstup)`.
  - `march-grid.ts`:
    - osy `trailContinuations` a kusy ke kraji jdou do průseku spolu s pevnými cestami vsi (krok 4 pořadí `marchGrid` z Úlohy 4);
    - kus ke kraji = `[end, edge]` každého `trailExitsOf(village)` s `max(|end.x − edge.x|, |end.z − edge.z|)` ≤ `EDGE_MARGIN_M + TRAIL.edgeBandM`;
    - `MarchGridMemo` – další úroveň `WeakMap` podle pole os (paměť `trailContinuations` vrací tentýž objekt).
  - `gridOf`, `mapGrid`, `gridOn`: `continuationsOf(map, village, day)` → paměť mřížek, nebo `marchGrid(…, { day, trailContinuations })`.
  - `villageDigest`: `trailExits: trailExitsOf(state)`.
- [ ] **Step 6: Spustit – PASS** a celé `npm run test`. GOLDEN a čísla testů války přepsat jen tam, kde přípravek má hotovou stezku u kraje (kus ke kraji) – s větou v commitu.
- [ ] **Step 7: Failing testy světa.**
  - `trail-exits.db.test.ts` (`npm run test:db`): sídla (0; 0); (1; 0) s vsí, jejíž souhrn má výstup E; (−1; 1) s vsí se souhrnem bez `trailExits`; (2; 0) a archivované (0; 1) → `trailExitsAround({ x: 0, y: 0 })` vrátí právě (1; 0) s výstupy a (−1; 1) s `exits: null`.
  - `campaign-cells.test.ts`:
    - zdroj vrátí souseda (0; 0) s výstupem E → `mapOf({ x: 1, y: 0 }).trailEntries` `toEqual(trailEntriesOf(…))`;
    - soused s `exits: null` → `villages.find` jednou na verzi, výstupy z `trailExitsOf(stav)`; druhé `mapOf` při téže verzi → `find` se nevolá;
    - prázdné políčko: výstup souseda přidaný po prvním `mapOf` je ve druhém (vstupy nejsou v LRU);
    - bez `trailExits` → `trailEntries` `[]`.
- [ ] **Step 8: Implementace světa.**
  - Adaptér: jeden dotaz `settlement` ⋈ `village` – aktivní sídla ve čtverci 3 × 3 kolem políčka bez středu; `exits` z `digest->'trailExits'`; souhrn jiné verze (`isCurrentDigest`) nebo bez pole → null.
  - `createCampaignCells`:
    - LRU dál drží jen krajinu a překážky prázdného políčka; `trailEntries` se čtou při každém `mapOf`;
    - `exits` null nahradí `find` + `trailExitsOf` v paměti podle `id@version` (velikost `CAMPAIGN_CELL_CACHE_SIZE`).
  - Skládání: `trailExits: createTrailExitSource(db)` v `apps/web/lib/campaign.ts` a `apps/worker/src/main.ts`.
  - `mapTrailContinuations` = `continuationsOf(await cells.mapOf(cell), state ?? stav první vsi mapy (find) ?? null, day)`.
  - Spustit `npm run test:db` a `npx vitest run packages/server/src/__tests__/campaign-cells.test.ts` → PASS.
- [ ] **Step 9: Vlkov, docs a commit.**
  - Skript ve scratchpadu agenta (jako Úloha 1, DB `bohemia` jen čtením):
    - Vlkov (48; 0) → `trailExitsOf`; sousedé ve směrech výstupů → `continuationsOf` a mřížka s pokračováním; `reachableCells` ze vstupu;
    - z branky Vlkova dosažitelnost okrajové buňky u bodu okraje každého výstupu.
  - Expected: u N (48; 1) a E (49; 0) obsahuje dosah ze vstupu `largestRegion` a je větší než 8,5 % a 4,7 % mapy z měření.
  - Do `.superpowers/sdd/2026-11-16-dense-forest/task-4b-report.md`: podíly a čas prvního a dalšího `continuationsOf`. Co nevyjde, jde do zprávy, ne do opravy v této úloze.
  - Docs podle Files (bez scény).
  - `npm run typecheck && npm run lint && npm run test && npm run format:check && npm run check:docs` a `npm run test:db` – vše projde. Pak `git commit -m "feat(game): zemská stezka pokračuje na sousední mapě"`.
- [ ] **Step 10: Failing testy scény:**
  - `trail-view.test.ts`: `sceneTrailContinuations([a, b])` → dvě `SceneRoad` s id −1 a −2, `points` = osy, `grade: 'improved'`, `swath: true`;
  - `minimap.test.ts`: ves s `trailContinuations: [r]` dá tutéž čáru jako ves s `roads: [r]`.
- [ ] **Step 11: Implementace scény** – žádný nový atribut ani vertex buffer (WebGPU limit 8):
  - pohled vlastní vsi: serverový volající `village-view-scene.ts` předá `mapTrailContinuations(…, políčko sídla, den pohledu, stav)`; `SceneVillage.trailContinuations = sceneTrailContinuations(…)`;
  - `foreignMapForPlayer` a `journeyMapForPlayer`: `trailContinuations` z `mapTrailContinuations(…, cell, dnešní den)`; známá mapa (`knownMapForPlayer`) je nemá – nese jen znalost rodu;
  - `ForeignWarScene`, `ForeignJourneyScene`: `scene.setVillage` dostane i `trailContinuations: sceneTrailContinuations(map.trailContinuations ?? [])`, i na mapě bez staveb (`{ dwellings: [], fields: [] }`);
  - `path-renderer.ts`, `swath-bands.ts` a minimapa kreslí `trailContinuations` spolu s `roads`; `village-picking.ts` a `selection-highlight.ts` je neznají;
  - stromy a keře vrstvy překážek do `ROAD_SWATH.halfM` od osy pokračování se nekreslí – stejným filtrem, jakým scéna skrývá pokácené stromy vsi, bez pařezů;
  - docs `village-roads.md` – Průsek lesem: pokračování ve scéně.
- [ ] **Step 12: Ověření a commit.** `npm run typecheck && npm run lint && npm run test && npm run format:check && npm run check:docs` a `npm run test:e2e` (sériově – Global Constraints) – vše projde. Pak `git commit -m "feat(web): pokračování zemské stezky ve scéně a na minimapě"`.

---

### Task 5: Pohyb po mapách – přechod okraje, uvíznutí, přepočet úseků (Opus)

Souběžně s Úlohou 6 smí – jiné soubory kromě `docs/code/war.md` (jiné sekce).

**Files:**

- Modify:
  - `packages/game/src/domain/war/march.ts` – `marchPathToEdge(grid, from, direction, arrival?)`;
  - `packages/game/src/domain/war/movement.ts`:
    - `planMoverLeg` s filtrem příchodu nad `gridOf(nextCell, day, ctx)`;
    - `stepMover` se `stuckDay`;
    - `sendGroup` smaže `stuckDay`;
    - nové `replanLegs` (verzi bere z `march-grid.ts`);
  - `march-grid.ts` – `export const MARCH_GRID_VERSION = 2`;
  - `campaign-types.ts`:
    - `CampaignState.marchGridVersion?: number`;
    - `stuckDay?: number` u `CampaignGroup` a u typů uprchlíků a poslů, které jdou přes `stepMover`;
  - `journey-types.ts` – `JourneyState.marchGridVersion?: number`;
  - `campaign.ts` – `stepCampaign`: na kopii prvního taktu `replanLegs`, když verze nesedí;
  - `journey-upgrade.ts` – `upgradeJourney` volá `replanLegs`.
- Test:
  - Create `packages/game/src/domain/war/__tests__/movement.test.ts`;
  - Modify `campaign.test.ts`, `journey-upgrade.test.ts`.
- Docs:
  - `docs/code/war.md` – Pohyb vojska (přechod okraje, uvíznutí), Tažení po taktech (`marchGridVersion`);
  - `docs/code/journey.md` – Stav a krok (`marchGridVersion`).

**Interfaces:**

- Consumes: Úloha 4 (`marchGrid`), Úloha 2 (`marchPathToEdge`), Úloha 4b (`gridOf` s pokračováním stezek – přechod u konce stezky vede do průseku, filtr příchodu ho vidí bez změny).
- Produces:
  - `marchPathToEdge(grid: MarchGrid, from: Pos, direction: Direction8, arrival?: (edgeCell: number) => boolean): MarchPath | null` – cíl jen okrajová buňka s `arrival(c)` true.
  - `replanLegs(state: { groups: Mover[]; marchGridVersion?: number }, extra?: readonly Mover[]): void`:
    - `leg = null` u skupin a u `extra` (uprchlíci a poslové tažení);
    - nastaví `marchGridVersion = MARCH_GRID_VERSION`.
  - `Mover.stuckDay?: number`.

- [ ] **Step 1: Failing testy `movement.test.ts`** (dvě rovné mapy z `campaign-fixtures.ts`):
  - **Přechod jen do průchozího:** sousední mapa má neprůchozí pás u západního okraje kromě z ∈ [100; 120] → skupina jdoucí na východ přejde se z ∈ [100; 120] a buňka příchodu je průchozí (Review Focus 4).
  - **Okraj bez přechodu:**
    - celý okraj sousední mapy neprůchozí → `stepMover` vrátí `stuck` a `m.stuckDay === day`;
    - další volání téhož dne se světem, jehož `landscapeOf` hodí, vrátí `stuck` bez výjimky (Review Focus 3);
    - druhý den se plánuje znovu.
  - **Nový rozkaz:** `sendGroup` → `stuckDay` chybí.
- [ ] **Step 2: Failing testy přepočtu:**
  - `campaign.test.ts` – JSON bodu bez `marchGridVersion` se skupinou, jejíž `leg` vede přes buňky dnes neprůchozí (Review Focus 2):
    - po 1 taktu je `marchGridVersion` 2;
    - všechny buňky nového úseku kromě únikového prvního jsou průchozí;
    - týž bod po 400 × 1 taktu a po 1 × 400 taktech → shodný JSON.
  - `journey-upgrade.test.ts` – `upgradeJourney` na bodu bez verze → `leg` null u všech hloučků a verze 2; vstup se nezmění.
- [ ] **Step 3: Spustit – FAIL.**
- [ ] **Step 4: Implementace** podle Rozhodnutí 8 a 9:
  - filtr příchodu = protějšek okrajové buňky (`edgeCrossing` na střed buňky) na mřížce `route[0]` má `pace > 0`;
  - `stuckDay` při neúspěchu `planMoverLeg`.
- [ ] **Step 5: Spustit – PASS** a celé `npm run test`. Čísla tažení a výprav, která se změnila jen přechodem okraje, přepsat s větou v commitu.
- [ ] **Step 6 (jen když Martin řekne „objížďka“):**
  - `Mover.blocked?: GridCell[]` – při neúspěchu přechodu přidat `route[0]` a `route = worldRoute(cell, goalCell, c => blocked)`, nejvýš 8 políček, pak `stuck`; vyprázdní se přechodem na novou mapu.
  - Test: okraj na východ zavřený → skupina dojde do cíle přes severní mapu.
  - Doplnit návrh war.md – Pohyb (Martinova slova s datem).
- [ ] **Step 7: Ověření a commit.** `npm run typecheck && npm run lint && npm run format:check && npm run check:docs` – vše projde. Pak `git commit -m "feat(game): přechod okraje jen do průchozího a přepočet rozjetých úseků"`.

---

### Task 6: Útěk do hustého lesa, dohled a šelmy (Sonnet)

**Files:**

- Create: `packages/game/src/domain/war/forest-doors.ts`.
- Modify:
  - `flight.ts` – `nearestForest` volá `nearestForestDoor` (jméno zůstává pro `rout.ts`, `scene-view.ts`, `dev-battle.ts`);
  - `evacuation.ts` – cíl „Ukrýt v lese“ = `nearestReachableForest`;
  - `refuge-choice.ts` – volba les: `nearestReachableForest`, `null` → `no-forest`;
  - `scene-view.ts` – `refugeMarch` bez skupin `hidden` pro všechny hráče.
- Test:
  - Create `packages/game/src/domain/war/__tests__/forest-doors.test.ts`.
  - Modify `nearest-forest.test.ts`, `evacuation.test.ts`, `refuge-choice.test.ts`, `scene-view.test.ts`, `alarm-sight.test.ts`, `journey-predators.test.ts`, `stance.test.ts` (jen čísla).
- Docs:
  - `docs/code/war.md` – Postoje vsi a včasný útěk (dveře lesa), Varování (Evakuace – cíl; Průvod – ukrytá skupina se nekreslí);
  - `docs/code/journey.md` – Šelmy (jen na stezce hustým lesem), Objevování (dohled).

**Interfaces:**

- Consumes: Úloha 4 (`MARCH_FOREST` = hustý les, neprůchozí bez `MARCH_ROAD`), Úloha 2 (`reachableCells`).
- Produces:
  - `nearestForestDoor(grid: MarchGrid, from: Pos): Pos | null`:
    - střed nejbližší průchodné buňky, která v 8 směrech sousedí s buňkou `MARCH_FOREST` a `pace` 0;
    - remíza nižší index;
    - index po přihrádkách jako `nearestForestOf` v `ladders.ts`, jeden na mřížku (`WeakMap`).
  - `nearestReachableForest(grid: MarchGrid, from: Pos): Pos | null` – totéž jen mezi buňkami z `reachableCells` od `from`.

- [ ] **Step 1: Failing testy:**
  - **Dveře:**
    - mřížka s blokem hustého lesa → bod je průchodný a sousedí s neprůchodnou buňkou lesa;
    - je nejbližší;
    - mřížka bez lesa → `null`.
  - **Dosažitelné dveře:** les jen za řekou bez brodu → `nearestReachableForest` = `null`, `refugeOptions(...).forest.blocked` = `no-forest`. Postoj `planDefense` pak vzdá při přesile, jinak brání (Review Focus 5).
  - **Evakuace:**
    - skupina dojde k dveřím;
    - během cesty nikdy v neprůchodné buňce;
    - stav `hidden` a událost `refuge-hidden`.
  - **Ukrytí se nekreslí:**
    - `warSceneView` vlastníka vsi nemá v `refugeMarch` skupinu `hidden`;
    - skupinu na cestě má.
  - **Bod zlomu:** obránec na útěku skončí `fled` do 2 m od dveří (přípravek bitvy s lesem).
  - **Dohled:**
    - `inSight` z buňky stezky v hustém lese na bod 60 m → false;
    - z okrajového pruhu (5 m od okraje) na 140 m → true.
  - **Šelmy:**
    - hlouček 1 muže na stezce hustým lesem → los proběhne;
    - týž v okrajovém pruhu → ne.
- [ ] **Step 2: Spustit – FAIL.**
- [ ] **Step 3: Implementace** podle Rozhodnutí 10. `sight.ts` a `journey.ts` (šelmy) se nemění – mění se jen význam `MARCH_FOREST`.
- [ ] **Step 4: Spustit – PASS** a celé `npm run test`.
- [ ] **Step 5: Ověření a commit.** `npm run typecheck && npm run lint && npm run format:check && npm run check:docs` – vše projde. Pak `git commit -m "feat(game): útěk k dveřím hustého lesa, ukrytí se nekreslí"`.

---

### Task 7: Scéna – lidé mizí v lese (Sonnet)

**Files:**

- Modify:
  - `apps/web/lib/scene/villager-plan.ts`:
    - `FLEE_SPREAD_M` 9 → 3 (návrh Clauda – mizí u dveří lesa, ne v louce);
    - `fleeWalkAt` vrací i `gone: boolean` (po doběhnutí true);
  - `apps/web/lib/scene/army-renderer.ts` (≈ ř. 600–635) – postavu s `gone` nekreslí; stádo zmizí s posledním;
  - `apps/web/lib/war-scene-view.ts` – `flightOf`: `startTick` null (starší stav) → žádné chůze (už jsou v lese);
  - `apps/web/lib/scene/refugee-march.ts` – odstranit větev `idle` ukrytých (pohled je už neposílá).
- Test:
  - `apps/web/lib/scene/__tests__/villager-plan.test.ts`, `refugee-march.test.ts`, `army.test.ts`;
  - e2e `apps/web/e2e/multiplayer-war.spec.ts` (`data-war-refugees` – počet jen během cesty) a `battle-scene.spec.ts` (ukázka bitvy – útěk k lesu).
- Docs: `docs/code/scene.md` – Průvod uprchlíků a posel; `docs/code/war.md` – Ve scéně.

**Interfaces:**

- Consumes: Úloha 6 (pohled bez `hidden`, dveře lesa v `WarSceneFlight.forests`), Úloha 4b (kurzor – mřížka v prohlížeči bere osy z `SceneVillage.trailContinuations` a `ForeignMap.trailContinuations` jako `MarchGridOptions.trailContinuations`).
- Produces: `fleeWalkAt(walk: FleeWalk, s: number)` vrací navíc `gone: boolean`.

- [ ] **Step 1: Failing testy:**
  - `villager-plan.test.ts`: `fleeWalkAt(walk, čas po doběhu)` → `gone` true, před doběhem false;
  - `army.test.ts`: válka s `flight`, čas po doběhu všech → žádná postava `f…`, žádné stádo `fc…`.
- [ ] **Step 2: Spustit – FAIL.**
- [ ] **Step 3: Implementace.** Žádný nový mesh ani vertex buffer (WebGPU limit 8).
- [ ] **Step 4: Unit testy – PASS.**
- [ ] **Step 5: e2e.**
  - Spustit jen dotčené specy `multiplayer-war` a `battle-scene` (jak pustit vybrané specy: `docs/code/web-ui.md` – e2e; jinak celé `npm run test:e2e`) a přepsat očekávání počtů.
  - Jeden menší snímek ukázky bitvy (lidé u lesa a po zmizení) do `.superpowers/sdd/2026-11-16-dense-forest/` – pro vizuální kontrolu Martinem.
- [ ] **Step 6: Ověření a commit.** `npm run typecheck && npm run lint && npm run test && npm run format:check && npm run check:docs` – vše projde. Pak `git commit -m "feat(web): uprchlíci mizí v hustém lese"`.

---

### Task 8: Celek – e2e, výkon workeru, dokumenty návrhu (Sonnet)

**Files:**

- Modify (soulad návrhu se schválenou změnou 16. 11. 2026 – přeškrtnout, odkázat na datum):
  - `docs/design/war.md`:
    - Obránci – „v lese je najde jen na ≈ 30 m“ → nahrazeno 16. 11. 2026 – zmizí jako v budově;
    - řádek 58 („hustý les velmi pomalu“);
    - Čísla – „Mřížka pochodu“: velikost z brány s datem měření;
  - `docs/design/lord-control.md` – Pohyb: „hustý les ≈ 1/4 tempa“;
  - další výskyty `grep -rn "1/4 tempa\|¼ tempa\|velmi pomalu\|najde jen na" docs/design`.
- Create: `.superpowers/sdd/2026-11-16-dense-forest/final-report.md`.
- Modify jen při překročení meze paměti: `march-grid.ts` (`MEMO_DAYS`) a `docs/code/worker.md`.

- [ ] **Step 1: Unit a pomalé testy.**
  - `npm run test` a `npm run test:slow` – vše projde.
  - `git diff <báze plánu> --stat -- packages/game/src/domain/landscape packages/game/src/domain/world` – žádná změna (otisky krajiny, kostry a vsi beze změny).
- [ ] **Step 2: e2e.** `npm run test:e2e` celé jednou – projde. Selhání v `expeditions`, `journey-worker`, `multiplayer`, `multiplayer-war` opravit, nebo vrátit úloze, která ho způsobila.
- [ ] **Step 3: Výkon workeru.**
  - `npx tsx apps/worker/scripts/measure-campaigns.ts` na bázi plánu a na větvi (stejné argumenty).
  - Do zprávy: medián času taktu a RSS.
  - Mez (návrh Clauda): takt ≤ 1,5 × báze, RSS ≤ báze + 150 MB.
  - Nad mezí: `MEMO_DAYS` 4 → 2, změřit znovu a zapsat do `docs/code/worker.md`.
- [ ] **Step 4: Dokumenty návrhu** podle Files. `npm run check:docs`, `npm run format:check` – projde.
- [ ] **Step 5: Commit.** `git commit -m "docs(design): hustý les – soulad návrhu a měření mřížky"`.

---

## Pořadí a souběh

- **Pořadí:** 1 → (2 ∥ 3) → 4 → 4b → (5 ∥ 6) → 7 → 8.
  - 4b před 5: přechod okraje (Úloha 5) bere mřížku sousední mapy už s pokračováním stezky.
  - Úloha 6 smí začít souběžně se 4b – jiné soubory kromě `docs/code/war.md` (jiné sekce).
  - 4b má dva agenty po sobě: Kroky 1–9 (Opus), Kroky 10–12 – scéna (Sonnet).
- **Výchozí běh je jeden proud** (šetrně s tokeny). Souběh 2 ∥ 3, 4b ∥ 6 a 5 ∥ 6 jen v oddělených pracovních stromech a se slučováním do integrační větve. e2e jen jednou v integrační větvi.
- **Brána po Úloze 1 je povinná:** Úlohy 2 a 4 nezačnou bez zapsaného Výsledku brány.
- **Otázka na Martina** se pošle hned po Úloze 1 se zprávou. Krok 6 Úlohy 5 čeká na odpověď, ostatní ne.
- Měřítko úlohy ≤ 150 kroků. Opravu po recenzi dělá nový agent.

## Mimo plán (později)

- Hierarchické hledání – jen kdyby brána neprošla.
- Pěšiny vsi jako průchod hustým lesem – jen po otázce z pravidla brány 4.
- Objížďka okrajem – podle odpovědi Martina (Úloha 5, Krok 6).
- Útěk po síti pěšin ve scéně – uprchlíci jdou ve scéně rovně od domu k dveřím lesa jako dnes.
