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
  uprchlíků (`alarm.flights[*].cell`). `a` = vsi, které o tažení vědí, jen uuid (revize Úlohy 5):
  varované (`alarm.villages[*].villageId`) až od taktu varování (`warnTick` ≤ takt bodu – vesničan
  musí doběhnout domů) a cíl `target.villageId` jen s bitvou (`state.battle` – obránce ji vidí celou,
  rozhodnutá leží u cíle do konce dne, `shownBattle`). Cíl bez bitvy ani kandidáti hradišť (`hosts`)
  v `a` nejsou – `a` dává signál `alarm` a výpočet `war-home`, takže by napadená ves (či hradiště
  pána) poznala tažení dřív, než ho spatří; vlastní záznam dostane hradiště až od posla
  (`warnByMessenger`), uprchlíky a posly k němu nese `c`. U UPDATE je `c` i `a` sjednocení starého
  a nového stavu, takže odchod z mapy dostane událost bez paměti rozbočovače.
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
  = null), `notifyChange(db, change)` (`pg_notify`; v plánu ji volá jen `lib/skip-progress.ts` pro `x`).
- `packages/db/src/adapters/change-listener.ts` – `listenChanges(url, handlers, options)`: vlastní
  `pg.Client` (`keepAlive`, `application_name` výchozí `bohemia-change-listener`) mimo pool,
  `LISTEN bohemia_change` a `SET idle_session_timeout = 0`; každých `PING_INTERVAL_MS = 30 s` pošle `SELECT 1`
  s limitem `PING_TIMEOUT_MS = 10 s` (tiše spadlé spojení jinak nikdo nepozná) a při chybě spojení obnoví. Po chybě nebo konci spojení se připojí znovu s odklady
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
- **Výpočty:** počítadla `Computers` podle druhu úlohy (`pushers.ts` – `serverComputers()`; výpravy
  viz Výpravy, tažení a válka viz Válka níž), úloha bez počítadla se přeskočí.
  Výpočet jde přes slučovač (`coalesce.ts` – `createCoalescer`): začne po `COALESCE_MS = 50`, pro
  klíč běží nejvýš jeden naráz a volání během běhu dají nejvýš jeden další. Výsledek
  `{ name, data, key }` jde spojením hráče se shodným předmětem (`scopeWantsTask`) – každému,
  jehož vlastní naposled poslaný `key` se liší; první výsledek spojení jde vždy. Proto `add`
  spočte novému spojení hned stav rozsahu (`scopeTasks` – `war-home`, `war-scene`, `campaign`, `visitors`;
  revize Úlohy 5): první výsledek tak nepřijde až s první změnou, která se dotkne rozsahu (osamělé
  `war: null` by prozradilo, že se políčka vsi něco dotklo), a změna mezi dotazem prohlížeče při
  otevření a vstupem spojení do rozbočovače se neztratí (konec tažení). Paměť klíčů je
  po spojení (smaže se v `remove`), ne po hráči – návrat na ves nebo výměna rozsahu by jinak při
  shodném klíči nedostaly nic a pohled by zůstal zastaralý (revize Úlohy 2). `resync` paměť
  všech spojení smaže a stav rozsahu spočte všem znovu (jako `add`). Výpočet zůstává sdílený přes
  klíč slučovače.
- **Spojení:** `add` / `remove`, nejvýš `MAX_CONNECTIONS_PER_PLAYER = 4` na hráče – páté pošle
  nejstaršímu `evicted` a zavře ho (i kvůli limitu 6 spojení HTTP/1.1 na původ). Bez `evicted` by
  se zavřený EventSource po `retry` připojil sám a vyhodil další panel, s 5+ panely dokola –
  prohlížeč se po `evicted` znovu nepřipojí a přejde na pojistku. Chyby výpočtu, odeslání a posluchače
  jdou do logu s předponou `[events]`, stejná nejvýš jednou za minutu (`errorLog`,
  `ERROR_LOG_INTERVAL_MS`).
- **Protokol** (`protocol.ts`, čisté): `SERVER_EVENTS_PROTOCOL = 1` v `sync`, `EVENTS_PATH`,
  `EventScope` s `eventsUrl` / `parseEventScope` (id jen UUID, sjednocené na malá písmena; políčko
  `-?\d{1,4}`; dvojí hodnota je vadná), `ServerEvents` (náklady událostí podle Rozhodnutí 3 plánu),
  `formatServerEvent` (`event: …\ndata: <json>\n\n`), klíče války `warKeyOfSettlement` /
  `warKeyOfScene`. Signál `village` ze změny sídla (`s`) nese `villageId: null, version: null`.
  Událost `evicted` (`{}`) dostane spojení vyhozené novějším panelem téhož hráče těsně před
  zavřením.
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
  spojení je přítomnost hráče (war.md – Hráč ve vsi a mimo ni); s tažením v rozsahu navíc
  `campaignPresence` (Válka níž). Chyba zápisu přítomnosti spojení nezavře.
- Session se každých `SESSION_RECHECK_MS = 300_000` ověří z cookie zachycené při připojení
  a s ní znovu práva rozsahu (`rescope` – `resolveConnectionScope` nad původním dotazem). Neplatná
  session, `'forbidden'` (sesazený správce, ztracené sídlo) i jiný rozsah než při připojení
  (`sameScope` – třeba skončené tažení) proud zavřou; prohlížeč se připojí znovu s čerstvým
  rozsahem, nebo dostane 401 / 403. Chyba kontroly spojení nezavře – další pokus za 5 min
  (revize Úlohy 2).
- Fronta nepřečtených událostí má mez `MAX_QUEUED_BYTES = 1_048_576` (`ByteLengthQueuingStrategy`)
  – nad ní se spojení zavře a fronta zahodí (pomalý prohlížeč se připojí znovu a dostane `sync`).
- Úklid (rozbočovač, časovače) proběhne jednou: odpojení (`request.signal`), zrušení čtenářem,
  chyba zápisu, přetečení fronty, neplatná session nebo rozsah i zavření rozbočovačem (páté
  spojení hráče – napřed `evicted`).
- Testy: `stream.test.ts`, `scope.test.ts`; e2e kouř `apps/web/e2e/server-events.spec.ts`
  (produkční build – `sync`, změna vsi zápisem přímo SQL dorazí do 2 s, hlavičky bez komprese,
  400, cizí ves 403, bez přihlášení 401).

**Za Caddy** (až s `docs/deployment.md`): `reverse_proxy` musí SSE propouštět bez bufferování
a `encode` nesmí odpověď `/api/events` držet (jinak cestu z `encode` vyjmout); LISTEN potřebuje
přímé spojení s Postgresem (ne PgBouncer v režimu transakcí); HTTP/2 odstraní limit 6 spojení.

## Klient

`ServerEventsClient` (`apps/web/lib/server-events/client.ts`) je bez Reactu – `EventSource`,
viditelnost panelu a hodiny dostane zvenku (`ServerEventsDeps`, testy podstrčí falešné).
`ServerEventsProvider` (`components/game/ServerEventsProvider.tsx`) obalí `VillageGame` na stránce
`/game` (`app/game/page.tsx`): klienta vytvoří jednou při vykreslení (nic neotevírá) a pustí ho
v efektu. Efekty dětí běží dřív než efekt poskytovatele, takže první spojení má hned rozsah
zobrazené vsi i všechny posluchače.

- **Jen ve viditelném panelu** (Rozhodnutí 6): skrytý panel spojení zavře a nenechá žádný
  časovač; návrat do panelu otevře nové spojení hned a jeho `sync` dočte vše.
- **`sync` s mezerou zavolá obnovy** (`onResync`): mezera je start, výpadek, skrytý panel
  a `evicted`; opakovaný `sync` téhož spojení (rozbočovač obnovil LISTEN) taky. Jiná verze
  protokolu (`SERVER_EVENTS_PROTOCOL`) → `location.reload()` (Rozhodnutí 9).
- **Výměna rozsahu bez mezery** (Rozhodnutí 7): `setScope` sloučí změny jednoho vykreslení
  (`SCOPE_DEBOUNCE_MS = 100`) a nové spojení otevře, jen když se adresa (`eventsUrl`) liší. Staré
  doručuje, dokud nové nepošle `sync`, pak se zavře a obnovy se nevolají. Naráz nejvýš dvě
  spojení – doručující a nové; novější výměna to nové nahradí.
- Události jdou posluchačům (`on`), chyba jednoho nezastaví ostatní; `received()` je počítadlo
  pro e2e, `status()` = `open` | `connecting` | `off` (skrytý panel, stop).
- **Hooky** (`hooks/use-server-events.ts`): `ServerEventsContext`, `useServerEvent(name, handler)`,
  `useEventScope(part)` (při odpojení nebo změně vrátí své klíče na null), `useServerResync(refresh)`
  a `useSerialRefresh(run, failure)` – dotaz se slučováním: jeden běh naráz, volání během běhu dají
  nejvýš jeden další po něm. Bez poskytovatele hooky nedělají nic.
- **Pohled vsi** (`useVillageSync`, web-ui.md – Obnova pohledu vsi (události)): `village` jen
  s novou verzí (`villageEventIsNews`, `lib/village-events.ts`), `notices`, obnova po mezeře
  a hlídač dne (níž). Pohled nese verze vsí hráče `VillageView.versions` (`lib/village.ts`, vedle
  `stamp`; u spravované vsi chybí – každá událost je novinka), takže událost uložení, které udělala
  vlastní akce, druhý dotaz nevyvolá (Rozhodnutí 5); přijde-li během akce, ověří se po ní
  s pohledem akce. Změna samotného jména vsi verzi nemění – událost se zahodí a jméno ukáže
  nejbližší nová verze (jako dřív otisk s dalším dnem; rozhodnutí Martina 15. 11. 2026, viz Rozhodnutí).
- **Varování** (`useAlarm`): dotaz hned při změně vsi, na `alarm` téže vsi, na `village` téže
  vsi (jen když už je pohled), na obnovu po mezeře a na `refresh`, po jednom (`useSerialRefresh`).
- e2e háčky `serverEvents` (`{ status, received }`) a `dropServerEvents` (`drop()` – jako výpadek
  sítě). Testovací kontext hooků `hooks/__tests__/server-events-test-utils.tsx`
  (`fakeServerEvents` – `emit`, `resync`, `scope`, `listeners`, `wrap`).
- Testy: `lib/server-events/__tests__/client.test.ts`, `lib/__tests__/village-events.test.ts`,
  `hooks/__tests__/use-alarm.behavior.test.tsx`,
  `components/game/village-game/__tests__/use-village-sync.behavior.test.tsx` (10 událostí za
  50 ms → nejvýš 2 dotazy, vlastní akce); e2e `server-events.spec.ts` (jméno vsi a upozornění
  zapsané do databáze bez háčku `pollVillage`, výpadek spojení).

## Pojistka

- **Trvalá chyba** (`readyState` CLOSED – 401, 403, restart serveru): nové spojení s odklady
  `RECONNECT_MS` 1, 2, 5, 10 a 30 s (poslední se opakuje, po `sync` zase od 1 s). Přerušené
  spojení, které prohlížeč obnovuje sám (`retry: 3000`), se znovu nezakládá – jeho další `sync`
  dočte vše.
- **Dokud spojení není otevřené**, zavolá po `FALLBACK_MS = 30_000` a pak každých 30 s všechny
  obnovy (jedno kolo dotazů). Neplatná session tak po 30 s ukáže chybu řádkem nahoře jako dřív
  (Rozhodnutí 10).
- **`evicted`** (páté spojení hráče vyhodilo nejstarší): žádné odklady – nové spojení by vyhodilo
  další panel a tak dokola. Zůstane pojistka a nové spojení přijde s jejím prvním kolem (30 s),
  nebo hned při dalším návratu do panelu.

## Výpravy

- **Počítadla** `createJourneyComputers(deps)` (`lib/server-events/push-journeys.ts`, `serverComputers()`
  jim v `pushers.ts` předá `expeditionViewsForPlayer` a `expeditionVisitorsOnVillage` z `lib/journey.ts`
  – tytéž funkce jako `GET /api/journey`, takže hráč nedostane nic, co by přes route neviděl):
  - `journeys` → `{ name: 'journeys', data: { views }, key: expeditionsKey(views) }`;
  - `visitors` → `{ name: 'visitors', data: { villageId, visitors }, key: villageId + visitorsKey(visitors) }`.
  - Klíče (`lib/journey-view.ts`, čisté): takt každé výpravy, resp. skupina + takt + počet lidí –
    stejný stav spojení podruhé nejde. Prázdný stav má klíč `''`, takže i „nic“ spojení dojde.
- **Náraz:** worker ukládá jedoucí skupinu zhruba každou sekundu (`JOURNEY_PUSH_MS = 1_000`); pět
  změn téže výpravy v řadě dá přes slučovač (`COALESCE_MS = 50`) nejvýš dva výpočty `views`.
- **Klient:** `useExpeditions(running, onPartyEnded)` (`hooks/use-journey.ts`) – jeden
  `GET /api/journey`, když `running` začne platit, na `sync` (jen s `running`) a na `refresh`;
  událost `journeys` se použije vždy (na `running` čeká jen dotaz) jako dřív tělo dotazu (`apply` – interpolace s
  rozpětím `clamp(now − received, FRAME_MS, 4 × JOURNEY_PUSH_MS)`, `onPartyEnded` při zmizelém
  hlouččku); snímek po 100 ms zůstává místní. `useJourneyVisitors(villageId, enabled)`
  (`hooks/use-journey-visitors.ts`) – jeden dotaz při zapnutí (`enabled` = scéna už je), změně vsi a na
  `sync`; událost `visitors` platí vždy, když sedí ves (nezávisle na `enabled`), jiné vsi se zahodí, stejný klíč se nepřekreslí.
  Stav jezdců dostane spojení i při připojení a po `sync` (`scopeTasks` – `visitors` pro zobrazenou ves). Dotazy jdou přes
  `useSerialRefresh`. `expeditionVisitorsOn` napřed levně ověří vlastníka a políčko (otisk vsi, sídlo)
  a seznam jezdců na mapě; stav vsi načte jen při cizí skupině na mapě. Odpověď dotazu (`useExpeditions`,
  `useJourneyVisitors`), během kterého přišla událost, se zahodí; `useExpeditions` se bez `running` neptá.
- Testy: `lib/server-events/__tests__/push-journeys.test.ts`, `hooks/__tests__/use-journey.behavior.test.tsx`,
  `use-journey-visitors.behavior.test.tsx`, `lib/__tests__/journey-view.test.ts` (klíče).

## Válka

- **Počítadla** `createWarComputers(deps)` (`lib/server-events/push-war.ts`; `serverComputers()` jim
  v `pushers.ts` předá `campaignViewForPlayer(…, -1)` z `lib/campaign.ts`, `warSceneForPlayer`
  a `warSceneOnMapForPlayer` z `lib/war-scene.ts` – tytéž funkce jako `GET /api/campaign/<id>`,
  `GET /api/war-scene/<sídlo>` a `?scene=x,y`, takže hráč nedostane nic, co by přes route neviděl):
  - `campaign` → `{ name: 'campaign', data: { campaignId, view }, key }` – klíč `tick@phase`,
    `view: null` (hráč tažení nezná, route 404) má klíč `none`;
  - `war-home` → `{ name: 'war', data: { key: warKeyOfSettlement(sídlo), war }, key: warSceneKey(war) }`;
  - `war-scene` → totéž s `warKeyOfScene(tažení, políčko)`.
  - `warSceneKey` (`protocol.ts`, re-export v `lib/war-scene-view.ts` – rozbočovač tak do serveru
    nenatáhne převody pro scénu): `none`, jinak `<tažení>@<takt>` – stejný takt spojení podruhé
    nejde, `null` po válce jde (`war: null` – scéna válku smaže).
- **Mlha války** (návrh Clauda, plán 2026-11-15 – Úloha 5): `war` počítá `warSceneFor` po mlze
  války – vojsko jen v dohledu domů a mužů, s varováním, které už do vsi dorazilo. Dřívější
  `MapWatch.war` (D62) byl pravda už od začátku cizího tažení proti vsi a síťová odpověď dotazu na
  ves tak prozradila vojsko dřív, než ho ve vsi kdo spatřil; `MapWatch.riders` zase počítal vlastní
  i cizí výpravy na políčku vsi bez zkoušky dohledu. Oboje je pryč včetně use-casu mapWatchFor,
  mapWatchForPlayer a pole `watch` v odpovědi dotazu na ves (návrh Clauda, plán 2026-11-15 –
  Úloha 6; výjimka z „`packages/game` se nemění“ – mrtvý kód a únik). Jezdce nese událost
  `visitors`, jejíž stav počítají tytéž funkce jako `GET /api/journey?visitors=`. Časový signál (revize Úlohy 5): stav války dostane
  spojení hned při připojení (`scopeTasks`), dál jen při změně klíče, takže osamělé `war: null` nic
  neprozradí; signál `alarm` a výpočet `war-home` přes `a` jdou jen vsím, které o tažení vědí
  (varované od `warnTick`, cíl s bitvou – Oznámení v databázi). Vojsko na mapě vsi dává výpočet
  přes `c`, výsledek ale jde jen při změně toho, co ves vidí.
- **Přítomnost vůdce:** spojení s tažením v rozsahu (`ConnectionScope.campaignId`, otevřená
  `CampaignMap`) v každém tepu i při připojení zavolá `campaignPresence` – route
  `commandCampaignForPlayer(hráč, tažení, { kind: 'presence' })`; odmítnutí (hráč nevede živě,
  tažení skončilo) se zahodí. Nahrazuje maják, který dřív po 20 s posílal prohlížeč přes server
  action; skrytý panel spojení nemá, takže ani přítomnost (war.md – Velení).
- **Klient:**
  - `useCampaign(campaignId)` (`hooks/use-campaign.ts`) – jeden `GET /api/campaign/<id>?since=-1`
    při otevření, na `sync` a `refresh`; událost `campaign` téhož id se použije jako dřív tělo
    dotazu (starší nebo týž takt se zahodí, v témž taktu jen jiná fáze projde), `view: null`
    i 404 dají `gone`. Odpověď dotazu, během kterého přišla událost, se zahodí (`eventsRef` jako
    `useWarScene`) – pohled spočtený před koncem tažení nevrátí mapu v témž taktu na pochod. Interpolace s rozpětím
    `clamp(now − received, FRAME_MS, CAMPAIGN_SPAN_MAX_MS)` (15 s – body tažení chodí po ≥ 40
    taktech ≈ 10 s); snímek po 100 ms zůstává místní. Rozsah `campaignId` nastaví `CampaignMap`
    (`useEventScope`).
  - `useWarScene(key, url, enabled)` (`hooks/use-war-scene.ts`) – jeden dotaz na `url` při
    zapnutí, změně klíče a na `sync` (jen se zapnutím); událost `war` se shodným `key` se použije
    vždy (nezávisle na `enabled`), jen když se liší tažení nebo takt; jiný klíč se zahodí.
    Odpověď dotazu, během kterého přišla událost téhož klíče, se zahodí (událost je stejně čerstvá
    nebo novější a novější stav server pošle sám). Vlastní mapa `useWarWatch` –
    `warKeyOfSettlement(sídlo)`, `/api/war-scene/<sídlo>`, zapnutí se scénou a bez konce hry; cizí
    mapa `ForeignWarScene` – `warKeyOfScene(tažení, políčko)`, `?scene=x,y` a rozsah
    `useEventScope({ scene })`.
- Testy: `lib/server-events/__tests__/push-war.test.ts` (klíče, stejný takt podruhé nejde, `null`
  po válce jde), `stream.test.ts` (přítomnost s tažením při připojení a po 20 s, bez něj ne),
  `hooks/__tests__/use-campaign.behavior.test.tsx`, `use-war-scene.behavior.test.tsx`.

## Den bez workeru

`lib/village-day-check.ts` (Rozhodnutí 8): `nextDayCheckMs(dayIndex, clock, nowMs)` = začátek dne
`dayIndex + 1` (`realTimeOf(dateOfDayIndex(…), clock)`, hodiny hráče s posunem času)
plus odklad `DAY_CHECK_GRACE_MS = 10_000`, minus teď, nejméně 0; bez pohledu a poslední den světa null.
`useVillageSync` nastaví časovač po každém novém dni pohledu. Když pohled v tu chvíli pořád ukazuje
týž den, zeptá se jednou (`npm run dev:web`, e2e projekt `chromium`, přetížený worker). Se zdravým
workerem přijde událost dřív (worker se budí do 1 s po začátku dne) a dotaz se nepošle. Jen ve
viditelném panelu (skrytý dočte vše po návratu) a bez `gameOver`; odklad nad 2^31 − 1 ms (limit
`setTimeout`) se nastaví po kouscích. Testy `lib/__tests__/village-day-check.test.ts` a hlídač dne
v `use-village-sync.behavior.test.tsx`.

## Přeskok času

`lib/skip-progress.ts` (vývojový režim, accounts.md – Průběh přeskoku): `reportSkipProgress` a
`clearSkipProgress` kromě zápisu do paměti procesu oznámí `notifyChange(db, { k: 'x', p, progress })`
(`announceSkip` v `lib/game.ts` je composition root). Hlášení se oznamují nejvýš jednou za
`SKIP_ANNOUNCE_MS = 250` na hráče (první hned), konec (`progress: null`) vždy a nuluje odstup;
chyba oznámení se zaloguje a přeskok neovlivní. Směrování `x` → `skip` jde hráči `p` (Úloha 2).
`useSkipProgress(active)` (`hooks/use-skip-progress.ts`): jeden dotaz na `/api/dev/skip-progress`
při zapnutí a po `sync` (přeskok mohl běžet už před otevřením panelu), jinak jen událost `skip`;
pozdní odpověď dotazu, který začal před novější událostí, se zahodí. Konstanta intervalu dotazů
a use-polling.ts jsou pryč. Testy: `lib/__tests__/skip-progress.test.ts`,
`hooks/__tests__/use-skip-progress.behavior.test.tsx`, `DevTimeButtons.behavior.test.tsx`.

## Měření

Nečinný panel (e2e `server-events.spec.ts`, „bez změn žádné dotazy“, projekt `chromium` bez
workeru): po načtení hry, `open` a 3 s na první kolo po `sync` se 15 s počítají požadavky `/api/*`
mimo `/api/events` a server actions (hlavička `next-action`) – 0; spojení `/api/events` je od
načtení právě jedno.

| Dotazy nečinného panelu            | před (za minutu)                    | po                                                   |
| ---------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| ves (`getVillageView`)             | ≈ 0,7                               | 0, plus jeden dotaz za herní den po uložení workerem |
| jezdci (`/api/journey?visitors=`)  | 12                                  | 0                                                    |
| válka (`/api/war-scene`)           | 12                                  | 0                                                    |
| varování (`getAlarmView`)          | 6                                   | 0                                                    |
| při válce a výpravě navíc          | 120 (pohled tažení) + 120 (výprava) | 0, pohyb přichází jen jako události                  |
| průběh přeskoku (jen při přeskoku) | 150 (každých 400 ms)                | jeden dotaz, dál události `skip` (≤ 4 za sekundu)    |

Čísla „před“ jsou z plánu (brief Úlohy 6); přeskok: 60 s / 0,4 s = 150 dotazů za minutu.

## Co ještě běží po časovači

`git grep -n "setInterval" apps/web` (mimo testy a vývojové stránky) smí najít jen místní časovače
v prohlížeči, které se na server neptají:

- snímky interpolace pohybu – `hooks/use-journey.ts`, `hooks/use-campaign.ts` (100 ms);
- hodiny – `TopBar.tsx` (datum), `NewcomerPanel.tsx` (odpočet);
- `ScenePerfPanel.tsx` (ladicí čítač), `lib/scene/ambient-sound.ts` (plánovač zvuků);
- vývojové stránky `app/dev/landscape/`.

Na serveru zůstává `lib/server-events/stream.ts` (tep `SSE_HEARTBEAT_MS` a přezkoušení session).
Dotazování po taktu v kódu nezbylo; pojistka po 30 s a hlídač dne jsou časovače
`setTimeout`, ne dotazování po taktu.

## Nasazení

Až bude `docs/deployment.md` (CLAUDE.md – Lokální vývoj a nasazení):

- **Caddy:** `reverse_proxy` musí `/api/events` propouštět bez bufferování; ověřit, že `encode`
  odpověď nedrží, jinak cestu z `encode` vyjmout. Hlavičky `no-transform` a `X-Accel-Buffering: no`
  už server posílá.
- **Postgres:** `LISTEN` potřebuje přímé spojení (ne PgBouncer v režimu transakcí); posluchač drží
  jedno spojení na proces webu.
- **HTTP/2** odstraní limit 6 spojení HTTP/1.1 na původ.
- Změřit `NOTIFY` při zátěži (≈ 35 uložení vsí za sekundu při 1000 hráčích × 3 vsi).
- Víc procesů webu funguje samo – každý má své `LISTEN`.

## Rozhodnutí

- **Jméno vsi** (Martin 15. 11. 2026): přejmenování vsi verzi nezvedá, takže ostatní panely ukážou
  nové jméno až s další změnou vsi – „Jméno je ok. Vždycky chvíli trvá, než si lidi zvyknou :)“.
