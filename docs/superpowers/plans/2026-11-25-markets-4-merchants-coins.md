# Obchod 4 – cizí kupci a mince – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mince jsou zboží vsi (celé kusy) s cenou na každém trhu a platí se jimi vedle zápočtu; cizí kupci na dálkových stezkách kostry světa přijíždějí podle pevného plánu, kupují med, vosk a kožešiny za mince a prodávají meče, kroužkové košile a helmy – mince do světa přinášejí a odnášejí jen oni. Mince utrácí jen hráč (výpravou a objednávkou zbroje u kupců ve vlastní vsi) a správce na svých výpravách (issue #11, plán 4 ze 6).

**Architecture:**

- **Mince jsou `TradeGood` `coins`** (kus, `VillageState.coins`): jdou stejnými cestami jako jiné zboží – výprava je veze v „Dáš“ (`MarketArrival.goods`), nepoužité se vrátí v `MarketResult.unsold`. V zápočtu (barteru) se neúčastní.
- **Tržní den má tři fáze:** zápočet řemeslníků, zápočet (obojí beze změny) a nově **mincovní fáze** (`coinClearing`): výprava nebo cizí kupec, který má mince a po zápočtu mu něco chybí, kupuje zbytek nabídky jiných stran za mince, celé kusy. Hostitel v ní jen prodává; jediné, co za mince sám koupí, je zbroj od kupců, kterou si hráč objednal (`VillageState.armsOrder`). Bez mincí na trhu se nic nemění, proto jsou zlaté otisky beze změny a testy plánů 2 a 3 až na výčet v Global Constraints.
- **Cena v mincích** = dnešní relativní cena (`priceOf`) × **cenová hladina trhu** `market.level` (chybí = 1, nikdy pod 1): víc mincí, než kolik zboží se za ně dá koupit, hladinu zvedne (inflace), méně ji sníží (deflace).
- **Kupci jsou návštěvník trhu ve vsi u stezky**, ne putující karavana: `merchantVisits(zastávky, od, do)` je čistá funkce seedu světa, spojení stezky a roku; ves má zastávky ve stavu (`VillageState.merchantStops`, převod jen při načtení) a kupci přijedou v den podle plánu, stojí den (na rušném trhu déle) a odjedou s tím, co drží. Jediné místo, kde mince a zbraně vznikají a kde mince a zboží ze světa odcházejí.
- Web jen ukazuje a posílá záměry. Žádná nová DB migrace, žádná náhoda dopočtu.

**Tech Stack:** TypeScript 6 (strict), `packages/game` (doména, use-casy, Vitest), `packages/db` (Drizzle), `packages/server`, `apps/web` (Next.js 16, React 19), Playwright, Blender (ikony).

**Spec:**

- `docs/design/markets.md` – závazný (schváleno Martinem 22. 11. 2026): Martinova rozhodnutí (Cena a mince, Odkud mince, Co kupci kupují, Co kupci prodávají, Kupci na stezce, Platba, dokud nejsou mince, Města na stezkách, Spodní a Horní cena), Pravidla 4–6, Rozhodnutí plánů 1–3, Co se ověří, Nechává se na stavitele.
- `docs/design/world-skeleton.md` – Stezky – síť uzlů (jen číst; graf kostry se po spuštění nemění).
- `docs/design/gold.md` – hranice: zlato, šperkař a mincovna jsou plán 6 (kupci je zatím nekupují).
- `docs/design/hides-honey.md` – Zboží, Zpracování v domácnosti, Obchod (co ves potřebuje a co je přebytek).
- `docs/design/war.md` – Výzbroj (Martin 2. 11. 2026: „Zatím jen koeficient. Reálné věci budeme řešit někdy později vlastní mechanikou“).
- Plány 2 a 3 a jejich kód: `trade/market.ts`, `market-clearing.ts`, `market-prices.ts`, `market-stance.ts`, `market-trip.ts`, `market-people.ts`, `villager-trips.ts`, `craft-orders.ts`, `application/village-mail.ts`, `application/nearby.ts`.
- Mapa kódu: `docs/code/village-trade.md` (Trh – ceny a zápočet, Trh ve vsi, Výprava na trh, Pošta mezi vsemi, Přehled vsí, Vesničané na trhu), `world.md` (Kostra světa, Schránka vsi), `village-core.md` (Převody starších vsí), `web-ui.md`, `worker.md` (Pošta mezi vsemi).

## Global Constraints

- **Předpoklad:** plán 3 i oprava odchodu celé vsi (`fix/leave-everything` – odchod celé vsi bere všechny zásoby) jsou sloučené ve `feat/landscape`. Musí platit (`grep -rnw <jméno> packages apps`): `marketDay`, `joinMarket`, `clearMarket`, `settleTrades`, `departVisitors`, `marketStance`, `nextPrices`, `departMarketInPlace`, `applyMarketResult`, `deliverVillageMail`, `returnStrandedPeople`, `receiveStranded`, `pruneUsed`, `nearbyRefresh`, `trailSides`, `VILLAGE_MIGRATIONS`, `paymentPool`, `emptyCellLandscape`. A nesmí existovat: `coinClearing`, `merchantVisits`, `trailStops`, `armsOrder`. Jinak Úlohu 1 nezačínat a ozvat se. Práce běží ve větvi `feat/markets-4` z `feat/landscape`.
- **Mimo plán 4:** otroci (plán 5), zlato, šperkař a mincovna (plán 6), další zboží kupců (Martin: „Později o třeba rozšíříme“), **účinek zbroje ve válce** (Martin 2. 11. 2026: „Zatím jen koeficient. Reálné věci budeme řešit někdy později vlastní mechanikou“ – war.md, Výzbroj; markets.md – Ne-cíl (teď)), vsi dalších hráčů na mapách stezek (Rozhodnutí 11), obecné pravidlo odchodu celé vsi (oprava `fix/leave-everything`), oprava orby s nástroji v simulaci a nemaskované starší druhy kroniky (řeší se zvlášť).
- **Mince nevzniknou ani nezmizí jinde než u kupců.** Mince jsou vždy právě na jednom místě: v zásobě vsi (`VillageState.coins`), v nákladu výpravy (`MarketArrival.goods`, `MarketVisitor.goods`, výsledek v `MarketResult.unsold`), nebo v měšci kupce na trhu. Vznikají příjezdem kupce, zanikají jeho odjezdem. Žádná jiná úloha je nesmí vyrobit ani ztratit (Test v Úlohách 2, 4, 6, 10 a 15); jedinou přijatou ztrátu – výsledek, u něhož zanikly obě vsi – jmenuje Rozhodnutí 9. Odejdou-li ze vsi všichni, berou si mince s sebou; odejde-li část lidí nebo syn, zůstanou ve vsi, kde se žije dál (Rozhodnutí 9).
- **Mince vsi utrácí jen hráč a správce** (Martin 25. 11. 2026: „Mince utrácí jen vojvoda/správce“; Rozhodnutí 4): vesničané nikdy, ves na trhu jen za zbroj, kterou si hráč objednal. Úloha, která by mince ubrala jinde, je chybná.
- **Kusy celé:** mince, zbroj, zvířata a lidé; zlomky jen u zboží v kg.
- **Žádná pravidla navíc:** nové hodnoty a meze jen ty, které plán jmenuje v Rozhodnutích, každé s odkazem; technické meze mají v kódu poznámku „technická mez, ne pravidlo“ s důvodem (jako `MAIL_ATTEMPTS`): `MAIL_KEEP_DAYS` a `MAIL_PRUNE_ROWS` (Úloha 11), prahy zaokrouhlení v `market-coins.ts`, `MAX_PRICE_RATIO` v `market-prices.ts` (Úloha 4).
- **Hexagon:** doména a use-casy bez infrastruktury (hlídá ESLint), web i worker volají stejné use-casy, **žádná herní logika ve webu** – ani výpočet ceny v mincích, dne kupců nebo počtu mincí k platbě.
- **Determinismus:** bez `Math.random`, `Date.now()`, `new Date()`. Kupci jsou čistá funkce seedu světa, spojení stezky a roku; náhoda jen z vlastního proudu `deriveSeed(stop.seed, 'pass:<rok>:<průjezd>')`. Dopočet po kouscích i vcelku dá týž stav. `domain/world/skeleton/**` je deterministická vrstva ESLintu.
- **Graf kostry se nemění** – `trailStops` z něj jen čte; žádná nová sůl, žádná nová verze vrstvy.
- **Čísla pravidel** jen v `rules*.ts` s odkazem „markets.md – Rozhodnutí plánu 4, bod N“; do návrhů je zapíše Úloha 16.
- **Stav vsi:** nové části jsou volitelné (`coins`, `arms`, `armsOrder`, `merchantStops`, `market.level`, pole výpravy a zprávy) a chybí, dokud se nepoužijí. Jediný převod `merchant-stops` je v `VILLAGE_MIGRATIONS` na konci seznamu, jen při načtení vsi (`loadOnly`, vzor `weather-seed`). Kodek ani DB migrace se nemění.
- **Zlaté otisky se nesmí změnit:** ves bez `merchantStops` a trh bez mincí simulují bit po bitu jako dnes. Beze změny jsou zlaté otisky a testy trhu **kromě** výčtu kusového zboží v `market-clearing.test.ts` (Úloha 1), zakládání úložiště vsí v DB testech (Úloha 5 – povinný seed světa) a testů suché mapy (`dry-cell.test.ts`, `new-village.test.ts` a e2e `village.spec.ts` – Úloha 12). Selže-li `*golden*.test.ts` nebo jiný test plánů 2 a 3, je to chyba úlohy.
- **Pasti z plánů 2 a 3:**
  - stav po předchozích úlohách ověř `grep -rnw` dřív, než na něj navážeš; testy tvrdí skutečné hodnoty (kg, kusy, mince, den, id),
  - nic drahého při každém pohledu na dvorec – výpočet kupců je malá smyčka bez simulace, zastávky se počítají jednou při načtení,
  - zboží se nesmí tiše zahodit, když se nevejde na výpravu (výprava s mincemi vrací nepoužité mince v `unsold`),
  - smyčky přes `TRADE_GOODS`, které volají `addGood`, přeskočí koně, vozy a lidi; mince jimi projdou,
  - mince se nesmí dostat do `paymentPool` vesničanů ani do nákupu hostitele podle výpočtu potřeby (Rozhodnutí 4),
  - schránka vsí nesmí růst bez meze (Úloha 11),
  - správce cizí vsi nevidí jména ostatních vsí držitele, ani u obchodníků – kupci žádnou ves nejmenují,
  - v kronice žádné „0 kg“ (mince jsou celé, zboží v kg pod 1 mg se nezapisuje – `NOISE_KG` jako ve stance).
- **Rozhraní jako v 0 A.D.:** ikony a čísla, slova jen v `Tooltip` a kronice.
- **Kontroly na konci každé úlohy:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:docs` a `nice -n 19 npm run test`. Úlohy 2, 4, 5, 6, 9, 10, 12 a 15 navíc `nice -n 19 npm run test:slow`, Úlohy 5, 10, 11, 15 a 16 `npm run test:db`. E2e jen kde to úloha říká, sériově: `pgrep -f "[p]laywright test"` předtím nesmí nic vrátit.
- **`docs/code/`:** úloha, která přidá nebo přejmenuje jméno, opraví v téže úloze mapu kódu (jinak padne `check:docs`). Návrhy v `docs/design/` až v Úloze 16 (výsledek měření do `markets.md` zapíše Úloha 15).
- **Jazyk a zápis:** česky komentáře i docs, krátká pomlčka „–“. Vlastní rozhodnutí jsou „návrh Clauda“, Martinova slova s datem. Commity Conventional Commits česky, `Refs #11`, na konci `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Agenti:** žádní subagenti, žádné `sleep` v popředí, `pkill`, `rm -rf`, `git stash` ani `git branch -D`. Neslučovat, nepushovat. Nejvýš ≈ 150 kroků na úlohu. DB `bohemia` jen ke čtení. Měření na víc vsích se nespouští – ověřuje se testem dvou vsí a kupce (Úlohy 4 a 15) a přepočtem Vlkova (Úloha 15).

## Martinova rozhodnutí k plánu 4

Body 1–10 z `markets.md` (22. a 23. 11. 2026); v uvozovkách jsou Martinova slova, otázky a doporučení Clauda jsou bez nich. Body 11–13 rozhodl Martin k tomuto plánu 25. 11. 2026; otázky Clauda u bodů 11 a 13 jsou doslova, v uvozovkách:

1. **Cena a mince:** „Mince (peníze obecně) jsou univerzálním nositelem hodnoty. Trh se tedy bude řídit nabádkou a poptávkou a každí zboží bude mít svou hodnotu vyjádřenou v mincích. Nezapomínej, že mince jsoi také komodita a tudíž jich může být hodně (inflace) nebo málo (deflace)“ – Rozhodnutí 2 a 3.
2. **Odkud mince:** „Až s kupci. Slované začali razit vlastní mince až kolem roku 950“ – Rozhodnutí 5.
3. **Co kupci kupují:** „Cizí kupci nakupují zlato, šperky (tj. zlato, ale o polovinu dráž), med, vosk, kožešiny a otroky. Klidně to může být tak, že vojvoda vsi na kupecké stezce nakupuje všechny tyto komodity od okolních vsí aby je pak mohl sám výhodně prodat cizím kupcům“ – med, vosk, kožešiny teď; otroci plán 5, zlato a šperky plán 6 (Rozhodnutí 5 a 6).
4. **Co kupci prodávají:** „Prodávají meče, kroužkové košile a helmy. Později o třeba rozšíříme“ – Rozhodnutí 5 a 7.
5. **Kupci na stezce:** na doporučení Clauda, že karavana jede po stezce několikrát do roka a v každé vsi u stezky se zastaví na den, kde je víc obchodníků déle: „Ano. Postupně to povede ke vzniku trhových vsí a měst na kupeckých stezkách“; Pravidla 6 (návrh Clauda, schváleno): tržní den ve vsi u stezky podle plánu, čistá funkce seedu světa, úseku stezky a roku, ne putující karavana – Rozhodnutí 5.
6. **Platba, dokud nejsou mince:** na doporučení zápočtu přes celý trh v mincovní míře: „ANo, přesně tak“ – zůstává první, mince jsou druhá cesta (Rozhodnutí 2).
7. **Města na stezkách:** na doporučení Clauda, aby na mapách podél kupecké stezky směly vznikat i vsi synů a dalších hráčů (prémiovou výhodou zůstane brod nebo průsmyk): „ok“ – Rozhodnutí 11.
8. **Spodní cena:** nikdo neprodá pod výchozí hodnotou (zvolená možnost „Ano, výchozí hodnota“) a **Horní cena** bez meze (zvolená možnost „Nechat bez stropu“) – Rozhodnutí 3.
9. **Co nabízí a shání hostitelská ves** podle výpočtu potřeby („ano“) i nákup výpravy podle seznamu za cenu dne bez mezí („ok“) – platí beze změny; výpočet potřeby určuje i to, co ves prodá za mince (Rozhodnutí 2 a 6); sama za mince nekoupí nic (bod 12, Rozhodnutí 4).
10. **Nákup pro vesničany a správce:** „Ano“ a „Správce je vlastně NPC hráč…“ – vesničané platí dál jako v plánu 3 (obilí, luštěniny, osivo hřivny a krávy), správce na svých výpravách i mincemi (bod 12, Rozhodnutí 4).
11. **Zbroj u kupců ve vlastní vsi** (25. 11. 2026). Otázka Clauda: „Plán 4 (kupci a mince): kupci na stezce prodávají meče, kroužkové košile a helmy. Co ves na trhu nakupuje, rozhoduje dnes výpočet potřeby, a zbroj ves sama k ničemu nepotřebuje. U kupců, kteří stojí na trhu ve tvé vlastní vsi, by si ji tedy nekoupila. Jak má hráč zbroj od kupců ve vlastní vsi koupit?“ Martin zvolil možnost **„Hráč zadá počet“** (popis možnosti od Clauda: „V panelu Trh své vsi u stezky nastavíš, kolik mečů, košil a helem chceš. V den kupců je ves koupí za své mince, dokud na ně má.“) – Rozhodnutí 15.
12. **Kdo utrácí mince** (25. 11. 2026). Martin: „Tam je hlavně špatný předpoklad, že vesničané utrácejí mince. Za co by asi tak oni utráceli mince?“ Claude pak popsal model (mince utrácí jen hráč na výpravě a u kupců ve své vsi za objednanou zbroj a správce na výpravách; ves je jen přijímá a na trhu dál mění zboží za zboží; vesničané platí obilím) a zeptal se, zda to tak zapsat. Martin: **„Mince utrácí jen vojvoda/správce“** – Rozhodnutí 4.
13. **Odchod celé vsi** (25. 11. 2026). Otázka Clauda o mincích a zbroji: „Mají v tom druhém případě [odejdou všichni] odejít s lidmi, nebo zůstat jako ostatní zásoby?“ Martin: **„Pokud se lidéí někam stěhují, berou si úplně vše. Jaký by to jinak dávalo smysl?“** (výňatek) – obecné pravidlo zavádí samostatná oprava odchodu celé vsi (`fix/leave-everything`) před tímto plánem, mince a zbroj do ní jen přibudou (Rozhodnutí 9).

## Co hra už zná (ověřeno `grep -rnw` 25. 11. 2026)

- **Med, vosk a kožešiny:** `TradeGood` `honey`, `wax`, `furs` (`goods.ts`, hodnoty v `TRADE_GOOD_VALUES` 6 a 30 kg obilí za kg a 8 za kus; kožešina je kus), zásoba `wares.honeyKg`, `waxKg`, `sheepFurs` + `wildFurs`, prodej a nákup `villageGoodStock` / `addGood`. Hostitel je dnes nenabízí ani neshání (plán 2, Rozhodnutí 5) – mění Rozhodnutí 6.
- **Meče, kroužkové košile a helmy:** hra je **nezná** – v `packages/game/src` žádné jméno, výzbroj je jen koeficient síly za kovárnu (× 1,5 s plným pokrytím nástroji, `war.md` – Výzbroj). Ve webu je jen ikona meče (`/icons/house/sword.png`, vojenská služba). Účinek nevzniká v tomto plánu (Martin 2. 11. 2026 – war.md, Výzbroj; markets.md – Ne-cíl (teď)).
- **Mince:** nic – jen kurz `MARKET.grainKgPerCoin` 15 kg obilí za minci a ceny trhu v této míře.

## Rozhodnutí plánu (návrh Clauda)

1. **Mince jako zboží.** `coins` je `TradeGood`, kus, celé číslo v `VillageState.coins` (chybí = 0), prodej a nákup přes `villageGoodStock` / `addGood`. Hodnota = `MARKET.grainKgPerCoin` (15 kg obilí → výchozí cena 1 mince), `carryKg` 0 jako dobytek, vozy a lidé – mince nikdy nepřidají nosiče a výpravu s plnou posádkou nezastaví (váha denáru 1,7 g patří až k výměně zlata za mince „1:1 váhově“, gold.md – plán 6). V zápočtu mince nejsou: nenabízejí se v něm ani se neshánějí (`withoutCoins`), `nextPrices` je přeskočí. Na seznam „Dostaneš“ se nedávají – prodávající je bere za cokoli, co nabízí (mince jsou univerzální nositel hodnoty – Martin); seznam s mincemi odmítne kontrola výpravy (`MARKET_BAD_ORDER`).

2. **Platba mincemi vedle zápočtu** (přechod od zápočtu k mincím). Žádný přepínač: zápočet zůstává první a beze změny, a teprve co zápočet neuspokojil, smí koupit, kdo mince utrácí (bod 4). Tržní den `marketDay`:
   1. zápočet řemeslníků (dnešní `craftStance`, beze změny),
   2. zápočet (dnešní `clearMarket`, beze změny – bez mincí),
   3. **mincovní fáze** `coinClearing` – strany: hostitel (jen prodává – co z jeho nabídky zbylo; sám koupí jedině objednanou zbroj od kupců, bod 15), výpravy (mince z `goods.coins`, seznam `wants`, prodej = co jim zbylo) a cizí kupci. Nemá-li mince k útratě žádný kupující, fáze se nespustí a trh je bit po bitu jako v plánu 2 – mince v zásobě vsi ji samy nespustí.
   - Pořadí: **prodávají** hostitel, pak přespolní podle příjezdu (Martin – „napřed zboží hostitelské vsi a pak přespolních“); **kupují** nejdřív cizí kupci (jejich mince se tak týž den dostanou k ostatním), pak hostitel objednanou zbroj, pak výpravy podle příjezdu; zboží v pořadí `TRADE_GOODS`.
   - Platba za dvojici kupující–prodávající a den je celé číslo mincí = zaokrouhlený součet hodnot nahoru, prodávající tak nikdy neprodá pod cenou a kupující přeplatí nejvýš minci. Součet pod jednu minci se neobchoduje. Mince přejdou celé, součet plateb přes všechny strany (i měšce cizích kupců) je nula. Zboží v kg se dělí, kus je celý.
   - Prodávající bere mince za všechno, co nabízí: hostitel za přebytek podle výpočtu potřeby – i za lidi, dobytek, koně, výrobky, vozy, klády a kámen –, výprava za to, co veze. Oznámit Martinovi (bod 1): hostitel tak prodá přebytek komukoli, kdo zaplatí, ne jen za to, co shání.

3. **Cena v mincích a cenová hladina.** Cena zboží na trhu v mincích = `priceOf(prices, zboží)` × `market.level`:
   - `prices` zůstávají dnešní relativní ceny z nabídky a poptávky (`nextPrices`, krok ±10 %, dno = výchozí hodnota, nahoru bez meze – v kódu jen technická mez 1e9 × výchozí, ne pravidlo: bez ní by cena po tisících tržních dnů přerostla do `Infinity`, v JSON `null`, a dopočet po kouscích by se rozešel). Zápočet (barter) na hladině nezávisí.
   - `level` (chybí = 1) je „kolik mincí proti zboží“ na tomto trhu. Po mincovní fázi: C = mince, které dnes měly k útratě strany, jimž po zápočtu něco chybí (každá nejvýš hodnota toho, co chce; hostitel jen s objednanou zbrojí); W = hodnota zboží v mincích, které by za ně chtěly a které na trhu po zápočtu opravdu je (u každého zboží min(součet chtěného, součet nabízeného) × cena). `level` × (1 + `MARKET.priceStep` × (C − W) ÷ (C + W)), dno 1 (Martin – Spodní cena: pod výchozí hodnotu nikdo neprodá), nahoru bez meze (Horní cena).
   - **Hladina se hýbe jen v den, kdy je na trhu aspoň něco z toho, co kupující s mincemi shánějí (W > 0); W = 0 ji nemění** – jinak by ve vsi, která kupcům nemá co prodat, rostla o 10 % při každém průjezdu bez konce.
   - Cena zboží a hladina se hýbou zvlášť, každá nejvýš o `MARKET.priceStep` za tržní den – cena v mincích tak může za tržní den vzrůst až o 21 % (1,1 × 1,1; Oznámit, bod 4).
   - Víc mincí, než kolik zboží se za ně dá koupit → ceny v mincích rostou (inflace); méně → klesají k výchozím (deflace). Hladina se sama ustálí tam, kde jsou mince a zboží za ně v rovnováze. Trhy se liší – proto má smysl vozit mince tam, kde je zboží levnější.
   - **Poptávka kupců do ceny zboží** (`nextPrices`; návrh Clauda, opravné kolo Úlohy 4 – Oznámit, bod 13) se počítá jen u zboží, které je ten den na trhu ke koupi (S > 0) – každý den, i když na trhu stojí výpravy; bez nabídky cenou nehne (jako W = 0 hladinou). A jen do výše měšce: u každého zboží seznamu nejvýš `⌊měšec ÷ cena⌋` celých jednotek (`affordableWants`). Cena věci, kterou na trhu nikdo nenabízí, tak kvůli kupcům neroste; s nabídkou roste (D > S) a ustálí se tam, kde kupec za celý měšec koupí právě to, co je na trhu (20 kg medu na průjezd → 3 mince za kg i s hladinou). Ostatní strany beze změny.
   - **V den, kdy na trhu kromě hostitele není žádná výprava** (návštěvníci jen kupci; kovář souseda `service` a doprovod partnera `kin` výprava nejsou), se hýbou jen ceny zboží, které kupci vezou nebo shánějí (návrh Clauda; Oznámit, bod 13). Ostatní ceny – poptávka hostitele, pokles při nabídce bez poptávky – stojí: den kupců je tržní den a co hostitel shání a nikdo nenabízí, by při čtyřech průjezdech do roka za 10 let zdražilo 45×. Dny s aspoň jednou výpravou se nemění (Martin 23. 11. 2026: „Nechat bez stropu“).
   - Hladinu a ceny ponese zpráva o vsi (`VillageNews.level`, `MarketResult.level`), takže výpočet výprav bere cenu cíle i s hladinou.

4. **Kdo utrácí mince** (Martin 25. 11. 2026: „Mince utrácí jen vojvoda/správce“).
   - **Hráč výpravou:** mince dá do „Dáš“ (nejvýš, co ves má); nic jiného se nevolí – co neutratí, přijde domů.
   - **Hráč objednávkou zbroje** u kupců ve vlastní vsi (bod 15).
   - **Správce** na svých výpravách – je to NPC hráč: obilí v nouzi platí mincemi na prvním místě, dosavadní pořadí (hřivny, keramika, uhlí, klády) po nich; roční výprava 15. 11. nese mince nejvýš v hodnotě svého seznamu. Zbroj si neobjednává (bod 7).
   - **Vesničané mince neutrácejí nikdy:** nástroje, keramiku, vozy a osivo platí dál jako v plánu 3 (obilí a luštěniny, osivo hřivnami a krávami) – `PaymentPool` mince nemá. Kovář souseda ani ohrada koní mince neberou, platí se jim jako dosud (Rozhodnutí plánu 3, bod 9).
   - **Ves (hostitel) mince neutrácí:** nekupuje za ně nic podle výpočtu potřeby, jen je přijímá od kupců a výprav za svůj přebytek a hromadí. Na trhu dál mění zboží za zboží.
   - **Řemeslník** bere mince výprav za výrobky až v mincovní fázi, tedy po zápočtech (obilí a luštěniny jsou první); zakázka se při odjezdu výpravy zapíše i tehdy, když výprava veze mince (`recordOrders`).
   - **Cesta domů:** nákup za mince drží nosnost cesty domů jako zápočet – nosiče se počítají z celého seznamu (`marketCrew`), výprava koupí nejvýš, co má na seznamu. Mince na nákup jdou vždy jen z nákladu výpravy (`goods.coins` – z vsi ubyly při odjezdu), nikdy podruhé ze zásoby vsi.
   - **Správce nakládá drahé napřed** (návrh Clauda; Oznámit, bod 12): `fitToCrew` plní roční výpravu podle hodnoty na kg (zboží bez váhy první, při shodě pořadí `TRADE_GOODS`), jinak by obilí vždycky zaplnilo posádku a vosk, kožešiny a med by NPC ves kupcům nikdy nepřivezla; šum do `NOISE_KG` se nenakládá. Seznam roční výpravy zkrátí na to, co lidé a vozy unesou domů (dosud výprava s delším seznamem nejela vůbec).
   - **Nic se neodkládá:** odkládání mincí na zbroj neexistuje – ve vsi je nikdo jiný neutratí, jen správce na svých výpravách.

5. **Cizí kupci.** Kupec je **tržní den ve vsi u stezky**, ne karavana posouvaná světem.
   - **Zastávky vsi** `MerchantStop { key, seed, index, length }`: za každé existující spojení stezky, které mapou vsi vede (uzel jich má 1–4), pořadí políčka na cestě od prvního uzlu, délka cesty v políčkách a seed `deriveSeed(worldSeed, 'merchants:' + key)` (`key` = `<blok x>,<blok y>,<E|N>`). Počítá je `trailStops(worldSeed, políčko)` z `trailPath` – jen čte kostru. Ves je dostane při načtení (`merchant-stops`, port `merchantStopsOf`) **jen z uloženého výřezu sídla**: krajina se generuje z výřezu, ne z políčka (world-skeleton.md – Uložení), takže sídlo bez výřezu nebo bez stezek v něm (`settlement.skeleton`, `trails`) má `[]`, i když jeho políčkem kostra stezku vede; `[]` má i odříznutá ves (bez políčka světa). Ves na cestě si zastávky nové mapy přenese přes příjezd (`stewardArrival`, `settleJourney`).
   - **Plán** `merchantVisits(zastávky, od, do)`: `MERCHANTS.passesPerYear` = 4 průjezdy za rok a spojení; průjezd `i` začíná v den `1. 1. + i × 91 + ⌊u₁ × 60⌋` a jede od prvního uzlu, nebo zpátky (los `u₂`); `u₁`, `u₂` z `createRandom(deriveSeed(seed, 'pass:<rok>:<i>'))`. Den ve vsi = začátek + kolikáté políčko je na cestě průjezdu × `MERCHANTS.daysPerCell` (1). Čtyři do roka (doporučení Clauda „několikrát do roka“, Martin 22. 11. 2026: „Ano“) – jednou za roční období, aby se to hráči snadno pamatovalo.
   - **Příjezd** `merchantsArrive(stav, den)` – krok dne po událostech schránky a před tržním dnem: každý příjezd plánu dne založí návštěvníka trhu (`MarketVisitor.merchant`, `order` podle příjezdu) a zápis kroniky `merchants-arrived`. Měšec `MERCHANTS.coins` = 60 mincí (vznikly ze světa), zboží `MERCHANTS.goods` = 2 meče, 1 kroužková košile, 2 helmy, seznam `MERCHANTS.wants` = 100 kg medu, 24 kg vosku, 60 kožešin.
   - **Čísla** (návrh Clauda): klát dá ročně ≈ 6 kg medu a 0,4 kg vosku (`HIVES`), kožešin je v malé vsi ≈ 20 ročně – měšec 60 mincí (= 900 kg obilí) koupí přebytek několika vsí, proto se kupci vyplatí vozit a trh u stezky roste; seznam kupců je trochu větší než přebytek jedné vsi, takže ho kupci zdražují (D > S). Celý seznam má při výchozích cenách hodnotu 120 mincí (med 40, vosk 48, kožešiny 32) – právě cenu meče, takže plný náklad jde za meč vyměnit i zápočtem, bez mincí.
   - **Pobyt** je den; sejde-li se na trhu aspoň `MERCHANTS.busyVisitors` = 3 výprav, kupci zůstanou další den, nejvýš `MERCHANTS.maxStayDays` = 3 (doporučení Clauda „kde je víc obchodníků déle“, Martin: „Ano“ – bez stropu; počty i strop jsou návrh Clauda a pravidlo hry, ne technická mez – Oznámit, bod 5). Každá ves má svůj kalendář, pobyt jinde ho neposune.
   - **Obchod:** kupci jsou strana zápočtu (zbroj za med, vosk a kožešiny) i mincovní fáze. Ceny trhu (i hladina) platí i pro ně.
   - **Odjezd** v `departVisitors` bez pošty: měšec, neprodaná zbroj i koupené zboží odejdou ze světa. Jen tady mince, zbroj a zboží vznikají a zanikají; nic se neukládá do schránky (kupec nemá domov).

6. **Co hostitel prodá.** `marketStance.offer` přibere přebytek nad vlastní potřebou z `hides-honey.md`:
   - **vosk** – celé zásoby (ves ho sama nepotřebuje, „obchod“),
   - **kožešiny** – co zbývá nad roční potřebu domácností (`yearlyNeed(…).furs`, ovčí i z lovu),
   - **med** – co zbývá nad roční příděl (`HONEY.kgPerPersonYear` 0,5 kg na člověka), a jen když má ves obilí nad pojistku dvou ročních potřeb (`grainSpareKg` > 0, `VASSALAGE.reserveYears`) – jinak je celá zásoba medu jídlo (Martin 15. 11. 2026); ves s 1,9 roku obilí tedy med neprodá.

   Nabídku potřebuje i Martinova představa vojvody na stezce, který tyto komodity nakupuje od okolních vsí: bez ní by je neměl od koho koupit (plán 2, Rozhodnutí 5 je z nabídky vynechal). Kůže, uhlí a jídlo hostitel dál nenabízí. NPC ves je kupcům veze roční výpravou správce (drahé napřed – bod 4). Oznámit Martinovi (bod 3).

7. **Meče, kroužkové košile a helmy jsou jen zboží** (markets.md – Ne-cíl (teď): užití v boji se navrhne s válkou; Martin 2. 11. 2026, war.md – Výzbroj): `swords`, `mailShirts`, `helmets` – kusy, `VillageState.arms` (chybí = nic). Nikdo z vesničanů ani správce je nekupuje (nemají k čemu), hostitel je nenabízí; koupí je hráč výpravou nebo objednávkou u kupců ve vlastní vsi (bod 15), skladuje a prodá výpravou. Hodnoty v kg obilí: podle Lex Ribuaria 40, 11 (Coupland, Carolingian Arms and Armor: meč bez pochvy 3 solidy, helma 6, byrnie 12; vůl 2 solidy = 1 200 kg) – **meč 1 800 kg (120 mincí), helma 3 600 kg (240), kroužková košile 7 200 kg (480)**, váha 1,5 / 1,5 / 12 kg. Účinek v boji přijde vlastní mechanikou, tento plán ho nemá.

8. **Co kdo ví.** Ves u stezky ví den příštích kupců (`VillageReport.merchants`, den ≥ den zprávy) a řekne ho každému, kdo k ní přijde „na pivo“; posledních `MARKET.report.traders` obchodníků ve zprávě zahrnuje i kupce (bez jména vsi). Hladina cíle se pamatuje se zprávou a cenami (`VillageNews.level`).

9. **Oběh mincí a zaniklé vsi.** Mince jdou mezi vsemi jen poštou z plánu 2 (příjezd, výsledek). Zanikne-li domovská ves, když je výsledek s mincemi na cestě, jdou mince **zpět hostiteli** toutéž zprávou `stranded-people` (pole `coins`) – zboží výsledku se zahodí jako v plánech 2 a 3, ale mince nesmějí zmizet. Jediná přijatá ztráta: zanikl-li i hostitel (oba konce mrtvé).
   - **Odchod lidí:** odejdou-li všichni, berou si osadníci úplně vše, i mince a zbroj (Martin 25. 11. 2026 – bod 13 jeho rozhodnutí). Obecné pravidlo (všechny zásoby, ne jen mince) zavádí samostatná oprava odchodu celé vsi `fix/leave-everything`, sloučená před tímto plánem; plán 4 ho nepíše – Úloha 1 jen přidá mince a zbroj mezi zásoby, které odchod celé vsi bere (viz oprava odchodu celé vsi), a Úloha 10 to ověří testem. Při odchodu části lidí nebo syna zůstávají mince a zbroj v mateřské vsi, kde se žije dál (návrh Clauda; Oznámit, bod 11).

10. **Úklid schránky** (dluh plánu 3: 2 řádky na výpravu). Použité řádky `market-arrive` a `market-result` starší než `MAIL_KEEP_DAYS` = 365 dní se smažou, jen když odesílatel už řádek nemůže poslat znovu: odesílatel není uspaný ani pryč a je o `MAIL_KEEP_DAYS` dál než den řádku (po každém dopočtu odesílatele se jeho odchozí schránka doručí a vyčistí). Řádky od zaniklých odesílatelů zůstanou – je jich nejvýš jeden svazek na zaniklou ves – a úklid ostatních nezdrží (mez počtu se bere až z bezpečných řádků). Odesílatele `market-arrive` nese `ref` (`market:<domov>:…`), u `market-result` pole `from` (pošta ho doplní). Technická mez, ne pravidlo: rok, jako úklid snímků okolí.

11. **Vsi synů na mapách stezek.** Ves syna – a stejně nová ves hráče při odchodu, cíl vybírá týž `targetSettlement` – smí vzniknout i na políčku, kterým vede stezka a žádná řeka (`isTrailOnly`), tam jako na suchém políčku; křižovatky a konce stezek také. Políčko se stezkou dostane výřez kostry (`skeleton`, verze vrstvy 1), krajinu z `emptyCellLandscape` a zemskou stezku hotovou od založení (`withSkeletonRoute`). Řeka, brod a suché políčko jako dřív; prémie brod a průsmyk zůstává hráčům, vsi syna se nedává. Sídla hráčů (umístění, `placeSeat`) se nemění: část „a dalších hráčů“ z Martinova „ok“ 22. 11. 2026 plán 4 neplní (sídla hráčů na mapě se stezkou jen s prémií Brod / Průsmyk) – Oznámit, bod 9.

12. **Rozhraní** (jako v 0 A.D.): panel Trh ukáže mince v „Dáš“, v „Dostaneš“ ne; ceny v mincích i s hladinou; kupci na trhu a den příštího příjezdu (ikona, datum); objednávka zbroje v panelu Trh vsi u stezky (bod 15); zásoba mincí a zbroje mezi zásobami zboží v panelu dvorce (`WaresStock` – i ve vsi bez medu a kožešin); kronika a upozornění o příjezdu kupců. Web nic nepočítá, jen ukazuje; seed zastávky klientovi nejde, jen den.

13. **Převod stavu:** žádný kromě `merchant-stops` (Global Constraints). Nová jména kroniky `merchants-arrived`, příznak `merchants` u obchodníka v přehledu, `level` a `armsOrder` jsou volitelné; staré záznamy bez nich se čtou jako dřív.

14. **Pořadí úloh:** 1 zboží; 2 mincovní fáze; 3 plán kupců; 4 kupci ve vsi – jádro; 5 kupci – načtení, převod a příjezd vsi na cestě; 6 objednávka zbroje; 7 co hostitel nabízí a ví; 8 výprava hráče s mincemi; 9 správce a zakázky; 10 oběh a zaniklé vsi; 11 úklid schránky; 12 vsi synů na stezkách; 13 ikony; 14 web; 15 test světa a Vlkov; 16 návrhy a celé e2e. 2 potřebuje 1; 3 jen dnešní kostru; 4 potřebuje 1–3; 5 potřebuje 3 a 4; 6 potřebuje 2, 4 a 5; 7 potřebuje 3 a 4; 8 potřebuje 2; 9 potřebuje 2, 7 a 8; 10 potřebuje 2 a 4; 11 jde po 10 (společné `village-mail.ts` a schránka); 12 potřebuje 5; 13 potřebuje 1; 14 potřebuje 6, 7, 10 a 13; 15 všechny předchozí; 16 poslední. Úlohy jdou po sobě – sdílejí soubory.

15. **Objednávka zbroje u kupců ve vlastní vsi** (Martin 25. 11. 2026: „Hráč zadá počet“; podrobnosti návrh Clauda). Hráč (právo `trade`) zadá v panelu Trh své vsi u stezky, kolik mečů, kroužkových košil a helem chce – `VillageState.armsOrder` (celé kusy, chybí = nic). V mincovní fázi dne kupců je ves koupí za mince vsi od kupců na trhu (ne od výprav) za cenu dne (cena × hladina), v pořadí `ARMS_GOODS`, po kusech, dokud na ně stačí mince a kupec zboží má; objednávka se o koupené zmenší a zbytek zůstane na další kupce. Ves smí utratit i mince, které týž den od kupců utržila (kupci kupují první). Platba jde do měšce kupce a odjede s ním. Hladinu objednávka zvedá jen hodnotou zbroje, kterou kupci na trhu dnes mají – nedosažitelná část objednávky se do C nepočítá (návrh Clauda).
    - Přání zbroje nepatří do zápočtu, `marketStance`, `nextPrices` ani do výhledů správce; počítá ho jen mincovní fáze (a hladina v ní – C a W bodu 3).
    - Zadat objednávku smí jen živá ves se zastávkou kupců (`merchantStops` neprázdné); počet je celé nezáporné číslo, nula položku smaže.

## Review Focus

1. **Domovská nebo hostitelská ves zanikne, když jsou mince na cestě** (výprava s mincemi, výsledek s mincemi, kupec na trhu), nebo z ní lidé odejdou: mince se nevytratí ani nezdvojí – vrátí se domů, nebo zpět hostiteli, celá ves si je při odchodu vezme s sebou; jen kupec odjíždí se svými. Test v Úlohách 4 a 10.
2. **Zlomkové ceny a měšec:** nákup pod minci, kus za neceločíselnou cenu, poslední mince v měšci, hladina ≠ 1 – mince vždy celé, součet dne nula, kupující neutratí víc, než má, prodávající neprodá pod výchozí hodnotu. Test v Úlohách 2 a 6.
3. **Kupci na křižovatce** (dva průjezdy týž den), kupci v den příjezdu výpravy, rušný trh (déle) a trh s jedním hostitelem bez výprav: pořadí příjezdu, jeden měšec na průjezd, nic se nezdvojí. Test v Úlohách 3 a 4.
4. **Dopočet po kouscích** (výprava na den kupců na hranici dávek, ves na cestě, která dorazí uvnitř dopočtu, objednávka zbroje), přeskok času, ves bez stezky: týž stav, zlaté otisky beze změny. Test v Úlohách 3, 4, 5 a 6.
5. **Úklid schránky** smaže řádek, který ještě není vyřízený (odesílatel pozadu, uspaný, pád mezi zápisem a smazáním z `outbox`): zboží ani mince se nezdvojí. Test v Úloze 11.
6. **Mince utratí jen hráč a správce:** vesničané platí obilím jako v plánu 3, trh vsi za mince nekoupí nic kromě objednané zbroje od kupců. Test v Úlohách 2, 6 a 9.
7. **Kupci jen na mapě, která stezku opravdu má** (uložený výřez sídla, ne políčko kostry), na všech pěti místech, kde se úložiště vsí zakládá. Test v Úloze 5.

## Mapa souborů

Složka `packages/game/src/domain/village/`, není-li uvedeno jinak.

| Úloha | Soubory                                                                                                                                                                                                                                                                                                                                           | Co                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1     | `types/types-trade.ts`, `types/types-state.ts`, `trade/goods.ts`, `trade/trade.ts`, `rules/rules-trade.ts`, seznam zásob, které bere odchod celé vsi (viz oprava odchodu celé vsi), `apps/web/lib/trade-names.ts`, `components/game/hud/MarketPanel.tsx` (seznam bez mincí)                                                                       | mince a zbroj jako zboží                               |
| 2     | `trade/market-coins.ts` (nový), `trade/market-prices.ts`, `trade/market.ts`, `trade/market-trip.ts` (`applyMarketResult` – hladina do zprávy), `types/types-market.ts`, `index.ts`                                                                                                                                                                | mincovní fáze a hladina                                |
| 3     | `packages/game/src/domain/world/skeleton/trail-stops.ts` (nový), `skeleton/index.ts`, `trade/merchant-plan.ts` (nový), `types/types-market.ts`, `rules/rules-merchants.ts` (nový), `rules/index.ts`, `index.ts`                                                                                                                                   | plán kupců                                             |
| 4     | `trade/merchants.ts` (nový), `trade/market.ts`, `core/simulate.ts`, `types/types-state.ts`, `types/types-market.ts`, `types/types-chronicle.ts`                                                                                                                                                                                                   | kupci ve vsi – jádro                                   |
| 5     | `core/migrations.ts`, `steward/steward-son.ts`, `application/update-village.ts`, `application/villages.ts`, `application/leave-village.ts`, `packages/db/src/adapters/village-repository.ts`, `packages/server/src/village-cache.ts`, `packages/server/src/deps.ts`, `apps/web/lib/game.ts`, `apps/web/lib/village.ts`, `apps/worker/src/main.ts` | kupci – načtení zastávek, převod, příjezd vsi na cestě |
| 6     | `trade/arms-order.ts` (nový), `trade/market-coins.ts`, `trade/market.ts`, `types/types-state.ts`, `index.ts`, `application/arms-order.ts` (nový), `application/rights.ts`, `application/index.ts`, `apps/web/lib/village.ts`, `apps/web/lib/village-input.ts`, `apps/web/app/game/actions/market.ts`                                              | objednávka zbroje u kupců                              |
| 7     | `trade/market-stance.ts`, `trade/village-report.ts`, `types/types-market.ts`                                                                                                                                                                                                                                                                      | co hostitel nabízí a ví                                |
| 8     | `trade/market-trip.ts` (`checkMarketTrip`)                                                                                                                                                                                                                                                                                                        | výprava hráče s mincemi                                |
| 9     | `steward/steward-market.ts`, `rules/rules-steward.ts`, `trade/villager-trips.ts` (jen `priceKg`), `trade/market-stance.ts` (export `NOISE_KG`), `trade/craft-orders.ts`                                                                                                                                                                           | správce a zakázky                                      |
| 10    | `trade/market.ts`, `trade/market-trip.ts` (`applyMarketResult`), `trade/market-people.ts`, `core/inbox.ts`, `types/types-market.ts`, `application/village-mail.ts`, `packages/db/src/adapters/inbox-repository.ts`, `application/__tests__/in-memory-inbox.ts`                                                                                    | oběh mincí, kronika a zaniklé vsi                      |
| 11    | `application/inbox.ts`, `application/village-mail.ts`, `application/nearby.ts`, `types/types-market.ts`, `packages/db/src/adapters/inbox-repository.ts`, `packages/db/src/adapters/village-repository.ts`, `application/__tests__/in-memory-inbox.ts`                                                                                             | úklid schránky                                         |
| 12    | `application/new-village.ts`, `domain/world/dry-cell.ts`, `domain/world/skeleton/sites.ts`, `domain/world/skeleton/index.ts`, `apps/web/e2e/village.spec.ts`                                                                                                                                                                                      | vsi synů na stezkách                                   |
| 13    | `apps/web/public/icons/resources`, `apps/web/public/icons/LICENSES.md`, `tools/blender/icons.py`                                                                                                                                                                                                                                                  | ikony                                                  |
| 14    | `core/summary.ts`, `apps/web/lib/manor-view.ts`, `village-view-chronicle.ts`, `village-notices.ts`, `trade-names.ts`, `components/game/hud/MarketPanel.tsx`, `hud/ManorPanel.tsx`, `hud/selection/wares.tsx`, `components/game/village-game/village-commands.ts`, `VillagePanels.tsx`, `apps/web/e2e/market.spec.ts`                              | web – pohledy, zásoby, panel, objednávka               |
| 15    | `trade/__tests__/market-merchants-years.test.ts` (nový), `packages/game/slow-tests.ts`, `docs/design/markets.md` (výsledek)                                                                                                                                                                                                                       | test světa a Vlkov                                     |
| 16    | `docs/design/*`, `docs/code/*`, `CLAUDE.md`                                                                                                                                                                                                                                                                                                       | návrhy, celé e2e                                       |

Testy a mapa kódu každé úlohy jsou v jejích Files.

---

### Task 1: Mince, meče, kroužkové košile a helmy jako zboží (Sonnet)

**Files:**

- Modify: `types/types-trade.ts` (`ArmsGood`, `TradeGood`), `types/types-state.ts` (`coins?`, `arms?`), `trade/goods.ts` (`ARMS_GOODS`, `isArmsGood`, `COIN_GOOD`, `withoutCoins`, `TRADE_GOODS`, `PIECE_GOODS`), `trade/trade.ts` (`villageGoodStock`, `addGood`), `rules/rules-trade.ts` (`TRADE_GOOD_VALUES`), `apps/web/lib/trade-names.ts` (4 názvy), `apps/web/components/game/hud/MarketPanel.tsx` (sloupec „Dostaneš“ bez mincí)
- Modify: seznam zásob, které bere odchod celé vsi (viz oprava odchodu celé vsi `fix/leave-everything`; jméno seznamu zjistit z opravy a ověřit `grep -rnw`) – přibudou mince a zbroj
- Modify: `docs/code/village-trade.md` (nový odstavec „Mince a zbroj“ vedle „Kůže, kožešiny, med a vosk“)
- Test: `trade/__tests__/coins-and-arms.test.ts` (nový), `trade/__tests__/market-clearing.test.ts` (výčet kusového zboží), `apps/web/lib/__tests__/trade-names.test.ts`, `apps/web/components/game/hud/__tests__/MarketPanel.test.tsx` (sloupec „Dostaneš“ bez mincí)

**Interfaces:**

- Consumes: `MARKET.grainKgPerCoin`, `initialPrice`, `EPSILON` v `trade.ts`, vzor `case 'wax'`.
- Produces:

```ts
// types/types-trade.ts
export type ArmsGood = 'swords' | 'mailShirts' | 'helmets';
// TradeGood += ArmsGood | 'coins' (za 'wax', před PeopleGood)
// types/types-state.ts (VillageState)
/** Mince vsi – celé kusy (markets.md – Rozhodnutí plánu 4, bod 1); chybí = žádné. */
coins?: number;
/** Zbroj vsi po kusech (bod 7, jen zboží – účinek v boji až vlastní mechanikou, war.md – Výzbroj); chybí = žádná. */
arms?: Partial<Record<ArmsGood, number>>;
// trade/goods.ts
export const ARMS_GOODS: readonly ArmsGood[] = ['swords', 'mailShirts', 'helmets'];
export function isArmsGood(good: TradeGood): good is ArmsGood;
export const COIN_GOOD = 'coins' as const;
/** Kopie zboží bez mincí, jen kladné položky v pořadí TRADE_GOODS. */
export function withoutCoins(goods: TradeGoods): TradeGoods;
```

- `TRADE_GOODS`: `… 'honey', 'hides', 'furs', 'wax', ...ARMS_GOODS, 'coins', ...PEOPLE_GOODS`. `PIECE_GOODS` += zbroj a `coins` (na konec před `PEOPLE_GOODS` – zachovat pořadí komentáře).
- `TRADE_GOOD_VALUES` (`rules-trade.ts` dostane import `MARKET` z `./rules-market`; komentář s odkazem „markets.md – Rozhodnutí plánu 4, body 1 a 7“ a zdrojem cen zbroje Coupland / Lex Ribuaria 40, 11): `coins { valueKg: MARKET.grainKgPerCoin, carryKg: 0 }` (mince nosiče nepřidají, jako dobytek, vozy a lidé), `swords { 1800, 1.5 }`, `mailShirts { 7200, 12 }`, `helmets { 3600, 1.5 }`.
- `villageGoodStock`: `coins` → `Math.floor((state.coins ?? 0) + EPSILON)`; zbroj → `Math.floor(state.arms?.[good] ?? 0)`. `addGood`: mince i zbroj nikdy pod 0, nula ze stavu zmizí (`delete state.coins` / položku `arms`, prázdné `arms` celé), jiné zboží beze změny.
- `TRADE_GOOD_NAMES`: `coins` Mince / mincí / ks / `coin`, `swords` Meče / mečů / ks / `sword`, `mailShirts` Kroužkové košile / kroužkových košil / ks / `mail-shirt`, `helmets` Helmy / helem / ks / `helmet` (soubory ikon přidá Úloha 13 – do té doby chybějící obrázek).
- Odchod celé vsi (Rozhodnutí 9; viz oprava odchodu celé vsi): `coins` a `arms` přibudou do seznamu zásob, který oprava prochází, takže je osadníci berou jako všechno ostatní; při odchodu části lidí nebo syna zůstávají ve staré vsi. Žádné vlastní pravidlo odchodu se tu nepíše; ověří to Úloha 10.
- Panel: `MarketPanel` ve sloupci „Dostaneš“ nabídne `TRADE_GOODS` bez `coins` (mince se na seznam nedávají – Rozhodnutí 1); „Dáš“ je ukáže, jakmile je ves má (beze změny – `market.stock`).

- [ ] **Step 1: Testy** (`coins-and-arms.test.ts`, přípravky `market-fixtures.ts`):
  - `initialPrice('coins')` = 1, `initialPrice('swords')` = 120, `'helmets'` = 240, `'mailShirts'` = 480, `TRADE_GOOD_VALUES.coins.valueKg` = `MARKET.grainKgPerCoin`.
  - `isPieceGood` pro `coins`, `swords`, `mailShirts`, `helmets` true; `withoutCoins({ grain: 3, coins: 2 })` → `{ grain: 3 }`.
  - Ves s `coins: 10`: `villageGoodStock(state, 'coins', day)` = 10; `addGood(state, 'coins', -4, day)` → 6; `addGood(state, 'coins', -10, day)` → `state.coins` neexistuje a zásoba 0. Zbroj: `addGood(state, 'swords', 2, day)` → `arms = { swords: 2 }`, `addGood(state, 'swords', -2, day)` → `arms` neexistuje; `addGood(state, 'helmets', -1, day)` na prázdné vsi → nic.
  - `departMarketInPlace` s `give: { coins: 5 }` u vsi s 10 mincemi: `state.coins` = 5, příjezd má `goods.coins` = 5; `give: { coins: 2.5 }` → `MARKET_BAD_ORDER`; `give: { coins: 11 }` → `MARKET_OVER_STOCK`.
  - Váha: `marketCrew({ grain: 300, coins: 1000 }, {}, [])` = 12 nosičů jako bez mincí, `marketCrew({ coins: 1000 }, {}, [])` = 1; `marketCrew({ swords: 2, mailShirts: 2 }, {}, [])` = 2 (27 kg).
  - `market-clearing.test.ts`: výčet `TRADE_GOODS.filter(isPieceGood)` přibere `swords`, `mailShirts`, `helmets` a `coins` za `furs` (před lidmi); `MarketPanel.test.tsx`: sloupec „Dostaneš“ mince nenabízí, „Dáš“ je ukáže, má-li je ves.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/coins-and-arms.test.ts packages/game/src/domain/village/trade/__tests__/market-clearing.test.ts apps/web/lib/__tests__/trade-names.test.ts apps/web/components/game/hud/__tests__/MarketPanel.test.tsx` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces (TypeScript ukáže všechny vyčerpávající `Record<TradeGood, …>` a `switch` – doplnit jen tyto, žádné jiné zboží neměnit); do seznamu zásob odchodu celé vsi doplnit mince a zbroj (viz oprava odchodu celé vsi – jméno ověř `grep -rnw`).
- [ ] **Step 4: Spustit** testy ze Step 2 a `npx vitest run packages/game/src/domain/village/trade` – PASS; beze změny `market-prices.test.ts` (nová cena mincí se v nich neobjeví) a žádný zlatý otisk.
- [ ] **Step 5: Mapa kódu**, kontroly z Global Constraints, commit `feat(game): mince, meče, kroužkové košile a helmy jako zboží trhu (plán 4)`.

### Task 2: Mincovní fáze trhu a cenová hladina (Opus)

**Files:**

- Create: `trade/market-coins.ts`
- Modify: `trade/market-prices.ts` (`nextPrices` přeskočí mince, `coinPriceOf`, `nextLevel`), `trade/market.ts` (`marketDay` třetí fáze, `payCoins`, `level` ve výsledku – `marketResult` bere i `level` z `extra`), `trade/market-trip.ts` (`applyMarketResult` – hladina do zprávy), `types/types-market.ts` (`VillageMarket.level?`, `MarketResult.level?`, `VillageNews.level?`, `MarketVisitor.merchant?` – nastaví ho až Úloha 4), `packages/game/src/domain/village/index.ts` (export `coinPriceOf` – bere ho web)
- Modify: `docs/code/village-trade.md` (Trh – ceny a zápočet: mincovní fáze, hladina; Trh ve vsi: třetí fáze)
- Test: `trade/__tests__/market-coins.test.ts` (nový), `trade/__tests__/market-prices.test.ts`, `trade/__tests__/market.test.ts`

**Interfaces:**

- Consumes: `priceOf`, `nextPrices`, `settleTrades` (přesná podoba `MarketClearing` – `{ trades, offered, wanted }`), `goodsLeft`, `marketStance`, `addGood`, `withoutCoins`, `COIN_GOOD`, `MARKET.priceStep` (krok je týž jako u cen zboží).
- Produces:

```ts
// trade/market-prices.ts
/** Cena zboží na trhu v mincích: relativní cena × hladina trhu (Rozhodnutí plánu 4, bod 3). */
export function coinPriceOf(
  prices: MarketPrices | undefined,
  level: number,
  good: TradeGood,
): number;
/** Hladina po mincovní fázi: level × (1 + priceStep × (C − W) / (C + W)), nejméně 1; W = 0 (`sought`) beze změny. */
export function nextLevel(level: number, available: number, sought: number): number;
// trade/market-coins.ts
export interface CoinParty {
  key: string;
  /** Mince k útratě – celé; hostitel 0, jen prodává (objednanou zbroj přidá Úloha 6). */
  coins: number;
  /** Co strana prodává (bez mincí) a co po zápočtu shání (bez mincí). */
  stock: TradeGoods;
  wants: TradeGoods;
  /** Cizí kupec – kupuje první (Rozhodnutí 2). */
  merchant?: true;
}
/** Celé mince od kupujícího k prodávajícímu za dvojici a den. */
export interface CoinPayment {
  buyer: string;
  seller: string;
  coins: number;
}
export interface CoinClearing {
  trades: MarketTrade[];
  payments: CoinPayment[];
  /** C – mince, které mohly strany dnes utratit, a W – hodnota zboží, které za ně chtěly a bylo na trhu. */
  available: number;
  sought: number;
}
export function coinClearing(
  parties: readonly CoinParty[],
  prices: MarketPrices,
  level: number,
): CoinClearing;
```

- `coinClearing`: pořadí prodávajících je pořadí `parties` (hostitel, výpravy a kupci podle příjezdu); pořadí kupujících = kupci (`merchant`) v tomto pořadí, pak ostatní v tomto pořadí. Pro dvojici kupující a prodávající: `bill` = 0; u každého zboží `TRADE_GOODS` (bez `coins`) `amount` = min(chce, má, zbývající měšec ÷ jednotková cena – kus jen celý, `floor(x + NOISE)`), `bill += amount × cena`; zlomek pod `NOISE_KG` se přeskočí. Součet dvojice pod 1 minci se zruší celý; jinak `coins` = `Math.ceil(bill − NOISE)` a přejde z měšce kupujícího k prodávajícímu (prodávající ho smí týž den utratit, je-li v pořadí kupujících za ním). Měšec nikdy pod 0. `available` / `sought` (Rozhodnutí 3) se počítají z měšců, seznamů a nabídek **na začátku** fáze: kupující = strany s `coins` > 0 a hodnotou seznamu v mincích > 0, C = Σ min(`coins`, hodnota seznamu), W = Σ přes zboží min(Σ seznamů kupujících, Σ nabídek všech stran) × cena. Kolik mincí kdo má, vznikne jen z `payments` – součet přes strany je nula. `nextLevel` při W = 0 hladinu nemění (Rozhodnutí 3).
- `marketDay` po obou dnešních zápočtech: strany = hostitel (`coins` 0 a prázdné `wants` – v mincovní fázi jen prodává, Rozhodnutí 2 a 4; `stock` = `goodsLeft(stance.offer, prodáno v 1. a 2.)`) a návštěvníci bez `service` a `kin` (`coins` = `goods.coins`, `stock` = `withoutCoins(goods)`, `wants`, `merchant`). Nemá-li žádný kupující mince a co koupit, fáze se nespustí a `market.level` se nemění – mince v zásobě vsi ji samy nespustí. Lidé hostitele: `stock` rodin, mužů a žen je nejvýš tolik skupin, kolik jich po zápočtech doopravdy odejde (`leavingGroups(state, day, zbytek nabídky)` – výběr je postupný), aby kupující nezaplatil lidi, které nedostane. Jinak `settleTrades(state, day, visitors, { trades, offered: {}, wanted: {} })` a `payCoins` (hostitel `addGood(state, 'coins', …)`, návštěvník `visitor.goods.coins`); `market.level = nextLevel(…)` (chybí = 1 se nezapisuje: `level` ze stavu zmizí, je-li 1). Součty `offered` a `wanted` pro `nextPrices` jsou beze změny a bez mincí (`withoutCoins`), zápočty dostanou nabídky bez mincí. `departVisitors` dostane dál `goodsLeft(stance.wants, second.bought)` – hostitel ze svého `wants` za mince nic nekoupí.
- Kronika `market-held`: co ves prodala a koupila ve všech třech fázích; zaplacené mince v `sold.coins`, získané v `bought.coins` (jen když > 0).
- `departVisitors` dá výsledku `level` (jen ≠ 1) vedle `prices`; `applyMarketResult` uloží `level` do zprávy (`VillageNews.level`, `rememberNews`). Starší zprávy bez něj = 1.

- [ ] **Step 1: Testy** (`market-coins.test.ts`, výchozí ceny – obilí 1/15 mince za kg, kráva 40, kožešina 8/15, med 0,4, vosk 2):
  - Hostitel `stock { grain: 1000 }`, výprava `coins: 50`, `wants { grain: 300 }` → obchod 300 kg, platba 20 mincí, měšec 30.
  - Výprava `coins: 7`, `wants { grain: 300 }` → 105 kg za 7 mincí.
  - Kupec (`merchant`, `coins: 10`, `wants { furs: 60 }`), hostitel `furs: 30` → 18 kožešin za 10 mincí (9,6 nahoru).
  - Hostitel s `coins: 0` a `wants {}` nikdy nic nekoupí; jeho `stock` nabídne i lidi, koně, vozy a klády.
  - Hostitel `furs: 10`, výprava `furs: 30`, kupec `coins: 20`, `wants { furs: 60 }` → 10 ks od hostitele za 6 mincí a 26 ks od výpravy za 14; měšec 0.
  - Kupec `coins: 10`, `wants { furs: 1 }`, hostitel `furs: 1` → nic (pod 1 minci).
  - `level` = 2: první případ stojí 40 mincí (měšec 10 zbude); s `coins: 30` nakoupí jen 225 kg za 30.
  - Mince kupce se týž den roztočí: hostitel `stock { grain: 1000 }`; výprava `coins: 0`, `stock { furs: 100 }`, `wants { grain: 75 }`; kupec `coins: 60`, `wants { furs: 60 }` → kupec platí výpravě 32 mincí, výprava hostiteli 5 (měšec 27).
  - Nikdo nekupuje od sebe, součet plateb stran je nula, každý měšec ≥ 0 a celý – 50 náhodných trhů (`createRandom(1)`), kupci 0–3, množství 0–500.
  - `coinClearing` s kupcem 60 mincí a seznamem 60 kožešin, hostitelem s 20 kožešinami: `available` 32, `sought` 10,667 a `nextLevel(1, 32, 10 + 2/3)` = 1,05, `nextLevel(1.5, 5, 100)` = 1,3643 (na 4 místa), `nextLevel(1, 5, 100)` = 1, `nextLevel(2, 0, 0)` = 2, `coinPriceOf({}, 2, 'furs')` = 16/15. **W = 0:** `nextLevel(1, 60, 0)` = 1, `nextLevel(1.5, 60, 0)` = 1,5 a 100 tržních dní s kupcem 60 mincí na trhu, kde nikdo nic z jeho seznamu nenabízí → `market.level` chybí. `nextPrices` s mincemi v seznamu: cena `coins` se nezapíše.
- [ ] **Step 2: Testy trhu** (`market.test.ts`, výprava na trh s mincemi): hostitel s přebytkem obilí a výprava `goods: { coins: 50 }`, `wants: { grain: 300 }` → po dni hostitel `coins` 20, výprava `goods.coins` 30 a `bought.grain` 300, kronika `market-held` `sold: { grain: 300 }`, `bought: { coins: 20 }`; druhý den pobytu smí výprava utratit zbytek. **Hostitel za mince nekupuje:** ves s `coins: 500`, která podle výpočtu shání krávu, a výprava s krávou bez přání → mincovní fáze nic, `state.coins` 500, kráva odjede domů; s výpravou bez mincí se fáze nespustí, i když ves mince má. **Kusy se záznamem** (fixtury koní, vozů a lidí z `market.test.ts` a `market-people.test.ts`): výprava koupí od hostitele za mince klisnu (107 – 106,67 nahoru), dvoukolák (22 – 21,33 nahoru) a muže (24), dostane tutéž klisnu, týž vůz (`builtDay`) a téhož člověka (`boughtPeople`, `fromHost`). **Lidé ve dvou fázích dne:** jedna výprava koupí muže zápočtem, druhá týž den za mince – odejdou dva různí lidé; jde-li po zápočtu vybrat už jen o skupinu méně, než hostitel nabízel, druhá výprava nic nekoupí a nezaplatí. Výprava bez mincí: `market.level` ani `state.coins` po dni nevzniknou a obchody, ceny i kronika jsou jako dnes – dosavadní testy `market.test.ts` a `market-two-villages.test.ts` beze změny.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces (nové soubory bez infrastruktury, čisté funkce kromě `payCoins` a `marketDay`). Slovo „kupec“ v kódu i v testech znamená jen cizího kupce; kdo v mincovní fázi nakupuje, je „kupující“.
- [ ] **Step 5: Spustit** `npx vitest run packages/game/src/domain/village/trade` a `nice -n 19 npm run test:slow` – PASS (žádný zlatý otisk).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): mincovní fáze trhu a cenová hladina (plán 4)`.

### Task 3: Zastávky na stezkách a plán kupců (Opus)

**Files:**

- Create: `packages/game/src/domain/world/skeleton/trail-stops.ts`, `trade/merchant-plan.ts`, `rules/rules-merchants.ts`
- Modify: `types/types-market.ts` (`MerchantStop`), `packages/game/src/domain/world/skeleton/index.ts` (výčet exportů), `rules/index.ts` (export), `packages/game/src/domain/village/index.ts` (exporty `merchantVisits`, `nextMerchantVisit`, `MerchantVisit` – berou je web a testy; `trailStops` a `MerchantStop` bere adaptér DB)
- Modify: `docs/code/world.md` (Kostra světa – zastávky stezky), `docs/code/village-trade.md` (nový odstavec „Cizí kupci – plán“)
- Test: `packages/game/src/domain/world/skeleton/__tests__/trail-stops.test.ts`, `trade/__tests__/merchant-plan.test.ts` (oba nové)

**Interfaces:**

- Consumes: `trailNode`, `trailEdgeExists`, `trailSides` (`trails.ts` – tvar spojení jako `edgeSegments`: uzel → hranice bloků → ohyb → druhý uzel; žádná nová sůl), `deriveSeed`, `createRandom` (`domain/landscape/random`), `dayIndexOf`, `dateOfDayIndex`, `TOTAL_GAME_DAYS` (`domain/calendar`).
- Produces:

```ts
// types/types-market.ts
/** Zastávka dálkové stezky ve vsi – spojení, kterým vede (markets.md – Rozhodnutí plánu 4, bod 5). */
export interface MerchantStop {
  /** `<blok x>,<blok y>,<E|N>` – spojení uzlů kostry. */
  key: string;
  /** `deriveSeed(worldSeed, 'merchants:' + key)`. */
  seed: number;
  /** Pořadí políčka vsi na cestě od prvního uzlu (0 … `length` − 1). */
  index: number;
  /** Políček cesty spojení (i oba uzly). */
  length: number;
}
// rules/rules-merchants.ts – markets.md – Rozhodnutí plánu 4, body 5 (návrh Clauda)
export const MERCHANTS = {
  passesPerYear: 4,
  passSpacingDays: 91,
  passWindowDays: 60,
  daysPerCell: 1,
  coins: 60,
  goods: { swords: 2, mailShirts: 1, helmets: 2 },
  wants: { honey: 100, wax: 24, furs: 60 },
  busyVisitors: 3,
  // pravidlo hry (návrh Clauda – Oznámit, bod 5), ne technická mez
  maxStayDays: 3,
} as const;
// domain/world/skeleton/trail-stops.ts (deterministická vrstva, jen det-math a celá čísla)
export interface TrailConnection {
  readonly block: GridCell;
  readonly dir: 'E' | 'N';
}
/** Políčka spojení od uzlu bloku k druhému uzlu v pořadí cesty, každé jednou; null = spojení není. */
export function trailPath(worldSeed: number, connection: TrailConnection): GridCell[] | null;
/** Zastávky políčka – jedna na každé spojení, které jím vede, seřazené podle `key`; bez stezky []. */
export function trailStops(worldSeed: number, cell: GridCell): MerchantStop[];
// trade/merchant-plan.ts
export interface MerchantVisit {
  /** `merchants:<stop.key>:<rok>:<průjezd>`. */
  key: string;
  /** První tržní den kupců ve vsi. */
  day: number;
}
/** Příjezdy kupců na zastávky vsi v dnech `fromDay` … `toDay` (včetně), seřazené podle dne, pak `key`. */
export function merchantVisits(
  stops: readonly MerchantStop[],
  fromDay: number,
  toDay: number,
): MerchantVisit[];
/** Nejbližší příjezd v den ≥ `fromDay` (do konce světa); bez zastávek, nebo za koncem světa null. */
export function nextMerchantVisit(
  stops: readonly MerchantStop[],
  fromDay: number,
): MerchantVisit | null;
```

- Průjezd `i` (0 … `passesPerYear` − 1) spojení v roce `r`: `u₁`, `u₂` = první a druhé číslo `createRandom(deriveSeed(stop.seed, 'pass:' + r + ':' + i))`; začátek = den `1. 1. r` (`dayIndexOf`) + `i × passSpacingDays` + `⌊u₁ × passWindowDays⌋`; zpátky, je-li `u₂ < 0,5`; den ve vsi = začátek + (zpátky ? `length − 1 − index` : `index`) × `daysPerCell`. `4 × 91 = 364` – průjezdy se vejdou do roku. Dny mimo 0 … `TOTAL_GAME_DAYS` − 1 se vynechají. Dotaz na den prochází jen roky, kam průjezd mohl dojet (`rok(fromDay − délka cesty)` … `rok(toDay)`), a z nich jen roky světa 500–1499 (`dayIndexOf` na rok 499 nebo 1500 vyhodí `RangeError`) – žádná smyčka přes celý svět.
- `trailStops` hledá spojení 3 × 3 bloků × 2 směry kolem políčka (jako `trailSides`), bez stavu a bez databáze; uzel má zastávku za každé spojení, které v něm končí.

- [ ] **Step 1: Testy zastávek** (`trail-stops.test.ts`, seedy 1, 7, 20270101, okno 60 × 60 políček):
  - `trailStops(seed, cell).length > 0` ⇔ `trailSides(seed, cell).length > 0` pro každé políčko okna.
  - U každého existujícího spojení v okně: `trailPath` začíná `trailNode(block)`, končí `trailNode` sousedního bloku (E nebo N), políčka jsou jedinečná a sousedí spolu (rozdíl právě jeden krok); každé políčko cesty má zastávku se `key` spojení, `index` = jeho pořadí, `length` = délka; `trailPath` neexistujícího spojení (`trailEdgeExists` false) je null.
  - Výsledek nezávisí na pořadí dotazů (dotaz po 1 000 jiných), seedy dvou spojení se liší; políčko bez stezky → `[]`.
- [ ] **Step 2: Testy plánu** (`merchant-plan.test.ts`, zastávka `{ key: '0,0,E', seed: 7, index: 3, length: 21 }`):
  - Za každý rok 510–512 právě 4 příjezdy s klíčem `merchants:0,0,E:<rok>:<0…3>`; den průjezdu `i` je v `[1. 1. + i × 91 + 3, 1. 1. + i × 91 + 59 + 17]` (index 3 tam, 17 zpátky).
  - `merchantVisits(stops, a, c)` = `merchantVisits(stops, a, b)` + `merchantVisits(stops, b + 1, c)` pro tři náhodné dělení; opakované volání dá totéž; jiný `seed` zastávky dá jiné dny.
  - Dvě zastávky vsi (křižovatka) dají sloučený seznam seřazený podle dne, pak klíče; `nextMerchantVisit(stops, d).day` je nejmenší den ≥ `d`, `nextMerchantVisit([], d)` null, za koncem světa null.
  - Okraje světa: dotaz na každý z dnů 0–40 (předchozí rok je 499) i na posledních 100 dní světa (následující rok je 1500) nespadne a vrací jen dny 0 … `TOTAL_GAME_DAYS` − 1; `merchantVisits(stops, 0, 40)` = sloučené jednodenní dotazy; `nextMerchantVisit` z posledního dne světa null, nebo tentýž den.
  - Zlatý otisk: `JSON.stringify(merchantVisits(...))` let 510–512 zastávky výše (FNV, hodnota zapsaná testem při první implementaci; po ostrém spuštění se plán nemění) – **zapsat skutečnou hodnotu, ne vymyšlenou**.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/world/skeleton packages/game/src/domain/village/trade/__tests__/merchant-plan.test.ts` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces (`rules/index.ts` + `rules-merchants`, `world/skeleton/index.ts` + `trail-stops`). Na `trails.ts` nic neměnit – pomocníci uzlů a spojení se exportují nebo zopakují ve `trail-stops.ts` týmiž funkcemi (`trailNode`, `trailEdgeExists`).
- [ ] **Step 5: Spustit** testy ze Step 3 – PASS; zlatý otisk kostry (`skeleton/__tests__/golden.test.ts`) beze změny.
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): zastávky na stezkách a plán cizích kupců (plán 4)`.

### Task 4: Kupci ve vsi u stezky – jádro (Opus)

**Files:**

- Create: `trade/merchants.ts`
- Modify: `trade/market.ts` (`departVisitors`, `marketDay`), `core/simulate.ts` (`advanceVillageSteps` – `merchantsArrive`), `types/types-state.ts` (`merchantStops?`), `types/types-market.ts` (`MarketArrivalNote.merchants?`), `types/types-chronicle.ts` (`merchants-arrived`)
- Modify (jen kvůli typům, texty dopíše Úloha 14): `apps/web/lib/village-view-chronicle.ts`, `apps/web/lib/village-notices.ts`
- Modify: `docs/code/village-trade.md` (Cizí kupci), `docs/code/village-core.md` (Pořadí práce dne)
- Test: `trade/__tests__/market-merchants.test.ts` (nový)

**Interfaces:**

- Consumes: `merchantVisits`, `nextMerchantVisit`, `MERCHANTS`, `MerchantStop` (Úloha 3), mincovní fáze a `goods.coins` (Úlohy 1 a 2), `joinMarket`, `MarketVisitor`, `MARKET.report.traders`.
- Produces:

```ts
// types/types-state.ts
/** Zastávky dálkových stezek ve vsi (Rozhodnutí plánu 4, bod 5); chybí = ještě nezjištěno, [] = mapa bez stezky. */
merchantStops?: MerchantStop[];
// types/types-market.ts
// MarketArrivalNote.merchants?: true; `MarketVisitor.merchant` (typ z Úlohy 2) znamená cizího kupce – bez domovské vsi, odjede bez pošty
// types/types-chronicle.ts
// | { kind: 'merchants-arrived'; sells: TradeGoods; buys: TradeGoods; coins: number }
// trade/merchants.ts
/** Cizí kupci, kteří dnes přijeli (mutuje stav): trh vznikne, chybí-li; návštěvník za každý příjezd plánu, poznámka v `arrivals`, kronika `merchants-arrived`. */
export function merchantsArrive(state: VillageState, day: number): ChronicleEvent[];
/** Na rušném trhu kupci zůstanou další den (mutuje návštěvníky; `marketDay` před odjezdy). */
export function extendMerchants(market: VillageMarket, day: number): void;
/** Co by kupec za svůj měšec koupil (celé jednotky, Rozhodnutí 3) – poptávka kupce pro cenu dne. */
export function affordableWants(
  visitor: MarketVisitor,
  prices: MarketPrices,
  level: number,
): TradeGoods;
```

- `merchantsArrive`: `merchantVisits(state.merchantStops ?? [], day, day)` (prázdné zastávky hned konec); za každý příjezd návštěvník s `key` průjezdu, `fromVillageId: ''`, `fromName: ''`, `order` = `market.nextOrder++`, `arrivedDay` = `lastDay` = `day`, `travelDays` 0, `goods` = `MERCHANTS.goods` + `coins: MERCHANTS.coins`, `wants` = `MERCHANTS.wants`, `horses: []`, `boughtHorses: []`, `merchant: true`; poznámka `{ name: '', day, goods: druhy zbroje, merchants: true }` (strop `MARKET.report.traders`). Týž klíč, který na trhu už stojí, se znovu nezaloží. Kronika `merchants-arrived` za každý příjezd.
- `advanceVillageSteps`: po `applyInboxDay` a před `marketDay` – `morning.push(...merchantsArrive(next, day))`; návštěvník tak obchoduje už dnes.
- `marketDay`: před `departVisitors` `extendMerchants(market, day)`: kupec s `lastDay === day`, na trhu je aspoň `MERCHANTS.busyVisitors` jiných výprav (bez kupců, `service` a `kin`) a stojí < `MERCHANTS.maxStayDays` dní → `lastDay += 1`. Kupci jsou strana obou zápočtů i mincovní fáze (`merchant: true`).
- `departVisitors`: kupec odjede bez `recordOrders` a bez `outbox` (nemá domov) – jeho měšec, zbylá zbroj a koupené zboží odejdou ze světa; ostatní návštěvníci beze změny.
- `marketDay`: do `wanted` pro `nextPrices` jdou u kupců `affordableWants(visitor, prices, level)` (Rozhodnutí 3 – nejvýš `⌊měšec ÷ coinPriceOf⌋` celých jednotek, měšec na začátku dne) jen u zboží, které je na trhu ke koupi, u ostatních stran seznam beze změny; v den jen s kupci jen zboží, které vezou nebo shánějí (`priceTotals`); do mincovní fáze jde celý seznam kupce.
- Pokud ves kupci navštíví, `joinMarket` a `villageReport` se nemění (poznámka jen s příznakem `merchants`).

- [ ] **Step 1: Testy jádra** (`market-merchants.test.ts`, ves z `marketVillage` / `homeVillage` s obilím nad pojistkou; `merchantStops: [{ key: '0,0,E', seed: 7, index: 0, length: 1 }]`, první den kupců = `nextMerchantVisit(stops, D).day`):
  - V den příjezdu: kronika `merchants-arrived` (`sells` = `MERCHANTS.goods`, `coins` 60), v `market.visitors` jeden kupec s `merchant: true` a `goods.coins` 60, poznámka v `market.arrivals` s `merchants: true`, po `marketDay` obchod dne; den po příjezdu kupec ve `visitors` není.
  - Výprava na trhu s `goods: { furs: 30, wax: 4 }`, `wants: {}` a hostitel bez přebytků: kupec koupí 30 kožešin (16 mincí) a 4 kg vosku (8 mincí), výprava má `goods.coins` 24 a odveze je, kupec `goods.coins` 36; `bought` / `sold` výpravy i kupce odpovídají (Úloha 7 ověří totéž s vlastní nabídkou hostitele).
  - **Zápočet s kupcem při výchozích cenách** (hostitel bez přebytku, výprava `wants: { swords: 1 }`, bez mincí): `goods: { honey: 100, wax: 24, furs: 60 }` (hodnota 40 + 48 + 32 = 120) → zápočtem vymění celý náklad za 1 meč, měšec kupce zůstane 60; s `wax: 20` (112 mincí) zápočet nic – v mincovní fázi kupec vykoupí zboží za celý měšec 60 mincí a na meč výprava nemá (`bought.swords` chybí).
  - **Součet světa:** mince vsi + měšec kupce ve dnech před a po tržním dni = 60 (+ žádná jiná změna); po odjezdu zmizí jen zbytek měšce a zbylá zbroj. Zbraně: výprava s `coins: 300` a `wants: { swords: 1 }` koupí od kupce meč za 120 mincí a odveze ho (`bought.swords` 1), kupci zbude o 1 méně.
  - Rušný trh: tři další výpravy na trhu v den příjezdu → kupec stojí 2 dny; stále tři → 3 dny, pak odjede (`maxStayDays`); dvě výpravy → 1 den. Dva průjezdy téhož dne (dvě zastávky) → dva kupci, každý svůj měšec 60.
  - `affordableWants`: kupec s měšcem 60, seznamem 60 kožešin a výchozí cenou 8/15 → 60 (celý seznam); cena 10 mincí za kožešinu → 6; 61 mincí → 0. `marketDay` na trhu, kde kožešiny nikdo nenabízí: cena se nehne; výprava s jednou kožešinou: 8/15 × (1 + 0,1 × 59/61) (D = 60, S = 1), při uložené ceně 60 se nezmění (D = 1), při 61 klesne na 54,9 (D = 0).
  - **100 průjezdů kupce bez nabídky** (hostitel bez medu, vosku a kožešin, shání nástroje a krávy, 100 tržních dní s čerstvým kupcem): `market.level` ze stavu chybí, ceny medu, vosku, kožešin, nástrojů a krav zůstanou. **10 let na křižovatce** (4 spojení) jen s kupci: ceny v mezích, žádné `NaN` ani `Infinity`. S 20 kg medu na průjezd cena roste a ustálí se na 3 mincích za kg. Den s výpravou: všechny ceny beze změny pravidla, jen poptávka kupců bez nabídky cenou nehne.
  - Ves bez `merchantStops` i s `[]`: stav po 90 dnech bit po bitu jako bez úlohy (`toEqual` proti běhu bez kupců). Dopočet 400 dní vcelku a po kouscích (100 + 300) u vsi se zastávkou: shodný stav i kronika. Kupec zaniká s odjezdem, spící ves nepřijíždí (`isVillageDormant`).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-merchants.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces; do `village-view-chronicle.ts` a `village-notices.ts` jen nejkratší větev nového druhu, aby prošel typecheck (text a ikona v Úloze 14).
- [ ] **Step 4: Spustit** test ze Step 2 a `npx vitest run packages/game/src/domain/village/trade` – PASS; `nice -n 19 npm run test:slow`; zlaté otisky beze změny.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): cizí kupci na stezkách přijíždějí do vsi (plán 4)`.

### Task 5: Kupci – načtení zastávek, převod a příjezd vsi na cestě (Opus)

**Files:**

- Modify: `core/migrations.ts` (`VillageLoadContext.merchantStops?`, převod `merchant-stops`), `steward/steward-son.ts` (`stewardArrival` přenese `merchantStops`), `application/leave-village.ts` (`settleJourney` totéž), `application/villages.ts` (`merchantStopsOf?`), `application/update-village.ts` (načtení zastávek), `application/__tests__/in-memory-villages.ts` (volitelný `merchantStopsOf` testu)
- Modify: `packages/db/src/adapters/village-repository.ts` (`createVillageRepository(db, worldSeed)`, `merchantStopsOf`), `packages/server/src/village-cache.ts` (předání portu)
- Modify (všech 5 míst, kde se úložiště zakládá – seed světa povinně): `packages/server/src/deps.ts`, `apps/web/lib/game.ts` (dvě místa), `apps/web/lib/village.ts` (`villages()` – úložiště všech akcí vsi), `apps/worker/src/main.ts` (`campaignVillages` – tažení a výjezdy)
- Modify (jen nový povinný parametr): `apps/worker/scripts/measure-campaign-db.ts`, `apps/worker/scripts/measure-alarm-view.ts` a DB testy, které úložiště zakládají (`grep -rln "createVillageRepository(" packages apps --include='*.ts'` – 15 souborů)
- Modify: `docs/code/village-core.md` (Převody starších vsí – řádek `merchant-stops`), `docs/code/world.md` (zastávky jen z výřezu sídla), `docs/code/village-trade.md` (Cizí kupci – načtení)
- Test: `application/__tests__/update-village-merchants.test.ts` (nový, vzor `update-village-weather.test.ts`), `steward/__tests__/steward-son.test.ts`, `application/__tests__/leave-village.test.ts`, `core/__tests__/migrations.test.ts`, `packages/db/src/adapters/__tests__/village-repository.db.test.ts`

**Interfaces:**

- Consumes: `trailStops`, `MerchantStop` (Úloha 3), `merchantStops` a kupci (Úloha 4), `withWeatherSeed` (vzor převodu), `weatherSeedOf` (vzor portu).
- Produces:

```ts
// application/villages.ts (VillageRepository)
/** Zastávky dálkových stezek mapy, na které ves stojí (`trailStops` z uloženého výřezu sídla); neznámé sídlo → null. Chybí (testy jádra, kalibrace) – zastávky se nezjišťují. */
readonly merchantStopsOf?: (settlementId: string) => Promise<readonly MerchantStop[] | null>;
// core/migrations.ts
// VillageLoadContext.merchantStops?: readonly MerchantStop[] | null
// { id: 'merchant-stops', since: '2026-11-25', loadOnly: true, run: withMerchantStops } – poslední v seznamu
/** Zapíše zastávky, jen když je ves ještě nemá a jsou známé (`null` = neznámé, nic). */
export function withMerchantStops(state: VillageState, stops: readonly MerchantStop[] | null): VillageState;
// packages/db – seed světa je povinný, TypeScript tak hlídá všechna místa
export function createVillageRepository(db: Database, worldSeed: number): VillageRepository;
```

- `updateVillage`: zastávky se ptá jen, když `record.state.merchantStops === undefined` (`villages.merchantStopsOf?.(record.settlementId) ?? null`), jednou za volání (jako `weatherSeed ??=`), a předá je do `load`. Ves bez portu (`merchantStopsOf` chybí) se nemění. Převod zapíše i `[]` (suchá mapa) – ves se podruhé neptá.
- Adaptér DB: neznámé sídlo (i řetězec, který není UUID) → null; sídlo bez políčka (`grid_x` / `grid_y` null), bez výřezu (`settlement.skeleton` null) nebo bez stezek v něm (`skeleton.trails` prázdné) → `[]`; jinak `trailStops(worldSeed, políčko)`. Políčko samo nestačí – sídlo bez výřezu má suchou mapu, i když jím kostra stezku vede (world-skeleton.md – Uložení).
- Seed světa na všech pěti místech: `worldSeed()` (web a `deps.ts`), `gameDeps.worldSeed` (worker).
- **Příjezd vsi na cestě** (Rozhodnutí 5): `stewardArrival` a `settleJourney` přenesou `merchantStops` stavu na cestě do založeného stavu – stejně jako `origin` (`...(state.merchantStops === undefined ? {} : { merchantStops: state.merchantStops })`). Bez toho by je příjezd uvnitř dopočtu zahodil a další dny téhož dopočtu by kupci nechodili.
- Ves po prvním načtení po nasazení se uloží jednou (i spící) – `merchantStops` přibude. Test, který po `updateVillage` čeká přesnou verzi nebo „nezměněná ves se neukládá“, dostane vsi do přípravku `merchantStops: []`.

- [ ] **Step 1: Testy načtení** (`update-village-merchants.test.ts`): úložiště s `merchantStopsOf` vracejícím zastávku → ves po `updateVillage` má `merchantStops`; podruhé se `merchantStopsOf` nevolá (počítadlo); `[]` se uloží; `null` a chybějící port → `merchantStops` chybí a ves se neukládá kvůli tomu. `migrations.test.ts`: `merchant-stops` je poslední a idempotentní.
- [ ] **Step 2: Test příjezdu uvnitř dopočtu** (`steward-son.test.ts`): ves na cestě se správcem a `merchantStops: [{ key: '0,0,E', seed: 7, index: 0, length: 1 }]`, příjezd uprostřed – `advanceVillage` 200 dní vcelku = 100 dní + převody načtení (`migrateVillage` s `load` a týmiž zastávkami) + 100 dní: shodný stav i kronika (i `merchants-arrived` po příjezdu). `leave-village.test.ts`: `settleJourney` nechá `merchantStops` stavu na cestě, ves bez nich je po založení nemá.
- [ ] **Step 3: Test DB** (`village-repository.db.test.ts`): sídlo na políčku, kterým vede stezka (najdi v okně `trailStops(worldSeed, cell).length > 0` pro seed testu), s výřezem `skeletonSlice(worldSeed, cell)` → stejné zastávky jako `trailStops`; totéž políčko **bez výřezu** → `[]`; výřez jen s řekou → `[]`; odříznuté sídlo bez políčka `[]`; neznámé sídlo a řetězec, který není UUID, null.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/application/__tests__/update-village-merchants.test.ts packages/game/src/application/__tests__/leave-village.test.ts packages/game/src/domain/village/steward/__tests__/steward-son.test.ts` a `npm run test:db` – FAIL.
- [ ] **Step 5: Implementovat** podle Interfaces; `grep -rn "createVillageRepository(" packages apps --include='*.ts'` – každé volání má seed světa.
- [ ] **Step 6: Spustit** testy ze Step 4 – PASS; `nice -n 19 npm run test:slow`; zlaté otisky beze změny.
- [ ] **Step 7: Mapa kódu**, kontroly, commit `feat(game): zastávky kupců se načítají z výřezu sídla (plán 4)`.

### Task 6: Objednávka zbroje u kupců ve vlastní vsi (Opus)

**Files:**

- Create: `trade/arms-order.ts`, `packages/game/src/application/arms-order.ts`
- Modify: `types/types-state.ts` (`armsOrder?`), `trade/market-coins.ts` (`CoinParty.fromMerchants?`), `trade/market.ts` (`marketDay` – hostitel jako kupující objednané zbroje), `packages/game/src/domain/village/index.ts` a `packages/game/src/application/index.ts` (exporty), `packages/game/src/application/rights.ts` (`ACTION_RIGHTS.orderArms: 'trade'`)
- Modify (web jen serverová akce – klíč práva hlídá `action-rights.test.ts`; panel v Úloze 14): `apps/web/lib/village-input.ts` (`parseArmsOrderInput`), `apps/web/lib/village.ts` (`orderArmsForPlayer`), `apps/web/app/game/actions/market.ts` (`orderArms`)
- Modify: `docs/code/village-trade.md` (Cizí kupci – objednávka zbroje)
- Test: `trade/__tests__/arms-order.test.ts`, `application/__tests__/arms-order.test.ts` (oba nové), `apps/web/lib/__tests__/village-input.test.ts`

**Interfaces:**

- Consumes: `ArmsGood`, `ARMS_GOODS`, `isArmsGood`, `villageGoodStock`, `addGood` (Úloha 1), `coinClearing`, `CoinParty`, `coinPriceOf` (Úloha 2), `MarketVisitor.merchant`, `merchantsArrive` (Úloha 4), `merchantStops` (Úlohy 4 a 5), `updateLivingVillage` a `actOn` (vzor `setDefenseStanceInVillage` / `setDefenseStanceForPlayer`).
- Produces:

```ts
// types/types-state.ts (VillageState)
/** Kolik zbroje má ves ještě koupit od cizích kupců (Rozhodnutí plánu 4, bod 15) – celé kusy; chybí = nic. */
armsOrder?: Partial<Record<ArmsGood, number>>;
// trade/market-coins.ts
// CoinParty.fromMerchants?: true – seznam strany se kupuje jen od cizích kupců (objednaná zbroj hostitele)
// trade/arms-order.ts
export const ARMS_BAD_ORDER = 'Počet kusů musí být celé nezáporné číslo.';
export const ARMS_NO_MERCHANTS = 'Do téhle vsi cizí kupci nejezdí.';
/** Nastaví objednaný počet zboží (mutuje stav): 0 položku smaže, prázdná objednávka ze stavu zmizí. */
export function setArmsOrder(
  state: VillageState,
  good: ArmsGood,
  amount: number,
): { ok: true } | { ok: false; reason: string };
/**
 * Hostitel jako kupující mincovní fáze: mince vsi (i nula – utržit je smí týž den) a objednaná
 * zbroj, jen od cizích kupců. Null = nic neobjednal, nebo na trhu žádný kupec nestojí (`visitors`).
 */
export function armsBuyer(
  state: VillageState,
  day: number,
  visitors: readonly MarketVisitor[],
): Pick<CoinParty, 'coins' | 'wants' | 'fromMerchants'> | null;
/** Objednávka po nákupu `bought` (mutuje stav): o koupené menší, nula ze stavu zmizí. */
export function reduceArmsOrder(state: VillageState, bought: TradeGoods): void;
// application/arms-order.ts
export interface OrderArmsInput {
  villageId: string;
  good: ArmsGood;
  /** Kolik kusů má ves od kupců koupit; 0 = nic. */
  amount: number;
  today: number;
  landscape: Landscape;
}
export function orderArms(
  deps: { villages: VillageRepository },
  input: OrderArmsInput,
): Promise<VillageResult>;
```

- `marketDay`: strana hostitele v mincovní fázi dostane z `armsBuyer` mince a seznam s `fromMerchants: true`; bez objednávky zůstává jen prodávající (`coins` 0, seznam prázdný – Úloha 2). `coinClearing` u kupujícího s `fromMerchants` bere jen prodávající s `merchant`. Pořadí kupujících je z Úlohy 2 – kupci, hostitel, výpravy –, takže ves smí utratit i mince, které týž den od kupců utržila.
- Po fázi `reduceArmsOrder(state, koupeno hostitelem)`; koupená zbroj jde do `state.arms` (`settleTrades` → `addGood`), platba do měšce kupce (`payCoins`) a odjede s ním. Kronika `market-held` ji nese sama (`bought.swords`, `sold.coins`).
- Objednávka se neobjeví v zápočtech, v `stance.wants`, v `wanted` pro `nextPrices`, v `hostWants` (`recordOrders`) ani v `stewardOutlook`. Do C hladiny se počítá jako seznam kupujícího jen do zboží, které kupci na trhu dnes mají (po druzích min(objednáno, u kupců) × cena; objednat 50 mečů při 2 u kupců zvedá hladinu stejně jako objednat 2 – Rozhodnutí 15, ruling návrh Clauda), do W jako dosud (min proti nabídce).
- `orderArms` (akce hráče, `updateLivingVillage`): neživá ves dostane dosavadní důvod (`VILLAGE_EXTINCT`, `VILLAGE_ABANDONED`, `VILLAGE_TRAVELLING`), ves bez zastávky (`merchantStops` chybí, nebo je prázdné) `ARMS_NO_MERCHANTS`, necelé nebo záporné číslo `ARMS_BAD_ORDER`. Právo `trade` (`ACTION_RIGHTS`) – má ho i správce cizí vsi.

- [ ] **Step 1: Testy jádra** (`arms-order.test.ts`, ves a kupec jako v `market-merchants.test.ts`, kupec se seznamem `{}`, hostitel bez přebytků; výchozí ceny – meč 120, helma 240, košile 480):
  - objednávka `{ swords: 2 }`, ves `coins: 130`, kupec `goods: { swords: 1, coins: 60 }` → po `marketDay` `arms = { swords: 1 }`, `armsOrder = { swords: 1 }`, `state.coins` 10 (−120), měšec kupce 180, kronika `market-held` `sold: { coins: 120 }`, `bought: { swords: 1 }`, `market.level` 1,004 (C = 130, W = 120); další kupec s mečem a `coins` vsi 130 → koupí druhý a `armsOrder` ze stavu zmizí;
  - nedostatek mincí (`coins: 119`) → nic: `arms` chybí, objednávka, mince i měšec beze změny; kupec bez zbroje → nic; meč veze jen výprava, ne kupec → hostitel od ní nekoupí;
  - pořadí `ARMS_GOODS`: objednávka `{ helmets: 1, swords: 1 }` s `coins: 250` → jen meč, s `coins: 360` obojí; dva kupci (křižovatka) po jednom meči, objednávka 2, `coins: 240` → od každého jeden, platby 120 a 120;
  - cena s hladinou: `market.level` 1,05 → meč 126 mincí (`coins: 130` → 4); hladina 2 (240) se 130 mincemi → nic;
  - mince utržené týž den (`coinClearing`): hostitel `coins: 100`, `stock { furs: 60 }`, `wants { swords: 1 }` s `fromMerchants`, kupec `coins: 60`, `stock { swords: 2 }`, `wants { furs: 60 }` → kupec zaplatí 32, hostitel 120; hostitel 12 mincí, kupec 148; součet plateb nula;
  - trh s objednávkou, ale bez mincí vsi a bez prodeje kupcům je bit po bitu jako bez objednávky (`toEqual` kromě `armsOrder`) – zápočty, ceny (cena meče zůstane na dně), `marketStance`, hladina i zakázky (`recordOrders`);
  - dopočet po kouscích: ves se zastávkou, objednávkou `{ swords: 3 }` a 400 mincemi, 400 dní vcelku = 100 + 300 (stav i kronika).
- [ ] **Step 2: Testy use-casu a vstupu** (`application/__tests__/arms-order.test.ts`): 2 meče → `armsOrder = { swords: 2 }`, mince a zásoby beze změny; 0 položku smaže a prázdná objednávka zmizí celá; 1,5 a −1 → `ARMS_BAD_ORDER` a stav beze změny; ves bez `merchantStops` i s `[]` → `ARMS_NO_MERCHANTS`; vymřelá a ves na cestě → `VILLAGE_EXTINCT` / `VILLAGE_TRAVELLING`. `village-input.test.ts`: `parseArmsOrderInput({ good: 'swords', amount: 2 })` projde, jiné zboží (`coins`, `grain`), záporné a necelé číslo null; `action-rights.test.ts` beze změny prochází (klíč `orderArms`).
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/arms-order.test.ts packages/game/src/application/__tests__/arms-order.test.ts apps/web/lib/__tests__/village-input.test.ts apps/web/lib/__tests__/action-rights.test.ts` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces.
- [ ] **Step 5: Spustit** testy ze Step 3 a `npx vitest run packages/game/src/domain/village/trade` – PASS; `nice -n 19 npm run test:slow` (zlaté otisky beze změny – bez objednávky se nic nemění).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): objednávka zbroje u kupců ve vlastní vsi (plán 4)`.

### Task 7: Co hostitel prodá kupcům a co o kupcích ví (Sonnet)

**Files:**

- Modify: `trade/market-stance.ts` (med, vosk, kožešiny), `trade/village-report.ts` (`merchants`), `types/types-market.ts` (`VillageReport.merchants?`), `rules/rules-wares.ts` jen kdyby chyběla konstanta (čísla `HONEY.kgPerPersonYear`, `yearlyNeed` už jsou)
- Modify: `docs/code/village-trade.md` (Trh – co ves nabízí a shání, zpráva na pivo)
- Test: `trade/__tests__/market-stance.test.ts`, `trade/__tests__/village-report.test.ts`, `trade/__tests__/market-merchants.test.ts`, `steward/__tests__/…` (roční výprava – existující testy beze změny)

**Interfaces:**

- Consumes: `giveTo` (`market-stance.ts`, strop `villageGoodStock`, práh `NOISE_KG`), `yearlyNeed(state, day)` (`wares/hides.ts`), `HONEY`, `grainSpareKg`, `nextMerchantVisit` (Úloha 3), kupci ve vsi (Úloha 4).
- Produces: `marketStance(state, day).offer` navíc `honey`, `wax`, `furs`; `VillageReport.merchants?: number` (den příštího příjezdu kupců ≥ den zprávy; chybí = ves nemá zastávky stezky nebo žádný do konce světa).
- Nabídka (Rozhodnutí 6): `wax` = celá zásoba vosku (`state.wares.waxKg`, dolů na celé kg – strop `villageGoodStock`); `furs` = `sheepFurs + wildFurs − yearlyNeed(state, day).furs` (dolů); `honey` = `honeyKg − HONEY.kgPerPersonYear × state.people.length` (dolů), jen když `grainSpareKg(state, day, outlook)` > 0 – tedy s obilím nad pojistku dvou ročních potřeb (`VASSALAGE.reserveYears`), jinak 0. Nic z toho nemění wants. `stewardOutlook` se znovu nepočítá (`outlook` už ve `marketStance` je).
- Nabídka výpravy hráče tyto druhy nese sama (`market.stock`). Roční výprava správce 15. 11. je čte z `marketStance`, ale dokud ji `fitToCrew` plní obilím první, nenaloží je – pořadí mění Úloha 9; odstavec v mapě kódu to řekne.

- [ ] **Step 1: Testy nabídky** (`market-stance.test.ts`, ves z `marketVillage` / `homeVillage` s 30 lidmi a obilím nad pojistkou):
  - `wares: { honeyKg: 100, waxKg: 12.7, sheepFurs: yearlyNeed.furs + 30, wildFurs: 10, hides: 0 }` → `offer.honey` = 85 (100 − 0,5 × 30), `offer.wax` = 12, `offer.furs` = 40 (po odečtení potřeby, celé dolů);
  - `offer.furs` nikdy záporná: kožešiny pod potřebou → klíč `furs` v nabídce není; bez `wares` nic z toho;
  - ves pod pojistkou obilí (`grainSpareKg` = 0, i nehladová s 1,9 roku obilí) → `honey` v nabídce není, vosk a kožešiny ano; `offer.honey` a `wax` nikdy nad `villageGoodStock`.
- [ ] **Step 2: Test kupce u hostitele** (`market-merchants.test.ts`, doplnit): ves s 30 lidmi, obilím nad pojistkou, `merchantStops` z Úlohy 4 a `wares: { honeyKg: 35, waxKg: 2.5, sheepFurs: yearlyNeed(…).furs + 20, wildFurs: 0, hides: 0 }`, kupec stojí na trhu jen on: hostitel prodá 20 kg medu, 2 kg vosku a 20 kožešin za 23 mincí (8 + 4 + 10,67 nahoru), `state.coins` 23, měšec kupce při odjezdu 37, `wares` klesnou přesně o prodané (`honeyKg` 15, `waxKg` 0,5, kožešiny = potřeba); v součtu světa mince přibyly jen z měšce.
- [ ] **Step 3: Testy zprávy** (`village-report.test.ts`): ves s `merchantStops` → `report.merchants` = `nextMerchantVisit(stops, day)!.day` pro den zprávy; bez zastávek (`undefined`, `[]`) pole chybí; obchodník s `merchants: true` v `market.arrivals` je ve zprávě bez `villageId` a se značkou.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-stance.test.ts packages/game/src/domain/village/trade/__tests__/village-report.test.ts packages/game/src/domain/village/trade/__tests__/market-merchants.test.ts` – FAIL.
- [ ] **Step 5: Implementovat** (nabídka v `marketStance` celé kg dolů – `Math.floor(… + EPSILON)`, kožešiny celé kusy); ověřit, že zpráva obchodníka v přehledu (`market-view`) dál jede bez jména vsi.
- [ ] **Step 6: Spustit** testy ze Step 4 a celé `npx vitest run packages/game/src/domain/village` – PASS (zlaté otisky beze změny – ves bez návštěvníků nabídku nepočítá).
- [ ] **Step 7: Mapa kódu**, kontroly, commit `feat(game): hostitel nabízí med, vosk a kožešiny nad potřebu a ví o kupcích (plán 4)`.

### Task 8: Výprava hráče s mincemi (Opus)

**Files:**

- Modify: `trade/market-trip.ts` (`checkMarketTrip` – mince na seznamu)
- Modify: `docs/code/village-trade.md` (Výprava na trh – mince)
- Test: `trade/__tests__/market-trip.test.ts`, `trade/__tests__/market.test.ts`, `application/__tests__/market.test.ts`, `apps/web/lib/__tests__/market-view.test.ts`

**Interfaces:**

- Consumes: `COIN_GOOD`, `carryKg` mincí 0 (Úloha 1), mincovní fáze a `goods.coins` (Úloha 2), `marketCrew`, `departMarketInPlace`, `applyMarketResult`.
- Produces: `checkMarketTrip` odmítne `order.wants.coins > 0` (`MARKET_BAD_ORDER` – mince se na seznam nedávají); `give.coins` (celé kusy, nejvýš zásoba) prochází dnešními kontrolami bez nové.
- **Cesta domů (Rozhodnutí 4):** nosiče počítá `marketCrew` z celého seznamu `wants` – cestou zpět – a mince nic neváží, takže nákup za mince drží nosnost cesty domů stejně jako zápočet. V mincovní fázi výprava koupí nejvýš, co má na seznamu; seznam, který volní lidé neunesou, odmítne kontrola (`MARKET_NO_PEOPLE`) a hráč důvod vidí v náhledu. Neprodané zboží se do cesty zpět nepočítá jako dosud (Rozhodnutí plánu 2, bod 2).
- **Mince výpravy** jsou jen ty v `goods.coins`: při odjezdu ubydou vsi (`addGood(state, 'coins', −n, day)`), nepoužité přijdou v `unsold`. Za výpravu se nikdy neplatí podruhé ze `state.coins` domova.

- [ ] **Step 1: Testy kontroly** (`market-trip.test.ts`, 8 volných dospělých, bez vozu): `wants.coins: 1` → `MARKET_BAD_ORDER`; `give: { coins: 400 }` a `wants: { pottery: 200 }` → projde s `porters` 8; `wants: { pottery: 2000 }` → `MARKET_NO_PEOPLE` (80 nosičů); `give: { grain: 200 }` i `{ grain: 200, coins: 1000 }` → 8 nosičů (plná posádka s mincemi vyjede).
- [ ] **Step 2: Testy trhu a cesty** (`market.test.ts`, `application/__tests__/market.test.ts`): ves s `coins: 400` pošle výpravu `give: { coins: 400 }`, `wants: { grain: 200 }` k hostiteli s přebytkem 1 000 kg obilí → po odjezdu `state.coins` chybí, příjezd má `goods.coins` 400; koupí právě 200 kg za 14 mincí (13,33 nahoru), výsledek `unsold.coins` 386, po návratu `state.coins` 386 a obilí +200. `sendMarketExpedition` s `wants.coins` odmítne s důvodem, s `give.coins` nad zásobu `MARKET_OVER_STOCK`.
- [ ] **Step 3: Test náhledu** (`market-view.test.ts`): `marketPreview` s mincemi na seznamu vrátí důvod `MARKET_BAD_ORDER`; s mincemi v „Dáš“ stejný počet nosičů jako bez nich.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-trip.test.ts packages/game/src/domain/village/trade/__tests__/market.test.ts packages/game/src/application/__tests__/market.test.ts apps/web/lib/__tests__/market-view.test.ts` – FAIL.
- [ ] **Step 5: Implementovat** podle Interfaces.
- [ ] **Step 6: Spustit** testy ze Step 4 a `npx vitest run packages/game/src/domain/village/trade` – PASS.
- [ ] **Step 7: Mapa kódu**, kontroly, commit `feat(game): výprava hráče platí na trhu mincemi (plán 4)`.

### Task 9: Správce platí mincemi, zakázky a náklad správce (Opus)

**Files:**

- Modify: `steward/steward-market.ts` (`grainPayment`, `stewardMarketStep`, `fitToCrew`), `rules/rules-steward.ts` (`STEWARD.grainPayment` – `'coins'` první), `trade/villager-trips.ts` (jen `priceKg` pro mince), `trade/market-stance.ts` (export `NOISE_KG`), `trade/craft-orders.ts` (`recordOrders` – mince platí)
- Modify: `docs/code/village-steward.md` (Správce na trhu), `docs/code/village-trade.md` (zakázky, vesničané na trhu – mince neutrácejí)
- Test: `steward/__tests__/steward-market.test.ts`, `trade/__tests__/craft-orders.test.ts`, `trade/__tests__/villager-trips.test.ts`

**Interfaces:**

- Consumes: `MARKET.grainKgPerCoin`, `VillageNews.level` (Úloha 2), `goods.coins`, `COIN_GOOD`, `villageGoodStock`, `STEWARD.grainPayment`, `TRADE_GOOD_VALUES`, `isPieceGood`, `marketStance` (i med, vosk a kožešiny – Úloha 7), `marketCrew`.
- Produces:

```ts
// trade/villager-trips.ts
// priceKg(state, villageId, 'coins') = MARKET.grainKgPerCoin ÷ hladina cíle (VillageNews.level, chybí = 1)
// steward/steward-market.ts
// fitToCrew(goods, wants, carts, adults) – jako dosud, jen v pořadí hodnoty na kg a nad NOISE_KG
```

- `STEWARD.grainPayment` = `['coins', 'ironBars', 'pottery', 'charcoal', 'logs']` (odkaz Rozhodnutí 4; `grainPayment` projde beze změny smyčkou – `priceKg` mincí, celé kusy). Nosnost cesty domů hlídá `marketCrew` jako dosud (nákup se zmenší, `FIT_TRIES`).
- `fitToCrew` (Rozhodnutí 4): zboží bez váhy (`carryKg` 0 – dobytek, koně, vozy, lidé) první, pak podle `TRADE_GOOD_VALUES[good].valueKg ÷ carryKg` sestupně, při shodě pořadí `TRADE_GOODS` (nástroje, hřivny, vosk, kožešiny, med, sýr, kůže, maso, keramika, dřevěné nářadí, obilí, luštěniny, uhlí, klády, kámen); položka do `NOISE_KG` se nezapisuje. Pořadí je pevné, výsledek deterministický.
- `stewardMarketStep`: seznam `wants` = `fitToCrew(stance.wants, {}, carts, volní dospělí)` – co lidé a vozy unesou domů (celý seznam, vejde-li se); náklad `fitToCrew(stance.offer, wants, …)`; `give.coins` = min(`villageGoodStock(state, 'coins', day)`, `⌈Σ wants × priceKg ÷ priceKg('coins') − NOISE_KG⌉`) navíc k němu (nosiči se nemění); bez `stance.wants` nejede jako dnes.
- Mince na nákup bere výprava správce vždy jen ze zásoby vsi v okamžiku odjezdu (`departMarketInPlace` je hned odečte) – obilí v nouzi a roční výprava téhož dne je tak neutratí dvakrát; nepoužité přijdou v `unsold`.
- `recordOrders`: výprava, která veze `goods.coins` > 0, má čím zaplatit (`pays` i tehdy, když nemá obilí ani to, co hostitel shání) – zakázka se zapíše jako u obilí.
- **Vesničané beze změny:** `paymentPool`, `payValues`, `pay`, `considerProduct`, `considerCart`, `buyWith` a `seedTrip` mince neznají (Rozhodnutí 4).

- [ ] **Step 1: Testy obilí v nouzi:** `stewardGrainStep` s `coins: 30`, chybí 400 kg → `give.coins` 27 (`⌈400 ÷ 15⌉`), bez hřiven; s `coins: 10` → 10 mincí a zbytek v pořadí hřivny, keramika, uhlí, klády; hladina 2 ve zprávě cíle → 54 mincí na totéž (má-li je ves); bez mincí bit po bitu jako dnes (dosavadní testy beze změny).
- [ ] **Step 2: Testy roční výpravy** (15. 11., bez vozu):
  - `wants` grain 300 a 40 mincí → `give.coins` 20 nad zboží `fitToCrew`; posádka plná obilím (nosiči = volní dospělí) s 20 mincemi vyjede;
  - **med a kožešiny naloží:** ves s nabídkou obilí nad 10 t, 142 kg medu, 123 kožešin a 16 kg vosku (`wares` a zásoby testu), seznam 2 kg nástrojů, 8 volných dospělých (200 kg) → `give` = vosk 16, kožešiny 123, med 61 (na 6 míst) a klíč `grain` chybí; s 12 dospělými vosk 16, kožešiny 123, med 142 a obilí 19; s 5 dospělými vosk 16 a kožešin 109;
  - šum: zboží, na které zbylo méně než `NOISE_KG`, v `give` není (žádné 10⁻⁹ kg medu);
  - cesta domů: ves s prázdnými zásobami, které chybí tisíce kg obilí (ostatní potřeby pokryté), 400 mincí, 8 volných dospělých → seznam `grain` 200 kg (na 6 míst), `porters` 8, `give.coins` 14 (`⌈200 ÷ 15⌉`); celý seznam, který se vejde, je beze změny (dosavadní testy „give i wants jako marketStance dne“ a „velká hromada klád a kamene“).
- [ ] **Step 3: Testy zakázek a vesničanů:** `recordOrders` – výprava bez obilí s `goods.coins` 12 na tržním dni s kovářem zapíše zakázku (`ordered`), bez nich a bez obilí nezapíše (dnešní test beze změny). `villager-trips.test.ts`: `villagersHome()` s kovářem ze zprávy a `state.coins` 30 → nákupy i výpravy (`give`, `wants`, nosiči) bit po bitu jako bez mincí, v `give` není `coins` a `state.coins` zůstane 30; `seedTrip` s `coins: 10` platí hřivnami a krávami jako dosud.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/village/steward packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 5: Implementovat** podle Interfaces.
- [ ] **Step 6: Spustit** testy ze Step 4 – PASS; `nice -n 19 npm run test:slow` (`market-neighbours-years` projde beze změny podmínek – správce veze jiné zboží; selže-li, nehrát si s čísly a ozvat se).
- [ ] **Step 7: Mapa kódu**, kontroly, commit `feat(game): správce platí na trhu mincemi a nakládá drahé zboží napřed (plán 4)`.

### Task 10: Oběh mincí, kronika a zaniklé vsi (Opus)

**Files:**

- Modify: `trade/market.ts` (`payCoins`, `marketResult`, `departVisitors`), `trade/market-trip.ts` (`applyMarketResult` – kronika), `trade/market-people.ts` (`receiveStranded`), `core/inbox.ts` (`stranded-people`), `types/types-market.ts` (`MarketVisitor.coinsPaid?`, `coinsGot?`, `MarketResult.coinsPaid?`, `coinsGot?`, `stranded-people.coins?`), `application/village-mail.ts` (`strandedMail`, `goneTargets`, `deliverVillageMail`, `returnStrandedPeople`), `packages/db/src/adapters/inbox-repository.ts` (`strandedResults` i s mincemi), `application/__tests__/in-memory-inbox.ts`
- Modify: `docs/code/village-trade.md` (Trh ve vsi, Pošta mezi vsemi – mince), `docs/code/worker.md`
- Test: `application/__tests__/village-mail.test.ts`, `application/__tests__/market-world.ts` (pomocník `coinsOfWorld`), `trade/__tests__/market-people.test.ts`, `trade/__tests__/market-two-villages.test.ts`, `application/__tests__/leave-village.test.ts` (odchod celé vsi, části lidí a syna), `packages/db/src/adapters/__tests__/inbox-repository.db.test.ts`

**Interfaces:**

- Consumes: `payCoins` (Úloha 2), mince a zbroj mezi zásobami, které bere odchod celé vsi (Úloha 1, viz oprava odchodu celé vsi), `strandedMail`, `receiveStranded`, `goneTargets`, `returnStrandedPeople` (plán 3), `applyMarketResult`, `positiveGoods`, `MarketResult`.
- Produces:

```ts
// MarketVisitor.coinsPaid?: number; coinsGot?: number – mince zaplacené a přijaté na tomto trhu (součty; chybí = 0)
// MarketResult.coinsPaid?: number; coinsGot?: number (jen kladné)
// VillageMail body 'stranded-people' += coins?: number (celé mince, které hostitel dostane zpět)
/** Vrátí výsledku lidi a mince domova; mince = `result.unsold.coins` (měšec výpravy při odjezdu). */
// strandedMail(hostId, ref, day, result) – beze změny jména, nese i coins
// market-world.ts: coinsOfWorld(world) – součet mincí světa, viz níž
```

- **Kronika:** `applyMarketResult` zapíše do `market-returned` `sold.coins` = `coinsPaid` a `bought.coins` = `coinsGot` (jen kladné); `unsold` v kronice bez mincí (mince zpět nejsou „neprodané zboží“), zásoba vsi dostane celé `unsold` (i mince) jako dosud. `marketResult` přenese `coinsPaid` a `coinsGot` výpravy. `market-held` (hostitel) už je má z Úlohy 2.
- **Měšec:** přesně jeden zdroj pravdy – `visitor.goods.coins`; příjmy mincovní fáze ho zvýší, výdaje sníží, `unsold.coins` výsledku je jeho stav při odjezdu. Do `bought`/`sold` výsledku se mince nepřičítají (jinak by se připsaly dvakrát).
- **Zaniklý domov:** zpráva `market-result` s `unsold.coins` > 0 pro domovskou ves, která chybí, spí nebo má sídlo v archivu, jde hostiteli jako `stranded-people` s `coins` (spolu s lidmi, jsou-li); zboží se zahodí jako dosud. `goneTargets` a podmínka kroku 1 berou `carriesPeople` nebo `unsold.coins` > 0; výsledek, který domov už použil (`awaitedTrip` null), se nevrací. Hostitel zprávou dostane mince (`addGood(state, 'coins', coins, day)`); je-li i hostitel pryč, mince zaniknou (jediná přijatá ztráta, Rozhodnutí 9).
- **Úloha světa** `returnStrandedPeople`: `strandedResults` vrátí i výsledky s `unsold.coins` > 0 (SQL `coalesce(body->'result'->'unsold'->>'coins', '0')::int > 0`, v paměti totéž); posílá tutéž zprávu jako krok 1 (`ref` `…:back` – druhý zápis se zahodí).
- **Součet světa** `coinsOfWorld(world)` (použije i Úloha 15): `state.coins` všech vsí + `outbox` (příjezd `goods.coins`, výsledek `unsold.coins`, `stranded-people` `coins`) + totéž v nepoužitých událostech schránky (`day > lastDay` vsi) + `market.visitors[].goods.coins` + mince osadníků na cestě. `trade.expeditions[].give` **ne** – je to jen záznam výpravy, který zůstává ve stavu až do výsledku; počítané dvakrát by součet nedržel.

- [ ] **Step 1: Testy oběhu** (`village-mail.test.ts`, svět `marketWorld()`, pomocník `coinsOfWorld(world)`):
  - výprava H s `give.coins` 30 u M: `coinsOfWorld` je po každém kole (odeslání, tržní den, výsledek, návrat) konstantní 30; H po návratu `state.coins` = 30 − zaplacené, `market-returned` s `sold.coins` / `bought.coins` a `unsold` bez mincí;
  - výprava H prodá na trhu M zboží jiné výpravě za 12 mincí (ves M sama za mince nekoupí nic): H `state.coins` 0 → +12 a `bought.coins` 12, součet světa beze změny;
  - výprava do M, která zmizela (ves chybí) před příjezdem: vrátí se `returned` se všemi mincemi; do spící M: výprava po termínu je vrátí;
  - H vymře (spí) s výsledkem, který nese 17 mincí a žádné lidi: po `deliverVillageMail(M)` má M ve schránce `stranded-people` s `coins` 17, po dopočtu M `state.coins` +17, zboží výsledku zmizelo; H i M zaniklé → mince zanikly (zapsat, jediná ztráta); výsledek H už použitý → nic se neposílá; `returnStrandedPeople` totéž pro výsledek, který leží ve schránce zaniklé H.
- [ ] **Step 2: Testy odchodu** (`leave-village.test.ts`; pravidlo dává oprava odchodu celé vsi, tady se jen ověří, že Úloha 1 mince a zbroj zapojila):
  - ves s `coins: 40` a `arms: { swords: 1 }`, **odejdou všichni** (`leaveVillage`, pak `settleJourney`; totéž příjezd se správcem `stewardArrival`): po založení má nová ves `coins` 40 a `arms { swords: 1 }`, stará obojí nula (`coins` i `arms` chybí); `coinsOfWorld` před odchodem, na cestě i po příjezdu 40;
  - **odejde část domácností** a zvlášť **odejde syn** (`departWithSon`): mince a zbroj zůstanou celé ve staré vsi, kde se žije dál, v nové žádné nejsou.
- [ ] **Step 3: Testy jádra:** `receiveStranded` s `coins` 17 → `state.coins` +17 a lidé jako dosud; bez `coins` beze změny. `market-two-villages.test.ts` – test „v součtu nic nevznikne ani nezmizí“ rozšířit o výpravu s 20 mincemi (mince prodané hostiteli = mince koupené, součet týž).
- [ ] **Step 4: Test DB** (`inbox-repository.db.test.ts`): `strandedResults` vrátí výsledek s mincemi u spící vsi i bez lidí, nevrátí výsledek s nulou mincí a bez lidí.
- [ ] **Step 5: Spustit** `npx vitest run packages/game/src/application/__tests__/village-mail.test.ts packages/game/src/application/__tests__/leave-village.test.ts packages/game/src/domain/village/trade` a `npm run test:db` – FAIL.
- [ ] **Step 6: Implementovat** podle Interfaces.
- [ ] **Step 7: Spustit** testy ze Step 5 – PASS; `nice -n 19 npm run test:slow`.
- [ ] **Step 8: Mapa kódu**, kontroly, commit `feat(game): mince jdou poštou, vrací se i po zániku vsi (plán 4)`.

### Task 11: Úklid vyřízené pošty výprav (Opus)

**Files:**

- Modify: `application/inbox.ts` (`SettledMail`, `settledMail`, `dropSettledMail`, `EMPTY_INBOX`), `application/village-mail.ts` (`MAIL_KEEP_DAYS`, `withSender`, `pruneSettledMail`), `application/nearby.ts` (`NearbyDeps` s `stampsOfVillages`, volání po `pruneUsed`), `types/types-market.ts` (`MarketMailBody` – `from?` u `market-arrive` a `market-result`), `packages/db/src/adapters/inbox-repository.ts`, `packages/db/src/adapters/village-repository.ts` (`stampsOfVillages` do `nearby`), `application/__tests__/in-memory-inbox.ts`
- Modify: `docs/code/village-core.md` (Schránka vsi), `docs/code/village-trade.md` (Pošta mezi vsemi)
- Test: `application/__tests__/village-mail.test.ts`, `application/__tests__/nearby.test.ts`, `packages/db/src/adapters/__tests__/inbox-repository.db.test.ts`

**Interfaces:**

- Consumes: `deliverVillageMail` (doručuje a pak čistí `outbox`), `VillageStamp` (`lastDay`, `asleep`), `stampsOfVillages`, `pruneUsed` (místo volání), `nearbyRefresh.post`.
- Produces:

```ts
// application/village-mail.ts
/**
 * Jak dlouho schránka drží použité příjezdy a výsledky výprav (`pruneSettledMail`). Technická mez, ne
 * pravidlo: řádek drží `ref` proti druhému zápisu téže zprávy, dokud ji odesílatel nemohl znovu poslat.
 */
export const MAIL_KEEP_DAYS = 365;
/**
 * Smaže vyřízené příjezdy a výsledky výprav vsi, nejvýš `MAIL_PRUNE_ROWS` (500 – technická mez, ne
 * pravidlo) nejstarších **bezpečných** řádků na jedno volání; vrací počet smazaných.
 */
export async function pruneSettledMail(
  deps: { villages: Pick<VillageRepository, 'stampsOfVillages' | 'inbox'> },
  villageId: string,
  afterDay: number,
): Promise<number>;
// application/inbox.ts
export interface SettledMail {
  id: string;
  ref: string;
  day: number;
  kind: 'market-arrive' | 'market-result';
  /** Odesílatel (id vsi) – `market-arrive` domovská ves z `ref` nebo pole `from`, `market-result` pole `from`; neznámý = null. */
  sender: string | null;
}
// VillageInbox +=
/** Použité příjezdy a výsledky výprav vsi se dnem ≤ `upToDay` (lehké řádky bez těl), seřazené podle dne, bez meze počtu. */
settledMail(villageId: string, upToDay: number): Promise<SettledMail[]>;
/** Smaže řádky `eventIds` schránky vsi – jen `market-arrive` a `market-result`; verzi vsi nemění. Vrací počet. */
dropSettledMail(villageId: string, eventIds: readonly string[]): Promise<number>;
```

- `deliverVillageMail` při zápisu `market-arrive` a `market-result` (i z kroku 3 a návratů) doplní do těla `from` = id vsi, která zprávu vydala: u kroku 1 ves, jejíž `outbox` se doručuje, u výsledku z `outbox` hostitele v kroku 3 hostitel (ne domov), u vrácené výpravy ves, která ji vrací; starší řádky bez něj: `market-arrive` odesílatele vezme z `ref` (`market:<domov>:…`), `market-result` ne a zůstane.
- **Kdy je řádek bezpečný:** `sender` je známý, jeho ves existuje (`stampsOfVillages`), není uspaná a její `lastDay ≥ řádek.day + MAIL_KEEP_DAYS` – odesílatel řádek nemůže poslat znovu, jeho `outbox` se od té doby tolikrát doručil a vyčistil. Uspaný nebo zaniklý odesílatel: řádek zůstane (nejvýš jednou na zaniklou ves; zapsat do mapy kódu jako vědomý zbytek).
- `pruneSettledMail(deps, villageId, afterDay)`: `settledMail(villageId, afterDay − MAIL_KEEP_DAYS)`, otisky odesílatelů jedním dotazem, filtr bezpečných a **teprve z nich** prvních `MAIL_PRUNE_ROWS` pro `dropSettledMail` – 500 nevyřiditelných řádků na začátku (mrtví odesílatelé, starší `market-result` bez `from`) tak úklid nezastaví. Volá ji `nearbyRefresh.post` ve stejném `try` hned po `pruneUsed` (chyba úklidu jen do logu, dopočet nezastaví).

- [ ] **Step 1: Testy use-casu** (`village-mail.test.ts`, `in-memory` svět): řádky `market-arrive` a `market-result` ve schránce M s odesílatelem H:
  - H `lastDay` ≥ `day + 365` → smazané oba; H o den méně → zůstanou; H uspaná nebo chybí → zůstanou; řádek bez `from` u `market-result` (starší) → zůstane; jiných druhů (`kin-ask`, `order-ready`, `stranded-people`) se úklid nedotkne;
  - řádek se dnem > `afterDay − 365` zůstane i s H napřed;
  - **mez až po filtru:** 600 starších řádků od zaniklé vsi a za nimi 20 bezpečných od H → smaže se všech 20, 600 zůstane; 620 bezpečných → první volání 500, druhé 120;
  - **pád mezi zápisem a vyčištěním:** H je pozadu a její `outbox` pořád nese zprávu, kterou už doručila (řádek v M existuje, starý rok) → `pruneSettledMail(M)` řádek nesmaže a druhé doručení téže zprávy (`post`) vrátí `null`; po dopočtu H (vyčištěný `outbox`, `lastDay` o rok dál) se řádek smaže a `hasVillageMail(H)` je false, takže se nic dalšího nepošle a nic se nezdvojí;
  - po úklidu `hasVillageMail` a opakované doručení beze změny; `pruneUsed` (druhy `PRUNED_INBOX_KINDS`) beze změny.
- [ ] **Step 2: Test napojení** (`nearby.test.ts`): po zapsání snímku okolí se zavolá `pruneSettledMail` s `afterDay` = `lastDay` vsi; chyba úklidu (vyhozená) se jen zaloguje a snímek i dopočet proběhnou.
- [ ] **Step 3: Test DB** (`inbox-repository.db.test.ts`): `settledMail` vrátí jen oba druhy se dnem ≤ meze (odesílatel z `ref` a z `body.from`), `dropSettledMail` smaže jen je (cizí id a druhy ne) a verzi vsi nezvedne; řádek `market-result` bez `from` má `sender` null.
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/application/__tests__/village-mail.test.ts packages/game/src/application/__tests__/nearby.test.ts` a `npm run test:db` – FAIL.
- [ ] **Step 5: Implementovat** podle Interfaces; `EMPTY_INBOX` dostane prázdné verze.
- [ ] **Step 6: Spustit** testy ze Step 4 – PASS.
- [ ] **Step 7: Mapa kódu**, kontroly, commit `feat(game): úklid vyřízené pošty výprav ve schránkách vsí (plán 4)`.

### Task 12: Vsi synů na mapách stezek (Opus)

**Files:**

- Modify: `packages/game/src/domain/world/skeleton/sites.ts` (`isTrailOnly`), `packages/game/src/domain/world/skeleton/index.ts` (výčet exportů – `isTrailOnly`), `packages/game/src/domain/world/dry-cell.ts` (`sonCellNear` místo `dryCellNear` – suché nebo stezka bez řeky), `packages/game/src/application/new-village.ts` (`sonCell`, `targetSettlement` – výřez a krajina ze stezky, text `NO_DRY_MAP_THERE`)
- Modify: `apps/web/e2e/village.spec.ts` (test „lidé odejdou na novou mapu“ – nová ves už nemusí být bez výřezu)
- Modify: `docs/code/world.md` (Ves syna jen na suché mapě → suché nebo stezce), `docs/code/village-people.md` (`dryCellNear` u `leaveVillage`), `docs/code/landscape.md` („Vsi synů vznikají jen na suché mapě“); `docs/design/world-skeleton.md` a `migration.md` až v Úloze 16
- Test: `packages/game/src/domain/world/__tests__/dry-cell.test.ts`, `packages/game/src/domain/world/skeleton/__tests__/sites.test.ts`, `packages/game/src/application/__tests__/new-village.test.ts`, test založení vsi syna na stezce vedle existujících testů `stewardArrival` / `foundedState` (najdi `grep -rn "withSkeletonRoute\|foundedState" packages/game/src --include='*.test.ts'`)

**Interfaces:**

- Consumes: `skeletonSlice`, `isDry`, `createSkeletonCache`, `cellSkeletonVersions`, `emptyCellLandscape` (`application/cell-landscape.ts` – krajina políčka s výřezem; suchá mapa bit po bitu jako dosud), `settlements.create` (pole `skeleton`), `withSkeletonRoute` (zakládá ho `foundedState` – hotová stezka), `merchantStops` na cestě (Úloha 5).
- Produces:

```ts
// domain/world/skeleton/sites.ts
/** Mapou vede stezka a žádná řeka – ves syna sem smí (Martin 22. 11. 2026: „ok“). */
export function isTrailOnly(slice: SkeletonSlice | null): boolean;
// domain/world/dry-cell.ts – přejmenované `dryCellNear` (volá jen new-village.ts a testy)
export function sonCellNear(
  worldSeed: number,
  from: GridCell,
  target: GridCell,
  allowed?: (cell: GridCell) => boolean,
  cache?: SkeletonCache,
): GridCell | null; // nejbližší políčko suché, nebo se stezkou bez řeky
```

- `targetSettlement` volá odchod syna (`settleStewardDepartures`) **i odchod hráče** (`leaveVillage`) – nová ves hráče tak smí na stezku stejně (Oznámit, bod 8).
- `sonCell`: políčko ve směru odchodu se použije, je-li suché nebo `isTrailOnly`; jinak nejbližší takové (`sonCellNear`) – řeka, brod, pramen a soutok dál ne (i když jimi vede stezka). Cizí mapa a vlastní sídlo jako dosud.
- `targetSettlement`: na políčku se stezkou (`isTrailOnly`) `const land = emptyCellLandscape(deps.worldSeed, targetCell)` a `settlements.create({ ownerId, landscapeSeed: land.seed, layerVersions: cellSkeletonVersions(slice), worldCell: targetCell, skeleton: slice })`; suché políčko beze změny (`generateAcceptedLandscape`, bez `skeleton`). Krajina sídla se pak generuje z uloženého výřezu, ves syna má od založení hotovou zemskou stezku do všech směrů stezky (`withSkeletonRoute`) a kupci do ní chodí (Úlohy 4 a 5).
- `NO_DRY_MAP_THERE` = 'Tím směrem není volná krajina bez řeky.' (text ukazuje hra; jméno konstanty se nemění). Sídla hráčů (`placeSeat`, `seatSlot`) se nemění.

- [ ] **Step 1: Testy** (`sites.test.ts`, `dry-cell.test.ts`): `isTrailOnly(null)` false, výřez se 2 stezkami bez řek true, s řekou i stezkou false, suchý (bez obou) false; `sonCellNear` u políčka s řekou vrátí nejbližší suché **nebo** stezku (dříve jen suché) – test s políčkem stezky vedle řeky (vyhledat ve výřezu okna seedu 1: `slice.trails.length > 0 && slice.rivers.length === 0`, pomocník testu) a s `allowed`, které stezku odmítne; pořadí prstenců beze změny.
- [ ] **Step 2: Testy sídla** (`new-village.test.ts`): odchod na políčko se stezkou bez řeky → `result.ok`, sídlo má `skeleton` = `skeletonSlice(seed, cell)`, `layerVersions.skeleton` = 1 a `landscapeSeed` = `emptyCellLandscape(seed, cell).seed`; políčko s řekou (i se stezkou) → nejbližší jiné povolené; suché políčko beze změny (`skeleton` chybí, `layerVersions` bez `skeleton` jako před úlohou); žádné volné v dosahu → `NO_DRY_MAP_THERE`; cizí mapa → `FOREIGN_MAP_THERE`.
- [ ] **Step 3: Test založení** (existující test `foundedState` / `stewardArrival`): ves syna založená na krajině políčka se stezkou má `trails` s hotovou stezkou ve směrech výřezu (`builtDay` = den založení) a `advanceVillage` po 100 dnech běží bez chyby a bez `NaN`; jiné mapy synů beze změny (zlaté otisky).
- [ ] **Step 4: Spustit** `npx vitest run packages/game/src/domain/world packages/game/src/application/__tests__/new-village.test.ts` – FAIL, pak implementovat.
- [ ] **Step 5: E2e** (`village.spec.ts`, test „lidé odejdou na novou mapu – po cestě umístí první zemnici“): tvrzení `has_skeleton` false a `layer_versions` bez `skeleton` nahradit výřezem políčka nové vsi – `has_skeleton` a `layer_versions.skeleton` = 1 právě tehdy, když `skeletonSlice(seed světa e2e, políčko)` není null (seed jako server – `worldSeed()`), a řeka ve výřezu nikdy; komentář opravit. Spustit jen tento test (`npm run test:e2e -- village.spec.ts -g "lidé odejdou na novou mapu"`, předtím `pgrep -f "[p]laywright test"` prázdné).
- [ ] **Step 6: Spustit** testy ze Step 4 – PASS; `nice -n 19 npm run test:slow`; zlaté otisky kostry a krajin beze změny; `npm run skeleton-check` (jen čte).
- [ ] **Step 7: Mapa kódu** (i `village-people.md` a `landscape.md`, jinak padne `check:docs`), kontroly, commit `feat(game): vsi synů smějí na mapy stezek (plán 4)`.

### Task 13: Ikony mincí, zbroje a kupců (Sonnet)

**Files:**

- Create: `apps/web/public/icons/resources/coin.png`, `sword.png`, `mail-shirt.png`, `helmet.png`, `merchants.png`
- Modify: `apps/web/public/icons/LICENSES.md` (řádky nových ikon – soubor už je), `tools/blender/icons.py` (nové ikony; `sword_objs` a `house/sword.png` jsou předloha meče), `apps/web/lib/trade-names.ts` jen kdyby se jména ikon z Úlohy 1 lišila
- Test: `apps/web/lib/__tests__/trade-names.test.ts`

**Interfaces:**

- Consumes: jména ikon z Úlohy 1 (`TRADE_GOOD_NAMES` – `coin`, `sword`, `mail-shirt`, `helmet`).
- Produces: soubory ikon 64 × 64 v `resources/` a ikona `merchants` (použije Úloha 14).
- `coin` je denár. Render z `tools/blender/icons.py` (nové funkce podle `house/sword.png`, `Creative Commons Attribution-ShareAlike 3.0` jako vlastní render, zapsat do `LICENSES.md` se zdrojem); není-li Blender v prostředí, nakreslit je v Pillow stylem `tools/blender/arms_icons.py` (vlastní dílo, CC0) a říct to ve zprávě. Grafika z cizích zdrojů se nepřidává.

- [ ] **Step 1: Test** (`trade-names.test.ts`): ke každé ikoně `TRADE_GOOD_NAMES[good].icon` existuje na disku `public/icons/resources/<icon>.png` (test projde všechno zboží) a existuje i `merchants.png`; každá z nových ikon má řádek v `LICENSES.md`.
- [ ] **Step 2: Spustit** `npx vitest run apps/web/lib/__tests__/trade-names.test.ts` – FAIL.
- [ ] **Step 3: Ikony** vyrobit a zapsat licence; test – PASS.
- [ ] **Step 4:** kontroly z Global Constraints, commit `feat(web): ikony mincí, zbroje a kupců (plán 4)`.

### Task 14: Web – pohledy, zásoby, panel Trh, objednávka a e2e (Opus)

**Files:**

- Modify (jádro souhrnu): `packages/game/src/domain/village/core/summary.ts` (`WaresView` a `waresView` – mince a zbroj, i bez `wares`)
- Modify (pohledy): `apps/web/lib/manor-view.ts` (den kupců, zbroj a objednávka), `apps/web/lib/village-view-chronicle.ts`, `apps/web/lib/village-notices.ts`, `apps/web/lib/trade-names.ts` (pomocník textů s mincemi)
- Modify (rozhraní): `apps/web/components/game/hud/MarketPanel.tsx`, `hud/ManorPanel.tsx`, `hud/selection/wares.tsx`, `apps/web/components/game/village-game/village-commands.ts` (`orderArms`), `village-game/VillagePanels.tsx`
- Modify: `apps/web/e2e/market.spec.ts`, `docs/code/web-ui.md`, `docs/code/village-trade.md` (zbroj v panelu)
- Test: `apps/web/components/game/hud/__tests__/WaresStock.test.tsx`, `MarketPanel.test.tsx`, `ManorPanel.test.tsx`, `apps/web/lib/__tests__/manor-view.test.ts`, `village-notices.test.ts`, test kroniky vedle `village-view-chronicle-markets3.test.ts`, `packages/game/src/domain/village/core/__tests__/summary.test.ts`, `apps/web/e2e/market.spec.ts`

**Interfaces:**

- Consumes: `coinPriceOf` (Úloha 2), `nextMerchantVisit`, `VillageReport.merchants`, `VillageNews.level` (Úlohy 2, 3 a 7), kronika `merchants-arrived`, `market-held` a `market-returned` s `sold.coins` / `bought.coins` (Úlohy 2, 4 a 10), `armsOrder`, akce `orderArms` (Úloha 6), ikony (Úloha 13).
- Produces (jen pohled, žádná herní logika):
  - **Zásoby** (Rozhodnutí 12): `WaresView` += `coins?: number`, `arms?: Partial<Record<ArmsGood, number>>` (jen kladné); `waresView` vrátí souhrn i vsi bez `wares`, má-li mince nebo zbroj (ostatní nuly). `WaresStock` v panelu dvorce ukáže mince a každý druh zbroje ikonou s celým číslem, při nule nic; ves jen s mincemi ukáže jen je. `manor-view.ts` nese dál jen `market.stock` pro sloupec „Dáš“ – výpis zásob v něm není. Horní lišta beze změny (hides-honey.md – Ve scéně; Martin: „O zbytku rozhodnu později“).
  - **Ceny:** `MarketPanel` (`PricesLine`) ukazuje cenu každého zboží v mincích **s hladinou** – `coinPriceOf(prices, level, good)` s `level` ze zprávy (`VillageNews.level`, chybí = 1), panel nepočítá nic navíc; mince ve sloupci „Dostaneš“ nejsou (Úloha 1), v „Dáš“ ano s počtem – Tooltip „Mince“.
  - **Kupci:** v řádku zprávy vsi (`Report`) obchodníci s příznakem `merchants` jako „Kupci“ a ikonou `merchants` (test příznaku před `|| 'Sousední ves'`), a nad nimi „Kupci přijedou 12. 8.“ (`report.merchants`, jinak nic); u vlastní vsi v panelu dvorce ikona kupců a počet dní do příjezdu (Tooltip „Kupci přijedou za 12 dní – kupují med, vosk a kožešiny, prodávají meče, kroužkové košile a helmy“; ves bez stezky nic).
  - **Objednávka zbroje** (Rozhodnutí 15): `VillageManor.market` += `merchantsDay: number | null` (den příštího příjezdu ≥ dnešek; null = bez stezky) a `arms: { good: ArmsGood; price: number; ordered: number }[]` (jen u vsi se zastávkou kupců, jinak `[]`) – cena dne `coinPriceOf(state.market?.prices, state.market?.level ?? 1, good)`, objednaný počet z `armsOrder`. Panel Trh vlastní vsi u stezky ukáže sekci zbroje: ikona zboží, cena v mincích, objednaný počet (`Stepper`, od nuly) a den příjezdu kupců (ikona `date`), slova jen v `Tooltip` („Meče – ves je koupí od kupců za své mince“); změna počtu pošle `orderArms({ villageId, good, amount })`, důvod odmítnutí u sekce jako u výpravy, bez práva `trade` zašedlé (`useRightDenied`).
  - **Seed zastávky klientovi nejde** (stejně jako `weatherSeed`): pohledy posílají jen den; `merchantStops` v pohledu na ves není.
  - **Kronika:** `merchants-arrived` – „Přijeli kupci z daleka – prodávají meče, kroužkové košile a helmy, kupují med, vosk a kožešiny.“ (bez počtů; jména zboží malými písmeny z `TRADE_GOOD_NAMES`, 1. a 4. pád jsou stejné). `market-held` a `market-returned` s mincemi: mince se z výčtu `goodsText` vyjmou a píšou zvlášť – `sold.coins` „zaplatila 4 mince“, `bought.coins` „dostala 16 mincí“ (`plural`: 1 minci, 2–4 mince, jinak mincí), prázdné části se vynechají; bez mincí texty beze změny.
  - **Upozornění:** `merchants-arrived` u vlastní vsi („Kupci přijeli“, ikona `merchants`, jednou za příjezd) – `village-notices.ts`, jako ostatní upozornění obchodu.
  - **Cizí správce:** kupci nemají ves, jména ostatních vsí držitele se nikde neukazují (test masky z plánu 3 beze změny).
- [ ] **Step 1: Testy souhrnu a zásob** (`summary.test.ts`, `WaresStock.test.tsx`): `waresView` vsi bez `wares` s `coins: 12` → `{ hides: 0, furs: 0, sheepFurs: 0, honeyKg: 0, waxKg: 0, coins: 12 }`, bez mincí a zbroje null jako dosud; `WaresStock` ukáže `12` u mincí a `2` u mečů, bez nich beze změny (dosavadní testy).
- [ ] **Step 2: Testy pohledů** (skutečné řetězce):
  - `merchants-arrived` → „Přijeli kupci z daleka – prodávají meče, kroužkové košile a helmy, kupují med, vosk a kožešiny.“;
  - `market-returned` z vsi Lhota se `sold: { furs: 30, coins: 4 }`, `bought: { grain: 100 }` → „Výprava se vrátila z trhu ve vsi Lhota – prodala 30 ks kožešin, koupila 100 kg obilí, zaplatila 4 mince.“;
  - `market-held` se `sold: { honey: 20, wax: 2 }`, `bought: { coins: 23 }` → „Na trhu ves prodala 20 kg medu, 2 kg vosku, dostala 23 mincí.“; se `sold: { coins: 120 }`, `bought: { swords: 1 }` → „Na trhu ves koupila 1 ks mečů, zaplatila 120 mincí.“; bez mincí dnešní věta;
  - panel: zpráva s `level` 2 ukáže cenu kožešiny 1,1 (2 × 8/15), obchodník s `merchants: true` „Kupci“, `report.merchants` → datum;
  - `manor-view.test.ts`: ves se zastávkou a `armsOrder: { swords: 2 }` → `arms` má meče s cenou 120 a počtem 2 a `merchantsDay`, v celém pohledu (`JSON.stringify`) není seed zastávky; ves bez stezky `arms: []`, `merchantsDay: null`; `MarketPanel.test.tsx`: sekce zbroje jen s neprázdným `arms`.
- [ ] **Step 3: Spustit** `npx vitest run apps/web packages/game/src/domain/village/core` – FAIL, pak implementovat.
- [ ] **Step 4: Spustit** `npx vitest run apps/web packages/game/src/domain/village/core` – PASS; `npm run typecheck`, `npm run lint`.
- [ ] **Step 5: E2e** (`market.spec.ts`, vzor existujících testů a úprava stavu vsi v DB): dev ves má mince (`coins` 50) – panel dvorce je ukáže mezi zásobami, panel Trh mince v „Dáš“ a nic v „Dostaneš“, výprava s mincemi odejde a kronika ukáže „Výprava…“; ves s `merchantStops` zastávkou, kde kupci přijedou dnes (stav nastavený v DB), ukáže „Kupci přijeli“ a panel dvorce ikonu kupců s počtem dní; objednávka 1 meče v panelu Trh zůstane po obnovení stránky, nula ji zruší. Spustit sériově `npm run test:e2e -- market.spec.ts` (předtím `pgrep -f "[p]laywright test"` prázdné).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(web): mince, kupci a objednávka zbroje v panelu trhu a kronice (plán 4)`.

### Task 15: Test světa a Vlkov (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/__tests__/market-merchants-years.test.ts` (pomalý – zapsat do `packages/game/slow-tests.ts`)
- Modify: `packages/game/slow-tests.ts`, `docs/design/markets.md` (Co se ověří – výsledek testu dvou vsí a kupce a Vlkova)
- Test: pomalý test a `npm run test:db`

**Interfaces:**

- Consumes: celý plán (Úlohy 1–14), `coinsOfWorld` (Úloha 10), vzor `market-two-villages.test.ts` a `market-neighbours-years.test.ts`.

- [ ] **Step 1: Pomalý test dvou vsí a kupce** (`market-merchants-years.test.ts`): ves T na stezce (`merchantStops` jedné zastávky, obilí, med, vosk a kožešiny nad potřebou, objednávka `armsOrder: { swords: 1 }`) a ves S bez stezky s okolím (T je její soused), 3 roky po dnech, pošta mezi nimi po každém dni. S třikrát ročně pošle výpravu do T s medem, voskem a kožešinami a s mincemi. Tvrdí:
  - **součet mincí světa** (`coinsOfWorld` – T.coins + S.coins + pošta + měšce výprav a kupců na trhu) se mění jen příjezdem kupce (+60) a jeho odjezdem (− měšec při odjezdu) – po každém dni přesně,
  - **součet zboží:** prodané kupci = co ubylo vsím a výpravám, mince od kupců ve světě odpovídají prodaným věcem (hodnota v cenách dne a hladiny, celé mince, rozdíl < 1 mince na dvojici a den); co prodala výprava, koupil hostitel nebo kupec (a obráceně); meče a helmy se jen přesouvají, nebo přijedou a odjedou s kupcem,
  - objednaný meč T koupí v první den kupců, kdy na něj má (za cenu dne s hladinou), objednávka pak ze stavu zmizí a T za mince nekoupila nic jiného,
  - T vydělala mince (na konci má aspoň jednu, nebo za ně koupila meč), hladina trhu ≥ 1 a ceny v `market.prices` nikdy pod dno; žádné `NaN` ani `Infinity`, žádná záporná zásoba, hladem nikdo,
  - dopočet po kouscích dá týž stav obou vsí jako vcelku: události schránek zaznamenané při denní poště se přehrají a každá ves se dopočítá po 90 dnech (vzor `market-two-villages.test.ts`).
  - Do zprávy (bez prahu): mince T po letech, počet návštěv kupců, největší hladina, co koupila výprava od kupců a kdy T koupila meč.
- [ ] **Step 2: Vlkov** (`docs/design/markets.md` – Co se ověří): přepočet vsi Vlkov z databáze `bohemia` (jen ke čtení, vzor sondy plánů 1–3) 10 let dopředu – stojí na suché mapě (bez výřezu i podle grafu), kupci do ní nechodí: **stav beze změny** proti dnešnímu `feat/landscape` (stejný počet lidí, rodu, obilí; rozdíl je chyba), dále jeden běh s uměle přidanou `merchantStops` (zastávka se seedem) – přežije a mince přibývají. Výsledek do `markets.md`.
- [ ] **Step 3: Spustit** `nice -n 19 npm run test:slow` – PASS (selže-li podmínka, nehrát si s čísly – zapsat do zprávy a ozvat se); `npm run test:db`, kontroly z Global Constraints.
- [ ] **Step 4: Commit** `test(game): tři roky trhu s kupci a mincemi, přepočet Vlkova (plán 4)`.

### Task 16: Návrhy, celé e2e a dokumenty (Sonnet)

**Files:**

- Modify:
  - `docs/design/markets.md` – oddíl „Rozhodnutí plánu 4 (návrh Clauda, 25. 11. 2026)“: Martinova rozhodnutí k plánu 4 doslova (i otázky k bodům 11–13), body 1–15 zkráceně, čísla (kurz, hladina, kupci, zbroj s cenami z Lex Ribuaria), stav „Plán 4 hotový“; Nechává se na stavitele – splněno (Co se ověří doplnila Úloha 15),
  - `gold.md` (mince už obíhají, kupci je zatím neplatí za zlato – plán 6), `hides-honey.md` (Obchod – kupci kupují med, vosk a kožešiny nad vlastní potřebu), `war.md` (Výzbroj – zbraně od kupců zatím jen zboží, účinek vlastní mechanikou – Martin 2. 11. 2026), `world-skeleton.md` (Kde všude kostra působí – kupci; Otevřené otázky 3 – vsi synů na stezkách), `migration.md` a `neighbours.md` (Pravidla 12 – karavany hotové), `premium-landscapes.md` (Obchodní stezka – kupci), `trade.md` (mince), `steward.md` (Obilí a lov v nouzi – pořadí `STEWARD.grainPayment` s mincemi první, roční výprava nakládá drahé napřed), `docs/design/research/2026-10-18-trade-values.md` (Lex Ribuaria 40, 11: helma 6, byrnie 12 – Coupland, Carolingian Arms and Armor; neověřeno online jako dosavadní řádky, doložit stránkou, jen najde-li se),
  - `CLAUDE.md` (řádek `village-trade.md` v tabulce mapy kódu – mince, kupci, objednávka zbroje), mapy kódu dopsané předchozími úlohami zkontrolovat
- Test: `npm run test:db`, celé e2e

`crafts.md` a `fields.md` se nemění – vesničané platí obilím, hřivnami a krávami jako v plánu 3.

- [ ] **Step 1: Návrhy** podle Files – Martinova slova s datem, vlastní rozhodnutí „návrh Clauda“; `grep -rn "koordin\|za Martina" docs/design` nic nového.
- [ ] **Step 2: Spustit** `npm run check:docs`, `npm run format:check`, `npm run test:db`, celé e2e sériově `npm run test:e2e` (předtím `pgrep -f "[p]laywright test"` prázdné), kontroly z Global Constraints.
- [ ] **Step 3: Commit** `docs: obchod 4 – mince, kupci na stezkách a ověření dvou vsí (plán 4)`.

## Oznámit Martinovi (návrhy Clauda, které mění pravidla)

1. **Hostitel prodá za mince všechno, co nabízí, i bez toho, co shání** – kdo mince přinese, koupí: klády a kámen (nabídka je celá hromada – plán 2, Rozhodnutí 5), ale i lidi, dobytek, koně, nástroje a další výrobky a vozy nad vlastní potřebu (zápočet bez mincí jako dosud; Rozhodnutí 2).
2. **Mince utrácí jen hráč a správce** (Martin 25. 11. 2026): hráč výpravou a objednávkou zbroje u kupců ve své vsi, správce na svých výpravách (obilí v nouzi napřed mincemi, roční výprava 15. 11.). Vesničané ani trh vsi je neutratí, ves je jen hromadí. Na zbroj se nic neodkládá – správce smí na výpravě utratit i mince, které hráč šetří (Rozhodnutí 4).
3. **Hostitel nabízí med, vosk a kožešiny nad vlastní potřebu** – plán 2 je vynechal (Rozhodnutí 6); tím i v zápočtu ostatním vsím, nejen kupcům. Med jen s obilím nad dva roky zásob.
4. **Cenová hladina trhu** ≥ 1: víc mincí, než kolik zboží se za ně dá koupit, zdraží všechno v mincích o nejvýš 10 % denně, méně zlevní k výchozím cenám; hýbe se jen, když je na trhu aspoň něco z toho, co kupující s mincemi shánějí. Cena zboží a hladina dohromady tak mohou za tržní den růst až o 21 % (Rozhodnutí 3).
5. **Kupci 4× do roka, 60 mincí, 2 meče, 1 kroužková košile, 2 helmy**, kupují až 100 kg medu, 24 kg vosku a 60 kožešin, na rušném trhu (3 výpravy) nejvýš 3 dny – strop je pravidlo hry, Martin ho nejmenoval (Rozhodnutí 5).
6. **Ceny zbroje** podle Lex Ribuaria: meč 120 mincí, helma 240, kroužková košile 480 (Rozhodnutí 7) – bez účinku v boji (Martin 2. 11. 2026). S měšcem 60 mincí za průjezd je to pro ves u stezky na léta: meč za dva plné průjezdy, kroužková košile za osm.
7. **Objednávka zbroje u kupců ve vlastní vsi** (Martin 25. 11. 2026: „Hráč zadá počet“): ves ji koupí v den kupců za cenu dne s hladinou, v pořadí meče, košile, helmy, i za mince, které týž den od kupců utržila; zbytek objednávky čeká na další kupce (Rozhodnutí 15).
8. **Vsi synů na stezkách** (Martin „ok“ 22. 11. 2026) i **nové vsi hráče při odchodu** smějí vznikat na mapě, kterou vede stezka bez řeky, s hotovou zemskou stezkou (Rozhodnutí 11); sídla hráčů se nemění.
9. **Vsi dalších hráčů na mapách stezek** zůstávají na později – potřebovaly by úpravu generátoru prémiových krajin. Část „a dalších hráčů“ z Martinova „ok“ 22. 11. 2026 tak plán 4 neplní (Rozhodnutí 11).
10. **Mince z výsledku pro zaniklou domovskou ves jdou hostiteli** (Rozhodnutí 9); starší řádky pošty se po roce mažou (Rozhodnutí 10).
11. **Při odchodu části lidí nebo syna zůstávají mince a zbroj v mateřské vsi**, kde se žije dál; odejdou-li všichni, berou si úplně vše (Martin 25. 11. 2026; Rozhodnutí 9).
12. **Správce nakládá roční výpravu od nejdražšího zboží na kg** (dosud v pořadí zboží, takže ji celou zaplnilo obilí) a seznam zkrátí na to, co lidé a vozy unesou domů – jinak by NPC vsi kupcům na stezce nikdy nepřivezly med, vosk ani kožešiny (Rozhodnutí 4).
13. **V den, kdy na trhu nikdo kromě kupců nestojí, se hýbou jen ceny zboží kupců, a kupci zdražují jen to, co je na trhu ke koupi** (návrh Clauda; Rozhodnutí 3).
14. **Výsledek ověření cen zbroje (26. 11. 2026, úloha 15):** ves T u stezky s medem, voskem a kožešinami koupila objednaný meč druhý den kupců (6. 6. 523) za 120 mincí, hladina za tři roky nejvýš 1,09; Vlkov s uměle přidanou zastávkou (kupcům skoro nic neprodá) má po 10 letech 1 085 mincí a hladinu 2,9 – meč tam stojí ≈ 350 mincí. Hladina roste hlavně tam, kam kupci vozí mince a nemají co koupit (Rozhodnutí 3 – záměr, inflace). Vlkov neleží na stezce – kupce uvidí až vsi synů na mapách stezek (bod 8).
15. **Výprava vesničanů v mincovní fázi** smí své zbytky prodat za mince (jdou domů), ale nekoupí nic; kupec na trhu zaniklé nebo opuštěné vsi odjede se vším; kronika ohlásí příjezd kupců jen poprvé v herním roce (upozornění za každý den); úklid pošty maže řádek jen když je výprava u odesílatele vyřízená (`VillageDigest.openTrips`), `stranded-people` nikdy; ves na cestě není v okolí vsí a výprava, jejíž příjezd hostitel přeskočil, se vrátí domů se vším (oprava chyby plánu 3); mince ve výpravě po 10.
16. **Odchod celé vsi** (oprava `fix/leave-everything`, 25. 11. 2026) odejde až po návratu výpravy z trhu; zůstanou stavby, pole, sad, hřbitov a hromady klád a kamene (zda brát i klády a kámen, Martin nevyjádřil – migration.md, Otevřené).

## Otázky na Martina

Žádné otevřené – účinek zbroje v boji rozhodl Martin 2. 11. 2026 (war.md – Výzbroj; markets.md – Ne-cíl (teď)), vsi dalších hráčů na stezkách viz Oznámit, bod 9.

## Rizika plánu

- Přejmenování `dryCellNear` → `sonCellNear` a změna umístění vsí synů ovlivní rostoucí svět (víc vsí na stezkách); dopad na umístění nových hráčů Úloha 12 nemění.
- Mapa stezky, která neprojde pásmem srovnatelnosti ani ve čtyřech oknech seedů (≈ 6 z milionu), má pro ves syna první pokus bez pásma – táž krajina, kterou na prázdném políčku viděly výpravy (`emptyCellLandscape`).
- Hladina trhu závisí na počtu kupujících s mincemi; meze ověřuje test Úlohy 2, testy 100 průjezdů a 10 let křižovatky Úlohy 4 a tříletý test Úlohy 15 – vyjde-li z běhu zjevně přemrštěná inflace, Úloha 15 nic neladí čísly, ale ozve se.
- Na trhu, kam med (vosk, kožešiny) vozí po málu (kilo na průjezd), vyroste jeho cena v mincích až k měšci kupce (60 mincí za kg i s hladinou). Vozí-li se tak po desítky let všechny tři, vyroste na ≈ 30 mincí za kg i cena v zápočtu a první větší náklad pak vymění celou zbroj kupce (cena nahoru je bez meze – Martin, Horní cena); pak klesá nejvýš o 10 % za tržní den. Kde je nikdo nenabízí, ceny stojí (Rozhodnutí 3).
- Ve vsi, kam jezdí jen kupci, stojí ceny ostatního zboží tam, kde je nechala poslední výprava – nahoru i dolů je pohne až další výprava (Rozhodnutí 3; Oznámit, bod 13).
- Kupci bez domovské vsi jsou nový druh návštěvníka trhu – kód, který bere `visitor.fromVillageId` (zakázky, pošta, maskování), musí kupce přeskočit; je to Review Focus 3 a testy Úlohy 4.
- Mince nic neváží, výprava tak smí domů přivézt celý seznam i s neprodaným zbožím – nosiče kryjí delší z obou cest, ne jejich součet (Rozhodnutí plánu 2, bod 2, beze změny).
- Úloha 1 a testy odchodu v Úloze 10 stojí na opravě odchodu celé vsi (`fix/leave-everything`); není-li sloučená, Úlohu 1 nezačínat.
