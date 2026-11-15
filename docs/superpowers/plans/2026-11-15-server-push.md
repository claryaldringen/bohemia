# Události ze serveru místo dotazování – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prohlížeč se přestane pravidelně ptát na ves, výpravy, jezdce na mapě, válku ve scéně, tažení, varování i průběh přeskoku času. Server mu jedním spojením SSE pošle událost, jakmile se uloží něco, co hráč vidí. Když se nic nezmění, nejde žádný dotaz.

**Architecture:**

- **Oznámení:** zápis do tabulek `village`, `settlement`, `player_notice`, `journey(_checkpoint)` a `campaign(_checkpoint)` spustí trigger v Postgresu. Trigger pošle `pg_notify('bohemia_change', …)` s druhem změny, id, verzí a tím, koho se změna může týkat (vlastník, políčka, varované vsi).
- **Rozesílání:** každý proces webu drží jedno spojení s `LISTEN` (`packages/db`). Rozbočovač (`apps/web/lib/server-events/`) rozešle změnu po spojeních `GET /api/events` (Route Handler, `text/event-stream`).
  - Ves, upozornění a varování: jen signál. Prohlížeč si rozdíl dočte stávající server action.
  - Výpravy, jezdci, tažení a válka: rovnou stav, spočtený týmiž funkcemi jako dnešní routes.
- **Beze změny:** doména, use-casy ani worker.

**Tech Stack:** PostgreSQL 17 (LISTEN/NOTIFY, plpgsql triggery), `pg` 8, Next.js 16 Route Handler se streamem, `EventSource`, React 19, Vitest, Playwright.

**Spec:** Rozhodnutí Martina 15. 11. 2026 (zadání plánu, citace v Global Constraints). Je to technická změna, ne herní mechanika, proto bez návrhu v `docs/design/`.

- Mapa kódu:
  - `docs/code/web-ui.md` – Dotazování na ves, Dotazování na tažení, Cizí mapa ve scéně, e2e;
  - `docs/code/journey.md` – Web, Worker;
  - `docs/code/war.md` – Ve scéně – napojení na hru, Hráč ve vsi a mimo ni;
  - `docs/code/worker.md`.
- Navazuje na opravu D62/D63 (větev `fix/no-blocking-polls`), která se sloučí dřív.

## Global Constraints

- **Martin 15. 11. 2026:** „Ale obecně by klient neměl tyhle věci periodicky pollovat, ale server by je měl pushovat“. Na návrh Clauda (SSE + LISTEN/NOTIFY): „ano“. Ze zadání platí doslova:
  - jedno spojení prohlížeče přes SSE (`text/event-stream`), žádný zvláštní WebSocket server;
  - zdroj událostí je Postgres LISTEN/NOTIFY – jedno LISTEN spojení na proces webu, události jen hráčům, kterých se týkají;
  - u pohybu (výprava, vojsko) událost nese stav; u pohledu vsi si prohlížeč dočte jen změnu (`known`, `pieces`); bez události se neptá;
  - pojistka: po výpadku se prohlížeč připojí znovu, do té doby jedno kolo dotazů za 30 s (`FALLBACK_MS = 30_000`).
- **Hexagon:** `packages/game` (doména i use-casy) se nemění.
  - Oznamování je jen v `packages/db` (migrace, posluchač) a ve vstupním bodu `apps/web`.
  - `apps/worker` se nemění – jeho zápisy oznamují triggery.
- **Server je autorita:**
  - Stav do událostí počítají tytéž funkce jako routes: `expeditionViewsForPlayer`, `expeditionVisitorsOnVillage` (`lib/journey.ts`), `campaignViewForPlayer` (`lib/campaign.ts`), `warSceneForPlayer` a `warSceneOnMapForPlayer` (`lib/war-scene.ts`).
  - Odběr podle id (ves, tažení, cizí mapa) se ověří při připojení. Hráč nedostane nic, co by přes route neviděl.
- **NOTIFY ≤ 8000 B:** trigger posílá jen id, verzi a směrování. Náklad nad 7900 B nahradí krátkým `{ k, id, t, p, big: true }`.
- **Next 16:**
  - Route Handler běží ve výchozím `runtime` `nodejs`. Dynamický je už čtením `headers()` (session), nic dalšího se neexportuje (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/`).
  - Hlavičky SSE:
    - `Content-Type: text/event-stream; charset=utf-8`;
    - `Cache-Control: no-cache, no-transform` – komprese Next.js odpověď s `no-transform` přeskočí, viz `next/dist/compiled/compression`;
    - `X-Accel-Buffering: no`.
- **Migrace:** vlastní SQL (`cd packages/db && npx drizzle-kit generate --custom --name=change_notify`), příkazy oddělené `--> statement-breakpoint` jako v ostatních migracích. Číslo podle `drizzle/meta/_journal.json` v okamžiku práce.
  - Agent úlohy do databáze `bohemia` nemigruje – po sloučení to udělá hlavní session se zálohou. `bohemia_test` migrují testy samy.
- **Před commitem** projde `npm run typecheck`, `npm run lint`, `npm run test` a `npm run format:check`.
  - Úloha 1 navíc `npm run test:db`.
  - Úlohy 2–6 navíc `npm run test:e2e`. Běží sériově; souběžně z víc pracovních stromů jen s jiným `E2E_PORT` a `TEST_DATABASE`.
  - Změna v `docs/code` vyžaduje `npm run check:docs`.
- **Docs:**
  - Nový soubor `docs/code/server-events.md` s řádkem v tabulce Mapa kódu v `CLAUDE.md`. Každá úloha doplní svou sekci.
  - Texty česky s „–“, vlastní rozhodnutí jako „návrh Clauda“.
- **Commity:** Conventional Commits česky.

## Rozhodnutí plánu (návrh Clauda)

1. **Oznamují triggery v databázi, ne kód adaptérů.**
   - Oznámí tak každá cesta zápisu: web, worker, budoucí adaptéry i e2e pomocníci, kteří zapisují stav vsi, bodu výpravy a bodu tažení přímo SQL (`changeVillageStateById`, `INSERT INTO campaign_checkpoint` v `multiplayer-war.spec.ts`, `UPDATE journey_checkpoint` v `journey-helpers.ts`).
   - NOTIFY se doručí až po commitu, rollback nic nepošle.
   - Čtení JSON bodu v SQL má předlohu v `adapters/village-holds.ts`.
   - Při ≈ 35 uloženích vsí za sekundu (1000 hráčů × 3 vsi za herní den) je režie zanedbatelná. Serializaci commitů s NOTIFY se vyplatí změřit až při zátěži.
2. **Jeden kanál `bohemia_change`, druh v klíči `k`:**

   | `k` | Kdy                                                                    | Náklad                                                      |
   | --- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
   | `v` | ves vložena, nebo změněna `version`, `name`, `settlement_id`           | `{ k, id, ver, p }` – `p` = `settlement.owner_id`           |
   | `s` | sídlo vloženo, změněn `owner_id` nebo `archived_at`                    | `{ k, p, op }` – nový a starý vlastník (vložení: `op` null) |
   | `n` | vloženo upozornění                                                     | `{ k, p }`                                                  |
   | `j` | bod výpravy vložen, nebo změněn `tick`/`state`; výprava změní `status` | `{ k, id, t, p, c }` – `t` null u změny `status`            |
   | `c` | bod tažení vložen, nebo změněn `tick`/`state`; tažení změní `status`   | `{ k, id, t, c, a }`                                        |
   | `x` | průběh přeskoku času (posílá web, ne trigger)                          | `{ k, p, progress }`                                        |
   - `c` = políčka `[x, y]`: skupiny, běžící poslové (jako `cells` ve `village-holds.ts`) a skupiny uprchlíků (`alarm.flights[*].cell`).
   - `a` = varované vsi (`alarm.villages[*].villageId` a `hosts`) a cíl `target.villageId`, jen uuid.
     _Změna po revizi úlohy 5:_ jen vsi, které o tažení vědí – varované od `warnTick` ≤ takt bodu a cíl
     jen s bitvou (`state.battle`); `hosts` ne (docs/code/server-events.md – Oznámení v databázi).
   - U UPDATE je `c` i `a` sjednocení starého a nového stavu. Odchod z mapy tak dostane událost bez paměti rozbočovače.
   - Samotný `outbox` (`clearOutbox`) neoznamuje.

3. **Signál, nebo stav** – události SSE:

   | Událost    | Náklad                                                   | Prohlížeč                                          |
   | ---------- | -------------------------------------------------------- | -------------------------------------------------- |
   | `sync`     | `{ protocol }`                                           | po připojení s mezerou dočte vše, co ukazuje       |
   | `village`  | `{ villageId, version }`                                 | `getVillageView` s `known`/`pieces` (dnešní cesta) |
   | `notices`  | `{}`                                                     | `getVillageView` s `withNotices`                   |
   | `alarm`    | `{ villageId }`                                          | `getAlarmView`                                     |
   | `journeys` | `{ views }`                                              | stav rovnou                                        |
   | `visitors` | `{ villageId, visitors }`                                | stav rovnou                                        |
   | `campaign` | `{ campaignId, view }`                                   | stav rovnou                                        |
   | `war`      | `{ key, war }` – `settlement:<id>` nebo `scene:<id>@x,y` | stav rovnou                                        |
   | `skip`     | `{ progress }`                                           | stav rovnou                                        |
   - Dnešní routes (`/api/journey`, `/api/war-scene/…`, `/api/campaign/…`, `/api/dev/skip-progress`) zůstávají pro dotaz po otevření, po `sync` a pro pojistku.

4. **Komu.** Spojení má rozsah `ConnectionScope` – hráč a zobrazená ves s jejím sídlem a políčkem světa. Volitelně k tomu otevřená mapa tažení a cizí mapa ve scéně.
   - **Ověření při připojení:**
     - ves – vlastník, nebo hráčův správce (jako `stewardAccess` v `application/rights.ts`), jinak 403;
     - tažení a cizí mapa – id mezi `campaigns.activeOf(hráč)`, jinak se ta část rozsahu tiše zahodí (tažení mohlo právě skončit).
   - **Směrování:**
     - `v` a `s` jdou hráči `p` (`op`) a spojení se zobrazenou vsí `id`;
     - `n` a `x` jdou hráči `p`;
     - `j` – výpravy vlastníkovi a jezdci spojením, jejichž políčko je v `c`;
     - `c` – pohled tažení spojením s tímto tažením;
     - `c` – válka cizí mapy spojením s touto mapou;
     - `c` – válka vlastní mapy spojením, kde je políčko v `c` nebo ves v `a`;
     - `c` – signál `alarm` spojením se vsí v `a`;
     - `big` – `c` a `a` platí jako „všechna spojení s políčkem / vsí“.
5. **Méně dotazů a výpočtů:**
   - `VillageView.versions` (verze vsí hráče z `status.villages`) – událost s verzí, kterou prohlížeč už má, se zahodí. Vlastní akce tak nevyvolá druhý dotaz.
   - Prohlížeč i rozbočovač slučují nárazy: jeden běh naráz, nejvýš jeden další po něm, server navíc vyčká `COALESCE_MS = 50`.
   - Rozbočovač počítá stav jednou na hráče a předmět a pošle ho jen při změně klíče (takt, seznam jezdců). Prohlížeč dál zahazuje starší takt.
6. **Spojení jen ve viditelném panelu** – stejně jako dnes `usePolling`; také kvůli limitu 6 spojení HTTP/1.1 na původ.
   - Otevřené spojení je přítomnost hráče. `notePlayerActive` se volá při připojení a v každém tepu (`SSE_HEARTBEAT_MS = 20_000`).
     - Nahrazuje dotazy `/api/war-scene` po 5 s, ze kterých dnes přítomnost plyne (war.md – Hráč ve vsi a mimo ni).
     - `absentTicks` je 1 herní den (≈ 86 s), tep 20 s ho bezpečně drží.
   - Spojení s otevřeným tažením posílá v tepu záměr `presence` (dnešní maják `PRESENCE_EVERY_MS` po 20 s z prohlížeče).
   - Nejvýš `MAX_CONNECTIONS_PER_PLAYER = 4` spojení na hráče, nejstarší se zavře.
7. **Pojistka:**
   - Server pošle `retry: 3000`. Po trvalé chybě (`readyState` CLOSED – 401, 403, restart) se prohlížeč připojuje sám s odklady 1, 2, 5, 10 a 30 s.
   - Dokud spojení není otevřené, zavolá po 30 s a pak každých 30 s všechny obnovy (jedno kolo dotazů).
   - Rozbočovač po obnově LISTEN pošle `sync` všem spojením (mezitím mohl o událost přijít).
   - Změna rozsahu (otevření tažení) otevře nové spojení. Staré zavře až po jeho `sync`, takže mezera nevznikne a obnova všeho se nevolá.
8. **Den bez workeru:**
   - Když do `DAY_CHECK_GRACE_MS = 10_000` po začátku dalšího herního dne nepřijde pohled nového dne, prohlížeč se jednou zeptá. Platí pro `npm run dev:web`, e2e projekt `chromium` (záložní cesta „web dopočítává sám“) a pro přetíženého workera.
   - Se zdravým workerem událost přijde dřív (worker se budí do 1 s po začátku dne), takže se dotaz nepošle.
9. **Verze protokolu** `SERVER_EVENTS_PROTOCOL = 1` v `sync`. Jiná verze (starý kód v prohlížeči po nasazení) vede k `location.reload()`.
10. **Session:**
    - Ověří se při připojení. Pak každých `SESSION_RECHECK_MS = 300_000` z cookie zachycené při připojení; neplatná session spojení zavře.
    - Další pokus dostane 401. Pojistka po 30 s ukáže chybu jako dnes (`pushNotice`).
11. **Dev a nasazení:**
    - Rozbočovač je jedináček v `globalThis[Symbol.for('bohemia.server-events')]` a přežije HMR. Změna jeho kódu v dev chce restart `npm run dev`.
    - Víc procesů webu funguje samo, NOTIFY dostane každý.
    - Za Caddy (až s `docs/deployment.md`):
      - `reverse_proxy` musí SSE propouštět bez bufferování; ověřit, že `encode` odpovědi `/api/events` nedrží, jinak tuto cestu z `encode` vyjmout;
      - LISTEN potřebuje přímé spojení s Postgresem (ne PgBouncer v režimu transakcí);
      - HTTP/2 odstraní limit 6 spojení.
12. **Neoznamuje se:**
    - schránka vsi (`village_inbox`), záměry tažení a výprav (`*_intent`) a jednání – hráč je vidí až po uložení vsi nebo bodu, a to oznámí samo;
    - panely bez dnešního dotazování (Rod a vazalové, Kronika) zůstávají, jak jsou.
13. **e2e:**
    - Triggery oznámí i přímé zápisy testů, takže háček `pollVillage` (≈ 60 volání) zůstává beze změny jako „zeptej se hned“ – záloha, ne nutnost.
    - Nové háčky: `serverEvents` (stav spojení, počet událostí) a `dropServerEvents` (výpadek).
    - E2e svět je pomalý (herní den ≈ 4,8 h), takže den se v testu nezmění.

## Review Focus

1. **Událost ztracená v mezeře** (obnova LISTEN, nové spojení, výměna rozsahu) by nechala zastaralý pohled do dalšího dne.
   - Úloha 1: posluchač po přerušení zavolá `onReconnect`.
   - Úloha 2: `resync()` pošle `sync` všem spojením.
   - Úloha 3: mezera → obnovy, výměna bez mezery → žádné.
2. **Náraz událostí** (worker uloží 5 vsí hráče v jedné dávce, výprava se ukládá každou sekundu) nesmí vyvolat nával dotazů.
   - Úloha 3: 10 událostí `village` za 50 ms → nejvýš 2 `getVillageView`.
   - Úloha 2: 10 běhů slučovače za 50 ms → nejvýš 2 výpočty.
   - Úloha 4: 5 změn výpravy → nejvýš 2 výpočty.
3. **Odběr cizího id** (ves, tažení, cizí mapa jiného hráče) nesmí nic prozradit.
   - Úloha 2: cizí ves → 403; cizí tažení v rozsahu se zahodí a spojení nedostane `campaign` ani `war` téhož tažení.
4. **Bufferování v produkčním buildu** (komprese Next.js, později proxy) by poslalo události pozdě a najednou.
   - Úloha 2: e2e nad `next start` – změna vsi dorazí do 2 s, hlavička `Cache-Control` obsahuje `no-transform`.
5. **Svět bez workeru** (dev:web, e2e `chromium`) – ves by bez události stála.
   - Úloha 3: bez události přesně jeden dotaz v okamžiku začátku dne + 10 s; s událostí před tím žádný; ve skrytém panelu žádný.

---

### Task 1: Oznámení v databázi a posluchač (Sonnet)

**Files:**

- Create: `packages/db/drizzle/00NN_change_notify.sql` – záznam v `drizzle/meta/_journal.json` vytvoří `drizzle-kit generate --custom`.
- Create: `packages/db/src/changes.ts`, export v `packages/db/src/index.ts`.
- Create: `packages/db/src/adapters/change-listener.ts`, export v `adapters/index.ts`.
- Test:
  - `packages/db/src/__tests__/changes.test.ts` (unit);
  - `packages/db/src/adapters/__tests__/change-notify.db.test.ts`;
  - `packages/db/src/adapters/__tests__/change-listener.db.test.ts`.
- Docs:
  - Create `docs/code/server-events.md` – sekce „Oznámení v databázi“ (tabulka z Rozhodnutí 2);
  - `CLAUDE.md` – řádek tabulky Mapa kódu („události ze serveru – triggery a kanál, posluchač, rozbočovač a `/api/events`, klient, pojistka, měření, nasazení“);
  - `docs/code/worker.md` – Soubory: jedna věta, že zápisy workeru oznamují triggery.

**Interfaces:**

- Produces:
  - `CHANGE_CHANNEL = 'bohemia_change'`, `type Cell = [number, number]`.
  - `type DbChange` – druhy:
    - `{ k: 'v'; id: string; ver: number; p: string | null }`
    - `{ k: 's'; p: string; op: string | null }`
    - `{ k: 'n'; p: string }`
    - `{ k: 'j'; id: string; t: number | null; p: string; c: Cell[]; big: boolean }`
    - `{ k: 'c'; id: string; t: number | null; c: Cell[]; a: string[]; big: boolean }`
    - `{ k: 'x'; p: string; progress: { doneDays: number; totalDays: number } | null }`
  - `parseChange(text: string): DbChange | null` – neznámý druh nebo vadný tvar vrátí null; `big` bez `c`/`a` dá prázdná pole.
  - `notifyChange(db: Executor, change: DbChange): Promise<void>` – `SELECT pg_notify(…)`; v plánu ji volá jen Úloha 6.
  - `listenChanges(url: string, handlers: { onChange(change: DbChange): void; onReconnect(): void; onError?(error: Error): void }, options?: { retryMs?: readonly number[]; applicationName?: string }): ChangeListener`
    - `ChangeListener = { ready: Promise<void>; close(): Promise<void> }`.
    - Vlastní `pg.Client` (`keepAlive`, `application_name` výchozí `bohemia-change-listener`), `LISTEN bohemia_change`.
    - Po chybě nebo konci spojení se připojí znovu s odklady `[1000, 2000, 5000, 10000, 30000]` (poslední se opakuje). Po úspěšném novém `LISTEN` zavolá `onReconnect`; po prvním připojení ne.
    - Vadný náklad zahodí přes `onError`.
- Migrace: pomocné funkce a triggery:
  - `bohemia_change_cells(state jsonb)` a `bohemia_change_alarmed(state jsonb)` – pole bez opakování podle Rozhodnutí 2.
  - Triggery:
    - `village_change_notify_ins` a `village_change_notify_upd` – UPDATE s `WHEN (OLD.version IS DISTINCT FROM NEW.version OR OLD.name IS DISTINCT FROM NEW.name OR OLD.settlement_id IS DISTINCT FROM NEW.settlement_id)`;
    - `settlement_change_notify` – `AFTER INSERT OR UPDATE OF owner_id, archived_at`;
    - `player_notice_change_notify` – `AFTER INSERT`;
    - `journey_checkpoint_change_notify` a `campaign_checkpoint_change_notify` – `AFTER INSERT OR UPDATE OF tick, state`;
    - `journey_change_notify` a `campaign_change_notify` – `AFTER UPDATE OF status`; `c`/`a` čtou z bodu.
  - Společné odeslání hlídá délku v bajtech, ne ve znacích:

```sql
CREATE OR REPLACE FUNCTION bohemia_change_notify(payload jsonb) RETURNS void AS $$
BEGIN
  IF octet_length(payload::text) > 7900 THEN
    payload := jsonb_strip_nulls(jsonb_build_object('k', payload->'k', 'id', payload->'id',
      't', payload->'t', 'p', payload->'p', 'big', true));
  END IF;
  PERFORM pg_notify('bohemia_change', payload::text);
END $$ LANGUAGE plpgsql;
```

- [ ] **Step 1: Failing testy**
  - `changes.test.ts`:
    - náklad `v` dá objekt;
    - `{"k":"c","id":"…","t":5,"big":true}` dá `c: [], a: [], big: true`;
    - `{"k":"q"}` a `nejson` dají null.
  - `change-notify.db.test.ts` – vlastní `pg.Client` s `LISTEN` sbírá náklady a filtruje je podle id řádků testu (jiné soubory zapisují souběžně):
    - `createVillageRepository(db).save` dá `{ k: 'v', id, ver: verze + 1, p: vlastník }`;
    - `rename` dá týž druh;
    - `save` s konfliktem verze (vrátí null) nic nepošle;
    - `NoticeRepository.post` dá `{ k: 'n', p }`;
    - změna `owner_id` sídla dá `{ k: 's', p: nový, op: starý }`;
    - výprava: `create` a `saveCheckpoint` se skupinou na `[3,4]` dají `c` `[[3,4]]` a `p`; posun na `[4,4]` dá `c` s oběma políčky; `clearOutbox` nic nepošle;
    - tažení: bod se skupinou na `[1,1]`, běžícím poslem na `[2,1]`, uprchlíky na `[2,2]`, varovanou vsí V a cílem T dá `c ⊇ {[1,1],[2,1],[2,2]}` a `a ⊇ {V, T}`; konec (`status` `done`) dá `t: null`;
    - 300 varovaných vsí dá `big: true` a náklad ≤ 7900 B;
    - transakce s rollbackem nic nepošle.
  - `change-listener.db.test.ts`:
    - `onChange` dostane změnu po `save`;
    - po `pg_terminate_backend` spojení posluchače (najde se podle `applicationName` testu v `pg_stat_activity`) se zavolá `onReconnect` a další změna zase dorazí;
    - `close()` skončí bez dalšího pokusu.
- [ ] **Step 2:** Ověř, že testy padají:
  - `cd packages/db && npx vitest run src/__tests__/changes.test.ts` → FAIL;
  - `npx vitest run --config vitest.db.config.ts change` → FAIL (chybí moduly a migrace).
- [ ] **Step 3: Implementace** – migrace, `changes.ts`, `change-listener.ts`.
- [ ] **Step 4:** Oba příkazy z kroku 2 → PASS. Pak celé `npm run test:db` – triggery nesmí rozbít žádný test adaptérů.
- [ ] **Step 5:** Docs, kontroly z Global Constraints, commit `feat(db): oznámení změn přes LISTEN/NOTIFY – triggery a posluchač`.

### Task 2: Rozbočovač a `/api/events` (Opus)

**Files:**

- Create (čisté, smí do prohlížeče): `apps/web/lib/server-events/protocol.ts`, `routing.ts`, `coalesce.ts`.
- Create (`import 'server-only'`): `apps/web/lib/server-events/hub.ts`, `scope.ts`, `stream.ts`, `pushers.ts`.
- Create: `apps/web/app/api/events/route.ts`.
- Test:
  - `apps/web/lib/server-events/__tests__/protocol.test.ts`, `routing.test.ts`, `coalesce.test.ts`, `hub.test.ts`, `stream.test.ts`, `scope.test.ts`;
  - e2e `apps/web/e2e/server-events.spec.ts` (kouř).
- Docs:
  - `docs/code/server-events.md` – Rozbočovač, Spojení `/api/events`;
  - `docs/code/war.md` – Hráč ve vsi a mimo ni: přítomnost zapisuje tep spojení, `/api/war-scene` už jen při dotazu.

**Interfaces:**

- Consumes (Úloha 1): `DbChange`, `listenChanges`.
- Produces:
  - `protocol.ts`:
    - `SERVER_EVENTS_PROTOCOL = 1`, `EVENTS_PATH = '/api/events'`.
    - `interface EventScope { villageId: string | null; campaignId: string | null; scene: { campaignId: string; cell: GridCell } | null }`.
    - `eventsUrl(scope): string` – `/api/events?village=<id>&campaign=<id>&scene=<id>@<x>,<y>`; prázdné části vynechá, pořadí je pevné.
    - `parseEventScope(params: URLSearchParams): EventScope | null` – id jen uuid, políčko `-?\d{1,4}`; cokoli jiného vrátí null.
    - `interface ServerEvents` – klíče a náklady z tabulky v Rozhodnutí 3. Typy `ExpeditionView`, `ExpeditionVisitor`, `CampaignView`, `WarSceneView` a `ComputeProgress` se jen importují.
    - `type ServerEventName = keyof ServerEvents`.
    - `formatServerEvent<K extends ServerEventName>(name: K, data: ServerEvents[K]): string` – `event: …\ndata: <json>\n\n`.
    - `warKeyOfSettlement(settlementId): string`, `warKeyOfScene(campaignId, cell): string`.
  - `routing.ts`:
    - `interface ConnectionScope { playerId: string; villageId: string | null; settlementId: string | null; cell: GridCell | null; campaignId: string | null; scene: { campaignId: string; cell: GridCell } | null }`.
    - `type ComputeTask` – varianty:
      - `{ what: 'journeys'; playerId }`
      - `{ what: 'visitors'; playerId; villageId }`
      - `{ what: 'campaign'; playerId; campaignId }`
      - `{ what: 'war-home'; playerId; settlementId }`
      - `{ what: 'war-scene'; playerId; campaignId; cell }`
    - `computeKey(task): string`.
    - `routeChange(change: DbChange, sinks: Iterable<{ id: number; scope: ConnectionScope }>): { signals: { sinkId: number; name: 'village' | 'notices' | 'alarm' | 'skip'; data: unknown }[]; computes: ComputeTask[] }` – výpočty bez opakování podle `computeKey`, pravidla z Rozhodnutí 4.
  - `coalesce.ts`: `createCoalescer({ delayMs, onError }): { run(key: string, task: () => Promise<void>): void }` – start po `delayMs`, jeden běh na klíč naráz, během běhu nejvýš jeden další.
  - `hub.ts`:
    - `interface Sink { id: number; scope: ConnectionScope; send(name: ServerEventName, data: unknown): void; close(): void }`.
    - `type Computers = Partial<Record<ComputeTask['what'], (task: ComputeTask) => Promise<{ name: 'journeys' | 'visitors' | 'campaign' | 'war'; data: unknown; key: string }>>>`.
    - `createHub(deps: { computers: Computers; coalesceMs: number; log(line: string): void }): Hub`.
      - `Hub = { add(sink: Omit<Sink, 'id'>): Sink; remove(id: number): void; dispatch(change: DbChange): void; resync(): void; size(): number }`.
      - Výsledek výpočtu jde spojením hráče se shodným předmětem jen při změně `key` proti naposled poslanému; první výsledek jde vždy.
      - Paměť klíčů hráče se smaže s jeho posledním spojením.
      - Úloha bez počítadla se přeskočí. Chyby se do logu píšou s předponou `[events]`, stejná nejvýš jednou za minutu.
    - `serverEventsHub(): Hub` – jedináček podle Rozhodnutí 11; při prvním volání spustí `listenChanges(databaseUrl(process.env), { onChange: hub.dispatch, onReconnect: hub.resync })`.
    - `MAX_CONNECTIONS_PER_PLAYER = 4`, `COALESCE_MS = 50`.
  - `pushers.ts`: `serverComputers(): Computers` – zatím prázdné, Úlohy 4 a 5 doplní.
  - `scope.ts`: `resolveConnectionScope(deps: ScopeDeps, playerId: string, scope: EventScope): Promise<ConnectionScope | 'forbidden'>`
    - `ScopeDeps` = porty `villages` (`stampsOfVillages`), `settlements` (`find`), `stewardships` (`of`), `houses` (`activeOf`), `campaigns` (`activeOf`). Route je předá z `gameDeps()`, test v paměti.
    - Ves: `stampsOfVillages([id])` → `settlements.find` → vlastník, nebo správce (`kind 'player'` a dům hráče); jinak `'forbidden'`.
    - `cell` = `settlement.worldCell` (odříznuté sídlo null). Stav vsi se nenačítá.
    - Tažení a cizí mapa: id mezi `campaigns.activeOf(playerId)`, jinak null.
  - `stream.ts`: `openEventStream(input: { hub: Hub; scope: ConnectionScope; signal: AbortSignal; onHeartbeat(): Promise<void>; sessionValid(): Promise<boolean> }): ReadableStream<Uint8Array>`
    - Konstanty: `SSE_RETRY_MS = 3_000`, `SSE_HEARTBEAT_MS = 20_000`, `SESSION_RECHECK_MS = 300_000`, `MAX_QUEUED_BYTES = 1_048_576` (fronta `ByteLengthQueuingStrategy`).
    - Pořadí: `retry: 3000`, `hub.add`, `sync`, hned `onHeartbeat`.
    - Tep: `: ping` + `onHeartbeat`. Kontrola session; při neplatné zavře.
    - Úklid (`hub.remove`, časovače) při `abort`, `cancel`, chybě zápisu a frontě nad mez – jen jednou.
  - `route.ts`: `GET(request: Request): Promise<Response>`
    - Bez session 401 (JSON jako `/api/journey`), vadný dotaz 400, `'forbidden'` 403.
    - Jinak stream s hlavičkami z Global Constraints.
    - `onHeartbeat` = `notePlayerActive(playerId)`.
    - `sessionValid` = `getAuth().api.getSession({ headers: new Headers({ cookie }) }) !== null`, s cookie zachycenou při připojení.

- [ ] **Step 1: Failing testy**
  - `protocol.test.ts`:
    - `eventsUrl` → `parseEventScope` vrátí totéž;
    - `scene=x@1,2` a `village=../a` dají null;
    - `formatServerEvent('alarm', { villageId })` je přesně `event: alarm\ndata: {"villageId":"…"}\n\n`.
  - `routing.test.ts` – každý řádek Rozhodnutí 4:
    - `v` jde vlastníkovi i správci se zobrazenou vsí;
    - `s` jde `p` i `op`;
    - `j` dá výpočet `journeys` jen připojenému vlastníkovi a `visitors` jen spojením s políčkem v `c`;
    - `c` dá `campaign`, `war-scene`, `war-home` (políčko i ves v `a`) a `alarm`;
    - `big` platí pro všechna spojení s políčkem nebo vsí;
    - spojení dvou panelů téhož hráče s toutéž vsí dá jeden výpočet.
  - `coalesce.test.ts` (falešné hodiny):
    - 10 volání za 50 ms dá ≤ 2 běhy;
    - chyba běhu zavolá `onError` a další volání běží.
  - `hub.test.ts`:
    - `dispatch` pošle signály správným spojením;
    - stejný `key` podruhé nejde;
    - páté spojení hráče zavře nejstarší;
    - `resync` pošle `sync` všem.
  - `stream.test.ts` (falešné hodiny a hub):
    - první bajty jsou `retry: 3000` a pak `event: sync`;
    - po 20 s `: ping` a druhé `onHeartbeat`;
    - `sessionValid` false po 5 min stream zavře a `hub.size()` je 0;
    - `abort` uklidí.
  - `scope.test.ts` (porty v paměti):
    - vlastní ves dá rozsah s `settlementId` a `cell`;
    - cizí ves dá `'forbidden'`;
    - ves spravovaná domem hráče dá rozsah;
    - cizí tažení v `campaignId` i `scene` dá null, vlastní běžící zůstane.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/server-events` → FAIL.
- [ ] **Step 3: Implementace.**
- [ ] **Step 4:** `npx vitest run lib/server-events` → PASS.
- [ ] **Step 5: e2e kouř** (`server-events.spec.ts`, produkční build) – hráč s vsí otevře v prohlížeči `new EventSource('/api/events?village=<id>')` a sbírá události:
  - do 2 s přijde `sync` s `protocol` 1;
  - `changeVillageStateById(id, (s) => s)` dá do 2 s `village` s `villageId`;
  - odpověď má `no-transform`;
  - cizí ves dá 403, bez přihlášení 401.

  Pak celé `npm run test:e2e`.

- [ ] **Step 6:** Docs, kontroly, commit `feat(web): události ze serveru – rozbočovač a /api/events`.

### Task 3: Klient – spojení, ves, upozornění a varování (Opus)

**Files:**

- Create:
  - `apps/web/lib/server-events/client.ts` – `ServerEventsClient`, bez Reactu;
  - `apps/web/hooks/use-server-events.ts` – kontext a hooky;
  - `apps/web/components/game/ServerEventsProvider.tsx`.
- Modify: `apps/web/app/game/page.tsx` – `VillageGame` obalí `ServerEventsProvider`.
- Modify: `apps/web/components/game/village-game/use-village-sync.ts` – bez `usePolling`.
- Create: `apps/web/lib/village-day-check.ts`, `apps/web/lib/village-events.ts`. Delete: `apps/web/lib/village-polling.ts` i `lib/__tests__/village-polling.test.ts`.
- Modify: `apps/web/lib/village-view-types.ts` (`VillageView.versions?`), `apps/web/lib/village.ts` – vedle `stamp` u vsí hráče (ř. ≈ 298).
- Modify: `apps/web/hooks/use-alarm.ts`; v `apps/web/lib/alarm-view.ts` smazat `ALARM_POLL_MS`, `ALARM_IDLE_POLL_MS`, `alarmPollMs` i jejich testy v `lib/__tests__/alarm-view.test.ts`.
- Modify: `apps/web/lib/e2e-hooks.ts` – `serverEvents`, `dropServerEvents`.
- Test:
  - `lib/server-events/__tests__/client.test.ts`;
  - `lib/__tests__/village-day-check.test.ts`, `lib/__tests__/village-events.test.ts`;
  - `hooks/__tests__/use-alarm.behavior.test.tsx` (nový);
  - `hooks/__tests__/server-events-test-utils.tsx` – falešný kontext s `emit(name, data)` a `resync()`, použijí ho i Úlohy 4–6;
  - e2e `server-events.spec.ts` doplnit.
- Docs:
  - `docs/code/server-events.md` – Klient, Pojistka, Den bez workeru;
  - `docs/code/web-ui.md` – sekci „Dotazování na ves“ přepsat na „Obnova pohledu vsi (události)“, včetně háčku `pollVillage`; „Rozhraní“ – `ServerEventsProvider` v pořadí hooků.

**Interfaces:**

- Consumes (Úloha 2): `EventScope`, `eventsUrl`, `ServerEvents`, `ServerEventName`, `SERVER_EVENTS_PROTOCOL`.
- Produces:
  - `client.ts`:
    - `FALLBACK_MS = 30_000`, `RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000]`, `SCOPE_DEBOUNCE_MS = 100`.
    - `interface EventSourceLike { readyState: number; onopen: (() => void) | null; onerror: (() => void) | null; addEventListener(name: string, fn: (e: { data: string }) => void): void; close(): void }`.
    - `class ServerEventsClient`:
      - `constructor(deps: { open(url: string): EventSourceLike; visible(): boolean; onVisibilityChange(fn: () => void): () => void; reload(): void; setTimer(fn: () => void, ms: number): unknown; clearTimer(timer: unknown): void })`;
      - metody: `start()`, `stop()`, `setScope(part: Partial<EventScope>)`, `on<K extends ServerEventName>(name: K, fn: (data: ServerEvents[K]) => void): () => void`, `onResync(fn: () => void): () => void`, `status(): 'open' | 'connecting' | 'off'`, `drop()`.
    - Chování podle Rozhodnutí 6, 7 a 9:
      - otevřené jen ve viditelném panelu;
      - po `sync` s mezerou zavolá `onResync`;
      - po trvalé chybě se připojí znovu s odklady;
      - dokud není otevřeno, volá `onResync` každých 30 s;
      - výměna rozsahu proběhne bez mezery;
      - jiná verze protokolu vede k `reload`.
  - Hooky:
    - `useServerEvent<K>(name: K, handler: (data: ServerEvents[K]) => void): void`;
    - `useEventScope(part: Partial<EventScope>): void` – při odpojení vrátí své klíče na null;
    - `useServerResync(refresh: () => void): void`.
  - `ServerEventsProvider({ children }: { children: ReactNode }): ReactElement`.
  - `village-day-check.ts`:
    - `DAY_CHECK_GRACE_MS = 10_000`;
    - `nextDayCheckMs(dayIndex: number | null, clock: WorldClock, nowMs: number): number | null` – začátek dne `dayIndex + 1` (`realTimeOf(dateOfDayIndex(…), clock)`) + grace − now, nejméně 0. Bez pohledu a poslední den světa null.
  - `village-events.ts`: `villageEventIsNews(view: VillageView | null, event: ServerEvents['village']): boolean` – false jen pro známou ves a verzi ≤ `view.versions[villageId]`.
  - `VillageView.versions?: Record<string, number>` – u spravované vsi chybí.
  - E2E háčky: `serverEvents?: () => { status: 'open' | 'connecting' | 'off'; received: number }`, `dropServerEvents?: () => void` (`client.drop()` – jako výpadek sítě).
- `useVillageSync` – rozhraní `VillageSync` zůstává:
  - `poll` se stane `refreshNow` se slučováním (jeden běh naráz, nejvýš jeden další po něm).
  - Během akce (`busyRef`) si zapamatuje `pendingRef`; `runAction` ho po akci spustí.
  - Obnova přijde na `village` (jen `villageEventIsNews`), `notices`, `useServerResync` a hlídač dne.
  - Hlídač dne: časovač `nextDayCheckMs` po každém novém pohledu; když se `dayIndex` nezměnil, zavolá obnovu. Jen ve viditelném panelu a bez `gameOver`.
  - `useEventScope({ villageId: view?.id ?? null })`.
  - `refresh` i háček `pollVillage` volají `refreshNow`.
- `useAlarm` – signatura beze změny. Dotaz jde:
  - hned při změně `villageId`;
  - na `alarm` téže vsi;
  - na `village` téže vsi, jen když `view !== null`;
  - na `sync` a `refresh`.

- [ ] **Step 1: Failing testy**
  - `client.test.ts` (falešný `EventSource`, hodiny a viditelnost) – každé pravidlo z rozhraní, zvlášť:
    - skrytý panel spojení zavře a nenechá žádný časovač;
    - odklady po chybě jsou 1 s, 2 s a 5 s;
    - `onResync` přijde po 30 s, po 60 s a po `open` už ne;
    - výměna rozsahu otevře nový zdroj až po 100 ms; starý zavře po `sync` nového, bez `onResync`;
    - `sync` s `protocol: 2` zavolá `reload`.
  - `village-day-check.test.ts`:
    - den 10 → začátek dne 11 + 10 s;
    - čas po začátku → 0;
    - null pro null a poslední den.
  - `village-events.test.ts`:
    - verze 7 při `versions[id] = 7` → false;
    - verze 8 → true;
    - `villageId: null` → true;
    - pohled bez `versions` → true.
  - `use-alarm.behavior.test.tsx`:
    - za 60 s falešného času bez události jde jen první dotaz;
    - `alarm` téže vsi → +1 dotaz, jiné vsi → 0;
    - `village` při `view` null → 0, jinak → +1.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/server-events/__tests__/client.test.ts lib/__tests__/village-day-check.test.ts lib/__tests__/village-events.test.ts hooks/__tests__/use-alarm.behavior.test.tsx` → FAIL.
- [ ] **Step 3: Implementace**
  - Provider vytvoří jeden `ServerEventsClient` (`new EventSource(url)`, `document.visibilityState`) a pustí ho v efektu.
  - `useVillageSync` a `useAlarm` podle rozhraní.
  - `versions` ve `lib/village.ts`.
- [ ] **Step 4:** Testy z kroku 2 → PASS. Pak `npx vitest run` celého webu – `village-polling` už nikdo neimportuje.
- [ ] **Step 5: e2e** – do `server-events.spec.ts` přidat:
  - „jméno vsi změněné v databázi se ukáže bez háčku“ – `UPDATE village SET name`, jméno v liště do 5 s, bez `pollVillage`;
  - „upozornění se ukáže samo“ – vložit upozornění druhu jako v `multiplayer.spec.ts`, text v řádcích upozornění do 5 s;
  - „výpadek spojení“ – `dropServerEvents()` → stav `connecting` → do 5 s `open` a druhý požadavek `/api/events`.

  Pak celé `npm run test:e2e` – `pollVillage` zůstává funkční.

- [ ] **Step 6:** Docs, kontroly, commit `feat(web): pohled vsi, upozornění a varování z událostí serveru`.

### Task 4: Výpravy a jezdci na mapě vsi (Sonnet)

**Files:**

- Create: `apps/web/lib/server-events/push-journeys.ts`, registrace v `pushers.ts`.
- Modify: `apps/web/lib/journey-view.ts`
  - `ticksOf` z `use-journey.ts` přesunout jako `expeditionsKey`, `visitorsKey` z `use-journey-visitors.ts` sem;
  - `JOURNEY_POLL_MS` a `VISITORS_IDLE_MS` nahradit `JOURNEY_PUSH_MS = 1_000` (kolo workeru, které ukládá jedoucí skupinu – journey.md, Worker).
- Modify: `apps/web/hooks/use-journey.ts`, `apps/web/hooks/use-journey-visitors.ts`.
- Test:
  - `hooks/__tests__/use-journey.behavior.test.tsx` a `use-journey-visitors.behavior.test.tsx` přepsat z dotazování na události;
  - `lib/server-events/__tests__/push-journeys.test.ts`;
  - `lib/__tests__/journey-view.test.ts` – klíče.
- Docs: `docs/code/journey.md` – Web, Scéna vsi; `docs/code/server-events.md` – Výpravy.

**Interfaces:**

- Consumes: `Computers`, `ComputeTask` (Úloha 2); `useServerEvent`, `useServerResync`, `server-events-test-utils.tsx` (Úloha 3).
- Produces:
  - `expeditionsKey(views: readonly ExpeditionView[]): string`, `visitorsKey(list: readonly ExpeditionVisitor[]): string`.
  - `createJourneyComputers(deps: { views(playerId: string): Promise<ExpeditionView[]>; visitors(playerId: string, villageId: string): Promise<ExpeditionVisitor[]> }): Pick<Computers, 'journeys' | 'visitors'>`
    - `journeys` → `{ name: 'journeys', data: { views }, key: expeditionsKey(views) }`;
    - `visitors` → `{ name: 'visitors', data: { villageId, visitors }, key: villageId + visitorsKey(visitors) }`;
    - `serverComputers` mu předá `expeditionViewsForPlayer` a `expeditionVisitorsOnVillage`.
  - `useExpeditions(running, onPartyEnded)` a `useJourneyVisitors(villageId, enabled)` – signatury i `ExpeditionsHandle` beze změny.
- Chování:
  - `useExpeditions`:
    - jeden `GET /api/journey`, když `running` začne platit, na `sync` (jen s `running`) a na `refresh`;
    - událost `journeys` se při `running` použije jako dnešní tělo `poll` po načtení – vytáhnout do `apply(views)`, včetně `onPartyEnded`;
    - rozpětí interpolace = `clamp(now − received, FRAME_MS, 4 × JOURNEY_PUSH_MS)`;
    - snímek po 100 ms zůstává (místní, bez sítě).
  - `useJourneyVisitors`:
    - jeden dotaz při zapnutí, změně vsi a `sync`;
    - `visitors` s jinou `villageId` se zahodí, stejný klíč se nepřekreslí.

- [ ] **Step 1: Failing testy**
  - `use-journey.behavior.test.tsx`:
    - za 60 s bez událostí jen dotaz při zapnutí;
    - `journeys` s novým taktem posune `latest`;
    - zmizelý hlouček zavolá `onPartyEnded`;
    - `running: false` událost ignoruje.
  - `use-journey-visitors.behavior.test.tsx`:
    - bez událostí jeden dotaz;
    - událost jiné vsi se zahodí;
    - prázdný seznam po neprázdném vrátí `[]`.
  - `push-journeys.test.ts`:
    - 5 změn téže výpravy přes rozbočovač s `coalesceMs` 50 dá ≤ 2 volání `views`;
    - stejný seznam jezdců podruhé nepřijde.
- [ ] **Step 2:** `cd apps/web && npx vitest run hooks/__tests__/use-journey lib/server-events/__tests__/push-journeys.test.ts lib/__tests__/journey-view.test.ts` → FAIL.
- [ ] **Step 3: Implementace.**
- [ ] **Step 4:** Testy z kroku 2 → PASS.
- [ ] **Step 5:** `npm run test:e2e` – hlavně `expeditions.spec.ts` a `journey-worker.spec.ts` (projekt `worker`; výprava se rozjede do 2 s po rozkazu jako dnes).
- [ ] **Step 6:** Docs, kontroly, commit `feat(web): výpravy a jezdci na mapě z událostí serveru`.

### Task 5: Tažení, válka ve scéně a přítomnost vůdce (Sonnet)

**Files:**

- Create: `apps/web/lib/server-events/push-war.ts`, registrace v `pushers.ts`.
- Modify:
  - `apps/web/hooks/use-campaign.ts` – bez dotazování a bez majáku přítomnosti;
  - `apps/web/components/game/hud/CampaignMap.tsx` – `useEventScope({ campaignId })`, bez `actions.presence`;
  - `apps/web/hooks/use-war-scene.ts`;
  - `apps/web/components/game/village-game/use-war-watch.ts`;
  - `apps/web/components/game/ForeignWarScene.tsx` – `useEventScope({ scene })`.
- Modify:
  - `apps/web/lib/campaign-view.ts` – smazat `CAMPAIGN_POLL_MS` a `PRESENCE_EVERY_MS`, přidat `CAMPAIGN_SPAN_MAX_MS = 15_000`, stejně jako nejdelší `glideMs` scény (war.md – Plynulost mezi snímky);
  - `apps/web/lib/war-scene-view.ts` – smazat `WAR_SCENE_POLL_MS` a `WAR_SCENE_IDLE_MS`, přidat `warSceneKey`.
- Modify:
  - `apps/web/app/api/events/route.ts` – přítomnost u tažení v `onHeartbeat`;
  - `apps/web/app/game/actions/army.ts` – server action `presence` smazat, když ji `git grep -n "presence(" apps/web` už nikde nevolá.
- Test:
  - `lib/server-events/__tests__/push-war.test.ts`;
  - `hooks/__tests__/use-campaign.behavior.test.tsx`, `hooks/__tests__/use-war-scene.behavior.test.tsx` (nové).
- Docs:
  - `docs/code/web-ui.md` – Dotazování na tažení…, Cizí mapa ve scéně;
  - `docs/code/war.md` – Ve scéně – Web, Plynulost mezi snímky (snímek = uložený bod, přijde rovnou), Hráč ve vsi a mimo ni (přítomnost vůdce ze spojení);
  - `docs/code/server-events.md` – Válka.

**Interfaces:**

- Consumes: Úloha 2 (`Computers`, `warKeyOfSettlement`, `warKeyOfScene`, `ConnectionScope.campaignId`); Úloha 3 (hooky, testovací pomocník).
- Produces:
  - `warSceneKey(war: WarSceneView | null): string` – `none`, jinak `campaignId@tick`.
  - `createWarComputers(deps: { campaign(playerId, campaignId): Promise<CampaignView | null>; home(playerId, settlementId): Promise<WarSceneView | null>; scene(playerId, campaignId, cell): Promise<WarSceneView | null> }): Pick<Computers, 'campaign' | 'war-home' | 'war-scene'>`
    - Klíč tažení je `tick@phase` (null → `none`), klíč války `warSceneKey`.
    - `war` nese `key` z `warKeyOfSettlement` a `warKeyOfScene`.
    - `serverComputers` mu předá `campaignViewForPlayer(…, -1)`, `warSceneForPlayer` a `warSceneOnMapForPlayer`.
  - `useCampaign(campaignId: string | null): { view; sample; gone; refresh }` – bez parametru `presence`.
  - `useWarScene(key: string, url: string, enabled: boolean): WarSceneView | null | undefined`.
  - `onHeartbeat` v route: `notePlayerActive`, a s `scope.campaignId` navíc `commandCampaignForPlayer(playerId, campaignId, { kind: 'presence' })`; odmítnutí se ignoruje (nevede živě). Běží při připojení a v každém tepu (20 s).
- Chování:
  - `useCampaign`:
    - jeden `GET /api/campaign/<id>?since=-1` při otevření, na `sync` a `refresh`; 404 dá `gone` jako dnes;
    - `campaign` téhož id se použije jako dnešní tělo `poll`, `view: null` dá `gone`;
    - rozpětí = `clamp(now − received, FRAME_MS, CAMPAIGN_SPAN_MAX_MS)` – body chodí po ≥ 40 taktech (≈ 10 s).
  - `useWarScene`:
    - jeden dotaz na `url` při zapnutí, změně klíče a `sync`;
    - `war` se shodným `key` se použije, jen když se liší tažení nebo takt (jako dnes).
  - `ForeignWarScene`: `useWarScene(warKeyOfScene(...), …)`; logika `war === null` → jednou `GET /api/campaign/<id>` a `followCellOf` se nemění.
  - `use-war-watch`: `useWarScene(warKeyOfSettlement(settlementId), '/api/war-scene/<id>', …)`. Podmínky zapnutí z D63 zůstávají jen pro první dotaz.

- [ ] **Step 1: Failing testy**
  - `push-war.test.ts`:
    - stejný takt podruhé nic nepošle;
    - `null` po neprázdném pošle `war: null`.
  - `use-campaign.behavior.test.tsx`:
    - za 60 s bez události jen dotaz při otevření a žádné `presence`;
    - `campaign` s novým taktem posune `view`;
    - `view: null` dá `gone`.
  - `use-war-scene.behavior.test.tsx`:
    - za 60 s jen jeden dotaz;
    - `war` jiného klíče se zahodí;
    - stejný takt nepřekreslí.
  - `stream.test.ts`: rozsah s `campaignId` zavolá přítomnost při připojení a po 20 s, bez něj ne.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/server-events hooks/__tests__/use-campaign.behavior.test.tsx hooks/__tests__/use-war-scene.behavior.test.tsx` → FAIL.
- [ ] **Step 3: Implementace.**
- [ ] **Step 4:** Testy z kroku 2 → PASS.
- [ ] **Step 5:** `npm run test:e2e` – hlavně `multiplayer-war.spec.ts` (vložené body tažení teď přijdou událostí), `battle-scene.spec.ts` a `fortification.spec.ts`.
- [ ] **Step 6:** Docs, kontroly, commit `feat(web): tažení a válka ve scéně z událostí serveru, přítomnost vůdce ze spojení`.

### Task 6: Přeskok času, úklid, měření a nasazení (Sonnet)

**Files:**

- Modify: `apps/web/lib/skip-progress.ts` – `reportSkipProgress` a `clearSkipProgress` navíc pošlou `notifyChange(db, { k: 'x', p, progress })`, nejvýš jednou za 250 ms na hráče; konec (`progress: null`) vždy.
- Modify: `apps/web/hooks/use-skip-progress.ts` – událost `skip` a jeden dotaz při zapnutí a `sync`; smazat `SKIP_PROGRESS_POLL_MS`.
- Delete: `apps/web/hooks/use-polling.ts`, jakmile ho `git grep -n "use-polling" apps/web` nikde nenajde.
- Test:
  - `lib/__tests__/skip-progress.test.ts` – omezení s falešným `notifyChange`;
  - `hooks/__tests__/use-skip-progress.behavior.test.tsx`;
  - e2e `server-events.spec.ts` – měření.
- Docs:
  - `docs/code/server-events.md` – Měření, Co ještě běží po časovači, Nasazení;
  - `docs/code/accounts.md` – Průběh přeskoku;
  - `CLAUDE.md` – „Později … Nezapomenout“: SSE `/api/events` za Caddy bez bufferování a LISTEN mimo PgBouncer (Rozhodnutí 11);
  - zbylé zmínky `usePolling` v `docs/code`.

**Interfaces:**

- Consumes: `notifyChange` (Úloha 1), směrování `x` → `skip` (Úloha 2), hooky (Úloha 3).
- Produces: `useSkipProgress(active)` – signatura beze změny.

- [ ] **Step 1: Failing testy**
  - `skip-progress.test.ts`: 10 hlášení za 100 ms dá ≤ 2 oznámení a konec vždy jedno.
  - `use-skip-progress.behavior.test.tsx`:
    - bez události jen dotaz při zapnutí;
    - `skip` mění průběh;
    - po vypnutí null.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/__tests__/skip-progress.test.ts hooks/__tests__/use-skip-progress.behavior.test.tsx` → FAIL. **Step 3:** Implementace a smazání `use-polling.ts`. **Step 4:** PASS.
- [ ] **Step 5: Měření v e2e** (`server-events.spec.ts`, projekt `chromium`, bez workeru) – test „bez změn žádné dotazy“:
  - Hráč založí ves; počká na `serverEvents().status === 'open'` a 3 s na první kolo po `sync`.
  - Pak 15 s počítá požadavky: `/api/*` mimo `/api/events` a POST s hlavičkou `next-action`.
  - Očekává 0 a přesně jeden požadavek `/api/events` od načtení.
- [ ] **Step 6: Kontrola** – `git grep -n "usePolling\|POLL_MS\|setInterval" apps/web` smí najít jen místní časovače:
  - snímky interpolace (`use-journey.ts`, `use-campaign.ts`);
  - hodiny (`TopBar.tsx`, `NewcomerPanel.tsx`);
  - `ScenePerfPanel.tsx`, `ambient-sound.ts`, vývojové stránky `app/dev/landscape/`.

  Seznam zapiš do `server-events.md`. Tam patří i tabulka nečinného panelu:
  - **před:** ves ≈ 0,7, jezdci 12, válka 12 a varování 6 dotazů za minutu; při válce a výpravě navíc 120 + 120;
  - **po:** 0, plus jeden dotaz vsi za herní den po uložení workerem; pohyb přichází jen jako události.

- [ ] **Step 7:** `npm run test:e2e`, docs, kontroly, commit `feat(web): přeskok času z událostí, konec dotazování a měření`.

## Mimo plán (později)

- Posílat rozdíl pohledu vsi rovnou v události – server by musel pro každé spojení držet `known` a `pieces` klienta.
- Živá obnova panelů, které se dnes neptají (Rod a vazalové, jednání, Kronika), událostmi.
- Nastavení Caddy a měření NOTIFY při zátěži – s `docs/deployment.md`.

## Pořadí a souběh

- **Pořadí:** 1 → 2 → 3, pak 4 a 5 souběžně, nakonec 6.
  - Úlohy 4 a 5 přidávají každá jeden řádek do `pushers.ts` a vlastní sekci do `server-events.md` – při slučování ruční spojení.
  - Souběžné e2e jen s jiným `E2E_PORT` a `TEST_DATABASE`.
- **Oprava D62/D63 (`fix/no-blocking-polls`)** musí být ve `feat/landscape` před Úlohami 3 a 5.
  - Úloha 3 přepisuje `use-village-sync.ts` (D62 – akce nečekají na Worker tras vozů – zůstává).
  - Úloha 5 nahrazuje dotazování ve `use-war-scene.ts` / `use-war-watch.ts`, tedy i podmínky D63.
  - Pozor: když D63 zruší nečinné dotazy na `/api/war-scene`, zmizí s nimi zápis přítomnosti hráče po 5 s (war.md – Hráč ve vsi a mimo ni). Do sloučení Úlohy 2 ho drží jen akce a dotazy na ves – D63 by ho měla zachovat, nebo Úloha 2 přijít brzy po ní.
- **Migrace Úlohy 1:**
  - Číslo podle `_journal.json` při práci; jiná větev s novou migrací (např. `feat/hides-honey`) znamená přečíslovat při slučování.
  - Do `bohemia` ji po sloučení pustí hlavní session se zálohou.
- **Sdílený soubor:** `village-view-types.ts` (Úloha 3 – `versions`) mění i jiné větve, spojení je triviální.
