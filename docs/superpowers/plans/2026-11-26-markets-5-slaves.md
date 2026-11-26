# Obchod 5 – otroci – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Odvedený pohan je od příchodu do vsi vítěze otrokem, žije jako ostatní vesničané a hráč ho smí kdykoli prodat – cizím kupcům za mince i jiné vsi na trhu; zajatý křesťan se usadí jako svobodný, pokřtěný otrok zůstává otrokem, ale prodat ho nejde, a děti otroků narozené ve vsi jsou svobodné (issue #11, plán 5 ze 6).

**Architecture:**

- **Otrok je příznak osoby** `Person.slave`. Dostane ho odvedený pohan při usazení ve vsi vítěze (`settleLed` v `applyCampaignReturn`). V simulaci se nic jiného nemění: otrok pracuje, jí, bydlí, žení se, rodí a stěhuje se jako vesničan a příznak si nese všude, kam jde jeho záznam (`rehomePeople` i kopie osoby).
- **Otroci jsou zboží lidí** `slaves` (cesty plánu 3): kus je jeden člověk, výběr dělá `sellableSlaves` (pohan, doma, mimo rod) a v `emigrantGroups` jde napřed. Otrok odchází prodat sám a bez manžela – **prodej rozvede manželství jako smrt**. Výprava, trh, pošta, návrat i zaniklé vsi jdou dnešními cestami lidí na trhu.
- **Cizí kupci otroky kupují** (`MERCHANTS.wants.slaves`) a odvezou je ze světa. V den bez otroků na trhu je trh bit po bitu stejný jako po plánu 4. Ve vlastní vsi hráč otroky nabídne počtem (`VillageState.slavesForSale`, vzor objednávky zbroje); otroci z nabídky jsou pro trh vsi rezervovaní (`offeredSlaveIds`).
- Web jen ukazuje a posílá záměry. Žádná DB migrace, žádný převod stavu, žádná nová náhoda.

**Tech Stack:** TypeScript 6 (strict), `packages/game` (doména, use-casy, Vitest), `packages/db` (kodek), `apps/web` (Next.js 16, React 19), Playwright, Blender nebo Pillow (ikona).

**Spec:**

- `docs/design/markets.md` – závazný (schváleno Martinem 22. 11. 2026): Martinova rozhodnutí (Otroci, Otrok, Co kupci kupují, Vesničané a správce), Pravidla 6 a 7, Rozhodnutí plánů 1–4.
- `docs/design/war.md` – Vzdaní, zajetí a výkupné; Ztráty (Odvedení); Kořist; Později („prodej zajatců kupcům“).
- `docs/design/christianity.md` – Víra vesničanů (víra člověka, „chybí = pohan“, dítě křesťan, je-li jím jeden z rodičů), Křest rodu.
- `docs/design/kinship.md` – Sňatky (svobodný, vdova a vdovec), Domácnosti (Rozpad domácnosti).
- `docs/design/research/2026-11-02-war.md` – 6. Zajatci a otroctví (Praha, Raffelstetten, Hedčané).
- Kód plánů 3 a 4: `trade/people-trade.ts`, `market-people.ts`, `market.ts`, `market-coins.ts`, `market-stance.ts`, `merchants.ts`, `arms-order.ts`, `application/arms-order.ts`, `war/raid-apply.ts`, `people/departure.ts` (`departLeavers`).
- Mapa kódu: `docs/code/war.md` (Výsledky nájezdu a kořist, Zajetí a výkupné), `docs/code/village-trade.md` (Lidé na trhu, Cizí kupci ve vsi, Mince a zbroj), `docs/code/village-people.md` (Příbuzenství, Odchod do nové vsi), `docs/code/village-steward.md` (správce na trhu), `docs/code/web-ui.md` (panel Trh).

## Global Constraints

- **Předpoklad:** plán 4 je sloučený ve `feat/landscape`. Musí platit (`grep -rnw <jméno> packages apps`): `applyCampaignReturn`, `settleLed`, `rehomePeople`, `emigrantGroups`, `leavingGroups`, `takePeople`, `sendPeople`, `settlePeople`, `restorePeople`, `receiveStranded`, `removePeople`, `departLeavers`, `marketTripPeople`, `marketStance`, `peopleOffer`, `keepLabor`, `coinPhase`, `coinClearing`, `merchantsArrive`, `affordableWants`, `setArmsOrder`, `reduceArmsOrder`, `orderArms`, `stewardMarketStep`, `isChristian`, `conversionDay`, `ennobleBlock`, `maskVillageNames`, `NEWCOMER_TEXTS`, `goodsNames`, `scenePersons`, `marketPreview`, `parseMarketPeopleInput`, `coinsOfWorld`, `VILLAGE_MIGRATIONS`. A nesmí existovat: `slave`, `sellableSlaves`, `slavesForSale`, `enslaveLed`, `led-settled`, `offerSlaves`. Jinak Úlohu 1 nezačínat a ozvat se. Práce běží ve větvi `feat/markets-5` z `feat/landscape`.
- **Úlohy 3a a 6a čekají na Martinovu odpověď na Otázku 1** (výběr otroků na prodej a jejich rezervace – pravidla hry mění jen Martin). Úlohy 1 a 2 smějí běžet hned; všechno ostatní stojí na Úloze 3a (Rozhodnutí 13). Plán je psaný podle doporučené odpovědi; co se při jiné odpovědi změní, píše Otázka 1 a Úlohy 3a a 6a.
- **Mimo plán 5:** zlato, šperkař a mincovna (plán 6, `gold.md`), účinek zbroje v boji, další zboží kupců, prodej zajatých mužů rodu a šlechticů (návrh Clauda „zatím ne“ – Oznámit 1), prodej a nákup otroků správcem (návrh Clauda „zatím ne“ – Oznámit 6), útěk, výkup a propuštění otroka, štěstí otroků, zvláštní zásilka otroků mezi vlastními vsemi (otrok jde jako muž, žena nebo rodina – Rozhodnutí 6).
- **Nikdo nevznikne ani nezmizí.** Člověk je vždy na jednom místě: ve vsi, v nákladu výpravy, na trhu (i u kupců v `boughtPeople` do jejich odjezdu), ve výsledku na cestě, nebo s vojskem. Ze světa jinak než smrtí odchází jediný druh lidí – **otroci koupení cizími kupci** (odjedou s nimi, Rozhodnutí 7). Přijaté ztráty jsou jen ty z dřívějších plánů (zánik obou konců pošty, odvedení do vsi bez obydlí).
- **Mince jen podle plánu 4** (Martin 25. 11. 2026: „Mince utrácí jen vojvoda/správce“): za otroky platí kupci, výpravy hráče a výpravy správce, které mince vezou. Ves (hostitel) za mince otroky nekupuje, vesničané ani správce otroky nekupují. Mince za prodané otroky přibudou tomu, kdo prodal.
- **Kusy celé:** otrok je jeden člověk, počty otroků jsou celá čísla.
- **Žádná pravidla navíc:** nové hodnoty jsou jen `TRADE_GOOD_VALUES.slaves` (360 kg obilí, nese 0 – Rozhodnutí 6) a `MERCHANTS.wants.slaves` = 10 (Rozhodnutí 7), obě s odkazem „markets.md – Rozhodnutí plánu 5, bod N“. Nové technické meze nejsou. Otrok neutíká, štěstí nemění, práci ani jídlo nemá jinak než vesničan.
- **Hexagon:** doména a use-casy bez infrastruktury (hlídá ESLint), web i worker volají stejné use-casy, **žádná herní logika ve webu** – ani kdo jde prodat, ani cena otroka (počítá ji pohled na serveru přes `coinPriceOf`, jako u zbroje).
- **Determinismus:** bez `Math.random`, `Date.now()`, `new Date()`. Výběr otroků je pevný (od nejnižšího id), nová náhoda nevzniká. Rezervace otroků z nabídky se spočte jednou z celé vsi a předá dál (Rozhodnutí 8). Dopočet po kouscích i vcelku dá týž stav.
- **Stav vsi:** nové části jsou volitelné a chybí, dokud se nepoužijí (`Person.slave`, `VillageState.slavesForSale`, `TradePeople.slaves`, `female` v zápisu `newcomer`). `VILLAGE_MIGRATIONS` se nemění (žádný převod). Kodek ani DB migrace se nemění (stav je obecný JSON – ověří test kodeku v Úloze 4).
- **Zlaté otisky se nesmí změnit:** ves bez otroků simuluje bit po bitu jako dnes a trh bez otroků jako po plánu 4. Měnit se smějí jen tyto testy: výčty lidí a kusového zboží (`market-clearing.test.ts`, `MarketPanel.test.tsx`, `trade-names.test.ts`), testy, které porovnávají celé `Emigrants` (přibude prázdné `slaves`), testy pohledu dvorce a panelů, které porovnávají celé `market.stock` (přibude `slaves: 0` – `marketField` v `manor-view.ts` píše každé zboží i s nulou), testy a e2e, které počítají řádky „Dostaneš“ (přibude řádek otroků – `MarketPanel` vypisuje všechno zboží kromě mincí), a testy, které porovnávají seznam kupců (`MERCHANTS.wants`) nebo zápis `merchants-arrived` složený z něj (`market-merchants.test.ts`, kronika plánu 4). `market-trip-people.test.ts` (celé `stock`) se nemění – `stock.slaves` je jen > 0. Selže-li `*golden*.test.ts` nebo jiný test plánů 2–4, je to chyba úlohy.
- **Pasti plánů 3 a 4:**
  - stav po předchozích úlohách ověř `grep -rnw` dřív, než na něj navážeš, a testy tvrdí skutečné hodnoty (id, kusy, mince, den),
  - nic drahého při každém pohledu: `sellableSlaves` je jeden průchod lidmi bez simulace,
  - smyčky přes `TRADE_GOODS`, které volají `addGood`, otroky přeskočí jako ostatní lidi (`isPeopleGood`),
  - chybějící `TradePeople.slaves` je 0, nikdy `undefined` v součtu; TypeScript neukáže místa, která skládají lidi výslovně z rodin, mužů a žen – jejich seznam je v Úlohách 3a a 8a,
  - rezervace otroků z nabídky se počítá z celé vsi jednou a předává se dál – přepočet ze vsi zmenšené o odešlé vybere jiné lidi než `leavingGroups` (Úloha 6a),
  - správce cizí vsi nevidí jména ostatních vsí držitele (`maskVillageNames`) – ani u otroka, který přišel z trhu,
  - v kronice žádná „0“ (prázdné části věty se vynechají).
- **Rozhraní jako v 0 A.D.:** ikony a čísla, slova jen v `Tooltip` a kronice.
- **Kontroly na konci každé úlohy:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:docs` a `nice -n 19 npm run test`. Úlohy 1, 3a, 4, 5, 6a a 9 navíc `nice -n 19 npm run test:slow`, Úlohy 9 a 10 `npm run test:db`. E2e jen v Úlohách 8b a 10 – Úlohy 7 a 8a mění HUD a e2e výslovně odkládají do 8b (`market.spec.ts`) a 10 (celé e2e); sériově: `pgrep -f "[p]laywright test"` předtím nesmí nic vrátit.
- **`docs/code/`:** úloha, která přidá nebo přejmenuje jméno, opraví v téže úloze mapu kódu (jinak padne `check:docs`). Návrhy v `docs/design/` až v Úloze 10 (výsledek ověření do `markets.md` zapíše Úloha 9).
- **Jazyk a zápis:** česky komentáře i docs, krátká pomlčka „–“. Vlastní rozhodnutí jsou „návrh Clauda“, Martinova slova s datem. Commity Conventional Commits česky, `Refs #11`, na konci `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Agenti:** žádní subagenti, žádné `sleep` v popředí, `pkill`, `rm -rf`, `git stash` ani `git branch -D`. Neslučovat, nepushovat. Nejvýš ≈ 120 kroků na úlohu. DB `bohemia` jen ke čtení. Měření na víc vsích se nespouští – ověřuje se testem dvou vsí s kupci (Úloha 9) a přepočtem Vlkova.

## Martinova rozhodnutí k plánu 5

Z `markets.md` – Martinova rozhodnutí (22. 11. 2026) doslova; Pravidla 6 a 7 jsou návrh Clauda, schválený s celým návrhem 22. 11. 2026 („Ano“):

1. **Otroci:** na otázku, koho smí ves prodat jako otroka: „Zajatce a to ještě navíc pohany. Křesťany do lze usídlit ve vlastní vesnici, ale nelze je prodat“ – Rozhodnutí 1 a 2.
2. **Otrok:** na otázku, zda jde zajatého pohana prodat jen hned po odvedení, nebo kdykoli, dokud je pohan: „Kdykoliv. Od zajetí bude prostě vedený jako otrok“ – Rozhodnutí 1 a 8.
3. **Co kupci kupují:** „Cizí kupci nakupují zlato, šperky (tj. zlato, ale o polovinu dráž), med, vosk, kožešiny a otroky. Klidně to může být tak, že vojvoda vsi na kupecké stezce nakupuje všechny tyto komodity od okolních vsí aby je pak mohl sám výhodně prodat cizím kupcům“ – Rozhodnutí 7 a 8.
4. **Pravidla 6 a 7** (návrh Clauda, schválený s celým návrhem 22. 11. 2026 („Ano“)): kupci kupují i pohanské zajatce; děti otroka narozené ve vsi jsou svobodné; pokřtěný otrok zůstává otrokem, ale prodat ho už nejde – prodat smí jen pohana; víra je víra člověka (`Person`), ne vsi – Rozhodnutí 3 a 5.
5. **Správce** (Martin 22. 11. 2026 u lovu): „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“ – Rozhodnutí 8 se od toho zatím odchyluje (Oznámit 6).
6. Z války: odvedení se ve vsi vítěze usadí jako lidé (war.md – Ztráty, Martin 18. 10. 2026) a šlechtice je cílem „spíš zajmout než zabít, protože za něj může požadovat výkupné“ (Martin 2. 11. 2026) – Rozhodnutí 1 a 4, Oznámit 1. Z plánu 4: „Mince utrácí jen vojvoda/správce“, „Hráč zadá počet“ a „Pokud se lidéí někam stěhují, berou si úplně vše“ (Martin 25. 11. 2026) – Rozhodnutí 4, 8 a 9, Oznámit 5.

## Co hra už zná (ověřeno `grep -rnw` 26. 11. 2026)

- **Zajetí** (`docs/code/war.md` – Zajetí a výkupné): muže rodu a šlechtice vojsko zajme k výkupnému – `Prisoner` ve `VillageState.prisoners` věznitele, osoba zůstává ve stavu domovské vsi s `away { kind: 'captive' }`, věznitel ji drží, propustí nebo popraví (`decidePrisoner`), výkupné jednáním (`ransomHooks`). „Captive“ v kódu znamená zajatce k výkupnému (`away.kind 'captive'`, `markCaptive`, `war/captive.png`) – nová jména pro odvedené jsou proto `enslaveLed` a `led-settled`.
- **Odvedení** (Výsledky nájezdu a kořist): ostatní vzdaní (ženy, děti, vesničané) jsou `led` – snímky osob ke dni nájezdu jdou s vojskem (`CampaignLoot.people`) a při návratu tažení se usadí ve vsi shromaždiště (`applyCampaignReturn` → `settleLed`: `rehomePeople` s novými id, bez `line`, `noble`, `mainWifeSon` a `away`, dům `newcomerHome`; bez obydlí nepřijdou). Obyčejné lidi tedy válka zajímá – nic se nedoplňuje.
- **Víra:** `Person.faith` (`'christian'`, chybí = pohan), `isChristian`, obrácení dospělých pohanů 1. 1. jen ve vsi pokřtěného rodu (`conversionDay`), dítě je křesťan, je-li jím jeden z rodičů (`populationDay` – nové dítě je čerstvý záznam, nic jiného nedědí).
- **Lidé na trhu** (plán 3): `PeopleGood` `families | men | women`, `PEOPLE_GOODS` na konci `TRADE_GOODS`, výběr `emigrantGroups` (rodiny, muži, ženy; ne dvorec, dědic, rozpad domácnosti, `keptByLine`), `MarketPerson` s celými záznamy osob, odchod `takePeople` / `sendPeople`, příchod `settlePeople`, návrat `restorePeople`, zaniklá ves `receiveStranded`. `rehomePeople` kopíruje všechny údaje osoby kromě vazeb ven a `away: journey`. Odcházely jen celé rodiny (`familiesOf`) a svobodní 16–44 let (`nextSingle`, `isSingle`) – dítě samo ani ženatý člověk bez manžela nikdy.
- **Manželství při odchodu:** `sendPeople` zkopíruje záznamy celé (i se `spouseId`), `removePeople` (`people/kinship.ts`) ovdoví toho, kdo ve vsi zůstal, `restorePeople` vrátí záznam, se kterým člověk odešel. `departLeavers` (`people/departure.ts`) v kopii maže `spouseId`, jehož manžel zůstal („manžel zůstal ve staré vsi … v nové vsi je ovdovělý“). Porod hledá otce v domě matky, mimo dům jen u vedlejší manželky (`fatherOf` v `populationDay` – muž, jehož `spouseId` není matka).
- **Kupci** (plán 4): `merchantsArrive` (seznam `MERCHANTS.wants` – med, vosk, kožešiny), zápočet i mincovní fáze (`coinPhase`, `coinClearing` – kupující jde po prodávajících v pořadí stran, hostitel a pak výpravy, a u každého v pořadí `TRADE_GOODS`; hladina `nextLevel` z C = Σ min(mince, hodnota seznamu)), poptávka do ceny jen u zboží na trhu (`affordableWants`), odjezd bez pošty (`departVisitors` – co kupci koupili, zmizí ze světa), objednávka zbroje (`setArmsOrder`, `armsBuyer`, `reduceArmsOrder`, use-case `orderArms`, akce `orderArms`).
- **Web:** pohled osoby je `ScenePerson` / `scenePersons` (`apps/web/lib/person-view.ts`, už nese `christian?: true`); náhled výpravy skládá lidi z odpovědi serveru (`use-market-people.ts`, `parseMarketPeopleInput`, `marketPeopleForPlayer`, `marketPreview`) a zná jen rodiny, muže a ženy.
- **Otroci:** hra je nezná – žádné jméno z výčtu „nesmí existovat“ v Předpokladu.

## Rozhodnutí plánu (návrh Clauda)

1. **Kdo je otrok.** Otrokem je **odvedený pohan** (Martin 22. 11. 2026: „Zajatce a to ještě navíc pohany“; otázka Otrok mluvila o prodeji „hned po odvedení“). Příznak `Person.slave` dostane při usazení ve vsi vítěze (`settleLed`) – „od zajetí“ ve smyslu od chvíle, kdy je v jeho vsi; na cestě s vojskem je kořist tažení a prodat ho nejde. Mechanika zajímání se nemění. Zajatí muži rodu a šlechtici (`Prisoner`) otroky nejsou, zůstávají k výkupnému a kupcům se zatím neprodávají (Oznámit 1).
2. **Zajatý křesťan** se usadí jako dnes a příznak nedostane (Martin 22. 11. 2026: „Křesťany do lze usídlit ve vlastní vesnici, ale nelze je prodat“). Kdo už otrokem byl (pokřtěný otrok odvedený podruhé), příznak si nese – nic se nemaže.
3. **Pokřtěný otrok zůstává otrokem** (Pravidla 7): obrácení (`conversionDay`) se nemění a příznak nesmaže; prodat jde jen otroka-pohana (`canBeSold`).
4. **Otrok ve vsi = vesničan** (co nejblíž dnešku – odvedení se už teď usazují jako vesničané, Martin 18. 10. 2026): pracuje, jí, bydlí, žení se a vdává, rodí, obrací se na víru a stěhuje se s ostatními (odchod části i celé vsi – Martin 25. 11. 2026: „berou si úplně vše“ –, ves syna, zásilky, sňatky se sousedy). Neutíká a štěstí nemění. Příznak si nese všude (Oznámit 2): otrokyně vdaná do sousední vsi (`receiveKin` → `rehomePeople`) je tam dál otrokyní; otroci brání ves a jdou do odvodů jako vesničané; propuštěná vedlejší manželka – otrokyně a pohanka – je po křtu rodu zase na prodej; ve vsi nepokřtěného rodu se otrok nepokřtí (obrácení jen u pokřtěného rodu). Povýšený otrok (`settleNoble` dá `noble` a `line`) příznak nese a prodat ho nejde (`canBeSold` – `noble`); `ennobleBlock` se nemění.
5. **Děti** narozené ve vsi jsou svobodné (Pravidla 7) – nové dítě příznak nedědí, i když jsou otroky oba rodiče.
6. **Otroci jako zboží** `slaves` – kus = jeden člověk:
   - hodnota 360 kg obilí (24 mincí) jako svobodný dospělý (Rozhodnutí plánu 3, bod 4), nese 0 (jdou po svých),
   - prodat jde otrok-pohan (`canBeSold` – ne muž rodu ani šlechtic), který je doma (`isAway` ne) a není manželkou muže rodu (`keptByLine`); `sellableSlaves` je řadí od nejnižšího id (kdo přišel dřív, jde dřív),
   - **každý se prodává sám** – manžel a děti s ním neodcházejí a i malé dítě-otrok jde prodat samo za cenu dospělého (24 mincí; v plánu 3 dítě samo nikdy neodcházelo); domácnost bez dospělého se přestěhuje jako po smrti (population.md – Rozpad domácnosti). Platí doporučená odpověď na Otázku 1; jiná odpověď mění jen výběr (Úloha 3a) a rezervaci (Úloha 6a) – co přesně, píše Otázka 1,
   - **prodej rozvede manželství jako smrt:** otrok odchází prodat sám a bez manžela – `sendPeople` u skupin `slaves` smaže v kopii `spouseId`, jehož manžel ve skupině není (vzor `departLeavers`), manžel ve vsi ovdoví (`removePeople`) a smí se znovu oženit; neprodaný se vrátí bez manžela (`restorePeople` i `receiveStranded` vracejí tuto kopii), prodaný se u kupující vsi usadí bez manžela (`rehomePeople`). Obnovit sňatek po návratu se nebere – partner se mezitím smí znovu oženit,
   - `emigrantGroups` bere napřed otroky, pak rodiny, muže a ženy ze zbytku; `PEOPLE_GOODS` = `['slaves', 'families', 'men', 'women']`, takže postupné `takePeople` vybere totéž. „Otroci napřed“ mění oznámené „rodiny napřed“ plánu 3 (markets.md – Rozhodnutí plánu 3, bod 10; Oznámit 3),
   - otrok smí odejít i jako svobodný muž, žena nebo rodina (výměna, zásilka, výprava) – příznak si nese.
7. **Kdo otroky kupuje:** cizí kupci – `MERCHANTS.wants.slaves` = 10 za průjezd (návrh Clauda; kupují z měšce, nebo za zbroj v zápočtu – z měšce 60 mincí za výchozí cenu dva, s mincemi za prodanou zbroj víc) – a výpravy hráčů, které je mají v „Dostaneš“. Hostitel podle výpočtu potřeby otroky neshání, správce ani vesničané je nekupují.
   - Kupci kupují za mince i zápočtem (zbroj za otroky). V mincovní fázi kupují od prodávajících v pořadí stran – hostitel, pak výpravy podle příjezdu – a u každého v pořadí `TRADE_GOODS` (med, vosk a kožešiny před otroky); otroky hostitele nebo dřívější výpravy tedy koupí dřív než med pozdější výpravy.
   - Koupení otroci odjedou s kupci ze světa (`departVisitors` beze změny – kupec domov nemá).
   - **V den, kdy na trhu nikdo otroky nenabízí** (hostitel podle `stance.offer.slaves`, výpravy z nákladu), se seznam otroků kupců nepočítá (zápočet, cena, hladina C ani mincovní fáze) – trh je bit po bitu jako po plánu 4.
8. **Kdo otroky prodává:** hráč, kdykoli (Martin 22. 11. 2026: „Kdykoliv“).
   - Výpravou: otroci v „Dáš“ jako ostatní lidé, i do vsi u stezky v den kupců (den příjezdu zná zpráva na pivo – plán 4, bod 8).
   - Ve vlastní vsi **nabídkou** `VillageState.slavesForSale` (počet, vzor `armsOrder` – podle Martinova „Hráč zadá počet“ u zbroje, 25. 11. 2026; Oznámit 5): ves nabízí min(nabídka, prodejní otroci) na svém trhu kupcům i výpravám, o prodané se nabídka zmenší a nula ze stavu zmizí.
   - **Otroci z nabídky jsou rezervovaní:** prvních `slavesOffered` ze `sellableSlaves` (`offeredSlaveIds`) se na trhu vsi jako rodina, muž ani žena nevybírají. Jedna množina, spočtená jednou z celé vsi, platí pro nabídku hostitele (`marketStance`), prodej (`settleTrades`), mincovní fázi (`coinPhase`) i výpravu správce (`stewardMarketStep` – plán i odchod). Dospělí z ní se odečtou od rozpočtu lidí, které ves nabízí sama (`peopleOffer`), a práce vsi se kontroluje bez nich (`keepLabor`), aby ves nedala víc lidí, než unese. Výprava hráče, `villageGoodStock` a zásilky rezervaci neberou – hráč smí otroka z nabídky poslat i výpravou, nabídka se pak spočte ze zbylých.
   - **Správce otroky zatím neprodává ani nekupuje** (otroci ve vsi pracují jako ostatní): jeho roční výprava je z nabídky vsi vynechá a nabídku nezadává, ves správce ani NPC rodu je proto kupcům nenabídne. Kdy by je měl prodat, je pravidlo, které Martin nedal (Martinova rozhodnutí, bod 5; Oznámit 6). Vesničané lidi nevozí (beze změny).
9. **Pošta a zaniklé vsi** beze změny plánu 3: otrok prodaný jiné vsi se u ní usadí jako otrok s novým id, neprodaný se vrátí s původním id a bez manžela (bod 6), zanikne-li ves kupujícího, jde otrok zpět k hostiteli (`stranded-people`; vlastní otrok hostitele s původním id, bez `spouseId`). Kupci na trhu zaniklé vsi odjedou i s koupenými otroky (`merchantsLeave`). Nabídka `slavesForSale` se odchodem celé vsi nepřenáší (jako `armsOrder`); otroci odejdou s ostatními.
10. **Rozhraní** (jako v 0 A.D.): odznak „Otrok“ v panelu osoby (`ScenePerson.slave`; u pokřtěného „Otrok – pokřtěný, prodat ho nejde“), počet otroků v panelu dvorce, otroci v „Dáš“ a „Dostaneš“ panelu Trh (náhled výpravy počítá otroky jako server), prodej ve vlastní vsi (ikona, cena v mincích, `Stepper`). Panel zajatců se nemění (šlechtici k výkupnému); ikona otroka se od ikony zajatce liší.
11. **Kronika a upozornění:** nový zápis `led-settled` (kolik odvedených se usadilo jako otroci a kolik svobodně) a upozornění – v obecném mužském rodě jako ostatní počty lidí („1 křesťana“ i u ženy); trh, příchod otroka a příjezd kupců dnešními zápisy s novým zbožím. Příchod a návrat jednoho otroka nese pohlaví (`newcomer.female`, vzor `birth`) – „Přišla otrokyně“. Bez nul.
12. **Převod stavu žádný:** nová pole jsou volitelná. Odvedení usazení před plánem 5 zůstávají svobodní – nejde je poznat (Oznámit 1).
13. **Pořadí úloh:** 1 příznak a odvedení; 2 ikona; 3a otroci jako zboží – doména; 3b věty webu; 4 otroci mezi vsemi a manželství; 5 kupci; 6a prodej ve vlastní vsi – nabídka, rezervace a správce; 6b use-case, práva a akce; 7 web – osoba, dvorec, kronika; 8a web – náhled výpravy a prodej v panelu Trh; 8b e2e; 9 test světa a Vlkov; 10 návrhy. 3a potřebuje 1, 2 a odpověď na Otázku 1; 3b a 4 potřebují 3a; 5 potřebuje 3b (věta příjezdu) a 4; 6a potřebuje 5 a odpověď na Otázku 1; 6b potřebuje 6a; 7 potřebuje 3b; 8a potřebuje 6b a 7; 8b potřebuje 8a; 9 všechny předchozí; 10 poslední. Úlohy jdou po sobě – sdílejí soubory.

## Review Focus

1. **Otrok, který je pryč, pokřtěný, z rodu nebo manželka muže rodu**, a výprava se `slaves` i `men` z týchž lidí: výběr je přeskočí, nikdo neodejde dvakrát a výběr pro nabídku, kontrolu i odchod souhlasí. Test v Úloze 3a.
2. **Ženatý otrok odejde prodat sám:** manžel ve vsi ovdoví, neprodaný se vrátí bez manžela (i otrok hostitele vrácený ze zaniklé vsi kupujícího), porod mu nenajde partnera mimo dům; žádné jednostranné `spouseId` kromě vedlejších manželek mužů rodu. Test v Úloze 4, denní invariant v Úloze 9.
3. **Ves kupujícího nebo hostitele zanikne, když je otrok na cestě**, a kupci odjíždějí z trhu zaniklé vsi: otrok se nevytratí ani nezdvojí – jediný odchod ze světa je s kupci. Test v Úlohách 4 a 5.
4. **Trh bez otroků s kupci, kteří mají velký měšec** (po prodeji zbroje): ceny, hladina i obchody bit po bitu jako po plánu 4. Test v Úloze 5.
5. **Otroci z nabídky se jako muž, žena ani rodina nevyberou** (nabídka, prodej zápočtem, mincovní fáze, výprava správce – podle id); **nabídka vyšší než zásoba, pokřtění otroka mezi zadáním nabídky a dnem kupců, nabídka po částečném prodeji:** ves nikdy neprodá křesťana ani víc, než má; zbytek nabídky čeká. Test v Úloze 6a.
6. **Náhled výpravy s otroky ve webu** dá tytéž nosiče a týž důvod odmítnutí jako `planMarketTrip`. Test v Úloze 8a.
7. **Dopočet po kouscích** přes dny kupců a návraty výprav s otroky: týž stav jako vcelku. Test v Úloze 9.
8. **Cizí správce** vidí příchod otroka z trhu bez jména vsi („ze sousední vsi“). Test v Úloze 7.

## Mapa souborů

Složka `packages/game/src/domain/village/`, není-li uvedeno jinak.

| Úloha | Soubory                                                                                                                                                                                                                                                                                                                                                                                     | Co                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1     | `types/types-people.ts`, `types/types-chronicle.ts`, `people/slaves.ts` (nový), `index.ts`, `packages/game/src/domain/war/raid-apply.ts`, `apps/web/lib/village-view-chronicle.ts`, `apps/web/lib/village-notices.ts`, `apps/web/lib/village-view-types.ts`                                                                                                                                 | příznak otroka a odvedení pohané                    |
| 2     | `apps/web/public/icons/resources/slave.png` (nový), `apps/web/public/icons/LICENSES.md`, `tools/blender/icons.py`, `apps/web/lib/village-notices.ts`                                                                                                                                                                                                                                        | ikona                                               |
| 3a    | `types/types-trade.ts`, `types/types-chronicle.ts`, `trade/goods.ts`, `trade/slaves.ts` (nový), `trade/people-trade.ts`, `trade/market-people.ts`, `trade/market-trip.ts`, `rules/rules-trade.ts`, `index.ts`, `apps/web/lib/trade-names.ts`, `apps/web/lib/village-notices.ts`                                                                                                             | otroci jako zboží – doména                          |
| 3b    | `apps/web/lib/trade-names.ts`, `apps/web/lib/village-view-chronicle.ts`, `apps/web/lib/village-notices.ts`                                                                                                                                                                                                                                                                                  | věty webu                                           |
| 4     | `trade/market-people.ts` (`sendPeople`); opravy jen kde test selže (`trade/market.ts`, `trade/market-trip.ts`, `packages/game/src/application/village-mail.ts`)                                                                                                                                                                                                                             | otroci mezi vsemi a manželství                      |
| 5     | `rules/rules-merchants.ts`, `trade/market.ts`, `trade/merchants.ts`                                                                                                                                                                                                                                                                                                                         | kupci kupují otroky                                 |
| 6a    | `types/types-state.ts`, `trade/slaves.ts`, `trade/people-trade.ts`, `trade/market-people.ts`, `trade/market-stance.ts`, `trade/market.ts`, `trade/market-trip.ts`, `steward/steward-market.ts`, `packages/game/src/domain/vassalage/spare.ts`, `index.ts`                                                                                                                                   | prodej ve vlastní vsi – nabídka, rezervace, správce |
| 6b    | `packages/game/src/application/slaves.ts` (nový), `packages/game/src/application/rights.ts`, `packages/game/src/application/index.ts`, `apps/web/lib/village-input.ts`, `apps/web/lib/village.ts`, `apps/web/app/game/actions/market.ts`                                                                                                                                                    | use-case, práva, vstup a akce                       |
| 7     | `apps/web/lib/person-view.ts`, `apps/web/components/game/hud/selection/people.tsx`, `apps/web/lib/manor-view.ts`, `apps/web/components/game/hud/ManorPanel.tsx`                                                                                                                                                                                                                             | web – osoba, dvorec, kronika                        |
| 8a    | `apps/web/components/game/hud/use-market-people.ts`, `apps/web/lib/village-input.ts`, `apps/web/lib/market-view.ts`, `apps/web/lib/village.ts`, `apps/web/app/game/actions/market.ts`, `apps/web/lib/manor-view.ts`, `apps/web/components/game/hud/MarketPanel.tsx`, `apps/web/components/game/village-game/village-commands.ts`, `apps/web/components/game/village-game/VillagePanels.tsx` | web – náhled výpravy a prodej v panelu Trh          |
| 8b    | `apps/web/e2e/market.spec.ts` (a e2e, které počítají řádky „Dostaneš“)                                                                                                                                                                                                                                                                                                                      | e2e                                                 |
| 9     | `trade/__tests__/market-slaves-years.test.ts` (nový), `packages/game/slow-tests.ts`, `docs/design/markets.md` (výsledek)                                                                                                                                                                                                                                                                    | test světa a Vlkov                                  |
| 10    | `docs/design/*`, `docs/code/*`, `CLAUDE.md`                                                                                                                                                                                                                                                                                                                                                 | návrhy, celé e2e                                    |

Testy a mapa kódu každé úlohy jsou v jejích Files.

---

### Task 1: Otrok – příznak osoby a odvedení pohané (Sonnet)

**Files:**

- Modify: `types/types-people.ts` (`Person.slave?`), `types/types-chronicle.ts` (`led-settled`), `packages/game/src/domain/war/raid-apply.ts` (`settleLed` vrací počty, `applyCampaignReturn` zapíše kroniku), `index.ts` (export)
- Create: `people/slaves.ts`
- Modify (web, aby prošel typecheck): `apps/web/lib/village-view-chronicle.ts` (věta), `apps/web/lib/village-notices.ts` (upozornění `led-settled`), `apps/web/lib/village-view-types.ts` (pole zápisu, je-li tam výčet)
- Modify: `docs/code/war.md` (Výsledky nájezdu a kořist – odvedení pohané jsou otroci), `docs/code/village-people.md` (nový bod „Otroci“ za „Příbuzenství a pohlaví“)
- Test: `people/__tests__/slaves.test.ts` (nový), `packages/game/src/domain/war/__tests__/raid-apply.test.ts`, `people/__tests__/population.test.ts`, `people/__tests__/conversion.test.ts`, `apps/web/lib/__tests__/village-view-chronicle-markets5.test.ts` (nový), `apps/web/lib/__tests__/village-notices.test.ts`

**Interfaces:**

- Consumes: `isChristian` (`people/faith.ts`), `rehomePeople`, vzor testů `applyCampaignReturn` v `raid-apply.test.ts`.
- Produces:

```ts
// types/types-people.ts (Person)
/**
 * Otrok (markets.md – Pravidla 7; Martin 22. 11. 2026: „Od zajetí bude prostě vedený jako otrok“):
 * odvedený pohan od usazení ve vsi vítěze. Trvalé – pokřtěním nezmizí, děti ho nedědí. Chybí – svobodný.
 */
slave?: true;
// people/slaves.ts
export function isSlave(p: Person): boolean;
/** Otroka jde prodat (Pravidla 7 – jen pohana; Rozhodnutí plánu 5, bod 6): otrok, ne křesťan, ne `line`, ne `noble`. */
export function canBeSold(p: Person): boolean;
/**
 * Odvedený se stane otrokem, je-li pohan (mutuje záznam); křesťan zůstane, čím byl (Rozhodnutí 1 a 2).
 * „Led“, ne „captive“ – captive je v kódu zajatec k výkupnému (`away.kind 'captive'`).
 */
export function enslaveLed(p: Person): void;
// types/types-chronicle.ts (ChronicleEvent)
| { kind: 'led-settled'; slaves: number; free: number }
```

- `settleLed` volá `enslaveLed` na každé usazené osobě a vrací `{ slaves, free }` jen za ty, kdo dostali dům (kdo nepřijde, se nepočítá). `applyCampaignReturn` přidá `{ day, kind: 'led-settled', slaves, free }`, jen když je součet > 0.
- Web: věta „Z tažení přivedli {otroci}{ a }{křesťané}.“ – otroci ve 4. pádě „1 otroka / 2 otroky / 5 otroků“, svobodní „1 křesťana / 2 křesťany / 5 křesťanů“ – obecný mužský rod i u žen (Rozhodnutí 11), nulová část se vynechá. Upozornění `led-settled`, `tone: 'info'`, text „Z tažení přivedli otroky“ (slaves > 0), jinak „Z tažení přivedli křesťany“, ikona `/icons/resources/slave.png` až po Úloze 2 (do té doby bez ikony).

- [ ] **Step 1: Testy:**
  - `raid-apply.test.ts`: `applyCampaignReturn` s `people` = pohan (id 5), jeho žena pohanka (6), jejich dítě 4 roky (7) a křesťanka (8, `faith: 'christian'`) – ve vsi přibudou čtyři lidé s novými id, tři se `slave: true`, křesťanka bez; vazby muž–žena–dítě zůstanou; kronika obsahuje `{ kind: 'led-settled', slaves: 3, free: 1 }`. Snímek s `faith: 'christian', slave: true` si příznak nese (počítá se do `slaves`). Ves bez obydlí – nikdo nepřijde, zápis není.
  - `slaves.test.ts`: `canBeSold` – otrok-pohan true; pokřtěný otrok false; svobodný pohan false; otrok s `line` nebo `noble` false. `enslaveLed` křesťanovi příznak nedá.
  - `population.test.ts` (vzor testu dědění víry): dítě dvou otroků narozené v `populationDay` nemá `slave`.
  - `conversion.test.ts`: otrok-pohan pokřtěný v `conversionDay` má dál `slave: true` a `canBeSold` je false.
  - `rehomePeople` (v `slaves.test.ts`): příchozí si `slave: true` nese.
  - Web: `led-settled` (3, 1) → „Z tažení přivedli 3 otroky a 1 křesťana.“; (1, 0) → „Z tažení přivedli 1 otroka.“; (5, 0) → „Z tažení přivedli 5 otroků.“; (0, 2) → „Z tažení přivedli 2 křesťany.“; upozornění podle textu výš.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/war/__tests__/raid-apply.test.ts packages/game/src/domain/village/people apps/web/lib/__tests__/village-view-chronicle-markets5.test.ts apps/web/lib/__tests__/village-notices.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** testy ze Step 2 a `npx vitest run packages/game/src/domain/war` – PASS; zlaté otisky beze změny.
- [ ] **Step 5: Mapa kódu**, kontroly z Global Constraints (s `test:slow`), commit `feat(game): odvedení pohané jsou otroci (plán 5)`.

### Task 2: Ikona otroka (Sonnet)

**Files:**

- Create: `apps/web/public/icons/resources/slave.png` (64 × 64)
- Modify: `apps/web/public/icons/LICENSES.md` (řádek ikony), `tools/blender/icons.py` (nová funkce), `apps/web/lib/village-notices.ts` (ikona upozornění `led-settled` z Úlohy 1)
- Test: `apps/web/lib/__tests__/trade-names.test.ts`

**Interfaces:**

- Produces: `resources/slave.png` – postava ve stylu `resources/man.png` s obojkem a řetězem, **na první pohled odlišná od `war/captive.png`** (spoutané ruce – zajatec k výkupnému, panel Zajatci ji používá dál). Použijí ji Úlohy 3a (`TRADE_GOOD_NAMES.slaves.icon` = `slave`), 7 a 8a.
- Render z `tools/blender/icons.py` z modelu `models/people/man.glb` je **odvozené dílo 0 A.D. – CC BY-SA 3.0, Wildfire Games** (jako `war/captive.png` a `resources/man.png`, hlavička `LICENSES.md`), ne CC0 – řádek licence to napíše výslovně i s odkazem na `models/people/LICENSES.md`. Není-li Blender v prostředí, nakreslit v Pillow stylem `tools/blender/arms_icons.py` bez cizího modelu (vlastní dílo, CC0) a říct to ve zprávě. Grafika z cizích zdrojů se nepřidává.

- [ ] **Step 1: Test** (`trade-names.test.ts`): existuje `public/icons/resources/slave.png` a `LICENSES.md` má řádek se `slave.png`.
- [ ] **Step 2: Spustit** `npx vitest run apps/web/lib/__tests__/trade-names.test.ts` – FAIL.
- [ ] **Step 3: Ikonu** vyrobit (porovnat vedle `war/captive.png` – musí jít rozlišit), zapsat licenci, doplnit ikonu upozornění `led-settled`; test – PASS.
- [ ] **Step 4:** kontroly, commit `feat(web): ikona otroka (plán 5)`.

### Task 3a: Otroci jako zboží – výběr, zásoba a výprava (Opus)

**Čeká na Martinovu odpověď na Otázku 1** (Předpoklad). Ženatý otrok, který odchází prodat sám (manželství), je Úloha 4 – přípravky této úlohy mají otroky neženaté.

**Files:**

- Modify: `types/types-trade.ts` (`PeopleGood`, `TradePeople.slaves?`, `NewcomerGroup`), `types/types-chronicle.ts` (`female?` v zápisu `newcomer`), `trade/goods.ts` (`PEOPLE_GOODS`, `PEOPLE_GROUP`), `trade/people-trade.ts` (`Emigrants.slaves`, `emigrantGroups`, `emigrantList`, `tradePeopleCount`), `trade/market-people.ts` (`GROUP_GOOD`, `peopleOf`, `female` v kronice `newcomer` u `settlePeople` a `restorePeople` / `receiveStranded`), `trade/market-trip.ts` (`marketTripPeople` – `stock.slaves`), `rules/rules-trade.ts` (`TRADE_GOOD_VALUES.slaves`), `index.ts` (export `sellableSlaves`)
- Create: `trade/slaves.ts` (`sellableSlaves`)
- Modify (web – jen záznamy, bez nichž neprojde typecheck): `apps/web/lib/trade-names.ts` (`TRADE_GOOD_NAMES.slaves`, `NEWCOMER_TEXTS.slave`), `apps/web/lib/village-notices.ts` (`NoticeKind` `newcomer-slave` a `newcomer-back-slave` – šablona `newcomer-${group}` v `newcomerNotice`)
- Modify: `docs/code/village-trade.md` (nový bod „Otroci na trhu“ za „Lidé na trhu“)
- Test: `trade/__tests__/slaves-trade.test.ts` (nový), `trade/__tests__/market-trip-people.test.ts`, `trade/__tests__/market-clearing.test.ts` (výčet), `apps/web/lib/__tests__/trade-names.test.ts` (dnešní test ikon), `apps/web/components/game/hud/__tests__/MarketPanel.test.tsx` a testy pohledu dvorce (výčet a `market.stock.slaves: 0` – Global Constraints)

**Interfaces:**

- Consumes: `canBeSold` (Úloha 1), `isAway`, `keptByLine`, ikona `slave` (Úloha 2).
- Produces:

```ts
// types/types-trade.ts
export type PeopleGood = 'slaves' | 'families' | 'men' | 'women';
export interface TradePeople {
  families: number;
  men: number;
  women: number;
  /** Otroci po jednom (markets.md – Rozhodnutí plánu 5, bod 6); chybí = 0. */
  slaves?: number;
}
export type NewcomerGroup = 'family' | 'man' | 'woman' | 'slave';
// types/types-chronicle.ts (ChronicleEvent – newcomer)
/** Otrokyně (skupina `slave` se ženou) – věta v ženském rodě (vzor `birth`); jinak chybí. */
female?: true;
// trade/goods.ts
export const PEOPLE_GOODS: readonly PeopleGood[] = ['slaves', 'families', 'men', 'women'];
// trade/slaves.ts
/** Otroci, které ves smí prodat (bod 6): `canBeSold`, doma (ne `isAway`), ne `keptByLine`; od nejnižšího id. */
export function sellableSlaves(state: VillageState, day: number): Person[];
// trade/people-trade.ts
export interface Emigrants {
  slaves: EmigrantGroup[];
  families: EmigrantGroup[];
  men: EmigrantGroup[];
  women: EmigrantGroup[];
}
```

- `emigrantGroups(state, day, want)`: napřed `sellableSlaves(state, day).slice(0, want.slaves ?? 0)` – každý jako `{ kind: 'slave', dwellingId: p.dwellingId, people: [p] }` (jedním řezem, ne po jednom s kopií vsi) –, pak rodiny, muži a ženy jako dnes z vsi bez nich. Při `want.slaves` 0 nebo chybějícím se `sellableSlaves` nevolá a kopie vsi (`without`) nevzniká – výběr bit po bitu jako dnes a pohled dvorce, který volá `emigrantGroups` pro každé zboží lidí, nezdraží. `emigrantList` = otroci, rodiny, muži, ženy. `PEOPLE_GROUP.slaves = 'slave'`, `GROUP_GOOD.slave = 'slaves'`.
- `TRADE_GOOD_VALUES.slaves = { valueKg: 360, carryKg: 0 }` s komentářem „jako svobodný dospělý (Rozhodnutí plánu 3, bod 4); markets.md – Rozhodnutí plánu 5, bod 6“.
- **Kudy otroci jdou sami:** `villageGoodStock`, `takePeople`, `sendPeople`, `settleTrades`, `departMarketInPlace`, `applyMarketResult` a `checkMarketTrip` jdou přes `PEOPLE_GOODS` a `emigrantGroups`; vyčerpávající `Record<PeopleGood | NewcomerGroup, …>` a `switch` ukáže TypeScript.
- **Kde TypeScript mlčí** (`TradePeople.slaves` je volitelné) a musí se doplnit ručně: `marketTripPeople` (`stock.slaves` jen > 0, jako `peopleOf` – bez něj `planMarketTrip` dá otrokům zásobu 0 a vrátí `MARKET_OVER_STOCK`), `peopleOf` (`slaves` jen při kladném celém počtu, bez něj tvar beze změny), `tradePeopleCount` (`slaves ?? 0`). Bez otroků zůstanou `NO_PEOPLE`, `people` zásilky (`packages/game/src/domain/vassalage/shipment.ts`) a `comingCounts` (`trade/trade.ts`) – zásilky je jako `slaves` nevozí. Náhled výpravy ve webu (`use-market-people.ts`, `parseMarketPeopleInput`, `marketPreview`) doplní Úloha 8a.
- `female: true` dostane zápis `newcomer` skupiny `slave`, je-li to žena (`settlePeople`, `restorePeople` / `receiveStranded`); jinde pole chybí.
- Web: `TRADE_GOOD_NAMES.slaves = { name: 'Otroci', genitive: 'otroků', unit: 'ks', icon: 'slave' }` (4. pád přidá Úloha 3b); `NEWCOMER_TEXTS.slave = { notice: 'Přišel otrok', chronicle: 'přišel otrok', back: 'se vrátil prodaný otrok', backNotice: 'Vrátil se prodaný otrok' }` (ženské znění Úloha 3b).
- **Při jiné odpovědi na Otázku 1** se mění jen výběr (`sellableSlaves`, `emigrantGroups`) a jeho test:
  - „i s malými dětmi“: `sellableSlaves` vrací skupiny – otrok od 16 let a jeho děti-otroci pod 16 let ze stejného domu (mají-li je oba rodiče-otroci, jdou s matkou); dítě samo ne. Kus zůstane jeden člověk: `emigrantGroups` bere skupiny po řadě, dokud se celé vejdou do `want.slaves` (lidí), `villageGoodStock(…, 'slaves')` = lidé všech skupin, skupina `kind: 'slave'` nese víc lidí (vazby uvnitř zůstanou). Test: dítě 14 odejde jen s rodičem (přípravek dostane jeho matku-otrokyni 17),
  - „i s mužem“: jako „i s malými dětmi“ a navíc manželé, oba prodejní otroci, tvoří jednu skupinu (`spouseId` uvnitř skupiny zůstane – Úloha 4 maže jen manžela mimo skupinu); otrok se svobodným manželem jde sám,
  - „samo jen od 16 let“: `sellableSlaves` navíc věk od 16 let (dítě-otrok se prodá, až doroste), skupiny dál po jednom; test – `sellableSlaves` = `[10]`, zásoba 1.

- [ ] **Step 1: Testy** (`slaves-trade.test.ts`, přípravky `market-fixtures.ts`):
  - Ves s lidmi: 10 otrokyně-pohanka 25 let, neprovdaná, s dítětem 16 (2 roky, narozené ve vsi, bez `slave`) v témže domě; 11 pokřtěný otrok; 12 otrok-pohan pryč (`away: { kind: 'labor', untilDay: den + 5 }`); 13 otrokyně-pohanka, manželka muže rodu; 14 otrok-pohan dítě 3 roky; 15 svobodný pohan 20 let → `sellableSlaves` vrátí id `[10, 14]`; `villageGoodStock(state, 'slaves', day)` = 2.
  - `emigrantGroups(state, day, { families: 0, men: 1, women: 1, slaves: 1 })` → `slaves[0].people[0].id` = 10 a 10 není v `women` ani `men`.
  - `leavingGroups(state, day, { slaves: 2, men: 1 })` vybere tytéž id jako postupné `takePeople` v pořadí `PEOPLE_GOODS` a nikoho dvakrát.
  - `departMarketInPlace` s `give: { slaves: 2 }`: příjezd nese dva `{ good: 'slaves', people: [p] }` se `slave: true`, oba ze `state.people` zmizí (v `emigrants` se směrem cesty); dítě 16 prodané matky ve vsi zůstane bez `slave` (svobodné, narozené ve vsi).
  - `checkMarketTrip`: `give.slaves` 1,5 → `MARKET_BAD_ORDER`, 3 při zásobě 2 → `MARKET_OVER_STOCK`; `marketCrew({ slaves: 5 }, {}, [])` → `{ porters: 1, carts: 0 }`.
  - `marketTripPeople(state, day, { slaves: 2 })` → `stock.slaves` 2 a volní dospělí bez obou; `planMarketTrip` s `give: { slaves: 2 }` projde; `marketTripPeople(state, day, { men: 1 })` → `stock` bez `slaves`.
  - `initialPrice('slaves')` = 24; `peopleOf({ men: 1 })` → `{ families: 0, men: 1, women: 0 }` (bez `slaves`).
  - `settlePeople` se skupinou `slave` otrokyně → `newcomer` s `group: 'slave'` a `female: true`; s otrokem bez `female`.
  - Web: ikona `slave` existuje (dnešní test ikon projde).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/slaves-trade.test.ts packages/game/src/domain/village/trade/__tests__/market-trip-people.test.ts apps/web/lib/__tests__/trade-names.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** testy ze Step 2, `npx vitest run packages/game/src/domain/village/trade apps/web/lib apps/web/components` – PASS (výčty podle Global Constraints); zlaté otisky beze změny.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): otroci jako zboží trhu (plán 5)`.

### Task 3b: Otroci jako zboží – věty webu (Sonnet)

**Files:**

- Modify: `apps/web/lib/trade-names.ts` (`accusative?` v typu `TRADE_GOOD_NAMES`, `slaves.accusative`, `goodsNames`, ženské znění `NEWCOMER_TEXTS.slave`), `apps/web/lib/village-view-chronicle.ts` (věta `newcomer` podle `female`), `apps/web/lib/village-notices.ts` (upozornění `newcomer` podle `female`)
- Modify: `docs/code/web-ui.md` jen tehdy, uvádí-li jména, která se mění
- Test: `apps/web/lib/__tests__/trade-names.test.ts`, `apps/web/lib/__tests__/village-view-chronicle-markets5.test.ts`, `apps/web/lib/__tests__/village-notices.test.ts`

**Interfaces:**

- Consumes: `TRADE_GOOD_NAMES.slaves`, `NEWCOMER_TEXTS.slave`, `newcomer.female` (Úloha 3a).
- Produces:
  - typ `TRADE_GOOD_NAMES` dostane volitelné `accusative?: string`; `TRADE_GOOD_NAMES.slaves.accusative = 'otroky'`; `goodsNames` píše `accusative ?? name.toLowerCase()` (ostatní zboží beze změny),
  - `NEWCOMER_TEXTS.slave.female = { notice: 'Přišla otrokyně', chronicle: 'přišla otrokyně', back: 'se vrátila prodaná otrokyně', backNotice: 'Vrátila se prodaná otrokyně' }` (volitelné pole typu, jen u `slave`); kronika i upozornění `newcomer` ho vezmou při `female`.

- [ ] **Step 1: Testy:**
  - `trade-names.test.ts`: `goodsNames({ honey: 100, wax: 24, furs: 60, slaves: 10 })` → „med, vosk, kožešiny a otroky“; `goodsText({ slaves: 2 })` → „2 ks otroků“; dnešní testy ostatního zboží beze změny.
  - `village-view-chronicle-markets5.test.ts`: `newcomer` skupiny `slave` s `female` a `villageName` „Lhota“ → „Do vsi přišla otrokyně z Lhoty.“, vrácená → „Do vsi se vrátila prodaná otrokyně z Lhoty.“; `village-notices.test.ts`: upozornění „Přišla otrokyně z Lhoty“.
- [ ] **Step 2: Spustit** `npx vitest run apps/web/lib/__tests__/trade-names.test.ts apps/web/lib/__tests__/village-view-chronicle-markets5.test.ts apps/web/lib/__tests__/village-notices.test.ts` – FAIL.
- [ ] **Step 3: Implementovat**, znovu Step 2 a `npx vitest run apps/web/lib` – PASS.
- [ ] **Step 4:** kontroly, commit `feat(web): otroci a otrokyně v názvech zboží a kronice (plán 5)`.

### Task 4: Otroci mezi vsemi – trh, pošta, zaniklé vsi, odchod a manželství (Opus)

**Files:**

- Modify: `trade/market-people.ts` (`sendPeople` – manželství, Rozhodnutí 6)
- Test: `trade/__tests__/market-slaves.test.ts` (nový, vzor `market-people.test.ts` a `market-two-villages.test.ts`), `people/__tests__/departure.test.ts`, `people/__tests__/son-departure.test.ts`, `packages/db/src/adapters/__tests__/village-state-codec.test.ts`
- Modify jen tam, kde test selže: `trade/market.ts`, `trade/market-trip.ts` (`applyMarketResult`), `packages/game/src/application/village-mail.ts`
- Modify: `docs/code/village-trade.md` (Otroci na trhu – pošta, zaniklé vsi a manželství), `docs/code/village-people.md` (Otroci – prodej rozvede manželství)

**Interfaces:**

- Consumes: Úloha 3a (`slaves`, `sellableSlaves`, `NewcomerGroup` `slave`), vzor `departLeavers` (`people/departure.ts`: „manžel zůstal ve staré vsi … v nové vsi je ovdovělý“), `removePeople`, `fatherOf` v `populationDay`.
- Produces: `sendPeople` u skupin `slaves` smaže v kopii záznamu `spouseId`, jehož manžel ve skupině není; u rodin a svobodných se nic nemění (trh bez otroků bit po bitu). Manžel ve vsi ovdoví dnešním `removePeople`. Neprodaný (`restorePeople`) i otrok hostitele vrácený ze zaniklé vsi kupujícího (`receiveStranded` → `restorePeople`) se tak vrátí bez manžela; prodaný se usadí bez manžela (`rehomePeople` přeruší vazby ven). Jinak nic nového – úloha ověřuje, že cesty plánu 3 nesou otroky celé.

- [ ] **Step 1: Testy** (`market-slaves.test.ts`; vsi A, B, C, pošta po každém dni):
  - Výprava A se 2 otroky (`give: { slaves: 2 }`) na trh B, kde stojí výprava C se 30 mincemi a seznamem `{ slaves: 1 }`: C koupí 1 otroka za 24 mincí. Po návratech: v C je ten člověk se `slave: true` a novým id, kronika C `newcomer` se skupinou `slave` a jménem B; A dostane druhého zpět s původním id a `slave: true` (`restorePeople`), `sold.slaves` 1 a 24 mincí. Součet lidí A + B + C + na cestě je po každém dni stejný.
  - **Manželství:** otrok A, jehož svobodná žena zůstala doma, jde na trh a neprodá se → hned po odchodu nemá žena `spouseId` (vdova, `isSingle`), po návratu nemá `spouseId` ani on; otrokyně A, jejíž muž zůstal doma, se neprodá → po návratu bez `spouseId` a `populationDay` jí nenajde otce mimo dům (s bývalým mužem v jiném domě nerodí). Unit: `sendPeople` se skupinou `slave` ženatého otroka hostitele → kopie bez `spouseId`; `receiveStranded` ji vrátí hostiteli (`fromHost`) s původním id bez `spouseId` a jeho žena ve vsi je vdova.
  - Hostitel B, který lidi shání (půdy víc než práce – `peopleWanted` > 0), od výpravy A se 2 otroky nekoupí nic; oba se vrátí.
  - Zanikne C, když je výsledek s otrokem na cestě → `stranded-people`: otrok se usadí u B se `slave: true` (nově id, ne `fromHost`).
  - Odchod celé vsi (`departure.test.ts`) a ves syna (`son-departure.test.ts`): otrok mezi osadníky má v nové vsi `slave: true`.
  - Kodek: `decodeVillageState(encodeVillageState(s))` vsi s osobou `slave: true` – `JSON.stringify` shodný.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-slaves.test.ts packages/game/src/domain/village/people/__tests__/departure.test.ts packages/game/src/domain/village/people/__tests__/son-departure.test.ts packages/db/src/adapters/__tests__/village-state-codec.test.ts` – testy manželství FAIL (oprava `sendPeople`), ostatní čekané PASS hned (cesty plánu 3); co selže, opravit v souborech z Files a znovu spustit.
- [ ] **Step 3:** kontroly (s `test:slow`), commity `fix(game): prodej otroka rozvede manželství jako smrt (plán 5)` a `test(game): otroci mezi vsemi – trh, pošta a zaniklé vsi (plán 5)`.

### Task 5: Cizí kupci kupují otroky (Opus)

**Files:**

- Modify: `rules/rules-merchants.ts` (`MERCHANTS.wants.slaves`), `trade/market.ts` (seznam kupců v den bez otroků – `merchantWants`), `trade/merchants.ts` (komentář odjezdu – koupení otroci zmizí s kupci)
- Modify: `docs/code/village-trade.md` (Cizí kupci ve vsi – otroci, pořadí nákupu)
- Test: `trade/__tests__/market-merchants-slaves.test.ts` (nový), `trade/__tests__/market-merchants.test.ts` (seznam kupců), `apps/web/lib/__tests__/village-view-chronicle-markets5.test.ts` (věta příjezdu)

**Interfaces:**

- Consumes: Úlohy 3a, 3b a 4, `merchantsArrive`, `coinPhase`, `coinClearing`, `affordableWants`.
- Produces:
  - `MERCHANTS.wants = { honey: 100, wax: 24, furs: 60, slaves: 10 }` – komentář „Co kupec shání (med a vosk kg, kožešiny a otroci kusy); otroci markets.md – Rozhodnutí plánu 5, bod 7“.
  - `merchantWants(visitor: MarketVisitor, slavesOnMarket: boolean): TradeGoods` v `market.ts` – bez `slaves`, když dnes nikdo otroky nenabízí: hostitel podle `stance.offer.slaves` (> 0; ne `state.slavesForSale` – Úloha 6a pak `merchantWants` nemění, do ní hostitel otroky nenabízí nikdy), výpravy z nákladu. Použít všude, kde seznam kupce vstupuje do tržního dne: `priceTotals` (`affordableWants` i `traded`), strany `clearMarket` (strop V = min(nabídka, seznam)) a `coinPhase` (`wantsOf`, C v `coinsAgainstGoods`) – jinak se trh bez otroků změní.
  - Pořadí nákupu se nemění: `coinClearing` jde od kupujícího po prodávajících v pořadí stran (hostitel, pak výpravy podle příjezdu) a u každého v pořadí `TRADE_GOODS` (Rozhodnutí 7).

- [ ] **Step 1: Testy** (`market-merchants-slaves.test.ts`, vzor `market-merchants.test.ts`; trh bez cen, hladina 1):
  - Výprava se 3 otroky-pohany v den kupců (měšec 60): kupci koupí 2 za 48 mincí, třetího ne (zbývá 12 < 24); výprava `sold.slaves` 2, mince výpravy +48; po odjezdu kupců dva prodaní nejsou v žádném stavu, nákladu ani poště (hledat podle id a `bornDay`); třetí se vrátí s původním id.
  - Zápočet: výprava s 5 otroky a seznamem `{ swords: 1 }` dostane meč (120 = 5 × 24), mince se nehnou.
  - Pořadí prodávajících: výprava E1 (přijela první) se 100 kg medu a E2 se 2 otroky – kupci koupí med za 40 mincí a otroky ne (zbývá 20); obráceně E1 se 2 otroky a E2 se 100 kg medu – kupci koupí 2 otroky za 48 mincí a 30 kg medu za 12.
  - Ves T zanikne v den, kdy kupci drží dva koupené otroky (`merchantsLeave`): otroci odjedou s kupci a nejsou v žádném stavu ani poště; otrok výpravy, který se neprodal, se vrátí domů poštou jako v plánu 3.
  - Den bez otroků: dva klony trhu s kupcem s měšcem 200 – jeden se seznamem s `slaves: 10`, druhý bez – po `marketDay` shodné `market.prices`, `market.level` a prodané a koupené všech stran.
  - `merchantsArrive` → `wants` kupce i `buys` zápisu `merchants-arrived` = `{ honey: 100, wax: 24, furs: 60, slaves: 10 }`; web: „Přijeli kupci z daleka – prodávají meče, kroužkové košile a helmy, kupují med, vosk, kožešiny a otroky.“
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-merchants-slaves.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces; testy plánu 4 se seznamem kupců upravit (Global Constraints).
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village/trade apps/web/lib` – PASS.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): cizí kupci kupují otroky (plán 5)`.

### Task 6a: Prodej otroků ve vlastní vsi – nabídka, rezervace a správce (Opus)

**Čeká na Martinovu odpověď na Otázku 1** (rezervace – Předpoklad).

**Files:**

- Modify: `types/types-state.ts` (`slavesForSale?`), `trade/slaves.ts` (nabídka a `offeredSlaveIds`), `trade/people-trade.ts` (`emigrantGroups` – `reserved`), `trade/market-people.ts` (`leavingGroups`, `takePeople` – `reserved`), `trade/market-stance.ts` (otroci napřed, rezervace), `packages/game/src/domain/vassalage/spare.ts` (`peopleOffer` a `keepLabor` – rezervace), `trade/market.ts` (`settleTrades` a `coinPhase` s rezervací hostitele, `marketDay` – zmenšení nabídky), `trade/market-trip.ts` (`DepartOptions.reserved` – `planMarketTrip` i `departPlanned`), `steward/steward-market.ts` (`stewardMarketStep` bez otroků, s rezervací), `index.ts`
- Modify: `docs/code/village-trade.md` (Otroci na prodej ve vlastní vsi, rezervace), `docs/code/village-steward.md` (roční výprava otroky nebere)
- Test: `trade/__tests__/slaves-sale.test.ts` (nový), `trade/__tests__/market-stance.test.ts`, `steward/__tests__/steward-market.test.ts`, `packages/game/src/domain/vassalage/__tests__/spare.test.ts`

**Interfaces:**

- Consumes: `sellableSlaves` (Úloha 3a), kupci s otroky a `merchantWants` (Úloha 5), vzor `arms-order.ts` (`setArmsOrder`, `reduceArmsOrder`).
- Produces:

```ts
// types/types-state.ts (VillageState)
/** Kolik otroků ves nabízí na svém trhu (markets.md – Rozhodnutí plánu 5, bod 8) – celé; chybí = žádní. */
slavesForSale?: number;
// trade/slaves.ts
export const SLAVES_BAD_COUNT = 'Počet otroků musí být celé nezáporné číslo.';
/** 0 pole smaže; necelé nebo záporné odmítne. Na počet otroků se neomezuje – nabízí se min(nabídka, zásoba). */
export function setSlavesForSale(state: VillageState, count: number): { ok: true } | { ok: false; reason: string };
/** Nabídka po prodeji `sold` otroků (mutuje stav); nula ze stavu zmizí. */
export function reduceSlavesForSale(state: VillageState, sold: number): void;
/** Kolik otroků ves dnes nabízí: min(`slavesForSale`, `sellableSlaves`). */
export function slavesOffered(state: VillageState, day: number): number;
/** Rezervace (bod 8): id prvních `slavesOffered` ze `sellableSlaves`; bez nabídky prázdná. */
export function offeredSlaveIds(state: VillageState, day: number): ReadonlySet<number>;
// trade/people-trade.ts, trade/market-people.ts – volitelná rezervace (chybí = prázdná, výběr beze změny)
export function emigrantGroups(state: VillageState, day: number, want: TradePeople, reserved?: ReadonlySet<number>): Emigrants;
export function leavingGroups(state: VillageState, day: number, give: TradeGoods, reserved?: ReadonlySet<number>): Emigrants;
// takePeople(…, reserved?) a DepartOptions.reserved? stejně
// vassalage/spare.ts
export function peopleOffer(state: VillageState, day: number, outlook: StewardOutlook, reserved?: ReadonlySet<number>): TradePeople;
```

- **Rezervace:** `emigrantGroups` s `reserved` bere otroky dál napřed ze `sellableSlaves` (rezervovaní jsou mezi nimi první), rodiny, muže a ženy vybírá z vsi bez otroků výběru i bez `reserved`. Množinu spočte `offeredSlaveIds` **jednou z celé vsi** na začátku tržního dne (hostitel) nebo kroku správce a předá ji dál beze změny – přepočet ze vsi zmenšené o odešlé (postupné `takePeople`, `coinPhase` po zápočtu) by rezervoval jiné lidi. Výprava hráče, `villageGoodStock` a zásilky rezervaci nedostanou (beze změny).
- **Nabídka hostitele** (`marketStance`): `reserved = offeredSlaveIds(state, day)`, `n = reserved.size`; volní lidé `peopleOffer(state, day, outlook, reserved)` – rozpočet lidí se zmenší o dospělé v `reserved` (nejvýš na 0, dospělí počítaní jako v rozpočtu), rodiny, muži a ženy se vybírají bez nich a `keepLabor` kontroluje práci vsi bez odcházejících i bez `reserved`; `emigrantGroups(state, day, { ...volní, slaves: n }, reserved)`; `offer.slaves` jen > 0. Otroci se nikdy neshánějí. Bez nabídky je výsledek beze změny.
- **Tržní den:** `settleTrades` (hostitel – `leavingGroups(state, day, host.sold, reserved)`) a `coinPhase` (`leavingGroups(state, day, hostOffer, reserved)`) dostanou rezervaci ze začátku dne; po všech fázích `reduceSlavesForSale(state, otroci prodaní hostitelem za den)` (vzor `reduceArmsOrder`).
- **Správce:** `stewardMarketStep` vyřadí `slaves` z `stance.offer` dřív, než volá `leavingGroups` a `fitToCrew`, a rezervaci z vsi před výpravou předá `leavingGroups` i `departMarketInPlace` (`DepartOptions.reserved` – kontrola `planMarketTrip` i postupné `takePeople`). Nabídku nezadává ani nemění.
- **Při jiné odpovědi na Otázku 1** se mění jen rezervace a její test: „i s malými dětmi“ nebo „i s mužem“ – rezervace bere celé skupiny: `offeredSlaveIds` = lidé prvních skupin, které se celé vejdou do `slavesForSale` (lidí), `slavesOffered` = počet těchto lidí (nabídka 1 u matky se dvěma dětmi nenabídne nikoho, dokud nebude aspoň 3), od rozpočtu se odečtou dospělí těchto skupin; test `market-stance` – nabídka 3 = matka se dvěma dětmi. „Samo jen od 16 let“ – rezervace beze změny (rezervovaní jsou jen dospělí, od rozpočtu se odečtou všichni).

- [ ] **Step 1: Testy:**
  - `market-stance.test.ts`: 3 prodejní otroci a `slavesForSale: 2` → `offer.slaves` 2; `slavesForSale: 5` → 3; pokřtěný otrok se nepočítá; ves bez nabídky – `offer` beze změny proti dnešku. Ves, jejíž rozpočet lidí dá 1 rodinu (2 dospělí), s nabídkou 2 dospělých otroků → `offer.families` chybí, `offer.slaves` 2.
  - `spare.test.ts`: `peopleOffer` s rezervací 2 dospělých otroků – rozpočet o 2 menší, rodiny, muži a ženy bez nich; ves, které práce na půdu stačí jen s rezervovanými, nabídne o to méně (`keepLabor` bez nich); bez rezervace výsledek jako dnes.
  - `slaves-sale.test.ts`: v den kupců hostitel s nabídkou 2 otroků prodá kupcům oba za 48 mincí – `state.coins` +48, `slavesForSale` ze stavu zmizí, `market-held` má `sold.slaves` 2 a `bought.coins` 48, prodaní nejsou ve stavu ani v poště; nabídka 3 a prodej 2 → zbude `slavesForSale: 1`; otrok pokřtěný mezi zadáním a dnem kupců se neprodá. **Rezervace:** nabídka 2 otroků, z nichž jeden je svobodný muž 16–44; výprava koupí od hostitele zápočtem 1 muže → odejde svobodný muž mimo nabídku (podle id, ne otrok z nabídky); totéž v mincovní fázi.
  - `steward-market.test.ts`: správce 15. 11. se `slavesForSale: 2` vypraví roční výpravu bez otroků (v příjezdu žádný `good: 'slaves'`) a otroci z nabídky zůstanou doma – podle id, ani jako muž nebo žena.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/slaves-sale.test.ts packages/game/src/domain/village/trade/__tests__/market-stance.test.ts packages/game/src/domain/village/steward/__tests__/steward-market.test.ts packages/game/src/domain/vassalage/__tests__/spare.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** testy ze Step 2 a `npx vitest run packages/game/src/domain/vassalage packages/game/src/domain/village/trade packages/game/src/domain/village/steward` – PASS; zlaté otisky beze změny.
- [ ] **Step 5: Mapa kódu**, kontroly (s `test:slow`), commit `feat(game): nabídka otroků ve vlastní vsi (plán 5)`.

### Task 6b: Prodej otroků – use-case, práva, vstup a akce (Sonnet)

**Files:**

- Create: `packages/game/src/application/slaves.ts`; Modify: `packages/game/src/application/rights.ts` (`offerSlaves: 'trade'`), `packages/game/src/application/index.ts`
- Modify (web bez rozhraní): `apps/web/lib/village-input.ts` (`parseSlaveOfferInput`), `apps/web/lib/village.ts` (`offerSlavesForPlayer`), `apps/web/app/game/actions/market.ts` (`offerSlaves`)
- Modify: `docs/code/village-trade.md` (use-case a akce), `docs/code/web-ui.md` (akce `offerSlaves`, je-li tam výčet akcí)
- Test: `packages/game/src/application/__tests__/slaves.test.ts` (nový, vzor `arms-order.test.ts`), `packages/game/src/application/__tests__/rights.test.ts`, `apps/web/lib/__tests__/village-input.test.ts`

**Interfaces:**

- Consumes: `setSlavesForSale`, `SLAVES_BAD_COUNT` (Úloha 6a), vzor `application/arms-order.ts` (`OrderArmsInput`, `orderArms`), `updateLivingVillage`, `ACTION_RIGHTS`.
- Produces:

```ts
// application/slaves.ts
export interface OfferSlavesInput {
  villageId: string;
  count: number;
  today: number;
  landscape: Landscape;
}
export function offerSlaves(
  deps: { villages: VillageRepository },
  input: OfferSlavesInput,
): Promise<VillageResult>;
// apps/web
export function parseSlaveOfferInput(value: unknown): { count: number } | null; // lib/village-input.ts
export async function offerSlaves(input: unknown): Promise<VillageActionResult>; // app/game/actions/market.ts
```

- **Use-case:** `offerSlaves` přes `updateLivingVillage` jako `orderArms`; právo `trade` (`ACTION_RIGHTS.offerSlaves`); web akce jako `orderArms` (`villageAction(input, parseSlaveOfferInput, offerSlavesForPlayer)`).

- [ ] **Step 1: Testy:** `application/__tests__/slaves.test.ts`: 3 → `slavesForSale` 3; 0 → pole zmizí; 2,5 a −1 → `SLAVES_BAD_COUNT`; zaniklá ves → důvod `updateLivingVillage`. `rights.test.ts`: `offerSlaves` je `trade`. `village-input.test.ts`: `parseSlaveOfferInput({ villageId: 'v', count: 2 })` → `{ count: 2 }`, `{ villageId: 'v', count: '2' }` → null.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/application/__tests__/slaves.test.ts packages/game/src/application/__tests__/rights.test.ts apps/web/lib/__tests__/village-input.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces; Step 2 – PASS.
- [ ] **Step 4: Mapa kódu**, kontroly, commit `feat(game): prodej otroků ve vlastní vsi – use-case a akce (plán 5)`.

### Task 7: Web – osoba, dvorec, kronika a cizí správce (Sonnet)

**Files:**

- Modify: `apps/web/lib/person-view.ts` (`ScenePerson.slave` ve `scenePersons`), `apps/web/components/game/hud/selection/people.tsx` (odznak), `apps/web/lib/manor-view.ts` (`VillageManor.slaves`), `apps/web/components/game/hud/ManorPanel.tsx` (počet otroků)
- Modify: `docs/code/web-ui.md` (otroci v panelu osoby a dvorce)
- Test: `apps/web/lib/__tests__/person-view.test.ts`, `apps/web/components/game/hud/__tests__/SelectionPanel.test.tsx`, `apps/web/lib/__tests__/manor-view.test.ts`, `apps/web/components/game/hud/__tests__/ManorPanel.test.tsx`, `apps/web/lib/__tests__/village-view-chronicle-markets5.test.ts`

**Interfaces:**

- Consumes: `isSlave`, `isChristian` (Úloha 1), `NEWCOMER_TEXTS.slave`, `TRADE_GOOD_NAMES.slaves` (Úlohy 3a a 3b), ikona (Úloha 2).
- Produces (jen pohled):
  - `ScenePerson.slave?: true` vedle dnešního `christian?: true` – nový typ osoby nevzniká (CLAUDE.md: typy pro scénu se nedefinují znovu); pokřtěný otrok = `slave` + `christian`. Odznak `data-testid="selection-person-slave"`, ikona `/icons/resources/slave.png`, `Tooltip` podle obou příznaků: „Otrok“, u pokřtěného „Otrok – pokřtěný, prodat ho nejde“.
  - `VillageManor.slaves?: { all: number; baptized: number }` – chybí, nemá-li ves otroky. V `ManorPanel` vedle zásob zboží ikona s počtem `all` (`data-testid="manor-slaves"`), `Tooltip` „Otroci – 5“, s pokřtěnými „Otroci – 5, z toho 2 pokřtění – prodat je nejde“ (1 pokřtěný, 2–4 pokřtění, 5 pokřtěných).
  - Kronika a upozornění trhu s otroky jdou dnešními větami (`goodsText`, `NEWCOMER_TEXTS`) – tato úloha je jen ověří testy.

- [ ] **Step 1: Testy** (skutečné řetězce):
  - `person-view.test.ts` (přes `scenePersons`): otrok-pohan → `slave: true` bez `christian`, pokřtěný otrok → `slave: true` a `christian: true`, svobodný → bez `slave`; `SelectionPanel.test.tsx`: obě znění popisku.
  - `manor-view.test.ts`: ves se 3 otroky (1 pokřtěný) → `slaves: { all: 3, baptized: 1 }`, bez otroků pole chybí; `ManorPanel.test.tsx`: „3“ a popisek „Otroci – 3, z toho 1 pokřtěný – prodat je nejde“, bez pole nic.
  - Kronika: `market-held` se `sold: { slaves: 2 }`, `bought: { coins: 48 }` → „Na trhu ves prodala 2 ks otroků, dostala 48 mincí.“; `market-returned` s prodaným otrokem – dnešní věta s „prodala 1 ks otroků, dostala 24 mincí“; `newcomer` skupiny `slave` s `villageName` „Lhota“ → „Do vsi přišel otrok z Lhoty.“, s prázdným jménem (cizí správce – `maskVillageNames`) → „Do vsi přišel otrok ze sousední vsi.“, vrácený → „Do vsi se vrátil prodaný otrok z Lhoty.“; upozornění „Přišel otrok z Lhoty“.
- [ ] **Step 2: Spustit** `npx vitest run apps/web` – FAIL, pak implementovat.
- [ ] **Step 3: Spustit** `npx vitest run apps/web` – PASS; `npm run typecheck`, `npm run lint`. E2e se výslovně odkládá: odznak dvorce ověří Úloha 8b (`market.spec.ts`), celé e2e Úloha 10.
- [ ] **Step 4: Mapa kódu**, kontroly, commit `feat(web): otroci v panelu osoby a dvorce (plán 5)`.

### Task 8a: Web – náhled výpravy s otroky a prodej v panelu Trh (Sonnet)

**Files:**

- Modify: `apps/web/components/game/hud/use-market-people.ts` (`peopleIn`, klíč a `none` s otroky), `apps/web/lib/village-input.ts` (`parseMarketPeopleInput` – volitelné `slaves`), `apps/web/lib/market-view.ts` (`marketPreview` – zásoba a nosiči s otroky), `apps/web/lib/village.ts` a `apps/web/app/game/actions/market.ts` (komentáře `marketPeopleForPlayer` a `getMarketPeople` – `slaves` projde beze změny kódu), `apps/web/lib/manor-view.ts` (`market.slaveSale`), `apps/web/components/game/hud/MarketPanel.tsx` (sekce prodeje), `apps/web/components/game/village-game/village-commands.ts` (`offerSlaves`), `apps/web/components/game/village-game/VillagePanels.tsx` (napojení)
- Modify: `docs/code/web-ui.md` (náhled výpravy s otroky, prodej otroků v panelu Trh)
- Test: `apps/web/lib/__tests__/market-view.test.ts`, `apps/web/lib/__tests__/village-input.test.ts`, `apps/web/lib/__tests__/manor-view.test.ts`, `apps/web/components/game/hud/__tests__/MarketPanel.test.tsx`

**Interfaces:**

- Consumes: akce `offerSlaves` (Úloha 6b), `marketTripPeople` se `stock.slaves` (Úloha 3a), `coinPriceOf`, vzor sekce zbroje v `MarketPanel` a `orderArms as orderArmsAction` v `village-commands.ts`.
- Produces:
  - **Náhled lidí s otroky:** `peopleIn` vezme i `give.slaves`, klíč dotazu a `none` počítají otroky; `parseMarketPeopleInput` přijme volitelné celé nezáporné `slaves` (chybí = bez pole, jinak null jako dnes); `marketPreview` vezme zásobu otroků i volné dospělé z odpovědi serveru (`marketTripPeople`), takže nosiči z odcházejících otroků nejsou a odpověď bez otroků zásobu otroků nepřepíše. Hráč tak neodešle výpravu, kterou server odmítne (`MARKET_NO_PEOPLE`), a náhled neodmítne platnou.
  - `VillageManor.market.slaveSale: { stock: number; forSale: number; price: number } | null` – `stock` = `market.stock.slaves` (týž průchod `marketField`, ne druhé volání `villageGoodStock`), `forSale` = `state.slavesForSale ?? 0`, `price` = `coinPriceOf(state.market?.prices, state.market?.level ?? 1, 'slaves')`; null, když `stock` i `forSale` jsou 0.
  - `MarketPanel` vlastní vsi: ikona otroka s počtem `stock`, cena v mincích (ikona mince), `Stepper` od 0 do max(`stock`, `forSale`) s hodnotou `forSale` (nabídka nad zásobou po pokřtění otroka zůstane vidět a jde snížit); změna pošle `offerSlaves({ villageId, count })`, důvod odmítnutí u sekce jako u zbroje, bez práva `trade` zašedlé (`useRightDenied('trade')`). `Tooltip` „Otroci na prodej – ves je prodá kupcům a výpravám na svém trhu za cenu dne“.
  - `VillageCommands.offerSlaves: (count: number) => Promise<string | null>`.

- [ ] **Step 1: Testy:**
  - `market-view.test.ts`: náhled se 2 otroky a 1 mužem v „Dáš“ dá tytéž nosiče a týž důvod (nebo žádný) jako `planMarketTrip` nad toutéž vsí – i ve vsi, kde by bez otroků v dotazu vyšli nosiči z odcházejících otroků.
  - `village-input.test.ts`: `parseMarketPeopleInput` se `slaves: 2` → i se `slaves`; bez `slaves` → tvar jako dnes; `slaves: 1.5` → null.
  - `manor-view.test.ts`: ves se 2 prodejními otroky a `slavesForSale: 1` bez trhu → `{ stock: 2, forSale: 1, price: 24 }`, ves bez otroků a nabídky → null.
  - `MarketPanel.test.tsx`: sekce jen s ne-null `slaveSale`, `Stepper` na 2 zavolá `offerSlaves(2)`, při `forSale` 3 a `stock` 2 jde `Stepper` do 3, otroci v „Dáš“ s počtem 2.
- [ ] **Step 2: Spustit** `npx vitest run apps/web` – FAIL, pak implementovat; znovu – PASS.
- [ ] **Step 3: Mapa kódu**, kontroly (e2e až v Úloze 8b), commit `feat(web): otroci v náhledu výpravy a prodej v panelu Trh (plán 5)`.

### Task 8b: E2e – otroci v panelu dvorce a Trh (Sonnet)

**Files:**

- Modify: `apps/web/e2e/market.spec.ts`, e2e, které počítají řádky „Dostaneš“ (`grep -rn` v `apps/web/e2e` – přibyl řádek otroků, Global Constraints), `docs/code/web-ui.md` (e2e)
- Test: `apps/web/e2e/market.spec.ts` a upravené spec

**Interfaces:**

- Consumes: Úlohy 7 a 8a; vzor existujících testů `market.spec.ts` a úpravy stavu vsi v DB.

- [ ] **Step 1: E2e** (`market.spec.ts`): dev ves, kde dva vesničané mají `slave: true` (jeden `faith: 'christian'`) – panel dvorce ukáže `manor-slaves` „2“ s popiskem „Otroci – 2, z toho 1 pokřtěný – prodat je nejde“; panel Trh ukáže v „Dáš“ otroky 1 a sekci prodeje; nastavení 1 zůstane po obnovení stránky, 0 ji vynuluje.
- [ ] **Step 2: Spustit** sériově `npm run test:e2e -- market.spec.ts` a upravené spec (předtím `pgrep -f "[p]laywright test"` prázdné) – PASS.
- [ ] **Step 3: Mapa kódu**, kontroly, commit `test(web): e2e otroků v panelu dvorce a Trh (plán 5)`.

### Task 9: Test světa a Vlkov (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/__tests__/market-slaves-years.test.ts` (pomalý – zapsat do `packages/game/slow-tests.ts`)
- Modify: `packages/game/slow-tests.ts`, `docs/design/markets.md` (Co se ověří – výsledek)
- Test: pomalý test, `npm run test:db`

**Interfaces:**

- Consumes: celý plán (Úlohy 1–8b), `coinsOfWorld`, vzor `market-merchants-years.test.ts`.

- [ ] **Step 1: Pomalý test dvou vsí a kupců** (`market-slaves-years.test.ts`), 3 roky po dnech, pošta po každém dni:
  - **T** na stezce (jedna zastávka z `trailStops`, 20 t obilí navíc): přes `applyCampaignReturn` dostane pohana 25 let a pohanku 20 let; jednomu vesničanovi T se přímo nastaví `faith: 'christian'` a `slave: true` (pokřtěný otrok); `slavesForSale: 2`.
  - **S** bez stezky s T v okolí: přes `applyCampaignReturn` dostane pohanskou rodinu (muž 30, žena 28, dítě 4), pohanku 18 a křesťanku 22. Na první den kupců každého herního roku pošle do T výpravu se všemi prodejnými otroky, nejvýš 2 (`give: { slaves }`, seznam prázdný; odmítne-li ho `checkMarketTrip`, seznam `{ grain: 1 }`).
  - Test tvrdí po každém dni: lidé T + S + na cestě + otroci u kupců (`boughtPeople`, do odjezdu kupců) = začátek + porody − úmrtí − otroci, se kterými kupci odjeli; součet `sold.slaves` v zápisech `market-held` T a ve výsledcích výprav S se rovná počtu otroků, se kterými kupci odjeli (otroky tu kupují jen kupci); každý, kdo zmizel jinak než smrtí, byl v poslední den ve vsi `canBeSold`; pokřtěný otrok T a křesťanka S nikdy nezmizí ze světa (kupci je nekoupí; přestěhovat se smějí – křesťanka S se smí vdát do T); každé dítě narozené za běhu je bez `slave`; každé `spouseId` v T i S je vzájemné, kromě vedlejších manželek mužů rodu (muž `line` má `spouseId` na hlavní manželku); `slavesForSale` T klesá o prodané a při nule zmizí; součet mincí světa (`coinsOfWorld`) se mění jen příjezdem a odjezdem kupců jako v plánu 4; žádné `NaN`, záporná zásoba ani smrt hladem; dopočet obou vsí po 90 dnech dá týž stav jako vcelku.
  - Do zprávy (bez prahu): kdy a za kolik mincí se otroci prodali (T i S), mince T a S na konci každého roku, kolik otroků zbylo.
- [ ] **Step 2: Vlkov** (`markets.md` – Co se ověří): přepočet vsi Vlkov z databáze `bohemia` (jen ke čtení, sonda plánů 1–4) 10 let po dnech – Vlkov bez války nemá otroky: **stav bit po bitu týž** jako na `feat/landscape` (otisk stavu všech dní a konečný stav; rozdíl je chyba), kodek bez rozdílu. Druhý běh s uměle přidanou zastávkou kupců a třemi otroky-pohany s `slavesForSale: 3`: ves přežije, otroci se prodají kupcům, mince přibudou – výsledek tabulkou do `markets.md`.
- [ ] **Step 3: Spustit** `nice -n 19 npm run test:slow` – PASS (selže-li podmínka, nehrát si s čísly – zapsat do zprávy a ozvat se); `npm run test:db`, kontroly.
- [ ] **Step 4: Commit** `test(game): tři roky trhu s otroky a kupci, přepočet Vlkova (plán 5)`.

### Task 10: Návrhy, celé e2e a dokumenty (Sonnet)

**Files:**

- Modify:
  - `docs/design/markets.md` – oddíl „Rozhodnutí plánu 5 (návrh Clauda, 26. 11. 2026)“: Martinova rozhodnutí doslova (i odpověď na Otázku 1), body 1–13 zkráceně, čísla (360 kg, 10 otroků za průjezd), Oznámit (i s návrhy Clauda: prodej ve vlastní vsi nabídkou, správce otroky zatím neprodává, zajatý muž rodu se kupcům zatím neprodává); stav „Plán 5 hotový“ v hlavičce (Co se ověří doplnila Úloha 9),
  - `docs/design/war.md` – Ztráty (Odvedení: pohané jsou otroci – markets.md, Pravidla 7), Později (prodej odvedených kupcům hotový; zajatý muž rodu se kupcům zatím neprodává – návrh Clauda, výkupné Martin 2. 11. 2026), `docs/design/christianity.md` (Víra vesničanů – pokřtěný otrok zůstává otrokem, prodat ho nejde; Křest rodu – propuštěná vedlejší manželka-otrokyně zůstává otrokyní), `docs/design/population.md` (narození – dítě otroka je svobodné), `docs/design/kinship.md` (Sňatky – prodej otroka rozvede manželství jako smrt, neprodaný se vrátí bez manžela), `docs/design/research/2026-11-02-war.md` (verdikt 6 – prodej zajatců kupcům už není Později),
  - `CLAUDE.md` – řádky `village-trade.md` (otroci na trhu), `village-people.md` (otroci) a `war.md` (odvedení pohané jsou otroci) v tabulce mapy kódu; mapy kódu dopsané předchozími úlohami zkontrolovat.
- Test: `npm run test:db`, celé e2e

- [ ] **Step 1: Návrhy** podle Files – Martinova slova s datem, vlastní rozhodnutí „návrh Clauda“; `grep -rn "koordin\|za Martina" docs/design` nic nového.
- [ ] **Step 2: Spustit** `npm run check:docs`, `npm run format:check`, `npm run test:db`, celé e2e sériově `npm run test:e2e` (předtím `pgrep -f "[p]laywright test"` prázdné), kontroly.
- [ ] **Step 3: Commit** `docs: obchod 5 – otroci (plán 5)`.

## Oznámit Martinovi (návrhy Clauda, které mění pravidla)

1. **Otrokem je odvedený pohan**, od chvíle, kdy ho vojsko přivede do vsi (na cestě je kořist tažení). Odvedení, kteří se usadili před tímto plánem, zůstávají svobodní – nejde je poznat (Rozhodnutí 1 a 12). **Zajatý muž rodu ani šlechtic se kupcům zatím neprodává:** zůstává ve dvorci k výkupnému a dál ho jde držet, propustit nebo popravit – šlechtice je cílem „spíš zajmout než zabít, protože za něj může požadovat výkupné“ (Martin 2. 11. 2026). Prodej zajatce kupcům by šel přidat později jako další volba u zajatce, s dalším plánem války.
2. **Otrok žije jako ostatní vesničané:** pracuje, jí, bydlí, žení se, rodí, může se pokřtít a stěhuje se s ostatními; neutíká a štěstí nemění. Příznak si nese všude: otrokyně, která se vdá do sousední vsi, je tam dál otrokyní a nový pán ji smí prodat (vlastní ves ji ztratí jako každou nevěstu); otroci brání ves a jdou do odvodů jako vesničané; propuštěná vedlejší manželka – pohanka a otrokyně – je po křtu rodu zase na prodej; ve vsích nepokřtěného rodu se otroci nepokřtí nikdy (obrácení jen u pokřtěného rodu); povýšený otrok (vojvoda NPC rodu) zůstane otrokem, ale prodat ho nejde (Rozhodnutí 4).
3. **Otroci se prodávají po jednom**, od toho, kdo do vsi přišel nejdřív; manžel ani děti s ním neodcházejí a i malé dítě-otrok jde prodat samo za cenu dospělého (Otázka 1). **Prodej rozvede manželství jako smrt:** manžel ve vsi ovdoví a smí se znovu oženit, neprodaný se vrátí bez manžela. Neprodá se muž rodu, šlechtic, manželka muže rodu ani kdo je zrovna pryč. Na trhu jdou otroci napřed – mění to oznámené „rodiny napřed“ plánu 3 (Rozhodnutí 6).
4. **Otrok stojí na trhu 360 kg obilí (24 mincí)** jako svobodný dospělý. Kupci jich shánějí až 10 za průjezd, ale z měšce 60 mincí za výchozí cenu koupí dva. Kupují od prodávajících po řadě – hostitel, pak výpravy podle příjezdu – a u každého napřed med, vosk a kožešiny (Rozhodnutí 6 a 7).
5. **Prodej ve vlastní vsi nabídkou počtu** (podle Martinova „Hráč zadá počet“ u zbroje, 25. 11. 2026): v panelu Trh hráč nastaví, kolik otroků ves prodá – jako počet mečů objednaných u kupců –, a v den kupců je ves prodá za mince; kdo se neprodá, počká na další kupce. Do jiné vsi je pošle výpravou jako ostatní zboží. Otroci z nabídky se odečtou od lidí, které ves nabízí sama, a jako muž, žena ani rodina se na trhu vsi neprodají. Ves sama otroky nekupuje, vesničané také ne (Rozhodnutí 7 a 8).
6. **Správce otroky zatím neprodává ani nekupuje** – otroci v jeho vsi pracují jako ostatní (Rozhodnutí 8). Je to odchylka od Martinova „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“ (22. 11. 2026): kdy by měl otroky prodat kupcům, je pravidlo, které Martin nedal. Důsledek: otroky jde na trhu koupit jen od vsí, jejichž hráč je sám nabídne – ves správce ani NPC rodu je nenabídne nikdy, takže vojvoda u stezky, který podle Martina „nakupuje všechny tyto komodity od okolních vsí“, otroky od vsí správců nekoupí.
7. **Otrok smí odejít i jako svobodný muž, žena nebo rodina** (výprava, zásilka) – i tam zůstane otrokem (Rozhodnutí 6).
8. **Kupci otroky odvezou ze světa** – jediný odchod lidí ze světa kromě smrti. V den, kdy na trhu otroci nejsou, se trh chová přesně jako dosud (Rozhodnutí 7).

## Otázky na Martina

1. **Rodina otroka.** „Z nájezdu na pohanskou ves přivedeš matku se dvěma malými dětmi (tři a pět let) a jejím mužem – všichni čtyři jsou tvoji otroci. Za rok se jí ve vsi narodí další dítě, to je svobodné. Když pak matku pošleš prodat kupcům, co s mužem a dětmi? Doporučuji: každý otrok se prodává sám. Muž zůstane ve vsi jako vdovec a smí se znovu oženit, děti zůstanou u něj (prodáš-li oba rodiče, ujme se dětí příbuzný nebo jiná domácnost jako sirotků). Když se matka na trhu neprodá, vrátí se domů už bez muže – manželství skončilo prodejem, jako by zemřela. Starší dvě děti můžeš prodat i samotné, i to tříleté – kupci za ně dají 24 mincí jako za dospělého; dítě narozené ve vsi prodat nejde. Jiné možnosti: matka jde prodat i s malými dětmi, nebo celá rodina i s mužem (kupci zaplatí za každého zvlášť); nebo se dítě samo prodá až od 16 let.“ (Plán je psaný podle doporučení. Jiná odpověď mění jen výběr v Úloze 3a a rezervaci v Úloze 6a: „i s malými dětmi“ – prodává se skupina, otrok od 16 let a jeho děti-otroci pod 16 let z jeho domu, kus zůstane jeden člověk a skupina zabere tolik kusů, kolik má lidí, rezervace bere celé skupiny; „i s mužem“ – navíc manželé-otroci tvoří jednu skupinu a jejich manželství zůstane; „od 16 let“ – `sellableSlaves` navíc věk od 16 let, rezervace beze změny. Kde manžel ve vsi zůstává, prodej rozvede manželství v každé možnosti.)

## Rizika plánu

- **Pořadí nákupu kupců** (Oznámit 4): kupci mají měšec 60 mincí a kupují od prodávajících po řadě (hostitel, pak výpravy podle příjezdu), u každého napřed med, vosk a kožešiny – kde hostitel nebo dřívější výprava nabízí med, otroci pozdější výpravy se prodají pomalu, a obráceně otroci hostitele nebo dřívější výpravy zaberou měšec dřív než med pozdějších; změnilo by to jen jiné pořadí nebo větší měšec, a to by změnilo i ověřená čísla plánu 4.
- **Prodej po jednom rozbíjí rodiny a manželství** (Otázka 1, Rozhodnutí 6): domácnost bez dospělého se přestěhuje podle dnešního pravidla rozpadu domácnosti – test Úlohy 3a hlídá, že dítě ve vsi zůstane; manželství hlídá test Úlohy 4 a denní invariant Úlohy 9. Dokud Martin na Otázku 1 neodpoví, stojí Úlohy 3a a 6a a s nimi všechno za Úlohou 2.
- **Kde TypeScript mlčí:** nový druh v `PeopleGood` a `NewcomerGroup` ukáže vyčerpávající `Record` a `switch`, ale volitelné `TradePeople.slaves` ne – místa, která skládají lidi výslovně z rodin, mužů a žen (`marketTripPeople`, `peopleOf`, `tradePeopleCount`, náhled výpravy ve webu), vyjmenovávají Úlohy 3a a 8a; chybějící `slaves` je 0, nikdy `undefined` v součtu.
- **Rezervace otroků z nabídky** se musí spočítat jednou z celé vsi a předat všem fázím tržního dne i výpravě správce – přepočet ze vsi zmenšené o odešlé (postupné `takePeople`, `coinPhase` po zápočtu) by vybral jiné lidi než nabídka; hlídají testy Úlohy 6a.
- **Správce a NPC vsi otroky neprodávají** (Oznámit 6): otroky jde koupit jen od vsí, jejichž hráč je nabídne – na stezce mezi vsemi správců a NPC rodů se otroci skoro neobjeví. Prodej správcem by bylo nové pravidlo (kdy a kolik) a nová úloha, kdyby ho Martin chtěl.
- Seznam kupců s otroky mění uložený stav návštěvníka a kroniku příjezdu (testy plánu 4 – výčet v Global Constraints); trh bez otroků hlídá srovnávací test Úlohy 5. Hladina C s otroky na trhu roste o hodnotu seznamu otroků, jen když kupec drží víc mincí, než stojí zbytek jeho seznamu.
- `PEOPLE_GOODS` mění pořadí (otroci napřed) – výběr `emigrantGroups` a postupné `takePeople` musí jít ve stejném pořadí; hlídá test Úlohy 3a.
- Odvedení bez obydlí ve vsi vítěze nepřijdou (dnešní chování `settleLed`) – plán to nemění.
