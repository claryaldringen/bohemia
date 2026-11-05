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
  `WORKER_IDLE_MS` (5000), `WORKER_PAUSE_MS` (20), `WORKER_LANDSCAPES` (128), `WORKER_LOG`
  (`info` / `debug`).
- Produkce (PM2 vedle Next, bez Caddy) se řeší až s `docs/deployment.md`.

## Soubory

- `src/main.ts` – skládání: pool hlavní a pool zámků (`WORKER_LOCK_POOL_SIZE` = 2),
  `createGameDeps` (obsahuje i `queue` = `createWorldQueue`), signály, zavření poolů.
- `src/loop.ts` – `runLoop(deps, options, signal)`: kolo `advanceWorldStep` → při práci pauza
  `pauseMs`, při `idle` spánek `nextWakeMs`; souhrn do logu jednou za minutu; chyba kola ani jednoho
  hráče smyčku nezastaví. Hodiny, spánek i krok se v testech nahrazují (`LoopDeps`). Mezi koly pouští
  `runWorldTasks` (kredity nástupnictví, `world.md`) nejvýš jednou za minutu (`WORLD_TASKS_MS`, podle
  hodin `deps.now`); jejich chyba kolo nezastaví.
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
  hodinami, `signalHandler`.
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
  o pár dní po dni vsi. `VILLAGE_DIGEST_VERSION` = tvar; jiný tvar se nepoužije.
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
