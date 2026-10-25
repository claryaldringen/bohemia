# Stálé trasy a výpočet tras v paměti – plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cíl:** Lidé i vozy chodí a jezdí stále stejně, dokud se na mapě nic nezmění. Pole má pro chůzi
i vůz stálou průměrnou cenu bez ohledu na stadium dílu, pole i stavba platí v mapě tras od
umístění, vyšlapanost přibývá jen tam, kudy trasa vede, a trasy se hledají znovu jen při změně
mapy tras (ne 1. dne v měsíci kvůli stadiím). Nad tím (B) se mřížka a trasy vozů drží v paměti
podle klíče mapy, vzdálenosti chůze se počítají jen se změnou mapy, hledání tras vozu je rychlejší
a server dopočítává ves jen jednou naráz – **bit po bitu stejný výsledek jako po A**.

**Spec:** [docs/design/paths.md – Stálé trasy (25. 10. 2026)](../../design/paths.md#stálé-trasy-25-10-2026)
(pravidla 1–5, co nahrazuje, otázky) a [wagons.md – Stálé trasy vozů](../../design/wagons.md#vozová-síť-a-vyjeté-cesty).
Zadání: Martin 25. 10. 2026 („Pusť se do obojího.“ – průměr ceny pole a stálé stezky; pole je
stavba od umístění; měsíční kontrola mění mapu jen se změnou sítě). Měření výkonu:
scratchpad `diag-perf/report.md` (Vlkov 72bbcde8, rok 47–53 s; vozové trasy 67 %, chůze 23 %).

**Architektura:** vše v deterministické vrstvě `packages/game/src/domain/village/paths/` a čísla
v `rules-roads.ts`; převod starých vsí v `application/update-village.ts`; single-flight jen
v composition rootu `apps/web/lib/village.ts` (doména o něm neví). Scéna se nemění (čte uložené
trasy a volá tytéž funkce vozů).

**Stack:** TypeScript, Vitest; měření `tsx` skripty ve scratchpadu (necommitovat). Drizzle se
nemění (stav vsi je JSON).

## Global Constraints

- **Determinismus:** trasy, mapa tras a vyšlapanost jsou čistá funkce stavu a dne; dny přepočtu
  určuje stav (změna klíče mapy, 1. den v měsíci pro práci dne, 1. 11. pro pařezy), ne kousky
  dopočtu. Každá úloha, která mění, kdy se co počítá, má test „dopočet po 1 / 7 / 30 dnech =
  najednou“ (bit po bitu).
- **Deterministická vrstva:** `paths/` – ESLint zakazuje `Math.sin/cos/atan2/hypot/log` a `**`;
  žádné `Date.now()`, `Math.random()`. Ceny kroků v hledání tras celá čísla (A1).
- **Paměť je jen zrychlení (B):** výsledek s mezipamětí, bez ní i po „studeném startu“ (prázdná
  paměť uprostřed dopočtu) stejný – test v B1. Nic v mezipaměti nesmí záviset na dni mimo klíč.
- **Čísla pravidel** jen v `rules-roads.ts` s odkazem na paths.md – Stálé trasy; změna čísla =
  i text v návrhu.
- **Staré vsi:** každá úloha převádí, co zavádí, jednou a idempotentně (tabulka níž); kontrola na
  kopii Vlkova (scratchpad `diag-roads-audit/vlkov.json`).
- **Kroky agenta:** úloha ≤ ≈ 150 kroků; čtení po kouscích, výstupy ořezávat (CLAUDE.md).
- **Před commitem:** `typecheck`, `lint`, `test`, `format:check`; u B2 (single-flight) i `test:e2e`.

## Výchozí stav kódu (25. 10. 2026, feat/landscape d77dc073)

- **Ceny pole podle stadia:** chůze `FIELD_WALK = { crop: 0.5, stubble: 0.8 }` (`rules-roads.ts`),
  `partWalkSpeed` / `isCropPart` (`paths/walk-speed.ts`), mřížka chodců `paths/network-grid.ts`
  (≈ ř. 470–490 – cena dílu, `OVERGROWN_COST`, pěšina dne přes osev nezrychlí), chůze
  `withFieldWalk` (`paths/walking.ts`); vůz `CART_SPEED.sown/ploughed/stubble` a
  `cartPartSpeed(stage)` (`paths/cart.ts`), `harvestReachState` (`carts.ts`).
- **Klíče:** `walkLayoutKey` (rozložení vč. obyvatel a stáří spojení), `walkStageKey` (stadia,
  pastva, olemování) – `paths/village.ts`; `state.walkStages`, `state.walkLayoutKey`
  (`types-state.ts`); klíč sítě se stadii `paths/network-keys.ts` (≈ ř. 109).
- **Přepočet:** `refreshWalkDistances` – 1. den v měsíci otisk stadií, při změně klíče
  `settleVillageWear` → `villagePathNetwork` → `state.routes` → vzdálenosti chůze.
- **Cíle tras:** `paths/network-targets.ts` – pole `field:<id>` (všechny buňky dílů), `base +
work(to)` (práce dne přepočtu), práce bez stálé části (`road:`, `wagon:`, `trees:`, `meadow`,
  `dwelling:`, `grain-pit:`, `sacred:`, kovář).
- **Remízy:** `PathHeap` (`paths/network-search.ts`) a `cartRoutes` (`paths/cart.ts`) berou
  při stejné ceně první nalezenou (`nd < dist`) – rozhoduje pořadí haldy; ceny `Float64`.
- **Vyšlapanost:** `WEAR.cellM` 7,5; `wearCellsOf` a `addCartWear` (`paths/wear.ts`) ± 1 soused;
  `trafficField` totéž.
- **Vozy:** `villageCartRoutes` (`paths/roads-carts.ts`) – mezipaměť s klíčem JSON celé
  `PathVillage` (674 kB), netrefí; `cartGrid` pokaždé znovu (25 % roku), `cartRoutes` 34 % self.
- **Server:** `updateVillage` s optimistickým zámkem (`version`); souběžné volání z `usePolling`
  a `skipTime` (`apps/web/app/game/actions.ts`) počítá dvakrát a jedno uložení prohraje.

## Souběh s jinými větvemi a pořadí sloučení

| Větev                  | Co mění                                                                                                                                           | Kde se potká                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fix/roads-audit-1`    | stav cest jen z pásu trasy (`trafficOnRoads`, `road-condition.ts`), ohyb do vchodu, oprava sítě, `paths/village.ts` (9 řádků)                     | A2a (vyšlapanost bez sousedů – týž princip), A2b (stav cest z `wear.labor` místo `trips` přepočtu – `trafficOnRoads`), A2b klíč mapy (měsíční kontrola, opuštěné cesty) |
| `feat/sowing-rotation` | osevní postup po dílech (`state.season`, `fieldTasks`), `plough-trip.ts` – `ploughDayFactor` → `travelToday` (vozové trasy spřežení k bloku orby) | A1 (cena pole pro vůz mění cestu spřežení k bloku – `tripCost`), B1 (`travelToday` volá trasy vozů denně – musí jít přes mezipaměť), A3 (srovnávací čísla Vlkova)       |

**Pořadí:** `fix/roads-audit-1` se sloučí **před A1** (podmínka – A2 staví na jeho pásu trasy
a `trafficOnRoads`). `feat/sowing-rotation` **před A1, je-li hotová**; jinak až **po B3** a přeladí
se na stálé trasy (konflikty: `plough-trip.ts`, `carts.ts` – `harvestReachState`, testy cesty
spřežení). **Nikdy mezi A1–A3 ani mezi B1–B3** – A3 srovnává Vlkov před a po A, B3 shodu bit po
bitu s A; větev uprostřed by obojí znehodnotila. Před každou úlohou rebase na `feat/landscape`.

## Staré vsi (převod jednou a idempotentně)

| Co                                     | Převod                                                                                                     | Úloha |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----- |
| `state.walkStages`                     | smazat při načtení (`updateVillage`)                                                                       | A2b   |
| `state.routes` se starým klíčem        | jiný klíč mapy → `withRoutes` je spočítá znovu při načtení (už existuje) – podruhé klíč sedí               | A2b   |
| vyšlapanost 7,5 m (`roads.wear`)       | každé políčko do 4 buněk 3,75 m s toutéž hodnotou; značka `wear.cellM = 3.75` (chybí = staré) – jen jednou | A2a   |
| `StoredRoute.trips` práce (snímek dne) | přepočtem tras (klíč se změní) – jen stálá část                                                            | A2b   |
| mezipaměti (B)                         | nic – jen v paměti                                                                                         | –     |

## Úlohy

### Úloha A1: Stálá cena pole, trasa na pole jako celek, remízy (≈ 140 kroků)

**Soubory:** `rules-roads.ts` (`FIELD_WALK.field` 0,6, `CART_SPEED.field` 0,25 – nahradí
`crop`, `stubble`, `sown`, `ploughed` a `CART_SPEED.stubble` pro díly; komentář s odkazem na
paths.md – Stálé trasy), `paths/walk-speed.ts` (`partWalkSpeed` → rychlost pole bez stadia,
`isCropPart` – sleva pěšiny na poli nikdy / vždy stejně), `paths/network-grid.ts`,
`paths/walking.ts` (`withFieldWalk`), `paths/cart.ts` (`cartPartSpeed` – jen zarostlý díl
neprůjezdný, jinak `field`; čtyřkolák bez výjimky zoraného dílu), `carts.ts`
(`harvestReachState` pro mřížku zbytečný),
`paths/network-search.ts` + `paths/cart.ts` (remízy).

**Rozhodnutí:**

- **Pole od umístění:** všechny díly pole (i `founding`) dostanou cenu pole; stromy z vrstvy
  překážek na umístěném poli a pozemku stavby mapa tras nebere (nejlevnější správné – mapa se při
  kácení nemění, klíč nic nového nenese). Ploty ohrad a hřbitova neprůchodné od umístění
  (staveniště plotu už ne průchozí) – v `fencedCells` / mřížce vozu bez ohledu na `built`.
- **Remízy:** ceny kroků celá čísla – `round(cena kroku × 1000)` jednou na hranu (sčítání
  `Float64` celých čísel je přesné); při `nd === dist[n]` vyhraje předchůdce s nižším indexem
  (u vozu stav buňka × směr). Hledání chodců (A\*) dobírá všechny stavy s klíčem ≤ cena cíle,
  aby rozhodnutí neviselo na tom, co se vytáhlo z haldy dřív; volba mezi koncovými buňkami
  a směry cíle také podle indexu. Sleva z vyšlapanosti po setinách síly pěšiny.
- **Pošlapání odstranit** (Martin 25. 10. 2026: „Pokud vůz pojede přes pole, tak žádnou úrodu
  nepošlape – je to přiměřené herní zjednodušení.“): smazat `CART_TRAMPLE`
  (`rules-roads.ts`), `trampleSownParts` (`cart-jobs.ts`) a jeho volání v `cart-jobs.ts`,
  `paths/cart.ts`, `year-plan.ts`; pole `FieldPart.trampledM2` (`types-land.ts`, `fields.ts`) –
  volitelné pole ve starém stavu se při načtení ignoruje; v `year-plan.ts` odečet pošlapané
  plochy ze sklizně; kronika / upozornění na pošlapání; testy `cart-jobs.test.ts`,
  `cart-trips.test.ts`, `year-plan.test.ts`. Scénu (`TRAMPLED`, `trampled…` ve
  `village-renderer*.ts`, `sacred-renderer.ts`, `showcase-sites.ts`, `village-construction.ts`,
  `pen-layout.ts`) se netýká – jde o jiné „pošlapané“ (zdupaná půda staveb); ověřit `grep`em.

**Postup:**

- [ ] Krok 1: Testy – cena buňky pole stejná pro všechna stadia (chůze i vůz, oba druhy vozu);
      zarostlý díl dál neprůjezdný vozem; úvrať jako louka; trasa k poli končí na stejné buňce
      v osevu i ve strništi; dvě symetrické cesty (zrcadlová mapa) → vždy táž trasa a táž po
      přidání vzdálené překážky; táž mapa, jiné pořadí cílů → tytéž trasy; (pošlapání odpadlo) jen přes
      díl dnes osetý; pole umístěné v lese – trasa se při kácení stromů na něm nemění.
- [ ] Krok 2: Testy selžou. Krok 3: Implementace. Krok 4: Přepis zlatých otisků (`paths-*`,
      `cart*`, `wagons*`, `plough*`, `road-tree-speed`) – každý s důvodem v commitu; vlastnosti
      (po cestě bez ohledu na povrch, ploty, ulička mezi ohradami) zůstávají samostatnými testy.
- [ ] Krok 5: typecheck, lint, test, format:check. Commit `feat(game): stálá cena pole a pevné remízy tras`.

**Zápis do `docs/code/village-roads.md`:** bod „Stálé trasy – cena pole a remízy“ (soubory,
funkce, celočíselné ceny, pravidlo předchůdce).

### Úloha A2a: Vyšlapanost bez tolerance, buňka 3,75 m (≈ 90 kroků)

**Soubory:** `rules-roads.ts` (`WEAR.cellM` 3,75 – test, že se rovná `pathCellM` dnešní krajiny),
`paths/wear.ts` (`wearCellsOf`, `addCartWear`, `trafficField`, `wearStrengths` – klíč políčka =
index buňky světa trasy, bez `± 1`), `application/update-village.ts` (převod).

**Postup:**

- [ ] Krok 1: Testy – trasa přidá jen svým buňkám (žádný soused); jízda vozu totéž; převod
      7,5 → 3,75 m: každé políčko do 4 buněk, druhé načtení nic nezmění; vznik cesty z vyšlapanosti
      po převodu ve stejném měsíci jako před ním (tatáž trasa, práh 1 000); dopočet po kouscích
      = najednou.
- [ ] Krok 2–4: selžou, implementace, projdou. Krok 5: Kopie Vlkova – velikost `roads.wear`
      před / po (mez + 10 kB).
- [ ] Krok 6: Commit `feat(game): vyšlapanost jen kudy trasa vede, políčko 3,75 m`.

### Úloha A2b: Klíč mapy tras a přepočet jen při změně (≈ 150 kroků)

**Soubory:** `paths/village.ts` (`walkLayoutKey` → `routeMapKey` + `routePlacesKey`,
`walkStageKey` pryč, `refreshWalkDistances`), `types-state.ts` (`walkStages` pryč,
`routes.mapKey`, `routes.workKey`), `paths/network-targets.ts` (stálé a práce dne zvlášť,
váhy jen ze stálé části a lidí), `paths/network-search.ts` (vrstva práce dne nad stálými),
`paths/network-keys.ts` (bez stadií), `paths/wear.ts` + `road-condition.ts` (trasy za prací:
stálá část + `wear.labor` i pro stav cest), `paths/roads.ts` (`roadsMonth` – otisk sítě cest),
`application/update-village.ts` (převod).

**Klíč mapy tras (`routeMapKey`, totéž pro B1):**

- krajina (seed); stavby a pozemky v konečné podobě od umístění (poloha, natočení, druh, pozemek,
  plot); pole a díly (políčka; zarostlý díl – roční krok); sady, hřbitovy, posvátná místa, les vsi,
  milíře;
- pevné cesty: id, osa, druh, stupeň, mokřina, olemování po desetinách – **ne** stav kusů, provoz,
  opuštění (ověřit, že opuštění nemění cenu chůze; jinak do klíče);
- pokácené stromy mimo umístěné plochy s `day` do posledního dne cest 1. 11. (`felledTrees`,
  `ObstacleChange.day`; mladé stromy k témuž dni);
- **neobsahuje** stadia, lidi, stáří spojení, stáda, práci dne ani den.

**Klíč míst** (`routePlacesKey`): obydlené domácnosti, zavedená místa, pastvina. **Váhy** (lidé,
stáda, stáří spojení) jen převáží `trips` uložených tras.

**Postup:**

- [ ] Krok 1: Testy – zasetí, sklizeň a zakládání dílu klíč nemění; umístění pole, ohrady
      a obydlí ho mění hned (i před dokončením); 1. den v měsíci bez nové / zaniklé / sloučené
      cesty klíč nemění; dokončené vylepšení ho mění; pokácený strom se do mapy promítne až 1. 11.; narození změní jen `trips`, buňky tras ne; trasy k práci dne se změní jen 1. dne
      v měsíci se změnou míst a stálé trasy přitom zůstanou bit po bitu; dopočet po 1 / 7 / 30
      dnech = najednou; převod staré vsi (smazané `walkStages`, nové trasy, podruhé nic).
- [ ] Krok 2–4: selžou, implementace, projdou. Krok 5: kopie Vlkova – kolikrát za rok se trasy
      hledaly před / po (čekáme z ≈ 12+ na jednotky).
- [ ] Krok 6: Commit `feat(game): trasy jen při změně mapy, práce dne nad stálými trasami`.

**Zápis do `docs/code/village-roads.md`:** bod „Mapa tras a klíč“ (co je v klíči, co ne, vrstva
práce dne, převážení) a úprava bodů „Trasy ve stavu vsi“ a „Vyšlapanost“.

### Úloha A3: Ověření na Vlkově (≈ 90 kroků)

**Soubory:** jen scratchpad – `diag-roads-audit/audit.mts` (kategorie a–j), kopie
`diag-roads-audit/vlkov.json`, výstupy necommitovat; čísla do `docs/code/village-roads.md`.

**Postup:**

- [ ] Krok 1: Výchozí stav (feat/landscape po sloučení `fix/roads-audit-1`, příp. rotace): 12
      měsíců dopočtu – audit a–j po měsících, (pošlapání odpadlo),
      časy chůze k dílům (`walkDistanceM` – průměr, max), jízdy a časy vozů (voda, svoz, spřežení
      k orbě), dosah svozu žně (dnes 84 % plochy), počet přepočtů tras a změněných buněk tras.
- [ ] Krok 2: Totéž po A1–A2b. Krok 3: Srovnání do tabulky (`docs/code/village-roads.md` –
      Měření cest, bod „Stálé trasy – Vlkov“).
- [ ] Krok 4: Stabilita sítě – mezi měsíci bez změny mapy 0 změněných buněk tras; souběh (d)
      a smyčky (g) neklesnou pod výchozí stav.
- [ ] Krok 5: Překročí-li dosah svozu mez (níž – Kritéria), **nezačínat B**
      a vrátit Martinovi čísla s volbou (cena vozu je rozhodnutá 4; zbývá úsek po poli podle stadia).
- [ ] Krok 6: Commit `docs: stálé trasy – ověření na Vlkově`.

### Úloha B1: Mezipaměť mřížky a tras vozů, chůze jen při změně mapy (≈ 130 kroků)

**Soubory:** `paths/roads-carts.ts` (`villageCartRoutes` – klíč místo JSON `PathVillage`),
`paths/cart.ts` (`cartGrid` z mapy – bez stadií, po A1 na nich nezávisí), `paths/village.ts`
(`routeMapKey` z A2b, otisk držený ve stavu – `routes.mapKey`), `paths/walking.ts`
(`walkingDistances` – horní mez napřed v `cheapest`), `refreshWalkDistances` (vzdálenosti chůze
jen se změnou mapy nebo míst), `plough-trip.ts` (cesta spřežení přes mezipaměť).

**Rozhodnutí:** mezipaměť = modul v paměti (server i prohlížeč), nejvýš 2 záznamy na krajinu
(LRU); klíč = `routeMapKey` (otisk ze stavu, ne nové `JSON.stringify` vsi) + druh vozu + ohrady
se spřežením (depa). Mřížka vozu podle mapy, trasy po cílech (`cíl → trasa`); volání s cíli, které
už známe, nic nehledá, neznámé dohledá jedním hledáním. Díky remízám z A1 je trasa k cíli táž, ať se
hledala s jinými cíli nebo zvlášť. Měsíční kontrola, která síť cest nezmění, klíč nezmění (A2b).

**Postup:**

- [ ] Krok 1: Testy – shoda s výpočtem bez paměti po 365 dnech Vlkova (otisk stavu); studený start
      uprostřed (vymazat paměť) = totéž; táž mapa jiný den → zásah; změna stadia → zásah; nová cesta
      → nový klíč; cíle po jednom = všechny najednou (bit po bitu).
- [ ] Krok 2–4: selžou, implementace, projdou. Krok 5: bench (B3 skript) – rok jen pro kontrolu směru.
- [ ] Krok 6: Commit `perf(game): mřížka a trasy vozů v paměti podle mapy tras`.

**Zápis do `docs/code/village-roads.md`:** nový bod „Trasy v paměti“ (klíč, LRU, kdy se maže,
proč je výsledek stejný).

### Úloha B2: Rychlejší `cartRoutes` a jeden dopočet naráz (≈ 110 kroků)

**Soubory:** `paths/cart.ts` (`cartRoutes` – stavy v `Int32Array` / `Float64Array`, cíle
v typovaném poli místo `Map` a textových klíčů, opakované pole `dist` / `parent` s razítkem běhu
jako `network-search.ts`; stejné remízy), `apps/web/lib/village.ts` (single-flight: mapa
`villageId → Promise`; druhé volání počká na první a dopočte jen zbytek do svého dne – skok
v čase), `apps/web/app/game/actions.ts`, `apps/web/hooks/use-polling.ts` (ověřit souběh).

**Postup:**

- [ ] Krok 1: Testy – `cartRoutes` stará a nová implementace na 50 náhodných mapách a cílech
      (pevný seed testu) bit po bitu; single-flight: dvě souběžná
      `updateVillage` → jeden dopočet, žádný konflikt verze; skok v čase během dotazu dopočte
      zbytek.
- [ ] Krok 2–4: selžou, implementace, projdou; `test:e2e` (dotazování a skok v čase).
- [ ] Krok 5: Commit `perf(game): rychlejší hledání tras vozu` a `perf(web): jeden dopočet vsi naráz`.

### Úloha B3: Měření a shoda (≈ 60 kroků)

**Soubory:** scratchpad `diag-perf/bench.mts` (`<src-root> domain 31,365,1095`), `results.jsonl`;
čísla do `docs/code/village-roads.md` (Trasy v paměti) a `docs/design/paths.md` (Výkon).

**Postup:**

- [ ] Krok 1: Rok Vlkova po A3 (bez B) a po B3 – čas, podíly kroků (`analyze.py`), otisk stavu
      po 31 / 365 / 1 095 dnech (`__h`) – **musí se shodovat**.
- [ ] Krok 2: Přes `updateVillage` se zátěží (jako v report.md) – souběh dotazu a skoku.
- [ ] Krok 3: Zápis čísel; Výkon v paths.md (návrh vs skutečnost). Commit
      `docs: výpočet tras v paměti – měření`.

## Rizika

- **Dosah svozu:** vůz s cenou pole 4 jede přes osetý díl ochotněji než dnes (8), ve strništi naopak objíždí
  (4 místo 1,25) a svoz uvnitř pole je dražší – **dosah svozu může klesnout** (mez hledání
  `maxCost`) a nosí se víc ručně. A3 měří obojí; záloha: poslední úsek vozu po poli (od vjezdu
  k dílu) podle dnešního stadia mimo mřížku – mřížka i trasy k poli zůstanou stálé.
- **Scéna – postavy jdou po uložené trase:** trasy se mění méně často, takže postava může jít
  „starou“ trasou k místu práce dne až do 1. dne v měsíci (jako dnes); trasa k poli končí na okraji
  a dál `fieldPath` (beze změny). Pole umístěné v lese: dokud se nevymýtí, vede trasa mezi
  stojícími stromy – postavy jimi projdou (zjednodušení; jinak by se mapa měnila s každým stromem).
  Trasy vozů ve scéně z téže funkce a téže mezipaměti – prohlížeč a server dají totéž, jen když
  klíč mapy počítají stejně (test).
- **Převod Vlkova:** jednorázový přepočet všech tras a převod vyšlapanosti – trasy se jednou
  posunou (konec tolerance, nová cena pole); vyšlapanost mimo nové trasy dorůstá až 4 roky.
  Cesta vzniklá z pásu tolerance může blednout, nevede-li po ní trasa (stav cest z pásu –
  `fix/roads-audit-1`).
- **Výživa a práce:** časy chůze k dílům jsou průměr – v osevu kratší, ve strništi delší než dnes;
  změny čísel kalibrace vsi (výživa, nošení) jsou možné. Kalibraci (`measure-village`) nepouštět
  bez pokynu – A3 hlásí jen Vlkov.
- **Determinismus mezipaměti:** cokoli, co mřížka vozu čte mimo klíč (dnešní pokácené stromy,
  stadia, depa), rozbije shodu po studeném startu. Proto pařezy jen k 1. 11. a test studeného startu.
- **Paměť serveru:** stavy vozu (buňky × 16 směrů) ≈ desítky MB na mapu – LRU 2 záznamy na
  krajinu, `dist` / `parent` sdílené mezi voláními.
- **Trasy k práci dne:** zůstávají měsíční (jako dnes) – kácení nebo seč mimo 1. den v měsíci
  nemusí mít trasu a do vyšlapanosti se nepočítá (jako dnes – „práce bez pěší trasy“).

## Kritéria hotovo

- Zasetí, sklizeň a zakládání dílu nezmění žádnou uloženou trasu ani mřížku vozu (test i Vlkov:
  mezi měsíci bez změny mapy 0 změněných buněk tras).
- Vyšlapanost přibývá jen v buňkách tras; souběžné pásy (audit d) po 12 měsících ne víc než dnes.
- Žádné pošlapání úrody (`grep` na `CART_TRAMPLE` / `trampledM2` prázdný); dosah svozu žně
  nejvýš − 5 p. b. (84 % → ≥ 79 %) – jinak rozhodne Martin (A3 krok 5).
- Rok dopočtu Vlkova ≤ 25 s (dnes 47–53 s) a otisk stavu po 31 / 365 / 1 095 dnech po B stejný
  jako po A.
- Stará ves se převede jednou (druhé načtení nic nemění); `typecheck`, `lint`, `test`,
  `format:check`, u B2 i `test:e2e`.

## Otázky pro Martina – rozhodnuto 25. 10. 2026

Martin: „Ať je stejná cena jako u dvoukoláku. 4 je asi dobrý průměr. Pokud vůz pojede přes pole,
tak žádnou úrodu nepošlape – je to přiměřené herní zjednodušení.“

- ~~Cena pole pro vůz~~ – **4**, dvoukolák i čtyřkolák stejně.
- ~~Čtyřkolák na poli~~ – stálá cena jako dvoukolák.
- ~~Pošlapání úrody~~ – odpadá (úloha A1).
