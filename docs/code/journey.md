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
  pro scénu `data`). Domovská mapa tu není – hráč ji zná celou.
- **Takt** – po pohybu `discover` (`journey.ts`): na cizí mapě `lookAround` s okem skupiny
  (`groups[0].pos`), mřížkou `gridOf` a stavem vsi `villageAt` pro den taktu. Ves bez spočteného
  dne krok zastaví (`MissingData`) – i když skupina stojí; mapu sousedního políčka proto krok čte už
  v taktu přechodu okraje. Jiná ves na mapě než dřív (stará zanikla) – stavby staré vsi se zahodí,
  stopa zůstane.
- **`lookAround(prev, { village, eyes, grid, day })`** – stavby v dohledu (`inSight`: 150 m, z lesa
  a do lesa 50 m) zapíše s dnešním stavem a dnem; známou stavbu, která ve vsi už není a její místo
  je v dohledu, zapomene; co je mimo dohled, zůstane („stará zpráva“). Co muži dnes už viděli, se
  týž den znovu nepřepisuje – stav vsi pro den je jeden. `prev` nemění a beze změny vrátí týž
  objekt, takže takt znalost map nekopíruje (`journeyTick` kopíruje stav bez `seen`). Stavbu, která
  v dohledu zmizela, zapíše do `SeenCell.gone` (`{ key, day }`, seřazené podle klíče; bez zániku
  pole chybí) – bez toho by ji sloučení se starou znalostí rodu vrátilo (Znalost rodu).
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
- **Pohled** – `JourneyView.seen`: `SeenCell` mapy, na které skupina je; na domovské mapě null.
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
  o pravém kliknutí – nic (mimo terén, načítání), důvod u kurzoru (`refuse`, výběr zůstává) nebo odeslání
  rozkazu. Důvod (`journeyReason`) a „Na sousední mapu“ ukáže `JourneyCursorNote` u kurzoru, v panelu je
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
  při čekání, cíl ve vodě (praporek na souši), cizí výjezd u vsi (bod checkpointu přepsaný v DB)
  a klik na něj. `JOURNEY_SHOT=<cesta>` uloží snímek. E2e běží s omezeným pohybem (`reducedMotion`)
  – muži tam skáčou na nový stav, plynulý posun kryje `journey-riders.test.ts`.
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
  posledního stavu; mlha války má přednost. Bez jezdců závoj zůstává.
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
  Adaptér herní logiku nemá. V `GameDeps.knowledge` a v `journeyDeps` workeru.
- **Tabulka `house_knowledge`** (migrace `0046_house_knowledge`): `house_id` (FK `house`, při zániku
  rodu se smaže), `grid_x`, `grid_y`, `state` jsonb (`SeenCell`), `updated_at`; primární klíč všech
  tří sloupců.
- **Testy** – `seen.test.ts` (zánik v `lookAround`, `mergeKnowledge`: novější den, zánik, rozvalina,
  jiná ves, idempotence, pořadí), `journey.test.ts` (vydání při přechodu, dojetí i konci, vcelku =
  po kouscích), `step-journeys.test.ts` (úložiště po kolech, pád před doručením znalosti),
  `knowledge-repository.db.test.ts` (po políčkách, cizí rod, sloučení, souběh, zánik rodu).
