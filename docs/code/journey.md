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
