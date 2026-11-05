# Svět pro víc hráčů

Plán: `docs/superpowers/plans/2026-11-03-multiplayer-vassalage-war.md`. Pravidla: `docs/design/vassalage.md`,
`docs/design/war.md`.

Cizí věc (jiný hráč, svět) mění ves jen přes **schránku vsi** (`VillageInbox`, události na
začátku svého dne, zápis zvedá verzi vsi) – `docs/code/village-core.md`, Schránka vsi.

## Mřížka a umístění

- `packages/game/src/domain/world/` – `cellDistance` (Čebyšev: `max(|dx|, |dy|)`), `GridCell`,
  umístění nového hráče (`placement.ts`), seed krajiny políčka (`cell-seed.ts`), čísla v `rules-world.ts`.
- Každé sídlo má `grid_x` / `grid_y` v tabulce `settlement`; na políčku leží nejvýš jedna aktivní
  mapa (unikátní index `settlement_grid_idx`). Seed světa: `packages/server/src/world.ts`.

## Rod

- Tabulka `house` (`packages/db/src/schema/house.ts`), port `HouseRepository`
  (`application/houses.ts`). Hráč má nejvýš jeden živý rod (`ended_at IS NULL`); `lord` = hlava rodu
  (ves + číslo osoby).

## Adresář rodů

- Port `WorldDirectory.nearestHouses` (`application/world-directory.ts`), adaptér
  `packages/db/src/adapters/world-directory.ts`, in-memory `__tests__/in-memory-world-directory.ts`;
  v `GameDeps.worldDirectory`. Use-case `housesNear(deps, { viewerId, today, limit })` vrací
  `PublicHouse[]` podle vzdálenosti sídelních sídel od sídla diváka (vlastní rod vynechán).
  `publicHouseOf(entry, center, today)` skládá `PublicHouse` z jednoho záznamu; port má i
  `entriesOf(houseIds)` (záznamy konkrétních živých rodů – páni, vazalové, pozvaní, vlastní rod).
- **Co je veřejné** (vassalage.md – Přehled pána; Martin 2. 11. 2026: „rodokmeny šlechty jsou
  prakticky veřejné“): jméno hlavy rodu, poloha sídla, vzdálenost, počet aktivních vsí a muži rodu
  od 16 let (`PUBLIC_MAN_MIN_AGE`) s jménem, věkem a názvem vsi. **Nic dalšího** – zásoby, výzbroj,
  koně, lidé vsí ani seed počasí. `PublicHouse` se skládá pole po poli (ne kopií souhrnu) a test
  hlídá, že odpověď neobsahuje klíče `arms`, `horse`, `stores`, `people`, `weatherSeed`.
- Data jdou ze souhrnu vsi (`VillageDigest.publicLineMen`, verze 2) – stav vsí se nenačítá. Ves bez
  souhrnu současné verze se v adresáři nepočítá, dokud ji worker neuloží.
- **Dotaz**: jeden SQL na živé rody se sídelním sídlem (řazení
  `greatest(abs(grid_x − cx), abs(grid_y − cy))`, pak id rodu, `LIMIT`) a jeden na souhrny vsí
  vybraných rodů. **Změřeno** (5. 11. 2026, lokální Postgres, 1 000 rodů s vsí a souhrnem, limit 20):
  ≈ 2,4 ms celkem (db test `world-directory.db.test.ts` čas vypisuje).

## Upozornění mezi hráči

- **Tabulka `player_notice`** (migrace `0015_player_notice.sql`, schéma `schema/player-notice.ts`):
  `id` (bigserial – roste, stojí na něm `after`), `player_id` → `user` (cascade), `kind`,
  `payload` (jsonb, data podle druhu), `game_day`, `created_at`, `read_at` (null = nepřečtené);
  index `(player_id, id)`.
- **Port** `NoticeRepository` (`application/notices.ts`): `post` (id, čas a `read_at` doplní
  úložiště), `after(playerId, afterId, limit)` (jen upozornění hráče, rostoucí podle id),
  `markRead(playerId, upToId)` (jen jeho, do `upToId`). In-memory `__tests__/in-memory-notices.ts`,
  adaptér `db/src/adapters/notice-repository.ts`, `GameDeps.notices`.
- **Druhy** (`PlayerNoticeKind`, unie – další úlohy ji rozšiřují): `invite-accepted` (pozvaný přijal
  pozvánku, úloha 1.8), `invitee-played` (pozvaný se rozehrál, úloha 1.9). Text k druhu je v
  `apps/web/lib/player-notices.ts` (`playerNoticeLine`); nový druh = nová větev v `textOf` i
  `noticePanel` (kompilátor ohlídá úplnost).
- **Doručení v odpovědi dotazu na ves:** upozornění se nepushují a nemají vlastní akci (server
  actions jednoho klienta jedou ve frontě po jedné). `poll` ve `VillageGame` posílá
  `getVillageView({ …, withNotices: true })`; odpověď (`VillageView` i `VillageUnchanged`, ne
  `null`/chyba) nese `playerNotices` – výsledek `NoticeRepository.takeUnread(playerId,
NOTICE_BATCH = 20)`, tedy nepřečtená od nejstaršího, která se tím zároveň označí za přečtená (jedno
  `UPDATE … RETURNING`, souběžná volání nevrátí totéž). Doručí se jen jednou. Klient je zpracuje
  hned po návratu, ještě před kontrolou pořadí dotazu (`seq`) – zahozená odpověď by je jinak
  ztratila – a ukáže jako řádky nahoře uprostřed (`mergeNoticeLines`). Server doplňuje upozornění
  do nové kopie výsledku (mimo `withVillageCache`). Hráč je jen ze session, `playerId` ve vstupu
  se nečte (`wantsPlayerNotices`). `after` a `markRead` v portu zůstávají pro panel s historií.
- **Id řádku:** řádek hráčského upozornění má id `-id` upozornění, vesnické řádky kladné id z
  čítače – řady se nesrazí.
- **Klik:** `noticePanel(kind)` vrací panel, který řádek otevírá; `VillageGame.openNoticePanel` zatím
  nic neotevře (panel „Rod a vazalové“ vznikne v úloze 1.10).

## Schránka vsi

- **Tabulka `village_inbox`** (migrace `0016_village_inbox.sql`, schéma `schema/village-inbox.ts`):
  `id` (uuid), `seq` (bigserial – pořadí zápisu, v rámci dne se události použijí podle něj),
  `village_id` → `village` (cascade), `day` (herní den použití), `ref` (text, **unikátní** –
  idempotence zápisu), `body` (jsonb, `VillageEventBody`), `created_at`; index `(village_id, day)`.
- **Adaptér** `createInboxRepository` (`adapters/inbox-repository.ts`), členem
  `VillageRepository.inbox` (`createVillageRepository` ho zapojí; `GameDeps` žádnou druhou instanci
  nemá – odesílatelé volají `deps.villages.inbox`, `cachedVillages` ho předává dál).
- **`post` = jedna transakce:** `SELECT last_day FROM village WHERE id = … FOR UPDATE` (řádek vsi
  zamkne; neznámá ves = chyba, jako v paměti) → `INSERT … ON CONFLICT (ref) DO NOTHING RETURNING`
  s dnem `greatest(day, last_day + 1)` → jen když se vložilo, `UPDATE village SET version =
version + 1, digest_version = digest_version + 1`. Duplicitní `ref` = `null` a verze se nemění.
  Zámek řádku řadí zápis proti `save` vsi (ten zamyká řádek `UPDATE`), takže `last_day` je v okamžiku
  zápisu pravdivý: událost nikdy nepřistane na už spočítaném dni.
- **Proč verze:** rozběhnutý dopočet vsi (web i worker) čte stav před zápisem; jeho `save` s původní
  verzí selže na kontrole verze a `updateVillage` ho zopakuje i s novou událostí (`pending`).
  `digest_version` jde s `version`, protože zápis do schránky stav vsi nemění – souhrn zůstává
  platný (`NULL + 1` zůstane `NULL`). Zámek hráče-příjemce se nebere (jen řádek vsi).
- **`pending(villageId, afterDay, toDay)`:** `afterDay < day ≤ toDay`, `ORDER BY day, seq`.
- **Testy:** `adapters/__tests__/inbox-repository.db.test.ts` (konflikt rozběhnutého `save`,
  idempotence `ref`, posun dne, pořadí) a třetí „proces“ posílající události do vsí v
  `packages/server/src/__tests__/web-worker-race.db.test.ts` (každá událost ze dnů ≤ `lastDay`
  v kronice právě jednou, výsledek = dopočet jedním procesem se stejnými událostmi).

## Pozvánky

Pravidla: [vassalage.md](../design/vassalage.md) – Čísla. Čísla v `INVITES` (`domain/world/rules-world.ts`):
nevyužité kódy najednou 3, platnost 14 skutečných dní, „začal hrát“ = 3 různé dny (`grantSuccessionCredits`).

- **Doména** `domain/world/invite.ts`: `INVITE_ALPHABET` (31 znaků bez O, I, L, 0, 1),
  `newInviteCode(random)` (8 znaků), `formatInviteCode` (`BH7K-M2QX`), `parseInviteCode`
  (`'bh7k m2qx'` → `'BH7KM2QX'`, jinak null), `isInviteUnused` (nezrušený, nevyužitý, platný –
  počítá se do stropu) a `isInviteAvailableTo` (+ ne vlastní a nerezervovaný jiným).
- **Use-casy** `application/invites.ts`: `issueInvite` (jen hráč s živým rodem, strop 3, při kolizi
  kódu nový pokus, náhoda přes port `RandomSource` – web ho plní z `crypto` v
  `cryptoRandom()` v `packages/server`), `revokeInvite`, `checkInvite` (jen čte), `reserveInvite`.
  Vydávání a rušení zatím nemá rozhraní ve hře (přijde s úlohou 1.10). Chyby: `INVITE_INVALID`
  („Pozvánka neplatí.“), `INVITE_NEEDS_HOUSE`, `INVITE_LIMIT`.
- **Port** `InviteRepository`: `reserve` je jeden podmíněný `UPDATE … RETURNING` (souběžné
  rezervace dvou uživatelů – uspěje jedna; téhož uživatele je idempotentní); `consumeReservation`
  využije rezervaci jen jednou – volá ji `enterGame` (viz Vazalství z pozvánky); `listUsed` vrací využité kódy.
  Rezervace platí i po uplynutí `validUntil` kódu, ruší ji jen zrušení kódu.
- **DB** `invite_code` (migrace `0017_invite`), adaptér `adapters/invite-repository.ts`, v
  `GameDeps` jako `invites` a `random`. Registrace s kódem: `accounts.md`.

## Vazalství z pozvánky

Pravidla: [vassalage.md](../design/vassalage.md) – Pozvaný jako vazal. Typy a port v
`application/vassalages.ts` (`Vassalage`, `VassalTerms = {}`, `VassalEdge`, `VassalageRepository`:
`activeOf`, `create`, `end`, `edgesNear`); `breaches` je zatím vždy 0 (rozšíří úloha 4.2).

- **`enterGame`** (`application/enter-game.ts`, volitelná `deps.invitation` = `invites`, `vassalages`,
  `notices`, `gameDay`): u **nového** hráče (bez sídla) se jako první využije rezervace
  (`consumeReservation`). Pozvatel s živým rodem a sídlem s polohou → umístění
  `{ kind: 'invited', lordSeat }` (≥ `WORLD.invitedGap` od ostatních), po založení rodu
  `vassalages.create({ origin: 'invite', terms: {} })` a pánovi upozornění `'invite-accepted'`
  (`payload` = `houseId`, `playerId` nováčka; jméno web nezná, řádek zní „Pozvaný přijal…“).
  Pozvatel vymřel / nemá sídlo → nezávislý, kód je i tak spotřebovaný. Hráč, který už sídlo má,
  rezervaci nevyužije; opakovaný vstup nic nezdvojí.
- **DB** `vassalage` (migrace `0018_vassalage`; živé = `ended_at IS NULL`, `end_reason`), adaptér
  `adapters/vassalage-repository.ts` (`edgesNear` = rekurzivní CTE po živých hranách v obou směrech).
  V `GameDeps` jako `vassalages`.

## Aktivní dny a nástupnictví za pozvaného

- **Aktivní den** (`application/activity.ts`): `pragueDateOf(at)` (`YYYY-MM-DD` v Europe/Prague),
  `recordActiveDay`; web ho zapíše v `gameEntryForPlayer` (`apps/web/lib/game.ts`), tabulka
  `player_activity` (PK hráč + datum, `ON CONFLICT DO NOTHING`), v `GameDeps` jako `activity`.
- **Kredity** (`application/succession-credits.ts`, tabulka `succession_credit`, unikát
  `invitee_id`): `grantSuccessionCredits(deps, { now, today })` projde **využité pozvánkové kódy**
  (`InviteRepository.listUsed`) a pozvateli připíše kredit (`grantOnce`) za každého pozvaného s
  aspoň `INVITES.playedDays` různými dny, pošle upozornění `'invitee-played'`. Zdroj jsou kódy, ne
  vazalství – kód přežije vypovězení, přechod pod jiného pána i vymření pána (pozvaný je pak
  nezávislý, kredit pozvateli přesto patří). `consumeOne(playerId, deathDay)` kredit použije
  (zatím nikdo nevolá – nástupnictví bez losu je fáze 2); `SKIP LOCKED` brání dvojímu použití.
- **`runWorldTasks(deps, { now, today })`** – úlohy světa; zatím jen `grantSuccessionCredits`. Worker
  je pouští jednou za minutu mezi koly (`worker.md`).

## Panel „Rod a vazalové“ – data a akce (úloha 1.10)

- Use-case `housePanel(deps, { playerId, today })` (`application/house-panel.ts`) vrací
  `HousePanelData`: `own` (id a muži vlastního rodu od 16 let), `lords` / `vassals` (`PublicHouse`
  z `VassalageRepository.activeOf` – páni jsou hrany, kde je rod vazalem, vazalové ty, kde je pánem),
  `others` (nejbližších `PANEL_OTHERS_LIMIT` = 12 cizích rodů bez pánů a vazalů), `invites`
  a `freeInviteSlots` (`INVITES.maxUnused` − nevyužité platné kódy). Hráč bez rodu dostane
  `hasHouse: false`. Cizí rody jsou jen `PublicHouse` – stejné veřejné údaje jako v adresáři, žádná
  id účtů, zásoby ani výzbroj (test to hlídá).
- `PanelInvite`: `open` (kód, `validUntil`) nebo `used` (kód, `house` pozvaného rodu nebo null,
  `played` = pozvaný byl aspoň `INVITES.playedDays` různých dnů ve hře – ikona nástupnictví);
  využitých ukáže posledních 6, zrušené a propadlé vůbec.
- Web: `lib/house.ts` (composition root: `housePanelForPlayer`, `issueInviteForPlayer`,
  `revokeInviteForPlayer`), `lib/house-view.ts` (`houseView(data, nowMs)` → `HouseView` s portréty
  podle věku, `HouseLinkView` se štítem a popiskem, `InviteView` s dny do konce platnosti),
  `lib/house-input.ts` (tvar vstupu zrušení). Server actions `housePanel`, `issueInvite`,
  `revokeInvite({ code })` v `app/game/actions.ts` – hráč jen ze session. `issueInvite` vrací kód
  bez pomlčky, nebo důvod odmítnutí (limit tří kódů, hráč bez rodu).
