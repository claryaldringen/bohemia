# Výjezd vojvody (`packages/game/src/domain/war` – `journey*.ts`)

Pravidla: [lord-control.md](../design/lord-control.md) – Rozkazy, Na místě a návrat, Pohyb, Zásoby
a zima, Co vojvoda vidí. Plán: `docs/superpowers/plans/2026-11-13-lord-control.md`. Výjezd stojí vedle tažení
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
- **Začít znovu** – `restartGame` ukončí běžící výjezd hráče (`JourneyRepository.end`, návrh Clauda):
  bod dostane `phase: 'done'` a prázdnou schránku, výjezd `status: 'done'` – bez událostí do vsí
  a bez znalosti. Domovská ves je v archivu a dál se nedopočítá, výjezd by na ni jinak čekal
  navždy, držel bariéru a nová hra by nesměla vyslat (`journey-active`). `end` zamkne řádek bodu
  jako `saveCheckpoint`; `saveCheckpoint` skončeného výjezdu s neskončeným stavem vrátí `stale`,
  takže souběžný worker výjezd neoživí. Výjezd ukončí i opakovaný restart bez vsí (pád mezi
  archivem a koncem výjezdu).
- **Bariéra** (`adapters/village-holds.ts`) – tabulka `live` bere vedle bodů tažení i body běžících
  výjezdů (sjednocení id jako u tažení) bez varování; mez vsi je `throughDay` bodu a drží ji ves na
  mapě skupiny nebo políčko od ní a **domovská ves běžícího výjezdu** (`state.home.villageId`, ve
  `LIVE` sloupec `homes`, v `alarmed` vedle vsí varování – i přednostní vsi). Výjezd čte domov
  každý den (`homeDay` – smrt člena doma); bez meze by ves mohla být napřed a na pořadí smyček
  workeru by záleželo, kdy výjezd smrt pozná (závěrečná recenze, návrh Clauda). Skončený výjezd
  domov nedrží. Testy: `village-holds.db.test.ts`, `campaign-race.db.test.ts` (worker vsí domovskou
  ves nedopočte za `throughDay` výjezdu). `GameDeps.journeys` (`packages/server/src/deps.ts`).

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
  Spící ves na mapě skupiny (vymřelá nebo opuštěná – worker ji nedopočítá, její `lastDay` stojí) se
  bere jako hotová: `villageAt` jí pro jakýkoli den vrátí uložený stav, skupina na ni nečeká (Ruling 40).
  Svět dodá `villageGone` (ves se zkusila načíst a není, nebo je její sídlo v archivu) – výjezd,
  jehož domovská ves zanikla, skončí bez událostí a nečeká na ni navždy. Archiv
  (`VillageRepository.archivedOf`) se zjišťuje líně jako varování tažení: až když se takt ptá na
  zánik načtené vsi, která den ještě nemá – pojistka pro výjezd, který přežil restart jinou cestou.
  Tažení se na zánik neptá, archiv pro něj nečte.
- **Doručení právě jednou** – návrat do vsi (`away-ends`) a upozornění `journey-returned` se uloží
  se stavem do schránky bodu (`outbox`), pak je doručí `deliverOutbox` (sdílené s tažením – ves,
  která zanikla, se přeskočí, týž `ref` schránka vsi podruhé zahodí) a `clearOutbox` schránku smaže.
  Pád mezi uložením bodu a doručením: další kolo najde `outbox` v bodu a doručí ho (výjezd
  s nedoručenými událostmi je aktivní i po `done`). **Upozornění mají klíč** (audit A5): krok po
  každém taktu je označí `ref` `journey:<id>:<takt>:n<pořadí>` (tažení `camp:…`, `stampNotices` v
  `campaign-tick.ts`), `NoticeRepository.post` s už existujícím `ref` téhož hráče nic nezapíše
  (`player_notice.ref` + částečný unikátní index) – pád po doručení a před smazáním schránky tak
  upozornění nezdvojí. Ostatní volání `post` jsou bez `ref` a zapisují vždy.
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
  dotazů), vjezd na mapu rodu ve válce → „Domů“ jednou, chyba jednoho výjezdu, zaniklá domovská ves,
  domovská ves archivovaného sídla (záznam zůstal, den stojí) a ves, která jen čeká na dopočet;
  `restart-game.test.ts` – restart ukončí výjezd (bez schránky, `activeOf` null, souběžné uložení
  `stale`); `journey-repository.db.test.ts` – `end`, `village-holds.db.test.ts` – ukončený
  výjezd nedrží, `village-repository.db.test.ts` – `archivedOf`;
  `recallJourneysAtWar` – skupina na mapě protivníka, jede tam s „Přes okraj“ (i výjezd druhého rodu),
  „Přes okraj“ po bodu, výjezd jinde nic; `war.test.ts` – opověď i přepadení výjezd pošlou domů,
  další útok už ne; `settlement-repository.db.test.ts` – `holderAt`;
  `apps/worker/src/__tests__/campaign-loop.test.ts` – výjezdy v kole.

## Rozkazy a pohled (Úloha 5 – `application/journey-view.ts`, `journey-order.ts`)

- **`orderAim`** (`journey-order.ts`) – jediné ověření rozkazu, společné pro `launchJourney` (vůči
  domovské vsi) a `commandJourney` (vůči políčku a poloze, kde skupina je). Vrací políčko, kam rozkaz
  míří (pro dotaz na válku; `home` = null), nebo `invalid` (neznámý druh rozkazu za běhu, bod mimo mapu, nekonečné číslo,
  `cross` na nesousední políčko) / `unreachable` (`reachableGoal` – skupina tam nedojde). Vyslání
  obojí hlásí jako `unreachable`, pozdější rozkaz `invalid` jako `refused`.
- **`journeyViewFor(deps, { playerId })`** – pohled na vlastní běžící výjezd z kontrolního
  bodu (výjezd se hledá podle hráče, cizí hráč dostane null): takt, den, fáze, políčko, domov, muži
  (padlí se neukazují), skupina a `waitDaysLeft` – celé dny do automatického návratu (3, 2, 1), jen
  když skupina po dojetí stojí a je `out`, jinak null. `controllable` = vojvoda žije.
- **`commandJourney(deps, { playerId, command, nowMs })`** – zapíše záměr na takt teď +
  `INTENT_LEAD_TICKS`. `refused`: bez výjezdu, skončený výjezd, vojvoda padl, neplatný vstup;
  `unreachable`; `war-there` (`atWar` na políčko cíle – `cross`, nebo mapa, kde skupina stojí).
  Pozor: poloha je z kontrolního bodu, který worker ukládá zřídka – rozkaz může mířit z mírně
  starého místa, zdrojem pravdy je krok výjezdu.
- **`visitorsOn(deps, { playerId, villageId })`** – jezdci na mapě vsi hráče (`onCell`). Hostitel vidí
  jako obránce ve válce: z domů vsi (`village.state.dwellings`) s mřížkou dohledu (`mapGrid`,
  `inSight`: 150 m, les 50 m); vlastní výjezd vždy. Vrací jen jméno vojvody, jméno rodu (`houseName`
  – hlava rodu jako v panelu Rod), takt, polohu, cíl na této mapě a muže (vojvoda, kůň). Cizí ves:
  prázdno. Ves hostitele na jezdce nereaguje – nic se nezapisuje.

## Objevování (Úloha 6 – `domain/war/seen.ts`)

- **Stav** – `JourneyState.seen` (volitelné): pro každé cizí políčko `x,y`, kde muži byli,
  `SeenCell` – `villageId` vsi na mapě, stopa `trail` (body `[x, z]` po `JOURNEY.trailStepM` 20 m,
  seřazené podle x, pak z, bez opakování; mlhu z ní odkryje prohlížeč stejným dohledem) a naposled
  viděné stavby `parts` seřazené podle klíče (`SeenPart`: `key` = druh a id – `dwelling:12`,
  `site:40`, `pen:3`, `sacred:7`, `church:55`, `fortification:2` –, místo `pos`, den `day` a data
  pro scénu `data`) a `since` – první den, kdy se záznam do mapy díval (Znalost rodu – pokrytí).
  Domovská mapa tu není – hráč ji zná celou.
- **Takt** – po pohybu `discover` (`journey.ts`): na cizí mapě `lookOnMap` s okem skupiny
  (`groups[0].pos`), mřížkou `gridOf` a stavem vsi `villageAt` pro den taktu. Ves bez spočteného
  dne krok zastaví (`MissingData`) – i když skupina stojí; mapu sousedního políčka proto krok čte už
  v taktu přechodu okraje. Jiná ves na mapě než dřív (stará zanikla) – stavby staré vsi se zahodí,
  stopa i `since` zůstanou (`lookOnMap` – totéž bere pohled tažení).
- **`lookAround(prev, { village, eyes, grid, day })`** – stavby v dohledu (`inSight`: 150 m, z lesa
  a do lesa 50 m) zapíše s dnešním stavem a dnem; známou stavbu, která ve vsi už není a její místo
  je v dohledu, zapomene; co je mimo dohled, zůstane („stará zpráva“). Co muži dnes už viděli, se
  týž den znovu nepřepisuje – stav vsi pro den je jeden. `prev` nemění a beze změny vrátí týž
  objekt, takže takt znalost map nekopíruje (`journeyTick` kopíruje stav bez `seen`). Stavbu, která
  v dohledu zmizela, zapíše do `SeenCell.gone` (`{ key, day }`, seřazené podle klíče; bez zániku
  pole chybí) – bez toho by ji sloučení se starou znalostí rodu vrátilo (Znalost rodu). První
  pohled do mapy zapíše `since`; záznam se stopou bez `since` (z doby před ním) ho nedostane.
- **`sightingsOf(village, day)`** – co je ve vsi vidět: obydlí včetně dvorce, staveniště obydlí
  a přestavby, modly a svatyně (i rozestavěné), ohrady, kostel i jeho staveniště a opevnění. Ne
  pole, sady, hřbitovy, lomy, stohy, jámy, cesty, lidé, zvířata ani zásoby; stavební huť nemá ve
  stavu vsi místo (mistři jsou lidé). Opevnění má body `eyesAt` = navzorkovanou křivku obvodu
  (`fortificationOutline`) – odkryje se celé, jakmile muž dohlédne na kterýkoli bod. Opevnění bez
  bodů (starší po čtvercích) převede už načtení vsi (`fort-points`).
- **Data** – `SeenData` nese jen to, co čte scéna: `SeenDwelling` (typ, poloha a natočení, stav,
  pozemek, řemeslo dílny, `plainShape`, průběh bourání), `SeenSite` (typ, poloha, průběh
  `buildProgress`, pozemek, řemeslo), `SeenPen` (druh, čtverce a mřížka, hotová, průběh, stav
  opuštěné ohrady, bourání), `SeenSacred`, `SeenChurch` (typ, rozměry, poloha, střecha, výzdoba,
  průběh `churchProgress`) a `SeenFortification` (celé opevnění a stavby na něm `SeenFortWork` –
  `done` bez kácení dřeva, takže `fortSegmentProgress` vyjde jako ze stavby). Nikdy lidi,
  domácnosti, zvířata, kněze, hroby ani zásoby (`storesKg`, dříví dílny, zahrada) – hlídá test.
  Od Úlohy 9a i `SeenThreshing` (humno hotové či rozestavěné, bourání – klíč `threshing:id`),
  `SeenKiln` (milíř: fáze, průběh, uhlí – `kiln:id`), `SeenKilnRemnant` (milířiště),
  `SeenRuin` (rozvalina obydlí vč. ohořelé, pozemek, řemeslo – `ruin:id`) a `SeenSacredRuin`
  (padlá modla či svatyně). U rozvalin a milířiště je `overgrowth` z dne pohledu (stará zpráva).
  Dům, který shořel, tak po pohledu na jeho místo ve znalosti zůstane jako rozvalina (zmizí
  `dwelling:id`, přibude `ruin:id`). Test úniku pokrývá všechny druhy včetně opevnění se stavbou.
- **Výkon** – seznam viditelného se pro týž objekt stavu vsi a den počítá jednou (`WeakMap`, nejvýš
  4 dny na ves jako `MarchGridMemo`; seznam je zmražený a data jsou kopie – výsledek na paměti
  nezávisí); obdélník bodů každé stavby je předběžné síto dohledu (obvod opevnění má stovky bodů).
  Měřeno 13. 11. 2026 – ves se 40 domy, palisádou a 2 staveništi, herní den = 344 taktů po kolech
  4 taktů jako ve workeru, medián ze 3 běhů, bez objevování → s ním: stojí ve vsi 0,8 → 9,4 ms za
  den s novým stavem vsi (mřížka cizí mapy 5,7 ms, seznam viditelného 0,2 ms), s plnou pamětí
  0,6 → 1,8 ms; jede kolem vsi 16,9 → 16,7 ms (nový stav vsi), 9,0 → 9,5 ms (s pamětí); stojí na
  mapě mimo dohled všeho 1,0 ms (bez síta 15,4 ms).
- **Pohled** – `JourneyView.seen`: `SeenCell` mapy, na které skupina je (od Úlohy 11 sloučený se
  znalostí rodu – Znalost rodu: Další výjezd); na domovské mapě null.
- **Testy** – `domain/war/__tests__/seen.test.ts`: dohled a les, dnešní stav, zmizelé, stará
  zpráva, opevnění celé prvním dohledem, stopa, bez lidí a zásob, mapa bez vsi, paměť;
  `journey.test.ts` – objevování za jízdy, vcelku = po kouscích i restart ze zmraženého bodu při
  průjezdu kolem vsi; `journey-view.test.ts` – `seen`.

## Cizí ves pro scénu (Úloha 9a – `apps/web/lib/journey-scene-view.ts`)

- **`seenVillageOf(seen, landscape)`** – `SceneVillage` cizí vsi jen ze znalosti `SeenCell`; `null` =
  nic známého. Tytéž tvary scény jako `sceneVillage` (pozemky `scenePlot`, opevnění
  `sceneFortifications` se stářím k dni pohledu, `demolitionSiteProgress`); kreslicí logika se
  nepíše znovu. Dostane krajinu cizí mapy (nad rámec zadání – pozemky a obvod opevnění ji
  potřebují).
- **Vynechává** (není z čeho kreslit): lidi a jejich činnosti (obydlí má `inhabited: false`, takže
  bez dýmu; kouř dílen se odvozuje z lidí), pole, zvířata a koně (ohrada je prázdná, `stocked:
false`, bez stohu sena), zásoby a stohy, cesty a pěšiny (`since`), průběh rozšiřování ohrady
  (čtverec `pending` bez `extension`), pec a jámy staveniště kostela (`site`), kněze a hroby,
  hřbitovy, sady, duby a háje, jámy, lomy, počasí; milíř a humno bez slámy, zrna a mlácení.
- **`journeyCellOf(view, home)`** – políčko, na které se scéna přepne za vojvodou; `null` = vojvoda
  je na vlastní mapě, nebo výjezd neběží.
- **Testy** – `lib/__tests__/journey-scene-view.test.ts` (totéž co vlastní ves, nic z lidí a polí,
  tvary jednotlivých druhů, `journeyCellOf`).

## Web (Úloha 7 – `apps/web`)

- **Composition root** `lib/journey.ts` – `journeyCandidatesForPlayer`, `launchJourneyForPlayer`
  (obojí přes `journeyActionForPlayer` v `lib/village.ts` = `guardedAction` s akcí `launchJourney`,
  právo `war`, zámek hráče, jen vlastní ves), `commandJourneyForPlayer`, `journeyViewForPlayer`,
  `visitorsOnVillage`, `journeyMapForPlayer`. Závislosti z `gameDeps()` (`journeys`, `atWar`),
  mapy z `campaignCells()`, mřížky dohledu v LRU.
- **Vstup** `lib/journey-input.ts` – `parseJourneyOrder` (`go` s konečnými čísly, `cross` s celými,
  `home`; přebytečné pole, `NaN`, `Infinity`, řetězec, neznámý druh = null) a
  `parseLaunchJourneyInput` (`{ villageId, retinue, order }`, družina = celá čísla, nejvýš 200).
  Význam (bod na mapě, soused, dosažitelnost, válka) ověřují use-casy.
- **Server actions** `app/game/actions/journey.ts` – `getJourneyCandidates(villageId)`
  (+ `reason` česky), `launchJourney(input)`, `commandJourney(order)`; odmítnutí = `{ error }`
  s textem `journeyReason`. `commandJourney` zámek vsi nebere (záměr do úložiště výjezdu, nemá čekat
  na dopočet vsi – jako pokyn do tažení).
- **Cesta API** `GET /api/journey` (`app/api/journey/route.ts`, session povinná, `no-store`):
  bez parametru `{ view: JourneyView | null }` (celý pohled, bez `?since=`); `?map=x,y` →
  `{ map: ForeignMap }` jen pro políčko skupiny a jeho sousedy, jinak 404 „Tu mapu rod nezná.“;
  `?visitors=<villageId>` → `{ visitors }` (cizí ves = prázdno).
- **Texty a pohled** `lib/journey-view.ts` – `journeyReason` („Tam vojvoda nedojde.“, „Vojvoda je
  raněný.“, „Vojvoda je na tažení.“, „Ves je napadena.“, „Tam je válka.“…), `interpolateJourney`
  (poloha skupiny mezi dvěma stavy na téže mapě), `JOURNEY_POLL_MS` (500).
- **Hook** `hooks/use-journey.ts` – `useJourney(running)`: dotaz 2× za sekundu jen s `running`
  (volající ví z vsi, že má výjezd, nebo právě vyslal) a ve viditelném panelu (`usePolling`);
  stejný `tick` pohled nepřepíše; `sample(nowMs)` pro scénu, `refresh()` po rozkazu.
- **Činnosti a upozornění** – `journeyActivity` v `lib/person-activity.ts` („je na cestě“, „čeká
  (2 dny)“, „vrací se domů“); upozornění `journey-returned` → „Bořivoj se vrátil.“
  (`lib/player-notices.ts`, Úloha 1).
- **Testy** – `lib/__tests__/journey-input.test.ts`, `journey-view.test.ts`, `person-activity.test.ts`.

## Ovládání (Úloha 8a – `apps/web`)

- **Rozkaz z kliknutí** – `lib/scene/journey-orders.ts`: `orderFromClick({ lordSelected, point,
mapSizeM, cell })` (čistá funkce) – bez vybraného vojvody nebo mimo terén null; v okrajovém pásu
  `EDGE_BAND_M` (20 m) `cross` na souseda políčka (8 směrů, v rohu úhlopříčně), jinak `go` na bod.
  `edgeDirection` dává směr okraje i kurzoru. Mapa je vystředěná v počátku, sever = +z = +y mřížky.
- **Scéna** – `ScenePointer.setLordMode(mode)` (`LandscapeScene.setLordMode`): dokud je nastavený,
  pravé tlačítko ohlásí bod terénu (`pickGround`) a pixel plátna místo zrušení výběru a pohyb kurzoru
  volá `hover` (vrací CSS kurzor – šipka u okraje).
- **Hook** `components/game/village-game/use-lord-journey.ts` – `useLordJourney`: vybraný vojvoda
  (klik ve scéně, nebo na jeho portrét v řadě obyvatel panelu dvorce – `resident-select-<id>`)
  = `selected` je osoba s `view.dynasty.lordId`. Doma načte `getJourneyCandidates`, drží družinu
  (`retinue`) a pravým tlačítkem volá `launchJourney`; na cestě (`dynasty.journeyAway`, na mapě,
  kterou scéna ukazuje – domovské, nebo od Úlohy 9b i cizí za vojvodou) volá `commandJourney`; ikona Domů `{ kind: 'home' }`. Režim vojvody (`setLordMode`) zůstává
  zapnutý i při odepřeném výjezdu a během načítání kandidátů: `lordClick` (`journey-orders.ts`) rozhodne
  o pravém kliknutí – nic (mimo terén, načítání, vyslání čeká na odpověď – `launching`), důvod
  u kurzoru (`refuse`, výběr zůstává) nebo odeslání rozkazu. Dvojité pravé kliknutí nevyšle dvakrát
  (`useLordJourney` drží běžící vyslání v ref); kliknutí po úspěšném vyslání, než ves ví, že je
  vojvoda pryč, je už rozkaz výjezdu (`commandJourney`, server ho ověří). Důvod (`journeyReason`) a „Na sousední mapu“ ukáže `JourneyCursorNote` u kurzoru, v panelu je
  jen v popisku zašedlé řady. `useJourney(running,
onEnded)` se ptá jen s `running` (vojvoda pryč nebo právě vyjel); zmizí-li pohled, `onEnded`
  obnoví ves (upozornění „… se vrátil.“) a dotazy stojí, dokud ves návrat nepotvrdí. Chyba sítě
  dotazování nezastaví.
- **Rozhraní** – `LordJourneyPanel` (v panelu vybrané osoby, `PersonBody`): řada mužů rodu, kteří
  smějí jet (klik přidá / ubere, podkova `resources/jizda.png` = jezdec) a meč (`house/sword.png`)
  se silou skupiny; na cestě ikona Domů (`war/alarm-return.png`). `LordAwayBadge` v horní liště:
  portrét vojvody s podkovou, klik ho vybere. Panel muže na cestě ukazuje `journeyActivity`
  (`selectionDetails(…, journey)`). Pohled vsi nese `dynasty.journeyAway` (`dynasty-view.ts`).
- **Testy** – `lib/scene/__tests__/journey-orders.test.ts`, `hooks/__tests__/use-journey.behavior.test.tsx`,
  `lib/__tests__/dynasty-view.test.ts`, `person-activity.test.ts`, e2e `e2e/journey.spec.ts` (projekt
  `worker` – spec pouští worker jako `worker.spec.ts`).

## Scéna vsi (Úloha 8b – `apps/web`)

- **Jezdci** – `lib/scene/journey-riders.ts` (čisté): `SceneJourney` (z `JourneyView` a
  `JourneyVisitor`: výjezd, vlastní, jméno vojvody a rod, takt, poloha, cíl na mapě, muži, `arrived`,
  `phase`, `waitDaysLeft`). `journeyFormation` – hlouček kolem `group.pos` jako pochod vojska
  (`huddleSlots`: jezdci vpředu, vojvoda uprostřed, pěší za nimi, ranění vzadu). `ridersAt` – každý
  muž jde mezi stavy rovně ze své nakreslené polohy na nové místo a hledí, kam jde (hlouček se
  v zatáčce neotočí skokem); nový muž a skok přes mapu stojí rovnou. `JourneyGlide` – stav po
  výjezdech: nový takt nebo jiní muži = nový posun za dobu taktů mezi stavy (`glideMs`), stejný takt
  pohyb nepřeruší, omezený pohyb stojí na novém místě. `headingOf` – směr z posunu, jinak k cíli.
  `journeyFigures` – postavy a koně (`ARMY_LOOKS.line`, `ride` / `ride-trot` / `ride-idle`,
  `walk-spear`) stejnými instancemi jako vojsko (`ArmyRenderer.setJourneys` – žádný mesh ani vertex
  buffer navíc). `pickRider` – klik od země po hlavu jezdce. `journeyHorseIds` – koně jezdců
  vlastní vsi (`Horse.riderId`) ohrada nekreslí (`setRidingHorses`).
- **Praporek a hodiny** – `lib/scene/journey-marker.ts`: `journeyMarks` (návrh Clauda) – praporek na
  cíli vlastního výjezdu, dokud jede ven nebo čeká (`phase: 'out'`, cíl na této mapě – jádro cíl ve
  vodě posune na nejbližší dosažitelné místo, praporek stojí tam), hodiny nad středem skupiny
  s `waitDaysLeft`; cizí výjezd ani návrat domů praporek nemají. `JourneyMarker` – tyč a cíp
  z vlastní geometrie, hodiny `hourglassPixels` (RGBA, hodiny a číslice) natočené ke kameře, kreslí
  se přes vše; přepíše se jen při změně (žádné kreslení navíc). Použije i scéna cizí mapy (Úloha 9).
- **Napojení** – `SceneWarView.setJourneys` (drží výjezdy i přes novou krajinu) ←
  `LandscapeScene.setJourneys` ← `components/game/village-game/use-journey-scene.ts`:
  `sceneJourneysOf` (`lib/journey-view.ts`) – vlastní výjezd z `useJourney(...).latest` (poslední
  pohled bez interpolace – muže posouvá scéna), je-li skupina na mapě vsi; ostatní z
  `useJourneyVisitors` (`hooks/use-journey-visitors.ts` – `GET /api/journey?visitors=`, s jezdci na
  mapě 2× za sekundu, jinak po 5 s, poprvé hned; výpadek sítě ani chyba serveru dotazování
  nezastaví). Jméno a rod vlastního vojvody dodá jeho záznam mezi návštěvníky.
- **Výběr** – klik na vlastního muže vybere člověka vsi (`person` – panel z Úlohy 8a), na cizího
  `VillageTarget` `visitor` (`journeyId`): panel ukáže portrét koně se jménem vojvody, rod (ikona
  praporu) a počet jezdců a pěších (`selectionDetails(…, visitors)`, `visitor-panel`).
- **Den rodiny** – muž na výjezdu (`away: journey`) není v `SceneLord.trainees` (`sceneLord`
  v `village-view-scene.ts`), takže ho scéna nekreslí na dvorku ani na cvičišti; kreslí ho jako
  jezdce výjezdu. Ostatní nepřítomní (tažení…) zůstávají jako dosud.
- **Odjezd a příjezd** – viz níž (Úloha 8c).
- **e2e** – háček `journeyScene` (`lib/e2e-hooks.ts`: muži, jak jsou nakreslení, praporek a dny
  na hodinách); `e2e/journey.spec.ts` druhý test – dva hráči, jezdci jedou, praporek u cíle, hodiny
  při čekání, cizí výjezd u vsi (bod checkpointu přepsaný v DB)
  a klik na něj. `JOURNEY_SHOT=<cesta>` uloží snímek. E2e běží s omezeným pohybem (`reducedMotion`)
  – muži tam skáčou na nový stav, plynulý posun kryje `journey-riders.test.ts`. Cíl ve vodě
  (praporek na souši) závisel na náhodné krajině a byl nestabilní – kryje ho unit test
  `journey.test.ts` (posunutý `group.goal` leží na souši) a `journey-marker.test.ts` (praporek na
  `group.goal`).
- **Testy** – `lib/scene/__tests__/journey-riders.test.ts`, `journey-marker.test.ts`,
  `lib/__tests__/journey-scene.test.ts`, `hooks/__tests__/use-journey-visitors.behavior.test.tsx`.

## Odjezd a příjezd (Úloha 8c – `apps/web`)

Jen podívaná ve scéně vsi (lord-control.md – Ve scéně) – server o odjezdu ani příjezdu neví,
výsledek výjezdu se jimi nemění.

- **Logika** `lib/scene/journey-departure.ts` (čistá, výkonový čas jako `JourneyGlide`):
  `departureScripts` – muži vycházejí z vchodu dvorce po sobě (0,8 s), jezdec jde k místu vedle
  svého koně u kůlu, kůň k němu dojde z ohrady stejným strojem jako před jízdou dne rodiny
  (`riders.ts` – `leadPath`, `leadPose`, `LEAD_M_S` 1,2 m/s, `LEAD_WAIT_S` 10 s), jezdec nasedne
  (nejdřív 10 s po příchodu koně) a jede krokem k bráně; pěší jde k bráně rovnou. Za branou
  `JourneyLeave` – `catchUp`: muž jede se skupinou ze serveru a odstup od svého místa v hloučku
  stahuje tempem `CATCH_M_S` (pěší 3 m/s, jezdec 4,5 m/s – návrh Clauda) – svižněji, plynule,
  na konci přesně ve stavu `JourneyGlide`. `arrivalScripts` – opačně: z místa, kde jsou muži
  nakreslení, k bráně, jezdec krokem ke kůlu a sesedne, kůň jde krokem do ohrady a u branky vejde,
  muži vejdou vchodem do dvorce.
- **Kdy** (`JourneyLeave.observe` – ze stavů ze serveru, ne z paměti prohlížeče): odjezd jen
  čerstvě vyslaného vlastního výjezdu – při prvním pohledu je `phase: 'out'`, skupina jede
  (`arrived: false`) a stojí nejvýš `FRESH_M` (30 m) od místa vsi, odkud ji jádro vysílá
  (`villagePlace` = střed políčka `villageSite`); načtení stránky uprostřed výjezdu tak odjezd
  nepřehraje. Příjezd začne, když se vracející skupina přiblíží k místu vsi na `ARRIVE_M` (30 m),
  nebo když vlastní výjezd ze scény zmizí po fázi `returning` či nejvýš `HOME_REACH_M` (150 m)
  od místa vsi – worker ukládá kontrolní bod po 10 s, krátký návrat tak scéna ve fázi `returning`
  vůbec nemusí uvidět; skupina, která odjela přes okraj mapy, zmizí u okraje. Skončí, až jsou
  všichni v dvorci, koně v ohradě a výjezd ve scéně není. Omezený pohyb obojí přeskočí (muži stojí, kde je ukáže server). Cizí
  výjezdy z dvorce nevyjíždějí.
- **Místa** – `journeyYard(ctx)` (`villager-plan-lord.ts`, v plánu postav → `DraftCrew.yard` →
  `VillageVillagers.yard()` → `onCrew` → `SceneWarView.setJourneyYard` s místem vsi): vchod obydlí
  cvičiště (`manorDoor`), brána dvorce (`TrainingGround.gate` – uprostřed konce dvora, zemnice bez
  pozemku: kůl na koně), koně jezdců u kůlu vedle sebe (`hitchSpot`, vojvodův první) s cestou
  z branky ohrady (`leadGate` + `leadPath`, po pěšinách). Bez cvičiště (zemnice, kde rodina dnes
  necvičí) se nic nepřehrává.
- **Kreslení** – `ArmyRenderer`: `JourneyLeave.at` nahradí stavy `JourneyGlide` u výjezdu, který
  odjíždí nebo přijíždí; kůň bez jezdce je zvíře vojska (`journeyFigures(poses, led)`) – žádný mesh
  ani vertex buffer navíc. `LandscapeScene` – koně mezi ohradou a kůlem ohrada nekreslí
  (`journeyAway().horses` do `setRidingHorses`), muže, kteří přijíždějí, den rodiny nekreslí
  (`withoutMen` – jako muže na výjezdu), dokud příjezd neskončí; pak je převezme den rodiny.
- **e2e** – háček `journeyScene` hlásí `phase` (`departing` / `riding` / `arriving`), koně bez jezdce
  (`led`), bránu (`gate`) a koně mimo ohradu (`awayHorses`); `e2e/journey.spec.ts` třetí test bez
  omezeného pohybu – dvorec a ohrada koní v uloženém stavu, kůň opustí ohradu, vojvoda na koni
  projede branou, po Domů přijede a kůň je zpět v ohradě. `JOURNEY_DEPARTURE_SHOT=<cesta>` uloží
  snímek odjezdu.
- **Testy** – `lib/scene/__tests__/journey-departure.test.ts` (pořadí kroků, pěší, dohánění bez
  skoku, příjezd opačně, omezený pohyb, načtení uprostřed výjezdu, brána dvorce).
- **Známé omezení** – rozkaz ven během příjezdu (skupina u vsi se znovu otočí) příjezd nepřeruší –
  muži dojedou do dvorce a výjezd se pak ukáže, kde je podle serveru.

## Scéna cizí mapy (Úloha 9b – `apps/web`)

lord-control.md – Co vojvoda vidí, Co hráč vidí (Na cestě), Ve scéně. Scéna jde za vojvodou z mapy
na mapu jako za vojskem (web-ui.md – Cizí mapa ve scéně).

- **Přepnutí** – `watchedJourneyCell(following, view)` (`lib/journey-scene-view.ts`, čistá): sleduje-li
  hráč vojvodu, políčko cizí mapy, na které skupina je; null – scéna vsi (nesleduje, výjezd skončil,
  nebo je skupina zpět na domovské mapě – po 3 dnech čekání či po Domů). Klik na `LordAwayBadge`
  (`away.onSelect` v `useLordJourney`) vojvodu vybere a je-li na cizí mapě, zapne sledování; skupina
  na domovské mapě sledování vypne (návrat scény nečeká na konec výjezdu – upozornění „… se vrátil.“
  přijde, až dojede). `useLordJourney` vrací `watching`, `back` (⌂ – výjezd běží dál) a
  `bindForeign`. `VillageGame` při `watching` vrátí jen `ForeignJourneyScene` (klíč = políčko) –
  jedna scéna Babylonu naráz jako u tažení; nové políčko = nová scéna a krajina.
- **`ForeignJourneyScene`** (`foreign-scene`, `data-cell`, `data-journey`): krajina z
  `GET /api/journey?map=x,y` (404 nebo chyba = zpět na ves) do `GameView`, jezdci vlastního výjezdu
  z `journey.latest` (`sceneJourneysOf` bez návštěvníků) s praporkem a hodinami
  (`journey-marker.ts`), stavby `seenVillageOf(seen, krajina)` → `setVillage` – přestaví se jen při
  změně znalosti (`seenSceneKey`: ves, klíč a den každé stavby). Odjezd ani příjezd se tu nekreslí
  (scéna nemá dvorec – `setJourneyYard` se nevolá). Kamera poprvé na skupinu (R se k ní vrací).
  Rozhraní vlevo nahoře: ⌂ (`foreign-back`), portrét vojvody (`LordAwayBadge`, výběr) a ikona Domů
  (`LordJourneyPanel` na cestě); důvod a „Na sousední mapu“ u kurzoru (`JourneyCursorNote`).
- **Rozkazy** – `bindForeign({ scene, mapSizeM })` předá `useLordJourney` scénu cizí mapy; režim
  vojvody (`setLordMode`) pak běží na ní s políčkem `watching` – `go` po mapě, okrajový pás → `cross`
  na souseda cizí mapy, důvod u kurzoru jako doma.
- **Výběr klikem** – `useLordJourney` poslouchá `onSelect` scény cizí mapy a výběr drží jako ve vsi
  (`foreignJourneySelection` – `nextSelection` jen s muži vlastního výjezdu): klik na vojvodu ho
  vybere (režim vojvody), na jiného muže družiny toho muže, do prázdna výběr zruší (s Ctrl / Shift
  nechá); stavby cizí vsi a zvěř jsou klik do prázdna – jejich id patří cizí vsi. Scéna má vždy
  aspoň prázdnou ves – bez ní `pickTarget` muže výjezdu nehledá.
- **Mlha** – `LandscapeScene.setJourneyFog(trail)` → `SceneWarView` (drží stopu i přes novou krajinu)
  → `ArmyRenderer`: závoj `fog-veil` jako při tažení; body stopy `SeenCell.trail` odkryje
  `exploreTrail` (`fog-of-war.ts` – stejným dohledem jako muže, jen do objeveného, každý bod jednou),
  v dohledu (jasno) je okolí vlastních jezdců (`SceneJourney.pos` – oko skupiny jako v jádru) z
  posledního stavu; s mlhou války (scéna tažení, Úloha 12b) stopa jen přidá odkryté a dohled dává
  vojsko (`updateFog` – jedna mlha). Bez jezdců závoj zůstává.
- **e2e** – háčky `journeyFog` (stav mlhy v bodě), `foreignVillage` (obydlí, která scéna kreslí),
  `journeyScene`, `projectToScreen`, `moveCameraTo` a `armyStats` míří na scénu cizí mapy;
  `e2e/journey-worker.spec.ts` (projekt `worker`): ves B na políčku vedle A, skupina A přesunutá
  v kontrolním bodu na mapu B, klik na portrét → `foreign-scene` s políčkem B, jasno u jezdců,
  vzdálený dům B neobjevený a nenakreslený, dům u skupiny ano, hodiny, klik do prázdna zruší výběr
  (panel výjezdu zmizí) a klik na vojvodu ve scéně ho vybere zpět, pravé tlačítko → praporek
  v cíli, místo odjezdu šeré, po Domů (skupina přesunutá na domovskou mapu ≈ 180 m od vsi) zpět na
  ves, ještě než výjezd skončí, a „Bořivoj se vrátil.“ (v liště jen 6 s – hlídá se od návratu
  scény). `JOURNEY_FOREIGN_SHOT=<cesta>` uloží snímek (kamera oddálená háčkem `moveCameraTo` s
  vzdáleností). Sdílené kroky e2e výjezdu jsou v `e2e/journey-helpers.ts`.
- **Testy** – `lib/__tests__/journey-scene-view.test.ts` (`watchedJourneyCell`, `seenSceneKey`,
  `foreignJourneySelection`),
  `lib/scene/__tests__/fog-of-war.test.ts` (`exploreTrail`).

## Znalost rodu (Úloha 10 – `application/knowledge.ts`, `packages/db`)

Co muži za jízdy viděli, se po návratu neztratí: rod si pamatuje znalost po políčkách světa
(soukromě – čte ji jen rod). Používá ji další výjezd, tažení i známá mapa z domova (další úlohy).

- **Sloučení `mergeKnowledge(old, fresh)`** (`domain/war/seen.ts`, čistá funkce): stopy sjednotí
  (seřazené, bez opakování); ze dvou záznamů téže stavby platí z novějšího dne; stavba, která má
  v `gone` (staré i nové znalosti) záznam se stejným nebo pozdějším dnem, se odstraní – shořelý dům
  se nevrátí, rozvalina (`ruin:`, jiný klíč) zůstane; stavba, která ve `fresh` není a zánik nemá,
  zůstane („stará zpráva“). Záznamy `gone` mají u každého klíče nejnovější den a zánik, který
  přebila novější stavba téhož klíče, se zahodí. Jiná ves na mapě (`villageId`) – staré stavby i
  zánik se zahodí, stopa zůstane. Výsledek nezávisí na pořadí `parts` a sloučit totéž podruhé nic
  nezmění.
- **Pokrytí** (kola oprav Úlohy 11, návrh Clauda): záznam je od svého `since` v dohledu stopy
  úplný – co tam stálo, `lookAround` zapsal. Sloučení proto odstraní stavbu druhé strany, kterou
  záznam nemá, viděnou před jeho `since` a jistě v dohledu stopy (`surelySeen`), a zanechá `gone`
  s dnem `since` toho, kdo zánik zjistil. Platí oběma směry a sloučené `gone` se uplatní na části
  z obou stran (část s `day` nejvýš ke dni zániku téhož klíče se zahodí, novější zůstane a záznam
  zániku se zahodí) – `merge(a, b)` = `merge(b, a)`, starší zpráva doručená po novější zaniklou
  stavbu nevrátí (tažení vidí dům den 5 a doručí až den 40, výjezd doručil prázdné místo den 20).
  Sloučení nemá mřížku, bere lesní dohled 50 m (`WAR.sight.forestM`) odkudkoli z okolí bodu stopy,
  kde muž mohl stát (body jsou zaokrouhlené po 20 m – nejvzdálenější roh čtverce ± 10 m; místo
  50 m od bodu by mohlo smazat dům v lese, na který muž nedohlédl). Dál od stopy zůstane stará
  zpráva, stavba viděná jiným záznamem až po `since` zůstane. `since` výsledku je nejmenší z obou
  (jediné bezpečné číslo pro sjednocenou stopu), proto je asociativita jen přibližná: sloučí-li se
  nejdřív záznamy s různým `since`, pokrytí pozdějšího se zeslabí (stavby se kvůli tomu nevrací,
  jen může zůstat starší stará zpráva nebo jiný den v `gone`).
- **Vydání z kroku** – `JourneyStep.knowledge?: { cell, seen }[]` (`journeyTick`, `shareKnowledge`):
  celý `SeenCell` mapy při přechodu okrajem (mapa, kterou skupina opouští), při dojetí (mapa, na
  které stojí) a při konci výjezdu venku (poslední živý člen zemřel doma). Domovská mapa a mapa bez
  záznamu nic nevydají. Takt, který se kvůli chybějícím datům zahodí, nic nevydá.
- **Doručení** – `CampaignOutbox.knowledge?: { houseId, cell, seen }[]`: `stepOne` ji vloží do
  schránky bodu (i bod jen se znalostí se hned uloží) a `deliverOutbox` (společný s tažením, jehož
  chování se nemění) ji po uložení doručí `KnowledgeRepository.merge`. Pád mezi uložením a
  doručením doručí další kolo znovu – bezpečné, sloučení je idempotentní.
- **Port `KnowledgeRepository`** (`of(houseId, cell)`, `cellsOf(houseId)`, `merge(houseId, cell,
seen)`) a adaptér `createKnowledgeRepository` (`adapters/knowledge-repository.ts`): `merge` je
  jedna transakce – řádek založí (`ON CONFLICT DO NOTHING`), přečte `FOR UPDATE`, sloučí
  `mergeKnowledge` a zapíše; výjezd a tažení tedy smí psát do téhož rodu a políčka současně.
  Adaptér herní logiku nemá. V `GameDeps.knowledge`, v `journeyDeps` i `campaignDeps` workeru.
- **Další výjezd (Úloha 11)** – `journeyViewFor` (`seenOn`) přečte znalost rodu o mapě skupiny
  (`JourneyReadDeps.knowledge` – `KnowledgeRepository.of`, jeden dotaz na pohled) a sloučí ji
  s čerstvým `seen` výjezdu (`mergeKnowledge`): `JourneyView.seen` má od prvního taktu na známé
  mapě stopu i stavby z dřívějších výjezdů a tažení. Domovská mapa null (úložiště se neptá). Stav
  výjezdu znalost rodu nenese (kontrolní body nerostou) a v taktu workeru se nečte. Web ji dává
  v `apps/web/lib/journey.ts`.
- **Tažení (Úloha 11 – `domain/war/campaign-knowledge.ts`)** – tažení objevuje jako výjezd
  (`CampaignState.seen`, `lookOnMap` na cizích mapách, kde takt stav vsi čte i bez toho – stavby
  všech druhů včetně opevnění), na konci nájezdu vydá mapu cíle, na konci tažení všechny cizí mapy;
  znalost dostane jen rod vůdce (`CampaignState.houseId`, u starších bodů podle hráče objevená
  obydlí) a útočník na mapě cíle vidí, co rod zná – podrobně `docs/code/war.md` (Živé vedení
  a pohled na tažení – Znalost rodu).
- **Tažení ve scéně (Úloha 12b)** – pohled útočníka (`warSceneOnMap`) nese znalost rodu na každé
  mapě, kde vojsko stojí (`WarSceneView.known` – na mapě cíle `knownTarget`, na mapě po cestě
  `knowledgeOfCell` sloučená se `CampaignState.seen` té mapy – `knownOnWay`, jako výjezd; jeden
  dotaz na pohled, obránce nic). Scéna tažení
  (`ForeignWarScene`) kreslí stavby, jak je rod naposled viděl, tak jako výjezd (`seenVillageOf`
  ve `foreignVillageOf` – objevené domy mají přednost; opevnění ze znalosti se na mapě cíle
  nekreslí, na mapě po cestě ano – `onTargetMap`) a stopu rodu odkryje
  stejnou mlhou (`setJourneyFog` → `exploreTrail` – šeré) k mlze války – dohled vojska jasný.
  Podrobně `docs/code/war.md` (Ve scéně – Cizí mapa – Co rod zná) a `docs/code/web-ui.md` (Cizí
  mapa ve scéně).
- **Tabulka `house_knowledge`** (migrace `0046_house_knowledge`): `house_id` (FK `house`, při zániku
  rodu se smaže), `grid_x`, `grid_y`, `state` jsonb (`SeenCell`), `updated_at`; primární klíč všech
  tří sloupců.
- **Testy** – `seen.test.ts` (zánik v `lookAround`, `since`, `mergeKnowledge`: novější den, zánik,
  rozvalina, jiná ves, idempotence, pořadí; pokrytí – shořelý dům po průjezdu, stará zpráva dál
  od stopy, viděné po `since`, okolí bodu stopy, idempotence s `since`), `journey.test.ts` (vydání při přechodu, dojetí i konci, vcelku =
  po kouscích), `step-journeys.test.ts` (úložiště po kolech, pád před doručením znalosti),
  `knowledge-repository.db.test.ts` (po políčkách, cizí rod, sloučení, souběh, zánik rodu);
  Úloha 11 – `journey-view.test.ts` (druhý výjezd na známou mapu, cizí rod, sloučení s čerstvým).

## Známá mapa (Úloha 12a – `application/known-map.ts`, `apps/web`)

Co rod ví o cizích mapách, si hráč prohlédne z domova (lord-control.md – Co vojvoda vidí, Co hráč
vidí). Znalost ve scéně tažení – Znalost rodu (Tažení ve scéně, Úloha 12b).

- **Use-casy** (`application/known-map.ts`): `knownMapFor(deps, { playerId, cell })` – znalost
  **vlastního živého rodu** hráče o mapě (`{ seen }`), `null` = rod mapu nezná (cizí rod, rod bez
  záznamu i hráč bez rodu dostanou totéž, nic se neprozradí); `knownVillagesOf(deps, { playerId })`
  – políčka, o kterých rod něco ví, a rod, který na nich sídlí. `houseId` dostane políčko jen
  když rod viděl **aspoň jednu stavbu** vsi současného držitele (`seen.parts` neprázdné
  a `seen.villageId` je id vsi sídla na políčku; id vsi a sídla jsou různá – návrh Clauda po
  závěrečné recenzi): stopa přes roh mapy zapíše id vsi i bez jediné viděné stavby
  (`lookOnMap`), držitel se tím nesmí prozradit, stejně jako ves po změně držitele (world.md – Co
  je veřejné); jinak `houseId: null` a políčko zůstává ve znalosti (otevře se přes `?known=x,y`).
  Seznam je **jeden dotaz** úložiště – `KnowledgeRepository.knownCellsOf(houseId)` → `KnownCell`
  (`seenVillageId`, `seenParts`, `villageIds` sídla na políčku bez archivu, `holderHouseId` živého
  rodu držitele): adaptér spojí `house_knowledge` (`state->>'villageId'`,
  `jsonb_array_length(state->'parts')` – celý JSON znalosti do Node nejde) se `settlement` podle
  `grid_x`, `grid_y`, `village` podle `settlement_id` a `house`; paměťová verze nad sídly, vsemi
  a rody v paměti (`InMemoryKnowledge.world`). Pravidlo, co se ukáže, je v use-casu. Do
  `index.ts` exportováno.
- **Server** (`apps/web/lib/journey.ts` – `knownMapForPlayer`, `knownVillagesForPlayer`; route
  `GET /api/journey`): `?known=x,y` → `{ map, seen }` (krajina políčka z `campaignCells().mapOf`,
  jinak 404 „Tu mapu rod nezná.“), `?known=villages` → `{ known: [{ cell, houseId }] }`.
- **Scéna** – tatáž `ForeignJourneyScene` s prop `known` (žádný pohled na výjezd, `lord: null`):
  krajina i `seen` z `?known=`, mlha ze stopy (`setJourneyFog` – odkryté šeré, nikde není nikdo
  v dohledu), stavby z `seenVillageOf` (naposled viděné), žádní jezdci ani rozkazy; kořen má
  `data-testid="known-scene"` a `data-cell`, ⌂ (`foreign-back`) vrátí ves. Kamera jde na první
  stavbu, bez ní na první bod stopy. Jedna scéna Babylonu naráz – `VillageGame` ji vykreslí místo
  vsi (po scéně tažení a výjezdu v pořadí).
- **Ovládání** – oko `KnownMapEye` (`hud/KnownMapEye.tsx`, maska `public/icons/war/eye.svg` jako v `CampaignMap`): u rodu v panelu Rod
  a vazalové (Páni, Vazalové přes `AgreementEntry`, Hráči) a u cíle tažení v panelu Vojsko
  (`ArmyTargetView.houseId`, `army-known-map`). Bez vybraného cíle tažení se oko nezobrazí.
  Stav seznamu (`KnownStatus`: `loading` / `error` / `ready`, `knownEyeState` v `journey-view.ts`):
  dokud se seznam nenačte nebo když dotaz selže, je oko zašedlé bez popisku; rod bez známé mapy
  v načteném seznamu má oko zašedlé (`data-known=no`) s popiskem `UNKNOWN_MAP` „Tu mapu rod
  nezná.“. Má-li rod víc známých map, každý další klik
  otevře další (`nextKnownCell` v `journey-view.ts` – podle souřadnic dokola); naposled otevřenou
  mapu každého rodu drží hra (`useKnownMap` – panel se při otevření mapy zruší). Seznam map
  (`?known=villages`) se čte **jen pro otevřený panel s oky** (Rod a vazalové, Vojsko –
  `useKnownMapList` se při otevření panelu přihlásí, `KnownMapActions.register`): při otevření
  panelu a po návratu ze známé mapy, na známé mapě ani na pozadí ne (dřív každý hráč každých 20 s
  – závěrečná recenze, Important 5). Dva souběžné požadavky se nesčítají (běžící dotaz další
  nepustí). Test: `village-game/__tests__/use-known-map.behavior.test.tsx`.

## Šelmy (Úloha 13 – `domain/war/journey-predators.ts`)

- **Kdy:** v denním kroku (`stepJourney` → `journeyTick`, smyčka `s.day++`) po `homeDay` – jednou za
  herní den, stojí-li skupina na začátku dne v hustém lese (`MARCH_FOREST` pod `groupOf(s).pos`
  v mřížce pochodu, `gridOf`). Mimo hustý les, nad `JOURNEY.predatorGroupMax` živých mužů (tři
  nikdy) ani na mapě bez šelmy se nelosuje.
- **Los** `predatorDay({ members, inForest, wildlife, seed, day })`: čistá funkce, proud
  `createRandom(deriveSeed(seed, 'predators:' + day))`, každý muž v pořadí `members` dostane vždy
  oba losy (zranění, smrt), padlí losy spotřebují, ale nezasáhnou – vcelku = po kouscích. Čísla
  jsou čísla lovu (`HUNT_RISK`, `village-wildlife.md` – Riziko lovu): medvěd zranění
  5 % × (1 − boj ÷ 200) a smrt 0,3 % × (2 − boj ÷ 100), jen vlci čísla lovu prasat (0,5 %,
  0,02 %); pěšky smrt × 2; boj je `JourneyMember.fight`. Je-li medvěd i vlci, útočí medvěd. Žádné
  nové číslo.
- **Zvěř mapy** `wildlifeOfMap(map, village)`: mapa se vsí bere `VillageState.wildlife` té vsi
  (`villageIds[0]` přes `villageAt` – stejná ves, kterou čte `discover`, žádná navíc; ulovený
  medvěd = bezpečno, dokud se nevrátí); prázdná mapa nebo ves bez `wildlife` zvěř na stropu podle
  krajiny kolem středu mapy (`wildlifeOfEmptyMap`), v paměti podle krajiny (`WeakMap`).
- **Následek ve výjezdu:** zraněný `wounded` + `woundedDay`, zabitý `status: 'fallen'`; po smrti
  vojvody se zbytek vrací sám (`afterLosses`), padnou-li všichni, výjezd končí bez událostí.
  Domů jde `journey-casualty` (`journeyId`, `personId`, `outcome`, `by`) ve schránce bodu, `ref`
  `journey:<id>:<takt>:<pořadí>`, `day` = den losu.
- **Ves** (`applyJourneyCasualty`, `village/wildlife/beast-casualty.ts`, větev v `applyEvent`):
  zranění `injuredUntilDay = day + 1 + 60` bez zápisu do kroniky; smrt odebere osobu a zapíše
  `death { cause: 'beast', by }`, nástupnictví řeší `dynastyDay` běžnou cestou. Osoba, která ve vsi
  už není, nic nezmění (idempotence). Kronika ve webu: „Bořivoje zabil na cestě medvěd.“ /
  „Bořivoje zabili na cestě vlci.“ (`village-view-chronicle.ts`).
- **Testy:** `journey-predators.test.ts` (četnost přes 20 000 seedů v toleranci, zvěř mapy, výjezd
  v lese, vcelku = po kouscích, schránka vsi).
