# Worker (`apps/worker`)

Samostatný Node proces, který průběžně dopočítává vsi hráčů, i když nikdo není online. Je to
vstupní bod (composition root) jako web – žádná herní logika, jen plánování; práci dělá use-case
`advanceWorldStep` (`packages/game/src/application/advance-world.ts`, krok světa viz
`docs/code/web-ui.md`). Web a worker se vylučují zámkem hráče v Postgresu (`PlayerLock`).

## Spuštění

- `npm run dev` – turbo pustí web (`:3010`) i worker (`tsx watch`, restart při změně kódu).
- `npm run dev:web` – jen web; `npm run worker` – jen worker (`tsx src/main.ts`).
- Konfigurace z prostředí, vzor `apps/worker/.env.example`. `DATABASE_URL`, `WORLD_START`,
  `WORLD_END` se čtou i z `apps/web/.env.local` (proměnné z prostředí mají přednost) – web a worker
  musí mít stejnou databázi i stejný „dnešek“. `WORKER_STEP_DAYS` (10), `WORKER_LIMIT` (50),
  `WORKER_IDLE_MS` (5000), `WORKER_PAUSE_MS` (20), `WORKER_LANDSCAPES` (128),
  `WORKER_CAMPAIGN_MS` (1000 – perioda smyčky tažení), `WORKER_LOG` (`info` / `debug`).
- Produkce (PM2 vedle Next, bez Caddy) se řeší až s `docs/deployment.md`.

## Soubory

- `src/main.ts` – skládání: pool hlavní a pool zámků (`WORKER_LOCK_POOL_SIZE` = 2),
  `createGameDeps` (obsahuje i `queue` = `createWorldQueue`), signály, zavření poolů.
- `src/loop.ts` – `runLoop(deps, options, signal)`: kolo `advanceWorldStep` → při práci pauza
  `pauseMs`, při `idle` spánek `nextWakeMs`; krok dostane okamžik kola `now` (Uspání nečinných) (drží-li tažení vsi – `WorldStep.held` – nejvýš
  `HELD_WAKE_MS` = 250 ms, viz Přednostní vsi); souhrn do logu jednou za minutu; chyba kola ani jednoho
  hráče smyčku nezastaví. Hodiny, spánek i krok se v testech nahrazují (`LoopDeps`). Mezi koly pouští
  `runWorldTasks` (kredity nástupnictví, `world.md`; obnova zásilek, Odvody, války, nováčci – los po týdnu pod zámkem hráče; jídlo
  domény po žních `sendDomainFood` – `vassalage.md`, Jídlo domény – krok světa; člen `domainFood`
  skládá `main.ts`: `loadVillage` s dopočtem do dneška a uložením, `gameDeps.domainFood`, mapa
  pokusů `attempts` drží proces) nejvýš jednou za minutu (`WORLD_TASKS_MS`, podle
  hodin `deps.now`); jejich chyba kolo nezastaví.
- `src/campaign-loop.ts` – `runCampaignLoop(deps, { campaignMs }, signal)`: **smyčka tažení**
  vedle smyčky vsí (`main.ts` je pouští spolu přes `Promise.all`, signál ukončí obě). Kolo
  `stepCampaigns` (`docs/code/war.md` – Tažení po taktech) každých `campaignMs` od začátku kola;
  chyba jednoho tažení (`failed` ve výsledku) ani celého kola (např. chybějící tabulka před
  migrací) smyčku nezastaví, stejná chyba se do logu opakuje nejvýš jednou za minutu. Bez tažení je
  kolo jeden dotaz (`active()`). Zámek tažení má vlastní pool (`CAMPAIGN_LOCK_POOL_SIZE` = 2), vsi
  tažení jdou úložištěm bez paměti dávky (`createVillageRepository`), mapy políček
  `createCampaignCells` (`packages/server`). Paměť tažení napříč koly (`newCampaignMemory` – poslední
  spočtený stav a mřížky pochodu, Výkon – Tažení) drží proces; restart ji zahodí (počítá od bodu).
- `src/wake.ts` – `nextWakeMs` (do 1 s po začátku dalšího herního dne, nejvýš `idleMs`) a
  `SkipTable` (odklady: zámek ve webu 2 s, chyba 1 min zdvojováním do 15 min; use-case dostane
  množinu `skip`).
- `src/config.ts`, `src/log.ts` – env → konfigurace (chyby česky), řádky `[worker] HH:MM:SS – …`.
- `src/signals.ts` – `signalHandler`: první signál zastaví smyčku, opakovaný ukončí proces hned.

## Ukončení

První SIGINT / SIGTERM dokončí rozpočítanou dávku (hráče; `shouldStop` se kontroluje mezi hráči kola), zavře pooly (zámky padnou se spojením) a vypíše
„worker skončil“; druhý signál skončí hned. Jedno Ctrl + C v terminálu přijde víckrát (dostane ho
celá skupina procesů a `tsx` ho přepošle) – signál do `REPEATED_SIGNAL_MS` (1 s) po prvním patří
témuž stisku a ignoruje se. Pod `npm run dev` ukončuje dítě i `tsx watch`: na opakovaný signál ho
po chvíli zabije („Force killing…“) – ověřeno 1. 11. 2026, worker stihl dávku dokončit a vypsat
„worker skončil“; nedokončená dávka by se jen zahodila (zámek padne se spojením).

## Přednostní vsi (bariéra tažení)

Plán 2026-11-03 – Úloha 6.7; `docs/code/war.md` – Bariéra dopočtu. Ves, u které stojí tažení
(skupina na mapě vsi nebo políčko od ní), se dopočítá jen do meze tažení a tažení čeká na její
předchozí den – worker ji proto bere **přednostně**:

- `advanceWorldStep` se na začátku kola zeptá `WorldQueue.priorityVillages()` (adaptér
  `villagesNearCampaigns` – políčka skupin aktivních bodů × sídla do políčka od nich) a jejich mezí
  `VillageHolds.limitOf`; meze předá `queue.behind(worldDay, limit, holds)`: ves na své mezi není
  pozadu (žádné kolo naprázdno, nezabírá místo ve frontě), hráč s přednostní vsí pod mezí jde první,
  pak podle zpoždění. Bez tažení stejný dotaz i pořadí jako dřív.
- `WorldStep.held` = počet přednostních vsí; nic pozadu a `held > 0` → smyčka spí jen `HELD_WAKE_MS`
  (mez roste s taktem tažení – tažení uloží bod hned, když na ves čeká –, ne s herním dnem).
- Vsi bez tažení se dopočítají jako dřív (bariéra je nenačte – `limitOf` je nevrátí).

## Uspání nečinných

absence.md – Zátěž serveru (Martin 8. 11. 2026: „A“). Vsi hráče, který **nehraje déle než
`ABSENCE.sleepDays` (3) skutečné dny** (`domain/world/rules-world.ts`), spí: worker je průběžně
nepočítá a dopočítají se, až se jich něco dotkne. Výsledek je díky determinismu stejný (test
„uspaná ves po dotyku = průběžně počítaná“ v `advance-world.test.ts`, i se zásilkou ve schránce).

- **Kdo je nečinný:** aktivní dny hráče (`player_activity`, datum v Europe/Prague – táž tabulka
  jako „začal hrát“ pozvaného). `awakeSince(now)` (`application/activity.ts`) = datum před 3 dny;
  hráč, jehož poslední aktivní den je dřív (nebo žádný), spí. Přesnost je den – vsi usnou po 3 až
  4 dnech od poslední hry. Web zapisuje aktivní den při vstupu do hry
  (`gameEntryForPlayer`) i při každé akci a dotazu na ves (`playerId()` v `app/game/actions.ts` →
  `notePlayerActive`, do databáze nejvýš jednou za den a proces) – hráč s otevřenou hrou neusne.
- **Fronta:** smyčka předá `advanceWorldStep` okamžik kola (`now`), use-case frontě
  `awakeSince(now)` a `WorldQueue.behind` nečinné vynechá (adaptér: `EXISTS` nad primárním klíčem
  `player_activity`). Výjimky: hráč s **přednostní vsí pod mezí** (tažení u ní čeká – dotek
  nájezdem, Přednostní vsi) jde první jako dřív – jinak by tažení čekalo navždy; hráč, jehož ves
  živě spravuje **aktivní hráč** (`stewardship`, vassalage.md – Hráč jako správce cizí vsi), je
  vzhůru. Bez `now` (testy, `measure-absence`) nikdo nespí.
- **Dotyky** (všechny dopočítají ves do dneška, nebo čekají ve schránce): návrat hráče – web
  dopočte zobrazenou a zaostalé vsi (`lagsBehindWorker`, village-core.md – Dopočet) a zapsaný
  aktivní den ho probudí; obchod, dávky, výměna lidí, jídlo domény – zásilky přes schránku vsi
  (`inbox.post`, použijí se v den příjezdu při dopočtu); jídlo domény, roční potvrzení dávek,
  svolání, jednání, zajatci, ochrana – `prepareVillage` (`loadVillage` s uložením) před čtením
  stavu; odúmrť – `updateVillage`; nájezd – přednostní ves (výš). Smrt hlavy spícího rodu (a s ní
  nástupnictví – `settleSuccessionOf` po dávce) se odhalí až dopočtem při dotyku.
- **Omezení:** pohled jiného hráče na rod (`house-panel`, adresář rodů) čte uložené souhrny
  (`digestsOf`) – u spící vsi jsou ze dne, kdy usnula (jména mužů rodu, jídlo). Návrat po dlouhé
  nepřítomnosti dopočítá web v požadavku: 31–43 ms na herní den vsi velikosti Vlkova (Výkon), tj.
  ≈ 1,5–2 min za 3 skutečné dny spánku na ves.

## Výjimky a omezení

- **Sousedé na mapě s víc vsemi:** ve workeru vidí ves při dávce sousedy tak staré, jak jsou uložení
  (až o dávku starší); ves počítaná po sousedovi ho vidí dál než sebe. Platí „výsledek na kouscích
  nezávisí“ jen pro ves samotnou na mapě. Web dopočte sousedy do dneška (`mustAdvanceNow`).
- **Konec rodu ve workeru:** `closeDynastyDay` se zjišťuje ke dni dávky `T`, ne ke dni hráče –
  výjimka z „po kouscích“ vedle převodů `withPenGrace` / `withThreshingGrace`. Konec hry je stejný.
- **Chyba jedné vsi** nezastaví ostatní vsi hráče; hráč se označí `failed` (odklad) až na konci.
- Hlavní pool má posluchač `error` (restart Postgresu worker neshodí); web čeká na zámek v DB
  nejvýš `WEB_LOCK_WAIT_MS` (45 s), pak chyba.

## Testy

- `apps/worker/src/__tests__` – konfigurace, `nextWakeMs` / `SkipTable`, smyčka s falešnými
  hodinami, `signalHandler`, smyčka tažení (`campaign-loop.test.ts` – perioda, chyba tažení i kola
  smyčku nezastaví, opakovaná chyba jednou).
- **Souběh web × worker** (`packages/server/src/__tests__/web-worker-race.db.test.ts`, `test:db`
  – kořenový `test:db` pouští `@bohemia/db` a pak `@bohemia/server`): dva „procesy“ s vlastními
  pooly (hlavní i zámků – advisory zámek patří spojení) nad `bohemia_test`, 3 hráči / 4 vsi, každá
  ves sama na mapě (ruční krajina z testů jádra). Hodiny +1 den za takt (12 ms), 200 dní. Worker točí
  `advanceWorldStep` (dávka 5 dní), web ve třech smyčkách s frontou hráče v procesu (jako
  `exclusive`) a `PlayerLock.run` dělá `dynastyForVillage` a akce (pole, přejmenování), den čte až
  pod zámkem. Záznamník uložení (den před → po podle verze) ověří: uložené úseky na sebe navazují,
  **se zámkem žádný konflikt verze** a každý den vsi spočítaný právě jednou, worker narazil na zámek
  webu (`busy`), a konečný stav (JSON se seřazenými klíči – `jsonb` pořadí mění) i jméno = dopočet
  jedním procesem v paměti se stejnými akcemi ve stejné dny. Druhý běh bez zámku webu: konflikty
  verzí nastanou (≈ 130, dny se počítají znovu), výsledek je přesto stejný – pojistka verzí.
- **e2e s workerem** (`apps/web/e2e/worker.spec.ts`, projekt Playwright `worker`; samotný
  `npm run test:e2e:worker`, celé `npm run test:e2e` pouští oba projekty): spec pustí worker
  (`node --import tsx src/main.ts`, prostředí `E2E_ENV` jako web, `WORKER_IDLE_MS` 300) nad
  vyprázdněnou `bohemia_test` (worker bere první hráče nejvíc pozadu – staří hráči jiných specifikací
  by ho zdrželi). Ves 30 dní pozadu (posun času hráče, stránka zavřená) worker dožene, `/game` ji
  otevře beze změny verze a staví dál (pole, přejmenování); ves na cestě se správcem a příjezdem
  v den odchodu worker sám založí a hráč na ni přepne v seznamu vsí. Na konci SIGTERM → kód 0,
  „worker skončil“, žádný advisory zámek. Projekt `chromium` (všechny ostatní specifikace) běží
  bez workeru – záložní cesta webu. Společné kroky vsi jsou v `e2e/village-helpers.ts`.

## Výkon (měření)

`apps/web/scripts/measure-absence.ts` (plán workeru – 7. Měření): rod s `--villages` kopiemi
Vlkova (2,6 MB JSON, vlastní sídlo každá), svět posunutý o `--days` (výchozí 1000 ≈ 1 skutečný
den), řízené hodiny. Měří skutečné serverové funkce webu (`villageViewForPlayer`,
`renameVillageForPlayer`) a `advanceWorldStep`. Databáze `bohemia_measure` (`--db bohemia_measure*`,
vytvoří se a zmigruje sama, vývojová `bohemia` se jen čte), `--scenarios A,B,C`, `--profile` =
nejdražší funkce otevření a akce.

```bash
cd apps/web && NODE_OPTIONS=--conditions=react-server nice npx tsx scripts/measure-absence.ts \
  --villages 1,5,20 --days 1000
```

Změřeno 1. 11. 2026 (M-série, 10 jader, jedno jádro na proces; čas na serveru bez sítě a
vykreslení). A = bez workeru (dnešní chování), B = worker dožene, pak +1 den a otevření / akce
(přejmenování), C = worker doběhl polovinu kol.

| scénář           | vsí |  dní | worker |  otevření |        akce |
| ---------------- | --: | ---: | -----: | --------: | ----------: |
| A bez workeru    |   1 | 1000 |      – |    21,7 s |      0,19 s |
| A bez workeru    |   5 | 1000 |      – |      94 s |      0,37 s |
| A bez workeru    |  20 | 1000 |      – |     441 s |       6,6 s |
| B s workerem     |   1 | 1000 |   33 s | 0,26 s OK |   0,18 s OK |
| B s workerem     |   5 | 1000 |  158 s |  1,4 s OK |  1,5 s MIMO |
| B s workerem     |  20 | 1000 |  673 s | 0,72 s OK | 1,10 s MIMO |
| C během dohánění |   1 | 1000 |   16 s |     8,2 s |           – |
| C během dohánění |   5 | 1000 |  257 s |      41 s |           – |
| C během dohánění |  20 | 1000 |  302 s |     156 s |           – |

Čistší opakování B (100 dní – čas B na délce nepřítomnosti nezávisí, běh jen sám na stroji,
mezipaměť webu zahřátá prvním pohledem): 1 vs. otevření 0,27 s / akce 0,19 s, 5 vsí 0,54 s /
0,66 s, 20 vsí 0,71 s / **1,24 s**. První pohled po startu serveru (studená mezipaměť krajiny
a vrstvy překážek) 0,6–1,0 s.

**Kapacita jádra:** 31–43 ms na herní den Vlkova → ≈ 2000–2700 vsí velikosti Vlkova na jedno
jádro workeru v reálném čase (1 den = 86,4 s); podíl generování krajin ve workeru ≈ 0 %
(mezipaměť 128). Plán odhadoval 3–4 tisíce – měřeno je méně, pořád o řád víc než rod do 20 vsí.

**Závěr:** otevření s workerem je v cíli (do 2 s) pro 1 / 5 / 20 vsí. **Akce přes 0,5 s od 5 vsí**
(0,66 s, 20 vsí 1,1–1,2 s). Bez workeru je otevření po dni nepřítomnosti nepoužitelné (22 s až
7 min) a během dohánění (C) web dopočítává, co worker nestihl – proto worker musí běžet.

**Kde je čas akce (profil `--profile`, 20 vsí):** téměř všechno je načtení stavů ostatních vsí
pro přepínač vsí (`villageListItem`): ≈ 0,5 s čekání na databázi (přenos 20 × 2,6 MB JSONB),
≈ 0,3 s parsování řádků (`_parseRowAsArray`), ≈ 0,1 s GC; samotné sestavení pohledu je zlomek.
Web načte všech 20 stavů po každé uložené verzi (worker ukládá každý herní den ≈ 86 s).
**Souhrn vsi (1. 11. 2026, plán – Doplnění):** cíl Martina z 31. 10. 2026 „**Otevření do 2 s,
akce do 0,5 s**“ splní malý souhrn vsi ve sloupci `village.digest` (migrace
`0010_village_digest` – `digest jsonb`, `digest_version integer`):

- **Co nese** (`VillageDigest`, `domain/village/digest.ts`, ≈ 300 B u Vlkova): den vsi, počet
  lidí, na cestě, hlad (`hungerLevel`), nouzový výmlat (`threshingStatus().emergency`), správce,
  fakta konce rodu (`LineFacts` – sleduje rod, muži rodu, `extinctDay` / `abandonedDay`), vstupy
  počasí roku (`weatherSeed`, z pohrom jen povodeň a vynucené počasí – ochrana dílů má u Vlkova
  120 kB) a poslední místní pohromu z kroniky (`LOCAL_DISASTER_KINDS`). Od verze 2 (5. 11. 2026, adresář rodů) i `publicLineMen` – muži rodu
  s číslem osoby, jménem a dnem narození (`PublicLineMan`); souhrn verze 1 se nepoužije
  (`isCurrentDigest`) a ves ho dostane při dalším uložení. Co závisí na dni pohledu
  (odhalené počasí roku), se počítá až v pohledu ze vstupů – položka přepínače je táž i pro dnešek
  o pár dní po dni vsi. Od verze 4 (8. 11. 2026, hradiště) i `domainReadyYear` (rok, kdy je ves po výmlatu a smí dát jídlo domény –
  `domainFoodReadyYear`, jinak null) a `food` (`{ growsKg, needsKg }` z `villageFoodBalance`, bez lidí nebo
  pole null); souhrn verze 3 se nepoužije a ves ho dostane při dalším uložení – migrace netřeba.
  `VILLAGE_DIGEST_VERSION` = tvar; jiný tvar se nepoužije.
- **Kdo ho píše:** adaptér (`createVillageRepository` – `create`, `add`, `addOnce`, `save`) ze
  stavu přes `villageDigest` (0,01 ms), s `digest_version` = nová `version`. Generovaný sloupec
  zvolen nebyl: pravidla hladu, výmlatu a mužů rodu jsou v jádru (TS) a v SQL by se musela
  opakovat. Cena zápisu to nerozhodlo – změřeno `UPDATE` 2,6 MB JSONB: bez dalších sloupců
  54–56 ms, se dvěma generovanými sloupci ze stavu 54–55 ms, se zapsaným souhrnem 53–54 ms
  (rozdíl v šumu); den vsi ve workeru 43–44 ms před i po.
- **Kdo ho čte:** `dynastyForVillage` – vsi **jiných map**, které nejsou víc než
  `WORKER_LAG_DAYS` pozadu, jen přes `digestsOf` (port `VillageRepository`, bez stavu); zobrazená
  ves a vsi téže mapy celé jako dřív. Souhrn platí jen při `digest_version = version` – zápis
  stavu mimo adaptér (e2e, ruční SQL) verzi zvýší a ves se načte celá; ves bez souhrnu (uložená
  před migrací) taky – souhrn dostane při dalším uložení (worker ≈ každý herní den). Konec hry ze
  souhrnů pozná `isGameOverOf`; když nastal, načtou se vsi celé a rozhodne se jako dřív.

Měřeno `--villages 1,5,20 --days 100 --scenarios B` (běh sám na stroji):

| vsí | otevření před | otevření po |   akce před |       akce po |
| --: | ------------: | ----------: | ----------: | ------------: |
|   1 |     0,26 s OK |   0,27 s OK |   0,18 s OK |     0,19 s OK |
|   5 |     0,34 s OK |   0,19 s OK |   0,44 s OK |     0,17 s OK |
|  20 |     0,72 s OK |   0,21 s OK | 1,08 s MIMO | **0,18 s OK** |

Akce i otevření jsou s workerem v cíli pro 1 / 5 / 20 vsí a na počtu vsí už skoro nezávisí.

### Tažení (Úloha 6.17)

`apps/worker/scripts/measure-campaigns.ts` – v paměti (žádná databáze): 1 / 5 / 20 tažení × 60
mužů (3 skupiny, NPC velitel) na pochodu přes skutečné krajiny prázdných políček
(`emptyCellLandscape`) a 5 tažení u opevněných vsí (palisáda z bodů kolem jádra, postoj bránit –
útočiště, prolamování). Smyčka je skutečné `stepCampaigns` každých 250 ms nad porty v paměti
(kontrolní bod jako JSON – jsonb, bod po ≥ 40 taktech nebo s událostí) s pamětí workeru;
`--no-memory` = bez ní (každé kolo znovu od bodu – stav do 7. 11. 2026). „Otisk“ uložených bodů
musí být s pamětí i bez ní tentýž. `--ticks` (výchozí 480 = 2 min), `--profile` = podíl hledání
cesty (vzorky pod `marchPath` / `marchPathToEdge` / `worldRoute`) a mřížky.

```bash
nice npx tsx apps/worker/scripts/measure-campaigns.ts --ticks 480 --profile
nice npx tsx apps/worker/scripts/measure-campaigns.ts --ticks 480 --no-memory   # stav před
```

Změřeno 7. 11. 2026 (M-série, jedno jádro). „Jádro“ = podíl jednoho jádra smyčkou jako ve
workeru; „před“ = bez paměti workeru (`--no-memory`, stejné body i otisk).

| scénář                | tažení |   před |        po | cesta (A\*) | mřížka |
| --------------------- | -----: | -----: | --------: | ----------: | -----: |
| pochod                |      1 |  2,4 % |     0,4 % |        15 % |    0 % |
| pochod                |      5 | 10,5 % |     1,6 % |        13 % |    1 % |
| pochod                |     20 | 39,7 % | **4,4 %** |        13 % |    0 % |
| opevněné vsi (nájezd) |      5 | 16,2 % |     2,5 % |         0 % |    1 % |

**Cíl ≤ 25 % jádra pro 20 tažení je splněn (4,4 %).** Dřív byl čas v **opakování taktů od
kontrolního bodu**: bod se ukládá po 40 taktech, a než se uložil, každé kolo počítalo znovu od
něj (průměrně ≈ 20 taktů za kolo místo jednoho), u nájezdu ještě v **mřížce pochodu** mapy cíle
(`marchGrid` 18–20 %), která se stavěla v každém volání znovu. Oprava:

- **Paměť workeru** (`newCampaignMemory`, `StepCampaignsDeps.memory` – `apps/worker/src/main.ts`):
  poslední spočtený, ještě neuložený stav tažení (`CampaignMemo` – otisk bodu = JSON jeho stavu,
  záměry do jeho taktu `seq@takt`). Další kolo pokračuje od něj, platí-li pro načtený bod i záměry
  a není-li za teď; jinak počítá od bodu jako dřív. Uložení bodu, `stale` i chyba paměť tažení
  zahodí, skončená tažení se zapomenou na konci kola. Výsledek je tentýž (po kouscích = vcelku);
  zápis bodu, `CampaignLock`, bariéra a `outbox` beze změny – bod se ukládá stejně často.
- **Mřížky pochodu napříč koly** (`MarchGridMemo` v `domain/war/march-grid.ts`,
  `CampaignWorld.grids`): klíč = identita krajiny, překážek a stavu vsi a den (dva nejnovější dny).
  Paměť workeru dá vsi téže verze a jména tentýž objekt stavu (`recallVillage`; vsi, které kolo
  nenačetlo, zapomene), krajiny a mapy prázdných políček jsou sdílené (`createCampaignCells`).

Zbývá **kopie celého stavu v každém taktu** (`structuredClone` v `campaignTick`, ≈ 45 % vzorků)
a čtení bodu z JSON (≈ 35 %). Kopii na hranici kola **neodstraňujeme** (návrh Clauda): cíl je
splněn s rezervou 5×, zisk by byl ≈ 2 % jádra a takt by přišel o zahození rozpracované kopie,
když mu uprostřed chybí mapa nebo ves (`MissingData`) – bez kopie by se musel přepočítat znovu
od začátku volání a upozornění taktu by sdílela objekty se stavem, který další takty mění.

**Načítání vsí z databáze** (7. 11. 2026). Měření v paměti výš to nezachytí: každé kolo (1× za
sekundu) načetlo celé stavy vsí, kterých se tažení týká – mapa políčka (`listBySettlement`), ves
pro takt (`find`) a vlastník vsi (`watcherOf` – `find`) –, tedy u velké vsi ≈ 3 × 3 MB na tažení
a kolo, i když paměť workeru měla tentýž stav. Teď se kolo ptá jen na otisky:

- `computeCampaign` → `loadVillages`: vsi, které paměť workeru zná, nejdřív levným dotazem
  `VillageRepository.stampsOfVillages(ids)` (id, sídlo, jméno, verze, `last_day` bez stavu);
  celý stav (`find`) jen u vsi, kterou paměť nemá nebo má jinou verzi či jméno. Každý zápis stavu
  verzi zvedá (uložení i post do schránky – i události tažení samotného), přejmenování mění
  jméno, takže výsledek je tentýž jako s `find` u každé vsi; bez paměti (web, testy) `find` jako
  dřív.
- `villageWatchers` (vlastník a průchod) a `deliver` (existuje ves?) jen přes `stampsOfVillages`,
  mapa políčka se sídlem (`createCampaignCells`) bere id vsí z `stampsOf([sídlo])`.

`apps/worker/scripts/measure-campaign-db.ts` – nad skutečnou databází `bohemia_measure` (nikdy
`bohemia` pro zápis; zdrojová ves = největší ves `bohemia`, jen čtení): 20 tažení × 60 mužů, každé
u vlastní kopie velké vsi (nájezd), tažení a body v paměti, vsi, sídla, rody a vazalství z DB,
s pamětí workeru. Za kolo (4 takty) skutečný čas a bajty přečtené ze spojení poolu. Ves `bohemia`
mezitím dopočítává worker – `--source <soubor>` drží zdroj pro srovnání před / po (otisk bodů musí
sedět).

```bash
nice npx tsx apps/worker/scripts/measure-campaign-db.ts --rounds 20 --source /tmp/zdroj.json
```

Změřeno 7. 11. 2026 (ves 3,11 MB, 20 tažení, 20 kol; „další kola“ = průměr kol 2–20; otisk bodů
před i po `e79f0cb0`):

| kolo       |             před |                 po |
| ---------- | ---------------: | -----------------: |
| 1. kolo    | 3 824 ms, 311 MB |    1 574 ms, 62 MB |
| další kola | 1 673 ms, 187 MB | **178 ms, 3,4 MB** |

Před tím kolo trvalo déle než perioda smyčky (1 s). Zbylá data po zrychlení jsou skutečné změny:
uložení bodu po 40 taktech doručí události nájezdu do schránek vsí (verze +1) a další kolo vsi
jednou načte celé.
