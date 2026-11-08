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

- **Umístění shluku** (`domain/world/placement.ts` – `placeCluster`, `cluster-placement.ts`):
  `placeCluster(occupied, cluster, request)` hledá po prstencích od cíle první posun, kde mají
  všechny buňky shluku (místní souřadnice, první = sídlo) odstup ≥ gap od cizích; vzájemná poloha
  se zachová. `PlacementRequest` `independent` nese volitelné `sameLanguage` (mapy rodů stejného
  jazyka; prázdné/chybějící = střed světa, hledá se nejblíž kterékoli z nich). `placeNewPlayer` je
  `placeCluster` s jednou buňkou. Čísla: `WORLD`, `NEWCOMERS` (`rules-world.ts`).
- **Nabídka pánů** (`domain/world/lord-offer.ts`): `lordOffer(candidates, { language, seed })` –
  jen živé rody hráčů s nejmenším počtem vsí ≥ 2; stejný jazyk první, uvnitř skupiny pořadí
  z `deriveSeed(seed, houseId)`; prázdná nabídka = `[]` (newcomers.md – Nabídka pánů).

## Vstup nováčka (odříznutá krajina, výběr pána)

Pravidla: `docs/design/newcomers.md`. Use-casy v `application/newcomers.ts`.

- **Odříznutý rod:** `enterGame` bez pozvánky založí sídlo jen v místní mřížce rodu
  (`settlement.local_x/local_y` = (0, 0), `grid_*` null, krajina `isolatedLandscapeSeed(worldSeed,
hráč)`) a rod s `house.placed_at` null. Pozvaný je na mapě hned (`placed_at` = založení).
  `Settlement.localCell`, `isIsolated(settlement)`; `House.placedAt`, `House.newcomerSince`.
  Migrace `0038_newcomers` (dosavadní rody `placed_at = created_at`, výchozí `now()`).
  Sídelní sídlo (odříznuté i pozvaného) má prémiovou krajinu (`Settlement.premiumType` –
  landscape.md, Přidělení typu); vsi synů průměrnou, umístění shluku typ nemění.
- **Vsi syna** v odříznuté krajině: `targetSettlement` → `isolatedTarget` – soused v místní mřížce,
  seed `isolated:<rod>:x,y`, unikátní index `settlement_local_idx` (hráč + místní poloha). Zápis je
  podmíněný: `settlements.create` s `localCell` v transakci zamkne řádek rodu `FOR SHARE`
  (`placed_at IS NULL`) – umístění (`claim`) počká; rod mezitím umístěný → null a odchod pokračuje
  větví světa s čerstvým sídlem (`settlements.find`).
- **Nikdo ho nevidí:** adresář (`nearestHouses`, `entriesOf` – jen `placed_at IS NOT NULL` a sídlo
  s `grid_*`), `openNegotiation` (odříznutý jen žádá o pána – `newcomer: true`; na odříznutý cíl
  `NEWCOMER_REASONS.isolatedTarget`), `declareWar`, `prepareCampaign` (plán i vyslání tažení –
  útočník `notPlaced`, cíl `isolatedTarget`, poloha vsí jen z mapy světa, žádné `?? (0, 0)`),
  `announcePassage` (oba rody), zásilky mezi hráči (`crossesIsolation` v `shipments.ts`),
  `issueInvite` (`INVITE_NEEDS_PLACEMENT`). Ochrana nováčka: dokud `placedAt` null, je rod chráněn
  vždy (`houseProtectedUntil` → `ISOLATED_PROTECTION_UNTIL`, štít v panelu se neukáže), pak běží od
  `placedAt` (`playerHousesSince`).
- **Žádosti:** `requestLords` – 1–5 rodů z `newcomerStatus().offer` (`WorldDirectory.offerCandidates`
  → `lordOffer`, bez už žádaných), jednání `negotiation.newcomer` s holou přísahou; první úspěšná
  žádost zapíše `newcomer_since` (`markNewcomerSince`). Pán jen přijme / odmítne
  (`counterNegotiation` → `onlyAccept`); odmítnutí všemi → upozornění `newcomer-rejected-all`.
- **Umístění** `placeNewcomer(deps, tx, …)` v transakci jednání (`NegotiationTx.placement`, adaptér
  `adapters/newcomer-placement.ts`): advisory zámek umisťování → podmíněné `placed_at IS NULL`
  (prohra = „Nováček už má pána.“) → `placeCluster` celého shluku (vazal u sídla pána, svobodný
  u map rodů svého jazyka) → `moveIsolated` jedním UPDATE → vazalství `origin` `newcomer` /
  `newcomer-lot`; `moveIsolated` bere stejná sídla jako `isolatedCells` (bez `pending_owner_id`).
  Žádost nováčka (`openNegotiation` s `newcomer`) se zapisuje pod zámkem řádku rodu
  (`PlacementTx.lockIsolated`, `FOR UPDATE`): souběžné výběry dohromady nejvýš
  `NEWCOMERS.maxChoices`, po umístění žádná; `startFree` po umístění žádosti zavře ještě jednou.
  Los (`drawNewcomerLot`) v transakci zamkne vylosovanou žádost (`getForUpdate`, musí být `open`,
  jinak los příští kolo) – stejné pořadí zámků jako přijetí; chyba jednoho rodu kolo nepřeruší
  (vyhodí se na konci). `acceptNegotiation` ho volá **před** změnou stavu jednání; ostatní žádosti zavře
  `closeNewcomerRequests` až po transakci (jiné řádky jednání se v ní nezamykají – bez uváznutí;
  zaniklé `ended` → pozdější přijetí „Nováček už má pána.“, pánům `newcomer-taken`).
- **Svobodný:** `startFree` stáhne žádosti (`withdrawn`) a umístí bez pána; `withdrawNegotiation`
  na otevřenou žádost odříznutého (`withdrawNewcomerRequest`) = `startFree`. **Volba cesty před
  vsí:** `newcomerFoundingReason` (`choosePath`) – `foundVillageForPlayer` odmítne založit ves
  odříznutému bez `newcomerSince`. **Týden:** `expireNewcomerWaits` v `runWorldTasks` (worker) –
  `waitingNewcomers` = všechny odříznuté rody; po `NEWCOMERS.waitDays` od první žádosti los
  `deriveSeed(accountSeed, 'lot')` mezi živými neodmítnutými (seřazenými podle id), jinak svobodný;
  rod bez žádosti týden od založení (`newcomerLotAt`) začne svobodný.
- **Panel rodu odříznutého:** adresář ho nezná, proto `WorldDirectory.isolatedEntriesOf` (sídlo
  v místní mřížce) – vlastní rod v panelu a nováček v žádosti u pána. `HousePanelData.isolated`,
  `inviteReason` (`INVITE_NEEDS_PLACEMENT`), `PanelNegotiation.newcomer`; `NewcomerRequest.lordName`.
- Web: server actions `newcomerStatusAction`, `startFreeAction`, `requestLordsAction` (`lib/house.ts`),
  rozhraní [web-ui.md](web-ui.md) – Nováček v rozhraní. e2e `e2e/newcomers.spec.ts`; ostatní e2e
  umísťují hráče bez pozvánky zápisem do `bohemia_test` (`e2e/placement.ts`).
- **Souběžný zápis do mřížky:** pozvaný (`enterGame`) a odchod ve světě (`targetSettlement`)
  zapisují bez zámku umisťování – `moveIsolated` běží v úložném bodě (savepoint) a obsazené políčko
  (unikátní index) vrátí false; `placeNewcomer` zkusí `PLACEMENT_ATTEMPTS` (3) s čerstvou mapou
  obsazení, pak výjimka (zruší i `claim`). `expireNewcomerWaits` chybu jednoho rodu nepřeruší.
- Ochrana: upozornění „ochrana končí“ (`playerHousesSince`) jen u rodů s `placed_at`, od umístění.
  `update-user` (Better Auth) jazyk nemění – `databaseHooks.user.update.before` pole `language`
  zahodí (`lib/auth-hooks.ts`); mění ho jen registrace a `chooseLanguage`.
- **Známé omezení – výkon `placeCluster`:** hledá po prstencích od každého cíle a u každého posunu
  kontroluje každou buňku shluku proti všem obsazeným mapám (`occupied.some` – lineárně),
  poloměr až k nejvzdálenější mapě + odstup. S tisíci map a mnoha cíli (`sameLanguage`) to roste
  zhruba kubicky a běží pod globálním zámkem umisťování uvnitř transakce jednání – umístění se
  řadí za sebe. Zatím neopraveno (index obsazení podle políček by stačil).
- Testy: `__tests__/newcomers.test.ts`, db `newcomer-placement.db.test.ts` (souběh dvou pánů,
  souběžné žádosti, úložný bod přesunu), `world-directory.db.test.ts` (odříznutý rod v adresáři
  není).

## Rod

- Tabulka `house` (`packages/db/src/schema/house.ts`), port `HouseRepository`
  (`application/houses.ts`). Hráč má nejvýš jeden živý rod (`ended_at IS NULL`); `lord` = hlava rodu
  (ves + číslo osoby). Hráčův muž a jeho převod: `application/player-lord.ts`, viz
  `village-people.md` – „Hráčův muž a vlastní ves“. Senior rodu (`house.senior`, sloupce `senior_*`)
  a práva ve vsích rodu: `village-people.md` – „Seniorát a práva ve vsích rodu“. Nástupnictví hráče po smrti jeho muže (los, kredit,
  `house.succession_day`, upozornění `'player-succession'`): `village-people.md` – „Nástupnictví hráče“.
  Konec rodu (hráčova i NPC) jde jediným místem `endHouse` (`application/escheat.ts`) – rod s pánem
  nechá vsi a vazaly pánovi jako odúmrť: `vassalage.md` – „Vymření rodu a odúmrť“.

## Adresář rodů

- Port `WorldDirectory.nearestHouses` (`application/world-directory.ts`), adaptér
  `packages/db/src/adapters/world-directory.ts`, in-memory `__tests__/in-memory-world-directory.ts`;
  v `GameDeps.worldDirectory`. Use-case `housesNear(deps, { viewerId, today, limit })` vrací
  `PublicHouse[]` podle vzdálenosti sídelních sídel od sídla diváka (vlastní rod vynechán).
  `publicHouseOf(entry, center, today)` skládá `PublicHouse` z jednoho záznamu; port má i
  `entriesOf(houseIds)` (záznamy konkrétních živých rodů – páni, vazalové, pozvaní, vlastní rod).
- **Jazyk rodu je veřejný:** `house.language` (sloupec s výchozí `cs`, migrace `0037_language`) nese
  `House.language` a `PublicHouse.language`; rod ho dostane z účtu při založení a nemění se.
  Z adresáře ho použije pořadí nabídky pánů a umístění svobodného nováčka (newcomers.md).
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

## Jednání a strom dohod

Čistá doména (úloha 3.1), strany jsou **rody** (`house.id`), ne hráči. Pravidla:
[vassalage.md](../design/vassalage.md) – Vznik a jednání, Meze.

- `domain/negotiation/types.ts` – `TermItem` (zatím jen `oath` { lord, vassal }), `NegotiationRound`, `Negotiation` (`open` / `accepted` / `rejected` / `withdrawn`).
- `domain/negotiation/negotiate.ts` – přechody `openRound`, `counterRound`, `acceptRound`, `rejectRound`, `withdrawRound` → `{ ok, negotiation } | { ok: false, reason }`. Strany se střídají, kol je neomezeně; přijmout, odmítnout a protinávrh smí jen adresát posledního kola, stáhnout jen jeho autor; role přísahy se v protinávrhu nemění. Dohodu z přijetí zakládá až use-case (ověří žijící rody a `wouldBeMutual`).
- `canOpen(ctx)` – důvod odmítnutí nebo `null`: vymřelý rod, zablokování, jedno otevřené jednání mezi dvojicí, pauza po odmítnutí, vzájemné vazalství („Je tvým pánem.“), už trvající dohoda. Vstup (`OpenContext`) skládá adaptér z DB; čas je jen parametr.
- `rules-negotiation.ts` – `NEGOTIATION` (`pauseAfterRejectMs` = 1 skutečný den, `messageMaxChars` = 500) a texty důvodů `NEGOTIATION_REASONS`.
- Blokování a pauza se vedou **mezi rody**; nový rod po restartu začíná s čistým štítem (návrh Clauda).
- `domain/vassalage/tree.ts` – `VassalEdge` (re-export z `application/vassalages.ts`), `wouldBeMutual` (jen **přímý** vzájemný vztah; delší kruhy A → B → C → A povolené, Martin: „udělej to, jak říkáš“), `treeBelow` (potomci po dohodách, každý jednou, kruh se zastaví; kořen je v seznamu jen při návratu kruhem), `treeAround` (souvislá síť nahoru i dolů).

### Jednání v databázi (úloha 3.2)

Port `NegotiationRepository` (`application/negotiations.ts`), adaptér `db/adapters/negotiation-repository.ts`, in-memory `application/__tests__/in-memory-negotiations.ts`; migrace `0022_negotiation`. Mezihráčské záznamy se mění **v transakci nad vlastními tabulkami bez zámku hráče** (technické rozhodnutí 5 plánu).

- Tabulky: `negotiation` (seřazená dvojice rodů `party_low` < `party_high`, `opener`, `status` `open` / `accepted` / `rejected` / `withdrawn` / `ended`, `version`, `created_at`, `closed_at`), `negotiation_round` (PK `negotiation_id` + `seq`; `author_house_id`, `items` jsonb, `message`), `player_block` (`blocker_house_id` → `blocked_house_id`, PK dvojice) a `negotiation_reject`.
- `negotiation_reject`: `proposer_house_id` (kdo návrh poslal) + `rejecter_house_id` (kdo odmítl) + `at`, PK dvojice, nové odmítnutí přepíše čas. `tx.lastReject(proposer, rejecter)` je přesně `OpenContext.rejectedByTargetAt` pro `from` = proposer, `to` = rejecter; blokování `tx.blocks(to, from)` je `blockedByTarget`.
- Unikátní částečný index `negotiation_open_pair_uq (party_low, party_high) WHERE status = 'open'`: mezi dvojicí je nejvýš jedno otevřené jednání bez ohledu na směr. `tx.open` vkládá s `ON CONFLICT DO NOTHING` a při konfliktu vrací `null` (souběžné A → B a B → A: vznikne jedno).
- `tx.getForUpdate` = `SELECT … FOR UPDATE` řádku jednání (souběžné odpovědi se seřadí); `tx.setStatus(id, status, expectedVersion, at)` mění stav podmíněně na `version` (+1) a vrací `false` při neshodě. Z dvou souběžných přijetí / přijetí a stažení projde jedno.
- `tx.vassalages` a `tx.notices` jsou stejné adaptéry (`createVassalageRepository`, `createNoticeRepository` přijímají spojení i transakci, typ `Executor`) nad toutéž transakcí – dohoda a upozornění z přijetí se potvrdí nebo vrátí společně se stavem jednání.
- Testy: `adapters/__tests__/negotiation-repository.db.test.ts`.

### Jednání v panelu (úloha 3.4)

`housePanel` (`HousePanelDeps.negotiations`) přidává `negotiations` (otevřená jednání rodu, `myTurn`
= `respondingHouse` je hráčův rod) a `actions` (u každého rodu v `others` důvody `canOpen` pro
nabídku a žádost, `blockedByMe`) – rozhodnutí zůstává v jádře. Rozhraní: [web-ui.md](web-ui.md) –
Jednání v panelu Rod a vazalové.

### Use-casy jednání (úloha 3.3)

`application/negotiate.ts`, `negotiation-effects.ts`, `negotiation-chronicle.ts`, `blocks.ts`. Hráč jedná za svůj **živý rod** (`houses.activeOf`), `to` / `target` jsou id rodů. Každý use-case běží v jedné `negotiations.transaction`; zámek hráče se nebere.

- `openNegotiation` – `openRound` + `canOpen` se stavem z transakce (blokování, otevřené jednání, pauza, `edgesNear(from, 1)`); souběžné protisměrné otevření odmítne unikátní index (`tx.open` → `null` → „Jednáte už.“). Vzkaz nad `NEGOTIATION.messageMaxChars` odmítne doména.
- `counterNegotiation`, `rejectNegotiation` (zapíše pauzu `recordReject(autor posledního kola, odmítající)`), `withdrawNegotiation` – záznam se načte `getForUpdate`, doména ověří stranu a tah, druhá strana musí žít. Stav `ended` (rod vymřel, blokování) je pro doménu „skončilo“.
- `acceptNegotiation` – ověří živé rody, přímou vzájemnost (`wouldBeMutual` nad živými vazalstvími pána) a `check` účinků, pak `setStatus('accepted', verze)` a `apply` účinků – vše v jedné transakci (prohraný souběh = „Jednání už skončilo.“).
- `NEGOTIATION_EFFECTS: Record<TermItem['kind'], NegotiationEffect>` – `oath` zakládá vazalství `origin: 'negotiation'`, `terms: {}`; druhý pán přibude vedle stávajících, stejná dvojice už svázaná nic nepřidá (`create` vrátí živé). Nový druh řádku bez účinku se nepřeloží.
- `blockPlayer` / `unblockPlayer` – zablokování ukončí rozběhnuté jednání dvojice (`ended`), zablokovaný dostane upozornění `blocked`; stávající dohody zůstávají. Opakované zablokování nic nezapíše.
- `restartGame` (s `negotiations` v `DynastyDeps`) po ukončení rodu ukončí jeho otevřená jednání (`tx.openOf`).
- Upozornění (`PlayerNoticeKind`): `negotiation-offer` / `-counter` / `-accepted` / `-rejected` / `-withdrawn` a `blocked`; payload `{ negotiationId, houseId, name }` (jen veřejné údaje, žádné id účtů); NPC rod upozornění nedostane. Texty v `apps/web/lib/player-notices.ts`, panel `house`.
- Kronika (neutrální záznamy, žádné hodnocení): `ChronicleEvent` druhy `negotiation` (`step` offer / counter / rejected / withdrawn), `negotiation-accepted` („Ctibor se stal vazalem Bořivoje.“) a `blocked` („Bořivoj zablokoval Ctibora.“); jména jsou hlavy rodů, bez jména `Rod bez jména`. Zapisuje se do **vlastní vsi obou rodů** (`house.lord.villageId`) přes schránku **až po** úspěšné transakci (jiná tabulka); `ref` = `neg:<jednání>:<počet kol>:<krok>:<ves>`, resp. `block:<blokující>:<blokovaný>:<ms>:<ves>` – opakování je bezpečné, selhání schránky akci nevrací.
