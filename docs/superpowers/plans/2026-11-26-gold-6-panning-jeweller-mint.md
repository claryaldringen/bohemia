# Zlato 6 – rýžovník, šperkař a mincovna – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ves se zlatonosným potokem rýžuje zlato, mění ho za mince 1:1 váhově s kýmkoli, kdo mince má, šperkař jí zlevní placení a zdraží prodej zlata o polovinu (s omezenou kapacitou) a od roku 950 si ves smí zlato razit ve vlastní mincovně (issue #13, plán 6 ze 6).

**Architecture:**

- **Zlato je zboží `gold` v gramech** (`VillageState.gold`) s pevnou cenou 1 mince za gram (mince váží gram). Do zápočtu, ceny dne ani cenové hladiny nevstupuje – mění se za mince v mincovní fázi: kupují ho cizí kupci, výpravy se zlatem v „Dostaneš“ a hostitel, který zlato přespolních vymění za své mince 1:1; hostitel jím kupcům doplatí i objednanou zbroj.
- **Tři nová řemesla** po vzoru dílen (`Craft`, `CRAFT_BASE`, `workCrafts`, `restingCrafters`, učení, nástupce): rýžovník (`panner`) rýžuje v teplých měsících na náplavech krajiny (`premiumSites(…, 'gold-placer')`), které se vyčerpají; šperkař (`jeweller`) zpracovává zlato a mince vsi do kapacity výhody `VillageState.jewelleryG`; mincíř (`minter`, tlačítko „Mincovna“, od roku 950) razí zlato vsi na mince.
- **Šperkař jen mění kurz v mincovní fázi** (`coinClearing`): prodané zlato s výhodou stojí 1,5 mince za gram, mince s výhodou platí za 1,5 – v obou případech ubývá kapacita, nad ní 1:1. Výprava si kapacitu veze s sebou a nepoužitou vrací. Mince ani zlato tím nevznikají ani nemizí.
- Web jen ukazuje a posílá záměry (stavba dílny je dnešní akce `placeWorkshop`). Žádná DB migrace, žádný převod stavu, žádná nová náhoda.

**Tech Stack:** TypeScript 6 (strict), `packages/game` (doména, use-casy, Vitest), `packages/db` (kodek, schránka), `apps/web` (Next.js 16, React 19, Babylon.js 9), Playwright, Blender a Pillow (ikony).

**Spec:**

- `docs/design/gold.md` – závazný (schváleno Martinem 22. 11. 2026 „Ano“): Proč (issue #13), Martinova rozhodnutí, Pravidla 1–5, Co se ověří, Nechává se na stavitele.
- `docs/design/markets.md` – Martinova rozhodnutí (Odkud mince, Co kupci kupují), Pravidla 4 a 6, Rozhodnutí plánů 4 a 5 (mince jako zboží, mincovní fáze, hladina, kupci, „Mince utrácí jen vojvoda/správce“, objednávka zbroje, odchod celé vsi „berou si úplně vše“).
- `docs/design/premium-landscapes.md` (Typy krajin – Zlatonosný potok, Kalibrace), `docs/design/landscape.md` (Zlatonosný potok – 3–6 náplavů), `docs/design/crafts.md` (Budovy, Práce a jídlo, Učení řemesla), `docs/design/research/2026-10-18-trade-values.md` (mince, Praha kolem 965).
- Kód plánů 4 a 5: `trade/market-coins.ts`, `trade/market.ts` (`coinPhase`, `merchantWants`, `priceTotals`, `departVisitors`), `trade/market-prices.ts`, `trade/merchants.ts`, `trade/arms-order.ts`, `trade/market-trip.ts`, `application/village-mail.ts`, `people/belongings.ts`, `crafts/crafts.ts`, `core/premium-effects.ts`.
- Mapa kódu: `docs/code/village-trade.md` (Mince a zbroj, Cizí kupci ve vsi, Pošta mezi vsemi), `docs/code/village-crafts.md` (Řemesla, Učení řemesla), `docs/code/landscape.md` (prémiové krajiny – Účinky typů „hned“), `docs/code/village-steward.md`, `docs/code/web-ui.md` (Katalog staveb, panel Trh).

## Global Constraints

- **Předpoklad:** plán 5 je sloučený ve `feat/landscape`. Musí platit (`grep -rnw <jméno> packages apps --include='*.ts' --include='*.tsx'`, bez `node_modules` a `.next`): `goldPlacerSites`, `premiumSites`, `premiumFeaturesOf`, `coinClearing`, `coinPhase`, `coinPriceOf`, `nextPrices`, `nextLevel`, `merchantsArrive`, `merchantWants`, `affordableWants`, `armsBuyer`, `reduceArmsOrder`, `marketStance`, `withoutCoins`, `villageGoodStock`, `addGood`, `CARRIED_STOCKS`, `waresView`, `strandedMail`, `carriesCoins`, `receiveStranded`, `departPlanned`, `joinMarket`, `marketResult`, `applyMarketResult`, `workCrafts`, `restingCrafters`, `workshopLabor`, `workshopSkill`, `craftHands`, `distanceFactor`, `villageRoadWalk`, `applyBuildIntent`, `startWorkshop`, `checkWorkshopPlacement`, `dwellingYearReason`, `buildOptions`, `CRAFT_MODEL`, `WORKSHOP_ICONS`, `TRADE_GOOD_NAMES`, `coinsOfWorld`, `coinsFor`, `STEWARD`, `VILLAGE_MIGRATIONS`. A nesmí existovat: `GOLD_GOOD`, `withoutMoney`, `jewelleryG`, `goldPanned`, `goldPlacers`, `workPanner`, `workJeweller`, `workMinter`, `jewelleryOf`, `goldOfWorld`, `PANNING`, `JEWELLER`, `MINT`, `STEWARD_CRAFTS`, `placer-exhausted`, `jeweller`, `minter`, `panner` (mimo `apps/web/lib/scene/ambient-sound.ts`, kde je to zvukový uzel). Jinak Úlohu 1a nezačínat a ozvat se. Práce běží ve větvi `feat/gold-6` z `feat/landscape`.
- **Mimo plán 6:** hlubinná ložiska a hornictví (premium-landscapes.md – „po 500 letech“), zlato v dávkách vazalů a v jednání (výkupné), kořist (zlato se neplení – jako mince, válka kov nebere), obnova náplavů povodní, vlastní modely dílen zlata ve scéně (Oznámit 7), stavba dílen zlata správcem (Rozhodnutí 10), kalibrace výhody typu krajiny (měření na víc vsích se nedělá).
- **Nic nevznikne ani nezmizí.** Zlato vzniká jen rýžováním, zaniká jen ražbou (stane se mincemi gram za minci) a odjezdem cizích kupců, kteří ho koupili nebo dostali za zbroj. Mince dál vznikají jen příjezdem kupce a ražbou a zanikají jen odjezdem kupce. Mezi vsemi jdou zlato i mince jen poštou (náklad a výsledek výpravy). Přijaté ztráty jsou jen ty z dřívějších plánů (zánik obou konců pošty). Kapacita šperkaře (`jewelleryG`) není zboží – je to počet gramů kovu, na který výhoda ještě platí; **použitelná kapacita (`jewelleryOf`) nikdy nepřeroste kov**, ke kterému patří, a uloženou ořízne na kov `addJewellery` (uložená smí kov přerůst jen po odjezdu výpravy s kovem – Úloha 7a).
- **Mince podle plánu 4** (Martin 25. 11. 2026: „Mince utrácí jen vojvoda/správce“): zboží za mince kupují jen výpravy hráče a správce a objednávka zbroje. Výměna zlata za mince 1:1 u hostitele není útrata (kov za kov, Martin 22. 11. 2026: „Zlato lze měnt za mince s kýmkoliv, kdo ty mince má“) a zbroj, kterou hostitel kupcům doplatí zlatem, je dnešní objednávka – Rozhodnutí 3, Oznámit 3.
- **Kusy a jednotky:** mince celé, zlato ve stavu v gramech i se zlomky (rýžování, ražba po celých gramech), na trhu, ve výpravách a v kronice celé gramy (`PIECE_GOODS`). Kapacita šperkaře v gramech se zlomky.
- **Žádná pravidla navíc:** nové hodnoty jsou jen v `rules/rules-gold.ts` (`GOLD`, `PANNING`, `JEWELLER`, `MINT`), `TRADE_GOOD_VALUES.gold`, `MERCHANTS.wants.gold` a `STEWARD.grainPayment`, každá s odkazem na sekci `gold.md` (Pravidla N nebo „Rozhodnutí plánu 6, bod N“ – oddíl dopíše Úloha 14) a na rešerši. `STEWARD_CRAFTS` (`rules-steward.ts`) není nové číslo – jen dnešní čtyři řemesla, se kterými správce počítá. Riziko požáru (`fire.ts`) se nemění. Nové technické meze nejsou.
- **Hexagon:** doména a use-casy bez infrastruktury (hlídá ESLint), web i worker volají stejné use-casy, **žádná herní logika ve webu** – ani zámek dílny (`workshopBlocked` z domény), ani cena zlata a výhoda šperkaře (`coinPriceOf`, `jewelleryOf` na serveru).
- **Determinismus:** bez `Math.random`, `Date.now()`, `new Date()`. Výběr náplavu je pevný (nejkratší konečná chůze, při shodě nižší index), nová náhoda nevzniká. Dopočet po kouscích i vcelku dá týž stav – i proto se ukládá jen konečná chůze (`Infinity` by JSON uložil jako `null`).
- **Stav vsi:** nové části jsou volitelné a chybí, dokud se nepoužijí (`VillageState.gold`, `jewelleryG`, `goldPanned`, `Workshop.placer`, `MarketArrival/MarketVisitor/MarketResult.jewelleryG`, `stranded-people.gold`). `VILLAGE_MIGRATIONS` se nemění, kodek ani DB migrace také ne (kodek je obecný JSON – ověří test kodeku v Úloze 1b).
- **Zlaté otisky se nesmí změnit:** ves bez zlatonosného potoka a bez dílen zlata simuluje bit po bitu jako dnes – **i se správcem** (plán správce ověřuje slot dílny jen pro `STEWARD_CRAFTS`, Úloha 3a) – a trh bez zlata a bez kapacity šperkaře jako po plánu 5. Měnit se smějí jen tyto testy: výčty zboží (`TRADE_GOODS`, `PIECE_GOODS`, `TRADE_GOOD_NAMES` – `market-clearing.test.ts`, `trade-names.test.ts`, `MarketPanel.test.tsx`), výčty řemesel a tlačítek staveb (`CRAFTS`, katalog staveb – testy `build-items`), testy, které porovnávají celé `market.stock` pohledu dvorce (`marketField` píše každé zboží i s nulou – přibude `gold: 0`), testy a e2e, které počítají řádky „Dáš“ / „Dostaneš“ (přibude zlato), testy, které porovnávají seznam kupců (`MERCHANTS.wants`) nebo zápis `merchants-arrived` složený z něj (`market-merchants.test.ts`, `market-merchants-slaves.test.ts`, věty kroniky plánů 4 a 5), a výčet `CARRIED_STOCKS`. Selže-li `*golden*.test.ts`, `steward-slow` nebo jiný test plánů 2–5, je to chyba úlohy.
- **Pasti plánů 3–5:**
  - stav po předchozích úlohách ověř `grep -rnw` dřív, než na něj navážeš, a testy tvrdí skutečné hodnoty (gramy, mince, den, index náplavu),
  - **`workCrafts` posílá každé řemeslo kromě kováře a uhlíře do větve hrnčíře (`else` → `workPotter`)** a `restingCrafters` zná jen vyjmenovaná řemesla – TypeScript to neukáže; nová řemesla potřebují vlastní větve (Úloha 3a je založí, test hlídá, že rýžovník nevyrábí keramiku); totéž ve webu – `workshopOutputKg` (jinak keramika), `workshopSmokes` (`producing` kouří) a `workshopDetails` (pokrytí nástroji, `CRAFT_LOOKS[craft].product`),
  - **plán správce ověřuje slot dílny pro každé řemeslo** (`slotFits` – `CRAFTS.every(checkWorkshopPlacement)`, `slotChecks` = `CRAFTS.length` z rozpočtu `STEWARD.checksPerStage`) – řemeslo navíc by změnilo plán každé vsi se správcem; správce proto bere `STEWARD_CRAFTS` (Úloha 3a),
  - **chůze přes potok bez brodu je `Infinity`** (`groundWalkLength`) – náplav se vybírá jen s konečnou chůzí (`Number.isFinite`, vzor `chooseDugSite`),
  - nic drahého při každém pohledu: `goldPlacers` vrátí pro krajinu bez typu `gold-stream` `[]` bez výpočtu a jinak jde přes mezipaměť `premiumFeaturesOf`; chůzi k náplavu (`villageRoadWalk`) počítá jen výběr náplavu a uloží ji (`Workshop.placer.walkM`),
  - smyčky přes `TRADE_GOODS` v zápočtu zlato nevidí (`withoutMoney`), ceny ho přeskočí (`nextPrices`), hladina také (`coinsAgainstGoods`); co výprava prodává v mincovní fázi (`coinPhaseStock`), zlato vidí (`withoutCoins`); chybějící `gold` je 0, nikdy `undefined` v součtu,
  - správce cizí vsi nevidí jména ostatních vsí držitele (`maskVillageNames`) – ani u zlata vráceného ze zaniklé vsi,
  - v kronice žádná „0“ (prázdné části věty se vynechají – i mince 0 u vráceného zlata).
- **Rozhraní jako v 0 A.D.:** ikony a čísla, slova jen v `Tooltip`, důvodech zašednutí a kronice. Zámky dílen jsou jako u lomu bez výchozu a domu před rokem 800 (zašedlé tlačítko s důvodem u kurzoru).
- **Kontroly na konci každé úlohy:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:docs` a `nice -n 19 npm run test`. Úlohy 1b, 3a, 3b, 4, 5, 6a, 6b, 7a, 7b a 8 (mění pravidla simulace vsi – zlatý otisk se správcem, `steward-slow`, `market-*-years`) a Úlohy 13a a 13b navíc `nice -n 19 npm run test:slow`; Úlohy 1b, 7b a 13a `npm run test:db`. Úloha 1a (jen rešerše, bez kódu) jen `npx prettier --check` svého souboru. E2e jen v Úlohách 12 a 14 – Úlohy 3a, 3b a 9–11 mění HUD (katalog staveb, panely) a scénu a e2e výslovně odkládají; sériově: `pgrep -f "[p]laywright test"` předtím nesmí nic vrátit.
- **`docs/code/`:** úloha, která přidá nebo přejmenuje jméno, opraví v téže úloze mapu kódu (jinak padne `check:docs`). Návrhy v `docs/design/` až v Úloze 14 (rešerši píše Úloha 1a, výsledky ověření do `gold.md` Úlohy 13a a 13b).
- **Jazyk a zápis:** česky komentáře i docs, krátká pomlčka „–“. Vlastní rozhodnutí jsou „návrh Clauda“, Martinova slova s datem. Commity Conventional Commits česky, `Refs #13`, na konci `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Agenti:** žádní subagenti, žádné `sleep` v popředí, `pkill`, `rm -rf`, `git stash` ani `git branch -D`. Neslučovat, nepushovat. Nejvýš ≈ 100 kroků na úlohu. DB `bohemia` jen ke čtení. Měření na víc vsích se nespouští – ověřuje se testem dvou vsí s kupci (Úloha 13a) a přepočtem Vlkova (Úloha 13b).

## Martinova rozhodnutí k plánu 6

Z `gold.md` a `markets.md` doslova; Pravidla 1–5 `gold.md` jsou návrh Clauda schválený s celým návrhem 22. 11. 2026 („Ano“):

1. **Proč (issue #13, 22. 11. 2026):** „Hráči, kteří budou mít na mapě zlatonosnou řeku nebo potok mohou začít rýžovat zlato - bude na to speciální řemeslník; Toto zlato buď půjde přímo vyměnit za mince 1:1 váhově nebo ho může použít jako surovinu klenotník; Klenotník jako surovinu může použít zlato nebo mince; Klenoty lze použít k placení místo mincí, proto pokud má hráč klenotníka, vše, co by platil mincemi má o 50% levnější“ – Rozhodnutí 1, 4 a 5.
2. **Zlato za mince:** „Zlato lze měnt za mince s kýmkoliv, kdo ty mince má. Jen od roku 950 bude možné použít zlato zároveň jako surovinu pro domácí mincovnu“ – Rozhodnutí 2, 3 a 7.
3. **Šperkař:** „Na obě strany stejně. Šperky však nebudou vedené jako samostatná komodita, šperkař bude prostš fungovat jen jako jakýsi zlevňovač při nákupu a zdražvač při prodeji zlata“; kupci šperky berou jako „zlato, ale o polovinu dráž“ (výklad Clauda v `gold.md`: násobek 1,5 v obou směrech) – Rozhodnutí 5.
4. **Šperkař mezi vsemi a kapacita:** „I mezi vesnicemi. Ještě jde o kapacitu - 1 šperkař nesmí při velkém množství zlata plošně zlevnit všechno - výroba šperku je dost náročná a dlouhp trvá“ – Rozhodnutí 5 a 6.
5. **Shrnutí** (rýžovník, zlato za mince 1:1, mincovna od 950, šperkař jako výhoda; řemeslníci s dílnou a učněm, rýžování v teplých měsících, omezená kapacita šperkaře): „Ano“ – Rozhodnutí 4, 5 a 7.
6. Z obchodu: „Cizí kupci nakupují zlato, šperky (tj. zlato, ale o polovinu dráž), med, vosk, kožešiny a otroky“ (22. 11. 2026), „Slované začali razit vlastní mince až kolem roku 950“ (22. 11. 2026), „Mince utrácí jen vojvoda/správce“ a „Pokud se lidéí někam stěhují, berou si úplně vše“ (25. 11. 2026), „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“ (22. 11. 2026 u lovu) – Rozhodnutí 2, 3, 8, 9 a 10.

## Co hra už zná (ověřeno `grep -rnw` 26. 11. 2026)

- **Zlatonosný potok:** typ `PremiumType 'gold-stream'` a prvky `PremiumSite` druhu `'gold-placer'` (`goldPlacerSites` v `landscape/premium/water.ts` – 3–6 náplavů na vnitřní straně oblouků, čočka 30 × 10 m, aspoň 200 m od vsi; pořadí je pevné). Ves je čte přes `premiumSites(landscape, kind)` (`core/premium-effects.ts` – krajina bez typu `[]`, vzor `premiumDugSpot`). Scéna náplav kreslí (`premium-sites-layout.ts`). Krajinu typu dá `generateAcceptedLandscape(seed, undefined, 'gold-stream')` – vrací `{ seed, landscape }`. Zlato zatím nikdo nerýžuje.
- **Mince** (plán 4): `VillageState.coins`, `COIN_GOOD`, 1 mince = 15 kg obilí (`MARKET.grainKgPerCoin`), nic neváží (`carryKg: 0`). Mincovní fáze `coinPhase` → `coinClearing`: kupují napřed kupci, pak ostatní v pořadí stran (hostitel, výpravy podle příjezdu), u prodávajícího v pořadí `TRADE_GOODS` (`basketOf` – košík do zbývajícího měšce; `Math.min(purse, ceil(bill))` při platbě je jen pojistka proti šumu), platba za dvojici nahoru na celou minci, C a W hladiny z `coinsAgainstGoods`, `nextLevel`. Co výprava v mincovní fázi prodává, určuje `coinPhaseStock` (`craft-orders.ts` – náklad `withoutCoins`). Hostitel kupuje jen objednanou zbroj (`armsBuyer`, `fromMerchants`). Zápočty mince nevidí (`withoutCoins`). Kupci `MERCHANTS` (měšec 60, seznam med, vosk, kožešiny, otroci), `affordableWants` počítá každé zboží zvlášť za celý měšec. Mimo obchod se mincemi neplatí nic (`grep -rln coins packages/game/src`: jen `trade/`, `steward/`, `people/belongings.ts`, `core/summary.ts`, pošta).
- **Dílny:** `Craft` = hrnčíř, kovář, uhlíř, tesař; `CRAFT_BASE`, `CRAFTS`, `workshopExtra` (+30 %, uhlíř 0), `WORKSHOP_PORCH_M`, `WORKSHOP_SIDE_M`, `workshopLabor` (`craft`, `skill`), `workshopSkill` (`CRAFT_SKILL` – učeň 0,5, vyučený za 5 let), řemeslo dělají jen muži (`craftHands`), žně všemi rukama (`craftHarvestLabor`). `OreSite` kováře je vzor místa práce s chůzí (`walkM` na cm, `distanceFactor` – 1 % za 10 m nad 100 m); `chooseDugSite` bere jen konečnou chůzi (`Number.isFinite`) – přes potok bez brodu dá `groundWalkLength` `Infinity`. Zámek stavby rokem: `dwellingYearReason` → `VillageView.build.<druh>.blocked` v `buildOptions` (`apps/web/lib/village-view.ts`); nadzemní varianty dílny (`workshopVariants`) zamyká jen rok varianty. `Record<Craft, …>` je 16 (doména `CRAFT_BASE`, `WORKSHOP_PORCH_M`, `WORKSHOP_SIDE_M`, `CRAFT_NAMES`; web `CRAFT_WORK`, `CRAFT_SITES`, `ENOUGH`, `CRAFTSMAN`, `CRAFT_ICONS`, `WORKSHOP_FINISHED`, `WORKSHOP_INSTRUMENTAL`, `CRAFT_FORMS`, `WORKSHOP_ICONS`, `CRAFT_MODEL`, `CRAFT_LABELS`, `CRAFT_LOOKS` – výrobek `product.stock: keyof CraftStocks`); TypeScript vynutí i `BUILD_COSTS` (`Record<BuildKind, …>`, `buildings/costs.ts`), `looks: Record<WorkshopActivity, …>` (`selection/crafts.tsx`) a úplný `switch` ve `workshopValue` (`steward/steward.ts`), `Partial<Record<Craft, …>>` (`WORKSHOP_YARD_PATH_BOX_M`, `practice`) ne. Zkratku dílny skládá `workshop()` v `build-items.ts` jako `Key${label}`, číslice umí jen `hotkeyCode` (`Digit1`) u `dwelling()`; volné zkratky staveb jsou jen číslice (1 srub, 2 vypletený dům). Riziko požáru násobí `fire.ts` (`FIRE.craftFactor`) jen kováři, uhlíři a hrnčíři.
- **Dvorec:** mince a zbroj ukazuje v panelu dvorce `WaresStock` (`selection/wares.tsx`, testid `wares-<zboží>`, test `WaresStock.test.tsx`) z `WaresView` (`core/summary.ts`); `ManorPanel.tsx` mince neukazuje.
- **Pošta a odchod:** výsledek výpravy s mincemi pro zaniklou domovskou ves jde hostiteli (`strandedMail`, `carriesCoins`, `receiveStranded` – kronika `newcomer.coins` / `stranded-coins`, SQL `inbox-repository.ts` i in-memory `strandedResults` v `application/__tests__/in-memory-inbox.ts` filtrují `unsold.coins`; test DB `inbox-repository.db.test.ts`). Odchod celé vsi nese `CARRIED_STOCKS` (i `coins`, `arms`).
- **Správce:** platí obilí v nouzi zbožím `STEWARD.grainPayment` (mince první) – `grainPayment()` (`steward-market.ts`) bere zboží v tom pořadí, každé až do pokrytí ceny; cenu zboží u cíle dává `priceKg` (`trade/villager-trips.ts` – bez zprávy `TRADE_GOOD_VALUES`, mince kurz ÷ hladina). Roční výprava naloží seznam a náklad do nosičů (`fitToCrew` plní do meze) a mince přidá až potom (`coinsFor` – mince nic neváží). Dílny staví jen čtyř řemesel (`workshopStep` – vlastní výčet, `workshopValue` – `switch` přes `Craft`), ale plán správce ověřuje slot dílny pro každé řemeslo z `CRAFTS` (`steward-plan.ts` – `slotChecks` = `CRAFTS.length` z rozpočtu `STEWARD.checksPerStage` = 40, `slotFits` – `CRAFTS.every(checkWorkshopPlacement)`). Zlatý otisk vsi jede se správcem (`village-golden-fixture.ts` – `newSteward(day, true)`).
- **Zlato:** hra ho nezná – žádné jméno z výčtu „nesmí existovat“ v Předpokladu.

## Rozhodnutí plánu (návrh Clauda)

1. **Mince váží gram** (`GOLD.coinGrams` = 1): 1 g zlata = 1 mince = 15 kg obilí (`TRADE_GOOD_VALUES.gold` – 15 kg obilí za gram, `carryKg: 0` jako mince – nepřidá nosiče: správce plní náklad do meze nosičů, `fitToCrew`, a peníze přidá až potom). Herní mince (15 kg obilí, měsíc jídla) odpovídá pražskému denáru kolem roku 965 (Ibráhím ibn Jákúb, rešerše 2026-10-18), který vážil ≈ 1 g. Martin: „1:1 váhově“ – zlato je proto proti skutečnosti levné (zlato stálo zhruba dvanáctkrát víc než stříbro); Oznámit 1.
2. **Zlato je zboží `gold`** (`VillageState.gold`, gramy se zlomky; na trhu celé gramy – `PIECE_GOODS`), v `TRADE_GOODS` za kamenem a před medem (Martinovo pořadí „zlato, šperky, med, vosk, kožešiny a otroky“). **Cena pevná:** 1 mince za gram na každém trhu (`goldCoinPrice`), nehýbe se nabídkou ani hladinou (`coinPriceOf`, `nextPrices` ho přeskočí). **Do zápočtu nepatří** (jako mince – `withoutMoney`) a do C a W hladiny také ne: výměna zlata za mince je kov za kov, ne poptávka po zboží; hladinu dál hýbou mince proti zboží, tedy i vyražené mince, až je ves utratí (Pravidla 3 – inflace).
3. **Výměna za mince s kýmkoli, kdo mince má** (Martin): v mincovní fázi zlato kupují cizí kupci (`MERCHANTS.wants.gold` = 1 000 g – vykoupí, kolik zaplatí), výpravy hráče a správce se zlatem v „Dostaneš“ a **hostitel**: zlato, které mu přespolní výprava nabízí, vymění za své mince 1:1, dokud je má (`exchangesGold`) – po cizích kupcích (ti ho platí se šperkařem dráž) a po objednané zbroji (hráčova objednávka má přednost). Hostitel nabízí všechno své zlato, celé gramy, jen v mincovní fázi (`hostGold`) – ve vsi k ničemu jinému není a šperkař bere mince i zlato. Výměna u hostitele je bez výhody šperkaře v obou směrech (Oznámit 3).
   - **Objednanou zbroj hostitel kupcům platí napřed mincemi, pak celými gramy svého zlata, gram za minci** (`goldPurse`): kupci zlato kupují tak jako tak a podle `gold.md` je „zlato je mezi vsemi jako peníze“ (Pravidla 2) a výhoda platí, „Když ves platí zlatem nebo mincemi“ (Pravidla 4). Výměna zlata v jiné dny než den kupců tak ves o objednaný meč nepřipraví.
   - Kde nikdo nemá mince (do roku 950 skoro všude kromě vsí u stezky a jejich okolí), zlato nic nekoupí – ani zápočtem (Oznámit 3).
4. **Rýžovník** (`Craft 'panner'`, zemnice jako uhlíř + 30 % za splav a žlaby – `workshopExtra`; přístřešek vpředu 0, boční 2 m): stavět ho jde jen na mapě se zlatonosným náplavem, na kterém ještě zlato je (`workshopBlocked` – „Bez zlatonosného náplavu“, „Náplavy jsou vyrýžované“ – jako lom bez výchozu).
   - Rýžuje jen v teplých měsících **duben–říjen** (`PANNING.months`; voda bez ledu – Martin „Ano“ k shrnutí), mimo ně domácnost pracuje se vsí (`resting`), ve žňové dny na poli jako ostatní dílny.
   - Rýžují muži domácnosti z práce dílny po denním minimu: **`PANNING.gPerManDay` = 1 g na člověkoden vyučeného** × praxe (`workshopSkill`, učeň 0,5) ÷ přirážka za chůzi k náplavu (`distanceFactor`). Je to herní číslo prémiové krajiny (návrh Clauda), ne měření: zkušený rýžovník propere pánví ≈ 1 yd³ (0,76 m³) štěrku denně, se splavem 1,5–2 yd³; české sejpy a Pootaví mají řádově desetiny gramu na m³ (ověří rešerše Úlohy 1a), bohatá rýžoviště zlaté horečky 19. století se železnou pánví (Ballarat, Francouzská Guyana) jsou jen horní mez.
   - **Náplav** = nejbližší náplav se zlatem, ke kterému se dojde, po pevných cestách s půdou (`villageRoadWalk`; jen konečná chůze – přes potok bez brodu `Infinity` se nevybere; bez krajiny vzdušně; při shodě nižší index), drží **`PANNING.placerG` = 1 500 g** (čočka ≈ 236 m², ≈ 3 m štěrku, herní obsah ≈ 2 g/m³ – nad českými sejpy, návrh Clauda). Vyčerpá se a neobnovuje (`gold.md` – Pravidla 1); co by den dal nad zbytek náplavu, propadne a další den jde rýžovník k dalšímu. Na mapě s 3–6 náplavy je 4,5–9 kg zlata – rýžovník se synem-učněm (≈ 214 dní sezóny, 1,5 g denně bez chůze, náplavy aspoň 200 m od vsi) ji vyrýžuje zhruba za 15–30 let (Oznámit 2). Bez dosažitelného náplavu se zlatem `no-placer` (`Workshop.placer: null`, znovu se hledá 1. 4. další sezóny).
   - Vyrýžované zlato přibude do `VillageState.gold`, po náplavech do `VillageState.goldPanned` (index = pořadí `goldPlacers`); kronika `placer-exhausted`.
5. **Šperkař** (`'jeweller'`, polozemnice + 30 % za výheň, přístřešek jako kovář): zpracovává zlato i mince vsi (Martin: „Klenotník jako surovinu může použít zlato nebo mince“) – **`JEWELLER.gPerManDay` = 1,5 g na člověkoden vyučeného** × praxe, herní číslo (návrh Clauda): filigrán a granulace velkomoravských šperků jsou měřítkem pracnosti (gombík na několik dní práce), ne množství zlata – gombíky jsou většinou stříbrné nebo měděné zlacené (rešerše). Zpracované přibývá do `VillageState.jewelleryG`, nejvýš do kovu vsi (`jewelleryMaterialG` = celé gramy zlata + mince × `coinGrams`); vše zpracované – `resting`, bez kovu – `no-gold`. Šperky nejsou zboží (Martin) – `jewelleryG` je jen kapacita výhody a použitelná je nejvýš do kovu (`jewelleryOf`). **Požár beze změny:** šperkař (výheň) i mincovna (pec) hoří jako obyčejná polozemnice – `FIRE.craftFactor` v `fire.ts` dál jen kovář, uhlíř a hrnčíř (vyšší riziko by bylo pravidlo navíc).
   - **Výhoda `JEWELLER.factor` = 1,5** (Martin: „Na obě strany stejně“) v mincovní fázi: **prodej zlata** – prvních `jewelleryG` gramů stojí kupujícího 1,5 mince za gram (kupec i výprava, která zlato kupuje; Martin: „I mezi vesnicemi“); **platba mincemi** za zboží (výprava, objednaná zbroj – tu hostitel doplácí i zlatem, Rozhodnutí 3) – prvních `jewelleryG` mincí (gramů) platí za 1,5, prodávající tak dostane o třetinu mincí méně, než je cena; nad kapacitu 1:1. Použitá výhoda ubírá kapacitu gram za gram kovu, který odešel. Nákup zlata za mince a výměna u hostitele výhodu nemají (kov za kov).
   - Mimo trh ves mincemi neplatí (Co hra už zná), výhoda tedy platí všude, kde ves platí mincemi.
6. **Šperkař na výpravě:** výprava hráče a správce si veze kapacitu `min(jewelleryOf, mince + zlato v nákladu)` (spočítá se ze vsi před odečtením nákladu; `MarketArrival.jewelleryG`, ve vsi ubude), na trhu ji použije a nepoužitou přiveze zpět (`MarketResult.jewelleryG` → `addJewellery`). Výprava vesničanů ne (mince neutrácí). Zanikne-li domovská ves, nepoužitá kapacita zanikne s výsledkem (není to zboží).
7. **Mincovna** (`'minter'`, mincíř, polozemnice + 30 % za pec, tlačítko „Mincovna“): stavět ji jde od 1. 1. 950 (`MINT.fromYear`; dřív zašedlá „Od roku 950“ i ve vypletené a roubené variantě a doména stavbu odmítne i mimo web). Mincíř razí **všechno zlato vsi**, `MINT.gPerManDay` = 200 g na člověkoden vyučeného × praxe (ruční ražba denárů – stovky kusů denně, rešerše), po celých gramech: −n g zlata, +n mincí. Bez celého gramu zlata `no-gold` (bez upozornění – ves bez zlata je běžná). Vlastní mince jdou do oběhu a kde je ves utratí, hladina roste (`gold.md` – Pravidla 3). Požár jako u šperkaře (Rozhodnutí 5).
8. **Kupci a zlato:** `MERCHANTS.wants` = `{ gold: 1 000, honey: 100, wax: 24, furs: 60, slaves: 10 }` (zlato první – Martinovo pořadí; v `TRADE_GOODS` je zlato před medem, takže ho kupec u prodávajícího koupí dřív). Měšec 60 mincí se nemění (`markets.md` – ověřená čísla plánu 4) – za průjezd tak kupec koupí nejvýš 60 g zlata, šperků 40 g (Oznámit 4). Trh bez zlata a bez kapacity šperkaře je bit po bitu jako po plánu 5: zlato není v zápočtu, ceně ani C a W; `affordableWants` počítá každé zboží zvlášť; seznam kupce se zlatem změní jen uložené `wants` a větu příjezdu.
9. **Pošta, zaniklé vsi a odchod:** zlato z výsledku pro zaniklou domovskou ves jde hostiteli stejně jako mince (jako zlato – `stranded-people.gold`, `carriesMoney`, SQL `inbox-repository.ts`, kronika `newcomer.gold` / `stranded-coins.gold`) – zlato je mezi vsemi jako peníze (`gold.md` – Pravidla 2). Odchod celé vsi bere zlato i kapacitu šperkaře (`CARRIED_STOCKS` – Martin 25. 11. 2026: „berou si úplně vše“), odchod syna a části lidí je nechá v mateřské vsi. Vyrýžované náplavy (`goldPanned`) patří krajině – ves na jiné mapě začíná s náplavy své mapy.
10. **Správce** je NPC hráč: obilí v nouzi platí zbožím `STEWARD.grainPayment` = mince, hřivny, keramika, uhlí, klády a **zlato až nakonec** – zápočet zlato nevidí a výměna potřebuje mince hostitele: hned po mincích by zlato pokrylo cenu samo a u hostitele bez mincí by výprava přivezla zlato zpět bez obilí; na konci nic nezhorší. Roční výprava veze napřed mince, chybí-li, zlato (`moneyFor` místo `coinsFor`; zlato nic neváží, nosiče nepřidá) – zlato na trhu vymění u hostitele nebo prodá kupcům a za mince koupí. **Dílny zlata nestaví:** správce zatím neumí spočítat hodnotu dílny zlata (`workshopValue` jí dá 0 a plán správce ověřuje slot dílny jen pro dnešní čtyři řemesla – `STEWARD_CRAFTS`) – později; šperkař a mincíř ve vsi správce pracují sami (Oznámit 8).
11. **Rozhraní** (jako 0 A.D.): tři tlačítka dílen se zkratkami 3 (rýžovník), 4 (šperkař), 5 (mincovna) – `Digit3`–`Digit5` přes `hotkeyCode` – a variantami jako dnešní dílny; ikony zlata, šperku a tří dílen; zlato a šperky (kapacita) v zásobách dvorce (`WaresStock`); panely tří dílen (náplavy a zbytek zlata, zpracované z kovu, zlato k ražbě); zlato v „Dáš“ i „Dostaneš“ panelu Trh po 10 g, pevná cena a výhoda šperkaře v `Tooltip`. **Scéna:** dílny z dnešních modelů (rýžovník – zemnice uhlíře, šperkař a mincovna – kovárna), rýžovník při práci stojí u náplavu (Oznámit 7).
12. **Kronika a upozornění:** nový zápis `placer-exhausted` (`left` – kolik náplavů se zlatem zbývá; poslední náplav má vlastní větu, žádná „0“) a upozornění; hotové dílny, trh a návrat výpravy dnešními zápisy s novým zbožím („40 g zlata“); návrat zlata ze zaniklé vsi rozšířeným `stranded-coins` / `newcomer`.
13. **Převod stavu žádný:** nová pole jsou volitelná. Kodek je obecný JSON (test v Úloze 1b).
14. **Pořadí úloh:** 1a rešerše; 1b zlato jako zboží; 2 ikony; 3a tři dílny – typy, výčty a správce; 3b tři dílny – zámky a tlačítka; 4 rýžování; 5 šperkař a mincovna ve vsi; 6a zlato v mincovní fázi – kupci a výměna; 6b šperkař v mincovní fázi a zbroj zlatem; 7a šperkař na výpravě; 7b pošta a zaniklé vsi; 8 správce; 9 web – dvorec a dílny; 10 web – panel Trh; 11 scéna; 12 e2e; 13a test světa; 13b Vlkov; 14 návrhy. 1b potřebuje 1a (čísla odkazují na rešerši); 2 a 3a potřebují 1b (3a bere ikony z 2); 3b potřebuje 3a; 4 a 5 potřebují 3b; 6a potřebuje 1b; 6b potřebuje 6a a 5 (`jewelleryOf`); 7a potřebuje 6b; 7b potřebuje 7a; 8 potřebuje 6a; 9 potřebuje 4 a 5; 10 potřebuje 7a; 11 potřebuje 4; 12 potřebuje 9–11; 13a všechny předchozí; 13b potřebuje 13a; 14 poslední. Úlohy jdou po sobě – sdílejí soubory.

## Review Focus

1. **Kapacita šperkaře nepřeroste kov:** ves utratí mince nebo prodá zlato bez výhody, výprava odveze kov, vrátí se s menším – použitelná kapacita je vždy ≤ celé gramy zlata + mince (ve vsi i ve výpravě), platba nad kapacitu jde 1:1 a nic nejde do minusu. Test v Úlohách 5, 6b a 7a, denní invariant v Úloze 13a.
2. **Hostitel má méně mincí, než kolik mu výprava nabízí zlata, a k tomu objednanou zbroj:** zbroj se koupí napřed, zbytek mincí vymění celé gramy, zlato navíc jde domů s výpravou; hostitel bez mincí, ale se zlatem, zbroj kupcům doplatí zlatem gram za minci; nikdo nepřeplatí ani nedostane zlomek mince. Testy v Úlohách 6a a 6b.
3. **Rýžování na okraji sezóny a náplavu:** 31. 3. a 1. 11. se nerýžuje, 1. 4. a 31. 10. ano; náplav, kterému zbývá méně než denní výkon, dá přesně zbytek, zápis `placer-exhausted` přijde jednou a další den jde rýžovník k dalšímu; součet `goldPanned` = vyrýžované zlato; náplav, ke kterému se nedojde (`Infinity`), se nevybere a v JSON nezůstane `null`. Test v Úloze 4.
4. **Mincovna před rokem 950 obejitím webu** (akce s dnem 31. 12. 949) – doména stavbu odmítne; 1. 1. 950 projde. Test v Úloze 3b.
5. **Trh bez zlata a bez šperkaře s kupcem, který má zlato na seznamu a velký měšec:** ceny, hladina i obchody bit po bitu jako po plánu 5. Test v Úloze 6a, znovu v 6b.
6. **Zanikne domovská ves výpravy se zlatem** (i bez mincí a lidí): zlato dojde hostiteli, věta kroniky bez „0 mincí“ a bez jména vsi pro cizího správce. Test v Úloze 7b.
7. **Dopočet po kouscích** přes sezóny rýžování, dny kupců, ražbu a návraty výprav se šperkařem: týž stav jako vcelku. Test v Úloze 13a.
8. **Ves se správcem bez zlata** plánuje a staví bit po bitu jako dnes (`STEWARD_CRAFTS`, `workshopValue` dílen zlata 0): zlatý otisk se správcem, `steward-slow` a Vlkov bez úpravy testu. Úlohy 3a a 13b.
9. **Smíšený košík kupujícího se šperkařem** (zlato i jiné zboží): platba nikdy nepřeroste měšec a pojistka proti šumu neschová podplacení – výhoda jen za zboží mimo zlato. Test v Úloze 6b.

## Mapa souborů

Složka `packages/game/src/domain/village/`, není-li uvedeno jinak.

| Úloha | Soubory                                                                                                                                                                                                                                                                                                                                                                                                 | Co                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1a    | `docs/design/research/2026-11-26-gold.md` (nový)                                                                                                                                                                                                                                                                                                                                                        | rešerše                                |
| 1b    | `rules/rules-gold.ts` (nový), `rules/index.ts`, `rules/rules-trade.ts`, `types/types-trade.ts`, `types/types-state.ts`, `trade/goods.ts`, `trade/trade.ts`, `trade/market-prices.ts`, `trade/market.ts`, `people/belongings.ts`, `core/summary.ts`, `index.ts`, `apps/web/lib/trade-names.ts`, `apps/web/components/game/hud/MarketPanel.tsx`                                                           | zlato jako zboží, čísla                |
| 2     | `apps/web/public/icons/build/{ryzovnik,sperkar,mincovna}{,-vypleteny,-srub}.png`, `apps/web/public/icons/resources/{gold,jewellery}.png` (nové), `apps/web/public/icons/LICENSES.md`, `tools/blender/icons.py`, `tools/blender/gold_badges.py` (nový)                                                                                                                                                   | ikony                                  |
| 3a    | `types/types-crafts.ts`, `rules/rules-crafts.ts`, `rules/rules-steward.ts`, `buildings/costs.ts`, `crafts/crafts.ts`, `crafts/gold-crafts.ts` (nový), `steward/steward-plan.ts`, `steward/steward.ts`, `index.ts`, web `Record<Craft, …>` (12 záznamů – Co hra už zná), `apps/web/components/game/hud/selection/crafts.tsx`, `apps/web/lib/village-view-crafts.ts`, `apps/web/lib/selection-details.ts` | tři dílny – typy, výčty, správce       |
| 3b    | `core/premium-effects.ts`, `crafts/gold-crafts.ts`, `core/actions.ts`, `buildings/build-intent.ts`, `index.ts`, `apps/web/lib/build-items.ts`, `apps/web/lib/village-view.ts`                                                                                                                                                                                                                           | tři dílny – zámky a tlačítka           |
| 4     | `crafts/gold-crafts.ts`, `crafts/crafts.ts`, `types/types-crafts.ts`, `types/types-chronicle.ts`, `core/simulate-work-people.ts`, `core/simulate-work-apply.ts` (nebo `core/simulate-work.ts`), `apps/web/lib/village-view-chronicle.ts`, `apps/web/lib/village-notices.ts`                                                                                                                             | rýžování                               |
| 5     | `trade/jewellery.ts` (nový), `crafts/gold-crafts.ts`, `crafts/crafts.ts`, `core/summary.ts`, `index.ts`                                                                                                                                                                                                                                                                                                 | šperkař a mincovna ve vsi              |
| 6a    | `trade/market-coins.ts`, `trade/market.ts`, `rules/rules-merchants.ts`, `apps/web/lib/village-view-chronicle.ts`                                                                                                                                                                                                                                                                                        | zlato v mincovní fázi – kupci a výměna |
| 6b    | `trade/market-coins.ts`, `trade/market.ts`, `trade/arms-order.ts`, `types/types-market.ts`                                                                                                                                                                                                                                                                                                              | šperkař v mincovní fázi, zbroj zlatem  |
| 7a    | `types/types-market.ts`, `trade/market-trip.ts`, `trade/market.ts`                                                                                                                                                                                                                                                                                                                                      | šperkař na výpravě                     |
| 7b    | `packages/game/src/application/village-mail.ts`, `packages/game/src/application/inbox.ts`, `packages/game/src/application/__tests__/in-memory-inbox.ts`, `trade/market-people.ts`, `trade/market.ts`, `types/types-chronicle.ts`, `packages/db/src/adapters/inbox-repository.ts`, `apps/web/lib/village-view-chronicle.ts`                                                                              | pošta a zaniklé vsi                    |
| 8     | `rules/rules-steward.ts`, `steward/steward-market.ts`, `trade/villager-trips.ts`                                                                                                                                                                                                                                                                                                                        | správce a zlato                        |
| 9     | `apps/web/components/game/hud/selection/wares.tsx`, `apps/web/lib/village-view-crafts.ts`, `apps/web/lib/selection-details.ts`, `apps/web/components/game/hud/selection/crafts.tsx`                                                                                                                                                                                                                     | web – dvorec a dílny                   |
| 10    | `apps/web/lib/market-view.ts`, `apps/web/components/game/hud/MarketPanel.tsx`, `apps/web/components/game/hud/use-market-people.ts` (jen je-li tam výčet zboží)                                                                                                                                                                                                                                          | web – panel Trh                        |
| 11    | `apps/web/lib/person-activity.ts`, `apps/web/lib/scene/villager-plan.ts`, `apps/web/lib/scene/villager-plan-phases.ts`, `apps/web/lib/village-view-crafts.ts` (je-li tam místo kopání), `apps/web/lib/scene/workshop-layout.ts`                                                                                                                                                                         | scéna                                  |
| 12    | `apps/web/e2e/gold.spec.ts` (nový), e2e, které počítají řádky „Dáš“ / „Dostaneš“                                                                                                                                                                                                                                                                                                                        | e2e                                    |
| 13a   | `trade/__tests__/market-gold-years.test.ts` (nový), `packages/game/src/application/__tests__/market-world.ts` (`goldOfWorld`), `packages/game/slow-tests.ts`, `docs/design/gold.md` (výsledek)                                                                                                                                                                                                          | test světa                             |
| 13b   | `docs/design/gold.md` (výsledek Vlkova), přepočet Vlkova (postup plánů 4 a 5)                                                                                                                                                                                                                                                                                                                           | Vlkov                                  |
| 14    | `docs/design/*`, `docs/code/*`, `CLAUDE.md`                                                                                                                                                                                                                                                                                                                                                             | návrhy, celé e2e                       |

Testy a mapa kódu každé úlohy jsou v jejích Files.

---

### Task 1a: Rešerše zlata – rýžování, šperky a ražba (Sonnet)

**Files:**

- Create: `docs/design/research/2026-11-26-gold.md`
- Test: žádný – úloha nemění kód (kontrola `npx prettier --check docs/design/research/2026-11-26-gold.md`)

**Interfaces:**

- Consumes: vzor `docs/design/research/2026-10-18-trade-values.md` (tabulka zdroj / údaj / odkaz, pak „návrh“), čísla Rozhodnutí 1, 4, 5 a 7.
- Produces: rešerše, na kterou odkazují čísla `rules-gold.ts` (Úloha 1b):
  - **rýžování:** pánví ≈ 1 yd³ (0,76 m³) štěrku denně, kolébkou 1,5–2 yd³, splavem víc;
  - **obsah zlata – hlavní zdroj české sejpy a Pootaví** (13.–14. století nejvýnosnější rýžoviště střední Evropy, sejpy u Modlešovic; obsah řádově desetiny g/m³); Ballarat (12 grainů na yd³) a Francouzská Guyana (3 pennyweighty na yd³) jen jako horní mez – bohatá rýžoviště zlaté horečky 19. století se železnou pánví, ne potok v Čechách 6.–10. století;
  - **1 g za člověkoden a náplav 1,5 kg** jsou herní čísla prémiové krajiny (návrh Clauda), ne měření – rešerše uvede, co by dal potok podle českých sejpů, a rozdíl napíše;
  - **šperkař:** filigrán a granulace velkomoravských šperků – gombíky jsou většinou stříbrné nebo měděné zlacené, berou se jako měřítko pracnosti (dny práce na kus), ne množství zlata; 1,5 g za člověkoden je herní číslo;
  - **ražba:** ruční ražba denárů (stovky kusů denně) a hmotnost pražského denáru 10. století (≈ 1 g) – `MINT.gPerManDay` 200, `GOLD.coinGrams` 1.
- Co se nedohledá, napsat jako „neověřeno“ – **čísla se nemění** (jsou návrh Clauda, kalibrace přijde s typy krajin). Vyjde-li údaj, ze kterého číslo vychází (výkon pánve, hmotnost denáru, ražba za den, pracnost šperku), řádově jinak (≥ 3×), zapsat do zprávy a ozvat se; že herní gram za člověkoden je nad českými sejpy, je záměr, ne důvod se ozvat.

- [ ] **Step 1: Hledat a zapsat** (každý údaj s odkazem): tabulka zdroj / údaj / odkaz, pak „Návrh čísel (návrh Clauda)“ s `GOLD`, `PANNING`, `JEWELLER`, `MINT`.
- [ ] **Step 2: Kontrola** `npx prettier --check docs/design/research/2026-11-26-gold.md` a `grep -nP "\x{2014}" docs/design/research/2026-11-26-gold.md` nic (žádná dlouhá pomlčka).
- [ ] **Step 3: Commit** `docs(design): rešerše zlata – rýžování, šperky a ražba (plán 6)`.

### Task 1b: Zlato jako zboží – stav a čísla (Sonnet)

**Files:**

- Create: `rules/rules-gold.ts`
- Modify: `rules/index.ts` (export), `rules/rules-trade.ts` (`TRADE_GOOD_VALUES.gold`), `types/types-trade.ts` (`TradeGood` += `'gold'`), `types/types-state.ts` (`gold?`, `jewelleryG?`, `goldPanned?`), `trade/goods.ts` (`GOLD_GOOD`, pořadí `TRADE_GOODS`, `PIECE_GOODS`, `withoutMoney`), `trade/trade.ts` (`villageGoodStock`, `addGood`), `trade/market-prices.ts` (`goldCoinPrice`, `coinPriceOf`, `nextPrices`), `trade/market.ts` (`withoutMoney` místo `withoutCoins` v ceně dne a zápočtu – `priceTotals` a `clearMarket`, řádky 691, 698, 781 a 783; mincovní fáze – řádky 568 a 581 – dál `withoutCoins`, zlato v ní je), `people/belongings.ts` (`CARRIED_STOCKS` += `'gold'`, `'jewelleryG'`), `core/summary.ts` (`WaresView.goldG?`), `index.ts`
- Beze změny: `trade/craft-orders.ts` – ř. 162 je `coinPhaseStock` (co výprava prodává v mincovní fázi) a zůstává `withoutCoins`, zlato v ní je; zlato zakázku neplatí (`recordOrders.pays` ho nepočítá – seznam hostitele `hostWants` zlato nemá).
- Modify (web, aby prošel typecheck): `apps/web/lib/trade-names.ts` (`TradeUnit` += `'g'`, `gold`), `apps/web/components/game/hud/MarketPanel.tsx` (`stepOf` – zlato po 10)
- Modify: `docs/code/village-trade.md` (nový bod „Zlato“ za „Mince a zbroj“)
- Test: `trade/__tests__/gold-good.test.ts` (nový), `people/__tests__/departure.test.ts`, `packages/db/src/adapters/__tests__/village-state-codec.test.ts`, `apps/web/lib/__tests__/trade-names.test.ts`

**Interfaces:**

- Consumes: rešerše (Úloha 1a), vzor mincí (`COIN_GOOD`, `state.coins` ve `villageGoodStock` / `addGood`), `CARRIED_STOCKS`.
- Produces:

```ts
// rules/rules-gold.ts – každé číslo s odkazem na gold.md (Pravidla N) a rešerši 2026-11-26-gold.md
export const GOLD = { coinGrams: 1 } as const; // mince váží gram – „1:1 váhově“
export const PANNING = { months: { from: 4, to: 10 }, gPerManDay: 1, placerG: 1_500 } as const;
export const JEWELLER = { gPerManDay: 1.5, factor: 1.5 } as const;
export const MINT = { fromYear: 950, gPerManDay: 200 } as const;
// rules-trade.ts – nic neváží jako mince: nepřidá nosiče (správce plní náklad do meze – `fitToCrew`)
gold: { valueKg: MARKET.grainKgPerCoin / GOLD.coinGrams, carryKg: 0 },
// types-state.ts (VillageState)
/** Zlato vsi (g, i zlomky z rýžování; gold.md – Pravidla 2); chybí = žádné. */
gold?: number;
/** Šperkařovo zpracované zlato (g) – kapacita výhody, ne zboží (gold.md – Pravidla 4); chybí = 0. */
jewelleryG?: number;
/** Vyrýžováno z náplavů (g; index = pořadí `goldPlacers`); chybí = nic. */
goldPanned?: number[];
// trade/goods.ts
export const GOLD_GOOD = 'gold' as const;
/** Kopie bez mincí a zlata – cena dne a zápočet (Rozhodnutí plánu 6, bod 2). */
export function withoutMoney(goods: TradeGoods): TradeGoods;
// trade/market-prices.ts
/** Pevná cena gramu zlata v mincích (1 ÷ `GOLD.coinGrams`) – nezávisí na trhu ani hladině. */
export function goldCoinPrice(): number;
// core/summary.ts (WaresView) – kapacitu šperkaře (`jewelleryG`) přidá Úloha 5 z `jewelleryOf`
goldG?: number; // celé gramy, jen kladné
```

- `TRADE_GOODS`: `…, 'stone', 'gold', 'honey', …`; `PIECE_GOODS` obsahuje `gold`. `villageGoodStock(state, 'gold')` = `Math.floor((state.gold ?? 0) + EPSILON)`; `addGood(…, 'gold', n)` přičte i zlomek a výsledek pod `EPSILON` (i záporný šum) pole smaže – nikdy záporná zásoba. `coinPriceOf(…, 'gold')` = `goldCoinPrice()`; `nextPrices` přeskočí `gold` jako `coins`. `WaresView` se vrátí i ve vsi jen se zlatem.
- Web: `gold: { name: 'Zlato', genitive: 'zlata', unit: 'g', icon: 'gold' }` (soubor ikony dodá Úloha 2 – do té doby se obrázek jen nenačte).

- [ ] **Step 1: Testy:**
  - `gold-good.test.ts`: `villageGoodStock` se `state.gold = 12.7` je 12; `addGood(state, 'gold', -12, day)` nechá 0,7 a `addGood(state, 'gold', -0.7, day)` pole smaže; `state.gold = 0.9999999999` a `addGood(state, 'gold', -1, day)` pole smaže (žádný záporný šum); `coinPriceOf({ gold: 7 }, 2.5, 'gold')` = 1 a `initialPrice('gold')` = 1; `nextPrices({}, { gold: 500 }, { gold: 2000 })` nemá klíč `gold`; `withoutMoney({ gold: 5, coins: 3, grain: 10 })` = `{ grain: 10 }`; `coinPhaseStock` výpravy hráče s nákladem `{ gold: 50, coins: 3, grain: 10 }` má `gold` 50; `isPieceGood('gold')`; `TRADE_GOODS.indexOf('gold')` = index `stone` + 1; `TRADE_GOOD_VALUES.gold.carryKg` = 0.
  - `departure.test.ts`: odchod celé vsi s `gold: 40.5`, `jewelleryG: 20` – osadníci nesou obojí, stará ves je nemá; odchod syna obojí nechá v mateřské vsi.
  - `village-state-codec.test.ts`: zpáteční cesta stavu s `gold`, `jewelleryG`, `goldPanned: [12.5, 0, 1500]` beze změny.
  - `trade-names.test.ts`: `TRADE_GOOD_NAMES.gold` s jednotkou `g`.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/gold-good.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces (čísla s odkazem na rešerši z Úlohy 1a); výčtové testy upravit (Global Constraints).
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village packages/db/src/adapters/__tests__/village-state-codec.test.ts apps/web/lib` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:db` a `test:slow`), commit `feat(game): zlato jako zboží a čísla zlata (plán 6)`.

### Task 2: Ikony zlata, šperku a tří dílen (Sonnet)

**Files:**

- Create: `apps/web/public/icons/build/ryzovnik.png`, `ryzovnik-vypleteny.png`, `ryzovnik-srub.png`, `sperkar*.png`, `mincovna*.png` (9 souborů), `apps/web/public/icons/resources/gold.png`, `jewellery.png`, `tools/blender/gold_badges.py`
- Modify: `tools/blender/icons.py` (zlato, šperk), `apps/web/public/icons/LICENSES.md`
- Test: kontrola souborů (`ls`, rozměry jako sousední ikony) a test ikon webu, je-li (`grep -rln "icons/resources" apps/web/lib/__tests__`)

**Interfaces:**

- Consumes: dnešní ikony dílen `uhlir*.png` a `kovar*.png` (Rozhodnutí 11 – modely dílen zlata jsou dnešní), styl ikon zdrojů (`coin.png`, `slave.png`).
- Produces: ikony dílen = ikona základní dílny (rýžovník ← `uhlir`, šperkař a mincovna ← `kovar`, každá varianta zvlášť) s odznakem v pravém dolním rohu (rýžovník – pánev se zrnky, šperkař – prsten, mincovna – mince s razidlem), skládá je `gold_badges.py` (Pillow, opakovatelně); `gold.png` (hromádka zlatých zrnek a nuget), `jewellery.png` (prsten nebo náušnice) z Blenderu stylem `coin.png`. **Licence:** ikony dílen jsou odvozeniny `kovar*.png` a `uhlir*.png` (rendery s modely a texturami 0 A.D.) – **CC BY-SA 3.0 jako zdrojové ikony (Wildfire Games)** podle hlavičky `icons/LICENSES.md`; `gold.png` a `jewellery.png` (vlastní render, model ve skriptu) pod touž hlavičkou jako `resources/coin.png`. Zdroj každého souboru řádkem do `LICENSES.md` (vzor `build/kovar.png`, `resources/coin.png`), nic jako CC0 (repo je veřejné).

- [ ] **Step 1: Vyrenderovat** ikony zdrojů (`icons.py`), složit ikony dílen (`gold_badges.py`).
- [ ] **Step 2: Ověřit** `ls apps/web/public/icons/build/ | grep -c "ryzovnik\|sperkar\|mincovna"` = 9, rozměry shodné se `kovar.png` (`python3 -c` s Pillow), náhled (menší snímek) odlišitelný od `kovar.png`.
- [ ] **Step 3: Licence** (řádek pro každý z 11 souborů), kontroly, commit `feat(web): ikony zlata, šperku a dílen zlata (plán 6)`.

### Task 3a: Tři dílny – typy, výčty a správce (Sonnet)

**Files:**

- Modify: `types/types-crafts.ts` (`Craft`, `WorkshopActivity` += `'no-placer' | 'no-gold'`), `rules/rules-crafts.ts` (`CRAFT_BASE`, `CRAFTS`, `WORKSHOP_PORCH_M`, `WORKSHOP_SIDE_M`), `rules/rules-steward.ts` (`STEWARD_CRAFTS`), `buildings/costs.ts` (`BUILD_COSTS`), `crafts/crafts.ts` (`CRAFT_NAMES`, větve `workCrafts` a `restingCrafters` pro nová řemesla – zatím `resting`), `steward/steward-plan.ts` (`slotChecks`, `slotFits` ze `STEWARD_CRAFTS`), `steward/steward.ts` (`workshopValue` – dílny zlata 0), `index.ts`
- Create: `crafts/gold-crafts.ts` (`GOLD_CRAFTS`)
- Modify (web): 12 záznamů `Record<Craft, …>` (Co hra už zná – i `CRAFT_LOOKS` s volitelným `product`, `WORKSHOP_ICONS` z Úlohy 2, `CRAFT_MODEL` v `apps/web/lib/scene/workshop-layout.ts` – `uhlir`, `kovar`, `kovar`), `apps/web/components/game/hud/selection/crafts.tsx` (`looks` += `no-placer`, `no-gold`), `apps/web/lib/village-view-crafts.ts` (`workshopOutputKg`, `workshopSmokes`), `apps/web/lib/selection-details.ts` (`workshopDetails`)
- Modify: `docs/code/village-crafts.md` (bod „Dílny zlata“ za „Řemesla“), `docs/code/village-steward.md` (plán správce – slot dílny jen `STEWARD_CRAFTS`)
- Test: `crafts/__tests__/gold-crafts.test.ts` (nový), `steward/__tests__/steward-plan.test.ts` (beze změny – sloty prošly kontrolou umístění), web testy pohledu dílen (`grep -rln "workshopSmokes\|CRAFT_LOOKS" apps/web/lib/__tests__`)

**Interfaces:**

- Consumes: `workshopCost`, `workshopBuildCost`, ikony (Úloha 2).
- Produces:

```ts
// types-crafts.ts
export type Craft = 'potter' | 'smith' | 'burner' | 'carpenter' | 'panner' | 'jeweller' | 'minter';
// rules-crafts.ts
CRAFT_BASE: { …, panner: 'zemnice', jeweller: 'polozemnice', minter: 'polozemnice' }
CRAFTS = ['burner', 'panner', 'potter', 'smith', 'jeweller', 'minter', 'carpenter'] // dnešní pořadí dílen se nemění
WORKSHOP_PORCH_M: { …, panner: 0, jeweller: 3.2, minter: 3.2 }
WORKSHOP_SIDE_M: { …, panner: 2, jeweller: 3.2, minter: 3.2 }
// rules-steward.ts
/** Řemesla, se kterými počítá správce (slot dílny plánu, `workshopValue`) – dnešní čtyři; dílny zlata nestaví (Rozhodnutí plánu 6, bod 10). */
export const STEWARD_CRAFTS: readonly Craft[] = ['burner', 'potter', 'smith', 'carpenter'];
// crafts/gold-crafts.ts
export const GOLD_CRAFTS: readonly Craft[] = ['panner', 'jeweller', 'minter'];
// apps/web/lib/village-view-chronicle.ts (CRAFT_LOOKS) – dílny zlata výrobek v `CraftStocks` nemají
product?: { icon: string; name: string; stock: keyof CraftStocks };
```

- **Správce pracuje jen se svými dnešními čtyřmi řemesly:** `slotChecks('workshop')` = `STEWARD_CRAFTS.length` (4 – rozpočet `STEWARD.checksPerStage` stojí jako dnes), `slotFits` = `STEWARD_CRAFTS.every(checkWorkshopPlacement)`, `workshopValue` dá `panner`, `jeweller` a `minter` 0 (`switch` zůstane úplný), `workshopStep` (`steward.ts`) má vlastní výčet čtyř řemesel a nemění se, `STEWARD_PLAN_VERSION` také ne. Ves se správcem bez zlata tak plánuje a staví bit po bitu jako dnes – zlatý otisk (`village-golden*.test.ts` jede se správcem), `steward-slow` i Vlkov (Úloha 13b).
- `restingCrafters` dá rýžovníkovi, šperkaři a mincíři `resting` (domácnost pracuje se vsí) a `workCrafts` je vynechá ze všech větví – Úlohy 4 a 5 to nahradí. Žádná nová dílna nesmí skončit ve větvi hrnčíře – ani ve webu: `workshopOutputKg` dá dílnám zlata 0 kg, `workshopSmokes` – rýžovník nekouří (jako uhlíř), šperkař a mincovna při `producing` ano (výheň, pec – jako kovárna), `workshopDetails` bez zásoby výrobku a pokrytí, když `CRAFT_LOOKS[craft].product` chybí.
- `BUILD_COSTS` += `panner`, `jeweller`, `minter` (`workshopBuildCost`). Web texty: řemeslník „Rýžovník“ / „Šperkař“ / „Mincíř“, dílna „rýžovníkova zemnice“ / „šperkařská dílna“ / „mincovna“, práce „rýžuje zlato“ / „dělá šperky“ / „razí mince“, tvary rodiny „rýžovníkova žena, syn, dcera“ a obdobně; kronika dostavění „Dostavěli mincovnu.“ apod. podle vzoru `WORKSHOP_FINISHED`; `looks` panelu dílny pro `no-placer` a `no-gold` s ikonou `gold` (vzor `no-ore`).

- [ ] **Step 1: Testy** (`gold-crafts.test.ts`):
  - Past `else`: ves s obydlenou dílnou rýžovníka a 100 kg keramiky po 10 dnech `simulateDays` nemá víc keramiky ani `Workshop.felling` a activity ≠ `producing` (po Úloze 4 je to `no-placer` – test nesmí tvrdit `resting`); totéž šperkař a mincíř.
  - Cena: `workshopCost('panner')` = cena zemnice × 1,3 (zaokrouhleno), `workshopCost('jeweller')` = `workshopCost('smith')`; `BUILD_COSTS.minter` = `workshopBuildCost('minter')`.
  - Správce: `STEWARD_CRAFTS` = `['burner', 'potter', 'smith', 'carpenter']` a nemá nic z `GOLD_CRAFTS`; `workshopValue` všech tří dílen zlata = 0 i ve vsi s poli (fixture zlatého otisku). Zlatý otisk se správcem (`village-golden.test.ts`, v `test:slow` `village-golden-long.test.ts`), `steward-slow` a `steward-plan.test.ts` projdou **bez úpravy testu** – hlavní důkaz, že plán správce stojí.
  - Web: `workshopSmokes` rýžovníka při `producing` false, šperkaře true; `workshopDetails` dílny zlata bez zásoby výrobku a bez pokrytí.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/crafts/__tests__/gold-crafts.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces (TypeScript vyjmenuje všechny `Record<Craft, …>`, `BUILD_COSTS`, `looks` a `switch`).
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village apps/web/lib apps/web/components` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): dílny rýžovníka, šperkaře a mincovny – typy a výčty (plán 6)`.

### Task 3b: Tři dílny – zámky, stavba a tlačítka (Sonnet)

**Files:**

- Modify: `core/premium-effects.ts` (`goldPlacers`), `crafts/gold-crafts.ts` (`placerLeftG`, `workshopBlocked`, texty zámků), `core/actions.ts` (`startWorkshop` – rok mincovny), `buildings/build-intent.ts` (zámek dílny), `index.ts`
- Modify (web): `apps/web/lib/build-items.ts` (tři tlačítka; `workshop()` skládá zkratku přes `hotkeyCode`), `apps/web/lib/village-view.ts` (`buildOptions` – `blocked` z `workshopBlocked`; `workshopVariants` napřed `workshopBlocked`, pak rok varianty)
- Modify: `docs/code/village-crafts.md` (Dílny zlata – zámky), `docs/code/web-ui.md` (Katalog staveb – zkratky 3, 4, 5)
- Test: `crafts/__tests__/gold-crafts.test.ts`, testy katalogu staveb a `buildOptions` (`grep -rln "dwellingYearReason\|QUARRY_NO_ROCKS\|buildItemForKey" apps/web/lib/__tests__`)

**Interfaces:**

- Consumes: Úloha 3a, `premiumSites`, `dwellingYearReason` (vzor zámku rokem), `dateOfDayIndex`, `PANNING`, `MINT` (Úloha 1b).
- Produces:

```ts
// core/premium-effects.ts
/** Náplavy zlatonosného potoka (m, na cm) v pevném pořadí; krajina bez typu `gold-stream` []. */
export function goldPlacers(
  landscape: Landscape | null | undefined,
): readonly { x: number; z: number }[];
// crafts/gold-crafts.ts
export const PANNER_NO_PLACER = 'Bez zlatonosného náplavu';
export const PANNER_PLACERS_EMPTY = 'Náplavy jsou vyrýžované';
export const MINT_YEAR = `Od roku ${MINT.fromYear}`;
/** Zbývá na náplavu `index` (g) – `PANNING.placerG` − `goldPanned[index]`, nejméně 0. */
export function placerLeftG(state: Pick<VillageState, 'goldPanned'>, index: number): number;
/** Důvod, proč dílnu nejde postavit (gold.md – Pravidla 1 a 3), jinak null; ostatní řemesla null. */
export function workshopBlocked(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  craft: Craft,
): string | null;
```

- `workshopBlocked`: rýžovník bez náplavů `PANNER_NO_PLACER`, se všemi vyčerpanými `PANNER_PLACERS_EMPTY`; mincovna před 1. 1. `MINT.fromYear` `MINT_YEAR`. `applyBuildIntent` dílnu se zámkem odmítne `{ ok: false, reason }`; `startWorkshop` odmítne mincovnu před rokem 950 i bez krajiny (`RangeError(MINT_YEAR)`).
- Web: tlačítka `workshop('panner', 'Rýžovník', 'ryzovnik', '3')`, `workshop('jeweller', 'Šperkař', 'sperkar', '4')`, `workshop('minter', 'Mincovna', 'mincovna', '5')`; `workshop()` dnes skládá `Key${label}` – `Key3` by nefungovala, proto zkratku dá `hotkeyCode` (`Digit3`–`Digit5`; písmena dnešních dílen se nemění; volné číslice ověřit `grep -n "Digit\|hotkeyLabel" apps/web/lib/build-items.ts apps/web/lib/panel-keys.ts`). `buildOptions` dá `blocked` z `workshopBlocked` (krajinu má – `noRocks`), `workshopVariants` vrátí u každé varianty napřed důvod `workshopBlocked`, pak `dwellingYearReason` – vypletená a roubená mincovna jsou před rokem 950 zašedlé „Od roku 950“.

- [ ] **Step 1: Testy** (`gold-crafts.test.ts` a testy webu):
  - `workshopBlocked` – krajina bez typu: rýžovník `PANNER_NO_PLACER`; krajina typu `gold-stream` (`generateAcceptedLandscape(seed, undefined, 'gold-stream').landscape` – funkce vrací `{ seed, landscape }`; jednou v `beforeAll`; trvá-li víc než 10 s, test patří do `slow-tests.ts`) – `goldPlacers` dá 3–6 náplavů v pořadí `goldPlacerSites` a `workshopBlocked` null; `goldPanned` s 1 500 g na každém náplavu → `PANNER_PLACERS_EMPTY`; šperkař vždy null.
  - Mincovna: `workshopBlocked` v den 31. 12. 949 `MINT_YEAR`, 1. 1. 950 null; `startWorkshop(…, 'minter', …)` v den 31. 12. 949 vyhodí `MINT_YEAR`, 1. 1. 950 projde (`dayIndexOf`); `applyBuildIntent` s mincovnou 31. 12. 949 `{ ok: false, reason: MINT_YEAR }`.
  - Web: `buildOptions` ve vsi bez náplavu – `panner.blocked` = „Bez zlatonosného náplavu“, `minter.blocked` = „Od roku 950“ v roce 949 i u variant `vypleteny` a `srub`, `jeweller.blocked` null; katalog má tlačítka 3, 4, 5 a `buildItemForKey(key('Digit3'))?.kind` = `'panner'`, `Digit4` šperkař, `Digit5` mincovna.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/crafts/__tests__/gold-crafts.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village apps/web/lib` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): zámky a tlačítka dílen zlata (plán 6)`.

### Task 4: Rýžování (Opus)

**Files:**

- Modify: `crafts/gold-crafts.ts` (sezóna, výběr náplavu, `workPanner`), `crafts/crafts.ts` (`WorkshopDay.pan?`, `WorkshopDay.placerExhausted?`; větev rýžovníka v `workCrafts` a `restingCrafters` – parametr `landscape`, výběr náplavu), `types/types-crafts.ts` (`Workshop.placer?`), `types/types-chronicle.ts` (`placer-exhausted`), `core/simulate-work-people.ts` (předá krajinu do `restingCrafters`), `core/simulate-work-apply.ts` (`craftsDay`, kde se volá `workCrafts`) nebo `core/simulate-work.ts` – zápis kroniky
- Modify (web, aby prošel typecheck): `apps/web/lib/village-view-chronicle.ts` (věta), `apps/web/lib/village-notices.ts` (upozornění)
- Modify: `docs/code/village-crafts.md` (Dílny zlata – rýžování), `docs/code/landscape.md` (Účinky typů „hned“ – zlatonosný potok)
- Test: `crafts/__tests__/panning.test.ts` (nový), `apps/web/lib/__tests__/village-view-chronicle-gold.test.ts` (nový), `apps/web/lib/__tests__/village-notices.test.ts`

**Interfaces:**

- Consumes: `goldPlacers`, `placerLeftG`, `workshopBlocked` (Úloha 3b), `PANNING`, `workshopLabor`, `distanceFactor`, `villageRoadWalk`, `monthInWindow` nebo `dateOfDayIndex`, vzor `OreSite` a `chooseDugSite` (`Number.isFinite`, `walkM` na cm).
- Produces:

```ts
// types-crafts.ts (Workshop)
/** Rýžovník: náplav, kde rýžuje (index v `goldPlacers`) a chůze z dílny (m, na cm, vždy konečná);
 *  null = žádný dosažitelný náplav se zlatem (znovu se hledá 1. 4.); chybí = ještě nevybraný. */
placer?: { index: number; walkM: number } | null;
// crafts/crafts.ts (WorkshopDay)
pan?: { x: number; z: number }; // kde rýžovník dnes rýžoval – scéna
placerExhausted?: number;       // náplav se dnes vyčerpal – kolik náplavů se zlatem zbývá
// types-chronicle.ts
| { kind: 'placer-exhausted'; left: number }
// crafts/gold-crafts.ts
export function inPanningSeason(day: number): boolean; // měsíc v PANNING.months
/** Nejbližší náplav se zlatem s konečnou chůzí (při shodě nižší index), jinak null. */
export function choosePlacer(
  state: VillageState,
  dwelling: Dwelling,
  placers: readonly { x: number; z: number }[],
  walk?: Walk,
): { index: number; walkM: number } | null;
export interface PannerOutput {
  activity: WorkshopActivity;
  pannedG: number;
  site: { x: number; z: number } | null;
  exhaustedLeft?: number;
}
export function workPanner(
  state: VillageState,
  dwelling: Dwelling,
  labor: Pick<WorkshopLabor, 'craft' | 'skill'>,
  day: number,
  placers: readonly { x: number; z: number }[],
  walk?: Walk,
): PannerOutput;
```

- `choosePlacer` bere jen náplavy se zlatem (`placerLeftG > 0`) a jen konečnou chůzi (`Number.isFinite` – vzor `chooseDugSite`; `Infinity` by JSON uložil jako `null` a `distanceFactor(null)` = 1 – dopočet po kouscích by se rozešel s dopočtem vcelku).
- `restingCrafters(…, landscape: Landscape | null = null)`: rýžovník mimo sezónu `resting`. V sezóně, chybí-li `Workshop.placer`, vybere náplav `choosePlacer` (náplavy `goldPlacers(landscape)`, chůze `villageRoadWalk`) a uloží ho – mutuje jen `Workshop.placer`, jako `migrateBurners` před ním; bez dosažitelného náplavu se zlatem `placer: null` a `no-placer` (domácnost pracuje se vsí, práce dne nepropadne); `placer: null` se 1. 4. zahodí a vybírá znovu. Jinak pracuje.
- `workPanner`: náplav ze `Workshop.placer` (chybí-li – volání bez `restingCrafters` v testech –, vybere týmž `choosePlacer`), výkon = `labor.craft × labor.skill × PANNING.gPerManDay ÷ distanceFactor(walkM)`, nejvýš zbytek náplavu; přičte `state.gold` a `goldPanned[index]` (pole doplnit nulami do indexu), activity `producing`. Vyčerpaný náplav: `exhaustedLeft` = počet náplavů s `placerLeftG > 0`, `Workshop.placer` se smaže (další den nový výběr). `workCrafts` předá `pan` a `placerExhausted` do `WorkshopDay`, krok práce (`craftsDay` v `simulate-work-apply.ts`, nebo `simulate-work.ts`, kde se výsledek `workCrafts` zpracuje) zapíše `{ day, kind: 'placer-exhausted', left }`.
- Web: věta „Rýžovník vyrýžoval náplav. Zlato zbývá na {left} {náplavu / náplavech}.“, s `left` 0 „Rýžovník vyrýžoval poslední náplav.“; upozornění `placer-exhausted` – `tone: 'info'` „Náplav je vyrýžovaný“, s `left` 0 `tone: 'warning'` „Náplavy jsou vyrýžované“, ikona `/icons/resources/gold.png`.

- [ ] **Step 1: Testy** (`panning.test.ts`; náplavy předané přímo, bez krajiny – chůze vzdušně; dílna v (0, 0), jeden vyučený muž, `labor.craft` 1):
  - náplavy `[{ x: 100, z: 0 }, { x: 300, z: 0 }]`: 30 květnových dní → `state.gold` 30, `goldPanned` `[30]`, `Workshop.placer` `{ index: 0, walkM: 100 }`; učeň (`skill` 0,5) za týž den 0,5 g.
  - sezóna: 31. 3. a 1. 11. `restingCrafters` → `resting`, `gold` beze změny; 1. 4. a 31. 10. rýžuje.
  - okraj náplavu: `goldPanned: [1499.5]` → den dá 0,5 g, `goldPanned[0]` = 1 500, `placerExhausted` 1 a kronika `{ kind: 'placer-exhausted', left: 1 }` právě jednou; další den náplav 1 s `walkM` 300 a výkonem `1 ÷ distanceFactor(300)` (= 1 ÷ 1,2 ≈ 0,8333 g).
  - shoda vzdálenosti: náplavy `[{ x: 0, z: 200 }, { x: 200, z: 0 }]` → index 0.
  - náplav bez cesty: `walk`, který pro náplav 0 vrátí `Infinity` a pro náplav 1 300 m → `choosePlacer` vybere index 1 (`walkM` 300; po `JSON.stringify` a zpět číslo, ne `null`); všechny `Infinity` → `null`. Dílna s `placer: null` v sezóně → `restingCrafters` `no-placer` (ne práce naprázdno); 1. 4. se `placer: null` zahodí a vybírá znovu.
  - oba náplavy vyčerpané → `no-placer`, kronika `left: 0`; součet `goldPanned` = přírůstek `gold` po celou dobu testu.
  - web: obě věty a obě upozornění, žádná „0“.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/crafts/__tests__/panning.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village apps/web/lib` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): rýžovník rýžuje zlato na náplavech (plán 6)`.

### Task 5: Šperkař a mincovna ve vsi (Sonnet)

**Files:**

- Create: `trade/jewellery.ts`
- Modify: `crafts/gold-crafts.ts` (`workJeweller`, `workMinter`), `crafts/crafts.ts` (větve v `workCrafts` a `restingCrafters`), `core/summary.ts` (`WaresView.jewelleryG?`), `index.ts`
- Modify: `docs/code/village-crafts.md` (Dílny zlata – šperkař, mincovna)
- Test: `trade/__tests__/jewellery.test.ts` (nový), `crafts/__tests__/jeweller-mint.test.ts` (nový)

**Interfaces:**

- Consumes: `GOLD`, `JEWELLER`, `MINT`, `addGood`, `workshopLabor`, Úlohy 3a a 3b.
- Produces:

```ts
// trade/jewellery.ts
/** Kov vsi pro šperkaře (g): celé gramy zlata + mince × `GOLD.coinGrams`. */
export function jewelleryMaterialG(state: Pick<VillageState, 'gold' | 'coins'>): number;
/** Použitelná kapacita výhody (g): min(`jewelleryG`, kov vsi). */
export function jewelleryOf(state: Pick<VillageState, 'gold' | 'coins' | 'jewelleryG'>): number;
/** Ubere kapacitu (mutuje stav); nula pole smaže. */
export function useJewellery(state: VillageState, grams: number): void;
/** Přidá kapacitu (návrat výpravy; mutuje stav), nejvýš do kovu vsi. */
export function addJewellery(state: VillageState, grams: number): void;
// crafts/gold-crafts.ts
export function workJeweller(
  state: VillageState,
  labor: Pick<WorkshopLabor, 'craft' | 'skill'>,
): { activity: WorkshopActivity; wroughtG: number };
export function workMinter(
  state: VillageState,
  labor: Pick<WorkshopLabor, 'craft' | 'skill'>,
  day: number,
): { activity: WorkshopActivity; mintedCoins: number };
// core/summary.ts (WaresView)
jewelleryG?: number; // jewelleryOf vsi, celé gramy, jen kladné
```

- Šperkař: `jewelleryG += min(labor.craft × skill × JEWELLER.gPerManDay, kov − jewelleryG)`; `restingCrafters`: kov 0 → `no-gold`, `jewelleryG` ≥ kov → `resting`. Mincíř: `n = floor(min(gold + EPSILON, labor.craft × skill × MINT.gPerManDay))` gramů → `addGood(gold, −n)` (šum pod nulou pole smaže – Úloha 1b), `addGood(coins, n ÷ coinGrams)`; `restingCrafters`: méně než gram zlata → `no-gold`. Kov pro šperkaře se ražbou nemění. Požár beze změny (Rozhodnutí 5).

- [ ] **Step 1: Testy:**
  - `jewellery.test.ts`: `gold: 10.6`, `coins: 5`, `jewelleryG: 20` → kov 15, `jewelleryOf` 15; `useJewellery(state, 20)` pole smaže; `addJewellery` při kovu 15 a `jewelleryG` 10 o 8 → 15; `waresView` vsi s `jewelleryG` 30, 10 g zlata a 5 mincemi má `jewelleryG` 15.
  - `jeweller-mint.test.ts`: šperkař (1 vyučený muž, `labor.craft` 1) se zlatem 10 g a 5 mincemi – po 1 dni `jewelleryG` 1,5, po 10 dnech 15 a 11. den `resting`; ves bez zlata a mincí `no-gold`. Mincíř (mincovna postavená 1. 1. 950) se zlatem 450,6 g – den 1: mince +200, zlato 250,6; den 2: +200, 50,6; den 3: +50, 0,6; den 4 `no-gold`; mince + zlato se ražbou nezmění (kov pro šperkaře 450 ve všech dnech). Zlato 0,9999999999 g → ražba 1 g, pole `gold` chybí (žádná záporná zásoba), mince +1.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/crafts/__tests__/jeweller-mint.test.ts packages/game/src/domain/village/trade/__tests__/jewellery.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): šperkař zpracovává kov, mincovna razí zlato (plán 6)`.

### Task 6a: Zlato v mincovní fázi – kupci a výměna u hostitele (Opus)

**Files:**

- Modify: `trade/market-coins.ts` (cena zlata, výměna `exchangesGold`, C a W bez zlata), `trade/market.ts` (`coinPhase` – `hostGold`, výměna, start fáze i jen kvůli výměně), `rules/rules-merchants.ts` (`MERCHANTS.wants.gold`)
- Modify (web): `apps/web/lib/village-view-chronicle.ts` (věta příjezdu kupců – „kupují zlato, med, vosk, kožešiny a otroky“)
- Modify: `docs/code/village-trade.md` (Zlato – výměna u hostitele, Cizí kupci ve vsi – zlato)
- Test: `trade/__tests__/market-gold.test.ts` (nový), `trade/__tests__/market-merchants.test.ts` a `trade/__tests__/market-merchants-slaves.test.ts` (seznam kupců), `trade/__tests__/market-coins.test.ts` (beze změny)

**Interfaces:**

- Consumes: Úloha 1b (`GOLD_GOOD`, `goldCoinPrice`, `withoutMoney`), `coinClearing`, `coinPhase`, `armsBuyer`, `payCoins`.
- Produces:

```ts
// market-coins.ts (CoinParty)
/** Hostitel: zlato nekupců vymění 1:1 za mince ze svého měšce, po vlastním seznamu od kupců. */
exchangesGold?: true;
// rules-merchants.ts
wants: { gold: 1_000, honey: 100, wax: 24, furs: 60, slaves: 10 }
```

- **Cena zlata** pro každou dvojici `goldCoinPrice()` (dvě ceny se šperkařem přidá Úloha 6b).
- **Pořadí:** kupci; pak hostitel – napřed seznam od kupců (`fromMerchants`, zbroj), potom výměna (`exchangesGold`: od nekupců jen zlato, nejvýš měšec); pak výpravy. **C a W** (`coinsAgainstGoods`) zlato vynechají – seznam strany jen se zlatem do C nepatří.
- `coinPhase`: hostitel dostane `stock` + `hostGold` (celé gramy `state.gold`), `coins` = mince vsi a `exchangesGold`, když nějaká výprava (ne kupec) nabízí aspoň gram zlata; fáze se spustí i jen kvůli výměně (hostitel má minci a výprava gram). Zápočty zlato nevidí (Úloha 1b).

- [ ] **Step 1: Testy** (`market-gold.test.ts` – `coinClearing` přímo, hladina 1, pak `marketDay`):
  - kupec (měšec 60, seznam `{ gold: 1000 }`) a výprava E s 50 g → kupec koupí 50 g za 50 mincí.
  - hostitel se 100 g, kupec s měšcem 60 → kupec koupí 60 g za 60 mincí, hostitelovi zbude 40 g.
  - hostitel se 150 mincemi, objednávkou `{ swords: 1 }`, kupec s 2 meči a prázdným měšcem, E se 100 g → hostitel koupí meč za 120, pak vymění 30 g za 30 mincí; E má 30 mincí a 70 g, hostitel 0 mincí a 30 g.
  - jen výměna: hostitel s 20 mincemi, E s 30 g, žádný kupec → fáze se spustí, E má 20 mincí a 10 g, hostitel 0 mincí a 20 g; `market.level` beze změny.
  - zápočet zlato nebere: E se 100 g a seznamem `{ grain: 500 }`, hostitel bez mincí nabízí obilí → E zlato nedá ani obilí nedostane, mincovní fáze se nespustí.
  - den jen se zlatem prodaným kupcům: `market.level` beze změny.
  - **trh bez zlata:** dva klony trhu s kupcem s měšcem 200 – seznam se `gold: 1000` a bez něj – po `marketDay` shodné `market.prices`, `market.level`, prodané a koupené všech stran.
  - `merchantsArrive` → `wants` kupce i `buys` zápisu `merchants-arrived` = `{ gold: 1000, honey: 100, wax: 24, furs: 60, slaves: 10 }`; web věta „Přijeli kupci z daleka – prodávají meče, kroužkové košile a helmy, kupují zlato, med, vosk, kožešiny a otroky.“
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-gold.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces; testy plánů 4 a 5 se seznamem kupců upravit (Global Constraints).
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village/trade apps/web/lib` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): zlato za mince na trhu – kupci a výměna u hostitele (plán 6)`.

### Task 6b: Šperkař v mincovní fázi a zbroj zlatem (Opus)

**Files:**

- Modify: `trade/market-coins.ts` (dvě ceny zlata, `jewelledPayment`, rozpočet košíku, `jewelleryUsed`, doplatek zlatem), `trade/market.ts` (`coinPhase` – kapacity stran, `useJewellery`, zlato hostitele za zbroj), `trade/arms-order.ts` (`armsBuyer` s kapacitou a zlatem), `types/types-market.ts` (`MarketVisitor.jewelleryG?` – jen typ)
- Modify: `docs/code/village-trade.md` (Mince a zbroj – výhoda šperkaře a zbroj zlatem, Zlato – cena se šperkařem)
- Test: `trade/__tests__/market-jeweller.test.ts` (nový), `trade/__tests__/arms-order.test.ts`, `trade/__tests__/market-gold.test.ts` a `trade/__tests__/market-coins.test.ts` (beze změny – `jewelleryUsed` je volitelné a chybí, když nikdo kapacitu nepoužil)

**Interfaces:**

- Consumes: Úlohy 5 a 6a (`jewelleryOf`, `useJewellery`, `exchangesGold`, `hostGold`), `armsBuyer`, `payCoins`.
- Produces:

```ts
// market-coins.ts (CoinParty)
/** Kapacita šperkaře strany (g): zlato prodá dráž, mince i zlato platí víc (gold.md – Pravidla 4). */
jewelleryG?: number;
/** Celé gramy zlata, kterými strana doplatí po mincích, gram za minci – jen hostitel v kole zbroje. */
goldPurse?: number;
// CoinClearing
/** Kolik kapacity šperkaře každá strana spotřebovala (g; klíč strany), jen kladné; nikdo – chybí. */
jewelleryUsed?: Readonly<Record<string, number>>;
/** Kolik mincí zaplatí kupující s kapacitou `budget` za zboží (ne zlato) v hodnotě `bill`. */
export function jewelledPayment(bill: number, budget: number): { coins: number; used: number };
// arms-order.ts
export function armsBuyer(
  state: VillageState,
  day: number,
  visitors: readonly MarketVisitor[],
): Pick<CoinParty, 'coins' | 'goldPurse' | 'jewelleryG' | 'wants' | 'fromMerchants'> | null;
```

- **Cena zlata** pro dvojici: prodávající s kapacitou `j` a kupující bez `exchangesGold` – prvních `j` gramů za `JEWELLER.factor × goldCoinPrice()`, zbytek za `goldCoinPrice()`; kupuje-li `exchangesGold`, vždy `goldCoinPrice()`. Prodávajícímu ubude kapacita o gramy s výhodou.
- **Platba kupujícího s kapacitou** za zboží kromě zlata: `jewelledPayment(bill, j)` – `bill ≤ 1,5 j` → `bill ÷ 1,5` mincí, jinak `bill − 0,5 j`; `used` = min(placené mince, `j`). Zlato v košíku se platí bez výhody.
- **Rozpočet košíku** (`basketOf` jde v pořadí `TRADE_GOODS` – zlato je za kamenem, nástroje i keramika před ním): platba za košík = účet za zlato + `jewelledPayment(účet za ostatní zboží, j).coins` nikdy nepřeroste měšec. Zboží mimo zlato se vejde do rozpočtu `r + 0,5 × min(r, j)`, kde `r` = měšec − účet za zlato; zlato jen do mincí, které zbudou po platbě za ostatní zboží. Pojistka `Math.min(purse, ceil(bill))` zůstává jen proti šumu – podplacení schovat nesmí. Platba dvojice nahoru na celou minci (`NOISE` jako dnes), prodávající dostane, co kupující zaplatil.
- **Zbroj** (`armsBuyer`, kolo `fromMerchants`; Rozhodnutí 3): hostitel platí kupcům `jewelledPayment(účet, j)` kovu – napřed mince, zbytek celými gramy svého zlata (`goldPurse` = celé gramy `state.gold`), gram za minci; zlato kupec odveze jako koupené. Kapacita hostitele je jedna pro celou fázi (prodej zlata kupcům i zbroj). Výměna (Úloha 6a) jde až potom s tím, co zbylo.
- `coinPhase`: hostitel dostane `jewelleryG: jewelleryOf(state)`, výpravy `jewelleryG: v.jewelleryG` – pole `MarketVisitor.jewelleryG?` přidá tato úloha (typ), naplní ho až Úloha 7a. Po fázi `useJewellery(state, used.host)` a `v.jewelleryG` −= použité (nula pole smaže).

- [ ] **Step 1: Testy** (`market-jeweller.test.ts` – `coinClearing` přímo, hladina 1, pak `marketDay`):
  - E s 50 g a `jewelleryG` 20, kupec (měšec 60, `{ gold: 1000 }`) → 20 g za 30 a 30 g za 30: 60 mincí za 50 g, `jewelleryUsed.E` 20.
  - hostitel se 100 g a `jewelleryG` 30, kupec s měšcem 60 → kupec koupí 45 g za 60 mincí (30 g po 1,5 a 15 g po 1); hostitelovi zbude 55 g.
  - E se 100 mincemi a `jewelleryG` 40 koupí od hostitele 50 kg nástrojů po 2 mincích (ceny testu `{ tools: 2 }`) → zaplatí 80, hostitel dostane 80, `jewelleryUsed.E` 40.
  - **smíšený košík:** E se 100 mincemi a `jewelleryG` 100 chce od hostitele 20 kg nástrojů po 2 mincích a 100 g zlata → nástroje za 40 (26,67 mince) a zlata jen 73 g; zaplatí 100 mincí (73 + 26,67 nahoru), nikdy víc než měšec, hostitel dostane 100.
  - objednávka meče (120) u hostitele se 100 mincemi a `jewelleryG` 60 → zaplatí 90, zbude 10 mincí, `jewelleryG` vsi 0.
  - **zbroj zlatem:** hostitel s 0 mincemi, 130 g zlata a objednávkou `{ swords: 1 }`, kupec s mečem za 120 a prázdným měšcem → hostitel zaplatí 120 g, meč koupí, kupec odjede se 120 g, vsi zbude 10 g; se 40 mincemi a 100 g → 40 mincí a 80 g; s 0 mincemi, 100 g a `jewelleryG` 60 → 90 g, kapacita 0; výměna pak jen se zbylými mincemi.
  - trh bez zlata a bez šperkaře (srovnávací test Úlohy 6a) dál shodný a `jewelleryUsed` chybí.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-jeweller.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village/trade apps/web/lib` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): výhoda šperkaře na trhu a zbroj placená zlatem (plán 6)`.

### Task 7a: Šperkař na výpravě (Opus)

**Files:**

- Modify: `types/types-market.ts` (`MarketArrival.jewelleryG?`, `MarketResult.jewelleryG?`; `MarketVisitor.jewelleryG?` už je z Úlohy 6b), `trade/market-trip.ts` (`departPlanned`, `applyMarketResult`), `trade/market.ts` (`joinMarket`, `marketResult`, `departVisitors` – `origin` i se zlatem)
- Modify: `docs/code/village-trade.md` (Výprava na trh – zlato a kapacita šperkaře)
- Test: `trade/__tests__/market-gold-trips.test.ts` (nový)

**Interfaces:**

- Consumes: Úlohy 5 a 6b (`jewelleryOf`, `useJewellery`, `addJewellery`, `CoinParty.jewelleryG`).
- Produces:

```ts
/** Kapacita, kterou si výprava veze (gold.md – Pravidla 4; Rozhodnutí plánu 6, bod 6). */
export function tripJewelleryG(state: VillageState, give: TradeGoods, by?: TripBy): number;
// = vesničané 0, jinak min(jewelleryOf(state), give.coins × GOLD.coinGrams + give.gold)
```

- `departPlanned` spočítá `tripJewelleryG` ze stavu vsi **před** odečtením nákladu (po něm by `jewelleryOf` vyšlo 0), ubere kapacitu ze vsi (`useJewellery`) a zapíše `MarketArrival.jewelleryG` (jen > 0); `joinMarket` ji převezme do `MarketVisitor`, `marketResult` vrátí zbytek (`MarketResult.jewelleryG`, jen > 0; i výsledek `returned`), `applyMarketResult` ho přidá (`addJewellery`) až po přičtení vráceného a koupeného zboží. Výsledek se zlatem (bez lidí a mincí) nese `origin` jako výsledek s mincemi.

- [ ] **Step 1: Testy** (`market-gold-trips.test.ts`, vzor `market-trip` testů a `market-world.ts`):
  - ves s `jewelleryG` 50, 30 mincemi a 10 g pošle výpravu `give: { coins: 30, gold: 10 }` → příjezd nese `jewelleryG` 40, ve vsi zbude 10 (použitelných 0 – kov odešel); výprava vesničanů nenese nic.
  - na trhu výprava za 45 mincí hodnoty nástrojů zaplatí 30 mincí (kapacita 40 → použije 30, zbude 10), zlato vymění u hostitele 1:1; výsledek nese `jewelleryG` 10; doma `applyMarketResult` napřed přičte zboží (10 mincí) a pak kapacitu – uložených 10 + vrácených 10 se ořízne na kov 10, `jewelleryG` = 10.
  - hostitel zanikne před příjezdem (`returned`) → kapacita 40 se vrátí celá.
  - výsledek jen se zlatem má `origin`.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-gold-trips.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/application` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): šperkař na výpravě (plán 6)`.

### Task 7b: Zlato v poště a zaniklé vsi (Sonnet)

**Files:**

- Modify: `packages/game/src/application/village-mail.ts` (`strandedMail` – `gold`, `carriesCoins` → `carriesMoney`), `packages/game/src/application/inbox.ts` (komentáře a filtr zaniklých vsí, je-li tam), `packages/game/src/application/__tests__/in-memory-inbox.ts` (`strandedResults` – i `unsold.gold`), `trade/market-people.ts` (`receiveStranded` – zlato hostiteli, kronika), `types/types-chronicle.ts` (`newcomer.gold?`, `stranded-coins.gold?`), `packages/db/src/adapters/inbox-repository.ts` (`positive(… 'unsold'->'gold')`)
- Modify (web): `apps/web/lib/village-view-chronicle.ts` (věty se zlatem, bez „0 mincí“)
- Modify: `docs/code/village-trade.md` (Pošta mezi vsemi – zlato stejně jako mince)
- Test: testy pošty (`grep -rln "stranded-coins" packages/game/src`), `packages/db/src/adapters/__tests__/inbox-repository.db.test.ts`, `apps/web/lib/__tests__/village-view-chronicle-gold.test.ts`

**Interfaces:**

- Consumes: Úloha 7a (`origin` se zlatem), vzor mincí plánu 4 (`stranded-people.coins`).
- Produces: tělo `stranded-people` `gold?: number` (= `unsold.gold`, celé gramy); `receiveStranded` ho přičte (`addGood(state, 'gold', …)`); `ChronicleEvent` `newcomer.gold?` a `stranded-coins.gold?` (`stranded-coins.coins` smí být 0, věta pak mince vynechá); `carriesMoney(mail)` = mince nebo zlato v `unsold`.

- [ ] **Step 1: Testy:**
  - výsledek výpravy s `unsold: { gold: 40, coins: 10 }` pro zaniklou domovskou ves → hostitel dostane 40 g a 10 mincí, kronika `stranded-coins` `{ coins: 10, gold: 40 }`; jen se zlatem `{ coins: 0, gold: 40 }` a web „Ze zaniklé vsi Lhota se vrátilo 40 g zlata.“ – bez „0 mincí“; cizí správce vidí „ze sousední vsi“ (`maskVillageNames`).
  - druhý zápis téhož `ref` se zahodí (zlato se nezdvojí).
  - in-memory `strandedResults` (`in-memory-inbox.ts`) vrátí i výsledek jen se zlatem.
  - `test:db` (`inbox-repository.db.test.ts`): dotaz výsledků zaniklých vsí v `inbox-repository.ts` (ten, který dnes filtruje `unsold.coins`) vrátí i výsledek jen se zlatem.
- [ ] **Step 2: Spustit** dotčené testy – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src apps/web/lib` a `npm run test:db` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:db` a `test:slow`), commit `feat(game): zlato ze zaniklé vsi jde hostiteli stejně jako mince (plán 6)`.

### Task 8: Správce a zlato (Sonnet)

**Files:**

- Modify: `rules/rules-steward.ts` (`STEWARD.grainPayment`), `steward/steward-market.ts` (`moneyFor` místo `coinsFor`), `trade/villager-trips.ts` (`priceKg` zlata)
- Modify: `docs/code/village-steward.md` (správce na trhu – zlato po mincích a zboží)
- Test: `steward/__tests__/steward-market.test.ts`

**Interfaces:**

- Consumes: Úloha 6a (výměna u hostitele, pevná cena), `grainPayment`, `coinsFor`, `priceKg`, `fitToCrew`.
- Produces: `STEWARD.grainPayment = ['coins', 'ironBars', 'pottery', 'charcoal', 'logs', 'gold']` – zlato až na zbytek ceny (zápočet ho nevidí a výměna potřebuje mince hostitele: hned po mincích by `grainPayment()` pokrylo cenu samým zlatem a u hostitele bez mincí by výprava obilí nedostala). `moneyFor(state, day, villageId, wants): TradeGoods` – mince jako dnes `coinsFor`, chybí-li, zbytek v celých gramech zlata (gram = mince u cíle); přidá se po `fitToCrew` jako dnes mince – zlato nic neváží (Úloha 1b), nosiče nepřidá. `priceKg(state, villageId, 'gold')` (`trade/villager-trips.ts`) = `priceKg(…, COIN_GOOD) × goldCoinPrice()` – dnes by dalo `TRADE_GOOD_VALUES.gold.valueKg` bez hladiny cíle.

- [ ] **Step 1: Testy:**
  - správce s 20 mincemi a 100 g zlata, seznam za 50 mincí u cíle s hladinou 1 → `give` `{ coins: 20, gold: 30 }`; bez zlata `{ coins: 20 }` jako dnes; výprava se zlatem vyjede s týmiž nosiči jako bez něj (žádné `MARKET_NO_PEOPLE`).
  - `priceKg(…, 'gold')` u cíle s hladinou 2 = `priceKg(…, 'coins')` = 7,5.
  - obilí v nouzi: ves s 0 mincemi, 100 g zlata a 20 kg hřiven zaplatí napřed hřivnami, zlatem jen zbytek ceny, který hřivny nepokryjí; u hostitele bez mincí koupí obilí za hřivny a zlato přiveze zpět; ves bez zlata platí jako dnes.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/steward` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): správce platí i zlatem – po mincích a zboží (plán 6)`.

### Task 9: Web – dvorec a dílny zlata (Sonnet)

**Files:**

- Modify: `apps/web/components/game/hud/selection/wares.tsx` (`WaresStock` – zlato a šperky), `apps/web/lib/village-view-crafts.ts` (údaje dílen zlata), `apps/web/lib/selection-details.ts`, `apps/web/components/game/hud/selection/crafts.tsx` (panely dílen)
- Modify: `docs/code/web-ui.md` (zásoby dvorce, panel dílny)
- Test: `apps/web/lib/__tests__/village-view-crafts.test.ts` (nový), `apps/web/components/game/hud/__tests__/WaresStock.test.tsx`

**Interfaces:**

- Consumes: `WaresView.goldG` (Úloha 1b) a `WaresView.jewelleryG` (Úloha 5 – `jewelleryOf`), `Workshop.placer`, `goldPlacers`, `placerLeftG` (Úlohy 3b a 4), `jewelleryOf`, `jewelleryMaterialG` (Úloha 5).
- Produces: `VillageWorkshop.gold?` – rýžovník `{ placersLeft: number; leftG: number; walkM: number }` (zbývající náplavy se zlatem, zbytek současného náplavu a chůze, celé), šperkař `{ wroughtG: number; materialG: number }`, mincovna `{ goldG: number }`. **Zásoby dvorce** (`WaresStock`, vzor mincí – ne `ManorPanel.tsx`): `wares-gold` (ikona `gold`, „84“, `Tooltip` „Zlato – 84 g“) a `wares-jewellery` (ikona `jewellery`, `Tooltip` „Šperky – zlato a mince za 1,5násobek, ještě pro 30 g“), jen kladné – ves jen se zlatem ukáže jen zlato. Panely dílen čísly s ikonami, slova v `Tooltip` (vzor `SmithOreStats`).

- [ ] **Step 1: Testy:** pohled vsi s rýžovníkem na náplavu 1 (`goldPanned: [1500, 300]`, `walkM` 240) → `{ placersLeft: 2, leftG: 1200, walkM: 240 }` při třech náplavech; šperkař `{ wroughtG: 30, materialG: 140 }`; `WaresStock` vsi s `gold: 84.9` a `jewelleryG: 30` ukáže `wares-gold` 84 a `wares-jewellery` 30; bez zlata žádný řádek.
- [ ] **Step 2: Spustit** `npx vitest run apps/web/lib apps/web/components` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run apps/web` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(web): zlato a šperky v zásobách dvorce, panely dílen zlata (plán 6)`.

### Task 10: Web – zlato v panelu Trh (Sonnet)

**Files:**

- Modify: `apps/web/lib/market-view.ts` (cena zlata, kapacita šperkaře vsi), `apps/web/components/game/hud/MarketPanel.tsx` (zlato v „Dáš“ a „Dostaneš“, `Tooltip`), `apps/web/components/game/hud/use-market-people.ts` (jen je-li tam výčet zboží)
- Modify: `docs/code/web-ui.md` (panel Trh – zlato)
- Test: `apps/web/lib/__tests__/market-view.test.ts`, `apps/web/components/game/hud/__tests__/MarketPanel.test.tsx`

**Interfaces:**

- Consumes: Úlohy 1b, 6a, 6b a 7a (`coinPriceOf` zlata, `jewelleryOf`).
- Produces: `MarketView.jewelleryG?: number` (`jewelleryOf` vsi, celé, jen > 0); řádek zlata v „Dáš“ (nejvýš `villageGoodStock`) a „Dostaneš“, krok 10 g; cena zlata „1“ s `Tooltip` „Zlato – 1 mince za gram, vždy“ a se šperkařem „…, se šperkařem 1,5 mince za gram – ještě pro 30 g“; u mincí v „Dáš“ `Tooltip` „Se šperkařem platí 1,5násobek – ještě pro 30 g“. Náhled výpravy (`marketPreview`) dá se zlatem tytéž nosiče a důvod odmítnutí jako `checkMarketTrip`.

- [ ] **Step 1: Testy:** pohled trhu s hladinou 2,3 – cena zlata 1; s `jewelleryG` 30 a 40 mincemi `MarketView.jewelleryG` 30; panel ukáže řádek zlata v obou seznamech s krokem 10 a popisky; náhled výpravy se 200 g zlata má tytéž nosiče jako `planMarketTrip`.
- [ ] **Step 2: Spustit** `npx vitest run apps/web` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run apps/web` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(web): zlato a šperkař v panelu Trh (plán 6)`.

### Task 11: Scéna – rýžovník u náplavu a dílny zlata (Sonnet)

**Files:**

- Modify: `apps/web/lib/person-activity.ts`, `apps/web/lib/scene/villager-plan.ts` (úkol rýžování vedle `'ore'`), `apps/web/lib/scene/villager-plan-phases.ts` (role šperkaře a mincíře jako `forge` kováře – dnes pro nová řemesla `return null`), `apps/web/lib/village-view-crafts.ts` (místo rýžování do pohledu scény, je-li tam místo kopání – vzor `WorkshopDay.ore`, `grep -rn "\.ore\b\|'digging'" apps/web/lib`), `apps/web/lib/scene/workshop-layout.ts` (kontrola `CRAFT_MODEL` a přístřešků nadzemních variant)
- Modify: `docs/code/scene-village.md` (dílny – dílny zlata, rýžovník u náplavu)
- Test: unit test plánu postav (`grep -rln "ore" apps/web/lib/__tests__ | head`), snímek obrazovky na konci

**Interfaces:**

- Consumes: `WorkshopDay.pan` (Úloha 4), `CRAFT_MODEL` (Úloha 3a).
- Produces: muži dílny rýžovníka v den s `pan` stojí u náplavu s činností kopání (`'digging'`, popisek „rýžuje zlato“); šperkař a mincíř pracují v dílně jako kovář (role `forge`); nadzemní varianty dílen zlata mají přístřešek modelu `pristresek-uhlir` / `pristresek-kovar`. Babylon jen z konkrétních modulů, kreslení jen při změně.

- [ ] **Step 1: Test:** plán postav dne s `WorkshopDay` `{ craft: 'panner', pan: { x: 420, z: -80 } }` dá rýžovníkovi cíl (420, −80) a činnost kopání; bez `pan` je doma; šperkař v den `producing` má roli kováře u výhně.
- [ ] **Step 2: Spustit** `npx vitest run apps/web/lib` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** `npx vitest run apps/web` – PASS; menší snímek dev vsi s dílnou šperkaře (`/dev/buildings` nebo dev ves) na kontrolu.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(web): rýžovník u náplavu, dílny zlata ve scéně (plán 6)`.

### Task 12: E2e – dílny zlata, dvorec a Trh (Sonnet)

**Files:**

- Create: `apps/web/e2e/gold.spec.ts`
- Modify: e2e, které počítají řádky „Dáš“ / „Dostaneš“ (`grep -rn "Dostaneš\|market-give\|market-want" apps/web/e2e`), `docs/code/web-ui.md` (e2e)
- Test: `apps/web/e2e/gold.spec.ts` a upravené spec

**Interfaces:**

- Consumes: Úlohy 3b a 9–11; vzor úpravy stavu vsi v DB z `market.spec.ts`.

- [ ] **Step 1: E2e** (`gold.spec.ts`): dev ves (bez zlatonosného potoka) – tlačítko 3 zašedlé s důvodem „Bez zlatonosného náplavu“, tlačítko 5 „Od roku 950“ (herní rok světa e2e ověřit v konfiguraci `apps/web/e2e`; je-li po roce 950, test tvrdí, že tlačítko 5 zašedlé není), šperkař (4) dostupný; ves s `gold: 84` a `jewelleryG: 30` v DB – zásoby dvorce ukážou `wares-gold` „84“ a `wares-jewellery`; panel Trh má řádek zlata v „Dáš“ s krokem 10.
- [ ] **Step 2: Spustit** sériově `npm run test:e2e -- gold.spec.ts market.spec.ts` (předtím `pgrep -f "[p]laywright test"` prázdné) – PASS.
- [ ] **Step 3: Mapa kódu**, kontroly, commit `test(web): e2e dílen zlata, dvorce a Trhu (plán 6)`.

### Task 13a: Test světa – tři roky zlata (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/__tests__/market-gold-years.test.ts` (pomalý – zapsat do `packages/game/slow-tests.ts`)
- Modify: `packages/game/src/application/__tests__/market-world.ts` (`goldOfWorld` vedle `coinsOfWorld`), `packages/game/slow-tests.ts`, `docs/design/gold.md` (Co se ověří – výsledek světa)
- Test: pomalý test, `npm run test:db`

**Interfaces:**

- Consumes: celý plán (Úlohy 1a–12), `coinsOfWorld`, vzor `market-merchants-years.test.ts` a `market-slaves-years.test.ts`, `generateAcceptedLandscape(seed, undefined, 'gold-stream').landscape` (funkce vrací `{ seed, landscape }`).
- Produces: `goldOfWorld(world): Promise<number>` – zlato ve vsích, nákladech výprav, výsledcích na cestě a u kupců (koupené nebo za zbroj do odjezdu).

- [ ] **Step 1: Pomalý test dvou vsí a kupců** (`market-gold-years.test.ts`), od 1. 3. 949 do 31. 12. 951 po dnech, pošta po každém dni:
  - **G** na krajině typu `gold-stream` (3–6 náplavů): dílna rýžovníka obydlená mužem 30 let se synem 14 let a dílna šperkaře s mužem 35 let (vložené jako obydlené dílny), 20 t obilí navíc; 1. 1. 950 vložená obydlená mincovna. První den kupců každého herního roku pošle do T výpravu hráče se vším zlatem a mincemi a seznamem `{ swords: 1 }`, třetí den kupců výpravu s mincemi a seznamem `{ tools: 20 }`.
  - **T** na stezce (jedna zastávka z `trailStops`, 20 t obilí navíc, G v okolí).
  - Test tvrdí po každém dni: `goldOfWorld` = začátek + vyrýžované (přírůstek Σ `goldPanned`) − vyražené − zlato, se kterým kupci odjeli; `coinsOfWorld` se mění jen příjezdem a odjezdem kupců jako v plánu 4 a ražbou (+ vyražené); `goldPanned[i]` ≤ `PANNING.placerG` a od listopadu do března se nemění; použitelná kapacita šperkaře G ≤ kov G a kapacita každé výpravy ≤ mince + zlato jejího nákladu při odjezdu; žádné `NaN`, záporná zásoba ani smrt hladem; dopočet obou vsí po 90 dnech dá týž stav jako vcelku.
  - Kontrolní běh bez mincovny (jinak stejný). Do zprávy (bez prahu): zlato vyrýžované a vyražené za každý rok, zlato, mince a kapacita šperkaře G na konci roku, co G koupila (meče, nástroje) a za kolik mincí, kolik zlata prodala kupcům a kolik vyměnila u hostitele, hladina trhu T na konci roku s mincovnou a bez ní (`gold.md` – Co se ověří: inflace z mincovny).
- [ ] **Step 2: Spustit** `nice -n 19 npm run test:slow` – PASS (selže-li podmínka, nehrát si s čísly – zapsat do zprávy a ozvat se); `npm run test:db`, kontroly.
- [ ] **Step 3: Commit** `test(game): tři roky rýžování, šperkaře, mincovny a kupců (plán 6)`.

### Task 13b: Přepočet Vlkova (Opus)

**Files:**

- Modify: `docs/design/gold.md` (Co se ověří – Vlkov)
- Test: přepočet Vlkova z databáze `bohemia` (postup Úlohy 15 plánu 4 – `docs/superpowers/plans/2026-11-25-markets-4-merchants-coins.md`), `nice -n 19 npm run test:slow`

**Interfaces:**

- Consumes: Úloha 13a, sonda Vlkova plánů 1–5.

- [ ] **Step 1: Vlkov** (`gold.md` – Co se ověří): přepočet vsi Vlkov z databáze `bohemia` (jen ke čtení, sonda plánů 1–5) 10 let po dnech – Vlkov nemá zlatonosný potok ani dílny zlata: **stav bit po bitu týž** jako na `feat/landscape` (otisk stavu všech dní a konečný stav – i plán a stavby správce; rozdíl je chyba), kodek bez rozdílu.
- [ ] **Step 2: Druhý běh** s uměle přidanou zastávkou kupců (jako plány 4 a 5), vloženou obydlenou dílnou šperkaře a objednávkou jednoho meče: kdy a za kolik mincí ves meč koupí proti běhu bez šperkaře – výsledek tabulkou do `gold.md`.
- [ ] **Step 3: Spustit** `nice -n 19 npm run test:slow` – PASS (selže-li podmínka, nehrát si s čísly – zapsat do zprávy a ozvat se), kontroly.
- [ ] **Step 4: Commit** `test(game): přepočet Vlkova – bez zlata beze změny, meč se šperkařem (plán 6)`.

### Task 14: Návrhy, celé e2e a dokumenty (Sonnet)

**Files:**

- Modify:
  - `docs/design/gold.md` – oddíl „Rozhodnutí plánu 6 (návrh Clauda, 26. 11. 2026)“: body 1–14 zkráceně, čísla (gram mince, 1 g za člověkoden – herní číslo, náplav 1,5 kg, duben–říjen, šperkař 1,5 g a 1,5×, mincovna od 950 a 200 g, kupci 1 000 g), Oznámit; stav „Plán 6 hotový“ v hlavičce (Co se ověří doplnily Úlohy 13a a 13b),
  - `docs/design/markets.md` – **Pravidla 6** (kupci kupují i zlato, výměna u hostitele, zbroj i zlatem) s odkazem na `gold.md` – Rozhodnutí plánu 6; **Rozhodnutí plánu 4 se nepřepisují** (historie); Navazuje a Splněno („plán 6 splnil zlato“), `docs/design/crafts.md` (Budovy – dílny zlata, odkaz na `gold.md`), `docs/design/premium-landscapes.md` (Zlatonosný potok – rýžování hotové, čísla a křivka „málo kovu, ale brzy“ k pozdější kalibraci), `docs/design/landscape.md` (náplav – vyrýžovaný zůstává v krajině),
  - `CLAUDE.md` – řádky `village-crafts.md` (dílny zlata), `village-trade.md` (zlato na trhu, šperkař) a `landscape.md` (zlatonosný potok rýžuje) v tabulce mapy kódu; mapy kódu dopsané předchozími úlohami zkontrolovat.
- Test: `npm run test:db`, celé e2e

- [ ] **Step 1: Návrhy** podle Files – Martinova slova s datem, vlastní rozhodnutí „návrh Clauda“; `grep -rn "koordin\|za Martina" docs/design` nic nového.
- [ ] **Step 2: Spustit** `npm run check:docs`, `npm run format:check`, `npm run test:db`, celé e2e sériově `npm run test:e2e` (předtím `pgrep -f "[p]laywright test"` prázdné), kontroly. Selže-li celé e2e, ozvat se – v dokumentační úloze nic neopravovat.
- [ ] **Step 3: Commit** `docs: zlato a klenoty – rýžovník, šperkař a mincovna (plán 6)`.

## Oznámit Martinovi (návrhy Clauda, které mění pravidla)

1. **Mince váží gram:** gram zlata je jedna mince, tedy 15 kg obilí (herní mince odpovídá pražskému denáru kolem roku 965, ≈ 1 g). Podle „1:1 váhově“ je zlato ve hře zhruba dvanáctkrát levnější než ve skutečnosti, kde stálo tolikrát víc než stříbro denárů (Rozhodnutí 1).
2. **Rýžovník rýžuje od dubna do října** gram zlata denně (učeň půl gramu; herní číslo – víc, než by dal potok podle českých sejpů), na nejbližším náplavu, ke kterému se dojde; náplav má 1,5 kg a nedoplňuje se. Mapa se 3–6 náplavy má 4,5–9 kg zlata – rýžovník se synem ji vyrýžuje zhruba za 15–30 let, pak dílna stojí (bez náplavu se rýžovník ani postavit nedá). V zimě a ve žních pracuje se vsí (Rozhodnutí 4).
3. **Zlato se mění za mince, ne za zboží:** na trhu stojí vždy minci za gram a se zbožím se za ně nečtou zápočty. Kupují ho cizí kupci, výpravy, které ho mají v „Dostaneš“, a **každá ves, která má mince – svými mincemi 1:1** (Martin 22. 11. 2026: „s kýmkoliv, kdo ty mince má“; `gold.md` – Pravidla 2). Výměna u hostitele je kov za kov: ves nic nekupuje a její hodnota se nemění, takže „Mince utrácí jen vojvoda/správce“ (25. 11. 2026) dál platí pro zboží; šperkař při výměně nezdraží. Objednaná zbroj má přednost a hostitel ji kupcům doplatí i zlatem, gram za minci – výměna zlata v jiné dny ho tak o objednaný meč nepřipraví. **Kde nikdo nemá mince** (do roku 950 skoro všude kromě vsí u stezky a jejich okolí), zlato nic nekoupí – ani zápočtem (Rozhodnutí 2 a 3).
4. **Kupci kupují zlato první** (jako v Martinově výčtu), ale měšec 60 mincí se nemění (ověřená čísla plánu 4) – za průjezd koupí nejvýš 60 g zlata, šperků 40 g. Hlavní odbyt zlata tak bude výměna ve vsích, kde se mince nahromadily (vsi u stezky), a od roku 950 vlastní mincovna (Rozhodnutí 8).
5. **Šperkař zpracuje 1,5 g zlata nebo mincí denně** do kapacity výhody: se šperky stojí prodané zlato kupujícího 1,5 mince za gram a mince při placení platí za 1,5 – prodávající dostane o třetinu mincí méně, než je cena (stejně zlato, kterým ves doplatí objednanou zbroj). Kapacita platí i na výpravách (vezou si ji a nepoužitou přivezou), ubývá s použitím a nikdy nepřeroste zlato a mince vsi. Výměna zlata u hostitele i nákup zlata jsou bez výhody (Rozhodnutí 5 a 6).
6. **Mincovna od roku 950 razí samo všechno zlato vsi** (200 g denně) – hráč ji jen postaví; vlastní mince se pak utrácejí jako ostatní a zvedají ceny tam, kde je ves utratí (Rozhodnutí 7; výsledek inflace – Co se ověří).
7. **Dílny zlata zatím vypadají jako dnešní dílny:** rýžovník jako uhlířova zemnice, šperkař a mincovna jako kovárna (liší se ikonou a panelem); rýžovník při práci stojí u náplavu. Vlastní modely by byly další úloha, až je Martin bude chtít (Rozhodnutí 11).
8. **Správce platí i zlatem – až nakonec:** obilí v nouzi platí napřed mincemi a zbožím jako dnes (hřivny, keramika, uhlí, klády), zlatem jen zbytek – u hostitele bez mincí by zlato obilí nekoupilo; na roční výpravu přidá zlato, chybí-li mince. Dílny zlata sám nestaví – zatím neumí spočítat, co mu dílna zlata vynese (`workshopValue` jí dá 0), to přijde později; šperkař a mincovna v jeho vsi pracují samy (Rozhodnutí 10).
9. **Zlato je mezi vsemi jako mince:** jde jen poštou; zanikne-li ves, které výprava nese zlato, dostane ho hostitel; odejde-li celá ves, bere si zlato i šperky, syn a část lidí je nechají (Rozhodnutí 9).
10. **Hostitel zaniklé domovské vsi dostane všechno zlato výpravy** (`unsold.gold + bought.gold`) – peníze nemizí (návrh Clauda z provádění).
11. **Kapacita kupujícího se šperkařem** = kov, který za zboží opravdu odešel, včetně zaokrouhlení na celou minci.
12. **Hladina trhu se počítá jen z mincí:** platí-li ves zbroj zlatem, může hladina klesnout.
13. **Mincovna 200 g denně je opatrné číslo** (rešerše ≈ 100 ks za hodinu z jiné doby, bez přípravy střížků) – dá se zvýšit.

## Otázky na Martina

Z provádění (obecná pravidla mimo plán 6, úlohy 13a a 13b; `gold.md` – Otevřené / Pro Martina): řemeslník, který si vezme vdovu držící dvorec, se přestěhuje do dvorce a dílna zůstane prázdná (`weddingHome`); osamělý řemeslník po rozpadu domácnosti (≥ 45 let) dílnu opustí (`dissolveHouseholds`).

Žádné otevřené. Všechna pravidla, která plán potřebuje, má `gold.md` (Martinova rozhodnutí 22. 11. 2026 a schválená Pravidla 1–5); čísla a podrobnosti, které návrh nechává na staviteli, rozhoduje plán jako návrh Clauda a oznamuje je výše. Odchylka, kterou by Martin mohl chtít jinak, je bod Oznámit 3 (ves svými mincemi zlato vymění) – vyplývá z jeho „s kýmkoliv, kdo ty mince má“.

## Rizika plánu

- **Malý měšec kupců** (Oznámit 4): zlato se ke kupcům dostane pomalu a hlavně výměnou ve vsích s mincemi; ves bez stezky a bez mincí v okolí má do roku 950 zlato skoro k ničemu. Větší měšec by změnil ověřená čísla plánu 4.
- **`coinClearing` je složitější** (dvě ceny zlata, sleva kupujícího, výměna hostitele, zbroj zlatem, dvě kola hostitele): trh bez zlata a bez šperkaře musí zůstat bit po bitu – hlídá srovnávací test Úlohy 6a (znovu v 6b) a zlaté otisky. Rozpočet smíšeného košíku (zlato i zboží) počítá výhodu jen za zboží mimo zlato – jinak by pojistka `Math.min(purse, …)` schovala podplacení (Úloha 6b).
- **Výhoda šperkaře platí i proti ceně:** prodávající neprodá pod cenou – kromě kupujícího se šperkařem (Martinovo pravidlo). Ceny dne a hladina to nevidí; v okolí vsi se šperkařem tak prodávající dostávají méně mincí, než ukazuje cena.
- **Kde TypeScript mlčí:** `workCrafts` posílá neznámé řemeslo k hrnčíři a `restingCrafters` zná jen vyjmenovaná řemesla (Úloha 3a, test), ve webu totéž `workshopOutputKg`, `workshopSmokes` a `workshopDetails`; plán správce by s novým řemeslem v `CRAFTS` změnil každou ves se správcem (`STEWARD_CRAFTS`); smyčky zápočtu přes `TRADE_GOODS` zlato vidět nesmějí (`withoutMoney`), mincovní fáze ano (`coinPhaseStock`); chybějící `gold` je 0.
- **Krajina zlatonosného potoka v testech** (Úlohy 3b a 13a) se generuje prémiovým průchodem – pomalé; jednotkové testy rýžování proto berou náplavy jako vstup (`workPanner(…, placers)`).
- **Čísla bez kalibrace:** výkon rýžovníka, zásoba náplavu a kapacita šperkaře jsou herní čísla (návrh Clauda) – rýžovník dá víc, než by dal potok podle českých sejpů (rešerše Úlohy 1a); vyrovnání výhody typu krajiny s ostatními (premium-landscapes.md – Kalibrace) přijde s měřením typů, které plán nedělá.
- **Modely dílen zlata jsou sdílené** (Oznámit 7) – Martin to uvidí při vizuální kontrole.
