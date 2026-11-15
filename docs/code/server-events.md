# Události ze serveru

Prohlížeč se neptá periodicky – server mu změny posílá (Martin 15. 11. 2026: „Ale obecně by klient
neměl tyhle věci periodicky pollovat, ale server by je měl pushovat“). Návrh Clauda: jedno spojení
SSE na prohlížeč, zdroj událostí Postgres `LISTEN` / `NOTIFY`. Plán:
`docs/superpowers/plans/2026-11-15-server-push.md`. Tento soubor roste po úlohách plánu.

## Oznámení v databázi

Oznamují **triggery v databázi** (migrace `packages/db/drizzle/0053_change_notify.sql`), ne kód
adaptérů – oznámí tak každá cesta zápisu (web, worker, e2e pomocníci se zápisem přímo SQL).
`NOTIFY` se doručí až po commitu, rollback nic nepošle. Kanál je jeden, `bohemia_change`
(`CHANGE_CHANNEL`), druh změny je v klíči `k`.

| `k` | Kdy                                                                    | Náklad                                                      |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `v` | ves vložena, nebo změněna `version`, `name`, `settlement_id`           | `{ k, id, ver, p }` – `p` = `settlement.owner_id`           |
| `s` | sídlo vloženo, změněn `owner_id` nebo `archived_at`                    | `{ k, p, op }` – nový a starý vlastník (vložení: `op` null) |
| `n` | vloženo upozornění                                                     | `{ k, p }`                                                  |
| `j` | bod výpravy vložen, nebo změněn `tick`/`state`; výprava změní `status` | `{ k, id, t, p, c }` – `t` null u změny `status`            |
| `c` | bod tažení vložen, nebo změněn `tick`/`state`; tažení změní `status`   | `{ k, id, t, c, a }`                                        |
| `x` | průběh přeskoku času (posílá web, ne trigger)                          | `{ k, p, progress }`                                        |

- `c` = políčka `[x, y]`: skupiny, běžící poslové (jako `cells` ve `village-holds.ts`) a skupiny
  uprchlíků (`alarm.flights[*].cell`). `a` = varované vsi (`alarm.villages[*].villageId` a
  `hosts`) a cíl `target.villageId`, jen uuid. U UPDATE je `c` i `a` sjednocení starého a nového
  stavu, takže odchod z mapy dostane událost bez paměti rozbočovače.
- Samotný `outbox` (`clearOutbox`) neoznamuje. Neoznamuje se ani schránka vsi, záměry a jednání.
- Náklad nad 7900 B (limit `NOTIFY` je 8000 B, měří se `octet_length`) nahradí funkce
  `bohemia_change_notify` krátkým `{ k, id, t, p, big: true }`; `big` znamená „všechna spojení
  s políčkem / vsí“, `parseChange` doplní prázdná `c` a `a`.
- SQL funkce `bohemia_change_cells`, `bohemia_change_alarmed` a `bohemia_change_union` skládají pole
  bez opakování. Triggery: `village_change_notify_ins` / `_upd`, `settlement_change_notify`,
  `player_notice_change_notify`, `journey_checkpoint_change_notify`, `journey_change_notify`,
  `campaign_checkpoint_change_notify`, `campaign_change_notify`.

### Kód

- `packages/db/src/changes.ts` – `DbChange`, `Cell`, `parseChange` (neznámý druh nebo vadný tvar
  = null), `notifyChange(db, change)` (`pg_notify`; v plánu ji volá jen Úloha 6 pro `x`).
- `packages/db/src/adapters/change-listener.ts` – `listenChanges(url, handlers, options)`: vlastní
  `pg.Client` (`keepAlive`, `application_name` výchozí `bohemia-change-listener`) mimo pool,
  `LISTEN bohemia_change`. Po chybě nebo konci spojení se připojí znovu s odklady
  `[1000, 2000, 5000, 10000, 30000]` ms (poslední se opakuje), po obnově zavolá `onReconnect`
  (po prvním připojení ne). Vadný náklad jde do `onError`. `close()` další pokus zruší.
- Testy: `changes.test.ts`, `adapters/__tests__/change-notify.db.test.ts` (triggery),
  `change-listener.db.test.ts`.

## Rozbočovač

Proces webu má jediný rozbočovač `serverEventsHub()` (`apps/web/lib/server-events/hub.ts`) –
jedináček v `globalThis[Symbol.for('bohemia.server-events')]`, přežije HMR (změna jeho kódu v dev
chce restart `npm run dev`). Při prvním volání spustí jediné LISTEN spojení procesu
(`listenChanges`). Po obnově LISTEN pošle `sync` všem spojením (`resync`) – mezitím mohla nějaká
změna uniknout. Totéž po prvním naběhnutí LISTEN (návrh Clauda): spojení otevřená dřív by jinak
přišla o změnu zapsanou mezi svým dočtením a začátkem LISTEN. Víc procesů webu funguje samo,
`NOTIFY` dostane každý.

**Směrování** (`routing.ts`, čisté – smí do prohlížeče): `routeChange(change, sinks)` vrátí
signály pro spojení a výpočty bez opakování podle `computeKey` (hráč a předmět – dva panely téhož
hráče s toutéž vsí dají jeden výpočet). Rozsah spojení `ConnectionScope` = hráč, zobrazená ves
s jejím sídlem a políčkem světa, otevřené tažení a cizí mapa ve scéně.

| Změna | Komu                                                                       | Co                                           |
| ----- | -------------------------------------------------------------------------- | -------------------------------------------- |
| `v`   | hráč `p` a spojení se zobrazenou vsí `id` (i správce)                      | signál `village { villageId, version }`      |
| `s`   | hráči `p` a `op`                                                           | signál `village` s null – dočíst vždy        |
| `n`   | hráč `p`                                                                   | signál `notices {}`                          |
| `x`   | hráč `p`                                                                   | signál `skip { progress }`                   |
| `j`   | připojený vlastník `p`; spojení s políčkem v `c`                           | výpočet `journeys`; `visitors` (ves spojení) |
| `c`   | spojení s tažením `id`; s jeho cizí mapou; s políčkem v `c` nebo vsí v `a` | výpočty `campaign`, `war-scene`, `war-home`  |
| `c`   | spojení se vsí v `a`                                                       | signál `alarm { villageId }`                 |

- `big` – `c` a `a` platí pro všechna spojení s políčkem / vsí.
- **Výpočty:** počítadla `Computers` podle druhu úlohy (`pushers.ts` – `serverComputers()`, zatím
  prázdné; výpravy doplní Úloha 4, tažení a válku Úloha 5), úloha bez počítadla se přeskočí.
  Výpočet jde přes slučovač (`coalesce.ts` – `createCoalescer`): začne po `COALESCE_MS = 50`, pro
  klíč běží nejvýš jeden naráz a volání během běhu dají nejvýš jeden další. Výsledek
  `{ name, data, key }` jde spojením hráče se shodným předmětem (`scopeWantsTask`), jen když se
  `key` změnil proti naposled poslanému; první výsledek jde vždy. Paměť klíčů je po hráči a smaže
  se s jeho posledním spojením.
- **Spojení:** `add` / `remove`, nejvýš `MAX_CONNECTIONS_PER_PLAYER = 4` na hráče – páté zavře
  nejstarší (i kvůli limitu 6 spojení HTTP/1.1 na původ). Chyby výpočtu, odeslání a posluchače
  jdou do logu s předponou `[events]`, stejná nejvýš jednou za minutu (`errorLog`,
  `ERROR_LOG_INTERVAL_MS`).
- **Protokol** (`protocol.ts`, čisté): `SERVER_EVENTS_PROTOCOL = 1` v `sync`, `EVENTS_PATH`,
  `EventScope` s `eventsUrl` / `parseEventScope` (id jen UUID, sjednocené na malá písmena; políčko
  `-?\d{1,4}`; dvojí hodnota je vadná), `ServerEvents` (náklady událostí podle Rozhodnutí 3 plánu),
  `formatServerEvent` (`event: …\ndata: <json>\n\n`), klíče války `warKeyOfSettlement` /
  `warKeyOfScene`. Signál `village` ze změny sídla (`s`) nese `villageId: null, version: null`.
- Testy: `apps/web/lib/server-events/__tests__/` – `protocol`, `routing`, `coalesce`, `hub`.

## Spojení `/api/events`

`GET /api/events?village=<id>&campaign=<id>&scene=<id>@<x>,<y>` (`app/api/events/route.ts`) –
Route Handler ve výchozím `runtime` `nodejs`, dynamický čtením session:

- bez session 401 (`{ error }` jako `/api/journey`), vadný dotaz 400, cizí ves 403
  (`NOT_PLAYER_VILLAGE`);
- rozsah ověří `resolveConnectionScope` (`scope.ts`, porty z `gameDeps()`): ves – otisk
  (`stampsOfVillages`) a aktivní sídlo, vlastník, nebo živá správa hráčova rodu (`kind 'player'`,
  jako `stewardAccess`), jinak 403; políčko je `worldCell` sídla (odříznuté null), stav vsi se
  nenačítá. Tažení a cizí mapa – id mezi `campaigns.activeOf(hráč)`, jinak se ta část rozsahu
  tiše zahodí (tažení mohlo právě skončit);
- hlavičky `Content-Type: text/event-stream; charset=utf-8`,
  `Cache-Control: no-cache, no-transform` (komprese Next.js odpověď přeskočí – jinak by události
  držela a poslala pozdě a najednou), `X-Accel-Buffering: no`.

**Proud** (`stream.ts` – `openEventStream`): `retry: 3000` (`SSE_RETRY_MS`), přidání do
rozbočovače, `sync`, hned tep – v tomto pořadí, takže změna mezi přidáním a dočtením se neztratí.

- Tep po `SSE_HEARTBEAT_MS = 20_000`: komentář `: ping` a `notePlayerActive(hráč)` – otevřené
  spojení je přítomnost hráče (war.md – Hráč ve vsi a mimo ni); chyba zápisu přítomnosti spojení
  nezavře.
- Session se každých `SESSION_RECHECK_MS = 300_000` ověří z cookie zachycené při připojení;
  neplatná proud zavře (chyba kontroly ne – další pokus za 5 min).
- Fronta nepřečtených událostí má mez `MAX_QUEUED_BYTES = 1_048_576` (`ByteLengthQueuingStrategy`)
  – nad ní se spojení zavře a fronta zahodí (pomalý prohlížeč se připojí znovu a dostane `sync`).
- Úklid (rozbočovač, časovače) proběhne jednou: odpojení (`request.signal`), zrušení čtenářem,
  chyba zápisu, přetečení fronty, neplatná session i zavření rozbočovačem (páté spojení hráče).
- Testy: `stream.test.ts`, `scope.test.ts`; e2e kouř `apps/web/e2e/server-events.spec.ts`
  (produkční build – `sync`, změna vsi zápisem přímo SQL dorazí do 2 s, hlavičky bez komprese,
  400, cizí ves 403, bez přihlášení 401).

**Za Caddy** (až s `docs/deployment.md`): `reverse_proxy` musí SSE propouštět bez bufferování
a `encode` nesmí odpověď `/api/events` držet (jinak cestu z `encode` vyjmout); LISTEN potřebuje
přímé spojení s Postgresem (ne PgBouncer v režimu transakcí); HTTP/2 odstraní limit 6 spojení.
