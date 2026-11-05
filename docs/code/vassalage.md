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
jednání v `NEGOTIATION`.

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
