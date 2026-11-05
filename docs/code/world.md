# Svět pro víc hráčů

Plán: `docs/superpowers/plans/2026-11-03-multiplayer-vassalage-war.md`. Pravidla: `docs/design/vassalage.md`,
`docs/design/war.md`.

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
