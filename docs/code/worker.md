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

## Ukončení

První SIGINT / SIGTERM dokončí rozpočítanou dávku, zavře pooly (zámky padnou se spojením) a vypíše
„worker skončil“; druhý signál skončí hned.
