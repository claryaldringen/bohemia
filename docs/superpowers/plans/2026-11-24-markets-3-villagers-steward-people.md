# Obchod 3 – vesničané a správce na trhu, zakázky, lidé a sňatky se sousedy – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vesničané a správce jezdí sami na trh do skutečných sousedních vsí (nástroje, keramika, dřevěné nářadí, vozy, osivo, hřivny na kování vozu, obilí v nouzi), řemeslník bere zakázky od kohokoli, kovář souseda přijde okovat koně a lidé se stěhují a berou mezi skutečnými vsemi – přes poštu z plánu 2, aniž by kdo vznikl nebo zmizel (issue #11, plán 3 ze 6).

**Architecture:**

- **Okolí vsi** (`VillageState.nearby`): vsi na 8 sousedních mapách a ves sama (id a jméno pro klíč výpravy). Zapíše ho událost schránky `nearby`, kterou posílá worker (`refreshNearby`). **Bez okolí se nic z plánu 3 nespustí** – Vlkov i zlaté otisky simulují beze změny.
- **Každé zboží a každý člověk jde mezi vsemi výpravou na trh z plánu 2** (`departMarket`, `market-arrive`, `market-result`, odchozí schránka, `deliverVillageMail`, zaniklý hostitel, výprava po termínu). Nový je jen náklad výpravy (lidé `MarketPerson`, nevěsta či ženich `MarketArrival.kin`, kování `MarketArrival.service`) a tři zprávy bez nákladu: dotaz na partnera `kin-ask`, dotaz na kováře `smith-ask` a hotová zakázka `order-ready`.
- Rozhodnutí vesničanů, správce, sňatků a kování jsou **kroky dne simulace** – jen ze stavu vsi a událostí schránky dne, náhoda z vlastních proudů (`'kin:' + den`). Dopočet po kouscích dá týž výsledek.
- **Zakázky** drží hostitel (`market.orders`), kupující si pamatuje své (`VillageState.orders`). Řemeslník vyrábí do vlastní potřeby a otevřených zakázek; hotovou zakázku ohlásí zprávou a kupující si pro ni dojede.

**Tech Stack:** TypeScript 6 (strict), `packages/game` (doména, use-casy, Vitest), `packages/server`, `apps/web` (Next.js 16, React 19), Playwright (projekty chromium a worker).

**Spec:**

- `docs/design/markets.md` – závazný (schváleno Martinem 22. 11. 2026): Martinova rozhodnutí (i Spodní a Horní cena z 23. 11.), Pravidla 2, 3, 8 a 9, Rozhodnutí plánu 1 (body 1, 6, 8) a plánu 2 (celé), Nechává se na stavitele.
- `docs/design/neighbours.md` – Martinova rozhodnutí (Sňatky, Řemeslníci souseda, Sousedé i vsi jiných hráčů), Pravidla 1 (kdo je soused) a 6–8 jako podklad.
- Plán 1 `docs/superpowers/plans/2026-11-23-markets-1-real-neighbours.md` – Rozhodnutí 1 (tabulka „Vrátí se – 3“), 6 (další manželky). Plán 2 `docs/superpowers/plans/2026-11-23-markets-2-market-without-coins.md` a jeho kód.
- Martin k řemeslům a koním: wagons.md – Kování vozů (20. 10. 2026: „Pokud vesnice nemá kováře, musí tesař (nebo jeho syn, pokud ho má) dojít do nejbližší vesnice, kde kovář je“), horses.md – Kování (26. 10. 2026: „To obstará ideálně kovář ve vsi, případně kovář z jiné vsi, ale bude to násobně dražší, protože musí přijít.“; 27. 10.: „každý kovář musí fyzicky dojít do té ohrady“; 14. 11.: „Kovář z Lhoty okul koně“), lord.md – Manželky a `history/lord-history.md` – Další manželky mužů rodu z okolí, kinship.md – Sňatky (Martin 19. 10. 2026: „hlavně k vdově nebo dceři z domu bez mužů“).
- Mapa kódu: `docs/code/village-trade.md` (Trh – ceny a zápočet, co ves nabízí a shání, Trh ve vsi, Výprava na trh, Pošta mezi vsemi, Lidé – koho ves dá), `village-crafts.md` (Nákup u sousedů, Kování vozů, Kovář), `village-people.md` (Manželky, Sňatky), `village-livestock.md` (kování koní), `village-steward.md`, `world.md` (Schránka vsi), `worker.md` (Pošta mezi vsemi).
- Kód smazaný plánem 1 je k nahlédnutí v `b4f8dadc` (`git show b4f8dadc:<cesta>`): `crafts/craft-buying.ts` (`planPurchases`, `yearlySaving`, `withToolCoverage`, `pay`), `crafts/purchase-carts.ts` (`cartValueKg`), `fields/seed-buying.ts` (`buySeed`), `steward/steward-needs.ts` (`grainStep`), `people/marriage.ts` (`outsideMarriages`, `favouredBride`, `crowded`), `livestock/horse-shoeing.ts` (cizí kovář), `rules/rules-*.ts`.

## Global Constraints

- **Předpoklad:** plán 2 je sloučený ve `feat/landscape`. Musí platit (`grep -rnw <jméno> packages apps`): `departMarket`, `joinMarket`, `marketDay`, `marketResult`, `applyMarketResult`, `marketStance`, `marketFreeAdults`, `deliverVillageMail`, `VillageMail`, `VillageState.outbox`, `VillageState.news`, `marketOverview`; neexistuje `outsideMarriages`, `startPurchases`, `buySeed`, `grainStep`, `favouredBride`, `MARRIAGE.outside`. Jinak Úlohu 1 nezačínat a ozvat se. Práce běží ve větvi `feat/markets-3` z `feat/landscape`.
- **Martin, 22. 11. 2026:**
  - Vesničané na trh pro nástroje, keramiku a osivo: „Ano“; „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“.
  - „se sousedy je na náhodě, ze které dostupně vsi ženich nebo nevěsta bude“; „Řemeslníkovi je jedno, kdo mu platí za výrobky“.
  - Zápočet bez mincí („ANo, přesně tak“), hostitel podle výpočtu potřeby („ano“), výprava jen se seznamem za cenu dne („ok“). Platí dál beze změny.
- **Mimo plán 3:** kupci a mince (plán 4), otroci (plán 5), zlato, šperkař a mincovna (plán 6). Trh zůstává řídký – hostitel prodá jen za to, co shání (plán 2, Rozhodnutí 4).
- **Žádná pravidla navíc:** žádné cenové meze, minimální zásoby, nové suroviny ani pohodlné rozkazy. Nová čísla jsou jen ta, která plán jmenuje v Rozhodnutích, každé s odkazem. Technické meze (obnova okolí) jsou v kódu use-casu s poznámkou „technická mez, ne pravidlo“ jako `MAIL_ATTEMPTS`.
- **Nikdo nevznikne ani nezmizí:** člověk je vždy právě na jednom místě – v `people` vsi, v nákladu výpravy (odchozí schránka, schránka cíle, `market.visitors`) nebo ve výsledku na cestě domů. Odchod zapíše `removePeople` (do `emigrants`), příchod `rehomePeople` (nová místní id), návrat domů vrátí původní id (`restorePeople`). Žádné `nextId++` pro člověka zvenku.
- **Hexagon:** doména a use-casy bez infrastruktury. Web i worker volají stejné use-casy. **Žádná herní logika ve webu** – web jen ukazuje a posílá záměry.
- **Determinismus:** bez `Math.random`, `Date.now()` a `new Date()`. Rozhodnutí dne jen ze stavu vsi a událostí schránky toho dne; náhoda z vlastního proudu (`deriveSeed(state.seed, 'kin:' + day)`), nikdy z proudu jiného kroku.
- **Čísla pravidel** jen v `rules*.ts` s odkazem „markets.md – Rozhodnutí plánu 3, bod N“ (obnovená čísla i s původním odkazem a datem). Do textu návrhů je zapíše Úloha 12.
- **Stav vsi:** nové části jsou volitelné (`nearby`, `orders`, `market.orders`, `shoeing.asked`, náklady výpravy, nová pole kroniky). Chybějící = prázdné, převod se nepřidává a `VILLAGE_MIGRATIONS` zůstává beze změny (jako plán 2). Kodek se nemění, DB migrace není.
- **Zlaté otisky se nesmí změnit:** ves bez okolí simuluje bit po bitu stejně. Selže-li `*golden*.test.ts`, je to chyba úlohy.
- **Pasti z plánu 2:**
  - stav po předchozích úlohách ověř `grep -rnw` dřív, než na něj navážeš,
  - testy tvrdí skutečné hodnoty (kg, kusy, id, den), ne jen „něco se stalo“,
  - volné lidi počítá jen `marketFreeAdults`,
  - kusové zboží (dobytek, koně, vozy, lidé) jen celé,
  - cizí správce nevidí ostatní vsi držitele (Úloha 11).
- **Rozhraní jako v 0 A.D.:** ikony a čísla, slova jen v `Tooltip` a kronice.
- **Kontroly na konci každé úlohy:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:docs` a `nice -n 19 npm run test`. Úlohy 2–9 navíc `nice -n 19 npm run test:slow`, Úlohy 1 a 10 `npm run test:db`. E2e jen kde to úloha říká, sériově: `pgrep -f "[p]laywright test"` předtím nesmí nic vrátit.
- **`docs/code/`:** úloha, která přidá nebo přejmenuje jméno, opraví v téže úloze mapu kódu (jinak padne `check:docs`). Návrhy v `docs/design/` až v Úloze 12.
- **Jazyk a zápis:** česky komentáře i docs, krátká pomlčka „–“. Vlastní rozhodnutí jsou „návrh Clauda“, Martinova slova s datem. Commity Conventional Commits česky, `Refs #11`, na konci `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Agenti:** žádní subagenti, žádné `sleep` v popředí, `pkill`, `rm -rf`, `git stash` ani `git branch -D`. Neslučovat, nepushovat. Nejvýš ≈ 150 kroků na úlohu. DB `bohemia` jen ke čtení.

## Rozhodnutí plánu (návrh Clauda)

1. **Okolí vsi.** Simulace vsi nezná ostatní vsi ani své id, a vesničané se přitom musí rozhodovat uvnitř dne (jinak by výsledek závisel na kouscích dopočtu). Proto:
   - `VillageState.nearby` = `{ day, self: { villageId, name }, villages: NearbyVillage[] }`, `NearbyVillage` = `{ villageId, name, cells, firstStep }`.
   - Obsah: jen vsi na **8 sousedních mapách** (neighbours.md – Pravidla 1: soused je ves na sousední mapě, i jiného hráče – Martin), žijící, se sídlem, ne přes odříznutí nováčka (`crossesIsolation`). Válka nevadí (plán 2, Rozhodnutí 1). Vzdálenější vsi z přehledu hráče (vsi rodu, znalost mapy, zprávy) do okolí nepatří – vesničané jezdí k sousedům, hráč smí dál.
   - Zapisuje ho událost schránky `nearby` (`applyNearby`). Pošle ji `refreshNearby` – worker po dopočtu vsi tam, kde doručuje poštu, když okolí chybí nebo je starší než `NEARBY_REFRESH_DAYS = 30` dní (technická mez, ne pravidlo – jak rychle se ves dozví o nové vsi za kopcem). Den události = `lastDay + 1`, `ref` = `nearby:<ves>:<den>` – druhý zápis téhož dne se zahodí.
   - Srovnání: cesta přes `news` by vesničanům nedala žádný cíl, dokud hráč nepošle výpravu; rozhodnutí mimo simulaci (use-case po dopočtu) by porušilo determinismus.
2. **Co ves ví o řemeslech sousedů:** jen ze zpráv na pivo (`news`, plán 2 – Rozhodnutí 7), stejně jako hráč. Zprávu přinese každá výprava – i výprava vesničanů, správce, nevěsty či kováře. Dotazy `kin-ask` a `smith-ask` nesou zprávu o vsi, která se ptá (posel „zašel na pivo“). Ves bez zprávy o řemeslníkovi k němu nejede – osivo, obilí a sňatky zprávu nepotřebují, takže se vsi časem poznají samy.
3. **Všechno jede výpravou na trh** (plán 2, Rozhodnutí 1 – karavana a schránka vsi). Výsledek každé výpravy se vrátí domovské vsi, takže zaniklý hostitel a výprava po termínu mají hotové řešení z plánu 2, i pro lidi:

   | Co                              | Kdo posílá                               | Náklad výpravy                        | U hostitele                           |
   | ------------------------------- | ---------------------------------------- | ------------------------------------- | ------------------------------------- |
   | výrobky, vozy, osivo, hřivny    | vesničané (bod 7)                        | platba `give`, seznam `wants`         | zápočet (plán 2)                      |
   | obilí v nouzi, potřeba vsi      | správce (bod 8)                          | `give` / `wants` z výpočtu potřeby    | zápočet                               |
   | kování koní                     | ves kováře na dotaz `smith-ask` (bod 9)  | hřivny kováře, `service`              | kování a poplatek v `bought` výpravy  |
   | lidé (výměna, noví osadníci)    | hráč, správce (bod 10)                   | lidé `MarketPerson` jako zboží        | zápočet, prodaní se usadí             |
   | nevěsta, ženich, další manželka | ves partnera na dotaz `kin-ask` (bod 11) | partner s dětmi `MarketPerson`, `kin` | svatba hned po příjezdu, mimo zápočet |

   Doprovod je aspoň 1 nosič (`marketCrew`), kovář jde sám (bod 9). Dotaz a ohlášení zakázky jsou zprávy bez nákladu, cestu posla nikdo neplatí prací (jako odeslání pošty v plánu 2).

4. **Výrobky dílen a lidé jako zboží trhu.** „Jen společné suroviny“ (Martin 19. 10. 2026) platí – každá ves je má. Hodnoty v kg obilí (`TRADE_GOOD_VALUES`), cena v mincích z nich kurzem `MARKET.grainKgPerCoin` jako u ostatního zboží:

   | Zboží                                       | Jednotka | Hodnota  | Odkud číslo                                                         |
   | ------------------------------------------- | -------- | -------- | ------------------------------------------------------------------- |
   | `tools` – nástroje (do vybavení domácností) | kg       | 60       | dřív `CRAFT_BUYING.toolsValueKg` (rešerše 2026-10-18)               |
   | `woodTools` – dřevěné nářadí                | kg       | 2        | dřív `CRAFT_BUYING.woodToolsValueKg`                                |
   | `twoWheelCarts`, `fourWheelCarts` – vozy    | kus      | 320, 640 | dřív `cartValueKg` (práce tesaře, klády, kování)                    |
   | `men`, `women` – svobodný dospělý           | kus      | 360      | dřív výměna lidí („dospělý 360 kg obilí“)                           |
   | `families` – rodina                         | kus      | 720      | dva dospělí, děti v ceně (návrh Clauda – trh zná jednu cenu za kus) |

   Keramika, hřivny a uhlí už zbožím jsou. Kusové jsou vozy a lidé (`PIECE_GOODS`). Koupený vůz táhnou domů voli, kteří s výpravou jdou – kolik jich je třeba, spočítá z vozů v seznamu `checkMarketTrip` (`MarketTrip.oxen`; dřív „koupený vůz voli dovedou domů“).

5. **Co hostitel nabízí a shání** (plán 2, Rozhodnutí 5 – rozšíření o výrobky a lidi):

   | Zboží                      | Nabízí                                              | Shání (jen bez vlastního pracujícího řemeslníka)               |
   | -------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
   | `tools`                    | vybavení nad `toolNeedKg`                           | `toolNeedKg − vybavení`                                        |
   | `pottery`, `woodTools`     | zásoba nad `craftTargets`                           | `craftTargets − zásoba`                                        |
   | `ironBars`                 | zásoba nad `smithBarsTargetKg`                      | hřivny na vozy čekající na kování (`ironOrderBarsKg − zásoba`) |
   | vozy                       | volné vozy nad vozy, které ves chce (`cartsWanted`) | `missingCart` → 1 vůz toho druhu                               |
   | `men`, `women`, `families` | `peopleSpare` (dávky – výhled přebytku lidí)        | `peopleWanted` – obráceně: půdy víc než práce (bod 10)         |

   Jídlo (maso, sýr, luštěniny) se do nabídky hostitele nepřidává – pravidlo 9 ho nejmenuje a výpočet potřeby jako u dávek pro něj není; plán 2 ho sliboval, je to odvolané (návrh Clauda).

6. **Zakázky** („Řemeslníkovi je jedno, kdo mu platí za výrobky“). Bez mincí nejde platit předem – zápočet nezná dluh (plán 2, Rozhodnutí 4). Proto:
   - Když výprava odjíždí s nekoupeným výrobkem dílny (`ORDER_GOODS`: nástroje, keramika, dřevěné nářadí, hřivny, vozy) a hostitel má pracujícího řemeslníka toho řemesla **a shání něco, co výprava ještě veze**, hostitel zapíše zakázku `CraftOrder` (ves, zboží, množství, den). Novější zakázka téže vsi na totéž zboží tu starou nahradí.
   - Řemeslník vyrábí do vlastní potřeby **plus otevřené zakázky** (`orderTargets`). Hotové kusy jsou na prodej komukoli – kdo dřív zaplatí, ten má.
   - Jakmile zásoba nad vlastní potřebou pokryje zakázku, hostitel pošle `order-ready` (jednou – `readyDay`). Prodej kupujícímu zakázku zmenší. Zakázka vyprší po `MARKET.orderDays = 365` dnech (vesničané jezdí jednou ročně).
   - Kupující si pamatuje své zakázky (`VillageState.orders`: `open`, `ready`, `refused`) z výsledku výpravy (`MarketResult.ordered`). Pro výrobek s otevřenou zakázkou nejede, na hotovou jede hned, u vsi, která zakázku nevzala (`refused`), ho rok nehledá.
7. **Vesničané na trhu** (pravidlo 9: „když se jim to vyplatí“ – dnešní rozhodování nákupu u sousedů). Krok dne `villagerTripsDay`, jen s okolím, jedna výprava na cíl a den:
   - **15. 11.** (`CRAFT_BUYING.day`, dřívější den nákupu): nástroje, keramika, dřevěné nářadí a vůz – port `planPurchases` z `b4f8dadc`. Cíl je nejbližší ves okolí, o jejímž řemeslníkovi ves ví ze zprávy (`nearestWith`). Cena je cena trhu ze zprávy (jinak výchozí) × `MARKET.grainKgPerCoin`. Platí se z `paymentPool`, náklad je práce platby a nosičů (nosiči × dny pryč). Koupí se jen to, co ušetří víc práce, než stojí.
   - **1. 9. a 1. 3.** (dřívější `SEED_BUYING.days`): osivo, které chybí (`seedShortKg` ≥ `SEED_MARKET.minKg` 5 kg), v nejbližší vsi okolí. Platí se hřivnami a krávami nad ty, které ves drží, nejvýš `SEED_MARKET.maxCows` = 1 (dřívější `buySeed`).
   - **Kdykoli:** vůz čeká na kování a ves nemá pracujícího kováře → tesař jde pro hřivny do nejbližší vsi s kovářem (Martin 20. 10. 2026). Hřivny doma vůz dokončí (`cartIronDay` krok 2 beze změny).
   - **Hotová zakázka** (`order-ready`) → druhý den výprava pro ni.
   - Pobyt 1 den, posádka `marketCrew`, odchod jen přes `departMarket` (kontroly `checkMarketTrip`, volní lidé `marketFreeAdults`). Neprojde-li kontrola, ves nejede.
8. **Správce na trhu** – jen zapnutý správce (`state.steward`), stejnou akcí jako hráč (`departMarket`):
   - **Obilí v nouzi** v den správce: port `grainStep` (`b4f8dadc`). Chybí-li aspoň `STEWARD.grainMinKg` (`TRADE.porterKg`) a nic jeho není na cestě, pošle výpravu do nejbližší vsi okolí. Platí zbožím `STEWARD.grainPayment` (hřivny, keramika, uhlí, klády) do hodnoty chybějícího obilí, nosičů nejvýš `STEWARD.grainPorterShare` 0,5 dospělých.
   - **Potřeba vsi** jednou ročně 15. 11. (s vesničany): `give` = nabídka, `wants` = co ves shání (`marketStance` vlastní vsi), když shání něco. Cíl se střídá po letech (`nearby.villages[rok % počet]`, okolí řazené podle `cells`, pak `villageId`), ať správce okolí pozná. Bez paměti navíc.
9. **Kovář souseda ke koním** (Martin: „kovář z jiné vsi … násobně dražší, protože musí přijít“; „musí fyzicky dojít do té ohrady“):
   - Ves s koňmi po termínu bez vlastního kováře pošle `smith-ask` nejbližší vsi okolí, kde je podle zprávy kovář. Dotaz čeká (`shoeing.asked.untilDay`), nový jde až po něm.
   - Ves kováře dotaz přijme, když kovář pracuje, je doma a hřivny vsi stačí na koně (0,5 kg na koně, `HORSE_SHOEING.ironBarsKg`) nad její rezervu na vlastní kování (`shoeingBarsKg`). Pak kovář vyrazí jako výprava (`answerSmithAsk`): hřivny v `give`, `service` = kování, bez nosičů. Kovář je pryč (`Person.away`, druh `'craft'`) po dny cesty, takže kovárna ty dny nekuje.
   - U koní kovář kuje hned po příjezdu (`serveShoeing`): termín se posune, kronika „Kovář z <ves> okul koně“. Ves zaplatí poplatek z `paymentPool` i z pojistky (dřívější návrh Clauda „cizí kovář platí i z pojistky“): (0,5 čd × koně + dny cesty tam a zpět + 1) × `HORSE_SHOEING.foreignDayKg` = 4 kg obilí (den řemeslníka jako u ceny vozu) + hodnota hřiven. Hřivny i poplatek jdou výsledkem domů. Nepotřebuje-li ves už kování, kovář nic nebere a hřivny vrátí.
10. **Lidé na trhu – výměna lidí a noví osadníci** (dřívější výměna lidí, Martin 19. 10. 2026: „celé rodiny i jen dospělí“, „muži a ženy zvlášť“):
    - Kdo smí odejít, vybírá `emigrantGroups` (beze změny – ne dvorec, dědic, rozpad domácnosti, muži rodu a jejich ženy). Při odjezdu konkrétní lidé odejdou ze vsi (`removePeople`) jako náklad `MarketPerson` { `good`, `people` }.
    - Prodaní lidé se usadí u kupce (hostitel hned `settlePeople`, výprava je odveze domů). Neprodaní se vrátí s výsledkem a dostanou zpět svá id (`restorePeople`).
    - Hostitel shání lidi obráceně k `peopleSpare`: když je půdy víc než práce (`landHa > laborHa` ve výhledu správce), shání `ceil(dospělí × (landHa ÷ laborHa − 1))` dospělých jako rodiny (dva dospělí na rodinu, nahoru). Vesničané lidi neprodávají ani nekupují – jen hráč a správce.
11. **Sňatky se skutečnými sousedy** (Martin: „na náhodě, ze které dostupně vsi ženich nebo nevěsta bude“). Ves bez okolí jako dnes – jen ve vsi.
    - **Kdo se ptá:** svobodný od `MARRIAGE.neighbours.fromAge` 18 let, který ve vsi nemá s kým (`bestMatch` nic). Muž s denní šancí z `bridePerYear` 0,3 ročně. Žena jen „vdova nebo dcera z domu bez mužů“ (Martin 19. 10. 2026; `favouredBride` – vdova, dědička, dům bez muže od 16) se šancí z `favouredGroomPerYear` 0,5. Ne v hladu, ne do přeplněného domu, pod pojistkou zásob menší šance (`weddingChancePerDay`) – vše jako dřív `outsideMarriages`.
    - **Kam:** náhodná ves okolí (los z proudu `'kin:' + den`), zpráva `kin-ask` s popisem hledajícího.
    - **Kdo přijde:** ves partnera vybere svobodného opačného pohlaví bez protějšku ve vsi, ve věkovém rozdílu (`maxAgeGap`), nejbližšího věkem, při shodě nižší id, bez losu. Ne muže rodu ani jeho ženu (`keptByLine`), ne „vdovu, dědičku ani ženu z domu bez mužů“ a jen když se domácnost odchodem nerozpadne (`householdBreaksUp`). Partner (vdova i s dětmi do 16) jede výpravou `kin` ke hledajícímu. Ve své vsi „se vdala pryč“ / „přiženil se pryč“.
    - **Pohyb jen jedním směrem – partner jde za hledajícím.** Nevěsta jde k muži, ženich k vdově či dědičce, jako `weddingHome` ve vsi. Žena bez domu se nevdává sama – odejde, když se na ni zeptá muž odjinud.
    - **Po příjezdu** (`receiveKin`): žije-li hledající a je pořád svobodný, je svatba; jinak partner zůstane jako svobodný nováček (`newcomerHome`). Nikdo se nevrací – kdo přišel, už je ve vsi. Hledající odpověď neeviduje, vzácnou druhou odpověď vyřeší totéž pravidlo.
    - Žádná odpověď = nikdo nepřijde, hledající se může zeptat znovu dalším losem.
12. **Další manželky mužů rodu (2.–4.) se vracejí ze skutečných sousedních vsí** (plán 1, Rozhodnutí 6: „do plánu 3 nepřibývají“; lord-history.md – dřívější pravidlo). Muž rodu od 18 let s 1–3 žijícími manželkami se ptá se šancí `MARRIAGE.neighbours.extraWifePerYear` 0,3 ročně. Partnerka je žena `brideAge` 16–22 let bez protějšku ve své vsi. Ves tak nebere ženy mužům vsi – důvod, proč lord.md bralo další manželky „z okolí“. Přijde vždy do domu muže, i do přeplněného; nejvýš `LORD.maxWives` = 4 žijící. V hladu se neptá.
13. **Oběh mezi vsemi:**
    - Výpravy jdou poštou z plánu 2 beze změny. Výsledek nese i lidi (`MarketResult.people`) – neprodané a koupené.
    - Zaniklý hostitel vrátí výpravu se vším, co drží, i s lidmi (`marketResult(…, { returned: true })`). Domovská ves je usadí s jejich původními id (`restorePeople`).
    - Zprávy bez nákladu (`kin-ask`, `smith-ask`, `order-ready`) do vsi, která chybí nebo spí (`asleep` v otisku), se zahodí – nikdo nikam nejde.
    - `ref`: dotaz `kin:<ves>:<den>:<id hledajícího>:ask`, `smith:<ves>:<den>:ask`; ohlášení `order:<hostitel>:<kupec>:<zboží>:<den>`. Výpravy dál `market:<ves>:<id>` (`…:in`, `…:out`). Klíče dotazů jsou ze dne a id – bez počítadla ve stavu.
14. **Rozhraní:** panel Trh ukáže nové zboží (nástroje, dřevěné nářadí, vozy, muži, ženy, rodiny) s ikonami, které hra už má. Kronika a upozornění řeknou, kdo a kam jel:
    - „Vesničané jeli na trh do …“, „Správce poslal výpravu do …“,
    - „Nevěsta z <ves>“, „Ženich z <ves>“, „Dcera se vdala do <ves>“, „Syn se přiženil do <ves>“,
    - „Kovář z <ves> okul koně“, „Kovář šel kovat koně do <ves>“,
    - „Do vsi přišla rodina z <ves>“, „Zakázka v <ves> je hotová“.
    - Panel ohrady koní řekne v Tooltip, kdo kuje. Řádek výrobků ve dvorci ukáže zakázku („Nástroje – zakázka v Lhotě“).
    - Cizí správce v kronice a upozorněních nevidí jména ostatních vsí držitele – web místo nich napíše „sousední ves“ (stejná množina jako `marketOverview` pro něj).
15. **Převod stavu:** žádný (Global Constraints). Dřívější druhy kroniky (`bride-from-outside`, `groom-from-outside`, `married-away`, `extra-wife`, `newcomer`, `horses-shod`) dostanou volitelné `villageName` – staré záznamy bez něj se čtou jako dřív.
16. **Co se z plánu 1 vrací:**

    | Plán 1 – konec                                            | Plán 3                                                    |
    | --------------------------------------------------------- | --------------------------------------------------------- |
    | výprava správce za obilím (`grainStep`)                   | bod 8, Úloha 6                                            |
    | nákup nástrojů, keramiky, dřevěného nářadí a vozů 15. 11. | body 4–7, Úlohy 2–5                                       |
    | nákup osiva 1. 9. a 1. 3.                                 | bod 7, Úloha 5                                            |
    | kování vozů u kováře souseda                              | bod 7 (tesař pro hřivny), Úloha 5                         |
    | cizí kovář ke koním                                       | bod 9, Úloha 7                                            |
    | nevěsta a ženich z okolí, vdát se pryč                    | bod 11, Úloha 9                                           |
    | další manželky mužů rodu                                  | bod 12, Úloha 9                                           |
    | výměna lidí, noví osadníci                                | bod 10, Úloha 8                                           |
    | hřivny jako platba                                        | hřivny jsou zboží trhu (plán 2) a platba za osivo a obilí |

17. **Pořadí úloh:**
    - 1 – okolí,
    - 2–4 – zboží dílen, vozy a zakázky (hostitel),
    - 5–6 – vesničané a správce (domovská ves),
    - 7 – kovář,
    - 8–9 – lidé a sňatky,
    - 10 – pošta a svět,
    - 11 – web,
    - 12 – návrhy a ověření.

    Úlohy 2–4 mění tytéž soubory trhu, proto jdou po sobě. 5 potřebuje 2–4, 7–9 potřebují 1, 11 všechny.

## Review Focus

1. **Lidé na cestě a cílová ves zanikne** (vymře, opustí se, Začít znovu archivuje sídlo, ves chybí) před příjezdem nebo během pobytu – nevěsta, prodaná rodina, kovář:
   - vrátí se domů se svými původními id a vazbami na rodiče,
   - nikdo se nezdvojí ani nezmizí.

   Test v Úlohách 8 a 10.

2. **Partner dorazí, ale hledající už není svobodný** (vzal si někoho ve vsi, zemřel, odešel, přišla druhá odpověď):
   - partner zůstane ve vsi jako svobodný nováček s domem,
   - nikdo se nevrací ani nezmizí.

   Test v Úloze 9.

3. **Zakázka, kterou nikdo nevyzvedne nebo nesplní** (kupující ves zanikla, řemeslník zemřel, dílna bez vstupů):
   - řemeslník přestane vyrábět navíc nejpozději po `MARKET.orderDays`,
   - kupující nejede znovu pro tutéž věc, dokud zakázka platí.

   Test v Úlohách 4 a 5.

4. **Kovář souseda nemůže, nebo už není třeba** (nemá hřivny, je pryč, dotaz přišel spící vsi; ves s koňmi mezitím okoval vlastní kovář nebo koně nemá):
   - nic se nezaplatí, hřivny se vrátí,
   - nový dotaz až po `shoeing.asked.untilDay`.

   Test v Úlohách 7 a 10.

5. **Ves bez okolí** (Vlkov, nová ves před prvním během workeru, odříznutý nováček):
   - simuluje bit po bitu jako dnes – žádný dotaz, výprava ani zakázka,
   - zlaté otisky beze změny.

   Test v Úlohách 1, 5 a 9.

## Mapa souborů

Složka `packages/game/src/domain/village/`, není-li uvedeno jinak.

| Úloha | Soubory                                                                                                                                                                                                                                                        | Co                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1     | `trade/nearby.ts` (nový), `types/types-market.ts`, `types/types-state.ts`, `core/inbox.ts`, `application/nearby.ts` (nový), `application/market.ts` (export `villagesAt`), `application/advance-world.ts`, `advance-dynasty.ts`, `dynasty-for-village.ts`      | okolí vsi                |
| 2     | `types/types-trade.ts`, `trade/goods.ts`, `trade/trade.ts`, `trade/market-stance.ts`, `rules/rules-trade.ts`, `apps/web/lib/trade-names.ts`                                                                                                                    | výrobky dílen jako zboží |
| 3     | `trade/goods.ts`, `trade/trade.ts`, `trade/market-stance.ts`, `trade/market-trip.ts`, `crafts/carts.ts`, `types/types-market.ts`, `rules/rules-trade.ts`, `apps/web/lib/trade-names.ts`                                                                        | vozy na trhu             |
| 4     | `trade/craft-orders.ts` (nový), `trade/market.ts`, `trade/market-trip.ts`, `crafts/crafts.ts`, `crafts/carpentry.ts`, `core/inbox.ts`, `types/types-market.ts`, `types/types-state.ts`, `rules/rules-market.ts`                                                | zakázky                  |
| 5     | `trade/villager-trips.ts` (nový), `crafts/craft-buying.ts`, `core/simulate.ts`, `rules/rules-crafts.ts`, `rules/rules-fields.ts`, `types/types-chronicle.ts`                                                                                                   | vesničané na trhu        |
| 6     | `steward/steward-market.ts` (nový), `steward/steward-needs.ts`, `rules/rules-steward.ts`                                                                                                                                                                       | správce na trhu          |
| 7     | `livestock/smith-visit.ts` (nový), `livestock/horse-shoeing.ts`, `trade/market.ts`, `core/inbox.ts`, `core/simulate.ts`, `types/types-people.ts`, `types/types-market.ts`, `rules/rules-livestock.ts`, `crafts/craft-buying.ts` (`paymentPool`)                | kovář souseda            |
| 8     | `trade/market-people.ts` (nový), `trade/market.ts`, `trade/market-trip.ts`, `trade/market-stance.ts`, `trade/goods.ts`, `trade/trade.ts`, `domain/vassalage/spare.ts` (export `peopleSpare`), `types/*`, `rules/rules-trade.ts`, `apps/web/lib/trade-names.ts` | lidé na trhu             |
| 9     | `people/kin-match.ts` (nový), `people/marriage.ts`, `trade/market.ts`, `core/inbox.ts`, `core/simulate.ts`, `rules/rules-people.ts`, `rules/rules-lord.ts`, `types/*`                                                                                          | sňatky a další manželky  |
| 10    | `application/village-mail.ts`, `application/__tests__/market-world.ts`, `village-mail.test.ts`, `advance-world.test.ts`                                                                                                                                        | pošta a svět             |
| 11    | `apps/web/lib/village-view-chronicle.ts`, `village-notices.ts`, `horse-view.ts`, `village-view-crafts.ts`, `market-view.ts`, `components/game/hud/MarketPanel.tsx`, `apps/web/e2e/market.spec.ts`                                                              | web                      |
| 12    | `docs/design/markets.md`, `neighbours.md`, `kinship.md`, `lord.md`, `horses.md`, `wagons.md`, `crafts.md`, `steward.md`, `trade.md`                                                                                                                            | návrhy, ověření          |

Mapa kódu (`docs/code/*.md`) a testy, které úloha mění, jsou v jejích Files.

---

### Task 1: Okolí vsi (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/nearby.ts`, `packages/game/src/application/nearby.ts`
- Modify: `types/types-market.ts` (`NearbyVillage`, `VillageNearby`), `types/types-state.ts` (`nearby?`), `core/inbox.ts` (událost `nearby`), `application/market.ts` (export `villagesAt` beze změny chování), `application/advance-world.ts`, `application/advance-dynasty.ts`, `application/dynasty-for-village.ts`, `application/index.ts`
- Modify: `docs/code/village-trade.md` (nový odstavec „Okolí vsi“), `docs/code/worker.md` (Pošta mezi vsemi – obnova okolí), `docs/code/village-core.md` (Schránka vsi – druh `nearby`)
- Test: `domain/village/trade/__tests__/nearby.test.ts`, `application/__tests__/nearby.test.ts`, `application/__tests__/advance-world.test.ts`

**Interfaces:**

- Consumes: `VillageNews`, `MarketTarget`, `marketTravelDays` (plán 2), `villagesAt`, `stepToward`, `placeOf`, `crossesIsolation`, `sleeps` (application), `rememberNews` (`trade/market.ts`).
- Produces:

```ts
// types/types-market.ts
export interface NearbyVillage {
  villageId: string;
  name: string;
  cells: number;
  firstStep: Direction8;
}
export interface VillageNearby {
  /** Den, kdy ves okolí dostala (událost `nearby`). */
  day: number;
  self: { villageId: string; name: string };
  /** Vsi na 8 sousedních mapách, řazené podle `cells`, pak `villageId`. */
  villages: NearbyVillage[];
}
// core/inbox.ts – VillageEventBody += { kind: 'nearby'; nearby: VillageNearby }
// trade/nearby.ts
export function applyNearby(
  state: VillageState,
  day: number,
  nearby: VillageNearby,
): ChronicleEvent[]; // zapíše { ...nearby, day }, kronika nic
export function nearbyTarget(state: VillageState, villageId: string): MarketTarget | null; // home z `self`; mimo okolí null
export function nearestNearby(state: VillageState): NearbyVillage | null; // první z `villages`
export function nearestWith(state: VillageState, craft: Craft): NearbyVillage | null; // první, jejíž `news` má `report.crafts` s řemeslem
// application/nearby.ts
export const NEARBY_REFRESH_DAYS = 30; // technická mez, ne pravidlo
export type NearbyDeps = Pick<MarketDeps, 'villages' | 'settlements'>;
export function nearbyStale(state: VillageState): boolean; // chybí, nebo lastDay − nearby.day ≥ NEARBY_REFRESH_DAYS
export async function nearbyVillages(
  deps: NearbyDeps,
  villageId: string,
): Promise<VillageNearby | null>; // day = lastDay + 1
export async function refreshNearby(deps: NearbyDeps, villageId: string): Promise<boolean>; // true = zapsáno
export async function refreshNearbySafely(deps: NearbyDeps, villageId: string): Promise<boolean>; // chyba do logu, false
```

`nearbyVillages`: sídla na 8 sousedních políčkách (`villagesAt`, i vsi vlastního hráče), bez spících (`sleeps`), bez archivovaných (`placeOf` null) a přes odříznutí (`crossesIsolation`). `cells` = vzdálenost políček jako v `marketOverview`, `firstStep` = `stepToward`, `self.name` = jméno záznamu vsi. Spící nebo odříznutá ves sama nedostane nic (null). `refreshNearby` zapíše `inbox.post({ villageId, day: lastDay + 1, ref: 'nearby:' + villageId + ':' + (lastDay + 1), body: { kind: 'nearby', nearby } })`.

- [ ] **Step 1: Testy jádra** (`nearby.test.ts`, přípravky `market-fixtures.ts`):
  - `advanceVillage(homeVillage(), D + 1, null, null, [událost nearby na D + 1])` → `state.nearby` je přesně odeslaný objekt s `day = D + 1`; druhá událost na D + 2 ho nahradí.
  - `nearestWith(state, 'smith')`: okolí A (`cells` 1, zpráva bez kováře), B (`cells` 1, zpráva s kovářem), C (`cells` 2, s kovářem) → B; bez zpráv → null; `nearestNearby` → A.
  - `nearbyTarget(state, 'B')` → `{ villageId: 'B', name, cells: 1, firstStep, homeVillageId: self.villageId, homeName: self.name }`; `nearbyTarget(state, 'X')` → null; bez okolí null.
  - Determinismus s okolím: ves s událostí `nearby` na D + 5 dopočtená o 30 dní vcelku a po kouscích (10 + 20) dá shodný stav (`toEqual`). Ves bez okolí hlídají zlaté otisky.
- [ ] **Step 2: Testy use-casu** (`application/__tests__/nearby.test.ts`, svět `marketWorld()` – H a M na sousedních mapách):
  - `refreshNearby(H)` → `inbox.pending(H)` má jednu událost `nearby` s `villages = [{ villageId: M, name: 'M…', cells: 1, firstStep }]` a `self = { villageId: H, name }`; druhé volání týž den vrátí false (stejný `ref`).
  - M vymřelá (`extinctDay`) → okolí H je prázdné; nováček přes odříznutí (`crossesIsolation`) → prázdné.
  - `nearbyStale`: bez okolí true, `lastDay − day` = 29 false, 30 true.
  - `advance-world.test.ts`: kolo `advancePlayer` hráče H po dopočtu zapíše `nearby` (i když ves dopočítal web – `stamp.lastDay >= to`), podruhé už ne, dokud okolí nezestárne.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/nearby.test.ts packages/game/src/application/__tests__/nearby.test.ts packages/game/src/application/__tests__/advance-world.test.ts` – FAIL.
- [ ] **Step 4: Implementovat** typy, `applyNearby` (větev `applyEvent`), `trade/nearby.ts`, `application/nearby.ts`. Worker: v `advancePlayer` ve stejném `tryRun` jako pošta (`deliverVillageMailSafely`) – po doručení `if (nearbyStale(village.state)) await refreshNearbySafely(deps, id)`, i ve větvi `stamp.lastDay >= to` (ves se načte jen kvůli otisku – použij `villages.find`). Totéž v `advanceDynasty` a `dynastyForVillage` u celých vsí.
- [ ] **Step 5: Spustit** testy ze Step 3 – PASS; `npm run test:db`.
- [ ] **Step 6: Mapa kódu**, kontroly z Global Constraints, commit `feat(game): okolí vsi – sousední vsi ve stavu vsi (plán 3)`.

### Task 2: Výrobky dílen jako zboží trhu (Opus)

**Files:**

- Modify: `types/types-trade.ts` (`TradeGood` += `'tools' | 'woodTools'`), `trade/goods.ts` (`TRADE_GOODS` – za `pottery`), `rules/rules-trade.ts` (`TRADE_GOOD_VALUES.tools` 60, `woodTools` 2 – komentář s původem z `b4f8dadc` `CRAFT_BUYING`), `trade/trade.ts` (`villageGoodStock`, `addGood`), `trade/market-stance.ts`, `apps/web/lib/trade-names.ts` (název a ikona – ikony nástrojů a dřevěného nářadí z lišty či panelu dílny)
- Modify: `docs/code/village-trade.md` (Trh – co ves nabízí a shání; Kůže… – seznam zboží)
- Test: `trade/__tests__/market-stance.test.ts`, `trade/__tests__/trade.test.ts` (nebo kde jsou testy `villageGoodStock`), `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: `toolEquipmentKg`, `toolNeedKg` (`crafts/iron.ts`), `craftTargets`, `craftStocks`, `smithBarsTargetKg`, `ironOrderBarsKg` (`crafts/crafts.ts`), `ownCraftsmanWorks`, `PRODUCT_CRAFT` (`crafts/craft-buying.ts`).
- Produces:
  - `villageGoodStock(state, 'tools', day)` = `toolEquipmentKg(state)`, `'woodTools'` = `crafts.woodToolsKg ?? 0`.
  - `addGood(state, 'tools', kg, day)` mění `toolEquipmentKg` (koupené nástroje jdou rovnou do vybavení, prodané z něj), `'woodTools'` mění `crafts.woodToolsKg` (nikdy pod 0).
  - `marketStance` navíc podle Rozhodnutí 5 – nabídka a sháňka výrobků:

    ```ts
    // jen dílny – bez vlastního pracujícího řemeslníka ves shání do potřeby, nad potřebu nabízí
    give('tools', toolEquipmentKg(state) - toolNeedKg(state, day));
    give('pottery', stocks.potteryKg - targets.potteryKg);
    give('woodTools', (stocks.woodToolsKg ?? 0) - targets.woodToolsKg);
    give('ironBars', ironBarsKg(state) - smithBarsTargetKg(state, day));
    if (!ownCraftsmanWorks(state, 'smith'))
      want('tools', toolNeedKg(state, day) - toolEquipmentKg(state));
    if (!ownCraftsmanWorks(state, 'potter')) want('pottery', targets.potteryKg - stocks.potteryKg);
    if (!ownCraftsmanWorks(state, 'carpenter'))
      want('woodTools', targets.woodToolsKg - (stocks.woodToolsKg ?? 0));
    if (!ownCraftsmanWorks(state, 'smith'))
      want('ironBars', ironOrderBarsKg(state) - ironBarsKg(state));
    ```

    (`targets = craftTargets(state, day)`, `stocks = craftStocks(state)`; `give` už ořízne na `villageGoodStock` a záporné nezapíše.)

- [ ] **Step 1: Testy:**
  - `market-stance.test.ts` – ves s kovářem a vybavením 30 kg nad `toolNeedKg` nabízí `tools: 30` a nástroje neshání; ves bez kováře s vybavením 12 kg pod potřebou shání `tools: 12` a nenabízí; ves s hrnčířem a keramikou 8 kg nad `craftTargets` nabízí `pottery: 8`; ves bez kováře s vozem čekajícím na kování dvoukoláku (3 kg kování × `FORGE.barsKgPerKg`) a bez hřiven shání přesně `cartIronBarsKg('two-wheel')`; ves s vlastním kovářem hřivny na vůz neshání.
  - `villageGoodStock` / `addGood`: `addGood(s, 'tools', 5, D)` zvedne `toolEquipmentKg` o 5; `addGood(s, 'woodTools', -100, D)` skončí na 0.
  - `market-two-villages.test.ts` – nový případ: H bez kováře (`give: { grain: 900 }`, `wants: { tools: 10 }`), M s kovářem, nástroji nad potřebou a nedostatkem obilí. Po kole: H má o 10 kg vybavení víc, M o 10 méně, obilí M přibylo přesně o to, co H prodala (cena 60 ÷ 15 = 4 mince za kg nástrojů proti 1 ÷ 15 za kg obilí → 600 kg obilí).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces. `TRADE_GOOD_NAMES` ve webu doplnit hned (typecheck – `Record<TradeGood, …>`).
- [ ] **Step 4: Spustit** testy ze Step 2 – PASS; `nice -n 19 npm run test:slow` (zlaté otisky beze změny – stance se počítá jen v tržní den).
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): nástroje a dřevěné nářadí jako zboží trhu, výrobky v nabídce vsi (plán 3)`.

### Task 3: Vozy na trhu (Opus)

**Files:**

- Modify: `types/types-trade.ts` (`TradeGood` += `'twoWheelCarts' | 'fourWheelCarts'`), `trade/goods.ts` (`CART_GOODS`, `cartGoodKind`, `PIECE_GOODS`), `rules/rules-trade.ts` (hodnoty 320 a 640 – komentář s výpočtem dřívějšího `cartValueKg`), `crafts/carts.ts` (`cartsWanted`, `idleCartsOf`, `removeIdleCart`), `trade/trade.ts`, `trade/market-stance.ts`, `types/types-market.ts` (`MarketTrip.oxen?`), `trade/market-trip.ts` (`checkMarketTrip`, `departMarket`, `marketTripsDay`, `applyMarketResult`), `apps/web/lib/trade-names.ts`
- Modify: `docs/code/village-trade.md` (Výprava na trh – voli pro koupený vůz), `docs/code/village-crafts.md` (Tesař a vozy – vůz z trhu)
- Test: `trade/__tests__/market-trip.test.ts`, `trade/__tests__/market-stance.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: `addCart`, `missingCart`, `cartsAway`, `tradeHomeCarts`, `cartsWithOxen`, `DRAFT_OXEN` / `cartOxen`, `oxenHome` (plán 2 `planMarketTrip`).
- Produces:

```ts
export const CART_GOODS: readonly ('twoWheelCarts' | 'fourWheelCarts')[];
export function cartGoodKind(good: 'twoWheelCarts' | 'fourWheelCarts'): CartKind;
/** Kolik vozů druhu ves chce (dnešní pravidlo `missingCart` jako počet – wagons.md, Kolik vozů ves chce). */
export function cartsWanted(state: VillageState, kind: CartKind): number;
/** Vozy druhu doma, které nejsou na cestě ani u výpravy (`cartsAway`). */
export function idleCartsOf(state: VillageState, kind: CartKind): Cart[];
/** Odebere nejstarší volný vůz druhu (prodej); bez volného nic. */
export function removeIdleCart(state: VillageState, kind: CartKind): void;
/** Voli na koupené vozy ze seznamu: Σ cartOxen(druh) × kusy. */
export function oxenForCarts(wants: TradeGoods): number;
// MarketTrip.oxen?: number – vycvičení voli bez vozu, kteří jdou s výpravou a potáhnou koupené vozy domů
```

- `villageGoodStock(s, 'twoWheelCarts', day)` = `idleCartsOf(s, 'two-wheel').length`; `addGood` +n = `addCart` n×, −n = `removeIdleCart` n×.
- Stance: nabízí `idleCartsOf − cartsWanted` (je-li kladné), bez pracujícího tesaře shání 1 vůz druhu `missingCart(state)`.
- `checkMarketTrip`: vozy v `wants` jen když `oxenHome − voli vozů výpravy − give.trainedOxen ≥ oxenForCarts(wants)` (nový důvod `MARKET_NO_OXEN = 'Koupený vůz by domů neměl kdo táhnout.'`); výsledek kontroly nese `oxen`. Hráč voly nezadává – spočítá je server i náhled ve webu touž funkcí. `departMarket` uloží `trip.oxen`, `oxenHome` je bere jako pryč do `returnDay` (stejně jako vozy výpravy). Prodaný vůz výpravy (`give`) odjede bez spřežení jako prodaní voli (plán 2, Rozhodnutí 5).

- [ ] **Step 1: Testy:**
  - `checkMarketTrip({ give: {}, wants: { twoWheelCarts: 1 }, stayDays: 1 }, { …, oxenHome: 0 })` → `MARKET_NO_OXEN`; s `oxenHome: 2` projde s `oxen: 2`. `planMarketTrip` + `departMarket` → `oxenHome(state, D + 1)` o 2 menší až do `returnDay − 1`, v `returnDay` zpět.
  - Stance: ves bez tesaře bez vozu (`missingCart` = 'two-wheel') shání `twoWheelCarts: 1`; ves s tesařem a 2 volnými dvoukoláky při `cartsWanted` 1 nabízí `twoWheelCarts: 1`.
  - Dvě vsi: H (bez tesaře, 2 volní vycvičení voli, `give: { grain: 400 }`, `wants: { twoWheelCarts: 1 }`) a M (s tesařem, 2 volné dvoukoláky, chce obilí) → H má po návratu o vůz víc (`villageCarts(h).length + 1`), M o jeden méně, voli H jsou doma v `returnDay`.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/village/crafts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS; `nice -n 19 npm run test:slow`.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): vozy na trhu – prodej, nákup a voli pro koupený vůz (plán 3)`.

### Task 4: Zakázky u řemeslníka (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/craft-orders.ts`
- Modify: `types/types-market.ts` (`CraftOrder`, `VillageMarket.orders?`, `MarketResult.ordered?`, `PlacedOrder`, `OrderReady`, mail `order-ready`), `types/types-state.ts` (`orders?`), `types/types-chronicle.ts` (`order-ready` { `villageName`, `villageId`, `good` }), `trade/goods.ts` (`ORDER_GOODS`, `ORDER_CRAFT`), `trade/market.ts` (`departVisitors`, `settleTrades`), `trade/market-trip.ts` (`applyMarketResult`), `core/inbox.ts`, `crafts/crafts.ts` (`restingCrafters`, `smithIronDeficit` přes `orderTargets`), `crafts/carpentry.ts` (`nextProduct`), `rules/rules-market.ts` (`MARKET.orderDays = 365`), `core/simulate.ts` (`fillOrders` po práci dne)
- Modify: `docs/code/village-trade.md` (nový odstavec „Zakázky“), `docs/code/village-crafts.md` (výroba na zakázku)
- Test: `trade/__tests__/craft-orders.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: `marketStance`, `departVisitors` (plán 2), `ownCraftsmanWorks`, `craftTargets`, `toolNeedKg`, `smithBarsTargetKg`, `cartsWanted` (Úloha 3).
- Produces:

```ts
export type OrderGood =
  'tools' | 'pottery' | 'woodTools' | 'ironBars' | 'twoWheelCarts' | 'fourWheelCarts';
export const ORDER_GOODS: readonly OrderGood[];
export const ORDER_CRAFT: Readonly<Record<OrderGood, Craft>>; // tools, ironBars → smith; pottery → potter; ostatní → carpenter
/** Zakázka u hostitele (VillageMarket.orders). */
export interface CraftOrder {
  villageId: string;
  name: string;
  good: OrderGood;
  amount: number;
  day: number;
  readyDay?: number;
}
/** Zakázka kupujícího (VillageState.orders). */
export interface PlacedOrder {
  villageId: string;
  name: string;
  good: OrderGood;
  amount: number;
  day: number;
  status: 'open' | 'ready' | 'refused';
}
export interface OrderReady {
  villageId: string;
  name: string;
  good: OrderGood;
  amount: number;
} // villageId = hostitel
// VillageMail.body += { kind: 'order-ready'; ready: OrderReady }
// trade/craft-orders.ts
export function liveOrders(state: VillageState, day: number): CraftOrder[]; // bez vypršelých (day − order.day > MARKET.orderDays)
export function orderTargets(state: VillageState, day: number): Record<OrderGood, number>; // součty živých zakázek
export function recordOrders(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
  hostWants: TradeGoods,
): TradeGoods; // vrací `ordered`
export function reduceOrder(
  state: VillageState,
  villageId: string,
  good: OrderGood,
  amount: number,
): void;
export function fillOrders(state: VillageState, day: number): void; // zásoba nad vlastní potřebou ≥ zakázka → outbox `order-ready`, `readyDay`
export function rememberOrders(
  state: VillageState,
  day: number,
  trip: MarketTrip,
  result: MarketResult,
): void; // kupující
export function markOrderReady(
  state: VillageState,
  day: number,
  ready: OrderReady,
): ChronicleEvent[]; // kupující, inbox
export function placedOrder(state: VillageState, day: number, good: OrderGood): PlacedOrder | null; // živá zakázka kupujícího
```

Pravidla (Rozhodnutí 6):

- `recordOrders` – v `departVisitors` před výsledkem. Pro každé `g ∈ ORDER_GOODS` se zbytkem `visitor.wants[g] > 0`, `ownCraftsmanWorks(host, ORDER_CRAFT[g])` a s průnikem `hostWants` × `visitor.goods` (výprava pořád veze něco, co hostitel shání) zapíše/nahradí `CraftOrder` (`villageId` = `visitor.fromVillageId`). `ordered` jde do `MarketResult.ordered`.
- `reduceOrder` – v `settleTrades`, když hostitel prodá zakázkové zboží návštěvníkovi téže vsi (zakázka 0 se smaže).
- Vlastní potřeba pro výrobu: `restingCrafters` a `smithIronDeficit` berou `toolNeedKg + orders.tools` a `smithBarsTargetKg + orders.ironBars`; keramika `craftTargets.potteryKg + orders.pottery`; tesař (`nextProduct`) dřevěné nářadí `+ orders.woodTools`, vůz i když `missingCart` nic, ale volných vozů druhu je méně než `cartsWanted + orders`. Funkce `craftTargets` sama se nemění (správce a výhledy počítají jen vlastní potřebu).
- `fillOrders` – po práci dne: pro živé zakázky bez `readyDay` v pořadí `day`, pak `villageId`. Zásoba nad vlastní potřebou (stance bez zakázek) se rozdělí postupně. Pokrytá zakázka dostane `readyDay` a do `outbox` jde `order-ready` na den `day + 1 + marketTravelDays(cells)` (posel; `cells` z okolí, není-li kupující v okolí, 1), `ref` `order:<hostitel self>:<kupec>:<good>:<day>`. Bez okolí (`self` chybí) se neohlašuje.
- `rememberOrders` – v `applyMarketResult`: zboží z `ordered` → `open`. Zboží ze seznamu výpravy, které nekoupila ani neobjednala → `refused`. Koupené → zakázka u té vsi se smaže.
- `markOrderReady` – `open` → `ready`, kronika `order-ready` { `villageName`, `good` } (Úloha 11 dá text).

- [ ] **Step 1: Testy** (`craft-orders.test.ts`):
  - Odjezd s nekoupenými nástroji 10 kg od kováře, který shání obilí, s obilím ve voze → `market.orders = [{ villageId: H, good: 'tools', amount: 10, day: D }]`, `result.ordered = { tools: 10 }`. Bez kováře, nebo když výprava nic, co hostitel shání, neveze → žádná zakázka.
  - Druhá výprava téže vsi chce 4 → zakázka 4 (nahrazena, ne 14).
  - `orderTargets` po `MARKET.orderDays + 1` dnech → 0 (vypršela).
  - Kovář s otevřenou zakázkou nástrojů 10 kg kuje i při vybavení na `toolNeedKg` (`restingCrafters` ho nepošle odpočívat), bez zakázky odpočívá.
  - `fillOrders`: zásoba nástrojů 12 kg nad potřebou, zakázky H 10 a K 5 (H dřív) → H `readyDay`, v `outbox` jedna zpráva `order-ready` pro H, K nic; podruhé se neohlásí.
  - Kupující: `rememberOrders` s `ordered: { tools: 10 }` a nekoupenou keramikou → `tools` `open`, `pottery` `refused`; `markOrderReady` → `ready`.
- [ ] **Step 2: Test dvou vsí** (`market-two-villages.test.ts`, nový případ „zakázka“): H chce 10 kg nástrojů, M (kovář, nástroje na potřebě, shání obilí) nemá co prodat → zakázka. M se dopočte dál, dokud nepošle `order-ready` (nejvýš 60 dní). Druhá výprava H koupí 10 kg. V součtu: nástroje M vyrobené navíc = nástroje, které přibyly H; obilí jen mezi H a M.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/village/crafts` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces; větev `order-ready` v `applyEvent`.
- [ ] **Step 5: Spustit** – PASS; `nice -n 19 npm run test:slow` (bez zakázek se výroba nemění – zlaté otisky).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): zakázky u řemeslníka – výroba pro kohokoli a ohlášení hotové zakázky (plán 3)`.

### Task 5: Vesničané na trhu (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/villager-trips.ts`
- Modify: `trade/market-trip.ts` (`departMarketInPlace`, `TradeExpedition.by?`), `crafts/craft-buying.ts` (port `yearlySaving`, `withToolCoverage`, `BuyingContext`, `pay` z `b4f8dadc` beze změny vzorců), `core/simulate.ts` (krok `villagerTripsDay` hned za `seedReserveDay`), `rules/rules-crafts.ts` (`CRAFT_BUYING.day`, `minKg`), `rules/rules-fields.ts` (`SEED_MARKET`), `types/types-trade.ts` (`TradeExpedition.by?`), `types/types-chronicle.ts` (`market-departed` / `market-returned` `by?`)
- Modify: `docs/code/village-trade.md` (nový odstavec „Vesničané na trhu“), `docs/code/village-crafts.md` (Nákup u sousedů → na trhu), `docs/code/village-fields.md` (Osivo – nákup na trhu)
- Test: `trade/__tests__/villager-trips.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: Úloha 1 (`nearestWith`, `nearestNearby`, `nearbyTarget`), Úlohy 2–4 (zboží, `cartsWanted`, `placedOrder`), plán 2 (`planMarketTrip`, `marketCrew`, `marketTravelDays`, `priceOf`), `paymentPool`, `seedShortKg`, `surplusCows`, `ironOrderBarsKg`, `ownCraftsmanWorks`.
- Produces:

```ts
export type TripBy = 'villagers' | 'steward' | 'smith' | 'kin';
// TradeExpedition.by?: TripBy; ChronicleEvent market-departed / market-returned: by?: TripBy
/**
 * Jako departMarket, ale mutuje stav (krok dne – bez klonu celé vsi). departMarket = klon + tohle.
 * `crew: 0` – výprava bez nosičů (kovář jde sám, Úloha 7); jinak posádka z marketCrew.
 */
export function departMarketInPlace(
  state: VillageState,
  day: number,
  order: MarketOrder,
  target: MarketTarget,
  options?: { by?: TripBy; crew?: 0 },
): { ok: true; trip: MarketTrip } | { ok: false; reason: string };
/** Plán nákupů dne (stav nemění) – port planPurchases: výrobek, cíl, kg, platba, ušetřeno a cena v čd. */
export interface VillagerPurchase {
  good: 'tools' | 'pottery' | 'woodTools' | 'twoWheelCarts' | 'fourWheelCarts';
  villageId: string;
  amount: number;
  pay: TradeGoods;
  savedManDays: number;
  costManDays: number;
  worthIt: boolean;
}
export function planVillagerPurchases(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): VillagerPurchase[];
/** Krok dne (mutuje): hotové zakázky, 15. 11. výrobky a vůz, 1. 9. a 1. 3. osivo, kdykoli hřivny na kování vozu. */
export function villagerTripsDay(state: VillageState, day: number, coverage: CraftCoverage): void;
```

Pravidla (Rozhodnutí 7):

- Bez `state.nearby` nic. Cíle jen z okolí.
- **Cena v kg obilí** u cíle: `priceOf(news.prices, g) × MARKET.grainKgPerCoin`, bez zprávy výchozí `TRADE_GOOD_VALUES[g].valueKg`. Platba obilím a luštěninami z `paymentPool` v kg obilí stejnou cenou cíle.
- **Výrobky 15. 11.:** port `planPurchases`. `nearestCraftsman` → `nearestWith(state, PRODUCT_CRAFT[g])` (vůz – tesař). Přeskočí výrobek s vlastním pracujícím řemeslníkem, s živou zakázkou `open` a cíl s `refused`. `carryKg` a vozy nákupu nahrazuje `marketCrew` (nosiči × (2 × cesta + 1) = cena cesty v čd). Vůz chce volné vycvičené voly (`cartOxen`). Nákupy jednoho cíle jedou jednou výpravou.
- **Osivo 1. 9. a 1. 3.:** `seedShortKg ≥ SEED_MARKET.minKg` → `wants.grain` = chybějící kg, `give` hřivny, pak krávy z `surplusCows` (nejvýš `SEED_MARKET.maxCows`) do hodnoty osiva cenou cíle. Cíl `nearestNearby`.
- **Hřivny na kování vozu (kdykoli):** `ironOrderBarsKg > ironBarsKg`, bez vlastního pracujícího kováře, bez výpravy vesničanů s hřivnami na cestě, bez živé zakázky `open` a bez `refused` u cíle. `wants.ironBars` = rozdíl, platba z `paymentPool`, cíl `nearestWith(state, 'smith')`.
- **Hotová zakázka:** `status: 'ready'` → výprava pro ni (wants = zakázka) s platbou z `paymentPool`, zakázka pak `open` do výsledku.
- Pobyt `MARKET.minStayDays`. `departMarketInPlace(…, { by: 'villagers' })`. Odmítne-li `planMarketTrip`, ves dnes nejede (bez opakování v tentýž den).

- [ ] **Step 1: Testy** (`villager-trips.test.ts`, přípravky `market-fixtures.ts` + `nearby`):
  - Bez okolí: 15. 11. ves bez kováře s nedostatkem nástrojů → žádná výprava, `outbox` není (a stav = stav bez kroku).
  - S okolím a zprávou „M má kováře“: 15. 11. → jedna výprava `by: 'villagers'`, `market.villageId = M`, `wants.tools` = `planVillagerPurchases(…)[0].amount` (> `CRAFT_BUYING.minKg`), `give.grain` = hodnota × cena; 14. 11. nic.
  - Zpráva bez kováře → pro nástroje nikam; ves s vlastním pracujícím kovářem → nikam.
  - Zakázka `open` na nástroje u M → 15. 11. pro nástroje nejede; `ready` → jede 16. 11. ráno (výprava v den po `order-ready`).
  - 1. 9. s osivem kratším o 200 kg, hřivnami 2 kg a 3 krávami nad potřebou → `wants.grain = 200`, `give.ironBars = 2`, `give.cows = 1` (hodnota hřiven 90 < 200, kráva doplní); s `seedShortKg` 3 kg nic.
  - Vůz čeká na kování, bez kováře, zpráva M s kovářem → výprava `wants.ironBars = cartIronBarsKg('two-wheel')` hned ten den; druhý den znovu ne (výprava na cestě).
  - Determinismus: dopočet 1. 11. → 30. 11. vcelku a po kouscích (1.–14. 11., 15.–30. 11.) dá shodný stav i `outbox`.
- [ ] **Step 2: Test dvou vsí:** H (bez kováře, okolí M, zpráva M s kovářem) a M (kovář, nástroje nad potřebou, shání obilí) od 14. 11. Po kole tam a zpět má H o `planVillagerPurchases` kg vybavení víc, M o tolik méně a o zaplacené obilí víc.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/village/crafts packages/game/src/domain/village/fields` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces. Pravidla v kódu s odkazem „markets.md – Pravidla 9, Rozhodnutí plánu 3, bod 7“. Obnovená čísla s původním odkazem (`b4f8dadc`).
- [ ] **Step 5: Spustit** – PASS; `nice -n 19 npm run test:slow` (bez okolí beze změny).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): vesničané jezdí na trh pro výrobky, osivo a hřivny na kování (plán 3)`.

### Task 6: Správce na trhu (Sonnet)

**Files:**

- Create: `packages/game/src/domain/village/steward/steward-market.ts`
- Modify: `steward/steward-needs.ts` (`needSteps` volá kroky trhu), `rules/rules-steward.ts` (`STEWARD.grainMinKg`, `grainPorterShare`, `grainPayment` – z `b4f8dadc` i s komentářem a datem Martinova „A“ 8. 11. 2026)
- Modify: `docs/code/village-steward.md` (nový odstavec „Správce na trhu“)
- Test: `steward/__tests__/steward-market.test.ts`

**Interfaces:**

- Consumes: Úloha 1 (`nearbyTarget`, `nearestNearby`), Úloha 5 (`departMarketInPlace`, `TripBy`), `marketStance`, `fieldStoresOutlook`, `marketFreeAdults`.
- Produces:

```ts
/** Krok 2a (mutuje): obilí v nouzi – chybí-li ≥ STEWARD.grainMinKg a nic správcovo není na cestě. Vrací, jestli vyrazil. */
export function stewardGrainStep(state: VillageState, ctx: NeedContext, shortKg: number): boolean;
/** 15. 11. (CRAFT_BUYING.day): výprava s nabídkou a sháňkou vsi (marketStance) do okolí[rok % počet]; shání-li ves něco. */
export function stewardMarketStep(state: VillageState, ctx: NeedContext): boolean;
```

- Obilí v nouzi: `wants.grain = shortKg`. `give` zbožím `STEWARD.grainPayment` v jeho pořadí do hodnoty obilí cenou cíle (Úloha 5 – cena ze zprávy, jinak výchozí). Nosiči nejvýš `floor(dospělí × grainPorterShare)`: nevejde-li se výprava, správce zmenší nákup úměrně jako dřívější `grainDeal` (počet pokusů – technická mez z `b4f8dadc` `steward/steward-needs.ts`, přenést i s komentářem). Cíl `nearestNearby`, `departMarketInPlace(…, { by: 'steward' })`.
- „Nic správcovo není na cestě“ = žádná výprava `by: 'steward'` v `trade.expeditions`.
- `needSteps`: napřed `stewardGrainStep(targets.shortKg)`, pak lov jako dnes, pak `stewardMarketStep`.

- [ ] **Step 1: Testy:**
  - Zapnutý správce, okolí s M bez zprávy (výchozí ceny), `fieldStoresOutlook.shortKg` = 400, hřivny 5 kg, keramika 100 kg → výprava do M s `wants.grain = 400`, `give.ironBars = 5` (225 kg obilí) a `give.pottery` = 175 ÷ 3 ≈ 58,33 kg (do 400), uhlí ani klády ne. Druhý den správce nevyrazí (výprava na cestě).
  - `shortKg` < `TRADE.porterKg` → nic. Bez okolí → nic. Vypnutý správce → nic.
  - 15. 11. roku 603 s okolím [A, B] (A blíž) → cíl B (603 % 2 = 1). Ves, která nic neshání → nic. `give` a `wants` = `marketStance` vsi téhož dne.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/steward` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS; `nice -n 19 npm run test:slow` (správce bez okolí beze změny – testy správce v pomalých).
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): správce jezdí na trh – obilí v nouzi a potřeba vsi (plán 3)`.

### Task 7: Kovář souseda ke koním (Opus)

**Files:**

- Create: `packages/game/src/domain/village/livestock/smith-visit.ts`
- Modify: `types/types-market.ts` (`SmithAsk`, `MarketArrival.service?`, `MarketVisitor.service?`, mail `smith-ask`), `types/types-people.ts` (`AwayKind` += `'craft'`), `types/types-state.ts` (`shoeing.asked?`), `types/types-chronicle.ts` (`horses-shod` `villageName?`, `villageId?`), `trade/market.ts` (`joinMarket` volá `serveShoeing`), `core/inbox.ts` (větev `smith-ask`), `core/simulate.ts` (`askSmithDay` za `finishShoeing`), `crafts/craft-buying.ts` (`paymentPool(…, intoBuffer = false)` z `b4f8dadc`), `rules/rules-livestock.ts` (`HORSE_SHOEING.foreignDayKg = 4`)
- Modify: `docs/code/village-livestock.md` (Kování – kovář souseda), `docs/code/village-trade.md` (výprava kováře)
- Test: `livestock/__tests__/smith-visit.test.ts`

**Interfaces:**

- Consumes: Úloha 1 (`nearestWith`, `nearby.self`), Úloha 5 (`departMarketInPlace`, `TripBy`), `planShoeing`, `shoeingDue` / `isUnshod`, `ridingHorses`, `shoeingBarsKg`, `ownCraftsmanWorks`, `occupiedWorkshops`, `rememberNews`, `OPPOSITE`.
- Produces:

```ts
export interface SmithAsk {
  key: string;
  fromVillageId: string;
  fromName: string;
  cells: number;
  firstStep: Direction8;
  horses: number;
  report: VillageReport;
}
// VillageMail.body += { kind: 'smith-ask'; ask: SmithAsk }; VillageState.shoeing.asked?: { key: string; villageId: string; untilDay: number }
// MarketArrival.service?: { kind: 'shoeing'; horses: number }
export function smithFeeKg(horses: number, travelDays: number): number;
/** Ves s koňmi (mutuje): termín, vlastní kovář nemůže, dotaz nečeká → smith-ask nejbližší vsi s kovářem (podle zprávy). */
export function askSmithDay(state: VillageState, day: number): void;
/** Ves kováře (inbox): může-li, kovář vyrazí (departMarketInPlace, by 'smith', bez nosičů, give.ironBars, service). */
export function answerSmithAsk(state: VillageState, day: number, ask: SmithAsk): ChronicleEvent[];
/** Ves s koňmi (joinMarket): okuje, zaplatí poplatek do visitor.bought, hřivny do visitor.sold. */
export function serveShoeing(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
): ChronicleEvent[];
```

- `smithFeeKg(h, t)` = (h × `HORSE_SHOEING.manDays` + 2 × t + 1) × `HORSE_SHOEING.foreignDayKg` + h × `HORSE_SHOEING.ironBarsKg` × `TRADE_GOOD_VALUES.ironBars.valueKg`. Dva koně u sousední mapy: (1 + 0 + 1) × 4 + 1 × 45 = 53 kg obilí.
- `askSmithDay`: jen s okolím, `shoeingDue` a `planShoeing` null. Klíč `smith:<self>:<day>`, `ref` `<klíč>:ask`, den dotazu `day + 1 + marketTravelDays(cells)`, `asked.untilDay` = den dotazu + 2 × cesta + 2. Kování (vlastní i cizí) `asked` smaže.
- `answerSmithAsk`: ves bez `nearby.self` nic. Kovář = muž domácnosti pracující kovárny (`ownCraftsmanWorks`), který není pryč. Hřivny ≥ koně × 0,5 + `shoeingBarsKg(vlastní)`. Výprava: cíl ze zprávy (`villageId = fromVillageId`, `firstStep = OPPOSITE[ask.firstStep]`), pobyt 1 den, nosiči 0 (kovář jde sám – `departMarketInPlace(…, { by: 'smith', crew: 0 })`). Kovář `away = { kind: 'craft', untilDay: returnDay }`. Zpráva o vsi, která se ptala, do `news` (`rememberNews`). Kronika výpravy `market-departed` `by: 'smith'`.
- `serveShoeing`: jen návštěvník se `service`. Ves má jezdecké koně a termín nastal: termín = dnešek, `asked` pryč, hřivny návštěvníka do `sold` (spotřebované), poplatek `paymentPool(state, day, craftCoverage(state, day), true)` – obilí, pak luštěniny, nejvýš co pool má – ze vsi do `visitor.bought`. Kronika `horses-shod` `{ horses, own: false, direction: OPPOSITE[visitor příjezdový směr], villageName: visitor.fromName, villageId: visitor.fromVillageId }`. Jinak nic – hřivny zůstanou v `goods`, výsledek je vrátí.

- [ ] **Step 1: Testy** (dvě vsi A a K, přípravky `horse-fixtures.ts` + `market-fixtures.ts`):
  - A (2 jezdečtí koně po termínu, bez kováře, okolí K, zpráva K s kovářem) → `askSmithDay` dá v `outbox` jednu `smith-ask` (`horses: 2`, den D + 1); druhý den nic (`asked.untilDay`).
  - K (kovář doma, hřivny 10 kg, bez jezdeckých koní) na `smith-ask` → výprava `by: 'smith'`, `nosiči 0`, `give.ironBars = 1`, kovář `away.kind = 'craft'` do `returnDay`, v `outbox` `market-arrive` se `service`.
  - A na příjezd → `shoeing.lastDay = den`, kronika `villageName: 'K…'`, ze vsi ubude 53 kg obilí (`storesKg`), `visitor.bought.grain = 53`, `visitor.sold.ironBars = 1`.
  - K po výsledku: obilí +53, hřivny −1, kovář doma v `untilDay`. V součtu obilí A + K a hřivny beze změny.
  - K bez hřiven, nebo kovář pryč → nic nevyrazí; A pošle nový dotaz až po `untilDay`.
  - A mezitím okoval vlastní kovář → `serveShoeing` nic, poplatek 0, K dostane hřivny zpět (`unsold.ironBars = 1`).
  - Kovárna K ve dnech, kdy je kovář pryč, nekuje (`restingCrafters` / práce dílny 0 – ověřit hodnotou z `workshopLabor`).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/livestock packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces; kovář pryč nesmí pracovat v dílně – ověř, že dílny berou `awayFromWork`, jinak doplň.
- [ ] **Step 4: Spustit** – PASS; `nice -n 19 npm run test:slow`.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): kovář souseda přijde okovat koně (plán 3)`.

### Task 8: Lidé na trhu – výměna lidí a noví osadníci (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/market-people.ts`
- Modify: `types/types-trade.ts` (`TradeGood` += `'families' | 'men' | 'women'`), `trade/goods.ts` (`PEOPLE_GOODS`, `isPeopleGood`, `PIECE_GOODS`), `rules/rules-trade.ts` (hodnoty 720 / 360 / 360 – Rozhodnutí 4), `types/types-market.ts` (`MarketPerson`, `MarketArrival.people?`, `MarketVisitor.people?`, `boughtPeople?`, `MarketResult.people?`, `newcomers?`), `trade/trade.ts` (`villageGoodStock`, `addGood` pro lidi vyhodí chybu), `trade/market-trip.ts` (`checkMarketTrip`, `departMarketInPlace`, `applyMarketResult`), `trade/market.ts` (`settleTrades`, `marketResult`), `trade/market-stance.ts`, `domain/vassalage/spare.ts` (export `peopleSpare`), `types/types-chronicle.ts` (`newcomer` `villageName?`, `villageId?`), `apps/web/lib/trade-names.ts` (ikony `family`, `man`, `woman`)
- Modify: `docs/code/village-trade.md` (Lidé – koho ves dá a kdo přijde → na trhu)
- Test: `trade/__tests__/market-people.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: `emigrantGroups`, `emigrantList`, `removePeople`, `rehomePeople`, `newcomerHome`, `peopleSpare`, `stewardOutlook`.
- Produces:

```ts
export type PeopleGood = 'families' | 'men' | 'women';
/** Kus lidí na trhu – rodina, nebo jeden muž či žena – s celými záznamy osob (id vsi, odkud jsou). */
export interface MarketPerson {
  good: PeopleGood;
  people: Person[];
}
/** Odejdou ze vsi (mutuje): n skupin druhu podle emigrantGroups, removePeople se směrem `direction`. */
export function takePeople(
  state: VillageState,
  day: number,
  good: PeopleGood,
  n: number,
  direction: Direction8,
): MarketPerson[];
/** Přišli zvenku (mutuje): rehomePeople, dům newcomerHome, origin = směr; kronika newcomer s villageName. */
export function settlePeople(
  state: VillageState,
  day: number,
  groups: readonly MarketPerson[],
  from: { villageId: string; villageName: string; direction: Direction8 },
): ChronicleEvent[];
/** Vlastní lidé se vrátili (mutuje): původní id a vazby, odeberou se z emigrants; dům newcomerHome. */
export function restorePeople(state: VillageState, groups: readonly MarketPerson[]): void;
/** Kolik lidí ves shání (Rozhodnutí 10): rodiny ceil(chybějící dospělí ÷ 2), muži a ženy 0. */
export function peopleWanted(
  state: VillageState,
  day: number,
  outlook: StewardOutlook,
): TradePeople;
```

- `villageGoodStock(s, 'men', day)` = `emigrantGroups(s, day, { families: 0, men: ∞, women: 0 }).men.length` (obdobně ženy a rodiny).
- **Odjezd:** `give.men` atd. → `takePeople` (směr `target.firstStep`), skupiny do `MarketArrival.people`. `marketCrew` lidi nenese (jdou po svých), posádka aspoň 1 dál.
- **Zápočet:** lidé jsou kusové zboží s cenou jako ostatní.
  - Hostitel prodá → `takePeople` z hostitele do `boughtPeople` kupující výpravy.
  - Hostitel koupí → první skupiny druhu z `visitor.people` → `settlePeople(hostitel)`.
  - Výprava od výpravy → skupiny přejdou do `boughtPeople` kupce.
- **Výsledek:** `people` = neprodané vlastní skupiny, `newcomers` = koupené. `applyMarketResult`: `restorePeople(people)`, `settlePeople(newcomers)`. Výsledek `returned` (zaniklý hostitel) vrátí obojí stejně.
- **Stance:** `give` lidí = `peopleSpare(state, day, outlook)`, `want` = `peopleWanted`. Vesničané (Úloha 5) lidi nevozí.

- [ ] **Step 1: Testy** (`market-people.test.ts`):
  - `takePeople(s, D, 'families', 1, 'E')`: rodina (otec, matka, 2 děti) zmizí z `people`, v `emigrants` se směrem 'E'; `MarketPerson.people` má jejich původní id a vazby.
  - `settlePeople` do jiné vsi: 4 nové osoby s id od `nextId`, vazby matka–děti přepsané na nová id, vazby ven přerušené, `origin = 'W'`, jeden dům; kronika `newcomer` `villageName`.
  - `restorePeople` téže vsi: osoby s původními id, `emigrants` bez nich, `nextId` beze změny.
  - `peopleWanted`: `landHa` 12, `laborHa` 8, dospělí 10 → chybí 5 → rodiny 3.
  - `addGood(s, 'men', 1, D)` vyhodí chybu.
- [ ] **Step 2: Test dvou vsí** (`market-two-villages.test.ts`, „rodina na trhu“): H dá 1 rodinu (4 lidé), shání obilí. M má půdy víc než práce a obilí nad pojistku. Po kole:
  - M má o 4 lidi víc (nová id),
  - H o 4 méně a o 720 kg obilí víc,
  - součet lidí H + M + na cestě je po každém kroku stejný (porody a úmrtí v okně test vyloučí kontrolou kroniky – `birth`, `death` 0, jinak je odečte),
  - druhý případ – M zanikne (`extinctDay`) před příjezdem: výsledek `returned` vrátí H rodinu s původními id.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/vassalage` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces; `TRADE_GOOD_NAMES` ve webu hned.
- [ ] **Step 5: Spustit** – PASS; `nice -n 19 npm run test:slow`.
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): lidé na trhu – výměna lidí a noví osadníci se skutečnými vsemi (plán 3)`.

### Task 9: Sňatky se skutečnými sousedy a další manželky (Opus)

**Files:**

- Create: `packages/game/src/domain/village/people/kin-match.ts`
- Modify: `people/marriage.ts` (export `isSingle`, `dependants`, `startMarriage`, `maxAgeGap`; obnovit `favouredBride`, `crowded` a `perDay` z `b4f8dadc` beze změny), `trade/people-trade.ts` (export `keptByLine`), `trade/market.ts` (`joinMarket` volá `receiveKin`), `core/inbox.ts` (větev `kin-ask`), `core/simulate.ts` (`askKinDay` hned za `arrangeMarriages`), `rules/rules-people.ts` (`MARRIAGE.neighbours`), `rules/rules-lord.ts` (`LORD.maxWives = 4`), `types/types-market.ts` (`KinSeeker`, `KinAsk`, `MarketArrival.kin?`, mail `kin-ask`), `types/types-chronicle.ts` (`bride-from-outside`, `groom-from-outside`, `extra-wife`, `married-away` += `villageName?`, `villageId?`; `married-away` += `groom?: true`)
- Modify: `docs/code/village-people.md` (Sňatky – se sousedy; Manželky – další ze sousedních vsí)
- Test: `people/__tests__/kin-match.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: Úloha 1 (`nearby`), Úloha 5 (`departMarketInPlace`, `TripBy`), Úloha 8 (`MarketPerson`, `takePeople`-styl odchodu přes `removePeople`, `settlePeople`), `bestMatch`, `singles`, `parentIds`, `weddingChancePerDay`, `householdBreaksUp`, `keptByLine`, `rememberNews`, `villageReport`, `OPPOSITE`.
- Produces:

```ts
export interface KinSeeker {
  personId: number;
  sex: Sex;
  bornDay: number;
  widowed: boolean;
  extraWife?: true;
}
export interface KinAsk {
  key: string;
  fromVillageId: string;
  fromName: string;
  cells: number;
  firstStep: Direction8;
  seeker: KinSeeker;
  report: VillageReport;
}
// VillageMail.body += { kind: 'kin-ask'; ask: KinAsk }; MarketArrival.kin?: { seekerId: number; extraWife?: true }
// rules-people.ts – MARRIAGE += neighbours (markets.md, Rozhodnutí plánu 3, body 11–12; čísla dřívějších
// sňatků z okolí a dalších manželek – b4f8dadc, lord-history.md):
//   neighbours: { fromAge: 18, brideAge: { from: 16, to: 22 }, bridePerYear: 0.3, favouredGroomPerYear: 0.5, extraWifePerYear: 0.3 }
/** Ves hledajícího (mutuje): kdo ve vsi nemá s kým, se s denní šancí zeptá náhodné vsi okolí (proud 'kin:' + den). */
export function askKinDay(state: VillageState, day: number, storesFill: () => number): void;
/** Ves partnera (inbox, ráno před vlastními sňatky): vybere partnera bez protějšku ve vsi a pošle ho výpravou 'kin'. */
export function answerKinAsk(state: VillageState, day: number, ask: KinAsk): ChronicleEvent[];
/** Ves hledajícího (joinMarket): partner a jeho děti do vsi, svatba se svobodným hledajícím, jinak nováček. */
export function receiveKin(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
): ChronicleEvent[];
```

Pravidla (Rozhodnutí 11 a 12):

- **`askKinDay`** – jen s okolím, ne v hladu (`state.hungry`). Kandidáti v pořadí id, los na kandidáta z proudu `'kin:' + day`: ptá se, když los < `perDay(roční šance)`; pod pojistkou zásob (`storesFill() < 1`) navíc druhý los < `weddingChancePerDay(fill)` (čekání na zásoby jako svatba ve vsi). Další los vybere ves `nearby.villages[floor(los × počet)]`:
  - muž od `fromAge` bez `bestMatch` ve vsi, ne v přeplněném domě (`crowded`) → šance `perDay(bridePerYear)` a pod pojistkou zásob `weddingChancePerDay`,
  - žena od `fromAge`, `favouredBride`, bez `bestMatch` → `favouredGroomPerYear` (stejně),
  - muž rodu od `fromAge` s 1–3 žijícími manželkami (< `LORD.maxWives`) → `extraWifePerYear` (`extraWife: true`; přeplnění nevadí – lord.md).

  Klíč `kin:<self>:<day>:<personId>`, den dotazu `day + 1 + marketTravelDays(cells)`, `ref` `<klíč>:ask`.

- **`answerKinAsk`** – ves bez `nearby.self` nic. Zprávu o hledající vsi do `news`. Kandidát:
  - opačné pohlaví, `isSingle`, bez `bestMatch` ve vsi, věkový rozdíl ≤ `maxAgeGap`,
  - ne `keptByLine`, žena ne `favouredBride`, domácnost se odchodem nerozpadne (`householdBreaksUp` zbytku),
  - u `extraWife` žena 16–22 (`brideAge`), u ženicha ne muž rodu.

  Nejbližší věkem, při shodě nižší id. Odejde s `dependants` (děti do 16) přes `removePeople` (směr `OPPOSITE[ask.firstStep]`) jako jeden `MarketPerson` (`women` / `men`, s dětmi `families`). Výprava `departMarketInPlace(…, { by: 'kin' })`: cíl hledající ves (`cells`, `firstStep = OPPOSITE[ask.firstStep]`), `give`/`wants` prázdné, `kin = { seekerId, extraWife? }`, pobyt 1 den. Kronika `married-away` (`villageName`, u muže `groom: true`).

- **`receiveKin`** – `settlePeople` (nová id, `origin`):
  - hledající žije a je svobodný (u další manželky má < 4 žijící) → partner do jeho domu (u ženicha do domu ženy), `spouseId` jako svatba ve vsi (další manželka asymetricky – lord.md), `startMarriage` nevěstě,
  - jinak partner zůstane jako svobodný nováček v domě podle `newcomerHome`.

  Kronika `bride-from-outside` / `groom-from-outside` / `extra-wife` s `villageName`, `villageId`, jinak `newcomer`. `visitor.people` se vyprázdní – doprovod se vrátí s prázdným výsledkem.

- [ ] **Step 1: Testy** (`kin-match.test.ts`; den, kdy los padne, najde test smyčkou přes dny – deterministicky, ne pevným číslem z hlavy):
  - Ves bez okolí: za 3 roky žádný `kin-ask`, stav shodný s dopočtem bez kroku.
  - Svobodný muž 25 bez ženy ve vsi s okolím [B] → v některý den `outbox` s `kin-ask` pro B, `seeker.sex = 'male'`; v hladu nikdy.
  - `answerKinAsk` ve B se ženou 20 bez protějšku → výprava `by: 'kin'`, žena v `emigrants` se směrem, kronika `married-away` `villageName`; vdova se 2 dětmi do 16 odejde i s dětmi (3 osoby, `families`); žena, které by se domácnost rozpadla, neodejde; manželka muže rodu ani muž rodu nikdy.
  - `receiveKin`: hledající svobodný → `spouseId` obou, `nextBirthFrom ≥ den + BIRTH_SPACING.afterWeddingDays`, kronika `bride-from-outside` `villageName: 'B…'`; hledající mezitím ženatý → nevěsta svobodná v domě `newcomerHome`, kronika `newcomer`; `nextId` vzroste přesně o počet příchozích.
  - Další manželka: muž rodu s 1 manželkou → druhá má `spouseId` = muž, muž ukazuje dál na hlavní; s 4 žijícími se neptá.
  - Determinismus: A dopočtená přes 2 roky vcelku a po kouscích (rok + rok) dá shodný `outbox` i stav.
- [ ] **Step 2: Test dvou vsí** („nevěsta ze sousední vsi“): A (muž bez ženy) a B (žena bez muže), oba s okolím. Kolo dotaz → výprava → příjezd → výsledek:
  - žena je v A vdaná, v B je v `emigrants`,
  - lidé A + B + na cestě jsou po každém kroku stejně (bez porodů a úmrtí v okně – kontrola kronikou),
  - doprovod je zpět v B v `returnDay`.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/people packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces. Proud losu `'kin:' + day` je nový – jiné proudy se nesmí posunout.
- [ ] **Step 5: Spustit** – PASS; `nice -n 19 npm run test:slow` (zlaté otisky beze změny – vsi bez okolí).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): sňatky a další manželky se skutečnými sousedními vsemi (plán 3)`.

### Task 10: Pošta a svět – nové zprávy, zaniklé vsi, worker (Opus)

**Files:**

- Modify: `application/village-mail.ts` (krok 1 – zprávy bez nákladu do chybějící nebo spící vsi se zahodí), `application/__tests__/market-world.ts` (pomocníci: okolí obou vsí, svobodní, kovárna), `application/__tests__/village-mail.test.ts`, `application/__tests__/advance-world.test.ts`
- Modify: `docs/code/village-trade.md` (Pošta mezi vsemi – nové druhy), `docs/code/worker.md`
- Test: tytéž soubory

**Interfaces:**

- Consumes: Úlohy 1, 4, 7, 8, 9 (`kin-ask`, `smith-ask`, `order-ready`, lidé ve výsledku), plán 2 `deliverVillageMail`, `overdueResult`, `VillageStamp.asleep`.
- Produces: `deliverVillageMail` beze změny podpisu.
  - Krok 1: cíl chybí, nebo spí (`stamp.asleep`) a zpráva je `kin-ask`, `smith-ask` nebo `order-ready` → zahodí se a smaže z `outbox`. `market-arrive` dál jako v plánu 2 – chybějící cíl → `returned`, spící cíl řeší výprava po termínu.
  - Lidé ve výsledku `returned` (Úloha 8) se vrátí přes `applyMarketResult` – bez nové větve.

- [ ] **Step 1: Testy:**
  - `village-mail.test.ts`:
    - `kin-ask` do spící vsi se nezapíše a zmizí z `outbox`,
    - H prodá rodinu M, M vymře před dnem příjezdu (příjezd je už ve schránce M) → `deliverVillageMail(H)` po termínu vrátí rodinu s původními id (H `people` obsahuje původní id, `emigrants` je nemají),
    - nevěsta z B na cestě do A, A smazaná (Začít znovu archivuje sídlo) → nevěsta zpět v B.
  - `advance-world.test.ts` (svět `marketWorld()` + `refreshNearby`):
    - kola `advancePlayer` obou hráčů po zápisu `kin-ask` do schránky M dovedou nevěstu do H,
    - po každém kole je součet lidí H + M + v nákladu výprav (`outbox`, `market.visitors`, `inbox.pending`) stejný, kromě porodů a úmrtí z kroniky,
    - worker okolí obnoví jen u zastaralého (`NEARBY_REFRESH_DAYS`).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/application` – FAIL.
- [ ] **Step 3: Implementovat** krok 1 a pomocníky testů.
- [ ] **Step 4: Spustit** – PASS; `npm run test:db`.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): pošta plánu 3 – dotazy do zaniklých vsí, lidé na cestě se vracejí (plán 3)`.

### Task 11: Web – kronika, upozornění, panely a e2e (Sonnet)

**Files:**

- Modify: `apps/web/lib/village-view-chronicle.ts`, `village-notices.ts`, `horse-view.ts`, `village-view-crafts.ts`, `market-view.ts`, `apps/web/components/game/hud/MarketPanel.tsx`, `apps/web/e2e/market.spec.ts`
- Modify: `docs/code/web-ui.md`
- Test: testy pohledů vedle souborů (`apps/web/lib/__tests__/…`), `apps/web/e2e/market.spec.ts`

**Interfaces:**

- Consumes: kronika z Úloh 5–9 (`by`, `villageName`, `villageId`, `groom`, `order-ready`), `VillageState.orders`, `shoeing.asked`, `marketOverview` (plán 2 – množina vsí, které aktér smí vidět).
- Produces (jen pohled, žádná herní logika):
  - Kronika:
    - `market-departed` podle `by`: „Vesničané jeli na trh do Lhoty.“, „Správce poslal výpravu do Lhoty.“, „Kovář šel kovat koně do Lhoty.“; `kin` bez řádku – řekne to `married-away`,
    - „Nevěsta z Lhoty.“, „Ženich z Lhoty.“, „Dcera se vdala do Lhoty.“ / „Syn se přiženil do Lhoty.“, „Vojvoda <jméno> si vzal další manželku z Lhoty.“ (dosavadní text `extra-wife` + „z <ves>“), „Do vsi přišla rodina z Lhoty.“, „Kovář z Lhoty okul koně“ (Martin 14. 11. 2026), „Zakázka v Lhotě je hotová.“,
    - staré záznamy bez `villageName` beze změny.
  - Upozornění: dřívější „Nevěsta z okolí“, „Ženich z okolí“, „Dcera se vdala pryč“ se jménem vsi; kování koní bez upozornění (Martin 27. 10. a 9. 11. 2026).
  - Panel ohrady koní (Tooltip): „Kuje vlastní kovář“ / „Kovář z Lhoty“ (čeká dotaz nebo poslední kování) / „Kovář není“.
  - Řádek výrobků ve dvorci (Tooltip): „Nástroje – zakázka v Lhotě“, „… – hotová zakázka v Lhotě“; jinak jako dnes.
  - Panel Trh: nové zboží v „Dáš“ / „Dostaneš“ s ikonami a nejvýš `villageGoodStock`. Lidé ikonami `family`, `man`, `woman`. Voly pro koupený vůz spočítá server (`checkMarketTrip`), panel ukáže důvod `MARKET_NO_OXEN`.
  - **Cizí správce:** `villageName` záznamu, jehož `villageId` není v jeho `marketOverview` ani ve vsích jeho zpráv, se v kronice a upozorněních nahradí „sousední vsí“ (pomocník `maskVillageNames`, jen pohled).

- [ ] **Step 1: Testy pohledů:** pro každý nový text jeden případ se skutečným řetězcem. Starý `bride-from-outside` bez `villageName` → „Nevěsta z okolí“. Cizí správce: záznam s `villageId` vsi držitele → „Vesničané jeli na trh do sousední vsi.“. Tooltip koní pro `shoeing.asked` → „Kovář z Lhoty“.
- [ ] **Step 2: Spustit** `npx vitest run apps/web` – FAIL.
- [ ] **Step 3: Implementovat** pohledy a panel.
- [ ] **Step 4: Spustit** – PASS.
- [ ] **Step 5: E2e:** `market.spec.ts` – panel Trh ukáže nástroje a muže v „Dáš“ (dev ves s nástroji nad potřebou a volným mužem), odeslání projde a kronika ukáže „Výprava…“. Spustit sériově `npm run test:e2e -- market.spec.ts` (předtím `pgrep -f "[p]laywright test"` prázdné).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(web): kronika, panely a trh pro vesničany, kováře, lidi a sňatky (plán 3)`.

### Task 12: Návrhy, celé e2e a ověření dvou vsí (Sonnet)

**Files:**

- Create: `packages/game/src/domain/village/trade/__tests__/market-neighbours-years.test.ts` (pomalý – zapsat do `packages/game/slow-tests.ts`)
- Modify: `docs/design/markets.md` (oddíl „Rozhodnutí plánu 3 (návrh Clauda, 24. 11. 2026)“ – body 1–16 tohoto plánu zkráceně, čísla; stav „Plán 3 hotový“; Co se ověří – výsledek testu), `neighbours.md` (body 6–8 hotové), `kinship.md` (Sňatky – se skutečnými sousedy), `lord.md` (Manželky – Další manželky ze sousedních vsí; banner nahoře), `history/lord-history.md` (poznámka, že pravidlo se vrátilo se skutečnými vsemi), `horses.md` (Kování – kovář souseda, poplatek), `wagons.md` (Kování vozů – tesař pro hřivny na trh), `crafts.md` (Nákup na trhu, Zakázky), `steward.md` (Správce na trhu), `trade.md` (Výměna lidí → trh), `CLAUDE.md` (řádek `village-trade.md` v tabulce mapy kódu – okolí, zakázky, lidé)

- [ ] **Step 1: Pomalý test dvou vsí** (`market-neighbours-years.test.ts`, markets.md – Co se ověří): ves R (kovář, hrnčíř, tesař) a ves S (bez řemeslníků), obě s okolím. Na sousedních mapách 3 roky po dnech, pošta mezi nimi po každém dni jako události schránky (vzor `market-two-villages.test.ts`). Tvrdí:
  - vybavení nástroji S na konci ≥ `toolNeedKg` × 0,9 (bez trhu klesne k 0 – kontrolní běh bez okolí ve stejném testu),
  - lidé R + S + na cestě = začátek + porody − úmrtí (z kroniky), žádné id není ve dvou vsích naráz,
  - žádné `NaN` v zásobách, hladem nikdo,
  - aspoň jedna výprava `by: 'villagers'`, každá s výsledkem.
- [ ] **Step 2: Spustit** `nice -n 19 npm run test:slow` – PASS (selže-li podmínka, nehrát si s čísly – zapsat do zprávy a ozvat se).
- [ ] **Step 3: Návrhy** podle Files – Martinova slova s datem, vlastní rozhodnutí „návrh Clauda“; `grep -rn "koordinátor\|za Martina" docs/design` nic.
- [ ] **Step 4: Celé e2e** sériově `npm run test:e2e` (předtím `pgrep -f "[p]laywright test"` prázdné), pak kontroly z Global Constraints a `npm run test:db`.
- [ ] **Step 5: Commit** `docs: obchod 3 – vesničané a správce na trhu, zakázky, lidé a sňatky se sousedy (plán 3)`.

## Otázka na Martina

1. **Má si svobodná žena, která nedrží dům, hledat ženicha v sousední vsi sama, nebo se jen vdá pryč, když se na ni zeptá muž odjinud?** Doporučení: jen se vdá pryč (Rozhodnutí 11 – nevěsta jde k muži jako u svatby ve vsi; sama se ptá jen vdova a dcera z domu bez mužů, Martin 19. 10. 2026). Plán s tím počítá. Odpoví-li Martin jinak, Úloha 9 přidá ženě dotaz se šancí dřívějšího `groomPerYear` 0,1 a pohyb ženy k muži.

**Odpověď (Martin 23. 11. 2026, výběr z možností):** „Jen se vdá pryč“ – plán platí, jak je napsaný.
