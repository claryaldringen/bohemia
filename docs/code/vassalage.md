# Vazalství (`packages/game/src/domain/vassalage`)

Pravidla: [vassalage.md](../design/vassalage.md) – Dávky (Makrokomodity, Výhled), Doprava a cílová
ves, Lidé a robota, Čísla. Plán: `docs/superpowers/plans/2026-11-03-multiplayer-vassalage-war.md`
(Fáze 4). Čistá doména – žádná DB, web ani use-casy; strom pod rodem a zákaz vzájemného vazalství
jsou v `tree.ts` (viz `world.md`).

## Čísla (`rules-vassalage.ts`)

`VASSALAGE` – tabulka Čísla vassalage.md: roční dialog 1. 11., pojistka `reserveYears` 2, měsíc
dopravy listopad, `travelDaysPerCell` (= `WORLD.travelDaysPerCell`), služba a povýšení od 16 let,
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
