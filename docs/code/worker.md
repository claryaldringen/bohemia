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
  hráče smyčku nezastaví. Hodiny, spánek i krok se v testech nahrazují (`LoopDeps`).
- `src/wake.ts` – `nextWakeMs` (do 1 s po začátku dalšího herního dne, nejvýš `idleMs`) a
  `SkipTable` (odklady: zámek ve webu 2 s, chyba 1 min zdvojováním do 15 min; use-case dostane
  množinu `skip`).
- `src/config.ts`, `src/log.ts` – env → konfigurace (chyby česky), řádky `[worker] HH:MM:SS – …`.
- `src/signals.ts` – `signalHandler`: první signál zastaví smyčku, opakovaný ukončí proces hned.

## Ukončení

První SIGINT / SIGTERM dokončí rozpočítanou dávku, zavře pooly (zámky padnou se spojením) a vypíše
„worker skončil“; druhý signál skončí hned. Jedno Ctrl + C v terminálu přijde víckrát (dostane ho
celá skupina procesů a `tsx` ho přepošle) – signál do `REPEATED_SIGNAL_MS` (1 s) po prvním patří
témuž stisku a ignoruje se. Pod `npm run dev` ukončuje dítě i `tsx watch`: na opakovaný signál ho
po chvíli zabije („Force killing…“) – ověřeno 1. 11. 2026, worker stihl dávku dokončit a vypsat
„worker skončil“; nedokončená dávka by se jen zahodila (zámek padne se spojením).

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
