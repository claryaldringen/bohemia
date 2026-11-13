# Výjezd vojvody (`packages/game/src/domain/war` – `journey*.ts`)

Pravidla: [lord-control.md](../design/lord-control.md) – Rozkazy, Na místě a návrat, Pohyb, Zásoby
a zima. Plán: `docs/superpowers/plans/2026-11-13-lord-control.md`. Výjezd stojí vedle tažení
(`war.md` – Tažení po taktech) – nemá válku ani cílovou ves – a sdílí s ním takty, pohyb po mapách,
tempo a svět `CampaignWorld`.

## Stav a krok (Úloha 1)

- **Stav** – `journey-types.ts`: `JourneyState` je JSON (kontrolní bod): `kind: 'journey'`, `seed`,
  `tick` a `day` posledního spočteného taktu, `throughDay` (jako u tažení – mez bariéry vsí), `phase`
  (`JourneyPhase`: `out` → `returning` → `done`), hráč, rod (`houseId`), `leaderName`, domovská ves
  `home` (`CampaignVillage`), muži `members` a právě jedna skupina `groups[0]` (`CampaignGroup` – tvar
  tažení, bariéra čte `groups[].cell`). `arrivedTick` = takt posledního dojetí, od kterého běží
  čekání; null = skupina jede. `JourneyMember`: `ref` osoby, která zůstává ve stavu domovské vsi,
  `lord` (vojvoda – hráčův muž), `mounted`, `strength` a `fight` při vyslání, `health`, `wounded`,
  `status: 'active' | 'fallen'`.
- **Rozkazy** – `JourneyOrder`: `go` (místo na mapě, na které skupina je), `cross` (sousední políčko
  v 8 směrech; jiné se zahodí beze změny stavu – cíl do pohledu je místo naproti na okraji sousední
  mapy, `edgeCrossing`), `home`. `JourneyIntent { tick, seq, byPlayer, body }` jako záměr tažení:
  platí přesně ve svém taktu v pořadí `seq`, rozkaz v minulosti a cizí hráč se zahodí. Nový rozkaz
  nahradí starý a zruší čekání; `go` a `cross` vrátí i vracející se výjezd do `out`.
- **Krok** – `journey.ts`: `newJourney(input, clock)` – skupina doma s prvním rozkazem `order`, takt
  vyslání z `startMs` (`tickOfMs`); `journeyFinished`; `stepJourney(state, toTick, intents, world)` →
  `JourneyStep { state, villageEvents, notices, waiting }` – čistá, vstup nemění, takt na kopii
  (`cloneData`) jako `stepCampaign`. Takt: na začátku nového dne denní krok `homeDay`, rozkazy
  taktu, konec čekání, pohyb `moveGroup`. Chybí-li mapa nebo ves (`MissingData`; mapy potřebné hned
  hlídá `missingMaps`), výsledek je stav na konci posledního celého taktu a `waiting`.
- **Denní krok** – `homeDay` jen kontroluje členy doma: žádné jídlo, mráz ani dezerce (muži jedí dál
  ze zásob své vsi). Domovská ves `world.villageAt(home, den)`: muž, který v jejím stavu není (zemřel
  – stáří, hlad), je `fallen`; zemře-li vojvoda, zbytek jede domů sám (`turnHome`) a rozkazy hráče
  se zahazují; bez živých členů `done` bez událostí. Ves bez spočteného dne → krok čeká jako tažení;
  ves, která zanikla (volitelný `CampaignWorld.villageGone` – svět ji zkusil načíst a není), výjezd
  ukončí bez událostí. Den vyslání se nekontroluje – muže ověřilo vyslání.
- **Čekání** – po dojetí skupina stojí; po `JOURNEY.waitDays` (3) herních dnech bez rozkazu
  (`waitTicks` – takty jako `absentTicks` tažení) jede domů sama. Každé dojetí počítá lhůtu znovu.
- **Pohyb** – `moveGroup` jako vojsko: `settleGoal` (cíl v neprůchodné buňce na nejbližší
  dosažitelné místo), `stepMover` tempem `marchSpeed` nejpomalejšího ze živých mužů (jen jezdci
  × 1,5, pěší raněný × 0,75, sníh × 0,75). Brány jsou v míru otevřené – mřížka pochodu je zavírá jen
  v boji. Rozkaz `cross` končí přechodem okraje: skupina stojí, kde na sousední mapu vstoupila (cíl
  = to místo). Skupina, která nemá kudy, stojí; při návratu výjezd skončí jako u tažení. Vsím na
  cestě se nic neohlašuje – žádné `army-seen`, `raid-day`, varování ani upozornění.
- **Návrat** – dojetí domů → `done`: domovská ves dostane jednu událost `away-ends` (`refId` = id
  výjezdu, `untilDay` den nato – do schránky na následující den jako výsledky tažení; `ref` =
  `journey:<id>:<takt>:<n>`) a hráč upozornění `journey-returned` s `{ journeyId, leader }` – text
  „Bořivoj se vrátil.“ (`player-notices.ts` ve webu, panel zatím žádný). Vrátí-li se družina bez
  vojvody, upozornění nejde – vojvoda se nevrátil (návrh Clauda).
- **Čísla** – `JOURNEY` v `rules-war.ts`: `waitDays` 3, `predatorGroupMax` 2 (šelmy – Úloha 13),
  `trailStepM` 20 (stopa odkrytého – Úloha 6). Tempo a věk mužů bere výjezd z `WAR`.
- **Sdílené s tažením** – `movement.ts`: `sendGroup`, `settleGoal` a `missingMaps` (přešly
  z `campaign.ts` beze změny chování) vedle `stepMover`.
- **Testy** – `domain/war/__tests__/journey.test.ts` (svět v paměti): rozkazy, čekání, návrat, tempo,
  zima bez mrazu, brána, bez vedlejších účinků, vcelku = po 7 taktech přes JSON, chybějící mapa,
  člen zemře doma, domovská ves zanikne.

## Vyslání (Úloha 2 – `application/launch-journey.ts`, `journeys.ts`)

- **Port** `JourneyRepository` (`application/journeys.ts`) – stejná sémantika kontrolního bodu a
  záměrů jako `CampaignRepository` (`create`, `active`, `checkpoint`, `intentsAfter`, `saveCheckpoint`,
  `clearOutbox`, `addIntent`) plus `activeOf(playerId)` (hráč má nejvýš jeden výjezd; vrací id nebo
  null) a `onCell(cell)`. Paměťové úložiště: `application/__tests__/in-memory-journeys.ts`.
- **`journeyCandidates`** – vojvoda (`currentLord`) a muži rodu od 16 let (`lineCandidates`: doma, ne
  ranění, ne zajatí, ne na tažení nebo výjezdu) s `mounted` podle vlastního jezdeckého koně
  (`riderId`) a `strength` = `lineManStrength`. Důvod odmítnutí (`JourneyRefusal`) v tomto pořadí:
  `no-lord` (i cizí ves), `lord-young`, `lord-wounded`, `lord-away`, `village-attacked`
  (`CampaignRepository.activeAgainst` na vsi), `journey-active`.
- **`launchJourney`** – volající drží zámek hráče, jen vlastní ves. Ověří vojvodu, družinu
  (`bad-retinue`: muž mimo kandidáty, vojvoda v družině, duplicita, neceločíselné id) a první rozkaz:
  `go` s nekonečným číslem, bodem mimo mapu nebo místem, kam skupina nedojde (`reachableGoal`), a
  `cross` na nesousední políčko jsou `unreachable`; rod bez místa na mapě světa také. Dotaz
  `atWar(playerId, cell)` pro políčko cíle prvního rozkazu (`go` = domovská mapa) vrátí-li `true` →
  `war-there`. Pak ves uloží s `away: { kind: 'journey', refId }` (bez `untilDay` – návrat ukončí
  `away-ends` výjezdu) u vojvody i družiny – vojvoda a družina se při tom ověří znovu na čerstvém stavu
  (souběžný zápis) – a založí výjezd (`newJourney`; `fight` = `arms.combat`, `strength` při vyslání,
  `health` 100). Selže-li založení, muži se vrátí a chyba se předá dál.
- **`houseAtWarOn(deps, playerId, cell)`** (`application/journey-war.ts`) – je rod hráče ve válce
  s rodem, kterému patří mapa na políčku (`SettlementRepository.holderAt` – držitel aktivní mapy na
  jednom políčku, v DB přes unikátní index `settlement_grid_idx` – → `activeOf` → `activeBetween`)?
  Stejný podpis převezmou rozkazy (Úlohy 4 a 5); ve vstupních bodech `GameDeps.atWar`.
- **Muži pryč a stěhování** – tažení ani výjezd muže se `away` ze stavu vsi nikdy nezvedají:
  sňatky (`marriage.ts`) a odchody (`departure.ts`, `son-departure.ts`) `away` nečtou, stejně jako
  u mužů na tažení. Krok výjezdu proto hledá člena jen ve vsi `home`; stěhování nechráněno ani u tažení.

## Úložiště (Úloha 3 – `packages/db`)

- **Tabulky** (`schema/journey.ts`, migrace `0045_journey_storage`): `journey` (`id`, `player_id`,
  `status` `active` / `done`, `created_at`), `journey_checkpoint` (`journey_id` = PK a FK, `tick`,
  `state`, `outbox`, `updated_at`) a `journey_intent` (`seq`, `journey_id`, `tick`, `by_player`,
  `body`). Částečný unikátní index `journey_player_active_idx` (`player_id WHERE status = 'active'`)
  zaručí nejvýš jeden běžící výjezd hráče i při souběhu – druhé `create` vyhodí chybu databáze
  (`launchJourney` vrátí muže domů). `journey_status_idx` a částečný `journey_checkpoint_outbox_idx`
  (`WHERE outbox IS NOT NULL`) slouží bariéře vsí.
- **Adaptér** `createJourneyRepository` (`adapters/journey-repository.ts`) – stejná sémantika zápisu
  jako `createCampaignRepository`: `saveCheckpoint` zamkne bod (`FOR UPDATE`) a vrátí `stale`, když se
  bod posunul nebo přibyl záměr do spočtených taktů, `addIntent` sdílí řádek bodu (`FOR SHARE`) a
  nezapíše záměr s taktem nejvýš bodem ani u skončeného výjezdu, verze bodu je `xmin`. `activeOf`
  vrací nejvýš jedno id, `onCell` čte políčko skupiny z `state->'groups'`. Skončený výjezd
  (`phase: 'done'`) přepne `status` na `done`; s nedoručenými událostmi ho `active()` vrací dál.
- **Bariéra** (`adapters/village-holds.ts`) – tabulka `live` bere vedle bodů tažení i body běžících
  výjezdů (sjednocení id jako u tažení) bez varování; mez vsi je `throughDay` bodu a drží ji ves na
  mapě skupiny nebo políčko od ní. `GameDeps.journeys` (`packages/server/src/deps.ts`).

## Worker (Úloha 4 – `application/step-journeys.ts`)

- **Kolo** – `stepJourneys(deps, { nowMs })` → `JourneyResult[]` (`journeyId`, `outcome` jako
  `CampaignOutcome` tažení, `error`): každý aktivní výjezd (`JourneyRepository.active` – běžící,
  nebo s nedoručenými událostmi) pod zámkem tažení (`CampaignLock`, klíč = id výjezdu) do taktu
  `tickOfMs(nowMs)`; chyba jednoho výjezdu ostatní nezastaví (`failed`), cizí zámek = `busy`.
  Cyklus jako `stepOne` tažení: bod → doručit schránku bodu → záměry → dopočet → uložit →
  doručit. Bod se uloží nejvýš po `CHECKPOINT_TICKS` (40) taktech, hned s událostmi, na konci
  výjezdu a když výjezd čeká na ves (bariéra – mez vsi povyroste).
- **Dopočet s načítáním** – `computeWithLoads(deps, state, step)` v `step-campaigns.ts` je
  zobecněný dopočet tažení (`computeCampaign` ho volá nad `stepCampaign`, výjezd nad `stepJourney`):
  chybí-li taktu mapa nebo ves (bariéra Ú6.7), načtou se a výpočet pokračuje od zastaveného taktu.
  Svět dodá `villageGone` (ves se zkusila načíst a není) – výjezd, jehož domovská ves zanikla,
  skončí bez událostí a nečeká na ni navždy.
- **Doručení právě jednou** – návrat do vsi (`away-ends`) a upozornění `journey-returned` se uloží
  se stavem do schránky bodu (`outbox`), pak je doručí `deliverOutbox` (sdílené s tažením – ves,
  která zanikla, se přeskočí, týž `ref` schránka vsi podruhé zahodí) a `clearOutbox` schránku smaže.
  Pád mezi uložením bodu a doručením: další kolo najde `outbox` v bodu a doručí ho (výjezd
  s nedoručenými událostmi je aktivní i po `done`). **Známé omezení** (audit A5, platí i pro
  tažení): pád po doručení a před smazáním schránky pošle upozornění podruhé – události vsí mají
  `ref`, upozornění ne; oprava mění schéma upozornění.
- **Vjezd na mapu rodu ve válce** – `homeFromWar`: kolo se na válku ptá
  (`StepJourneysDeps.atWar` = `houseAtWarOn`, ve workeru `GameDeps.atWar`) **jen když skupina ve
  spočteném stavu stojí na jiném políčku** než ve stavu, od kterého kolo počítalo (návrh Clauda po
  Martinově otázce 13. 11. 2026, proč se worker na válku ptá každou sekundu). Je-li
  výjezd venku (`out`) a nová mapa patří rodu ve válce, kolo zapíše za hráče rozkaz `home`
  (`addIntent`, `byPlayer` = hráč výjezdu, takt teď + `INTENT_LEAD_TICKS` jako rozkaz hráče). Jednou:
  výjezd ve fázi `returning` ani výjezd s čekajícím „Domů“ hráče se neptá. Bez paměti workeru kolo
  počítá od bodu, takže se po vjezdu ptá i v dalších kolech, než se bod uloží – zapíše ale stejně
  (čekající „Domů“, pak `returning`). Pravidlo: lord-control.md – Pořadí zavedení.
- **Začátek války** – `recallJourneysAtWar(deps, { houses, nowMs })` (`journey-war.ts`), volají ho
  `declareWar` i `startWarByAttack` (přepadení vysláním tažení) po založení nové války
  (`WarDeps.journeyRecall`, ve webu `journeyRecallDeps()` – `house.ts`, `army.ts`; bez závislosti
  nic). Běžící výjezd hráče každého z obou rodů, jehož skupina stojí na mapě druhého rodu nebo tam
  míří, dostane rozkaz `home` za hráče (takt teď + `INTENT_LEAD_TICKS`). Kde skupina může být:
  políčko a cíl (`goal.cell`) skupiny v kontrolním bodu a políčka rozkazů `cross` zapsaných po bodu
  (bod bývá až o 40 taktů starší než výpočet workeru). Mapa druhého rodu = `holderAt` → `activeOf`.
- **Paměť workeru** – vlastní instance `newCampaignMemory<JourneyState>()` (`CampaignMemory` má
  typ stavu jako parametr; poslední spočtený stav, mapy a vsi minulého kola, mřížky pochodu): konec
  kola (`forgetEnded`) zapomene záznamy, jejichž id mezi aktivními není, takže sdílená paměť
  s taženími by každé kolo zahodila záznamy druhé smyčky. Bod výjezdu se čte celý v každém kole –
  úložiště výjezdů verzi bodu zvlášť nehlásí (`CampaignMemory.points` jen u tažení).
- **Smyčka** – `apps/worker/src/campaign-loop.ts`: po `stepCampaigns` pustí kolo v témže okamžiku
  `stepJourneys` (`CampaignLoopDeps.journeys`; `main.ts` – úložiště `gameDeps.journeys`, zámek,
  mapy a vsi jako tažení, `gameDeps.atWar`). Chyby výjezdů se hlásí zvlášť od tažení
  („chyba výjezdu …“, „kolo výjezdů selhalo: …“ – stejná nejvýš jednou za minutu).
- **Testy** – `application/__tests__/step-journeys.test.ts` (porty v paměti, `houseAtWarOn` nad
  rody, sídly a válkami v paměti): kola s restartem = vcelku (dojetí, čekání, sám domů; `away-ends`
  i upozornění jednou), s pamětí tytéž body jako bez ní, druhé kolo od zapamatovaného stavu, pád mezi
  uložením a doručením (schránka vsi, upozornění), kolo bez změny mapy se na válku neptá (počet
  dotazů), vjezd na mapu rodu ve válce → „Domů“ jednou, chyba jednoho výjezdu, zaniklá domovská ves;
  `recallJourneysAtWar` – skupina na mapě protivníka, jede tam s „Přes okraj“ (i výjezd druhého rodu),
  „Přes okraj“ po bodu, výjezd jinde nic; `war.test.ts` – opověď i přepadení výjezd pošlou domů,
  další útok už ne; `settlement-repository.db.test.ts` – `holderAt`;
  `apps/worker/src/__tests__/campaign-loop.test.ts` – výjezdy v kole.
