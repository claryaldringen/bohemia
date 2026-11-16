# Výjezd vojvody a výpravy (`packages/game/src/domain/war` – `journey*.ts`)

Pravidla: [lord-control.md](../design/lord-control.md) – Rozkazy, Na místě a návrat, Pohyb, Zásoby
a zima, Co vojvoda vidí. Plán: `docs/superpowers/plans/2026-11-13-lord-control.md`. Výjezd stojí vedle tažení
(`war.md` – Tažení po taktech) – nemá válku ani cílovou ves – a sdílí s ním takty, pohyb po mapách,
tempo a svět `CampaignWorld`.

## Stav a krok (Úloha 1; výpravy – plán 2026-11-14, Úloha 1)

Výjezd vojvody je od výprav (`docs/design/expeditions.md`) jedna výprava na domovskou ves hráče
s libovolně skupinami hráče (`parties`) a jejich hloučky (`groups`).

- **Stav** – `journey-types.ts`: `JourneyState` je JSON (kontrolní bod): `kind: 'journey'`, `seed`,
  `tick` a `day` posledního spočteného taktu, `throughDay` (jako u tažení – mez bariéry vsí),
  `phase: 'out' | 'done'` (výprava bez skupin = `done`), hráč, rod (`houseId`), domovská ves `home`
  (`CampaignVillage`), lidé `members`, hloučky `groups`, `marchGridVersion` (verze mřížky pochodu
  úseků hloučků – Převod níž), skupiny `parties` a `nextId` (další volné id skupiny i hloučku – jedna
  řada). `leaderName` zůstává jen v převedených bodech.
  - `JourneyMember`: `ref` osoby, která zůstává ve stavu domovské vsi, `lord` (vojvoda), `mounted`,
    `strength` a `fight` při vyslání, `health`, `wounded`, `status: 'active' | 'fallen'`, hlouček
    `group`, volitelně `name`, `female`, `bornDay` a kůň jezdce `horseId`, `horse`,
    `strengthMounted` (Koně výpravy níž).
  - `JourneyGroup` (hlouček) = `CampaignGroup` (tvar tažení, bariéra a `onCell` čtou `groups[].cell`)
    s polem `party`. Hlouček jsou lidé jedné skupiny na jednom místě.
  - `JourneyParty` (skupina hráče – výběr s jedním rozkazem): `id`, `phase: 'out' | 'returning'`,
    `arrivedTick` (takt, od kterého stojí všechny její hloučky – od něj běží čekání; null = některý
    jde), `crossing` (rozkaz „Přes okraj“), `leaderless` (ztratila vojvodu), `horseWork` (práce
    s koňmi doma – Koně výpravy níž).
  - `JourneyPhase` (`out` → `returning` → `done`) je fáze pohledu a starších bodů.
- **Rozkazy a příkazy** – `JourneyOrder`: `go` (místo `pos` na mapě `cell`; chybí = mapa vůdce
  výběru), `cross` (sousední políčko hloučku vůdce v 8 směrech; jiné se zahodí – cíl do pohledu je
  místo naproti na okraji sousední mapy, `edgeCrossing` od vůdce), `home`. Záměr
  `JourneyIntent { tick, seq, byPlayer, body }` platí přesně ve svém taktu v pořadí `seq`, záměr
  v minulosti a cizí hráč se zahodí. Tělo `JourneyIntentBody` = `JourneyCommand` nebo starý
  `JourneyOrder`; `commandOf` (`journey-upgrade.ts`) z něj udělá příkaz:
  - `{ kind: 'order', order, people?, recruits? }` – rozkaz lidem (id osob; chybí = všem, koho hráč
    řídí) a noví lidé ze vsi `JourneyRecruit` (`ref`, `lord`, `strength`, `fight`, `name`, `female`,
    `bornDay`). Starý záměr = rozkaz všem.
  - `{ kind: 'recall', cells }` – odvolání domů (worker a válka): skupiny s hloučkem na některém
    z políček, nebo s cílem tam, jdou domů (`returning`); skupina, která se už vrací, jde dál.
  - `{ kind: 'saddle', people?, recruits? }` a `{ kind: 'dismount', people? }` – Osedlat a Sesednout
    (Koně výpravy níž).
- **Skupiny** – `journey-parties.ts`, `applyCommand(s, command, ctx, out)` (krok ho volá pro každý
  záměr): rozkazy hráče platí jen pro skupiny bez `leaderless`, `recall` pro všechny. Rozkaz lidem:
  - vybraní = živí lidé ve výpravě z `people` (skupina bez `leaderless`), nováčci `recruits` (id, která
    ve výpravě nejsou) přibudou v novém hloučku na `home.pos`;
  - ověření předem: „Přes okraj“ na políčko nesousedící s hloučkem vůdce výběru se zahodí; nováčci
    ze vsi už odešli, proto stojí doma v nové skupině bez rozkazu (`standAtHome`, `arrivedTick` =
    takt příkazu – jako u Osedlat);
  - dělení: skupina, z níž je vybraná jen část, si nechá zbytek – jeho hloučky zastaví (`goal` null,
    `route` [], `leg` null, `arrived`), fáze `out`, `arrivedTick` = takt příkazu (zastavení je dojetí –
    znalost mapy hloučku, který šel, jde rodu); smíšený hlouček se rozdělí (vybraní v novém hloučku
    na stejném místě, padlí zůstanou zbytku);
  - spojení: vybraní tvoří jednu skupinu – výběr právě celé jedné skupiny (nováčci navíc) si nechá
    její id, jinak nové z `nextId`; hloučky výběru, které stojí na stejném místě (políčko i poloha),
    splynou (`mergeGroups` – do prvního v pořadí `groups`), takže nováčci přejdou do hloučku skupiny,
    která stojí celá doma;
  - rozkaz dostanou všechny hloučky skupiny (`orderParty`): `go` → cíl `pos` na mapě `order.cell`
    (chybí = mapa vůdce), `cross` → cíl na okraji sousední mapy a `crossing`, `home` → `sendGroup`
    domů a fáze `returning`; jinak fáze `out`; vždy `arrivedTick` null. Nový rozkaz nahradí
    starý, `go` a `cross` vrátí i skupinu, která se vrací.
  - `partyLeader(members)` – vůdce: vojvoda, jinak nejstarší muž, jinak nejstarší člen (`bornDay`,
    chybí = nejmladší), shoda nižší id osoby (expeditions.md – Koně mimo ves).
- **Krok** – `journey.ts`: `newJourney(input, clock)` – nováčci `recruits` tvoří skupinu 0 s hloučkem 0
  na `home` (`nextId` 1), takt vyslání z `startMs` (`tickOfMs`); s `order` ho použije, bez něj
  skupina stojí (`arrivedTick` = takt vyslání). `journeyFinished`; `stepJourney(state, toTick,
intents, world)` → `JourneyStep { state, villageEvents, notices, knowledge?, waiting }` – čistá,
  vstup nemění, starší bod převede `upgradeJourney`, takt na kopii (`cloneData`) jako `stepCampaign`.
  Takt: na začátku nového dne denní krok `homeDay` a šelmy, konec práce s koňmi (`finishHorseWork`),
  příkazy taktu (`commandOf`, `applyCommand`), konec čekání skupin, pohyb `moveGroups`. Chybí-li mapa nebo ves (`MissingData`;
  mapy potřebné hned hlídá `missingMaps`), výsledek je stav na konci posledního celého taktu
  a `waiting`.
- **Denní krok** – `homeDay` jen kontroluje lidi doma: žádné jídlo, mráz ani dezerce (lidé jedí dál
  ze zásob své vsi). Domovská ves `world.villageAt(home, den)`: člověk, který v jejím stavu není
  (zemřel – stáří, hlad), je `fallen`. Ztráty (`afterLosses`): hlouček bez živých zmizí i s padlými
  (bez událostí; znalost jeho mapy jde rodu), skupina bez hloučků zmizí, skupina s padlým vojvodou
  dostane `leaderless` a jde domů (`turnHome`; vrací-li se už, jde dál), výprava bez skupin `done`.
  Ves bez spočteného dne → krok čeká jako tažení; ves, která zanikla (volitelný
  `CampaignWorld.villageGone`), výpravu ukončí bez událostí. Den vyslání se nekontroluje.
- **Čekání** – skupina, jejíž hloučky všechny stojí, dostane `arrivedTick` (jen když je null); po
  `JOURNEY.waitDays` (3) herních dnech bez rozkazu (`waitTicks` – takty jako `absentTicks` tažení)
  jde domů celá. Každý rozkaz lhůtu ruší, dojetí ji počítá znovu.
- **Pohyb** – `moveGroups` jako vojsko: každý hlouček `settleGoal` (cíl v neprůchodné buňce na
  nejbližší dosažitelné místo) a `stepMover` tempem `marchSpeed` ze všech živých své skupiny na
  začátku pohybu (jen jezdci × 1,5, pěší raněný × 0,75, sníh × 0,75). Brány jsou v míru otevřené.
  Zastavení po přechodu okraje jen u skupiny s `crossing`, když hlouček vstoupil na `goal.cell`
  (cíl = místo vstupu); jinak se jde dál. Hlouček, který nemá kudy, stojí; při návratu skončí jako
  u tažení. Po pohybu splynou hloučky téže skupiny, které stojí na stejném místě se shodným cílem.
  Vsím na cestě se nic neohlašuje – žádné `army-seen`, `raid-day`, varování ani upozornění.
- **Návrat** – hlouček skupiny `returning`, který doma dojde, skončí (`finishGroup`): domovská ves
  dostane `away-ends` s `personIds` jeho živých (`refId` = id výpravy, `untilDay` den nato –
  schránka na následující den jako výsledky tažení; `ref` = `journey:<id>:<takt>:<n>`; ves
  `personIds` čte od Úlohy 2). Poslední hlouček výpravy – i když výprava skončí tím, že nikdo
  nežije (`afterLosses`) – pošle `away-ends` bez `personIds` (`everyoneHome`): domů jde každý, kdo
  je s výpravou pryč, i člověk přidaný záměrem, na který krok před koncem už nedošel (plán
  2026-11-14 – Review Focus 2, Úloha 5; návrh Clauda). Hráč dostane upozornění `journey-returned` `{ journeyId, leader?, female? }`
  s vůdcem hloučku (`partyLeader`; bez jména `leader` chybí) – text „Bořivoj se vrátil.“
  (`player-notices.ts` ve webu). Skupina `leaderless` upozornění nemá – vojvoda se nevrátil (návrh
  Clauda). Hlouček i jeho lidé ze stavu zmizí, skupina bez hloučků taky.
- **Převod** – `upgradeJourney(state)` (`journey-upgrade.ts`; plán 2026-11-14 – Rozhodnutí 4): bod
  nového tvaru se současnou verzí mřížky vrátí beze změny (týž objekt), bod před výpravami převede
  (`fromLegacy`) – skupina 0 s hloučkem 0, `arrivedTick` a fáze `returning` přejdou do skupiny,
  vojvoda dostane `leaderName` jako `name`, skupina bez živého vojvody `leaderless`, hlouček venku na
  cestě přes okraj `crossing`. Bod bez `marchGridVersion` (verze mřížky pochodu, podle které vznikly
  úseky – `MARCH_GRID_VERSION`; plán 2026-11-16-dense-forest, Rozhodnutí 9) dostane kopii hloučků
  bez úseků a verzi (`replanLegs` – war.md, Pohyb vojska, Rozjeté úseky); krok úseky spočte
  z uložené polohy. `newJourney` verzi nese od začátku. Idempotentní, vstup nemění; volá ho krok
  i aplikace (pohled, rozkaz, worker, válka), do úložiště se zvlášť nezapisuje (uloží ho další bod).
  Tvar starého bodu: `LegacyJourneyState`.
- **Čísla** – `JOURNEY` v `rules-war.ts`: `waitDays` 3, `predatorGroupMax` 2 (šelmy – Úloha 13),
  `trailStepM` 20 (stopa odkrytého – Úloha 6), `mountWaitS` 10 (nasednutí – Koně výpravy). Tempo a věk mužů bere výjezd z `WAR`.
- **Sdílené s tažením** – `movement.ts`: `sendGroup`, `settleGoal` a `missingMaps` (přešly
  z `campaign.ts` beze změny chování) vedle `stepMover`.
- **Testy** – `domain/war/__tests__/journey.test.ts` (svět v paměti): rozkazy, čekání, návrat, tempo,
  zima bez mrazu, brána, bez vedlejších účinků, vcelku = po 7 taktech přes JSON, chybějící mapa,
  člen zemře doma, domovská ves zanikne. `journey-parties.test.ts`: dvě skupiny, dělení, spojení,
  nový člověk, Domů části skupiny, vůdce, upozornění, šelmy po hloučcích, `recall`, vcelku = po
  kouscích. `journey-upgrade.test.ts`: převod starého bodu, idempotence, starý bod a staré záměry
  dopočtené stejně jako nový stav (Review Focus 1), `commandOf`. `journey-horses.test.ts`: Koně
  výpravy.

## Koně výpravy (výpravy – plán 2026-11-14, Úloha 3 – `journey-horses.ts`)

Osedlat a Sesednout (`docs/design/expeditions.md` – Koně, Koně mimo ves; plán – Rozhodnutí 6 a 7).
Příkazy jsou v `journey-parties.ts`, co čte ves, trvání, konec práce a ztráta koně
v `journey-horses.ts`.

- **Stav** – jezdec je člen s `horseId` (kůň vsi s `Horse.riderId` – vyplní vyslání z rekruta
  `JourneyRecruit.horseId`; chybí = není jezdec, nebo starší bod a ves o koni neví). `horse:
MemberHorse` – `ridden` (sedí, vždy s `mounted`), `led` (sesedl venku a vede koně za uzdu – jde
  pěšky); chybí = kůň v ohradě. `strengthMounted` – síla na koni z rekruta (krok ji jen nese).
  `JourneyParty.horseWork: HorseWork` – `{ kind: 'saddle' | 'unsaddle', groomId, riders, fromTick,
untilTick, pen }`: vesničan `groomId` (null = nikdo doma), jezdci (id osob), takt příkazu, konec
  a ohrada koně prvního jezdce (`{ x, z }` prvního čtverce).
- **Ves** – `riderHorse(village, personId, horseId, day)`: kůň `horseId` v ohradě koní
  (`horsePens`) s `riderId === personId`, jezdecký (`isGrainHorse`), s ohradou; bez `horseId` nebo
  kůň pryč – null. `pickGroom(village, day, near, skip)`: dospělý (`ageGroup`), doma (`isAway`),
  nezraněný (`isInjured`), mimo `skip` (všichni lidé výpravy), nejmenší `length2` od jeho obydlí
  (`Dwelling.position`) k `near`, shoda nižší id; vrací i polohu obydlí `from`. Ves dne čte
  `homeVillage` (chybí den → `MissingData`, zaniklá → null) jen tehdy, když jezdec stojí doma.
- **Trvání** – `horseWorkTicks({ kind, groom, pen, riders, day })` (návrh Clauda – Rozhodnutí 7):
  přímé vzdálenosti tempem jednoho pěšího (`marchSpeed` – i sníh) + `JOURNEY.mountWaitS`, krát
  `TICKS_PER_SECOND`, nahoru. Osedlání: vesničan → ohrada → jezdci; bez vesničana jezdci → ohrada
  → jezdci. Sesednutí: vesničan → jezdci (koně pak odvede sám).
- **Osedlat** – vybraní `chosenMembers` (živí, skupina bez `leaderless`); noví lidé `recruits`
  stojí doma v nové skupině bez rozkazu (`joinAtHome`, `arrivedTick` = takt), ostatní zůstanou ve
  svých skupinách. Po skupinách, skupina s `horseWork` příkaz nevidí: jezdec s `led` nasedne hned
  (i venku); jezdci bez koně u sebe, jejichž hlouček je na `home.cell` a kůň v ohradě
  (`riderHorse`), dostanou jednu práci `saddle` – `near` je hlouček vůdce těchto jezdců
  (`partyLeader`), vesničan `pickGroom`, ohrada koně prvního z nich, `untilTick` = takt +
  `horseWorkTicks` – a ves hned dostane `journey-horse { horseId }` za každého (`sendHorse`). Jezdec
  venku s koněm v ohradě nic („Kůň je doma.“ ukáže web).
- **Sesednout** – jezdcům s `ridden` z výběru, po skupinách (skupina s `horseWork` příkaz nevidí):
  doma (hlouček na `home.cell`, kůň ve vsi – `riderHorse`) s vesničanem jedna práce `unsaddle`,
  jezdci sedí do `untilTick`; ostatní hned `mounted` false a `led` – venku, doma bez nikoho (kůň
  zůstane u jezdce do návratu) i kůň, o kterém ves neví (starší bod).
- **Konec práce** – `finishHorseWork` v každém taktu před příkazy: v `untilTick` jezdci práce, kteří
  jsou ve skupině živí, u `saddle` nasednou (`mounted`, `ridden`), u `unsaddle` sesednou (`horse`
  zmizí, ves dostane `journey-horse { horseId: null }`). Práce zmizí; stojí-li všechny hloučky
  skupiny, `arrivedTick` = `untilTick` (lhůta „od osedlání“).
- **Pohyb a lhůta** – `moveGroups` hloučky skupiny s `horseWork` přeskočí: rozkaz cíl zapíše
  (`orderParty`), skupina vyrazí po práci tempem jezdců. Konec čekání se pro skupinu s prací
  nepočítá – po ní běží znovu.
- **Rozdělení a spojení** – rozkaz lidem (`orderPeople`) s novou skupinou výběru volá
  `carryHorseWork`: jezdci výběru si práci vezmou s sebou (nová skupina čeká na tu, která skončí
  nejpozději, jezdci prací téhož druhu se sejdou v ní), zbytku zbudou jeho jezdci, bez nich nečeká.
  Jezdec z práce jiného druhu (osedlání i sesednutí v jednom výběru) ji opustí – sesedaný zůstane na
  koni, sedlaný bez koně a ves dostane `journey-horse` null (kůň je zase v ohradě – Úloha 5).
- **Kůň zmizel** – `homeDay` po ztrátách volá `loseHorses`: jezdec s `horseId`, jehož kůň ve vsi
  dne už není (`riderHorse` null – uhynul, prodán, jiný jezdec), ztratí `mounted` i `horse`
  a práce s koňmi, na kterou čeká, ho vynechá. Věděla-li ves o koni venku (kůň u jezdce, nebo ho
  vesničan teprve vede), dostane `journey-horse` null – kůň, který ve vsi zůstal (jiný jezdec), je
  zase volný pro chov a porážku. Práce, které nezbyl živý jezdec (ztráta koně, smrt doma), skončí
  hned a lhůta běží od tohoto taktu – skupina nečeká na nikoho (Úloha 5). Bez `horseId` beze změny.
- **Ves a události** – `journey-horse` (`sendHorse` – den taktu, `ref` jako ostatní události
  výpravy): osedlání (kůň s `riderId` jezdce je v ohradě, takže ho `applyJourneyHorse` vezme), nový
  člověk ze starého adaptéru na koni s `horseId` (`joinAtHome`) a konec sesednutí doma (null). Kůň
  s jezdcem se vrátí s `away-ends`; padlý jezdec – kůň je volný (`horsesOut` ho nevidí).
- **Starý stav** – `upgradeJourney` dá jezdci s `mounted` `horse: 'ridden'` bez `horseId`;
  `recruitMember` – `mounted` (starý adaptér) = `ridden`. `newJourney` události nevydává – jezdec
  s `horseId` na koni přes něj ves o koni nepoučí (Úloha 5: přidat ho příkazem s `recruits`).
- **Doma mezitím** – `trainLordDay`: kdo je pryč (`isAway`), necvičí a zapomíná (`decayArms`);
  pár jezdec–kůň (`assignRiders`) drží dál, `lordRides` jezdce pryč nevyvede.
- **Testy** – `journey-horses.test.ts` (ves v paměti s ohradou koní a obydlími): `pickGroom`,
  `horseWorkTicks`, `riderHorse`, Osedlat doma (stojí i s rozkazem, tempo jezdců, události v taktu
  příkazu, doručení do vsi, druhý příkaz během práce), nikdo doma, lhůta od osedlání, lhůta během
  sedlání, kůň zmizel, rozdělení a spojení během sedlání, noví lidé, starý adaptér, mimo ves,
  Sesednout venku a doma, vcelku = po kouscích přes JSON. `lord-day.test.ts`: kdo je pryč,
  necvičí.

## Vyslání (Úloha 2 – `application/expedition.ts`, `journeys.ts`)

- **Port** `JourneyRepository` (`application/journeys.ts`) – stejná sémantika kontrolního bodu a
  záměrů jako `CampaignRepository` (`create`, `active`, `checkpoint`, `intentsAfter`, `saveCheckpoint`,
  `clearOutbox`, `addIntent`) plus `activeIn` / `activeOfPlayer` (výprava za domovskou ves – Úložiště)
  a `onCell(cell)`. Paměťové úložiště: `application/__tests__/in-memory-journeys.ts`.
- **Rozkaz vybraným lidem** (výpravy – plán 2026-11-14, Úloha 5 – `application/expedition.ts`,
  `domain/war/expedition-people.ts`):
  - **Kdo smí jít** – `expeditionRecruit(state, person, day, villageId?)`: pod `JOURNEY.minAge` (12 let,
    i vojvoda) `young`, `isInjured` `wounded`, pryč na tažení `campaign`, jinak pryč `away`
    (`ExpeditionPersonRefusal`); jinak rekrut z `recruitOf` – `lord` (`currentLord`), `fight` =
    `arms.combat`, jméno, žena, `bornDay`, jezdec `horseId` (`ridingHorseOf` – `riderId`, jezdecký
    kůň jako `riderHorse`) a síla: muž rodu od 16 `lineManStrength` (na svém koni
    `strengthMounted`), vesničan od 16 `villagerStrength` se štěstím vsi, ženy a mladší 0. Stav vsi
    své id nezná – `ref.villageId` doplní volající.
  - **Rozdělení výběru** (`people` – celá čísla bez duplicit, 1–200, jinak `nobody`): člen = osoba
    s `away: journey` výpravy `activeIn` (domovská ves výběru), živá v jejím bodu (`upgradeJourney`)
    ve skupině, která hráče poslouchá; ostatní přes `expeditionRecruit` – nezpůsobilí vypadnou,
    nezbude-li nikdo, důvod prvního (jinak `nobody`). Kdo z hloučku právě došel domů (v bodu už
    není), je `away`; id mimo ves se přeskočí.
  - **Komu příkaz** – rozkaz všem; Osedlat členům skupin bez `horseWork` a ze vsi jen jezdcům
    (návrh Clauda – ostatní pracují dál); Sesednout jen členům skupin bez `horseWork`.
  - **Ověření** – s rekruty cizí vojsko na vsi (`activeAgainst`) `village-attacked`; rozkaz
    `orderAim` od vůdce výběru (`partyLeader`, rekrut stojí doma – jako krok výpravy), `go.cell`
    musí být políčko někoho z výběru a měří se od vůdce těch na něm; nedojde nebo špatný vstup
    `unreachable`, cíl rodu ve válce `war-there`. Osedlat: rekrut jezdec, jezdec s koněm `led`,
    nebo jezdec bez koně doma s koněm v ohradě (`riderHorse`); jinak jezdci venku s koněm v ohradě
    `horse-home`, jinak `nobody`. Sesednout: někdo `ridden`, jinak `nobody`.
  - **`commandParty`** – jen členové: záměr `{ ...příkaz, people }` na takt teď + `INTENT_LEAD_TICKS`
    (nejdřív za bodem) bez zámku; s rekrutem `{ ok: false, reason: 'recruits' }` bez zápisu.
  - **`musterExpedition`** (zámek hráče) – rekruti odejdou ze vsi (`editVillage`, `sendAway`
    s `refId` výpravy, bez výpravy `newId()`; na čerstvém stavu se ověří znovu – kdo mezitím
    nesmí, odmítne celý příkaz; zápis se nepovede ani po opakování – `busy`); bez výpravy `create(newJourney({ recruits, order }))` (Osedlat
    jako první příkaz: založí bez rozkazu a hned záměr `saddle` s jejich id); s výpravou záměr
    `{ ...příkaz, people, recruits }`. `addIntent` null (výprava mezitím skončila) – rekruti zpět
    (`release` – jen jim `away` zmizí) a jednou znovu od začátku, s novou výpravou; podruhé `nobody`.
    Pád `create` – rekruti zpět, chyba jde dál. Záměr přijatý těsně před koncem výpravy kryje
    poslední `away-ends` bez `personIds` (Stav a krok – Návrat).
  - Starý výjezd vojvody s družinou (výběr družiny mužů rodu, jezdci vyjížděli rovnou na koni) zanikl v Úloze 12 výprav: vojvoda je člověk jako ostatní a na koni
    sedí až po Osedlat.
- **Domov výjezdu** (`journeyHome`) – `home.pos`, odkud skupina vyjede a kam ji Domů a návrat po
  čekání vedou, je **branka pozemku dvorce** (`dwellingGatePoint` – odkud z něj vychází síť pěšin;
  dvorec bez pozemku: před vchodem domu; dokud zakladatelé první zemnici staví, její staveniště;
  ves bez obydlí – `villagePlace`). Dřív střed dvorce: mřížka pochodu blokuje celý pozemek i
  s brankou, trasa proto vedla ze středu domu rovně zdí k nejbližší volné buňce a kolem pozemku –
  Vlkov k místu 42 m za dvorem 102 m obloukem, z branky 18,8 m rovně (D49, Martin 15. 11. 2026:
  „vyběhl boční stěnou domu a velkým obloukem…“; výprava založená dřív má domov uložený ve stavu). Hráč staví ves, kde chce – místo vsi krajiny
  (`villageSite`) od ní může ležet daleko (Martinův Vlkov ≈ 430 m): skupina pak vyjížděla odtamtud,
  pobíhala po mapě a Domů jela „někam do prdele“ (Martin 14. 11. 2026). Odtud ověřuje dosažitelnost
  i první rozkaz. Pohled ho nese jako `JourneyView.homePos` (scéna od něj měří odjezd a příjezd).
- **`houseAtWarOn(deps, playerId, cell)`** (`application/journey-war.ts`) – je rod hráče ve válce
  s rodem, kterému patří mapa na políčku (`SettlementRepository.holderAt` – držitel aktivní mapy na
  jednom políčku, v DB přes unikátní index `settlement_grid_idx` – → `activeOf` → `activeBetween`; `activeOf` rodů, ne výprav)?
  Stejný podpis převezmou rozkazy (Úlohy 4 a 5); ve vstupních bodech `GameDeps.atWar`.
- **Muži pryč a stěhování** – tažení ani výjezd muže se `away` ze stavu vsi nikdy nezvedají:
  sňatky (`marriage.ts`) a odchody (`departure.ts`, `son-departure.ts`) `away` nečtou, stejně jako
  u mužů na tažení. Krok výjezdu proto hledá člena jen ve vsi `home`; stěhování nechráněno ani u tažení.

## Úložiště (Úloha 3 – `packages/db`)

- **Tabulky** (`schema/journey.ts`, migrace `0045_journey_storage`, `0052_journey_home_village`):
  `journey` (`id`, `player_id`, `home_village_id`, `status` `active` / `done`, `created_at`),
  `journey_checkpoint` (`journey_id` = PK a FK, `tick`, `state`, `outbox`, `updated_at`) a
  `journey_intent` (`seq`, `journey_id`, `tick`, `by_player`, `body`). **Výprava za každou domovskou
  ves** (návrh Clauda, plán výprav – rozhodnutí 1): `create` zapíše `home_village_id` ze
  `state.home.villageId` a částečný unikátní index `journey_player_home_active_idx`
  (`player_id, home_village_id WHERE status = 'active'`) zaručí nejvýš jednu běžící výpravu na
  dvojici hráč × ves i při souběhu – druhé `create` vyhodí chybu databáze (`musterExpedition` vrátí
  lidi domů). Hráč s víc vsemi má víc běžících výprav. Migrace `0052` doplní sloupec z bodu
  (`state->'home'->>'villageId'`), řádky bez bodu uzavře (`done`, prázdná ves), nastaví `NOT NULL`
  a vymění starý index `journey_player_active_idx`. `journey_status_idx` a částečný
  `journey_checkpoint_outbox_idx` (`WHERE outbox IS NOT NULL`) slouží bariéře vsí.
- **Adaptér** `createJourneyRepository` (`adapters/journey-repository.ts`) – stejná sémantika zápisu
  jako `createCampaignRepository`: `saveCheckpoint` zamkne bod (`FOR UPDATE`) a vrátí `stale`, když se
  bod posunul nebo přibyl záměr do spočtených taktů, `addIntent` sdílí řádek bodu (`FOR SHARE`) a
  nezapíše záměr s taktem nejvýš bodem ani u skončeného výjezdu, verze bodu je `xmin`.
  `activeIn(hráč, ves)` vrací nejvýš jedno id (výprava z té vsi), `activeOfPlayer(hráč)` všechna id
  běžících výprav podle `created_at`, `id`; `onCell` čte políčko hloučku z `state->'groups'` (`@>`),
  výprava se dvěma hloučky se najde přes kterékoli z jejich políček. Skončený výjezd
  (`phase: 'done'`) přepne `status` na `done`; s nedoručenými událostmi ho `active()` vrací dál.
- **Začít znovu** – `restartGame` ukončí všechny běžící výpravy hráče (`activeOfPlayer` →
  `JourneyRepository.end`, každá domovská ves dostane vlastní `away-ends`; `recallJourneysAtWar`
  odvolá hloučky všech výprav rodu na mapě protivníka; pohled a rozkaz webu zatím berou první výpravu
  hráče, `musterExpedition` kontroluje `activeIn` pro vysílající ves). `end` (návrh Clauda):
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
  doručit. Stojící skupina se uloží nejvýš po `CHECKPOINT_TICKS` (40) taktech; hned se uloží s událostmi,
  na konci výjezdu, když výjezd čeká na ves (bariéra – mez vsi povyroste) a když se od uloženého
  bodu změnilo, co hráč vidí (`playerSeesChange`: poloha, cíl nebo dojetí hloučku podle id, fáze,
  `arrivedTick` a `horseWork` skupin, `mounted`/`horse`/hlouček členů, uplatněný záměr; bod se
  napřed převede `upgradeJourney`) – jedoucí skupina se tak ukládá každé kolo (≈ 1 s) a vojvoda na klik reaguje do vteřiny
  (Martin 14. 11. 2026: „kliknu do mapy… strašně dlouho mu trvá, než se rozjede“).
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
  Martinově otázce 13. 11. 2026, proč se worker na válku ptá každou sekundu) – po hloučcích podle
  id, jen u skupin venku (`out`); nový hlouček (dělení skupiny) se porovnává s domovským políčkem.
  Patří-li nová mapa rodu ve válce, kolo zapíše za hráče **jedno** odvolání
  `{ kind: 'recall', cells: [všechna válečná políčka] }` (`addIntent`, `byPlayer` = hráč výjezdu,
  takt teď + `INTENT_LEAD_TICKS` jako rozkaz hráče); odvolání platí jen skupiny na těch políčkách,
  ostatní skupiny stojí dál. Jednou: skupina ve fázi `returning` ani políčko s čekajícím
  odvoláním (nebo starým „Domů“ všem) se neptá. Bez paměti workeru kolo
  počítá od bodu, takže se po vjezdu ptá i v dalších kolech, než se bod uloží – zapíše ale stejně
  (čekající „Domů“, pak `returning`). Pravidlo: lord-control.md – Pořadí zavedení.
- **Začátek války** – `recallJourneysAtWar(deps, { houses, nowMs })` (`journey-war.ts`), volají ho
  `declareWar` i `startWarByAttack` (přepadení vysláním tažení) po založení nové války
  (`WarDeps.journeyRecall`, ve webu `journeyRecallDeps()` – `house.ts`, `army.ts`; bez závislosti
  nic). Běžící výjezd hráče každého z obou rodů, jehož skupina stojí na mapě druhého rodu nebo tam
  míří, dostane za hráče odvolání `recall` těch políček (takt teď + `INTENT_LEAD_TICKS`). Kde
  hloučky mohou být: políčka a cíle (`goal.cell`) hloučků v kontrolním bodu a políčka rozkazů `cross`
  (a `go` s `cell`) zapsaných po bodu
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

- **`orderAim`** (`journey-order.ts`) – jediné ověření rozkazu, společné pro první rozkaz
  (`musterExpedition` – vůči domovské vsi) a pozdější (`commandParty` – vůči políčku a poloze, kde
  skupina je). Vrací políčko, kam rozkaz
  míří (pro dotaz na válku; `home` = null), nebo `invalid` (neznámý druh rozkazu za běhu, bod mimo mapu, nekonečné číslo,
  `cross` na nesousední políčko) / `unreachable` (`reachableGoal` – skupina tam nedojde). Vyslání
  obojí hlásí jako `unreachable`, pozdější rozkaz `invalid` jako `refused`.
- **`expeditionViewsFor(deps, { playerId })`** (`expedition-view.ts`) – pohledy hráče na **všechny**
  jeho běžící výpravy (`activeOfPlayer`, jedna za domovskou ves; bod převede `upgradeJourney`,
  skončená a cizí výprava prázdno). `ExpeditionView` nese `villageId`, takt, den, domov a `homePos`,
  `parties[]` (`PartyView`: fáze, `controllable`, `leaderId` = `partyLeader` živých, `waitDaysLeft`,
  `horseWork`, hloučky `groups[]` a lidé `people[]` s hloučkem, jezdcem, koněm, `strength` – na koni
  `strengthMounted ?? strength` –, raněním, ženou a dítětem podle `bornDay` ve dni bodu) a `seen`
  (klíč `x,y` – znalost rodu sloučená s `seen` výpravy pro každé cizí políčko hloučku, jeden dotaz
  na políčko; domovská mapa nic).
- **`expeditionVisitorsOn(deps, { playerId, villageId })`** (`journey-view.ts`) – skupiny výprav
  na mapě vsi hráče. Hostitel vidí skupinu, když vidí aspoň jeden její hlouček na této mapě
  (`inSight`); vlastní skupiny vždy. Výsledek `ExpeditionVisitor`: id výpravy a skupiny, `own`,
  `villageId` (domovská ves vlastní skupiny, cizí null), jméno vůdce (`partyLeader`) a rodu, takt,
  hloučky na této mapě (cíl jen u vlastní skupiny) a jejich lidé (vojvoda, kůň, vedený kůň, žena,
  dítě; `personId` jen u vlastní skupiny, cizí null).

## Objevování (Úloha 6 – `domain/war/seen.ts`)

- **Stav** – `JourneyState.seen` (volitelné): pro každé cizí políčko `x,y`, kde muži byli,
  `SeenCell` – `villageId` vsi na mapě, stopa `trail` (body `[x, z]` po `JOURNEY.trailStepM` 20 m,
  seřazené podle x, pak z, bez opakování; mlhu z ní odkryje prohlížeč stejným dohledem) a naposled
  viděné stavby `parts` seřazené podle klíče (`SeenPart`: `key` = druh a id – `dwelling:12`,
  `site:40`, `pen:3`, `sacred:7`, `church:55`, `fortification:2` –, místo `pos`, den `day` a data
  pro scénu `data`) a `since` – první den, kdy se záznam do mapy díval (Znalost rodu – pokrytí).
  Domovská mapa tu není – hráč ji zná celou.
- **Takt** – po pohybu `discover` (`journey.ts`): na každé cizí mapě `lookOnMap` s očima všech
  hloučků na ní (`eyes` = jejich polohy), mřížkou `gridOf` a stavem vsi `villageAt` pro den taktu. Ves bez spočteného
  dne krok zastaví (`MissingData`) – i když skupina stojí; mapu sousedního políčka proto krok čte už
  v taktu přechodu okraje. Jiná ves na mapě než dřív (stará zanikla) – stavby staré vsi se zahodí,
  stopa i `since` zůstanou (`lookOnMap` – totéž bere pohled tažení).
- **`lookAround(prev, { village, eyes, grid, day })`** – stavby v dohledu (`inSight`: 150 m, z lesa
  a do lesa 50 m – hustým lesem vede jen stezka, její buňka nese `MARCH_FOREST`, takže dohled na ní je 50 m, v okrajovém pruhu bez `MARCH_FOREST` 150 m; `forest-doors.test.ts`) zapíše s dnešním stavem a dnem; známou stavbu, která ve vsi už není a její místo
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

## Web (Úloha 7 – `apps/web`; výpravy – plán 2026-11-14, Úloha 7)

- **Composition root** `lib/journey.ts` – `journeyActionForPlayer` v `lib/village.ts` (=
  `guardedAction` s akcí `launchExpedition`, právo `war`, zámek hráče, jen vlastní ves; bere ho
  `commandExpeditionForPlayer`;
  starý panel družiny a jeho akce zanikly v Úloze 9; starý rozkaz vojvodovi zanikl v Úloze 12),
  **`commandExpeditionForPlayer`** (příkaz vybraným lidem: napřed `commandParty` bez zámku, při
  `recruits` pod `journeyActionForPlayer` `musterExpedition`), **`expeditionViewsForPlayer`**,
  **`expeditionVisitorsOnVillage`**, `journeyMapForPlayer` (políčka všech vlastních hloučků a jejich
  sousedé). Závislosti z `gameDeps()`, mapy z `campaignCells()`, mřížky dohledu v LRU.
- **Vstup** `lib/journey-input.ts` – `parseJourneyOrder` (vojvoda);
  **`lib/expedition-input.ts`** – `parseExpeditionInput` → `{ villageId, people, command }`:
  `people` 1–200 nezáporných celých čísel bez duplicit, `command` = rozkaz (`go` smí mít navíc
  `cell` s celými čísly, `cross`, `home`) nebo `saddle` / `dismount`; vrací `ExpeditionCommand`
  (rozkaz zabalený do `{ kind: 'order', order }`). Význam ověřují use-casy.
- **Server actions** `app/game/actions/journey.ts` – **`commandExpedition(input)`** → `{ ok: true }` nebo `{ error }`
  s textem `expeditionReason`. Rozkaz lidem, kteří už jsou ve výpravě, zámek vsi nebere (jen záměr).
- **Cesta API** `GET /api/journey` (session povinná, `no-store`): bez parametru
  **`{ views: ExpeditionView[] }`** (jedna výprava za domovskou ves, prázdné = žádnou nemá);
  `?map=x,y` → `{ map }` pro políčka všech vlastních hloučků a jejich sousedy, jinak 404
  „Tu mapu rod nezná.“; `?visitors=<villageId>` → `{ visitors: ExpeditionVisitor[] }`
  (`people[].group` = hlouček); `?known=` beze změny.
- **Texty a pohled** `lib/journey-view.ts` – **`expeditionReason(reason,
female?)`** („Od 12 let.“, „Je raněný.“ / „Je raněná.“, „Je na tažení.“, „Je pryč.“, „Tam
  nedojde.“, „Tam je válka.“, „Kůň je doma.“, `busy` – zápis vsi se při souběhu nepovedl – „Zkus
  to znovu.“, `nobody` / `refused` „Rozkaz nelze dát.“),
  **`interpolateExpeditions`** (poloha hloučků na téže mapě), **`lordJourneyViewOf`** (pohled na
  výjezd vojvody pro jeho panel z hloučku s vojvodou), **`sceneJourneysOf`** (jeden `SceneJourney`
  na hlouček, klíč `journeyId` = `${výprava}:${hlouček}`, `partyId` skupiny, muži z lidí hloučku
  s klíčem `sceneManKey` = `${výprava}:${osoba}` – id osoby je jedinečné jen ve vsi; vlastní skupina
  jiné vsi než `villageId` vstupu (ves scény) nese `SceneJourney.villageId`, `home` – odjezd
  a příjezd s postavami vsi – má jen skupina vsi scény na své domovské mapě; vlastní návštěvník bez
  vsi se vybrat nedá), **`partyMembersOf(views, villageId, personId)`** (skupina člověka jen ve
  výpravě jeho vsi), **`partiesOf`**, `JOURNEY_PUSH_MS` (1000 – kolo workeru, které ukládá jedoucí skupinu; rozpětí
  interpolace), `expeditionsKey` a `visitorsKey` (klíče stavu pro události serveru).
- **Hook** `hooks/use-journey.ts` – **`useExpeditions(running, onPartyEnded)`**: stav nese událost
  serveru `journeys` (server-events.md – Výpravy), použitá vždy (server ji posílá jen vlastníkovi);
  na `running` (ves má `expeditionsAway`, nebo právě vyslal) čeká jen dotaz – jeden `GET /api/journey`, když `running` začne platit, na obnovu po mezeře (`sync`)
  a na `refresh()`. Stejné takty pohled nepřepíšou; rozpětí interpolace = `clamp(now − received,
FRAME_MS, 4 × JOURNEY_PUSH_MS)`; `views` (interpolované, překreslení po 100 ms je místní),
  `latest`, `sample(nowMs)`. Zmizí-li skupina nebo hlouček, `onPartyEnded` (jednou za stav) obnoví
  ves; události platí, dokud ves neřekne, že nikdo pryč není.
- **Ves a osoby** – `VillageView.expeditionsAway` (někdo má `away: journey` a v den pohledu je
  pryč – `isAway`, od `untilDay` už ne, i když záznam ves smaže až další den; `dynasty.journeyAway`
  totéž jen pro vojvodu; odznak v liště má navíc stráž konce v `useExpeditionOrders` – skupina
  vojvody z pohledů zmizela, ves to potvrdí až další den); `ScenePerson.expedition` (`lib/person-view.ts`,
  jen s plným stavem vsi 5. parametrem `scenePersons`): `refusal` (`young` / `wounded` /
  `campaign` / `away` z `expeditionRecruit`), `rider`, `inParty`, `strength` (na koni
  `strengthMounted`; ženy a děti 0).
- **Činnosti a upozornění** – `journeyActivity(party)` v `lib/person-activity.ts` podle skupiny
  osoby (`selectionDetails` bere `PartyView[]`): „je na cestě“, „čeká (2 dny)“, „vrací se domů“;
  upozornění `journey-returned` → „Bořivoj se vrátil.“ / „Dobrava se vrátila.“ / bez jména „Výprava
  se vrátila.“ (`lib/player-notices.ts`).
- **Vojvoda** – rozkazy jako ostatní lidé (`use-expedition-orders.ts`, Ovládání); pohled na skupinu
  bere z `useExpeditions` přes `lordJourneyViewOf` a `partyJourneyViewOf`.
- **Testy** – `lib/__tests__/expedition-input.test.ts`, `journey-input.test.ts`,
  `journey-view.test.ts`, `journey-scene.test.ts`, `person-view.test.ts`, `person-activity.test.ts`,
  `player-notices.test.ts`, `dynasty-view.test.ts`, `hooks/__tests__/use-journey.behavior.test.tsx`.

## Ovládání (Úloha 8 výprav – `apps/web`)

- **Výběr lidí** – `VillageTarget` `{ kind: 'people'; ids; villageId? }` (`village-picking.ts`);
  id osoby je jedinečné jen ve vsi, proto `person` i `people` nesou `villageId` člověka jiné vsi
  hráče (klik na jezdce skupiny jiné vsi – `RiderPose.villageId`); chybí – ves scény.
  `peopleTarget(ids, villageId?)` (0 → null, 1 → `person`, víc → `people`), `selectedPeopleIds`
  a `selectedPeopleVillage(target)` (`village-selection.ts`). `nextSelection(current, clicked,
additive, double, partyOf?)`: klik na člena skupiny venku vybere celou skupinu (`partyOf(id,
villageId)` – jen ve výpravě jeho vsi), Shift / Ctrl + klik člověka přidá nebo ubere (člena
  skupiny celou skupinu), člověk jiné vsi výběr nahradí, obydlí a lidé se nemíchají (člověk
  k obydlím výběr nahradí, jiný cíl s Shiftem lidi nezruší). Lidé jiné vsi: `presentTarget` je
  nechá, panel výběru nic neukáže (`selectionDetails` null), postavy vsi kroužek nedostanou.
  Kroužek má každý vybraný: `VillageVillagers.select` (první) + `selectMore` (ostatní), muži
  výpravy `SceneWarView.selectJourneyMen(ids, villageId)` → `ArmyRenderer` (kroužek jede
  s jezdcem, `selectedRider` i `selectedPartyKeys` – praporek – podle vsi). Rozkaz, skupina za
  níž jde scéna (`followed`), tlačítka a důvod odmítnutí berou jen výpravu vsi výběru
  (`useExpeditionOrders`); tlačítka posílají místo kliknutí – důvod je u kurzoru.
  Panel výběru `people` (`SelectionDetails.kind: 'people'`): řada portrétů, síla a Osedlat / Sesednout / Domů (viz Rozhraní, Úloha 9).
- **Rozkaz z kliknutí** – `lib/scene/journey-orders.ts`: `orderFromClick({ selected, point,
mapSizeM, cell })` (čistá funkce) – bez vybraných lidí nebo mimo terén null; v okrajovém pásu
  `EDGE_BAND_M` (20 m) `cross` na souseda políčka (8 směrů, v rohu úhlopříčně), jinak `go` na bod
  s `cell` = mapa, kterou scéna ukazuje. `edgeDirection` dává směr okraje i kurzoru. Mapa je
  vystředěná v počátku, sever = +z = +y mřížky.
- **Scéna** – `ScenePointer.setOrderMode(mode)` (`LandscapeScene.setOrderMode`, typ `OrderMode`):
  dokud je nastavený, pravé tlačítko ohlásí bod terénu (`pickGround`) a pixel plátna místo zrušení
  výběru a pohyb kurzoru volá `hover` (vrací CSS kurzor – šipka u okraje).
- **Kurzor „sem se nedá dojít“** (Martin 16. 11. 2026: „Ideální by bylo, kdyby kurzor na místech,
  kam se nedá dojít, podle toho vypadal“; `lib/scene/march-cursor.ts`): nad hustým lesem, vodou
  bez brodu, místem bez spojení s polohou skupiny a okrajem bez průchodu je kurzor zákazu
  (`FORBIDDEN_CURSOR` = CSS `not-allowed`), bez popisku. `LandscapeScene.marchGrid()` staví líně
  `browserMarchGrid` – `marchGrid` bez vsi (prohlížeč nemá stav vsi) s pevnými cestami a
  pokračováním stezek jako průseky a hustým lesem bez vymýceného lesa vsi (`ClearedForest` scény);
  stavby a opevnění v ní nejsou (server cíl ve stavbě přesouvá na volnou buňku, tak nápovědu
  nemění). Dosažitelnost `cursorBlocked`: bod mapy `marchReachable`, okrajový pás `edgeReachable`
  (kus okraje ve směru v téže oblasti `marchAreas`; sousední mapu prohlížeč nezná, průchod na
  druhé straně ověří server). Odkud skupina vyráží: vybraná skupina na mapě scény (`group.pos`),
  jinak obydlí prvního z vybraných doma (`dwellingPoint`); jinde nápověda není. Jen vizuální
  nápověda – rozkaz dál ověřuje server.
- **Hook** `components/game/village-game/use-expedition-orders.ts` – `useExpeditionOrders`: režim
  rozkazu je zapnutý, když výběr obsahuje lidi (s vybranou stavbou nebo polem pravé tlačítko výběr
  ruší jako dřív). Pravé tlačítko → `commandExpedition({ villageId, people, command })`, kde
  `villageId` = domovská ves vybraných (`ExpeditionView.villageId`; lidé doma = ves scény). Nemůže-li
  nikdo z vybraných (`ScenePerson.expedition.refusal` u všech), ukáže `orderClick` důvod
  (`expeditionReason`) u kurzoru bez dotazu na server; odpověď `{ error }` také u kurzoru a výběr
  zůstane. Dvojité pravé kliknutí nevyšle dvakrát (běžící rozkaz v ref). Vrací `note`, `watching`,
  `followed`, `back`, `bindForeign`, `away` (portrét vojvody v liště), `buttons` (`ExpeditionPersonState`
  vybraných lidí pro tlačítka na cizí mapě) a `command(c)`. Dotazování na výpravy: `useExpeditionPolling` (běží,
  dokud ves ví o lidech venku nebo právě vyjeli); zmizí-li hlouček, ves se obnoví. „Na sousední
  mapu“ a důvod ukáže `JourneyCursorNote` u kurzoru.
- **Rozhraní (Úloha 9)** – tlačítka `ExpeditionButtons` (`hud/ExpeditionButtons.tsx`): Osedlat
  (`expedition/saddle.png`), Sesednout (`expedition/dismount.png`), Domů (`war/alarm-return.png`);
  jen ikony, název a důvod zašedlí v `Tooltip`. Co se ukáže, určuje `expeditionButtons(people)`
  v `lib/expedition-buttons.ts` (`ExpeditionPersonState` = `{ personId, rider, mounted, horse,
inParty, atHomeMap, horseWork }`, `ButtonState` = `'hidden' | 'enabled' | { disabled }`): Osedlat
  – je-li vybraný jezdec, který nesedí; zašedlé „Kůň je doma.“, když všichni takoví jsou mimo
  domovskou mapu a kůň je v ohradě, nebo „Skupina právě sedlá.“; Sesednout – sedí-li někdo na koni;
  Domů – je-li někdo ve skupině. Stav člověka skládá `expeditionPersonState` z `PartyView` (člen
  skupiny; doma = hlouček na mapě `homeCell`) nebo z `ScenePerson.expedition`. Jeden vybraný:
  `PersonBody` a pod ním tlačítka (`SelectionDetails.person.expedition`); víc vybraných:
  `GroupBody` (`hud/selection/expedition.tsx`) – řada portrétů (`resident-select-<id>` vybere jen
  toho člověka), meč (`house/sword.png`) se součtem síly a tlačítka (`SelectionDetails` `people` =
  `{ people: { id, portrait, role }[], strength, states }`). Příkaz jde přes `useExpeditionOrders`
  `command`; test id `expedition-saddle` / `expedition-dismount` / `expedition-home`.
  `LordAwayBadge` v horní liště:
  portrét vojvody s podkovou, klik vybere jeho skupinu. Panel muže na cestě ukazuje `journeyActivity`
  (`selectionDetails(…, journey)`). Pohled vsi nese `dynasty.journeyAway` (`dynasty-view.ts`).
- **Testy** – `lib/scene/__tests__/journey-orders.test.ts`, `village-selection.test.ts`,
  `components/game/village-game/__tests__/use-expedition-orders.behavior.test.tsx`, `hooks/__tests__/use-journey.behavior.test.tsx`,
  `lib/__tests__/dynasty-view.test.ts`, `person-activity.test.ts`, e2e `e2e/expeditions.spec.ts` (projekt
  `worker` – spec pouští worker jako `worker.spec.ts`).

## Scéna vsi (Úloha 8b – `apps/web`)

- **Jezdci** – `lib/scene/journey-riders.ts` (čisté): `SceneJourney` (z `JourneyView` a
  `JourneyVisitor`: výjezd, vlastní, jméno vojvody a rod, takt, poloha, cíl na mapě, muži, `arrived`,
  `phase`, `waitDaysLeft`). `journeyFormation` – hlouček kolem `group.pos` jako pochod vojska
  (`huddleSlots`: jezdci vpředu, vojvoda uprostřed, pěší za nimi, ranění vzadu). `ridersAt` – každý
  muž jde mezi stavy rovně ze své nakreslené polohy na nové místo a hledí, kam jde (hlouček se
  v zatáčce neotočí skokem); nový muž a skok přes mapu stojí rovnou. `JourneyGlide` – stavy po
  výjezdech se **přehrávají podle taktů se zpožděním** `PLAY_LAG_TICKS` (8 taktů = 2 s; D49, Martin 15. 11. 2026: „cestou měnil rychlost“): muž jde mezi stavy tempem jádra, i když worker ukládá
  v nepravidelných kolech (≈ 1 s, déle s prací vsí) a server stav pošle při každém uložení; přehrávání drží
  zásobu zrychlením či zpomalením nejvýš o `PLAY_SLACK` (6 %). Dřív každý nový stav spustil nový
  posun z nakreslené polohy za `glideMs` – muž střídavě stál a dobíhal (měření: 0–10,5 m/s při
  jádru 5,25 m/s). Hlouček, který stál (poslední dva stavy na místě), se rozjede s prvním stavem
  v pohybu (pohyb k němu jako dřív `glideMs`) o tolik později, aby měl zásobu; zásoba nad 40 taktů
  se zahodí. Stejný takt pohyb nepřeruší, omezený pohyb stojí na novém místě. Tempo jádra se mění
  jen s terénem (cesta × 1,5, les – war.md – Pohyb vojska). `headingOf` – směr z posunu, jinak k cíli.
  `SceneJourney.men[]` nese `look` (`line` muž rodu, `man` / `woman` vesničan a vesničanka, `child`;
  `lookOf` v `journey-view.ts`) a `led` (jezdec vede koně). `journeyFigures` – jezdci
  (`ARMY_LOOKS.line`, `ride` / `ride-trot` / `ride-idle`) a pěší jako postavy vsi
  (`ARMY_LOOKS.folk`, `side 'folk'`, `walk` / `idle` bez oštěpu, žena `woman.glb`, dítě `scale` =
  `CHILD_FIGURE_SCALE` z `refugee-march.ts`); jezdec s `led` jde pěšky a vedený kůň je zvíře vojska
  `LED_HORSE_SIDE_M` (1,2 m) vpravo od něj, ve stejném směru a kroku – stejnými instancemi jako
  vojsko (`ArmyRenderer.setJourneys` – žádný mesh ani vertex buffer navíc). `pickRider` – klik od
  země po hlavu (dítě nižší). `journeyHorseIds` – koně jezdců i vedení koně vlastní vsi
  (`Horse.riderId`) ohrada nekreslí (`setRidingHorses`).
- **Praporek** – `lib/scene/journey-marker.ts`: `journeyMarks(journeys, selected)` (návrh Clauda) –
  praporek jen na cíli hloučku **vybrané skupiny** (`selected` = klíče `${journeyId}:${partyId}`,
  `partyKeyOf`; `selectedPartyKeys` je odvodí z vybraných lidí – `SceneWarView.selectJourneyMen`),
  dokud skupina jede ven nebo čeká (`phase: 'out'`, cíl na této mapě – jádro cíl ve vodě posune na
  nejbližší dosažitelné místo, praporek stojí tam); nevybraná skupina, cizí výjezd ani návrat domů
  praporek nemají. Změna výběru praporek přepíše a vyžádá překreslení. `JourneyMarker` – tyč a cíp z vlastní geometrie; přepíše se jen při změně
  (žádné kreslení navíc). Použije i scéna cizí mapy (Úloha 9). Přesýpací hodiny s počtem dní nad
  čekající skupinou Martin 14. 11. 2026 zrušil („je to k ničemu“); dny čekání zůstávají v panelu
  osoby (`waitDaysLeft`).
- **Napojení** – `SceneWarView.setJourneys` (drží výjezdy i přes novou krajinu) ←
  `LandscapeScene.setJourneys` ← `components/game/village-game/use-journey-scene.ts`:
  `sceneJourneysOf` (`lib/journey-view.ts`) – vlastní hloučky z `useExpeditions(...).latest` (poslední
  pohled bez interpolace – muže posouvá scéna), je-li skupina na mapě vsi; ostatní z
  `useJourneyVisitors` (`hooks/use-journey-visitors.ts` – seznam nese událost serveru `visitors`
  své vsi; jeden `GET /api/journey?visitors=` při zapnutí, změně vsi a na obnovu po mezeře, stav ves dostane i při připojení; výpadek
  sítě ani chyba serveru nic nerozbije, událost jiné vsi se zahodí, stejný `visitorsKey` scénu
  nepřekreslí). Událost platí vždy, když sedí ves; `MapWatch.riders` (D62) je pryč (server-events.md – Výpravy). Jméno a rod vlastního vojvody dodá jeho záznam mezi návštěvníky.
- **Výběr** – klik na vlastního muže vybere člověka vsi (`person` – panel z Úlohy 8a), na cizího
  `VillageTarget` `visitor` (`journeyId`): panel ukáže portrét koně se jménem vojvody, rod (ikona
  praporu) a počet jezdců a pěších (`selectionDetails(…, visitors)`, `visitor-panel`). Vybraný muž
  vlastního výjezdu (i vojvoda, který z vsi právě odjel – postava vsi už není) má žlutý kroužek,
  který jede s jeho jezdcem jako jednotka v 0 A.D. (Martin 14. 11. 2026: „zmizelo kolem něj
  označení“): `LandscapeScene.setSelection` → `SceneWarView.selectJourneyMan` →
  `ArmyRenderer` (`selectedRider` v `journey-riders.ts`, `SelectionRing` `journey-ring`, jezdec
  elipsa podél koně) – při odjezdu, jízdě i příjezdu; na cizí mapě totéž (`useExpeditionOrders` předá
  výběr scéně cizí mapy). E2e háček `journeyScene().selected`.
- **Den rodiny** – muž na výjezdu (`away: journey`) není v `SceneLord.trainees` (`sceneLord`
  v `village-view-scene.ts`), takže ho scéna nekreslí na dvorku ani na cvičišti; kreslí ho jako
  jezdce výjezdu. Ostatní nepřítomní (tažení…) zůstávají jako dosud.
- **Sedlání, připojení a návrat** – viz níž (Úloha 11).
- **e2e** – háček `journeyScene` (`lib/e2e-hooks.ts`: muži, jak jsou nakreslení, praporek);
  `e2e/expeditions.spec.ts` „výpravy ve scéně“ – dva hráči, dvě skupiny naráz, praporek u cíle vybrané skupiny (zůstává při čekání), cizí výprava u vsi (bod checkpointu přepsaný v DB)
  a klik na něj. `JOURNEY_SHOT=<cesta>` uloží snímek. E2e běží s omezeným pohybem (`reducedMotion`)
  – muži tam skáčou na nový stav, plynulý posun kryje `journey-riders.test.ts`. Cíl ve vodě
  (praporek na souši) závisel na náhodné krajině a byl nestabilní – kryje ho unit test
  `journey.test.ts` (posunutý `group.goal` leží na souši) a `journey-marker.test.ts` (praporek na
  `group.goal`).
- **Testy** – `lib/scene/__tests__/journey-riders.test.ts` (i stálé tempo při nepravidelných
  stavech – D49), `journey-marker.test.ts`,
  `lib/__tests__/journey-scene.test.ts`, `hooks/__tests__/use-journey-visitors.behavior.test.tsx`.

## Sedlání, připojení a návrat (výpravy – plán 2026-11-14, Úloha 11 – `apps/web`)

Jen podívaná ve scéně vsi (expeditions.md – Ve scéně) – server o ničem z toho neví, jádro počítá
s časem `untilTick`. Nic se „neodjíždí z dvorce“: výprava vyjíždí odkudkoli, kde stojí její
hlouček. Nahradilo dřívější odjezd a příjezd výjezdu vojvody z dvorce.

- **Logika** `lib/scene/expedition-choreo.ts` (čistá, výkonový čas v ms jako `JourneyGlide`;
  `ChoreoContext` dává `yard`, `nowMs`, `figureAt`, `riderAt`, `adultNear`):
  - `horseWorkScript(work, ctx, tickMs)` – **sedlání:** vesničan `groomId` od své postavy
    (`figureAt`, jinak vchod jeho obydlí `entryOf`) k brance ohrady prvního koně, koně vyjdou a jdou
    za ním po `leadPath` k jezdcům (jak jsou nakreslení – `riderAt`), jezdci nasednou v `untilTick`
    (`Seat`). Bez vesničana (`groomId` null) jde každý jezdec pro koně sám (`Actor.replaces`).
    **Sesednutí:** vesničan k jezdcům do `untilTick`, ti sesednou, pak vede koně do ohrady
    (`LedScript.back`) a vrátí se, odkud přišel. **Tempo:** trasa se natáhne nebo stáhne
    (`tickMs(untilTick) − nowMs`, nejméně 1 s), příchod ke koním a k jezdcům padne na `untilTick`.
  - `joinScripts(people, ctx)` + `chasePose` – nový člověk jde od místa, kde je jeho postava vsi
    nakreslená (jinak od vchodu obydlí), **po cestě postav** (`Chase.via` – `yard.leg`, z domu
    dveřmi a brankou pozemku; D49 – dřív rovně zdí) tam, kde ho hlouček nakreslil (u domova branka
    dvorce), pak stahuje odstup od svého místa (`Chase.tail` – zapíše první snímek po cestě);
    tempem `CATCH_M_S` (pěší 3 m/s, jezdec 4,5 m/s – návrh Clauda), na konci přesně ve stavu
    `JourneyGlide`.
  - `arrivalScript(group, ctx)` – hlouček, který zmizí u domova: jezdci (i pěšáci s vedeným koněm)
    dojdou ke kůlu dvorce a sesednou, koně odvede nejbližší dospělý doma (`adultNear`), jinak
    jezdec sám, k brance ohrady; ostatní jdou ke vchodu svého obydlí (`entryOf`, jinak vchod
    dvorce) a vejdou. Vedený kůň se tak doma odevzdá.
- **Kdy** (`ExpeditionLeave.observe` – po hloučcích, klíč `${journeyId}:${groupId}`, ze stavů
  ze serveru): **nové `horseWork`** (`SceneJourney.horseWork` z `PartyView.horseWork`) → scénář, jen
  když příkaz padl nejvýš 3 s před pohledem a hlouček stojí do `HOME_REACH_M` (150 m) od domova;
  **noví lidé** (osoba, kterou scéna ještě v žádném hloučku neviděla) u domova → připojení, jakmile
  je hlouček nakreslí (lhůta 3 s); **hlouček, který u domova zmizel** (poslední fáze `returning`,
  nebo nejvýš `HOME_REACH_M` od domova), a vracející se hlouček u domova (`ARRIVE_M`, 30 m) →
  příjezd. První pohled jen zaznamená, co je – načtení stránky uprostřed sedlání nebo výpravy nic
  nepřehraje. Omezený pohyb scénáře přeskočí (lidé stojí, kde je ukáže server). Cizí hloučky
  nic nehrají.
- **Místa** – `expeditionYard(ctx)` (`villager-plan-lord.ts`, v plánu postav → `DraftCrew.yard` →
  `VillageVillagers.yard()` → `onCrew` → `SceneWarView.setExpeditionYard`): vchod a brána dvorce,
  koně jezdců u kůlu (`hitchSpot`) s cestou z branky ohrady (`leadGate` + `leadPath`), `gateOf`
  (branka ohrady koně), `horseOf` (kůň jezdce), `entryOf` (vchod obydlí podle `persons[].home`)
  a `leg` (pěšiny). Bez cvičiště (zemnice) se nic nepřehrává. Postavy vsi dodává
  `VillageVillagers.choreoPeople()` (`figureAt` ze `spotOf`, `adultNear` podle měřítka postavy)
  přes `SceneWarView.setChoreoPeople` → `ArmyRenderer`.
- **Kreslení** – `ArmyRenderer`: `ExpeditionLeave.at` upraví stavy `JourneyGlide` (jezdci nasedají
  a sesedají, noví lidé dohánějí, hlouček u domova se rozchází, vesničan vede koně); kůň bez
  jezdce je zvíře vojska (`journeyFigures(poses, led)`) – žádný mesh ani vertex buffer navíc.
  `LandscapeScene` – koně ve scénáři ohrada nekreslí (`journeyAway().horses` do `setRidingHorses`),
  lidi ve scénáři nekreslí postava vsi (`VillageVillagers.setScripted(journeyAway().hidden)` –
  hned, bez přestavby plánu), muže z příjezdu den rodiny (`withoutMen`), dokud příjezd neskončí.
- **e2e** – háček `journeyScene` hlásí `phase` (`saddling` / `unsaddling` / `joining` / `riding` /
  `arriving`), `led` (koně bez jezdce), `groom` (vesničan, který vede koně), bránu (`gate`)
  a koně mimo ohradu (`awayHorses`). E2e: `e2e/expeditions.spec.ts` – „dva vesničané“ (Shift + klik, výběr jede se skupinou, Domů), „vojvoda a syn“ (Osedlat, přes okraj, Sesednout, Domů – kůň v ohradě).
- **Testy** – `lib/scene/__tests__/expedition-choreo.test.ts` (sedlání s vesničanem i bez, tempo,
  sesednutí, připojení bez skoku, z domu dveřmi a brankou, příjezd s dospělým i bez, vedený kůň, načtení uprostřed, omezený
  pohyb).
- **Známé omezení** – vesničan vedoucí koně je vždy `man` (pohlaví scéna nezná) a po scénáři se
  objeví tam, kde ho má plán dne; rozkaz ven během příjezdu příjezd nepřeruší.

## Scéna cizí mapy (Úloha 9b – `apps/web`)

lord-control.md – Co vojvoda vidí, Co hráč vidí (Na cestě), Ve scéně. Scéna jde za vojvodou z mapy
na mapu jako za vojskem (web-ui.md – Cizí mapa ve scéně).

- **Přepnutí** – `watchedJourneyCell(following, view)` (`lib/journey-scene-view.ts`, čistá): sleduje-li
  hráč vojvodu, políčko cizí mapy, na které skupina je; null – scéna vsi (nesleduje, výjezd skončil,
  nebo je skupina zpět na domovské mapě – po 3 dnech čekání či po Domů). Klik na `LordAwayBadge`
  (`away.onSelect` v `useExpeditionOrders`) vojvodu vybere a je-li na cizí mapě, zapne sledování; skupina
  na domovské mapě sledování vypne (návrat scény nečeká na konec výjezdu – upozornění „… se vrátil.“
  přijde, až dojede). `useExpeditionOrders` vrací `watching`, `back` (⌂ – výjezd běží dál) a
  `bindForeign`. `VillageGame` při `watching` vrátí jen `ForeignJourneyScene` (klíč = políčko) –
  jedna scéna Babylonu naráz jako u tažení; nové políčko = nová scéna a krajina.
- **`ForeignJourneyScene`** (`foreign-scene`, `data-cell`, `data-journey`): krajina z
  `GET /api/journey?map=x,y` (404 nebo chyba = zpět na ves) do `GameView`, jezdci vlastního výjezdu
  z `journey.latest` (`sceneJourneysOf` bez návštěvníků) s praporkem
  (`journey-marker.ts`), stavby `seenVillageOf(seen, krajina)` → `setVillage` – přestaví se jen při
  změně znalosti (`seenSceneKey`: ves, klíč a den každé stavby). Odjezd ani příjezd se tu nekreslí
  (scéna nemá dvorec – `setExpeditionYard` se nevolá). Kamera poprvé na skupinu (R se k ní vrací).
  Rozhraní vlevo nahoře: ⌂ (`foreign-back`), portrét vojvody (`LordAwayBadge`, výběr) a tlačítka Osedlat / Sesednout / Domů
  (`ExpeditionButtons`); důvod a „Na sousední mapu“ u kurzoru (`JourneyCursorNote`).
- **Rozkazy** – `bindForeign({ scene, mapSizeM })` předá `useExpeditionOrders` scénu cizí mapy; režim
  rozkazu (`setOrderMode`) pak běží na ní s políčkem `watching` – `go` po mapě, okrajový pás → `cross`
  na souseda cizí mapy, důvod u kurzoru jako doma.
- **Výběr klikem** – `useExpeditionOrders` poslouchá `onSelect` scény cizí mapy a výběr drží jako ve vsi
  (`foreignJourneySelection` – `nextSelection` jen s muži vlastního výjezdu): klik na vojvodu ho
  vybere celou jeho skupinu (Shift přidá), do prázdna výběr zruší (s Ctrl / Shift
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
  vzdálený dům B neobjevený a nenakreslený, dům u skupiny ano, klik do prázdna zruší výběr
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
- **Další výjezd (Úloha 11)** – `expeditionViewsFor` (`seenOnMaps`) přečte znalost rodu o mapě skupiny
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
  herní den pro každý hlouček, který stojí na začátku dne v hustém lese (`MARCH_FOREST` pod jeho polohou
  v mřížce pochodu, `gridOf`) – hustým lesem vede jen stezka (plán 2026-11-16-dense-forest), šelmy tedy čekají na stezce (hlouček 1 muže: los proběhne; v okrajovém pruhu bez `MARCH_FOREST` ne; test `journey-predators.test.ts`). Mimo hustý les, nad `JOURNEY.predatorGroupMax` živých mužů (tři
  nikdy) ani na mapě bez šelmy se nelosuje.
- **Los** `predatorDay({ members, inForest, wildlife, seed, day })`: čistá funkce, proud
  `createRandom(deriveSeed(seed, 'predators:' + day))` u hloučku 0 (staré výjezdy beze změny), jinak
  `predators:<den>:<id hloučku>` (`predatorDay` – `group`; plán 2026-11-14 – Rozhodnutí 9); každý
  člověk hloučku v pořadí `members` dostane vždy
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
