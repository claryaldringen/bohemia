# Vazalství (`packages/game/src/domain/vassalage`)

Pravidla: [vassalage.md](../design/vassalage.md) – Dávky (Makrokomodity, Výhled), Doprava a cílová
ves, Lidé a robota, Čísla. Plán: `docs/superpowers/plans/2026-11-03-multiplayer-vassalage-war.md`
(Fáze 4). Čistá doména – žádná DB, web ani use-casy; strom pod rodem a zákaz vzájemného vazalství
jsou v `tree.ts` (viz `world.md`).

## Čísla (`rules-vassalage.ts`)

`VASSALAGE` – tabulka Čísla vassalage.md: roční dialog 1. 11., pojistka `reserveYears` 2, měsíc
dopravy listopad, `travelDaysPerCell` (= `WORLD.travelDaysPerCell`), robota (`corvee` – od 16 let, nejvýš
30 dní na člověka, déle jen když ves nemá dost lidí, nejvýš rok), služba a povýšení od 16 let,
rozsudek po 1 skutečném dni. Doprava jen odkazuje na obchod (`TRADE`, `CARTS`, `TRADE_GOOD_VALUES`)
– nosič 25 kg, kláda 100 kg = 2 nosiči, vůz 400 / 800 kg s 2 vozkami, honák 10 kusů dobytka, koně
po 4 na ohlávce (horses.md – Nákup a prodej). Pozvánky a mapa jsou v `INVITES` a `WORLD`, pauza
jednání v `NEGOTIATION`. Úloha 4.2 přidala `termLimits` (nejvyšší dohodnutá dávka, odměna a služba – jen
proti překlepům, skutečný strop dává výhled), `noticeDepth` (12 pater, kam dojde upozornění na
vypovězení) a `panelTreeDepth` (6 pater stromu v panelu).

## Makrokomodity (`macro.ts`)

`MacroGoods` – `grainKg`, `hayKg`, `cattle` (`Record<CattleGood>` – krávy, mladí a vycvičení voli
jako v obchodě), `horses`, `logs`; `MacroSpare` přidá `people` (`TradePeople` – rodiny, muži, ženy)
a `laborDays` (robota, čd za rok). Pomocné: `noMacroGoods` (vždy nový objekt), `combineMacro`,
`addMacro`, `subtractMacro` (nejméně 0), `minMacro`, `macroGoodsOf` (bez lidí a roboty).

## Výhled vsi (`spare.ts` – `villageSpare(state, day)`)

Z dnešních zásob (nejvíc vypovídá 1. 11. po výmlatu) nad pojistku vsi (návrh Clauda):

- **Obilí** – zásoby + zrno nevymlácených snopů − 2 × (roční jídlo z pole `yearlyFieldNeed` + osivo
  na osev `min(landHa, laborHa)` ze `stewardOutlook` × `SEED_KG_PER_HA`). Ves v hladu (`hungry`) 0.
- **Seno** – zásoba − `winterHayNeedKg` (stáda, voli, koně) ÷ `winterHayAvailable(1)` (ztráty ve stohu).
- **Dobytek** – krávy `surplusCows` (chovné + na telata do výcviku); voli nad `oxenTrainingTarget`
  – napřed mladí, pak vycvičení prodejní (`cattleForSale`).
- **Koně** – menší z koní bez jezdce k prodeji (`horsesForSale` přes druhy, hřebec zůstane) a koní
  nad `horsesWanted` (jezdecký kůň každého muže rodu, klisny, hříbata).
- **Klády** – celá hromada (`woodLogs`); pojistka na ně není, drží je doprava.
- **Lidé** – když práce v oknech setí stačí na víc pole, než ves má (`laborHa > landHa`), díl
  dospělých `1 − landHa / laborHa`; výběr jako ve výměně lidí (`emigrantGroups` – muži rodu a jejich
  ženy ne). Rodiny, dokud jejich dospělí nepřesáhnou díl; muži a ženy zvlášť. Řádky lidí se
  nesčítají (berou z týchž lidí). Ves bez pole 0.
- **Robota** – `yearlyCommonLabor` × 365 (společná práce = po potřebných úlohách, tedy i po osevu
  a žních) − zbývající práce rozestavěných staveb.

## Doprava a výhled rodu (`transport.ts`)

- `transportLimit(state, day, cells)` – práce = `yearlyCommonLabor` × dny listopadu; cesta tam
  a zpět `2 × cells × travelDaysPerCell` (0 políček = `TRADE.tripDays.min`). Napřed vozy
  `tradeCarts` (doma, s voly; čtyřkoláky napřed) – každý `max(1, ⌊listopad ÷ cesta⌋)` jízd, dokud
  stačí práce na vozky; zbytek práce nosiči. Dobytek a koně jen honáci z celé práce. Každý řádek
  platí pro zboží samotné (celá doprava jen na něj) – řádky se nesčítají.
- `houseSpare(villages, targetCell, commitments)` – `HouseVillage { state, cell, day? }` (bez `day`
  `state.lastDay`); u každé vsi `min(villageSpare, transportLimit(cellDistance))`, součet přes vsi,
  pak − závazky (`MacroCommitments` – makrokomodity, volitelně lidé a robota), nejméně 0. Závazky
  se odečtou až od dovezitelného – berou přebytek i dopravu (návrh Clauda). Vymřelé a opuštěné
  vsi nic nedají. Lidé a robota bez dopravy (jdou po svých).

Funkce nemění vstupní stav (test). Výhled se počítá jen při otevření formuláře nebo dialogu.

## Změřeno (6. 11. 2026)

`villageSpare` na kopii Vlkova z vývojové DB (den 131 860, 25 lidí, 3 MB stavu): **medián 13,4 ms**
z 20 běhů (12,6–21,4 ms), `transportLimit` 0,005 ms. Výhled: obilí 0 (4 345 kg je pod dvěma
ročními potřebami), seno 699 kg, dobytek a koně 0, klády 3 653, 1 muž, robota 2 551 čd; doprava na
1 políčko 1 300 kg / 26 klád, na 5 políček 250 kg / 5 klád (bez vozů).

## Zásilky mezi vsemi hráčů (`shipment.ts`, `application/shipments.ts`, úloha 4.3)

Jediná cesta, jak zboží a lidé přejdou z vsi jednoho hráče do vsi druhého (dávky, dary, půjčky,
odměny – dialogy a jednání ji jen volají). Návrh: `docs/design/vassalage.md` – Doprava a cílová ves.

- **`dispatchShipment(state, day, { bundle, cells, firstStep, … })`** (čistá, stav nemění): zkontroluje,
  že ves svazek má (`Ves tolik obilí nemá.` apod. – dobytek a koně jen co smí do prodeje, lidé
  `emigrantGroups` bez mužů rodu), a vrátí `{ ok: true, state, body, arrivesDay }`. Obilí, seno,
  klády, dobytek, koně a lidé ze vsi zmizí hned (lidé zůstanou v rodokmenu jako odešlí ve směru
  cesty); ves dostane `TradeExpedition { kind: 'shipment', destination: { cells, firstStep },
trailId: -1, give, porters, days = 4 × cells, cost = porters × days }` – nosiči, honáci a vozkové
  jdou ze společné práce vsi zdarma (`expeditionLaborToday`), po návratu výprava bez zápisu zmizí
  (`finishExpeditions`). Do podílů práce po stezkách (`workExpeditions`) zásilka nepatří, soused
  v témže směru ji nevidí (`expeditionTo`) a vojvodův doprovod ji nevybere (`lord.ts`). Robota
  (`laborDays`) zásilkou nejde. **Mez dopravy (`transportLimit`) funkce nehlídá** – hlídá ji dialog
  a výhled (`houseSpare`), jinak by test s chudou vsí odmítal i malou zásilku.
- **Doba cesty** (`shipmentDays`): příjezd za `2 × cells` dní (`VASSALAGE.travelDaysPerCell`), uvnitř
  políčka polovina nejkratší cesty k sousedovi (aspoň den), nosiči se vrátí za dvojnásobek.
- **`receiveShipment(state, day, body)`** (mutuje, volá ji `applyInboxDay` pro tělo
  `{ kind: 'shipment', shipment }`): zásoby, seno (`hay.kg`), klády (`addLogs`), dobytek
  (`addCattle` – do ohrad, kdo se nevejde, jde volně), koně (`addHorses`; bez ohrady koní je ves
  poráží – jako v obchodě), lidé `settleNewcomers` s novými místními id (los věku a pohlaví podle
  `body.key`, `origin` = směr odesílatele). Kronika: `shipment-sent` (u odesílatele) a
  `shipment-received` (`returned: true` u vrácené).
- **Jídlo domény** (`ShipmentBody.domain`, `sendShipment(…, { purpose: 'domain-food', domain: true })`;
  hillfort.md – Jídlo domény, Martin 8. 11. 2026): `receiveShipment` s `domain` dá obilí do `storesKg`
  jako dnes, ale každý kus dobytka se hned poráží – `meatKg += LIVESTOCK.meatKg.cow` (120 kg), do stád
  ani ohrad nejde (žádné `addCattle`, `ensureLivestock`) – a zapíše `domainFoodDay = day` (kdy
  naposledy přišlo jídlo domény; čte správce hradiště). Vrácená zásilka (cíl zanikl) `domain`
  ztrácí – dobytek se odesílateli vrátí živý. Kronika webu (`purpose === 'domain-food'`):
  odesílatel „Jídlo pro ves {jméno}: …“, příjemce „Jídlo z vsi {jméno}: …, dobytek poražen“ (návrh Clauda).
- **Bilance** (testy `shipment.test.ts`): odesílatel + příjemce = konstanta pro obilí, seno, klády,
  krávy, voly, koně i počet lidí. Dvě odchylky podle pravidel obchodu: voli přijdou s výcvikem
  `boughtOxTrainedDay` (ne s původním), koně dostanou nová id; věk a pohlaví lidí se na druhé straně
  losují znovu (počty sedí).
- **`sendShipment(deps, { fromVillageId, toVillageId, bundle, purpose, refId, today })`** – pod
  zámkem držitele odesílatele (`PlayerLock.run`). Pořadí kroků a odolnost proti pádu:
  1. řádek `shipment` (`reserve`, `ref_id` jedinečný = idempotence odeslání),
  2. uložení odesílající vsi (verzovaně) se zásilkou na cestě – výprava nese `shipmentId`,
  3. událost `shipment` do schránky cílové vsi (`ref` = `ship:<id>`, den `today + 2 × cells`)
     a `posted_at`.
     Ves se dopočítá volající (stav v den `today`). Cíl, který už zanikl (`extinctDay`,
     `abandonedDay`), odeslání odmítne.
- **`reconcileShipments(deps, today)`** (`runWorldTasks`, worker 1× za minutu, pod `tryRun`
  zámkem držitele odesílatele): řádek bez `posted_at` – odesílající ves nese `shipmentId` → událost
  se dopíše (druhý zápis téhož `ref` se zahodí, doručí se právě jednou), jinak se ves neuložila a
  rezervace se zruší (zboží zůstalo doma); zapsané a nevyřízené řádky – událost je ve schránce cíle
  nespotřebovaná a cíl zanikl → zásilka se **vrátí odesílateli**, jinak se po spotřebování řádek
  vyřídí (`settled_at`). `ShipmentRepository.onTheWay(toVillageId)` = seznam „na cestě“ pro panel.
- **Příjezd do zaniklé vsi** (rozhodnutí návrhu Clauda): schránka spící vsi se nikdy nepoužije, takže
  zboží a lidé by beze stopy zmizeli a porušila by se bilance. Proto se vracejí odesílateli
  zpáteční událostí `ref = ship-back:<id>` v den `today + doba cesty`, v kronice odesílatele
  „Zásilka se vrátila z vsi …“ (`returned`). Je-li zaniklý i odesílatel, nemá komu a zásilka
  zanikne s ním.
- **Po konci vazalství** zásilka dojde: nezávisí na stavu vazalství, jen na řádku a události.
- **Tabulka** `shipment` (migrace `0023_shipment`): `id`, `from_village_id`, `to_village_id`,
  `bundle` (= `ShipmentBody`), `purpose`, `ref_id` (unique), `sent_day`, `arrives_day`, `posted_at`,
  `settled_at` (sloupec navíc oproti plánu – bez něj nejde poznat vyřízenou zásilku). Řádek mizí
  s kteroukoli vsí (`ON DELETE CASCADE`). `SettlementRepository.find(id)` přibyl pro polohu vsí.
- **Scéna**: `sceneExpeditions` (`apps/web/lib/caravan-view.ts`) vykreslí zásilku jako karavanu bez
  stezky po čáře od vsi ke kraji mapy ve směru `destination.firstStep` (`purchaseRoute`,
  `purchaseLine`); lidé a dobytek jdou jen tam, zpět nosiči bez nákladu, bez `trip` (jméno cílové vsi
  scéna nezná).

## Podmínky dohody (`terms.ts`, úloha 4.2)

`VassalTerms { tribute?; service?: { men, days }; targetVillageId?; reward? }` – uložené v
`vassalage.terms` (jsonb). `MacroBundle` (= tvar `MacroSpare`: makrokomodity, `people`, `laborDays`)
je dohodnutá dávka nebo odměna. V jednání jsou to řádky `TermItem` (`domain/negotiation/types.ts`):
`oath`, `tribute { goods }`, `service { men, days }`, `target-village { villageId }`, `reward { goods }`.
`checkBundle` / `checkTermLine` / `checkTermLines` hlídají čísla (nezáporná, celé kusy, meze
`termLimits`, dávka nesmí být prázdná, každý druh jednou), `termsOfLines` / `linesOfTerms` převádějí
řádky a podmínky. Doména jednání (`openRound`, `counterRound`) kontroluje řádky při každém kole.

- **Nová dohoda:** přísaha je povinná; přijetí založí dohodu s podmínkami celého kola
  (`EffectContext.terms`). Účinky nových druhů řádků jen kontrolují, zápis dělá přísaha.
- **Změna podmínek existující dohody:** kolo bez přísahy (`openRound({ withoutOath: true })`, v protinávrhu
  přísaha nesmí přibýt). Use-case ověří, že dohoda mezi rody trvá (`NO_AGREEMENT`). Přijetí volá
  `VassalageRepository.updateTerms(id, terms, expectedVersion)` (verze +1) **před** uzavřením jednání;
  do přijetí platí staré podmínky, odmítnutí a stažení dohodu nemění. Do kroniky obou rodů jde krok
  `terms-accepted`.
- **Cílová ves** musí patřit pánovi dohody (`checkTargetVillage` přes `WorldDirectory.entriesOf` –
  `NegotiateDeps.worldDirectory`); pán je přísaha `lord`, u změny `lordHouseId` dohody.

## Vypovězení (`application/renounce.ts`)

`renounceVassalage(deps, { playerId, vassalageId, message, now, today })` – smí kterákoli strana,
platí hned (`end(id, 'renounced', at)`; ostatní dohody obou stran trvají). Upozornění
`vassalage-renounced` dostane každý hráčský rod stromu kolem obou stran (`treeAround` nad hranami
`edgesNear` z obou konců do `noticeDepth`) právě jednou; payload je jen veřejný (id a jména rodů),
**vzkaz** má jen druhá strana. Kronika obou rodů dostane neutrální větu (`vassalage-renounced`).
Háček `onVassalageEnded(hook)` + `runVassalageEnded` – registr je zatím prázdný, naplní ho 4.4
(smazat dialogy) a 4.8 (ukončit správu); selhání háčku vypovězení nevrací.

## Neplnění

`VassalageRepository.addBreach(id, kind: 'levy' | 'repay' | 'summons' | 'judgment', day)` zvedne
`Vassalage.breaches`; neplnění dohodu **neukončí** (vassalage.md – Neformální výpověď), vidí ho pán
v panelu (zlomená pečeť s počtem). DB zatím ukládá jen počet (druh a den drží port pro pozdější
záznamy; zapisují 4.4, 4.6, 6.13, 6.16).

## Data pro panel a výhled

`housePanel` (`application/house-panel.ts`) nově nese `agreements` (dohody hráčova rodu: podmínky,
neplnění, id pro vypovězení), `tree` (`PanelTreeNode` – vazalové pod hráčem do `panelTreeDepth` pater
přes `treeBelowDepths`, s hloubkou, pánem, podmínkami, neplněním, hladem a štítem), `status` (hlad a
štít přímých pánů a vazalů) a `own.hunger` / `own.shield`. Hlad = nejhorší `VillageDigest.hunger`
aktivních vsí rodu, štít = muži rodu od 16 let z veřejného rodokmenu (`serviceMen`; raněné a muže ve
službě odečte F6). Výhled pro formulář: `houseSpareOutlook` (`application/house-spare.ts`) – počítá
se **jen na vyžádání** (server action `houseSpare`), načítá stavy vsí rodu, odečítá dávky jiným
pánům. Akce serveru: `houseSpare`, `renounceVassalage` (`apps/web/app/game/actions.ts`,
`lib/house.ts`, vstupy `lib/house-input.ts`).

Rozhraní podmínek (ikony, formulář s výhledem, Nové podmínky, Vypovědět): [web-ui.md](web-ui.md) – „Podmínky vazalství v panelu“.

## Roční Odvody (`application/annual-levies.ts`, `dialogs.ts`, `domain/vassalage/levy.ts`, úloha 4.4)

Pravidla: [vassalage.md](../design/vassalage.md) – „Roční dialog 1. 11.“.

- **Dialogy** (`dialog`, migrace `0024_dialog`): `key` jedinečný (`levy:<vazalství>:<rok>`), `ref_id` = vazalství,
  `year` (rok 1. 11., při čekání se posune), `years` (za kolik let), `status` `open` / `answered` / `dropped`.
  Port `DialogRepository` (`openOnce`, `openFor`, `bumpYears(key, toYear)`, `listOpen`, `byId`, `answer(id, expected)`,
  `dropFor(refId)`), adaptér `db/adapters/dialog-repository.ts`, in-memory `__tests__/in-memory-dialogs.ts`.
  Odchylky od plánu: sloupec `ref_id`, `bumpYears` bere cílový rok (podmíněně, opakování nic nepřičte).
- **Otevření:** `openAnnualDialogs(deps, { today })` v `runWorldTasks` (`deps.levies` ve workeru, 1× za minutu). Rok =
  poslední 1. 11. do dne `today` (doběhne po výpadku); vazalství s `tribute` a `sinceDay` před tím 1. 11. Čekající dialog
  z minulého roku → `bumpYears` + `addBreach(id, 'levy', 1. 11. zmeškaného roku)` za každý zmeškaný rok, nový nevzniká.
  Vazal dostane upozornění `levy-pending`.
- **Odpověď:** `answerLevy(deps, { playerId, dialogId, lines, split, message, today })`. `split` = svazek po vsích rodu
  (cizí a spravované vsi se odmítnou – `settlements.listActive(hráč)`), `lines` = totéž po řádcích (`LEVY_GOODS`) a musí
  sedět se součtem. Po vsích zvlášť: `prepareVillage` (dopočet do dneška) → `sendShipment` s `refId`
  `levy:<dialog>:<ves>` (zámky po sobě; opakování po pádu nic nezdvojí). Až potom `dialogs.answer(id, 'open')` – vítěz
  zapíše kroniku obou rodů (`ChronicleEvent` `levy`: „Ctibor odvedl pánu Bořivoj: 100 z 150 kg obilí.“), upozornění
  pánovi `levy-sent` (`vassalName`, `parts`, `arrivesDay`, `years`, `message?`; bez id účtů) a méně než domluveno =
  `addBreach`. Domluveno = roční dávka × `years`. Posílat víc smí. Cíl = `terms.targetVillageId`, jinak sídelní ves pána.
- **Vypovězení:** `renounceVassalage` volá `deps.dialogs?.dropFor(vazalství)` – dialog zmizí. (Háček `onVassalageEnded` je
  globální registr, ale `gameDeps()` vzniká na každý požadavek, proto se čistí přímo v use-casu.)
- **Data pro rozhraní:** server action `levyDialogs()` → `{ dialogs: LevyDialogView[] }` (`dialogId`, `vassalageId`,
  `lordHouseId`, `lordName`, `years`, `agreed: MacroBundle`, `villages: { villageId, name, suggested: MacroBundle,
corveeHands }[]`);
  předvyplnění `suggestSplit` podle přebytku (menší z přebytku a dopravy, `houseSpare`), počítá se jen na vyžádání.
  `answerLevy({ dialogId, lines: [{ good, amount }], split: { <villageId>: MacroBundle }, message? })` →
  `{ ok: true, arrivesDay } | { error }`. Kód: `apps/web/lib/levies.ts`, vstup `lib/house-input.ts`
  (`parseAnswerLevyInput`), texty `lib/levy-labels.ts`, `lib/player-notices.ts`.
- **Rozhraní:** dialog `hud/LevyDialog.tsx`, popis v [web-ui.md](web-ui.md) – Dialog Odvody. `housePanel` nese u každé
  dohody `PanelAgreement.levyYears` (otevřený dialog Odvody k vazalství – `dialogs.openFor(vazalství, 'levy')`; null =
  nečeká), z toho přesýpací hodiny u vazala v panelu pána a pečeť v liště.

## Lidé a robota (`domain/vassalage/guests.ts`, `application/shipments.ts` – `sendCorvee`, úloha 4.5)

Pravidla: vassalage.md – Lidé a robota; nepřítomní a hosté v simulaci: [village-core.md](village-core.md)
– Nepřítomní a hosté. **Lidé** (rodiny, muži, ženy) jdou natrvalo zásilkou (`dispatchShipment` –
`emigrantGroups`, muži rodu ne), **robota** (`laborDays`) dočasně – lidé zůstávají ve stavu domovské vsi.

- **Koho ves pošle** – `corveeWorkers(state, day)`: dospělí od `VASSALAGE.corvee.fromAge` (16), kteří
  dnes pracují (ne zranění, ne už pryč), mimo dvorec vojvody, ne muži rodu ani jejich ženy. Po kolech –
  v kole nejvýš jeden z domu, napřed domy s nejvíc pracujícími dospělými, v domě svobodní, pak nejmladší;
  dům si nechá aspoň jednoho pracujícího dospělého (návrh Clauda).
- **Kolik lidí a dní** – `corveeStints(laborDays, hands)`: tolik lidí, aby nikdo nepracoval víc než
  `maxStintDays` (30), dny rovným dílem, zbytek po dni prvním; součet přesně `laborDays`. Ves, která
  tolik lidí nemá, je pošle déle, nejvýš `maxDaysPerPerson` (365) – jinak `CORVEE_NO_HANDS`.
- **Odeslání** – `dispatchCorvee(state, day, { laborDays, travelDays, homeVillageId, hostVillageId,
hostName, refId })` (vstupní stav nemění): `sendAway` s `away = { kind: 'labor', untilDay: day +
2 × cesta + d, hostVillageId, refId }`, hosté `untilDay = day + cesta + d` – **cesta se do dní
  nepočítá**; kronika `people-away`. `corveeGuests(state, input)` pozná už odeslanou robotu podle `refId`.
- **Use-case** `sendCorvee(shipmentDeps, { fromVillageId, toVillageId, laborDays, refId, today })` pod
  zámkem držitele odesílatele: cesta = `shipmentDays(vzdálenost).arrive` (jako zásilka), uloží ves
  (verzovaně, 5 pokusů) a zapíše `guests-arrive` do schránky pána v den příchodu (`ref` =
  `guests:<refId>`). Opakování (pád mezi uložením a zápisem, dvojklik) lidi znovu nepošle, jen dopíše
  událost. Bez řádku v `shipment` – když cíl zanikne, lidé se vrátí sami v den `untilDay`.
- **Odvody** – `answerLevy` pošle u každé vsi zboží a lidi zásilkou (svazek bez `laborDays`; prázdný
  se neposílá) a robotu `sendCorvee` s `refId` `levy:<dialog>:<ves>:corvee`; `arrivesDay` = nejpozdější
  příchod. `LevyDialogView.villages[].corveeHands` = kolik lidí může ves poslat (`corveeWorkers` v den
  `lastDay`; u splátek 0) – dialog u řádku Robota ukáže u každé vsi „lidé × nejvýš dní“
  (`corveeStints`), ves bez lidí varuje v popisku.

## Pomoc a půjčky (`domain/vassalage/loan.ts`, `application/loans.ts`, `negotiate.ts`, `annual-levies.ts`, úloha 4.6)

Pravidla: [vassalage.md – Pomoc na žádost](../design/vassalage.md). Vazal musí o pomoc požádat; pán dá dar, nabídne půjčku se
splátkami, nebo odmítne. Půjčka je samostatná dohoda – trvá i po vypovězení vazalství.

- **Řádky jednání** (`AidLine` v `loan.ts`, součást `TermItem`): `aid-request { bundle, villageId }` (vazal, kam),
  `gift { bundle, fromVillageId, toVillageId? }`, `loan { …, schedule: LoanInstallment[] }` (`{ year, goods: MacroGoods }`).
  `toVillageId` je **odchylka od plánu** (volitelné; bez něj ves hlavy rodu příjemce). Jednání o pomoci nemíchá jiné řádky
  (`termLinesOf` aid řádky vynechává – přijetí **nesahá** na podmínky vazalství, `updateTerms` se neruší). První kolo je
  vždy žádost vazala; žádost samu přijmout nejde (`NEGOTIATION_EFFECTS['aid-request'].check`), pán odpovídá protinávrhem
  (dar / půjčka), vazal půjčku přijme / odmítne / dá protinávrh (jiný kalendář). Dohoda mezi rody musí trvat při každém kole
  (`checkAidRound` v `negotiate.ts`: vsi z řádků patří těm, kdo je uvádějí).
- **Hodnota** (`installmentValue`): kg obilí z `TRADE_GOOD_VALUES`; seno `VASSALAGE.loan.hayValueKg` = 0,25, kůň
  `horseValueKg` = cena klisny (návrh Clauda). `dueValue(schedule, rok)` je kumulativní dluh splatný do roku, `overdueDebt`
  zbývá po zaplacení, `remainingDebt` celkově.
- **Přijetí:** v transakci jednání se jen zapíše půjčka (`tx.loans.create`, jedinečné `negotiation_id` → jedna půjčka při
  souběhu). **Po transakci** `sendAid` pošle `sendShipment` z `fromVillageId` (pod zámkem držitele té vsi; `refId` =
  `aid:<jednání>` → jediná zásilka; doveze, kdo posílá). Nepodaří-li se zásilka, půjčka se zruší
  (`cancelOfNegotiation`) a přijetí vrátí důvod. Kronika: `negotiation` kroky `aid-gift` / `aid-loan`. Bez `NegotiateDeps.aid`
  dar ani půjčku přijmout nejde (web ho dodává `aidDeps()` v `lib/levies.ts`).
- **DB:** `schema/loan.ts` (`loan`: věřitel a dlužník – rody, ves věřitele a dlužníka, `principal`, `schedule`, `paid_kg`,
  `breaches`, `status`), migrace `0025_loan.sql`, adaptér `loan-repository.ts` (`pay` přičítá v jednom UPDATE a při dosažení
  celku splatí), `GameDeps.loans`.
- **Splátky v Odvodech:** `openAnnualDialogs` (s `deps.loans`) 1. 11. otevře dlužníkovi dialog `repay` (klíč
  `repay:<půjčka>:<rok>`, `refId` = id půjčky; jen půjčka starší než 1. 11., s dluhem po splatnosti); čekající dialog naroste
  a každý zmeškaný rok zapíše neplnění (`repayBreach`). `levyDialogs` vrací `LevyDialogView.kind = 'repay'` (`owedKg`,
  `loanId`), `answerLevy` odpověď předá `answerRepay`: zásilky do vsi věřitele (`purpose: 'repay'`), zaplacená hodnota
  `installmentValue(odesláno)` → `loans.pay` (jiné zboží platí podle hodnoty), míň než dluh = `repayBreach`
  (`loans.addBreach` + `addBreach(id, 'repay', den)` u vazalství, **jen pokud mezi rody trvá**). Upozornění pánu = `levy-sent`
  s `loan: true` (kronika splátky se nepíše – odchylka). Vstup hráče do dialogu je upozornění `levy-pending` (`loan: true`).
- **Vymření dlužníka** (háček pro 4.10): `onHouseEnded(deps, houseId, at)` v `loan-house-ended.ts` – rod **bez pána** →
  jeho živé půjčky se zruší a dialogy splátek zmizí; rod s pánem dluh nechává (řeší nástupnictví a odúmrť v 4.10).
- **Testy:** `domain/vassalage/__tests__/loan.test.ts`, `application/__tests__/aid-loans.test.ts` (in-memory
  `in-memory-loans.ts`), db `loan-repository.db.test.ts` (souběžné přijetí → jedna půjčka), e2e `multiplayer.spec.ts`.

## Obchod mezi hráči (`domain/negotiation/trade.ts`, `negotiate.ts`, `annual-levies.ts`, úloha 4.7)

Pravidla: [vassalage.md – Hospodářství mezi hráči](../design/vassalage.md). Obchod je samostatné jednání mezi dvěma rody
(vazalství nevyžaduje), kolo za kolem jako ostatní; po přijetí si každá strana pošle svoje, nic se nevynucuje.

- **Řádek** `TradeLine` v `types.ts` (součást `TermItem`): `trade { give, get, fromVillage }`; `give` posílá autor kola,
  `get` druhá strana, `fromVillage` = rod → jeho ves odeslání (bez záznamu ves hlavy rodu; počítá se i jako cíl příjemce).
  `checkTradeLine` / `checkTradeItems` (`trade.ts`): jen makrokomodity (obilí, seno, dobytek, koně, klády – lidé a robota
  ne, `checkAidBundle`), obě strany neprázdné, jediný řádek v kole. Mikrokomoditu (hrnce, železo…) odmítá už parser
  `parseTermItems` (neznámý klíč ve svazku). `termLinesOf` obchod vynechává.
- **`negotiate.ts`:** `openNegotiation` / `counterNegotiation` obchod nepodmiňují dohodou ani přísahou; `checkTradeRound`
  hlídá, že ves z `fromVillage` patří uvedenému rodu, a protinávrh nesmí změnit druh jednání (obchod × ostatní).
  `acceptNegotiation` otevře **dva dialogy `trade-send`** (`openTradeDialogs`, klíč `trade:<jednání>:<rod>`, tělo
  `{ fromHouseId, toHouseId, toVillageId, goods }`; potřebuje `deps.dialogs`, po transakci) a oběma pošle upozornění
  `levy-pending` s `trade: true` (v transakci). Kronika: krok `trade-accepted`.
- **Odeslání:** `answerLevy` rozpozná `trade-send` (`answerTrade`): zásilka z každé vsi rodu `purpose: 'trade'`, klíč
  `trade:<dialog>:<ves>` (doveze ten, kdo posílá); celé, míň, nebo nic; lidé a robota odmítnuti. Druhé straně jde upozornění
  `levy-sent` s `trade: true`, `parts` (odeslané řádky), `arrivesDay` a `short` (poslal míň, než bylo domluveno). Neposlaná
  část se nevymáhá ani nezapisuje jako neplnění. `levyDialogs` dává pohled `kind: 'trade-send'` (`agreed` = co poslat,
  `lordName` = druhá strana).
- **Testy:** `application/__tests__/player-trade.test.ts` (dialogy, celé / míň / nic, bilance, makrokomodity, protinávrh),
  `apps/web/lib/__tests__/house-input.test.ts`, e2e `multiplayer.spec.ts` – „obchod mezi hráči“.

## Správa cizí vsi a tři role (`application/stewardships.ts`, `rights.ts`, úloha 4.8)

Pravidla: [vassalage.md](../design/vassalage.md) – Správce a tři role ve vsi, Hráč jako správce cizí vsi.

- **Tabulka `stewardship`** (migrace `0026_stewardship`): `village_id`, `steward_house_id`, `holder_house_id`,
  `kind` (`player` / `npc` – NPC až úloha 4.9), `vassalage_id` (dohoda, na které správa stojí), `ended_at`,
  `end_reason`. Jedinečný částečný index `WHERE ended_at IS NULL` = nejvýš jedna živá správa na ves (souběh
  dvou přijetí: druhé `start` vrátí `null`). Port `StewardshipRepository` (`of`, `start`, `listByStewardHouse`,
  `listByHolderHouse`, `end`, `endByVassalage`), adaptér `db/adapters/stewardship-repository.ts`.
- **Nabídka jednáním:** řádek `TermItem` `{ kind: 'stewardship', villageId }` (`domain/negotiation/stewardship.ts`),
  smí být s přísahou (nový vazal) i bez ní (stávající dohoda) a s řádky podmínek (odměna). `negotiate.ts`
  (`checkStewardRound`): jediný řádek, ves patří pánovi (`ownsVillage`), vazal je živý hráč, ves nemá správce.
  Účinek v registru `NEGOTIATION_EFFECTS.stewardship` zavolá `tx.stewardships.start` po přísaze (řádky se
  aplikují se správou naposledy), navázané na živou dohodu; souběh = `StewardshipTaken` → přijetí se vrátí.
  Řádek správy sám stávající podmínky dohody nemění (`updateTerms` se přeskočí, když nejsou řádky podmínek).
- **Držitel** vsi = `settlement.owner_id` (`holderOf(deps, villageId)`). **Odvolání:** `dismissSteward(deps,
{ playerId, villageId })` smí jen držitel, kdykoli; vazalství trvá. Vypovězení vazalství správu ukončí:
  `renounceVassalage` volá `stewardships.endByVassalage` (přímo, ne přes registr `onVassalageEnded` – ten
  nemá kde se při startu naplnit).
- **Práva správce** (`rights.ts`): `STEWARD_RIGHTS` = `build`, `veto`, `steward`, `trade` – ne `evacuate`,
  `sendSons`, `ennoble`, `war`, `nameSons`, `dismissSteward`. `RightsDeps.stewardships` → `villageAccess`
  najde správu (`stewardAccess`), jinak `null` = `NOT_PLAYER_VILLAGE` (odvolaný správce se o vsi nedozví nic,
  chyba je táž jako u cizí vsi). `villageRights({ stewarding })` vrací `STEWARD_ONLY` jako důvod.
- **Zámek:** akce ve vsi jede pod zámkem **držitele**, ne jednajícího – `lockOwnerOf(deps, { playerId,
villageId })` (vlastní ves → hráč sám, spravovaná cizí → `settlement.owner_id`, jinak hráč sám a práva
  akci odmítnou). Web: `apps/web/lib/game.ts` `lockOwnerOf`, `lib/village.ts` `guardedAction` zjistí držitele,
  vezme **jeden** zámek (`exclusivePlayer(…, holderId)`) a uvnitř `context()` čte právo jednajícího
  (`requireVillageRight(actorId, …)`) a den držitele. `Context.playerId` = držitel (za něj běží use-casy,
  dopočet i `dynastyOfPlayerLocked`), `Context.actorId` = jednající. Odvolání (`dismissStewardForPlayer`) bere
  zámek držitele, takže akce správce buď doběhne před ním, nebo ji po něm kontrola práv odmítne. Worker
  dopočítává ves dál podle vlastníka sídla (u držitele).
- **Pohled správce** (`viewOf`): dopočet a ves jsou držitelovy, ale přepínač (`switcherItems`) je správcův –
  jeho vlastní vsi + spravované cizí (`stewardedVillagesOf`, položka `stewarded: true`); `gameOver`, `ownMaps`,
  `mapsBlocked` a otisk se pro správce nesestavují (nic o ostatních vsích držitele). `gameEntryForPlayer`
  přijme jako zapamatovanou ves i spravovanou cizí.
- **Panel:** `HousePanelData.stewardships` (ves + správce, jen pro držitele) → řádek „Správci vsí“ s tlačítkem
  Odvolat (`dismissSteward` server action).
- **Testy:** `application/__tests__/stewardships.test.ts` (práva, odvolání, zámek, nabídka jednáním, souběh,
  vypovězení), `db/adapters/__tests__/stewardship-repository.db.test.ts` (souběh `start`), e2e
  `multiplayer.spec.ts` „správa cizí vsi“.

## Povýšení vesničana a NPC rod (vassalage.md – Povýšení vesničana; úloha 4.9)

- **Kdo smí:** právo `ennoble` (akce `ennobleVillager` v `ACTION_RIGHTS`) – **držitel ve vlastní vsi**, odkud
  muž jde; senior v cizí vsi rodu ani správce cizí vsi ne (`STEWARD_RIGHTS`, `SENIOR_RIGHTS` ho nemají).
- **Pravidlo muže:** `checkEnnoble(state, personId, day)` / `ennobleBlock(person, day)`
  (`domain/vassalage/ennoble.ts`) – muž od `VASSALAGE.ennoble.fromAge` (16) let, ne muž rodu vojvody
  (`line`), ne už povýšený (`Person.noble`). Scéna dostává `ScenePerson.ennobleable` → v panelu muže klíč
  (`village-key.svg`, `selection-person-ennoble`) pro každou ves hráče bez vojvody (`VillageListItem.awaitingLord`,
  z `VillageDigest.awaitingLord` – verze souhrnu 3).
- **Use-case** `ennobleVillager(deps, { playerId, fromVillageId, personId, targetVillageId, today, at })`
  (`application/ennoble.ts`, pod zámkem hráče): cíl = vlastní ves s `awaitingLord` bez vyslance a bez správce;
  **nejvýš 1 za herní rok rodu** (`ennobleYear = floor(den / 365,25)`, sloupec `house.last_ennoble_year`,
  podmíněný `HouseRepository.claimEnnoble` – migrace `0027_ennoble.sql`). Pořadí: ověření → zápis roku →
  `awaitingLord.appointee` v cílové vsi (appointLords další vojvodu nepošle) → NPC rod (`kind: 'npc'`,
  `playerId` null) + vazalství `origin: 'ennoble'` s holou přísahou + správa `kind: 'npc'` (`vassalageId`) →
  muž s rodinou (`departAppointee`) odejde ze své vsi a družina putuje schránkou cílové vsi
  (`noble-arrives`, `ref ennoble:<ves>:<sinceDay>`, příjezd za `APPOINT_LORD.daysPerMapStep` × vzdálenost).
- **Příjezd** (`settleNoble` v `applyEvent`): `settleAppointee` (nová místní id, dvorec, jídlo, muž je vojvodou vsi)
  - `Person.noble = { houseId }` všem z družiny, `line` muži a jeho synům (cvičí jako synové vojvody –
    `trainingFamily`) + `VillageState.nobles = { houseId, headId }`. Ves s `nobles` nedává rodu hráče muže
    (`appointCandidate`, `dynastySenior`) a nepatří do `publicLineMen`; `settleAppointee` hráčova vojvody `nobles` maže.
- **NPC rod** nevede jednání: `setNpcTerms(deps, { playerId, vassalageId, terms })` mění podmínky přímo
  (`updateTerms`, NPC vždy přijme a plní přesně); roční Odvody NPC přeskočí (`playerId === null`), takže nic
  nevypovídá ani neposílá míň. `dismissSteward` ukončí jen správu – vazalství trvá (NPC rod je vazal bez vsi).
  `onNpcHouseEnded(deps, houseId, at)` (háček po vzoru `onHouseEnded`) vrátí správy držiteli a ukončí dohodu.
- **Testy:** `domain/vassalage/__tests__/ennoble.test.ts` (pravidlo, příjezd po 1 / 3 / 10 dnech = vcelku, výcvik
  synů), `application/__tests__/ennoble.test.ts` (rok, NPC termíny, odvolání, vymření), db `claimEnnoble`, e2e
  `multiplayer.spec.ts` „povýšení vesničana“.

## Vymření rodu a odúmrť (`application/escheat.ts`, `domain/vassalage/escheat.ts`, úloha 4.10)

Pravidla: [vassalage.md](../design/vassalage.md) – Vymření rodu – odúmrť.

- **`endHouse(deps, { houseId, day, now })`** – jediné místo konce rodu (hráčova i NPC). Volá ho
  `closeDynastyDay` při konci hry (web i worker, pod zámkem hráče), `restartGame` (i s `abandon`) a pro NPC
  rody `endExtinctNobles` (ves s `nobles`, kde NPC rod nemá muže po meči – `extinctNobleHouse`). Závislosti
  přicházejí v `DynastyDeps.ending` (`createGameDeps`); bez nich se rod ukončí jako dřív.
- **Rozběhnuté věci** (review bod 3): otevřená jednání → `ended` (`endNegotiationsOf`), všechny otevřené
  dialogy hráče zmizí (`DialogRepository.dropOpenOf`), správy cizích vsí, které rod spravoval, skončí;
  zásilka na cestě je ve schránce cílové vsi a dojde sama (ves drží kdokoli).
- **Bez pána:** vazalství rodu jako pána skončí (`dropFor` jejich dialogů), dluhy zaniknou (`onHouseEnded`),
  vsi zaniknou jako dřív (`abandonForLineEnd` v `closeDynastyDay`).
- **NPC rod:** `onNpcHouseEnded` (správa a dohoda s pánem skončí), ves `endNobleHouse` – `nobles` zmizí,
  ženy a dcery povýšeného bez `noble` a `line`.
- **S pánem:** `closeDynastyDay` vsi **nezanechá** (`abandonForLineEnd` se přeskočí), `endHouse` založí
  `Escheat` (tabulka `escheat`, migrace `0028_escheat.sql`, jedna na rod – `dead_house_id` jedinečný):
  páni od nejstarší dohody, živé vsi, vazalové. Každá živá ves projde `escheatVillage` (ženy bez `line`,
  správce zapnutý, `dynasty.lordId` null – vojvodu dosadí `withAwaitingLord` z rodu nového držitele),
  správy hráčů ve vsích vymřelého skončí, každý pán dostane dialog `escheat` (`escheat:<id>:<pán>`).
  `houses.end` je poslední krok – pád uprostřed příští konec rodu zopakuje (vše idempotentní).
- **Převod držitele – postupně, nikdy dva zámky naráz:** sloupec `settlement.pending_owner_id`.
  1. krok pod zámkem **starého** držitele: `SettlementRepository.transferHolder(sídlo, starý, nový)` –
     podmíněný UPDATE (drží starý, nic nečeká), sídlo přestane být sídelní; `listActive` čekající sídlo
     nevrací nikomu, fronta workeru (`world-queue.ts`) ho počítá u nového (`coalesce(pending, owner)`).
  2. krok pod zámkem **nového**: `acceptTransfers(nový)` – na začátku `advancePlayer` (worker, `tryRun`)
     a `advanceDynasty` (web); idempotentní.
     Pád mezi kroky: sídlo čeká, nikdo ho nepočítá, nejbližší dopočet nového držitele ho převezme. Verze vsi
     se převodem nemění – rozběhnutý dopočet vsi uloží (db test `escheat-repository.db.test.ts`).
- **Rozhodnutí:** `escheatDialogs` (pohled `EscheatView`), `proposeEscheat` (díly `EscheatPart` po celých
  vsích a vazalech, `checkEscheatPlan` – vsi jedné mapy spolu, odúmrť s jednou vsí vcelku, příjemce pán nebo
  jeho vazal), `consentEscheat` (souhlas ve verzi návrhu). S jedním pánem platí hned, jinak po souhlasu
  všech (`escheat.version` – podmíněný zápis, `decided` jednou). `applyEscheat`: vazalové přejdou od
  vymřelého na pána dílu (`moveVassal` – nová dohoda `origin: 'escheat'` se stejnými podmínkami,
  `LoanRepository.moveCredits`, stará skončí), vsi od technického držitele k pánovi dílu
  (`transferVillages` – `locks.run(starý)` pak `locks.run(nový)`), věnovaný díl = jednání s řádkem
  `village-gift` (`VillageGiftLine`, `checkVillageGiftItems`, účinek v `NEGOTIATION_EFFECTS` nic nezapisuje).
  Přijetí → `NegotiateDeps.escheatGift` (`giveEscheatPart` po transakci, bez zámku volajícího);
  odmítnutí → díl zůstane pánovi.
- **Web:** `lib/escheats.ts` (composition root), akce `escheatDialogs` / `proposeEscheat` /
  `consentEscheat` (`lib/escheat-input.ts`), `components/game/hud/EscheatDialog.tsx` – ukáže se s panelem
  rodu, jen když hráč o odúmrti rozhoduje; u vsi a vazala volba příjemce (věnování se šipkou), pečeť =
  navrhnout / rozhodnout, přísaha = souhlasit. Řádek `village-gift` v jednání: `TermsForm` (`VillageGiftRow`).
- **Známé meze:** hráč, jehož vsi přešly odúmrtí, při návratu rovnou začíná znovu (obrazovka konce rodu se
  ukáže jen v pohledu, kde rod skončil). Správa NPC ve vsi odúmrti drží `holder_house_id` vymřelého (ves
  řídí dál NPC, zámek je u držitele mapy).

## Spory a rozsudek pána (`application/judgment.ts`, `disputes.ts`, úloha 6.16)

Pravidla: vassalage.md – Mír a spory (Martin 2. 11. 2026: „Vyřeší se tím de iure stránka sporu, de facto
se bude řešit až následně“). Rozsudek nic nevynucuje, nesplnění se jen zapíše.

- **Port a tabulka:** `DisputeRepository` (`file`, `byId`, `answer`, `judge`, `listOf`, `peaceBetween`,
  `markBroken`), tabulka `dispute` (migrace `0033_dispute`). **Jediný nerozsouzený spor na dvojici rodů**
  (v obou směrech) hlídá jedinečný částečný index `dispute_running_uq` na seřazené dvojici (`pair_key`) –
  `file` vrátí `null`. `answer` a `judge` jsou podmíněné zápisy (z více souběžných uspěje jedno).
- **`fileComplaint(deps, { playerId, against, message, today })`:** žalovat smí jen rod, který má
  s obžalovaným **společného pána** (`commonLord` z živých vazalství); pán dostane `complaint-filed`.
  **`answerComplaint`** – jen obžalovaný, jednou (`complaint-answered` pánovi).
- **`judgeDispute(deps, { playerId, disputeId, verdict, today })`:** soudí jen pán sporu, oba rody musí být
  stále jeho vazalé, bez vyjádření až po `VASSALAGE.verdictAfterMs` (1 skutečný den, `canJudgeNow`).
  `Verdict`: `compensation` (zboží bez lidí – `checkAidBundle`), `return-people`, `peace`, `dismiss`.
  Obě strany dostanou `judgment-given` (`asDefendant`).
- **Splnění:** náhrada a vrácení lidí otevřou obžalovanému dialog `judgment` (`openOnce` s klíčem
  `judgment:<spor>`, `refId` = vazalství obžalovaného s pánem, takže s jeho koncem dialog zmizí). Odpověď
  jde stejným `answerLevy` / `answerTrade` jako obchod (celé, míň, nic → `sendShipment` z vsí rodu do
  hlavní vsi žalobce; lidé smí). **Míň než uloženo = `addBreach(vazalství, 'judgment', den)`** a zápis do
  kronik obžalovaného a pána `disobeyed` („Ctibor neposlechl pána“, `types-chronicle.ts`). Upozornění
  příjemci je `levy-sent` s `judgment: true`.
- **Mír:** `peaceUntilDay` = den rozsudku + `VASSALAGE.judgmentPeaceYears` (5 let, návrh Clauda). Válku
  nezakáže: `declareWar` a `startWarByAttack` při **vzniku** války (ne při dalších střetech) zavolají
  `noteBrokenPeace` (jsou-li v `WarDeps` volitelné `disputes` a `vassalages`; `createGameDeps` je dává web
  i worker, tažení musí `disputes` předat samo): platí-li mezi rody rozsudek „mír“, agresorovi se zapíše
  `addBreach(…, 'judgment')` a `disobeyed`, jednou na rozsudek a rod (`markBroken`).
- **Panel:** `housePanel` dává `disputes` (`PanelDispute`: role, rody, text, vyjádření, `canJudge`,
  `canAnswer`) a `fellows` (spoluvazalé pro tlačítko Žaloba), jen při `HousePanelDeps.disputes`. Web:
  server actions `fileComplaintAction` / `answerComplaintAction` / `judgeDisputeAction`
  (`lib/house.ts`, `lib/house-input.ts`), `HousePanel` – řádek Spory (váhy), u vazala v dohodě tlačítko
  Rozsudek, `DisputeCard.tsx` (vyjádření, rozsudek), dialog rozsudku v `LevyDialog` (váhy).

## Jídlo domény – ves (`domain/vassalage/domain-food.ts`, hradiště – úloha 3)

Čisté funkce, vstupní stav nemění (hillfort.md – Jídlo domény). Rozdělení mezi vsi je v dalším
kroku (`domain-allocation.ts`), rozhodnutí a doprava v kroku světa.

- `domainFoodReadyYear(state, day)` – rok, když je ves po výmlatu letošní sklizně: plán u výmlatu
  (`threshingSeason`, od konce žní do 1. 10.) a snopů nejvýš `DOMAIN_FOOD.sheavesDoneKg`, nebo den
  od `DOMAIN_FOOD.readyBy` (1. 10.) do konce roku; jinak null.
- `lastSowingSeedKg` – osivo obilí minulého osevu (součet `seedKg` plodin setých z obilí v plánu
  u výmlatu); po 1. 10. osev, který ves zvládne (jako `grainSpareKg` ve `spare.ts`).
- `domainOffer` – obilí `⌊zásoby + snopy − VASSALAGE.reserveYears × (yearlyFieldNeed + osivo)⌋`
  (osivo, jídlo do žní a doplnění pojistky dohromady = pojistka vazalství, návrh Clauda k otázce 1
  plánu) a dobytek `cattleSpare` (nad chovné jádro; export ze `spare.ts`). Ves v hladu nic.
  Pravidlo „napřed obilí, dobytek jen na to, co obilí nepokryje“ (otázka 2) patří do rozdělení.
- `domainNeedKg` – `fieldSowingTargets(…).shortKg`, týž výhled jako správce v nouzi; ves bez lidí 0.
  Mezi vsemi se bere jen potřeba od `DOMAIN_FOOD.minNeedKg` (rozdělení).
- `cattleFoodKg` – kus dobytka = `meatEnergy(LIVESTOCK.meatKg.cow)` kg obilí (72).
- `villageFoodBalance` – `{ growsKg, needsKg }` pro panel rodu: průměrná čistá sklizeň
  (`fieldCapacity`) proti potřebě z pole a obilí koní a psů dvorce; bez `stewardOutlook`, volá se
  při každém uložení vsi. Ves bez lidí nebo bez pole null.
- Čísla: `DOMAIN_FOOD` v `rules-vassalage.ts`.

## Jídlo domény – rozdělení (`domain/vassalage/domain-allocation.ts`, hradiště – úloha 4)

`allocateDomainFood(offer, recipients, headKg)` – čistá funkce (Martin 8. 11. 2026: „rovnoměrně“;
algoritmus návrh Clauda). `offer` je obilí a dobytek domény (součet `domainOffer` vsí),
`recipients` vsi s `needKg` (`domainNeedKg`, filtr `DOMAIN_FOOD.minNeedKg` dělá volající),
`headKg = cattleFoodKg` na kus.

- Příjemci s `needKg > 0` podle `villageId`; podíl `f = min(1, (obilí + kusy × headKg) ÷ Σ potřeb)`,
  cíl vsi `f × needKg` – každá dostane stejný podíl toho, co jí chybí.
- Napřed obilí úměrně cílům (celá kg dolů), pak dobytek po kusech v pořadí `CATTLE_GOODS`: kus
  jde vsi s největším nepokrytým zbytkem cíle (shoda → nižší id), jen je-li zbytek aspoň
  `headKg ÷ 2`; jinak zůstane doma.
- Výsledek: jen nenulové dodávky podle `toVillageId`, nezávislé na pořadí vstupu.
- Testy: `domain/vassalage/__tests__/domain-allocation.test.ts`.
